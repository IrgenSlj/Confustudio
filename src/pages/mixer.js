// src/pages/mixer.js — redesigned mixer: compact track strips + horizontal group faders

import { TRACK_COLORS } from '../state.js';

const GROUP_COLORS = [
  '#f0c640', '#5add71', '#67d7ff', '#ff8c52',
  '#c67dff', '#ff6eb4', '#40e0d0', '#f05b52',
];

// ── Injected CSS (scoped to .mixer-page) ─────────────────────────────────────
const MIXER_CSS = `
.mixer-page { display: flex; flex-direction: column; gap: 0; height: 100%; min-height: 0; overflow-y: auto; }
.mx-section { border-bottom: 1px solid rgba(255,255,255,0.07); padding: 8px 10px; flex-shrink: 0; }
.mx-section-hdr {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em;
  color: rgba(255,255,255,0.4); text-transform: uppercase;
  margin-bottom: 6px; font-family: var(--font-mono);
}
.mx-section-hdr .mx-actions { margin-left: auto; display: flex; gap: 4px; }
.mx-bulk-btn {
  font-family: var(--font-mono); font-size: 0.5rem; padding: 2px 6px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.45); border-radius: 2px; cursor: pointer;
}
.mx-bulk-btn:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.3); }

/* Track strips */
.mx-tracks { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.mx-track-strip {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; min-width: 64px; max-width: 80px; flex: 1;
  padding: 6px 4px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-top: 2px solid var(--tc, #888);
  border-radius: 3px; cursor: pointer; transition: background 0.1s;
}
.mx-track-strip:hover { background: rgba(255,255,255,0.06); }
.mx-track-strip.selected { outline: 1px solid rgba(240,198,64,0.4); outline-offset: -1px; }
.mx-track-strip.strip-muted-by-solo { opacity: 0.35; }
.mx-track-name {
  display: flex; align-items: center; gap: 3px;
  font-size: 0.58rem; font-weight: 600; color: rgba(255,255,255,0.7);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;
  font-family: var(--font-mono);
}
.mx-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--tc, #888); flex-shrink: 0; }
.mx-sends { display: flex; gap: 6px; }
.mx-send-wrap { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.mx-send-knob-input {
  width: 22px; height: 22px; writing-mode: vertical-lr; direction: rtl;
  appearance: none; -webkit-appearance: slider-vertical;
  cursor: ns-resize; accent-color: var(--tc, #888);
}
.mx-send-lbl { font-size: 0.46rem; color: rgba(255,255,255,0.4); font-family: var(--font-mono); }
.mx-pan {
  width: 100%; height: 3px; appearance: none;
  background: rgba(255,255,255,0.15); border-radius: 2px; cursor: ew-resize;
  accent-color: var(--tc, #888);
}
.mx-pan::-webkit-slider-thumb {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--tc, #888); appearance: none;
}
.mx-fader-wrap { height: 72px; display: flex; align-items: center; justify-content: center; }
.mx-fader {
  writing-mode: vertical-lr; direction: rtl;
  width: 3px; height: 62px; appearance: none;
  background: rgba(255,255,255,0.15); border-radius: 2px;
  cursor: ns-resize; accent-color: var(--tc, #888);
}
.mx-fader::-webkit-slider-thumb {
  width: 22px; height: 8px; border-radius: 2px;
  background: var(--tc, #888); appearance: none;
}
.mx-vol-readout {
  font-size: 0.52rem; color: rgba(255,255,255,0.4);
  font-variant-numeric: tabular-nums; font-family: var(--font-mono);
}
.mx-ms-row { display: flex; gap: 3px; }
.mx-mute, .mx-solo {
  width: 22px; height: 16px; font-size: 0.5rem; font-weight: 700;
  border-radius: 2px; border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.5); cursor: pointer;
  font-family: var(--font-mono);
}
.mx-mute.on { background: rgba(240,91,82,0.3); color: #f05b52; border-color: #f05b52; }
.mx-solo.on { background: rgba(240,198,64,0.3); color: #f0c640; border-color: #f0c640; }
.mx-meter-wrap { width: 100%; height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-top: 1px; }
.mx-meter-bar { height: 100%; width: 0%; background: var(--tc, #5add71); border-radius: 2px; transition: width 0.05s; }

/* VU bars */
.mx-vu-bar {
  width: 100%; height: 4px; background: rgba(255,255,255,0.08);
  border-radius: 2px; position: relative; overflow: visible; margin-top: 2px;
}
.mx-vu-fill {
  height: 100%; border-radius: 2px; width: 0%;
  transition: width 0.05s ease-out;
  background: #5add71;
}
.mx-vu-peak {
  position: absolute; top: -1px; width: 2px; height: 6px;
  background: white; border-radius: 1px; left: 0%;
  transition: opacity 0.3s;
}

/* Master VU bar next to master fader */
.mx-master-vu {
  width: 2px; height: 100%; position: absolute; right: -4px; top: 0;
  background: rgba(255,255,255,0.06); border-radius: 1px; overflow: hidden;
}
.mx-master-vu-fill {
  position: absolute; bottom: 0; width: 100%;
  background: #5add71; height: 0%; border-radius: 1px;
  transition: height 0.05s ease-out;
}

/* Groups */
.mx-groups-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.mx-group-row {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 6px; background: rgba(255,255,255,0.03);
  border-radius: 3px; border-left: 2px solid var(--gc, #888);
}
.mx-group-lbl {
  font-size: 0.58rem; font-weight: 700; color: rgba(255,255,255,0.5);
  width: 20px; flex-shrink: 0; font-family: var(--font-mono);
}
.mx-group-fader { flex: 1; height: 3px; accent-color: var(--gc, #888); }
.mx-group-pan { width: 40px; height: 3px; accent-color: var(--gc, #888); flex-shrink: 0; }
.mx-group-val {
  font-size: 0.52rem; color: rgba(255,255,255,0.4);
  width: 24px; text-align: right; font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}
.mx-group-mute {
  width: 16px; height: 14px; font-size: 0.45rem; font-weight: 700;
  border-radius: 2px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); cursor: pointer;
  flex-shrink: 0; font-family: var(--font-mono);
}
.mx-group-mute.on { background: rgba(240,91,82,0.25); color: #f05b52; border-color: #f05b52; }

/* External modules */
.mx-ext-strip {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px; background: rgba(255,255,255,0.03);
  border-radius: 3px; border-left: 2px solid #a060d0;
  font-family: var(--font-mono);
}
.mx-ext-name { font-size: 0.55rem; color: #c090f0; font-weight: bold; min-width: 52px; flex-shrink: 0; }
.mx-ext-fader { flex: 1; height: 3px; accent-color: #a060d0; }
.mx-ext-val { font-size: 0.5rem; color: rgba(255,255,255,0.35); width: 26px; text-align: right; font-variant-numeric: tabular-nums; }
.mx-ext-pan { width: 40px; height: 3px; accent-color: #a060d0; }
.mx-ext-mute {
  width: 16px; height: 14px; font-size: 0.45rem; font-weight: 700;
  border-radius: 2px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); cursor: pointer;
  flex-shrink: 0;
}
.mx-ext-mute.on { background: rgba(240,91,82,0.25); color: #f05b52; border-color: #f05b52; }
`;

