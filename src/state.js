// CONFUsynth v3 — state.js
// Central state module: project structure, accessors, persistence

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORAGE_KEY   = "confusynth-v3";
export const STEP_COUNT    = 64;
export const TRACK_COUNT   = 8;
export const BANK_COUNT    = 8;
export const PATTERN_COUNT = 16;
export const PROB_LEVELS   = [1, 0.75, 0.5, 0.25];

export const TRACK_COLORS = [
  '#f0c640', // amber  — T1
  '#5add71', // green  — T2
  '#67d7ff', // sky    — T3
  '#ff8c52', // orange — T4
  '#c67dff', // violet — T5
  '#ff6eb4', // pink   — T6
  '#40e0d0', // teal   — T7
  '#f05b52', // red    — T8
];

// ─── Factory: Step ────────────────────────────────────────────────────────────

export function createStep(stepIndex, trackIndex) {
  return {
    active:        (stepIndex + trackIndex) % 5 === 0,
    accent:        stepIndex % 8 === 4,
    note:          60,
    velocity:      1,
    probability:   1,
    trigCondition: "always",  // "always"|"fill"|"first"|"not:first"|"1:2"|"1:4"|"3:4"
    paramLocks:    {},
    microTime:     0,         // -0.5 to +0.5, fraction of one step duration
    gate:          0.5,       // 0.05–1.0, fraction of step duration for note gate
  };
}

// ─── Factory: Track ───────────────────────────────────────────────────────────

export function createTrack(index) {
  const panAlt  = index % 2 === 0 ? -0.15 : 0.15;
  const isMidi  = index >= 8;

  // Build default steps array (STEP_COUNT entries)
  const steps = Array.from({ length: STEP_COUNT }, (_, si) =>
    createStep(si, index)
  );

  return {
    // Identity
    name:         `Track ${index + 1}`,
    machine:      isMidi ? "midi" : "tone", // "tone"|"noise"|"sample"|"midi"|"plaits"|"clouds"|"rings"
    isMidi,

    // Sound
    waveform:     "triangle",
    volume:       0.72,
    pan:          panAlt,
    pitch:        48 + index * 2,
    attack:       0.005,
    decay:        0.28 + index * 0.03,
    noteLength:   0.6,
    cutoff:       3200 - index * 180,
    resonance:    1.8,
    drive:        0.18,
    delaySend:    0.24,
    reverbSend:   0.18,
    lfoRate:      2,
    lfoDepth:     0,
    lfoTarget:    "cutoff",

    // MIDI
    midiChannel:  index + 1,
    midiPort:     null,

    // Per-track length (0 = follow pattern.length)
    trackLength:  0,

    // Per-track swing (null = use global state.swing)
    swing:        null,

    // Mixer
    mute:         false,
    solo:         false,

    // Per-track FX
    filterType:   "lowpass",  // "lowpass"|"bandpass"|"highpass"
    bitDepth:     16,         // 1–16, integer
    srDiv:        1,          // 1–32, sample rate reduction divisor

    // Plaits multi-engine synth
    plEngine:    0,
    plTimbre:    0.5,
    plHarmonics: 0.5,
    plMorph:     0.5,

    // Clouds granular
    clPosition: 0.5,
    clSize:     0.3,
    clDensity:  0.5,
    clTexture:  0.5,

    // Rings modal resonator
    rnStructure:  0.5,
    rnBrightness: 0.7,
    rnDamping:    0.7,
    rnExciter:    0,

    // Arpeggiator
    arpEnabled: false,
    arpMode:    'up',
    arpRange:   1,
    arpSpeed:   1,

    // Runtime (not serialized)
    sampleBuffer: null,

    // Scene defaults (crossfader endpoints)
    sceneA: {
      cutoff:    2200,
      decay:     0.22,
      delaySend: 0.1,
    },
    sceneB: {
      cutoff:    6400,
      decay:     0.8,
      delaySend: 0.45,
    },

    // Steps
    steps,
  };
}

// ─── Factory: Pattern ─────────────────────────────────────────────────────────

