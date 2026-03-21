// CONFUsynth v3 — main bootstrap & integration
import { createAppState, getActivePattern, getActiveTrack, getActiveStep,
         applyParamLock, setScene, interpolateScenes,
         saveState, loadState, PROB_LEVELS, TRACK_COUNT, STORAGE_KEY,
         TRACK_COLORS } from './state.js';
import { AudioEngine, drawOscilloscope, initMidi, midiOutputs } from './engine.js';
import { initKeyboard, renderKbdContext, renderPiano, lightPianoKey,
         pressKey, PAGE_KEYS } from './keyboard.js';
import { renderKnobs, KNOB_MAPS } from './knobs.js';
import { initStudio } from '/src/studio.js';
import { initCables } from '/src/cables.js';

// Page modules
import patternPage  from './pages/pattern.js';
import pianoRollPage from './pages/piano-roll.js';
import soundPage    from './pages/sound.js';
import mixerPage    from './pages/mixer.js';
import fxPage       from './pages/fx.js';
import scenesPage   from './pages/scenes.js';
import banksPage    from './pages/banks.js';
import arrangerPage from './pages/arranger.js';
import settingsPage from './pages/settings.js';

// ─────────────────────────────────────────────
// PAGE REGISTRY
// ─────────────────────────────────────────────
const PAGES = {
  'pattern':    patternPage,
  'piano-roll': pianoRollPage,
  'sound':      soundPage,
  'mixer':      mixerPage,
  'fx':         fxPage,
  'scenes':     scenesPage,
  'banks':      banksPage,
  'arranger':   arrangerPage,
  'settings':   settingsPage,
};

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let state = loadState() || createAppState();
state._playingNotes = new Set(); // live note feedback for piano
state._pressedKeys  = new Set(); // live key feedback for graphical keyboard

let _activeKnobIndex = null; // which knob is currently being dragged
let _activeKnobTimer = null;

// Playback scheduler state
let _schedNextTime = 0;
let _schedStepIdx  = 0;  // kept for backward compat; mirrors _trackStepIdx[0]
let _trackStepIdx  = Array(8).fill(0); // per-track step counters for polyrhythm
let _schedRafId    = null;
let _oscAnimRef    = { id: null };
let _saveTimer     = null;

// Fill mode
state._fillActive = false;

const LEGACY_STORAGE_KEY = 'confusynth-v2';

// ─────────────────────────────────────────────
// UNDO / REDO HISTORY
// ─────────────────────────────────────────────
const _history = [];
let _historyIdx = -1;

function pushHistory(state) {
  // Trim any redo entries ahead of current position
  _history.splice(_historyIdx + 1);
  _history.push(JSON.parse(JSON.stringify(state.project)));
  if (_history.length > 50) _history.shift();
  _historyIdx = _history.length - 1;
}

function undoHistory(state) {
  if (_historyIdx <= 0) return;
  _historyIdx--;
  state.project = JSON.parse(JSON.stringify(_history[_historyIdx]));
}

function redoHistory(state) {
  if (_historyIdx >= _history.length - 1) return;
  _historyIdx++;
  state.project = JSON.parse(JSON.stringify(_history[_historyIdx]));
}

// ─────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = {
  pageContent:   $('page-content'),

  pageTabs:      $('page-tabs'),
  leftKnobs:     $('left-knobs'),
  rightKnobs:    $('right-knobs'),
  trackStrip:    $('track-strip'),
  trackSelector: $('track-selector'),
  kbdContext:    $('kbd-context'),
  kbdPiano:      $('kbd-piano'),
  kbdPlay:       $('kbd-play'),
  kbdStop:       $('kbd-stop'),
  kbdRecord:     $('kbd-record'),
  kbdBpm:        $('kbd-bpm-display'),
  oscilloscope:  $('oscilloscope'),
  projectName:   $('project-name'),
  bankPattern:   $('bank-pattern'),
  bpmDisplay:    $('bpm-display'),
  statusPill:    $('status-pill'),
  btnAudio:      $('btn-audio'),
  btnPlay:       $('btn-play'),
  btnStop:       $('btn-stop'),
  btnRecord:     $('btn-record'),
  btnTap:        $('btn-tap'),
  bpmInput:      $('bpm-input'),
  bpmDec:        $('bpm-dec'),
  bpmInc:        $('bpm-inc'),
  sampleFile:    $('sample-file'),
  btnFill:       $('btn-fill'),
  signalMeter:   $('signal-meter'),
  masterVolume:  $('master-volume'),
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function moveArrangerSection(index, delta) {
  const nextIndex = index + delta;
  if (
    !Array.isArray(state.arranger) ||
    index < 0 ||
    nextIndex < 0 ||
    index >= state.arranger.length ||
    nextIndex >= state.arranger.length
  ) {
    return false;
  }

  const [section] = state.arranger.splice(index, 1);
  state.arranger.splice(nextIndex, 0, section);
  state.arrangementCursor = nextIndex;
  return true;
}

function setNestedStateValue(path, value) {
  const arrangerBars = path.match(/^arranger\[(\d+)\]\.bars$/);
  if (arrangerBars) {
    const index = Number(arrangerBars[1]);
    if (!state.arranger[index]) return false;
    state.arranger[index].bars = Math.max(1, Math.min(64, Number(value)));
    return true;
  }
  return false;
}

