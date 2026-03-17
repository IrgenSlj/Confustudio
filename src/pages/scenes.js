// src/pages/scenes.js — Scene slots, crossfader, snapshot

const INTERP_PARAMS = ['cutoff', 'decay', 'delaySend', 'pitch', 'volume'];

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const { scenes, crossfader, sceneA, sceneB, selectedTrackIndex } = state;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Scenes</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">
        A=${String.fromCharCode(65 + sceneA)} B=${String.fromCharCode(65 + sceneB)}
        &bull; crossfade ${Math.round(crossfader * 100)}%
      </span>`;
    container.append(header);

    // Crossfader
    const cfWrap = document.createElement('div');
    cfWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-shrink:0';
    cfWrap.innerHTML = `
      <span style="font-family:var(--font-mono);font-size:0.62rem;color:var(--muted)">A</span>
    `;
    const cfSlider = document.createElement('input');
    cfSlider.type  = 'range';
    cfSlider.min   = 0;
    cfSlider.max   = 1;
    cfSlider.step  = 0.01;
    cfSlider.value = crossfader;
    cfSlider.style.cssText = 'flex:1;accent-color:var(--accent)';
    cfSlider.addEventListener('input', () =>
      emit('state:change', { path: 'crossfader', value: parseFloat(cfSlider.value) })
    );
    const cfB = document.createElement('span');
    cfB.style.cssText = 'font-family:var(--font-mono);font-size:0.62rem;color:var(--muted)';
    cfB.textContent = 'B';
    cfWrap.append(cfSlider, cfB);
    container.append(cfWrap);

    // Scene grid (2×4)
    const sceneGrid = document.createElement('div');
    sceneGrid.className = 'scenes-grid';
    sceneGrid.style.cssText = 'margin-bottom:8px;flex-shrink:0';

    scenes.forEach((scene, si) => {
      const btn = document.createElement('button');
      btn.className = 'scene-btn';
      const letter = String.fromCharCode(65 + si);
      btn.innerHTML = `<strong>${letter}</strong><span>${scene.name}</span>`;

      if (si === sceneA) btn.style.borderColor = 'rgba(240,198,64,0.7)';
      if (si === sceneB) btn.style.borderColor = 'rgba(90,221,113,0.7)';

      btn.addEventListener('click', () => {
        // First click = set A, second click on different = set B
        if (sceneA === si) {
          emit('state:change', { path: 'sceneB', value: si });
        } else {
          emit('state:change', { path: 'sceneA', value: si });
        }
        this.render(container, { ...state, sceneA: si }, emit);
      });

      sceneGrid.append(btn);
    });
    container.append(sceneGrid);

    // Snapshot + param display
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;gap:8px;flex:1;min-height:0';

    const snapCard = document.createElement('div');
    snapCard.className = 'page-card';
    snapCard.style.cssText = 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px';
    snapCard.innerHTML = '<h4>Snapshot</h4>';

    const snapBtn = document.createElement('button');
    snapBtn.className = 'screen-btn';
    snapBtn.textContent = 'Snapshot → A';
    snapBtn.style.cssText = 'margin-bottom:4px';
    snapBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_snapshot', value: { sceneIdx: sceneA, trackIdx: selectedTrackIndex } })
    );

    const snapBBtn = document.createElement('button');
    snapBBtn.className = 'screen-btn';
    snapBBtn.textContent = 'Snapshot → B';
    snapBBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_snapshot', value: { sceneIdx: sceneB, trackIdx: selectedTrackIndex } })
    );

    snapCard.append(snapBtn, snapBBtn);
    bottomRow.append(snapCard);

    // Interpolated values display
    const valCard = document.createElement('div');
    valCard.className = 'page-card';
    valCard.style.cssText = 'flex:1;overflow-y:auto';
    valCard.innerHTML = '<h4>Interpolated Values</h4>';

    const sA = scenes[sceneA];
    const sB = scenes[sceneB];
    const tA = (sA && sA.tracks[selectedTrackIndex]) || {};
    const tB = (sB && sB.tracks[selectedTrackIndex]) || {};

    INTERP_PARAMS.forEach(param => {
      const a  = tA[param] ?? 0;
      const b  = tB[param] ?? 0;
      const cv = a + (b - a) * crossfader;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;font-family:var(--font-mono);font-size:0.6rem';
      row.innerHTML = `
        <span style="color:var(--muted);text-transform:uppercase">${param}</span>
        <span style="color:var(--muted)">${Number(a).toFixed(2)}</span>
        <div style="width:60px;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
          <div style="width:${crossfader * 100}%;height:100%;background:var(--accent);border-radius:2px"></div>
        </div>
        <span style="color:var(--muted)">${Number(b).toFixed(2)}</span>
        <span style="color:var(--screen-text)">${Number(cv).toFixed(2)}</span>
      `;
      valCard.append(row);
    });

    bottomRow.append(valCard);
    container.append(bottomRow);
  },

  knobMap: [
    { label: 'X-Fade',  param: 'crossfader', min: 0, max: 1, step: 0.01 },
    { label: 'SceneA',  param: 'sceneA',     min: 0, max: 7, step: 1 },
    { label: 'SceneB',  param: 'sceneB',     min: 0, max: 7, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
  ],

  keyboardContext: 'scenes',
};
