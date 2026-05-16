export function attachReverbMethods(proto) {
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
        if (name === 'plate') v *= 1 + Math.sin(i * 0.12) * 0.1;
        d[i] = v;
      }
    }
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
      Math.max(0, Math.min(1, amount)),
      this.context.currentTime,
      0.01,
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
      Math.max(0, Math.min(1, amount)),
      this.context.currentTime,
      0.01,
    );
  };

  // Backward-compat aliases — old Freeverb API now maps to convolution
  proto.setReverbMix = function setReverbMix(v) {
    this.setReverbConvMix(v);
  };

  proto.setReverbPreset = function setReverbPreset(type) {
    this.setReverbConvPreset(type);
  };

  proto.setReverbType = function setReverbType(type) {
    this.setReverbConvPreset(type);
  };

  proto.setReverbRoomSize = function setReverbRoomSize(_v) {
    // no-op — convolution IR replaces Freeverb room size
  };

  proto.setReverbDamping = function setReverbDamping(_v) {
    // no-op — convolution IR replaces Freeverb damping
  };

  proto.setReverbPreDelay = function setReverbPreDelay(_ms) {
    // no-op — could add a pre-delay node before reverbConvolver if needed
  };
}
