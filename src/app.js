const STEP_COUNT = 16;
const TRACK_COUNT = 8;
const PAGES = ["sequencer", "mixer", "effects", "channels", "midi", "io", "tempo", "tracks", "pianoroll"];
const NOTE_ROWS = [
  { label: "C5", midi: 72 },
  { label: "B4", midi: 71 },
  { label: "A4", midi: 69 },
  { label: "G4", midi: 67 },
  { label: "F4", midi: 65 },
  { label: "E4", midi: 64 },
  { label: "D4", midi: 62 },
  { label: "C4", midi: 60 }
];

const KEYBOARD_LAYOUT = [
  [
    { key: "F1", label: "Sequencer" },
    { key: "F2", label: "Mixer" },
    { key: "F3", label: "Effects" },
    { key: "F4", label: "Channels" },
    { key: "F5", label: "MIDI" },
    { key: "F6", label: "I/O" },
    { key: "F7", label: "Tempo" },
    { key: "F8", label: "Tracks" },
    { key: "F9", label: "Roll" }
  ],
  [
    { key: "A", label: "Audio" },
    { key: "Space", label: "Play", wide: true },
    { key: "Shift+R", label: "Random", wide: true },
    { key: "Del", label: "Clear" },
    { key: "Shift+M", label: "Record", wide: true },
    { key: "[", label: "Track -" },
    { key: "]", label: "Track +" }
  ],
  [
    { key: "1", label: "Step 1" },
    { key: "2", label: "Step 2" },
    { key: "3", label: "Step 3" },
    { key: "4", label: "Step 4" },
    { key: "5", label: "Step 5" },
    { key: "6", label: "Step 6" },
    { key: "7", label: "Step 7" },
    { key: "8", label: "Step 8" }
  ],
  [
    { key: "Q", label: "Step 9" },
    { key: "W", label: "Step 10" },
    { key: "E", label: "Step 11" },
    { key: "R", label: "Step 12" },
    { key: "T", label: "Step 13" },
    { key: "Y", label: "Step 14" },
    { key: "U", label: "Step 15" },
    { key: "I", label: "Step 16" }
  ],
  [
    { key: "Z", label: "Note C4" },
    { key: "X", label: "Note D4" },
    { key: "C", label: "Note E4" },
    { key: "V", label: "Note F4" },
    { key: "B", label: "Note G4" },
    { key: "N", label: "Note A4" },
    { key: "M", label: "Note B4" },
    { key: ",", label: "Note C5" },
    { key: ".", label: "Note D5" }
  ]
];

const STEP_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI"];
const PAGE_KEYS = {
  F1: "sequencer",
  F2: "mixer",
  F3: "effects",
  F4: "channels",
  F5: "midi",
  F6: "io",
  F7: "tempo",
  F8: "tracks",
  F9: "pianoroll"
};
const NOTE_KEYS = {
  KeyZ: 60,
  KeyX: 62,
  KeyC: 64,
  KeyV: 65,
  KeyB: 67,
  KeyN: 69,
  KeyM: 71,
  Comma: 72,
  Period: 74
};

const appState = {
  audioContext: null,
  engine: null,
  isPlaying: false,
  currentStep: -1,
  currentPage: "sequencer",
  selectedTrackIndex: 0,
  patternLength: 16,
  bpm: 122,
  swing: 0.12,
  crossfader: 0,
  micRecorder: null,
  micChunks: [],
  activeKeyboardKey: null,
  tracks: Array.from({ length: TRACK_COUNT }, (_, index) => ({
    id: index + 1,
    name: `Track ${index + 1}`,
    machine: index < 4 ? "tone" : "noise",
    volume: 0.72,
    pan: index % 2 === 0 ? -0.15 : 0.15,
    pitch: 48 + index * 2,
    decay: 0.24 + index * 0.03,
    cutoff: 3200 - index * 180,
    resonance: 1.8,
    drive: 0.18,
    delaySend: 0.24,
    reverbSend: 0.18,
    midiChannel: index + 1,
    inputMode: index < 2 ? "external" : "internal",
    mute: false,
    solo: false,
    sceneA: { cutoff: 2200, decay: 0.22, delaySend: 0.1 },
    sceneB: { cutoff: 6400, decay: 0.8, delaySend: 0.45 },
    sampleBuffer: null,
    steps: Array.from({ length: STEP_COUNT }, (_, stepIndex) => ({
      active: (stepIndex + index) % 5 === 0,
      accent: stepIndex % 8 === 4,
      note: NOTE_ROWS[(stepIndex + index) % NOTE_ROWS.length].midi
    }))
  }))
};

