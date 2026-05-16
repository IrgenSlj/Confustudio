// src/pages/pad.js — Velocity-sensitive 4×4 Pad Controller

import { TRACK_COLORS } from '../state.js';

// ── Scales ────────────────────────────────────────────────────────────────────
const SCALES = {
  'C Major': [0, 2, 4, 5, 7, 9, 11],
  'C Minor': [0, 2, 3, 5, 7, 8, 10],
  Pentatonic: [0, 2, 4, 7, 9],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const SCALE_NAMES = Object.keys(SCALES);

// Pad-to-note mapping within a scale at a given root octave
function padNotes(scaleName, octave) {
  const intervals = SCALES[scaleName] ?? SCALES['C Major'];
  // Fill 16 pads by cycling through scale intervals across octaves
  return Array.from({ length: 16 }, (_, i) => {
    const octShift = Math.floor(i / intervals.length);
    return 60 + (octave - 5) * 12 + intervals[i % intervals.length] + octShift * 12;
  });
}

function midiToNoteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}

// Module-level pad state (persists across renders within a session)
let _octave = 5;
let _scaleName = 'C Major';
let _holdMode = false;
let _stepRecMode = false;
let _assignMode = false;
let _assignPadIdx = null; // which pad is waiting for track assignment
const _padAssignments = Array.from({ length: 16 }, (_, i) => i % 8); // pad → track index
const _heldPads = new Set(); // pads currently held (for hold mode)
let _midiLearnMode = false;
let _midiLearnPad = null;
let _padMode = 'drum'; // 'drum' | 'melodic'

// ── CSS (injected once) ───────────────────────────────────────────────────────
let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.pad-controller-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d0d0d;
  padding: 6px 8px;
  gap: 6px;
  box-sizing: border-box;
  overflow: hidden;
}

/* ── Controls bar: single clean row ── */
.pad-controls-bar {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  height: 26px;
}

.pad-ctrl-sep {
  width: 1px;
  height: 16px;
  background: #333;
  flex-shrink: 0;
  margin: 0 2px;
}

