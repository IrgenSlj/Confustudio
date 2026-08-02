// core/05-proposals acceptance: audition equals merge, hashes match, target
// drift is impossible, and conflicts are explicit.
import { strict as assert } from 'node:assert';

import { createProjectV4, validateProjectV4 } from '../src/project/v4/schema.js';
import { createSeededRandom, randomInt } from '../src/commands/random.js';
import { applyCommandBatch } from '../src/commands/reducer.js';
import {
  auditionProposal,
  canonicalJson,
  contentHash,
  createProposal,
  detectConflicts,
  discardProposal,
  mergeProposal,
  verifyProposal,
} from '../src/commands/proposal.js';

function buildProject() {
  const project = createProjectV4({ id: 'prj_prop', meta: { name: 'Proposal Test' } });
  project.revision = 0;
  for (let t = 0; t < 3; t += 1) {
    const id = `trk_${t}`;
    project.tracks.byId[id] = {
      id,
      name: `Track ${t + 1}`,
      stepCount: 16,
      params: { volume: 0.8 },
      steps: t === 0 ? { 3: { active: true } } : {},
    };
  }
  project.patterns.byId.pat_0 = { id: 'pat_0', name: 'P1', length: 16, tracks: ['trk_0', 'trk_1', 'trk_2'] };
  project.banks.byId.bnk_0 = { id: 'bnk_0', name: 'A', patterns: ['pat_0'] };
  project.banks.order.push('bnk_0');
  validateProjectV4(project);
  return project;
}

const envelope = (type, targetIds, payload = {}, extra = {}) => ({
  id: `cmd_${type}`,
  type,
  baseRevision: 0,
  targetIds,
  payload,
  ...extra,
});

const comparable = (project) => JSON.stringify({ ...project, revision: 0 });

// ── Canonical hashing ────────────────────────────────────────────────────────
assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }), 'Key order must not affect canonical form');
assert.equal(contentHash({ b: 1, a: 2 }), contentHash({ a: 2, b: 1 }), 'Key order must not affect the hash');
assert.notEqual(contentHash({ a: 1 }), contentHash({ a: 2 }), 'Different content must hash differently');
assert.equal(contentHash({ a: [1, 2] }), contentHash({ a: [1, 2] }), 'Hashing must be stable');
assert.notEqual(contentHash({ a: [1, 2] }), contentHash({ a: [2, 1] }), 'Array order is content');

// ── Audition equals merge, exactly ───────────────────────────────────────────
{
  const project = buildProject();
  const proposal = createProposal(project, [
    envelope('toggle-step', ['trk_1'], { index: 5 }),
    envelope('set-track-param', ['trk_1'], { param: 'cutoff', value: 0.3 }),
    envelope('randomize-track-steps', ['trk_2'], { density: 0.5 }, { seed: 777 }),
  ]);

  const auditioned = auditionProposal(project, proposal);
  const merged = mergeProposal(project, proposal);
  // Compared WITHOUT normalizing revision: "audition equals merge" has to mean
  // the whole document, revision included. Normalizing it here would hide a
  // divergence in the one field most likely to drift between two code paths.
  assert.equal(
    JSON.stringify(auditioned.project),
    JSON.stringify(merged.project),
    'Audition and merge must be byte-identical, revision included',
  );
  assert.deepEqual(auditioned.conflicts, [], 'A fresh proposal must not conflict');

  // Audition is non-destructive.
  assert.equal(comparable(project), comparable(buildProject()), 'Audition must not touch the input project');

  // Auditioning repeatedly is stable — no re-derived randomness.
  const again = auditionProposal(project, proposal);
  assert.equal(comparable(again.project), comparable(auditioned.project), 'Repeated audition must be identical');
}

// The materialized patch is independent of re-running seeded commands.
{
  const project = buildProject();
  const commands = [envelope('randomize-track-steps', ['trk_2'], { density: 0.5 }, { seed: 4242 })];
  const proposal = createProposal(project, commands);
  const direct = applyCommandBatch(project, commands).next;
  assert.equal(
    JSON.stringify(proposal.patch.trk_2.steps),
    JSON.stringify(direct.tracks.byId.trk_2.steps),
    'A materialized patch must equal what the commands actually produced',
  );
}

// ── Hashes match, and tampering is detected ──────────────────────────────────
{
  const project = buildProject();
  const proposal = createProposal(project, [envelope('toggle-step', ['trk_1'], { index: 2 })]);
  assert.ok(proposal.contentHash, 'A proposal must carry a content hash');
  assert.equal(verifyProposal(proposal), proposal, 'A well-formed proposal must verify');

  // Tamper with the patch after the fact — the hash must catch it, so audition
  // and merge cannot be handed different content.
  const tampered = structuredClone(proposal);
  tampered.patch.trk_1.steps['9'] = { active: true };
  assert.throws(
    () => verifyProposal(tampered),
    (error) => error.code === 'PROPOSAL_HASH_MISMATCH',
  );
  assert.throws(
    () => auditionProposal(project, tampered),
    (error) => error.code === 'PROPOSAL_HASH_MISMATCH',
  );
  assert.throws(
    () => mergeProposal(project, tampered),
    (error) => error.code === 'PROPOSAL_HASH_MISMATCH',
  );
}

