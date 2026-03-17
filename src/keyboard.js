// src/keyboard.js
// CONFUsynth v3 — keyboard module
// Manages: context keyboard zone, visual piano, global shortcut dispatch

export const NOTE_KEY_OFFSETS = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4,
  KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9,
  KeyJ: 10, KeyM: 11, Comma: 12,
};

export const PAGE_KEYS = {
  F1: 'pattern',
  F2: 'piano-roll',
  F3: 'sound',
  F4: 'mixer',
  F5: 'fx',
  F6: 'scenes',
  F7: 'banks',
  F8: 'arranger',
  F9: 'settings',
};

export const STEP_KEYS = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8',
  'KeyQ',   'KeyW',   'KeyE',   'KeyR',   'KeyT',   'KeyY',   'KeyU',   'KeyI',
];

// Context keyboard hint maps per page
export const CONTEXT_MAPS = {
  pattern: [
    { key: '1-8',      label: 'Steps 1-8'   },
    { key: 'Q-I',      label: 'Steps 9-16'  },
    { key: 'Shift+1-8',label: 'Accent'      },
    { key: 'Alt+1-8',  label: 'P-Lock'      },
    { key: 'Ctrl+C',   label: 'Copy'        },
    { key: 'Ctrl+V',   label: 'Paste'       },
    { key: 'Shift+R',  label: 'Random'      },
    { key: 'Del',      label: 'Clear'       },
    { key: '-/=',      label: 'Oct−/+'      },
  ],
  'piano-roll': [
    { key: 'Z-,',        label: 'Play notes' },
    { key: 'S,D,G,H,J', label: 'Black keys' },
    { key: '-/=',        label: 'Oct−/+'    },
  ],
  sound: [
    { key: '1-4',  label: 'Machine'  },
    { key: 'Q-T',  label: 'Waveform' },
    { key: 'Z-,',  label: 'Preview'  },
  ],
  mixer: [
    { key: '1-8',       label: 'Select track'  },
    { key: 'M',         label: 'Mute'          },
    { key: 'S',         label: 'Solo'          },
    { key: 'Shift+1-8', label: 'Toggle mute'   },
  ],
  fx: [
    { key: '1-4', label: 'FX select' },
    { key: 'Z-,', label: 'Preview'   },
  ],
  scenes: [
    { key: '1-8', label: 'Scene slot'  },
    { key: 'A',   label: 'Assign A'   },
    { key: 'B',   label: 'Assign B'   },
    { key: 'S',   label: 'Snapshot'   },
  ],
  banks: [
    { key: 'A-H',   label: 'Bank A-H' },
    { key: '1-16',  label: 'Pattern'  },
    { key: 'Ctrl+C',label: 'Copy'     },
    { key: 'Ctrl+V',label: 'Paste'    },
    { key: 'Enter', label: 'Cue'      },
  ],
  arranger: [
    { key: '1-8',   label: 'Scene ref'   },
    { key: 'Insert',label: 'Add section' },
    { key: 'Delete',label: 'Remove'      },
    { key: 'Space', label: 'Play/Stop'   },
  ],
  settings: [
    { key: '1-4', label: 'MIDI Port' },
  ],
};

// ─── Context keyboard zone ─────────────────────────────────────────────────────

/**
 * Render hint chips into the #kbd-context container.
 * @param {HTMLElement} containerEl
 * @param {string} page
 */
export function renderKbdContext(containerEl, page) {
  containerEl.innerHTML = '';
  const map = CONTEXT_MAPS[page] || [];
  map.forEach(({ key, label }) => {
    const btn = document.createElement('div');
    btn.className = 'kbd-hint';
    btn.innerHTML = `<strong>${key}</strong><span>${label}</span>`;
    containerEl.append(btn);
  });
}

// ─── Visual piano ──────────────────────────────────────────────────────────────

// White semitones within an octave (C D E F G A B)
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
// Black semitone → its left-gap position among white keys (0-indexed gap units)
// i.e. C# is after the 1st white (C), D# after the 2nd (D), etc.
const BLACK_SEMITONE_TO_WHITE_GAP = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };

/**
 * Render a 2-octave visual piano (C3–B4) into containerEl.
 * state._playingNotes should be a Set of active MIDI note numbers.
 * @param {HTMLElement} containerEl
 * @param {object} state
 */
export function renderPiano(containerEl, state) {
  containerEl.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'piano-wrapper';
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;display:flex;';

  const octaves = [3, 4];
  const activeNotes = state._playingNotes instanceof Set ? state._playingNotes : new Set();
  const totalWhiteKeys = octaves.length * WHITE_SEMITONES.length; // 14

  // White keys (laid out as flex children)
  octaves.forEach(oct => {
    WHITE_SEMITONES.forEach(semitone => {
      const midi = (oct + 1) * 12 + semitone;
      const key = document.createElement('div');
      key.className = 'piano-white' + (activeNotes.has(midi) ? ' lit' : '');
      key.dataset.midi = midi;
      wrapper.append(key);
    });
  });

  // Black keys (absolutely positioned over the white keys)
  octaves.forEach((oct, octaveIndex) => {
    Object.entries(BLACK_SEMITONE_TO_WHITE_GAP).forEach(([semiStr, gapAfterWhite]) => {
      const semi = Number(semiStr);
      const midi = (oct + 1) * 12 + semi;
      const keyEl = document.createElement('div');
      keyEl.className = 'piano-black' + (activeNotes.has(midi) ? ' lit' : '');
      keyEl.dataset.midi = midi;

      // Each white key takes (100 / totalWhiteKeys)% of total width.
      // A black key sits between white keys; gapAfterWhite is how many white
      // keys into this octave it falls (1-based), so its center is at
      // (octaveIndex * 7 + gapAfterWhite) white-key widths from the left.
      const whiteWidth = 100 / totalWhiteKeys;
      const leftPercent = (octaveIndex * 7 + gapAfterWhite - 0.3) * whiteWidth;
      keyEl.style.left = `${leftPercent}%`;
      wrapper.append(keyEl);
    });
  });

  containerEl.append(wrapper);
}

