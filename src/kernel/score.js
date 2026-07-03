// CONFUstudio — CS-Score: a lossless, line-oriented text notation for patterns.
//
// Phase B6 (code brief §3.5). CS-Score is the agent's textual substrate for
// pattern work: compact, diffable, human-readable, and a lossless projection of
// the musical model. This module is PURE — no DOM, no Web Audio, no globals —
// so it is fully unit-testable and round-trip-provable.
//
//   parseScore(text)      → { ok:true, pattern } | { ok:false, errors }
//   emitScore(pattern)    → canonical CS-Score text
//   normalizeScore(text)  → canonical text (parse + re-emit)
//   noteNameToMidi(name)  → MIDI number | null
//   midiToNoteName(midi)  → note-name string
//
// The parser is TOLERANT: malformed input never throws — it returns structured,
// actionable errors ({ line, col, message, hint }) because the errors are agent
// feedback. See docs/CS_SCORE.md for the full grammar spec.

// ─── Types (the CS-Score "pattern fragment") ──────────────────────────────────

/**
 * Header metadata. `len` is the canonical pattern length (step count); the rest
 * are optional and only emitted when present.
 * @typedef {Object} ScoreMeta
 * @property {string} [bank]
 * @property {number} [pattern]
 * @property {number} [bpm]
 * @property {number} len
 * @property {number} [swing]
 */

/**
 * One step in a CS-Score track. A projection of the model {@link import('./types.js').Step}:
 * `active`/`note`/`accent`/`velocity`/`paramLocks`/`trigCondition` map 1:1; `ghost`
 * (the low-velocity `x` symbol) and `slide` (per-step glide, CS-ACID) are surfaced
 * as explicit flags so the notation round-trips losslessly.
 * @typedef {Object} ScoreStep
 * @property {boolean} active
 * @property {boolean} ghost
 * @property {boolean} accent
 * @property {boolean} slide
 * @property {number|null} note  MIDI note, or null to inherit the track pitch
 * @property {number} velocity   0–1 (derived convenience field; not used by emit)
 * @property {string} trigCondition
 * @property {Object.<string, number>} paramLocks
 */

/**
 * One track block: identity, track-level defaults (`p:` fields), and its steps.
 * @typedef {Object} ScoreTrack
 * @property {number} index               1-based track number as written (T1 → 1)
 * @property {string} name
 * @property {Object.<string, number>} defaults  p:-field defaults (vel|prob|gate)
 * @property {ScoreStep[]} steps
 */

/**
 * A parsed CS-Score pattern fragment. p-lock lanes are folded into their track's
 * steps' `paramLocks` on parse and reconstructed as `L` lanes on emit.
 * @typedef {Object} ScorePattern
 * @property {ScoreMeta} meta
 * @property {ScoreTrack[]} tracks
 */

/**
 * A structured, actionable parse error (agent feedback, never thrown).
 * @typedef {Object} ScoreError
 * @property {number} line     1-based line number
 * @property {number} col      1-based column
 * @property {string} message
 * @property {string} hint
 */

/**
 * The result of {@link parseScore}: `ok` plus either `pattern` (success) or
 * `errors` (failure). Kept as one shape so TS narrowing stays simple.
 * @typedef {Object} ScoreParseResult
 * @property {boolean} ok
 * @property {ScorePattern} [pattern]
 * @property {ScoreError[]} [errors]
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_VELOCITY = 1;
const GHOST_VELOCITY = 0.35;

/** Allowlisted `p:` track-default keys (all numeric). */
const DEFAULT_KEYS = new Set(['vel', 'prob', 'gate']);

/** Non-ratio trig conditions (see event-compiler.js). Ratios (A:B) are matched separately. */
const TRIG_CONDITIONS = new Set([
  'always',
  '1st',
  'not1st',
  'every2',
  'every3',
  'every4',
  'random',
  'fill',
  'not_fill',
]);

/** Aliases accepted on input, canonicalized to the tokens above. */
const TRIG_ALIASES = {
  first: '1st',
  not_first: 'not1st',
  notfirst: 'not1st',
  'not:first': 'not1st',
};

