// studio-modules.js — module picker, creation, placement, removal

export const DEFAULT_MODULE_W = 860;
export const DEFAULT_MODULE_H = 860;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2.25;
export const FIT_PADDING = 40;
export const ZOOM_LENS_SIZE = 480;
export const ZOOM_LENS_SCALE = 1.085;
export const STUDIO_LAYOUT_KEY = 'confustudio-studio-layout-v4';
export const STUDIO_VIEW_KEY = 'confustudio-studio-view-v3';

const MODULE_LABELS = {
  synth: 'CONFUsynth',
  acid_machine: 'Acid Machine',
  polysynth: 'Polysynth',
  drum_machine: 'Drum Machine',
  fm_synth: 'FM Synth',
  monosynth: 'Monosynth',
  djmixer: 'DJ Mixer',
};

function _parsePx(value) {
  return Number.parseFloat(value || '0') || 0;
}

// --- Pure helpers ---

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parsePx(value) {
  return _parsePx(value);
}

export function isModuleInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  const explicitInteractive = Boolean(target.closest([
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
    '.module-picker',
    '.module-resize-handle',
  ].join(',')));
  if (explicitInteractive) return true;
  return Boolean(target.closest([
    '[role="slider"]',
    '[class*="knob"]',
    '[class*="slider"]',
    '[class*="fader"]',
    '[class*="switch"]',
    '[class*="button"]',
    '[class*="step"]',
    '[data-param]',
    '[data-action]',
  ].join(',')));
}

export function isTextEntryTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, option, [contenteditable="true"]'));
}

export function shouldHideLensForTarget(target) {
  if (!(target instanceof Element)) return true;
  if (isModuleInteractiveTarget(target)) return true;
  return Boolean(target.closest([
    '.port',
    '.djm-port',
    '.module-tools',
    '.module-drag-handle',
    '.module-resize-handle',
    '.module-picker',
    '.chassis-dup-btn',
    '#studio-controls',
  ].join(',')));
}

export function shouldStudioCaptureGesture(S, target) {
  if (!(target instanceof Element)) return true;
  if (isTextEntryTarget(target)) return false;
  if (target.closest('.module-picker')) return false;
  if (target.closest('.screen-bezel, .chassis, .studio-module, .module-tools, .module-drag-handle, #studio-cables')) {
    return !isModuleInteractiveTarget(target);
  }
  if (target === S.wrap || target === S.canvas) return true;
  return !isModuleInteractiveTarget(target);
}

export function closeModulePicker() {
  document.getElementById('module-picker')?.remove();
}

export function getModuleLabel(modEl) {
  if (!modEl) return 'No module selected';
  if (modEl.id === 'module-0') return 'CONFUsynth Instrument';
  const type = modEl.dataset.moduleType || 'module';
  const label = MODULE_LABELS[type] || type.replace(/_/g, ' ');
  return label;
}

export function applySavedLayoutItem(mod, item) {
  if (!mod || !item) return;
  mod.style.left = item.left || '0px';
  mod.style.top = item.top || '0px';
  mod.style.zoom = item.zoom && item.zoom !== 1 ? item.zoom : '';
  if (item.type) mod.dataset.moduleType = item.type;
}

// --- State-reading helpers ---

export function getWrapSize(S) {
  return {
    width: S.wrap.clientWidth || window.innerWidth,
    height: S.wrap.clientHeight || window.innerHeight,
  };
}

export function worldPointFromScreen(S, clientX, clientY) {
  const rect = S.wrap.getBoundingClientRect();
  return {
    x: (clientX - rect.left - S.panX) / S.scale,
    y: (clientY - rect.top - S.panY) / S.scale,
  };
}

export function getModuleSize(S, mod) {
  const rect = mod.getBoundingClientRect();
  return {
    width: rect.width / Math.max(S.scale, 0.0001) || DEFAULT_MODULE_W,
    height: rect.height / Math.max(S.scale, 0.0001) || DEFAULT_MODULE_H,
  };
}

