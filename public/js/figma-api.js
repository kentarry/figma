export class FigmaAPI {
  constructor() {
    this.token = localStorage.getItem('figma_token') || '';
    this.baseUrl = '/api/figma';
    /** @type {Map<string, Promise>} In-flight request deduplication map */
    this._pendingRequests = new Map();
    /** @type {string} Prefix for sessionStorage cache keys */
    this._cachePrefix = 'figma_cache:';
    /** @type {number} Cache TTL in milliseconds (10 minutes) */
    this._cacheTTL = 10 * 60 * 1000;
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('figma_token', token);
  }

  getToken() {
    return this.token;
  }

  hasToken() {
    return !!this.token;
  }

  clearToken() {
    this.token = '';
    localStorage.removeItem('figma_token');
  }

  /**
   * Parse a Figma URL to extract the file key and optional node ID.
   * Supports file/, design/, proto/, and board/ URL formats.
   */
  parseUrl(url) {
    const patterns = [
      /figma\.com\/(?:file|design|proto|board)\/([a-zA-Z0-9]+)(?:\/[^?]*)?(?:\?.*node-id=([^&]+))?/,
      /figma\.com\/(?:file|design|proto|board)\/([a-zA-Z0-9]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          fileKey: match[1],
          nodeId: match[2] ? decodeURIComponent(match[2]) : null,
        };
      }
    }
    return null;
  }

  /**
   * Retrieve a cached response from sessionStorage.
   * Returns null if not found or expired.
   * @param {string} key - The cache key (will be prefixed automatically)
   * @returns {object|null}
   */
  _getCached(key) {
    try {
      const raw = sessionStorage.getItem(this._cachePrefix + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.timestamp > this._cacheTTL) {
        sessionStorage.removeItem(this._cachePrefix + key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  /**
   * Store a response in sessionStorage with a timestamp.
   * Silently fails if storage is full or unavailable.
   * @param {string} key - The cache key (will be prefixed automatically)
   * @param {object} data - The data to cache
   */
  _setCached(key, data) {
    try {
      sessionStorage.setItem(this._cachePrefix + key, JSON.stringify({
        timestamp: Date.now(),
        data,
      }));
    } catch (e) {
      // sessionStorage may be full or unavailable; silently ignore
      console.warn('[Figma API] Cache write failed:', e.message);
    }
  }

  /**
   * Clear all sessionStorage entries with the figma_cache: prefix.
   */
  clearCache() {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this._cachePrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  }

  async _request(endpoint, params = {}, maxRetries = 2) {
    const url = new URL(endpoint, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const urlString = url.toString();

    // Check sessionStorage cache first
    const cached = this._getCached(urlString);
    if (cached) {
      return cached;
    }

    // In-flight request deduplication: return existing Promise if same URL is already pending
    if (this._pendingRequests.has(urlString)) {
      return this._pendingRequests.get(urlString);
    }

    const requestPromise = (async () => {
      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const res = await fetch(urlString, {
            headers: {
              'X-Figma-Token': this.token,
            },
          });

          if (res.status === 429 && attempt < maxRetries) {
            const body = await res.json().catch(() => ({}));
            const waitSec = body.retryAfter || 15;
            console.warn(`[Figma API] 429 Rate limited. Waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || body.message || `API 錯誤: ${res.status}`);
          }

          const data = await res.json();
          // Cache successful response
          this._setCached(urlString, data);
          return data;
        }
      } finally {
        // Always remove from pending map when done (success or failure)
        this._pendingRequests.delete(urlString);
      }
    })();

    this._pendingRequests.set(urlString, requestPromise);
    return requestPromise;
  }

  async getFile(fileKey, opts = {}) {
    const params = {};
    if (opts.depth !== undefined) params.depth = opts.depth;
    if (opts.geometry) params.geometry = 'paths';
    return this._request(`${this.baseUrl}/file/${fileKey}`, params);
  }

  async getNodes(fileKey, nodeIds, depth) {
    const ids = Array.isArray(nodeIds) ? nodeIds.join(',') : nodeIds;
    return this._request(`${this.baseUrl}/file/${fileKey}/nodes`, {
      ids,
      depth,
    });
  }

  async getImages(fileKey, nodeIds, format = 'png', scale = 2) {
    if (!Array.isArray(nodeIds)) {
      return this._request(`${this.baseUrl}/images/${fileKey}`, { ids: nodeIds, format, scale });
    }

    const uniqueIds = [...new Set(nodeIds)];
    if (uniqueIds.length === 0) return { images: {} };

    const batchSize = 30;
    const mergedImages = {};

    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      if (i > 0) {
        // Sleep 1s to avoid rate limit burst
        await new Promise(r => setTimeout(r, 1000));
      }
      const chunk = uniqueIds.slice(i, i + batchSize);
      try {
        const res = await this._request(`${this.baseUrl}/images/${fileKey}`, {
          ids: chunk.join(','),
          format,
          scale,
        });
        if (res && res.images) {
          Object.assign(mergedImages, res.images);
        }
      } catch (err) {
        console.warn(`[getImages] Failed to fetch chunk:`, chunk, err.message);
      }
    }

    return { images: mergedImages };
  }

  getImageProxyUrl(originalUrl) {
    if (!originalUrl) return '';
    return `${this.baseUrl}/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  }

  async testConnection() {
    return this._request(`${this.baseUrl}/me`);
  }
}