// ─── Note-name ⇄ MIDI (C-1 = 0 … G9 = 127; C4 = middle-C = 60) ─────────────────

const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** @type {Object.<string, number>} */
const LETTER_PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Parse a note name (e.g. `C2`, `D#3`, `Gb-1`) to a MIDI note number.
 * Accepts sharps (`#`) and flats (`b`); octave may be negative. Returns null for
 * anything unparseable or out of the 0–127 MIDI range.
 * @param {string} name
 * @returns {number|null}
 */
export function noteNameToMidi(name) {
  if (typeof name !== 'string') return null;
  const match = /^\s*([A-Ga-g])([#b]?)(-?\d+)\s*$/.exec(name);
  if (!match) return null;
  const pc = LETTER_PITCH_CLASS[match[1].toUpperCase()];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number(match[3]);
  const midi = (octave + 1) * 12 + pc + accidental;
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
  return midi;
}

/**
 * Render a MIDI note number as a canonical note name (sharps, e.g. `C#4`).
 * @param {number} midi
 * @returns {string}
 */
export function midiToNoteName(midi) {
  const value = Math.round(Number(midi));
  if (!Number.isFinite(value)) return '';
  const clamped = Math.max(0, Math.min(127, value));
  const octave = Math.floor(clamped / 12) - 1;
  return PITCH_CLASS_NAMES[clamped % 12] + octave;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

/** @param {number} n */
function fmtNum(n) {
  return String(Number(n));
}

/**
 * Split a raw line into content and trailing comment. A comment starts at the
 * first `#` that is at column 0 or preceded by whitespace — so `#` inside a note
 * name (e.g. `D#2`) is never mistaken for a comment.
 * @param {string} line
 * @returns {{ content: string, comment: string }}
 */
function splitComment(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return { content: line.slice(0, i), comment: line.slice(i) };
    }
  }
  return { content: line, comment: '' };
}

/**
 * Canonicalize a trig-condition token, or null if invalid.
 * @param {string} raw
 * @returns {string|null}
 */
function canonicalizeCondition(raw) {
  const token = String(raw).trim();
  const lower = token.toLowerCase();
  if (TRIG_CONDITIONS.has(lower)) return lower;
  if (TRIG_ALIASES[lower]) return TRIG_ALIASES[lower];
  if (/^\d+:\d+$/.test(token)) return token;
  return null;
}

// ─── Lexers (grid cells) ──────────────────────────────────────────────────────

/**
 * @typedef {Object} TrigToken
 * @property {'rest'|'trig'|'ghost'|'note'} kind
 * @property {number} [note]
 * @property {number} col
 */

/**
 * Lex a trig grid (the text between `|…|`) into one token per step. Whitespace is
 * skipped, so agents may space cells out for readability. Note names lex as a
 * single token (`C2..D#2` → C2, ., ., D#2).
 * @param {string} raw
 * @param {number} line
 * @param {number} colOffset  0-based column of `raw[0]` within its line
 * @returns {{ tokens: TrigToken[], errors: ScoreError[] }}
 */
function lexTrigGrid(raw, line, colOffset) {
  /** @type {TrigToken[]} */
  const tokens = [];
  /** @type {ScoreError[]} */
  const errors = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    const col = colOffset + i + 1;
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '.') {
      tokens.push({ kind: 'rest', col });
      i++;
      continue;
    }
    if (ch === 'X') {
      tokens.push({ kind: 'trig', col });
      i++;
      continue;
    }
    if (ch === 'x') {
      tokens.push({ kind: 'ghost', col });
      i++;
      continue;
    }
    if (/[A-Ga-g]/.test(ch)) {
      const noteMatch = /^[A-Ga-g][#b]?-?\d+/.exec(raw.slice(i));
      if (!noteMatch) {
        errors.push({
          line,
          col,
          message: `Note "${ch}" is missing an octave`,
          hint: 'Write notes as letter + octave, e.g. C2, D#3, or Gb-1.',
        });
        i++;
        continue;
      }
      const midi = noteNameToMidi(noteMatch[0]);
      if (midi == null) {
        errors.push({
          line,
          col,
          message: `Note "${noteMatch[0]}" is out of MIDI range`,
          hint: 'Notes must fall within C-1..G9 (MIDI 0..127).',
        });
        i += noteMatch[0].length;
        continue;
      }
      tokens.push({ kind: 'note', note: midi, col });
      i += noteMatch[0].length;
      continue;
    }
    errors.push({
      line,
      col,
      message: `Unknown step symbol "${ch}"`,
      hint: 'Valid step symbols are X (trig), x (ghost), . (rest), or a note like C2.',
    });
    i++;
  }
  return { tokens, errors };
}

