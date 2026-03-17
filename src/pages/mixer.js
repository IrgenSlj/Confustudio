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

      // Level meter bar (static placeholder — driven by engine at runtime)
      const meter = document.createElement('div');
      meter.style.cssText = `
        width: 6px; flex:0 0 auto; height: 60px;
        background: linear-gradient(to top, var(--live) 0%, var(--accent) 70%, var(--record) 100%);
        opacity: 0.3; border-radius: 3px; align-self: center;
      `;
      strip.append(meter);

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
