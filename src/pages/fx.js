// src/pages/fx.js — Reverb, Delay, Master, Per-Track FX

import { getActiveTrack, saveState } from '../state.js';

const FILTER_TYPES = ['lowpass', 'bandpass', 'highpass'];
const FILTER_LABELS = { lowpass: 'LP', bandpass: 'BP', highpass: 'HP' };

const REVERB_TYPES = ['room', 'hall', 'plate', 'spring', 'cathedral'];
const REVERB_LABELS = { room: 'Room', hall: 'Hall', plate: 'Plate', spring: 'Spring', cathedral: 'Cathedral' };
const REVERB_PRESETS = {
  room:      { roomSize: 0.50, damping: 0.7, preDelay: 0,     wet: 0.22 },
  hall:      { roomSize: 0.84, damping: 0.3, preDelay: 0.02,  wet: 0.28 },
  plate:     { roomSize: 0.76, damping: 0.2, preDelay: 0.005, wet: 0.25 },
  spring:    { roomSize: 0.40, damping: 0.9, preDelay: 0,     wet: 0.30 },
  cathedral: { roomSize: 0.95, damping: 0.1, preDelay: 0.04,  wet: 0.32 },
};
function _reverbPresetInfo(type) {
  const p = REVERB_PRESETS[type] ?? REVERB_PRESETS.room;
  const pre = p.preDelay > 0 ? ` pre:${Math.round(p.preDelay * 1000)}ms` : '';
  return `size:${p.roomSize.toFixed(2)} damp:${p.damping.toFixed(1)}${pre}`;
}

const DELAY_SYNC_DIVS = ['1/32', '1/16', '1/8', '1/4', '1/2', '1/1'];

// ─── EQ Canvas constants ──────────────────────────────────────────────────────

const EQ_FREQ_MIN  = 20;
const EQ_FREQ_MAX  = 20000;
const EQ_DB_MIN    = -12;
const EQ_DB_MAX    = 12;
const EQ_GRID_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
// Frequency positions for the 3 draggable points (low, mid, high)
const EQ_LOW_FREQ  = 200;
const EQ_HIGH_FREQ = 6000;  // matches engine highshelf at 6000 Hz
const EQ_DOT_R     = 5;     // drag dot radius in px

// ─── EQ Canvas helpers ────────────────────────────────────────────────────────

function freqToX(freq, width) {
  return (Math.log10(freq / EQ_FREQ_MIN) / Math.log10(EQ_FREQ_MAX / EQ_FREQ_MIN)) * width;
}

function xToFreq(x, width) {
  const t = Math.max(0, Math.min(1, x / width));
  return EQ_FREQ_MIN * Math.pow(EQ_FREQ_MAX / EQ_FREQ_MIN, t);
}

function dbToY(db, height) {
  return ((EQ_DB_MAX - db) / (EQ_DB_MAX - EQ_DB_MIN)) * height;
}

function yToDb(y, height) {
  return EQ_DB_MAX - (y / height) * (EQ_DB_MAX - EQ_DB_MIN);
}

/**
 * Draw the EQ response curve and grid on a canvas.
 * dots: [{ x, y, color, label }]
 */
