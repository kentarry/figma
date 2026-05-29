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

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Create screenshots directory if it doesn't exist
  if (!fs.existsSync('./screenshots')) {
    fs.mkdirSync('./screenshots');
  }

  // Capture the connection page
  await page.screenshot({ path: './screenshots/00_connect_page.png' });
  console.log('Saved 00_connect_page.png');

  // Let's check if we can switch to local mode or if we need to click something
  // In the connection page, is there a Local Mode option or local files preview?
  // Let's inspect the page title and body text
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body Text Snippet:', bodyText.substring(0, 500));

  await browser.close();
}

run().catch(console.error);
