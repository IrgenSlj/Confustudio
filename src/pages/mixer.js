// src/pages/mixer.js — 8-channel vertical fader mixer

import { TRACK_COLORS } from '../state.js';

// ── Mini EQ canvas draw ───────────────────────────────────────────────────────

function drawMiniEQ(canvas, low, mid, high) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Center line (0 dB)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  // EQ curve approximation using 3 control points
  const yL = H / 2 - (low  / 12) * (H / 2 - 2);
  const yM = H / 2 - (mid  / 12) * (H / 2 - 2);
  const yH = H / 2 - (high / 12) * (H / 2 - 2);

  ctx.strokeStyle = '#a0c060';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, yL);
  ctx.bezierCurveTo(W * 0.25, yL, W * 0.3, yM, W / 2, yM);
  ctx.bezierCurveTo(W * 0.7, yM, W * 0.75, yH, W, yH);
  ctx.stroke();
}

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const tracks  = pattern.kit.tracks;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Mixer</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">8 tracks</span>`;
    container.append(header);

    const meterData = new Uint8Array(32);
    const meterEls = [];
    const _peakLevels = new Array(8).fill(0);
    const _peakDecay  = new Array(8).fill(0);

    // Bulk mute/unmute/solo-off bar
    const bulkBar = document.createElement('div');
    bulkBar.className = 'mixer-bulk-bar';

    const muteAllBtn = document.createElement('button');
    muteAllBtn.className = 'mixer-bulk-btn';
    muteAllBtn.textContent = 'Mute All';
    muteAllBtn.addEventListener('click', () => {
      tracks.forEach(t => { t.mute = true; });
      emit('state:change', { path: 'mixer.bulkMute', value: true });
    });

    const unmuteAllBtn = document.createElement('button');
    unmuteAllBtn.className = 'mixer-bulk-btn';
    unmuteAllBtn.textContent = 'Unmute All';
    unmuteAllBtn.addEventListener('click', () => {
      tracks.forEach(t => { t.mute = false; });
      emit('state:change', { path: 'mixer.bulkMute', value: false });
    });

    const soloOffBtn = document.createElement('button');
    soloOffBtn.className = 'mixer-bulk-btn';
    soloOffBtn.textContent = 'Solo off';
    soloOffBtn.addEventListener('click', () => {
      tracks.forEach(t => { t.solo = false; });
      emit('state:change', { path: 'mixer.soloOff', value: true });
      updateSoloDim();
    });

    bulkBar.append(muteAllBtn, unmuteAllBtn, soloOffBtn);
    container.append(bulkBar);

    const faderGrid = document.createElement('div');
    faderGrid.className = 'mixer-fader-grid';
    faderGrid.style.cssText = 'flex:1;min-height:0;padding-bottom:4px';

    // Collect mini-EQ canvases for later redraws
    const eqCanvases = [];

    // Collect strip elements so solo dimming can be applied globally
    const stripEls = [];

    // Update strip opacity whenever any solo state changes
    const updateSoloDim = () => {
      const anySolo = tracks.some(t => t.solo);
      stripEls.forEach((el, i) => {
        if (anySolo && !tracks[i].solo) {
          el.classList.add('strip-muted-by-solo');
        } else {
          el.classList.remove('strip-muted-by-solo');
        }
      });
    };

    tracks.forEach((track, ti) => {
      const strip = document.createElement('div');
      strip.className = 'fader-strip';
      stripEls.push(strip);
      strip.style.cursor = 'pointer';
      strip.style.borderLeft = `3px solid ${TRACK_COLORS[ti]}`;
      strip.style.setProperty('--track-color', TRACK_COLORS[ti]);
      if (ti === state.selectedTrackIndex) {
        strip.style.outline = '1px solid rgba(240,198,64,0.35)';
        strip.style.borderRadius = '5px';
      }
      strip.addEventListener('click', () =>
        emit('state:change', { path: 'selectedTrackIndex', value: ti })
      );

      // ── Track name (double-click to rename) ──────────────────────────────
      const nameSpan = document.createElement('span');
      nameSpan.className = 'fader-track-name';
      nameSpan.style.cssText = 'font-size:0.6rem;color:var(--track-color,var(--screen-text));display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-weight:bold;cursor:text';
      nameSpan.innerHTML = `${track.name ?? `T${ti + 1}`} <span style="font-size:0.44rem;color:var(--muted);font-weight:400">${(track.machine || 'tone').toUpperCase()}</span>`;

      nameSpan.addEventListener('dblclick', e => {
        e.stopPropagation();
        const currentName = track.name ?? `T${ti + 1}`;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;width:100%;background:#111;color:var(--screen-text);border:1px solid var(--accent);border-radius:2px;padding:0 2px';

        const commit = () => {
          const newName = input.value.trim() || currentName;
          track.name = newName;
          emit('state:change', { path: 'selectedTrackIndex', value: state.selectedTrackIndex });
          // Restore nameSpan
          nameSpan.innerHTML = `${track.name} <span style="font-size:0.44rem;color:var(--muted);font-weight:400">${(track.machine || 'tone').toUpperCase()}</span>`;
          if (nameSpan.contains(input)) nameSpan.replaceChild(nameSpan.firstChild, input);
          // Persist
          emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        };
        const cancel = () => {
          nameSpan.innerHTML = `${track.name ?? `T${ti + 1}`} <span style="font-size:0.44rem;color:var(--muted);font-weight:400">${(track.machine || 'tone').toUpperCase()}</span>`;
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
        });

        nameSpan.textContent = '';
        nameSpan.appendChild(input);
        input.focus();
        input.select();
      });

      // ── Color stripe at top of strip ────────────────────────────────────
      const colorStripe = document.createElement('div');
      colorStripe.style.cssText = `height:3px;background:${TRACK_COLORS[ti]};border-radius:2px 2px 0 0;margin-bottom:2px`;
      strip.prepend(colorStripe);

      strip.append(nameSpan);

      // ── Mini EQ canvas ───────────────────────────────────────────────────
      const eqCanvas = document.createElement('canvas');
      eqCanvas.className = 'mix-eq-mini';
      eqCanvas.width  = 40;
      eqCanvas.height = 20;
      drawMiniEQ(eqCanvas, track.eqLow ?? 0, track.eqMid ?? 0, track.eqHigh ?? 0);
      strip.append(eqCanvas);
      eqCanvases.push({ canvas: eqCanvas, track });

      // ── Pan row — interactive horizontal slider ───────────────────────────
      const panRow = document.createElement('div');
      panRow.style.cssText = 'display:flex;align-items:center;gap:3px;width:100%';

      const panLabel = document.createElement('span');
      panLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);flex-shrink:0';
      panLabel.textContent = 'PAN';

      const panSlider = document.createElement('input');
      panSlider.type = 'range';
      panSlider.min = -1; panSlider.max = 1; panSlider.step = 0.05;
      panSlider.value = track.pan;
      panSlider.style.cssText = 'flex:1;accent-color:var(--track-color,var(--accent));height:3px';
      panSlider.addEventListener('input', () =>
        emit('track:change', { trackIndex: ti, param: 'pan', value: parseFloat(panSlider.value) })
      );

      const panVal = document.createElement('span');
      panVal.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);min-width:22px;text-align:right';
      panVal.textContent = track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(-track.pan * 100)}`;
      panSlider.addEventListener('input', () => {
        const v = parseFloat(panSlider.value);
        panVal.textContent = v === 0 ? 'C' : v > 0 ? `R${Math.round(v * 100)}` : `L${Math.round(-v * 100)}`;
      });

      panRow.append(panLabel, panSlider, panVal);
      strip.append(panRow);

      // ── Stereo width row ─────────────────────────────────────────────────
      const widthRow = document.createElement('div');
      widthRow.style.cssText = 'display:flex;align-items:center;gap:3px;width:100%';

      const widthLabel = document.createElement('span');
      widthLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);flex-shrink:0';
      widthLabel.textContent = 'W';

      const widthSlider = document.createElement('input');
      widthSlider.type = 'range';
      widthSlider.min = 0; widthSlider.max = 2; widthSlider.step = 0.05;
      widthSlider.value = track.stereoWidth ?? 1;
      widthSlider.style.cssText = 'flex:1;accent-color:var(--track-color,var(--accent));height:3px';
      // stereoWidth controls how wide the stereo image is (0=mono,1=normal,2=wide)
      // TODO: wire to engine.js triggerTrack panner/channelSplitter for actual M-S processing
      widthSlider.addEventListener('input', () => {
        const v = parseFloat(widthSlider.value);
        widthVal.textContent = v.toFixed(2);
        emit('track:change', { trackIndex: ti, param: 'stereoWidth', value: v });
      });

      const widthVal = document.createElement('span');
      widthVal.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);min-width:22px;text-align:right';
      widthVal.textContent = (track.stereoWidth ?? 1).toFixed(2);

      widthRow.append(widthLabel, widthSlider, widthVal);
      strip.append(widthRow);

      // ── FX Send controls ─────────────────────────────────────────────────
      const sendsDiv = document.createElement('div');
      sendsDiv.className = 'mix-sends';

      // REV send
      const revRow = document.createElement('div');
      revRow.className = 'mix-send-row';
      const revLabel = document.createElement('span');
      revLabel.textContent = 'R';
      const revSlider = document.createElement('input');
      revSlider.type = 'range';
      revSlider.min = 0; revSlider.max = 1; revSlider.step = 0.01;
      revSlider.value = track.reverbSend ?? 0;
      const revVal = document.createElement('span');
      revVal.className = 'send-val';
      revVal.textContent = Math.round((track.reverbSend ?? 0) * 100) + '%';
      revSlider.addEventListener('input', () => {
        const v = parseFloat(revSlider.value);
        revVal.textContent = Math.round(v * 100) + '%';
        emit('track:change', { trackIndex: ti, param: 'reverbSend', value: v });
      });
      revRow.append(revLabel, revSlider, revVal);

      // DLY send
      const dlyRow = document.createElement('div');
      dlyRow.className = 'mix-send-row';
      const dlyLabel = document.createElement('span');
      dlyLabel.textContent = 'D';
      const dlySlider = document.createElement('input');
      dlySlider.type = 'range';
      dlySlider.min = 0; dlySlider.max = 1; dlySlider.step = 0.01;
      dlySlider.value = track.delaySend ?? 0;
      const dlyVal = document.createElement('span');
      dlyVal.className = 'send-val';
      dlyVal.textContent = Math.round((track.delaySend ?? 0) * 100) + '%';
      dlySlider.addEventListener('input', () => {
        const v = parseFloat(dlySlider.value);
        dlyVal.textContent = Math.round(v * 100) + '%';
        emit('track:change', { trackIndex: ti, param: 'delaySend', value: v });
      });
      dlyRow.append(dlyLabel, dlySlider, dlyVal);

      sendsDiv.append(revRow, dlyRow);
      strip.append(sendsDiv);

      // ── Input gain row ───────────────────────────────────────────────────
      const gainRow = document.createElement('div');
      gainRow.style.cssText = 'display:flex;align-items:center;gap:3px;width:100%';

      const gainLabel = document.createElement('span');
      gainLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);flex-shrink:0';
      gainLabel.textContent = 'GAIN';

      const gainSlider = document.createElement('input');
      gainSlider.type = 'range';
      gainSlider.min = 0; gainSlider.max = 2; gainSlider.step = 0.01;
      gainSlider.value = track.inputGain ?? 1.0;
      gainSlider.style.cssText = 'flex:1;accent-color:var(--track-color,var(--accent));height:3px';

      const gainVal = document.createElement('span');
      gainVal.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);min-width:26px;text-align:right';
      gainVal.textContent = (track.inputGain ?? 1.0).toFixed(1) + '\u00d7';

      gainSlider.addEventListener('input', () => {
        const v = parseFloat(gainSlider.value);
        gainVal.textContent = v.toFixed(1) + '\u00d7';
        emit('track:change', { trackIndex: ti, param: 'inputGain', value: v });
      });

      gainRow.append(gainLabel, gainSlider, gainVal);
      strip.append(gainRow);

      // ── Vertical fader ───────────────────────────────────────────────────
      const fader = document.createElement('input');
      fader.type = 'range';
      fader.setAttribute('orient', 'vertical');
      fader.min   = 0;
      fader.max   = 1;
      fader.step  = 0.01;
      fader.value = track.volume;
      fader.style.cssText = 'writing-mode:vertical-lr;direction:rtl;flex:1;width:24px;accent-color:var(--accent)';
      fader.style.setProperty('accent-color', TRACK_COLORS[ti]);
      fader.addEventListener('input', () => {
        const v = parseFloat(fader.value);
        emit('track:change', { trackIndex: ti, param: 'volume', value: v });
        // Fader link: if this track is linked to an adjacent track, mirror the change
        const links = state.faderLinks ?? [];
        const linked = links.find(l => l.a === ti || l.b === ti);
        if (linked) {
          const otherIdx = linked.a === ti ? linked.b : linked.a;
          const otherTrack = tracks[otherIdx];
          if (otherTrack) {
            otherTrack.volume = v;
            emit('track:change', { trackIndex: otherIdx, param: 'volume', value: v });
          }
        }
      });
      strip.append(fader);

      // ── Fader link button (links this strip with the next) ───────────────
      if (ti < tracks.length - 1) {
        const linkBtn = document.createElement('button');
        linkBtn.className = 'fader-link-btn';
        linkBtn.title = `Link T${ti + 1} + T${ti + 2}`;
        linkBtn.textContent = '\u26D3'; // ⛓
        const isLinked = (state.faderLinks ?? []).some(l => l.a === ti && l.b === ti + 1);
        if (isLinked) linkBtn.classList.add('active');
        linkBtn.addEventListener('click', e => {
          e.stopPropagation();
          state.faderLinks = state.faderLinks ?? [];
          const idx = state.faderLinks.findIndex(l => l.a === ti && l.b === ti + 1);
          if (idx >= 0) {
            state.faderLinks.splice(idx, 1);
            linkBtn.classList.remove('active');
          } else {
            state.faderLinks.push({ a: ti, b: ti + 1 });
            linkBtn.classList.add('active');
          }
          emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        });
        strip.append(linkBtn);
      }

      // ── Level meter bar (animated) ───────────────────────────────────────
      const meterWrap = document.createElement('div');
      meterWrap.className = 'mixer-meter-wrap';
      const meterBar = document.createElement('div');
      meterBar.className = 'mixer-meter-bar';
      const peakLine = document.createElement('div');
      peakLine.className = 'mixer-peak-line';
      meterWrap.append(meterBar, peakLine);
      strip.append(meterWrap);
      meterEls.push({ bar: meterBar, peak: peakLine, track });

      // ── Volume readout ───────────────────────────────────────────────────
      const vol = document.createElement('span');
      vol.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--accent)';
      vol.textContent = Math.round(track.volume * 100);
      strip.append(vol);

      // ── CUE button (pre-fader listen) ────────────────────────────────────
      const cueBtn = document.createElement('button');
      cueBtn.className = 'fader-cue' + (track.cue ? ' active' : '');
      cueBtn.textContent = 'CUE';
      cueBtn.title = 'Pre-fader listen';
      // track.cue = true routes audio to cue bus (stored only; audio routing TODO)
      cueBtn.addEventListener('click', e => {
        e.stopPropagation();
        track.cue = !track.cue;
        cueBtn.classList.toggle('active', track.cue);
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });
      strip.append(cueBtn);

      // ── Mute / Solo buttons ──────────────────────────────────────────────
      const msRow = document.createElement('div');
      msRow.style.cssText = 'display:flex;gap:3px';

      const muteBtn = document.createElement('button');
      muteBtn.className = 'fader-mute' + (track.mute ? ' active' : '');
      muteBtn.textContent = 'M';
      muteBtn.addEventListener('click', e => {
        e.stopPropagation();
        emit('track:change', { trackIndex: ti, param: 'mute', value: !track.mute });
        muteBtn.classList.toggle('active');
      });

      const soloBtn = document.createElement('button');
      soloBtn.className = 'fader-solo' + (track.solo ? ' active' : '');
      soloBtn.textContent = 'S';
      soloBtn.addEventListener('click', e => {
        e.stopPropagation();
        track.solo = !track.solo;
        soloBtn.classList.toggle('active', track.solo);
        emit('track:change', { trackIndex: ti, param: 'solo', value: track.solo });
        updateSoloDim();
      });

      msRow.append(muteBtn, soloBtn);
      strip.append(msRow);

      // ── Sidechain controls ───────────────────────────────────────────────
      const scRow = document.createElement('div');
      scRow.style.cssText = 'display:flex;align-items:center;gap:3px;width:100%;margin-top:3px';

      // SC button — sets this track as the sidechain source (only one at a time)
      const scBtn = document.createElement('button');
      const isScSource = !!track.isSidechainSource;
      scBtn.className = 'fader-cue' + (isScSource ? ' active' : '');
      scBtn.textContent = 'SC';
      scBtn.title = 'Set as sidechain source (ducks other tracks on trigger)';
      scBtn.style.cssText = 'font-size:0.44rem;padding:1px 4px;flex-shrink:0' +
        (isScSource ? ';border:1px solid #00d4ff;color:#00d4ff;font-weight:bold;background:rgba(0,212,255,0.12)' : '');
      scBtn.addEventListener('click', e => {
        e.stopPropagation();
        // Toggle: if already the source, clear it; otherwise set this track
        const wasActive = !!track.isSidechainSource;
        tracks.forEach(t => { t.isSidechainSource = false; });
        track.isSidechainSource = !wasActive;

        // Update all SC button styles in this render pass
        faderGrid.querySelectorAll('.sc-btn').forEach((b, i) => {
          const active = !!tracks[i].isSidechainSource;
          b.classList.toggle('active', active);
          b.style.border     = active ? '1px solid #00d4ff' : '';
          b.style.color      = active ? '#00d4ff' : '';
          b.style.fontWeight = active ? 'bold' : '';
          b.style.background = active ? 'rgba(0,212,255,0.12)' : '';
        });

        // Emit canonical event so app.js can sync the engine
        const newSourceIndex = track.isSidechainSource ? ti : -1;
        emit('state:change', { path: 'sidechainSource', value: newSourceIndex });
      });
      scBtn.classList.add('sc-btn');
      scRow.append(scBtn);

      // Duck slider — 0 (no duck) to 1 (full mute)
      const duckLabel = document.createElement('span');
      duckLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);flex-shrink:0';
      duckLabel.textContent = 'DUCK';

      const duckSlider = document.createElement('input');
      duckSlider.type = 'range';
      duckSlider.min = 0; duckSlider.max = 1; duckSlider.step = 0.01;
      duckSlider.value = track.sidechainAmount ?? 0;
      duckSlider.style.cssText = 'flex:1;accent-color:var(--accent);height:3px';

      const duckVal = document.createElement('span');
      duckVal.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);min-width:22px;text-align:right';
      duckVal.textContent = Math.round((track.sidechainAmount ?? 0) * 100) + '%';

      duckSlider.addEventListener('input', () => {
        const v = parseFloat(duckSlider.value);
        duckVal.textContent = Math.round(v * 100) + '%';
        track.sidechainAmount = v;
        // If this track is the active sidechain source, update engine immediately
        if (track.isSidechainSource && state.engine) {
          state.engine.setSidechainAmount(v);
        }
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });

      scRow.append(duckLabel, duckSlider, duckVal);
      strip.append(scRow);

      // ── Bus selector ─────────────────────────────────────────────────────
      const busRow = document.createElement('div');
      busRow.style.cssText = 'display:flex;gap:2px;margin-top:3px';
      const currentBus = track.outputBus ?? 'master';
      [['master', 'M'], ['bus1', 'B1'], ['bus2', 'B2']].forEach(([val, label]) => {
        const btn = document.createElement('button');
        btn.className = 'fader-cue' + (currentBus === val ? ' active' : '');
        btn.textContent = label;
        btn.title = `Route to ${val}`;
        btn.style.cssText = 'font-size:0.44rem;padding:1px 3px;flex:1';
        btn.addEventListener('click', e => {
          e.stopPropagation();
          busRow.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          emit('track:change', { trackIndex: ti, param: 'outputBus', value: val });
        });
        busRow.append(btn);
      });
      strip.append(busRow);

      faderGrid.append(strip);
    });

    container.append(faderGrid);

    // Single rAF loop animates all 8 meters
    (function updateMeters() {
      if (!faderGrid.isConnected) return;
      if (state.engine?.analyser) {
        state.engine.analyser.getByteTimeDomainData(meterData);
        let sum = 0;
        for (let i = 0; i < meterData.length; i++) {
          const s = (meterData[i] - 128) / 128;
          sum += s * s;
        }
        const rms = Math.sqrt(sum / meterData.length);
        meterEls.forEach(({ bar, peak, track: t }, i) => {
          const level = t.mute ? 0 : Math.min(1, rms * 1.4 * (t.volume + 0.15));
          const h = Math.round(level * 100);
          bar.style.height = h + '%';

          // Peak-hold logic
          if (level > _peakLevels[i]) {
            _peakLevels[i] = level;
            _peakDecay[i]  = 60;
          } else if (_peakDecay[i] > 0) {
            _peakDecay[i]--;
          } else {
            _peakLevels[i] = Math.max(0, _peakLevels[i] - 0.005);
          }
          peak.style.setProperty('--peak', _peakLevels[i]);
        });
      }
      requestAnimationFrame(updateMeters);
    })();
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
