import { BANK_COUNT, PATTERN_COUNT, TRACK_COUNT, createStep, normalizeProject } from './state.js';
import { getGenreStepWeights } from './pages/pattern-tools.js';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function getPattern(state, bankIndex = state.activeBank ?? 0, patternIndex = state.activePattern ?? 0) {
  return state.project?.banks?.[bankIndex]?.patterns?.[patternIndex] ?? null;
}

function getTrack(state, bankIndex, patternIndex, trackIndex = state.selectedTrackIndex ?? 0) {
  return getPattern(state, bankIndex, patternIndex)?.kit?.tracks?.[trackIndex] ?? null;
}

function setPatternLength(state, length, bankIndex, patternIndex) {
  const pattern = getPattern(state, bankIndex, patternIndex);
  if (!pattern) return false;
  const nextLength = clamp(length, 1, 64, pattern.length ?? 16);
  pattern.length = nextLength;
  if (
    state.activeBank === (bankIndex ?? state.activeBank) &&
    state.activePattern === (patternIndex ?? state.activePattern)
  ) {
    state.patternLength = nextLength;
  }
  return true;
}

function clearTrackSteps(track, trackIndex) {
  track.steps = Array.from({ length: track.steps?.length || 64 }, (_, stepIndex) => ({
    ...createStep(stepIndex, trackIndex),
    active: false,
    accent: false,
    paramLocks: {},
  }));
}

function generateDrumPattern(track, trackIndex, options = {}) {
  const length = clamp(options.length ?? 16, 1, 64, 16);
  const density = clamp(options.density ?? 0.5, 0, 1, 0.5);
  const style = String(options.style || 'four-on-floor').toLowerCase();
  clearTrackSteps(track, trackIndex);

  for (let stepIndex = 0; stepIndex < length; stepIndex++) {
    const step = track.steps[stepIndex];
    const quarter = stepIndex % 4 === 0;
    const offbeat = stepIndex % 4 === 2;
    const ghost = stepIndex % 8 === 7;

    if (style === 'halftime') {
      if (stepIndex === 0 || (stepIndex === 10 && density > 0.3)) step.active = true;
      if (stepIndex === 8) {
        step.active = true;
        step.accent = true;
      }
    } else if (style === 'broken') {
      if (quarter || stepIndex % 8 === 3 || (ghost && density > 0.55)) step.active = true;
      if (stepIndex % 16 === 12) step.accent = true;
    } else {
      if (quarter) step.active = true;
      if (offbeat && density > 0.35) step.accent = true;
      if (ghost && density > 0.65) step.active = true;
    }

    if (step.active) {
      step.velocity = density > 0.7 && offbeat ? 0.88 : 1;
      step.gate = 0.45;
    }
  }
}

function normalizeScenePayload(sceneIndex, scene, trackCount = TRACK_COUNT) {
  const letter = String.fromCharCode(65 + clamp(sceneIndex, 0, 7, 0));
  const next = scene && typeof scene === 'object' ? cloneJson(scene) : {};
  next.name = String(next.name || `Scene ${letter}`).slice(0, 64);
  next.noInterp = Array.isArray(next.noInterp) ? next.noInterp.slice() : [];
  next.tracks = Array.from({ length: trackCount }, (_, idx) => {
    const track = next.tracks?.[idx];
    return track && typeof track === 'object' ? { ...track } : {};
  });
  return next;
}

function normalizeArrangerSections(arranger = []) {
  return Array.isArray(arranger)
    ? arranger.map((section, idx) => ({
        sceneIdx: clamp(section?.sceneIdx ?? 0, 0, 7, 0),
        bars: clamp(section?.bars ?? 4, 1, 64, 4),
        name: String(section?.name || `Section ${idx + 1}`).slice(0, 80),
        repeat: clamp(section?.repeat ?? 1, 1, 16, 1),
        muted: Boolean(section?.muted),
        followAction: section?.followAction || 'next',
        trackMutes: Array.from({ length: TRACK_COUNT }, (_, ti) => Boolean(section?.trackMutes?.[ti])),
        ...(section?.bpmOverride != null ? { bpmOverride: clamp(section.bpmOverride, 40, 240, 120) } : {}),
        ...(section?.timeSignature ? { timeSignature: String(section.timeSignature) } : {}),
        ...(section?.color ? { color: String(section.color) } : {}),
      }))
    : [];
}

