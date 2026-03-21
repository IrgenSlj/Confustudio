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
    cfWrap.style.cssText = 'margin-bottom:10px;flex-shrink:0';

    // Scene A / B labels with names
    const cfLabels = document.createElement('div');
    cfLabels.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px';
    const sAName = (scenes[sceneA]?.name || `Scene ${String.fromCharCode(65+sceneA)}`).slice(0, 10);
    const sBName = (scenes[sceneB]?.name || `Scene ${String.fromCharCode(65+sceneB)}`).slice(0, 10);
    cfLabels.innerHTML = `
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:rgba(240,198,64,0.9)">
        A: ${String.fromCharCode(65+sceneA)} ${sAName}
      </span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:rgba(90,221,113,0.9)">
        ${sBName} ${String.fromCharCode(65+sceneB)} :B
      </span>
    `;

    // Gradient track showing A→B blend
    const cfTrack = document.createElement('div');
    cfTrack.style.cssText = `
      position:relative; height:8px; border-radius:4px; margin-bottom:4px;
      background: linear-gradient(to right, rgba(240,198,64,0.6), rgba(90,221,113,0.6));
      border: 1px solid rgba(255,255,255,0.1);
    `;
    // Position indicator dot
    const cfDot = document.createElement('div');
    cfDot.style.cssText = `
      position:absolute; top:50%; transform:translate(-50%,-50%);
      width:14px; height:14px; border-radius:50%;
      background:#fff; box-shadow:0 0 6px rgba(255,255,255,0.8);
      left: ${crossfader * 100}%;
      pointer-events:none; transition:left 0.05s;
    `;
    cfTrack.append(cfDot);

    // Actual range input (invisible, overlays the track)
    const cfSlider = document.createElement('input');
    cfSlider.type = 'range'; cfSlider.min = 0; cfSlider.max = 1; cfSlider.step = 0.01;
    cfSlider.value = crossfader;
    cfSlider.style.cssText = `
      position:absolute; top:0; left:0; width:100%; height:100%;
      opacity:0; cursor:pointer; margin:0;
    `;
    cfTrack.style.position = 'relative';
    cfTrack.append(cfSlider);

    cfSlider.addEventListener('input', () => {
      const v = parseFloat(cfSlider.value);
      cfDot.style.left = (v * 100) + '%';
      emit('state:change', { path: 'crossfader', value: v });
    });

    // Percentage label
    const cfPct = document.createElement('div');
    cfPct.style.cssText = 'text-align:center;font-family:var(--font-mono);font-size:0.52rem;color:var(--muted)';
    cfPct.textContent = `${Math.round(crossfader * 100)}% → B`;
    cfSlider.addEventListener('input', () => {
      const v = parseFloat(cfSlider.value);
      cfPct.textContent = v <= 0.01 ? 'Full A' : v >= 0.99 ? 'Full B' : `${Math.round(v * 100)}% → B`;
    });

    cfWrap.append(cfLabels, cfTrack, cfPct);
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

    // ── Manual Scene Edit panel ───────────────────────────────────────────────
    const sceneEditDiv = document.createElement('div');
    sceneEditDiv.className = 'scene-edit-panel';

    const editTitle = document.createElement('div');
    editTitle.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em';
    editTitle.textContent = `Edit Scene ${String.fromCharCode(65 + (state.sceneA ?? 0))} · Trk ${(state.selectedTrackIndex ?? 0) + 1}`;
    sceneEditDiv.append(editTitle);

    const sceneAData = state.project.scenes[state.sceneA ?? 0];
    const SCENE_PARAMS = [
      { label: 'Cutoff', param: 'cutoff',     min: 80,   max: 16000, step: 10   },
      { label: 'Decay',  param: 'decay',       min: 0.01, max: 2,     step: 0.01 },
      { label: 'Delay',  param: 'delaySend',   min: 0,    max: 1,     step: 0.01 },
      { label: 'Pitch',  param: 'pitch',       min: 0,    max: 127,   step: 1    },
      { label: 'Vol',    param: 'volume',      min: 0,    max: 1,     step: 0.01 },
    ];
    const trackData = sceneAData?.tracks?.[state.selectedTrackIndex] ?? {};
    SCENE_PARAMS.forEach(({ label, param, min, max, step }) => {
      const val = trackData[param] ?? min;
      const row = document.createElement('div');
      row.className = 'plock-row';
      row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span>${Number(val).toFixed(step < 1 ? 2 : 0)}</span>`;
      const input = row.querySelector('input');
      const span  = row.querySelector('span');
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        span.textContent = v.toFixed(step < 1 ? 2 : 0);
        if (!sceneAData.tracks) sceneAData.tracks = Array(8).fill(null).map(() => ({}));
        if (!sceneAData.tracks[state.selectedTrackIndex]) sceneAData.tracks[state.selectedTrackIndex] = {};
        sceneAData.tracks[state.selectedTrackIndex][param] = v;
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });
      sceneEditDiv.append(row);
    });
    container.append(sceneEditDiv);

    // ── Auto-Morph bar ────────────────────────────────────────────────────────
    const morphDiv = document.createElement('div');
    morphDiv.className = 'scene-morph-bar';
    morphDiv.innerHTML = `
      <label>Auto-Morph</label>
      <input type="number" min="1" max="32" value="${state.sceneMorphBars ?? 4}" style="width:40px" title="Bars">
      <button class="seq-btn ${state.sceneMorphActive ? 'active' : ''}" id="morph-btn">
        ${state.sceneMorphActive ? '&#9646; Stop' : '&#9654; Morph'}
      </button>
    `;
    const morphBarsInput = morphDiv.querySelector('input');
    morphBarsInput.addEventListener('change', () => {
      state.sceneMorphBars = parseInt(morphBarsInput.value) || 4;
    });
    morphDiv.querySelector('#morph-btn').addEventListener('click', () => {
      state.sceneMorphActive = !state.sceneMorphActive;
      if (state.sceneMorphActive) state.crossfade = 0; // reset to start
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    container.append(morphDiv);
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
