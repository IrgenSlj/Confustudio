import { buildAssistantPrompt, chatAssistant, fetchAssistantContext, fetchAssistantProviders } from './assistant-client.js';

// studio.js — studio canvas: zoom, pan, module placement
export function initStudio() {
  const wrap = document.getElementById('studio-wrap');
  const canvas = document.getElementById('studio-canvas');
  if (!wrap || !canvas) return;

  const STUDIO_LAYOUT_KEY = 'confusynth-studio-layout-v4';
  const STUDIO_VIEW_KEY = 'confusynth-studio-view-v3';
  const MODULE_LABELS = {
    synth: 'CONFUsynth',
    acid_machine: 'Acid Machine',
    polysynth: 'Polysynth',
    drum_machine: 'Drum Machine',
    fm_synth: 'FM Synth',
    monosynth: 'Monosynth',
    djmixer: 'DJ Mixer',
  };
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 2.25;
  const FIT_PADDING = 40;
  const DEFAULT_MODULE_W = 860;
  const DEFAULT_MODULE_H = 860;
  const ZOOM_LENS_KEY = 'confusynth-zoom-lens-v1';
  const ZOOM_LENS_SIZE = 480;
  const ZOOM_LENS_SCALE = 1.085;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let hasRestoredView = false;
  let hasRestoredLayout = false;
  let _userHasPanned = false;
  let _autoZoom = true; // when true, viewport auto-fits on resize and new module spawn
  let _selectedModule = null;
  let _restoredSelectedModuleId = null;
  let _zoomLensEnabled = true;
  let _zoomLensHost = null;
  let _zoomLensViewport = null;
  let _zoomLensClone = null;
  let _zoomLensVisible = false;
  let _zoomLensLastPoint = null;
  let _zoomLensRefreshTimer = null;
  let _zoomLensCurrentLeft = 0;
  let _zoomLensCurrentTop = 0;
  let _zoomLensTargetLeft = 0;
  let _zoomLensTargetTop = 0;
  let _zoomLensRaf = 0;
  let _studioOverlay = null;

  try {
    const savedLensPref = localStorage.getItem(ZOOM_LENS_KEY);
    if (savedLensPref != null) _zoomLensEnabled = savedLensPref !== '0';
  } catch (_) {}

  function getWrapSize() {
    return {
      width: wrap.clientWidth || window.innerWidth,
      height: wrap.clientHeight || window.innerHeight,
    };
  }

  function parsePx(value) {
    return Number.parseFloat(value || '0') || 0;
  }

  function getLensToggleButton() {
    return document.getElementById('toggle-zoom-lens');
  }

  function saveLensPreference() {
    try {
      localStorage.setItem(ZOOM_LENS_KEY, _zoomLensEnabled ? '1' : '0');
    } catch (_) {}
  }

  function updateLensToggleButton() {
    const button = getLensToggleButton();
    if (!button) return;
    button.textContent = 'Lens';
    button.title = _zoomLensEnabled ? 'Turn cursor zoom lens off' : 'Turn cursor zoom lens on';
    button.classList.toggle('lens-off', !_zoomLensEnabled);
  }

  function createZoomLens() {
    if (_zoomLensHost) return;
    _zoomLensHost = document.createElement('div');
    _zoomLensHost.id = 'studio-zoom-lens-host';
    _zoomLensHost.setAttribute('aria-hidden', 'true');
    _zoomLensHost.style.width = `${ZOOM_LENS_SIZE}px`;
    _zoomLensHost.style.height = `${ZOOM_LENS_SIZE}px`;
    document.body.append(_zoomLensHost);

    const shadow = _zoomLensHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <link rel="stylesheet" href="/src/styles.css">
      <style>
        .lens-shell {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          box-shadow:
            0 18px 48px rgba(0, 0, 0, 0.13),
            0 4px 14px rgba(0, 0, 0, 0.04);
          background: transparent;
        }

        .lens-viewport {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: 50%;
          -webkit-mask-image: radial-gradient(circle at center, #000 0 58%, rgba(0,0,0,0.98) 70%, rgba(0,0,0,0.84) 80%, rgba(0,0,0,0.48) 89%, rgba(0,0,0,0.14) 96%, transparent 100%);
          mask-image: radial-gradient(circle at center, #000 0 58%, rgba(0,0,0,0.98) 70%, rgba(0,0,0,0.84) 80%, rgba(0,0,0,0.48) 89%, rgba(0,0,0,0.14) 96%, transparent 100%);
        }

        .lens-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            radial-gradient(circle at center, rgba(255,255,255,0.05) 0 22%, rgba(255,255,255,0.025) 32%, rgba(255,255,255,0.01) 48%, transparent 66%),
            radial-gradient(circle at center, transparent 72%, rgba(12,22,14,0.035) 84%, rgba(12,22,14,0.08) 94%, rgba(12,22,14,0.12) 100%);
        }
      </style>
      <div class="lens-shell">
        <div class="lens-viewport"></div>
      </div>
    `;

    _zoomLensViewport = shadow.querySelector('.lens-viewport');
  }

  function refreshZoomLensClone() {
    if (!_zoomLensViewport) return;
    const wrapRect = wrap.getBoundingClientRect();
    const clone = wrap.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.left = `${wrapRect.left}px`;
    clone.style.top = `${wrapRect.top}px`;
    clone.style.margin = '0';
    clone.style.width = `${wrapRect.width}px`;
    clone.style.height = `${wrapRect.height}px`;
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';
    clone.style.pointerEvents = 'none';
    _zoomLensViewport.replaceChildren(clone);
    _zoomLensClone = clone;
    if (_zoomLensLastPoint) {
      positionZoomLens(_zoomLensLastPoint.clientX, _zoomLensLastPoint.clientY);
    }
  }

  function scheduleZoomLensRefresh() {
    if (!_zoomLensVisible) return;
    clearTimeout(_zoomLensRefreshTimer);
    _zoomLensRefreshTimer = setTimeout(() => {
      refreshZoomLensClone();
    }, 220);
  }

  function showZoomLens() {
    if (!_zoomLensEnabled) return;
    if (!_zoomLensHost) createZoomLens();
    if (!_zoomLensHost) return;
    if (!_zoomLensClone) refreshZoomLensClone();
    _zoomLensHost.style.display = 'block';
    _zoomLensVisible = true;
  }

  function hideZoomLens() {
    clearTimeout(_zoomLensRefreshTimer);
    cancelAnimationFrame(_zoomLensRaf);
    _zoomLensRaf = 0;
    if (_zoomLensViewport) _zoomLensViewport.replaceChildren();
    _zoomLensClone = null;
    if (_zoomLensHost) _zoomLensHost.style.display = 'none';
    _zoomLensVisible = false;
  }

  function positionZoomLens(clientX, clientY) {
    if (!_zoomLensHost || !_zoomLensClone) return;
    const left = clientX - (ZOOM_LENS_SIZE / 2);
    const top = clientY - (ZOOM_LENS_SIZE / 2);
    const lensCenterX = ZOOM_LENS_SIZE / 2;
    const lensCenterY = ZOOM_LENS_SIZE / 2;

    _zoomLensTargetLeft = left;
    _zoomLensTargetTop = top;
    _zoomLensCurrentLeft = left;
    _zoomLensCurrentTop = top;
    _zoomLensHost.style.transform = `translate(${left}px, ${top}px)`;
    _zoomLensClone.style.transformOrigin = '0 0';
    _zoomLensClone.style.transform = `translate(${lensCenterX - (clientX * ZOOM_LENS_SCALE)}px, ${lensCenterY - (clientY * ZOOM_LENS_SCALE)}px) scale(${ZOOM_LENS_SCALE})`;
  }

  function setZoomLensEnabled(nextEnabled) {
    _zoomLensEnabled = Boolean(nextEnabled);
    saveLensPreference();
    updateLensToggleButton();
    if (_zoomLensEnabled) {
      createZoomLens();
      if (_zoomLensVisible && _zoomLensLastPoint) {
        showZoomLens();
        positionZoomLens(_zoomLensLastPoint.clientX, _zoomLensLastPoint.clientY);
      }
    } else {
      hideZoomLens();
    }
  }

  function shouldHideLensForTarget(target) {
    if (!(target instanceof Element)) return true;
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
      '.module-picker',
      '.module-resize-handle',
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
      zoom: parseFloat(mod.style.zoom) || 1,
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
        autoZoomBtn.textContent = _autoZoom ? 'Auto Fit' : 'Manual';
        autoZoomBtn.title = _autoZoom
          ? 'Auto-fit is on and the studio recenters itself on resize'
          : 'Manual view is on and the studio stays where you leave it';
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
        if (item.zoom && item.zoom !== 1) mod.style.zoom = item.zoom;
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
    const minX = wrapW - FIT_PADDING - bounds.right * scale;
    const maxX = FIT_PADDING - bounds.left * scale;
    const minY = wrapH - FIT_PADDING - bounds.bottom * scale;
    const maxY = FIT_PADDING - bounds.top * scale;
    const clampMinX = Math.min(minX, maxX);
    const clampMaxX = Math.max(minX, maxX);
    const clampMinY = Math.min(minY, maxY);
    const clampMaxY = Math.max(minY, maxY);

    if (scaledWidth + FIT_PADDING * 2 <= wrapW) {
      if (!_userHasPanned && _autoZoom) {
        panX = (wrapW - scaledWidth) / 2 - bounds.left * scale;
      } else {
        panX = Math.min(clampMaxX, Math.max(clampMinX, panX));
      }
    } else {
      panX = Math.min(clampMaxX, Math.max(clampMinX, panX));
    }

    if (scaledHeight + FIT_PADDING * 2 <= wrapH) {
      if (!_userHasPanned && _autoZoom) {
        panY = (wrapH - scaledHeight) / 2 - bounds.top * scale;
      } else {
        panY = Math.min(clampMaxY, Math.max(clampMinY, panY));
      }
    } else {
      panY = Math.min(clampMaxY, Math.max(clampMinY, panY));
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
    if (modEl.id === 'module-0') return 'CONFUsynth Instrument';
    const type = modEl.dataset.moduleType || 'module';
    const label = MODULE_LABELS[type] || type.replace(/_/g, ' ');
    return label;
  }

  function updateSelectionUi() {
    const removeBtn = document.getElementById('remove-module');
    const selected = getSelectedModule();
    if (removeBtn) {
      const removable = Boolean(selected && selected.id !== 'module-0');
      removeBtn.disabled = !removable;
      removeBtn.title = removable ? `Remove ${getModuleLabel(selected)}` : 'Primary module cannot be removed';
    }
  }

  function buildLiveContext() {
    const projectName = document.getElementById('project-name')?.textContent?.trim() || 'CONFUstudio';
    const page = document.querySelector('.page-tabs .tab.active')?.dataset?.page || 'pattern';
    const bankPattern = document.getElementById('bank-pattern')?.textContent?.trim() || 'A·01';
    const bpm = document.getElementById('bpm-display')?.textContent?.trim() || '';
    const selected = getSelectedModule();
    return {
      project: { name: projectName },
      page,
      summary: `${bankPattern}${bpm ? ` · ${bpm}` : ''}${selected ? ` · ${getModuleLabel(selected)}` : ''}`,
    };
  }

  function ensureStudioOverlay() {
    if (_studioOverlay?.isConnected) return _studioOverlay;
    const overlay = document.createElement('div');
    overlay.id = 'studio-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div class="studio-overlay-panel" role="dialog" aria-modal="true" aria-label="CONFUstudio overlay">
        <div class="studio-overlay-head">
          <div class="studio-overlay-title">CONFUstudio</div>
          <button class="studio-overlay-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="studio-overlay-body"></div>
      </div>
    `;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('.studio-overlay-close')) {
        closeStudioOverlay();
      }
    });
    document.body.append(overlay);
    _studioOverlay = overlay;
    return overlay;
  }

  function closeStudioOverlay() {
    if (_studioOverlay) _studioOverlay.classList.add('hidden');
  }

  function openStudioOverlay(title, content) {
    const overlay = ensureStudioOverlay();
    hideZoomLens();
    overlay.querySelector('.studio-overlay-title').textContent = title;
    const body = overlay.querySelector('.studio-overlay-body');
    body.replaceChildren();
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content) {
      body.append(content);
    }
    overlay.classList.remove('hidden');
  }

  async function openManualOverlay() {
    openStudioOverlay('Guide', '<div class="studio-overlay-copy">Loading guide…</div>');
    try {
      const context = await fetchAssistantContext();
      const app = context?.app || {};
      const assistant = context?.assistant || {};
      const manual = context?.manual || {};
      const pages = manual.pages || [];
      const signalFlow = (manual.audioAndControl?.routing || []).map((item) => `<li>${item}</li>`).join('');
      const pageItems = pages.map((page) => `<li><strong>${page.title}</strong>: ${page.purpose}</li>`).join('');
      const quickStart = [
        'Power the audio engine, set BPM, and choose a page for the current task.',
        'Build or edit the pattern, then shape the selected track in Sound and Mixer.',
        'Use Scenes and Arranger to turn loops into a performance or song structure.',
        'Call the Assistant when you want producer-style direction grounded in the current project.'
      ].map((step) => `<li>${step}</li>`).join('');
      const assistantModes = (assistant.skills || []).map((skill) => `<li><strong>${skill.id}</strong>: ${skill.purpose}</li>`).join('');
      const wrapEl = document.createElement('div');
      wrapEl.innerHTML = `
        <div class="studio-overlay-copy">${app.description || 'CONFUstudio is a browser-first studio shell for sequencing, sampling, synthesis, routing, and performance.'}</div>
        <nav class="studio-manual-index">
          <button type="button" class="active" data-manual-tab="manual-quickstart">Quick Start</button>
          <button type="button" data-manual-tab="manual-overview">Overview</button>
          <button type="button" data-manual-tab="manual-pages">Pages</button>
          <button type="button" data-manual-tab="manual-routing">Routing</button>
          <button type="button" data-manual-tab="manual-assistant">Assistant</button>
        </nav>
        <div class="studio-manual-meta">
          <section class="studio-overlay-card">
            <h4>Instrument</h4>
            <p>CONFUsynth is the primary instrument. Use it as the core sequencer, sampler, and synth voice inside the studio shell.</p>
          </section>
          <section class="studio-overlay-card">
            <h4>Manual Type</h4>
            <p>Quick-start plus reference format, similar to modern hardware manuals that separate first-use flow from deeper parameter reference.</p>
          </section>
        </div>
        <div class="studio-overlay-grid">
          <section class="studio-overlay-card studio-manual-section" id="manual-quickstart">
            <h4>Quick Start</h4>
            <ul>${quickStart}</ul>
          </section>
          <section class="studio-overlay-card studio-manual-section hidden" id="manual-overview">
            <h4>Studio Overview</h4>
            <p>${assistant.contextSummary || 'Use CONFUsynth for sequencing, sampling, synthesis, routing, and mix decisions across the studio.'}</p>
          </section>
          <section class="studio-overlay-card studio-manual-section hidden" id="manual-pages">
            <h4>Page Reference</h4>
            <ul>${pageItems}</ul>
          </section>
          <section class="studio-overlay-card studio-manual-section hidden" id="manual-routing">
            <h4>Signal And Routing</h4>
            <ul>${signalFlow}</ul>
          </section>
          <section class="studio-overlay-card studio-manual-section hidden" id="manual-assistant">
            <h4>Assistant Modes</h4>
            <ul>${assistantModes}</ul>
          </section>
          <section class="studio-overlay-card studio-manual-section hidden" id="manual-rules">
            <h4>Operating Rules</h4>
            <ul>${(manual.assistantGuardrails || []).map((rule) => `<li>${rule}</li>`).join('')}</ul>
          </section>
        </div>
      `;
      wrapEl.querySelectorAll('[data-manual-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          const targetId = button.dataset.manualTab;
          wrapEl.querySelectorAll('[data-manual-tab]').forEach((other) => {
            other.classList.toggle('active', other === button);
          });
          wrapEl.querySelectorAll('.studio-manual-section').forEach((section) => {
            section.classList.toggle('hidden', section.id !== targetId);
          });
        });
      });
      openStudioOverlay('Guide', wrapEl);
    } catch (error) {
      openStudioOverlay('Guide', `<div class="studio-overlay-copy">${error?.message || 'Guide unavailable.'}</div>`);
    }
  }

  async function openAssistantOverlay() {
    const shell = document.createElement('div');
    shell.innerHTML = `
      <div class="studio-overlay-copy">Use the studio assistant as a producer partner. It can translate the current project state into sequencing, sound design, routing, arrangement, and mix actions grounded in what CONFUstudio can actually do.</div>
      <div class="studio-assistant-toolbar">
        <select class="studio-assistant-provider"><option value="auto">Auto</option></select>
        <button type="button" data-preset="producer">Producer</button>
        <button type="button" data-preset="sound">Sound Design</button>
        <button type="button" data-preset="arrangement">Arrangement</button>
        <button type="button" data-preset="mix">Mix</button>
        <button type="button" data-preset="workflow">Workflow</button>
      </div>
      <textarea class="studio-assistant-prompt" placeholder="Ask for a full production move, a patch idea, routing help, scene transitions, or a step-by-step plan."></textarea>
      <div class="studio-assistant-actions">
        <button type="button" class="studio-assistant-context">Use Current Context</button>
        <button type="button" class="studio-assistant-send">Ask Assistant</button>
      </div>
      <pre class="studio-assistant-output">Assistant ready.</pre>
    `;
    openStudioOverlay('Assistant', shell);

    const providerSelect = shell.querySelector('.studio-assistant-provider');
    const promptEl = shell.querySelector('.studio-assistant-prompt');
    const outputEl = shell.querySelector('.studio-assistant-output');
    const contextBtn = shell.querySelector('.studio-assistant-context');
    const sendBtn = shell.querySelector('.studio-assistant-send');

    const presetPrompts = {
      producer: 'Act like a senior music producer using CONFUstudio. Turn the current project into a stronger track with concrete next moves in sequencing, sound, scenes, arrangement, and mix.',
      sound: 'Act like a sound designer. Use CONFUsynth and the studio tools to design a distinctive patch or sample treatment for the current context.',
      arrangement: 'Act like an arrangement producer. Suggest a full section plan, pattern changes, and scene transitions for the current project.',
      mix: 'Act like a mix engineer and producer. Suggest level, panning, FX send, dynamics, and space moves that fit the current project.',
      workflow: 'Act like a technical studio operator. Give the best next workflow steps inside CONFUstudio page by page, using the current project context.'
    };

    shell.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const text = presetPrompts[button.dataset.preset];
        if (text) promptEl.value = text;
      });
    });

    contextBtn.addEventListener('click', () => {
      promptEl.value = buildAssistantPrompt(buildLiveContext());
      promptEl.focus();
    });

    sendBtn.addEventListener('click', async () => {
      const message = promptEl.value.trim();
      if (!message) {
        outputEl.textContent = 'Enter a prompt first.';
        return;
      }
      sendBtn.disabled = true;
      outputEl.textContent = 'Thinking…';
      try {
        const response = await chatAssistant({
          provider: providerSelect.value || 'auto',
          message,
          context: buildLiveContext(),
        });
        outputEl.textContent = response?.text || 'No response text returned.';
      } catch (error) {
        outputEl.textContent = error?.message || 'Assistant request failed.';
      } finally {
        sendBtn.disabled = false;
      }
    });

    try {
      const data = await fetchAssistantProviders();
      const providers = Object.values(data?.providers || {});
      providerSelect.innerHTML = '';
      const autoOption = document.createElement('option');
      autoOption.value = 'auto';
      autoOption.textContent = 'Auto';
      providerSelect.append(autoOption);
      providers.forEach((provider) => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.configured ? provider.label : `${provider.label} (unconfigured)`;
        providerSelect.append(option);
      });
      providerSelect.value = data?.defaultProvider || 'auto';
      const hasConfiguredProvider = providers.some((provider) => provider.configured);
      sendBtn.disabled = !hasConfiguredProvider;
      if (!hasConfiguredProvider) {
        outputEl.textContent = 'Configure an assistant provider before sending prompts.';
      }
    } catch (error) {
      providerSelect.innerHTML = '<option value="auto">Auto</option>';
      sendBtn.disabled = true;
      outputEl.textContent = error?.message || 'Assistant provider metadata is unavailable.';
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
    tools.innerHTML = `<button class="module-remove-btn" type="button" title="Remove module">×</button>`;
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
    // Add corner resize handles
    ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
      const handle = document.createElement('div');
      handle.className = `module-resize-handle module-resize-${corner}`;
      modEl.appendChild(handle);
    });
    enableModuleResize(modEl);
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

  function enableModuleResize(modEl) {
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
        naturalW = rect.width / startZoom / Math.max(scale, 0.001);
        naturalH = rect.height / startZoom / Math.max(scale, 0.001);
      });

      handle.addEventListener('pointermove', (e) => {
        if (!resizing || e.pointerId !== pointerId) return;
        const dx = (e.clientX - startX) * xDir / Math.max(scale, 0.001);
        const dy = (e.clientY - startY) * yDir / Math.max(scale, 0.001);
        const diag = Math.sqrt(naturalW ** 2 + naturalH ** 2) || 1;
        const delta = (dx + dy) / 2;
        const newZoom = Math.max(0.3, Math.min(3, startZoom + (delta / diag) * startZoom));
        modEl.style.zoom = newZoom;
      });

      const stopResize = (e) => {
        if (!resizing || e.pointerId !== pointerId) return;
        resizing = false;
        pointerId = null;
        saveLayout();
      };

      handle.addEventListener('pointerup', stopResize);
      handle.addEventListener('pointercancel', stopResize);
    });
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
    } else if (type === 'acid_machine') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:680px;height:340px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Acid Machine…</div>';
      import('./modules/acid_machine.js').then((m) => {
        const ctx = window._confusynthEngine?.context ?? null;
        mod.innerHTML = '';
        mod.appendChild(m.createAcidMachine(ctx));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type === 'polysynth') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:860px;height:240px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Polysynth…</div>';
      import('./modules/polysynth.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createPolysynth(window._confusynthEngine?.context ?? null));
        attachModuleChrome(mod);
        if (mod === getSelectedModule()) updateSelectionUi();
      });
    } else if (type === 'drum_machine') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:920px;height:320px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Drum Machine…</div>';
      import('./modules/drum_machine.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createDrumMachine(window._confusynthEngine?.context ?? null));
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
    } else if (type === 'monosynth') {
      mod.innerHTML = '<div class="module-loading-shell" style="width:1000px;height:300px;display:flex;align-items:center;justify-content:center;font-family:monospace;color:#666">Loading Monosynth…</div>';
      import('./modules/monosynth.js').then(m => {
        mod.innerHTML = '';
        mod.appendChild(m.createMonosynth(window._confusynthEngine?.context ?? null));
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

  const zoomInBtn  = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  if (!zoomInBtn)  console.warn('[studio] #zoom-in button not found');
  if (!zoomOutBtn) console.warn('[studio] #zoom-out button not found');
  zoomInBtn?.addEventListener('click', () => {
    _userHasPanned = true;
    const { width, height } = getWrapSize();
    zoomBy(1.08, width / 2, height / 2);
  });
  zoomOutBtn?.addEventListener('click', () => {
    _userHasPanned = true;
    const { width, height } = getWrapSize();
    zoomBy(1 / 1.08, width / 2, height / 2);
  });
  document.getElementById('fit-all')?.addEventListener('click', () => {
    _userHasPanned = false;
    fitToWindow({ force: true });
  });
  const autoZoomBtn = document.getElementById('auto-zoom');
  autoZoomBtn?.addEventListener('click', () => {
    _autoZoom = !_autoZoom;
    autoZoomBtn.textContent = _autoZoom ? 'Auto' : 'Free';
    autoZoomBtn.title = _autoZoom
      ? 'Auto-fit is on and the studio recenters itself on resize'
      : 'Manual view is on and the studio stays where you leave it';
    autoZoomBtn.style.color = _autoZoom ? '' : 'rgba(255,255,255,0.35)';
    if (_autoZoom) {
      _userHasPanned = false;
      fitToWindow({ force: true });
    }
  });
  document.getElementById('add-module')?.addEventListener('click', showModulePicker);
  document.getElementById('open-manual')?.addEventListener('click', openManualOverlay);
  document.getElementById('open-assistant')?.addEventListener('click', openAssistantOverlay);
  getLensToggleButton()?.addEventListener('click', () => {
    setZoomLensEnabled(!_zoomLensEnabled);
  });
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
    if (e.key === 'Escape' && _studioOverlay && !_studioOverlay.classList.contains('hidden')) {
      e.preventDefault();
      closeStudioOverlay();
      return;
    }
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

  // Capture wheel gestures before nested UI surfaces can consume them so
  // trackpad panning stays consistent across the synth chrome.
  wrap.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // ctrl+scroll or meta+scroll → zoom
      const rect = wrap.getBoundingClientRect();
      zoomBy(e.deltaY > 0 ? 0.96 : 1.04, e.clientX - rect.left, e.clientY - rect.top);
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
      panX += e.deltaX;
      panY += e.deltaY;
      clampViewport();
    }
  }, { passive: false, capture: true });

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
    if (_zoomLensEnabled) scheduleZoomLensRefresh();
  });

  wrap.addEventListener('pointermove', (e) => {
    _zoomLensLastPoint = { clientX: e.clientX, clientY: e.clientY };
    if (!_zoomLensEnabled || e.pointerType === 'touch' || wrap.classList.contains('is-panning')) {
      hideZoomLens();
      return;
    }
    const hoveredModule = e.target.closest('.studio-module');
    if (!hoveredModule || shouldHideLensForTarget(e.target)) {
      hideZoomLens();
      return;
    }
    showZoomLens();
    positionZoomLens(e.clientX, e.clientY);
  });

  wrap.addEventListener('pointerleave', hideZoomLens);
  wrap.addEventListener('pointerdown', () => {
    hideZoomLens();
  });

  updateLensToggleButton();
  if (_zoomLensEnabled) createZoomLens();
}
