// core/03-command-reducer acceptance: commands use stable targets, return
// inverses, and deterministic/property tests pass.
//
// The load-bearing property is exactness: applying a command and then its
// inverse must reproduce the original document *byte for byte*, including
// sparse steps that did not previously exist. "No entry at index 7" is a state
// the inverse has to be able to restore, and it is where a naive per-field
// patch quietly fails.
import { strict as assert } from 'node:assert';

import { createProjectV4, validateProjectV4 } from '../src/project/v4/schema.js';
import { validateCommandBatch, validateCommandEnvelope } from '../src/commands/envelope.js';
import { applyCommand, applyCommandBatch, applyInverses, getRevision } from '../src/commands/reducer.js';
import { createSeededRandom, randomInt } from '../src/commands/random.js';

function buildProject() {
  const project = createProjectV4({ id: 'prj_test', meta: { name: 'Reducer Test' } });
  project.revision = 0;
  for (let t = 0; t < 4; t += 1) {
    const id = `trk_${t}`;
    project.tracks.byId[id] = {
      id,
      name: `Track ${t + 1}`,
      stepCount: 16,
      params: { volume: 0.8, machine: 'tone' },
      // Track 1 starts with a couple of live steps so inverses have to restore
      // real prior content, not just an empty map.
      steps: t === 1 ? { 0: { active: true }, 5: { active: true, velocity: 0.5 } } : {},
    };
  }
  project.patterns.byId.pat_0 = { id: 'pat_0', name: 'P1', length: 16, tracks: ['trk_0', 'trk_1', 'trk_2', 'trk_3'] };
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

// ── Purity ───────────────────────────────────────────────────────────────────
{
  const project = buildProject();
  const before = JSON.stringify(project);
  applyCommand(project, envelope('toggle-step', ['trk_0'], { index: 3 }));
  assert.equal(JSON.stringify(project), before, 'applyCommand must not mutate its input');
}

// ── Exact inverses, including "step did not exist" ───────────────────────────
const inverseCases = [
  ['set-project-meta', [], { name: 'Renamed', description: 'x' }, {}],
  ['set-pattern-length', ['pat_0'], { length: 32 }, {}],
  ['set-track-param', ['trk_0'], { param: 'cutoff', value: 0.42 }, {}],
  ['set-track-param', ['trk_0'], { param: 'volume', value: 0.1 }, {}],
  // Toggling a step that does NOT exist: the inverse must delete it again.
  ['toggle-step', ['trk_0'], { index: 7 }, {}],
  // Toggling one that DOES exist: the inverse must restore its exact fields.
  ['toggle-step', ['trk_1'], { index: 5 }, {}],
  ['set-step', ['trk_1'], { index: 5, velocity: 0.9, accent: true }, {}],
  ['set-step', ['trk_2'], { index: 0, active: true }, {}],
  // Clearing a track that had content.
  ['clear-track', ['trk_1'], {}, {}],
  ['randomize-track-steps', ['trk_3'], { density: 0.6 }, { seed: 12345 }],
];

for (const [type, targets, payload, extra] of inverseCases) {
  const project = buildProject();
  const original = JSON.stringify(project);
  const result = applyCommand(project, envelope(type, targets, payload, extra));

  validateProjectV4(result.next);
  assert.equal(getRevision(result.next), 1, `${type} must advance the revision`);
  assert.ok(result.inverse, `${type} must return an inverse`);
  assert.ok(Array.isArray(result.touchedIds) && result.touchedIds.length > 0, `${type} must report touched ids`);
  assert.ok(Array.isArray(result.events) && result.events.length > 0, `${type} must emit events`);

  const restored = applyCommand(result.next, result.inverse).next;
  const restoredComparable = { ...restored, revision: 0 };
  assert.equal(JSON.stringify(restoredComparable), original, `${type} inverse did not exactly restore the document`);
}

// A no-op must still round-trip: setting a step back to defaults removes it.
{
  const project = buildProject();
  const result = applyCommand(project, envelope('set-step', ['trk_1'], { index: 0, active: false }));
  assert.equal(result.next.tracks.byId.trk_1.steps['0'], undefined, 'A defaulted step must not be materialized');
  const restored = applyCommand(result.next, result.inverse).next;
  assert.deepEqual(
    restored.tracks.byId.trk_1.steps,
    project.tracks.byId.trk_1.steps,
    'Inverse must re-create the step',
  );
}

// ── Determinism ──────────────────────────────────────────────────────────────
{
  const seeded = envelope('randomize-track-steps', ['trk_0'], { density: 0.5 }, { seed: 99 });
  const a = applyCommand(buildProject(), seeded).next;
  const b = applyCommand(buildProject(), seeded).next;
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'Same seed must produce identical output');

  const different = applyCommand(buildProject(), { ...seeded, seed: 100 }).next;
  assert.notEqual(
    JSON.stringify(different.tracks.byId.trk_0.steps),
    JSON.stringify(a.tracks.byId.trk_0.steps),
    'A different seed should produce a different pattern',
  );

  // The generator itself is stable across calls.
  const first = Array.from({ length: 8 }, createSeededRandom(7));
  const gen1 = createSeededRandom(7);
  const gen2 = createSeededRandom(7);
  assert.deepEqual(
    Array.from({ length: 8 }, () => gen1()),
    Array.from({ length: 8 }, () => gen2()),
    'Seeded generators must agree',
  );
  assert.ok(first.length === 8);
  const bounded = createSeededRandom(3);
  for (let i = 0; i < 200; i += 1) {
    const value = randomInt(bounded, 2, 5);
    assert.ok(value >= 2 && value <= 5, 'randomInt must stay in range');
  }
}

