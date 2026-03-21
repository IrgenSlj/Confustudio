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

function fmtDB(v) {
  const n = Number(v);
  if (n === 0) return '0 dB';
  return (n > 0 ? '+' : '') + n.toFixed(1) + ' dB';
}

function eqBandHTML(label, param, value, scope = 'eq') {
  return `
    <div class="eq-band">
      <span>${fmtDB(value)}</span>
      <input type="range" min="-12" max="12" step="0.5" value="${value}"
             data-param="${param}" data-scope="${scope}">
      <label>${label}</label>
    </div>`;
}

function drawEQCurve(svg, low, mid, high) {
  const w = 120, h = 40, mid_y = h / 2;
  // Map dB [-12..+12] to pixel offset (positive dB = upward = negative y)
  const scale = (mid_y - 4) / 12;
  const y0 = mid_y - low  * scale;
  const y1 = mid_y - mid  * scale;
  const y2 = mid_y - high * scale;
  // Bezier: left anchor (0, y0), cp1 (30, y0), center (60, y1), cp2 (90, y2), right anchor (120, y2)
  const d = `M 0 ${y0} C 30 ${y0} 30 ${y1} 60 ${y1} C 90 ${y1} 90 ${y2} ${w} ${y2}`;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `<path d="${d}" stroke="var(--screen-text)" stroke-width="1.5" fill="none" opacity="0.7"/>
    <line x1="0" y1="${mid_y}" x2="${w}" y2="${mid_y}" stroke="var(--muted)" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.4"/>`;
}

function compSliderHTML(label, param, min, max, step, value, unit, displayFn) {
  const displayed = displayFn ? displayFn(value) : Number(value).toFixed(step < 1 ? (step < 0.01 ? 3 : 2) : 0);
  return `
    <label class="fx-row">
      <span>${label}</span>
      <output data-comp-out="${param}">${displayed} ${unit}</output>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
             data-param="${param}" data-scope="compressor">
    </label>`;
}

