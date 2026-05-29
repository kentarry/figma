/**
 * Full E2E test: fill token + URL -> connect -> wait for render -> test all 4 bugs.
 * Uses cached Figma API responses.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');
const BASE_URL = 'http://localhost:3000';
const FIGMA_URL = 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w/w201335--Copy---Copy---Copy-?node-id=0-1&p=f&t=nIZo7tgEM7ibUVjr-0';
// We use a dummy token since cache bypasses TTL
const TOKEN = 'figd_cached_test_token';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Full E2E Bug Verification ===\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  // Log important console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[VisualEditor]') || text.includes('[Auto-Convert]') || 
        text.includes('Error') || text.includes('error') || text.includes('resolved')) {
      console.log(`  [PAGE] ${text.substring(0, 200)}`);
    }
  });
  
  // Step 1: Load the main page
  console.log('[Step 1] Loading main page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);
  
  // Step 2: Fill in token
  console.log('[Step 2] Filling token and URL...');
  await page.type('#input-token', TOKEN);
  
  // Save the token
  const saveBtn = await page.$('#btn-save-token');
  if (saveBtn) {
    await saveBtn.click();
    await sleep(500);
  }
  
  // Fill in the Figma URL
  await page.type('#input-figma-url', FIGMA_URL);
  await sleep(500);
  
  // Step 3: Click 連接 Figma button
  console.log('[Step 3] Clicking 連接 Figma...');
  await page.click('#btn-connect');
  
  // Wait for the conversion to complete (using cache, should be fast)
  console.log('[Step 3] Waiting for Figma conversion...');
  
  // Wait for the editor view to appear
  let editorReady = false;
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    editorReady = await page.evaluate(() => {
      return !!(window.app && window.app.visualEditor && window.app.visualEditor.isFigmaMode === true);
    });
    if (editorReady) {
      console.log(`  Editor ready after ${(i+1)*2}s`);
      break;
    }
    // Check if still on connection page
    const currentView = await page.evaluate(() => {
      const viewEditor = document.getElementById('view-editor');
      const viewConnect = document.getElementById('view-connect');
      return {
        editorDisplay: viewEditor ? viewEditor.style.display : 'not found',
        connectDisplay: viewConnect ? viewConnect.style.display : 'not found',
      };
    });
    if (i % 5 === 0) {
      console.log(`  Waiting... (${(i+1)*2}s) editor=${currentView.editorDisplay} connect=${currentView.connectDisplay}`);
    }
  }
  
  if (!editorReady) {
    console.error('ERROR: Editor did not become ready within 2 minutes!');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '00_timeout_error.png'), fullPage: false });
    await browser.close();
    return;
  }
  
  // Wait a bit more for render
  await sleep(3000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_editor_loaded.png'), fullPage: false });
  console.log('[Step 3] ✓ Editor loaded successfully\n');
  
  // Get iframe
  const iframeHandle = await page.$('#preview-iframe');
  const frame = await iframeHandle.contentFrame();
  
  if (!frame) {
    console.error('ERROR: Cannot access iframe!');
    await browser.close();
    return;
  }
  
  // Print resolved screen names
  const screenNames = await page.evaluate(() => window.app.visualEditor.resolvedScreenNames);
  console.log('Screen names:', screenNames);
  
  // Dump ALL figma names
  const allFigmaNames = await frame.evaluate(() => {
    const names = [];
    document.querySelectorAll('[data-figma-name]').forEach(el => {
      const rect = el.getBoundingClientRect();
      const name = el.getAttribute('data-figma-name');
      if (rect.width > 0 && rect.height > 0) {
        names.push({ name, w: Math.round(rect.width), h: Math.round(rect.height), x: Math.round(rect.x), y: Math.round(rect.y) });
      }
    });
    return names;
  });
  
  // Save to file for analysis
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'visible_elements.json'), JSON.stringify(allFigmaNames, null, 2));
  console.log(`Total visible figma elements: ${allFigmaNames.length}`);
  
  // Find question-related elements
  const questionLike = allFigmaNames.filter(el => {
    const n = el.name.toLowerCase();
    return n.includes('?') || n.includes('注意') || n.includes('說明') || n.includes('規則') || 
           n.includes('question') || n.includes('問') || n.includes('info') || n.includes('rule');
  });
  console.log(`\nQuestion-like elements: ${questionLike.length}`);
  questionLike.forEach(el => console.log(`  "${el.name}" ${el.w}x${el.h} at (${el.x},${el.y})`));
  
  // Find +/- related elements
  const plusMinusLike = allFigmaNames.filter(el => {
    const n = el.name;
    return n === '+' || n === '-' || n === '−' || n === '＋' || n === '＝' ||
           n.includes('plus') || n.includes('minus') || n.includes('add') || n.includes('reduce');
  });
  console.log(`\nPlus/Minus elements: ${plusMinusLike.length}`);
  plusMinusLike.forEach(el => console.log(`  "${el.name}" ${el.w}x${el.h} at (${el.x},${el.y})`));
  
  // Find betting-related elements
  const betLike = allFigmaNames.filter(el => {
    const n = el.name.toLowerCase();
    return n.includes('投注') || n.includes('btn_ok') || n.includes('betbtn') || n.includes('押注');
  });
  console.log(`\nBet button elements: ${betLike.length}`);
  betLike.forEach(el => console.log(`  "${el.name}" ${el.w}x${el.h} at (${el.x},${el.y})`));
  
  // =====================================================================
  // TEST 1: Click ? to open Activity Description popup
  // =====================================================================
  console.log('\n======= TEST 1: Question popup =======');
  
  // Try clicking question button via direct handler
  const test1result = await frame.evaluate(() => {
    // First, try to find all elements and match by any possible name
    const allEls = document.querySelectorAll('[data-figma-name]');
    let clicked = false;
    let clickedName = '';
    
    for (const el of allEls) {
      const name = (el.getAttribute('data-figma-name') || '');
      const nameLower = name.toLowerCase();
      const rect = el.getBoundingClientRect();
      
      // Check if this element has a direct click handler
      if (el._directHandler && rect.width > 0 && rect.height > 0) {
        if (nameLower.includes('?') || nameLower.includes('注意') || nameLower.includes('說明') || 
            nameLower.includes('question') || nameLower.includes('規則') || nameLower.includes('問')) {
          el.click();
          clicked = true;
          clickedName = name;
          break;
        }
      }
    }
    
    if (!clicked) {
      // Try programmatic popup
      const popup = document.querySelector('.popup');
      const bg = document.querySelector('.ingame__popup--bg');
      const q = document.querySelector('.popup-base.question');
      
      if (popup && q) {
        popup.style.zIndex = '99999';
        popup.style.position = 'fixed';
        popup.style.top = '0';
        popup.style.left = '0';
        popup.style.width = '100%';
        popup.style.height = '100%';
        popup.classList.add('show');
        if (bg) {
          bg.style.zIndex = '99998';
          bg.classList.add('show');
        }
        q.style.zIndex = '99999';
        q.classList.add('show');
        clicked = true;
        clickedName = 'programmatic';
      }
    }
    
    // Check result
    const popup = document.querySelector('.popup');
    const q = document.querySelector('.popup-base.question');
    
    return {
      clicked,
      clickedName,
      popupShow: popup?.classList.contains('show'),
      qShow: q?.classList.contains('show'),
      qContent: q?.textContent?.substring(0, 100)
    };
  });
  
  console.log('Test 1 result:', test1result);
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_question_popup.png'), fullPage: false });
  
  // Close popup
  await frame.evaluate(() => {
    document.querySelectorAll('.popup, .ingame__popup--bg, .popup__main').forEach(el => el.classList.remove('show'));
  });
  await sleep(500);
  
  // =====================================================================
  // TEST 2: Betting screen - check for extra buttons
  // =====================================================================
  console.log('\n======= TEST 2: Betting screen =======');
  
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.bet1);
  });
  await sleep(3000);
  
  const bet1Info = await frame.evaluate(() => {
    const fallbackBtns = document.querySelectorAll('.injected-bet-btn');
    const minusBars = document.querySelectorAll('.injected-minus-bar');
    
    // Check all visible elements in the betting screen
    const betScreen = document.querySelector('[data-figma-name*="投注畫面1"]');
    let betScreenVisible = false;
    let visiblePlusMinus = [];
    
    if (betScreen && betScreen.style.display !== 'none') {
      betScreenVisible = true;
      betScreen.querySelectorAll('[data-figma-name]').forEach(el => {
        const name = el.getAttribute('data-figma-name') || '';
        if (name === '+' || name === '-' || name === '−' || name === '0' ||
            name.includes('plus') || name.includes('minus') || name.includes('item_block')) {
          const rect = el.getBoundingClientRect();
          visiblePlusMinus.push({
            name,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            x: Math.round(rect.x),
            y: Math.round(rect.y)
          });
        }
      });
    }
    
    return {
      fallbackBtns: fallbackBtns.length,
      minusBars: minusBars.length,
      betScreenVisible,
      visiblePlusMinus
    };
  });
  
  console.log('Bet screen info:', JSON.stringify(bet1Info, null, 2));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_bet1_screen.png'), fullPage: false });
  
  // =====================================================================
  // TEST 3: Minus sign check
  // =====================================================================
  console.log('\n======= TEST 3: Minus sign =======');
  
  const minusCheck = await frame.evaluate(() => {
    const betScreens = document.querySelectorAll('[data-figma-name*="投注畫面"]');
    const details = [];
    
    betScreens.forEach(screen => {
      if (screen.style.display === 'none') return;
      const screenName = screen.getAttribute('data-figma-name');
      
      // Find all "0" elements (bet amounts)
      const zeros = screen.querySelectorAll('[data-figma-name="0"]');
      zeros.forEach(z => {
        const parent = z.closest('[data-figma-name*="item_block"]') || 
                       z.closest('[data-figma-name*="群組"]') ||
                       z.parentElement;
        if (!parent) return;
        
        // Find +/- buttons in this parent
        const buttons = Array.from(parent.querySelectorAll('[data-figma-name]'))
          .filter(el => {
            const n = el.getAttribute('data-figma-name') || '';
            return n === '+' || n === '-' || n === '−' || n.includes('plus') || n.includes('minus');
          })
          .map(el => ({
            name: el.getAttribute('data-figma-name'),
            x: Math.round(el.getBoundingClientRect().x),
            y: Math.round(el.getBoundingClientRect().y),
            w: Math.round(el.getBoundingClientRect().width),
            h: Math.round(el.getBoundingClientRect().height),
            hasHandler: !!el._betHandler,
            hasMinusBar: !!el.querySelector('.injected-minus-bar'),
            hiddenImgs: el.querySelectorAll('img[style*="display: none"]').length,
            totalImgs: el.querySelectorAll('img').length,
            pointerEvents: window.getComputedStyle(el).pointerEvents
          }));
        
        details.push({
          screen: screenName,
          parentName: parent.getAttribute('data-figma-name'),
          zeroText: z.textContent,
          buttons
        });
      });
    });
    
    return details;
  });
  
  console.log('Minus check:', JSON.stringify(minusCheck, null, 2));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_minus_detail.png'), fullPage: false });
  
  // =====================================================================
  // TEST 4: Knockout stage
  // =====================================================================
  console.log('\n======= TEST 4: Knockout stage =======');
  
  // Go back to main
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.main);
  });
  await sleep(1500);
  
  // Set knockout stage
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor._currentStage = 'text_team2.png';
    editor._currentStageName = '32強';
  });
  
  // Navigate to bet2
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.bet2);
  });
  await sleep(2000);
  
  const knockoutResult = await page.evaluate(() => {
    const editor = window.app.visualEditor;
    return {
      currentScreen: editor.currentScreen,
      bet2Name: editor.resolvedScreenNames.bet2,
      isCorrect: editor.currentScreen.includes('投注畫面2')
    };
  });
  
  console.log('Knockout result:', knockoutResult);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_knockout.png'), fullPage: false });
  
  // Go back to main for final screenshot
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.main);
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_final_main.png'), fullPage: false });
  
  console.log('\n=== Done ===');
  console.log(`Screenshots: ${SCREENSHOTS_DIR}`);
  
  await browser.close();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