function handleAction(path, value, pattern) {
  switch (path) {
    case 'action_copy':
      state.copyBuffer = {
        type: 'steps',
        data: cloneJson(pattern.kit.tracks[state.selectedTrackIndex].steps),
      };
      renderPage();
      return true;

    case 'action_paste':
      if (state.copyBuffer?.type !== 'steps') return true;
      pushHistory(state);
      pattern.kit.tracks[state.selectedTrackIndex].steps.forEach((step, index) => {
        const source = state.copyBuffer.data[index];
        if (source) Object.assign(step, source);
      });
      scheduleSave();
      renderPage();
      renderTrackStrip();
      return true;

    case 'action_clear':
      pushHistory(state);
      pattern.kit.tracks[state.selectedTrackIndex].steps.forEach(step => {
        step.active = false;
        step.accent = false;
        step.paramLocks = {};
      });
      scheduleSave();
      renderPage();
      renderTrackStrip();
      return true;

    case 'action_snapshot':
      emit('scene:snapshot', value || {});
      return true;

    case 'action_initAudio':
      ensureAudio();
      return true;

    case 'action_clearStorage':
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      state = createAppState();
      state._playingNotes = new Set();
      state._pressedKeys = new Set();
      renderAll();
      return true;

    case 'action_loadSample':
      if (typeof value === 'number') state.selectedTrackIndex = value;
      el.sampleFile?.click();
      return true;

    case 'action_arrAdd':
      state.arranger.push({
        sceneIdx: Math.max(0, Math.min(7, Number(value?.sceneIdx ?? 0))),
        bars: Math.max(1, Math.min(64, Number(value?.bars ?? 2))),
      });
      state.arrangementCursor = state.arranger.length - 1;
      scheduleSave();
      renderPage();
      return true;

    case 'action_arrRemove':
      if (!state.arranger[value]) return true;
      state.arranger.splice(value, 1);
      state.arrangementCursor = Math.max(0, Math.min(state.arrangementCursor, state.arranger.length - 1));
      scheduleSave();
      renderPage();
      return true;

    case 'action_arrMoveUp':
      if (moveArrangerSection(Number(value), -1)) {
        scheduleSave();
        renderPage();
      }
      return true;

    case 'action_arrMoveDown':
      if (moveArrangerSection(Number(value), 1)) {
        scheduleSave();
        renderPage();
      }
      return true;

    case 'action_copyPattern': {
      const bankIndex = Number(value?.bank ?? state.activeBank);
      const patternIndex = Number(value?.pattern ?? state.activePattern);
      const sourcePattern = state.project.banks[bankIndex]?.patterns[patternIndex];
      if (!sourcePattern) return true;
      state.copyBuffer = {
        type: 'pattern',
        data: cloneJson(sourcePattern),
      };
      renderPage();
      return true;
    }

    case 'action_pastePattern': {
      if (state.copyBuffer?.type !== 'pattern') return true;
      const bankIndex = Number(value?.bank ?? state.activeBank);
      const patternIndex = Number(value?.pattern ?? state.activePattern);
      const targetPattern = state.project.banks[bankIndex]?.patterns[patternIndex];
      if (!targetPattern) return true;
      Object.assign(targetPattern, cloneJson(state.copyBuffer.data));
      scheduleSave();
      renderPage();
      renderTrackStrip();
      return true;
    }

    case 'action_fill':
      state._fillActive = !state._fillActive;
      renderFillBtn();
      renderPage(); // re-render to update fill button style
      return true;

    default:
      return false;
  }
}

function toggleFill() {
  state._fillActive = !state._fillActive;
  renderFillBtn();
}

function renderFillBtn() {
  const btn = el.btnFill;
  if (btn) btn.classList.toggle('active', state._fillActive);
}

function handleStateChange(path, value, pattern) {
  if (path === 'bpm') {
    state.bpm = Math.max(40, Math.min(240, Number(value)));
    updateTopbar();
    scheduleSave();
    return;
  }

  if (path === 'swing') {
    state.swing = value;
    scheduleSave();
    return;
  }

  if (path === 'patternShift') {
    state.patternShift = value;
    const track = getActiveTrack(state);
    const trackLen = track.steps.length;
    const shift = ((Math.round(value) % trackLen) + trackLen) % trackLen;
    if (shift !== 0) {
      track.steps = [...track.steps.slice(shift), ...track.steps.slice(0, shift)];
    }
    scheduleSave();
    renderPage();
    return;
  }

  if (path === 'crossfader') {
    state.crossfader = value;
    scheduleSave();
    renderPage();
    return;
  }

  if (path === 'scale') {
    state.scale = Math.max(0, Math.min(6, Number(value)));
    scheduleSave();
    renderPage();
    return;
  }

  if (path === 'length' || path === 'patternLength') {
    pattern.length = Math.max(4, Math.min(64, Number(value)));
    state.patternLength = pattern.length;
    scheduleSave();
    renderPage();
    renderTrackStrip();
    return;
  }

  if (setNestedStateValue(path, value)) {
    scheduleSave();
    renderPage();
    return;
  }

  if (handleAction(path, value, pattern)) {
    return;
  }

  state[path] = value;
  scheduleSave();
}

