// CONFUsynth v3 — main bootstrap & integration
import { createAppState, getActivePattern, getActiveTrack, getActiveStep,
         applyParamLock, setScene, interpolateScenes,
         saveState, loadState, PROB_LEVELS, TRACK_COUNT, STORAGE_KEY,
         TRACK_COLORS, RECORDER_SLOT_COUNT } from './state.js';
import { AudioEngine, drawOscilloscope, initMidi, midiOutputs, getMidiOutputById } from './engine.js';
import { initKeyboard, renderKbdContext, renderPiano, lightPianoKey,
         pressKey, PAGE_KEYS } from './keyboard.js';
import { renderKnobs, KNOB_MAPS } from './knobs.js';
import { initStudio } from './studio.js';
import { initCables } from './cables.js';
import { initBackground } from './background.js';

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
// TOAST NOTIFICATION
// ─────────────────────────────────────────────
function showToast(msg, duration = 1200) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'background:#1a1e14', 'border:1px solid var(--accent)', 'border-radius:4px',
      'padding:5px 12px', 'font-family:var(--font-mono)', 'font-size:0.6rem',
      'color:var(--screen-text)', 'z-index:2000', 'pointer-events:none',
      'opacity:0', 'transition:opacity 0.2s'
    ].join(';');
    document.body.append(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function resetRecorderSlotMeta(slotIndex) {
  return {
    name: `Slot ${slotIndex + 1}`,
    source: null,
    trackIndex: null,
    durationSec: 0,
    createdAt: null,
  };
}

// ─────────────────────────────────────────────
// PERFORMANCE OVERLAY (backtick toggle)
// ─────────────────────────────────────────────
function togglePerfOverlay() {
  let overlay = document.getElementById('perf-overlay');
  if (overlay) { overlay.remove(); return; }

  overlay = document.createElement('div');
  overlay.id = 'perf-overlay';
  overlay.style.cssText = [
    'position:fixed', 'top:8px', 'right:8px', 'z-index:9999',
    'background:rgba(0,0,0,0.85)', 'border:1px solid rgba(255,255,255,0.1)',
    'border-radius:6px', 'padding:6px 10px', 'font-family:var(--font-mono)',
    'font-size:0.52rem', 'color:#aaa', 'min-width:120px',
    'backdrop-filter:blur(4px)', 'pointer-events:none',
  ].join(';');

  const lines = ['fps', 'voices', 'bpm', 'lat', 'mem'];
  const spans = {};
  lines.forEach(k => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;line-height:1.6';
    const lbl = document.createElement('span'); lbl.textContent = k.toUpperCase(); lbl.style.color = 'var(--muted)';
    const val = document.createElement('span'); val.style.color = '#fff'; spans[k] = val;
    row.append(lbl, val); overlay.append(row);
  });

  document.body.append(overlay);

  let lastT = performance.now(), frames = 0, fps = 0;
  function updateOverlay() {
    if (!overlay.isConnected) return;
    const now = performance.now();
    frames++;
    if (now - lastT >= 500) {
      fps = Math.round(frames * 1000 / (now - lastT));
      frames = 0; lastT = now;
    }
    spans.fps.textContent = `${fps} fps`;
    spans.voices.textContent = state._activeVoices ?? 0;
    spans.bpm.textContent = state.bpm?.toFixed(1);
    spans.lat.textContent = state.engine?.context?.baseLatency != null
      ? `${Math.round(state.engine.context.baseLatency * 1000)}ms` : '--';
    const mem = performance.memory;
    spans.mem.textContent = mem ? `${Math.round(mem.usedJSHeapSize / 1048576)}M` : '--';
    requestAnimationFrame(updateOverlay);
  }
  updateOverlay();
}

