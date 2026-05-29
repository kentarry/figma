import { FigmaAPI } from './figma-api.js';
import { NodeParser } from './node-parser.js';
import { CodeGenerator } from './code-generator.js';
import { VisualEditor } from './visual-editor.js';
import { PromptBuilder } from './prompt-builder.js';
import { copyToClipboard, downloadAsZip, debounce, formatDate, escapeHtml } from './utils.js';

class App {
  constructor() {
    this.state = {
      currentView: 'view-connect',
      fileKey: null,
      fileData: null,
      selectedNodes: new Set(),
      parsedTree: null,
      generatedCode: null,
      generatedPrompt: '',
      screenNodes: {},
      screenImages: {},
    };

    // Device presets
    this.DEVICE_PRESETS = {
      ios:     { name: 'iOS 橫屏',    width: 844,  height: 390 },
      android: { name: 'Android 橫屏', width: 800,  height: 360 },
      win:     { name: 'WIN 桌面',     width: 1280, height: 720 },
      event:   { name: '活動頁',       width: 800,  height: 600 },
    };

    // Auto-save state
    this._saveTimer = null;
    this._hasUnsavedChanges = false;
    this._backupCreated = false;

    this.figmaApi = new FigmaAPI();
    this.nodeParser = new NodeParser();
    this.codeGenerator = new CodeGenerator();
    this.promptBuilder = new PromptBuilder();
    this.visualEditor = null;

    this._init();
  }

  _init() {
    this._initLucide();
    this._initNavigation();
    this._initConnectView();
    this._initSelectView();
    this._initEditorView();
    this._initPromptView();
    this._initShortcuts();
    this._initKeyboardShortcuts();
    this._initImageErrorPanel();
    this._restoreToken();
  }

  _initLucide() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // ─── Toast ───
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap = { success: 'check-circle', error: 'x-circle', info: 'info', warning: 'alert-triangle' };
    toast.innerHTML = `
      <i data-lucide="${iconMap[type] || 'info'}" class="toast-icon"></i>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <i data-lucide="x"></i>
      </button>
    `;

    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ─── Progress Bar ───
  setProgress(percent, show = true) {
    const bar = document.getElementById('progress-bar');
    const fill = document.getElementById('progress-fill');
    bar.classList.toggle('hidden', !show);
    fill.style.width = `${percent}%`;
    if (percent >= 100) {
      setTimeout(() => bar.classList.add('hidden'), 600);
    }
  }

