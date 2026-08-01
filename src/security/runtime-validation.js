const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export const IMPORT_LIMITS = Object.freeze({
  maxBytes: 64 * 1024 * 1024,
  maxDepth: 32,
  maxValues: 4_000_000,
  maxContainers: 250_000,
  maxArrayLength: 2_000_000,
  maxObjectKeys: 4096,
  maxStringLength: 1024 * 1024,
  banks: 8,
  patternsPerBank: 16,
  tracksPerPattern: 8,
  stepsPerTrack: 64,
  scenes: 8,
  arrangerSections: 256,
  graphNodes: 512,
  graphConnections: 2048,
  portableAssets: 1028,
});

export class BoundaryValidationError extends TypeError {
  constructor(message, code = 'BOUNDARY_VALIDATION_FAILED', path = '$') {
    super(message);
    this.name = 'BoundaryValidationError';
    this.code = code;
    this.path = path;
  }
}

function fail(message, code, path = '$') {
  throw new BoundaryValidationError(`${message} at ${path}`, code, path);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, path, code = 'IMPORT_SCHEMA_INVALID') {
  if (!isPlainRecord(value)) fail('Expected an object', code, path);
  return value;
}

function requireArray(value, path, maxLength, code = 'IMPORT_COLLECTION_LIMIT') {
  if (!Array.isArray(value)) fail('Expected an array', 'IMPORT_SCHEMA_INVALID', path);
  if (value.length > maxLength) fail(`Collection exceeds ${maxLength} items`, code, path);
  return value;
}

function optionalString(record, key, path, maxLength) {
  if (record[key] === undefined || record[key] === null) return;
  if (typeof record[key] !== 'string') fail('Expected a string', 'IMPORT_SCHEMA_INVALID', `${path}.${key}`);
  if (record[key].length > maxLength) {
    fail(`String exceeds ${maxLength} characters`, 'IMPORT_STRING_LIMIT', `${path}.${key}`);
  }
}

function optionalFiniteNumber(record, key, path) {
  if (record[key] === undefined || record[key] === null) return;
  if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) {
    fail('Expected a finite number', 'IMPORT_SCHEMA_INVALID', `${path}.${key}`);
  }
}

export function inspectBoundedValue(value, options = {}) {
  const limits = { ...IMPORT_LIMITS, ...options };
  const stack = [{ value, path: options.path || '$', depth: 0 }];
  const seen = new WeakSet();
  let values = 0;
  let containers = 0;

  while (stack.length) {
    const current = stack.pop();
    values += 1;
    if (values > limits.maxValues) fail('Value count exceeds the import limit', 'IMPORT_VALUE_LIMIT', current.path);
    if (current.depth > limits.maxDepth) fail('Object nesting is too deep', 'IMPORT_DEPTH_LIMIT', current.path);

    const entry = current.value;
    if (entry === null || typeof entry === 'boolean') continue;
    if (typeof entry === 'string') {
      if (entry.length > limits.maxStringLength) {
        fail(`String exceeds ${limits.maxStringLength} characters`, 'IMPORT_STRING_LIMIT', current.path);
      }
      continue;
    }
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) fail('Number must be finite', 'IMPORT_SCHEMA_INVALID', current.path);
      continue;
    }
    if (typeof entry !== 'object')
      fail('Only JSON-compatible values are accepted', 'IMPORT_SCHEMA_INVALID', current.path);
    if (seen.has(entry)) fail('Cyclic values are not accepted', 'IMPORT_SCHEMA_INVALID', current.path);
    seen.add(entry);
    containers += 1;
    if (containers > limits.maxContainers) {
      fail('Container count exceeds the import limit', 'IMPORT_CONTAINER_LIMIT', current.path);
    }

    if (Array.isArray(entry)) {
      if (entry.length > limits.maxArrayLength) {
        fail(`Array exceeds ${limits.maxArrayLength} items`, 'IMPORT_COLLECTION_LIMIT', current.path);
      }
      for (let index = entry.length - 1; index >= 0; index -= 1) {
        stack.push({ value: entry[index], path: `${current.path}[${index}]`, depth: current.depth + 1 });
      }
      continue;
    }

    if (!isPlainRecord(entry)) fail('Only plain objects are accepted', 'IMPORT_SCHEMA_INVALID', current.path);
    const keys = Object.keys(entry);
    if (keys.length > limits.maxObjectKeys) {
      fail(`Object exceeds ${limits.maxObjectKeys} keys`, 'IMPORT_COLLECTION_LIMIT', current.path);
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (DANGEROUS_KEYS.has(key))
        fail('Prototype-bearing key is forbidden', 'DANGEROUS_OBJECT_KEY', `${current.path}.${key}`);
      stack.push({ value: entry[key], path: `${current.path}.${key}`, depth: current.depth + 1 });
    }
  }

  return value;
}

