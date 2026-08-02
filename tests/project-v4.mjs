// core/02-project-v4 acceptance: every fixture in the manifest has an explicit
// outcome, and valid migrations round-trip.
//
// The manifest declares expectedFutureOutcome per fixture; this test holds the
// migrator to it, so adding a fixture without deciding its outcome fails.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_STEP,
  FORMAT_VERSION,
  V4_LIMITS,
  detectProjectFormat,
  isDefaultStep,
  isProjectV4Enabled,
  migrateToV4,
  projectV4ToV3,
  toDenseSteps,
  toSparseSteps,
  validateProjectV4,
} from '../src/project/v4/index.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'projects');
const manifest = JSON.parse(await readFile(path.join(fixtureDir, 'manifest.json'), 'utf8'));

// Maps the manifest's declared outcome onto what the migrator must actually do.
const ACCEPTS = new Set(['migrate', 'migrate-with-report']);
const REJECTS = new Set(['reject-with-recovery-export', 'reject-before-normalization', 'reject-or-render-as-text']);

const results = [];

for (const fixture of manifest.fixtures) {
  const source = await readFile(path.join(fixtureDir, fixture.file), 'utf8');
  const expected = fixture.expectedFutureOutcome;

  let parsed;
  let parseFailed = false;
  try {
    parsed = JSON.parse(source);
  } catch (_) {
    parseFailed = true;
  }

  if (!fixture.validJson) {
    assert.ok(parseFailed, `${fixture.file} is declared invalid JSON but parsed`);
    assert.ok(REJECTS.has(expected), `${fixture.file} is unparseable so it must be a reject outcome`);
    results.push({ file: fixture.file, outcome: 'reject', reason: 'invalid-json' });
    continue;
  }

  assert.ok(!parseFailed, `${fixture.file} is declared valid JSON but failed to parse`);
  const result = migrateToV4(parsed);

  // "reject-or-render-as-text" is deliberately an either/or: migrating is fine
  // provided hostile markup survives as an inert string and never becomes
  // structure. Anything else in REJECTS must actually be refused.
  if (expected === 'reject-or-render-as-text') {
    if (result.outcome === 'reject') {
      assert.ok(result.code, `${fixture.file} rejection must carry a stable code`);
      results.push({ file: fixture.file, outcome: 'reject', code: result.code });
      continue;
    }
    assert.ok(result.ok, `${fixture.file} must either reject or migrate cleanly`);
    validateProjectV4(result.project);
    const name = result.project.meta.name;
    assert.equal(typeof name, 'string', 'Hostile name must remain a string');
    assert.ok(name.includes('<img'), 'Hostile markup must be preserved verbatim, not stripped into something new');
    // The payload must stay data. It must never have become a key, a nested
    // structure, or anything the app would treat as anything but text.
    const bankNames = result.project.banks.order.map((id) => result.project.banks.byId[id].name);
    for (const bankName of bankNames) assert.equal(typeof bankName, 'string', 'Hostile bank name must stay a string');
    assert.equal(Object.getPrototypeOf(result.project.meta), Object.prototype, 'meta must keep a clean prototype');
    results.push({ file: fixture.file, outcome: result.outcome, hostileTextPreserved: true });
    continue;
  }

  if (REJECTS.has(expected)) {
    assert.equal(result.outcome, 'reject', `${fixture.file} must be rejected (declared ${expected})`);
    assert.ok(result.code, `${fixture.file} rejection must carry a stable code`);
    assert.equal(result.project, null, `${fixture.file} must not yield a project when rejected`);
    results.push({ file: fixture.file, outcome: result.outcome, code: result.code });
    continue;
  }

  assert.ok(ACCEPTS.has(expected), `${fixture.file} has an unhandled expected outcome: ${expected}`);
  assert.ok(result.ok, `${fixture.file} must migrate, got ${result.outcome}: ${result.reason}`);
  assert.equal(result.project.formatVersion, FORMAT_VERSION);
  validateProjectV4(result.project);

  // "migrate-with-report" must actually carry a report, not just succeed.
  if (expected === 'migrate-with-report') {
    assert.equal(result.outcome, 'migrate-with-report', `${fixture.file} must report on what it changed`);
    assert.ok(
      result.report.quarantined.length > 0 || result.report.notes.length > 0,
      `${fixture.file} reported no quarantined fields or notes`,
    );
  }

  // Round-trip: v4 -> v3 projection -> back to v4 must be stable.
  const projected = projectV4ToV3(result.project);
  const round = migrateToV4({ project: projected });
  assert.ok(round.ok, `${fixture.file} failed to round-trip back into v4: ${round.reason}`);
  assert.deepEqual(
    round.project.banks.order.map((id) => round.project.banks.byId[id].patterns.length),
    result.project.banks.order.map((id) => result.project.banks.byId[id].patterns.length),
    `${fixture.file} changed its bank/pattern shape across a round-trip`,
  );

  const originalSteps = Object.values(result.project.tracks.byId).map((t) => Object.keys(t.steps).length);
  const roundSteps = Object.values(round.project.tracks.byId).map((t) => Object.keys(t.steps).length);
  assert.deepEqual(roundSteps, originalSteps, `${fixture.file} gained or lost steps across a round-trip`);

  results.push({
    file: fixture.file,
    outcome: result.outcome,
    sourceFormat: result.report.sourceFormat,
    quarantined: result.report.quarantined.length,
  });
}

