// src/pages/modmatrix.js — Mod Matrix: LFO/Env/Macro routing

import { saveState } from '../state.js';

// ─── Source & Destination Registries ─────────────────────────────────────────

const MOD_SOURCES = [
  { id: 'lfo1',     label: 'LFO 1',      type: 'lfo' },
  { id: 'lfo2',     label: 'LFO 2',      type: 'lfo' },
  { id: 'env1',     label: 'Env 1',      type: 'env' },
  { id: 'env2',     label: 'Env 2',      type: 'env' },
  { id: 'velocity', label: 'Velocity',   type: 'perf' },
  { id: 'note',     label: 'Note Pitch', type: 'perf' },
  { id: 'stepnum',  label: 'Step #',     type: 'seq' },
  { id: 'random',   label: 'Random',     type: 'seq' },
  { id: 'macro1',   label: 'Macro 1',    type: 'macro' },
  { id: 'macro2',   label: 'Macro 2',    type: 'macro' },
  { id: 'macro3',   label: 'Macro 3',    type: 'macro' },
  { id: 'macro4',   label: 'Macro 4',    type: 'macro' },
];

const MOD_DESTINATIONS = [
  { id: 'track_cutoff',    label: 'Filter Cutoff', track: true },
  { id: 'track_resonance', label: 'Filter Res',    track: true },
  { id: 'track_volume',    label: 'Track Volume',  track: true },
  { id: 'track_pan',       label: 'Track Pan',     track: true },
  { id: 'track_pitch',     label: 'Track Pitch',   track: true },
  { id: 'track_attack',    label: 'Env Attack',    track: true },
  { id: 'track_decay',     label: 'Env Decay',     track: true },
  { id: 'master_cutoff',   label: 'Master Cutoff', track: false },
  { id: 'master_reverb',   label: 'Reverb Mix',    track: false },
  { id: 'master_delay',    label: 'Delay Mix',     track: false },
  { id: 'group_volume',    label: 'Group Volume',  track: false },
];

const LFO_SHAPES = ['sine', 'tri', 'sq', 'saw'];
const LFO_SHAPE_LABELS = { sine: 'SIN', tri: 'TRI', sq: 'SQ', saw: 'SAW' };
const ENV_TRIGGERS = ['note', 'step', 'free'];
const TRACK_COUNT = 8;

// ─── State helpers ────────────────────────────────────────────────────────────

function ensureModMatrix(state) {
  if (!state.modMatrix) {
    state.modMatrix = {
      routes: [],
      lfos: [
        { rate: 1,   shape: 'sine',     amount: 0, sync: false },
        { rate: 0.5, shape: 'triangle', amount: 0, sync: false },
      ],
      envs: [
        { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3, amount: 0, trigger: 'note' },
        { attack: 0.1,  decay: 0.5, sustain: 0.3, release: 0.8, amount: 0, trigger: 'note' },
      ],
    };
  }
  if (!Array.isArray(state.modMatrix.routes)) state.modMatrix.routes = [];
  if (!Array.isArray(state.modMatrix.lfos) || state.modMatrix.lfos.length < 2) {
    state.modMatrix.lfos = [
      { rate: 1,   shape: 'sine',     amount: 0, sync: false },
      { rate: 0.5, shape: 'triangle', amount: 0, sync: false },
    ];
  }
  if (!Array.isArray(state.modMatrix.envs) || state.modMatrix.envs.length < 2) {
    state.modMatrix.envs = [
      { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3, amount: 0, trigger: 'note' },
      { attack: 0.1,  decay: 0.5, sustain: 0.3, release: 0.8, amount: 0, trigger: 'note' },
    ];
  }
  state.modMatrix.lfos.forEach(lfo => {
    if (!lfo.trigger) lfo.trigger = 'note';
  });
  state.modMatrix.envs.forEach(env => {
    if (!env.trigger) env.trigger = 'note';
  });
  return state.modMatrix;
}

function findRoute(routes, sourceId, destId, trackIndex) {
  return routes.findIndex(r =>
    r.sourceId === sourceId &&
    r.destId   === destId &&
    r.trackIndex === trackIndex
  );
}

// ─── Popup for editing a route ────────────────────────────────────────────────

let _popup = null;

function closePopup() {
  if (_popup && _popup.parentNode) _popup.parentNode.removeChild(_popup);
  _popup = null;
}

