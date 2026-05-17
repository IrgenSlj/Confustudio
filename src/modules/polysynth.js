// polysynth.js — Polysynth 6-voice polyphonic synthesizer module

export function createPolysynth(audioContext) {
  const ctx = audioContext;

  // ── Audio engine ────────────────────────────────────────────────────────────
  const params = {
    attack: 0.01,
    decay: 0.3,
    sustain: 0.7,
    release: 0.5,
    cutoff: 8000,
    resonance: 0,
    envAmount: 0.5,
    vcaLevel: 0.8,
    hpfFreq: 20,
    lfoRate: 0.5,
    lfoDelay: 0,
    lfoDcoDepth: 0,
    lfoVcfDepth: 0,
    sawOn: true,
    subOn: false,
    noiseOn: false,
    chorusMode: 1, // 0=off, 1=I, 2=II
    portamento: 0, // 0–1, maps to 0–300ms glide time
  };

  // ── Patch presets ──────────────────────────────────────────────────────────
  const PATCHES = {
    Strings: {
      attack: 0.3,
      decay: 0.4,
      sustain: 0.8,
      release: 1.2,
      cutoff: 5000,
      resonance: 0.1,
      envAmount: 0.2,
      vcaLevel: 0.8,
      hpfFreq: 20,
      lfoRate: 3.5,
      lfoDcoDepth: 8,
      lfoVcfDepth: 0,
      sawOn: true,
      subOn: false,
      noiseOn: false,
      chorusMode: 1,
      portamento: 0.1,
    },
    Brass: {
      attack: 0.08,
      decay: 0.3,
      sustain: 0.7,
      release: 0.2,
      cutoff: 9000,
      resonance: 0.25,
      envAmount: 0.7,
      vcaLevel: 0.85,
      hpfFreq: 60,
      lfoRate: 0.5,
      lfoDcoDepth: 0,
      lfoVcfDepth: 0,
      sawOn: true,
      subOn: true,
      noiseOn: false,
      chorusMode: 0,
      portamento: 0,
    },
    'Soft Pad': {
      attack: 0.8,
      decay: 0.6,
      sustain: 0.9,
      release: 1.8,
      cutoff: 3500,
      resonance: 0.05,
      envAmount: 0.15,
      vcaLevel: 0.75,
      hpfFreq: 20,
      lfoRate: 2.0,
      lfoDcoDepth: 6,
      lfoVcfDepth: 0,
      sawOn: true,
      subOn: false,
      noiseOn: false,
      chorusMode: 2,
      portamento: 0.15,
    },
    'Sync Lead': {
      attack: 0.005,
      decay: 0.2,
      sustain: 0.6,
      release: 0.3,
      cutoff: 7000,
      resonance: 0.55,
      envAmount: 0.5,
      vcaLevel: 0.9,
      hpfFreq: 40,
      lfoRate: 5.0,
      lfoDcoDepth: 20,
      lfoVcfDepth: 0,
      sawOn: true,
      subOn: false,
      noiseOn: false,
      chorusMode: 0,
      portamento: 0.05,
    },
    Pluck: {
      attack: 0.002,
      decay: 0.18,
      sustain: 0.0,
      release: 0.12,
      cutoff: 6000,
      resonance: 0.3,
      envAmount: 0.6,
      vcaLevel: 0.9,
      hpfFreq: 80,
      lfoRate: 0.5,
      lfoDcoDepth: 0,
      lfoVcfDepth: 0,
      sawOn: true,
      subOn: false,
      noiseOn: false,
      chorusMode: 0,
      portamento: 0,
    },
    Organ: {
      attack: 0.002,
      decay: 0.1,
      sustain: 1.0,
      release: 0.05,
      cutoff: 18000,
      resonance: 0,
      envAmount: 0,
      vcaLevel: 0.8,
      hpfFreq: 20,
      lfoRate: 1.5,
      lfoDcoDepth: 4,
      lfoVcfDepth: 0,
      sawOn: true,
      subOn: true,
      noiseOn: false,
      chorusMode: 1,
      portamento: 0,
    },
    Bass: {
      attack: 0.005,
      decay: 0.4,
      sustain: 0.3,
      release: 0.2,
      cutoff: 1800,
      resonance: 0.4,
      envAmount: 0.5,
      vcaLevel: 0.95,
      hpfFreq: 20,
      lfoRate: 0.5,
      lfoDcoDepth: 0,
      lfoVcfDepth: 0,
      sawOn: false,
      subOn: true,
      noiseOn: false,
      chorusMode: 0,
      portamento: 0,
    },
    'Juno Arp': {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.7,
      release: 0.5,
      cutoff: 7500,
      resonance: 0.15,
      envAmount: 0.45,
      vcaLevel: 0.82,
      hpfFreq: 20,
      lfoRate: 1.8,
      lfoDcoDepth: 5,
      lfoVcfDepth: 0,
      sawOn: true,
      subOn: true,
      noiseOn: false,
      chorusMode: 1,
      portamento: 0.08,
    },
  };

  let voices = [];
  let lfo, lfoGain, lfoVcfGain;
  let voiceSum, chorusDry, delay1, delay2, chorusLFO, chorus2LFO, depthGain, depth2, outputGain;
  let voiceIdx = 0;

  // ── Hold pedal / Latch ─────────────────────────────────────────────────────
  let _holdActive = false;
  const _heldNotes = new Set(); // midi notes currently held by latch

  // ── Arpeggiator ────────────────────────────────────────────────────────────
  let _arpActive = false;
  let _arpNotes = []; // currently arpeggiated note pool
  let _arpIdx = 0;
  const _arpDir = 1; // for UP-DOWN mode
  let _arpMode = 'UP'; // UP | DOWN | UP-DOWN | RANDOM
  let _arpRate = '1/8'; // 1/4 | 1/8 | 1/16
  let _arpTimer = null;
  let _arpClockBPM = 120;
  let _arpClockActive = false; // true when clock events are driving arp

  function _arpNextNote() {
    if (_arpNotes.length === 0) return;
    const sorted = [..._arpNotes].sort((a, b) => a - b);
    let note;
    if (_arpMode === 'UP') {
      note = sorted[_arpIdx % sorted.length];
      _arpIdx = (_arpIdx + 1) % sorted.length;
    } else if (_arpMode === 'DOWN') {
      const rev = [...sorted].reverse();
      note = rev[_arpIdx % rev.length];
      _arpIdx = (_arpIdx + 1) % rev.length;
    } else if (_arpMode === 'UP-DOWN') {
      const full = sorted.length > 1 ? [...sorted, ...sorted.slice(1, -1).reverse()] : sorted;
      note = full[_arpIdx % full.length];
      _arpIdx = (_arpIdx + 1) % full.length;
    } else {
      note = sorted[Math.floor(Math.random() * sorted.length)];
    }
    // Stop any sounding arp voice, then trigger new one
    voices.forEach((v) => {
      if (v.arpNote && v.arpNote !== note) {
        _releaseVoice(v);
        v.arpNote = null;
      }
    });
    _triggerNoteOn(note, 90);
    // Track which voice is playing the arp note for release
    const av = [...voices].filter((v) => v.note === note).pop();
    if (av) av.arpNote = note;
  }

  function _startArpTimer() {
    if (_arpTimer) clearInterval(_arpTimer);
    const rateMap = { '1/4': 1, '1/8': 0.5, '1/16': 0.25 };
    const beats = rateMap[_arpRate] ?? 0.5;
    const ms = (60000 / _arpClockBPM) * beats;
    _arpTimer = setInterval(_arpNextNote, ms);
  }

  function _stopArpTimer() {
    if (_arpTimer) {
      clearInterval(_arpTimer);
      _arpTimer = null;
    }
    // Release all arp voices
    voices.forEach((v) => {
      if (v.arpNote) {
        _releaseVoice(v);
        v.arpNote = null;
      }
    });
  }

  function makeVoice(actx) {
    const saw = actx.createOscillator();
    saw.type = 'sawtooth';
    const sub = actx.createOscillator();
    sub.type = 'square';

    // White noise: 2-second looping buffer
    const noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = actx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const sawGain = actx.createGain();
    sawGain.gain.value = 1;
    const subGain = actx.createGain();
    subGain.gain.value = 0;
    const noiseGain = actx.createGain();
    noiseGain.gain.value = 0;

    const dcoSum = actx.createGain();
    dcoSum.gain.value = 0.4;
    saw.connect(sawGain);
    sawGain.connect(dcoSum);
    sub.connect(subGain);
    subGain.connect(dcoSum);
    noise.connect(noiseGain);
    noiseGain.connect(dcoSum);

    const hpf = actx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 20;
    hpf.Q.value = 0.5;
    const vcf1 = actx.createBiquadFilter();
    vcf1.type = 'lowpass';
    vcf1.frequency.value = 8000;
    vcf1.Q.value = 0;
    const vcf2 = actx.createBiquadFilter();
    vcf2.type = 'lowpass';
    vcf2.frequency.value = 8000;
    vcf2.Q.value = 0;
    const vca = actx.createGain();
    vca.gain.value = 0;

    dcoSum.connect(hpf);
    hpf.connect(vcf1);
    vcf1.connect(vcf2);
    vcf2.connect(vca);

    saw.start();
    sub.start();
    noise.start();

    return {
      saw,
      sub,
      noise,
      sawGain,
      subGain,
      noiseGain,
      dcoSum,
      hpf,
      vcf1,
      vcf2,
      vca,
      active: false,
      note: -1,
      startTime: 0,
      lastFreq: 0,
      arpNote: null,
    };
  }

  if (ctx) {
    // 6 voices
    voices = Array.from({ length: 6 }, () => makeVoice(ctx));

    // Global LFO
    lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.5;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfoVcfGain = ctx.createGain();
    lfoVcfGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfo.connect(lfoVcfGain);
    lfo.start();

    // Voice sum bus
    voiceSum = ctx.createGain();
    voiceSum.gain.value = 1;
    voices.forEach((v) => {
      v.vca.connect(voiceSum);
      // LFO -> DCO freq mod
      lfoGain.connect(v.saw.frequency);
      lfoGain.connect(v.sub.frequency);
      // LFO -> VCF freq mod
      lfoVcfGain.connect(v.vcf1.frequency);
      lfoVcfGain.connect(v.vcf2.frequency);
    });

    // Chorus (BBD emulation)
    chorusDry = ctx.createGain();
    chorusDry.gain.value = 0.5;
    const chorusMix = ctx.createGain();
    chorusMix.gain.value = 0.5;

    delay1 = ctx.createDelay(0.03);
    delay1.delayTime.value = 0.012;
    delay2 = ctx.createDelay(0.03);
    delay2.delayTime.value = 0.018;

    chorusLFO = ctx.createOscillator();
    chorusLFO.type = 'triangle';
    chorusLFO.frequency.value = 0.513;
    chorus2LFO = ctx.createOscillator();
    chorus2LFO.type = 'triangle';
    chorus2LFO.frequency.value = 0.863;
    depthGain = ctx.createGain();
    depthGain.gain.value = 0.004;
    depth2 = ctx.createGain();
    depth2.gain.value = 0.003;

    chorusLFO.connect(depthGain);
    depthGain.connect(delay1.delayTime);
    depthGain.connect(delay2.delayTime);
    chorus2LFO.connect(depth2);
    depth2.connect(delay2.delayTime);
    chorusLFO.start();
    chorus2LFO.start();

    outputGain = ctx.createGain();
    outputGain.gain.value = 0.75;

    // voiceSum -> dry + delay1 + delay2 -> outputGain
    voiceSum.connect(chorusDry);
    voiceSum.connect(delay1);
    voiceSum.connect(delay2);
    chorusDry.connect(outputGain);
    delay1.connect(chorusMix);
    delay2.connect(chorusMix);
    chorusMix.connect(outputGain);

    outputGain.connect(ctx.destination);

    // Apply initial chorus mode
    _applyChorusMode(params.chorusMode);
  }

  function _applyChorusMode(mode) {
    if (!ctx) return;
    if (mode === 0) {
      chorusDry.gain.setTargetAtTime(1.0, ctx.currentTime, 0.02);
      depthGain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      depth2.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    } else if (mode === 1) {
      chorusDry.gain.setTargetAtTime(0.6, ctx.currentTime, 0.02);
      depthGain.gain.setTargetAtTime(0.003, ctx.currentTime, 0.02);
      depth2.gain.setTargetAtTime(0.002, ctx.currentTime, 0.02);
    } else {
      chorusDry.gain.setTargetAtTime(0.4, ctx.currentTime, 0.02);
      depthGain.gain.setTargetAtTime(0.006, ctx.currentTime, 0.02);
      depth2.gain.setTargetAtTime(0.004, ctx.currentTime, 0.02);
    }
  }

  function _applyPatch(patchName) {
    const p = PATCHES[patchName];
    if (!p) return;
    Object.assign(params, p);

    // Sync sliders to new param values
    Object.entries(p).forEach(([k, v]) => {
      if (typeof v === 'boolean') return;
      const sl = el.querySelector(`.polysynth-slider[data-param="${k}"]`);
      if (sl) sl.value = v;
    });

    // DCO source buttons
    el.querySelectorAll('[data-dco]').forEach((btn) => {
      const src = btn.dataset.dco;
      const on = src === 'saw' ? p.sawOn : src === 'sub' ? p.subOn : p.noiseOn;
      btn.classList.toggle('polysynth-sw--on', !!on);
    });

    // Chorus
    el.querySelectorAll('.polysynth-chorus-btn').forEach((btn) => {
      const match = parseInt(btn.dataset.chorus) === p.chorusMode;
      btn.classList.toggle('polysynth-chorus-btn--active', match);
    });
    _applyChorusMode(p.chorusMode);

    // HPF: find closest preset freq
    const HPF_FREQS = [20, 240, 800, 3000];
    const hpfIdx = HPF_FREQS.reduce(
      (best, f, i) => (Math.abs(f - p.hpfFreq) < Math.abs(HPF_FREQS[best] - p.hpfFreq) ? i : best),
      0,
    );
    el.querySelectorAll('.polysynth-hpf-btn').forEach((btn) => {
      btn.classList.toggle('polysynth-hpf-btn--active', parseInt(btn.dataset.hpf) === hpfIdx);
    });
    if (ctx) {
      voices.forEach((v) => v.hpf.frequency.setTargetAtTime(p.hpfFreq, ctx.currentTime, 0.02));
    }

    // Portamento slider
    const portSl = el.querySelector('.polysynth-slider[data-param="portamento"]');
    if (portSl) portSl.value = p.portamento;

    _updateADSRCanvas();
    _updateVoiceDots();
  }

  function _triggerNoteOn(midi, vel = 100) {
    if (!ctx) return;
    const v = voices[voiceIdx++ % 6];
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const t = ctx.currentTime;
    const glideMs = params.portamento * 300; // 0–300ms

    // Portamento: glide from last freq to new freq via exponential ramp
    if (glideMs > 0 && v.lastFreq > 0) {
      const glideTime = glideMs / 1000;
      v.saw.frequency.cancelScheduledValues(t);
      v.sub.frequency.cancelScheduledValues(t);
      v.saw.frequency.setValueAtTime(Math.max(20, v.lastFreq), t);
      v.sub.frequency.setValueAtTime(Math.max(20, v.lastFreq / 2), t);
      v.saw.frequency.exponentialRampToValueAtTime(Math.max(20, freq), t + glideTime);
      v.sub.frequency.exponentialRampToValueAtTime(Math.max(20, freq / 2), t + glideTime);
    } else {
      v.saw.frequency.cancelScheduledValues(t);
      v.sub.frequency.cancelScheduledValues(t);
      v.saw.frequency.setValueAtTime(freq, t);
      v.sub.frequency.setValueAtTime(freq / 2, t);
    }
    v.lastFreq = freq;

    v.sawGain.gain.setValueAtTime(params.sawOn ? 1 : 0, t);
    v.subGain.gain.setValueAtTime(params.subOn ? 0.5 : 0, t);
    v.noiseGain.gain.setValueAtTime(params.noiseOn ? 0.3 : 0, t);

    // HPF
    v.hpf.frequency.setValueAtTime(params.hpfFreq, t);

    // VCF with env
    const targetCutoff = Math.min(ctx.sampleRate / 2, params.cutoff * (1 + params.envAmount * 3));
    [v.vcf1, v.vcf2].forEach((f) => {
      f.frequency.cancelScheduledValues(t);
      f.frequency.setValueAtTime(targetCutoff, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, params.cutoff), t + params.decay);
      f.Q.value = params.resonance * 8;
    });

    // VCA ADSR
    v.vca.gain.cancelScheduledValues(t);
    v.vca.gain.setValueAtTime(0, t);
    v.vca.gain.linearRampToValueAtTime(params.vcaLevel * (vel / 127), t + params.attack);
    v.vca.gain.linearRampToValueAtTime(
      params.vcaLevel * params.sustain * (vel / 127),
      t + params.attack + params.decay,
    );

    v.active = true;
    v.note = midi;
    v.startTime = t;
    _updateVoiceDots();
  }

  function _releaseVoice(v) {
    if (!ctx) return;
    const t = ctx.currentTime;
    v.vca.gain.cancelScheduledValues(t);
    v.vca.gain.setValueAtTime(v.vca.gain.value, t);
    v.vca.gain.exponentialRampToValueAtTime(0.001, t + params.release);
    v.active = false;
    v.note = -1;
    _updateVoiceDots();
  }

  function noteOn(midi, vel = 100) {
    if (!ctx) return;

    if (_arpActive) {
      // Add to arp pool
      if (!_arpNotes.includes(midi)) _arpNotes.push(midi);
      if (!_arpClockActive && !_arpTimer) _startArpTimer();
      return;
    }

    if (_holdActive) _heldNotes.add(midi);
    _triggerNoteOn(midi, vel);
  }

  function noteOff(midi) {
    if (!ctx) return;

    if (_arpActive) {
      _arpNotes = _arpNotes.filter((n) => n !== midi);
      if (_arpNotes.length === 0 && !_holdActive) _stopArpTimer();
      return;
    }

    if (_holdActive) return; // sustain: don't release while hold is on

    voices.filter((v) => v.note === midi && v.active).forEach((v) => _releaseVoice(v));
  }

  // Listen for global note events
  document.addEventListener('confustudio:note:on', (e) => noteOn(e.detail.note, e.detail.velocity * 127));
  document.addEventListener('confustudio:note:off', (e) => noteOff(e.detail.note));

  // Clock sync for arp
  document.addEventListener('confustudio:clock', (e) => {
    const { step, bpm } = e.detail ?? {};
    if (bpm) {
      _arpClockBPM = bpm;
    }
    if (!_arpActive) return;
    _arpClockActive = true;
    if (_arpTimer) {
      clearInterval(_arpTimer);
      _arpTimer = null;
    }

    const rateMap = { '1/4': 4, '1/8': 2, '1/16': 1 };
    const divisor = rateMap[_arpRate] ?? 2;
    if ((step ?? 0) % divisor === 0) {
      _arpNextNote();
    }
  });

  // ── ADSR canvas helper ──────────────────────────────────────────────────────
  function _updateADSRCanvas() {
    const canvas = el.querySelector('.polysynth-adsr-canvas');
    if (!canvas) return;
    const cw = canvas.width,
      ch = canvas.height;
    const gc = canvas.getContext('2d');
    if (!gc) return;
    gc.clearRect(0, 0, cw, ch);

    const A = Math.min(params.attack / 4, 1); // 0–1 of total width
    const D = Math.min(params.decay / 4, 1);
    const S = params.sustain; // 0–1 height
    const R = Math.min(params.release / 6, 1);

    const totalSeg = A + D + 0.25 + R;
    const scale = cw / totalSeg;
    const pad = 3;

    const xA = pad + A * scale;
    const xD = xA + D * scale;
    const xS = xD + 0.25 * scale;
    const xR = xS + R * scale;

    const yTop = pad;
    const yBot = ch - pad;
    const yS = yTop + (1 - S) * (yBot - yTop);

    gc.strokeStyle = '#e07030';
    gc.lineWidth = 1.5;
    gc.beginPath();
    gc.moveTo(pad, yBot);
    gc.lineTo(xA, yTop);
    gc.lineTo(xD, yS);
    gc.lineTo(xS, yS);
    gc.lineTo(xR, yBot);
    gc.stroke();
  }

  // ── Voice indicator ─────────────────────────────────────────────────────────
  function _updateVoiceDots() {
    const dots = el.querySelectorAll('.polysynth-voice-dot');
    voices.forEach((v, i) => {
      if (dots[i]) dots[i].classList.toggle('active', v.active);
    });
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'polysynth-chassis';

  el.innerHTML = `
    <div class="polysynth-ports-bar">
      <span class="port" data-port="audio-out">AUDIO OUT</span>
      <span class="port" data-port="midi-in">MIDI IN</span>
      <span class="port" data-port="clock-in">CLK IN</span>
      <span class="polysynth-title">POLYSYNTH</span>
    </div>

    <div class="polysynth-body">

      <!-- LFO -->
      <div class="polysynth-section">
        <div class="polysynth-section-header">LFO</div>
        <div class="polysynth-section-body">
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="lfoRate"
              min="0.1" max="20" step="0.01" value="0.5" orient="vertical" />
            <span class="polysynth-label">RATE</span>
          </div>
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="lfoDelay"
              min="0" max="3" step="0.01" value="0" orient="vertical" />
            <span class="polysynth-label">DELAY</span>
          </div>
        </div>
      </div>

      <!-- DCO -->
      <div class="polysynth-section">
        <div class="polysynth-section-header">DCO</div>
        <div class="polysynth-section-body">
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="lfoDcoDepth"
              min="0" max="200" step="1" value="0" orient="vertical" />
            <span class="polysynth-label">LFO</span>
          </div>
          <div class="polysynth-switch-col">
            <button class="polysynth-sw polysynth-sw--on" data-dco="saw">SAW</button>
            <button class="polysynth-sw" data-dco="sub">SUB</button>
            <button class="polysynth-sw" data-dco="noise">NOISE</button>
          </div>
        </div>
      </div>

      <!-- HPF -->
      <div class="polysynth-section">
        <div class="polysynth-section-header">HPF</div>
        <div class="polysynth-section-body polysynth-hpf-body">
          <button class="polysynth-hpf-btn polysynth-hpf-btn--active" data-hpf="0">0</button>
          <button class="polysynth-hpf-btn" data-hpf="1">1</button>
          <button class="polysynth-hpf-btn" data-hpf="2">2</button>
          <button class="polysynth-hpf-btn" data-hpf="3">3</button>
        </div>
      </div>

      <!-- VCF -->
      <div class="polysynth-section polysynth-section--wide">
        <div class="polysynth-section-header">VCF</div>
        <div class="polysynth-section-body">
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="cutoff"
              min="80" max="18000" step="1" value="8000" orient="vertical" />
            <span class="polysynth-label">FREQ</span>
          </div>
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="resonance"
              min="0" max="1" step="0.01" value="0" orient="vertical" />
            <span class="polysynth-label">RES</span>
          </div>
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="envAmount"
              min="0" max="1" step="0.01" value="0.5" orient="vertical" />
            <span class="polysynth-label">ENV</span>
          </div>
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="lfoVcfDepth"
              min="0" max="4000" step="1" value="0" orient="vertical" />
            <span class="polysynth-label">LFO</span>
          </div>
        </div>
      </div>

      <!-- VCA -->
      <div class="polysynth-section">
        <div class="polysynth-section-header">VCA</div>
        <div class="polysynth-section-body">
          <div class="polysynth-knob-col">
            <input type="range" class="polysynth-slider" data-param="vcaLevel"
              min="0" max="1" step="0.01" value="0.8" orient="vertical" />
            <span class="polysynth-label">LEVEL</span>
          </div>
        </div>
      </div>

      <!-- ENV with ADSR canvas -->
      <div class="polysynth-section polysynth-section--wide">
        <div class="polysynth-section-header">ENV</div>
        <div class="polysynth-section-body" style="flex-direction:column; gap:4px; align-items:center;">
          <canvas class="polysynth-adsr-canvas" width="80" height="40"></canvas>
          <div style="display:flex; flex-direction:row; gap:4px; align-items:flex-end;">
            <div class="polysynth-knob-col">
              <input type="range" class="polysynth-slider" data-param="attack"
                min="0.001" max="4" step="0.001" value="0.01" orient="vertical" />
              <span class="polysynth-label">A</span>
            </div>
            <div class="polysynth-knob-col">
              <input type="range" class="polysynth-slider" data-param="decay"
                min="0.01" max="4" step="0.001" value="0.3" orient="vertical" />
              <span class="polysynth-label">D</span>
            </div>
            <div class="polysynth-knob-col">
              <input type="range" class="polysynth-slider" data-param="sustain"
                min="0" max="1" step="0.01" value="0.7" orient="vertical" />
              <span class="polysynth-label">S</span>
            </div>
            <div class="polysynth-knob-col">
              <input type="range" class="polysynth-slider" data-param="release"
                min="0.01" max="6" step="0.001" value="0.5" orient="vertical" />
              <span class="polysynth-label">R</span>
            </div>
          </div>
        </div>
      </div>

      <!-- PORTAMENTO -->
      <div class="polysynth-section">
        <div class="polysynth-section-header">PORTA</div>
        <div class="polysynth-section-body" style="flex-direction:column; align-items:center; gap:3px;">
          <input type="range" class="polysynth-slider" data-param="portamento"
            min="0" max="1" step="0.01" value="0" orient="vertical" />
          <span class="polysynth-label">GLIDE</span>
          <span class="polysynth-porta-val">0ms</span>
        </div>
      </div>

      <!-- CHORUS -->
      <div class="polysynth-section">
        <div class="polysynth-section-header">CHORUS</div>
        <div class="polysynth-section-body polysynth-chorus-body">
          <button class="polysynth-chorus-btn" data-chorus="0">OFF</button>
          <button class="polysynth-chorus-btn polysynth-chorus-btn--active" data-chorus="1">I</button>
          <button class="polysynth-chorus-btn" data-chorus="2">II</button>
        </div>
      </div>

      <!-- HOLD + ARP -->
      <div class="polysynth-section polysynth-section--wide">
        <div class="polysynth-section-header">PERFORM</div>
        <div class="polysynth-section-body" style="flex-direction:column; gap:5px; align-items:stretch; padding:6px;">
          <button class="polysynth-hold-btn">HOLD</button>

          <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
            <button class="polysynth-arp-btn">ARP</button>
            <select class="polysynth-arp-rate">
              <option value="1/4">1/4</option>
              <option value="1/8" selected>1/8</option>
              <option value="1/16">1/16</option>
            </select>
            <button class="polysynth-arp-mode">UP</button>
          </div>
        </div>
      </div>

      <!-- PATCH PRESETS -->
      <div class="polysynth-section polysynth-section--wide">
        <div class="polysynth-section-header">PATCH</div>
        <div class="polysynth-section-body" style="flex-direction:column; gap:5px; align-items:stretch; padding:6px;">
          <select class="polysynth-patch-select">
            ${Object.keys(PATCHES)
              .map((n) => `<option value="${n}">${n}</option>`)
              .join('')}
          </select>
          <button class="polysynth-load-patch">LOAD</button>
        </div>
      </div>

    </div>

    <!-- Voice indicator + keyboard row -->
    <div class="polysynth-lower-bar">
      <div class="polysynth-voice-dots">
        ${Array.from({ length: 6 }, (_, i) => `<div class="polysynth-voice-dot" title="Voice ${i + 1}"></div>`).join('')}
        <span class="polysynth-voice-label">VOICES</span>
      </div>
      <div class="polysynth-keyboard"></div>
    </div>


  `;

  // ── Build mini keyboard C3–C5 (25 keys, MIDI 48–72) ─────────────────────
  const kbEl = el.querySelector('.polysynth-keyboard');
  const WHITE_PATTERN = [0, 2, 4, 5, 7, 9, 11];
  const MIDI_START = 48; // C3
  const MIDI_END = 72; // C5

  const whiteKeys = [];
  const blackKeys = [];
  for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
    const semi = midi % 12;
    if (WHITE_PATTERN.includes(semi)) {
      whiteKeys.push(midi);
    } else {
      blackKeys.push(midi);
    }
  }

  // Render white keys — show C labels
  whiteKeys.forEach((midi) => {
    const k = document.createElement('div');
    k.className = 'polysynth-key-white';
    k.dataset.midi = midi;
    if (midi % 12 === 0) {
      const lbl = document.createElement('span');
      lbl.className = 'polysynth-key-label';
      lbl.textContent = `C${Math.floor(midi / 12) - 1}`;
      k.appendChild(lbl);
    }
    kbEl.appendChild(k);
  });

  const wkW = 100 / whiteKeys.length;
  blackKeys.forEach((midi) => {
    const prevWhiteIdx = whiteKeys.findIndex((w) => w > midi) - 1;
    if (prevWhiteIdx < 0) return;
    const k = document.createElement('div');
    k.className = 'polysynth-key-black';
    k.dataset.midi = midi;
    const leftPct = (prevWhiteIdx + 1) * wkW;
    k.style.left = `${leftPct}%`;
    kbEl.appendChild(k);
  });

  // Keyboard events
  kbEl.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    e.preventDefault();
    k.setPointerCapture(e.pointerId);
    const midi = parseInt(k.dataset.midi);
    k.classList.add('pressed');
    noteOn(midi, 80);
  });
  kbEl.addEventListener('pointerup', (e) => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    const midi = parseInt(k.dataset.midi);
    k.classList.remove('pressed');
    noteOff(midi);
  });
  kbEl.addEventListener('pointercancel', (e) => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    k.classList.remove('pressed');
    noteOff(parseInt(k.dataset.midi));
  });

  // ── Slider interaction ───────────────────────────────────────────────────
  el.querySelectorAll('.polysynth-slider').forEach((slider) => {
    slider.addEventListener('input', () => {
      const param = slider.dataset.param;
      const v = parseFloat(slider.value);
      params[param] = v;
      _onParamChange(param, v);
    });
  });

  function _onParamChange(param, v) {
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (param) {
      case 'lfoRate':
        lfo.frequency.setTargetAtTime(v, t, 0.05);
        break;
      case 'lfoDcoDepth':
        lfoGain.gain.setTargetAtTime(v, t, 0.05);
        break;
      case 'lfoVcfDepth':
        lfoVcfGain.gain.setTargetAtTime(v, t, 0.05);
        break;
      case 'cutoff':
        voices.forEach((vv) => {
          vv.vcf1.frequency.setTargetAtTime(v, t, 0.02);
          vv.vcf2.frequency.setTargetAtTime(v, t, 0.02);
        });
        break;
      case 'resonance':
        voices.forEach((vv) => {
          vv.vcf1.Q.value = v * 8;
          vv.vcf2.Q.value = v * 8;
        });
        break;
      case 'hpfFreq':
        voices.forEach((vv) => vv.hpf.frequency.setTargetAtTime(v, t, 0.02));
        break;
      case 'portamento': {
        const ms = Math.round(v * 300);
        const portaValEl = el.querySelector('.polysynth-porta-val');
        if (portaValEl) portaValEl.textContent = `${ms}ms`;
        break;
      }
      case 'attack':
      case 'decay':
      case 'sustain':
      case 'release':
        _updateADSRCanvas();
        break;
    }
  }

  // ── DCO source toggle buttons ──────────────────────────────────────────
  el.querySelectorAll('[data-dco]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.dataset.dco;
      const isOn = btn.classList.toggle('polysynth-sw--on');
      if (src === 'saw') params.sawOn = isOn;
      if (src === 'sub') params.subOn = isOn;
      if (src === 'noise') params.noiseOn = isOn;
    });
  });

  // ── HPF selector ──────────────────────────────────────────────────────
  const HPF_FREQS = [20, 240, 800, 3000];
  el.querySelectorAll('.polysynth-hpf-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.polysynth-hpf-btn').forEach((b) => b.classList.remove('polysynth-hpf-btn--active'));
      btn.classList.add('polysynth-hpf-btn--active');
      const idx = parseInt(btn.dataset.hpf);
      params.hpfFreq = HPF_FREQS[idx];
      _onParamChange('hpfFreq', params.hpfFreq);
    });
  });

  // ── Chorus mode selector ───────────────────────────────────────────────
  el.querySelectorAll('.polysynth-chorus-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.polysynth-chorus-btn').forEach((b) => b.classList.remove('polysynth-chorus-btn--active'));
      btn.classList.add('polysynth-chorus-btn--active');
      const mode = parseInt(btn.dataset.chorus);
      params.chorusMode = mode;
      _applyChorusMode(mode);
    });
  });

  // ── HOLD button ────────────────────────────────────────────────────────
  el.querySelector('.polysynth-hold-btn')?.addEventListener('click', (e) => {
    _holdActive = !_holdActive;
    e.currentTarget.classList.toggle('active', _holdActive);
    if (!_holdActive) {
      // Release all held notes with release envelope
      _heldNotes.forEach((midi) => {
        voices.filter((v) => v.note === midi && v.active).forEach((v) => _releaseVoice(v));
      });
      _heldNotes.clear();
    }
  });

  // ── ARP button ─────────────────────────────────────────────────────────
  const ARP_MODES = ['UP', 'DOWN', 'UP-DOWN', 'RANDOM'];
  let _arpModeIdx = 0;

  el.querySelector('.polysynth-arp-btn')?.addEventListener('click', (e) => {
    _arpActive = !_arpActive;
    e.currentTarget.classList.toggle('active', _arpActive);
    if (!_arpActive) {
      _stopArpTimer();
      _arpNotes = [];
      _arpIdx = 0;
    }
  });

  el.querySelector('.polysynth-arp-mode')?.addEventListener('click', (e) => {
    _arpModeIdx = (_arpModeIdx + 1) % ARP_MODES.length;
    _arpMode = ARP_MODES[_arpModeIdx];
    e.currentTarget.textContent = _arpMode;
    _arpIdx = 0;
  });

  el.querySelector('.polysynth-arp-rate')?.addEventListener('change', (e) => {
    _arpRate = e.target.value;
    if (_arpTimer) _startArpTimer(); // restart with new rate
  });

  // ── Patch preset load ──────────────────────────────────────────────────
  el.querySelector('.polysynth-load-patch')?.addEventListener('click', () => {
    const name = el.querySelector('.polysynth-patch-select')?.value;
    if (name) _applyPatch(name);
  });

  // ── Audio port export ──────────────────────────────────────────────────
  if (ctx && outputGain) {
    el._polysynthAudio = { output: outputGain, context: ctx };
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  // Initialize ADSR canvas
  _updateADSRCanvas();

  el.__confustudioModule = {
    serialize() {
      return {
        params: { ...params },
        holdActive: _holdActive,
        arpActive: _arpActive,
        arpMode: _arpMode,
        arpRate: _arpRate,
      };
    },
    restore(savedState = {}) {
      if (savedState.params) Object.assign(params, savedState.params);
      if (savedState.holdActive != null) _holdActive = savedState.holdActive;
      if (savedState.arpActive != null) _arpActive = savedState.arpActive;
      if (savedState.arpMode != null) _arpMode = savedState.arpMode;
      if (savedState.arpRate != null) _arpRate = savedState.arpRate;
      // Sync sliders
      Object.entries(params).forEach(([k, v]) => {
        if (typeof v === 'boolean') return;
        const sl = el.querySelector(`.polysynth-slider[data-param="${k}"]`);
        if (sl) sl.value = v;
      });
      // DCO source buttons
      el.querySelectorAll('[data-dco]').forEach((btn) => {
        const src = btn.dataset.dco;
        const on = src === 'saw' ? params.sawOn : src === 'sub' ? params.subOn : params.noiseOn;
        btn.classList.toggle('polysynth-sw--on', !!on);
      });
      // Chorus buttons
      el.querySelectorAll('.polysynth-chorus-btn').forEach((btn) => {
        btn.classList.toggle('polysynth-chorus-btn--active', parseInt(btn.dataset.chorus) === params.chorusMode);
      });
      _applyChorusMode(params.chorusMode);
      // HPF buttons
      const HPF_FREQS = [20, 240, 800, 3000];
      const hpfIdx = HPF_FREQS.reduce(
        (best, f, i) => (Math.abs(f - params.hpfFreq) < Math.abs(HPF_FREQS[best] - params.hpfFreq) ? i : best),
        0,
      );
      el.querySelectorAll('.polysynth-hpf-btn').forEach((btn) => {
        btn.classList.toggle('polysynth-hpf-btn--active', parseInt(btn.dataset.hpf) === hpfIdx);
      });
      // Porta display
      const portaVal = el.querySelector('.polysynth-porta-val');
      if (portaVal) portaVal.textContent = `${Math.round(params.portamento * 300)}ms`;
      // Hold button
      const holdBtn = el.querySelector('.polysynth-hold-btn');
      if (holdBtn) holdBtn.classList.toggle('active', _holdActive);
      // ARP
      const arpBtn = el.querySelector('.polysynth-arp-btn');
      if (arpBtn) arpBtn.classList.toggle('active', _arpActive);
      const arpRateEl = el.querySelector('.polysynth-arp-rate');
      if (arpRateEl) arpRateEl.value = _arpRate;
      const arpModeEl = el.querySelector('.polysynth-arp-mode');
      if (arpModeEl) arpModeEl.textContent = _arpMode;
      _updateADSRCanvas();
      _updateVoiceDots();
    },
  };

  return el;
}
