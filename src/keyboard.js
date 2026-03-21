// src/keyboard.js — CONFUsynth v3
// Simplified graphical keyboard: Q-P · A-L · Z-M · SPACE
// Q-P = permanent page nav + record
// A-L = sequencer steps 1-9 (pattern) / white piano notes (sound, roll)
// Z-M = sequencer steps 10-16     (pattern) / black piano notes (sound, roll)
// Space = play / pause

// ─── Note offsets ─────────────────────────────────────────────────────────────
// A row = white notes starting C4
// Z row = black notes (sharps) starting C#4

export const NOTE_KEY_OFFSETS = {
  KeyA: 0,  KeyS: 2,  KeyD: 4,  KeyF: 5,  KeyG: 7,
  KeyH: 9,  KeyJ: 11, KeyK: 12, KeyL: 14,          // white: C D E F G A B C' D'
  KeyZ: 1,  KeyX: 3,  KeyC: 6,  KeyV: 8,  KeyB: 10,
  KeyN: 13, KeyM: 15,                                // black: C# D# F# G# A# C#' D#'
};

export const PAGE_KEYS = {
  KeyQ: 'pattern', KeyW: 'piano-roll', KeyE: 'sound',
  KeyR: 'mixer',   KeyT: 'fx',         KeyY: 'scenes',
  KeyU: 'banks',   KeyI: 'arranger',   KeyO: 'settings',
};

export const STEP_KEYS = [
  'KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL', // 1-9
  'KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM',               // 10-16
];

// ─── Keyboard rows (simplified — only letters + space) ────────────────────────
// pad = left-offset in key-units to simulate keyboard stagger

const QWERTY_ROWS = [
  {
    cls: 'qrow-fn',
    pad: 0,
    keys: [
      { code:'KeyQ', cap:'Q', w:1 }, { code:'KeyW', cap:'W', w:1 },
      { code:'KeyE', cap:'E', w:1 }, { code:'KeyR', cap:'R', w:1 },
      { code:'KeyT', cap:'T', w:1 }, { code:'KeyY', cap:'Y', w:1 },
      { code:'KeyU', cap:'U', w:1 }, { code:'KeyI', cap:'I', w:1 },
      { code:'KeyO', cap:'O', w:1 }, { code:'KeyP', cap:'P', w:1 },
    ],
  },
  {
    cls: 'qrow-home',
    pad: 0.55,
    keys: [
      { code:'KeyA', cap:'A', w:1 }, { code:'KeyS', cap:'S', w:1 },
      { code:'KeyD', cap:'D', w:1 }, { code:'KeyF', cap:'F', w:1 },
      { code:'KeyG', cap:'G', w:1 }, { code:'KeyH', cap:'H', w:1 },
      { code:'KeyJ', cap:'J', w:1 }, { code:'KeyK', cap:'K', w:1 },
      { code:'KeyL', cap:'L', w:1 },
    ],
  },
  {
    cls: 'qrow-bot',
    pad: 1.3,
    keys: [
      { code:'KeyZ', cap:'Z', w:1 }, { code:'KeyX', cap:'X', w:1 },
      { code:'KeyC', cap:'C', w:1 }, { code:'KeyV', cap:'V', w:1 },
      { code:'KeyB', cap:'B', w:1 }, { code:'KeyN', cap:'N', w:1 },
      { code:'KeyM', cap:'M', w:1 },
    ],
  },
  {
    cls: 'qrow-space',
    pad: 0.55,
    keys: [
      { code:'Space', cap:'SPACE', w: 9 },
    ],
  },
];

// ─── Key role definitions per page ────────────────────────────────────────────

const PAGE_NAV = {
  KeyQ:{ role:'page',      hint:'PATN'  }, KeyW:{ role:'page',      hint:'ROLL'  },
  KeyE:{ role:'page',      hint:'SOUND' }, KeyR:{ role:'page',      hint:'MIX'   },
  KeyT:{ role:'page',      hint:'FX'    }, KeyY:{ role:'page',      hint:'SCENE' },
  KeyU:{ role:'page',      hint:'BANKS' }, KeyI:{ role:'page',      hint:'ARR'   },
  KeyO:{ role:'page',      hint:'SET'   }, KeyP:{ role:'record',    hint:'REC'   },
  Space:{ role:'play',     hint:'PLAY'  },
  KeyZ:{ role:'oct-shift', hint:'Oct-'  }, KeyX:{ role:'oct-shift', hint:'Oct+'  },
};