const elements = {};

const STORAGE_KEY = "confusynth-v1";

function saveState() {
  try {
    const data = {
      bpm: appState.bpm,
      swing: appState.swing,
      patternLength: appState.patternLength,
      crossfader: appState.crossfader,
      tracks: appState.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        machine: t.machine,
        volume: t.volume,
        pan: t.pan,
        pitch: t.pitch,
        decay: t.decay,
        cutoff: t.cutoff,
        resonance: t.resonance,
        drive: t.drive,
        delaySend: t.delaySend,
        reverbSend: t.reverbSend,
        midiChannel: t.midiChannel,
        inputMode: t.inputMode,
        mute: t.mute,
        solo: t.solo,
        steps: t.steps.map((s) => ({ active: s.active, accent: s.accent, note: s.note }))
      }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.bpm != null) appState.bpm = data.bpm;
    if (data.swing != null) appState.swing = data.swing;
    if (data.patternLength != null) appState.patternLength = data.patternLength;
    if (data.crossfader != null) appState.crossfader = data.crossfader;
    if (data.tracks) {
      data.tracks.forEach((saved, i) => {
        const t = appState.tracks[i];
        if (!t) return;
        const keys = ["name", "machine", "volume", "pan", "pitch", "decay", "cutoff", "resonance", "drive", "delaySend", "reverbSend", "midiChannel", "inputMode", "mute", "solo"];
        keys.forEach((k) => { if (saved[k] != null) t[k] = saved[k]; });
        if (saved.steps) {
          saved.steps.forEach((s, si) => {
            if (t.steps[si]) Object.assign(t.steps[si], s);
          });
        }
      });
    }
    // Sync sliders to restored state
    elements["bpm"].value = appState.bpm;
    elements["swing"].value = appState.swing;
    elements["pattern-length"].value = appState.patternLength;
    elements["crossfader"].value = appState.crossfader;
  } catch (_) {}
}

function euclidean(beats, steps) {
  // Bresenham-based: maximally even distribution, first beat at step 0
  if (beats <= 0) return Array(steps).fill(false);
  return Array.from({ length: steps }, (_, i) =>
    Math.floor(i * beats / steps) !== Math.floor((i - 1) * beats / steps)
  );
}

function renderPlayhead() {
  elements["status-pill"].textContent = appState.isPlaying
    ? `Running ${appState.currentStep + 1}`
    : "Idle";
  elements["step-grid"].querySelectorAll(".step-button").forEach((btn, i) => {
    btn.classList.toggle("playhead", i === appState.currentStep);
  });
  if (appState.currentPage === "pianoroll") {
    elements["piano-roll"].querySelectorAll(".piano-cell").forEach((cell, i) => {
      cell.classList.toggle("playhead", i % appState.patternLength === appState.currentStep);
    });
  }
}

class AudioEngine {
  constructor(context) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.88;

    this.delay = context.createDelay(1.4);
    this.delay.delayTime.value = 0.28;
    this.delayFeedback = context.createGain();
    this.delayFeedback.gain.value = 0.38;
    this.delayWet = context.createGain();
    this.delayWet.gain.value = 0.25;

