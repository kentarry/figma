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

  console.log('Setting token...');
  await page.type('#input-token', 'test_token_figd');
  await page.click('#btn-save-token');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Inputting Figma URL...');
  await page.type('#input-figma-url', 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w/w201335--Copy---Copy---Copy-?node-id=0-1&p=f&t=vEVsqp3gZiaTtIpU-0');
  await new Promise(r => setTimeout(r, 500));

  console.log('Connecting to Figma file...');
  await page.click('#btn-connect');

  console.log('Waiting for connection conversion steps and editor view...');
  await page.waitForSelector('#preview-iframe', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 6000)); // Let iframe, Swiper, and device zoom settle

  console.log('Checking edit mode...');
  const editModeText = await page.$eval('#edit-mode-label', el => el.textContent);
  if (editModeText.includes('編輯')) {
    console.log('Toggling to browse mode...');
    await page.click('#btn-toggle-edit');
    await new Promise(r => setTimeout(r, 1000));
  }

  // Get the iframe
  const iframeElement = await page.$('#preview-iframe');
  const frame = await iframeElement.contentFrame();
  if (!frame) {
    throw new Error('Could not get iframe frame!');
  }

  console.log('Taking screenshot of the Figma Mode Main Page (group stage)...');
  const screenshotDir = './screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }
  const mainPagePath = path.join(screenshotDir, 'figma_main_page_group_stage.png');
  await page.screenshot({ path: mainPagePath });
  console.log(`Figma Main page screenshot saved to ${mainPagePath}`);

  console.log('Clicking the "投注" button to trigger transition in Figma Mode...');
  // Find and click the betting button layer inside the iframe
  await frame.evaluate(() => {
    // Look for elements containing "投注" or "betbtn" or matching our interactive patterns
    const allElements = Array.from(document.querySelectorAll('*'));
    const betBtn = allElements.find(el => {
      const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
      const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
      const id = (el.id || '').toLowerCase();
      const identifier = `${name}|${cls}|${id}`;
      return identifier.includes('投注') || identifier.includes('betbtn') || identifier.includes('betbox__betbtn');
    });
    if (betBtn) {
      betBtn.click();
    } else {
      throw new Error('Bet button not found in Figma Mode iframe DOM!');
    }
  });
  console.log('Clicked bet button.');

  await new Promise(r => setTimeout(r, 2000)); // Wait for screen transition in editor

  console.log('Taking screenshot of the Figma Mode Betting Popup...');
  const popupPath = path.join(screenshotDir, 'figma_betting_popup.png');
  await page.screenshot({ path: popupPath });
  console.log(`Figma Popup screenshot saved to ${popupPath}`);

  await browser.close();
}

run().catch(err => {
  console.error('Error running figma screenshot script:', err);
  process.exit(1);
});