function validateTrack(track, path) {
  if (track === null) return;
  requireRecord(track, path);
  optionalString(track, 'name', path, 120);
  optionalString(track, 'machine', path, 64);
  optionalString(track, 'waveform', path, 64);
  optionalString(track, 'color', path, 32);
  for (const key of [
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
  ]) {
    optionalFiniteNumber(track, key, path);
  }
  for (const key of [
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
  ]) {
    if (track[key] !== undefined && typeof track[key] !== 'boolean') {
      fail('Expected a boolean', 'IMPORT_SCHEMA_INVALID', `${path}.${key}`);
    }
  }
  for (const key of ['lfoTarget', 'midiPort', 'outputBus', 'velocityCurve', 'filterType', 'arpMode', 'sampleAssetId']) {
    optionalString(track, key, path, 200);
  }
  if (track.steps !== undefined) {
    const steps = requireArray(track.steps, `${path}.steps`, IMPORT_LIMITS.stepsPerTrack);
    steps.forEach((step, index) => {
      if (step === null) return;
      const stepPath = `${path}.steps[${index}]`;
      requireRecord(step, stepPath);
      for (const key of ['note', 'velocity', 'probability', 'microTime', 'gate', 'retrig']) {
        optionalFiniteNumber(step, key, stepPath);
      }
      optionalString(step, 'trigCondition', stepPath, 32);
      for (const key of ['active', 'accent', 'mute']) {
        if (step[key] !== undefined && typeof step[key] !== 'boolean') {
          fail('Expected a boolean', 'IMPORT_SCHEMA_INVALID', `${stepPath}.${key}`);
        }
      }
      if (step.paramLocks !== undefined) requireRecord(step.paramLocks, `${stepPath}.paramLocks`);
    });
  }
}

function validateKit(kit, path, required = false) {
  if (kit === undefined && !required) return;
  requireRecord(kit, path);
  const tracks = requireArray(kit.tracks, `${path}.tracks`, IMPORT_LIMITS.tracksPerPattern);
  tracks.forEach((track, index) => validateTrack(track, `${path}.tracks[${index}]`));
}

function validatePattern(pattern, path, requireKit = false) {
  if (pattern === null) return;
  requireRecord(pattern, path);
  optionalString(pattern, 'name', path, 120);
  optionalString(pattern, 'followAction', path, 32);
  optionalFiniteNumber(pattern, 'length', path);
  validateKit(pattern.kit, `${path}.kit`, requireKit);
}

