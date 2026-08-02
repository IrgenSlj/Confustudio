// Project schema v4 — sparse, ID-addressed, versioned.
//
// v3 materializes everything: 8 banks x 16 patterns x 8 tracks x 64 steps is
// ~65k step objects in a project where the user has touched none of them. v4
// stores only what differs from the defaults, addresses collections by stable
// ID with an explicit order array, and carries a formatVersion so a reader can
// tell what it is holding.
//
// This module is pure and Node-executable. It does not read or write storage,
// and nothing here is wired into the live app: v3 remains the read/write path
// until the feature flag in ./index.js is turned on.

export const FORMAT_VERSION = 4;

// Collection ceilings, checked BEFORE any normalization so an oversized
// document is rejected without being walked or expanded first.
export const V4_LIMITS = Object.freeze({
  banks: 8,
  patternsPerBank: 16,
  tracksPerPattern: 8,
  stepsPerTrack: 64,
  scenes: 8,
  arrangerSections: 256,
  nameLength: 120,
  descriptionLength: 2000,
  identifierLength: 64,
});

// The canonical empty step. A step equal to this is not serialized at all —
// that is where the sparseness comes from. Note this is NOT v3's createStep(),
// which seeds a decorative pattern; v4's default is genuinely empty.
export const DEFAULT_STEP = Object.freeze({
  active: false,
  accent: false,
  mute: false,
  note: 60,
  velocity: 1,
  probability: 1,
  trigCondition: 'always',
  microTime: 0,
  gate: 0.5,
  retrig: 0,
});

// Known track parameters, grouped by type. Anything outside these lists is
// quarantined during migration rather than merged, so an unknown field can
// never silently become live project state.
export const TRACK_NUMBER_PARAMS = Object.freeze([
  'volume',
  'pan',
  'pitch',
  'attack',
  'decay',
  'sustain',
  'release',
  'noteLength',
  'cutoff',
  'resonance',
  'drive',
  'delaySend',
  'reverbSend',
  'lfoRate',
  'lfoDepth',
  'midiChannel',
  'trackLength',
  'stepCount',
  'swing',
  'inputGain',
  'stereoWidth',
  'groupIndex',
  'sidechainAmount',
  'filterQ',
  'bitDepth',
  'srDiv',
  'eqLow',
  'eqMid',
  'eqMidFreq',
  'eqHigh',
  'plEngine',
  'plTimbre',
  'plHarmonics',
  'plMorph',
  'clPosition',
  'clSize',
  'clDensity',
  'clTexture',
  'rnStructure',
  'rnBrightness',
  'rnDamping',
  'rnExciter',
  'maxVoices',
  'arpRange',
  'arpSpeed',
  'note',
  'sampleStart',
  'sampleEnd',
  'loopStart',
  'loopEnd',
]);

export const TRACK_BOOLEAN_PARAMS = Object.freeze([
  'isMidi',
  'recArmed',
  'mute',
  'solo',
  'cue',
  'isSidechainSource',
  'lfoToCutoff',
  'lfoToPitch',
  'lfoToVolume',
  'legato',
  'arpEnabled',
  'arpHold',
  'keyTracking',
  'loopEnabled',
]);

export const TRACK_STRING_PARAMS = Object.freeze([
  'machine',
  'waveform',
  'color',
  'lfoTarget',
  'midiPort',
  'outputBus',
  'velocityCurve',
  'filterType',
  'arpMode',
  'sampleAssetId',
]);

export class ProjectV4Error extends TypeError {
  constructor(message, code, path = '$') {
    super(`${message} at ${path}`);
    this.name = 'ProjectV4Error';
    this.code = code;
    this.path = path;
  }
}