const NOTE_ROLES = {
  KeyA:{ role:'note',       hint:'C'    }, KeyS:{ role:'note',       hint:'D'   },
  KeyD:{ role:'note',       hint:'E'    }, KeyF:{ role:'note',       hint:'F'   },
  KeyG:{ role:'note',       hint:'G'    }, KeyH:{ role:'note',       hint:'A'   },
  KeyJ:{ role:'note',       hint:'B'    }, KeyK:{ role:'note',       hint:"C'"  },
  KeyL:{ role:'note',       hint:"D'"   },
  KeyZ:{ role:'oct-shift',  hint:'Oct-' }, KeyX:{ role:'oct-shift',  hint:'Oct+' },
  KeyC:{ role:'note-black', hint:'F#'   }, KeyV:{ role:'note-black', hint:'G#'  },
  KeyB:{ role:'note-black', hint:'A#'   }, KeyN:{ role:'note-black', hint:"C#'" },
  KeyM:{ role:'note-black', hint:"D#'"  },
};

const KEY_ROLES = {
  pattern: {
    ...PAGE_NAV,
    KeyA:{ role:'step', hint:'1'  }, KeyS:{ role:'step', hint:'2'  },
    KeyD:{ role:'step', hint:'3'  }, KeyF:{ role:'step', hint:'4'  },
    KeyG:{ role:'step', hint:'5'  }, KeyH:{ role:'step', hint:'6'  },
    KeyJ:{ role:'step', hint:'7'  }, KeyK:{ role:'step', hint:'8'  },
    KeyL:{ role:'step', hint:'9'  },
    KeyZ:{ role:'step', hint:'10' }, KeyX:{ role:'step', hint:'11' },
    KeyC:{ role:'step', hint:'12' }, KeyV:{ role:'step', hint:'13' },
    KeyB:{ role:'step', hint:'14' }, KeyN:{ role:'step', hint:'15' },
    KeyM:{ role:'step', hint:'16' },
  },
  'piano-roll': { ...PAGE_NAV, ...NOTE_ROLES },
  sound:        { ...PAGE_NAV, ...NOTE_ROLES },
  mixer: {
    ...PAGE_NAV,
    KeyA:{ role:'track', hint:'TRK1' }, KeyS:{ role:'track', hint:'TRK2' },
    KeyD:{ role:'track', hint:'TRK3' }, KeyF:{ role:'track', hint:'TRK4' },
    KeyG:{ role:'track', hint:'TRK5' }, KeyH:{ role:'track', hint:'TRK6' },
    KeyJ:{ role:'track', hint:'TRK7' }, KeyK:{ role:'track', hint:'TRK8' },
    KeyL:{ role:'util',  hint:'MUTE' }, KeyM:{ role:'util',  hint:'SOLO' },
  },
  fx:       { ...PAGE_NAV },
  scenes: {
    ...PAGE_NAV,
    KeyA:{ role:'scene', hint:'SCN1' }, KeyS:{ role:'scene', hint:'SCN2' },
    KeyD:{ role:'scene', hint:'SCN3' }, KeyF:{ role:'scene', hint:'SCN4' },
    KeyG:{ role:'scene', hint:'SCN5' }, KeyH:{ role:'scene', hint:'SCN6' },
    KeyJ:{ role:'scene', hint:'SCN7' }, KeyK:{ role:'scene', hint:'SCN8' },
    KeyL:{ role:'util',  hint:'SNAP' },
  },
  banks: {
    ...PAGE_NAV,
    KeyA:{ role:'util', hint:'BNK A' }, KeyS:{ role:'util', hint:'BNK B' },
    KeyD:{ role:'util', hint:'BNK C' }, KeyF:{ role:'util', hint:'BNK D' },
    KeyG:{ role:'util', hint:'BNK E' }, KeyH:{ role:'util', hint:'BNK F' },
    KeyJ:{ role:'util', hint:'BNK G' }, KeyK:{ role:'util', hint:'BNK H' },
  },
  arranger: { ...PAGE_NAV },
  settings: { ...PAGE_NAV },
};

// ─── Graphical keyboard renderer ──────────────────────────────────────────────

// 1 key-unit ≈ key-width + gap. Used to calculate row stagger padding.
const KEY_UNIT = 46; // px  (key ~43px + 3px gap)

