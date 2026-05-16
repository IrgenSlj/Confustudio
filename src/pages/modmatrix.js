// src/pages/modmatrix.js — Mod Matrix: LFO/Env/Macro routing (route-list redesign)

import { saveState } from '../state.js';

// ─── Source & Destination Registries ─────────────────────────────────────────

const MOD_SOURCES = [
  { id: 'lfo1', label: 'LFO 1', type: 'lfo' },
  { id: 'lfo2', label: 'LFO 2', type: 'lfo' },
  { id: 'env1', label: 'Env 1', type: 'env' },
  { id: 'env2', label: 'Env 2', type: 'env' },
  { id: 'velocity', label: 'Velocity', type: 'perf' },
  { id: 'note', label: 'Note Pitch', type: 'perf' },
  { id: 'stepnum', label: 'Step #', type: 'seq' },
  { id: 'random', label: 'Random', type: 'seq' },
  { id: 'macro1', label: 'Macro 1', type: 'macro' },
  { id: 'macro2', label: 'Macro 2', type: 'macro' },
  { id: 'macro3', label: 'Macro 3', type: 'macro' },
  { id: 'macro4', label: 'Macro 4', type: 'macro' },
];

const MOD_DESTINATIONS = [
  { id: 'track_cutoff', label: 'Filter Cutoff', track: true },
  { id: 'track_resonance', label: 'Filter Res', track: true },
  { id: 'track_volume', label: 'Track Volume', track: true },
  { id: 'track_pan', label: 'Track Pan', track: true },
  { id: 'track_pitch', label: 'Track Pitch', track: true },
  { id: 'track_attack', label: 'Env Attack', track: true },
  { id: 'track_decay', label: 'Env Decay', track: true },
  { id: 'master_cutoff', label: 'Master Cutoff', track: false },
  { id: 'master_reverb', label: 'Reverb Mix', track: false },
  { id: 'master_delay', label: 'Delay Mix', track: false },
  { id: 'group_volume', label: 'Group Volume', track: false },
];

const LFO_SHAPES = ['sine', 'tri', 'sq', 'saw'];
const LFO_SHAPE_LABELS = { sine: 'SIN', tri: 'TRI', sq: 'SQ', saw: 'SAW' };
const ENV_TRIGGERS = ['note', 'step', 'free'];
const TRACK_COUNT = 8;

// ─── CSS ─────────────────────────────────────────────────────────────────────