/**
 * @typedef {Object} LaneToken
 * @property {'empty'|'value'} kind
 * @property {number} [value]
 * @property {number} col
 */

/**
 * Lex a p-lock lane grid into one token per step. Cells are either `.` (no lock)
 * or a number; whitespace separates them.
 * @param {string} raw
 * @param {number} line
 * @param {number} colOffset
 * @returns {{ tokens: LaneToken[], errors: ScoreError[] }}
 */
function lexLaneGrid(raw, line, colOffset) {
  /** @type {LaneToken[]} */
  const tokens = [];
  /** @type {ScoreError[]} */
  const errors = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    const col = colOffset + i + 1;
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '.') {
      tokens.push({ kind: 'empty', col });
      i++;
      continue;
    }
    if (ch === '-' || /\d/.test(ch)) {
      const numMatch = /^-?\d+(\.\d+)?/.exec(raw.slice(i));
      if (!numMatch || numMatch[0] === '-') {
        errors.push({
          line,
          col,
          message: `Invalid lane value near "${raw.slice(i, i + 6)}"`,
          hint: 'Lane cells are numbers (e.g. 46 or 0.5) or "." for no lock.',
        });
        i++;
        continue;
      }
      tokens.push({ kind: 'value', value: Number(numMatch[0]), col });
      i += numMatch[0].length;
      continue;
    }
    errors.push({
      line,
      col,
      message: `Unknown lane symbol "${ch}"`,
      hint: 'Lane cells are numbers (e.g. 46 or 0.5) or "." for no lock.',
    });
    i++;
  }
  return { tokens, errors };
}

// ─── Header ───────────────────────────────────────────────────────────────────

/**
 * Extract header metadata from a `#` line. All fields are optional.
 * @param {string} text  the comment line (leading `#` included)
 * @param {ScoreMeta} meta  mutated in place
 * @returns {boolean}  whether any known field was found
 */
function parseHeader(text, meta) {
  let found = false;
  const bank = /\bbank\s+(\S+)/i.exec(text);
  if (bank) {
    meta.bank = bank[1];
    found = true;
  }
  const pattern = /\bpattern\s+(\d+)/i.exec(text);
  if (pattern) {
    meta.pattern = Number(pattern[1]);
    found = true;
  }
  const bpm = /(\d+(?:\.\d+)?)\s*bpm/i.exec(text) || /\bbpm\s+(\d+(?:\.\d+)?)/i.exec(text);
  if (bpm) {
    meta.bpm = Number(bpm[1]);
    found = true;
  }
  const len = /\blen\s+(\d+)/i.exec(text);
  if (len) {
    meta.len = Number(len[1]);
    found = true;
  }
  const swing = /\bswing\s+(\d+(?:\.\d+)?)/i.exec(text);
  if (swing) {
    meta.swing = Number(swing[1]);
    found = true;
  }
  return found;
}

// ─── Raw line structures (pre-resolution) ─────────────────────────────────────

/**
 * @typedef {Object} RawTrack
 * @property {number} line
 * @property {number} index
 * @property {string} name
 * @property {TrigToken[]} tokens
 * @property {number} barCol
 * @property {Object.<string, number>} defaults
 * @property {number[]} slideSteps
 * @property {number[]} accentSteps
 * @property {Array<{ step: number, cond: string }>} conditions
 */