// ─────────────────────────────────────────────
// MIDI FILE EXPORT
// ─────────────────────────────────────────────
export function exportMidi(state) {
  const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
  const bpm = state.bpm ?? 120;
  const ppq = 96; // pulses per quarter note
  const stepsPerBeat = 4; // 16th notes
  const ticksPerStep = ppq / stepsPerBeat; // 24 ticks per step

  function writeUint32(n) { return [(n>>24)&0xFF,(n>>16)&0xFF,(n>>8)&0xFF,n&0xFF]; }
  function writeUint16(n) { return [(n>>8)&0xFF,n&0xFF]; }
  function writeVarLen(n) {
    if (n < 0x80) return [n];
    const bytes = [];
    while (n > 0) { bytes.unshift(n & 0x7F); n >>= 7; }
    for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
    return bytes;
  }

  const tracks = pattern.kit.tracks;
  const patLen = pattern.length;

  // Build one MIDI track per CONFUsynth track
  const midiTracks = tracks.map((track, ti) => {
    const ch = ti; // channel 0-7
    const events = [];

    track.steps.slice(0, patLen).forEach((step, si) => {
      if (!step.active) return;
      const note = step.note ?? track.note ?? 60;
      const vel = Math.round((step.velocity ?? 1) * 127);
      const onTick = si * ticksPerStep;
      const gateTicks = Math.round((step.gate ?? 0.5) * ticksPerStep * 2);
      const offTick = onTick + Math.max(1, gateTicks);
      events.push({ tick: onTick, msg: [0x90 | ch, note, vel] });
      events.push({ tick: offTick, msg: [0x80 | ch, note, 0] });
    });

    // Sort by tick
    events.sort((a, b) => a.tick - b.tick);

    // Convert to delta-time events
    const trackBytes = [];
    let lastTick = 0;
    events.forEach(ev => {
      const delta = ev.tick - lastTick;
      lastTick = ev.tick;
      trackBytes.push(...writeVarLen(delta), ...ev.msg);
    });
    // End of track
    trackBytes.push(...writeVarLen(0), 0xFF, 0x2F, 0x00);

    return trackBytes;
  });

  // Tempo track
  const usPerBeat = Math.round(60000000 / bpm);
  const tempoTrack = [
    ...writeVarLen(0), 0xFF, 0x51, 0x03,
    (usPerBeat>>16)&0xFF, (usPerBeat>>8)&0xFF, usPerBeat&0xFF,
    ...writeVarLen(0), 0xFF, 0x2F, 0x00
  ];

  // SMF header: type 1, numTracks+1 (tempo track), ppq
  const allTracks = [tempoTrack, ...midiTracks];
  const header = [
    0x4D,0x54,0x68,0x64, // MThd
    0,0,0,6,             // chunk length
    0,1,                  // format 1
    ...writeUint16(allTracks.length),
    ...writeUint16(ppq)
  ];

  const bytes = [...header];
  allTracks.forEach(track => {
    bytes.push(0x4D,0x54,0x72,0x6B); // MTrk
    bytes.push(...writeUint32(track.length));
    bytes.push(...track);
  });

  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pattern.name ?? 'pattern'}.mid`;
  a.click();
  URL.revokeObjectURL(url);
}
// Expose for settings.js (avoids circular import)
window.exportMidi = exportMidi;

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

// Step multi-selection (per-track, transient)
state._selectedSteps = new Set();

const LEGACY_STORAGE_KEY = 'confusynth-v2';

// ─────────────────────────────────────────────
// UNDO / REDO HISTORY
// ─────────────────────────────────────────────
const _history = [];
let _historyIdx = -1;
const _checkpoints = []; // {historyIdx, label, timestamp}

function pushHistory(state) {
  // Trim any redo entries ahead of current position
  _history.splice(_historyIdx + 1);
  // Prune checkpoints that pointed into removed redo entries
  const pruneFrom = _historyIdx + 1;
  for (let i = _checkpoints.length - 1; i >= 0; i--) {
    if (_checkpoints[i].historyIdx >= pruneFrom) _checkpoints.splice(i, 1);
  }
  _history.push(JSON.parse(JSON.stringify(state.project)));
  if (_history.length > 100) {
    _history.shift();
    // Adjust checkpoint indices after the oldest entry is evicted
    for (let i = _checkpoints.length - 1; i >= 0; i--) {
      _checkpoints[i].historyIdx--;
      if (_checkpoints[i].historyIdx < 0) _checkpoints.splice(i, 1);
    }
  }
  _historyIdx = _history.length - 1;
  updateUndoIndicator();
}

function undoHistory(state) {
  if (_historyIdx <= 0) return;
  _historyIdx--;
  state.project = JSON.parse(JSON.stringify(_history[_historyIdx]));
  updateUndoIndicator();
}

function redoHistory(state) {
  if (_historyIdx >= _history.length - 1) return;
  _historyIdx++;
  state.project = JSON.parse(JSON.stringify(_history[_historyIdx]));
  updateUndoIndicator();
}

function markCheckpoint(label) {
  if (_historyIdx < 0) return;
  // Replace any existing checkpoint at this exact history index
  const existing = _checkpoints.findIndex(c => c.historyIdx === _historyIdx);
  const entry = { historyIdx: _historyIdx, label: label || 'Checkpoint', timestamp: Date.now() };
  if (existing >= 0) {
    _checkpoints[existing] = entry;
  } else {
    _checkpoints.push(entry);
  }
  updateUndoIndicator();
  showToast(`Checkpoint: ${entry.label}`);
}

function updateUndoIndicator() {
  let ind = document.getElementById('undo-indicator');
  if (!ind) {
    ind = document.createElement('span');
    ind.id = 'undo-indicator';
    ind.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);padding:0 4px;line-height:36px;cursor:default;';
    const stopBtn = document.getElementById('btn-stop');
    if (stopBtn?.parentNode) stopBtn.parentNode.insertBefore(ind, stopBtn.nextSibling);
  }
  const available = _historyIdx;
  const total = _history.length;
  ind.textContent = total > 0 ? `\u21BA${available}` : '';
  ind.style.color = available > 0 ? 'var(--screen-text)' : 'var(--muted)';
  // Build tooltip listing named checkpoints
  if (_checkpoints.length > 0) {
    const lines = _checkpoints
      .slice()
      .sort((a, b) => a.historyIdx - b.historyIdx)
      .map(c => {
        const marker = c.historyIdx === _historyIdx ? '> ' : '  ';
        const time = new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `${marker}[${c.historyIdx}] ${c.label} (${time})`;
      });
    ind.title = lines.join('\n');
  } else {
    ind.title = '';
  }
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

function getRecorderDurationMs(bars = state.recorderBarCount ?? 4) {
  const bpm = Math.max(40, Number(state.bpm) || 120);
  const safeBars = Math.max(1, Math.min(32, Number(bars) || 4));
  return Math.round((240000 / bpm) * safeBars);
}

async function captureRecorderSlot(slotIndex, options = {}) {
  await ensureAudio();
  if (!state.engine?.master || !state.audioContext || state._recorderCaptureActive) return false;

  const bars = options.bars ?? state.recorderBarCount ?? 4;
  const durationMs = getRecorderDurationMs(bars);
  const mediaDest = state.audioContext.createMediaStreamDestination();
  const mimeType = [
    'audio/webm;codecs=opus',
    'audio/webm',
  ].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';

  state.engine.master.connect(mediaDest);
  const recorder = new MediaRecorder(mediaDest.stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  state._recorderCaptureActive = { slotIndex, startedAt: Date.now(), durationMs };

  return new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      state._recorderCaptureActive = null;
      try { state.engine.master.disconnect(mediaDest); } catch (_) {}
      showToast('Capture failed');
      resolve(false);
    };
    recorder.onstop = async () => {
      state._recorderCaptureActive = null;
      try { state.engine.master.disconnect(mediaDest); } catch (_) {}
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      if (!blob.size) {
        showToast('Capture empty');
        resolve(false);
        return;
      }
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const decoded = await state.audioContext.decodeAudioData(arrayBuffer.slice(0));
        state.recorderBuffers[slotIndex] = decoded;
        state.recorderSlotsMeta[slotIndex] = {
          ...state.recorderSlotsMeta[slotIndex],
          source: options.source ?? 'master',
          trackIndex: options.trackIndex ?? null,
          durationSec: decoded.duration,
          createdAt: Date.now(),
          bars,
        };
        scheduleSave();
        renderPage();
        showToast(`Captured slot ${slotIndex + 1}`);
        resolve(true);
      } catch (error) {
        console.warn('Recorder decode failed:', error);
        showToast('Capture decode failed');
        resolve(false);
      }
    };

    recorder.start();
    showToast(`Capturing ${bars} bars…`, Math.max(1400, durationMs));
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
  });
}

function loadRecorderSlotToTrack(slotIndex, trackIndex = state.selectedTrackIndex) {
  const buffer = state.recorderBuffers?.[slotIndex];
  const track = getActivePattern(state).kit.tracks[trackIndex];
  if (!buffer || !track) return false;
  track.machine = 'sample';
  track.sampleBuffer = buffer;
  track.sampleStart = 0;
  track.sampleEnd = 1;
  track.loopStart = 0;
  track.loopEnd = 1;
  track.loopEnabled = false;
  scheduleSave();
  renderPage();
  showToast(`Loaded slot ${slotIndex + 1} → T${trackIndex + 1}`);
  return true;
}

function exportRecorderSlot(slotIndex) {
  const buffer = state.recorderBuffers?.[slotIndex];
  if (!buffer) return false;
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  const wav = encodeWav(channels, buffer.sampleRate);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `confusynth-slot-${slotIndex + 1}.wav`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

function encodeWav(channelData, sampleRate) {
  const channels = channelData.length;
  const frameCount = channelData[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + frameCount * blockAlign);
  const view = new DataView(buffer);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * blockAlign, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, frameCount * blockAlign, true);
  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
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
      showToast('Copied');
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
      showToast('Pasted');
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
      showToast('Cleared');
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

    case 'action_renderPage':
      renderPage();
      return true;

    case 'action_captureRecorderSlot': {
      if (state._recorderBusy) return true;
      ensureAudio();
      if (!state.engine) {
        showToast('Init audio first');
        return true;
      }
      const slotIndex = Math.max(0, Math.min(RECORDER_SLOT_COUNT - 1, Number(value?.slot ?? state.selectedRecorderSlot ?? 0)));
      const bars = Math.max(1, Math.min(16, Number(value?.bars ?? 2)));
      const durationSec = (60 / Math.max(1, state.bpm || 120)) * 4 * bars;
      state._recorderBusy = true;
      state.selectedRecorderSlot = slotIndex;
      renderPage();
      showToast(`Capturing ${bars} bars…`, Math.max(1500, durationSec * 1000));
      captureMasterBuffer(state.engine, durationSec)
        .then((buffer) => {
          if (!Array.isArray(state.recorderBuffers)) {
            state.recorderBuffers = Array.from({ length: RECORDER_SLOT_COUNT }, () => null);
          }
          if (!Array.isArray(state.recorderSlotsMeta)) {
            state.recorderSlotsMeta = Array.from({ length: RECORDER_SLOT_COUNT }, (_, i) => resetRecorderSlotMeta(i));
          }
          state.recorderBuffers[slotIndex] = buffer;
          state.recorderSlotsMeta[slotIndex] = {
            ...resetRecorderSlotMeta(slotIndex),
            name: `Take ${slotIndex + 1}`,
            source: 'master',
            trackIndex: state.selectedTrackIndex,
            durationSec,
            createdAt: Date.now(),
          };
          scheduleSave();
          renderPage();
          showToast(`Captured slot ${slotIndex + 1}`);
        })
        .catch((err) => {
          console.warn('Recorder capture failed:', err);
          showToast('Capture failed');
        })
        .finally(() => {
          state._recorderBusy = false;
          renderPage();
        });
      return true;
    }

    case 'action_assignRecorderSlot': {
      const slotIndex = Math.max(0, Math.min(RECORDER_SLOT_COUNT - 1, Number(value?.slot ?? state.selectedRecorderSlot ?? 0)));
      const buffer = state.recorderBuffers?.[slotIndex];
      if (!buffer) {
        showToast('Empty recorder slot');
        return true;
      }
      const targetIndex = Math.max(0, Math.min(TRACK_COUNT - 1, Number(value?.trackIndex ?? state.selectedTrackIndex ?? 0)));
      const targetTrack = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[targetIndex];
      targetTrack.sampleBuffer = buffer;
      targetTrack.machine = 'sample';
      targetTrack.sampleStart = 0;
      targetTrack.sampleEnd = 1;
      targetTrack.loopStart = 0;
      targetTrack.loopEnd = 1;
      targetTrack.loopEnabled = false;
      scheduleSave();
      renderAll();
      showToast(`Loaded slot ${slotIndex + 1} to T${targetIndex + 1}`);
      return true;
    }

    case 'action_clearRecorderSlot': {
      const slotIndex = Math.max(0, Math.min(RECORDER_SLOT_COUNT - 1, Number(value?.slot ?? state.selectedRecorderSlot ?? 0)));
      if (Array.isArray(state.recorderBuffers)) state.recorderBuffers[slotIndex] = null;
      if (Array.isArray(state.recorderSlotsMeta)) state.recorderSlotsMeta[slotIndex] = resetRecorderSlotMeta(slotIndex);
      scheduleSave();
      renderPage();
      return true;
    }

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
      if (!state._fillActive) restorePreFillSnapshot();
      renderFillBtn();
      renderPage(); // re-render to update fill button style
      return true;

    case 'action_trackPaste': {
      if (!state._trackCopyBuffer) return true;
      pushHistory(state);
      const ti = value?.trackIndex ?? state.selectedTrackIndex;
      pattern.kit.tracks[ti].steps = JSON.parse(JSON.stringify(state._trackCopyBuffer));
      scheduleSave();
      renderPage();
      renderTrackStrip();
      showToast('Track steps pasted');
      return true;
    }

    default:
      return false;
  }
}

function toggleFill() {
  state._fillActive = !state._fillActive;
  if (!state._fillActive) restorePreFillSnapshot();
  renderFillBtn();
}

function restorePreFillSnapshot() {
  if (!state._preFillSnapshot) return;
  const pattern = getActivePattern(state);
  if (!pattern) return;
  state._preFillSnapshot.forEach((snapTrack, ti) => {
    const trk = pattern.kit.tracks[ti];
    if (!trk) return;
    snapTrack.forEach((snapStep, si) => {
      const s = trk.steps[si];
      if (!s) return;
      s.active = snapStep.active;
      s.accent = snapStep.accent;
    });
  });
  state._preFillSnapshot = null;
  renderPage();
}

function renderFillBtn() {
  const btn = el.btnFill;
  if (btn) btn.classList.toggle('active', state._fillActive);
}

function handleStateChange(path, value, pattern) {
  if (path === 'bpm') {
    state.bpm = Math.max(40, Math.min(240, parseFloat(value)));
    if (state.engine?.setBpm) state.engine.setBpm(state.bpm);
    updateTopbar();
    scheduleSave();
    return;
  }

  if (path === 'maxVoicesGlobal') {
    state.maxVoicesGlobal = Math.max(1, Math.round(value));
    if (state.engine?.setMaxVoicesGlobal) state.engine.setMaxVoicesGlobal(state.maxVoicesGlobal);
    scheduleSave();
    return;
  }

  if (path === 'sidechainSource') {
    // value: track index (0-7) or -1 to clear
    const tracks = getActivePattern(state).kit.tracks;
    tracks.forEach((t, i) => { t.isSidechainSource = (i === value); });
    if (state.engine) {
      if (value >= 0) {
        state.engine.setSidechainSource(value);
        const amount = tracks[value]?.sidechainAmount ?? 0.8;
        state.engine.setSidechainAmount(amount);
      } else {
        if (state.engine.setSidechainSource) state.engine.setSidechainSource(-1);
      }
    }
    scheduleSave();
    return;
  }

  if (path === 'swing') {
    state.swing = value;
    scheduleSave();
    return;
  }

  if (path === 'morphCurve') {
    state.morphCurve = value;
    scheduleSave();
    renderPage();
    return;
  }

  if (path === 'scene_noInterp') {
    // value: { sceneIdx, param, checked }
    const { sceneIdx, param, checked } = value;
    if (!state.project.scenes[sceneIdx]) state.project.scenes[sceneIdx] = {};
    const scene = state.project.scenes[sceneIdx];
    if (!Array.isArray(scene.noInterp)) scene.noInterp = [];
    if (checked) {
      if (!scene.noInterp.includes(param)) scene.noInterp.push(param);
    } else {
      scene.noInterp = scene.noInterp.filter(p => p !== param);
    }
    scheduleSave();
    renderPage();
    return;
  }

  if (path === 'scene_recall') {
    // value: { idx } — set crossfader to 0, select scene as A
    const { idx } = value;
    state.sceneA = idx;
    state.crossfader = 0;
    scheduleSave();
    renderPage();
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

  if (path === 'sceneXfade') {
    // Manual A/B crossfade: interpolate between scene A and scene B and apply to tracks
    state._sceneXfade = value;
    const t = Math.max(0, Math.min(1, value));
    const sA = state.scenes[state.sceneA];
    const sB = state.scenes[state.sceneB];
    if (sA && sB) {
      const tracks = getActivePattern(state).kit.tracks;
      const XFADE_PARAMS = ['cutoff', 'decay', 'delaySend', 'pitch', 'volume'];
      tracks.forEach((track, ti) => {
        const tA = (sA.tracks && sA.tracks[ti]) || {};
        const tB = (sB.tracks && sB.tracks[ti]) || {};
        XFADE_PARAMS.forEach(param => {
          const a = tA[param] ?? track[param] ?? 0;
          const b = tB[param] ?? track[param] ?? 0;
          track[param] = a + (b - a) * t;
        });
      });
    }
    renderPage();
    return;
  }

  if (path === 'scale') {
    state.scale = Math.max(0, Math.min(6, Number(value)));
    scheduleSave();
    renderPage();
    if (el.kbdPiano) renderPiano(el.kbdPiano, state);
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

  if (path === 'defaultProb') {
    state.defaultProb = value;
    const track = getActiveTrack(state);
    const len = track.trackLength || getActivePattern(state).length;
    track.steps.slice(0, len).forEach(s => { s.probability = value; });
    renderPage();
    scheduleSave();
    return;
  }

  if (path === 'trigCondition') {
    state.trigCondition = value;
    const conditions = ['always', 'fill', 'not_fill', 'first', 'not_first'];
    const condStr = conditions[Math.round(value)] ?? 'always';
    const track = getActiveTrack(state);
    const pat = getActivePattern(state);
    const len = track.trackLength || pat.length;
    track.steps.slice(0, len).forEach(s => {
      if (s.active) s.trigCondition = condStr;
    });
    renderPage();
    scheduleSave();
    return;
  }

  if (path === 'arrSoloSection') {
    state.arrSoloSection = (value == null || value === -1) ? null : Number(value);
    renderPage();
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
  renderPage();
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
      // Cycle: OFF → LIVE → STEP → OFF
      if (!state.isRecording && !state.stepRecordMode) {
        state.isRecording   = true;
        state.stepRecordMode = false;
      } else if (state.isRecording && !state.stepRecordMode) {
        state.isRecording   = false;
        state.stepRecordMode = true;
        state._stepRecordCursor = 0;
      } else {
        state.isRecording   = false;
        state.stepRecordMode = false;
      }
      updateTransportUI();
      updateTopbar();
      renderPlayhead(); // update cursor highlight on grid
      break;

    // ── Step record: write note to cursor step, then advance ──
    case 'step:record': {
      const recPat = getActivePattern(state);
      const cursor = state._stepRecordCursor ?? 0;
      const recQ      = state.recQuantize ?? 1;
      // Determine which tracks to write to: any recArmed, or fall back to selectedTrackIndex
      const armedIdxs = recPat.kit.tracks
        .map((t, i) => t.recArmed ? i : -1)
        .filter(i => i >= 0);
      const targets = armedIdxs.length > 0 ? armedIdxs : [state.selectedTrackIndex];
      targets.forEach(ti => {
        const trkSteps = recPat.kit.tracks[ti].steps;
        const s = trkSteps[cursor];
        if (s) {
          s.active   = true;
          s.note     = payload.note;
          s.velocity = payload.velocity ?? 1;
          if (!s.paramLocks) s.paramLocks = {};
          s.paramLocks.note = payload.note;
        }
      });
      // Advance cursor
      const patLen = recPat.length;
      const advance = Math.max(1, recQ);
      state._stepRecordCursor = (cursor + advance) % patLen;
      scheduleSave();
      renderPage();
      renderPlayhead();
      updateTopbar();
      break;
    }

    // ── Note preview ──
    case 'note:preview':
      if (state.audioContext) {
        state.engine.previewNote(track, payload.note, payload.velocity ?? 1);
        state._playingNotes.add(payload.note);
        state._pressedKeys.add(payload.note);  // track MIDI note for live recording
        if (el.kbdPiano) lightPianoKey(el.kbdPiano, payload.note, true);
      }
      break;

    case 'note:off':
      state._playingNotes.delete(payload.note);
      state._pressedKeys.delete(payload.note);  // remove MIDI note from live recording set
      if (el.kbdPiano) lightPianoKey(el.kbdPiano, payload.note, false);
      break;

    case 'keyboard:velocityChange': {
      // Update velocity display in the piano panel without full re-render
      const velSlider = el.kbdPiano?.querySelector('.kbd-vel-slider');
      const velVal    = el.kbdPiano?.querySelector('.kbd-vel-val');
      if (velSlider) velSlider.value = payload.velocity;
      if (velVal)    velVal.textContent = Math.round(payload.velocity * 100);
      break;
    }

    // ── Audio init ──
    case 'audio:init':
      ensureAudio();
      break;

    case 'recorder:capture':
      captureRecorderSlot(
        payload.slotIndex ?? state.selectedRecorderSlot ?? 0,
        {
          bars: payload.bars ?? state.recorderBarCount ?? 4,
          source: payload.source ?? 'master',
          trackIndex: payload.trackIndex ?? state.selectedTrackIndex,
        }
      );
      break;

    case 'recorder:load':
      if (!loadRecorderSlotToTrack(payload.slotIndex ?? state.selectedRecorderSlot ?? 0, payload.trackIndex ?? state.selectedTrackIndex)) {
        showToast('No captured slot');
      }
      break;

    case 'recorder:export':
      if (!exportRecorderSlot(payload.slotIndex ?? state.selectedRecorderSlot ?? 0)) {
        showToast('No captured slot');
      }
      break;

    // ── Steps ──
    case 'step:toggle': {
      if (state.patternLocked) return; // ignore when locked
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
      handleStateChange(payload.path ?? payload.param, payload.value, pattern);
      break;

    // ── Track changes ──
    case 'track:change': {
      const tIdx = payload.trackIndex ?? state.selectedTrackIndex;
      const t = pattern.kit.tracks[tIdx];
      if (t && payload.param) {
        pushHistory(state);
        t[payload.param] = payload.value;
        // If this track is the sidechain source and sidechainAmount changed, sync engine
        if (payload.param === 'sidechainAmount' && t.isSidechainSource && state.engine) {
          state.engine.setSidechainAmount(payload.value);
        }
        // sendMuted: mute/unmute per-track FX sends in the engine.
        // The engine creates delaySend/reverbSend as ephemeral per-trigger nodes, so
        // persistent gain nodes on eng.tracks[] are updated when present; the state write
        // above (t[payload.param] = payload.value) ensures future triggers respect the value.
        if (payload.param === 'sendMuted') {
          const eng = state.engine;
          if (eng?.tracks?.[tIdx]) {
            const et = eng.tracks[tIdx];
            const muted = payload.value ?? [false, false];
            if (et.reverbSend) et.reverbSend.gain.setTargetAtTime(muted[0] ? 0 : (t.reverbSend ?? 0), eng.context.currentTime, 0.02);
            if (et.delaySend) et.delaySend.gain.setTargetAtTime(muted[1] ? 0 : (t.delaySend ?? 0), eng.context.currentTime, 0.02);
          }
        }
        // inputGain: update the engine's per-track input gain node when present.
        // inputGain is folded into loudness per trigger from track state, so the state
        // write above is sufficient for future triggers; this syncs any persistent node.
        if (payload.param === 'inputGain') {
          const eng = state.engine;
          if (eng?.tracks?.[tIdx]?.inputGain) {
            eng.tracks[tIdx].inputGain.gain.setTargetAtTime(payload.value, eng.context.currentTime, 0.02);
          }
        }
        // legato is read per-trigger from track.legato — no engine call needed
        // Arp/scale params affect keyboard context (shows/hides arp visualizer)
        if (['arpEnabled','arpMode','arpRange','arpSpeed','arpHold'].includes(payload.param)) {
          renderKbdContext(el.kbdContext, state.currentPage, state._pressedKeys, state, () => getActiveTrack(state));
        }
        scheduleSave();
      }
      break;
    }

    case 'track:select':
      state.selectedTrackIndex = payload.trackIndex;
      state._selectedSteps = new Set(); // clear selection when switching tracks
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

    // ── FX preset shortcut (keyboard A-G on FX page) ──
    case 'fx:preset': {
      const btn = document.querySelector(`#page-content [data-preset-idx="${payload.index}"]`);
      btn?.click();
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
      const density = state.randomizeDensity ?? 0.5;
      const genre   = state.randomizeGenre   ?? 'random';
      const ti      = payload.trackIndex ?? state.selectedTrackIndex;
      const trk     = pattern.kit.tracks[ti];
      const len     = trk.trackLength > 0 ? trk.trackLength : pattern.length;
      const weights = patternPage._getGenreStepWeights(genre, ti, len);
      trk.steps.slice(0, len).forEach((s, si) => {
        const p = density * weights[si];
        s.active = Math.random() < p;
        s.accent = s.active && Math.random() < 0.25;
      });
      scheduleSave();
      renderPage();
      showToast(`Rnd T${ti + 1} (${genre})`);
      break;
    }

    case 'pattern:randomizeAll': {
      pushHistory(state);
      const density = state.randomizeDensity ?? 0.5;
      const genre   = state.randomizeGenre   ?? 'random';
      pattern.kit.tracks.forEach((trk, ti) => {
        const len     = trk.trackLength > 0 ? trk.trackLength : pattern.length;
        const weights = patternPage._getGenreStepWeights(genre, ti, len);
        trk.steps.slice(0, len).forEach((s, si) => {
          const p = density * weights[si];
          s.active = Math.random() < p;
          s.accent = s.active && Math.random() < 0.25;
        });
      });
      scheduleSave();
      renderPage();
      showToast(`Rnd ALL (${genre} ${Math.round(density * 100)}%)`);
      break;
    }

    // ── Octave ──
    case 'octave:shift':
      state.octaveShift = Math.max(-3, Math.min(3, state.octaveShift + payload.delta));
      renderKbdContext(el.kbdContext, state.currentPage, state._pressedKeys, state, () => getActiveTrack(state));
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

    // ── Arranger add section (from quick-add buttons) ──
    case 'arranger:addSection': {
      const { name: secName = 'Section', bars: secBars = 4 } = payload;
      state.arranger.push({
        sceneIdx: Math.max(0, Math.min(7, state.arrangementCursor ?? 0)),
        bars: Math.max(1, Math.min(64, Number(secBars))),
        name: secName,
        repeat: 1,
        muted: false,
        followAction: 'next',
      });
      state.arrangementCursor = state.arranger.length - 1;
      renderPage();
      break;
    }

    // ── Arranger seek ──
    case 'arranger:seek': {
      if (!Array.isArray(state.arranger) || state.arranger.length === 0) break;
      // Find which section index the target bar falls in
      const seekBar = payload.bar ?? 0;
      let cumBars = 0;
      let seekSectionIdx = 0;
      let barsIntoSection = 0;
      for (let i = 0; i < state.arranger.length; i++) {
        const sectionBars = state.arranger[i].bars ?? 1;
        if (seekBar < cumBars + sectionBars || i === state.arranger.length - 1) {
          seekSectionIdx = i;
          barsIntoSection = Math.max(0, seekBar - cumBars);
          break;
        }
        cumBars += sectionBars;
      }
      state._arrSection = seekSectionIdx;
      state._arrSectionBars = barsIntoSection;
      state._arrSectionRepeatCount = 0;
      state.arrangementCursor = seekSectionIdx;
      // Switch to the scene/pattern for this section
      const seekSection = state.arranger[seekSectionIdx];
      if (seekSection != null) {
        state.activePattern = Math.max(0, Math.min(15, seekSection.sceneIdx ?? 0));
        if (state.bpmOverride && seekSection.bpmOverride) {
          state.bpm = seekSection.bpmOverride;
          updateTopbar();
        }
      }
      renderPage();
      break;
    }

    // ── Toast notification ──
    case 'toast':
      showToast(payload.msg, payload.duration ?? 1200);
      break;
  }
}