export function getModuleBounds(S) {
  const modules = [...S.canvas.querySelectorAll('.studio-module')];
  if (modules.length === 0) {
    return { left: 0, top: 0, right: DEFAULT_MODULE_W, bottom: DEFAULT_MODULE_H, width: DEFAULT_MODULE_W, height: DEFAULT_MODULE_H };
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  modules.forEach((mod) => {
    const modLeft = _parsePx(mod.style.left);
    const modTop = _parsePx(mod.style.top);
    const { width, height } = getModuleSize(S, mod);
    left = Math.min(left, modLeft);
    top = Math.min(top, modTop);
    right = Math.max(right, modLeft + width);
    bottom = Math.max(bottom, modTop + height);
  });
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function moduleById(S, id) {
  if (!id) return null;
  const mod = document.getElementById(id);
  return mod && S.canvas.contains(mod) && mod.classList.contains('studio-module') ? mod : null;
}

export function getSelectedModule(S) {
  return S._selectedModule && S._selectedModule.isConnected ? S._selectedModule : null;
}

// --- Viewport / state writing ---

let _saveViewTimer = null;
export function saveView(S) {
  clearTimeout(_saveViewTimer);
  _saveViewTimer = setTimeout(() => {
    try {
      localStorage.setItem(STUDIO_VIEW_KEY, JSON.stringify({ scale: S.scale, panX: S.panX, panY: S.panY, autoZoom: S._autoZoom }));
    } catch (_) {}
  }, 200);
}

export function saveLayout(S) {
  const layout = [...S.canvas.querySelectorAll('.studio-module')].map((mod, index) => ({
    id: mod.id || `module-${index}`,
    type: mod.dataset.moduleType || 'synth',
    left: mod.style.left || '0px',
    top: mod.style.top || '0px',
    zoom: parseFloat(mod.style.zoom) || 1,
    selected: mod === S._selectedModule,
  }));
  try {
    localStorage.setItem(STUDIO_LAYOUT_KEY, JSON.stringify(layout));
  } catch (_) {}
}

export function applyTransform(S) {
  S.canvas.style.transform = `translate(${S.panX}px, ${S.panY}px) scale(${S.scale})`;
  const indicator = document.getElementById('zoom-level');
  if (indicator) indicator.textContent = `${Math.round(S.scale * 100)}%`;
  saveView(S);
}

export function fitToWindow(S, { force = false } = {}) {
  const { width: wrapW, height: wrapH } = getWrapSize(S);
  const bounds = getModuleBounds(S);
  const fitW = Math.max(120, wrapW - FIT_PADDING * 2);
  const fitH = Math.max(120, wrapH - FIT_PADDING * 2);
  const fitScale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, Math.min(fitW / Math.max(bounds.width, 1), fitH / Math.max(bounds.height, 1)))
  );

  if (force || !S.hasRestoredView) {
    S.scale = fitScale;
    S.panX = (wrapW - bounds.width * S.scale) / 2 - bounds.left * S.scale;
    S.panY = (wrapH - bounds.height * S.scale) / 2 - bounds.top * S.scale;
    S.hasRestoredView = true;
    if (force) S._userHasPanned = false;
    applyTransform(S);
  }
}

export function clampViewport(S) {
  const { width: wrapW, height: wrapH } = getWrapSize(S);
  const bounds = getModuleBounds(S);
  const scaledWidth = bounds.width * S.scale;
  const scaledHeight = bounds.height * S.scale;
  const minX = wrapW - FIT_PADDING - bounds.right * S.scale;
  const maxX = FIT_PADDING - bounds.left * S.scale;
  const minY = wrapH - FIT_PADDING - bounds.bottom * S.scale;
  const maxY = FIT_PADDING - bounds.top * S.scale;
  const clampMinX = Math.min(minX, maxX);
  const clampMaxX = Math.max(minX, maxX);
  const clampMinY = Math.min(minY, maxY);
  const clampMaxY = Math.max(minY, maxY);

  if (scaledWidth + FIT_PADDING * 2 <= wrapW) {
    if (!S._userHasPanned && S._autoZoom) {
      S.panX = (wrapW - scaledWidth) / 2 - bounds.left * S.scale;
    } else {
      S.panX = Math.min(clampMaxX, Math.max(clampMinX, S.panX));
    }
  } else {
    S.panX = Math.min(clampMaxX, Math.max(clampMinX, S.panX));
  }

  if (scaledHeight + FIT_PADDING * 2 <= wrapH) {
    if (!S._userHasPanned && S._autoZoom) {
      S.panY = (wrapH - scaledHeight) / 2 - bounds.top * S.scale;
    } else {
      S.panY = Math.min(clampMaxY, Math.max(clampMinY, S.panY));
    }
  } else {
    S.panY = Math.min(clampMaxY, Math.max(clampMinY, S.panY));
  }

  applyTransform(S);
}

