// studio.js — studio canvas: zoom, pan, module placement
export function initStudio() {
  const wrap = document.getElementById('studio-wrap');
  const canvas = document.getElementById('studio-canvas');
  if (!wrap || !canvas) return;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 2.0;
  const MODULE_W = 860;
  const MODULE_H = 860;

  const STUDIO_LAYOUT_KEY = 'confusynth-studio-layout';

  function saveLayout() {
    const layout = [];
    canvas.querySelectorAll('.studio-module').forEach((mod, i) => {
      layout.push({
        id: mod.id || `module-${i}`,
        left: mod.style.left,
        top:  mod.style.top,
      });
    });
    try { localStorage.setItem(STUDIO_LAYOUT_KEY, JSON.stringify(layout)); } catch(e) {}
  }

  function restoreLayout() {
    try {
      const raw = localStorage.getItem(STUDIO_LAYOUT_KEY);
      if (!raw) return;
      const layout = JSON.parse(raw);
      layout.forEach(item => {
        const mod = canvas.querySelector(`#${item.id}`);
        if (mod && item.left) {
          mod.style.left = item.left;
          mod.style.top  = item.top;
        }
      });
    } catch(e) {}
  }

  function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    const indicator = document.getElementById('zoom-level');
    if (indicator) indicator.textContent = Math.round(scale * 100) + '%';
  }

  function centreModules() {
    const ww = wrap.offsetWidth  || window.innerWidth;
    const wh = wrap.offsetHeight || window.innerHeight;
    panX = (ww - MODULE_W) / 2;
    panY = Math.max(20, (wh - MODULE_H) / 2);
    const firstModule = canvas.querySelector('.studio-module');
    if (firstModule) {
      firstModule.style.left = '0px';
      firstModule.style.top  = '0px';
    }
    applyTransform();
  }

  // Defer centering to after first layout paint
  let _layoutRestored = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    centreModules();
    if (!_layoutRestored) {
      _layoutRestored = true;
      restoreLayout();
    }
  }));

  // Zoom buttons — zoom toward canvas centre
  document.getElementById('zoom-in')?.addEventListener('click', () => {
    zoomBy(1.2, wrap.offsetWidth / 2, wrap.offsetHeight / 2);
  });
  document.getElementById('zoom-out')?.addEventListener('click', () => {
    zoomBy(1 / 1.2, wrap.offsetWidth / 2, wrap.offsetHeight / 2);
  });
  document.getElementById('zoom-reset')?.addEventListener('click', () => {
    scale = 1;
    centreModules();
  });

  function zoomBy(factor, cx, cy) {
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    const ratio = newScale / scale;
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    scale = newScale;
    applyTransform();
  }

  // Wheel: pinch / ctrl+scroll → zoom; two-finger scroll on background → pan
  wrap.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      // Pinch-to-zoom or ctrl+scroll → zoom toward cursor
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomBy(e.deltaY > 0 ? 0.9 : 1.1, e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    // Two-finger scroll: pan only when NOT over a scrollable content area inside a module
    const onScrollable = e.target.closest(
      '.page-content, .mixer-fader-grid, .right-col, .fx-layout, .fx-left, .fx-right, ' +
      '.piano-roll-scroll, .arranger-scroll, [data-no-pan]'
    );
    if (onScrollable) return; // let natural scroll handle it
    e.preventDefault();
    panX -= e.deltaX;
    panY -= e.deltaY;
    applyTransform();
  }, { passive: false });

  // Middle-click or space+drag to pan
  let panning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;
  let spaceDown = false;

  document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) spaceDown = true; });
  document.addEventListener('keyup',   e => { if (e.code === 'Space') spaceDown = false; });

  wrap.addEventListener('mousedown', e => {
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
      wrap.style.cursor = 'grabbing';
    }
  });
  window.addEventListener('mousemove', e => {
    if (!panning) return;
    panX = panStartPanX + (e.clientX - panStartX);
    panY = panStartPanY + (e.clientY - panStartY);
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    panning = false;
    wrap.style.cursor = '';
  });

  // Module dragging (drag .studio-module by its ports-bar header)
  canvas.addEventListener('mousedown', e => {
    const mod = e.target.closest('.studio-module');
    if (!mod) return;
    const header = e.target.closest('.ports-bar, .chassis-handle');
    if (!header) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseInt(mod.style.left) || 0;
    const startTop  = parseInt(mod.style.top)  || 0;
    function onMove(ev) {
      mod.style.left = (startLeft + (ev.clientX - startX) / scale) + 'px';
      mod.style.top  = (startTop  + (ev.clientY - startY) / scale) + 'px';
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      saveLayout();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // ── Touch: two-finger pan + pinch-to-zoom ──────────────────────────────────
  let _touches = [];
  let _touchPanX0 = 0, _touchPanY0 = 0, _touchPanXStart = 0, _touchPanYStart = 0;
  let _touchDist0 = 0, _touchScaleStart = 1;

  function _touchDist(a, b) {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }
  function _touchMid(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  wrap.addEventListener('touchstart', e => {
    _touches = [...e.touches];
    if (_touches.length === 2) {
      e.preventDefault();
      _touchDist0 = _touchDist(_touches[0], _touches[1]);
      _touchScaleStart = scale;
      const mid = _touchMid(_touches[0], _touches[1]);
      _touchPanX0 = mid.x; _touchPanY0 = mid.y;
      _touchPanXStart = panX; _touchPanYStart = panY;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const t = [...e.touches];
    const dist = _touchDist(t[0], t[1]);
    const mid  = _touchMid(t[0], t[1]);
    const rect = wrap.getBoundingClientRect();
    // Pinch zoom: zoom around the midpoint of the two fingers
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _touchScaleStart * dist / _touchDist0));
    const ratio = newScale / scale;
    const cx = mid.x - rect.left;
    const cy = mid.y - rect.top;
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    scale = newScale;
    // Two-finger pan
    panX += mid.x - _touchPanX0;
    panY += mid.y - _touchPanY0;
    _touchPanX0 = mid.x; _touchPanY0 = mid.y;
    applyTransform();
  }, { passive: false });

  wrap.addEventListener('touchend', e => { _touches = [...e.touches]; }, { passive: true });

  // Duplicate button — clones the main chassis as a new module
  document.getElementById('btn-duplicate')?.addEventListener('click', () => {
    addModule('synth');
  });

  // Add Module button — shows picker
  document.getElementById('add-module')?.addEventListener('click', () => {
    showModulePicker();
  });

  function showModulePicker() {
    const existing = document.getElementById('module-picker');
    if (existing) { existing.remove(); return; }
    const picker = document.createElement('div');
    picker.id = 'module-picker';
    picker.innerHTML = `
      <div class="mp-title">Add Module</div>
      <button data-module="synth">CONFUsynth</button>
      <button data-module="djmixer">DJ Mixer</button>
      <button data-module="figure-cat">🐱 Cat Figure</button>
      <button data-module="figure-robot">🤖 Robot Figure</button>
      <button data-module="figure-cactus">🌵 Cactus</button>
    `;
    picker.addEventListener('click', e => {
      const type = e.target.dataset.module;
      if (type) { addModule(type); picker.remove(); }
    });
    document.getElementById('studio-controls').prepend(picker);
  }

  function addModule(type) {
    const mod = document.createElement('div');
    mod.className = 'studio-module';
    // Place offset from existing modules
    const offset = canvas.querySelectorAll('.studio-module').length * 40;
    mod.style.left = (900 + offset) + 'px';
    mod.style.top  = (100 + offset) + 'px';

    if (type === 'synth') {
      // Clone the full chassis from the first module
      const original = document.querySelector('#module-0 .chassis');
      if (original) {
        const clone = original.cloneNode(true);
        // Give cloned elements unique IDs to avoid conflicts
        clone.querySelectorAll('[id]').forEach(el => {
          el.id = el.id + '-clone-' + Date.now();
        });
        mod.appendChild(clone);
      } else {
        mod.innerHTML = `<div style="width:860px;height:860px;background:#4e5f3c;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#b8c8a0;font-size:1.2rem">CONFUsynth</div>`;
      }
    } else if (type === 'djmixer') {
      import('/src/modules/djmixer.js').then(m => {
        const ctx = window._confusynthEngine?.context ?? null;
        mod.appendChild(m.createDJMixer(ctx));
      });
    } else if (type.startsWith('figure-')) {
      const emoji = { 'figure-cat': '🐱', 'figure-robot': '🤖', 'figure-cactus': '🌵' }[type] || '🎵';
      mod.innerHTML = `<div class="studio-figure">${emoji}</div>`;
    }
    canvas.appendChild(mod);
  }
}
