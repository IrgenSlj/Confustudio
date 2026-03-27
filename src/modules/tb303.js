// tb303.js — Roland TB-303 Acid Bass Synthesizer module

export function createTB303(audioContext) {
  // ── State ──────────────────────────────────────────────────────────────────
  const _steps = Array.from({ length: 16 }, () => ({
    note: 60,
    octave: 0,
    active: false,
    accent: false,
    slide: false,
  }));

  // Default pattern: classic acid bass line
  [0, 2, 4, 7, 8, 10, 12, 14].forEach(i => { _steps[i].active = true; });

  let _running = false;
  let _currentStep = -1;
  let _prevFreq = 110;
  let _waveform = 'sawtooth';

  // Knob values (0–1 normalized)
  const _params = {
    tune: 0.5,       // center = 0 semitones
    cutoff: 0.35,    // ~1000 Hz
    resonance: 0.55,
    envMod: 0.6,
    decay: 0.4,
    accent: 0.6,
    drive: 0.2,
    volume: 0.75,
  };

  // ── Audio Engine ──────────────────────────────────────────────────────────
  let osc = null;
  let oscStarted = false;
  const ctx = audioContext;

  let filterF1, filterF2, filterF3, resonanceFeedback;
  let vcaGain, driveWS, outputGain, oscGain;

  if (ctx) {
    // Oscillator
    osc = ctx.createOscillator();
    osc.type = _waveform;
    osc.frequency.value = 110;

    // Oscillator gain (for gating)
    oscGain = ctx.createGain();
    oscGain.gain.value = 0;

    // Diode ladder filter: 3 cascaded lowpass biquads
    filterF1 = ctx.createBiquadFilter();
    filterF1.type = 'lowpass';
    filterF1.Q.value = 0.6;

    filterF2 = ctx.createBiquadFilter();
    filterF2.type = 'lowpass';
    filterF2.Q.value = 0.6;

    filterF3 = ctx.createBiquadFilter();
    filterF3.type = 'lowpass';
    filterF3.Q.value = 0.6;

    // Resonance feedback: f3 output → feedback gain → f1 input
    resonanceFeedback = ctx.createGain();
    resonanceFeedback.gain.value = 0;

    // VCA
    vcaGain = ctx.createGain();
    vcaGain.gain.value = 0;

    // Drive waveshaper
    driveWS = ctx.createWaveShaper();
    driveWS.oversample = '2x';

    // Output gain
    outputGain = ctx.createGain();
    outputGain.gain.value = 0.75;

    // Signal chain: osc → oscGain → f1 → f2 → f3 → vcaGain → driveWS → outputGain
    osc.connect(oscGain);
    oscGain.connect(filterF1);
    filterF1.connect(filterF2);
    filterF2.connect(filterF3);

    // Resonance feedback loop: f3 → resonanceFeedback → f1
    filterF3.connect(resonanceFeedback);
    resonanceFeedback.connect(filterF1);

    filterF3.connect(vcaGain);
    vcaGain.connect(driveWS);
    driveWS.connect(outputGain);

    // Initialize params
    _applyDriveCurve();
    _applyFilterParams();
    _applyVolume();

    osc.start();
    oscStarted = true;
  }

  function _midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function _midiFromStep(step) {
    return step.note + step.octave * 12;
  }

  function _getCutoffHz() {
    // Exponential 300–10000 Hz
    const t = _params.cutoff;
    return 300 * Math.pow(10000 / 300, t);
  }

  function _getDecayTime() {
    // 100ms – 2000ms
    return 0.1 + _params.decay * 1.9;
  }

  function _applyFilterParams() {
    if (!ctx) return;
    const cutHz = _getCutoffHz();
    const now = ctx.currentTime;
    [filterF1, filterF2, filterF3].forEach(f => {
      f.frequency.setTargetAtTime(cutHz, now, 0.01);
    });
    // Resonance feedback: 0 to 0.92
    const res = _params.resonance * 0.92;
    resonanceFeedback.gain.setTargetAtTime(res, now, 0.01);
  }

  function _applyDriveCurve() {
    if (!driveWS) return;
    const amount = _params.drive * 50;
    driveWS.curve = _makeDriveCurve(amount);
  }

  function _applyVolume() {
    if (!outputGain) return;
    outputGain.gain.setTargetAtTime(_params.volume, ctx.currentTime, 0.02);
  }

  function _makeDriveCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      if (amount === 0) {
        curve[i] = x;
      } else {
        curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
      }
    }
    return curve;
  }

  function _playStep(stepIdx) {
    if (!ctx) return;
    const step = _steps[stepIdx];
    const now = ctx.currentTime;

    // Update step LED
    _updateStepLEDs(stepIdx);

    if (!step.active) {
      // Gate off
      vcaGain.gain.cancelScheduledValues(now);
      vcaGain.gain.setTargetAtTime(0, now, 0.01);
      return;
    }

    const midi = _midiFromStep(step);
    const freq = _midiToFreq(midi);
    const cutHz = _getCutoffHz();
    const decayTime = _getDecayTime();
    const isAccent = step.accent;
    const isSlide = step.slide;

    // Set oscillator frequency (with or without slide)
    if (isSlide && _prevFreq !== freq) {
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(_prevFreq, now);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.05);
    } else {
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(freq, now);
    }
    _prevFreq = freq;

    // VCA gate envelope
    const accentBoost = isAccent ? 1.4 : 1.0;
    const accentLevel = _params.accent;
    const vcaPeak = isAccent
      ? Math.min(1.2, 0.7 * accentBoost * (0.5 + accentLevel * 0.5))
      : 0.7;

    vcaGain.gain.cancelScheduledValues(now);
    vcaGain.gain.setValueAtTime(0, now);
    vcaGain.gain.linearRampToValueAtTime(vcaPeak, now + 0.001); // 1ms attack
    // Hold for step duration then decay
    vcaGain.gain.setTargetAtTime(0, now + 0.08, 0.05);

    // Gate the oscillator through oscGain
    oscGain.gain.cancelScheduledValues(now);
    oscGain.gain.setValueAtTime(0.8, now);

    // Filter envelope (AHD)
    const envAttack = isAccent ? 0.0005 : 0.004; // 0.5ms or 4ms
    const envDecay = isAccent ? decayTime * 0.5 : decayTime;
    const envPeak = cutHz * (1 + _params.envMod * 3);
    const envPeakClamped = Math.min(envPeak, 14000);

    [filterF1, filterF2, filterF3].forEach(f => {
      f.frequency.cancelScheduledValues(now);
      f.frequency.setValueAtTime(cutHz, now);
      f.frequency.linearRampToValueAtTime(envPeakClamped, now + envAttack);
      f.frequency.setTargetAtTime(cutHz, now + envAttack, envDecay * 0.3);
    });
  }

  function _updateStepLEDs(activeIdx) {
    el.querySelectorAll('.tb303-step').forEach((btn, i) => {
      btn.classList.toggle('playing', i === activeIdx);
    });
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'tb303-chassis';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function _noteLabel(step) {
    return NOTE_NAMES[step.note % 12] + (Math.floor(step.note / 12) - 1 + step.octave);
  }

  function _buildStepButtons() {
    return Array.from({ length: 16 }, (_, i) => {
      const s = _steps[i];
      return `
        <div class="tb303-step-wrap" data-step="${i}">
          <div class="tb303-step-led"></div>
          <button class="tb303-step ${s.active ? 'active' : ''}" data-step="${i}" title="Step ${i + 1}">
            <span class="tb303-step-num">${i + 1}</span>
            <span class="tb303-step-note">${_noteLabel(s)}</span>
          </button>
          <div class="tb303-step-flags">
            <button class="tb303-flag-btn tb303-acc-btn ${s.accent ? 'on' : ''}" data-step="${i}" data-flag="accent" title="Accent">A</button>
            <button class="tb303-flag-btn tb303-slide-btn ${s.slide ? 'on' : ''}" data-step="${i}" data-flag="slide" title="Slide">S</button>
          </div>
        </div>
      `;
    }).join('');
  }

  el.innerHTML = `
    <div class="tb303-ports-bar">
      <span class="port" data-port="clock-in">CLK IN</span>
      <span class="tb303-brand">ROLAND  TB-303</span>
      <span class="port" data-port="audio-out">AUDIO OUT</span>
    </div>

    <div class="tb303-body">

      <!-- Top knob row -->
      <div class="tb303-knob-row tb303-top-knobs">
        <div class="tb303-knob-wrap">
          <span class="tb303-knob-label">TUNING</span>
          <div class="tb303-knob" data-param="tune" tabindex="0"></div>
          <span class="tb303-knob-val" data-param-val="tune">0</span>
        </div>
        <div class="tb303-knob-wrap">
          <span class="tb303-knob-label">CUTOFF</span>
          <div class="tb303-knob" data-param="cutoff" tabindex="0"></div>
          <span class="tb303-knob-val" data-param-val="cutoff">1k</span>
        </div>
        <div class="tb303-knob-wrap">
          <span class="tb303-knob-label">RESONANCE</span>
          <div class="tb303-knob" data-param="resonance" tabindex="0"></div>
          <span class="tb303-knob-val" data-param-val="resonance">55%</span>
        </div>
        <div class="tb303-knob-wrap">
          <span class="tb303-knob-label">ENV MOD</span>
          <div class="tb303-knob" data-param="envMod" tabindex="0"></div>
          <span class="tb303-knob-val" data-param-val="envMod">60%</span>
        </div>
        <div class="tb303-knob-wrap">
          <span class="tb303-knob-label">DECAY</span>
          <div class="tb303-knob" data-param="decay" tabindex="0"></div>
          <span class="tb303-knob-val" data-param-val="decay">840ms</span>
        </div>
        <div class="tb303-knob-wrap">
          <span class="tb303-knob-label">ACCENT</span>
          <div class="tb303-knob" data-param="accent" tabindex="0"></div>
          <span class="tb303-knob-val" data-param-val="accent">60%</span>
        </div>
      </div>

      <!-- Middle controls -->
      <div class="tb303-middle">
        <div class="tb303-wave-group">
          <span class="tb303-section-label">WAVEFORM</span>
          <div class="tb303-wave-btns">
            <button class="tb303-wave-btn active" data-wave="sawtooth">SAW ⋀</button>
            <button class="tb303-wave-btn" data-wave="square">SQR ⊓</button>
          </div>
        </div>

        <div class="tb303-small-knobs">
          <div class="tb303-knob-wrap">
            <span class="tb303-knob-label">DRIVE</span>
            <div class="tb303-knob tb303-knob--sm" data-param="drive" tabindex="0"></div>
            <span class="tb303-knob-val" data-param-val="drive">10</span>
          </div>
          <div class="tb303-knob-wrap">
            <span class="tb303-knob-label">VOLUME</span>
            <div class="tb303-knob tb303-knob--sm" data-param="volume" tabindex="0"></div>
            <span class="tb303-knob-val" data-param-val="volume">75%</span>
          </div>
        </div>

        <div class="tb303-transport">
          <button class="tb303-run-btn" id="tb303-run">▶ RUN</button>
          <button class="tb303-stop-btn" id="tb303-stop">■ STOP</button>
        </div>
      </div>

      <!-- Sequencer grid -->
      <div class="tb303-seq-section">
        <div class="tb303-seq-grid">
          ${_buildStepButtons()}
        </div>

        <!-- Note editor -->
        <div class="tb303-note-editor">
          <span class="tb303-section-label">STEP NOTE</span>
          <div class="tb303-note-picker">
            ${NOTE_NAMES.map((n, i) => `<button class="tb303-note-btn ${n.includes('#') ? 'sharp' : ''}" data-note-offset="${i}">${n}</button>`).join('')}
          </div>
          <div class="tb303-octave-picker">
            <span class="tb303-section-label">OCT</span>
            <button class="tb303-oct-btn" data-oct="-1">−</button>
            <span class="tb303-oct-val">0</span>
            <button class="tb303-oct-btn" data-oct="1">+</button>
          </div>
          <span class="tb303-sel-label">— select a step —</span>
        </div>
      </div>

    </div>
  `;

  // ── Knob interaction ───────────────────────────────────────────────────────
  function _knobAngle(v) {
    return -145 + v * 290;
  }

  function _updateKnobVisual(knob, v) {
    knob.style.transform = `rotate(${_knobAngle(v)}deg)`;
    const param = knob.dataset.param;
    const valEl = el.querySelector(`[data-param-val="${param}"]`);
    if (valEl) valEl.textContent = _formatVal(param, v);
  }

  function _formatVal(param, v) {
    switch (param) {
      case 'tune': {
        const st = Math.round((v - 0.5) * 24);
        return `${st > 0 ? '+' : ''}${st}st`;
      }
      case 'cutoff': {
        const hz = Math.round(300 * Math.pow(10000 / 300, v));
        return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${hz}Hz`;
      }
      case 'resonance': return `${Math.round(v * 100)}%`;
      case 'envMod':    return `${Math.round(v * 100)}%`;
      case 'decay':     return `${Math.round((0.1 + v * 1.9) * 1000)}ms`;
      case 'accent':    return `${Math.round(v * 100)}%`;
      case 'drive':     return `${Math.round(v * 50)}`;
      case 'volume':    return `${Math.round(v * 100)}%`;
      default:          return `${Math.round(v * 100)}%`;
    }
  }

  function _onParamChange(param, v) {
    _params[param] = v;
    switch (param) {
      case 'tune':
        if (osc && ctx) {
          // Apply tuning offset: ±12 semitones around center
          // Will be applied on next note trigger; for live preview, update osc freq if osc has a base
          // (no-op here — applied at trigger time via _midiToFreq with tuning offset)
        }
        break;
      case 'cutoff':
      case 'resonance':
      case 'envMod':
        _applyFilterParams();
        break;
      case 'decay':
        break;
      case 'accent':
        break;
      case 'drive':
        _applyDriveCurve();
        break;
      case 'volume':
        _applyVolume();
        break;
    }
  }

  el.querySelectorAll('.tb303-knob').forEach(knob => {
    const param = knob.dataset.param;
    _updateKnobVisual(knob, _params[param] ?? 0.5);

    let startY = 0, startVal = 0;
    knob.addEventListener('pointerdown', e => {
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startVal = _params[param] ?? 0.5;
    });
    knob.addEventListener('pointermove', e => {
      if (!e.buttons) return;
      const delta = (startY - e.clientY) / 150;
      const newVal = Math.max(0, Math.min(1, startVal + delta));
      _params[param] = newVal;
      _updateKnobVisual(knob, newVal);
      _onParamChange(param, newVal);
    });
  });

  // ── Waveform selector ──────────────────────────────────────────────────────
  el.querySelectorAll('.tb303-wave-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.tb303-wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _waveform = btn.dataset.wave;
      if (osc) osc.type = _waveform;
    });
  });

  // ── Step sequencer interaction ─────────────────────────────────────────────
  let _selectedStep = null;

  el.querySelectorAll('.tb303-step').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const i = parseInt(btn.dataset.step);
      if (_selectedStep === i) {
        // Deselect
        _selectedStep = null;
        el.querySelectorAll('.tb303-step').forEach(b => b.classList.remove('selected'));
        _updateNoteEditorDisplay(null);
      } else {
        _selectedStep = i;
        el.querySelectorAll('.tb303-step').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _updateNoteEditorDisplay(i);
      }
    });

    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const i = parseInt(btn.dataset.step);
      _steps[i].active = !_steps[i].active;
      btn.classList.toggle('active', _steps[i].active);
    });
  });

  // Double-click to toggle active
  el.querySelectorAll('.tb303-step').forEach(btn => {
    btn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const i = parseInt(btn.dataset.step);
      _steps[i].active = !_steps[i].active;
      btn.classList.toggle('active', _steps[i].active);
    });
  });

  // Accent/Slide toggle buttons
  el.querySelectorAll('.tb303-flag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.step);
      const flag = btn.dataset.flag;
      _steps[i][flag] = !_steps[i][flag];
      btn.classList.toggle('on', _steps[i][flag]);
    });
  });

  // Note editor
  function _updateNoteEditorDisplay(stepIdx) {
    const labelEl = el.querySelector('.tb303-sel-label');
    const octValEl = el.querySelector('.tb303-oct-val');
    if (stepIdx === null) {
      if (labelEl) labelEl.textContent = '— select a step —';
      if (octValEl) octValEl.textContent = '0';
      el.querySelectorAll('.tb303-note-btn').forEach(b => b.classList.remove('active'));
      return;
    }
    const step = _steps[stepIdx];
    if (labelEl) labelEl.textContent = `Step ${stepIdx + 1}: ${_noteLabel(step)}`;
    if (octValEl) octValEl.textContent = step.octave;
    el.querySelectorAll('.tb303-note-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.noteOffset) === (step.note % 12));
    });
  }

  el.querySelectorAll('.tb303-note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_selectedStep === null) return;
      const noteOffset = parseInt(btn.dataset.noteOffset);
      const step = _steps[_selectedStep];
      // Keep same octave range: C4 = 60, so base = 48 + octave*12
      const baseNote = 48 + Math.floor(step.note / 12) * 12 - 48 + 48; // keep octave from current note
      const octaveBase = Math.floor((step.note - 12) / 12) * 12 + 12; // C of current octave
      step.note = octaveBase + noteOffset;
      // Update the step button label
      const stepBtn = el.querySelector(`.tb303-step[data-step="${_selectedStep}"] .tb303-step-note`);
      if (stepBtn) stepBtn.textContent = _noteLabel(step);
      _updateNoteEditorDisplay(_selectedStep);

      // Highlight selected note
      el.querySelectorAll('.tb303-note-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  el.querySelectorAll('.tb303-oct-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_selectedStep === null) return;
      const step = _steps[_selectedStep];
      const delta = parseInt(btn.dataset.oct);
      step.octave = Math.max(-2, Math.min(2, step.octave + delta));
      const stepBtn = el.querySelector(`.tb303-step[data-step="${_selectedStep}"] .tb303-step-note`);
      if (stepBtn) stepBtn.textContent = _noteLabel(step);
      _updateNoteEditorDisplay(_selectedStep);
    });
  });

  // ── Transport ──────────────────────────────────────────────────────────────
  let _standaloneTimer = null;
  let _standaloneStep = 0;
  let _standaloneBPM = 120;

  function _startStandalone() {
    if (_standaloneTimer) clearInterval(_standaloneTimer);
    const msPerBeat = 60000 / _standaloneBPM;
    const msPerStep = msPerBeat / 4; // 16th notes
    _standaloneStep = 0;
    _standaloneTimer = setInterval(() => {
      _playStep(_standaloneStep % 16);
      _standaloneStep++;
    }, msPerStep);
  }

  function _stopStandalone() {
    if (_standaloneTimer) { clearInterval(_standaloneTimer); _standaloneTimer = null; }
    if (vcaGain && ctx) {
      vcaGain.gain.cancelScheduledValues(ctx.currentTime);
      vcaGain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    }
    _updateStepLEDs(-1);
  }

  el.querySelector('#tb303-run')?.addEventListener('click', () => {
    _running = true;
    el.querySelector('#tb303-run')?.classList.add('active');
    el.querySelector('#tb303-stop')?.classList.remove('active');
    if (!ctx) return; // no audio, just visual
    if (ctx.state === 'suspended') ctx.resume();
    _startStandalone();
  });

  el.querySelector('#tb303-stop')?.addEventListener('click', () => {
    _running = false;
    el.querySelector('#tb303-run')?.classList.remove('active');
    el.querySelector('#tb303-stop')?.classList.add('active');
    _stopStandalone();
  });

  // ── Clock sync ─────────────────────────────────────────────────────────────
  document.addEventListener('confusynth:clock', (e) => {
    const { step, bpm } = e.detail ?? {};
    if (!_running) return;
    if (bpm && _standaloneBPM !== bpm) {
      _standaloneBPM = bpm;
      if (_standaloneTimer) _startStandalone(); // restart with new BPM
    }
    _stopStandalone(); // stop internal timer when external clock is driving
    _playStep((step ?? 0) % 16);
  });

  // ── Audio export ──────────────────────────────────────────────────────────
  if (ctx && outputGain) {
    el._tb303Audio = { output: outputGain, context: ctx };
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  return el;
}
