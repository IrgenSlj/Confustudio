// src/pages/sound.js — Machine type, waveform, ADSR, filter
import { openSampleBrowser } from '../sample-browser.js';
import { TRACK_COLORS } from '../state.js';

const MACHINES  = ['tone', 'noise', 'sample', 'midi', 'plaits', 'clouds', 'rings'];
const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToNoteName(midi) {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + oct;
}

// ── Pitch detection via autocorrelation ───────────────────────────────────────
// Returns the detected MIDI note (21–108), or null if no clear pitch is found.
// Uses only the first 4096 samples to keep CPU cost bounded.
function detectPitch(buffer, sampleRate) {
  const data = buffer.getChannelData(0).slice(0, 4096);
  const SIZE = data.length;
  const corr = new Float32Array(SIZE);

  for (let lag = 0; lag < SIZE; lag++) {
    let sum = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      sum += data[i] * data[i + lag];
    }
    corr[lag] = sum;
  }

  const minLag = Math.round(sampleRate / 2000); // 2 kHz max
  const maxLag = Math.round(sampleRate / 40);   // 40 Hz min

  let bestLag = -1, bestCorr = -Infinity;
  for (let lag = minLag; lag < Math.min(maxLag, SIZE); lag++) {
    if (corr[lag] > bestCorr) {
      bestCorr = corr[lag];
      bestLag = lag;
    }
  }

  if (bestLag === -1 || bestCorr < 0.01) return null;
  const freq = sampleRate / bestLag;
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(21, Math.min(108, midi));
}

const CHORD_VOICINGS = {
  off:  [],
  maj:  [0, 4, 7],
  min:  [0, 3, 7],
  pwr:  [0, 7, 12],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
};

const WAVEFORM_SVGS = {
  sine:     `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><path d="M0,5 C2,5 3,1 5,1 C7,1 8,9 10,9 C12,9 13,1 15,1 C17,1 18,5 20,5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  triangle: `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><polyline points="0,9 5,1 10,9 15,1 20,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  sawtooth: `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><polyline points="0,9 10,1 10,9 20,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  square:   `<svg width="20" height="10" viewBox="0 0 20 10" xmlns="http://www.w3.org/2000/svg"><polyline points="0,9 0,1 10,1 10,9 20,9 20,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
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

  const barEls = bars.map(offset => {
    const heightPct = 20 + ((offset / maxOffset) * 75);
    const el = document.createElement('div');
    el.className = 'arp-preview-bar';
    el.style.cssText = `height:${heightPct.toFixed(0)}%;background:${color};`;
    return el;
  });

  const wrap = document.createElement('div');
  wrap.className = 'arp-preview';
  barEls.forEach(b => wrap.appendChild(b));
  return wrap;
}

const MACHINE_BADGE_COLORS = {
  tone:   { bg: '#ff7a00', text: '#000' },
  noise:  { bg: '#ff7a00', text: '#000' },
  sample: { bg: '#2277ff', text: '#fff' },
  plaits: { bg: '#22aa44', text: '#fff' },
  clouds: { bg: '#7744cc', text: '#fff' },
  rings:  { bg: '#009988', text: '#fff' },
  midi:   { bg: '#ddcc00', text: '#000' },
};

const LFO_TARGETS = ['cutoff', 'volume', 'pan', 'pitch'];

const PLAITS_ENGINES = [
  { label: 'VA',     value: 0 },
  { label: 'Wave',   value: 1 },
  { label: 'FM2',    value: 2 },
  { label: 'String', value: 3 },
  { label: 'Chord',  value: 4 },
];

const RINGS_EXCITERS = [
  { label: 'Impulse', value: 0 },
  { label: 'Noise',   value: 1 },
  { label: 'Bow',     value: 2 },
];

// ── Canvas-based ADSR visualizer ──────────────────────────────────────────────
function drawADSR(canvas, attack, decay, sustain, release, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 4) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  const totalTime = attack + decay + 0.3 + release;
  const aN = (attack / totalTime) * W * 0.8;
  const dN = (decay / totalTime) * W * 0.8;
  const sN = W * 0.15;
  const rN = (release / totalTime) * W * 0.8;

  const pad = 4;
  const top = pad;
  const bot = H - pad;
  const susY = bot - (sustain * (H - pad * 2));

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
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, W, H);

  const freqToX = f => (Math.log10(f / 20) / Math.log10(1000)) * W;
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
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(cutoffX, 0); ctx.lineTo(cutoffX, H); ctx.stroke();
  ctx.setLineDash([]);
}

// ── Legacy SVG helpers kept for non-SYNTH-tab uses ───────────────────────────
function buildEnvelopeSVG(attack, decay, sustain = 0.6, release = 0.3) {
  const W = 180, H = 48;
  const aX  = 4 + attack * 60;
  const dX  = aX + decay * 40;
  const sY  = H - sustain * (H - 4) - 2;
  const rX  = dX + 20 + release * 40;
  const pts = `M4,${H} L${aX},4 L${dX},${sY} L${dX + 20},${sY} L${rX},${H}`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" width="100%" height="48"
    style="display:block;background:#0a0a0a;border-radius:4px;border:1px solid var(--border)">
    <path d="${pts}" fill="none" stroke="var(--live)" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${aX}" cy="4"    r="2.5" fill="var(--accent)"/>
    <circle cx="${dX}" cy="${sY}" r="2.5" fill="var(--accent)"/>
  </svg>`;
}