// --- Module focus / selection ---

export function selectModule(S, modEl, { focus = true } = {}) {
  S._selectedModule = modEl && modEl.isConnected ? modEl : null;
  S.canvas.querySelectorAll('.studio-module').forEach((mod) => {
    mod.classList.toggle('module-selected', mod === S._selectedModule);
  });
  updateSelectionUi(S);
  saveLayout(S);
  if (focus && S._selectedModule && typeof S._selectedModule.scrollIntoView === 'function') {
    S._selectedModule.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

export function updateSelectionUi(S) {
  const removeBtn = document.getElementById('remove-module');
  const selected = getSelectedModule(S);
  if (removeBtn) {
    const removable = Boolean(selected && selected.id !== 'module-0');
    removeBtn.disabled = !removable;
    removeBtn.title = removable ? `Remove ${getModuleLabel(selected)}` : 'Primary module cannot be removed';
  }
}

export function fitModuleToWindow(S, modEl) {
  if (!modEl || !modEl.isConnected) return;
  const { width: wrapW, height: wrapH } = getWrapSize(S);
  const left = _parsePx(modEl.style.left);
  const top = _parsePx(modEl.style.top);
  const { width, height } = getModuleSize(S, modEl);
  const fitW = Math.max(120, wrapW - FIT_PADDING * 2);
  const fitH = Math.max(120, wrapH - FIT_PADDING * 2);
  S.scale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, Math.min(fitW / Math.max(width, 1), fitH / Math.max(height, 1)))
  );
  S.panX = (wrapW - width * S.scale) / 2 - left * S.scale;
  S.panY = (wrapH - height * S.scale) / 2 - top * S.scale;
  S._userHasPanned = true;
  applyTransform(S);
}

export function focusModule(S, modEl) {
  if (!modEl || !modEl.isConnected) return;
  S.hideZoomLens();
  selectModule(S, modEl, { focus: false });
  fitModuleToWindow(S, modEl);
}

export function buildLiveContext(S) {
  const projectName = document.getElementById('project-name')?.textContent?.trim() || 'CONFUstudio';
  const page = document.querySelector('.page-tabs .tab.active')?.dataset?.page || 'pattern';
  const bankPattern = document.getElementById('bank-pattern')?.textContent?.trim() || 'A·01';
  const bpm = document.getElementById('bpm-display')?.textContent?.trim() || '';
  const selected = getSelectedModule(S);
  return {
    project: { name: projectName },
    page,
    summary: `${bankPattern}${bpm ? ` · ${bpm}` : ''}${selected ? ` · ${getModuleLabel(selected)}` : ''}`,
  };
}

// --- Module lifecycle ---

export function removeModule(S, modEl, { force = false } = {}) {
  if (!modEl || (!force && modEl.id === 'module-0')) return false;
  const wasSelected = modEl === S._selectedModule;
  const fallback = wasSelected
    ? [...S.canvas.querySelectorAll('.studio-module')].find((module) => module !== modEl && module.id !== 'module-0')
      || S.canvas.querySelector('#module-0')
      || null
    : S._selectedModule;

  document.dispatchEvent(new CustomEvent('module:removed', { detail: { moduleEl: modEl, moduleId: modEl.id } }));
  modEl.remove();

  if (wasSelected) {
    selectModule(S, fallback, { focus: false });
  } else {
    updateSelectionUi(S);
    saveLayout(S);
  }

  if (S._autoZoom) {
    S._userHasPanned = false;
    fitToWindow(S, { force: true });
  } else {
    clampViewport(S);
  }
  return true;
}

