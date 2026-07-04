// CONFUstudio harness — Tool Registry (Phase B1)
//
// The single source of truth for what the agent can DO. Every tool compiles to
// a plain command object handled by `executeStudioCommand` in
// ../../command-bus.js — the SAME command bus the UI uses. There is no private
// path: the agent edits state exactly the way a click does.
//
// This module is PURE (no DOM, no Web Audio, no globals) so the whole tool
// surface is unit-testable and can generate provider tool schemas + the manual.
//
// Each descriptor:
//   name        agent-facing verb (snake_case)
//   summary     one line the model reads to choose the tool
//   category    grouping for docs/UI
//   stations    which of the three stations may call it (guardrail surface)
//   mutating    true = changes the project; false = read-only
//   parameters  JSON-Schema (validated by ./schema.js)
//   build(args) validated args -> command object for the command bus
//   example     canonical args, used by tests + docs

import { validate } from './schema.js';

/** The three harness stations (CONFUSTUDIO_AI_BRIEF §"one harness, three stations"). */
export const STATIONS = {
  SESSION_ARTIST: 'session-artist',
  STUDIO_MASTER: 'studio-master',
  CO_PERFORMER: 'co-performer',
};
const ALL_STATIONS = Object.values(STATIONS);

// Per-parameter safe ranges for set_track_param. The raw command bus does NOT
// clamp track params, so the tool layer enforces musical guardrails here —
// clamping at compile time keeps the agent from writing a 999 kHz cutoff.
const TRACK_PARAM_RANGES = {
  volume: [0, 1],
  pan: [-1, 1],
  cutoff: [20, 20000],
  resonance: [0.1, 20],
  drive: [0, 1],
  attack: [0, 2],
  decay: [0, 4],
  noteLength: [0, 4],
  delaySend: [0, 1],
  reverbSend: [0, 1],
  lfoRate: [0, 40],
  lfoDepth: [0, 1],
  filterQ: [0.1, 20],
  eqLow: [-12, 12],
  eqMid: [-12, 12],
  eqHigh: [-12, 12],
  stereoWidth: [0, 2],
  inputGain: [0, 2],
  sidechainAmount: [0, 1],
};
const TRACK_PARAM_NAMES = Object.keys(TRACK_PARAM_RANGES);

const TRACK_INDEX = { type: 'integer', minimum: 0, maximum: 7, description: 'Track index (0–7).' };
const STEP_INDEX = { type: 'integer', minimum: 0, maximum: 63, description: 'Step index (0–63).' };

function clampToRange(value, [min, max]) {
  return Math.max(min, Math.min(max, value));
}

