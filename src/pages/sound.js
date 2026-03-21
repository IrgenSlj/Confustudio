// src/pages/sound.js — Machine type, waveform, ADSR, filter
import { openSampleBrowser } from '../sample-browser.js';

const MACHINES  = ['tone', 'noise', 'sample', 'midi', 'plaits', 'clouds', 'rings'];
const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToNoteName(midi) {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + oct;
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

function drawWaveform(canvas, audioBuffer, sampleStart, sampleEnd) {
  if (!audioBuffer) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  const ctx2d = canvas.getContext('2d');
  const W = canvas.offsetWidth || 200;
  const H = canvas.height;
  canvas.width = W;
  ctx2d.clearRect(0, 0, W, H);

  const data = audioBuffer.getChannelData(0);
  const step = Math.floor(data.length / W);

  ctx2d.strokeStyle = '#a0c060';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();

  for (let x = 0; x < W; x++) {
    let min = 1, max = -1;
    for (let i = 0; i < step; i++) {
      const v = data[x * step + i] ?? 0;
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
}

function makeSampleLoader(track, ti, emit, machCard) {
  const sampleInfo = document.createElement('div');
  sampleInfo.style.cssText = 'margin-top:8px;font-family:var(--font-mono);font-size:0.62rem;color:var(--muted)';
  sampleInfo.textContent = track.sampleBuffer ? 'Sample loaded' : 'No sample loaded';
  const loadBtn = document.createElement('button');
  loadBtn.className = 'screen-btn';
  loadBtn.style.marginTop = '6px';
  loadBtn.textContent = 'Load Sample';
  loadBtn.addEventListener('click', () => emit('state:change', { path: 'action_loadSample', value: ti }));

  // Waveform wrap
  const wfWrap = document.createElement('div');
  wfWrap.className = 'sample-waveform-wrap';

  const wfCanvas = document.createElement('canvas');
  wfCanvas.className = 'sample-waveform';
  wfCanvas.height = 48;
  wfCanvas.style.display = 'none';

  const playhead = document.createElement('div');
  playhead.className = 'sample-playhead';
  playhead.style.display = 'none';

  const startLine = document.createElement('div');
  startLine.className = 'sample-start-line';

  const endLine = document.createElement('div');
  endLine.className = 'sample-end-line';

  wfWrap.append(wfCanvas, playhead, startLine, endLine);

  // Start/End sliders row
  const seRow = document.createElement('div');
  seRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px';

  function makeSeSlider(label, param, defaultVal) {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);display:flex;flex-direction:column;gap:2px';
    const hdr = document.createElement('span');
    hdr.textContent = label + ' ' + Number(track[param] ?? defaultVal).toFixed(2);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = 0; inp.max = 1; inp.step = 0.01;
    inp.value = track[param] ?? defaultVal;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      hdr.textContent = label + ' ' + v.toFixed(2);
      emit('track:change', { trackIndex: ti, param, value: v });
      updateStartEndLines();
      requestAnimationFrame(() => drawWaveform(wfCanvas, track.sampleBuffer,
        parseFloat(startSlider.value), parseFloat(endSlider.value)));
    });
    lbl.append(hdr, inp);
    return lbl;
  }

  const startLbl = makeSeSlider('Start', 'sampleStart', 0);
  const endLbl   = makeSeSlider('End',   'sampleEnd',   1);
  const startSlider = startLbl.querySelector('input');
  const endSlider   = endLbl.querySelector('input');
  seRow.append(startLbl, endLbl);

  function updateStartEndLines() {
    const s = parseFloat(startSlider.value);
    const e = parseFloat(endSlider.value);
    startLine.style.left = (s * 100) + '%';
    endLine.style.left   = (e * 100) + '%';
  }
  updateStartEndLines();

  machCard.append(sampleInfo, loadBtn, wfWrap, seRow);

  // Draw waveform after layout — use rAF so canvas has width
  requestAnimationFrame(() => {
    drawWaveform(wfCanvas, track.sampleBuffer,
      track.sampleStart ?? 0, track.sampleEnd ?? 1);
    updateStartEndLines();
  });

  // Playhead rAF loop (closure over track ref via ti, reads state from window)
  let _phRaf = null;
  function tickPlayhead() {
    const eng = window._confusynthEngine;
    const st  = window._confusynthState;
    if (!st?.isPlaying) {
      playhead.style.display = 'none';
      _phRaf = null;
      return;
    }
    playhead.style.display = 'block';
    const trackLen = st?.project?.banks?.[st.activeBank]
      ?.patterns?.[st.activePattern]?.length ?? 16;
    const pos = (st.currentStep ?? 0) / trackLen;
    playhead.style.left = (pos * 100) + '%';
    _phRaf = requestAnimationFrame(tickPlayhead);
  }

  // Observe playing state changes via a MutationObserver on the card or polling
  // Use a lightweight interval that starts/stops with visibility
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

    pitchSlider.addEventListener('input', () => {
      const v = parseInt(pitchSlider.value);
      noteDisplay.textContent = midiToNoteName(v);
      pitchLabel.textContent = `MIDI ${v}`;
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

    pitchCard.append(noteDisplay, pitchSlider, pitchLabel);
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
        btn.className = 'ctx-btn' + (track.waveform === w ? ' active' : '');
        btn.textContent = w.slice(0, 3);
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
    const filtCard = document.createElement('div');
    filtCard.className = 'page-card';
    filtCard.innerHTML = '<h4>Filter</h4>';
    filtCard.insertAdjacentHTML('beforeend', buildFilterSVG(track.cutoff, track.resonance));
    const filtParams = [
      { label: 'Cutoff', param: 'cutoff',    min: 80,  max: 16000, step: 10 },
      { label: 'Res',    param: 'resonance', min: 0.5, max: 15,    step: 0.1 },
      { label: 'Drive',  param: 'drive',     min: 0,   max: 1,     step: 0.01 },
    ];
    filtParams.forEach(({ label, param, min, max, step }) =>
      filtCard.append(makeSlider(label, param, min, max, step, track[param], emit, ti))
    );
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
