// cables.js — SVG bezier patch cable system

const CABLE_COLORS = [
  '#ff4444', // red
  '#44ff88', // green
  '#44aaff', // blue
  '#ffdd44', // yellow
  '#ff44dd', // magenta
  '#44ffdd', // cyan
  '#ff8844', // orange
  '#aa44ff', // purple
];
export const STUDIO_CABLES_KEY = 'confustudio-studio-cables-v1';

let _colorIdx = 0;
function nextColor() {
  return CABLE_COLORS[_colorIdx++ % CABLE_COLORS.length];
}

export function initCables() {
  const studioWrap = document.getElementById('studio-wrap');
  if (!studioWrap) return;

  // Create SVG overlay that covers the entire studio-wrap
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'studio-cables';
  svg.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    z-index: 500;
    overflow: visible;
  `;
  studioWrap.appendChild(svg);

  // Defs with port hover style (no glow filter — using layered strokes instead)
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <style>
      .port-hover {
        outline: 2px solid #f0c640;
        outline-offset: 2px;
        border-radius: 50%;
      }
    </style>
  `;
  svg.appendChild(defs);

  const cables = []; // { id, fromEl, toEl, color, group }
  let dragging = null; // { fromEl, color, tempPath, tempDot, pointerId }
  let pendingCableRestore = [];
  let cableRestoreTimer = null;
  let cableRestoreAttempts = 0;

  function portRef(el) {
    const moduleEl = el?.closest?.('.studio-module');
    const portName = el?.dataset?.port;
    if (!moduleEl?.id || !portName) return null;
    const matchingPorts = [...moduleEl.querySelectorAll('.port, .djm-port')].filter(
      (port) => port.dataset.port === portName,
    );
    return {
      moduleId: moduleEl.id,
      port: portName,
      index: Math.max(0, matchingPorts.indexOf(el)),
    };
  }

  function resolvePortRef(ref) {
    if (!ref?.moduleId || !ref?.port) return null;
    const moduleEl = document.getElementById(ref.moduleId);
    if (!moduleEl?.classList?.contains('studio-module')) return null;
    const matchingPorts = [...moduleEl.querySelectorAll('.port, .djm-port')].filter(
      (port) => port.dataset.port === ref.port,
    );
    return matchingPorts[ref.index || 0] || matchingPorts[0] || null;
  }

  function cableMatchesRef(cable, saved) {
    const from = portRef(cable.fromEl);
    const to = portRef(cable.toEl);
    return (
      from?.moduleId === saved?.from?.moduleId &&
      from?.port === saved?.from?.port &&
      (from?.index || 0) === (saved?.from?.index || 0) &&
      to?.moduleId === saved?.to?.moduleId &&
      to?.port === saved?.to?.port &&
      (to?.index || 0) === (saved?.to?.index || 0)
    );
  }

  function serializeCable(cable) {
    const from = portRef(cable.fromEl);
    const to = portRef(cable.toEl);
    if (!from || !to) return null;
    return {
      id: cable.id,
      color: cable.color,
      from,
      to,
    };
  }

  function saveCables() {
    try {
      const saved = cables.map(serializeCable).filter(Boolean);
      localStorage.setItem(STUDIO_CABLES_KEY, JSON.stringify(saved));
    } catch (_) {}
  }

  function scheduleCableRestore() {
    if (!pendingCableRestore.length || cableRestoreTimer) return;
    cableRestoreTimer = window.setTimeout(() => {
      cableRestoreTimer = null;
      restorePendingCables();
    }, 160);
  }

  function restorePendingCables() {
    if (!pendingCableRestore.length) return;
    let restoredAny = false;
    pendingCableRestore = pendingCableRestore.filter((saved) => {
      if (cables.some((cable) => cableMatchesRef(cable, saved))) return false;
      const fromEl = resolvePortRef(saved.from);
      const toEl = resolvePortRef(saved.to);
      if (!fromEl || !toEl) return true;
      addCable(fromEl, toEl, {
        id: saved.id,
        color: saved.color,
        persist: false,
      });
      restoredAny = true;
      return false;
    });
    if (restoredAny) saveCables();
    if (pendingCableRestore.length && cableRestoreAttempts < 40) {
      cableRestoreAttempts += 1;
      scheduleCableRestore();
    }
  }

  function loadSavedCables() {
    try {
      const raw = localStorage.getItem(STUDIO_CABLES_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      pendingCableRestore = saved.filter((entry) => entry?.from && entry?.to);
      cableRestoreAttempts = 0;
      scheduleCableRestore();
    } catch (_) {}
  }

  function getPortAnchor(el, wr) {
    const er = el.getBoundingClientRect();
    const isMixerPort = el.classList.contains('djm-port');
    const hasJackHole = el.classList.contains('port') || isMixerPort;
    const holeOffsetX = hasJackHole ? 10 : er.width / 2;
    const baseX = er.left - wr.left + Math.min(holeOffsetX, er.width / 2);
    const baseY = er.top - wr.top + er.height / 2;
    return { x: baseX, y: baseY };
  }

  // Get center of a port element in studio-wrap coordinates
  function portCenter(el) {
    const wr = studioWrap.getBoundingClientRect();
    return getPortAnchor(el, wr);
  }

  function getBezierGeometry(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);

    // Lift cables above the modules so they arc around the chassis instead of
    // drooping over the screens and controls.
    const lift = Math.min(180, Math.max(56, dist * 0.35));
    const topY = Math.min(y1, y2) - lift;
    const spread = Math.min(56, Math.max(20, dist * 0.12));

    const cp1x = x1 + dx * 0.2 - spread;
    const cp1y = topY;
    const cp2x = x2 - dx * 0.2 + spread;
    const cp2y = topY;

    return {
      start: { x: x1, y: y1 },
      cp1: { x: cp1x, y: cp1y },
      cp2: { x: cp2x, y: cp2y },
      end: { x: x2, y: y2 },
      d: `M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`,
    };
  }

  function bezierTangent(geom, t) {
    const mt = 1 - t;
    const dx =
      3 * mt * mt * (geom.cp1.x - geom.start.x) +
      6 * mt * t * (geom.cp2.x - geom.cp1.x) +
      3 * t * t * (geom.end.x - geom.cp2.x);
    const dy =
      3 * mt * mt * (geom.cp1.y - geom.start.y) +
      6 * mt * t * (geom.cp2.y - geom.cp1.y) +
      3 * t * t * (geom.end.y - geom.cp2.y);
    return { x: dx, y: dy };
  }

  function plugRotationFromVector(vx, vy) {
    return (Math.atan2(vy, vx) * 180) / Math.PI - 90;
  }

  // Create a 6.35mm TS audio jack plug SVG group at (x, y), upright
  function createJackPlug(color) {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'cable-plug');
    g.style.pointerEvents = 'none';

    // Black metal body (sleeve)
    const sleeve = document.createElementNS(NS, 'rect');
    sleeve.setAttribute('x', '-5');
    sleeve.setAttribute('y', '-16');
    sleeve.setAttribute('width', '10');
    sleeve.setAttribute('height', '16');
    sleeve.setAttribute('rx', '3');
    sleeve.setAttribute('ry', '3');
    sleeve.setAttribute('fill', '#1a1a1a');
    g.appendChild(sleeve);

    // Colored collar band matching cable color
    const collar = document.createElementNS(NS, 'rect');
    collar.setAttribute('x', '-5');
    collar.setAttribute('y', '-9');
    collar.setAttribute('width', '10');
    collar.setAttribute('height', '4');
    collar.setAttribute('fill', color);
    collar.setAttribute('opacity', '0.9');
    g.appendChild(collar);

    // Tip ring insulator (dark band)
    const insulator = document.createElementNS(NS, 'rect');
    insulator.setAttribute('x', '-4');
    insulator.setAttribute('y', '-13');
    insulator.setAttribute('width', '8');
    insulator.setAttribute('height', '2');
    insulator.setAttribute('fill', '#0a0a0a');
    g.appendChild(insulator);

    // Shiny metal tip (outer)
    const tipOuter = document.createElementNS(NS, 'ellipse');
    tipOuter.setAttribute('cx', '0');
    tipOuter.setAttribute('cy', '-16');
    tipOuter.setAttribute('rx', '4');
    tipOuter.setAttribute('ry', '3.5');
    tipOuter.setAttribute('fill', '#888');
    g.appendChild(tipOuter);

    // Shiny metal tip (inner highlight)
    const tipInner = document.createElementNS(NS, 'ellipse');
    tipInner.setAttribute('cx', '0');
    tipInner.setAttribute('cy', '-16');
    tipInner.setAttribute('rx', '2');
    tipInner.setAttribute('ry', '1.5');
    tipInner.setAttribute('fill', '#bbb');
    g.appendChild(tipInner);

    // Body highlight
    const highlight = document.createElementNS(NS, 'rect');
    highlight.setAttribute('x', '-1.5');
    highlight.setAttribute('y', '-15');
    highlight.setAttribute('width', '3');
    highlight.setAttribute('height', '12');
    highlight.setAttribute('rx', '1.5');
    highlight.setAttribute('fill', 'rgba(255,255,255,0.08)');
    g.appendChild(highlight);

    return g;
  }

  // Build the three-layer cable path set inside a group; returns { group, shadow, body, shine }
  function createCableLayers(color) {
    const NS = 'http://www.w3.org/2000/svg';

    const shadow = document.createElementNS(NS, 'path');
    shadow.setAttribute('fill', 'none');
    shadow.setAttribute('stroke', 'rgba(0,0,0,0.6)');
    shadow.setAttribute('stroke-width', '5.5');
    shadow.setAttribute('stroke-linecap', 'round');
    shadow.style.pointerEvents = 'none';

    const body = document.createElementNS(NS, 'path');
    body.setAttribute('fill', 'none');
    body.setAttribute('stroke', color);
    body.setAttribute('stroke-width', '3.5');
    body.setAttribute('stroke-linecap', 'round');
    body.style.pointerEvents = 'stroke';
    body.style.cursor = 'pointer';

    const shine = document.createElementNS(NS, 'path');
    shine.setAttribute('fill', 'none');
    shine.setAttribute('stroke', 'rgba(255,255,255,0.22)');
    shine.setAttribute('stroke-width', '1.5');
    shine.setAttribute('stroke-linecap', 'round');
    shine.style.pointerEvents = 'none';

    return { shadow, body, shine };
  }

  function setLayerPath(layers, d) {
    layers.shadow.setAttribute('d', d);
    layers.body.setAttribute('d', d);
    layers.shine.setAttribute('d', d);
  }

  function drawCable(cable) {
    if (!cable.fromEl?.isConnected || !cable.toEl?.isConnected) {
      removeCable(cable);
      return;
    }
    const a = portCenter(cable.fromEl);
    const b = portCenter(cable.toEl);
    const geom = getBezierGeometry(a.x, a.y, b.x, b.y);
    setLayerPath(cable.layers, geom.d);

    const startTangent = bezierTangent(geom, 0.02);
    const endTangent = bezierTangent(geom, 0.98);
    const fromAngle = plugRotationFromVector(startTangent.x, startTangent.y);
    const toAngle = plugRotationFromVector(-endTangent.x, -endTangent.y);

    // Shift local geometry so the plug tip, not the cable sleeve, lands on the jack.
    cable.plugFrom.setAttribute('transform', `translate(${a.x},${a.y}) rotate(${fromAngle}) translate(0,16)`);
    cable.plugTo.setAttribute('transform', `translate(${b.x},${b.y}) rotate(${toAngle}) translate(0,16)`);
  }

  function addCable(fromEl, toEl, options = {}) {
    const {
      id = `cable-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      color = nextColor(),
      persist = true,
    } = options;
    const savedRef = { from: portRef(fromEl), to: portRef(toEl) };
    const existingCable = cables.find((cable) => cableMatchesRef(cable, savedRef));
    if (existingCable) return existingCable;

    const NS = 'http://www.w3.org/2000/svg';

    // Wrapping group for the whole cable
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'cable-group');

    const layers = createCableLayers(color);
    group.appendChild(layers.shadow);
    group.appendChild(layers.body);
    group.appendChild(layers.shine);

    const plugFrom = createJackPlug(color);
    const plugTo = createJackPlug(color);
    group.appendChild(plugFrom);
    group.appendChild(plugTo);

    svg.appendChild(group);

    const cable = { id, fromEl, toEl, color, group, layers, plugFrom, plugTo };
    cables.push(cable);
    drawCable(cable);

    // Audio routing: if connecting synth audio-out to DJ mixer input
    const fromPort = fromEl.closest('.studio-module');
    const toPort = toEl.closest('.studio-module');
    const toType = toEl.textContent.trim().toLowerCase();

    if (fromPort && toPort) {
      const engine = window._confustudioEngine;
      const djmixer = toPort.querySelector('[data-djm]') || fromPort.querySelector('[data-djm]');

      if (engine && djmixer?._djmAudio) {
        const audio = djmixer._djmAudio;
        const isCh1 = toType.includes('ch1') || toType.includes('1');
        const targetInput = isCh1 ? audio.ch1Input : audio.ch2Input;
        // Disconnect engine from destination, connect to DJ mixer input
        const sourceNode = engine.mainOutput ?? engine.master;
        const destinationNode = engine.context.destination;
        try {
          sourceNode.disconnect(destinationNode);
        } catch (_) {}
        try {
          sourceNode.connect(targetInput);
        } catch (e) {
          console.warn('[cables] audio routing failed:', e.message);
        }
        // DJ mixer already connects to destination via masterGain
        cable._audioRouted = true;
        cable._engine = engine;
        cable._sourceNode = sourceNode;
        cable._destinationNode = destinationNode;
        cable._targetInput = targetInput;
        cable._djmAudio = audio;
      }
    }

    // Notify listeners that a cable was connected
    document.dispatchEvent(
      new CustomEvent('cable:connected', {
        detail: { fromEl, toEl, fromPort: fromEl.dataset.port, toPort: toEl.dataset.port },
      }),
    );

    // Right-click on body to remove cable
    layers.body.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      removeCable(cable);
    });

    if (persist) saveCables();
    return cable;
  }

  function removeCable(cable, { persist = true } = {}) {
    if (!cable) return;
    if (cable._audioRouted && cable._engine && cable._sourceNode) {
      try {
        cable._sourceNode.disconnect(cable._targetInput);
      } catch (_) {}
      const remainingAudioRoutes = cables.some(
        (entry) => entry !== cable && entry._audioRouted && entry._sourceNode === cable._sourceNode,
      );
      if (!remainingAudioRoutes) {
        try {
          cable._sourceNode.connect(cable._destinationNode ?? cable._engine.context.destination);
        } catch (_) {}
      }
    }
    cable.group?.remove();
    const idx = cables.indexOf(cable);
    if (idx >= 0) cables.splice(idx, 1);
    if (persist) saveCables();
  }

  // Port hover: add glow class
  function onPortEnter(e) {
    e.currentTarget.classList.add('port-hover');
  }
  function onPortLeave(e) {
    e.currentTarget.classList.remove('port-hover');
  }

  // Port mousedown: start dragging a cable
  function onPortDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const NS = 'http://www.w3.org/2000/svg';
    const fromEl = e.currentTarget;
    const color = nextColor();

    // Dashed drag preview: single path + plug at origin
    const tempPath = document.createElementNS(NS, 'path');
    tempPath.setAttribute('fill', 'none');
    tempPath.setAttribute('stroke', color);
    tempPath.setAttribute('stroke-width', '3.5');
    tempPath.setAttribute('stroke-linecap', 'round');
    tempPath.setAttribute('stroke-dasharray', '6 4');
    tempPath.setAttribute('opacity', '0.85');
    tempPath.style.pointerEvents = 'none';

    const tempPlug = createJackPlug(color);

    svg.appendChild(tempPath);
    svg.appendChild(tempPlug);

    dragging = { fromEl, color, tempPath, tempPlug, pointerId: e.pointerId ?? null };
  }

  function updateDraggingCable(clientX, clientY) {
    if (!dragging) return;
    const wr = studioWrap.getBoundingClientRect();
    const mx = clientX - wr.left;
    const my = clientY - wr.top;
    const a = portCenter(dragging.fromEl);
    const geom = getBezierGeometry(a.x, a.y, mx, my);
    dragging.tempPath.setAttribute('d', geom.d);
    const startTangent = bezierTangent(geom, 0.02);
    const angle = plugRotationFromVector(startTangent.x, startTangent.y);
    dragging.tempPlug.setAttribute('transform', `translate(${a.x},${a.y}) rotate(${angle}) translate(0,16)`);
  }

  function cancelDraggingCable() {
    if (!dragging) return;
    dragging.tempPath?.remove();
    dragging.tempPlug?.remove();
    dragging = null;
  }

  function finishDraggingCable(clientX, clientY) {
    if (!dragging) return;
    dragging.tempPath.remove();
    dragging.tempPlug.remove();

    const toEl = document.elementFromPoint(clientX, clientY)?.closest('.port, .djm-port');
    if (toEl && toEl !== dragging.fromEl) {
      // Don't allow connecting a port to itself on the same module
      const fromMod = dragging.fromEl.closest('.studio-module');
      const toMod = toEl.closest('.studio-module');
      if (fromMod !== toMod || fromMod === null) {
        addCable(dragging.fromEl, toEl);
      }
    }
    dragging = null;
  }

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (dragging.pointerId != null && e.pointerId !== dragging.pointerId) return;
    updateDraggingCable(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    if (dragging.pointerId != null && e.pointerId !== dragging.pointerId) return;
    finishDraggingCable(e.clientX, e.clientY);
  });

  window.addEventListener('pointercancel', (e) => {
    if (!dragging) return;
    if (dragging.pointerId != null && e.pointerId !== dragging.pointerId) return;
    finishDraggingCable(e.clientX, e.clientY);
  });

  // Expose redraw for external callers (e.g. module drag)
  function redrawAllCables() {
    for (const cable of cables) drawCable(cable);
  }
  window.__CONFUSTUDIO__.redrawCables = redrawAllCables;

  // Redraw cables when modules move (on animation frame)
  function tick() {
    redrawAllCables();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Attach to all current and future ports
  function attachPort(port) {
    if (port._cablesAttached) return;
    port._cablesAttached = true;
    port.style.cursor = 'crosshair';
    port.addEventListener('mouseenter', onPortEnter);
    port.addEventListener('mouseleave', onPortLeave);
    port.addEventListener('pointerdown', onPortDown);
  }

  // Observe for new ports (when modules are added dynamically)
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.port, .djm-port').forEach(attachPort);
    restorePendingCables();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.port, .djm-port').forEach(attachPort);
  loadSavedCables();

  // Auto-connect handler (used for pre-wired first-run setup)
  document.addEventListener('cable:autoconnect', (e) => {
    const { fromEl, toEl } = e.detail;
    if (fromEl && toEl) addCable(fromEl, toEl);
  });

  document.addEventListener('module:removed', (e) => {
    const moduleEl = e.detail?.moduleEl;
    if (!moduleEl) return;
    if (dragging && moduleEl.contains(dragging.fromEl)) {
      cancelDraggingCable();
    }
    cables.filter((cable) => moduleEl.contains(cable.fromEl) || moduleEl.contains(cable.toEl)).forEach(removeCable);
  });
}
