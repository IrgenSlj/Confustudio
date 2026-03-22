// CONFUsynth v3 — AudioEngine module
// Extracted and enhanced from app.js

const WAVEFORMS = ["sine", "triangle", "sawtooth", "square"];

// Freeverb comb filter delay times in samples @ 44100 Hz
const COMB_DELAYS_44100 = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
// Freeverb allpass delay times in samples @ 44100 Hz
const ALLPASS_DELAYS_44100 = [556, 441, 341, 225];

// ——————————————————————————————————————————————
// MIDI
// ——————————————————————————————————————————————

export let midiOutputs = [];

export async function initMidi() {
  if (!navigator.requestMIDIAccess) return;
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    midiOutputs = [];
    access.outputs.forEach((output) => midiOutputs.push(output));
    access.onstatechange = () => {
      midiOutputs = [];
      access.outputs.forEach((output) => midiOutputs.push(output));
    };
  } catch (err) {
    console.warn("WebMIDI unavailable:", err);
  }
}

// ——————————————————————————————————————————————
// AUDIO ENGINE
// ——————————————————————————————————————————————

export class AudioEngine {
  constructor(context) {
    this.context = context;

    // Drive curve cache — keyed by quantized amount, avoids per-trigger allocation
    this._driveCurveCache = new Map();

    // Master gain
    this.master = context.createGain();
    this.master.gain.value = 0.82;

    // Sidechain ducking gain — all track buses pass through this before master
    this.sidechainGain = context.createGain();
    this.sidechainGain.gain.value = 1;
    this.sidechainGain.connect(this.master);
    this._sidechainEnabled = false;
    this._sidechainAmount  = 0.8;   // duck depth (0=none, 1=full mute)
    this._sidechainRelease = 200;   // release time in ms
    this._sidechainSourceIndex = 0; // track index that triggers ducking

    // Sub-mix buses — connect before sidechainGain so all paths are ducked together
    this.bus1 = context.createGain(); this.bus1.gain.value = 1;
    this.bus2 = context.createGain(); this.bus2.gain.value = 1;
    this.bus1.connect(this.sidechainGain);
    this.bus2.connect(this.sidechainGain);

    // Master dynamics compressor — inserted between masterGain and masterSaturator
    this.masterCompressor = context.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -18;
    this.masterCompressor.knee.value = 6;
    this.masterCompressor.ratio.value = 4;
    this.masterCompressor.attack.value = 0.003;
    this.masterCompressor.release.value = 0.25;

    // Master drive saturator — inserted between masterCompressor and masterAnalyser
    this.masterSaturator = context.createWaveShaper();
    this.masterSaturator.oversample = "2x";
    // Default: linear passthrough (no drive)
    this.masterSaturator.curve = null;

    // Analyser for oscilloscope (public)
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;

    // Delay line
    this.delay = context.createDelay(1.4);
    this.delay.delayTime.value = 0.28;
    this.delayFeedback = context.createGain();
    this.delayFeedback.gain.value = 0.38;
    this.delayWet = context.createGain();
    this.delayWet.gain.value = 0.28;

    // Freeverb-inspired Schroeder-Moorer reverb (pure Web Audio node graph)
    this.reverbRoomSize = 0.84; // comb feedback gain (0–0.98)
    this.reverbDamping = 0.5;   // lowpass cutoff ratio in comb feedback (0–1)
    this.reverbWet = context.createGain();
    this.reverbWet.gain.value = 0.22;

    // reverbInput is the entry point for tracks; alias this.reverb for back-compat
    this.reverbInput = context.createGain();
    this.reverb = this.reverbInput; // backward compatibility

    this._buildReverbGraph();

    // Per-track active legato source — keyed by track index (or track object identity)
    // Stores { osc, output, stopTime } for the currently ringing oscillator on legato tracks
    this._legatoSources = new Map();

    // Voice polyphony tracking — keyed by track key (index or track object)
    // _activeVoices: count of currently ringing voices per track
    // _voiceQueue:   ordered array of active AudioBufferSourceNode / OscillatorNode per track
    this._activeVoices = new Map();
    this._voiceQueue   = new Map();

    // MIDI output (set externally or via sendMidiNote)
    this.midiOutput = null;
    this._midiClockInterval = null;

    // BPM tracked locally so triggerTrack can compute gate durations for MIDI note-off
    this._bpm = 120;

    // AudioWorklet readiness flags — set true after initWorklets() resolves
    this._workletReady = false;
    this._plaitsReady  = false;
    this._cloudsReady  = false;
    this._ringsReady   = false;

    // Routing
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.master);
    this.reverbWet.connect(this.master);

    // Master limiter — hard brickwall compressor, bypassed by default
    this.masterLimiter = context.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -3;
    this.masterLimiter.knee.value = 0;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.1;

    // Master EQ (3-band) — inserted between saturator/limiter and analyser
    this.masterEQLow = context.createBiquadFilter();
    this.masterEQLow.type = 'lowshelf';
    this.masterEQLow.frequency.value = 200;
    this.masterEQLow.gain.value = 0;

    this.masterEQMid = context.createBiquadFilter();
    this.masterEQMid.type = 'peaking';
    this.masterEQMid.frequency.value = 1000;
    this.masterEQMid.Q.value = 1.0;
    this.masterEQMid.gain.value = 0;

    this.masterEQHigh = context.createBiquadFilter();
    this.masterEQHigh.type = 'highshelf';
    this.masterEQHigh.frequency.value = 6000;
    this.masterEQHigh.gain.value = 0;

    // EQ chain is always connected through to analyser
    this.masterEQLow.connect(this.masterEQMid);
    this.masterEQMid.connect(this.masterEQHigh);
    this.masterEQHigh.connect(this.analyser);

    // Chorus — parallel send from masterGain
    this.chorusDelay = context.createDelay(0.05);
    this.chorusDelay.delayTime.value = 0.02;
    this.chorusLFO = context.createOscillator();
    this.chorusLFO.type = 'sine';
    this.chorusLFO.frequency.value = 0.5;
    this.chorusDepthGain = context.createGain();
    this.chorusDepthGain.gain.value = 0.005; // modulation depth in seconds
    this.chorusWet = context.createGain();
    this.chorusWet.gain.value = 0; // off by default
    this.chorusLFO.connect(this.chorusDepthGain);
    this.chorusDepthGain.connect(this.chorusDelay.delayTime);
    this.chorusLFO.start();

