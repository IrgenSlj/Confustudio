import { BoundaryValidationError, inspectBoundedValue, validatePatternImport } from './runtime-validation.js';

const COMMAND_FIELDS = Object.freeze({
  'set-setting': ['type', 'key', 'value'],
  'select-bank': ['type', 'bankIndex', 'patternIndex'],
  'select-pattern': ['type', 'bankIndex', 'patternIndex', 'trackIndex'],
  'select-track': ['type', 'trackIndex'],
  'toggle-step': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'stepIndex', 'shiftKey'],
  'cycle-step-probability': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'stepIndex'],
  'randomize-track-steps': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'density', 'genre'],
  'randomize-all-tracks': ['type', 'bankIndex', 'patternIndex', 'density', 'genre'],
  'fill-track-steps': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'interval'],
  'mutate-track-steps': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'flips'],
  'quantize-track-steps': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'grid'],
  'humanize-track-steps': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'amount'],
  'set-project-meta': ['type', 'name', 'author', 'description'],
  'set-transport': ['type', 'bpm', 'swing'],
  'set-pattern-length': ['type', 'bankIndex', 'patternIndex', 'length'],
  'set-track-param': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'param', 'value'],
  'set-step': [
    'type',
    'bankIndex',
    'patternIndex',
    'trackIndex',
    'stepIndex',
    'active',
    'accent',
    'note',
    'velocity',
    'gate',
    'microTime',
    'retrig',
    'trigCondition',
    'mute',
    'paramLocks',
  ],
  'clear-track': ['type', 'bankIndex', 'patternIndex', 'trackIndex'],
  'replace-track-steps': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'steps'],
  'duplicate-pattern': ['type', 'sourceBankIndex', 'sourcePatternIndex', 'bankIndex', 'patternIndex'],
  'replace-pattern': ['type', 'bankIndex', 'patternIndex', 'pattern'],
  'update-pattern-meta': ['type', 'bankIndex', 'patternIndex', 'name', 'followAction'],
  'set-scene-name': ['type', 'sceneIndex', 'name'],
  'set-scene-payload': ['type', 'bankIndex', 'patternIndex', 'sceneIndex', 'scene'],
  'swap-scenes': ['type', 'bankIndex', 'patternIndex', 'sceneA', 'sceneB'],
  'apply-scene': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'sceneIndex', 'mode'],
  'add-arranger-section': [
    'type',
    'sceneIdx',
    'bars',
    'name',
    'repeat',
    'muted',
    'followAction',
    'trackMutes',
    'bpmOverride',
    'timeSignature',
    'color',
    'jumpTarget',
  ],
  'replace-arranger': ['type', 'arranger', 'arrangementCursor'],
  'update-arranger-section': ['type', 'sectionIndex', 'patch'],
  'generate-drum-pattern': [
    'type',
    'bankIndex',
    'patternIndex',
    'trackIndex',
    'machine',
    'patternLength',
    'length',
    'density',
    'style',
  ],
  'generate-euclid': ['type', 'bankIndex', 'patternIndex', 'trackIndex', 'beats', 'steps', 'offset', 'applyToAll'],
  'add-graph-node': ['type', 'nodeId', 'plugin', 'params', 'meta'],
  'remove-graph-node': ['type', 'nodeId'],
  'connect-graph-nodes': ['type', 'fromNode', 'fromPort', 'toNode', 'toPort'],
  'disconnect-graph-nodes': ['type', 'connectionId'],
  'set-node-param': ['type', 'nodeId', 'param', 'value'],
  'replace-graph': ['type', 'graph'],
  'get-graph': ['type'],
});

const REQUIRED_FIELDS = Object.freeze({
  'set-setting': ['key', 'value'],
  'select-bank': ['bankIndex'],
  'select-pattern': ['patternIndex'],
  'select-track': ['trackIndex'],
  'toggle-step': ['stepIndex'],
  'cycle-step-probability': ['stepIndex'],
  'set-pattern-length': ['length'],
  'set-track-param': ['param', 'value'],
  'set-step': ['stepIndex'],
  'replace-track-steps': ['steps'],
  'replace-pattern': ['pattern'],
  'set-scene-name': ['sceneIndex', 'name'],
  'set-scene-payload': ['sceneIndex', 'scene'],
  'swap-scenes': ['sceneA', 'sceneB'],
  'apply-scene': ['sceneIndex'],
  'replace-arranger': ['arranger'],
  'update-arranger-section': ['sectionIndex', 'patch'],
  'add-graph-node': ['nodeId', 'plugin'],
  'remove-graph-node': ['nodeId'],
  'connect-graph-nodes': ['fromNode', 'toNode'],
  'disconnect-graph-nodes': ['connectionId'],
  'set-node-param': ['nodeId', 'param', 'value'],
  'replace-graph': ['graph'],
});

