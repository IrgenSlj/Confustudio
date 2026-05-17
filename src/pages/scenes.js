// src/pages/scenes.js — Scene slots, crossfader, snapshot
import { getActivePattern, getActiveTrack, TRACK_COLORS } from '../state.js';

const INTERP_PARAMS = ['cutoff', 'decay', 'delaySend', 'pitch', 'volume'];
const SCENE_PARAMS_LIST = INTERP_PARAMS;
const PARAM_LABELS = ['Cut', 'Dec', 'Dly', 'Pit', 'Vol'];

export default {
  render(container, state, emit) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';

    const { scenes, crossfader, sceneA, sceneB, selectedTrackIndex } = state;
    const activePattern = getActivePattern(state);
    const executeCommands = (commands, label) => {
      if (window.confustudioCommands?.execute) {
        return window.confustudioCommands.execute(commands, label);
      }
      return null;
    };

    function rerenderScenes() {
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    }

    function cloneScenePayload(sceneIdx) {
      const scene = state.project.scenes[sceneIdx] ?? {};
      return JSON.parse(
        JSON.stringify({
          ...scene,
          tracks: scene.tracks ?? [],
        }),
      );
    }

    function copyScene(sourceIdx, targetIdx) {
      const copied = cloneScenePayload(sourceIdx);
      if (
        !executeCommands(
          { type: 'set-scene-payload', sceneIndex: targetIdx, scene: copied },
          `Scene ${String.fromCharCode(65 + targetIdx)} updated`,
        )
      ) {
        state.project.scenes[targetIdx] = copied;
        state.scenes[targetIdx] = state.project.scenes[targetIdx];
        rerenderScenes();
      }
    }

    function clearScene(sceneIdx) {
      const fallback = scenes[sceneIdx];
      const nextScene = {
        name: fallback?.name || `Scene ${String.fromCharCode(65 + sceneIdx)}`,
        tracks: Array.from({ length: activePattern.kit.tracks.length }, () => ({})),
        noInterp: [],
      };
      if (
        !executeCommands(
          { type: 'set-scene-payload', sceneIndex: sceneIdx, scene: nextScene },
          `Scene ${String.fromCharCode(65 + sceneIdx)} cleared`,
        )
      ) {
        state.project.scenes[sceneIdx] = nextScene;
        state.scenes[sceneIdx] = state.project.scenes[sceneIdx];
        rerenderScenes();
      }
    }

    function applySceneToLive(sceneIdx, mode = 'track') {
      if (
        !executeCommands(
          {
            type: 'apply-scene',
            sceneIndex: sceneIdx,
            mode,
            trackIndex: selectedTrackIndex,
          },
          `Applied Scene ${String.fromCharCode(65 + sceneIdx)}`,
        )
      ) {
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
    chainBarsInput.style.cssText =
      'width:32px;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--screen-text);font-family:var(--font-mono);font-size:0.52rem;text-align:center;outline:none';
    chainBarsInput.title = 'Bars per scene';
    chainBarsInput.addEventListener('click', (e) => e.stopPropagation());
    chainBarsInput.addEventListener('change', () => {
      state.sceneChainBars = Math.max(1, Math.min(64, parseInt(chainBarsInput.value) || 4));
    });

    chainBtn.textContent = state.sceneChainEnabled ? '\u25A0 CHAIN' : '\u25BA CHAIN';
    chainBtn.addEventListener('click', () => {
      emit('state:change', { path: 'sceneChainEnabled', value: !state.sceneChainEnabled });
    });

    header.append(chainBtn, chainBarsInput);
    container.append(header);

    // ── Crossfader (improved) ──────────────────────────────────────────────
    const cfWrap = document.createElement('div');
    cfWrap.className = 'scene-xfader-wrap';
    cfWrap.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:6px;flex-shrink:0';

    const sAName = (scenes[sceneA]?.name || `Scene ${String.fromCharCode(65 + sceneA)}`).slice(0, 8);
    const sBName = (scenes[sceneB]?.name || `Scene ${String.fromCharCode(65 + sceneB)}`).slice(0, 8);

    const cfLblA = document.createElement('span');
    cfLblA.className = 'scene-xfader-lbl scene-xfader-lbl-a';
    cfLblA.textContent = `A: ${sAName}`;

    // Gradient track + slider
    const cfTrackWrap = document.createElement('div');
    cfTrackWrap.style.cssText =
      'flex:1;position:relative;height:10px;border-radius:5px;background:linear-gradient(to right,rgba(240,198,64,0.6),rgba(90,221,113,0.6));border:1px solid rgba(255,255,255,0.1)';

    const cfDot = document.createElement('div');
    cfDot.style.cssText = `position:absolute;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(255,255,255,0.8);left:${crossfader * 100}%;pointer-events:none;transition:left 0.05s`;
    cfTrackWrap.append(cfDot);

    const cfSlider = document.createElement('input');
    cfSlider.type = 'range';
    cfSlider.min = '0';
    cfSlider.max = '1';
    cfSlider.step = '0.01';
    cfSlider.value = String(crossfader);
    cfSlider.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;margin:0';
    cfTrackWrap.append(cfSlider);

    const cfVal = document.createElement('span');
    cfVal.className = 'scene-xfader-val';
    const cfPctText = (v) => (v <= 0.01 ? 'Full A' : v >= 0.99 ? 'Full B' : `${Math.round(v * 100)}%`);
    cfVal.textContent = cfPctText(crossfader);

    const cfLblB = document.createElement('span');
    cfLblB.className = 'scene-xfader-lbl scene-xfader-lbl-b';
    cfLblB.textContent = `${sBName} :B`;

    cfSlider.addEventListener('input', () => {
      const v = parseFloat(cfSlider.value);
      cfDot.style.left = v * 100 + '%';
      cfVal.textContent = cfPctText(v);
      emit('state:change', { path: 'crossfader', value: v });
    });

    cfWrap.append(cfLblA, cfTrackWrap, cfVal, cfLblB);
    container.append(cfWrap);

    // ── Scene grid (4×2 with parameter preview) ──────────────────────────
    const sceneGrid = document.createElement('div');
    sceneGrid.className = 'scene-grid';
    sceneGrid.style.cssText = 'margin-bottom:8px;flex-shrink:0';

    scenes.forEach((scene, si) => {
      const letter = String.fromCharCode(65 + si);
      const projectScene = state.project.scenes[si];
      const hasData = projectScene?.tracks && projectScene.tracks.some((t) => t && Object.keys(t).length > 0);

      const card = document.createElement('div');
      card.className = [
        'scene-card',
        si === sceneA ? 'scene-ab-a' : '',
        si === sceneB ? 'scene-ab-b' : '',
        hasData ? 'scene-captured' : '',
      ]
        .filter(Boolean)
        .join(' ');

      // Modified dot
      if (state._scenesModified instanceof Set && state._scenesModified.has(si)) {
        const dot = document.createElement('div');
        dot.className = 'scene-modified-dot';
        dot.title = 'Modified since last capture';
        card.append(dot);
      }

      // Letter
      const letterEl = document.createElement('div');
      letterEl.className = 'scene-letter';
      letterEl.textContent = letter;
      card.append(letterEl);

      // Name
      const nameEl = document.createElement('div');
      nameEl.className = 'scene-name';
      nameEl.textContent = scene.name || `Scene ${letter}`;
      card.append(nameEl);

      // Parameter preview bars (if captured)
      if (hasData) {
        const previewEl = document.createElement('div');
        previewEl.className = 'scene-preview';
        (projectScene.tracks || []).slice(0, 8).forEach((t, ti) => {
          if (!t || Object.keys(t).length === 0) return;
          const col = TRACK_COLORS[ti % TRACK_COLORS.length];
          const vol = t.volume ?? 0.7;
          const cut = t.cutoff ? Math.min(1, t.cutoff / 8000) : 0.5;
          const barGroup = document.createElement('div');
          barGroup.className = 'scene-track-bar';
          const volBar = document.createElement('div');
          volBar.className = 'scene-vol-bar';
          volBar.style.height = Math.max(2, Math.round(vol * 16)) + 'px';
          volBar.style.background = col;
          const cutBar = document.createElement('div');
          cutBar.className = 'scene-cut-bar';
          cutBar.style.height = Math.max(2, Math.round(cut * 16)) + 'px';
          cutBar.style.background = col + '88';
          barGroup.append(volBar, cutBar);
          previewEl.append(barGroup);
        });
        card.append(previewEl);
      } else {
        const hint = document.createElement('div');
        hint.className = 'scene-empty-hint';
        hint.textContent = 'Click CAP to capture';
        card.append(hint);
      }

      // Footer: cap count + CAP button
      const footer = document.createElement('div');
      footer.className = 'scene-footer';
      const capCount = document.createElement('span');
      capCount.className = 'scene-cap-count';
      capCount.textContent = hasData
        ? projectScene?.bpm
          ? `✓ ${Math.round(projectScene.bpm)}BPM`
          : '✓ captured'
        : '—';
      const captureBtn = document.createElement('button');
      captureBtn.className = 'scene-cap-btn';
      captureBtn.textContent = 'CAP';
      captureBtn.title = 'Capture current state into this scene';
      captureBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tracks = getActivePattern(state).kit.tracks;
        const CAPTURE_PARAMS = [
          'volume',
          'pan',
          'cutoff',
          'resonance',
          'attack',
          'decay',
          'sustain',
          'release',
          'reverbSend',
          'delaySend',
          'pitch',
        ];
        const nextScene = cloneScenePayload(si);
        nextScene.tracks = tracks.map((track) => {
          const captured = {};
          CAPTURE_PARAMS.forEach((p) => {
            if (track[p] !== undefined) captured[p] = track[p];
          });
          return captured;
        });
        nextScene.bpm = state.bpm;
        nextScene.swing = state.swing;
        if (
          !executeCommands({ type: 'set-scene-payload', sceneIndex: si, scene: nextScene }, `Captured Scene ${letter}`)
        ) {
          state.project.scenes[si] = nextScene;
          state.scenes[si] = nextScene;
          emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        }
        card.style.outline = '2px solid var(--accent)';
        setTimeout(() => {
          card.style.outline = '';
        }, 500);
      });
      footer.append(capCount, captureBtn);
      card.append(footer);

      // Hover: live preview + diff tooltip
      const DIFF_PARAMS = ['cutoff', 'decay', 'delaySend', 'pitch', 'volume', 'pan', 'resonance', 'reverbSend'];
      const DIFF_LABELS = {
        cutoff: 'Cut',
        decay: 'Dec',
        delaySend: 'Dly',
        pitch: 'Pit',
        volume: 'Vol',
        pan: 'Pan',
        resonance: 'Res',
        reverbSend: 'Rev',
      };
      function buildDiffTooltip(sceneIdx) {
        const previewScene = state.project.scenes[sceneIdx];
        if (!previewScene?.tracks) return null;
        const sceneTrackData = previewScene.tracks[state.selectedTrackIndex] ?? {};
        const liveTrack = getActiveTrack(state);
        const diffs = [];
        for (const p of DIFF_PARAMS) {
          const sceneVal = sceneTrackData[p];
          if (sceneVal === undefined) continue;
          const liveVal = liveTrack[p] ?? 0;
          if (Math.abs(sceneVal - liveVal) > 1e-6) diffs.push({ param: p, scene: sceneVal, live: liveVal });
          if (diffs.length >= 5) break;
        }
        if (diffs.length === 0) return null;
        const tip = document.createElement('div');
        tip.style.cssText = [
          'position:absolute',
          'z-index:100',
          'left:50%',
          'top:calc(100% + 4px)',
          'transform:translateX(-50%)',
          'min-width:110px',
          'max-width:160px',
          'background:#1a1a1a',
          'border:1px solid rgba(255,255,255,0.15)',
          'border-radius:4px',
          'padding:5px 7px',
          'pointer-events:none',
          'font-family:var(--font-mono)',
          'font-size:0.46rem',
          'color:var(--screen-text)',
          'box-shadow:0 4px 12px rgba(0,0,0,0.6)',
        ].join(';');
        diffs.forEach(({ param, scene, live }) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;gap:6px;margin-bottom:2px';
          const delta = scene - live;
          const arrow = delta > 0 ? '↑' : '↓';
          const color = delta > 0 ? '#5add71' : '#f0a050';
          row.innerHTML = `<span style="color:var(--muted);text-transform:uppercase">${DIFF_LABELS[param] ?? param}</span><span style="color:var(--muted)">${typeof live === 'number' ? live.toFixed(2) : live}</span><span style="color:${color}">${arrow}${typeof scene === 'number' ? scene.toFixed(2) : scene}</span>`;
          tip.append(row);
        });
        return tip;
      }

      let _diffTip = null;
      card.addEventListener('mouseenter', () => {
        const previewScene = state.project.scenes[si];
        if (!previewScene?.tracks) return;
        const trackData = previewScene.tracks[state.selectedTrackIndex];
        if (!trackData) return;
        const track = getActiveTrack(state);
        state._scenePreview = { scene: si, prev: { ...track } };
        Object.assign(track, trackData);
        _diffTip = buildDiffTooltip(si);
        if (_diffTip) card.append(_diffTip);
      });
      card.addEventListener('mouseleave', () => {
        if (state._scenePreview) {
          const track = getActiveTrack(state);
          Object.assign(track, state._scenePreview.prev);
          state._scenePreview = null;
        }
        if (_diffTip) {
          _diffTip.remove();
          _diffTip = null;
        }
      });

      // Double-click to rename
      card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const currentName = state.project.scenes[si]?.name || `Scene ${letter}`;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.style.cssText =
          'width:100%;background:transparent;border:none;border-bottom:1px solid var(--accent);color:var(--screen-text);font-family:var(--font-mono);font-size:0.6rem;outline:none';
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        const save = () => {
          const name = input.value.trim() || currentName;
          if (!executeCommands({ type: 'set-scene-name', sceneIndex: si, name }, `Renamed Scene ${letter}`)) {
            if (!state.project.scenes[si]) state.project.scenes[si] = {};
            state.project.scenes[si].name = name;
            if (state.scenes[si]) state.scenes[si].name = name;
          }
          input.replaceWith(nameEl);
          nameEl.textContent = name;
          emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            save();
            input.blur();
          }
          if (e.key === 'Escape') input.blur();
          e.stopPropagation();
        });
      });

      // Click to set A (or B if already A)
      card.addEventListener('click', () => {
        if (sceneA === si) {
          emit('state:change', { path: 'sceneB', value: si });
        } else {
          emit('state:change', { path: 'sceneA', value: si });
        }
        this.render(container, { ...state, sceneA: si }, emit);
      });

      sceneGrid.append(card);
    });
    container.append(sceneGrid);

    // Helper: flash scene card to confirm snap
    function flashSceneSlot(slotIdx) {
      const cards = sceneGrid.querySelectorAll('.scene-card');
      const target = cards[slotIdx];
      if (!target) return;
      target.classList.add('scene-snap-confirm');
      setTimeout(() => target.classList.remove('scene-snap-confirm'), 300);
    }

    // Snapshot + param display
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;gap:8px;flex:1;min-height:0';

    const snapCard = document.createElement('div');
    snapCard.className = 'page-card';
    snapCard.style.cssText = 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px';
    snapCard.innerHTML = '<h4>Snapshot</h4>';

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
      makeSceneTool(
        'Swap',
        () => {
          if (!executeCommands({ type: 'swap-scenes', sceneA, sceneB }, 'Swapped scenes')) {
            const temp = cloneScenePayload(sceneA);
            state.project.scenes[sceneA] = cloneScenePayload(sceneB);
            state.project.scenes[sceneB] = temp;
            state.scenes[sceneA] = state.project.scenes[sceneA];
            state.scenes[sceneB] = state.project.scenes[sceneB];
            rerenderScenes();
          }
        },
        'Swap the full contents of Scenes A and B',
      ),
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

    INTERP_PARAMS.forEach((param) => {
      const a = tA[param] ?? 0;
      const b = tB[param] ?? 0;
      const cv = a + (b - a) * crossfader;
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;font-family:var(--font-mono);font-size:0.6rem';
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
    headerRow.innerHTML =
      '<span class="sit-cell sit-label">T</span>' +
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
    headerRow.querySelectorAll('.sit-interp-chk').forEach((chk) => {
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
      row.innerHTML =
        `<span class="sit-cell sit-label">T${ti + 1}</span>` +
        SCENE_PARAMS_LIST.map((param) => {
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
    editTitle.style.cssText =
      'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em';
    editTitle.textContent = `Edit Scene ${String.fromCharCode(65 + (state.sceneA ?? 0))} · Trk ${(state.selectedTrackIndex ?? 0) + 1}`;
    sceneEditDiv.append(editTitle);

    const sceneAData = state.project.scenes[state.sceneA ?? 0];
    const SCENE_PARAMS = [
      { label: 'Cutoff', param: 'cutoff', min: 80, max: 16000, step: 10 },
      { label: 'Decay', param: 'decay', min: 0.01, max: 2, step: 0.01 },
      { label: 'Delay', param: 'delaySend', min: 0, max: 1, step: 0.01 },
      { label: 'Pitch', param: 'pitch', min: 0, max: 127, step: 1 },
      { label: 'Vol', param: 'volume', min: 0, max: 1, step: 0.01 },
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
      const span = row.querySelector('span');
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        span.textContent = v.toFixed(step < 1 ? 2 : 0);
        if (!sceneAData.tracks)
          sceneAData.tracks = Array(8)
            .fill(null)
            .map(() => ({}));
        if (!sceneAData.tracks[state.selectedTrackIndex]) sceneAData.tracks[state.selectedTrackIndex] = {};
        sceneAData.tracks[state.selectedTrackIndex][param] = v;
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });
      sceneEditDiv.append(row);
    });
    container.append(sceneEditDiv);

    // ── Compact morph/crossfade row ───────────────────────────────────────────
    const morphXfadeRow = document.createElement('div');
    morphXfadeRow.style.cssText =
      'display:flex;gap:6px;align-items:center;padding:4px 0;border-top:1px solid var(--border);flex-shrink:0';

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
    morphBarsInput.min = 1;
    morphBarsInput.max = 32;
    morphBarsInput.value = state.sceneMorphBars ?? 4;
    morphBarsInput.title = 'Bars';
    morphBarsInput.style.cssText =
      'width:32px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 3px;font-family:var(--font-mono);font-size:0.48rem;flex-shrink:0';
    morphBarsInput.addEventListener('change', () => {
      state.sceneMorphBars = parseInt(morphBarsInput.value) || 4;
    });

    // Curve buttons
    const currentCurve = state.morphCurve ?? 'linear';
    ['linear', 'ease', 'bounce'].forEach((curve) => {
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
    xfadeSlider.min = '0';
    xfadeSlider.max = '1';
    xfadeSlider.step = '0.01';
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
    xfRecBtn.style.cssText =
      'font-family:var(--font-mono);font-size:0.44rem;padding:2px 4px;flex-shrink:0' +
      (state.xfRecording ? ';color:var(--live)' : '');
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
    morphPreviewBar.style.cssText =
      'height:3px;background:rgba(255,255,255,0.08);border-radius:2px;position:relative;overflow:hidden;flex-shrink:0';
    const morphFill = document.createElement('div');
    morphFill.style.cssText =
      'position:absolute;left:0;top:0;height:100%;background:var(--accent);border-radius:2px;width:0%;transition:none';
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
    { label: 'X-Fade', param: 'crossfader', min: 0, max: 1, step: 0.01 },
    { label: 'SceneA', param: 'sceneA', min: 0, max: 7, step: 1 },
    { label: 'SceneB', param: 'sceneB', min: 0, max: 7, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
  ],

  keyboardContext: 'scenes',
};
