// Command envelope validation.
//
// Every mutation crosses this boundary as an explicit envelope:
//
//   { id, type, baseRevision, targetIds, payload, seed? }
//
// targetIds is the point of the design. v3 commands addressed whatever the UI
// happened to have selected, which made them unreplayable and made an agent
// proposal depend on hidden state. Here the target is always named.

export const COMMAND_LIMITS = Object.freeze({
  idLength: 64,
  typeLength: 64,
  targetIds: 64,
  targetIdLength: 64,
  batch: 64,
});

// Payload field allowlists, by command type. Anything not listed is rejected
// before the batch runs — no unknown field ever reaches a reducer.
export const COMMAND_PAYLOAD_FIELDS = Object.freeze({
  'set-project-meta': ['name', 'author', 'description'],
  'set-pattern-length': ['length'],
  'set-track-param': ['param', 'value'],
  'toggle-step': ['index'],
  'set-step': [
    'index',
    'active',
    'accent',
    'mute',
    'note',
    'velocity',
    'probability',
    'trigCondition',
    'microTime',
    'gate',
    'retrig',
  ],
  'clear-track': [],
  'randomize-track-steps': ['density'],
});

export const COMMAND_TYPES = Object.freeze(Object.keys(COMMAND_PAYLOAD_FIELDS));

// Types whose result depends on randomness must carry a seed, or they cannot be
// replayed or agreed on by two machines applying the same proposal.
export const SEEDED_COMMAND_TYPES = Object.freeze(['randomize-track-steps']);

export class CommandEnvelopeError extends TypeError {
  constructor(message, code, path = '$') {
    super(`${message} at ${path}`);
    this.name = 'CommandEnvelopeError';
    this.code = code;
    this.path = path;
  }
}

function fail(message, code, path = '$') {
  throw new CommandEnvelopeError(message, code, path);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validates one envelope. Throws CommandEnvelopeError with a stable code.
 *
 * @param {unknown} envelope
 * @param {string} [path]
 * @returns {object} the same envelope, unmodified
 */
export function validateCommandEnvelope(envelope, path = '$') {
  if (!isPlainRecord(envelope)) fail('Expected a command envelope object', 'COMMAND_SCHEMA_INVALID', path);

  const allowed = new Set(['id', 'type', 'baseRevision', 'targetIds', 'payload', 'seed']);
  for (const key of Object.keys(envelope)) {
    if (!allowed.has(key)) fail(`Unknown envelope field ${key}`, 'COMMAND_SCHEMA_INVALID', `${path}.${key}`);
  }

  if (typeof envelope.id !== 'string' || !envelope.id || envelope.id.length > COMMAND_LIMITS.idLength) {
    fail('Envelope id is required', 'COMMAND_SCHEMA_INVALID', `${path}.id`);
  }
  if (typeof envelope.type !== 'string' || !COMMAND_PAYLOAD_FIELDS[envelope.type]) {
    fail(`Unknown command type ${String(envelope.type)}`, 'COMMAND_TYPE_UNKNOWN', `${path}.type`);
  }
  if (!Number.isInteger(envelope.baseRevision) || envelope.baseRevision < 0) {
    fail('baseRevision must be a non-negative integer', 'COMMAND_SCHEMA_INVALID', `${path}.baseRevision`);
  }

  if (!Array.isArray(envelope.targetIds))
    fail('targetIds must be an array', 'COMMAND_SCHEMA_INVALID', `${path}.targetIds`);
  if (envelope.targetIds.length > COMMAND_LIMITS.targetIds) {
    fail(`More than ${COMMAND_LIMITS.targetIds} targets`, 'COMMAND_COLLECTION_LIMIT', `${path}.targetIds`);
  }
  for (const [index, id] of envelope.targetIds.entries()) {
    if (typeof id !== 'string' || !id || id.length > COMMAND_LIMITS.targetIdLength) {
      fail('Target ids must be non-empty strings', 'COMMAND_SCHEMA_INVALID', `${path}.targetIds[${index}]`);
    }
  }

  if (!isPlainRecord(envelope.payload)) fail('payload must be an object', 'COMMAND_SCHEMA_INVALID', `${path}.payload`);
  const fields = new Set(COMMAND_PAYLOAD_FIELDS[envelope.type]);
  for (const key of Object.keys(envelope.payload)) {
    if (!fields.has(key)) {
      fail(`Unknown payload field ${key} for ${envelope.type}`, 'COMMAND_SCHEMA_INVALID', `${path}.payload.${key}`);
    }
  }

  const needsSeed = SEEDED_COMMAND_TYPES.includes(envelope.type);
  if (needsSeed && !Number.isInteger(envelope.seed)) {
    fail(`${envelope.type} must carry an integer seed to stay replayable`, 'COMMAND_SEED_REQUIRED', `${path}.seed`);
  }
  if (envelope.seed !== undefined && !Number.isInteger(envelope.seed)) {
    fail('seed must be an integer', 'COMMAND_SCHEMA_INVALID', `${path}.seed`);
  }

  return envelope;
}

/** Validates a whole batch before any of it runs, so batches stay atomic. */
export function validateCommandBatch(envelopes) {
  if (!Array.isArray(envelopes)) fail('Expected an array of envelopes', 'COMMAND_SCHEMA_INVALID');
  if (envelopes.length > COMMAND_LIMITS.batch) {
    fail(`More than ${COMMAND_LIMITS.batch} commands`, 'COMMAND_COLLECTION_LIMIT');
  }
  envelopes.forEach((envelope, index) => validateCommandEnvelope(envelope, `$[${index}]`));
  return envelopes;
}