/**
 * Light or unlight a single piano key by MIDI note number.
 * @param {HTMLElement} containerEl
 * @param {number} midi
 * @param {boolean} lit
 */
export function lightPianoKey(containerEl, midi, lit = true) {
  containerEl.querySelectorAll(`[data-midi="${midi}"]`).forEach(el => {
    el.classList.toggle('lit', lit);
  });
}

// ─── Global keyboard handler ───────────────────────────────────────────────────

/**
 * Attach global keydown/keyup listeners and dispatch events via emit().
 * @param {object} state   - live app state reference
 * @param {function} emit  - emit(type, payload?) event bus function
 */
export function initKeyboard(state, emit) {
  window.addEventListener('keydown', (e) => {
    // Skip when focus is inside a text control
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // ── Page navigation (F1–F9) ──
    if (PAGE_KEYS[e.key]) {
      e.preventDefault();
      emit('page:set', { page: PAGE_KEYS[e.key] });
      return;
    }

    // ── Universal: Space = transport toggle ──
    if (e.code === 'Space') {
      e.preventDefault();
      emit('transport:toggle');
      return;
    }

    // ── Universal: Ctrl/Cmd shortcuts ──
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyC') { e.preventDefault(); emit('pattern:copy');  return; }
      if (e.code === 'KeyV') { e.preventDefault(); emit('pattern:paste'); return; }
    }

    // ── Universal: Delete/Backspace = clear pattern (without Ctrl) ──
    if ((e.code === 'Delete' || e.code === 'Backspace') && !e.ctrlKey) {
      emit('pattern:clear');
      return;
    }

    // ── Universal: octave shift ──
    if (e.code === 'Minus') { e.preventDefault(); emit('octave:shift', { delta: -1 }); return; }
    if (e.code === 'Equal') { e.preventDefault(); emit('octave:shift', { delta: +1 }); return; }

    // ── Universal: track cycle ──
    if (e.code === 'BracketLeft')  { emit('track:cycle', { delta: -1 }); return; }
    if (e.code === 'BracketRight') { emit('track:cycle', { delta: +1 }); return; }

    // ── Page-specific ──
    const page = state.currentPage;

    // Pattern page: step keys + note preview
    if (page === 'pattern') {
      const stepIdx = STEP_KEYS.indexOf(e.code);
      if (stepIdx >= 0) {
        if (e.altKey) {
          emit('step:plockMode', { stepIndex: stepIdx });
        } else {
          emit('step:toggle', { stepIndex: stepIdx, shiftKey: e.shiftKey });
        }
        return;
      }
    }

    // Note preview keys — active on pattern, piano-roll, sound
    if (page === 'pattern' || page === 'piano-roll' || page === 'sound') {
      const offset = NOTE_KEY_OFFSETS[e.code];
      if (offset != null) {
        const note = 60 + state.octaveShift * 12 + offset;
        emit('note:preview', { note });
        return;
      }
    }

    // Mixer page
    if (page === 'mixer') {
      // Digit keys 1-8 select or mute-toggle tracks
      if (e.key >= '1' && e.key <= '8') {
        const trackIndex = Number(e.key) - 1;
        if (e.shiftKey) {
          emit('track:muteToggle', { trackIndex });
        } else {
          emit('track:select', { trackIndex });
        }
        return;
      }
      if (e.code === 'KeyM') { emit('track:mute', { trackIndex: state.selectedTrackIndex }); return; }
      // KeyS is used by NOTE_KEY_OFFSETS above but on mixer we intercept it here first;
      // the note-preview block is guarded to page !== 'mixer', so this is fine.
      if (e.code === 'KeyS') { emit('track:solo', { trackIndex: state.selectedTrackIndex }); return; }
    }

    // Banks page
    if (page === 'banks') {
      const bankKeys = 'ABCDEFGH';
      const bankIdx = bankKeys.indexOf(e.key.toUpperCase());
      if (bankIdx >= 0) {
        emit('bank:select', { bankIndex: bankIdx });
        return;
      }
    }

    // Settings page
    if (page === 'settings') {
      if (e.code === 'KeyA') {
        emit('audio:init');
        return;
      }
    }
  });

  // Note-off on keyup for note-preview keys
  window.addEventListener('keyup', (e) => {
    const offset = NOTE_KEY_OFFSETS[e.code];
    if (offset != null) {
      const note = 60 + state.octaveShift * 12 + offset;
      emit('note:off', { note });
    }
  });
}