/**
 * @typedef {Object} RawLane
 * @property {number} line
 * @property {number} trackIndex
 * @property {string} param
 * @property {LaneToken[]} tokens
 */

/**
 * Parse the `p:`/`s:`/`a:`/`c:` modifiers after a track's bar.
 * @param {string} raw
 * @param {number} line
 * @param {number} colOffset
 * @param {RawTrack} track  mutated in place
 * @param {ScoreError[]} errors
 */
function parseModifiers(raw, line, colOffset, track, errors) {
  const trimmed = raw.trim();
  if (trimmed === '') return;
  for (const tok of trimmed.split(/\s+/)) {
    const col = colOffset + Math.max(0, raw.indexOf(tok)) + 1;
    const match = /^([A-Za-z]+):(.+)$/.exec(tok);
    if (!match) {
      errors.push({
        line,
        col,
        message: `Unrecognized modifier "${tok}"`,
        hint: 'Modifiers are p:key=val, s:step, a:step, or c:step=cond.',
      });
      continue;
    }
    const prefix = match[1].toLowerCase();
    const rest = match[2];
    if (prefix === 'p') {
      const kv = /^([A-Za-z]+)=(-?\d+(?:\.\d+)?)$/.exec(rest);
      if (!kv || !DEFAULT_KEYS.has(kv[1].toLowerCase())) {
        errors.push({
          line,
          col,
          message: `Invalid track default "${tok}"`,
          hint: `Use p:key=number with key one of ${[...DEFAULT_KEYS].join(', ')} (e.g. p:vel=0.6).`,
        });
        continue;
      }
      track.defaults[kv[1].toLowerCase()] = Number(kv[2]);
    } else if (prefix === 's' || prefix === 'a') {
      // s:3, s:3=slide, s:3,7 — the optional "=word" tag is decorative.
      const spec = rest.includes('=') ? rest.slice(0, rest.indexOf('=')) : rest;
      const list = spec.split(',').map((s) => Number(s));
      if (list.some((n) => !Number.isInteger(n) || n < 1)) {
        errors.push({
          line,
          col,
          message: `Invalid step list in "${tok}"`,
          hint: `${prefix}: takes 1-based step numbers, e.g. ${prefix}:3 or ${prefix}:3,7.`,
        });
        continue;
      }
      const bucket = prefix === 's' ? track.slideSteps : track.accentSteps;
      for (const step of list) bucket.push(step);
    } else if (prefix === 'c') {
      const cm = /^(\d+)=(.+)$/.exec(rest);
      if (!cm) {
        errors.push({
          line,
          col,
          message: `Invalid trig condition "${tok}"`,
          hint: 'Use c:step=cond, e.g. c:9=3:4 or c:5=every4.',
        });
        continue;
      }
      const cond = canonicalizeCondition(cm[2]);
      if (cond == null) {
        errors.push({
          line,
          col,
          message: `Unknown trig condition "${cm[2]}"`,
          hint: 'Valid: always, 1st, not1st, every2|3|4, A:B (e.g. 3:4), random, fill, not_fill.',
        });
        continue;
      }
      track.conditions.push({ step: Number(cm[1]), cond });
    } else {
      errors.push({
        line,
        col,
        message: `Unknown modifier prefix "${prefix}:"`,
        hint: 'Valid prefixes are p: s: a: c:.',
      });
    }
  }
}

// ─── parseScore ───────────────────────────────────────────────────────────────

/**
 * Parse CS-Score text into a normalized pattern fragment. Tolerant: never throws;
 * malformed input yields `{ ok:false, errors }`.
 * @param {string} text
 * @returns {ScoreParseResult}
 */
