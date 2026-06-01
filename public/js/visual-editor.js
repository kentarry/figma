export class VisualEditor {
  static CONFIG = {
    overlayNames: ['亮', 'win', '群組 56', '左右按鈕', 'body-bg', 'BG', '群組 44', '矩形 3', '總投組數', '總投注數'],
    interactiveNames: [
      '注意事項', '說明', '規則', 'btn_question',
      'btn_result', '查看結果',
      'btn_ok', '投注', '押注', 'betbtn',
      'btn_betall', 'btn_reselect', 'betall', 'reselect',
      'btn_close', 'close',
      'switch', 'top_l', '切分組', '賽季', 'dropdown',
      '下方__按鈕', '下方按鈕', '+'
    ],
    buttons: {
      rules: ['注意事項', '活動說明', '規則說明', 'btn_question', 'btn__question', 'btn-question', 'rule', '?', '❓'],
      bet: ['投注', '押注', 'btn_ok', 'betbtn'],
      confirm: ['確定', '確認', 'btn_betall', 'betall'],
      clear: ['重新選擇', '重選', 'btn_reselect', 'reselect'],
      close: ['btn_close', 'close', '關閉', 'btn_back', 'btn-back'],
      record: ['查看結果', '歷史紀錄', 'btn_result', 'btn__record', 'record']
    }
  };

  constructor(container) {
    this.container = container;
    this.iframe = document.getElementById('preview-iframe');
    this.currentHtml = '';
    this.currentCss = '';
    this.selectedSelector = null;
    this.zoom = 100;
    this.onSelectElement = null;
    this.onPropertyChange = null;
    this.onContentChange = null;
    this.onLoad = null;

    // Drag state
    this._dragState = null;
    this._justDragged = false;

    this.activeScope = 'class';
    this.editMode = false;
    this.currentScreen = 'main';

    // Resolved screen names map
    this.resolvedScreenNames = {
      main: '主畫面 1',
      bet1: '投注畫面1 1',
      bet2: '投注畫面2 1'
    };

    // Undo/Redo history
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistory = 50;

    // Device preset
    this.currentDevice = { name: 'WIN 桌面', width: 1280, height: 720 };

    // Image error tracking
    this._imageErrors = [];
    
    // Interactions state
    this._interactionsSetup = false;
    this.config = JSON.parse(JSON.stringify(VisualEditor.CONFIG));
  }

  loadCode(html, css) {
    this.currentHtml = html;
    this.currentCss = css;

    const isFigmaMode = !html.includes('ingame__container');
    this.isFigmaMode = isFigmaMode;
    const figmaStylesheets = isFigmaMode ? `
<link rel="stylesheet" href="/ingame-assets/style/css/master_v2.css" />
<link rel="stylesheet" href="/ingame-assets/style/css/style.css" />
<link rel="stylesheet" href="/ingame-assets/style/css/game_view.css" />
` : '';

    const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@200..900&family=Noto+Sans+TC:wght@100..900&family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap">
<link rel="stylesheet" href="https://unpkg.com/swiper@8/swiper-bundle.min.css" />
${figmaStylesheets}
<style>
${css}

${isFigmaMode ? `
/* Popups fix for Figma mode */
html, body {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}
.ingame__popup--bg,
.popup {
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.25s, visibility 0.25s;
}
.ingame__popup--bg.show {
  visibility: visible !important;
  opacity: 1 !important;
}
.popup.show {
  visibility: visible !important;
  opacity: 1 !important;
}
.popup__main {
  display: none;
}
.popup__main.show {
  visibility: visible !important;
  display: block !important;
  opacity: 1 !important;
}
.popup-base {
  z-index: 1000 !important;
}
.popup {
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  position: absolute !important;
  z-index: 999 !important;
  overflow: hidden !important;
}
.ingame__popup--bg {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 998 !important;
  background: rgba(0,0,0,0.6) !important;
}
` : ''}

/* ── Editor overlay styles ── */
[data-editor-hover] {
  outline: 2px solid rgba(88, 166, 255, 0.6) !important;
  outline-offset: 1px;
  cursor: pointer;
}
[data-editor-selected] {
  outline: 2px solid #58a6ff !important;
  outline-offset: 1px;
  box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.15) !important;
  cursor: move !important;
}
[data-editor-dragging] {
  opacity: 0.85 !important;
  z-index: 99999 !important;
  pointer-events: none !important;
  transition: none !important;
}

/* ── Layer picker context menu ── */
.editor-layer-picker {
  position: fixed;
  min-width: 200px;
  max-width: 320px;
  max-height: 300px;
  overflow-y: auto;
  background: rgba(13, 17, 23, 0.96);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  z-index: 999999;
  padding: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.editor-layer-picker-title {
  padding: 6px 10px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(139, 148, 158, 0.8);
  border-bottom: 1px solid rgba(48, 54, 61, 0.6);
  margin-bottom: 2px;
}
.editor-layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  color: #e6edf3;
  transition: background 0.15s;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}
.editor-layer-item:hover {
  background: rgba(88, 166, 255, 0.15);
}
.editor-layer-item.active {
  background: rgba(88, 166, 255, 0.25);
  color: #58a6ff;
}
.editor-layer-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(48, 54, 61, 0.8);
  color: #8b949e;
  flex-shrink: 0;
}
.editor-layer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.editor-layer-depth {
  font-size: 10px;
  color: #6e7681;
  flex-shrink: 0;
}

/* ── Drag guide lines ── */
.editor-drag-guide-x,
.editor-drag-guide-y {
  position: fixed;
  background: rgba(88, 166, 255, 0.5);
  z-index: 999998;
  pointer-events: none;
}
.editor-drag-guide-x { width: 1px; top: 0; bottom: 0; }
.editor-drag-guide-y { height: 1px; left: 0; right: 0; }

/* ── Position badge ── */
.editor-pos-badge {
  position: fixed;
  background: rgba(22, 27, 34, 0.9);
  color: #58a6ff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(88, 166, 255, 0.3);
  z-index: 999999;
  pointer-events: none;
  white-space: nowrap;
}

/* ── Resize handles ── */
.editor-drag-resize-handle {
  position: absolute !important;
  width: 8px !important;
  height: 8px !important;
  background: #fff !important;
  border: 1px solid #58a6ff !important;
  z-index: 999999 !important;
  box-sizing: border-box !important;
}
.editor-drag-resize-handle.top-left { cursor: nwse-resize !important; }
.editor-drag-resize-handle.top-right { cursor: nesw-resize !important; }
.editor-drag-resize-handle.bottom-left { cursor: nesw-resize !important; }
.editor-drag-resize-handle.bottom-right { cursor: nwse-resize !important; }

/* Hide broken image placeholders */
img[alt="Image"]:not([src]),
img[alt="Image"][src=""],
img[alt="Image"][src="undefined"] {
  display: none !important;
}
</style>
</head>
<body>
${html}
${isFigmaMode ? `
<div class="popup">
  <div class="popup__main popup-base question">
    <a class="btn-close" href="#"></a>
    <h2>活動規則說明</h2>
    <div class="main">
      <div class="part">
        <ol>
          <li>分組賽要猜哪個國家會是該組的第一名晉級。</li>
          <li>32強、16強、半準決賽、準決賽、季軍賽、冠軍賽則是猜哪一個球隊獲勝。</li>
          <li>可下注的球隊會隨著戰積確定後持續新增至可下注清單內。</li>
          <li>每個階段的獎金都會不同，越靠近決賽預測獎金越高！</li>
          <li>各階段下注開放時間不同，請參照後續表格，留意開放時間。</li>
          <li>開放下注期間每消耗1張下注券，即可投注一次。</li>
          <li>每個階段獲得的下注券無法帶到下一個階段，該階段結束下注時會清除該階段剩餘未下注的下注券，請把握時間下注。</li>
          <li>下注券可透過遊戲內的任務、活動等機制取得。</li>
          <li>各階段結束後，會平分獎金池內的所有獎金給預測成功的下注券玩家。</li>
          <li>獎金請在2026/7/29(三)11:59前領取，開啟此活動介面即可領獎。</li>
        </ol>
      </div>
    </div>
  </div>
  <div class="popup__main popup-base record">
    <a class="btn-close" href="#"></a>
    <h2>我的押注</h2>
    <div class="main">
      <div class="part">
        <table class="table table-full" id="recordTable">
          <thead>
            <tr>
              <th>場次</th>
              <th>隊伍</th>
              <th>我的押注</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody id="recordTableBody">
            <tr><td>分組賽 A組</td><td><img src="/ingame-assets/images/betpage/Flag_of_Brazil.png" title="巴西" style="height:24px"></td><td>100</td><td><span style="color:#4cff4c">✓ 猜中</span></td></tr>
            <tr><td>分組賽 B組</td><td><img src="/ingame-assets/images/betpage/Flag_of_Spain.png" title="西班牙" style="height:24px"></td><td>50</td><td><span style="color:#ff6b6b">✗ 未中</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
<div class="ingame__popup--bg"></div>
` : ''}
<script src="https://unpkg.com/jquery@3.7.1/dist/jquery.min.js"></script>
<script src="https://unpkg.com/swiper@8/swiper-bundle.min.js"></script>

<script>
// Swipers
let g_mainBetSwiper = null;
let g_betPredSwiper = null;
let g_betGameSwiper = null;

function initSwipers() {
  if (g_mainBetSwiper) { try { g_mainBetSwiper.destroy(true, true); } catch(e){} g_mainBetSwiper = null; }
  if (g_betPredSwiper) { try { g_betPredSwiper.destroy(true, true); } catch(e){} g_betPredSwiper = null; }
  if (g_betGameSwiper) { try { g_betGameSwiper.destroy(true, true); } catch(e){} g_betGameSwiper = null; }

  if (window.Swiper) {
    if (document.querySelector('.gamemain-bet')) {
      const mainSlideCount = document.querySelectorAll('.gamemain-bet .swiper-slide').length;
      g_mainBetSwiper = new Swiper('.gamemain-bet', {
        slidesPerView: 3,
        centeredSlides: true,
        slideToClickedSlide: true,
        loop: mainSlideCount > 3, // Disable loop when slides <= slidesPerView to prevent duplication
        navigation: {
          nextEl: '#mainBetNext',
          prevEl: '#mainBetPrev',
        }
      });
    }

    if (document.querySelector('#betPredictBox .betpage__betbox-bet')) {
      const predSlideCount = document.querySelectorAll('#betPredictBox .betpage__betbox-bet .swiper-slide').length;
      g_betPredSwiper = new Swiper('#betPredictBox .betpage__betbox-bet', {
        slidesPerView: 3,
        centeredSlides: true,
        slideToClickedSlide: true,
        loop: predSlideCount > 3,
        observer: true,
        observeParents: true,
        navigation: {
          nextEl: '#betPredictBox .swiper-button-next',
          prevEl: '#betPredictBox .swiper-button-prev',
        }
      });
    }

    if (document.querySelector('#betGameBox .betpage__betbox-bet')) {
      g_betGameSwiper = new Swiper('#betGameBox .betpage__betbox-bet', {
        slidesPerView: 2,
        spaceBetween: 0,
        loop: false,
        observer: true,
        observeParents: true,
        allowTouchMove: false
      });
    }
  }
}