function normalizePatternPayload(pattern, patternIndex = 0) {
  const next = cloneJson(pattern && typeof pattern === 'object' ? pattern : {});
  next.name = String(next.name || `Pattern ${String(patternIndex + 1).padStart(2, '0')}`).slice(0, 120);
  next.length = clamp(next.length ?? 16, 1, 64, 16);
  if (!next.kit || !Array.isArray(next.kit.tracks)) next.kit = { tracks: [] };
  next.kit.tracks = Array.from({ length: TRACK_COUNT }, (_, trackIndex) => {
    const track = next.kit.tracks?.[trackIndex];
    const normalizedTrack = track && typeof track === 'object' ? { ...track } : { name: `Track ${trackIndex + 1}` };
    normalizedTrack.steps = Array.from({ length: 64 }, (_, stepIndex) => {
      const step = normalizedTrack.steps?.[stepIndex];
      return step && typeof step === 'object'
        ? {
            ...createStep(stepIndex, trackIndex),
            ...step,
            paramLocks:
              step.paramLocks && typeof step.paramLocks === 'object' && !Array.isArray(step.paramLocks)
                ? { ...step.paramLocks }
                : {},
          }
        : createStep(stepIndex, trackIndex);
    });
    return normalizedTrack;
  });
  return next;
}

function euclidean(beats, steps) {
  if (beats <= 0) return Array(steps).fill(false);
  if (beats >= steps) return Array(steps).fill(true);
  beats = Math.min(beats, steps);
  const pattern = [];
  const counts = [];
  const remainders = [];
  let divisor = steps - beats;
  remainders.push(beats);
  let level = 0;
  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
  }
  counts.push(divisor);
  function build(lv) {
    if (lv === -1) pattern.push(false);
    else if (lv === -2) pattern.push(true);
    else {
      for (let i = 0; i < counts[lv]; i++) build(lv - 1);
      if (remainders[lv] !== 0) build(lv - 2);
    }
  }
  build(level);
  return pattern.slice(0, steps);
}

export function captureCommandState(state) {
  return cloneJson({
    project: normalizeProject(state.project),
    bpm: state.bpm,
    swing: state.swing,
    patternLength: state.patternLength,
    arranger: Array.isArray(state.arranger) ? state.arranger : [],
    arrangementCursor: state.arrangementCursor ?? 0,
    activeBank: state.activeBank ?? 0,
    activePattern: state.activePattern ?? 0,
    selectedTrackIndex: state.selectedTrackIndex ?? 0,
    sceneA: state.sceneA ?? 0,
    sceneB: state.sceneB ?? 1,
    crossfader: state.crossfader ?? 0,
  });
}

export function restoreCommandState(state, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return state;
  state.project = normalizeProject(snapshot.project);
  state.scenes = state.project.scenes;
  state.bpm = clamp(snapshot.bpm ?? state.bpm, 40, 240, state.bpm ?? 122);
  state.swing = Number.isFinite(Number(snapshot.swing)) ? Number(snapshot.swing) : (state.swing ?? 0);
  state.patternLength = clamp(snapshot.patternLength ?? state.patternLength, 1, 64, state.patternLength ?? 16);
  state.arranger = cloneJson(snapshot.arranger ?? []);
  state.arrangementCursor = clamp(snapshot.arrangementCursor ?? 0, 0, Math.max(0, state.arranger.length - 1), 0);
  state.activeBank = clamp(snapshot.activeBank ?? state.activeBank, 0, BANK_COUNT - 1, 0);
  state.activePattern = clamp(snapshot.activePattern ?? state.activePattern, 0, PATTERN_COUNT - 1, 0);
  state.selectedTrackIndex = clamp(snapshot.selectedTrackIndex ?? state.selectedTrackIndex, 0, TRACK_COUNT - 1, 0);
  state.sceneA = clamp(snapshot.sceneA ?? state.sceneA, 0, 7, 0);
  state.sceneB = clamp(snapshot.sceneB ?? state.sceneB, 0, 7, 1);
  state.crossfader = clamp(snapshot.crossfader ?? state.crossfader, 0, 1, 0);
  return state;
}