function openRoutePopup(cell, route, onUpdate, onRemove) {
  closePopup();

  const popup = document.createElement('div');
  popup.className = 'mm-popup';
  popup.innerHTML = `
    <div class="mm-popup-header">
      <span class="mm-popup-title">Route Amount</span>
      <button class="mm-popup-close">✕</button>
    </div>
    <div class="mm-popup-body">
      <label class="mm-popup-label">Amount
        <input type="range" class="mm-popup-slider" min="-100" max="100" step="1" value="${Math.round(route.amount * 100)}" />
        <span class="mm-popup-val">${route.amount >= 0 ? '+' : ''}${route.amount.toFixed(2)}</span>
      </label>
      <label class="mm-popup-label mm-popup-enable">
        <input type="checkbox" class="mm-popup-enable-chk" ${route.enabled ? 'checked' : ''} />
        Enabled
      </label>
      <button class="mm-popup-remove">Remove Route</button>
    </div>
  `;

  // Position near cell
  const rect = cell.getBoundingClientRect();
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.top  = `${rect.bottom + window.scrollY + 4}px`;

  document.body.appendChild(popup);
  _popup = popup;

  const slider  = popup.querySelector('.mm-popup-slider');
  const valSpan = popup.querySelector('.mm-popup-val');
  const enChk   = popup.querySelector('.mm-popup-enable-chk');

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10) / 100;
    valSpan.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    onUpdate({ amount: v });
  });
  enChk.addEventListener('change', () => {
    onUpdate({ enabled: enChk.checked });
  });
  popup.querySelector('.mm-popup-close').addEventListener('click', closePopup);
  popup.querySelector('.mm-popup-remove').addEventListener('click', () => {
    closePopup();
    onRemove();
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('pointerdown', function handler(e) {
      if (!popup.contains(e.target)) {
        closePopup();
        document.removeEventListener('pointerdown', handler);
      }
    });
  }, 10);
}

// ─── Render ───────────────────────────────────────────────────────────────────