function buildFilterSVG(cutoff, resonance) {
  const W = 180, H = 40;
  const cx = 10 + (Math.log(cutoff / 80) / Math.log(200)) * (W - 20);
  const peakY = Math.max(4, H - resonance * 10 - 8);
  const pts = `M4,${H - 4} Q${cx * 0.6},${H - 4} ${cx - 8},${H - 6} L${cx},${peakY} L${cx + 8},${H - 6} Q${cx + 20},${H - 2} ${W - 4},${H - 2}`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" width="100%" height="40"
    style="display:block;background:#0a0a0a;border-radius:4px;border:1px solid var(--border)">
    <path d="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
  </svg>`;
}

function makeSlider(label, param, min, max, step, value, emit, trackIndex) {
  const row = document.createElement('label');
  row.innerHTML = `
    <span>${label}</span>
    <output>${Number(value).toFixed(step < 1 ? 2 : 0)}</output>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
  `;
  const input  = row.querySelector('input');
  const output = row.querySelector('output');
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    output.textContent = v.toFixed(step < 1 ? 2 : 0);
    emit('track:change', { trackIndex, param, value: v });
  });
  return row;
}

/**
 * Draw the waveform for `audioBuffer` onto `canvas`.
 *
 * The view window is defined by [viewStart, viewEnd] as 0–1 fractions of the
 * full buffer (controlled by zoom + pan).  sampleStart/sampleEnd are the trim
 * handles drawn inside that window.  loopStart/loopEnd are the loop markers.
 * bitDepth is optional; when < 16 a "LO-FI" label is drawn at the top-right.
 */
function drawWaveform(canvas, audioBuffer, sampleStart, sampleEnd,
                      viewStart = 0, viewEnd = 1,
                      loopStart = 0, loopEnd = 1, loopEnabled = false,
                      bitDepth = 32, playbackPos = null) {
  if (!audioBuffer) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  const ctx2d = canvas.getContext('2d');
  const W = canvas.offsetWidth || 200;
  const H = canvas.height;
  canvas.width = W;
  ctx2d.clearRect(0, 0, W, H);

  const data    = audioBuffer.getChannelData(0);
  const totalSamples = data.length;

  // Map a 0–1 fraction of total buffer to canvas X
  const fracToX = (frac) => ((frac - viewStart) / (viewEnd - viewStart)) * W;

  // Waveform data — draw only the [viewStart, viewEnd] slice
  const startSample = Math.floor(viewStart * totalSamples);
  const endSample   = Math.ceil(viewEnd   * totalSamples);
  const windowLen   = endSample - startSample;
  const step        = Math.max(1, Math.floor(windowLen / W));

  ctx2d.strokeStyle = '#a0c060';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();

  for (let x = 0; x < W; x++) {
    const sIdx = startSample + Math.floor((x / W) * windowLen);
    let min = 1, max = -1;
    for (let i = 0; i < step; i++) {
      const v = data[sIdx + i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMin = ((1 + min) / 2) * H;
    const yMax = ((1 + max) / 2) * H;
    if (x === 0) ctx2d.moveTo(x, yMin);
    ctx2d.lineTo(x, yMin);
    ctx2d.lineTo(x, yMax);
  }
  ctx2d.stroke();

  // Center line
  ctx2d.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx2d.beginPath();
  ctx2d.moveTo(0, H / 2);
  ctx2d.lineTo(W, H / 2);
  ctx2d.stroke();

  // ── Trim region shading (outside start/end dims out) ──────────────────────
  const sX = fracToX(sampleStart);
  const eX = fracToX(sampleEnd);
  ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
  if (sX > 0) ctx2d.fillRect(0, 0, sX, H);
  if (eX < W) ctx2d.fillRect(eX, 0, W - eX, H);

  // ── Loop region fill (cyan tint between loopStart and loopEnd) ────────────
  if (loopEnabled) {
    const lsX = Math.max(0, fracToX(loopStart));
    const leX = Math.min(W, fracToX(loopEnd));
    if (leX > lsX) {
      ctx2d.fillStyle = 'rgba(0,220,220,0.10)';
      ctx2d.fillRect(lsX, 0, leX - lsX, H);
    }
  }

  // ── Trim handle lines ─────────────────────────────────────────────────────
  if (sX >= 0 && sX <= W) {
    ctx2d.strokeStyle = '#f0c640';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(sX, 0);
    ctx2d.lineTo(sX, H);
    ctx2d.stroke();
  }
  if (eX >= 0 && eX <= W) {
    ctx2d.strokeStyle = '#ff8c52';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(eX, 0);
    ctx2d.lineTo(eX, H);
    ctx2d.stroke();
  }

  // ── Loop marker lines ─────────────────────────────────────────────────────
  if (loopEnabled) {
    const lsX = fracToX(loopStart);
    const leX = fracToX(loopEnd);
    ctx2d.setLineDash([3, 3]);
    ctx2d.lineWidth = 1.5;
    if (lsX >= 0 && lsX <= W) {
      ctx2d.strokeStyle = '#00e5e5';
      ctx2d.beginPath();
      ctx2d.moveTo(lsX, 0);
      ctx2d.lineTo(lsX, H);
      ctx2d.stroke();
    }
    if (leX >= 0 && leX <= W) {
      ctx2d.strokeStyle = '#00cccc';
      ctx2d.beginPath();
      ctx2d.moveTo(leX, 0);
      ctx2d.lineTo(leX, H);
      ctx2d.stroke();
    }
    ctx2d.setLineDash([]);
  }

  // ── Start point marker — orange dashed line + triangle ───────────────────
  const spX = fracToX(sampleStart ?? 0);
  if (spX >= 0 && spX <= W) {
    ctx2d.save();
    ctx2d.strokeStyle = '#f90';
    ctx2d.lineWidth = 2;
    ctx2d.setLineDash([4, 3]);
    ctx2d.beginPath(); ctx2d.moveTo(spX, 0); ctx2d.lineTo(spX, H); ctx2d.stroke();
    ctx2d.setLineDash([]);
    // Triangle indicator at top
    ctx2d.fillStyle = '#f90';
    ctx2d.beginPath(); ctx2d.moveTo(spX, 0); ctx2d.lineTo(spX + 8, 0); ctx2d.lineTo(spX, 12); ctx2d.fill();
    ctx2d.restore();
  }

  // ── Playback position indicator ───────────────────────────────────────────
  if (playbackPos != null) {
    const px = fracToX(playbackPos);
    ctx2d.save();
    ctx2d.strokeStyle = '#fff';
    ctx2d.lineWidth = 1;
    ctx2d.globalAlpha = 0.7;
    ctx2d.beginPath(); ctx2d.moveTo(px, 0); ctx2d.lineTo(px, H); ctx2d.stroke();
    ctx2d.restore();
  }

  // ── LO-FI indicator ───────────────────────────────────────────────────────
  if (bitDepth < 16) {
    ctx2d.font = 'bold 9px monospace';
    ctx2d.textAlign = 'right';
    ctx2d.textBaseline = 'top';
    ctx2d.fillStyle = '#ff3333';
    ctx2d.fillText('LO-FI', W - 3, 2);
    ctx2d.textAlign = 'left';
  }
}

function makeSampleLoader(track, ti, emit, machCard, state) {
  // ── Local view state ──────────────────────────────────────────────────────
  let waveZoom    = 1;   // 1, 2, 4, or 8
  let wavePan     = 0;   // 0–1: how far through the zoomable region we're panned
  let _samplePlaybackPos = null;  // null or 0–1 fraction for animated preview playhead

  // Compute the [viewStart, viewEnd] window from zoom and pan
  function viewWindow() {
    const span      = 1 / waveZoom;
    const maxOffset = 1 - span;
    const offset    = wavePan * maxOffset;
    return { viewStart: offset, viewEnd: offset + span };
  }

  // ── Info + load button ────────────────────────────────────────────────────
  const sampleInfo = document.createElement('div');
  sampleInfo.style.cssText = 'margin-top:8px;font-family:var(--font-mono);font-size:0.62rem;color:var(--muted)';
  if (track.sampleBuffer) {
    const durSec = (track.sampleBuffer.length / track.sampleBuffer.sampleRate).toFixed(2);
    const chStr  = track.sampleBuffer.numberOfChannels === 1 ? 'MONO' : 'STEREO';
    sampleInfo.textContent = `${durSec}s · ${chStr} · ${track.sampleBuffer.sampleRate}Hz`;
  } else {
    sampleInfo.textContent = 'No sample loaded';
  }

  const loadBtn = document.createElement('button');
  loadBtn.className = 'screen-btn';
  loadBtn.style.marginTop = '6px';
  loadBtn.textContent = 'Load Sample';
  loadBtn.addEventListener('click', () => emit('state:change', { path: 'action_loadSample', value: ti }));

  // ── Waveform canvas wrap ──────────────────────────────────────────────────
  const wfWrap = document.createElement('div');
  wfWrap.className = 'sample-waveform-wrap';

  const wfCanvas = document.createElement('canvas');
  wfCanvas.className = 'sample-waveform';
  wfCanvas.height = 48;
  wfCanvas.style.display = 'none';

  const playhead = document.createElement('div');
  playhead.className = 'sample-playhead';
  playhead.style.display = 'none';

  wfWrap.append(wfCanvas, playhead);

  // Forward-declare previewBtn so animateSamplePlayhead can reference it
  let previewBtn;

  // ── Canvas drag: start point marker ──────────────────────────────────────
  let _draggingStart = false;

  function canvasFracFromEvent(e) {
    const rect = wfCanvas.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    // Convert canvas x-fraction back to buffer fraction via view window
    const { viewStart, viewEnd } = viewWindow();
    return viewStart + xFrac * (viewEnd - viewStart);
  }

  function isNearStartMarker(e) {
    if (!track.sampleBuffer) return false;
    const rect = wfCanvas.getBoundingClientRect();
    const { viewStart, viewEnd } = viewWindow();
    const startFrac = track.sampleStart ?? 0;
    // Hit-test: within 8px of the marker
    const markerX = ((startFrac - viewStart) / (viewEnd - viewStart)) * rect.width;
    const pointerX = e.clientX - rect.left;
    return Math.abs(pointerX - markerX) < 8;
  }

  wfCanvas.addEventListener('pointerdown', (e) => {
    if (!track.sampleBuffer) return;
    if (isNearStartMarker(e)) {
      _draggingStart = true;
      wfCanvas.setPointerCapture(e.pointerId);
      wfCanvas.style.cursor = 'ew-resize';
      e.preventDefault();
    }
  });

  wfCanvas.addEventListener('pointermove', (e) => {
    if (_draggingStart) {
      const newFrac = canvasFracFromEvent(e);
      const clamped = Math.max(0, Math.min(track.sampleEnd ?? 1, newFrac));
      track.sampleStart = clamped;
      startSlider.value = clamped;
      const startHdr = startLbl.querySelector('span');
      if (startHdr) startHdr.textContent = 'Start ' + clamped.toFixed(3);
      emit('track:change', { trackIndex: ti, param: 'sampleStart', value: clamped });
      redraw();
    } else if (track.sampleBuffer && isNearStartMarker(e)) {
      wfCanvas.style.cursor = 'ew-resize';
    } else {
      wfCanvas.style.cursor = '';
    }
  });

  wfCanvas.addEventListener('pointerup', () => {
    if (_draggingStart) {
      _draggingStart = false;
      wfCanvas.style.cursor = '';
    }
  });

  // Redraw helper — reads current slider values and loop state
  function redraw() {
    const { viewStart, viewEnd } = viewWindow();
    drawWaveform(
      wfCanvas,
      track.sampleBuffer,
      parseFloat(startSlider.value),
      parseFloat(endSlider.value),
      viewStart,
      viewEnd,
      parseFloat(loopStartSlider.value),
      parseFloat(loopEndSlider.value),
      loopEnabledRef.value,
      track.bitDepth ?? 32,
      _samplePlaybackPos
    );
  }

  // ── Animated preview playhead ─────────────────────────────────────────────
  // playbackPos stored as a fraction of the full buffer (0–1) for fracToX mapping
  function animateSamplePlayhead(source, duration) {
    const ctx = source.context;
    const startTime = ctx.currentTime;
    const startFrac = track.sampleStart ?? 0;
    const endFrac   = track.sampleEnd   ?? 1;
    function tick() {
      const elapsed = ctx.currentTime - startTime;
      const segFrac = Math.min(1, elapsed / duration);
      // Map segment fraction into full-buffer fraction space
      _samplePlaybackPos = startFrac + segFrac * (endFrac - startFrac);
      redraw();
      if (elapsed < duration && wfCanvas.isConnected) {
        requestAnimationFrame(tick);
      } else {
        _samplePlaybackPos = null;
        redraw();
        previewBtn.textContent = 'Preview';
        previewBtn.classList.remove('active');
      }
    }
    requestAnimationFrame(tick);
  }

  // ── Zoom controls ─────────────────────────────────────────────────────────
  const zoomRow = document.createElement('div');
  zoomRow.className = 'wf-zoom-row';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'wf-zoom-btn';
  zoomOutBtn.textContent = '−';
  zoomOutBtn.title = 'Zoom out';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'wf-zoom-btn';
  zoomInBtn.textContent = '+';
  zoomInBtn.title = 'Zoom in';

  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'wf-zoom-label';
  zoomLabel.textContent = '1×';

  function updateZoomLabel() {
    zoomLabel.textContent = waveZoom + '×';
    panSliderWrap.style.display = waveZoom > 1 ? 'block' : 'none';
    redraw();
  }

  zoomOutBtn.addEventListener('click', () => {
    if (waveZoom > 1) { waveZoom = waveZoom / 2; updateZoomLabel(); }
  });
  zoomInBtn.addEventListener('click', () => {
    if (waveZoom < 8) { waveZoom = waveZoom * 2; updateZoomLabel(); }
  });

  zoomRow.append(zoomOutBtn, zoomLabel, zoomInBtn);

  // ── Pan slider (only visible when zoomed in) ──────────────────────────────
  const panSliderWrap = document.createElement('div');
  panSliderWrap.className = 'wf-pan-wrap';
  panSliderWrap.style.display = 'none';

  const panSlider = document.createElement('input');
  panSlider.type = 'range';
  panSlider.min = 0; panSlider.max = 1; panSlider.step = 0.001;
  panSlider.value = 0;
  panSlider.className = 'wf-pan-slider';
  panSlider.title = 'Pan view';

  panSlider.addEventListener('input', () => {
    wavePan = parseFloat(panSlider.value);
    redraw();
  });

  panSliderWrap.append(panSlider);

  // ── Start / End trim sliders row ──────────────────────────────────────────
  const seRow = document.createElement('div');
  seRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px';

  function makeSeSlider(label, param, defaultVal) {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);display:flex;flex-direction:column;gap:2px';
    const hdr = document.createElement('span');
    hdr.textContent = label + ' ' + Number(track[param] ?? defaultVal).toFixed(3);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = 0; inp.max = 1; inp.step = 0.001;
    inp.value = track[param] ?? defaultVal;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      hdr.textContent = label + ' ' + v.toFixed(3);
      emit('track:change', { trackIndex: ti, param, value: v });
      redraw();
    });
    // Snap-to-grid (0.1% grid) on pointer release
    inp.addEventListener('pointerup', () => {
      const v    = parseFloat(inp.value);
      const snapped = Math.round(v * 1000) / 1000;
      inp.value = snapped;
      hdr.textContent = label + ' ' + snapped.toFixed(3);
      emit('track:change', { trackIndex: ti, param, value: snapped });
      redraw();
    });
    lbl.append(hdr, inp);
    return lbl;
  }

  const startLbl  = makeSeSlider('Start', 'sampleStart', 0);
  const endLbl    = makeSeSlider('End',   'sampleEnd',   1);
  const startSlider = startLbl.querySelector('input');
  const endSlider   = endLbl.querySelector('input');
  seRow.append(startLbl, endLbl);

  // ── Audio tools: Normalize / Reverse / Slice ───────────────────────────────
  const audioToolsRow = document.createElement('div');
  audioToolsRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px';

  // Normalize button
  const normalizeBtn = document.createElement('button');
  normalizeBtn.className = 'screen-btn';
  normalizeBtn.textContent = 'Normalize';
  normalizeBtn.title = 'Scale all samples so peak amplitude = 1.0';
  normalizeBtn.addEventListener('click', () => {
    const src = track.sampleBuffer;
    if (!src) return;
    const ctx = new OfflineAudioContext(src.numberOfChannels, src.length, src.sampleRate);
    const dst = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    let peak = 0;
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const data = src.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    if (peak === 0) return;
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const srcData = src.getChannelData(ch);
      const dstData = dst.getChannelData(ch);
      for (let i = 0; i < srcData.length; i++) dstData[i] = srcData[i] / peak;
    }
    track.sampleBuffer = dst;
    emit('track:change', { trackIndex: ti, param: 'sampleBuffer', value: dst });
  });

  // Reverse button
  const reverseBtn = document.createElement('button');
  reverseBtn.className = 'screen-btn';
  reverseBtn.textContent = 'Reverse';
  reverseBtn.title = 'Reverse the sample audio in place';
  reverseBtn.addEventListener('click', () => {
    const src = track.sampleBuffer;
    if (!src) return;
    const ctx = new OfflineAudioContext(src.numberOfChannels, src.length, src.sampleRate);
    const dst = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const copy = src.getChannelData(ch).slice().reverse();
      dst.copyToChannel(copy, ch);
    }
    track.sampleBuffer = dst;
    emit('track:change', { trackIndex: ti, param: 'sampleBuffer', value: dst });
  });

  // Slice controls
  const sliceSelect = document.createElement('select');
  sliceSelect.className = 'screen-btn';
  sliceSelect.title = 'Number of equal slices';
  [2, 4, 8].forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n + ' slices';
    sliceSelect.append(opt);
  });
  sliceSelect.value = '4';

  const sliceBtn = document.createElement('button');
  sliceBtn.className = 'screen-btn';
  sliceBtn.textContent = 'Slice';
  sliceBtn.title = 'Divide buffer into equal slices; each slice fires on its step';
  sliceBtn.addEventListener('click', () => {
    const src = track.sampleBuffer;
    if (!src) return;
    const n = parseInt(sliceSelect.value, 10);
    const sliceMarkers = [];
    const activeSteps = track.steps.filter(step => step.active);
    for (let s = 0; s < n; s++) {
      const start = s / n;
      const end = Math.min(1, (s + 1) / n);
      sliceMarkers.push({ index: s, start, end });
      const step = activeSteps[s];
      if (step) {
        step.paramLocks = {
          ...(step.paramLocks || {}),
          sampleStart: start,
          sampleEnd: end,
        };
      }
    }
    track.sampleSlices = sliceMarkers;
    track.sampleStart = 0;
    track.sampleEnd = 1;
    emit('track:change', { trackIndex: ti, param: 'sampleSlices', value: sliceMarkers });
  });

  audioToolsRow.append(normalizeBtn, reverseBtn, sliceSelect, sliceBtn);

  // ── Loop controls ─────────────────────────────────────────────────────────
  // loopEnabledRef is a mutable box so redraw() can read it without closure issues
  const loopEnabledRef = { value: track.loopEnabled ?? false };

  const loopRow = document.createElement('div');
  loopRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px';

  const loopToggle = document.createElement('button');
  loopToggle.className = 'wf-loop-btn' + (loopEnabledRef.value ? ' active' : '');
  loopToggle.textContent = 'LOOP';
  loopToggle.title = 'Toggle looping';
  loopToggle.addEventListener('click', () => {
    loopEnabledRef.value = !loopEnabledRef.value;
    loopToggle.classList.toggle('active', loopEnabledRef.value);
    emit('track:change', { trackIndex: ti, param: 'loopEnabled', value: loopEnabledRef.value });
    loopHandlesWrap.style.display = loopEnabledRef.value ? 'grid' : 'none';
    redraw();
  });
  loopRow.append(loopToggle);

  // Loop start / end sliders
  const loopHandlesWrap = document.createElement('div');
  loopHandlesWrap.style.cssText = 'display:' + (loopEnabledRef.value ? 'grid' : 'none') +
    ';grid-template-columns:1fr 1fr;gap:6px;margin-top:2px';

  function makeLoopSlider(label, param, defaultVal) {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:#00d0d0;display:flex;flex-direction:column;gap:2px';
    const hdr = document.createElement('span');
    hdr.textContent = label + ' ' + Number(track[param] ?? defaultVal).toFixed(3);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = 0; inp.max = 1; inp.step = 0.001;
    inp.value = track[param] ?? defaultVal;
    inp.style.accentColor = '#00cccc';
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      hdr.textContent = label + ' ' + v.toFixed(3);
      emit('track:change', { trackIndex: ti, param, value: v });
      redraw();
    });
    inp.addEventListener('pointerup', () => {
      const v = Math.round(parseFloat(inp.value) * 1000) / 1000;
      inp.value = v;
      hdr.textContent = label + ' ' + v.toFixed(3);
      emit('track:change', { trackIndex: ti, param, value: v });
      redraw();
    });
    lbl.append(hdr, inp);
    return lbl;
  }

  const loopStartLbl    = makeLoopSlider('L.Start', 'loopStart', 0);
  const loopEndLbl      = makeLoopSlider('L.End',   'loopEnd',   1);
  const loopStartSlider = loopStartLbl.querySelector('input');
  const loopEndSlider   = loopEndLbl.querySelector('input');
  loopHandlesWrap.append(loopStartLbl, loopEndLbl);

  // ── Preview button ────────────────────────────────────────────────────────
  previewBtn = document.createElement('button');
  previewBtn.className = 'screen-btn';
  previewBtn.style.marginTop = '4px';
  previewBtn.textContent = 'Preview';
  previewBtn.title = 'Preview sample from start point';
  let _previewSource = null;
  previewBtn.addEventListener('click', () => {
    if (!track.sampleBuffer) {
      emit('toast', { msg: 'No sample loaded' });
      return;
    }
    // Stop any currently running preview
    if (_previewSource) {
      try { _previewSource.stop(); } catch (_) {}
      _previewSource = null;
      _samplePlaybackPos = null;
      redraw();
      previewBtn.textContent = 'Preview';
      previewBtn.classList.remove('active');
      return;
    }
    // Get audio context from engine or global
    const audioCtx = window._confusynthState?.engine?.context
      ?? window._confusynthState?.audioContext;
    if (!audioCtx) { emit('toast', { msg: 'No audio context' }); return; }

    const buf = track.sampleBuffer;
    const startFrac = track.sampleStart ?? 0;
    const endFrac   = track.sampleEnd   ?? 1;
    const offsetSec = startFrac * buf.duration;
    const durationSec = (endFrac - startFrac) * buf.duration;

    const source = audioCtx.createBufferSource();
    source.buffer = buf;
    source.connect(audioCtx.destination);
    source.start(0, offsetSec, durationSec);
    _previewSource = source;

    previewBtn.textContent = 'Stop';
    previewBtn.classList.add('active');

    animateSamplePlayhead(source, durationSec);

    source.onended = () => {
      _previewSource = null;
      _samplePlaybackPos = null;
      redraw();
      previewBtn.textContent = 'Preview';
      previewBtn.classList.remove('active');
    };
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  machCard.append(sampleInfo, loadBtn, wfWrap, zoomRow, panSliderWrap, seRow, audioToolsRow, loopRow, loopHandlesWrap, previewBtn);

  // Initial draw after layout — use rAF so canvas has measured width
  requestAnimationFrame(() => {
    redraw();
  });

  // ── Playhead rAF loop ─────────────────────────────────────────────────────
  let _phRaf = null;
  function tickPlayhead() {
    const st = window._confusynthState;
    if (!st?.isPlaying) {
      playhead.style.display = 'none';
      _phRaf = null;
      return;
    }
    playhead.style.display = 'block';
    const trackLen = st?.project?.banks?.[st.activeBank]
      ?.patterns?.[st.activePattern]?.length ?? 16;
    const pos = (st.currentStep ?? 0) / trackLen;
    // Map pos through zoom/pan window so playhead tracks visible region
    const { viewStart, viewEnd } = viewWindow();
    const visiblePos = (pos - viewStart) / (viewEnd - viewStart);
    playhead.style.left = (Math.max(0, Math.min(1, visiblePos)) * 100) + '%';
    _phRaf = requestAnimationFrame(tickPlayhead);
  }

  const phInterval = setInterval(() => {
    const st = window._confusynthState;
    if (st?.isPlaying && !_phRaf) {
      tickPlayhead();
    }
  }, 200);

  // Clean up when card is removed from DOM
  const obs = new MutationObserver(() => {
    if (!machCard.isConnected) {
      clearInterval(phInterval);
      if (_phRaf) cancelAnimationFrame(_phRaf);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
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
  slider.min = min; slider.max = max; slider.step = step;
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
  MACHINES.forEach(m => {
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
    WAVEFORMS.forEach(w => {
      const btn = document.createElement('button');
      btn.className = 'snd-wave-btn' + (track.waveform === w ? ' active' : '');
      btn.innerHTML = `${WAVEFORM_SVGS[w] ?? ''}<span>${w.slice(0,3).toUpperCase()}</span>`;
      btn.title = w;
      btn.addEventListener('click', () => {
        wfRow.querySelectorAll('.snd-wave-btn').forEach(b => b.classList.remove('active'));
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
  pitchRow.querySelector('input').addEventListener('input', function() {
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
    const resRow    = col.querySelector('[data-param="resonance"] input');
    const ftRow     = col.querySelector('[data-param="filterType"]');
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
    { label: 'LP',    value: 'lowpass'   },
    { label: 'HP',    value: 'highpass'  },
    { label: 'BP',    value: 'bandpass'  },
    { label: 'NOTCH', value: 'notch'     },
    { label: 'PEAK',  value: 'peaking'   },
    { label: 'LSH',   value: 'lowshelf'  },
    { label: 'HSH',   value: 'highshelf' },
  ];

  FILTER_TYPES_SHORT.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.className = 'snd-filter-btn' + (currentFilterType === value ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      ftRow.querySelectorAll('.snd-filter-btn').forEach(b => b.classList.remove('active'));
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
    { label: 'Cutoff', param: 'cutoff',    min: 80,  max: 16000, step: 10,  def: 4000 },
    { label: 'Res',    param: 'resonance', min: 0.5, max: 15,    step: 0.1, def: 0.5  },
    { label: 'Drive',  param: 'drive',     min: 0,   max: 1,     step: 0.01,def: 0    },
    { label: 'Env Amt',param: 'filterEnvAmt', min: -1, max: 1,  step: 0.01,def: 0    },
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

  const ADSR_PRESETS = [
    { label: 'Perc',  a: 0.001, d: 0.1,  s: 0,   r: 0.05 },
    { label: 'Pad',   a: 0.3,   d: 0.5,  s: 0.8, r: 1.0  },
    { label: 'Pluck', a: 0.001, d: 0.15, s: 0.3, r: 0.2  },
    { label: 'Long',  a: 0.1,   d: 0.3,  s: 0.7, r: 0.8  },
    { label: 'Drone', a: 0.5,   d: 0.1,  s: 1.0, r: 2.0  },
  ];

  // Preset row
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap';
  ADSR_PRESETS.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'snd-filter-btn';
    btn.style.cssText = 'font-size:0.46rem;padding:2px 4px';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      track.attack  = preset.a;
      track.decay   = preset.d;
      track.sustain = preset.s;
      track.release = preset.r;
      const params = ['attack', 'decay', 'sustain', 'release'];
      const vals   = [preset.a, preset.d, preset.s, preset.r];
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
    const a = parseFloat(col.querySelector('[data-param="attack"] input')?.value   ?? track.attack  ?? 0.01);
    const d = parseFloat(col.querySelector('[data-param="decay"] input')?.value    ?? track.decay   ?? 0.1);
    const s = parseFloat(col.querySelector('[data-param="sustain"] input')?.value  ?? track.sustain ?? 0.5);
    const r = parseFloat(col.querySelector('[data-param="release"] input')?.value  ?? track.release ?? 0.2);
    drawADSR(adsrCanvas, a, d, s, r, color);
  }

  const adsrParams = [
    { label: 'Atk',  param: 'attack',  min: 0.001, max: 2,  step: 0.001, def: 0.01 },
    { label: 'Dec',  param: 'decay',   min: 0.01,  max: 2,  step: 0.01,  def: 0.1  },
    { label: 'Sus',  param: 'sustain', min: 0,     max: 1,  step: 0.01,  def: 0.5  },
    { label: 'Rel',  param: 'release', min: 0.01,  max: 4,  step: 0.01,  def: 0.2  },
    { label: 'Gate', param: 'noteLength', min: 0.01, max: 1, step: 0.01, def: 0.5  },
  ];
  adsrParams.forEach(({ label, param, min, max, step, def }) => {
    const row = makeSndParamRow(label, param, min, max, step, track[param] ?? def, emit, ti, () => redrawADSR());
    col.append(row);
  });

  col.append(Object.assign(document.createElement('hr'), { className: 'snd-section-sep' }));

  // Volume & pan
  col.append(makeSndParamRow('Vol', 'volume', 0, 1, 0.01, track.volume ?? 0.8, emit, ti));
  col.append(makeSndParamRow('Pan', 'pan',   -1, 1, 0.01, track.pan    ?? 0,   emit, ti));

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
    const ti    = state.selectedTrackIndex;
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
    subTabBar.style.cssText = 'display:flex;gap:2px;padding:0 8px 4px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.06)';
    SUB_TABS.forEach(tab => {
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

    const showSynth  = activeSubTab === 'SYNTH';
    const showMod    = activeSubTab === 'MOD';
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
    const modGrid    = makeGrid();
    const sampleGrid = makeGrid();

    modGrid.style.display    = showMod    ? '' : 'none';
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
      _noteRaf = requestAnimationFrame(() => { updateLiveNote(); startNoteWatch(); });
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

      if (slots.every(b => !b)) {
        const emptyNote = document.createElement('div');
        emptyNote.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);padding:6px 0';
        emptyNote.textContent = 'No recordings yet. Use Settings → Recorder to capture audio.';
        recCard.append(emptyNote);
      } else {
        slots.forEach((buf, si) => {
          const meta = metas[si] ?? {};
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05)';

          const slotLabel = document.createElement('span');
          slotLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);min-width:14px';
          slotLabel.textContent = String(si + 1);

          const slotInfo = document.createElement('span');
          slotInfo.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          if (buf) {
            const dur = (buf.duration ?? (buf.length / buf.sampleRate)).toFixed(2);
            const ch  = buf.numberOfChannels === 1 ? 'MONO' : 'ST';
            const hz  = buf.sampleRate ? `${(buf.sampleRate / 1000).toFixed(1)}k` : '';
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
              try { _slotSrc.stop(); } catch (_) {}
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
          const _slotStop = () => { try { _slotSrc?.stop(); } catch (_) {} _slotSrc = null; };
          const _prev = container._cleanup;
          container._cleanup = () => { _slotStop(); _prev?.(); };

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
          engRow.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          emit('track:change', { trackIndex: ti, param: 'plEngine', value });
        });
        engRow.append(btn);
      });
      plaitsCard.append(engRow);

      [
        { label: 'Timbre',    param: 'plTimbre',    min: 0, max: 1, step: 0.01 },
        { label: 'Harmonics', param: 'plHarmonics', min: 0, max: 1, step: 0.01 },
        { label: 'Morph',     param: 'plMorph',     min: 0, max: 1, step: 0.01 },
      ].forEach(({ label, param, min, max, step }) =>
        plaitsCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti))
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
        { label: 'Size',     param: 'clSize',     min: 0, max: 1, step: 0.01 },
        { label: 'Density',  param: 'clDensity',  min: 0, max: 1, step: 0.01 },
        { label: 'Texture',  param: 'clTexture',  min: 0, max: 1, step: 0.01 },
      ].forEach(({ label, param, min, max, step }) =>
        cloudsCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti))
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
          excRow.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          emit('track:change', { trackIndex: ti, param: 'rnExciter', value });
        });
        excRow.append(btn);
      });
      ringsCard.append(excRow);

      [
        { label: 'Structure',  param: 'rnStructure',  min: 0, max: 1, step: 0.01 },
        { label: 'Brightness', param: 'rnBrightness', min: 0, max: 1, step: 0.01 },
        { label: 'Damping',    param: 'rnDamping',    min: 0, max: 1, step: 0.01 },
      ].forEach(({ label, param, min, max, step }) =>
        ringsCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti))
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
    adsrCanvas.width  = 100;
    adsrCanvas.height = 40;
    adsrCanvas.style.cssText = 'display:block;width:100%;height:40px;margin-bottom:6px;background:#0a0a0a;border-radius:4px;border:1px solid var(--border)';
    adsrCard.append(adsrCanvas);

    // Helper to read current ADSR values from track / live slider inputs
    function getADSRValues() {
      const inputs = adsrCard.querySelectorAll('input[type="range"]');
      return {
        a: parseFloat(inputs[0]?.value ?? track.attack  ?? 0.01),
        d: parseFloat(inputs[1]?.value ?? track.decay   ?? 0.1),
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

    // ADSR shape presets
    const ADSR_PRESETS = [
      { label: 'Perc',  a: 0.001, d: 0.1,  s: 0,   r: 0.05 },
      { label: 'Pad',   a: 0.3,   d: 0.5,  s: 0.8, r: 1.0  },
      { label: 'Pluck', a: 0.001, d: 0.15, s: 0.3, r: 0.2  },
      { label: 'Long',  a: 0.1,   d: 0.3,  s: 0.7, r: 0.8  },
      { label: 'Drone', a: 0.5,   d: 0.1,  s: 1.0, r: 2.0  },
    ];

    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px';

    ADSR_PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn';
      btn.style.cssText = 'font-size:0.52rem;padding:2px 5px';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        // Update track values
        track.attack  = preset.a;
        track.decay   = preset.d;
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
      { label: 'Attack',  param: 'attack',  min: 0.001, max: 2,   step: 0.001, def: 0.01 },
      { label: 'Decay',   param: 'decay',   min: 0.01,  max: 2,   step: 0.01,  def: 0.1  },
      { label: 'Sustain', param: 'sustain', min: 0,     max: 1,   step: 0.01,  def: 0.5  },
      { label: 'Release', param: 'release', min: 0.01,  max: 4,   step: 0.01,  def: 0.2  },
      { label: 'Gate',    param: 'noteLength', min: 0.01, max: 1,  step: 0.01,  def: 0.5  },
    ];
    adsrParams.forEach(({ label, param, min, max, step, def }) =>
      adsrCard.append(makeSlider(label, param, min, max, step, track[param] ?? def, emit, ti))
    );

    adsrCard.addEventListener('input', () => { redrawADSR(); });

    // Draw after layout is complete
    requestAnimationFrame(() => { redrawADSR(); });

    modGrid.append(adsrCard);

    // ── Filter card ──
    const FILTER_TYPES = [
      { label: 'LP',    value: 'lowpass'   },
      { label: 'HP',    value: 'highpass'  },
      { label: 'BP',    value: 'bandpass'  },
      { label: 'NOTCH', value: 'notch'     },
      { label: 'PEAK',  value: 'peaking'   },
      { label: 'LSH',   value: 'lowshelf'  },
      { label: 'HSH',   value: 'highshelf' },
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
        filtTypeRow.querySelectorAll('.ctx-btn').forEach(b => {
          b.classList.remove('active');
          b.style.borderColor = '';
        });
        btn.classList.add('active');
        btn.style.borderColor = 'var(--accent)';
        emit('track:change', { trackIndex: ti, param: 'filterType', value });
      });
      filtTypeRow.append(btn);
    });
    filtCard.append(filtTypeRow);

    filtCard.insertAdjacentHTML('beforeend', buildFilterSVG(track.cutoff, track.resonance));

    const filtParams = [
      { label: 'Cutoff', param: 'cutoff',    min: 80,  max: 16000, step: 10  },
      { label: 'Res',    param: 'resonance', min: 0.5, max: 15,    step: 0.1 },
      { label: 'Reso',   param: 'filterQ',   min: 0.1, max: 20,    step: 0.1 },
      { label: 'Drive',  param: 'drive',     min: 0,   max: 1,     step: 0.01 },
    ];
    filtParams.forEach(({ label, param, min, max, step }) => {
      const val = track[param] ?? (param === 'filterQ' ? 1.0 : undefined);
      filtCard.append(makeSlider(label, param, min, max, step, val, emit, ti));
    });

    filtCard.addEventListener('input', () => {
      const inputs = filtCard.querySelectorAll('input[type="range"]');
      const c = parseFloat(inputs[0]?.value ?? track.cutoff);
      const r = parseFloat(inputs[1]?.value ?? track.resonance);
      const existingSvg = filtCard.querySelector('svg');
      if (existingSvg) {
        const tmp = document.createElement('div');
        tmp.innerHTML = buildFilterSVG(c, r);
        existingSvg.replaceWith(tmp.firstElementChild);
      }
    });
    modGrid.append(filtCard);

    // ── Mix card ──
    const mixCard = document.createElement('div');
    mixCard.className = 'page-card';
    mixCard.innerHTML = '<h4>Mix</h4>';
    const mixParams = [
      { label: 'Volume', param: 'volume',     min: 0,  max: 1,   step: 0.01 },
      { label: 'Pan',    param: 'pan',        min: -1, max: 1,   step: 0.01 },
      { label: 'Dly Snd',param: 'delaySend',  min: 0,  max: 1,   step: 0.01 },
      { label: 'Rev Snd',param: 'reverbSend', min: 0,  max: 1,   step: 0.01 },
    ];
    mixParams.forEach(({ label, param, min, max, step }) =>
      mixCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti))
    );

    // Velocity curve selector
    const velCurveRow = document.createElement('div');
    velCurveRow.style.cssText = 'display:flex;align-items:center;gap:5px;margin-top:6px;font-family:var(--font-mono);font-size:0.58rem';
    const velCurveLabel = document.createElement('span');
    velCurveLabel.style.cssText = 'color:var(--muted);flex-shrink:0';
    velCurveLabel.textContent = 'Vel Curve';
    const velCurveBtns = document.createElement('div');
    velCurveBtns.style.cssText = 'display:flex;gap:4px';
    ['linear', 'exp', 'comp'].forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn' + ((track.velocityCurve ?? 'linear') === c ? ' active' : '');
      btn.textContent = c === 'linear' ? 'Lin' : c === 'exp' ? 'Exp' : 'Comp';
      btn.addEventListener('click', () => {
        velCurveBtns.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        emit('track:change', { trackIndex: ti, param: 'velocityCurve', value: c });
      });
      velCurveBtns.append(btn);
    });
    velCurveRow.append(velCurveLabel, velCurveBtns);
    mixCard.append(velCurveRow);

    // Per-track swing override row
    const swingRow = document.createElement('div');
    swingRow.style.cssText = 'display:flex;align-items:center;gap:5px;margin-top:4px;font-family:var(--font-mono);font-size:0.58rem';
    const swingVal = track.swing ?? null;
    const swingInput = document.createElement('input');
    swingInput.type = 'range';
    swingInput.min = 0; swingInput.max = 0.42; swingInput.step = 0.01;
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

    const targetRow = document.createElement('div');
    targetRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap';
    LFO_TARGETS.forEach(tgt => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn' + ((track.lfoTarget || 'cutoff') === tgt ? ' active' : '');
      btn.textContent = tgt.slice(0, 3).toUpperCase();
      btn.addEventListener('click', () => {
        targetRow.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        emit('track:change', { trackIndex: ti, param: 'lfoTarget', value: tgt });
      });
      targetRow.append(btn);
    });
    lfoCard.append(targetRow);

    [
      { label: 'Rate',  param: 'lfoRate',  min: 0.1, max: 20,  step: 0.1,  value: track.lfoRate  ?? 2 },
      { label: 'Depth', param: 'lfoDepth', min: 0,   max: 1,   step: 0.01, value: track.lfoDepth ?? 0 },
    ].forEach(({ label, param, min, max, step, value }) => {
      lfoCard.append(makeSlider(label, param, min, max, step, value, emit, ti));
    });

    // LFO routing destination toggles (multi-target flags)
    const lfoRoutingRow = document.createElement('div');
    lfoRoutingRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px';
    [
      { param: 'lfoToCutoff', label: '→CUTOFF' },
      { param: 'lfoToPitch',  label: '→PITCH'  },
      { param: 'lfoToVolume', label: '→VOL'    },
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
      });
      lfoRoutingRow.append(btn);
    });
    lfoCard.append(lfoRoutingRow);

    modGrid.append(lfoCard);

    // ── Arp card ──
    const arpCard = document.createElement('div');
    arpCard.className = 'sound-card';
    arpCard.innerHTML = `
      <div class="sound-card-title">ARP</div>
      <div class="sound-row">
        <label>Mode</label>
        <div class="btn-row" id="arp-modes-${ti}">
          <button class="seq-btn${track.arpMode === 'up'     ? ' active' : ''}" data-mode="up">Up</button>
          <button class="seq-btn${track.arpMode === 'down'   ? ' active' : ''}" data-mode="down">Dn</button>
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
        <span id="arp-speed-val-${ti}">${['1/16','1/8','1/4','1/2'][(track.arpSpeed ?? 1) - 1]}</span>
      </div>
    `;

    // Wire mode buttons
    const arpModeRow = arpCard.querySelector(`#arp-modes-${ti}`);
    arpModeRow.querySelectorAll('.seq-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        arpModeRow.querySelectorAll('.seq-btn').forEach(b => b.classList.remove('active'));
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
    const arpRangeVal   = arpCard.querySelector(`#arp-range-val-${ti}`);
    arpRangeInput.addEventListener('input', () => {
      const v = parseInt(arpRangeInput.value);
      arpRangeVal.textContent = v + ' oct';
      emit('track:change', { trackIndex: ti, param: 'arpRange', value: v });
    });

    // Wire speed slider
    const arpSpeedInput = arpCard.querySelector(`#arp-speed-${ti}`);
    const arpSpeedVal   = arpCard.querySelector(`#arp-speed-val-${ti}`);
    arpSpeedInput.addEventListener('input', () => {
      const v = parseInt(arpSpeedInput.value);
      arpSpeedVal.textContent = ['1/16','1/8','1/4','1/2'][v - 1];
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
    arpModeRow.querySelectorAll('.seq-btn').forEach(btn => {
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
      noSampleCard.style.cssText = 'grid-column:span 2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:0.5;padding:24px';
      noSampleCard.innerHTML = `<h4 style="margin:0">No Sample</h4>
        <p style="font-size:0.6rem;color:var(--muted);text-align:center;margin:0">Switch machine to SAMPLE or CLOUDS<br>to access sample controls.</p>`;
      sampleGrid.append(noSampleCard);
    }

    container.append(synthWrapper, modGrid, sampleGrid);
  },

  knobMap: [
    { label: 'Pitch',  param: 'pitch',       min: 0,    max: 127, step: 1 },
    { label: 'Timbre', param: 'plTimbre',    min: 0,    max: 1,   step: 0.01 },
    { label: 'Harm',   param: 'plHarmonics', min: 0,    max: 1,   step: 0.01 },
    { label: 'Morph',  param: 'plMorph',     min: 0,    max: 1,   step: 0.01 },
    { label: 'Attack', param: 'attack',      min: 0.001,max: 2,   step: 0.001 },
    { label: 'Decay',  param: 'decay',       min: 0.01, max: 2,   step: 0.01 },
    { label: 'Drive',  param: 'drive',       min: 0,    max: 1,   step: 0.01 },
    { label: 'Vol',    param: 'volume',      min: 0,    max: 1,   step: 0.01 },
  ],

  keyboardContext: 'sound',
};
