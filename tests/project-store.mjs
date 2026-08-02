// core/06-persistence acceptance: fresh, migrated, corrupt, quota-full,
// offline, recovery, and backup paths pass.
//
// Every path is driven through the real store logic with a backend that fails
// the way browsers actually fail — QuotaExceededError by name, and rejected
// reads for the offline/unavailable case — rather than being asserted from a
// shallow stub that always succeeds.
import { strict as assert } from 'node:assert';

import { createProjectV4, validateProjectV4 } from '../src/project/v4/index.js';
import {
  BACKUP_KEY_PREFIX,
  ProjectStoreError,
  createMemoryBackend,
  createProjectStore,
  isRecordStoreEnabled,
} from '../src/project/store.js';

function buildV4() {
  const project = createProjectV4({ id: 'prj_store', meta: { name: 'Store Test' } });
  project.revision = 0;
  project.tracks.byId.trk_0 = {
    id: 'trk_0',
    name: 'T1',
    stepCount: 16,
    params: { volume: 0.7 },
    steps: { 1: { active: true } },
  };
  project.patterns.byId.pat_0 = { id: 'pat_0', name: 'P1', length: 16, tracks: ['trk_0'] };
  project.banks.byId.bnk_0 = { id: 'bnk_0', name: 'A', patterns: ['pat_0'] };
  project.banks.order.push('bnk_0');
  validateProjectV4(project);
  return project;
}

/** A v3 localStorage payload, the shape a real returning user would have. */
function legacyV3Payload() {
  return JSON.stringify({
    bpm: 124,
    project: {
      name: 'Legacy Session',
      author: 'Fixture',
      banks: [
        {
          name: 'A',
          patterns: [
            {
              name: 'P1',
              length: 16,
              kit: {
                tracks: [{ name: 'Kick', machine: 'tone', volume: 0.9, steps: [{ active: true }, { active: false }] }],
              },
            },
          ],
        },
      ],
    },
  });
}

function fakeLocalStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _map: map,
  };
}

function quotaError() {
  const error = new Error('The quota has been exceeded.');
  error.name = 'QuotaExceededError';
  return error;
}

const results = {};

// ── 1. Fresh ─────────────────────────────────────────────────────────────────
{
  const store = createProjectStore({ backend: createMemoryBackend() });
  const loaded = await store.load();
  assert.equal(loaded.outcome, 'fresh', 'An empty store must report fresh, not corrupt');
  assert.equal(loaded.project, null);
  results.fresh = loaded.outcome;
}

// ── 2. Save then load round-trips ────────────────────────────────────────────
{
  const store = createProjectStore({ backend: createMemoryBackend() });
  const project = buildV4();
  const saved = await store.save(project);
  assert.equal(saved.outcome, 'saved');
  const loaded = await store.load();
  assert.equal(loaded.outcome, 'loaded');
  assert.equal(JSON.stringify(loaded.project), JSON.stringify(project), 'A stored project must round-trip exactly');
  results.roundTrip = 'loaded';
}

// ── 3. Migrated, with the backup written BEFORE anything else ────────────────
{
  const legacy = fakeLocalStorage({ 'confustudio-v3': legacyV3Payload() });
  const backend = createMemoryBackend();
  const store = createProjectStore({ backend, legacyStorage: legacy });

  const migration = await store.migrateFromLegacy();
  assert.ok(migration.outcome.startsWith('migrated'), `Expected migration, got ${migration.outcome}`);
  assert.ok(migration.backup, 'Migration must produce a pre-migration backup');
  assert.equal(migration.backup.entries['confustudio-v3'], legacyV3Payload(), 'Backup must hold the original bytes');
  validateProjectV4(migration.project);

  // The legacy key must survive: rollback means running the previous build,
  // which reads localStorage and has to still find it.
  assert.equal(legacy.getItem('confustudio-v3'), legacyV3Payload(), 'Migration must not delete the legacy record');

  const loaded = await store.load();
  assert.equal(loaded.outcome, 'loaded', 'The migrated record must be readable');
  results.migrated = migration.outcome;
}

// ── 4. Corrupt ───────────────────────────────────────────────────────────────
{
  // Corrupt stored record: reported, not thrown, so the app can still start.
  const backend = createMemoryBackend();
  await backend.put('current', { id: 'current', project: { formatVersion: 4, nonsense: true } });
  const loaded = await createProjectStore({ backend }).load();
  assert.equal(loaded.outcome, 'corrupt', 'A mangled record must be reported as corrupt');
  assert.equal(loaded.project, null, 'A corrupt record must not yield a project');

  // Corrupt legacy payload during migration.
  const legacy = fakeLocalStorage({ 'confustudio-v3': '{not json' });
  const migration = await createProjectStore({
    backend: createMemoryBackend(),
    legacyStorage: legacy,
  }).migrateFromLegacy();
  assert.equal(migration.outcome, 'corrupt');
  assert.equal(migration.reason, 'IMPORT_JSON_INVALID');
  assert.ok(migration.backup, 'A corrupt migration must STILL have produced a backup');
  results.corrupt = 'corrupt';
}