// ─────────────────────────────────────────────
// KNOB HANDLER
// ─────────────────────────────────────────────
function handleKnobChange(knobIndex, value) {
  const map = KNOB_MAPS[state.currentPage];
  if (!map) return;
  // Support direct param routing (from MIDI CC) — knobIndex may be a param string
  let def;
  if (typeof knobIndex === 'string') {
    def = map.find(d => d && d.param === knobIndex) ?? { param: knobIndex };
  } else {
    def = map[knobIndex];
  }
  if (!def || !def.param) return;

  // MIDI learn: record last-touched param so next CC gets mapped to it
  if (state.midiLearnMode) {
    state.midiLearnTarget = def.param;
  }

  _activeKnobIndex = typeof knobIndex === 'number' ? knobIndex : null;

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
  state.engine.setBpm(state.bpm ?? 120);
  state.engine.initWorklets(); // async — loads cs-resampler worklet in background
  state.engine.setMasterLevel(state.masterLevel);
  if (state.reverbType && state.engine?.setReverbPreset) {
    state.engine.setReverbPreset(state.reverbType);
  }

  // Restore sidechain state from saved track data
  const _activPattern = state.project.banks[state.activeBank].patterns[state.activePattern];
  const _scTrack = _activPattern.kit.tracks.find(t => t.isSidechainSource);
  if (_scTrack) {
    const _scIdx = _activPattern.kit.tracks.indexOf(_scTrack);
    state.engine.setSidechainSource(_scIdx);
    state.engine.setSidechainAmount(_scTrack.sidechainAmount ?? 0);
  }
  // Restore cue bus state
  const _activPat = state.project.banks[state.activeBank].patterns[state.activePattern];
  const hasCue = _activPat.kit.tracks.some(t => t.cue);
  if (hasCue && state.engine?.setCueGain) state.engine.setCueGain(1);
  if (el.masterVolume) el.masterVolume.value = state.masterLevel;
  el.btnAudio.classList.add('active');
  drawOscilloscope(el.oscilloscope, state.engine, _oscAnimRef, state);

  // Oscilloscope click-to-cycle visualizer mode
  if (el.oscilloscope) {
    el.oscilloscope.title = state.oscMode ?? 'wave';
    el.oscilloscope.addEventListener('click', () => {
      const modes = ['wave', 'spectrum', 'lissajous'];
      const cur = state.oscMode ?? 'wave';
      state.oscMode = modes[(modes.indexOf(cur) + 1) % modes.length];
      el.oscilloscope.title = state.oscMode;
      showToast(state.oscMode);
    });
  }

  // Oscilloscope hover expand
  const oscEl = document.getElementById('oscilloscope');
  if (oscEl) {
    oscEl.addEventListener('mouseenter', () => {
      oscEl.classList.add('osc-expanded');
    });
    oscEl.addEventListener('mouseleave', () => {
      oscEl.classList.remove('osc-expanded');
    });
  }

  // Initialise global voice ceiling on the engine
  if (state.engine) state.engine.setMaxVoicesGlobal(state.maxVoicesGlobal ?? 16);

  initSignalMeter();
  startMeterAnimation();
  await initMidi();
  state.midiOutputs = [...midiOutputs];
  if (state.midiOutputId) {
    state.engine.setMidiOutput(getMidiOutputById(state.midiOutputId));
  }

  // MIDI CC input routing
  if (typeof state.engine.setupMidiInput === 'function') {
    state.engine.setupMidiInput((cc, value) => {
      const map = state.midiLearnMap ?? {};
      // If in learn mode, assign the last-touched param
      if (state.midiLearnMode && state.midiLearnTarget) {
        map[cc] = state.midiLearnTarget;
        state.midiLearnMap = map;
        state.midiLearnMode = false;
        saveState(state);
        renderPage();
        return;
      }
      // Route CC to mapped param
      const param = map[cc];
      if (!param) return;
      emit('knob:change', { param, value });
    }).catch(err => {
      console.warn('MIDI CC input setup failed:', err);
    });
  }

  // MIDI clock input sync
  // Rolling buffer of the last 24 pulse intervals (1 bar at 24ppqn) for jitter smoothing
  const MIDI_CLOCK_BUF_SIZE = 24;
  let _midiClockPulses = 0;
  let _midiClockLastTime = 0;
  let _midiClockIntervalBuf = []; // stores ms between consecutive 0xF8 pulses

  if (typeof state.engine.setMidiClockInput === 'function') {
    state.engine.setMidiClockInput(
      // onClock: called 24x per quarter note
      () => {
        if (state.clockSource !== 'midi') return;
        _midiClockPulses++;
        const now = performance.now();

        if (_midiClockLastTime > 0) {
          const interval = now - _midiClockLastTime;

          // Reject implausible intervals (< 2ms or > 250ms = outside 20–300 BPM range at 24ppqn)
          if (interval >= 2 && interval <= 250) {
            _midiClockIntervalBuf.push(interval);
            if (_midiClockIntervalBuf.length > MIDI_CLOCK_BUF_SIZE) {
              _midiClockIntervalBuf.shift();
            }
          }

          if (_midiClockIntervalBuf.length > 0) {
            const avgInterval = _midiClockIntervalBuf.reduce((a, b) => a + b, 0) / _midiClockIntervalBuf.length;
            // BPM = 60s / (avgInterval_ms / 1000 * 24 pulses per beat)
            const derivedBpm = 60000 / (avgInterval * 24);
            const clampedBpm = Math.max(20, Math.min(300, derivedBpm));

            // Only update scheduler BPM if within 5% of current (outlier filter)
            const currentBpm = state.bpm || 120;
            const ratio = clampedBpm / currentBpm;
            if (ratio >= 0.95 && ratio <= 1.05) {
              state.bpm = Math.round(clampedBpm * 10) / 10; // one decimal precision
              if (state.engine?.setBpm) state.engine.setBpm(state.bpm);
              updateTopbar();
            }

            // Track receiving state for display in settings and topbar
            state._midiClockReceiving = true;
            state._midiClockBpm = clampedBpm;
            clearTimeout(state._midiClockTimeout);
            state._midiClockTimeout = setTimeout(() => {
              state._midiClockReceiving = false;
            }, 1000);

            // Pulse the topbar status pill on each bar boundary (every 96 pulses = 4 beats * 24ppqn)
            if (state.clockSource === 'midi' && _midiClockPulses % 96 === 0) {
              const pill = el.statusPill;
              if (pill) {
                pill.classList.add('midi-sync-pulse');
                setTimeout(() => pill.classList.remove('midi-sync-pulse'), 120);
              }
            }
          }
        }

        _midiClockLastTime = now;
      },
      // onStart
      () => {
        if (state.clockSource !== 'midi') return;
        _midiClockPulses = 0;
        _midiClockIntervalBuf = [];
        _midiClockLastTime = 0;
        if (!state.isPlaying) emit('transport:toggle');
      },
      // onStop
      () => {
        if (state.clockSource !== 'midi') return;
        if (state.isPlaying) emit('transport:stop');
      }
    );
  }
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

      // Live recording: pre-compute armed state once per scheduler tick
      const _anyRecArmed = pattern.kit.tracks.some(t => t.recArmed);

      // Per-track scheduling with individual step counters for polyrhythm
      pattern.kit.tracks.forEach((track, ti) => {
        const trackLen = track.stepCount ?? ((track.trackLength > 0) ? track.trackLength : pattern.length);
        const stepIdx = _trackStepIdx[ti];

        // Live recording: capture held MIDI notes onto armed tracks (or selected track if none armed)
        const _trackReceivesLive = _anyRecArmed ? track.recArmed : (ti === state.selectedTrackIndex);
        if (state.isRecording && _trackReceivesLive && state._pressedKeys.size > 0) {
          // Quantize step index to nearest recQuantize subdivision
          const recQ = state.recQuantize ?? 1;
          const qStepIdx = recQ <= 1
            ? stepIdx
            : Math.round(stepIdx / recQ) * recQ % trackLen;
          const step = track.steps[qStepIdx];
          if (step) {
            if (!state.overdubMode) {
              // Normal record: clear all steps in the pattern first, then record
              track.steps.forEach(s => { s.active = false; });
            }
            step.active = true;
            // Use the lowest held MIDI note (numeric keys are MIDI notes)
            const heldNotes = [...state._pressedKeys].filter(k => typeof k === 'number');
            if (heldNotes.length > 0) {
              const note = Math.min(...heldNotes);
              step.note = note;
              step.paramLocks = { ...step.paramLocks, note };
            }
          }
        }

        if (track.mute || (isSoloing && !track.solo)) return;
        const step = track.steps[stepIdx];
        if (!step?.active) return;
        if (step.mute) return;

        // Trig condition check
        if (!evalTrigCondition(step, state._patternLoopCount ?? 0)) return;
        if (Math.random() >= step.probability) return;

        const sceneOverride = sceneParams[ti] || {};

        // Micro-timing offset: fraction of one step duration, range -0.5 to +0.5
        // Per-track swing: if track has swingOverride, use it; else fall back to global state.swing
        const trackSwing = track.swingOverride ?? state.swing ?? 0;
        const trackSwingOffset = (_trackStepIdx[ti] % 2 !== 0 ? 1 : -1) * trackSwing * secsPerStep;
        const microOffset = (step.microTime ?? 0) * secsPerStep + trackSwingOffset;
        const humanize = state.humanizeAmount ?? 0;
        const humanizeOffset = humanize > 0
          ? (Math.random() * 2 - 1) * humanize * secsPerStep * 0.5
          : 0;
        const totalOffset = microOffset + humanizeOffset;
        const latencyComp = (state.latencyCompMs ?? 0) / 1000;

        // Track last-played note for live display on sound page
        state._lastNotes = state._lastNotes ?? {};
        state._lastNotes[ti] = step.paramLocks?.note ?? track.pitch ?? 60;

        // Arpeggiator — when enabled, override the trigger note with an arp note
        if (track.arpEnabled) {
          state._arpIdx = state._arpIdx ?? {};
          state._arpIdx[ti] = state._arpIdx[ti] ?? 0;
          const base = step.paramLocks?.note ?? track.pitch ?? 60;
          const range = track.arpRange ?? 1;
          // When arp hold mode is active, use the latched keyboard notes; otherwise generate from octave range
          let arpNotes;
          if (track.arpHold && Array.isArray(state._arpHeldNotes) && state._arpHeldNotes.length > 0) {
            arpNotes = [...state._arpHeldNotes];
          } else {
            arpNotes = [];
            for (let o = 0; o < range; o++) arpNotes.push(base + o * 12);
          }
          if (track.arpMode === 'down') arpNotes.reverse();
          if (track.arpMode === 'random') arpNotes.sort(() => Math.random() - 0.5);
          let noteToPlay;
          if (track.arpMode === 'updown' && arpNotes.length > 1) {
            const ping = [...arpNotes, ...arpNotes.slice(1, -1).reverse()];
            noteToPlay = ping[state._arpIdx[ti] % ping.length];
            state._arpIdx[ti] = (state._arpIdx[ti] + 1) % ping.length;
          } else {
            noteToPlay = arpNotes[state._arpIdx[ti] % arpNotes.length];
            state._arpIdx[ti] = (state._arpIdx[ti] + 1) % arpNotes.length;
          }
          state._lastNotes[ti] = noteToPlay;
          state.engine.triggerTrack(track, _schedNextTime + totalOffset - latencyComp, secsPerStep, {
            accent:      step.accent,
            note:        step.note,
            velocity:    step.velocity ?? 1,
            trackIndex:  ti,
            paramLocks: { gate: step.gate ?? 0.5, ...sceneOverride, ...step.paramLocks, note: noteToPlay },
          });
          // MIDI output routing (arp path)
          const midiChArp = state.midiOutputChannels?.[ti] ?? 0;
          if (midiChArp > 0 && state.engine?.midiOutput) {
            const note = noteToPlay ?? 60;
            const vel = Math.round((step.velocity ?? 1) * 127);
            const ch = midiChArp - 1; // 0-indexed
            state.engine.midiOutput.send([0x90 | ch, note, vel], window.performance.now());
            const gateDur = (track.gate ?? 0.5) * (60 / state.bpm) * 1000;
            state.engine.midiOutput.send([0x80 | ch, note, 0], window.performance.now() + gateDur);
          }
        } else {
          state.engine.triggerTrack(track, _schedNextTime + totalOffset - latencyComp, secsPerStep, {
            accent:      step.accent,
            note:        step.note,
            velocity:    step.velocity ?? 1,
            trackIndex:  ti,
            paramLocks: { gate: step.gate ?? 0.5, ...sceneOverride, ...step.paramLocks },
          });
          // MIDI output routing (non-arp path)
          const midiCh = state.midiOutputChannels?.[ti] ?? 0;
          if (midiCh > 0 && state.engine?.midiOutput) {
            const note = step.note ?? track.note ?? 60;
            const vel = Math.round((step.velocity ?? 1) * 127);
            const ch = midiCh - 1; // 0-indexed
            state.engine.midiOutput.send([0x90 | ch, note, vel], window.performance.now());
            const gateDur = (track.gate ?? 0.5) * (60 / state.bpm) * 1000;
            state.engine.midiOutput.send([0x80 | ch, note, 0], window.performance.now() + gateDur);
          }
        }
      });

      // Advance all per-track step counters individually
      pattern.kit.tracks.forEach((track, ti) => {
        const trackLen = track.stepCount ?? ((track.trackLength > 0) ? track.trackLength : pattern.length);
        _trackStepIdx[ti] = (_trackStepIdx[ti] + 1) % trackLen;
      });

      // state.currentStep tracks track 0 for the playhead display
      state.currentStep = _trackStepIdx[0];
      _schedStepIdx = _trackStepIdx[0]; // keep alias in sync

      // ── XFade automation record / playback ─────────────────────────────────
      if (state.xfRecording) {
        state.xfadeAutomation[state.currentStep] = state.crossfader ?? 0;
      } else if (state.xfadeAutomation?.length > 0 && state.xfadeAutomation[state.currentStep] != null) {
        const xfVal = state.xfadeAutomation[state.currentStep];
        state.crossfader = xfVal;
        state.crossfade  = xfVal;
      }

      // Pattern chain / arranger advance on loop wrap-around (track 0 step wrapped to 0)
      if (state.currentStep === 0) {
        state._patternLoopCount = (state._patternLoopCount ?? 0) + 1;

        // Scene auto-morph: increment crossfader by 1/bars each bar (pattern loop)
        if (state.sceneMorphActive) {
          const bars = state.sceneMorphBars ?? 4;
          const rawT = Math.min(1, (state.crossfader ?? 0) + 1 / bars);
          const curve = state.morphCurve ?? 'linear';
          let curvedT;
          if (curve === 'ease') {
            curvedT = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;
          } else if (curve === 'bounce') {
            curvedT = Math.abs(Math.sin(rawT * Math.PI));
          } else {
            curvedT = rawT; // linear
          }
          state.crossfader = Math.min(1, curvedT);
          if (rawT >= 1) {
            state.sceneMorphActive = false;
            state.crossfader = 1;
          }
        }

        // Arranger playback
        if (state.arrangementMode && Array.isArray(state.arranger) && state.arranger.length > 0) {
          state._arrSectionBars = (state._arrSectionBars ?? 0) + 1;
          const arrSectionLen = state.arrSectionLen ?? 1;
          const currentArrIdx = state._arrSection ?? 0;
          const section = state.arranger[currentArrIdx];

          // Parse time signature numerator from the current section (e.g. "3/4" → 3, "6/8" → 6)
          const _parseTimeSigNumerator = (ts) => {
            if (!ts) return 4;
            const n = parseInt(ts.split('/')[0], 10);
            return Number.isFinite(n) && n > 0 ? n : 4;
          };
          const timeSigNumerator = _parseTimeSigNumerator(section?.timeSignature);
          // Expose on state so pages can read it for display
          state.timeSigNumerator = timeSigNumerator;

          // A section advances after (section.bars * arrSectionLen * timeSigNumerator / 4) pattern loops.
          // For 4/4 the multiplier is 1 (no change). For 3/4 it takes 3 loops per "bar" instead of 4,
          // meaning section.bars bars complete in (section.bars * 3/4) pattern loops.
          const timeSigLoopsPerBar = timeSigNumerator / 4;
          const loopsNeeded = section ? Math.max(1, Math.round(section.bars * arrSectionLen * timeSigLoopsPerBar)) : 1;

          if (section && state._arrSectionBars >= loopsNeeded) {
            state._arrSectionBars = 0;
            const followAction = section.followAction ?? 'next';
            const repeatCount  = state._arrSectionRepeatCount ?? 0;
            const repeatNeeded = Math.max(1, section.repeat ?? 1);

            if (repeatCount < repeatNeeded - 1) {
              // Section has more repeats to play — stay on current section
              state._arrSectionRepeatCount = repeatCount + 1;
            } else {
              // All repeats done — reset counter and follow the action
              state._arrSectionRepeatCount = 0;
              switch (followAction) {
                case 'loop':
                  // Stay on current section
                  break;
                case 'stop':
                  emit('transport:stop');
                  break;
                case 'jump':
                  state._arrSection = 0;
                  break;
                case 'next':
                default: {
                  const nextIdx = currentArrIdx + 1;
                  const isLast  = nextIdx >= state.arranger.length;
                  if (isLast && state.arrLoop) {
                    state._arrSection = 0;
                  } else if (!isLast) {
                    state._arrSection = nextIdx;
                  }
                  break;
                }
              }
            }

            // Apply bpmOverride from the now-current section
            const nowSection = state.arranger[state._arrSection ?? 0];
            if (nowSection != null) {
              // Update timeSigNumerator for the newly entered section
              state.timeSigNumerator = _parseTimeSigNumerator(nowSection.timeSignature);
              // Map sceneIdx to a pattern index (use sceneIdx as pattern index within active bank)
              state.activePattern = Math.max(0, Math.min(15, nowSection.sceneIdx ?? 0));
              // BPM override: if section carries bpmOverride and state.bpmOverride is non-zero
              if (state.bpmOverride && nowSection.bpmOverride != null) {
                state.bpm = nowSection.bpmOverride;
                updateTopbar();
              }
            }
          }
        }

        // Pattern chain: advance to next pattern after chainLength loops
        if ((state.chainPatterns ?? false) && !state.arrangementMode) {
          if (state._patternLoopCount >= (state.chainLength ?? 1)) {
            const followAction = getActivePattern(state).followAction ?? 'next';
            state._patternLoopCount = 0;
            switch (followAction) {
              case 'next':   state.activePattern = (state.activePattern + 1) % 16; break;
              case 'prev':   state.activePattern = (state.activePattern + 15) % 16; break;
              case 'random': state.activePattern = Math.floor(Math.random() * 16); break;
              case 'first':  state.activePattern = 0; break;
              case 'stop':   emit('transport:stop'); break;
              case 'loop':   /* stay on current pattern */ break;
            }
          }
        }

        // Scene chain: auto-advance to the next scene slot after sceneChainBars bars
        if (state.sceneChainEnabled) {
          state._sceneChainBarCount = (state._sceneChainBarCount ?? 0) + 1;
          if (state._sceneChainBarCount >= (state.sceneChainBars ?? 4)) {
            const sceneCount = state.project.scenes?.length ?? state.scenes.length;
            state.sceneChainIdx = (state.sceneChainIdx + 1) % sceneCount;
            state.sceneA = state.sceneChainIdx;
            state.crossfader = 0;
            state._sceneChainBarCount = 0;
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

      // Advance global clock with global swing (per-track swing is applied as micro-offsets above)
      const globalSwing = state.swing ?? 0;
      const swing = (_trackStepIdx[0] % 2 !== 0 ? 1 : -1) * globalSwing * secsPerStep;
      _schedNextTime += secsPerStep + swing;
    }

    // Update active voice count for perf overlay
    state._activeVoices = state.engine?._voiceQueue
      ? [...state.engine._voiceQueue.values()].reduce((s, q) => s + q.length, 0)
      : 0;

    // Beat flash on topbar at each quarter-note boundary
    if (state.isPlaying) {
      const _pat = getActivePattern(state);
      const _patLen = _pat?.length || 16;
      const _quarterStep = Math.max(1, Math.floor(_patLen / 4));
      const _justScheduled = ((state.currentStep - 1) + _patLen) % _patLen;
      if (_justScheduled % _quarterStep === 0) {
        const _topbar = document.querySelector('.screen-topbar');
        if (_topbar) {
          _topbar.classList.add('beat-flash');
          clearTimeout(_topbar._beatTimeout);
          _topbar._beatTimeout = setTimeout(() => _topbar.classList.remove('beat-flash'), 80);
        }
      }
    }

    renderPlayhead();
    _schedRafId = requestAnimationFrame(tick);
  };
  _schedRafId = requestAnimationFrame(tick);
}

function evalTrigCondition(step, loopCount) {
  const cond = step.trigCondition ?? 'always';
  switch (cond) {
    case 'always':    return true;
    case '1st':       return loopCount === 0;
    case 'not1st':    return loopCount > 0;
    case 'every2':    return loopCount % 2 === 0;
    case 'every3':    return loopCount % 3 === 0;
    case 'every4':    return loopCount % 4 === 0;
    case 'random':    return Math.random() < (step.prob ?? step.probability ?? 1);
    case 'fill':      return state._fillActive ?? false;
    case 'not_fill':  return !(state._fillActive ?? false);
    // Legacy conditions kept for backward compat
    case 'first':     return loopCount === 0;
    case 'not_first':
    case 'not:first': return loopCount > 0;
    default: {
      // Legacy ratio format: "1:2", "1:4", "3:4" — evaluated against loopCount
      const m = cond.match(/^(\d+):(\d+)$/);
      if (m) {
        const [, num, den] = m.map(Number);
        return loopCount % den < num;
      }
      return true;
    }
  }
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
    if (state.midiClockOut && state.engine?.startMidiClock) {
      state.engine.startMidiClock(state.bpm ?? 120);
    }
    updateTransportUI();
    scheduleLoop();
  }
}

