// core/04-history acceptance: baseline, inverse, checkpoint, undo/redo fuzz,
// and bounded-storage tests.
//
// The property that matters: after ANY interleaving of record/undo/redo, the
// live document must equal the document rebuilt from the baseline. If those
// ever disagree, undo has drifted — which is exactly the failure mode of v3's
// replay-from-mutated-state history that this replaces.
import { strict as assert } from 'node:assert';

import { createProjectV4, validateProjectV4 } from '../src/project/v4/schema.js';
import { createSeededRandom, randomInt } from '../src/commands/random.js';
import {
  HISTORY_LIMITS,
  canRedo,
  canUndo,
  createHistory,
  historyStats,
  isExactHistoryEnabled,
  materialize,
  recordBatch,
  redo,
  undo,
} from '../src/commands/history.js';

function buildProject() {
  const project = createProjectV4({ id: 'prj_hist', meta: { name: 'History Test' } });
  project.revision = 0;
  for (let t = 0; t < 3; t += 1) {
    const id = `trk_${t}`;
    project.tracks.byId[id] = {
      id,
      name: `Track ${t + 1}`,
      stepCount: 16,
      params: { volume: 0.8 },
      steps: t === 0 ? { 2: { active: true } } : {},
    };
  }
  project.patterns.byId.pat_0 = { id: 'pat_0', name: 'P1', length: 16, tracks: ['trk_0', 'trk_1', 'trk_2'] };
  project.banks.byId.bnk_0 = { id: 'bnk_0', name: 'A', patterns: ['pat_0'] };
  project.banks.order.push('bnk_0');
  validateProjectV4(project);
  return project;
}

const envelope = (type, targetIds, payload = {}, extra = {}) => ({
  id: `cmd_${type}_${Math.random().toString(36).slice(2, 8)}`,
  type,
  baseRevision: 0,
  targetIds,
  payload,
  ...extra,
});

const comparable = (project) => JSON.stringify({ ...project, revision: 0 });

// ── Baseline and a single undo/redo cycle ────────────────────────────────────
{
  const project = buildProject();
  const original = comparable(project);
  let history = createHistory(project);
  assert.equal(canUndo(history), false, 'A fresh history has nothing to undo');
  assert.equal(canRedo(history), false);

  const recorded = recordBatch(history, project, [envelope('toggle-step', ['trk_1'], { index: 4 })]);
  history = recorded.history;
  assert.equal(canUndo(history), true);
  assert.notEqual(comparable(recorded.project), original, 'Recording must actually change the document');

  const undone = undo(history, recorded.project);
  assert.equal(comparable(undone.project), original, 'Undo must restore the baseline exactly');
  assert.equal(canRedo(undone.history), true);

  const redone = redo(undone.history, undone.project);
  assert.equal(comparable(redone.project), comparable(recorded.project), 'Redo must restore the change exactly');
}

// ── Recording after an undo truncates the redo branch ────────────────────────
{
  const project = buildProject();
  const history = createHistory(project);
  const first = recordBatch(history, project, [envelope('toggle-step', ['trk_1'], { index: 1 })]);
  const undone = undo(first.history, first.project);
  const second = recordBatch(undone.history, undone.project, [envelope('toggle-step', ['trk_2'], { index: 2 })]);
  assert.equal(canRedo(second.history), false, 'Acting after an undo must discard the abandoned future');
  assert.equal(second.history.entries.length, 1);
}

// ── Undo/redo fuzz: live document must always equal the rebuilt one ──────────
{
  const random = createSeededRandom(4242);
  const trackIds = ['trk_0', 'trk_1', 'trk_2'];
  let undos = 0;
  let redos = 0;
  let records = 0;

  for (let trial = 0; trial < 60; trial += 1) {
    let project = buildProject();
    let history = createHistory(project);

    for (let step = 0; step < 40; step += 1) {
      const action = randomInt(random, 0, 9);
      if (action <= 5 || (!canUndo(history) && !canRedo(history))) {
        const trackId = trackIds[randomInt(random, 0, trackIds.length - 1)];
        const pick = randomInt(random, 0, 3);
        const command =
          pick === 0
            ? envelope('toggle-step', [trackId], { index: randomInt(random, 0, 15) })
            : pick === 1
              ? envelope('set-track-param', [trackId], { param: 'cutoff', value: randomInt(random, 0, 100) / 100 })
              : pick === 2
                ? envelope('clear-track', [trackId])
                : envelope(
                    'randomize-track-steps',
                    [trackId],
                    { density: randomInt(random, 0, 10) / 10 },
                    { seed: randomInt(random, 0, 9999) },
                  );
        const result = recordBatch(history, project, [command]);
        history = result.history;
        project = result.project;
        records += 1;
      } else if (action <= 7 && canUndo(history)) {
        const result = undo(history, project);
        history = result.history;
        project = result.project;
        undos += 1;
      } else if (canRedo(history)) {
        const result = redo(history, project);
        history = result.history;
        project = result.project;
        redos += 1;
      }

      validateProjectV4(project);
      // The invariant. Live state and the rebuilt state must never disagree.
      assert.equal(
        comparable(project),
        comparable(materialize(history)),
        `Live document drifted from the rebuilt document (trial ${trial}, step ${step})`,
      );
    }

    // Unwinding everything must land exactly on the baseline.
    while (canUndo(history)) {
      const result = undo(history, project);
      history = result.history;
      project = result.project;
    }
    assert.equal(comparable(project), comparable(history.baseline), 'Full unwind must reach the baseline exactly');
  }

  assert.ok(undos > 50 && redos > 20 && records > 500, `Fuzz did not exercise all paths: ${records}/${undos}/${redos}`);
}

