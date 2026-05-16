// CONFUstudio — cs-bitcrusher AudioWorkletProcessor

class BitcrusherProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bitDepth = 32;
    this.srDiv = 1;
    this.held = [];
    this.sampleCount = 0;

    this.port.onmessage = (event) => {
      const { type, bitDepth, srDiv } = event.data || {};
      if (type !== 'config') return;
      this.bitDepth = Number.isFinite(bitDepth) ? bitDepth : 32;
      this.srDiv = Math.max(1, Math.round(Number.isFinite(srDiv) ? srDiv : 1));
      this.held = [];
      this.sampleCount = 0;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output?.length) return true;

    const source = input?.[0] || null;
    const passthrough = !source || (this.bitDepth >= 32 && this.srDiv <= 1);
    const steps = Math.pow(2, Math.max(1, this.bitDepth));
    const frames = output[0]?.length || 0;

    if (passthrough) {
      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input?.[Math.min(ch, Math.max(0, (input?.length || 1) - 1))] || source;
        const outCh = output[ch];
        if (!inCh) outCh.fill(0);
        else outCh.set(inCh);
      }
      return true;
    }

    for (let i = 0; i < frames; i++) {
      if (this.sampleCount % this.srDiv === 0) {
        for (let ch = 0; ch < output.length; ch++) {
          const inCh = input?.[Math.min(ch, Math.max(0, (input?.length || 1) - 1))] || source;
          this.held[ch] = Math.round((inCh?.[i] ?? 0) * steps) / steps;
        }
      }
      for (let ch = 0; ch < output.length; ch++) {
        const outCh = output[ch];
        outCh[i] = this.held[ch] ?? 0;
      }
      this.sampleCount += 1;
    }

    return true;
  }
}

registerProcessor('cs-bitcrusher', BitcrusherProcessor);
