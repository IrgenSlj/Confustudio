// src/pages/sound.js — Machine type, waveform, ADSR, filter
import { openSampleBrowser } from '../sample-browser.js';

const MACHINES  = ['tone', 'noise', 'sample', 'midi', 'plaits', 'clouds', 'rings'];
const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToNoteName(midi) {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + oct;
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
  // Normalize cutoff 80–16000 to x position
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
                      bitDepth = 32) {
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

function makeSampleLoader(track, ti, emit, machCard) {
  // ── Local view state ──────────────────────────────────────────────────────
  let waveZoom    = 1;   // 1, 2, 4, or 8
  let wavePan     = 0;   // 0–1: how far through the zoomable region we're panned

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
  sampleInfo.textContent = track.sampleBuffer ? 'Sample loaded' : 'No sample loaded';

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
      loopEnabledRef.value
    );
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

  // ── Assemble ──────────────────────────────────────────────────────────────
  machCard.append(sampleInfo, loadBtn, wfWrap, zoomRow, panSliderWrap, seRow, loopRow, loopHandlesWrap);

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

export default {
  render(container, state, emit) {
    // Cancel any running live-note watcher from a previous render
    container._cleanupNoteWatch?.();
    container.innerHTML = '';
    const ti    = state.selectedTrackIndex;
    const track = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[ti];

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Sound — ${track.name}</span>`;
    container.append(header);

    const grid = document.createElement('div');
    grid.className = 'page-grid-2';
    grid.style.cssText = 'flex:1;min-height:0';

    // ── Pitch card ──
    const pitchCard = document.createElement('div');
    pitchCard.className = 'page-card';

    const noteDisplay = document.createElement('div');
    noteDisplay.style.cssText = 'font-family:var(--font-mono);font-size:1.4rem;font-weight:600;color:var(--accent);text-align:center;margin-bottom:4px;letter-spacing:0.05em';
    noteDisplay.textContent = midiToNoteName(track.pitch ?? 60);

    const pitchSlider = document.createElement('input');
    pitchSlider.type = 'range';
    pitchSlider.min = 0; pitchSlider.max = 127; pitchSlider.step = 1;
    pitchSlider.value = track.pitch ?? 60;
    pitchSlider.style.cssText = 'width:100%;accent-color:var(--accent)';

    const pitchLabel = document.createElement('div');
    pitchLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);text-align:center;margin-top:2px';
    pitchLabel.textContent = `MIDI ${track.pitch ?? 60}`;

    // Chord spelling display
    const chordDisplay = document.createElement('div');
    chordDisplay.className = 'chord-spelling';
    function updateChordDisplay(midiNote) {
      const voicing = CHORD_VOICINGS[track.chordMode];
      if (voicing && voicing.length > 0) {
        chordDisplay.textContent = voicing.map(iv => midiToNoteName(midiNote + iv)).join(' ');
        chordDisplay.style.display = 'block';
      } else {
        chordDisplay.textContent = '';
        chordDisplay.style.display = 'none';
      }
    }
    updateChordDisplay(track.pitch ?? 60);

    pitchSlider.addEventListener('input', () => {
      const v = parseInt(pitchSlider.value);
      noteDisplay.textContent = midiToNoteName(v);
      pitchLabel.textContent = `MIDI ${v}`;
      updateChordDisplay(v);
      emit('track:change', { trackIndex: ti, param: 'pitch', value: v });
    });

    pitchCard.innerHTML = '<h4>Pitch</h4>';

    // Live note indicator — shows the last triggered note while sequencer runs
    const liveNote = document.createElement('div');
    liveNote.className = 'live-note-display';
    liveNote.id = `live-note-${ti}`;
    liveNote.textContent = '--';
    pitchCard.prepend(liveNote);

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

    // Legato toggle
    const legatoRow = document.createElement('div');
    legatoRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px';
    const legatoBtn = document.createElement('button');
    legatoBtn.className = 'ctx-btn' + (track.legato ? ' active' : '');
    legatoBtn.style.cssText = track.legato
      ? 'color:var(--live);border-color:var(--live);box-shadow:0 0 6px var(--live)'
      : '';
    legatoBtn.textContent = 'LEGATO';
    legatoBtn.addEventListener('click', () => {
      const newVal = !track.legato;
      legatoBtn.classList.toggle('active', newVal);
      legatoBtn.style.cssText = newVal
        ? 'color:var(--live);border-color:var(--live);box-shadow:0 0 6px var(--live)'
        : '';
      emit('track:change', { trackIndex: ti, param: 'legato', value: newVal });
    });
    legatoRow.append(legatoBtn);
    pitchCard.append(noteDisplay, chordDisplay, pitchSlider, pitchLabel, legatoRow);
    grid.append(pitchCard);

    // ── Machine type card ──
    const machCard = document.createElement('div');
    machCard.className = 'page-card';
    machCard.innerHTML = '<h4>Machine</h4>';
    const machRow = document.createElement('div');
    machRow.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px';
    MACHINES.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn' + (track.machine === m ? ' active' : '');
      btn.textContent = m;
      btn.addEventListener('click', () => {
        machRow.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        emit('track:change', { trackIndex: ti, param: 'machine', value: m });
        // re-render to show/hide waveform section
        this.render(container, { ...state, project: state.project }, emit);
      });
      machRow.append(btn);
    });
    machCard.append(machRow);

    if (track.machine === 'tone') {
      const wfRow = document.createElement('div');
      wfRow.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap';
      WAVEFORMS.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'ctx-btn waveform-btn' + (track.waveform === w ? ' active' : '');
        btn.title = w;
        btn.innerHTML = `${WAVEFORM_SVGS[w] ?? ''}<span class="wf-label">${w.slice(0, 3)}</span>`;
        btn.addEventListener('click', () => {
          wfRow.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          emit('track:change', { trackIndex: ti, param: 'waveform', value: w });
        });
        wfRow.append(btn);
      });
      machCard.append(wfRow);
    }

    if (track.machine === 'sample') {
      makeSampleLoader(track, ti, emit, machCard);
      const browseBtn = document.createElement('button');
      browseBtn.className = 'screen-btn';
      browseBtn.style.marginTop = '4px';
      browseBtn.textContent = 'Browse Library';
      browseBtn.addEventListener('click', () => openSampleBrowser(state, emit, ti));
      machCard.append(browseBtn);
    }

    grid.append(machCard);

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

      grid.append(plaitsCard);
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

      makeSampleLoader(track, ti, emit, cloudsCard);
      const browseBtn = document.createElement('button');
      browseBtn.className = 'screen-btn';
      browseBtn.style.marginTop = '4px';
      browseBtn.textContent = 'Browse Library';
      browseBtn.addEventListener('click', () => openSampleBrowser(state, emit, ti));
      cloudsCard.append(browseBtn);

      grid.append(cloudsCard);
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

      grid.append(ringsCard);
    }

    // ── ADSR card ──
    const adsrCard = document.createElement('div');
    adsrCard.className = 'page-card';
    adsrCard.innerHTML = `<h4>Envelope</h4>`;
    adsrCard.insertAdjacentHTML('beforeend', buildEnvelopeSVG(track.attack, track.decay));
    const adsrParams = [
      { label: 'Attack',  param: 'attack',     min: 0.001, max: 2,   step: 0.001 },
      { label: 'Decay',   param: 'decay',      min: 0.01,  max: 2,   step: 0.01 },
      { label: 'Gate',    param: 'noteLength', min: 0.01,  max: 1,   step: 0.01 },
    ];
    adsrParams.forEach(({ label, param, min, max, step }) =>
      adsrCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti))
    );
    adsrCard.addEventListener('input', () => {
      const inputs = adsrCard.querySelectorAll('input[type="range"]');
      const a = parseFloat(inputs[0]?.value ?? track.attack);
      const d = parseFloat(inputs[1]?.value ?? track.decay);
      const existingSvg = adsrCard.querySelector('svg');
      if (existingSvg) {
        const tmp = document.createElement('div');
        tmp.innerHTML = buildEnvelopeSVG(a, d);
        existingSvg.replaceWith(tmp.firstElementChild);
      }
    });
    grid.append(adsrCard);

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
    grid.append(filtCard);

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

    grid.append(mixCard);

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

    grid.append(lfoCard);

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

    grid.append(arpCard);

    container.append(grid);
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
