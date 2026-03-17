// src/keyboard.js
// CONFUsynth v3 — keyboard module
// Full graphical QWERTY keyboard + note preview + global shortcuts

export const NOTE_KEY_OFFSETS = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4,
  KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9,
  KeyJ: 10, KeyM: 11, Comma: 12,
};

export const PAGE_KEYS = {
  F1: 'pattern', F2: 'piano-roll', F3: 'sound', F4: 'mixer',
  F5: 'fx', F6: 'scenes', F7: 'banks', F8: 'arranger', F9: 'settings',
};

export const STEP_KEYS = [
  'Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8',
  'KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI',
];

// ─── QWERTY physical layout ────────────────────────────────────────────────────
// Each key: { code, cap, w }  — w is flex-grow weight (1 = standard key)

const QWERTY_ROWS = [
  // Row 0: Function row
  [
    { code:'Escape',  cap:'ESC',  w:1   },
    { code:'F1',      cap:'F1',   w:1   },
    { code:'F2',      cap:'F2',   w:1   },
    { code:'F3',      cap:'F3',   w:1   },
    { code:'F4',      cap:'F4',   w:1   },
    { code:'F5',      cap:'F5',   w:1   },
    { code:'F6',      cap:'F6',   w:1   },
    { code:'F7',      cap:'F7',   w:1   },
    { code:'F8',      cap:'F8',   w:1   },
    { code:'F9',      cap:'F9',   w:1   },
    { code:'F10',     cap:'F10',  w:1   },
    { code:'F11',     cap:'F11',  w:1   },
    { code:'F12',     cap:'F12',  w:1   },
  ],
  // Row 1: Number row
  [
    { code:'Backquote',    cap:'`',   w:1   },
    { code:'Digit1',       cap:'1',   w:1   },
    { code:'Digit2',       cap:'2',   w:1   },
    { code:'Digit3',       cap:'3',   w:1   },
    { code:'Digit4',       cap:'4',   w:1   },
    { code:'Digit5',       cap:'5',   w:1   },
    { code:'Digit6',       cap:'6',   w:1   },
    { code:'Digit7',       cap:'7',   w:1   },
    { code:'Digit8',       cap:'8',   w:1   },
    { code:'Digit9',       cap:'9',   w:1   },
    { code:'Digit0',       cap:'0',   w:1   },
    { code:'Minus',        cap:'-',   w:1   },
    { code:'Equal',        cap:'=',   w:1   },
    { code:'Backspace',    cap:'⌫',   w:2   },
  ],
  // Row 2: QWERTY
  [
    { code:'Tab',          cap:'TAB', w:1.5 },
    { code:'KeyQ',         cap:'Q',   w:1   },
    { code:'KeyW',         cap:'W',   w:1   },
    { code:'KeyE',         cap:'E',   w:1   },
    { code:'KeyR',         cap:'R',   w:1   },
    { code:'KeyT',         cap:'T',   w:1   },
    { code:'KeyY',         cap:'Y',   w:1   },
    { code:'KeyU',         cap:'U',   w:1   },
    { code:'KeyI',         cap:'I',   w:1   },
    { code:'KeyO',         cap:'O',   w:1   },
    { code:'KeyP',         cap:'P',   w:1   },
    { code:'BracketLeft',  cap:'[',   w:1   },
    { code:'BracketRight', cap:']',   w:1   },
    { code:'Backslash',    cap:'\\',  w:1.5 },
  ],
  // Row 3: Home row
  [
    { code:'CapsLock',     cap:'CAPS',w:1.75},
    { code:'KeyA',         cap:'A',   w:1   },
    { code:'KeyS',         cap:'S',   w:1   },
    { code:'KeyD',         cap:'D',   w:1   },
    { code:'KeyF',         cap:'F',   w:1   },
    { code:'KeyG',         cap:'G',   w:1   },
    { code:'KeyH',         cap:'H',   w:1   },
    { code:'KeyJ',         cap:'J',   w:1   },
    { code:'KeyK',         cap:'K',   w:1   },
    { code:'KeyL',         cap:'L',   w:1   },
    { code:'Semicolon',    cap:';',   w:1   },
    { code:'Quote',        cap:"'",   w:1   },
    { code:'Enter',        cap:'↵',   w:2.25},
  ],
  // Row 4: Shift row
  [
    { code:'ShiftLeft',    cap:'⇧',   w:2.25},
    { code:'KeyZ',         cap:'Z',   w:1   },
    { code:'KeyX',         cap:'X',   w:1   },
    { code:'KeyC',         cap:'C',   w:1   },
    { code:'KeyV',         cap:'V',   w:1   },
    { code:'KeyB',         cap:'B',   w:1   },
    { code:'KeyN',         cap:'N',   w:1   },
    { code:'KeyM',         cap:'M',   w:1   },
    { code:'Comma',        cap:',',   w:1   },
    { code:'Period',       cap:'.',   w:1   },
    { code:'Slash',        cap:'/',   w:1   },
    { code:'ShiftRight',   cap:'⇧',   w:2.75},
  ],
  // Row 5: Bottom row
  [
    { code:'ControlLeft',  cap:'CTRL',w:1.5 },
    { code:'AltLeft',      cap:'ALT', w:1.25},
    { code:'Space',        cap:'SPACE',w:6  },
    { code:'AltRight',     cap:'ALT', w:1.25},
    { code:'ControlRight', cap:'CTRL',w:1.5 },
  ],
];

