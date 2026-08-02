// Bounded exact undo/redo over v4 projects.
//
// v3 undo replays commands from a mutated state, which means undo depends on
// how the app got here rather than on what actually changed. This replaces that
// with the model the plan specifies:
//
//   explicit baseline + exact inverses + bounded checkpoints
//
// Undo applies the recorded inverses. Redo re-applies the recorded envelopes.
// Neither replays from live state, so neither can drift.
//
// Nothing here is wired into the running app. src/command-bus.js and its signal
// graph remain the live controller, which is the flag-off rollback core/04 asks
// for.

import { validateProjectV4 } from '../project/v4/schema.js';
import { applyCommand, applyCommandBatch, applyInverses, getRevision } from './reducer.js';

export const HISTORY_LIMITS = Object.freeze({
  // Entries kept before the oldest is folded into the baseline.
  maxEntries: 200,
  // A checkpoint every N entries bounds how far redo has to replay.
  checkpointInterval: 25,
  maxCheckpoints: 8,
  // Hard ceiling on serialized history, so a long session cannot grow without
  // bound. History is local and disposable; it is never part of a portable
  // project file.
  maxBytes: 4 * 1024 * 1024,
});

export class HistoryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'HistoryError';
    this.code = code;
  }
}

function clone(value) {
  return structuredClone(value);
}

/**
 * @param {object} project the baseline document
 * @param {object} [limits]
 */
export function createHistory(project, limits = {}) {
  validateProjectV4(project);
  const merged = { ...HISTORY_LIMITS, ...limits };
  return {
    limits: merged,
    baseline: clone(project),
    // Entries [0, cursor) are applied; [cursor, length) are available to redo.
    entries: [],
    cursor: 0,
    checkpoints: [],
    // Entries folded into the baseline because of the bound. Reported so the
    // UI can tell the user how far back undo actually reaches.
    droppedEntries: 0,
  };
}

function serializedSize(history) {
  return JSON.stringify({ baseline: history.baseline, entries: history.entries, checkpoints: history.checkpoints })
    .length;
}

/**
 * Folds the oldest entry into the baseline. This is what keeps history bounded
 * without breaking correctness: the baseline moves forward to include the
 * dropped work, so everything still reachable stays exactly undoable.
 */
function foldOldestIntoBaseline(history) {
  const oldest = history.entries.shift();
  if (!oldest) return;
  history.baseline = applyCommandBatch(history.baseline, oldest.envelopes).next;
  history.cursor = Math.max(0, history.cursor - 1);
  history.droppedEntries += 1;
  history.checkpoints = history.checkpoints
    .map((checkpoint) => ({ ...checkpoint, index: checkpoint.index - 1 }))
    .filter((checkpoint) => checkpoint.index > 0);
}

function enforceBounds(history) {
  while (history.entries.length > history.limits.maxEntries) foldOldestIntoBaseline(history);
  // Size is checked after the count bound so a few huge entries also shrink.
  let guard = 0;
  while (serializedSize(history) > history.limits.maxBytes && history.entries.length > 1) {
    foldOldestIntoBaseline(history);
    if ((guard += 1) > history.limits.maxEntries) break;
  }
}

function maybeCheckpoint(history, project) {
  if (history.cursor === 0 || history.cursor % history.limits.checkpointInterval !== 0) return;
  history.checkpoints.push({ index: history.cursor, project: clone(project) });
  while (history.checkpoints.length > history.limits.maxCheckpoints) history.checkpoints.shift();
}

/**
 * Records an applied batch. Recording truncates any redo branch, matching what
 * every editor does: once you act after undoing, the abandoned future is gone.
 *
 * @returns {{ history: object, project: object }}
 */
export function recordBatch(history, project, envelopes) {
  const result = applyCommandBatch(project, envelopes);
  const next = { ...history };
  next.entries = history.entries.slice(0, history.cursor);
  next.entries.push({
    envelopes: clone(envelopes),
    inverses: clone(result.inverses),
    touchedIds: [...result.touchedIds],
    revisionBefore: getRevision(project),
    revisionAfter: getRevision(result.next),
  });
  next.cursor = next.entries.length;
  next.checkpoints = history.checkpoints.filter((checkpoint) => checkpoint.index <= next.cursor);
  maybeCheckpoint(next, result.next);
  enforceBounds(next);
  return { history: next, project: result.next, events: result.events, touchedIds: result.touchedIds };
}

export function canUndo(history) {
  return history.cursor > 0;
}

export function canRedo(history) {
  return history.cursor < history.entries.length;
}

/** Applies the recorded inverses for the current entry. */
export function undo(history, project) {
  if (!canUndo(history)) throw new HistoryError('Nothing to undo', 'HISTORY_EMPTY');
  const entry = history.entries[history.cursor - 1];
  const restored = applyInverses(project, entry.inverses);
  // Inverses restore content but each application still advances the revision
  // counter; pin it back so the document matches where it actually is.
  restored.revision = entry.revisionBefore;
  return { history: { ...history, cursor: history.cursor - 1 }, project: restored, touchedIds: entry.touchedIds };
}

/** Re-applies the recorded envelopes for the next entry. */
export function redo(history, project) {
  if (!canRedo(history)) throw new HistoryError('Nothing to redo', 'HISTORY_EMPTY');
  const entry = history.entries[history.cursor];
  let current = project;
  for (const envelope of entry.envelopes) {
    current = applyCommand(current, { ...envelope, baseRevision: getRevision(current) }).next;
  }
  current.revision = entry.revisionAfter;
  return { history: { ...history, cursor: history.cursor + 1 }, project: current, touchedIds: entry.touchedIds };
}

/**
 * Rebuilds the document at the current cursor from the baseline, using the
 * nearest checkpoint at or before the cursor. This is the recovery path and the
 * cross-check that live undo/redo has not drifted.
 */
export function materialize(history) {
  const checkpoint = [...history.checkpoints]
    .filter((entry) => entry.index <= history.cursor)
    .sort((a, b) => b.index - a.index)[0];

  let current = checkpoint ? clone(checkpoint.project) : clone(history.baseline);
  const from = checkpoint ? checkpoint.index : 0;
  for (let index = from; index < history.cursor; index += 1) {
    for (const envelope of history.entries[index].envelopes) {
      current = applyCommand(current, { ...envelope, baseRevision: getRevision(current) }).next;
    }
    current.revision = history.entries[index].revisionAfter;
  }
  return current;
}

/** What the UI needs to describe history without walking it. */
export function historyStats(history) {
  return {
    entries: history.entries.length,
    cursor: history.cursor,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    checkpoints: history.checkpoints.length,
    droppedEntries: history.droppedEntries,
    bytes: serializedSize(history),
  };
}

/**
 * Whether the app should use this controller instead of the signal-graph one.
 * Off by default; flipping it back is the core/04 rollback.
 *
 * @returns {boolean}
 */
export function isExactHistoryEnabled(env) {
  try {
    const storage = env ?? (typeof window === 'undefined' ? null : window.localStorage);
    return storage?.getItem?.('confustudio-exact-history') === 'on';
  } catch (_) {
    return false;
  }
}