export function parseScore(text) {
  /** @type {ScoreError[]} */
  const errors = [];
  try {
    /** @type {ScoreMeta} */
    const meta = { len: 0 };
    let headerParsed = false;
    let lenFromHeader = false;
    /** @type {RawTrack[]} */
    const rawTracks = [];
    /** @type {RawLane[]} */
    const rawLanes = [];

    const lines = String(text ?? '').split(/\r?\n/);
    for (let li = 0; li < lines.length; li++) {
      const lineNo = li + 1;
      const rawLine = lines[li];
      const trimmed = rawLine.trim();
      if (trimmed === '') continue;

      // Header / comment lines.
      if (trimmed.startsWith('#')) {
        if (!headerParsed) {
          if (parseHeader(trimmed, meta)) {
            headerParsed = true;
            if (/\blen\s+\d+/i.test(trimmed)) lenFromHeader = true;
          }
        }
        continue;
      }

      const { content } = splitComment(rawLine);
      const body = content.trim();
      if (body === '') continue;

      const trackMatch = /^(\s*)T(\d+)/.exec(content);
      const laneMatch = /^(\s*)L(\s|$)/.exec(content);

      if (trackMatch) {
        const index = Number(trackMatch[2]);
        const open = content.indexOf('|');
        const close = open >= 0 ? content.indexOf('|', open + 1) : -1;
        if (open < 0 || close < 0) {
          errors.push({
            line: lineNo,
            col: open < 0 ? 1 : open + 1,
            message: `Track T${index} is missing its |…| bar`,
            hint: 'Wrap the step grid in pipes, e.g. T1 kick |X...X...X...X...|.',
          });
          continue;
        }
        const idEnd = trackMatch[0].length;
        const name = content.slice(idEnd, open).trim();
        const barRaw = content.slice(open + 1, close);
        const { tokens, errors: gridErrors } = lexTrigGrid(barRaw, lineNo, open + 1);
        errors.push(...gridErrors);
        /** @type {RawTrack} */
        const track = {
          line: lineNo,
          index,
          name,
          tokens,
          barCol: open + 1,
          defaults: {},
          slideSteps: [],
          accentSteps: [],
          conditions: [],
        };
        parseModifiers(content.slice(close + 1), lineNo, close + 1, track, errors);
        rawTracks.push(track);
        continue;
      }

      if (laneMatch) {
        const afterL = content.slice(laneMatch[0].length - (laneMatch[2] === '' ? 0 : 1));
        const open = content.indexOf('|');
        const close = open >= 0 ? content.indexOf('|', open + 1) : -1;
        const specText = open >= 0 ? content.slice(laneMatch[0].length, open).trim() : afterL.trim();
        const specMatch = /^T(\d+)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(specText);
        if (!specMatch) {
          errors.push({
            line: lineNo,
            col: 1,
            message: `Invalid p-lock lane target "${specText}"`,
            hint: 'Lane targets look like Ttrack.param, e.g. L T3.cutoff |…|.',
          });
          continue;
        }
        if (open < 0 || close < 0) {
          errors.push({
            line: lineNo,
            col: open < 0 ? 1 : open + 1,
            message: `p-lock lane ${specText} is missing its |…| bar`,
            hint: 'Wrap the value grid in pipes, e.g. L T3.cutoff |. . 46 . 62 .|.',
          });
          continue;
        }
        const barRaw = content.slice(open + 1, close);
        const { tokens, errors: laneErrors } = lexLaneGrid(barRaw, lineNo, open + 1);
        errors.push(...laneErrors);
        rawLanes.push({
          line: lineNo,
          trackIndex: Number(specMatch[1]),
          param: specMatch[2],
          tokens,
        });
        continue;
      }

      errors.push({
        line: lineNo,
        col: 1,
        message: `Unrecognized line "${body.slice(0, 24)}"`,
        hint: 'Lines are a # header, a T<n> track, or an L p-lock lane.',
      });
    }

    // Resolve pattern length.
    const len = lenFromHeader ? meta.len : rawTracks[0] ? rawTracks[0].tokens.length : 0;
    meta.len = len;

    if (rawTracks.length === 0) {
      errors.push({
        line: 1,
        col: 1,
        message: 'Score contains no tracks',
        hint: 'Add at least one T<n> track line, e.g. T1 kick |X...X...X...X...|.',
      });
    }

    // Validate bar widths.
    for (const track of rawTracks) {
      if (track.tokens.length !== len) {
        errors.push({
          line: track.line,
          col: track.barCol + 1,
          message: `Track T${track.index} has ${track.tokens.length} steps, expected ${len}`,
          hint: `Every bar must have ${len} steps (pad with "." rests).`,
        });
      }
    }
    for (const lane of rawLanes) {
      if (lane.tokens.length !== len) {
        errors.push({
          line: lane.line,
          col: 1,
          message: `Lane T${lane.trackIndex}.${lane.param} has ${lane.tokens.length} steps, expected ${len}`,
          hint: `Every bar must have ${len} steps (pad with "." for no lock).`,
        });
      }
    }

    // Build tracks/steps.
    /** @type {ScoreTrack[]} */
    const tracks = rawTracks.map((raw) => {
      /** @type {ScoreStep[]} */
      const steps = Array.from({ length: len }, () => ({
        active: false,
        ghost: false,
        accent: false,
        slide: false,
        note: /** @type {number|null} */ (null),
        velocity: 0,
        trigCondition: 'always',
        paramLocks: /** @type {Object.<string, number>} */ ({}),
      }));
      raw.tokens.forEach((tok, i) => {
        if (i >= len) return;
        const step = steps[i];
        if (tok.kind === 'trig') {
          step.active = true;
        } else if (tok.kind === 'ghost') {
          step.active = true;
          step.ghost = true;
        } else if (tok.kind === 'note') {
          step.active = true;
          step.note = tok.note ?? null;
        }
      });
      const applyStepFlag = (/** @type {number[]} */ list, /** @type {string} */ flag, /** @type {string} */ label) => {
        for (const step of list) {
          if (step < 1 || step > len) {
            errors.push({
              line: raw.line,
              col: 1,
              message: `${label} references step ${step}, out of range 1..${len}`,
              hint: `Step numbers are 1-based and must be within the ${len}-step bar.`,
            });
            continue;
          }
          if (flag === 'slide') steps[step - 1].slide = true;
          else steps[step - 1].accent = true;
        }
      };
      applyStepFlag(raw.slideSteps, 'slide', 'Slide (s:)');
      applyStepFlag(raw.accentSteps, 'accent', 'Accent (a:)');
      for (const { step, cond } of raw.conditions) {
        if (step < 1 || step > len) {
          errors.push({
            line: raw.line,
            col: 1,
            message: `Trig condition references step ${step}, out of range 1..${len}`,
            hint: `Step numbers are 1-based and must be within the ${len}-step bar.`,
          });
          continue;
        }
        steps[step - 1].trigCondition = cond;
      }
      // Resolve derived velocities.
      const defaultVel = raw.defaults.vel ?? DEFAULT_VELOCITY;
      for (const step of steps) {
        if (step.active) step.velocity = step.ghost ? GHOST_VELOCITY : defaultVel;
      }
      return { index: raw.index, name: raw.name, defaults: raw.defaults, steps };
    });

    // Fold p-lock lanes into their track's steps.
    for (const lane of rawLanes) {
      const track = tracks.find((t) => t.index === lane.trackIndex);
      if (!track) {
        errors.push({
          line: lane.line,
          col: 1,
          message: `p-lock lane targets unknown track T${lane.trackIndex}`,
          hint: 'Add the track before its lane, e.g. a T3 line before L T3.cutoff.',
        });
        continue;
      }
      lane.tokens.forEach((tok, i) => {
        if (i >= len) return;
        if (tok.kind === 'value' && tok.value != null) {
          track.steps[i].paramLocks[lane.param] = tok.value;
        }
      });
    }

    if (errors.length > 0) {
      errors.sort((a, b) => a.line - b.line || a.col - b.col);
      return { ok: false, errors };
    }
    return { ok: true, pattern: { meta, tracks } };
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          col: 1,
          message: `Unexpected parse failure: ${err instanceof Error ? err.message : String(err)}`,
          hint: 'This is a parser bug — please report the input that triggered it.',
        },
      ],
    };
  }
}

