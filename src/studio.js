import {
  addModule,
  applySavedLayoutItem,
  applyTransform,
  attachModuleChrome,
  buildLiveContext,
  clampViewport,
  closeModulePicker,
  enableModuleDrag,
  fitToWindow,
  getSelectedModule,
  getWrapSize,
  isModuleInteractiveTarget,
  moduleById,
  removeModule,
  saveView,
  selectModule,
  shouldHideLensForTarget,
  shouldStudioCaptureGesture,
  showModulePicker,
  MIN_SCALE,
  MAX_SCALE,
  STUDIO_VIEW_KEY,
  STUDIO_LAYOUT_KEY,
} from './studio-modules.js';

import { getOverlay, closeOverlay, openManualOverlay, openAssistantOverlay } from './studio-overlay.js';

// studio.js — studio canvas: zoom, pan, module placement
export function initStudio() {
  const wrap = document.getElementById('studio-wrap');
  const canvas = document.getElementById('studio-canvas');
  if (!wrap || !canvas) return;

  const S = {
    wrap,
    canvas,
    scale: 1,
    panX: 0,
    panY: 0,
    hasRestoredView: false,
    hasRestoredLayout: false,
    _userHasPanned: false,
    _autoZoom: true,
    _selectedModule: null,
    _restoredSelectedModuleId: null,
    hideZoomLens: null,
    scheduleZoomLensRefresh: null,
  };

  const ZOOM_LENS_KEY = 'confustudio-zoom-lens-v2';
  const ZOOM_LENS_SIZE = 480;
  const ZOOM_LENS_SCALE = 1.085;

  let _zoomLensEnabled = false;
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
  let _suppressLensUntil = 0;

  try {
    const savedLensPref = localStorage.getItem(ZOOM_LENS_KEY);
    if (savedLensPref != null) _zoomLensEnabled = savedLensPref !== '0';
  } catch (_) {}

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
    const left = clientX - ZOOM_LENS_SIZE / 2;
    const top = clientY - ZOOM_LENS_SIZE / 2;
    const lensCenterX = ZOOM_LENS_SIZE / 2;
    const lensCenterY = ZOOM_LENS_SIZE / 2;

    _zoomLensTargetLeft = left;
    _zoomLensTargetTop = top;
    _zoomLensCurrentLeft = left;
    _zoomLensCurrentTop = top;
    _zoomLensHost.style.transform = `translate(${left}px, ${top}px)`;
    _zoomLensClone.style.transformOrigin = '0 0';
    _zoomLensClone.style.transform = `translate(${lensCenterX - clientX * ZOOM_LENS_SCALE}px, ${lensCenterY - clientY * ZOOM_LENS_SCALE}px) scale(${ZOOM_LENS_SCALE})`;
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

  S.hideZoomLens = hideZoomLens;
  S.scheduleZoomLensRefresh = scheduleZoomLensRefresh;

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
        if (
          (horizontalDirection < 0 && node.scrollLeft > 0) ||
          (horizontalDirection > 0 && node.scrollLeft < maxScrollLeft)
        ) {
          return node;
        }
      }

      node = node.parentElement;
    }

    return null;
  }

  function zoomBy(factor, cx, cy) {
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, S.scale * factor));
    if (newScale === S.scale) return;
    const ratio = newScale / S.scale;
    S.panX = cx - ratio * (cx - S.panX);
    S.panY = cy - ratio * (cy - S.panY);
    S.scale = newScale;
    clampViewport(S);
  }

  function restoreView() {
    try {
      const raw = localStorage.getItem(STUDIO_VIEW_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return false;
      S.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(saved.scale) || 1));
      S.panX = Number(saved.panX) || 0;
      S.panY = Number(saved.panY) || 0;
      if (saved.autoZoom !== undefined) S._autoZoom = saved.autoZoom;
      S.hasRestoredView = true;
      applyTransform(S);
      const autoZoomBtn = document.getElementById('auto-zoom');
      if (autoZoomBtn) {
        autoZoomBtn.textContent = S._autoZoom ? 'Auto Fit' : 'Manual';
        autoZoomBtn.title = S._autoZoom
          ? 'Auto-fit is on and the studio recenters itself on resize'
          : 'Manual view is on and the studio stays where you leave it';
        autoZoomBtn.style.color = S._autoZoom ? '' : 'rgba(255,255,255,0.35)';
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
        if (!item?.id) return;
        const type = item.type || 'synth';
        let mod = moduleById(S, item.id);
        if (!mod && item.id !== 'module-0') {
          mod = addModule(S, type, {
            id: item.id,
            left: item.left,
            top: item.top,
            zoom: item.zoom,
            select: false,
            fit: false,
            persist: false,
          });
        }
        if (!mod) return;
        applySavedLayoutItem(mod, item);
        if (item.selected) S._restoredSelectedModuleId = item.id;
      });
      S.hasRestoredLayout = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  // Attach drag to the pre-existing module-0 (main synth)
  const module0 = canvas.querySelector('#module-0');
  if (module0) {
    if (!module0.style.left) module0.style.left = '40px';
    if (!module0.style.top) module0.style.top = '40px';
    module0.style.position = 'absolute';
    enableModuleDrag(S, module0);
    attachModuleChrome(S, module0);
  }

  const hasLayout = restoreLayout();
  restoreView();
  const initialSelection =
    (S._restoredSelectedModuleId && canvas.querySelector(`#${S._restoredSelectedModuleId}`)) ||
    canvas.querySelector('#module-0') ||
    canvas.querySelector('.studio-module');
  if (initialSelection) selectModule(S, initialSelection, { focus: false });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      fitToWindow(S, { force: true });
    }),
  );

  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  if (!zoomInBtn) console.warn('[studio] #zoom-in button not found');
  if (!zoomOutBtn) console.warn('[studio] #zoom-out button not found');
  zoomInBtn?.addEventListener('click', () => {
    S._userHasPanned = true;
    const { width, height } = getWrapSize(S);
    zoomBy(1.08, width / 2, height / 2);
  });
  zoomOutBtn?.addEventListener('click', () => {
    S._userHasPanned = true;
    const { width, height } = getWrapSize(S);
    zoomBy(1 / 1.08, width / 2, height / 2);
  });
  document.getElementById('fit-all')?.addEventListener('click', () => {
    S._userHasPanned = false;
    fitToWindow(S, { force: true });
  });
  const autoZoomBtn = document.getElementById('auto-zoom');
  autoZoomBtn?.addEventListener('click', () => {
    S._autoZoom = !S._autoZoom;
    autoZoomBtn.textContent = S._autoZoom ? 'Auto' : 'Free';
    autoZoomBtn.title = S._autoZoom
      ? 'Auto-fit is on and the studio recenters itself on resize'
      : 'Manual view is on and the studio stays where you leave it';
    autoZoomBtn.style.color = S._autoZoom ? '' : 'rgba(255,255,255,0.35)';
    if (S._autoZoom) {
      S._userHasPanned = false;
      fitToWindow(S, { force: true });
    }
  });
  document.getElementById('add-module')?.addEventListener('click', () => showModulePicker(S));
  document.getElementById('open-manual')?.addEventListener('click', () => openManualOverlay(hideZoomLens));
  document
    .getElementById('open-assistant')
    ?.addEventListener('click', () => openAssistantOverlay(hideZoomLens, () => buildLiveContext(S)));
  getLensToggleButton()?.addEventListener('click', () => {
    setZoomLensEnabled(!_zoomLensEnabled);
  });
  document.getElementById('remove-module')?.addEventListener('click', () => {
    const selected = getSelectedModule(S);
    if (selected && selected.id !== 'module-0') {
      removeModule(S, selected);
    }
  });

  canvas.addEventListener('click', (e) => {
    const clickedModule = e.target.closest('.studio-module');
    if (clickedModule && !isModuleInteractiveTarget(e.target)) {
      selectModule(S, clickedModule, { focus: false });
    }
    if (e.target.closest('.chassis-dup-btn')) {
      e.preventDefault();
      addModule(S, 'synth');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#studio-controls, #module-picker')) closeModulePicker();
    if (!e.target.closest('.studio-module') && !e.target.closest('#studio-controls, #module-picker')) {
      selectModule(S, null, { focus: false });
    }
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (e.key === 'Escape' && getOverlay() && !getOverlay().classList.contains('hidden')) {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      getSelectedModule(S) &&
      getSelectedModule(S).id !== 'module-0'
    ) {
      e.preventDefault();
      removeModule(S, getSelectedModule(S));
    }
  });

  // Capture wheel gestures before nested UI surfaces can consume them so
  // trackpad panning stays consistent across the synth chrome.
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // ctrl+scroll or meta+scroll → zoom
        const rect = wrap.getBoundingClientRect();
        zoomBy(e.deltaY > 0 ? 0.96 : 1.04, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const studioGesture = shouldStudioCaptureGesture(S, e.target);
        const scrollable = studioGesture ? null : getScrollableAncestor(e.target, e.deltaY, e.deltaX);
        if (!studioGesture && scrollable) {
          return;
        }
        e.preventDefault();
        // Two-finger trackpad scroll pans the studio unless the gesture started in
        // a scrollable editor/control that should own the movement.
        S._userHasPanned = true;
        S.panX += e.deltaX;
        S.panY += e.deltaY;
        clampViewport(S);
      }
    },
    { passive: false, capture: true },
  );

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
      S._userHasPanned = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = S.panX;
      panStartPanY = S.panY;
      wrap.classList.add('is-panning');
      wrap.classList.add('panning');
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    S.panX = panStartPanX + (e.clientX - panStartX);
    S.panY = panStartPanY + (e.clientY - panStartY);
    clampViewport(S);
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

  wrap.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) {
        touchMode = 'pinch';
        touchDist0 = touchDist(e.touches[0], e.touches[1]);
        touchScaleStart = S.scale;
        const mid = touchMid(e.touches[0], e.touches[1]);
        touchMidX = mid.x;
        touchMidY = mid.y;
        e.preventDefault();
        return;
      }

      const onBackground = e.target === wrap || e.target === canvas;
      if (e.touches.length === 1 && onBackground) {
        touchMode = 'pan';
        S._userHasPanned = true;
        touchMidX = e.touches[0].clientX;
        touchMidY = e.touches[0].clientY;
      }
    },
    { passive: false },
  );

  wrap.addEventListener(
    'touchmove',
    (e) => {
      if (touchMode === 'pinch' && e.touches.length === 2) {
        const rect = wrap.getBoundingClientRect();
        const dist = touchDist(e.touches[0], e.touches[1]);
        const mid = touchMid(e.touches[0], e.touches[1]);
        const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, touchScaleStart * (dist / Math.max(touchDist0, 1))));
        const ratio = nextScale / S.scale;
        const cx = mid.x - rect.left;
        const cy = mid.y - rect.top;
        S.panX = cx - ratio * (cx - S.panX);
        S.panY = cy - ratio * (cy - S.panY);
        S.scale = nextScale;
        S.panX += mid.x - touchMidX;
        S.panY += mid.y - touchMidY;
        touchMidX = mid.x;
        touchMidY = mid.y;
        clampViewport(S);
        e.preventDefault();
        return;
      }

      if (touchMode === 'pan' && e.touches.length === 1) {
        const touch = e.touches[0];
        S.panX += touch.clientX - touchMidX;
        S.panY += touch.clientY - touchMidY;
        touchMidX = touch.clientX;
        touchMidY = touch.clientY;
        clampViewport(S);
        e.preventDefault();
      }
    },
    { passive: false },
  );

  wrap.addEventListener(
    'touchend',
    () => {
      if (touchMode === 'pinch') {
        saveView(S);
      }
      if (touchMode === 'pan') {
        saveView(S);
      }
      touchMode = null;
    },
    { passive: true },
  );

  window.addEventListener('resize', () => {
    if (S._autoZoom) {
      S._userHasPanned = false;
      fitToWindow(S);
    } else {
      clampViewport(S);
    }
    if (_zoomLensEnabled) scheduleZoomLensRefresh();
  });

  wrap.addEventListener('pointermove', (e) => {
    _zoomLensLastPoint = { clientX: e.clientX, clientY: e.clientY };
    if (
      !_zoomLensEnabled ||
      performance.now() < _suppressLensUntil ||
      e.pointerType === 'touch' ||
      wrap.classList.contains('is-panning')
    ) {
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
    _suppressLensUntil = performance.now() + 500;
    hideZoomLens();
  });

  updateLensToggleButton();
  if (_zoomLensEnabled) createZoomLens();
}
