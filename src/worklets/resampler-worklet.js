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
    this._silentFrames = 0;

    this.port.onmessage = (event) => {
      const { type } = event.data;

      if (type === 'load') {
        const { channels, playbackRate, sampleRate, ctxRate, loopEnabled, loopStart, loopEnd, position } = event.data;
        this.channels = Array.isArray(channels)
          ? channels.map((buffer) => (buffer ? new Float32Array(buffer) : null))
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

  _sampleAt(buf, i, t, len) {
    const clamp = (idx) => (idx < 0 ? 0 : idx >= len ? len - 1 : idx);
    const p0 = buf[clamp(i - 1)];
    const p1 = buf[clamp(i)];
    const p2 = buf[clamp(i + 1)];
    const p3 = buf[clamp(i + 2)];

    const c0 = p1;
    const c1 = 0.5 * (p2 - p0);
    const c2 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
    const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
    return ((c3 * t + c2) * t + c1) * t + c0;
  }

  process(_inputs, outputs) {
    const outputs0 = outputs[0];

    if (!this.playing || !this.channels || this.channels.length === 0) {
      for (let ch = 0; ch < outputs0.length; ch++) {
        outputs0[ch].fill(0);
      }
      this._silentFrames += outputs0[0].length;
      if (this._silentFrames > sampleRate) return false;
      return true;
    }
    this._silentFrames = 0;

    const leftBuf = this.channels[0];
    const rightBuf = this.channels[1] || this.channels[0];
    const len = leftBuf.length;

    const loopStart = Math.max(0, Math.min(len - 1, Math.floor(this.loopStart)));
    const loopEnd = Math.max(loopStart + 1, Math.min(len, Math.floor(this.loopEnd) || len));
    const loopLen = loopEnd - loopStart;
    const hasLoop = this.loopEnabled && loopLen > 1;
    const fadeSamples = Math.min(4096, Math.floor(0.01 * sampleRate));
    const blockLen = outputs0[0].length;

    for (let n = 0; n < blockLen; n++) {
      if (!hasLoop && this.position >= len - 2) {
        for (let r = n; r < blockLen; r++) {
          for (let ch = 0; ch < outputs0.length; ch++) {
            outputs0[ch][r] = 0;
          }
        }
        this.playing = false;
        break;
      }

      if (hasLoop && this.position >= loopEnd) {
        this.position = loopStart + ((this.position - loopStart) % loopLen);
      }

      const remaining = hasLoop ? Infinity : len - 2 - this.position;
      const fadeGain = remaining < fadeSamples ? remaining / fadeSamples : 1;

      const i = this.position | 0;
      const t = this.position - i;

      const left = this._sampleAt(leftBuf, i, t, len) * fadeGain;
      const right = this._sampleAt(rightBuf, i, t, len) * fadeGain;
      if (outputs0[0]) outputs0[0][n] = left;
      if (outputs0[1]) outputs0[1][n] = right;
      for (let ch = 2; ch < outputs0.length; ch++) {
        outputs0[ch][n] = left;
      }

      this.position += this.increment;
    }

    return true;
  }
}

registerProcessor('cs-resampler', ResamplerProcessor);