// ─────────────────────────────────────────────
// EVENT BUS
// ─────────────────────────────────────────────
function emit(type, payload = {}) {
  const pattern = getActivePattern(state);
  const track   = getActiveTrack(state);

  switch (type) {
    // ── Pages ──
    case 'page:set':
      state.currentPage = payload.page;
      renderAll();
      break;

    // ── Transport ──
    case 'transport:toggle':
      togglePlay();
      break;

    case 'transport:stop':
      stopPlay();
      break;

    case 'transport:record':
      state.isRecording = !state.isRecording;
      updateTransportUI();
      break;

    // ── Note preview ──
    case 'note:preview':
      if (state.audioContext) {
        state.engine.previewNote(track, payload.note, state.audioContext);
        state._playingNotes.add(payload.note);
        state._pressedKeys.add(payload.note);  // track MIDI note for live recording
        lightPianoKey(el.kbdPiano, payload.note, true);
      }
      break;

    case 'note:off':
      state._playingNotes.delete(payload.note);
      state._pressedKeys.delete(payload.note);  // remove MIDI note from live recording set
      lightPianoKey(el.kbdPiano, payload.note, false);
      break;

    // ── Audio init ──
    case 'audio:init':
      ensureAudio();
      break;

    // ── Steps ──
    case 'step:toggle': {
      const step = pattern.kit.tracks[state.selectedTrackIndex].steps[payload.stepIndex];
      if (!step) break;
      pushHistory(state);
      if (payload.shiftKey) {
        step.accent = !step.accent;
      } else {
        step.active = !step.active;
      }
      scheduleSave();
      renderPage();
      renderPlayhead();
      break;
    }

    case 'step:prob': {
      const step = getActiveStep(state, payload.stepIndex);
      if (!step) break;
      const idx = PROB_LEVELS.indexOf(step.probability);
      step.probability = PROB_LEVELS[(idx + 1) % PROB_LEVELS.length];
      scheduleSave();
      renderPage();
      break;
    }

    case 'step:plock':
      pushHistory(state);
      applyParamLock(state, payload.stepIndex, payload.param, payload.value);
      scheduleSave();
      renderPage();
      break;

    case 'step:plockMode':
      // Highlight the step for p-lock editing — just re-render page
      state._plockStep = payload.stepIndex;
      renderPage();
      break;

    // ── State changes ──
    case 'state:change':
      handleStateChange(payload.path, payload.value, pattern);
      break;

    // ── Track changes ──
    case 'track:change': {
      const t = pattern.kit.tracks[payload.trackIndex ?? state.selectedTrackIndex];
      if (t && payload.param) {
        pushHistory(state);
        t[payload.param] = payload.value;
        scheduleSave();
      }
      break;
    }

    case 'track:select':
      state.selectedTrackIndex = payload.trackIndex;
      renderAll();
      break;

    case 'track:cycle':
      state.selectedTrackIndex = (state.selectedTrackIndex + payload.delta + TRACK_COUNT) % TRACK_COUNT;
      renderAll();
      break;

    case 'track:mute': {
      const t = pattern.kit.tracks[payload.trackIndex ?? state.selectedTrackIndex];
      if (t) { t.mute = !t.mute; scheduleSave(); renderTrackStrip(); renderTrackSelector(); renderPage(); }
      break;
    }

    case 'track:solo': {
      const t = pattern.kit.tracks[payload.trackIndex ?? state.selectedTrackIndex];
      if (t) {
        const wasSolo = t.solo;
        pattern.kit.tracks.forEach(x => { x.solo = false; });
        t.solo = !wasSolo;
        scheduleSave();
        renderTrackStrip();
        renderTrackSelector();
        renderPage();
      }
      break;
    }

    case 'track:muteToggle': {
      const t = pattern.kit.tracks[payload.trackIndex];
      if (t) { t.mute = !t.mute; scheduleSave(); renderTrackStrip(); renderTrackSelector(); renderPage(); }
      break;
    }

    // ── Bank/Pattern ──
    case 'bank:select':
      state.activeBank = payload.bankIndex;
      state.activePattern = 0;
      renderAll();
      break;

    case 'pattern:select':
      state.activePattern = payload.patternIndex;
      renderAll();
      break;

    // ── Pattern operations ──
    case 'pattern:copy':
      state.copyBuffer = {
        type: 'steps',
        data: cloneJson(pattern.kit.tracks[state.selectedTrackIndex].steps),
      };
      break;

    case 'pattern:paste':
      if (state.copyBuffer?.type === 'steps') {
        const steps = pattern.kit.tracks[state.selectedTrackIndex].steps;
        state.copyBuffer.data.forEach((s, i) => { if (steps[i]) Object.assign(steps[i], s); });
        scheduleSave();
        renderPage();
      }
      break;

    case 'pattern:clear':
      pushHistory(state);
      pattern.kit.tracks[state.selectedTrackIndex].steps.forEach(s => {
        s.active = false; s.accent = false; s.paramLocks = {};
      });
      scheduleSave();
      renderPage();
      break;

    case 'pattern:randomize': {
      pushHistory(state);
      const len = pattern.length;
      pattern.kit.tracks[state.selectedTrackIndex].steps.slice(0, len).forEach(s => {
        s.active = Math.random() < 0.4;
        s.accent = s.active && Math.random() < 0.25;
      });
      scheduleSave();
      renderPage();
      break;
    }

    // ── Octave ──
    case 'octave:shift':
      state.octaveShift = Math.max(-3, Math.min(3, state.octaveShift + payload.delta));
      renderKbdContext(el.kbdContext, state.currentPage);
      break;

    // ── Scene operations ──
    case 'scene:snapshot': {
      const tracks = pattern.kit.tracks;
      tracks.forEach((t, i) => {
        setScene(state, payload.sceneIdx ?? state.sceneA, i, {
          cutoff: t.cutoff, decay: t.decay, delaySend: t.delaySend,
          pitch: t.pitch, volume: t.volume
        });
      });
      scheduleSave();
      renderPage();
      break;
    }

    // ── Sample load ──
    case 'sample:load':
      if (state.audioContext) {
        state.audioContext.decodeAudioData(payload.buffer, decoded => {
          const t = getActiveTrack(state);
          t.sampleBuffer = decoded;
          t.machine = 'sample';
          scheduleSave();
          renderAll();
        });
      }
      break;

    // ── Knob change ──
    case 'knob:change':
      handleKnobChange(payload.index, payload.value);
      break;

    // ── Key press visual feedback ──
    case 'key:down':
      state._pressedKeys.add(payload.code);
      pressKey(el.kbdContext, payload.code, true);
      break;

    case 'key:up':
      state._pressedKeys.delete(payload.code);
      pressKey(el.kbdContext, payload.code, false);
      break;
  }
}

