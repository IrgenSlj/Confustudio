// CONFUstudio — cs-resampler AudioWorkletProcessor
// 4-point cubic Hermite interpolation — replaces browser linear resampling

class ResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.channels = null;
    this.position = 0;
    this.increment = 1;
    this.playing = false;
    this.loopEnabled = false;
    this.loopStart = 0;
    this.loopEnd = 0;

    this.port.onmessage = (event) => {
      const { type } = event.data;

      if (type === 'load') {
        const { channels, playbackRate, sampleRate, ctxRate, loopEnabled, loopStart, loopEnd, position } = event.data;
        this.channels = Array.isArray(channels)
          ? channels.map((buffer) => buffer ? new Float32Array(buffer) : null)
          : [new Float32Array(event.data.buffer)];
        this.position = position ?? 0;
        this.increment = playbackRate * (sampleRate / ctxRate);
        this.loopEnabled = !!loopEnabled;
        this.loopStart = Math.max(0, loopStart ?? 0);
        this.loopEnd = Math.max(this.loopStart, loopEnd ?? 0);
        this.playing = true;
      } else if (type === 'stop') {
        this.playing = false;
        this.channels = null;
        this.position = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const outputs0 = outputs[0];

    if (!this.playing || !this.channels || this.channels.length === 0) {
      for (let ch = 0; ch < outputs0.length; ch++) {
        outputs0[ch].fill(0);
      }
      return true;
    }

    const channels = this.channels;
    const leftBuf = channels[0];
    const rightBuf = channels[1] || channels[0];
    const len = leftBuf.length;

    const clamp = (idx) => Math.max(0, Math.min(len - 1, idx));
    const loopStart = Math.max(0, Math.min(len - 1, Math.floor(this.loopStart)));
    const loopEnd = Math.max(loopStart + 1, Math.min(len, Math.floor(this.loopEnd) || len));
    const loopLen = loopEnd - loopStart;
    const hasLoop = this.loopEnabled && loopLen > 1;

    for (let n = 0; n < outputs0[0].length; n++) {
      if (hasLoop && this.position >= loopEnd) {
        this.position = loopStart + ((this.position - loopStart) % loopLen);
      }

      if (!hasLoop && this.position >= len - 2) {
        // Fill remainder with zeros and stop
        for (let r = n; r < outputs0[0].length; r++) {
          for (let ch = 0; ch < outputs0.length; ch++) {
            outputs0[ch][r] = 0;
          }
        }
        this.playing = false;
        break;
      }

      const p = this.position;
      const i = Math.floor(p);
      const t = p - i;

      const sampleAt = (buf) => {
        const p0 = buf[clamp(i - 1)];
        const p1 = buf[clamp(i)];
        const p2 = buf[clamp(i + 1)];
        const p3 = buf[clamp(i + 2)];

        const c0 = p1;
        const c1 = 0.5 * (p2 - p0);
        const c2 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
        const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
        return ((c3 * t + c2) * t + c1) * t + c0;
      };

      const left = sampleAt(leftBuf);
      const right = sampleAt(rightBuf);
      if (outputs0[0]) outputs0[0][n] = left;
      if (outputs0[1]) outputs0[1][n] = right;
      for (let ch = 2; ch < outputs0.length; ch++) {
        outputs0[ch][n] = left;
      }

      this.position += this.increment;
      if (hasLoop && this.position >= loopEnd) {
        this.position = loopStart + ((this.position - loopStart) % loopLen);
      }
    }

    return true;
  }
}

registerProcessor('cs-resampler', ResamplerProcessor);
