/**
 * ingame-routes.js — All ingame / local-file related routes
 *
 * Exports an Express Router that handles:
 *   - GET  /api/local/scan         Scan the ingame folder tree
 *   - GET  /api/local/file         Read a single local file
 *   - GET  /api/local/parse        Convert ASPX/HTML → clean preview HTML+CSS
 *   - POST /api/local/backup       Create a timestamped backup
 *   - POST /api/local/save         Save edited HTML & CSS
 *   - POST /api/local/restore      Restore from most recent backup
 *   - GET  /api/local/backup/list  List all available backups
 *
 * Also serves static assets under /ingame-assets and provides a
 * fallback redirect for legacy /Action/.../ingame/images/* paths.
 */

import { Router } from 'express';
import express from 'express';
import {
  readdir, readFile, stat, writeFile,
  mkdir, copyFile, access, unlink,
} from 'fs/promises';
import { join, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Configurable local directory (set via LOCAL_DIR env variable) ──
const LOCAL_DIR = process.env.LOCAL_DIR
  ? resolve(process.env.LOCAL_DIR)
  : resolve(__dirname, 'ingame/ingame');

const router = Router();

/**
 * Resolve a user-provided file path safely within LOCAL_DIR.
 * Returns the resolved full path, or null if it escapes the base directory.
 */
function safeguardPath(userPath, baseDir = LOCAL_DIR) {
  const sanitized = userPath.replace(/\.\./g, '');
  const fullPath = resolve(baseDir, sanitized);
  if (!fullPath.startsWith(baseDir)) return null;
  return fullPath;
}

// ── Static assets ──
router.use('/ingame-assets', express.static(LOCAL_DIR));

// Fallback: redirect old absolute paths /Action/.../ingame/images/* -> /ingame-assets/images/*
router.use('/Action', (req, res, next) => {
  const match = req.path.match(/\/ingame\/(images\/.+)/);
  if (match) {
    const imgPath = match[1].replace(/\?.*$/, '');
    return res.redirect(`/ingame-assets/${imgPath}`);
  }
  next();
});

// ── Helpers ──

/**
 * Recursively scan a directory and return a Figma-like node tree.
 */
async function scanDir(dirPath, basePath = '') {
  const entries = [];
  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      const relPath = basePath ? `${basePath}/${item.name}` : item.name;
      if (item.isDirectory()) {
        if (['images', '.backup', '.cache', 'node_modules'].includes(item.name)) {
          continue;
        }
        const children = await scanDir(fullPath, relPath);
        entries.push({
          id: relPath.replace(/[/\\]/g, ':'),
          name: item.name,
          type: 'FRAME',
          children,
          visible: true,
        });
      } else {
        const ext = extname(item.name).toLowerCase();
        const fileStat = await stat(fullPath);
        const nodeType = ['.html', '.aspx', '.htm'].includes(ext) ? 'FRAME'
          : ['.css', '.scss', '.sass'].includes(ext) ? 'TEXT'
          : ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext) ? 'RECTANGLE'
          : 'VECTOR';

        entries.push({
          id: relPath.replace(/[/\\]/g, ':'),
          name: item.name,
          type: nodeType,
          visible: true,
          absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 },
          _localPath: relPath,
          _fileSize: fileStat.size,
        });
      }
    }
  } catch (err) {
    console.error(`Error scanning ${dirPath}:`, err.message);
  }
  return entries;
}

// ── Routes ──

// Scan local ingame folder as if it were a Figma file
router.get('/api/local/scan', async (req, res) => {
  const ingamePath = LOCAL_DIR;
  try {
    const children = await scanDir(ingamePath);
    const result = {
      name: 'ingame 設計稿 (本地)',
      lastModified: new Date().toISOString(),
      version: 'local',
      thumbnailUrl: null,
      document: {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: [{
          id: '1:0',
          name: 'ingame',
          type: 'CANVAS',
          children,
          visible: true,
        }],
      },
    };
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to scan local files.' });
  }
});

// Read local file content
router.get('/api/local/file', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'Missing path.' });

  const fullPath = safeguardPath(filePath);
  if (!fullPath) return res.status(403).json({ error: 'Invalid path.' });

  try {
    const content = await readFile(fullPath, 'utf-8');
    res.json({ content, path: filePath });
  } catch (err) {
    res.status(404).json({ error: `File not found: ${filePath}` });
  }
});