// ─────────────────────────────────────────────
// KNOB HANDLER
// ─────────────────────────────────────────────
function handleKnobChange(knobIndex, value) {
  const map = KNOB_MAPS[state.currentPage];
  if (!map) return;
  const def = map[knobIndex];
  if (!def || !def.param) return;

  _activeKnobIndex = knobIndex;

  const pattern = getActivePattern(state);

  const TRACK_PARAMS = ['pitch','attack','decay','noteLength','cutoff','resonance',
                        'drive','volume','pan','lfoRate','lfoDepth','delaySend','reverbSend'];

  if (def.param.startsWith('track.')) {
    const [, idx, field] = def.param.split('.');
    pattern.kit.tracks[Number(idx)][field] = value;
  } else if (TRACK_PARAMS.includes(def.param)) {
    getActiveTrack(state)[def.param] = value;
  } else if (def.param === 'bpm') {
    state.bpm = Math.max(40, Math.min(240, value));
    updateTopbar();
  } else if (def.param === 'length' || def.param === 'patternLength' || def.param === 'steps') {
    const len = Math.max(4, Math.min(64, Math.round(value)));
    pattern.length = len;
    state.patternLength = len;
  } else {
    state[def.param] = value;
  }

  scheduleSave();
  renderKnobsForPage();
  renderKnobBar();
  renderPage();

  // Clear active highlight after brief delay
  clearTimeout(_activeKnobTimer);
  _activeKnobTimer = setTimeout(() => {
    _activeKnobIndex = null;
    renderKnobBar();
  }, 1200);
}

// ─────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────
async function ensureAudio() {
  if (state.audioContext) {
    if (state.audioContext.state === 'suspended') await state.audioContext.resume();
    return;
  }
  const ctx = new AudioContext();
  state.audioContext = ctx;
  state.engine = new AudioEngine(ctx);
  window._confusynthEngine = state.engine;
  state.engine.initWorklets(); // async — loads cs-resampler worklet in background
  state.engine.setMasterLevel(state.masterLevel);
  if (el.masterVolume) el.masterVolume.value = state.masterLevel;
  el.btnAudio.classList.add('active');
  drawOscilloscope(el.oscilloscope, state.engine, _oscAnimRef);
  initSignalMeter();
  startMeterAnimation();
  await initMidi();
}

function initSignalMeter() {
  if (!el.signalMeter) return;
  el.signalMeter.innerHTML = '';
  for (let i = 1; i <= 16; i++) {
    const seg = document.createElement('span');
    seg.className = 'seg';
    seg.dataset.seg = i;
    el.signalMeter.appendChild(seg);
  }
}

let _meterRaf = null;
function startMeterAnimation() {
  if (_meterRaf || !el.signalMeter) return;
  const dataArr = new Uint8Array(32);
  function tick() {
    _meterRaf = requestAnimationFrame(tick);
    const analyser = state.engine?.analyser;
    if (!analyser) return;
    analyser.getByteTimeDomainData(dataArr);
    // RMS
    let sum = 0;
    for (let i = 0; i < dataArr.length; i++) {
      const s = (dataArr[i] - 128) / 128;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / dataArr.length);
    const lit = Math.round(rms * 80); // 0-16 range
    el.signalMeter.querySelectorAll('.seg').forEach(seg => {
      const n = Number(seg.dataset.seg);
      if (n <= lit) {
        seg.className = n <= 8 ? 'seg lit green' : n <= 12 ? 'seg lit orange' : 'seg lit red';
      } else {
        seg.className = 'seg';
      }
    });
  }
  tick();
}

