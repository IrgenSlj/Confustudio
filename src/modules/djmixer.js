// djmixer.js — Pioneer-style 2-channel DJ mixer module

export function createDJMixer(audioContext) {
  const el = document.createElement('div');
  el.className = 'djmixer-chassis';
  el.dataset.djm = '1';
  el.innerHTML = `
    <div class="djm-ports-bar">
      <span class="djm-port" data-port="ch1-in">CH1 IN</span>
      <span class="djm-title">DJM·900</span>
      <span class="djm-port" data-port="ch2-in">CH2 IN</span>
    </div>
    <div class="djm-body">
      <!-- Channel 1 -->
      <div class="djm-channel" data-ch="1">
        <div class="djm-ch-label">CH 1</div>
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
            <button class="djm-cue-btn" data-ch="1">CUE</button>
          </div>
        </div>
        <div class="djm-fader-wrap">
          <div class="djm-level-meter" data-ch="1">
            ${Array.from({length:12}, (_,i) => `<span class="djm-seg" data-seg="${i+1}"></span>`).join('')}
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
            <button class="djm-cue-btn" data-ch="2">CUE</button>
          </div>
        </div>
        <div class="djm-fader-wrap">
          <div class="djm-level-meter" data-ch="2">
            ${Array.from({length:12}, (_,i) => `<span class="djm-seg" data-seg="${i+1}"></span>`).join('')}
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
    const input   = ctx.createGain();
    const hiEQ    = ctx.createBiquadFilter(); hiEQ.type = 'highshelf'; hiEQ.frequency.value = 10000;
    const midEQ   = ctx.createBiquadFilter(); midEQ.type = 'peaking';  midEQ.frequency.value = 1000; midEQ.Q.value = 1;
    const loEQ    = ctx.createBiquadFilter(); loEQ.type  = 'lowshelf';  loEQ.frequency.value = 200;
    const fader   = ctx.createGain();
    const output  = ctx.createGain();
    input.connect(hiEQ); hiEQ.connect(midEQ); midEQ.connect(loEQ); loEQ.connect(fader); fader.connect(output);
    // EQ gain range: -18dB to +6dB (knob 0→1 maps to -18→+6)
    function setEQ(node, v) { node.gain.setTargetAtTime((v - 0.75) * 24, ctx.currentTime, 0.02); }
    return { input, hiEQ, midEQ, loEQ, fader, output, setEQ };
  }

  function setXfader(v) {
    xfCh1.gain.setTargetAtTime(Math.cos(v * Math.PI / 2), audioContext.currentTime, 0.02);
    xfCh2.gain.setTargetAtTime(Math.sin(v * Math.PI / 2), audioContext.currentTime, 0.02);
  }

  if (audioContext) {
    const ctx = audioContext;
    ch1 = makeChannel(ctx);
    ch2 = makeChannel(ctx);
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;

    xfCh1 = ctx.createGain();
    xfCh2 = ctx.createGain();
    ch1.output.connect(xfCh1); xfCh1.connect(masterGain);
    ch2.output.connect(xfCh2); xfCh2.connect(masterGain);
    masterGain.connect(ctx.destination);

    setXfader(0.5); // init centre

    // Expose audio API on the element so cables.js can route to it
    el._djmAudio = {
      ch1Input: ch1.input,
      ch2Input: ch2.input,
      output:   masterGain,
      disconnectFromDestination() { masterGain.disconnect(); },
      connectToDestination()      { masterGain.connect(ctx.destination); },
    };
  }

  // ── Make knobs draggable (visual + audio) ──
  const knobState = {};
  el.querySelectorAll('.djm-knob').forEach(knob => {
    const param = knob.dataset.param;
    const chNum = knob.dataset.ch;
    const key = `${chNum}-${param}`;
    knobState[key] = 0.75; // default center
    updateKnobVisual(knob, knobState[key]);

    let startY = 0, startVal = 0;
    knob.addEventListener('pointerdown', e => {
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startVal = knobState[key] ?? 0.75;
    });
    knob.addEventListener('pointermove', e => {
      if (!e.buttons) return;
      const delta = (startY - e.clientY) / 120;
      knobState[key] = Math.max(0, Math.min(1, startVal + delta));
      updateKnobVisual(knob, knobState[key]);

      if (!audioContext) return;
      const v = knobState[key];
      const ch = chNum === '1' ? ch1 : chNum === '2' ? ch2 : null;

      if (ch) {
        if (param === 'hi')   ch.setEQ(ch.hiEQ,  v);
        if (param === 'mid')  ch.setEQ(ch.midEQ, v);
        if (param === 'lo')   ch.setEQ(ch.loEQ,  v);
        if (param === 'gain') ch.fader.gain.setTargetAtTime(v, audioContext.currentTime, 0.02);
      }
      if (param === 'masterGain' && masterGain) {
        masterGain.gain.setTargetAtTime(v * 1.2, audioContext.currentTime, 0.02);
      }
    });
  });

  function updateKnobVisual(knob, v) {
    const angle = -145 + v * 290;
    knob.style.transform = `rotate(${angle}deg)`;
  }

  // ── Fader interaction ──
  el.querySelectorAll('.djm-fader').forEach(fader => {
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
  el.querySelectorAll('.djm-cue-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  return el;
}
