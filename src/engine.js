// CONFUsynth v3 — AudioEngine module
// Extracted and enhanced from app.js

const WAVEFORMS = ["sine", "triangle", "sawtooth", "square"];

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

    // Reverb
    this.reverb = context.createConvolver();
    this.reverb.buffer = this.createImpulseResponse();
    this.reverbWet = context.createGain();
    this.reverbWet.gain.value = 0.22;

    // MIDI output (set externally or via sendMidiNote)
    this.midiOutput = null;

    // Routing
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.master);
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.master);

    this.master.connect(this.analyser);
    this.analyser.connect(context.destination);

    // Shared noise buffer — pre-created once, looped per trigger (not per-note allocation)
    this._noiseBuffer = this.createNoiseBuffer(2);
  }

  // ——————————————————————————————————————————————
  // Audio init helpers
  // ——————————————————————————————————————————————

  createImpulseResponse() {
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * 1.8);
    const buffer = this.context.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.4);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    return buffer;
  }

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
    //   saturator → reverbSend → reverb → reverbWet → master

    const output = this.context.createGain();
    output.gain.value = 0.0001;

    const panner = this.context.createStereoPanner();
    panner.pan.value = params.pan;

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
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
    reverbSend.connect(this.reverb);

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

    // Sample machine
    if (params.machine === "sample" && params.sampleBuffer) {
      const source = this.context.createBufferSource();
      source.buffer = params.sampleBuffer;
      source.playbackRate.value = Math.pow(2, ((note || 48) - 48) / 12);
      source.connect(output);
      source.start(when, 0, Math.min(totalTime, params.sampleBuffer.duration));
      source.stop(when + totalTime + 0.02);
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
      ctx.fillStyle = "#0a0b0d";
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(90,221,113,0.3)";
      ctx.lineWidth = 1;
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      animRef.id = requestAnimationFrame(loop);
      return;
    }

    const analyser = engine.analyser;
    const bufLen = analyser.frequencyBinCount;

    // Preallocate / resize only when necessary
    if (!_oscDataBuffer || _oscDataBuffer.length !== bufLen) {
      _oscDataBuffer = new Uint8Array(bufLen);
    }

    analyser.getByteTimeDomainData(_oscDataBuffer);
    const data = _oscDataBuffer;

    ctx.fillStyle = "#080a0c";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / 4) * g);
      ctx.lineTo(W, (H / 4) * g);
      ctx.stroke();
    }

    // Waveform
    ctx.beginPath();
    ctx.strokeStyle = "#5add71";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#5add71";
    ctx.shadowBlur = 4;
    const sliceW = W / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128;
      const y = (v * H) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceW;
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