// ─── Key role definitions per page ────────────────────────────────────────────
// role values → CSS class → color in styles.css
// roles: 'page' | 'step' | 'note' | 'note-black' | 'play' | 'util' | 'track' | 'scene'

const KEY_ROLES = {
  pattern: {
    // F1-F9: page navigation
    F1:{ role:'page',  hint:'PATTERN'  }, F2:{ role:'page', hint:'ROLL'    },
    F3:{ role:'page',  hint:'SOUND'    }, F4:{ role:'page', hint:'MIXER'   },
    F5:{ role:'page',  hint:'FX'       }, F6:{ role:'page', hint:'SCENES'  },
    F7:{ role:'page',  hint:'BANKS'    }, F8:{ role:'page', hint:'ARR'     },
    F9:{ role:'page',  hint:'SET'      },
    // Steps 1-8
    Digit1:{ role:'step', hint:'ST1'  }, Digit2:{ role:'step', hint:'ST2'  },
    Digit3:{ role:'step', hint:'ST3'  }, Digit4:{ role:'step', hint:'ST4'  },
    Digit5:{ role:'step', hint:'ST5'  }, Digit6:{ role:'step', hint:'ST6'  },
    Digit7:{ role:'step', hint:'ST7'  }, Digit8:{ role:'step', hint:'ST8'  },
    // Steps 9-16
    KeyQ:{ role:'step', hint:'ST9'   }, KeyW:{ role:'step', hint:'ST10'  },
    KeyE:{ role:'step', hint:'ST11'  }, KeyR:{ role:'step', hint:'ST12'  },
    KeyT:{ role:'step', hint:'ST13'  }, KeyY:{ role:'step', hint:'ST14'  },
    KeyU:{ role:'step', hint:'ST15'  }, KeyI:{ role:'step', hint:'ST16'  },
    // Note keys (white keys)
    KeyZ:{ role:'note',       hint:'C'   }, KeyX:{ role:'note',       hint:'D'   },
    KeyC:{ role:'note',       hint:'E'   }, KeyV:{ role:'note',       hint:'F'   },
    KeyB:{ role:'note',       hint:'G'   }, KeyN:{ role:'note',       hint:'A'   },
    KeyM:{ role:'note',       hint:'B'   }, Comma:{ role:'note',      hint:"C'"  },
    // Black keys
    KeyS:{ role:'note-black', hint:'C#'  }, KeyD:{ role:'note-black', hint:'D#'  },
    KeyG:{ role:'note-black', hint:'F#'  }, KeyH:{ role:'note-black', hint:'G#'  },
    KeyJ:{ role:'note-black', hint:'A#'  },
    // Transport & utils
    Space:       { role:'play',  hint:'PLAY'   },
    Minus:       { role:'util',  hint:'OCT−'   },
    Equal:       { role:'util',  hint:'OCT+'   },
    Backspace:   { role:'util',  hint:'CLEAR'  },
    Delete:      { role:'util',  hint:'CLEAR'  },
    BracketLeft: { role:'track', hint:'TRK−'   },
    BracketRight:{ role:'track', hint:'TRK+'   },
  },
  'piano-roll': {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space: { role:'play', hint:'PLAY' },
    Minus: { role:'util', hint:'OCT−' }, Equal: { role:'util', hint:'OCT+' },
    KeyZ:{ role:'note',       hint:'C'   }, KeyX:{ role:'note',       hint:'D'   },
    KeyC:{ role:'note',       hint:'E'   }, KeyV:{ role:'note',       hint:'F'   },
    KeyB:{ role:'note',       hint:'G'   }, KeyN:{ role:'note',       hint:'A'   },
    KeyM:{ role:'note',       hint:'B'   }, Comma:{ role:'note',      hint:"C'"  },
    KeyS:{ role:'note-black', hint:'C#'  }, KeyD:{ role:'note-black', hint:'D#'  },
    KeyG:{ role:'note-black', hint:'F#'  }, KeyH:{ role:'note-black', hint:'G#'  },
    KeyJ:{ role:'note-black', hint:'A#'  },
    BracketLeft: { role:'track', hint:'TRK−' }, BracketRight: { role:'track', hint:'TRK+' },
  },
  sound: {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space: { role:'play', hint:'PLAY'    },
    Digit1:{ role:'util', hint:'TONE'   }, Digit2:{ role:'util', hint:'NOISE'  },
    Digit3:{ role:'util', hint:'SAMPLE' }, Digit4:{ role:'util', hint:'MIDI'   },
    KeyQ:  { role:'util', hint:'SINE'   }, KeyW:  { role:'util', hint:'TRI'    },
    KeyE:  { role:'util', hint:'SAW'    }, KeyR:  { role:'util', hint:'SQR'    },
    KeyZ:{ role:'note',       hint:'C'   }, KeyX:{ role:'note',       hint:'D'   },
    KeyC:{ role:'note',       hint:'E'   }, KeyV:{ role:'note',       hint:'F'   },
    KeyB:{ role:'note',       hint:'G'   }, KeyN:{ role:'note',       hint:'A'   },
    KeyM:{ role:'note',       hint:'B'   }, Comma:{ role:'note',      hint:"C'"  },
    KeyS:{ role:'note-black', hint:'C#'  }, KeyD:{ role:'note-black', hint:'D#'  },
    KeyG:{ role:'note-black', hint:'F#'  }, KeyH:{ role:'note-black', hint:'G#'  },
    KeyJ:{ role:'note-black', hint:'A#'  },
    Minus:{ role:'util', hint:'OCT−' }, Equal:{ role:'util', hint:'OCT+' },
    BracketLeft:{ role:'track', hint:'TRK−' }, BracketRight:{ role:'track', hint:'TRK+' },
  },
  mixer: {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space: { role:'play',  hint:'PLAY'   },
    Digit1:{ role:'track', hint:'TRK1'  }, Digit2:{ role:'track', hint:'TRK2'  },
    Digit3:{ role:'track', hint:'TRK3'  }, Digit4:{ role:'track', hint:'TRK4'  },
    Digit5:{ role:'track', hint:'TRK5'  }, Digit6:{ role:'track', hint:'TRK6'  },
    Digit7:{ role:'track', hint:'TRK7'  }, Digit8:{ role:'track', hint:'TRK8'  },
    KeyM:{ role:'util',  hint:'MUTE'   },
    KeyS:{ role:'util',  hint:'SOLO'   },
    BracketLeft:{ role:'track', hint:'TRK−' }, BracketRight:{ role:'track', hint:'TRK+' },
  },
  fx: {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space: { role:'play', hint:'PLAY' },
    BracketLeft:{ role:'track', hint:'TRK−' }, BracketRight:{ role:'track', hint:'TRK+' },
  },
  scenes: {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space:  { role:'play',  hint:'PLAY'    },
    Digit1: { role:'scene', hint:'SCN1'   }, Digit2: { role:'scene', hint:'SCN2'   },
    Digit3: { role:'scene', hint:'SCN3'   }, Digit4: { role:'scene', hint:'SCN4'   },
    Digit5: { role:'scene', hint:'SCN5'   }, Digit6: { role:'scene', hint:'SCN6'   },
    Digit7: { role:'scene', hint:'SCN7'   }, Digit8: { role:'scene', hint:'SCN8'   },
    KeyA:   { role:'util',  hint:'ASGN A' },
    KeyB:   { role:'util',  hint:'ASGN B' },
    KeyS:   { role:'util',  hint:'SNAP'   },
  },
  banks: {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space:  { role:'play',  hint:'PLAY'   },
    KeyA:   { role:'util',  hint:'BNK A'  }, KeyB:{ role:'util', hint:'BNK B' },
    KeyC:   { role:'util',  hint:'BNK C'  }, KeyD:{ role:'util', hint:'BNK D' },
    KeyE:   { role:'util',  hint:'BNK E'  }, KeyF:{ role:'util', hint:'BNK F' },
    KeyG:   { role:'util',  hint:'BNK G'  }, KeyH:{ role:'util', hint:'BNK H' },
    Digit1: { role:'step',  hint:'PAT1'   }, Digit2:{ role:'step', hint:'PAT2' },
    Digit3: { role:'step',  hint:'PAT3'   }, Digit4:{ role:'step', hint:'PAT4' },
    Digit5: { role:'step',  hint:'PAT5'   }, Digit6:{ role:'step', hint:'PAT6' },
    Digit7: { role:'step',  hint:'PAT7'   }, Digit8:{ role:'step', hint:'PAT8' },
    Enter:  { role:'util',  hint:'CUE'    },
  },
  arranger: {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space:  { role:'play',  hint:'PLAY'   },
    Insert: { role:'util',  hint:'ADD'    },
    Delete: { role:'util',  hint:'DEL'    },
  },
  settings: {
    F1:{ role:'page', hint:'PATTERN' }, F2:{ role:'page', hint:'ROLL'   },
    F3:{ role:'page', hint:'SOUND'   }, F4:{ role:'page', hint:'MIXER'  },
    F5:{ role:'page', hint:'FX'      }, F6:{ role:'page', hint:'SCENES' },
    F7:{ role:'page', hint:'BANKS'   }, F8:{ role:'page', hint:'ARR'    },
    F9:{ role:'page', hint:'SET'     },
    Space: { role:'play', hint:'PLAY'    },
    KeyA:  { role:'util', hint:'AUDIO'   },
  },
};