    this.reverb = context.createConvolver();
    this.reverb.buffer = this.createImpulseResponse();
    this.reverbWet = context.createGain();
    this.reverbWet.gain.value = 0.25;

    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);

    this.master.connect(context.destination);
    this.delayWet.connect(this.master);
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.master);
  }

  createImpulseResponse() {
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * 1.4);
    const buffer = this.context.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const channelData = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const decay = Math.pow(1 - index / length, 2.2);
        channelData[index] = (Math.random() * 2 - 1) * decay;
      }
    }
    return buffer;
  }

  triggerTrack(track, when, options = {}) {
    const accent = options.accent || false;
    const note = options.note ?? track.pitch;
    const loudness = (accent ? 1.25 : 1) * track.volume;
    const output = this.context.createGain();
    output.gain.value = loudness;

    const panner = this.context.createStereoPanner();
    panner.pan.value = track.pan;

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.interpolateScene(track.sceneA.cutoff, track.sceneB.cutoff);
    filter.Q.value = track.resonance;

    const saturator = this.context.createWaveShaper();
    saturator.curve = this.makeDriveCurve(track.drive);
    saturator.oversample = "2x";

    output.connect(panner);
    panner.connect(filter);
    filter.connect(saturator);
    saturator.connect(this.master);

    const delaySend = this.context.createGain();
    delaySend.gain.value = this.interpolateScene(track.sceneA.delaySend, track.sceneB.delaySend);
    saturator.connect(delaySend);
    delaySend.connect(this.delay);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = track.reverbSend;
    saturator.connect(reverbSend);
    reverbSend.connect(this.reverb);

    if (track.machine === "sample" && track.sampleBuffer) {
      const source = this.context.createBufferSource();
      source.buffer = track.sampleBuffer;
      source.playbackRate.value = Math.pow(2, ((note || 48) - 48) / 12);
      source.connect(output);
      source.start(when, 0, Math.min(track.decay + 0.1, track.sampleBuffer.duration));
      return;
    }

    if (track.machine === "noise") {
      const source = this.context.createBufferSource();
      source.buffer = this.createNoiseBuffer();
      source.loop = true;
      source.connect(output);
      output.gain.setValueAtTime(0.0001, when);
      output.gain.exponentialRampToValueAtTime(loudness, when + 0.01);
      output.gain.exponentialRampToValueAtTime(0.0001, when + this.interpolateScene(track.sceneA.decay, track.sceneB.decay));
      source.start(when);
      source.stop(when + track.decay + 0.08);
      return;
    }

    const oscillator = this.context.createOscillator();
    oscillator.type = accent ? "sawtooth" : "triangle";
    oscillator.frequency.value = 440 * Math.pow(2, ((note || 69) - 69) / 12);
    oscillator.connect(output);
    output.gain.setValueAtTime(0.0001, when);
    output.gain.exponentialRampToValueAtTime(loudness, when + 0.01);
    output.gain.exponentialRampToValueAtTime(0.0001, when + this.interpolateScene(track.sceneA.decay, track.sceneB.decay));
    oscillator.start(when);
    oscillator.stop(when + track.decay + 0.08);
  }

  interpolateScene(a, b) {
    return a + (b - a) * appState.crossfader;
  }

  makeDriveCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const drive = 1 + amount * 25;
    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(drive * x);
    }
    return curve;
  }

  createNoiseBuffer() {
    const length = this.context.sampleRate * 0.4;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

function $(id) {
  return document.getElementById(id);
}

function setupElements() {
  [
    "audio-toggle",
    "play-toggle",
    "randomize",
    "clear-pattern",
    "bpm",
    "bpm-value",
    "swing",
    "swing-value",
    "pattern-length",
    "pattern-length-value",
    "crossfader",
    "crossfader-value",
    "status-pill",
    "chapter-nav",
    "track-list",
    "step-grid",
    "selected-track-label",
    "machine-label",
    "machine-type",
    "pitch",
    "pitch-value",
    "decay",
    "decay-value",
    "cutoff",
    "cutoff-value",
    "resonance",
    "resonance-value",
    "drive",
    "drive-value",
    "delay-send",
    "delay-send-value",
    "reverb-send",
    "reverb-send-value",
    "volume",
    "volume-value",
    "pan",
    "pan-value",
    "sample-file",
    "mic-toggle",
    "recording-status",
    "assistant-provider",
    "assistant-input",
    "assistant-send",
    "assistant-output",
    "mixer-grid",
    "fx-grid",
    "channels-grid",
    "midi-grid",
    "io-grid",
    "tempo-stats",
    "performance-stats",
    "screen-track-grid",
    "piano-roll",
    "keyboard-map",
    "keyboard-hint",
    "euclid-beats",
    "euclid-apply"
  ].forEach((id) => {
    elements[id] = $(id);
  });
}

function formatValue(id, value) {
  if (id === "pan" || id === "swing" || id === "crossfader") return Number(value).toFixed(2);
  if (id === "decay" || id === "drive" || id === "delay-send" || id === "reverb-send" || id === "volume") return Number(value).toFixed(2);
  return Number(value).toFixed(value < 10 ? 1 : 0);
}

function renderChapterNav() {
  document.querySelectorAll(".chapter-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === appState.currentPage);
  });
  document.querySelectorAll(".screen-page").forEach((page) => {
    page.classList.toggle("active", page.dataset.page === appState.currentPage);
  });
}

