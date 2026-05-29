import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  console.log('Clicking local demo button...');
  await page.click('#btn-local-demo');
  
  console.log('Waiting for tree view rows...');
  await page.waitForSelector('.tree-row', { timeout: 10000 });
  
  console.log('Selecting index.aspx checkbox...');
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.tree-row'));
    const indexRow = rows.find(r => r.querySelector('.tree-name')?.textContent.includes('index.aspx'));
    if (indexRow) {
      indexRow.querySelector('.node-checkbox')?.click();
    }
  });

  console.log('Waiting for start convert button to be enabled...');
  await page.waitForSelector('#btn-start-convert:not([disabled])', { timeout: 10000 });
  
  console.log('Clicking start convert...');
  await page.evaluate(() => document.getElementById('btn-start-convert').click());
  
  console.log('Waiting for editor view...');
  await page.waitForSelector('#preview-iframe', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000)); // Let iframe settle

  console.log('Checking edit mode...');
  // Check if edit mode is active, toggle to browse mode if so
  const editModeText = await page.$eval('#edit-mode-label', el => el.textContent);
  if (editModeText.includes('編輯')) {
    console.log('Toggling to browse mode...');
    await page.click('#btn-toggle-edit');
    await new Promise(r => setTimeout(r, 500));
  }

  // Get the iframe
  const iframeElement = await page.$('#preview-iframe');
  const frame = await iframeElement.contentFrame();
  if (!frame) {
    throw new Error('Could not get iframe frame!');
  }

  console.log('Taking screenshot of the main page (group stage)...');
  const screenshotDir = './screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }
  const mainPagePath = path.join(screenshotDir, 'main_page_group_stage.png');
  await page.screenshot({ path: mainPagePath });
  console.log(`Main page screenshot saved to ${mainPagePath}`);

  console.log('Locating betting buttons in iframe...');
  await frame.waitForSelector('.betbox__BetBtn', { timeout: 5000 });
  
  console.log('Clicking group stage card betting button (active card)...');
  await frame.evaluate(() => {
    const btn = document.querySelector('.swiper-slide-active .betbox__BetBtn') || document.querySelector('.betbox__BetBtn');
    if (btn) {
      btn.click();
    } else {
      throw new Error('Bet button not found in iframe DOM!');
    }
  });
  console.log('Clicked betting button.');

  await new Promise(r => setTimeout(r, 1000)); // Wait for popup transition

  console.log('Taking screenshot of the betting popup...');
  const popupPath = path.join(screenshotDir, 'betting_popup.png');
  await page.screenshot({ path: popupPath });
  console.log(`Popup screenshot saved to ${popupPath}`);

  await browser.close();
}

run().catch(err => {
  console.error('Error running screenshot script:', err);
  process.exit(1);
});