// ─── Graphical keyboard renderer ──────────────────────────────────────────────

/**
 * Render a full graphical QWERTY keyboard into containerEl.
 * Keys are color-coded by role for the current page.
 * @param {HTMLElement} containerEl   — #kbd-context
 * @param {string}      page
 * @param {Set}         activeKeys    — set of currently pressed key codes
 */
export function renderKbdContext(containerEl, page, activeKeys = new Set()) {
  containerEl.innerHTML = '';

  const roles = KEY_ROLES[page] || {};
  const kb = document.createElement('div');
  kb.className = 'qwerty-keyboard';

  QWERTY_ROWS.forEach((row, rowIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'qwerty-row';

    row.forEach(({ code, cap, w }) => {
      const keyEl = document.createElement('div');
      const roleInfo = roles[code];
      const role = roleInfo?.role || 'idle';
      const hint = roleInfo?.hint || '';

      keyEl.className = `qwerty-key role-${role}`;
      keyEl.style.flexGrow = w;
      keyEl.style.flexBasis = `${w * 30}px`;
      keyEl.dataset.code = code;

      if (activeKeys.has(code)) keyEl.classList.add('pressed');

      keyEl.innerHTML =
        `<span class="qkey-cap">${cap}</span>` +
        (hint ? `<span class="qkey-hint">${hint}</span>` : '');

      rowEl.append(keyEl);
    });

    kb.append(rowEl);
  });

  containerEl.append(kb);
}

