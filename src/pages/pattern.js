// src/pages/pattern.js — Step sequencer + euclidean + p-lock panel

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
    header.innerHTML = `
      <span class="page-title" style="margin:0">${pattern.name}</span>
      <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">
        ${track.name} &bull; ${pattern.length} steps
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

    let plockStep = null;

    const buildPlockPanel = (stepIndex) => {
      const step = track.steps[stepIndex];
      const panel = document.createElement('div');
      panel.className = 'plock-panel visible';
      panel.innerHTML = `<h4>P-Lock Step ${stepIndex + 1}</h4>`;

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
      btn.textContent  = String(i + 1).padStart(2, '0');
      btn.dataset.prob = String(step.probability);

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

    const euclidDiv = document.createElement('div');
    euclidDiv.className = 'seq-euclid';
    euclidDiv.innerHTML = `
      <label>Euclid</label>
      <input type="number" min="1" max="${pattern.length}" value="4" style="width:46px">
      <button class="seq-btn">Gen</button>
    `;
    const euclidInput = euclidDiv.querySelector('input');
    euclidDiv.querySelector('button').addEventListener('click', () => {
      emit('state:change', { path: 'euclidBeats', value: parseInt(euclidInput.value) });
    });

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
