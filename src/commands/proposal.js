// Deterministic proposal patches.
//
// A proposal carries its base revision, a MATERIALIZED patch, an inverse patch,
// touched IDs, and a content hash (DEVELOPMENT_PLAN.md section 3).
//
// "Materialized" is the important word. A proposal does not store commands to
// re-run — re-running would re-derive seeded randomness and could resolve
// targets differently. It stores the concrete resulting values, so audition and
// merge apply literally the same bytes and cannot diverge.
//
// Nothing here is wired into the running app. Proposal records are inert data;
// mergeProposal is the only mutating entry point and it is gated, which is the
// "disable proposal mutation, retain read-only records" rollback core/05 asks
// for.

import { validateProjectV4 } from '../project/v4/schema.js';
import { applyCommandBatch, getRevision } from './reducer.js';

function clone(value) {
  return structuredClone(value);
}

/**
 * Canonical JSON with sorted keys, so two structurally identical documents
 * always hash identically regardless of key insertion order.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/**
 * Content fingerprint over canonical JSON (FNV-1a, 128 bits as four lanes).
 *
 * This is an INTEGRITY / IDENTITY check — it detects divergence between what
 * was proposed and what is being applied. It is deliberately not a
 * cryptographic digest and must not be relied on to resist a deliberate
 * collision by an attacker who controls proposal content.
 */
export function contentHash(value) {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  const lanes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    for (let lane = 0; lane < lanes.length; lane += 1) {
      lanes[lane] ^= code + lane;
      lanes[lane] = Math.imul(lanes[lane], 0x01000193) >>> 0;
    }
  }
  return lanes.map((lane) => lane.toString(16).padStart(8, '0')).join('');
}

/**
 * The value a touched entity currently holds. Used both to materialize a patch
 * and to fingerprint the entity for drift detection.
 */
function entityValue(project, id) {
  if (id === 'meta') return clone(project.meta);
  if (project.tracks.byId[id]) {
    const track = project.tracks.byId[id];
    return { kind: 'track', params: clone(track.params), steps: clone(track.steps), stepCount: track.stepCount };
  }
  if (project.patterns.byId[id]) {
    const pattern = project.patterns.byId[id];
    return { kind: 'pattern', length: pattern.length, name: pattern.name };
  }
  return null;
}

function writeEntity(project, id, value) {
  if (!value) return;
  if (id === 'meta') {
    project.meta = clone(value);
    return;
  }
  if (value.kind === 'track') {
    const track = project.tracks.byId[id];
    if (!track) throw new ProposalError(`Unknown track ${id}`, 'PROPOSAL_TARGET_MISSING');
    track.params = clone(value.params);
    track.steps = clone(value.steps);
    track.stepCount = value.stepCount;
    return;
  }
  if (value.kind === 'pattern') {
    const pattern = project.patterns.byId[id];
    if (!pattern) throw new ProposalError(`Unknown pattern ${id}`, 'PROPOSAL_TARGET_MISSING');
    pattern.length = value.length;
    pattern.name = value.name;
  }
}

export class ProposalError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'ProposalError';
    this.code = code;
    if (details) this.details = details;
  }
}

/**
 * Runs the commands against a CLONE and freezes the outcome into a patch.
 *
 * @returns {object} an inert proposal record
 */
export function createProposal(project, envelopes, options = {}) {
  validateProjectV4(project);
  const baseRevision = getRevision(project);
  const result = applyCommandBatch(project, envelopes);

  const touchedIds = [...result.touchedIds].sort();
  const patch = {};
  const inverse = {};
  const baseFingerprints = {};

  for (const id of touchedIds) {
    patch[id] = entityValue(result.next, id);
    inverse[id] = entityValue(project, id);
    // Fingerprint of the value the proposal was built against. Merge compares
    // this to the live value, which is how target drift becomes detectable
    // rather than silently overwritten.
    baseFingerprints[id] = contentHash(inverse[id]);
  }

  const proposal = {
    id: options.id ?? `prop_${contentHash(canonicalJson(patch)).slice(0, 12)}`,
    baseRevision,
    touchedIds,
    patch,
    inverse,
    baseFingerprints,
    events: result.events,
  };
  proposal.contentHash = contentHash({ patch: proposal.patch, touchedIds: proposal.touchedIds });
  return proposal;
}

/** Recomputes the hash and compares it to the recorded one. */
export function verifyProposal(proposal) {
  const expected = contentHash({ patch: proposal.patch, touchedIds: proposal.touchedIds });
  if (expected !== proposal.contentHash) {
    throw new ProposalError('Proposal content hash does not match its patch', 'PROPOSAL_HASH_MISMATCH', {
      expected,
      actual: proposal.contentHash,
    });
  }
  return proposal;
}

/**
 * The single application path. Audition and merge both call this, which is why
 * they cannot produce different results.
 */
function applyPatch(project, proposal) {
  verifyProposal(proposal);
  const next = clone(project);
  for (const id of proposal.touchedIds) writeEntity(next, id, proposal.patch[id]);
  next.revision = getRevision(project) + 1;
  return next;
}

/**
 * Reports every touched entity whose live value no longer matches what the
 * proposal was built against. An empty array means merging is safe.
 */
export function detectConflicts(project, proposal) {
  const conflicts = [];
  for (const id of proposal.touchedIds) {
    const current = entityValue(project, id);
    if (current === null) {
      conflicts.push({ id, reason: 'target-missing' });
      continue;
    }
    if (contentHash(current) !== proposal.baseFingerprints[id]) {
      conflicts.push({ id, reason: 'target-drift' });
    }
  }
  return conflicts;
}

/**
 * Non-destructive preview. Returns the same document merge would produce, plus
 * any conflicts, WITHOUT touching the input.
 */
export function auditionProposal(project, proposal) {
  validateProjectV4(project);
  return { project: applyPatch(project, proposal), conflicts: detectConflicts(project, proposal) };
}

/**
 * Applies the proposal. Refuses when any touched entity has drifted, so a
 * proposal can never silently overwrite work done since it was built.
 *
 * @param {object} options `allowMutation` gates this entire path; it is the
 *   rollback switch that leaves proposals readable but inert.
 */
export function mergeProposal(project, proposal, options = {}) {
  if (options.allowMutation === false) {
    throw new ProposalError('Proposal mutation is disabled', 'PROPOSAL_MUTATION_DISABLED');
  }
  validateProjectV4(project);
  const conflicts = detectConflicts(project, proposal);
  if (conflicts.length > 0) {
    throw new ProposalError('Proposal conflicts with the current project', 'PROPOSAL_CONFLICT', { conflicts });
  }
  return { project: applyPatch(project, proposal), conflicts: [] };
}

/** Restores the pre-merge values. */
export function discardProposal(project, proposal) {
  verifyProposal(proposal);
  const next = clone(project);
  for (const id of proposal.touchedIds) writeEntity(next, id, proposal.inverse[id]);
  next.revision = getRevision(project) + 1;
  return next;
}