    // Chorus stereo width — dual panner approach.
    // The mono chorus delay is sent to two StereoPanners: one panned left, one right.
    // Width 0 = both panners at centre (mono), Width 1 = hard L/R (full stereo spread).
    // A gain node sums both panned signals into the chorusWet output.
    this._chorusPanL         = context.createStereoPanner();
    this._chorusPanR         = context.createStereoPanner();
    this._chorusWidthSum     = context.createGain(); // sums both panned stereo paths
    this._chorusWidthSum.gain.value = 0.5; // -6 dB to compensate for double signal
    this._chorusPanL.pan.value = -0.5; // default width 0.5 → pan ±0.5
    this._chorusPanR.pan.value =  0.5;

    this.chorusDelay.connect(this._chorusPanL);
    this.chorusDelay.connect(this._chorusPanR);
    this._chorusPanL.connect(this._chorusWidthSum);
    this._chorusPanR.connect(this._chorusWidthSum);

    // Parallel send: master → chorusDelay → [width panners] → chorusWet → masterCompressor
    this.master.connect(this.chorusDelay);
    this._chorusWidthSum.connect(this.chorusWet);
    this.chorusWet.connect(this.masterCompressor);

    // Master chain: masterGain → masterCompressor → masterSaturator → [limiter?] → masterEQLow → masterEQMid → masterEQHigh → analyser → destination
    // Initially no limiter — setLimiter(true) inserts it between saturator and EQ
    this.master.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterSaturator);
    this.masterSaturator.connect(this.masterEQLow);
    this.analyser.connect(context.destination);

    // Shared noise buffer — pre-created once, looped per trigger (not per-note allocation)
    this._noiseBuffer = this.createNoiseBuffer(2);
  }

  // ——————————————————————————————————————————————
  // Freeverb reverb graph construction
  // ——————————————————————————————————————————————

  _buildReverbGraph() {
    const ctx = this.context;
    const sr = ctx.sampleRate;
    const scale = sr / 44100;

    // Pre-delay node — inserted between reverbInput and comb filters (max 100 ms)
    this.reverbPreDelay = ctx.createDelay(0.1);
    this.reverbPreDelay.delayTime.value = 0;
    this.reverbInput.connect(this.reverbPreDelay);

    // Sum node — all 8 comb outputs feed here
    const combSum = ctx.createGain();
    combSum.gain.value = 0.125; // normalize 8 parallel combs

    this._combFilters = [];

    for (const delaySamples of COMB_DELAYS_44100) {
      const delayTime = (delaySamples * scale) / sr;

      const delayNode = ctx.createDelay(delayTime + 0.01);
      delayNode.delayTime.value = delayTime;

      // Lowpass in feedback loop for damping
      const damplp = ctx.createBiquadFilter();
      damplp.type = "lowpass";
      damplp.frequency.value = 5500 * (1 - this.reverbDamping * 0.8);
      damplp.Q.value = 0.5;

      const feedbackGain = ctx.createGain();
      feedbackGain.gain.value = this.reverbRoomSize;

      // Comb loop: delayNode → damplp → feedbackGain → back to delayNode
      this.reverbPreDelay.connect(delayNode);
      delayNode.connect(damplp);
      damplp.connect(feedbackGain);
      feedbackGain.connect(delayNode);

      // Tap the delay output to sum node
      delayNode.connect(combSum);

      this._combFilters.push({ feedbackGain, damplp });
    }

    // 4 series allpass sections after comb sum
    let allpassIn = combSum;
    this._allpassNodes = [];

    for (const delaySamples of ALLPASS_DELAYS_44100) {
      const delayTime = (delaySamples * scale) / sr;

      // Web Audio doesn't have a native allpass delay, so we approximate with a
      // DelayNode in a feedback/feedforward arrangement:
      //   out = -0.5*in + delay + 0.5*delay_feedback
      const delayNode = ctx.createDelay(delayTime + 0.01);
      delayNode.delayTime.value = delayTime;

      const passGain = ctx.createGain();   // feedforward path, gain = 1
      const feedGain = ctx.createGain();   // feedback into delay, gain = 0.5
      const negGain = ctx.createGain();    // invert input, gain = -0.5

      passGain.gain.value = 1;
      feedGain.gain.value = 0.5;
      negGain.gain.value = -0.5;

      // Input → delay
      allpassIn.connect(delayNode);
      // Input → negGain (invert)
      allpassIn.connect(negGain);
      // delay → feedGain → delay (feedback loop with 0.5)
      delayNode.connect(feedGain);
      feedGain.connect(delayNode);

      // Output merger: negGain + delayOutput
      const apOut = ctx.createGain();
      apOut.gain.value = 1;
      negGain.connect(apOut);
      delayNode.connect(apOut);

      allpassIn = apOut;
      this._allpassNodes.push(delayNode);
    }

    // Final allpass output → reverbWet → master
    allpassIn.connect(this.reverbWet);
  }

  // Update all comb feedback gains (roomSize 0–0.98)
  setReverbRoomSize(v) {
    this.reverbRoomSize = Math.max(0, Math.min(0.98, v));
    for (const { feedbackGain } of this._combFilters) {
      feedbackGain.gain.setTargetAtTime(this.reverbRoomSize, this.context.currentTime, 0.01);
    }
  }

  // Update all comb damping lowpass cutoffs (damping 0–1)
  setReverbDamping(v) {
    this.reverbDamping = Math.max(0, Math.min(1, v));
    const freq = 5500 * (1 - this.reverbDamping * 0.8);
    for (const { damplp } of this._combFilters) {
      damplp.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
    }
  }

  // Set reverb pre-delay (0–100 ms)
  setReverbPreDelay(ms) {
    if (!this.reverbPreDelay) return;
    const sec = Math.max(0, Math.min(0.1, ms / 1000));
    this.reverbPreDelay.delayTime.setTargetAtTime(sec, this.context.currentTime, 0.005);
  }

  // ——————————————————————————————————————————————
  // Reverb type — maps named presets to roomSize + damping combinations
  // ——————————————————————————————————————————————

  setReverbType(type) {
    // Each preset encodes: roomSize (comb feedback 0–0.98), damping (0–1)
    const PRESETS = {
      room:      { roomSize: 0.72, damping: 0.65 },
      hall:      { roomSize: 0.90, damping: 0.35 },
      plate:     { roomSize: 0.82, damping: 0.20 },
      spring:    { roomSize: 0.76, damping: 0.55 },
      cathedral: { roomSize: 0.96, damping: 0.18 },
    };
    const preset = PRESETS[type] ?? PRESETS.room;
    this.setReverbRoomSize(preset.roomSize);
    this.setReverbDamping(preset.damping);

    // Spring: modulate allpass delay times with a fast LFO for flutter character.
    // Stop any previously running spring LFO first.
    if (this._springLFO) {
      try { this._springLFO.stop(); } catch (_) {}
      this._springLFO = null;
    }
    if (type === 'spring' && this._allpassNodes && this._allpassNodes.length > 0) {
      const ctx = this.context;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 8; // 8 Hz flutter characteristic of spring reverbs
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.0004; // subtle time modulation in seconds
      lfo.connect(lfoDepth);
      // Modulate the first two allpass nodes
      for (let i = 0; i < Math.min(2, this._allpassNodes.length); i++) {
        lfoDepth.connect(this._allpassNodes[i].delayTime);
      }
      lfo.start();
      this._springLFO = lfo;
    }
  }

  setDelayFeedback(v) {
    this.delayFeedback.gain.setTargetAtTime(Math.max(0, Math.min(0.95, v)), this.context.currentTime, 0.01);
  }

  setDelayTime(v) {
    this.delay.delayTime.setTargetAtTime(Math.max(0.01, Math.min(1.3, v)), this.context.currentTime, 0.01);
  }

  setDelayMix(v) {
    this.delayWet.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.context.currentTime, 0.01);
  }

  setMasterLevel(v) {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.context.currentTime, 0.01);
  }

  // Set the global maximum voice ceiling (absolute cap across all per-track maxVoices)
  setMaxVoicesGlobal(n) {
    this._maxVoicesGlobal = Math.max(1, Math.round(n));
  }

  setReverbMix(v) {
    this.reverbWet.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.context.currentTime, 0.01);
  }

  // ——————————————————————————————————————————————
  // Master Drive — WaveShaper saturator on master bus
  // ——————————————————————————————————————————————

  // Standard overdrive curve: (3 + k) * x / (π + k * |x|), 256 samples
  _makeDriveCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const k = amount * 100;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = ((3 + k) * x) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // v: 0–1. Below 0.01 bypasses drive (linear passthrough via null curve).
  setMasterDrive(v) {
    v = Math.max(0, Math.min(1, v));
    if (v < 0.01) {
      this.masterSaturator.curve = null;
    } else {
      this.masterSaturator.curve = this._makeDriveCurve(v);
    }
  }

  // Update master compressor parameters smoothly via setTargetAtTime.
  // Each key is optional; omitted keys are left unchanged.
  setCompressor({ threshold, knee, ratio, attack, release } = {}) {
    const t = this.context.currentTime;
    const c = this.masterCompressor;
    if (threshold !== undefined) c.threshold.setTargetAtTime(threshold, t, 0.01);
    if (knee      !== undefined) c.knee.setTargetAtTime(knee,           t, 0.01);
    if (ratio     !== undefined) c.ratio.setTargetAtTime(ratio,         t, 0.01);
    if (attack    !== undefined) c.attack.setTargetAtTime(attack,       t, 0.01);
    if (release   !== undefined) c.release.setTargetAtTime(release,     t, 0.01);
  }

  // ——————————————————————————————————————————————
  // AudioWorklet init
  // ——————————————————————————————————————————————

  async initWorklets() {
    const load = async (path, flagName) => {
      try {
        await this.context.audioWorklet.addModule(path);
        this[flagName] = true;
      } catch (err) {
        console.warn(`AudioWorklet ${path} failed:`, err);
      }
    };
    await Promise.all([
      load('/src/worklets/resampler-worklet.js', '_workletReady'),
      load('/src/worklets/plaits-worklet.js',    '_plaitsReady'),
      load('/src/worklets/clouds-worklet.js',    '_cloudsReady'),
      load('/src/worklets/rings-worklet.js',     '_ringsReady'),
    ]);
  }

  // ——————————————————————————————————————————————
  // Audio init helpers
  // ——————————————————————————————————————————————

  createNoiseBuffer(duration = 2) {
    const len = Math.floor(this.context.sampleRate * duration);
    const buf = this.context.createBuffer(1, len, this.context.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ——————————————————————————————————————————————
  // Drive curve — cached, not reallocated per trigger
  // ——————————————————————————————————————————————

  getDriveCurve(amount) {
    const key = Math.round(amount * 100); // quantize to avoid infinite unique values
    if (!this._driveCurveCache.has(key)) {
      const samples = 256;
      const curve = new Float32Array(samples);
      const k = 1 + amount * 28;
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(k * x);
      }
      this._driveCurveCache.set(key, curve);
    }
    return this._driveCurveCache.get(key);
  }

  // ——————————————————————————————————————————————
  // Scene interpolation
  // ——————————————————————————————————————————————

  interpolateScene(a, b, crossfader) {
    return a + (b - a) * crossfader;
  }

  // ——————————————————————————————————————————————
  // MIDI output
  // ——————————————————————————————————————————————

  // Keep _bpm in sync with the sequencer BPM for MIDI gate duration calculations.
  // Call this whenever state.bpm changes.
  setBpm(bpm) {
    this._bpm = bpm;
  }

  sendMidiNote(track, note, velocity, durationSec) {
    if (!this.midiOutput) return;
    const ch = ((track.midiChannel ?? this.midiChannel ?? 1) - 1) & 0xf;
    const vel = Math.round(velocity * 127);
    this.midiOutput.send([0x90 | ch, note, vel]);
    setTimeout(() => this.midiOutput.send([0x80 | ch, note, 0]), durationSec * 1000);
  }

  // MIDI Clock — 24 pulses per quarter note (0xF8), with drift correction
  startMidiClock(bpm) {
    this.stopMidiClock(); // clear any existing clock
    if (!this.midiOutput) return;

    const intervalMs = (60000 / bpm) / 24;
    let nextTick = performance.now();

    this.sendMidiStart();

    this._midiClockInterval = setInterval(() => {
      const now = performance.now();
      // Drift correction: fire immediately if we're behind, stay on schedule
      if (now >= nextTick) {
        if (this.midiOutput) this.midiOutput.send([0xf8]);
        nextTick += intervalMs;
        // If we've drifted more than one interval behind, resync
        if (nextTick < now) nextTick = now + intervalMs;
      }
    }, Math.max(1, intervalMs * 0.5)); // poll at ~2x rate for accuracy
  }

  stopMidiClock() {
    if (this._midiClockInterval !== null) {
      clearInterval(this._midiClockInterval);
      this._midiClockInterval = null;
    }
    this.sendMidiStop();
  }

  sendMidiStart() {
    if (this.midiOutput) this.midiOutput.send([0xfa]);
  }

  sendMidiStop() {
    if (this.midiOutput) this.midiOutput.send([0xfc]);
  }

  // ——————————————————————————————————————————————
  // Metronome click — scheduled oscillator burst
  // ——————————————————————————————————————————————

  // time: AudioContext timestamp to schedule the click
  // isDownbeat: true for the first step of a pattern (higher pitch)
  playMetronomeClick(time, isDownbeat) {
    const ctx = this.context;
    const freq = isDownbeat ? 1000 : 800;
    const duration = 0.015;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    // Bypass reverb/delay — connect directly to masterGain
    osc.connect(env);
    env.connect(this.master);

    osc.start(time);
    osc.stop(time + duration + 0.005);
  }

  // ——————————————————————————————————————————————
  // Preview (keyboard note preview — fires immediately)
  // ——————————————————————————————————————————————

  previewNote(track, note, velocity = 1) {
    const when = this.context.currentTime;
    this.triggerTrack(track, when, 0.25, { note, accent: false, velocity });
  }

  // ——————————————————————————————————————————————
  // Voice stealing helper
  // ——————————————————————————————————————————————

  // Register a new voice source for a track. If the queue is already at maxVoices,
  // the oldest source is stopped immediately (voice stealing). The source is pushed
  // onto the queue and its onended handler cleans it up.
  // trackKey: track index (number) or track object — must be consistent per call site
  // source:   AudioNode with a .stop() method (OscillatorNode, AudioBufferSourceNode)
  //           or an AudioWorkletNode; for worklets, pass a plain object with stop() wrapping
  //           the port.postMessage({ type: 'stop' }) call.
  // maxVoices: polyphony ceiling for this track (default 8)
  // globalMax: absolute ceiling across all tracks (default this._maxVoicesGlobal ?? 16)
  _registerVoice(trackKey, source, maxVoices = 8, globalMax) {
    // Apply global ceiling
    const ceiling = globalMax ?? this._maxVoicesGlobal ?? 16;
    maxVoices = Math.min(maxVoices, ceiling);

    // Increment active voice count
    this._activeVoices.set(trackKey, (this._activeVoices.get(trackKey) ?? 0) + 1);

    // Steal oldest voice if over the limit
    const queue = this._voiceQueue.get(trackKey) ?? [];
    while (queue.length >= maxVoices) {
      const oldest = queue.shift();
      try { oldest.stop(this.context.currentTime + 0.01); } catch (_) {}
    }
    queue.push(source);
    this._voiceQueue.set(trackKey, queue);

    // Clean up on natural end
    const cleanup = () => {
      const q = this._voiceQueue.get(trackKey);
      if (q) {
        const idx = q.indexOf(source);
        if (idx !== -1) q.splice(idx, 1);
      }
      const prev = this._activeVoices.get(trackKey) ?? 1;
      this._activeVoices.set(trackKey, Math.max(0, prev - 1));
    };

    if (typeof source.onended !== 'undefined') {
      // OscillatorNode / AudioBufferSourceNode — fires onended when stopped
      source.onended = cleanup;
    } else {
      // AudioWorkletNode or other — no onended; caller supplies totalTime
      // Cleanup will be triggered via the _registerVoiceTimeout path
      source._voiceCleanup = cleanup;
    }
  }

  // ——————————————————————————————————————————————
  // Trigger
  // ——————————————————————————————————————————————

  triggerTrack(track, when, stepDuration, options = {}) {
    // Merge paramLocks on top of track defaults
    const paramLocks = options.paramLocks || {};
    const params = { ...track, ...paramLocks };

    // trackKey: use numeric index when provided (for mixer display), else track object
    const trackKey = options.trackIndex !== undefined ? options.trackIndex : track;

    const accent = options.accent || false;
    const note = options.note ?? params.pitch;
    const velScale = options.velocity ?? 1;
    const retrig = params.retrig ?? 1;

    // Velocity curve shaping
    const curve = params.velocityCurve ?? 'linear';
    let finalVel = velScale;
    if (curve === 'exp')  finalVel = Math.pow(velScale, 2);
    if (curve === 'comp') finalVel = Math.pow(velScale, 0.5);
    const loudness = (accent ? 1.22 : 1) * params.volume * finalVel * (params.inputGain ?? 1.0);

    // Crossfader comes from the track's stored crossfader value or falls back to 0.5
    const crossfader = typeof params.crossfader === "number" ? params.crossfader : 0.5;

    const cutoff = this.interpolateScene(params.sceneA.cutoff, params.sceneB.cutoff, crossfader);
    const decayTime = this.interpolateScene(params.sceneA.decay, params.sceneB.decay, crossfader);
    // Per-step gate (0.05–1.0) scales how long the note sustains before release
    const stepGate = Math.max(0.05, Math.min(1, params.gate ?? 0.5));
    const gate = Math.max(stepDuration * params.noteLength * stepGate, params.attack + 0.01);
    const totalTime = gate + decayTime;

    // Sidechain ducking — when this track is the sidechain source, duck sidechainGain.
    // Uses params.sidechainAmount (from track state) so changes take effect immediately.
    if (params.isSidechainSource && this._sidechainEnabled) {
      const amount   = typeof params.sidechainAmount === 'number' ? params.sidechainAmount : this._sidechainAmount;
      const scGain   = this.sidechainGain.gain;
      const floor    = 1 - Math.max(0, Math.min(1, amount)); // target duck level (e.g. 0.2)
      const releaseS = this._sidechainRelease / 1000;        // ms → seconds
      scGain.cancelScheduledValues(when);
      scGain.setValueAtTime(1, when);                        // ensure we start from 1
      scGain.setTargetAtTime(floor, when, 0.003);            // fast attack (~3 ms time constant)
      scGain.setTargetAtTime(1, when + 0.01, releaseS / 3);  // recover over release window
    }

    // MIDI machine — skip audio, send MIDI note
    if (params.machine === "midi") {
      this.sendMidiNote(params, note ?? 60, loudness, totalTime);
      return;
    }

    // MIDI note output — send on the track's assigned MIDI channel for all non-MIDI machines
    if (this.midiOutput && track.midiChannel) {
      const ch = (track.midiChannel - 1) & 0x0F;
      const noteNum = options.note ?? params.pitch ?? track.note ?? 60;
      const vel = Math.round((options.velocity ?? 1) * 127);
      const delayMs = Math.max(0, (when - this.context.currentTime) * 1000);
      const gateDurMs = (params.gate ?? 0.5) * (60000 / this._bpm / 4) * 4;
      setTimeout(() => {
        try {
          this.midiOutput.send([0x90 | ch, noteNum, vel]);
          setTimeout(() => {
            try { this.midiOutput.send([0x80 | ch, noteNum, 0]); } catch (e) {}
          }, gateDurMs);
        } catch (e) {}
      }, delayMs);
    }

    // Signal chain: source → [bitCrusher?] → output (ADSR env gain) → panner → filter → saturator → master
    //   saturator → delaySend → delay ↺ feedback
    //   saturator → reverbSend → reverbInput → reverb graph → reverbWet → master

    const output = this.context.createGain();
    output.gain.value = 0.0001;

    const panner = this.context.createStereoPanner();
    panner.pan.value = params.pan;

    const VALID_FILTER_TYPES = ['lowpass','highpass','bandpass','notch','peaking','lowshelf','highshelf'];
    const filter = this.context.createBiquadFilter();
    filter.type = VALID_FILTER_TYPES.includes(params.filterType) ? params.filterType : "lowpass";
    filter.frequency.value = cutoff;
    // filterQ is the dedicated Q/resonance param; fall back to legacy resonance field
    filter.Q.value = params.filterQ ?? params.resonance ?? 1.0;

    const saturator = this.context.createWaveShaper();
    saturator.curve = this.getDriveCurve(params.drive);
    saturator.oversample = "2x";

    // Bit-crusher — inserted between output and panner when bitDepth < 32 or srDiv > 1
    // bitDepth 32 = off (full resolution), lower values quantize to 2^bitDepth levels.
    const bitDepth = params.bitDepth ?? 32;
    const srDiv = params.srDiv ?? 1;
    const needsCrusher = bitDepth < 32 || srDiv > 1;

    // Per-trigger 3-band EQ (lowShelf / peaking / highShelf).
    // Only created when at least one band has a non-trivial gain (abs > 0.1 dB).
    const eqLow  = params.eqLow  ?? 0;
    const eqMid  = params.eqMid  ?? 0;
    const eqHigh = params.eqHigh ?? 0;
    const needsEQ = Math.abs(eqLow) > 0.1 || Math.abs(eqMid) > 0.1 || Math.abs(eqHigh) > 0.1;

    // eqTail is the node that should connect to the panner (either a plain output
    // node, the last EQ shelf, or the crusher when that is also present).
    let eqTail = output;

    if (needsCrusher) {
      const crusher = this.context.createScriptProcessor(256, 1, 1);
      const step = Math.pow(2, bitDepth);
      let held = 0;
      let sampleCount = 0;

      crusher.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const outBuf = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i++) {
          if (sampleCount % srDiv === 0) {
            held = Math.round(input[i] * step) / step;
          }
          outBuf[i] = held;
          sampleCount++;
        }
      };

      output.connect(crusher);
      eqTail = crusher;
    }

    if (needsEQ) {
      const lowShelf = this.context.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 200;
      lowShelf.gain.value = eqLow;

      const midPeak = this.context.createBiquadFilter();
      midPeak.type = 'peaking';
      midPeak.frequency.value = params.eqMidFreq ?? 1000;
      midPeak.Q.value = 1.0;
      midPeak.gain.value = eqMid;

      const highShelf = this.context.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 6000;
      highShelf.gain.value = eqHigh;

      eqTail.connect(lowShelf);
      lowShelf.connect(midPeak);
      midPeak.connect(highShelf);
      eqTail = highShelf;
    }

    eqTail.connect(panner);

    // Stereo width: width < 0.1 collapses to mono via channel merger
    const stereoWidth = params.stereoWidth ?? 1;
    if (stereoWidth < 0.1) {
      const splitter = this.context.createChannelSplitter(2);
      const merger   = this.context.createChannelMerger(2);
      panner.connect(splitter);
      // Sum both channels into L and R equally — produces mono
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 0, 1);
      splitter.connect(merger, 1, 0);
      splitter.connect(merger, 1, 1);
      merger.connect(filter);
    } else {
      panner.connect(filter);
    }

    // Determine output bus for this track's dry signal and sends.
    // All three buses route through sidechainGain so ducking applies to track audio.
    const busTarget = params.outputBus === 'bus1' ? this.bus1 :
                      params.outputBus === 'bus2' ? this.bus2 : this.sidechainGain;

    filter.connect(saturator);
    saturator.connect(busTarget);

    const delaySendGain = this.interpolateScene(
      params.sceneA.delaySend,
      params.sceneB.delaySend,
      crossfader
    );
    const delaySend = this.context.createGain();
    delaySend.gain.value = delaySendGain;
    saturator.connect(delaySend);
    delaySend.connect(this.delay);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = params.reverbSend;
    saturator.connect(reverbSend);
    reverbSend.connect(this.reverb); // this.reverb === this.reverbInput

    // ADSR-lite: attack → hold → decay
    output.gain.setValueAtTime(0.0001, when);
    output.gain.linearRampToValueAtTime(loudness, when + params.attack);
    if (gate > params.attack + 0.005) {
      output.gain.setValueAtTime(loudness, when + gate);
    }
    output.gain.exponentialRampToValueAtTime(0.0001, when + totalTime);

    // LFO modulation — trigLFO is shared across all routing destinations for this trigger
    let trigLFO = null;
    const lfoActive = params.lfoDepth > 0.001;
    const hasRoutingFlags = params.lfoToCutoff || params.lfoToVolume || params.lfoToPitch;
    if (lfoActive || hasRoutingFlags) {
      trigLFO = this.context.createOscillator();
      trigLFO.type = "sine";
      trigLFO.frequency.value = params.lfoRate ?? 2;

      // Legacy single-target routing via lfoTarget
      if (lfoActive) {
        const lfoGain = this.context.createGain();
        trigLFO.connect(lfoGain);
        if (params.lfoTarget === "cutoff") {
          lfoGain.gain.value = params.lfoDepth * 2500;
          lfoGain.connect(filter.frequency);
        } else if (params.lfoTarget === "volume") {
          lfoGain.gain.value = params.lfoDepth * loudness * 0.7;
          lfoGain.connect(output.gain);
        } else if (params.lfoTarget === "pan") {
          lfoGain.gain.value = params.lfoDepth;
          lfoGain.connect(panner.pan);
        } else if (params.lfoTarget === "pitch") {
          lfoGain.gain.value = (params.lfoDepth ?? 0.3) * 100;
          // pitch routing needs osc.detune — deferred to after osc creation below
          trigLFO._pitchGain = lfoGain;
        }
      }

      // Multi-destination routing flags
      if (params.lfoToCutoff) {
        const g = this.context.createGain();
        g.gain.value = (params.lfoDepth ?? 0.3) * (params.cutoff ?? 800);
        trigLFO.connect(g);
        g.connect(filter.frequency);
      }
      if (params.lfoToVolume) {
        const g = this.context.createGain();
        g.gain.value = (params.lfoDepth ?? 0.3) * 0.5;
        trigLFO.connect(g);
        g.connect(output.gain);
      }
      // lfoToPitch routing is applied after osc creation below

      trigLFO.start(when);
      trigLFO.stop(when + totalTime + 0.05);
    }

    // Plaits multi-engine synth
    if (params.machine === 'plaits' && this._plaitsReady) {
      try {
        const node = new AudioWorkletNode(this.context, 'cs-plaits');
        node.port.postMessage({
          type:      'trigger',
          engine:    params.plEngine    ?? 0,
          frequency: 440 * Math.pow(2, ((note || 69) - 69) / 12),
          timbre:    params.plTimbre    ?? 0.5,
          harmonics: params.plHarmonics ?? 0.5,
          morph:     params.plMorph     ?? 0.5,
          sampleRate: this.context.sampleRate,
        });
        node.connect(output);
        // Worklet voice: wrap stop in a plain object so _registerVoice can steal it
        const voiceHandle = {
          stop: (t) => {
            node.port.postMessage({ type: 'stop' });
            try { node.disconnect(); } catch (_) {}
          },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        setTimeout(() => {
          node.port.postMessage({ type: 'stop' });
          try { node.disconnect(); } catch (_) {}
          if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
        }, (totalTime + 0.3) * 1000);
        return;
      } catch (_) {}
    }

    // Clouds granular
    if (params.machine === 'clouds' && this._cloudsReady) {
      try {
        const node = new AudioWorkletNode(this.context, 'cs-clouds');
        if (params.sampleBuffer) {
          const ch   = params.sampleBuffer.getChannelData(0);
          const copy = ch.buffer.slice(0);
          node.port.postMessage(
            { type: 'load', buffer: copy, sampleRate: params.sampleBuffer.sampleRate, ctxRate: this.context.sampleRate },
            [copy]
          );
        }
        node.port.postMessage({
          type:     'trigger',
          position: params.clPosition ?? 0.5,
          size:     params.clSize     ?? 0.3,
          density:  params.clDensity  ?? 0.5,
          texture:  params.clTexture  ?? 0.5,
          pitch:    Math.pow(2, ((note || 60) - 60) / 12),
          duration: totalTime,
        });
        node.connect(output);
        const voiceHandle = {
          stop: () => {
            node.port.postMessage({ type: 'stop' });
            try { node.disconnect(); } catch (_) {}
          },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        setTimeout(() => {
          node.port.postMessage({ type: 'stop' });
          try { node.disconnect(); } catch (_) {}
          if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
        }, (totalTime + 0.5) * 1000);
        return;
      } catch (_) {}
    }

    // Rings modal resonator
    if (params.machine === 'rings' && this._ringsReady) {
      try {
        const node = new AudioWorkletNode(this.context, 'cs-rings');
        node.port.postMessage({
          type:       'trigger',
          frequency:  440 * Math.pow(2, ((note || 69) - 69) / 12),
          structure:  params.rnStructure  ?? 0.5,
          brightness: params.rnBrightness ?? 0.7,
          damping:    params.rnDamping    ?? 0.7,
          exciter:    params.rnExciter    ?? 0,
          sampleRate: this.context.sampleRate,
        });
        node.connect(output);
        const voiceHandle = {
          stop: () => {
            node.port.postMessage({ type: 'stop' });
            try { node.disconnect(); } catch (_) {}
          },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        setTimeout(() => {
          node.port.postMessage({ type: 'stop' });
          try { node.disconnect(); } catch (_) {}
          if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
        }, (totalTime + 0.5) * 1000);
        return;
      } catch (_) {}
    }

    // Sample machine
    if (params.machine === "sample" && params.sampleBuffer) {
      const sampleStart = params.sampleStart ?? 0;
      const sampleEnd   = Math.max(sampleStart + 0.001, params.sampleEnd ?? 1);
      const bufDur      = params.sampleBuffer.duration;
      const offsetSec   = bufDur * sampleStart;
      const clipDur     = bufDur * (sampleEnd - sampleStart);

      // Key tracking: when enabled, pitch the sample relative to its stored root note
      // (params.note, set by auto-detect or manually). playbackRate = 2^((played-root)/12).
      // When key tracking is off, play at unity (1.0) regardless of the sequencer note.
      const samplePlaybackRate = params.keyTracking
        ? Math.pow(2, ((note ?? (params.note ?? 60)) - (params.note ?? 60)) / 12)
        : 1;

      if (this._workletReady) {
        // High-quality 4-point Hermite resampler via AudioWorklet
        const node = new AudioWorkletNode(this.context, 'cs-resampler');
        const channelData = params.sampleBuffer.getChannelData(0);
        const sr = params.sampleBuffer.sampleRate;
        const ctxRate = this.context.sampleRate;
        const startSample = Math.floor(offsetSec * sr);
        const endSample   = Math.min(channelData.length, Math.floor((bufDur * sampleEnd) * sr));
        const slice = channelData.buffer.slice(
          startSample * Float32Array.BYTES_PER_ELEMENT,
          endSample   * Float32Array.BYTES_PER_ELEMENT
        );
        const duration = clipDur / samplePlaybackRate;
        node.port.postMessage(
          { type: 'load', buffer: slice, playbackRate: samplePlaybackRate, sampleRate: sr, ctxRate },
          [slice]
        );
        node.connect(output);
        const voiceHandle = {
          stop: () => { try { node.disconnect(); } catch (_) {} },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        // Disconnect after playback completes — no BufferSource stop() equivalent
        setTimeout(() => {
          try { node.disconnect(); } catch (e) {}
          if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
        }, (totalTime + 0.1) * 1000);
      } else {
        // Fallback: native BufferSourceNode (browser linear interpolation)
        const source = this.context.createBufferSource();
        source.buffer = params.sampleBuffer;
        source.playbackRate.value = samplePlaybackRate;

        // Loop point support
        if (params.loopEnabled) {
          source.loop = true;
          const bufDurForLoop = params.sampleBuffer.duration;
          source.loopStart = (params.loopStart ?? 0) * bufDurForLoop;
          source.loopEnd   = (params.loopEnd   ?? 1) * bufDurForLoop;
        }

        source.connect(output);
        source.start(when, offsetSec, params.loopEnabled ? undefined : Math.min(totalTime, clipDur));
        if (!params.loopEnabled) {
          source.stop(when + totalTime + 0.02);
        }
        this._registerVoice(trackKey, source, params.maxVoices ?? 8);
      }
      return;
    }

    // Noise machine — uses shared buffer, loop=true
    if (params.machine === "noise") {
      const source = this.context.createBufferSource();
      source.buffer = this._noiseBuffer;
      source.loop = true;
      source.connect(output);
      source.start(when);
      source.stop(when + totalTime + 0.02);
      this._registerVoice(trackKey, source, params.maxVoices ?? 8);
      return;
    }

    // Tone machine (default)
    const wf = WAVEFORMS.includes(params.waveform) ? params.waveform : "triangle";
    const targetFreq = 440 * Math.pow(2, ((note || 69) - 69) / 12);

    // Legato: if there is an active oscillator for this track, slide its pitch
    // instead of stopping and re-triggering a new one.
    const legatoKey = track;
    const prevLegato = params.legato ? this._legatoSources.get(legatoKey) : null;

    if (prevLegato && params.legato) {
      // Slide frequency of the existing oscillator
      prevLegato.osc.frequency.cancelScheduledValues(when);
      prevLegato.osc.frequency.setTargetAtTime(targetFreq, when, 0.01);
      // Re-apply the envelope on the shared output gain node
      prevLegato.output.gain.cancelScheduledValues(when);
      prevLegato.output.gain.setValueAtTime(prevLegato.output.gain.value, when);
      prevLegato.output.gain.linearRampToValueAtTime(loudness, when + params.attack);
      if (gate > params.attack + 0.005) {
        prevLegato.output.gain.setValueAtTime(loudness, when + gate);
      }
      prevLegato.output.gain.exponentialRampToValueAtTime(0.0001, when + totalTime);
      prevLegato.stopAt = when + totalTime + 0.02;
      // The newly created output/chain for this trigger is unused — silence it
      output.gain.cancelScheduledValues(when);
      output.gain.setValueAtTime(0.0001, when);
    } else {
      const osc = this.context.createOscillator();
      osc.type = accent ? "sawtooth" : wf;
      osc.frequency.value = targetFreq;
      osc.connect(output);
      osc.start(when);
      osc.stop(when + totalTime + 0.02);
      this._registerVoice(trackKey, osc, params.maxVoices ?? 8);

      // Apply LFO → pitch routing now that osc.detune is available
      if (trigLFO) {
        // lfoTarget === "pitch" deferred gain node
        if (trigLFO._pitchGain) {
          trigLFO._pitchGain.connect(osc.detune);
        }
        // lfoToPitch routing flag
        if (params.lfoToPitch) {
          const g = this.context.createGain();
          g.gain.value = (params.lfoDepth ?? 0.3) * 100; // depth * 100 cents
          trigLFO.connect(g);
          g.connect(osc.detune);
        }
      }

      if (params.legato) {
        this._legatoSources.set(legatoKey, { osc, output, stopAt: when + totalTime + 0.02 });
        // Clean up entry after note ends
        setTimeout(() => {
          const cur = this._legatoSources.get(legatoKey);
          if (cur && cur.osc === osc) this._legatoSources.delete(legatoKey);
        }, (totalTime + 0.1) * 1000);
      }
    }

    // Retrig: schedule additional retriggered voices at subdivisions of the step
    if (retrig > 1) {
      const retrigInterval = stepDuration / retrig;
      const retriggeredVelocity = velScale * 0.7;
      for (let i = 1; i < retrig; i++) {
        const retrigTime = when + retrigInterval * i;
        this.triggerTrack(track, retrigTime, stepDuration, {
          ...options,
          velocity: retriggeredVelocity,
          paramLocks: { ...paramLocks, retrig: 1 }, // prevent infinite recursion
        });
      }
    }
  }

  // ——————————————————————————————————————————————
  // MIDI Input — CC listener
  // ——————————————————————————————————————————————

  // onCC: (cc: number, value: number 0–1) => void
  // Returns the requestMIDIAccess promise (resolves to midiAccess).
  setupMidiInput(onCC) {
    if (!navigator.requestMIDIAccess) {
      return Promise.reject(new Error('WebMIDI not supported'));
    }

    const attachInputs = (midiAccess) => {
      midiAccess.inputs.forEach((input) => {
        input.onmidimessage = (msg) => {
          const status = msg.data[0];
          // CC messages
          if ((status & 0xf0) === 0xb0) {
            const [, cc, val] = msg.data;
            onCC(cc, val / 127);
          }
          // MIDI Clock (0xF8) - 24 pulses per quarter note
          if (status === 0xf8 && this._midiClockCallback) {
            this._midiClockCallback();
          }
          // MIDI Start (0xFA)
          if (status === 0xfa && this._midiStartCallback) {
            this._midiStartCallback();
          }
          // MIDI Stop (0xFB)
          if (status === 0xfb && this._midiStopCallback) {
            this._midiStopCallback();
          }
        };
      });
    };

    return navigator.requestMIDIAccess({ sysex: false }).then((midiAccess) => {
      this._midiAccess = midiAccess;
      attachInputs(midiAccess);
      midiAccess.onstatechange = () => attachInputs(midiAccess);
      return midiAccess;
    });
  }

  // Remove all MIDI input message handlers attached by setupMidiInput.
  teardownMidiInput() {
    if (!this._midiAccess) return;
    this._midiAccess.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
  }

  // Register callbacks for incoming MIDI clock messages.
  // onClock: called 24x per quarter note (0xF8)
  // onStart: called on MIDI Start (0xFA)
  // onStop:  called on MIDI Stop (0xFB)
  setMidiClockInput(onClock, onStart, onStop) {
    this._midiClockCallback = onClock;
    this._midiStartCallback = onStart;
    this._midiStopCallback  = onStop;
  }

  // Insert or remove the master limiter between masterSaturator and masterEQLow.
  setLimiter(enabled) {
    this.masterSaturator.disconnect();
    if (enabled) {
      this.masterSaturator.connect(this.masterLimiter);
      this.masterLimiter.connect(this.masterEQLow);
    } else {
      this.masterSaturator.connect(this.masterEQLow);
    }
  }

  // Set master 3-band EQ gains (dB, -12 to +12).
  setMasterEQ(low, mid, high) {
    const t = this.context.currentTime;
    this.masterEQLow.gain.setTargetAtTime(low,  t, 0.01);
    this.masterEQMid.gain.setTargetAtTime(mid,  t, 0.01);
    this.masterEQHigh.gain.setTargetAtTime(high, t, 0.01);
  }

  // Chorus controls
  setChorusRate(v)  { this.chorusLFO.frequency.setTargetAtTime(v, this.context.currentTime, 0.01); }
  setChorusDepth(v) { this.chorusDepthGain.gain.setTargetAtTime(v * 0.02, this.context.currentTime, 0.01); }
  setChorusMix(v)   { this.chorusWet.gain.setTargetAtTime(v, this.context.currentTime, 0.01); }

  // Chorus stereo width (0 = mono, 1 = full stereo spread).
  // Moves the L/R panner pair symmetrically: width 0 → pan 0 (mono), width 1 → pan ±1.
  setChorusWidth(v) {
    v = Math.max(0, Math.min(1, v));
    const t = this.context.currentTime;
    if (this._chorusPanL) this._chorusPanL.pan.setTargetAtTime(-v, t, 0.01);
    if (this._chorusPanR) this._chorusPanR.pan.setTargetAtTime( v, t, 0.01);
  }

  // ——————————————————————————————————————————————
  // Sidechain ducking
  // ——————————————————————————————————————————————

  // Mark a track index as the sidechain trigger source and enable ducking.
  setSidechainSource(trackIndex) {
    this._sidechainSourceIndex = trackIndex;
    this._sidechainEnabled = true;
  }

  // Duck depth: 0 = no ducking, 1 = full mute on sidechain hit.
  setSidechainAmount(amount) {
    this._sidechainAmount = Math.max(0, Math.min(1, amount));
  }

  // Release time in milliseconds — how long to recover from full duck back to 1.
  setSidechainRelease(ms) {
    this._sidechainRelease = Math.max(10, ms);
  }

  // Send a MIDI Program Change on the given 1-based channel.
  sendProgramChange(channel, program) {
    if (!this.midiOutput) return;
    this.midiOutput.send([0xC0 | ((channel - 1) & 0x0f), program & 0x7f]);
  }

  // Quickly silence any sustained notes by ramping master gain to 0 and back.
  // Used when the sequencer stops to cut off oscillators that are still sounding.
  stopAllNotes() {
    const ctx = this.context;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    setTimeout(() => {
      this.master.gain.setTargetAtTime(0.82, ctx.currentTime, 0.05);
    }, 100);
  }

  panic() {
    const ctx = this.context;
    try { this.master.gain.cancelScheduledValues(ctx.currentTime); } catch(e) {}
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.005);
    setTimeout(() => {
      this.master.gain.setTargetAtTime(0.82, ctx.currentTime, 0.05);
    }, 80);
    if (this.midiOutput) {
      for (let ch = 0; ch < 16; ch++) {
        try { this.midiOutput.send([0xB0 | ch, 123, 0]); } catch(e) {}
        try { this.midiOutput.send([0xB0 | ch, 120, 0]); } catch(e) {}
      }
    }
  }

  startStutter(rate = 0.125) {
    if (this._stutterActive) return;
    this._stutterActive = true;
    this._stutterRate = rate;

    // Use a short delay node to create a feedback loop
    if (!this._stutterDelay) {
      this._stutterDelay = this.context.createDelay(0.5);
      this._stutterFeedback = this.context.createGain();
      this._stutterGate = this.context.createGain();
      this._stutterFeedback.gain.value = 0.95;
      this._stutterGate.gain.value = 0;

      this.master.connect(this._stutterDelay);
      this._stutterDelay.connect(this._stutterFeedback);
      this._stutterFeedback.connect(this._stutterDelay);
      this._stutterDelay.connect(this._stutterGate);
      this._stutterGate.connect(this.masterCompressor);
    }

    this._stutterDelay.delayTime.value = rate;
    this._stutterGate.gain.setTargetAtTime(1, this.context.currentTime, 0.005);
  }

  stopStutter() {
    if (!this._stutterActive) return;
    this._stutterActive = false;
    if (this._stutterGate) {
      this._stutterGate.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    }
  }

  setStutterRate(rate) {
    this._stutterRate = rate;
    if (this._stutterDelay) this._stutterDelay.delayTime.setTargetAtTime(rate, this.context.currentTime, 0.01);
  }
}

// ——————————————————————————————————————————————
// OSCILLOSCOPE
// Preallocated buffer — not new Uint8Array per rAF frame
// ——————————————————————————————————————————————

let _oscDataBuffer = null;

/**
 * drawOscilloscope(canvas, engine, animRef, state)
 *
 * @param {HTMLCanvasElement} canvas
 * @param {AudioEngine|null} engine
 * @param {{id: number|null}} animRef — caller-owned object storing the rAF id
 * @param {object|null} state — app state; read state.oscMode each frame
 */
export function drawOscilloscope(canvas, engine, animRef, state) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // Preallocated frequency-domain buffer (sized lazily)
  let _freqDataBuffer = null;

  const loop = () => {
    if (!engine?.analyser) {
      ctx.fillStyle = '#0a0b0d';
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(90,221,113,0.2)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      animRef.id = requestAnimationFrame(loop);
      return;
    }

    const analyser = engine.analyser;
    const mode = state?.oscMode ?? 'wave';

    // ── Spectrum mode ─────────────────────────────────────────────────────────
    if (mode === 'spectrum') {
      const binCount = analyser.frequencyBinCount;
      if (!_freqDataBuffer || _freqDataBuffer.length !== binCount) {
        _freqDataBuffer = new Uint8Array(binCount);
      }
      analyser.getByteFrequencyData(_freqDataBuffer);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(10, 14, 6, 0.4)';
      ctx.fillRect(0, 0, W, H);
      const barW = Math.max(1, W / (binCount / 4));
      for (let i = 0; i < binCount / 4; i++) {
        const h = (_freqDataBuffer[i] / 255) * H;
        const hue = 120 - (_freqDataBuffer[i] / 255) * 60;
        ctx.fillStyle = `hsl(${hue}, 70%, 45%)`;
        ctx.fillRect(i * barW, H - h, barW - 1, h);
      }
      animRef.id = requestAnimationFrame(loop);
      return;
    }

    // ── Lissajous (XY) mode ───────────────────────────────────────────────────
    if (mode === 'lissajous') {
      const fftSize = analyser.fftSize;
      if (!_oscDataBuffer || _oscDataBuffer.length !== fftSize) {
        _oscDataBuffer = new Uint8Array(fftSize);
      }
      analyser.getByteTimeDomainData(_oscDataBuffer);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(10, 14, 6, 0.15)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#5add71';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < _oscDataBuffer.length - 1; i += 2) {
        const x = (_oscDataBuffer[i] / 255) * W;
        const y = (_oscDataBuffer[i + 1] / 255) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      animRef.id = requestAnimationFrame(loop);
      return;
    }

    // ── Wave mode (default) ───────────────────────────────────────────────────
    const bufLen = analyser.frequencyBinCount;

    if (!_oscDataBuffer || _oscDataBuffer.length !== bufLen) {
      _oscDataBuffer = new Uint8Array(bufLen);
    }

    analyser.getByteTimeDomainData(_oscDataBuffer);
    const data = _oscDataBuffer;

    ctx.fillStyle = '#080a0c';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Filled gradient below waveform
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, 'rgba(90,221,113,0.28)');
    gradient.addColorStop(0.5, 'rgba(90,221,113,0.1)');
    gradient.addColorStop(1, 'rgba(90,221,113,0.0)');

    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128;
      const y = (v * H) / 2;
      const x = (i / (bufLen - 1)) * W;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H / 2);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Bright glow stroke
    ctx.beginPath();
    ctx.strokeStyle = '#5add71';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#5add71';
    ctx.shadowBlur = 6;
    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128;
      const y = (v * H) / 2;
      const x = (i / (bufLen - 1)) * W;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    animRef.id = requestAnimationFrame(loop);
  };

  // Cancel any prior animation before starting
  if (animRef.id !== null) {
    cancelAnimationFrame(animRef.id);
    animRef.id = null;
  }
  animRef.id = requestAnimationFrame(loop);
}
