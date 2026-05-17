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
