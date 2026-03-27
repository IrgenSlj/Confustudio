// tr909.js — Roland TR-909 Drum Machine module

export function createTr909(audioContext) {
  const ctx = audioContext;
  const _id = `module-tr909-${Date.now()}`;

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

  // Steps: array of {active, velocity} per voice, 16 steps each
  // velocity: 0=off, 1=low, 2=med, 3=high
  const _steps = {};
  VOICES.forEach(v => {
    _steps[v] = Array.from({ length: 16 }, (_, i) => ({
      active: DEFAULT_PATTERNS[v][i] === 1,
      velocity: DEFAULT_PATTERNS[v][i] === 1 ? 3 : 0,
    }));
  });

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

  let _seqStep = 0;
  let _running = false;
  let _syncMode = false; // when true, advances on confusynth:clock
  let _standaloneTimer = null;
  let _standaloneBPM = 120;
  let _masterVolume = 0.8;

  // ── Audio Engine ─────────────────────────────────────────────────────────
  // Each voice has a pre-allocated gain node as its VCA output
  const _voiceGains = {};
  const masterGain = ctx ? ctx.createGain() : null;
  const outputGain = ctx ? ctx.createGain() : null;

  if (ctx) {
    masterGain.gain.value = _masterVolume;
    outputGain.gain.value = 1.0;
    masterGain.connect(outputGain);

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

  // ── Drive curve (soft clip) ───────────────────────────────────────────────
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

  // ── Voice synthesis functions ─────────────────────────────────────────────

  function _triggerBD(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.BD;
    // Tune: 100–200 Hz start, 40–80 Hz end
    const startFreq = 100 + p.tune * 100;  // 100–200Hz
    const endFreq   = 40  + p.tune * 40;   // 40–80Hz
    const decayTime = 0.25 + p.decay * 0.5; // 250–750ms
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + decayTime * 0.6);

    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0, time);
    vca.gain.linearRampToValueAtTime(0.9 * velScale, time + 0.002);
    vca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

    // Light distortion
    const ws = ctx.createWaveShaper();
    ws.curve = _makeSoftClip(20);
    ws.oversample = '2x';

    osc.connect(ws);
    ws.connect(vca);
    vca.connect(_voiceGains.BD);

    osc.start(time);
    osc.stop(time + decayTime + 0.05);
  }

  function _triggerSD(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.SD;
    const decayTime = 0.1 + p.decay * 0.25; // 100–350ms
    const snappy    = p.snappy ?? 0.5;
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    const tuneFreq  = 150 + p.tune * 100; // 150–250 Hz

    // Sine body
    const oscBody = ctx.createOscillator();
    oscBody.type = 'sine';
    oscBody.frequency.setValueAtTime(tuneFreq, time);
    oscBody.frequency.exponentialRampToValueAtTime(tuneFreq * 0.6, time + decayTime * 0.5);

    const vcaBody = ctx.createGain();
    vcaBody.gain.setValueAtTime(0, time);
    vcaBody.gain.linearRampToValueAtTime(0.7 * velScale, time + 0.001);
    vcaBody.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

    // Noise snare
    const noise = _createNoiseSource();
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 500 + snappy * 1500; // 500–2000 Hz
    bpf.Q.value = 0.5;

    const vcaNoise = ctx.createGain();
    vcaNoise.gain.setValueAtTime(0, time);
    vcaNoise.gain.linearRampToValueAtTime(0.6 * velScale * (0.5 + snappy * 0.5), time + 0.001);
    vcaNoise.gain.exponentialRampToValueAtTime(0.001, time + decayTime * (0.5 + snappy * 0.5));

    oscBody.connect(vcaBody);
    vcaBody.connect(_voiceGains.SD);

    noise.connect(bpf);
    bpf.connect(vcaNoise);
    vcaNoise.connect(_voiceGains.SD);

    oscBody.start(time);
    oscBody.stop(time + decayTime + 0.05);
    noise.start(time);
    noise.stop(time + decayTime + 0.05);
  }

  function _triggerTom(voice, baseFreq, decayMs, velocity, time) {
    if (!ctx) return;
    const p = _voiceParams[voice];
    const freq = baseFreq * Math.pow(2, (p.tune - 0.5) * 1.5); // ±1.5 octave tune
    const decayTime = (decayMs / 1000) * (0.5 + p.decay);
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;

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

  function _triggerRS(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.RS;
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    const freq = 300 + p.tune * 200; // 300–500 Hz

    // Short sine burst
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const vcaOsc = ctx.createGain();
    vcaOsc.gain.setValueAtTime(0, time);
    vcaOsc.gain.linearRampToValueAtTime(0.5 * velScale, time + 0.001);
    vcaOsc.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    // Very short noise
    const noise = _createNoiseSource();
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
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

  function _triggerCP(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.CP;
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    const decayTime = 0.1 + p.decay * 0.2;
    // 4 staggered noise bursts at 0, 10, 20, 35ms
    const delays = [0, 0.010, 0.020, 0.035];

    delays.forEach((d, i) => {
      const t = time + d;
      const noise = _createNoiseSource();
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 900 + p.tune * 300; // 900–1200 Hz
      bpf.Q.value = 1.0;

      const burstLen = i < 3 ? 0.006 : decayTime; // first 3 short, last has decay
      const vca = ctx.createGain();
      vca.gain.setValueAtTime(0, t);
      vca.gain.linearRampToValueAtTime(0.6 * velScale, t + 0.001);
      vca.gain.exponentialRampToValueAtTime(0.001, t + burstLen);

      noise.connect(bpf); bpf.connect(vca); vca.connect(_voiceGains.CP);
      noise.start(t); noise.stop(t + burstLen + 0.05);
    });
  }

  function _triggerCB(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.CB;
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    const decayTime = 0.3 + p.decay * 0.6;
    const tuneMult  = Math.pow(2, (p.tune - 0.5) * 0.5);

    // Two square waves at 562 Hz and 845 Hz
    const freqs = [562 * tuneMult, 845 * tuneMult];
    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 700 * tuneMult;
      bpf.Q.value = 2.0;

      const vca = ctx.createGain();
      vca.gain.setValueAtTime(0, time);
      vca.gain.linearRampToValueAtTime(0.35 * velScale, time + 0.001);
      vca.gain.setValueAtTime(0.35 * velScale, time + 0.006);
      vca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);

      osc.connect(bpf); bpf.connect(vca); vca.connect(_voiceGains.CB);
      osc.start(time); osc.stop(time + decayTime + 0.05);
    });
  }

  // Shared metallic HH oscillator frequencies (Hz)
  const HH_FREQS = [205.3, 309.1, 416.7, 522.4, 633.8, 769.2];

  function _makeHHOscs(time, decayTime, velScale, destGain) {
    HH_FREQS.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const g = ctx.createGain();
      g.gain.value = 0.15 / HH_FREQS.length; // normalize

      osc.connect(g);
      g.connect(destGain);
      osc.start(time);
      osc.stop(time + decayTime + 0.05);
    });
  }

  // Open HH state — store current open HH VCA so CH can choke it
  let _ohVca = null;
  let _ohChokeTime = null;

  function _triggerOH(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.OH;
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    const decayTime = 0.2 + p.decay * 0.6;

    // Create a sub-gain for this OH instance so CH can choke it
    const ohVca = ctx.createGain();
    ohVca.gain.setValueAtTime(0, time);
    ohVca.gain.linearRampToValueAtTime(velScale, time + 0.001);
    ohVca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    ohVca.connect(_voiceGains.OH);

    // BPF + HPF for metallic character
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 8000 + p.tune * 4000;
    bpf.Q.value = 0.5;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;

    _makeHHOscs(time, decayTime, velScale, bpf);
    bpf.connect(hpf);
    hpf.connect(ohVca);

    _ohVca = ohVca;
    _ohChokeTime = time;
  }

  function _triggerCH(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.CH;
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    const decayTime = 0.04 + p.decay * 0.06; // 40–100ms very short

    // Choke any open HH
    if (_ohVca) {
      _ohVca.gain.cancelScheduledValues(time);
      _ohVca.gain.setTargetAtTime(0, time, 0.005);
      _ohVca = null;
    }

    const chVca = ctx.createGain();
    chVca.gain.setValueAtTime(0, time);
    chVca.gain.linearRampToValueAtTime(velScale, time + 0.001);
    chVca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    chVca.connect(_voiceGains.CH);

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 8000 + p.tune * 4000;
    bpf.Q.value = 0.7;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 5000;

    _makeHHOscs(time, decayTime, velScale, bpf);
    bpf.connect(hpf);
    hpf.connect(chVca);
  }

  function _triggerCY(velocity, time) {
    if (!ctx) return;
    const p = _voiceParams.CY;
    const velScale  = velocity === 1 ? 0.5 : velocity === 2 ? 0.75 : 1.0;
    const decayTime = 1.5 + p.decay * 3.0; // 1.5–4.5s long
    const tuneMult  = Math.pow(2, (p.tune - 0.5) * 0.5);

    const cyVca = ctx.createGain();
    cyVca.gain.setValueAtTime(0, time);
    cyVca.gain.linearRampToValueAtTime(0.5 * velScale, time + 0.001);
    cyVca.gain.exponentialRampToValueAtTime(0.001, time + decayTime);
    cyVca.connect(_voiceGains.CY);

    // Cymbal: similar HH but slightly detuned and more high-frequency content
    const CY_FREQS = [205.3 * tuneMult, 309.1 * tuneMult, 416.7 * tuneMult,
                      522.4 * tuneMult * 1.02, 633.8 * tuneMult * 1.01, 769.2 * tuneMult];

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 6000 * tuneMult;
    bpf.Q.value = 0.3;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 4000;

    // Add noise layer for cymbal sizzle
    const noise = _createNoiseSource();
    const noiseBpf = ctx.createBiquadFilter();
    noiseBpf.type = 'bandpass';
    noiseBpf.frequency.value = 8000;
    noiseBpf.Q.value = 1.0;
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

  // ── Master trigger dispatcher ─────────────────────────────────────────────
  function _triggerVoice(voice, velocity, time) {
    if (!ctx) return;
    const now = time ?? ctx.currentTime;
    const v = velocity ?? 3;
    const p = _voiceParams[voice];

    // Flash pad LED
    _flashPad(voice);

    // Dispatch note on
    window.dispatchEvent(new CustomEvent('confusynth:note:on', {
      detail: { source: 'tr909', voice, velocity: v, time: now },
    }));

    switch (voice) {
      case 'BD': _triggerBD(v, now); break;
      case 'SD': _triggerSD(v, now); break;
      case 'LT': _triggerTom('LT', 80  + p.tune * 60,  200, v, now); break;
      case 'MT': _triggerTom('MT', 110 + p.tune * 80,  180, v, now); break;
      case 'HT': _triggerTom('HT', 160 + p.tune * 100, 160, v, now); break;
      case 'RS': _triggerRS(v, now); break;
      case 'CP': _triggerCP(v, now); break;
      case 'CB': _triggerCB(v, now); break;
      case 'OH': _triggerOH(v, now); break;
      case 'CH': _triggerCH(v, now); break;
      case 'CY': _triggerCY(v, now); break;
    }
  }

  // ── Sequencer step trigger ────────────────────────────────────────────────
  function _triggerStep(stepIdx) {
    const now = ctx ? ctx.currentTime : 0;
    VOICES.forEach(voice => {
      const step = _steps[voice][stepIdx];
      if (step.active && step.velocity > 0) {
        _triggerVoice(voice, step.velocity, now);
      }
    });
    _highlightStep(stepIdx);
  }

  // ── Standalone transport ──────────────────────────────────────────────────
  function _startStandalone() {
    if (_standaloneTimer) clearInterval(_standaloneTimer);
    const msPerBeat = 60000 / _standaloneBPM;
    const msPerStep = msPerBeat / 4;
    _seqStep = 0;
    _standaloneTimer = setInterval(() => {
      _triggerStep(_seqStep % 16);
      _seqStep = (_seqStep + 1) % 16;
    }, msPerStep);
  }

  function _stopStandalone() {
    if (_standaloneTimer) { clearInterval(_standaloneTimer); _standaloneTimer = null; }
    _highlightStep(-1);
  }

  // ── Clock sync ────────────────────────────────────────────────────────────
  window.addEventListener('confusynth:clock', (e) => {
    const { step, bpm } = e.detail ?? {};
    if (!_running || !_syncMode) return;
    if (bpm && _standaloneBPM !== bpm) _standaloneBPM = bpm;
    _stopStandalone();
    const s = typeof step === 'number' ? step % 16 : _seqStep;
    _triggerStep(s);
    _seqStep = (s + 1) % 16;
  });

  // ── DOM ───────────────────────────────────────────────────────────────────
  if (!document.querySelector('#tr909-styles')) {
    const style = document.createElement('style');
    style.id = 'tr909-styles';
    style.textContent = `
      .tr909-chassis {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        background: linear-gradient(180deg, #ddd5c2 0%, #cfc5b0 100%);
        border: 2px solid #a89880;
        border-radius: 8px;
        width: 920px;
        min-height: 280px;
        box-shadow: 0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3);
        padding: 8px 12px 12px;
        box-sizing: border-box;
        color: #2a2218;
        user-select: none;
        position: relative;
      }

      /* Port bar */
      .tr909-port-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid #b8a890;
      }
      .tr909-brand {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 3px;
        color: #3a2e1e;
        text-transform: uppercase;
      }
      .tr909-port-bar .port {
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
      .tr909-port-bar .port:hover { background: #2e2824; }

      /* Pads row */
      .tr909-pads-row {
        display: flex;
        gap: 5px;
        margin-bottom: 8px;
        align-items: flex-end;
      }
      .tr909-pad-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        flex: 1;
      }
      .tr909-pad {
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
      }
      .tr909-pad:hover {
        background: linear-gradient(160deg, #6e6460 0%, #4e4a48 100%);
      }
      .tr909-pad.triggered {
        background: linear-gradient(160deg, #ff9010 0%, #e06000 100%);
        box-shadow: 0 0 10px rgba(255,140,0,0.7), inset 0 1px 0 rgba(255,255,200,0.3);
      }
      .tr909-pad-label {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #5a4e3a;
        text-transform: uppercase;
      }

      /* Voice knob rows */
      .tr909-voice-knobs {
        display: flex;
        gap: 5px;
        margin-bottom: 6px;
      }
      .tr909-voice-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
      }
      .tr909-mini-knob-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }
      .tr909-mini-knob {
        width: 22px;
        height: 22px;
        background: radial-gradient(circle at 40% 35%, #6a6560, #2a2820);
        border-radius: 50%;
        border: 1px solid #1a1814;
        cursor: pointer;
        position: relative;
        box-shadow: 0 1px 3px rgba(0,0,0,0.6);
      }
      .tr909-mini-knob::after {
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
      .tr909-mini-label {
        font-size: 7px;
        font-weight: 700;
        color: #7a6a50;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      /* Sequencer steps */
      .tr909-seq-section {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .tr909-seq-row {
        display: flex;
        align-items: center;
        gap: 3px;
      }
      .tr909-seq-voice-label {
        font-size: 9px;
        font-weight: 700;
        color: #5a4e3a;
        width: 24px;
        text-align: right;
        flex-shrink: 0;
        letter-spacing: 0.5px;
      }
      .tr909-steps {
        display: flex;
        gap: 3px;
        flex: 1;
      }
      .tr909-step {
        flex: 1;
        height: 20px;
        background: #3a3230;
        border: 1px solid #2a2220;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.06s;
        position: relative;
        min-width: 0;
      }
      .tr909-step:nth-child(4n+1) { margin-left: 3px; }
      .tr909-step.active {
        background: #c06000;
        border-color: #ff8c00;
        box-shadow: 0 0 4px rgba(255,140,0,0.5);
      }
      .tr909-step.active-low  { background: #804000; border-color: #a05000; }
      .tr909-step.active-mid  { background: #c06000; border-color: #e07000; }
      .tr909-step.active-high { background: #ff8c00; border-color: #ffaa30; box-shadow: 0 0 5px rgba(255,140,0,0.6); }
      .tr909-step.playing {
        outline: 2px solid #ffe060;
        outline-offset: 1px;
        background: #ffe060 !important;
        border-color: #ffe060 !important;
      }
      .tr909-step:hover { filter: brightness(1.2); }

      /* Bottom controls */
      .tr909-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid #b8a890;
      }
      .tr909-transport {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .tr909-btn {
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
      .tr909-btn:hover { background: linear-gradient(180deg, #5a5450 0%, #3e3a38 100%); }
      .tr909-btn.active {
        background: linear-gradient(180deg, #e07000 0%, #a04800 100%);
        color: #fff8e8;
        box-shadow: 0 0 8px rgba(255,140,0,0.4);
      }
      .tr909-sync-btn {
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
      .tr909-sync-btn.active {
        background: linear-gradient(180deg, #205050 0%, #103030 100%);
        color: #40e0d0;
        box-shadow: 0 0 6px rgba(64,224,208,0.3);
      }
      .tr909-master-knob-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tr909-knob-lg {
        width: 34px;
        height: 34px;
        background: radial-gradient(circle at 38% 32%, #7a7470, #2a2820);
        border-radius: 50%;
        border: 1px solid #1a1814;
        cursor: pointer;
        position: relative;
        box-shadow: 0 2px 6px rgba(0,0,0,0.7);
      }
      .tr909-knob-lg::after {
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
      .tr909-bpm-display {
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
      }
      .tr909-label-sm {
        font-size: 9px;
        font-weight: 700;
        color: #7a6a50;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'studio-module tr909-chassis';
  el.id = _id;
  el.dataset.moduleType = 'tr909';

  // Pad row HTML
  const padsHtml = VOICES.map(v => `
    <div class="tr909-pad-wrap">
      <div class="tr909-pad" data-voice="${v}" title="${VOICE_LABELS[v]}"></div>
      <span class="tr909-pad-label">${v}</span>
    </div>
  `).join('');

  // Voice knob mini-rows: tune + decay + volume per voice
  const voiceKnobsHtml = VOICES.map(v => {
    const p = _voiceParams[v];
    const knobAngle = (val) => -135 + val * 270;
    const hasSnappy = v === 'SD';
    return `
      <div class="tr909-voice-col">
        <div class="tr909-mini-knob-wrap">
          <div class="tr909-mini-knob" data-voice="${v}" data-param="tune"
               style="--r: ${knobAngle(p.tune)}deg" title="${v} Tune"></div>
          <span class="tr909-mini-label">TUN</span>
        </div>
        <div class="tr909-mini-knob-wrap">
          <div class="tr909-mini-knob" data-voice="${v}" data-param="decay"
               style="--r: ${knobAngle(p.decay)}deg" title="${v} Decay"></div>
          <span class="tr909-mini-label">DEC</span>
        </div>
        ${hasSnappy ? `
        <div class="tr909-mini-knob-wrap">
          <div class="tr909-mini-knob" data-voice="${v}" data-param="snappy"
               style="--r: ${knobAngle(p.snappy ?? 0.5)}deg" title="${v} Snappy"></div>
          <span class="tr909-mini-label">SNP</span>
        </div>` : ''}
        <div class="tr909-mini-knob-wrap">
          <div class="tr909-mini-knob" data-voice="${v}" data-param="volume"
               style="--r: ${knobAngle(p.volume)}deg" title="${v} Volume"></div>
          <span class="tr909-mini-label">VOL</span>
        </div>
      </div>
    `;
  }).join('');

  // Step sequencer rows
  const seqRowsHtml = VOICES.map(v => {
    const stepsHtml = Array.from({ length: 16 }, (_, i) => {
      const step = _steps[v][i];
      let cls = '';
      if (step.active) {
        cls = step.velocity === 1 ? 'active active-low'
            : step.velocity === 2 ? 'active active-mid'
            : 'active active-high';
      }
      return `<div class="tr909-step ${cls}" data-voice="${v}" data-step="${i}"></div>`;
    }).join('');
    return `
      <div class="tr909-seq-row">
        <span class="tr909-seq-voice-label">${v}</span>
        <div class="tr909-steps" data-voice="${v}">${stepsHtml}</div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div class="tr909-port-bar">
      <span class="tr909-brand">TR-909</span>
      <span class="port" data-port="audio-out">AUDIO OUT</span>
    </div>
    <div class="tr909-pads-row">${padsHtml}</div>
    <div class="tr909-voice-knobs">${voiceKnobsHtml}</div>
    <div class="tr909-seq-section">${seqRowsHtml}</div>
    <div class="tr909-bottom">
      <div class="tr909-transport">
        <button class="tr909-btn" id="${_id}-play">&#9654; PLAY</button>
        <button class="tr909-btn" id="${_id}-stop">&#9632; STOP</button>
        <button class="tr909-sync-btn" id="${_id}-sync" title="Sync to confusynth:clock">SYNC</button>
      </div>
      <div class="tr909-master-knob-wrap">
        <span class="tr909-label-sm">MASTER</span>
        <div class="tr909-knob-lg" id="${_id}-mvol" title="Master Volume"></div>
        <span class="tr909-label-sm">VOL</span>
        <div class="tr909-bpm-display" id="${_id}-bpm">120</div>
        <span class="tr909-label-sm">BPM</span>
      </div>
    </div>
  `;

  // ── Knob rotation CSS sync ────────────────────────────────────────────────
  function _knobAngleDeg(val) {
    return -135 + val * 270;
  }

  function _setKnobRotation(knobEl, val) {
    knobEl.style.setProperty('--r', `${_knobAngleDeg(val)}deg`);
    // Use ::after pseudo — drive via transform on the knob element directly
    // We override the ::after with a real indicator div approach using inline style
    knobEl.style.transform = `rotate(${_knobAngleDeg(val)}deg)`;
  }

  // Initialize knob rotations
  el.querySelectorAll('.tr909-mini-knob').forEach(knob => {
    const voice = knob.dataset.voice;
    const param = knob.dataset.param;
    const val = _voiceParams[voice]?.[param] ?? 0.5;
    _setKnobRotation(knob, val);
  });

  _setKnobRotation(el.querySelector(`#${_id}-mvol`), _masterVolume);

  // ── Knob drag interaction ─────────────────────────────────────────────────
  function _attachKnobDrag(knobEl, getter, setter) {
    let startY = 0, startVal = 0;
    knobEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      knobEl.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startVal = getter();
    });
    knobEl.addEventListener('pointermove', e => {
      if (!e.buttons) return;
      const delta = (startY - e.clientY) / 150;
      const newVal = Math.max(0, Math.min(1, startVal + delta));
      setter(newVal);
      _setKnobRotation(knobEl, newVal);
    });
  }

  el.querySelectorAll('.tr909-mini-knob').forEach(knob => {
    const voice = knob.dataset.voice;
    const param = knob.dataset.param;
    _attachKnobDrag(
      knob,
      () => _voiceParams[voice]?.[param] ?? 0.5,
      (val) => {
        _voiceParams[voice][param] = val;
        if (param === 'volume' && ctx && _voiceGains[voice]) {
          _voiceGains[voice].gain.setTargetAtTime(val, ctx.currentTime, 0.02);
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
      if (ctx && masterGain) {
        masterGain.gain.setTargetAtTime(val, ctx.currentTime, 0.02);
      }
    }
  );

  // ── BPM display (click + scroll to change) ───────────────────────────────
  const bpmDisplay = el.querySelector(`#${_id}-bpm`);
  bpmDisplay?.addEventListener('wheel', e => {
    e.preventDefault();
    _standaloneBPM = Math.max(40, Math.min(280, _standaloneBPM - Math.sign(e.deltaY)));
    bpmDisplay.textContent = _standaloneBPM;
    if (_running && !_syncMode && _standaloneTimer) _startStandalone();
  });
  bpmDisplay?.addEventListener('click', () => {
    const input = prompt('Enter BPM (40–280):', _standaloneBPM);
    if (input === null) return;
    const v = parseInt(input);
    if (!isNaN(v) && v >= 40 && v <= 280) {
      _standaloneBPM = v;
      bpmDisplay.textContent = v;
      if (_running && !_syncMode && _standaloneTimer) _startStandalone();
    }
  });

  // ── Pad triggers ─────────────────────────────────────────────────────────
  el.querySelectorAll('.tr909-pad').forEach(pad => {
    pad.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      _triggerVoice(pad.dataset.voice, 3);
    });
  });

  // ── Step buttons ─────────────────────────────────────────────────────────
  el.querySelectorAll('.tr909-step').forEach(stepEl => {
    stepEl.addEventListener('click', e => {
      e.preventDefault();
      const voice = stepEl.dataset.voice;
      const i = parseInt(stepEl.dataset.step);
      const step = _steps[voice][i];

      if (!step.active) {
        // Off → high
        step.active = true;
        step.velocity = 3;
      } else if (step.velocity === 3) {
        // High → mid
        step.velocity = 2;
      } else if (step.velocity === 2) {
        // Mid → low
        step.velocity = 1;
      } else {
        // Low → off
        step.active = false;
        step.velocity = 0;
      }

      stepEl.classList.toggle('active', step.active);
      stepEl.classList.toggle('active-low',  step.active && step.velocity === 1);
      stepEl.classList.toggle('active-mid',  step.active && step.velocity === 2);
      stepEl.classList.toggle('active-high', step.active && step.velocity === 3);
    });
  });

  // ── Transport buttons ─────────────────────────────────────────────────────
  const playBtn = el.querySelector(`#${_id}-play`);
  const stopBtn = el.querySelector(`#${_id}-stop`);
  const syncBtn = el.querySelector(`#${_id}-sync`);

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
    if (_syncMode && _standaloneTimer) _stopStandalone();
    else if (_running && !_syncMode) _startStandalone();
  });

  // ── Step highlight ─────────────────────────────────────────────────────────
  function _highlightStep(stepIdx) {
    el.querySelectorAll('.tr909-step').forEach(s => {
      s.classList.toggle('playing', parseInt(s.dataset.step) === stepIdx);
    });
  }

  // ── Pad flash ─────────────────────────────────────────────────────────────
  const _padFlashTimers = {};
  function _flashPad(voice) {
    const pad = el.querySelector(`.tr909-pad[data-voice="${voice}"]`);
    if (!pad) return;
    if (_padFlashTimers[voice]) clearTimeout(_padFlashTimers[voice]);
    pad.classList.add('triggered');
    _padFlashTimers[voice] = setTimeout(() => pad.classList.remove('triggered'), 120);
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
    el._tr909Audio = outputGain;
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  return el;
}
