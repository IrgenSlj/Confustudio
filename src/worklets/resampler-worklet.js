// CONFUsynth — cs-resampler AudioWorkletProcessor
// 4-point cubic Hermite interpolation — replaces browser linear resampling

class ResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.buffer = null;
    this.position = 0;
    this.increment = 1;
    this.playing = false;

    this.port.onmessage = (event) => {
      const { type } = event.data;

      if (type === 'load') {
        const { buffer, playbackRate, sampleRate, ctxRate } = event.data;
        this.buffer = new Float32Array(buffer);
        this.position = 0;
        this.increment = playbackRate * (sampleRate / ctxRate);
        this.playing = true;
      } else if (type === 'stop') {
        this.playing = false;
        this.buffer = null;
        this.position = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];

    if (!this.playing || !this.buffer) {
      output.fill(0);
      return true;
    }

    const buf = this.buffer;
    const len = buf.length;

    const clamp = (idx) => Math.max(0, Math.min(len - 1, idx));

    for (let n = 0; n < output.length; n++) {
      if (this.position >= len - 2) {
        // Fill remainder with zeros and stop
        for (let r = n; r < output.length; r++) {
          output[r] = 0;
        }
        this.playing = false;
        break;
      }

      const p = this.position;
      const i = Math.floor(p);
      const t = p - i;

      const p0 = buf[clamp(i - 1)];
      const p1 = buf[i];
      const p2 = buf[clamp(i + 1)];
      const p3 = buf[clamp(i + 2)];

      const c0 = p1;
      const c1 = 0.5 * (p2 - p0);
      const c2 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
      const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);

      output[n] = ((c3 * t + c2) * t + c1) * t + c0;

      this.position += this.increment;
    }

    return true;
  }
}

registerProcessor('cs-resampler', ResamplerProcessor);
