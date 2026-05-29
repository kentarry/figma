import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';

// ── Module imports ──
import ingameRoutes from './ingame-routes.js';
import { getCachedResponse, setCachedResponse, cacheMiddleware, clearDiskCache } from './disk-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;
const FIGMA_API = 'https://api.figma.com/v1';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logging ──
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Static files ──
// Disable caching for JS files during development
app.use((req, res, next) => {
  if (req.url.endsWith('.js') || req.url.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});
app.use(express.static('./public'));

// ── Mount ingame routes (includes /ingame-assets static + /api/local/* + /Action fallback) ──
app.use(ingameRoutes);

// ── Figma API helpers ──

function getFigmaToken(req) {
  const token = req.headers['x-figma-token'];
  if (!token) return null;
  return token;
}

async function figmaFetch(url, token, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Global throttle: wait between requests to avoid burst
    const now = Date.now();
    const timeSinceLast = now - (global._lastFigmaRequest || 0);
    if (timeSinceLast < 500) {
      await new Promise(r => setTimeout(r, 500 - timeSinceLast));
    }
    global._lastFigmaRequest = Date.now();

    const res = await fetch(url, {
      headers: { 'X-Figma-Token': token },
    });
    
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const isPaywall = res.headers.get('x-figma-upgrade-link') || res.headers.get('x-figma-rate-limit-type') === 'low';
      
      let rawWaitSec = 0;
      if (retryAfter) {
        rawWaitSec = parseInt(retryAfter, 10);
      }
      
      // If it's a paywall limit or wait time is absurdly long (more than 5 mins / 300s),
      // do not retry at all. Return immediately.
      if (isPaywall || rawWaitSec > 300) {
        console.warn(`[Figma API] Rate limit is a paywall or too long (${retryAfter}s). Aborting retries.`);
        return res;
      }

      if (attempt < retries) {
        let waitSec = 10 * Math.pow(2, attempt); // default exponential backoff
        if (!isNaN(rawWaitSec) && rawWaitSec > 0 && rawWaitSec < 300) {
          waitSec = Math.max(rawWaitSec, 5);
        }
        // Cap max wait to 60 seconds to prevent absurd waits
        waitSec = Math.min(waitSec, 60);
        console.warn(`[Figma API] Rate limited (429). Retry ${attempt + 1}/${retries} after ${waitSec}s...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
    }
    return res;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function handleFigmaError(figmaRes, res) {
  if (figmaRes.status === 429) {
    const retryAfter = figmaRes.headers.get('retry-after');
    const isPaywall = figmaRes.headers.get('x-figma-upgrade-link') || figmaRes.headers.get('x-figma-rate-limit-type') === 'low';
    
    let rawWaitSec = 0;
    if (retryAfter) {
      rawWaitSec = parseInt(retryAfter, 10);
    }

    if (retryAfter) {
      res.set('Retry-After', retryAfter);
    }

    if (isPaywall || rawWaitSec > 300) {
      const hours = Math.ceil(rawWaitSec / 3600);
      let errorMsg = `您的 Figma 帳號 Token 已達到免費 Starter 方案的 API 呼叫次數限制，Figma 官方已鎖定此 Token。`;
      if (rawWaitSec > 0) {
        errorMsg += ` 預計需等待約 ${hours} 小時後重設。`;
      }
      errorMsg += ` 建議您：1) 更換其他 Figma 帳號的 Token；2) 使用「地端資料夾預覽」模式進行測試。`;

      res.status(429).json({
        error: errorMsg,
        retryAfter: rawWaitSec,
        canRetry: false,
      });
      return true;
    }

    // Normal transient limit
    let waitSec = 30;
    if (!isNaN(rawWaitSec) && rawWaitSec > 0 && rawWaitSec < 300) {
      waitSec = Math.max(rawWaitSec, 5);
    } else if (retryAfter) {
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        waitSec = Math.max(Math.ceil((date.getTime() - Date.now()) / 1000), 5);
      }
    }
    waitSec = Math.min(waitSec, 60);

    res.status(429).json({
      error: `Figma API 限流中，請等待 ${waitSec} 秒後重試`,
      retryAfter: waitSec,
      canRetry: true,
    });
    return true;
  }
  if (figmaRes.status === 403) {
    res.status(403).json({ error: 'Figma Token 無效或已過期，請重新輸入' });
    return true;
  }
  return false;
}

function buildUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

// ── Figma API proxy routes ──

app.get('/api/figma/file/:fileKey', async (req, res) => {
  const token = getFigmaToken(req);
  if (!token) return res.status(401).json({ error: 'Missing x-figma-token header.' });

  try {
    const { ids, depth, geometry } = req.query;
    const url = buildUrl(`${FIGMA_API}/files/${req.params.fileKey}`, { ids, depth, geometry });

    // Check disk cache first
    const cacheKey = `file:${url}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json(cached);

    const figmaRes = await figmaFetch(url, token);
    if (handleFigmaError(figmaRes, res)) return;
    const data = await figmaRes.json();
    await setCachedResponse(cacheKey, data);
    res.status(figmaRes.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch Figma file.' });
  }
});

