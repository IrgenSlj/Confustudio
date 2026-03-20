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

  // Defs for glow filter
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="cable-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `;
  svg.appendChild(defs);

  const cables = []; // { id, fromEl, toEl, color, path, dot }
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
    const dy = Math.abs(y2 - y1);
    const slack = Math.min(80 + dy * 0.4, 200);
    return `M${x1},${y1} C${x1},${y1 + slack} ${x2},${y2 + slack} ${x2},${y2}`;
  }

  function createCablePath(color) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('filter', 'url(#cable-glow)');
    path.style.pointerEvents = 'stroke';
    path.style.cursor = 'pointer';
    return path;
  }

  function createEndDot(color) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', '5');
    c.setAttribute('fill', color);
    c.setAttribute('filter', 'url(#cable-glow)');
    c.style.pointerEvents = 'none';
    return c;
  }

  function drawCable(cable) {
    const a = portCenter(cable.fromEl);
    const b = portCenter(cable.toEl);
    cable.path.setAttribute('d', makeBezier(a.x, a.y, b.x, b.y));
    cable.dot.setAttribute('cx', b.x);
    cable.dot.setAttribute('cy', b.y);
  }

  function addCable(fromEl, toEl) {
    const color = nextColor();
    const path = createCablePath(color);
    const dot  = createEndDot(color);
    svg.appendChild(path);
    svg.appendChild(dot);
    const cable = { id: Date.now(), fromEl, toEl, color, path, dot };
    cables.push(cable);
    drawCable(cable);

    // Right-click to remove
    path.addEventListener('contextmenu', e => {
      e.preventDefault();
      svg.removeChild(path);
      svg.removeChild(dot);
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
    const fromEl = e.currentTarget;
    const color  = nextColor();
    const tempPath = createCablePath(color);
    const tempDot  = createEndDot(color);
    tempPath.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(tempPath);
    svg.appendChild(tempDot);
    dragging = { fromEl, color, tempPath, tempDot };
  }

  // Mousemove: update dragging cable
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const wr = studioWrap.getBoundingClientRect();
    const mx = e.clientX - wr.left;
    const my = e.clientY - wr.top;
    const a  = portCenter(dragging.fromEl);
    dragging.tempPath.setAttribute('d', makeBezier(a.x, a.y, mx, my));
    dragging.tempDot.setAttribute('cx', mx);
    dragging.tempDot.setAttribute('cy', my);
  });

  // Mouseup: if over a port (different module), connect; else cancel
  window.addEventListener('mouseup', e => {
    if (!dragging) return;
    svg.removeChild(dragging.tempPath);
    svg.removeChild(dragging.tempDot);

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
}
