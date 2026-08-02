// Pure command reducers over project schema v4.
//
// Contract (DEVELOPMENT_PLAN.md section 3):
//   applyCommand(project, envelope) -> { next, inverse, touchedIds, events }
//
// Rules this file exists to enforce:
//   - Pure. The input project is never mutated; `next` is a new document.
//   - Exact inverses. Applying `inverse` to `next` must reproduce the input
//     byte for byte, including sparse steps that did not previously exist.
//   - Stable targets. Commands address explicit IDs, never "current selection".
//   - Deterministic. Randomness comes only from the envelope's seed.
//
// Nothing here is wired into the running app. src/command-bus.js remains the
// live path, which is the rollback the core/03 issue asks for.

import { DEFAULT_STEP, V4_LIMITS, validateProjectV4 } from '../project/v4/schema.js';
import { CommandEnvelopeError, validateCommandBatch, validateCommandEnvelope } from './envelope.js';
import { createSeededRandom } from './random.js';

const META_FIELDS = ['name', 'author', 'description'];

function fail(message, code, path = '$') {
  throw new CommandEnvelopeError(message, code, path);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  return structuredClone(value);
}

export function getRevision(project) {
  return Number.isInteger(project?.revision) ? project.revision : 0;
}

function requireTrack(project, trackId) {
  const track = project.tracks.byId[trackId];
  if (!track) fail(`Unknown track ${trackId}`, 'COMMAND_TARGET_UNKNOWN', '$.targetIds');
  return track;
}

function requirePattern(project, patternId) {
  const pattern = project.patterns.byId[patternId];
  if (!pattern) fail(`Unknown pattern ${patternId}`, 'COMMAND_TARGET_UNKNOWN', '$.targetIds');
  return pattern;
}

function requireSingleTarget(envelope) {
  if (envelope.targetIds.length !== 1) {
    fail(`${envelope.type} needs exactly one target`, 'COMMAND_TARGET_INVALID', '$.targetIds');
  }
  return envelope.targetIds[0];
}

/**
 * Builds the inverse envelope that restores a track's sparse step map.
 * Restoring by whole-map replacement is what makes the inverse exact even when
 * a step did not exist before: "no entry" is a state the inverse must be able
 * to reproduce, and per-field patches cannot express it.
 */
function restoreStepsCommand(envelope, trackId, previousSteps) {
  return {
    id: `${envelope.id}~inv`,
    type: '__restore-steps',
    baseRevision: 0,
    targetIds: [trackId],
    payload: { steps: previousSteps },
  };
}

function restoreParamsCommand(envelope, trackId, previousParams) {
  return {
    id: `${envelope.id}~inv`,
    type: '__restore-params',
    baseRevision: 0,
    targetIds: [trackId],
    payload: { params: previousParams },
  };
}

// Internal inverse types. They are deliberately NOT in the public envelope
// allowlist: they are produced by the reducer, never accepted from a caller.
const INTERNAL_TYPES = new Set(['__restore-steps', '__restore-params', '__restore-meta', '__restore-pattern']);

function applyInternal(project, envelope) {
  const next = clone(project);
  const trackId = envelope.targetIds[0];
  switch (envelope.type) {
    case '__restore-steps':
      next.tracks.byId[trackId].steps = clone(envelope.payload.steps);
      return { next, touchedIds: [trackId] };
    case '__restore-params':
      next.tracks.byId[trackId].params = clone(envelope.payload.params);
      return { next, touchedIds: [trackId] };
    case '__restore-meta':
      next.meta = { ...next.meta, ...clone(envelope.payload.meta) };
      return { next, touchedIds: ['meta'] };
    case '__restore-pattern':
      next.patterns.byId[trackId].length = envelope.payload.length;
      return { next, touchedIds: [trackId] };
    default:
      return fail(`Unknown internal command ${envelope.type}`, 'COMMAND_TYPE_UNKNOWN');
  }
}

function normalizeStepEntry(entry) {
  // Only fields that differ from the default are stored; a step equal to the
  // default is dropped entirely, which is what keeps v4 sparse.
  const stored = {};
  for (const key of Object.keys(DEFAULT_STEP)) {
    if (entry[key] !== undefined && entry[key] !== DEFAULT_STEP[key]) stored[key] = entry[key];
  }
  if (entry.paramLocks && Object.keys(entry.paramLocks).length > 0) stored.paramLocks = clone(entry.paramLocks);
  return Object.keys(stored).length > 0 ? stored : null;
}