app.get('/api/figma/file/:fileKey/nodes', async (req, res) => {
  const token = getFigmaToken(req);
  if (!token) return res.status(401).json({ error: 'Missing x-figma-token header.' });

  try {
    const { ids, depth } = req.query;
    const url = buildUrl(`${FIGMA_API}/files/${req.params.fileKey}/nodes`, { ids, depth });

    const cacheKey = `nodes:${url}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json(cached);

    const figmaRes = await figmaFetch(url, token);
    if (handleFigmaError(figmaRes, res)) return;
    const data = await figmaRes.json();
    await setCachedResponse(cacheKey, data);
    res.status(figmaRes.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch Figma nodes.' });
  }
});

app.get('/api/figma/images/:fileKey', async (req, res) => {
  const token = getFigmaToken(req);
  if (!token) return res.status(401).json({ error: 'Missing x-figma-token header.' });

  try {
    const { ids, format, scale, svg_outline_text, svg_include_id } = req.query;
    const url = buildUrl(`${FIGMA_API}/images/${req.params.fileKey}`, {
      ids, format, scale, svg_outline_text, svg_include_id,
    });

    const cacheKey = `images:${url}`;
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json(cached);

    const figmaRes = await figmaFetch(url, token);
    if (handleFigmaError(figmaRes, res)) return;
    const data = await figmaRes.json();
    await setCachedResponse(cacheKey, data);
    res.status(figmaRes.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch Figma images.' });
  }
});

app.get('/api/figma/image-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url query parameter.' });

  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 30000; // 30s for large images (some are 2808×1576)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const imageRes = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!imageRes.ok) {
        if (attempt < MAX_RETRIES && (imageRes.status >= 500 || imageRes.status === 429)) {
          console.warn(`[Image Proxy] Attempt ${attempt + 1} failed (${imageRes.status}), retrying...`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        // 403 = Figma image URL has expired
        if (imageRes.status === 403) {
          res.set('Access-Control-Allow-Origin', '*');
          return res.status(403).json({
            error: 'Figma 圖片 URL 已過期，請重新執行一鍵切版以取得新的圖片連結。',
            expired: true,
          });
        }
        res.set('Access-Control-Allow-Origin', '*');
        return res.status(imageRes.status).json({
          error: `Failed to fetch image (HTTP ${imageRes.status})`,
          url: url.substring(0, 100) + '...',
        });
      }

      const contentType = imageRes.headers.get('content-type');
      if (contentType) {
        res.set('Content-Type', contentType);
      }
      // Cache successfully fetched images for 1 hour in the browser
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('Access-Control-Allow-Origin', '*');

      const buffer = Buffer.from(await imageRes.arrayBuffer());
      res.send(buffer);
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[Image Proxy] Timeout after ${TIMEOUT_MS}ms for: ${url.substring(0, 80)}...`);
        if (attempt < MAX_RETRIES) {
          continue;
        }
        return res.status(504).json({ error: `Image proxy timeout (${TIMEOUT_MS}ms). The image may be too large or the URL may have expired.` });
      }
      console.error('[Image Proxy] Error:', err.message);
      if (attempt < MAX_RETRIES) {
        continue;
      }
      return res.status(500).json({ error: `Failed to proxy image: ${err.message}` });
    }
  }
});

