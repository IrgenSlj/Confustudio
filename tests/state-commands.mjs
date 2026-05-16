import { strict as assert } from 'node:assert';

import { applyProjectPackageToState, createAppState, createProjectPackage } from '../src/state.js';
import {
  captureCommandState,
  createHistoryController,
  executeStudioCommands,
  restoreCommandState,
} from '../src/command-bus.js';

const state = createAppState();
state.project.name = 'Command Test';
state.project.author = 'Confu';

const pkg = createProjectPackage(state, { source: 'test' });
assert.equal(pkg.format, 'confustudio-project-package');
assert.equal(pkg.project.name, 'Command Test');

const imported = createAppState();
applyProjectPackageToState(imported, pkg);
assert.equal(imported.project.name, 'Command Test');
assert.equal(imported.project.author, 'Confu');
assert.equal(imported.project.banks.length, 8);

const before = captureCommandState(imported);
const result = executeStudioCommands(imported, [
  { type: 'set-transport', bpm: 128, swing: 0.14 },
  { type: 'set-project-meta', description: 'Structured command coverage' },
  { type: 'set-pattern-length', length: 32 },
  { type: 'update-pattern-meta', name: 'Groove Lab', followAction: 'loop' },
  { type: 'generate-drum-pattern', trackIndex: 0, length: 16, style: 'broken', density: 0.8 },
  { type: 'generate-euclid', trackIndex: 1, beats: 5, steps: 16, offset: 2 },
  { type: 'replace-track-steps', trackIndex: 2, steps: [{ active: true, note: 67, velocity: 0.75 }] },
  { type: 'add-arranger-section', sceneIdx: 2, bars: 8, name: 'Drop A' },
  { type: 'set-scene-name', sceneIndex: 0, name: 'Intro A' },
  { type: 'set-scene-payload', sceneIndex: 1, scene: { name: 'Lift', tracks: [{ cutoff: 2400, volume: 0.8 }] } },
  { type: 'update-arranger-section', sectionIndex: 0, patch: { repeat: 2, color: '#ffcc00' } },
]);

assert.equal(result.changed, true);
assert.equal(imported.bpm, 128);
assert.equal(imported.swing, 0.14);
assert.equal(imported.project.description, 'Structured command coverage');
assert.equal(imported.project.banks[0].patterns[0].length, 32);
assert.equal(imported.project.banks[0].patterns[0].name, 'Groove Lab');
assert.equal(imported.project.banks[0].patterns[0].followAction, 'loop');
assert.equal(imported.arranger.length, 1);
assert.equal(imported.arranger[0].name, 'Drop A');
assert.equal(imported.arranger[0].repeat, 2);
assert.equal(imported.arranger[0].color, '#ffcc00');
assert.equal(imported.project.scenes[0].name, 'Intro A');
assert.equal(imported.project.scenes[1].name, 'Lift');
assert.equal(imported.project.scenes[1].tracks[0].cutoff, 2400);
assert.ok(
  imported.project.banks[0].patterns[0].kit.tracks[0].steps.some((step) => step.active),
  'Generated pattern should activate steps',
);
assert.ok(
  imported.project.banks[0].patterns[0].kit.tracks[1].steps.some((step) => step.active),
  'Euclid should activate steps',
);
assert.equal(imported.project.banks[0].patterns[0].kit.tracks[2].steps[0].note, 67);

restoreCommandState(imported, before);
assert.equal(imported.bpm, before.bpm);
assert.equal(imported.project.description, before.project.description);

const history = createHistoryController(10);
history.push(imported);
executeStudioCommands(imported, [{ type: 'set-transport', bpm: 135 }]);
history.push(imported);
assert.equal(imported.bpm, 135);
assert.equal(history.undo(imported), true);
assert.equal(imported.bpm, before.bpm);
assert.equal(history.redo(imported), true);
assert.equal(imported.bpm, 135);

console.log(JSON.stringify({ ok: true }, null, 2));
