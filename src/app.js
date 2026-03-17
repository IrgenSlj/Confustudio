// CONFUsynth v3 — main bootstrap & integration
import { createAppState, getActivePattern, getActiveTrack, getActiveStep,
         applyParamLock, setScene, interpolateScenes,
         saveState, loadState, PROB_LEVELS, TRACK_COUNT } from './state.js';
import { AudioEngine, drawOscilloscope, initMidi, midiOutputs } from './engine.js';
import { initKeyboard, renderKbdContext, renderPiano, lightPianoKey,
         PAGE_KEYS } from './keyboard.js';
import { renderKnobs, KNOB_MAPS } from './knobs.js';

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

// Playback scheduler state
let _schedNextTime = 0;
let _schedStepIdx  = 0;
let _schedRafId    = null;
let _oscAnimRef    = { id: null };
let _saveTimer     = null;

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
};

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

    // ── Note preview ──
    case 'note:preview':
      if (state.audioContext) {
        state.engine.previewNote(track, payload.note, state.audioContext);
        state._playingNotes.add(payload.note);
        lightPianoKey(el.kbdPiano, payload.note, true);
      }
      break;

    case 'note:off':
      state._playingNotes.delete(payload.note);
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
      if (payload.path === 'bpm') {
        state.bpm = Math.max(40, Math.min(240, Number(payload.value)));
        updateTopbar();
      } else if (payload.path === 'swing') {
        state.swing = payload.value;
      } else if (payload.path === 'crossfader') {
        state.crossfader = payload.value;
      } else if (payload.path === 'length') {
        pattern.length = Math.max(4, Math.min(64, Number(payload.value)));
      } else {
        state[payload.path] = payload.value;
      }
      scheduleSave();
      break;

    // ── Track changes ──
    case 'track:change': {
      const t = pattern.kit.tracks[payload.trackIndex ?? state.selectedTrackIndex];
      if (t && payload.param) {
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
      if (t) { t.mute = !t.mute; scheduleSave(); renderTrackStrip(); }
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
      }
      break;
    }

    case 'track:muteToggle': {
      const t = pattern.kit.tracks[payload.trackIndex];
      if (t) { t.mute = !t.mute; scheduleSave(); renderTrackStrip(); }
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
      state.copyBuffer = JSON.parse(JSON.stringify(
        pattern.kit.tracks[state.selectedTrackIndex].steps
      ));
      break;

    case 'pattern:paste':
      if (state.copyBuffer) {
        const steps = pattern.kit.tracks[state.selectedTrackIndex].steps;
        state.copyBuffer.forEach((s, i) => { if (steps[i]) Object.assign(steps[i], s); });
        scheduleSave();
        renderPage();
      }
      break;

    case 'pattern:clear':
      pattern.kit.tracks[state.selectedTrackIndex].steps.forEach(s => {
        s.active = false; s.accent = false; s.paramLocks = {};
      });
      scheduleSave();
      renderPage();
      break;

    case 'pattern:randomize': {
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

  const pattern = getActivePattern(state);

  // Track-specific params (knob controls selected track)
  const TRACK_PARAMS = ['pitch','attack','decay','noteLength','cutoff','resonance',
                        'drive','volume','pan','lfoRate','lfoDepth','delaySend','reverbSend'];

  if (def.param.startsWith('track.')) {
    // e.g. "track.0.volume"
    const [, idx, field] = def.param.split('.');
    pattern.kit.tracks[Number(idx)][field] = value;
  } else if (TRACK_PARAMS.includes(def.param)) {
    getActiveTrack(state)[def.param] = value;
  } else {
    emit('state:change', { path: def.param, value });
    return;
  }

  scheduleSave();
  // Lightweight re-render: just update knob display + page
  renderKnobsForPage();
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
  el.btnAudio.classList.add('active');
  drawOscilloscope(el.oscilloscope, state.engine, _oscAnimRef);
  await initMidi();
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
      const stepIdx = _schedStepIdx;
      pattern.kit.tracks.forEach(track => {
        if (track.mute || (isSoloing && !track.solo)) return;
        const step = track.steps[stepIdx];
        if (!step?.active) return;

        // Trig condition check
        if (!evalTrigCondition(step.trigCondition, stepIdx)) return;
        if (Math.random() >= step.probability) return;

        // Resolve scene interpolation
        const sceneParams = interpolateScenes(state);
        const trackIdx = pattern.kit.tracks.indexOf(track);
        const sceneOverride = sceneParams[trackIdx] || {};

        state.engine.triggerTrack(track, _schedNextTime, secsPerStep, {
          accent:      step.accent,
          note:        step.note,
          velocity:    step.velocity ?? 1,
          paramLocks:  { ...sceneOverride, ...step.paramLocks },
        });
      });

      state.currentStep = stepIdx;
      _schedStepIdx = (stepIdx + 1) % pattern.length;
      const swing = (_schedStepIdx % 2 !== 0 ? 1 : -1) * state.swing * secsPerStep;
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
    updateTransportUI();
    scheduleLoop();
  }
}

function stopPlay() {
  state.isPlaying = false;
  state.currentStep = -1;
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
    state.bpm  = Math.round(60000 / avg);
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
  renderKnobsForPage();
  renderPage();
  renderTrackStrip();
  renderKbdContext(el.kbdContext, state.currentPage);
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

function renderPlayhead() {
  el.statusPill.textContent = state.isPlaying
    ? `STEP ${state.currentStep + 1}`
    : 'IDLE';
  el.statusPill.className = 'topbar-item topbar-status' + (state.isPlaying ? ' playing' : '');

  // Update step buttons if on pattern page
  el.pageContent.querySelectorAll('.step-btn').forEach((btn, i) => {
    btn.classList.toggle('playhead', i === state.currentStep);
  });

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
  el.kbdBpm.textContent      = `${state.bpm} BPM`;
  if (el.bpmInput) el.bpmInput.value = state.bpm;
}

function updateTransportUI() {
  el.btnPlay.classList.toggle('active', state.isPlaying);
  el.kbdPlay.classList.toggle('active', state.isPlaying);
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
  el.kbdPlay.addEventListener('click',   () => togglePlay());
  el.kbdStop.addEventListener('click',   () => stopPlay());
  if (el.btnTap) el.btnTap.addEventListener('click', tapTempo);

  // BPM edit
  if (el.bpmInput) {
    el.bpmInput.addEventListener('input', e => {
      emit('state:change', { path: 'bpm', value: Number(e.target.value) });
    });
  }
  if (el.bpmDec) el.bpmDec.addEventListener('click', () => {
    emit('state:change', { path: 'bpm', value: state.bpm - 1 });
    if (el.bpmInput) el.bpmInput.value = state.bpm;
  });
  if (el.bpmInc) el.bpmInc.addEventListener('click', () => {
    emit('state:change', { path: 'bpm', value: state.bpm + 1 });
    if (el.bpmInput) el.bpmInput.value = state.bpm;
  });

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
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
function boot() {
  bindUI();
  initKeyboard(state, emit);
  renderAll();
  console.log('CONFUsynth v3 ready — press A to init audio, Space to play');
}

boot();