  // ─── Navigation ───
  _initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.showView(btn.dataset.view);
      });
    });
  }

  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const view = document.getElementById(viewId);
    const nav = document.querySelector(`[data-view="${viewId}"]`);
    if (view) view.classList.add('active');
    if (nav) nav.classList.add('active');

    this.state.currentView = viewId;
  }

  enableNav(viewId) {
    const btn = document.querySelector(`[data-view="${viewId}"]`);
    if (btn) btn.disabled = false;
  }

  // ─── Connect View ───
  _restoreToken() {
    const token = this.figmaApi.getToken();
    if (token) {
      document.getElementById('input-token').value = token;
      document.getElementById('token-status').textContent = '✓ Token 已儲存';
      document.getElementById('token-status').className = 'token-status saved';
    }
  }

  _initConnectView() {
    const tokenInput = document.getElementById('input-token');
    const toggleBtn = document.getElementById('btn-toggle-token');
    const saveBtn = document.getElementById('btn-save-token');
    const pasteBtn = document.getElementById('btn-paste-url');
    const connectBtn = document.getElementById('btn-connect');

    toggleBtn.addEventListener('click', () => {
      const isPassword = tokenInput.type === 'password';
      tokenInput.type = isPassword ? 'text' : 'password';
      const icon = document.getElementById('icon-toggle-token');
      icon.setAttribute('data-lucide', isPassword ? 'eye' : 'eye-off');
      lucide.createIcons({ nodes: [icon.parentElement] });
    });

    saveBtn.addEventListener('click', () => {
      const token = tokenInput.value.trim();
      if (!token) {
        this.toast('請輸入 Token', 'warning');
        return;
      }
      this.figmaApi.setToken(token);
      document.getElementById('token-status').textContent = '✓ Token 已儲存';
      document.getElementById('token-status').className = 'token-status saved';
      this.toast('Token 已儲存至瀏覽器', 'success');
    });

    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        document.getElementById('input-figma-url').value = text;
        this._detectNodeIdInUrl(text);
      } catch {
        this.toast('無法存取剪貼簿', 'warning');
      }
    });

    // Real-time URL monitoring for node-id detection
    const urlInput = document.getElementById('input-figma-url');
    urlInput.addEventListener('input', (e) => {
      this._detectNodeIdInUrl(e.target.value);
    });
    urlInput.addEventListener('paste', (e) => {
      setTimeout(() => this._detectNodeIdInUrl(urlInput.value), 50);
    });

    connectBtn.addEventListener('click', () => this._handleConnect());

    // Local demo button
    const demoBtn = document.getElementById('btn-local-demo');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => this._handleLocalDemo());
    }

    // Clear disk cache button
    const clearCacheBtn = document.getElementById('btn-clear-disk-cache');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        try {
          clearCacheBtn.disabled = true;
          const oldText = clearCacheBtn.innerHTML;
          clearCacheBtn.innerHTML = '<span class="spinner inline" style="width:12px;height:12px;border-width:1.5px;"></span> 清除中...';
          const res = await fetch('/api/figma/clear-cache', { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
            this.toast(data.message || '快取已成功清除！', 'success');
            this.figmaApi.clearCache();
          } else {
            this.toast(data.error || '清除快取失敗', 'error');
          }
          clearCacheBtn.disabled = false;
          clearCacheBtn.innerHTML = oldText;
        } catch (err) {
          this.toast(`連線錯誤: ${err.message}`, 'error');
          clearCacheBtn.disabled = false;
          clearCacheBtn.innerHTML = '<i data-lucide="trash-2" style="width:12px;height:12px;margin-right:4px;"></i> 清除快取';
        }
      });
    }
  }

  _detectNodeIdInUrl(url) {
    const hintEl = document.getElementById('url-node-hint');
    const nodeIdEl = document.getElementById('detected-node-id');
    const btnText = document.querySelector('#btn-connect .btn-text');
    const btnIcon = document.querySelector('#btn-connect [data-lucide]');
    
    if (!hintEl || !nodeIdEl) return;
    
    const parsed = this.figmaApi.parseUrl(url || '');
    if (parsed && parsed.nodeId) {
      nodeIdEl.textContent = parsed.nodeId;
      hintEl.classList.remove('hidden');
      if (btnText) btnText.textContent = '⚡ 一鍵切版';
      lucide.createIcons({ nodes: [hintEl] });
    } else {
      hintEl.classList.add('hidden');
      if (btnText) btnText.textContent = '連接 Figma';
    }
  }

  async _handleLocalDemo() {
    const spinner = document.getElementById('connect-spinner');
    const btnText = document.querySelector('#btn-local-demo .btn-text');
    const stepsContainer = document.getElementById('status-steps');

    if (spinner) spinner.classList.remove('hidden');
    if (btnText) btnText.textContent = '讀取中...';
    stepsContainer.innerHTML = '';

    const addStep = (text, status = 'loading') => {
      const step = document.createElement('div');
      step.className = `status-step ${status}`;
      step.innerHTML = `<span class="step-indicator"></span><span class="step-text">${text}</span>`;
      stepsContainer.appendChild(step);
      return step;
    };

    try {
      this.setProgress(20);
      const step1 = addStep('掃描本地設計稿資料夾...');

      const res = await fetch('/api/local/scan');
      if (!res.ok) throw new Error('無法掃描本地檔案');
      const fileData = await res.json();
      this.state.fileData = fileData;
      this.state.isLocalMode = true;
      step1.className = 'status-step success';
      this.setProgress(60);

      const step2 = addStep('解析檔案結構...');
      await new Promise(r => setTimeout(r, 300));
      step2.className = 'status-step success';
      this.setProgress(100);

      this._updateConnectionStatus(true);
      this.enableNav('view-select');
      this._populateSelectView(fileData);
      this.toast('成功讀取本地設計稿！', 'success');

      setTimeout(() => this.showView('view-select'), 500);
    } catch (err) {
      addStep(`錯誤: ${err.message}`, 'error');
      this.setProgress(0, false);
      this.toast(`讀取失敗: ${err.message}`, 'error');
    } finally {
      if (spinner) spinner.classList.add('hidden');
      if (btnText) btnText.textContent = '使用本地設計稿';
    }
  }

  async _handleConnect() {
    const url = document.getElementById('input-figma-url').value.trim();
    const token = document.getElementById('input-token').value.trim();

    if (!token) {
      this.toast('請先輸入並儲存 Token', 'warning');
      return;
    }

    if (!url) {
      this.toast('請輸入 Figma 檔案連結', 'warning');
      return;
    }

    this.figmaApi.setToken(token);
    const parsed = this.figmaApi.parseUrl(url);
    if (!parsed) {
      this.toast('無效的 Figma 連結格式', 'error');
      return;
    }

    this.state.fileKey = parsed.fileKey;
    const spinner = document.getElementById('connect-spinner');
    const btnText = document.querySelector('#btn-connect .btn-text');
    const stepsContainer = document.getElementById('status-steps');

    spinner.classList.remove('hidden');
    document.getElementById('btn-connect').disabled = true;
    stepsContainer.innerHTML = '';

    const addStep = (text, status = 'loading') => {
      const step = document.createElement('div');
      step.className = `status-step ${status}`;
      step.innerHTML = `
        <span class="step-indicator"></span>
        <span class="step-text">${text}</span>
      `;
      stepsContainer.appendChild(step);
      return step;
    };

    // ── ONE-CLICK AUTO-CONVERT: when URL has node-id ──
    if (parsed.nodeId) {
      btnText.textContent = '一鍵切版中...';
      try {
        this.setProgress(5);
        const step1 = addStep('驗證 Token...');
        await new Promise(r => setTimeout(r, 200));
        step1.className = 'status-step success';

        this.setProgress(15);
        const step2 = addStep(`讀取設計稿 (${parsed.nodeId})...`);
        
        // Call the auto-convert endpoint (with auto-retry on rate limit)
        let autoRes;
        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          autoRes = await fetch(
            `/api/figma/auto-convert?fileKey=${encodeURIComponent(parsed.fileKey)}&nodeId=${encodeURIComponent(parsed.nodeId)}`,
            { headers: { 'X-Figma-Token': token } }
          );

          if (autoRes.status === 429) {
            const errData = await autoRes.json().catch(() => ({}));
            if (errData.canRetry === false) {
              // Paywall or extreme limit - throw error immediately without retrying
              throw new Error(errData.error || '您的 Figma Token 已被官方限制呼叫，請更換 Token 或使用地端本地模式。');
            }
            
            if (attempt < maxRetries) {
              const waitSec = errData.retryAfter || 30;
              step2.querySelector('.step-text').textContent = `Figma API 限流，等待重試...`;
              step2.className = 'status-step loading';

              // Live countdown
              for (let s = waitSec; s > 0; s--) {
                step2.querySelector('.step-text').textContent = `Figma API 限流中，${s} 秒後自動重試 (${attempt + 1}/${maxRetries})`;
                await new Promise(r => setTimeout(r, 1000));
              }
              step2.querySelector('.step-text').textContent = `重試讀取設計稿...`;
              continue;
            }
          }
          break;
        }
        
        if (!autoRes.ok) {
          const errData = await autoRes.json().catch(() => ({}));
          throw new Error(errData.error || `API 錯誤: ${autoRes.status}`);
        }
        
        const autoData = await autoRes.json();
        const scope = autoData.scope || 'node';
        step2.className = 'status-step success';
        this.setProgress(40);

        const step3 = addStep(scope === 'page' ? '解析整頁設計結構...' : '解析節點結構...');
        
        let targetDoc;
        let rootName;
        
        if (scope === 'node') {
          // Single frame mode: use the specific node
          const normalizedId = parsed.nodeId.replace(/-/g, ':');
          const targetNodeWrapper = autoData.nodeData?.nodes?.[normalizedId];
          targetDoc = targetNodeWrapper?.document;
          if (!targetDoc) {
            throw new Error(`找不到節點 ${parsed.nodeId}，請確認連結是否正確`);
          }
          rootName = targetDoc.name;
        } else {
          // Page mode: find the primary frame (largest FRAME on the first page)
          const pages = autoData.nodeData?.document?.children || [];
          if (pages.length === 0) {
            throw new Error('Figma 檔案沒有頁面');
          }
          
          const firstPage = pages[0];
          const pageChildren = firstPage.children || [];
          
          // Find the largest FRAME by area as the primary design
          let primaryFrame = null;
          let maxArea = 0;
          for (const child of pageChildren) {
            if (child.type === 'FRAME' && child.absoluteBoundingBox) {
              const area = (child.absoluteBoundingBox.width || 0) * (child.absoluteBoundingBox.height || 0);
              if (area > maxArea) {
                maxArea = area;
                primaryFrame = child;
              }
            }
          }
          
          if (primaryFrame) {
            // Use the primary frame as the root, but wrap all page children into it
            targetDoc = {
              ...primaryFrame,
              name: firstPage.name || primaryFrame.name,
              _pageChildren: pageChildren, // Keep reference to all page children
            };
            rootName = `${firstPage.name} (${pageChildren.length} 個元素)`;
          } else {
            // No FRAME found, use the first page as a virtual container
            targetDoc = {
              id: firstPage.id,
              name: firstPage.name || 'Page 1',
              type: 'FRAME',
              children: pageChildren,
              absoluteBoundingBox: this._calculatePageBounds(pageChildren),
            };
            rootName = firstPage.name || 'Page 1';
          }
        }

        // Store file data for the select view
        this.state.fileData = {
          name: autoData.fileInfo?.name || '未命名',
          lastModified: autoData.fileInfo?.lastModified,
          version: autoData.fileInfo?.version,
          thumbnailUrl: autoData.fileInfo?.thumbnailUrl,
          document: autoData.nodeData?.document || { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
        };

        // Parse the Figma node tree into our internal format
        this.nodeParser.reset();
        const parsedTree = this.nodeParser.parse(targetDoc);
        
        if (!parsedTree) {
          throw new Error('無法解析節點結構');
        }

        parsedTree._colorSystem = this.nodeParser.getColorSystem();
        parsedTree._fontSystem = this.nodeParser.getFontSystem();

        step3.className = 'status-step success';
        this.setProgress(55);

        const step4 = addStep(`套用 ${autoData.exportedNodeCount || 0} 個圖片素材...`);
        
        // Apply image URLs from the auto-convert response
        if (autoData.images) {
          const imgCount = Object.keys(autoData.images).length;
          console.log(`[Auto-Convert Client] autoData.images has ${imgCount} entries. First 5 keys:`, Object.keys(autoData.images).slice(0, 5));
          parsedTree._imageUrls = autoData.images;
          this._applyImageUrls(parsedTree, autoData.images);
          
          // Populate screen image cache from autoData.images
          if (!this.state.screenImages) this.state.screenImages = {};
          if (parsedTree && parsedTree.children) {
            parsedTree.children.forEach(child => {
              if (autoData.images[child.id]) {
                this.state.screenImages[child.name] = this.figmaApi.getImageProxyUrl(autoData.images[child.id]);
              }
            });
          }
          
          // Apply root frame render as background
          if (autoData.images[targetDoc.id]) {
            const rootImgUrl = this.figmaApi.getImageProxyUrl(autoData.images[targetDoc.id]);
            parsedTree.styles['background-image'] = `url('${rootImgUrl}')`;
            parsedTree.styles['background-size'] = '100% 100%';
            parsedTree.styles['background-position'] = 'top left';
            parsedTree.styles['background-repeat'] = 'no-repeat';
          }
        }

        // Apply absolute positioning
        this._applyAbsolutePositions(parsedTree, parsedTree.bounds);
        step4.className = 'status-step success';
        this.setProgress(70);

        this.state.parsedTree = parsedTree;

        const step5 = addStep('產生 HTML/CSS...');
        const options = this._getPromptOptions();
        const code = this.codeGenerator.generate(parsedTree, options);
        this.state.generatedCode = code;
        this.setProgress(85);

        const prompt = this.promptBuilder.build(parsedTree, options);
        this.state.generatedPrompt = prompt;
        step5.className = 'status-step success';
        this.setProgress(100);

        this._updateConnectionStatus(true);
        this.enableNav('view-select');
        this.enableNav('view-editor');
        this.enableNav('view-prompt');

        // Populate select view (for reference)
        this._populateSelectView(this.state.fileData);

        // Load editor
        this._loadEditorView(code, parsedTree);
        this._loadPromptView(prompt);

        // Populate screen selector with detected screens
        this._populateScreenSelector(parsedTree);

        const imgCount = autoData.images ? Object.keys(autoData.images).length : 0;
        this.toast(`✨ 一鍵切版完成！${rootName} — ${imgCount} 張圖片。可點擊「選擇節點」瀏覽完整結構`, 'success', 6000);
        
        // Jump directly to editor FIRST (so the view is visible for fitToScreen)
        setTimeout(() => this.showView('view-editor'), 600);

        // THEN set device preset and fit to screen AFTER the view is confirmed visible
        if (parsedTree.bounds) {
          const customPreset = {
            name: `Figma 設計稿`,
            width: Math.round(parsedTree.bounds.width),
            height: Math.round(parsedTree.bounds.height),
          };
          this.DEVICE_PRESETS.figma = customPreset;
          // Wait for view to be visible (600ms) + DOM layout time (400ms)
          setTimeout(() => {
            this.visualEditor.setDevicePreset(customPreset);
            document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
             // Set zoom to 100% initially as requested by the user
             requestAnimationFrame(() => {
               this.visualEditor.setZoom(100);
               const zoomLabel = document.getElementById('zoom-level');
               if (zoomLabel) zoomLabel.textContent = '100%';
             });
          }, 1200);
        }

      } catch (err) {
        addStep(`錯誤: ${err.message}`, 'error');
        this.setProgress(0, false);
        this.toast(`一鍵切版失敗: ${err.message}`, 'error');
        this._updateConnectionStatus(false);
      } finally {
        spinner.classList.add('hidden');
        btnText.textContent = '連接 Figma';
        document.getElementById('btn-connect').disabled = false;
      }
      return;
    }

    // ── STANDARD FLOW: no node-id, go through node selection ──
    btnText.textContent = '連接中...';
    try {
      this.setProgress(10);
      const step1 = addStep('驗證 Token...');

      await new Promise(r => setTimeout(r, 300));
      step1.className = 'status-step success';
      this.setProgress(30);

      const step2 = addStep('讀取檔案結構...');
      const fileData = await this.figmaApi.getFile(parsed.fileKey, { depth: 6 });
      this.state.fileData = fileData;
      step2.className = 'status-step success';
      this.setProgress(70);

      const step3 = addStep('載入縮圖...');
      await new Promise(r => setTimeout(r, 300));
      step3.className = 'status-step success';
      this.setProgress(100);

      this._updateConnectionStatus(true);
      this.enableNav('view-select');
      this._populateSelectView(fileData);
      this.toast('成功連接 Figma 檔案！', 'success');

      setTimeout(() => this.showView('view-select'), 500);
    } catch (err) {
      const errStep = addStep(`錯誤: ${err.message}`, 'error');
      this.setProgress(0, false);
      this.toast(`連接失敗: ${err.message}`, 'error');
      this._updateConnectionStatus(false);
    } finally {
      spinner.classList.add('hidden');
      btnText.textContent = '連接 Figma';
      document.getElementById('btn-connect').disabled = false;
    }
  }

  _updateConnectionStatus(connected) {
    const badge = document.getElementById('connection-status');
    const text = badge.querySelector('.status-text');
    badge.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
    text.textContent = connected ? '已連接' : '未連接';
  }

  // ─── Select View ───
  _initSelectView() {
    document.getElementById('btn-back-connect').addEventListener('click', () => this.showView('view-connect'));
    document.getElementById('btn-select-all').addEventListener('click', () => this._toggleAllNodes(true));
    document.getElementById('btn-deselect-all').addEventListener('click', () => this._toggleAllNodes(false));
    document.getElementById('btn-start-convert').addEventListener('click', () => this._handleConvert());

    const searchInput = document.getElementById('input-search-nodes');
    const clearBtn = document.getElementById('btn-clear-search');

    searchInput.addEventListener('input',
      debounce((e) => {
        this._filterNodes(e.target.value);
        if (clearBtn) clearBtn.style.display = e.target.value ? '' : 'none';
      }, 200)
    );

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this._filterNodes('');
        clearBtn.style.display = 'none';
        searchInput.focus();
      });
    }
  }

  _populateSelectView(fileData) {
    document.getElementById('file-name').textContent = fileData.name || '未命名檔案';
    document.getElementById('file-last-modified').querySelector('span').textContent = formatDate(fileData.lastModified);
    const versionText = fileData.version === 'local' ? '本地模式' : `v${fileData.version || '—'}`;
    document.getElementById('file-version').querySelector('span').textContent = versionText;

    if (fileData.thumbnailUrl) {
      const thumb = document.getElementById('file-thumbnail');
      thumb.innerHTML = `<img src="${this.figmaApi.getImageProxyUrl(fileData.thumbnailUrl)}" alt="縮圖" onerror="this.style.display='none'">`;
    }

    this._buildNodeTree(fileData.document);
  }

  _buildNodeTree(docNode) {
    const container = document.getElementById('node-tree');
    container.innerHTML = '';

    if (!docNode?.children) return;

    for (const page of docNode.children) {
      const pageEl = this._createTreeItem(page, true);
      container.appendChild(pageEl);
    }

    lucide.createIcons({ nodes: [container] });
  }

  _createTreeItem(node, expanded = false) {
    const hasChildren = node.children?.length > 0;
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.nodeId = node.id;
    item.dataset.nodeName = node.name || '';

    const typeIconMap = {
      CANVAS: 'file', FRAME: 'square', GROUP: 'group', COMPONENT: 'component',
      INSTANCE: 'copy', TEXT: 'type', RECTANGLE: 'square', ELLIPSE: 'circle',
      LINE: 'minus', VECTOR: 'pen-tool', IMAGE: 'image', BOOLEAN_OPERATION: 'layers',
      COMPONENT_SET: 'grid', SECTION: 'layout', TABLE: 'table', STICKY: 'sticky-note',
      SHAPE_WITH_TEXT: 'message-square', CONNECTOR: 'link', STAMP: 'badge',
      WIDGET: 'puzzle', SLICE: 'scissors', STAR: 'star',
    };

    const iconName = typeIconMap[node.type] || 'box';
    const dims = node.absoluteBoundingBox
      ? `${Math.round(node.absoluteBoundingBox.width)}×${Math.round(node.absoluteBoundingBox.height)}`
      : '';

    // Escape node.id for safe use in HTML attributes (handles quotes, special chars)
    const safeId = escapeHtml(node.id).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    const safeName = escapeHtml(node.name || '未命名');

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.innerHTML = `
      ${hasChildren ? `<span class="tree-chevron ${expanded ? 'expanded' : ''}"><i data-lucide="chevron-right"></i></span>` : '<span class="tree-chevron-spacer"></span>'}
      <label class="tree-checkbox">
        <input type="checkbox" class="node-checkbox">
        <span class="checkmark"></span>
      </label>
      <i data-lucide="${iconName}" class="tree-type-icon"></i>
      <span class="tree-name">${safeName}</span>
      ${dims ? `<span class="tree-dims">${dims}</span>` : ''}
      <span class="tree-type-label">${node.type}</span>
    `;

    // Set data-node-id via DOM API instead of innerHTML to avoid escaping issues
    const checkbox = row.querySelector('.node-checkbox');
    if (checkbox) {
      checkbox.dataset.nodeId = node.id;
    }

    item.appendChild(row);

    row.querySelector('.tree-checkbox input')?.addEventListener('change', (e) => {
      e.stopPropagation();
      const isChecked = e.target.checked;

      const toggleFn = (targetNode, targetEl) => {
        if (isChecked) {
          this.state.selectedNodes.add(targetNode.id);
        } else {
          this.state.selectedNodes.delete(targetNode.id);
        }

        const cb = targetEl.querySelector(':scope > .tree-row .node-checkbox');
        if (cb) {
          cb.checked = isChecked;
          cb.indeterminate = false;
        }

        if (targetNode.children && targetNode.children.length > 0) {
          const childrenContainer = targetEl.querySelector(':scope > .tree-children');
          if (childrenContainer) {
            const childItems = childrenContainer.children;
            for (let i = 0; i < targetNode.children.length; i++) {
              if (childItems[i]) {
                toggleFn(targetNode.children[i], childItems[i]);
              }
            }
          }
        }
      };

      toggleFn(node, item);

      // Bubble up: update parent checkbox indeterminate state
      this._updateParentCheckboxState(item);

      this._updateSelectedCount();
    });


    if (hasChildren) {
      const chevron = row.querySelector('.tree-chevron');
      const childContainer = document.createElement('div');
      childContainer.className = `tree-children ${expanded ? '' : 'collapsed'}`;

      for (const child of node.children) {
        childContainer.appendChild(this._createTreeItem(child, false));
      }

      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        chevron.classList.toggle('expanded');
        childContainer.classList.toggle('collapsed');
      });

      item.appendChild(childContainer);
    }

    row.addEventListener('click', (e) => {
      if (e.target.closest('.tree-checkbox') || e.target.closest('.tree-chevron')) return;
      document.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      this._previewNode(node);
    });

    return item;
  }

  _previewNode(node) {
    const preview = document.getElementById('node-preview');
    const info = document.getElementById('preview-info');

    // Show loading state
    preview.innerHTML = `<div class="preview-placeholder"><div class="spinner" style="border-color:rgba(88,166,255,0.3);border-top-color:#58a6ff;width:24px;height:24px;"></div><p style="margin-top:8px">載入中...</p></div>`;
    const previewRequestId = Symbol();
    this._currentPreviewRequest = previewRequestId;

    if (node.absoluteBoundingBox) {
      const b = node.absoluteBoundingBox;
      info.innerHTML = `
        <div class="info-row"><span>類型</span><span>${node.type}</span></div>
        <div class="info-row"><span>尺寸</span><span>${Math.round(b.width)} × ${Math.round(b.height)}</span></div>
        <div class="info-row"><span>位置</span><span>(${Math.round(b.x)}, ${Math.round(b.y)})</span></div>
      `;
    } else {
      info.innerHTML = `
        <div class="info-row"><span>類型</span><span>${node.type || 'FILE'}</span></div>
        <div class="info-row"><span>名稱</span><span>${escapeHtml(node.name || '')}</span></div>
      `;
    }

    // Local mode: preview images directly or show file info
    if (this.state.isLocalMode && node._localPath) {
      const ext = (node._localPath || '').split('.').pop().toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
        preview.innerHTML = `<img src="/ingame-assets/${node._localPath}" alt="${escapeHtml(node.name || '')}" class="preview-image" onerror="this.parentElement.innerHTML='<p style=color:var(--text-tertiary)>圖片載入失敗</p>'">`;
      } else if (['aspx', 'html', 'htm'].includes(ext)) {
        preview.innerHTML = `<div class="preview-placeholder"><i data-lucide="file-code" style="width:32px;height:32px;color:var(--accent-primary)"></i><p style="margin-top:8px">${escapeHtml(node.name)}</p><p style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${node._fileSize ? Math.round(node._fileSize / 1024) + ' KB' : ''} · 點擊「開始轉換」預覽</p></div>`;
        lucide.createIcons({ nodes: [preview] });
      } else if (['css', 'scss', 'sass'].includes(ext)) {
        preview.innerHTML = `<div class="preview-placeholder"><i data-lucide="palette" style="width:32px;height:32px;color:var(--accent-primary)"></i><p style="margin-top:8px">${escapeHtml(node.name)}</p><p style="font-size:11px;color:var(--text-tertiary);margin-top:4px">樣式檔案 · ${node._fileSize ? Math.round(node._fileSize / 1024) + ' KB' : ''}</p></div>`;
        lucide.createIcons({ nodes: [preview] });
      } else {
        preview.innerHTML = `<div class="preview-placeholder"><i data-lucide="file" style="width:32px;height:32px"></i><p style="margin-top:8px">${escapeHtml(node.name)}</p></div>`;
        lucide.createIcons({ nodes: [preview] });
      }
      return;
    }

    // Figma mode: fetch rendered image
    if (this.state.fileKey) {
      this.figmaApi.getImages(this.state.fileKey, node.id, 'png', 2)
        .then(data => {
          if (this._currentPreviewRequest !== previewRequestId) return; // race guard
          const url = data.images?.[node.id];
          if (url) {
            preview.innerHTML = `<img src="${this.figmaApi.getImageProxyUrl(url)}" alt="預覽" class="preview-image">`;
          } else {
            preview.innerHTML = `<div class="preview-placeholder"><p>此節點無法預覽</p></div>`;
          }
        })
        .catch(() => {
          if (this._currentPreviewRequest !== previewRequestId) return;
          preview.innerHTML = `<div class="preview-placeholder"><p>預覽載入失敗</p></div>`;
        });
    } else {
      preview.innerHTML = `<div class="preview-placeholder"><i data-lucide="mouse-pointer-click"></i><p>選擇節點以預覽</p></div>`;
      lucide.createIcons({ nodes: [preview] });
    }
  }

  _toggleAllNodes(checked) {
    // Directly toggle all checkboxes without expanding nodes (performance fix)
    this.state.selectedNodes.clear();
    const checkboxes = document.querySelectorAll('.node-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = checked;
      if (checked && cb.dataset.nodeId) {
        this.state.selectedNodes.add(cb.dataset.nodeId);
      }
    });
    this._updateSelectedCount();
  }

  _updateSelectedCount() {
    const count = this.state.selectedNodes.size;
    const countEl = document.getElementById('selected-count');
    const detailEl = document.getElementById('selected-detail');
    countEl.textContent = count;
    document.getElementById('btn-start-convert').disabled = count === 0;

    // Show type breakdown if available
    if (detailEl && count > 0) {
      const types = {};
      document.querySelectorAll('.node-checkbox:checked').forEach(cb => {
        const treeItem = cb.closest('.tree-item');
        if (treeItem) {
          const typeLabel = treeItem.querySelector(':scope > .tree-row .tree-type-label');
          if (typeLabel) {
            const t = typeLabel.textContent.trim();
            types[t] = (types[t] || 0) + 1;
          }
        }
      });
      const typeSummary = Object.entries(types)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 4)
        .map(([t, n]) => `${t}×${n}`)
        .join('  ');
      detailEl.textContent = typeSummary || '';
      detailEl.style.display = typeSummary ? '' : 'none';
    } else if (detailEl) {
      detailEl.textContent = '';
      detailEl.style.display = 'none';
    }
  }

  /** Bubble up parent checkbox indeterminate state */
  _updateParentCheckboxState(itemEl) {
    let parentItem = itemEl.parentElement?.closest('.tree-item');
    while (parentItem) {
      const childCheckboxes = parentItem.querySelectorAll(':scope > .tree-children .node-checkbox');
      const total = childCheckboxes.length;
      let checkedCount = 0;
      childCheckboxes.forEach(cb => { if (cb.checked) checkedCount++; });

      const parentCb = parentItem.querySelector(':scope > .tree-row .node-checkbox');
      if (parentCb) {
        if (checkedCount === 0) {
          parentCb.checked = false;
          parentCb.indeterminate = false;
        } else if (checkedCount === total) {
          parentCb.checked = true;
          parentCb.indeterminate = false;
        } else {
          parentCb.checked = false;
          parentCb.indeterminate = true;
        }
      }
      parentItem = parentItem.parentElement?.closest('.tree-item');
    }
  }

  _filterNodes(query) {
    const q = query.toLowerCase();
    const allItems = document.querySelectorAll('.tree-item');

    if (!q) {
      // Clear search: show all
      allItems.forEach(item => { item.style.display = ''; });
      return;
    }

    // Mark matching items and propagate visibility to ancestors
    const matchSet = new Set();
    allItems.forEach(item => {
      const name = (item.dataset.nodeName || '').toLowerCase();
      if (name.includes(q)) {
        matchSet.add(item);
        // Also mark all ancestor .tree-item so parent folders stay visible
        let parent = item.parentElement?.closest('.tree-item');
        while (parent) {
          matchSet.add(parent);
          parent = parent.parentElement?.closest('.tree-item');
        }
      }
    });

    allItems.forEach(item => {
      item.style.display = matchSet.has(item) ? '' : 'none';
    });

    // Auto-expand matching items' parents
    matchSet.forEach(item => {
      const children = item.querySelector(':scope > .tree-children');
      if (children) children.classList.remove('collapsed');
      const chevron = item.querySelector(':scope > .tree-row .tree-chevron');
      if (chevron) chevron.classList.add('expanded');
    });
  }

  // ─── Convert ───
  async _handleConvert() {
    const originalNodeIds = [...this.state.selectedNodes];
    if (!originalNodeIds.length) return;

    // Filter out redundant child nodes if their parent/ancestor is already selected
    const selectedSet = new Set(originalNodeIds);
    const nodeIds = [];
    const parentMap = new Map();

    if (this.state.fileData && this.state.fileData.document) {
      const walkBuildParentMap = (node, parent) => {
        if (!node) return;
        if (parent) parentMap.set(node.id, parent.id);
        if (node.children) {
          for (const child of node.children) {
            walkBuildParentMap(child, node);
          }
        }
      };
      walkBuildParentMap(this.state.fileData.document, null);

      for (const id of originalNodeIds) {
        let isChildOfSelected = false;
        let currId = id;
        while (parentMap.has(currId)) {
          const parentId = parentMap.get(currId);
          if (selectedSet.has(parentId)) {
            isChildOfSelected = true;
            break;
          }
          currId = parentId;
        }
        if (!isChildOfSelected) {
          nodeIds.push(id);
        }
      }
    } else {
      // Fallback
      nodeIds.push(...originalNodeIds);
    }

    if (nodeIds.length > 20) {
      const confirmConvert = confirm(`[提示] 您選擇了 ${nodeIds.length} 個頂層節點。通常您只需要勾選最頂層的 1~2 個 Frame 節點即可。\n\n一次轉換過多頂層節點會導致轉換速度變慢，是否仍然要繼續轉換？`);
      if (!confirmConvert) return;
    }

    const spinner = document.getElementById('convert-spinner');
    spinner.classList.remove('hidden');
    this.setProgress(10);

    try {
      // Local mode: parse ASPX/HTML files directly
      if (this.state.isLocalMode) {
        return await this._handleLocalConvert(nodeIds, spinner);
      }

      this.setProgress(30);
      const nodesData = await this.figmaApi.getNodes(this.state.fileKey, nodeIds, 10);
      this.setProgress(50);

      this.nodeParser.reset();
      const nodeEntries = Object.entries(nodesData.nodes || {});
      const allParsed = [];

      for (const [id, nodeObj] of nodeEntries) {
        const parsed = this.nodeParser.parse(nodeObj.document);
        if (parsed) allParsed.push(parsed);
      }

      if (!allParsed.length) {
        this.toast('無法解析節點', 'error');
        return;
      }

      // Merge multiple selected nodes into a single container
      let firstTree;
      if (allParsed.length === 1) {
        firstTree = allParsed[0];
      } else {
        const mergedBounds = this._calculatePageBounds(
          allParsed.map(n => n.originalNode).filter(Boolean)
        );
        firstTree = {
          id: 'multi-root',
          name: 'Selected Nodes',
          type: 'FRAME',
          className: 'selected-nodes',
          htmlTag: 'div',
          styles: { position: 'relative' },
          children: allParsed,
          visible: true,
          bounds: mergedBounds,
          depth: 0,
          originalNode: { absoluteBoundingBox: mergedBounds },
        };
      }

      firstTree._colorSystem = this.nodeParser.getColorSystem();
      firstTree._fontSystem = this.nodeParser.getFontSystem();

      const imageNodeIds = this.nodeParser.getImageNodeIds();
      
      // Also export the entire root frame and all top-level screen frames for visual fidelity and overlay comparison
      const allIdsToExport = [...imageNodeIds];
      if (firstTree.id && !allIdsToExport.includes(firstTree.id)) {
        allIdsToExport.push(firstTree.id);
      }
      if (firstTree && firstTree.children) {
        firstTree.children.forEach(child => {
          if (child.id && !allIdsToExport.includes(child.id)) {
            allIdsToExport.push(child.id);
          }
        });
      }

      if (allIdsToExport.length) {
        try {
          const imgData = await this.figmaApi.getImages(this.state.fileKey, allIdsToExport, 'png', 2);
          const imageUrls = imgData.images || {};
          firstTree._imageUrls = imageUrls;
          // Apply image URLs to child nodes with image fills
          this._applyImageUrls(firstTree, imageUrls);
          
          // Populate screen image cache
          if (!this.state.screenImages) this.state.screenImages = {};
          if (firstTree && firstTree.children) {
            firstTree.children.forEach(child => {
              if (imageUrls[child.id]) {
                this.state.screenImages[child.name] = this.figmaApi.getImageProxyUrl(imageUrls[child.id]);
              }
            });
          }
          
          // Apply root frame render as background for visual fidelity
          if (imageUrls[firstTree.id]) {
            const rootImgUrl = this.figmaApi.getImageProxyUrl(imageUrls[firstTree.id]);
            firstTree.styles['background-image'] = `url('${rootImgUrl}')`;
            firstTree.styles['background-size'] = 'contain';
            firstTree.styles['background-position'] = 'center';
            firstTree.styles['background-repeat'] = 'no-repeat';
          }
        } catch { /* skip */ }
      }

      // Apply absolute positioning for Figma nodes
      this._applyAbsolutePositions(firstTree, firstTree.bounds);

      this.state.parsedTree = firstTree;
      this.setProgress(70);

      const options = this._getPromptOptions();
      const code = this.codeGenerator.generate(firstTree, options);
      this.state.generatedCode = code;
      this.setProgress(85);

      const prompt = this.promptBuilder.build(firstTree, options);
      this.state.generatedPrompt = prompt;
      this.setProgress(100);

      this.enableNav('view-editor');
      this.enableNav('view-prompt');

      this._loadEditorView(code, firstTree);
      this._loadPromptView(prompt);

      // Show at 100% zoom initially when conversion/slicing is done
      this.visualEditor.setZoom(100);
      const zoomLabel = document.getElementById('zoom-level');
      if (zoomLabel) zoomLabel.textContent = '100%';

      this.toast('轉換完成！', 'success');
      setTimeout(() => this.showView('view-editor'), 400);
    } catch (err) {
      this.toast(`轉換失敗: ${err.message}`, 'error');
      this.setProgress(0, false);
    } finally {
      spinner.classList.add('hidden');
    }
  }

  async _handleLocalConvert(nodeIds, spinner) {
    this.setProgress(30);

    // Walk fileData to find selected ASPX/HTML files
    const htmlNodes = [];
    const walkDoc = (docNode) => {
      if (!docNode) return;
      if (nodeIds.includes(docNode.id) && docNode._localPath) {
        htmlNodes.push(docNode);
      }
      if (docNode.children) {
        for (const child of docNode.children) walkDoc(child);
      }
    };
    walkDoc(this.state.fileData.document);

    // Filter to only ASPX/HTML files
    const pageFiles = htmlNodes.filter(n => {
      const ext = (n._localPath || '').split('.').pop().toLowerCase();
      return ['aspx', 'html', 'htm'].includes(ext);
    });

    // Determine which file to parse
    const filesToParse = pageFiles.length > 0
      ? pageFiles.map(n => n._localPath)
      : ['index.aspx'];

    this.state.localFiles = {};

    for (const filePath of filesToParse) {
      try {
        const parseRes = await fetch(`/api/local/parse?path=${encodeURIComponent(filePath)}`);
        if (parseRes.ok) {
          const data = await parseRes.json();
          this.state.localFiles[filePath] = {
            html: data.html,
            css: data.css
          };
        }
      } catch (err) {
        console.error(`Error parsing file ${filePath}:`, err);
      }
    }

    this.setProgress(60);

    // Choose preferred file to show first (e.g. index.aspx if present, or the first file)
    let activePath = filesToParse.find(p => p.toLowerCase().endsWith('index.aspx'));
    if (!activePath || !this.state.localFiles[activePath]) {
      activePath = Object.keys(this.state.localFiles)[0];
    }

    if (!activePath) {
      this.toast('無法解析選取的任何檔案', 'error');
      spinner.classList.add('hidden');
      this.setProgress(0, false);
      return;
    }

    this.state.activeFilePath = activePath;
    const activeFileData = this.state.localFiles[activePath];
    this.state.generatedCode = { html: activeFileData.html, css: activeFileData.css };

    this.setProgress(80);

    // Build a simple tree for the editor
    const simpleTree = {
      id: 'root',
      name: 'ingame',
      type: 'FRAME',
      className: 'ingame',
      htmlTag: 'div',
      styles: {},
      children: [],
      visible: true,
      _colorSystem: [],
      _fontSystem: [],
    };

    this.state.parsedTree = simpleTree;

    const options = this._getPromptOptions();
    const prompt = this.promptBuilder.build(simpleTree, options);
    this.state.generatedPrompt = prompt;
    this.setProgress(100);

    this.enableNav('view-editor');
    this.enableNav('view-prompt');

    this._loadEditorView(this.state.generatedCode, simpleTree);
    this._loadPromptView(prompt);

    // Populate screen selector with local mode screens (main + betting pages + popups)
    const select = document.getElementById('select-editor-screen');
    if (select) {
      select.innerHTML = '';
      const localScreens = [
        { value: 'main', label: '主畫面' },
        { value: 'betpage-3', label: '投注畫面 (分組賽)' },
        { value: 'betpage-2', label: '投注畫面 (淘汰賽)' },
      ];
      const virtualScreens = [
        { value: 'question', label: '📋 活動說明' },
        { value: 'record', label: '📊 查看結果' },
      ];
      for (const s of localScreens) {
        const opt = document.createElement('option');
        opt.value = s.value;
        opt.textContent = s.label;
        select.appendChild(opt);
      }
      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '── 彈窗畫面 ──';
      select.appendChild(sep);
      for (const vs of virtualScreens) {
        const opt = document.createElement('option');
        opt.value = vs.value;
        opt.textContent = vs.label;
        select.appendChild(opt);
      }
    }

    // Show at 100% zoom initially when conversion/slicing is done
    this.visualEditor.setZoom(100);
    const zoomLabel = document.getElementById('zoom-level');
    if (zoomLabel) zoomLabel.textContent = '100%';

    this.toast('本地檔案轉換完成！', 'success');
    setTimeout(() => this.showView('view-editor'), 400);

    spinner.classList.add('hidden');
  }

  _initEditorView() {
    this.visualEditor = new VisualEditor(document.getElementById('view-editor'));

    // Hook setScreen to synchronize screen selector dropdown and update Figma visual comparison overlay
    const origSetScreen = this.visualEditor.setScreen.bind(this.visualEditor);
    this.visualEditor.setScreen = (screenType) => {
      origSetScreen(screenType);
      
      const select = document.getElementById('select-editor-screen');
      if (select && select.value !== screenType) {
        const opt = Array.from(select.options).find(o => o.value === screenType);
        if (opt) {
          select.value = screenType;
        } else {
          let mapped = screenType;
          if (screenType === this.visualEditor.resolvedScreenNames.bet1) mapped = 'betpage-3';
          if (screenType === this.visualEditor.resolvedScreenNames.bet2) mapped = 'betpage-2';
          if (screenType === this.visualEditor.resolvedScreenNames.main) mapped = 'main';
          
          const opt2 = Array.from(select.options).find(o => o.value === mapped);
          if (opt2) select.value = mapped;
        }
      }
      
      const selectVal = select ? select.value : screenType;
      this._updateFigmaOverlay(selectVal);
    };

    // Back button handler
    const backBtn = document.getElementById('btn-back-to-select');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Auto-save before leaving
        if (this._hasUnsavedChanges) {
          this._saveToServer();
        }
        this.showView('view-select');
        this.toast('已返回選擇畫面', 'info');
      });
    }

    this.visualEditor.onSelectElement = (info) => {
      this._renderProperties(info);
      if (info && info.eid) {
        // Highlight active Design Tree node
        const treeContainer = document.getElementById('design-tree');
        treeContainer.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
        const row = treeContainer.querySelector(`.tree-row[data-eid="${info.eid}"]`);
        if (row) {
          row.classList.add('selected');
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };

    this.visualEditor.onLoad = () => {
      const domTree = this.visualEditor.getDomTree();
      this._buildDesignTree(domTree, document.getElementById('design-tree'));
      // Check for image loading errors after iframe loads
      this._checkImageErrors();
      // Set initial device preset (fitToScreen is called later when view becomes visible)
      this.visualEditor.setDevicePreset(this.DEVICE_PRESETS.win);
    };

    // Hook content change for auto-save
    this.visualEditor.onContentChange = () => {
      this._markUnsaved();
      this._updateUndoRedoButtons();
    };

    // Hook image loading errors
    this.visualEditor.onImageErrors = (errors) => {
      this._checkImageErrors();
    };

    const fileSelect = document.getElementById('editor-file-select');
    fileSelect.addEventListener('change', () => {
      const selectedPath = fileSelect.value;
      if (!selectedPath || selectedPath === this.state.activeFilePath) return;

      const currentCode = this.visualEditor.getModifiedCode();
      if (this.state.activeFilePath && this.state.localFiles[this.state.activeFilePath]) {
        this.state.localFiles[this.state.activeFilePath].html = currentCode.html;
        this.state.localFiles[this.state.activeFilePath].css = currentCode.css;
      }
      // Auto-save current file before switching
      if (this._hasUnsavedChanges) {
        this._saveToServer();
      }

      this.state.activeFilePath = selectedPath;
      const fileData = this.state.localFiles[selectedPath];
      if (!fileData) {
        this.toast('無法讀取檔案資料', 'error');
        return;
      }
      
      this.state.generatedCode = { html: fileData.html, css: fileData.css };

      this.visualEditor.loadCode(this.state.generatedCode.html, this.state.generatedCode.css);
      this._renderProperties(null);

      document.getElementById('code-html').textContent = this.state.generatedCode.html;
      document.getElementById('code-css').textContent = this.state.generatedCode.css;
      if (typeof Prism !== 'undefined') {
        Prism.highlightElement(document.getElementById('code-html'));
        Prism.highlightElement(document.getElementById('code-css'));
      }
      
      this.toast(`已載入檔案: ${selectedPath.split('/').pop().split('\\').pop()}`, 'info');
    });

    this._initPanelResizers();
    this._initCodeTabs();
    this._initEditorToolbar();
  }

  _initPanelResizers() {
    const setupDivider = (dividerId, panelId, direction, min, max) => {
      const divider = document.getElementById(dividerId);
      const panel = document.getElementById(panelId);
      if (!divider || !panel) return;

      let startPos, startSize;

      const onMouseMove = (e) => {
        const delta = direction === 'horizontal'
          ? e.clientX - startPos
          : startPos - e.clientY;
        const isRight = dividerId === 'divider-right';
        const newSize = isRight ? startSize - delta : startSize + delta;
        const clamped = Math.max(min, Math.min(max, newSize));
        panel.style[direction === 'horizontal' ? 'width' : 'height'] = `${clamped}px`;
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      divider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startPos = direction === 'horizontal' ? e.clientX : e.clientY;
        startSize = direction === 'horizontal' ? panel.offsetWidth : panel.offsetHeight;
        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    };

    setupDivider('divider-left', 'panel-left', 'horizontal', 180, 400);
    setupDivider('divider-right', 'panel-right', 'horizontal', 200, 450);
    setupDivider('divider-bottom', 'panel-code', 'vertical', 100, 500);
  }

  _initCodeTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.code-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab)?.classList.add('active');

        // Update code tab content with current edits
        const code = this.visualEditor.getModifiedCode();
        document.getElementById('code-html').textContent = code.html;
        document.getElementById('code-css').textContent = code.css;
        if (typeof Prism !== 'undefined') {
          Prism.highlightElement(document.getElementById('code-html'));
          Prism.highlightElement(document.getElementById('code-css'));
        }
      });
    });

    document.getElementById('btn-copy-code').addEventListener('click', async () => {
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      const code = this.visualEditor.getModifiedCode();
      let text = '';
      if (activeTab === 'tab-html') text = code.html;
      else if (activeTab === 'tab-css') text = code.css;
      else if (activeTab === 'tab-prompt') text = this.state.generatedPrompt || '';

      if (text) {
        await copyToClipboard(text);
        this.toast('已複製到剪貼簿', 'success');
      }
    });

    document.getElementById('btn-download-zip').addEventListener('click', async () => {
      const currentActiveCode = this.visualEditor.getModifiedCode();
      if (this.state.activeFilePath && this.state.localFiles && this.state.localFiles[this.state.activeFilePath]) {
        this.state.localFiles[this.state.activeFilePath].html = currentActiveCode.html;
        this.state.localFiles[this.state.activeFilePath].css = currentActiveCode.css;
      }

      try {
        const zipFiles = [];

        // Build a mapping from figma proxy URL to its Layer name (data-figma-name)
        const urlToFigmaNameMap = new Map();
        const usedFilenames = new Set();
        const iframeDoc = this.visualEditor?.iframe?.contentDocument;
        if (iframeDoc) {
          iframeDoc.querySelectorAll('[data-figma-name]').forEach(el => {
            const figmaName = el.getAttribute('data-figma-name');
            if (!figmaName) return;

            // Handle <img> src
            if (el.tagName.toLowerCase() === 'img') {
              const srcAttr = el.getAttribute('src');
              if (srcAttr && (srcAttr.startsWith('/api/figma/image-proxy') || srcAttr.includes('figma'))) {
                urlToFigmaNameMap.set(srcAttr, figmaName);
                try {
                  const urlObj = new URL(srcAttr, window.location.origin);
                  const relativePath = urlObj.pathname + urlObj.search;
                  urlToFigmaNameMap.set(relativePath, figmaName);
                } catch(e){}
              }
            }

            // Handle background-image
            const bgImg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage;
            if (bgImg && bgImg !== 'none') {
              const match = bgImg.match(/url\(['"]?([^'"]+)['"]?\)/i);
              if (match) {
                const bgUrl = match[1];
                if (bgUrl.startsWith('/api/figma/image-proxy') || bgUrl.includes('figma')) {
                  urlToFigmaNameMap.set(bgUrl, figmaName);
                  try {
                    const urlObj = new URL(bgUrl, window.location.origin);
                    const relativePath = urlObj.pathname + urlObj.search;
                    urlToFigmaNameMap.set(relativePath, figmaName);
                  } catch(e){}
                }
              }
            }
          });
        }

        // Helper: scan HTML for image references and fetch them as blobs
        const collectImages = async (htmlContent) => {
          const imageFiles = [];
          const processedUrls = new Set();

          // Match <img src="..."> references
          const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
          let match;
          while ((match = imgSrcRegex.exec(htmlContent)) !== null) {
            const src = match[1];
            if (processedUrls.has(src)) continue;
            processedUrls.add(src);

            try {
              if (src.startsWith('/ingame-assets/')) {
                // Local mode: fetch from server
                const resp = await fetch(src);
                if (resp.ok) {
                  const blob = await resp.blob();
                  // e.g. /ingame-assets/images/foo.png → images/foo.png
                  const relativePath = src.replace(/^\/ingame-assets\//, '');
                  imageFiles.push({ src, relativePath, blob });
                }
              } else if (src.startsWith('/api/figma/image-proxy') || src.includes('figma')) {
                // Figma proxy images
                const resp = await fetch(src);
                if (resp.ok) {
                  const blob = await resp.blob();
                  
                  // Look up figma layer name mapping
                  let figmaName = null;
                  for (const [key, name] of urlToFigmaNameMap.entries()) {
                    if (src === key || src.includes(key) || key.includes(src)) {
                      figmaName = name;
                      break;
                    }
                  }

                  let filename = '';
                  if (figmaName) {
                    // Sanitize filename to avoid invalid characters, spaces replaced by underscores
                    filename = figmaName.trim().replace(/[/\\?%*:|"<>\s]/g, '_');
                    if (!filename.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
                      filename += '.png';
                    }
                  } else {
                    const urlObj = new URL(src, window.location.origin);
                    const originalUrl = urlObj.searchParams.get('url') || src;
                    filename = originalUrl.split('/').pop().split('?')[0] || 'image.png';
                    if (!filename.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) filename += '.png';
                  }

                  // Deduplicate filename inside zip to prevent conflicts
                  let finalFilename = filename;
                  let baseName = finalFilename.substring(0, finalFilename.lastIndexOf('.'));
                  let ext = finalFilename.substring(finalFilename.lastIndexOf('.'));
                  let count = 1;
                  while (usedFilenames.has(finalFilename)) {
                    finalFilename = `${baseName}_${count}${ext}`;
                    count++;
                  }
                  usedFilenames.add(finalFilename);

                  const relativePath = `images/${finalFilename}`;
                  imageFiles.push({ src, relativePath, blob });
                }
              }
            } catch (imgErr) {
              console.warn(`[Download] Failed to fetch image: ${src}`, imgErr);
            }
          }

          // Scan CSS for background-image url() references
          const bgUrlRegex = /url\(['"]?(\/ingame-assets\/[^'"\)\s]+|\/api\/figma\/[^'"\)\s]+)['"]?\)/gi;
          const cssContent = currentActiveCode.css || '';
          const allContent = htmlContent + '\n' + cssContent;
          while ((match = bgUrlRegex.exec(allContent)) !== null) {
            const src = match[1];
            if (processedUrls.has(src)) continue;
            processedUrls.add(src);

            try {
              const resp = await fetch(src);
              if (resp.ok) {
                const blob = await resp.blob();
                let relativePath = '';
                if (src.startsWith('/ingame-assets/')) {
                  relativePath = src.replace(/^\/ingame-assets\//, '');
                } else {
                  // Figma proxy background image
                  let figmaName = null;
                  for (const [key, name] of urlToFigmaNameMap.entries()) {
                    if (src === key || src.includes(key) || key.includes(src)) {
                      figmaName = name;
                      break;
                    }
                  }

                  let filename = '';
                  if (figmaName) {
                    filename = figmaName.trim().replace(/[/\\?%*:|"<>\s]/g, '_');
                    if (!filename.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
                      filename += '.png';
                    }
                  } else {
                    filename = src.split('/').pop().split('?')[0] || 'bg.png';
                    if (!filename.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) filename += '.png';
                  }

                  // Deduplicate filename inside zip to prevent conflicts
                  let finalFilename = filename;
                  let baseName = finalFilename.substring(0, finalFilename.lastIndexOf('.'));
                  let ext = finalFilename.substring(finalFilename.lastIndexOf('.'));
                  let count = 1;
                  while (usedFilenames.has(finalFilename)) {
                    finalFilename = `${baseName}_${count}${ext}`;
                    count++;
                  }
                  usedFilenames.add(finalFilename);

                  relativePath = `images/${finalFilename}`;
                }
                imageFiles.push({ src, relativePath, blob });
              }
            } catch (imgErr) {
              console.warn(`[Download] Failed to fetch bg image: ${src}`, imgErr);
            }
          }

          // Also scan for relative url() paths in CSS (e.g., url(images/betpage/foo.png))
          const relBgUrlRegex = /url\(['"]?((?:images|style|css)\/[^'")\s]+)['"]?\)/gi;
          while ((match = relBgUrlRegex.exec(allContent)) !== null) {
            const relSrc = match[1];
            const absSrc = `/ingame-assets/${relSrc}`;
            if (processedUrls.has(absSrc) || processedUrls.has(relSrc)) continue;
            processedUrls.add(absSrc);

            try {
              const resp = await fetch(absSrc);
              if (resp.ok) {
                const blob = await resp.blob();
                imageFiles.push({ src: relSrc, relativePath: relSrc, blob });
              }
            } catch (imgErr) {
              console.warn(`[Download] Failed to fetch relative bg image: ${relSrc}`, imgErr);
            }
          }

          return imageFiles;
        };

        // Helper: rewrite image paths in content from absolute to relative
        const rewriteImagePaths = (content, imageFiles) => {
          let result = content;
          for (const img of imageFiles) {
            // Replace all occurrences of the original src with the relative path
            result = result.split(img.src).join(img.relativePath);
          }
          return result;
        };

        // Collect all HTML content for image scanning
        let allHtmlContent = '';

        if (this.state.isLocalMode && this.state.localFiles && Object.keys(this.state.localFiles).length > 0) {
          for (const [filePath, fileData] of Object.entries(this.state.localFiles)) {
            allHtmlContent += fileData.html + '\n';
          }
        } else {
          allHtmlContent = currentActiveCode.html;
        }

        // Fetch all referenced images
        this.toast('正在收集圖片資源...', 'info', 2000);
        const imageFiles = await collectImages(allHtmlContent);

        if (this.state.isLocalMode && this.state.localFiles && Object.keys(this.state.localFiles).length > 0) {
          for (const [filePath, fileData] of Object.entries(this.state.localFiles)) {
            const baseName = filePath.split('/').pop().split('\\').pop();
            const htmlName = baseName.replace(/\.aspx$/i, '.html');
            let htmlBody = fileData.html;
            htmlBody = rewriteImagePaths(htmlBody, imageFiles);
            zipFiles.push({
              name: htmlName,
              content: `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n${htmlBody}\n</body>\n</html>`
            });
          }
          let cssContent = currentActiveCode.css;
          cssContent = rewriteImagePaths(cssContent, imageFiles);
          zipFiles.push({ name: 'style.css', content: cssContent });
          zipFiles.push({ name: 'prompt.md', content: this.state.generatedPrompt });
        } else {
          let htmlBody = rewriteImagePaths(currentActiveCode.html, imageFiles);
          let cssContent = rewriteImagePaths(currentActiveCode.css, imageFiles);
          zipFiles.push({ name: 'index.html', content: `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n${htmlBody}\n</body>\n</html>` });
          zipFiles.push({ name: 'style.css', content: cssContent });
          zipFiles.push({ name: 'prompt.md', content: this.state.generatedPrompt });
        }

        // Add image blobs to the zip
        for (const img of imageFiles) {
          zipFiles.push({ name: img.relativePath, blob: img.blob });
        }

        console.log('[ZIP DOWNLOAD FILES]:' + JSON.stringify(zipFiles.map(f => f.name)));
        await downloadAsZip(zipFiles);
        const imgCount = imageFiles.length;
        this.toast(`ZIP 已下載${imgCount > 0 ? ` (含 ${imgCount} 張圖片)` : ''}`, 'success');
      } catch (err) {
        this.toast(`下載失敗: ${err.message}`, 'error');
      }
    });

    document.getElementById('btn-toggle-code').addEventListener('click', () => {
      const panel = document.getElementById('panel-code');
      panel.classList.toggle('collapsed');
    });
  }

  _initEditorToolbar() {
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.visualEditor.zoom = Math.min(200, this.visualEditor.zoom + 10);
      this.visualEditor.setZoom(this.visualEditor.zoom);
      document.getElementById('zoom-level').textContent = `${this.visualEditor.zoom}%`;
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.visualEditor.zoom = Math.max(25, this.visualEditor.zoom - 10);
      this.visualEditor.setZoom(this.visualEditor.zoom);
      document.getElementById('zoom-level').textContent = `${this.visualEditor.zoom}%`;
    });

    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
      this.visualEditor.zoom = 100;
      this.visualEditor.setZoom(100);
      document.getElementById('zoom-level').textContent = '100%';
    });

    // Device preset buttons
    document.querySelectorAll('.device-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const device = btn.dataset.device;
        if (device && this.DEVICE_PRESETS[device]) {
          this.visualEditor.setDevicePreset(this.DEVICE_PRESETS[device]);
        }
      });
    });

    // All-device preview
    const allDeviceBtn = document.getElementById('btn-device-all');
    if (allDeviceBtn) {
      allDeviceBtn.addEventListener('click', () => this._showAllDevicePreview());
    }
    const closeAllDevice = document.getElementById('btn-close-all-device');
    if (closeAllDevice) {
      closeAllDevice.addEventListener('click', () => {
        document.getElementById('all-device-overlay')?.classList.add('hidden');
      });
    }

    document.getElementById('btn-refresh-preview').addEventListener('click', () => {
      if (this.state.generatedCode) {
        this.visualEditor.loadCode(this.state.generatedCode.html, this.state.generatedCode.css);
      }
    });

    // Save now button
    const saveBtn = document.getElementById('btn-save-now');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this._saveToServer());
    }

    // Restore button
    const restoreBtn = document.getElementById('btn-restore');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => this._restoreFromBackup());
    }

    // Undo/Redo buttons
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        this.visualEditor.undo();
        this._updateUndoRedoButtons();
      });
    }
    if (redoBtn) {
      redoBtn.addEventListener('click', () => {
        this.visualEditor.redo();
        this._updateUndoRedoButtons();
      });
    }

    const screenSelect = document.getElementById('select-editor-screen');
    if (screenSelect) {
      screenSelect.addEventListener('change', () => {
        this.visualEditor.setScreen(screenSelect.value);
        this._updateFigmaOverlay(screenSelect.value);
      });
    }

    // Figma comparison overlay toggle and opacity controls
    const toggleOverlayBtn = document.getElementById('btn-toggle-figma-overlay');
    const opacitySlider = document.getElementById('figma-overlay-opacity');
    const opacityLabel = document.getElementById('figma-overlay-opacity-label');
    const overlayDiv = document.getElementById('figma-overlay');

    if (toggleOverlayBtn && opacitySlider && overlayDiv) {
      toggleOverlayBtn.addEventListener('click', () => {
        const isActive = toggleOverlayBtn.classList.toggle('active');
        overlayDiv.style.display = isActive ? 'block' : 'none';
        
        if (isActive) {
          const select = document.getElementById('select-editor-screen');
          this._updateFigmaOverlay(select ? select.value : 'main');
        }
      });

      opacitySlider.addEventListener('input', () => {
        const val = opacitySlider.value;
        overlayDiv.style.opacity = val;
        if (opacityLabel) opacityLabel.textContent = `${Math.round(val * 100)}%`;
      });
    }

    // Edit mode toggle
    const editBtn = document.getElementById('btn-toggle-edit');
    const editLabel = document.getElementById('edit-mode-label');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const newMode = !this.visualEditor.editMode;
        this.visualEditor.setEditMode(newMode);
        editBtn.classList.toggle('active', newMode);
        if (editLabel) {
          editLabel.textContent = newMode ? '編輯模式' : '瀏覽模式';
          editLabel.style.color = newMode ? '#58a6ff' : '';
        }
        const iconEl = document.getElementById('icon-edit-mode');
        if (iconEl) {
          iconEl.setAttribute('data-lucide', newMode ? 'pencil' : 'mouse-pointer');
          lucide.createIcons({ nodes: [iconEl.parentElement] });
        }
        if (!newMode) {
          document.getElementById('img-error-panel')?.classList.add('hidden');
        }
        this.toast(newMode ? '已進入編輯模式 - 點擊元素可選取編輯，雙擊可編輯文字' : '已切換為瀏覽模式 - 可正常操作介面', 'info');
      });
    }
  }

  // ── Undo/Redo UI ──
  _updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !this.visualEditor.canUndo();
    if (redoBtn) redoBtn.disabled = !this.visualEditor.canRedo();
  }

  // ── Auto-Save System ──
  _setSaveStatus(status) {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.classList.remove('hidden', 'saved', 'saving', 'unsaved');
    el.classList.add(status);
    const text = el.querySelector('.save-text');
    if (text) {
      switch (status) {
        case 'saved':   text.textContent = '✓ 已儲存'; break;
        case 'saving':  text.textContent = '儲存中...'; break;
        case 'unsaved': text.textContent = '● 未儲存'; break;
      }
    }
  }

  _markUnsaved() {
    this._hasUnsavedChanges = true;
    this._setSaveStatus('unsaved');
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveToServer(), 2000);
  }

  async _ensureBackup() {
    if (this._backupCreated || !this.state.isLocalMode || !this.state.activeFilePath) return;
    try {
      await fetch('/api/local/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.state.activeFilePath })
      });
      this._backupCreated = true;
    } catch (err) {
      console.warn('Backup failed:', err);
    }
  }

  async _saveToServer() {
    if (!this.state.isLocalMode || !this.state.activeFilePath) return;
    await this._ensureBackup();
    this._setSaveStatus('saving');
    try {
      const code = this.visualEditor.getModifiedCode();
      // Update in-memory state
      if (this.state.localFiles[this.state.activeFilePath]) {
        this.state.localFiles[this.state.activeFilePath].html = code.html;
        this.state.localFiles[this.state.activeFilePath].css = code.css;
      }
      this.state.generatedCode = { html: code.html, css: code.css };

      const res = await fetch('/api/local/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.state.activeFilePath, html: code.html, css: code.css })
      });
      if (res.ok) {
        this._hasUnsavedChanges = false;
        this._setSaveStatus('saved');
        // Update code panels
        document.getElementById('code-html').textContent = code.html;
        document.getElementById('code-css').textContent = code.css;
        if (typeof Prism !== 'undefined') {
          Prism.highlightElement(document.getElementById('code-html'));
          Prism.highlightElement(document.getElementById('code-css'));
        }
        // Show sync badge briefly
        const badge = document.getElementById('code-sync-badge');
        if (badge) {
          badge.classList.remove('hidden');
          setTimeout(() => badge.classList.add('hidden'), 3000);
        }
      } else {
        this._setSaveStatus('unsaved');
        this.toast('儲存失敗，請重試', 'error');
      }
    } catch (err) {
      this._setSaveStatus('unsaved');
      this.toast(`儲存失敗: ${err.message}`, 'error');
    }
  }

  async _restoreFromBackup() {
    if (!this.state.isLocalMode || !this.state.activeFilePath) {
      this.toast('僅支援本地檔案還原', 'warning');
      return;
    }
    if (!confirm('確定要還原檔案嗎？所有未儲存的修改將會丟失。')) return;
    try {
      const res = await fetch('/api/local/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.state.activeFilePath })
      });
      if (res.ok) {
        // Re-parse the original file
        const parseRes = await fetch(`/api/local/parse?path=${encodeURIComponent(this.state.activeFilePath)}`);
        if (parseRes.ok) {
          const data = await parseRes.json();
          this.state.localFiles[this.state.activeFilePath] = { html: data.html, css: data.css };
          this.state.generatedCode = { html: data.html, css: data.css };
          this.visualEditor.loadCode(data.html, data.css);
          document.getElementById('code-html').textContent = data.html;
          document.getElementById('code-css').textContent = data.css;
          if (typeof Prism !== 'undefined') Prism.highlightAll();
          this._hasUnsavedChanges = false;
          this._setSaveStatus('saved');
          this.toast('檔案已還原到原始狀態！', 'success');
        }
      } else {
        const errData = await res.json();
        this.toast(`還原失敗: ${errData.error || '未知錯誤'}`, 'error');
      }
    } catch (err) {
      this.toast(`還原失敗: ${err.message}`, 'error');
    }
  }

  // ── All-Device Preview ──
  _showAllDevicePreview() {
    const overlay = document.getElementById('all-device-overlay');
    const grid = document.getElementById('all-device-grid');
    if (!overlay || !grid) return;

    grid.innerHTML = '';
    const srcdoc = this.visualEditor.getPreviewSrcdoc();

    // Define different screen states for each device
    // Generic states that work with any Figma design (公版 compatible)
    const screenStates = [
      { label: '完整預覽', stateJS: '' },
      { label: '互動狀態', stateJS: `
        document.querySelectorAll('[class*="popup"], [class*="modal"], [class*="overlay"]').forEach(el => {
          el.style.visibility = 'visible'; el.style.opacity = '1';
        });
      ` },
      { label: 'Hover 效果', stateJS: `
        document.querySelectorAll('button, [class*="btn"], a').forEach(el => {
          el.style.transform = 'scale(1.05)'; el.style.transition = 'transform 0.2s';
        });
      ` },
      { label: '原始狀態', stateJS: '' }
    ];

    const presetEntries = Object.entries(this.DEVICE_PRESETS);

    presetEntries.forEach(([key, preset], index) => {
      const card = document.createElement('div');
      card.className = 'all-device-card';

      const state = screenStates[index % screenStates.length];
      const aspectRatio = (preset.width / preset.height).toFixed(4);

      card.innerHTML = `
        <div class="all-device-card-header">
          <strong>${preset.name}</strong>
          <span style="color:var(--accent-secondary); margin:0 6px;">[ ${state.label} ]</span>
          <span>${preset.width}×${preset.height}</span>
        </div>
        <div class="all-device-card-body" style="width:100%; aspect-ratio:${aspectRatio};">
          <iframe sandbox="allow-same-origin allow-scripts"
            style="width:${preset.width}px; height:${preset.height}px; transform-origin:top left;"></iframe>
        </div>
      `;

      grid.appendChild(card);

      // Scale iframe to fit the card body after it's laid out
      requestAnimationFrame(() => {
        const body = card.querySelector('.all-device-card-body');
        const iframe = card.querySelector('iframe');
        if (body && iframe) {
          const bodyWidth = body.clientWidth;
          const scale = bodyWidth / preset.width;
          iframe.style.transform = `scale(${scale})`;

          // Inject the srcdoc with the state JS appended
          if (state.stateJS) {
            // Add state JS to the srcdoc after load
            const stateScript = `<script>window.addEventListener('load', function(){ ${state.stateJS} });<\/script>`;
            iframe.srcdoc = srcdoc.replace('</body>', stateScript + '</body>');
          } else {
            iframe.srcdoc = srcdoc;
          }
        }
      });
    });

    overlay.classList.remove('hidden');
    lucide.createIcons({ nodes: [overlay] });
  }

  // ── Keyboard Shortcuts ──
  _initShortcuts() {
    const modal = document.getElementById('shortcuts-modal');
    const shortcutsBtn = document.getElementById('btn-shortcuts');
    const closeBtn = document.getElementById('btn-close-shortcuts');
    const backdrop = document.getElementById('shortcuts-backdrop');

    if (shortcutsBtn) {
      shortcutsBtn.addEventListener('click', () => {
        modal?.classList.toggle('hidden');
        lucide.createIcons({ nodes: [modal] });
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', () => modal?.classList.add('hidden'));
    if (backdrop) backdrop.addEventListener('click', () => modal?.classList.add('hidden'));
  }

  _initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts when in editor view
      if (this.state.currentView !== 'view-editor') return;

      // Ctrl+S: Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this._saveToServer();
        return;
      }

      // Ctrl+Z: Undo
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.visualEditor.undo();
        this._updateUndoRedoButtons();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        this.visualEditor.redo();
        this._updateUndoRedoButtons();
        return;
      }

      // Ctrl+E: Toggle edit mode
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        document.getElementById('btn-toggle-edit')?.click();
        return;
      }

      // Ctrl+0: Reset zoom
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        document.getElementById('btn-zoom-reset')?.click();
        return;
      }

      // Ctrl+=: Zoom in
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        document.getElementById('btn-zoom-in')?.click();
        return;
      }

      // Ctrl+-: Zoom out
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        document.getElementById('btn-zoom-out')?.click();
        return;
      }
    });
  }

  // ── Image Error Panel ──
  _initImageErrorPanel() {
    const closeBtn = document.getElementById('btn-close-img-errors');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('img-error-panel')?.classList.add('hidden');
      });
    }
  }

  _checkImageErrors() {
    if (!this.visualEditor) return;
    setTimeout(() => {
      // Hide panel in browse mode (checked inside the timeout to avoid async race conditions)
      if (!this.visualEditor.editMode) {
        document.getElementById('img-error-panel')?.classList.add('hidden');
        return;
      }
      const errors = this.visualEditor.getImageErrors();
      const warnings = [];

      // Check for oversized images in the iframe (公版: no hardcoded filenames)
      try {
        const iframeDoc = this.visualEditor._getDoc();
        if (iframeDoc) {
          const allImgs = iframeDoc.querySelectorAll('img');
          allImgs.forEach(img => {
            if (img.src && !img.src.startsWith('data:') && img.naturalWidth > 0) {
              // Estimate image size by dimensions — flag potentially large images
              const pixels = img.naturalWidth * img.naturalHeight;
              if (pixels > 4000000) { // > ~2000x2000 (Figma exports at 2x scale, so raise threshold)
                const filename = img.src.split('/').pop().split('?')[0];
                warnings.push(`⚠️ ${filename} (${img.naturalWidth}×${img.naturalHeight}) — 可能過大，建議壓縮`);
              }
            }
          });
        }
      } catch (e) { /* cross-origin iframe */ }

      if (errors.length > 0 || warnings.length > 0) {
        const panel = document.getElementById('img-error-panel');
        const list = document.getElementById('img-error-list');
        if (panel && list) {
          const items = [];
          // De-duplicate errors by src
          const seenSrcs = new Set();
          errors.forEach(err => {
            const src = typeof err === 'string' ? err : err.src;
            if (seenSrcs.has(src)) return;
            seenSrcs.add(src);
            const shortSrc = src.split('/').slice(-2).join('/');
            const sizeInfo = (typeof err === 'object' && err.size) ? ` (${err.size})` : '';
            const typeLabel = (typeof err === 'object' && err.type === 'background') ? ' [背景圖]' : '';
            items.push(`<div class="img-error-item">❌ ${shortSrc}${sizeInfo}${typeLabel}</div>`);
          });
          // Only show size warnings alongside real load errors
          if (errors.length > 0 && warnings.length > 0) {
            const uniqueWarnings = [...new Set(warnings)];
            uniqueWarnings.forEach(w => {
              items.push(`<div class="img-error-item" style="color:var(--accent-warning, #d29922)">${w}</div>`);
            });
          }
          // Only display panel if there are actual items to show
          if (items.length > 0) {
            list.innerHTML = items.join('');
            panel.classList.remove('hidden');
            lucide.createIcons({ nodes: [panel] });
          }
        }
      }
    }, 2000);
  }

  /**
   * Populate the screen selector dropdown based on Figma tree structure.
   * Uses the top-level children of the root node as available screens.
   * Each top-level child becomes a selectable screen option.
   */
  _populateScreenSelector(tree) {
    const select = document.getElementById('select-editor-screen');
    if (!select) return;

    // Whitelist patterns for friendly labels
    const SCREEN_LABELS = [
      { pattern: '主畫面', label: '主畫面' },
      { pattern: '投注畫面1', label: '投注畫面 (分組賽)' },
      { pattern: '投注畫面2', label: '投注畫面 (淘汰賽)' },
    ];

    // Additional virtual screens (popups, not Figma top-level frames)
    const VIRTUAL_SCREENS = [
      { value: 'question', label: '📋 活動說明' },
      { value: 'record', label: '📊 查看結果' },
    ];

    const screens = [];

    if (tree && tree.children && tree.children.length > 0) {
      for (const child of tree.children) {
        if (!child.name || !child.visible) continue;

        // Match frames, groups, or components that look like screens
        const isFrameOrGroup = child.type === 'FRAME' || child.type === 'GROUP' || child.type === 'COMPONENT' || child.type === 'INSTANCE';

        // Check size if bounds exist
        const bounds = child.bounds || (child.originalNode && child.originalNode.absoluteBoundingBox);
        const isScreenSize = !bounds || (bounds.width > 200 && bounds.height > 200);

        if (isFrameOrGroup && isScreenSize) {
          // Store screen node ID mapping
          this.state.screenNodes[child.name] = child.id;

          // Check if we have a friendly label for this frame name
          let label = child.name;
          for (const item of SCREEN_LABELS) {
            if (child.name.includes(item.pattern)) {
              label = item.label;
              break;
            }
          }
          screens.push({ value: child.name, label: label });
        }
      }
    }

    // Fallback if no screens found
    if (screens.length === 0) {
      screens.push({ value: 'main', label: '主畫面' });
    }

    // Sort screens to prioritize "主畫面" (main screen) at the top
    screens.sort((a, b) => {
      const aMain = a.value.includes('主畫面') || a.value.toLowerCase().includes('main');
      const bMain = b.value.includes('主畫面') || b.value.toLowerCase().includes('main');
      if (aMain && !bMain) return -1;
      if (!aMain && bMain) return 1;
      return 0;
    });

    select.innerHTML = '';
    for (const screen of screens) {
      const option = document.createElement('option');
      option.value = screen.value;
      option.textContent = screen.label;
      select.appendChild(option);
    }

    // Add separator and virtual screens
    if (VIRTUAL_SCREENS.length > 0) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '── 彈窗畫面 ──';
      select.appendChild(separator);
      for (const vs of VIRTUAL_SCREENS) {
        const option = document.createElement('option');
        option.value = vs.value;
        option.textContent = vs.label;
        select.appendChild(option);
      }
    }

    // Listen for screen change
    select.onchange = () => {
      const selectedValue = select.value;
      this.visualEditor.setScreen(selectedValue);
    };
  }

  _loadEditorView(code, tree) {
    this.visualEditor.loadCode(code.html, code.css);

    document.getElementById('code-html').textContent = code.html;
    document.getElementById('code-css').textContent = code.css;
    document.getElementById('code-prompt').textContent = this.state.generatedPrompt;

    if (typeof Prism !== 'undefined') Prism.highlightAll();

    // Handle Right Panel File Selector
    const fileSelectorContainer = document.getElementById('editor-file-selector-container');
    const fileSelect = document.getElementById('editor-file-select');

    if (this.state.isLocalMode && this.state.localFiles && Object.keys(this.state.localFiles).length > 1) {
      fileSelectorContainer.classList.remove('hidden');
      fileSelect.innerHTML = '';
      
      const seenNames = new Set();
      for (const filePath of Object.keys(this.state.localFiles)) {
        const fileName = filePath.split('/').pop().split('\\').pop();
        if (seenNames.has(fileName.toLowerCase())) {
          continue;
        }
        seenNames.add(fileName.toLowerCase());

        const option = document.createElement('option');
        option.value = filePath;
        option.textContent = fileName;
        if (filePath === this.state.activeFilePath) {
          option.selected = true;
        }
        fileSelect.appendChild(option);
      }
    } else {
      fileSelectorContainer.classList.add('hidden');
    }
  }

  _buildDesignTree(node, container, depth = 0) {
    if (!node) return;
    container.innerHTML = '';
    this._appendDesignTreeNode(node, container, depth);
    lucide.createIcons({ nodes: [container] });
  }

  _appendDesignTreeNode(node, container, depth) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.style.paddingLeft = `${depth * 16}px`;

    const hasChildren = node.children?.length > 0;
    const typeIconMap = {
      FRAME: 'square', GROUP: 'group', TEXT: 'type', COMPONENT: 'component',
      INSTANCE: 'copy', RECTANGLE: 'square', ELLIPSE: 'circle', VECTOR: 'pen-tool',
    };
    const iconName = typeIconMap[node.type] || 'box';

    item.innerHTML = `
      <div class="tree-row design-tree-row" data-eid="${node.eid || ''}">
        ${hasChildren ? '<span class="tree-chevron expanded"><i data-lucide="chevron-right"></i></span>' : '<span class="tree-chevron-spacer"></span>'}
        <i data-lucide="${iconName}" class="tree-type-icon"></i>
        <span class="tree-name">${escapeHtml(node.name || '—')}</span>
      </div>
    `;

    const row = item.querySelector('.tree-row');
    row.addEventListener('click', () => {
      container.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      if (node.eid) {
        this.visualEditor.selectByEid(node.eid);
      } else if (node.className) {
        this.visualEditor.selectByClassName(node._resolvedClass || node.className);
      }

      // Navigate main preview: find the top-level Figma frame that contains this element
      // Use the iframe DOM to walk up and find the direct child of root
      const iframeDoc = this.visualEditor._getDoc();
      if (iframeDoc) {
        // Find the element in the iframe
        const figmaName = node.figmaName || node.name;
        let targetEl = null;
        if (node.eid) {
          targetEl = iframeDoc.querySelector(`[data-eid="${node.eid}"]`);
        }
        if (!targetEl && figmaName) {
          try {
            targetEl = iframeDoc.querySelector(`[data-figma-name="${CSS.escape(figmaName)}"]`);
          } catch(e) {}
        }

        if (targetEl) {
          // Walk up the iframe DOM to find the top-level frame
          // (direct child of the root [data-figma-name] element)
          const rootEl = iframeDoc.body.querySelector('[data-figma-name]');
          if (rootEl) {
            let topFrame = targetEl;
            let parent = targetEl.parentElement;
            while (parent && parent !== rootEl && parent !== iframeDoc.body) {
              topFrame = parent;
              parent = parent.parentElement;
            }

            // If we found a top-level child of root, switch to it
            if (parent === rootEl) {
              const topFrameName = topFrame.getAttribute('data-figma-name');
              if (topFrameName) {
                const select = document.getElementById('select-editor-screen');
                if (select) {
                  for (const opt of select.options) {
                    if (opt.value === topFrameName) {
                      select.value = opt.value;
                      this.visualEditor.setScreen(opt.value);
                      break;
                    }
                  }
                }
              }
            }
          }

          // Scroll the selected element into view
          setTimeout(() => {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }, 100);
        }
      }
    });

    container.appendChild(item);

    if (hasChildren) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';

      const chevron = item.querySelector('.tree-chevron');
      chevron?.addEventListener('click', (e) => {
        e.stopPropagation();
        chevron.classList.toggle('expanded');
        childContainer.classList.toggle('collapsed');
      });

      for (const child of node.children) {
        this._appendDesignTreeNode(child, childContainer, depth + 1);
      }

      container.appendChild(childContainer);
    }
  }

  _renderProperties(info) {
    const panel = document.getElementById('properties-panel');
    if (!info) {
      panel.innerHTML = '<div class="properties-placeholder"><i data-lucide="mouse-pointer-click"></i><p>選擇元素以檢視屬性</p></div>';
      lucide.createIcons({ nodes: [panel] });
      return;
    }

    const currentScope = info.element.getAttribute('data-style-scope') || 'class';
    this.visualEditor.activeScope = currentScope;

    let html = `
      <div class="prop-header">
        <span class="prop-tag">&lt;${info.tagName}&gt;</span>
        ${info.id ? `<span class="prop-id">#${info.id}</span>` : ''}
        <span class="prop-class">.${info.className || '—'}</span>
        ${info.eid ? `<span class="prop-eid" title="元素唯一 ID">${info.eid}</span>` : ''}
      </div>

      <div class="prop-section">
        <div class="prop-section-title">編輯設定 (自動同步 HTML/CSS)</div>
        <div class="prop-row">
          <label class="prop-label">編輯範圍</label>
          <div class="prop-value-wrapper">
            <select class="form-select" id="prop-edit-scope" style="width:100%; height:28px; font-size:12px; background-color: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; outline:none; cursor:pointer;">
              <option value="individual" ${currentScope === 'individual' ? 'selected' : ''}>僅限此物件 (Inline)</option>
              <option value="class" ${currentScope === 'class' ? 'selected' : ''}>同類別元件 (Class)</option>
            </select>
          </div>
        </div>
      </div>
    `;

    if (info.textContent) {
      html += `<div class="prop-section">
        <div class="prop-section-title">內容</div>
        <div class="prop-text-content">${escapeHtml(info.textContent)}</div>
      </div>`;
    }

    html += `<div class="prop-section"><div class="prop-section-title">CSS 屬性</div>`;

    const editableProps = ['position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'padding', 'margin', 'background-color', 'color', 'border-radius', 'font-size', 'font-weight', 'gap', 'opacity'];

    // Ensure core position/size fields always appear even with default values
    const coreFields = ['width', 'height', 'left', 'top'];
    const mergedProps = { ...info.properties };
    for (const field of coreFields) {
      if (!(field in mergedProps)) {
        mergedProps[field] = 'auto';
      }
    }

    for (const [prop, value] of Object.entries(mergedProps)) {
      const isEditable = editableProps.includes(prop);
      const isColor = prop.includes('color') || prop.includes('background');
      const colorMatch = value.match(/rgba?\([\d\s,.]+\)/);

      html += `<div class="prop-row">
        <label class="prop-label">${prop}</label>
        <div class="prop-value-wrapper">`;

      if (isColor && colorMatch) {
        const colorVal = colorMatch[0];
        html += `<input type="color" class="prop-color-input" data-prop="${prop}" value="${this._rgbaToHexInput(colorVal)}">`;
      }

      if (isEditable) {
        html += `<input type="text" class="prop-input" data-prop="${prop}" value="${value}">`;
      } else {
        html += `<span class="prop-value">${value}</span>`;
      }

      html += `</div></div>`;
    }

    html += `</div>`;

    panel.innerHTML = html;

    const scopeSelect = panel.querySelector('#prop-edit-scope');
    scopeSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      this.visualEditor.activeScope = val;
      info.element.setAttribute('data-style-scope', val);
      this.toast(`編輯範圍切換為: ${val === 'individual' ? '僅限此物件 (Inline → 同步 HTML)' : '同類別所有元件 (Class → 同步 CSS)'}`, 'info');
    });

    panel.querySelectorAll('.prop-input').forEach(input => {
      input.addEventListener('change', () => {
        const scope = scopeSelect.value;
        this.visualEditor.updateProperty(input.dataset.prop, input.value, scope);
      });
    });

    panel.querySelectorAll('.prop-color-input').forEach(input => {
      input.addEventListener('input', () => {
        const propInput = panel.querySelector(`.prop-input[data-prop="${input.dataset.prop}"]`);
        if (propInput) propInput.value = input.value;
        const scope = scopeSelect.value;
        this.visualEditor.updateProperty(input.dataset.prop, input.value, scope);
      });
    });
  }

  _rgbaToHexInput(rgba) {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#000000';
    const [, r, g, b] = match;
    return `#${[r, g, b].map(v => parseInt(v).toString(16).padStart(2, '0')).join('')}`;
  }

  // ─── Prompt View ───
  _initPromptView() {
    document.getElementById('btn-copy-prompt').addEventListener('click', async () => {
      if (this.state.generatedPrompt) {
        await copyToClipboard(this.state.generatedPrompt);
        const btn = document.getElementById('btn-copy-prompt');
        const origHTML = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check" class="btn-icon"></i> 已複製！';
        btn.classList.add('btn-success');
        lucide.createIcons({ nodes: [btn] });
        setTimeout(() => {
          btn.innerHTML = origHTML;
          btn.classList.remove('btn-success');
          lucide.createIcons({ nodes: [btn] });
        }, 2000);
      }
    });

    document.getElementById('btn-regenerate-prompt').addEventListener('click', () => {
      if (this.state.parsedTree) {
        const options = this._getPromptOptions();
        const prompt = this.promptBuilder.build(this.state.parsedTree, options);
        this.state.generatedPrompt = prompt;
        this._loadPromptView(prompt);
        this.toast('提示詞已重新生成', 'success');
      }
    });
  }

  _getPromptOptions() {
    return {
      framework: document.getElementById('select-framework')?.value || 'html-css',
      responsive: document.getElementById('select-responsive')?.value || 'mobile-first',
      naming: document.getElementById('select-naming')?.value || 'bem',
      units: document.getElementById('select-units')?.value || 'px',
      includeImages: document.getElementById('check-include-images')?.checked ?? true,
      includeColors: document.getElementById('check-include-colors')?.checked ?? true,
      includeTypography: document.getElementById('check-include-typography')?.checked ?? true,
    };
  }

  _loadPromptView(prompt) {
    const output = document.getElementById('prompt-output');
    output.textContent = prompt;
    if (typeof Prism !== 'undefined') Prism.highlightElement(output);
  }

  // ─── Figma Image/Position Helpers ───

  /**
   * Recursively walk the parsed tree and inject Figma-exported image URLs
   * into each node's styles so CodeGenerator can render them.
   */
  _applyImageUrls(node, imageUrls, _stats) {
    if (!node || !imageUrls) return;
    // Track stats on the first (root) call only
    const isRoot = !_stats;
    if (isRoot) {
      _stats = { total: 0, hasImage: 0, matched: 0, missingUrl: [] };
    }
    try {
      _stats.total++;
      
      const hasExportedImage = node.id && imageUrls[node.id] && !isRoot;

      if (node.hasImage || hasExportedImage) {
        _stats.hasImage++;
        if (node.id && imageUrls[node.id]) {
          _stats.matched++;
          const proxyUrl = this.figmaApi.getImageProxyUrl(imageUrls[node.id]);
          if (proxyUrl) {
            node.styles = node.styles || {};
            
            // Clean up styles to ensure transparent PNG backgrounds show correctly and avoid overlapping borders/backgrounds
            delete node.styles.border;
            delete node.styles.outline;
            delete node.styles['background-color'];
            delete node.styles['background'];
            if (node.styles['background-image'] && !node.styles['background-image'].includes('url(')) {
              delete node.styles['background-image'];
            }
            
            node.styles['background-image'] = `url('${proxyUrl}')`;
            node.styles['background-size'] = node.styles['background-size'] || 'cover';
            node.styles['background-position'] = node.styles['background-position'] || 'center';
            node.styles['background-repeat'] = 'no-repeat';
            
            // Also set imageUrl for <img> tag rendering
            node.imageUrl = proxyUrl;
            node.hasImage = true;

            // If it's a child node and has been exported as an image asset slice,
            // we override its HTML tag to 'img' and clear its children to prevent rendering duplicate/broken HTML children.
            // We only do this for elements at depth > 1 to avoid flattening top-level screen container frames.
            if (node.depth > 1) {
              const nameLower = (node.name || '').toLowerCase();
              const hasExportSettings = node.originalNode && Array.isArray(node.originalNode.exportSettings) && node.originalNode.exportSettings.length > 0;
              
              // Helper to check if a node contains nested interactive elements (like inputs, buttons, links, or text nodes)
              const hasNestedInteractive = (n) => {
                if (!n) return false;
                const tag = n.htmlTag || '';
                const nameLower = (n.name || '').toLowerCase();
                if (tag === 'input' || tag === 'a' || tag === 'button' || n.type === 'TEXT' || tag === 'p') return true;
                if (nameLower.includes('btn') || nameLower.includes('button')) return true;
                if (n.children && n.children.length > 0) {
                  return n.children.some(child => hasNestedInteractive(child));
                }
                return false;
              };
              
              const isGraphic = this.nodeParser.isGraphicOnly(node.originalNode);
              const shouldBeImageTag = (hasExportSettings && !hasNestedInteractive(node)) || 
                                       isGraphic ||
                                       ((nameLower.includes('img') || 
                                         nameLower.includes('image') || 
                                         nameLower.includes('icon') || 
                                         nameLower.includes('logo') || 
                                         nameLower.includes('avatar')) && !hasNestedInteractive(node)) ||
                                       !node.children?.length;
              
              if (shouldBeImageTag) {
                node.htmlTag = 'img';
                node.children = []; // Clear children to prevent duplicate rendering
              }
            }
          }
        } else {
          _stats.missingUrl.push(node.id || '(no id)');
        }
      }
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          this._applyImageUrls(child, imageUrls, _stats);
        }
      }
    } catch (err) {
      console.warn('[_applyImageUrls] Error processing node:', node?.id, err.message);
    }
    // Print summary on root exit
    if (isRoot) {
      console.log(`[_applyImageUrls] Summary: ${_stats.total} nodes total, ${_stats.hasImage} with hasImage, ${_stats.matched} matched URLs`);
      if (_stats.missingUrl.length > 0) {
        console.warn(`[_applyImageUrls] Nodes with hasImage but NO URL: ${_stats.missingUrl.join(', ')}`);
      }
      console.log(`[_applyImageUrls] Available image IDs: ${Object.keys(imageUrls).slice(0, 10).join(', ')}`);
    }
  }


  /**
   * Calculate the bounding box that encompasses all children on a page.
   * Used when creating a virtual container for page-scope auto-convert.
   */
  _calculatePageBounds(children) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const child of children) {
      const box = child.absoluteBoundingBox;
      if (!box) continue;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    if (minX === Infinity) return { x: 0, y: 0, width: 1400, height: 800 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Convert Figma's absolute coordinates into parent-relative positions.
   * The root node becomes position:relative, children become position:absolute.
   */
  _applyAbsolutePositions(node, parentBounds, isRoot = true) {
    if (!node) return;
    try {
      node.styles = node.styles || {};

      const isFlexContainer = node.styles.display === 'flex';

      if (isRoot && node.bounds) {
        // Root frame: use relative positioning, set explicit size
        node.styles.position = 'relative';
        node.styles.width = `${Math.round(node.bounds.width)}px`;
        node.styles.height = `${Math.round(node.bounds.height)}px`;
        // Don't clip content — allow elements extending beyond frame to be visible
        node.styles.overflow = 'visible';
      } else if (!isRoot && node.bounds && node.children && node.children.length > 0 && !isFlexContainer) {
        // Non-root containers with children: must be a positioning context
        // so that their absolutely-positioned children reference them correctly
        if (!node.styles.position || node.styles.position === 'static') {
          node.styles.position = node.styles.position === 'absolute' ? 'absolute' : 'relative';
        }
      }

      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (child.bounds && node.bounds) {
            child.styles = child.styles || {};
            // Only apply absolute positioning if the parent doesn't use auto-layout (flex)
            if (!isFlexContainer) {
              child.styles.position = 'absolute';
              child.styles.left = `${Math.round(child.bounds.x - node.bounds.x)}px`;
              child.styles.top = `${Math.round(child.bounds.y - node.bounds.y)}px`;
              // Preserve Figma layer order: later children render on top
              child.styles['z-index'] = String(i + 1);
            }
          }
          this._applyAbsolutePositions(child, node.bounds, false);
        }
      }
    } catch (err) {
      console.warn('[_applyAbsolutePositions] Error:', node?.id, err.message);
    }
  }

  // ── Figma overlay comparison helper methods ──
  _updateFigmaOverlay(screenValue) {
    const overlay = document.getElementById('figma-overlay');
    if (!overlay || overlay.style.display === 'none') return;

    const imageUrl = this._getFigmaOverlayUrl(screenValue);
    if (imageUrl) {
      overlay.style.backgroundImage = `url('${imageUrl}')`;
    } else {
      overlay.style.backgroundImage = 'none';
      const nodeId = this._getScreenNodeId(screenValue);
      if (nodeId && this.state.fileKey) {
        this.figmaApi.getImages(this.state.fileKey, nodeId, 'png', 2)
          .then(data => {
            const url = data.images?.[nodeId];
            if (url) {
              const proxyUrl = this.figmaApi.getImageProxyUrl(url);
              if (!this.state.screenImages) this.state.screenImages = {};
              this.state.screenImages[screenValue] = proxyUrl;
              
              const select = document.getElementById('select-editor-screen');
              if (select && select.value === screenValue) {
                overlay.style.backgroundImage = `url('${proxyUrl}')`;
              }
            }
          })
          .catch(err => console.warn('[App] Failed to load screen overlay image:', err));
      }
    }
  }

  _getScreenNodeId(screenValue) {
    if (!this.state.screenNodes) return null;
    if (this.state.screenNodes[screenValue]) return this.state.screenNodes[screenValue];
    
    let matchedName = null;
    if (screenValue === 'main' || screenValue.includes('main')) {
      matchedName = Object.keys(this.state.screenNodes).find(k => k.includes('主畫面') || k.toLowerCase().includes('main'));
    } else if (screenValue === 'betpage-3' || screenValue === 'bet1') {
      matchedName = Object.keys(this.state.screenNodes).find(k => k.includes('投注畫面1') || k.includes('bet1'));
    } else if (screenValue === 'betpage-2' || screenValue === 'bet2') {
      matchedName = Object.keys(this.state.screenNodes).find(k => k.includes('投注畫面2') || k.includes('bet2'));
    }
    return matchedName ? this.state.screenNodes[matchedName] : null;
  }

  _getFigmaOverlayUrl(screenValue) {
    if (!this.state.screenImages) return null;
    if (this.state.screenImages[screenValue]) return this.state.screenImages[screenValue];
    
    let matchedName = null;
    if (screenValue === 'main' || screenValue.includes('main')) {
      matchedName = Object.keys(this.state.screenImages).find(k => k.includes('主畫面') || k.toLowerCase().includes('main'));
    } else if (screenValue === 'betpage-3' || screenValue === 'bet1') {
      matchedName = Object.keys(this.state.screenImages).find(k => k.includes('投注畫面1') || k.includes('bet1'));
    } else if (screenValue === 'betpage-2' || screenValue === 'bet2') {
      matchedName = Object.keys(this.state.screenImages).find(k => k.includes('投注畫面2') || k.includes('bet2'));
    }
    return matchedName ? this.state.screenImages[matchedName] : null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new App();
  } catch (err) {
    console.error('[App Init Error]', err);
    document.body.innerHTML = `<div style="padding:40px;text-align:center;color:#ff6b6b;font-family:sans-serif;">
      <h2>初始化錯誤</h2><p>${err.message}</p>
      <button onclick="location.reload()" style="margin-top:16px;padding:8px 24px;cursor:pointer;">重新載入</button>
    </div>`;
  }
});
