// src/pages/arranger.js — Section list, arrangement mode toggle

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const { arranger, arrangementMode, arrangementCursor, scenes, isPlaying } = state;
    const activeSectionIdx = (arrangementMode && isPlaying) ? (state._arrSection ?? 0) : -1;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Arranger</span>`;

    const modeBtn = document.createElement('button');
    modeBtn.className = 'ctx-btn' + (arrangementMode ? ' active' : '');
    modeBtn.textContent = arrangementMode ? 'Arrange' : 'Loop';
    modeBtn.addEventListener('click', () => {
      emit('state:change', { path: 'arrangementMode', value: !arrangementMode });
      modeBtn.classList.toggle('active');
      modeBtn.textContent = !arrangementMode ? 'Arrange' : 'Loop';
    });
    header.append(modeBtn);
    container.append(header);

    // Section list
    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;min-height:0';

    if (arranger.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-family:var(--font-mono);font-size:0.62rem;color:var(--muted);padding:16px;text-align:center';
      empty.textContent = 'No sections. Add a section to start arranging.';
      list.append(empty);
    }

    arranger.forEach((section, idx) => {
      const row = document.createElement('div');
      row.className = 'arr-row';
      row.style.cssText = `
        display:flex;align-items:center;gap:8px;padding:6px 8px;
        border-radius:5px;border:1px solid var(--border);background:#141414;
      `;
      if (idx === arrangementCursor) {
        row.style.borderColor = 'rgba(240,91,82,0.5)';
        row.style.background  = 'rgba(240,91,82,0.05)';
      }
      if (idx === activeSectionIdx) {
        row.classList.add('active');
        row.style.borderColor = 'rgba(90,221,113,0.6)';
        row.style.background  = 'rgba(90,221,113,0.06)';
      }

      // Drag-to-reorder
      row.draggable = true;
      row.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', idx);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        if (fromIdx === idx) return;
        const sections = state.arranger;
        const [moved] = sections.splice(fromIdx, 1);
        sections.splice(idx, 0, moved);
        emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
      });

      const sceneLabel = document.createElement('span');
      sceneLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.65rem;color:var(--accent);min-width:24px';
      sceneLabel.textContent   = String.fromCharCode(65 + (section.sceneIdx ?? 0));

      const sceneName = document.createElement('input');
      sceneName.type = 'text';
      sceneName.value = section.name || (scenes[section.sceneIdx] && scenes[section.sceneIdx].name) || '—';
      sceneName.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);flex:1;background:transparent;border:none;outline:none;padding:0;min-width:0';
      sceneName.addEventListener('change', () => {
        state.arranger.sections
          ? (state.arranger.sections[idx].name = sceneName.value)
          : (arranger[idx].name = sceneName.value);
        emit('state:change', { path: 'arranger', value: state.arranger ?? arranger });
      });
      sceneName.addEventListener('focus', () => { sceneName.style.color = 'var(--screen-text)'; sceneName.select(); });
      sceneName.addEventListener('blur',  () => { sceneName.style.color = 'var(--muted)'; });

      const barsLabel = document.createElement('span');
      barsLabel.style.cssText  = 'font-family:var(--font-mono);font-size:0.62rem;color:var(--screen-text);min-width:32px;text-align:right';
      barsLabel.textContent    = `${section.bars ?? 1}B`;

      // Bar count +/-
      const minusBtn = document.createElement('button');
      minusBtn.className    = 'bpm-arrow';
      minusBtn.textContent  = '−';
      minusBtn.addEventListener('click', () => {
        const newBars = Math.max(1, (section.bars ?? 1) - 1);
        emit('state:change', { path: `arranger[${idx}].bars`, value: newBars });
        barsLabel.textContent = `${newBars}B`;
      });

      const plusBtn = document.createElement('button');
      plusBtn.className    = 'bpm-arrow';
      plusBtn.textContent  = '+';
      plusBtn.addEventListener('click', () => {
        const newBars = Math.min(64, (section.bars ?? 1) + 1);
        emit('state:change', { path: `arranger[${idx}].bars`, value: newBars });
        barsLabel.textContent = `${newBars}B`;
      });

      // Move up/down (secondary — drag-to-reorder is preferred)
      const upBtn = document.createElement('button');
      upBtn.className = 'bpm-arrow';
      upBtn.textContent = '↑';
      upBtn.disabled = idx === 0;
      upBtn.style.cssText = `opacity:${idx === 0 ? '0.2' : '0.45'};font-size:0.55rem;padding:1px 4px`;
      upBtn.title = 'Move up';
      upBtn.addEventListener('click', () =>
        emit('state:change', { path: 'action_arrMoveUp', value: idx })
      );

      const dnBtn = document.createElement('button');
      dnBtn.className = 'bpm-arrow';
      dnBtn.textContent = '↓';
      dnBtn.disabled = idx === arranger.length - 1;
      dnBtn.style.cssText = `opacity:${idx === arranger.length - 1 ? '0.2' : '0.45'};font-size:0.55rem;padding:1px 4px`;
      dnBtn.title = 'Move down';
      dnBtn.addEventListener('click', () =>
        emit('state:change', { path: 'action_arrMoveDown', value: idx })
      );

      const delBtn = document.createElement('button');
      delBtn.className = 'seq-btn';
      delBtn.textContent = '✕';
      delBtn.style.padding = '4px 6px';
      delBtn.addEventListener('click', () =>
        emit('state:change', { path: 'action_arrRemove', value: idx })
      );

      row.append(sceneLabel, sceneName, barsLabel, minusBtn, plusBtn, upBtn, dnBtn, delBtn);
      list.append(row);
    });

    // ── Visual timeline ──────────────────────────────────────────────────────
    const SCENE_COLORS = [
      '#f0c640','#5add71','#67d7ff','#ff8c52','#c67dff','#ff6eb4','#40e0d0','#f05b52'
    ];
    const totalBarsAll = arranger.reduce((s, sec) => s + (sec.bars ?? 1), 0) || 1;

    const timeline = document.createElement('div');
    timeline.style.cssText = `
      display:flex; align-items:stretch; gap:2px;
      height:38px; margin-bottom:8px; flex-shrink:0;
      background:rgba(0,0,0,0.2); border-radius:5px; padding:3px; overflow:hidden;
    `;

    arranger.forEach((section, idx) => {
      const block = document.createElement('div');
      const widthPct = ((section.bars ?? 1) / totalBarsAll * 100).toFixed(1);
      const color = SCENE_COLORS[section.sceneIdx % SCENE_COLORS.length];
      const isActive = idx === arrangementCursor;
      block.style.cssText = `
        flex: 0 0 ${widthPct}%;
        min-width: 18px;
        background: ${color}${isActive ? 'ff' : '55'};
        border: 1px solid ${color}${isActive ? 'ff' : '88'};
        border-radius: 3px;
        display:flex; align-items:center; justify-content:center;
        font-family:var(--font-mono); font-size:0.5rem;
        color:${isActive ? '#000' : color};
        font-weight:600;
        cursor:pointer;
        overflow:hidden; white-space:nowrap;
        transition: all 0.1s;
      `;
      block.title = `${String.fromCharCode(65 + (section.sceneIdx ?? 0))} — ${section.bars}B`;
      block.textContent = `${String.fromCharCode(65 + (section.sceneIdx ?? 0))}`;
      block.addEventListener('click', () => {
        emit('state:change', { path: 'arrangementCursor', value: idx });
      });
      timeline.append(block);
    });

    if (arranger.length === 0) {
      timeline.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">Empty — add sections below</div>`;
    }

    // Pulsing playhead cursor overlaid on the timeline
    if (activeSectionIdx >= 0 && arranger.length > 0) {
      const barsBefore = arranger.slice(0, activeSectionIdx).reduce((s, sec) => s + (sec.bars ?? 1), 0);
      const sectionBars = arranger[activeSectionIdx]?.bars ?? 1;
      const sectionProgress = state._arrSectionBar != null ? (state._arrSectionBar / sectionBars) : 0;
      const totalBarsForHead = totalBarsAll;
      const playheadPct = ((barsBefore + sectionProgress * sectionBars) / totalBarsForHead * 100).toFixed(2);

      const playhead = document.createElement('div');
      playhead.style.cssText = `
        position:absolute; top:0; bottom:0; width:2px;
        left:${playheadPct}%;
        background:var(--live);
        border-radius:1px;
        animation: arrPlayheadPulse 0.5s ease-in-out infinite alternate;
        pointer-events:none;
        z-index:10;
      `;
      timeline.style.position = 'relative';
      timeline.append(playhead);
    }

    container.append(timeline);

    const timeInfo = document.createElement('div');
    timeInfo.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);margin-bottom:4px;flex-shrink:0';
    const totalBarsVal = arranger.reduce((s, sec) => s + (sec.bars ?? 1), 0);
    timeInfo.textContent = `${arranger.length} sections · ${totalBarsVal} bars`;
    container.append(timeInfo);

    container.append(list);

    // Add section toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-shrink:0;flex-wrap:wrap;align-items:center';

    const sceneSelect = document.createElement('select');
    sceneSelect.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:#1a1a1a;color:var(--screen-text);font-family:var(--font-mono);font-size:0.66rem';
    scenes.forEach((scene, si) => {
      const opt = document.createElement('option');
      opt.value = si;
      opt.textContent = `${String.fromCharCode(65 + si)} — ${scene.name}`;
      sceneSelect.append(opt);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'screen-btn';
    addBtn.textContent = '+ Add Section';
    addBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_arrAdd', value: { sceneIdx: parseInt(sceneSelect.value), bars: 2 } })
    );

    const totalBars = arranger.reduce((s, sec) => s + (sec.bars ?? 1), 0);
    const info = document.createElement('span');
    info.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);margin-left:auto';
    info.textContent = `${arranger.length} sections · ${totalBars} bars`;

    toolbar.append(sceneSelect, addBtn, info);
    container.append(toolbar);
  },

  knobMap: [
    { label: 'SecLen',   param: 'sectionLen',    min: 1, max: 64, step: 1 },
    { label: 'BPM Ovr',  param: 'bpmOverride',   min: 40, max: 240, step: 1 },
    { label: 'Loop',     param: 'loopEnabled',   min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
  ],

  keyboardContext: 'arranger',
};