function drawEQCanvas(canvas, low, mid, high, midFreq) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width  || canvas.offsetWidth  || 200;
  const H = rect.height || canvas.offsetHeight || 80;

  if (canvas.width  !== Math.round(W * dpr) ||
      canvas.height !== Math.round(H * dpr)) {
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, H);

  // ── Grid ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 0.5;
  // Vertical lines at octave frequencies
  for (const f of EQ_GRID_FREQS) {
    const x = freqToX(f, W);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();

    // Frequency label
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = `${Math.round(6 * dpr) / dpr}px monospace`;
    ctx.textAlign = 'center';
    const label = f >= 1000 ? (f / 1000) + 'k' : String(f);
    ctx.fillText(label, x, H - 2);
  }
  // Horizontal 0 dB line
  const y0 = dbToY(0, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.75;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(W, y0);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── EQ response curve (3-band approximation) ──────────────────────────────
  // We sample the approximate combined response across frequency bins.
  // Low shelf: gain ramps in over ~1 octave below/above 200Hz
  // Mid peak: gaussian-ish around midFreq with Q=1
  // High shelf: gain ramps in over ~1 octave below/above 6kHz

  ctx.beginPath();
  const SAMPLES = W;
  for (let i = 0; i <= SAMPLES; i++) {
    const f = xToFreq((i / SAMPLES) * W, W);
    let db = 0;

    // Low shelf approximation (BiquadFilter lowshelf @200Hz)
    const lowRatio = Math.log2(f / EQ_LOW_FREQ);
    db += low  * Math.max(0, Math.min(1, 0.5 - lowRatio / 2));

    // High shelf approximation (BiquadFilter highshelf @6kHz)
    const highRatio = Math.log2(f / EQ_HIGH_FREQ);
    db += high * Math.max(0, Math.min(1, 0.5 + highRatio / 2));

    // Mid peak: Q=1.0 approximation — bandwidth ≈ 1 octave
    const mfSafe = Math.max(200, Math.min(8000, midFreq));
    const octDist = Math.log2(f / mfSafe);   // 0 at center
    const bw = 1.4;                            // octaves at -3dB for Q≈1
    db += mid * Math.exp(-(octDist * octDist) / (2 * (bw / 2.355) * (bw / 2.355)));

    const y = dbToY(Math.max(EQ_DB_MIN, Math.min(EQ_DB_MAX, db)), H);
    if (i === 0) ctx.moveTo(i / SAMPLES * W, y);
    else         ctx.lineTo(i / SAMPLES * W, y);
  }

  // Fill under curve
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(var(--accent-rgb, 255,200,64),0.07)';
  ctx.fill();

  // Stroke the curve
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const f = xToFreq((i / SAMPLES) * W, W);
    let db = 0;
    const lowRatio  = Math.log2(f / EQ_LOW_FREQ);
    db += low  * Math.max(0, Math.min(1, 0.5 - lowRatio / 2));
    const highRatio = Math.log2(f / EQ_HIGH_FREQ);
    db += high * Math.max(0, Math.min(1, 0.5 + highRatio / 2));
    const mfSafe = Math.max(200, Math.min(8000, midFreq));
    const octDist = Math.log2(f / mfSafe);
    const bw = 1.4;
    db += mid * Math.exp(-(octDist * octDist) / (2 * (bw / 2.355) * (bw / 2.355)));
    const y = dbToY(Math.max(EQ_DB_MIN, Math.min(EQ_DB_MAX, db)), H);
    if (i === 0) ctx.moveTo(i / SAMPLES * W, y);
    else         ctx.lineTo(i / SAMPLES * W, y);
  }
  ctx.strokeStyle = 'var(--screen-text, #f0c640)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── Draggable dots ─────────────────────────────────────────────────────────
  const dots = [
    { freq: EQ_LOW_FREQ,             db: low,  color: '#67d7ff', label: 'L', fixed: true  },
    { freq: Math.max(200, Math.min(8000, midFreq)), db: mid,  color: '#f0c640', label: 'M', fixed: false },
    { freq: EQ_HIGH_FREQ,            db: high, color: '#ff8c52', label: 'H', fixed: true  },
  ];

  for (const dot of dots) {
    const x = freqToX(dot.freq, W);
    const y = dbToY(dot.db, H);

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, EQ_DOT_R + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, EQ_DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = dot.color;
    ctx.fill();

    // Label
    ctx.fillStyle = '#000';
    ctx.font = `bold ${Math.round(7 * dpr) / dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dot.label, x, y);
  }

  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ─── Drag state (module-level, one active drag at a time) ─────────────────────

let _eqDrag = null;  // { dot: 'low'|'mid'|'high', canvas, track, state, emit, onUpdate }

function _eqPointerDown(e, canvas, track, state, emit, onUpdate) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const px   = (e.clientX - rect.left);
  const py   = (e.clientY - rect.top);
  const W    = rect.width;
  const H    = rect.height;

  const midFreq = track.eqMidFreq ?? 1000;

  // Dot positions in CSS px
  const dots = [
    { key: 'low',  x: freqToX(EQ_LOW_FREQ,  W), y: dbToY(track.eqLow  ?? 0, H) },
    { key: 'mid',  x: freqToX(Math.max(200, Math.min(8000, midFreq)), W), y: dbToY(track.eqMid  ?? 0, H) },
    { key: 'high', x: freqToX(EQ_HIGH_FREQ, W), y: dbToY(track.eqHigh ?? 0, H) },
  ];

  const HIT = EQ_DOT_R + 4;
  for (const dot of dots) {
    const dx = px - dot.x;
    const dy = py - dot.y;
    if (dx * dx + dy * dy <= HIT * HIT) {
      _eqDrag = { dot: dot.key, canvas, track, state, emit, onUpdate, W, H };
      e.preventDefault();
      return;
    }
  }
}

function _eqPointerMove(e) {
  if (!_eqDrag) return;
  const { dot, canvas, track, state, emit, onUpdate, W, H } = _eqDrag;
  const rect = canvas.getBoundingClientRect();
  const px   = e.clientX - rect.left;
  const py   = e.clientY - rect.top;

  const rawDb   = yToDb(py, H);
  const clampDb = Math.max(EQ_DB_MIN, Math.min(EQ_DB_MAX, rawDb));
  const snapDb  = Math.round(clampDb * 2) / 2;  // snap to 0.5 dB steps

  if (dot === 'low') {
    track.eqLow = snapDb;
    emit('track:change', { trackIndex: state.selectedTrackIndex, param: 'eqLow', value: snapDb });
  } else if (dot === 'high') {
    track.eqHigh = snapDb;
    emit('track:change', { trackIndex: state.selectedTrackIndex, param: 'eqHigh', value: snapDb });
  } else if (dot === 'mid') {
    track.eqMid = snapDb;
    emit('track:change', { trackIndex: state.selectedTrackIndex, param: 'eqMid', value: snapDb });

    // Mid dot also moves left-right to change frequency
    const rawFreq  = xToFreq(px, W);
    const clampFreq = Math.max(200, Math.min(8000, rawFreq));
    const snapFreq  = Math.round(clampFreq / 10) * 10;  // snap to 10 Hz
    track.eqMidFreq = snapFreq;
    emit('track:change', { trackIndex: state.selectedTrackIndex, param: 'eqMidFreq', value: snapFreq });
  }

  onUpdate();
  e.preventDefault();
}

function _eqPointerUp() {
  if (_eqDrag) {
    saveState(_eqDrag.state);
    _eqDrag = null;
  }
}

// Attach global pointer listeners once
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', _eqPointerMove, { passive: false });
  window.addEventListener('pointerup',   _eqPointerUp);
  window.addEventListener('pointercancel', _eqPointerUp);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function calcSyncDelayTime(bpm, div) {
  const parts = div.split('/');
  const num = parseInt(parts[0], 10);
  const den = parseInt(parts[1], 10);
  return (60 / bpm) * (num / den);
}

function sliderHTML(label, param, scope, min, max, step, value) {
  const decimals = step < 1 ? 2 : 0;
  return `
    <label class="fx-row">
      <span>${label}</span>
      <output>${Number(value).toFixed(decimals)}</output>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
             data-param="${param}" data-scope="${scope}">
    </label>`;
}

function cardHTML(title, rows) {
  return `<div class="page-card"><h4>${title}</h4>${rows}</div>`;
}

function fmtDB(v) {
  const n = Number(v);
  if (n === 0) return '0 dB';
  return (n > 0 ? '+' : '') + n.toFixed(1) + ' dB';
}

function fmtFreq(v) {
  const n = Number(v);
  return n >= 1000 ? (n / 1000).toFixed(2).replace(/\.?0+$/, '') + ' kHz' : n + ' Hz';
}

function eqBandHTML(label, param, value, scope = 'eq') {
  return `
    <div class="eq-band">
      <span>${fmtDB(value)}</span>
      <input type="range" min="-12" max="12" step="0.5" value="${value}"
             data-param="${param}" data-scope="${scope}">
      <label>${label}</label>
    </div>`;
}

function compSliderHTML(label, param, min, max, step, value, unit, displayFn) {
  const displayed = displayFn ? displayFn(value) : Number(value).toFixed(step < 1 ? (step < 0.01 ? 3 : 2) : 0);
  return `
    <label class="fx-row">
      <span>${label}</span>
      <output data-comp-out="${param}">${displayed} ${unit}</output>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
             data-param="${param}" data-scope="compressor">
    </label>`;
}

// ─── EQ canvas section HTML ───────────────────────────────────────────────────

function eqCanvasSectionHTML(track) {
  const midFreq = track.eqMidFreq ?? 1000;
  return `
    <div style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:4px 0 2px">
      EQ
      <span style="margin-left:6px;color:var(--screen-text);opacity:0.6" data-eq-hint>drag dots</span>
    </div>
    <canvas class="eq-canvas" data-eq-canvas></canvas>
    <div class="eq-band-row">
      ${eqBandHTML('Low',  'eqLow',  track.eqLow  ?? 0)}
      ${eqBandHTML('Mid',  'eqMid',  track.eqMid  ?? 0)}
      ${eqBandHTML('High', 'eqHigh', track.eqHigh ?? 0)}
    </div>
    <label class="fx-row" style="margin-top:2px">
      <span>MID FREQ</span>
      <output data-eq-midfreq-out>${fmtFreq(midFreq)}</output>
      <input type="range" min="200" max="8000" step="10" value="${midFreq}"
             data-param="eqMidFreq" data-scope="eq">
    </label>`;
}

// ─── Page module ─────────────────────────────────────────────────────────────

export default {
  render(container, state, emit) {
    const module = this;
    const track = getActiveTrack(state);

    const comp = state.compressor ?? {};

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0">
        <span class="page-title" style="margin:0">FX</span>
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">${track.name}</span>
      </div>
      <div class="fx-layout" style="flex:1;min-height:0">

        <!-- Left column: per-track EQ/filter -->
        <div class="fx-left">
          <div class="page-card" data-card="track">
            <h4>TRACK: ${track.name}</h4>
            ${eqCanvasSectionHTML(track)}
            <div style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:6px 0 4px">Filter</div>
            <div style="display:flex;gap:4px;margin-bottom:6px">
              ${FILTER_TYPES.map(ft => `
                <button class="ctx-btn${(track.filterType || 'lowpass') === ft ? ' active' : ''}"
                        data-filter-type="${ft}">${FILTER_LABELS[ft]}</button>
              `).join('')}
            </div>
            ${sliderHTML('CUT',  'cutoff',    'track', 80,   18000, 1,    track.cutoff    ?? 3200)}
            ${sliderHTML('RES',  'resonance', 'track', 0.01, 30,    0.01, track.resonance ?? 1.8)}
            ${sliderHTML('DRIV', 'drive',     'track', 0,    1,     0.01, track.drive     ?? 0.18)}
            ${sliderHTML('BITS', 'bitDepth',  'track', 1,    16,    1,    track.bitDepth  ?? 16)}
            ${sliderHTML('SRR',  'srDiv',     'track', 1,    32,    1,    track.srDiv     ?? 1)}
          </div>
        </div>

        <!-- Right column: global effects -->
        <div class="fx-right">
          <div class="page-card" data-card="compressor">
            <h4>COMPRESSOR</h4>
            ${compSliderHTML('THRESH',  'threshold', -60,   0,    1,     comp.threshold ?? -18,  'dB',  null)}
            ${compSliderHTML('KNEE',    'knee',       0,    30,   1,     comp.knee      ?? 6,    'dB',  null)}
            ${compSliderHTML('RATIO',   'ratio',      1,    20,   0.5,   comp.ratio     ?? 4,    ':1',  v => Number(v).toFixed(1))}
            ${compSliderHTML('ATTACK',  'attack',     0.001, 0.5, 0.001, comp.attack    ?? 0.003,'ms',  v => (v * 1000).toFixed(1))}
            ${compSliderHTML('RELEASE', 'release',    0.01,  2,   0.01,  comp.release   ?? 0.25, 'ms',  v => Number(v * 1000).toFixed(0))}
          </div>

          ${cardHTML('REVERB', `
            <div class="fx-type-row" data-group="reverb-type">
              ${REVERB_TYPES.map(t => `
                <button class="fx-type-btn${(state.reverbType ?? 'room') === t ? ' active' : ''}"
                        data-reverb-type="${t}">${REVERB_LABELS[t]}</button>
              `).join('')}
            </div>
            <div class="fx-preset-info" data-reverb-preset-info style="font-size:0.68rem;opacity:0.55;margin:-2px 0 4px;letter-spacing:0.03em;">${_reverbPresetInfo(state.reverbType ?? 'room')}</div>
            ${sliderHTML('ROOM',  'reverbSize',     'global', 0.1,  0.98, 0.01, state.reverbSize     ?? 0.5)}
            ${sliderHTML('DAMP',  'reverbDamping',  'global', 0,    1,    0.01, state.reverbDamping  ?? 0.5)}
            ${sliderHTML('MIX',   'reverbMix',      'global', 0,    1,    0.01, state.reverbMix      ?? 0.22)}
            ${sliderHTML('PRE',   'reverbPreDelay', 'global', 0,    100,  1,    state.reverbPreDelay ?? 0)}
          `)}

          ${cardHTML('DELAY', `
            <div class="fx-sync-header">
              <span class="fx-sync-label">TIME</span>
              <button class="fx-sync-btn${(state.delaySyncEnabled ?? false) ? ' active' : ''}"
                      data-delay-sync-toggle>SYNC</button>
            </div>
            <div data-delay-time-row>
              ${!(state.delaySyncEnabled ?? false) ? `
                ${sliderHTML('', 'delayTime', 'global', 0.01, 1.4, 0.01, state.delayTime ?? 0.28)}
              ` : `
                <div class="fx-type-row fx-sync-divs" data-group="delay-sync-div">
                  ${DELAY_SYNC_DIVS.map(d => `
                    <button class="fx-type-btn${(state.delaySyncDiv ?? '1/8') === d ? ' active' : ''}"
                            data-delay-sync-div="${d}">${d}</button>
                  `).join('')}
                </div>
              `}
            </div>
            ${sliderHTML('FDBK', 'delayFeedback', 'global', 0,    0.95, 0.01, state.delayFeedback ?? 0.38)}
            ${sliderHTML('MIX',  'delayWet',      'global', 0,    1,    0.01, state.delayWet      ?? 0.3)}
          `)}

          ${cardHTML('CHORUS', `
            ${sliderHTML('RATE',  'chorusRate',  'chorus', 0.1, 8,    0.1,  state.chorusRate  ?? 0.5)}
            ${sliderHTML('DEPTH', 'chorusDepth', 'chorus', 0,   1,    0.01, state.chorusDepth ?? 0.25)}
            ${sliderHTML('MIX',   'chorusMix',   'chorus', 0,   1,    0.01, state.chorusMix   ?? 0)}
            ${sliderHTML('WIDTH', 'chorusWidth', 'chorus', 0,   1,    0.01, state.chorusWidth ?? 0.5)}
          `)}

          ${cardHTML('MASTER', `
            ${sliderHTML('DRIVE', 'masterDrive', 'global', 0, 1,    0.01, state.masterDrive ?? 0)}
            ${sliderHTML('LEVEL', 'masterLevel', 'global', 0, 1,    0.01, state.masterLevel ?? 0.82)}
            <div style="font-family:var(--font-mono);font-size:0.5rem;color:var(--muted);text-transform:uppercase;margin:6px 0 2px">MASTER EQ</div>
            <div class="eq-band-row">
              ${eqBandHTML('Low',  'masterEqLow',  state.masterEqLow  ?? 0, 'masterEQ')}
              ${eqBandHTML('Mid',  'masterEqMid',  state.masterEqMid  ?? 0, 'masterEQ')}
              ${eqBandHTML('High', 'masterEqHigh', state.masterEqHigh ?? 0, 'masterEQ')}
            </div>
          `)}
        </div>

      </div>`;

    // ── FX Preset bar ─────────────────────────────────────────────────────────
    const presetBar = document.createElement('div');
    presetBar.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:8px;flex-shrink:0;flex-wrap:wrap';

    const BUILTIN_PRESETS = [
      { name: 'Clean', values: { eqLow: 0, eqMid: 0, eqHigh: 0, reverbMix: 0, delayWet: 0, chorusMix: 0 }, comp: { threshold: -18 } },
      { name: 'Warm',  values: { eqLow: 3, eqMid: -1, eqHigh: -2, reverbMix: 0.1 }, comp: { threshold: -20 } },
      { name: 'Space', values: { reverbMix: 0.4, reverbSize: 0.8, delayWet: 0.2, chorusMix: 0.15, chorusDepth: 0.5 }, comp: {} },
      { name: 'Punch', values: { eqLow: 2 }, comp: { threshold: -24, ratio: 8, attack: 0.001, release: 0.1 } },
      { name: 'Lo-Fi', values: { eqHigh: -6, reverbMix: 0.05 }, track: { bitDepth: 8, srDiv: 4 } },
    ];

    const presetLabel = document.createElement('span');
    presetLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted)';
    presetLabel.textContent = 'PRESET:';
    presetBar.append(presetLabel);

    BUILTIN_PRESETS.forEach((preset, presetIdx) => {
      const btn = document.createElement('button');
      btn.className = 'seq-btn';
      btn.textContent = preset.name;
      btn.title = `Apply ${preset.name} FX preset`;
      btn.dataset.presetIdx = String(presetIdx);
      btn.addEventListener('click', () => {
        const t = getActiveTrack(state);
        // Apply global state values
        if (preset.values) {
          Object.entries(preset.values).forEach(([param, value]) => {
            state[param] = value;
            _applyGlobal(param, value, state);
          });
        }
        // Apply compressor values
        if (preset.comp && Object.keys(preset.comp).length > 0) {
          state.compressor = state.compressor ?? {};
          Object.assign(state.compressor, preset.comp);
          const eng = window._confusynthEngine ?? state.engine;
          if (eng?.setCompressor) eng.setCompressor(preset.comp);
        }
        // Apply per-track values
        if (preset.track) {
          Object.entries(preset.track).forEach(([param, value]) => {
            t[param] = value;
            emit('track:change', { trackIndex: state.selectedTrackIndex, param, value });
          });
        }
        // Apply global-state values that are also emitted as track changes
        if (preset.values) {
          Object.entries(preset.values).forEach(([param, value]) => {
            emit('track:change', { trackIndex: state.selectedTrackIndex, param, value });
          });
        }
        saveState(state);
        module.render(container, state, emit);
      });
      presetBar.append(btn);
    });

    // Render any saved custom presets
    if (state.customFxPresets?.length) {
      state.customFxPresets.forEach((preset, idx) => {
        const btn = document.createElement('button');
        btn.className = 'seq-btn';
        btn.textContent = preset.name;
        btn.title = `Apply custom preset: ${preset.name}`;
        btn.addEventListener('click', () => {
          const t = getActiveTrack(state);
          if (preset.values) {
            Object.entries(preset.values).forEach(([param, value]) => {
              if (['bitDepth', 'srDiv', 'eqLow', 'eqMid', 'eqHigh'].includes(param)) {
                t[param] = value;
                emit('track:change', { trackIndex: state.selectedTrackIndex, param, value });
              } else {
                state[param] = value;
                _applyGlobal(param, value, state);
              }
            });
          }
          saveState(state);
          module.render(container, state, emit);
        });
        presetBar.append(btn);
      });
    }

    // Save current FX as custom preset
    const saveBtn = document.createElement('button');
    saveBtn.className = 'seq-btn';
    saveBtn.textContent = '+ SAVE';
    saveBtn.title = 'Save current FX as custom preset';
    saveBtn.addEventListener('click', () => {
      const name = prompt('Preset name:');
      if (!name) return;
      if (!state.customFxPresets) state.customFxPresets = [];
      const t = getActiveTrack(state);
      state.customFxPresets.push({
        name,
        values: {
          eqLow:     t.eqLow     ?? 0,
          eqMid:     t.eqMid     ?? 0,
          eqHigh:    t.eqHigh    ?? 0,
          reverbMix: state.reverbMix  ?? 0.22,
          delayWet:  state.delayWet   ?? 0.3,
          chorusMix: state.chorusMix  ?? 0,
          bitDepth:  t.bitDepth  ?? 16,
          srDiv:     t.srDiv     ?? 1,
        },
      });
      saveState(state);
      module.render(container, state, emit);
    });
    presetBar.append(saveBtn);

    container.prepend(presetBar);

    // ── Stutter row ───────────────────────────────────────────────────────────
    const stutterRow = document.createElement('div');
    stutterRow.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:8px';

    const stutterLabel = document.createElement('span');
    stutterLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted)';
    stutterLabel.textContent = 'STUTTER:';

    const stutterBtn = document.createElement('button');
    stutterBtn.id = 'stutter-btn';
    stutterBtn.className = 'seq-btn' + (state.stutterActive ? ' active' : '');
    stutterBtn.textContent = state.stutterActive ? '■ STOP' : '▶ GO';
    stutterBtn.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem';

    const stutterRateSelect = document.createElement('select');
    stutterRateSelect.style.cssText = 'font-size:0.48rem;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:3px;padding:1px 4px';

    [
      { label: '1/32', value: 0.0625 },
      { label: '1/16', value: 0.125 },
      { label: '1/8',  value: 0.25 },
      { label: '1/4',  value: 0.5 },
    ].forEach(({label, value}) => {
      const opt = document.createElement('option');
      opt.value = String(value); opt.textContent = label;
      if (Math.abs(value - (state.stutterRate ?? 0.125)) < 0.001) opt.selected = true;
      stutterRateSelect.append(opt);
    });

    stutterRateSelect.addEventListener('change', () => {
      state.stutterRate = parseFloat(stutterRateSelect.value);
      const eng = window._confusynthEngine ?? state.engine;
      if (eng?.setStutterRate) eng.setStutterRate(state.stutterRate);
    });

    stutterBtn.addEventListener('click', () => {
      state.stutterActive = !state.stutterActive;
      stutterBtn.classList.toggle('active', state.stutterActive);
      stutterBtn.textContent = state.stutterActive ? '■ STOP' : '▶ GO';
      const eng = window._confusynthEngine ?? state.engine;
      if (state.stutterActive) eng?.startStutter?.(state.stutterRate ?? 0.125);
      else eng?.stopStutter?.();
    });

    stutterRow.append(stutterLabel, stutterBtn, stutterRateSelect);

    // Insert at top of fx page after preset bar
    const firstCard = container.querySelector('.page-card');
    if (firstCard) firstCard.insertAdjacentElement('beforebegin', stutterRow);
    else container.prepend(stutterRow);

    // ── Compressor gain-reduction meter ──────────────────────────────────────
    const compCard = container.querySelector('[data-card="compressor"]');
    if (compCard) {
      const grCanvas = document.createElement('canvas');
      grCanvas.width = 8; grCanvas.height = 60;
      grCanvas.style.cssText = 'position:absolute;right:4px;top:24px;border-radius:2px;background:#111';
      compCard.style.position = 'relative';
      compCard.append(grCanvas);

      let grRaf;
      function drawGR() {
        const reduction = state.engine?.masterCompressor?.reduction ?? 0;
        const ctx2d = grCanvas.getContext('2d');
        ctx2d.clearRect(0, 0, 8, 60);
        const h = Math.min(60, (Math.abs(reduction) / 20) * 60);
        if (h > 0) {
          const g = ctx2d.createLinearGradient(0, 60 - h, 0, 60);
          g.addColorStop(0, '#f44'); g.addColorStop(1, '#4f4');
          ctx2d.fillStyle = g;
          ctx2d.fillRect(0, 60 - h, 8, h);
        }
        if (container.isConnected) grRaf = requestAnimationFrame(drawGR);
      }
      drawGR();
    }

    // ── EQ canvas setup ──────────────────────────────────────────────────────
    const eqCanvas = container.querySelector('[data-eq-canvas]');

    function redrawEQ() {
      if (!eqCanvas) return;
      // Sync slider displays with current track values
      _syncEQSliderDisplays(container, track);
      drawEQCanvas(
        eqCanvas,
        track.eqLow     ?? 0,
        track.eqMid     ?? 0,
        track.eqHigh    ?? 0,
        track.eqMidFreq ?? 1000
      );
    }

    // Draw once layout is settled — double-rAF ensures the canvas has real
    // layout dimensions before we read getBoundingClientRect inside drawEQCanvas.
    requestAnimationFrame(() => requestAnimationFrame(redrawEQ));

    // Redraw on resize
    const _resizeObs = new ResizeObserver(redrawEQ);
    _resizeObs.observe(eqCanvas);
    // Disconnect on next render (page navigation triggers a new render)
    eqCanvas._resizeObs = _resizeObs;

    // Drag start
    eqCanvas.addEventListener('pointerdown', e => {
      _eqPointerDown(e, eqCanvas, track, state, emit, redrawEQ);
    });

    // ── Slider / input events ────────────────────────────────────────────────
    container.addEventListener('input', e => {
      const input = e.target;
      if (input.tagName !== 'INPUT' || input.type !== 'range') return;
      const { param, scope } = input.dataset;
      if (!param) return;

      const step = parseFloat(input.step);
      const v = step >= 1 ? parseInt(input.value, 10) : parseFloat(input.value);

      if (scope === 'eq') {
        if (param === 'eqMidFreq') {
          track.eqMidFreq = v;
          const out = container.querySelector('[data-eq-midfreq-out]');
          if (out) out.textContent = fmtFreq(v);
          emit('track:change', { trackIndex: state.selectedTrackIndex, param, value: v });
          redrawEQ();
          saveState(state);
          return;
        }
        // eqLow / eqMid / eqHigh
        const band = input.closest('.eq-band');
        if (band) band.querySelector('span').textContent = fmtDB(v);
        track[param] = v;
        emit('track:change', { trackIndex: state.selectedTrackIndex, param, value: v });
        redrawEQ();
        saveState(state);
        return;
      }

      if (scope === 'masterEQ') {
        const band = input.closest('.eq-band');
        if (band) band.querySelector('span').textContent = fmtDB(v);
        state[param] = v;
        const eng = window._confusynthEngine;
        if (eng?.setMasterEQ) {
          eng.setMasterEQ(state.masterEqLow ?? 0, state.masterEqMid ?? 0, state.masterEqHigh ?? 0);
        }
        saveState(state);
        return;
      }

      if (scope === 'chorus') {
        const out = input.closest('label')?.querySelector('output');
        if (out) out.textContent = Number(v).toFixed(step < 1 ? 2 : 0);
        state[param] = v;
        const eng = window._confusynthEngine;
        if (param === 'chorusRate'  && eng?.setChorusRate)  eng.setChorusRate(v);
        if (param === 'chorusDepth' && eng?.setChorusDepth) eng.setChorusDepth(v);
        if (param === 'chorusMix'   && eng?.setChorusMix)   eng.setChorusMix(v);
        if (param === 'chorusWidth' && eng?.setChorusWidth) eng.setChorusWidth(v);
        saveState(state);
        return;
      }

      if (scope === 'compressor') {
        const out = container.querySelector(`[data-comp-out="${param}"]`);
        if (out) {
          let displayed;
          if (param === 'attack')  displayed = (v * 1000).toFixed(1) + ' ms';
          else if (param === 'release') displayed = (v * 1000).toFixed(0) + ' ms';
          else if (param === 'ratio')   displayed = Number(v).toFixed(1) + ' :1';
          else if (param === 'threshold' || param === 'knee') displayed = Number(v).toFixed(0) + ' dB';
          else displayed = String(v);
          out.textContent = displayed;
        }
        state.compressor = state.compressor ?? {};
        state.compressor[param] = v;
        const eng = window._confusynthEngine;
        if (eng?.setCompressor) eng.setCompressor({ [param]: v });
        saveState(state);
        return;
      }

      const out = input.closest('label')?.querySelector('output');
      if (out) out.textContent = Number(v).toFixed(step < 1 ? 2 : 0);

      if (scope === 'global') {
        state[param] = v;
        _applyGlobal(param, v, state);
      } else if (scope === 'track') {
        track[param] = v;
        emit('track:change', { trackIndex: state.selectedTrackIndex, param, value: v });
      }

      saveState(state);
    });

    container.addEventListener('click', e => {
      // ── Filter type ─────────────────────────────────────────────────────────
      const filterBtn = e.target.closest('[data-filter-type]');
      if (filterBtn) {
        const ft = filterBtn.dataset.filterType;
        track.filterType = ft;
        container.querySelectorAll('[data-filter-type]').forEach(b =>
          b.classList.toggle('active', b.dataset.filterType === ft)
        );
        emit('track:change', { trackIndex: state.selectedTrackIndex, param: 'filterType', value: ft });
        saveState(state);
        return;
      }

      // ── Reverb type ─────────────────────────────────────────────────────────
      const reverbBtn = e.target.closest('[data-reverb-type]');
      if (reverbBtn) {
        const rt = reverbBtn.dataset.reverbType;
        state.reverbType = rt;
        container.querySelectorAll('[data-reverb-type]').forEach(b =>
          b.classList.toggle('active', b.dataset.reverbType === rt)
        );
        const eng = window._confusynthEngine ?? state.engine;
        if (eng?.setReverbPreset) eng.setReverbPreset(rt);
        else if (eng?.setReverbType) eng.setReverbType(rt);
        // Update preset info label
        const infoEl = container.querySelector('[data-reverb-preset-info]');
        if (infoEl) infoEl.textContent = _reverbPresetInfo(rt);
        emit('state:change', { param: 'reverbType', value: rt });
        saveState(state);
        return;
      }

      // ── Delay sync toggle ────────────────────────────────────────────────────
      const syncToggle = e.target.closest('[data-delay-sync-toggle]');
      if (syncToggle) {
        state.delaySyncEnabled = !(state.delaySyncEnabled ?? false);
        syncToggle.classList.toggle('active', state.delaySyncEnabled);
        const timeRow = container.querySelector('[data-delay-time-row]');
        if (timeRow) {
          if (state.delaySyncEnabled) {
            timeRow.innerHTML = `
              <div class="fx-type-row fx-sync-divs" data-group="delay-sync-div">
                ${DELAY_SYNC_DIVS.map(d => `
                  <button class="fx-type-btn${(state.delaySyncDiv ?? '1/8') === d ? ' active' : ''}"
                          data-delay-sync-div="${d}">${d}</button>
                `).join('')}
              </div>`;
            const bpm = state.bpm ?? 120;
            const t = calcSyncDelayTime(bpm, state.delaySyncDiv ?? '1/8');
            const eng2 = window._confusynthEngine ?? state.engine;
            if (eng2?.setDelayTime) eng2.setDelayTime(t);
          } else {
            timeRow.innerHTML = sliderHTML('', 'delayTime', 'global', 0.01, 1.4, 0.01, state.delayTime ?? 0.28);
          }
        }
        saveState(state);
        return;
      }

      // ── Delay sync division ──────────────────────────────────────────────────
      const syncDivBtn = e.target.closest('[data-delay-sync-div]');
      if (syncDivBtn) {
        const div = syncDivBtn.dataset.delaySyncDiv;
        state.delaySyncDiv = div;
        container.querySelectorAll('[data-delay-sync-div]').forEach(b =>
          b.classList.toggle('active', b.dataset.delaySyncDiv === div)
        );
        const bpm = state.bpm ?? 120;
        const t = calcSyncDelayTime(bpm, div);
        state.delayTime = t;
        const eng3 = window._confusynthEngine ?? state.engine;
        if (eng3?.setDelayTime) eng3.setDelayTime(t);
        saveState(state);
        return;
      }
    });
  },

  knobMap: [
    { label: 'RevRoom', param: 'reverbSize',    min: 0.1,  max: 0.98, step: 0.01 },
    { label: 'RevDamp', param: 'reverbDamping', min: 0,    max: 1,    step: 0.01 },
    { label: 'RevMix',  param: 'reverbMix',     min: 0,    max: 1,    step: 0.01 },
    { label: 'DlyTime', param: 'delayTime',     min: 0.01, max: 1.4,  step: 0.01 },
    { label: 'DlyFb',   param: 'delayFeedback', min: 0,    max: 0.95, step: 0.01 },
    { label: 'ChrRate', param: 'chorusRate',    min: 0.1,  max: 8,    step: 0.1  },
    { label: 'ChrMix',  param: 'chorusMix',     min: 0,    max: 1,    step: 0.01 },
    { label: 'Drive',   param: 'masterDrive',   min: 0,    max: 1,    step: 0.01 },
  ],

  keyboardContext: 'fx',
};

