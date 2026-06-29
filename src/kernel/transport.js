export const DEFAULT_PPQ = 960;
export const DEFAULT_STEPS_PER_BEAT = 4;

export function normalizeBpm(bpm, fallback = 120) {
  const value = Number(bpm);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function normalizeStepsPerBeat(stepsPerBeat = DEFAULT_STEPS_PER_BEAT) {
  const value = Number(stepsPerBeat);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_STEPS_PER_BEAT;
  return value;
}

export function getStepDurationSeconds(bpm, stepsPerBeat = DEFAULT_STEPS_PER_BEAT) {
  return 60 / normalizeBpm(bpm) / normalizeStepsPerBeat(stepsPerBeat);
}

export function beatsToSeconds(beats, bpm) {
  return (Number(beats) || 0) * (60 / normalizeBpm(bpm));
}

export function secondsToFrames(seconds, sampleRate) {
  const frameCount = (Number(seconds) || 0) * (Number(sampleRate) || 0);
  return Math.max(0, Math.round(frameCount));
}

export function beatToFrame(beat, { bpm, sampleRate, originBeat = 0, originFrame = 0 } = {}) {
  const seconds = beatsToSeconds((Number(beat) || 0) - originBeat, bpm);
  return originFrame + secondsToFrames(seconds, sampleRate);
}

export function stepIndexToBeat(stepIndex, { stepsPerBeat = DEFAULT_STEPS_PER_BEAT, originBeat = 0 } = {}) {
  return originBeat + (Number(stepIndex) || 0) / normalizeStepsPerBeat(stepsPerBeat);
}
