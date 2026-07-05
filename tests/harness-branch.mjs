// Phase B3 — Branch lifecycle tests.
//
// A real B2 proposal → open → audition (non-destructive) → merge | discard.
// Proves: head is untouched until a human merges; audition previews on a clone;
// merge replays relative to CURRENT head (concurrent edits survive); merge is
// once-only; the branches compartment persists (serializable, in the default).

import { strict as assert } from 'node:assert';

import { runAgent } from '../src/harness/loop.mjs';
import { mockProvider, callTurn } from '../src/harness/providers/mock.js';
import { textTurn } from '../src/harness/ir.js';
import {
  openBranch,
  auditionBranch,
  mergeBranch,
  discardBranch,
  getBranch,
  listBranches,
  BRANCH_STATUS,
} from '../src/harness/branch.js';
import { createAppState } from '../src/state.js';
import { executeStudioCommand, captureCommandState } from '../src/command-bus.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};

async function proposeBpmAndFill(state, bpm, trackIndex) {
  const provider = mockProvider([
    callTurn('t', 'set_transport', { bpm }),
    callTurn('f', 'fill_track', { trackIndex, interval: 4 }),
    textTurn('Done.'),
  ]);
  const { proposal } = await runAgent({ provider, task: `set ${bpm} bpm + kick`, state });
  return proposal;
}

// ── 1. Default state ships the branches compartment (serializable) ─────
{
  const state = createAppState();
  ok(
    state.branches && state.branches.items && state.branches.activeAuditionId === null,
    'branches compartment present',
  );
  const roundTrip = JSON.parse(JSON.stringify(state.branches));
  ok(roundTrip && typeof roundTrip.items === 'object', 'branches compartment is JSON-serializable');
}

// ── 2. open → audition is NON-DESTRUCTIVE ──────────────────────────────
{
  const state = createAppState();
  const bpmBefore = state.bpm;
  const proposal = await proposeBpmAndFill(state, 140, 0);
  const id = openBranch(state, proposal);

  ok(getBranch(state, id).status === BRANCH_STATUS.OPEN, 'branch opens in open status');
  const audition = auditionBranch(state, id);
  ok(audition.ok && audition.preview.bpm === 140, 'audition preview reflects the proposal (140 bpm)');
  ok(state.bpm === bpmBefore, 'HEAD is untouched by audition');
  ok(state.branches.activeAuditionId === id, 'audition marks the active branch');
}

// ── 3. merge applies to head; branch becomes merged ────────────────────
{
  const state = createAppState();
  const proposal = await proposeBpmAndFill(state, 140, 0);
  const id = openBranch(state, proposal);
  const res = mergeBranch(state, id);
  ok(res.ok && res.changed, 'merge reports a change');
  ok(state.bpm === 140, 'HEAD now reflects the merged branch');
  ok(getBranch(state, id).status === BRANCH_STATUS.MERGED, 'branch marked merged');
  ok(state.branches.activeAuditionId === null, 'audition cleared after merge');
}

// ── 4. merge is relative to CURRENT head (concurrent edits survive) ────
{
  const state = createAppState();
  // Branch: fill track 0.
  const provider = mockProvider([callTurn('f', 'fill_track', { trackIndex: 0, interval: 4 }), textTurn('.')]);
  const { proposal } = await runAgent({ provider, task: 'kick on t0', state });
  const id = openBranch(state, proposal);

  // Meanwhile the user edits head: fill track 1.
  executeStudioCommand(state, { type: 'fill-track-steps', trackIndex: 1, interval: 2 });
  const t1SigAfterHeadEdit = JSON.stringify(
    state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[1].steps,
  );

  // Merge the branch: t0 change applies ON TOP of the head edit; t1 edit survives.
  mergeBranch(state, id);
  const tracks = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks;
  const t1SigAfterMerge = JSON.stringify(tracks[1].steps);
  ok(t1SigAfterMerge === t1SigAfterHeadEdit, 'concurrent head edit (t1) survives the merge');
  ok(
    tracks[0].steps.some((s, i) => s.active && i % 4 === 0),
    'branch edit (t0) is applied to current head',
  );
}

// ── 5. merge is once-only; discard blocks merge ────────────────────────
{
  const state = createAppState();
  const proposal = await proposeBpmAndFill(state, 130, 0);
  const id = openBranch(state, proposal);
  ok(mergeBranch(state, id).ok, 'first merge succeeds');
  ok(!mergeBranch(state, id).ok, 'second merge is rejected (not open)');

  const proposal2 = await proposeBpmAndFill(state, 118, 1);
  const id2 = openBranch(state, proposal2);
  ok(discardBranch(state, id2).ok, 'discard succeeds');
  ok(getBranch(state, id2).status === BRANCH_STATUS.DISCARDED, 'branch marked discarded');
  ok(!mergeBranch(state, id2).ok, 'a discarded branch cannot be merged');
}

// ── 6. discard leaves head untouched ───────────────────────────────────
{
  const state = createAppState();
  const snapshot = JSON.stringify(captureCommandState(state));
  const proposal = await proposeBpmAndFill(state, 155, 2);
  const id = openBranch(state, proposal);
  discardBranch(state, id);
  ok(JSON.stringify(captureCommandState(state)) === snapshot, 'discarding never touched head');
  ok(listBranches(state, { status: BRANCH_STATUS.OPEN }).length === 0, 'no open branches remain');
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));