// ── Sparseness ───────────────────────────────────────────────────────────────
// The point of v4: untouched steps are not serialized at all.
assert.deepEqual(toSparseSteps([]), {}, 'No steps means no entries');
assert.deepEqual(
  toSparseSteps([{ ...DEFAULT_STEP }, { ...DEFAULT_STEP }]),
  {},
  'Default steps must not be materialized',
);
const sparse = toSparseSteps([{ ...DEFAULT_STEP }, { ...DEFAULT_STEP, active: true }, { ...DEFAULT_STEP }]);
assert.deepEqual(Object.keys(sparse), ['1'], 'Only the non-default step is stored');
assert.deepEqual(sparse['1'], { active: true }, 'Only the differing field is stored');
assert.ok(isDefaultStep({ ...DEFAULT_STEP }));
assert.ok(!isDefaultStep({ ...DEFAULT_STEP, paramLocks: { cutoff: 0.2 } }), 'A param lock makes a step meaningful');

// Dense expansion restores positions exactly.
const dense = toDenseSteps(sparse, 3);
assert.equal(dense.length, 3);
assert.equal(dense[0].active, false);
assert.equal(dense[1].active, true);
assert.equal(dense[2].active, false);

// ── Limits are enforced before normalization ─────────────────────────────────
const tooManyBanks = { project: { name: 'x', banks: Array.from({ length: V4_LIMITS.banks + 1 }, () => null) } };
const limitResult = migrateToV4(tooManyBanks);
assert.equal(limitResult.outcome, 'reject');
assert.equal(limitResult.code, 'V4_COLLECTION_LIMIT');

// ── Unknown fields are quarantined, never merged ─────────────────────────────
const hostileTrack = {
  project: {
    name: 'q',
    banks: [
      {
        name: 'A',
        patterns: [
          { name: 'P', kit: { tracks: [{ name: 't', volume: 0.5, __weird: 'nope', cutoff: 'not-a-number' }] } },
        ],
      },
    ],
  },
};
const quarantineResult = migrateToV4(hostileTrack);
assert.ok(quarantineResult.ok);
const migratedTrack = Object.values(quarantineResult.project.tracks.byId)[0];
assert.equal(migratedTrack.params.volume, 0.5, 'Known, correctly typed params survive');
assert.equal(migratedTrack.params.__weird, undefined, 'Unknown fields must not be merged');
assert.equal(migratedTrack.params.cutoff, undefined, 'Wrongly typed known fields must not be merged');
assert.deepEqual(quarantineResult.report.quarantined[0].fields, ['__weird', 'cutoff']);
assert.equal(Object.getPrototypeOf(migratedTrack.params), Object.prototype, 'params must keep a clean prototype');

// ── Format detection ─────────────────────────────────────────────────────────
assert.equal(detectProjectFormat({ formatVersion: 4 }), 'v4');
assert.equal(detectProjectFormat({ project: { banks: [] } }), 'v3');
assert.equal(detectProjectFormat({ version: 2, state: { tracks: [] } }), 'v2');
assert.equal(detectProjectFormat({ version: 1, tracks: [] }), 'v1');
assert.equal(detectProjectFormat(null), 'unknown');
assert.equal(migrateToV4('nope').outcome, 'reject');

// ── The flag stays off ───────────────────────────────────────────────────────
assert.equal(isProjectV4Enabled(undefined), false, 'v4 must be off when there is no storage');
assert.equal(isProjectV4Enabled({ getItem: () => null }), false, 'v4 must default to off');
assert.equal(isProjectV4Enabled({ getItem: () => 'on' }), true, 'v4 opt-in must be explicit');

console.log(JSON.stringify({ ok: true, fixtures: results }, null, 2));