function fail(message, code, path = '$') {
  throw new ProjectV4Error(message, code, path);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Deterministic identifiers. Migration must be reproducible — the same input
 * has to yield byte-identical output every run, or round-trip tests are flaky
 * and two machines migrating the same project disagree. So no randomness.
 */
export function makeId(kind, ...parts) {
  return `${kind}_${parts.join('_')}`;
}

export function isDefaultStep(step) {
  if (!isPlainRecord(step)) return true;
  for (const [key, value] of Object.entries(DEFAULT_STEP)) {
    if (step[key] !== undefined && step[key] !== value) return false;
  }
  // paramLocks is the one non-scalar; any entry makes the step meaningful.
  if (step.paramLocks && Object.keys(step.paramLocks).length > 0) return false;
  return true;
}

/** Collapses a dense step array into an index-keyed map of non-default steps. */
export function toSparseSteps(steps) {
  const sparse = {};
  if (!Array.isArray(steps)) return sparse;
  steps.forEach((step, index) => {
    if (!isPlainRecord(step) || isDefaultStep(step)) return;
    const entry = {};
    for (const key of Object.keys(DEFAULT_STEP)) {
      if (step[key] !== undefined && step[key] !== DEFAULT_STEP[key]) entry[key] = step[key];
    }
    if (step.paramLocks && Object.keys(step.paramLocks).length > 0) entry.paramLocks = { ...step.paramLocks };
    sparse[String(index)] = entry;
  });
  return sparse;
}

/** Rebuilds a dense step array of `count` entries from a sparse map. */
export function toDenseSteps(sparse, count) {
  return Array.from({ length: count }, (_, index) => {
    const stored = isPlainRecord(sparse) ? sparse[String(index)] : undefined;
    return { ...DEFAULT_STEP, paramLocks: {}, ...(isPlainRecord(stored) ? stored : {}) };
  });
}

export function createProjectV4(overrides = {}) {
  return {
    formatVersion: FORMAT_VERSION,
    id: overrides.id ?? makeId('prj', 'new'),
    meta: {
      name: 'New Project',
      author: '',
      description: '',
      createdAt: 0,
      ...(overrides.meta ?? {}),
    },
    banks: { byId: {}, order: [] },
    patterns: { byId: {} },
    tracks: { byId: {} },
    scenes: { byId: {}, order: [] },
  };
}

function assertCollection(collection, path, maxOrder) {
  if (!isPlainRecord(collection)) fail('Expected an ID collection', 'V4_SCHEMA_INVALID', path);
  if (!isPlainRecord(collection.byId)) fail('Expected byId to be a record', 'V4_SCHEMA_INVALID', `${path}.byId`);
  if (maxOrder !== undefined) {
    if (!Array.isArray(collection.order)) fail('Expected an order array', 'V4_SCHEMA_INVALID', `${path}.order`);
    if (collection.order.length > maxOrder) {
      fail(`Order exceeds ${maxOrder} entries`, 'V4_COLLECTION_LIMIT', `${path}.order`);
    }
    for (const id of collection.order) {
      if (typeof id !== 'string' || !id) fail('Order entries must be ids', 'V4_SCHEMA_INVALID', `${path}.order`);
      if (!Object.hasOwn(collection.byId, id)) {
        fail(`Order references unknown id ${id}`, 'V4_DANGLING_REFERENCE', `${path}.order`);
      }
    }
  }
}

function assertString(record, key, path, maxLength) {
  const value = record[key];
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') fail('Expected a string', 'V4_SCHEMA_INVALID', `${path}.${key}`);
  if (value.length > maxLength) fail(`String exceeds ${maxLength}`, 'V4_STRING_LIMIT', `${path}.${key}`);
}

/**
 * Validates a v4 document. Throws ProjectV4Error with a stable code; callers
 * map that onto the fixture outcomes (reject vs. migrate).
 */
export function validateProjectV4(input) {
  if (!isPlainRecord(input)) fail('Expected a project object', 'V4_SCHEMA_INVALID');
  if (input.formatVersion !== FORMAT_VERSION) {
    fail(`Expected formatVersion ${FORMAT_VERSION}`, 'V4_FORMAT_VERSION', '$.formatVersion');
  }
  if (typeof input.id !== 'string' || !input.id) fail('Project id is required', 'V4_SCHEMA_INVALID', '$.id');

  const meta = input.meta;
  if (!isPlainRecord(meta)) fail('Expected meta', 'V4_SCHEMA_INVALID', '$.meta');
  assertString(meta, 'name', '$.meta', V4_LIMITS.nameLength);
  assertString(meta, 'author', '$.meta', V4_LIMITS.nameLength);
  assertString(meta, 'description', '$.meta', V4_LIMITS.descriptionLength);
  if (meta.createdAt !== undefined && !Number.isFinite(meta.createdAt)) {
    fail('createdAt must be finite', 'V4_SCHEMA_INVALID', '$.meta.createdAt');
  }

  assertCollection(input.banks, '$.banks', V4_LIMITS.banks);
  assertCollection(input.patterns, '$.patterns');
  assertCollection(input.tracks, '$.tracks');
  assertCollection(input.scenes, '$.scenes', V4_LIMITS.scenes);

  for (const [bankId, bank] of Object.entries(input.banks.byId)) {
    const path = `$.banks.byId.${bankId}`;
    if (!isPlainRecord(bank)) fail('Expected a bank', 'V4_SCHEMA_INVALID', path);
    assertString(bank, 'name', path, V4_LIMITS.nameLength);
    if (!Array.isArray(bank.patterns)) fail('Expected a pattern order', 'V4_SCHEMA_INVALID', `${path}.patterns`);
    if (bank.patterns.length > V4_LIMITS.patternsPerBank) {
      fail(`Exceeds ${V4_LIMITS.patternsPerBank} patterns`, 'V4_COLLECTION_LIMIT', `${path}.patterns`);
    }
    for (const patternId of bank.patterns) {
      if (!Object.hasOwn(input.patterns.byId, patternId)) {
        fail(`Unknown pattern ${patternId}`, 'V4_DANGLING_REFERENCE', `${path}.patterns`);
      }
    }
  }

  for (const [patternId, pattern] of Object.entries(input.patterns.byId)) {
    const path = `$.patterns.byId.${patternId}`;
    if (!isPlainRecord(pattern)) fail('Expected a pattern', 'V4_SCHEMA_INVALID', path);
    assertString(pattern, 'name', path, V4_LIMITS.nameLength);
    if (pattern.length !== undefined && !Number.isFinite(pattern.length)) {
      fail('Pattern length must be finite', 'V4_SCHEMA_INVALID', `${path}.length`);
    }
    if (!Array.isArray(pattern.tracks)) fail('Expected a track order', 'V4_SCHEMA_INVALID', `${path}.tracks`);
    if (pattern.tracks.length > V4_LIMITS.tracksPerPattern) {
      fail(`Exceeds ${V4_LIMITS.tracksPerPattern} tracks`, 'V4_COLLECTION_LIMIT', `${path}.tracks`);
    }
    for (const trackId of pattern.tracks) {
      if (!Object.hasOwn(input.tracks.byId, trackId)) {
        fail(`Unknown track ${trackId}`, 'V4_DANGLING_REFERENCE', `${path}.tracks`);
      }
    }
  }

  for (const [trackId, track] of Object.entries(input.tracks.byId)) {
    const path = `$.tracks.byId.${trackId}`;
    if (!isPlainRecord(track)) fail('Expected a track', 'V4_SCHEMA_INVALID', path);
    assertString(track, 'name', path, V4_LIMITS.nameLength);
    if (!Number.isFinite(track.stepCount) || track.stepCount < 0 || track.stepCount > V4_LIMITS.stepsPerTrack) {
      fail(`stepCount must be 0..${V4_LIMITS.stepsPerTrack}`, 'V4_COLLECTION_LIMIT', `${path}.stepCount`);
    }
    if (!isPlainRecord(track.params)) fail('Expected params', 'V4_SCHEMA_INVALID', `${path}.params`);
    if (!isPlainRecord(track.steps)) fail('Expected a sparse step map', 'V4_SCHEMA_INVALID', `${path}.steps`);
    for (const index of Object.keys(track.steps)) {
      const parsed = Number(index);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed >= track.stepCount) {
        fail(`Step index ${index} is outside the track`, 'V4_DANGLING_REFERENCE', `${path}.steps`);
      }
    }
  }

  return input;
}
