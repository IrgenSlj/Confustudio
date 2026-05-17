// CONFUstudio v3 — AudioEngine module
// Extracted and enhanced from app.js

const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];

import { attachReverbMethods } from './engine-reverb.js';
import { midiOutputs, initMidi, getMidiOutputById, attachMidiMethods } from './engine-midi.js';
export { midiOutputs, initMidi, getMidiOutputById };

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
    this._sidechainAmount = 0.8; // duck depth (0=none, 1=full mute)
    this._sidechainRelease = 200; // release time in ms
    this._sidechainSourceIndex = 0; // track index that triggers ducking

    // Sub-mix buses — connect before sidechainGain so all paths are ducked together
    this.bus1 = context.createGain();
    this.bus1.gain.value = 1;
    this.bus2 = context.createGain();
    this.bus2.gain.value = 1;
    this.bus1.connect(this.sidechainGain);
    this.bus2.connect(this.sidechainGain);

    // 8 group audio buses — tracks with groupIndex route through these
    this.groupBuses = Array.from({ length: 8 }, () => {
      const gain = context.createGain();
      gain.gain.value = 1;
      gain.connect(this.sidechainGain);
      return gain;
    });
    this.groupPans = Array.from({ length: 8 }, (_, i) => {
      const pan = context.createStereoPanner();
      pan.pan.value = 0;
      pan.connect(this.groupBuses[i]);
      return pan;
    });
    // Group compressors (off by default — ratio=1 = bypass)
    this.groupCompressors = Array.from({ length: 8 }, (_, i) => {
      const comp = context.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 6;
      comp.ratio.value = 1; // bypass
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      comp.connect(this.groupPans[i]);
      return comp;
    });

    // Master dynamics compressor — inserted between masterGain and masterSaturator
    this.masterCompressor = context.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -18;
    this.masterCompressor.knee.value = 6;
    this.masterCompressor.ratio.value = 4;
    this.masterCompressor.attack.value = 0.003;
    this.masterCompressor.release.value = 0.25;

    // Master drive saturator — inserted between masterCompressor and masterAnalyser
    this.masterSaturator = context.createWaveShaper();
    this.masterSaturator.oversample = '2x';
    // Default: linear passthrough (no drive)
    this.masterSaturator.curve = null;

    // Analyser for oscilloscope (public)
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;

    // ── Send/return delay bus ─────────────────────────────────────────────────
    // _trackDelaySendGains[ti] → delaySendBus → delayNode → delayFilter → delayFeedback2 → delayNode (loop)
    // delayNode also taps → delayWet2 → master
    this.delaySendBus = context.createGain();
    this.delaySendBus.gain.value = 1;
    this.delayNode = context.createDelay(1.4);
    this.delayNode.delayTime.value = 0.28;
    this.delayFilter = context.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 6000;
    this.delayFilter.Q.value = 0.5;
    this.delayFeedback2 = context.createGain();
    this.delayFeedback2.gain.value = 0.38;
    this.delayWet2 = context.createGain();
    this.delayWet2.gain.value = 0.28;

    // ── Convolution reverb ────────────────────────────────────────────────────
    this.reverbConvolver = context.createConvolver();
    this.reverbDry = context.createGain();
    this.reverbDry.gain.value = 1;
    this.reverbConvWet = context.createGain(); // wet level for convolution path
    this.reverbConvWet.gain.value = 0.3;
    this.reverbPreset = 'room';
    this._irCache = new Map();

    // Send bus: tracks' reverbSend feeds here → convolver
    this.reverbSendBus = context.createGain();
    this.reverbSendBus.gain.value = 1;

    // Per-track send gain nodes — index matches track index, created on first use
    this._trackReverbSendGains = [];
    this._trackDelaySendGains = [];

    // reverbInput is the entry point for the per-step reverb send from tracks;
    // routes into reverbSendBus → convolution reverb for unified reverb path.
    this.reverbInput = context.createGain();
    this.reverb = this.reverbInput; // backward compatibility
    this.reverbInput.connect(this.reverbSendBus);

    // Per-track active legato source — keyed by track index (or track object identity)
    // Stores { osc, output, stopTime } for the currently ringing oscillator on legato tracks
    this._legatoSources = new Map();

    // Voice polyphony tracking — keyed by track key (index or track object)
    // _activeVoices: count of currently ringing voices per track
    // _voiceQueue:   ordered array of active AudioBufferSourceNode / OscillatorNode per track
    this._activeVoices = new Map();
    this._voiceQueue = new Map();

    // MIDI output (set externally or via sendMidiNote)
    this.midiOutput = null;
    this._midiClockInterval = null;

    // BPM tracked locally so triggerTrack can compute gate durations for MIDI note-off
    this._bpm = 120;

    // AudioWorklet readiness flags — set true after initWorklets() resolves
    this._workletReady = false;
    this._bitcrusherReady = false;
    this._plaitsReady = false;
    this._cloudsReady = false;
    this._ringsReady = false;

    // Routing — send/return delay bus
    this.delaySendBus.connect(this.delayNode);
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback2);
    this.delayFeedback2.connect(this.delayNode);
    this.delayNode.connect(this.delayWet2);
    this.delayWet2.connect(this.master);

    // Convolution reverb send bus routing — connected after masterLimiter is wired below
    this.reverbSendBus.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbConvWet);

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
    this._chorusPanL = context.createStereoPanner();
    this._chorusPanR = context.createStereoPanner();
    this._chorusWidthSum = context.createGain(); // sums both panned stereo paths
    this._chorusWidthSum.gain.value = 0.5; // -6 dB to compensate for double signal
    this._chorusPanL.pan.value = -0.5; // default width 0.5 → pan ±0.5
    this._chorusPanR.pan.value = 0.5;

    this.chorusDelay.connect(this._chorusPanL);
    this.chorusDelay.connect(this._chorusPanR);
    this._chorusPanL.connect(this._chorusWidthSum);
    this._chorusPanR.connect(this._chorusWidthSum);

    // Parallel send: master → chorusDelay → [width panners] → chorusWet → masterCompressor
    this.master.connect(this.chorusDelay);
    this._chorusWidthSum.connect(this.chorusWet);
    this.chorusWet.connect(this.masterCompressor);

    // Master stereo width — StereoPanner inserted before analyser
    // setMasterWidth(val) adjusts pan value (-1=full left, 0=centre, 1=full right)
    this.masterPan = context.createStereoPanner();
    this.masterPan.pan.value = 0;

    // EQ chain feeds masterPan → analyser
    this.masterEQHigh.disconnect();
    this.masterEQHigh.connect(this.masterPan);
    this.masterPan.connect(this.analyser);

    // Master chain: masterGain → masterCompressor → masterSaturator → masterLimiter
    //   → reverbDry → masterEQLow → … → masterPan → analyser → destination (dry path)
    //   → reverbConvWet → masterEQLow (wet tap from convolution reverb)
    this.master.connect(this.masterCompressor);
    this.masterCompressor.connect(this.masterSaturator);
    this.masterSaturator.connect(this.masterLimiter);
    // Parallel dry/wet after limiter
    this.masterLimiter.connect(this.reverbDry);
    this.reverbDry.connect(this.masterEQLow);
    this.reverbConvWet.connect(this.masterEQLow);
    this.mainOutput = context.createGain();
    this.mainOutput.gain.value = 1;
    this.analyser.connect(this.mainOutput);
    this.mainOutput.connect(context.destination);

    // Seed the convolution reverb with a default IR (room) — deferred to avoid
    // AudioContext creation race; called lazily on first setReverbConvPreset().
    // Build room IR immediately so it is ready for playback.
    this._buildConvIR('room');

    // CUE output — pre-fader listen bus, monitored independently from the main master chain.
    this.cueOutput = context.createGain();
    this.cueOutput.gain.value = 1;
    this.cueMonitor = context.createGain();
    this.cueMonitor.gain.value = 1;
    this.cueMonitorGate = context.createGain();
    this.cueMonitorGate.gain.value = 1;
    this.cueOutput.connect(this.cueMonitor);
    this.cueMonitor.connect(this.cueMonitorGate);
    this.cueMonitorGate.connect(context.destination);

    // Shared noise buffer — pre-created once, looped per trigger (not per-note allocation)
    this._noiseBuffer = this.createNoiseBuffer(2);

    // ── Mod Matrix LFOs ───────────────────────────────────────────────────────
    // Two global LFO oscillators for the mod matrix routing system.
    this.lfo1 = context.createOscillator();
    this.lfo1.type = 'sine';
    this.lfo1.frequency.value = 1;
    this.lfo1Gain = context.createGain();
    this.lfo1Gain.gain.value = 0;
    this.lfo1.connect(this.lfo1Gain);
    this.lfo1.start();

    this.lfo2 = context.createOscillator();
    this.lfo2.type = 'triangle';
    this.lfo2.frequency.value = 0.5;
    this.lfo2Gain = context.createGain();
    this.lfo2Gain.gain.value = 0;
    this.lfo2.connect(this.lfo2Gain);
    this.lfo2.start();

    // Track the currently connected mod-matrix AudioParam connections so we can
    // disconnect them before reconnecting on each applyModMatrix call.
    this._modConnections = []; // [{lfoGain, param}]
  }

  // ——————————————————————————————————————————————
  // Mod Matrix
  // ——————————————————————————————————————————————

  /**
   * Apply mod-matrix routes to the Web Audio graph.
   * Only LFO sources are wired directly into AudioParams; other sources
   * (velocity, macros, etc.) are applied at note-trigger time in JS.
   *
   * @param {Array}  routes   — array of {sourceId, destId, trackIndex, amount, enabled}
   * @param {Array}  lfos     — lfo config objects [{rate, shape, amount, sync}]
   * @param {Array}  macros   — macro value objects [{value, color, name}]
   * @param {Object} trackBuses — optional map of trackIndex → { filter, gainNode, panNode }
   */
  applyModMatrix(routes, lfos, macros, trackBuses) {
    // Disconnect all previous mod connections
    if (this._modConnections) {
      this._modConnections.forEach(({ lfoGain, param }) => {
        try {
          lfoGain.disconnect(param);
        } catch (_) {}
      });
    }
    this._modConnections = [];

    if (!routes || !routes.length) return;

    // Update LFO oscillator settings from config
    if (lfos) {
      if (lfos[0]) {
        this.lfo1.frequency.value = lfos[0].rate ?? 1;
        try {
          this.lfo1.type = lfos[0].shape ?? 'sine';
        } catch (_) {}
      }
      if (lfos[1]) {
        this.lfo2.frequency.value = lfos[1].rate ?? 0.5;
        try {
          this.lfo2.type = lfos[1].shape ?? 'triangle';
        } catch (_) {}
      }
    }

    routes.forEach((route) => {
      if (!route.enabled) return;

      // Resolve the source to an LFO gain node (only LFOs have AudioNode outputs)
      let lfoGain = null;
      if (route.sourceId === 'lfo1') lfoGain = this.lfo1Gain;
      else if (route.sourceId === 'lfo2') lfoGain = this.lfo2Gain;
      if (!lfoGain) return; // Non-LFO sources are handled in JS at trigger time

      // Scale the gain by the route amount
      lfoGain.gain.value = route.amount;

      // Resolve the destination AudioParam
      const param = this._resolveModParam(route.destId, route.trackIndex, trackBuses);
      if (!param) return;

      try {
        lfoGain.connect(param);
        this._modConnections.push({ lfoGain, param });
      } catch (_) {}
    });
  }

  /**
   * Resolve a mod destination ID to an AudioParam.
   * Returns null if no suitable param is available.
   */
  _resolveModParam(destId, trackIndex, trackBuses) {
    switch (destId) {
      case 'master_reverb':
        return this.reverbConvWet?.gain ?? null;
      case 'master_delay':
        return this.delayWet2?.gain ?? null;
      case 'master_cutoff':
        return this.delayFilter?.frequency ?? null;
      case 'group_volume':
        return this.groupBuses?.[trackIndex ?? 0]?.gain ?? null;
      default: {
        // Per-track destinations — needs live voice params (not available at
        // static graph time). Store the destination for note-trigger pickup.
        return null;
      }
    }
  }

  // ——————————————————————————————————————————————
  // Send/return delay bus controls
  // ——————————————————————————————————————————————

  setDelayTime(s) {
    this.delayNode.delayTime.setTargetAtTime(Math.max(0.001, Math.min(1.3, s)), this.context.currentTime, 0.01);
  }

  setDelayFeedback(v) {
    this.delayFeedback2.gain.setTargetAtTime(Math.max(0, Math.min(0.85, v)), this.context.currentTime, 0.01);
  }

  setDelayFilter(freq) {
    this.delayFilter.frequency.setTargetAtTime(Math.max(500, Math.min(20000, freq)), this.context.currentTime, 0.01);
  }

  setDelayMix(v) {
    this.delayWet2.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.context.currentTime, 0.01);
  }

  setMasterLevel(v) {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.context.currentTime, 0.01);
  }

  // Stereo width control: adjusts the master StereoPanner pan value.
  // val: -1 (full left) → 0 (centre) → 1 (full right).
  setMasterWidth(val) {
    if (!this.masterPan) return;
    this.masterPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, val)), this.context.currentTime, 0.01);
  }

  setCueGain(v) {
    const next = Math.max(0, Math.min(2, v));
    this.cueMonitor.gain.setTargetAtTime(next, this.context.currentTime, 0.01);
  }

  setCueMonitorEnabled(enabled) {
    this.cueMonitorGate.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, 0.01);
  }

  // Set the global maximum voice ceiling (absolute cap across all per-track maxVoices)
  setMaxVoicesGlobal(n) {
    this._maxVoicesGlobal = Math.max(1, Math.round(n));
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
    if (knee !== undefined) c.knee.setTargetAtTime(knee, t, 0.01);
    if (ratio !== undefined) c.ratio.setTargetAtTime(ratio, t, 0.01);
    if (attack !== undefined) c.attack.setTargetAtTime(attack, t, 0.01);
    if (release !== undefined) c.release.setTargetAtTime(release, t, 0.01);
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
      load('/src/worklets/bitcrusher-worklet.js', '_bitcrusherReady'),
      load('/src/worklets/plaits-worklet.js', '_plaitsReady'),
      load('/src/worklets/clouds-worklet.js', '_cloudsReady'),
      load('/src/worklets/rings-worklet.js', '_ringsReady'),
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

  _resolveLfoDepthAmount(target, depth, { cutoff = 800, loudness = 1 } = {}) {
    const amt = Math.max(0, depth ?? 0);
    switch (target) {
      case 'cutoff':
        return amt * Math.max(250, Math.min(6000, cutoff * 1.25));
      case 'volume':
        return amt * Math.max(0.08, loudness * 0.6);
      case 'pan':
        return Math.min(1, amt);
      case 'pitch':
        return amt * 120;
      default:
        return amt;
    }
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
    osc.type = 'sine';
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
      try {
        oldest.stop(this.context.currentTime + 0.01);
      } catch (_) {}
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
    if (curve === 'exp') finalVel = Math.pow(velScale, 2);
    if (curve === 'comp') finalVel = Math.pow(velScale, 0.5);
    const loudness = (accent ? 1.22 : 1) * params.volume * finalVel * (params.inputGain ?? 1.0);

    // Crossfader comes from the track's stored crossfader value or falls back to 0.5
    const crossfader = typeof params.crossfader === 'number' ? params.crossfader : 0.5;

    const sceneA = params.sceneA ?? { cutoff: 3200, decay: 0.28, delaySend: 0.24 };
    const sceneB = params.sceneB ?? { cutoff: 6400, decay: 0.8, delaySend: 0.45 };
    const cutoff = this.interpolateScene(sceneA.cutoff, sceneB.cutoff, crossfader);
    const decayTime = this.interpolateScene(sceneA.decay, sceneB.decay, crossfader);
    // Per-step gate (0.05–1.0) scales how long the note sustains before release
    const stepGate = Math.max(0.05, Math.min(1, params.gate ?? 0.5));
    const gate = Math.max(stepDuration * params.noteLength * stepGate, params.attack + 0.01);
    const totalTime = gate + decayTime;

    // Sidechain ducking — when this track is the sidechain source, duck sidechainGain.
    // Uses params.sidechainAmount (from track state) so changes take effect immediately.
    if (params.isSidechainSource && this._sidechainEnabled) {
      const amount = typeof params.sidechainAmount === 'number' ? params.sidechainAmount : this._sidechainAmount;
      const scGain = this.sidechainGain.gain;
      const floor = 1 - Math.max(0, Math.min(1, amount)); // target duck level (e.g. 0.2)
      const releaseS = this._sidechainRelease / 1000; // ms → seconds
      scGain.cancelScheduledValues(when);
      scGain.setValueAtTime(1, when); // ensure we start from 1
      scGain.setTargetAtTime(floor, when, 0.003); // fast attack (~3 ms time constant)
      scGain.setTargetAtTime(1, when + 0.01, releaseS / 3); // recover over release window
    }

    // MIDI machine — skip audio, send MIDI note
    if (params.machine === 'midi') {
      this.sendMidiNote(params, note ?? 60, loudness, totalTime);
      return;
    }

    // MIDI note output — send on the track's assigned MIDI channel for all non-MIDI machines
    if (this.midiOutput && track.midiChannel) {
      const ch = (track.midiChannel - 1) & 0x0f;
      const noteNum = options.note ?? params.pitch ?? track.note ?? 60;
      const vel = Math.round((options.velocity ?? 1) * 127);
      const delayMs = Math.max(0, (when - this.context.currentTime) * 1000);
      const gateDurMs = (params.gate ?? 0.5) * (60000 / this._bpm / 4) * 4;
      setTimeout(() => {
        try {
          this.midiOutput.send([0x90 | ch, noteNum, vel]);
          setTimeout(() => {
            try {
              this.midiOutput.send([0x80 | ch, noteNum, 0]);
            } catch (e) {}
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

    const VALID_FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf'];
    const filter = this.context.createBiquadFilter();
    filter.type = VALID_FILTER_TYPES.includes(params.filterType) ? params.filterType : 'lowpass';
    filter.frequency.value = cutoff;
    // filterQ is the dedicated Q/resonance param; fall back to legacy resonance field
    filter.Q.value = params.filterQ ?? params.resonance ?? 1.0;

    const saturator = this.context.createWaveShaper();
    saturator.curve = this.getDriveCurve(params.drive);
    saturator.oversample = '2x';

    // Bit-crusher — inserted between output and panner when bitDepth < 32 or srDiv > 1
    // bitDepth 32 = off (full resolution), lower values quantize to 2^bitDepth levels.
    const bitDepth = params.bitDepth ?? 32;
    const srDiv = params.srDiv ?? 1;
    const needsCrusher = bitDepth < 32 || srDiv > 1;

    // Per-trigger 3-band EQ (lowShelf / peaking / highShelf).
    // Only created when at least one band has a non-trivial gain (abs > 0.1 dB).
    const eqLow = params.eqLow ?? 0;
    const eqMid = params.eqMid ?? 0;
    const eqHigh = params.eqHigh ?? 0;
    const needsEQ = Math.abs(eqLow) > 0.1 || Math.abs(eqMid) > 0.1 || Math.abs(eqHigh) > 0.1;

    // eqTail is the node that should connect to the panner (either a plain output
    // node, the last EQ shelf, or the crusher when that is also present).
    let eqTail = output;

    if (needsCrusher) {
      if (this._bitcrusherReady && typeof AudioWorkletNode === 'function') {
        try {
          const crusher = new AudioWorkletNode(this.context, 'cs-bitcrusher', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
          });
          crusher.port.postMessage({ type: 'config', bitDepth, srDiv });
          output.connect(crusher);
          eqTail = crusher;
        } catch (error) {
          console.warn('[CONFUstudio] Bitcrusher worklet failed, falling back to ScriptProcessorNode:', error);
        }
      }

      if (eqTail === output) {
        const crusher = this.context.createScriptProcessor(256, 2, 2);
        const step = Math.pow(2, bitDepth);
        const held = [0, 0];
        let sampleCount = 0;

        crusher.onaudioprocess = (e) => {
          const inputL = e.inputBuffer.numberOfChannels > 0 ? e.inputBuffer.getChannelData(0) : null;
          const inputR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inputL;
          const outL = e.outputBuffer.getChannelData(0);
          const outR = e.outputBuffer.numberOfChannels > 1 ? e.outputBuffer.getChannelData(1) : outL;
          for (let i = 0; i < outL.length; i++) {
            if (sampleCount % srDiv === 0) {
              held[0] = Math.round((inputL?.[i] ?? 0) * step) / step;
              held[1] = Math.round((inputR?.[i] ?? held[0]) * step) / step;
            }
            outL[i] = held[0];
            if (outR !== outL) outR[i] = held[1];
            sampleCount++;
          }
        };

        output.connect(crusher);
        eqTail = crusher;
      }
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

    // Stereo width via M-S processing: 0=mono, 1=normal (bypass), 2=wide
    const stereoWidth = params.stereoWidth ?? 1;
    if (Math.abs(stereoWidth - 1) < 0.02) {
      // Normal width — bypass
      panner.connect(filter);
    } else {
      const w = Math.max(0, Math.min(2, stereoWidth));
      const splitter = this.context.createChannelSplitter(2);
      const merger = this.context.createChannelMerger(2);
      panner.connect(splitter);

      if (w < 0.02) {
        // Mono: sum both channels into both outputs
        splitter.connect(merger, 0, 0);
        splitter.connect(merger, 0, 1);
        splitter.connect(merger, 1, 0);
        splitter.connect(merger, 1, 1);
      } else {
        // M-S: L' = L*(1+w)/2 + R*(1-w)/2,  R' = L*(1-w)/2 + R*(1+w)/2
        const llGain = this.context.createGain();
        llGain.gain.value = (1 + w) / 2;
        const lrGain = this.context.createGain();
        lrGain.gain.value = (1 - w) / 2;
        const rlGain = this.context.createGain();
        rlGain.gain.value = (1 - w) / 2;
        const rrGain = this.context.createGain();
        rrGain.gain.value = (1 + w) / 2;
        // L source (splitter output 0) feeds both L and R output channels
        splitter.connect(llGain, 0, 0);
        llGain.connect(merger, 0, 0); // L->L main
        splitter.connect(lrGain, 0, 0);
        lrGain.connect(merger, 0, 1); // L->R cross
        // R source (splitter output 1) feeds both L and R output channels
        splitter.connect(rlGain, 1, 0);
        rlGain.connect(merger, 0, 0); // R->L cross
        splitter.connect(rrGain, 1, 0);
        rrGain.connect(merger, 0, 1); // R->R main
      }
      merger.connect(filter);
    }

    // Determine output bus for this track's dry signal and sends.
    // Group-assigned tracks route through their group compressor/pan/gain chain.
    // All buses ultimately route through sidechainGain so ducking applies to all audio.
    const gi = params.groupIndex;
    const busTarget =
      gi != null && this.groupCompressors[gi]
        ? this.groupCompressors[gi]
        : params.outputBus === 'bus1'
          ? this.bus1
          : params.outputBus === 'bus2'
            ? this.bus2
            : this.sidechainGain;

    filter.connect(saturator);
    saturator.connect(busTarget);

    // CUE pre-fader listen — tap after insert processing but before the master bus.
    if (params.cue) {
      const cueSend = this.context.createGain();
      cueSend.gain.value = 1;
      saturator.connect(cueSend);
      cueSend.connect(this.cueOutput);
    }

    const delaySendGain = this.interpolateScene(sceneA.delaySend, sceneB.delaySend, crossfader);
    const delaySend = this.context.createGain();
    delaySend.gain.value = delaySendGain;
    saturator.connect(delaySend);
    delaySend.connect(this.delaySendBus);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = params.reverbSend;
    saturator.connect(reverbSend);
    reverbSend.connect(this.reverb); // this.reverb === this.reverbInput

    // Per-track send buses — feed into convolution reverb and send/return delay.
    // Connect the ephemeral saturator directly to the persistent send gain nodes;
    // Web Audio will disconnect/GC the source automatically once all references drop.
    const trackIdx = options.trackIndex;
    if (trackIdx != null) {
      const convSendGain = this._trackReverbSendGains[trackIdx];
      if (convSendGain) saturator.connect(convSendGain);
      const dly2SendGain = this._trackDelaySendGains[trackIdx];
      if (dly2SendGain) saturator.connect(dly2SendGain);
    }

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
      trigLFO.type = 'sine';
      trigLFO.frequency.value = params.lfoRate ?? 2;

      // Legacy single-target routing via lfoTarget
      if (lfoActive) {
        const lfoGain = this.context.createGain();
        trigLFO.connect(lfoGain);
        if (params.lfoTarget === 'cutoff') {
          lfoGain.gain.value = this._resolveLfoDepthAmount('cutoff', params.lfoDepth, {
            cutoff: params.cutoff,
            loudness,
          });
          lfoGain.connect(filter.frequency);
        } else if (params.lfoTarget === 'volume') {
          lfoGain.gain.value = this._resolveLfoDepthAmount('volume', params.lfoDepth, {
            cutoff: params.cutoff,
            loudness,
          });
          lfoGain.connect(output.gain);
        } else if (params.lfoTarget === 'pan') {
          lfoGain.gain.value = this._resolveLfoDepthAmount('pan', params.lfoDepth, { cutoff: params.cutoff, loudness });
          lfoGain.connect(panner.pan);
        } else if (params.lfoTarget === 'pitch') {
          lfoGain.gain.value = this._resolveLfoDepthAmount('pitch', params.lfoDepth, {
            cutoff: params.cutoff,
            loudness,
          });
          // pitch routing needs osc.detune — deferred to after osc creation below
          trigLFO._pitchGain = lfoGain;
        }
      }

      // Multi-destination routing flags
      if (params.lfoToCutoff) {
        const g = this.context.createGain();
        g.gain.value = this._resolveLfoDepthAmount('cutoff', params.lfoDepth, { cutoff: params.cutoff, loudness });
        trigLFO.connect(g);
        g.connect(filter.frequency);
      }
      if (params.lfoToVolume) {
        const g = this.context.createGain();
        g.gain.value = this._resolveLfoDepthAmount('volume', params.lfoDepth, { cutoff: params.cutoff, loudness });
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
          type: 'trigger',
          engine: params.plEngine ?? 0,
          frequency: 440 * Math.pow(2, ((note || 69) - 69) / 12),
          timbre: params.plTimbre ?? 0.5,
          harmonics: params.plHarmonics ?? 0.5,
          morph: params.plMorph ?? 0.5,
          sampleRate: this.context.sampleRate,
        });
        node.connect(output);
        // Worklet voice: wrap stop in a plain object so _registerVoice can steal it
        const voiceHandle = {
          stop: (t) => {
            node.port.postMessage({ type: 'stop' });
            try {
              node.disconnect();
            } catch (_) {}
          },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        setTimeout(
          () => {
            node.port.postMessage({ type: 'stop' });
            try {
              node.disconnect();
            } catch (_) {}
            if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
          },
          (totalTime + 0.3) * 1000,
        );
        return;
      } catch (_) {}
    }

    // Clouds granular
    if (params.machine === 'clouds' && this._cloudsReady) {
      try {
        const node = new AudioWorkletNode(this.context, 'cs-clouds');
        if (params.sampleBuffer) {
          const ch = params.sampleBuffer.getChannelData(0);
          const copy = ch.buffer.slice(0);
          node.port.postMessage(
            {
              type: 'load',
              buffer: copy,
              sampleRate: params.sampleBuffer.sampleRate,
              ctxRate: this.context.sampleRate,
            },
            [copy],
          );
        }
        node.port.postMessage({
          type: 'trigger',
          position: params.clPosition ?? 0.5,
          size: params.clSize ?? 0.3,
          density: params.clDensity ?? 0.5,
          texture: params.clTexture ?? 0.5,
          pitch: Math.pow(2, ((note || 60) - 60) / 12),
          duration: totalTime,
        });
        node.connect(output);
        const voiceHandle = {
          stop: () => {
            node.port.postMessage({ type: 'stop' });
            try {
              node.disconnect();
            } catch (_) {}
          },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        setTimeout(
          () => {
            node.port.postMessage({ type: 'stop' });
            try {
              node.disconnect();
            } catch (_) {}
            if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
          },
          (totalTime + 0.5) * 1000,
        );
        return;
      } catch (_) {}
    }

    // Rings modal resonator
    if (params.machine === 'rings' && this._ringsReady) {
      try {
        const node = new AudioWorkletNode(this.context, 'cs-rings');
        node.port.postMessage({
          type: 'trigger',
          frequency: 440 * Math.pow(2, ((note || 69) - 69) / 12),
          structure: params.rnStructure ?? 0.5,
          brightness: params.rnBrightness ?? 0.7,
          damping: params.rnDamping ?? 0.7,
          exciter: params.rnExciter ?? 0,
          sampleRate: this.context.sampleRate,
        });
        node.connect(output);
        const voiceHandle = {
          stop: () => {
            node.port.postMessage({ type: 'stop' });
            try {
              node.disconnect();
            } catch (_) {}
          },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        setTimeout(
          () => {
            node.port.postMessage({ type: 'stop' });
            try {
              node.disconnect();
            } catch (_) {}
            if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
          },
          (totalTime + 0.5) * 1000,
        );
        return;
      } catch (_) {}
    }

    // Sample machine
    if (params.machine === 'sample' && params.sampleBuffer) {
      const sampleStart = params.sampleStart ?? 0;
      const sampleEnd = Math.max(sampleStart + 0.001, params.sampleEnd ?? 1);
      const bufDur = params.sampleBuffer.duration;
      const offsetSec = bufDur * sampleStart;
      const clipDur = bufDur * (sampleEnd - sampleStart);

      // Key tracking: when enabled, pitch the sample relative to its stored root note
      // (params.note, set by auto-detect or manually). playbackRate = 2^((played-root)/12).
      // When key tracking is off, play at unity (1.0) regardless of the sequencer note.
      const samplePlaybackRate = params.keyTracking
        ? Math.pow(2, ((note ?? params.note ?? 60) - (params.note ?? 60)) / 12)
        : 1;

      if (this._workletReady) {
        // High-quality 4-point Hermite resampler via AudioWorklet
        const channelCount = Math.max(1, Math.min(2, params.sampleBuffer.numberOfChannels || 1));
        const node = new AudioWorkletNode(this.context, 'cs-resampler', {
          outputChannelCount: [channelCount],
        });
        const leftData = params.sampleBuffer.getChannelData(0);
        const rightData = channelCount > 1 ? params.sampleBuffer.getChannelData(1) : null;
        const sr = params.sampleBuffer.sampleRate;
        const ctxRate = this.context.sampleRate;
        const startSample = Math.floor(offsetSec * sr);
        const endSample = Math.min(leftData.length, Math.floor(bufDur * sampleEnd * sr));
        const leftSlice = params.loopEnabled
          ? leftData.buffer.slice(0)
          : leftData.buffer.slice(
              startSample * Float32Array.BYTES_PER_ELEMENT,
              endSample * Float32Array.BYTES_PER_ELEMENT,
            );
        const rightSlice = rightData
          ? params.loopEnabled
            ? rightData.buffer.slice(0)
            : rightData.buffer.slice(
                startSample * Float32Array.BYTES_PER_ELEMENT,
                endSample * Float32Array.BYTES_PER_ELEMENT,
              )
          : null;
        const loopEnabled = !!params.loopEnabled;
        const loopStart = Math.max(0, Math.min(bufDur, (params.loopStart ?? 0) * bufDur));
        const loopEnd = Math.max(loopStart + 0.001, Math.min(bufDur, (params.loopEnd ?? 1) * bufDur));
        node.port.postMessage(
          {
            type: 'load',
            channels: rightSlice ? [leftSlice, rightSlice] : [leftSlice],
            playbackRate: samplePlaybackRate,
            sampleRate: sr,
            ctxRate,
            loopEnabled,
            loopStart: loopEnabled ? loopStart : 0,
            loopEnd: loopEnabled ? loopEnd : 0,
            position: loopEnabled ? startSample : 0,
          },
          rightSlice ? [leftSlice, rightSlice] : [leftSlice],
        );
        node.connect(output);
        const voiceHandle = {
          stop: () => {
            try {
              node.disconnect();
            } catch (_) {}
          },
          _worklet: true,
        };
        this._registerVoice(trackKey, voiceHandle, params.maxVoices ?? 8);
        // Disconnect after playback completes — no BufferSource stop() equivalent
        setTimeout(
          () => {
            try {
              node.disconnect();
            } catch (e) {}
            if (voiceHandle._voiceCleanup) voiceHandle._voiceCleanup();
          },
          (totalTime + 0.1) * 1000,
        );
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
          source.loopEnd = (params.loopEnd ?? 1) * bufDurForLoop;
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
    if (params.machine === 'noise') {
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
    const wf = WAVEFORMS.includes(params.waveform) ? params.waveform : 'triangle';
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
      osc.type = accent ? 'sawtooth' : wf;
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
          g.gain.value = this._resolveLfoDepthAmount('pitch', params.lfoDepth, { cutoff: params.cutoff, loudness });
          trigLFO.connect(g);
          g.connect(osc.detune);
        }
      }

      if (params.legato) {
        this._legatoSources.set(legatoKey, { osc, output, stopAt: when + totalTime + 0.02 });
        // Clean up entry after note ends
        setTimeout(
          () => {
            const cur = this._legatoSources.get(legatoKey);
            if (cur && cur.osc === osc) this._legatoSources.delete(legatoKey);
          },
          (totalTime + 0.1) * 1000,
        );
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

    return navigator
      .requestMIDIAccess({ sysex: false })
      .then((midiAccess) => {
        this._midiAccess = midiAccess;
        attachInputs(midiAccess);
        midiAccess.onstatechange = () => attachInputs(midiAccess);
        return midiAccess;
      })
      .catch((err) => {
        console.warn('WebMIDI input unavailable:', err);
        return null;
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
    this._midiStopCallback = onStop;
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
    this.masterEQLow.gain.setTargetAtTime(low, t, 0.01);
    this.masterEQMid.gain.setTargetAtTime(mid, t, 0.01);
    this.masterEQHigh.gain.setTargetAtTime(high, t, 0.01);
  }

  // Chorus controls
  setChorusRate(v) {
    this.chorusLFO.frequency.setTargetAtTime(v, this.context.currentTime, 0.01);
  }
  setChorusDepth(v) {
    this.chorusDepthGain.gain.setTargetAtTime(v * 0.02, this.context.currentTime, 0.01);
  }
  setChorusMix(v) {
    this.chorusWet.gain.setTargetAtTime(v, this.context.currentTime, 0.01);
  }

  // Chorus stereo width (0 = mono, 1 = full stereo spread).
  // Moves the L/R panner pair symmetrically: width 0 → pan 0 (mono), width 1 → pan ±1.
  setChorusWidth(v) {
    v = Math.max(0, Math.min(1, v));
    const t = this.context.currentTime;
    if (this._chorusPanL) this._chorusPanL.pan.setTargetAtTime(-v, t, 0.01);
    if (this._chorusPanR) this._chorusPanR.pan.setTargetAtTime(v, t, 0.01);
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

  // Group bus controls — gi = 0..7
  setGroupVolume(gi, val) {
    if (this.groupBuses[gi]) this.groupBuses[gi].gain.value = Math.max(0, val);
  }
  setGroupPan(gi, val) {
    if (this.groupPans[gi]) this.groupPans[gi].pan.value = Math.max(-1, Math.min(1, val));
  }
  setGroupMute(gi, muted) {
    if (this.groupBuses[gi]) this.groupBuses[gi].gain.value = muted ? 0 : 1;
  }

  // Send a MIDI Program Change on the given 1-based channel.
  sendProgramChange(channel, program) {
    if (!this.midiOutput) return;
    this.midiOutput.send([0xc0 | ((channel - 1) & 0x0f), program & 0x7f]);
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
    try {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
    } catch (e) {}
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.005);
    setTimeout(() => {
      this.master.gain.setTargetAtTime(0.82, ctx.currentTime, 0.05);
    }, 80);
    if (this.midiOutput) {
      for (let ch = 0; ch < 16; ch++) {
        try {
          this.midiOutput.send([0xb0 | ch, 123, 0]);
        } catch (e) {}
        try {
          this.midiOutput.send([0xb0 | ch, 120, 0]);
        } catch (e) {}
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

attachReverbMethods(AudioEngine.prototype);
attachMidiMethods(AudioEngine.prototype);

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
  const ctx = canvas.getContext('2d');
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
