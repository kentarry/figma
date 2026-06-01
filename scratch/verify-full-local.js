import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Full local mode verification...');
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[VisualEditor]') || text.includes('Error') || text.includes('Swiper')) {
      console.log('🌐', text);
    }
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Click local mode
    await page.click('#btn-local-demo');
    await sleep(2000);

    // Select index.aspx checkbox
    const selected = await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const label = cb.closest('label, li, .file-item, tr, div');
        if (label && (label.textContent || '').includes('index.aspx')) {
          cb.click();
          return true;
        }
      }
      return false;
    });
    console.log('index.aspx selected:', selected);
    await sleep(500);

    // Click 開始轉換
    const startClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if ((btn.textContent || '').includes('開始轉換') || (btn.textContent || '').includes('開始') || btn.id === 'btn-start-convert') {
          btn.click();
          return btn.textContent.trim();
        }
      }
      return null;
    });
    console.log('Start button:', startClicked);
    
    // Wait for editor to load
    console.log('⏳ Waiting for visual editor...');
    await page.waitForSelector('#preview-iframe', { timeout: 30000 });
    await sleep(5000);
    
    await page.screenshot({ path: 'scratch/v_full_01_editor.png' });

    const iframeElement = await page.$('#preview-iframe');
    const frame = await iframeElement?.contentFrame();
    
    if (frame) {
      // Check arrow visibility 
      const arrows = await frame.evaluate(() => {
        const nexts = document.querySelectorAll('#mainBetNext, .swiper-button-next');
        const prevs = document.querySelectorAll('#mainBetPrev, .swiper-button-prev');
        return {
          nextCount: nexts.length,
          prevCount: prevs.length,
          nextDetails: Array.from(nexts).map(el => ({
            id: el.id,
            display: window.getComputedStyle(el).display,
            bg: (window.getComputedStyle(el).backgroundImage || '').substring(0, 80)
          })),
          prevDetails: Array.from(prevs).map(el => ({
            id: el.id,
            display: window.getComputedStyle(el).display,
            bg: (window.getComputedStyle(el).backgroundImage || '').substring(0, 80)
          }))
        };
      });
      console.log('\n📌 Arrow check:');
      console.log('  Next buttons:', arrows.nextCount);
      arrows.nextDetails.forEach(d => console.log(`    ${d.id}: display=${d.display}, bg=${d.bg}`));
      console.log('  Prev buttons:', arrows.prevCount);
      arrows.prevDetails.forEach(d => console.log(`    ${d.id}: display=${d.display}, bg=${d.bg}`));

      // Try betting
      console.log('\n📌 Bet button test:');
      
      // Switch to browse mode first
      await page.evaluate(() => {
        if (window.app?.visualEditor?.editMode) {
          const btn = document.getElementById('btn-toggle-edit');
          if (btn) btn.click();
        }
      });
      await sleep(1000);

      const betClicked = await frame.evaluate(() => {
        const btn = document.querySelector('.betbox__BetBtn');
        if (btn) {
          const r = btn.getBoundingClientRect();
          console.log('[VisualEditor] BetBtn found at:', JSON.stringify(r));
          btn.click();
          return true;
        }
        return false;
      });
      console.log('  Bet button clicked:', betClicked);
      
      if (betClicked) {
        await sleep(2000);
        await page.screenshot({ path: 'scratch/v_full_02_betting.png' });
        
        // Check if popup opened
        const popupVisible = await frame.evaluate(() => {
          const popup = document.querySelector('.popup.show, .ingame__popup--bg.show');
          return !!popup;
        });
        console.log('  Popup opened:', popupVisible);
        console.log(popupVisible ? '  ✅ Betting: PASS' : '  ⚠️ Betting: CHECK');
      }
    }

    console.log('\n🎉 Full verification complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'scratch/v_full_error.png' });
  } finally {
    await browser.close();
  }
}

run();