// ─────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────
function scheduleLoop() {
  const tick = () => {
    if (!state.isPlaying) return;
    const ctx = state.audioContext;
    const secsPerStep = (60 / state.bpm) / 4;
    const pattern = getActivePattern(state);
    const isSoloing = pattern.kit.tracks.some(t => t.solo);

    while (_schedNextTime < ctx.currentTime + 0.12) {
      // Resolve scene interpolation once per tick slot (shared across tracks)
      const sceneParams = interpolateScenes(state);

      // Per-track scheduling with individual step counters for polyrhythm
      pattern.kit.tracks.forEach((track, ti) => {
        const trackLen = (track.trackLength > 0) ? track.trackLength : pattern.length;
        const stepIdx = _trackStepIdx[ti];

        // Live recording: capture held MIDI notes onto the selected track
        if (state.isRecording && ti === state.selectedTrackIndex && state._pressedKeys.size > 0) {
          const step = track.steps[stepIdx];
          if (step) {
            step.active = true;
            // Use the lowest held MIDI note (numeric keys are MIDI notes)
            const heldNotes = [...state._pressedKeys].filter(k => typeof k === 'number');
            if (heldNotes.length > 0) {
              step.paramLocks = { ...step.paramLocks, note: Math.min(...heldNotes) };
            }
          }
        }

        if (track.mute || (isSoloing && !track.solo)) return;
        const step = track.steps[stepIdx];
        if (!step?.active) return;

        // Trig condition check
        if (!evalTrigCondition(step.trigCondition, stepIdx)) return;
        if (Math.random() >= step.probability) return;

        const sceneOverride = sceneParams[ti] || {};

        // Micro-timing offset: fraction of one step duration, range -0.5 to +0.5
        const microOffset = (step.microTime ?? 0) * secsPerStep;

        state.engine.triggerTrack(track, _schedNextTime + microOffset, secsPerStep, {
          accent:      step.accent,
          note:        step.note,
          velocity:    step.velocity ?? 1,
          paramLocks:  { ...sceneOverride, ...step.paramLocks },
        });
      });

      // Advance all per-track step counters individually
      pattern.kit.tracks.forEach((track, ti) => {
        const trackLen = (track.trackLength > 0) ? track.trackLength : pattern.length;
        _trackStepIdx[ti] = (_trackStepIdx[ti] + 1) % trackLen;
      });

      // state.currentStep tracks track 0 for the playhead display
      state.currentStep = _trackStepIdx[0];
      _schedStepIdx = _trackStepIdx[0]; // keep alias in sync

      // Pattern chain / arranger advance on loop wrap-around (track 0 step wrapped to 0)
      if (state.currentStep === 0) {
        state._patternLoopCount = (state._patternLoopCount ?? 0) + 1;

        // Arranger playback
        if (state.arrangementMode && Array.isArray(state.arranger) && state.arranger.length > 0) {
          state._arrSectionBars = (state._arrSectionBars ?? 0) + 1;
          const section = state.arranger[state._arrSection ?? 0];
          if (section && state._arrSectionBars >= section.bars) {
            state._arrSectionBars = 0;
            state._arrSection = ((state._arrSection ?? 0) + 1) % state.arranger.length;
            const nextSection = state.arranger[state._arrSection];
            if (nextSection != null) {
              // Map sceneIdx to a pattern index (use sceneIdx as pattern index within active bank)
              state.activePattern = Math.max(0, Math.min(15, nextSection.sceneIdx ?? 0));
            }
          }
        }

        // Pattern chain: advance to next pattern after chainLength loops
        if ((state.chainPatterns ?? false) && !state.arrangementMode) {
          if (state._patternLoopCount >= (state.chainLength ?? 1)) {
            state._patternLoopCount = 0;
            state.activePattern = (state.activePattern + 1) % 16;
          }
        }
      }

      // Metronome clicks on quarter-note boundaries (every patLen/4 steps)
      if (state.metronome && state.engine?.playMetronomeClick) {
        const patLen = pattern.length || 16;
        const quarterStep = Math.max(1, Math.floor(patLen / 4));
        // state.currentStep is the post-advance value; the step just scheduled is one behind
        const justScheduled = ((state.currentStep - 1) + patLen) % patLen;
        if (justScheduled % quarterStep === 0) {
          state.engine.playMetronomeClick(_schedNextTime, justScheduled === 0);
        }
      }

      // Swing is applied based on track 0's next step parity
      const swing = (_trackStepIdx[0] % 2 !== 0 ? 1 : -1) * state.swing * secsPerStep;
      _schedNextTime += secsPerStep + swing;
    }

    renderPlayhead();
    _schedRafId = requestAnimationFrame(tick);
  };
  _schedRafId = requestAnimationFrame(tick);
}

function evalTrigCondition(cond, stepIdx) {
  if (!cond || cond === 'always') return true;
  if (cond === 'fill')     return state._fillActive ?? false;
  if (cond === 'first')    return stepIdx === 0;
  if (cond === 'not:first') return stepIdx !== 0;
  // Ratio: "1:2", "1:4", "3:4"
  const m = cond.match(/^(\d+):(\d+)$/);
  if (m) {
    const [, num, den] = m.map(Number);
    return (stepIdx % den) < num;
  }
  return true;
}

