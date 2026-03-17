// src/knobs.js
// CONFUsynth v3 — SVG knob components
// Each knob renders a 270° arc track, an amber-filled value arc, and an indicator dot.

// ─── SVG helpers ──────────────────────────────────────────────────────────────

const CX = 26;
const CY = 26;
const TRACK_R = 18;   // arc radius
const KNOB_R  = 22;   // outer knob rim radius
const IND_R   = 14;   // indicator dot orbit radius (inside rim)

// Total arc span in degrees (start = 225°, end = 315° going clockwise through 270°)
const ARC_DEGREES = 270;
// Arc starts at 225° (7 o'clock) and sweeps clockwise to 315° (5 o'clock)
const ARC_START_DEG = 225;

/**
 * Convert polar (angle in degrees from SVG +x axis, radius) to cartesian.
 * SVG: 0° = right, 90° = down.
 */
function polar(angleDeg, r, cx = CX, cy = CY) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * Build an SVG arc path string.
 * @param {number} angleDeg  End angle in degrees (SVG convention)
 * @param {number} r         Radius
 * @param {number} startDeg  Start angle in degrees
 * @param {boolean} sweep    1 = clockwise, 0 = counter-clockwise
 */
function arcPath(startDeg, endDeg, r) {
  const start = polar(startDeg, r);
  const end   = polar(endDeg,   r);
  // large-arc-flag = 1 if arc spans > 180°
  const span  = ((endDeg - startDeg) + 360) % 360;
  const largeArc = span > 180 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

/**
 * knobSVG(angle)
 *
 * angle: -135 to +135 (linear mapping of value range)
 *   -135 = minimum (arc start, 7 o'clock / 225° SVG)
 *   +135 = maximum (arc end,   5 o'clock / 315° SVG going CW through 270°)
 *
 * SVG arc goes: 225° → 315° clockwise (i.e. the long way, 270°).
 * The value arc fills from 225° to the current angle position.
 *
 * knobAngle (-135..+135) maps to SVG degrees:
 *   svgDeg = 225 + (knobAngle + 135) / 270 * 270  =  225 + (knobAngle + 135)
 *   when knobAngle = -135 → svgDeg = 225  (start)
 *   when knobAngle =    0 → svgDeg = 360 = 0  (top)
 *   when knobAngle = +135 → svgDeg = 495 = 135  ... hmm
 *
 * Actually: the arc goes CW from 225° to (225+270)°=495°=135°.
 * So svgDeg = ARC_START_DEG + (knobAngle + 135) = 225 + knobAngle + 135 = 360 + knobAngle.
 * Normalised: svgEndDeg = (360 + knobAngle) % 360  — but we keep it unnormalised for arc math.
 */
function knobAngleToSvgDeg(knobAngle) {
  // knobAngle ∈ [-135, +135]  →  svgDeg ∈ [225, 495] (clockwise)
  return ARC_START_DEG + (knobAngle + 135);
}

/**
 * Generate the complete knob SVG string.
 * @param {number} angle  Knob angle in [-135, +135]
 * @returns {string} SVG element string
 */
function knobSVG(angle) {
  const clampedAngle = Math.max(-135, Math.min(135, angle));

  // Background track arc: full 270° from 225° to 135° (CW)
  const trackStart = ARC_START_DEG;           // 225°
  const trackEnd   = ARC_START_DEG + ARC_DEGREES; // 495° (= 135° normalised)
  const trackD = arcPath(trackStart, trackEnd, TRACK_R);

  // Value arc: from 225° to current knob position
  const valueEndDeg = knobAngleToSvgDeg(clampedAngle);
  // Only draw value arc if it has some length
  const hasValue = clampedAngle > -135 + 0.5;
  const valueD  = hasValue ? arcPath(trackStart, valueEndDeg, TRACK_R) : '';

  // Indicator dot position: on the knob rim at the current angle
  // knobAngle -135 = 225° SVG, +135 = 135° SVG (via 495°)
  const indDeg = knobAngleToSvgDeg(clampedAngle) % 360;
  const ind = polar(indDeg, IND_R);

  return `<svg class="knob-svg" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="kg-${Math.round(clampedAngle * 10)}" cx="40%" cy="35%">
      <stop offset="0%" stop-color="#3a3a3a"/>
      <stop offset="100%" stop-color="#111"/>
    </radialGradient>
  </defs>
  <!-- Outer rim -->
  <circle cx="${CX}" cy="${CY}" r="${KNOB_R}" fill="#111" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <!-- Track arc (full 270°, background) -->
  <path d="${trackD}" fill="none" stroke="#2a2a2a" stroke-width="3" stroke-linecap="round"/>
  ${hasValue ? `<!-- Value arc (amber, from min to current) -->
  <path d="${valueD}" fill="none" stroke="var(--accent, #f0a500)" stroke-width="3" stroke-linecap="round"/>` : ''}
  <!-- Knob face -->
  <circle cx="${CX}" cy="${CY}" r="14" fill="url(#kg-${Math.round(clampedAngle * 10)})"/>
  <!-- Indicator dot -->
  <circle cx="${ind.x.toFixed(3)}" cy="${ind.y.toFixed(3)}" r="2.5" fill="var(--knob-indicator, #fff)"/>
</svg>`;
}

// ─── Value ↔ angle mapping ─────────────────────────────────────────────────────

/**
 * Map a value within [min, max] to a knob angle in [-135, +135].
 */
function valueToAngle(value, min, max) {
  if (max === min) return -135;
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return -135 + frac * 270;
}

/**
 * Format a numeric knob value for display.
 */
function formatKnobValue(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) < 10) return v.toFixed(2);
  return v.toFixed(1);
}