function renderTracks() {
  elements["track-list"].innerHTML = "";
  appState.tracks.forEach((track, index) => {
    const card = document.createElement("button");
    const classes = ["track-card"];
    if (index === appState.selectedTrackIndex) classes.push("active");
    if (track.mute) classes.push("muted");
    if (track.solo) classes.push("soloed");
    card.className = classes.join(" ");
    const muteLabel = track.mute ? "M" : "·";
    const soloLabel = track.solo ? "S" : "·";
    card.innerHTML = `<h3>T${track.id} · ${track.machine}</h3><p>vol ${track.volume.toFixed(2)} · pan ${track.pan.toFixed(2)}</p><p class="track-ms">${muteLabel} ${soloLabel}</p>`;
    card.title = "Click to select · Shift+click to mute · Alt+click to solo";
    card.addEventListener("click", (event) => {
      if (event.shiftKey) {
        track.mute = !track.mute;
      } else if (event.altKey) {
        const wasSolo = track.solo;
        appState.tracks.forEach((t) => { t.solo = false; });
        track.solo = !wasSolo;
      } else {
        appState.selectedTrackIndex = index;
        syncControlsFromTrack();
      }
      renderAll();
    });
    elements["track-list"].append(card);
  });
}

function renderSteps() {
  const track = appState.tracks[appState.selectedTrackIndex];
  elements["step-grid"].innerHTML = "";
  track.steps.slice(0, appState.patternLength).forEach((step, index) => {
    const button = document.createElement("button");
    button.className = "step-button";
    if (step.active) button.classList.add("active");
    if (step.accent) button.classList.add("accent");
    if (index === appState.currentStep) button.classList.add("playhead");
    button.textContent = String(index + 1).padStart(2, "0");
    button.addEventListener("click", (event) => {
      toggleStep(index, event.shiftKey);
    });
    elements["step-grid"].append(button);
  });
}

function renderMixerPage() {
  elements["mixer-grid"].innerHTML = "";
  appState.tracks.forEach((track, index) => {
    const strip = document.createElement("div");
    strip.className = "mixer-strip";
    strip.innerHTML = `
      <strong>T${track.id}</strong>
      <span>Vol ${track.volume.toFixed(2)}</span>
      <span>Pan ${track.pan.toFixed(2)}</span>
      <div class="mixer-meter" style="--level:${Math.max(12, track.volume * 100).toFixed(0)}%"></div>
    `;
    if (index === appState.selectedTrackIndex) strip.style.outline = "1px solid rgba(240, 198, 64, 0.5)";
    elements["mixer-grid"].append(strip);
  });
}

function renderStatusCards(containerId, cards) {
  const node = elements[containerId];
  node.innerHTML = "";
  cards.forEach(({ title, lines }) => {
    const card = document.createElement("div");
    card.className = "status-card";
    card.innerHTML = `<strong>${title}</strong>${lines.map((line) => `<span>${line}</span>`).join("")}`;
    node.append(card);
  });
}

