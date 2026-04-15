// acid_machine.js — Acid Machine Synthesizer module

export function createAcidMachine(audioContext) {
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
  let _slideActive = false;   // true when the previous step had slide=true
  let _waveform = 'sawtooth';
  let _currentScale = 'CHROMATIC';
  let _syncBPM = null; // last received BPM from clock
  let _vuTimeout = null;

  // ── Scale definitions (semitone offsets from root) ─────────────────────────
  const SCALES = {
    CHROMATIC:   [0,1,2,3,4,5,6,7,8,9,10,11],
    MAJOR:       [0,2,4,5,7,9,11],
    MINOR:       [0,2,3,5,7,8,10],
    PHRYGIAN:    [0,1,3,5,7,8,10],
    DORIAN:      [0,2,3,5,7,9,10],
    PENTATONIC:  [0,2,4,7,9],
    BLUES:       [0,3,5,6,7,10],
  };

  // ── Preset patterns ────────────────────────────────────────────────────────
  const PRESETS = {
    'Classic Acid': () => {
      _steps.forEach((s,i) => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      [0,2,4,7,8,10,12,14].forEach(i => { _steps[i].active=true; });
      _steps[0].note=48; _steps[2].note=48; _steps[4].note=55; _steps[7].note=60;
      _steps[8].note=48; _steps[8].slide=true; _steps[10].note=51; _steps[12].note=55;
      _steps[14].note=53; _steps[14].accent=true;
    },
    'Funk Acid': () => {
      _steps.forEach(s => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      [1,3,5,7,9,11,13,15].forEach(i => { _steps[i].active=true; });
      const funk = [48,51,48,55,48,53,48,56];
      [1,3,5,7,9,11,13,15].forEach((si,n) => { _steps[si].note=funk[n]; });
      _steps[7].accent=true; _steps[7].slide=true; _steps[15].accent=true;
    },
    'Techno Acid': () => {
      _steps.forEach(s => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].forEach(i => { _steps[i].active=true; });
      const notes=[48,48,51,48,55,48,53,51,48,48,51,55,58,55,53,51];
      _steps.forEach((s,i) => { s.note=notes[i]; });
      _steps[3].accent=true; _steps[7].accent=true; _steps[11].accent=true; _steps[15].accent=true;
      _steps[3].slide=true; _steps[11].slide=true;
    },
    'Minimal': () => {
      _steps.forEach(s => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      [0,4,8,12].forEach(i => { _steps[i].active=true; _steps[i].note=48; });
      _steps[8].accent=true;
    },
    'Arpeggio Up': () => {
      _steps.forEach(s => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      const arp=[48,51,55,58,60,63,67,70,72,70,67,63,60,58,55,51];
      _steps.forEach((s,i) => { s.active=true; s.note=arp[i]; });
    },
    'Arpeggio Down': () => {
      _steps.forEach(s => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      const arp=[72,70,67,63,60,58,55,51,48,51,55,58,60,63,67,70];
      _steps.forEach((s,i) => { s.active=true; s.note=arp[i]; });
    },
    'Pentatonic Run': () => {
      _steps.forEach(s => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      const pent=[48,50,52,55,57,60,62,64,67,69,67,64,62,60,57,55];
      _steps.forEach((s,i) => { s.active=true; s.note=pent[i]; });
      _steps[7].accent=true; _steps[7].slide=true;
    },
    'Random Acid': () => {
      _steps.forEach(s => { s.active=false; s.accent=false; s.slide=false; s.octave=0; });
      // Seeded pseudo-random
      let seed=42;
      const rand=()=>{ seed=(seed*1664525+1013904223)&0xffffffff; return (seed>>>0)/0xffffffff; };
      const rootNotes=[48,50,51,53,55,56,58,60];
      _steps.forEach((s,i) => {
        s.active = rand()>0.3;
        s.note = rootNotes[Math.floor(rand()*rootNotes.length)];
        s.accent = rand()>0.75;
        s.slide = rand()>0.7;
      });
    },
  };

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
    // Apply global tune offset: ±12 semitones around center
    const tuneOffset = Math.round((_params.tune - 0.5) * 24);
    return step.note + step.octave * 12 + tuneOffset;
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

  function _triggerVU() {
    const vuBar = el.querySelector('.acid-machine-vu-bar');
    if (!vuBar) return;
    vuBar.classList.add('active');
    if (_vuTimeout) clearTimeout(_vuTimeout);
    _vuTimeout = setTimeout(() => vuBar.classList.remove('active'), 120);
  }

  function _playStep(stepIdx) {
    if (!ctx) return;
    const step = _steps[stepIdx];
    const now = ctx.currentTime;

    // Update step LED
    _updateStepLEDs(stepIdx);

    if (!step.active) {
      // Gate off — keep slide state for next step
      vcaGain.gain.cancelScheduledValues(now);
      vcaGain.gain.setTargetAtTime(0, now, 0.01);
      _slideActive = false;
      return;
    }

    const midi = _midiFromStep(step);
    const freq = _midiToFreq(Math.max(24, Math.min(96, midi)));
    const cutHz = _getCutoffHz();
    const decayTime = _getDecayTime();
    const isAccent = step.accent;
    const isSlide = step.slide;
    const SLIDE_TIME = 0.06; // 60ms — real 303 lag processor feel

    // Improved slide: exponential ramp (lag processor behaviour)
    if (_slideActive && _prevFreq > 0 && _prevFreq !== freq) {
      // Gliding INTO this step from a previous slide
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(_prevFreq, now);
      const safeTarget = Math.max(20, freq);
      osc.frequency.exponentialRampToValueAtTime(safeTarget, now + SLIDE_TIME);
    } else if (isSlide && _prevFreq > 0 && _prevFreq !== freq) {
      // This step has slide — start gliding toward this note's freq
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(_prevFreq, now);
      const safeTarget = Math.max(20, freq);
      osc.frequency.exponentialRampToValueAtTime(safeTarget, now + SLIDE_TIME);
    } else {
      // No slide — snap immediately
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(freq, now);
    }

    _prevFreq = freq;
    _slideActive = isSlide; // carry slide state to next step

    // VCA gate envelope
    const accentBoost = isAccent ? 1.4 : 1.0;
    const accentLevel = _params.accent;
    const vcaPeak = isAccent
      ? Math.min(1.2, 0.7 * accentBoost * (0.5 + accentLevel * 0.5))
      : 0.7;

    vcaGain.gain.cancelScheduledValues(now);
    vcaGain.gain.setValueAtTime(0, now);
    vcaGain.gain.linearRampToValueAtTime(vcaPeak, now + 0.001); // 1ms attack
    vcaGain.gain.setTargetAtTime(0, now + 0.08, 0.05);

    // Gate the oscillator through oscGain
    oscGain.gain.cancelScheduledValues(now);
    oscGain.gain.setValueAtTime(0.8, now);

    // Filter envelope (AHD)
    const envAttack = isAccent ? 0.0005 : 0.004;
    const envDecay = isAccent ? decayTime * 0.5 : decayTime;
    const envPeak = cutHz * (1 + _params.envMod * 3);
    const envPeakClamped = Math.min(envPeak, 14000);

    [filterF1, filterF2, filterF3].forEach(f => {
      f.frequency.cancelScheduledValues(now);
      f.frequency.setValueAtTime(cutHz, now);
      f.frequency.linearRampToValueAtTime(envPeakClamped, now + envAttack);
      f.frequency.setTargetAtTime(cutHz, now + envAttack, envDecay * 0.3);
    });

    // VU meter pulse
    _triggerVU();
  }

  function _updateStepLEDs(activeIdx) {
    el.querySelectorAll('.acid-machine-step').forEach((btn, i) => {
      btn.classList.toggle('playing', i === activeIdx);
    });
    // Update TEMPO SYNC BPM display
    const syncEl = el.querySelector('.acid-machine-tempo-sync-val');
    if (syncEl && _syncBPM) syncEl.textContent = `${Math.round(_syncBPM)} BPM`;
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'acid-machine-chassis';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function _noteLabel(step) {
    return NOTE_NAMES[step.note % 12] + (Math.floor(step.note / 12) - 1 + step.octave);
  }

  function _buildStepButtons() {
    return Array.from({ length: 16 }, (_, i) => {
      const s = _steps[i];
      return `
        <div class="acid-machine-step-wrap" data-step="${i}">
          <div class="acid-machine-step-led"></div>
          <button class="acid-machine-step ${s.active ? 'active' : ''}" data-step="${i}" title="Left-click: select  Right-click: open note picker  Dbl-click: toggle active">
            <span class="acid-machine-step-num">${i + 1}</span>
            <span class="acid-machine-step-note">${_noteLabel(s)}</span>
          </button>
          <div class="acid-machine-step-flags">
            <button class="acid-machine-flag-btn acid-machine-acc-btn ${s.accent ? 'on' : ''}" data-step="${i}" data-flag="accent" title="Accent">A</button>
            <button class="acid-machine-flag-btn acid-machine-slide-btn ${s.slide ? 'on' : ''}" data-step="${i}" data-flag="slide" title="Slide">S</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // SVG waveform previews
  const SVG_SAW = `<svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg">
    <polyline points="0,18 20,2 20,18 40,2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`;
  const SVG_SQR = `<svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg">
    <polyline points="0,18 0,2 20,2 20,18 40,18 40,2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`;

  el.innerHTML = `
    <div class="acid-machine-ports-bar">
      <span class="port" data-port="clock-in">CLK IN</span>
      <span class="acid-machine-brand">ACID MACHINE</span>
      <div class="acid-machine-tempo-sync">
        <span class="acid-machine-tempo-sync-label">SYNC</span>
        <span class="acid-machine-tempo-sync-val">-- BPM</span>
      </div>
      <span class="port" data-port="audio-out">AUDIO OUT</span>
    </div>

    <div class="acid-machine-body">

      <!-- Top knob row -->
      <div class="acid-machine-knob-row acid-machine-top-knobs">
        <div class="acid-machine-knob-wrap">
          <span class="acid-machine-knob-label">TUNING</span>
          <div class="acid-machine-knob" data-param="tune" tabindex="0"></div>
          <span class="acid-machine-knob-val" data-param-val="tune">0</span>
        </div>
        <div class="acid-machine-knob-wrap">
          <span class="acid-machine-knob-label">CUTOFF</span>
          <div class="acid-machine-knob" data-param="cutoff" tabindex="0"></div>
          <span class="acid-machine-knob-val" data-param-val="cutoff">1k</span>
        </div>
        <div class="acid-machine-knob-wrap">
          <span class="acid-machine-knob-label">RESONANCE</span>
          <div class="acid-machine-knob" data-param="resonance" tabindex="0"></div>
          <span class="acid-machine-knob-val" data-param-val="resonance">55%</span>
        </div>
        <div class="acid-machine-knob-wrap">
          <span class="acid-machine-knob-label">ENV MOD</span>
          <div class="acid-machine-knob" data-param="envMod" tabindex="0"></div>
          <span class="acid-machine-knob-val" data-param-val="envMod">60%</span>
        </div>
        <div class="acid-machine-knob-wrap">
          <span class="acid-machine-knob-label">DECAY</span>
          <div class="acid-machine-knob" data-param="decay" tabindex="0"></div>
          <span class="acid-machine-knob-val" data-param-val="decay">840ms</span>
        </div>
        <div class="acid-machine-knob-wrap">
          <span class="acid-machine-knob-label">ACCENT</span>
          <div class="acid-machine-knob" data-param="accent" tabindex="0"></div>
          <span class="acid-machine-knob-val" data-param-val="accent">60%</span>
        </div>
      </div>

      <!-- Middle controls -->
      <div class="acid-machine-middle">
        <div class="acid-machine-wave-group">
          <span class="acid-machine-section-label">WAVE</span>
          <div class="acid-machine-wave-btns">
            <button class="acid-machine-wave-btn active" data-wave="sawtooth">
              <span class="acid-machine-wave-icon acid-machine-wave-icon--saw">${SVG_SAW}</span>
              SAW
            </button>
            <button class="acid-machine-wave-btn" data-wave="square">
              <span class="acid-machine-wave-icon acid-machine-wave-icon--sqr">${SVG_SQR}</span>
              SQR
            </button>
          </div>
        </div>

        <div class="acid-machine-small-knobs">
          <div class="acid-machine-knob-wrap">
            <span class="acid-machine-knob-label">DRIVE</span>
            <div class="acid-machine-knob acid-machine-knob--sm" data-param="drive" tabindex="0"></div>
            <span class="acid-machine-knob-val" data-param-val="drive">10</span>
          </div>
          <div class="acid-machine-knob-wrap">
            <span class="acid-machine-knob-label">VOLUME</span>
            <div class="acid-machine-knob acid-machine-knob--sm" data-param="volume" tabindex="0"></div>
            <span class="acid-machine-knob-val" data-param-val="volume">75%</span>
          </div>
          <div class="acid-machine-vu-wrap">
            <span class="acid-machine-knob-label">VU</span>
            <div class="acid-machine-vu-bar"></div>
          </div>
        </div>

        <div class="acid-machine-transport">
          <button class="acid-machine-run-btn" id="acid-machine-run">&#9654; RUN</button>
          <button class="acid-machine-stop-btn" id="acid-machine-stop">&#9632; STOP</button>
        </div>
      </div>

      <!-- Pattern controls row: PRESET + SCALE + OCT TRANSPOSE -->
      <div class="acid-machine-pattern-controls">
        <div class="acid-machine-ctrl-group">
          <span class="acid-machine-section-label">PRESET</span>
          <select class="acid-machine-preset-select">
            ${Object.keys(PRESETS).map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
          <button class="acid-machine-load-preset">LOAD</button>
        </div>
        <div class="acid-machine-ctrl-group">
          <span class="acid-machine-section-label">SCALE</span>
          <select class="acid-machine-scale-select">
            ${Object.keys(SCALES).map(n => `<option value="${n}" ${n==='CHROMATIC'?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="acid-machine-ctrl-group">
          <span class="acid-machine-section-label">TRANSPOSE</span>
          <button class="acid-machine-oct-transpose" data-dir="-1">OCT-</button>
          <button class="acid-machine-oct-transpose" data-dir="1">OCT+</button>
        </div>
      </div>

      <!-- Sequencer grid -->
      <div class="acid-machine-seq-section">
        <div class="acid-machine-seq-grid">
          ${_buildStepButtons()}
        </div>

        <!-- Note editor -->
        <div class="acid-machine-note-editor">
          <span class="acid-machine-section-label">STEP NOTE</span>
          <div class="acid-machine-note-picker">
            ${NOTE_NAMES.map((n, i) => `<button class="acid-machine-note-btn ${n.includes('#') ? 'sharp' : ''}" data-note-offset="${i}">${n}</button>`).join('')}
          </div>
          <div class="acid-machine-octave-picker">
            <span class="acid-machine-section-label">OCT</span>
            <button class="acid-machine-oct-btn" data-oct="-1">&#8722;</button>
            <span class="acid-machine-oct-val">0</span>
            <button class="acid-machine-oct-btn" data-oct="1">+</button>
          </div>
          <span class="acid-machine-sel-label">&#8212; select a step &#8212;</span>
        </div>
      </div>

    </div>

    <!-- Note picker popup (right-click on step) -->
    <div class="acid-machine-notepicker-popup" style="display:none">
      <div class="acid-machine-notepicker-title">PICK NOTE</div>
      <div class="acid-machine-notepicker-piano"></div>
    </div>

    <style>
      .acid-machine-tempo-sync {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-left: auto;
        margin-right: 8px;
      }
      .acid-machine-tempo-sync-label {
        font-size: 8px;
        color: #4f4;
        letter-spacing: 0.1em;
      }
      .acid-machine-tempo-sync-val {
        font-size: 9px;
        color: #4f4;
        font-family: monospace;
        letter-spacing: 0.05em;
      }

      .acid-machine-vu-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .acid-machine-vu-bar {
        width: 8px;
        height: 36px;
        background: #1a1a10;
        border: 1px solid #444;
        border-radius: 2px;
        position: relative;
        overflow: hidden;
        transition: box-shadow 0.05s;
      }
      .acid-machine-vu-bar::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 0%;
        background: linear-gradient(0deg, #f60 0%, #ff0 60%, #0f0 100%);
        transition: height 0.04s ease-out;
        border-radius: 1px;
      }
      .acid-machine-vu-bar.active::after {
        height: 100%;
      }
      .acid-machine-vu-bar.active {
        box-shadow: 0 0 6px rgba(255,120,0,0.6);
      }

      .acid-machine-pattern-controls {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 16px;
        padding: 4px 8px 4px 12px;
        background: rgba(0,0,0,0.2);
        border-top: 1px solid rgba(255,255,255,0.05);
        border-bottom: 1px solid rgba(255,255,255,0.05);
        flex-wrap: wrap;
      }
      .acid-machine-ctrl-group {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
      }
      .acid-machine-preset-select,
      .acid-machine-scale-select {
        font-family: monospace;
        font-size: 10px;
        background: #1a1a10;
        color: #e8c060;
        border: 1px solid #555;
        border-radius: 3px;
        padding: 2px 4px;
        cursor: pointer;
        letter-spacing: 0.04em;
      }
      .acid-machine-load-preset {
        font-family: monospace;
        font-size: 9px;
        background: #333;
        color: #e8c060;
        border: 1px solid #555;
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
        letter-spacing: 0.06em;
        transition: background 0.1s;
      }
      .acid-machine-load-preset:hover { background: #555; }
      .acid-machine-oct-transpose {
        font-family: monospace;
        font-size: 9px;
        background: #2a2a18;
        color: #e8c060;
        border: 1px solid #555;
        border-radius: 3px;
        padding: 2px 7px;
        cursor: pointer;
        letter-spacing: 0.05em;
        transition: background 0.1s;
      }
      .acid-machine-oct-transpose:hover { background: #444; }

      /* Wave buttons with SVG preview */
      .acid-machine-wave-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }
      .acid-machine-wave-icon {
        display: block;
        width: 40px;
        height: 20px;
        color: #888;
        transition: color 0.1s;
      }
      .acid-machine-wave-btn.active .acid-machine-wave-icon { color: #e8c060; }

      /* More distinct Accent and Slide flags */
      .acid-machine-acc-btn {
        background: #2a1400;
        color: #a04000;
        border-color: #a04000;
      }
      .acid-machine-acc-btn.on {
        background: #ff6000;
        color: #fff;
        border-color: #ff8020;
        box-shadow: 0 0 5px rgba(255,96,0,0.7);
        font-weight: bold;
      }
      .acid-machine-slide-btn {
        background: #001425;
        color: #004488;
        border-color: #004488;
      }
      .acid-machine-slide-btn.on {
        background: #0088ff;
        color: #fff;
        border-color: #44aaff;
        box-shadow: 0 0 5px rgba(0,136,255,0.7);
        font-weight: bold;
      }

      /* Note picker popup */
      .acid-machine-notepicker-popup {
        position: fixed;
        z-index: 9999;
        background: #1a1a10;
        border: 1px solid #666;
        border-radius: 5px;
        padding: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.8);
        min-width: 130px;
      }
      .acid-machine-notepicker-title {
        font-family: monospace;
        font-size: 9px;
        color: #e8c060;
        letter-spacing: 0.1em;
        margin-bottom: 5px;
        text-align: center;
      }
      .acid-machine-notepicker-piano {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 2px;
      }
      .acid-machine-pp-key {
        font-family: monospace;
        font-size: 7px;
        padding: 3px 1px;
        border-radius: 2px;
        cursor: pointer;
        text-align: center;
        border: 1px solid #444;
        transition: background 0.08s;
        white-space: nowrap;
        overflow: hidden;
      }
      .acid-machine-pp-key.natural {
        background: #e8e0c0;
        color: #222;
      }
      .acid-machine-pp-key.natural:hover { background: #fff; }
      .acid-machine-pp-key.sharp {
        background: #222;
        color: #888;
        border-color: #333;
      }
      .acid-machine-pp-key.sharp:hover { background: #444; color: #fff; }
      .acid-machine-pp-key.out-of-scale {
        opacity: 0.28;
        cursor: not-allowed;
      }
      .acid-machine-pp-key.out-of-scale:hover { background: inherit; }
    </style>
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
        break; // applied at trigger time
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

  el.querySelectorAll('.acid-machine-knob').forEach(knob => {
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
  el.querySelectorAll('.acid-machine-wave-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.acid-machine-wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _waveform = btn.dataset.wave;
      if (osc) osc.type = _waveform;
    });
  });

  // ── Scale selector ─────────────────────────────────────────────────────────
  el.querySelector('.acid-machine-scale-select')?.addEventListener('change', e => {
    _currentScale = e.target.value;
  });

  // ── Preset controls ────────────────────────────────────────────────────────
  el.querySelector('.acid-machine-load-preset')?.addEventListener('click', () => {
    const name = el.querySelector('.acid-machine-preset-select')?.value;
    if (name && PRESETS[name]) {
      PRESETS[name]();
      _rebuildStepButtons();
    }
  });

  // ── Transpose controls ─────────────────────────────────────────────────────
  el.querySelectorAll('.acid-machine-oct-transpose').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = parseInt(btn.dataset.dir);
      _steps.forEach(s => {
        if (!s.active) return;
        const midi = s.note + s.octave * 12;
        const shifted = Math.max(24, Math.min(96, midi + dir * 12));
        // Redistribute back: keep octave offset at 0, encode in note
        s.note = shifted;
        s.octave = 0;
      });
      _rebuildStepButtons();
    });
  });

  function _rebuildStepButtons() {
    const grid = el.querySelector('.acid-machine-seq-grid');
    if (!grid) return;
    grid.innerHTML = _buildStepButtons();
    // Re-attach events
    _attachStepEvents();
    if (_selectedStep !== null) _updateNoteEditorDisplay(_selectedStep);
  }

  // ── Step sequencer interaction ─────────────────────────────────────────────
  let _selectedStep = null;

  // Note picker popup
  const _popup = el.querySelector('.acid-machine-notepicker-popup');
  let _popupStep = null;

  function _showNotePicker(stepIdx, x, y) {
    _popupStep = stepIdx;
    const piano = _popup.querySelector('.acid-machine-notepicker-piano');
    const scaleIntervals = SCALES[_currentScale];
    piano.innerHTML = NOTE_NAMES.map((n, i) => {
      const inScale = scaleIntervals.includes(i);
      const isSharp = n.includes('#');
      return `<button class="acid-machine-pp-key ${isSharp?'sharp':'natural'} ${inScale?'':'out-of-scale'}" data-note-offset="${i}" title="${n}">${n}</button>`;
    }).join('');

    // Click handler for popup keys
    piano.querySelectorAll('.acid-machine-pp-key:not(.out-of-scale)').forEach(k => {
      k.addEventListener('click', () => {
        const offset = parseInt(k.dataset.noteOffset);
        const step = _steps[_popupStep];
        const octaveBase = Math.floor((step.note - 12) / 12) * 12 + 12;
        step.note = octaveBase + offset;
        const noteEl = el.querySelector(`.acid-machine-step[data-step="${_popupStep}"] .acid-machine-step-note`);
        if (noteEl) noteEl.textContent = _noteLabel(step);
        _popup.style.display = 'none';
        if (_selectedStep === _popupStep) _updateNoteEditorDisplay(_popupStep);
      });
    });

    _popup.style.display = 'block';
    _popup.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
    _popup.style.top  = `${Math.min(y, window.innerHeight - 80)}px`;
  }

  // Dismiss popup on outside click
  document.addEventListener('click', (e) => {
    if (_popup && !_popup.contains(e.target)) {
      _popup.style.display = 'none';
    }
  });

  function _attachStepEvents() {
    el.querySelectorAll('.acid-machine-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const i = parseInt(btn.dataset.step);
        if (_selectedStep === i) {
          _selectedStep = null;
          el.querySelectorAll('.acid-machine-step').forEach(b => b.classList.remove('selected'));
          _updateNoteEditorDisplay(null);
        } else {
          _selectedStep = i;
          el.querySelectorAll('.acid-machine-step').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _updateNoteEditorDisplay(i);
        }
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const i = parseInt(btn.dataset.step);
        _showNotePicker(i, e.clientX, e.clientY);
      });

      btn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        const i = parseInt(btn.dataset.step);
        _steps[i].active = !_steps[i].active;
        btn.classList.toggle('active', _steps[i].active);
      });
    });

    // Accent/Slide toggle buttons
    el.querySelectorAll('.acid-machine-flag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(btn.dataset.step);
        const flag = btn.dataset.flag;
        _steps[i][flag] = !_steps[i][flag];
        btn.classList.toggle('on', _steps[i][flag]);
      });
    });
  }

  _attachStepEvents();

  // Note editor
  function _updateNoteEditorDisplay(stepIdx) {
    const labelEl = el.querySelector('.acid-machine-sel-label');
    const octValEl = el.querySelector('.acid-machine-oct-val');
    if (stepIdx === null) {
      if (labelEl) labelEl.textContent = '— select a step —';
      if (octValEl) octValEl.textContent = '0';
      el.querySelectorAll('.acid-machine-note-btn').forEach(b => b.classList.remove('active'));
      return;
    }
    const step = _steps[stepIdx];
    if (labelEl) labelEl.textContent = `Step ${stepIdx + 1}: ${_noteLabel(step)}`;
    if (octValEl) octValEl.textContent = step.octave;

    const scaleIntervals = SCALES[_currentScale];
    el.querySelectorAll('.acid-machine-note-btn').forEach(b => {
      const noteOff = parseInt(b.dataset.noteOffset);
      const inScale = scaleIntervals.includes(noteOff);
      b.classList.toggle('active', noteOff === (step.note % 12));
      b.classList.toggle('out-of-scale', !inScale);
      b.disabled = !inScale;
    });
  }

  el.querySelectorAll('.acid-machine-note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_selectedStep === null) return;
      const noteOffset = parseInt(btn.dataset.noteOffset);
      const step = _steps[_selectedStep];
      const octaveBase = Math.floor((step.note - 12) / 12) * 12 + 12;
      step.note = octaveBase + noteOffset;
      const stepBtn = el.querySelector(`.acid-machine-step[data-step="${_selectedStep}"] .acid-machine-step-note`);
      if (stepBtn) stepBtn.textContent = _noteLabel(step);
      _updateNoteEditorDisplay(_selectedStep);

      el.querySelectorAll('.acid-machine-note-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  el.querySelectorAll('.acid-machine-oct-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_selectedStep === null) return;
      const step = _steps[_selectedStep];
      const delta = parseInt(btn.dataset.oct);
      step.octave = Math.max(-2, Math.min(2, step.octave + delta));
      const stepBtn = el.querySelector(`.acid-machine-step[data-step="${_selectedStep}"] .acid-machine-step-note`);
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

  el.querySelector('#acid-machine-run')?.addEventListener('click', () => {
    _running = true;
    el.querySelector('#acid-machine-run')?.classList.add('active');
    el.querySelector('#acid-machine-stop')?.classList.remove('active');
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    _startStandalone();
  });

  el.querySelector('#acid-machine-stop')?.addEventListener('click', () => {
    _running = false;
    el.querySelector('#acid-machine-run')?.classList.remove('active');
    el.querySelector('#acid-machine-stop')?.classList.add('active');
    _stopStandalone();
  });

  // ── Clock sync ─────────────────────────────────────────────────────────────
  document.addEventListener('confustudio:clock', (e) => {
    const { step, bpm } = e.detail ?? {};
    if (!_running) return;
    if (bpm) {
      _syncBPM = bpm;
      _standaloneBPM = bpm;
    }
    _stopStandalone(); // stop internal timer when external clock is driving
    _playStep((step ?? 0) % 16);
  });

  // ── Audio export ──────────────────────────────────────────────────────────
  if (ctx && outputGain) {
    el._acidMachineAudio = { output: outputGain, context: ctx };
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  return el;
}
