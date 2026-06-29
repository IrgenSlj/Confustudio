import { strict as assert } from 'node:assert';

import {
  createStepTriggerEvent,
  normalizeProbability,
  shouldPassProbability,
  shouldTriggerRatioCondition,
  shouldTriggerStep,
} from '../src/kernel/event-compiler.js';
import {
  beatToFrame,
  beatsToSeconds,
  getStepDurationSeconds,
  secondsToFrames,
  stepIndexToBeat,
} from '../src/kernel/transport.js';

assert.equal(getStepDurationSeconds(120), 0.125);
assert.equal(getStepDurationSeconds(60), 0.25);
assert.equal(getStepDurationSeconds('bad'), 0.125);
assert.equal(beatsToSeconds(2, 120), 1);
assert.equal(secondsToFrames(0.5, 48000), 24000);
assert.equal(beatToFrame(2, { bpm: 120, sampleRate: 48000 }), 48000);
assert.equal(stepIndexToBeat(6), 1.5);

assert.equal(normalizeProbability(1.2), 1);
assert.equal(normalizeProbability(-0.2), 0);
assert.equal(normalizeProbability('bad', 0.75), 0.75);
assert.equal(shouldPassProbability({ probability: 0.5 }, { random: () => 0.49 }), true);
assert.equal(shouldPassProbability({ probability: 0.5 }, { random: () => 0.5 }), false);

assert.equal(shouldTriggerStep({ trigCondition: 'always' }), true);
assert.equal(shouldTriggerStep({ trigCondition: '1st' }, { loopCount: 0 }), true);
assert.equal(shouldTriggerStep({ trigCondition: '1st' }, { loopCount: 1 }), false);
assert.equal(shouldTriggerStep({ trigCondition: 'first' }, { loopCount: 0 }), true);
assert.equal(shouldTriggerStep({ trigCondition: 'not1st' }, { loopCount: 0 }), false);
assert.equal(shouldTriggerStep({ trigCondition: 'not:first' }, { loopCount: 2 }), true);
assert.equal(shouldTriggerStep({ trigCondition: 'every2' }, { loopCount: 4 }), true);
assert.equal(shouldTriggerStep({ trigCondition: 'every3' }, { loopCount: 4 }), false);
assert.equal(shouldTriggerStep({ trigCondition: 'every4' }, { loopCount: 8 }), true);
assert.equal(shouldTriggerStep({ trigCondition: 'fill' }, { fillActive: true }), true);
assert.equal(shouldTriggerStep({ trigCondition: 'fill' }, { fillActive: false }), false);
assert.equal(shouldTriggerStep({ trigCondition: 'not_fill' }, { fillActive: false }), true);
assert.equal(shouldTriggerStep({ trigCondition: 'random', probability: 0.25 }, { random: () => 0.2 }), true);
assert.equal(shouldTriggerStep({ trigCondition: 'random', probability: 0.25 }, { random: () => 0.3 }), false);

assert.equal(shouldTriggerRatioCondition('1:2', 0), true);
assert.equal(shouldTriggerRatioCondition('1:2', 1), false);
assert.equal(shouldTriggerRatioCondition('3:4', 2), true);
assert.equal(shouldTriggerRatioCondition('3:4', 3), false);
assert.equal(shouldTriggerRatioCondition('bad', 3), true);
assert.equal(shouldTriggerRatioCondition('1:0', 3), false);

const event = createStepTriggerEvent({
  bpm: 120,
  trackIndex: 2,
  stepIndex: 5,
  scheduledTime: 42,
  track: { pitch: 48, groupIndex: 1 },
  step: {
    note: 60,
    velocity: 0.8,
    accent: true,
    gate: 0.25,
    paramLocks: { cutoff: 3200, note: 64 },
  },
  sceneOverride: { drive: 0.2 },
});

assert.deepEqual(event, {
  type: 'track-step',
  time: 42,
  beat: 1.25,
  stepDuration: 0.125,
  trackIndex: 2,
  stepIndex: 5,
  accent: true,
  note: 64,
  velocity: 0.8,
  groupIndex: 1,
  paramLocks: {
    gate: 0.25,
    drive: 0.2,
    cutoff: 3200,
    note: 64,
  },
});

console.log(JSON.stringify({ ok: true }, null, 2));