function renderPages() {
  const track = appState.tracks[appState.selectedTrackIndex];
  renderMixerPage();
  renderStatusCards("fx-grid", [
    { title: "Master Delay", lines: [`send ${track.delaySend.toFixed(2)}`, `feedback 0.38`, `scene ${appState.crossfader.toFixed(2)}`] },
    { title: "Master Reverb", lines: [`send ${track.reverbSend.toFixed(2)}`, "dark plate", `drive ${track.drive.toFixed(2)}`] },
    { title: "Filter", lines: [`cutoff ${Math.round(track.cutoff)}`, `Q ${track.resonance.toFixed(1)}`, `scene A/B morph`] },
    { title: "Performance", lines: ["crossfade scenes", "sample or synth", "resample ready"] }
  ]);
  renderStatusCards("channels-grid", appState.tracks.map((item) => ({
    title: `Track ${item.id}`,
    lines: [`${item.machine} machine`, `${item.sampleBuffer ? "sample loaded" : "internal source"}`, `input ${item.inputMode}`]
  })));
  renderStatusCards("midi-grid", appState.tracks.map((item) => ({
    title: `Track ${item.id}`,
    lines: [`channel ${item.midiChannel}`, "clock follow", "cc lane reserved"]
  })));
  renderStatusCards("io-grid", [
    { title: "Main Out", lines: ["stereo", "master + fx"] },
    { title: "Cue Bus", lines: ["planned", "browser mirror"] },
    { title: "Input A/B", lines: ["mic or line", "record to track"] },
    { title: "USB Host", lines: ["browser now", "tauri later"] }
  ]);
  renderStatusCards("tempo-stats", [
    { title: "BPM", lines: [String(appState.bpm), `swing ${appState.swing.toFixed(2)}`, `length ${appState.patternLength}`] },
    { title: "Transport", lines: [appState.isPlaying ? "running" : "stopped", `step ${Math.max(appState.currentStep + 1, 1)}`, "internal clock"] }
  ]);
  renderStatusCards("performance-stats", [
    { title: "Scenes", lines: [`crossfader ${appState.crossfader.toFixed(2)}`, "A darker", "B brighter"] },
    { title: "Workflow", lines: ["sample > sequence", "mix > fx > resample", "keyboard first"] }
  ]);

  elements["screen-track-grid"].innerHTML = "";
  appState.tracks.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "screen-track-card";
    card.innerHTML = `<strong>T${item.id} ${item.machine}</strong><span>pitch ${item.pitch}</span><span>trigs ${item.steps.filter((step) => step.active).length}</span>`;
    if (index === appState.selectedTrackIndex) card.style.outline = "1px solid rgba(240, 198, 64, 0.5)";
    elements["screen-track-grid"].append(card);
  });
}

function renderPianoRoll() {
  const track = appState.tracks[appState.selectedTrackIndex];
  elements["piano-roll"].innerHTML = "";
  NOTE_ROWS.forEach((noteRow) => {
    const label = document.createElement("div");
    label.className = "piano-label";
    label.textContent = noteRow.label;
    elements["piano-roll"].append(label);

    track.steps.slice(0, appState.patternLength).forEach((step, index) => {
      const cell = document.createElement("button");
      cell.className = "piano-cell";
      if (step.active && step.note === noteRow.midi) cell.classList.add("active");
      if (index === appState.currentStep) cell.classList.add("playhead");
      cell.addEventListener("click", () => {
        if (step.active && step.note === noteRow.midi) {
          step.active = false;
        } else {
          step.active = true;
          step.note = noteRow.midi;
        }
        renderAll();
      });
      elements["piano-roll"].append(cell);
    });
  });
}

