// cables.js — SVG bezier patch cable system

const CABLE_COLORS = [
  '#f05b52', '#5add71', '#67d7ff', '#f0c640', '#c060d0',
  '#f08040', '#40d0d0', '#d040a0'
];

let _colorIdx = 0;
function nextColor() {
  return CABLE_COLORS[_colorIdx++ % CABLE_COLORS.length];
}

export function initCables() {
  const studioWrap = document.getElementById('studio-wrap');
  if (!studioWrap) return;

  // Create SVG overlay that covers the entire studio-wrap
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'cable-svg';
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
  let dragging = null; // { fromEl, color, tempPath, tempDot }

  // Get center of a port element in studio-wrap coordinates
  function portCenter(el) {
    const wr = studioWrap.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return {
      x: er.left - wr.left + er.width / 2,
      y: er.top  - wr.top  + er.height / 2,
    };
  }

  function makeBezier(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    // Gravity sag: proportional to horizontal distance + minimum
    const sag = Math.max(120, dist * 0.5 + 60);
    // Control points hang below both endpoints
    const cp1y = y1 + sag;
    const cp2y = y2 + sag;
    // Slight horizontal spread so cables don't all stack on top of each other
    const spread = dist * 0.12;
    const cp1x = x1 - spread;
    const cp2x = x2 + spread;
    return `M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`;
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
    shadow.setAttribute('stroke', 'rgba(0,0,0,0.4)');
    shadow.setAttribute('stroke-width', '9');
    shadow.setAttribute('stroke-linecap', 'round');
    shadow.style.pointerEvents = 'none';

    const body = document.createElementNS(NS, 'path');
    body.setAttribute('fill', 'none');
    body.setAttribute('stroke', color);
    body.setAttribute('stroke-width', '5.5');
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
    const a = portCenter(cable.fromEl);
    const b = portCenter(cable.toEl);
    const d = makeBezier(a.x, a.y, b.x, b.y);
    setLayerPath(cable.layers, d);
    // Position plugs
    cable.plugFrom.setAttribute('transform', `translate(${a.x},${a.y})`);
    cable.plugTo.setAttribute('transform', `translate(${b.x},${b.y})`);
  }

  function addCable(fromEl, toEl) {
    const NS = 'http://www.w3.org/2000/svg';
    const color = nextColor();

    // Wrapping group for the whole cable
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'cable-group');

    const layers = createCableLayers(color);
    group.appendChild(layers.shadow);
    group.appendChild(layers.body);
    group.appendChild(layers.shine);

    const plugFrom = createJackPlug(color);
    const plugTo   = createJackPlug(color);
    group.appendChild(plugFrom);
    group.appendChild(plugTo);

    svg.appendChild(group);

    const cable = { id: Date.now(), fromEl, toEl, color, group, layers, plugFrom, plugTo };
    cables.push(cable);
    drawCable(cable);

    // Audio routing: if connecting synth audio-out to DJ mixer input
    const fromPort = fromEl.closest('.studio-module');
    const toPort   = toEl.closest('.studio-module');
    const toType   = toEl.textContent.trim().toLowerCase();

    if (fromPort && toPort) {
      const engine  = window._confusynthEngine;
      const djmixer = toPort.querySelector('[data-djm]') || fromPort.querySelector('[data-djm]');

      if (engine && djmixer?._djmAudio) {
        const audio = djmixer._djmAudio;
        const isCh1 = toType.includes('ch1') || toType.includes('1');
        const targetInput = isCh1 ? audio.ch1Input : audio.ch2Input;
        // Disconnect engine from destination, connect to DJ mixer input
        try {
          engine.master.disconnect(engine.context.destination);
        } catch(e) {}
        engine.master.connect(targetInput);
        // DJ mixer already connects to destination via masterGain
        cable._audioRouted = true;
        cable._engine = engine;
        cable._djmAudio = audio;
      }
    }

    // Right-click on body to remove cable
    layers.body.addEventListener('contextmenu', e => {
      e.preventDefault();
      // Undo audio routing if this cable had routed audio
      if (cable._audioRouted && cable._engine) {
        try { cable._engine.master.disconnect(); } catch(e) {}
        cable._engine.master.connect(cable._engine.context.destination);
      }
      group.remove();
      const idx = cables.indexOf(cable);
      if (idx >= 0) cables.splice(idx, 1);
    });
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
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const NS = 'http://www.w3.org/2000/svg';
    const fromEl = e.currentTarget;
    const color  = nextColor();

    // Dashed drag preview: single path + plug at origin
    const tempPath = document.createElementNS(NS, 'path');
    tempPath.setAttribute('fill', 'none');
    tempPath.setAttribute('stroke', color);
    tempPath.setAttribute('stroke-width', '3');
    tempPath.setAttribute('stroke-linecap', 'round');
    tempPath.setAttribute('stroke-dasharray', '6 4');
    tempPath.setAttribute('opacity', '0.75');
    tempPath.style.pointerEvents = 'none';

    const tempPlug = createJackPlug(color);

    svg.appendChild(tempPath);
    svg.appendChild(tempPlug);

    dragging = { fromEl, color, tempPath, tempPlug };
  }

  // Mousemove: update dragging cable
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const wr = studioWrap.getBoundingClientRect();
    const mx = e.clientX - wr.left;
    const my = e.clientY - wr.top;
    const a  = portCenter(dragging.fromEl);
    dragging.tempPath.setAttribute('d', makeBezier(a.x, a.y, mx, my));
    dragging.tempPlug.setAttribute('transform', `translate(${a.x},${a.y})`);
  });

  // Mouseup: if over a port (different module), connect; else cancel
  window.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging.tempPath.remove();
    dragging.tempPlug.remove();

    const toEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port');
    if (toEl && toEl !== dragging.fromEl) {
      // Don't allow connecting a port to itself on the same module
      const fromMod = dragging.fromEl.closest('.studio-module');
      const toMod   = toEl.closest('.studio-module');
      if (fromMod !== toMod || fromMod === null) {
        addCable(dragging.fromEl, toEl);
      }
    }
    dragging = null;
  });

  // Redraw cables when modules move (on animation frame)
  function tick() {
    for (const cable of cables) drawCable(cable);
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
    port.addEventListener('mousedown', onPortDown);
  }

  // Observe for new ports (when modules are added dynamically)
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.port, .djm-port').forEach(attachPort);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('.port, .djm-port').forEach(attachPort);

  // Auto-connect handler (used for pre-wired first-run setup)
  document.addEventListener('cable:autoconnect', (e) => {
    const { fromEl, toEl } = e.detail;
    if (fromEl && toEl) addCable(fromEl, toEl);
  });
}
