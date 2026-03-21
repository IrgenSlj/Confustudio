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

    // MIDI output (set externally or via sendMidiNote)
    this.midiOutput = null;
    this._midiClockInterval = null;

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

    this.master.connect(this.analyser);
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
      this.reverbInput.connect(delayNode);
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

  setReverbMix(v) {
    this.reverbWet.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.context.currentTime, 0.01);
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

  sendMidiNote(track, note, velocity, durationSec) {
    if (!this.midiOutput) return;
    const ch = (track.midiChannel - 1) & 0xf;
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
  // Preview (keyboard note preview — fires immediately)
  // ——————————————————————————————————————————————

  previewNote(track, note) {
    const when = this.context.currentTime;
    this.triggerTrack(track, when, 0.25, { note, accent: false, velocity: 1 });
  }

  // ——————————————————————————————————————————————
  // Trigger
  // ——————————————————————————————————————————————

  triggerTrack(track, when, stepDuration, options = {}) {
    // Merge paramLocks on top of track defaults
    const paramLocks = options.paramLocks || {};
    const params = { ...track, ...paramLocks };

    const accent = options.accent || false;
    const note = options.note ?? params.pitch;
    const velScale = options.velocity ?? 1;
    const loudness = (accent ? 1.22 : 1) * params.volume * velScale;

    // Crossfader comes from the track's stored crossfader value or falls back to 0.5
    const crossfader = typeof params.crossfader === "number" ? params.crossfader : 0.5;

    const cutoff = this.interpolateScene(params.sceneA.cutoff, params.sceneB.cutoff, crossfader);
    const decayTime = this.interpolateScene(params.sceneA.decay, params.sceneB.decay, crossfader);
    const gate = Math.max(stepDuration * params.noteLength, params.attack + 0.01);
    const totalTime = gate + decayTime;

    // MIDI machine — skip audio, send MIDI note
    if (params.machine === "midi") {
      this.sendMidiNote(params, note ?? 60, loudness, totalTime);
      return;
    }

    // Signal chain: source → output (ADSR env gain) → panner → filter → saturator → master
    //   saturator → delaySend → delay ↺ feedback
    //   saturator → reverbSend → reverbInput → reverb graph → reverbWet → master

    const output = this.context.createGain();
    output.gain.value = 0.0001;

    const panner = this.context.createStereoPanner();
    panner.pan.value = params.pan;

    const filter = this.context.createBiquadFilter();
    filter.type = params.filterType || "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = params.resonance;

    const saturator = this.context.createWaveShaper();
    saturator.curve = this.getDriveCurve(params.drive);
    saturator.oversample = "2x";

    output.connect(panner);
    panner.connect(filter);
    filter.connect(saturator);
    saturator.connect(this.master);

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

    // LFO modulation
    if (params.lfoDepth > 0.001) {
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
      lfo.type = "sine";
      lfo.frequency.value = params.lfoRate;
      lfo.connect(lfoGain);
      if (params.lfoTarget === "cutoff") {
        lfoGain.gain.value = params.lfoDepth * 2500;
        lfoGain.connect(filter.frequency);
      } else if (params.lfoTarget === "volume") {
        lfoGain.gain.value = params.lfoDepth * loudness * 0.7;
        lfoGain.connect(output.gain);
      } else if (params.lfoTarget === "pan") {
        lfoGain.gain.value = params.lfoDepth;
        lfoGain.connect(panner.pan);
      }
      lfo.start(when);
      lfo.stop(when + totalTime + 0.05);
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
        setTimeout(() => {
          node.port.postMessage({ type: 'stop' });
          try { node.disconnect(); } catch (_) {}
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
        setTimeout(() => {
          node.port.postMessage({ type: 'stop' });
          try { node.disconnect(); } catch (_) {}
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
        setTimeout(() => {
          node.port.postMessage({ type: 'stop' });
          try { node.disconnect(); } catch (_) {}
        }, (totalTime + 0.5) * 1000);
        return;
      } catch (_) {}
    }

    // Sample machine
    if (params.machine === "sample" && params.sampleBuffer) {
      if (this._workletReady) {
        // High-quality 4-point Hermite resampler via AudioWorklet
        const node = new AudioWorkletNode(this.context, 'cs-resampler');
        const channelData = params.sampleBuffer.getChannelData(0);
        const copy = channelData.buffer.slice(0); // transferable copy
        const playbackRate = Math.pow(2, ((note || 48) - 48) / 12);
        const duration = params.sampleBuffer.duration / playbackRate;
        node.port.postMessage(
          { type: 'load', buffer: copy, playbackRate, sampleRate: params.sampleBuffer.sampleRate, ctxRate: this.context.sampleRate },
          [copy]
        );
        node.connect(output);
        // Disconnect after playback completes — no BufferSource stop() equivalent
        setTimeout(() => { try { node.disconnect(); } catch (e) {} }, (totalTime + 0.1) * 1000);
      } else {
        // Fallback: native BufferSourceNode (browser linear interpolation)
        const source = this.context.createBufferSource();
        source.buffer = params.sampleBuffer;
        source.playbackRate.value = Math.pow(2, ((note || 48) - 48) / 12);
        source.connect(output);
        source.start(when, 0, Math.min(totalTime, params.sampleBuffer.duration));
        source.stop(when + totalTime + 0.02);
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
      return;
    }

    // Tone machine (default)
    const osc = this.context.createOscillator();
    const wf = WAVEFORMS.includes(params.waveform) ? params.waveform : "triangle";
    osc.type = accent ? "sawtooth" : wf;
    osc.frequency.value = 440 * Math.pow(2, ((note || 69) - 69) / 12);
    osc.connect(output);
    osc.start(when);
    osc.stop(when + totalTime + 0.02);
  }
}

// ——————————————————————————————————————————————
// OSCILLOSCOPE
// Preallocated buffer — not new Uint8Array per rAF frame
// ——————————————————————————————————————————————

let _oscDataBuffer = null;

/**
 * drawOscilloscope(canvas, engine, animRef)
 *
 * @param {HTMLCanvasElement} canvas
 * @param {AudioEngine|null} engine
 * @param {{id: number|null}} animRef — caller-owned object storing the rAF id
 */
export function drawOscilloscope(canvas, engine, animRef) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

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
