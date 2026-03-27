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
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';

    const pattern = state.project.banks[state.activeBank].patterns[state.activePattern];
    const tracks  = pattern.kit.tracks;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Mixer</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">8 tracks</span>`;
    container.append(header);

    const meterData = new Uint8Array(32);
    const meterEls = [];
    const voiceCountEls = [];
    const _peakLevels = new Array(8).fill(0);
    const _peakDecay  = new Array(8).fill(0);
    // GR meter canvases — one per strip that has sidechain active
    const grMeterEls = [];
    // Sparkline data — one entry per strip
    const sparklineEls = [];

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
    faderGrid.style.cssText = 'flex:1;min-height:0;padding-bottom:4px;overflow-x:hidden';

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
      nameSpan.style.cssText = 'font-size:0.5rem;color:var(--track-color,var(--screen-text));display:flex;align-items:center;gap:2px;font-family:var(--font-mono);font-weight:bold;cursor:text;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0';
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
          emit('state:change', { path: 'tracks', value: state.tracks });
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

      // ── Strip header (name + color dot + M/S buttons) ────────────────────
      const stripHeader = document.createElement('div');
      stripHeader.className = 'strip-header';
      stripHeader.style.cssText = 'display:flex;align-items:center;gap:2px;width:100%;padding:2px 2px 2px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0';

      const colorDot = document.createElement('span');
      colorDot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${TRACK_COLORS[ti]};flex-shrink:0;display:inline-block`;
      stripHeader.append(colorDot);

      stripHeader.append(nameSpan);

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'mix-collapse-btn';
      collapseBtn.textContent = strip.dataset.collapsed === 'true' ? '▶' : '▼';
      collapseBtn.title = 'Collapse strip';

      stripHeader.append(collapseBtn);
      strip.append(stripHeader);

      // ── Strip body (everything below the header, can be collapsed) ───────
      const stripBody = document.createElement('div');
      stripBody.className = 'strip-body';

      collapseBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isCollapsed = strip.dataset.collapsed === 'true';
        strip.dataset.collapsed = String(!isCollapsed);
        collapseBtn.textContent = !isCollapsed ? '▶' : '▼';
        stripBody.style.display = isCollapsed ? '' : 'none';
      });

      // ── Mini EQ canvas ───────────────────────────────────────────────────
      const eqCanvas = document.createElement('canvas');
      eqCanvas.className = 'mix-eq-mini';
      eqCanvas.width  = 40;
      eqCanvas.height = 20;
      drawMiniEQ(eqCanvas, track.eqLow ?? 0, track.eqMid ?? 0, track.eqHigh ?? 0);
      stripBody.append(eqCanvas);
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
      panSlider.title = 'Pan position (L=-1, C=0, R=1)';
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
      stripBody.append(panRow);

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
      // stereoWidth: 0=mono, 1=normal, 2=wide — M-S processed in engine.js triggerTrack
      widthSlider.addEventListener('input', () => {
        const v = parseFloat(widthSlider.value);
        widthVal.textContent = v.toFixed(2);
        emit('track:change', { trackIndex: ti, param: 'stereoWidth', value: v });
      });

      const widthVal = document.createElement('span');
      widthVal.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);min-width:22px;text-align:right';
      widthVal.textContent = (track.stereoWidth ?? 1).toFixed(2);

      widthRow.append(widthLabel, widthSlider, widthVal);
      stripBody.append(widthRow);

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
      const revMuteBtn = document.createElement('button');
      revMuteBtn.className = 'mix-send-mute' + (track.sendMuted?.[0] ? ' active' : '');
      revMuteBtn.textContent = 'M';
      revMuteBtn.title = 'Mute send to Reverb';
      revMuteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!track.sendMuted) track.sendMuted = [false, false];
        track.sendMuted[0] = !track.sendMuted[0];
        revMuteBtn.classList.toggle('active', track.sendMuted[0]);
        emit('track:change', { trackIndex: ti, param: 'sendMuted', value: track.sendMuted });
      });
      revRow.append(revLabel, revSlider, revVal, revMuteBtn);

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
      const dlyMuteBtn = document.createElement('button');
      dlyMuteBtn.className = 'mix-send-mute' + (track.sendMuted?.[1] ? ' active' : '');
      dlyMuteBtn.textContent = 'M';
      dlyMuteBtn.title = 'Mute send to Delay';
      dlyMuteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!track.sendMuted) track.sendMuted = [false, false];
        track.sendMuted[1] = !track.sendMuted[1];
        dlyMuteBtn.classList.toggle('active', track.sendMuted[1]);
        emit('track:change', { trackIndex: ti, param: 'sendMuted', value: track.sendMuted });
      });
      dlyRow.append(dlyLabel, dlySlider, dlyVal, dlyMuteBtn);

      sendsDiv.append(revRow, dlyRow);
      stripBody.append(sendsDiv);

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
      stripBody.append(gainRow);

      // ── Vertical fader ───────────────────────────────────────────────────
      const fader = document.createElement('input');
      fader.type = 'range';
      fader.setAttribute('orient', 'vertical');
      fader.min   = 0;
      fader.max   = 1;
      fader.step  = 0.01;
      fader.value = track.volume;
      fader.style.cssText = 'writing-mode:vertical-lr;direction:rtl;height:70px;width:20px;accent-color:var(--track-color,var(--accent));flex-shrink:0';
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
      stripBody.append(fader);

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
          emit('state:change', { path: 'tracks', value: state.tracks });
        });
        stripBody.append(linkBtn);
      }

      // ── Level meter bar (animated) ───────────────────────────────────────
      const meterWrap = document.createElement('div');
      meterWrap.className = 'mixer-meter-wrap';
      const meterBar = document.createElement('div');
      meterBar.className = 'mixer-meter-bar';
      const peakLine = document.createElement('div');
      peakLine.className = 'mixer-peak-line';
      meterWrap.append(meterBar, peakLine);
      stripBody.append(meterWrap);
      meterEls.push({ bar: meterBar, peak: peakLine, track });

      // ── Volume readout ───────────────────────────────────────────────────
      const vol = document.createElement('span');
      vol.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--accent)';
      vol.textContent = Math.round(track.volume * 100);
      stripBody.append(vol);

      // ── CUE button (pre-fader listen) ────────────────────────────────────
      const cueBtn = document.createElement('button');
      cueBtn.className = 'fader-cue' + (track.cue ? ' active' : '');
      cueBtn.textContent = 'CUE';
      cueBtn.title = 'Pre-fader listen';
      cueBtn.addEventListener('click', e => {
        e.stopPropagation();
        track.cue = !track.cue;
        cueBtn.classList.toggle('active', track.cue);
        // Count how many tracks have cue active
        const cuedCount = tracks.filter(t => t.cue).length;
        if (state.engine?.setCueGain) {
          state.engine.setCueGain(cuedCount > 0 ? 1 : 0);
        }
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });
      stripBody.append(cueBtn);

      // ── Mute / Solo buttons ──────────────────────────────────────────────
      const msRow = document.createElement('div');
      msRow.style.cssText = 'display:flex;gap:2px;width:100%';

      const muteBtn = document.createElement('button');
      muteBtn.className = 'fader-mute' + (track.mute ? ' active' : '');
      muteBtn.textContent = 'M';
      muteBtn.style.flex = '1';
      muteBtn.addEventListener('click', e => {
        e.stopPropagation();
        emit('track:change', { trackIndex: ti, param: 'mute', value: !track.mute });
        muteBtn.classList.toggle('active');
      });

      const soloBtn = document.createElement('button');
      soloBtn.className = 'fader-solo' + (track.solo ? ' active' : '');
      soloBtn.textContent = 'S';
      soloBtn.style.flex = '1';
      soloBtn.addEventListener('click', e => {
        e.stopPropagation();
        track.solo = !track.solo;
        soloBtn.classList.toggle('active', track.solo);
        emit('track:change', { trackIndex: ti, param: 'solo', value: track.solo });
        updateSoloDim();
      });

      msRow.append(muteBtn, soloBtn);
      stripBody.append(msRow);

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
      stripBody.append(scRow);

      // ── Sidechain GR meter ───────────────────────────────────────────────
      const grMeter = document.createElement('canvas');
      grMeter.width = 4; grMeter.height = 40;
      grMeter.style.cssText = 'display:block;margin:2px auto;border-radius:1px;background:#111;cursor:default';
      grMeter.title = 'Sidechain ducking amount';
      stripBody.append(grMeter);
      grMeterEls.push({ canvas: grMeter, track });

      // ── Peak history sparkline ────────────────────────────────────────────
      const sparkCanvas = document.createElement('canvas');
      sparkCanvas.width = 40; sparkCanvas.height = 12;
      sparkCanvas.style.cssText = 'display:block;width:100%;height:12px;margin-top:2px;border-radius:2px';
      strip._peakHistory = new Float32Array(20);
      strip._currentPeak = 0;
      sparklineEls.push({ canvas: sparkCanvas, strip });
      stripBody.append(sparkCanvas);

      // ── Bus selector ─────────────────────────────────────────────────────
      const busRow = document.createElement('div');
      busRow.style.cssText = 'display:flex;gap:2px;margin-top:3px';
      const currentBus = track.outputBus ?? 'master';

      // Tag strip with current bus for CSS tinting
      strip.classList.add('mix-strip');
      strip.dataset.bus = currentBus;

      const BUS_BTN_COLORS = { master: '#e0e0e0', bus1: '#ff8c00', bus2: '#00d4ff' };
      [['master', 'M'], ['bus1', 'B1'], ['bus2', 'B2']].forEach(([val, label]) => {
        const btn = document.createElement('button');
        const isActive = currentBus === val;
        btn.className = 'fader-cue bus-btn' + (isActive ? ' active' : '');
        btn.dataset.busVal = val;
        btn.textContent = label;
        btn.title = `Route to ${val}`;
        btn.style.cssText = 'font-size:0.44rem;padding:1px 3px;flex:1';
        btn.style.color = BUS_BTN_COLORS[val];
        if (isActive) {
          btn.style.borderColor = BUS_BTN_COLORS[val];
          btn.style.background  = BUS_BTN_COLORS[val] + '22';
        }
        btn.addEventListener('click', e => {
          e.stopPropagation();
          busRow.querySelectorAll('.bus-btn').forEach(b => {
            b.classList.remove('active');
            b.style.borderColor = '';
            b.style.background  = '';
          });
          btn.classList.add('active');
          btn.style.borderColor = BUS_BTN_COLORS[val];
          btn.style.background  = BUS_BTN_COLORS[val] + '22';
          // Update strip tint
          strip.dataset.bus = val;
          emit('track:change', { trackIndex: ti, param: 'outputBus', value: val });
        });
        busRow.append(btn);
      });
      stripBody.append(busRow);

      // ── Voice count indicator ─────────────────────────────────────────────
      const voiceCount = document.createElement('span');
      voiceCount.className = 'voice-count';
      voiceCount.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--muted);display:block;text-align:center;margin-top:3px;letter-spacing:0.05em';
      voiceCount.textContent = '0V';
      stripBody.append(voiceCount);
      voiceCountEls.push({ el: voiceCount, ti });

      strip.append(stripBody);
      faderGrid.append(strip);
    });

    container.append(faderGrid);

    // ── Bus master controls ──────────────────────────────────────────────────
    const busSection = document.createElement('div');
    busSection.className = 'mixer-bus-section';

    const busSectionLabel = document.createElement('div');
    busSectionLabel.className = 'mixer-bus-section-label';
    busSectionLabel.textContent = 'BUS';
    busSection.append(busSectionLabel);

    const busStripsRow = document.createElement('div');
    busStripsRow.className = 'mixer-bus-strips';

    [
      { key: 'bus1Level', label: 'BUS 1', color: '#ff8c00', engineKey: 'bus1' },
      { key: 'bus2Level', label: 'BUS 2', color: '#00d4ff', engineKey: 'bus2' },
    ].forEach(({ key, label, color, engineKey }) => {
      const busStrip = document.createElement('div');
      busStrip.className = 'mixer-bus-strip';
      busStrip.style.setProperty('--bus-color', color);

      const busLabel = document.createElement('span');
      busLabel.className = 'mixer-bus-strip-label';
      busLabel.textContent = label;
      busLabel.style.color = color;

      const busLevel = state[key] ?? 1.0;

      const busFader = document.createElement('input');
      busFader.type  = 'range';
      busFader.min   = 0;
      busFader.max   = 1;
      busFader.step  = 0.01;
      busFader.value = busLevel;
      busFader.className = 'mixer-bus-fader';
      busFader.style.accentColor = color;

      const busValSpan = document.createElement('span');
      busValSpan.className = 'mixer-bus-val';
      busValSpan.textContent = Math.round(busLevel * 100);

      busFader.addEventListener('input', () => {
        const v = parseFloat(busFader.value);
        busValSpan.textContent = Math.round(v * 100);
        state[key] = v;
        // Wire to engine bus gain node if available
        if (state.engine && state.engine[engineKey]) {
          const ctx = state.audioContext;
          if (ctx) {
            state.engine[engineKey].gain.setTargetAtTime(v, ctx.currentTime, 0.01);
          } else {
            state.engine[engineKey].gain.value = v;
          }
        }
        emit('state:change', { path: key, value: v });
      });

      busStrip.append(busLabel, busFader, busValSpan);

      // ── 3-band EQ ──────────────────────────────────────────────────────────
      const eqRow = document.createElement('div');
      eqRow.style.cssText = 'display:flex;align-items:flex-start;gap:3px;width:100%;margin-top:4px';

      const eqSectionLabel = document.createElement('span');
      eqSectionLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--bus-color,var(--muted));flex-shrink:0;margin-top:2px';
      eqSectionLabel.textContent = 'EQ';
      eqRow.append(eqSectionLabel);

      [
        { band: 'Low',  suffix: 'EqLow'  },
        { band: 'Mid',  suffix: 'EqMid'  },
        { band: 'Hi',   suffix: 'EqHigh' },
      ].forEach(({ band, suffix }) => {
        const eqKey = engineKey + suffix;
        const currentVal = state[eqKey] ?? 0;

        const col = document.createElement('div');
        col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1px;flex:1';

        const bandLabel = document.createElement('span');
        bandLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--bus-color,var(--muted))';
        bandLabel.textContent = band;

        const eqSlider = document.createElement('input');
        eqSlider.type  = 'range';
        eqSlider.min   = -12;
        eqSlider.max   = 12;
        eqSlider.step  = 0.5;
        eqSlider.value = currentVal;
        eqSlider.style.cssText = 'width:100%;accent-color:var(--bus-color,' + color + ');height:3px';

        const eqValSpan = document.createElement('span');
        eqValSpan.style.cssText = 'font-family:var(--font-mono);font-size:0.42rem;color:var(--bus-color,var(--muted));text-align:center';
        eqValSpan.textContent = (currentVal >= 0 ? '+' : '') + currentVal.toFixed(1) + ' dB';

        eqSlider.addEventListener('input', () => {
          const v = parseFloat(eqSlider.value);
          eqValSpan.textContent = (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB';
          state[eqKey] = v;
          emit('state:change', { path: eqKey, value: v });
        });

        col.append(bandLabel, eqSlider, eqValSpan);
        eqRow.append(col);
      });

      busStrip.append(eqRow);
      busStripsRow.append(busStrip);
    });

    busSection.append(busStripsRow);
    container.append(busSection);

    // ── Group bus fader strips ───────────────────────────────────────────────
    const groupSection = document.createElement('div');
    groupSection.style.cssText = 'flex-shrink:0;margin-top:6px';

    // Collapsible header
    const groupHeaderRow = document.createElement('div');
    groupHeaderRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;user-select:none';

    const groupSectionLabel = document.createElement('div');
    groupSectionLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;color:var(--muted);letter-spacing:0.08em;flex:1';
    groupSectionLabel.textContent = 'GROUPS';

    const groupCollapseBtn = document.createElement('button');
    groupCollapseBtn.className = 'mix-collapse-btn';
    groupCollapseBtn.textContent = '▼';
    groupCollapseBtn.title = 'Collapse groups';

    groupHeaderRow.append(groupSectionLabel, groupCollapseBtn);
    groupSection.append(groupHeaderRow);

    const groupStripsRow = document.createElement('div');
    groupStripsRow.style.cssText = 'display:flex;gap:4px;overflow-x:auto;padding-bottom:4px';

    groupCollapseBtn.addEventListener('click', () => {
      const isCollapsed = groupStripsRow.style.display === 'none';
      groupStripsRow.style.display = isCollapsed ? '' : 'none';
      groupCollapseBtn.textContent = isCollapsed ? '▼' : '▶';
    });

    const GROUP_COLORS = [
      '#f0c640', '#5add71', '#67d7ff', '#ff8c52',
      '#c67dff', '#ff6eb4', '#40e0d0', '#f05b52',
    ];

    (state.groups ?? []).forEach((group, gi) => {
      const color = GROUP_COLORS[gi];

      const gStrip = document.createElement('div');
      gStrip.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:3px;min-width:48px;padding:4px 3px;border-radius:4px;border-left:3px solid ${color};background:rgba(0,0,0,0.25);font-family:var(--font-mono)`;

      // Color stripe at top
      const gColorStripe = document.createElement('div');
      gColorStripe.style.cssText = `height:2px;width:100%;background:${color};border-radius:2px 2px 0 0;margin-bottom:1px`;
      gStrip.prepend(gColorStripe);

      // Group name label
      const gLabel = document.createElement('span');
      gLabel.style.cssText = `font-size:0.5rem;color:${color};font-weight:bold;text-align:center;letter-spacing:0.04em`;
      gLabel.textContent = group.name ?? `G${gi + 1}`;

      // Pan slider
      const gPanRow = document.createElement('div');
      gPanRow.style.cssText = 'display:flex;align-items:center;gap:2px;width:100%';
      const gPanLabel = document.createElement('span');
      gPanLabel.style.cssText = 'font-size:0.4rem;color:var(--muted)';
      gPanLabel.textContent = 'P';
      const gPanSlider = document.createElement('input');
      gPanSlider.type = 'range';
      gPanSlider.min = -1; gPanSlider.max = 1; gPanSlider.step = 0.05;
      gPanSlider.value = group.pan ?? 0;
      gPanSlider.style.cssText = `flex:1;height:3px;accent-color:${color}`;
      const gPanVal = document.createElement('span');
      gPanVal.style.cssText = 'font-size:0.4rem;color:var(--muted);min-width:18px;text-align:right';
      const panNum = group.pan ?? 0;
      gPanVal.textContent = panNum === 0 ? 'C' : panNum > 0 ? `R${Math.round(panNum * 100)}` : `L${Math.round(-panNum * 100)}`;
      gPanSlider.addEventListener('input', () => {
        const v = parseFloat(gPanSlider.value);
        gPanVal.textContent = v === 0 ? 'C' : v > 0 ? `R${Math.round(v * 100)}` : `L${Math.round(-v * 100)}`;
        group.pan = v;
        if (state.engine) state.engine.setGroupPan(gi, v);
        emit('state:change', { path: `groups.${gi}.pan`, value: v });
      });
      gPanRow.append(gPanLabel, gPanSlider, gPanVal);

      // Vertical volume fader (0–1.5)
      const gFader = document.createElement('input');
      gFader.type = 'range';
      gFader.setAttribute('orient', 'vertical');
      gFader.min = 0; gFader.max = 1.5; gFader.step = 0.01;
      gFader.value = group.volume ?? 1;
      gFader.style.cssText = `writing-mode:vertical-lr;direction:rtl;height:60px;width:20px;accent-color:${color};flex-shrink:0`;
      gFader.addEventListener('input', () => {
        const v = parseFloat(gFader.value);
        gVolVal.textContent = Math.round(v * 100);
        group.volume = v;
        if (state.engine) state.engine.setGroupVolume(gi, v);
        emit('state:change', { path: `groups.${gi}.volume`, value: v });
      });

      // Volume readout
      const gVolVal = document.createElement('span');
      gVolVal.style.cssText = 'font-size:0.5rem;color:var(--accent);text-align:center';
      gVolVal.textContent = Math.round((group.volume ?? 1) * 100);

      // Mute button
      const gMuteBtn = document.createElement('button');
      gMuteBtn.className = 'fader-mute' + (group.muted ? ' active' : '');
      gMuteBtn.textContent = 'M';
      gMuteBtn.style.cssText = 'width:100%;font-size:0.44rem;padding:1px 0';
      gMuteBtn.addEventListener('click', e => {
        e.stopPropagation();
        group.muted = !group.muted;
        gMuteBtn.classList.toggle('active', group.muted);
        if (state.engine) {
          // Mute overrides volume to 0; unmute restores saved volume
          state.engine.setGroupMute(gi, group.muted);
          if (!group.muted) state.engine.setGroupVolume(gi, group.volume ?? 1);
        }
        emit('state:change', { path: `groups.${gi}.muted`, value: group.muted });
      });

      gStrip.append(gLabel, gPanRow, gFader, gVolVal, gMuteBtn);
      groupStripsRow.append(gStrip);
    });

    groupSection.append(groupStripsRow);
    container.append(groupSection);

    // Shared interval: shift peak history for all sparklines every 100 ms
    const _sparkInterval = setInterval(() => {
      if (!faderGrid.isConnected) { clearInterval(_sparkInterval); return; }
      sparklineEls.forEach(({ strip: s }) => {
        s._peakHistory.copyWithin(0, 1);
        s._peakHistory[19] = s._currentPeak ?? 0;
      });
    }, 100);

    // Single rAF loop animates all 8 meters + GR meters + sparklines + voice counts
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

          // Feed current peak into strip for sparkline sampling
          if (stripEls[i]) stripEls[i]._currentPeak = level;
        });

        // Draw GR meters — single shared sidechainGain node drives all strips
        const eng = state.engine;
        const reduction = eng?._sidechainEnabled
          ? 1 - (eng?.sidechainGain?.gain?.value ?? 1)
          : 0;
        grMeterEls.forEach(({ canvas: grc, track: gt }) => {
          const ctx2d = grc.getContext('2d');
          ctx2d.clearRect(0, 0, 4, 40);
          if ((gt.sidechainAmount > 0 || gt.isSidechainSource) && reduction > 0.01) {
            const h = Math.round(reduction * 40);
            const g = ctx2d.createLinearGradient(0, 40 - h, 0, 40);
            g.addColorStop(0, '#f44'); g.addColorStop(1, '#fa0');
            ctx2d.fillStyle = g;
            ctx2d.fillRect(0, 40 - h, 4, h);
          }
        });

        // Draw sparklines
        sparklineEls.forEach(({ canvas: sc, strip: ss }) => {
          const sctx = sc.getContext('2d');
          sctx.clearRect(0, 0, 40, 12);
          sctx.beginPath();
          sctx.strokeStyle = 'rgba(90,221,113,0.5)';
          sctx.lineWidth = 1;
          for (let i = 0; i < 20; i++) {
            const x = i * 2;
            const y = 12 - ss._peakHistory[i] * 12;
            if (i === 0) sctx.moveTo(x, y);
            else sctx.lineTo(x, y);
          }
          sctx.stroke();
        });
      }

      // Update voice count indicators
      if (state.engine?._voiceQueue) {
        voiceCountEls.forEach(({ el, ti }) => {
          const count = state.engine._voiceQueue.get(ti)?.length ?? 0;
          el.textContent = count + 'V';
          el.style.color = count > 0 ? '#5add71' : 'var(--muted)';
        });
      }

      requestAnimationFrame(updateMeters);
    })();

    // Auto-add channel strip when a module's audio-out connects to mixer
    const cableHandler = (e) => {
      const { fromEl, toEl } = e.detail;
      const fromModule = fromEl?.closest?.('.studio-module');
      const toModule = toEl?.closest?.('.studio-module');
      if (fromEl?.dataset?.port === 'audio-out' && toEl?.dataset?.port?.includes('-in')) {
        // A module's audio out just connected — trigger mixer re-render
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      }
    };
    document.addEventListener('cable:connected', cableHandler);
    // Cleanup when container leaves DOM
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
