// src/pages/sound.js — Machine type, waveform, ADSR, filter
import { openSampleBrowser } from '../sample-browser.js';
import { TRACK_COLORS } from '../state.js';
import { makeSampleLoader } from './sound-sample.js';

const MACHINES = ['tone', 'noise', 'sample', 'midi', 'plaits', 'clouds', 'rings'];
const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiToNoteName(midi) {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + oct;
}

const WAVEFORM_SVGS = {
  sine: `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><path d="M0,5 C2,5 3,1 5,1 C7,1 8,9 10,9 C12,9 13,1 15,1 C17,1 18,5 20,5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  triangle: `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><polyline points="0,9 5,1 10,9 15,1 20,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  sawtooth: `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><polyline points="0,9 10,1 10,9 20,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  square: `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><polyline points="0,9 0,1 10,1 10,9 20,9 20,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
};

function buildArpPreview(arpMode, arpRange, rootMidi, trackColor) {
  const range = Math.max(1, Math.min(4, arpRange ?? 1));
  // Build a sequence of MIDI offsets (semitones from root) for the octave steps
  const octaves = [];
  for (let o = 0; o < range; o++) octaves.push(o * 12);

  let sequence;
  if (arpMode === 'up' || !arpMode) {
    sequence = octaves;
  } else if (arpMode === 'down') {
    sequence = [...octaves].reverse();
  } else if (arpMode === 'updown') {
    // ascending then descending, no repeat at top/bottom
    const asc = octaves;
    const desc = octaves.slice(1, -1).reverse();
    sequence = [...asc, ...desc];
  } else {
    // random — deterministic shuffle based on range for stable preview
    sequence = [...octaves];
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = (i * 7 + 3) % (i + 1);
      [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }
  }

  // Pad or trim to exactly 8 steps (repeat pattern if shorter)
  const steps = 8;
  const bars = [];
  for (let i = 0; i < steps; i++) {
    bars.push(sequence[i % sequence.length]);
  }

  const maxOffset = (range - 1) * 12 || 1;
  const color = trackColor || 'var(--accent)';

  const barEls = bars.map((offset) => {
    const heightPct = 20 + (offset / maxOffset) * 75;
    const el = document.createElement('div');
    el.className = 'arp-preview-bar';
    el.style.cssText = `height:${heightPct.toFixed(0)}%;background:${color};`;
    return el;
  });

  const wrap = document.createElement('div');
  wrap.className = 'arp-preview';
  barEls.forEach((b) => wrap.appendChild(b));
  return wrap;
}

const MACHINE_BADGE_COLORS = {
  tone: { bg: '#ff7a00', text: '#000' },
  noise: { bg: '#ff7a00', text: '#000' },
  sample: { bg: '#2277ff', text: '#fff' },
  plaits: { bg: '#22aa44', text: '#fff' },
  clouds: { bg: '#7744cc', text: '#fff' },
  rings: { bg: '#009988', text: '#fff' },
  midi: { bg: '#ddcc00', text: '#000' },
};

const LFO_TARGETS = ['cutoff', 'volume', 'pan', 'pitch'];
const ADSR_PRESETS = [
  { label: 'Perc', a: 0.001, d: 0.1, s: 0, r: 0.05 },
  { label: 'Pad', a: 0.3, d: 0.5, s: 0.8, r: 1.0 },
  { label: 'Pluck', a: 0.001, d: 0.15, s: 0.3, r: 0.2 },
  { label: 'Long', a: 0.1, d: 0.3, s: 0.7, r: 0.8 },
  { label: 'Drone', a: 0.5, d: 0.1, s: 1.0, r: 2.0 },
];

const PLAITS_ENGINES = [
  { label: 'VA', value: 0 },
  { label: 'Wave', value: 1 },
  { label: 'FM2', value: 2 },
  { label: 'String', value: 3 },
  { label: 'Chord', value: 4 },
];

const RINGS_EXCITERS = [
  { label: 'Impulse', value: 0 },
  { label: 'Noise', value: 1 },
  { label: 'Bow', value: 2 },
];

// ── Canvas-based ADSR visualizer ──────────────────────────────────────────────
function drawADSR(canvas, attack, decay, sustain, release, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width,
    H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 4) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  const totalTime = attack + decay + 0.3 + release;
  const aN = (attack / totalTime) * W * 0.8;
  const dN = (decay / totalTime) * W * 0.8;
  const sN = W * 0.15;
  const rN = (release / totalTime) * W * 0.8;

  const pad = 4;
  const top = pad;
  const bot = H - pad;
  const susY = bot - sustain * (H - pad * 2);

  ctx.beginPath();
  ctx.moveTo(0, bot);
  ctx.lineTo(aN, top);
  ctx.lineTo(aN + dN, susY);
  ctx.lineTo(aN + dN + sN, susY);
  ctx.lineTo(aN + dN + sN + rN, bot);
  ctx.lineTo(0, bot);
  ctx.closePath();
  ctx.fillStyle = color + '30';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, bot);
  ctx.lineTo(aN, top);
  ctx.lineTo(aN + dN, susY);
  ctx.lineTo(aN + dN + sN, susY);
  ctx.lineTo(aN + dN + sN + rN, bot);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '8px monospace';
  ctx.fillText('A', aN / 2 - 3, H - 2);
  ctx.fillText('D', aN + dN / 2 - 3, H - 2);
  ctx.fillText('S', aN + dN + sN / 2 - 3, H - 2);
  ctx.fillText('R', aN + dN + sN + rN / 2 - 3, H - 2);
}

// ── Canvas-based filter frequency response visualizer ─────────────────────────
function drawFilterResponse(canvas, cutoff, resonance, filterType, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width,
    H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, W, H);

  const freqToX = (f) => (Math.log10(f / 20) / Math.log10(1000)) * W;
  const cutoffX = freqToX(cutoff);
  const resBoost = resonance * 18;

  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    const freq = 20 * Math.pow(1000, x / W);
    let gain = 0;

    if (filterType === 'lowpass' || !filterType) {
      const ratio = freq / cutoff;
      gain = ratio < 1 ? 0 : -24 * Math.log2(ratio);
      const dist = Math.abs(Math.log2(freq / cutoff));
      if (dist < 0.5) gain += resBoost * Math.exp(-dist * dist * 8);
    } else if (filterType === 'highpass') {
      const ratio = cutoff / freq;
      gain = ratio < 1 ? 0 : -24 * Math.log2(ratio);
      const dist = Math.abs(Math.log2(freq / cutoff));
      if (dist < 0.5) gain += resBoost * Math.exp(-dist * dist * 8);
    } else if (filterType === 'bandpass') {
      const dist = Math.abs(Math.log2(freq / cutoff));
      gain = -dist * 12;
      if (dist < 0.5) gain += resBoost * Math.exp(-dist * dist * 4);
    }

    const y = H / 2 - (gain / 36) * H;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(cutoffX, 0);
  ctx.lineTo(cutoffX, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

function makeSlider(label, param, min, max, step, value, emit, trackIndex) {
  const row = document.createElement('label');
  row.innerHTML = `
    <span>${label}</span>
    <output>${Number(value).toFixed(step < 1 ? 2 : 0)}</output>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
  `;
  const input = row.querySelector('input');
  const output = row.querySelector('output');
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    output.textContent = v.toFixed(step < 1 ? 2 : 0);
    emit('track:change', { trackIndex, param, value: v });
  });
  return row;
}

// ── Inject scoped CSS for the 3-column SYNTH tab (once) ──────────────────────
(function injectSoundPageCSS() {
  if (document.getElementById('_snd-col-styles')) return;
  const s = document.createElement('style');
  s.id = '_snd-col-styles';
  s.textContent = `
.snd-synth-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 6px;
  height: 100%;
  min-height: 0;
}
.snd-col {
  display: flex; flex-direction: column; gap: 6px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 5px; padding: 8px 6px;
  min-height: 0; overflow: hidden;
}
.snd-col-label {
  font-size: 0.58rem; font-weight: 700; letter-spacing: 0.12em;
  color: rgba(255,255,255,0.35); text-transform: uppercase; margin-bottom: 2px;
  border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 4px;
}
.snd-waveform-row { display: flex; gap: 3px; flex-wrap: wrap; }
.snd-wave-btn {
  flex: 1; padding: 4px; display: flex; flex-direction: column;
  align-items: center; gap: 3px; border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); cursor: pointer;
  color: rgba(255,255,255,0.5); font-size: 0.48rem;
  transition: all 0.1s;
}
.snd-wave-btn.active { background: rgba(90,221,113,0.15); border-color: var(--live); color: var(--live); }
.snd-wave-btn svg { width: 28px; height: 14px; }
.snd-param-row { display: flex; align-items: center; gap: 6px; font-size: 0.6rem; }
.snd-param-lbl { color: rgba(255,255,255,0.4); width: 40px; flex-shrink: 0; font-size: 0.58rem; }
.snd-param-slider { flex: 1; height: 3px; }
.snd-param-val { color: rgba(255,255,255,0.6); width: 36px; text-align: right; font-variant-numeric: tabular-nums; font-size: 0.58rem; }
.snd-adsr-canvas { width: 100%; height: 50px; border-radius: 3px; display: block; }
.snd-filter-canvas { width: 100%; height: 40px; border-radius: 3px; display: block; }
.snd-pitch-display {
  font-size: 1.4rem; font-weight: 700; color: var(--live);
  text-align: center; letter-spacing: 0.02em; font-variant-numeric: tabular-nums;
  padding: 4px 0; line-height: 1;
}
.snd-pitch-midi { font-size: 0.55rem; color: rgba(255,255,255,0.3); text-align: center; }
.snd-filter-type { display: flex; gap: 3px; }
.snd-filter-btn {
  flex: 1; padding: 3px 4px; font-size: 0.55rem; font-weight: 700;
  border-radius: 2px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); cursor: pointer;
}
.snd-filter-btn.active { background: rgba(103,215,255,0.2); color: #67d7ff; border-color: #67d7ff; }
.snd-toggle-btn {
  padding: 4px 8px; font-size: 0.58rem; font-weight: 600;
  border-radius: 3px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); cursor: pointer;
}
.snd-toggle-btn.on { background: rgba(90,221,113,0.2); color: var(--live); border-color: var(--live); }
.snd-toggle-row { display: flex; gap: 4px; flex-wrap: wrap; }
.snd-section-sep {
  border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 2px 0;
}
  `.trim();
  document.head.appendChild(s);
})();

// ── Helper: make a compact slider row for the 3-column layout ────────────────
function makeSndParamRow(label, param, min, max, step, value, emit, trackIndex, onChange) {
  const row = document.createElement('div');
  row.className = 'snd-param-row';

  const lbl = document.createElement('span');
  lbl.className = 'snd-param-lbl';
  lbl.textContent = label;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'snd-param-slider';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = value;

  const decimals = step < 0.1 ? 3 : step < 1 ? 2 : 0;
  const val = document.createElement('span');
  val.className = 'snd-param-val';
  val.textContent = Number(value).toFixed(decimals);

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    val.textContent = v.toFixed(decimals);
    emit('track:change', { trackIndex, param, value: v });
    if (onChange) onChange(v);
  });

  row.append(lbl, slider, val);
  row.dataset.param = param;
  return row;
}

// ── OSC column ────────────────────────────────────────────────────────────────
function buildOscColumn(track, ti, emit, color, rerender) {
  const col = document.createElement('div');
  col.className = 'snd-col';

  const lbl = document.createElement('div');
  lbl.className = 'snd-col-label';
  lbl.textContent = 'OSC';
  col.append(lbl);

  // Machine type selector
  const machRow = document.createElement('div');
  machRow.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap';
  MACHINES.forEach((m) => {
    const btn = document.createElement('button');
    const bc = MACHINE_BADGE_COLORS[m] ?? { bg: '#555', text: '#fff' };
    btn.className = 'snd-filter-btn' + (track.machine === m ? ' active' : '');
    btn.style.cssText = `font-size:0.48rem;padding:2px 4px`;
    if (track.machine === m) {
      btn.style.background = bc.bg + '33';
      btn.style.borderColor = bc.bg;
      btn.style.color = bc.bg;
    }
    btn.textContent = m.toUpperCase();
    btn.addEventListener('click', () => {
      track.machine = m;
      emit('track:change', { trackIndex: ti, param: 'machine', value: m });
      if (rerender) rerender();
    });
    machRow.append(btn);
  });
  col.append(machRow);

  col.append(Object.assign(document.createElement('hr'), { className: 'snd-section-sep' }));

  // Waveform selector (tone machine only)
  if (!track.machine || track.machine === 'tone') {
    const wfRow = document.createElement('div');
    wfRow.className = 'snd-waveform-row';
    WAVEFORMS.forEach((w) => {
      const btn = document.createElement('button');
      btn.className = 'snd-wave-btn' + (track.waveform === w ? ' active' : '');
      btn.innerHTML = `${WAVEFORM_SVGS[w] ?? ''}<span>${w.slice(0, 3).toUpperCase()}</span>`;
      btn.title = w;
      btn.addEventListener('click', () => {
        wfRow.querySelectorAll('.snd-wave-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        emit('track:change', { trackIndex: ti, param: 'waveform', value: w });
      });
      wfRow.append(btn);
    });
    col.append(wfRow);
    col.append(Object.assign(document.createElement('hr'), { className: 'snd-section-sep' }));
  }

  // Pitch display
  const pitchDisplay = document.createElement('div');
  pitchDisplay.className = 'snd-pitch-display';
  pitchDisplay.textContent = midiToNoteName(track.pitch ?? 60);

  const pitchMidi = document.createElement('div');
  pitchMidi.className = 'snd-pitch-midi';
  pitchMidi.textContent = `MIDI ${track.pitch ?? 60}`;

  col.append(pitchDisplay, pitchMidi);

  const pitchRow = makeSndParamRow('Pitch', 'pitch', 0, 127, 1, track.pitch ?? 60, emit, ti, (v) => {
    pitchDisplay.textContent = midiToNoteName(v);
    pitchMidi.textContent = `MIDI ${v}`;
  });
  // Override val display to show note name
  pitchRow.querySelector('.snd-param-val').textContent = midiToNoteName(track.pitch ?? 60);
  pitchRow.querySelector('input').addEventListener('input', function () {
    pitchRow.querySelector('.snd-param-val').textContent = midiToNoteName(parseInt(this.value));
  });
  col.append(pitchRow);

  // Fine tune / detune
  col.append(makeSndParamRow('Fine', 'detune', -100, 100, 1, track.detune ?? 0, emit, ti));

  col.append(Object.assign(document.createElement('hr'), { className: 'snd-section-sep' }));

  // Legato + Key Track toggles
  const toggleRow = document.createElement('div');
  toggleRow.className = 'snd-toggle-row';

  const legatoBtn = document.createElement('button');
  legatoBtn.className = 'snd-toggle-btn' + (track.legato ? ' on' : '');
  legatoBtn.textContent = 'LEGATO';
  legatoBtn.addEventListener('click', () => {
    const newVal = !track.legato;
    legatoBtn.classList.toggle('on', newVal);
    emit('track:change', { trackIndex: ti, param: 'legato', value: newVal });
  });

  const ktActive = track.keyTracking ?? false;
  const ktBtn = document.createElement('button');
  ktBtn.className = 'snd-toggle-btn' + (ktActive ? ' on' : '');
  ktBtn.textContent = 'KEY TRK';
  ktBtn.title = 'Pitch sample relative to root note';
  ktBtn.addEventListener('click', () => {
    const newVal = !track.keyTracking;
    track.keyTracking = newVal;
    ktBtn.classList.toggle('on', newVal);
    emit('track:change', { trackIndex: ti, param: 'keyTracking', value: newVal });
  });

  toggleRow.append(legatoBtn, ktBtn);
  col.append(toggleRow);

  return col;
}

// ── FILTER column ─────────────────────────────────────────────────────────────
function buildFilterColumn(track, ti, emit, color) {
  const col = document.createElement('div');
  col.className = 'snd-col';

  const lbl = document.createElement('div');
  lbl.className = 'snd-col-label';
  lbl.textContent = 'FILTER';
  col.append(lbl);

  // Filter response canvas
  const filterCanvas = document.createElement('canvas');
  filterCanvas.className = 'snd-filter-canvas';
  filterCanvas.width = 120;
  filterCanvas.height = 40;
  col.append(filterCanvas);

  const currentFilterType = track.filterType ?? 'lowpass';

  function redrawFilter() {
    const w = filterCanvas.offsetWidth;
    if (w > 0) filterCanvas.width = w;
    const cutoffRow = col.querySelector('[data-param="cutoff"] input');
    const resRow = col.querySelector('[data-param="resonance"] input');
    const ftRow = col.querySelector('[data-param="filterType"]');
    const c = parseFloat(cutoffRow?.value ?? track.cutoff ?? 4000);
    const r = parseFloat(resRow?.value ?? track.resonance ?? 0.5);
    const ft = ftRow?.dataset.value ?? currentFilterType;
    drawFilterResponse(filterCanvas, c, r, ft, color);
  }

  // Filter type buttons (LP / HP / BP)
  const ftRow = document.createElement('div');
  ftRow.className = 'snd-filter-type';
  ftRow.dataset.param = 'filterType';
  ftRow.dataset.value = currentFilterType;

  const FILTER_TYPES_SHORT = [
    { label: 'LP', value: 'lowpass' },
    { label: 'HP', value: 'highpass' },
    { label: 'BP', value: 'bandpass' },
    { label: 'NOTCH', value: 'notch' },
    { label: 'PEAK', value: 'peaking' },
    { label: 'LSH', value: 'lowshelf' },
    { label: 'HSH', value: 'highshelf' },
  ];

  FILTER_TYPES_SHORT.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'snd-filter-btn' + (currentFilterType === value ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      ftRow.querySelectorAll('.snd-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ftRow.dataset.value = value;
      emit('track:change', { trackIndex: ti, param: 'filterType', value });
      redrawFilter();
    });
    ftRow.append(btn);
  });
  col.append(ftRow);

  // Filter param sliders
  const filtParams = [
    { label: 'Cutoff', param: 'cutoff', min: 80, max: 16000, step: 10, def: 4000 },
    { label: 'Res', param: 'resonance', min: 0.5, max: 15, step: 0.1, def: 0.5 },
    { label: 'Drive', param: 'drive', min: 0, max: 1, step: 0.01, def: 0 },
    { label: 'Env Amt', param: 'filterEnvAmt', min: -1, max: 1, step: 0.01, def: 0 },
  ];
  filtParams.forEach(({ label, param, min, max, step, def }) => {
    const row = makeSndParamRow(label, param, min, max, step, track[param] ?? def, emit, ti, () => redrawFilter());
    col.append(row);
  });

  // Trigger initial draw after layout
  requestAnimationFrame(() => redrawFilter());
  col.addEventListener('input', () => redrawFilter());

  return col;
}

// ── AMP column ────────────────────────────────────────────────────────────────
function buildAmpColumn(track, ti, emit, color) {
  const col = document.createElement('div');
  col.className = 'snd-col';

  const lbl = document.createElement('div');
  lbl.className = 'snd-col-label';
  lbl.textContent = 'AMP / ENV';
  col.append(lbl);

  // ADSR canvas
  const adsrCanvas = document.createElement('canvas');
  adsrCanvas.className = 'snd-adsr-canvas';
  adsrCanvas.width = 120;
  adsrCanvas.height = 50;
  col.append(adsrCanvas);

  // Preset row
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap';
  ADSR_PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.className = 'snd-filter-btn';
    btn.style.cssText = 'font-size:0.46rem;padding:2px 4px';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      track.attack = preset.a;
      track.decay = preset.d;
      track.sustain = preset.s;
      track.release = preset.r;
      const params = ['attack', 'decay', 'sustain', 'release'];
      const vals = [preset.a, preset.d, preset.s, preset.r];
      params.forEach((p, i) => {
        const row = col.querySelector(`[data-param="${p}"]`);
        if (row) {
          const inp = row.querySelector('input');
          const vEl = row.querySelector('.snd-param-val');
          if (inp) inp.value = vals[i];
          if (vEl) vEl.textContent = vals[i].toFixed(3);
        }
        emit('track:change', { trackIndex: ti, param: p, value: vals[i] });
      });
      redrawADSR();
    });
    presetRow.append(btn);
  });
  col.append(presetRow);

  function redrawADSR() {
    const w = adsrCanvas.offsetWidth;
    if (w > 0) adsrCanvas.width = w;
    const a = parseFloat(col.querySelector('[data-param="attack"] input')?.value ?? track.attack ?? 0.01);
    const d = parseFloat(col.querySelector('[data-param="decay"] input')?.value ?? track.decay ?? 0.1);
    const s = parseFloat(col.querySelector('[data-param="sustain"] input')?.value ?? track.sustain ?? 0.5);
    const r = parseFloat(col.querySelector('[data-param="release"] input')?.value ?? track.release ?? 0.2);
    drawADSR(adsrCanvas, a, d, s, r, color);
  }

  const adsrParams = [
    { label: 'Atk', param: 'attack', min: 0.001, max: 2, step: 0.001, def: 0.01 },
    { label: 'Dec', param: 'decay', min: 0.01, max: 2, step: 0.01, def: 0.1 },
    { label: 'Sus', param: 'sustain', min: 0, max: 1, step: 0.01, def: 0.5 },
    { label: 'Rel', param: 'release', min: 0.01, max: 4, step: 0.01, def: 0.2 },
    { label: 'Gate', param: 'noteLength', min: 0.01, max: 1, step: 0.01, def: 0.5 },
  ];
  adsrParams.forEach(({ label, param, min, max, step, def }) => {
    const row = makeSndParamRow(label, param, min, max, step, track[param] ?? def, emit, ti, () => redrawADSR());
    col.append(row);
  });

  col.append(Object.assign(document.createElement('hr'), { className: 'snd-section-sep' }));

  // Volume & pan
  col.append(makeSndParamRow('Vol', 'volume', 0, 1, 0.01, track.volume ?? 0.8, emit, ti));
  col.append(makeSndParamRow('Pan', 'pan', -1, 1, 0.01, track.pan ?? 0, emit, ti));

  requestAnimationFrame(() => redrawADSR());
  col.addEventListener('input', () => redrawADSR());

  return col;
}

// ── 3-column SYNTH tab renderer ───────────────────────────────────────────────
function renderSynthTab(track, ti, emit, color, rerender) {
  const div = document.createElement('div');
  div.className = 'snd-synth-grid';

  div.appendChild(buildOscColumn(track, ti, emit, color, rerender));
  div.appendChild(buildFilterColumn(track, ti, emit, color));
  div.appendChild(buildAmpColumn(track, ti, emit, color));

  return div;
}

export default {
  render(container, state, emit) {
    // Cancel any running live-note watcher from a previous render
    container._cleanupNoteWatch?.();
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';
    const ti = state.selectedTrackIndex;
    const track = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[ti];

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    const machineType = (track.machine ?? 'tone').toLowerCase();
    const badgeColors = MACHINE_BADGE_COLORS[machineType] ?? { bg: '#555', text: '#fff' };
    header.innerHTML = `<span class="page-title" style="margin:0">Sound — ${track.name}</span>
      <span class="machine-badge" style="background:${badgeColors.bg};color:${badgeColors.text}">${machineType.toUpperCase()}</span>`;
    container.append(header);

    // ── Sub-tab bar ──────────────────────────────────────────────────────────
    const SUB_TABS = ['SYNTH', 'MOD', 'SAMPLE'];
    const activeSubTab = state._soundSubTab ?? 'SYNTH';

    const subTabBar = document.createElement('div');
    subTabBar.style.cssText =
      'display:flex;gap:2px;padding:0 8px 4px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.06)';
    SUB_TABS.forEach((tab) => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (tab === activeSubTab ? ' active' : '');
      btn.textContent = tab;
      btn.style.cssText = 'font-size:0.5rem;padding:3px 10px';
      btn.addEventListener('click', () => {
        state._soundSubTab = tab;
        this.render(container, state, emit);
      });
      subTabBar.append(btn);
    });
    container.append(subTabBar);

    const showSynth = activeSubTab === 'SYNTH';
    const showMod = activeSubTab === 'MOD';
    const showSample = activeSubTab === 'SAMPLE';

    // Helper: make a tab content grid
    function makeGrid() {
      const g = document.createElement('div');
      g.className = 'page-grid-2';
      g.style.cssText = 'flex:1;min-height:0;overflow-y:auto';
      return g;
    }

    // ── 3-column SYNTH tab ───────────────────────────────────────────────────
    const trackColor = TRACK_COLORS[ti] ?? '#5add71';

    // synthWrapper holds the 3-column grid + any machine-specific extra cards
    const synthWrapper = document.createElement('div');
    synthWrapper.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;gap:6px;overflow-y:auto';
    synthWrapper.style.display = showSynth ? 'flex' : 'none';

    synthWrapper.appendChild(renderSynthTab(track, ti, emit, trackColor, () => this.render(container, state, emit)));

    // Placeholder modGrid/sampleGrid for MOD/SAMPLE tabs (unchanged layout)
    const modGrid = makeGrid();
    const sampleGrid = makeGrid();

    modGrid.style.display = showMod ? '' : 'none';
    sampleGrid.style.display = showSample ? '' : 'none';

    // Live note indicator watch (used in OSC column pitch display)
    const liveNote = document.createElement('div');
    liveNote.className = 'live-note-display';
    liveNote.id = `live-note-${ti}`;
    liveNote.style.cssText = 'display:none'; // hidden — pitch display in OSC col does the job
    synthWrapper.prepend(liveNote);

    const updateLiveNote = () => {
      const noteNum = state._lastNotes?.[ti];
      liveNote.textContent = noteNum != null ? midiToNoteName(noteNum) : '--';
    };
    updateLiveNote();
    let _noteRaf;
    const startNoteWatch = () => {
      _noteRaf = requestAnimationFrame(() => {
        updateLiveNote();
        startNoteWatch();
      });
    };
    startNoteWatch();
    container._cleanupNoteWatch = () => cancelAnimationFrame(_noteRaf);

    // ── Sample card (SAMPLE tab) ──
    if (track.machine === 'sample' || track.machine === 'clouds') {
      const sampleCard = document.createElement('div');
      sampleCard.className = 'page-card';
      sampleCard.innerHTML = '<h4>Sample</h4>';
      makeSampleLoader(track, ti, emit, sampleCard, state);
      const browseBtn = document.createElement('button');
      browseBtn.className = 'screen-btn';
      browseBtn.style.marginTop = '4px';
      browseBtn.textContent = 'Browse Library';
      browseBtn.addEventListener('click', () => openSampleBrowser(state, emit, ti));
      sampleCard.append(browseBtn);
      sampleGrid.append(sampleCard);
    }

    // ── Recorder slots card (SAMPLE tab) ──
    {
      const recCard = document.createElement('div');
      recCard.className = 'page-card';
      recCard.innerHTML = '<h4>Recorder Slots</h4>';

      const slots = state.recorderBuffers ?? [];
      const metas = state.recorderSlotsMeta ?? [];

      if (slots.every((b) => !b)) {
        const emptyNote = document.createElement('div');
        emptyNote.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);padding:6px 0';
        emptyNote.textContent = 'No recordings yet. Use Settings → Recorder to capture audio.';
        recCard.append(emptyNote);
      } else {
        slots.forEach((buf, si) => {
          const meta = metas[si] ?? {};
          const row = document.createElement('div');
          row.style.cssText =
            'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05)';

          const slotLabel = document.createElement('span');
          slotLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);min-width:14px';
          slotLabel.textContent = String(si + 1);

          const slotInfo = document.createElement('span');
          slotInfo.style.cssText =
            'font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          if (buf) {
            const dur = (buf.duration ?? buf.length / buf.sampleRate).toFixed(2);
            const ch = buf.numberOfChannels === 1 ? 'MONO' : 'ST';
            const hz = buf.sampleRate ? `${(buf.sampleRate / 1000).toFixed(1)}k` : '';
            slotInfo.textContent = `${meta.name ?? `Slot ${si + 1}`} · ${dur}s · ${ch} · ${hz}`;
          } else {
            slotInfo.textContent = 'Empty';
            slotInfo.style.color = 'var(--muted)';
            slotInfo.style.opacity = '0.5';
          }

          let _slotSrc = null;
          const previewBtn = document.createElement('button');
          previewBtn.className = 'seq-btn';
          previewBtn.style.cssText = 'font-size:0.52rem;padding:2px 6px;opacity:' + (buf ? '1' : '0.3');
          previewBtn.textContent = '▶';
          previewBtn.title = 'Preview recorder slot';
          previewBtn.disabled = !buf;
          previewBtn.addEventListener('click', () => {
            if (_slotSrc) {
              try {
                _slotSrc.stop();
              } catch (_) {}
              _slotSrc = null;
              previewBtn.textContent = '▶';
              previewBtn.classList.remove('active');
              return;
            }
            const buffer = buf ?? state.recorderBuffers?.[si];
            if (!buffer || !state.engine?.context) return;
            const src = state.engine.context.createBufferSource();
            src.buffer = buffer;
            src.connect(state.engine.context.destination);
            src.start();
            _slotSrc = src;
            previewBtn.textContent = '■';
            previewBtn.classList.add('active');
            src.onended = () => {
              _slotSrc = null;
              previewBtn.textContent = '▶';
              previewBtn.classList.remove('active');
            };
          });

          const loadSlotBtn = document.createElement('button');
          loadSlotBtn.className = 'screen-btn';
          loadSlotBtn.style.cssText = 'font-size:0.52rem;padding:2px 7px;opacity:' + (buf ? '1' : '0.3');
          loadSlotBtn.textContent = '⬆ Load';
          loadSlotBtn.title = 'Load this recorder slot into track sample';
          loadSlotBtn.disabled = !buf;
          loadSlotBtn.addEventListener('click', () => {
            emit('state:change', {
              path: 'action_assignRecorderSlot',
              value: { slot: si, trackIndex: state.selectedTrackIndex },
            });
          });

          // Stop preview on page leave via cleanup chain
          const _slotStop = () => {
            try {
              _slotSrc?.stop();
            } catch (_) {}
            _slotSrc = null;
          };
          const _prev = container._cleanup;
          container._cleanup = () => {
            _slotStop();
            _prev?.();
          };

          row.append(slotLabel, slotInfo, previewBtn, loadSlotBtn);
          recCard.append(row);
        });
      }

      sampleGrid.append(recCard);
    }

    // ── Plaits card ──
    if (track.machine === 'plaits') {
      const plaitsCard = document.createElement('div');
      plaitsCard.className = 'page-card';
      plaitsCard.innerHTML = '<h4>Plaits Engine</h4>';

      const engRow = document.createElement('div');
      engRow.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px';
      PLAITS_ENGINES.forEach(({ label, value }) => {
        const btn = document.createElement('button');
        btn.className = 'ctx-btn' + (track.plEngine === value ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
          engRow.querySelectorAll('.ctx-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          emit('track:change', { trackIndex: ti, param: 'plEngine', value });
        });
        engRow.append(btn);
      });
      plaitsCard.append(engRow);

      [
        { label: 'Timbre', param: 'plTimbre', min: 0, max: 1, step: 0.01 },
        { label: 'Harmonics', param: 'plHarmonics', min: 0, max: 1, step: 0.01 },
        { label: 'Morph', param: 'plMorph', min: 0, max: 1, step: 0.01 },
      ].forEach(({ label, param, min, max, step }) =>
        plaitsCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti)),
      );

      synthWrapper.append(plaitsCard);
    }

    // ── Clouds card ──
    if (track.machine === 'clouds') {
      const cloudsCard = document.createElement('div');
      cloudsCard.className = 'page-card';
      cloudsCard.innerHTML = '<h4>Clouds Grains</h4>';

      [
        { label: 'Position', param: 'clPosition', min: 0, max: 1, step: 0.01 },
        { label: 'Size', param: 'clSize', min: 0, max: 1, step: 0.01 },
        { label: 'Density', param: 'clDensity', min: 0, max: 1, step: 0.01 },
        { label: 'Texture', param: 'clTexture', min: 0, max: 1, step: 0.01 },
      ].forEach(({ label, param, min, max, step }) =>
        cloudsCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti)),
      );

      synthWrapper.append(cloudsCard);
    }

    // ── Rings card ──
    if (track.machine === 'rings') {
      const ringsCard = document.createElement('div');
      ringsCard.className = 'page-card';
      ringsCard.innerHTML = '<h4>Rings Resonator</h4>';

      const excRow = document.createElement('div');
      excRow.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px';
      RINGS_EXCITERS.forEach(({ label, value }) => {
        const btn = document.createElement('button');
        btn.className = 'ctx-btn' + (track.rnExciter === value ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
          excRow.querySelectorAll('.ctx-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          emit('track:change', { trackIndex: ti, param: 'rnExciter', value });
        });
        excRow.append(btn);
      });
      ringsCard.append(excRow);

      [
        { label: 'Structure', param: 'rnStructure', min: 0, max: 1, step: 0.01 },
        { label: 'Brightness', param: 'rnBrightness', min: 0, max: 1, step: 0.01 },
        { label: 'Damping', param: 'rnDamping', min: 0, max: 1, step: 0.01 },
      ].forEach(({ label, param, min, max, step }) =>
        ringsCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti)),
      );

      synthWrapper.append(ringsCard);
    }

    // ── ADSR card ──
    const adsrCard = document.createElement('div');
    adsrCard.className = 'page-card';
    adsrCard.innerHTML = `<h4>Envelope</h4>`;

    // Canvas-based ADSR visualisation
    const adsrCanvas = document.createElement('canvas');
    adsrCanvas.className = 'adsr-canvas';
    adsrCanvas.width = 100;
    adsrCanvas.height = 40;
    adsrCanvas.style.cssText =
      'display:block;width:100%;height:40px;margin-bottom:6px;background:#0a0a0a;border-radius:4px;border:1px solid var(--border)';
    adsrCard.append(adsrCanvas);

    // Helper to read current ADSR values from track / live slider inputs
    function getADSRValues() {
      const inputs = adsrCard.querySelectorAll('input[type="range"]');
      return {
        a: parseFloat(inputs[0]?.value ?? track.attack ?? 0.01),
        d: parseFloat(inputs[1]?.value ?? track.decay ?? 0.1),
        s: parseFloat(inputs[2]?.value ?? track.sustain ?? 0.5),
        r: parseFloat(inputs[3]?.value ?? track.release ?? 0.2),
      };
    }

    function redrawADSR() {
      // Sync canvas pixel width to its layout width
      const layoutW = adsrCanvas.offsetWidth;
      if (layoutW > 0) adsrCanvas.width = layoutW;
      const { a, d, s, r } = getADSRValues();
      drawADSR(adsrCanvas, a, d, s, r, TRACK_COLORS[ti] ?? '#5add71');
    }

    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px';

    ADSR_PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn';
      btn.style.cssText = 'font-size:0.52rem;padding:2px 5px';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        // Update track values
        track.attack = preset.a;
        track.decay = preset.d;
        track.sustain = preset.s;
        track.release = preset.r;
        // Update slider inputs
        const inputs = adsrCard.querySelectorAll('input[type="range"]');
        const outputs = adsrCard.querySelectorAll('output');
        const vals = [preset.a, preset.d, preset.s, preset.r];
        const params = ['attack', 'decay', 'sustain', 'release'];
        vals.forEach((v, i) => {
          if (inputs[i]) {
            inputs[i].value = v;
            if (outputs[i]) outputs[i].textContent = v.toFixed(3);
            emit('track:change', { trackIndex: ti, param: params[i], value: v });
          }
        });
        redrawADSR();
      });
      presetRow.append(btn);
    });
    adsrCard.append(presetRow);

    const adsrParams = [
      { label: 'Attack', param: 'attack', min: 0.001, max: 2, step: 0.001, def: 0.01 },
      { label: 'Decay', param: 'decay', min: 0.01, max: 2, step: 0.01, def: 0.1 },
      { label: 'Sustain', param: 'sustain', min: 0, max: 1, step: 0.01, def: 0.5 },
      { label: 'Release', param: 'release', min: 0.01, max: 4, step: 0.01, def: 0.2 },
      { label: 'Gate', param: 'noteLength', min: 0.01, max: 1, step: 0.01, def: 0.5 },
    ];
    adsrParams.forEach(({ label, param, min, max, step, def }) =>
      adsrCard.append(makeSlider(label, param, min, max, step, track[param] ?? def, emit, ti)),
    );

    adsrCard.addEventListener('input', () => {
      redrawADSR();
    });

    // Draw after layout is complete
    requestAnimationFrame(() => {
      redrawADSR();
    });

    modGrid.append(adsrCard);

    // ── Filter card ──
    const FILTER_TYPES = [
      { label: 'LP', value: 'lowpass' },
      { label: 'HP', value: 'highpass' },
      { label: 'BP', value: 'bandpass' },
      { label: 'NOTCH', value: 'notch' },
      { label: 'PEAK', value: 'peaking' },
      { label: 'LSH', value: 'lowshelf' },
      { label: 'HSH', value: 'highshelf' },
    ];
    const filtCard = document.createElement('div');
    filtCard.className = 'page-card';
    filtCard.innerHTML = '<h4>Filter</h4>';

    // Filter type button row
    const filtTypeRow = document.createElement('div');
    filtTypeRow.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px';
    const currentFilterType = track.filterType ?? 'lowpass';
    FILTER_TYPES.forEach(({ label, value }) => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn';
      btn.style.cssText = 'font-size:0.52rem;padding:2px 5px;';
      btn.textContent = label;
      if (currentFilterType === value) {
        btn.style.borderColor = 'var(--accent)';
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        filtTypeRow.querySelectorAll('.ctx-btn').forEach((b) => {
          b.classList.remove('active');
          b.style.borderColor = '';
        });
        btn.classList.add('active');
        btn.style.borderColor = 'var(--accent)';
        track.filterType = value;
        emit('track:change', { trackIndex: ti, param: 'filterType', value });
        redrawModFilter();
      });
      filtTypeRow.append(btn);
    });
    filtCard.append(filtTypeRow);

    const filterCanvas = document.createElement('canvas');
    filterCanvas.className = 'snd-filter-canvas';
    filterCanvas.width = 180;
    filterCanvas.height = 40;
    filterCanvas.style.cssText =
      'display:block;width:100%;height:40px;margin-bottom:6px;background:#0a0a0a;border-radius:4px;border:1px solid var(--border)';
    filtCard.append(filterCanvas);

    function redrawModFilter() {
      const layoutW = filterCanvas.offsetWidth;
      if (layoutW > 0) filterCanvas.width = layoutW;
      const inputs = filtCard.querySelectorAll('input[type="range"]');
      const cutoff = parseFloat(inputs[0]?.value ?? track.cutoff ?? 4000);
      const resonance = parseFloat(inputs[1]?.value ?? track.resonance ?? 0.5);
      drawFilterResponse(filterCanvas, cutoff, resonance, track.filterType ?? 'lowpass', TRACK_COLORS[ti] ?? '#5add71');
    }

    const filtParams = [
      { label: 'Cutoff', param: 'cutoff', min: 80, max: 16000, step: 10 },
      { label: 'Res', param: 'resonance', min: 0.5, max: 15, step: 0.1 },
      { label: 'Reso', param: 'filterQ', min: 0.1, max: 20, step: 0.1 },
      { label: 'Drive', param: 'drive', min: 0, max: 1, step: 0.01 },
    ];
    filtParams.forEach(({ label, param, min, max, step }) => {
      const val = track[param] ?? (param === 'filterQ' ? 1.0 : undefined);
      filtCard.append(makeSlider(label, param, min, max, step, val, emit, ti));
    });

    filtCard.addEventListener('input', redrawModFilter);
    requestAnimationFrame(redrawModFilter);
    modGrid.append(filtCard);

    // ── Mix card ──
    const mixCard = document.createElement('div');
    mixCard.className = 'page-card';
    mixCard.innerHTML = '<h4>Mix</h4>';
    const mixParams = [
      { label: 'Volume', param: 'volume', min: 0, max: 1, step: 0.01 },
      { label: 'Pan', param: 'pan', min: -1, max: 1, step: 0.01 },
      { label: 'Dly Snd', param: 'delaySend', min: 0, max: 1, step: 0.01 },
      { label: 'Rev Snd', param: 'reverbSend', min: 0, max: 1, step: 0.01 },
    ];
    mixParams.forEach(({ label, param, min, max, step }) =>
      mixCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti)),
    );

    // Velocity curve selector
    const velCurveRow = document.createElement('div');
    velCurveRow.style.cssText =
      'display:flex;align-items:center;gap:5px;margin-top:6px;font-family:var(--font-mono);font-size:0.58rem';
    const velCurveLabel = document.createElement('span');
    velCurveLabel.style.cssText = 'color:var(--muted);flex-shrink:0';
    velCurveLabel.textContent = 'Vel Curve';
    const velCurveBtns = document.createElement('div');
    velCurveBtns.style.cssText = 'display:flex;gap:4px';
    ['linear', 'exp', 'comp'].forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn' + ((track.velocityCurve ?? 'linear') === c ? ' active' : '');
      btn.textContent = c === 'linear' ? 'Lin' : c === 'exp' ? 'Exp' : 'Comp';
      btn.addEventListener('click', () => {
        velCurveBtns.querySelectorAll('.ctx-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        emit('track:change', { trackIndex: ti, param: 'velocityCurve', value: c });
      });
      velCurveBtns.append(btn);
    });
    velCurveRow.append(velCurveLabel, velCurveBtns);
    mixCard.append(velCurveRow);

    // Per-track swing override row
    const swingRow = document.createElement('div');
    swingRow.style.cssText =
      'display:flex;align-items:center;gap:5px;margin-top:4px;font-family:var(--font-mono);font-size:0.58rem';
    const swingVal = track.swing ?? null;
    const swingInput = document.createElement('input');
    swingInput.type = 'range';
    swingInput.min = 0;
    swingInput.max = 0.42;
    swingInput.step = 0.01;
    swingInput.value = swingVal !== null ? swingVal : 0;
    swingInput.style.cssText = 'flex:1;accent-color:var(--accent)';
    swingInput.title = 'Track swing (empty = use global)';
    const swingLabel = document.createElement('span');
    swingLabel.style.cssText = 'color:var(--muted);min-width:28px';
    swingLabel.textContent = 'Swing';
    const swingDisplay = document.createElement('span');
    swingDisplay.style.cssText = 'color:var(--screen-text);min-width:44px;text-align:right;font-size:0.55rem';
    swingDisplay.textContent = swingVal !== null ? Math.round(swingVal * 100) + '%' : 'global';
    const swingResetBtn = document.createElement('button');
    swingResetBtn.className = 'seq-btn';
    swingResetBtn.style.cssText = 'font-size:0.5rem;padding:1px 4px';
    swingResetBtn.title = 'Reset to global swing';
    swingResetBtn.textContent = '\u21BA';
    swingInput.addEventListener('input', () => {
      const v = parseFloat(swingInput.value);
      swingDisplay.textContent = Math.round(v * 100) + '%';
      emit('track:change', { trackIndex: ti, param: 'swing', value: v });
    });
    swingResetBtn.addEventListener('click', () => {
      swingInput.value = 0;
      swingDisplay.textContent = 'global';
      emit('track:change', { trackIndex: ti, param: 'swing', value: null });
    });
    swingRow.append(swingLabel, swingInput, swingDisplay, swingResetBtn);
    mixCard.append(swingRow);

    modGrid.append(mixCard);

    // ── LFO card ──
    const lfoCard = document.createElement('div');
    lfoCard.className = 'page-card';
    lfoCard.innerHTML = '<h4>LFO</h4>';

    function formatLfoDepthPreview(target, depth) {
      const amt = Math.max(0, Number(depth) || 0);
      switch (target) {
        case 'cutoff':
          return `${Math.round(amt * Math.max(250, Math.min(6000, (track.cutoff ?? 800) * 1.25)))} Hz`;
        case 'volume':
          return `${Math.round(amt * 60)}% amp`;
        case 'pan':
          return `${amt.toFixed(2)} pan`;
        case 'pitch':
          return `${Math.round(amt * 120)} cents`;
        default:
          return amt.toFixed(2);
      }
    }

    const targetRow = document.createElement('div');
    targetRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap';
    LFO_TARGETS.forEach((tgt) => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn' + ((track.lfoTarget || 'cutoff') === tgt ? ' active' : '');
      btn.textContent = tgt.slice(0, 3).toUpperCase();
      btn.addEventListener('click', () => {
        targetRow.querySelectorAll('.ctx-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        track.lfoTarget = tgt;
        emit('track:change', { trackIndex: ti, param: 'lfoTarget', value: tgt });
        updateLfoDepthHint();
      });
      targetRow.append(btn);
    });
    lfoCard.append(targetRow);

    [
      { label: 'Rate', param: 'lfoRate', min: 0.1, max: 20, step: 0.1, value: track.lfoRate ?? 2 },
      { label: 'Depth', param: 'lfoDepth', min: 0, max: 1, step: 0.01, value: track.lfoDepth ?? 0 },
    ].forEach(({ label, param, min, max, step, value }) => {
      lfoCard.append(makeSlider(label, param, min, max, step, value, emit, ti));
    });

    const lfoDepthHint = document.createElement('div');
    lfoDepthHint.style.cssText = 'margin-top:4px;font-family:var(--font-mono);font-size:0.52rem;color:var(--muted)';
    function updateLfoDepthHint() {
      const inputs = lfoCard.querySelectorAll('input[type="range"]');
      const rawDepth = parseFloat(inputs[1]?.value ?? track.lfoDepth ?? 0);
      const target = track.lfoTarget || 'cutoff';
      lfoDepthHint.textContent = `Depth maps to ${formatLfoDepthPreview(target, rawDepth)} on ${target.toUpperCase()}`;
    }
    lfoCard.append(lfoDepthHint);

    // LFO routing destination toggles (multi-target flags)
    const lfoRoutingRow = document.createElement('div');
    lfoRoutingRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px';
    [
      { param: 'lfoToCutoff', label: '→CUTOFF' },
      { param: 'lfoToPitch', label: '→PITCH' },
      { param: 'lfoToVolume', label: '→VOL' },
    ].forEach(({ param, label }) => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn' + (track[param] ? ' active' : '');
      btn.textContent = label;
      btn.style.fontSize = '0.44rem';
      btn.addEventListener('click', () => {
        const val = !track[param];
        track[param] = val;
        btn.classList.toggle('active', val);
        emit('track:change', { trackIndex: ti, param, value: val });
        updateLfoDepthHint();
      });
      lfoRoutingRow.append(btn);
    });
    lfoCard.append(lfoRoutingRow);
    lfoCard.addEventListener('input', updateLfoDepthHint);
    requestAnimationFrame(updateLfoDepthHint);

    modGrid.append(lfoCard);

    // ── Arp card ──
    const arpCard = document.createElement('div');
    arpCard.className = 'sound-card';
    arpCard.innerHTML = `
      <div class="sound-card-title">ARP</div>
      <div class="sound-row">
        <label>Mode</label>
        <div class="btn-row" id="arp-modes-${ti}">
          <button class="seq-btn${track.arpMode === 'up' ? ' active' : ''}" data-mode="up">Up</button>
          <button class="seq-btn${track.arpMode === 'down' ? ' active' : ''}" data-mode="down">Dn</button>
          <button class="seq-btn${track.arpMode === 'updown' ? ' active' : ''}" data-mode="updown">U/D</button>
          <button class="seq-btn${track.arpMode === 'random' ? ' active' : ''}" data-mode="random">Rnd</button>
        </div>
        <button class="seq-btn${track.arpEnabled ? ' active' : ''}" id="arp-toggle-${ti}" style="color:${track.arpEnabled ? 'var(--accent)' : ''}">
          ${track.arpEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div class="sound-row">
        <label>Range</label>
        <input type="range" id="arp-range-${ti}" min="1" max="4" step="1" value="${track.arpRange ?? 1}">
        <span id="arp-range-val-${ti}">${track.arpRange ?? 1} oct</span>
      </div>
      <div class="sound-row">
        <label>Speed</label>
        <input type="range" id="arp-speed-${ti}" min="1" max="4" step="1" value="${track.arpSpeed ?? 1}">
        <span id="arp-speed-val-${ti}">${['1/16', '1/8', '1/4', '1/2'][(track.arpSpeed ?? 1) - 1]}</span>
      </div>
    `;

    // Wire mode buttons
    const arpModeRow = arpCard.querySelector(`#arp-modes-${ti}`);
    arpModeRow.querySelectorAll('.seq-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        arpModeRow.querySelectorAll('.seq-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        emit('track:change', { trackIndex: ti, param: 'arpMode', value: btn.dataset.mode });
      });
    });

    // Wire ON/OFF toggle
    const arpToggle = arpCard.querySelector(`#arp-toggle-${ti}`);
    arpToggle.addEventListener('click', () => {
      const newVal = !track.arpEnabled;
      arpToggle.classList.toggle('active', newVal);
      arpToggle.style.color = newVal ? 'var(--accent)' : '';
      arpToggle.textContent = newVal ? 'ON' : 'OFF';
      emit('track:change', { trackIndex: ti, param: 'arpEnabled', value: newVal });
    });

    // Wire range slider
    const arpRangeInput = arpCard.querySelector(`#arp-range-${ti}`);
    const arpRangeVal = arpCard.querySelector(`#arp-range-val-${ti}`);
    arpRangeInput.addEventListener('input', () => {
      const v = parseInt(arpRangeInput.value);
      arpRangeVal.textContent = v + ' oct';
      emit('track:change', { trackIndex: ti, param: 'arpRange', value: v });
    });

    // Wire speed slider
    const arpSpeedInput = arpCard.querySelector(`#arp-speed-${ti}`);
    const arpSpeedVal = arpCard.querySelector(`#arp-speed-val-${ti}`);
    arpSpeedInput.addEventListener('input', () => {
      const v = parseInt(arpSpeedInput.value);
      arpSpeedVal.textContent = ['1/16', '1/8', '1/4', '1/2'][v - 1];
      emit('track:change', { trackIndex: ti, param: 'arpSpeed', value: v });
    });

    // Arp sequence preview
    const arpPreviewLabel = document.createElement('div');
    arpPreviewLabel.className = 'arp-preview-label';
    arpPreviewLabel.textContent = 'Preview';

    let _arpPreview = buildArpPreview(track.arpMode, track.arpRange, track.pitch ?? 60, track.color);
    arpCard.append(arpPreviewLabel, _arpPreview);

    // Rebuild preview when mode or range changes
    function refreshArpPreview() {
      const newPreview = buildArpPreview(track.arpMode, track.arpRange, track.pitch ?? 60, track.color);
      _arpPreview.replaceWith(newPreview);
      _arpPreview = newPreview;
    }
    arpModeRow.querySelectorAll('.seq-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        track.arpMode = btn.dataset.mode;
        refreshArpPreview();
      });
    });
    arpRangeInput.addEventListener('input', () => {
      track.arpRange = parseInt(arpRangeInput.value);
      refreshArpPreview();
    });

    synthWrapper.append(arpCard);

    // SAMPLE tab placeholder when machine has no sample support
    if (track.machine !== 'sample' && track.machine !== 'clouds') {
      const noSampleCard = document.createElement('div');
      noSampleCard.className = 'page-card';
      noSampleCard.style.cssText =
        'grid-column:span 2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:0.5;padding:24px';
      noSampleCard.innerHTML = `<h4 style="margin:0">No Sample</h4>
        <p style="font-size:0.6rem;color:var(--muted);text-align:center;margin:0">Switch machine to SAMPLE or CLOUDS<br>to access sample controls.</p>`;
      sampleGrid.append(noSampleCard);
    }

    container.append(synthWrapper, modGrid, sampleGrid);
  },

  knobMap: [
    { label: 'Pitch', param: 'pitch', min: 0, max: 127, step: 1 },
    { label: 'Timbre', param: 'plTimbre', min: 0, max: 1, step: 0.01 },
    { label: 'Harm', param: 'plHarmonics', min: 0, max: 1, step: 0.01 },
    { label: 'Morph', param: 'plMorph', min: 0, max: 1, step: 0.01 },
    { label: 'Attack', param: 'attack', min: 0.001, max: 2, step: 0.001 },
    { label: 'Decay', param: 'decay', min: 0.01, max: 2, step: 0.01 },
    { label: 'Drive', param: 'drive', min: 0, max: 1, step: 0.01 },
    { label: 'Vol', param: 'volume', min: 0, max: 1, step: 0.01 },
  ],

  keyboardContext: 'sound',
};