/** @type {Array<object>} */
export const TOOLS = [
  // ── Transport & project ──────────────────────────────────────────────
  {
    name: 'set_transport',
    summary: 'Set the tempo in BPM and/or the swing amount.',
    category: 'transport',
    stations: [STATIONS.SESSION_ARTIST, STATIONS.STUDIO_MASTER],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        bpm: { type: 'number', minimum: 40, maximum: 240, description: 'Beats per minute.' },
        swing: { type: 'number', minimum: 0, maximum: 1, description: 'Swing amount, 0–1.' },
      },
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'set-transport',
      ...(a.bpm !== undefined && { bpm: a.bpm }),
      ...(a.swing !== undefined && { swing: a.swing }),
    }),
    example: { bpm: 128, swing: 0.12 },
  },
  {
    name: 'set_pattern_length',
    summary: 'Set the active pattern length in steps (1–64).',
    category: 'transport',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: { length: { type: 'integer', minimum: 1, maximum: 64 } },
      required: ['length'],
      additionalProperties: false,
    },
    build: (a) => ({ type: 'set-pattern-length', length: a.length }),
    example: { length: 16 },
  },
  {
    name: 'set_project_meta',
    summary: 'Set the project name, author, and/or description.',
    category: 'project',
    stations: [STATIONS.STUDIO_MASTER, STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project title.' },
        author: { type: 'string' },
        description: { type: 'string' },
      },
      additionalProperties: false,
    },
    build: (a) => ({ type: 'set-project-meta', ...a }),
    example: { name: 'Midnight Rumble' },
  },

  // ── Selection (navigation) ───────────────────────────────────────────
  {
    name: 'select_track',
    summary: 'Make a track the active/selected track.',
    category: 'navigation',
    stations: ALL_STATIONS,
    mutating: true,
    parameters: {
      type: 'object',
      properties: { trackIndex: TRACK_INDEX },
      required: ['trackIndex'],
      additionalProperties: false,
    },
    build: (a) => ({ type: 'select-track', trackIndex: a.trackIndex }),
    example: { trackIndex: 2 },
  },
  {
    name: 'select_pattern',
    summary: 'Switch to a pattern (and optionally bank/track).',
    category: 'navigation',
    stations: ALL_STATIONS,
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        bankIndex: { type: 'integer', minimum: 0, maximum: 7 },
        patternIndex: { type: 'integer', minimum: 0, maximum: 15 },
        trackIndex: TRACK_INDEX,
      },
      required: ['bankIndex', 'patternIndex'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'select-pattern',
      bankIndex: a.bankIndex,
      patternIndex: a.patternIndex,
      ...(a.trackIndex !== undefined && { trackIndex: a.trackIndex }),
    }),
    example: { bankIndex: 0, patternIndex: 1 },
  },

  // ── Step editing ─────────────────────────────────────────────────────
  {
    name: 'toggle_step',
    summary: 'Toggle a step on/off (or toggle its accent).',
    category: 'steps',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        trackIndex: TRACK_INDEX,
        stepIndex: STEP_INDEX,
        accent: { type: 'boolean', description: 'Toggle accent instead of on/off.' },
      },
      required: ['trackIndex', 'stepIndex'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'toggle-step',
      trackIndex: a.trackIndex,
      stepIndex: a.stepIndex,
      ...(a.accent && { shiftKey: true }),
    }),
    example: { trackIndex: 0, stepIndex: 4 },
  },
  {
    name: 'set_step',
    summary:
      'Set explicit properties of one step (active, accent, note, velocity, gate, micro-timing, trig condition, mute).',
    category: 'steps',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        trackIndex: TRACK_INDEX,
        stepIndex: STEP_INDEX,
        active: { type: 'boolean' },
        accent: { type: 'boolean' },
        note: { type: 'integer', minimum: 0, maximum: 127, description: 'MIDI note number.' },
        velocity: { type: 'number', minimum: 0, maximum: 1 },
        gate: { type: 'number', minimum: 0.05, maximum: 1 },
        microTime: { type: 'number', minimum: -0.5, maximum: 0.5, description: 'Micro-timing offset in steps.' },
        trigCondition: { type: 'string', description: 'e.g. always, 1st, every-N, A:B, fill.' },
        mute: { type: 'boolean' },
      },
      required: ['trackIndex', 'stepIndex'],
      additionalProperties: false,
    },
    build: (a) => ({ type: 'set-step', ...a }),
    example: { trackIndex: 2, stepIndex: 0, active: true, note: 67, velocity: 0.9 },
  },
  {
    name: 'clear_track',
    summary: 'Clear all steps on a track.',
    category: 'steps',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: { trackIndex: TRACK_INDEX },
      required: ['trackIndex'],
      additionalProperties: false,
    },
    build: (a) => ({ type: 'clear-track', trackIndex: a.trackIndex }),
    example: { trackIndex: 3 },
  },
  {
    name: 'fill_track',
    summary: 'Activate every Nth step on a track (e.g. interval 4 = four-on-the-floor).',
    category: 'steps',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: { trackIndex: TRACK_INDEX, interval: { type: 'integer', minimum: 1, maximum: 64 } },
      required: ['trackIndex', 'interval'],
      additionalProperties: false,
    },
    build: (a) => ({ type: 'fill-track-steps', trackIndex: a.trackIndex, interval: a.interval }),
    example: { trackIndex: 0, interval: 4 },
  },

  // ── Generative ───────────────────────────────────────────────────────
  {
    name: 'generate_euclid',
    summary: 'Distribute N beats evenly across the pattern (Euclidean rhythm) on one track or all.',
    category: 'generate',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        beats: { type: 'integer', minimum: 0, maximum: 64, description: 'Number of hits to distribute.' },
        steps: { type: 'integer', minimum: 1, maximum: 64, description: 'Grid length (defaults to pattern length).' },
        offset: { type: 'integer', minimum: 0, maximum: 63, description: 'Rotate the pattern.' },
        trackIndex: TRACK_INDEX,
        applyToAll: { type: 'boolean', description: 'Apply a rotated copy to every track.' },
      },
      required: ['beats'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'generate-euclid',
      beats: a.beats,
      ...(a.steps !== undefined && { steps: a.steps }),
      ...(a.offset !== undefined && { offset: a.offset }),
      ...(a.trackIndex !== undefined && { trackIndex: a.trackIndex }),
      ...(a.applyToAll && { applyToAll: true }),
    }),
    example: { beats: 5, steps: 16, trackIndex: 1 },
  },
  {
    name: 'generate_drum_pattern',
    summary: 'Generate a drum groove on a track in a named style.',
    category: 'generate',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        trackIndex: TRACK_INDEX,
        style: { type: 'string', enum: ['four-on-floor', 'halftime', 'broken'], description: 'Groove style.' },
        density: { type: 'number', minimum: 0, maximum: 1 },
        length: { type: 'integer', minimum: 1, maximum: 64 },
      },
      required: ['trackIndex', 'style'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'generate-drum-pattern',
      trackIndex: a.trackIndex,
      style: a.style,
      ...(a.density !== undefined && { density: a.density }),
      ...(a.length !== undefined && { length: a.length }),
    }),
    example: { trackIndex: 0, style: 'four-on-floor', density: 0.6 },
  },
  {
    name: 'randomize_track',
    summary: 'Randomize a track’s steps with a density and genre-weighted feel.',
    category: 'generate',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        trackIndex: TRACK_INDEX,
        density: { type: 'number', minimum: 0, maximum: 1 },
        genre: { type: 'string', description: 'Genre bias, e.g. techno, house, random.' },
      },
      required: ['trackIndex'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'randomize-track-steps',
      trackIndex: a.trackIndex,
      ...(a.density !== undefined && { density: a.density }),
      ...(a.genre !== undefined && { genre: a.genre }),
    }),
    example: { trackIndex: 4, density: 0.5, genre: 'techno' },
  },

  // ── Groove / feel ────────────────────────────────────────────────────
  {
    name: 'humanize_track',
    summary: 'Add subtle micro-timing and velocity variation to a track.',
    category: 'groove',
    stations: [STATIONS.SESSION_ARTIST, STATIONS.STUDIO_MASTER],
    mutating: true,
    parameters: {
      type: 'object',
      properties: { trackIndex: TRACK_INDEX, amount: { type: 'number', minimum: 0, maximum: 1 } },
      required: ['trackIndex'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'humanize-track-steps',
      trackIndex: a.trackIndex,
      ...(a.amount !== undefined && { amount: a.amount }),
    }),
    example: { trackIndex: 2, amount: 0.2 },
  },
  {
    name: 'quantize_track',
    summary: 'Snap a track’s active steps to a coarser grid.',
    category: 'groove',
    stations: [STATIONS.SESSION_ARTIST, STATIONS.STUDIO_MASTER],
    mutating: true,
    parameters: {
      type: 'object',
      properties: { trackIndex: TRACK_INDEX, grid: { type: 'integer', minimum: 1, maximum: 64 } },
      required: ['trackIndex'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'quantize-track-steps',
      trackIndex: a.trackIndex,
      ...(a.grid !== undefined && { grid: a.grid }),
    }),
    example: { trackIndex: 1, grid: 4 },
  },

  // ── Sound design & mix ───────────────────────────────────────────────
  {
    name: 'set_track_param',
    summary:
      'Set a sound-design or mix parameter on a track (cutoff, resonance, drive, volume, pan, sends, EQ, LFO…). Value is clamped to a safe range.',
    category: 'sound',
    stations: [STATIONS.SESSION_ARTIST, STATIONS.STUDIO_MASTER],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        trackIndex: TRACK_INDEX,
        param: { type: 'string', enum: TRACK_PARAM_NAMES, description: 'Which parameter to set.' },
        value: { type: 'number', description: 'New value (clamped to the parameter’s safe range).' },
      },
      required: ['trackIndex', 'param', 'value'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'set-track-param',
      trackIndex: a.trackIndex,
      param: a.param,
      value: clampToRange(a.value, TRACK_PARAM_RANGES[a.param]),
    }),
    example: { trackIndex: 2, param: 'cutoff', value: 1200 },
  },

  // ── Scenes & arrangement ─────────────────────────────────────────────
  {
    name: 'apply_scene',
    summary: 'Apply a saved scene’s parameters to the current track or all tracks.',
    category: 'scenes',
    stations: [STATIONS.CO_PERFORMER, STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        sceneIndex: { type: 'integer', minimum: 0, maximum: 7 },
        mode: { type: 'string', enum: ['track', 'all'] },
      },
      required: ['sceneIndex'],
      additionalProperties: false,
    },
    build: (a) => ({ type: 'apply-scene', sceneIndex: a.sceneIndex, ...(a.mode && { mode: a.mode }) }),
    example: { sceneIndex: 1, mode: 'all' },
  },
  {
    name: 'add_arranger_section',
    summary: 'Append a section to the song arrangement (a scene played for N bars).',
    category: 'arrangement',
    stations: [STATIONS.SESSION_ARTIST],
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        sceneIdx: { type: 'integer', minimum: 0, maximum: 7 },
        bars: { type: 'integer', minimum: 1, maximum: 64 },
        name: { type: 'string' },
        repeat: { type: 'integer', minimum: 1, maximum: 16 },
      },
      required: ['sceneIdx'],
      additionalProperties: false,
    },
    build: (a) => ({
      type: 'add-arranger-section',
      sceneIdx: a.sceneIdx,
      ...(a.bars !== undefined && { bars: a.bars }),
      ...(a.name !== undefined && { name: a.name }),
      ...(a.repeat !== undefined && { repeat: a.repeat }),
    }),
    example: { sceneIdx: 0, bars: 8, name: 'Intro' },
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** @param {string} name @returns {object|null} */
export function getTool(name) {
  return TOOLS_BY_NAME.get(name) || null;
}