export default {
  render(container, state, emit) {
    const mm = ensureModMatrix(state);

    // Persist selection across renders
    const prevSelected = container._mmSelected ?? null;
    container._mmSelected = prevSelected;

    container.innerHTML = '';
    container.className = 'mm-page';

    // ── Section 1: Sources panel ──────────────────────────────────────────────
    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'mm-sources';

    const srcTitle = document.createElement('div');
    srcTitle.className = 'mm-section-title';
    srcTitle.textContent = 'SOURCES';
    sourcePanel.appendChild(srcTitle);

    MOD_SOURCES.forEach(src => {
      const row = document.createElement('div');
      row.className = `mm-source-row mm-src-type-${src.type}`;
      row.dataset.srcId = src.id;

      const labelEl = document.createElement('span');
      labelEl.className = 'mm-src-label';
      labelEl.textContent = src.label;
      row.appendChild(labelEl);

      // Mini controls per type
      if (src.type === 'lfo') {
        const lfoIdx = src.id === 'lfo1' ? 0 : 1;
        const lfo = mm.lfos[lfoIdx];

        const controls = document.createElement('div');
        controls.className = 'mm-src-controls';

        // Rate knob (displayed as text input for simplicity)
        const rateWrap = document.createElement('label');
        rateWrap.className = 'mm-mini-label';
        rateWrap.textContent = 'Rate';
        const rateInput = document.createElement('input');
        rateInput.type = 'number';
        rateInput.className = 'mm-mini-input';
        rateInput.min = '0.01'; rateInput.max = '20'; rateInput.step = '0.01';
        rateInput.value = lfo.rate.toFixed(2);
        rateInput.addEventListener('change', () => {
          lfo.rate = Math.min(20, Math.max(0.01, parseFloat(rateInput.value) || 1));
          rateInput.value = lfo.rate.toFixed(2);
          // Update engine LFO rate
          if (state.engine) {
            const node = lfoIdx === 0 ? state.engine.lfo1 : state.engine.lfo2;
            if (node) node.frequency.value = lfo.rate;
          }
          saveState(state);
        });
        rateWrap.appendChild(rateInput);
        controls.appendChild(rateWrap);

        // Shape selector
        const shapeWrap = document.createElement('div');
        shapeWrap.className = 'mm-shape-btns';
        LFO_SHAPES.forEach(sh => {
          const btn = document.createElement('button');
          btn.className = `mm-shape-btn${lfo.shape === sh || (sh === 'tri' && lfo.shape === 'triangle') ? ' active' : ''}`;
          btn.textContent = LFO_SHAPE_LABELS[sh];
          btn.dataset.shape = sh;
          btn.addEventListener('click', () => {
            const normShape = sh === 'tri' ? 'triangle' : sh === 'sq' ? 'square' : sh === 'saw' ? 'sawtooth' : sh;
            lfo.shape = normShape;
            if (state.engine) {
              const node = lfoIdx === 0 ? state.engine.lfo1 : state.engine.lfo2;
              if (node) node.type = normShape;
            }
            saveState(state);
            this.render(container, state, emit);
          });
          shapeWrap.appendChild(btn);
        });
        controls.appendChild(shapeWrap);

        // BPM sync toggle
        const syncBtn = document.createElement('button');
        syncBtn.className = `mm-sync-btn${lfo.sync ? ' active' : ''}`;
        syncBtn.textContent = lfo.sync ? 'SYNC ON' : 'SYNC';
        syncBtn.addEventListener('click', () => {
          lfo.sync = !lfo.sync;
          saveState(state);
          this.render(container, state, emit);
        });
        controls.appendChild(syncBtn);

        row.appendChild(controls);

      } else if (src.type === 'env') {
        const envIdx = src.id === 'env1' ? 0 : 1;
        const env = mm.envs[envIdx];

        const controls = document.createElement('div');
        controls.className = 'mm-src-controls mm-env-controls';

        const params = [
          { key: 'attack',  label: 'A', min: 0.001, max: 4,   step: 0.001 },
          { key: 'decay',   label: 'D', min: 0.001, max: 4,   step: 0.001 },
          { key: 'sustain', label: 'S', min: 0,     max: 1,   step: 0.01  },
          { key: 'release', label: 'R', min: 0.001, max: 8,   step: 0.001 },
        ];

        params.forEach(({ key, label, min, max, step }) => {
          const wrap = document.createElement('label');
          wrap.className = 'mm-adsr-wrap';
          wrap.textContent = label;
          const sl = document.createElement('input');
          sl.type = 'range';
          sl.className = 'mm-adsr-slider';
          sl.min = min; sl.max = max; sl.step = step;
          sl.value = env[key];
          sl.title = `${key}: ${env[key]}`;
          sl.addEventListener('input', () => {
            env[key] = parseFloat(sl.value);
            sl.title = `${key}: ${env[key].toFixed(3)}`;
            saveState(state);
          });
          wrap.appendChild(sl);
          controls.appendChild(wrap);
        });

        // Trigger selector
        const trigWrap = document.createElement('div');
        trigWrap.className = 'mm-trig-select';
        ENV_TRIGGERS.forEach(t => {
          const btn = document.createElement('button');
          btn.className = `mm-trig-btn${env.trigger === t ? ' active' : ''}`;
          btn.textContent = t;
          btn.addEventListener('click', () => {
            env.trigger = t;
            saveState(state);
            this.render(container, state, emit);
          });
          trigWrap.appendChild(btn);
        });
        controls.appendChild(trigWrap);
        row.appendChild(controls);

      } else if (src.type === 'macro') {
        const macroIdx = parseInt(src.id.replace('macro', ''), 10) - 1;
        const macro = state.macros?.[macroIdx];
        if (macro) {
          const valSpan = document.createElement('span');
          valSpan.className = 'mm-macro-val';
          valSpan.style.color = macro.color ?? '#f0c640';
          valSpan.textContent = `${Math.round((macro.value ?? 0.5) * 100)}%`;
          row.appendChild(valSpan);
        }
      }
      // perf/seq: just label

      sourcePanel.appendChild(row);
    });

    // ── Section 2: Routing matrix ─────────────────────────────────────────────
    const matrixSection = document.createElement('div');
    matrixSection.className = 'mm-matrix-section';

    const matTitle = document.createElement('div');
    matTitle.className = 'mm-section-title';
    matTitle.textContent = 'MATRIX';
    matrixSection.appendChild(matTitle);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'mm-table-wrap';

    const table = document.createElement('table');
    table.className = 'mm-table';

    // Header row (destinations)
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.className = 'mm-corner';
    cornerTh.textContent = '↓ Src \\ Dest →';
    headerRow.appendChild(cornerTh);
    MOD_DESTINATIONS.forEach(dest => {
      const th = document.createElement('th');
      th.className = 'mm-dest-header';
      th.textContent = dest.label;
      th.title = dest.id;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body rows (sources)
    const tbody = document.createElement('tbody');
    MOD_SOURCES.forEach(src => {
      const tr = document.createElement('tr');
      tr.dataset.srcId = src.id;

      const labelTd = document.createElement('td');
      labelTd.className = 'mm-src-row-label';
      labelTd.textContent = src.label;
      tr.appendChild(labelTd);

      MOD_DESTINATIONS.forEach(dest => {
        const td = document.createElement('td');
        td.className = 'mm-cell';

        const sel = container._mmSelected;
        const trackIdx = (sel?.destId === dest.id && dest.track) ? sel.trackIndex : 0;
        const rIdx = findRoute(mm.routes, src.id, dest.id, trackIdx);
        const route = rIdx >= 0 ? mm.routes[rIdx] : null;

        if (route) {
          td.classList.add('mm-cell--active');
          if (!route.enabled) td.classList.add('mm-cell--disabled');
          const v = route.amount;
          td.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
          td.title = `${src.label} → ${dest.label} (${v >= 0 ? '+' : ''}${v.toFixed(2)})`;
        } else {
          td.textContent = '·';
        }

        td.addEventListener('click', () => {
          if (route) {
            // Open popup to edit
            openRoutePopup(
              td,
              { ...route },
              (updates) => {
                Object.assign(mm.routes[rIdx], updates);
                // Re-render cell
                if ('amount' in updates) {
                  const v = mm.routes[rIdx].amount;
                  td.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
                  td.title = `${src.label} → ${dest.label} (${v >= 0 ? '+' : ''}${v.toFixed(2)})`;
                }
                if ('enabled' in updates) {
                  td.classList.toggle('mm-cell--disabled', !updates.enabled);
                }
                if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
                saveState(state);
              },
              () => {
                mm.routes.splice(rIdx, 1);
                if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
                saveState(state);
                this.render(container, state, emit);
              }
            );
          } else {
            // Add new route
            const trackIndex = container._mmSelected?.trackIndex ?? 0;
            mm.routes.push({ sourceId: src.id, destId: dest.id, trackIndex, amount: 0.5, enabled: true });
            if (state.engine?.applyModMatrix) state.engine.applyModMatrix(mm.routes, mm.lfos, state.macros);
            saveState(state);
            this.render(container, state, emit);
          }
          // Set selected dest
          container._mmSelected = { destId: dest.id, trackIndex: trackIdx };
        });

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    matrixSection.appendChild(tableWrap);

    // ── Section 3: Destination details ────────────────────────────────────────
    const detailSection = document.createElement('div');
    detailSection.className = 'mm-dest-detail';

    const detTitle = document.createElement('div');
    detTitle.className = 'mm-section-title';
    detTitle.textContent = 'DESTINATION';
    detailSection.appendChild(detTitle);

    const sel = container._mmSelected;
    if (sel) {
      const destDef = MOD_DESTINATIONS.find(d => d.id === sel.destId);
      if (destDef) {
        const nameEl = document.createElement('div');
        nameEl.className = 'mm-detail-name';
        nameEl.textContent = destDef.label;
        detailSection.appendChild(nameEl);

        if (destDef.track) {
          const trackWrap = document.createElement('div');
          trackWrap.className = 'mm-track-sel';
          const trackLabel = document.createElement('span');
          trackLabel.className = 'mm-detail-label';
          trackLabel.textContent = 'Track:';
          trackWrap.appendChild(trackLabel);

          for (let ti = 0; ti < TRACK_COUNT; ti++) {
            const btn = document.createElement('button');
            btn.className = `mm-track-btn${sel.trackIndex === ti ? ' active' : ''}`;
            btn.textContent = `T${ti + 1}`;
            btn.addEventListener('click', () => {
              container._mmSelected = { ...sel, trackIndex: ti };
              this.render(container, state, emit);
            });
            trackWrap.appendChild(btn);
          }
          detailSection.appendChild(trackWrap);
        }

        // Amount range visualization — list active routes
        const activeRoutes = mm.routes.filter(r =>
          r.destId === sel.destId &&
          (!destDef.track || r.trackIndex === sel.trackIndex)
        );
        if (activeRoutes.length > 0) {
          const routeList = document.createElement('div');
          routeList.className = 'mm-detail-routes';
          activeRoutes.forEach(r => {
            const srcDef = MOD_SOURCES.find(s => s.id === r.sourceId);
            const item = document.createElement('div');
            item.className = 'mm-detail-route-item';
            const barVal = Math.abs(r.amount);
            const barDir = r.amount >= 0 ? 'pos' : 'neg';
            item.innerHTML = `
              <span class="mm-detail-src">${srcDef?.label ?? r.sourceId}</span>
              <span class="mm-detail-amt ${r.enabled ? '' : 'mm-disabled'}">
                ${r.amount >= 0 ? '+' : ''}${r.amount.toFixed(2)}
              </span>
              <div class="mm-detail-bar-wrap">
                <div class="mm-detail-bar mm-detail-bar--${barDir}" style="width:${Math.round(barVal * 100)}%"></div>
              </div>
            `;
            routeList.appendChild(item);
          });
          detailSection.appendChild(routeList);
        } else {
          const emptyMsg = document.createElement('div');
          emptyMsg.className = 'mm-detail-empty';
          emptyMsg.textContent = 'No routes to this destination';
          detailSection.appendChild(emptyMsg);
        }
      }
    } else {
      const hint = document.createElement('div');
      hint.className = 'mm-detail-empty';
      hint.textContent = 'Click a matrix cell to select a destination';
      detailSection.appendChild(hint);
    }

    // ── Assemble layout ───────────────────────────────────────────────────────
    const layout = document.createElement('div');
    layout.className = 'mm-layout';
    layout.appendChild(sourcePanel);
    layout.appendChild(matrixSection);
    layout.appendChild(detailSection);
    container.appendChild(layout);
  },
};
