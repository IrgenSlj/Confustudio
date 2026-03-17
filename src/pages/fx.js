// src/pages/fx.js — Delay, Reverb, LFO, Drive, Scene crossfader display

const LFO_TARGETS = ['cutoff', 'volume', 'pan'];

function makeSlider(label, param, min, max, step, value, emit) {
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
    emit('state:change', { path: param, value: v });
  });
  return row;
}

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const track = state.project.banks[state.activeBank]
      .patterns[state.activePattern].kit.tracks[state.selectedTrackIndex];

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">FX</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">${track.name}</span>`;
    container.append(header);

    const grid = document.createElement('div');
    grid.className = 'page-grid-2';
    grid.style.cssText = 'flex:1;min-height:0';

    // ── Delay ──
    const dlyCard = document.createElement('div');
    dlyCard.className = 'page-card';
    dlyCard.innerHTML = '<h4>Delay</h4>';
    [
      { label: 'Time',  param: 'delayTime',     min: 0.01, max: 1,   step: 0.01, v: state.delayTime  ?? 0.25 },
      { label: 'Fdbk',  param: 'delayFeedback', min: 0,    max: 0.98, step: 0.01, v: state.delayFeedback ?? 0.4 },
      { label: 'Wet',   param: 'delayWet',      min: 0,    max: 1,   step: 0.01, v: state.delayWet   ?? 0.3 },
    ].forEach(({ label, param, min, max, step, v }) =>
      dlyCard.append(makeSlider(label, param, min, max, step, v, emit))
    );
    grid.append(dlyCard);

    // ── Reverb ──
    const revCard = document.createElement('div');
    revCard.className = 'page-card';
    revCard.innerHTML = '<h4>Reverb</h4>';
    [
      { label: 'Size', param: 'reverbSize', min: 0.01, max: 1, step: 0.01, v: state.reverbSize ?? 0.5 },
      { label: 'Mix',  param: 'reverbMix',  min: 0,    max: 1, step: 0.01, v: state.reverbMix  ?? 0.2 },
    ].forEach(({ label, param, min, max, step, v }) =>
      revCard.append(makeSlider(label, param, min, max, step, v, emit))
    );
    grid.append(revCard);

    // ── LFO ──
    const lfoCard = document.createElement('div');
    lfoCard.className = 'page-card';
    lfoCard.innerHTML = '<h4>LFO</h4>';
    [
      { label: 'Rate',  param: 'lfoRate',  min: 0.01, max: 20, step: 0.01, v: track.lfoRate  ?? 2 },
      { label: 'Depth', param: 'lfoDepth', min: 0,    max: 1,  step: 0.01, v: track.lfoDepth ?? 0 },
    ].forEach(({ label, param, min, max, step, v }) => {
      const row = document.createElement('label');
      row.innerHTML = `
        <span>${label}</span>
        <output>${Number(v).toFixed(2)}</output>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${v}">
      `;
      const input = row.querySelector('input');
      const out   = row.querySelector('output');
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        out.textContent = val.toFixed(2);
        emit('track:change', { trackIndex: state.selectedTrackIndex, param, value: val });
      });
      lfoCard.append(row);
    });

    // LFO target selector
    const tgtLabel = document.createElement('div');
    tgtLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:6px 0 4px';
    tgtLabel.textContent = 'Target';
    lfoCard.append(tgtLabel);
    const tgtRow = document.createElement('div');
    tgtRow.style.cssText = 'display:flex;gap:4px';
    LFO_TARGETS.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'ctx-btn' + (track.lfoTarget === t ? ' active' : '');
      btn.textContent = t;
      btn.addEventListener('click', () => {
        tgtRow.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        emit('track:change', { trackIndex: state.selectedTrackIndex, param: 'lfoTarget', value: t });
      });
      tgtRow.append(btn);
    });
    lfoCard.append(tgtRow);
    grid.append(lfoCard);

    // ── Drive ──
    const driveCard = document.createElement('div');
    driveCard.className = 'page-card';
    driveCard.innerHTML = '<h4>Drive</h4>';
    driveCard.append(makeSlider('Drive', 'drive', 0, 1, 0.01, track.drive ?? 0.18,
      (ev, payload) => emit('track:change', { trackIndex: state.selectedTrackIndex, ...payload })
    ));

    // Scene crossfader display
    const cfLabel = document.createElement('div');
    cfLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:8px 0 4px';
    cfLabel.textContent = `Scene A→B (${(state.crossfader * 100).toFixed(0)}%)`;
    driveCard.append(cfLabel);

    const cfBar = document.createElement('input');
    cfBar.type  = 'range';
    cfBar.min   = 0;
    cfBar.max   = 1;
    cfBar.step  = 0.01;
    cfBar.value = state.crossfader ?? 0;
    cfBar.style.cssText = 'width:100%;accent-color:var(--accent)';
    cfBar.addEventListener('input', () =>
      emit('state:change', { path: 'crossfader', value: parseFloat(cfBar.value) })
    );
    driveCard.append(cfBar);
    grid.append(driveCard);

    container.append(grid);
  },

  knobMap: [
    { label: 'DlyTime', param: 'delayTime',     min: 0.01, max: 1,    step: 0.01 },
    { label: 'DlyFb',   param: 'delayFeedback', min: 0,    max: 0.98, step: 0.01 },
    { label: 'RevSize', param: 'reverbSize',    min: 0.01, max: 1,    step: 0.01 },
    { label: 'RevMix',  param: 'reverbMix',     min: 0,    max: 1,    step: 0.01 },
    { label: 'LfoRate', param: 'lfoRate',       min: 0.01, max: 20,   step: 0.01 },
    { label: 'LfoDep',  param: 'lfoDepth',      min: 0,    max: 1,    step: 0.01 },
    { label: 'Drive',   param: 'drive',         min: 0,    max: 1,    step: 0.01 },
    { label: '—',       param: null,            min: 0,    max: 1,    step: 0.01 },
  ],

  keyboardContext: 'fx',
};
