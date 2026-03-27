// src/pages/arranger.js — Section list, arrangement mode toggle

import { TRACK_COLORS } from '../state.js';

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '5/4', '7/8'];

// ── Section color map ──────────────────────────────────────────────────────
const SECTION_COLORS = {
  intro:   '#67d7ff',
  verse:   '#5add71',
  chorus:  '#f0c640',
  bridge:  '#c67dff',
  outro:   '#f05b52',
};
function sectionColor(name) {
  const key = (name ?? '').toLowerCase().replace(/\s+\d+$/, '').trim();
  return SECTION_COLORS[key] ?? '#888';
}

// ── Inject arr- scoped CSS once ────────────────────────────────────────────
(function injectArrCSS() {
  if (document.getElementById('arr-css')) return;
  const s = document.createElement('style');
  s.id = 'arr-css';
  s.textContent = `
.arr-timeline {
  overflow-x: auto; overflow-y: hidden;
  flex: 1; min-height: 0; min-width: 0;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
}
.arr-ruler {
  display: flex; height: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  position: sticky; top: 0; z-index: 1; background: rgba(0,0,0,0.4);
  overflow: hidden;
}
.arr-ruler-mark {
  min-width: 30px; flex-shrink: 0;
  font-size: 0.5rem; color: rgba(255,255,255,0.3);
  font-family: var(--font-mono);
  padding: 2px 3px; border-right: 1px solid rgba(255,255,255,0.06);
}
.arr-track {
  display: flex; align-items: stretch; gap: 2px;
  padding: 6px 4px; min-height: 50px;
}
.arr-block {
  flex-shrink: 0; border-radius: 4px; padding: 5px 7px;
  background: color-mix(in srgb, var(--sec-color) 20%, transparent);
  border: 1px solid var(--sec-color);
  border-left: 3px solid var(--sec-color);
  cursor: pointer; user-select: none;
  display: flex; flex-direction: column; justify-content: center; gap: 2px;
  transition: filter 0.1s;
  position: relative;
}
.arr-block:hover { filter: brightness(1.2); }
.arr-block.playing {
  box-shadow: 0 0 0 1px var(--sec-color), 0 0 8px var(--sec-color);
  animation: arr-block-pulse 1s ease-in-out infinite alternate;
}
@keyframes arr-block-pulse {
  from { filter: brightness(1.0); }
  to   { filter: brightness(1.3); }
}
.arr-block-name { font-size: 0.62rem; font-weight: 600; color: var(--sec-color); white-space: nowrap; }
.arr-block-bars { font-size: 0.5rem; color: rgba(255,255,255,0.35); font-family: var(--font-mono); }
.arr-block-fa {
  font-size: 0.48rem; color: rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.07); border-radius: 2px; padding: 0 3px;
  align-self: flex-start; font-family: var(--font-mono);
}
.arr-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; flex: 1; color: rgba(255,255,255,0.2); font-size: 0.7rem;
  padding: 20px; font-family: var(--font-mono);
}
.arr-empty-icon { font-size: 2rem; opacity: 0.3; }
.arr-empty-hint { font-size: 0.6rem; color: rgba(255,255,255,0.15); text-align: center; }
.arr-quick-add { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.arr-quick-btn {
  padding: 4px 10px; font-size: 0.6rem; font-weight: 600; border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.15); background: transparent;
  color: rgba(255,255,255,0.4); cursor: pointer; transition: all 0.1s;
  font-family: var(--font-mono);
}
.arr-quick-btn:hover { border-color: var(--live); color: var(--live); }
`;
  document.head.append(s);
})();

