import puppeteer from 'puppeteer';

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

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message, err.stack));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await delay(1000);
  await page.type('#input-token', 'fake-token-for-disk-cache');
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

  await page.screenshot({ path: './screenshots/inspect-resolved-names.png' });
  console.log('Saved screenshot.');

  await browser.close();
}

run().catch(console.error);