export function createHistoryController(limit = 100) {
  const history = [];
  const checkpoints = [];
  let index = -1;

  function pruneRedo() {
    history.splice(index + 1);
    for (let i = checkpoints.length - 1; i >= 0; i--) {
      if (checkpoints[i].historyIdx >= index + 1) checkpoints.splice(i, 1);
    }
  }

  return {
    push(state) {
      pruneRedo();
      history.push(captureCommandState(state));
      if (history.length > limit) {
        history.shift();
        for (let i = checkpoints.length - 1; i >= 0; i--) {
          checkpoints[i].historyIdx--;
          if (checkpoints[i].historyIdx < 0) checkpoints.splice(i, 1);
        }
      }
      index = history.length - 1;
      return this.getMeta();
    },
    undo(state) {
      if (index <= 0) return false;
      index--;
      restoreCommandState(state, history[index]);
      return true;
    },
    redo(state) {
      if (index >= history.length - 1) return false;
      index++;
      restoreCommandState(state, history[index]);
      return true;
    },
    markCheckpoint(label) {
      if (index < 0) return null;
      const entry = { historyIdx: index, label: label || 'Checkpoint', timestamp: Date.now() };
      const existing = checkpoints.findIndex((item) => item.historyIdx === index);
      if (existing >= 0) checkpoints[existing] = entry;
      else checkpoints.push(entry);
      return entry;
    },
    getMeta() {
      return {
        index,
        total: history.length,
        checkpoints: checkpoints.slice(),
      };
    },
  };
}