function syncControlsFromTrack() {
  const track = appState.tracks[appState.selectedTrackIndex];
  elements["selected-track-label"].textContent = `${track.name} · page ${appState.currentPage}`;
  elements["machine-label"].textContent = `${track.machine.toUpperCase()} · CH ${track.midiChannel}`;

  const fields = {
    "machine-type": track.machine,
    pitch: track.pitch,
    decay: track.decay,
    cutoff: track.cutoff,
    resonance: track.resonance,
    drive: track.drive,
    "delay-send": track.delaySend,
    "reverb-send": track.reverbSend,
    volume: track.volume,
    pan: track.pan
  };

  Object.entries(fields).forEach(([id, value]) => {
    elements[id].value = value;
    const output = elements[`${id}-value`];
    if (output) output.textContent = formatValue(id, value);
  });
}

function renderKeyboardMap() {
  elements["keyboard-map"].innerHTML = "";
  KEYBOARD_LAYOUT.forEach((row) => {
    const rowNode = document.createElement("div");
    rowNode.className = "keyboard-row";
    row.forEach((entry) => {
      const keyNode = document.createElement("div");
      keyNode.className = `keyboard-key ${entry.wide ? "wide" : ""}`;
      if (appState.activeKeyboardKey === entry.key) keyNode.classList.add("active");
      keyNode.innerHTML = `<strong>${entry.key}</strong><span>${entry.label}</span>`;
      rowNode.append(keyNode);
    });
    elements["keyboard-map"].append(rowNode);
  });
}

function renderAll() {
  saveState();
  elements["bpm-value"].textContent = String(appState.bpm);
  elements["swing-value"].textContent = appState.swing.toFixed(2);
  elements["pattern-length-value"].textContent = String(appState.patternLength);
  elements["crossfader-value"].textContent = appState.crossfader.toFixed(2);
  elements["status-pill"].textContent = appState.isPlaying ? `Running ${appState.currentStep + 1 || 1}` : "Idle";
  elements["keyboard-hint"].textContent = `${appState.currentPage.toUpperCase()} • [ ] track • Shift+step = accent`;
  syncControlsFromTrack();
  renderChapterNav();
  renderTracks();
  renderSteps();
  renderPages();
  renderPianoRoll();
  renderKeyboardMap();
}

async function ensureAudio() {
  if (appState.audioContext) {
    if (appState.audioContext.state === "suspended") await appState.audioContext.resume();
    return;
  }
  const context = new AudioContext();
  appState.audioContext = context;
  appState.engine = new AudioEngine(context);
}

function toggleStep(index, accentOnly = false) {
  const step = appState.tracks[appState.selectedTrackIndex].steps[index];
  if (!step) return;
  if (accentOnly) {
    step.accent = !step.accent;
  } else {
    step.active = !step.active;
  }
  renderAll();
}

function setPage(page) {
  if (!PAGES.includes(page)) return;
  appState.currentPage = page;
  renderAll();
}

function cycleTrack(direction) {
  appState.selectedTrackIndex = (appState.selectedTrackIndex + direction + TRACK_COUNT) % TRACK_COUNT;
  renderAll();
}

async function previewMidiNote(note) {
  await ensureAudio();
  const track = appState.tracks[appState.selectedTrackIndex];
  appState.engine.triggerTrack(track, appState.audioContext.currentTime, { note, accent: false });
}

