// src/pages/mixer.js — 8-channel vertical fader mixer

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

    const faderGrid = document.createElement('div');
    faderGrid.className = 'mixer-fader-grid';
    faderGrid.style.cssText = 'flex:1;min-height:0;padding-bottom:4px';

    tracks.forEach((track, ti) => {
      const strip = document.createElement('div');
      strip.className = 'fader-strip';
      strip.style.cursor = 'pointer';
      if (ti === state.selectedTrackIndex) {
        strip.style.outline = '1px solid rgba(240,198,64,0.35)';
        strip.style.borderRadius = '5px';
      }
      strip.addEventListener('click', () =>
        emit('state:change', { path: 'selectedTrackIndex', value: ti })
      );

      // Track name
      const name = document.createElement('strong');
      name.textContent = track.name;
      strip.append(name);

      // Pan indicator (small)
      const panVal = document.createElement('span');
      panVal.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted)';
      panVal.textContent = track.pan >= 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(-track.pan * 100)}`;
      strip.append(panVal);

      // Vertical fader
      const fader = document.createElement('input');
      fader.type = 'range';
      fader.setAttribute('orient', 'vertical');
      fader.min   = 0;
      fader.max   = 1;
      fader.step  = 0.01;
      fader.value = track.volume;
      fader.style.cssText = 'writing-mode:vertical-lr;direction:rtl;flex:1;width:24px;accent-color:var(--accent)';
      fader.addEventListener('input', () =>
        emit('track:change', { trackIndex: ti, param: 'volume', value: parseFloat(fader.value) })
      );
      strip.append(fader);

      // Level meter bar (animated)
      const meterWrap = document.createElement('div');
      meterWrap.className = 'mixer-meter-wrap';
      const meterBar = document.createElement('div');
      meterBar.className = 'mixer-meter-bar';
      meterWrap.append(meterBar);
      strip.append(meterWrap);
      meterEls.push({ bar: meterBar, track });

      // Volume readout
      const vol = document.createElement('span');
      vol.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--accent)';
      vol.textContent = Math.round(track.volume * 100);
      strip.append(vol);

      // Mute / Solo buttons
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
        meterEls.forEach(({ bar, track: t }) => {
          const h = t.mute ? 0 : Math.min(100, Math.round(rms * 140 * (t.volume + 0.15)));
          bar.style.height = h + '%';
        });
      }
      requestAnimationFrame(updateMeters);
    })();
  },

  knobMap: [
    { label: 'Trk 1', param: 'volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 2', param: 'volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 3', param: 'volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 4', param: 'volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 5', param: 'volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 6', param: 'volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 7', param: 'volume', min: 0, max: 1, step: 0.01 },
    { label: 'Trk 8', param: 'volume', min: 0, max: 1, step: 0.01 },
  ],

  keyboardContext: 'mixer',
};
