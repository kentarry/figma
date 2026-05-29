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

  let zipFileNames = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log('BROWSER LOG:', text);
    if (text.startsWith('[ZIP DOWNLOAD FILES]:')) {
      try {
        const rawJson = text.replace('[ZIP DOWNLOAD FILES]:', '').trim();
        zipFileNames = JSON.parse(rawJson);
      } catch (e) {
        console.log('Error parsing zip files log:', e.message, 'Raw text:', text);
      }
    }
  });
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  console.log('=== PART 1: LOCAL MODE TESTING ===');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await delay(1000);

  console.log('Entering Local Mode...');
  await page.evaluate(() => document.getElementById('btn-local-demo')?.click());
  
  await page.waitForSelector('.tree-row', { visible: true, timeout: 5000 });
  await page.evaluate(() => document.getElementById('btn-select-all')?.click());
  await delay(500);
  await page.evaluate(() => document.getElementById('btn-start-convert')?.click());

  await page.waitForSelector('#view-editor:not(.hidden)', { visible: true, timeout: 10000 });
  console.log('Local Mode editor loaded.');
  await page.screenshot({ path: './screenshots/10_local_editor_main.png' });

  const iframeElement = await page.$('#view-editor iframe');
  const iframe = await iframeElement.contentFrame();

  if (iframe) {
    // 1. Test Issue 2: ? (question) button opens description popup
    console.log('Clicking ? button...');
    const clickedQ = await iframe.evaluate(() => {
      const qBtn = document.querySelector('.btn__question');
      if (qBtn) {
        qBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    });
    console.log('Clicked ? button:', clickedQ);
    await delay(1500);
    await page.screenshot({ path: './screenshots/11_local_question_popup.png' });

    // Close question popup
    const closedQ = await iframe.evaluate(() => {
      const closeBtn = document.querySelector('.btn-close');
      if (closeBtn) {
        closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    });
    console.log('Closed popup:', closedQ);
    await delay(1000);

    // 2. Test Issue 1 & Syncing: Switch to Edit Mode in Local Mode and select an element
    console.log('Toggling Edit Mode...');
    await page.evaluate(() => document.getElementById('btn-toggle-edit')?.click());
    await delay(500);

    console.log('Selecting .btn__record in Edit Mode via direct mousedown dispatch...');
    const selectedRecord = await iframe.evaluate(() => {
      const el = document.querySelector('.btn__record');
      if (el) {
        // Dispatch mousedown to trigger selectElement in visual editor
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    });
    console.log('Dispatched mousedown to .btn__record:', selectedRecord);
    await delay(1000);
    await page.screenshot({ path: './screenshots/11b_local_edit_mode_selected.png' });

    // Verify properties panel is populated
    const propPanelHtml = await page.evaluate(() => {
      const el = document.getElementById('properties-panel');
      return el ? el.innerHTML : '';
    });
    console.log('Is properties-panel populated with selected element CSS?', propPanelHtml.includes('btn__record') || propPanelHtml.includes('position'));

    // Switch back to Browse mode
    await page.evaluate(() => document.getElementById('btn-toggle-edit')?.click());
    await delay(500);

    // Switch to betpage-3 (分組賽)
    console.log('Switching to betpage-3 (分組賽)...');
    await page.select('#select-editor-screen', 'betpage-3');
    await delay(2500);
    await page.screenshot({ path: './screenshots/12_local_betpage_group.png' });

    // 3. Test Issue 3: Verify flag images style
    const flagImages = await iframe.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.betbox__nation img'));
      return imgs.map(img => {
        const style = window.getComputedStyle(img);
        return {
          src: img.src,
          display: style.display,
          width: img.offsetWidth,
          height: img.offsetHeight
        };
      });
    });
    console.log('Local Mode Flag Images (first 4):', flagImages.slice(0, 4));

    // 4. Test Issue 4: Input bet and Clear/Confirm
    console.log('Entering bet value...');
    await iframe.evaluate(() => {
      const input = document.querySelector('.betNum');
      if (input) {
        input.value = '500';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await delay(500);
    await page.screenshot({ path: './screenshots/13_local_bet_entered.png' });

    console.log('Clicking 重新選擇 (Clear)...');
    await iframe.evaluate(() => {
      const clearBtn = document.querySelector('.btn_betClear');
      if (clearBtn) clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await delay(500);
    const clearedVal = await iframe.evaluate(() => document.querySelector('.betNum')?.value);
    console.log('Value after clear:', clearedVal);
    await page.screenshot({ path: './screenshots/14_local_bet_cleared.png' });

    console.log('Entering bet again and confirming...');
    await iframe.evaluate(() => {
      const input = document.querySelector('.betNum');
      if (input) {
        input.value = '777';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await delay(500);
    await iframe.evaluate(() => {
      const confirmBtn = document.querySelector('.btn_betSure');
      if (confirmBtn) confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await delay(1500);
    const screenAfterConfirm = await page.evaluate(() => document.getElementById('select-editor-screen').value);
    console.log('Screen after confirm bet:', screenAfterConfirm);
    await page.screenshot({ path: './screenshots/15_local_after_confirm.png' });
  }

  console.log('=== PART 2: FIGMA MODE TESTING ===');
  console.log('Returning to connect view...');
  await page.evaluate(() => document.getElementById('btn-back-to-select')?.click());
  await delay(500);
  await page.evaluate(() => document.getElementById('btn-back-connect')?.click());
  await delay(1000);

  console.log('Loading Figma project via cached URL with nodeId (one-click)...');
  await page.type('#input-token', 'fake-token-for-cache');
  await page.click('#btn-save-token');
  await page.type('#input-figma-url', 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w/w201335--Copy---Copy---Copy-?node-id=0-1&p=f&t=vEVsqp3gZiaTtIpU-0');
  await page.evaluate(() => document.getElementById('btn-connect')?.click());

  // Wait for Editor to load
  await page.waitForSelector('#view-editor:not(.hidden)', { visible: true, timeout: 15000 });
  console.log('Figma Mode editor loaded.');
  await page.screenshot({ path: './screenshots/16_figma_editor_main.png' });

  // 5. Test Issue 1 in Figma Mode (Edit Mode toggling and selecting)
  console.log('Toggling Edit Mode in Figma Mode...');
  await page.evaluate(() => document.getElementById('btn-toggle-edit')?.click());
  await delay(500);

  const figmaIframeElement = await page.$('#view-editor iframe');
  const figmaIframe = await figmaIframeElement.contentFrame();
  
  if (figmaIframe) {
    console.log('Selecting element inside figma iframe...');
    const clickedElement = await figmaIframe.evaluate(() => {
      const el = document.querySelector('[data-figma-name*="投注"]') || document.querySelector('[data-figma-name*="說明"]') || document.querySelector('[data-figma-name]');
      if (el) {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        return el.getAttribute('data-figma-name');
      }
      return null;
    });
    console.log('Figma element clicked:', clickedElement);
    await delay(1000);
    await page.screenshot({ path: './screenshots/17_figma_edit_mode_selected.png' });

    // Verify properties panel is populated
    const propPanelHtml = await page.evaluate(() => document.getElementById('properties-panel')?.innerHTML || '');
    console.log('Is properties-panel populated for figma element?', propPanelHtml.includes('Position') || propPanelHtml.includes('position') || propPanelHtml.includes('width'));

    // Switch back to Browse mode
    await page.evaluate(() => document.getElementById('btn-toggle-edit')?.click());
    await delay(500);

    // 6. Test Issue 5: Click Download ZIP and check file list output via browser log
    console.log('Clicking Download ZIP button...');
    await page.evaluate(() => document.getElementById('btn-download-zip')?.click());
    
    // Wait up to 25 seconds for download success or error toast
    console.log('Waiting for ZIP download completion toast...');
    let downloadDone = false;
    for (let i = 0; i < 25; i++) {
      await delay(1000);
      downloadDone = await page.evaluate(() => {
        const toast = document.querySelector('.toast-success, .toast-error');
        return !!toast;
      });
      if (downloadDone) break;
    }

    await delay(1000); // minor buffer
    console.log('ZIP File Names Compiled:', zipFileNames);
    const hasCorrectFigmaImageNames = zipFileNames.some(name => name.includes('btn_ok') || name.includes('btn_question') || name.includes('Flag') || name.includes('說明'));
    console.log('Does ZIP contain mapped Figma-name files?', hasCorrectFigmaImageNames);
  }

  await browser.close();
  console.log('=== VERIFICATION COMPLETED ===');
}

run().catch(console.error);
