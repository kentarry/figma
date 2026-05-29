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

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  console.log('1. Navigating to connection page...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await delay(1000);

  console.log('2. Entering Token and Figma URL (no node ID)...');
  await page.type('#input-token', 'fake-token-for-disk-cache');
  await page.click('#btn-save-token');
  await delay(500);

  // Use the cached fileKey without node ID to load all screens
  await page.type('#input-figma-url', 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w');
  await delay(500);

  console.log('3. Clicking Connect to Figma...');
  await page.click('#btn-connect');

  console.log('Waiting for select view...');
  let selectViewVisible = false;
  for (let i = 0; i < 15; i++) {
    await delay(1000);
    selectViewVisible = await page.evaluate(() => {
      const el = document.getElementById('view-select');
      return el && !el.classList.contains('hidden');
    });
    if (selectViewVisible) break;
  }
  console.log('Is select view visible?', selectViewVisible);
  await page.screenshot({ path: './screenshots/07_figma_select_view.png' });

  console.log('4. Selecting all nodes and starting convert...');
  await page.click('#btn-select-all');
  await delay(500);
  await page.click('#btn-start-convert');

  console.log('Waiting for editor view...');
  let editorVisible = false;
  for (let i = 0; i < 30; i++) {
    await delay(1000);
    editorVisible = await page.evaluate(() => {
      const el = document.getElementById('view-editor');
      return el && !el.classList.contains('hidden');
    });
    if (editorVisible) break;
  }
  console.log('Is editor view visible?', editorVisible);

  if (!editorVisible) {
    console.error('Failed to load Figma project into editor.');
    await page.screenshot({ path: './screenshots/figma_all_error.png' });
    await browser.close();
    return;
  }

  // Print all options
  const options = await page.evaluate(() => {
    const select = document.getElementById('select-editor-screen');
    return Array.from(select.options).map(o => ({ value: o.value, text: o.textContent }));
  });
  console.log('Figma Mode Screens Available:', options);

  // Find betting screen (投注畫面1)
  const betpageValue = options.find(o => o.value.includes('投注畫面1') || o.value.includes('bet1'))?.value;
  console.log('Resolved bet screen option value:', betpageValue);
  
  if (betpageValue) {
    await page.select('#select-editor-screen', betpageValue);
    await delay(3000); // Wait for render and images to load
    await page.screenshot({ path: './screenshots/08_figma_all_betpage.png' });
    console.log('Saved 08_figma_all_betpage.png');
  }

  // Check flag images inside iframe
  const iframeElement = await page.$('#view-editor iframe');
  const iframe = await iframeElement.contentFrame();
  if (iframe) {
    const imagesInfo = await iframe.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      return els.map(el => {
        const tag = el.tagName.toLowerCase();
        const figmaName = el.getAttribute('data-figma-name') || '';
        const classVal = typeof el.className === 'string' ? el.className : '';
        const computed = window.getComputedStyle(el);
        const bgImg = el.style.backgroundImage || computed.backgroundImage;
        const hasBg = bgImg && bgImg !== 'none' && bgImg !== '';

        if (tag === 'img' || hasBg) {
          return {
            tag,
            figmaName,
            class: classVal,
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
    console.log('=== FIGMA ALL MODE IMAGES/BACKGROUNDS ===');
    console.log(JSON.stringify(imagesInfo.filter(img => img.figmaName.includes('Flag') || img.src.includes('Flag') || img.bgImg.includes('Flag') || img.figmaName.includes('國')), null, 2));
  }

  await browser.close();
}

run().catch(console.error);
