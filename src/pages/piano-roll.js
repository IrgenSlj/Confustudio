// src/pages/piano-roll.js — 2D note grid editor

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_PCS  = new Set([1, 3, 6, 8, 10]); // pitch-class indices for black keys

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

    // Piano roll view
    const view = document.createElement('div');
    view.className = 'piano-roll-view';
    view.style.flex = '1';
    view.style.minHeight = '0';

    // Left: note labels
    const keysCol = document.createElement('div');
    keysCol.className = 'roll-keys';

    // Right: note grid
    const gridCol = document.createElement('div');
    gridCol.className = 'roll-grid';
    gridCol.style.cssText = 'overflow:auto;flex:1';

    ROWS.forEach(({ midi, name, isBlack }) => {
      // Key label
      const key = document.createElement('div');
      key.className = 'roll-key' + (isBlack ? ' black-key' : '');
      key.textContent = name;
      keysCol.append(key);

      // Grid row
      const row = document.createElement('div');
      row.className = 'roll-row' + (isBlack ? ' black-row' : '');

      for (let si = 0; si < steps; si++) {
        const cell = document.createElement('div');
        cell.className = 'roll-cell';
        if (activeSet.has(`${midi}_${si}`)) cell.classList.add('active');
        if (si === state.currentStep)        cell.classList.add('playhead');

        cell.addEventListener('click', () => {
          const step = track.steps[si];
          const alreadyThisNote = step.active && (step.paramLocks?.note === midi || (step.note === midi && !step.paramLocks?.note));
          if (alreadyThisNote) {
            // Toggle off
            emit('step:toggle', { stepIndex: si, shiftKey: false });
            cell.classList.remove('active');
            activeSet.delete(`${midi}_${si}`);
          } else {
            // Activate and set note
            if (!step.active) {
              emit('step:toggle', { stepIndex: si, shiftKey: false });
            }
            emit('step:plock', { stepIndex: si, param: 'note', value: midi });
            cell.classList.add('active');
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