// ─── Sync slider displays from current track values (used after drag) ─────────

function _syncEQSliderDisplays(container, track) {
  // Sync each vertical EQ band slider and its dB label
  const paramMap = { eqLow: track.eqLow ?? 0, eqMid: track.eqMid ?? 0, eqHigh: track.eqHigh ?? 0 };
  for (const [param, val] of Object.entries(paramMap)) {
    const input = container.querySelector(`input[data-param="${param}"][data-scope="eq"]`);
    if (input) {
      input.value = val;
      const band = input.closest('.eq-band');
      if (band) band.querySelector('span').textContent = fmtDB(val);
    }
  }
  // Sync MID FREQ slider
  const freqInput = container.querySelector('input[data-param="eqMidFreq"]');
  if (freqInput) {
    freqInput.value = track.eqMidFreq ?? 1000;
    const out = container.querySelector('[data-eq-midfreq-out]');
    if (out) out.textContent = fmtFreq(track.eqMidFreq ?? 1000);
  }
}

// ─── Global parameter application ────────────────────────────────────────────

function _applyGlobal(param, v, state) {
  const eng = state.engine;
  if (!eng) return;
  if (param === 'reverbSize'     && eng.setReverbRoomSize)  eng.setReverbRoomSize(v);
  if (param === 'reverbDamping'  && eng.setReverbDamping)   eng.setReverbDamping(v);
  if (param === 'reverbPreDelay' && eng.setReverbPreDelay)  eng.setReverbPreDelay(v);
  if (param === 'delayTime'      && eng.setDelayTime)       eng.setDelayTime(v);
  if (param === 'delayFeedback'  && eng.setDelayFeedback)   eng.setDelayFeedback(v);
  if (param === 'delayWet'       && eng.setDelayMix)        eng.setDelayMix(v);
  if (param === 'masterLevel'    && eng.setMasterLevel)     eng.setMasterLevel(v);
  if (param === 'reverbMix'      && eng.setReverbMix)       eng.setReverbMix(v);
  if (param === 'masterDrive'    && eng.setMasterDrive)     eng.setMasterDrive(v);
}
