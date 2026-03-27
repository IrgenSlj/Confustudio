// studio.js — studio canvas: zoom, pan, module placement
export function initStudio() {
  const wrap = document.getElementById('studio-wrap');
  const canvas = document.getElementById('studio-canvas');
  if (!wrap || !canvas) return;

  const STUDIO_LAYOUT_KEY = 'confusynth-studio-layout';
  const STUDIO_VIEW_KEY = 'confusynth-studio-view';
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

  function getWrapSize() {
    return {
      width: wrap.clientWidth || window.innerWidth,
      height: wrap.clientHeight || window.innerHeight,
    };
  }

  function parsePx(value) {
    return Number.parseFloat(value || '0') || 0;
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
      panY = Math.max(18, (wrapH - bounds.height * scale) / 2 - bounds.top * scale);
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
        panY = Math.max(18, (wrapH - scaledHeight) / 2 - bounds.top * scale);
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

  function placeModuleNearViewportCenter(mod) {
    const { width: wrapW, height: wrapH } = getWrapSize();
    const worldX = (wrapW / 2 - panX) / scale;
    const worldY = (wrapH / 2 - panY) / scale;
    const existing = canvas.querySelectorAll('.studio-module').length;
    const jitter = existing * 28;
    mod.style.left = `${Math.round(worldX - DEFAULT_MODULE_W / 2 + jitter)}px`;
    mod.style.top = `${Math.round(worldY - DEFAULT_MODULE_H / 2 + jitter)}px`;
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
      const type = e.target.dataset.module;
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
    placeModuleNearViewportCenter(mod);

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
      }
    } else if (type === 'djmixer') {
      mod.innerHTML = '<div class="module-loading-shell">Loading Mixer</div>';
      import('./modules/djmixer.js').then((m) => {
        const ctx = window._confusynthEngine?.context ?? null;
        mod.innerHTML = '';
        mod.appendChild(m.createDJMixer(ctx));
      });
    } else if (type === 'tb303') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:680px;height:340px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading TB-303…</div>';
      import('./modules/tb303.js').then((m) => {
        const ctx = window._confusynthEngine?.context ?? null;
        mod.innerHTML = '';
        mod.appendChild(m.createTB303(ctx));
      });
    } else if (type === 'juno60') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:860px;height:240px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Juno-60…</div>';
      import('./modules/juno60.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createJuno60(window._confusynthEngine?.context ?? null));
      });
    } else if (type === 'tr909') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:920px;height:320px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading TR-909…</div>';
      import('./modules/tr909.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createTr909(window._confusynthEngine?.context ?? null));
      });
    } else if (type === 'fm_synth') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:980px;height:280px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading FM Synth…</div>';
      import('./modules/fm_synth.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createFMSynth(window._confusynthEngine?.context ?? null));
      });
    } else if (type === 'moog') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:1000px;height:300px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Moog D…</div>';
      import('./modules/moog.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createMoog(window._confusynthEngine?.context ?? null));
      });
    } else if (type.startsWith('figure-')) {
      const emoji = {
        'figure-cat': '🐱',
        'figure-robot': '🤖',
        'figure-cactus': '🌵',
      }[type] || '🎵';
      mod.innerHTML = `<div class="studio-figure">${emoji}</div>`;
    }

    canvas.appendChild(mod);
    clampViewport();
    saveLayout();
  }

  function _spawnDefaultMixer() {
    const { width: wrapW } = getWrapSize();
    const existingModule = canvas.querySelector('#module-0');
    const modRight = existingModule ? (parsePx(existingModule.style.left) + DEFAULT_MODULE_W + 80) : 100;
    const modTop = existingModule ? parsePx(existingModule.style.top) : 50;

    const mod = document.createElement('div');
    mod.className = 'studio-module';
    mod.dataset.moduleType = 'djmixer';
    mod.id = 'module-djm-default';
    mod.style.left = `${modRight}px`;
    mod.style.top = `${modTop}px`;
    mod.innerHTML = '<div class="module-loading-shell" style="width:320px;height:420px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Mixer…</div>';
    canvas.appendChild(mod);
    saveLayout();

    import('./modules/djmixer.js').then((m) => {
      const ctx = window._confusynthEngine?.context ?? null;
      mod.innerHTML = '';
      mod.appendChild(m.createDJMixer(ctx));
      // After mixer loads, draw the cable
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

  const hasLayout = restoreLayout();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fitToWindow({ force: true });
    if (!hasLayout) {
      // First run: spawn DJ mixer to the right of the synth
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

  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.chassis-dup-btn')) {
      e.preventDefault();
      addModule('synth');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#studio-controls')) closeModulePicker();
  });

  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // ctrl+scroll or meta+scroll → zoom
      const rect = wrap.getBoundingClientRect();
      zoomBy(e.deltaY > 0 ? 0.92 : 1.08, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      // Two-finger pan: use deltaX and deltaY directly
      _userHasPanned = true;
      panX -= e.deltaX;
      panY -= e.deltaY;
      clampViewport();
      applyTransform();
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
    if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') spaceDown = true;
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceDown = false;
  });

  wrap.addEventListener('mousedown', (e) => {
    const onBackground = e.target === wrap || e.target === canvas || e.target.closest('#studio-cables');
    if (e.button === 1 || (spaceDown && onBackground) || (e.button === 0 && onBackground && e.altKey)) {
      e.preventDefault();
      panning = true;
      _userHasPanned = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
      wrap.classList.add('is-panning');
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
  });

  canvas.addEventListener('mousedown', (e) => {
    const mod = e.target.closest('.studio-module');
    if (!mod) return;
    const header = e.target.closest('.ports-bar, .chassis-handle, .studio-figure');
    if (!header) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parsePx(mod.style.left);
    const startTop = parsePx(mod.style.top);

    function onMove(ev) {
      mod.style.left = `${Math.round(startLeft + (ev.clientX - startX) / scale)}px`;
      mod.style.top = `${Math.round(startTop + (ev.clientY - startY) / scale)}px`;
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      saveLayout();
      clampViewport();
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

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