function createPattern(patternIndex) {
  return {
    name:   `Pattern ${String(patternIndex + 1).padStart(2, "0")}`,
    length: 16,   // 1–64 steps
    kit: {
      tracks: Array.from({ length: TRACK_COUNT }, (_, ti) => createTrack(ti)),
    },
  };
}

// ─── Factory: Bank ────────────────────────────────────────────────────────────

function createBank(bankIndex) {
  const letter = String.fromCharCode(65 + bankIndex); // A–H
  return {
    name:     `Bank ${letter}`,
    patterns: Array.from({ length: PATTERN_COUNT }, (_, pi) =>
      createPattern(pi)
    ),
  };
}

// ─── Factory: Scene ───────────────────────────────────────────────────────────

function createScene(sceneIndex) {
  const letter = String.fromCharCode(65 + sceneIndex); // A–H
  return {
    name:   `Scene ${letter}`,
    tracks: Array.from({ length: TRACK_COUNT }, () => ({
      cutoff:    3200,
      decay:     0.28,
      delaySend: 0.24,
      pitch:     60,
      volume:    0.72,
    })),
  };
}

// ─── Factory: Project ─────────────────────────────────────────────────────────

export function createProject() {
  return {
    name:  "New Project",
    banks: Array.from({ length: BANK_COUNT }, (_, bi) => createBank(bi)),
  };
}

// ─── Factory: full appState ───────────────────────────────────────────────────

export function createAppState() {
  return {
    // Audio (runtime only)
    audioContext: null,
    engine:       null,

    // Navigation
    currentPage:        "pattern",
    activeBank:         0,
    activePattern:      0,
    selectedTrackIndex: 0,

    // Playback
    isPlaying:          false,
    isRecording:        false,
    currentStep:        -1,
    arrangementMode:    false,
    arrangementCursor:  0,

    // Global parameters (flat, knob-accessible)
    bpm:           122,
    swing:         0.0,
    patternLength: 16,
    euclidBeats:   4,
    patternShift:  0,
    defaultProb:   1,
    trigMode:      0,
    masterLevel:   0.82,

    // FX globals
    delayTime:     0.28,
    delayFeedback: 0.38,
    reverbSize:    1.8,
    reverbMix:     0.22,
    reverbDamping: 0.5,
    masterDrive:   0,
    lfoRate:       2,
    lfoDepth:      0,

    // Settings
    midiChannel:   1,
    metronome:     false,
    abletonLink:   false,
    clockMode:     0,
    midiClockOut:  false,
    clockSource:   "internal",

    // Pattern editing
    octaveShift:       0,
    copyBuffer:        null,
    tapTimes:          [],
    activeKeyboardKey: null,
    keyboardVelocity:  1.0,
    chordMode:         'off',
    humanizeAmount:    0.2,

    // Scenes / crossfader
    crossfader: 0,
    sceneA:     0,  // index of scene slot at crossfader A end
    sceneB:     1,  // index of scene slot at crossfader B end
    scenes:     Array.from({ length: 8 }, (_, i) => createScene(i)),

    // Scene auto-morph
    sceneMorphActive: false,
    sceneMorphBars:   4,

    // Arranger
    arranger: [],   // [{sceneIdx, bars, bpmOverride, timeSignature, name}]
    arrLoop:      false,
    arrLoopStart: 0,
    arrLoopEnd:   0,

    // Project
    project: createProject(),
  };
}

// ─── Accessors ────────────────────────────────────────────────────────────────

export function getActivePattern(state) {
  return state.project.banks[state.activeBank].patterns[state.activePattern];
}

export function getActiveTrack(state) {
  return getActivePattern(state).kit.tracks[state.selectedTrackIndex];
}

export function getActiveStep(state, stepIdx) {
  return getActiveTrack(state).steps[stepIdx];
}

// ─── Mutators ─────────────────────────────────────────────────────────────────

/**
 * Set a param-lock value on a step.
 * applyParamLock(state, stepIdx, "cutoff", 800)
 */
export function applyParamLock(state, stepIdx, param, value) {
  const step = getActiveStep(state, stepIdx);
  step.paramLocks[param] = value;
}

