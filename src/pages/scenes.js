// src/pages/scenes.js — Scene slots, crossfader, snapshot
import { getActivePattern, getActiveTrack } from '../state.js';

const INTERP_PARAMS = ['cutoff', 'decay', 'delaySend', 'pitch', 'volume'];
const SCENE_PARAMS_LIST = INTERP_PARAMS;
const PARAM_LABELS = ['Cut', 'Dec', 'Dly', 'Pit', 'Vol'];

export default {
  render(container, state, emit) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';

    const { scenes, crossfader, sceneA, sceneB, selectedTrackIndex } = state;
    const activePattern = getActivePattern(state);

    function rerenderScenes() {
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    }

    function cloneScenePayload(sceneIdx) {
      const scene = state.project.scenes[sceneIdx] ?? {};
      return JSON.parse(JSON.stringify({
        ...scene,
        tracks: scene.tracks ?? [],
      }));
    }

    function copyScene(sourceIdx, targetIdx) {
      state.project.scenes[targetIdx] = cloneScenePayload(sourceIdx);
      state.scenes[targetIdx] = state.project.scenes[targetIdx];
      rerenderScenes();
    }

    function clearScene(sceneIdx) {
      const fallback = scenes[sceneIdx];
      state.project.scenes[sceneIdx] = {
        name: fallback?.name || `Scene ${String.fromCharCode(65 + sceneIdx)}`,
        tracks: Array.from({ length: activePattern.kit.tracks.length }, () => ({})),
        noInterp: [],
      };
      state.scenes[sceneIdx] = state.project.scenes[sceneIdx];
      rerenderScenes();
    }

    function applySceneToLive(sceneIdx, mode = 'track') {
      const sourceScene = state.project.scenes[sceneIdx];
      if (!sourceScene?.tracks) return;
      if (mode === 'all') {
        activePattern.kit.tracks.forEach((track, ti) => {
          Object.assign(track, sourceScene.tracks[ti] ?? {});
        });
      } else {
        Object.assign(getActiveTrack(state), sourceScene.tracks[selectedTrackIndex] ?? {});
      }
      rerenderScenes();
    }

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Scenes</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">
        A=${String.fromCharCode(65 + sceneA)} B=${String.fromCharCode(65 + sceneB)}
        &bull; crossfade ${Math.round(crossfader * 100)}%
      </span>`;

    // CHAIN SCENES toggle
    const chainBtn = document.createElement('button');
    chainBtn.className = 'seq-btn' + (state.sceneChainEnabled ? ' active' : '');
    chainBtn.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;margin-left:auto';
    chainBtn.title = 'Auto-advance through scenes every N bars';

    const chainBarsInput = document.createElement('input');
    chainBarsInput.type = 'number';
    chainBarsInput.min = 1;
    chainBarsInput.max = 64;
    chainBarsInput.value = state.sceneChainBars ?? 4;
    chainBarsInput.style.cssText = 'width:32px;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--screen-text);font-family:var(--font-mono);font-size:0.52rem;text-align:center;outline:none';
    chainBarsInput.title = 'Bars per scene';
    chainBarsInput.addEventListener('click', e => e.stopPropagation());
    chainBarsInput.addEventListener('change', () => {
      state.sceneChainBars = Math.max(1, Math.min(64, parseInt(chainBarsInput.value) || 4));
    });

    chainBtn.textContent = state.sceneChainEnabled ? '\u25A0 CHAIN' : '\u25BA CHAIN';
    chainBtn.addEventListener('click', () => {
      emit('state:change', { path: 'sceneChainEnabled', value: !state.sceneChainEnabled });
    });

    header.append(chainBtn, chainBarsInput);
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
      const sceneCard = document.createElement('div');
      sceneCard.style.cssText = 'display:flex;flex-direction:column;gap:2px;position:relative';

      const btn = document.createElement('button');
      btn.className = 'scene-btn';
      const letter = String.fromCharCode(65 + si);
      const displayName = scene.name || `Scene ${letter}`;
      btn.innerHTML = `<strong>${letter}</strong><span>${displayName}</span>`;
      btn.title = `Scene slot ${si + 1} (${letter})`;
      const capturedCount = (state.project.scenes[si]?.tracks ?? []).filter(trackData =>
        trackData && Object.keys(trackData).length > 0
      ).length;
      const noInterpCount = state.project.scenes[si]?.noInterp?.length ?? 0;
      const meta = document.createElement('div');
      meta.style.cssText = 'display:flex;gap:4px;justify-content:center;margin-top:2px;font-family:var(--font-mono);font-size:0.42rem;color:var(--muted)';
      meta.innerHTML = `
        <span>${capturedCount}/8</span>
        ${state.project.scenes[si]?.bpm ? `<span>${Math.round(state.project.scenes[si].bpm)}BPM</span>` : ''}
        ${noInterpCount ? `<span>${noInterpCount} snap</span>` : ''}
      `;

      if (si === sceneA) btn.style.borderColor = 'rgba(240,198,64,0.7)';
      if (si === sceneB) btn.style.borderColor = 'rgba(90,221,113,0.7)';

      // ── Task 3: Scene "sit modified" highlight ─────────────────────────────
      // Hook point: if state._scenesModified is a Set of scene indices that have
      // unsaved/live-modified params, we apply a subtle glow to those cards.
      // state._scenesModified is expected to be populated by the audio engine or
      // state reducer whenever a param is edited in a scene without a new snapshot.
      if (state._scenesModified instanceof Set && state._scenesModified.has(si)) {
        btn.style.boxShadow = '0 0 8px 2px rgba(255,200,0,0.25)';
        btn.title = (btn.title || '') + ' [modified]';
      }

      // ── Feature 1: Scene preview on hover ──────────────────────────────────
      btn.addEventListener('mouseenter', () => {
        const previewScene = state.project.scenes[si];
        if (!previewScene?.tracks) return;
        const trackData = previewScene.tracks[state.selectedTrackIndex];
        if (!trackData) return;
        const track = getActiveTrack(state);
        state._scenePreview = { scene: si, prev: { ...track } };
        Object.assign(track, trackData);
      });

      btn.addEventListener('mouseleave', () => {
        if (state._scenePreview) {
          const track = getActiveTrack(state);
          Object.assign(track, state._scenePreview.prev);
          state._scenePreview = null;
        }
      });

      // ── Feature 3: Double-click to rename ──────────────────────────────────
      let _sceneEditTimeout;
      btn.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        clearTimeout(_sceneEditTimeout);
        const currentName = state.project.scenes[si]?.name || `Scene ${letter}`;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.style.cssText = 'width:60px;background:transparent;border:none;border-bottom:1px solid var(--accent);color:var(--screen-text);font-family:var(--font-mono);font-size:0.55rem;outline:none';
        btn.innerHTML = '';
        btn.append(input);
        input.focus();
        input.select();
        const save = () => {
          const name = input.value.trim() || currentName;
          if (!state.project.scenes[si]) state.project.scenes[si] = {};
          state.project.scenes[si].name = name;
          // Also sync top-level scenes array
          if (state.scenes[si]) state.scenes[si].name = name;
          emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { save(); input.blur(); }
          if (e.key === 'Escape') input.blur();
          e.stopPropagation();
        });
      });

      btn.addEventListener('click', () => {
        // First click = set A, second click on different = set B
        if (sceneA === si) {
          emit('state:change', { path: 'sceneB', value: si });
        } else {
          emit('state:change', { path: 'sceneA', value: si });
        }
        this.render(container, { ...state, sceneA: si }, emit);
      });

      // ── CAPTURE button: save current live track params into this scene slot ──
      const captureBtn = document.createElement('button');
      captureBtn.className = 'seq-btn';
      captureBtn.textContent = 'CAP';
      captureBtn.title = 'Capture current state into this scene';
      captureBtn.style.cssText = 'position:absolute;bottom:2px;right:2px;font-size:0.38rem;padding:1px 4px;opacity:0.7;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);border-radius:2px;z-index:2';
      captureBtn.addEventListener('click', e => {
        e.stopPropagation();
        const tracks = getActivePattern(state).kit.tracks;
        // Write into state.scenes[si].tracks (used by interpolateScenes)
        tracks.forEach((track, ti) => {
          if (scenes[si] && scenes[si].tracks) {
            scenes[si].tracks[ti] = {
              cutoff: track.cutoff, decay: track.decay, delaySend: track.delaySend,
              pitch: track.pitch, volume: track.volume,
            };
          }
        });
        // Also write extended params into state.project.scenes[si]
        const CAPTURE_PARAMS = ['volume', 'pan', 'cutoff', 'resonance', 'attack', 'decay',
                                'sustain', 'release', 'reverbSend', 'delaySend', 'pitch'];
        if (!state.project.scenes[si]) state.project.scenes[si] = {};
        state.project.scenes[si].tracks = tracks.map(track => {
          const captured = {};
          CAPTURE_PARAMS.forEach(p => { if (track[p] !== undefined) captured[p] = track[p]; });
          return captured;
        });
        state.project.scenes[si].bpm = state.bpm;
        state.project.scenes[si].swing = state.swing;
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        // Flash the card
        sceneCard.style.outline = '2px solid var(--accent)';
        setTimeout(() => { sceneCard.style.outline = ''; }, 500);
      });

      btn.style.position = 'relative';
      btn.append(captureBtn);
      sceneCard.append(btn, meta);
      sceneGrid.append(sceneCard);
    });
    container.append(sceneGrid);

    // Snapshot + param display
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;gap:8px;flex:1;min-height:0';

    const snapCard = document.createElement('div');
    snapCard.className = 'page-card';
    snapCard.style.cssText = 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px';
    snapCard.innerHTML = '<h4>Snapshot</h4>';

    // Helper: briefly flash the scene slot button in the grid to confirm a snap
    function flashSceneSlot(slotIdx) {
      const btns = sceneGrid.querySelectorAll('.scene-btn');
      const target = btns[slotIdx];
      if (!target) return;
      target.classList.add('scene-snap-confirm');
      setTimeout(() => target.classList.remove('scene-snap-confirm'), 300);
    }

    const snapBtn = document.createElement('button');
    snapBtn.className = 'screen-btn';
    snapBtn.textContent = 'Snapshot \u2192 A';
    snapBtn.style.cssText = 'margin-bottom:4px';
    snapBtn.addEventListener('click', () => {
      emit('state:change', { path: 'action_snapshot', value: { sceneIdx: sceneA, trackIdx: selectedTrackIndex } });
      flashSceneSlot(sceneA);
    });

    const snapBBtn = document.createElement('button');
    snapBBtn.className = 'screen-btn';
    snapBBtn.textContent = 'Snapshot \u2192 B';
    snapBBtn.addEventListener('click', () => {
      emit('state:change', { path: 'action_snapshot', value: { sceneIdx: sceneB, trackIdx: selectedTrackIndex } });
      flashSceneSlot(sceneB);
    });

    const sceneToolGrid = document.createElement('div');
    sceneToolGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px';

    const makeSceneTool = (label, onClick, title = label) => {
      const btn = document.createElement('button');
      btn.className = 'seq-btn';
      btn.textContent = label;
      btn.title = title;
      btn.addEventListener('click', onClick);
      return btn;
    };

    sceneToolGrid.append(
      makeSceneTool('A → B', () => copyScene(sceneA, sceneB), 'Copy Scene A into Scene B'),
      makeSceneTool('B → A', () => copyScene(sceneB, sceneA), 'Copy Scene B into Scene A'),
      makeSceneTool('Apply A', () => applySceneToLive(sceneA, 'track'), 'Apply Scene A to selected track'),
      makeSceneTool('Apply B', () => applySceneToLive(sceneB, 'track'), 'Apply Scene B to selected track'),
      makeSceneTool('Apply All A', () => applySceneToLive(sceneA, 'all'), 'Apply Scene A to all tracks'),
      makeSceneTool('Swap', () => {
        const temp = cloneScenePayload(sceneA);
        state.project.scenes[sceneA] = cloneScenePayload(sceneB);
        state.project.scenes[sceneB] = temp;
        state.scenes[sceneA] = state.project.scenes[sceneA];
        state.scenes[sceneB] = state.project.scenes[sceneB];
        rerenderScenes();
      }, 'Swap the full contents of Scenes A and B'),
      makeSceneTool('Clear A', () => clearScene(sceneA), 'Clear the captured data in Scene A'),
      makeSceneTool('Clear B', () => clearScene(sceneB), 'Clear the captured data in Scene B'),
    );

    snapCard.append(snapBtn, snapBBtn, sceneToolGrid);
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

    // ── Feature 2: Full interpolation table (all 8 tracks × 5 params) ────────
    const interpTable = document.createElement('div');
    interpTable.className = 'scene-interp-table';

    // noInterp list for selected scene A
    const selectedSceneIdx = state.sceneA ?? 0;
    const projectScene = state.project?.scenes?.[selectedSceneIdx];
    const noInterpList = projectScene?.noInterp ?? [];

    // Header row — add Interp? column per param
    const headerRow = document.createElement('div');
    headerRow.className = 'sit-row';
    headerRow.innerHTML = '<span class="sit-cell sit-label">T</span>' +
      PARAM_LABELS.map((l, pi) => {
        const param = INTERP_PARAMS[pi];
        const isNoInterp = noInterpList.includes(param);
        return `<span class="sit-cell sit-head sit-param-head" data-param="${param}">
          ${l}<br><input type="checkbox" class="sit-interp-chk" data-param="${param}"
            ${isNoInterp ? '' : 'checked'}
            title="Interpolate ${param}">
        </span>`;
      }).join('');
    // Wire checkbox events on header
    headerRow.querySelectorAll('.sit-interp-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        emit('state:change', {
          path: 'scene_noInterp',
          value: { sceneIdx: selectedSceneIdx, param: chk.dataset.param, checked: !chk.checked },
        });
      });
    });
    interpTable.append(headerRow);

    // Data rows — one per track
    const pat = getActivePattern(state);
    pat.kit.tracks.forEach((trk, ti) => {
      const sceneAObj = state.project.scenes[state.sceneA ?? 0];
      const sceneBObj = state.project.scenes[state.sceneB ?? 1];
      const xf = state.crossfader ?? 0;
      const row = document.createElement('div');
      row.className = 'sit-row' + (ti === state.selectedTrackIndex ? ' sit-selected' : '');
      row.innerHTML = `<span class="sit-cell sit-label">T${ti + 1}</span>` +
        SCENE_PARAMS_LIST.map(param => {
          const a = sceneAObj?.tracks?.[ti]?.[param] ?? trk[param] ?? 0;
          const b = sceneBObj?.tracks?.[ti]?.[param] ?? trk[param] ?? 0;
          const isNoInterp = noInterpList.includes(param);
          const v = isNoInterp ? (xf < 0.5 ? a : b) : a + (b - a) * xf;
          // Mark as modified if the scene-A value deviates from the track's own live default
          const trackDefault = trk[param] ?? 0;
          const aStored = sceneAObj?.tracks?.[ti]?.[param];
          const isModified = aStored !== undefined && Math.abs(aStored - trackDefault) > 1e-6;
          let cls = 'sit-cell';
          if (isNoInterp) cls += ' sit-snap';
          if (isModified) cls += ' sit-modified';
          return `<span class="${cls}">${typeof v === 'number' ? v.toFixed(1) : '--'}</span>`;
        }).join('');
      interpTable.append(row);
    });
    valCard.append(interpTable);

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
    const sceneBData = state.project.scenes[state.sceneB ?? 1];
    const trackDataB = sceneBData?.tracks?.[state.selectedTrackIndex] ?? {};
    SCENE_PARAMS.forEach(({ label, param, min, max, step }) => {
      const val = trackData[param] ?? min;
      const row = document.createElement('div');
      row.className = 'plock-row scene-param-row';

      // Task 1: diff highlight — compare scene A vs scene B for this param
      const valA = trackData[param];
      const valB = trackDataB[param];
      const hasBoth = valA !== undefined && valB !== undefined;
      if (hasBoth && Math.abs(valA - valB) > 1e-9) {
        row.dataset.diff = 'true';
      }

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

    // ── Compact morph/crossfade row ───────────────────────────────────────────
    const morphXfadeRow = document.createElement('div');
    morphXfadeRow.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px 0;border-top:1px solid var(--border);flex-shrink:0';

    // Auto-Morph button + bars input
    const morphBtn = document.createElement('button');
    morphBtn.className = 'seq-btn' + (state.sceneMorphActive ? ' active' : '');
    morphBtn.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;padding:2px 5px;flex-shrink:0';
    morphBtn.textContent = state.sceneMorphActive ? '\u25A0 Stop' : '\u25BA Morph';
    morphBtn.addEventListener('click', () => {
      state.sceneMorphActive = !state.sceneMorphActive;
      if (state.sceneMorphActive) state.crossfader = 0;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });

    const morphBarsInput = document.createElement('input');
    morphBarsInput.type = 'number';
    morphBarsInput.min = 1; morphBarsInput.max = 32;
    morphBarsInput.value = state.sceneMorphBars ?? 4;
    morphBarsInput.title = 'Bars';
    morphBarsInput.style.cssText = 'width:32px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 3px;font-family:var(--font-mono);font-size:0.48rem;flex-shrink:0';
    morphBarsInput.addEventListener('change', () => {
      state.sceneMorphBars = parseInt(morphBarsInput.value) || 4;
    });

    // Curve buttons
    const currentCurve = state.morphCurve ?? 'linear';
    ['linear', 'ease', 'bounce'].forEach(curve => {
      const btn = document.createElement('button');
      btn.className = 'curve-btn' + (currentCurve === curve ? ' active' : '');
      btn.textContent = curve.charAt(0).toUpperCase() + curve.slice(1);
      btn.dataset.curve = curve;
      btn.style.cssText = 'font-family:var(--font-mono);font-size:0.44rem;padding:2px 4px;flex-shrink:0';
      btn.addEventListener('click', () => {
        emit('state:change', { path: 'morphCurve', value: curve });
      });
      morphXfadeRow.append(btn);
    });

    // A↔B xfade slider
    const xfadeLabel = document.createElement('span');
    xfadeLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.44rem;color:var(--muted);flex-shrink:0';
    xfadeLabel.textContent = 'A\u2194B';

    const xfadeSlider = document.createElement('input');
    xfadeSlider.type = 'range';
    xfadeSlider.min = '0'; xfadeSlider.max = '1'; xfadeSlider.step = '0.01';
    xfadeSlider.value = String(state._sceneXfade ?? 0);
    xfadeSlider.style.cssText = 'flex:1;min-width:0';

    xfadeSlider.addEventListener('input', () => {
      const t = parseFloat(xfadeSlider.value);
      state._sceneXfade = t;
      xfadeLabel.textContent = `A\u2194B ${Math.round(t * 100)}%`;
      emit('state:change', { param: 'sceneXfade', value: t });
    });

    // Rec XFade button
    const xfRecBtn = document.createElement('button');
    xfRecBtn.className = 'seq-btn' + (state.xfRecording ? ' active' : '');
    xfRecBtn.textContent = state.xfRecording ? '● REC' : '○ REC';
    xfRecBtn.style.cssText = 'font-family:var(--font-mono);font-size:0.44rem;padding:2px 4px;flex-shrink:0' + (state.xfRecording ? ';color:var(--live)' : '');
    xfRecBtn.addEventListener('click', () => {
      state.xfRecording = !state.xfRecording;
      if (state.xfRecording) {
        state.xfadeAutomation = [];
      }
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });

    morphXfadeRow.prepend(morphBtn, morphBarsInput);
    morphXfadeRow.append(xfadeLabel, xfadeSlider, xfRecBtn);
    container.append(morphXfadeRow);

    // Morph progress mini-bar
    const morphPreviewBar = document.createElement('div');
    morphPreviewBar.style.cssText = 'height:3px;background:rgba(255,255,255,0.08);border-radius:2px;position:relative;overflow:hidden;flex-shrink:0';
    const morphFill = document.createElement('div');
    morphFill.style.cssText = 'position:absolute;left:0;top:0;height:100%;background:var(--accent);border-radius:2px;width:0%;transition:none';
    morphPreviewBar.append(morphFill);
    container.append(morphPreviewBar);

    // Animate fill using state._morphProgress
    function animateMorph() {
      const t = state._morphProgress ?? 0;
      morphFill.style.width = `${Math.round(t * 100)}%`;
      if (container.isConnected) requestAnimationFrame(animateMorph);
    }
    animateMorph();

    // XFade automation playback indicator
    if (!state.xfRecording && state.xfadeAutomation?.length > 0) {
      const xfPlaybackInfo = document.createElement('div');
      xfPlaybackInfo.style.cssText = 'font-family:var(--font-mono);font-size:0.44rem;color:var(--muted)';
      xfPlaybackInfo.textContent = `XF auto: ${state.xfadeAutomation.length} steps`;
      container.append(xfPlaybackInfo);
    }
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
