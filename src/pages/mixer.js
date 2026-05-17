// src/pages/mixer.js — redesigned mixer: compact track strips + horizontal group faders

import { TRACK_COLORS } from '../state.js';
import { EVENTS, STATE_PATHS } from '../constants.js';

const GROUP_COLORS = ['#f0c640', '#5add71', '#67d7ff', '#ff8c52', '#c67dff', '#ff6eb4', '#40e0d0', '#f05b52'];

// ── Track strip builder ───────────────────────────────────────────────────────
function buildTrackStrip(track, ti, state, emit, stripEls, meterEls) {
  // Canonical send-level source: top-level state.tracks[ti] (persisted store).
  // Fall back to the kit track object, then 0.
  const stTrack = (state.tracks ?? [])[ti] ?? track;
  const color = TRACK_COLORS[ti] ?? '#888';

  const strip = document.createElement('div');
  strip.className = 'mx-track-strip' + (ti === state.selectedTrackIndex ? ' selected' : '');
  strip.style.setProperty('--tc', color);

  strip.addEventListener('click', () => {
    if (!window.confustudioCommands?.execute?.({ type: 'select-track', trackIndex: ti }, `Selected track ${ti + 1}`)) {
      emit(EVENTS.STATE_CHANGE, { path: STATE_PATHS.SELECTED_TRACK_INDEX, value: ti });
    }
  });

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
  nameSpan.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const currentName = track.name ?? `T${ti + 1}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText =
      'font-family:var(--font-mono);font-size:0.55rem;width:100%;background:#111;color:var(--screen-text);border:1px solid var(--accent);border-radius:2px;padding:0 2px';
    const commit = () => {
      const newName = input.value.trim() || currentName;
      nameSpan.textContent = newName;
      if (nameRow.contains(input)) nameRow.replaceChild(nameSpan, input);
      emit('track:change', { trackIndex: ti, param: 'name', value: newName });
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        input.blur();
      }
      if (ev.key === 'Escape') {
        input.removeEventListener('blur', commit);
        nameSpan.textContent = track.name ?? `T${ti + 1}`;
        nameRow.replaceChild(nameSpan, input);
      }
    });
    nameRow.replaceChild(input, nameSpan);
    input.focus();
    input.select();
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
    knob.type = 'range';
    knob.min = 0;
    knob.max = 1;
    knob.step = 0.01;
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

  const { wrap: revWrap } = makeSendKnob('R', stTrack.reverbSend ?? 0, (v) => {
    window.confustudioCommands?.history?.push();
    stTrack.reverbSend = v;
    track.reverbSend = v;
    state.engine?.setTrackReverbSend?.(ti, v);
    emit(EVENTS.STATE_CHANGE, { path: `tracks.${ti}.reverbSend`, value: v });
  });
  const { wrap: dlyWrap } = makeSendKnob('D', stTrack.delaySend ?? 0, (v) => {
    window.confustudioCommands?.history?.push();
    stTrack.delaySend = v;
    track.delaySend = v;
    state.engine?.setTrackDelaySend?.(ti, v);
    emit(EVENTS.STATE_CHANGE, { path: `tracks.${ti}.delaySend`, value: v });
  });
  sendsRow.append(revWrap, dlyWrap);
  strip.append(sendsRow);

  // Pan slider
  const panSlider = document.createElement('input');
  panSlider.type = 'range';
  panSlider.min = -1;
  panSlider.max = 1;
  panSlider.step = 0.05;
  panSlider.value = track.pan ?? 0;
  panSlider.className = 'mx-pan';
  panSlider.title = 'Pan';
  panSlider.addEventListener('input', () =>
    emit(EVENTS.TRACK_CHANGE, { trackIndex: ti, param: 'pan', value: parseFloat(panSlider.value) }),
  );
  strip.append(panSlider);

  // Vertical volume fader
  const faderWrap = document.createElement('div');
  faderWrap.className = 'mx-fader-wrap';
  const fader = document.createElement('input');
  fader.type = 'range';
  fader.setAttribute('orient', 'vertical');
  fader.min = 0;
  fader.max = 1.5;
  fader.step = 0.01;
  fader.value = track.volume ?? 0.8;
  fader.className = 'mx-fader';
  fader.title = 'Volume';

  const volReadout = document.createElement('div');
  volReadout.className = 'mx-vol-readout';
  volReadout.textContent = Math.round((track.volume ?? 0.8) * 100);

  fader.addEventListener('input', () => {
    const v = parseFloat(fader.value);
    volReadout.textContent = Math.round(v * 100);
    emit(EVENTS.TRACK_CHANGE, { trackIndex: ti, param: 'volume', value: v });
    // Fader link support
    const links = state.faderLinks ?? [];
    const linked = links.find((l) => l.a === ti || l.b === ti);
    if (linked) {
      const otherIdx = linked.a === ti ? linked.b : linked.a;
      emit(EVENTS.TRACK_CHANGE, { trackIndex: otherIdx, param: 'volume', value: v });
    }
  });

  faderWrap.append(fader);
  strip.append(faderWrap, volReadout);

  // VU bar (peak-decay meter, driven by confustudio:note:on events)
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
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newMute = !track.mute;
    muteBtn.classList.toggle('on', newMute);
    emit(EVENTS.TRACK_CHANGE, { trackIndex: ti, param: 'mute', value: newMute });
  });

  const soloBtn = document.createElement('button');
  soloBtn.className = 'mx-solo' + (track.solo ? ' on' : '');
  soloBtn.textContent = 'S';
  soloBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newSolo = !track.solo;
    soloBtn.classList.toggle('on', newSolo);
    emit(EVENTS.TRACK_CHANGE, { trackIndex: ti, param: 'solo', value: newSolo });
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

  const cueBtn = document.createElement('button');
  cueBtn.className = 'mx-cue' + (track.cue ? ' on' : '');
  cueBtn.textContent = 'C';
  cueBtn.title = 'Cue / pre-fader listen';
  cueBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newCue = !track.cue;
    cueBtn.classList.toggle('on', newCue);
    emit(EVENTS.TRACK_CHANGE, { trackIndex: ti, param: 'cue', value: newCue });
  });

  msRow.append(muteBtn, soloBtn, cueBtn);
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
  panSlider.type = 'range';
  panSlider.min = -1;
  panSlider.max = 1;
  panSlider.step = 0.05;
  panSlider.value = group.pan ?? 0;
  panSlider.className = 'mx-group-pan';
  panSlider.title = 'Pan';
  panSlider.addEventListener('input', () => {
    const v = parseFloat(panSlider.value);
    window.confustudioCommands?.history?.push();
    group.pan = v;
    if (state.engine) state.engine.setGroupPan(gi, v);
    emit(EVENTS.STATE_CHANGE, { path: `groups.${gi}.pan`, value: v });
  });
  row.append(panSlider);

  // Horizontal volume fader
  const fader = document.createElement('input');
  fader.type = 'range';
  fader.min = 0;
  fader.max = 1.5;
  fader.step = 0.01;
  fader.value = group.volume ?? 1;
  fader.className = 'mx-group-fader';
  fader.title = 'Volume';

  const valSpan = document.createElement('span');
  valSpan.className = 'mx-group-val';
  valSpan.textContent = Math.round((group.volume ?? 1) * 100);

  fader.addEventListener('input', () => {
    const v = parseFloat(fader.value);
    valSpan.textContent = Math.round(v * 100);
    window.confustudioCommands?.history?.push();
    group.volume = v;
    if (state.engine) state.engine.setGroupVolume(gi, v);
    emit(EVENTS.STATE_CHANGE, { path: `groups.${gi}.volume`, value: v });
  });
  row.append(fader, valSpan);

  // Mute
  const muteBtn = document.createElement('button');
  muteBtn.className = 'mx-group-mute' + (group.muted ? ' on' : '');
  muteBtn.textContent = 'M';
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.confustudioCommands?.history?.push();
    group.muted = !group.muted;
    muteBtn.classList.toggle('on', group.muted);
    if (state.engine) {
      state.engine.setGroupMute(gi, group.muted);
      if (!group.muted) state.engine.setGroupVolume(gi, group.volume ?? 1);
    }
    emit(EVENTS.STATE_CHANGE, { path: `groups.${gi}.muted`, value: group.muted });
  });
  row.append(muteBtn);

  return row;
}

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const tracks = pattern.kit.tracks;

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
      window.confustudioCommands?.history?.push();
      tracks.forEach((t) => {
        t.mute = true;
      });
      stripEls.forEach((el) => el.querySelector('.mx-mute')?.classList.add('on'));
      emit(EVENTS.STATE_CHANGE, { path: 'mixer.bulkMute', value: true });
    });

    const unmuteAllBtn = document.createElement('button');
    unmuteAllBtn.className = 'mx-bulk-btn';
    unmuteAllBtn.textContent = 'Unmute All';
    unmuteAllBtn.addEventListener('click', () => {
      window.confustudioCommands?.history?.push();
      tracks.forEach((t) => {
        t.mute = false;
      });
      stripEls.forEach((el) => el.querySelector('.mx-mute')?.classList.remove('on'));
      emit(EVENTS.STATE_CHANGE, { path: 'mixer.bulkMute', value: false });
    });

    const soloOffBtn = document.createElement('button');
    soloOffBtn.className = 'mx-bulk-btn';
    soloOffBtn.textContent = 'Solo Off';
    soloOffBtn.addEventListener('click', () => {
      window.confustudioCommands?.history?.push();
      tracks.forEach((t) => {
        t.solo = false;
      });
      stripEls.forEach((el) => {
        el.querySelector('.mx-solo')?.classList.remove('on');
        el.classList.remove('strip-muted-by-solo');
      });
      emit(EVENTS.STATE_CHANGE, { path: 'mixer.soloOff', value: true });
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
    if (!window.__CONFUSTUDIO__.connectedModules) window.__CONFUSTUDIO__.connectedModules = [];

    let extSection = null;

    function renderExtModules() {
      if (extSection) extSection.remove();
      extSection = null;
      if (!window.__CONFUSTUDIO__.connectedModules.length) return;

      extSection = document.createElement('div');
      extSection.className = 'mx-section';

      const extHdr = document.createElement('div');
      extHdr.className = 'mx-section-hdr';
      extHdr.textContent = 'External Modules';
      extSection.append(extHdr);

      window.__CONFUSTUDIO__.connectedModules.forEach((mod) => {
        const strip = document.createElement('div');
        strip.className = 'mx-ext-strip';

        const nameLbl = document.createElement('span');
        nameLbl.className = 'mx-ext-name';
        nameLbl.textContent = mod.label;
        strip.append(nameLbl);

        const fader = document.createElement('input');
        fader.type = 'range';
        fader.min = 0;
        fader.max = 1.5;
        fader.step = 0.01;
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
            const gainNode = el._drumMachineAudio?.gain ?? el._acidMachineAudio?.gain ?? el._polysynthAudio?.gain;
            if (gainNode) gainNode.value = v;
          }
        });
        strip.append(fader, faderVal);

        const panSlider = document.createElement('input');
        panSlider.type = 'range';
        panSlider.min = -1;
        panSlider.max = 1;
        panSlider.step = 0.05;
        panSlider.value = mod.pan ?? 0;
        panSlider.className = 'mx-ext-pan';
        panSlider.title = 'Pan';
        panSlider.addEventListener('input', () => {
          const v = parseFloat(panSlider.value);
          mod.pan = v;
          const el = mod.el;
          if (el) {
            const panNode = el._drumMachineAudio?.pan ?? el._acidMachineAudio?.pan ?? el._polysynthAudio?.pan;
            if (panNode) panNode.value = v;
          }
        });
        strip.append(panSlider);

        const muteBtn = document.createElement('button');
        muteBtn.className = 'mx-ext-mute' + (mod.muted ? ' on' : '');
        muteBtn.textContent = 'M';
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          mod.muted = !mod.muted;
          muteBtn.classList.toggle('on', mod.muted);
          const el = mod.el;
          if (el) {
            const gainNode = el._drumMachineAudio?.gain ?? el._acidMachineAudio?.gain ?? el._polysynthAudio?.gain;
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
    window.__CONFUSTUDIO__.trackPeaks = window.__CONFUSTUDIO__.trackPeaks ?? Array(8).fill(0);
    window.__CONFUSTUDIO__.trackPeakTimes = window.__CONFUSTUDIO__.trackPeakTimes ?? Array(8).fill(0);

    // Listen for trigger events — AbortController cleans up on page change
    const mixerAbortController = new AbortController();
    window.addEventListener(
      'confustudio:note:on',
      (e) => {
        const { trackIndex, velocity = 1 } = e.detail ?? {};
        if (trackIndex >= 0 && trackIndex < 8) {
          window.__CONFUSTUDIO__.trackPeaks[trackIndex] = Math.max(0.4, velocity);
          window.__CONFUSTUDIO__.trackPeakTimes[trackIndex] = performance.now();
        }
      },
      { signal: mixerAbortController.signal },
    );

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

    // ── Master spectrum analyzer ──────────────────────────────────────────────
    // Build a 200×40 canvas bar-spectrum and append it at the bottom of the
    // mixer page (inside the page div so isConnected self-terminates the RAF).
    const specWrap = document.createElement('div');
    specWrap.className = 'mx-spectrum-wrap mx-section';
    const specLbl = document.createElement('div');
    specLbl.className = 'mx-spectrum-lbl';
    specLbl.textContent = 'Master Spectrum';
    const specCanvas = document.createElement('canvas');
    specCanvas.className = 'mx-spectrum-canvas';
    specCanvas.width = 200;
    specCanvas.height = 40;
    specWrap.append(specLbl, specCanvas);
    page.append(specWrap);

    const specCtx = specCanvas.getContext('2d');
    const FFT_BINS = 256; // we'll read 256 bins (fftSize 512)

    // Ensure the analyser node has fftSize 512 if accessible
    const _analyserNode = window._confustudioEngine?.analyser ?? state.engine?.analyser ?? null;
    if (_analyserNode && _analyserNode.fftSize < 512) {
      try {
        _analyserNode.fftSize = 512;
      } catch (_) {}
    }
    const _specData = new Uint8Array(FFT_BINS);

    function _drawSpectrum() {
      if (!specCanvas.isConnected) return; // self-terminate
      const analyser = window._confustudioEngine?.analyser ?? state.engine?.analyser ?? null;
      if (!analyser) {
        // no analyser yet — clear and reschedule
        specCtx.clearRect(0, 0, specCanvas.width, specCanvas.height);
        requestAnimationFrame(_drawSpectrum);
        return;
      }
      analyser.getByteFrequencyData(_specData);
      const W = specCanvas.width;
      const H = specCanvas.height;
      specCtx.clearRect(0, 0, W, H);
      const barW = W / FFT_BINS;
      for (let i = 0; i < FFT_BINS; i++) {
        const norm = _specData[i] / 255; // 0..1
        const barH = Math.round(norm * H);
        if (barH === 0) continue;
        // Color: green → yellow → red by amplitude
        const r = norm > 0.6 ? 255 : Math.round((norm / 0.6) * 200);
        const g = norm > 0.8 ? Math.round((1 - (norm - 0.8) / 0.2) * 210) : 210;
        const b = 40;
        specCtx.fillStyle = `rgb(${r},${g},${b})`;
        specCtx.fillRect(Math.floor(i * barW), H - barH, Math.max(1, Math.ceil(barW) - 1), barH);
      }
      requestAnimationFrame(_drawSpectrum);
    }
    _drawSpectrum();

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
        const elapsed = now - (window.__CONFUSTUDIO__.trackPeakTimes[trackIdx] ?? 0);
        const decay = Math.max(0, 1 - elapsed / 800);
        const vol = t.mute ? 0 : (t.volume ?? 0.8);
        const level = (window.__CONFUSTUDIO__.trackPeaks[trackIdx] ?? 0) * decay * vol;

        const color = level > 0.85 ? '#f05b52' : level > 0.6 ? '#f0c640' : '#5add71';
        fill.style.width = level * 100 + '%';
        fill.style.background = color;

        // Peak hold: stays for 1.2s then fades
        if (peak) {
          if (elapsed < 1200) {
            peak.style.left = level * 100 + '%';
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
        masterVuFill.style.height = pct + '%';
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
    const cableHandler = (e) => {
      const { fromEl } = e.detail ?? {};
      if (!fromEl) return;
      const moduleEl = fromEl?.closest?.('[data-module-type]') ?? (fromEl?.dataset?.moduleType ? fromEl : null);
      const moduleType = moduleEl?.dataset?.moduleType;
      if (moduleType) {
        const alreadyTracked = window.__CONFUSTUDIO__.connectedModules.some((m) => m.el === moduleEl);
        if (!alreadyTracked) {
          const labelMap = {
            acid_machine: 'Acid Machine',
            drum_machine: 'Drum Machine',
            polysynth: 'Polysynth',
            monosynth: 'Monosynth',
          };
          window.__CONFUSTUDIO__.connectedModules.push({
            el: moduleEl,
            label: labelMap[moduleType] ?? moduleType.toUpperCase(),
            gain: 1,
            pan: 0,
            muted: false,
            solo: false,
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