// ─── Knob element factory ──────────────────────────────────────────────────────

/**
 * Update the SVG and tooltip in a knob wrap element.
 * @param {HTMLElement} wrap
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function updateKnobDisplay(wrap, value, min, max) {
  const angle = valueToAngle(value, min, max);
  const existingSvg = wrap.querySelector('.knob-svg');
  if (existingSvg) {
    // Replace SVG via adjacent insertion to avoid layout churn
    const tmp = document.createElement('div');
    tmp.innerHTML = knobSVG(angle);
    const newSvg = tmp.firstElementChild;
    existingSvg.replaceWith(newSvg);
  }
  const tooltip = wrap.querySelector('.knob-tooltip');
  if (tooltip) tooltip.textContent = formatKnobValue(value);
}

/**
 * Create a draggable knob element.
 * @param {number} index   Index within the knob bank (0-7)
 * @param {object} opts    { label, value, min, max, step }
 * @returns {HTMLElement}
 */
function createKnob(index, { label, value = 0, min = 0, max = 1, step = 0.01 }) {
  const wrap = document.createElement('div');
  wrap.className = 'knob-wrap';
  wrap.dataset.knobIndex = index;

  const angle = valueToAngle(value, min, max);
  wrap.innerHTML = `${knobSVG(angle)}<div class="knob-label">${label}</div><div class="knob-tooltip" aria-live="polite">${formatKnobValue(value)}</div>`;

  let startY    = 0;
  let startVal  = value;
  let isDragging = false;
  let currentVal = value;

  // Sensitivity: dragging 180 px covers the full range
  const sensitivity = (max - min) / 180;

  function applyDelta(clientY, shiftKey) {
    const delta = (startY - clientY) * sensitivity * (shiftKey ? 0.1 : 1);
    const raw   = startVal + delta;
    const quantised = Math.round(raw / step) * step;
    currentVal = Math.max(min, Math.min(max, quantised));
    updateKnobDisplay(wrap, currentVal, min, max);
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    wrap.classList.remove('active');
    wrap.dispatchEvent(new CustomEvent('knob:change', {
      bubbles: true,
      detail: { index, value: currentVal },
    }));
  }

  // ── Mouse ──
  const onMouseMove = (e) => { if (isDragging) applyDelta(e.clientY, e.shiftKey); };
  const onMouseUp   = (e) => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup',   onMouseUp);
    endDrag();
  };

  wrap.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    startY    = e.clientY;
    startVal  = currentVal;
    wrap.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  });

  // ── Touch ──
  wrap.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDragging = true;
    startY    = e.touches[0].clientY;
    startVal  = currentVal;
    wrap.classList.add('active');
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isDragging) applyDelta(e.touches[0].clientY, false);
  }, { passive: false });

  wrap.addEventListener('touchend', () => { endDrag(); });
  wrap.addEventListener('touchcancel', () => { isDragging = false; wrap.classList.remove('active'); });

  // Clear active state when mouse leaves without releasing (visual only)
  wrap.addEventListener('mouseleave', () => {
    if (!isDragging) wrap.classList.remove('active');
  });

  return wrap;
}

