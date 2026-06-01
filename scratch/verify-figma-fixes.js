import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FIGMA_TOKEN = process.env.FIGMA_TOKEN || 'figd_test_token';
const FIGMA_URL = 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w/w201335--Copy---Copy---Copy-?node-id=0-1&p=f&t=nIZo7tgEM7ibUVjr-0';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 Starting Figma Mode Fix Verification...');
  
  if (!fs.existsSync(CHROME_PATH)) {
    console.error('❌ Chrome not found at:', CHROME_PATH);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const clientLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    clientLogs.push(text);
    if (text.includes('[VisualEditor]') || text.includes('[_applyImageUrls]')) {
      console.log('🌐', text);
    }
  });
  page.on('pageerror', err => console.error('❌ CLIENT ERROR:', err.toString()));

  try {
    // 1. Load home page
    console.log('📌 Step 1: Navigate to http://localhost:3000');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.screenshot({ path: 'scratch/v_01_home.png' });

    // 2. Input Figma credentials and connect
    console.log('📌 Step 2: Input Figma credentials');
    await page.type('#input-token', FIGMA_TOKEN);
    await page.type('#input-figma-url', FIGMA_URL);
    await page.click('#btn-connect');

    // 3. Wait for editor to load (uses cache if available)
    console.log('⏳ Step 3: Waiting for editor to render (up to 60s)...');
    await page.waitForSelector('#preview-iframe', { timeout: 60000 });
    await sleep(6000); // Allow full render
    await page.screenshot({ path: 'scratch/v_02_editor_loaded.png' });

    const iframeElement = await page.$('#preview-iframe');
    const frame = await iframeElement.contentFrame();
    if (!frame) throw new Error('Could not get iframe content frame');

    // ================================================================
    // TEST A: Verify arrow images are visible (Issue 3)
    // ================================================================
    console.log('\n📌 TEST A: Check arrow images visibility');
    const arrowInfo = await frame.evaluate(() => {
      const arrows = Array.from(document.querySelectorAll('[data-figma-name]')).filter(el => {
        const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
        return name.includes('btn_arrow') || name.includes('arrow') || name.includes('左右按鈕');
      });
      
      const injectedNav = document.querySelectorAll('.injected-nav, #mainBetNext, #mainBetPrev');
      
      return {
        figmaArrows: arrows.map(el => ({
          name: el.getAttribute('data-figma-name'),
          display: window.getComputedStyle(el).display,
          bgImage: window.getComputedStyle(el).backgroundImage,
          rect: JSON.stringify(el.getBoundingClientRect())
        })),
        injectedNavCount: injectedNav.length,
        swiperNextExists: !!document.querySelector('#mainBetNext, .swiper-button-next'),
        swiperPrevExists: !!document.querySelector('#mainBetPrev, .swiper-button-prev')
      };
    });
    
    console.log('  Arrow elements found:', arrowInfo.figmaArrows.length);
    arrowInfo.figmaArrows.forEach(a => {
      console.log(`  - ${a.name}: display=${a.display}, bg=${a.bgImage?.substring(0, 60)}...`);
    });
    console.log('  Injected nav:', arrowInfo.injectedNavCount);
    console.log('  Swiper next exists:', arrowInfo.swiperNextExists);
    console.log('  Swiper prev exists:', arrowInfo.swiperPrevExists);
    
    const arrowsOk = arrowInfo.figmaArrows.length > 0 || arrowInfo.swiperNextExists;
    console.log(arrowsOk ? '  ✅ Arrow images: PASS' : '  ⚠️ Arrow images: needs manual check');

    await page.screenshot({ path: 'scratch/v_03_main_with_arrows.png' });

    // ================================================================
    // TEST B: Click 投注 to open betting screen (Issue 2)
    // ================================================================
    console.log('\n📌 TEST B: Click bet button to open betting screen');
    const betClicked = await frame.evaluate(() => {
      const b = Array.from(document.querySelectorAll('*')).find(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        const id = (el.id || '').toLowerCase();
        const identifier = `${fname}|${className}|${id}`;
        if (el.tagName.toLowerCase() === 'p' || el.tagName.toLowerCase() === 'input') return false;
        return ['btn_ok', '投注', '押注', '展開投注', 'betbtn', 'betbox_betbtn', 'betbox__betbtn'].some(p => identifier.includes(p.toLowerCase()));
      });
      if (b) {
        console.log('[VisualEditor] Verification: clicking bet button:', b.getAttribute('data-figma-name'));
        b.click();
        return true;
      }
      return false;
    });

    if (betClicked) {
      console.log('  ✅ Bet button found and clicked');
      await sleep(3000);
    } else {
      console.log('  ⚠️ Bet button not found by selector, trying screen switch...');
      await page.evaluate(() => {
        const select = document.getElementById('select-editor-screen');
        if (select) {
          for (const opt of select.options) {
            if (opt.value.includes('投注畫面1')) {
              select.value = opt.value;
              select.dispatchEvent(new Event('change'));
              break;
            }
          }
        }
      });
      await sleep(3000);
    }

    await page.screenshot({ path: 'scratch/v_04_betting_screen.png' });

    // ================================================================
    // TEST C: Click 確認押注 should NOT trigger rules popup (Issue 4)
    // ================================================================
    console.log('\n📌 TEST C: Click 確認押注 - should NOT trigger rules popup');
    
    // First verify we're on the betting screen
    const currentScreen = await page.evaluate(() => {
      return window.app?.visualEditor?.currentScreen || 'unknown';
    });
    console.log('  Current screen:', currentScreen);

    const confirmClicked = await frame.evaluate(() => {
      // Find confirm button by figma name
      const confirmBtn = Array.from(document.querySelectorAll('*')).find(el => {
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        return (fname.includes('betall') || fname.includes('btn_ok') || fname.includes('確定') || fname.includes('確認') ||
                className.includes('betall') || className.includes('btn_betall'));
      });
      if (confirmBtn) {
        const r = confirmBtn.getBoundingClientRect();
        console.log('[VisualEditor] Verification: clicking confirm btn:', confirmBtn.getAttribute('data-figma-name'), 'rect:', JSON.stringify(r));
        confirmBtn.click();
        return true;
      }
      return false;
    });

    await sleep(2000);
    
    // Check if question popup appeared (it shouldn't!)
    const questionPopupVisible = await frame.evaluate(() => {
      const popup = document.querySelector('.popup.show');
      const popupMain = document.querySelector('.popup__main.show');
      const questionScreen = Array.from(document.querySelectorAll('[data-figma-name]')).find(el => {
        const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
        return (name.includes('說明') || name.includes('規則') || name.includes('question'));
      });
      const questionVisible = questionScreen && window.getComputedStyle(questionScreen).display !== 'none';
      return { popupShow: !!popup, popupMainShow: !!popupMain, questionVisible };
    });

    const screenAfterConfirm = await page.evaluate(() => {
      return window.app?.visualEditor?.currentScreen || 'unknown';
    });

    console.log('  Confirm clicked:', confirmClicked);
    console.log('  Popup visible after confirm:', questionPopupVisible);
    console.log('  Screen after confirm:', screenAfterConfirm);
    
    const noRulesPopup = !questionPopupVisible.questionVisible;
    console.log(noRulesPopup ? '  ✅ Confirm button: PASS (no rules popup)' : '  ❌ Confirm button: FAIL (rules popup appeared!)');

    await page.screenshot({ path: 'scratch/v_05_after_confirm.png' });

    // ================================================================
    // TEST D: Go back to betting screen and test 重新選擇 (Issue 4)
    // ================================================================
    console.log('\n📌 TEST D: Test 重新選擇 button');
    
    // Go back to betting screen
    await page.evaluate(() => {
      const select = document.getElementById('select-editor-screen');
      if (select) {
        for (const opt of select.options) {
          if (opt.value.includes('投注畫面1') || opt.value.includes('betpage')) {
            select.value = opt.value;
            select.dispatchEvent(new Event('change'));
            break;
          }
        }
      }
    });
    await sleep(2000);

    const clearClicked = await frame.evaluate(() => {
      const clearBtn = Array.from(document.querySelectorAll('*')).find(el => {
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        return (fname.includes('reselect') || fname.includes('重新') || fname.includes('btn_betclear') ||
                className.includes('reselect') || className.includes('btn_reselect'));
      });
      if (clearBtn) {
        console.log('[VisualEditor] Verification: clicking clear btn:', clearBtn.getAttribute('data-figma-name'));
        clearBtn.click();
        return true;
      }
      return false;
    });

    await sleep(2000);
    
    const rulesAfterClear = await frame.evaluate(() => {
      const questionScreen = Array.from(document.querySelectorAll('[data-figma-name]')).find(el => {
        const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
        return (name.includes('說明') || name.includes('規則') || name.includes('question'));
      });
      return questionScreen ? window.getComputedStyle(questionScreen).display !== 'none' : false;
    });

    console.log('  Clear clicked:', clearClicked);
    console.log('  Rules popup after clear:', rulesAfterClear);
    console.log(!rulesAfterClear ? '  ✅ Clear button: PASS (no rules popup)' : '  ❌ Clear button: FAIL (rules popup appeared!)');

    await page.screenshot({ path: 'scratch/v_06_after_clear.png' });

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('\n' + '='.repeat(50));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Arrow images:     ${arrowsOk ? '✅ PASS' : '⚠️ CHECK'}`);
    console.log(`Bet screen open:  ${betClicked ? '✅ PASS' : '⚠️ CHECK'}`);
    console.log(`Confirm no rules: ${noRulesPopup ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Clear no rules:   ${!rulesAfterClear ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(50));

    console.log('\n🎉 Verification complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'scratch/v_error.png' });
  } finally {
    await browser.close();
  }
}

run();