function scheduleLoop() {
  let nextStepTime = appState.audioContext.currentTime + 0.05;
  let stepIndex = 0;

  function tick() {
    if (!appState.isPlaying) return;

    const secondsPerStep = (60 / appState.bpm) / 4;
    while (nextStepTime < appState.audioContext.currentTime + 0.12) {
      appState.currentStep = stepIndex;
      const isSoloing = appState.tracks.some((t) => t.solo);
      appState.tracks.forEach((track) => {
        if (track.mute || (isSoloing && !track.solo)) return;
        const step = track.steps[stepIndex];
        if (step?.active) {
          appState.engine.triggerTrack(track, nextStepTime, { accent: step.accent, note: step.note });
        }
      });
      stepIndex = (stepIndex + 1) % appState.patternLength;
      // Correct swing: odd steps (off-beats) come late, even steps come early to compensate
      const swingOffset = (stepIndex % 2 !== 0 ? 1 : -1) * appState.swing * secondsPerStep;
      nextStepTime += secondsPerStep + swingOffset;
    }
    renderPlayhead();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

async function togglePlay() {
  await ensureAudio();
  appState.isPlaying = !appState.isPlaying;
  if (!appState.isPlaying) appState.currentStep = -1;
  elements["play-toggle"].textContent = appState.isPlaying ? "Stop" : "Play";
  renderAll();
  if (appState.isPlaying) scheduleLoop();
}

function randomizePattern() {
  appState.tracks.forEach((track, trackIndex) => {
    track.steps.forEach((step, stepIndex) => {
      step.active = Math.random() > 0.7 - trackIndex * 0.025;
      step.accent = step.active && (stepIndex + trackIndex) % 7 === 0;
      step.note = NOTE_ROWS[(stepIndex + trackIndex + Math.floor(Math.random() * 2)) % NOTE_ROWS.length].midi;
    });
  });
  renderAll();
}

function clearPattern() {
  appState.tracks.forEach((track) => {
    track.steps.forEach((step) => {
      step.active = false;
      step.accent = false;
    });
  });
  renderAll();
}

function bindGlobalControls() {
  elements["audio-toggle"].addEventListener("click", async () => {
    await ensureAudio();
    elements["audio-toggle"].textContent = "Ready";
  });

  elements["play-toggle"].addEventListener("click", togglePlay);
  elements["randomize"].addEventListener("click", randomizePattern);
  elements["clear-pattern"].addEventListener("click", clearPattern);

  ["bpm", "swing", "pattern-length", "crossfader"].forEach((id) => {
    elements[id].addEventListener("input", () => {
      const value = Number(elements[id].value);
      if (id === "bpm") appState.bpm = value;
      if (id === "swing") appState.swing = value;
      if (id === "pattern-length") appState.patternLength = value;
      if (id === "crossfader") appState.crossfader = value;
      renderAll();
    });
  });

  document.querySelectorAll(".chapter-button").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  elements["euclid-apply"].addEventListener("click", () => {
    const beats = Math.max(1, Math.min(appState.patternLength, parseInt(elements["euclid-beats"].value) || 4));
    const track = appState.tracks[appState.selectedTrackIndex];
    const pattern = euclidean(beats, appState.patternLength);
    track.steps.forEach((step, i) => { step.active = pattern[i] ?? false; });
    renderAll();
  });
}

function bindTrackControls() {
  const fields = ["machine-type", "pitch", "decay", "cutoff", "resonance", "drive", "delay-send", "reverb-send", "volume", "pan"];
  fields.forEach((id) => {
    elements[id].addEventListener("input", () => {
      const track = appState.tracks[appState.selectedTrackIndex];
      const key = id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      track[key] = id === "machine-type" ? elements[id].value : Number(elements[id].value);
      renderAll();
    });
  });
}

async function decodeAudioFile(file) {
  await ensureAudio();
  const arrayBuffer = await file.arrayBuffer();
  return appState.audioContext.decodeAudioData(arrayBuffer);
}

function bindSampleRecorder() {
  elements["sample-file"].addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const buffer = await decodeAudioFile(file);
    const track = appState.tracks[appState.selectedTrackIndex];
    track.sampleBuffer = buffer;
    track.machine = "sample";
    elements["recording-status"].textContent = `${file.name} loaded on ${track.name}.`;
    renderAll();
  });

  elements["mic-toggle"].addEventListener("click", async () => {
    await ensureAudio();

    if (appState.micRecorder?.state === "recording") {
      appState.micRecorder.stop();
      elements["mic-toggle"].textContent = "Rec";
      elements["recording-status"].textContent = "Finalizing recording...";
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    appState.micChunks = [];
    const recorder = new MediaRecorder(stream);
    appState.micRecorder = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) appState.micChunks.push(event.data);
    });

    recorder.addEventListener("stop", async () => {
      const blob = new Blob(appState.micChunks, { type: "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await appState.audioContext.decodeAudioData(arrayBuffer.slice(0));
      const track = appState.tracks[appState.selectedTrackIndex];
      track.sampleBuffer = audioBuffer;
      track.machine = "sample";
      elements["recording-status"].textContent = `Mic take assigned to ${track.name}.`;
      stream.getTracks().forEach((trackItem) => trackItem.stop());
      renderAll();
    });

    recorder.start();
    elements["mic-toggle"].textContent = "Stop";
    elements["recording-status"].textContent = "Recording mic input...";
  });
}