// ─── emitScore ────────────────────────────────────────────────────────────────

/**
 * Render the grid symbol for a step: "." rest, "x" ghost, note name, or "X" trig.
 * @param {ScoreStep} step
 * @returns {string}
 */
function stepToSymbol(step) {
  if (!step.active) return '.';
  if (step.note != null) return midiToNoteName(step.note);
  if (step.ghost) return 'x';
  return 'X';
}

/**
 * Build the canonical modifier suffix (p:/s:/a:/c:) for a track.
 * @param {ScoreTrack} track
 * @returns {string}
 */
function buildModifiers(track) {
  const parts = [];
  const defaults = track.defaults || {};
  for (const key of Object.keys(defaults).sort()) {
    parts.push(`p:${key}=${fmtNum(defaults[key])}`);
  }
  const slide = [];
  const accent = [];
  const conditions = [];
  track.steps.forEach((step, i) => {
    const n = i + 1;
    if (step.slide) slide.push(n);
    if (step.accent) accent.push(n);
    if (step.trigCondition && step.trigCondition !== 'always') {
      conditions.push(`c:${n}=${step.trigCondition}`);
    }
  });
  if (slide.length) parts.push(`s:${slide.join(',')}`);
  if (accent.length) parts.push(`a:${accent.join(',')}`);
  parts.push(...conditions);
  return parts.join(' ');
}

