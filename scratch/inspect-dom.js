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

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await delay(1000);

  console.log('Entering Local Mode...');
  await page.click('#btn-local-demo');
  await delay(2000);

  console.log('Selecting all and starting convert...');
  await page.click('#btn-select-all');
  await delay(500);
  await page.click('#btn-start-convert');

  // Wait for editor
  let editorVisible = false;
  for (let i = 0; i < 20; i++) {
    await delay(1000);
    editorVisible = await page.evaluate(() => {
      const el = document.getElementById('view-editor');
      return el && !el.classList.contains('hidden');
    });
    if (editorVisible) break;
  }
  
  if (!editorVisible) {
    console.error('Editor not loaded.');
    await browser.close();
    return;
  }

  // Switch to betpage-3
  console.log('Switching screen to betpage-3...');
  await page.select('#select-editor-screen', 'betpage-3');
  await delay(2000);

  const iframeElement = await page.$('#view-editor iframe');
  const iframe = await iframeElement.contentFrame();

  if (iframe) {
    const domInfo = await iframe.evaluate(() => {
      // Find all elements with class containing 'btn' or 'bet' or 'ok' or 'clear' or 'reselect' or 'question'
      const els = Array.from(document.querySelectorAll('*'));
      return els.map(el => {
        const classVal = typeof el.className === 'string' ? el.className : '';
        const idVal = el.id || '';
        const figmaName = el.getAttribute('data-figma-name') || '';
        const tag = el.tagName.toLowerCase();
        
        // If it seems like a button or flag
        const isButton = classVal.includes('btn') || classVal.includes('bet') || classVal.includes('clear') || classVal.includes('reselect') || classVal.includes('ok') || idVal.includes('btn') || figmaName.includes('btn');
        const isFlag = classVal.includes('flag') || (el.src && el.src.includes('Flag'));
        
        if (isButton || isFlag) {
          return {
            tag,
            class: classVal,
            id: idVal,
            figmaName,
            text: el.innerText ? el.innerText.trim() : '',
            src: el.src || '',
            display: el.style.display || '',
            offsetWidth: el.offsetWidth,
            offsetHeight: el.offsetHeight,
          };
        }
        return null;
      }).filter(Boolean);
    });

    console.log('=== BUTTONS AND FLAGS IN DOM ===');
    console.log(JSON.stringify(domInfo, null, 2));

  } else {
    console.error('Iframe not found');
  }

  await browser.close();
}

run().catch(console.error);
