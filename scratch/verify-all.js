import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

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

  // Handle page errors and console messages to assist debugging
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  console.log('1. Navigating to connection page...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await delay(1000);

  console.log('2. Clicking "使用本地設計稿 (ingame)"...');
  await page.click('#btn-local-demo');
  await delay(2000); // Wait for scanning and loading tree

  // Check if select view is active
  const selectViewVisible = await page.evaluate(() => {
    const el = document.getElementById('view-select');
    return el && !el.classList.contains('hidden');
  });
  console.log('Is view-select visible?', selectViewVisible);
  await page.screenshot({ path: './screenshots/01_select_view.png' });

  console.log('3. Selecting all nodes and starting conversion...');
  await page.click('#btn-select-all');
  await delay(500);
  await page.click('#btn-start-convert');
  
  console.log('Waiting for conversion to complete...');
  // Loop to check if view-editor becomes visible
  let editorVisible = false;
  for (let i = 0; i < 20; i++) {
    await delay(1000);
    editorVisible = await page.evaluate(() => {
      const el = document.getElementById('view-editor');
      return el && !el.classList.contains('hidden');
    });
    if (editorVisible) break;
  }
  console.log('Is view-editor visible?', editorVisible);
  await page.screenshot({ path: './screenshots/02_editor_view_main.png' });

  // Test Issue 3: 國家圖片左右兩側沒有顯示出來
  console.log('4. Switching screen to betting page (group stage)...');
  await page.select('#select-editor-screen', 'betpage-3');
  await delay(2000); // Wait for render and Swiper init
  await page.screenshot({ path: './screenshots/03_editor_betpage_group.png' });

  // Test Issue 2: 點選?說明沒有辦法打開活動說明
  console.log('5. Clicking ? (Question) button to open popup...');
  // The interactive elements are inside an iframe. Let's find the iframe.
  const iframeElement = await page.$('#view-editor iframe');
  const iframe = await iframeElement.contentFrame();

  if (iframe) {
    console.log('Inside editor iframe. Searching for ? (Question) button...');
    // We can evaluate inside iframe to find and click the question button
    const clickedQuestion = await iframe.evaluate(() => {
      // Find element with data-figma-name or matching patterns
      const els = Array.from(document.querySelectorAll('*'));
      const qBtn = els.find(el => {
        const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const cls = el.className || '';
        return name.includes('btn_?') || name.includes('說明') || name.includes('question') || cls.includes('btn_question') || cls.includes('btn_?');
      });
      if (qBtn) {
        qBtn.click();
        return true;
      }
      return false;
    });
    console.log('Clicked question button inside iframe?', clickedQuestion);
    await delay(1500);
    await page.screenshot({ path: './screenshots/04_clicked_question.png' });

    // Close question popup (or switch back to betpage-3)
    await page.select('#select-editor-screen', 'betpage-3');
    await delay(1000);

    // Test Issue 4: 點選重新選擇或者是確認押注會沒有功能
    // In betpage-3, try placing bets and clicking 重新選擇 or 確認押注
    console.log('6. Testing bet amount inputs and action buttons...');
    
    // First, let's look at flags and Swiper structure inside iframe
    const swiperFlagsInfo = await iframe.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        class: img.className,
        parent: img.parentElement ? img.parentElement.className : '',
        display: img.style.display,
        visible: img.offsetWidth > 0 && img.offsetHeight > 0
      }));
      return imgs.filter(img => img.src.includes('Flag') || img.class.includes('flag'));
    });
    console.log('Swiper Flags Info in iframe:', swiperFlagsInfo);

    // Try to trigger confirm/clear actions
    const actionResult = await iframe.evaluate(() => {
      // Find buttons like btn_betsure, btn_betclear or reselect
      const els = Array.from(document.querySelectorAll('*'));
      const clearBtn = els.find(el => {
        const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const cls = el.className || '';
        return name.includes('clear') || name.includes('reselect') || cls.includes('clear') || cls.includes('reselect') || name.includes('重新選擇');
      });
      const confirmBtn = els.find(el => {
        const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const cls = el.className || '';
        return name.includes('sure') || name.includes('confirm') || cls.includes('sure') || cls.includes('confirm') || name.includes('確認押注') || name.includes('ok');
      });

      return {
        hasClear: !!clearBtn,
        clearName: clearBtn ? (clearBtn.getAttribute('data-figma-name') || clearBtn.className) : null,
        hasConfirm: !!confirmBtn,
        confirmName: confirmBtn ? (confirmBtn.getAttribute('data-figma-name') || confirmBtn.className) : null,
      };
    });
    console.log('Action Buttons inside iframe:', actionResult);
  } else {
    console.log('Could not find editor iframe!');
  }

  // Close browser
  await browser.close();
}

run().catch(console.error);
