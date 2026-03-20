// djmixer.js — Pioneer-style 2-channel DJ mixer module

export function createDJMixer(audioContext) {
  const el = document.createElement('div');
  el.className = 'djmixer-chassis';
  el.innerHTML = `
    <div class="djm-ports-bar">
      <span class="djm-port">CH1 IN</span>
      <span class="djm-title">DJM·900</span>
      <span class="djm-port">CH2 IN</span>
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

  // Make knobs draggable (simple rotation visual + value)
  const knobState = {};
  el.querySelectorAll('.djm-knob').forEach(knob => {
    const key = `${knob.dataset.ch}-${knob.dataset.param}`;
    knobState[key] = 0.75; // default center-ish
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
    });
  });

  function updateKnobVisual(knob, v) {
    const angle = -145 + v * 290;
    knob.style.transform = `rotate(${angle}deg)`;
  }

  // Fader interaction
  el.querySelectorAll('.djm-fader').forEach(fader => {
    fader.addEventListener('input', () => {
      // Visual feedback only for now (no connected audio context)
    });
  });

  // Cue buttons
  el.querySelectorAll('.djm-cue-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  return el;
}