function stopPlay() {
  state.isPlaying = false;
  state.currentStep = -1;
  _trackStepIdx = Array(8).fill(0);
  _schedStepIdx = 0;
  state._patternLoopCount = 0;
  state._sceneChainBarCount = 0;
  state._arrSectionRepeatCount = 0;
  state._playingNotes.clear();
  state._pressedKeys.clear();
  if (_schedRafId) { cancelAnimationFrame(_schedRafId); _schedRafId = null; }
  state.engine?.stopAllNotes();
  if (state.midiClockOut && state.engine?.stopMidiClock) {
    state.engine.stopMidiClock();
  }
  // Restore any randomized fill steps when stopping
  if (state._preFillSnapshot) {
    state._fillActive = false;
    renderFillBtn();
    restorePreFillSnapshot();
  }
  updateTransportUI();
  renderPlayhead();
}

// ─────────────────────────────────────────────
// TAP TEMPO
// ─────────────────────────────────────────────
function tapTempo() {
  const now = Date.now();
  if (!state._tapTimes) state._tapTimes = [];
  if (state._tapTimes.length > 0 && now - state._tapTimes[state._tapTimes.length - 1] > 3000) {
    state._tapTimes = []; // reset after 3s gap
  }
  state._tapTimes.push(now);
  if (state._tapTimes.length > 8) state._tapTimes.shift();
  if (state._tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < state._tapTimes.length; i++) {
      intervals.push(state._tapTimes[i] - state._tapTimes[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avg);
    const clamped = Math.max(40, Math.min(240, bpm));
    state.bpm = clamped;
    emit('state:change', { path: 'bpm', value: clamped });
    const tapBtn = document.getElementById('btn-tap');
    if (tapBtn) {
      tapBtn.textContent = clamped + ' BPM';
      clearTimeout(state._tapBtnTimer);
      state._tapBtnTimer = setTimeout(() => { tapBtn.textContent = 'Tap'; }, 1500);
    }
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
  renderKbdContext(el.kbdContext, state.currentPage, state._pressedKeys, state, () => getActiveTrack(state));
  if (el.kbdPiano) renderPiano(el.kbdPiano, state);
  updateTransportUI();
}

function renderPage() {
  const page = PAGES[state.currentPage];
  if (!page) return;
  // Run any cleanup registered by the previous page (e.g. clear intervals/rAFs)
  el.pageContent._cleanup?.();
  el.pageContent._cleanup = null;
  page.render(el.pageContent, state, emit);
  // Keep topbar page label in sync regardless of what triggered re-render
  const pageLabel = document.getElementById('topbar-page-label');
  if (pageLabel) {
    const PAGE_LABELS = {
      'pattern': 'PATTERN', 'piano-roll': 'PIANO ROLL', 'sound': 'SOUND',
      'mixer': 'MIXER', 'fx': 'FX', 'scenes': 'SCENES',
      'banks': 'BANKS', 'arranger': 'ARR', 'settings': 'SETTINGS',
    };
    pageLabel.textContent = PAGE_LABELS[state.currentPage] ?? '';
  }
  renderPageTabs();
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

  const GRP_COLORS = [
    '#f0c640','#5add71','#67d7ff','#ff8c52',
    '#c67dff','#ff6eb4','#40e0d0','#f05b52',
  ];

  pattern.kit.tracks.forEach((track, i) => {
    const isActive = i === state.selectedTrackIndex;
    const hasTriggers = track.steps.slice(0, track.trackLength || pattern.length).some(s => s.active);

    const row = document.createElement('div');
    row.className = 'track-ch' + (isActive ? ' active track-selected' : '') + (track.mute ? ' muted' : '');
    row.style.height = '36px';
    row.style.borderLeft = '3px solid ' + TRACK_COLORS[i];
    row.style.setProperty('--track-color', TRACK_COLORS[i]);
    row.style.position = 'relative';

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
    mac.style.color = TRACK_COLORS[i % TRACK_COLORS.length];
    mac.style.opacity = '0.7';

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

    const volBar = document.createElement('div');
    volBar.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--track-color,var(--accent));opacity:${track.volume ?? 0.8};border-radius:0 0 2px 2px`;

    row.append(led, info, btnM, btnS, volBar);

    // Group assignment dot
    if (track.groupIndex != null) {
      const grpDot = document.createElement('span');
      grpDot.style.cssText = `width:4px;height:4px;border-radius:50%;background:${GRP_COLORS[track.groupIndex]};flex-shrink:0`;
      grpDot.title = `Group: ${(state.groups ?? [])[track.groupIndex]?.name ?? `G${track.groupIndex + 1}`}`;
      row.append(grpDot);
    }

    row.addEventListener('click', () => emit('track:select', { trackIndex: i }));
    el_cs.append(row);
  });

  // ── Group buttons (2×4 grid below track strip) ────────────────────────────
  // Remove existing group section if re-rendering
  document.getElementById('group-buttons-section')?.remove();

  const grpSection = document.createElement('div');
  grpSection.id = 'group-buttons-section';
  grpSection.style.cssText = [
    'margin-top:6px',
    'padding-top:6px',
    'border-top:1px solid rgba(255,255,255,0.08)',
  ].join(';');

  const grpLabel = document.createElement('div');
  grpLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);letter-spacing:0.12em;text-align:center;margin-bottom:4px';
  grpLabel.textContent = 'GROUPS';
  grpSection.append(grpLabel);

  const grpGrid = document.createElement('div');
  grpGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:3px';

  (state.groups ?? []).forEach((grp, gi) => {
    const btn = document.createElement('button');
    btn.style.cssText = [
      'display:flex', 'align-items:center', 'gap:3px',
      'padding:4px 5px',
      'height:36px',
      `border:1px solid ${grp.muted ? 'rgba(255,255,255,0.1)' : GRP_COLORS[gi] + '60'}`,
      `background:${grp.muted ? 'rgba(0,0,0,0.3)' : GRP_COLORS[gi] + '18'}`,
      'border-radius:3px', 'cursor:pointer',
      'font-family:var(--font-mono)', 'font-size:0.42rem',
      `color:${grp.muted ? 'var(--muted)' : GRP_COLORS[gi]}`,
      'white-space:nowrap', 'overflow:hidden',
    ].join(';');

    // Count tracks in this group
    const trackCount = pattern.kit.tracks.filter(t => t.groupIndex === gi).length;

    const dot = document.createElement('span');
    dot.style.cssText = `width:5px;height:5px;border-radius:50%;background:${GRP_COLORS[gi]};flex-shrink:0;opacity:${grp.muted ? 0.3 : 1}`;

    const nameLbl = document.createElement('span');
    nameLbl.textContent = grp.name;
    nameLbl.style.flex = '1';

    const countLbl = document.createElement('span');
    countLbl.style.cssText = 'font-size:0.38rem;opacity:0.6';
    countLbl.textContent = trackCount > 0 ? `${trackCount}t` : '';

    btn.append(dot, nameLbl, countLbl);

    // Click = mute-toggle all tracks in this group
    btn.addEventListener('click', e => {
      if (e.shiftKey) {
        // Shift+click = assign selected track to this group (or remove if already assigned)
        const track = pattern.kit.tracks[state.selectedTrackIndex];
        if (track) {
          track.groupIndex = (track.groupIndex === gi) ? null : gi;
          emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
          renderTrackSelector(); // re-render to show updated assignment
        }
        return;
      }
      // Normal click = toggle group mute
      grp.muted = !grp.muted;
      pattern.kit.tracks.forEach((t, ti) => {
        if (t.groupIndex === gi) {
          t.mute = grp.muted;
          emit('track:change', { trackIndex: ti, param: 'mute', value: grp.muted });
        }
      });
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      renderTrackSelector();
    });

    // Right-click = rename group
    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      const newName = window.prompt('Group name:', grp.name);
      if (newName?.trim()) {
        grp.name = newName.trim().substring(0, 4).toUpperCase();
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        renderTrackSelector();
      }
    });

    grpGrid.append(btn);
  });

  grpSection.append(grpGrid);

  // Group assignment hint
  const hint = document.createElement('div');
  hint.style.cssText = 'font-family:var(--font-mono);font-size:0.38rem;color:var(--muted);text-align:center;margin-top:3px;opacity:0.6';
  hint.textContent = 'SHIFT+click to assign track';
  grpSection.append(hint);

  el_cs.append(grpSection);
}

function renderPlayhead() {
  if (state.stepRecordMode) {
    el.statusPill.textContent = 'STEP-REC';
    el.statusPill.className = 'topbar-item topbar-status recording';
    el.statusPill.style.color = 'var(--record)';
  } else if (state.isRecording && state.isPlaying) {
    el.statusPill.textContent = '● REC';
    el.statusPill.className = 'topbar-item topbar-status recording';
    el.statusPill.style.color = '';
  } else if (state.isPlaying) {
    el.statusPill.textContent = '▶ PLAY';
    el.statusPill.className = 'topbar-item topbar-status playing';
    el.statusPill.style.color = '';
  } else {
    el.statusPill.textContent = 'IDLE';
    el.statusPill.className = 'topbar-item topbar-status';
    el.statusPill.style.color = '';
  }

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

  // Update loop counter display in realtime (lightweight — only touches the counter element)
  const _loopCountEl = document.getElementById('loop-count-display');
  if (_loopCountEl) {
    const _loopN = state._patternLoopCount ?? 0;
    if (state.isPlaying && _loopN > 0) {
      _loopCountEl.style.display = '';
      _loopCountEl.textContent = `\xd7${_loopN}`;
    } else {
      _loopCountEl.style.display = 'none';
    }
  }
}

function updateTopbar() {
  const BANKS = 'ABCDEFGH';
  el.bankPattern.textContent = `${BANKS[state.activeBank]}·${String(state.activePattern + 1).padStart(2, '0')}`;
  const _bpmStr = Number.isInteger(state.bpm) ? String(state.bpm) : state.bpm.toFixed(1);
  el.bpmDisplay.textContent  = `${_bpmStr} BPM`;
  if (el.kbdBpm) el.kbdBpm.textContent = `${_bpmStr} BPM`;
  if (el.bpmInput) el.bpmInput.value = state.bpm;

  // Page label in topbar
  let pageLabel = document.getElementById('topbar-page-label');
  if (!pageLabel) {
    pageLabel = document.createElement('span');
    pageLabel.id = 'topbar-page-label';
    pageLabel.className = 'topbar-item';
    pageLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em';
    el.statusPill?.insertAdjacentElement('beforebegin', pageLabel);
  }
  const PAGE_LABELS = {
    'pattern': 'PATTERN', 'piano-roll': 'PIANO ROLL', 'sound': 'SOUND',
    'mixer': 'MIXER', 'fx': 'FX', 'scenes': 'SCENES',
    'banks': 'BANKS', 'arranger': 'ARR', 'settings': 'SETTINGS',
  };
  pageLabel.textContent = PAGE_LABELS[state.currentPage] ?? '';

  // Step-record cursor indicator in topbar
  let stepCursorDisplay = document.getElementById('step-cursor-display');
  if (!stepCursorDisplay) {
    stepCursorDisplay = document.createElement('span');
    stepCursorDisplay.id = 'step-cursor-display';
    stepCursorDisplay.className = 'topbar-item';
    stepCursorDisplay.style.cssText = [
      'font-family:var(--font-mono)', 'font-size:0.52rem', 'color:#3af',
      'background:rgba(51,170,255,0.12)', 'border:1px solid rgba(51,170,255,0.4)',
      'border-radius:3px', 'padding:1px 5px', 'display:none',
    ].join(';');
    el.bpmDisplay?.insertAdjacentElement('afterend', stepCursorDisplay);
  }
  if (state.stepRecordMode) {
    stepCursorDisplay.style.display = '';
    stepCursorDisplay.textContent = `STP ${(state._stepRecordCursor ?? 0) + 1}`;
  } else {
    stepCursorDisplay.style.display = 'none';
  }

  // Overdub indicator
  let overdubDisplay = document.getElementById('overdub-display');
  if (!overdubDisplay) {
    overdubDisplay = document.createElement('span');
    overdubDisplay.id = 'overdub-display';
    overdubDisplay.className = 'topbar-item';
    overdubDisplay.style.cssText = [
      'font-family:var(--font-mono)', 'font-size:0.52rem', 'color:#f90',
      'background:rgba(255,144,0,0.12)', 'border:1px solid rgba(255,144,0,0.4)',
      'border-radius:3px', 'padding:1px 5px', 'display:none',
    ].join(';');
    overdubDisplay.textContent = 'OVR';
    document.getElementById('step-cursor-display')?.insertAdjacentElement('afterend', overdubDisplay);
  }
  overdubDisplay.style.display = (state.overdubMode && state.isRecording) ? '' : 'none';

  // Chain display
  let chainDisplay = document.getElementById('chain-display');
  if (!chainDisplay) {
    chainDisplay = document.createElement('span');
    chainDisplay.id = 'chain-display';
    chainDisplay.className = 'topbar-item topbar-chain';
    document.getElementById('bank-pattern')?.insertAdjacentElement('afterend', chainDisplay);
  }

  if (state.chainPatterns) {
    chainDisplay.classList.add('chain-active');
    const bank = state.activeBank;
    const patterns = state.project?.banks?.[bank]?.patterns;
    const PREVIEW_COUNT = 3;
    const parts = [`${BANKS[bank]}·${String(state.activePattern + 1).padStart(2, '0')}`];

    let cursor = state.activePattern;
    for (let i = 0; i < PREVIEW_COUNT - 1; i++) {
      const followAction = patterns?.[cursor]?.followAction ?? 'next';
      if (followAction === 'stop') {
        parts.push('■');
        break;
      } else if (followAction === 'random') {
        parts.push('???');
        break;
      } else if (followAction === 'loop') {
        parts.push(`${BANKS[bank]}·${String(cursor + 1).padStart(2, '0')}`);
        break;
      } else {
        // 'next' or default
        cursor = (cursor + 1) % 16;
        parts.push(`${BANKS[bank]}·${String(cursor + 1).padStart(2, '0')}`);
      }
    }

    chainDisplay.textContent = parts.join(' → ');
  } else {
    chainDisplay.classList.remove('chain-active');
    chainDisplay.textContent = '';
  }

  // Loop counter indicator
  let loopCountDisplay = document.getElementById('loop-count-display');
  if (!loopCountDisplay) {
    loopCountDisplay = document.createElement('span');
    loopCountDisplay.id = 'loop-count-display';
    loopCountDisplay.className = 'topbar-item';
    loopCountDisplay.style.cssText = [
      'font-family:var(--font-mono)', 'font-size:0.52rem', 'color:#fa0',
      'background:rgba(255,170,0,0.1)', 'border:1px solid rgba(255,170,0,0.3)',
      'border-radius:3px', 'padding:1px 5px', 'display:none',
    ].join(';');
    document.getElementById('chain-display')?.insertAdjacentElement('afterend', loopCountDisplay);
  }
  const loopN = state._patternLoopCount ?? 0;
  if (state.isPlaying && loopN > 0) {
    loopCountDisplay.style.display = '';
    loopCountDisplay.textContent = `\xd7${loopN}`;
  } else {
    loopCountDisplay.style.display = 'none';
  }
}

function updateTransportUI() {
  el.btnPlay.classList.toggle('active', state.isPlaying);
  el.kbdPlay?.classList.toggle('active', state.isPlaying);
  el.btnPlay.textContent = state.isPlaying ? '■' : '▶';

  // Record button cycles OFF → LIVE → STEP; reflect label + active class
  if (el.btnRecord) {
    el.btnRecord.classList.toggle('active', state.isRecording || state.stepRecordMode);
    el.btnRecord.classList.toggle('step-record-mode', state.stepRecordMode);
    if (state.stepRecordMode) {
      el.btnRecord.textContent = 'STP';
      el.btnRecord.title = 'Step record active — click to disable';
    } else if (state.isRecording) {
      el.btnRecord.textContent = 'REC';
      el.btnRecord.title = 'Live record active — click for step record';
    } else {
      el.btnRecord.textContent = '●';
      el.btnRecord.title = 'Click to enable live record';
    }
  }
  el.kbdRecord?.classList.toggle('active', state.isRecording || state.stepRecordMode);
  document.querySelector('.screen-bezel')?.classList.toggle('is-playing', state.isPlaying);
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
// AUDIO EXPORT
// ─────────────────────────────────────────────
async function exportAudio(engine) {
  const ctx = engine.context;
  const dest = ctx.createMediaStreamDestination();
  engine.master.connect(dest);
  const rec = new MediaRecorder(dest.stream);
  const chunks = [];
  rec.ondataavailable = e => chunks.push(e.data);
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'confusynth-export.webm';
    a.click();
    engine.master.disconnect(dest);
  };
  rec.start();
  setTimeout(() => rec.stop(), 8000); // 8 second capture
}

function captureMasterBuffer(engine, durationSec) {
  return new Promise((resolve, reject) => {
    const ctx = engine?.context;
    if (!ctx) {
      reject(new Error('Audio engine not initialized'));
      return;
    }

    const channelCount = 2;
    const processor = ctx.createScriptProcessor(4096, channelCount, channelCount);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    const leftChunks = [];
    const rightChunks = [];
    let totalFrames = 0;
    const targetFrames = Math.max(1, Math.ceil(durationSec * ctx.sampleRate));
    let stopped = false;

    function finish() {
      if (stopped) return;
      stopped = true;
      try { engine.master.disconnect(processor); } catch (_) {}
      processor.disconnect();
      sink.disconnect();

      const left = new Float32Array(totalFrames);
      const right = new Float32Array(totalFrames);
      let offset = 0;
      leftChunks.forEach((chunk, idx) => {
        left.set(chunk, offset);
        right.set(rightChunks[idx], offset);
        offset += chunk.length;
      });

      const buffer = ctx.createBuffer(channelCount, totalFrames, ctx.sampleRate);
      buffer.copyToChannel(left, 0);
      buffer.copyToChannel(right, 1);
      resolve(buffer);
    }

    processor.onaudioprocess = (event) => {
      if (stopped) return;
      const inputL = event.inputBuffer.getChannelData(0);
      const inputR = event.inputBuffer.numberOfChannels > 1
        ? event.inputBuffer.getChannelData(1)
        : inputL;
      const remaining = targetFrames - totalFrames;
      if (remaining <= 0) {
        finish();
        return;
      }
      const frameCount = Math.min(remaining, inputL.length);
      leftChunks.push(new Float32Array(inputL.slice(0, frameCount)));
      rightChunks.push(new Float32Array(inputR.slice(0, frameCount)));
      totalFrames += frameCount;
      if (totalFrames >= targetFrames) finish();
    };

    engine.master.connect(processor);
    processor.connect(sink);
    sink.connect(ctx.destination);
  });
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
  el.btnRecord?.addEventListener('click', () => emit('transport:record'));

  // Overdub toggle button
  let overdubBtn = document.getElementById('btn-overdub');
  if (!overdubBtn) {
    overdubBtn = document.createElement('button');
    overdubBtn.id = 'btn-overdub';
    overdubBtn.className = 'transport-btn' + (state.overdubMode ? ' active' : '');
    overdubBtn.textContent = 'OVR';
    overdubBtn.title = 'Overdub mode: add notes without erasing';
    overdubBtn.style.cssText = 'font-size:0.44rem;padding:1px 4px';
    overdubBtn.addEventListener('click', () => {
      state.overdubMode = !state.overdubMode;
      overdubBtn.classList.toggle('active', state.overdubMode);
      updateTopbar();
    });
    const statusPillOvr = document.getElementById('status-pill');
    if (statusPillOvr) {
      statusPillOvr.insertAdjacentElement('afterend', overdubBtn);
    } else {
      document.querySelector('.topbar-right')?.append(overdubBtn);
    }
  }
  el.kbdPlay?.addEventListener('click',   () => togglePlay());
  el.kbdStop?.addEventListener('click',   () => stopPlay());
  el.kbdRecord?.addEventListener('click', () => emit('transport:record'));
  if (el.btnTap)  el.btnTap.addEventListener('click', tapTempo);
  if (el.btnTap)  el.btnTap.addEventListener('touchstart', e => {
    e.preventDefault(); // prevent double-firing with click
    tapTempo();
    updateTopbar();
  }, { passive: false });
  if (el.btnFill) el.btnFill.addEventListener('click', toggleFill);

  // BPM edit
  if (el.bpmInput) {
    el.bpmInput.addEventListener('input', e => {
      emit('state:change', { path: 'bpm', value: Number(e.target.value) });
    });
    addNumericDrag(el.bpmInput);
  }
  if (el.bpmDisplay) {
    el.bpmDisplay.style.cursor = 'pointer';
    el.bpmDisplay.title = 'Double-click to edit BPM';
    el.bpmDisplay.addEventListener('dblclick', () => {
      const inp = document.getElementById('bpm-input');
      if (inp) { inp.focus(); inp.select(); }
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

  // Undo / Redo keyboard shortcuts + Piano Roll copy/paste
  document.addEventListener('keydown', e => {
    if (!e.ctrlKey && !e.metaKey) return;

    // Piano Roll copy/paste + select all
    if (state.currentPage === 'piano-roll') {
      if (e.key === 'c') {
        e.preventDefault();
        const track = getActiveTrack(state);
        state.rollCopyBuffer = JSON.parse(JSON.stringify(track.steps));
        showToast('Notes copied');
        return;
      }
      if (e.key === 'v') {
        e.preventDefault();
        if (state.rollCopyBuffer) {
          pushHistory(state);
          const track = getActiveTrack(state);
          track.steps = JSON.parse(JSON.stringify(state.rollCopyBuffer));
          renderPage();
          saveState(state);
          showToast('Notes pasted');
        }
        return;
      }
      if (e.key === 'a') {
        // Ctrl+A on piano-roll: select all active notes
        e.preventDefault();
        const track = getActiveTrack(state);
        const pat = getActivePattern(state);
        const len = pat.length;
        state.rollSelected = new Set();
        track.steps.slice(0, len).forEach((step, si) => {
          if (step.active) {
            const note = step.paramLocks?.note ?? step.note;
            state.rollSelected.add(`${note}_${si}`);
          }
        });
        renderPage();
        showToast(`${state.rollSelected.size} notes selected`);
        return;
      }
    }

    if (e.key === 'z' || e.key === 'Z') {
      if (e.shiftKey) {
        redoHistory(state);
        renderPage();
        saveState(state);
        showToast('\u21AA Redo (' + _historyIdx + '/' + (_history.length - 1) + ')');
      } else {
        undoHistory(state);
        renderPage();
        saveState(state);
        showToast('\u21A9 Undo (' + _historyIdx + '/' + (_history.length - 1) + ')');
      }
      e.preventDefault();
    } else if (e.key === 'y' || e.key === 'Y') {
      redoHistory(state);
      renderPage();
      saveState(state);
      showToast('\u21AA Redo (' + _historyIdx + '/' + (_history.length - 1) + ')');
      e.preventDefault();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      if (e.shiftKey) {
        // Ctrl+Shift+M: mark named checkpoint at current history position
        const pageNames = {
          pattern: 'Pattern edit', 'piano-roll': 'Piano roll edit', sound: 'Sound edit',
          mixer: 'Mixer edit', fx: 'FX edit', scenes: 'Scene edit', banks: 'Bank edit',
          arranger: 'Arranger edit', settings: 'Settings edit',
        };
        const label = pageNames[state.currentPage] || 'Edit';
        markCheckpoint(label);
      } else {
        // Ctrl+M: toggle mute on selected track
        emit('track:mute', { trackIndex: state.selectedTrackIndex });
        const track = getActiveTrack(state);
        showToast(`T${state.selectedTrackIndex + 1} ${track.mute ? 'Muted' : 'Unmuted'}`);
      }
    } else if (e.key === 'd' || e.key === 'D') {
      // Ctrl+D: duplicate current pattern into next slot
      e.preventDefault();
      const bank = state.project.banks[state.activeBank];
      const srcIdx = state.activePattern;
      const srcPat = bank.patterns[srcIdx];
      const destIdx = (srcIdx + 1) % bank.patterns.length;
      pushHistory(state);
      bank.patterns[destIdx] = JSON.parse(JSON.stringify(srcPat));
      state.activePattern = destIdx;
      scheduleSave();
      renderAll();
      showToast(`Pattern duplicated → ${String(destIdx + 1).padStart(2, '0')}`);
    } else if (e.key === 's' || e.key === 'S') {
      // Ctrl+S: save
      if (!e.shiftKey) {
        e.preventDefault();
        saveState(state);
        showToast('Saved');
      }
    } else if ((e.key === 'e' || e.key === 'E') && e.shiftKey) {
      // Ctrl+Shift+E: Export MIDI
      e.preventDefault();
      exportMidi(state);
      showToast('MIDI exported');
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
        <h4>Transport</h4>
        <dl>
          <dt>Space</dt><dd>Play / Stop</dd>
          <dt>R</dt><dd>Record</dd>
          <dt>Escape</dt><dd>Stop / Clear selection</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>Navigation</h4>
        <dl>
          <dt>1–8</dt><dd>Select track 1–8</dd>
          <dt>Q–O</dt><dd>Switch pages</dd>
          <dt>Tab</dt><dd>Next page</dd>
          <dt>Shift+Tab</dt><dd>Previous page</dd>
          <dt>F1</dt><dd>Settings page</dd>
          <dt>F2</dt><dd>Pattern page</dd>
          <dt>F3</dt><dd>Sound page</dd>
          <dt>F4</dt><dd>Mixer page</dd>
          <dt>F5</dt><dd>Piano Roll page</dd>
          <dt>F6</dt><dd>FX page</dd>
          <dt>F7</dt><dd>Arranger page</dd>
          <dt>F8</dt><dd>Scenes page</dd>
          <dt>F9</dt><dd>Banks page</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>Step Entry (Pattern page)</h4>
        <dl>
          <dt>A–L</dt><dd>Toggle steps 1–9</dd>
          <dt>Z–M</dt><dd>Toggle steps 10–16</dd>
          <dt>Shift+key</dt><dd>Accent step</dd>
          <dt>Ctrl+A</dt><dd>Select all active steps</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>Piano (non-pattern pages)</h4>
        <dl>
          <dt>A–K</dt><dd>Notes C–D' (white keys)</dd>
          <dt>Z–M</dt><dd>Notes C#–D#' (black keys)</dd>
          <dt>Z</dt><dd>Octave down</dd>
          <dt>X</dt><dd>Octave up</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>Editing</h4>
        <dl>
          <dt>Ctrl+Z</dt><dd>Undo</dd>
          <dt>Ctrl+Shift+Z / Ctrl+Y</dt><dd>Redo</dd>
          <dt>Ctrl+S</dt><dd>Save</dd>
          <dt>Ctrl+D</dt><dd>Duplicate current pattern</dd>
          <dt>Ctrl+M</dt><dd>Toggle mute on selected track</dd>
          <dt>Ctrl+C</dt><dd>Copy pattern</dd>
          <dt>Ctrl+V</dt><dd>Paste pattern</dd>
          <dt>Ctrl+Shift+E</dt><dd>Export MIDI</dd>
          <dt>Del / Bksp</dt><dd>Clear selected steps</dd>
        </dl>
      </div>
      <div class="help-section">
        <h4>BPM &amp; Function</h4>
        <dl>
          <dt>+  /  =</dt><dd>BPM +1</dd>
          <dt>-  /  _</dt><dd>BPM −1</dd>
          <dt>?</dt><dd>This help</dd>
        </dl>
      </div>
    </div>
    <button class="help-close seq-btn">Close</button>
  </div>
`;
  document.body.append(helpModal);
  helpModal.querySelector('.help-backdrop').addEventListener('click', () => helpModal.style.display = 'none');
  helpModal.querySelector('.help-close').addEventListener('click', () => helpModal.style.display = 'none');

  // Delete/Backspace: deactivate all selected steps on pattern page
  document.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') &&
        state.currentPage === 'pattern') {
      // Only act if focus is not in an input/textarea
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      if (e.shiftKey) {
        // Shift+Delete: clear entire selected track
        e.preventDefault();
        pushHistory(state);
        const track = getActiveTrack(state);
        track.steps.forEach(s => { s.active = false; });
        state._selectedSteps = new Set();
        scheduleSave();
        renderPage();
        showToast('Track cleared');
      } else if (state._selectedSteps?.size > 0) {
        e.preventDefault();
        pushHistory(state);
        const track = getActiveTrack(state);
        state._selectedSteps.forEach(si => {
          if (track.steps[si]) track.steps[si].active = false;
        });
        state._selectedSteps = new Set();
        scheduleSave();
        renderPage();
      }
    }
  });

  // ? opens help modal; F1-F9 navigate pages; Escape closes modal
  document.addEventListener('keydown', e => {
    // F-key page navigation
    const F_KEY_PAGES = {
      F1: 'settings', F2: 'pattern', F3: 'sound', F4: 'mixer',
      F5: 'piano-roll', F6: 'fx', F7: 'arranger', F8: 'scenes', F9: 'banks',
    };
    if (F_KEY_PAGES[e.key]) {
      e.preventDefault();
      emit('page:set', { page: F_KEY_PAGES[e.key] });
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      const m = document.getElementById('help-modal');
      if (m) m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
    }
    if (e.key === 'Escape') {
      const m = document.getElementById('help-modal');
      if (m && m.style.display === 'flex') { m.style.display = 'none'; e.preventDefault(); }
    }
  });

  // BPM +/- shortcuts, pattern page shortcuts (Escape, Ctrl+A, Home/End)
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;

    // ` toggles performance overlay
    if (e.key === '`' && !e.ctrlKey) {
      e.preventDefault();
      togglePerfOverlay();
      return;
    }

    // Number row: 1-8 = select track, 9 = panic, 0 = mute, - = BPM-1, = = BPM+1
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const _digit = { Digit1:0, Digit2:1, Digit3:2, Digit4:3, Digit5:4, Digit6:5, Digit7:6, Digit8:7 }[e.code];
      if (_digit !== undefined) {
        e.preventDefault();
        state.selectedTrackIndex = _digit;
        emit('track:select', { trackIndex: _digit });
        return;
      }
      if (e.code === 'Digit9') { e.preventDefault(); state.engine?.panic?.(); return; }
      if (e.code === 'Digit0') { e.preventDefault(); emit('track:mute', { trackIndex: state.selectedTrackIndex ?? 0 }); return; }
      if (e.code === 'Minus') {
        state.bpm = Math.max(40, (state.bpm ?? 120) - 1);
        state.engine?.setBpm?.(state.bpm);
        updateTopbar(); saveState(state);
        e.preventDefault();
        return;
      }
      if (e.code === 'Equal') {
        state.bpm = Math.min(240, (state.bpm ?? 120) + 1);
        state.engine?.setBpm?.(state.bpm);
        updateTopbar(); saveState(state);
        e.preventDefault();
        return;
      }
    }

    // +/= increment BPM, -/_ decrement BPM (no modifier)
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '+' || e.key === '=') {
        state.bpm = Math.min(240, (state.bpm ?? 120) + 1);
        updateTopbar(); saveState(state);
        e.preventDefault();
        return;
      }
      if (e.key === '-' || e.key === '_') {
        state.bpm = Math.max(40, (state.bpm ?? 120) - 1);
        updateTopbar(); saveState(state);
        e.preventDefault();
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        emit('bank:select', { bankIndex: 0 });
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        emit('bank:select', { bankIndex: 7 });
        return;
      }
    }

    // Piano Roll: Escape clears selection; Shift+Arrow transposes selected notes
    if (state.currentPage === 'piano-roll') {
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        if (state.rollSelected?.size > 0) {
          state.rollSelected = new Set();
          renderPage();
        }
        return;
      }
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.ctrlKey ? 12 : 1);
        const track = getActiveTrack(state);
        const sel = state.rollSelected ?? new Set();
        sel.forEach(key => {
          const [midi, si] = key.split('_').map(Number);
          const step = track.steps[si];
          if (step) {
            const newNote = Math.max(24, Math.min(96, midi + delta));
            if (step.paramLocks) step.paramLocks.note = newNote;
            else step.note = newNote;
          }
        });
        // Update rollSelected keys to new MIDI values
        state.rollSelected = new Set([...sel].map(key => {
          const [midi, si] = key.split('_').map(Number);
          return `${Math.max(24, Math.min(96, midi + delta))}_${si}`;
        }));
        emit('state:change', { path: 'rollScroll', value: state.rollScroll ?? 0.5 });
        return;
      }
    }

    if (state.currentPage === 'pattern') {
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        state._selectedSteps?.clear();
        renderPage();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const track = getActiveTrack(state);
        const pat = getActivePattern(state);
        const len = track.trackLength || pat.length;
        state._selectedSteps = new Set(
          track.steps.slice(0, len).map((s, i) => s.active ? i : -1).filter(i => i >= 0)
        );
        renderPage();
        return;
      }
    }

    // Scene quick-snapshot hotkeys (only on scenes page)
    if (state.currentPage === 'scenes') {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 8) {
        const idx = digit - 1;
        // Shift+1-8: take snapshot A for scene index
        if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const pat = getActivePattern(state);
          const tracks = pat.kit.tracks;
          if (!state.project.scenes[idx]) state.project.scenes[idx] = {};
          if (!state.project.scenes[idx].tracks) {
            state.project.scenes[idx].tracks = Array.from({ length: 8 }, () => ({}));
          }
          tracks.forEach((t, ti) => {
            state.project.scenes[idx].tracks[ti] = {
              cutoff: t.cutoff, decay: t.decay, delaySend: t.delaySend,
              pitch: t.pitch, volume: t.volume,
            };
          });
          // Also sync top-level scenes array
          if (state.scenes[idx]) {
            state.scenes[idx].tracks = state.project.scenes[idx].tracks.map(t => ({ ...t }));
          }
          scheduleSave();
          renderPage();
          showToast(`Snapshot → Scene ${String.fromCharCode(65 + idx)}`);
          return;
        }
        // Ctrl+1-8: recall scene (set as A, crossfader to 0)
        if (e.ctrlKey && !e.shiftKey && !e.metaKey) {
          e.preventDefault();
          emit('state:change', { path: 'scene_recall', value: { idx } });
          showToast(`Recall Scene ${String.fromCharCode(65 + idx)}`);
          return;
        }
      }
    }
  });

  // Tab / Shift+Tab: cycle through pages
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    if (e.target.matches('input, select, textarea')) return;
    e.preventDefault();
    const PAGE_ORDER = ['pattern', 'piano-roll', 'sound', 'mixer', 'fx', 'scenes', 'banks', 'arranger', 'settings'];
    const cur = PAGE_ORDER.indexOf(state.currentPage);
    const next = e.shiftKey
      ? (cur - 1 + PAGE_ORDER.length) % PAGE_ORDER.length
      : (cur + 1) % PAGE_ORDER.length;
    emit('page:set', { page: PAGE_ORDER[next] });
  });

  // Record quantize selector — inject next to record button if not already present
  const recQuantizeSel = document.getElementById('rec-quantize') ?? (() => {
    const sel = document.createElement('select');
    sel.id = 'rec-quantize';
    sel.className = 't-select';
    sel.title = 'Record quantize';
    [
      { label: 'Free', value: 1 },
      { label: '1/16', value: 1 },
      { label: '1/8',  value: 2 },
      { label: '1/4',  value: 4 },
    ].forEach(({ label, value }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      sel.append(opt);
    });
    sel.style.cssText = 'font-size:0.5rem;width:100%;margin-bottom:3px';
    const bpmEditEl = document.getElementById('bpm-edit');
    if (bpmEditEl) {
      bpmEditEl.insertBefore(sel, bpmEditEl.firstChild);
    } else {
      document.querySelector('.transport-buttons')?.append(sel);
    }
    return sel;
  })();
  recQuantizeSel.value = state.recQuantize ?? 1;
  recQuantizeSel.addEventListener('change', e => {
    state.recQuantize = Number(e.target.value);
  });

  // Export button — inject into transport area if not already present
  const exportBtn = document.getElementById('btn-export') ?? (() => {
    const b = document.createElement('button');
    b.id = 'btn-export';
    b.className = 't-btn';
    b.textContent = 'Exp';
    b.title = 'Export 8s audio (WebM) [Ctrl+E]';
    b.style.display = 'none'; // hidden; trigger via Ctrl+E keyboard shortcut
    document.body.append(b);
    return b;
  })();
  exportBtn.addEventListener('click', () => {
    if (state.engine) {
      showToast('Recording 8s…', 8500);
      exportAudio(state.engine);
    }
  });

  // Panic button — all notes off
  const panicBtn = document.getElementById('btn-panic') ?? (() => {
    const b = document.createElement('button');
    b.id = 'btn-panic';
    b.className = 't-btn t-btn--panic';
    b.textContent = '!';
    b.title = 'Panic — all notes off [key 9]';
    b.style.display = 'none'; // hidden; trigger via keyboard key 9
    document.body.append(b);
    return b;
  })();
  panicBtn.addEventListener('click', () => {
    if (state.engine?.panic) state.engine.panic();
    else if (state.engine?.stopAllNotes) state.engine.stopAllNotes();
    showToast('Panic!', 800);
  });
}

