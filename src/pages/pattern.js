// src/pages/pattern.js — Multi-track step sequencer with euclidean + p-lock

import { TRACK_COLORS } from '../state.js';

// ─── Genre-aware randomize probability tables ─────────────────────────────────
// Each genre defines per-track step-probability arrays for 16 steps.
// Track order convention (0-based): 0=kick, 1=snare, 2=hihat, 3=clap, 4-7=other
// Values are multipliers applied on top of the global density (0-1).
// A value of 1 means "use full density", 0 means "never active".
const GENRE_WEIGHTS = {
  // Straight 4-on-the-floor kick, snare on 2&4, 8th-note hats, sparse perc
  drums: [
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], // kick: quarter notes
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // snare: beats 2 & 4
    [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], // hihat: all 8th notes (dense)
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], // clap
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // perc 1
    [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0], // perc 2
    [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,1], // perc 3
    [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0], // perc 4
  ],
  // House: 4-on-floor kick, offbeat hats, snare on 3, open hats on upbeats
  house: [
    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], // kick: 4-on-the-floor
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // snare: beat 3
    [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1], // closed hihat: offbeats
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], // open hihat
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0], // clap/snap
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // shaker
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0], // perc
    [0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0], // cymbal
  ],
  // Techno: dense kick, sparse snare, driving hats
  techno: [
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // kick: every 2nd 16th
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // snare: beat 3
    [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], // hihat: all 16ths
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1], // clap/rimshot
    [0,1,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0], // perc 1
    [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0], // perc 2
    [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], // perc 3
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // ride/accent
  ],
  // Jazz: swing-feel, hi-hat on 2&4, brushy snare, sparse kick
  jazz: [
    [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // kick: beats 1 & 3
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // snare: 2 & 4
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // ride: straight swing pattern
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0], // hihat: beat 2 accent
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0], // hihat: beat 4 accent
    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], // brush swirl
    [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0], // ghost note
    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // crash
  ],
  // Latin: clave-based patterns, congas, timbales
  latin: [
    [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0], // kick: son clave-ish
    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // snare/timbale: 2 & 4
    [1,0,1,0, 0,1,0,1, 0,1,0,0, 1,0,1,0], // hihat/shaker
    [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0], // clave (son)
    [0,1,0,0, 1,0,0,1, 0,0,1,0, 0,1,0,0], // conga low
    [1,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0], // conga high
    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0], // cowbell
    [0,1,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0], // guiro
  ],
  // Random: uniform (all weights = 1)
  random: null,
};

// Return a flat array of per-step probability weights for a given track index and genre.
// Steps beyond 16 wrap around the base pattern.
function getGenreStepWeights(genre, trackIndex, numSteps) {
  const table = GENRE_WEIGHTS[genre];
  if (!table) return Array(numSteps).fill(1); // 'random' / unknown → uniform
  const trackWeights = table[Math.min(trackIndex, table.length - 1)];
  const base = trackWeights.length; // 16
  return Array.from({ length: numSteps }, (_, i) => trackWeights[i % base]);
}

// ─── Note name helper ─────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToNoteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

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

const STEP_CONDITIONS = [
  { value: 'always',   label: 'Always' },
  { value: '1st',      label: '1st loop' },
  { value: 'not1st',   label: 'Skip 1st' },
  { value: 'every2',   label: 'Every 2' },
  { value: 'every3',   label: 'Every 3' },
  { value: 'every4',   label: 'Every 4' },
  { value: 'random',   label: 'Random' },
  { value: 'fill',     label: 'Fill only' },
  { value: 'not_fill', label: 'Not Fill' },
];

