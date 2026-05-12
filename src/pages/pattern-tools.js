// src/pages/pattern-tools.js — Shared utilities extracted from pattern.js

// ─── Genre-aware randomize probability tables ─────────────────────────────────
// Each genre defines per-track step-probability arrays for 16 steps.
// Track order convention (0-based): 0=kick, 1=snare, 2=hihat, 3=clap, 4-7=other
// Values are multipliers applied on top of the global density (0-1).
// A value of 1 means "use full density", 0 means "never active".
const GENRE_WEIGHTS = {
  // Straight 4-on-the-floor kick, snare on 2&4, 8th-note hats, sparse perc
  drums: [
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], // kick: quarter notes
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // snare: beats 2 & 4
    [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], // hihat: all 8th notes (dense)
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], // clap
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // perc 1
    [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0], // perc 2
    [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,1], // perc 3
    [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0], // perc 4
  ],
  // House: 4-on-floor kick, offbeat hats, snare on 3, open hats on upbeats
  house: [
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], // kick: 4-on-the-floor
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // snare: beat 3
    [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1], // closed hihat: offbeats
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], // open hihat
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0], // clap/snap
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // shaker
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0], // perc
    [0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0], // cymbal
  ],
  // Techno: dense kick, sparse snare, driving hats
  techno: [
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // kick: every 2nd 16th
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // snare: beat 3
    [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], // hihat: all 16ths
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1], // clap/rimshot
    [0,1,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0], // perc 1
    [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0], // perc 2
    [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], // perc 3
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // ride/accent
  ],
  // Jazz: swing-feel, hi-hat on 2&4, brushy snare, sparse kick
  jazz: [
    [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // kick: beats 1 & 3
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // snare: 2 & 4
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // ride: straight swing pattern
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0], // hihat: beat 2 accent
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0], // hihat: beat 4 accent
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // brush swirl
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0], // ghost note
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // crash
  ],
  // Latin: clave-based patterns, congas, timbales
  latin: [
    [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0], // kick: son clave-ish
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // snare/timbale: 2 & 4
    [1,0,1,0, 0,1,0,1, 0,1,0,0, 1,0,1,0], // hihat/shaker
    [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0], // clave (son)
    [0,1,0,0, 1,0,0,1, 0,0,1,0, 0,1,0,0], // conga low
    [1,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0], // conga high
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0], // cowbell
    [0,1,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0], // guiro
  ],
  // Random: uniform (all weights = 1)
  random: null,
};

// Return a flat array of per-step probability weights for a given track index and genre.
// Steps beyond 16 wrap around the base pattern.
function getGenreStepWeights(genre, trackIndex, numSteps) {
  const table = GENRE_WEIGHTS[genre];
  if (!table) return Array(numSteps).fill(1); // 'random' / unknown → uniform
  const trackWeights = table[Math.min(trackIndex, table.length - 1)];
  const base = trackWeights.length; // 16
  return Array.from({ length: numSteps }, (_, i) => trackWeights[i % base]);
}

// ─── Note name helper ─────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToNoteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

// ─── Euclidean rhythm generator (Bjorklund algorithm) ────────────────────────
function euclidean(beats, steps) {
  if (beats <= 0) return Array(steps).fill(false);
  if (beats >= steps) return Array(steps).fill(true);
  beats = Math.min(beats, steps);
  const pattern = [];
  const counts = [];
  const remainders = [];
  let divisor = steps - beats;
  remainders.push(beats);
  let level = 0;
  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
  }
  counts.push(divisor);
  function build(lv) {
    if (lv === -1) { pattern.push(false); }
    else if (lv === -2) { pattern.push(true); }
    else {
      for (let i = 0; i < counts[lv]; i++) build(lv - 1);
      if (remainders[lv] !== 0) build(lv - 2);
    }
  }
  build(level);
  return pattern.slice(0, steps);
}