// POST /api/figma/clear-cache — clear server's disk cache
app.post('/api/figma/clear-cache', async (req, res) => {
  try {
    const count = await clearDiskCache();
    res.json({ success: true, message: `成功清除 ${count} 個伺服器快取檔案！` });
  } catch (err) {
    res.status(500).json({ error: `清除快取失敗: ${err.message}` });
  }
});

// Figma user info (for token validation)
app.get('/api/figma/me', async (req, res) => {
  const token = getFigmaToken(req);
  if (!token) return res.status(401).json({ error: 'Missing x-figma-token header.' });

  try {
    const figmaRes = await figmaFetch(`${FIGMA_API.replace('/v1', '')}/v1/me`, token);
    if (handleFigmaError(figmaRes, res)) return;
    const data = await figmaRes.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to validate token.' });
  }
});

// ── One-click Figma auto-convert endpoint ──
// Combines: fetch node tree → fetch images → return everything in one call
// Smart scope: if nodeId points to a simple element, auto-expands to full page
app.get('/api/figma/auto-convert', async (req, res) => {
  const token = getFigmaToken(req);
  if (!token) return res.status(401).json({ error: 'Missing x-figma-token header.' });

  const { fileKey, nodeId } = req.query;
  if (!fileKey) return res.status(400).json({ error: 'Missing fileKey parameter.' });

  try {
    let nodeData;
    let scope = 'page'; // 'node' = single frame, 'page' = full page
    let focusNodeId = nodeId ? nodeId.replace(/-/g, ':') : null;

    if (nodeId) {
      // Step 1a: Fetch the specific node first to check if it's a frame with children
      console.log(`[Auto-Convert] Checking node ${nodeId}...`);
      const normalizedId = nodeId.replace(/-/g, ':');
      const checkUrl = buildUrl(`${FIGMA_API}/files/${fileKey}/nodes`, {
        ids: normalizedId,
        depth: 1, // shallow check
      });

      // Try disk cache for the shallow check
      const checkCacheKey = `auto-check:${checkUrl}`;
      let checkData = await getCachedResponse(checkCacheKey);
      if (!checkData) {
        const checkRes = await figmaFetch(checkUrl, token);
        if (handleFigmaError(checkRes, res)) return;
        checkData = await checkRes.json();
        await setCachedResponse(checkCacheKey, checkData);
      }

      const targetNode = checkData.nodes?.[normalizedId]?.document;
      console.log(`[Auto-Convert] Target node type: ${targetNode?.type}, name: "${targetNode?.name}", children: ${targetNode?.children?.length || 0}`);
      const isComplexNode = targetNode &&
        (targetNode.type === 'FRAME' || targetNode.type === 'GROUP' || targetNode.type === 'COMPONENT' || targetNode.type === 'CANVAS') &&
        targetNode.children && targetNode.children.length > 0;

      if (isComplexNode) {
        // Node is a FRAME with children - fetch just this node at full depth
        console.log(`[Auto-Convert] Node "${targetNode.name}" is a complex frame (${targetNode.children.length} children). Fetching at full depth...`);
        scope = 'node';
        await delay(1500);
        const nodeUrl = buildUrl(`${FIGMA_API}/files/${fileKey}/nodes`, {
          ids: normalizedId,
          depth: 10,
          geometry: 'paths',
        });

        const nodeCacheKey = `auto-node:${nodeUrl}`;
        let nodeCacheData = await getCachedResponse(nodeCacheKey);
        if (nodeCacheData) {
          nodeData = nodeCacheData;
        } else {
          const nodeRes = await figmaFetch(nodeUrl, token);
          if (handleFigmaError(nodeRes, res)) return;
          nodeData = await nodeRes.json();
          await setCachedResponse(nodeCacheKey, nodeData);
        }
      } else {
        // Node is a simple element (RECTANGLE, TEXT, etc.) - fetch the FULL page
        console.log(`[Auto-Convert] Node "${targetNode?.name || nodeId}" is a simple element (${targetNode?.type}). Expanding to full page...`);
        scope = 'page';
        await delay(1500);
        const fullUrl = buildUrl(`${FIGMA_API}/files/${fileKey}`, { depth: 10, geometry: 'paths' });

        const fullCacheKey = `auto-page:${fullUrl}`;
        let fullCacheData = await getCachedResponse(fullCacheKey);
        if (fullCacheData) {
          nodeData = fullCacheData;
        } else {
          const fullRes = await figmaFetch(fullUrl, token);
          if (handleFigmaError(fullRes, res)) return;
          nodeData = await fullRes.json();
          await setCachedResponse(fullCacheKey, nodeData);
        }
      }
    } else {
      // No nodeId - fetch entire file
      console.log(`[Auto-Convert] No nodeId specified. Fetching full file...`);
      const fullUrl = buildUrl(`${FIGMA_API}/files/${fileKey}`, { depth: 10, geometry: 'paths' });
      const fullRes = await figmaFetch(fullUrl, token);
      if (handleFigmaError(fullRes, res)) return;
      nodeData = await fullRes.json();
    }

    // Extract file info from the response
    const fileInfo = {
      name: nodeData.name || 'Untitled',
      lastModified: nodeData.lastModified,
      version: nodeData.version,
      thumbnailUrl: nodeData.thumbnailUrl,
    };

    // Identify nodes that need image export
    let images = {};
    const exportIds = [];
    
    function isGraphicOnly(n) {
      if (!n) return false;
      if (n.type === 'TEXT') return false;
      if (n.children && n.children.length > 0) {
        return n.children.every(child => isGraphicOnly(child));
      }
      const graphicTypes = ['RECTANGLE', 'ELLIPSE', 'LINE', 'VECTOR', 'STAR', 'REGULAR_POLYGON', 'BOOLEAN_OPERATION'];
      return graphicTypes.includes(n.type);
    }

    function findExportableNodes(node, isParentGraphicOnly = false) {
      if (!node) return;
      
      const hasImageFill = node.fills && node.fills.some(f => f.type === 'IMAGE');
      const hasExportSettings = node.exportSettings && node.exportSettings.length > 0;
      const graphicOnly = isGraphicOnly(node);
      
      if (hasImageFill || hasExportSettings || (graphicOnly && !isParentGraphicOnly)) {
        if (!exportIds.includes(node.id)) {
          exportIds.push(node.id);
        }
        if (graphicOnly) return; // Top-most graphic node, stop recursing
      }
      
      // Export FRAME nodes (for full page/section renders)
      if (node.type === 'FRAME' && (!node.children || node.children.length > 0)) {
        if (!exportIds.includes(node.id)) {
          exportIds.push(node.id);
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          findExportableNodes(child, graphicOnly);
        }
      }
    }

    if (scope === 'node' && nodeId && nodeData.nodes) {
      const normalizedId = nodeId.replace(/-/g, ':');
      const targetNode = nodeData.nodes[normalizedId];
      if (targetNode && targetNode.document) {
        exportIds.push(targetNode.document.id);
        findExportableNodes(targetNode.document);
      }
      console.log(`[Auto-Convert] scope=node, targetNode found: ${!!targetNode}, exportIds: ${exportIds.length}`);
    } else if (nodeData.document) {
      // Full page mode: process all children of all pages
      const pages = nodeData.document.children || [];
      console.log(`[Auto-Convert] scope=page, pages: ${pages.length}`);
      for (const page of pages) {
        const pageChildren = page.children || [];
        console.log(`[Auto-Convert]   Page "${page.name}": ${pageChildren.length} children`);
        for (const child of pageChildren) {
          findExportableNodes(child);
        }
      }
    } else {
      console.log(`[Auto-Convert] WARNING: No document found in nodeData! Keys: ${Object.keys(nodeData).join(', ')}`);
    }

    // Batch export images with delay
    const uniqueIds = [...new Set(exportIds)];
    console.log(`[Auto-Convert] Total unique export IDs: ${uniqueIds.length}`);
    let renderApiFailed = false;

    if (uniqueIds.length > 0) {
      console.log(`[Auto-Convert] First 5 IDs: ${uniqueIds.slice(0, 5).join(', ')}`);
      console.log(`[Auto-Convert] Exporting ${uniqueIds.length} images via render API...`);
      await delay(1000);

      for (let i = 0; i < uniqueIds.length; i += 50) {
        if (i > 0) await delay(1500);
        const batch = uniqueIds.slice(i, i + 50);
        try {
          const imgUrl = buildUrl(`${FIGMA_API}/images/${fileKey}`, {
            ids: batch.join(','),
            format: 'png',
            scale: 2,
          });

          const imgCacheKey = `auto-img:${imgUrl}`;
          const IMG_CACHE_TTL = 10 * 60 * 1000;
          let imgData = await getCachedResponse(imgCacheKey);
          if (imgData) {
            console.log(`[Auto-Convert] Image batch ${i}: CACHE HIT`);
            if (imgData.images) {
              const validImages = Object.fromEntries(
                Object.entries(imgData.images).filter(([k, v]) => v != null)
              );
              Object.assign(images, validImages);
            }
          } else {
            console.log(`[Auto-Convert] Image batch ${i}: calling render API for ${batch.length} nodes...`);
            const imgRes = await figmaFetch(imgUrl, token);
            if (imgRes.ok) {
              imgData = await imgRes.json();
              await setCachedResponse(imgCacheKey, imgData, IMG_CACHE_TTL);
              if (imgData.images) {
                const validImages = Object.fromEntries(
                  Object.entries(imgData.images).filter(([k, v]) => v != null)
                );
                Object.assign(images, validImages);
              }
            } else if (imgRes.status === 429) {
              console.warn(`[Auto-Convert] Render API rate limited (429). Will try Image Fill API fallback.`);
              renderApiFailed = true;
              break; // Stop trying render API, go to fallback
            } else {
              console.warn(`[Auto-Convert] Image batch ${i} returned status ${imgRes.status}`);
            }
          }
        } catch (err) {
          console.warn(`[Auto-Convert] Image batch ${i} failed:`, err.message);
        }
      }
    }

    // ── FALLBACK: Image Fill API ──
    // When the render API is rate-limited, use GET /v1/files/{key}/images
    // which returns URLs for all image fills by their imageRef hash.
    // This is a DIFFERENT endpoint with separate rate limits.
    if (renderApiFailed && Object.keys(images).length === 0) {
      console.log(`[Auto-Convert] === Using Image Fill API fallback ===`);
      try {
        const fillUrl = `${FIGMA_API}/files/${fileKey}/images`;
        const fillCacheKey = `auto-fill-images:${fillUrl}`;
        const FILL_CACHE_TTL = 30 * 60 * 1000; // 30 min cache

        let fillData = await getCachedResponse(fillCacheKey);
        if (!fillData) {
          console.log(`[Auto-Convert] Calling Image Fill API: ${fillUrl}`);
          const fillRes = await figmaFetch(fillUrl, token);
          console.log(`[Auto-Convert] Image Fill API status: ${fillRes.status}`);
          if (fillRes.ok) {
            fillData = await fillRes.json();
            await setCachedResponse(fillCacheKey, fillData, FILL_CACHE_TTL);
          } else {
            console.warn(`[Auto-Convert] Image Fill API also failed: ${fillRes.status}`);
          }
        } else {
          console.log(`[Auto-Convert] Image Fill API: CACHE HIT`);
        }

        if (fillData && fillData.meta && fillData.meta.images) {
          const imageRefMap = fillData.meta.images; // { imageRef: url }
          console.log(`[Auto-Convert] Image Fill API returned ${Object.keys(imageRefMap).length} image refs`);

          // Build a mapping: nodeId -> imageRef by walking the node tree
          function buildImageRefToNodeMap(node, map = {}) {
            if (!node) return map;
            if (node.fills && Array.isArray(node.fills)) {
              for (const fill of node.fills) {
                if (fill.type === 'IMAGE' && fill.imageRef) {
                  if (!map[fill.imageRef]) map[fill.imageRef] = [];
                  map[fill.imageRef].push(node.id);
                }
              }
            }
            if (node.children) {
              for (const child of node.children) {
                buildImageRefToNodeMap(child, map);
              }
            }
            return map;
          }

          // Get the source node tree
          let sourceNode;
          if (scope === 'node' && nodeId && nodeData.nodes) {
            const normalizedId = nodeId.replace(/-/g, ':');
            sourceNode = nodeData.nodes[normalizedId]?.document;
          } else if (nodeData.document) {
            sourceNode = nodeData.document;
          }

          if (sourceNode) {
            const refToNodes = buildImageRefToNodeMap(sourceNode);
            console.log(`[Auto-Convert] Mapped ${Object.keys(refToNodes).length} unique imageRefs to nodes`);

            let matchCount = 0;
            for (const [imageRef, nodeIds] of Object.entries(refToNodes)) {
              const url = imageRefMap[imageRef];
              if (url) {
                for (const nid of nodeIds) {
                  images[nid] = url;
                  matchCount++;
                }
              }
            }
            console.log(`[Auto-Convert] Image Fill fallback matched ${matchCount} node-image pairs`);

            // Log first few matches
            const firstEntries = Object.entries(images).slice(0, 5);
            for (const [id, url] of firstEntries) {
              console.log(`[Auto-Convert]   ${id}: ${url ? url.substring(0, 80) + '...' : 'NULL'}`);
            }
          }
        }
      } catch (err) {
        console.warn(`[Auto-Convert] Image Fill API fallback failed:`, err.message);
      }
    }

    console.log(`[Auto-Convert] Done. scope=${scope}, ${Object.keys(images).length} images exported.`);
    res.json({
      fileInfo,
      nodeData,
      images,
      exportedNodeCount: uniqueIds.length,
      scope,
      focusNodeId,
    });
  } catch (err) {
    console.error('Auto-convert error:', err);
    res.status(500).json({ error: `Auto-convert failed: ${err.message}` });
  }
});