$(document).ready(function() {
  initSwipers();

  // Gameswitch toggle
  $(document).on('click', '.gameswitch', function(e) {
    if ($(e.target).closest('.gameswitch__list').length) return;
    $('.gameswitch, .gameswitch__list').toggleClass('show');
  });

  $(document).on('click', '.switch__item', function() {
    $('.switch__item').removeClass('active');
    $(this).addClass('active');
    const src = $(this).find('img').attr('src');
    const alt = $(this).find('img').attr('alt');
    $('.gameswitch--active img').attr('src', src).attr('alt', alt);
    $('.gameswitch, .gameswitch__list').removeClass('show');
  });

  // Buttons clicks: Question (Rules)
  $(document).on('click', '.btn__question', function() {
    $('.popup, .ingame__popup--bg, .question').addClass('show');
    $('#mainBetNext, #mainBetPrev').hide();
  });

  // Buttons clicks: Record
  $(document).on('click', '.btn__record', function() {
    $('.popup, .ingame__popup--bg, .record').addClass('show');
    $('#mainBetNext, #mainBetPrev').hide();
  });

  // Close popup
  $(document).on('click', '.btn-close, .ingame__popup--bg', function(e) {
    e.preventDefault();
    $('.popup, .ingame__popup--bg, .popup__main').removeClass('show');
    $('#mainBetNext, #mainBetPrev').show();
  });

  // Main Bet Card click to open BetPage
  $(document).on('click', '.betbox__BetBtn', function() {
    $('.popup, .ingame__popup--bg, .betpage').addClass('show');
    $('#mainBetNext, #mainBetPrev').hide();
    
    // Check if group stage or knockout stage
    const titleImg = $(this).closest('.betbox').find('.betbox__title img').attr('src') || '';
    const isGroup = titleImg.includes('group') || titleImg.includes('text_team1');
    
    if (isGroup) {
      $('#betPredictBox').show();
      $('#betGameBox').hide();
      $('#editorBetPageTitleImg').hide();
      $('#editorBetPageTitleWords').show();
    } else {
      $('#betPredictBox').hide();
      $('#betGameBox').show();
      $('#editorBetPageTitleImg').show();
      $('#editorBetPageTitleWords').hide();
    }
  });

  // Knockout stage team click selection
  $(document).on('click', '#betGameWrapper .swiper-slide', function() {
    $('#betGameWrapper .swiper-slide').removeClass('swiper-slide-active').find('.betbox__nation').removeClass('tw');
    $(this).addClass('swiper-slide-active').find('.betbox__nation').addClass('tw');
  });

  // Bet Page: Clear button
  $(document).on('click', '.btn_betClear', function() {
    $('.betNum').val('0');
    $('.btn-reduce').addClass('off');
  });

  // Bet Page: Add / Reduce buttons
  $(document).on('click', '.betbox__betting .btn-add', function() {
    const $input = $(this).siblings('.betNum');
    let v = parseInt($input.val()) || 0;
    $input.val(v + 1);
    $(this).siblings('.btn-reduce').removeClass('off');
  });

  $(document).on('click', '.betbox__betting .btn-reduce', function() {
    if ($(this).hasClass('off')) return;
    const $input = $(this).siblings('.betNum');
    let v = parseInt($input.val()) || 0;
    if (v > 0) {
      $input.val(v - 1);
      if (v - 1 === 0) {
        $(this).addClass('off');
      }
    }
  });

  $(document).on('blur', '.betNum', function() {
    let v = parseInt($(this).val()) || 0;
    if (isNaN(v) || v < 0) v = 0;
    $(this).val(v);
    if (v === 0) {
      $(this).siblings('.btn-reduce').addClass('off');
    } else {
      $(this).siblings('.btn-reduce').removeClass('off');
    }
  });
  // Reward claim button
  $(document).on('click', '#btnClaimReward', function() {
    $(this).find('.reward__claim-text').text('已領取！');
    $(this).css({opacity: 0.5, pointerEvents: 'none'});
    setTimeout(function() {
      $('.popup, .ingame__popup--bg, .popup__main').removeClass('show');
      $('#mainBetNext, #mainBetPrev').show();
    }, 1200);
  });

  // Add has-my-bet class to slides with myBets > 0
  setTimeout(function() {
    $('.gamemain-bet .swiper-slide').each(function() {
      var myBetText = $(this).find('.betbox__myBetNum p').text() || '';
      var match = myBetText.match(/[\d,]+/);
      if (match) {
        var num = parseInt(match[0].replace(/,/g, ''));
        if (num > 0) $(this).addClass('has-my-bet');
      }
    });
  }, 500);
});
</script>
</body>
</html>`;

    this.iframe.onload = () => {
      this._interactionsSetup = false;
      this._tagElements();
      this._hideImagePlaceholders();
      this._resolveFigmaScreenNames();
      this._setupInteractions();
      if (this.currentScreen) {
        this.setScreen(this.currentScreen);
      }
      if (this.onLoad) {
        this.onLoad();
      }
    };
    this.iframe.srcdoc = doc;
  }

  /** Assign unique data-eid to every element for individual targeting */
  _tagElements() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    let id = 0;
    iframeDoc.body.querySelectorAll('*').forEach(el => {
      el.setAttribute('data-eid', `e${id++}`);
    });
  }

  /** Hide image placeholder elements that show 'Image' text without real content */
  _hideImagePlaceholders() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    // 1) Hide <img> elements whose alt is 'Image' and src is empty/invalid
    iframeDoc.querySelectorAll('img[alt="Image"], img[alt="image"]').forEach(img => {
      const src = (img.getAttribute('src') || '').trim();
      if (!src || src === 'undefined' || src === 'null' || src === '#') {
        img.style.display = 'none';
      }
    });

    // 1b) Add onerror handlers to all images to hide broken ones
    iframeDoc.querySelectorAll('img').forEach(img => {
      if (img._errorHandlerAdded) return;
      img._errorHandlerAdded = true;
      img.addEventListener('error', function() {
        this.style.display = 'none';
      });
    });

    // 2) Hide elements whose trimmed textContent is exactly 'Image' with no meaningful children
    iframeDoc.body.querySelectorAll('*').forEach(el => {
      // Skip script, style, and editor UI elements
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') return;
      if (el.closest('.editor-layer-picker') || el.hasAttribute('data-editor-selected')) return;

      const text = (el.textContent || '').trim();
      if (text.toLowerCase() !== 'image') return;

      // Only hide if no meaningful child elements (images, svgs, etc.)
      const meaningfulChildren = el.querySelectorAll('img[src]:not([src=""]):not([src="undefined"]):not([style*="display: none"]), svg, canvas, video');
      if (meaningfulChildren.length > 0) return;

      // Only hide leaf-level or near-leaf elements (not large containers)
      const childEls = el.querySelectorAll('*');
      if (childEls.length > 5) return; // Skip if too many children (likely a container)

      el.style.display = 'none';
    });

    // 3) Hide Figma-named image containers that show only placeholder text
    iframeDoc.querySelectorAll('[data-figma-name]').forEach(el => {
      const figmaName = (el.getAttribute('data-figma-name') || '').toLowerCase();
      if (!figmaName.includes('image') && !figmaName.includes('img') && !figmaName.includes('圖片')) return;

      // Check if it has a valid background-image
      const computed = iframeDoc.defaultView.getComputedStyle(el);
      const bgImg = el.style.backgroundImage || computed.backgroundImage;
      if (bgImg && bgImg !== 'none' && bgImg !== '') return;

      // Check if it has valid img children
      const validImgs = el.querySelectorAll('img[src]:not([src=""]):not([src="undefined"]):not([style*="display: none"])');
      if (validImgs.length > 0) return;

      // If it only contains placeholder text like 'Image', hide it
      const text = (el.textContent || '').trim();
      if (text.toLowerCase() === 'image' || text === '') {
        el.style.display = 'none';
      }
    });

    console.log('[VisualEditor] Hid image placeholder elements');
  }

  /** Dynamically resolve screen names in the Figma hierarchy */
  _resolveFigmaScreenNames() {
    const doc = this._getDoc();
    if (!doc) return;

    // Default fallback values
    this.resolvedScreenNames = {
      main: '主畫面 1',
      bet1: '投注畫面1 1',
      bet2: '投注畫面2 1'
    };

    const rootEl = doc.body.querySelector('[data-figma-name]');
    if (rootEl) {
      const topChildren = rootEl.querySelectorAll(':scope > [data-figma-name]');
      if (topChildren.length > 0) {
        const topList = Array.from(topChildren);
        
        // Find main screen: matches '主畫面' or case-insensitive synonyms
        const mainEl = topList.find(el => {
          const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
          return name.includes('主畫面') || name.includes('main') || name.includes('desktop') || name.includes('home');
        });
        if (mainEl) {
          this.resolvedScreenNames.main = mainEl.getAttribute('data-figma-name');
        }

        // Find bet1 screen: matches '投注畫面1' or case-insensitive synonyms
        const bet1El = topList.find(el => {
          const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
          return name.includes('投注畫面1') || name.includes('bet1') || name.includes('predict');
        });
        if (bet1El) {
          this.resolvedScreenNames.bet1 = bet1El.getAttribute('data-figma-name');
        }

        // Find bet2 screen: matches '投注畫面2' or case-insensitive synonyms
        const bet2El = topList.find(el => {
          const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
          return name.includes('投注畫面2') || name.includes('bet2') || name.includes('game');
        });
        if (bet2El) {
          this.resolvedScreenNames.bet2 = bet2El.getAttribute('data-figma-name');
        }

        // Find question/popup screen: matches '彈窗', '說明', 'popup', 'question'
        const questionEl = topList.find(el => {
          const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
          return name.includes('彈窗') || name.includes('說明') || name.includes('popup') || name.includes('question') || name.includes('注意事項');
        });
        if (questionEl) {
          this.resolvedScreenNames.question = questionEl.getAttribute('data-figma-name');
        }
      }
    }
    console.log('[VisualEditor] Dynamically resolved screen names:', this.resolvedScreenNames);
    
    // Fix overlapping decorative elements that block interactive buttons
    this._fixFigmaOverlays(doc);
  }

  /** Fix Figma overlay issues and inject interactive UI elements */
  _fixFigmaOverlays(doc) {
    if (!doc) return;
    if (this.isFigmaMode === false) return; // Skip in local HTML mode
    
    // Decorative/overlay element names that should not intercept clicks
    const overlayNames = this.config.overlayNames || [];
    
    // Interactive element names that MUST receive clicks
    const interactiveNames = this.config.interactiveNames || [];
    
    const allFigmaEls = doc.querySelectorAll('[data-figma-name]');
    allFigmaEls.forEach(el => {
      const fname = el.getAttribute('data-figma-name') || '';
      const fnameLower = fname.toLowerCase();
      
      // Check if this is a large layout/container frame
      const isContainer = fnameLower.includes('主畫面') || 
                          fnameLower.includes('投注畫面') || 
                          fnameLower.includes('page') ||
                          el.classList.contains('page') ||
                          (el.tagName.toLowerCase() === 'div' && (el.offsetWidth > 400 || el.offsetHeight > 400));
      if (isContainer) {
        el.style.pointerEvents = 'none';
      }

      // Check if this is a decorative overlay
      if (overlayNames.some(n => fname === n || fnameLower === n.toLowerCase())) {
        el.style.pointerEvents = 'none';
      }
      
      // Ensure interactive elements can receive clicks
      if (interactiveNames.some(n => fnameLower.includes(n.toLowerCase()))) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        const currentZ = parseInt(el.style.zIndex) || 0;
        if (currentZ < 50) {
          el.style.zIndex = '50';
        }
      }
    });
    
    // ── Attach DIRECT click handlers to key interactive elements ──
    // This bypasses all event delegation issues from overlapping Figma layers
    this._attachDirectHandlers(doc);
    
    // ── Inject +/- buttons onto betting card items ──
    this._injectBetButtons(doc);

    // ── Inject Swiper navigation arrows if missing (Figma mode) ──
    this._injectSwiperNavigation(doc);
    
    console.log('[VisualEditor] Fixed overlay pointer-events, attached direct handlers, injected bet buttons, injected swiper nav');
  }

  /** Attach direct click handlers to interactive elements so they work regardless of overlays */
  _attachDirectHandlers(doc) {
    const self = this;
    
    // Helper to find elements by partial data-figma-name match
    // Helper to find elements by partial data-figma-name match OR CSS class match
    const findByName = (pattern) => {
      const results = [];
      const patternLower = pattern.toLowerCase();
      // Search by data-figma-name
      doc.querySelectorAll('[data-figma-name]').forEach(el => {
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        if (fname.includes(patternLower)) results.push(el);
      });
      // Also search by CSS class (for local mode ASPX elements)
      doc.querySelectorAll('[class]').forEach(el => {
        if (results.includes(el)) return; // skip duplicates
        const cls = (el.getAttribute('class') || '').toLowerCase();
        if (cls.includes(patternLower)) results.push(el);
      });
      return results;
    };
    
    // ── 說明 / 注意事項 button ──
    const ruleButtons = [];
    (this.config.buttons.rules || []).forEach(k => ruleButtons.push(...findByName(k)));
    const uniqueRuleButtons = [...new Set(ruleButtons)];
    uniqueRuleButtons.forEach(el => {
      if (el._directHandler) return; // Prevent duplicate
      el._directHandler = true;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '100';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VisualEditor] Direct: 注意事項/下方按鈕 clicked, name:', el.getAttribute('data-figma-name'));
        self._showQuestionPopup(doc);
      });
    });
    
    // ── 查看結果 / btn_result button ──
    const recordButtons = [];
    (this.config.buttons.record || []).forEach(k => recordButtons.push(...findByName(k)));
    const uniqueRecordButtons = [...new Set(recordButtons)];
    uniqueRecordButtons.forEach(el => {
      if (el._directHandler) return;
      el._directHandler = true;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '100';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VisualEditor] Direct: btn_result clicked');
        self._showRecordPopup(doc);
      });
    });
    
    // ── btn_close button ──
    const closeButtons = [];
    (this.config.buttons.close || []).forEach(k => closeButtons.push(...findByName(k)));
    const uniqueCloseButtons = [...new Set(closeButtons)];
    uniqueCloseButtons.forEach(el => {
      if (el._directHandler) return;
      el._directHandler = true;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '100';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VisualEditor] Direct: btn_close clicked');
        const targetScreen = self.resolvedScreenNames.main;
        const select = window.parent.document.getElementById('select-editor-screen');
        if (select) select.value = targetScreen;
        self.setScreen(targetScreen);
      });
    });
    
    // ── btn_betall / btn_betSure (確定押注) button ──
    const confirmButtons = [];
    (this.config.buttons.confirm || []).forEach(k => confirmButtons.push(...findByName(k)));
    const uniqueConfirmButtons = [...new Set(confirmButtons)];
    uniqueConfirmButtons.forEach(el => {
      if (el._directHandler) return;
      el._directHandler = true;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '100';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VisualEditor] Direct: btn_betall (確認) clicked');
        self._handleBetConfirm();
      });
    });
    
    // ── btn_reselect / btn_betClear (重新選擇) button ──  
    const resetButtons = [];
    (this.config.buttons.clear || []).forEach(k => resetButtons.push(...findByName(k)));
    const uniqueResetButtons = [...new Set(resetButtons)];
    uniqueResetButtons.forEach(el => {
      if (el._directHandler) return;
      el._directHandler = true;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '100';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VisualEditor] Direct: btn_reselect (重新選擇) clicked');
        self._handleBetClear(doc);
      });
    });

    // ── betbox__BetBtn (投注 button on main cards) ── for local mode
    doc.querySelectorAll('.betbox__BetBtn').forEach(el => {
      if (el._directHandler) return;
      el._directHandler = true;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '100';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VisualEditor] Direct: betbox__BetBtn clicked');
        // Determine group vs knockout from card title image
        const card = el.closest('.betbox') || el.closest('.swiper-slide');
        let isGroup = true;
        if (card) {
          const titleImg = card.querySelector('.betbox__title img');
          if (titleImg) {
            const src = (titleImg.getAttribute('src') || '').toLowerCase();
            if (src.includes('bet2_title') || src.includes('text_team') && !src.includes('text_team1') && !src.includes('text_group')) {
              isGroup = false;
            }
          }
          // Also check for nationVs (knockout indicator)
          if (card.querySelector('.nationVs')) {
            isGroup = false;
          }
        }
        const targetScreen = isGroup ? 'betpage-3' : 'betpage-2';
        const select = window.parent.document.getElementById('select-editor-screen');
        if (select) select.value = targetScreen;
        self.setScreen(targetScreen);
      });
    });
  }

  /** Clean up any previously injected UI elements from betting cards.
   *  The Figma design's own images already contain the +/- visuals,
   *  so we do NOT inject additional buttons or overlays. */
  _injectBetButtons(doc) {
    // Remove any previously injected elements (from earlier code versions)
    doc.querySelectorAll('.injected-bet-btn, .injected-overlay-btn, .injected-minus-cover, .injected-minus-bar').forEach(el => el.remove());
  }

  /** Inject Swiper navigation arrow buttons if they're missing in Figma mode */
  _injectSwiperNavigation(doc) {
    if (!doc || !this.isFigmaMode) return;

    // Check if main bet swiper container exists
    const swiperContainer = doc.querySelector('.gamemain-bet') || doc.querySelector('.swiper-container');
    if (!swiperContainer) {
      // Try Figma-generated elements that look like a swiper area
      const mainScreen = doc.querySelector('[data-figma-name*="主畫面"]');
      if (!mainScreen) return;
    }

    // Check for existing navigation elements
    const existingNext = doc.querySelector('#mainBetNext, .swiper-button-next');
    const existingPrev = doc.querySelector('#mainBetPrev, .swiper-button-prev');
    
    // Also check for Figma-rendered arrow image elements
    const arrowElements = Array.from(doc.querySelectorAll('[data-figma-name]')).filter(el => {
      const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
      return name.includes('btn_arrow') || name.includes('arrow') || name.includes('左右按鈕');
    });

    // Make sure arrow elements are visible (they might be hidden due to 403 image errors)
    arrowElements.forEach(el => {
      if (el.style.display === 'none') {
        el.style.display = '';
      }
      // Apply local fallback image if background-image is missing or broken
      const computed = doc.defaultView?.getComputedStyle(el);
      const bgImg = computed?.backgroundImage || el.style.backgroundImage || '';
      const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
      if (!bgImg || bgImg === 'none' || bgImg.includes('undefined')) {
        if (name.includes('next') || name.includes('right')) {
          el.style.backgroundImage = "url('/ingame-assets/images/btn_arrow_next.png')";
          el.style.backgroundSize = 'contain';
          el.style.backgroundRepeat = 'no-repeat';
          el.style.backgroundPosition = 'center';
        } else if (name.includes('prev') || name.includes('left')) {
          el.style.backgroundImage = "url('/ingame-assets/images/btn_arrow_prev.png')";
          el.style.backgroundSize = 'contain';
          el.style.backgroundRepeat = 'no-repeat';
          el.style.backgroundPosition = 'center';
        }
      }
      // Ensure they're clickable
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '50';
    });

    // If no navigation exists at all, inject Swiper nav buttons
    if (!existingNext && !existingPrev && arrowElements.length === 0) {
      const container = swiperContainer || doc.querySelector('[data-figma-name*="主畫面"]');
      if (!container) return;

      const navNext = doc.createElement('div');
      navNext.id = 'mainBetNext';
      navNext.className = 'swiper-button-next injected-nav';
      navNext.style.cssText = `
        position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
        width: 40px; height: 80px; z-index: 100; cursor: pointer; pointer-events: auto;
        background: url('/ingame-assets/images/btn_arrow_next.png') center/contain no-repeat;
      `;

      const navPrev = doc.createElement('div');
      navPrev.id = 'mainBetPrev';
      navPrev.className = 'swiper-button-prev injected-nav';
      navPrev.style.cssText = `
        position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
        width: 40px; height: 80px; z-index: 100; cursor: pointer; pointer-events: auto;
        background: url('/ingame-assets/images/btn_arrow_prev.png') center/contain no-repeat;
      `;

      container.style.position = container.style.position || 'relative';
      container.appendChild(navNext);
      container.appendChild(navPrev);
      console.log('[VisualEditor] Injected Swiper navigation arrows');
    }

    console.log('[VisualEditor] Swiper navigation check complete, arrow elements found:', arrowElements.length);
  }

  _setupInteractions() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    if (this._interactionsSetup) return;
    this._interactionsSetup = true;

    // ── Hover highlight ──
    iframeDoc.addEventListener('mouseover', (e) => {
      if (!this.editMode) return;
      if (this._dragState) return;
      const el = e.target;
      if (this._isEditorElement(el)) return;
      if (el === iframeDoc.body || el === iframeDoc.documentElement) return;
      iframeDoc.querySelectorAll('[data-editor-hover]').forEach(n => n.removeAttribute('data-editor-hover'));
      el.setAttribute('data-editor-hover', '');
    });

    iframeDoc.addEventListener('mouseout', (e) => {
      if (!this.editMode) return;
      if (this._dragState) return;
      e.target.removeAttribute('data-editor-hover');
    });

    // ── Left click: select, drag, or resize ──
    iframeDoc.addEventListener('mousedown', (e) => {
      this._closeLayerPicker();

      if (!this.editMode) {
        if (e.target && e.target.tagName === 'INPUT') return;
        // In browse mode, still allow selecting Figma elements to show properties
        const el = e.target;
        if (el && el.closest && el.closest('[data-figma-name]') && !this._isEditorElement(el)) {
          // Find the nearest element with data-figma-name
          const figmaEl = el.hasAttribute('data-figma-name') ? el : el.closest('[data-figma-name]');
          if (figmaEl && figmaEl !== iframeDoc.body) {
            this.selectElement(figmaEl);
          }
        }
        return; // let normal clicks through for ingame mode
      }

      const el = e.target;
      if (el.classList.contains('editor-drag-resize-handle')) {
        e.preventDefault();
        e.stopPropagation();
        this._startResize(el, e);
        return;
      }

      if (this._isEditorElement(el)) return;
      if (el === iframeDoc.body || el === iframeDoc.documentElement) return;

      // ── Skip interactive elements in edit mode so click handlers still fire ──
      // Check if the clicked element (or any ancestor) has a _directHandler flag
      // set by _attachDirectHandlers, or is an interactive form element
      const isInteractive = (() => {
        let node = el;
        for (let i = 0; i < 8 && node && node !== iframeDoc.body; i++) {
          if (node._directHandler) return true;
          // Check for interactive CSS classes (local mode buttons)
          const cls = typeof node.className === 'string' ? node.className.toLowerCase() : '';
          if (cls.includes('btn_bet') || cls.includes('btn-reduce') || cls.includes('btn-add') ||
              cls.includes('btn_close') || cls.includes('btn__question') || cls.includes('btn__record') ||
              cls.includes('betbox__betbtn')) return true;
          node = node.parentElement;
        }
        // Also check if it's a form input element
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'button' || tag === 'select' || tag === 'textarea') return true;
        return false;
      })();

      if (isInteractive) {
        // Let the click event fire naturally for interactive elements
        // Still select the element for property display without starting drag
        this.selectElement(el);
        return;
      }

      e.preventDefault();

      // Check if we clicked the already selected element or one of its child elements.
      if (this.selectedElement) {
        if (this.selectedElement === el || this.selectedElement.contains(el)) {
          // Always keep the current selection and start drag when clicking inside it
          this._startDrag(this.selectedElement, e);
          return;
        }
      }

      if (el.hasAttribute('data-editor-selected') || el.closest('[data-editor-selected]')) {
        const dragTarget = el.hasAttribute('data-editor-selected') ? el : el.closest('[data-editor-selected]');
        this._startDrag(dragTarget, e);
        return;
      }

      this.selectElement(el);
    });

    // ── Click navigation (works in BOTH edit and browse mode) ──
    iframeDoc.addEventListener('click', (e) => {
      // 1. In local browse mode, do not intercept clicks, let the page run normally!
      if (!this.isFigmaMode && !this.editMode) {
        return;
      }

      // 2. Ignore input elements to let them focus and be typed in
      if (e.target && e.target.tagName === 'INPUT') {
        return;
      }

      // Skip if we just finished dragging (edit mode drag-and-drop)
      if (this._justDragged) {
        this._justDragged = false;
        return;
      }

      // Close stage dropdown if clicking elsewhere
      const stageMenu = iframeDoc.getElementById('mock-stage-dropdown');
      if (stageMenu && !e.target.closest('#mock-stage-dropdown') && !e.target.closest('[data-figma-name*="switch"]') && !e.target.closest('[data-figma-name*="top_l"]') && !e.target.closest('[data-figma-name*="賽季"]')) {
        stageMenu.style.display = 'none';
      }

      // ── Deep click detection using elementsFromPoint ──
      // Figma exports sometimes layer decorative elements (亮, win, etc.) on top of
      // interactive buttons, blocking normal click detection. Use elementsFromPoint
      // to find ALL elements at the click position, including those under overlays.
      const _allElementsAtPoint = iframeDoc.elementsFromPoint 
        ? iframeDoc.elementsFromPoint(e.clientX, e.clientY) 
        : [e.target];
      
      // Helper to check if element is actually visible in the DOM
      const isElementVisible = (el) => {
        let current = el;
        while (current && current !== iframeDoc.body && current !== iframeDoc.documentElement) {
          const style = iframeDoc.defaultView?.getComputedStyle(current) || current.style;
          if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
            return false;
          }
          current = current.parentElement;
        }
        return true;
      };

      // Check for interactive Figma buttons among ALL elements at click position
      const INTERACTIVE_PATTERNS = {
        question: ['注意事項', '說明', '規則', 'btn_question', 'btn__question', 'btn-question', 'question', '?', '問號'],
        result: ['btn_result', 'btn__result', 'btn_record', 'btn__record', '查看結果', '察看結果', 'record', 'btn_resultpng'],
        bet: ['投注', '押注', '展開投注', 'betbtn', 'betbox_betbtn', 'betbox__betbtn'],
        stageDropdown: ['switch', 'top_l', '切分組', '賽季', 'dropdown'],
        confirm: ['betall', 'btn_betall', 'btn__betall', '確定押注', '確定投注', '確認', 'btn_betsure', 'btn_okpng', 'btn_ok.png'],
        clear: ['reselect', 'btn_reselect', 'btn__reselect', '重新選擇', '重新', 'btn_betclear', 'btn_reselectpng'],
        close: ['btn_close', 'btn__close', 'close', '關閉']
      };

      // Find the deepest interactive element among all elements at the click point
      let deepInteractive = null;
      let deepInteractiveType = null;

      // Determine the main screen element to filter out its children when on a popup
      const _currentScreenForFilter = this.currentScreen || '';
      const _isOnPopupScreen = _currentScreenForFilter.includes('投注') ||
                               _currentScreenForFilter.includes('betpage') ||
                               _currentScreenForFilter === this.resolvedScreenNames.bet1 ||
                               _currentScreenForFilter === this.resolvedScreenNames.bet2;
      let _mainScreenEl = null;
      if (_isOnPopupScreen && iframeDoc) {
        _mainScreenEl = iframeDoc.querySelector('[data-figma-name*="主畫面"]');
      }

      for (const el of _allElementsAtPoint) {
        if (el === iframeDoc.body || el === iframeDoc.documentElement) continue;
        if (!isElementVisible(el)) continue; // Skip hidden elements

        // When on a popup screen (betting), skip elements that belong to the main screen DOM tree
        if (_isOnPopupScreen && _mainScreenEl && _mainScreenEl.contains(el) && !el.closest('[data-figma-name*="投注"]')) {
          continue;
        }
        const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        const id = (el.id || '').toLowerCase();
        const identifier = `${fname}|${className}|${id}`;
        
        for (const [type, patterns] of Object.entries(INTERACTIVE_PATTERNS)) {
          if (patterns.some(p => identifier.includes(p.toLowerCase()))) {
            deepInteractive = el;
            deepInteractiveType = type;
            break;
          }
        }
        if (deepInteractive) break;
      }

      // Handle deep-detected interactive element clicks
      if (deepInteractive && deepInteractiveType) {
        if (deepInteractiveType === 'question') {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] Deep detect: 說明/注意事項 clicked');
          this._showQuestionPopup(iframeDoc);
          return;
        }
        if (deepInteractiveType === 'result') {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] Deep detect: 查看結果 clicked');
          this._showRecordPopup(iframeDoc);
          return;
        }
        if (deepInteractiveType === 'confirm') {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] Deep detect: 確認押注 clicked');
          this._handleBetConfirm();
          return;
        }
        if (deepInteractiveType === 'clear') {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] Deep detect: 重新選擇 clicked');
          this._handleBetClear(iframeDoc);
          return;
        }
        if (deepInteractiveType === 'close') {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] Deep detect: 關閉 clicked');
          this._handleBetClose();
          return;
        }
        if (deepInteractiveType === 'bet') {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] Deep detect: 投注 clicked');
          const targetScreen = this.resolvedScreenNames.bet1 || '投注畫面1 1';
          const select = window.parent.document.getElementById('select-editor-screen');
          if (select) {
            select.value = targetScreen;
          }
          this.setScreen(targetScreen);
          return;
        }
      }

      // 1. Check backdrop close and standard HTML close button clicks
      const isBackdrop = e.target.classList.contains('ingame__popup--bg');
      const isHtmlClose = e.target.classList.contains('btn-close') || e.target.closest('.btn-close');
      if (isBackdrop || isHtmlClose) {
        e.preventDefault();
        e.stopPropagation();
        const popup = iframeDoc.querySelector('.popup');
        const bg = iframeDoc.querySelector('.ingame__popup--bg');
        if (popup) popup.classList.remove('show');
        if (bg) bg.classList.remove('show');
        iframeDoc.querySelectorAll('.popup__main').forEach(el => el.classList.remove('show'));

        // If currently displaying a figma betting frame overlay, return to Main Screen
        if (this.currentScreen !== this.resolvedScreenNames.main && this.currentScreen !== 'main' && this.currentScreen !== '__all__') {
          const targetScreen = this.resolvedScreenNames.main;
          const select = window.parent.document.getElementById('select-editor-screen');
          if (select) {
            select.value = targetScreen;
          }
          this.setScreen(targetScreen);
        }
        return;
      }

      // ── Betting screen +/- and button interactions ──
      const _currentScreen = this.currentScreen || '';
      const _isBettingScreen = _currentScreen.includes('投注畫面') ||
                                _currentScreen === 'betpage-3' ||
                                _currentScreen === 'betpage-2';

      // Collect ALL figma-name, class, alt, and text from the entire ancestor chain
      // This is essential because Figma exports everything as images — textContent is empty
      const _collectAncestorInfo = (target, maxDepth = 10) => {
        const names = [];
        const texts = [];
        let el = target;
        for (let i = 0; i < maxDepth && el && el !== iframeDoc.body; i++) {
          const fn = el.getAttribute('data-figma-name');
          if (fn) names.push(fn);
          const alt = el.getAttribute('alt');
          if (alt) names.push(alt);
          const cls = typeof el.className === 'string' ? el.className : '';
          if (cls) names.push(cls);
          const t = (el.textContent || '').trim();
          if (t && t.length < 20 && el.children.length === 0) texts.push(t);
          el = el.parentElement;
        }
        return { names, texts, chain: names.join('|').toLowerCase(), textChain: texts.join('|') };
      };

      if (_isBettingScreen) {
        // ── Direct click-to-edit on numeric elements in betting screen ──
        const clickedText = e.target.textContent ? e.target.textContent.trim() : '';
        const isLeafNode = e.target.children.length === 0;
        const isNumericLeaf = isLeafNode && /^\d+$/.test(clickedText);
        if (isNumericLeaf) {
          // Check that this click was NOT triggered via +/- button ancestors
          const info0 = _collectAncestorInfo(e.target, 3);
          const chain0 = info0.chain;
          const isFromPlusMinus = chain0.includes('+') || chain0.includes('＋') ||
                                  chain0.includes('add') || chain0.includes('plus') ||
                                  chain0.includes('reduce') || chain0.includes('minus');
          if (!isFromPlusMinus) {
            e.preventDefault();
            e.stopPropagation();
            this._startInlineEdit(e.target, true, false, '');
            return;
          }
        }
        const info = _collectAncestorInfo(e.target);
        const chain = info.chain;

        // +/- button detection: check figma names for literal +/- AND keywords
        const isAddBtn = chain.includes('+') || chain.includes('＋') ||
                         chain.includes('add') || chain.includes('plus') ||
                         chain.includes('btn-add') || chain.includes('increase') ||
                         info.textChain.includes('+') || info.textChain.includes('＋');
        const isReduceBtn = chain.includes('reduce') || chain.includes('minus') ||
                           chain.includes('btn-reduce') || chain.includes('decrease') ||
                           info.textChain.includes('-') || info.textChain.includes('－') || info.textChain.includes('−');
        // Disambiguate: avoid false positive where '-' appears in class names like "page-1"
        const hasLiteralMinus = info.names.some(n => n === '-' || n === '－' || n === '−');

        if (isAddBtn && !isReduceBtn) {
          e.preventDefault();
          e.stopPropagation();
          this._adjustBetNumber(e.target, iframeDoc, +1);
          return;
        }
        if ((isReduceBtn || hasLiteralMinus) && !isAddBtn) {
          e.preventDefault();
          e.stopPropagation();
          this._adjustBetNumber(e.target, iframeDoc, -1);
          return;
        }

        // Button detection using full ancestor chain (includes Figma names like btn_betall, btn_reselect)
        const isClearBtn = chain.includes('重新') || chain.includes('clear') || chain.includes('reselect') || chain.includes('btn_reselect') || chain.includes('btn_betclear');
        const isConfirmBtn = chain.includes('betall') || chain.includes('btn_betall') || chain.includes('確定') || chain.includes('確認') || chain.includes('confirm') || chain.includes('sure') || chain.includes('btn_betsure') || chain.includes('btn_okpng');
        const isCloseBtn = chain.includes('close') || chain.includes('關閉') || chain.includes('btn_close');

        // Fallback: position-based detection for bottom buttons
        if (!isClearBtn && !isConfirmBtn && !isCloseBtn) {
          const betScreenEl = iframeDoc.querySelector('[data-figma-name*="投注畫面"]');
          if (betScreenEl && betScreenEl.style.display !== 'none') {
            const screenRect = betScreenEl.getBoundingClientRect();
            const clickY = e.clientY;
            const clickX = e.clientX;
            const relY = (clickY - screenRect.top) / screenRect.height;
            const relX = (clickX - screenRect.left) / screenRect.width;

            // Bottom 15% of screen = button area
            if (relY > 0.85 && relY <= 1.0) {
              e.preventDefault();
              e.stopPropagation();
              if (relX < 0.5) {
                // Left button = 重新選擇
                this._handleBetClear(iframeDoc);
              } else {
                // Right button = 確定押注
                this._handleBetConfirm();
              }
              return;
            }
            // Top-right corner = close button (X)
            if (relY < 0.12 && relX > 0.88) {
              e.preventDefault();
              e.stopPropagation();
              this._handleBetClose();
              return;
            }
          }
        }

        if (isClearBtn) {
          e.preventDefault();
          e.stopPropagation();
          this._handleBetClear(iframeDoc);
          return;
        }
        if (isConfirmBtn) {
          e.preventDefault();
          e.stopPropagation();
          this._handleBetConfirm();
          return;
        }
        if (isCloseBtn) {
          e.preventDefault();
          e.stopPropagation();
          this._handleBetClose();
          return;
        }
      }

      // ── Handle 說明/規則/查看結果 button (figma-name + text + position, any screen) ──
      {
        // When on betting popup, skip if clicked element belongs to main screen subtree (click-through prevention)
        const _curScreen = this.currentScreen || '';
        const _onBetPopup = _curScreen.includes('投注') || _curScreen.includes('betpage') ||
                            _curScreen === this.resolvedScreenNames.bet1 || _curScreen === this.resolvedScreenNames.bet2;
        const _mainEl = _onBetPopup ? iframeDoc.querySelector('[data-figma-name*="主畫面"]') : null;
        const _isFromMainScreen = _mainEl && _mainEl.contains(e.target) && !e.target.closest('[data-figma-name*="投注"]');

        const info = _collectAncestorInfo(e.target, 8);
        const chain = info.chain;

        // 說明/規則 button (includes 注意事項 from Figma naming)
        if (!_isFromMainScreen &&
            (chain.includes('說明') || chain.includes('規則') || chain.includes('question') ||
            chain.includes('btn_question') || chain.includes('btn__question') || chain.includes('btn-question') || chain.includes('注意事項') ||
            chain.includes('?') || chain.includes('❓') ||
            info.textChain.includes('?') || info.textChain.includes('❓') ||
            info.textChain.includes('說明') || info.textChain.includes('規則'))) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] 說明/注意事項 button clicked, showing popup');
          this._showQuestionPopup(iframeDoc);
          return;
        }

        // 查看結果 button
        if (!_isFromMainScreen &&
            (chain.includes('結果') || chain.includes('record') || chain.includes('btn_result') || chain.includes('btn__result') || chain.includes('btn_record') || chain.includes('btn__record') ||
            info.textChain.includes('結果') || info.textChain.includes('查看'))) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[VisualEditor] 查看結果 button clicked, showing popup');
          this._showRecordPopup(iframeDoc);
          return;
        }
      }

      // 2. Click to edit values for number text nodes (skip on betting screens — handled by +/- above)
      if (!_isBettingScreen) {
        const clickedText = e.target.textContent ? e.target.textContent.trim() : '';
        const isNumericNode = /^\d+$/.test(clickedText);
        const isMyBetNode = /^我已投注:\s*\d+$/.test(clickedText) || /^我已投注\s*\d+$/.test(clickedText);
        if (isNumericNode || isMyBetNode) {
          e.preventDefault();
          e.stopPropagation();
          this._startInlineEdit(e.target, true, isMyBetNode, clickedText);
          return;
        }
      }

      // 2b. Fallback: if clicking inside a betting card container in figma betting overlay,
      // first check if it is active. If not, swap active state. If active, prompt for quantity.
      const isBettingOverlay = (this.currentScreen || '').includes('投注畫面');
      if (isBettingOverlay) {
        const cardEl = e.target.closest('[data-figma-name="_a"]') || 
                       e.target.closest('[data-figma-name="_b"]') || 
                       e.target.closest('[data-figma-name="_c"]') || 
                       e.target.closest('[data-figma-name*="item_block_bg"]') || 
                       e.target.closest('[class*="item_block_bg"]');
        if (cardEl) {
          const screenContainer = cardEl.closest(`[data-figma-name="${this.resolvedScreenNames.bet1}"]`) || 
                                  cardEl.closest(`[data-figma-name="${this.resolvedScreenNames.bet2}"]`);
          if (screenContainer) {
            const allCards = Array.from(screenContainer.querySelectorAll(
              '[data-figma-name="_a"], [data-figma-name="_b"], [data-figma-name="_c"], [data-figma-name*="item_block_bg"], [class*="item_block_bg"]'
            )).filter(c => c.parentNode === cardEl.parentNode);
            
            const activeCard = allCards.find(c => {
              const name = (c.getAttribute('data-figma-name') || '').toLowerCase();
              const cls = c.className || '';
              return name === '_b' || cls.includes('item_block_bg1');
            });
            
            if (activeCard && activeCard !== cardEl) {
              e.preventDefault();
              e.stopPropagation();
              
              // Swap backgrounds by swapping class names
              const activeClass = activeCard.className;
              const clickedClass = cardEl.className;
              activeCard.className = clickedClass;
              cardEl.className = activeClass;
              
              // Swap controls (active: 57/key_point, inactive: 58)
              const activeControls = Array.from(activeCard.querySelectorAll('*')).filter(el => {
                const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
                const cls = (el.className || '').toLowerCase();
                return name.includes('57') || name.includes('key_point') || cls.includes('57') || cls.includes('key_point');
              });
              
              const inactiveControls = Array.from(cardEl.querySelectorAll('*')).filter(el => {
                const name = (el.getAttribute('data-figma-name') || '').toLowerCase();
                const cls = (el.className || '').toLowerCase();
                return name.includes('58') || cls.includes('58');
              });
              
              if (activeControls.length > 0 && inactiveControls.length > 0) {
                activeControls.forEach((actEl, idx) => {
                  const inactEl = inactiveControls[idx];
                  if (inactEl) {
                    const parentAct = actEl.parentNode;
                    const parentInact = inactEl.parentNode;
                    const nextAct = actEl.nextSibling;
                    const nextInact = inactEl.nextSibling;
                    
                    parentAct.insertBefore(inactEl, nextAct);
                    parentInact.insertBefore(actEl, nextInact);
                  }
                });
              }
              
              if (this.onContentChange) this.onContentChange();
              return;
            }
          }

          // Active card clicked — no prompt needed, use +/- buttons instead
        }
      }

      if (_isBettingScreen) {
        // Prevent clicking inside active betting screens from bubbling up or triggering screen switches
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Find if we clicked on an interactive button
      let target = e.target;
      let figmaName = '';
      let figmaEl = null;

      // Bubble up the ancestor list up to the body/documentElement
      // to check if any parent has a figma name matching an interactive class
      let current = target;
      let firstFigmaEl = null;
      while (current && current !== iframeDoc.body && current !== iframeDoc.documentElement) {
        if (current.hasAttribute('data-figma-name')) {
          const name = current.getAttribute('data-figma-name') || '';
          if (!firstFigmaEl) {
            firstFigmaEl = current;
          }
          const nameLower = name.toLowerCase();
          const matchesAction = 
            nameLower.includes('switch') || nameLower.includes('top_l') || nameLower.includes('切分組') || nameLower.includes('賽季') || nameLower.includes('dropdown') ||
            nameLower.includes('注意事項') || nameLower.includes('說明') || nameLower.includes('規則') || nameLower.includes('問號') || nameLower.includes('?') || nameLower.includes('question') || nameLower.includes('btn_question') || nameLower.includes('btn__question') ||
            nameLower.includes('btn_result') || nameLower.includes('btn__result') || nameLower.includes('btn_record') || nameLower.includes('btn__record') || nameLower.includes('查看結果') || nameLower.includes('察看結果') || nameLower.includes('結果') || nameLower.includes('record') ||
            nameLower.includes('btn_ok') || nameLower.includes('投注') || nameLower.includes('押注') || nameLower.includes('展開投注') || nameLower.includes('betbtn') || nameLower.includes('betbox_betbtn') ||
            nameLower.includes('betall') || nameLower.includes('btn_betall') || nameLower.includes('btn__betall') || nameLower.includes('sure') || nameLower.includes('confirm') || nameLower.includes('確定押注') || nameLower.includes('確定投注') || nameLower.includes('確認') ||
            nameLower.includes('reselect') || nameLower.includes('clear') || nameLower.includes('btn_reselect') || nameLower.includes('btn__reselect') || nameLower.includes('重新選擇') || nameLower.includes('重新') ||
            nameLower.includes('btn_close') || nameLower.includes('btn__close') || nameLower.includes('close') || nameLower.includes('回到') || nameLower.includes('關閉');

          if (matchesAction) {
            figmaEl = current;
            figmaName = name;
            break;
          }
        }
        current = current.parentElement;
      }

      if (!figmaEl) {
        figmaEl = firstFigmaEl;
        figmaName = figmaEl ? figmaEl.getAttribute('data-figma-name') : '';
      }

      if (!figmaEl) return;

      const nameLower = figmaName.toLowerCase();
      
      // Pre-calculate if knockout stage is active
      let isKnockout = false;
      const activeImg = iframeDoc.querySelector('.gameswitch--active img') || iframeDoc.querySelector('#gsSwitchActive img');
      if (activeImg) {
        const src = (activeImg.getAttribute('src') || '').toLowerCase();
        if (src.includes('text_team') && !src.includes('text_team1')) {
          isKnockout = true;
        }
      }
      
      const iframeWin = iframeDoc.defaultView || iframeDoc.parentWindow;
      if (iframeWin && iframeWin.g_selectedStageKey) {
        const selectedStageKey = iframeWin.g_selectedStageKey;
        if (iframeWin.getStageData) {
          const stageData = iframeWin.getStageData(selectedStageKey);
          if (stageData && !stageData.isGroupStage) {
            isKnockout = true;
          }
        } else if (selectedStageKey !== 'GROUP') {
          isKnockout = true;
        }
      }
      if (this._currentStage && this._currentStage !== 'text_team1.png') {
        isKnockout = true;
      }
      if (!isKnockout) {
        // 1. Check if the active visible dropdown image indicates a knockout stage
        const dropdownImages = iframeDoc.querySelectorAll('[data-figma-name*="switch"] img, [data-figma-name*="top_l"] img, [class*="top_l"] img, [class*="switch"] img');
        for (const img of dropdownImages) {
          const computed = iframeDoc.defaultView.getComputedStyle(img);
          if (computed.display !== 'none' && computed.visibility !== 'hidden') {
            const src = (img.getAttribute('src') || '').toLowerCase();
            const alt = (img.getAttribute('alt') || '').toLowerCase();
            if ((src.includes('text_team') && !src.includes('text_team1')) ||
                alt.includes('淘汰') || alt.includes('16強') || alt.includes('32強') || alt.includes('決賽') || alt.includes('準決')) {
              isKnockout = true;
              break;
            }
          }
        }
      }
      if (!isKnockout) {
        // 2. Check if any currently visible Figma element has knockout keywords
        const knockoutKeywords = ['淘汰', '16強', '32強', '決賽', '準決', 'knockout', 'betbox2', 'bet2'];
        const allElements = iframeDoc.querySelectorAll('[data-figma-name]');
        for (const el of allElements) {
          const comp = iframeDoc.defaultView.getComputedStyle(el);
          if (comp.display !== 'none' && comp.visibility !== 'hidden') {
            const fname = (el.getAttribute('data-figma-name') || '').toLowerCase();
            if (knockoutKeywords.some(k => fname.includes(k))) {
              isKnockout = true;
              break;
            }
          }
        }
      }
      if (!isKnockout && figmaEl) {
        let parent = figmaEl;
        while (parent && parent !== iframeDoc.body) {
          const fname = (parent.getAttribute('data-figma-name') || '').toLowerCase();
          const parentText = parent.textContent || '';
          
          let hasKnockoutImg = false;
          const imgs = parent.querySelectorAll('img');
          for (const img of imgs) {
            const alt = (img.getAttribute('alt') || '').toLowerCase();
            const src = (img.getAttribute('src') || '').toLowerCase();
            if (alt.includes('淘汰') || alt.includes('16強') || alt.includes('32強') || alt.includes('決賽') || alt.includes('準決') ||
                src.includes('bet2_title') || (src.includes('text_team') && !src.includes('text_team1'))) {
              hasKnockoutImg = true;
              break;
            }
          }

          if (fname.includes('淘汰') || fname.includes('16強') || fname.includes('32強') || 
              fname.includes('決賽') || fname.includes('準決') || fname.includes('knockout') ||
              fname.includes('betbox2') || fname.includes('bet2') ||
              parentText.includes('準決') || parentText.includes('淘汰') || 
              parentText.includes('16強') || parentText.includes('32強') || parentText.includes('決賽') ||
              hasKnockoutImg ||
              parent.querySelector('.nationVs') ||
              parent.classList.contains('nationVs')) {
            isKnockout = true;
            break;
          }
          parent = parent.parentElement;
        }
      }

      // Determine action based on name or annotations
      const isQuestion = nameLower.includes('注意事項') || nameLower.includes('說明') || nameLower.includes('規則') || nameLower.includes('問號') || nameLower.includes('?') || nameLower.includes('question') || nameLower.includes('btn_question') || nameLower.includes('btn__question') || nameLower.includes('btn-question');
      const isResult = nameLower.includes('btn_result') || nameLower.includes('btn__result') || nameLower.includes('查看結果') || nameLower.includes('察看結果') || nameLower.includes('結果') || nameLower.includes('record') || nameLower.includes('btn_record') || nameLower.includes('btn__record');
      const isBet = nameLower.includes('btn_ok') || nameLower.includes('投注') || nameLower.includes('押注') || nameLower.includes('展開投注') || nameLower.includes('betbtn') || nameLower.includes('betbox_betbtn');
      const isConfirm = nameLower.includes('betall') || nameLower.includes('sure') || nameLower.includes('confirm') || nameLower.includes('確定押注') || nameLower.includes('確定投注') || nameLower.includes('確認');
      const isClear = nameLower.includes('reselect') || nameLower.includes('clear') || nameLower.includes('重新選擇') || nameLower.includes('重新');
      const isClose = nameLower.includes('btn_close') || nameLower.includes('close') || nameLower.includes('回到') || nameLower.includes('關閉');
      const isStageDropdown = nameLower.includes('switch') || nameLower.includes('top_l') || nameLower.includes('切分組') || nameLower.includes('賽季') || nameLower.includes('dropdown');

      if (isStageDropdown) {
        e.preventDefault();
        e.stopPropagation();
        
        let menu = iframeDoc.getElementById('mock-stage-dropdown');
        if (!menu) {
          menu = iframeDoc.createElement('div');
          menu.id = 'mock-stage-dropdown';
          menu.style.cssText = `
            position: absolute;
            background: rgba(13, 17, 23, 0.95);
            border: 1px solid rgba(88, 166, 255, 0.4);
            border-radius: 6px;
            padding: 4px;
            z-index: 10000;
            display: none;
            flex-direction: column;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          `;
          
          const stages = [
            { name: '分組賽', file: 'text_team1.png' },
            { name: '32強', file: 'text_team2.png' },
            { name: '16強', file: 'text_team3.png' },
            { name: '冠軍決賽', file: 'text_team7.png' }
          ];
          
          stages.forEach(st => {
            const item = iframeDoc.createElement('div');
            item.textContent = st.name;
            item.style.cssText = `
              padding: 8px 16px;
              color: #e6edf3;
              cursor: pointer;
              font-size: 14px;
              border-radius: 4px;
              white-space: nowrap;
              font-family: sans-serif;
            `;
            item.addEventListener('mouseenter', () => { item.style.backgroundColor = 'rgba(88,166,255,0.2)'; });
            item.addEventListener('mouseleave', () => { item.style.backgroundColor = ''; });
            item.addEventListener('click', (ev) => {
              ev.stopPropagation();
              menu.style.display = 'none';
              
              // Find the image element inside the stage dropdown group
              const imgEl = figmaEl.querySelector('img') || figmaEl.querySelector('[class*="text_team"]') || figmaEl.querySelector('[class*="text-team"]');
              if (imgEl) {
                let currentSrc = imgEl.src || '';
                if (currentSrc) {
                  const parts = currentSrc.split('/');
                  parts[parts.length - 1] = st.file;
                  imgEl.src = parts.join('/');
                }
              }
              // Store the current stage selection for knockout detection
              this._currentStage = st.file;
              this._currentStageName = st.name;
              console.log('[VisualEditor] Stage changed to:', st.name, '(' + st.file + ')');
              alert('已切換至賽季階段：' + st.name);
            });
            menu.appendChild(item);
          });
          iframeDoc.body.appendChild(menu);
        }
        
        const rect = figmaEl.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
        return;
      }

      if (isQuestion) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[VisualEditor] isQuestion handler triggered for:', figmaName);
        this._showQuestionPopup(iframeDoc);
      } else if (isResult) {
        e.preventDefault();
        e.stopPropagation();
        const popup = iframeDoc.querySelector('.popup');
        const bg = iframeDoc.querySelector('.ingame__popup--bg');
        const r = iframeDoc.querySelector('.popup-base.record');
        if (popup && bg && r) {
          popup.classList.add('show');
          bg.classList.add('show');
          r.classList.add('show');
        }
      } else if (isBet) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[VisualEditor] Bet clicked, isKnockout:', isKnockout, 'figmaName:', figmaName);
        
        const targetScreen = isKnockout ? this.resolvedScreenNames.bet2 : this.resolvedScreenNames.bet1;
        const select = window.parent.document.getElementById('select-editor-screen');
        if (select) {
          select.value = targetScreen;
        }
        this.setScreen(targetScreen);
      } else if (isConfirm) {
        e.preventDefault();
        e.stopPropagation();
        this._handleBetConfirm();
        return;
      } else if (isClear) {
        e.preventDefault();
        e.stopPropagation();
        this._handleBetClear(iframeDoc);
        return;
      } else if (isClose) {
        if (this.currentScreen !== this.resolvedScreenNames.main && this.currentScreen !== 'main' && this.currentScreen !== '__all__') {
          e.preventDefault();
          e.stopPropagation();
          const targetScreen = this.resolvedScreenNames.main;
          const select = window.parent.document.getElementById('select-editor-screen');
          if (select) {
            select.value = targetScreen;
          }
          this.setScreen(targetScreen);
        }
      }
    });

    // ── Right click: show layer picker for overlapping elements ──
    iframeDoc.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.editMode) return;
      const el = e.target;
      if (el === iframeDoc.body || el === iframeDoc.documentElement) return;

      // Collect all elements at this point (from deepest to shallowest)
      const elements = this._getElementsAtPoint(e.clientX, e.clientY);
      if (elements.length > 1) {
        this._showLayerPicker(e.clientX, e.clientY, elements);
      } else if (elements.length === 1) {
        this.selectElement(elements[0]);
      }
    });

    // ── Mouse move for drag or resize ──
    iframeDoc.addEventListener('mousemove', (e) => {
      if (this._resizeState) {
        e.preventDefault();
        this._onResize(e);
        return;
      }
      if (!this._dragState) return;
      e.preventDefault();
      this._onDrag(e);
    });

    // ── Mouse up to end drag or resize ──
    iframeDoc.addEventListener('mouseup', (e) => {
      if (this._resizeState) {
        e.preventDefault();
        this._endResize(e);
        return;
      }
      if (this._dragState) {
        e.preventDefault();
        this._endDrag(e);
      }
    });

    // ── Prevent click after drag ──
    iframeDoc.addEventListener('click', (e) => {
      if (this._justDragged) {
        e.preventDefault();
        e.stopPropagation();
        this._justDragged = false;
      }
    }, true);

    // ── Double-click: edit text content ──
    iframeDoc.addEventListener('dblclick', (e) => {
      if (!this.editMode) return;
      const el = e.target;
      if (this._isEditorElement(el)) return;
      if (el === iframeDoc.body || el === iframeDoc.documentElement) return;
      // Only allow text editing on leaf elements or elements with direct text
      const hasDirectText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasDirectText && el.children.length > 0) return;
      e.preventDefault();
      e.stopPropagation();
      this._saveUndoState();
      el.setAttribute('contenteditable', 'true');
      el.focus();
      // Select all text
      const range = iframeDoc.createRange();
      range.selectNodeContents(el);
      const sel = iframeDoc.defaultView.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const finishEdit = () => {
        el.removeAttribute('contenteditable');
        el.removeEventListener('blur', finishEdit);
        el.removeEventListener('keydown', onKey);
        if (this.onContentChange) this.onContentChange();
      };
      const onKey = (ke) => {
        if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); finishEdit(); }
        if (ke.key === 'Escape') { ke.preventDefault(); finishEdit(); }
      };
      el.addEventListener('blur', finishEdit);
      el.addEventListener('keydown', onKey);
    });

    // ── Image error detection ──
    this._imageErrors = [];
    const allImages = iframeDoc.querySelectorAll('img');
    const reportErrors = () => {
      if (this._imageErrors.length > 0 && this.onImageErrors) {
        this.onImageErrors(this._imageErrors);
      }
    };
    const debouncedReport = (() => {
      let timer;
      return () => { clearTimeout(timer); timer = setTimeout(reportErrors, 1000); };
    })();

    allImages.forEach(img => {
      if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) {
        const w = img.getAttribute('width') || img.style.width || 'auto';
        const h = img.getAttribute('height') || img.style.height || 'auto';
        this._imageErrors.push({ src: img.src, size: `${w}×${h}`, type: 'img' });
        debouncedReport();
      }
      img.addEventListener('error', () => {
        if (img.src && !img.src.startsWith('data:')) {
          const w = img.getAttribute('width') || img.style.width || 'auto';
          const h = img.getAttribute('height') || img.style.height || 'auto';
          this._imageErrors.push({ src: img.src, size: `${w}×${h}`, type: 'img' });
          debouncedReport();
        }
      });
    });

    // Also check elements with background-image
    iframeDoc.querySelectorAll('*').forEach(el => {
      const bg = el.style.backgroundImage || iframeDoc.defaultView.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
        if (match && match[1] && !match[1].startsWith('data:') && !match[1].startsWith('linear-gradient')) {
          const testImg = new Image();
          testImg.onerror = () => {
            this._imageErrors.push({ src: match[1], size: 'bg', type: 'background' });
            debouncedReport();
          };
          testImg.src = match[1];
        }
      }
    });

    // ── Keyboard: arrow nudge, delete ──
    iframeDoc.addEventListener('keydown', (e) => {
      const keyLower = e.key.toLowerCase();
      
      // Ctrl+S: Save
      if ((e.ctrlKey || e.metaKey) && keyLower === 's') {
        e.preventDefault();
        if (this.onSaveShortcut) {
          this.onSaveShortcut();
        } else {
          const saveBtn = window.parent?.document?.getElementById('btn-save-code') || window.parent?.document?.getElementById('btn-save');
          if (saveBtn) saveBtn.click();
        }
        return;
      }
      
      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && keyLower === 'z') {
        e.preventDefault();
        this.undo();
        return;
      }

      // Ctrl+Y / Ctrl+Shift+Z: Redo
      if (((e.ctrlKey || e.metaKey) && keyLower === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'z')) {
        e.preventDefault();
        this.redo();
        return;
      }

      if (e.key === 'Escape') {
        this._closeLayerPicker();
        return;
      }
      if (!this.editMode) return;

      const selected = iframeDoc.querySelector('[data-editor-selected]');
      if (!selected) return;

      const step = e.shiftKey ? 10 : 1;
      let moved = false;

      switch (e.key) {
        case 'ArrowUp':    this._nudgeElement(selected, 0, -step); moved = true; break;
        case 'ArrowDown':  this._nudgeElement(selected, 0, step);  moved = true; break;
        case 'ArrowLeft':  this._nudgeElement(selected, -step, 0); moved = true; break;
        case 'ArrowRight': this._nudgeElement(selected, step, 0);  moved = true; break;
        case 'Delete':
        case 'Backspace':
          this._saveUndoState();
          selected.remove();
          this.selectElement(null);
          if (this.onContentChange) this.onContentChange();
          break;
      }

      if (moved) {
        e.preventDefault();
        this._refreshSelectedProps(selected);
      }
    });

    // ── Monitor popup state to sync the toolbar dropdown ──
    const popupEl = iframeDoc.querySelector('.popup');
    if (popupEl) {
      const observer = new MutationObserver(() => {
        let currentScreen = 'main';
        if (popupEl.classList.contains('show')) {
          const isQuestion = iframeDoc.querySelector('.popup-base.question')?.classList.contains('show');
          const isRecord = iframeDoc.querySelector('.popup-base.record')?.classList.contains('show');
          const isBetpage = iframeDoc.querySelector('.popup-bet.betpage')?.classList.contains('show');
          
          if (isQuestion) {
            currentScreen = 'question';
          } else if (isRecord) {
            currentScreen = 'record';
          } else if (isBetpage) {
            const predictBox = iframeDoc.getElementById('betPredictBox');
            const predictVisible = predictBox && predictBox.style.display !== 'none';
            currentScreen = predictVisible ? 'betpage-3' : 'betpage-2';
          }
        }
        
        if (this.currentScreen !== currentScreen) {
          // Only auto-sync for popup states, don't override main state variants
          if (currentScreen === 'main' && (this.currentScreen === 'main-allactive' || this.currentScreen === 'main-allended')) {
            // Keep the current main variant
          } else {
            this.currentScreen = currentScreen;
            const select = document.getElementById('select-editor-screen');
            if (select) {
              let val = currentScreen;
              if (currentScreen === 'main') val = this.resolvedScreenNames.main;
              else if (currentScreen === 'question') val = this.resolvedScreenNames.main;
              else if (currentScreen === 'record') val = this.resolvedScreenNames.main;
              else if (currentScreen === 'betpage-3') val = this.resolvedScreenNames.bet1;
              else if (currentScreen === 'betpage-2') val = this.resolvedScreenNames.bet2;
              
              if (select.querySelector(`option[value="${val}"]`)) {
                select.value = val;
              } else if (select.querySelector(`option[value="${currentScreen}"]`)) {
                select.value = currentScreen;
              }
            }
          }
        }
      });
      
      observer.observe(popupEl, { attributes: true, attributeFilter: ['class'] });
      iframeDoc.querySelectorAll('.popup__main').forEach(el => {
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
      
      const predictBox = iframeDoc.getElementById('betPredictBox');
      const gameBox = iframeDoc.getElementById('betGameBox');
      if (predictBox) observer.observe(predictBox, { attributes: true, attributeFilter: ['style'] });
      if (gameBox) observer.observe(gameBox, { attributes: true, attributeFilter: ['style'] });
    }
  }

  // ── Layer Picker (for overlapping elements) ──

  _getElementsAtPoint(x, y) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return [];

    const results = [];
    const seen = new Set();

    // Get elements from the deepest point up
    let el = iframeDoc.elementFromPoint(x, y);
    while (el && el !== iframeDoc.body && el !== iframeDoc.documentElement) {
      if (!this._isEditorElement(el) && !seen.has(el)) {
        seen.add(el);
        results.push(el);
      }
      el = el.parentElement;
    }

    // Also check using getElementsFromPoint if available
    if (typeof iframeDoc.elementsFromPoint === 'function') {
      const fromPoint = iframeDoc.elementsFromPoint(x, y);
      for (const e of fromPoint) {
        if (e !== iframeDoc.body && e !== iframeDoc.documentElement && !this._isEditorElement(e) && !seen.has(e)) {
          seen.add(e);
          results.push(e);
        }
      }
    }

    return results;
  }

  _showLayerPicker(x, y, elements) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    this._closeLayerPicker();

    const picker = iframeDoc.createElement('div');
    picker.className = 'editor-layer-picker';

    const title = iframeDoc.createElement('div');
    title.className = 'editor-layer-picker-title';
    title.textContent = `${elements.length} 個圖層 — 點擊選取`;
    picker.appendChild(title);

    elements.forEach((el, idx) => {
      const item = iframeDoc.createElement('button');
      item.className = 'editor-layer-item';
      if (el.hasAttribute('data-editor-selected')) {
        item.classList.add('active');
      }

      const tag = iframeDoc.createElement('span');
      tag.className = 'editor-layer-tag';
      tag.textContent = el.tagName.toLowerCase();

      const name = iframeDoc.createElement('span');
      name.className = 'editor-layer-name';
      const className = el.className ? `.${el.className.split(' ')[0]}` : '';
      const idStr = el.id ? `#${el.id}` : '';
      const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? `"${el.textContent.substring(0, 20)}…"` : '';
      name.textContent = idStr || className || text || `(${el.tagName.toLowerCase()})`;

      const depth = iframeDoc.createElement('span');
      depth.className = 'editor-layer-depth';
      depth.textContent = `L${idx}`;

      item.appendChild(tag);
      item.appendChild(name);
      item.appendChild(depth);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeLayerPicker();
        this.selectElement(el);
      });

      // Hover preview
      item.addEventListener('mouseenter', () => {
        iframeDoc.querySelectorAll('[data-editor-hover]').forEach(n => n.removeAttribute('data-editor-hover'));
        el.setAttribute('data-editor-hover', '');
      });
      item.addEventListener('mouseleave', () => {
        el.removeAttribute('data-editor-hover');
      });

      picker.appendChild(item);
    });

    // Position the picker
    const viewW = iframeDoc.documentElement.clientWidth;
    const viewH = iframeDoc.documentElement.clientHeight;
    picker.style.left = `${Math.min(x, viewW - 240)}px`;
    picker.style.top = `${Math.min(y, viewH - 200)}px`;

    iframeDoc.body.appendChild(picker);
  }

  _closeLayerPicker() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    iframeDoc.querySelectorAll('.editor-layer-picker').forEach(el => el.remove());
  }

  _isEditorElement(el) {
    if (!el || !el.className) return false;
    const cls = typeof el.className === 'string' ? el.className : '';
    return cls.includes('editor-layer-') || cls.includes('editor-drag-') || cls.includes('editor-pos-');
  }

  // ── Drag & Drop ──

  _startDrag(element, e) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    // Save state for undo before drag modifies positions
    this._saveUndoState();

    const computed = iframeDoc.defaultView.getComputedStyle(element);
    if (computed.position === 'static') {
      element.style.position = 'relative';
    }

    this._dragState = {
      element,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: parseInt(computed.left) || 0,
      origTop: parseInt(computed.top) || 0,
      hasMoved: false,
      thresholdMet: false,
    };

    element.setAttribute('data-editor-dragging', '');
    element.removeAttribute('data-editor-hover');
    iframeDoc.body.style.cursor = 'move';
  }

  _onDrag(e) {
    if (!this._dragState) return;
    const { element, startX, startY, origLeft, origTop } = this._dragState;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Require minimum 5px movement before starting drag (prevents accidental drags on close elements)
    if (!this._dragState.thresholdMet) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      this._dragState.thresholdMet = true;
    }

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._dragState.hasMoved = true;

    const newLeft = origLeft + dx;
    const newTop = origTop + dy;

    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;

    this._updateResizeHandles(element);

    this._updatePosBadge(e.clientX, e.clientY, newLeft, newTop);
    this._updateDragGuides(e.clientX, e.clientY);
  }

  _endDrag(e) {
    if (!this._dragState) return;
    const { element, startX, startY, hasMoved } = this._dragState;
    const iframeDoc = this._getDoc();

    element.removeAttribute('data-editor-dragging');
    this._removeDragGuides();
    this._removePosBadge();

    if (iframeDoc) iframeDoc.body.style.cursor = '';

    if (hasMoved && e) {
      this._justDragged = true;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (this.activeScope === 'class' && iframeDoc) {
        const className = element.classList[0];
        if (className) {
          iframeDoc.querySelectorAll(`.${className}`).forEach(target => {
            if (target !== element) {
              const computed = iframeDoc.defaultView.getComputedStyle(target);
              if (computed.position === 'static') target.style.position = 'relative';
              const curLeft = parseInt(computed.left) || 0;
              const curTop = parseInt(computed.top) || 0;
              target.style.left = `${curLeft + dx}px`;
              target.style.top = `${curTop + dy}px`;
            }
            target.setAttribute('data-style-scope', 'class');
          });
        }
      } else {
        element.setAttribute('data-style-scope', 'individual');
      }

      this._refreshSelectedProps(element);
    } else if (hasMoved) {
      this._justDragged = true;
      element.setAttribute('data-style-scope', this.activeScope);
      this._refreshSelectedProps(element);
    }

    this._dragState = null;

    // Trigger content change for auto-save
    if (hasMoved && this.onContentChange) {
      this.onContentChange();
    }
  }

  _startResize(handle, e) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    this._saveUndoState();

    const element = this.selectedElement;
    const computed = iframeDoc.defaultView.getComputedStyle(element);

    const startWidth = element.offsetWidth;
    const startHeight = element.offsetHeight;
    const startLeft = parseInt(computed.left) || 0;
    const startTop = parseInt(computed.top) || 0;

    let type = '';
    if (handle.classList.contains('top-left')) type = 'top-left';
    else if (handle.classList.contains('top-right')) type = 'top-right';
    else if (handle.classList.contains('bottom-left')) type = 'bottom-left';
    else if (handle.classList.contains('bottom-right')) type = 'bottom-right';

    // Capture original font-sizes for proportional scaling
    const fontSizeMap = new Map();
    const computedFs = parseFloat(computed.fontSize) || 16;
    fontSizeMap.set(element, computedFs);
    const allChildren = element.querySelectorAll('*');
    const win = iframeDoc.defaultView;
    allChildren.forEach(child => {
      const childFs = parseFloat(win.getComputedStyle(child).fontSize) || 16;
      fontSizeMap.set(child, childFs);
    });

    this._resizeState = {
      element,
      type,
      startX: e.clientX,
      startY: e.clientY,
      startWidth,
      startHeight,
      startLeft,
      startTop,
      hasMoved: false,
      fontSizeMap,
    };

    iframeDoc.body.style.cursor = handle.style.cursor;
  }

  _onResize(e) {
    if (!this._resizeState) return;
    const { element, type, startX, startY, startWidth, startHeight, startLeft, startTop, fontSizeMap } = this._resizeState;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    this._resizeState.hasMoved = true;

    let newWidth = startWidth;
    let newHeight = startHeight;
    let newLeft = startLeft;
    let newTop = startTop;

    if (type === 'bottom-right') {
      newWidth = Math.max(10, startWidth + dx);
      newHeight = Math.max(10, startHeight + dy);
    } else if (type === 'bottom-left') {
      newWidth = Math.max(10, startWidth - dx);
      newHeight = Math.max(10, startHeight + dy);
      if (newWidth > 10) newLeft = startLeft + dx;
    } else if (type === 'top-right') {
      newWidth = Math.max(10, startWidth + dx);
      newHeight = Math.max(10, startHeight - dy);
      if (newHeight > 10) newTop = startTop + dy;
    } else if (type === 'top-left') {
      newWidth = Math.max(10, startWidth - dx);
      newHeight = Math.max(10, startHeight - dy);
      if (newWidth > 10) newLeft = startLeft + dx;
      if (newHeight > 10) newTop = startTop + dy;
    }

    element.style.width = `${newWidth}px`;
    element.style.height = `${newHeight}px`;
    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;

    // Proportional font-size scaling based on width ratio
    const widthScale = newWidth / startWidth;
    if (fontSizeMap) {
      fontSizeMap.forEach((originalFs, el) => {
        const newFs = Math.max(1, originalFs * widthScale);
        el.style.fontSize = `${newFs.toFixed(2)}px`;
      });
    }

    this._updateResizeHandles(element);
    this._updatePosBadge(e.clientX, e.clientY, newLeft, newTop);
    let badge = this._getDoc()?.querySelector('.editor-pos-badge');
    if (badge) {
      badge.textContent = `w: ${Math.round(newWidth)} h: ${Math.round(newHeight)} fs: ${(fontSizeMap?.get(element) * widthScale)?.toFixed(1) || '-'}px`;
    }
    this._updateDragGuides(e.clientX, e.clientY);
  }

  _endResize(e) {
    if (!this._resizeState) return;
    const { element, hasMoved } = this._resizeState;
    const iframeDoc = this._getDoc();

    this._removeDragGuides();
    this._removePosBadge();

    if (iframeDoc) iframeDoc.body.style.cursor = '';

    if (hasMoved) {
      this._justDragged = true;

      if (this.activeScope === 'class' && iframeDoc) {
        const className = element.classList[0];
        if (className) {
          iframeDoc.querySelectorAll(`.${className}`).forEach(target => {
            if (target !== element) {
              target.style.width = element.style.width;
              target.style.height = element.style.height;
              target.style.left = element.style.left;
              target.style.top = element.style.top;
              target.style.fontSize = element.style.fontSize;
              // Propagate font-size to children of class peers
              const srcChildren = Array.from(element.querySelectorAll('*'));
              const tgtChildren = Array.from(target.querySelectorAll('*'));
              srcChildren.forEach((srcChild, idx) => {
                if (tgtChildren[idx] && srcChild.style.fontSize) {
                  tgtChildren[idx].style.fontSize = srcChild.style.fontSize;
                }
              });
            }
            target.setAttribute('data-style-scope', 'class');
          });
        }
      } else {
        element.setAttribute('data-style-scope', 'individual');
      }

      this._refreshSelectedProps(element);
    }

    this._resizeState = null;

    if (hasMoved && this.onContentChange) {
      this.onContentChange();
    }
  }

  _updateResizeHandles(element) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc || !element) return;

    const parent = element.parentElement;
    if (!parent) return;

    const top = element.offsetTop;
    const left = element.offsetLeft;
    const width = element.offsetWidth;
    const height = element.offsetHeight;

    const topLeft = iframeDoc.querySelector('.editor-drag-resize-handle.top-left');
    const topRight = iframeDoc.querySelector('.editor-drag-resize-handle.top-right');
    const bottomLeft = iframeDoc.querySelector('.editor-drag-resize-handle.bottom-left');
    const bottomRight = iframeDoc.querySelector('.editor-drag-resize-handle.bottom-right');

    if (topLeft) {
      topLeft.style.top = `${top - 4}px`;
      topLeft.style.left = `${left - 4}px`;
    }
    if (topRight) {
      topRight.style.top = `${top - 4}px`;
      topRight.style.left = `${left + width - 4}px`;
    }
    if (bottomLeft) {
      bottomLeft.style.top = `${top + height - 4}px`;
      bottomLeft.style.left = `${left - 4}px`;
    }
    if (bottomRight) {
      bottomRight.style.top = `${top + height - 4}px`;
      bottomRight.style.left = `${left + width - 4}px`;
    }
  }

  _nudgeElement(element, dx, dy) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    const className = this.activeScope === 'class' ? element.classList[0] : null;
    const targets = (className && iframeDoc) ? iframeDoc.querySelectorAll(`.${className}`) : [element];

    targets.forEach(target => {
      const computed = iframeDoc.defaultView.getComputedStyle(target);
      if (computed.position === 'static') target.style.position = 'relative';
      target.style.left = `${(parseInt(computed.left) || 0) + dx}px`;
      target.style.top = `${(parseInt(computed.top) || 0) + dy}px`;
      target.setAttribute('data-style-scope', this.activeScope);
    });

    this._updateResizeHandles(element);
  }

  _updatePosBadge(mx, my, left, top) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    let badge = iframeDoc.querySelector('.editor-pos-badge');
    if (!badge) { badge = iframeDoc.createElement('div'); badge.className = 'editor-pos-badge'; iframeDoc.body.appendChild(badge); }
    badge.textContent = `x: ${left}  y: ${top}`;
    badge.style.left = `${mx + 14}px`;
    badge.style.top = `${my + 14}px`;
  }

  _removePosBadge() { this._getDoc()?.querySelector('.editor-pos-badge')?.remove(); }

  _updateDragGuides(x, y) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    let gx = iframeDoc.querySelector('.editor-drag-guide-x');
    let gy = iframeDoc.querySelector('.editor-drag-guide-y');
    if (!gx) { gx = iframeDoc.createElement('div'); gx.className = 'editor-drag-guide-x'; iframeDoc.body.appendChild(gx); }
    if (!gy) { gy = iframeDoc.createElement('div'); gy.className = 'editor-drag-guide-y'; iframeDoc.body.appendChild(gy); }
    gx.style.left = `${x}px`;
    gy.style.top = `${y}px`;
  }

  _removeDragGuides() { this._getDoc()?.querySelectorAll('.editor-drag-guide-x, .editor-drag-guide-y').forEach(el => el.remove()); }

  _refreshSelectedProps(element) {
    if (!element) return;
    setTimeout(() => this.selectElement(element), 50);
  }

  // ── Selection ──

  selectElement(element) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    iframeDoc.querySelectorAll('[data-editor-selected]').forEach(n => n.removeAttribute('data-editor-selected'));
    iframeDoc.querySelectorAll('.editor-drag-resize-handle').forEach(h => h.remove());

    if (!element) {
      this.selectedElement = null;
      if (this.onSelectElement) this.onSelectElement(null);
      return;
    }

    element.setAttribute('data-editor-selected', '');
    this.selectedElement = element;

    const parent = element.parentElement;
    if (parent) {
      const classes = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      classes.forEach(cls => {
        const handle = iframeDoc.createElement('div');
        handle.className = `editor-drag-resize-handle ${cls}`;
        if (cls === 'top-left' || cls === 'bottom-right') {
          handle.style.cursor = 'nwse-resize';
        } else {
          handle.style.cursor = 'nesw-resize';
        }
        parent.appendChild(handle);
      });
      this._updateResizeHandles(element);
    }

    const className = element.classList?.[0] || '';
    const eid = element.getAttribute('data-eid') || '';
    // Use data-eid for unique selector (only affects THIS element)
    this.selectedSelector = eid ? `[data-eid="${eid}"]` : (className ? `.${className}` : null);

    const computed = iframeDoc.defaultView.getComputedStyle(element);
    const props = {};
    const relevantProps = [
      'position', 'top', 'left', 'right', 'bottom',
      'width', 'height', 'padding', 'margin',
      'background-color', 'background-image', 'color', 'border',
      'border-radius', 'font-family', 'font-size',
      'font-weight', 'line-height', 'letter-spacing',
      'text-align', 'display', 'flex-direction',
      'justify-content', 'align-items', 'gap',
      'opacity', 'box-shadow', 'overflow', 'z-index',
    ];

    for (const prop of relevantProps) {
      const val = computed.getPropertyValue(prop);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto') {
        if (['position', 'top', 'left', 'right', 'bottom'].includes(prop)) {
          if (val !== 'static' || prop === 'position') props[prop] = val;
        } else if (val !== '0px') {
          props[prop] = val;
        }
      }
    }

    if (this.onSelectElement) {
      this.onSelectElement({
        element,
        selector: this.selectedSelector,
        eid,
        tagName: element.tagName.toLowerCase(),
        className,
        id: element.id || '',
        textContent: element.childNodes.length === 1 && element.childNodes[0].nodeType === 3
          ? element.textContent.substring(0, 100) : '',
        properties: props,
        depth: this._getDepth(element),
      });
    }
  }

  _getDepth(el) {
    let depth = 0;
    let node = el;
    while (node.parentElement) { depth++; node = node.parentElement; }
    return depth;
  }

  selectByClassName(className) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    const el = iframeDoc.querySelector(`.${className}`);
    if (el) { this.selectElement(el); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  selectByEid(eid) {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    const el = iframeDoc.querySelector(`[data-eid="${eid}"]`);
    if (el) { this.selectElement(el); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  getDomTree() {
    const doc = this._getDoc();
    if (!doc) return null;

    const buildNode = (el) => {
      if (this._isEditorElement(el)) return null;
      if (el.tagName.toLowerCase() === 'style' || el.tagName.toLowerCase() === 'script') return null;

      const tagName = el.tagName.toLowerCase();
      // Filter out editor classes and common layout classes that make naming messy
      const classes = Array.from(el.classList).filter(c => !c.startsWith('editor-') && c !== 'show' && !c.includes('hover') && !c.includes('selected'));
      const className = classes.join(' ');
      const id = el.id ? `#${el.id}` : '';
      const eid = el.getAttribute('data-eid') || '';

      let type = 'FRAME';
      if (tagName === 'img') type = 'IMAGE';
      else if (['span', 'p', 'h1', 'h2', 'h3', 'li', 'a', 'td', 'th'].includes(tagName)) type = 'TEXT';
      else if (tagName === 'button' || className.includes('btn') || className.includes('button')) type = 'COMPONENT';

      // Human-readable node name
      let name = id;
      if (!name && className) {
        name = `.${classes[0]}`;
      }
      if (!name) {
        name = `<${tagName}>`;
      }

      const children = [];
      el.childNodes.forEach(child => {
        if (child.nodeType === 1) { // ELEMENT_NODE
          const childNode = buildNode(child);
          if (childNode) children.push(childNode);
        }
      });

      let imageUrl = undefined;
      if (tagName === 'img') {
        imageUrl = el.getAttribute('src');
      }

      return {
        id: eid,
        eid: eid,
        name: name,
        type: type,
        htmlTag: tagName,
        className: classes[0] || '',
        imageUrl: imageUrl,
        children: children
      };
    };

    return buildNode(doc.body);
  }

  updateProperty(prop, value, scope = 'class') {
    const el = this.selectedElement;
    if (!el) return;

    // Save state for undo before modifying properties
    this._saveUndoState();

    if (scope === 'individual') {
      el.setAttribute('data-style-scope', 'individual');
      el.style.setProperty(prop, value);
    } else {
      el.setAttribute('data-style-scope', 'class');
      
      const className = el.classList[0];
      if (className) {
        const iframeDoc = this._getDoc();
        if (iframeDoc) {
          iframeDoc.querySelectorAll(`.${className}`).forEach(item => {
            item.setAttribute('data-style-scope', 'class');
            item.style.setProperty(prop, value);
          });
        }
      } else {
        el.style.setProperty(prop, value);
      }
    }

    if (this.onPropertyChange) {
      this.onPropertyChange({ selector: this.selectedSelector, eid: el.getAttribute('data-eid'), prop, value, scope });
    }
    if (this.onContentChange) {
      this.onContentChange();
    }
  }

  setDeviceWidth(width) {
    const container = document.getElementById('preview-frame-container');
    if (!container) return;
    if (width === '100%') { container.style.width = '100%'; container.style.maxWidth = '100%'; }
    else { container.style.width = `${width}px`; container.style.maxWidth = `${width}px`; }
  }

  setDevicePreset(preset) {
    this.currentDevice = preset;
    const container = document.getElementById('preview-frame-container');
    const wrapper = document.getElementById('preview-frame-wrapper');
    if (!container) return;

    // The iframe renders at full device resolution to prevent responsive CSS issues
    // The container uses transform: scale() to fit within available space
    const iframeWidth = preset.width;
    const iframeHeight = preset.height;

    // Set container to the actual device size (it will be scaled by zoom)
    container.style.width = `${iframeWidth}px`;
    container.style.maxWidth = `${iframeWidth}px`;
    container.style.height = `${iframeHeight}px`;
    container.style.aspectRatio = 'auto';

    // Make the iframe fill the container at full resolution
    if (this.iframe) {
      this.iframe.style.width = `${iframeWidth}px`;
      this.iframe.style.height = `${iframeHeight}px`;
    }

    // Just apply current zoom — do NOT call fitToScreen here because
    // the wrapper may not be visible yet (getBoundingClientRect returns 0).
    // The caller should invoke fitToScreen() after the view is confirmed visible.
    this.setZoom(this.zoom);

    // Update device info bar
    const nameEl = document.getElementById('device-info-name');
    const resEl = document.getElementById('device-info-resolution');
    const ratioEl = document.getElementById('device-info-ratio');
    if (nameEl) nameEl.textContent = preset.name;
    if (resEl) resEl.textContent = `${preset.width} × ${preset.height}`;
    if (ratioEl) {
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const d = gcd(preset.width, preset.height);
      ratioEl.textContent = `${preset.width / d}:${preset.height / d}`;
    }
  }

  setZoom(level) {
    this.zoom = level;
    const container = document.getElementById('preview-frame-container');
    if (container) { container.style.transform = `scale(${level / 100})`; container.style.transformOrigin = 'top center'; }
  }

  fitToScreen() {
    const wrapper = document.getElementById('preview-frame-wrapper');
    const container = document.getElementById('preview-frame-container');
    if (!wrapper || !container) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const containerW = parseInt(container.style.width) || container.offsetWidth;
    const containerH = parseInt(container.style.height) || container.offsetHeight;

    if (containerW <= 0 || containerH <= 0) return;

    const padding = 20;
    const availableW = wrapperRect.width - padding * 2;
    const availableH = wrapperRect.height - padding * 2;

    const scaleX = availableW / containerW;
    const scaleY = availableH / containerH;
    const fitScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%

    const zoomPercent = Math.round(fitScale * 100);
    this.setZoom(zoomPercent);
    return zoomPercent;
  }

  // ── Undo/Redo System ──
  _saveUndoState() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    const snapshot = iframeDoc.body.innerHTML;
    this._undoStack.push(snapshot);
    if (this._undoStack.length > this._maxHistory) this._undoStack.shift();
    this._redoStack = [];
  }

  undo() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc || this._undoStack.length === 0) return false;
    this._redoStack.push(iframeDoc.body.innerHTML);
    const prev = this._undoStack.pop();
    iframeDoc.body.innerHTML = prev;
    this._tagElements();
    this._resolveFigmaScreenNames();
    this._setupInteractions();
    this._fixFigmaOverlays(iframeDoc);
    if (this.onContentChange) this.onContentChange();
    return true;
  }

  redo() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc || this._redoStack.length === 0) return false;
    this._undoStack.push(iframeDoc.body.innerHTML);
    const next = this._redoStack.pop();
    iframeDoc.body.innerHTML = next;
    this._tagElements();
    this._resolveFigmaScreenNames();
    this._setupInteractions();
    this._fixFigmaOverlays(iframeDoc);
    if (this.onContentChange) this.onContentChange();
    return true;
  }

  canUndo() { return this._undoStack.length > 0; }
  canRedo() { return this._redoStack.length > 0; }

  getImageErrors() { return [...this._imageErrors]; }

  getPreviewSrcdoc() {
    return this.iframe.srcdoc || '';
  }

  setScreen(screenType) {
    if (screenType === 'main') {
      screenType = this.resolvedScreenNames.main || '主畫面 1';
    }
    this.currentScreen = screenType;
    const doc = this._getDoc();
    if (!doc) return;

    const win = this.iframe.contentWindow;
    if (!win) return;

    const $ = win.$;
    if ($) {
      // If jQuery is loaded in the iframe, use it to ensure everything transitions cleanly
      $('.popup, .ingame__popup--bg, .popup__main').removeClass('show');

      if (screenType === 'main') {
        // Mixed state - restore original classes from server render
        $('.gamemain-bet .swiper-slide').each(function() {
          const orig = $(this).data('orig-class');
          if (orig !== undefined) {
            $(this).attr('class', orig);
          }
          $(this).find('.betbox__BetBtn').css('display', '');
          $(this).find('ul.marquee').each(function() {
            const origMq = $(this).data('orig-class');
            if (origMq !== undefined) $(this).attr('class', origMq);
          });
          $(this).find('li').each(function() {
            const origLi = $(this).data('orig-class');
            if (origLi !== undefined) $(this).attr('class', origLi);
            $(this).css({position: '', opacity: ''});
          });
        });
      } else if (screenType === 'main-allactive') {
        // All cards in active betting state
        $('.gamemain-bet .swiper-slide').each(function() {
          if ($(this).data('orig-class') === undefined) {
            $(this).data('orig-class', $(this).attr('class'));
          }
          $(this).removeClass('off winbet');
          $(this).find('.betbox__BetBtn').css('display', '');
          const $mq = $(this).find('ul.marquee');
          if ($mq.data('orig-class') === undefined) $mq.data('orig-class', $mq.attr('class'));
          $mq.removeClass('has-winner');
          $(this).find('li').each(function() {
            if ($(this).data('orig-class') === undefined) $(this).data('orig-class', $(this).attr('class'));
            $(this).removeClass('win').css({position: '', opacity: ''});
          });
        });
      } else if (screenType === 'main-allended') {
        // All cards in bet-ended state
        $('.gamemain-bet .swiper-slide').each(function() {
          if ($(this).data('orig-class') === undefined) {
            $(this).data('orig-class', $(this).attr('class'));
          }
          $(this).addClass('off');
          $(this).find('.betbox__BetBtn').css('display', 'none');
        });
      } else if (screenType === 'question') {
        this._showQuestionPopup(doc);
      } else if (screenType === 'record') {
        this._showRecordPopup(doc);
        if (typeof win.renderRecord === 'function') {
          win.renderRecord();
        }
      } else if (screenType === 'betpage-3') {
        $('.popup, .ingame__popup--bg, .betpage').addClass('show');
        $('#betPredictBox').show();
        $('#betGameBox').hide();
        $('#editorBetPageTitleImg').hide();
        $('#editorBetPageTitleWords').show();
      } else if (screenType === 'betpage-2') {
        $('.popup, .ingame__popup--bg, .betpage').addClass('show');
        $('#betPredictBox').hide();
        $('#betGameBox').show();
        $('#editorBetPageTitleImg').show();
        $('#editorBetPageTitleWords').hide();
      } else if (screenType === 'reward') {
        $('.popup, .ingame__popup--bg, .reward').addClass('show');
      }
    } else {
      // Fallback to vanilla DOM manipulation
      doc.querySelectorAll('.popup, .ingame__popup--bg, .popup__main').forEach(el => el.classList.remove('show'));

      if (screenType === 'main') {
        // Mixed state - restore original classes
        doc.querySelectorAll('.gamemain-bet .swiper-slide').forEach(el => {
          const orig = el.getAttribute('data-orig-class');
          if (orig) el.setAttribute('class', orig);
          const btn = el.querySelector('.betbox__BetBtn');
          if (btn) btn.style.display = '';
        });
      } else if (screenType === 'main-allactive') {
        doc.querySelectorAll('.gamemain-bet .swiper-slide').forEach(el => {
          if (!el.getAttribute('data-orig-class')) {
            el.setAttribute('data-orig-class', el.getAttribute('class'));
          }
          el.classList.remove('off', 'winbet');
          const btn = el.querySelector('.betbox__BetBtn');
          if (btn) btn.style.display = '';
          const marquee = el.querySelector('ul.marquee');
          if (marquee) marquee.classList.remove('has-winner');
          el.querySelectorAll('li.win').forEach(li => {
            li.classList.remove('win');
            li.style.position = '';
            li.style.opacity = '';
          });
        });
      } else if (screenType === 'main-allended') {
        doc.querySelectorAll('.gamemain-bet .swiper-slide').forEach(el => {
          if (!el.getAttribute('data-orig-class')) {
            el.setAttribute('data-orig-class', el.getAttribute('class'));
          }
          el.classList.add('off');
          const btn = el.querySelector('.betbox__BetBtn');
          if (btn) btn.style.display = 'none';
        });
      } else if (screenType === 'question') {
        this._showQuestionPopup(doc);
      } else if (screenType === 'record') {
        this._showRecordPopup(doc);
      } else if (screenType === 'betpage-3') {
        doc.querySelectorAll('.popup, .ingame__popup--bg, .betpage').forEach(el => el.classList.add('show'));
        const pBox = doc.getElementById('betPredictBox');
        const gBox = doc.getElementById('betGameBox');
        if (pBox) pBox.style.display = 'block';
        if (gBox) gBox.style.display = 'none';

        const titleImg = doc.getElementById('editorBetPageTitleImg');
        const titleWords = doc.getElementById('editorBetPageTitleWords');
        if (titleImg) titleImg.style.display = 'none';
        if (titleWords) titleWords.style.display = 'flex';
      } else if (screenType === 'betpage-2') {
        doc.querySelectorAll('.popup, .ingame__popup--bg, .betpage').forEach(el => el.classList.add('show'));
        const pBox = doc.getElementById('betPredictBox');
        const gBox = doc.getElementById('betGameBox');
        if (pBox) pBox.style.display = 'none';
        if (gBox) gBox.style.display = 'block';

        const titleImg = doc.getElementById('editorBetPageTitleImg');
        const titleWords = doc.getElementById('editorBetPageTitleWords');
        if (titleImg) titleImg.style.display = 'block';
        if (titleWords) titleWords.style.display = 'none';
      } else if (screenType === 'reward') {
        doc.querySelectorAll('.popup, .ingame__popup--bg, .reward').forEach(el => el.classList.add('show'));
      }
    }

    // ── Figma-mode fallback ──
    // For Figma-generated content: toggle visibility of top-level children
    // by matching their data-figma-name attribute against the selected screen name.
    const rootEl = doc.body.querySelector('[data-figma-name]');
    if (rootEl) {
      const topChildren = rootEl.querySelectorAll(':scope > [data-figma-name]');
      if (topChildren.length > 0) {
        // Save original root dimensions on first use
        if (!rootEl._origWidth) {
          rootEl._origWidth = rootEl.style.width;
          rootEl._origHeight = rootEl.style.height;
        }

        // Find the selected screen element
        const selectedScreenEl = Array.from(topChildren).find(el => 
          el.getAttribute('data-figma-name') === screenType
        );

        // Find the anchor main screen element (prioritize matched name, fallback to first frame-like layer)
        const mainScreenEl = Array.from(topChildren).find(el => 
          (el.getAttribute('data-figma-name') || '').includes('主畫面') || 
          el.getAttribute('data-figma-name') === this.resolvedScreenNames.main
        ) || Array.from(topChildren).find(el => {
          const isFrameOrGroup = el.classList.contains('frame') || el.classList.contains('group') || el.tagName.toLowerCase() === 'div';
          const w = el.offsetWidth || 0;
          return isFrameOrGroup && w > 200;
        });

        const mainScreenName = mainScreenEl ? mainScreenEl.getAttribute('data-figma-name') : this.resolvedScreenNames.main;

        // Determine if the selected screen is a popup overlay
        const isSelectedPopup = screenType !== mainScreenName && (
          screenType.includes('投注') || 
          screenType.toLowerCase().includes('popup') || 
          screenType.toLowerCase().includes('modal') || 
          screenType.toLowerCase().includes('dialog') || 
          screenType.toLowerCase().includes('betpage') ||
          screenType === 'betpage-3' ||
          screenType === 'betpage-2' ||
          (selectedScreenEl && mainScreenEl && (selectedScreenEl.offsetWidth < mainScreenEl.offsetWidth || selectedScreenEl.offsetHeight < mainScreenEl.offsetHeight))
        );

        // Extract all top-level children that act as valid screen layers (frames/groups)
        const screenNames = Array.from(topChildren)
          .map(el => el.getAttribute('data-figma-name'))
          .filter(name => {
            if (!name) return false;
            const el = Array.from(topChildren).find(x => x.getAttribute('data-figma-name') === name);
            const isFrame = el.classList.contains('frame') || el.classList.contains('group') || el.tagName.toLowerCase() === 'div';
            const bounds = el.getBoundingClientRect();
            const w = bounds.width || parseFloat(el.style.width) || parseFloat(el.getAttribute('width')) || 0;
            const h = bounds.height || parseFloat(el.style.height) || parseFloat(el.getAttribute('height')) || 0;
            return isFrame && (w > 200 && h > 200 || w === 0);
          });

        if (screenType === '__all__') {
          // Show all screen frames, hide others
          topChildren.forEach(el => {
            const name = el.getAttribute('data-figma-name') || '';
            if (screenNames.includes(name)) {
              el.style.display = 'block';
              el.style.position = '';
              el.style.left = '';
              el.style.top = '';
              el.style.zIndex = '';
            } else {
              el.style.display = 'none';
            }
          });
          // Reset root container offset
          rootEl.style.transform = '';
          rootEl.style.transformOrigin = '';
          if (rootEl._origWidth) {
            rootEl.style.width = rootEl._origWidth;
            rootEl.style.height = rootEl._origHeight;

            const container = document.getElementById('preview-frame-container');
            if (container && this.currentDevice) {
              container.style.width = `${this.currentDevice.width}px`;
              container.style.maxWidth = `${this.currentDevice.width}px`;
              container.style.height = `${this.currentDevice.height}px`;
            }
            if (this.iframe && this.currentDevice) {
              this.iframe.style.width = `${this.currentDevice.width}px`;
              this.iframe.style.height = `${this.currentDevice.height}px`;
            }

            requestAnimationFrame(() => {
              this.fitToScreen();
            });
          }
        } else {
          // Special mapping for legacy betting screens if selected
          let isLegacyBet1 = (screenType === 'betpage-3' || (screenType || '').includes('投注畫面1') || screenType === this.resolvedScreenNames.bet1);
          let isLegacyBet2 = (screenType === 'betpage-2' || (screenType || '').includes('投注畫面2') || screenType === this.resolvedScreenNames.bet2);

          topChildren.forEach(el => {
            const name = el.getAttribute('data-figma-name') || '';
            const isMain = name === mainScreenName;
            
            let isSelected = name === screenType || 
                             (isLegacyBet1 && (name.includes('投注畫面1') || name === this.resolvedScreenNames.bet1)) || 
                             (isLegacyBet2 && (name.includes('投注畫面2') || name === this.resolvedScreenNames.bet2));

            if (isSelected) {
              el.style.display = 'block';
              if (isSelectedPopup && mainScreenEl) {
                const compMain = doc.defaultView.getComputedStyle(mainScreenEl);
                el.style.position = 'absolute';
                el.style.left = compMain.left;
                el.style.top = compMain.top;
                el.style.zIndex = '999';
              } else {
                el.style.zIndex = '1';
              }
            } else if (isMain) {
              el.style.display = isSelectedPopup ? 'block' : 'none';
              el.style.zIndex = '1';
            } else if (screenNames.includes(name)) {
              el.style.display = 'none';
            } else {
              el.style.display = 'none';
            }
          });

          const bg = doc.querySelector('.ingame__popup--bg');
          if (bg) {
            if (screenType === 'question' || screenType === 'record' || screenType === 'reward') {
              bg.classList.add('show');
            } else {
              bg.classList.remove('show');
            }
          }

          // Adjust viewport to focus on the selected or main screen
          const focusScreenEl = (selectedScreenEl && !isSelectedPopup) ? selectedScreenEl : mainScreenEl;
          if (focusScreenEl) {
            const computed = doc.defaultView.getComputedStyle(focusScreenEl);
            const childLeft = parseInt(computed.left) || 0;
            const childTop = parseInt(computed.top) || 0;
            const childWidth = focusScreenEl.offsetWidth || parseInt(computed.width) || 0;
            const childHeight = focusScreenEl.offsetHeight || parseInt(computed.height) || 0;

            rootEl.style.transform = `translate(${-childLeft}px, ${-childTop}px)`;
            rootEl.style.transformOrigin = 'top left';

            if (childWidth > 0 && childHeight > 0) {
              rootEl.style.width = `${childWidth}px`;
              rootEl.style.height = `${childHeight}px`;

              const container = document.getElementById('preview-frame-container');
              if (container) {
                container.style.width = `${childWidth}px`;
                container.style.maxWidth = `${childWidth}px`;
                container.style.height = `${childHeight}px`;
              }
              if (this.iframe) {
                this.iframe.style.width = `${childWidth}px`;
                this.iframe.style.height = `${childHeight}px`;
              }

              requestAnimationFrame(() => {
                // Keep the current zoom level instead of fitting to screen
                this.setZoom(this.zoom);
              });
            }
          }
        }
      }
    }

    // After screen change, re-apply overlay fixes and inject interactive buttons
    requestAnimationFrame(() => {
      const doc = this._getDoc();
      if (doc) this._fixFigmaOverlays(doc);
    });
  }

  // ── Betting screen helper methods ──
  _adjustBetNumber(clickedEl, iframeDoc, delta) {
    // Walk up to find a card container with number elements
    let container = clickedEl.closest('[data-figma-name]');
    if (!container) container = clickedEl.parentElement;
    for (let i = 0; i < 8 && container && container !== iframeDoc.body; i++) {
      const allNums = Array.from(container.querySelectorAll('*')).filter(el => {
        const txt = (el.textContent || '').trim();
        return /^\d+$/.test(txt) && el.children.length === 0;
      });
      if (allNums.length > 0) {
        // Pick the number closest to the clicked +/- button by position
        const btnRect = clickedEl.getBoundingClientRect();
        allNums.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (Math.abs(ra.top - btnRect.top) + Math.abs(ra.left - btnRect.left))
               - (Math.abs(rb.top - btnRect.top) + Math.abs(rb.left - btnRect.left));
        });
        const numEl = allNums[0];
        let val = parseInt(numEl.textContent) || 0;
        val = Math.max(0, val + delta);
        numEl.textContent = String(val);
        if (this.onContentChange) this.onContentChange();
        return;
      }
      container = container.parentElement;
    }
  }

  /** Centralized helper to show the question/rules popup reliably */
  _showQuestionPopup(iframeDoc) {
    if (!iframeDoc) iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    const iframeWin = iframeDoc.defaultView || iframeDoc.parentWindow;
    if (iframeWin && typeof iframeWin.question === 'function') {
      console.log('[VisualEditor] Calling iframe native question()');
      iframeWin.question();
      return;
    }

    // Try resolved Figma screen name first (Figma mode)
    if (this.resolvedScreenNames.question) {
      console.log('[VisualEditor] Switching to resolved question screen:', this.resolvedScreenNames.question);
      const select = window.parent.document.getElementById('select-editor-screen');
      if (select) {
        for (const opt of select.options) {
          if (opt.value === this.resolvedScreenNames.question) {
            select.value = opt.value;
            break;
          }
        }
      }
      this.setScreen(this.resolvedScreenNames.question);
      return;
    }

    const popup = iframeDoc.querySelector('.popup');
    const bg = iframeDoc.querySelector('.ingame__popup--bg');
    const q = iframeDoc.querySelector('.popup-base.question') || iframeDoc.querySelector('.popup__main.question');

    if (q) {
      q.style.zIndex = '99999';
      q.classList.add('show');

      if (popup) {
        // Ensure popup is on top of all Figma content
        popup.style.zIndex = '99999';
        popup.style.position = 'fixed';
        popup.style.top = '0';
        popup.style.left = '0';
        popup.style.width = '100%';
        popup.style.height = '100%';
        popup.classList.add('show');
      }
      if (bg) {
        bg.style.zIndex = '99998';
        bg.style.position = 'fixed';
        bg.style.top = '0';
        bg.style.left = '0';
        bg.style.width = '100%';
        bg.style.height = '100%';
        bg.classList.add('show');
      }
      console.log('[VisualEditor] Question popup shown successfully');
    } else {
      console.warn('[VisualEditor] Popup elements not found:', { popup: !!popup, bg: !!bg, q: !!q });
      // Fallback: show via setScreen
      this.setScreen('question');
    }
  }

  /** Centralized helper to show the record/results popup reliably */
  _showRecordPopup(iframeDoc) {
    if (!iframeDoc) iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    const iframeWin = iframeDoc.defaultView || iframeDoc.parentWindow;
    if (iframeWin && typeof iframeWin.record === 'function') {
      console.log('[VisualEditor] Calling iframe native record()');
      iframeWin.record();
      return;
    }

    const popup = iframeDoc.querySelector('.popup');
    const bg = iframeDoc.querySelector('.ingame__popup--bg');
    const r = iframeDoc.querySelector('.popup-base.record') || iframeDoc.querySelector('.popup__main.record') || iframeDoc.querySelector('.popup__main.reward');

    if (r) {
      r.style.zIndex = '99999';
      r.classList.add('show');

      if (popup) {
        popup.style.zIndex = '99999';
        popup.style.position = 'fixed';
        popup.style.top = '0';
        popup.style.left = '0';
        popup.style.width = '100%';
        popup.style.height = '100%';
        popup.classList.add('show');
      }
      if (bg) {
        bg.style.zIndex = '99998';
        bg.style.position = 'fixed';
        bg.style.top = '0';
        bg.style.left = '0';
        bg.style.width = '100%';
        bg.style.height = '100%';
        bg.classList.add('show');
      }
      console.log('[VisualEditor] Record popup shown successfully');
    } else {
      console.warn('[VisualEditor] Record popup elements not found:', { popup: !!popup, bg: !!bg, r: !!r });
      this.setScreen('record');
    }
  }

  _handleBetClear(iframeDoc) {
    if (!iframeDoc) iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    const win = this.iframe.contentWindow;
    const $ = win && win.$;

    // Local mode: reset .betNum inputs via jQuery
    if ($) {
      $('.betNum').val('0');
      $('.btn-reduce').addClass('off');
    }

    // Figma mode: reset numeric text elements in the visible betting screen
    const screenEl = iframeDoc.querySelector('[data-figma-name*="投注畫面"]');
    if (screenEl && screenEl.style.display !== 'none') {
      screenEl.querySelectorAll('*').forEach(el => {
        const txt = (el.textContent || '').trim();
        if (/^\d+$/.test(txt) && el.children.length === 0 && parseInt(txt) > 0) {
          el.textContent = '0';
        }
      });
    }
    if (this.onContentChange) this.onContentChange();
    console.log('[VisualEditor] Bet amounts cleared');
  }

  _handleBetConfirm() {
    const iframeDoc = this._getDoc();
    const win = this.iframe.contentWindow;
    const $ = win && win.$;

    // Collect bet data summary for feedback
    let totalBets = 0;
    if ($ && $('.betNum').length > 0) {
      $('.betNum').each(function() {
        totalBets += parseInt($(this).val()) || 0;
      });
    } else if (iframeDoc) {
      // Figma mode: read from numeric leaf text elements in the visible betting screen
      const screenEl = iframeDoc.querySelector('[data-figma-name*="投注畫面"]') || iframeDoc.body;
      if (screenEl) {
        screenEl.querySelectorAll('*').forEach(el => {
          const txt = (el.textContent || '').trim();
          if (/^\d+$/.test(txt) && el.children.length === 0) {
            totalBets += parseInt(txt) || 0;
          }
        });
      }
    }

    // If no bets placed, notify and stay on betting page
    if (totalBets === 0) {
      // Just keep them on the page to place bets
      console.log('[VisualEditor] No bets placed, staying on betting page');
      return;
    }

    // Return to main screen after successful bet
    const select = window.parent.document.getElementById('select-editor-screen');
    let mainScreenValue = this.resolvedScreenNames.main;
    if (select) {
      for (const opt of select.options) {
        if (opt.value.includes('主畫面')) { mainScreenValue = opt.value; select.value = opt.value; break; }
      }
    }
    this.setScreen(mainScreenValue);
    console.log('[VisualEditor] Bet confirmed with total:', totalBets);
  }

  _handleBetClose() {
    const select = window.parent.document.getElementById('select-editor-screen');
    let mainScreenValue = this.resolvedScreenNames.main;
    if (select) {
      for (const opt of select.options) {
        if (opt.value.includes('主畫面')) { mainScreenValue = opt.value; select.value = opt.value; break; }
      }
    }
    this.setScreen(mainScreenValue);
  }

  setEditMode(enabled) {
    this.editMode = enabled;
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;

    if (enabled) {
      // In edit mode: enable pointer-events on ALL elements so they can be selected/dragged
      iframeDoc.querySelectorAll('[data-figma-name]').forEach(el => {
        el.style.pointerEvents = 'auto';
      });
      // Also enable pointer-events on all visible elements for non-Figma content
      iframeDoc.querySelectorAll('*').forEach(el => {
        if (el.style.pointerEvents === 'none') {
          el.setAttribute('data-edit-restore-pe', 'none');
          el.style.pointerEvents = 'auto';
        }
      });
    } else {
      // Leaving edit mode: clear selection and restore overlay pointer-events
      iframeDoc.querySelectorAll('[data-editor-selected]').forEach(n => n.removeAttribute('data-editor-selected'));
      iframeDoc.querySelectorAll('[data-editor-hover]').forEach(n => n.removeAttribute('data-editor-hover'));
      iframeDoc.querySelectorAll('.editor-drag-resize-handle').forEach(n => n.remove());
      this.selectedElement = null;
      if (this.onSelectElement) this.onSelectElement(null);

      // Restore pointer-events that were disabled for browse mode
      iframeDoc.querySelectorAll('[data-edit-restore-pe]').forEach(el => {
        el.style.pointerEvents = el.getAttribute('data-edit-restore-pe');
        el.removeAttribute('data-edit-restore-pe');
      });
      // Re-apply Figma overlay fixes for browse mode
      this._fixFigmaOverlays(iframeDoc);
    }
  }

  getModifiedCode() {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return { html: this.currentHtml, css: this.currentCss };

    const clone = iframeDoc.body.cloneNode(true);
    clone.querySelectorAll('.editor-drag-guide-x, .editor-drag-guide-y, .editor-pos-badge, .editor-layer-picker, .editor-drag-resize-handle').forEach(el => el.remove());
    
    const override = clone.querySelector('#editor-screen-override');
    if (override) override.remove();

    const editorImg = clone.querySelector('#editorBetPageTitleImg');
    if (editorImg) {
      editorImg.removeAttribute('id');
      editorImg.style.display = 'none';
    }
    const editorWords = clone.querySelector('#editorBetPageTitleWords');
    if (editorWords) {
      editorWords.removeAttribute('id');
      editorWords.style.display = '';
    }

    clone.querySelectorAll('[data-editor-hover], [data-editor-selected], [data-editor-dragging]').forEach(el => {
      el.removeAttribute('data-editor-hover');
      el.removeAttribute('data-editor-selected');
      el.removeAttribute('data-editor-dragging');
    });

    const allEls = clone.querySelectorAll('*');
    let modifiedCss = this.currentCss;

    allEls.forEach(el => {
      const scope = el.getAttribute('data-style-scope');
      
      if (el.style.cssText) {
        if (scope === 'individual') {
          // Keep inline style
        } else {
          const className = el.classList[0];
          if (className) {
            const inlineProps = el.style.cssText.split(';').filter(Boolean);
            for (const propStr of inlineProps) {
              const [prop, val] = propStr.split(':').map(s => s.trim());
              if (prop && val) {
                const regex = new RegExp(`(\\.${className}\\s*\\{[^}]*)(${prop}\\s*:[^;]+;)`, 's');
                if (regex.test(modifiedCss)) {
                  modifiedCss = modifiedCss.replace(regex, `$1${prop}: ${val};`);
                } else {
                  const selectorRegex = new RegExp(`(\\.${className}\\s*\\{)([^}]*)`, 's');
                  if (selectorRegex.test(modifiedCss)) {
                    modifiedCss = modifiedCss.replace(selectorRegex, `$1$2\n  ${prop}: ${val};`);
                  }
                }
              }
            }
          }
          el.removeAttribute('style');
        }
      }
      
      el.removeAttribute('data-eid');
      el.removeAttribute('data-style-scope');
    });

    return { html: clone.innerHTML.trim(), css: modifiedCss };
  }

  _getDoc() {
    try { return this.iframe.contentDocument || this.iframe.contentWindow?.document; }
    catch { return null; }
  }

  _startInlineEdit(el, isNumberOnly = true, isMyBetNode = false, originalFormat = '') {
    const iframeDoc = this._getDoc();
    if (!iframeDoc) return;
    
    if (el._isEditing) return;
    el._isEditing = true;
    
    let originalText = el.textContent.trim();
    let initialVal = originalText;
    if (isMyBetNode) {
      const match = originalText.match(/\d+/);
      initialVal = match ? match[0] : '';
    }
    
    const rect = el.getBoundingClientRect();
    const style = iframeDoc.defaultView.getComputedStyle(el);
    
    const input = iframeDoc.createElement('input');
    input.type = isNumberOnly ? 'number' : 'text';
    input.value = initialVal;
    
    input.style.position = 'absolute';
    input.style.left = `${rect.left + iframeDoc.documentElement.scrollLeft}px`;
    input.style.top = `${rect.top + iframeDoc.documentElement.scrollTop}px`;
    input.style.width = `${Math.max(rect.width + 20, 60)}px`;
    input.style.height = `${rect.height + 4}px`;
    input.style.fontFamily = style.fontFamily;
    input.style.fontSize = style.fontSize;
    input.style.fontWeight = style.fontWeight;
    input.style.color = style.color;
    input.style.textAlign = style.textAlign || 'center';
    input.style.background = '#ffffff';
    input.style.border = '2px solid #1a73e8';
    input.style.borderRadius = '4px';
    input.style.boxShadow = '0 2px 6px rgba(26,115,232,0.3)';
    input.style.zIndex = '999999';
    input.style.outline = 'none';
    input.style.padding = '0 2px';
    input.style.margin = '0';
    
    const originalOpacity = el.style.opacity;
    el.style.opacity = '0';
    
    iframeDoc.body.appendChild(input);
    input.focus();
    input.select();
    
    const finishEdit = (save) => {
      if (el._isEditing) {
        el._isEditing = false;
        if (save) {
          const val = input.value.trim();
          if (!isNumberOnly || /^\d+$/.test(val)) {
            this._saveUndoState();
            if (isMyBetNode) {
              el.textContent = originalFormat.includes(':') ? `我已投注:${val}` : `我已投注 ${val}`;
            } else {
              el.textContent = val;
            }
            if (this.onContentChange) this.onContentChange();
          }
        }
        el.style.opacity = originalOpacity;
        input.remove();
      }
    };
    
    input.addEventListener('blur', () => finishEdit(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEdit(true);
      } else if (e.key === 'Escape') {
        finishEdit(false);
      }
    });
  }
}