export default {
  render(container, state, emit) {
    const track = getActiveTrack(state);

    const comp = state.compressor ?? {};

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0">
        <span class="page-title" style="margin:0">FX</span>
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">${track.name}</span>
      </div>
      <div class="page-grid-2" style="flex:1;min-height:0">

        ${cardHTML('COMPRESSOR', `
          ${compSliderHTML('THRESH',  'threshold', -60,   0,    1,     comp.threshold ?? -18,  'dB',  null)}
          ${compSliderHTML('KNEE',    'knee',       0,    30,   1,     comp.knee      ?? 6,    'dB',  null)}
          ${compSliderHTML('RATIO',   'ratio',      1,    20,   0.5,   comp.ratio     ?? 4,    ':1',  v => Number(v).toFixed(1))}
          ${compSliderHTML('ATTACK',  'attack',     0.001, 0.5, 0.001, comp.attack    ?? 0.003,'ms',  v => (v * 1000).toFixed(1))}
          ${compSliderHTML('RELEASE', 'release',    0.01,  2,   0.01,  comp.release   ?? 0.25, 'ms',  v => Number(v * 1000).toFixed(0))}
        `)}

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

        ${cardHTML('CHORUS', `
          ${sliderHTML('RATE',  'chorusRate',  'chorus', 0.1, 8,    0.1,  state.chorusRate  ?? 0.5)}
          ${sliderHTML('DEPTH', 'chorusDepth', 'chorus', 0,   1,    0.01, state.chorusDepth ?? 0.25)}
          ${sliderHTML('MIX',   'chorusMix',   'chorus', 0,   1,    0.01, state.chorusMix   ?? 0)}
        `)}

        ${cardHTML('MASTER', `
          ${sliderHTML('DRIVE', 'masterDrive', 'global', 0, 1,    0.01, state.masterDrive ?? 0)}
          ${sliderHTML('LEVEL', 'masterLevel', 'global', 0, 1,    0.01, state.masterLevel ?? 0.82)}
          <div style="font-family:var(--font-mono);font-size:0.5rem;color:var(--muted);text-transform:uppercase;margin:6px 0 2px">MASTER EQ</div>
          <div class="eq-band-row">
            ${eqBandHTML('Low',  'masterEqLow',  state.masterEqLow  ?? 0, 'masterEQ')}
            ${eqBandHTML('Mid',  'masterEqMid',  state.masterEqMid  ?? 0, 'masterEQ')}
            ${eqBandHTML('High', 'masterEqHigh', state.masterEqHigh ?? 0, 'masterEQ')}
          </div>
        `)}

        <div class="page-card" data-card="track">
          <h4>TRACK: ${track.name}</h4>
          <div style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:4px 0 2px">EQ</div>
          <svg class="eq-curve-svg" data-eq-svg></svg>
          <div class="eq-band-row">
            ${eqBandHTML('Low',  'eqLow',  track.eqLow  ?? 0)}
            ${eqBandHTML('Mid',  'eqMid',  track.eqMid  ?? 0)}
            ${eqBandHTML('High', 'eqHigh', track.eqHigh ?? 0)}
          </div>
          <div style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:6px 0 4px">Filter</div>
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

    // Draw initial EQ curve
    const eqSvg = container.querySelector('[data-eq-svg]');
    if (eqSvg) drawEQCurve(eqSvg, track.eqLow ?? 0, track.eqMid ?? 0, track.eqHigh ?? 0);

    container.addEventListener('input', e => {
      const input = e.target;
      if (input.tagName !== 'INPUT' || input.type !== 'range') return;
      const { param, scope } = input.dataset;
      if (!param) return;

      const step = parseFloat(input.step);
      const v = step >= 1 ? parseInt(input.value, 10) : parseFloat(input.value);

      if (scope === 'eq') {
        // Update dB display
        const band = input.closest('.eq-band');
        if (band) band.querySelector('span').textContent = fmtDB(v);
        // Update track state
        track[param] = v;
        emit('track:change', { trackIndex: state.selectedTrackIndex, param, value: v });
        // Redraw EQ curve
        const svg = container.querySelector('[data-eq-svg]');
        if (svg) drawEQCurve(svg, track.eqLow ?? 0, track.eqMid ?? 0, track.eqHigh ?? 0);
        saveState(state);
        return;
      }

      if (scope === 'masterEQ') {
        const band = input.closest('.eq-band');
        if (band) band.querySelector('span').textContent = fmtDB(v);
        state[param] = v;
        const eng = window._confusynthEngine;
        if (eng?.setMasterEQ) {
          eng.setMasterEQ(state.masterEqLow ?? 0, state.masterEqMid ?? 0, state.masterEqHigh ?? 0);
        }
        saveState(state);
        return;
      }

      if (scope === 'chorus') {
        const out = input.closest('label')?.querySelector('output');
        if (out) out.textContent = Number(v).toFixed(step < 1 ? 2 : 0);
        state[param] = v;
        const eng = window._confusynthEngine;
        if (param === 'chorusRate'  && eng?.setChorusRate)  eng.setChorusRate(v);
        if (param === 'chorusDepth' && eng?.setChorusDepth) eng.setChorusDepth(v);
        if (param === 'chorusMix'   && eng?.setChorusMix)   eng.setChorusMix(v);
        saveState(state);
        return;
      }

      if (scope === 'compressor') {
        // Update display with unit-aware formatting
        const out = container.querySelector(`[data-comp-out="${param}"]`);
        if (out) {
          let displayed;
          if (param === 'attack')  displayed = (v * 1000).toFixed(1) + ' ms';
          else if (param === 'release') displayed = (v * 1000).toFixed(0) + ' ms';
          else if (param === 'ratio')   displayed = Number(v).toFixed(1) + ' :1';
          else if (param === 'threshold' || param === 'knee') displayed = Number(v).toFixed(0) + ' dB';
          else displayed = String(v);
          out.textContent = displayed;
        }
        state.compressor = state.compressor ?? {};
        state.compressor[param] = v;
        const eng = window._confusynthEngine;
        if (eng?.setCompressor) eng.setCompressor({ [param]: v });
        saveState(state);
        return;
      }

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
    { label: 'ChrRate', param: 'chorusRate',    min: 0.1,  max: 8,    step: 0.1  },
    { label: 'ChrMix',  param: 'chorusMix',     min: 0,    max: 1,    step: 0.01 },
    { label: 'Drive',   param: 'masterDrive',   min: 0,    max: 1,    step: 0.01 },
  ],

  keyboardContext: 'fx',
};

function _applyGlobal(param, v, state) {
  const eng = state.engine;
  if (!eng) return;
  if (param === 'reverbSize'    && eng.setReverbRoomSize) eng.setReverbRoomSize(v);
  if (param === 'reverbDamping' && eng.setReverbDamping)  eng.setReverbDamping(v);
  if (param === 'delayTime'     && eng.setDelayTime)      eng.setDelayTime(v);
  if (param === 'delayFeedback' && eng.setDelayFeedback)  eng.setDelayFeedback(v);
  if (param === 'delayWet'      && eng.setDelayMix)       eng.setDelayMix(v);
  if (param === 'masterLevel'   && eng.setMasterLevel)    eng.setMasterLevel(v);
  if (param === 'reverbMix'     && eng.setReverbMix)      eng.setReverbMix(v);
  if (param === 'masterDrive'   && eng.setMasterDrive)    eng.setMasterDrive(v);
}
