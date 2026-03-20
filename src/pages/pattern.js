// src/pages/pattern.js — Step sequencer + euclidean + p-lock panel

// ─── Euclidean rhythm generator (Bjorklund algorithm) ────────────────────────
function euclidean(beats, steps) {
  // Distribute `beats` pulses as evenly as possible across `steps` slots.
  // Returns a boolean array of length `steps`.
  if (beats <= 0) return Array(steps).fill(false);
  if (beats >= steps) return Array(steps).fill(true);
  beats = Math.min(beats, steps);
  let pattern = [];
  let counts = [];
  let remainders = [];
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

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const track   = pattern.kit.tracks[state.selectedTrackIndex];

    // Header row
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    const ti = state.selectedTrackIndex;
    const trackLenDisplay = track.trackLength > 0 ? track.trackLength : pattern.length;
    header.innerHTML = `
      <span class="page-title" style="margin:0">${pattern.name}</span>
      <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">
        ${track.name} &bull; ${pattern.length} steps &bull; T${ti + 1}: ${trackLenDisplay} steps
      </span>
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:0.6rem;color:var(--accent)">
        ${state.bpm ?? 120} BPM
      </span>
    `;
    container.append(header);

    // Wrapper for relative positioning (p-lock panel)
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;flex:1;display:flex;flex-direction:column;gap:8px';

    // Step grid
    const grid = document.createElement('div');
    grid.className = 'step-grid';
    const cols = 16; // always 16 columns
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gap = '3px';

    let plockStep = null;

    const buildPlockPanel = (stepIndex) => {
      const step = track.steps[stepIndex];
      const panel = document.createElement('div');
      panel.className = 'plock-panel visible';
      panel.innerHTML = `<h4>P-Lock Step ${stepIndex + 1}</h4>`;

      // Micro-timing row (above PLOCK_PARAMS)
      const microRow = document.createElement('div');
      microRow.className = 'plock-row';
      const microVal = step.microTime ?? 0;
      microRow.innerHTML = `
        <label>μTime</label>
        <input type="range" min="-0.5" max="0.5" step="0.01" value="${microVal}">
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);min-width:36px;text-align:right">
          ${microVal >= 0 ? '+' : ''}${microVal.toFixed(2)}
        </span>
      `;
      const microInput = microRow.querySelector('input');
      const microSpan  = microRow.querySelector('span');
      microInput.addEventListener('input', () => {
        const v = parseFloat(microInput.value);
        microSpan.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        const s = track.steps[stepIndex];
        if (s) s.microTime = v;
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats }); // trigger save
      });
      panel.append(microRow);

      PLOCK_PARAMS.forEach(({ label, param, min, max, step: s }) => {
        const current = step.paramLocks[param] ?? track[param] ?? min;
        const row = document.createElement('div');
        row.className = 'plock-row';
        row.innerHTML = `
          <label>${label}</label>
          <input type="range" min="${min}" max="${max}" step="${s}" value="${current}">
          <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);min-width:36px;text-align:right">
            ${Number(current).toFixed(s < 1 ? 2 : 0)}
          </span>
        `;
        const input = row.querySelector('input');
        const span  = row.querySelector('span');
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          span.textContent = v.toFixed(s < 1 ? 2 : 0);
          emit('step:plock', { stepIndex, param, value: v });
        });
        panel.append(row);
      });

      const closeBtn = document.createElement('button');
      closeBtn.className = 'seq-btn';
      closeBtn.style.cssText = 'width:100%;margin-top:6px;text-align:center';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => {
        panel.remove();
        plockStep = null;
      });
      panel.append(closeBtn);
      return panel;
    };

    track.steps.slice(0, pattern.length).forEach((step, i) => {
      const btn = document.createElement('button');
      btn.className = 'step-btn';
      if (step.active)                           btn.classList.add('active');
      if (step.accent)                           btn.classList.add('accent');
      if (Object.keys(step.paramLocks).length)   btn.classList.add('plock');
      if (i === state.currentStep)               btn.classList.add('playhead');
      if (Math.abs(step.microTime ?? 0) > 0.05)  btn.classList.add('micro');
      btn.textContent  = (i % 4 === 0) ? String(i + 1) : '';
      btn.dataset.prob = String(step.probability);
      // Visual micro-timing indicator: top border highlight
      if (Math.abs(step.microTime ?? 0) > 0.05) {
        btn.style.borderTop = '2px solid var(--live)';
      }

      btn.addEventListener('click', e => emit('step:toggle', { stepIndex: i, shiftKey: e.shiftKey }));
      btn.addEventListener('contextmenu', e => { e.preventDefault(); emit('step:prob', { stepIndex: i }); });

      // Long-press = open p-lock panel
      let holdTimer = null;
      btn.addEventListener('pointerdown', () => {
        holdTimer = setTimeout(() => {
          holdTimer = null;
          plockStep = i;
          wrapper.querySelectorAll('.plock-panel').forEach(p => p.remove());
          wrapper.append(buildPlockPanel(i));
        }, 500);
      });
      btn.addEventListener('pointerup',    () => clearTimeout(holdTimer));
      btn.addEventListener('pointerleave', () => clearTimeout(holdTimer));

      grid.append(btn);
    });

    wrapper.append(grid);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'seq-toolbar';

    // ── Track length control ───────────────────────────────────────────────────
    const trackLenDiv = document.createElement('div');
    trackLenDiv.style.cssText = 'display:flex;align-items:center;gap:4px';
    const defaultSteps = track.trackLength || pattern.length;
    trackLenDiv.innerHTML = `
      <label style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">T.LEN</label>
      <input type="number" min="0" max="64" value="${track.trackLength || 0}"
        style="width:46px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:2px 4px;font-family:var(--font-mono);font-size:0.6rem"
        title="0 = follow pattern length">
    `;
    const trackLenInput = trackLenDiv.querySelector('input');
    trackLenInput.addEventListener('change', () => {
      const v = Math.max(0, Math.min(64, parseInt(trackLenInput.value) || 0));
      emit('track:change', { param: 'trackLength', value: v });
    });
    toolbar.prepend(trackLenDiv);

    // ── Euclidean rhythm generator ─────────────────────────────────────────────
    const euclidDiv = document.createElement('div');
    euclidDiv.className = 'seq-euclid';
    const euclidStepDefault = track.trackLength || pattern.length;
    euclidDiv.innerHTML = `
      <label>EUCLID</label>
      <input type="number" min="1" max="64" value="${state.euclidBeats || 4}" style="width:46px" title="beats">
      <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">/</span>
      <input type="number" min="1" max="64" value="${euclidStepDefault}" style="width:46px" title="steps">
      <button class="seq-btn">Gen</button>
    `;
    const euclidBeatsInput = euclidDiv.querySelectorAll('input')[0];
    const euclidStepsInput = euclidDiv.querySelectorAll('input')[1];
    euclidDiv.querySelector('button').addEventListener('click', () => {
      const beats = parseInt(euclidBeatsInput.value, 10);
      const steps = parseInt(euclidStepsInput.value, 10) || (track.trackLength || pattern.length);
      const result = euclidean(beats, steps);
      result.forEach((active, i) => {
        if (track.steps[i]) track.steps[i].active = active;
      });
      emit('state:change', { path: 'euclidBeats', value: beats }); // saves state + re-renders
    });

    // ── Actions: Fill, Copy, Paste, Clear ──────────────────────────────────────
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'seq-actions';
    const hasStepCopy = state.copyBuffer?.type === 'steps';
    ['Copy', 'Paste', 'Clear'].forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'seq-btn';
      btn.textContent = label;
      if (label === 'Paste' && !hasStepCopy) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
      }
      btn.addEventListener('click', () => emit('state:change', { path: `action_${label.toLowerCase()}`, value: true }));
      actionsDiv.append(btn);
    });

    // Fill button (prepend so it appears first)
    const fillBtn = document.createElement('button');
    fillBtn.className = 'seq-btn' + (state._fillActive ? ' active' : '');
    fillBtn.textContent = 'Fill';
    fillBtn.style.color = state._fillActive ? 'var(--accent)' : '';
    fillBtn.addEventListener('click', () => emit('state:change', { path: 'action_fill', value: true }));
    actionsDiv.prepend(fillBtn);

    toolbar.append(euclidDiv, actionsDiv);
    wrapper.append(toolbar);
    container.append(wrapper);
  },

  knobMap: [
    { label: 'BPM',    param: 'bpm',           min: 40,  max: 240,  step: 1 },
    { label: 'Swing',  param: 'swing',          min: 0,   max: 0.42, step: 0.01 },
    { label: 'Length', param: 'patternLength',  min: 4,   max: 64,   step: 1 },
    { label: 'Steps',  param: 'patternLength',  min: 4,   max: 64,   step: 1 },
    { label: 'Density',param: 'euclidBeats',    min: 1,   max: 16,   step: 1 },
    { label: 'Shift',  param: 'patternShift',   min: 0,   max: 15,   step: 1 },
    { label: 'Prob',   param: 'defaultProb',    min: 0,   max: 1,    step: 0.01 },
    { label: 'Trig',   param: 'trigCondition',  min: 0,   max: 4,    step: 1 },
  ],

  keyboardContext: 'pattern',
};