/**
 * Toggle the pressed visual on a single key without re-rendering.
 * @param {HTMLElement} containerEl
 * @param {string}      code   — KeyboardEvent.code
 * @param {boolean}     pressed
 */
export function pressKey(containerEl, code, pressed) {
  const el = containerEl.querySelector(`[data-code="${code}"]`);
  if (el) el.classList.toggle('pressed', pressed);
}

// ─── Visual piano strip ────────────────────────────────────────────────────────

const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_TO_GAP    = { 1:1, 3:2, 6:4, 8:5, 10:6 };

export function renderPiano(containerEl, state) {
  containerEl.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'piano-wrapper';

  const octaves     = [3, 4];
  const active      = state._playingNotes instanceof Set ? state._playingNotes : new Set();
  const totalWhites = octaves.length * WHITE_SEMITONES.length; // 14

  octaves.forEach(oct => {
    WHITE_SEMITONES.forEach(semi => {
      const midi = (oct + 1) * 12 + semi;
      const k = document.createElement('div');
      k.className = 'piano-white' + (active.has(midi) ? ' lit' : '');
      k.dataset.midi = midi;
      wrapper.append(k);
    });
  });

  octaves.forEach((oct, oi) => {
    Object.entries(BLACK_TO_GAP).forEach(([sStr, gap]) => {
      const midi = (oct + 1) * 12 + Number(sStr);
      const k = document.createElement('div');
      k.className = 'piano-black' + (active.has(midi) ? ' lit' : '');
      k.dataset.midi = midi;
      const ww = 100 / totalWhites;
      k.style.left = `${(oi * 7 + gap - 0.3) * ww}%`;
      wrapper.append(k);
    });
  });

  containerEl.append(wrapper);
}

