import puppeteer from 'puppeteer';
import fs from 'fs';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await delay(1000);
  await page.type('#input-token', 'fake-token');
  await page.click('#btn-save-token');
  await page.type('#input-figma-url', 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w?node-id=0-1');
  await page.click('#btn-connect');

  let editorVisible = false;
  for (let i = 0; i < 30; i++) {
    await delay(1000);
    editorVisible = await page.evaluate(() => {
      const el = document.getElementById('view-editor');
      return el && !el.classList.contains('hidden');
    });
    if (editorVisible) break;
  }

  await page.select('#select-editor-screen', 'betpage-3');
  await delay(2000);

  const iframeElement = await page.$('#view-editor iframe');
  const iframe = await iframeElement.contentFrame();

  if (iframe) {
    const domInfo = await iframe.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      return els.map(el => {
        const classVal = typeof el.className === 'string' ? el.className : '';
        const idVal = el.id || '';
        const figmaName = el.getAttribute('data-figma-name') || '';
        const tag = el.tagName.toLowerCase();
        
        // Check background image
        const computed = window.getComputedStyle(el);
        const bgImg = el.style.backgroundImage || computed.backgroundImage;
        const hasBg = bgImg && bgImg !== 'none' && bgImg !== '';
        
        if (tag === 'img' || hasBg) {
          return {
            tag,
            class: classVal,
            id: idVal,
            figmaName,
            src: el.src || '',
            bgImg: hasBg ? bgImg : '',
            display: el.style.display || computed.display || '',
            offsetWidth: el.offsetWidth,
            offsetHeight: el.offsetHeight,
          };
        }
        return null;
      }).filter(Boolean);
    });

    console.log('=== FIGMA MODE IMAGES AND BACKGROUNDS ===');
    console.log(JSON.stringify(domInfo, null, 2));

  } else {
    console.error('Iframe not found');
  }

  await browser.close();
}

run().catch(console.error);