async function togglePlay() {
  await ensureAudio();
  if (state.isPlaying) {
    stopPlay();
  } else {
    state.isPlaying = true;
    _schedNextTime = state.audioContext.currentTime + 0.05;
    _schedStepIdx  = 0;
    _trackStepIdx  = Array(8).fill(0);
    updateTransportUI();
    scheduleLoop();
  }
}

function stopPlay() {
  state.isPlaying = false;
  state.currentStep = -1;
  _trackStepIdx = Array(8).fill(0);
  _schedStepIdx = 0;
  state._playingNotes.clear();
  state._pressedKeys.clear();
  if (_schedRafId) { cancelAnimationFrame(_schedRafId); _schedRafId = null; }
  updateTransportUI();
  renderPlayhead();
}

// ─────────────────────────────────────────────
// TAP TEMPO
// ─────────────────────────────────────────────
function tapTempo() {
  const now = performance.now();
  state.tapTimes = (state.tapTimes || []).filter(t => now - t < 3000).slice(-8);
  state.tapTimes.push(now);
  if (state.tapTimes.length >= 2) {
    const gaps = state.tapTimes.slice(1).map((t, i) => t - state.tapTimes[i]);
    const avg  = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    state.bpm  = Math.max(40, Math.min(240, Math.round(60000 / avg)));
    updateTopbar();
    if (el.bpmInput) el.bpmInput.value = state.bpm;
  }
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function renderAll() {
  updateTopbar();
  renderPageTabs();
  renderPage();
  renderTrackStrip();
  renderTrackSelector();
  renderKbdContext(el.kbdContext, state.currentPage, state._pressedKeys);
  renderPiano(el.kbdPiano, state);
  updateTransportUI();
}

function renderPage() {
  const page = PAGES[state.currentPage];
  if (!page) return;
  page.render(el.pageContent, state, emit);
}

function renderPageTabs() {
  el.pageTabs.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === state.currentPage);
  });
}

function renderKnobsForPage() {
  renderKnobs(el.leftKnobs,  state.currentPage, state, 0);
  renderKnobs(el.rightKnobs, state.currentPage, state, 4);
}

function renderKnobBar() {
  if (!el.knobBar) return;
  const map = KNOB_MAPS[state.currentPage] || [];
  el.knobBar.innerHTML = '';
  map.forEach((def, i) => {
    const slot = document.createElement('div');
    const side = i < 4 ? 'left' : 'right';
    slot.className = 'knob-bar-slot';
    slot.dataset.side = side;
    if (!def.param) slot.classList.add('unused');
    if (i === _activeKnobIndex) slot.classList.add('active');

    const value = def.param ? getKnobBarValue(def) : null;
    const displayVal = value != null ? formatKnobBarValue(value, def) : '—';

    slot.innerHTML =
      `<span class="knob-bar-label">${def.label}</span>` +
      `<span class="knob-bar-value">${displayVal}</span>`;
    el.knobBar.append(slot);
  });
}

function getKnobBarValue(def) {
  if (!def.param) return null;
  if (def.param.startsWith('track.')) {
    const [, idx, field] = def.param.split('.');
    const pattern = getActivePattern(state);
    return pattern?.kit?.tracks[Number(idx)]?.[field] ?? 0;
  }
  const TRACK_PARAMS = ['pitch','attack','decay','noteLength','cutoff','resonance',
                        'drive','volume','pan','lfoRate','lfoDepth','delaySend','reverbSend'];
  if (TRACK_PARAMS.includes(def.param)) {
    return getActiveTrack(state)?.[def.param] ?? 0;
  }
  return state[def.param] ?? 0;
}

function formatKnobBarValue(v, def) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v) || def.step >= 1) return String(Math.round(v));
  if (v >= 1000) return `${(v/1000).toFixed(1)}k`;
  if (Math.abs(v) < 0.1) return v.toFixed(3);
  if (Math.abs(v) < 10)  return v.toFixed(2);
  return v.toFixed(1);
}

function renderTrackStrip() {
  const pattern = getActivePattern(state);
  el.trackStrip.innerHTML = '';
  pattern.kit.tracks.forEach((track, i) => {
    const card = document.createElement('button');
    const classes = ['track-card'];
    if (i === state.selectedTrackIndex) classes.push('active');
    if (track.mute) classes.push('muted');
    if (track.solo) classes.push('soloed');
    card.className = classes.join(' ');
    const active = track.steps.slice(0, pattern.length).filter(s => s.active).length;
    card.innerHTML = `<h3>T${i + 1} · ${track.machine}</h3><p>${track.waveform} · ${active} trigs</p>`;
    card.addEventListener('click', e => {
      if (e.shiftKey) emit('track:mute', { trackIndex: i });
      else if (e.altKey) emit('track:solo', { trackIndex: i });
      else emit('track:select', { trackIndex: i });
    });
    el.trackStrip.append(card);
  });
}