export function attachModuleChrome(S, modEl) {
  if (!modEl || modEl.querySelector(':scope > .module-tools')) return;
  const tools = document.createElement('div');
  tools.className = 'module-tools';
  tools.innerHTML = `
    <button class="module-fit-btn" type="button" title="Fit this module to screen" aria-label="Fit module to screen">□</button>
    <button class="module-remove-btn" type="button" title="Remove module">×</button>
  `;
  const fitBtn = tools.querySelector('.module-fit-btn');
  const removeBtn = tools.querySelector('.module-remove-btn');
  fitBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    focusModule(S, modEl);
  });
  if (modEl.id === 'module-0') {
    removeBtn.disabled = true;
    removeBtn.title = 'Primary module cannot be removed';
  } else {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeModule(S, modEl);
    });
  }
  modEl.prepend(tools);
  ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
    const handle = document.createElement('div');
    handle.className = `module-resize-handle module-resize-${corner}`;
    modEl.appendChild(handle);
  });
  enableModuleResize(S, modEl);
  modEl.addEventListener('pointerdown', (e) => {
    if (isModuleInteractiveTarget(e.target)) return;
    selectModule(S, modEl, { focus: false });
  });
  modEl.addEventListener('dblclick', (e) => {
    if (isModuleInteractiveTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    focusModule(S, modEl);
  });
}

export function enableModuleDrag(S, modEl) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let dragPointerId = null;

  function canStartDrag(target) {
    if (!(target instanceof Element)) return false;
    if (isModuleInteractiveTarget(target)) return false;
    if (target.closest('.module-drag-handle, .ports-bar, .studio-figure')) return true;
    return target.classList.contains('module-loading-shell') || target === modEl;
  }

  modEl.addEventListener('pointerdown', (e) => {
    if (!canStartDrag(e.target)) return;
    selectModule(S, modEl, { focus: false });
    dragging = true;
    dragPointerId = e.pointerId;
    modEl.classList.add('module-dragging');
    modEl.setPointerCapture(e.pointerId);
    S._userHasPanned = true;

    const pointerWorld = worldPointFromScreen(S, e.clientX, e.clientY);
    offsetX = pointerWorld.x - _parsePx(modEl.style.left);
    offsetY = pointerWorld.y - _parsePx(modEl.style.top);

    e.preventDefault();
  });

  modEl.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragPointerId) return;
    const pointerWorld = worldPointFromScreen(S, e.clientX, e.clientY);
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
    saveLayout(S);
    clampViewport(S);
  }

  modEl.addEventListener('pointerup', (e) => stopDrag(e.pointerId));
  modEl.addEventListener('pointercancel', (e) => stopDrag(e.pointerId));
}

export function enableModuleResize(S, modEl) {
  const cornerDirs = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };
  modEl.querySelectorAll('.module-resize-handle').forEach((handle) => {
    const corner = [...handle.classList].find((c) => c.startsWith('module-resize-') && c !== 'module-resize-handle')?.replace('module-resize-', '');
    if (!corner || !cornerDirs[corner]) return;
    const [xDir, yDir] = cornerDirs[corner];

    let resizing = false;
    let startX = 0, startY = 0;
    let startZoom = 1;
    let naturalW = 0, naturalH = 0;
    let pointerId = null;

    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      resizing = true;
      pointerId = e.pointerId;
      handle.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      startZoom = parseFloat(modEl.style.zoom) || 1;
      const rect = modEl.getBoundingClientRect();
      naturalW = rect.width / startZoom / Math.max(S.scale, 0.001);
      naturalH = rect.height / startZoom / Math.max(S.scale, 0.001);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!resizing || e.pointerId !== pointerId) return;
      const dx = (e.clientX - startX) * xDir / Math.max(S.scale, 0.001);
      const dy = (e.clientY - startY) * yDir / Math.max(S.scale, 0.001);
      const diag = Math.sqrt(naturalW ** 2 + naturalH ** 2) || 1;
      const delta = (dx + dy) / 2;
      const newZoom = Math.max(0.3, Math.min(3, startZoom + (delta / diag) * startZoom));
      modEl.style.zoom = newZoom;
    });

    const stopResize = (e) => {
      if (!resizing || e.pointerId !== pointerId) return;
      resizing = false;
      pointerId = null;
      saveLayout(S);
    };

    handle.addEventListener('pointerup', stopResize);
    handle.addEventListener('pointercancel', stopResize);
  });
}

