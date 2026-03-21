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

// ─── Scale intervals ──────────────────────────────────────────────────────────

const SCALE_INTERVALS = [
  null,              // Chromatic = all
  [0,2,4,5,7,9,11], // Major
  [0,2,3,5,7,8,10], // Minor
  [0,2,4,7,9],      // Pent Maj
  [0,3,5,7,10],     // Pent Min
  [0,2,3,5,7,9,10], // Dorian
  [0,3,5,6,7,10],   // Blues
];

// ─── Chord voicings ───────────────────────────────────────────────────────────

export const CHORD_VOICINGS = {
  off:  [],
  maj:  [4, 7],
  min:  [3, 7],
  pwr:  [7, 12],
  dom7: [4, 7, 10],
  min7: [3, 7, 10],
};

// ─── Graphical keyboard renderer ──────────────────────────────────────────────

// 1 key-unit ≈ key-width + gap. Used to calculate row stagger padding.
const KEY_UNIT = 46; // px  (key ~43px + 3px gap)

export function renderKbdContext(containerEl, page, activeKeys = new Set(), state = null, getActiveTrackFn = null) {
  // Cancel any running arp rAF before wiping innerHTML
  containerEl.querySelectorAll('.arp-dots-row').forEach(el => {
    if (typeof el._arpCancel === 'function') el._arpCancel();
  });
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

  // Chord mode bar + HOLD button (sound / piano-roll pages)
  if (state && ['sound', 'piano-roll'].includes(page)) {
    const chordBar = document.createElement('div');
    chordBar.className = 'kbd-chord-bar';
    Object.keys(CHORD_VOICINGS).forEach(mode => {
      const btn = document.createElement('button');
      btn.className = 'kbd-chord-btn' + ((state.chordMode ?? 'off') === mode ? ' active' : '');
      btn.textContent = mode.toUpperCase();
      btn.addEventListener('click', () => {
        state.chordMode = mode;
        renderKbdContext(containerEl, page, activeKeys, state, getActiveTrackFn);
      });
      chordBar.append(btn);
    });

    // HOLD toggle
    const holdBtn = document.createElement('button');
    holdBtn.className = 'kbd-chord-btn kbd-hold-btn' + (state.keyboardHold ? ' active' : '');
    holdBtn.textContent = 'HOLD';
    holdBtn.title = 'Sustain notes until re-pressed';
    holdBtn.addEventListener('click', () => {
      state.keyboardHold = !state.keyboardHold;
      if (!state.keyboardHold) {
        state._heldNotes?.forEach(note => _emit?.('note:off', { note }));
        state._heldNotes = new Set();
      }
      renderKbdContext(containerEl, page, activeKeys, state, getActiveTrackFn);
    });
    chordBar.append(holdBtn);

    // SPLIT toggle
    const splitBtn = document.createElement('button');
    splitBtn.className = 'kbd-chord-btn kbd-split-btn' + (state.splitKeyboard ? ' active' : '');
    splitBtn.textContent = 'SPLIT';
    splitBtn.title = 'Split keyboard: left half → track A, right half → track B';
    splitBtn.addEventListener('click', () => {
      state.splitKeyboard = !state.splitKeyboard;
      renderKbdContext(containerEl, page, activeKeys, state, getActiveTrackFn);
    });
    chordBar.append(splitBtn);

    containerEl.append(chordBar);

    // ── Octave indicator + TOUCH toggle row ──────────────────────────────────
    const infoBar = document.createElement('div');
    infoBar.className = 'kbd-info-bar';

    // Octave indicator
    const octWrap = document.createElement('div');
    octWrap.className = 'kbd-oct-indicator';

    const octMinus = document.createElement('button');
    octMinus.className = 'kbd-oct-btn';
    octMinus.textContent = '−';
    octMinus.title = 'Octave down (Z)';
    octMinus.addEventListener('click', () => {
      state.octaveShift = Math.max(-4, (state.octaveShift ?? 0) - 1);
      _emit?.('octave:shift', { delta: -1 });
      _updateOctDisplay(octDisplay, state);
    });

    const octDisplay = document.createElement('span');
    octDisplay.className = 'kbd-oct-display';
    _updateOctDisplay(octDisplay, state);

    const octPlus = document.createElement('button');
    octPlus.className = 'kbd-oct-btn';
    octPlus.textContent = '+';
    octPlus.title = 'Octave up (X)';
    octPlus.addEventListener('click', () => {
      state.octaveShift = Math.min(4, (state.octaveShift ?? 0) + 1);
      _emit?.('octave:shift', { delta: +1 });
      _updateOctDisplay(octDisplay, state);
    });

    octWrap.append(octMinus, octDisplay, octPlus);
    infoBar.append(octWrap);

    // TOUCH velocity toggle
    const touchBtn = document.createElement('button');
    touchBtn.className = 'kbd-chord-btn kbd-touch-btn' + (state.touchVelocity ? ' active' : '');
    touchBtn.textContent = 'TOUCH';
    touchBtn.title = 'Y position within key sets velocity (top=127, bottom=40)';
    touchBtn.addEventListener('click', () => {
      state.touchVelocity = !state.touchVelocity;
      touchBtn.classList.toggle('active', state.touchVelocity);
    });
    infoBar.append(touchBtn);

    containerEl.append(infoBar);

    // ── Arp pattern visualizer (only when arp is on) ─────────────────────────
    const track = getActiveTrackFn?.();
    if (track?.arpEnabled) {
      const arpVis = buildArpVisualizer(state, _TRACK_COLORS, getActiveTrackFn);
      containerEl.append(arpVis);
    }
  }
}

