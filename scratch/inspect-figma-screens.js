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

  const options = await page.evaluate(() => {
    const select = document.getElementById('select-editor-screen');
    return Array.from(select.options).map(o => ({
      value: o.value,
      text: o.textContent,
      disabled: o.disabled
    }));
  });

  console.log('=== FIGMA MODE SCREEN OPTIONS ===');
  console.log(options);

  await browser.close();
}

run().catch(console.error);
