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

  console.log('2. Entering Token and Figma URL...');
  await page.type('#input-token', 'fake-token-for-disk-cache');
  await page.click('#btn-save-token');
  await delay(500);

  // Use the cached fileKey and node-id
  await page.type('#input-figma-url', 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w?node-id=0-1');
  await delay(500);

  console.log('3. Clicking Connect/Auto-convert...');
  await page.click('#btn-connect');

  console.log('Waiting for import/slicing to complete...');
  let editorVisible = false;
  for (let i = 0; i < 30; i++) {
    await delay(1000);
    editorVisible = await page.evaluate(() => {
      const el = document.getElementById('view-editor');
      return el && !el.classList.contains('hidden');
    });
    if (editorVisible) break;
  }

  console.log('Is view-editor visible?', editorVisible);
  if (!editorVisible) {
    console.error('Failed to load Figma project.');
    await page.screenshot({ path: './screenshots/figma_error.png' });
    await browser.close();
    return;
  }

  await page.screenshot({ path: './screenshots/05_figma_editor_main.png' });
  console.log('Saved 05_figma_editor_main.png');

  // Switch to betpage-3 in Figma mode (which corresponds to 投注畫面1 frame)
  console.log('4. Finding and switching to betting screen in Figma mode...');
  const betpageValue = await page.evaluate(() => {
    const select = document.getElementById('select-editor-screen');
    const opt = Array.from(select.options).find(o => o.value.includes('投注畫面1') || o.value.includes('bet1'));
    return opt ? opt.value : null;
  });
  console.log('Resolved bet screen option value:', betpageValue);
  
  if (betpageValue) {
    await page.select('#select-editor-screen', betpageValue);
    await delay(3000); // Wait longer for Swiper and images to render
    await page.screenshot({ path: './screenshots/06_figma_betpage_group.png' });
    console.log('Saved 06_figma_betpage_group.png');
  }

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
    console.log('=== IMAGES/BACKGROUNDS IN FIGMA BETTING SCREEN ===');
    console.log(JSON.stringify(imagesInfo.slice(0, 15), null, 2)); // Log first 15 images
  }

  await browser.close();
}

run().catch(console.error);