export default {
  render(container, state, emit) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const selTi   = state.selectedTrackIndex;
    const track   = pattern.kit.tracks[selTi];
    const rerenderPattern = () =>
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });

    function cloneStepData(step) {
      return {
        ...step,
        paramLocks: { ...(step.paramLocks ?? {}) },
      };
    }

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-shrink:0';
    const trackLen = track.trackLength > 0 ? track.trackLength : pattern.length;
    const activeSteps = track.steps.slice(0, trackLen).filter(s => s.active).length;
    header.innerHTML = `
      <span class="page-title" style="margin:0">${pattern.name}</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">
        ${pattern.length} steps &bull; ${state.bpm ?? 120} BPM
      </span>
      <span style="font-family:var(--font-mono);font-size:0.52rem;color:var(--accent);opacity:0.8">${activeSteps}/${trackLen} ON</span>
    `;
    // ── Global pattern step count quick-select ────────────────────────────────
    const globalStepSel = document.createElement('select');
    globalStepSel.style.cssText = 'font-size:0.5rem;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 4px;font-family:var(--font-mono)';
    globalStepSel.title = 'Global pattern step count';
    [8, 12, 16, 24, 32, 48, 64].forEach(n => {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = `${n}st`;
      if (n === (pattern.length ?? 16)) opt.selected = true;
      globalStepSel.append(opt);
    });
    globalStepSel.addEventListener('change', e => {
      const n = parseInt(e.target.value);
      emit('state:change', { path: 'length', value: n });
    });
    header.append(globalStepSel);

    // ── Pattern length quick-select (clear step-count labels) ─────────────────
    const stepCountSel = document.createElement('select');
    stepCountSel.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:3px;padding:1px 4px;cursor:pointer';
    stepCountSel.title = 'Set number of steps in pattern';
    [8, 16, 24, 32, 48, 64].forEach(n => {
      const opt = document.createElement('option');
      opt.value = String(n); opt.textContent = `${n} steps`;
      if (n === pattern.length) opt.selected = true;
      stepCountSel.append(opt);
    });
    stepCountSel.addEventListener('change', () => {
      emit('state:change', { path: 'patternLength', value: parseInt(stepCountSel.value) });
    });
    header.append(stepCountSel);

    container.append(header);

    // ── Follow action selector ────────────────────────────────────────────────
    const followDiv = document.createElement('div');
    followDiv.style.cssText = 'display:flex;align-items:center;gap:3px';
    const FA_OPTIONS = ['loop','next','prev','random','first','stop'];
    followDiv.innerHTML = `<label style="font-family:var(--font-mono);font-size:0.5rem;color:var(--muted)">→</label>`;
    const faSelect = document.createElement('select');
    faSelect.style.cssText = 'background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 4px;font-family:var(--font-mono);font-size:0.5rem';
    FA_OPTIONS.forEach(fa => {
      const opt = document.createElement('option');
      opt.value = fa; opt.textContent = fa;
      if (fa === (pattern.followAction ?? 'next')) opt.selected = true;
      faSelect.append(opt);
    });
    faSelect.addEventListener('change', () => {
      pattern.followAction = faSelect.value;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    followDiv.append(faSelect);
    header.append(followDiv);

    // ── Fill mode visual indicator ────────────────────────────────────────────
    if (state._fillActive) {
      const fillBadge = document.createElement('span');
      fillBadge.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;color:var(--live);background:rgba(90,221,113,0.15);padding:1px 5px;border-radius:3px;border:1px solid var(--live)';
      fillBadge.textContent = 'FILL';
      header.append(fillBadge);
    }

    // ── Outer wrapper ─────────────────────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;flex:1;display:flex;flex-direction:column;gap:6px;min-height:0';
    if (state._fillActive) {
      wrapper.style.outline = '2px solid var(--live)';
      wrapper.style.outlineOffset = '-2px';
    }

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
        emit('step:plock', { stepIndex, param: 'microTime', value: v });
      });
      panel.append(microRow);

      // Gate length row
      const gateRow = document.createElement('div');
      gateRow.className = 'plock-row';
      const gateVal = step.gate ?? 0.5;
      gateRow.innerHTML = `
        <label>Gate</label>
        <input type="range" min="0.05" max="1" step="0.05" value="${gateVal}">
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);min-width:36px;text-align:right">
          ${Math.round(gateVal * 100)}%
        </span>
      `;
      const gateInput = gateRow.querySelector('input');
      const gateSpan  = gateRow.querySelector('span');
      gateInput.addEventListener('input', () => {
        const v = parseFloat(gateInput.value);
        gateSpan.textContent = Math.round(v * 100) + '%';
        track.steps[stepIndex].gate = v;
        emit('step:plock', { stepIndex, param: 'gate', value: v });
      });
      panel.append(gateRow);

      // Retrig row
      const retrigRow = document.createElement('div');
      retrigRow.className = 'plock-row';
      const retrigVal = step.retrig ?? 1;
      retrigRow.innerHTML = `
        <label>Retrig</label>
        <input type="range" min="1" max="8" step="1" value="${retrigVal}">
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);min-width:36px;text-align:right">
          ${retrigVal}x
        </span>
      `;
      const retrigInput = retrigRow.querySelector('input');
      const retrigSpan  = retrigRow.querySelector('span');
      retrigInput.addEventListener('input', () => {
        const v = parseInt(retrigInput.value);
        retrigSpan.textContent = v + 'x';
        track.steps[stepIndex].retrig = v;
        emit('step:plock', { stepIndex, param: 'retrig', value: v });
      });
      panel.append(retrigRow);

      const noteRow = document.createElement('div');
      noteRow.className = 'plock-row';
      const noteVal = (step.paramLocks ?? {}).note ?? step.note ?? track.note ?? 60;
      noteRow.innerHTML = `
        <label>Note</label>
        <input type="range" min="24" max="96" step="1" value="${noteVal}">
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);min-width:44px;text-align:right">
          ${midiToNoteName(noteVal)}
        </span>
      `;
      const noteInput = noteRow.querySelector('input');
      const noteSpan  = noteRow.querySelector('span');
      noteInput.addEventListener('input', () => {
        const v = parseInt(noteInput.value, 10);
        noteSpan.textContent = midiToNoteName(v);
        emit('step:plock', { stepIndex, param: 'note', value: v });
      });
      panel.append(noteRow);

      const probRow = document.createElement('div');
      probRow.className = 'plock-row';
      const probVal = step.probability ?? 1;
      probRow.innerHTML = `
        <label>Prob</label>
        <input type="range" min="0.05" max="1" step="0.05" value="${probVal}">
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);min-width:44px;text-align:right">
          ${Math.round(probVal * 100)}%
        </span>
      `;
      const probInput = probRow.querySelector('input');
      const probSpan  = probRow.querySelector('span');
      probInput.addEventListener('input', () => {
        const v = parseFloat(probInput.value);
        track.steps[stepIndex].probability = v;
        probSpan.textContent = Math.round(v * 100) + '%';
        rerenderPattern();
      });
      panel.append(probRow);

      const condRow = document.createElement('div');
      condRow.className = 'plock-row';
      const condLabel = document.createElement('label');
      condLabel.textContent = 'Trig';
      const condSelect = document.createElement('select');
      condSelect.style.cssText = 'flex:1;background:#161a13;color:var(--screen-text);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:3px 4px;font-family:var(--font-mono);font-size:0.56rem';
      STEP_CONDITIONS.forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        if ((step.trigCondition ?? 'always') === value) opt.selected = true;
        condSelect.append(opt);
      });
      condSelect.addEventListener('change', () => {
        track.steps[stepIndex].trigCondition = condSelect.value;
        rerenderPattern();
      });
      condRow.append(condLabel, condSelect);
      panel.append(condRow);

      PLOCK_PARAMS.forEach(({ label, param, min, max, step: s }) => {
        const current = (step.paramLocks ?? {})[param] ?? track[param] ?? min;
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

      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'seq-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        state._stepClipboard = cloneStepData(track.steps[stepIndex]);
        emit('toast', { msg: `Copied step ${stepIndex + 1}` });
      });
      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'seq-btn';
      pasteBtn.textContent = 'Paste';
      pasteBtn.disabled = !state._stepClipboard;
      pasteBtn.style.opacity = state._stepClipboard ? '1' : '0.45';
      pasteBtn.addEventListener('click', () => {
        if (!state._stepClipboard) return;
        Object.assign(track.steps[stepIndex], cloneStepData(state._stepClipboard));
        rerenderPattern();
      });
      const clearBtn = document.createElement('button');
      clearBtn.className = 'seq-btn';
      clearBtn.textContent = 'Clear Locks';
      clearBtn.addEventListener('click', () => {
        track.steps[stepIndex].paramLocks = {};
        delete track.steps[stepIndex].paramLocks.note;
        rerenderPattern();
      });
      const selectBtn = document.createElement('button');
      selectBtn.className = 'seq-btn';
      selectBtn.textContent = 'Select';
      selectBtn.addEventListener('click', () => {
        if (!state._selectedSteps) state._selectedSteps = new Set();
        state._selectedSteps.add(stepIndex);
        rerenderPattern();
      });
      actionRow.append(copyBtn, pasteBtn, clearBtn, selectBtn);
      panel.append(actionRow);

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

    // ── Drag-to-paint state ───────────────────────────────────────────────────
    let dragActivating = null; // true = activate, false = deactivate
    let isDragging = false;

    if (!window._patternDragHandlerSet) {
      window._patternDragHandlerSet = true;
      window.addEventListener('mouseup', () => { isDragging = false; dragActivating = null; });
    }

    // Render each of the 8 tracks as a row
    pattern.kit.tracks.forEach((trk, ti) => {
      const isSelected   = ti === selTi;
      const trackLen     = trk.trackLength > 0 ? trk.trackLength : pattern.length;
      const trkStepCount = trk.stepCount ?? pattern.length;

      const row = document.createElement('div');
      row.className = 'mtg-row' + (isSelected ? ' active' : '') + (trk.mute ? ' muted' : '');
      row.style.setProperty('--track-color', TRACK_COLORS[ti]);
      if (trkStepCount > 16) row.style.overflowX = 'auto';

      // Track label
      const labelWrap = document.createElement('div');
      labelWrap.className = 'mtg-label-wrap';
      labelWrap.innerHTML = `
        <span class="mtg-label">T${ti + 1}</span>
        <span class="mtg-machine">${(trk.machine || 'tone').slice(0, 4).toUpperCase()}</span>
      `;
      const randBtn = document.createElement('button');
      randBtn.className = 'mtg-rand-btn';
      randBtn.title = 'Randomize steps (uses current density + genre)';
      randBtn.textContent = '⚄';
      randBtn.addEventListener('click', e => {
        e.stopPropagation();
        // Delegate to app.js so pushHistory is called there
        emit('pattern:randomize', { trackIndex: ti });
      });
      labelWrap.append(randBtn);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'mtg-rand-btn';
      copyBtn.title = 'Copy track steps';
      copyBtn.textContent = '⧉';
      copyBtn.addEventListener('click', e => {
        e.stopPropagation();
        state._trackCopyBuffer = JSON.parse(JSON.stringify(trk.steps));
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        emit('toast', { msg: 'Track steps copied' });
      });
      labelWrap.append(copyBtn);

      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'mtg-rand-btn';
      pasteBtn.title = 'Paste track steps';
      pasteBtn.textContent = '▣';
      pasteBtn.style.opacity = state._trackCopyBuffer ? '1' : '0.35';
      pasteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!state._trackCopyBuffer) return;
        emit('state:change', { path: 'action_trackPaste', value: { trackIndex: ti } });
      });
      labelWrap.append(pasteBtn);

      // REC arm button per track
      const recArmBtn = document.createElement('button');
      recArmBtn.className = 'mtg-rand-btn mtg-rec-arm-btn' + (trk.recArmed ? ' armed' : '');
      recArmBtn.title = trk.recArmed ? 'Disarm track from recording' : 'Arm track for recording';
      recArmBtn.textContent = '●';
      recArmBtn.style.color = trk.recArmed ? 'var(--live, #f44)' : 'var(--muted, #555)';
      recArmBtn.addEventListener('click', e => {
        e.stopPropagation();
        trk.recArmed = !trk.recArmed;
        recArmBtn.classList.toggle('armed', trk.recArmed);
        recArmBtn.style.color = trk.recArmed ? 'var(--live, #f44)' : 'var(--muted, #555)';
        recArmBtn.title = trk.recArmed ? 'Disarm track from recording' : 'Arm track for recording';
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });
      labelWrap.append(recArmBtn);

      // Velocity randomize button per track
      const velRandBtn = document.createElement('button');
      velRandBtn.className = 'mtg-rand-btn mtg-vel-rand-btn';
      velRandBtn.title = 'Randomize step velocities';
      velRandBtn.textContent = '⚄';
      velRandBtn.addEventListener('click', e => {
        e.stopPropagation();
        const activePattern = state.project.banks[state.activeBank].patterns[state.activePattern];
        const currentTrack = activePattern.kit.tracks[ti];
        currentTrack.steps.forEach(s => {
          if (s.active) s.velocity = 0.5 + Math.random() * 0.5; // 50-100%
        });
        emit('state:change', { param: 'pattern' });
      });
      labelWrap.append(velRandBtn);

      // Per-track step count selector (polyrhythm)
      const stepCountSel = document.createElement('select');
      stepCountSel.style.cssText = 'font-size:0.44rem;background:var(--surface);color:var(--muted);border:1px solid rgba(255,255,255,0.1);border-radius:2px;padding:0 2px;width:32px';
      stepCountSel.title = 'Track step count (polyrhythm)';
      [8, 12, 16, 24, 32].forEach(n => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = String(n);
        if (n === (trk.stepCount ?? pattern.length ?? 16)) opt.selected = true;
        stepCountSel.append(opt);
      });
      stepCountSel.addEventListener('change', e => {
        e.stopPropagation();
        const n = parseInt(e.target.value);
        trk.stepCount = n === (pattern.length ?? 16) ? null : n;
        emit('track:change', { trackIndex: ti, param: 'stepCount', value: trk.stepCount });
        // Trigger a re-render by emitting a no-op length change (same value, causes renderPage)
        emit('state:change', { path: 'length', value: pattern.length });
      });
      labelWrap.append(stepCountSel);

      labelWrap.style.cursor = 'pointer';
      labelWrap.title = 'Click to select track; click label text to expand/collapse step details';
      labelWrap.addEventListener('click', () => emit('track:select', { trackIndex: ti }));

      const labelTextEl = labelWrap.querySelector('.mtg-label');
      if (labelTextEl) {
        labelTextEl.style.cursor = 'pointer';
        labelTextEl.title = 'Click to expand/collapse step details';
        labelTextEl.addEventListener('click', e => {
          e.stopPropagation();
          if (!state._expandedTracks) state._expandedTracks = new Set();
          if (state._expandedTracks.has(ti)) {
            state._expandedTracks.delete(ti);
          } else {
            state._expandedTracks.add(ti);
          }
          // Re-render the step row to show/hide velocity bars
          emit('state:change', { param: 'velocity' });
        });
      }

      row.append(labelWrap);

      // Step buttons — use per-track stepCount if set, otherwise fall back to global pattern.length
      trk.steps.slice(0, trkStepCount).forEach((step, si) => {
        const btn = document.createElement('button');
        btn.className = 'step-btn step-sm';
        btn.style.position = 'relative';
        if (step.active)                          btn.classList.add('active');
        if (step.accent)                          btn.classList.add('accent');
        if (Object.keys(step.paramLocks ?? {}).length)  btn.classList.add('plock');
        if (si === state.currentStep)             btn.classList.add('playhead');
        if (state.stepRecordMode && si === (state._stepRecordCursor ?? 0) && ti === selTi)
                                                  btn.classList.add('step-record-cursor');
        if (si >= trackLen)                       btn.classList.add('dim');
        if (step.mute)                            btn.classList.add('step-muted');
        if (step.trigCondition === 'fill')        btn.classList.add('trig-fill');
        if (state._selectedSteps?.has(si) && ti === selTi) btn.classList.add('step-selected');
        // microTime nudge bar — thin accent bar at bottom showing timing offset direction
        if (Math.abs(step.microTime ?? 0) > 0.02) {
          const microBar = document.createElement('div');
          microBar.className = 'step-micro-bar';
          const mt = step.microTime;
          microBar.style.cssText = `
            width: ${Math.abs(mt) * 80}%;
            left: ${mt > 0 ? '50%' : (50 - Math.abs(mt) * 80) + '%'};
          `;
          btn.append(microBar);
        }
        // Micro-timing arrow indicator
        if (Math.abs(step.microTime ?? 0) > 0.05) {
          const microArrow = document.createElement('span');
          microArrow.style.cssText = 'font-size:0.28rem;position:absolute;top:1px;right:2px;opacity:0.6;pointer-events:none';
          microArrow.textContent = (step.microTime ?? 0) < 0 ? '◂' : '▸';
          btn.append(microArrow);
        }
        const vel = step.velocity ?? 1;
        const prob = step.probability ?? 1;
        // Active steps: opacity blends velocity; prob < 1 reduces further
        if (step.active) {
          btn.style.opacity = String(0.4 + vel * 0.6);
        }
        btn.textContent  = (si % 4 === 0) ? String(si + 1) : '';
        btn.dataset.prob = String(prob);
        btn.dataset.step = si;
        btn.dataset.track = ti;
        btn.title = `Step ${si+1}: ${step.active ? 'ON' : 'OFF'}${prob < 1 ? ' · prob '+Math.round(prob*100)+'%' : ''}${step.accent ? ' · accent' : ''}`;
        if (prob < 1) {
          btn.classList.add('has-prob');
          btn.style.setProperty('--prob', prob);
          btn.style.opacity = String(0.4 + prob * 0.6);
        }
        // Velocity indicator (small number shown when velocity is noticeably below max)
        if (step.active && vel < 0.95) {
          const velSpan = document.createElement('span');
          velSpan.className = 'step-vel';
          velSpan.textContent = String(Math.round(vel * 100));
          btn.append(velSpan);
        }
        // Note label — show when param-locked note exists OR step has non-default pitch
        {
          const noteMidi = step.paramLocks?.note ?? (step.note !== 60 && step.note != null ? step.note : null);
          if (noteMidi != null && step.active) {
            const noteSpan = document.createElement('span');
            noteSpan.className = 'step-note-label';
            noteSpan.style.cssText = 'font-size:0.32rem;position:absolute;bottom:1px;left:0;right:0;text-align:center;opacity:0.7;pointer-events:none;color:rgba(0,0,0,0.9);font-family:monospace';
            noteSpan.textContent = midiToNoteName(noteMidi);
            btn.append(noteSpan);
          }
        }
        // Trig condition badge on active steps (3-char, top-right, amber)
        if (step.trigCondition && step.trigCondition !== 'always' && step.active) {
          const condBadge = document.createElement('span');
          condBadge.style.cssText = 'position:absolute;top:1px;right:1px;font-size:0.32rem;font-family:var(--font-mono);color:rgba(255,200,100,0.9);line-height:1;pointer-events:none';
          condBadge.textContent = step.trigCondition.substring(0, 3).toUpperCase();
          btn.append(condBadge);
        }
        // Gate length bar — shown only when gate deviates significantly from default (0.5)
        if (step.active) {
          const gate = step.gate ?? 0.5;
          if (gate < 0.35 || gate > 0.65) {
            const gateBar = document.createElement('div');
            gateBar.className = 'step-gate-bar';
            gateBar.style.width = Math.round(gate * 100) + '%';
            btn.append(gateBar);
          }
        }
        // P-lock dot — shown when any paramLocks are set
        if (step.paramLocks && Object.keys(step.paramLocks).length > 0) {
          const plockDot = document.createElement('div');
          plockDot.className = 'step-plock-dot';
          btn.append(plockDot);
        }
        // Trig condition badge
        if (step.trigCondition && step.trigCondition !== 'always') {
          btn.classList.add('has-trig');
          btn.classList.add('has-trig-cond');
          btn.dataset.trig = step.trigCondition;
          const condLabels = {
            '1st':      '1',
            'not1st':   '¬1',
            'every2':   '/2',
            'every3':   '/3',
            'every4':   '/4',
            'random50': '?',
            'random':   '?',
            'fill':     'F',
            'not_fill': '¬F',
            'first':    '1',
            'not_first':'¬1',
            '1:2':      '½',
          };
          const condLabel = condLabels[step.trigCondition] ?? step.trigCondition.slice(0, 2);
          btn.dataset.trigCond = condLabel;
          const condColors = {
            '1st':      '#4af',
            'not1st':   '#fa4',
            'every2':   '#4f4',
            'every3':   '#4f4',
            'every4':   '#4f4',
            'random50': '#f44',
            'random':   '#f44',
            'fill':     '#af4',
            'not_fill': '#f84',
            'first':    '#4af',
            'not_first':'#fa4',
          };
          btn.style.setProperty('--trig-cond-color', condColors[step.trigCondition] ?? 'var(--accent)');
        }
        if (si > 0 && si % 4 === 0) btn.classList.add('step-group-start');

        btn.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return; // left button only
          e.preventDefault();
          const wasActive = step.active;
          dragActivating = !wasActive;
          isDragging = true;
          step.active = dragActivating;
          btn.classList.toggle('active', step.active);
          btn._blockNextClick = true; // prevent the subsequent click from double-toggling
          emit('state:change', { param: 'pattern' });
        });

        btn.addEventListener('mouseenter', () => {
          if (!isDragging || dragActivating === null) return;
          step.active = dragActivating;
          btn.classList.toggle('active', step.active);
          emit('state:change', { param: 'pattern' });
        });

        btn.addEventListener('mouseenter', () => {
          if (!step.active) return;
          // Preview: emit note:preview so the engine plays briefly without recording
          emit('note:preview', {
            trackIndex: ti,
            note: step.note ?? trk.note ?? 60,
            velocity: step.velocity ?? 0.6,
            duration: 0.1,
          });
        });

        btn.addEventListener('mousedown', e => {
          if (!e.shiftKey || !step.active) return;
          e.preventDefault();
          e.stopPropagation();
          const startY = e.clientY;
          const startVel = step.velocity ?? 1.0;

          const onMove = (me) => {
            const delta = (startY - me.clientY) / 80; // 80px = full range
            step.velocity = Math.max(0.05, Math.min(1.0, startVel + delta));
            btn.style.setProperty('--vel', step.velocity);
            btn.title = `Step ${si+1} vel:${Math.round(step.velocity * 100)}%`;
            emit('state:change', { param: 'velocity' });
          };

          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });

        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (btn._blockNextClick) {
            btn._blockNextClick = false;
            return;
          }
          if (ti !== state.selectedTrackIndex) {
            emit('track:select', { trackIndex: ti });
          }
          if (e.altKey) {
            // Alt+click = toggle mute on this step
            step.mute = !step.mute;
            emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
          } else if (e.shiftKey) {
            // Shift+click = toggle step in selection set
            if (!state._selectedSteps) state._selectedSteps = new Set();
            if (state._selectedSteps.has(si)) {
              state._selectedSteps.delete(si);
            } else {
              state._selectedSteps.add(si);
            }
            emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
          } else {
            emit('step:toggle', { stepIndex: si, shiftKey: false });
          }
        });

        btn.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (ti !== state.selectedTrackIndex) return;

          // Remove any existing context menus
          document.querySelectorAll('.step-ctx-menu').forEach(m => m.remove());

          const menu = document.createElement('div');
          menu.className = 'step-ctx-menu';
          menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:999;
            background:#1a1e14;border:1px solid var(--accent);border-radius:4px;padding:4px;
            font-family:var(--font-mono);font-size:0.55rem;min-width:130px`;

          // Probability section
          const probWrap = document.createElement('div');
          probWrap.style.cssText = 'padding:2px 4px';
          const probLabel = document.createElement('label');
          probLabel.style.cssText = 'font-size:0.48rem;color:var(--muted);display:block';
          const probValSpan = document.createElement('span');
          probValSpan.id = 'prob-val';
          probValSpan.textContent = `${Math.round((step.probability ?? 1) * 100)}%`;
          probLabel.append('PROB ', probValSpan);
          const probSlider = document.createElement('input');
          probSlider.type = 'range';
          probSlider.min = '0';
          probSlider.max = '1';
          probSlider.step = '0.05';
          probSlider.value = String(step.probability ?? 1);
          probSlider.style.cssText = 'width:100%;accent-color:var(--accent)';
          probSlider.addEventListener('input', () => {
            step.probability = parseFloat(probSlider.value);
            probValSpan.textContent = `${Math.round(step.probability * 100)}%`;
            emit('state:change', { param: 'pattern' });
          });
          probWrap.append(probLabel, probSlider);
          menu.append(probWrap);

          // Divider
          const divider = document.createElement('div');
          divider.style.cssText = 'border-top:1px solid #2a3a2a;margin:3px 0';
          menu.append(divider);

          // TrigCondition section
          const trigLabel = document.createElement('div');
          trigLabel.style.cssText = 'color:var(--muted);padding:2px 4px;font-size:0.48rem';
          trigLabel.textContent = 'TRIG CONDITION';
          menu.append(trigLabel);

          STEP_CONDITIONS.forEach(({ value: cond, label }) => {
            const item = document.createElement('div');
            item.className = 'ctx-item' + ((step.trigCondition ?? 'always') === cond ? ' active' : '');
            item.textContent = label;
            item.addEventListener('click', () => {
              step.trigCondition = cond;
              emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
              menu.remove();
            });
            menu.append(item);
          });

          // ── Action items ─────────────────────────────────────────────────
          const divider2 = document.createElement('div');
          divider2.style.cssText = 'border-top:1px solid #2a3a2a;margin:3px 0';
          menu.append(divider2);

          const makeActionItem = (label, fn) => {
            const item = document.createElement('div');
            item.className = 'ctx-item';
            item.textContent = label;
            item.addEventListener('click', () => { fn(); menu.remove(); });
            menu.append(item);
          };

          makeActionItem('Set velocity…', () => {
            const raw = prompt(`Velocity for step ${si + 1} (0–127):`, String(Math.round((step.velocity ?? 1) * 127)));
            if (raw === null) return;
            const v = Math.max(0, Math.min(127, parseInt(raw, 10)));
            if (!isNaN(v)) {
              step.velocity = v / 127;
              emit('state:change', { param: 'pattern' });
            }
          });

          makeActionItem('Set gate…', () => {
            const raw = prompt(`Gate for step ${si + 1} (0–100%):`, String(Math.round((step.gate ?? 0.5) * 100)));
            if (raw === null) return;
            const v = Math.max(0, Math.min(100, parseInt(raw, 10)));
            if (!isNaN(v)) {
              step.gate = v / 100;
              emit('state:change', { param: 'pattern' });
            }
          });

          makeActionItem('Set microtime…', () => {
            const raw = prompt(`Micro-time for step ${si + 1} (-50 to +50):`, String(Math.round((step.microTime ?? 0) * 100)));
            if (raw === null) return;
            const v = Math.max(-50, Math.min(50, parseInt(raw, 10)));
            if (!isNaN(v)) {
              step.microTime = v / 100;
              emit('state:change', { param: 'pattern' });
            }
          });

          makeActionItem('Clear param locks', () => {
            step.paramLocks = {};
            emit('state:change', { param: 'pattern' });
          });

          document.body.append(menu);
          // Close on outside click or Escape
          const closeMenu = () => menu.remove();
          const onKeyDown = (ev) => { if (ev.key === 'Escape') { closeMenu(); document.removeEventListener('keydown', onKeyDown); } };
          document.addEventListener('keydown', onKeyDown);
          setTimeout(() => document.addEventListener('click', () => { closeMenu(); document.removeEventListener('keydown', onKeyDown); }, { once: true }), 0);
        });

        // ── Velocity drag + long-press p-lock ─────────────────────────────────
        let velDragTimer = null, velDragging = false, velStartY = 0, velStartVal = 1;
        let holdTimer = null;

        btn.addEventListener('pointerdown', e => {
          // Alt+drag horizontally = set microTime (early/late nudge)
          if (e.altKey) {
            e.stopPropagation();
            e.preventDefault();
            btn.setPointerCapture(e.pointerId);
            const startX  = e.clientX;
            const startMT = step.microTime ?? 0;
            let dragged = false;
            function onMicroMove(ev) {
              dragged = true;
              const delta = (ev.clientX - startX) / 40; // 40px = full 0.5 range each side
              step.microTime = Math.max(-0.5, Math.min(0.5, startMT + delta));
              // update or create micro bar live
              let microBar = btn.querySelector('.step-micro-bar');
              if (Math.abs(step.microTime) > 0.02) {
                if (!microBar) {
                  microBar = document.createElement('div');
                  microBar.className = 'step-micro-bar';
                  btn.append(microBar);
                }
                const mt = step.microTime;
                microBar.style.cssText = `
                  width: ${Math.abs(mt) * 80}%;
                  left: ${mt > 0 ? '50%' : (50 - Math.abs(mt) * 80) + '%'};
                `;
              } else if (microBar) {
                microBar.remove();
              }
            }
            function onMicroUp() {
              window.removeEventListener('pointermove', onMicroMove);
              window.removeEventListener('pointerup', onMicroUp);
              if (dragged) {
                btn._blockNextClick = true;
                emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
              }
            }
            window.addEventListener('pointermove', onMicroMove);
            window.addEventListener('pointerup', onMicroUp);
            return;
          }

          // Velocity drag — only on active steps of the selected track
          if (step.active && ti === selTi) {
            velStartY   = e.clientY;
            velStartVal = step.velocity ?? 1;
            velDragging = false;
            velDragTimer = setTimeout(() => {
              velDragging = true;
              btn.setPointerCapture(e.pointerId);
              // Cancel any p-lock hold timer that may also be running
              clearTimeout(holdTimer);
              holdTimer = null;
            }, 180);
          }

          // Long-press p-lock (only on selected track, fires at 500 ms)
          if (ti !== selTi) return;
          holdTimer = setTimeout(() => {
            if (velDragging) return; // velocity drag took over
            holdTimer = null;
            wrapper.querySelectorAll('.plock-panel').forEach(p => p.remove());
            plockPanel = si;
            wrapper.append(buildPlockPanel(si));
          }, 500);
        });

        btn.addEventListener('pointermove', e => {
          if (!velDragging) return;
          const newVel = Math.max(0.05, Math.min(1, velStartVal + (velStartY - e.clientY) / 60));
          step.velocity = newVel;
          btn.style.opacity = String(0.4 + newVel * 0.6);
          let velSpan = btn.querySelector('.step-vel');
          if (velSpan) {
            velSpan.textContent = Math.round(newVel * 100);
          } else {
            velSpan = document.createElement('span');
            velSpan.className = 'step-vel';
            velSpan.textContent = Math.round(newVel * 100);
            btn.append(velSpan);
          }
        });

        btn.addEventListener('pointerup', e => {
          clearTimeout(velDragTimer);
          clearTimeout(holdTimer);
          holdTimer = null;
          if (velDragging) {
            velDragging = false;
            btn._blockNextClick = true;
            emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
            return;
          }
          velDragging = false;
        });

        btn.addEventListener('pointerleave', () => {
          clearTimeout(velDragTimer);
          clearTimeout(holdTimer);
          holdTimer = null;
          // Do not cancel velDragging here — pointer capture keeps events flowing
        });

        row.append(btn);
      });

      // Track length drag handle
      const handle = document.createElement('div');
      handle.className = 'track-len-handle';
      handle.title = `Track length: ${trackLen}`;
      handle.addEventListener('pointerdown', e => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startTrackLen = trk.trackLength > 0 ? trk.trackLength : pattern.length;
        const firstBtn = row.querySelector('.step-btn');
        const stepBtnWidth = firstBtn ? firstBtn.offsetWidth + 2 : 18;
        let currentLen = startTrackLen;
        const onMove = ev => {
          const delta = Math.round((ev.clientX - startX) / stepBtnWidth);
          const newLen = Math.max(1, Math.min(64, startTrackLen + delta));
          if (newLen !== currentLen) {
            currentLen = newLen;
            trk.trackLength = newLen;
            handle.title = `Track length: ${newLen}`;
            row.querySelectorAll('.step-btn').forEach((b, idx) => {
              b.classList.toggle('dim', idx >= newLen);
            });
          }
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          emit('track:change', { param: 'trackLength', value: currentLen });
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
      row.append(handle);

      const activeCount = trk.steps.slice(0, trkStepCount).filter(s => s.active).length;
      const countBadge = document.createElement('span');
      countBadge.className = 'mtg-count';
      countBadge.textContent = activeCount > 0 ? String(activeCount) : '';
      row.append(countBadge);

      // Wrap row (and optional velocity bar) in a track container
      const trackContainer = document.createElement('div');
      trackContainer.style.cssText = 'display:flex;flex-direction:column';
      trackContainer.append(row);

      // Expanded velocity bar row
      if (state._expandedTracks?.has(ti)) {
        const velRow = document.createElement('div');
        // Offset to align with step buttons (label wrap is approx 56px wide)
        velRow.style.cssText = 'display:flex;gap:1px;height:12px;margin-top:1px;padding-left:56px;padding-right:2px';
        trk.steps.slice(0, trkStepCount).forEach(s => {
          const bar = document.createElement('div');
          bar.style.cssText = `flex:1;background:${s.active ? 'var(--accent)' : 'rgba(255,255,255,0.04)'};height:${s.active ? Math.round((s.velocity ?? 1) * 100) : 0}%;align-self:flex-end;border-radius:1px`;
          velRow.append(bar);
        });
        trackContainer.append(velRow);
      }

      multiGrid.append(trackContainer);
    });

    wrapper.append(multiGrid);
    container.append(wrapper);

    // ── Playhead rAF highlight ────────────────────────────────────────────────
    // Each frame: stamp the current-step column with .step-playing across all rows.
    // The loop is self-terminating: once multiGrid leaves the DOM the loop stops.
    let _playheadRafId = null;
    let _lastProbStep = -1;
    const stepBtns = multiGrid.querySelectorAll('.step-btn[data-step]');
    const runPlayheadHighlight = () => {
      if (!multiGrid.isConnected) {
        // Page was re-rendered; stop looping.
        if (_playheadRafId) { cancelAnimationFrame(_playheadRafId); _playheadRafId = null; }
        return;
      }
      const cur = state.currentStep;
      stepBtns.forEach(btn => {
        const isPlaying = (cur >= 0) && (Number(btn.dataset.step) === cur);
        if (isPlaying) {
          btn.classList.add('step-playing');
          // Probability flicker: trigger only once per new step position
          if (cur !== _lastProbStep && btn.classList.contains('has-prob')) {
            const prob = parseFloat(btn.style.getPropertyValue('--prob') ?? '1');
            if (prob < 1) {
              btn.classList.add('step-active-prob');
              // Dim opacity proportional to probability so low-prob steps flash dimmer
              btn.style.setProperty('--prob-flash-opacity', String(prob));
              setTimeout(() => {
                btn.classList.remove('step-active-prob');
              }, 120);
            }
          }
        } else {
          btn.classList.remove('step-playing');
        }
      });
      if (cur !== _lastProbStep) _lastProbStep = cur;
      _playheadRafId = requestAnimationFrame(runPlayheadHighlight);
    };
    _playheadRafId = requestAnimationFrame(runPlayheadHighlight);

    // ── Toolbar ───────────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'seq-toolbar';

    const trackLenDiv = document.createElement('div');
    trackLenDiv.style.cssText = 'display:flex;align-items:center;gap:4px';
    trackLenDiv.innerHTML = `
      <label style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">T.LEN</label>
      <input type="number" min="0" max="64" value="${track?.trackLength || 0}"
        style="width:46px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:2px 4px;font-family:var(--font-mono);font-size:0.6rem"
        title="0 = follow pattern length">
    `;
    const trackLenInput = trackLenDiv.querySelector('input');
    trackLenInput.addEventListener('change', () => {
      const v = Math.max(0, Math.min(64, parseInt(trackLenInput.value) || 0));
      emit('track:change', { param: 'trackLength', value: v });
    });
    toolbar.prepend(trackLenDiv);

    // ── Probability mode indicator ────────────────────────────────────────────
    const probIndicator = document.createElement('span');
    probIndicator.className = 'prob-mode-indicator';
    const trackHasProb = track?.steps?.some(s => (s.prob ?? s.probability ?? 1) < 1) ?? false;
    if (trackHasProb) probIndicator.classList.add('active');
    probIndicator.textContent = 'P%';
    probIndicator.title = trackHasProb
      ? 'This track has steps with probability < 100%'
      : 'No probability locks on this track';
    toolbar.prepend(probIndicator);

    const euclidDiv = document.createElement('div');
    euclidDiv.className = 'seq-euclid';
    const euclidStepDefault = track?.trackLength || pattern.length;
    const euclidOffsetDefault = state.euclidOffset ?? 0;

    // ── Euclid canvas visualizer ───────────────────────────────────────────
    const euclidCanvas = document.createElement('canvas');
    euclidCanvas.width  = 80;
    euclidCanvas.height = 80;
    euclidCanvas.className = 'euclid-canvas';
    euclidCanvas.title = 'Euclidean pattern preview';

    function drawEuclidCircle(canvas, beats, steps, offset, activeSteps) {
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2, r = W / 2 - 8;
      ctx.clearRect(0, 0, W, H);
      // Resolve CSS variables from the document root (canvas cannot use var())
      const cs = getComputedStyle(document.documentElement);
      const colorAccent  = cs.getPropertyValue('--accent').trim()      || '#f0c640';
      const colorLive    = cs.getPropertyValue('--live').trim()         || '#5add71';
      // Outer circle
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      // Generate base euclid pattern then rotate
      const base = euclidean(beats, steps);
      const off  = ((offset % steps) + steps) % steps;
      const pat  = [...base.slice(off), ...base.slice(0, off)];
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const isActive   = pat[i];
        const isCurrent  = activeSteps ? activeSteps[i] : false;
        // Colour priority: both active = accent, current-only = live (green), euclid-only = accent (dim), inactive = dark
        let fill;
        if (isCurrent && isActive) {
          fill = colorAccent;
        } else if (isCurrent) {
          fill = colorLive;
        } else if (isActive) {
          fill = colorAccent;
        } else {
          fill = '#444';
        }
        ctx.beginPath();
        ctx.arc(x, y, isActive ? 4 : 2, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      }
    }

    // Build current-track active array for overlay
    const euclidTrackLen = track.trackLength > 0 ? track.trackLength : pattern.length;
    const currentActiveSteps = track.steps.slice(0, euclidTrackLen).map(s => s.active);

    // Initial draw
    drawEuclidCircle(
      euclidCanvas,
      state.euclidBeats || 4,
      euclidStepDefault,
      euclidOffsetDefault,
      currentActiveSteps
    );

    euclidDiv.append(euclidCanvas);

    // ── Label + inputs ─────────────────────────────────────────────────────
    const euclidInputsWrap = document.createElement('div');
    euclidInputsWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px';

    // Row 1: beats / steps
    const euclidRow1 = document.createElement('div');
    euclidRow1.style.cssText = 'display:flex;align-items:center;gap:4px';
    euclidRow1.innerHTML = `
      <label>EUCLID</label>
      <input type="number" min="1" max="64" value="${state.euclidBeats || 4}" style="width:40px" title="beats">
      <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">/</span>
      <input type="number" min="1" max="64" value="${euclidStepDefault}" style="width:40px" title="steps">
    `;

    // Row 2: rotation offset + Gen + All
    const euclidRow2 = document.createElement('div');
    euclidRow2.style.cssText = 'display:flex;align-items:center;gap:4px';
    euclidRow2.innerHTML = `
      <label style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">ROT</label>
      <input type="number" min="0" max="63" value="${euclidOffsetDefault}" style="width:40px" title="rotation offset (steps to shift)">
    `;

    const genBtn = document.createElement('button');
    genBtn.className = 'seq-btn';
    genBtn.textContent = 'Gen';
    genBtn.title = 'Apply euclid pattern to selected track';

    const allBtn = document.createElement('button');
    allBtn.className = 'seq-btn euclid-all-btn';
    allBtn.textContent = 'All';
    allBtn.title = 'Apply euclid to all 8 tracks (evenly spaced offsets)';

    euclidRow2.append(genBtn, allBtn);

    euclidInputsWrap.append(euclidRow1, euclidRow2);
    euclidDiv.append(euclidInputsWrap);

    const euclidBeatsInput  = euclidRow1.querySelectorAll('input')[0];
    const euclidStepsInput  = euclidRow1.querySelectorAll('input')[1];
    const euclidOffsetInput = euclidRow2.querySelector('input');

    // Clamp offset max when steps changes
    const refreshCanvas = () => {
      const beats  = parseInt(euclidBeatsInput.value,  10) || 4;
      const steps  = parseInt(euclidStepsInput.value,  10) || euclidStepDefault;
      const offset = parseInt(euclidOffsetInput.value, 10) || 0;
      euclidOffsetInput.max = String(Math.max(0, steps - 1));
      drawEuclidCircle(euclidCanvas, beats, steps, offset, currentActiveSteps);
    };

    euclidBeatsInput.addEventListener('input',  refreshCanvas);
    euclidStepsInput.addEventListener('input',  refreshCanvas);
    euclidOffsetInput.addEventListener('input', refreshCanvas);

    genBtn.addEventListener('click', () => {
      const beats  = parseInt(euclidBeatsInput.value,  10);
      const steps  = parseInt(euclidStepsInput.value,  10) || (track.trackLength || pattern.length);
      const offset = parseInt(euclidOffsetInput.value, 10) || 0;
      const base   = euclidean(beats, steps);
      const off    = ((offset % steps) + steps) % steps;
      const result = [...base.slice(off), ...base.slice(0, off)];
      result.forEach((active, i) => {
        if (track.steps[i]) track.steps[i].active = active;
      });
      state.euclidBeats  = beats;
      state.euclidOffset = offset;
      emit('state:change', { path: 'euclidBeats', value: beats });
    });

    allBtn.addEventListener('click', () => {
      const beats = parseInt(euclidBeatsInput.value,  10);
      const steps = parseInt(euclidStepsInput.value,  10) || (track.trackLength || pattern.length);
      const base  = euclidean(beats, steps);
      pattern.kit.tracks.forEach((trk, ti) => {
        const off    = Math.round(ti * steps / 8);
        const result = [...base.slice(off), ...base.slice(0, off)];
        result.forEach((active, i) => {
          if (trk.steps[i]) trk.steps[i].active = active;
        });
      });
      state.euclidBeats  = beats;
      state.euclidOffset = 0;
      emit('state:change', { path: 'euclidBeats', value: beats });
      emit('toast', { msg: 'Applied to all 8 tracks' });
    });

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'seq-actions';
    const hasStepCopy = state.copyBuffer?.type === 'steps';
    const copyBtn2 = document.createElement('button');
    copyBtn2.className = 'seq-btn';
    copyBtn2.textContent = 'Copy';
    copyBtn2.title = 'Copy current track steps (C)';
    copyBtn2.addEventListener('click', () => {
      emit('state:change', { path: 'action_copy', value: true });
      copyBtn2.style.background = 'rgba(90,221,113,0.3)';
      setTimeout(() => { copyBtn2.style.background = ''; }, 400);
    });
    actionsDiv.append(copyBtn2);

    const pasteBtn2 = document.createElement('button');
    pasteBtn2.className = 'seq-btn';
    pasteBtn2.textContent = 'Paste';
    pasteBtn2.title = 'Paste steps to current track (V)';
    if (!hasStepCopy) {
      pasteBtn2.disabled = true;
      pasteBtn2.style.opacity = '0.4';
    }
    pasteBtn2.addEventListener('click', () => {
      emit('state:change', { path: 'action_paste', value: true });
      pasteBtn2.style.background = 'rgba(90,221,113,0.3)';
      setTimeout(() => { pasteBtn2.style.background = ''; }, 400);
    });
    actionsDiv.append(pasteBtn2);

    const clearBtn2 = document.createElement('button');
    clearBtn2.className = 'seq-btn';
    clearBtn2.textContent = 'Clear';
    clearBtn2.title = 'Clear all steps on current track';
    clearBtn2.addEventListener('click', () =>
      emit('state:change', { path: 'action_clear', value: true })
    );
    actionsDiv.append(clearBtn2);

    // ── Lock button ───────────────────────────────────────────────────────────
    const lockBtn = document.createElement('button');
    lockBtn.className = 'seq-btn' + (state.patternLocked ? ' active' : '');
    lockBtn.textContent = state.patternLocked ? '🔒' : '🔓';
    lockBtn.style.cssText = 'font-size:0.7rem;padding:2px 5px';
    lockBtn.title = 'Lock/unlock pattern for morph source';
    lockBtn.addEventListener('click', () => {
      state.patternLocked = !state.patternLocked;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    actionsDiv.prepend(lockBtn);

    const fillBtn = document.createElement('button');
    fillBtn.className = 'seq-btn' + (state._fillActive ? ' active' : '');
    fillBtn.textContent = 'Fill';
    fillBtn.title = 'Fill pattern with active track steps (hold for options)';
    fillBtn.style.color = state._fillActive ? 'var(--live)' : '';
    fillBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_fill', value: true })
    );
    actionsDiv.prepend(fillBtn);

    // ── Randomize Fill button ─────────────────────────────────────────────────
    const randFillBtn = document.createElement('button');
    randFillBtn.className = 'seq-btn';
    randFillBtn.textContent = 'Rnd Fill';
    randFillBtn.title = 'Randomize step velocities';
    randFillBtn.style.cssText = state._fillActive
      ? 'color:var(--live);border-color:rgba(90,221,113,0.5)'
      : 'opacity:0.45';
    randFillBtn.addEventListener('click', () => {
      if (!state._fillActive) return; // no-op when fill is not active
      // Save snapshot of all tracks' steps before randomizing
      state._preFillSnapshot = pattern.kit.tracks.map(trk =>
        trk.steps.map(s => ({ ...s, paramLocks: { ...s.paramLocks } }))
      );
      // Randomize with 50% probability per active step slot
      pattern.kit.tracks.forEach(trk => {
        const len = trk.trackLength > 0 ? trk.trackLength : pattern.length;
        trk.steps.slice(0, len).forEach(s => {
          s.active = Math.random() < 0.5;
          s.accent = s.active && Math.random() < 0.25;
        });
      });
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    // Insert after fillBtn (fillBtn is prepended, so insert after it)
    fillBtn.insertAdjacentElement('afterend', randFillBtn);

    // ── Morph button ──────────────────────────────────────────────────────────
    const morphBtn = document.createElement('button');
    morphBtn.className = 'seq-btn';
    morphBtn.textContent = 'Morph';
    morphBtn.title = 'Morph between two stored patterns';
    morphBtn.addEventListener('click', () => {
      const targetPat = state.patternCompareB;
      if (!targetPat) { alert('Set Pattern B first (Banks page)'); return; }
      const src = pattern.kit.tracks;
      const dst = state.project.banks[targetPat.bank].patterns[targetPat.pattern].kit.tracks;
      src.forEach((trk, ti) => {
        const dstTrk = dst[ti];
        if (!dstTrk) return;
        trk.steps.forEach((step, si) => {
          if (Math.random() < 0.5) {
            step.active = dstTrk.steps[si]?.active ?? false;
            step.accent = dstTrk.steps[si]?.accent ?? false;
          }
        });
      });
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    actionsDiv.append(morphBtn);

    // ── Randomize density + genre + RND ALL ───────────────────────────────────
    const rndGroup = document.createElement('div');
    rndGroup.style.cssText = 'display:flex;align-items:center;gap:3px;flex-shrink:0';

    const density = state.randomizeDensity ?? 0.5;
    const densitySlider = document.createElement('input');
    densitySlider.type = 'range';
    densitySlider.min = '0';
    densitySlider.max = '1';
    densitySlider.step = '0.05';
    densitySlider.value = String(density);
    densitySlider.title = 'Randomize density (0=empty … 1=full)';
    densitySlider.style.cssText = 'width:44px;accent-color:var(--accent)';

    const densityLabel = document.createElement('span');
    densityLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);min-width:28px';
    densityLabel.textContent = Math.round(density * 100) + '%';

    densitySlider.addEventListener('input', () => {
      state.randomizeDensity = parseFloat(densitySlider.value);
      densityLabel.textContent = Math.round(state.randomizeDensity * 100) + '%';
    });

    const genreSelect = document.createElement('select');
    genreSelect.style.cssText = 'background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 3px;font-family:var(--font-mono);font-size:0.48rem';
    genreSelect.title = 'Genre preset for randomization';
    ['random', 'drums', 'house', 'techno', 'jazz', 'latin'].forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g.charAt(0).toUpperCase() + g.slice(1);
      if (g === (state.randomizeGenre ?? 'random')) opt.selected = true;
      genreSelect.append(opt);
    });
    genreSelect.addEventListener('change', () => {
      state.randomizeGenre = genreSelect.value;
    });

    const rndAllBtn = document.createElement('button');
    rndAllBtn.className = 'seq-btn';
    rndAllBtn.textContent = 'RND ALL';
    rndAllBtn.title = 'Randomize all tracks with current density';
    rndAllBtn.addEventListener('click', () => {
      emit('pattern:randomizeAll', {});
    });

    rndGroup.append(densitySlider, densityLabel, genreSelect, rndAllBtn);
    actionsDiv.append(rndGroup);

    // Selection count badge + Clear Sel button
    const selCount = state._selectedSteps?.size ?? 0;
    if (selCount > 0) {
      const selBadge = document.createElement('span');
      selBadge.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;color:var(--accent);padding:1px 5px;border-radius:3px;border:1px solid var(--accent);white-space:nowrap';
      selBadge.textContent = `Sel: ${selCount}`;
      actionsDiv.append(selBadge);

      const clearSelBtn = document.createElement('button');
      clearSelBtn.className = 'seq-btn';
      clearSelBtn.textContent = 'Clear Sel';
      clearSelBtn.addEventListener('click', () => {
        state._selectedSteps = new Set();
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });
      actionsDiv.append(clearSelBtn);

      const selTools = document.createElement('div');
      selTools.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap';

      const withSelectedSteps = (fn) => {
        const indices = [...(state._selectedSteps ?? [])].sort((a, b) => a - b);
        if (!indices.length) return;
        indices.forEach((si) => {
          const step = track.steps[si];
          if (step) fn(step, si);
        });
        rerenderPattern();
      };

      const copySelBtn = document.createElement('button');
      copySelBtn.className = 'seq-btn';
      copySelBtn.textContent = 'Copy Sel';
      copySelBtn.addEventListener('click', () => {
        state._stepClipboardMulti = [...(state._selectedSteps ?? [])]
          .sort((a, b) => a - b)
          .map((si) => cloneStepData(track.steps[si]));
        emit('toast', { msg: `Copied ${state._stepClipboardMulti.length} steps` });
      });

      const pasteSelBtn = document.createElement('button');
      pasteSelBtn.className = 'seq-btn';
      pasteSelBtn.textContent = 'Paste Sel';
      pasteSelBtn.disabled = !Array.isArray(state._stepClipboardMulti) || state._stepClipboardMulti.length === 0;
      pasteSelBtn.style.opacity = pasteSelBtn.disabled ? '0.45' : '1';
      pasteSelBtn.addEventListener('click', () => {
        if (!Array.isArray(state._stepClipboardMulti) || state._stepClipboardMulti.length === 0) return;
        const indices = [...(state._selectedSteps ?? [])].sort((a, b) => a - b);
        indices.forEach((si, idx) => {
          const source = state._stepClipboardMulti[idx % state._stepClipboardMulti.length];
          if (track.steps[si] && source) Object.assign(track.steps[si], cloneStepData(source));
        });
        rerenderPattern();
      });

      const clearLocksBtn = document.createElement('button');
      clearLocksBtn.className = 'seq-btn';
      clearLocksBtn.textContent = 'Clr Locks';
      clearLocksBtn.addEventListener('click', () => {
        withSelectedSteps((step) => { step.paramLocks = {}; });
      });

      const probSel = document.createElement('select');
      probSel.className = 'seq-btn';
      probSel.style.cssText = 'padding:2px 4px;font-family:var(--font-mono);font-size:0.52rem';
      [100, 90, 75, 50, 25, 10].forEach((pct) => {
        const opt = document.createElement('option');
        opt.value = String(pct / 100);
        opt.textContent = `P${pct}`;
        probSel.append(opt);
      });
      probSel.addEventListener('change', () => {
        const value = parseFloat(probSel.value);
        withSelectedSteps((step) => { step.probability = value; });
      });

      const velNudgeBtn = document.createElement('button');
      velNudgeBtn.className = 'seq-btn';
      velNudgeBtn.textContent = 'Vel +';
      velNudgeBtn.addEventListener('click', () => {
        withSelectedSteps((step) => {
          step.velocity = Math.min(1, (step.velocity ?? 1) + 0.1);
        });
      });

      const velDropBtn = document.createElement('button');
      velDropBtn.className = 'seq-btn';
      velDropBtn.textContent = 'Vel -';
      velDropBtn.addEventListener('click', () => {
        withSelectedSteps((step) => {
          step.velocity = Math.max(0.05, (step.velocity ?? 1) - 0.1);
        });
      });

      selTools.append(copySelBtn, pasteSelBtn, clearLocksBtn, probSel, velNudgeBtn, velDropBtn);
      actionsDiv.append(selTools);
    }

    // Quantize grid select + button
    const qSelect = document.createElement('select');
    qSelect.className = 'seq-btn';
    qSelect.style.cssText = 'padding:2px 4px;font-family:var(--font-mono);font-size:0.55rem';
    [{ label: 'Q:1/16', v: 1 }, { label: 'Q:1/8', v: 2 }, { label: 'Q:1/4', v: 4 }].forEach(({ label, v }) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = label;
      if (v === (state.quantizeGrid ?? 1)) opt.selected = true;
      qSelect.append(opt);
    });
    qSelect.addEventListener('change', () => { state.quantizeGrid = parseInt(qSelect.value); });

    const quantizeBtn = document.createElement('button');
    quantizeBtn.className = 'seq-btn';
    quantizeBtn.textContent = 'Quant';
    quantizeBtn.addEventListener('click', () => {
      const grid    = state.quantizeGrid ?? 1;
      const trackLen = track.trackLength || pattern.length;
      const newActive = new Set();
      track.steps.slice(0, trackLen).forEach((s, si) => {
        if (s.active) {
          const snapped = Math.round(si / grid) * grid % trackLen;
          newActive.add(snapped);
        }
      });
      track.steps.slice(0, trackLen).forEach((s, si) => { s.active = newActive.has(si); });
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    actionsDiv.append(qSelect, quantizeBtn);

    const humanizeDiv = document.createElement('div');
    humanizeDiv.style.cssText = 'display:flex;align-items:center;gap:3px';
    const humanizeAmtInit = state.humanizeAmount ?? 0.2;
    humanizeDiv.innerHTML = `
      <input type="range" min="0" max="1" step="0.1" value="${humanizeAmtInit}"
        title="Humanize amount" style="width:36px;accent-color:var(--accent)">
      <button class="seq-btn" title="Add human timing/velocity variations">Human</button>
      <span class="humanize-label" style="font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);min-width:40px">±${Math.round(humanizeAmtInit * 100)}%</span>
    `;
    const humanizeLabel = humanizeDiv.querySelector('.humanize-label');
    function humanizeDesc(v) {
      if (v === 0) return 'off';
      if (v <= 0.1) return 'subtle';
      if (v <= 0.3) return 'medium';
      return 'heavy';
    }
    humanizeLabel.textContent = `±${Math.round(humanizeAmtInit * 100)}% ${humanizeDesc(humanizeAmtInit)}`;
    humanizeDiv.querySelector('input').addEventListener('input', e => {
      state.humanizeAmount = parseFloat(e.target.value);
      humanizeLabel.textContent = `±${Math.round(state.humanizeAmount * 100)}% ${humanizeDesc(state.humanizeAmount)}`;
    });
    humanizeDiv.querySelector('button').addEventListener('click', () => {
      const amt = state.humanizeAmount ?? 0.2;
      const len = track.trackLength || pattern.length;
      track.steps.slice(0, len).forEach(s => {
        if (!s.active) return;
        s.microTime = (Math.random() - 0.5) * amt;
        s.velocity = Math.max(0.3, Math.min(1, (s.velocity ?? 1) + (Math.random() - 0.5) * 0.3));
      });
      humanizeLabel.textContent = `±${Math.round(amt * 100)}% ${humanizeDesc(amt)}`;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    actionsDiv.append(humanizeDiv);

    // ── Fill every-N-steps ────────────────────────────────────────────────────
    const fillRow = document.createElement('div');
    fillRow.style.cssText = 'display:flex;align-items:center;gap:4px';
    fillRow.innerHTML = `<span style="font-size:0.48rem;color:var(--muted);font-family:var(--font-mono)">FILL</span>`;

    [2, 3, 4, 8].forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'seq-btn';
      btn.textContent = `/${n}`;
      btn.title = `Activate every ${n} steps`;
      btn.addEventListener('click', () => {
        const bank = state.activeBank, pat = state.activePattern, ti = state.selectedTrackIndex;
        const currentTrack = state.project.banks[bank].patterns[pat].kit.tracks[ti];
        currentTrack.steps.forEach((s, i) => { s.active = (i % n === 0); });
        emit('state:change', { param: 'pattern' });
      });
      fillRow.append(btn);
    });

    actionsDiv.append(fillRow);

    // ── Swing visualizer ──────────────────────────────────────────────────────
    const swingViz = document.createElement('svg');
    swingViz.setAttribute('viewBox', '0 0 60 12');
    swingViz.style.cssText = 'width:60px;height:12px;flex-shrink:0';
    const swing = state.swing ?? 0;
    for (let i = 0; i < 8; i++) {
      const baseX = 4 + i * 7;
      const offset = (i % 2 === 1) ? swing * 20 : 0;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', baseX + offset);
      dot.setAttribute('cy', 6);
      dot.setAttribute('r', i % 2 === 0 ? 2.5 : 1.5);
      dot.setAttribute('fill', i % 2 === 0 ? 'var(--accent)' : 'var(--muted)');
      swingViz.append(dot);
    }
    const swingLabel = document.createElement('span');
    swingLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted)';
    swingLabel.textContent = `${Math.round(swing * 100)}%`;

    const swingDiv = document.createElement('div');
    swingDiv.style.cssText = 'display:flex;align-items:center;gap:3px;flex-shrink:0';
    swingDiv.append(swingViz, swingLabel);
    toolbar.append(swingDiv);

    toolbar.append(euclidDiv, actionsDiv);
    wrapper.append(toolbar);
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

  // Exposed so app.js can call it when handling pattern:randomize / pattern:randomizeAll
  _getGenreStepWeights: getGenreStepWeights,
};
