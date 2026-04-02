// studio.js — studio canvas: zoom, pan, module placement
export function initStudio() {
  const wrap = document.getElementById('studio-wrap');
  const canvas = document.getElementById('studio-canvas');
  if (!wrap || !canvas) return;

  const STUDIO_LAYOUT_KEY = 'confusynth-studio-layout-v3';
  const STUDIO_VIEW_KEY = 'confusynth-studio-view-v3';
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 2.25;
  const FIT_PADDING = 40;
  const DEFAULT_MODULE_W = 860;
  const DEFAULT_MODULE_H = 860;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let hasRestoredView = false;
  let hasRestoredLayout = false;
  let _userHasPanned = false;
  let _autoZoom = true; // when true, viewport auto-fits on resize and new module spawn
  let _selectedModule = null;
  let _restoredSelectedModuleId = null;

  function getWrapSize() {
    return {
      width: wrap.clientWidth || window.innerWidth,
      height: wrap.clientHeight || window.innerHeight,
    };
  }

  function parsePx(value) {
    return Number.parseFloat(value || '0') || 0;
  }

  function isModuleInteractiveTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest([
      'button',
      'input',
      'select',
      'textarea',
      'canvas',
      'a',
      '.port',
      '.djm-port',
      '.chassis-dup-btn',
      '.knob',
      '.macro-knob',
      '.step-btn',
      '.tab',
      '.screen-btn',
      '.t-btn',
      '.bpm-arrow',
      '.macro-name',
      '.macro-name-input',
      '.kbd-btn',
      '.page-content',
      '.right-col',
      '.channel-strip',
      '.kbd-panel',
      '.module-picker',
    ].join(',')));
  }

  function isTextEntryTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, option, [contenteditable="true"]'));
  }

  function shouldStudioCaptureGesture(target) {
    if (!(target instanceof Element)) return true;
    if (isTextEntryTarget(target)) return false;
    if (target.closest('.module-picker')) return false;
    if (target.closest('.screen-bezel, .chassis, .studio-module, .module-tools, .module-drag-handle, #studio-cables')) {
      return !isModuleInteractiveTarget(target);
    }
    if (target === wrap || target === canvas) return true;
    return !isModuleInteractiveTarget(target);
  }

  function getModuleSize(mod) {
    const rect = mod.getBoundingClientRect();
    return {
      width: rect.width / Math.max(scale, 0.0001) || DEFAULT_MODULE_W,
      height: rect.height / Math.max(scale, 0.0001) || DEFAULT_MODULE_H,
    };
  }

  function getModuleBounds() {
    const modules = [...canvas.querySelectorAll('.studio-module')];
    if (modules.length === 0) {
      return { left: 0, top: 0, right: DEFAULT_MODULE_W, bottom: DEFAULT_MODULE_H, width: DEFAULT_MODULE_W, height: DEFAULT_MODULE_H };
    }

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    modules.forEach((mod) => {
      const modLeft = parsePx(mod.style.left);
      const modTop = parsePx(mod.style.top);
      const { width, height } = getModuleSize(mod);
      left = Math.min(left, modLeft);
      top = Math.min(top, modTop);
      right = Math.max(right, modLeft + width);
      bottom = Math.max(bottom, modTop + height);
    });

    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  let _saveViewTimer = null;
  function saveView() {
    clearTimeout(_saveViewTimer);
    _saveViewTimer = setTimeout(() => {
      try {
        localStorage.setItem(STUDIO_VIEW_KEY, JSON.stringify({ scale, panX, panY, autoZoom: _autoZoom }));
      } catch (_) {}
    }, 200);
  }

  function saveLayout() {
    const layout = [...canvas.querySelectorAll('.studio-module')].map((mod, index) => ({
      id: mod.id || `module-${index}`,
      type: mod.dataset.moduleType || 'synth',
      left: mod.style.left || '0px',
      top: mod.style.top || '0px',
      selected: mod === _selectedModule,
    }));
    try {
      localStorage.setItem(STUDIO_LAYOUT_KEY, JSON.stringify(layout));
    } catch (_) {}
  }

  function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    const indicator = document.getElementById('zoom-level');
    if (indicator) indicator.textContent = `${Math.round(scale * 100)}%`;
    saveView();
  }

  function fitToWindow({ force = false } = {}) {
    const { width: wrapW, height: wrapH } = getWrapSize();
    const bounds = getModuleBounds();
    const fitW = Math.max(120, wrapW - FIT_PADDING * 2);
    const fitH = Math.max(120, wrapH - FIT_PADDING * 2);
    const fitScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min(fitW / Math.max(bounds.width, 1), fitH / Math.max(bounds.height, 1)))
    );

    if (force || !hasRestoredView) {
      scale = fitScale;
      panX = (wrapW - bounds.width * scale) / 2 - bounds.left * scale;
      panY = (wrapH - bounds.height * scale) / 2 - bounds.top * scale;
      hasRestoredView = true;
      if (force) _userHasPanned = false;
      applyTransform();
    }
  }

  function restoreView() {
    try {
      const raw = localStorage.getItem(STUDIO_VIEW_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return false;
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(saved.scale) || 1));
      panX = Number(saved.panX) || 0;
      panY = Number(saved.panY) || 0;
      if (saved.autoZoom !== undefined) _autoZoom = saved.autoZoom;
      hasRestoredView = true;
      applyTransform();
      const autoZoomBtn = document.getElementById('auto-zoom');
      if (autoZoomBtn) {
        autoZoomBtn.textContent = _autoZoom ? '⊡ Auto' : '⊟ Manual';
        autoZoomBtn.title = _autoZoom
          ? 'Auto-fit is ON — viewport fits on resize (click to disable)'
          : 'Auto-fit is OFF — manual zoom only (click to enable)';
        autoZoomBtn.style.color = _autoZoom ? '' : 'rgba(255,255,255,0.35)';
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreLayout() {
    try {
      const raw = localStorage.getItem(STUDIO_LAYOUT_KEY);
      if (!raw) return false;
      const layout = JSON.parse(raw);
      if (!Array.isArray(layout)) return false;
      layout.forEach((item) => {
        const mod = canvas.querySelector(`#${item.id}`);
        if (!mod) return;
        mod.style.left = item.left || '0px';
        mod.style.top = item.top || '0px';
        if (item.type) mod.dataset.moduleType = item.type;
        if (item.selected) _restoredSelectedModuleId = item.id;
      });
      hasRestoredLayout = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function clampViewport() {
    const { width: wrapW, height: wrapH } = getWrapSize();
    const bounds = getModuleBounds();
    const scaledWidth = bounds.width * scale;
    const scaledHeight = bounds.height * scale;
    const minX = wrapW - scaledWidth - FIT_PADDING;
    const maxX = FIT_PADDING - bounds.left * scale;
    const minY = wrapH - scaledHeight - FIT_PADDING;
    const maxY = FIT_PADDING - bounds.top * scale;

    if (scaledWidth + FIT_PADDING * 2 <= wrapW) {
      if (!_userHasPanned && _autoZoom) {
        panX = (wrapW - scaledWidth) / 2 - bounds.left * scale;
      } else {
        panX = Math.min(maxX, Math.max(minX, panX));
      }
    } else {
      panX = Math.min(maxX, Math.max(minX, panX));
    }

    if (scaledHeight + FIT_PADDING * 2 <= wrapH) {
      if (!_userHasPanned && _autoZoom) {
        panY = (wrapH - scaledHeight) / 2 - bounds.top * scale;
      } else {
        panY = Math.min(maxY, Math.max(minY, panY));
      }
    } else {
      panY = Math.min(maxY, Math.max(minY, panY));
    }

    applyTransform();
  }

  function worldPointFromScreen(clientX, clientY) {
    const rect = wrap.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / scale,
      y: (clientY - rect.top - panY) / scale,
    };
  }

  function zoomBy(factor, cx, cy) {
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    if (newScale === scale) return;
    const ratio = newScale / scale;
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    scale = newScale;
    clampViewport();
  }

  function getSpawnPosition(anchorEl = null) {
    const modules = [...canvas.querySelectorAll('.studio-module')];
    if (!modules.length) return { x: 40, y: 40 };

    const anchor = anchorEl && anchorEl.isConnected
      ? anchorEl
      : getSelectedModule()
        || canvas.querySelector('#module-0')
        || modules[0];
    const gap = 56;
    const viewportCenter = worldPointFromScreen(getWrapSize().width / 2, getWrapSize().height / 2);

    function getRect(mod) {
      return {
        left: parsePx(mod.style.left),
        top: parsePx(mod.style.top),
        width: getModuleSize(mod).width,
        height: getModuleSize(mod).height,
      };
    }

    function isClear(x, y, width, height, ignoreEl = null) {
      const margin = 40;
      return modules.every((mod) => {
        if (mod === ignoreEl) return true;
        const rect = getRect(mod);
        const overlaps = !(
          x + width + margin <= rect.left ||
          x >= rect.left + rect.width + margin ||
          y + height + margin <= rect.top ||
          y >= rect.top + rect.height + margin
        );
        return !overlaps;
      });
    }

    const anchorRect = getRect(anchor);
    const candidates = [
      { x: anchorRect.left + anchorRect.width + gap, y: anchorRect.top },
      { x: anchorRect.left, y: anchorRect.top + anchorRect.height + gap },
      { x: anchorRect.left - DEFAULT_MODULE_W - gap, y: anchorRect.top },
      { x: anchorRect.left, y: anchorRect.top - DEFAULT_MODULE_H - gap },
      { x: anchorRect.left + anchorRect.width + gap, y: anchorRect.top + anchorRect.height + gap },
      { x: viewportCenter.x - DEFAULT_MODULE_W / 2, y: viewportCenter.y - DEFAULT_MODULE_H / 2 },
      { x: viewportCenter.x + gap, y: viewportCenter.y + gap },
    ];

    for (const candidate of candidates) {
      const x = Math.max(20, Math.round(candidate.x));
      const y = Math.max(20, Math.round(candidate.y));
      if (isClear(x, y, DEFAULT_MODULE_W, DEFAULT_MODULE_H, anchor)) {
        return { x, y };
      }
    }

    const baseX = Math.max(20, Math.round(viewportCenter.x - DEFAULT_MODULE_W / 2));
    const baseY = Math.max(20, Math.round(viewportCenter.y - DEFAULT_MODULE_H / 2));
    for (let ring = 1; ring <= 6; ring += 1) {
      const offset = ring * (DEFAULT_MODULE_W * 0.25 + gap);
      const ringCandidates = [
        { x: baseX + offset, y: baseY },
        { x: baseX, y: baseY + offset },
        { x: baseX - offset, y: baseY },
        { x: baseX, y: baseY - offset },
        { x: baseX + offset, y: baseY + offset },
        { x: baseX - offset, y: baseY + offset },
      ];
      for (const candidate of ringCandidates) {
        const x = Math.max(20, Math.round(candidate.x));
        const y = Math.max(20, Math.round(candidate.y));
        if (isClear(x, y, DEFAULT_MODULE_W, DEFAULT_MODULE_H, anchor)) {
          return { x, y };
        }
      }
    }

    return { x: baseX, y: baseY };
  }

  function getSelectedModule() {
    return _selectedModule && _selectedModule.isConnected ? _selectedModule : null;
  }

  function getModuleLabel(modEl) {
    if (!modEl) return 'No module selected';
    const type = (modEl.dataset.moduleType || 'module').replace(/_/g, ' ');
    if (modEl.id === 'module-0') return 'CONFUsynth (primary)';
    return `${type} (${modEl.id})`;
  }

  function updateSelectionUi() {
    const label = document.getElementById('module-selection');
    const removeBtn = document.getElementById('remove-module');
    const selected = getSelectedModule();
    if (label) label.textContent = selected ? getModuleLabel(selected) : 'No module selected';
    if (removeBtn) {
      const removable = Boolean(selected && selected.id !== 'module-0');
      removeBtn.disabled = !removable;
      removeBtn.title = removable ? `Remove ${getModuleLabel(selected)}` : 'Primary module cannot be removed';
    }
  }

  function selectModule(modEl, { focus = true } = {}) {
    _selectedModule = modEl && modEl.isConnected ? modEl : null;
    canvas.querySelectorAll('.studio-module').forEach((mod) => {
      mod.classList.toggle('module-selected', mod === _selectedModule);
    });
    updateSelectionUi();
    saveLayout();
    if (focus && _selectedModule && typeof _selectedModule.scrollIntoView === 'function') {
      _selectedModule.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function removeModule(modEl, { force = false } = {}) {
    if (!modEl || (!force && modEl.id === 'module-0')) return false;
    const wasSelected = modEl === _selectedModule;
    const fallback = wasSelected
      ? [...canvas.querySelectorAll('.studio-module')].find((module) => module !== modEl && module.id !== 'module-0')
        || canvas.querySelector('#module-0')
        || null
      : _selectedModule;

    document.dispatchEvent(new CustomEvent('module:removed', { detail: { moduleEl: modEl, moduleId: modEl.id } }));
    modEl.remove();

    if (wasSelected) {
      selectModule(fallback, { focus: false });
    } else {
      updateSelectionUi();
      saveLayout();
    }

    if (_autoZoom) {
      _userHasPanned = false;
      fitToWindow({ force: true });
    } else {
      clampViewport();
    }
    return true;
  }

  function attachModuleChrome(modEl) {
    if (!modEl || modEl.querySelector(':scope > .module-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'module-tools';
    tools.innerHTML = `
      <span class="module-badge">${(modEl.dataset.moduleType || 'module').replace(/_/g, ' ')}</span>
      <button class="module-remove-btn" type="button" title="Remove module">×</button>
    `;
    const removeBtn = tools.querySelector('.module-remove-btn');
    if (modEl.id === 'module-0') {
      removeBtn.disabled = true;
      removeBtn.title = 'Primary module cannot be removed';
    } else {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModule(modEl);
      });
    }
    modEl.prepend(tools);
    modEl.addEventListener('pointerdown', () => selectModule(modEl, { focus: false }));
  }

  function enableModuleDrag(modEl) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let dragPointerId = null;

    function canStartDrag(target) {
      if (!(target instanceof Element)) return false;
      if (isModuleInteractiveTarget(target)) return false;
      return Boolean(target.closest('.studio-module'));
    }

    modEl.addEventListener('pointerdown', (e) => {
      if (!canStartDrag(e.target)) return;
      selectModule(modEl, { focus: false });
      dragging = true;
      dragPointerId = e.pointerId;
      modEl.classList.add('module-dragging');
      modEl.setPointerCapture(e.pointerId);
      _userHasPanned = true;

      const pointerWorld = worldPointFromScreen(e.clientX, e.clientY);
      offsetX = pointerWorld.x - parsePx(modEl.style.left);
      offsetY = pointerWorld.y - parsePx(modEl.style.top);

      e.preventDefault();
    });

    modEl.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== dragPointerId) return;
      const pointerWorld = worldPointFromScreen(e.clientX, e.clientY);
      const newLeft = pointerWorld.x - offsetX;
      const newTop = pointerWorld.y - offsetY;
      modEl.style.left = `${newLeft}px`;
      modEl.style.top = `${newTop}px`;
    });

    function stopDrag(pointerId) {
      if (!dragging || (pointerId != null && pointerId !== dragPointerId)) return;
      dragging = false;
      dragPointerId = null;
      modEl.classList.remove('module-dragging');
      saveLayout();
      clampViewport();
    }

    modEl.addEventListener('pointerup', (e) => stopDrag(e.pointerId));
    modEl.addEventListener('pointercancel', (e) => stopDrag(e.pointerId));
  }

  function closeModulePicker() {
    document.getElementById('module-picker')?.remove();
  }

  function showModulePicker() {
    const existing = document.getElementById('module-picker');
    if (existing) {
      existing.remove();
      return;
    }
    const picker = document.createElement('div');
    picker.id = 'module-picker';
    picker.className = 'module-picker';
    picker.innerHTML = `
      <div class="mp-title">Add Module</div>
      <div class="mp-hint">Drop another synth into view, add a DJ mixer, or place lightweight figures while testing zoom, pan, and cables.</div>
      <div class="mp-section-label">INSTRUMENTS</div>
      <div class="mp-grid">
        <button data-module="synth">CONFUsynth</button>
        <button data-module="tb303">TB-303</button>
        <button data-module="juno60">Juno-60</button>
        <button data-module="tr909">TR-909</button>
        <button data-module="fm_synth">FM Synth</button>
        <button data-module="moog">Moog D</button>
      </div>
      <div class="mp-section-label">MIXING</div>
      <div class="mp-grid">
        <button data-module="djmixer">DJ Mixer</button>
      </div>
      <div class="mp-section-label">UTILITIES</div>
      <div class="mp-grid">
        <button data-module="figure-cat">Cat Figure</button>
        <button data-module="figure-robot">Robot Figure</button>
        <button data-module="figure-cactus">Cactus Figure</button>
      </div>
    `;
    picker.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target.closest('button[data-module]');
      const type = target?.dataset.module;
      if (!type) return;
      addModule(type);
      closeModulePicker();
    });
    document.getElementById('studio-controls')?.prepend(picker);
  }

  function addModule(type) {
    const mod = document.createElement('div');
    mod.className = 'studio-module';
    mod.dataset.moduleType = type;
    mod.id = `module-${Date.now()}`;
    mod.style.position = 'absolute';
    const pos = getSpawnPosition();
    mod.style.left = `${pos.x}px`;
    mod.style.top = `${pos.y}px`;
    enableModuleDrag(mod);
    attachModuleChrome(mod);

    if (type === 'synth') {
      const original = document.querySelector('#module-0 .chassis');
      if (original) {
        const clone = original.cloneNode(true);
        clone.querySelectorAll('[id]').forEach((el) => {
          el.id = `${el.id}-clone-${Date.now()}`;
        });
        mod.appendChild(clone);
      } else {
        mod.innerHTML = '<div class="module-loading-shell">CONFUsynth</div>';
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      }
    } else if (type === 'djmixer') {
      mod.innerHTML = '<div class="module-loading-shell">Loading Mixer</div>';
      import('./modules/djmixer.js').then((m) => {
        const ctx = window._confusynthEngine?.context ?? null;
        mod.innerHTML = '';
        mod.appendChild(m.createDJMixer(ctx));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type === 'tb303') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:680px;height:340px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading TB-303…</div>';
      import('./modules/tb303.js').then((m) => {
        const ctx = window._confusynthEngine?.context ?? null;
        mod.innerHTML = '';
        mod.appendChild(m.createTB303(ctx));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type === 'juno60') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:860px;height:240px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Juno-60…</div>';
      import('./modules/juno60.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createJuno60(window._confusynthEngine?.context ?? null));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type === 'tr909') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:920px;height:320px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading TR-909…</div>';
      import('./modules/tr909.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createTr909(window._confusynthEngine?.context ?? null));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type === 'fm_synth') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:980px;height:280px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading FM Synth…</div>';
      import('./modules/fm_synth.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createFMSynth(window._confusynthEngine?.context ?? null));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type === 'moog') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:1000px;height:300px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Moog D…</div>';
      import('./modules/moog.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createMoog(window._confusynthEngine?.context ?? null));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type.startsWith('figure-')) {
      const emoji = {
        'figure-cat': '🐱',
        'figure-robot': '🤖',
        'figure-cactus': '🌵',
      }[type] || '🎵';
      mod.innerHTML = `<div class="studio-figure">${emoji}</div>`;
      attachModuleChrome(mod);
      if (mod === getSelectedModule()) updateSelectionUi();
    }

    canvas.appendChild(mod);
    selectModule(mod, { focus: false });
    if (_autoZoom) {
      _userHasPanned = false;
      fitToWindow({ force: true });
    } else {
      clampViewport();
    }
    saveLayout();
  }

  function _spawnDefaultMixer() {
    const existingModule = canvas.querySelector('#module-0');
    const modRight = existingModule ? (parsePx(existingModule.style.left) + DEFAULT_MODULE_W + 80) : 100;
    const modTop = existingModule ? parsePx(existingModule.style.top) : 50;

    const mod = document.createElement('div');
    mod.className = 'studio-module';
    mod.dataset.moduleType = 'djmixer';
    mod.id = 'module-djm-default';
    mod.style.left = `${modRight}px`;
    mod.style.top = `${modTop}px`;
    mod.style.position = 'absolute';
    mod.innerHTML = '<div class="module-loading-shell" style="width:320px;height:420px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Mixer…</div>';
    canvas.appendChild(mod);
    enableModuleDrag(mod);
    attachModuleChrome(mod);
    saveLayout();

    import('./modules/djmixer.js').then((m) => {
      const ctx = window._confusynthEngine?.context ?? null;
      mod.innerHTML = '';
      mod.appendChild(m.createDJMixer(ctx));
      attachModuleChrome(mod);
      requestAnimationFrame(() => {
        const audioOutPort = document.querySelector('#module-0 .port[data-port="audio-out"]');
        const ch1Port = mod.querySelector('.djm-port[data-port="ch1-in"]');
        if (audioOutPort && ch1Port) {
          document.dispatchEvent(new CustomEvent('cable:autoconnect', {
            detail: { fromEl: audioOutPort, toEl: ch1Port }
          }));
        }
      });
    });
  }

  // Attach drag to the pre-existing module-0 (main synth)
  const module0 = canvas.querySelector('#module-0');
  if (module0) {
    if (!module0.style.left) module0.style.left = '40px';
    if (!module0.style.top)  module0.style.top  = '40px';
    module0.style.position = 'absolute';
    enableModuleDrag(module0);
    attachModuleChrome(module0);
  }

  const hasLayout = restoreLayout();
  const hasView = restoreView();
  const initialSelection = (_restoredSelectedModuleId && canvas.querySelector(`#${_restoredSelectedModuleId}`))
    || canvas.querySelector('#module-0')
    || canvas.querySelector('.studio-module');
  if (initialSelection) selectModule(initialSelection, { focus: false });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fitToWindow({ force: true });
    if (!hasLayout) {
      _spawnDefaultMixer();
    }
  }));

  document.getElementById('zoom-in')?.addEventListener('click', () => {
    _userHasPanned = true;
    const { width, height } = getWrapSize();
    zoomBy(1.2, width / 2, height / 2);
  });
  document.getElementById('zoom-out')?.addEventListener('click', () => {
    _userHasPanned = true;
    const { width, height } = getWrapSize();
    zoomBy(1 / 1.2, width / 2, height / 2);
  });
  document.getElementById('zoom-reset')?.addEventListener('click', () => {
    hasRestoredView = false;
    fitToWindow({ force: true });
  });
  document.getElementById('fit-all')?.addEventListener('click', () => {
    _userHasPanned = false;
    fitToWindow({ force: true });
  });
  const autoZoomBtn = document.getElementById('auto-zoom');
  autoZoomBtn?.addEventListener('click', () => {
    _autoZoom = !_autoZoom;
    autoZoomBtn.textContent = _autoZoom ? '⊡ Auto' : '⊟ Manual';
    autoZoomBtn.title = _autoZoom
      ? 'Auto-fit is ON — viewport fits on resize (click to disable)'
      : 'Auto-fit is OFF — manual zoom only (click to enable)';
    autoZoomBtn.style.color = _autoZoom ? '' : 'rgba(255,255,255,0.35)';
    if (_autoZoom) {
      _userHasPanned = false;
      fitToWindow({ force: true });
    }
  });
  document.getElementById('add-module')?.addEventListener('click', showModulePicker);
  document.getElementById('remove-module')?.addEventListener('click', () => {
    const selected = getSelectedModule();
    if (selected && selected.id !== 'module-0') {
      removeModule(selected);
    }
  });

  canvas.addEventListener('click', (e) => {
    const clickedModule = e.target.closest('.studio-module');
    if (clickedModule) {
      selectModule(clickedModule, { focus: false });
    }
    if (e.target.closest('.chassis-dup-btn')) {
      e.preventDefault();
      addModule('synth');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#studio-controls')) closeModulePicker();
    if (!e.target.closest('.studio-module') && !e.target.closest('#studio-controls')) {
      selectModule(null, { focus: false });
    }
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && getSelectedModule() && getSelectedModule().id !== 'module-0') {
      e.preventDefault();
      removeModule(getSelectedModule());
    }
  });

  function getScrollableAncestor(startNode, deltaY, deltaX = 0) {
    if (!(startNode instanceof Element)) return null;
    let node = startNode;
    const verticalDirection = Math.sign(deltaY);
    const horizontalDirection = Math.sign(deltaX);

    while (node && node !== wrap) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const canScrollY = /(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight;
      const canScrollX = /(auto|scroll|overlay)/.test(overflowX) && node.scrollWidth > node.clientWidth;

      if (canScrollY) {
        const maxScrollTop = node.scrollHeight - node.clientHeight;
        if ((verticalDirection < 0 && node.scrollTop > 0) || (verticalDirection > 0 && node.scrollTop < maxScrollTop)) {
          return node;
        }
      }

      if (canScrollX) {
        const maxScrollLeft = node.scrollWidth - node.clientWidth;
        if ((horizontalDirection < 0 && node.scrollLeft > 0) || (horizontalDirection > 0 && node.scrollLeft < maxScrollLeft)) {
          return node;
        }
      }

      node = node.parentElement;
    }

    return null;
  }

  wrap.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // ctrl+scroll or meta+scroll → zoom
      const rect = wrap.getBoundingClientRect();
      zoomBy(e.deltaY > 0 ? 0.92 : 1.08, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      const studioGesture = shouldStudioCaptureGesture(e.target);
      const scrollable = studioGesture ? null : getScrollableAncestor(e.target, e.deltaY, e.deltaX);
      if (!studioGesture && scrollable) {
        return;
      }
      e.preventDefault();
      // Two-finger trackpad scroll pans the studio unless the gesture started in
      // a scrollable editor/control that should own the movement.
      _userHasPanned = true;
      panX -= e.deltaX;
      panY -= e.deltaY;
      clampViewport();
    }
  }, { passive: false });

  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;
  let spaceDown = false;

  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      spaceDown = true;
      wrap.classList.add('space-held');
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      wrap.classList.remove('space-held');
    }
  });

  wrap.addEventListener('mousedown', (e) => {
    const onBackground = e.target === wrap || e.target === canvas || e.target.closest('#studio-cables');
    // Left-drag on empty studio space pans by default. Middle-click and space+drag also pan.
    if ((e.button === 0 && onBackground) || e.button === 1 || (spaceDown && e.button === 0)) {
      e.preventDefault();
      panning = true;
      _userHasPanned = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
      wrap.classList.add('is-panning');
      wrap.classList.add('panning');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    panX = panStartPanX + (e.clientX - panStartX);
    panY = panStartPanY + (e.clientY - panStartY);
    clampViewport();
  });

  window.addEventListener('mouseup', () => {
    panning = false;
    wrap.classList.remove('is-panning');
    wrap.classList.remove('panning');
  });

  // Module dragging is handled per-module by enableModuleDrag() using pointer events.

  let touchMode = null;
  let touchDist0 = 0;
  let touchScaleStart = 1;
  let touchMidX = 0;
  let touchMidY = 0;

  function touchDist(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  function touchMid(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      touchMode = 'pinch';
      touchDist0 = touchDist(e.touches[0], e.touches[1]);
      touchScaleStart = scale;
      const mid = touchMid(e.touches[0], e.touches[1]);
      touchMidX = mid.x;
      touchMidY = mid.y;
      e.preventDefault();
      return;
    }

    const onBackground = e.target === wrap || e.target === canvas;
    if (e.touches.length === 1 && onBackground) {
      touchMode = 'pan';
      _userHasPanned = true;
      touchMidX = e.touches[0].clientX;
      touchMidY = e.touches[0].clientY;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    if (touchMode === 'pinch' && e.touches.length === 2) {
      const rect = wrap.getBoundingClientRect();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const mid = touchMid(e.touches[0], e.touches[1]);
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, touchScaleStart * (dist / Math.max(touchDist0, 1))));
      const ratio = nextScale / scale;
      const cx = mid.x - rect.left;
      const cy = mid.y - rect.top;
      panX = cx - ratio * (cx - panX);
      panY = cy - ratio * (cy - panY);
      scale = nextScale;
      panX += mid.x - touchMidX;
      panY += mid.y - touchMidY;
      touchMidX = mid.x;
      touchMidY = mid.y;
      clampViewport();
      e.preventDefault();
      return;
    }

    if (touchMode === 'pan' && e.touches.length === 1) {
      const touch = e.touches[0];
      panX += touch.clientX - touchMidX;
      panY += touch.clientY - touchMidY;
      touchMidX = touch.clientX;
      touchMidY = touch.clientY;
      clampViewport();
      e.preventDefault();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    if (touchMode === 'pinch') {
      saveView();
    }
    if (touchMode === 'pan') {
      saveView();
    }
    touchMode = null;
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (_autoZoom) {
      _userHasPanned = false;
      fitToWindow();
    } else {
      clampViewport();
    }
  });
}
