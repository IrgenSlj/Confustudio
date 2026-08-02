import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

import { executeStudioCommands } from '../src/command-bus.js';
import {
  assertImportTextSize,
  inspectBoundedValue,
  parseJsonImportText,
  validateKitImport,
  validateMidiMapImport,
  validatePatternImport,
  validateProjectImport,
} from '../src/security/runtime-validation.js';
import { validateStudioCommand, validateStudioCommandBatch } from '../src/security/command-validation.js';
import { applyProjectPackageToState, createAppState, createProjectPackage } from '../src/state.js';

const fixture = (name) => readFile(new URL(`./fixtures/projects/${name}`, import.meta.url), 'utf8');

function assertBoundaryCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `Expected boundary error ${code}`);
}

const defaultPackage = createProjectPackage(createAppState(), { source: 'trust-boundary-test' });
assert.equal(validateProjectImport(defaultPackage), defaultPackage);

const hostileText = await fixture('hostile-import.json');
const corruptText = await fixture('corrupt-structure.json');
const hostile = parseJsonImportText(hostileText, 'project');
assert.equal(hostile.project.name, '<img src=x onerror=globalThis.__fixtureExecuted=true>');

const target = createAppState();
applyProjectPackageToState(target, hostile);
assert.equal(target.project.name, hostile.project.name, 'Hostile text must remain literal project data');

const unchanged = createAppState();
unchanged.project.name = 'Preserve Me';
const limitsExceeded = JSON.parse(await fixture('limits-exceeded.json'));
assertBoundaryCode(() => applyProjectPackageToState(unchanged, limitsExceeded), 'IMPORT_COLLECTION_LIMIT');
assert.equal(unchanged.project.name, 'Preserve Me', 'Rejected imports must not partially mutate state');

assertBoundaryCode(() => parseJsonImportText(corruptText, 'project'), 'IMPORT_SCHEMA_INVALID');
assertBoundaryCode(() => parseJsonImportText('{not json}', 'project'), 'IMPORT_JSON_INVALID');
assertBoundaryCode(() => assertImportTextSize('12345', 4), 'IMPORT_SIZE_LIMIT');

let nested = {};
for (let depth = 0; depth < 34; depth += 1) nested = { child: nested };
assertBoundaryCode(() => inspectBoundedValue(nested), 'IMPORT_DEPTH_LIMIT');
assertBoundaryCode(() => inspectBoundedValue(JSON.parse('{"__proto__":{"polluted":true}}')), 'DANGEROUS_OBJECT_KEY');
assert.equal(Object.prototype.polluted, undefined);

assert.equal(
  validatePatternImport({ name: 'Pattern', kit: { tracks: [{ name: 'Track', steps: [] }] } }).name,
  'Pattern',
);
assertBoundaryCode(
  () => validatePatternImport({ kit: { tracks: Array.from({ length: 9 }, () => ({ steps: [] })) } }),
  'IMPORT_COLLECTION_LIMIT',
);
assert.equal(validateKitImport({ tracks: [{ steps: [] }] }).tracks.length, 1);
assert.equal(validateMidiMapImport({ 1: { param: 'cutoff' }, 127: 'volume' })[127], 'volume');
assertBoundaryCode(() => validateMidiMapImport({ 128: 'cutoff' }), 'IMPORT_SCHEMA_INVALID');

assert.equal(validateStudioCommand({ type: 'set-transport', bpm: 128 }).type, 'set-transport');
assertBoundaryCode(() => validateStudioCommand({ type: 'delete-project' }), 'COMMAND_SCHEMA_INVALID');
assertBoundaryCode(
  () => validateStudioCommand({ type: 'set-setting', key: 'project', value: 'overwrite' }),
  'COMMAND_SCHEMA_INVALID',
);
assertBoundaryCode(
  () => validateStudioCommand({ type: 'set-track-param', trackIndex: 0, param: '__proto__', value: {} }),
  'COMMAND_SCHEMA_INVALID',
);
assertBoundaryCode(
  () => validateStudioCommand(JSON.parse('{"type":"get-graph","__proto__":{"polluted":true}}')),
  'DANGEROUS_OBJECT_KEY',
);
assertBoundaryCode(
  () => validateStudioCommand({ type: 'set-transport', bpm: 120, unexpected: true }),
  'COMMAND_SCHEMA_INVALID',
);
assertBoundaryCode(
  () => validateStudioCommandBatch(Array.from({ length: 65 }, () => ({ type: 'get-graph' }))),
  'COMMAND_SCHEMA_INVALID',
);

const atomicState = createAppState();
const initialBpm = atomicState.bpm;
assertBoundaryCode(
  () =>
    executeStudioCommands(atomicState, [
      { type: 'set-transport', bpm: 130 },
      { type: 'set-setting', key: 'project', value: null },
    ]),
  'COMMAND_SCHEMA_INVALID',
);
assert.equal(atomicState.bpm, initialBpm, 'A rejected command batch must not partially mutate state');