/**
 * Merge params into a scene's per-track slot.
 * setScene(state, 0, 2, { cutoff: 1200, decay: 0.5 })
 */
export function setScene(state, sceneIdx, trackIdx, params) {
  const scene = state.scenes[sceneIdx];
  if (!scene) return;
  Object.assign(scene.tracks[trackIdx], params);
}

// ─── Scene interpolation ──────────────────────────────────────────────────────

const INTERPOLATED_PARAMS = ["cutoff", "decay", "delaySend", "pitch", "volume"];

/**
 * Blend sceneA and sceneB at the current crossfader position (0–1).
 * Returns an array of 8 merged param objects, one per track.
 */
export function interpolateScenes(state) {
  const { sceneA, sceneB, crossfader, scenes } = state;
  const sA = scenes[sceneA];
  const sB = scenes[sceneB];
  const t  = Math.max(0, Math.min(1, crossfader));

  return Array.from({ length: TRACK_COUNT }, (_, ti) => {
    const tA = (sA && sA.tracks[ti]) || {};
    const tB = (sB && sB.tracks[ti]) || {};
    const merged = {};
    for (const param of INTERPOLATED_PARAMS) {
      const a = tA[param] ?? 0;
      const b = tB[param] ?? 0;
      merged[param] = a + (b - a) * t;
    }
    return merged;
  });
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function stripRuntime(state) {
  // Deep-clone the serializable parts; exclude AudioBuffers and runtime refs.
  const plain = {
    ...state,
    audioContext: null,
    engine:       null,
    project: {
      ...state.project,
      banks: state.project.banks.map(bank => ({
        ...bank,
        patterns: bank.patterns.map(pat => ({
          ...pat,
          kit: {
            ...pat.kit,
            tracks: pat.kit.tracks.map(track => {
              const { sampleBuffer, ...rest } = track; // drop AudioBuffer
              return rest;
            }),
          },
        })),
      })),
    },
  };
  return plain;
}

let _saveTimer = null;

/**
 * Debounced (400 ms) localStorage write.
 */
export function saveState(state) {
  if (_saveTimer !== null) {
    clearTimeout(_saveTimer);
  }
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try {
      const serializable = stripRuntime(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (err) {
      console.warn("[CONFUsynth] saveState failed:", err);
    }
  }, 400);
}

/**
 * Load state from localStorage.
 * Tries STORAGE_KEY first; falls back to "confusynth-v2" (legacy track import).
 * Returns a full appState or null.
 */
export function loadState() {
  // ── Try v3 ──
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Restore sampleBuffer = null on all tracks (was stripped on save)
      if (parsed.project && parsed.project.banks) {
        for (const bank of parsed.project.banks) {
          for (const pat of bank.patterns) {
            for (const track of pat.kit.tracks) {
              track.sampleBuffer = null;
            }
          }
        }
      }
      // Merge into a fresh appState so any new fields are present
      const fresh = createAppState();
      return deepMerge(fresh, parsed);
    }
  } catch (err) {
    console.warn("[CONFUsynth] loadState v3 failed:", err);
  }

  // ── Try v2 legacy (import tracks from first pattern only) ──
  try {
    const raw = localStorage.getItem("confusynth-v2");
    if (raw) {
      const legacy = JSON.parse(raw);
      const state  = createAppState();
      // v2 stored a flat tracks array at top level or under state.tracks
      const legacyTracks = legacy.tracks || (legacy.state && legacy.state.tracks);
      if (Array.isArray(legacyTracks)) {
        const target = state.project.banks[0].patterns[0].kit.tracks;
        legacyTracks.slice(0, TRACK_COUNT).forEach((lt, i) => {
          Object.assign(target[i], lt, { sampleBuffer: null });
        });
      }
      return state;
    }
  } catch (err) {
    console.warn("[CONFUsynth] loadState v2 legacy import failed:", err);
  }

  return null;
}

// ─── Utility: deep merge (plain objects only) ─────────────────────────────────

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return source !== undefined ? source : target;
  }
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal  = source[key];
    const tgtVal  = target[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}
