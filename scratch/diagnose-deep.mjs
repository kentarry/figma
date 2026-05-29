/**
 * Deep diagnostic: dump ALL elements (including hidden) for each screen, with full tree structure
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');
const BASE_URL = 'http://localhost:3000';
const FIGMA_URL = 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w/w201335--Copy---Copy---Copy-?node-id=0-1&p=f&t=nIZo7tgEM7ibUVjr-0';
const TOKEN = 'figd_cached_test_token';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Deep Element Diagnostic ===\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);
  
  await page.type('#input-token', TOKEN);
  const saveBtn = await page.$('#btn-save-token');
  if (saveBtn) await saveBtn.click();
  await sleep(500);
  await page.type('#input-figma-url', FIGMA_URL);
  await sleep(500);
  await page.click('#btn-connect');
  
  // Wait for editor
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const ready = await page.evaluate(() => !!(window.app?.visualEditor?.isFigmaMode === true));
    if (ready) { console.log(`Editor ready after ${(i+1)*2}s`); break; }
  }
  await sleep(3000);
  
  const iframeHandle = await page.$('#preview-iframe');
  const frame = await iframeHandle.contentFrame();
  
  // Switch to bet1 screen to see all its elements
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.bet1);
  });
  await sleep(2000);
  
  // Dump COMPLETE element tree for the visible betting screen
  const bet1Tree = await frame.evaluate(() => {
    function dumpTree(el, depth = 0) {
      const name = el.getAttribute('data-figma-name');
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toString().substring(0, 60);
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 
        ? el.textContent.trim().substring(0, 30) : '';
      const imgSrc = tag === 'img' ? (el.src || '').split('/').pop().substring(0, 60) : '';
      const w = Math.round(parseFloat(el.style.width) || 0);
      const h = Math.round(parseFloat(el.style.height) || 0);
      
      const node = {
        depth,
        tag,
        name: name || undefined,
        cls: cls || undefined,
        text: text || undefined,
        imgSrc: imgSrc || undefined,
        rectW: Math.round(rect.width),
        rectH: Math.round(rect.height),
        rectX: Math.round(rect.x),
        rectY: Math.round(rect.y),
        styleW: w || undefined,
        styleH: h || undefined,
        display: style.display,
        pointerEvents: style.pointerEvents,
      };
      
      const children = [];
      for (const child of el.children) {
        children.push(dumpTree(child, depth + 1));
      }
      if (children.length > 0) node.children = children;
      return node;
    }
    
    // Find the visible bet1 screen
    const betScreen = document.querySelector('[data-figma-name*="投注畫面1"]');
    if (!betScreen || betScreen.style.display === 'none') {
      return { error: 'bet1 not visible' };
    }
    
    return dumpTree(betScreen);
  });
  
  const outputPath = path.join(SCREENSHOTS_DIR, 'bet1_full_tree.json');
  fs.writeFileSync(outputPath, JSON.stringify(bet1Tree, null, 2));
  console.log(`Bet1 tree saved to: ${outputPath}`);
  
  // Also dump all elements with their img src for the main screen
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.main);
  });
  await sleep(2000);
  
  const mainTree = await frame.evaluate(() => {
    function dumpTree(el, depth = 0) {
      const name = el.getAttribute('data-figma-name');
      const tag = el.tagName.toLowerCase();
      const rect = el.getBoundingClientRect();
      const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 
        ? el.textContent.trim().substring(0, 30) : '';
      const imgSrc = tag === 'img' ? (el.src || '').split('/').pop().substring(0, 60) : '';
      
      const node = {
        depth, tag, 
        name: name || undefined,
        text: text || undefined,
        imgSrc: imgSrc || undefined,
        rectW: Math.round(rect.width),
        rectH: Math.round(rect.height),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
      };
      
      const children = [];
      for (const child of el.children) {
        children.push(dumpTree(child, depth + 1));
      }
      if (children.length > 0) node.children = children;
      return node;
    }
    
    const mainScreen = document.querySelector('[data-figma-name*="主畫面"]');
    if (!mainScreen) return { error: 'main not found' };
    return dumpTree(mainScreen);
  });
  
  const mainPath = path.join(SCREENSHOTS_DIR, 'main_full_tree.json');
  fs.writeFileSync(mainPath, JSON.stringify(mainTree, null, 2));
  console.log(`Main tree saved to: ${mainPath}`);
  
  // Print specifically the "下方__按鈕" element and its context
  const bottomBtnInfo = await frame.evaluate(() => {
    const el = document.querySelector('[data-figma-name="下方__按鈕"]');
    if (!el) return { found: false };
    
    const rect = el.getBoundingClientRect();
    const imgs = el.querySelectorAll('img');
    const imgSrcs = Array.from(imgs).map(img => img.src.split('/').pop());
    
    return {
      found: true,
      x: rect.x, y: rect.y, w: rect.width, h: rect.height,
      pointerEvents: window.getComputedStyle(el).pointerEvents,
      zIndex: window.getComputedStyle(el).zIndex,
      hasDirectHandler: !!el._directHandler,
      imgSrcs,
      parentName: el.parentElement?.getAttribute('data-figma-name'),
      innerHTML: el.innerHTML.substring(0, 300)
    };
  });
  console.log('\n下方__按鈕 info:', JSON.stringify(bottomBtnInfo, null, 2));
  
  // Look for any elements that could be the "?" or "活動說明" button
  const possibleQuestionBtns = await frame.evaluate(() => {
    const results = [];
    document.querySelectorAll('[data-figma-name]').forEach(el => {
      const name = el.getAttribute('data-figma-name') || '';
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Check for small clickable elements (buttons are typically small)
        if (rect.width < 150 && rect.height < 150 && rect.width > 20 && rect.height > 20) {
          const imgs = Array.from(el.querySelectorAll('img')).map(img => img.src.split('/').pop().substring(0, 50));
          results.push({
            name,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            imgs,
            pointerEvents: window.getComputedStyle(el).pointerEvents,
            directHandler: !!el._directHandler
          });
        }
      }
    });
    return results;
  });
  
  console.log(`\nAll small interactive elements (possible buttons):`);
  possibleQuestionBtns.forEach(el => {
    console.log(`  "${el.name}" at (${el.x},${el.y}) ${el.w}x${el.h} pointer=${el.pointerEvents} handler=${el.directHandler} imgs=[${el.imgs}]`);
  });
  
  await browser.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