// ─── KNOB_MAPS ─────────────────────────────────────────────────────────────────
// Defines 8 knobs per page. Knobs 0-3 = left bank, 4-7 = right bank.
// param: dotted path into state (or 'track.N.field' for per-track mixer params).
// param: null means unused / decorative.

export const KNOB_MAPS = {
  pattern: [
    { label: 'BPM',     param: 'bpm',          min: 40,   max: 240,   step: 1     },
    { label: 'Swing',   param: 'swing',         min: 0,    max: 0.42,  step: 0.01  },
    { label: 'Length',  param: 'length',        min: 4,    max: 64,    step: 1     },
    { label: 'Steps',   param: 'steps',         min: 4,    max: 64,    step: 1     },
    { label: 'Density', param: 'euclidBeats',   min: 1,    max: 16,    step: 1     },
    { label: 'Shift',   param: 'patternShift',  min: 0,    max: 15,    step: 1     },
    { label: 'Prob',    param: 'defaultProb',   min: 0,    max: 1,     step: 0.01  },
    { label: 'Trig',    param: 'trigMode',      min: 0,    max: 4,     step: 1     },
  ],
  'piano-roll': [
    { label: 'Zoom',   param: 'rollZoom',    min: 0.5, max: 4,   step: 0.1  },
    { label: 'Scroll', param: 'rollScroll',  min: 0,   max: 100, step: 1    },
    { label: 'Gate',   param: 'noteLength',  min: 0.05,max: 1,   step: 0.05 },
    { label: 'Vel',    param: 'velocity',    min: 0,   max: 1,   step: 0.01 },
    { label: 'Oct',    param: 'octaveShift', min: -3,  max: 3,   step: 1    },
    { label: 'Scale',  param: 'scale',       min: 0,   max: 7,   step: 1    },
    { label: 'Quant',  param: 'quantize',    min: 0,   max: 4,   step: 1    },
    { label: '—',      param: null,          min: 0,   max: 1,   step: 0.01 },
  ],
  sound: [
    { label: 'Pitch',  param: 'pitch',      min: 24,   max: 96,    step: 1     },
    { label: 'Attack', param: 'attack',     min: 0.001,max: 0.5,   step: 0.001 },
    { label: 'Decay',  param: 'decay',      min: 0.03, max: 3,     step: 0.01  },
    { label: 'Gate',   param: 'noteLength', min: 0.05, max: 1,     step: 0.05  },
    { label: 'Cutoff', param: 'cutoff',     min: 80,   max: 18000, step: 10    },
    { label: 'Res',    param: 'resonance',  min: 0.1,  max: 20,    step: 0.1   },
    { label: 'Drive',  param: 'drive',      min: 0,    max: 1,     step: 0.01  },
    { label: 'Vol',    param: 'volume',     min: 0,    max: 1,     step: 0.01  },
  ],
  mixer: [
    { label: 'Trk 1', param: 'track.0.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 2', param: 'track.1.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 3', param: 'track.2.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 4', param: 'track.3.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 5', param: 'track.4.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 6', param: 'track.5.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 7', param: 'track.6.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 8', param: 'track.7.volume', min: 0, max: 1, step: 0.01 },
  ],
  fx: [
    { label: 'DlyTime', param: 'delayTime',      min: 0,   max: 1,    step: 0.01 },
    { label: 'DlyFb',   param: 'delayFeedback',  min: 0,   max: 0.95, step: 0.01 },
    { label: 'RevSize', param: 'reverbSize',      min: 0.1, max: 3,    step: 0.1  },
    { label: 'RevMix',  param: 'reverbMix',       min: 0,   max: 1,    step: 0.01 },
    { label: 'LfoRate', param: 'lfoRate',          min: 0.1, max: 30,   step: 0.1  },
    { label: 'LfoDep',  param: 'lfoDepth',         min: 0,   max: 1,    step: 0.01 },
    { label: 'Drive',   param: 'drive',            min: 0,   max: 1,    step: 0.01 },
    { label: '—',       param: null,               min: 0,   max: 1,    step: 0.01 },
  ],
  scenes: [
    { label: 'X-Fade', param: 'crossfader', min: 0, max: 1, step: 0.01 },
    { label: 'SceneA', param: 'sceneA',     min: 0, max: 7, step: 1    },
    { label: 'SceneB', param: 'sceneB',     min: 0, max: 7, step: 1    },
    { label: '—',      param: null,         min: 0, max: 1, step: 0.01 },
    { label: '—',      param: null,         min: 0, max: 1, step: 0.01 },
    { label: '—',      param: null,         min: 0, max: 1, step: 0.01 },
    { label: '—',      param: null,         min: 0, max: 1, step: 0.01 },
    { label: '—',      param: null,         min: 0, max: 1, step: 0.01 },
  ],
  banks: [
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
    { label: '—', param: null, min: 0, max: 1, step: 0.01 },
  ],
  arranger: [
    { label: 'SecLen', param: 'sectionLen', min: 1,  max: 16,  step: 1    },
    { label: 'BPM',    param: 'bpm',        min: 40, max: 240, step: 1    },
    { label: 'Loop',   param: 'loopCount',  min: 1,  max: 16,  step: 1    },
    { label: '—',      param: null,         min: 0,  max: 1,   step: 0.01 },
    { label: '—',      param: null,         min: 0,  max: 1,   step: 0.01 },
    { label: '—',      param: null,         min: 0,  max: 1,   step: 0.01 },
    { label: '—',      param: null,         min: 0,  max: 1,   step: 0.01 },
    { label: '—',      param: null,         min: 0,  max: 1,   step: 0.01 },
  ],
  settings: [
    { label: 'MIDI Ch', param: 'midiChannel',  min: 1, max: 16,   step: 1    },
    { label: 'Sync',    param: 'sync',          min: 0, max: 1,    step: 1    },
    { label: 'Level',   param: 'masterLevel',   min: 0, max: 1,    step: 0.01 },
    { label: 'Swing',   param: 'swing',         min: 0, max: 0.42, step: 0.01 },
    { label: 'Link',    param: 'abletonLink',   min: 0, max: 1,    step: 1    },
    { label: 'Clock',   param: 'clockMode',     min: 0, max: 1,    step: 1    },
    { label: 'Metro',   param: 'metronome',     min: 0, max: 1,    step: 1    },
    { label: '—',       param: null,            min: 0, max: 1,    step: 0.01 },
  ],
};

