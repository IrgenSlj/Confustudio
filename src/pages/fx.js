// src/pages/fx.js — Reverb, Delay, Master, Per-Track FX

import { getActiveTrack, saveState } from '../state.js';

const FILTER_TYPES = ['lowpass', 'bandpass', 'highpass'];
const FILTER_LABELS = { lowpass: 'LP', bandpass: 'BP', highpass: 'HP' };

function sliderHTML(label, param, scope, min, max, step, value) {
  const decimals = step < 1 ? 2 : 0;
  return `
    <label class="fx-row">
      <span>${label}</span>
      <output>${Number(value).toFixed(decimals)}</output>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
             data-param="${param}" data-scope="${scope}">
    </label>`;
}

function cardHTML(title, rows) {
  return `<div class="page-card"><h4>${title}</h4>${rows}</div>`;
}

export default {
  render(container, state, emit) {
    const track = getActiveTrack(state);

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0">
        <span class="page-title" style="margin:0">FX</span>
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">${track.name}</span>
      </div>
      <div class="page-grid-2" style="flex:1;min-height:0">

        ${cardHTML('REVERB', `
          ${sliderHTML('ROOM', 'reverbSize',    'global', 0.1,  0.98, 0.01, state.reverbSize    ?? 0.5)}
          ${sliderHTML('DAMP', 'reverbDamping', 'global', 0,    1,    0.01, state.reverbDamping ?? 0.5)}
          ${sliderHTML('MIX',  'reverbMix',     'global', 0,    1,    0.01, state.reverbMix     ?? 0.22)}
        `)}

        ${cardHTML('DELAY', `
          ${sliderHTML('TIME', 'delayTime',     'global', 0.01, 1.4,  0.01, state.delayTime     ?? 0.28)}
          ${sliderHTML('FDBK', 'delayFeedback', 'global', 0,    0.95, 0.01, state.delayFeedback ?? 0.38)}
          ${sliderHTML('MIX',  'delayWet',      'global', 0,    1,    0.01, state.delayWet      ?? 0.3)}
        `)}

        ${cardHTML('MASTER', `
          ${sliderHTML('DRIVE', 'masterDrive', 'global', 0, 1,    0.01, state.masterDrive ?? 0)}
          ${sliderHTML('LEVEL', 'masterLevel', 'global', 0, 1,    0.01, state.masterLevel ?? 0.82)}
        `)}

        <div class="page-card" data-card="track">
          <h4>TRACK: ${track.name}</h4>
          <div style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:4px 0">Filter</div>
          <div style="display:flex;gap:4px;margin-bottom:6px">
            ${FILTER_TYPES.map(ft => `
              <button class="ctx-btn${(track.filterType || 'lowpass') === ft ? ' active' : ''}"
                      data-filter-type="${ft}">${FILTER_LABELS[ft]}</button>
            `).join('')}
          </div>
          ${sliderHTML('CUT',  'cutoff',    'track', 80,   18000, 1,    track.cutoff    ?? 3200)}
          ${sliderHTML('RES',  'resonance', 'track', 0.01, 30,    0.01, track.resonance ?? 1.8)}
          ${sliderHTML('DRIV', 'drive',     'track', 0,    1,     0.01, track.drive     ?? 0.18)}
          ${sliderHTML('BITS', 'bitDepth',  'track', 1,    16,    1,    track.bitDepth  ?? 16)}
          ${sliderHTML('SRR',  'srDiv',     'track', 1,    32,    1,    track.srDiv     ?? 1)}
        </div>

      </div>`;

    container.addEventListener('input', e => {
      const input = e.target;
      if (input.tagName !== 'INPUT' || input.type !== 'range') return;
      const { param, scope } = input.dataset;
      if (!param) return;

      const step = parseFloat(input.step);
      const v = step >= 1 ? parseInt(input.value, 10) : parseFloat(input.value);

      const out = input.closest('label')?.querySelector('output');
      if (out) out.textContent = Number(v).toFixed(step < 1 ? 2 : 0);

      if (scope === 'global') {
        state[param] = v;
        _applyGlobal(param, v, state);
      } else if (scope === 'track') {
        track[param] = v;
        emit('track:change', { trackIndex: state.selectedTrackIndex, param, value: v });
      }

      saveState(state);
    });

    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-filter-type]');
      if (!btn) return;
      const ft = btn.dataset.filterType;
      track.filterType = ft;
      container.querySelectorAll('[data-filter-type]').forEach(b =>
        b.classList.toggle('active', b.dataset.filterType === ft)
      );
      emit('track:change', { trackIndex: state.selectedTrackIndex, param: 'filterType', value: ft });
      saveState(state);
    });
  },

  knobMap: [
    { label: 'RevRoom', param: 'reverbSize',    min: 0.1,  max: 0.98, step: 0.01 },
    { label: 'RevDamp', param: 'reverbDamping', min: 0,    max: 1,    step: 0.01 },
    { label: 'RevMix',  param: 'reverbMix',     min: 0,    max: 1,    step: 0.01 },
    { label: 'DlyTime', param: 'delayTime',     min: 0.01, max: 1.4,  step: 0.01 },
    { label: 'DlyFb',   param: 'delayFeedback', min: 0,    max: 0.95, step: 0.01 },
    { label: 'Drive',   param: 'masterDrive',   min: 0,    max: 1,    step: 0.01 },
    { label: 'Level',   param: 'masterLevel',   min: 0,    max: 1,    step: 0.01 },
    { label: '—',       param: null,            min: 0,    max: 1,    step: 0.01 },
  ],

  keyboardContext: 'fx',
};

function _applyGlobal(param, v, state) {
  const eng = state.engine;
  if (!eng) return;
  if (param === 'reverbSize' && eng.setReverbRoomSize) eng.setReverbRoomSize(v);
  if (param === 'reverbDamping' && eng.setReverbDamping) eng.setReverbDamping(v);
  if (param === 'delayTime' && eng.setDelayTime) eng.setDelayTime(v);
  if (param === 'delayFeedback' && eng.setDelayFeedback) eng.setDelayFeedback(v);
  if (param === 'delayWet' && eng.setDelayMix) eng.setDelayMix(v);
  if (param === 'masterLevel' && eng.setMasterLevel) eng.setMasterLevel(v);
}