// ─────────────────────────────────────────────
// GLOBAL MACROS
// ─────────────────────────────────────────────

const MACRO_PARAMS = ['cutoff', 'reverb', 'swing', 'volume'];

function applyMacro(i) {
  const macro = state.macros[i];
  if (!macro || !macro.param) return;
  const v = macro.value;

  switch (macro.param) {
    case 'cutoff': {
      // Apply to all tracks in active pattern
      const pattern = getActivePattern(state);
      for (const track of pattern.kit.tracks) {
        track.cutoff = v * 8000; // map 0–1 to 0–8000 Hz
      }
      break;
    }
    case 'reverb': {
      state.reverbMix = v;
      if (state.engine?.setReverbMix) state.engine.setReverbMix(v);
      break;
    }
    case 'swing': {
      state.swing = v;
      if (state.engine?.setSwing) state.engine.setSwing(v);
      break;
    }
    case 'volume': {
      state.masterLevel = v;
      if (state.engine?.setMasterLevel) state.engine.setMasterLevel(v);
      if (el.masterVolume) el.masterVolume.value = v;
      break;
    }
  }

  scheduleSave();
}

function initMacros() {
  // Ensure macros array is initialised (backwards compat with saved state)
  if (!Array.isArray(state.macros) || state.macros.length < 4) {
    state.macros = [
      { name: 'Macro 1', param: null, min: 0, max: 1, value: 0.5 },
      { name: 'Macro 2', param: null, min: 0, max: 1, value: 0.5 },
      { name: 'Macro 3', param: null, min: 0, max: 1, value: 0.5 },
      { name: 'Macro 4', param: null, min: 0, max: 1, value: 0.5 },
    ];
  }

  const leftCol = document.querySelector('aside.left-col');
  if (!leftCol) return;

  const wrap = document.createElement('div');
  wrap.className = 'macro-controls';

  const collapsed = state.macrosCollapsed ?? true;
  wrap.innerHTML = `<div class="macro-label-row macro-label-toggle">MACROS <span class="macro-caret">${collapsed ? '▶' : '▼'}</span></div>`;
  if (collapsed) wrap.classList.add('macro-collapsed');

  wrap.querySelector('.macro-label-toggle').addEventListener('click', () => {
    const isNowCollapsed = !wrap.classList.contains('macro-collapsed');
    wrap.classList.toggle('macro-collapsed', isNowCollapsed);
    wrap.querySelector('.macro-caret').textContent = isNowCollapsed ? '▶' : '▼';
    state.macrosCollapsed = isNowCollapsed;
    saveState(state);
  });

  state.macros.forEach((macro, i) => {
    const col = document.createElement('div');
    col.className = 'macro-col';
    col.dataset.macroIndex = i;

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'macro-slider-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'macro-slider';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = String(macro.value);
    slider.title = macro.name;
    slider.dataset.macroIndex = i;

    slider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      state.macros[i].value = v;
      applyMacro(i);
    });

    sliderWrap.appendChild(slider);

    const nameBtn = document.createElement('div');
    nameBtn.className = 'macro-name';
    nameBtn.textContent = macro.name;
    nameBtn.title = 'Click to map; double-click to rename';

    // Single click → show target param picker
    nameBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Remove any existing popup
      document.querySelectorAll('.macro-popup').forEach(p => p.remove());

      const popup = document.createElement('div');
      popup.className = 'macro-popup';

      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">— none —</option>` +
        MACRO_PARAMS.map(p => `<option value="${p}"${macro.param === p ? ' selected' : ''}>${p}</option>`).join('');

      sel.addEventListener('change', ev => {
        state.macros[i].param = ev.target.value || null;
        popup.remove();
        applyMacro(i);
        saveState(state);
      });

      popup.appendChild(sel);

      // Position near the name button
      const rect = nameBtn.getBoundingClientRect();
      popup.style.top  = (rect.bottom + window.scrollY + 2) + 'px';
      popup.style.left = (rect.left  + window.scrollX)      + 'px';
      document.body.appendChild(popup);

      // Close on outside click
      const dismiss = ev => {
        if (!popup.contains(ev.target) && ev.target !== nameBtn) {
          popup.remove();
          document.removeEventListener('click', dismiss, true);
        }
      };
      document.addEventListener('click', dismiss, true);
      sel.focus();
    });

    // Double-click → rename inline
    nameBtn.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'macro-name-input';
      input.value = macro.name;
      input.maxLength = 12;

      const commit = () => {
        const newName = input.value.trim() || macro.name;
        state.macros[i].name = newName;
        nameBtn.textContent = newName;
        slider.title = newName;
        input.replaceWith(nameBtn);
        saveState(state);
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') commit();
        if (ev.key === 'Escape') { input.value = macro.name; commit(); }
        ev.stopPropagation();
      });

      nameBtn.replaceWith(input);
      input.focus();
      input.select();
    });

    col.appendChild(sliderWrap);
    col.appendChild(nameBtn);
    wrap.appendChild(col);
  });

  // Macros removed from left-col to keep it uncluttered
  // leftCol.appendChild(wrap);
}