// ── Batch image export endpoint (multi-format) ──
app.get('/api/figma/export-images', async (req, res) => {
  const token = getFigmaToken(req);
  if (!token) return res.status(401).json({ error: 'Missing x-figma-token header.' });

  const { fileKey, ids, formats, scale } = req.query;
  if (!fileKey || !ids) return res.status(400).json({ error: 'Missing fileKey or ids parameter.' });

  const formatList = (formats || 'png').split(',').map(f => f.trim().toLowerCase());
  const scaleValue = scale || 2;
  const result = {};

  try {
    for (const format of formatList) {
      const url = buildUrl(`${FIGMA_API}/images/${fileKey}`, {
        ids,
        format,
        scale: format === 'svg' ? undefined : scaleValue,
        svg_outline_text: format === 'svg' ? 'true' : undefined,
        svg_include_id: format === 'svg' ? 'true' : undefined,
      });
      const figmaRes = await figmaFetch(url, token);
      if (handleFigmaError(figmaRes, res)) return;
      const data = await figmaRes.json();
      result[format] = data.images || {};
    }

    res.json({ images: result });
  } catch (err) {
    console.error('Export images error:', err);
    res.status(500).json({ error: `Failed to export images: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log('\n==================================================');
  console.log(`  Figma-to-Code server running at http://localhost:${PORT}`);
  if (process.env.LOCAL_DIR) {
    console.log(`  📁 本地模式 — 資料夾: ${process.env.LOCAL_DIR}`);
  } else {
    console.log(`  🎨 Figma 模式 — 可連接 Figma API`);
  }
  console.log(`  Local assets served at http://localhost:${PORT}/ingame-assets/`);
  console.log('==================================================');
  console.log(`  🚀 正在自動為您開啟瀏覽器...`);
  console.log(`  若瀏覽器未自動開啟，請造訪：http://localhost:${PORT}`);
  console.log('==================================================\n');

  // Automatically open browser
  try {
    exec(`start http://localhost:${PORT}`);
  } catch (err) {
    console.error('Failed to auto-open browser:', err);
  }
});


