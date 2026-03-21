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
    });

    bulkBar.append(muteAllBtn, unmuteAllBtn, soloOffBtn);
    container.append(bulkBar);

    const faderGrid = document.createElement('div');
    faderGrid.className = 'mixer-fader-grid';
    faderGrid.style.cssText = 'flex:1;min-height:0;padding-bottom:4px';

    // Collect mini-EQ canvases for later redraws
    const eqCanvases = [];

    tracks.forEach((track, ti) => {
      const strip = document.createElement('div');
      strip.className = 'fader-strip';
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
      revVal.textContent = (track.reverbSend ?? 0).toFixed(2);
      revSlider.addEventListener('input', () => {
        const v = parseFloat(revSlider.value);
        revVal.textContent = v.toFixed(2);
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
      dlyVal.textContent = (track.delaySend ?? 0).toFixed(2);
      dlySlider.addEventListener('input', () => {
        const v = parseFloat(dlySlider.value);
        dlyVal.textContent = v.toFixed(2);
        emit('track:change', { trackIndex: ti, param: 'delaySend', value: v });
      });
      dlyRow.append(dlyLabel, dlySlider, dlyVal);

      sendsDiv.append(revRow, dlyRow);
      strip.append(sendsDiv);

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
      fader.addEventListener('input', () =>
        emit('track:change', { trackIndex: ti, param: 'volume', value: parseFloat(fader.value) })
      );
      strip.append(fader);

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
        emit('track:change', { trackIndex: ti, param: 'solo', value: !track.solo });
        soloBtn.classList.toggle('active');
      });

      msRow.append(muteBtn, soloBtn);
      strip.append(msRow);
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
