// src/pages/sound.js — Machine type, waveform, ADSR, filter

const MACHINES  = ['tone', 'noise', 'sample', 'midi'];
const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];

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

export default {
  render(container, state, emit) {
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
      const sampleInfo = document.createElement('div');
      sampleInfo.style.cssText = 'margin-top:8px;font-family:var(--font-mono);font-size:0.62rem;color:var(--muted)';
      sampleInfo.textContent = track.sampleBuffer ? 'Sample loaded' : 'No sample loaded';
      const loadBtn = document.createElement('button');
      loadBtn.className = 'screen-btn';
      loadBtn.style.marginTop = '6px';
      loadBtn.textContent = 'Load Sample';
      loadBtn.addEventListener('click', () => emit('state:change', { path: 'action_loadSample', value: ti }));
      machCard.append(sampleInfo, loadBtn);
    }

    grid.append(machCard);

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
    grid.append(mixCard);

    container.append(grid);
  },

  knobMap: [
    { label: 'Pitch',   param: 'pitch',     min: 0,    max: 127, step: 1 },
    { label: 'Attack',  param: 'attack',    min: 0.001,max: 2,   step: 0.001 },
    { label: 'Decay',   param: 'decay',     min: 0.01, max: 2,   step: 0.01 },
    { label: 'Gate',    param: 'noteLength',min: 0.01, max: 1,   step: 0.01 },
    { label: 'Cutoff',  param: 'cutoff',    min: 80,   max: 16000,step: 10 },
    { label: 'Res',     param: 'resonance', min: 0.5,  max: 15,  step: 0.1 },
    { label: 'Drive',   param: 'drive',     min: 0,    max: 1,   step: 0.01 },
    { label: 'Vol',     param: 'volume',    min: 0,    max: 1,   step: 0.01 },
  ],

  keyboardContext: 'sound',
};
