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
        const vel = step.velocity ?? 1;
        if (vel < 1) btn.style.opacity = String(0.45 + vel * 0.55);
        btn.textContent  = (si % 4 === 0) ? String(si + 1) : '';
        btn.dataset.prob = String(step.probability);
        btn.dataset.step = si;
        btn.dataset.track = ti;
        btn.title = `Step ${si+1} | vel:${Math.round(vel*100)}% | prob:${Math.round((step.probability??1)*100)}%`;
        if (step.probability < 1.0) {
          btn.classList.add('has-prob');
          btn.style.setProperty('--prob', step.probability);
        }
        // Velocity indicator
        if (step.active && vel < 0.95) {
          const velSpan = document.createElement('span');
          velSpan.className = 'step-vel';
          velSpan.textContent = String(Math.round(vel * 100));
          btn.append(velSpan);
        }
        // Note lock label
        if (step.paramLocks?.note != null) {
          const noteSpan = document.createElement('span');
          noteSpan.className = 'step-note-label';
          noteSpan.textContent = midiToNoteName(step.paramLocks.note);
          btn.append(noteSpan);
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
          btn.dataset.trig = step.trigCondition;
          const trigSpan = document.createElement('span');
          trigSpan.className = 'step-trig';
          const abbrev = {
            '1st':      '1st',
            'not1st':   'n1',
            'every2':   '÷2',
            'every3':   '÷3',
            'every4':   '÷4',
            'random':   'rnd',
            'fill':     'F',
            'not_fill': '¬F',
            'first':    '1',
            'not_first':'¬1',
            '1:2':      '½',
          };
          trigSpan.textContent = abbrev[step.trigCondition] ?? step.trigCondition.slice(0, 3);
          btn.append(trigSpan);
        }
        if (si > 0 && si % 4 === 0) btn.classList.add('step-group-start');

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
          menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:500;
            background:#1a1e14;border:1px solid #3a4a2a;border-radius:4px;padding:4px;
            font-family:var(--font-mono);font-size:0.55rem;min-width:110px`;

          // Probability section
          const probLabel = document.createElement('div');
          probLabel.style.cssText = 'color:var(--muted);padding:2px 4px;font-size:0.48rem';
          probLabel.textContent = 'PROBABILITY';
          menu.append(probLabel);

          [1, 0.75, 0.5, 0.25].forEach(prob => {
            const item = document.createElement('div');
            item.className = 'ctx-item' + (Math.abs((step.probability ?? 1) - prob) < 0.01 ? ' active' : '');
            item.textContent = prob === 1 ? '100% (always)' : `${prob * 100}%`;
            item.addEventListener('click', () => {
              step.probability = prob;
              emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
              menu.remove();
            });
            menu.append(item);
          });

          // Divider
          const divider = document.createElement('div');
          divider.style.cssText = 'border-top:1px solid #2a3a2a;margin:3px 0';
          menu.append(divider);

          // TrigCondition section
          const trigLabel = document.createElement('div');
          trigLabel.style.cssText = 'color:var(--muted);padding:2px 4px;font-size:0.48rem';
          trigLabel.textContent = 'TRIG CONDITION';
          menu.append(trigLabel);

          const CONDITIONS = [
            { value: 'always',  label: 'always' },
            { value: '1st',     label: '1st (1st loop only)' },
            { value: 'not1st',  label: 'not1st (skip 1st)' },
            { value: 'every2',  label: 'every2 (÷2)' },
            { value: 'every3',  label: 'every3 (÷3)' },
            { value: 'every4',  label: 'every4 (÷4)' },
            { value: 'random',  label: 'random' },
            { value: 'fill',    label: 'fill' },
            { value: 'not_fill',label: 'not_fill' },
          ];
          CONDITIONS.forEach(({ value: cond, label }) => {
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

          document.body.append(menu);
          // Close on outside click
          setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
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
          btn.style.opacity = String(0.45 + newVel * 0.55);
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

      const activeCount = trk.steps.slice(0, pattern.length).filter(s => s.active).length;
      const countBadge = document.createElement('span');
      countBadge.className = 'mtg-count';
      countBadge.textContent = activeCount > 0 ? String(activeCount) : '';
      row.append(countBadge);

      multiGrid.append(row);
    });

    wrapper.append(multiGrid);

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

    // ── Probability mode indicator ────────────────────────────────────────────
    const probIndicator = document.createElement('span');
    probIndicator.className = 'prob-mode-indicator';
    const trackHasProb = track.steps.some(s => (s.prob ?? s.probability ?? 1) < 1);
    if (trackHasProb) probIndicator.classList.add('active');
    probIndicator.textContent = 'P%';
    probIndicator.title = trackHasProb
      ? 'This track has steps with probability < 100%'
      : 'No probability locks on this track';
    toolbar.prepend(probIndicator);

    const euclidDiv = document.createElement('div');
    euclidDiv.className = 'seq-euclid';
    const euclidStepDefault = track.trackLength || pattern.length;
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
    const trackLen = track.trackLength > 0 ? track.trackLength : pattern.length;
    const currentActiveSteps = track.steps.slice(0, trackLen).map(s => s.active);

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

    // ── Lock button ───────────────────────────────────────────────────────────
    const lockBtn = document.createElement('button');
    lockBtn.className = 'seq-btn' + (state.patternLocked ? ' active' : '');
    lockBtn.textContent = state.patternLocked ? '🔒' : '🔓';
    lockBtn.style.cssText = 'font-size:0.7rem;padding:2px 5px';
    lockBtn.title = 'Lock pattern (prevent accidental edits)';
    lockBtn.addEventListener('click', () => {
      state.patternLocked = !state.patternLocked;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    actionsDiv.prepend(lockBtn);

    const fillBtn = document.createElement('button');
    fillBtn.className = 'seq-btn' + (state._fillActive ? ' active' : '');
    fillBtn.textContent = 'Fill';
    fillBtn.style.color = state._fillActive ? 'var(--live)' : '';
    fillBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_fill', value: true })
    );
    actionsDiv.prepend(fillBtn);

    // ── Randomize Fill button ─────────────────────────────────────────────────
    const randFillBtn = document.createElement('button');
    randFillBtn.className = 'seq-btn';
    randFillBtn.textContent = 'Rnd Fill';
    randFillBtn.title = 'Randomize all tracks (50% per step) during fill — restores on fill off';
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
    morphBtn.title = 'Morph toward pattern B';
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
    rndAllBtn.title = 'Randomize all 8 tracks with current density + genre';
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
    humanizeDiv.querySelector('input').addEventListener('input', e => {
      state.humanizeAmount = parseFloat(e.target.value);
      humanizeLabel.textContent = `±${Math.round(state.humanizeAmount * 100)}%`;
    });
    humanizeDiv.querySelector('button').addEventListener('click', () => {
      const amt = state.humanizeAmount ?? 0.2;
      const len = track.trackLength || pattern.length;
      track.steps.slice(0, len).forEach(s => {
        if (!s.active) return;
        s.microTime = (Math.random() - 0.5) * amt;
        s.velocity = Math.max(0.3, Math.min(1, (s.velocity ?? 1) + (Math.random() - 0.5) * 0.3));
      });
      humanizeLabel.textContent = `±${Math.round(amt * 100)}%`;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    actionsDiv.append(humanizeDiv);

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

  // Exposed so app.js can call it when handling pattern:randomize / pattern:randomizeAll
  _getGenreStepWeights: getGenreStepWeights,
};