const SETTING_KEYS = new Set([
  'abletonLink',
  'assistantProvider',
  'audioBufferSize',
  'audioOutputDevice',
  'bpmOverride',
  'chorusMix',
  'chorusRate',
  'clockSource',
  'clockMode',
  'convReverbMix',
  'crossfader',
  'cueLevel',
  'cueMonitorEnabled',
  'customAccent',
  'customScreenText',
  'defaultProb',
  'delayFeedback',
  'delayTime',
  'euclidBeats',
  'humanizeAmount',
  'ioLevel',
  'latencyCompMs',
  'loopCount',
  'loopEnabled',
  'masterDrive',
  'masterLimiter',
  'masterLevel',
  'metronome',
  'midiChannel',
  'midiClockOut',
  'morphCurve',
  'octaveShift',
  'oscMode',
  'patternLengthLocked',
  'patternLocked',
  'patternShift',
  'quantize',
  'quantizeGrid',
  'randomizeDensity',
  'randomizeGenre',
  'recorderBarCount',
  'reverbDamping',
  'reverbSize',
  'rollScroll',
  'rollZoom',
  'scale',
  'scaleMode',
  'sceneA',
  'sceneB',
  'sectionLen',
  'swing',
  'sync',
  'theme',
  'trigCondition',
  'trigMode',
  'velocity',
]);

const TRACK_PARAM_KEYS = new Set([
  'arpEnabled',
  'arpHold',
  'arpMode',
  'arpRange',
  'arpSpeed',
  'attack',
  'bitDepth',
  'clDensity',
  'clPosition',
  'clSize',
  'clTexture',
  'color',
  'cue',
  'cutoff',
  'decay',
  'delaySend',
  'drive',
  'eqHigh',
  'eqLow',
  'eqMid',
  'eqMidFreq',
  'filterEnvAmt',
  'filterQ',
  'filterType',
  'groupIndex',
  'inputGain',
  'isMidi',
  'isSidechainSource',
  'keyTracking',
  'legato',
  'lfoDepth',
  'lfoRate',
  'lfoTarget',
  'lfoToCutoff',
  'lfoToPitch',
  'lfoToVolume',
  'loopEnabled',
  'loopEnd',
  'loopStart',
  'machine',
  'maxVoices',
  'midiChannel',
  'midiPort',
  'mute',
  'name',
  'note',
  'noteLength',
  'outputBus',
  'pan',
  'pitch',
  'plEngine',
  'plHarmonics',
  'plMorph',
  'plTimbre',
  'recArmed',
  'release',
  'resonance',
  'reverbSend',
  'rnBrightness',
  'rnDamping',
  'rnExciter',
  'rnStructure',
  'sampleEnd',
  'sampleStart',
  'sidechainAmount',
  'solo',
  'srDiv',
  'stepCount',
  'stereoWidth',
  'sustain',
  'swing',
  'trackLength',
  'velocityCurve',
  'volume',
  'waveform',
]);

const ARRANGER_PATCH_KEYS = new Set([
  'bars',
  'bpmOverride',
  'color',
  'followAction',
  'jumpTarget',
  'muted',
  'name',
  'repeat',
  'sceneIdx',
  'timeSignature',
  'trackMutes',
]);

const INDEX_RANGES = Object.freeze({
  bankIndex: [0, 7],
  sourceBankIndex: [0, 7],
  patternIndex: [0, 15],
  sourcePatternIndex: [0, 15],
  trackIndex: [0, 7],
  stepIndex: [0, 63],
  sceneIndex: [0, 7],
  sceneA: [0, 7],
  sceneB: [0, 7],
  sceneIdx: [0, 7],
});

function invalid(message, path = '$') {
  throw new BoundaryValidationError(`${message} at ${path}`, 'COMMAND_SCHEMA_INVALID', path);
}

function assertAllowedKeys(record, allowed, path = '$') {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) invalid(`Unexpected command field: ${key}`, `${path}.${key}`);
  }
}

function assertScalar(value, path) {
  if (value === null || ['boolean', 'string'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  invalid('Expected a scalar command value', path);
}

function assertIdentifier(value, path) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(value)) {
    invalid('Expected a bounded identifier', path);
  }
}

function assertOptionalFiniteNumber(record, key, path = '$') {
  if (record[key] !== undefined && (typeof record[key] !== 'number' || !Number.isFinite(record[key]))) {
    invalid('Expected a finite number', `${path}.${key}`);
  }
}

function assertOptionalBoolean(record, key, path = '$') {
  if (record[key] !== undefined && typeof record[key] !== 'boolean') {
    invalid('Expected a boolean', `${path}.${key}`);
  }
}