export function renderKbdContext(containerEl, page, activeKeys = new Set()) {
  containerEl.innerHTML = '';

  const roles = KEY_ROLES[page] || {};
  const kb = document.createElement('div');
  kb.className = 'qwerty-keyboard';

  QWERTY_ROWS.forEach(({ cls, pad, keys }) => {
    const rowEl = document.createElement('div');
    rowEl.className = `qwerty-row ${cls}`;

    // Left stagger spacer
    if (pad > 0) {
      const spacer = document.createElement('div');
      spacer.className = 'qkey-spacer';
      spacer.style.flexBasis = `${pad * KEY_UNIT}px`;
      spacer.style.flexShrink = '0';
      rowEl.append(spacer);
    }

    keys.forEach(({ code, cap, w }) => {
      const keyEl = document.createElement('div');
      const roleInfo = roles[code];
      const role = roleInfo?.role || 'idle';
      const hint = roleInfo?.hint || '';

      keyEl.className = `qwerty-key role-${role}`;
      keyEl.style.flexGrow = w;
      keyEl.style.flexBasis = `${w * (KEY_UNIT - 3)}px`;
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
  const totalWhites = octaves.length * WHITE_SEMITONES.length;

  octaves.forEach(oct => {
    WHITE_SEMITONES.forEach(semi => {
      const midi = (oct + 1) * 12 + semi;
      const k = document.createElement('div');
      k.className = 'piano-white' + (active.has(midi) ? ' lit' : '');
      k.dataset.midi = midi;
      if (midi % 12 === 0) {  // C notes
        k.textContent = 'C' + (Math.floor(midi / 12) - 1);
        k.style.fontSize = '0.38rem';
        k.style.paddingTop = 'auto';
        k.style.display = 'flex';
        k.style.alignItems = 'flex-end';
        k.style.justifyContent = 'center';
        k.style.paddingBottom = '2px';
        k.style.color = 'rgba(0,0,0,0.4)';
        k.style.fontFamily = 'var(--font-mono)';
      }
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
  window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    emit('key:down', { code: e.code });

    // Q-O → page navigation (no modifier)
    if (PAGE_KEYS[e.code] && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      emit('page:set', { page: PAGE_KEYS[e.code] });
      return;
    }

    // P → record toggle
    if (e.code === 'KeyP' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      emit('transport:record');
      return;
    }

    // Space → play / pause
    if (e.code === 'Space') {
      e.preventDefault();
      emit('transport:toggle');
      return;
    }

    // Ctrl/Cmd shortcuts (copy/paste work across all pages)
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyC') { e.preventDefault(); emit('pattern:copy');  return; }
      if (e.code === 'KeyV') { e.preventDefault(); emit('pattern:paste'); return; }
    }

    const page = state.currentPage;

    // Pattern page: A-M = step toggles
    if (page === 'pattern') {
      const stepIdx = STEP_KEYS.indexOf(e.code);
      if (stepIdx >= 0) {
        if (e.altKey)        emit('step:plockMode', { stepIndex: stepIdx });
        else if (e.shiftKey) emit('step:toggle',    { stepIndex: stepIdx, shiftKey: true });
        else                 emit('step:toggle',    { stepIndex: stepIdx, shiftKey: false });
        return;
      }
    }

    // Z / X → octave shift (global, except on pattern page where they are step keys)
    if (page !== 'pattern') {
      if (e.code === 'KeyZ') { e.preventDefault(); emit('octave:shift', { delta: -1 }); return; }
      if (e.code === 'KeyX') { e.preventDefault(); emit('octave:shift', { delta: +1 }); return; }
    }

    // Sound / piano-roll: A-M = note preview
    if (page === 'piano-roll' || page === 'sound') {
      const offset = NOTE_KEY_OFFSETS[e.code];
      if (offset != null) {
        emit('note:preview', { note: 60 + (state.octaveShift ?? 0) * 12 + offset });
        return;
      }
    }

    // Mixer: A-K = select track, L = mute, M = solo
    if (page === 'mixer') {
      const MIXER_TRACK_KEYS = ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK'];
      const ti = MIXER_TRACK_KEYS.indexOf(e.code);
      if (ti >= 0) { emit('track:select', { trackIndex: ti }); return; }
      if (e.code === 'KeyL') { emit('track:mute', { trackIndex: state.selectedTrackIndex }); return; }
      if (e.code === 'KeyM') { emit('track:solo', { trackIndex: state.selectedTrackIndex }); return; }
    }

    // Banks: A-K = select bank A-H
    if (page === 'banks') {
      const BANK_KEYS = ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK'];
      const bi = BANK_KEYS.indexOf(e.code);
      if (bi >= 0) { emit('bank:select', { bankIndex: bi }); return; }
    }
  });

  window.addEventListener('keyup', (e) => {
    emit('key:up', { code: e.code });
    const offset = NOTE_KEY_OFFSETS[e.code];
    if (offset != null) {
      emit('note:off', { note: 60 + (state.octaveShift ?? 0) * 12 + offset });
    }
  });
}