function _updateOctDisplay(el, state) {
  const oct = 4 + (state.octaveShift ?? 0);
  el.textContent = `OCT ${oct}`;
}

// Internal reference to emit, set by initKeyboard
let _emit = null;
// Track colors reference, set by initKeyboard
let _TRACK_COLORS = [];

// ─── Arp pattern visualizer ────────────────────────────────────────────────────

// Track active rAF handles keyed by containerEl so we can cancel on re-render
const _arpRafHandles = new WeakMap();

function startArpVisualizer(dotsRow, state, getActiveTrackFn) {
  let rafId = null;

  function tick() {
    const track = getActiveTrackFn();
    if (!track || !track.arpEnabled) return; // stop if arp toggled off
    if (!dotsRow.isConnected) return;         // element removed from DOM

    const arpIdx   = state._arpIdx ?? 0;
    const dotEls   = dotsRow.querySelectorAll('.arp-dot');
    dotEls.forEach((dot, i) => {
      const isCurrent = (i === arpIdx % dotEls.length);
      dot.classList.toggle('arp-dot-current', isCurrent);
    });

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  return () => { if (rafId !== null) cancelAnimationFrame(rafId); };
}

function buildArpVisualizer(state, TRACK_COLORS, getActiveTrackFn) {
  const track = getActiveTrackFn();
  const color = TRACK_COLORS[state.selectedTrackIndex] ?? '#f0c640';

  // Number of dots: clamp between 4 and 8 based on arpRange
  const range = track?.arpRange ?? 1;
  const dotCount = Math.min(8, Math.max(4, range * 4));

  const wrap = document.createElement('div');
  wrap.className = 'arp-visualizer';

  const label = document.createElement('span');
  label.className = 'arp-vis-label';
  label.textContent = 'ARP';
  wrap.append(label);

  const modeLabel = document.createElement('span');
  modeLabel.className = 'arp-vis-mode';
  modeLabel.textContent = (track?.arpMode ?? 'up').toUpperCase();
  wrap.append(modeLabel);

  const dotsRow = document.createElement('div');
  dotsRow.className = 'arp-dots-row';

  for (let i = 0; i < dotCount; i++) {
    const dot = document.createElement('div');
    dot.className = 'arp-dot';
    dot.style.setProperty('--arp-color', color);
    dotsRow.append(dot);
  }
  wrap.append(dotsRow);

  const cancel = startArpVisualizer(dotsRow, state, getActiveTrackFn);
  // Store cancel fn on the element so it can be stopped if needed
  dotsRow._arpCancel = cancel;

  return wrap;
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

  const scaleIdx = state?.scale ?? 0;
  const intervals = SCALE_INTERVALS[scaleIdx] ?? null;

  // Split keyboard: derive tint colors
  const splitActive  = state.splitKeyboard;
  const splitL = state.splitTrackLeft  ?? 0;
  const splitR = state.splitTrackRight ?? 1;
  const splitColorL = _TRACK_COLORS[splitL] ?? '#f0c640';
  const splitColorR = _TRACK_COLORS[splitR] ?? '#67d7ff';

  octaves.forEach(oct => {
    WHITE_SEMITONES.forEach(semi => {
      const midi = (oct + 1) * 12 + semi;
      const k = document.createElement('div');
      k.className = 'piano-white' + (active.has(midi) ? ' lit' : '');
      k.dataset.midi = midi;
      k.dataset.octave = String(oct);

      // Split keyboard tint (applied via inline style so it can stack with scale classes)
      if (splitActive) {
        const col = midi < 60 ? splitColorL : splitColorR;
        k.style.background = `linear-gradient(180deg, ${col}22 0%, ${col}11 100%), linear-gradient(180deg, #e0d8c8 0%, #cec6b4 70%, #beb6a4 100%)`;
      }

      // Scale highlighting
      if (intervals) {
        const pc = midi % 12;
        if (intervals.includes(pc)) k.classList.add('scale-note');
        else                        k.classList.add('out-of-scale');
      }

      if (midi % 12 === 0) {  // C notes
        k.style.position = 'relative';
        const label = document.createElement('span');
        label.textContent = 'C' + (Math.floor(midi / 12) - 1);
        label.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:0.38rem;color:rgba(0,0,0,0.4);font-family:var(--font-mono);pointer-events:none;';
        k.append(label);

        const dot = document.createElement('span');
        dot.className = 'key-root-dot';
        dot.style.background = scaleIdx > 0 && intervals?.includes(0) ? 'var(--accent)' : '#888';
        k.append(dot);
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
      k.dataset.octave = String(oct);

      // Split keyboard tint for black keys
      if (splitActive) {
        const col = midi < 60 ? splitColorL : splitColorR;
        k.style.background = `linear-gradient(180deg, ${col}44 0%, ${col}22 100%), linear-gradient(180deg, #282420 0%, #1a1814 60%, #0e0c0a 100%)`;
      }

      // Scale highlighting for black keys
      if (intervals) {
        const pc = midi % 12;
        if (intervals.includes(pc)) k.classList.add('scale-note');
        else                        k.classList.add('out-of-scale');
      }
      const ww = 100 / totalWhites;
      k.style.left = `${(oi * 7 + gap - 0.3) * ww}%`;
      wrapper.append(k);
    });
  });

  const pianoContainer = document.createElement('div');
  pianoContainer.className = 'piano-container';
  pianoContainer.append(wrapper);

  const velBar = document.createElement('div');
  velBar.className = 'kbd-vel-bar';
  velBar.innerHTML = `
    <label class="kbd-vel-label">VEL</label>
    <input type="range" class="kbd-vel-slider" min="0.05" max="1" step="0.01" value="${state.keyboardVelocity ?? 1}">
    <span class="kbd-vel-val">${Math.round((state.keyboardVelocity ?? 1) * 100)}</span>
  `;
  velBar.querySelector('input').addEventListener('input', e => {
    state.keyboardVelocity = parseFloat(e.target.value);
    velBar.querySelector('span').textContent = Math.round(state.keyboardVelocity * 100);
  });
  pianoContainer.append(velBar);

  containerEl.append(pianoContainer);
}

export function lightPianoKey(containerEl, midi, lit = true) {
  containerEl.querySelectorAll(`[data-midi="${midi}"]`).forEach(el => {
    el.classList.toggle('lit', lit);
  });
}

// ─── Piano touch handler ───────────────────────────────────────────────────────

export function initPianoTouch(pianoContainerEl, state, emit) {
  // Delegate touch/mouse events from the piano-wrapper
  const wrapper = pianoContainerEl.querySelector('.piano-wrapper');
  if (!wrapper) return;

  function _getVelocityFromTouch(touch, keyEl) {
    // Prefer force if available and non-zero (iOS/Force Touch)
    if (touch.force != null && touch.force > 0) {
      return Math.max(0.05, Math.min(1, touch.force));
    }
    // Fall back to Y position within key: top=1.0, bottom=0.3
    if (state.touchVelocity) {
      const rect = keyEl.getBoundingClientRect();
      const relY = (touch.clientY - rect.top) / rect.height;
      return Math.max(0.3, Math.min(1, 1 - relY * 0.7));
    }
    return state.keyboardVelocity ?? 1;
  }

  function _midiFromEl(el) {
    const midi = parseInt(el.dataset.midi, 10);
    return isNaN(midi) ? null : midi;
  }

  function _resolveTrack(midi) {
    if (!state.splitKeyboard) return null; // use current selected track
    return midi < 60 ? (state.splitTrackLeft ?? 0) : (state.splitTrackRight ?? 1);
  }

  function _triggerNote(keyEl, touch) {
    const midi = _midiFromEl(keyEl);
    if (midi == null) return;
    const velocity = _getVelocityFromTouch(touch, keyEl);
    const voicing = CHORD_VOICINGS[state.chordMode ?? 'off'] ?? [];
    const trackOverride = _resolveTrack(midi);

    const prevTrack = state.selectedTrackIndex;
    if (trackOverride != null) state.selectedTrackIndex = trackOverride;

    emit('note:preview', { note: midi, velocity });
    voicing.forEach(offset => {
      const n = midi + offset;
      if (n >= 0 && n <= 127) emit('note:preview', { note: n, velocity });
    });

    if (trackOverride != null) state.selectedTrackIndex = prevTrack;

    keyEl.classList.add('lit');
    keyEl._touchActive = true;
  }

  function _releaseNote(keyEl) {
    const midi = _midiFromEl(keyEl);
    if (midi == null) return;
    const voicing = CHORD_VOICINGS[state.chordMode ?? 'off'] ?? [];
    emit('note:off', { note: midi });
    voicing.forEach(offset => {
      const n = midi + offset;
      if (n >= 0 && n <= 127) emit('note:off', { note: n });
    });
    keyEl.classList.remove('lit');
    keyEl._touchActive = false;
  }

  wrapper.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const keyEl = el?.closest('.piano-white, .piano-black');
      if (keyEl) {
        keyEl._touchId = touch.identifier;
        _triggerNote(keyEl, touch);
      }
    }
  }, { passive: false });

  wrapper.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const newKey = el?.closest('.piano-white, .piano-black');
      // Find old key for this touch id
      const oldKey = wrapper.querySelector(`[data-touch-id="${touch.identifier}"]`);
      if (oldKey && oldKey !== newKey) {
        _releaseNote(oldKey);
        oldKey.removeAttribute('data-touch-id');
      }
      if (newKey && newKey !== oldKey) {
        newKey.setAttribute('data-touch-id', touch.identifier);
        _triggerNote(newKey, touch);
      }
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const keyEl = wrapper.querySelector(`[data-touch-id="${touch.identifier}"]`);
      if (keyEl) {
        _releaseNote(keyEl);
        keyEl.removeAttribute('data-touch-id');
      } else {
        // fallback: find by _touchId property
        wrapper.querySelectorAll('.piano-white, .piano-black').forEach(k => {
          if (k._touchId === touch.identifier) {
            _releaseNote(k);
            k._touchId = null;
          }
        });
      }
    }
  }, { passive: false });

  wrapper.addEventListener('touchcancel', (e) => {
    wrapper.querySelectorAll('.piano-white.lit, .piano-black.lit').forEach(k => _releaseNote(k));
  }, { passive: false });
}