// Convert local ASPX/HTML to clean HTML/CSS for preview
router.get('/api/local/parse', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'Missing path.' });

  const safePath = filePath.replace(/\.\./g, '');
  const fullPath = safeguardPath(filePath);
  if (!fullPath) return res.status(403).json({ error: 'Invalid path.' });

  try {
    let content = await readFile(fullPath, 'utf-8');

    // ── 1. Strip ASP.NET server-side code ──
    content = content.replace(/<%[\s\S]*?%>/g, '');
    content = content.replace(/<!--\s*#include[\s\S]*?-->/g, '');
    content = content.replace(/\s*runat\s*=\s*"server"/gi, '');

    // ── 2. Extract body content ──
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let htmlContent = bodyMatch ? bodyMatch[1] : content;

    // ── 3. Strip script tags ──
    htmlContent = htmlContent.replace(/<script[\s\S]*?<\/script>/gi, '');

    // ── 4. Fix HTML image paths ──
    htmlContent = htmlContent.replace(/src\s*=\s*"images\//g, 'src="/ingame-assets/images/');
    htmlContent = htmlContent.replace(/src\s*=\s*'images\//g, "src='/ingame-assets/images/");
    htmlContent = htmlContent.replace(/src\s*=\s*"\/Action\/[^"]*\/ingame\/images\//g, 'src="/ingame-assets/images/');
    htmlContent = htmlContent.replace(/src\s*=\s*'\/Action\/[^']*\/ingame\/images\//g, "src='/ingame-assets/images/");
    htmlContent = htmlContent.replace(/src\s*=\s*""\s*/g, 'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" ');
    htmlContent = htmlContent.replace(/src\s*=\s*''\s*/g, "src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' ");
    htmlContent = htmlContent.replace(/src\s*=\s*"([^"]*)\?[^"]*"/g, (match, path) => {
      if (path.startsWith('/ingame-assets/') || path.startsWith('data:')) return match;
      if (path.startsWith('images/')) return `src="/ingame-assets/${path}"`;
      return match;
    });

    // ── 5. Inject mock content for JS-populated containers ──
    let ingameConfig = null;
    try {
      const configPath = resolve(LOCAL_DIR, 'ingame-config.json');
      ingameConfig = JSON.parse(await readFile(configPath, 'utf-8'));
    } catch(e) { /* config file optional, use fallback */ }

    function fmtNum(n) {
      if (!n) return '0';
      return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function findTeam(teamId) {
      if (!ingameConfig) return null;
      return ingameConfig.teams.find(t => t.id === teamId) || null;
    }

    function replaceWrapperById(html, id, newInnerContent) {
      const regex = new RegExp(`(<div[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>)`, 'i');
      const match = regex.exec(html);
      if (!match) return html;

      const startIdx = match.index + match[0].length;
      let depth = 1;
      let i = startIdx;
      while (i < html.length && depth > 0) {
        if (html.slice(i, i + 6).toLowerCase() === '</div>') {
          depth--;
          if (depth === 0) break;
          i += 6;
        } else if (html.slice(i).match(/^<div[\s>\/]/i)) {
          depth++;
          const closeIdx = html.indexOf('>', i);
          if (closeIdx === -1) { i++; continue; }
          i = closeIdx + 1;
        } else {
          i++;
        }
      }
      if (depth !== 0) return html;
      return html.substring(0, startIdx) + '\n' + newInnerContent + '\n' + html.substring(i);
    }

    // ── 5a. Fill gameswitch active image ──
    if (ingameConfig && ingameConfig.stages.length > 0) {
      const firstStage = ingameConfig.stages[0];
      htmlContent = htmlContent.replace(
        /(<div\s+class="gameswitch--active"[^>]*>)\s*<img[^>]*>\s*(<\/div>)/i,
        `$1<img src="/ingame-assets/images/${firstStage.titleImage}" alt="${firstStage.name}">$2`
      );
    }

    // ── 5b. Fill gameswitch list ──
    if (ingameConfig) {
      const switchItems = ingameConfig.stages.map((s, i) =>
        `<div class="switch__item${i === 0 ? ' active' : ''}" data-stage="${s.key}"><img src="/ingame-assets/images/${s.titleImage}" alt="${s.name}"></div>`
      ).join('\n');
      htmlContent = replaceWrapperById(htmlContent, 'gsSwitchList', switchItems);
    }

    // ── 5b2. Add banner text ──
    if (ingameConfig && ingameConfig.mockData.bannerText) {
      htmlContent = htmlContent.replace(
        '<div class="gameallawards">',
        '<div class="game__banner"><p>' + ingameConfig.mockData.bannerText + '</p></div>\n<div class="gameallawards">'
      );
    }

    // ── 5c. Fill #mainBetWrapper ──
    if (ingameConfig && ingameConfig.mockData.mainBetCards) {
      const mainSlides = ingameConfig.mockData.mainBetCards.map((card, idx) => {
        const hasWinner = card.winnerTeamId > 0;
        const slideClasses = ['swiper-slide'];
        if (card.active) slideClasses.push('swiper-slide-active');
        if (card.isBetEnded) slideClasses.push('off');
        if (hasWinner && card.myBets > 0) slideClasses.push('winbet');

        const betBtnHtml = card.isBetEnded ? '' : `<div class="betbox__BetBtn" data-item-idx="${idx}"></div>`;

        // ── Knockout card (2-team VS) ──
        if (card.type === 'knockout') {
          const homeTeam = findTeam(card.homeTeamId);
          const awayTeam = findTeam(card.awayTeamId);
          const homeLiClass = (hasWinner && card.homeTeamId === card.winnerTeamId) ? ' class="win"' : '';
          const awayLiClass = (hasWinner && card.awayTeamId === card.winnerTeamId) ? ' class="win"' : '';
          return `<div class="${slideClasses.join(' ')}">
  <div class="betbox">
    <div class="betbox__title"><img src="/ingame-assets/images/betpage/bet2_title1.png" alt="${card.title || ''}"></div>
    <div class="betbox__awards"><img src="/ingame-assets/images/${card.awardImage}" alt="獎金"></div>
    <div class="betbox__nation">
      <ul class="nationVs">
        <li${homeLiClass}><img src="/ingame-assets/images/${homeTeam ? homeTeam.flagCircle : ''}" title="${homeTeam ? homeTeam.name : ''}"></li>
        <li${awayLiClass}><img src="/ingame-assets/images/${awayTeam ? awayTeam.flagCircle : ''}" title="${awayTeam ? awayTeam.name : ''}"></li>
      </ul>
    </div>
    <div class="betbox__allBetNum"><p>${fmtNum(card.totalBets)}</p></div>
    <div class="betbox__myBetNum"><p>我已投注：${fmtNum(card.myBets)}</p></div>
    ${betBtnHtml}
  </div>
</div>`;
        }

        // ── Group stage card (marquee with 4+ flags) ──
        const group = ingameConfig.groups[card.groupIndex];
        const flagLis = card.teamIds.map(tid => {
          const team = findTeam(tid);
          if (!team) return '';
          const isWinner = hasWinner && tid === card.winnerTeamId;
          const liClass = isWinner ? ' class="win"' : '';
          const liStyle = isWinner
            ? ' style="overflow:hidden;position:relative;opacity:1;top:0px;left:0px;"'
            : ' style="overflow:hidden;"';
          return `<li${liClass}${liStyle}><img src="/ingame-assets/images/${team.flagCircle}" title="${team.name}" style="max-height:100%;object-fit:contain;"></li>`;
        }).join('\n');

        const marqueeClass = hasWinner ? 'marquee has-winner' : 'marquee';

        return `<div class="${slideClasses.join(' ')}">
  <div class="betbox">
    <div class="betbox__title"><img src="/ingame-assets/images/${group.groupImage}" alt="預測${group.label}組第一"></div>
    <div class="betbox__awards"><img src="/ingame-assets/images/${card.awardImage}" alt="獎金"></div>
    <div class="betbox__nation">
      <ul class="${marqueeClass}" style="overflow:hidden;">
        ${flagLis}
      </ul>
    </div>
    <div class="betbox__allBetNum"><p>${fmtNum(card.totalBets)}</p></div>
    <div class="betbox__myBetNum"><p>我已投注：${fmtNum(card.myBets)}</p></div>
    ${betBtnHtml}
  </div>
</div>`;
      }).join('\n');
      htmlContent = replaceWrapperById(htmlContent, 'mainBetWrapper', mainSlides);
    }

    // ── 5d. Fill #betPredictWrapper (3-team group stage popup) ──
    if (ingameConfig && ingameConfig.mockData.predictCards) {
      const predictSlides = ingameConfig.mockData.predictCards.map((card, idx) => {
        const team = findTeam(card.teamId);
        const flagImg = team ? `/ingame-assets/images/betpage/${team.flagSquare}` : '';
        return `<div class="swiper-slide${card.active ? ' swiper-slide-active' : ''}" data-medal="${10001 + idx}">
  <div class="betbox">
    <div class="betbox__nation"><img src="${flagImg}"></div>
    <div class="betbox__teamName"><p>${team ? team.name : ''}</p></div>
    <div class="betbox__allBetNum"><p>${fmtNum(card.totalBets)}</p></div>
    <div class="betbox__myBetNum"><p>我已投注：${fmtNum(card.myBets)}</p></div>
    <div class="betbox__betting">
      <div class="btn btn-reduce off"></div>
      <input type="text" value="0" class="betNum" data-medal="${10001 + idx}">
      <div class="btn btn-add"></div>
    </div>
  </div>
</div>`;
      }).join('\n');
      htmlContent = replaceWrapperById(htmlContent, 'betPredictWrapper', predictSlides);
    }

    // ── 5e. Fill #betGameWrapper (2-team knockout popup) ──
    if (ingameConfig && ingameConfig.mockData.gameCards) {
      const gameSlides = ingameConfig.mockData.gameCards.map((card, idx) => {
        const team = findTeam(card.teamId);
        const flagImg = team ? `/ingame-assets/images/betpage/${team.flagSquare}` : '';
        return `<div class="swiper-slide${card.active ? ' swiper-slide-active' : ''}" data-medal="${20001 + idx}">
  <div class="betbox">
    <div class="betbox__nation"><img src="${flagImg}"></div>
    <div class="betbox__teamName"><p>${team ? team.name : ''}</p></div>
    <div class="betbox__allBetNum"><p>${fmtNum(card.totalBets)}</p></div>
    <div class="betbox__myBetNum"><p>我已投注：${fmtNum(card.myBets)}</p></div>
    <div class="betbox__betting">
      <div class="btn btn-reduce off"></div>
      <input type="text" value="0" class="betNum" data-medal="${20001 + idx}">
      <div class="btn btn-add"></div>
    </div>
  </div>
</div>`;
      }).join('\n');
      htmlContent = replaceWrapperById(htmlContent, 'betGameWrapper', gameSlides);
    }

    // ── 5f. Fill betpage title ──
    const betPageTitleMatch = htmlContent.match(/(<div\s+class="betpage__title">)/i);
    if (betPageTitleMatch) {
      const titleStart = htmlContent.indexOf(betPageTitleMatch[0]);
      const titleOpenTag = betPageTitleMatch[0];
      let tDepth = 1, tIdx = titleStart + titleOpenTag.length;
      while (tIdx < htmlContent.length && tDepth > 0) {
        if (htmlContent.slice(tIdx, tIdx + 6).toLowerCase() === '</div>') {
          tDepth--;
          if (tDepth === 0) break;
          tIdx += 6;
        } else if (htmlContent.slice(tIdx).match(/^<div[\s>\/]/i)) {
          tDepth++;
          const closeIdx = htmlContent.indexOf('>', tIdx);
          if (closeIdx === -1) { tIdx++; continue; }
          tIdx = closeIdx + 1;
        } else {
          tIdx++;
        }
      }
      if (tDepth === 0) {
        const prizeAmt = ingameConfig ? fmtNum(ingameConfig.mockData.prizeAmount) : '123,456,789';
        const mockTitleInner = `
							<div class="title">
								<img src="/ingame-assets/images/betpage/bet2_title1.png" id="editorBetPageTitleImg" style="display:none; width:100%; margin:0 auto;">
								<div class="words" id="editorBetPageTitleWords" style="width:60.8%; height:96.6%; display:flex; justify-content:center; align-items:center; position:relative;">
									<div class="nums">
										<ul>
											<li class="num-6"></li>
											<li class="num-slash"></li>
											<li class="num-5"></li>
										</ul>
									</div>
								</div>
							</div>
							<div class="allawards">
								<p>本場目前總獎金：<span class="f-fun">${prizeAmt}</span></p>
							</div>`;
        htmlContent = htmlContent.substring(0, titleStart + titleOpenTag.length) +
          '\n' + mockTitleInner + '\n' +
          htmlContent.substring(tIdx);
      }
    }

    // ── 5g. Fill countdown timer ──
    const countdownText = ingameConfig ? ingameConfig.mockData.countdownText : '0天 00時 00分';
    htmlContent = htmlContent.replace(
      /(<p\s+class="value"\s+id="countdownDisplay">)[^<]*(<\/p>)/i,
      `$1${countdownText}$2`
    );

    // ── 5h. Fill user item amount ──
    const itemAmount = ingameConfig ? fmtNum(ingameConfig.mockData.itemAmount) : '123,456';
    htmlContent = htmlContent.replace(
      /(<p\s+class="num"\s+id="itemAmountDisplay">)[^<]*(<\/p>)/i,
      `$1${itemAmount}$2`
    );
    htmlContent = htmlContent.replace(
      /(<p\s+class="num"\s+id="betPageItemCount">)[^<]*(<\/p>)/i,
      `$1${itemAmount}$2`
    );

    // ── 5i. Fill record table with mock data ──
    if (ingameConfig && ingameConfig.mockData.recordRows) {
      const recordHtml = ingameConfig.mockData.recordRows.map(row => {
        const team = findTeam(row.teamId);
        const teamCell = team
          ? `<img src="/ingame-assets/images/betpage/${team.flagSquare}" title="${team.name}" style="height:24px">`
          : '未知';
        let resultHtml = '<span style="color:#aaa">進行中</span>';
        let prizeHtml = '-';
        if (row.result === 'win') {
          resultHtml = '<span style="color:#4cff4c">✓ 猜中</span>';
          prizeHtml = `<span style="color:#FFEA00;font-weight:600">${fmtNum(row.prizeWon)}</span>`;
        } else if (row.result === 'lose') {
          resultHtml = '<span style="color:#ff6b6b">✗ 未中</span>';
          prizeHtml = '<span style="color:#666">0</span>';
        }
        return `<tr><td>${row.stage}</td><td>${teamCell}</td><td>${fmtNum(row.myBets)}</td><td>${resultHtml}</td><td>${prizeHtml}</td></tr>`;
      }).join('\n');
      htmlContent = htmlContent.replace(
        /(<tbody\s+id="recordTableBody">)[\s\S]*?(<\/tbody>)/i,
        `$1\n${recordHtml}\n$2`
      );
    }

    // ── 5j. Remove inline display:none from bet popup containers ──
    htmlContent = htmlContent.replace(/(<div[^>]*id="betPredictBox"[^>]*)style="display:none;"/i, '$1');
    htmlContent = htmlContent.replace(/(<div[^>]*id="betGameBox"[^>]*)style="display:none;"/i, '$1');

    // ── 6. Load and combine CSS ──
    let combinedCss = '';
    const cssDir = resolve(LOCAL_DIR, 'style/css');
    const cssOrder = ['master_v2.css', 'style.css', 'game_view.css'];
    try {
      for (const cf of cssOrder) {
        const cssPath = join(cssDir, cf);
        try {
          let cssContent = await readFile(cssPath, 'utf-8');

          cssContent = cssContent.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, url) => {
            let newUrl = url.trim();
            // Replace /Action/.../ingame/images/ -> /ingame-assets/images/
            newUrl = newUrl.replace(/^\/Action\/[^/]+\/[^/]+\/[^/]+\/ingame\/images\//i, '/ingame-assets/images/');
            newUrl = newUrl.replace(/^\/Action\/[^/]+\/[^/]+\/ingame\/images\//i, '/ingame-assets/images/');
            newUrl = newUrl.replace(/^\/Action\/[^/]+\/ingame\/images\//i, '/ingame-assets/images/');
            // Replace ../images/ -> /ingame-assets/images/
            newUrl = newUrl.replace(/^\.\.\/images\//i, '/ingame-assets/images/');
            // Replace images/ -> /ingame-assets/images/
            newUrl = newUrl.replace(/^images\//i, '/ingame-assets/images/');
            // Strip query params
            newUrl = newUrl.replace(/(\.(?:png|jpg|jpeg|gif|svg|webp))\?[^)]*$/i, '$1');
            return `url(${newUrl})`;
          });
          cssContent = cssContent.replace(
            /@import\s+url\(([^)]+)\)\s*;?/g,
            (match, urlPart) => {
              if (urlPart.includes('http://') || urlPart.includes('https://') || urlPart.includes('fonts.googleapis.com')) {
                return match;
              }
              return '/* [local import removed for preview] */';
            }
          );

          combinedCss += `/* ── ${cf} ── */\n${cssContent}\n\n`;
        } catch { /* file not found, skip */ }
      }
    } catch { /* no css dir */ }

    // ── 7. Preview CSS overrides ──
    const previewFixes = `
/* ══════════════════════════════════════════════════ */
/* Preview Overrides — fixes for static iframe view  */
/* ══════════════════════════════════════════════════ */

/* ── Normalize reset (since @import url(/css/normalize.css) is stripped) ── */
html { line-height: 1.15; -webkit-text-size-adjust: 100%; }
body { margin: 0; }
main { display: block; }
h1 { font-size: 2em; margin: 0.67em 0; }
hr { box-sizing: content-box; height: 0; overflow: visible; }
pre { font-family: monospace, monospace; font-size: 1em; }
a { background-color: transparent; }
img { border-style: none; }
button, input, select, textarea { font-family: inherit; font-size: 100%; line-height: 1.15; margin: 0; }
button, input { overflow: visible; }
button, select { text-transform: none; }
table { border-collapse: collapse; border-spacing: 0; }

/* ── Base layout for preview iframe ── */
:root { --vh: 1vh; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
}
* { box-sizing: border-box; }

/* Hide placeholder images from stripped ASP variables */
img[src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"] {
  display: none;
}

/* ── Disable forced landscape rotation (from game_view.css) ── */
@media screen and (orientation: portrait) {
  html, body {
    width: 100vw !important;
    height: 100vh !important;
  }
}
#ingame__view {
  transform: none !important;
  -webkit-transform: none !important;
  transform-origin: initial !important;
  -webkit-transform-origin: initial !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  position: relative !important;
}

/* ── Wrapper: fills the viewport, centers content ── */
.ingame__wrapper {
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  overflow: hidden !important;
  background-size: cover !important;
  background-position: center center !important;
}

/* ── Container: fills the wrapper exactly ── */
/* Override all @media aspect-ratio queries — in the iframe preview, the container must fill 100% */
.ingame__container {
  position: relative !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  padding-bottom: initial !important;
}

/* ── Main game area ── */
/* CRITICAL: gamemain must create a stacking context with low z-index
   so its swiper-button children don't bleed over popups (z-index: 999) */
.gamemain {
  overflow: visible !important;
  z-index: 1 !important;
  position: absolute !important;
}

/* ── Popups: hidden by default ── */
.ingame__popup--bg,
.popup {
  visibility: hidden;
}

/* Show popup elements when .show is applied */
.ingame__popup--bg.show {
  visibility: visible !important;
  opacity: 1 !important;
}
.popup.show {
  visibility: visible !important;
  opacity: 1 !important;
}
/* popup__main needs .show to be visible (each sub-panel: question/record/betpage) */
.popup__main.show {
  visibility: visible !important;
  display: block !important;
  opacity: 1 !important;
}
/* popup-base inside popup__main — override its hidden when .show is on the parent */
.popup__main.show.popup-base {
  visibility: visible !important;
}
/* popup-bet inside popup__main — override its hidden when .show is on the parent */
.popup__main.show.popup-bet {
  visibility: visible !important;
}

/* ── Hide debug timestamp ── */
.dtNow { display: none !important; }

/* ── Marquee fix: only show the first item (without jQuery plugin they stack) ── */
.gamemain-bet .swiper-slide .betbox__nation ul.marquee {
  position: relative !important;
  overflow: hidden !important;
}
.gamemain-bet .swiper-slide .betbox__nation ul.marquee li {
  position: absolute !important;
  opacity: 0 !important;
}
.gamemain-bet .swiper-slide .betbox__nation ul.marquee li:first-child {
  position: relative !important;
  opacity: 1 !important;
}

/* ── Winner state: show only the winning team's flag ── */
.gamemain-bet .swiper-slide .betbox__nation ul.marquee.has-winner li {
  position: absolute !important;
  opacity: 0 !important;
}
.gamemain-bet .swiper-slide .betbox__nation ul.marquee.has-winner li.win {
  position: relative !important;
  opacity: 1 !important;
  animation: nationWin 2s infinite;
}

/* ── WINNER badge (winbet) positioning fix ── */
.gamemain-bet .swiper-slide.winbet .betbox::after {
  pointer-events: none;
}

/* ── Bet ended: ensure active slide still shows result area ── */
.gamemain-bet .swiper-slide.off.swiper-slide-active .betbox__BetBtn {
  display: block !important;
}

/* ── Swiper navigation arrows (main view only) ── */
.gamemain .swiper-button-next,
.gamemain .swiper-button-prev {
  opacity: 1 !important;
  visibility: visible !important;
}
/* Bet popup arrows: only show when the popup is active */
.popup.show .betpage__betbox .swiper-button-next,
.popup.show .betpage__betbox .swiper-button-prev {
  opacity: 1 !important;
  visibility: visible !important;
  width: 40px;
  height: 80px;
  top: 40%;
  color: transparent;
  z-index: 10;
}
.popup.show .betpage__betbox .swiper-button-next::after,
.popup.show .betpage__betbox .swiper-button-prev::after {
  content: "";
  display: block;
  width: 100%;
  height: 100%;
  background-size: 100% !important;
  background-repeat: no-repeat;
  animation: pulse 1.5s infinite, swiperButton 1.5s infinite;
}
.popup.show .betpage__betbox .swiper-button-next::after {
  background-image: url(/ingame-assets/images/btn_arrow_next.png);
}
.popup.show .betpage__betbox .swiper-button-prev::after {
  background-image: url(/ingame-assets/images/btn_arrow_prev.png);
}

/* ── IMPORTANT: Hide swiper arrows that leak into popup overlays ── */
/* When popup is shown, main swiper arrows should NOT show through */
/* Use :has() to match the parent container that has an active popup */
.ingame__container:has(.popup.show) > .gamemain .swiper-button-next,
.ingame__container:has(.popup.show) > .gamemain .swiper-button-prev,
.ingame__container:has(.popup.show) > .gamemain .swiper-button-next::after,
.ingame__container:has(.popup.show) > .gamemain .swiper-button-prev::after {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
}

/* ── Game switch dropdown ── */
.gameswitch__list {
  display: none !important;
}
.gameswitch__list.show {
  display: flex !important;
  flex-direction: column !important;
}
.gameswitch--active {
  visibility: visible !important;
}

/* ── Ensure info areas show ── */
.gameinfo {
  z-index: 1 !important;
}
.gameallawards {
  z-index: 1 !important;
}

/* ── Hide loading overlay ── */
.loading_wrp {
  display: none !important;
}

/* ── Popup positioning ── */
.popup {
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  position: absolute !important;
  z-index: 999 !important;
  overflow: hidden !important;
}
.ingame__popup--bg {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 998 !important;
}

/* popup-base (question/record) */
.popup-base {
  z-index: 1000 !important;
}
.popup-base .main {
  overflow-y: auto !important;
}
/* Fix question popup layout */
.popup-base .main {
  position: relative !important;
  z-index: 2 !important;
}

/* popup-bet (betpage) */
.popup-bet {
  z-index: 1000 !important;
}

/* ── Banner title ── */
.game__banner {
  width: 39.357%;
  position: absolute;
  top: 3.5%;
  left: 30.14%;
  text-align: center;
  z-index: 2;
}
.game__banner p {
  color: #FFEA00;
  font-weight: 700;
  font-family: "Chiron GoRound TC", "noto sans tc", sans-serif;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5), 0 0 10px rgba(255,234,0,0.3);
  font-size: clamp(13px, 2.8vw, 30px);
  letter-spacing: 2px;
}

/* ── NationVs for knockout cards ── */
.gamemain-bet .swiper-slide .betbox__nation ul.nationVs {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: space-around;
  align-items: center;
  list-style: none;
  padding: 0;
  margin: 0;
}
.gamemain-bet .swiper-slide .betbox__nation ul.nationVs li {
  width: 28.857%;
  height: 97.196%;
  position: relative;
}
.gamemain-bet .swiper-slide .betbox__nation ul.nationVs li img {
  display: block;
  max-height: 100%;
  object-fit: contain;
  margin-top: 5.94%;
  margin-left: 5.94%;
}
.gamemain-bet .swiper-slide .betbox__nation ul.nationVs::before {
  content: "";
  display: block;
  width: 9.714%;
  height: 30.841%;
  background-image: url(/ingame-assets/images/VS.png);
  background-size: 100%;
  background-repeat: no-repeat;
  order: 2;
}
.gamemain-bet .swiper-slide .betbox__nation ul.nationVs li:nth-child(1) { order: 1; }
.gamemain-bet .swiper-slide .betbox__nation ul.nationVs li:nth-child(2) { order: 3; }

/* ── Bet page elements ── */
.popup .betpage__betBtns {
  z-index: 1 !important;
}
.popup .betpage__note {
  z-index: 1 !important;
}

/* ── Team name in bet pages ── */
.popup .betpage__betbox .swiper-slide .betbox__teamName {
  width: 100%;
  position: absolute;
  top: 37%;
  left: 0;
  text-align: center;
  z-index: 1;
}
.popup .betpage__betbox .swiper-slide .betbox__teamName p {
  color: #fff;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  font-size: clamp(10px, 2.5vh, 18px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Record and Question button visibility and z-index ── */
.btn__record,
.btn__question {
  visibility: visible !important;
  opacity: 1 !important;
  z-index: 10 !important;
  pointer-events: auto !important;
}

/* ══════════════════════════════════════ */
/* IMPROVEMENT: Reward Claim Popup       */
/* ══════════════════════════════════════ */
.popup__main.reward {
  z-index: 1001 !important;
}
.reward__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5% 10%;
  text-align: center;
}
.reward__trophy {
  width: 30%;
  max-width: 120px;
  margin-bottom: 3%;
  animation: rewardBounce 1.5s ease infinite;
}
.reward__trophy-img {
  width: 100%;
  filter: drop-shadow(0 0 20px rgba(255, 234, 0, 0.6));
}
@keyframes rewardBounce {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-8px) scale(1.05); }
}
.reward__amount {
  margin-bottom: 4%;
}
.reward__label {
  color: rgba(255,255,255,0.7);
  font-size: clamp(11px, 2vh, 16px);
  margin-bottom: 2px;
}
.reward__value {
  color: #FFEA00;
  font-size: clamp(22px, 5vh, 42px);
  font-weight: 800;
  text-shadow: 0 0 15px rgba(255,234,0,0.5), 0 2px 4px rgba(0,0,0,0.5);
  letter-spacing: 2px;
  animation: rewardPulse 2s ease-in-out infinite;
}
@keyframes rewardPulse {
  0%, 100% { transform: scale(1); text-shadow: 0 0 15px rgba(255,234,0,0.5); }
  50% { transform: scale(1.05); text-shadow: 0 0 30px rgba(255,234,0,0.8), 0 0 60px rgba(255,234,0,0.3); }
}
.reward__claim-btn {
  position: relative;
  width: 40%;
  max-width: 180px;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
  margin-bottom: 3%;
}
.reward__claim-btn:hover {
  transform: scale(1.08);
  filter: brightness(1.2);
}
.reward__claim-btn:active {
  transform: scale(0.95);
}
.reward__claim-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: clamp(12px, 2.5vh, 18px);
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  white-space: nowrap;
  pointer-events: none;
}
.reward__note {
  color: rgba(255,255,255,0.5);
  font-size: clamp(9px, 1.5vh, 12px);
}

/* ══════════════════════════════════════ */
/* IMPROVEMENT: Gameswitch dropdown hint */
/* ══════════════════════════════════════ */
/* Extraneous CSS arrow removed to resolve Issue 2 */

/* ══════════════════════════════════════ */
/* IMPROVEMENT: Bet success feedback     */
/* ══════════════════════════════════════ */
.swiper-slide .betbox__myBetNum.just-bet {
  animation: betSuccessFlash 0.8s ease;
}
@keyframes betSuccessFlash {
  0% { transform: scale(1); }
  30% { transform: scale(1.15); color: #FFEA00; }
  60% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
.swiper-slide.has-my-bet .betbox::before {
  content: '✓ 已投注';
  position: absolute;
  top: 4%;
  right: 4%;
  background: rgba(76, 255, 76, 0.2);
  color: #4cff4c;
  font-size: clamp(8px, 1.2vh, 11px);
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid rgba(76, 255, 76, 0.4);
  z-index: 2;
  pointer-events: none;
  font-weight: 600;
}

/* ══════════════════════════════════════ */
/* IMPROVEMENT: Record table prize col   */
/* ══════════════════════════════════════ */
.popup-base.record .table th:nth-child(5),
.popup-base.record .table td:nth-child(5) {
  min-width: 60px;
  text-align: right;
}

/* ══════════════════════════════════════ */
/* IMPROVEMENT: No-ticket warning style  */
/* ══════════════════════════════════════ */
.no-ticket-hint {
  color: #ff6b6b;
  font-size: clamp(9px, 1.5vh, 12px);
  text-align: center;
  padding: 2px 0;
  animation: noTicketPulse 1.5s ease infinite;
}
@keyframes noTicketPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;

    // Extract stylesheets refs for reference
    const styleRefs = [];
    const styleRegex = /href="([^"]*\.css[^"]*)"/gi;
    let m;
    while ((m = styleRegex.exec(content)) !== null) {
      styleRefs.push(m[1]);
    }

    res.json({
      html: htmlContent.trim(),
      css: combinedCss + previewFixes,
      styleRefs,
      originalPath: safePath,
    });
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: `File not found: ${safePath}` });
  }
});

// ── Local file backup / save / restore endpoints ──

// POST /api/local/backup — create a timestamped backup before editing
router.post('/api/local/backup', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing path.' });

  const safePath = filePath.replace(/\.\./g, '');
  const fullPath = safeguardPath(filePath);
  if (!fullPath) return res.status(403).json({ error: 'Invalid path.' });
  const backupDir = resolve(LOCAL_DIR, '.backup');

  try {
    // Ensure backup directory exists
    await mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = safePath.replace(/[\/\\]/g, '_');
    const backupId = `${timestamp}_${filename}`;

    // Backup the target file
    await copyFile(fullPath, resolve(backupDir, backupId));

    // Also backup all CSS files in style/css/
    const cssDir = resolve(LOCAL_DIR, 'style/css');
    try {
      const cssFiles = await readdir(cssDir);
      for (const cf of cssFiles) {
        if (cf.endsWith('.css')) {
          await copyFile(
            resolve(cssDir, cf),
            resolve(backupDir, `${timestamp}_style_css_${cf}`)
          );
        }
      }
    } catch { /* style/css dir may not exist */ }

    res.json({ success: true, backupId, timestamp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Failed to create backup: ${err.message}` });
  }
});