const MM_CSS = `
.mm-sources {
  width: 190px; min-width: 190px; flex-shrink: 0;
  border-right: 1px solid rgba(255,255,255,0.08);
  overflow-y: auto; padding: 8px 6px;
  display: flex; flex-direction: column; gap: 6px;
}
.mm-source-block {
  background: rgba(255,255,255,0.04);
  border-radius: 4px; padding: 5px 7px;
}
.mm-source-header {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.62rem; font-weight: 600; color: rgba(255,255,255,0.6);
  cursor: pointer;
}
.mm-source-type-badge {
  font-size: 0.48rem; padding: 1px 4px; border-radius: 2px;
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4);
  font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
}
.mm-lfo-controls {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  margin-top: 4px;
}
.mm-lfo-rate { width: 44px; font-size: 0.58rem; }
.mm-shape-btn {
  font-size: 0.52rem; padding: 1px 4px; border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5); cursor: pointer;
}
.mm-shape-btn.active { background: rgba(90,221,113,0.2); color: var(--live, #5add71); border-color: var(--live, #5add71); }
.mm-sync-btn {
  font-size: 0.48rem; padding: 1px 5px; border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.4); cursor: pointer;
}
.mm-sync-btn.active { background: rgba(90,221,113,0.18); color: var(--live, #5add71); border-color: var(--live, #5add71); }
.mm-env-sliders {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; margin-top: 4px;
}
.mm-env-slider-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.mm-env-slider-range {
  width: 3px; height: 44px; writing-mode: vertical-lr; direction: rtl; appearance: none;
  -webkit-appearance: none;
  background: rgba(255,255,255,0.15); border-radius: 2px; cursor: ns-resize;
}
.mm-env-slider-range::-webkit-slider-thumb { appearance: none; width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.5); }
.mm-env-lbl { font-size: 0.48rem; color: rgba(255,255,255,0.35); }
.mm-env-trig-row {
  display: flex; gap: 2px; margin-top: 4px;
}
.mm-env-trig-btn {
  font-size: 0.44rem; padding: 1px 4px; border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.4); cursor: pointer;
}
.mm-env-trig-btn.active { background: rgba(246,180,64,0.2); color: #f6b440; border-color: #f6b440; }
.mm-perf-label {
  font-size: 0.58rem; color: rgba(255,255,255,0.45); padding: 3px 0;
}
.mm-macro-bar-wrap {
  margin-top: 4px; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;
}
.mm-macro-bar { height: 100%; border-radius: 2px; }

/* Routes panel */
.mm-routes {
  flex: 1; min-width: 0; overflow-y: auto;
  padding: 8px 10px; display: flex; flex-direction: column; gap: 0;
}
.mm-routes-header {
  display: flex; align-items: center; gap: 6px;
  padding: 0 0 6px 0; border-bottom: 1px solid rgba(255,255,255,0.07);
  font-size: 0.55rem; font-weight: 700; letter-spacing: 0.08em;
  color: rgba(255,255,255,0.3); text-transform: uppercase; margin-bottom: 2px;
  flex-shrink: 0;
}
.mm-rh-src  { width: 120px; flex-shrink: 0; }
.mm-rh-arr  { width: 18px; flex-shrink: 0; }
.mm-rh-dest { flex: 1; min-width: 0; }
.mm-rh-amt  { width: 96px; flex-shrink: 0; text-align: center; }
.mm-rh-en   { width: 22px; flex-shrink: 0; }
.mm-rh-del  { width: 22px; flex-shrink: 0; }

.mm-route-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.mm-route-row:hover { background: rgba(255,255,255,0.02); border-radius: 3px; }
.mm-route-src { width: 120px; flex-shrink: 0; }
.mm-route-arrow { color: rgba(255,255,255,0.25); font-size: 0.7rem; width: 18px; text-align: center; flex-shrink: 0; }
.mm-route-dest { flex: 1; min-width: 0; }
.mm-route-src, .mm-route-dest {
  font-size: 0.6rem; padding: 3px 6px; border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.75);
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: var(--font-mono, monospace);
}
.mm-route-src:hover, .mm-route-dest:hover { border-color: rgba(255,255,255,0.25); }
.mm-route-amount-wrap { width: 96px; flex-shrink: 0; display: flex; align-items: center; gap: 4px; }
.mm-route-amount {
  flex: 1; height: 3px; appearance: none; -webkit-appearance: none;
  background: linear-gradient(to right, #c67dff 0%, rgba(255,255,255,0.12) 50%, #5add71 100%);
  border-radius: 2px; cursor: ew-resize;
}
.mm-route-amount::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid rgba(0,0,0,0.4); }
.mm-route-amount-val {
  font-size: 0.5rem; color: rgba(255,255,255,0.45); width: 28px; text-align: right;
  font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; flex-shrink: 0;
}
.mm-route-enable {
  width: 20px; height: 20px; border-radius: 3px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.07);
  display: flex; align-items: center; justify-content: center; font-size: 0.55rem;
  flex-shrink: 0; user-select: none;
}
.mm-route-enable.on { background: rgba(90,221,113,0.25); color: var(--live, #5add71); border-color: var(--live, #5add71); }
.mm-route-del {
  width: 20px; height: 20px; border-radius: 3px; cursor: pointer;
  border: none; background: transparent; color: rgba(255,91,82,0.45); font-size: 0.85rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  padding: 0; line-height: 1;
}
.mm-route-del:hover { color: #f05b52; background: rgba(240,91,82,0.12); }
.mm-add-route {
  margin-top: 10px; padding: 6px 14px; border-radius: 3px;
  border: 1px dashed rgba(255,255,255,0.15); background: transparent;
  color: rgba(255,255,255,0.4); font-size: 0.6rem; cursor: pointer; align-self: flex-start;
  font-family: var(--font-mono, monospace);
}
.mm-add-route:hover { border-color: var(--live, #5add71); color: var(--live, #5add71); }
.mm-empty-hint {
  font-size: 0.58rem; color: rgba(255,255,255,0.25); padding: 16px 0;
  font-family: var(--font-mono, monospace);
}
`;

// ─── State helpers ────────────────────────────────────────────────────────────