// ── 5. Quota-full ────────────────────────────────────────────────────────────
{
  const backend = {
    ...createMemoryBackend(),
    async put() {
      throw quotaError();
    },
  };
  const store = createProjectStore({ backend });
  await assert.rejects(
    () => store.save(buildV4()),
    (error) => error instanceof ProjectStoreError && error.code === 'STORE_QUOTA_EXCEEDED',
    'Quota exhaustion must be distinguishable from a generic write failure',
  );

  // And during migration, quota must be reported without losing the backup.
  const legacy = fakeLocalStorage({ 'confustudio-v3': legacyV3Payload() });
  const migration = await createProjectStore({ backend, legacyStorage: legacy }).migrateFromLegacy();
  assert.equal(migration.outcome, 'quota-exceeded');
  assert.ok(migration.backup, 'The backup must survive a quota failure');
  assert.equal(
    legacy.getItem('confustudio-v3'),
    legacyV3Payload(),
    'Legacy data must be intact after a failed migration',
  );
  results.quotaFull = migration.outcome;
}

// ── 6. Offline / storage unavailable ─────────────────────────────────────────
{
  // A blocked or unavailable store must degrade to a report, not an exception
  // at startup.
  const backend = {
    ...createMemoryBackend(),
    async get() {
      throw new Error('database is blocked');
    },
  };
  const loaded = await createProjectStore({ backend }).load();
  assert.equal(loaded.outcome, 'unavailable', 'An unreadable store must report unavailable');
  assert.equal(loaded.project, null);

  // A generic (non-quota) write failure is reported distinctly from quota.
  const writeFail = {
    ...createMemoryBackend(),
    async put() {
      throw new Error('disk gone');
    },
  };
  await assert.rejects(
    () => createProjectStore({ backend: writeFail }).save(buildV4()),
    (error) => error.code === 'STORE_WRITE_FAILED',
  );
  results.offline = 'unavailable';
}

// ── 7. Recovery: an older record is rescued rather than declared corrupt ─────
{
  const backend = createMemoryBackend();
  // A v3-shaped payload sitting in the record store — recoverable, not corrupt.
  await backend.put('current', { id: 'current', project: JSON.parse(legacyV3Payload()) });
  const loaded = await createProjectStore({ backend }).load();
  assert.equal(loaded.outcome, 'recovered', 'A migratable record must be recovered, not rejected');
  validateProjectV4(loaded.project);
  assert.ok(loaded.report, 'Recovery must report what it did');
  results.recovery = loaded.outcome;
}

// ── 8. Backup and restore round-trip ─────────────────────────────────────────
{
  const legacy = fakeLocalStorage({ 'confustudio-v3': legacyV3Payload() });
  const backend = createMemoryBackend();
  const store = createProjectStore({ backend, legacyStorage: legacy });

  const exported = store.exportLegacyBackup();
  assert.ok(exported, 'Backup export must produce a payload');
  assert.equal(exported.format, 'confustudio-premigration-backup');

  await store.migrateFromLegacy();
  const stored = await store.readBackup();
  assert.ok(stored, 'The backup must be persisted, not left to a downloaded file');
  assert.equal(stored.entries['confustudio-v3'], legacyV3Payload());
  assert.ok(await backend.get(BACKUP_KEY_PREFIX), 'Backup must be addressable in the store');

  // Simulate the user having lost their legacy keys, then roll back.
  legacy.removeItem('confustudio-v3');
  assert.equal(legacy.getItem('confustudio-v3'), null);
  const restored = await store.restoreFromBackup();
  assert.equal(restored.outcome, 'restored');
  assert.equal(legacy.getItem('confustudio-v3'), legacyV3Payload(), 'Rollback must restore the original bytes exactly');
  results.backup = 'restored';
}

// No legacy data at all is "fresh", not an error.
{
  const store = createProjectStore({ backend: createMemoryBackend(), legacyStorage: fakeLocalStorage() });
  const migration = await store.migrateFromLegacy();
  assert.equal(migration.outcome, 'fresh');
  assert.equal(migration.backup, null);
}

// ── The flag stays off ───────────────────────────────────────────────────────
assert.equal(isRecordStoreEnabled(undefined), false, 'The record store must be off without storage');
assert.equal(isRecordStoreEnabled({ getItem: () => null }), false, 'The record store must default to off');
assert.equal(isRecordStoreEnabled({ getItem: () => 'on' }), true, 'Opt-in must be explicit');

console.log(JSON.stringify({ ok: true, paths: results }, null, 2));