export function executeStudioCommand(state, command) {
  if (!state || typeof state !== 'object') throw new TypeError('state is required');
  if (!command || typeof command !== 'object') throw new TypeError('command must be an object');

  const type = String(command.type || '').trim();
  const bankIndex = clamp(command.bankIndex ?? state.activeBank, 0, BANK_COUNT - 1, state.activeBank ?? 0);
  const patternIndex = clamp(
    command.patternIndex ?? state.activePattern,
    0,
    PATTERN_COUNT - 1,
    state.activePattern ?? 0,
  );
  const trackIndex = clamp(
    command.trackIndex ?? state.selectedTrackIndex,
    0,
    TRACK_COUNT - 1,
    state.selectedTrackIndex ?? 0,
  );

  switch (type) {
    case 'set-setting': {
      const key = String(command.key || '').trim();
      if (!key || key.startsWith('_')) return { changed: false, summary: 'Invalid setting key' };
      state[key] = command.value;
      return { changed: true, summary: `Updated ${key}` };
    }

    case 'select-bank': {
      const nextBank = bankIndex;
      const nextPattern = command.patternIndex !== undefined ? clamp(command.patternIndex, 0, PATTERN_COUNT - 1, 0) : 0;
      state.activeBank = nextBank;
      state.activePattern = nextPattern;
      return { changed: true, summary: `Selected bank ${nextBank + 1}` };
    }

    case 'select-pattern': {
      state.activeBank = bankIndex;
      state.activePattern = patternIndex;
      if (command.trackIndex !== undefined) {
        state.selectedTrackIndex = clamp(command.trackIndex, 0, TRACK_COUNT - 1, state.selectedTrackIndex ?? 0);
      }
      return { changed: true, summary: `Selected pattern ${patternIndex + 1}` };
    }

    case 'select-track': {
      state.selectedTrackIndex = trackIndex;
      return { changed: true, summary: `Selected track ${trackIndex + 1}` };
    }

    case 'toggle-step': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      const step = track?.steps?.[clamp(command.stepIndex, 0, (track?.steps?.length ?? 1) - 1, 0)];
      if (!step) return { changed: false, summary: 'Step not found' };
      if (command.shiftKey) {
        step.accent = !step.accent;
      } else {
        step.active = !step.active;
      }
      return { changed: true, summary: 'Toggled step' };
    }

    case 'cycle-step-probability': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      const step = track?.steps?.[clamp(command.stepIndex, 0, (track?.steps?.length ?? 1) - 1, 0)];
      if (!step) return { changed: false, summary: 'Step not found' };
      const nextLevels = [1, 0.75, 0.5, 0.25];
      const idx = nextLevels.indexOf(step.probability);
      step.probability = nextLevels[(idx + 1) % nextLevels.length];
      return { changed: true, summary: 'Cycled step probability' };
    }

    case 'randomize-track-steps': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      const pattern = getPattern(state, bankIndex, patternIndex);
      if (!track || !pattern) return { changed: false, summary: 'Track not found' };
      const density = clamp(command.density ?? state.randomizeDensity ?? 0.5, 0, 1, 0.5);
      const genre = String(command.genre || state.randomizeGenre || 'random');
      const len = track.trackLength > 0 ? track.trackLength : pattern.length;
      const weights = getGenreStepWeights(genre, trackIndex, len);
      track.steps.slice(0, len).forEach((step, stepIndex) => {
        const probability = density * (weights[stepIndex] ?? 1);
        step.active = Math.random() < probability;
        step.accent = step.active && Math.random() < 0.25;
      });
      return { changed: true, summary: `Randomized track ${trackIndex + 1}` };
    }

    case 'randomize-all-tracks': {
      const pattern = getPattern(state, bankIndex, patternIndex);
      if (!pattern) return { changed: false, summary: 'Pattern not found' };
      const density = clamp(command.density ?? state.randomizeDensity ?? 0.5, 0, 1, 0.5);
      const genre = String(command.genre || state.randomizeGenre || 'random');
      pattern.kit.tracks.forEach((track, ti) => {
        const len = track.trackLength > 0 ? track.trackLength : pattern.length;
        const weights = getGenreStepWeights(genre, ti, len);
        track.steps.slice(0, len).forEach((step, stepIndex) => {
          const probability = density * (weights[stepIndex] ?? 1);
          step.active = Math.random() < probability;
          step.accent = step.active && Math.random() < 0.25;
        });
      });
      return { changed: true, summary: 'Randomized all tracks' };
    }

    case 'fill-track-steps': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track) return { changed: false, summary: 'Track not found' };
      const interval = clamp(command.interval ?? 4, 1, 64, 4);
      const len =
        track.trackLength > 0 ? track.trackLength : (getPattern(state, bankIndex, patternIndex)?.length ?? 16);
      track.steps.slice(0, len).forEach((step, stepIndex) => {
        step.active = stepIndex % interval === 0;
      });
      return { changed: true, summary: `Filled track ${trackIndex + 1}` };
    }

    case 'mutate-track-steps': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track) return { changed: false, summary: 'Track not found' };
      const len =
        track.trackLength > 0 ? track.trackLength : (getPattern(state, bankIndex, patternIndex)?.length ?? 16);
      const flips = clamp(command.flips ?? 1 + Math.floor(Math.random() * 2), 1, len, 1);
      for (let i = 0; i < flips; i++) {
        const stepIndex = Math.floor(Math.random() * len);
        const step = track.steps[stepIndex];
        if (step) step.active = !step.active;
      }
      return { changed: true, summary: `Mutated track ${trackIndex + 1}` };
    }

    case 'quantize-track-steps': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track) return { changed: false, summary: 'Track not found' };
      const grid = clamp(command.grid ?? 1, 1, 64, 1);
      const len =
        track.trackLength > 0 ? track.trackLength : (getPattern(state, bankIndex, patternIndex)?.length ?? 16);
      const newActive = new Set();
      track.steps.slice(0, len).forEach((step, stepIndex) => {
        if (step.active) {
          const snapped = (Math.round(stepIndex / grid) * grid) % len;
          newActive.add(snapped);
        }
      });
      track.steps.slice(0, len).forEach((step, stepIndex) => {
        step.active = newActive.has(stepIndex);
      });
      return { changed: true, summary: `Quantized track ${trackIndex + 1}` };
    }

    case 'humanize-track-steps': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track) return { changed: false, summary: 'Track not found' };
      const amount = clamp(command.amount ?? 0.2, 0, 1, 0.2);
      const len =
        track.trackLength > 0 ? track.trackLength : (getPattern(state, bankIndex, patternIndex)?.length ?? 16);
      track.steps.slice(0, len).forEach((step) => {
        if (!step.active) return;
        step.microTime = (Math.random() - 0.5) * amount;
        step.velocity = Math.max(0.3, Math.min(1, (step.velocity ?? 1) + (Math.random() - 0.5) * 0.3));
      });
      return { changed: true, summary: `Humanized track ${trackIndex + 1}` };
    }

    case 'set-project-meta': {
      if (command.name !== undefined) state.project.name = String(command.name || '').slice(0, 120);
      if (command.author !== undefined) state.project.author = String(command.author || '').slice(0, 120);
      if (command.description !== undefined)
        state.project.description = String(command.description || '').slice(0, 2000);
      return { changed: true, summary: 'Updated project metadata' };
    }

    case 'set-transport': {
      if (command.bpm !== undefined) state.bpm = clamp(command.bpm, 40, 240, state.bpm ?? 122);
      if (command.swing !== undefined) state.swing = clamp(command.swing, 0, 1, state.swing ?? 0);
      return { changed: true, summary: 'Updated transport' };
    }

    case 'set-pattern-length': {
      return {
        changed: setPatternLength(state, command.length, bankIndex, patternIndex),
        summary: 'Updated pattern length',
      };
    }

    case 'set-track-param': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track || !command.param) return { changed: false, summary: 'Track not found' };
      track[command.param] = command.value;
      return { changed: true, summary: `Updated track ${trackIndex + 1}` };
    }

    case 'set-step': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      const stepIndex = clamp(command.stepIndex, 0, (track?.steps?.length ?? 1) - 1, 0);
      const step = track?.steps?.[stepIndex];
      if (!step) return { changed: false, summary: 'Step not found' };
      if (command.active !== undefined) step.active = Boolean(command.active);
      if (command.accent !== undefined) step.accent = Boolean(command.accent);
      if (command.note !== undefined) step.note = clamp(command.note, 0, 127, step.note ?? 60);
      if (command.velocity !== undefined) step.velocity = clamp(command.velocity, 0, 1, step.velocity ?? 1);
      if (command.gate !== undefined) step.gate = clamp(command.gate, 0.05, 1, step.gate ?? 0.5);
      if (command.microTime !== undefined) step.microTime = clamp(command.microTime, -0.5, 0.5, step.microTime ?? 0);
      if (command.retrig !== undefined) step.retrig = clamp(command.retrig, 1, 8, step.retrig ?? 1);
      if (command.trigCondition !== undefined) step.trigCondition = String(command.trigCondition || 'always');
      if (command.mute !== undefined) step.mute = Boolean(command.mute);
      if (command.paramLocks !== undefined) {
        step.paramLocks =
          command.paramLocks && typeof command.paramLocks === 'object' && !Array.isArray(command.paramLocks)
            ? { ...command.paramLocks }
            : {};
      }
      return { changed: true, summary: `Updated step ${stepIndex + 1}` };
    }

    case 'clear-track': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track) return { changed: false, summary: 'Track not found' };
      clearTrackSteps(track, trackIndex);
      return { changed: true, summary: `Cleared track ${trackIndex + 1}` };
    }

    case 'replace-track-steps': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track) return { changed: false, summary: 'Track not found' };
      const sourceSteps = Array.isArray(command.steps) ? command.steps : [];
      track.steps = Array.from({ length: track.steps?.length || 64 }, (_, stepIndex) => {
        const step = sourceSteps[stepIndex];
        return step && typeof step === 'object'
          ? {
              ...createStep(stepIndex, trackIndex),
              ...cloneJson(step),
              paramLocks:
                step.paramLocks && typeof step.paramLocks === 'object' && !Array.isArray(step.paramLocks)
                  ? { ...step.paramLocks }
                  : {},
            }
          : createStep(stepIndex, trackIndex);
      });
      return { changed: true, summary: `Replaced track ${trackIndex + 1} steps` };
    }

    case 'duplicate-pattern': {
      const sourceBankIndex = clamp(
        command.sourceBankIndex ?? state.activeBank,
        0,
        BANK_COUNT - 1,
        state.activeBank ?? 0,
      );
      const sourcePatternIndex = clamp(
        command.sourcePatternIndex ?? state.activePattern,
        0,
        PATTERN_COUNT - 1,
        state.activePattern ?? 0,
      );
      const source = getPattern(state, sourceBankIndex, sourcePatternIndex);
      const target = getPattern(state, bankIndex, patternIndex);
      if (!source || !target) return { changed: false, summary: 'Pattern not found' };
      state.project.banks[bankIndex].patterns[patternIndex] = cloneJson(source);
      return { changed: true, summary: 'Duplicated pattern' };
    }

    case 'replace-pattern': {
      if (!getPattern(state, bankIndex, patternIndex)) return { changed: false, summary: 'Pattern not found' };
      state.project.banks[bankIndex].patterns[patternIndex] = normalizePatternPayload(command.pattern, patternIndex);
      return { changed: true, summary: 'Replaced pattern' };
    }

    case 'update-pattern-meta': {
      const pattern = getPattern(state, bankIndex, patternIndex);
      if (!pattern) return { changed: false, summary: 'Pattern not found' };
      if (command.name !== undefined) pattern.name = String(command.name || pattern.name || 'Pattern').slice(0, 120);
      if (command.followAction !== undefined) pattern.followAction = String(command.followAction || 'next');
      return { changed: true, summary: 'Updated pattern metadata' };
    }

    case 'set-scene-name': {
      const sceneIndex = clamp(command.sceneIndex, 0, 7, 0);
      if (!state.project.scenes?.[sceneIndex]) return { changed: false, summary: 'Scene not found' };
      state.project.scenes[sceneIndex].name = String(
        command.name || `Scene ${String.fromCharCode(65 + sceneIndex)}`,
      ).slice(0, 64);
      state.scenes = state.project.scenes;
      return { changed: true, summary: 'Renamed scene' };
    }

    case 'set-scene-payload': {
      const sceneIndex = clamp(command.sceneIndex, 0, 7, 0);
      const trackCount = getPattern(state, bankIndex, patternIndex)?.kit?.tracks?.length ?? TRACK_COUNT;
      state.project.scenes[sceneIndex] = normalizeScenePayload(sceneIndex, command.scene, trackCount);
      state.scenes = state.project.scenes;
      return { changed: true, summary: 'Updated scene' };
    }

    case 'swap-scenes': {
      const sceneAIndex = clamp(command.sceneA, 0, 7, 0);
      const sceneBIndex = clamp(command.sceneB, 0, 7, 1);
      const sceneA = cloneJson(state.project.scenes?.[sceneAIndex] ?? {});
      const sceneB = cloneJson(state.project.scenes?.[sceneBIndex] ?? {});
      const trackCount = getPattern(state, bankIndex, patternIndex)?.kit?.tracks?.length ?? TRACK_COUNT;
      state.project.scenes[sceneAIndex] = normalizeScenePayload(sceneAIndex, sceneB, trackCount);
      state.project.scenes[sceneBIndex] = normalizeScenePayload(sceneBIndex, sceneA, trackCount);
      state.scenes = state.project.scenes;
      return { changed: true, summary: 'Swapped scenes' };
    }

    case 'apply-scene': {
      const sceneIndex = clamp(command.sceneIndex, 0, 7, 0);
      const mode = command.mode === 'all' ? 'all' : 'track';
      const pattern = getPattern(state, bankIndex, patternIndex);
      const scene = state.project.scenes?.[sceneIndex];
      if (!pattern || !scene?.tracks) return { changed: false, summary: 'Scene not found' };
      if (mode === 'all') {
        pattern.kit.tracks.forEach((track, ti) => Object.assign(track, scene.tracks?.[ti] ?? {}));
      } else {
        Object.assign(pattern.kit.tracks[trackIndex], scene.tracks?.[trackIndex] ?? {});
      }
      return { changed: true, summary: 'Applied scene' };
    }

    case 'add-arranger-section': {
      if (!Array.isArray(state.arranger)) state.arranger = [];
      state.arranger.push({
        sceneIdx: clamp(command.sceneIdx ?? 0, 0, 7, 0),
        bars: clamp(command.bars ?? 4, 1, 64, 4),
        name: String(command.name || `Section ${state.arranger.length + 1}`).slice(0, 80),
        repeat: clamp(command.repeat ?? 1, 1, 16, 1),
        muted: Boolean(command.muted),
        followAction: command.followAction || 'next',
        trackMutes: Array.from({ length: TRACK_COUNT }, (_, idx) => Boolean(command.trackMutes?.[idx])),
      });
      state.arrangementCursor = state.arranger.length - 1;
      return { changed: true, summary: 'Added arranger section' };
    }

    case 'replace-arranger': {
      state.arranger = normalizeArrangerSections(command.arranger);
      state.arrangementCursor = clamp(
        command.arrangementCursor ?? state.arrangementCursor,
        0,
        Math.max(0, state.arranger.length - 1),
        0,
      );
      return { changed: true, summary: 'Updated arranger' };
    }

    case 'update-arranger-section': {
      const sectionIndex = clamp(command.sectionIndex, 0, Math.max(0, (state.arranger?.length ?? 1) - 1), 0);
      if (!state.arranger?.[sectionIndex]) return { changed: false, summary: 'Arranger section not found' };
      const next = normalizeArrangerSections([{ ...state.arranger[sectionIndex], ...(command.patch || {}) }])[0];
      state.arranger[sectionIndex] = next;
      return { changed: true, summary: 'Updated arranger section' };
    }

    case 'generate-drum-pattern': {
      const track = getTrack(state, bankIndex, patternIndex, trackIndex);
      if (!track) return { changed: false, summary: 'Track not found' };
      track.machine = command.machine || track.machine || 'sample';
      generateDrumPattern(track, trackIndex, command);
      if (command.patternLength !== undefined) {
        setPatternLength(state, command.patternLength, bankIndex, patternIndex);
      }
      return { changed: true, summary: `Generated drum pattern on track ${trackIndex + 1}` };
    }

    case 'generate-euclid': {
      const pattern = getPattern(state, bankIndex, patternIndex);
      if (!pattern) return { changed: false, summary: 'Pattern not found' };
      const beats = clamp(command.beats ?? 4, 0, 64, 4);
      const steps = clamp(command.steps ?? pattern.length ?? 16, 1, 64, pattern.length ?? 16);
      const base = euclidean(beats, steps);
      const applyToAll = Boolean(command.applyToAll);
      const baseOffset = clamp(command.offset ?? 0, 0, Math.max(0, steps - 1), 0);

      const applyOffset = (track, offset) => {
        const off = ((offset % steps) + steps) % steps;
        const result = [...base.slice(off), ...base.slice(0, off)];
        result.forEach((active, stepIndex) => {
          if (track.steps[stepIndex]) track.steps[stepIndex].active = active;
        });
      };

      if (applyToAll) {
        pattern.kit.tracks.forEach((track, index) => applyOffset(track, Math.round((index * steps) / TRACK_COUNT)));
      } else {
        const track = pattern.kit.tracks[trackIndex];
        if (!track) return { changed: false, summary: 'Track not found' };
        applyOffset(track, baseOffset);
      }

      state.euclidBeats = beats;
      state.euclidOffset = applyToAll ? 0 : baseOffset;
      return {
        changed: true,
        summary: applyToAll ? 'Applied Euclid to all tracks' : `Applied Euclid to track ${trackIndex + 1}`,
      };
    }

    default:
      return { changed: false, summary: `Unknown command type: ${type}` };
  }
}

export function executeStudioCommands(state, commands = []) {
  const results = [];
  let changed = false;
  for (const command of commands) {
    const result = executeStudioCommand(state, command);
    results.push({ command, ...result });
    if (result.changed) changed = true;
  }
  return { changed, results };
}
