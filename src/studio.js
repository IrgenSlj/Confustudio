// studio.js — studio canvas: zoom, pan, module placement
export function initStudio() {
  const wrap = document.getElementById('studio-wrap');
  const canvas = document.getElementById('studio-canvas');
  if (!wrap || !canvas) return;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 2.0;

  // Centre the main module on load
  const firstModule = canvas.querySelector('.studio-module');
  if (firstModule) {
    const ww = wrap.offsetWidth;
    const wh = wrap.offsetHeight;
    const mw = 860; // chassis width
    const mh = 860;
    panX = (ww - mw) / 2;
    panY = (wh - mh) / 2;
    firstModule.style.left = '0px';
    firstModule.style.top  = '0px';
    applyTransform();
  }

  function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  // Zoom buttons
  document.getElementById('zoom-in')?.addEventListener('click', () => {
    scale = Math.min(MAX_SCALE, scale * 1.2);
    applyTransform();
  });
  document.getElementById('zoom-out')?.addEventListener('click', () => {
    scale = Math.max(MIN_SCALE, scale / 1.2);
    applyTransform();
  });
  document.getElementById('zoom-reset')?.addEventListener('click', () => {
    scale = 1;
    const ww = wrap.offsetWidth;
    const wh = wrap.offsetHeight;
    panX = (ww - 860) / 2;
    panY = (wh - 860) / 2;
    applyTransform();
  });

  // Ctrl+scroll to zoom
  wrap.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Zoom toward mouse cursor
    panX = mx - (mx - panX) * factor;
    panY = my - (my - panY) * factor;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
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
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
      mod.innerHTML = `<div class="mini-chassis"><div class="mini-chassis-label">CONFUsynth</div><div class="mini-chassis-body"></div></div>`;
    } else if (type === 'djmixer') {
      import('/src/modules/djmixer.js').then(m => {
        mod.appendChild(m.createDJMixer());
      });
    } else if (type.startsWith('figure-')) {
      const emoji = { 'figure-cat': '🐱', 'figure-robot': '🤖', 'figure-cactus': '🌵' }[type] || '🎵';
      mod.innerHTML = `<div class="studio-figure">${emoji}</div>`;
    }
    canvas.appendChild(mod);
  }
}