export function lightPianoKey(containerEl, midi, lit = true) {
  containerEl.querySelectorAll(`[data-midi="${midi}"]`).forEach(el => {
    el.classList.toggle('lit', lit);
  });
}

// ─── Global keyboard handler ───────────────────────────────────────────────────

export function initKeyboard(state, emit) {
  const pressed = new Set();

  window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    pressed.add(e.code);
    emit('key:down', { code: e.code });

    // Page navigation F1–F9
    if (PAGE_KEYS[e.key]) {
      e.preventDefault();
      emit('page:set', { page: PAGE_KEYS[e.key] });
      return;
    }

    // Space = transport
    if (e.code === 'Space') {
      e.preventDefault();
      emit('transport:toggle');
      return;
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyC') { e.preventDefault(); emit('pattern:copy');  return; }
      if (e.code === 'KeyV') { e.preventDefault(); emit('pattern:paste'); return; }
    }

    // Delete/Backspace = clear
    if ((e.code === 'Delete' || e.code === 'Backspace') && !e.ctrlKey) {
      emit('pattern:clear'); return;
    }

    // Octave shift
    if (e.code === 'Minus') { e.preventDefault(); emit('octave:shift', { delta:-1 }); return; }
    if (e.code === 'Equal') { e.preventDefault(); emit('octave:shift', { delta:+1 }); return; }

    // Track cycle
    if (e.code === 'BracketLeft')  { emit('track:cycle', { delta:-1 }); return; }
    if (e.code === 'BracketRight') { emit('track:cycle', { delta:+1 }); return; }

    const page = state.currentPage;

    // Pattern: step keys
    if (page === 'pattern') {
      const stepIdx = STEP_KEYS.indexOf(e.code);
      if (stepIdx >= 0) {
        if (e.altKey) emit('step:plockMode', { stepIndex: stepIdx });
        else          emit('step:toggle',    { stepIndex: stepIdx, shiftKey: e.shiftKey });
        return;
      }
    }

    // Note preview
    if (page === 'pattern' || page === 'piano-roll' || page === 'sound') {
      const offset = NOTE_KEY_OFFSETS[e.code];
      if (offset != null) {
        emit('note:preview', { note: 60 + state.octaveShift * 12 + offset });
        return;
      }
    }

    // Mixer
    if (page === 'mixer') {
      if (e.key >= '1' && e.key <= '8') {
        const ti = Number(e.key) - 1;
        e.shiftKey ? emit('track:muteToggle',{trackIndex:ti}) : emit('track:select',{trackIndex:ti});
        return;
      }
      if (e.code === 'KeyM') { emit('track:mute', { trackIndex: state.selectedTrackIndex }); return; }
      if (e.code === 'KeyS') { emit('track:solo', { trackIndex: state.selectedTrackIndex }); return; }
    }

    // Banks
    if (page === 'banks') {
      const bi = 'ABCDEFGH'.indexOf(e.key.toUpperCase());
      if (bi >= 0) { emit('bank:select', { bankIndex: bi }); return; }
    }

    // Settings
    if (page === 'settings') {
      if (e.code === 'KeyA') { emit('audio:init'); return; }
    }
  });

  window.addEventListener('keyup', (e) => {
    pressed.delete(e.code);
    emit('key:up', { code: e.code });

    const offset = NOTE_KEY_OFFSETS[e.code];
    if (offset != null) {
      emit('note:off', { note: 60 + state.octaveShift * 12 + offset });
    }
  });
}