/**
 * Reconstruct p-lock lane lines for a track (one per locked param, sorted).
 * @param {ScoreTrack} track
 * @returns {string[]}
 */
function buildLanes(track) {
  /** @type {Set<string>} */
  const params = new Set();
  for (const step of track.steps) {
    for (const key of Object.keys(step.paramLocks || {})) params.add(key);
  }
  return [...params].sort().map((param) => {
    const cells = track.steps.map((step) => {
      const locks = step.paramLocks || {};
      return Object.prototype.hasOwnProperty.call(locks, param) ? fmtNum(locks[param]) : '.';
    });
    return `L T${track.index}.${param} |${cells.join(' ')}|`;
  });
}

/**
 * Emit canonical CS-Score text for a pattern fragment. Exact inverse of
 * {@link parseScore} for the representable subset.
 * @param {ScorePattern} pattern
 * @returns {string}
 */
export function emitScore(pattern) {
  const meta = (pattern && pattern.meta) || /** @type {ScoreMeta} */ ({ len: 0 });
  const tracks = (pattern && pattern.tracks) || [];
  const len = meta.len ?? (tracks[0] ? tracks[0].steps.length : 0);

  const headerParts = [];
  if (meta.bank != null) headerParts.push(`bank ${meta.bank}`);
  if (meta.pattern != null) headerParts.push(`pattern ${meta.pattern}`);
  if (meta.bpm != null) headerParts.push(`${fmtNum(meta.bpm)}bpm`);
  headerParts.push(`len ${len}`);
  if (meta.swing != null) headerParts.push(`swing ${fmtNum(meta.swing)}%`);

  const lines = [`# ${headerParts.join(' · ')}`];
  for (const track of tracks) {
    const grid = track.steps.map(stepToSymbol).join('');
    const mods = buildModifiers(track);
    lines.push(`T${track.index} ${track.name} |${grid}|${mods ? ` ${mods}` : ''}`);
    lines.push(...buildLanes(track));
  }
  return lines.join('\n');
}

// ─── normalizeScore ───────────────────────────────────────────────────────────

/**
 * Canonical form: parse then re-emit. Returns the canonical string on success,
 * or the tolerant `{ ok:false, errors }` shape on failure.
 * @param {string} text
 * @returns {string | ScoreParseResult}
 */
export function normalizeScore(text) {
  const result = parseScore(text);
  if (result.ok && result.pattern) return emitScore(result.pattern);
  return result;
}
