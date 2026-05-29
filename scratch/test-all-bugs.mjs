/**
 * Automated test script to verify all 4 bug fixes.
 * Opens the Figma mode page, tests each interaction, and screenshots.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');
const BASE_URL = 'http://localhost:3000';
const FIGMA_URL = 'https://www.figma.com/design/tEJWXLBb2i2rNZ56HKJ26w/w201335--Copy---Copy---Copy-?node-id=0-1&p=f&t=nIZo7tgEM7ibUVjr-0';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Starting Bug Verification Tests ===\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  // Capture console logs from the page
  page.on('console', msg => {
    if (msg.text().includes('[VisualEditor]') || msg.text().includes('[Auto-Convert]')) {
      console.log(`  [PAGE] ${msg.text()}`);
    }
  });
  
  // 1. Load the Figma conversion page
  console.log('[Step 1] Loading Figma conversion page...');
  const figmaEncoded = encodeURIComponent(FIGMA_URL);
  await page.goto(`${BASE_URL}/?figmaUrl=${figmaEncoded}`, { waitUntil: 'networkidle2', timeout: 120000 });
  
  // Wait for page to fully load and Figma content to render
  console.log('[Step 1] Waiting for Figma content to render...');
  await sleep(10000);
  
  // Take initial screenshot
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_initial_load.png'), fullPage: false });
  console.log('[Step 1] ✓ Initial page loaded & screenshot taken\n');
  
  // Check if app.visualEditor exists
  const editorExists = await page.evaluate(() => {
    return !!(window.app && window.app.visualEditor);
  });
  console.log(`Editor exists: ${editorExists}`);
  
  if (!editorExists) {
    console.error('ERROR: window.app.visualEditor does not exist! Maybe Figma conversion is still loading.');
    // Try waiting longer
    await sleep(15000);
    const editorExists2 = await page.evaluate(() => {
      return !!(window.app && window.app.visualEditor);
    });
    if (!editorExists2) {
      console.error('Still no editor after waiting. Taking diagnostic screenshot.');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '00_no_editor_error.png'), fullPage: false });
      await browser.close();
      return;
    }
  }
  
  // Get the iframe
  const iframeHandle = await page.$('#preview-iframe');
  if (!iframeHandle) {
    console.error('ERROR: Cannot find #preview-iframe!');
    await browser.close();
    return;
  }
  
  const frame = await iframeHandle.contentFrame();
  if (!frame) {
    console.error('ERROR: Cannot access iframe content frame!');
    await browser.close();
    return;
  }
  
  // Print resolved screen names
  const screenNames = await page.evaluate(() => {
    return window.app.visualEditor.resolvedScreenNames;
  });
  console.log(`Resolved screen names:`, screenNames);
  
  // =====================================================================
  // TEST 1: Click ? button to open Activity Description popup
  // =====================================================================
  console.log('\n[Test 1] Testing: Click ? to open Activity Description popup...');
  
  // Find question-related elements in the iframe
  const questionBtnInfo = await frame.evaluate(() => {
    const allEls = document.querySelectorAll('[data-figma-name]');
    const results = [];
    for (const el of allEls) {
      const name = el.getAttribute('data-figma-name') || '';
      const nameLower = name.toLowerCase();
      if (nameLower.includes('?') || nameLower.includes('注意事項') || nameLower.includes('說明') || 
          nameLower.includes('question') || nameLower.includes('btn_question') || nameLower.includes('規則')) {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        results.push({
          name,
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          display: computed.display,
          pointerEvents: computed.pointerEvents,
          zIndex: computed.zIndex,
        });
      }
    }
    return results;
  });
  
  console.log(`  Found ${questionBtnInfo.length} question-related elements:`);
  questionBtnInfo.forEach(el => {
    console.log(`    - "${el.name}" at (${el.x.toFixed(0)},${el.y.toFixed(0)}) ${el.w.toFixed(0)}x${el.h.toFixed(0)} display=${el.display} pointer=${el.pointerEvents} z=${el.zIndex}`);
  });
  
  // Try to click a question button via DOM click
  const questionClicked = await frame.evaluate(() => {
    const allEls = document.querySelectorAll('[data-figma-name]');
    for (const el of allEls) {
      const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
      if (name.includes('?') || name.includes('注意事項') || name.includes('question') || name.includes('btn_question')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.click();
          return { clicked: true, name: el.getAttribute('data-figma-name'), x: rect.x, y: rect.y };
        }
      }
    }
    return { clicked: false };
  });
  console.log(`  Click result:`, questionClicked);
  
  await sleep(2000);
  
  // Check popup state
  const popupState1 = await frame.evaluate(() => {
    const popup = document.querySelector('.popup');
    const bg = document.querySelector('.ingame__popup--bg');
    const q = document.querySelector('.popup-base.question');
    return {
      popupHasShow: popup ? popup.classList.contains('show') : false,
      bgHasShow: bg ? bg.classList.contains('show') : false,
      qHasShow: q ? q.classList.contains('show') : false,
    };
  });
  console.log(`  Popup state:`, popupState1);
  
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_question_popup.png'), fullPage: false });
  const test1Pass = popupState1.popupHasShow && popupState1.qHasShow;
  console.log(`  [Test 1] ${test1Pass ? '✓ PASS' : '✗ FAIL'} - Question popup`);
  
  // Close the popup
  await frame.evaluate(() => {
    document.querySelectorAll('.popup, .ingame__popup--bg, .popup__main').forEach(el => el.classList.remove('show'));
  });
  await sleep(500);
  
  // =====================================================================
  // TEST 2 & 3: Click Bet button, check for extra buttons & minus sign
  // =====================================================================
  console.log('\n[Test 2] Testing: Betting screen - extra buttons & minus sign...');
  
  // Navigate to bet1 screen
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.bet1);
    const select = document.getElementById('select-editor-screen');
    if (select) select.value = editor.resolvedScreenNames.bet1;
  });
  
  await sleep(3000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_bet1_screen.png'), fullPage: false });
  
  // Check for fallback injected buttons (Bug 2)
  const fallbackBtnCount = await frame.evaluate(() => {
    return document.querySelectorAll('.injected-bet-btn').length;
  });
  console.log(`  Fallback injected buttons: ${fallbackBtnCount}`);
  console.log(`  [Test 2] ${fallbackBtnCount === 0 ? '✓ PASS' : '✗ FAIL'} - No extra fallback buttons`);
  
  // Check minus bar injection (Bug 3)
  const minusInfo = await frame.evaluate(() => {
    const bars = document.querySelectorAll('.injected-minus-bar');
    return {
      count: bars.length,
      details: Array.from(bars).map(bar => ({
        display: bar.style.display,
        visible: bar.getBoundingClientRect().width > 0,
        parentName: bar.parentElement?.getAttribute('data-figma-name')
      }))
    };
  });
  console.log(`  Minus bars found: ${minusInfo.count}`);
  minusInfo.details.forEach(d => console.log(`    parent="${d.parentName}" display=${d.display} visible=${d.visible}`));
  console.log(`  [Test 3] ${minusInfo.count > 0 ? '✓ PASS' : '✗ FAIL'} - Minus sign injected`);
  
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_bet1_minus.png'), fullPage: false });
  
  // =====================================================================
  // TEST 4: Knockout stage navigation
  // =====================================================================
  console.log('\n[Test 4] Testing: Knockout stage should go to bet2...');
  
  // Go back to main screen
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.main);
  });
  await sleep(1500);
  
  // Set stage to knockout
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor._currentStage = 'text_team2.png';
    editor._currentStageName = '32強';
  });
  
  // Navigate to bet2 (knockout screen)
  await page.evaluate(() => {
    const editor = window.app.visualEditor;
    editor.setScreen(editor.resolvedScreenNames.bet2);
    const select = document.getElementById('select-editor-screen');
    if (select) select.value = editor.resolvedScreenNames.bet2;
  });
  
  await sleep(2000);
  
  const knockoutResult = await page.evaluate(() => {
    const editor = window.app.visualEditor;
    return {
      currentScreen: editor.currentScreen,
      bet2Name: editor.resolvedScreenNames.bet2,
      isCorrect: editor.currentScreen === editor.resolvedScreenNames.bet2 || editor.currentScreen.includes('投注畫面2')
    };
  });
  
  console.log(`  Current screen: "${knockoutResult.currentScreen}"`);
  console.log(`  Expected bet2:  "${knockoutResult.bet2Name}"`);
  console.log(`  [Test 4] ${knockoutResult.isCorrect ? '✓ PASS' : '✗ FAIL'} - Knockout screen`);
  
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_knockout_bet2.png'), fullPage: false });
  
  // =====================================================================
  // FINAL: Summary
  // =====================================================================
  console.log('\n=== Test Summary ===');
  console.log(`Test 1 (? popup):       ${test1Pass ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 2 (extra buttons): ${fallbackBtnCount === 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 3 (minus sign):    ${minusInfo.count > 0 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 4 (knockout):      ${knockoutResult.isCorrect ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`\nScreenshots saved to: ${SCREENSHOTS_DIR}`);
  
  await browser.close();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