function injectCSS() {
  if (document.getElementById('mx-styles')) return;
  const style = document.createElement('style');
  style.id = 'mx-styles';
  style.textContent = MIXER_CSS;
  document.head.appendChild(style);
}

// ── Track strip builder ───────────────────────────────────────────────────────
function buildTrackStrip(track, ti, state, emit, stripEls, meterEls) {
  const color = TRACK_COLORS[ti] ?? '#888';

  const strip = document.createElement('div');
  strip.className = 'mx-track-strip' + (ti === state.selectedTrackIndex ? ' selected' : '');
  strip.style.setProperty('--tc', color);

  strip.addEventListener('click', () =>
    emit('state:change', { path: 'selectedTrackIndex', value: ti })
  );

  // Track name
  const nameRow = document.createElement('div');
  nameRow.className = 'mx-track-name';
  const dot = document.createElement('span');
  dot.className = 'mx-dot';
  const nameSpan = document.createElement('span');
  nameSpan.textContent = track.name ?? `T${ti + 1}`;
  nameSpan.style.overflow = 'hidden';
  nameSpan.style.textOverflow = 'ellipsis';
  nameSpan.style.whiteSpace = 'nowrap';
  nameSpan.style.flex = '1';
  nameSpan.style.minWidth = '0';

  // Double-click to rename
  nameSpan.style.cursor = 'text';
  nameSpan.addEventListener('dblclick', e => {
    e.stopPropagation();
    const currentName = track.name ?? `T${ti + 1}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;width:100%;background:#111;color:var(--screen-text);border:1px solid var(--accent);border-radius:2px;padding:0 2px';
    const commit = () => {
      const newName = input.value.trim() || currentName;
      track.name = newName;
      nameSpan.textContent = newName;
      if (nameRow.contains(input)) nameRow.replaceChild(nameSpan, input);
      emit('state:change', { path: 'tracks', value: state.tracks });
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { input.removeEventListener('blur', commit); nameSpan.textContent = track.name ?? `T${ti + 1}`; nameRow.replaceChild(nameSpan, input); }
    });
    nameRow.replaceChild(input, nameSpan);
    input.focus(); input.select();
  });

  nameRow.append(dot, nameSpan);
  strip.append(nameRow);

  // Send knobs (R = reverb, D = delay) — vertical mini sliders
  const sendsRow = document.createElement('div');
  sendsRow.className = 'mx-sends';

  function makeSendKnob(label, initVal, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'mx-send-wrap';
    const knob = document.createElement('input');
    knob.type = 'range'; knob.min = 0; knob.max = 1; knob.step = 0.01;
    knob.value = initVal;
    knob.className = 'mx-send-knob-input';
    knob.title = `${label === 'R' ? 'Reverb' : 'Delay'} send`;
    knob.addEventListener('input', () => onChange(parseFloat(knob.value)));
    const lbl = document.createElement('span');
    lbl.className = 'mx-send-lbl';
    lbl.textContent = label;
    wrap.append(knob, lbl);
    return { wrap, knob };
  }

  const { wrap: revWrap, knob: revKnob } = makeSendKnob('R', track.reverbSend ?? 0, v => {
    track.reverbSend = v;
    emit('track:change', { trackIndex: ti, param: 'reverbSend', value: v });
    if (state.engine?.setTrackReverbSend) state.engine.setTrackReverbSend(ti, v);
  });
  const { wrap: dlyWrap, knob: dlyKnob } = makeSendKnob('D', track.delaySend ?? 0, v => {
    track.delaySend = v;
    emit('track:change', { trackIndex: ti, param: 'delaySend', value: v });
    if (state.engine?.setTrackDelaySend) state.engine.setTrackDelaySend(ti, v);
  });
  sendsRow.append(revWrap, dlyWrap);
  strip.append(sendsRow);

  // Pan slider
  const panSlider = document.createElement('input');
  panSlider.type = 'range';
  panSlider.min = -1; panSlider.max = 1; panSlider.step = 0.05;
  panSlider.value = track.pan ?? 0;
  panSlider.className = 'mx-pan';
  panSlider.title = 'Pan';
  panSlider.addEventListener('input', () =>
    emit('track:change', { trackIndex: ti, param: 'pan', value: parseFloat(panSlider.value) })
  );
  strip.append(panSlider);

  // Vertical volume fader
  const faderWrap = document.createElement('div');
  faderWrap.className = 'mx-fader-wrap';
  const fader = document.createElement('input');
  fader.type = 'range';
  fader.setAttribute('orient', 'vertical');
  fader.min = 0; fader.max = 1.5; fader.step = 0.01;
  fader.value = track.volume ?? 0.8;
  fader.className = 'mx-fader';
  fader.title = 'Volume';

  const volReadout = document.createElement('div');
  volReadout.className = 'mx-vol-readout';
  volReadout.textContent = Math.round((track.volume ?? 0.8) * 100);

  fader.addEventListener('input', () => {
    const v = parseFloat(fader.value);
    volReadout.textContent = Math.round(v * 100);
    emit('track:change', { trackIndex: ti, param: 'volume', value: v });
    // Fader link support
    const links = state.faderLinks ?? [];
    const linked = links.find(l => l.a === ti || l.b === ti);
    if (linked) {
      const otherIdx = linked.a === ti ? linked.b : linked.a;
      const otherTrack = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[otherIdx];
      if (otherTrack) {
        otherTrack.volume = v;
        emit('track:change', { trackIndex: otherIdx, param: 'volume', value: v });
      }
    }
  });

  faderWrap.append(fader);
  strip.append(faderWrap, volReadout);

  // VU bar (peak-decay meter, driven by confusynth:note:on events)
  const vuBar = document.createElement('div');
  vuBar.className = 'mx-vu-bar';
  vuBar.dataset.vuTrack = ti;
  const vuFill = document.createElement('div');
  vuFill.className = 'mx-vu-fill';
  const vuPeak = document.createElement('div');
  vuPeak.className = 'mx-vu-peak';
  vuBar.append(vuFill, vuPeak);
  strip.append(vuBar);
  meterEls.push({ bar: vuFill, peak: vuPeak, track, ti });

  // Mute + Solo
  const msRow = document.createElement('div');
  msRow.className = 'mx-ms-row';

  const muteBtn = document.createElement('button');
  muteBtn.className = 'mx-mute' + (track.mute ? ' on' : '');
  muteBtn.textContent = 'M';
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    track.mute = !track.mute;
    muteBtn.classList.toggle('on', track.mute);
    emit('track:change', { trackIndex: ti, param: 'mute', value: track.mute });
  });

  const soloBtn = document.createElement('button');
  soloBtn.className = 'mx-solo' + (track.solo ? ' on' : '');
  soloBtn.textContent = 'S';
  soloBtn.addEventListener('click', e => {
    e.stopPropagation();
    track.solo = !track.solo;
    soloBtn.classList.toggle('on', track.solo);
    emit('track:change', { trackIndex: ti, param: 'solo', value: track.solo });
    // update solo dimming for all strips
    const anySolo = stripEls.some((el, i) => {
      const t = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[i];
      return t?.solo;
    });
    stripEls.forEach((el, i) => {
      const t = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[i];
      if (anySolo && !t?.solo) el.classList.add('strip-muted-by-solo');
      else el.classList.remove('strip-muted-by-solo');
    });
  });

  msRow.append(muteBtn, soloBtn);
  strip.append(msRow);

  return strip;
}

// ── Group row builder ─────────────────────────────────────────────────────────
function buildGroupRow(group, gi, state, emit) {
  const color = GROUP_COLORS[gi] ?? '#888';

  const row = document.createElement('div');
  row.className = 'mx-group-row';
  row.style.setProperty('--gc', color);

  const lbl = document.createElement('span');
  lbl.className = 'mx-group-lbl';
  lbl.style.color = color;
  lbl.textContent = group.name ?? `G${gi + 1}`;
  row.append(lbl);

  // Pan (compact, fixed width)
  const panSlider = document.createElement('input');
  panSlider.type = 'range'; panSlider.min = -1; panSlider.max = 1; panSlider.step = 0.05;
  panSlider.value = group.pan ?? 0;
  panSlider.className = 'mx-group-pan';
  panSlider.title = 'Pan';
  panSlider.addEventListener('input', () => {
    const v = parseFloat(panSlider.value);
    group.pan = v;
    if (state.engine) state.engine.setGroupPan(gi, v);
    emit('state:change', { path: `groups.${gi}.pan`, value: v });
  });
  row.append(panSlider);

  // Horizontal volume fader
  const fader = document.createElement('input');
  fader.type = 'range'; fader.min = 0; fader.max = 1.5; fader.step = 0.01;
  fader.value = group.volume ?? 1;
  fader.className = 'mx-group-fader';
  fader.title = 'Volume';

  const valSpan = document.createElement('span');
  valSpan.className = 'mx-group-val';
  valSpan.textContent = Math.round((group.volume ?? 1) * 100);

  fader.addEventListener('input', () => {
    const v = parseFloat(fader.value);
    valSpan.textContent = Math.round(v * 100);
    group.volume = v;
    if (state.engine) state.engine.setGroupVolume(gi, v);
    emit('state:change', { path: `groups.${gi}.volume`, value: v });
  });
  row.append(fader, valSpan);

  // Mute
  const muteBtn = document.createElement('button');
  muteBtn.className = 'mx-group-mute' + (group.muted ? ' on' : '');
  muteBtn.textContent = 'M';
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    group.muted = !group.muted;
    muteBtn.classList.toggle('on', group.muted);
    if (state.engine) {
      state.engine.setGroupMute(gi, group.muted);
      if (!group.muted) state.engine.setGroupVolume(gi, group.volume ?? 1);
    }
    emit('state:change', { path: `groups.${gi}.muted`, value: group.muted });
  });
  row.append(muteBtn);

  return row;
}

export default {
  render(container, state, emit) {
    injectCSS();
    container.innerHTML = '';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const tracks  = pattern.kit.tracks;

    // Root page wrapper
    const page = document.createElement('div');
    page.className = 'mixer-page';
    container.append(page);

    // ── TRACKS section ───────────────────────────────────────────────────────
    const tracksSection = document.createElement('div');
    tracksSection.className = 'mx-section';

    const tracksHdr = document.createElement('div');
    tracksHdr.className = 'mx-section-hdr';
    tracksHdr.innerHTML = `<span>Tracks</span><span style="font-weight:400;font-size:0.5rem;color:rgba(255,255,255,0.25)">${tracks.length} ch</span>`;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'mx-actions';

    const muteAllBtn = document.createElement('button');
    muteAllBtn.className = 'mx-bulk-btn';
    muteAllBtn.textContent = 'Mute All';
    muteAllBtn.addEventListener('click', () => {
      tracks.forEach(t => { t.mute = true; });
      stripEls.forEach(el => el.querySelector('.mx-mute')?.classList.add('on'));
      emit('state:change', { path: 'mixer.bulkMute', value: true });
    });

    const unmuteAllBtn = document.createElement('button');
    unmuteAllBtn.className = 'mx-bulk-btn';
    unmuteAllBtn.textContent = 'Unmute All';
    unmuteAllBtn.addEventListener('click', () => {
      tracks.forEach(t => { t.mute = false; });
      stripEls.forEach(el => el.querySelector('.mx-mute')?.classList.remove('on'));
      emit('state:change', { path: 'mixer.bulkMute', value: false });
    });

    const soloOffBtn = document.createElement('button');
    soloOffBtn.className = 'mx-bulk-btn';
    soloOffBtn.textContent = 'Solo Off';
    soloOffBtn.addEventListener('click', () => {
      tracks.forEach(t => { t.solo = false; });
      stripEls.forEach(el => {
        el.querySelector('.mx-solo')?.classList.remove('on');
        el.classList.remove('strip-muted-by-solo');
      });
      emit('state:change', { path: 'mixer.soloOff', value: true });
    });

    actionsDiv.append(muteAllBtn, unmuteAllBtn, soloOffBtn);
    tracksHdr.append(actionsDiv);
    tracksSection.append(tracksHdr);

    const tracksRow = document.createElement('div');
    tracksRow.className = 'mx-tracks';

    const stripEls = [];
    const meterEls = [];

    tracks.forEach((track, ti) => {
      const strip = buildTrackStrip(track, ti, state, emit, stripEls, meterEls);
      stripEls.push(strip);
      tracksRow.append(strip);
    });

    tracksSection.append(tracksRow);
    page.append(tracksSection);

    // ── GROUPS section ───────────────────────────────────────────────────────
    if (state.groups && state.groups.length > 0) {
      const groupsSection = document.createElement('div');
      groupsSection.className = 'mx-section';

      const groupsHdr = document.createElement('div');
      groupsHdr.className = 'mx-section-hdr';
      groupsHdr.textContent = 'Groups';
      groupsSection.append(groupsHdr);

      const groupsGrid = document.createElement('div');
      groupsGrid.className = 'mx-groups-grid';

      state.groups.forEach((group, gi) => {
        groupsGrid.append(buildGroupRow(group, gi, state, emit));
      });

      groupsSection.append(groupsGrid);
      page.append(groupsSection);
    }

    // ── EXTERNAL MODULES section ─────────────────────────────────────────────
    if (!window._connectedModules) window._connectedModules = [];

    let extSection = null;

    function renderExtModules() {
      if (extSection) extSection.remove();
      extSection = null;
      if (!window._connectedModules.length) return;

      extSection = document.createElement('div');
      extSection.className = 'mx-section';

      const extHdr = document.createElement('div');
      extHdr.className = 'mx-section-hdr';
      extHdr.textContent = 'External Modules';
      extSection.append(extHdr);

      window._connectedModules.forEach(mod => {
        const strip = document.createElement('div');
        strip.className = 'mx-ext-strip';

        const nameLbl = document.createElement('span');
        nameLbl.className = 'mx-ext-name';
        nameLbl.textContent = mod.label;
        strip.append(nameLbl);

        const fader = document.createElement('input');
        fader.type = 'range'; fader.min = 0; fader.max = 1.5; fader.step = 0.01;
        fader.value = mod.gain ?? 1;
        fader.className = 'mx-ext-fader';
        const faderVal = document.createElement('span');
        faderVal.className = 'mx-ext-val';
        faderVal.textContent = parseFloat(fader.value).toFixed(2);
        fader.addEventListener('input', () => {
          const v = parseFloat(fader.value);
          faderVal.textContent = v.toFixed(2);
          mod.gain = v;
          const el = mod.el;
          if (el) {
            const gainNode = el._tr909Audio?.gain ?? el._tb303Audio?.gain ?? el._juno60Audio?.gain;
            if (gainNode) gainNode.value = v;
          }
        });
        strip.append(fader, faderVal);

        const panSlider = document.createElement('input');
        panSlider.type = 'range'; panSlider.min = -1; panSlider.max = 1; panSlider.step = 0.05;
        panSlider.value = mod.pan ?? 0;
        panSlider.className = 'mx-ext-pan';
        panSlider.title = 'Pan';
        panSlider.addEventListener('input', () => {
          const v = parseFloat(panSlider.value);
          mod.pan = v;
          const el = mod.el;
          if (el) {
            const panNode = el._tr909Audio?.pan ?? el._tb303Audio?.pan ?? el._juno60Audio?.pan;
            if (panNode) panNode.value = v;
          }
        });
        strip.append(panSlider);

        const muteBtn = document.createElement('button');
        muteBtn.className = 'mx-ext-mute' + (mod.muted ? ' on' : '');
        muteBtn.textContent = 'M';
        muteBtn.addEventListener('click', e => {
          e.stopPropagation();
          mod.muted = !mod.muted;
          muteBtn.classList.toggle('on', mod.muted);
          const el = mod.el;
          if (el) {
            const gainNode = el._tr909Audio?.gain ?? el._tb303Audio?.gain ?? el._juno60Audio?.gain;
            if (gainNode) gainNode.value = mod.muted ? 0 : (mod.gain ?? 1);
          }
        });
        strip.append(muteBtn);

        extSection.append(strip);
      });

      page.append(extSection);
    }

    renderExtModules();

    // ── Per-track peak state (survives re-renders) ───────────────────────────
    window._trackPeaks     = window._trackPeaks     ?? Array(8).fill(0);
    window._trackPeakTimes = window._trackPeakTimes ?? Array(8).fill(0);

    // Listen for trigger events — AbortController cleans up on page change
    const mixerAbortController = new AbortController();
    window.addEventListener('confusynth:note:on', (e) => {
      const { trackIndex, velocity = 1 } = e.detail ?? {};
      if (trackIndex >= 0 && trackIndex < 8) {
        window._trackPeaks[trackIndex]     = Math.max(0.4, velocity);
        window._trackPeakTimes[trackIndex] = performance.now();
      }
    }, { signal: mixerAbortController.signal });

    // ── Master VU bar (2px strip alongside master fader) ─────────────────────
    // Inject into the .fader-master wrapper if present and not already done
    const masterFaderEl = document.getElementById('master-volume');
    let masterVuFill = null;
    if (masterFaderEl && !masterFaderEl.parentElement?.querySelector('.mx-master-vu')) {
      const masterVuWrap = document.createElement('div');
      masterVuWrap.className = 'mx-master-vu';
      masterVuFill = document.createElement('div');
      masterVuFill.className = 'mx-master-vu-fill';
      masterVuWrap.append(masterVuFill);
      masterFaderEl.parentElement.style.position = 'relative';
      masterFaderEl.parentElement.appendChild(masterVuWrap);
    } else if (masterFaderEl) {
      masterVuFill = masterFaderEl.parentElement?.querySelector('.mx-master-vu-fill') ?? null;
    }

    // ── rAF VU animation loop ─────────────────────────────────────────────────
    let _vuRaf = null;
    const _masterData = new Uint8Array(256);

    function _animateVU() {
      if (!page.isConnected) {
        cancelAnimationFrame(_vuRaf);
        mixerAbortController.abort();
        return;
      }
      const now = performance.now();

      // Per-track VU
      for (let ti = 0; ti < meterEls.length; ti++) {
        const { bar: fill, peak, track: t, ti: trackIdx } = meterEls[ti];
        if (!fill) continue;
        const elapsed = now - (window._trackPeakTimes[trackIdx] ?? 0);
        const decay   = Math.max(0, 1 - elapsed / 800);
        const vol     = t.mute ? 0 : (t.volume ?? 0.8);
        const level   = (window._trackPeaks[trackIdx] ?? 0) * decay * vol;

        const color = level > 0.85 ? '#f05b52' : level > 0.6 ? '#f0c640' : '#5add71';
        fill.style.width      = (level * 100) + '%';
        fill.style.background = color;

        // Peak hold: stays for 1.2s then fades
        if (peak) {
          if (elapsed < 1200) {
            peak.style.left    = (level * 100) + '%';
            peak.style.opacity = '1';
          } else {
            const peakDecay = Math.max(0, 1 - (elapsed - 1200) / 400);
            peak.style.opacity = String(peakDecay);
          }
        }
      }

      // Master VU bar from analyser RMS
      if (masterVuFill && state.engine?.analyser) {
        state.engine.analyser.getByteTimeDomainData(_masterData);
        let sum = 0;
        for (let i = 0; i < _masterData.length; i++) {
          const s = (_masterData[i] - 128) / 128;
          sum += s * s;
        }
        const rms = Math.sqrt(sum / _masterData.length);
        const pct = Math.min(100, Math.round(rms * 800));
        masterVuFill.style.height     = pct + '%';
        masterVuFill.style.background = pct > 85 ? '#f05b52' : pct > 60 ? '#f0c640' : '#5add71';
      }

      _vuRaf = requestAnimationFrame(_animateVU);
    }
    _animateVU();

    // Watch parent for removal to cancel RAF
    const _vuObserver = new MutationObserver(() => {
      if (!container.isConnected) {
        cancelAnimationFrame(_vuRaf);
        mixerAbortController.abort();
        _vuObserver.disconnect();
      }
    });
    if (container.parentElement) {
      _vuObserver.observe(container.parentElement, { childList: true });
    }

    // ── Cable connect listener ───────────────────────────────────────────────
    const cableHandler = e => {
      const { fromEl } = e.detail ?? {};
      if (!fromEl) return;
      const moduleEl = fromEl?.closest?.('[data-module-type]') ?? (fromEl?.dataset?.moduleType ? fromEl : null);
      const moduleType = moduleEl?.dataset?.moduleType;
      if (moduleType) {
        const alreadyTracked = window._connectedModules.some(m => m.el === moduleEl);
        if (!alreadyTracked) {
          const labelMap = { 'tb-303': 'TB-303', 'tr-909': 'TR-909', 'juno-60': 'JUNO-60' };
          window._connectedModules.push({
            el: moduleEl,
            label: labelMap[moduleType] ?? moduleType.toUpperCase(),
            gain: 1, pan: 0, muted: false, solo: false,
          });
        }
        renderExtModules();
      }
    };
    document.addEventListener('cable:connected', cableHandler);

    const obs = new MutationObserver(() => {
      if (!container.isConnected) {
        document.removeEventListener('cable:connected', cableHandler);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: false });
  },

  knobMap: [
    { label: 'Vol 1', param: 'track.0.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Vol 2', param: 'track.1.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Vol 3', param: 'track.2.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Vol 4', param: 'track.3.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Vol 5', param: 'track.4.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Vol 6', param: 'track.5.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Vol 7', param: 'track.6.volume', min: 0, max: 1, step: 0.01 },
    { label: 'Vol 8', param: 'track.7.volume', min: 0, max: 1, step: 0.01 },
  ],

  keyboardContext: 'mixer',
};
