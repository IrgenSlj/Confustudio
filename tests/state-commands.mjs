import { strict as assert } from 'node:assert';

import { applyProjectPackageToState, createAppState, createProjectPackage } from '../src/state.js';
import {
  captureCommandState,
  createHistoryController,
  executeStudioCommands,
  restoreCommandState,
} from '../src/command-bus.js';

function createFakeBuffer(channelData, sampleRate = 44100) {
  const channels = channelData.map((data) => Float32Array.from(data));
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    sampleRate,
    getChannelData(channelIndex) {
      return channels[channelIndex];
    },
  };
}

function createFakeAudioContext() {
  return {
    createBuffer(numberOfChannels, length, sampleRate) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return {
        numberOfChannels,
        length,
        sampleRate,
        getChannelData(channelIndex) {
          return channels[channelIndex];
        },
        copyToChannel(source, channelIndex) {
          channels[channelIndex].set(source);
        },
      };
    },
  };
}

const state = createAppState();
state.project.name = 'Command Test';
state.project.author = 'Confu';
state.recorderBuffers[0] = createFakeBuffer([
  [0.25, -0.25, 0.5],
  [0.1, -0.1, 0.2],
]);
state.project.banks[0].patterns[0].kit.tracks[0].machine = 'sample';
state.project.banks[0].patterns[0].kit.tracks[0].sampleBuffer = createFakeBuffer([[0, 0.5, -0.5, 1]]);

const pkg = createProjectPackage(state, { source: 'test' });
assert.equal(pkg.format, 'confustudio-project-package');
assert.equal(pkg.project.name, 'Command Test');
assert.equal(pkg.packageVersion, '1.1.0');
assert.equal(pkg.assets.records.length, 2);
assert.equal(pkg.assets.records[0].payload.channelData[0][1], 0.5);

const imported = createAppState();
imported.audioContext = createFakeAudioContext();
applyProjectPackageToState(imported, pkg);
assert.equal(imported.project.name, 'Command Test');
assert.equal(imported.project.author, 'Confu');
assert.equal(imported.project.banks.length, 8);
assert.equal(imported.project.banks[0].patterns[0].kit.tracks[0].sampleBuffer.getChannelData(0)[3], 1);
assert.ok(Math.abs(imported.recorderBuffers[0].getChannelData(1)[2] - 0.2) < 0.00001);

const before = captureCommandState(imported);
const result = executeStudioCommands(imported, [
  { type: 'select-bank', bankIndex: 2 },
  { type: 'select-pattern', bankIndex: 1, patternIndex: 7, trackIndex: 5 },
  { type: 'select-track', trackIndex: 3 },
  { type: 'set-setting', key: 'metronome', value: true },
  { type: 'set-setting', key: 'midiChannel', value: 11 },
  { type: 'toggle-step', bankIndex: 0, patternIndex: 0, trackIndex: 2, stepIndex: 0 },
  { type: 'cycle-step-probability', bankIndex: 0, patternIndex: 0, trackIndex: 2, stepIndex: 0 },
  { type: 'set-transport', bpm: 128, swing: 0.14 },
  { type: 'set-project-meta', description: 'Structured command coverage' },
  { type: 'fill-track-steps', bankIndex: 0, patternIndex: 0, trackIndex: 4, interval: 4 },
  { type: 'set-pattern-length', bankIndex: 0, patternIndex: 0, length: 32 },
  { type: 'update-pattern-meta', bankIndex: 0, patternIndex: 0, name: 'Groove Lab', followAction: 'loop' },
  {
    type: 'generate-drum-pattern',
    bankIndex: 0,
    patternIndex: 0,
    trackIndex: 0,
    length: 16,
    style: 'broken',
    density: 0.8,
  },
  { type: 'generate-euclid', bankIndex: 0, patternIndex: 0, trackIndex: 1, beats: 5, steps: 16, offset: 2 },
  {
    type: 'replace-track-steps',
    bankIndex: 0,
    patternIndex: 0,
    trackIndex: 2,
    steps: [{ active: true, note: 67, velocity: 0.75, probability: 0.75 }],
  },
  { type: 'add-arranger-section', sceneIdx: 2, bars: 8, name: 'Drop A' },
  { type: 'set-scene-name', sceneIndex: 0, name: 'Intro A' },
  { type: 'set-scene-payload', sceneIndex: 1, scene: { name: 'Lift', tracks: [{ cutoff: 2400, volume: 0.8 }] } },
  { type: 'update-arranger-section', sectionIndex: 0, patch: { repeat: 2, color: '#ffcc00' } },
]);

assert.equal(result.changed, true);
assert.equal(imported.activeBank, 1);
assert.equal(imported.activePattern, 7);
assert.equal(imported.selectedTrackIndex, 3);
assert.equal(imported.metronome, true);
assert.equal(imported.midiChannel, 11);
assert.equal(imported.project.banks[0].patterns[0].kit.tracks[2].steps[0].active, true);
assert.equal(imported.project.banks[0].patterns[0].kit.tracks[2].steps[0].probability, 0.75);
assert.equal(imported.bpm, 128);
assert.equal(imported.swing, 0.14);
assert.equal(imported.project.description, 'Structured command coverage');
assert.equal(imported.project.banks[0].patterns[0].length, 32);
assert.equal(imported.project.banks[0].patterns[0].name, 'Groove Lab');
assert.equal(imported.project.banks[0].patterns[0].followAction, 'loop');
assert.equal(imported.project.banks[0].patterns[0].kit.tracks[4].steps[0].active, true);
assert.equal(imported.project.banks[0].patterns[0].kit.tracks[4].steps[1].active, false);
assert.equal(imported.project.banks[0].patterns[0].kit.tracks[4].steps[4].active, true);
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

const selectionHistory = createHistoryController(10);
selectionHistory.push(imported);
const selectionBaseline = captureCommandState(imported);
executeStudioCommands(imported, [
  { type: 'select-bank', bankIndex: 4 },
  { type: 'select-pattern', bankIndex: 4, patternIndex: 9 },
  { type: 'select-track', trackIndex: 6 },
]);
selectionHistory.push(imported);
assert.equal(imported.activeBank, 4);
assert.equal(imported.activePattern, 9);
assert.equal(imported.selectedTrackIndex, 6);
assert.equal(selectionHistory.undo(imported), true);
assert.equal(imported.activeBank, selectionBaseline.activeBank);
assert.equal(imported.activePattern, selectionBaseline.activePattern);
assert.equal(imported.selectedTrackIndex, selectionBaseline.selectedTrackIndex);
assert.equal(selectionHistory.redo(imported), true);
assert.equal(imported.activeBank, 4);
assert.equal(imported.activePattern, 9);
assert.equal(imported.selectedTrackIndex, 6);

console.log(JSON.stringify({ ok: true }, null, 2));
