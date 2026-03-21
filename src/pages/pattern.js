// src/pages/pattern.js — Multi-track step sequencer with euclidean + p-lock

import { TRACK_COLORS } from '../state.js';

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
      randBtn.title = 'Randomize steps';
      randBtn.textContent = '⚄';
      randBtn.addEventListener('click', e => {
        e.stopPropagation();
        const len = trk.trackLength > 0 ? trk.trackLength : pattern.length;
        trk.steps.slice(0, len).forEach(s => {
          s.active = Math.random() < 0.35;
          s.accent = s.active && Math.random() < 0.2;
        });
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats }); // trigger save+render
      });
      labelWrap.append(randBtn);

      const cloneBtn = document.createElement('button');
      cloneBtn.className = 'mtg-rand-btn';
      cloneBtn.title = 'Clone track to next';
      cloneBtn.textContent = '⧉';
      cloneBtn.addEventListener('click', e => {
        e.stopPropagation();
        const nextTi = (ti + 1) % 8;
        pattern.kit.tracks[nextTi].steps = JSON.parse(JSON.stringify(trk.steps));
        ['machine','waveform','attack','decay','cutoff','resonance','drive','volume','pan','pitch','filterType'].forEach(key => {
          if (trk[key] !== undefined) pattern.kit.tracks[nextTi][key] = trk[key];
        });
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });
      labelWrap.append(cloneBtn);

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
        if (step.mute)                            btn.classList.add('step-muted');
        if (step.trigCondition === 'fill')        btn.classList.add('trig-fill');
        if (state._selectedSteps?.has(si) && ti === selTi) btn.classList.add('step-selected');
        if (Math.abs(step.microTime ?? 0) > 0.05) btn.style.borderTop = '2px solid var(--live)';
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
        // Trig condition badge
        if (step.trigCondition && step.trigCondition !== 'always') {
          btn.classList.add('has-trig');
          btn.dataset.trig = step.trigCondition;
          const trigSpan = document.createElement('span');
          trigSpan.className = 'step-trig';
          const abbrev = { fill: 'F', first: '1', not_first: '¬1', '1:2': '½' };
          trigSpan.textContent = abbrev[step.trigCondition] ?? step.trigCondition.slice(0, 2);
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

          const CONDITIONS = ['always', 'fill', 'not_fill', 'first', 'not_first', '1:2', '2:2'];
          CONDITIONS.forEach(cond => {
            const item = document.createElement('div');
            item.className = 'ctx-item' + ((step.trigCondition ?? 'always') === cond ? ' active' : '');
            item.textContent = cond;
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
    humanizeDiv.innerHTML = `
      <input type="range" min="0" max="1" step="0.1" value="${state.humanizeAmount ?? 0.2}"
        title="Humanize amount" style="width:36px;accent-color:var(--accent)">
      <button class="seq-btn" title="Add human timing/velocity variations">Human</button>
    `;
    humanizeDiv.querySelector('input').addEventListener('input', e => { state.humanizeAmount = parseFloat(e.target.value); });
    humanizeDiv.querySelector('button').addEventListener('click', () => {
      const amt = state.humanizeAmount ?? 0.2;
      const len = track.trackLength || pattern.length;
      track.steps.slice(0, len).forEach(s => {
        if (!s.active) return;
        s.microTime = (Math.random() - 0.5) * amt;
        s.velocity = Math.max(0.3, Math.min(1, (s.velocity ?? 1) + (Math.random() - 0.5) * 0.3));
      });
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
};