function renderTrackSelector() {
  const el_cs = document.getElementById('track-selector');
  if (!el_cs) return;
  const pattern = getActivePattern(state);
  el_cs.innerHTML = '';
  pattern.kit.tracks.forEach((track, i) => {
    const isActive = i === state.selectedTrackIndex;
    const hasTriggers = track.steps.slice(0, track.trackLength || pattern.length).some(s => s.active);

    const row = document.createElement('div');
    row.className = 'track-ch' + (isActive ? ' active' : '') + (track.mute ? ' muted' : '');
    row.style.borderLeft = '3px solid ' + TRACK_COLORS[i];
    row.style.setProperty('--track-color', TRACK_COLORS[i]);

    const led = document.createElement('div');
    led.className = 'track-led' + (track.mute ? ' muted' : hasTriggers ? ' on' : '');
    if (!track.mute) led.style.background = TRACK_COLORS[i];

    const info = document.createElement('div');
    info.className = 'track-ch-info';

    const num = document.createElement('span');
    num.className = 'track-ch-num';
    num.textContent = `T${i + 1}`;

    const mac = document.createElement('span');
    mac.className = 'track-ch-machine';
    mac.textContent = (track.machine || 'tone').slice(0, 4).toUpperCase();

    info.append(num, mac);

    const btnM = document.createElement('button');
    btnM.className = 'track-ms-btn track-mute-btn' + (track.mute ? ' active' : '');
    btnM.textContent = 'M';
    btnM.title = 'Mute';
    btnM.addEventListener('click', e => { e.stopPropagation(); emit('track:mute', { trackIndex: i }); });

    const btnS = document.createElement('button');
    btnS.className = 'track-ms-btn track-solo-btn' + (track.solo ? ' active' : '');
    btnS.textContent = 'S';
    btnS.title = 'Solo';
    btnS.addEventListener('click', e => { e.stopPropagation(); emit('track:solo', { trackIndex: i }); });

    row.append(led, info, btnM, btnS);
    row.addEventListener('click', () => emit('track:select', { trackIndex: i }));
    el_cs.append(row);
  });
}

function renderPlayhead() {
  el.statusPill.textContent = state.isPlaying
    ? `STEP ${state.currentStep + 1}`
    : 'IDLE';
  el.statusPill.className = 'topbar-item topbar-status' + (state.isPlaying ? ' playing' : '');

  // Update step buttons — data-step attr means all track rows show playhead
  el.pageContent.querySelectorAll('.step-btn[data-step]').forEach(btn => {
    btn.classList.toggle('playhead', Number(btn.dataset.step) === state.currentStep);
  });

  // Beat-flash channel strip LEDs for tracks that are active at the current step
  if (state.isPlaying && state.currentStep >= 0) {
    const pat = getActivePattern(state);
    const isSoloing = pat.kit.tracks.some(t => t.solo);
    document.querySelectorAll('#track-selector .track-ch').forEach((row, i) => {
      const trk = pat.kit.tracks[i];
      if (!trk) return;
      const led = row.querySelector('.track-led');
      if (!led) return;
      led.classList.remove('beat');
      if (trk.mute || (isSoloing && !trk.solo)) return;
      const trackLen = trk.trackLength > 0 ? trk.trackLength : pat.length;
      const stepIdx  = state.currentStep % trackLen;
      const step     = trk.steps[stepIdx];
      if (step?.active) {
        // Force animation restart by removing/re-adding class next frame
        void led.offsetWidth; // trigger reflow so animation restarts
        led.classList.add('beat');
      }
    });
  }

  // Update piano roll cells if on piano-roll page
  if (state.currentPage === 'piano-roll') {
    el.pageContent.querySelectorAll('.piano-cell').forEach(cell => {
      cell.classList.toggle('playhead', Number(cell.dataset.col) === state.currentStep);
    });
  }
}

function updateTopbar() {
  const BANKS = 'ABCDEFGH';
  el.bankPattern.textContent = `${BANKS[state.activeBank]}·${String(state.activePattern + 1).padStart(2, '0')}`;
  el.bpmDisplay.textContent  = `${state.bpm} BPM`;
  if (el.kbdBpm) el.kbdBpm.textContent = `${state.bpm} BPM`;
  if (el.bpmInput) el.bpmInput.value = state.bpm;
}

function updateTransportUI() {
  el.btnPlay.classList.toggle('active', state.isPlaying);
  el.kbdPlay?.classList.toggle('active', state.isPlaying);
  el.btnPlay.textContent = state.isPlaying ? '■' : '▶';
  el.btnRecord?.classList.toggle('active', state.isRecording);
  el.kbdRecord?.classList.toggle('active', state.isRecording);
}

// ─────────────────────────────────────────────
// SAVE (debounced)
// ─────────────────────────────────────────────
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveState(state), 400);
}