export default {
  render(container, state, emit) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';

    const { arranger, arrangementMode, arrangementCursor, scenes, isPlaying } = state;
    const activeSectionIdx = (arrangementMode && isPlaying) ? (state._arrSection ?? 0) : -1;
    if (state.arrSoloSection == null) state.arrSoloSection = null; // ensure defined

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

    const clearBtn = document.createElement('button');
    clearBtn.className = 'seq-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = 'font-size:0.52rem;padding:2px 7px;margin-left:auto';
    clearBtn.title = 'Clear all sections and reset to one default section';
    clearBtn.addEventListener('click', () => {
      if (!confirm('Clear arranger? All sections will be lost.')) return;
      state.arranger.length = 0;
      state.arranger.push({ sceneIdx: 0, bars: 4, name: 'Section 1', repeat: 1, muted: false, followAction: 'next' });
      state.arrangementCursor = 0;
      state._arrSection = 0;
      state._arrSectionBars = 0;
      state._arrSectionRepeatCount = 0;
      state.arrSoloSection = null;
      emit('state:change', { path: 'scale', value: state.scale });
    });

    header.append(modeBtn, clearBtn);
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

    // ── Horizontal timeline ────────────────────────────────────────────────
    // Track which section is selected for the detail panel
    if (state._arrSelectedSection == null) state._arrSelectedSection = 0;

    const timelineOuter = document.createElement('div');
    timelineOuter.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;gap:4px';

    if (arranger.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'arr-empty';
      emptyDiv.innerHTML = `
        <div class="arr-empty-icon">⧖</div>
        <div>No sections yet</div>
        <div class="arr-empty-hint">Add a section below or pick a quick template</div>
      `;
      const quickAdd = document.createElement('div');
      quickAdd.className = 'arr-quick-add';
      ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'].forEach(name => {
        const qBtn = document.createElement('button');
        qBtn.className = 'arr-quick-btn';
        const col = sectionColor(name);
        qBtn.style.setProperty('--quick-color', col);
        qBtn.style.cssText = `padding:4px 10px;font-size:0.6rem;font-weight:600;border-radius:3px;border:1px solid ${col}55;background:${col}11;color:${col};cursor:pointer;font-family:var(--font-mono);transition:all 0.1s`;
        qBtn.textContent = `+ ${name}`;
        qBtn.addEventListener('mouseenter', () => { qBtn.style.borderColor = col; qBtn.style.background = col + '22'; });
        qBtn.addEventListener('mouseleave', () => { qBtn.style.borderColor = col + '55'; qBtn.style.background = col + '11'; });
        qBtn.addEventListener('click', () => emit('arranger:addSection', { name, bars: 4 }));
        quickAdd.append(qBtn);
      });
      emptyDiv.append(quickAdd);
      timelineOuter.append(emptyDiv);
    } else {
      // Build the timeline
      const timelineWrap2 = document.createElement('div');
      timelineWrap2.className = 'arr-timeline';
      timelineWrap2.style.cssText = 'overflow-x:auto;overflow-y:hidden;flex:1;min-height:0;background:rgba(0,0,0,0.2);border-radius:4px;display:flex;flex-direction:column';

      // Bar ruler
      const totalBarsForRuler = arranger.reduce((s, sec) => s + (sec.bars ?? 4), 0) || 1;
      const ruler = document.createElement('div');
      ruler.className = 'arr-ruler';
      let barCount = 1;
      arranger.forEach(sec => {
        const secBars = sec.bars ?? 4;
        for (let b = 0; b < secBars; b++) {
          const mark = document.createElement('div');
          mark.className = 'arr-ruler-mark';
          mark.style.minWidth = '30px';
          mark.textContent = barCount % 4 === 1 ? String(barCount) : '';
          ruler.append(mark);
          barCount++;
        }
      });

      // Track area
      const track = document.createElement('div');
      track.className = 'arr-track';

      arranger.forEach((section, idx) => {
        const isPlaying = idx === activeSectionIdx;
        const isCursor = idx === arrangementCursor;
        const color = section.color ?? sectionColor(section.name ?? '');
        const block = document.createElement('div');
        block.className = `arr-block${isPlaying ? ' playing' : ''}`;
        block.dataset.sectionIdx = idx;
        block.style.setProperty('--sec-color', color);
        block.style.width = Math.max(60, (section.bars ?? 4) * 30) + 'px';
        if (isCursor) {
          block.style.outline = '2px solid rgba(240,91,82,0.7)';
          block.style.outlineOffset = '-2px';
        }
        const fa = section.followAction ?? 'next';
        const faIcon = { next: '→', loop: '↻', stop: '■', jump: '↩' }[fa] ?? '';
        block.innerHTML = `
          <div class="arr-block-name">${section.name ?? `Section ${idx + 1}`}</div>
          <div class="arr-block-bars">${section.bars ?? 4} bars${section.repeat > 1 ? ` ×${section.repeat}` : ''}</div>
          ${section.followAction && section.followAction !== 'next' ? `<div class="arr-block-fa">${faIcon} ${fa}</div>` : ''}
        `;

        // Right-click context menu
        block.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          document.querySelectorAll('.arr-ctx-menu').forEach(m => m.remove());
          const menu = document.createElement('div');
          menu.className = 'arr-ctx-menu';
          menu.style.cssText = [
            'position:fixed','z-index:9999',
            'background:#1e1e1e','border:1px solid var(--border)',
            'border-radius:5px','padding:4px 0',
            'font-family:var(--font-mono)','font-size:0.62rem',
            'box-shadow:0 4px 16px rgba(0,0,0,0.6)',
            'min-width:144px',
          ].join(';');
          menu.style.left = `${e.clientX}px`;
          menu.style.top = `${e.clientY}px`;
          const menuItem = (label, icon, action) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:6px 14px;cursor:pointer;color:var(--screen-text);display:flex;align-items:center;gap:8px';
            item.innerHTML = `<span style="opacity:0.65">${icon}</span>${label}`;
            item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.06)'; });
            item.addEventListener('mouseleave', () => { item.style.background = ''; });
            item.addEventListener('click', () => { menu.remove(); action(); });
            return item;
          };
          const faOptions = [
            { value: 'next', label: '→ Next' }, { value: 'loop', label: '↻ Loop' },
            { value: 'stop', label: '■ Stop' }, { value: 'jump', label: '↩ Jump' },
          ];
          menu.append(
            menuItem('Rename', '✎', () => {
              const name = prompt('Section name:', section.name ?? `Section ${idx + 1}`);
              if (name !== null) {
                section.name = name;
                emit('state:change', { path: 'arranger', value: state.arranger });
              }
            }),
            menuItem('Duplicate', '⧉', () => {
              const clone = JSON.parse(JSON.stringify(section));
              state.arranger.splice(idx + 1, 0, clone);
              emit('state:change', { path: 'scale', value: state.scale });
            }),
            menuItem('Insert Before', '↑+', () => {
              const newSec = { sceneIdx: section.sceneIdx ?? 0, bars: section.bars ?? 4, name: `Section ${state.arranger.length + 1}`, repeat: 1, muted: false, followAction: 'next' };
              state.arranger.splice(idx, 0, newSec);
              emit('state:change', { path: 'scale', value: state.scale });
            }),
            ...faOptions.map(({ value, label }) => menuItem(
              (value === (section.followAction ?? 'next') ? '✓ ' : '') + 'Follow: ' + label,
              '',
              () => { section.followAction = value; emit('state:change', { path: 'arranger', value: state.arranger }); }
            )),
            menuItem('Delete', '✕', () => emit('state:change', { path: 'action_arrRemove', value: idx })),
          );
          document.body.append(menu);
          requestAnimationFrame(() => {
            const mr = menu.getBoundingClientRect();
            if (mr.right > window.innerWidth) menu.style.left = `${e.clientX - mr.width}px`;
            if (mr.bottom > window.innerHeight) menu.style.top = `${e.clientY - mr.height}px`;
          });
          const closeMenu = ev => {
            if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu, true); }
          };
          setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
        });

        // Click to select (jump)
        block.addEventListener('click', () => {
          state._arrSelectedSection = idx;
          emit('state:change', { path: 'arrangementCursor', value: idx });
        });

        // Double-click to rename inline
        block.addEventListener('dblclick', e => {
          e.stopPropagation();
          const name = prompt('Section name:', section.name ?? `Section ${idx + 1}`);
          if (name !== null) {
            section.name = name;
            emit('state:change', { path: 'arranger', value: state.arranger });
          }
        });

        track.appendChild(block);
      });

      // Playhead overlay
      if (activeSectionIdx >= 0) {
        const barsBeforePlaying = arranger.slice(0, activeSectionIdx).reduce((s, sec) => s + (sec.bars ?? 4), 0);
        const sectionBars = arranger[activeSectionIdx]?.bars ?? 4;
        const sectionProgress = state._arrSectionBars != null ? (state._arrSectionBars / sectionBars) : 0;
        const playheadPx = (barsBeforePlaying + sectionProgress * sectionBars) * 30 + 4; // 4 = track padding
        const playhead = document.createElement('div');
        playhead.style.cssText = `
          position:absolute;top:0;bottom:0;width:2px;
          left:${playheadPx}px;
          background:var(--live);border-radius:1px;
          animation:arrPlayheadPulse 0.5s ease-in-out infinite alternate;
          pointer-events:none;z-index:10;
        `;
        track.style.position = 'relative';
        track.append(playhead);
      }

      // Loop region indicator in ruler
      if (arrLoop && arranger.length > 0) {
        const barsBeforeLoopStart = arranger.slice(0, arrLoopStart).reduce((s, sec) => s + (sec.bars ?? 4), 0);
        const loopBars = arranger.slice(arrLoopStart, arrLoopEnd + 1).reduce((s, sec) => s + (sec.bars ?? 4), 0);
        const loopRegion = document.createElement('div');
        loopRegion.style.cssText = `
          position:absolute;top:0;bottom:0;
          left:${barsBeforeLoopStart * 30}px;
          width:${loopBars * 30}px;
          background:rgba(90,221,113,0.06);
          border-left:2px solid rgba(90,221,113,0.5);
          border-right:2px solid rgba(90,221,113,0.5);
          pointer-events:none;z-index:0;
        `;
        track.style.position = 'relative';
        track.append(loopRegion);
      }

      timelineWrap2.append(ruler, track);
      timelineOuter.append(timelineWrap2);
    }

    // ── Section detail panel (for selected section) ────────────────────────
    const detailPanel = document.createElement('div');
    detailPanel.style.cssText = 'flex-shrink:0;background:rgba(0,0,0,0.15);border-radius:4px;padding:5px 8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-family:var(--font-mono);font-size:0.58rem;min-height:36px';

    const selIdx = state._arrSelectedSection ?? 0;
    const selSection = arranger[selIdx];
    if (selSection) {
      // Section label
      const selLabel = document.createElement('span');
      const selColor = selSection.color ?? sectionColor(selSection.name ?? '');
      selLabel.style.cssText = `font-weight:700;font-size:0.65rem;color:${selColor}`;
      selLabel.textContent = `[${selIdx + 1}] ${selSection.name ?? 'Section'}`;
      detailPanel.append(selLabel);

      // Bars
      const barsLabel = document.createElement('span');
      barsLabel.style.cssText = 'color:var(--muted)';
      barsLabel.textContent = `${selSection.bars ?? 4}B`;
      barsLabel.title = 'Double-click to edit bar count';
      barsLabel.addEventListener('dblclick', e => {
        e.stopPropagation();
        const barsInput = document.createElement('input');
        barsInput.type = 'number';
        barsInput.min = '1'; barsInput.max = '64';
        barsInput.value = String(selSection.bars ?? 4);
        barsInput.style.cssText = 'width:36px;background:#222;border:1px solid var(--accent);border-radius:2px;padding:0 2px;font-family:var(--font-mono);font-size:0.58rem;color:var(--screen-text);text-align:right';
        const commit = () => {
          const newBars = Math.max(1, Math.min(64, parseInt(barsInput.value) || 4));
          selSection.bars = newBars;
          barsLabel.textContent = `${newBars}B`;
          barsInput.replaceWith(barsLabel);
          emit('state:change', { path: `arranger[${selIdx}].bars`, value: newBars });
        };
        barsInput.addEventListener('blur', commit);
        barsInput.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); barsInput.blur(); }
          if (ev.key === 'Escape') { barsInput.replaceWith(barsLabel); }
        });
        barsLabel.replaceWith(barsInput);
        barsInput.focus(); barsInput.select();
      });
      const minusBtn2 = document.createElement('button');
      minusBtn2.className = 'bpm-arrow';
      minusBtn2.textContent = '−';
      minusBtn2.addEventListener('click', () => {
        const v = Math.max(1, (selSection.bars ?? 4) - 1);
        selSection.bars = v;
        barsLabel.textContent = `${v}B`;
        emit('state:change', { path: `arranger[${selIdx}].bars`, value: v });
      });
      const plusBtn2 = document.createElement('button');
      plusBtn2.className = 'bpm-arrow';
      plusBtn2.textContent = '+';
      plusBtn2.addEventListener('click', () => {
        const v = Math.min(64, (selSection.bars ?? 4) + 1);
        selSection.bars = v;
        barsLabel.textContent = `${v}B`;
        emit('state:change', { path: `arranger[${selIdx}].bars`, value: v });
      });
      detailPanel.append(minusBtn2, barsLabel, plusBtn2);

      // Repeat
      const repLabel = document.createElement('span');
      repLabel.style.cssText = 'color:var(--muted)';
      repLabel.textContent = '×';
      const repeatInput2 = document.createElement('input');
      repeatInput2.type = 'number';
      repeatInput2.className = 'arr-bpm-input';
      repeatInput2.min = '1'; repeatInput2.max = '16';
      repeatInput2.value = String(selSection.repeat ?? 1);
      repeatInput2.title = 'Repeat count';
      repeatInput2.style.width = '32px';
      repeatInput2.addEventListener('change', () => {
        selSection.repeat = Math.max(1, Math.min(16, parseInt(repeatInput2.value) || 1));
        repeatInput2.value = String(selSection.repeat);
        emit('state:change', { path: 'arranger', value: state.arranger });
      });
      detailPanel.append(repLabel, repeatInput2);

      // Follow action
      const followSelect2 = document.createElement('select');
      followSelect2.title = 'Follow action';
      followSelect2.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:3px;padding:1px 2px;cursor:pointer;max-width:70px';
      [{ value:'next',label:'→ Next'},{value:'loop',label:'↻ Loop'},{value:'stop',label:'■ Stop'},{value:'jump',label:'↩ Jump'}].forEach(({value,label}) => {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        if (value === (selSection.followAction ?? 'next')) opt.selected = true;
        followSelect2.append(opt);
      });
      followSelect2.addEventListener('change', () => {
        selSection.followAction = followSelect2.value;
        emit('state:change', { path: 'arranger', value: state.arranger });
      });
      detailPanel.append(followSelect2);

      // BPM override
      const bpmLabel2 = document.createElement('span');
      bpmLabel2.style.cssText = 'color:var(--muted)';
      bpmLabel2.textContent = 'BPM';
      const bpmInput2 = document.createElement('input');
      bpmInput2.type = 'number';
      bpmInput2.className = 'arr-bpm-input';
      bpmInput2.min = '0'; bpmInput2.max = '300';
      bpmInput2.value = String(selSection.bpmOverride ?? 0);
      bpmInput2.placeholder = String(state.bpm);
      bpmInput2.title = '0 = use global BPM';
      bpmInput2.addEventListener('change', () => {
        selSection.bpmOverride = parseInt(bpmInput2.value) || 0;
        emit('state:change', { path: 'arranger', value: state.arranger });
      });
      detailPanel.append(bpmLabel2, bpmInput2);

      // Time signature
      const tsSelect2 = document.createElement('select');
      tsSelect2.className = 'arr-ts-select';
      tsSelect2.title = 'Time signature';
      TIME_SIGNATURES.forEach(ts => {
        const opt = document.createElement('option');
        opt.value = ts; opt.textContent = ts;
        if (ts === (selSection.timeSignature ?? '4/4')) opt.selected = true;
        tsSelect2.append(opt);
      });
      tsSelect2.addEventListener('change', () => {
        selSection.timeSignature = tsSelect2.value;
        emit('state:change', { path: 'arranger', value: state.arranger });
      });
      detailPanel.append(tsSelect2);

      // Mute
      const muteBtn2 = document.createElement('button');
      muteBtn2.className = 'seq-btn' + (selSection.muted ? ' active' : '');
      muteBtn2.textContent = 'M';
      muteBtn2.title = selSection.muted ? 'Muted — click to unmute' : 'Mute section';
      muteBtn2.style.cssText = `font-size:0.52rem;padding:2px 5px;${selSection.muted ? 'color:var(--live);border-color:var(--live);' : 'opacity:0.45;'}`;
      muteBtn2.addEventListener('click', e => {
        e.stopPropagation();
        selSection.muted = !selSection.muted;
        muteBtn2.classList.toggle('active', selSection.muted);
        muteBtn2.style.cssText = `font-size:0.52rem;padding:2px 5px;${selSection.muted ? 'color:var(--live);border-color:var(--live);' : 'opacity:0.45;'}`;
        emit('state:change', { path: 'arranger', value: state.arranger });
      });

      // Solo
      const soloActive2 = (state.arrSoloSection === selIdx);
      const soloBtn2 = document.createElement('button');
      soloBtn2.className = 'seq-btn' + (soloActive2 ? ' active' : '');
      soloBtn2.textContent = 'S';
      soloBtn2.title = soloActive2 ? 'Solo — click to clear' : 'Solo this section';
      soloBtn2.style.cssText = `font-size:0.52rem;padding:2px 5px;${soloActive2 ? 'color:#ffe066;border-color:#ffe066;' : 'opacity:0.45;'}`;
      soloBtn2.addEventListener('click', e => {
        e.stopPropagation();
        emit('state:change', { path: 'arrSoloSection', value: state.arrSoloSection === selIdx ? null : selIdx });
      });
      detailPanel.append(muteBtn2, soloBtn2);

      // Track mutes
      if (!Array.isArray(selSection.trackMutes) || selSection.trackMutes.length !== 8) {
        selSection.trackMutes = Array(8).fill(false);
      }
      const mutesRow2 = document.createElement('div');
      mutesRow2.style.cssText = 'display:flex;gap:2px;align-items:center;flex-shrink:0';
      mutesRow2.title = 'Track mutes for this section';
      selSection.trackMutes.forEach((muted, ti) => {
        const sq = document.createElement('div');
        const tc = TRACK_COLORS[ti % TRACK_COLORS.length];
        sq.style.cssText = `width:8px;height:8px;border-radius:1px;cursor:pointer;flex-shrink:0;background:${muted ? '#2a2a2a' : tc};border:1px solid ${muted ? '#444' : tc};opacity:${muted ? '0.35' : '1'};transition:background 0.1s,opacity 0.1s`;
        sq.title = `Track ${ti + 1} — ${muted ? 'muted' : 'active'}`;
        sq.addEventListener('click', e => {
          e.stopPropagation();
          selSection.trackMutes[ti] = !selSection.trackMutes[ti];
          emit('state:change', { path: 'arranger', value: state.arranger });
        });
        mutesRow2.append(sq);
      });
      detailPanel.append(mutesRow2);

      // Color swatch
      if (selSection.color == null) selSection.color = sectionColor(selSection.name ?? '');
      const colorSwatch2 = document.createElement('div');
      colorSwatch2.style.cssText = `width:10px;height:22px;border-radius:2px;cursor:pointer;flex-shrink:0;background:${selSection.color};border:1px solid rgba(255,255,255,0.15);position:relative;overflow:visible`;
      colorSwatch2.title = 'Click to change section color';
      const colorPick2 = document.createElement('input');
      colorPick2.type = 'color';
      colorPick2.value = selSection.color ?? '#3a4a5a';
      colorPick2.style.cssText = 'width:100%;height:100%;padding:0;border:none;border-radius:2px;cursor:pointer;opacity:0;position:absolute;inset:0';
      colorPick2.addEventListener('change', () => {
        selSection.color = colorPick2.value;
        colorSwatch2.style.background = colorPick2.value;
        emit('state:change', { param: 'arranger' });
      });
      colorSwatch2.append(colorPick2);
      detailPanel.append(colorSwatch2);

      // Dup/Up/Down/Del
      const dupBtn2 = document.createElement('button');
      dupBtn2.className = 'bpm-arrow';
      dupBtn2.textContent = '⧉';
      dupBtn2.title = 'Duplicate';
      dupBtn2.style.cssText = 'font-size:0.6rem;padding:2px 5px;opacity:0.7;margin-left:auto';
      dupBtn2.addEventListener('click', () => {
        const clone = JSON.parse(JSON.stringify(selSection));
        state.arranger.splice(selIdx + 1, 0, clone);
        emit('state:change', { path: 'scale', value: state.scale });
      });
      const upBtn2 = document.createElement('button');
      upBtn2.className = 'bpm-arrow';
      upBtn2.textContent = '↑';
      upBtn2.disabled = selIdx === 0;
      upBtn2.style.cssText = `opacity:${selIdx === 0 ? '0.2' : '0.45'};font-size:0.55rem;padding:1px 4px`;
      upBtn2.addEventListener('click', () => emit('state:change', { path: 'action_arrMoveUp', value: selIdx }));
      const dnBtn2 = document.createElement('button');
      dnBtn2.className = 'bpm-arrow';
      dnBtn2.textContent = '↓';
      dnBtn2.disabled = selIdx === arranger.length - 1;
      dnBtn2.style.cssText = `opacity:${selIdx === arranger.length - 1 ? '0.2' : '0.45'};font-size:0.55rem;padding:1px 4px`;
      dnBtn2.addEventListener('click', () => emit('state:change', { path: 'action_arrMoveDown', value: selIdx }));
      const delBtn2 = document.createElement('button');
      delBtn2.className = 'seq-btn';
      delBtn2.textContent = '✕';
      delBtn2.style.padding = '4px 6px';
      delBtn2.addEventListener('click', () => emit('state:change', { path: 'action_arrRemove', value: selIdx }));
      detailPanel.append(dupBtn2, upBtn2, dnBtn2, delBtn2);
    } else {
      detailPanel.innerHTML = `<span style="color:var(--muted);font-family:var(--font-mono);font-size:0.58rem">Click a section block to select it</span>`;
    }

    timelineOuter.append(detailPanel);
    container.append(timelineOuter);

    // Time info
    const timeInfo2 = document.createElement('div');
    timeInfo2.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);flex-shrink:0';
    const totalBarsVal2 = arranger.reduce((s, sec) => s + (sec.bars ?? 4), 0);
    timeInfo2.textContent = `${arranger.length} sections · ${totalBarsVal2} bars`;
    container.append(timeInfo2);

    // ── rAF loop: animate playing block highlight ──────────────────────────
    if (container._hlRaf) cancelAnimationFrame(container._hlRaf);
    function highlightBlocks() {
      if (!container.isConnected) { container._hlRaf = null; return; }
      const idx = state._arrSection ?? -1;
      container.querySelectorAll('.arr-block').forEach(block => {
        const bIdx = parseInt(block.dataset.sectionIdx, 10);
        const isPlaying = bIdx === idx && state.isPlaying && state.arrangementMode;
        block.classList.toggle('playing', isPlaying);
      });
      container._hlRaf = requestAnimationFrame(highlightBlocks);
    }
    container._hlRaf = requestAnimationFrame(highlightBlocks);

    // Ensure color defaults are set for all sections
    arranger.forEach(section => { if (section.color == null) section.color = sectionColor(section.name ?? ''); });


    // ── Add section toolbar ────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-shrink:0;flex-wrap:wrap;align-items:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;margin-top:auto';

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

    const templateWrap = document.createElement('div');
    templateWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center';
    const templateLabel = document.createElement('span');
    templateLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted)';
    templateLabel.textContent = 'Templates';
    templateWrap.append(templateLabel);

    const templates = [
      { name: 'Song', sections: [['Intro', 2], ['Verse', 4], ['Chorus', 4], ['Verse', 4], ['Bridge', 2], ['Chorus', 4], ['Outro', 2]] },
      { name: 'Live', sections: [['Scene A', 8], ['Scene B', 8], ['Scene C', 8], ['Break', 4], ['Final', 8]] },
      { name: 'Loop Set', sections: [['Main', 8], ['Lift', 4], ['Drop', 8], ['Break', 4]] },
    ];
    templates.forEach((template) => {
      const btn = document.createElement('button');
      btn.className = 'seq-btn';
      btn.textContent = template.name;
      btn.addEventListener('click', () => {
        state.arranger = template.sections.map(([name, bars], idx) => ({
          name,
          bars,
          sceneIdx: idx % scenes.length,
          repeat: 1,
          muted: false,
        }));
        state.arrangementCursor = 0;
        emit('state:change', { path: 'arranger', value: state.arranger });
      });
      templateWrap.append(btn);
    });

    const totalBars = arranger.reduce((s, sec) => s + (sec.bars ?? 1), 0);
    const info = document.createElement('span');
    info.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);margin-left:auto';
    info.textContent = `${arranger.length} sections · ${totalBars} bars`;

    toolbar.append(sceneSelect, addBtn, exportBtn, templateWrap, info);
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
