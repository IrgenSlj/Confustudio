// CONFUsynth — cs-rings AudioWorkletProcessor
// Modal resonator — 8-mode biquad bank with impulse/noise/bow exciters

class RingsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Filter coefficients (computed on trigger)
    this.b0 = new Float32Array(8);
    this.b1 = new Float32Array(8);
    this.b2 = new Float32Array(8);
    this.a1 = new Float32Array(8);
    this.a2 = new Float32Array(8);

    // Filter state (zeroed on trigger)
    this.x1 = new Float32Array(8);
    this.x2 = new Float32Array(8);
    this.y1 = new Float32Array(8);
    this.y2 = new Float32Array(8);

    // Mode amplitudes (computed on trigger)
    this.amplitude = new Float32Array(8);

    // Exciter state
    this.exciterType = 0;
    this.exciterRemaining = 0;
    this.exciterFrequency = 440;
    this.exciterPhase = 0;
    this.exciterSampleRate = 44100;

    // Noise burst one-pole highpass state
    this.hpY = 0;
    this.hpX = 0;

    // Active flag
    this.active = false;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'trigger') {
        this._handleTrigger(data);
      } else if (data.type === 'stop') {
        this.active = false;
        this.exciterRemaining = 0;
      }
    };
  }

  _handleTrigger(data) {
    const {
      frequency,
      structure,
      brightness,
      damping,
      exciter,
      sampleRate
    } = data;

    this.exciterType = exciter;
    this.exciterFrequency = frequency;
    this.exciterSampleRate = sampleRate;
    this.exciterPhase = 0;
    this.hpY = 0;
    this.hpX = 0;

    // Set exciter duration
    if (exciter === 0) {
      this.exciterRemaining = 1;
    } else if (exciter === 1) {
      this.exciterRemaining = Math.round(0.015 * sampleRate);
    } else {
      // Bow: continuous until stop
      this.exciterRemaining = 0x7fffffff;
    }

    // Compute resonator frequencies
    // fi = f0 * (i+1)^(1 + structure * 1.4)
    const maxFreq = sampleRate * 0.45;
    for (let i = 0; i < 8; i++) {
      let fi = frequency * Math.pow(i + 1, 1 + structure * 1.4);
      if (fi < 20) fi = 20;
      if (fi > maxFreq) fi = maxFreq;

      // Per-mode amplitude
      this.amplitude[i] = Math.pow(1 - brightness, i * 0.6 + 0.5) * 2;

      // Q factor
      const Q = 80 * Math.pow(1 - damping, 1.5) + 2;

      // Biquad bandpass coefficients
      const w0 = 2 * Math.PI * fi / sampleRate;
      const sinW0 = Math.sin(w0);
      const cosW0 = Math.cos(w0);
      const alpha = sinW0 / (2 * Q);

      const a0 = 1 + alpha;
      this.b0[i] = alpha / a0;
      this.b1[i] = 0;
      this.b2[i] = -alpha / a0;
      this.a1[i] = (-2 * cosW0) / a0;
      this.a2[i] = (1 - alpha) / a0;
    }

    // Normalize amplitudes so sum = 1
    let ampSum = 0;
    for (let i = 0; i < 8; i++) {
      ampSum += this.amplitude[i];
    }
    if (ampSum > 0) {
      for (let i = 0; i < 8; i++) {
        this.amplitude[i] /= ampSum;
      }
    }

    // Zero filter state
    for (let i = 0; i < 8; i++) {
      this.x1[i] = 0;
      this.x2[i] = 0;
      this.y1[i] = 0;
      this.y2[i] = 0;
    }

    this.active = true;
  }

  _nextExciterSample() {
    if (this.exciterRemaining <= 0) {
      return 0;
    }

    this.exciterRemaining--;

    if (this.exciterType === 0) {
      // Impulse: single 1.0 sample
      return 1.0;
    } else if (this.exciterType === 1) {
      // Noise burst with one-pole highpass
      const raw = Math.random() * 2 - 1;
      const y = 0.8 * (this.hpY + raw - this.hpX);
      this.hpX = raw;
      this.hpY = y;
      return y * 0.4;
    } else {
      // Bow: sawtooth at frequency
      const out = 2 * this.exciterPhase - 1;
      this.exciterPhase += this.exciterFrequency / this.exciterSampleRate;
      if (this.exciterPhase >= 1) {
        this.exciterPhase -= 1;
      }
      return out;
    }
  }

  process(inputs, outputs) {
    if (!this.active) {
      return false;
    }

    const output = outputs[0][0];
    const blockSize = output.length;

    for (let n = 0; n < blockSize; n++) {
      const x = this._nextExciterSample();

      let sum = 0;
      for (let i = 0; i < 8; i++) {
        const y = (
          this.b0[i] * x +
          this.b1[i] * this.x1[i] +
          this.b2[i] * this.x2[i] -
          this.a1[i] * this.y1[i] -
          this.a2[i] * this.y2[i]
        );
        this.x2[i] = this.x1[i];
        this.x1[i] = x;
        this.y2[i] = this.y1[i];
        this.y1[i] = y;
        sum += y * this.amplitude[i];
      }

      output[n] = sum;
    }

    // Check stop conditions
    // For non-bow exciters, stop when exciter is exhausted and resonators have decayed
    if (this.exciterType !== 2 && this.exciterRemaining <= 0) {
      // Check if all resonators have decayed below threshold (-80dB ~ 1e-4, using 1e-7 per spec)
      let maxAbs = 0;
      for (let i = 0; i < 8; i++) {
        const absY = this.y1[i] < 0 ? -this.y1[i] : this.y1[i];
        if (absY > maxAbs) maxAbs = absY;
      }
      if (maxAbs < 1e-7) {
        this.active = false;
        return false;
      }
    }

    // For bow, stay active until stop message
    if (this.exciterType === 2 && this.exciterRemaining <= 0) {
      this.active = false;
      return false;
    }

    return true;
  }
}

registerProcessor('cs-rings', RingsProcessor);