// ─────────────────────────────────────────────
// NUMERIC DRAG UTILITY
// ─────────────────────────────────────────────
function addNumericDrag(inputEl, onUpdate) {
  let _startY = 0, _startVal = 0, _active = false;
  inputEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    _active = true;
    _startY = e.clientY;
    _startVal = parseFloat(inputEl.value) || 0;
    inputEl.setPointerCapture(e.pointerId);
  });
  inputEl.addEventListener('pointermove', e => {
    if (!_active) return;
    const delta = (_startY - e.clientY) * 0.5;
    const step = parseFloat(inputEl.step) || 1;
    const min = parseFloat(inputEl.min) ?? -Infinity;
    const max = parseFloat(inputEl.max) ?? Infinity;
    const newVal = Math.max(min, Math.min(max, _startVal + delta * step));
    inputEl.value = step < 1 ? newVal.toFixed(2) : Math.round(newVal);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  inputEl.addEventListener('pointerup', () => { _active = false; });
}

// ─────────────────────────────────────────────
// BIND UI
// ─────────────────────────────────────────────
function bindUI() {
  // Page tabs
  el.pageTabs.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab?.dataset.page) emit('page:set', { page: tab.dataset.page });
  });

  // Transport buttons
  el.btnAudio.addEventListener('click', () => ensureAudio());
  el.btnPlay.addEventListener('click',   () => togglePlay());
  el.btnStop.addEventListener('click',   () => stopPlay());
  el.kbdPlay?.addEventListener('click',   () => togglePlay());
  el.kbdStop?.addEventListener('click',   () => stopPlay());
  if (el.btnTap)  el.btnTap.addEventListener('click', tapTempo);
  if (el.btnFill) el.btnFill.addEventListener('click', toggleFill);

  // BPM edit
  if (el.bpmInput) {
    el.bpmInput.addEventListener('input', e => {
      emit('state:change', { path: 'bpm', value: Number(e.target.value) });
    });
    addNumericDrag(el.bpmInput);
  }
  if (el.bpmDec) el.bpmDec.addEventListener('click', () => {
    emit('state:change', { path: 'bpm', value: state.bpm - 1 });
    if (el.bpmInput) el.bpmInput.value = state.bpm;
  });
  if (el.bpmInc) el.bpmInc.addEventListener('click', () => {
    emit('state:change', { path: 'bpm', value: state.bpm + 1 });
    if (el.bpmInput) el.bpmInput.value = state.bpm;
  });

  if (el.masterVolume) {
    el.masterVolume.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      state.masterLevel = v;
      if (state.engine) state.engine.setMasterLevel(v);
    });
  }

  // Sample file
  if (el.sampleFile) {
    el.sampleFile.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      await ensureAudio();
      const buf = await file.arrayBuffer();
      emit('sample:load', { buffer: buf });
    });
  }

  // Knob events delegation (persistent on containers)
  el.leftKnobs.addEventListener('knob:change', e => emit('knob:change', e.detail));
  el.rightKnobs.addEventListener('knob:change', e => emit('knob:change', e.detail));

  // Undo / Redo keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === 'z' || e.key === 'Z') {
      if (e.shiftKey) {
        redoHistory(state);
      } else {
        undoHistory(state);
      }
      renderPage();
      saveState(state);
      e.preventDefault();
    } else if (e.key === 'y' || e.key === 'Y') {
      redoHistory(state);
      renderPage();
      saveState(state);
      e.preventDefault();
    }
  });

  // Chain toggle button (if present in DOM)
  const btnChain = document.getElementById('btn-chain');
  if (btnChain) {
    btnChain.addEventListener('click', () => {
      state.chainPatterns = !(state.chainPatterns ?? false);
      btnChain.classList.toggle('active', state.chainPatterns);
    });
  }

  // Help modal
  const helpModal = document.createElement('div');
  helpModal.id = 'help-modal';
  helpModal.innerHTML = `
  <div class="help-backdrop"></div>
  <div class="help-content">
    <h3>Keyboard Shortcuts</h3>
    <div class="help-grid">
      <div class="help-section">
        <h4>Global</h4>
        <dl>
          <dt>Space</dt><dd>Play / Stop</dd>
          <dt>P</dt><dd>Record</dd>
          <dt>Q–O</dt><dd>Switch pages</dd>
          <dt>Ctrl+Z</dt><dd>Undo</dd>
          <dt>Ctrl+Y</dt><dd>Redo</dd>
          <dt>?</dt><dd>This help</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>Pattern Page</h4>
        <dl>
          <dt>A–M</dt><dd>Toggle steps 1–16</dd>
          <dt>Shift+A–M</dt><dd>Accent steps</dd>
          <dt>Ctrl+C/V</dt><dd>Copy / Paste pattern</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>Sound / Piano Roll</h4>
        <dl>
          <dt>A–M</dt><dd>Play notes C–D'</dd>
          <dt>W,E,T,Y,U</dt><dd>Black keys C#–A#</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>Mixer Page</h4>
        <dl>
          <dt>A–K</dt><dd>Select track 1–8</dd>
          <dt>L</dt><dd>Mute selected</dd>
          <dt>M</dt><dd>Solo selected</dd>
        </dl>
      </div>
    </div>
    <button class="help-close seq-btn">Close</button>
  </div>
`;
  document.body.append(helpModal);
  helpModal.querySelector('.help-backdrop').addEventListener('click', () => helpModal.style.display = 'none');
  helpModal.querySelector('.help-close').addEventListener('click', () => helpModal.style.display = 'none');

  // ? / F1 key opens help modal; Escape closes it
  document.addEventListener('keydown', e => {
    if (e.key === '?' || e.key === 'F1') {
      e.preventDefault();
      const m = document.getElementById('help-modal');
      if (m) m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
    }
    if (e.key === 'Escape') {
      const m = document.getElementById('help-modal');
      if (m && m.style.display === 'flex') { m.style.display = 'none'; e.preventDefault(); }
    }
  });
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
function boot() {
  bindUI();
  initKeyboard(state, emit);
  renderAll();
  if (el.masterVolume) el.masterVolume.value = state.masterLevel;
  initStudio();
  initCables();
  console.log('CONFUsynth v3 ready — press A to init audio, Space to play');
}

boot();
