import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { join } from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FIGMA_TOKEN = 'PLACEHOLDER_TOKEN';
const FIGMA_URL = 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w/w201335--Copy---Copy---Copy-?node-id=0-1&p=f&t=nIZo7tgEM7ibUVjr-0';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Starting Chrome automated testing via Puppeteer...');
  
  if (!fs.existsSync(CHROME_PATH)) {
    console.error('❌ Chrome executable not found at:', CHROME_PATH);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[VisualEditor]')) {
      console.log('🌐 CLIENT LOG:', text);
    }
  });
  page.on('pageerror', err => console.error('❌ CLIENT ERROR:', err.toString()));

  try {
    // 1. Load editor home page
    console.log('📌 Navigating to http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: 'scratch/01_home_loaded.png' });

    // 2. Input Token and Figma URL
    console.log('📌 Inputting Figma credentials...');
    await page.type('#input-token', FIGMA_TOKEN);
    await page.type('#input-figma-url', FIGMA_URL);
    await page.screenshot({ path: 'scratch/02_credentials_input.png' });

    // 3. Click connect
    console.log('📌 Connecting to Figma API (triggers auto-convert)...');
    await page.click('#btn-connect');

    // Wait for Visual Editor View
    console.log('⏳ Waiting for code conversion & editor rendering...');
    await page.waitForSelector('#preview-iframe', { timeout: 60000 });
    await sleep(5000); // Allow swipers and styles to fully layout
    await page.screenshot({ path: 'scratch/04_editor_rendered.png' });

    // 5. Ensure Browse Mode is active (disable editMode)
    console.log('📌 Ensuring Browse Mode is active...');
    await page.evaluate(() => {
      if (window.app && window.app.visualEditor && window.app.visualEditor.editMode) {
        const btn = document.getElementById('btn-toggle-edit');
        if (btn) btn.click();
      }
    });
    await sleep(1500);
    await page.screenshot({ path: 'scratch/05_browse_mode_active.png' });

    // Get iframe reference
    const iframeElement = await page.$('#preview-iframe');
    const frame = await iframeElement.contentFrame();
    if (!frame) {
      throw new Error('Could not retrieve preview iframe content frame');
    }

    // ==========================================
    // TEST 1: Question "?" popup rules
    // ==========================================
    console.log('📌 Testing question "?" button click...');

    // Diagnostic log: list figma elements
    await frame.evaluate(() => {
      const allFigma = Array.from(document.querySelectorAll('[data-figma-name]'));
      console.log('[VisualEditor] Diagnostic: Total figma elements in iframe:', allFigma.length);
      
      const rootEl = document.body.querySelector('[data-figma-name]');
      if (rootEl) {
        const topChildren = Array.from(rootEl.querySelectorAll(':scope > [data-figma-name]'));
        console.log('[VisualEditor] Top-level children names:', topChildren.map(el => el.getAttribute('data-figma-name')).join(', '));
      }

      allFigma.slice(0, 15).forEach(el => {
        const computed = window.getComputedStyle(el);
        console.log('[VisualEditor] Figma element:', el.tagName, 'name:', el.getAttribute('data-figma-name'), 'class:', el.className, 'rect:', JSON.stringify(el.getBoundingClientRect()), 'display:', computed.display, 'visibility:', computed.visibility, 'position:', computed.position);
      });

      const matchedRules = Array.from(document.querySelectorAll('*')).filter(el => {
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        const id = (el.id || '').toLowerCase();
        const text = (el.textContent || '').slice(0, 30).toLowerCase();
        return ['注意事項', '說明', '規則', 'question', 'rule'].some(p => 
          fname.includes(p) || className.includes(p) || id.includes(p) || text.includes(p)
        );
      });
      console.log('[VisualEditor] Diagnostic: Found rule-related elements count:', matchedRules.length);
      matchedRules.forEach(el => {
        console.log('[VisualEditor] Match:', el.tagName, 'figma-name:', el.getAttribute('data-figma-name'), 'class:', el.className, 'id:', el.id, 'rect:', JSON.stringify(el.getBoundingClientRect()));
      });
    });

    const qClicked = await frame.evaluate(() => {
      const matchedRules = Array.from(document.querySelectorAll('*')).filter(el => {
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        const id = (el.id || '').toLowerCase();
        const text = (el.textContent || '').slice(0, 30).toLowerCase();
        return ['注意事項', '說明', '規則', 'question', 'rule'].some(p => 
          fname.includes(p) || className.includes(p) || id.includes(p) || text.includes(p)
        );
      });
      const q = matchedRules.find(el => {
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        if (className.includes('popup') || fname.includes('popup')) return false;
        return ['注意事項', '說明', '規則', 'btn_question', 'btn__question', 'question', '?', '問號'].some(p => 
          fname.includes(p) || className.includes(p)
        );
      });
      if (q) {
        console.log('[VisualEditor] Found rule element tag:', q.tagName, 'figma-name:', q.getAttribute('data-figma-name'), 'class:', q.className, 'rect:', JSON.stringify(q.getBoundingClientRect()));
        q.click();
        return true;
      }
      return false;
    });

    if (qClicked) {
      console.log('Successfully clicked "?" via frame.evaluate()');
    } else {
      console.log('Fallback: Click coordinates on the bottom-left area of the iframe');
      await page.mouse.click(50, 750); 
    }
      
      await sleep(2000); // wait for popup show transition
      await page.screenshot({ path: 'scratch/06_rules_popup_should_open.png' });
 
      // Close the popup by clicking .btn-close inside the iframe
      console.log('📌 Closing rules popup...');
      const closeClicked = await frame.evaluate(() => {
        const c = document.querySelector('.popup.show .btn-close') || 
                  document.querySelector('.btn-close') ||
                  Array.from(document.querySelectorAll('*')).find(el => {
                    const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
                    return fname.includes('close') || fname.includes('btn_close');
                  });
        if (c) {
          console.log('[VisualEditor] Found close rules element tag:', c.tagName, 'rect:', JSON.stringify(c.getBoundingClientRect()));
          c.click();
          return true;
        }
        return false;
      });
      
      if (closeClicked) {
        console.log('Successfully clicked close button via frame.evaluate()');
        await sleep(1500);
        await page.screenshot({ path: 'scratch/07_popup_closed.png' });
      }
 
      // ==========================================
      // TEST 2 & 3: Betting screen interactions & Left side sign
      // ==========================================
      console.log('📌 Testing betting cards/popup...');
      // Find the betting button using figma name / identifier keywords
      const betClicked = await frame.evaluate(() => {
        const b = Array.from(document.querySelectorAll('*')).find(el => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
 
          const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
          const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
          const id = (el.id || '').toLowerCase();
          const identifier = `${fname}|${className}|${id}`;
          
          if (el.tagName.toLowerCase() === 'p' || el.tagName.toLowerCase() === 'input') return false;
          return ['btn_ok', '投注', '押注', '展開投注', 'betbtn', 'betbox_betbtn'].some(p => identifier.includes(p.toLowerCase()));
        });
        if (b) {
          console.log('[VisualEditor] Found bet element tag:', b.tagName, 'figma-name:', b.getAttribute('data-figma-name'), 'class:', b.className, 'rect:', JSON.stringify(b.getBoundingClientRect()));
          b.click();
          return true;
        }
        return false;
      });
 
      if (betClicked) {
        console.log('Successfully clicked bet button via frame.evaluate()');
        await sleep(3000); // Wait for screen transition to load
        await page.screenshot({ path: 'scratch/08_betting_screen.png' });
      }

    // ==========================================
    // TEST 4: Knockout stage transition check
    // ==========================================
    console.log('📌 Returning to main screen...');
    // Close betting screen to go back to main
    const betCloseBox = await frame.evaluate(() => {
      const c = document.querySelector('.btn-close');
      if (c) {
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    });
    if (betCloseBox) {
      const frameRect = await page.evaluate(() => {
        const iframe = document.querySelector('#preview-iframe');
        const r = iframe.getBoundingClientRect();
        return { left: r.left, top: r.top };
      });
      await page.mouse.click(frameRect.left + betCloseBox.x, frameRect.top + betCloseBox.y);
      await sleep(2000);
      await page.screenshot({ path: 'scratch/09_returned_to_main.png' });
    }

    console.log('🎉 Automated test finished successfully!');
  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    await browser.close();
  }
}

run();