// POST /api/local/save — save edited HTML & CSS to disk (non-destructive)
router.post('/api/local/save', async (req, res) => {
  const { path: filePath, html, css } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing path.' });

  const fullPath = safeguardPath(filePath);
  if (!fullPath) return res.status(403).json({ error: 'Invalid path.' });

  try {
    // 1. Keep preview files for compatibility
    const previewHtmlPath = resolve(LOCAL_DIR, `${filePath.replace(/\.\./g, '')}.preview.html`);
    if (html !== undefined) {
      await writeFile(previewHtmlPath, html, 'utf-8');
    }
    if (css !== undefined) {
      const modifiedCssPath = resolve(LOCAL_DIR, 'style/css/style.modified.css');
      await writeFile(modifiedCssPath, css, 'utf-8');
    }

    // 2. Synchronize CSS changes back to original source files
    if (css !== undefined) {
      const parts = css.split(/\/\*\s*──\s*([a-zA-Z0-9_.-]+)\s*──\s*\*\//);
      for (let i = 1; i < parts.length; i += 2) {
        const filename = parts[i];
        let content = parts[i + 1] || '';
        content = content.trim();

        if (filename && content) {
          const cssFilePath = resolve(LOCAL_DIR, 'style/css', filename);
          // Restore Action paths inside stylesheet back to absolute paths
          content = content.replace(
            /url\(\s*\/ingame-assets\/images\//g,
            'url(/Action/11_Star31/20260527MU/ingame/images/'
          );
          await writeFile(cssFilePath, content, 'utf-8');
        }
      }
    }

    // 3. Synchronize HTML changes back to the original source file
    if (html !== undefined) {
      if (filePath.endsWith('.aspx')) {
        let cleanHtml = html;

        // Restore C# variables in dynamic tags
        cleanHtml = cleanHtml.replace(
          /(<p\s+class="num"\s+id="itemAmountDisplay"[^>]*>)[^<]*(<\/p>)/gi,
          '$1<%= string.Format("{0:N0}", nItemAmount) %>$2'
        );
        cleanHtml = cleanHtml.replace(
          /(<p\s+class="num"\s+id="betPageItemCount"[^>]*>)[^<]*(<\/p>)/gi,
          '$1<%= string.Format("{0:N0}", nItemAmount) %>$2'
        );

        // Empty dynamic mockup containers
        cleanHtml = cleanHtml.replace(
          /(<div\s+class="gameswitch__list"\s+id="gsSwitchList"[^>]*>)[\s\S]*?(<\/div>)/gi,
          '$1$2'
        );
        cleanHtml = cleanHtml.replace(
          /(<div\s+class="swiper-wrapper"\s+id="mainBetWrapper"[^>]*>)[\s\S]*?(<\/div>)/gi,
          '$1$2'
        );
        cleanHtml = cleanHtml.replace(
          /(<div\s+class="swiper-wrapper"\s+id="betPredictWrapper"[^>]*>)[\s\S]*?(<\/div>)/gi,
          '$1$2'
        );
        cleanHtml = cleanHtml.replace(
          /(<div\s+class="swiper-wrapper"\s+id="betGameWrapper"[^>]*>)[\s\S]*?(<\/div>)/gi,
          '$1$2'
        );
        cleanHtml = cleanHtml.replace(
          /(<tbody\s+id="recordTableBody"[^>]*>)[\s\S]*?(<\/tbody>)/gi,
          '$1$2'
        );

        // Restore display:none style on popup overlays
        cleanHtml = cleanHtml.replace(/(<div[^>]*id="betPredictBox"[^>]*>)/gi, (match) => {
          if (!/style\s*=/i.test(match)) {
            return match.replace('id="betPredictBox"', 'id="betPredictBox" style="display:none;"');
          }
          return match.replace(/style\s*=\s*"[^"]*"/i, 'style="display:none;"');
        });
        cleanHtml = cleanHtml.replace(/(<div[^>]*id="betGameBox"[^>]*>)/gi, (match) => {
          if (!/style\s*=/i.test(match)) {
            return match.replace('id="betGameBox"', 'id="betGameBox" style="display:none;"');
          }
          return match.replace(/style\s*=\s*"[^"]*"/i, 'style="display:none;"');
        });

        // Restore gameswitch active layout
        cleanHtml = cleanHtml.replace(
          /(<div[^>]*id="gsSwitchActive"[^>]*>)[\s\S]*?(<\/div>)/gi,
          '$1\n\t\t\t\t\t\t<img src="" alt="">$2'
        );
        cleanHtml = cleanHtml.replace(
          /(<div[^>]*id="gsSwitchActive"[^>]*data-stage=")[^"]*(")/gi,
          '$1$2'
        );

        // Restore award image
        cleanHtml = cleanHtml.replace(
          /(<img[^>]*id="awardImage"[^>]*src=")[^"]*(")/gi,
          '$1images/info_award1.png$2'
        );

        // Restore countdown timer
        cleanHtml = cleanHtml.replace(
          /(<p\s+class="value"\s+id="countdownDisplay"[^>]*>)[^<]*(<\/p>)/gi,
          '$1-- -- --$2'
        );

        // Clean local static assets paths
        cleanHtml = cleanHtml.replace(
          /src\s*=\s*"\s*\/ingame-assets\/images\//g,
          'src="images/'
        );
        cleanHtml = cleanHtml.replace(
          /src\s*=\s*'\s*\/ingame-assets\/images\//g,
          "src='images/"
        );

        // Merge back into index.aspx
        const originalContent = await readFile(fullPath, 'utf-8');
        const wrapperStart = cleanHtml.indexOf('<div class="ingame__wrapper">');
        if (wrapperStart !== -1) {
          let depth = 1;
          let idx = wrapperStart + '<div class="ingame__wrapper">'.length;
          while (idx < cleanHtml.length && depth > 0) {
            if (cleanHtml.slice(idx, idx + 6).toLowerCase() === '</div>') {
              depth--;
              if (depth === 0) {
                idx += 6;
                break;
              }
              idx += 6;
            } else if (cleanHtml.slice(idx).match(/^<div[\s>\/]/i)) {
              depth++;
              const closeBracket = cleanHtml.indexOf('>', idx);
              if (closeBracket === -1) { idx++; continue; }
              idx = closeBracket + 1;
            } else {
              idx++;
            }
          }
          if (depth === 0) {
            const wrapperFullHtml = cleanHtml.substring(wrapperStart, idx);
            const bodySectionRegex = /(<div\s+class="ingame__wrapper">)[\s\S]*?(?=\s*<!--\s*Loading\s*-->)/i;
            if (bodySectionRegex.test(originalContent)) {
              const updatedAspx = originalContent.replace(bodySectionRegex, wrapperFullHtml.trim());
              await writeFile(fullPath, updatedAspx, 'utf-8');
            }
          }
        }
      } else {
        await writeFile(fullPath, html, 'utf-8');
      }
    }

    const savedAt = new Date().toISOString();
    res.json({ success: true, savedAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Failed to save: ${err.message}` });
  }
});

// POST /api/local/restore — restore files from the most recent backup
router.post('/api/local/restore', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing path.' });

  const fullPath = safeguardPath(filePath);
  if (!fullPath) return res.status(403).json({ error: 'Invalid path.' });
  const backupDir = resolve(LOCAL_DIR, '.backup');
  const safePath = filePath.replace(/\.\./g, '');
  const filename = safePath.replace(/[\/\\]/g, '_');

  try {
    const allBackups = await readdir(backupDir);

    // Find backups matching this file, sorted by timestamp (latest first)
    const matching = allBackups
      .filter(f => f.endsWith(`_${filename}`))
      .sort()
      .reverse();

    if (matching.length === 0) {
      return res.status(404).json({ error: `No backups found for: ${safePath}` });
    }

    const latestBackup = matching[0];
    const backupPath = resolve(backupDir, latestBackup);

    // Restore the original file from backup
    await copyFile(backupPath, resolve(LOCAL_DIR, safePath));

    // Restore CSS backups (find matching timestamp)
    const timestamp = latestBackup.replace(`_${filename}`, '');
    const cssBackups = allBackups.filter(f => f.startsWith(timestamp) && f.includes('style_css_'));
    for (const cb of cssBackups) {
      const cssFilename = cb.replace(`${timestamp}_style_css_`, '');
      await copyFile(
        resolve(backupDir, cb),
        resolve(LOCAL_DIR, 'style/css', cssFilename)
      );
    }

    // Delete the .preview.html file if it exists
    const previewPath = resolve(LOCAL_DIR, `${safePath}.preview.html`);
    try {
      await access(previewPath);
      await unlink(previewPath);
    } catch { /* preview file doesn't exist, nothing to delete */ }

    res.json({ success: true, restoredFrom: latestBackup });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Failed to restore: ${err.message}` });
  }
});

// GET /api/local/backup/list — list all available backups
router.get('/api/local/backup/list', async (req, res) => {
  const { path: filterPath } = req.query;
  const backupDir = resolve(LOCAL_DIR, '.backup');

  try {
    await access(backupDir);
    const files = await readdir(backupDir);

    let backups = [];
    for (const f of files) {
      const match = f.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+Z)_(.+)$/);
      if (!match) continue;

      const [, timestamp, filename] = match;

      // Apply optional path filter
      if (filterPath) {
        const safeFilter = filterPath.replace(/\.\./g, '').replace(/[\/\\]/g, '_');
        if (!filename.includes(safeFilter)) continue;
      }

      // Get file size
      const backupFullPath = resolve(backupDir, f);
      const fileStat = await stat(backupFullPath);

      backups.push({
        id: f,
        filename,
        timestamp,
        size: fileStat.size,
      });
    }

    // Sort by timestamp descending (newest first)
    backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    res.json({ backups });
  } catch (err) {
    // If backup dir doesn't exist, return empty list
    if (err.code === 'ENOENT') {
      return res.json({ backups: [] });
    }
    console.error(err);
    res.status(500).json({ error: `Failed to list backups: ${err.message}` });
  }
});

export default router;
