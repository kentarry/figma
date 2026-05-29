/**
 * disk-cache.js — Disk-based cache for Figma API responses
 *
 * Stores JSON responses in a `.cache/` directory under the project root.
 * Uses a simple hash of the request URL as the filename.
 *
 * Exports:
 *   - cacheMiddleware   Express middleware that intercepts GET requests
 *   - getCachedResponse(key)             Read from disk cache
 *   - setCachedResponse(key, data, ttlMs) Write to disk cache
 */

import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Configuration ──
const CACHE_DIR = join(__dirname, '.cache');
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 100;

// ── Helpers ──

/**
 * Hash a cache key into a safe filename.
 * Uses SHA-256, truncated to 16 hex chars for readability.
 */
function hashKey(key) {
  return createHash('sha256').update(key).digest('hex').substring(0, 32);
}

/**
 * Build the full file path for a given cache key.
 */
function cacheFilePath(key) {
  return join(CACHE_DIR, `${hashKey(key)}.json`);
}

/**
 * Ensure the cache directory exists.
 */
async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

// ── Core API ──

/**
 * Read a cached response from disk.
 * Returns the cached data if valid, or null if missing / expired.
 *
 * @param {string} key  Cache key (typically a URL or prefixed URL)
 * @returns {Promise<any|null>}
 */
export async function getCachedResponse(key) {
  try {
    const filePath = cacheFilePath(key);
    const raw = await readFile(filePath, 'utf-8');
    const entry = JSON.parse(raw);

    // Check TTL (Bypassed in test/offline mode for consistency)
    const isOffline = process.env.NODE_ENV === 'test' || process.env.OFFLINE_MODE === 'true';
    if (!isOffline) {
      const ttl = entry.ttl || DEFAULT_TTL;
      if (Date.now() - entry.timestamp > ttl) {
        // Expired — clean up asynchronously
        unlink(filePath).catch(() => {});
        return null;
      }
    }

    console.log(`[DiskCache] HIT: ${key.substring(0, 80)}...`);
    return entry.data;
  } catch {
    // File doesn't exist or is unreadable
    return null;
  }
}

/**
 * Write a response to the disk cache.
 *
 * @param {string} key   Cache key
 * @param {any}    data  Data to cache (must be JSON-serialisable)
 * @param {number} [ttlMs=DEFAULT_TTL]  Time-to-live in milliseconds
 */
export async function setCachedResponse(key, data, ttlMs = DEFAULT_TTL) {
  try {
    await ensureCacheDir();

    const entry = {
      key,
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    };

    await writeFile(cacheFilePath(key), JSON.stringify(entry), 'utf-8');
    console.log(`[DiskCache] SET: ${key.substring(0, 80)}...`);

    // Prune if we exceed MAX_ENTRIES (fire-and-forget)
    pruneIfNeeded().catch(() => {});
  } catch (err) {
    console.error('[DiskCache] Failed to write cache:', err.message);
  }
}

// ── Pruning ──

/**
 * Remove the oldest cache entries when the total count exceeds MAX_ENTRIES.
 */
async function pruneIfNeeded() {
  try {
    const files = await readdir(CACHE_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length <= MAX_ENTRIES) return;

    // Gather file stats
    const entries = [];
    for (const f of jsonFiles) {
      const fp = join(CACHE_DIR, f);
      try {
        const s = await stat(fp);
        entries.push({ path: fp, mtimeMs: s.mtimeMs });
      } catch {
        // File may have been deleted concurrently
      }
    }

    // Sort oldest first
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Delete the oldest entries until we're at MAX_ENTRIES
    const toDelete = entries.length - MAX_ENTRIES;
    for (let i = 0; i < toDelete; i++) {
      await unlink(entries[i].path).catch(() => {});
    }

    console.log(`[DiskCache] Pruned ${toDelete} old entries.`);
  } catch {
    // Cache dir may not exist yet — nothing to prune
  }
}

/**
 * Remove all expired cache files.  Called once on startup.
 */
async function cleanExpired() {
  try {
    await ensureCacheDir();
    const files = await readdir(CACHE_DIR);

    let cleaned = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const fp = join(CACHE_DIR, f);
      try {
        const raw = await readFile(fp, 'utf-8');
        const entry = JSON.parse(raw);
        const ttl = entry.ttl || DEFAULT_TTL;
        if (Date.now() - entry.timestamp > ttl) {
          await unlink(fp);
          cleaned++;
        }
      } catch {
        // Corrupt file — remove it
        await unlink(fp).catch(() => {});
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[DiskCache] Startup cleanup: removed ${cleaned} expired entries.`);
    }
  } catch {
    // Cache dir doesn't exist — nothing to clean
  }
}

// Run startup cleanup
// cleanExpired();

// ── Express Middleware ──

/**
 * Express middleware that intercepts GET requests and serves cached responses.
 *
 * Usage:
 *   app.use('/api/figma', cacheMiddleware);
 *
 * The middleware only caches successful (200) JSON responses.
 * It uses the full original URL as the cache key.
 */
export function cacheMiddleware(req, res, next) {
  // Only cache GET requests
  if (req.method !== 'GET') return next();

  const cacheKey = `http:${req.originalUrl}`;

  getCachedResponse(cacheKey)
    .then(cached => {
      if (cached) {
        return res.json(cached);
      }

      // Monkey-patch res.json to intercept the response and cache it
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setCachedResponse(cacheKey, body).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    })
    .catch(() => next());
}

/**
 * Clear all cached files in the disk cache directory.
 */
export async function clearDiskCache() {
  try {
    await ensureCacheDir();
    const files = await readdir(CACHE_DIR);
    let count = 0;
    for (const f of files) {
      if (f.endsWith('.json')) {
        await unlink(join(CACHE_DIR, f));
        count++;
      }
    }
    console.log(`[DiskCache] Cleared ${count} cached files from disk.`);
    return count;
  } catch (err) {
    console.error('[DiskCache] Clear failed:', err.message);
    throw err;
  }
}