// ─────────────────────────────────────────────
// SWIPE PAGE NAVIGATION
// ─────────────────────────────────────────────
function setupSwipe() {
  const PAGE_ORDER = ['pattern', 'piano-roll', 'sound', 'mixer', 'fx', 'arranger', 'scenes', 'banks', 'settings'];
  const content = document.getElementById('main-content') ?? document.querySelector('.page-content') ?? document.querySelector('main');
  if (!content) return;

  let touchStartX = 0, touchStartY = 0;
  content.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  content.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      const curPage = state.currentPage ?? 'pattern';
      const idx = PAGE_ORDER.indexOf(curPage);
      if (dx < 0 && idx < PAGE_ORDER.length - 1) {
        emit('page:set', { page: PAGE_ORDER[idx + 1] });
      } else if (dx > 0 && idx > 0) {
        emit('page:set', { page: PAGE_ORDER[idx - 1] });
      }
    }
  }, { passive: true });
}

// ─────────────────────────────────────────────
// DOUBLE-TAP ZOOM
// ─────────────────────────────────────────────
function setupDoubleTap() {
  const content = document.getElementById('main-content') ?? document.querySelector('.page-content');
  if (!content) return;
  let lastTap = 0;
  content.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTap < 300) {
      // Double tap
      content.classList.toggle('mobile-zoom');
      e.preventDefault();
    }
    lastTap = now;
  });
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
function boot() {
  bindUI();
  initKeyboard(state, emit);
  // Apply saved colour theme
  if (state.theme && state.theme !== 'default') {
    document.documentElement.dataset.theme = state.theme;
  }
  // Restore custom accent colors if set
  if (state.customAccent) {
    document.documentElement.style.setProperty('--accent', state.customAccent);
  }
  if (state.customScreenText) {
    document.documentElement.style.setProperty('--screen-text', state.customScreenText);
  }
  renderAll();
  if (el.masterVolume) el.masterVolume.value = state.masterLevel;
  initMacros();
  initStudio();
  initBackground();
  initCables();
  setupSwipe();
  setupDoubleTap();
}

// Global tooltip/help system — shows title attribute in kbd-help-strip
const helpEl = document.getElementById('kbd-help-text');
if (helpEl) {
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[title]');
    const text = target?.title || '';
    if (text && text.length > 2) {
      helpEl.textContent = text;
      helpEl.classList.add('visible');
    }
  });
  document.addEventListener('mouseout', (e) => {
    // Only clear if leaving element with title (not entering child)
    const target = e.target.closest('[title]');
    if (target && !target.contains(e.relatedTarget)) {
      helpEl.classList.remove('visible');
    }
  });
}

boot();