function assertStepIndex(track, index) {
  if (!Number.isInteger(index) || index < 0 || index >= track.stepCount) {
    fail(`Step index ${index} is outside the track`, 'COMMAND_TARGET_INVALID', '$.payload.index');
  }
}

/**
 * Applies one command envelope to a v4 project.
 *
 * @param {object} project
 * @param {object} envelope
 * @returns {{ next: object, inverse: object, touchedIds: string[], events: object[] }}
 */
export function applyCommand(project, envelope) {
  if (!isPlainRecord(project)) fail('Expected a v4 project', 'COMMAND_STATE_INVALID');

  if (INTERNAL_TYPES.has(envelope?.type)) {
    const { next, touchedIds } = applyInternal(project, envelope);
    next.revision = getRevision(project) + 1;
    return { next, inverse: null, touchedIds, events: [] };
  }

  validateCommandEnvelope(envelope);

  const revision = getRevision(project);
  if (envelope.baseRevision !== revision) {
    fail(
      `Command targets revision ${envelope.baseRevision} but project is at ${revision}`,
      'COMMAND_REVISION_CONFLICT',
      '$.baseRevision',
    );
  }

  const next = clone(project);
  const events = [];
  // Assigned by every branch below; the default branch throws, so there is no
  // path that leaves these unset.
  let inverse;
  let touchedIds;

  switch (envelope.type) {
    case 'set-project-meta': {
      const previous = {};
      for (const field of META_FIELDS) {
        if (envelope.payload[field] === undefined) continue;
        const value = envelope.payload[field];
        if (typeof value !== 'string')
          fail(`${field} must be a string`, 'COMMAND_SCHEMA_INVALID', `$.payload.${field}`);
        const max = field === 'description' ? V4_LIMITS.descriptionLength : V4_LIMITS.nameLength;
        if (value.length > max) fail(`${field} exceeds ${max}`, 'COMMAND_STRING_LIMIT', `$.payload.${field}`);
        previous[field] = next.meta[field];
        next.meta[field] = value;
      }
      inverse = {
        id: `${envelope.id}~inv`,
        type: '__restore-meta',
        baseRevision: 0,
        targetIds: [],
        payload: { meta: previous },
      };
      touchedIds = ['meta'];
      events.push({ type: 'meta-changed', fields: Object.keys(previous) });
      break;
    }

    case 'set-pattern-length': {
      const patternId = requireSingleTarget(envelope);
      const pattern = requirePattern(next, patternId);
      const length = envelope.payload.length;
      if (!Number.isInteger(length) || length < 1 || length > V4_LIMITS.stepsPerTrack) {
        fail(`length must be 1..${V4_LIMITS.stepsPerTrack}`, 'COMMAND_SCHEMA_INVALID', '$.payload.length');
      }
      inverse = {
        id: `${envelope.id}~inv`,
        type: '__restore-pattern',
        baseRevision: 0,
        targetIds: [patternId],
        payload: { length: pattern.length },
      };
      pattern.length = length;
      touchedIds = [patternId];
      events.push({ type: 'pattern-length-changed', patternId, length });
      break;
    }

    case 'set-track-param': {
      const trackId = requireSingleTarget(envelope);
      const track = requireTrack(next, trackId);
      const { param, value } = envelope.payload;
      if (typeof param !== 'string' || !param)
        fail('param must be a string', 'COMMAND_SCHEMA_INVALID', '$.payload.param');
      if (param === '__proto__' || param === 'prototype' || param === 'constructor') {
        fail('Prototype-bearing param is forbidden', 'COMMAND_DANGEROUS_KEY', '$.payload.param');
      }
      const type = typeof value;
      if (type !== 'string' && type !== 'number' && type !== 'boolean') {
        fail('param value must be a scalar', 'COMMAND_SCHEMA_INVALID', '$.payload.value');
      }
      if (type === 'number' && !Number.isFinite(value)) {
        fail('param value must be finite', 'COMMAND_SCHEMA_INVALID', '$.payload.value');
      }
      inverse = restoreParamsCommand(envelope, trackId, clone(track.params));
      track.params[param] = value;
      touchedIds = [trackId];
      events.push({ type: 'track-param-changed', trackId, param });
      break;
    }

    case 'toggle-step': {
      const trackId = requireSingleTarget(envelope);
      const track = requireTrack(next, trackId);
      const index = envelope.payload.index;
      assertStepIndex(track, index);
      inverse = restoreStepsCommand(envelope, trackId, clone(track.steps));
      const key = String(index);
      const current = { ...DEFAULT_STEP, ...(track.steps[key] ?? {}) };
      const updated = normalizeStepEntry({ ...current, active: !current.active });
      if (updated) track.steps[key] = updated;
      else delete track.steps[key];
      touchedIds = [trackId];
      events.push({ type: 'step-toggled', trackId, index, active: !current.active });
      break;
    }

    case 'set-step': {
      const trackId = requireSingleTarget(envelope);
      const track = requireTrack(next, trackId);
      const { index, ...fields } = envelope.payload;
      assertStepIndex(track, index);
      inverse = restoreStepsCommand(envelope, trackId, clone(track.steps));
      const key = String(index);
      const merged = { ...DEFAULT_STEP, ...(track.steps[key] ?? {}), ...fields };
      const updated = normalizeStepEntry(merged);
      if (updated) track.steps[key] = updated;
      else delete track.steps[key];
      touchedIds = [trackId];
      events.push({ type: 'step-changed', trackId, index });
      break;
    }

    case 'clear-track': {
      const trackId = requireSingleTarget(envelope);
      const track = requireTrack(next, trackId);
      inverse = restoreStepsCommand(envelope, trackId, clone(track.steps));
      track.steps = {};
      touchedIds = [trackId];
      events.push({ type: 'track-cleared', trackId });
      break;
    }

    case 'randomize-track-steps': {
      const trackId = requireSingleTarget(envelope);
      const track = requireTrack(next, trackId);
      const density = envelope.payload.density ?? 0.5;
      if (typeof density !== 'number' || !Number.isFinite(density) || density < 0 || density > 1) {
        fail('density must be 0..1', 'COMMAND_SCHEMA_INVALID', '$.payload.density');
      }
      inverse = restoreStepsCommand(envelope, trackId, clone(track.steps));
      // Seeded, so the same envelope always produces the same pattern.
      const random = createSeededRandom(envelope.seed);
      const steps = {};
      for (let index = 0; index < track.stepCount; index += 1) {
        if (random() >= density) continue;
        const entry = normalizeStepEntry({ ...DEFAULT_STEP, active: true });
        if (entry) steps[String(index)] = entry;
      }
      track.steps = steps;
      touchedIds = [trackId];
      events.push({ type: 'track-randomized', trackId, density, seed: envelope.seed });
      break;
    }

    default:
      return fail(`Unhandled command type ${envelope.type}`, 'COMMAND_TYPE_UNKNOWN');
  }

  next.revision = revision + 1;
  return { next, inverse, touchedIds, events };
}

/**
 * Applies a batch atomically: the whole batch is validated first, and any
 * failure mid-way discards the partial result rather than leaving the project
 * half-mutated.
 */
export function applyCommandBatch(project, envelopes) {
  validateCommandBatch(envelopes);
  validateProjectV4(project);

  let current = project;
  const inverses = [];
  const touched = new Set();
  const events = [];

  for (const envelope of envelopes) {
    // Each command sees the revision the previous one produced.
    const rebased = { ...envelope, baseRevision: getRevision(current) };
    const result = applyCommand(current, rebased);
    current = result.next;
    inverses.push(result.inverse);
    result.touchedIds.forEach((id) => touched.add(id));
    events.push(...result.events);
  }

  // Inverses undo in reverse order.
  return { next: current, inverses: inverses.reverse(), touchedIds: [...touched], events };
}

/** Applies a list of inverse envelopes, restoring the prior document. */
export function applyInverses(project, inverses) {
  let current = project;
  for (const inverse of inverses) {
    if (!inverse) continue;
    current = applyCommand(current, inverse).next;
  }
  return current;
}