// ── Target drift is impossible ───────────────────────────────────────────────
{
  const project = buildProject();
  const proposal = createProposal(project, [envelope('set-track-param', ['trk_1'], { param: 'cutoff', value: 0.9 })]);

  // Someone else edits the same track after the proposal was built.
  const moved = applyCommandBatch(project, [envelope('toggle-step', ['trk_1'], { index: 7 })]).next;

  const conflicts = detectConflicts(moved, proposal);
  assert.equal(conflicts.length, 1, 'A drifted target must be reported');
  assert.deepEqual(conflicts[0], { id: 'trk_1', reason: 'target-drift' });

  assert.throws(
    () => mergeProposal(moved, proposal),
    (error) => error.code === 'PROPOSAL_CONFLICT' && error.details.conflicts[0].id === 'trk_1',
    'Merging onto a drifted target must be refused, never silently overwrite',
  );

  // Audition still previews, but reports the conflict rather than hiding it.
  const auditioned = auditionProposal(moved, proposal);
  assert.equal(auditioned.conflicts.length, 1, 'Audition must surface the conflict');
}

// An edit to a DIFFERENT track must not block the merge.
{
  const project = buildProject();
  const proposal = createProposal(project, [envelope('set-track-param', ['trk_1'], { param: 'cutoff', value: 0.9 })]);
  const elsewhere = applyCommandBatch(project, [envelope('toggle-step', ['trk_2'], { index: 1 })]).next;
  assert.deepEqual(detectConflicts(elsewhere, proposal), [], 'Untouched targets must not conflict');
  const merged = mergeProposal(elsewhere, proposal);
  assert.equal(merged.project.tracks.byId.trk_1.params.cutoff, 0.9);
  assert.equal(merged.project.tracks.byId.trk_2.steps['1'].active, true, 'Concurrent work must survive the merge');
}

// A vanished target is an explicit conflict, not a crash.
{
  const project = buildProject();
  const proposal = createProposal(project, [envelope('toggle-step', ['trk_1'], { index: 1 })]);
  const without = structuredClone(project);
  delete without.tracks.byId.trk_1;
  without.patterns.byId.pat_0.tracks = ['trk_0', 'trk_2'];
  assert.deepEqual(detectConflicts(without, proposal), [{ id: 'trk_1', reason: 'target-missing' }]);
  assert.throws(
    () => mergeProposal(without, proposal),
    (error) => error.code === 'PROPOSAL_CONFLICT',
  );
}

// ── Discard restores the pre-merge values ────────────────────────────────────
{
  const project = buildProject();
  const original = comparable(project);
  const proposal = createProposal(project, [
    envelope('toggle-step', ['trk_1'], { index: 5 }),
    envelope('clear-track', ['trk_0']),
  ]);
  const merged = mergeProposal(project, proposal).project;
  assert.notEqual(comparable(merged), original);
  assert.equal(comparable(discardProposal(merged, proposal)), original, 'Discard must restore exactly');
}

// ── Rollback switch ──────────────────────────────────────────────────────────
{
  const project = buildProject();
  const proposal = createProposal(project, [envelope('toggle-step', ['trk_1'], { index: 1 })]);
  assert.throws(
    () => mergeProposal(project, proposal, { allowMutation: false }),
    (error) => error.code === 'PROPOSAL_MUTATION_DISABLED',
    'Mutation must be disableable while records stay readable',
  );
  // Records remain readable and auditionable with mutation disabled.
  assert.ok(verifyProposal(proposal));
  assert.ok(auditionProposal(project, proposal).project);
}

// ── Fuzz: audition always equals merge, drift is always caught ───────────────
{
  const random = createSeededRandom(505);
  const trackIds = ['trk_0', 'trk_1', 'trk_2'];
  let conflictsSeen = 0;
  let mergesSeen = 0;

  for (let trial = 0; trial < 200; trial += 1) {
    const project = buildProject();
    const size = randomInt(random, 1, 3);
    const commands = Array.from({ length: size }, () => {
      const trackId = trackIds[randomInt(random, 0, 2)];
      const pick = randomInt(random, 0, 2);
      if (pick === 0) return envelope('toggle-step', [trackId], { index: randomInt(random, 0, 15) });
      if (pick === 1)
        return envelope('set-track-param', [trackId], { param: 'cutoff', value: randomInt(random, 0, 9) / 10 });
      return envelope('randomize-track-steps', [trackId], { density: 0.4 }, { seed: randomInt(random, 0, 999) });
    });

    const proposal = createProposal(project, commands);

    // Half the time, disturb a random track first.
    const disturb = randomInt(random, 0, 1) === 1;
    const target = disturb
      ? applyCommandBatch(project, [envelope('toggle-step', [trackIds[randomInt(random, 0, 2)]], { index: 11 })]).next
      : project;

    const conflicts = detectConflicts(target, proposal);
    const auditioned = auditionProposal(target, proposal);
    assert.deepEqual(auditioned.conflicts, conflicts, 'Audition must report the same conflicts as detectConflicts');

    if (conflicts.length > 0) {
      conflictsSeen += 1;
      assert.throws(
        () => mergeProposal(target, proposal),
        (error) => error.code === 'PROPOSAL_CONFLICT',
      );
    } else {
      mergesSeen += 1;
      const merged = mergeProposal(target, proposal);
      assert.equal(
        JSON.stringify(auditioned.project),
        JSON.stringify(merged.project),
        `Audition diverged from merge on trial ${trial}`,
      );
      validateProjectV4(merged.project);
    }
  }
  assert.ok(conflictsSeen > 20 && mergesSeen > 20, `Fuzz did not exercise both paths: ${conflictsSeen}/${mergesSeen}`);
}

console.log(JSON.stringify({ ok: true, fuzzTrials: 200 }, null, 2));