function validateProject(project, path) {
  requireRecord(project, path);
  optionalString(project, 'name', path, 120);
  optionalString(project, 'author', path, 120);
  optionalString(project, 'description', path, 2000);
  optionalString(project, 'assetId', path, 200);
  optionalFiniteNumber(project, 'createdAt', path);

  const banks = requireArray(project.banks, `${path}.banks`, IMPORT_LIMITS.banks);
  banks.forEach((bank, bankIndex) => {
    if (bank === null) return;
    requireRecord(bank, `${path}.banks[${bankIndex}]`);
    optionalString(bank, 'name', `${path}.banks[${bankIndex}]`, 120);
    const patterns = requireArray(bank.patterns, `${path}.banks[${bankIndex}].patterns`, IMPORT_LIMITS.patternsPerBank);
    patterns.forEach((pattern, patternIndex) =>
      validatePattern(pattern, `${path}.banks[${bankIndex}].patterns[${patternIndex}]`),
    );
  });

  if (project.scenes !== undefined) {
    const scenes = requireArray(project.scenes, `${path}.scenes`, IMPORT_LIMITS.scenes);
    scenes.forEach((scene, sceneIndex) => {
      if (scene === null) return;
      requireRecord(scene, `${path}.scenes[${sceneIndex}]`);
      optionalString(scene, 'name', `${path}.scenes[${sceneIndex}]`, 64);
      if (scene.tracks !== undefined) {
        const tracks = requireArray(
          scene.tracks,
          `${path}.scenes[${sceneIndex}].tracks`,
          IMPORT_LIMITS.tracksPerPattern,
        );
        tracks.forEach((track, trackIndex) => {
          if (track === null) return;
          const trackPath = `${path}.scenes[${sceneIndex}].tracks[${trackIndex}]`;
          requireRecord(track, trackPath);
          for (const key of ['cutoff', 'decay', 'delaySend', 'pitch', 'volume', 'pan', 'resonance', 'reverbSend']) {
            optionalFiniteNumber(track, key, trackPath);
          }
        });
      }
    });
  }
}

function validateStateCollections(state, path) {
  if (!state) return;
  requireRecord(state, path);
  if (state.arranger !== undefined) {
    const arranger = requireArray(state.arranger, `${path}.arranger`, IMPORT_LIMITS.arrangerSections);
    arranger.forEach((section, index) => {
      requireRecord(section, `${path}.arranger[${index}]`);
      optionalString(section, 'name', `${path}.arranger[${index}]`, 80);
      optionalString(section, 'followAction', `${path}.arranger[${index}]`, 32);
      optionalString(section, 'timeSignature', `${path}.arranger[${index}]`, 16);
      optionalString(section, 'color', `${path}.arranger[${index}]`, 32);
    });
  }
  if (state.signalGraph !== undefined) {
    const graph = requireRecord(state.signalGraph, `${path}.signalGraph`);
    if (graph.nodes !== undefined) {
      const nodes = requireRecord(graph.nodes, `${path}.signalGraph.nodes`);
      if (Object.keys(nodes).length > IMPORT_LIMITS.graphNodes) {
        fail('Signal graph has too many nodes', 'IMPORT_COLLECTION_LIMIT', `${path}.signalGraph.nodes`);
      }
    }
    if (graph.connections !== undefined) {
      requireArray(graph.connections, `${path}.signalGraph.connections`, IMPORT_LIMITS.graphConnections);
    }
  }
  if (state.recorderSlotsMeta !== undefined) {
    const slots = requireArray(state.recorderSlotsMeta, `${path}.recorderSlotsMeta`, 4);
    slots.forEach((slot, index) => {
      const slotPath = `${path}.recorderSlotsMeta[${index}]`;
      if (slot === null) return;
      requireRecord(slot, slotPath);
      optionalString(slot, 'name', slotPath, 120);
      optionalString(slot, 'source', slotPath, 64);
      optionalString(slot, 'assetId', slotPath, 200);
      for (const key of ['trackIndex', 'durationSec', 'createdAt']) optionalFiniteNumber(slot, key, slotPath);
    });
  }
}

function validatePortableAssets(assets, path) {
  if (assets === undefined || assets === null) return;
  requireRecord(assets, path);
  const records = requireArray(assets.records ?? [], `${path}.records`, IMPORT_LIMITS.portableAssets);
  records.forEach((record, index) => {
    requireRecord(record, `${path}.records[${index}]`);
    optionalString(record, 'key', `${path}.records[${index}]`, 300);
    optionalString(record, 'kind', `${path}.records[${index}]`, 32);
    if (record.payload !== undefined) requireRecord(record.payload, `${path}.records[${index}].payload`);
  });
}

