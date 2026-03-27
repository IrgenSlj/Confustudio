// fm_synth.js — 4-Operator FM Synthesizer (DX7-style), 6-voice polyphonic

export function createFMSynth(audioContext) {
  const ctx = audioContext;

  // ── Algorithms (which ops are carriers vs modulators, and modulation routing) ─
  // Each algorithm defines: carriers[], and mod routing as [modulator, carrier] pairs
  // Operators are 0-indexed (0=Op1, 1=Op2, 2=Op3, 3=Op4)
  const ALGORITHMS = [
    { // 1: Stack — Op4→Op3→Op2→Op1→out
      carriers: [0],
      mods: [[3,2],[2,1],[1,0]],
      label: '4→3→2→1',
    },
    { // 2: Twin — Op3→Op1, Op4→Op2, Op1+Op2→out
      carriers: [0,1],
      mods: [[2,0],[3,1]],
      label: '3→1 4→2',
    },
    { // 3: Branch — Op4→Op1, Op3+Op2→Op1, Op1→out
      carriers: [0],
      mods: [[3,0],[2,0],[1,0]],
      label: '4,3,2→1',
    },
    { // 4: Four carriers — Op1+Op2+Op3+Op4→out (pure additive)
      carriers: [0,1,2,3],
      mods: [],
      label: '1+2+3+4',
    },
    { // 5: Classic — Op4→Op3→Op2, Op4→Op1, Op2+Op1→out
      carriers: [0,1],
      mods: [[3,2],[2,1],[3,0]],
      label: '4→3→2 4→1',
    },
    { // 6: Two stacks — Op4→Op3→out, Op2→Op1→out
      carriers: [2,0],
      mods: [[3,2],[1,0]],
      label: '4→3 2→1',
    },
  ];

  // ── Preset definitions ────────────────────────────────────────────────────
  const PRESETS = {
    'Electric Piano': {
      algo: 1,
      ops: [
        { ratio: 1,  fine: 0,  level: 0.8, a: 0.002, d: 1.2, s: 0.4, r: 0.8, feedback: 0.15 },
        { ratio: 14, fine: 0,  level: 0.5, a: 0.001, d: 0.6, s: 0.0, r: 0.3, feedback: 0 },
        { ratio: 1,  fine: 0,  level: 0.4, a: 0.002, d: 1.0, s: 0.3, r: 0.6, feedback: 0 },
        { ratio: 14, fine: 0,  level: 0.3, a: 0.001, d: 0.5, s: 0.0, r: 0.2, feedback: 0 },
      ],
    },
    'Bell': {
      algo: 1,
      ops: [
        { ratio: 1,  fine: 0,  level: 0.7, a: 0.001, d: 3.5, s: 0.0, r: 2.0, feedback: 0 },
        { ratio: 3,  fine: 0,  level: 0.6, a: 0.001, d: 2.5, s: 0.0, r: 1.5, feedback: 0 },
        { ratio: 5,  fine: 7,  level: 0.4, a: 0.001, d: 1.8, s: 0.0, r: 1.0, feedback: 0 },
        { ratio: 7,  fine: 0,  level: 0.3, a: 0.001, d: 1.2, s: 0.0, r: 0.8, feedback: 0 },
      ],
    },
    'Bass': {
      algo: 0,
      ops: [
        { ratio: 1,  fine: 0,  level: 0.9, a: 0.002, d: 0.3, s: 0.2, r: 0.1, feedback: 0.2 },
        { ratio: 2,  fine: 0,  level: 0.8, a: 0.001, d: 0.2, s: 0.0, r: 0.1, feedback: 0 },
        { ratio: 1,  fine: 0,  level: 0.5, a: 0.001, d: 0.15, s: 0.0, r: 0.05, feedback: 0 },
        { ratio: 3,  fine: 0,  level: 0.6, a: 0.001, d: 0.1, s: 0.0, r: 0.05, feedback: 0 },
      ],
    },
    'Organ': {
      algo: 3,
      ops: [
        { ratio: 1,  fine: 0,  level: 0.6, a: 0.005, d: 0.1, s: 1.0, r: 0.05, feedback: 0 },
        { ratio: 2,  fine: 0,  level: 0.5, a: 0.005, d: 0.1, s: 1.0, r: 0.05, feedback: 0 },
        { ratio: 3,  fine: 0,  level: 0.3, a: 0.005, d: 0.1, s: 1.0, r: 0.05, feedback: 0 },
        { ratio: 4,  fine: 0,  level: 0.2, a: 0.005, d: 0.1, s: 1.0, r: 0.05, feedback: 0 },
      ],
    },
    'Strings': {
      algo: 5,
      ops: [
        { ratio: 1,  fine: 5,  level: 0.7, a: 0.6, d: 1.0, s: 0.8, r: 1.2, feedback: 0 },
        { ratio: 1,  fine:-5,  level: 0.6, a: 0.7, d: 1.0, s: 0.7, r: 1.2, feedback: 0 },
        { ratio: 2,  fine: 3,  level: 0.3, a: 0.5, d: 0.8, s: 0.4, r: 1.0, feedback: 0 },
        { ratio: 2,  fine: -3, level: 0.3, a: 0.5, d: 0.8, s: 0.4, r: 1.0, feedback: 0 },
      ],
    },
    'Brass': {
      algo: 4,
      ops: [
        { ratio: 1,  fine: 0,  level: 0.85, a: 0.04, d: 0.4, s: 0.7, r: 0.2, feedback: 0.1 },
        { ratio: 1,  fine: 7,  level: 0.7,  a: 0.05, d: 0.5, s: 0.6, r: 0.2, feedback: 0 },
        { ratio: 2,  fine: 0,  level: 0.45, a: 0.06, d: 0.3, s: 0.3, r: 0.15, feedback: 0 },
        { ratio: 3,  fine:-3,  level: 0.3,  a: 0.07, d: 0.2, s: 0.1, r: 0.1, feedback: 0 },
      ],
    },
    'Marimba': {
      algo: 1,
      ops: [
        { ratio: 1,  fine: 0,  level: 0.85, a: 0.001, d: 0.5, s: 0.0, r: 0.3, feedback: 0 },
        { ratio: 7,  fine: 0,  level: 0.7,  a: 0.001, d: 0.15, s: 0.0, r: 0.1, feedback: 0 },
        { ratio: 4,  fine: 0,  level: 0.4,  a: 0.001, d: 0.25, s: 0.0, r: 0.15, feedback: 0 },
        { ratio: 14, fine: 0,  level: 0.3,  a: 0.001, d: 0.1, s: 0.0, r: 0.05, feedback: 0 },
      ],
    },
    'Flute': {
      algo: 2,
      ops: [
        { ratio: 1,  fine: 0,  level: 0.75, a: 0.15, d: 0.4, s: 0.7, r: 0.4, feedback: 0 },
        { ratio: 1,  fine: 2,  level: 0.2,  a: 0.1,  d: 0.3, s: 0.3, r: 0.3, feedback: 0 },
        { ratio: 2,  fine: 0,  level: 0.15, a: 0.05, d: 0.2, s: 0.0, r: 0.2, feedback: 0 },
        { ratio: 3,  fine: 0,  level: 0.08, a: 0.02, d: 0.15, s: 0.0, r: 0.1, feedback: 0 },
      ],
    },
  };

  // ── Ratio options ──────────────────────────────────────────────────────────
  const RATIOS = [0.5, 1, 2, 3, 4, 7];

  // ── State ──────────────────────────────────────────────────────────────────
  let _algoIdx = 1; // default: Twin
  let _opParams = [
    { ratio: 1, fine: 0, level: 0.8, a: 0.002, d: 0.3, s: 0.7, r: 0.5, feedback: 0.1 },
    { ratio: 2, fine: 0, level: 0.6, a: 0.002, d: 0.3, s: 0.5, r: 0.4, feedback: 0 },
    { ratio: 1, fine: 0, level: 0.5, a: 0.002, d: 0.3, s: 0.4, r: 0.4, feedback: 0 },
    { ratio: 3, fine: 0, level: 0.4, a: 0.002, d: 0.3, s: 0.3, r: 0.3, feedback: 0 },
  ];

  // ── Voice pool ─────────────────────────────────────────────────────────────
  const NUM_VOICES = 6;
  let voices = [];
  let voiceIdx = 0;
  let outputGain;

  function _midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function makeVoice(actx) {
    const ops = [];
    for (let i = 0; i < 4; i++) {
      const osc = actx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;

      const envGain = actx.createGain();
      envGain.gain.value = 0;

      // Feedback chain for Op1 (index 0): use a DelayNode of 1 sample to break cycle
      let fbDelay = null, fbGain = null;
      if (i === 0) {
        fbDelay = actx.createDelay(0.001);
        fbDelay.delayTime.value = 1 / actx.sampleRate;
        fbGain = actx.createGain();
        fbGain.gain.value = 0;
        osc.connect(fbDelay);
        fbDelay.connect(fbGain);
        fbGain.connect(osc.frequency);
      }

      osc.connect(envGain);
      osc.start();

      ops.push({ osc, envGain, fbDelay, fbGain });
    }

    // Carrier sum output
    const carrierSum = actx.createGain();
    carrierSum.gain.value = 0.4;

    return { ops, carrierSum, active: false, note: -1, startTime: 0 };
  }

  function _connectVoiceAlgo(voice, algoIdx) {
    const algo = ALGORITHMS[algoIdx];
    const { ops, carrierSum } = voice;

    // Disconnect all mod connections
    ops.forEach(op => {
      try { op.envGain.disconnect(); } catch(e) {}
    });
    try { carrierSum.disconnect(); } catch(e) {}

    // Re-connect modulations
    algo.mods.forEach(([mod, car]) => {
      // Modulator's env output → carrier's frequency AudioParam
      ops[mod].envGain.connect(ops[car].osc.frequency);
    });

    // Connect carriers to sum
    algo.carriers.forEach(ci => {
      ops[ci].envGain.connect(carrierSum);
    });
  }

  if (ctx) {
    outputGain = ctx.createGain();
    outputGain.gain.value = 0.7;
    outputGain.connect(ctx.destination);

    voices = Array.from({ length: NUM_VOICES }, () => {
      const v = makeVoice(ctx);
      _connectVoiceAlgo(v, _algoIdx);
      v.carrierSum.connect(outputGain);
      return v;
    });
  }

  function _applyVoiceOpParams(voice, opIdx) {
    if (!ctx) return;
    const p = _opParams[opIdx];
    const op = voice.ops[opIdx];
    // Detune via fine (cents)
    op.osc.detune.setValueAtTime(p.fine, ctx.currentTime);
    // Feedback
    if (op.fbGain) {
      op.fbGain.gain.setTargetAtTime(p.feedback * 200, ctx.currentTime, 0.01);
    }
  }

  function _triggerVoice(voice, midi, vel) {
    if (!ctx) return;
    const freq = _midiToFreq(midi);
    const t = ctx.currentTime;
    const algo = ALGORITHMS[_algoIdx];
    const velScale = vel / 127;

    // Set frequencies and re-apply algo connections
    _connectVoiceAlgo(voice, _algoIdx);

    voice.ops.forEach((op, i) => {
      const p = _opParams[i];
      const ratio = p.ratio;
      op.osc.frequency.cancelScheduledValues(t);
      op.osc.frequency.setValueAtTime(freq * ratio, t);
      op.osc.detune.setValueAtTime(p.fine, t);

      // Modulator level scales with level param (used as FM depth index)
      const isCarrier = algo.carriers.includes(i);
      const level = isCarrier ? p.level * velScale : p.level * 400 * velScale;

      // ADSR on envGain
      op.envGain.gain.cancelScheduledValues(t);
      op.envGain.gain.setValueAtTime(0, t);
      op.envGain.gain.linearRampToValueAtTime(level, t + Math.max(0.001, p.a));
      op.envGain.gain.linearRampToValueAtTime(
        level * p.s,
        t + Math.max(0.001, p.a) + Math.max(0.01, p.d)
      );

      // Feedback
      if (op.fbGain) {
        op.fbGain.gain.setTargetAtTime(p.feedback * 200, t, 0.005);
      }
    });

    voice.active = true;
    voice.note = midi;
    voice.startTime = t;
  }

  function _releaseVoice(voice) {
    if (!ctx) return;
    const t = ctx.currentTime;
    voice.ops.forEach((op, i) => {
      const p = _opParams[i];
      const cur = op.envGain.gain.value;
      op.envGain.gain.cancelScheduledValues(t);
      op.envGain.gain.setValueAtTime(Math.max(0, cur), t);
      op.envGain.gain.exponentialRampToValueAtTime(
        0.0001,
        t + Math.max(0.02, p.r)
      );
    });
    voice.active = false;
    voice.note = -1;
  }

  function noteOn(midi, vel = 100) {
    if (!ctx) return;
    const v = voices[voiceIdx++ % NUM_VOICES];
    _triggerVoice(v, midi, vel);
    _updateVoiceDots();
  }

  function noteOff(midi) {
    if (!ctx) return;
    voices.filter(v => v.note === midi && v.active).forEach(v => {
      _releaseVoice(v);
    });
    _updateVoiceDots();
  }

  // Global event listeners
  document.addEventListener('confusynth:note:on',  e => noteOn(e.detail.note, e.detail.velocity * 127));
  document.addEventListener('confusynth:note:off', e => noteOff(e.detail.note));
  document.addEventListener('confusynth:clock', e => {
    // FM synth doesn't use clock — placeholder for future arp support
  });

  // ── Apply preset ────────────────────────────────────────────────────────
  function _applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    _algoIdx = p.algo;
    p.ops.forEach((op, i) => {
      Object.assign(_opParams[i], op);
    });
    _syncUI();
    if (ctx) {
      voices.forEach(v => _connectVoiceAlgo(v, _algoIdx));
    }
  }

  // ── DOM ──────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'fm-synth-chassis';

  const OP_COLORS = ['#00c8ff', '#00ff9d', '#ffcc00', '#ff6b6b'];

  function _buildAlgoDiagram(algo) {
    // Tiny SVG diagram of algorithm routing
    const W = 50, H = 28;
    const opW = 8, opH = 7;
    const xPos = [3, 15, 27, 39];
    const yBase = H - opH - 2;
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    // Draw connection lines first
    algo.mods.forEach(([mod, car]) => {
      const mx = xPos[mod] + opW/2;
      const cy = yBase;
      const cx = xPos[car] + opW/2;
      svg += `<line x1="${mx}" y1="${yBase}" x2="${cx}" y2="${yBase - 8}" stroke="#888" stroke-width="0.8"/>`;
    });
    // Draw op boxes
    for (let i = 0; i < 4; i++) {
      const isCarrier = algo.carriers.includes(i);
      const fill = isCarrier ? '#00c8ff' : '#555';
      svg += `<rect x="${xPos[i]}" y="${yBase}" width="${opW}" height="${opH}" rx="1" fill="${fill}" opacity="0.85"/>`;
      svg += `<text x="${xPos[i]+opW/2}" y="${yBase+opH-1}" text-anchor="middle" font-size="5" fill="${isCarrier?'#000':'#aaa'}" font-family="monospace">${i+1}</text>`;
    }
    // Carrier output line
    algo.carriers.forEach(ci => {
      svg += `<line x1="${xPos[ci]+opW/2}" y1="${yBase+opH}" x2="${xPos[ci]+opW/2}" y2="${H-1}" stroke="#00c8ff" stroke-width="1.2"/>`;
    });
    svg += '</svg>';
    return svg;
  }

  function _buildOpStrip(i) {
    const p = _opParams[i];
    const algo = ALGORITHMS[_algoIdx];
    const isCarrier = algo.carriers.includes(i);
    const col = OP_COLORS[i];
    return `
      <div class="fm-op-strip" data-op="${i}" style="--op-color:${col}">
        <div class="fm-op-header">
          <span class="fm-op-num">OP${i+1}</span>
          <span class="fm-op-type ${isCarrier ? 'fm-op-type--carrier' : 'fm-op-type--mod'}">${isCarrier ? 'C' : 'M'}</span>
        </div>
        <div class="fm-op-row fm-op-ratio-row">
          ${RATIOS.map(r => `<button class="fm-ratio-btn ${r === p.ratio ? 'fm-ratio-btn--on' : ''}" data-op="${i}" data-ratio="${r}">${r}×</button>`).join('')}
        </div>
        <div class="fm-op-row fm-op-fine-row">
          <span class="fm-label">FINE</span>
          <input type="range" class="fm-slider fm-fine-slider" data-op="${i}" data-param="fine"
            min="-50" max="50" step="1" value="${p.fine}" orient="horizontal" />
          <span class="fm-fine-val">${p.fine >= 0 ? '+' : ''}${p.fine}</span>
        </div>
        <div class="fm-op-row fm-adsr-row">
          <div class="fm-knob-col">
            <input type="range" class="fm-slider fm-adsr-slider" data-op="${i}" data-param="a"
              min="0.001" max="4" step="0.001" value="${p.a}" orient="vertical" />
            <span class="fm-label">A</span>
          </div>
          <div class="fm-knob-col">
            <input type="range" class="fm-slider fm-adsr-slider" data-op="${i}" data-param="d"
              min="0.01" max="4" step="0.001" value="${p.d}" orient="vertical" />
            <span class="fm-label">D</span>
          </div>
          <div class="fm-knob-col">
            <input type="range" class="fm-slider fm-adsr-slider" data-op="${i}" data-param="s"
              min="0" max="1" step="0.01" value="${p.s}" orient="vertical" />
            <span class="fm-label">S</span>
          </div>
          <div class="fm-knob-col">
            <input type="range" class="fm-slider fm-adsr-slider" data-op="${i}" data-param="r"
              min="0.01" max="6" step="0.001" value="${p.r}" orient="vertical" />
            <span class="fm-label">R</span>
          </div>
        </div>
        <div class="fm-op-row fm-level-row">
          <span class="fm-label">LEVEL</span>
          <input type="range" class="fm-slider fm-level-slider" data-op="${i}" data-param="level"
            min="0" max="1" step="0.01" value="${p.level}" orient="horizontal"
            ${isCarrier ? '' : 'style="opacity:0.55"'} />
          <span class="fm-level-val">${Math.round(p.level * 100)}%</span>
        </div>
        ${i === 0 ? `
        <div class="fm-op-row fm-fb-row">
          <span class="fm-label">FDBK</span>
          <input type="range" class="fm-slider fm-fb-slider" data-op="${i}" data-param="feedback"
            min="0" max="1" step="0.01" value="${p.feedback}" orient="horizontal" />
          <span class="fm-fb-val">${Math.round(p.feedback * 100)}%</span>
        </div>` : ''}
      </div>
    `;
  }

  el.innerHTML = `
    <div class="fm-ports-bar">
      <span class="port" data-port="audio-out">AUDIO OUT</span>
      <span class="port" data-port="midi-in">MIDI IN</span>
      <span class="fm-title">FM SYNTH</span>
    </div>

    <div class="fm-top-row">
      <div class="fm-algo-section">
        <span class="fm-section-label">ALGORITHM</span>
        <div class="fm-algo-btns">
          ${ALGORITHMS.map((a,i) => `
            <button class="fm-algo-btn ${i === _algoIdx ? 'fm-algo-btn--on' : ''}" data-algo="${i}" title="Algorithm ${i+1}: ${a.label}">
              ${_buildAlgoDiagram(a)}
              <span class="fm-algo-num">${i+1}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="fm-preset-section">
        <span class="fm-section-label">PRESET</span>
        <select class="fm-preset-select">
          ${Object.keys(PRESETS).map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
        <button class="fm-load-preset">LOAD</button>
      </div>
    </div>

    <div class="fm-ops-row">
      ${[0,1,2,3].map(_buildOpStrip).join('')}
    </div>

    <div class="fm-lower-bar">
      <div class="fm-voice-dots">
        ${Array.from({length:NUM_VOICES}, (_,i) => `<div class="fm-voice-dot" title="Voice ${i+1}"></div>`).join('')}
        <span class="fm-voice-label">VOICES</span>
      </div>
      <div class="fm-keyboard"></div>
    </div>

    <style>
      .fm-synth-chassis {
        background: #1a1a2e;
        border-radius: 6px 6px 4px 4px;
        width: 980px;
        min-height: 280px;
        box-sizing: border-box;
        font-family: monospace;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(0,200,255,0.08);
        border: 1px solid #0f3460;
        position: relative;
        overflow: hidden;
        color: #ccc;
      }
      .fm-synth-chassis::before,
      .fm-synth-chassis::after {
        content: '';
        position: absolute;
        top: 0;
        width: 16px;
        height: 100%;
        background: #0f3460;
        z-index: 1;
      }
      .fm-synth-chassis::before { left: 0; border-radius: 6px 0 0 4px; }
      .fm-synth-chassis::after  { right: 0; border-radius: 0 6px 4px 0; }

      .fm-ports-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 26px;
        background: #16213e;
        border-bottom: 1px solid #0f3460;
        min-height: 26px;
        position: relative;
        z-index: 2;
      }
      .fm-ports-bar .port {
        font-size: 9px;
        color: #aaa;
        letter-spacing: 0.08em;
        background: #0f3460;
        border: 1px solid #1a5090;
        border-radius: 3px;
        padding: 2px 6px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
      }
      .fm-ports-bar .port:hover { background: #1a5090; }
      .fm-title {
        margin-left: auto;
        margin-right: 18px;
        font-size: 18px;
        font-weight: bold;
        color: #00c8ff;
        letter-spacing: 0.15em;
        font-family: monospace;
        text-shadow: 0 0 10px rgba(0,200,255,0.6);
      }

      .fm-top-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 16px;
        padding: 8px 24px 4px;
        position: relative;
        z-index: 2;
      }

      .fm-section-label {
        font-size: 8px;
        color: #00c8ff;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        display: block;
        margin-bottom: 4px;
      }

      .fm-algo-section {
        display: flex;
        flex-direction: column;
      }

      .fm-algo-btns {
        display: flex;
        flex-direction: row;
        gap: 4px;
      }

      .fm-algo-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 4px;
        background: #16213e;
        border: 1px solid #0f3460;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s;
      }
      .fm-algo-btn:hover { background: #1a2a50; }
      .fm-algo-btn--on {
        background: #0f3460;
        border-color: #00c8ff;
        box-shadow: 0 0 6px rgba(0,200,255,0.4);
      }
      .fm-algo-num {
        font-size: 8px;
        color: #aaa;
        font-family: monospace;
      }
      .fm-algo-btn--on .fm-algo-num { color: #00c8ff; }

      .fm-preset-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-left: auto;
      }
      .fm-preset-select {
        font-family: monospace;
        font-size: 9px;
        background: #16213e;
        color: #00c8ff;
        border: 1px solid #0f3460;
        border-radius: 3px;
        padding: 3px 6px;
        cursor: pointer;
        min-width: 130px;
      }
      .fm-load-preset {
        font-family: monospace;
        font-size: 9px;
        padding: 3px 10px;
        background: #0f3460;
        color: #00c8ff;
        border: 1px solid #1a5090;
        border-radius: 3px;
        cursor: pointer;
        letter-spacing: 0.08em;
        transition: background 0.1s;
      }
      .fm-load-preset:hover { background: #1a5090; }

      .fm-ops-row {
        display: flex;
        flex-direction: row;
        gap: 4px;
        padding: 6px 24px;
        position: relative;
        z-index: 2;
        flex: 1;
      }

      .fm-op-strip {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1px solid var(--op-color, #00c8ff);
        border-radius: 4px;
        padding: 6px;
        flex: 1;
        background: rgba(0,0,0,0.25);
        opacity: 0.92;
        transition: opacity 0.15s;
        min-width: 0;
      }
      .fm-op-strip:hover { opacity: 1; }

      .fm-op-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
        margin-bottom: 2px;
      }
      .fm-op-num {
        font-size: 10px;
        font-weight: bold;
        color: var(--op-color, #00c8ff);
        letter-spacing: 0.05em;
      }
      .fm-op-type {
        font-size: 8px;
        padding: 1px 4px;
        border-radius: 2px;
        font-family: monospace;
        letter-spacing: 0.05em;
      }
      .fm-op-type--carrier {
        background: #00c8ff;
        color: #000;
      }
      .fm-op-type--mod {
        background: #333;
        color: #888;
      }

      .fm-op-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 3px;
        flex-wrap: nowrap;
      }

      .fm-op-ratio-row {
        flex-wrap: wrap;
        gap: 2px;
      }

      .fm-ratio-btn {
        font-family: monospace;
        font-size: 8px;
        padding: 2px 3px;
        background: #16213e;
        color: #888;
        border: 1px solid #0f3460;
        border-radius: 2px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.1s, color 0.1s;
        min-width: 26px;
        text-align: center;
      }
      .fm-ratio-btn:hover { background: #1a2a50; }
      .fm-ratio-btn--on {
        background: var(--op-color, #00c8ff);
        color: #000;
        border-color: var(--op-color, #00c8ff);
      }

      .fm-label {
        font-size: 7px;
        color: #666;
        letter-spacing: 0.05em;
        flex-shrink: 0;
        min-width: 22px;
      }

      .fm-fine-val,
      .fm-level-val,
      .fm-fb-val {
        font-size: 8px;
        color: var(--op-color, #00c8ff);
        font-family: monospace;
        min-width: 26px;
        flex-shrink: 0;
      }

      .fm-slider {
        cursor: pointer;
        accent-color: var(--op-color, #00c8ff);
        flex: 1;
        min-width: 0;
      }

      .fm-fine-slider,
      .fm-level-slider,
      .fm-fb-slider {
        width: 100%;
        height: 14px;
      }

      .fm-adsr-row {
        align-items: flex-end;
        gap: 2px;
        justify-content: center;
      }

      .fm-knob-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        flex: 1;
      }

      .fm-adsr-slider {
        -webkit-appearance: slider-vertical;
        appearance: slider-vertical;
        writing-mode: vertical-lr;
        direction: rtl;
        width: 14px;
        height: 40px;
        background: transparent;
      }

      .fm-lower-bar {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 0 24px;
        z-index: 2;
        position: relative;
      }

      .fm-voice-dots {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        flex-shrink: 0;
      }
      .fm-voice-label {
        font-size: 7px;
        color: #555;
        letter-spacing: 0.06em;
        margin-left: 3px;
      }
      .fm-voice-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #1a2a40;
        border: 1px solid #0f3460;
        transition: background 0.08s, box-shadow 0.08s;
      }
      .fm-voice-dot.active {
        background: #00c8ff;
        border-color: #40dfff;
        box-shadow: 0 0 5px rgba(0,200,255,0.7);
      }

      .fm-keyboard {
        position: relative;
        height: 52px;
        flex: 1;
        display: flex;
        z-index: 2;
        margin-bottom: 6px;
      }
      .fm-key-white {
        flex: 1;
        background: linear-gradient(180deg, #f0f0ee 0%, #e0e0dc 100%);
        border: 1px solid #999;
        border-top: none;
        border-radius: 0 0 3px 3px;
        cursor: pointer;
        position: relative;
        transition: background 0.06s;
        min-width: 0;
      }
      .fm-key-label {
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 6px;
        color: #888;
        font-family: monospace;
        pointer-events: none;
      }
      .fm-key-white:active, .fm-key-white.pressed {
        background: linear-gradient(180deg, #c8d8e8 0%, #a8b8cc 100%);
      }
      .fm-key-black {
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
      .fm-key-black:active, .fm-key-black.pressed {
        background: linear-gradient(180deg, #2a2a2a 0%, #444 100%);
      }
    </style>
  `;

  // ── Voice dots ───────────────────────────────────────────────────────────
  function _updateVoiceDots() {
    const dots = el.querySelectorAll('.fm-voice-dot');
    voices.forEach((v, i) => {
      if (dots[i]) dots[i].classList.toggle('active', v.active);
    });
  }

  // ── Sync UI from state ────────────────────────────────────────────────────
  function _syncUI() {
    // Algorithm buttons
    el.querySelectorAll('.fm-algo-btn').forEach(btn => {
      btn.classList.toggle('fm-algo-btn--on', parseInt(btn.dataset.algo) === _algoIdx);
    });
    // Rebuild op strips with updated carrier/modulator indicators
    const opsRow = el.querySelector('.fm-ops-row');
    if (opsRow) {
      opsRow.innerHTML = [0,1,2,3].map(_buildOpStrip).join('');
      _wireOpInteractions();
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const kbEl = el.querySelector('.fm-keyboard');
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
    k.className = 'fm-key-white';
    k.dataset.midi = midi;
    if (midi % 12 === 0) {
      const lbl = document.createElement('span');
      lbl.className = 'fm-key-label';
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
    k.className = 'fm-key-black';
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

  // ── Wire op strip interactions ────────────────────────────────────────────
  function _wireOpInteractions() {
    // Ratio buttons
    el.querySelectorAll('.fm-ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const opIdx = parseInt(btn.dataset.op);
        const ratio = parseFloat(btn.dataset.ratio);
        _opParams[opIdx].ratio = ratio;
        el.querySelectorAll(`.fm-ratio-btn[data-op="${opIdx}"]`).forEach(b => {
          b.classList.toggle('fm-ratio-btn--on', parseFloat(b.dataset.ratio) === ratio);
        });
      });
    });

    // ADSR + level + fine + feedback sliders
    el.querySelectorAll('.fm-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        const opIdx = parseInt(slider.dataset.op);
        const param = slider.dataset.param;
        const val = parseFloat(slider.value);
        _opParams[opIdx][param] = val;

        // Update display value
        const strip = el.querySelector(`.fm-op-strip[data-op="${opIdx}"]`);
        if (!strip) return;
        if (param === 'fine') {
          const disp = strip.querySelector('.fm-fine-val');
          if (disp) disp.textContent = `${val >= 0 ? '+' : ''}${val}`;
        } else if (param === 'level') {
          const disp = strip.querySelector('.fm-level-val');
          if (disp) disp.textContent = `${Math.round(val * 100)}%`;
        } else if (param === 'feedback') {
          const disp = strip.querySelector('.fm-fb-val');
          if (disp) disp.textContent = `${Math.round(val * 100)}%`;
        }
        if (ctx) {
          voices.forEach(v => _applyVoiceOpParams(v, opIdx));
        }
      });
    });
  }

  _wireOpInteractions();

  // ── Algorithm selector ────────────────────────────────────────────────────
  el.querySelectorAll('.fm-algo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _algoIdx = parseInt(btn.dataset.algo);
      _syncUI();
      if (ctx) {
        voices.forEach(v => _connectVoiceAlgo(v, _algoIdx));
      }
    });
  });

  // ── Preset load ───────────────────────────────────────────────────────────
  el.querySelector('.fm-load-preset')?.addEventListener('click', () => {
    const name = el.querySelector('.fm-preset-select')?.value;
    if (name) _applyPreset(name);
  });

  // ── Audio port export ─────────────────────────────────────────────────────
  if (ctx && outputGain) {
    el._fmSynthAudio = outputGain;
    const outPort = el.querySelector('.port[data-port="audio-out"]');
    if (outPort) outPort._audioNode = outputGain;
  }

  return el;
}
