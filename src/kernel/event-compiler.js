import { DEFAULT_STEPS_PER_BEAT, getStepDurationSeconds, stepIndexToBeat } from './transport.js';

export function normalizeProbability(value, fallback = 1) {
  const probability = Number(value);
  if (!Number.isFinite(probability)) return fallback;
  return Math.max(0, Math.min(1, probability));
}

export function shouldPassProbability(step, { random = Math.random } = {}) {
  return random() < normalizeProbability(step?.probability, 1);
}

export function shouldTriggerStep(step, { loopCount = 0, fillActive = false, random = Math.random } = {}) {
  if (!step) return false;

  const cond = step.trigCondition ?? 'always';
  switch (cond) {
    case 'always':
      return true;
    case '1st':
    case 'first':
      return loopCount === 0;
    case 'not1st':
    case 'not_first':
    case 'not:first':
      return loopCount > 0;
    case 'every2':
      return loopCount % 2 === 0;
    case 'every3':
      return loopCount % 3 === 0;
    case 'every4':
      return loopCount % 4 === 0;
    case 'random':
      return random() < normalizeProbability(step.prob ?? step.probability, 1);
    case 'fill':
      return !!fillActive;
    case 'not_fill':
      return !fillActive;
    default:
      return shouldTriggerRatioCondition(cond, loopCount);
  }
}

export function shouldTriggerRatioCondition(condition, loopCount = 0) {
  const match = String(condition ?? '').match(/^(\d+):(\d+)$/);
  if (!match) return true;

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return false;
  }

  return loopCount % denominator < numerator;
}

export function createStepTriggerEvent({
  bpm,
  track,
  step,
  trackIndex,
  stepIndex,
  scheduledTime,
  stepsPerBeat = DEFAULT_STEPS_PER_BEAT,
  sceneOverride = {},
  noteOverride,
  velocityOverride,
} = {}) {
  if (!track || !step) return null;

  const paramLocks = { gate: step.gate ?? 0.5, ...sceneOverride, ...(step.paramLocks || {}) };
  const note = noteOverride ?? paramLocks.note ?? step.note ?? track.pitch ?? track.note ?? 60;
  const velocity = velocityOverride ?? step.velocity ?? 1;

  return {
    type: 'track-step',
    time: scheduledTime,
    beat: stepIndexToBeat(stepIndex, { stepsPerBeat }),
    stepDuration: getStepDurationSeconds(bpm, stepsPerBeat),
    trackIndex,
    stepIndex,
    accent: !!step.accent,
    note,
    velocity,
    groupIndex: track.groupIndex ?? null,
    paramLocks,
  };
}
