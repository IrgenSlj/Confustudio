// src/pages/pattern.js — Multi-track step sequencer with euclidean + p-lock

import { TRACK_COLORS } from '../state.js';

// ─── Euclidean rhythm generator (Bjorklund algorithm) ────────────────────────
function euclidean(beats, steps) {
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
    const selTi   = state.selectedTrackIndex;
    const track   = pattern.kit.tracks[selTi];

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-shrink:0';
    header.innerHTML = `
      <span class="page-title" style="margin:0">${pattern.name}</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">
        ${pattern.length} steps &bull; ${state.bpm ?? 120} BPM
      </span>
    `;
    container.append(header);

    // ── Outer wrapper ─────────────────────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;flex:1;display:flex;flex-direction:column;gap:6px;min-height:0';

    // ── Multi-track grid ──────────────────────────────────────────────────────
    const multiGrid = document.createElement('div');
    multiGrid.className = 'multi-track-grid';

    let plockPanel = null;

    const buildPlockPanel = (stepIndex) => {
      const step = track.steps[stepIndex];
      const panel = document.createElement('div');
      panel.className = 'plock-panel visible';
      panel.innerHTML = `<h4>P-Lock Step ${stepIndex + 1}</h4>`;

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
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
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
        plockPanel = null;
      });
      panel.append(closeBtn);
      return panel;
    };

    // Render each of the 8 tracks as a row
    pattern.kit.tracks.forEach((trk, ti) => {
      const isSelected = ti === selTi;
      const trackLen   = trk.trackLength > 0 ? trk.trackLength : pattern.length;

      const row = document.createElement('div');
      row.className = 'mtg-row' + (isSelected ? ' active' : '') + (trk.mute ? ' muted' : '');
      row.style.setProperty('--track-color', TRACK_COLORS[ti]);

      // Track label
      const labelWrap = document.createElement('div');
      labelWrap.className = 'mtg-label-wrap';
      labelWrap.innerHTML = `
        <span class="mtg-label">T${ti + 1}</span>
        <span class="mtg-machine">${(trk.machine || 'tone').slice(0, 4).toUpperCase()}</span>
      `;
      labelWrap.addEventListener('click', () => emit('track:select', { trackIndex: ti }));
      row.append(labelWrap);

      // Step buttons
      trk.steps.slice(0, pattern.length).forEach((step, si) => {
        const btn = document.createElement('button');
        btn.className = 'step-btn step-sm';
        if (step.active)                          btn.classList.add('active');
        if (step.accent)                          btn.classList.add('accent');
        if (Object.keys(step.paramLocks).length)  btn.classList.add('plock');
        if (si === state.currentStep)             btn.classList.add('playhead');
        if (si >= trackLen)                       btn.classList.add('dim');
        if (Math.abs(step.microTime ?? 0) > 0.05) btn.style.borderTop = '2px solid var(--live)';
        btn.textContent  = (si % 4 === 0) ? String(si + 1) : '';
        btn.dataset.prob = String(step.probability);
        btn.dataset.step = si;
        btn.dataset.track = ti;
        if (si > 0 && si % 4 === 0) btn.classList.add('step-group-start');

        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (ti !== state.selectedTrackIndex) {
            emit('track:select', { trackIndex: ti });
          }
          emit('step:toggle', { stepIndex: si, shiftKey: e.shiftKey });
        });

        btn.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (ti === state.selectedTrackIndex) {
            emit('step:prob', { stepIndex: si });
          }
        });

        // Long-press p-lock (only on selected track)
        let holdTimer = null;
        btn.addEventListener('pointerdown', () => {
          if (ti !== selTi) return;
          holdTimer = setTimeout(() => {
            holdTimer = null;
            wrapper.querySelectorAll('.plock-panel').forEach(p => p.remove());
            plockPanel = si;
            wrapper.append(buildPlockPanel(si));
          }, 500);
        });
        btn.addEventListener('pointerup',    () => clearTimeout(holdTimer));
        btn.addEventListener('pointerleave', () => clearTimeout(holdTimer));

        row.append(btn);
      });

      multiGrid.append(row);
    });

    wrapper.append(multiGrid);

    // ── Toolbar ───────────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'seq-toolbar';

    const trackLenDiv = document.createElement('div');
    trackLenDiv.style.cssText = 'display:flex;align-items:center;gap:4px';
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
      emit('state:change', { path: 'euclidBeats', value: beats });
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
      btn.addEventListener('click', () =>
        emit('state:change', { path: `action_${label.toLowerCase()}`, value: true })
      );
      actionsDiv.append(btn);
    });

    const fillBtn = document.createElement('button');
    fillBtn.className = 'seq-btn' + (state._fillActive ? ' active' : '');
    fillBtn.textContent = 'Fill';
    fillBtn.style.color = state._fillActive ? 'var(--accent)' : '';
    fillBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_fill', value: true })
    );
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
