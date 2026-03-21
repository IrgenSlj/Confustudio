// src/pages/arranger.js — Section list, arrangement mode toggle

import { TRACK_COLORS } from '../state.js';

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '5/4', '7/8'];

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const { arranger, arrangementMode, arrangementCursor, scenes, isPlaying } = state;
    const activeSectionIdx = (arrangementMode && isPlaying) ? (state._arrSection ?? 0) : -1;

    // ── Loop state (stored on state, defaulting here) ──────────────────────
    const arrLoop      = state.arrLoop      ?? false;
    const arrLoopStart = state.arrLoopStart ?? 0;
    const arrLoopEnd   = state.arrLoopEnd   ?? Math.max(0, arranger.length - 1);

    // ── Header ─────────────────────────────────────────────────────────────
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

    // ── Loop controls bar ──────────────────────────────────────────────────
    const loopBar = document.createElement('div');
    loopBar.className = 'arr-loop-bar';

    const loopToggle = document.createElement('button');
    loopToggle.className = 'seq-btn' + (arrLoop ? ' active' : '');
    loopToggle.style.cssText = 'font-size:0.52rem;padding:2px 6px';
    loopToggle.textContent = arrLoop ? '⟳ Loop: ON' : '⟳ Loop: OFF';
    loopToggle.addEventListener('click', () => {
      emit('state:change', { path: 'arrLoop', value: !arrLoop });
    });

    const loopFromLabel = document.createElement('span');
    loopFromLabel.textContent = 'from';

    const loopFromInput = document.createElement('input');
    loopFromInput.type = 'number';
    loopFromInput.min = '1';
    loopFromInput.max = String(arranger.length);
    loopFromInput.value = String(arrLoopStart + 1); // display 1-based
    loopFromInput.addEventListener('change', () => {
      const v = Math.max(1, Math.min(arranger.length, parseInt(loopFromInput.value) || 1));
      loopFromInput.value = String(v);
      emit('state:change', { path: 'arrLoopStart', value: v - 1 });
    });

    const loopToLabel = document.createElement('span');
    loopToLabel.textContent = 'to';

    const loopToInput = document.createElement('input');
    loopToInput.type = 'number';
    loopToInput.min = '1';
    loopToInput.max = String(arranger.length);
    loopToInput.value = String(arrLoopEnd + 1); // display 1-based
    loopToInput.addEventListener('change', () => {
      const v = Math.max(1, Math.min(arranger.length, parseInt(loopToInput.value) || 1));
      loopToInput.value = String(v);
      emit('state:change', { path: 'arrLoopEnd', value: v - 1 });
    });

    loopBar.append(loopToggle, loopFromLabel, loopFromInput, loopToLabel, loopToInput);
    container.append(loopBar);

    // ── Section list ───────────────────────────────────────────────────────
    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;min-height:0';

    if (arranger.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-family:var(--font-mono);font-size:0.62rem;color:var(--muted);padding:16px;text-align:center';
      empty.textContent = 'No sections. Add a section to start arranging.';
      list.append(empty);
    }

    arranger.forEach((section, idx) => {
      const sceneColorFull = TRACK_COLORS[(section.sceneIdx ?? 0) % TRACK_COLORS.length];
      const inLoopRange = arrLoop && idx >= arrLoopStart && idx <= arrLoopEnd;

      const row = document.createElement('div');
      row.className = 'arr-row';
      row.style.cssText = `
        display:flex;align-items:center;gap:8px;padding:6px 8px;
        border-radius:5px;border:1px solid var(--border);background:#141414;
        border-left: 3px solid ${sceneColorFull};
      `;
      if (idx === arrangementCursor) {
        row.style.borderColor = 'rgba(240,91,82,0.5)';
        row.style.borderLeftColor = sceneColorFull;
        row.style.background  = 'rgba(240,91,82,0.05)';
      }
      if (idx === activeSectionIdx) {
        row.classList.add('active');
        row.style.borderColor = 'rgba(90,221,113,0.6)';
        row.style.borderLeftColor = sceneColorFull;
        row.style.background  = 'rgba(90,221,113,0.06)';
      }
      if (inLoopRange) {
        row.style.outline = '1px solid rgba(90,221,113,0.35)';
        row.style.outlineOffset = '-1px';
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

      // Scene label (colored)
      const sceneLabel = document.createElement('span');
      sceneLabel.style.cssText = `font-family:var(--font-mono);font-size:0.65rem;color:${sceneColorFull};min-width:18px;font-weight:700`;
      sceneLabel.textContent   = String.fromCharCode(65 + (section.sceneIdx ?? 0));

      // Bar count display
      const barsLabel = document.createElement('span');
      barsLabel.style.cssText  = 'font-family:var(--font-mono);font-size:0.62rem;color:var(--screen-text);min-width:28px;text-align:right';
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

      // Per-section BPM override
      const bpmLabel = document.createElement('span');
      bpmLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.5rem;color:var(--muted)';
      bpmLabel.textContent = 'BPM';

      const bpmInput = document.createElement('input');
      bpmInput.type = 'number';
      bpmInput.className = 'arr-bpm-input';
      bpmInput.min = '0';
      bpmInput.max = '300';
      bpmInput.value = String(section.bpmOverride ?? 0);
      bpmInput.placeholder = String(state.bpm);
      bpmInput.title = '0 = use global BPM';
      bpmInput.addEventListener('change', () => {
        section.bpmOverride = parseInt(bpmInput.value) || 0;
        emit('state:change', { path: 'arranger', value: state.arranger });
      });

      // Per-section time signature
      const tsSelect = document.createElement('select');
      tsSelect.className = 'arr-ts-select';
      tsSelect.title = 'Time signature';
      TIME_SIGNATURES.forEach(ts => {
        const opt = document.createElement('option');
        opt.value = ts;
        opt.textContent = ts;
        if (ts === (section.timeSignature ?? '4/4')) opt.selected = true;
        tsSelect.append(opt);
      });
      tsSelect.addEventListener('change', () => {
        section.timeSignature = tsSelect.value;
        emit('state:change', { path: 'arranger', value: state.arranger });
      });

      // Name input
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

      row.append(sceneLabel, barsLabel, minusBtn, plusBtn, bpmLabel, bpmInput, tsSelect, sceneName, upBtn, dnBtn, delBtn);
      list.append(row);
    });

    // ── Visual timeline ────────────────────────────────────────────────────
    const totalBarsAll = arranger.reduce((s, sec) => s + (sec.bars ?? 1), 0) || 1;

    const timelineWrap = document.createElement('div');
    timelineWrap.style.cssText = 'position:relative;flex-shrink:0;margin-bottom:8px';

    const timeline = document.createElement('div');
    timeline.style.cssText = `
      display:flex; align-items:stretch; gap:2px;
      height:38px;
      background:rgba(0,0,0,0.2); border-radius:5px; padding:3px; overflow:hidden;
      position:relative;
    `;

    arranger.forEach((section, idx) => {
      const block = document.createElement('div');
      const widthPct = ((section.bars ?? 1) / totalBarsAll * 100).toFixed(1);
      const color = TRACK_COLORS[(section.sceneIdx ?? 0) % TRACK_COLORS.length];
      const isActive = idx === arrangementCursor;
      const inLoop = arrLoop && idx >= arrLoopStart && idx <= arrLoopEnd;
      block.style.cssText = `
        flex: 0 0 ${widthPct}%;
        min-width: 18px;
        background: ${color}${isActive ? 'ff' : '44'};
        border: 1px solid ${color}${isActive ? 'ff' : '88'};
        ${inLoop ? `outline: 1px solid rgba(90,221,113,0.5); outline-offset:-1px;` : ''}
        border-radius: 3px;
        display:flex; align-items:center; justify-content:center;
        font-family:var(--font-mono); font-size:0.5rem;
        color:${isActive ? '#000' : color};
        font-weight:600;
        cursor:pointer;
        overflow:hidden; white-space:nowrap;
        transition: all 0.1s;
      `;
      block.title = `${String.fromCharCode(65 + (section.sceneIdx ?? 0))} — ${section.bars}B${section.bpmOverride ? ` BPM:${section.bpmOverride}` : ''}`;
      block.textContent = `${String.fromCharCode(65 + (section.sceneIdx ?? 0))}`;
      block.addEventListener('click', () => {
        emit('state:change', { path: 'arrangementCursor', value: idx });
      });
      timeline.append(block);
    });

    // Loop region overlay
    if (arrLoop && arranger.length > 0) {
      const barsBeforeStart = arranger.slice(0, arrLoopStart).reduce((s, sec) => s + (sec.bars ?? 1), 0);
      const loopBars = arranger.slice(arrLoopStart, arrLoopEnd + 1).reduce((s, sec) => s + (sec.bars ?? 1), 0);
      const leftPct  = (barsBeforeStart / totalBarsAll * 100).toFixed(2);
      const widthPct = (loopBars / totalBarsAll * 100).toFixed(2);

      const loopRegion = document.createElement('div');
      loopRegion.className = 'arr-loop-region';
      loopRegion.style.left  = `${leftPct}%`;
      loopRegion.style.width = `${widthPct}%`;
      timeline.append(loopRegion);
    }

    if (arranger.length === 0) {
      timeline.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)">Empty — add sections below</div>`;
    }

    // Pulsing playhead cursor overlaid on the timeline
    if (activeSectionIdx >= 0 && arranger.length > 0) {
      const barsBefore = arranger.slice(0, activeSectionIdx).reduce((s, sec) => s + (sec.bars ?? 1), 0);
      const sectionBars = arranger[activeSectionIdx]?.bars ?? 1;
      const sectionProgress = state._arrSectionBar != null ? (state._arrSectionBar / sectionBars) : 0;
      const playheadPct = ((barsBefore + sectionProgress * sectionBars) / totalBarsAll * 100).toFixed(2);

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
      timeline.append(playhead);
    }

    timelineWrap.append(timeline);
    container.append(timelineWrap);

    const timeInfo = document.createElement('div');
    timeInfo.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);margin-bottom:4px;flex-shrink:0';
    const totalBarsVal = arranger.reduce((s, sec) => s + (sec.bars ?? 1), 0);
    timeInfo.textContent = `${arranger.length} sections · ${totalBarsVal} bars`;
    container.append(timeInfo);

    container.append(list);

    // ── Add section toolbar ────────────────────────────────────────────────
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

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'seq-btn';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', () => {
      const sections = state.arranger.sections ?? state.arranger ?? [];
      const total = sections.reduce((sum, s) => sum + (s.bars ?? 1), 0);
      let txt = `CONFUsynth Arrangement: ${state.project.name ?? 'Untitled'}\n`;
      txt += `BPM: ${state.bpm}\nTotal: ${total} bars\n\n`;
      sections.forEach((s, i) => {
        const sceneName = String.fromCharCode(65 + (s.sceneIdx ?? i % 8));
        const bpmStr = s.bpmOverride ? ` BPM: ${s.bpmOverride}` : '';
        const ts = s.timeSignature ?? '4/4';
        txt += `${i+1}. Scene ${sceneName} — ${s.bars ?? 1} bar${s.bars !== 1 ? 's' : ''} (${ts})${bpmStr}\n`;
      });
      const blob = new Blob([txt], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `arrangement-${Date.now()}.txt`;
      a.click();
    });

    const totalBars = arranger.reduce((s, sec) => s + (sec.bars ?? 1), 0);
    const info = document.createElement('span');
    info.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);margin-left:auto';
    info.textContent = `${arranger.length} sections · ${totalBars} bars`;

    toolbar.append(sceneSelect, addBtn, exportBtn, info);
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
