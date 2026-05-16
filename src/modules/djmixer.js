// djmixer.js — Pioneer-style 2-channel DJ mixer module

export function createDJMixer(audioContext) {
  const el = document.createElement('div');
  el.className = 'djmixer-chassis';
  el.dataset.djm = '1';
  el.innerHTML = `
    <div class="djm-ports-bar">
      <span class="djm-port" data-port="ch1-in"><span class="djm-port-led"></span><span class="djm-port-label">CH1 IN</span></span>
      <span class="djm-title">DJM·900</span>
      <span class="djm-port" data-port="ch2-in"><span class="djm-port-led"></span><span class="djm-port-label">CH2 IN</span></span>
    </div>
    <div class="djm-body">
      <!-- Channel 1 -->
      <div class="djm-channel" data-ch="1">
        <div class="djm-ch-label">CH 1</div>
        <div class="djm-peak-led" data-peak-ch="1" title="Peak indicator CH1"></div>
        <div class="djm-eq-section">
          <div class="djm-knob-row">
            <div class="djm-knob-wrap">
              <div class="djm-knob" data-param="hi" data-ch="1"></div>
              <span class="djm-knob-label">HI</span>
            </div>
            <div class="djm-knob-wrap">
              <div class="djm-knob" data-param="mid" data-ch="1"></div>
              <span class="djm-knob-label">MID</span>
            </div>
            <div class="djm-knob-wrap">
              <div class="djm-knob" data-param="lo" data-ch="1"></div>
              <span class="djm-knob-label">LO</span>
            </div>
          </div>
          <div class="djm-knob-row">
            <div class="djm-knob-wrap">
              <div class="djm-knob djm-knob--gain" data-param="gain" data-ch="1"></div>
              <span class="djm-knob-label">GAIN</span>
            </div>
            <div class="djm-knob-wrap">
              <div class="djm-knob djm-knob--trim" data-param="trim" data-ch="1"></div>
              <span class="djm-knob-label">TRIM</span>
            </div>
          </div>
          <div class="djm-knob-row">
            <div class="djm-knob-wrap" style="width:100%">
              <div class="djm-knob djm-knob--filter" data-param="filter" data-ch="1"></div>
              <span class="djm-knob-label">FILTER</span>
            </div>
            <button class="djm-cue-btn" data-ch="1">CUE</button>
          </div>
        </div>
        <div class="djm-fader-wrap">
          <div class="djm-level-meter" data-ch="1">
            ${Array.from({ length: 12 }, (_, i) => `<span class="djm-seg" data-seg="${i + 1}"></span>`).join('')}
          </div>
          <input type="range" class="djm-fader" data-param="fader" data-ch="1"
            orient="vertical" min="0" max="1" step="0.01" value="1" />
        </div>
      </div>

      <!-- Master section -->
      <div class="djm-master">
        <div class="djm-master-label">MASTER</div>
        <div class="djm-knob-wrap">
          <div class="djm-knob djm-knob--master" data-param="masterGain"></div>
          <span class="djm-knob-label">MASTER</span>
        </div>
        <div class="djm-knob-wrap">
          <div class="djm-knob" data-param="headGain"></div>
          <span class="djm-knob-label">HEAD</span>
        </div>
        <div class="djm-xfader-wrap">
          <span class="djm-xfader-label">A</span>
          <input type="range" class="djm-xfader" min="0" max="1" step="0.01" value="0.5" />
          <span class="djm-xfader-label">B</span>
        </div>
      </div>

      <!-- Channel 2 -->
      <div class="djm-channel" data-ch="2">
        <div class="djm-ch-label">CH 2</div>
        <div class="djm-peak-led" data-peak-ch="2" title="Peak indicator CH2"></div>
        <div class="djm-eq-section">
          <div class="djm-knob-row">
            <div class="djm-knob-wrap">
              <div class="djm-knob" data-param="hi" data-ch="2"></div>
              <span class="djm-knob-label">HI</span>
            </div>
            <div class="djm-knob-wrap">
              <div class="djm-knob" data-param="mid" data-ch="2"></div>
              <span class="djm-knob-label">MID</span>
            </div>
            <div class="djm-knob-wrap">
              <div class="djm-knob" data-param="lo" data-ch="2"></div>
              <span class="djm-knob-label">LO</span>
            </div>
          </div>
          <div class="djm-knob-row">
            <div class="djm-knob-wrap">
              <div class="djm-knob djm-knob--gain" data-param="gain" data-ch="2"></div>
              <span class="djm-knob-label">GAIN</span>
            </div>
            <div class="djm-knob-wrap">
              <div class="djm-knob djm-knob--trim" data-param="trim" data-ch="2"></div>
              <span class="djm-knob-label">TRIM</span>
            </div>
          </div>
          <div class="djm-knob-row">
            <div class="djm-knob-wrap" style="width:100%">
              <div class="djm-knob djm-knob--filter" data-param="filter" data-ch="2"></div>
              <span class="djm-knob-label">FILTER</span>
            </div>
            <button class="djm-cue-btn" data-ch="2">CUE</button>
          </div>
        </div>
        <div class="djm-fader-wrap">
          <div class="djm-level-meter" data-ch="2">
            ${Array.from({ length: 12 }, (_, i) => `<span class="djm-seg" data-seg="${i + 1}"></span>`).join('')}
          </div>
          <input type="range" class="djm-fader" data-param="fader" data-ch="2"
            orient="vertical" min="0" max="1" step="0.01" value="1" />
        </div>
      </div>
    </div>
  `;

  // ── Web Audio signal chain (only when audioContext is provided) ──
  let ch1, ch2, masterGain, xfCh1, xfCh2;

  function makeChannel(ctx) {
    const input = ctx.createGain();
    // GAIN TRIM — ±6 dB level-matching gain before EQ (knob centre = 0 dB)
    const trim = ctx.createGain();
    trim.gain.value = 1;
    const hiEQ = ctx.createBiquadFilter();
    hiEQ.type = 'highshelf';
    hiEQ.frequency.value = 10000;
    const midEQ = ctx.createBiquadFilter();
    midEQ.type = 'peaking';
    midEQ.frequency.value = 1000;
    midEQ.Q.value = 1;
    const loEQ = ctx.createBiquadFilter();
    loEQ.type = 'lowshelf';
    loEQ.frequency.value = 200;

    // Filter sweep node: HPF/LPF depending on knob direction
    // Centre = flat (bypass via 0dB shelf), left = LPF darkens, right = HPF brightens
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = ctx.sampleRate / 2; // fully open = flat

    const fader = ctx.createGain();
    const output = ctx.createGain();

    // AnalyserNode for per-channel peak metering
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.1;
    const _peakBuf = new Float32Array(analyser.fftSize);

    input.connect(trim);
    trim.connect(hiEQ);
    hiEQ.connect(midEQ);
    midEQ.connect(loEQ);
    loEQ.connect(filter);
    filter.connect(fader);
    fader.connect(output);
    output.connect(analyser); // tap for metering (doesn't affect signal path)

    // EQ gain range: -18dB to +6dB (knob 0→1 maps to -18→+6)
    function setEQ(node, v) {
      node.gain.setTargetAtTime((v - 0.75) * 24, ctx.currentTime, 0.02);
    }

    // Trim: knob 0→1 maps to -6dB → +6dB
    function setTrim(v) {
      const db = (v - 0.5) * 12; // -6 to +6 dB
      trim.gain.setTargetAtTime(Math.pow(10, db / 20), ctx.currentTime, 0.02);
    }

    // Filter sweep: centre (0.5) = flat/open
    // Left (0→0.5): LPF cutoff sweeps 200Hz → open (dark → neutral)
    // Right (0.5→1): HPF cutoff sweeps 20Hz → 8kHz (neutral → bright)
    function setFilter(v) {
      if (Math.abs(v - 0.5) < 0.02) {
        // Near centre — open/bypass: use a high-frequency lowpass that passes everything
        filter.type = 'lowpass';
        filter.frequency.setTargetAtTime(ctx.sampleRate / 2, ctx.currentTime, 0.02);
      } else if (v < 0.5) {
        // Left: LPF gets darker as knob goes left
        filter.type = 'lowpass';
        const t = v / 0.5; // 0→1 as knob goes left→centre
        const freq = 200 + t * (ctx.sampleRate / 2 - 200);
        filter.frequency.setTargetAtTime(Math.max(20, freq), ctx.currentTime, 0.02);
      } else {
        // Right: HPF gets brighter as knob goes right
        filter.type = 'highpass';
        const t = (v - 0.5) / 0.5; // 0→1 as knob goes centre→right
        const freq = 20 + t * 8000;
        filter.frequency.setTargetAtTime(Math.max(20, freq), ctx.currentTime, 0.02);
      }
    }

    // Peak meter read — returns 0-1 RMS peak
    function getPeak() {
      analyser.getFloatTimeDomainData(_peakBuf);
      let max = 0;
      for (let i = 0; i < _peakBuf.length; i++) {
        const abs = Math.abs(_peakBuf[i]);
        if (abs > max) max = abs;
      }
      return max;
    }

    return { input, trim, hiEQ, midEQ, loEQ, filter, fader, output, analyser, setEQ, setTrim, setFilter, getPeak };
  }

  function setXfader(v) {
    xfCh1.gain.setTargetAtTime(Math.cos((v * Math.PI) / 2), audioContext.currentTime, 0.02);
    xfCh2.gain.setTargetAtTime(Math.sin((v * Math.PI) / 2), audioContext.currentTime, 0.02);
  }

  if (audioContext) {
    const ctx = audioContext;
    ch1 = makeChannel(ctx);
    ch2 = makeChannel(ctx);
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;

    xfCh1 = ctx.createGain();
    xfCh2 = ctx.createGain();
    ch1.output.connect(xfCh1);
    xfCh1.connect(masterGain);
    ch2.output.connect(xfCh2);
    xfCh2.connect(masterGain);
    masterGain.connect(ctx.destination);

    setXfader(0.5); // init centre

    // Expose audio API on the element so cables.js can route to it
    el._djmAudio = {
      ch1Input: ch1.input,
      ch2Input: ch2.input,
      output: masterGain,
      disconnectFromDestination() {
        masterGain.disconnect();
      },
      connectToDestination() {
        masterGain.connect(ctx.destination);
      },
    };

    // ── Peak LED animation loop ──────────────────────────────────────────────
    const peakLed1 = el.querySelector('[data-peak-ch="1"]');
    const peakLed2 = el.querySelector('[data-peak-ch="2"]');
    const portLed1 = el.querySelector('.djm-port[data-port="ch1-in"]');
    const portLed2 = el.querySelector('.djm-port[data-port="ch2-in"]');
    const meter1 = Array.from(el.querySelectorAll('.djm-level-meter[data-ch="1"] .djm-seg'));
    const meter2 = Array.from(el.querySelectorAll('.djm-level-meter[data-ch="2"] .djm-seg'));
    let _peakHold1 = 0,
      _peakHold2 = 0;
    let _peakHoldTimer1 = null,
      _peakHoldTimer2 = null;

    function updateMeter(segments, peak) {
      const litCount = Math.max(0, Math.min(segments.length, Math.ceil(peak * segments.length)));
      segments.forEach((seg, index) => {
        const isLit = index < litCount;
        seg.classList.toggle('lit-g', isLit && index < 8);
        seg.classList.toggle('lit-y', isLit && index >= 8 && index < 10);
        seg.classList.toggle('lit-r', isLit && index >= 10);
      });
    }

    function updatePeakLeds() {
      if (!el.isConnected) return;

      const p1 = ch1.getPeak();
      const p2 = ch2.getPeak();

      // Track peak hold (light stays on 1s after peak)
      if (p1 > 0.85) {
        _peakHold1 = p1;
        clearTimeout(_peakHoldTimer1);
        _peakHoldTimer1 = setTimeout(() => {
          _peakHold1 = 0;
        }, 1000);
      }
      if (p2 > 0.85) {
        _peakHold2 = p2;
        clearTimeout(_peakHoldTimer2);
        _peakHoldTimer2 = setTimeout(() => {
          _peakHold2 = 0;
        }, 1000);
      }

      if (peakLed1) {
        const level = Math.max(p1, _peakHold1);
        peakLed1.style.background = level > 0.85 ? '#f55' : level > 0.6 ? '#fa0' : level > 0.2 ? '#5d5' : '#333';
        peakLed1.style.boxShadow = level > 0.85 ? '0 0 4px #f55' : level > 0.6 ? '0 0 3px #fa0' : 'none';
      }
      if (peakLed2) {
        const level = Math.max(p2, _peakHold2);
        peakLed2.style.background = level > 0.85 ? '#f55' : level > 0.6 ? '#fa0' : level > 0.2 ? '#5d5' : '#333';
        peakLed2.style.boxShadow = level > 0.85 ? '0 0 4px #f55' : level > 0.6 ? '0 0 3px #fa0' : 'none';
      }
      if (portLed1) {
        portLed1.classList.toggle('has-signal', p1 > 0.08);
        portLed1.classList.toggle('is-hot', p1 > 0.85);
      }
      if (portLed2) {
        portLed2.classList.toggle('has-signal', p2 > 0.08);
        portLed2.classList.toggle('is-hot', p2 > 0.85);
      }
      updateMeter(meter1, p1);
      updateMeter(meter2, p2);

      requestAnimationFrame(updatePeakLeds);
    }
    updatePeakLeds();
  }

  // ── Make knobs draggable (visual + audio) ──
  const knobState = {};
  el.querySelectorAll('.djm-knob').forEach((knob) => {
    const param = knob.dataset.param;
    const chNum = knob.dataset.ch;
    const key = `${chNum}-${param}`;
    // Default values: trim and filter default to 0.5 (centre), others to 0.75
    knobState[key] = param === 'trim' || param === 'filter' ? 0.5 : 0.75;
    updateKnobVisual(knob, knobState[key]);

    let startY = 0,
      startVal = 0;
    knob.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startVal = knobState[key] ?? 0.5;
    });
    knob.addEventListener('pointermove', (e) => {
      if (!e.buttons) return;
      const delta = (startY - e.clientY) / 120;
      knobState[key] = Math.max(0, Math.min(1, startVal + delta));
      updateKnobVisual(knob, knobState[key]);

      if (!audioContext) return;
      const v = knobState[key];
      const ch = chNum === '1' ? ch1 : chNum === '2' ? ch2 : null;

      if (ch) {
        if (param === 'hi') ch.setEQ(ch.hiEQ, v);
        if (param === 'mid') ch.setEQ(ch.midEQ, v);
        if (param === 'lo') ch.setEQ(ch.loEQ, v);
        if (param === 'gain') ch.fader.gain.setTargetAtTime(v, audioContext.currentTime, 0.02);
        if (param === 'trim') ch.setTrim(v);
        if (param === 'filter') ch.setFilter(v);
      }
      if (param === 'masterGain' && masterGain) {
        masterGain.gain.setTargetAtTime(v * 1.2, audioContext.currentTime, 0.02);
      }
      if (param === 'headGain' && window._confustudioEngine?.setCueGain) {
        window._confustudioEngine.setCueGain(v * 1.4);
      }
    });
  });

  function updateKnobVisual(knob, v) {
    const angle = -145 + v * 290;
    knob.style.transform = `rotate(${angle}deg)`;
  }

  // ── Fader interaction ──
  el.querySelectorAll('.djm-fader').forEach((fader) => {
    fader.addEventListener('input', () => {
      if (!audioContext) return;
      const v = parseFloat(fader.value);
      const chNum = fader.dataset.ch;
      const ch = chNum === '1' ? ch1 : ch2;
      if (ch) ch.fader.gain.setTargetAtTime(v, audioContext.currentTime, 0.02);
    });
  });

  // ── Crossfader ──
  const xfaderEl = el.querySelector('.djm-xfader');
  if (xfaderEl) {
    xfaderEl.addEventListener('input', () => {
      if (!audioContext) return;
      setXfader(parseFloat(xfaderEl.value));
    });
  }

  // ── Cue buttons ──
  el.querySelectorAll('.djm-cue-btn').forEach((btn) => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  return el;
}