const PLOCK_PARAMS = [
  { label: 'Cutoff', param: 'cutoff', min: 80, max: 16000, step: 10 },
  { label: 'Decay',  param: 'decay',  min: 0.01, max: 2,   step: 0.01 },
  { label: 'Pitch',  param: 'pitch',  min: 0,    max: 127,  step: 1 },
  { label: 'Drive',  param: 'drive',  min: 0,    max: 1,    step: 0.01 },
  { label: 'Vol',    param: 'volume', min: 0,    max: 1,    step: 0.01 },
];

const STEP_CONDITIONS = [
  { value: 'always',   label: 'Always' },
  { value: '1st',      label: '1st loop' },
  { value: 'not1st',   label: 'Skip 1st' },
  { value: 'every2',   label: 'Every 2' },
  { value: 'every3',   label: 'Every 3' },
  { value: 'every4',   label: 'Every 4' },
  { value: 'random',   label: 'Random' },
  { value: 'fill',     label: 'Fill only' },
  { value: 'not_fill', label: 'Not Fill' },
];

// ─── Pattern page scoped styles (injected once) ───────────────────────────────
let _patternCssInjected = false;
function injectPatternCSS() {
  if (_patternCssInjected) return;
  _patternCssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
/* ── Compact track rows: all 8 visible at once ── */
.multi-track-grid {
  overflow-y: auto !important;
  flex: 1 !important;
  min-height: 0 !important;
  gap: 1px !important;
  width: 100% !important;
}
.mtg-row {
  min-height: 44px !important;
  max-height: 54px !important;
  overflow: hidden;
  flex-shrink: 0;
  width: 100% !important;
}
/* ── Compact label area ── */
.mtg-label-wrap {
  width: 74px !important;
  min-width: 74px !important;
  max-width: 74px !important;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 3px;
  overflow: hidden;
}
.mtg-steps {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  gap: 1px !important;
}
.mtg-label {
  font-size: 0.54rem !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  letter-spacing: 0.02em;
}
.mtg-machine {
  font-size: 0.36rem !important;
  white-space: nowrap;
  opacity: 0.7;
}
.mtg-rand-btn {
  font-size: 0.44rem !important;
  padding: 1px 0 !important;
  line-height: 1.2;
}
/* ── Step buttons: border-radius + beat groups ── */
.step-btn {
  border-radius: 3px !important;
  user-select: none;
  -webkit-user-select: none;
}
.step-btn.step-group-start {
  margin-left: 4px !important;
}
/* ── Toolbar: single row, no wrap ── */
.seq-toolbar {
  flex-shrink: 0 !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  gap: 4px !important;
  align-items: flex-start !important;
}
.seq-actions {
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  align-items: center;
  gap: 3px !important;
}
.seq-btn {
  font-size: 0.58rem !important;
  padding: 3px 6px !important;
  white-space: nowrap;
  flex-shrink: 0;
}
/* ── Euclid panel: inline in toolbar, not floating ── */
.seq-euclid {
  flex-shrink: 0;
  flex-wrap: nowrap;
}
.euclid-canvas {
  width: 80px !important;
  height: 80px !important;
}
/* ── Step trigger flash ── */
@keyframes _step-flash-anim { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 6px 2px #fff9; } }
.step-flash {
  background: #fff !important;
  color: #000 !important;
  box-shadow: 0 0 8px 3px rgba(255,255,255,0.7) !important;
}
/* ── Track name rename input ── */
.mtg-label-input {
  font-size: 0.54rem;
  font-family: var(--font-mono);
  background: var(--surface, #1a1a1a);
  color: var(--fg, #eee);
  border: 1px solid var(--accent, #f0c640);
  border-radius: 2px;
  padding: 0 2px;
  width: 100%;
  min-width: 0;
  outline: none;
}
/* ── Track color picker popover ── */
.track-color-popover div[title]:hover {
  transform: scale(1.2);
  border-color: #fff !important;
  transition: transform 0.08s;
}
  `;
  document.head.append(style);
}

export {
  GENRE_WEIGHTS,
  getGenreStepWeights,
  NOTE_NAMES,
  midiToNoteName,
  euclidean,
  PLOCK_PARAMS,
  STEP_CONDITIONS,
  injectPatternCSS,
};
