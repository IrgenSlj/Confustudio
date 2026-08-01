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

console.log(JSON.stringify({ ok: true, hostileTextStayedLiteral: true, commandBatchAtomic: true }, null, 2));