function ensureModMatrix(state) {
  if (!state.modMatrix) {
    state.modMatrix = {
      routes: [],
      lfos: [
        { rate: 1, shape: 'sine', amount: 0, sync: false },
        { rate: 0.5, shape: 'triangle', amount: 0, sync: false },
      ],
      envs: [
        { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3, amount: 0, trigger: 'note' },
        { attack: 0.1, decay: 0.5, sustain: 0.3, release: 0.8, amount: 0, trigger: 'note' },
      ],
    };
  }
  if (!Array.isArray(state.modMatrix.routes)) state.modMatrix.routes = [];
  if (!Array.isArray(state.modMatrix.lfos) || state.modMatrix.lfos.length < 2) {
    state.modMatrix.lfos = [
      { rate: 1, shape: 'sine', amount: 0, sync: false },
      { rate: 0.5, shape: 'triangle', amount: 0, sync: false },
    ];
  }
  if (!Array.isArray(state.modMatrix.envs) || state.modMatrix.envs.length < 2) {
    state.modMatrix.envs = [
      { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3, amount: 0, trigger: 'note' },
      { attack: 0.1, decay: 0.5, sustain: 0.3, release: 0.8, amount: 0, trigger: 'note' },
    ];
  }
  state.modMatrix.lfos.forEach((lfo) => {
    if (!lfo.trigger) lfo.trigger = 'note';
  });
  state.modMatrix.envs.forEach((env) => {
    if (!env.trigger) env.trigger = 'note';
  });
  return state.modMatrix;
}

// ─── Sources panel ────────────────────────────────────────────────────────────

function renderSources(el, mm, state, renderPage) {
  el.innerHTML = '';

  // Section heading
  const heading = document.createElement('div');
  heading.style.cssText =
    'font-size:0.5rem;font-weight:700;letter-spacing:0.09em;color:rgba(255,255,255,0.25);text-transform:uppercase;padding:2px 4px 4px;flex-shrink:0';
  heading.textContent = 'SOURCES';
  el.appendChild(heading);

  MOD_SOURCES.forEach((src) => {
    const block = document.createElement('div');
    block.className = 'mm-source-block';

    const header = document.createElement('div');
    header.className = 'mm-source-header';

    const badge = document.createElement('span');
    badge.className = 'mm-source-type-badge';
    badge.textContent = src.type.toUpperCase();

    const nameSpan = document.createElement('span');
    nameSpan.style.flex = '1';
    nameSpan.textContent = src.label;

    header.appendChild(badge);
    header.appendChild(nameSpan);
    block.appendChild(header);

    if (src.type === 'lfo') {
      const lfoIdx = src.id === 'lfo1' ? 0 : 1;
      const lfo = mm.lfos[lfoIdx];

      const ctrls = document.createElement('div');
      ctrls.className = 'mm-lfo-controls';

      // Rate input
      const rateInput = document.createElement('input');
      rateInput.type = 'number';
      rateInput.className = 'mm-lfo-rate';
      rateInput.min = '0.01';
      rateInput.max = '20';
      rateInput.step = '0.01';
      rateInput.value = lfo.rate.toFixed(2);
      rateInput.title = 'Rate (Hz)';
      rateInput.addEventListener('change', () => {
        lfo.rate = Math.min(20, Math.max(0.01, parseFloat(rateInput.value) || 1));
        rateInput.value = lfo.rate.toFixed(2);
        if (state.engine) {
          const node = lfoIdx === 0 ? state.engine.lfo1 : state.engine.lfo2;
          if (node) node.frequency.value = lfo.rate;
        }
        saveState(state);
      });
      ctrls.appendChild(rateInput);

      // Shape buttons
      LFO_SHAPES.forEach((sh) => {
        const btn = document.createElement('button');
        const normShape = sh === 'tri' ? 'triangle' : sh === 'sq' ? 'square' : sh === 'saw' ? 'sawtooth' : sh;
        const isActive =
          lfo.shape === normShape ||
          (sh === 'tri' && lfo.shape === 'triangle') ||
          (sh === 'sq' && lfo.shape === 'square') ||
          (sh === 'saw' && lfo.shape === 'sawtooth');
        btn.className = 'mm-shape-btn' + (isActive ? ' active' : '');
        btn.textContent = LFO_SHAPE_LABELS[sh];
        btn.addEventListener('click', () => {
          lfo.shape = normShape;
          if (state.engine) {
            const node = lfoIdx === 0 ? state.engine.lfo1 : state.engine.lfo2;
            if (node) node.type = normShape;
          }
          saveState(state);
          renderPage();
        });
        ctrls.appendChild(btn);
      });

      // Sync toggle
      const syncBtn = document.createElement('button');
      syncBtn.className = 'mm-sync-btn' + (lfo.sync ? ' active' : '');
      syncBtn.textContent = 'SYNC';
      syncBtn.addEventListener('click', () => {
        lfo.sync = !lfo.sync;
        saveState(state);
        renderPage();
      });
      ctrls.appendChild(syncBtn);

      block.appendChild(ctrls);
    } else if (src.type === 'env') {
      const envIdx = src.id === 'env1' ? 0 : 1;
      const env = mm.envs[envIdx];

      const sliders = document.createElement('div');
      sliders.className = 'mm-env-sliders';

      const params = [
        { key: 'attack', label: 'A', min: 0.001, max: 4, step: 0.001 },
        { key: 'decay', label: 'D', min: 0.001, max: 4, step: 0.001 },
        { key: 'sustain', label: 'S', min: 0, max: 1, step: 0.01 },
        { key: 'release', label: 'R', min: 0.001, max: 8, step: 0.001 },
      ];

      params.forEach(({ key, label, min, max, step }) => {
        const wrap = document.createElement('div');
        wrap.className = 'mm-env-slider-wrap';

        const sl = document.createElement('input');
        sl.type = 'range';
        sl.className = 'mm-env-slider-range';
        sl.min = min;
        sl.max = max;
        sl.step = step;
        sl.value = env[key];
        sl.title = `${key}: ${env[key]}`;
        sl.addEventListener('input', () => {
          env[key] = parseFloat(sl.value);
          sl.title = `${key}: ${env[key].toFixed(3)}`;
          saveState(state);
        });

        const lbl = document.createElement('span');
        lbl.className = 'mm-env-lbl';
        lbl.textContent = label;

        wrap.appendChild(sl);
        wrap.appendChild(lbl);
        sliders.appendChild(wrap);
      });
      block.appendChild(sliders);

      // Trigger selector
      const trigRow = document.createElement('div');
      trigRow.className = 'mm-env-trig-row';
      ENV_TRIGGERS.forEach((t) => {
        const btn = document.createElement('button');
        btn.className = 'mm-env-trig-btn' + (env.trigger === t ? ' active' : '');
        btn.textContent = t;
        btn.addEventListener('click', () => {
          env.trigger = t;
          saveState(state);
          renderPage();
        });
        trigRow.appendChild(btn);
      });
      block.appendChild(trigRow);
    } else if (src.type === 'macro') {
      const macroIdx = parseInt(src.id.replace('macro', ''), 10) - 1;
      const macro = state.macros?.[macroIdx];
      const barWrap = document.createElement('div');
      barWrap.className = 'mm-macro-bar-wrap';
      const bar = document.createElement('div');
      bar.className = 'mm-macro-bar';
      const pct = Math.round((macro?.value ?? 0.5) * 100);
      bar.style.cssText = `width:${pct}%;background:${macro?.color ?? '#f0c640'}`;
      barWrap.appendChild(bar);
      block.appendChild(barWrap);
    } else {
      // perf / seq — just a subtle label
      const lbl = document.createElement('div');
      lbl.className = 'mm-perf-label';
      lbl.textContent = src.type === 'seq' ? 'Sequencer' : 'Performance';
      // header already has the name; override color for perf
      header.querySelector('.mm-source-header') && (header.style.opacity = '0.7');
      block.appendChild(lbl);
    }

    el.appendChild(block);
  });
}