// A randomizing command without a seed is refused — it would be unreplayable.
assert.throws(
  () => validateCommandEnvelope(envelope('randomize-track-steps', ['trk_0'], { density: 0.5 })),
  (error) => error.code === 'COMMAND_SEED_REQUIRED',
  'Random commands must require a seed',
);

// ── Property test: random batches always invert exactly ──────────────────────
{
  const random = createSeededRandom(20260802);
  const trackIds = ['trk_0', 'trk_1', 'trk_2', 'trk_3'];
  let checked = 0;

  for (let trial = 0; trial < 300; trial += 1) {
    const project = buildProject();
    const original = JSON.stringify(project);
    const batch = [];
    const size = randomInt(random, 1, 6);

    for (let i = 0; i < size; i += 1) {
      const trackId = trackIds[randomInt(random, 0, trackIds.length - 1)];
      const pick = randomInt(random, 0, 4);
      if (pick === 0) batch.push(envelope('toggle-step', [trackId], { index: randomInt(random, 0, 15) }));
      else if (pick === 1)
        batch.push(
          envelope('set-step', [trackId], {
            index: randomInt(random, 0, 15),
            active: random() > 0.5,
            velocity: randomInt(random, 1, 10) / 10,
          }),
        );
      else if (pick === 2)
        batch.push(envelope('set-track-param', [trackId], { param: 'cutoff', value: randomInt(random, 0, 100) / 100 }));
      else if (pick === 3) batch.push(envelope('clear-track', [trackId]));
      else
        batch.push(
          envelope(
            'randomize-track-steps',
            [trackId],
            { density: randomInt(random, 0, 10) / 10 },
            { seed: randomInt(random, 0, 9999) },
          ),
        );
    }

    const result = applyCommandBatch(project, batch);
    validateProjectV4(result.next);
    const restored = applyInverses(result.next, result.inverses);
    assert.equal(
      JSON.stringify({ ...restored, revision: 0 }),
      original,
      `Batch of ${size} did not invert exactly on trial ${trial}`,
    );
    checked += 1;
  }
  assert.equal(checked, 300);
}

// ── Batches are atomic ───────────────────────────────────────────────────────
{
  const project = buildProject();
  const before = JSON.stringify(project);
  assert.throws(
    () =>
      applyCommandBatch(project, [
        envelope('toggle-step', ['trk_0'], { index: 1 }),
        envelope('set-track-param', ['trk_0'], { param: '__proto__', value: 'x' }),
      ]),
    (error) => error.code === 'COMMAND_DANGEROUS_KEY',
  );
  assert.equal(JSON.stringify(project), before, 'A rejected batch must not mutate the project');
}

// ── Stable targets, not implicit selection ───────────────────────────────────
assert.throws(
  () => applyCommand(buildProject(), envelope('toggle-step', [], { index: 0 })),
  (error) => error.code === 'COMMAND_TARGET_INVALID',
  'A command with no target must be refused, never fall back to a selection',
);
assert.throws(
  () => applyCommand(buildProject(), envelope('toggle-step', ['trk_nope'], { index: 0 })),
  (error) => error.code === 'COMMAND_TARGET_UNKNOWN',
);
assert.throws(
  () => applyCommand(buildProject(), envelope('toggle-step', ['trk_0'], { index: 999 })),
  (error) => error.code === 'COMMAND_TARGET_INVALID',
);

// ── Envelope validation ──────────────────────────────────────────────────────
assert.throws(
  () => validateCommandEnvelope({ ...envelope('toggle-step', ['trk_0'], { index: 0 }), extra: true }),
  (error) => error.code === 'COMMAND_SCHEMA_INVALID',
  'Unknown envelope fields must be rejected',
);
assert.throws(
  () => validateCommandEnvelope(envelope('toggle-step', ['trk_0'], { index: 0, nope: 1 })),
  (error) => error.code === 'COMMAND_SCHEMA_INVALID',
  'Unknown payload fields must be rejected',
);
assert.throws(
  () => validateCommandEnvelope(envelope('not-a-command', ['trk_0'])),
  (error) => error.code === 'COMMAND_TYPE_UNKNOWN',
);
assert.throws(
  () =>
    validateCommandEnvelope(
      JSON.parse(
        '{"id":"x","type":"clear-track","baseRevision":0,"targetIds":["trk_0"],"payload":{},"__proto__":{"polluted":true}}',
      ),
    ),
  (error) => error.code === 'COMMAND_SCHEMA_INVALID',
  'Prototype-bearing envelope keys must be rejected',
);
assert.throws(
  () => validateCommandBatch(Array.from({ length: 65 }, () => envelope('clear-track', ['trk_0']))),
  (error) => error.code === 'COMMAND_COLLECTION_LIMIT',
);

// Internal inverse types must not be accepted from a caller.
assert.throws(
  () => validateCommandEnvelope({ ...envelope('clear-track', ['trk_0']), type: '__restore-steps' }),
  (error) => error.code === 'COMMAND_TYPE_UNKNOWN',
  'Internal inverse types must not be publicly constructible',
);

// ── Revision conflicts are detected ──────────────────────────────────────────
{
  const project = buildProject();
  const first = applyCommand(project, envelope('toggle-step', ['trk_0'], { index: 0 })).next;
  assert.throws(
    () => applyCommand(first, envelope('toggle-step', ['trk_0'], { index: 1 })),
    (error) => error.code === 'COMMAND_REVISION_CONFLICT',
    'A stale baseRevision must be refused',
  );
}

console.log(JSON.stringify({ ok: true, inverseCases: inverseCases.length, propertyTrials: 300 }, null, 2));