// ── Legacy v2 localStorage restore must not bypass the import boundary ──
// loadState()'s v2 fallback runs exactly when the v3 path threw, including when
// it threw because validateProjectImport rejected the blob. Regression: that
// fallback used to re-parse and Object.assign the rejected data into state,
// which both defeated the schema and let a JSON-parsed "__proto__" re-parent
// the track object.
{
  const store = new Map();
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };

  try {
    const { loadState } = await import('../src/state.js');

    // Over-limit name (schema bound is 120) => the v3 boundary rejects this.
    const overLimitName = 'x'.repeat(5000);
    const hostileV2 = `{"tracks":[{"__proto__":{"INHERITED_FROM_ATTACKER":true},"volume":"NOT_A_NUMBER","name":"${overLimitName}"}]}`;
    assertBoundaryCode(() => validateProjectImport(JSON.parse(hostileV2)), 'DANGEROUS_OBJECT_KEY');
    // ...and rejects the same blob on the string bound alone, without the key.
    assertBoundaryCode(
      () => validateProjectImport({ tracks: [{ volume: 'NOT_A_NUMBER', name: overLimitName }] }),
      'IMPORT_STRING_LIMIT',
    );

    store.clear();
    store.set('confustudio-v2', hostileV2);
    const rejectedState = loadState();
    const rejectedTrack = rejectedState?.project?.banks?.[0]?.patterns?.[0]?.kit?.tracks?.[0];
    if (rejectedTrack) {
      assert.notEqual(rejectedTrack.volume, 'NOT_A_NUMBER', 'Rejected v2 data must not reach app state');
      assert.notEqual(rejectedTrack.name?.length, 5000, 'Rejected v2 data must not reach app state');
      assert.equal(
        Object.getPrototypeOf(rejectedTrack),
        Object.prototype,
        'Legacy v2 restore must not re-parent a track object',
      );
      assert.equal(rejectedTrack.INHERITED_FROM_ATTACKER, undefined, 'Attacker prototype must not be reachable');
    }
    assert.equal({}.INHERITED_FROM_ATTACKER, undefined, 'Object.prototype must stay clean');

    // A schema-valid v2 blob must still load cleanly. Note it is consumed by the
    // v3 branch above (which accepts a bare `tracks` array and merges it as
    // top-level state), so the legacy branch is only ever reached by data that
    // FAILED validation -- which is exactly why it must validate before merging.
    store.clear();
    store.set('confustudio-v2', JSON.stringify({ tracks: [{ volume: 0.25, name: 'legacy' }] }));
    const benignState = loadState();
    const benignTrack = benignState?.project?.banks?.[0]?.patterns?.[0]?.kit?.tracks?.[0];
    assert.ok(benignState, 'A valid legacy v2 project must still produce state');
    assert.equal(typeof benignTrack?.volume, 'number', 'Restored tracks must keep schema-correct types');
    assert.equal(Object.getPrototypeOf(benignTrack), Object.prototype, 'Restored tracks must keep a clean prototype');
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
}

// ── keyboardVelocity is unschema'd state and must be coerced at every read ──
// It reaches an HTML attribute in renderPiano and the note-trigger velocity
// path, so a restored string must not survive as a string.
{
  const { readKeyboardVelocity } = await import('../src/keyboard.js');
  const hostile = '1"><img src=x onerror="globalThis.__pwned=true">';
  for (const [input, expected] of [
    [hostile, 1],
    ['not a number', 1],
    [undefined, 1],
    [null, 1],
    [NaN, 1],
    [Infinity, 1],
    [{}, 1],
    [[], 1], // Number([]) is 0 — must fall back, not clamp to the minimum
    [null, 1], // Number(null) is 0 — same
    ['', 1],
    ['   ', 1],
    [true, 1],
    [5, 1], // clamped to max
    [-3, 0.05], // clamped to min
    ['0.5', 0.5], // numeric strings still work
    [0.5, 0.5],
  ]) {
    const actual = readKeyboardVelocity({ keyboardVelocity: input });
    assert.equal(typeof actual, 'number', `keyboardVelocity must coerce to a number for ${JSON.stringify(input)}`);
    assert.ok(Number.isFinite(actual), `keyboardVelocity must be finite for ${JSON.stringify(input)}`);
    assert.equal(actual, expected, `keyboardVelocity mismatch for ${JSON.stringify(input)}`);
  }
  assert.equal(readKeyboardVelocity(undefined), 1, 'A missing state must not throw');
  assert.ok(!String(readKeyboardVelocity({ keyboardVelocity: hostile })).includes('<'), 'Markup must never survive');

  // loadState() must also repair the stored value, so a hostile scalar does not
  // sit in state waiting for some future reader that forgets to coerce.
  const store = new Map();
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  try {
    const { loadState, STORAGE_KEY } = await import('../src/state.js');
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        project: { name: 'vel', banks: [{ name: 'A', patterns: [{ name: 'p', kit: { tracks: [{ name: 't1' }] } }] }] },
        keyboardVelocity: hostile,
      }),
    );
    const restored = loadState();
    assert.equal(typeof restored?.keyboardVelocity, 'number', 'Restored keyboardVelocity must be repaired to a number');
    assert.equal(restored.keyboardVelocity, 1, 'A hostile keyboardVelocity must fall back to the default');
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      hostileTextStayedLiteral: true,
      commandBatchAtomic: true,
      legacyV2RestoreValidated: true,
      keyboardVelocityCoerced: true,
    },
    null,
    2,
  ),
);