function bindAssistant() {
  elements["assistant-send"].addEventListener("click", async () => {
    const provider = elements["assistant-provider"].value;
    const message = elements["assistant-input"].value.trim();
    if (!message) return;
    elements["assistant-output"].textContent = "Thinking...";
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, message })
      });
      const data = await response.json();
      elements["assistant-output"].textContent = data.text || data.error || "No response.";
    } catch (error) {
      elements["assistant-output"].textContent = error.message;
    }
  });
}

function flashKeyboardKey(label) {
  appState.activeKeyboardKey = label;
  renderKeyboardMap();
  window.clearTimeout(flashKeyboardKey.timeoutId);
  flashKeyboardKey.timeoutId = window.setTimeout(() => {
    appState.activeKeyboardKey = null;
    renderKeyboardMap();
  }, 180);
}

function isTextEntryTarget(target) {
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "range" && target.type !== "file") || target instanceof HTMLSelectElement;
}

function bindKeyboard() {
  window.addEventListener("keydown", async (event) => {
    if (isTextEntryTarget(event.target)) return;

    if (PAGE_KEYS[event.key]) {
      event.preventDefault();
      flashKeyboardKey(event.key);
      setPage(PAGE_KEYS[event.key]);
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      flashKeyboardKey("Space");
      await togglePlay();
      return;
    }

    if (event.code === "KeyA") {
      flashKeyboardKey("A");
      await ensureAudio();
      elements["audio-toggle"].textContent = "Ready";
      return;
    }

    if (event.code === "Delete" || event.code === "Backspace") {
      flashKeyboardKey("Del");
      clearPattern();
      return;
    }

    if (event.code === "BracketLeft") {
      flashKeyboardKey("[");
      cycleTrack(-1);
      return;
    }

    if (event.code === "BracketRight") {
      flashKeyboardKey("]");
      cycleTrack(1);
      return;
    }

    if (event.code === "ArrowLeft") {
      event.preventDefault();
      setPage(PAGES[(PAGES.indexOf(appState.currentPage) - 1 + PAGES.length) % PAGES.length]);
      return;
    }

    if (event.code === "ArrowRight") {
      event.preventDefault();
      setPage(PAGES[(PAGES.indexOf(appState.currentPage) + 1) % PAGES.length]);
      return;
    }

    if (event.code === "ArrowUp") {
      event.preventDefault();
      cycleTrack(-1);
      return;
    }

    if (event.code === "ArrowDown") {
      event.preventDefault();
      cycleTrack(1);
      return;
    }

    if (event.code === "KeyM" && event.shiftKey) {
      flashKeyboardKey("Shift+M");
      elements["mic-toggle"].click();
      return;
    }

    if (event.code === "KeyR" && event.shiftKey) {
      flashKeyboardKey("Shift+R");
      randomizePattern();
      return;
    }

    const stepIndex = STEP_KEYS.indexOf(event.code);
    if (stepIndex !== -1) {
      flashKeyboardKey(stepIndex < 8 ? String(stepIndex + 1) : KEYBOARD_LAYOUT[3][stepIndex - 8].key);
      toggleStep(stepIndex, event.shiftKey);
      return;
    }

    if (NOTE_KEYS[event.code]) {
      const display = event.code === "Comma" ? "," : event.code === "Period" ? "." : event.code.replace("Key", "");
      flashKeyboardKey(display);
      await previewMidiNote(NOTE_KEYS[event.code]);
    }
  });
}

async function boot() {
  setupElements();
  loadState();
  bindGlobalControls();
  bindTrackControls();
  bindSampleRecorder();
  bindAssistant();
  bindKeyboard();
  renderAll();
  elements["play-toggle"].textContent = "Play";

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/public/sw.js");
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  }
}

boot();
