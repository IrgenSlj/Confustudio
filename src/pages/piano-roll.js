// src/pages/piano-roll.js — 2D note grid editor

import { TRACK_COLORS } from '../state.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_PCS  = new Set([1, 3, 6, 8, 10]); // pitch-class indices for black keys

const SCALES = [
  { name: 'Chromatic', intervals: null },
  { name: 'Major',     intervals: [0,2,4,5,7,9,11] },
  { name: 'Minor',     intervals: [0,2,3,5,7,8,10] },
  { name: 'Pent Maj',  intervals: [0,2,4,7,9] },
  { name: 'Pent Min',  intervals: [0,3,5,7,10] },
  { name: 'Dorian',    intervals: [0,2,3,5,7,9,10] },
  { name: 'Blues',     intervals: [0,3,5,6,7,10] },
];

// Build 24 rows: B4 (MIDI 71) down to C3 (MIDI 48)
function buildRows() {
  const rows = [];
  for (let midi = 71; midi >= 48; midi--) {
    const pc   = midi % 12;
    const oct  = Math.floor(midi / 12) - 1;
    const name = NOTE_NAMES[pc] + oct;
    rows.push({ midi, name, isBlack: BLACK_PCS.has(pc) });
  }
  return rows;
}

const ROWS = buildRows();

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const track   = pattern.kit.tracks[state.selectedTrackIndex];
    const steps   = pattern.length;

    const scaleIdx    = state.scale ?? 0;
    const currentScale = SCALES[Math.max(0, Math.min(SCALES.length - 1, scaleIdx))];
    const scaleSet    = currentScale.intervals ? new Set(currentScale.intervals) : null;

    // Build a set of active (midi, stepIndex) pairs from step notes
    const activeSet = new Set();
    track.steps.slice(0, steps).forEach((step, si) => {
      if (step.active) activeSet.add(`${step.note}_${si}`);
    });

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `
      <span class="page-title" style="margin:0">Piano Roll</span>
      <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">${track.name} &bull; ${steps} steps</span>
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">scroll/zoom via knobs</span>
    `;
    container.append(header);

    // Scale bar
    const scaleBar = document.createElement('div');
    scaleBar.className = 'roll-scale-bar';
    SCALES.forEach((scale, idx) => {
      const btn = document.createElement('button');
      btn.className = 'roll-scale-btn' + (idx === scaleIdx ? ' active' : '');
      btn.textContent = scale.name;
      btn.addEventListener('click', () => {
        emit('state:change', { path: 'scale', value: idx });
      });
      scaleBar.append(btn);
    });
    container.append(scaleBar);

    // Piano roll view
    const view = document.createElement('div');
    view.className = 'piano-roll-view';
    view.style.flex = '1';
    view.style.minHeight = '0';
    view.style.setProperty('--track-color', TRACK_COLORS[state.selectedTrackIndex]);

    // Left: note labels
    const keysCol = document.createElement('div');
    keysCol.className = 'roll-keys';
    keysCol.style.cssText = 'flex-shrink:0;width:36px;';

    // Right: note grid
    const gridCol = document.createElement('div');
    gridCol.className = 'roll-grid';
    gridCol.style.cssText = 'overflow:auto;flex:1';

    // Beat marker header row
    const beatHeader = document.createElement('div');
    beatHeader.style.cssText = 'display:flex;padding-left:36px;margin-bottom:2px;flex-shrink:0';
    for (let si = 0; si < steps; si++) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        flex: 1; text-align: center; font-family: var(--font-mono); font-size: 0.38rem;
        color: ${si % 4 === 0 ? 'var(--accent)' : 'transparent'};
        border-left: ${si % 4 === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none'};
      `;
      cell.textContent = si % 4 === 0 ? String(si + 1) : '';
      beatHeader.append(cell);
    }
    gridCol.prepend(beatHeader);

    // Drag-velocity state
    let dragCell      = null;
    let dragStep      = null;
    let dragStartY    = 0;
    let dragStartVel  = 1;
    let dragging      = false;

    function onWindowPointerMove(e) {
      if (!dragCell) return;
      const dy = dragStartY - e.clientY;
      if (!dragging && Math.abs(dy) > 5) dragging = true;
      if (!dragging) return;
      const newVel = Math.max(0.05, Math.min(1, dragStartVel + dy / 80));
      dragStep.velocity = newVel;
      dragCell.style.opacity = String(0.3 + newVel * 0.7);
      dragCell.title = `vel:${Math.round(newVel * 127)}`;
    }

    function onWindowPointerUp() {
      if (dragCell) {
        if (dragging) {
          emit('track:change', { param: 'steps', value: track.steps });
        }
        dragCell  = null;
        dragStep  = null;
        dragging  = false;
      }
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
    }

    ROWS.forEach(({ midi, name, isBlack }) => {
      const isMuted = scaleSet !== null && !scaleSet.has(midi % 12);

      // Key label
      const key = document.createElement('div');
      key.className = 'roll-key' + (isBlack ? ' black-key' : '');
      key.textContent = name;
      keysCol.append(key);

      // Grid row
      const row = document.createElement('div');
      row.className = 'roll-row' + (isBlack ? ' black-row' : '') + (isMuted ? ' roll-row-muted' : '');

      for (let si = 0; si < steps; si++) {
        const cell = document.createElement('div');
        cell.className = 'piano-cell' + (si % 4 === 0 ? ' beat-start' : '');
        cell.dataset.col = si;

        if (isMuted) {
          cell.style.pointerEvents = 'none';
          row.append(cell);
          continue;
        }

        if (activeSet.has(`${midi}_${si}`)) {
          cell.classList.add('active');
          const step = track.steps[si];
          const vel = step?.velocity ?? 1;
          cell.style.opacity = String(0.3 + vel * 0.7);
          cell.style.cursor = 'ns-resize';
          cell.title = `${name} vel:${Math.round(vel * 127)}`;
        }

        // Velocity drag on active cells
        cell.addEventListener('pointerdown', (e) => {
          if (!cell.classList.contains('active')) return;
          e.preventDefault();
          const step = track.steps[si];
          dragCell     = cell;
          dragStep     = step;
          dragStartY   = e.clientY;
          dragStartVel = step.velocity ?? 1;
          dragging     = false;
          window.addEventListener('pointermove', onWindowPointerMove);
          window.addEventListener('pointerup', onWindowPointerUp);
        });

        cell.addEventListener('click', (e) => {
          // Suppress click if we just finished a drag
          if (dragging) return;

          const step = track.steps[si];
          const alreadyThisNote = step.active && (step.paramLocks?.note === midi || (step.note === midi && !step.paramLocks?.note));
          if (alreadyThisNote) {
            // Toggle off
            emit('step:toggle', { stepIndex: si, shiftKey: false });
            cell.classList.remove('active');
            cell.style.cursor = '';
            activeSet.delete(`${midi}_${si}`);
          } else {
            // Activate and set note
            if (!step.active) {
              emit('step:toggle', { stepIndex: si, shiftKey: false });
            }
            emit('step:plock', { stepIndex: si, param: 'note', value: midi });
            cell.classList.add('active');
            cell.style.cursor = 'ns-resize';
            activeSet.add(`${midi}_${si}`);
          }
        });

        row.append(cell);
      }

      gridCol.append(row);
    });

    view.append(keysCol, gridCol);
    container.append(view);
  },

  knobMap: [
    { label: 'Zoom',     param: 'rollZoom',     min: 0.5, max: 4,   step: 0.1 },
    { label: 'Scroll',   param: 'rollScroll',   min: 0,   max: 1,   step: 0.01 },
    { label: 'Gate',     param: 'noteLength',   min: 0.01,max: 1,   step: 0.01 },
    { label: 'Velocity', param: 'velocity',     min: 0,   max: 1,   step: 0.01 },
    { label: 'Oct',      param: 'octaveShift',  min: -4,  max: 4,   step: 1 },
    { label: 'Scale',    param: 'scaleMode',    min: 0,   max: 7,   step: 1 },
    { label: 'Quantize', param: 'quantize',     min: 0,   max: 4,   step: 1 },
    { label: '—',        param: null,           min: 0,   max: 1,   step: 1 },
  ],

  keyboardContext: 'piano-roll',
};
