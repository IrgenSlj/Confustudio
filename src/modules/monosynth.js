// monosynth.js — Monosynth module

export function createMonosynth(audioContext) {
  const ctx = audioContext;

  // ── Params ─────────────────────────────────────────────────────────────────
  const params = {
    // VCO
    vco1Wave: 'sawtooth', vco1Octave: 2, vco1Vol: 0.8,  // octave index 0=32',1=16',2=8',3=4'
    vco2Wave: 'sawtooth', vco2Octave: 2, vco2Vol: 0.7, vco2Fine: 0,
    vco3Wave: 'sawtooth', vco3Octave: 1, vco3Vol: 0.0, vco3Free: true,
    subVol: 0.0,
    // Filter
    cutoff: 4000, resonance: 0, filterEnvAmt: 0.5, keyTrack: 0.5,
    // Filter ADSR
    fAttack: 0.01, fDecay: 0.4, fSustain: 0.5, fRelease: 0.4,
    // VCA ADSR
    vAttack: 0.005, vDecay: 0.3, vSustain: 0.7, vRelease: 0.4,
    velSens: 0.5,
    // LFO
    lfoRate: 3.0, lfoWave: 'sine', lfoAmount: 0,
    lfoToPitch: true, lfoToFilter: false,
    // Master
    volume: 0.75, glide: 0,
  };

  const OCTAVE_DIVS = [0.5, 1, 2, 4]; // 32', 16', 8', 4' — multiplier relative to 8' base
  const OCTAVE_LABELS = ["32'", "16'", "8'", "4'"];
  const WAVEFORMS = ['sawtooth', 'triangle', 'square'];
  const WAVE_LABELS = ['SAW', 'TRI', 'SQR'];

  // ── Presets ────────────────────────────────────────────────────────────────
  const PRESETS = {
    'Init': {
      vco1Wave:'sawtooth', vco1Octave:2, vco1Vol:0.8,
      vco2Wave:'sawtooth', vco2Octave:2, vco2Vol:0.0, vco2Fine:0,
      vco3Wave:'sawtooth', vco3Octave:1, vco3Vol:0.0, vco3Free:true,
      subVol:0.0,
      cutoff:18000, resonance:0, filterEnvAmt:0, keyTrack:0,
      fAttack:0.01, fDecay:0.3, fSustain:1.0, fRelease:0.3,
      vAttack:0.005, vDecay:0.3, vSustain:1.0, vRelease:0.3, velSens:0.5,
      lfoRate:3.0, lfoWave:'sine', lfoAmount:0, lfoToPitch:true, lfoToFilter:false,
      volume:0.75, glide:0,
    },
    'Fat Bass': {
      vco1Wave:'sawtooth', vco1Octave:1, vco1Vol:0.9,
      vco2Wave:'sawtooth', vco2Octave:1, vco2Vol:0.5, vco2Fine:7,
      vco3Wave:'square',   vco3Octave:0, vco3Vol:0.0, vco3Free:false,
      subVol:0.6,
      cutoff:800, resonance:0.35, filterEnvAmt:0.6, keyTrack:0.2,
      fAttack:0.005, fDecay:0.3, fSustain:0.2, fRelease:0.2,
      vAttack:0.005, vDecay:0.35, vSustain:0.3, vRelease:0.2, velSens:0.6,
      lfoRate:3.0, lfoWave:'sine', lfoAmount:0, lfoToPitch:false, lfoToFilter:false,
      volume:0.8, glide:0,
    },
    'Lead': {
      vco1Wave:'square', vco1Octave:2, vco1Vol:0.85,
      vco2Wave:'square', vco2Octave:2, vco2Vol:0.4, vco2Fine:5,
      vco3Wave:'square', vco3Octave:1, vco3Vol:0.0, vco3Free:true,
      subVol:0.0,
      cutoff:3000, resonance:0.3, filterEnvAmt:0.6, keyTrack:0.5,
      fAttack:0.01, fDecay:0.4, fSustain:0.5, fRelease:0.3,
      vAttack:0.01, vDecay:0.3, vSustain:0.8, vRelease:0.3, velSens:0.5,
      lfoRate:5.5, lfoWave:'sine', lfoAmount:0.15, lfoToPitch:true, lfoToFilter:false,
      volume:0.8, glide:0.05,
    },
    'Sweep': {
      vco1Wave:'sawtooth', vco1Octave:2, vco1Vol:0.85,
      vco2Wave:'sawtooth', vco2Octave:2, vco2Vol:0.5, vco2Fine:-5,
      vco3Wave:'sawtooth', vco3Octave:1, vco3Vol:0.3, vco3Free:false,
      subVol:0.0,
      cutoff:400, resonance:0.65, filterEnvAmt:0.85, keyTrack:0.3,
      fAttack:1.2, fDecay:0.8, fSustain:0.3, fRelease:0.6,
      vAttack:0.02, vDecay:0.3, vSustain:0.85, vRelease:0.5, velSens:0.4,
      lfoRate:3.0, lfoWave:'sine', lfoAmount:0, lfoToPitch:false, lfoToFilter:false,
      volume:0.8, glide:0,
    },
    'Acid': {
      vco1Wave:'square', vco1Octave:2, vco1Vol:0.9,
      vco2Wave:'square', vco2Octave:2, vco2Vol:0.0, vco2Fine:0,
      vco3Wave:'square', vco3Octave:1, vco3Vol:0.0, vco3Free:true,
      subVol:0.0,
      cutoff:600, resonance:0.75, filterEnvAmt:0.8, keyTrack:0.0,
      fAttack:0.002, fDecay:0.2, fSustain:0.0, fRelease:0.1,
      vAttack:0.002, vDecay:0.25, vSustain:0.0, vRelease:0.1, velSens:0.7,
      lfoRate:3.0, lfoWave:'sine', lfoAmount:0, lfoToPitch:false, lfoToFilter:false,
      volume:0.85, glide:0.03,
    },
    'Strings': {
      vco1Wave:'sawtooth', vco1Octave:2, vco1Vol:0.7,
      vco2Wave:'sawtooth', vco2Octave:2, vco2Vol:0.65, vco2Fine:8,
      vco3Wave:'sawtooth', vco3Octave:2, vco3Vol:0.4, vco3Free:false,
      subVol:0.0,
      cutoff:5000, resonance:0.05, filterEnvAmt:0.1, keyTrack:0.5,
      fAttack:0.5, fDecay:0.6, fSustain:0.9, fRelease:1.0,
      vAttack:0.6, vDecay:0.4, vSustain:0.9, vRelease:1.2, velSens:0.35,
      lfoRate:3.8, lfoWave:'sine', lfoAmount:0.2, lfoToPitch:true, lfoToFilter:false,
      volume:0.75, glide:0.08,
    },
    'Chords': {
      vco1Wave:'sawtooth', vco1Octave:2, vco1Vol:0.8,
      vco2Wave:'sawtooth', vco2Octave:2, vco2Vol:0.75, vco2Fine:12,
      vco3Wave:'triangle', vco3Octave:3, vco3Vol:0.35, vco3Free:false,
      subVol:0.0,
      cutoff:3500, resonance:0.08, filterEnvAmt:0.15, keyTrack:0.4,
      fAttack:0.05, fDecay:0.5, fSustain:0.8, fRelease:0.6,
      vAttack:0.04, vDecay:0.3, vSustain:0.85, vRelease:0.6, velSens:0.4,
      lfoRate:4.0, lfoWave:'sine', lfoAmount:0.1, lfoToPitch:true, lfoToFilter:false,
      volume:0.75, glide:0,
    },
    'Percussion': {
      vco1Wave:'square', vco1Octave:2, vco1Vol:0.9,
      vco2Wave:'square', vco2Octave:3, vco2Vol:0.5, vco2Fine:0,
      vco3Wave:'square', vco3Octave:1, vco3Vol:0.0, vco3Free:true,
      subVol:0.3,
      cutoff:6000, resonance:0.2, filterEnvAmt:0.7, keyTrack:0.0,
      fAttack:0.001, fDecay:0.12, fSustain:0.0, fRelease:0.05,
      vAttack:0.001, vDecay:0.15, vSustain:0.0, vRelease:0.06, velSens:0.8,
      lfoRate:3.0, lfoWave:'sine', lfoAmount:0, lfoToPitch:false, lfoToFilter:false,
      volume:0.9, glide:0,
    },
  };

  // ── Audio engine ────────────────────────────────────────────────────────────
  let vco1, vco2, vco3, subOsc;
  let vco1Gain, vco2Gain, vco3Gain, subGain, oscSum;
  let filter1, filter2, filter3, filter4, filterFeedback;
  let vcaGain, outputGain;
  let lfo, lfoGain, lfoFilterGain;
  let _currentNote = -1;
  let _lastFreq = 0;

  function _midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function _getVcoFreq(midi, octaveIdx) {
    return _midiToFreq(midi) * OCTAVE_DIVS[octaveIdx];
  }

  function _getCutoffHz() {
    return params.cutoff;
  }

  if (ctx) {
    // VCO1
    vco1 = ctx.createOscillator(); vco1.type = params.vco1Wave;
    vco1Gain = ctx.createGain(); vco1Gain.gain.value = params.vco1Vol;
    vco1.connect(vco1Gain);
    vco1.start();

    // VCO2
    vco2 = ctx.createOscillator(); vco2.type = params.vco2Wave;
    vco2Gain = ctx.createGain(); vco2Gain.gain.value = params.vco2Vol;
    vco2.detune.value = params.vco2Fine;
    vco2.connect(vco2Gain);
    vco2.start();

    // VCO3
    vco3 = ctx.createOscillator(); vco3.type = params.vco3Wave;
    vco3Gain = ctx.createGain(); vco3Gain.gain.value = params.vco3Vol;
    vco3.connect(vco3Gain);
    vco3.start();

    // Sub oscillator (square, one octave below VCO1)
    subOsc = ctx.createOscillator(); subOsc.type = 'square';
    subGain = ctx.createGain(); subGain.gain.value = params.subVol;
    subOsc.connect(subGain);
    subOsc.start();

    // Oscillator sum
    oscSum = ctx.createGain(); oscSum.gain.value = 0.35;
    vco1Gain.connect(oscSum);
    vco2Gain.connect(oscSum);
    vco3Gain.connect(oscSum);
    subGain.connect(oscSum);

    // Ladder filter: 4 cascaded lowpass biquads (24dB/oct approx)
    filter1 = ctx.createBiquadFilter(); filter1.type = 'lowpass'; filter1.Q.value = 0.6;
    filter2 = ctx.createBiquadFilter(); filter2.type = 'lowpass'; filter2.Q.value = 0.6;
    filter3 = ctx.createBiquadFilter(); filter3.type = 'lowpass'; filter3.Q.value = 0.6;
    filter4 = ctx.createBiquadFilter(); filter4.type = 'lowpass'; filter4.Q.value = 0.6;

    // Resonance feedback: filter4 output → feedbackGain → filter1 input
    filterFeedback = ctx.createGain(); filterFeedback.gain.value = 0;

    // VCA
    vcaGain = ctx.createGain(); vcaGain.gain.value = 0;

    // Output
    outputGain = ctx.createGain(); outputGain.gain.value = params.volume;

    // Signal chain
    oscSum.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(filter3);
    filter3.connect(filter4);
    // Feedback loop
    filter4.connect(filterFeedback);
    filterFeedback.connect(filter1);
    filter4.connect(vcaGain);
    vcaGain.connect(outputGain);
    outputGain.connect(ctx.destination);

    // LFO
    lfo = ctx.createOscillator(); lfo.type = params.lfoWave; lfo.frequency.value = params.lfoRate;
    lfoGain = ctx.createGain(); lfoGain.gain.value = 0;
    lfoFilterGain = ctx.createGain(); lfoFilterGain.gain.value = 0;
    lfo.connect(lfoGain);
    lfo.connect(lfoFilterGain);
    lfoGain.connect(vco1.detune);
    lfoGain.connect(vco2.detune);
    lfoGain.connect(vco3.detune);
    lfoFilterGain.connect(filter1.frequency);
    lfoFilterGain.connect(filter2.frequency);
    lfoFilterGain.connect(filter3.frequency);
    lfoFilterGain.connect(filter4.frequency);
    lfo.start();

    // Initial filter params
    _applyFilterCutoff(params.cutoff);
    _applyFilterResonance(params.resonance);
    _applyLFO();
  }

  function _applyFilterCutoff(hz) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const safeHz = Math.max(20, Math.min(hz, ctx.sampleRate / 2.2));
    [filter1, filter2, filter3, filter4].forEach(f => {
      f.frequency.setTargetAtTime(safeHz, t, 0.01);
    });
  }

  function _applyFilterResonance(res) {
    if (!ctx) return;
    const t = ctx.currentTime;
    // feedback: 0–0.9 for self-oscillation
    filterFeedback.gain.setTargetAtTime(res * 0.9, t, 0.01);
  }

  function _applyLFO() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const depth = params.lfoAmount * 150; // cents for pitch
    lfoGain.gain.setTargetAtTime(params.lfoToPitch ? depth : 0, t, 0.02);
    const filterDepth = params.lfoAmount * 2000;
    lfoFilterGain.gain.setTargetAtTime(params.lfoToFilter ? filterDepth : 0, t, 0.02);
  }

  function noteOn(midi, vel = 100) {
    if (!ctx) return;
    const freq = _midiToFreq(midi);
    const t = ctx.currentTime;
    const velScale = 1 - params.velSens * (1 - vel / 127);
    const glideTime = params.glide;

    // Set VCO frequencies with optional glide
    function setOscFreq(osc, targetFreq, lastFreq) {
      osc.frequency.cancelScheduledValues(t);
      if (glideTime > 0 && lastFreq > 0) {
        osc.frequency.setValueAtTime(Math.max(20, lastFreq), t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, targetFreq), t + glideTime);
      } else {
        osc.frequency.setValueAtTime(targetFreq, t);
      }
    }

    const f1 = freq * OCTAVE_DIVS[params.vco1Octave];
    const f2 = freq * OCTAVE_DIVS[params.vco2Octave];
    const f3 = params.vco3Free ? vco3.frequency.value : freq * OCTAVE_DIVS[params.vco3Octave];
    const fSub = f1 / 2;

    const lastF1 = _lastFreq * OCTAVE_DIVS[params.vco1Octave];
    const lastF2 = _lastFreq * OCTAVE_DIVS[params.vco2Octave];
    const lastFSub = _lastFreq * OCTAVE_DIVS[params.vco1Octave] / 2;

    setOscFreq(vco1, f1, lastF1);
    setOscFreq(vco2, f2, lastF2);
    if (!params.vco3Free) setOscFreq(vco3, f3, _lastFreq * OCTAVE_DIVS[params.vco3Octave]);
    setOscFreq(subOsc, fSub, lastFSub);

    _lastFreq = freq;
    _currentNote = midi;

    // Key tracking: shift cutoff by semitones from A4
    const keyOffset = (midi - 69) * (params.keyTrack * 100); // cents
    const trackHz = params.cutoff * Math.pow(2, keyOffset / 1200);

    // Filter envelope
    const envPeak = Math.min(ctx.sampleRate / 2.5, trackHz * (1 + params.filterEnvAmt * 6));
    [filter1, filter2, filter3, filter4].forEach(f => {
      f.frequency.cancelScheduledValues(t);
      f.frequency.setValueAtTime(Math.max(20, trackHz), t);
      f.frequency.linearRampToValueAtTime(Math.max(20, envPeak), t + Math.max(0.001, params.fAttack));
      f.frequency.linearRampToValueAtTime(
        Math.max(20, trackHz * (0.2 + params.fSustain * 0.8)),
        t + Math.max(0.001, params.fAttack) + Math.max(0.01, params.fDecay)
      );
    });

    // VCA envelope
    vcaGain.gain.cancelScheduledValues(t);
    vcaGain.gain.setValueAtTime(0, t);
    vcaGain.gain.linearRampToValueAtTime(params.volume * velScale, t + Math.max(0.001, params.vAttack));
    vcaGain.gain.linearRampToValueAtTime(
      params.volume * params.vSustain * velScale,
      t + Math.max(0.001, params.vAttack) + Math.max(0.01, params.vDecay)
    );

    _updateNoteLED(true);
  }

  function noteOff(midi) {
    if (!ctx) return;
    if (midi !== _currentNote) return;
    const t = ctx.currentTime;

    // VCA release
    const cur = vcaGain.gain.value;
    vcaGain.gain.cancelScheduledValues(t);
    vcaGain.gain.setValueAtTime(Math.max(0, cur), t);
    vcaGain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, params.vRelease));

    // Filter release
    [filter1, filter2, filter3, filter4].forEach(f => {
      const cf = f.frequency.value;
      f.frequency.cancelScheduledValues(t);
      f.frequency.setValueAtTime(Math.max(20, cf), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, params.cutoff * 0.1), t + Math.max(0.02, params.fRelease));
    });

    _currentNote = -1;
    _updateNoteLED(false);
  }

  // Global event listeners
  document.addEventListener('confustudio:note:on',  e => noteOn(e.detail.note, e.detail.velocity * 127));
  document.addEventListener('confustudio:note:off', e => noteOff(e.detail.note));
  document.addEventListener('confustudio:clock', () => {});

  // ── Apply preset ────────────────────────────────────────────────────────────
  function _applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    Object.assign(params, p);
    _syncAudioFromParams();
    _syncUIFromParams();
  }

  function _syncAudioFromParams() {
    if (!ctx) return;
    const t = ctx.currentTime;
    vco1.type = params.vco1Wave;
    vco2.type = params.vco2Wave;
    vco3.type = params.vco3Wave;
    vco2.detune.setValueAtTime(params.vco2Fine, t);
    vco1Gain.gain.setTargetAtTime(params.vco1Vol, t, 0.02);
    vco2Gain.gain.setTargetAtTime(params.vco2Vol, t, 0.02);
    vco3Gain.gain.setTargetAtTime(params.vco3Vol, t, 0.02);
    subGain.gain.setTargetAtTime(params.subVol, t, 0.02);
    _applyFilterCutoff(params.cutoff);
    _applyFilterResonance(params.resonance);
    outputGain.gain.setTargetAtTime(params.volume, t, 0.02);
    lfo.type = params.lfoWave;
    lfo.frequency.setTargetAtTime(params.lfoRate, t, 0.05);
    _applyLFO();
  }

  // ── DOM ────────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'monosynth-chassis';

  function _waveIcon(type) {
    if (type === 'sawtooth') return `<svg width="26" height="14" viewBox="0 0 26 14"><polyline points="0,12 13,2 13,12 26,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
    if (type === 'triangle') return `<svg width="26" height="14" viewBox="0 0 26 14"><polyline points="0,12 7,2 19,12 26,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
    if (type === 'square')   return `<svg width="26" height="14" viewBox="0 0 26 14"><polyline points="0,12 0,2 13,2 13,12 26,12 26,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
    return '';
  }

  function _buildVcoSection(vcoNum) {
    const wKey = `vco${vcoNum}Wave`, octKey = `vco${vcoNum}Octave`, volKey = `vco${vcoNum}Vol`;
    const w = params[wKey], oct = params[octKey], vol = params[volKey];
    return `
      <div class="monosynth-section" data-vco="${vcoNum}">
        <div class="monosynth-section-header">VCO ${vcoNum}</div>
        <div class="monosynth-section-body monosynth-vco-body">
          <div class="monosynth-wave-row">
            ${WAVEFORMS.map(wf => `
              <button class="monosynth-wave-btn ${w === wf ? 'monosynth-wave-btn--on' : ''}" data-vco="${vcoNum}" data-wave="${wf}" title="${wf}">
                ${_waveIcon(wf)}
              </button>
            `).join('')}
          </div>
          <div class="monosynth-oct-row">
            ${OCTAVE_LABELS.map((lbl, i) => `
              <button class="monosynth-oct-btn ${i === oct ? 'monosynth-oct-btn--on' : ''}" data-vco="${vcoNum}" data-oct="${i}">${lbl}</button>
            `).join('')}
          </div>
          ${vcoNum === 2 ? `
          <div class="monosynth-knob-row">
            <span class="monosynth-label">FINE</span>
            <input type="range" class="monosynth-slider monosynth-hz-slider" data-param="vco2Fine"
              min="-7" max="7" step="0.1" value="${params.vco2Fine}" orient="horizontal" />
            <span class="monosynth-fine-val">${params.vco2Fine >= 0 ? '+' : ''}${params.vco2Fine.toFixed(1)}</span>
          </div>` : ''}
          ${vcoNum === 3 ? `
          <div class="monosynth-knob-row">
            <button class="monosynth-free-btn ${params.vco3Free ? 'monosynth-free-btn--on' : ''}" data-param="vco3Free">FREE</button>
          </div>` : ''}
          <div class="monosynth-vol-row">
            <span class="monosynth-label">VOL</span>
            <input type="range" class="monosynth-slider" data-param="${volKey}"
              min="0" max="1" step="0.01" value="${vol}" orient="horizontal" />
          </div>
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="monosynth-ports-bar">
      <span class="port" data-port="audio-out">AUDIO OUT</span>
      <span class="port" data-port="midi-in">MIDI IN</span>
      <span class="monosynth-title">MONOSYNTH</span>
    </div>

    <div class="monosynth-body">

      <!-- VCO row -->
      <div class="monosynth-vco-row">
        ${_buildVcoSection(1)}
        ${_buildVcoSection(2)}
        ${_buildVcoSection(3)}

        <!-- Sub osc -->
        <div class="monosynth-section">
          <div class="monosynth-section-header">SUB</div>
          <div class="monosynth-section-body monosynth-sub-body">
            <div class="monosynth-wave-row">
              <span class="monosynth-wave-icon">${_waveIcon('square')}</span>
              <span class="monosynth-label" style="font-size:7px;">−1 OCT</span>
            </div>
            <div class="monosynth-vol-row">
              <span class="monosynth-label">VOL</span>
              <input type="range" class="monosynth-slider" data-param="subVol"
                min="0" max="1" step="0.01" value="${params.subVol}" orient="horizontal" />
            </div>
          </div>
        </div>
      </div>

      <!-- Middle row: Filter | Filter ADSR | VCA ADSR -->
      <div class="monosynth-mid-row">

        <!-- Ladder Filter -->
        <div class="monosynth-section monosynth-section--tall">
          <div class="monosynth-section-header">LADDER VCF</div>
          <div class="monosynth-section-body monosynth-filter-body">
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="cutoff"
                min="20" max="18000" step="1" value="${params.cutoff}" orient="vertical" />
              <span class="monosynth-label">CUTOFF</span>
              <span class="monosynth-cutoff-val">${Math.round(params.cutoff)}Hz</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="resonance"
                min="0" max="1" step="0.01" value="${params.resonance}" orient="vertical" />
              <span class="monosynth-label">RES</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="filterEnvAmt"
                min="0" max="1" step="0.01" value="${params.filterEnvAmt}" orient="vertical" />
              <span class="monosynth-label">ENV AMT</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="keyTrack"
                min="0" max="1" step="0.01" value="${params.keyTrack}" orient="vertical" />
              <span class="monosynth-label">KEY TRK</span>
            </div>
          </div>
        </div>

        <!-- Filter ADSR -->
        <div class="monosynth-section monosynth-section--tall">
          <div class="monosynth-section-header">FILTER ENV</div>
          <div class="monosynth-section-body monosynth-adsr-body">
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="fAttack"
                min="0.001" max="4" step="0.001" value="${params.fAttack}" orient="vertical" />
              <span class="monosynth-label">A</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="fDecay"
                min="0.01" max="4" step="0.001" value="${params.fDecay}" orient="vertical" />
              <span class="monosynth-label">D</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="fSustain"
                min="0" max="1" step="0.01" value="${params.fSustain}" orient="vertical" />
              <span class="monosynth-label">S</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="fRelease"
                min="0.01" max="6" step="0.001" value="${params.fRelease}" orient="vertical" />
              <span class="monosynth-label">R</span>
            </div>
          </div>
        </div>

        <!-- VCA ADSR -->
        <div class="monosynth-section monosynth-section--tall">
          <div class="monosynth-section-header">AMP ENV</div>
          <div class="monosynth-section-body monosynth-adsr-body">
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="vAttack"
                min="0.001" max="4" step="0.001" value="${params.vAttack}" orient="vertical" />
              <span class="monosynth-label">A</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="vDecay"
                min="0.01" max="4" step="0.001" value="${params.vDecay}" orient="vertical" />
              <span class="monosynth-label">D</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="vSustain"
                min="0" max="1" step="0.01" value="${params.vSustain}" orient="vertical" />
              <span class="monosynth-label">S</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="vRelease"
                min="0.01" max="6" step="0.001" value="${params.vRelease}" orient="vertical" />
              <span class="monosynth-label">R</span>
            </div>
          </div>
        </div>

        <!-- VEL SENS -->
        <div class="monosynth-section">
          <div class="monosynth-section-header">VCA</div>
          <div class="monosynth-section-body" style="flex-direction:column; align-items:center; gap:4px; padding:6px 4px;">
            <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="velSens"
              min="0" max="1" step="0.01" value="${params.velSens}" orient="vertical" />
            <span class="monosynth-label">VEL SENS</span>
          </div>
        </div>

      </div>

      <!-- Bottom row: LFO | Glide | Master Vol | Presets -->
      <div class="monosynth-bot-row">

        <!-- LFO -->
        <div class="monosynth-section">
          <div class="monosynth-section-header">LFO</div>
          <div class="monosynth-section-body monosynth-lfo-body">
            <div class="monosynth-wave-row" style="flex-wrap:wrap; gap:2px;">
              ${['sine','triangle','square'].map(wf => `
                <button class="monosynth-lfo-wave-btn ${params.lfoWave === wf ? 'monosynth-lfo-wave-btn--on' : ''}" data-lfowave="${wf}" title="${wf}">
                  ${_waveIcon(wf)}
                </button>
              `).join('')}
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="lfoRate"
                min="0.1" max="20" step="0.01" value="${params.lfoRate}" orient="vertical" />
              <span class="monosynth-label">RATE</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="lfoAmount"
                min="0" max="1" step="0.01" value="${params.lfoAmount}" orient="vertical" />
              <span class="monosynth-label">DEPTH</span>
            </div>
            <div class="monosynth-lfo-dest">
              <button class="monosynth-dest-btn ${params.lfoToPitch ? 'monosynth-dest-btn--on' : ''}" data-dest="lfoToPitch">PITCH</button>
              <button class="monosynth-dest-btn ${params.lfoToFilter ? 'monosynth-dest-btn--on' : ''}" data-dest="lfoToFilter">FILT</button>
            </div>
          </div>
        </div>

        <!-- Glide + Master Vol -->
        <div class="monosynth-section">
          <div class="monosynth-section-header">MASTER</div>
          <div class="monosynth-section-body" style="flex-direction:row; gap:8px; align-items:flex-end; padding:8px;">
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="glide"
                min="0" max="0.5" step="0.001" value="${params.glide}" orient="vertical" />
              <span class="monosynth-label">GLIDE</span>
            </div>
            <div class="monosynth-knob-col">
              <input type="range" class="monosynth-slider monosynth-vert-slider" data-param="volume"
                min="0" max="1" step="0.01" value="${params.volume}" orient="vertical" />
              <span class="monosynth-label">VOL</span>
            </div>
          </div>
        </div>

        <!-- Presets -->
        <div class="monosynth-section">
          <div class="monosynth-section-header">PRESET</div>
          <div class="monosynth-section-body" style="flex-direction:column; gap:5px; align-items:stretch; padding:8px;">
            <select class="monosynth-preset-select">
              ${Object.keys(PRESETS).map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
            <button class="monosynth-load-preset">LOAD</button>
          </div>
        </div>

        <!-- Note indicator -->
        <div class="monosynth-section">
          <div class="monosynth-section-header">STATUS</div>
          <div class="monosynth-section-body" style="flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:8px;">
            <div class="monosynth-note-led"></div>
            <span class="monosynth-label">GATE</span>
          </div>
        </div>

        <!-- Keyboard -->
        <div class="monosynth-keyboard-wrap">
          <div class="monosynth-keyboard"></div>
        </div>
      </div>

    </div>

    <style>
      .monosynth-chassis {
        background: #f5f0e8;
        border-radius: 8px 8px 4px 4px;
        width: 1000px;
        min-height: 300px;
        box-sizing: border-box;
        font-family: monospace;
        display: flex;
        flex-direction: column;
        box-shadow: 0 6px 28px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.5);
        border: 2px solid #8B6914;
        position: relative;
        overflow: hidden;
        color: #2a1a0a;
      }
      /* Wood grain sides */
      .monosynth-chassis::before,
      .monosynth-chassis::after {
        content: '';
        position: absolute;
        top: 0;
        width: 22px;
        height: 100%;
        background: repeating-linear-gradient(
          180deg,
          #6b3a12 0px, #8a5228 5px, #5c3010 10px, #7a4820 15px
        );
        z-index: 1;
        box-shadow: inset 0 0 6px rgba(0,0,0,0.4);
      }
      .monosynth-chassis::before { left: 0; border-radius: 6px 0 0 4px; }
      .monosynth-chassis::after  { right: 0; border-radius: 0 6px 4px 0; }

      .monosynth-ports-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 30px;
        background: #2a1a0a;
        border-bottom: 2px solid #8B6914;
        min-height: 26px;
        position: relative;
        z-index: 2;
      }
      .monosynth-ports-bar .port {
        font-size: 9px;
        color: #ccc;
        letter-spacing: 0.08em;
        background: #3a2a1a;
        border: 1px solid #6a4a2a;
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
      }
      .monosynth-ports-bar .port:hover { background: #4a3a2a; }
      .monosynth-title {
        margin-left: auto;
        margin-right: 24px;
        font-size: 16px;
        font-weight: bold;
        color: #f5c842;
        letter-spacing: 0.18em;
        font-family: monospace;
        text-shadow: 0 1px 0 #000, 0 0 8px rgba(245,200,66,0.3);
      }

      .monosynth-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 28px;
        position: relative;
        z-index: 2;
        flex: 1;
      }

      .monosynth-vco-row,
      .monosynth-mid-row,
      .monosynth-bot-row {
        display: flex;
        flex-direction: row;
        gap: 4px;
        align-items: stretch;
      }

      .monosynth-section {
        display: flex;
        flex-direction: column;
        border: 1px solid #8B6914;
        border-radius: 4px;
        overflow: hidden;
        background: #ede8dc;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.15);
      }
      .monosynth-section--tall { min-height: 90px; }

      .monosynth-section-header {
        background: #2a1a0a;
        color: #f5c842;
        font-size: 8px;
        letter-spacing: 0.12em;
        font-weight: bold;
        text-align: center;
        padding: 2px 4px;
        white-space: nowrap;
        text-transform: uppercase;
      }

      .monosynth-section-body {
        display: flex;
        flex-direction: row;
        gap: 4px;
        padding: 5px 4px;
        align-items: flex-end;
        flex: 1;
      }

      .monosynth-vco-body,
      .monosynth-sub-body {
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
        padding: 5px 6px;
      }

      .monosynth-wave-row {
        display: flex;
        flex-direction: row;
        gap: 2px;
        align-items: center;
      }

      .monosynth-wave-icon {
        color: #555;
        display: flex;
        align-items: center;
      }

      .monosynth-wave-btn {
        padding: 2px 3px;
        background: #d8d0c0;
        border: 1px solid #8B6914;
        border-radius: 2px;
        cursor: pointer;
        color: #444;
        transition: background 0.1s, color 0.1s;
        display: flex;
        align-items: center;
      }
      .monosynth-wave-btn:hover { background: #c8c0b0; }
      .monosynth-wave-btn--on {
        background: #c84010;
        color: #fff;
        border-color: #c84010;
      }

      .monosynth-oct-row {
        display: flex;
        flex-direction: row;
        gap: 2px;
      }
      .monosynth-oct-btn {
        font-family: monospace;
        font-size: 8px;
        padding: 2px 3px;
        background: #d8d0c0;
        border: 1px solid #8B6914;
        border-radius: 2px;
        cursor: pointer;
        color: #444;
        white-space: nowrap;
        transition: background 0.1s, color 0.1s;
        flex: 1;
        text-align: center;
      }
      .monosynth-oct-btn:hover { background: #c8c0b0; }
      .monosynth-oct-btn--on {
        background: #c84010;
        color: #fff;
        border-color: #c84010;
      }

      .monosynth-vol-row,
      .monosynth-knob-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
      }

      .monosynth-label {
        font-size: 7px;
        color: #666;
        letter-spacing: 0.06em;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .monosynth-slider {
        cursor: pointer;
        accent-color: #c84010;
        flex: 1;
        min-width: 0;
      }
      .monosynth-hz-slider { height: 12px; }
      .monosynth-vert-slider {
        -webkit-appearance: slider-vertical;
        appearance: slider-vertical;
        writing-mode: vertical-lr;
        direction: rtl;
        width: 16px;
        height: 68px;
        background: transparent;
      }

      .monosynth-fine-val {
        font-size: 8px;
        color: #c84010;
        font-family: monospace;
        min-width: 28px;
        flex-shrink: 0;
      }

      .monosynth-cutoff-val {
        font-size: 7px;
        color: #c84010;
        font-family: monospace;
      }

      .monosynth-free-btn {
        font-family: monospace;
        font-size: 8px;
        padding: 2px 6px;
        background: #d8d0c0;
        color: #666;
        border: 1px solid #8B6914;
        border-radius: 2px;
        cursor: pointer;
        letter-spacing: 0.07em;
        transition: background 0.1s, color 0.1s;
      }
      .monosynth-free-btn--on {
        background: #c84010;
        color: #fff;
        border-color: #c84010;
      }

      .monosynth-filter-body,
      .monosynth-adsr-body {
        flex-direction: row;
        align-items: flex-end;
        gap: 6px;
        padding: 6px 6px;
      }

      .monosynth-knob-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .monosynth-lfo-body {
        flex-direction: row;
        align-items: flex-end;
        gap: 6px;
        flex-wrap: wrap;
        padding: 5px 6px;
      }

      .monosynth-lfo-wave-btn {
        padding: 2px 3px;
        background: #d8d0c0;
        border: 1px solid #8B6914;
        border-radius: 2px;
        cursor: pointer;
        color: #444;
        display: flex;
        align-items: center;
        transition: background 0.1s, color 0.1s;
      }
      .monosynth-lfo-wave-btn:hover { background: #c8c0b0; }
      .monosynth-lfo-wave-btn--on {
        background: #c84010;
        color: #fff;
        border-color: #c84010;
      }

      .monosynth-lfo-dest {
        display: flex;
        flex-direction: column;
        gap: 3px;
        justify-content: center;
      }
      .monosynth-dest-btn {
        font-family: monospace;
        font-size: 8px;
        padding: 2px 5px;
        background: #d8d0c0;
        color: #555;
        border: 1px solid #8B6914;
        border-radius: 2px;
        cursor: pointer;
        letter-spacing: 0.06em;
        transition: background 0.1s, color 0.1s;
      }
      .monosynth-dest-btn--on {
        background: #c84010;
        color: #fff;
        border-color: #c84010;
      }

      .monosynth-preset-select {
        font-family: monospace;
        font-size: 9px;
        background: #ede8dc;
        color: #2a1a0a;
        border: 1px solid #8B6914;
        border-radius: 3px;
        padding: 3px 4px;
        cursor: pointer;
        width: 100%;
      }
      .monosynth-load-preset {
        font-family: monospace;
        font-size: 9px;
        padding: 3px 8px;
        background: #2a1a0a;
        color: #f5c842;
        border: 1px solid #8B6914;
        border-radius: 3px;
        cursor: pointer;
        letter-spacing: 0.08em;
        transition: background 0.1s;
        width: 100%;
      }
      .monosynth-load-preset:hover { background: #3a2a1a; }

      .monosynth-note-led {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #888;
        border: 1px solid #aaa;
        transition: background 0.06s, box-shadow 0.06s;
      }
      .monosynth-note-led.active {
        background: #c84010;
        border-color: #e06030;
        box-shadow: 0 0 6px rgba(200,64,16,0.8);
      }

      .monosynth-keyboard-wrap {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .monosynth-keyboard {
        position: relative;
        height: 56px;
        display: flex;
      }
      .monosynth-key-white {
        flex: 1;
        background: linear-gradient(180deg, #f8f8f5 0%, #eae8e0 100%);
        border: 1px solid #999;
        border-top: none;
        border-radius: 0 0 3px 3px;
        cursor: pointer;
        position: relative;
        transition: background 0.06s;
        min-width: 0;
      }
      .monosynth-key-label {
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 6px;
        color: #888;
        font-family: monospace;
        pointer-events: none;
      }
      .monosynth-key-white:active, .monosynth-key-white.pressed {
        background: linear-gradient(180deg, #c8d0c8 0%, #b0b8b0 100%);
      }
      .monosynth-key-black {
        position: absolute;
        width: 58%;
        height: 60%;
        background: linear-gradient(180deg, #111 0%, #2a2a2a 100%);
        border-radius: 0 0 2px 2px;
        cursor: pointer;
        z-index: 3;
        top: 0;
        transform: translateX(-50%);
        transition: background 0.06s;
        border: 1px solid #000;
      }
      .monosynth-key-black:active, .monosynth-key-black.pressed {
        background: linear-gradient(180deg, #2a2a2a 0%, #444 100%);
      }
    </style>
  `;

  // ── Note LED ───────────────────────────────────────────────────────────────
  function _updateNoteLED(on) {
    const led = el.querySelector('.monosynth-note-led');
    if (led) led.classList.toggle('active', on);
  }

  // ── Sync UI from params ────────────────────────────────────────────────────
  function _syncUIFromParams() {
    // VCO wave buttons
    [1,2,3].forEach(vn => {
      const wKey = `vco${vn}Wave`;
      el.querySelectorAll(`.monosynth-wave-btn[data-vco="${vn}"]`).forEach(btn => {
        btn.classList.toggle('monosynth-wave-btn--on', btn.dataset.wave === params[wKey]);
      });
      const oKey = `vco${vn}Octave`;
      el.querySelectorAll(`.monosynth-oct-btn[data-vco="${vn}"]`).forEach(btn => {
        btn.classList.toggle('monosynth-oct-btn--on', parseInt(btn.dataset.oct) === params[oKey]);
      });
      const volSlider = el.querySelector(`.monosynth-slider[data-param="vco${vn}Vol"]`);
      if (volSlider) volSlider.value = params[`vco${vn}Vol`];
    });
    // VCO2 fine
    const fineSlider = el.querySelector('.monosynth-slider[data-param="vco2Fine"]');
    if (fineSlider) {
      fineSlider.value = params.vco2Fine;
      const fv = el.querySelector('.monosynth-fine-val');
      if (fv) fv.textContent = `${params.vco2Fine >= 0 ? '+' : ''}${params.vco2Fine.toFixed(1)}`;
    }
    // VCO3 free
    const freeBtn = el.querySelector('.monosynth-free-btn');
    if (freeBtn) freeBtn.classList.toggle('monosynth-free-btn--on', params.vco3Free);
    // Sub
    const subSlider = el.querySelector('.monosynth-slider[data-param="subVol"]');
    if (subSlider) subSlider.value = params.subVol;
    // All other numeric sliders
    ['cutoff','resonance','filterEnvAmt','keyTrack',
     'fAttack','fDecay','fSustain','fRelease',
     'vAttack','vDecay','vSustain','vRelease','velSens',
     'lfoRate','lfoAmount','glide','volume'].forEach(p => {
      const sl = el.querySelector(`.monosynth-slider[data-param="${p}"]`);
      if (sl) sl.value = params[p];
    });
    const cv = el.querySelector('.monosynth-cutoff-val');
    if (cv) cv.textContent = `${Math.round(params.cutoff)}Hz`;
    // LFO wave
    el.querySelectorAll('.monosynth-lfo-wave-btn').forEach(btn => {
      btn.classList.toggle('monosynth-lfo-wave-btn--on', btn.dataset.lfowave === params.lfoWave);
    });
    // LFO dest
    el.querySelectorAll('.monosynth-dest-btn').forEach(btn => {
      btn.classList.toggle('monosynth-dest-btn--on', !!params[btn.dataset.dest]);
    });
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const kbEl = el.querySelector('.monosynth-keyboard');
  const WHITE_PATTERN = [0,2,4,5,7,9,11];
  const MIDI_START = 48;
  const MIDI_END   = 72;
  const whiteKeys = [];
  const blackKeys = [];
  for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
    const semi = midi % 12;
    if (WHITE_PATTERN.includes(semi)) whiteKeys.push(midi);
    else blackKeys.push(midi);
  }
  whiteKeys.forEach(midi => {
    const k = document.createElement('div');
    k.className = 'monosynth-key-white';
    k.dataset.midi = midi;
    if (midi % 12 === 0) {
      const lbl = document.createElement('span');
      lbl.className = 'monosynth-key-label';
      lbl.textContent = `C${Math.floor(midi/12)-1}`;
      k.appendChild(lbl);
    }
    kbEl.appendChild(k);
  });
  const wkW = 100 / whiteKeys.length;
  blackKeys.forEach(midi => {
    const prevWhiteIdx = whiteKeys.findIndex(w => w > midi) - 1;
    if (prevWhiteIdx < 0) return;
    const k = document.createElement('div');
    k.className = 'monosynth-key-black';
    k.dataset.midi = midi;
    k.style.left = `${(prevWhiteIdx + 1) * wkW}%`;
    kbEl.appendChild(k);
  });

  kbEl.addEventListener('pointerdown', e => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    e.preventDefault();
    k.setPointerCapture(e.pointerId);
    k.classList.add('pressed');
    noteOn(parseInt(k.dataset.midi), 80);
  });
  kbEl.addEventListener('pointerup', e => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    k.classList.remove('pressed');
    noteOff(parseInt(k.dataset.midi));
  });
  kbEl.addEventListener('pointercancel', e => {
    const k = e.target.closest('[data-midi]');
    if (!k) return;
    k.classList.remove('pressed');
    noteOff(parseInt(k.dataset.midi));
  });

  // ── Slider interactions ────────────────────────────────────────────────────
  el.querySelectorAll('.monosynth-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const p = slider.dataset.param;
      const v = parseFloat(slider.value);
      params[p] = v;
      _onParamChange(p, v);
    });
  });

  function _onParamChange(p, v) {
    if (!ctx) return;
    const t = ctx.currentTime;
    switch(p) {
      case 'cutoff':
        _applyFilterCutoff(v);
        { const cv = el.querySelector('.monosynth-cutoff-val'); if (cv) cv.textContent = `${Math.round(v)}Hz`; }
        break;
      case 'resonance':
        _applyFilterResonance(v);
        break;
      case 'volume':
        outputGain.gain.setTargetAtTime(v, t, 0.02);
        break;
      case 'lfoRate':
        lfo.frequency.setTargetAtTime(v, t, 0.05);
        break;
      case 'lfoAmount':
        _applyLFO();
        break;
      case 'vco1Vol': vco1Gain.gain.setTargetAtTime(v, t, 0.02); break;
      case 'vco2Vol': vco2Gain.gain.setTargetAtTime(v, t, 0.02); break;
      case 'vco3Vol': vco3Gain.gain.setTargetAtTime(v, t, 0.02); break;
      case 'subVol':  subGain.gain.setTargetAtTime(v, t, 0.02); break;
      case 'vco2Fine': vco2.detune.setTargetAtTime(v, t, 0.01);
        { const fv = el.querySelector('.monosynth-fine-val'); if (fv) fv.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)}`; }
        break;
    }
  }

  // ── VCO wave buttons ───────────────────────────────────────────────────────
  el.querySelectorAll('.monosynth-wave-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const vn = parseInt(btn.dataset.vco);
      const wf = btn.dataset.wave;
      const wKey = `vco${vn}Wave`;
      params[wKey] = wf;
      el.querySelectorAll(`.monosynth-wave-btn[data-vco="${vn}"]`).forEach(b =>
        b.classList.toggle('monosynth-wave-btn--on', b.dataset.wave === wf)
      );
      if (ctx) {
        if (vn === 1) vco1.type = wf;
        else if (vn === 2) vco2.type = wf;
        else if (vn === 3) vco3.type = wf;
      }
    });
  });

  // ── VCO octave buttons ─────────────────────────────────────────────────────
  el.querySelectorAll('.monosynth-oct-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const vn = parseInt(btn.dataset.vco);
      const oi = parseInt(btn.dataset.oct);
      params[`vco${vn}Octave`] = oi;
      el.querySelectorAll(`.monosynth-oct-btn[data-vco="${vn}"]`).forEach(b =>
        b.classList.toggle('monosynth-oct-btn--on', parseInt(b.dataset.oct) === oi)
      );
    });
  });

  // ── VCO3 free toggle ───────────────────────────────────────────────────────
  el.querySelector('.monosynth-free-btn')?.addEventListener('click', e => {
    params.vco3Free = !params.vco3Free;
    e.currentTarget.classList.toggle('monosynth-free-btn--on', params.vco3Free);
  });

  // ── LFO wave buttons ───────────────────────────────────────────────────────
  el.querySelectorAll('.monosynth-lfo-wave-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wf = btn.dataset.lfowave;
      params.lfoWave = wf;
      if (ctx) lfo.type = wf;
      el.querySelectorAll('.monosynth-lfo-wave-btn').forEach(b =>
        b.classList.toggle('monosynth-lfo-wave-btn--on', b.dataset.lfowave === wf)
      );
    });
  });

  // ── LFO destination buttons ────────────────────────────────────────────────
  el.querySelectorAll('.monosynth-dest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dest = btn.dataset.dest;
      params[dest] = !params[dest];
      btn.classList.toggle('monosynth-dest-btn--on', params[dest]);
      _applyLFO();
    });
  });

  // ── Preset load ────────────────────────────────────────────────────────────
  el.querySelector('.monosynth-load-preset')?.addEventListener('click', () => {
    const name = el.querySelector('.monosynth-preset-select')?.value;
    if (name) _applyPreset(name);
  });

  // ── Audio port export ──────────────────────────────────────────────────────
  if (ctx && outputGain) {
    el._monosynthAudio = outputGain;
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  return el;
}
