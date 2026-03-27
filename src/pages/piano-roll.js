// src/pages/piano-roll.js — 2D note grid editor

import { TRACK_COLORS } from '../state.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_PCS  = new Set([1, 3, 6, 8, 10]); // pitch-class indices for black keys

const SCALE_INTERVALS = {
  major:      [0,2,4,5,7,9,11],
  minor:      [0,2,3,5,7,8,10],
  pentatonic: [0,2,4,7,9],
  dorian:     [0,2,3,5,7,9,10],
  mixolydian: [0,2,4,5,7,9,10],
};
function isNoteInScale(midi, root, scale) {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  return intervals.includes((midi - root + 120) % 12);
}

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

function gateToName(g) {
  if (g <= 0.15) return '32nd';
  if (g <= 0.3)  return '16th';
  if (g <= 0.55) return '8th';
  if (g <= 0.8)  return 'dotted 8th';
  return 'quarter';
}

const ZOOM_WIDTHS = [12, 18, 24, 32, 48];

export default {
  render(container, state, emit) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;padding:0';

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
      if (step.active) {
        const note = step.paramLocks?.note ?? step.note;
        activeSet.add(`${note}_${si}`);
      }
    });

    // Ensure rollSelected is initialised on state
    if (!state.rollSelected) state.rollSelected = new Set();

    // Loop region defaults
    if (state.rollLoopStart == null) state.rollLoopStart = 0;
    if (state.rollLoopEnd   == null) state.rollLoopEnd   = 16;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `
      <span class="page-title" style="margin:0">Piano Roll</span>
      <span style="font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">${track.name} &bull; ${steps} steps</span>
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">scroll/zoom via knobs</span>
    `;
    container.append(header);

    // Toolbar (single compact row — includes scale selectors)
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:3px;padding:3px 6px;flex-shrink:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;background:rgba(0,0,0,0.15);border-bottom:1px solid rgba(255,255,255,0.06)';

    // Draw mode toggle
    const drawBtn = document.createElement('button');
    drawBtn.className = 'pr-toolbar-btn' + (state.prDrawMode ? ' active' : '');
    drawBtn.textContent = '✎';
    drawBtn.title = 'Draw mode: click empty space to create notes';
    drawBtn.addEventListener('click', () => {
      state.prDrawMode = !state.prDrawMode;
      drawBtn.classList.toggle('active', state.prDrawMode);
    });
    toolbar.append(drawBtn);

    // Quantize selected (or all) notes to beat grid
    const quantizeBtn = document.createElement('button');
    quantizeBtn.className = 'pr-toolbar-btn';
    quantizeBtn.textContent = 'QNT';
    quantizeBtn.title = 'Quantize selected notes to beat grid (every 4 steps)';
    quantizeBtn.addEventListener('click', () => {
      // Determine which steps to quantize
      const hasSelection = state.rollSelected.size > 0;
      const gridSize = 4; // steps per beat
      let changed = false;
      for (let si = 0; si < steps; si++) {
        const step = track.steps[si];
        if (!step.active) continue;
        const midi = step.paramLocks?.note ?? step.note;
        if (hasSelection && !state.rollSelected.has(`${midi}_${si}`)) continue;
        // Snap step index to nearest multiple of gridSize
        const snappedSi = Math.round(si / gridSize) * gridSize;
        const clampedSi = Math.max(0, Math.min(steps - 1, snappedSi));
        if (clampedSi !== si) {
          // Move note: deactivate source, activate destination
          const dest = track.steps[clampedSi];
          // Copy note data to destination
          dest.active = true;
          dest.note = step.note;
          dest.velocity = step.velocity ?? 1;
          dest.gate = step.gate ?? 0.5;
          if (step.paramLocks?.note != null) {
            dest.paramLocks = dest.paramLocks ?? {};
            dest.paramLocks.note = step.paramLocks.note;
          }
          // Clear source
          step.active = false;
          changed = true;
        }
      }
      if (changed) {
        emit('track:change', { param: 'steps', value: track.steps });
        // Re-render the page
        emit('state:change', { path: 'rollScroll', value: state.rollScroll });
      }
    });
    toolbar.append(quantizeBtn);

    // Note length selector
    const noteLenLabel = document.createElement('span');
    noteLenLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted)';
    noteLenLabel.textContent = 'LEN:';
    toolbar.append(noteLenLabel);

    [{ label:'1/4', val:0.25 }, { label:'1/8', val:0.125 }, { label:'1/16', val:0.0625 }, { label:'1/32', val:0.03125 }].forEach(({label, val}) => {
      const btn = document.createElement('button');
      btn.className = 'pr-toolbar-btn' + ((state.prNoteLen ?? 0.0625) === val ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.prNoteLen = val;
        toolbar.querySelectorAll('.pr-toolbar-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      toolbar.append(btn);
    });

    // Scale highlight toggle
    const scaleToggle = document.createElement('button');
    scaleToggle.className = 'pr-toolbar-btn' + (state.prShowScale ? ' active' : '');
    scaleToggle.textContent = 'SCL';
    scaleToggle.title = 'Highlight scale notes';
    scaleToggle.addEventListener('click', () => {
      state.prShowScale = !state.prShowScale;
      scaleToggle.classList.toggle('active', state.prShowScale);
      emit('state:change', { path: 'rollScroll', value: state.rollScroll });
    });
    toolbar.append(scaleToggle);

    // Scale selector buttons (same row, separated by a thin divider)
    const scaleDivider = document.createElement('span');
    scaleDivider.style.cssText = 'width:1px;height:12px;background:rgba(255,255,255,0.12);flex-shrink:0;margin:0 2px';
    toolbar.append(scaleDivider);

    SCALES.forEach((scale, idx) => {
      const btn = document.createElement('button');
      btn.className = 'roll-scale-btn' + (idx === scaleIdx ? ' active' : '');
      btn.textContent = scale.name;
      btn.addEventListener('click', () => {
        emit('state:change', { path: 'scale', value: idx });
      });
      toolbar.append(btn);
    });

    container.append(toolbar);

    // Piano roll view
    const view = document.createElement('div');
    view.className = 'piano-roll-view';
    view.style.cssText = 'flex:1;min-height:0;overflow:auto;display:flex';
    view.style.setProperty('--track-color', TRACK_COLORS[state.selectedTrackIndex]);

    // Left: note labels
    const keysCol = document.createElement('div');
    keysCol.className = 'roll-keys';
    keysCol.style.cssText = 'flex-shrink:0;width:28px;max-width:28px;';

    // Right: scroll container + inner grid view
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'roll-scroll-container';

    const gridView = document.createElement('div');
    gridView.className = 'roll-view';

    const gridCol = document.createElement('div');
    gridCol.className = 'roll-grid';

    // Beat marker header row
    const beatHeaderWrap = document.createElement('div');
    beatHeaderWrap.style.cssText = 'position:relative;margin-bottom:2px;flex-shrink:0';

    const beatHeader = document.createElement('div');
    beatHeader.style.cssText = 'display:flex;padding-left:0';
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
    beatHeaderWrap.append(beatHeader);

    // Loop region overlay: semi-transparent green between loop start and end
    const loopStart = Math.max(0, Math.min(steps - 1, state.rollLoopStart));
    const loopEnd   = Math.max(loopStart + 1, Math.min(steps, state.rollLoopEnd));
    const loopRegion = document.createElement('div');
    loopRegion.style.cssText = `
      position:absolute; top:0; bottom:0; pointer-events:none;
      left:${loopStart * cellW}px; width:${(loopEnd - loopStart) * cellW}px;
      background:rgba(0,200,80,0.12); border-left:2px solid #00c850; border-right:2px solid #ff8c00;
    `;
    beatHeaderWrap.append(loopRegion);

    // Loop start marker (green vertical line + triangle)
    const loopStartMarker = document.createElement('div');
    loopStartMarker.style.cssText = `
      position:absolute; top:0; bottom:0; left:${loopStart * cellW}px;
      width:2px; background:#00c850; pointer-events:none; z-index:2;
    `;
    const loopStartTriangle = document.createElement('div');
    loopStartTriangle.style.cssText = `
      position:absolute; top:0; left:0;
      width:0; height:0;
      border-top:6px solid #00c850;
      border-right:6px solid transparent;
    `;
    loopStartMarker.append(loopStartTriangle);
    beatHeaderWrap.append(loopStartMarker);

    // Loop end marker (orange vertical line + triangle)
    const loopEndMarker = document.createElement('div');
    loopEndMarker.style.cssText = `
      position:absolute; top:0; bottom:0; left:${loopEnd * cellW}px;
      width:2px; background:#ff8c00; pointer-events:none; z-index:2;
    `;
    const loopEndTriangle = document.createElement('div');
    loopEndTriangle.style.cssText = `
      position:absolute; top:0; right:0;
      width:0; height:0;
      border-top:6px solid #ff8c00;
      border-left:6px solid transparent;
    `;
    loopEndMarker.append(loopEndTriangle);
    beatHeaderWrap.append(loopEndMarker);

    gridView.append(beatHeaderWrap);

    // Flat array of all grid cells for playhead animation
    const allCells = [];

    // Drag-velocity state
    let dragCell      = null;
    let dragStep      = null;
    let dragStartY    = 0;
    let dragStartVel  = 1;
    let dragging      = false;

    // Drag-to-draw state
    state._rollDragging  = false;
    state._rollDrawNote  = null;

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
      // End draw-drag
      if (state._rollDragging) {
        state._rollDragging = false;
        state._rollDrawNote = null;
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
      // Style: C notes in accent/white, black-key note names dimmed
      if (isRoot) {
        key.style.color = 'var(--accent, #f0c640)';
        key.style.fontWeight = 'bold';
      } else if (isBlack) {
        key.style.color = '#555';
      }
      key.style.textAlign = 'right';
      key.style.maxWidth = '28px';
      keysCol.append(key);

      // Grid row
      const row = document.createElement('div');
      row.className = 'roll-row' + (isBlack ? ' black-row' : '') + (isMuted ? ' roll-row-muted' : '');
      const inScale = state.prShowScale && isNoteInScale(midi, state.rootNote ?? 0, state.scale ?? 'major');
      row.style.background = inScale ? 'rgba(255,255,255,0.04)' : '';

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
          cell.style.opacity = String(0.5 + vel * 0.5);
          cell.style.cursor = 'ns-resize';
          const gate = step?.gate ?? 0.5;
          cell.title = `${name} vel:${Math.round(vel * 127)} gate:${Math.round(gate * 100)}% (${gateToName(gate)})`;
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
              cell.title = `${name} vel:${Math.round((track.steps[si].velocity ?? 1) * 127)} gate:${Math.round(newGate * 100)}% (${gateToName(newGate)})`;
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

          // Draw mode: clicking an empty cell creates a note
          if (state.prDrawMode && !alreadyThisNote) {
            if (!step.active) {
              emit('step:toggle', { stepIndex: si, shiftKey: false });
            }
            emit('step:plock', { stepIndex: si, param: 'note', value: midi });
            cell.classList.add('active');
            cell.style.cursor = 'ns-resize';
            activeSet.add(key);
            return;
          }

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

        // Drag-to-draw: start draw-drag on pointerdown in draw mode
        cell.addEventListener('pointerdown', (e) => {
          if (!state.prDrawMode) return;
          state._rollDragging = true;
          state._rollDrawNote = midi;
          window.addEventListener('pointerup', onWindowPointerUp, { once: true });
        });

        // Drag-to-draw: activate cells as pointer moves across the grid
        cell.addEventListener('pointermove', (e) => {
          if (!state.prDrawMode || !state._rollDragging) return;
          // Only draw on cells in the same row (note) as the drag started
          if (midi !== state._rollDrawNote) return;
          const key = `${midi}_${si}`;
          if (!activeSet.has(key)) {
            const step = track.steps[si];
            if (!step.active) {
              emit('step:toggle', { stepIndex: si, shiftKey: false });
            }
            emit('step:plock', { stepIndex: si, param: 'note', value: midi });
            cell.classList.add('active');
            cell.style.cursor = 'ns-resize';
            activeSet.add(key);
          }
        });

        // Right-click to delete an active note
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!activeSet.has(`${midi}_${si}`)) return;
          const step = track.steps[si];
          step.active = false;
          if (step.paramLocks) delete step.paramLocks.note;
          activeSet.delete(`${midi}_${si}`);
          emit('track:change', { param: 'steps', value: track.steps });
          emit('state:change', { path: 'rollScroll', value: state.rollScroll });
        });

        row.append(cell);
      }

      gridCol.append(row);
    });

    gridView.append(gridCol);
    scrollContainer.append(gridView);
    view.append(keysCol, scrollContainer);
    container.append(view);

    // Ctrl+scroll horizontal zoom on the roll grid
    const rollContainer = container.querySelector('.roll-grid') ?? gridCol;

    function renderRoll() {
      emit('knob:change', { param: 'rollZoom', value: state.rollZoom });
    }

    scrollContainer.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const newZoom = Math.max(0, Math.min(4, (state.rollZoom ?? 1) + delta));
      if (newZoom !== state.rollZoom) {
        state.rollZoom = newZoom;
        renderRoll();
      }
    }, { passive: false });

    let pinchStartDist = 0;

    rollContainer.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        e.preventDefault();
      }
    }, { passive: false });

    rollContainer.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = dist / pinchStartDist;
        if (Math.abs(scale - 1) > 0.1) {
          state.rollZoom = Math.max(0, Math.min(4, Math.round((state.rollZoom ?? 1) * scale)));
          pinchStartDist = dist;
          renderRoll();
        }
        e.preventDefault();
      }
    }, { passive: false });

    // Build a midi→key element map for key flash on play
    const midiToKeyEl = new Map();
    keysCol.querySelectorAll('.roll-key').forEach(keyEl => {
      const midi = ROWS.find(r => r.name === keyEl.textContent.trim())?.midi;
      if (midi != null) midiToKeyEl.set(midi, keyEl);
    });

    // Animated playhead: highlight current step column + flash keys
    let rafId = null;
    let lastHighlightedCol = -1;
    const keyFlashTimers = new Map();
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
            // Flash the corresponding piano key
            const step = track.steps[stepIdx];
            if (step?.active) {
              const midi = step.paramLocks?.note ?? step.note;
              if (midi != null) {
                const keyEl = midiToKeyEl.get(midi);
                if (keyEl) {
                  keyEl.classList.add('lit');
                  if (keyFlashTimers.has(midi)) clearTimeout(keyFlashTimers.get(midi));
                  keyFlashTimers.set(midi, setTimeout(() => {
                    keyEl.classList.remove('lit');
                    keyFlashTimers.delete(midi);
                  }, 120));
                }
              }
            }
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
    velLane.style.cssText = 'display:flex;height:40px;max-height:60px;flex-shrink:0;border-top:1px solid #2a2a2a;overflow-x:hidden;position:relative;cursor:crosshair;';

    function renderVelocityLane() {
      velLane.innerHTML = '';
      track.steps.slice(0, patLen).forEach((step, si) => {
        const bar = document.createElement('div');
        bar.className = 'vel-bar';
        const vel = step.velocity ?? 1;
        const velInt = Math.round(vel * 127);
        const heightPct = Math.round(vel * 100);
        bar.style.cssText = `
          width: ${cellW}px; min-width: ${cellW}px; flex-shrink: 0;
          height: ${heightPct}%; align-self: flex-end;
          background: ${step.active ? 'var(--track-color, var(--accent))' : '#333'};
          border-right: 1px solid #1a1a1a;
          box-sizing: border-box; position: relative; overflow: hidden;
        `;
        // Numeric overlay on tall bars (height >= 60% and cellW >= 18)
        if (step.active && heightPct >= 60 && cellW >= 18) {
          const label = document.createElement('span');
          label.style.cssText = `
            position:absolute; bottom:1px; left:0; right:0;
            text-align:center; font-family:var(--font-mono);
            font-size:0.36rem; color:rgba(0,0,0,0.7); pointer-events:none; line-height:1;
          `;
          label.textContent = velInt;
          bar.append(label);
        }
        velLane.append(bar);
      });
    }

    renderVelocityLane();

    // Pencil/drag tool: click and drag to set velocities
    velLane.addEventListener('mousedown', e => {
      const rect = velLane.getBoundingClientRect();
      function setVelAtPos(clientX, clientY) {
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const laneH = rect.height;
        const newVel = Math.max(1, Math.min(127, Math.round((1 - y / laneH) * 127)));
        const stepW = rect.width / (pattern.length ?? 16);
        const si = Math.floor(x / stepW);
        const step = track.steps[si];
        if (step && step.active) {
          step.velocity = newVel / 127;
          emit('state:change', { param: 'velocity' });
          renderVelocityLane();
        }
      }
      setVelAtPos(e.clientX, e.clientY);
      const onMove = me => setVelAtPos(me.clientX, me.clientY);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
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
