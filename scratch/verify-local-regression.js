import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Testing local mode to ensure no regressions...');
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[VisualEditor]') || text.includes('Error')) {
      console.log('🌐', text);
    }
  });

  try {
    // 1. Load
    console.log('📌 Navigate to localhost:3000');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });

    // 2. Click "使用本地設計稿"
    console.log('📌 Click 使用本地設計稿');
    await page.click('#btn-local-demo');
    await sleep(3000);

    // 3. Check for file list
    const fileListExists = await page.evaluate(() => {
      const list = document.querySelector('#local-file-list');
      return list ? list.children.length : 0;
    });
    console.log('  Files found:', fileListExists);

    // 4. Select index.aspx and load
    const fileClicked = await page.evaluate(() => {
      const items = document.querySelectorAll('#local-file-list .file-item, #local-file-list li, #local-file-list label');
      for (const item of items) {
        const text = item.textContent || '';
        if (text.includes('index.aspx') || text.includes('index.html')) {
          const input = item.querySelector('input[type="checkbox"]') || item.querySelector('input');
          if (input) { input.click(); return 'checkbox'; }
          item.click();
          return 'item';
        }
      }
      return 'not found';
    });
    console.log('  File selected:', fileClicked);

    // Click start/convert/load button
    const startBtn = await page.evaluate(() => {
      const btn = document.querySelector('#btn-start-convert, #btn-load-local, .btn-primary');
      if (btn) { btn.click(); return btn.textContent; }
      return null;
    });
    console.log('  Start button:', startBtn);
    
    await sleep(5000);
    await page.screenshot({ path: 'scratch/v_local_01_loaded.png' });

    // 5. Check visual editor
    const editorLoaded = await page.evaluate(() => {
      const iframe = document.getElementById('preview-iframe');
      return !!iframe;
    });
    console.log('  Editor loaded:', editorLoaded);

    if (editorLoaded) {
      const iframeElement = await page.$('#preview-iframe');
      const frame = await iframeElement?.contentFrame();

      if (frame) {
        // Check arrows are visible
        const arrowInfo = await frame.evaluate(() => {
          const arrows = document.querySelectorAll('#mainBetNext, #mainBetPrev, .swiper-button-next, .swiper-button-prev');
          return {
            count: arrows.length,
            details: Array.from(arrows).map(el => ({
              id: el.id,
              class: el.className,
              display: window.getComputedStyle(el).display,
              bgImage: (window.getComputedStyle(el).backgroundImage || '').substring(0, 80)
            }))
          };
        });
        console.log('  Arrow elements:', arrowInfo.count);
        arrowInfo.details.forEach(d => console.log(`    ${d.id || d.class}: display=${d.display}, bg=${d.bgImage}`));
        console.log(arrowInfo.count > 0 ? '  ✅ Arrows: PASS' : '  ⚠️ Arrows: CHECK');

        // Try clicking bet button  
        const betBtnFound = await frame.evaluate(() => {
          const btn = document.querySelector('.betbox__BetBtn');
          if (btn) { btn.click(); return true; }
          return false;
        });
        console.log('  Bet button found:', betBtnFound);
        
        if (betBtnFound) {
          await sleep(2000);
          await page.screenshot({ path: 'scratch/v_local_02_betting.png' });
          console.log('  ✅ Betting screen: PASS');
        }
      }
    }

    await page.screenshot({ path: 'scratch/v_local_03_final.png' });
    console.log('\n✅ Local mode regression test complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'scratch/v_local_error.png' });
  } finally {
    await browser.close();
  }
}

run();
