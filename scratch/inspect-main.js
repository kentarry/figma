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
  await page.click('#btn-local-demo');
  await delay(2000);
  await page.click('#btn-select-all');
  await delay(500);
  await page.click('#btn-start-convert');

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

  // Switch to main screen
  await page.select('#select-editor-screen', 'main');
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
        
        const isQuestionOrButton = classVal.includes('btn') || classVal.includes('question') || classVal.includes('rule') || idVal.includes('btn') || figmaName.includes('btn');
        if (isQuestionOrButton) {
          return {
            tag,
            class: classVal,
            id: idVal,
            figmaName,
            text: el.innerText ? el.innerText.trim() : '',
            display: el.style.display || '',
            offsetWidth: el.offsetWidth,
            offsetHeight: el.offsetHeight,
          };
        }
        return null;
      }).filter(Boolean);
    });

    console.log('=== MAIN SCREEN BUTTONS ===');
    console.log(JSON.stringify(domInfo, null, 2));

  } else {
    console.error('Iframe not found');
  }

  await browser.close();
}

run().catch(console.error);
