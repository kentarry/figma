/**
 * Diagnostic script: dump ALL data-figma-name values from the iframe content
 * so we can see what the actual Figma element names are.
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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Figma Element Name Diagnostic ===\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  const figmaEncoded = encodeURIComponent(FIGMA_URL);
  await page.goto(`${BASE_URL}/?figmaUrl=${figmaEncoded}`, { waitUntil: 'networkidle2', timeout: 120000 });
  
  console.log('Waiting for content...');
  await sleep(10000);
  
  const iframeHandle = await page.$('#preview-iframe');
  const frame = await iframeHandle.contentFrame();
  
  // Dump ALL data-figma-name values organized by screen
  const allNames = await frame.evaluate(() => {
    const rootEl = document.body.querySelector('[data-figma-name]');
    if (!rootEl) return { error: 'No root figma element' };
    
    const topChildren = rootEl.querySelectorAll(':scope > [data-figma-name]');
    const result = {};
    
    topChildren.forEach(topChild => {
      const screenName = topChild.getAttribute('data-figma-name');
      const descendants = topChild.querySelectorAll('[data-figma-name]');
      const names = [];
      descendants.forEach(el => {
        const name = el.getAttribute('data-figma-name');
        const rect = el.getBoundingClientRect();
        const tagName = el.tagName;
        const childCount = el.children.length;
        const hasImg = el.querySelector('img') ? true : false;
        const text = el.textContent?.trim().substring(0, 50) || '';
        names.push({
          name,
          tag: tagName,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          children: childCount,
          hasImg,
          text: text.length > 0 ? text : undefined
        });
      });
      result[screenName] = names;
    });
    
    return result;
  });
  
  // Write to file
  const outputPath = path.join(SCREENSHOTS_DIR, 'figma_elements_dump.json');
  fs.writeFileSync(outputPath, JSON.stringify(allNames, null, 2));
  console.log(`\nFull element dump saved to: ${outputPath}`);
  
  // Print summary of top-level screens
  for (const [screen, elements] of Object.entries(allNames)) {
    console.log(`\n=== Screen: "${screen}" (${elements.length} elements) ===`);
    // Print the names, filter for potentially interactive ones
    elements.forEach(el => {
      const n = el.name.toLowerCase();
      const isInteresting = n.includes('btn') || n.includes('?') || n.includes('投注') || 
                           n.includes('押注') || n.includes('+') || n.includes('-') || n === '−' ||
                           n.includes('close') || n.includes('switch') || n.includes('注意') ||
                           n.includes('說明') || n.includes('規則') || n.includes('result') ||
                           n.includes('record') || n.includes('確') || n.includes('重新') ||
                           n.includes('betall') || n.includes('reselect') || n.includes('question') ||
                           n.includes('ok') || n.includes('top_l') || n.includes('賽季') ||
                           n.includes('dropdown') || n.includes('查看') || n.includes('關閉') ||
                           n.includes('item_block') || n.includes('群組 57') || n.includes('群組 58') ||
                           n.includes('0') || n.includes('ticket') || n.includes('下注');
      if (isInteresting) {
        console.log(`  [!] "${el.name}" [${el.tag}] at (${el.x},${el.y}) ${el.w}x${el.h} children=${el.children} ${el.hasImg ? '[IMG]' : ''} ${el.text ? `"${el.text}"` : ''}`);
      }
    });
  }
  
  // Also try to print ALL names in a flat list for search
  console.log('\n\n=== ALL unique element names ===');
  const uniqueNames = new Set();
  for (const elements of Object.values(allNames)) {
    elements.forEach(el => uniqueNames.add(el.name));
  }
  const sortedNames = Array.from(uniqueNames).sort();
  sortedNames.forEach(name => console.log(`  "${name}"`));
  
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'diagnostic_screenshot.png'), fullPage: false });
  
  await browser.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