// ── Checkpoints ──────────────────────────────────────────────────────────────
{
  const limits = { checkpointInterval: 5, maxCheckpoints: 3, maxEntries: 1000 };
  let project = buildProject();
  let history = createHistory(project, limits);
  for (let i = 0; i < 30; i += 1) {
    const result = recordBatch(history, project, [envelope('toggle-step', ['trk_0'], { index: i % 16 })]);
    history = result.history;
    project = result.project;
  }
  assert.ok(history.checkpoints.length > 0, 'Checkpoints must be taken');
  assert.ok(history.checkpoints.length <= limits.maxCheckpoints, 'Checkpoints must stay bounded');
  // Rebuilding from a checkpoint must agree with the live document.
  assert.equal(comparable(materialize(history)), comparable(project), 'Checkpoint rebuild must match live state');
}

// ── Bounded storage: baseline absorbs dropped work ───────────────────────────
{
  const limits = { maxEntries: 10, checkpointInterval: 4, maxCheckpoints: 2 };
  let project = buildProject();
  let history = createHistory(project, limits);
  for (let i = 0; i < 40; i += 1) {
    const result = recordBatch(history, project, [envelope('toggle-step', ['trk_0'], { index: i % 16 })]);
    history = result.history;
    project = result.project;
  }

  assert.ok(history.entries.length <= limits.maxEntries, 'History must respect maxEntries');
  assert.ok(history.droppedEntries > 0, 'Dropped work must be reported, not silently lost');
  // Correctness survives the bound: the rebuilt document still matches.
  assert.equal(comparable(materialize(history)), comparable(project), 'Bounded history must still rebuild exactly');

  // And undoing as far as history allows lands on the (advanced) baseline.
  while (canUndo(history)) {
    const result = undo(history, project);
    history = result.history;
    project = result.project;
  }
  assert.equal(comparable(project), comparable(history.baseline), 'Bounded unwind must reach the advanced baseline');

  const stats = historyStats(history);
  assert.equal(stats.canUndo, false);
  assert.ok(stats.bytes > 0);
  assert.ok(stats.droppedEntries > 0);
}

// A tight byte ceiling must also force folding.
{
  const limits = { maxEntries: 1000, maxBytes: 8000, checkpointInterval: 50 };
  let project = buildProject();
  let history = createHistory(project, limits);
  for (let i = 0; i < 60; i += 1) {
    const result = recordBatch(history, project, [envelope('toggle-step', ['trk_0'], { index: i % 16 })]);
    history = result.history;
    project = result.project;
  }
  assert.ok(history.droppedEntries > 0, 'The byte ceiling must bound history too');
  assert.equal(comparable(materialize(history)), comparable(project), 'Byte-bounded history must still rebuild');
}

// ── Errors and the flag ──────────────────────────────────────────────────────
{
  const project = buildProject();
  const history = createHistory(project);
  assert.throws(
    () => undo(history, project),
    (error) => error.code === 'HISTORY_EMPTY',
  );
  assert.throws(
    () => redo(history, project),
    (error) => error.code === 'HISTORY_EMPTY',
  );
}

assert.equal(isExactHistoryEnabled(undefined), false, 'Exact history must be off without storage');
assert.equal(isExactHistoryEnabled({ getItem: () => null }), false, 'Exact history must default to off');
assert.equal(isExactHistoryEnabled({ getItem: () => 'on' }), true, 'Opt-in must be explicit');
assert.ok(HISTORY_LIMITS.maxEntries > 0 && HISTORY_LIMITS.maxBytes > 0);

console.log(JSON.stringify({ ok: true, fuzzTrials: 60, stepsPerTrial: 40 }, null, 2));