// ─── Global keyboard handler ───────────────────────────────────────────────────

export function initKeyboard(state, emit, trackColors = []) {
  _emit = emit;
  if (trackColors.length) _TRACK_COLORS = trackColors;

  // Initialize split keyboard defaults
  if (state.splitKeyboard    === undefined) state.splitKeyboard    = false;
  if (state.splitTrackLeft   === undefined) state.splitTrackLeft   = 0;
  if (state.splitTrackRight  === undefined) state.splitTrackRight  = 1;
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
      // Ctrl+Up/Down → velocity adjust
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        state.keyboardVelocity = Math.min(1, Math.round(((state.keyboardVelocity ?? 1) + 0.1) * 100) / 100);
        emit('keyboard:velocityChange', { velocity: state.keyboardVelocity });
        return;
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        state.keyboardVelocity = Math.max(0.05, Math.round(((state.keyboardVelocity ?? 1) - 0.1) * 100) / 100);
        emit('keyboard:velocityChange', { velocity: state.keyboardVelocity });
        return;
      }
    }

    const page = state.currentPage;

    // Pattern page: A-M = step toggles (unless step-record mode, where they become note keys)
    if (page === 'pattern' && !state.stepRecordMode) {
      const stepIdx = STEP_KEYS.indexOf(e.code);
      if (stepIdx >= 0) {
        if (e.altKey)        emit('step:plockMode', { stepIndex: stepIdx });
        else if (e.shiftKey) emit('step:toggle',    { stepIndex: stepIdx, shiftKey: true });
        else                 emit('step:toggle',    { stepIndex: stepIdx, shiftKey: false });
        const btns = document.querySelectorAll(`.step-btn[data-step="${stepIdx}"]`);
        btns.forEach(b => {
          b.classList.add('step-trigger-flash');
          setTimeout(() => b.classList.remove('step-trigger-flash'), 100);
        });
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
        const midiNote = 60 + (state.octaveShift ?? 0) * 12 + offset;
        const velocity = state.keyboardVelocity ?? 1;
        const voicing = CHORD_VOICINGS[state.chordMode ?? 'off'] ?? [];

        // Split keyboard: temporarily redirect to appropriate track
        let _splitPrevTrack = null;
        if (state.splitKeyboard) {
          _splitPrevTrack = state.selectedTrackIndex;
          state.selectedTrackIndex = midiNote < 60
            ? (state.splitTrackLeft  ?? 0)
            : (state.splitTrackRight ?? 1);
        }

        if (state.keyboardHold) {
          state._heldNotes = state._heldNotes ?? new Set();
          if (state._heldNotes.has(midiNote)) {
            state._heldNotes.delete(midiNote);
            emit('note:off', { note: midiNote });
            voicing.forEach(chordOffset => {
              const chordNote = midiNote + chordOffset;
              if (chordNote >= 0 && chordNote <= 127) {
                state._heldNotes.delete(chordNote);
                emit('note:off', { note: chordNote });
              }
            });
          } else {
            state._heldNotes.add(midiNote);
            emit('note:preview', { note: midiNote, velocity });
            voicing.forEach(chordOffset => {
              const chordNote = midiNote + chordOffset;
              if (chordNote >= 0 && chordNote <= 127) {
                state._heldNotes.add(chordNote);
                emit('note:preview', { note: chordNote, velocity });
              }
            });
          }
        } else {
          emit('note:preview', { note: midiNote, velocity });
          voicing.forEach(chordOffset => {
            const chordNote = midiNote + chordOffset;
            if (chordNote >= 0 && chordNote <= 127)
              emit('note:preview', { note: chordNote, velocity });
          });
        }

        // Restore track after split
        if (_splitPrevTrack != null) state.selectedTrackIndex = _splitPrevTrack;

        // Step record: write note to cursor step on any page with note keys active
        if (state.stepRecordMode) {
          emit('step:record', { note: midiNote, velocity });
        }
        return;
      }
    }

    // Pattern page + step record mode: note keys write directly to cursor step
    if (page === 'pattern' && state.stepRecordMode) {
      const offset = NOTE_KEY_OFFSETS[e.code];
      if (offset != null) {
        const midiNote = 60 + (state.octaveShift ?? 0) * 12 + offset;
        const velocity = state.keyboardVelocity ?? 1;
        emit('note:preview', { note: midiNote, velocity });
        emit('step:record',  { note: midiNote, velocity });
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
    if (offset != null && !state.keyboardHold) {
      const midiNote = 60 + (state.octaveShift ?? 0) * 12 + offset;
      const voicing = CHORD_VOICINGS[state.chordMode ?? 'off'] ?? [];
      emit('note:off', { note: midiNote });
      voicing.forEach(chordOffset => {
        const chordNote = midiNote + chordOffset;
        if (chordNote >= 0 && chordNote <= 127)
          emit('note:off', { note: chordNote });
      });
    }
  });
}
