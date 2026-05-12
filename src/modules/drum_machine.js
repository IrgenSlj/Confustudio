// drum_machine.js — Drum Machine module — enhanced synthesis

export function createDrumMachine(audioContext) {
  const ctx = audioContext;
  const _id = `module-drum-machine-${Date.now()}`;

  // ── Voice names and default patterns ───────────────────────────────────────
  const VOICES = ['BD', 'SD', 'LT', 'MT', 'HT', 'RS', 'CP', 'CB', 'OH', 'CH', 'CY'];
  const VOICE_LABELS = {
    BD: 'Bass Drum', SD: 'Snare', LT: 'Low Tom', MT: 'Mid Tom', HT: 'Hi Tom',
    RS: 'Rim Shot', CP: 'Clap', CB: 'Cowbell', OH: 'Open HH', CH: 'Closed HH', CY: 'Cymbal',
  };

  // Default pattern: classic 909 house beat
  const DEFAULT_PATTERNS = {
    BD: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    SD: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    LT: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    MT: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    HT: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    RS: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    CP: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    CB: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    OH: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    CH: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    CY: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  };

  // ── Pattern slots A/B/C/D ─────────────────────────────────────────────────
  const PATTERN_SLOTS = ['A', 'B', 'C', 'D'];
  let _activeSlot = 'A';

  // Each slot stores {active, velocity, accent} for all 16 steps × 11 voices
  const _patternSlots = {};
  PATTERN_SLOTS.forEach(slot => {
    _patternSlots[slot] = {};
    VOICES.forEach(v => {
      _patternSlots[slot][v] = Array.from({ length: 16 }, (_, i) => ({
        active: slot === 'A' && DEFAULT_PATTERNS[v][i] === 1,
        velocity: slot === 'A' && DEFAULT_PATTERNS[v][i] === 1 ? 3 : 0,
        accent: false,
      }));
    });
  });

  // Live reference always points to active slot
  let _steps = _patternSlots['A'];

  // Per-voice params (tune 0-1, decay 0-1, volume 0-1)
  const _voiceParams = {
    BD: { tune: 0.5, decay: 0.5, volume: 0.85 },
    SD: { tune: 0.5, decay: 0.4, volume: 0.75, snappy: 0.5 },
    LT: { tune: 0.5, decay: 0.5, volume: 0.7 },
    MT: { tune: 0.5, decay: 0.45, volume: 0.7 },
    HT: { tune: 0.5, decay: 0.4, volume: 0.7 },
    RS: { tune: 0.5, decay: 0.5, volume: 0.65 },
    CP: { tune: 0.5, decay: 0.5, volume: 0.7 },
    CB: { tune: 0.5, decay: 0.5, volume: 0.6 },
    OH: { tune: 0.5, decay: 0.5, volume: 0.7 },
    CH: { tune: 0.5, decay: 0.5, volume: 0.7 },
    CY: { tune: 0.5, decay: 0.5, volume: 0.65 },
  };

  // Per-voice mute/solo state
  const _mutedVoices = new Set();
  let _soloVoice = null;

  let _seqStep = 0;
  let _running = false;
  let _syncMode = false;
  const _standaloneTimer = null;
  let _standaloneBPM = 120;
  let _masterVolume = 0.8;
  let _swing = 0; // 0–1
  let _compEnabled = true;

  // ── Audio Engine ─────────────────────────────────────────────────────────
  const _voiceGains = {};
  const masterGain   = ctx ? ctx.createGain()  : null;
  const compressor   = ctx ? ctx.createDynamicsCompressor() : null;
  const outputGain   = ctx ? ctx.createGain()  : null;

  if (ctx) {
    masterGain.gain.value  = _masterVolume;
    outputGain.gain.value  = 1.0;

    // Compressor settings — gentle glue comp
    if (compressor) {
      compressor.threshold.value = -6;
      compressor.knee.value      = 6;
      compressor.ratio.value     = 4;
      compressor.attack.value    = 0.005;
      compressor.release.value   = 0.05;
      masterGain.connect(compressor);
      compressor.connect(outputGain);
    } else {
      masterGain.connect(outputGain);
    }

    VOICES.forEach(v => {
      const g = ctx.createGain();
      g.gain.value = _voiceParams[v].volume;
      g.connect(masterGain);
      _voiceGains[v] = g;
    });
  }

  // ── Noise buffer (shared, 2s) ─────────────────────────────────────────────
  let _noiseBuf = null;
  if (ctx) {
    _noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = _noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function _createNoiseSource() {
    if (!ctx || !_noiseBuf) return null;
    const src = ctx.createBufferSource();
    src.buffer = _noiseBuf;
    src.loop = true;
    return src;
  }

  // ── Soft clip curve ───────────────────────────────────────────────────────
  function _makeSoftClip(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = amount > 0
        ? (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x))
        : x;
    }
    return curve;
  }

  // Shared soft-clip curve instance (reused across BD triggers)
  const _bdClipCurve = ctx ? _makeSoftClip(20) : null;

  // ── Voice synthesis functions ─────────────────────────────────────────────

  function _triggerBD(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.BD;
    // Tune: 100–200 Hz start, 40–80 Hz end
    const startFreq  = 100 + p.tune * 100;
    const endFreq    = 40  + p.tune * 40;
    // Accent: louder + shorter decay (tighter punch)
    const decayBase  = 0.2 + p.decay * 0.6; // 200–800ms
    const decayTime  = accent ? decayBase * 0.8 : decayBase;
    let   velScale   = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);

    // ── Main sine body ────────────────────────────────────────────────────
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    // Two-segment pitch envelope: fast drop first 50ms then slower
    const midFreq = startFreq + (endFreq - startFreq) * 0.7; // 70% of way at 50ms mark
    osc.frequency.exponentialRampToValueAtTime(midFreq, time + 0.050);
    osc.frequency.exponentialRampToValueAtTime(endFreq,  time + decayTime * 0.6);

    // ── 2× harmonic sine for body ─────────────────────────────────────────
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(startFreq * 2, time);
    osc2.frequency.exponentialRampToValueAtTime(midFreq * 2, time + 0.050);
    osc2.frequency.exponentialRampToValueAtTime(endFreq * 2,  time + decayTime * 0.5);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.20 * velScale, time);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 0.4);

    // ── Click transient: 3ms highpassed noise burst ───────────────────────
    const clickNoise = _createNoiseSource();
    const clickHpf   = ctx.createBiquadFilter();
    clickHpf.type           = 'highpass';
    clickHpf.frequency.value = 2500;
    clickHpf.Q.value         = 0.5;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0, time);
    clickGain.gain.linearRampToValueAtTime(0.35 * velScale, time + 0.0005);
    clickGain.gain.exponentialRampToValueAtTime(0.001,       time + 0.003);

    // ── Main VCA ──────────────────────────────────────────────────────────
    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0, time);
    vca.gain.linearRampToValueAtTime(0.9 * velScale, time + 0.002);
    vca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

    // Light distortion (reuse shared curve)
    const ws = ctx.createWaveShaper();
    ws.curve = _bdClipCurve;
    ws.oversample = '2x';

    osc.connect(ws);
    osc2.connect(osc2Gain); osc2Gain.connect(ws);
    ws.connect(vca);
    clickNoise.connect(clickHpf); clickHpf.connect(clickGain); clickGain.connect(_voiceGains.BD);
    vca.connect(_voiceGains.BD);

    osc.start(time);       osc.stop(time + decayTime + 0.05);
    osc2.start(time);      osc2.stop(time + decayTime * 0.45);
    clickNoise.start(time); clickNoise.stop(time + 0.01);
  }

  function _triggerSD(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.SD;
    const decayBase = 0.1 + p.decay * 0.25; // 100–350ms
    const decayTime = accent ? decayBase * 0.8 : decayBase;
    const snappy    = p.snappy ?? 0.5;
    let   velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);
    const tuneFreq  = 150 + p.tune * 100; // 150–250 Hz

    // ── Sine body ─────────────────────────────────────────────────────────
    const oscBody = ctx.createOscillator();
    oscBody.type = 'sine';
    oscBody.frequency.setValueAtTime(tuneFreq, time);
    oscBody.frequency.exponentialRampToValueAtTime(tuneFreq * 0.6, time + decayTime * 0.5);

    const vcaBody = ctx.createGain();
    vcaBody.gain.setValueAtTime(0, time);
    vcaBody.gain.linearRampToValueAtTime(0.7 * velScale * (1 - snappy * 0.4), time + 0.001);
    vcaBody.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

    // ── 2× harmonic sine (rim resonance) ─────────────────────────────────
    const oscBody2 = ctx.createOscillator();
    oscBody2.type = 'sine';
    oscBody2.frequency.setValueAtTime(tuneFreq * 2, time);
    oscBody2.frequency.exponentialRampToValueAtTime(tuneFreq * 1.1, time + decayTime * 0.3);

    const vcaBody2 = ctx.createGain();
    vcaBody2.gain.setValueAtTime(0, time);
    vcaBody2.gain.linearRampToValueAtTime(0.3 * velScale, time + 0.001);
    vcaBody2.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 0.4);

    // ── Noise body (low BPF ~200-800 Hz) ─────────────────────────────────
    const noiseBody = _createNoiseSource();
    const bpfLo    = ctx.createBiquadFilter();
    bpfLo.type          = 'bandpass';
    bpfLo.frequency.value = 200 + p.tune * 200; // 200–400 Hz
    bpfLo.Q.value         = 0.7;
    const vcaNoiseBody = ctx.createGain();
    vcaNoiseBody.gain.setValueAtTime(0, time);
    vcaNoiseBody.gain.linearRampToValueAtTime(0.3 * velScale * (1 - snappy * 0.3), time + 0.001);
    vcaNoiseBody.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 0.8);

    // ── Noise sizzle (high BPF ~2k-8kHz) ─────────────────────────────────
    const noiseSizz = _createNoiseSource();
    const bpfHi    = ctx.createBiquadFilter();
    bpfHi.type           = 'bandpass';
    bpfHi.frequency.value = 2000 + snappy * 6000; // 2k–8kHz
    bpfHi.Q.value          = 0.6;
    const vcaNoiseSizz = ctx.createGain();
    vcaNoiseSizz.gain.setValueAtTime(0, time);
    vcaNoiseSizz.gain.linearRampToValueAtTime(0.5 * velScale * (0.3 + snappy * 0.7), time + 0.001);
    vcaNoiseSizz.gain.exponentialRampToValueAtTime(0.001, time + decayTime * (0.4 + snappy * 0.5));

    // ── Initial click transient (8ms noise burst) ─────────────────────────
    const clickNoise = _createNoiseSource();
    const clickHpf   = ctx.createBiquadFilter();
    clickHpf.type           = 'highpass';
    clickHpf.frequency.value = 3000;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0, time);
    clickGain.gain.linearRampToValueAtTime(0.4 * velScale, time + 0.0005);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.008);

    oscBody.connect(vcaBody);        vcaBody.connect(_voiceGains.SD);
    oscBody2.connect(vcaBody2);      vcaBody2.connect(_voiceGains.SD);
    noiseBody.connect(bpfLo);        bpfLo.connect(vcaNoiseBody);    vcaNoiseBody.connect(_voiceGains.SD);
    noiseSizz.connect(bpfHi);        bpfHi.connect(vcaNoiseSizz);    vcaNoiseSizz.connect(_voiceGains.SD);
    clickNoise.connect(clickHpf);    clickHpf.connect(clickGain);    clickGain.connect(_voiceGains.SD);

    oscBody.start(time);    oscBody.stop(time + decayTime + 0.05);
    oscBody2.start(time);   oscBody2.stop(time + decayTime * 0.45);
    noiseBody.start(time);  noiseBody.stop(time + decayTime + 0.05);
    noiseSizz.start(time);  noiseSizz.stop(time + decayTime + 0.05);
    clickNoise.start(time); clickNoise.stop(time + 0.015);
  }

  function _triggerTom(voice, baseFreq, decayMs, velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams[voice];
    const freq = baseFreq * Math.pow(2, (p.tune - 0.5) * 1.5);
    const decayBase = (decayMs / 1000) * (0.5 + p.decay);
    const decayTime = accent ? decayBase * 0.8 : decayBase;
    let velScale    = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + decayTime * 0.3);

    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0, time);
    vca.gain.linearRampToValueAtTime(0.8 * velScale, time + 0.002);
    vca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

    osc.connect(vca);
    vca.connect(_voiceGains[voice]);

    osc.start(time);
    osc.stop(time + decayTime + 0.05);
  }

  function _triggerRS(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.RS;
    let velScale   = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);
    const freq = 300 + p.tune * 200;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const vcaOsc = ctx.createGain();
    vcaOsc.gain.setValueAtTime(0, time);
    vcaOsc.gain.linearRampToValueAtTime(0.5 * velScale, time + 0.001);
    vcaOsc.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    const noise = _createNoiseSource();
    const hpf   = ctx.createBiquadFilter();
    hpf.type           = 'highpass';
    hpf.frequency.value = 1000;

    const vcaNoise = ctx.createGain();
    vcaNoise.gain.setValueAtTime(0, time);
    vcaNoise.gain.linearRampToValueAtTime(0.3 * velScale, time + 0.0005);
    vcaNoise.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

    osc.connect(vcaOsc); vcaOsc.connect(_voiceGains.RS);
    noise.connect(hpf); hpf.connect(vcaNoise); vcaNoise.connect(_voiceGains.RS);

    osc.start(time); osc.stop(time + 0.06);
    noise.start(time); noise.stop(time + 0.06);
  }

  function _triggerCP(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.CP;
    let velScale   = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);
    const decayBase = 0.1 + p.decay * 0.2;
    const decayTime = accent ? decayBase * 0.8 : decayBase;

    // 5 staggered noise bursts: 0, 10, 20, 35, 60ms (authentic 909 has 5 layers)
    const delays = [0, 0.010, 0.020, 0.035, 0.060];
    const bpfFreq = 900 + p.tune * 300;

    delays.forEach((d, i) => {
      const t = time + d;
      const noise = _createNoiseSource();
      const bpf = ctx.createBiquadFilter();
      bpf.type           = 'bandpass';
      bpf.frequency.value = bpfFreq;
      bpf.Q.value         = 3.0; // increased Q for more punch

      const isLast   = i === delays.length - 1;
      const burstLen = isLast ? decayTime : 0.006;
      const vca = ctx.createGain();
      vca.gain.setValueAtTime(0, t);
      vca.gain.linearRampToValueAtTime(0.6 * velScale, t + 0.001);
      vca.gain.exponentialRampToValueAtTime(0.001, t + burstLen);

      noise.connect(bpf); bpf.connect(vca); vca.connect(_voiceGains.CP);
      noise.start(t); noise.stop(t + burstLen + 0.05);

      // 5ms echo at 30% on the last burst (reverb-style delay)
      if (isLast) {
        const echoNoise = _createNoiseSource();
        const echoBpf   = ctx.createBiquadFilter();
        echoBpf.type           = 'bandpass';
        echoBpf.frequency.value = bpfFreq;
        echoBpf.Q.value         = 3.0;
        const echoVca = ctx.createGain();
        const te = t + 0.005; // 5ms later
        echoVca.gain.setValueAtTime(0, te);
        echoVca.gain.linearRampToValueAtTime(0.18 * velScale, te + 0.001); // 30% of 0.6
        echoVca.gain.exponentialRampToValueAtTime(0.001, te + decayTime * 0.6);
        echoNoise.connect(echoBpf); echoBpf.connect(echoVca); echoVca.connect(_voiceGains.CP);
        echoNoise.start(te); echoNoise.stop(te + decayTime * 0.65);
      }
    });
  }

  function _triggerCB(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.CB;
    let velScale   = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);
    const decayBase = 0.3 + p.decay * 0.6;
    const decayTime = accent ? decayBase * 0.8 : decayBase;
    const tuneMult  = Math.pow(2, (p.tune - 0.5) * 0.5);

    // 4 square oscillators: 562, 845, 1100, 1480 Hz
    const freqs = [562 * tuneMult, 845 * tuneMult, 1100 * tuneMult, 1480 * tuneMult];

    // Shared bandpass centered at 800 Hz
    const bpf = ctx.createBiquadFilter();
    bpf.type           = 'bandpass';
    bpf.frequency.value = 800 * tuneMult;
    bpf.Q.value         = 2.5;
    bpf.connect(_voiceGains.CB);

    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const vca = ctx.createGain();
      // Double-decay: very fast 15ms partial decay then slower main decay
      vca.gain.setValueAtTime(0, time);
      vca.gain.linearRampToValueAtTime(0.35 * velScale, time + 0.001);
      vca.gain.exponentialRampToValueAtTime(0.12 * velScale, time + 0.015); // fast first stage
      vca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);       // slower main

      osc.connect(vca); vca.connect(bpf);
      osc.start(time); osc.stop(time + decayTime + 0.05);
    });
  }

  // Shared metallic HH oscillator frequencies (Hz) — authentic DRUM MACHINE
  const HH_FREQS = [205.3, 309.1, 416.7, 522.4, 633.8, 769.2];

  function _makeHHOscs(time, decayTime, velScale, destNode) {
    HH_FREQS.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      // Individual bandpass per oscillator (Q=0.8, freq matches osc)
      const bpf = ctx.createBiquadFilter();
      bpf.type           = 'bandpass';
      bpf.frequency.value = freq;
      bpf.Q.value         = 0.8;

      const g = ctx.createGain();
      g.gain.value = (0.15 * velScale) / HH_FREQS.length;

      osc.connect(bpf); bpf.connect(g); g.connect(destNode);
      osc.start(time);
      osc.stop(time + decayTime + 0.05);
    });
  }

  // Open HH state — store current VCA so CH can choke it
  let _ohVca = null;

  function _triggerOH(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.OH;
    let velScale   = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);
    // Longer decay range with tune: 400–2000ms
    const decayTime = accent
      ? (0.4 + p.tune * 1.6) * 0.8
      : (0.4 + p.tune * 1.6);

    const ohVca = ctx.createGain();
    ohVca.gain.setValueAtTime(0, time);
    ohVca.gain.linearRampToValueAtTime(velScale, time + 0.001);
    ohVca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    ohVca.connect(_voiceGains.OH);

    // Final highpass at 7000 Hz
    const hpf = ctx.createBiquadFilter();
    hpf.type           = 'highpass';
    hpf.frequency.value = 7000;
    hpf.connect(ohVca);

    _makeHHOscs(time, decayTime, velScale, hpf);

    _ohVca = ohVca;
  }

  function _triggerCH(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.CH;
    let velScale   = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);
    const decayTime = 0.04 + p.decay * 0.06; // 40–100ms

    // Proper choke: ramp down current OH VCA immediately
    if (_ohVca) {
      _ohVca.gain.cancelScheduledValues(time);
      _ohVca.gain.setValueAtTime(_ohVca.gain.value, time);
      _ohVca.gain.linearRampToValueAtTime(0, time + 0.003);
      _ohVca = null;
    }

    const chVca = ctx.createGain();
    chVca.gain.setValueAtTime(0, time);
    chVca.gain.linearRampToValueAtTime(velScale, time + 0.001);
    chVca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    chVca.connect(_voiceGains.CH);

    // Final highpass at 7000 Hz
    const hpf = ctx.createBiquadFilter();
    hpf.type           = 'highpass';
    hpf.frequency.value = 7000;
    hpf.connect(chVca);

    _makeHHOscs(time, decayTime, velScale, hpf);
  }

  function _triggerCY(velocity, time, accent) {
    if (!ctx) return;
    const p = _voiceParams.CY;
    let velScale   = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    if (accent) velScale = Math.min(1.0, velScale * 1.4);
    const decayTime = accent
      ? (1.5 + p.decay * 3.0) * 0.8
      : (1.5 + p.decay * 3.0); // 1.5–4.5s
    const tuneMult  = Math.pow(2, (p.tune - 0.5) * 0.5);

    const cyVca = ctx.createGain();
    cyVca.gain.setValueAtTime(0, time);
    cyVca.gain.linearRampToValueAtTime(0.45 * velScale, time + 0.002);
    cyVca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    cyVca.connect(_voiceGains.CY);

    // Attack click transient
    const clickNoise = _createNoiseSource();
    const clickHpf   = ctx.createBiquadFilter();
    clickHpf.type           = 'highpass';
    clickHpf.frequency.value = 5000;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0, time);
    clickGain.gain.linearRampToValueAtTime(0.25 * velScale, time + 0.0005);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.004);
    clickNoise.connect(clickHpf); clickHpf.connect(clickGain); clickGain.connect(_voiceGains.CY);
    clickNoise.start(time); clickNoise.stop(time + 0.008);

    const CY_FREQS = [205.3 * tuneMult, 309.1 * tuneMult, 416.7 * tuneMult,
                      522.4 * tuneMult * 1.02, 633.8 * tuneMult * 1.01, 769.2 * tuneMult];

    const bpf = ctx.createBiquadFilter();
    bpf.type           = 'bandpass';
    bpf.frequency.value = 6000 * tuneMult;
    bpf.Q.value         = 0.3;

    const hpf = ctx.createBiquadFilter();
    hpf.type           = 'highpass';
    hpf.frequency.value = 4000;

    // Noise sizzle layer
    const noise    = _createNoiseSource();
    const noiseBpf = ctx.createBiquadFilter();
    noiseBpf.type           = 'bandpass';
    noiseBpf.frequency.value = 8000;
    noiseBpf.Q.value         = 1.0;
    const noiseVca = ctx.createGain();
    noiseVca.gain.setValueAtTime(0, time);
    noiseVca.gain.linearRampToValueAtTime(0.15 * velScale, time + 0.002);
    noiseVca.gain.exponentialRampToValueAtTime(0.001, time + decayTime * 0.7);
    noise.connect(noiseBpf); noiseBpf.connect(noiseVca); noiseVca.connect(cyVca);
    noise.start(time); noise.stop(time + decayTime * 0.75);

    CY_FREQS.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.15 / CY_FREQS.length;
      osc.connect(g); g.connect(bpf);
      osc.start(time); osc.stop(time + decayTime + 0.05);
    });

    bpf.connect(hpf);
    hpf.connect(cyVca);
  }

  // ── Mute/Solo helper ──────────────────────────────────────────────────────
  function _isVoiceAudible(voice) {
    if (_soloVoice) return voice === _soloVoice;
    return !_mutedVoices.has(voice);
  }

  function _applyMuteGain(voice) {
    if (!ctx || !_voiceGains[voice]) return;
    const audible = _isVoiceAudible(voice);
    _voiceGains[voice].gain.setTargetAtTime(
      audible ? _voiceParams[voice].volume : 0,
      ctx.currentTime, 0.01
    );
  }

  function _refreshAllMuteGains() {
    VOICES.forEach(v => _applyMuteGain(v));
  }

  // ── Master trigger dispatcher ─────────────────────────────────────────────
  function _triggerVoice(voice, velocity, time, accent) {
    if (!ctx) return;
    const now    = time ?? ctx.currentTime;
    const v      = velocity ?? 3;
    const ac     = accent ?? false;
    const p      = _voiceParams[voice];

    if (!_isVoiceAudible(voice)) return;

    _flashPad(voice);
    _flashVU(voice);

    window.dispatchEvent(new CustomEvent('confustudio:note:on', {
      detail: { source: 'drum_machine', voice, velocity: v, time: now },
    }));

    switch (voice) {
      case 'BD': _triggerBD(v, now, ac); break;
      case 'SD': _triggerSD(v, now, ac); break;
      case 'LT': _triggerTom('LT', 80  + p.tune * 60,  200, v, now, ac); break;
      case 'MT': _triggerTom('MT', 110 + p.tune * 80,  180, v, now, ac); break;
      case 'HT': _triggerTom('HT', 160 + p.tune * 100, 160, v, now, ac); break;
      case 'RS': _triggerRS(v, now, ac); break;
      case 'CP': _triggerCP(v, now, ac); break;
      case 'CB': _triggerCB(v, now, ac); break;
      case 'OH': _triggerOH(v, now, ac); break;
      case 'CH': _triggerCH(v, now, ac); break;
      case 'CY': _triggerCY(v, now, ac); break;
    }
  }

  // ── Sequencer step trigger ────────────────────────────────────────────────
  function _triggerStep(stepIdx, schedTime) {
    const now = schedTime ?? (ctx ? ctx.currentTime : 0);
    VOICES.forEach(voice => {
      const step = _steps[voice][stepIdx];
      if (step.active && step.velocity > 0) {
        _triggerVoice(voice, step.velocity, now, step.accent);
      }
    });
    _highlightStep(stepIdx);
  }

  // ── Swing offset helper ───────────────────────────────────────────────────
  function _swingOffset(stepIdx, stepDurationSec) {
    // Odd steps (0-indexed: 1, 3, 5...) are delayed
    if (_swing > 0 && (stepIdx % 2) === 1) {
      return _swing * stepDurationSec * 0.33;
    }
    return 0;
  }

  // ── Standalone transport (look-ahead scheduler) ───────────────────────────
  const _scheduleAheadTime = 0.1; // seconds
  const _lookaheadMs       = 25;  // ms between scheduler calls
  let _nextStepTime      = 0;
  let _schedTimer        = null;

  function _getStepDuration() {
    return (60 / _standaloneBPM) / 4; // 16th note
  }

  function _scheduleNext() {
    const stepDur = _getStepDuration();
    while (_nextStepTime < ctx.currentTime + _scheduleAheadTime) {
      const swingDelay = _swingOffset(_seqStep, stepDur);
      _triggerStep(_seqStep, _nextStepTime + swingDelay);
      _seqStep    = (_seqStep + 1) % 16;
      _nextStepTime += stepDur;
    }
  }

  function _startStandalone() {
    if (_schedTimer) clearInterval(_schedTimer);
    _seqStep      = 0;
    _nextStepTime = ctx ? ctx.currentTime : 0;
    _schedTimer   = setInterval(_scheduleNext, _lookaheadMs);
  }

  function _stopStandalone() {
    if (_schedTimer) { clearInterval(_schedTimer); _schedTimer = null; }
    _highlightStep(-1);
  }

  // ── Clock sync ────────────────────────────────────────────────────────────
  window.addEventListener('confustudio:clock', (e) => {
    const { step, bpm, time: clockTime } = e.detail ?? {};
    if (!_running || !_syncMode) return;
    if (bpm && _standaloneBPM !== bpm) {
      _standaloneBPM = bpm;
      const bpmEl = el?.querySelector(`#${_id}-bpm`);
      if (bpmEl) bpmEl.textContent = bpm;
    }
    if (_schedTimer) _stopStandalone();
    const s = typeof step === 'number' ? step % 16 : _seqStep;
    const schedTime = (typeof clockTime === 'number' && ctx)
      ? clockTime
      : (ctx ? ctx.currentTime : 0);
    const stepDur = _getStepDuration();
    const swingDelay = _swingOffset(s, stepDur);
    _triggerStep(s, schedTime + swingDelay);
    _seqStep = (s + 1) % 16;
  });

  // ── DOM ───────────────────────────────────────────────────────────────────
  if (!document.querySelector('#drum-machine-styles')) {
    const style = document.createElement('style');
    style.id = 'drum-machine-styles';
    style.textContent = `
      .drum-machine-chassis {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        background: linear-gradient(180deg, #ddd5c2 0%, #cfc5b0 100%);
        border: 2px solid #a89880;
        border-radius: 8px;
        width: 960px;
        min-height: 280px;
        box-shadow: 0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3);
        padding: 8px 12px 12px;
        box-sizing: border-box;
        color: #2a2218;
        user-select: none;
        position: relative;
      }

      /* Port bar */
      .drum-machine-port-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid #b8a890;
      }
      .drum-machine-brand {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 3px;
        color: #3a2e1e;
        text-transform: uppercase;
      }
      .drum-machine-port-bar .port {
        display: inline-block;
        background: #1a1614;
        color: #e8a020;
        font-size: 9px;
        font-weight: 700;
        padding: 3px 7px;
        border-radius: 3px;
        border: 1px solid #3a3028;
        letter-spacing: 1px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .drum-machine-port-bar .port:hover { background: #2e2824; }

      /* Pattern slot buttons */
      .drum-machine-pattern-slots {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .drum-machine-slot-btn {
        background: linear-gradient(180deg, #4a4440 0%, #2e2a28 100%);
        color: #c0a870;
        border: 1px solid #1a1614;
        border-radius: 3px;
        padding: 3px 9px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        cursor: pointer;
        text-transform: uppercase;
      }
      .drum-machine-slot-btn.active {
        background: linear-gradient(180deg, #e07000 0%, #a04800 100%);
        color: #fff8e8;
        box-shadow: 0 0 6px rgba(255,140,0,0.4);
      }
      .drum-machine-slot-btn:hover:not(.active) { background: linear-gradient(180deg, #5a5450 0%, #3e3a38 100%); }
      .drum-machine-copy-paste {
        display: flex;
        gap: 3px;
        margin-left: 4px;
      }
      .drum-machine-copy-paste button {
        background: linear-gradient(180deg, #383430 0%, #201e1c 100%);
        color: #a09070;
        border: 1px solid #1a1614;
        border-radius: 3px;
        padding: 3px 7px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.5px;
        cursor: pointer;
      }
      .drum-machine-copy-paste button:hover { background: linear-gradient(180deg, #484440 0%, #302e2c 100%); }

      /* Pads row */
      .drum-machine-pads-row {
        display: flex;
        gap: 5px;
        margin-bottom: 6px;
        align-items: flex-end;
      }
      .drum-machine-pad-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        flex: 1;
      }
      .drum-machine-pad {
        width: 100%;
        aspect-ratio: 1;
        background: linear-gradient(160deg, #5a5248 0%, #3a3230 100%);
        border: 1px solid #2a2220;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.08s, box-shadow 0.08s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
        min-width: 44px;
        min-height: 44px;
        position: relative;
      }
      .drum-machine-pad:hover {
        background: linear-gradient(160deg, #6e6460 0%, #4e4a48 100%);
      }
      .drum-machine-pad.triggered {
        background: linear-gradient(160deg, #ff9010 0%, #e06000 100%);
        box-shadow: 0 0 10px rgba(255,140,0,0.7), inset 0 1px 0 rgba(255,255,200,0.3);
      }
      .drum-machine-pad-label {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #5a4e3a;
        text-transform: uppercase;
      }

      /* VU meter strip */
      .drum-machine-vu {
        width: 100%;
        height: 4px;
        background: #1a1614;
        border-radius: 2px;
        overflow: hidden;
        position: relative;
      }
      .drum-machine-vu-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #40c040, #e0e000, #e04000);
        border-radius: 2px;
        transition: width 0.03s ease-out;
      }
      .drum-machine-vu-bar.flash {
        width: 100%;
        transition: none;
      }
      .drum-machine-vu-bar.fade {
        width: 0%;
        transition: width 0.25s ease-out;
      }

      /* Mute button */
      .drum-machine-mute-btn {
        font-size: 8px;
        font-weight: 700;
        color: #786858;
        background: #2a2220;
        border: 1px solid #1a1614;
        border-radius: 2px;
        padding: 1px 4px;
        cursor: pointer;
        letter-spacing: 0.5px;
        line-height: 1.4;
      }
      .drum-machine-mute-btn.muted {
        background: #602000;
        color: #ff8040;
        border-color: #903020;
      }
      .drum-machine-mute-btn.solo {
        background: #006020;
        color: #40ff80;
        border-color: #209050;
      }

      /* Voice knob rows */
      .drum-machine-voice-knobs {
        display: flex;
        gap: 5px;
        margin-bottom: 6px;
      }
      .drum-machine-voice-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
      }
      .drum-machine-mini-knob-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }
      .drum-machine-mini-knob {
        width: 22px;
        height: 22px;
        background: radial-gradient(circle at 40% 35%, #6a6560, #2a2820);
        border-radius: 50%;
        border: 1px solid #1a1814;
        cursor: pointer;
        position: relative;
        box-shadow: 0 1px 3px rgba(0,0,0,0.6);
      }
      .drum-machine-mini-knob::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 50%;
        transform: translateX(-50%) rotate(0deg);
        transform-origin: bottom center;
        width: 2px;
        height: 7px;
        background: #e8d8b0;
        border-radius: 1px;
      }
      .drum-machine-mini-label {
        font-size: 7px;
        font-weight: 700;
        color: #7a6a50;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      /* Sequencer steps */
      .drum-machine-seq-section {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .drum-machine-seq-row {
        display: flex;
        align-items: center;
        gap: 3px;
      }
      .drum-machine-seq-voice-label {
        font-size: 9px;
        font-weight: 700;
        color: #5a4e3a;
        width: 24px;
        text-align: right;
        flex-shrink: 0;
        letter-spacing: 0.5px;
      }
      .drum-machine-steps {
        display: flex;
        gap: 3px;
        flex: 1;
      }
      .drum-machine-step {
        flex: 1;
        height: 22px;
        background: #3a3230;
        border: 1px solid #2a2220;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.06s;
        position: relative;
        min-width: 0;
      }
      .drum-machine-step:nth-child(4n+1) { margin-left: 3px; }
      .drum-machine-step.active {
        background: #c06000;
        border-color: #ff8c00;
        box-shadow: 0 0 4px rgba(255,140,0,0.5);
      }
      .drum-machine-step.active-low  { background: #804000; border-color: #a05000; }
      .drum-machine-step.active-mid  { background: #c06000; border-color: #e07000; }
      .drum-machine-step.active-high { background: #ff8c00; border-color: #ffaa30; box-shadow: 0 0 5px rgba(255,140,0,0.6); }
      .drum-machine-step.playing {
        outline: 2px solid #ffe060;
        outline-offset: 1px;
        background: #ffe060 !important;
        border-color: #ffe060 !important;
      }
      .drum-machine-step:hover { filter: brightness(1.2); }

      /* Accent dot on step */
      .drum-machine-step .accent-dot {
        display: none;
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 4px;
        height: 4px;
        background: #ff6010;
        border-radius: 50%;
        box-shadow: 0 0 3px rgba(255,96,16,0.8);
      }
      .drum-machine-step.accented .accent-dot { display: block; }

      /* Bottom controls */
      .drum-machine-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid #b8a890;
        flex-wrap: wrap;
        gap: 6px;
      }
      .drum-machine-transport {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .drum-machine-btn {
        background: linear-gradient(180deg, #4a4440 0%, #2e2a28 100%);
        color: #e8d0a0;
        border: 1px solid #1a1614;
        border-radius: 4px;
        padding: 5px 12px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        cursor: pointer;
        text-transform: uppercase;
        transition: background 0.12s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
      }
      .drum-machine-btn:hover { background: linear-gradient(180deg, #5a5450 0%, #3e3a38 100%); }
      .drum-machine-btn.active {
        background: linear-gradient(180deg, #e07000 0%, #a04800 100%);
        color: #fff8e8;
        box-shadow: 0 0 8px rgba(255,140,0,0.4);
      }
      .drum-machine-sync-btn {
        background: linear-gradient(180deg, #3a4040 0%, #202828 100%);
        color: #80b0a0;
        border: 1px solid #1a2020;
        border-radius: 4px;
        padding: 5px 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        cursor: pointer;
        text-transform: uppercase;
        transition: background 0.12s;
      }
      .drum-machine-sync-btn.active {
        background: linear-gradient(180deg, #205050 0%, #103030 100%);
        color: #40e0d0;
        box-shadow: 0 0 6px rgba(64,224,208,0.3);
      }
      .drum-machine-comp-btn {
        background: linear-gradient(180deg, #3a3040 0%, #201828 100%);
        color: #a080c0;
        border: 1px solid #1a1020;
        border-radius: 4px;
        padding: 5px 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        cursor: pointer;
        text-transform: uppercase;
        transition: background 0.12s;
      }
      .drum-machine-comp-btn.active {
        background: linear-gradient(180deg, #503070 0%, #301850 100%);
        color: #d0a0ff;
        box-shadow: 0 0 6px rgba(160,80,255,0.3);
      }
      .drum-machine-master-knob-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .drum-machine-knob-lg {
        width: 34px;
        height: 34px;
        background: radial-gradient(circle at 38% 32%, #7a7470, #2a2820);
        border-radius: 50%;
        border: 1px solid #1a1814;
        cursor: pointer;
        position: relative;
        box-shadow: 0 2px 6px rgba(0,0,0,0.7);
      }
      .drum-machine-knob-lg::after {
        content: '';
        position: absolute;
        top: 3px;
        left: 50%;
        transform: translateX(-50%) rotate(0deg);
        transform-origin: bottom center;
        width: 2px;
        height: 11px;
        background: #e8d8b0;
        border-radius: 1px;
      }
      .drum-machine-bpm-display {
        background: #0a100a;
        color: #40e040;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid #1a2a1a;
        min-width: 54px;
        text-align: center;
        letter-spacing: 2px;
        cursor: pointer;
      }
      .drum-machine-label-sm {
        font-size: 9px;
        font-weight: 700;
        color: #7a6a50;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      /* Swing knob row */
      .drum-machine-swing-wrap {
        display: flex;
        align-items: center;
        gap: 5px;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'studio-module drum-machine-chassis';
  el.id = _id;
  el.dataset.moduleType = 'drum_machine';

  // Pad row HTML: each pad gets a VU meter + mute button
  const padsHtml = VOICES.map(v => `
    <div class="drum-machine-pad-wrap">
      <div class="drum-machine-pad" data-voice="${v}" title="${VOICE_LABELS[v]}"></div>
      <div class="drum-machine-vu"><div class="drum-machine-vu-bar" data-vu="${v}"></div></div>
      <span class="drum-machine-pad-label">${v}</span>
      <button class="drum-machine-mute-btn" data-mute="${v}" title="Mute/Solo ${v}">M</button>
    </div>
  `).join('');

  // Voice knob mini-rows: tune + decay + volume + optional snappy per voice
  const voiceKnobsHtml = VOICES.map(v => {
    const p = _voiceParams[v];
    const knobAngle = (val) => -135 + val * 270;
    const hasSnappy = v === 'SD';
    return `
      <div class="drum-machine-voice-col">
        <div class="drum-machine-mini-knob-wrap">
          <div class="drum-machine-mini-knob" data-voice="${v}" data-param="tune"
               style="--r: ${knobAngle(p.tune)}deg" title="${v} Tune"></div>
          <span class="drum-machine-mini-label">TUN</span>
        </div>
        <div class="drum-machine-mini-knob-wrap">
          <div class="drum-machine-mini-knob" data-voice="${v}" data-param="decay"
               style="--r: ${knobAngle(p.decay)}deg" title="${v} Decay"></div>
          <span class="drum-machine-mini-label">DEC</span>
        </div>
        ${hasSnappy ? `
        <div class="drum-machine-mini-knob-wrap">
          <div class="drum-machine-mini-knob" data-voice="${v}" data-param="snappy"
               style="--r: ${knobAngle(p.snappy ?? 0.5)}deg" title="${v} Snappy"></div>
          <span class="drum-machine-mini-label">SNP</span>
        </div>` : ''}
        <div class="drum-machine-mini-knob-wrap">
          <div class="drum-machine-mini-knob" data-voice="${v}" data-param="volume"
               style="--r: ${knobAngle(p.volume)}deg" title="${v} Volume"></div>
          <span class="drum-machine-mini-label">VOL</span>
        </div>
      </div>
    `;
  }).join('');

  // Step sequencer rows — each step has an accent-dot child element
  const seqRowsHtml = VOICES.map(v => {
    const stepsHtml = Array.from({ length: 16 }, (_, i) => {
      const step = _steps[v][i];
      let cls = '';
      if (step.active) {
        cls = step.velocity === 1 ? 'active active-low'
            : step.velocity === 2 ? 'active active-mid'
            : 'active active-high';
      }
      if (step.accent) cls += ' accented';
      return `<div class="drum-machine-step ${cls}" data-voice="${v}" data-step="${i}"><span class="accent-dot"></span></div>`;
    }).join('');
    return `
      <div class="drum-machine-seq-row">
        <span class="drum-machine-seq-voice-label">${v}</span>
        <div class="drum-machine-steps" data-voice="${v}">${stepsHtml}</div>
      </div>
    `;
  }).join('');

  // Pattern slot buttons HTML
  const patternSlotsHtml = PATTERN_SLOTS.map(s =>
    `<button class="drum-machine-slot-btn${s === 'A' ? ' active' : ''}" data-slot="${s}">${s}</button>`
  ).join('');

  el.innerHTML = `
    <div class="drum-machine-port-bar">
      <span class="drum-machine-brand">DRUM MACHINE</span>
      <div class="drum-machine-pattern-slots">
        <span class="drum-machine-label-sm">PAT:</span>
        ${patternSlotsHtml}
        <div class="drum-machine-copy-paste">
          <button id="${_id}-copy" title="Copy current pattern">CPY</button>
          <button id="${_id}-paste" title="Paste to current pattern">PST</button>
        </div>
      </div>
      <span class="port" data-port="audio-out">AUDIO OUT</span>
    </div>
    <div class="drum-machine-pads-row">${padsHtml}</div>
    <div class="drum-machine-voice-knobs">${voiceKnobsHtml}</div>
    <div class="drum-machine-seq-section">${seqRowsHtml}</div>
    <div class="drum-machine-bottom">
      <div class="drum-machine-transport">
        <button class="drum-machine-btn" id="${_id}-play">&#9654; PLAY</button>
        <button class="drum-machine-btn" id="${_id}-stop">&#9632; STOP</button>
        <button class="drum-machine-sync-btn" id="${_id}-sync" title="Sync to confustudio:clock">SYNC</button>
        <button class="drum-machine-comp-btn${_compEnabled ? ' active' : ''}" id="${_id}-comp" title="Master compressor">COMP</button>
      </div>
      <div class="drum-machine-master-knob-wrap">
        <div class="drum-machine-swing-wrap">
          <span class="drum-machine-label-sm">SWING</span>
          <div class="drum-machine-knob-lg" id="${_id}-swing" title="Swing (0–100%)"></div>
        </div>
        <span class="drum-machine-label-sm">MASTER</span>
        <div class="drum-machine-knob-lg" id="${_id}-mvol" title="Master Volume"></div>
        <span class="drum-machine-label-sm">VOL</span>
        <div class="drum-machine-bpm-display" id="${_id}-bpm">120</div>
        <span class="drum-machine-label-sm">BPM</span>
      </div>
    </div>
  `;

  // ── Knob rotation CSS sync ────────────────────────────────────────────────
  function _knobAngleDeg(val) {
    return -135 + val * 270;
  }

  function _setKnobRotation(knobEl, val) {
    knobEl.style.transform = `rotate(${_knobAngleDeg(val)}deg)`;
  }

  // Initialize knob rotations
  el.querySelectorAll('.drum-machine-mini-knob').forEach(knob => {
    const voice = knob.dataset.voice;
    const param = knob.dataset.param;
    const val = _voiceParams[voice]?.[param] ?? 0.5;
    _setKnobRotation(knob, val);
  });

  _setKnobRotation(el.querySelector(`#${_id}-mvol`), _masterVolume);
  _setKnobRotation(el.querySelector(`#${_id}-swing`), _swing);

  // ── Knob drag interaction ─────────────────────────────────────────────────
  function _attachKnobDrag(knobEl, getter, setter) {
    let startY = 0, startVal = 0;
    knobEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      knobEl.setPointerCapture(e.pointerId);
      startY   = e.clientY;
      startVal = getter();
    });
    knobEl.addEventListener('pointermove', e => {
      if (!e.buttons) return;
      const delta  = (startY - e.clientY) / 150;
      const newVal = Math.max(0, Math.min(1, startVal + delta));
      setter(newVal);
      _setKnobRotation(knobEl, newVal);
    });
  }

  el.querySelectorAll('.drum-machine-mini-knob').forEach(knob => {
    const voice = knob.dataset.voice;
    const param = knob.dataset.param;
    _attachKnobDrag(
      knob,
      () => _voiceParams[voice]?.[param] ?? 0.5,
      (val) => {
        _voiceParams[voice][param] = val;
        if (param === 'volume' && ctx && _voiceGains[voice]) {
          if (_isVoiceAudible(voice)) {
            _voiceGains[voice].gain.setTargetAtTime(val, ctx.currentTime, 0.02);
          }
        }
      }
    );
  });

  const mvolKnob = el.querySelector(`#${_id}-mvol`);
  _attachKnobDrag(
    mvolKnob,
    () => _masterVolume,
    (val) => {
      _masterVolume = val;
      if (ctx && masterGain) masterGain.gain.setTargetAtTime(val, ctx.currentTime, 0.02);
    }
  );

  const swingKnob = el.querySelector(`#${_id}-swing`);
  _attachKnobDrag(
    swingKnob,
    () => _swing,
    (val) => { _swing = val; }
  );

  // ── BPM display ───────────────────────────────────────────────────────────
  const bpmDisplay = el.querySelector(`#${_id}-bpm`);
  bpmDisplay?.addEventListener('wheel', e => {
    e.preventDefault();
    _standaloneBPM = Math.max(40, Math.min(280, _standaloneBPM - Math.sign(e.deltaY)));
    bpmDisplay.textContent = _standaloneBPM;
    if (_running && !_syncMode && _schedTimer) _startStandalone();
  });
  bpmDisplay?.addEventListener('click', () => {
    const input = prompt('Enter BPM (40–280):', _standaloneBPM);
    if (input === null) return;
    const v = parseInt(input);
    if (!isNaN(v) && v >= 40 && v <= 280) {
      _standaloneBPM = v;
      bpmDisplay.textContent = v;
      if (_running && !_syncMode && _schedTimer) _startStandalone();
    }
  });

  // ── Pad triggers ─────────────────────────────────────────────────────────
  el.querySelectorAll('.drum-machine-pad').forEach(pad => {
    pad.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      _triggerVoice(pad.dataset.voice, 3, undefined, false);
    });
  });

  // ── Step buttons — left-click cycles velocity, right-click toggles accent ─
  el.querySelectorAll('.drum-machine-step').forEach(stepEl => {
    stepEl.addEventListener('click', e => {
      e.preventDefault();
      const voice = stepEl.dataset.voice;
      const i     = parseInt(stepEl.dataset.step);
      const step  = _steps[voice][i];

      if (!step.active) {
        step.active   = true;
        step.velocity = 3;
      } else if (step.velocity === 3) {
        step.velocity = 2;
      } else if (step.velocity === 2) {
        step.velocity = 1;
      } else {
        step.active   = false;
        step.velocity = 0;
        step.accent   = false;
      }

      _updateStepEl(stepEl, step);
    });

    stepEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      const voice = stepEl.dataset.voice;
      const i     = parseInt(stepEl.dataset.step);
      const step  = _steps[voice][i];
      if (!step.active) return;
      step.accent = !step.accent;
      _updateStepEl(stepEl, step);
    });
  });

  function _updateStepEl(stepEl, step) {
    stepEl.classList.toggle('active',      step.active);
    stepEl.classList.toggle('active-low',  step.active && step.velocity === 1);
    stepEl.classList.toggle('active-mid',  step.active && step.velocity === 2);
    stepEl.classList.toggle('active-high', step.active && step.velocity === 3);
    stepEl.classList.toggle('accented',    step.active && step.accent);
  }

  // ── Pattern slot switching ────────────────────────────────────────────────
  let _clipboardPattern = null;

  function _switchSlot(slot) {
    _activeSlot = slot;
    _steps = _patternSlots[slot];

    // Update slot button highlights
    el.querySelectorAll('.drum-machine-slot-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.slot === slot);
    });

    // Refresh all step button visuals
    el.querySelectorAll('.drum-machine-step').forEach(stepEl => {
      const voice = stepEl.dataset.voice;
      const i     = parseInt(stepEl.dataset.step);
      _updateStepEl(stepEl, _steps[voice][i]);
    });
  }

  el.querySelectorAll('.drum-machine-slot-btn').forEach(btn => {
    btn.addEventListener('click', () => _switchSlot(btn.dataset.slot));
  });

  el.querySelector(`#${_id}-copy`)?.addEventListener('click', () => {
    // Deep copy current slot
    _clipboardPattern = {};
    VOICES.forEach(v => {
      _clipboardPattern[v] = _steps[v].map(s => ({ ...s }));
    });
  });

  el.querySelector(`#${_id}-paste`)?.addEventListener('click', () => {
    if (!_clipboardPattern) return;
    VOICES.forEach(v => {
      _steps[v] = _clipboardPattern[v].map(s => ({ ...s }));
      _patternSlots[_activeSlot][v] = _steps[v];
    });
    // Refresh UI
    el.querySelectorAll('.drum-machine-step').forEach(stepEl => {
      const voice = stepEl.dataset.voice;
      const i     = parseInt(stepEl.dataset.step);
      _updateStepEl(stepEl, _steps[voice][i]);
    });
  });

  // ── Mute / Solo buttons ───────────────────────────────────────────────────
  el.querySelectorAll('.drum-machine-mute-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const voice = btn.dataset.mute;
      if (_soloVoice === voice) {
        // Unsolo
        _soloVoice = null;
        btn.classList.remove('solo');
        btn.textContent = 'M';
      } else if (e.shiftKey) {
        // Shift+click: solo
        _soloVoice = voice;
        el.querySelectorAll('.drum-machine-mute-btn').forEach(b => {
          b.classList.remove('muted', 'solo');
          b.textContent = 'M';
        });
        btn.classList.add('solo');
        btn.textContent = 'S';
      } else {
        // Regular click: mute toggle
        if (_mutedVoices.has(voice)) {
          _mutedVoices.delete(voice);
          btn.classList.remove('muted');
          btn.textContent = 'M';
        } else {
          _mutedVoices.add(voice);
          btn.classList.add('muted');
          btn.textContent = 'M';
        }
      }
      _refreshAllMuteGains();
    });
  });

  // ── Transport buttons ─────────────────────────────────────────────────────
  const playBtn = el.querySelector(`#${_id}-play`);
  const stopBtn = el.querySelector(`#${_id}-stop`);
  const syncBtn = el.querySelector(`#${_id}-sync`);
  const compBtn = el.querySelector(`#${_id}-comp`);

  playBtn?.addEventListener('click', () => {
    _running = true;
    playBtn.classList.add('active');
    stopBtn.classList.remove('active');
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (!_syncMode) _startStandalone();
  });

  stopBtn?.addEventListener('click', () => {
    _running = false;
    playBtn.classList.remove('active');
    stopBtn.classList.add('active');
    _stopStandalone();
  });

  syncBtn?.addEventListener('click', () => {
    _syncMode = !_syncMode;
    syncBtn.classList.toggle('active', _syncMode);
    if (_syncMode && _schedTimer) _stopStandalone();
    else if (_running && !_syncMode) _startStandalone();
  });

  compBtn?.addEventListener('click', () => {
    _compEnabled = !_compEnabled;
    compBtn.classList.toggle('active', _compEnabled);
    if (ctx && compressor) {
      if (_compEnabled) {
        // Bypass: reduce ratio to 1 (unity)
        compressor.ratio.setTargetAtTime(4, ctx.currentTime, 0.02);
      } else {
        compressor.ratio.setTargetAtTime(1, ctx.currentTime, 0.02);
      }
    }
  });

  // ── Step highlight ─────────────────────────────────────────────────────────
  function _highlightStep(stepIdx) {
    el.querySelectorAll('.drum-machine-step').forEach(s => {
      s.classList.toggle('playing', parseInt(s.dataset.step) === stepIdx);
    });
  }

  // ── Pad flash ─────────────────────────────────────────────────────────────
  const _padFlashTimers = {};
  function _flashPad(voice) {
    const pad = el.querySelector(`.drum-machine-pad[data-voice="${voice}"]`);
    if (!pad) return;
    if (_padFlashTimers[voice]) clearTimeout(_padFlashTimers[voice]);
    pad.classList.add('triggered');
    _padFlashTimers[voice] = setTimeout(() => pad.classList.remove('triggered'), 120);
  }

  // ── VU meter flash ────────────────────────────────────────────────────────
  const _vuTimers = {};
  function _flashVU(voice) {
    const bar = el.querySelector(`.drum-machine-vu-bar[data-vu="${voice}"]`);
    if (!bar) return;
    if (_vuTimers[voice]) clearTimeout(_vuTimers[voice]);
    bar.classList.remove('fade');
    bar.classList.add('flash');
    // Use double rAF to let the browser apply the 'flash' class first
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.classList.remove('flash');
      bar.classList.add('fade');
      _vuTimers[voice] = setTimeout(() => bar.classList.remove('fade'), 280);
    }));
  }

  // ── Cable autoconnect ─────────────────────────────────────────────────────
  window.addEventListener('cable:autoconnect', (e) => {
    const { targetId, targetPort, sourceNode } = e.detail ?? {};
    if (targetId === _id && targetPort === 'audio-out' && sourceNode && ctx && outputGain) {
      outputGain.connect(sourceNode);
    }
  });

  // ── Audio export ──────────────────────────────────────────────────────────
  if (ctx && outputGain) {
    el._drumMachineAudio = outputGain;
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  return el;
}
