// CONFUsynth — cs-plaits AudioWorkletProcessor
// 5-engine synthesizer: VA, Wavetable, FM2, Karplus-Strong, Chord

const TWO_PI = 2.0 * Math.PI;
const WT_SIZE = 2048;

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1.0; }
  if (t > 1.0 - dt) { t = (t - 1.0) / dt; return t * t + t + t + 1.0; }
  return 0.0;
}

class PlaitsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.params = {};

    this._initWavetables();
    this._initState();

    this.port.onmessage = (e) => {
      const { type } = e.data;
      if (type === 'trigger') {
        const { engine, frequency, timbre, harmonics, morph, sampleRate: sr } = e.data;
        this.params = {
          engine:     engine     !== undefined ? engine     : 0,
          frequency:  frequency  !== undefined ? frequency  : 440,
          timbre:     timbre     !== undefined ? timbre     : 0.5,
          harmonics:  harmonics  !== undefined ? harmonics  : 0.5,
          morph:      morph      !== undefined ? morph      : 0.0,
          sampleRate: sr         !== undefined ? sr         : sampleRate,
        };
        this._resetEngineState();
        this.active = true;
      } else if (type === 'stop') {
        this.active = false;
      }
    };
  }

  // ─── Wavetable init ──────────────────────────────────────────────────────────

  _initWavetables() {
    const N = WT_SIZE;
    this._wt = [
      new Float32Array(N), // WT0 sine
      new Float32Array(N), // WT1 additive saw
      new Float32Array(N), // WT2 additive square
      new Float32Array(N), // WT3 half-sine
    ];

    for (let i = 0; i < N; i++) {
      // WT0: pure sine
      this._wt[0][i] = Math.sin(TWO_PI * i / N);

      // WT1: additive saw (harmonics 1–12, amp = 1/k) * 0.6
      let saw = 0.0;
      for (let k = 1; k <= 12; k++) {
        saw += Math.sin(TWO_PI * k * i / N) / k;
      }
      this._wt[1][i] = saw * 0.6;

      // WT2: additive square (odd harmonics 1,3,5,7,9, amp = 1/k) * 0.75
      let sq = 0.0;
      for (let k = 1; k <= 9; k += 2) {
        sq += Math.sin(TWO_PI * k * i / N) / k;
      }
      this._wt[2][i] = sq * 0.75;

      // WT3: half-sine (bright formant)
      this._wt[3][i] = Math.abs(Math.sin(TWO_PI * i / N));
    }
  }

  // ─── Per-instance state ──────────────────────────────────────────────────────

  _initState() {
    // Engine 0 — VA
    this._e0Phase = 0.0;

    // Engine 1 — Wavetable
    this._e1Phase = 0.0;

    // Engine 2 — FM 2-op
    this._e2CarrierPhase = 0.0;
    this._e2ModPhase     = 0.0;

    // Engine 3 — Karplus-Strong
    this._e3DelayLine  = new Float32Array(8192);
    this._e3DelayLen   = 0;
    this._e3ReadPos    = 0;
    this._e3WritePos   = 0;

    // Engine 4 — Chord (4 VA oscillators)
    this._e4Phases = new Float32Array(4);
  }

  _resetEngineState() {
    const { engine, frequency, harmonics, timbre, sampleRate: sr } = this.params;

    // Reset phases for all engines
    this._e0Phase        = 0.0;
    this._e1Phase        = 0.0;
    this._e2CarrierPhase = 0.0;
    this._e2ModPhase     = 0.0;
    this._e4Phases[0]    = 0.0;
    this._e4Phases[1]    = 0.0;
    this._e4Phases[2]    = 0.0;
    this._e4Phases[3]    = 0.0;

    // Karplus-Strong — fill delay line with filtered noise on trigger
    if (engine === 3) {
      const len = Math.max(4, Math.min(8192, Math.round(sr / frequency)));
      this._e3DelayLen  = len;
      this._e3ReadPos   = 0;
      this._e3WritePos  = 0;

      const coeff = harmonics * 0.9 + 0.05;
      let lpState = 0.0;
      for (let i = 0; i < len; i++) {
        const noise = Math.random() * 2.0 - 1.0;
        lpState = lpState + coeff * (noise - lpState);
        this._e3DelayLine[i] = lpState;
      }
    }
  }

  // ─── Engine 0: Virtual Analog (PolyBLEP) ────────────────────────────────────

  _renderEngine0(output) {
    const { frequency, timbre, harmonics, morph, sampleRate: sr } = this.params;
    const dt = frequency / sr;
    const pw = 0.1 + timbre * 0.8; // pulse width 0.1–0.9
    let phase = this._e0Phase;

    for (let i = 0; i < 128; i++) {
      // Sawtooth
      const saw = 2.0 * phase - 1.0 - polyblep(phase, dt);

      // Pulse
      const shifted = (phase + 1.0 - pw) % 1.0;
      const pulse = (phase < pw ? 1.0 : -1.0) + polyblep(phase, dt) - polyblep(shifted, dt);

      output[i] = (1.0 - morph) * saw + morph * pulse;

      phase += dt;
      if (phase >= 1.0) phase -= 1.0;
    }

    this._e0Phase = phase;
  }

  // ─── Engine 1: Wavetable ─────────────────────────────────────────────────────

  _renderEngine1(output) {
    const { frequency, harmonics, morph, sampleRate: sr } = this.params;
    const N    = WT_SIZE;
    const phaseInc = N * frequency / sr;
    let phase = this._e1Phase;

    const tableIdx = harmonics * 3.0;
    const tLo      = Math.floor(tableIdx);
    const tHi      = Math.min(3, tLo + 1);
    const tFrac    = tableIdx - tLo;
    const wtLo     = this._wt[tLo];
    const wtHi     = this._wt[tHi];
    const wtBright = this._wt[3]; // WT3 for morph brightness

    for (let i = 0; i < 128; i++) {
      const p0  = Math.floor(phase) % N;
      const p1  = (p0 + 1) % N;
      const frac = phase - Math.floor(phase);

      // Linear interp within each table
      const sLo  = wtLo[p0]     + frac * (wtLo[p1]     - wtLo[p0]);
      const sHi  = wtHi[p0]     + frac * (wtHi[p1]     - wtHi[p0]);
      const sBr  = wtBright[p0] + frac * (wtBright[p1] - wtBright[p0]);

      // Blend adjacent tables by harmonics fractional part, then add morph brightness
      const blended = sLo + tFrac * (sHi - sLo);
      output[i]     = blended + morph * (sBr - blended);

      phase += phaseInc;
      if (phase >= N) phase -= N;
    }

    this._e1Phase = phase;
  }

  // ─── Engine 2: FM 2-op ───────────────────────────────────────────────────────

  _renderEngine2(output) {
    const { frequency, timbre, harmonics, morph, sampleRate: sr } = this.params;
    const modRatio  = 1 + Math.floor(harmonics * 6);   // 1–7
    const fmIndex   = morph * 8.0;                      // 0–8
    const modFreq   = frequency * modRatio;
    const carrierInc = frequency / sr;
    const modInc     = modFreq   / sr;

    let carrierPhase = this._e2CarrierPhase;
    let modPhase     = this._e2ModPhase;

    for (let i = 0; i < 128; i++) {
      // Modulator feedback
      const modFeedback = timbre * 0.3 * Math.sin(modPhase);
      modPhase += modInc + modFeedback;

      const modValue = Math.sin(TWO_PI * modPhase) * fmIndex;

      carrierPhase += carrierInc;
      output[i] = Math.sin(TWO_PI * carrierPhase + modValue);
    }

    // Wrap phases to avoid float precision drift
    this._e2CarrierPhase = carrierPhase % 1.0;
    this._e2ModPhase     = modPhase     % 1.0;
  }

  // ─── Engine 3: Karplus-Strong String ─────────────────────────────────────────

  _renderEngine3(output) {
    const { timbre, morph } = this.params;
    const len      = this._e3DelayLen;
    const dl       = this._e3DelayLine;
    let readPos    = this._e3ReadPos;
    let writePos   = this._e3WritePos;
    const dampCoeff = 0.996 - (1.0 - timbre) * 0.06;

    // Chorus offset: second read head at len * (1 + morph * 0.01)
    const chorusLen = len * (1.0 + morph * 0.01);

    for (let i = 0; i < 128; i++) {
      const sample = dl[readPos];

      // Chorus second read (linear interpolation)
      const chorusReadF = (readPos + chorusLen) % len;
      const cr0 = Math.floor(chorusReadF) % len;
      const cr1 = (cr0 + 1) % len;
      const cFrac = chorusReadF - Math.floor(chorusReadF);
      const chorusSample = dl[cr0] + cFrac * (dl[cr1] - dl[cr0]);

      output[i] = sample + 0.3 * chorusSample;

      // Averaging lowpass + damp
      const next = (dl[readPos] + dl[(readPos + 1) % len]) * 0.5 * dampCoeff;
      dl[writePos] = next;

      readPos  = (readPos  + 1) % len;
      writePos = (writePos + 1) % len;
    }

    this._e3ReadPos  = readPos;
    this._e3WritePos = writePos;
  }

  // ─── Engine 4: Chord ─────────────────────────────────────────────────────────

  _renderEngine4(output) {
    const { frequency, timbre, harmonics, morph, sampleRate: sr } = this.params;

    // Select chord type by timbre
    let intervals;
    if      (timbre < 0.2) intervals = [0,  4,  7, 12]; // Major
    else if (timbre < 0.4) intervals = [0,  3,  7, 12]; // Minor
    else if (timbre < 0.6) intervals = [0,  5,  7, 12]; // Sus4
    else if (timbre < 0.8) intervals = [0,  4,  7, 10]; // Dom7
    else                   intervals = [0,  4,  7, 11]; // Maj7

    // Detune multipliers per voice
    const detuneMultipliers = [0.0, 0.3, -0.2, 0.1];

    // Compute per-voice frequencies
    const voiceFreqs = new Float32Array(4);
    for (let v = 0; v < 4; v++) {
      let semitones = intervals[v];
      // Top voice octave transposition
      if (v === 3 && harmonics > 0.5) semitones += 12;
      // Detune
      semitones += morph * 0.3 * detuneMultipliers[v];
      voiceFreqs[v] = frequency * Math.pow(2.0, semitones / 12.0);
    }

    const phases = this._e4Phases;

    // Clear output
    for (let i = 0; i < 128; i++) output[i] = 0.0;

    // Render each voice
    for (let v = 0; v < 4; v++) {
      const freq = voiceFreqs[v];
      const dt   = freq / sr;
      let phase  = phases[v];

      for (let i = 0; i < 128; i++) {
        // PolyBLEP sawtooth
        const saw = 2.0 * phase - 1.0 - polyblep(phase, dt);
        output[i] += saw;

        phase += dt;
        if (phase >= 1.0) phase -= 1.0;
      }

      phases[v] = phase;
    }

    // Normalize 4 voices
    for (let i = 0; i < 128; i++) output[i] *= 0.25;
  }

  // ─── process ─────────────────────────────────────────────────────────────────

  process(_inputs, outputs) {
    if (!this.active) return false;

    const out = outputs[0][0];

    switch (this.params.engine) {
      case 0:  this._renderEngine0(out); break;
      case 1:  this._renderEngine1(out); break;
      case 2:  this._renderEngine2(out); break;
      case 3:  this._renderEngine3(out); break;
      case 4:  this._renderEngine4(out); break;
      default: this._renderEngine0(out);
    }

    return true;
  }
}

registerProcessor('cs-plaits', PlaitsProcessor);