.pad-ctrl-btn {
  background: #1a1a1a;
  color: var(--screen-text, #e0ffe0);
  border: 1px solid #333;
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono, monospace);
  font-size: 0.52rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s, transform 0.04s, filter 0.04s;
  height: 22px;
  flex-shrink: 0;
}
.pad-ctrl-btn:hover { background: #252525; }
.pad-ctrl-btn.active {
  background: var(--accent, #5add71);
  color: #000;
  border-color: var(--accent, #5add71);
}
.pad-ctrl-btn.warn {
  background: #c67dff33;
  border-color: #c67dff;
  color: #c67dff;
}
.pad-ctrl-btn.mode-melodic {
  background: #5580ff33;
  border-color: #5580ff;
  color: #88aaff;
}

.pad-octave-group {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.pad-octave-label {
  font-family: var(--font-mono, monospace);
  font-size: 0.52rem;
  color: var(--muted, #888);
  padding: 0 3px;
  min-width: 22px;
  text-align: center;
}

.pad-scale-select {
  background: #1a1a1a;
  color: var(--screen-text, #e0ffe0);
  border: 1px solid #333;
  border-radius: 4px;
  padding: 1px 4px;
  font-family: var(--font-mono, monospace);
  font-size: 0.5rem;
  cursor: pointer;
  height: 22px;
  flex-shrink: 0;
}

/* ── Square pad grid ── */
.pad-grid-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pad-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 6px;
  padding: 4px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  aspect-ratio: 1;
  max-width: 100%;
  max-height: 100%;
}

.pad-cell {
  position: relative;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 6px 8px;
  user-select: none;
  touch-action: none;
  border: 2px solid transparent;
  transition: transform 0.12s, filter 0.12s, border-color 0.08s;
  box-sizing: border-box;
  min-height: 0;
  aspect-ratio: 1;
}
.pad-cell:active,
.pad-cell.pressed,
.pad-cell.pad-hit {
  transform: scale(0.92) !important;
  filter: brightness(1.4) !important;
  transition: transform 0.04s, filter 0.04s !important;
  border-color: rgba(255,255,255,0.7) !important;
}
.pad-cell.assign-target {
  border-color: #c67dff !important;
  animation: pad-pulse 0.6s ease-in-out infinite alternate;
}

.pad-label-name {
  font-family: var(--font-mono, monospace);
  font-size: 0.52rem;
  color: rgba(255,255,255,0.9);
  line-height: 1.3;
  pointer-events: none;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pad-label-note {
  font-family: var(--font-mono, monospace);
  font-size: 0.65rem;
  font-weight: bold;
  color: rgba(255,255,255,1);
  pointer-events: none;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}
/* Melodic mode: larger note name, no track label needed */
.pad-grid.mode-melodic .pad-label-name {
  font-size: 0.45rem;
  opacity: 0.7;
}
.pad-grid.mode-melodic .pad-label-note {
  font-size: 0.72rem;
}

.pad-flash-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0);
  pointer-events: none;
  border-radius: 8px;
  animation: none;
}
.pad-flash-overlay.flashing {
  animation: pad-flash 0.35s ease-out forwards;
}

.pad-velocity-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(255,255,255,0.25);
  border-radius: 0 0 6px 6px;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.08s, opacity 0.3s;
  pointer-events: none;
}

/* Octave badge — small corner label in melodic mode */
.pad-octave-badge {
  position: absolute;
  top: 4px;
  right: 5px;
  font-family: var(--font-mono, monospace);
  font-size: 0.36rem;
  color: rgba(255,255,255,0.4);
  pointer-events: none;
}

@keyframes pad-flash {
  0%   { background: rgba(255,255,255,var(--flash-opacity, 0.55)); }
  100% { background: rgba(255,255,255,0); }
}

@keyframes pad-pulse {
  from { opacity: 0.7; }
  to   { opacity: 1; }
}
  `;
  document.head.append(style);
}

export default {
  render(container, state, emit) {
    injectCSS();
    container.innerHTML = '';
    container.className = (container.className || '') + ' pad-controller-page';
    container.style.cssText =
      'display:flex;flex-direction:column;height:100%;background:#0d0d0d;padding:6px 8px;gap:6px;box-sizing:border-box;overflow:hidden';

    const tracks = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks;

    // ── Controls bar ─────────────────────────────────────────────────────────
    const controlsBar = document.createElement('div');
    controlsBar.className = 'pad-controls-bar';

    // Helper: thin separator
    const makeSep = () => {
      const sep = document.createElement('div');
      sep.className = 'pad-ctrl-sep';
      return sep;
    };

    // Hold mode toggle
    const holdBtn = document.createElement('button');
    holdBtn.className = 'pad-ctrl-btn' + (_holdMode ? ' active' : '');
    holdBtn.textContent = 'HOLD';
    holdBtn.title = 'Hold mode: sustain notes until pad is released';
    holdBtn.addEventListener('click', () => {
      _holdMode = !_holdMode;
      holdBtn.classList.toggle('active', _holdMode);
      if (!_holdMode) _heldPads.clear();
    });

    // Step record toggle
    const stepRecBtn = document.createElement('button');
    stepRecBtn.className = 'pad-ctrl-btn' + (_stepRecMode ? ' active' : '');
    stepRecBtn.textContent = 'STEP REC';
    stepRecBtn.title = 'Step record: pad tap records into current step';
    stepRecBtn.addEventListener('click', () => {
      _stepRecMode = !_stepRecMode;
      stepRecBtn.classList.toggle('active', _stepRecMode);
    });

    // Octave controls
    const octGroup = document.createElement('div');
    octGroup.className = 'pad-octave-group';
    const octDownBtn = document.createElement('button');
    octDownBtn.className = 'pad-ctrl-btn';
    octDownBtn.textContent = 'OCT-';
    octDownBtn.addEventListener('click', () => {
      _octave = Math.max(1, _octave - 1);
      octLabel.textContent = `C${_octave}`;
      _rerenderGrid();
    });
    const octLabel = document.createElement('span');
    octLabel.className = 'pad-octave-label';
    octLabel.textContent = `C${_octave}`;
    const octUpBtn = document.createElement('button');
    octUpBtn.className = 'pad-ctrl-btn';
    octUpBtn.textContent = 'OCT+';
    octUpBtn.addEventListener('click', () => {
      _octave = Math.min(8, _octave + 1);
      octLabel.textContent = `C${_octave}`;
      _rerenderGrid();
    });
    octGroup.append(octDownBtn, octLabel, octUpBtn);

    // Scale selector
    const scaleSelect = document.createElement('select');
    scaleSelect.className = 'pad-scale-select';
    scaleSelect.title = 'Scale for pad notes';
    SCALE_NAMES.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === _scaleName) opt.selected = true;
      scaleSelect.append(opt);
    });
    scaleSelect.addEventListener('change', () => {
      _scaleName = scaleSelect.value;
      _rerenderGrid();
    });

    // MODE toggle: DRUM vs MELODIC
    const modeBtn = document.createElement('button');
    modeBtn.className = 'pad-ctrl-btn' + (_padMode === 'melodic' ? ' mode-melodic' : '');
    modeBtn.textContent = _padMode === 'melodic' ? 'MELODIC' : 'DRUM';
    modeBtn.title = 'Toggle between Drum (8 tracks) and Melodic (16 scale notes) mode';
    modeBtn.addEventListener('click', () => {
      _padMode = _padMode === 'drum' ? 'melodic' : 'drum';
      modeBtn.textContent = _padMode === 'melodic' ? 'MELODIC' : 'DRUM';
      modeBtn.classList.toggle('mode-melodic', _padMode === 'melodic');
      _rerenderGrid();
    });

    // Assignment mode toggle
    const assignBtn = document.createElement('button');
    assignBtn.className = 'pad-ctrl-btn' + (_assignMode ? ' warn' : '');
    assignBtn.textContent = 'ASSIGN';
    assignBtn.title = 'Assignment mode: click a pad, then click a track slot';
    assignBtn.addEventListener('click', () => {
      _assignMode = !_assignMode;
      _assignPadIdx = null;
      assignBtn.classList.toggle('warn', _assignMode);
      _rerenderGrid();
    });

    // MIDI learn toggle
    const midiLearnBtn = document.createElement('button');
    midiLearnBtn.className = 'pad-ctrl-btn' + (_midiLearnMode ? ' warn' : '');
    midiLearnBtn.textContent = 'MIDI LEARN';
    midiLearnBtn.title = 'MIDI learn: press a hardware pad to assign it to a slot';
    midiLearnBtn.addEventListener('click', () => {
      _midiLearnMode = !_midiLearnMode;
      _midiLearnPad = _midiLearnMode ? 0 : null;
      midiLearnBtn.classList.toggle('warn', _midiLearnMode);
    });

    controlsBar.append(
      holdBtn,
      stepRecBtn,
      makeSep(),
      octGroup,
      makeSep(),
      scaleSelect,
      makeSep(),
      modeBtn,
      makeSep(),
      assignBtn,
      midiLearnBtn,
    );
    container.append(controlsBar);

    // ── Pad grid ──────────────────────────────────────────────────────────────
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'pad-grid-wrapper';
    container.append(gridWrapper);

    const grid = document.createElement('div');
    grid.className = 'pad-grid' + (_padMode === 'melodic' ? ' mode-melodic' : '');
    gridWrapper.append(grid);

    // Keep a reference to rerender only the grid labels/state
    function _rerenderGrid() {
      grid.innerHTML = '';
      grid.className = 'pad-grid' + (_padMode === 'melodic' ? ' mode-melodic' : '');
      buildPads();
    }

    function buildPads() {
      const currentNotes = padNotes(_scaleName, _octave);
      for (let i = 0; i < 16; i++) {
        // ── Determine track index and note based on mode ──────────────────────
        let trackIdx, note, noteName, nameLabel;
        if (_padMode === 'melodic') {
          // Melodic mode: all 16 pads → consecutive scale notes → active/first track
          trackIdx = state.selectedTrackIndex ?? 0;
          note = currentNotes[i];
          noteName = midiToNoteName(note);
          nameLabel = tracks[trackIdx]?.name ?? `T${trackIdx + 1}`; // show active track name small
        } else {
          // Drum mode: pad i → track i%8, octave shift for pads 8-15
          trackIdx = _padAssignments[i];
          const octShift = Math.floor(i / 8);
          note = (currentNotes[i % 8] ?? currentNotes[0]) + octShift * 12;
          noteName = midiToNoteName(note);
          nameLabel = tracks[trackIdx]?.name ?? `T${trackIdx + 1}`;
        }

        const color = TRACK_COLORS[trackIdx % TRACK_COLORS.length];

        const pad = document.createElement('div');
        pad.className = 'pad-cell';
        pad.dataset.padIdx = String(i);
        pad.style.background = hexWithAlpha(color, _padMode === 'melodic' ? 0.35 : 0.45);
        pad.style.borderColor = hexWithAlpha(color, 0.3);

        if (_assignMode && _assignPadIdx === i) {
          pad.classList.add('assign-target');
        }

        // Flash overlay
        const flashOverlay = document.createElement('div');
        flashOverlay.className = 'pad-flash-overlay';
        pad.append(flashOverlay);

        // Velocity bar
        const velBar = document.createElement('div');
        velBar.className = 'pad-velocity-bar';
        pad.append(velBar);

        // Labels
        const labelName = document.createElement('div');
        labelName.className = 'pad-label-name';
        labelName.textContent = nameLabel;

        const labelNote = document.createElement('div');
        labelNote.className = 'pad-label-note';
        labelNote.textContent = noteName;

        pad.append(labelName, labelNote);
        grid.append(pad);

        // ── Pointer events ──────────────────────────────────────────────────
        pad.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          pad.setPointerCapture(e.pointerId);

          if (_assignMode) {
            if (_assignPadIdx === null) {
              // First click: select the pad to reassign
              _assignPadIdx = i;
              _rerenderGrid();
            } else if (_assignPadIdx === i) {
              // Click same pad: cancel
              _assignPadIdx = null;
              _rerenderGrid();
            }
            // Track selection handled via track strip events — here just highlight
            return;
          }

          // Calculate velocity from Y position (top = high, bottom = low)
          const rect = pad.getBoundingClientRect();
          const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          const velocity = Math.max(0.05, 1 - relY * 0.8); // top=1.0, bottom=0.2

          // Determine the effective note for this pad at trigger time
          const effectiveNotes = padNotes(_scaleName, _octave);
          let trigNote;
          if (_padMode === 'melodic') {
            trigNote = effectiveNotes[i];
          } else {
            const octShiftTrig = Math.floor(i / 8);
            trigNote = (effectiveNotes[i % 8] ?? effectiveNotes[0]) + octShiftTrig * 12;
          }

          triggerPad(i, trackIdx, trigNote, velocity, flashOverlay, velBar, color);
          pad.classList.add('pressed');
          _heldPads.add(i);
        });

        pad.addEventListener('pointerup', () => {
          pad.classList.remove('pressed');
          if (_holdMode) return; // sustain
          _heldPads.delete(i);
          document.dispatchEvent(
            new CustomEvent('confustudio:note:off', {
              detail: { note, trackIndex: trackIdx },
            }),
          );
        });

        pad.addEventListener('pointerleave', () => {
          if (_heldPads.has(i) && !_holdMode) {
            pad.classList.remove('pressed');
          }
        });
      }
    }

    buildPads();

    // Assignment mode: listen for track-strip click events to complete assignment
    function onTrackClick(e) {
      if (!_assignMode || _assignPadIdx === null) return;
      const trackIndex = e.detail?.trackIndex;
      if (typeof trackIndex !== 'number') return;
      _padAssignments[_assignPadIdx] = trackIndex % 8;
      _assignPadIdx = null;
      emit('toast', { msg: `Pad ${_assignPadIdx + 1} → ${tracks[trackIndex]?.name ?? 'Track ' + (trackIndex + 1)}` });
      _rerenderGrid();
    }
    document.addEventListener('confustudio:track:select', onTrackClick);

    // MIDI learn: capture incoming MIDI note-on events and assign to next learn slot
    function onMidiLearn(e) {
      if (!_midiLearnMode) return;
      const { trackIndex } = e.detail ?? {};
      if (typeof _midiLearnPad === 'number' && _midiLearnPad < 16) {
        if (typeof trackIndex === 'number') _padAssignments[_midiLearnPad] = trackIndex % 8;
        emit('toast', { msg: `MIDI learned: pad ${_midiLearnPad + 1}` });
        _midiLearnPad = (_midiLearnPad + 1) % 16;
        if (_midiLearnPad === 0) {
          _midiLearnMode = false;
          midiLearnBtn.classList.remove('warn');
        }
        _rerenderGrid();
      }
    }
    document.addEventListener('confustudio:note:on', onMidiLearn);

    // Cleanup event listeners when page is replaced
    const observer = new MutationObserver(() => {
      if (!document.contains(container)) {
        document.removeEventListener('confustudio:track:select', onTrackClick);
        document.removeEventListener('confustudio:note:on', onMidiLearn);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ── Trigger helper ────────────────────────────────────────────────────────
    function triggerPad(padIdx, trackIdx, note, velocity, flashOverlay, velBar, color) {
      // 1. Fire confustudio:note:on
      document.dispatchEvent(
        new CustomEvent('confustudio:note:on', {
          detail: { note, velocity, trackIndex: trackIdx, channel: trackIdx },
        }),
      );

      // 2. Emit trigger to engine
      emit('trigger:track', { trackIndex: trackIdx, velocity, note });

      // 3. Step record
      if (_stepRecMode) {
        emit('step:record:pad', {
          trackIndex: trackIdx,
          note,
          velocity,
          stepIndex: state._stepRecordCursor ?? 0,
        });
      }

      // 4. Velocity flash
      const opacity = 0.2 + velocity * 0.6;
      flashOverlay.style.setProperty('--flash-opacity', String(opacity));
      flashOverlay.classList.remove('flashing');
      // Force reflow to restart animation
      void flashOverlay.offsetWidth;
      flashOverlay.classList.add('flashing');

      // 5. Velocity bar
      velBar.style.transform = `scaleX(${velocity})`;
      velBar.style.background = hexWithAlpha(color, 0.85);
      velBar.style.opacity = '1';
      setTimeout(() => {
        velBar.style.opacity = '0';
      }, 500);
    }
  },

  keyboardContext: 'pad',
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function hexWithAlpha(hex, alpha) {
  // hex = '#rrggbb', returns rgba(r,g,b,alpha)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