function assertOptionalString(record, key, maxLength = 2000, path = '$') {
  if (record[key] === undefined) return;
  if (typeof record[key] !== 'string' || record[key].length > maxLength) {
    invalid(`Expected a string no longer than ${maxLength} characters`, `${path}.${key}`);
  }
}

function assertRecord(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an object', path);
}

export function validateStudioCommand(command) {
  inspectBoundedValue(command, {
    maxDepth: 16,
    maxValues: 100_000,
    maxContainers: 20_000,
    maxArrayLength: 4096,
    maxObjectKeys: 2048,
    maxStringLength: 8192,
  });
  if (!command || typeof command !== 'object' || Array.isArray(command)) invalid('Command must be an object');
  if (typeof command.type !== 'string' || !command.type) invalid('Command type is required', '$.type');

  const fields = COMMAND_FIELDS[command.type];
  if (!fields) invalid(`Unknown command type: ${command.type}`, '$.type');
  assertAllowedKeys(command, new Set(fields));
  for (const required of REQUIRED_FIELDS[command.type] ?? []) {
    if (!Object.hasOwn(command, required)) invalid(`Missing command field: ${required}`, `$.${required}`);
  }

  for (const [field, [min, max]] of Object.entries(INDEX_RANGES)) {
    if (command[field] === undefined) continue;
    if (!Number.isInteger(command[field]) || command[field] < min || command[field] > max) {
      invalid(`Index must be an integer from ${min} to ${max}`, `$.${field}`);
    }
  }

  for (const field of [
    'amount',
    'arrangementCursor',
    'bars',
    'beats',
    'bpm',
    'bpmOverride',
    'density',
    'flips',
    'gate',
    'grid',
    'interval',
    'jumpTarget',
    'length',
    'microTime',
    'note',
    'offset',
    'patternLength',
    'repeat',
    'retrig',
    'sectionIndex',
    'swing',
    'velocity',
  ]) {
    assertOptionalFiniteNumber(command, field);
  }
  for (const field of ['accent', 'active', 'applyToAll', 'mute', 'muted', 'shiftKey']) {
    assertOptionalBoolean(command, field);
  }
  for (const field of [
    'author',
    'color',
    'description',
    'followAction',
    'genre',
    'machine',
    'mode',
    'name',
    'style',
    'timeSignature',
    'trigCondition',
  ]) {
    assertOptionalString(command, field, field === 'description' ? 2000 : 200);
  }
  if (command.sectionIndex !== undefined && (!Number.isInteger(command.sectionIndex) || command.sectionIndex < 0)) {
    invalid('Section index must be a non-negative integer', '$.sectionIndex');
  }

  if (command.type === 'set-setting') {
    if (!SETTING_KEYS.has(command.key)) invalid('Setting key is not writable', '$.key');
    assertScalar(command.value, '$.value');
  }
  if (command.type === 'set-track-param') {
    if (!TRACK_PARAM_KEYS.has(command.param)) invalid('Track parameter is not writable', '$.param');
    assertScalar(command.value, '$.value');
    if (typeof command.value === 'string' && command.value.length > 2000) {
      invalid('Track parameter string is too long', '$.value');
    }
  }
  if (command.type === 'replace-pattern') validatePatternImport(command.pattern);
  if (command.type === 'replace-track-steps') {
    validatePatternImport({ kit: { tracks: [{ steps: command.steps }] } });
  }
  if (command.type === 'set-step' && command.paramLocks !== undefined) {
    assertRecord(command.paramLocks, '$.paramLocks');
    for (const [key, value] of Object.entries(command.paramLocks)) {
      assertIdentifier(key, `$.paramLocks.${key}`);
      assertScalar(value, `$.paramLocks.${key}`);
    }
  }
  if (command.type === 'set-scene-payload') {
    assertRecord(command.scene, '$.scene');
    assertAllowedKeys(command.scene, new Set(['name', 'noInterp', 'tracks']), '$.scene');
    if (
      command.scene.name !== undefined &&
      (typeof command.scene.name !== 'string' || command.scene.name.length > 64)
    ) {
      invalid('Scene name must be a bounded string', '$.scene.name');
    }
    if (command.scene.tracks !== undefined) {
      if (!Array.isArray(command.scene.tracks) || command.scene.tracks.length > 8) {
        invalid('Scene tracks must contain at most 8 entries', '$.scene.tracks');
      }
      command.scene.tracks.forEach((track, index) => {
        if (track === null) return;
        const trackPath = `$.scene.tracks[${index}]`;
        assertRecord(track, trackPath);
        assertAllowedKeys(
          track,
          new Set(['cutoff', 'decay', 'delaySend', 'pan', 'pitch', 'resonance', 'reverbSend', 'volume']),
          trackPath,
        );
        Object.keys(track).forEach((key) => assertOptionalFiniteNumber(track, key, trackPath));
      });
    }
    if (command.scene.noInterp !== undefined) {
      if (!Array.isArray(command.scene.noInterp) || command.scene.noInterp.length > 16) {
        invalid('Scene no-interpolation list is invalid', '$.scene.noInterp');
      }
      command.scene.noInterp.forEach((param, index) => assertIdentifier(param, `$.scene.noInterp[${index}]`));
    }
  }
  if (command.type === 'replace-arranger' && command.arranger.length > 256) {
    invalid('Arranger payload exceeds 256 sections', '$.arranger');
  }
  if (command.type === 'update-arranger-section') {
    if (!command.patch || typeof command.patch !== 'object' || Array.isArray(command.patch)) {
      invalid('Arranger patch must be an object', '$.patch');
    }
    assertAllowedKeys(command.patch, ARRANGER_PATCH_KEYS, '$.patch');
  }
  if (command.type === 'add-arranger-section' || command.type === 'replace-arranger') {
    const sections = command.type === 'replace-arranger' ? command.arranger : [command];
    if (!Array.isArray(sections) || sections.length > 256) {
      invalid('Arranger payload exceeds 256 sections', '$.arranger');
    }
    sections.forEach((section, index) => {
      const sectionPath = command.type === 'replace-arranger' ? `$.arranger[${index}]` : '$';
      assertRecord(section, sectionPath);
      if (command.type === 'replace-arranger') {
        assertAllowedKeys(section, ARRANGER_PATCH_KEYS, sectionPath);
      }
      for (const field of ['bars', 'bpmOverride', 'jumpTarget', 'repeat', 'sceneIdx']) {
        assertOptionalFiniteNumber(section, field, sectionPath);
      }
      assertOptionalBoolean(section, 'muted', sectionPath);
      for (const field of ['color', 'followAction', 'name', 'timeSignature']) {
        assertOptionalString(section, field, 200, sectionPath);
      }
      if (section.trackMutes !== undefined) {
        if (!Array.isArray(section.trackMutes) || section.trackMutes.length > 8) {
          invalid('Track mutes must contain at most 8 entries', '$.trackMutes');
        }
        if (section.trackMutes.some((value) => typeof value !== 'boolean')) {
          invalid('Track mutes must be booleans', '$.trackMutes');
        }
      }
    });
  }
  if (command.type === 'replace-graph') {
    if (!command.graph || typeof command.graph !== 'object' || Array.isArray(command.graph)) {
      invalid('Graph payload must be an object', '$.graph');
    }
    const nodes = command.graph.nodes ?? {};
    const connections = command.graph.connections ?? [];
    if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes) || Object.keys(nodes).length > 512) {
      invalid('Graph nodes must be an object with at most 512 entries', '$.graph.nodes');
    }
    if (!Array.isArray(connections) || connections.length > 2048) {
      invalid('Graph connections must be an array with at most 2048 entries', '$.graph.connections');
    }
    for (const [nodeId, node] of Object.entries(nodes)) {
      assertIdentifier(nodeId, `$.graph.nodes.${nodeId}`);
      assertRecord(node, `$.graph.nodes.${nodeId}`);
      assertIdentifier(node.plugin, `$.graph.nodes.${nodeId}.plugin`);
    }
  }
  if (['add-graph-node', 'remove-graph-node', 'set-node-param'].includes(command.type)) {
    assertIdentifier(command.nodeId, '$.nodeId');
  }
  if (command.type === 'add-graph-node') {
    assertIdentifier(command.plugin, '$.plugin');
    if (command.params !== undefined) assertRecord(command.params, '$.params');
    if (command.meta !== undefined) assertRecord(command.meta, '$.meta');
  }
  if (command.type === 'set-node-param') assertIdentifier(command.param, '$.param');
  if (command.type === 'connect-graph-nodes') {
    assertIdentifier(command.fromNode, '$.fromNode');
    assertIdentifier(command.toNode, '$.toNode');
    if (command.fromPort !== undefined) assertIdentifier(command.fromPort, '$.fromPort');
    if (command.toPort !== undefined) assertIdentifier(command.toPort, '$.toPort');
  }
  if (command.type === 'disconnect-graph-nodes') assertIdentifier(command.connectionId, '$.connectionId');
  if (command.type === 'set-node-param') assertScalar(command.value, '$.value');

  return command;
}

export function validateStudioCommandBatch(commands, options = {}) {
  if (!Array.isArray(commands)) invalid('Commands must be an array');
  const maxCommands = options.maxCommands ?? 64;
  if (commands.length > maxCommands) invalid(`Command batch exceeds ${maxCommands} commands`);
  commands.forEach((command) => validateStudioCommand(command));
  return commands;
}
