// CONFUstudio v3 — Reverb module (Freeverb + convolution reverb)
// Extracted from engine.js

export const COMB_DELAYS_44100 = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
export const ALLPASS_DELAYS_44100 = [556, 441, 341, 225];

export function attachReverbMethods(proto) {
  proto._buildReverbGraph = function _buildReverbGraph() {
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
  };

  proto._buildIR = function _buildIR(name) {
    const ctx = this.context;
    const sampleRate = ctx.sampleRate;
    const durations = { room: 1.2, hall: 3.5, plate: 2.0, spring: 1.8, cave: 4.5, studio: 0.6 };
    const dur = durations[name] ?? 2.0;
    const len = Math.floor(sampleRate * dur);
    const buf = ctx.createBuffer(2, len, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const decay = Math.exp(-t * (6 / dur));
        let v = (Math.random() * 2 - 1) * decay;
        if (t < 0.08) v *= 1.5 + Math.sin(i * 0.3) * 0.5;
        if (name === 'spring') v *= 1 + Math.sin(i * 0.05) * 0.3;
        if (name === 'plate')  v *= 1 + Math.sin(i * 0.12) * 0.1;
        d[i] = v;
      }
    }
    // Normalize
    let peak = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak > 0) {
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) d[i] /= peak;
      }
    }
    return buf;
  };

  proto._buildConvIR = function _buildConvIR(name) {
    if (!this._irCache.has(name)) {
      this._irCache.set(name, this._buildIR(name));
    }
    this.reverbConvolver.buffer = this._irCache.get(name);
    this.reverbPreset = name;
  };

  proto.setReverbConvPreset = function setReverbConvPreset(name) {
    const VALID = ['room', 'hall', 'plate', 'spring', 'cave', 'studio'];
    const n = VALID.includes(name) ? name : 'room';
    this._buildConvIR(n);
  };

  proto.setReverbConvMix = function setReverbConvMix(wet) {
    const w = Math.max(0, Math.min(1, wet));
    this.reverbConvWet.gain.setTargetAtTime(w, this.context.currentTime, 0.05);
    // Dry path compensates slightly to avoid over-boosting at high wet
    this.reverbDry.gain.setTargetAtTime(1 - w * 0.3, this.context.currentTime, 0.05);
  };

  proto.setTrackReverbSend = function setTrackReverbSend(trackIndex, amount) {
    if (!this._trackReverbSendGains[trackIndex]) {
      const g = this.context.createGain();
      g.gain.value = 0;
      this._trackReverbSendGains[trackIndex] = g;
      g.connect(this.reverbSendBus);
    }
    this._trackReverbSendGains[trackIndex].gain.setTargetAtTime(
      Math.max(0, Math.min(1, amount)), this.context.currentTime, 0.01
    );
  };

  proto.setTrackDelaySend = function setTrackDelaySend(trackIndex, amount) {
    if (!this._trackDelaySendGains[trackIndex]) {
      const g = this.context.createGain();
      g.gain.value = 0;
      this._trackDelaySendGains[trackIndex] = g;
      g.connect(this.delaySendBus);
    }
    this._trackDelaySendGains[trackIndex].gain.setTargetAtTime(
      Math.max(0, Math.min(1, amount)), this.context.currentTime, 0.01
    );
  };

  proto.setReverbRoomSize = function setReverbRoomSize(v) {
    this.reverbRoomSize = Math.max(0, Math.min(0.98, v));
    for (const { feedbackGain } of this._combFilters) {
      feedbackGain.gain.setTargetAtTime(this.reverbRoomSize, this.context.currentTime, 0.01);
    }
  };

  proto.setReverbDamping = function setReverbDamping(v) {
    this.reverbDamping = Math.max(0, Math.min(1, v));
    const freq = 5500 * (1 - this.reverbDamping * 0.8);
    for (const { damplp } of this._combFilters) {
      damplp.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
    }
  };

  proto.setReverbPreDelay = function setReverbPreDelay(ms) {
    if (!this.reverbPreDelay) return;
    const sec = Math.max(0, Math.min(0.1, ms / 1000));
    this.reverbPreDelay.delayTime.setTargetAtTime(sec, this.context.currentTime, 0.005);
  };

  proto.setReverbPreset = function setReverbPreset(type) {
    const presets = {
      room:      { roomSize: 0.50, damping: 0.7, preDelay: 0,     wet: 0.22 },
      hall:      { roomSize: 0.84, damping: 0.3, preDelay: 0.02,  wet: 0.28 },
      plate:     { roomSize: 0.76, damping: 0.2, preDelay: 0.005, wet: 0.25 },
      spring:    { roomSize: 0.40, damping: 0.9, preDelay: 0,     wet: 0.30 },
      cathedral: { roomSize: 0.95, damping: 0.1, preDelay: 0.04,  wet: 0.32 },
    };
    const p = presets[type] ?? presets.room;
    this.setReverbRoomSize(p.roomSize);
    this.setReverbDamping(p.damping);
    if (this.reverbPreDelay != null) {
      this.reverbPreDelay.delayTime.setTargetAtTime(p.preDelay, this.context.currentTime, 0.01);
    }
    this.reverbWet.gain.setTargetAtTime(p.wet, this.context.currentTime, 0.05);
    // Apply spring LFO (shared logic)
    this._applySpringLFO(type);
  };

  proto.setReverbType = function setReverbType(type) {
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
    this._applySpringLFO(type);
  };

  proto._applySpringLFO = function _applySpringLFO(type) {
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
  };

  proto.setReverbMix = function setReverbMix(v) {
    this.reverbWet.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.context.currentTime, 0.01);
  };
}
