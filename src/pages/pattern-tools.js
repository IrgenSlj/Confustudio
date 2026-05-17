// src/pages/pattern-tools.js — Shared utilities extracted from pattern.js

// ─── Genre-aware randomize probability tables ─────────────────────────────────
// Each genre defines per-track step-probability arrays for 16 steps.
// Track order convention (0-based): 0=kick, 1=snare, 2=hihat, 3=clap, 4-7=other
// Values are multipliers applied on top of the global density (0-1).
// A value of 1 means "use full density", 0 means "never active".
const GENRE_WEIGHTS = {
  // Straight 4-on-the-floor kick, snare on 2&4, 8th-note hats, sparse perc
  drums: [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // kick: quarter notes
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // snare: beats 2 & 4
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // hihat: all 8th notes (dense)
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0], // clap
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], // perc 1
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], // perc 2
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], // perc 3
    [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], // perc 4
  ],
  // House: 4-on-floor kick, offbeat hats, snare on 3, open hats on upbeats
  house: [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // kick: 4-on-the-floor
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // snare: beat 3
    [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], // closed hihat: offbeats
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0], // open hihat
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], // clap/snap
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], // shaker
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // perc
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], // cymbal
  ],
  // Techno: dense kick, sparse snare, driving hats
  techno: [
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // kick: every 2nd 16th
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // snare: beat 3
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // hihat: all 16ths
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1], // clap/rimshot
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], // perc 1
    [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], // perc 2
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0], // perc 3
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // ride/accent
  ],
  // Jazz: swing-feel, hi-hat on 2&4, brushy snare, sparse kick
  jazz: [
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], // kick: beats 1 & 3
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // snare: 2 & 4
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], // ride: straight swing pattern
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // hihat: beat 2 accent
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // hihat: beat 4 accent
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], // brush swirl
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // ghost note
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], // crash
  ],
  // Latin: clave-based patterns, congas, timbales
  latin: [
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], // kick: son clave-ish
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // snare/timbale: 2 & 4
    [1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0], // hihat/shaker
    [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0], // clave (son)
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], // conga low
    [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], // conga high
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0], // cowbell
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], // guiro
  ],
  // Random: uniform (all weights = 1)
  random: null,
};

// Return a flat array of per-step probability weights for a given track index and genre.
// Steps beyond 16 wrap around the base pattern.
function getGenreStepWeights(genre, trackIndex, numSteps) {
  const table = GENRE_WEIGHTS[genre];
  if (!table) return Array(numSteps).fill(1); // 'random' / unknown → uniform
  const trackWeights = table[Math.min(trackIndex, table.length - 1)];
  const base = trackWeights.length; // 16
  return Array.from({ length: numSteps }, (_, i) => trackWeights[i % base]);
}

// ─── Note name helper ─────────────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiToNoteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

// ─── Euclidean rhythm generator (Bjorklund algorithm) ────────────────────────
function euclidean(beats, steps) {
  if (beats <= 0) return Array(steps).fill(false);
  if (beats >= steps) return Array(steps).fill(true);
  beats = Math.min(beats, steps);
  const pattern = [];
  const counts = [];
  const remainders = [];
  let divisor = steps - beats;
  remainders.push(beats);
  let level = 0;
  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
  }
  counts.push(divisor);
  function build(lv) {
    if (lv === -1) {
      pattern.push(false);
    } else if (lv === -2) {
      pattern.push(true);
    } else {
      for (let i = 0; i < counts[lv]; i++) build(lv - 1);
      if (remainders[lv] !== 0) build(lv - 2);
    }
  }
  build(level);
  return pattern.slice(0, steps);
}

const PLOCK_PARAMS = [
  { label: 'Cutoff', param: 'cutoff', min: 80, max: 16000, step: 10 },
  { label: 'Decay', param: 'decay', min: 0.01, max: 2, step: 0.01 },
  { label: 'Pitch', param: 'pitch', min: 0, max: 127, step: 1 },
  { label: 'Drive', param: 'drive', min: 0, max: 1, step: 0.01 },
  { label: 'Vol', param: 'volume', min: 0, max: 1, step: 0.01 },
];

const STEP_CONDITIONS = [
  { value: 'always', label: 'Always' },
  { value: '1st', label: '1st loop' },
  { value: 'not1st', label: 'Skip 1st' },
  { value: 'every2', label: 'Every 2' },
  { value: 'every3', label: 'Every 3' },
  { value: 'every4', label: 'Every 4' },
  { value: 'random', label: 'Random' },
  { value: 'fill', label: 'Fill only' },
  { value: 'not_fill', label: 'Not Fill' },
];

export { GENRE_WEIGHTS, getGenreStepWeights, NOTE_NAMES, midiToNoteName, euclidean, PLOCK_PARAMS, STEP_CONDITIONS };
