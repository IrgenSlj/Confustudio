// CONFUstudio harness — Branch lifecycle (Phase B3, CONFUSTUDIO_AI_BRIEF §1 + §"branches not mutations")
//
// Makes the B2 agent loop's proposals ACTIONABLE: open → audition → merge |
// discard. A branch stores the COMMANDS the loop produced (not a stale state
// snapshot), so it always merges relative to the CURRENT head — the user can
// keep editing while a proposal waits.
//
//   openBranch(state, proposal)  → id           (record the proposal)
//   auditionBranch(state, id)    → previewState  (head + branch, non-destructive)
//   mergeBranch(state, id)       → result        ⚠ USER-ONLY (a human click)
//   discardBranch(state, id)     → { ok }
//
// merge/discard are the human's call — the agent loop never imports them. Merge
// replays through executeStudioCommands, so it lands on the edit-history DAG and
// is undoable like any other edit. Pure + deterministic (no DOM/Date/random).

import { executeStudioCommands } from '../command-bus.js';

const STATUS = Object.freeze({ OPEN: 'open', MERGED: 'merged', DISCARDED: 'discarded' });
export { STATUS as BRANCH_STATUS };

function defaultClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Ensure the branches compartment exists; returns it. */
export function ensureBranches(state) {
  if (!state.branches || typeof state.branches !== 'object') {
    state.branches = { items: {}, activeAuditionId: null };
  }
  if (!state.branches.items || typeof state.branches.items !== 'object') {
    state.branches.items = {};
  }
  return state.branches;
}

/**
 * Record a proposal (from runAgent) as an open branch.
 * @param {object} state
 * @param {{ intent?: string, station?: string, commands?: object[], touched?: string[], perception?: object|null }} proposal
 * @param {string} [id] — explicit id (else `b<n>`, deterministic)
 * @returns {string} branch id
 */
export function openBranch(state, proposal, id) {
  const branches = ensureBranches(state);
  const branchId = id || `b${Object.keys(branches.items).length + 1}`;
  branches.items[branchId] = {
    id: branchId,
    intent: proposal?.intent || '',
    station: proposal?.station || null,
    commands: Array.isArray(proposal?.commands) ? JSON.parse(JSON.stringify(proposal.commands)) : [],
    touched: Array.isArray(proposal?.touched) ? proposal.touched.slice() : [],
    perception: proposal?.perception || null,
    status: STATUS.OPEN,
  };
  return branchId;
}

/** @returns {object|null} */
export function getBranch(state, id) {
  return ensureBranches(state).items[id] || null;
}

/**
 * List branches, newest-insertion first, optionally filtered by status.
 * @param {object} state
 * @param {{ status?: string }} [opts]
 */
export function listBranches(state, opts = {}) {
  const items = Object.values(ensureBranches(state).items);
  return opts.status ? items.filter((b) => b.status === opts.status) : items;
}

/**
 * Non-destructive A/B preview: current head + this branch's commands, on a
 * clone. Head is untouched. Marks the branch as the active audition.
 * @param {object} state
 * @param {string} id
 * @param {(o: object) => object} [clone]
 * @returns {{ ok: boolean, preview?: object, reason?: string }}
 */
export function auditionBranch(state, id, clone = defaultClone) {
  const branch = getBranch(state, id);
  if (!branch) return { ok: false, reason: 'branch not found' };
  const preview = clone(state);
  preview._signalGraph = null; // don't record replay onto the preview's DAG
  executeStudioCommands(preview, branch.commands);
  ensureBranches(state).activeAuditionId = id;
  return { ok: true, preview };
}

/** Clear the active audition (return to head) without changing branch status. */
export function endAudition(state) {
  ensureBranches(state).activeAuditionId = null;
}

/**
 * ⚠ USER-ONLY. Apply an open branch to the LIVE head. Replays through the
 * command bus so the merge is recorded on the edit-history DAG (undoable).
 * @param {object} state
 * @param {string} id
 * @returns {{ ok: boolean, changed?: boolean, results?: object[], reason?: string }}
 */
export function mergeBranch(state, id) {
  const branch = getBranch(state, id);
  if (!branch) return { ok: false, reason: 'branch not found' };
  if (branch.status !== STATUS.OPEN) return { ok: false, reason: `branch is ${branch.status}` };
  const { changed, results } = executeStudioCommands(state, branch.commands);
  branch.status = STATUS.MERGED;
  ensureBranches(state).activeAuditionId = null;
  return { ok: true, changed, results };
}

/**
 * Discard an open branch. Idempotent; clears the audition if it was active.
 * @param {object} state
 * @param {string} id
 */
export function discardBranch(state, id) {
  const branch = getBranch(state, id);
  if (!branch) return { ok: false, reason: 'branch not found' };
  branch.status = STATUS.DISCARDED;
  const branches = ensureBranches(state);
  if (branches.activeAuditionId === id) branches.activeAuditionId = null;
  return { ok: true };
}