// --- Module spawn ---

export function getSpawnPosition(S, anchorEl = null) {
  const modules = [...S.canvas.querySelectorAll('.studio-module')];
  if (!modules.length) return { x: 40, y: 40 };

  const anchor = anchorEl && anchorEl.isConnected
    ? anchorEl
    : getSelectedModule(S)
      || S.canvas.querySelector('#module-0')
      || modules[0];
  const gap = 56;
  const viewportCenter = worldPointFromScreen(S, getWrapSize(S).width / 2, getWrapSize(S).height / 2);

  function getRect(mod) {
    return {
      left: _parsePx(mod.style.left),
      top: _parsePx(mod.style.top),
      width: getModuleSize(S, mod).width,
      height: getModuleSize(S, mod).height,
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

export function showModulePicker(S) {
  const existing = document.getElementById('module-picker');
  if (existing) {
    existing.remove();
    return;
  }
  const picker = document.createElement('div');
  picker.id = 'module-picker';
  picker.className = 'module-picker';
  const currentModuleItems = [...S.canvas.querySelectorAll('.studio-module')]
    .map((mod, index) => {
      const selected = mod === getSelectedModule(S);
      return `
        <button class="mp-module-btn${selected ? ' active' : ''}" data-focus-module="${escapeHtml(mod.id)}">
          <span class="mp-module-index">${index + 1}</span>
          <span class="mp-module-name">${escapeHtml(getModuleLabel(mod))}</span>
        </button>
      `;
    })
    .join('');
  picker.innerHTML = `
    <div class="mp-title">Modules</div>
    <div class="mp-hint">Focus a live module, then add another instrument, mixer, or layout utility.</div>
    <div class="mp-section-label">CURRENT</div>
    <div class="mp-module-list">${currentModuleItems}</div>
    <div class="mp-section-label">INSTRUMENTS</div>
    <div class="mp-grid">
      <button data-module="synth">CONFUsynth</button>
      <button data-module="acid_machine">Acid Machine</button>
      <button data-module="polysynth">Polysynth</button>
      <button data-module="drum_machine">Drum Machine</button>
      <button data-module="fm_synth">FM Synth</button>
      <button data-module="monosynth">Monosynth</button>
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
    const focusTarget = e.target.closest('button[data-focus-module]');
    if (focusTarget) {
      const mod = document.getElementById(focusTarget.dataset.focusModule);
      if (mod) focusModule(S, mod);
      closeModulePicker();
      return;
    }
    const target = e.target.closest('button[data-module]');
    const type = target?.dataset.module;
    if (!type) return;
    addModule(S, type);
    closeModulePicker();
  });
  document.body.append(picker);
}

export function addModule(S, type, options = {}) {
  const {
    id = `module-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    left = null,
    top = null,
    zoom = 1,
    select = true,
    fit = true,
    persist = true,
  } = options;
  const mod = document.createElement('div');
  mod.className = 'studio-module';
  mod.dataset.moduleType = type;
  mod.id = id;
  mod.style.position = 'absolute';
  const pos = getSpawnPosition(S);
  mod.style.left = left != null ? String(left) : `${pos.x}px`;
  mod.style.top = top != null ? String(top) : `${pos.y}px`;
  if (zoom && zoom !== 1) mod.style.zoom = zoom;
  enableModuleDrag(S, mod);
  attachModuleChrome(S, mod);

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
      attachModuleChrome(S, mod);
      if (mod === getSelectedModule(S)) updateSelectionUi(S);
    }
  } else if (type === 'djmixer') {
    mod.innerHTML = '<div class="module-loading-shell">Loading Mixer</div>';
    import('./modules/djmixer.js').then((m) => {
      const ctx = window._confustudioEngine?.context ?? null;
      mod.innerHTML = '';
      mod.appendChild(m.createDJMixer(ctx));
      attachModuleChrome(S, mod);
      if (mod === getSelectedModule(S)) updateSelectionUi(S);
    });
  } else if (type === 'acid_machine') {
    mod.innerHTML = '<div class="module-loading-shell" style="width:680px;height:340px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Acid Machine…</div>';
    import('./modules/acid_machine.js').then((m) => {
      const ctx = window._confustudioEngine?.context ?? null;
      mod.innerHTML = '';
      mod.appendChild(m.createAcidMachine(ctx));
      attachModuleChrome(S, mod);
      if (mod === getSelectedModule(S)) updateSelectionUi(S);
    });
  } else if (type === 'polysynth') {
    mod.innerHTML = '<div class="module-loading-shell" style="width:860px;height:240px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Polysynth…</div>';
    import('./modules/polysynth.js').then(m => {
      mod.innerHTML = '';
      mod.appendChild(m.createPolysynth(window._confustudioEngine?.context ?? null));
      attachModuleChrome(S, mod);
      if (mod === getSelectedModule(S)) updateSelectionUi(S);
    });
  } else if (type === 'drum_machine') {
    mod.innerHTML = '<div class="module-loading-shell" style="width:920px;height:320px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Drum Machine…</div>';
    import('./modules/drum_machine.js').then(m => {
      mod.innerHTML = '';
      mod.appendChild(m.createDrumMachine(window._confustudioEngine?.context ?? null));
      attachModuleChrome(S, mod);
      if (mod === getSelectedModule(S)) updateSelectionUi(S);
    });
  } else if (type === 'fm_synth') {
    mod.innerHTML = '<div class="module-loading-shell" style="width:980px;height:280px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading FM Synth…</div>';
    import('./modules/fm_synth.js').then(m => {
      mod.innerHTML = '';
      mod.appendChild(m.createFMSynth(window._confustudioEngine?.context ?? null));
      attachModuleChrome(S, mod);
      if (mod === getSelectedModule(S)) updateSelectionUi(S);
    });
  } else if (type === 'monosynth') {
    mod.innerHTML = '<div class="module-loading-shell" style="width:1000px;height:300px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Monosynth…</div>';
    import('./modules/monosynth.js').then(m => {
      mod.innerHTML = '';
      mod.appendChild(m.createMonosynth(window._confustudioEngine?.context ?? null));
      attachModuleChrome(S, mod);
      if (mod === getSelectedModule(S)) updateSelectionUi(S);
    });
  } else if (type.startsWith('figure-')) {
    const emoji = {
      'figure-cat': '🐱',
      'figure-robot': '🤖',
      'figure-cactus': '🌵',
    }[type] || '🎵';
    mod.innerHTML = `<div class="studio-figure">${emoji}</div>`;
    attachModuleChrome(S, mod);
    if (mod === getSelectedModule(S)) updateSelectionUi(S);
  }

  S.canvas.appendChild(mod);
  if (select) {
    selectModule(S, mod, { focus: false });
  } else {
    updateSelectionUi(S);
  }
  if (fit) {
    if (S._autoZoom) {
      S._userHasPanned = false;
      fitToWindow(S, { force: true });
    } else {
      clampViewport(S);
    }
  }
  if (persist) saveLayout(S);
  return mod;
}

export function spawnDefaultMixer(S) {
  const existingModule = S.canvas.querySelector('#module-0');
  const modRight = existingModule ? (_parsePx(existingModule.style.left) + DEFAULT_MODULE_W + 80) : 100;
  const modTop = existingModule ? _parsePx(existingModule.style.top) : 50;

  const mod = document.createElement('div');
  mod.className = 'studio-module';
  mod.dataset.moduleType = 'djmixer';
  mod.id = 'module-djm-default';
  mod.style.left = `${modRight}px`;
  mod.style.top = `${modTop}px`;
  mod.style.position = 'absolute';
  mod.innerHTML = '<div class="module-loading-shell" style="width:320px;height:420px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Mixer…</div>';
  S.canvas.appendChild(mod);
  enableModuleDrag(S, mod);
  attachModuleChrome(S, mod);
  saveLayout(S);

  import('./modules/djmixer.js').then((m) => {
    const ctx = window._confustudioEngine?.context ?? null;
    mod.innerHTML = '';
    mod.appendChild(m.createDJMixer(ctx));
    attachModuleChrome(S, mod);
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