export function validateProjectImport(input) {
  inspectBoundedValue(input);
  const root = requireRecord(input, '$');
  if (root.format !== undefined && root.format !== 'confustudio-project-package') {
    fail('Unknown project package format', 'IMPORT_FORMAT_UNSUPPORTED', '$.format');
  }

  const packageState = root.format === 'confustudio-project-package' ? root.state : null;
  const state = packageState ?? (root.project ? root : root.state && isPlainRecord(root.state) ? root.state : null);
  const project = root.project ?? state?.project ?? (root.banks ? root : null);
  const legacyTracks = root.tracks ?? root.state?.tracks;
  if (!project) {
    if (Array.isArray(legacyTracks)) {
      requireArray(legacyTracks, '$.tracks', IMPORT_LIMITS.tracksPerPattern).forEach((track, index) =>
        validateTrack(track, `$.tracks[${index}]`),
      );
      return input;
    }
    fail('Project data is missing', 'IMPORT_PROJECT_SHAPE', '$');
  }

  validateProject(project, root.project ? '$.project' : state?.project ? '$.state.project' : '$');
  validateStateCollections(state, packageState ? '$.state' : '$');
  validatePortableAssets(root.assets, '$.assets');
  return input;
}

export function validatePatternImport(input) {
  inspectBoundedValue(input, { maxValues: 20_000, maxContainers: 5_000, maxArrayLength: 256 });
  validatePattern(input, '$', true);
  return input;
}

export function validateKitImport(input) {
  inspectBoundedValue(input, { maxValues: 20_000, maxContainers: 5_000, maxArrayLength: 256 });
  validateKit(input, '$', true);
  return input;
}

export function validateMidiMapImport(input) {
  inspectBoundedValue(input, { maxValues: 2_000, maxContainers: 512, maxArrayLength: 128 });
  const map = requireRecord(input, '$');
  const entries = Object.entries(map);
  if (entries.length > 128) fail('MIDI map has too many entries', 'IMPORT_COLLECTION_LIMIT', '$');
  entries.forEach(([cc, entry]) => {
    const ccNumber = Number(cc);
    if (!Number.isInteger(ccNumber) || ccNumber < 0 || ccNumber > 127) {
      fail('MIDI map keys must be controller numbers from 0 to 127', 'IMPORT_SCHEMA_INVALID', `$.${cc}`);
    }
    if (typeof entry === 'string') return;
    requireRecord(entry, `$.${cc}`);
    optionalString(entry, 'param', `$.${cc}`, 120);
  });
  return input;
}

export function assertImportTextSize(text, maxBytes = IMPORT_LIMITS.maxBytes) {
  if (typeof text !== 'string') fail('Import payload must be text', 'IMPORT_SCHEMA_INVALID', '$');
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) fail(`Import exceeds ${maxBytes} bytes`, 'IMPORT_SIZE_LIMIT', '$');
  return text;
}

export function parseJsonImportText(text, kind = 'project', options = {}) {
  assertImportTextSize(text, options.maxBytes ?? IMPORT_LIMITS.maxBytes);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    fail('Import is not valid JSON', 'IMPORT_JSON_INVALID', '$');
  }
  const validators = {
    project: validateProjectImport,
    pattern: validatePatternImport,
    kit: validateKitImport,
    'midi-map': validateMidiMapImport,
  };
  const validator = validators[kind];
  if (!validator) fail(`Unknown import kind: ${kind}`, 'IMPORT_KIND_UNKNOWN', '$');
  return validator(parsed);
}

export async function readJsonImportFile(file, kind = 'project', options = {}) {
  if (!file || typeof file.text !== 'function') fail('Import file is required', 'IMPORT_FILE_REQUIRED', '$');
  const maxBytes = options.maxBytes ?? IMPORT_LIMITS.maxBytes;
  if (Number.isFinite(file.size) && file.size > maxBytes) {
    fail(`Import exceeds ${maxBytes} bytes`, 'IMPORT_SIZE_LIMIT', '$');
  }
  if (file.name && !String(file.name).toLowerCase().endsWith('.json')) {
    fail('Import file must use the .json extension', 'IMPORT_FILE_TYPE', '$');
  }
  return parseJsonImportText(await file.text(), kind, { maxBytes });
}