// ─── Routes panel ─────────────────────────────────────────────────────────────

function renderRoutes(el, mm, state, renderPage) {
  el.innerHTML = '';

  // Column header
  const hdr = document.createElement('div');
  hdr.className = 'mm-routes-header';
  hdr.innerHTML = `
    <span class="mm-rh-src">SOURCE</span>
    <span class="mm-rh-arr"></span>
    <span class="mm-rh-dest">DESTINATION</span>
    <span class="mm-rh-amt">AMOUNT</span>
    <span class="mm-rh-en">EN</span>
    <span class="mm-rh-del"></span>
  `;
  el.appendChild(hdr);

  if (mm.routes.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'mm-empty-hint';
    hint.textContent = 'No routes yet — click "+ Add Route" to create one.';
    el.appendChild(hint);
  }

  mm.routes.forEach((route, idx) => {
    const row = document.createElement('div');
    row.className = 'mm-route-row';

    // Source dropdown
    const srcSel = document.createElement('select');
    srcSel.className = 'mm-route-src';
    MOD_SOURCES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      if (s.id === route.sourceId) opt.selected = true;
      srcSel.appendChild(opt);
    });
    srcSel.addEventListener('change', () => {
      route.sourceId = srcSel.value;
      if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
      saveState(state);
    });

    // Arrow
    const arrow = document.createElement('span');
    arrow.className = 'mm-route-arrow';
    arrow.textContent = '→';

    // Destination dropdown
    const destSel = document.createElement('select');
    destSel.className = 'mm-route-dest';
    // Build options grouped by track/global
    MOD_DESTINATIONS.forEach((d) => {
      if (d.track) {
        for (let ti = 0; ti < TRACK_COUNT; ti++) {
          const opt = document.createElement('option');
          opt.value = `${d.id}__${ti}`;
          opt.textContent = `${d.label} [T${ti + 1}]`;
          if (d.id === route.destId && ti === (route.trackIndex ?? 0)) opt.selected = true;
          destSel.appendChild(opt);
        }
      } else {
        const opt = document.createElement('option');
        opt.value = `${d.id}__0`;
        opt.textContent = d.label;
        if (d.id === route.destId && !MOD_DESTINATIONS.find((x) => x.id === route.destId)?.track) opt.selected = true;
        destSel.appendChild(opt);
      }
    });
    destSel.addEventListener('change', () => {
      const [did, ti] = destSel.value.split('__');
      route.destId = did;
      route.trackIndex = parseInt(ti, 10);
      if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
      saveState(state);
    });

    // Amount wrap
    const amtWrap = document.createElement('div');
    amtWrap.className = 'mm-route-amount-wrap';

    const amtSlider = document.createElement('input');
    amtSlider.type = 'range';
    amtSlider.className = 'mm-route-amount';
    amtSlider.min = '-100';
    amtSlider.max = '100';
    amtSlider.step = '1';
    amtSlider.value = Math.round((route.amount ?? 0.5) * 100);

    const amtVal = document.createElement('span');
    amtVal.className = 'mm-route-amount-val';
    amtVal.textContent = fmtAmt(route.amount ?? 0.5);

    amtSlider.addEventListener('input', () => {
      const v = parseInt(amtSlider.value, 10) / 100;
      route.amount = v;
      amtVal.textContent = fmtAmt(v);
      if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
      saveState(state);
    });

    amtWrap.appendChild(amtSlider);
    amtWrap.appendChild(amtVal);

    // Enable toggle
    const enBtn = document.createElement('div');
    enBtn.className = 'mm-route-enable' + (route.enabled !== false ? ' on' : '');
    enBtn.textContent = route.enabled !== false ? '✓' : '';
    enBtn.title = 'Enable/disable this route';
    enBtn.addEventListener('click', () => {
      route.enabled = !(route.enabled !== false);
      enBtn.classList.toggle('on', route.enabled);
      enBtn.textContent = route.enabled ? '✓' : '';
      if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
      saveState(state);
    });

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'mm-route-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove this route';
    delBtn.addEventListener('click', () => {
      mm.routes.splice(idx, 1);
      if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
      saveState(state);
      renderPage();
    });

    row.appendChild(srcSel);
    row.appendChild(arrow);
    row.appendChild(destSel);
    row.appendChild(amtWrap);
    row.appendChild(enBtn);
    row.appendChild(delBtn);
    el.appendChild(row);
  });

  // Add Route button
  const addBtn = document.createElement('button');
  addBtn.className = 'mm-add-route';
  addBtn.textContent = '+ Add Route';
  addBtn.addEventListener('click', () => {
    mm.routes.push({ sourceId: 'lfo1', destId: 'track_cutoff', trackIndex: 0, amount: 0.5, enabled: true });
    if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
    saveState(state);
    renderPage();
  });
  el.appendChild(addBtn);
}

function fmtAmt(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

// ─── Render ───────────────────────────────────────────────────────────────────

export default {
  render(container, state, emit) {
    const mm = ensureModMatrix(state);

    // Inject CSS once
    if (!document.getElementById('mm-styles')) {
      const s = document.createElement('style');
      s.id = 'mm-styles';
      s.textContent = MM_CSS;
      document.head.appendChild(s);
    }

    container.innerHTML = '';
    container.style.cssText = 'display:flex;height:100%;min-height:0;overflow:hidden;gap:0;';

    const renderPage = () => this.render(container, state, emit);

    // Left: sources panel
    const sourcesEl = document.createElement('div');
    sourcesEl.className = 'mm-sources';

    // Right: route list
    const routesEl = document.createElement('div');
    routesEl.className = 'mm-routes';

    renderSources(sourcesEl, mm, state, renderPage);
    renderRoutes(routesEl, mm, state, renderPage);

    container.appendChild(sourcesEl);
    container.appendChild(routesEl);
  },
};
