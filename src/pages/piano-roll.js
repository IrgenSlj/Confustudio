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

const TOTAL_NOTE_MIN = 24;  // C1
const TOTAL_NOTE_MAX = 96;  // C7
const TOTAL_RANGE    = TOTAL_NOTE_MAX - TOTAL_NOTE_MIN + 1; // 73, but we use 72 steps
const VISIBLE_ROWS   = 24;

// Build rows dynamically for a given MIDI range [noteMin, noteMax] (inclusive, top-down)
function buildRows(noteMax, noteMin) {
  const rows = [];
  for (let midi = noteMax; midi >= noteMin; midi--) {
    const pc   = midi % 12;
    const oct  = Math.floor(midi / 12) - 1;
    const name = NOTE_NAMES[pc] + oct;
    rows.push({ midi, name, isBlack: BLACK_PCS.has(pc) });
  }
  return rows;
}

const ZOOM_WIDTHS = [12, 18, 24, 32, 48];

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const track   = pattern.kit.tracks[state.selectedTrackIndex];
    const steps   = pattern.length;

    const scaleIdx    = state.scale ?? 0;
    const currentScale = SCALES[Math.max(0, Math.min(SCALES.length - 1, scaleIdx))];
    const scaleSet    = currentScale.intervals ? new Set(currentScale.intervals) : null;

    // Zoom: cell width
    const zoomIdx = Math.round(Math.max(0, Math.min(4, state.rollZoom ?? 1)));
    const cellW   = ZOOM_WIDTHS[zoomIdx];

    // Scroll: determine visible note window
    const scrollRaw  = state.rollScroll ?? 0.5;
    const scrollNote = Math.round((1 - scrollRaw) * (72 - VISIBLE_ROWS));
    let   noteMax    = 96 - scrollNote;
    let   noteMin    = noteMax - VISIBLE_ROWS + 1;
    // clamp
    if (noteMin < TOTAL_NOTE_MIN) { noteMin = TOTAL_NOTE_MIN; noteMax = noteMin + VISIBLE_ROWS - 1; }
    if (noteMax > TOTAL_NOTE_MAX) { noteMax = TOTAL_NOTE_MAX; noteMin = noteMax - VISIBLE_ROWS + 1; }

    // Scroll to show first active note if it is outside the current window
    const patLen = steps;
    const firstNote = track.steps.slice(0, patLen).find(s => s.active && s.paramLocks?.note != null)?.paramLocks?.note;
    if (firstNote != null && (firstNote < noteMin || firstNote > noteMax)) {
      let newScroll = 1 - (96 - firstNote - VISIBLE_ROWS / 2) / (72 - VISIBLE_ROWS);
      newScroll = Math.max(0, Math.min(1, newScroll));
      state.rollScroll = newScroll;
      // Recompute window with updated scroll
      const sn2 = Math.round((1 - state.rollScroll) * (72 - VISIBLE_ROWS));
      noteMax = 96 - sn2;
      noteMin = noteMax - VISIBLE_ROWS + 1;
      if (noteMin < TOTAL_NOTE_MIN) { noteMin = TOTAL_NOTE_MIN; noteMax = noteMin + VISIBLE_ROWS - 1; }
      if (noteMax > TOTAL_NOTE_MAX) { noteMax = TOTAL_NOTE_MAX; noteMin = noteMax - VISIBLE_ROWS + 1; }
    }

    const ROWS = buildRows(noteMax, noteMin);

    // Build a set of active (midi, stepIndex) pairs from step notes
    const activeSet = new Set();
    track.steps.slice(0, steps).forEach((step, si) => {
      if (step.active) activeSet.add(`${step.note}_${si}`);
    });

    // Ensure rollSelected is initialised on state
    if (!state.rollSelected) state.rollSelected = new Set();

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

    // Right: scroll container + inner grid view
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'roll-scroll-container';

    const gridView = document.createElement('div');
    gridView.className = 'roll-view';

    const gridCol = document.createElement('div');
    gridCol.className = 'roll-grid';

    // Beat marker header row
    const beatHeader = document.createElement('div');
    beatHeader.style.cssText = 'display:flex;padding-left:0;margin-bottom:2px;flex-shrink:0';
    for (let si = 0; si < steps; si++) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        width: ${cellW}px; min-width: ${cellW}px; flex-shrink: 0;
        text-align: center; font-family: var(--font-mono); font-size: 0.38rem;
        color: ${si % 4 === 0 ? 'var(--accent)' : 'transparent'};
        border-left: ${si % 4 === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none'};
      `;
      cell.textContent = si % 4 === 0 ? String(si + 1) : '';
      beatHeader.append(cell);
    }
    gridView.append(beatHeader);

    // Flat array of all grid cells for playhead animation
    const allCells = [];

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
      const isRoot = name.startsWith('C') && !name.includes('#');
      key.className = 'roll-key' + (isBlack ? ' black-key' : '') + (isRoot ? ' roll-key-root' : '');
      key.textContent = name;
      keysCol.append(key);

      // Grid row
      const row = document.createElement('div');
      row.className = 'roll-row' + (isBlack ? ' black-row' : '') + (isMuted ? ' roll-row-muted' : '');

      for (let si = 0; si < steps; si++) {
        const cell = document.createElement('div');
        cell.className = 'piano-cell' + (si % 4 === 0 ? ' beat-start' : '');
        cell.dataset.col = si;
        cell.style.width    = cellW + 'px';
        cell.style.minWidth = cellW + 'px';

        if (isMuted) {
          cell.style.pointerEvents = 'none';
          row.append(cell);
          continue;
        }

        allCells.push(cell);

        if (state.rollSelected.has(`${midi}_${si}`)) {
          cell.classList.add('piano-cell-selected');
        }

        if (activeSet.has(`${midi}_${si}`)) {
          cell.classList.add('active');
          const step = track.steps[si];
          const vel = step?.velocity ?? 1;
          cell.style.opacity = String(0.3 + vel * 0.7);
          cell.style.cursor = 'ns-resize';
          const gate = step?.gate ?? 0.5;
          cell.title = `${name} vel:${Math.round(vel * 127)} gate:${Math.round(gate * 100)}%`;
          if (gate >= 0.75) cell.classList.add('gate-long');
          else if (gate <= 0.25) cell.classList.add('gate-short');

          // Note name label (only at zoom levels where cellW >= 24)
          if (cellW >= 24) {
            const label = document.createElement('span');
            label.className = 'piano-cell-label';
            label.textContent = name;
            cell.append(label);
          }

          // Resize handle for gate length
          const handle = document.createElement('div');
          handle.className = 'note-resize-handle';

          handle.addEventListener('pointerdown', ev => {
            ev.stopPropagation();
            ev.preventDefault();
            handle.setPointerCapture(ev.pointerId);
            const startX = ev.clientX;
            const startGate = track.steps[si].gate ?? 0.5;

            function onMove(emv) {
              const deltaX = emv.clientX - startX;
              const deltaGate = deltaX / cellW;
              const newGate = Math.max(0.05, Math.min(1, startGate + deltaGate));
              track.steps[si].gate = newGate;
              cell.classList.remove('gate-long', 'gate-short');
              if (newGate >= 0.75) cell.classList.add('gate-long');
              else if (newGate <= 0.25) cell.classList.add('gate-short');
              cell.title = `${name} vel:${Math.round((track.steps[si].velocity ?? 1) * 127)} gate:${Math.round(newGate * 100)}%`;
            }

            function onUp() {
              handle.removeEventListener('pointermove', onMove);
              emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
            }

            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp, { once: true });
          });

          cell.append(handle);
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

          const key = `${midi}_${si}`;
          const step = track.steps[si];
          const alreadyThisNote = step.active && (step.paramLocks?.note === midi || (step.note === midi && !step.paramLocks?.note));

          if (e.shiftKey) {
            // Shift+click: toggle in selection without deselecting others
            if (state.rollSelected.has(key)) {
              state.rollSelected.delete(key);
              cell.classList.remove('piano-cell-selected');
            } else if (alreadyThisNote) {
              state.rollSelected.add(key);
              cell.classList.add('piano-cell-selected');
            }
            return;
          }

          // Regular click: clear selection unless clicking an already-selected note
          if (!state.rollSelected.has(key)) {
            state.rollSelected.clear();
            // Remove selected class from all cells in the grid
            gridCol.querySelectorAll('.piano-cell-selected').forEach(c => c.classList.remove('piano-cell-selected'));
          }

          if (alreadyThisNote) {
            // Toggle off — also remove from selection
            state.rollSelected.delete(key);
            emit('step:toggle', { stepIndex: si, shiftKey: false });
            cell.classList.remove('active', 'piano-cell-selected');
            cell.style.cursor = '';
            activeSet.delete(key);
          } else {
            // Activate and set note
            if (!step.active) {
              emit('step:toggle', { stepIndex: si, shiftKey: false });
            }
            emit('step:plock', { stepIndex: si, param: 'note', value: midi });
            cell.classList.add('active');
            cell.style.cursor = 'ns-resize';
            activeSet.add(key);
          }
        });

        row.append(cell);
      }

      gridCol.append(row);
    });

    gridView.append(gridCol);
    scrollContainer.append(gridView);
    view.append(keysCol, scrollContainer);
    container.append(view);

    // Animated playhead: highlight current step column
    let rafId = null;
    let lastHighlightedCol = -1;
    function animatePlayhead() {
      if (!container.isConnected) {
        if (rafId !== null) cancelAnimationFrame(rafId);
        return;
      }
      const stepIdx = state.currentStep;
      if (stepIdx !== lastHighlightedCol) {
        for (let i = 0; i < allCells.length; i++) {
          const c = allCells[i];
          const col = Number(c.dataset.col);
          if (col === stepIdx) {
            c.classList.add('piano-cell-playing');
          } else if (col === lastHighlightedCol) {
            c.classList.remove('piano-cell-playing');
          }
        }
        lastHighlightedCol = stepIdx;
      }
      rafId = requestAnimationFrame(animatePlayhead);
    }
    rafId = requestAnimationFrame(animatePlayhead);

    // Velocity lane
    const velLane = document.createElement('div');
    velLane.className = 'roll-vel-lane';
    velLane.style.cssText = 'display:flex;height:32px;flex-shrink:0;border-top:1px solid #2a2a2a;overflow-x:hidden;position:relative;';

    track.steps.slice(0, patLen).forEach((step, si) => {
      const bar = document.createElement('div');
      bar.className = 'vel-bar';
      const vel = step.velocity ?? 1;
      bar.style.cssText = `
        width: ${cellW}px; min-width: ${cellW}px; flex-shrink: 0;
        height: ${Math.round(vel * 100)}%; align-self: flex-end;
        background: ${step.active ? 'var(--track-color, var(--accent))' : '#333'};
        cursor: ns-resize; border-right: 1px solid #1a1a1a;
        box-sizing: border-box;
      `;

      if (step.active) {
        let dragStartY, dragStartVel;
        bar.addEventListener('pointerdown', e => {
          e.preventDefault();
          bar.setPointerCapture(e.pointerId);
          dragStartY = e.clientY;
          dragStartVel = step.velocity ?? 1;

          function onMove(emv) {
            const v = Math.max(0.05, Math.min(1, dragStartVel + (dragStartY - emv.clientY) / 40));
            step.velocity = v;
            bar.style.height = Math.round(v * 100) + '%';
          }

          function onUp() {
            bar.removeEventListener('pointermove', onMove);
            emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
          }

          bar.addEventListener('pointermove', onMove);
          bar.addEventListener('pointerup', onUp, { once: true });
        });
      }

      velLane.append(bar);
    });

    container.append(velLane);
  },

  knobMap: [
    { label: 'Zoom',     param: 'rollZoom',     min: 0,   max: 4,   step: 1   },
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