/**
 * List tools, optionally filtered by station and/or mutation.
 * @param {{ station?: string, mutating?: boolean }} [opts]
 * @returns {object[]}
 */
export function listTools(opts = {}) {
  return TOOLS.filter((t) => {
    if (opts.station && !t.stations.includes(opts.station)) return false;
    if (opts.mutating !== undefined && t.mutating !== opts.mutating) return false;
    return true;
  });
}

/**
 * Validate args and compile a tool call into a command-bus command.
 * @param {string} name
 * @param {object} args
 * @returns {{ ok: true, command: object } | { ok: false, errors: string[] }}
 */
export function compileToCommand(name, args = {}) {
  const tool = getTool(name);
  if (!tool) return { ok: false, errors: [`Unknown tool: ${name}`] };
  const result = validate(tool.parameters, args && typeof args === 'object' ? args : {});
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, command: tool.build(result.value) };
}

/**
 * Provider-agnostic tool schemas. Core shape is neutral; adapters below map to
 * Anthropic / OpenAI. Filter by station for guardrailed surfaces.
 * @param {{ station?: string }} [opts]
 */
export function toToolSchemas(opts = {}) {
  return listTools(opts).map((t) => ({
    name: t.name,
    description: t.summary,
    parameters: t.parameters,
    mutating: t.mutating,
  }));
}

/** Anthropic Messages API `tools` shape. */
export function toAnthropicTools(opts = {}) {
  return listTools(opts).map((t) => ({ name: t.name, description: t.summary, input_schema: t.parameters }));
}

/** OpenAI Chat/Responses `tools` shape. */
export function toOpenAITools(opts = {}) {
  return listTools(opts).map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.summary, parameters: t.parameters },
  }));
}

/**
 * Regenerate the machine-readable tool surface for docs/confustudio.manual.json.
 * @returns {Array<object>}
 */
export function buildManualToolSurface() {
  return TOOLS.map((t) => ({
    name: t.name,
    summary: t.summary,
    category: t.category,
    stations: t.stations,
    mutating: t.mutating,
    parameters: t.parameters,
  }));
}
