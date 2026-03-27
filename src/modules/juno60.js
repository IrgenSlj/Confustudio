// juno60.js — Roland Juno-60 6-voice polyphonic synthesizer module

export function createJuno60(audioContext) {
  const ctx = audioContext;

  // ── Audio engine ────────────────────────────────────────────────────────────
  const params = {
    attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.5,
    cutoff: 8000, resonance: 0, envAmount: 0.5, vcaLevel: 0.8,
    hpfFreq: 20,
    lfoRate: 0.5, lfoDelay: 0, lfoDcoDepth: 0, lfoVcfDepth: 0,
    sawOn: true, subOn: false, noiseOn: false,
    chorusMode: 1, // 0=off, 1=I, 2=II
    portamento: 0, // 0–1, maps to 0–300ms glide time
  };

  // ── Patch presets ──────────────────────────────────────────────────────────
  const PATCHES = {
    'Strings': {
      attack: 0.3, decay: 0.4, sustain: 0.8, release: 1.2,
      cutoff: 5000, resonance: 0.1, envAmount: 0.2, vcaLevel: 0.8,
      hpfFreq: 20, lfoRate: 3.5, lfoDcoDepth: 8, lfoVcfDepth: 0,
      sawOn: true, subOn: false, noiseOn: false, chorusMode: 1, portamento: 0.1,
    },
    'Brass': {
      attack: 0.08, decay: 0.3, sustain: 0.7, release: 0.2,
      cutoff: 9000, resonance: 0.25, envAmount: 0.7, vcaLevel: 0.85,
      hpfFreq: 60, lfoRate: 0.5, lfoDcoDepth: 0, lfoVcfDepth: 0,
      sawOn: true, subOn: true, noiseOn: false, chorusMode: 0, portamento: 0,
    },
    'Soft Pad': {
      attack: 0.8, decay: 0.6, sustain: 0.9, release: 1.8,
      cutoff: 3500, resonance: 0.05, envAmount: 0.15, vcaLevel: 0.75,
      hpfFreq: 20, lfoRate: 2.0, lfoDcoDepth: 6, lfoVcfDepth: 0,
      sawOn: true, subOn: false, noiseOn: false, chorusMode: 2, portamento: 0.15,
    },
    'Sync Lead': {
      attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.3,
      cutoff: 7000, resonance: 0.55, envAmount: 0.5, vcaLevel: 0.9,
      hpfFreq: 40, lfoRate: 5.0, lfoDcoDepth: 20, lfoVcfDepth: 0,
      sawOn: true, subOn: false, noiseOn: false, chorusMode: 0, portamento: 0.05,
    },
    'Pluck': {
      attack: 0.002, decay: 0.18, sustain: 0.0, release: 0.12,
      cutoff: 6000, resonance: 0.3, envAmount: 0.6, vcaLevel: 0.9,
      hpfFreq: 80, lfoRate: 0.5, lfoDcoDepth: 0, lfoVcfDepth: 0,
      sawOn: true, subOn: false, noiseOn: false, chorusMode: 0, portamento: 0,
    },
    'Organ': {
      attack: 0.002, decay: 0.1, sustain: 1.0, release: 0.05,
      cutoff: 18000, resonance: 0, envAmount: 0, vcaLevel: 0.8,
      hpfFreq: 20, lfoRate: 1.5, lfoDcoDepth: 4, lfoVcfDepth: 0,
      sawOn: true, subOn: true, noiseOn: false, chorusMode: 1, portamento: 0,
    },
    'Bass': {
      attack: 0.005, decay: 0.4, sustain: 0.3, release: 0.2,
      cutoff: 1800, resonance: 0.4, envAmount: 0.5, vcaLevel: 0.95,
      hpfFreq: 20, lfoRate: 0.5, lfoDcoDepth: 0, lfoVcfDepth: 0,
      sawOn: false, subOn: true, noiseOn: false, chorusMode: 0, portamento: 0,
    },
    'Juno Arp': {
      attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.5,
      cutoff: 7500, resonance: 0.15, envAmount: 0.45, vcaLevel: 0.82,
      hpfFreq: 20, lfoRate: 1.8, lfoDcoDepth: 5, lfoVcfDepth: 0,
      sawOn: true, subOn: true, noiseOn: false, chorusMode: 1, portamento: 0.08,
    },
  };

  let voices = [];
  let lfo, lfoGain, lfoVcfGain;
  let voiceSum, chorusDry, delay1, delay2, chorusLFO, chorus2LFO, depthGain, depth2, outputGain;
  let voiceIdx = 0;

  // ── Hold pedal / Latch ─────────────────────────────────────────────────────
  let _holdActive = false;
  let _heldNotes = new Set(); // midi notes currently held by latch

  // ── Arpeggiator ────────────────────────────────────────────────────────────
  let _arpActive = false;
  let _arpNotes = [];        // currently arpeggiated note pool
  let _arpIdx = 0;
  let _arpDir = 1;           // for UP-DOWN mode
  let _arpMode = 'UP';       // UP | DOWN | UP-DOWN | RANDOM
  let _arpRate = '1/8';      // 1/4 | 1/8 | 1/16
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
      const full = sorted.length > 1
        ? [...sorted, ...sorted.slice(1, -1).reverse()]
        : sorted;
      note = full[_arpIdx % full.length];
      _arpIdx = (_arpIdx + 1) % full.length;
    } else {
      note = sorted[Math.floor(Math.random() * sorted.length)];
    }
    // Stop any sounding arp voice, then trigger new one
    voices.forEach(v => {
      if (v.arpNote && v.arpNote !== note) {
        _releaseVoice(v);
        v.arpNote = null;
      }
    });
    _triggerNoteOn(note, 90);
    // Track which voice is playing the arp note for release
    const av = [...voices].filter(v => v.note === note).pop();
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
    if (_arpTimer) { clearInterval(_arpTimer); _arpTimer = null; }
    // Release all arp voices
    voices.forEach(v => { if (v.arpNote) { _releaseVoice(v); v.arpNote = null; } });
  }

  function makeVoice(actx) {
    const saw = actx.createOscillator(); saw.type = 'sawtooth';
    const sub = actx.createOscillator(); sub.type = 'square';

    // White noise: 2-second looping buffer
    const noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = actx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true;

    const sawGain   = actx.createGain(); sawGain.gain.value = 1;
    const subGain   = actx.createGain(); subGain.gain.value = 0;
    const noiseGain = actx.createGain(); noiseGain.gain.value = 0;

    const dcoSum = actx.createGain(); dcoSum.gain.value = 0.4;
    saw.connect(sawGain);     sawGain.connect(dcoSum);
    sub.connect(subGain);     subGain.connect(dcoSum);
    noise.connect(noiseGain); noiseGain.connect(dcoSum);

    const hpf = actx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 20; hpf.Q.value = 0.5;
    const vcf1 = actx.createBiquadFilter(); vcf1.type = 'lowpass'; vcf1.frequency.value = 8000; vcf1.Q.value = 0;
    const vcf2 = actx.createBiquadFilter(); vcf2.type = 'lowpass'; vcf2.frequency.value = 8000; vcf2.Q.value = 0;
    const vca = actx.createGain(); vca.gain.value = 0;

    dcoSum.connect(hpf); hpf.connect(vcf1); vcf1.connect(vcf2); vcf2.connect(vca);

    saw.start(); sub.start(); noise.start();

    return { saw, sub, noise, sawGain, subGain, noiseGain, dcoSum, hpf, vcf1, vcf2, vca,
             active: false, note: -1, startTime: 0, lastFreq: 0, arpNote: null };
  }

  if (ctx) {
    // 6 voices
    voices = Array.from({ length: 6 }, () => makeVoice(ctx));

    // Global LFO
    lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.5;
    lfoGain    = ctx.createGain(); lfoGain.gain.value = 0;
    lfoVcfGain = ctx.createGain(); lfoVcfGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfo.connect(lfoVcfGain);
    lfo.start();

    // Voice sum bus
    voiceSum = ctx.createGain(); voiceSum.gain.value = 1;
    voices.forEach(v => {
      v.vca.connect(voiceSum);
      // LFO -> DCO freq mod
      lfoGain.connect(v.saw.frequency);
      lfoGain.connect(v.sub.frequency);
      // LFO -> VCF freq mod
      lfoVcfGain.connect(v.vcf1.frequency);
      lfoVcfGain.connect(v.vcf2.frequency);
    });

    // Chorus (BBD emulation)
    chorusDry = ctx.createGain(); chorusDry.gain.value = 0.5;
    const chorusMix = ctx.createGain(); chorusMix.gain.value = 0.5;

    delay1 = ctx.createDelay(0.03); delay1.delayTime.value = 0.012;
    delay2 = ctx.createDelay(0.03); delay2.delayTime.value = 0.018;

    chorusLFO  = ctx.createOscillator(); chorusLFO.type  = 'triangle'; chorusLFO.frequency.value  = 0.513;
    chorus2LFO = ctx.createOscillator(); chorus2LFO.type = 'triangle'; chorus2LFO.frequency.value = 0.863;
    depthGain  = ctx.createGain(); depthGain.gain.value  = 0.004;
    depth2     = ctx.createGain(); depth2.gain.value     = 0.003;

    chorusLFO.connect(depthGain);
    depthGain.connect(delay1.delayTime);
    depthGain.connect(delay2.delayTime);
    chorus2LFO.connect(depth2);
    depth2.connect(delay2.delayTime);
    chorusLFO.start(); chorus2LFO.start();

    outputGain = ctx.createGain(); outputGain.gain.value = 0.75;

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
      const sl = el.querySelector(`.juno60-slider[data-param="${k}"]`);
      if (sl) sl.value = v;
    });

    // DCO source buttons
    el.querySelectorAll('[data-dco]').forEach(btn => {
      const src = btn.dataset.dco;
      const on = src === 'saw' ? p.sawOn : src === 'sub' ? p.subOn : p.noiseOn;
      btn.classList.toggle('juno60-sw--on', !!on);
    });

    // Chorus
    el.querySelectorAll('.juno60-chorus-btn').forEach(btn => {
      const match = parseInt(btn.dataset.chorus) === p.chorusMode;
      btn.classList.toggle('juno60-chorus-btn--active', match);
    });
    _applyChorusMode(p.chorusMode);

    // HPF: find closest preset freq
    const HPF_FREQS = [20, 240, 800, 3000];
    const hpfIdx = HPF_FREQS.reduce((best, f, i) =>
      Math.abs(f - p.hpfFreq) < Math.abs(HPF_FREQS[best] - p.hpfFreq) ? i : best, 0);
    el.querySelectorAll('.juno60-hpf-btn').forEach(btn => {
      btn.classList.toggle('juno60-hpf-btn--active', parseInt(btn.dataset.hpf) === hpfIdx);
    });
    if (ctx) {
      voices.forEach(v => v.hpf.frequency.setTargetAtTime(p.hpfFreq, ctx.currentTime, 0.02));
    }

    // Portamento slider
    const portSl = el.querySelector('.juno60-slider[data-param="portamento"]');
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

    v.sawGain.gain.setValueAtTime(params.sawOn   ? 1   : 0,   t);
    v.subGain.gain.setValueAtTime(params.subOn   ? 0.5 : 0,   t);
    v.noiseGain.gain.setValueAtTime(params.noiseOn ? 0.3 : 0, t);

    // HPF
    v.hpf.frequency.setValueAtTime(params.hpfFreq, t);

    // VCF with env
    const targetCutoff = Math.min(ctx.sampleRate / 2, params.cutoff * (1 + params.envAmount * 3));
    [v.vcf1, v.vcf2].forEach(f => {
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
      t + params.attack + params.decay
    );

    v.active = true; v.note = midi; v.startTime = t;
    _updateVoiceDots();
  }

  function _releaseVoice(v) {
    if (!ctx) return;
    const t = ctx.currentTime;
    v.vca.gain.cancelScheduledValues(t);
    v.vca.gain.setValueAtTime(v.vca.gain.value, t);
    v.vca.gain.exponentialRampToValueAtTime(0.001, t + params.release);
    v.active = false; v.note = -1;
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
      _arpNotes = _arpNotes.filter(n => n !== midi);
      if (_arpNotes.length === 0 && !_holdActive) _stopArpTimer();
      return;
    }

    if (_holdActive) return; // sustain: don't release while hold is on

    voices.filter(v => v.note === midi && v.active).forEach(v => _releaseVoice(v));
  }

  // Listen for global note events
  document.addEventListener('confusynth:note:on',  e => noteOn(e.detail.note,  e.detail.velocity * 127));
  document.addEventListener('confusynth:note:off', e => noteOff(e.detail.note));

  // Clock sync for arp
  document.addEventListener('confusynth:clock', e => {
    const { step, bpm } = e.detail ?? {};
    if (bpm) { _arpClockBPM = bpm; }
    if (!_arpActive) return;
    _arpClockActive = true;
    if (_arpTimer) { clearInterval(_arpTimer); _arpTimer = null; }

    const rateMap = { '1/4': 4, '1/8': 2, '1/16': 1 };
    const divisor = rateMap[_arpRate] ?? 2;
    if ((step ?? 0) % divisor === 0) {
      _arpNextNote();
    }
  });

  // ── ADSR canvas helper ──────────────────────────────────────────────────────
  function _updateADSRCanvas() {
    const canvas = el.querySelector('.juno60-adsr-canvas');
    if (!canvas) return;
    const cw = canvas.width, ch = canvas.height;
    const gc = canvas.getContext('2d');
    if (!gc) return;
    gc.clearRect(0, 0, cw, ch);

    const A = Math.min(params.attack / 4, 1);   // 0–1 of total width
    const D = Math.min(params.decay  / 4, 1);
    const S = params.sustain;                   // 0–1 height
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
    const dots = el.querySelectorAll('.juno60-voice-dot');
    voices.forEach((v, i) => {
      if (dots[i]) dots[i].classList.toggle('active', v.active);
    });
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'juno60-chassis';

  const portaMs = () => Math.round(params.portamento * 300);

  el.innerHTML = `
    <div class="juno60-ports-bar">
      <span class="port" data-port="audio-out">AUDIO OUT</span>
      <span class="port" data-port="midi-in">MIDI IN</span>
      <span class="port" data-port="clock-in">CLK IN</span>
      <span class="juno60-title">JUNO-60</span>
    </div>

    <div class="juno60-body">

      <!-- LFO -->
      <div class="juno60-section">
        <div class="juno60-section-header">LFO</div>
        <div class="juno60-section-body">
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="lfoRate"
              min="0.1" max="20" step="0.01" value="0.5" orient="vertical" />
            <span class="juno60-label">RATE</span>
          </div>
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="lfoDelay"
              min="0" max="3" step="0.01" value="0" orient="vertical" />
            <span class="juno60-label">DELAY</span>
          </div>
        </div>
      </div>

      <!-- DCO -->
      <div class="juno60-section">
        <div class="juno60-section-header">DCO</div>
        <div class="juno60-section-body">
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="lfoDcoDepth"
              min="0" max="200" step="1" value="0" orient="vertical" />
            <span class="juno60-label">LFO</span>
          </div>
          <div class="juno60-switch-col">
            <button class="juno60-sw juno60-sw--on" data-dco="saw">SAW</button>
            <button class="juno60-sw" data-dco="sub">SUB</button>
            <button class="juno60-sw" data-dco="noise">NOISE</button>
          </div>
        </div>
      </div>

      <!-- HPF -->
      <div class="juno60-section">
        <div class="juno60-section-header">HPF</div>
        <div class="juno60-section-body juno60-hpf-body">
          <button class="juno60-hpf-btn juno60-hpf-btn--active" data-hpf="0">0</button>
          <button class="juno60-hpf-btn" data-hpf="1">1</button>
          <button class="juno60-hpf-btn" data-hpf="2">2</button>
          <button class="juno60-hpf-btn" data-hpf="3">3</button>
        </div>
      </div>

      <!-- VCF -->
      <div class="juno60-section juno60-section--wide">
        <div class="juno60-section-header">VCF</div>
        <div class="juno60-section-body">
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="cutoff"
              min="80" max="18000" step="1" value="8000" orient="vertical" />
            <span class="juno60-label">FREQ</span>
          </div>
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="resonance"
              min="0" max="1" step="0.01" value="0" orient="vertical" />
            <span class="juno60-label">RES</span>
          </div>
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="envAmount"
              min="0" max="1" step="0.01" value="0.5" orient="vertical" />
            <span class="juno60-label">ENV</span>
          </div>
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="lfoVcfDepth"
              min="0" max="4000" step="1" value="0" orient="vertical" />
            <span class="juno60-label">LFO</span>
          </div>
        </div>
      </div>

      <!-- VCA -->
      <div class="juno60-section">
        <div class="juno60-section-header">VCA</div>
        <div class="juno60-section-body">
          <div class="juno60-knob-col">
            <input type="range" class="juno60-slider" data-param="vcaLevel"
              min="0" max="1" step="0.01" value="0.8" orient="vertical" />
            <span class="juno60-label">LEVEL</span>
          </div>
        </div>
      </div>

      <!-- ENV with ADSR canvas -->
      <div class="juno60-section juno60-section--wide">
        <div class="juno60-section-header">ENV</div>
        <div class="juno60-section-body" style="flex-direction:column; gap:4px; align-items:center;">
          <canvas class="juno60-adsr-canvas" width="80" height="40"></canvas>
          <div style="display:flex; flex-direction:row; gap:4px; align-items:flex-end;">
            <div class="juno60-knob-col">
              <input type="range" class="juno60-slider" data-param="attack"
                min="0.001" max="4" step="0.001" value="0.01" orient="vertical" />
              <span class="juno60-label">A</span>
            </div>
            <div class="juno60-knob-col">
              <input type="range" class="juno60-slider" data-param="decay"
                min="0.01" max="4" step="0.001" value="0.3" orient="vertical" />
              <span class="juno60-label">D</span>
            </div>
            <div class="juno60-knob-col">
              <input type="range" class="juno60-slider" data-param="sustain"
                min="0" max="1" step="0.01" value="0.7" orient="vertical" />
              <span class="juno60-label">S</span>
            </div>
            <div class="juno60-knob-col">
              <input type="range" class="juno60-slider" data-param="release"
                min="0.01" max="6" step="0.001" value="0.5" orient="vertical" />
              <span class="juno60-label">R</span>
            </div>
          </div>
        </div>
      </div>

      <!-- PORTAMENTO -->
      <div class="juno60-section">
        <div class="juno60-section-header">PORTA</div>
        <div class="juno60-section-body" style="flex-direction:column; align-items:center; gap:3px;">
          <input type="range" class="juno60-slider" data-param="portamento"
            min="0" max="1" step="0.01" value="0" orient="vertical" />
          <span class="juno60-label">GLIDE</span>
          <span class="juno60-porta-val">0ms</span>
        </div>
      </div>

      <!-- CHORUS -->
      <div class="juno60-section">
        <div class="juno60-section-header">CHORUS</div>
        <div class="juno60-section-body juno60-chorus-body">
          <button class="juno60-chorus-btn" data-chorus="0">OFF</button>
          <button class="juno60-chorus-btn juno60-chorus-btn--active" data-chorus="1">I</button>
          <button class="juno60-chorus-btn" data-chorus="2">II</button>
        </div>
      </div>

      <!-- HOLD + ARP -->
      <div class="juno60-section juno60-section--wide">
        <div class="juno60-section-header">PERFORM</div>
        <div class="juno60-section-body" style="flex-direction:column; gap:5px; align-items:stretch; padding:6px;">
          <button class="juno60-hold-btn">HOLD</button>

          <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
            <button class="juno60-arp-btn">ARP</button>
            <select class="juno60-arp-rate">
              <option value="1/4">1/4</option>
              <option value="1/8" selected>1/8</option>
              <option value="1/16">1/16</option>
            </select>
            <button class="juno60-arp-mode">UP</button>
          </div>
        </div>
      </div>

      <!-- PATCH PRESETS -->
      <div class="juno60-section juno60-section--wide">
        <div class="juno60-section-header">PATCH</div>
        <div class="juno60-section-body" style="flex-direction:column; gap:5px; align-items:stretch; padding:6px;">
          <select class="juno60-patch-select">
            ${Object.keys(PATCHES).map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
          <button class="juno60-load-patch">LOAD</button>
        </div>
      </div>

    </div>

    <!-- Voice indicator + keyboard row -->
    <div class="juno60-lower-bar">
      <div class="juno60-voice-dots">
        ${Array.from({length:6}, (_,i) => `<div class="juno60-voice-dot" title="Voice ${i+1}"></div>`).join('')}
        <span class="juno60-voice-label">VOICES</span>
      </div>
      <div class="juno60-keyboard"></div>
    </div>

    <style>
      .juno60-chassis {
        background: #1a1810;
        border-radius: 6px 6px 4px 4px;
        width: 920px;
        min-height: 240px;
        box-sizing: border-box;
        font-family: monospace;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05);
        border: 1px solid #2a2818;
        position: relative;
        overflow: hidden;
      }
      /* Wood-grain sides */
      .juno60-chassis::before,
      .juno60-chassis::after {
        content: '';
        position: absolute;
        top: 0;
        width: 18px;
        height: 100%;
        background: repeating-linear-gradient(
          180deg,
          #5c3a1e 0px, #7a4e28 4px, #5c3a1e 8px
        );
        z-index: 1;
      }
      .juno60-chassis::before { left: 0; border-radius: 6px 0 0 4px; }
      .juno60-chassis::after  { right: 0; border-radius: 0 6px 4px 0; }

      .juno60-ports-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 28px;
        background: #141210;
        border-bottom: 1px solid #2a2818;
        min-height: 26px;
        position: relative;
        z-index: 2;
      }
      .juno60-ports-bar .port {
        font-size: 9px;
        color: #aaa;
        letter-spacing: 0.08em;
        background: #222;
        border: 1px solid #444;
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
      }
      .juno60-ports-bar .port:hover { background: #333; }
      .juno60-title {
        margin-left: auto;
        margin-right: 20px;
        font-size: 22px;
        font-weight: bold;
        color: #fff;
        letter-spacing: 0.12em;
        font-family: monospace;
        text-shadow: 0 0 8px rgba(255,200,100,0.3);
      }

      .juno60-body {
        display: flex;
        flex-direction: row;
        gap: 2px;
        padding: 8px 24px;
        align-items: stretch;
        position: relative;
        z-index: 2;
        flex: 1;
        flex-wrap: wrap;
      }

      .juno60-section {
        display: flex;
        flex-direction: column;
        border: 1px solid #c05010;
        margin: 2px;
        border-radius: 3px;
        overflow: hidden;
        min-width: 54px;
      }
      .juno60-section--wide { min-width: 100px; }

      .juno60-section-header {
        background: #c05010;
        color: #fff;
        font-size: 9px;
        letter-spacing: 0.1em;
        font-weight: bold;
        text-align: center;
        padding: 2px 4px;
        white-space: nowrap;
      }

      .juno60-section-body {
        display: flex;
        flex-direction: row;
        gap: 4px;
        padding: 6px 4px 4px;
        align-items: flex-end;
        flex: 1;
      }

      .juno60-knob-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .juno60-slider {
        -webkit-appearance: slider-vertical;
        appearance: slider-vertical;
        writing-mode: vertical-lr;
        direction: rtl;
        width: 18px;
        height: 72px;
        cursor: pointer;
        accent-color: #e07030;
        background: transparent;
      }

      .juno60-label {
        font-size: 8px;
        color: #ccc;
        letter-spacing: 0.05em;
        text-align: center;
        white-space: nowrap;
      }

      .juno60-switch-col {
        display: flex;
        flex-direction: column;
        gap: 3px;
        align-items: center;
        justify-content: center;
        padding: 2px 0;
      }

      .juno60-sw {
        font-family: monospace;
        font-size: 8px;
        padding: 2px 5px;
        background: #2a2818;
        color: #888;
        border: 1px solid #444;
        border-radius: 2px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.1s, color 0.1s;
        letter-spacing: 0.05em;
      }
      .juno60-sw--on {
        background: #e07030;
        color: #fff;
        border-color: #e07030;
      }

      .juno60-hpf-body {
        flex-direction: column;
        gap: 3px;
        padding: 6px 6px;
        align-items: center;
        justify-content: center;
      }

      .juno60-hpf-btn {
        font-family: monospace;
        font-size: 10px;
        width: 26px;
        padding: 2px 0;
        background: #2a2818;
        color: #888;
        border: 1px solid #444;
        border-radius: 2px;
        cursor: pointer;
        text-align: center;
        transition: background 0.1s, color 0.1s;
      }
      .juno60-hpf-btn--active {
        background: #e07030;
        color: #fff;
        border-color: #e07030;
      }

      .juno60-chorus-body {
        flex-direction: column;
        gap: 3px;
        padding: 6px 6px;
        align-items: center;
        justify-content: center;
      }

      .juno60-chorus-btn {
        font-family: monospace;
        font-size: 9px;
        width: 36px;
        padding: 3px 0;
        background: #2a2818;
        color: #888;
        border: 1px solid #444;
        border-radius: 2px;
        cursor: pointer;
        text-align: center;
        letter-spacing: 0.08em;
        transition: background 0.1s, color 0.1s;
      }
      .juno60-chorus-btn--active {
        background: #e07030;
        color: #fff;
        border-color: #e07030;
        box-shadow: 0 0 6px rgba(224,112,48,0.6);
      }

      /* ADSR canvas */
      .juno60-adsr-canvas {
        display: block;
        background: #0e0e08;
        border: 1px solid #333;
        border-radius: 2px;
      }

      /* Portamento value display */
      .juno60-porta-val {
        font-size: 8px;
        color: #e07030;
        font-family: monospace;
        letter-spacing: 0.05em;
      }

      /* HOLD button */
      .juno60-hold-btn {
        font-family: monospace;
        font-size: 9px;
        padding: 4px 8px;
        background: #2a2818;
        color: #888;
        border: 1px solid #555;
        border-radius: 3px;
        cursor: pointer;
        letter-spacing: 0.08em;
        transition: background 0.1s, color 0.1s;
        width: 100%;
      }
      .juno60-hold-btn.active {
        background: #8040e0;
        color: #fff;
        border-color: #a060ff;
        box-shadow: 0 0 6px rgba(128,64,224,0.6);
      }

      /* ARP buttons */
      .juno60-arp-btn {
        font-family: monospace;
        font-size: 9px;
        padding: 3px 6px;
        background: #2a2818;
        color: #888;
        border: 1px solid #555;
        border-radius: 3px;
        cursor: pointer;
        letter-spacing: 0.07em;
        transition: background 0.1s, color 0.1s;
        white-space: nowrap;
      }
      .juno60-arp-btn.active {
        background: #20a060;
        color: #fff;
        border-color: #40c880;
        box-shadow: 0 0 6px rgba(32,160,96,0.6);
      }
      .juno60-arp-rate {
        font-family: monospace;
        font-size: 9px;
        background: #1a1a10;
        color: #ccc;
        border: 1px solid #444;
        border-radius: 3px;
        padding: 2px 3px;
        cursor: pointer;
      }
      .juno60-arp-mode {
        font-family: monospace;
        font-size: 8px;
        padding: 3px 5px;
        background: #2a2020;
        color: #aaa;
        border: 1px solid #555;
        border-radius: 3px;
        cursor: pointer;
        letter-spacing: 0.06em;
        transition: background 0.1s;
        white-space: nowrap;
      }
      .juno60-arp-mode:hover { background: #444; }

      /* Patch controls */
      .juno60-patch-select {
        font-family: monospace;
        font-size: 9px;
        background: #1a1a10;
        color: #e07030;
        border: 1px solid #555;
        border-radius: 3px;
        padding: 2px 4px;
        cursor: pointer;
        width: 100%;
      }
      .juno60-load-patch {
        font-family: monospace;
        font-size: 9px;
        padding: 3px 6px;
        background: #333;
        color: #e07030;
        border: 1px solid #555;
        border-radius: 3px;
        cursor: pointer;
        letter-spacing: 0.06em;
        transition: background 0.1s;
        width: 100%;
      }
      .juno60-load-patch:hover { background: #555; }

      /* Lower bar with voice dots + keyboard */
      .juno60-lower-bar {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 0 24px;
        z-index: 2;
        position: relative;
      }

      /* Voice indicator dots */
      .juno60-voice-dots {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        flex-shrink: 0;
      }
      .juno60-voice-label {
        font-size: 7px;
        color: #666;
        letter-spacing: 0.06em;
        margin-left: 3px;
      }
      .juno60-voice-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #2a2818;
        border: 1px solid #444;
        transition: background 0.08s, box-shadow 0.08s;
      }
      .juno60-voice-dot.active {
        background: #e07030;
        border-color: #ff9050;
        box-shadow: 0 0 5px rgba(224,112,48,0.7);
      }

      /* Keyboard */
      .juno60-keyboard {
        position: relative;
        height: 54px;
        flex: 1;
        display: flex;
        z-index: 2;
        margin-bottom: 6px;
      }
      .juno60-key-white {
        flex: 1;
        background: linear-gradient(180deg, #f5f5f0 0%, #e8e8e0 100%);
        border: 1px solid #999;
        border-top: none;
        border-radius: 0 0 3px 3px;
        cursor: pointer;
        position: relative;
        transition: background 0.06s;
        min-width: 0;
      }
      .juno60-key-white .juno60-key-label {
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 6px;
        color: #888;
        font-family: monospace;
        pointer-events: none;
      }
      .juno60-key-white:active,
      .juno60-key-white.pressed {
        background: linear-gradient(180deg, #d0c8b8 0%, #b8b0a0 100%);
      }
      .juno60-key-black {
        position: absolute;
        width: 58%;
        height: 60%;
        background: linear-gradient(180deg, #1a1a1a 0%, #333 100%);
        border-radius: 0 0 2px 2px;
        cursor: pointer;
        z-index: 3;
        top: 0;
        transform: translateX(-50%);
        transition: background 0.06s;
        border: 1px solid #000;
      }
      .juno60-key-black:active,
      .juno60-key-black.pressed {
        background: linear-gradient(180deg, #333 0%, #555 100%);
      }
    </style>
  `;

  // ── Build mini keyboard C3–C5 (25 keys, MIDI 48–72) ─────────────────────
  const kbEl = el.querySelector('.juno60-keyboard');
  const WHITE_PATTERN = [0, 2, 4, 5, 7, 9, 11];
  const MIDI_START = 48; // C3
  const MIDI_END   = 72; // C5

  const NOTE_LABELS = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

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
  whiteKeys.forEach(midi => {
    const k = document.createElement('div');
    k.className = 'juno60-key-white';
    k.dataset.midi = midi;
    if (midi % 12 === 0) {
      const lbl = document.createElement('span');
      lbl.className = 'juno60-key-label';
      lbl.textContent = `C${Math.floor(midi / 12) - 1}`;
      k.appendChild(lbl);
    }
    kbEl.appendChild(k);
  });

  const wkW = 100 / whiteKeys.length;
  blackKeys.forEach(midi => {
    const prevWhiteIdx = whiteKeys.findIndex(w => w > midi) - 1;
    if (prevWhiteIdx < 0) return;
    const k = document.createElement('div');
    k.className = 'juno60-key-black';
    k.dataset.midi = midi;
    const leftPct = (prevWhiteIdx + 1) * wkW;
    k.style.left = `${leftPct}%`;
    kbEl.appendChild(k);
  });

  // Keyboard events
  kbEl.addEventListener('pointerdown', e => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    e.preventDefault();
    k.setPointerCapture(e.pointerId);
    const midi = parseInt(k.dataset.midi);
    k.classList.add('pressed');
    noteOn(midi, 80);
  });
  kbEl.addEventListener('pointerup', e => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    const midi = parseInt(k.dataset.midi);
    k.classList.remove('pressed');
    noteOff(midi);
  });
  kbEl.addEventListener('pointercancel', e => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    k.classList.remove('pressed');
    noteOff(parseInt(k.dataset.midi));
  });

  // ── Slider interaction ───────────────────────────────────────────────────
  el.querySelectorAll('.juno60-slider').forEach(slider => {
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
        voices.forEach(vv => {
          vv.vcf1.frequency.setTargetAtTime(v, t, 0.02);
          vv.vcf2.frequency.setTargetAtTime(v, t, 0.02);
        });
        break;
      case 'resonance':
        voices.forEach(vv => {
          vv.vcf1.Q.value = v * 8;
          vv.vcf2.Q.value = v * 8;
        });
        break;
      case 'hpfFreq':
        voices.forEach(vv => vv.hpf.frequency.setTargetAtTime(v, t, 0.02));
        break;
      case 'portamento': {
        const ms = Math.round(v * 300);
        const portaValEl = el.querySelector('.juno60-porta-val');
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
  el.querySelectorAll('[data-dco]').forEach(btn => {
    btn.addEventListener('click', () => {
      const src = btn.dataset.dco;
      const isOn = btn.classList.toggle('juno60-sw--on');
      if (src === 'saw')   params.sawOn   = isOn;
      if (src === 'sub')   params.subOn   = isOn;
      if (src === 'noise') params.noiseOn = isOn;
    });
  });

  // ── HPF selector ──────────────────────────────────────────────────────
  const HPF_FREQS = [20, 240, 800, 3000];
  el.querySelectorAll('.juno60-hpf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.juno60-hpf-btn').forEach(b => b.classList.remove('juno60-hpf-btn--active'));
      btn.classList.add('juno60-hpf-btn--active');
      const idx = parseInt(btn.dataset.hpf);
      params.hpfFreq = HPF_FREQS[idx];
      _onParamChange('hpfFreq', params.hpfFreq);
    });
  });

  // ── Chorus mode selector ───────────────────────────────────────────────
  el.querySelectorAll('.juno60-chorus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.juno60-chorus-btn').forEach(b => b.classList.remove('juno60-chorus-btn--active'));
      btn.classList.add('juno60-chorus-btn--active');
      const mode = parseInt(btn.dataset.chorus);
      params.chorusMode = mode;
      _applyChorusMode(mode);
    });
  });

  // ── HOLD button ────────────────────────────────────────────────────────
  el.querySelector('.juno60-hold-btn')?.addEventListener('click', (e) => {
    _holdActive = !_holdActive;
    e.currentTarget.classList.toggle('active', _holdActive);
    if (!_holdActive) {
      // Release all held notes with release envelope
      _heldNotes.forEach(midi => {
        voices.filter(v => v.note === midi && v.active).forEach(v => _releaseVoice(v));
      });
      _heldNotes.clear();
    }
  });

  // ── ARP button ─────────────────────────────────────────────────────────
  const ARP_MODES = ['UP', 'DOWN', 'UP-DOWN', 'RANDOM'];
  let _arpModeIdx = 0;

  el.querySelector('.juno60-arp-btn')?.addEventListener('click', (e) => {
    _arpActive = !_arpActive;
    e.currentTarget.classList.toggle('active', _arpActive);
    if (!_arpActive) {
      _stopArpTimer();
      _arpNotes = [];
      _arpIdx = 0;
    }
  });

  el.querySelector('.juno60-arp-mode')?.addEventListener('click', (e) => {
    _arpModeIdx = (_arpModeIdx + 1) % ARP_MODES.length;
    _arpMode = ARP_MODES[_arpModeIdx];
    e.currentTarget.textContent = _arpMode;
    _arpIdx = 0;
  });

  el.querySelector('.juno60-arp-rate')?.addEventListener('change', (e) => {
    _arpRate = e.target.value;
    if (_arpTimer) _startArpTimer(); // restart with new rate
  });

  // ── Patch preset load ──────────────────────────────────────────────────
  el.querySelector('.juno60-load-patch')?.addEventListener('click', () => {
    const name = el.querySelector('.juno60-patch-select')?.value;
    if (name) _applyPatch(name);
  });

  // ── Audio port export ──────────────────────────────────────────────────
  if (ctx && outputGain) {
    el._juno60Audio = { output: outputGain, context: ctx };
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  // Initialize ADSR canvas
  _updateADSRCanvas();

  return el;
}