// ─── State value accessor ──────────────────────────────────────────────────────

/**
 * Read a knob's current value from state.
 * Supports 'track.N.field' paths for per-track mixer params
 * (reads from the active pattern's kit).
 * @param {object} state
 * @param {string|null} param
 * @returns {number}
 */
function getKnobValue(state, param) {
  if (!param) return 0;

  if (param.startsWith('track.')) {
    const parts = param.split('.');
    const trackIndex = Number(parts[1]);
    const field = parts[2];
    const pattern =
      state.project?.banks[state.activeBank]?.patterns[state.activePattern];
    return pattern?.kit?.tracks[trackIndex]?.[field] ?? 0;
  }

  // Flat state property
  return state[param] ?? 0;
}

// ─── Public render function ────────────────────────────────────────────────────

/**
 * Render 4 knobs into containerEl, reading definitions from KNOB_MAPS[page].
 * startIndex selects which 4 knobs: 0 for left bank, 4 for right bank.
 *
 * Emits 'knob:change' events (via createKnob's CustomEvent) which bubble up.
 *
 * @param {HTMLElement} containerEl
 * @param {string}      page
 * @param {object}      state
 * @param {number}      [startIndex=0]
 */
export function renderKnobs(containerEl, page, state, startIndex = 0) {
  containerEl.innerHTML = '';
  const map = KNOB_MAPS[page] || KNOB_MAPS['pattern'];

  for (let i = startIndex; i < startIndex + 4; i++) {
    const knobDef = map[i] || { label: '—', param: null, min: 0, max: 1, step: 0.01 };
    const value   = getKnobValue(state, knobDef.param);
    const knobEl  = createKnob(i, { ...knobDef, value });
    containerEl.append(knobEl);
  }
}

// Named exports for consumers that need lower-level access
export { createKnob, updateKnobDisplay, valueToAngle, formatKnobValue };
