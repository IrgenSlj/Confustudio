// src/pages/banks.js — Bank/Pattern browser

const BANK_LETTERS = ['A','B','C','D','E','F','G','H'];

const TRACK_COLORS = ['#f0c640','#5add71','#67d7ff','#ff8c52','#c67dff','#ff6eb4','#40e0d0','#f05b52'];

function computePatternDiff(patA, patB) {
  return patA.kit.tracks.map((trackA, ti) => {
    const trackB = patB.kit.tracks[ti];
    let added = 0, removed = 0;
    for (let si = 0; si < Math.max(patA.length, patB.length); si++) {
      const stepA = trackA.steps[si]?.active ?? false;
      const stepB = trackB?.steps[si]?.active ?? false;
      if (stepA && !stepB) removed++;
      else if (!stepA && stepB) added++;
    }
    return { name: trackA.name, added, removed, same: added + removed === 0 };
  });
}

export default {
  render(container, state, emit) {
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;padding:6px 8px;gap:4px';

    const { project, activeBank, activePattern, copyBuffer, patternCompareA, patternCompareB } = state;
    const hasPatternCopy = copyBuffer?.type === 'pattern';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Banks</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--accent)">
        ${BANK_LETTERS[activeBank]}${String(activePattern + 1).padStart(2,'0')}
      </span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted)">
        ${project.banks[activeBank].patterns[activePattern].name}
      </span>`;
    container.append(header);

    // A/B Pattern Comparison bar
    const abBar = document.createElement('div');
    abBar.className = 'ab-compare-bar';

    const abLabel = document.createElement('label');
    abLabel.textContent = 'CMP:';
    abBar.append(abLabel);

    const markABtn = document.createElement('button');
    markABtn.className = 'ab-btn' + (patternCompareA ? ' has-a' : '');
    markABtn.textContent = patternCompareA
      ? `A:${BANK_LETTERS[patternCompareA.bank]}${String(patternCompareA.pattern + 1).padStart(2,'0')}`
      : 'Mark A';
    markABtn.title = 'Mark current pattern as A';
    markABtn.addEventListener('click', () => {
      state.patternCompareA = { bank: activeBank, pattern: activePattern };
      this.render(container, state, emit);
    });

    const markBBtn = document.createElement('button');
    markBBtn.className = 'ab-btn' + (patternCompareB ? ' has-b' : '');
    markBBtn.textContent = patternCompareB
      ? `B:${BANK_LETTERS[patternCompareB.bank]}${String(patternCompareB.pattern + 1).padStart(2,'0')}`
      : 'Mark B';
    markBBtn.title = 'Mark current pattern as B';
    markBBtn.addEventListener('click', () => {
      state.patternCompareB = { bank: activeBank, pattern: activePattern };
      this.render(container, state, emit);
    });

    const swapBtn = document.createElement('button');
    swapBtn.className = 'ab-btn';
    swapBtn.textContent = 'A↔B';
    swapBtn.title = 'Toggle between A and B pattern';
    const canSwap = !!(patternCompareA && patternCompareB);
    swapBtn.disabled = !canSwap;
    swapBtn.addEventListener('click', () => {
      const curr = { bank: activeBank, pattern: activePattern };
      const isOnA = patternCompareA &&
        curr.bank === patternCompareA.bank &&
        curr.pattern === patternCompareA.pattern;
      const target = isOnA ? patternCompareB : patternCompareA;
      if (target) {
        emit('bank:select', { bankIndex: target.bank });
        emit('pattern:select', { patternIndex: target.pattern });
      }
    });

    const diffBtn = document.createElement('button');
    diffBtn.className = 'ab-btn';
    diffBtn.textContent = 'Diff';
    diffBtn.title = 'Show diff between pattern A and B';
    const canDiff = !!(patternCompareA && patternCompareB);
    diffBtn.disabled = !canDiff;
    diffBtn.style.opacity = canDiff ? '1' : '0.4';
    diffBtn.addEventListener('click', () => {
      const existing = container.querySelector('.ab-diff-panel');
      if (existing) { existing.remove(); return; }

      const patA = state.project.banks[patternCompareA.bank].patterns[patternCompareA.pattern];
      const patB = state.project.banks[patternCompareB.bank].patterns[patternCompareB.pattern];
      const diffs = computePatternDiff(patA, patB);

      const diffPanel = document.createElement('div');
      diffPanel.className = 'ab-diff-panel';
      diffPanel.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:4px;padding:6px 8px;margin-top:4px;font-family:var(--font-mono);font-size:0.48rem;display:flex;flex-direction:column;gap:3px';

      const diffTitle = document.createElement('div');
      diffTitle.style.cssText = 'color:var(--muted);font-size:0.44rem;margin-bottom:2px';
      diffTitle.textContent = `DIFF  A:${BANK_LETTERS[patternCompareA.bank]}${String(patternCompareA.pattern + 1).padStart(2,'0')}  vs  B:${BANK_LETTERS[patternCompareB.bank]}${String(patternCompareB.pattern + 1).padStart(2,'0')}`;
      diffPanel.append(diffTitle);

      diffs.forEach(({ name, added, removed, same }) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px';

        const trackLabel = document.createElement('span');
        trackLabel.style.cssText = 'color:var(--screen-text);min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        trackLabel.textContent = name;
        row.append(trackLabel);

        if (same) {
          const sameBadge = document.createElement('span');
          sameBadge.style.cssText = 'color:var(--muted);font-size:0.44rem';
          sameBadge.textContent = 'same';
          row.append(sameBadge);
        } else {
          if (removed > 0) {
            const remBadge = document.createElement('span');
            remBadge.style.cssText = 'background:rgba(240,91,82,0.2);color:#f05b52;border:1px solid rgba(240,91,82,0.4);border-radius:3px;padding:0 4px;font-size:0.44rem';
            remBadge.textContent = `-${removed} steps`;
            row.append(remBadge);
          }
          if (added > 0) {
            const addBadge = document.createElement('span');
            addBadge.style.cssText = 'background:rgba(90,221,113,0.2);color:#5add71;border:1px solid rgba(90,221,113,0.4);border-radius:3px;padding:0 4px;font-size:0.44rem';
            addBadge.textContent = `+${added} steps`;
            row.append(addBadge);
          }
        }
        diffPanel.append(row);
      });

      // Insert after abBar
      abBar.after(diffPanel);
    });

    abBar.append(markABtn, markBBtn, swapBtn, diffBtn);
    container.append(abBar);

    // Chain toggle bar
    const chainBar = document.createElement('div');
    chainBar.className = 'ab-compare-bar';

    const chainLabel = document.createElement('label');
    chainLabel.textContent = 'CHAIN';
    chainBar.append(chainLabel);

    const chainBtn = document.createElement('button');
    chainBtn.className = 'ab-btn' + (state.chainPatterns ? ' has-a' : '');
    chainBtn.textContent = state.chainPatterns ? '⛓ ON' : '⛓ OFF';
    chainBtn.addEventListener('click', () => {
      state.chainPatterns = !state.chainPatterns;
      state._patternLoopCount = 0;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });

    const chainLenLabel = document.createElement('label');
    chainLenLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.5rem;color:var(--muted)';
    chainLenLabel.textContent = 'Loops:';

    const chainLenInput = document.createElement('input');
    chainLenInput.type = 'number';
    chainLenInput.min = '1';
    chainLenInput.max = '16';
    chainLenInput.value = state.chainLength ?? 1;
    chainLenInput.style.cssText = 'width:36px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 3px;font-family:var(--font-mono);font-size:0.5rem';
    chainLenInput.addEventListener('change', () => {
      state.chainLength = parseInt(chainLenInput.value) || 1;
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });

    chainBar.append(chainBtn, chainLenLabel, chainLenInput);
    container.append(chainBar);

    // Bank selector (A–H)
    const bankRow = document.createElement('div');
    bankRow.style.cssText = 'display:flex;gap:2px;flex-shrink:0;margin-bottom:4px';
    BANK_LETTERS.forEach((letter, bi) => {
      const btn = document.createElement('button');
      btn.className = 'bank-btn' + (bi === activeBank ? ' active' : '');
      btn.textContent = letter;
      btn.style.cssText = 'flex:1;font-family:var(--font-mono);font-size:0.6rem;padding:3px;border-radius:2px;min-width:0';
      btn.addEventListener('click', () => {
        emit('state:change', { path: 'activeBank', value: bi });
        emit('state:change', { path: 'activePattern', value: 0 });
        this.render(container, { ...state, activeBank: bi, activePattern: 0 }, emit);
      });
      bankRow.append(btn);
    });
    container.append(bankRow);

    // Pattern grid (4×4 = 16 patterns)
    const patGrid = document.createElement('div');
    patGrid.className = 'banks-grid';
    patGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:1;overflow-y:auto';

    project.banks[activeBank].patterns.forEach((pat, pi) => {
      const btn = document.createElement('button');
      btn.className = 'bank-btn';
      btn.style.cssText = 'padding:4px 2px;display:flex;flex-direction:column;align-items:center;gap:1px;min-height:60px;max-height:80px';
      if (pi === activePattern) {
        btn.style.cssText += ';color:var(--accent);border-color:rgba(240,198,64,0.5);background:rgba(240,198,64,0.07)';
        if (state.chainPatterns) {
          btn.classList.add('chain-active');
        }
      }

      // A/B badges
      const isA = patternCompareA && patternCompareA.bank === activeBank && patternCompareA.pattern === pi;
      const isB = patternCompareB && patternCompareB.bank === activeBank && patternCompareB.pattern === pi;
      if (isA) {
        const badge = document.createElement('span');
        badge.className = 'ab-badge ab-badge-a';
        badge.textContent = 'A';
        btn.append(badge);
      }
      if (isB) {
        const badge = document.createElement('span');
        badge.className = 'ab-badge ab-badge-b';
        badge.textContent = 'B';
        // Offset B badge slightly if both A and B are on the same pattern
        if (isA) badge.style.left = '8px';
        btn.append(badge);
      }

      const num = document.createElement('span');
      num.style.cssText = 'font-size:0.8rem;font-family:var(--font-mono)';
      num.textContent = String(pi + 1).padStart(2, '0');

      // Compute density for name color
      const patTracksForDensity = pat.kit?.tracks ?? [];
      const totalPossibleSteps = (pat.length ?? 16) * 8;
      const totalActiveSteps = patTracksForDensity.reduce((sum, t) => sum + (t.steps?.slice(0, pat.length ?? 16).filter(s => s.active).length ?? 0), 0);
      const densityPct = totalPossibleSteps > 0 ? (totalActiveSteps / totalPossibleSteps) * 100 : 0;
      const nameColor = totalActiveSteps === 0
        ? 'var(--muted)'
        : densityPct > 50
          ? 'var(--accent)'
          : 'var(--screen-text)';

      const name = document.createElement('span');
      name.style.cssText = `font-size:0.52rem;color:${nameColor};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
      name.textContent = pat.name.replace(/^Pattern /, '');

      // Mini step density bars — 8 stacked horizontal bars, one per track
      const density = document.createElement('div');
      density.style.cssText = 'display:flex;flex-direction:column;gap:1px;margin-top:1px;width:100%;height:16px';

      const patTracks = pat.kit?.tracks ?? [];
      patTracks.slice(0, 8).forEach((trk, ti) => {
        const patLen = pat.length ?? 16;
        const activeCount = trk.steps?.slice(0, patLen).filter(s => s.active).length ?? 0;
        const fillPct = patLen > 0 ? (activeCount / patLen) * 100 : 0;

        const barTrack = document.createElement('div');
        barTrack.style.cssText = 'position:relative;width:100%;height:2px;background:rgba(255,255,255,0.06);border-radius:1px;overflow:hidden';

        const fill = document.createElement('div');
        fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${fillPct}%;border-radius:1px;background:${activeCount > 0 ? TRACK_COLORS[ti] : 'transparent'};transition:width 0.1s`;
        barTrack.append(fill);
        density.append(barTrack);
      });

      const tracksWithContent = patTracks.filter(t => t.steps?.some(s => s.active)).length;
      if (tracksWithContent > 0) {
        const countEl = document.createElement('div');
        countEl.style.cssText = 'font-size:0.38rem;font-family:var(--font-mono);color:var(--muted);margin-top:1px';
        countEl.textContent = `${tracksWithContent}t`;
        btn.append(num, name, density, countEl);
      } else {
        btn.append(num, name, density);
      }

      // Follow action badge
      const followAction = pat.followAction ?? 'next';
      const followIcons = { next: '→', loop: '↺', stop: '■', random: '?' };
      const followBadge = document.createElement('span');
      followBadge.style.cssText = 'position:absolute;bottom:2px;right:2px;font-size:0.45rem;opacity:0.6;color:var(--muted)';
      followBadge.textContent = followIcons[followAction] ?? '→';
      followBadge.style.cursor = 'pointer';
      followBadge.title = 'Click to cycle follow action: next → loop → stop → random';
      followBadge.addEventListener('click', e => {
        e.stopPropagation();
        const ACTIONS = ['next', 'loop', 'stop', 'random'];
        const current = pat.followAction ?? 'next';
        const idx = ACTIONS.indexOf(current);
        pat.followAction = ACTIONS[(idx + 1) % ACTIONS.length];
        const icons = { next:'→', loop:'↺', stop:'■', random:'?' };
        followBadge.textContent = icons[pat.followAction];
        emit('state:change', { param: 'followAction' });
      });
      btn.style.position = 'relative';

      // Active step count badge
      const lengthBadge = document.createElement('span');
      lengthBadge.style.cssText = 'position:absolute;top:2px;left:2px;font-family:var(--font-mono);font-size:0.44rem;color:var(--muted);opacity:0.7';
      const activeSteps = pat.kit.tracks?.reduce((sum, t) => sum + (t.steps?.filter(s => s.active).length ?? 0), 0) ?? 0;
      lengthBadge.textContent = activeSteps > 0 ? `${activeSteps}` : '';
      btn.append(lengthBadge);

      // Quick-clear button
      const clearBtn = document.createElement('button');
      clearBtn.className = 'bank-clear-btn';
      clearBtn.textContent = '×';
      clearBtn.title = 'Clear all steps in this pattern';
      clearBtn.style.cssText = 'position:absolute;top:1px;right:18px;font-size:0.7rem;background:transparent;border:none;color:var(--muted);cursor:pointer;padding:0 2px;line-height:1;display:none;z-index:2';
      btn.addEventListener('mouseenter', () => clearBtn.style.display = '');
      btn.addEventListener('mouseleave', () => clearBtn.style.display = 'none');
      clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm(`Clear all steps in pattern ${pi+1}?`)) return;
        pat.kit.tracks?.forEach(t => t.steps?.forEach(s => { s.active = false; }));
        emit('state:change', { param: 'pattern' });
        this.render(container, state, emit);
      });
      btn.append(followBadge, clearBtn);

      btn.addEventListener('click', () => {
        emit('state:change', { path: 'activeBank', value: activeBank });
        emit('state:change', { path: 'activePattern', value: pi });
        this.render(container, { ...state, activePattern: pi }, emit);
      });

      btn.addEventListener('dblclick', e => {
        e.stopPropagation();
        const originalName = pat.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName.replace(/^Pattern /, '');
        input.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;background:transparent;border:none;color:white;width:100%;outline:none;text-align:center;padding:0';
        // Replace the name span with an input
        name.replaceWith(input);
        input.focus();
        input.select();

        const commit = () => {
          const trimmed = input.value.trim();
          const bank = state.project.banks[activeBank];
          bank.patterns[pi].name = trimmed
            ? (trimmed.startsWith('Pattern ') ? trimmed : trimmed)
            : originalName;
          emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
          this.render(container, { ...state }, emit);
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') {
            input.removeEventListener('blur', commit);
            input.replaceWith(name);
          }
        });
      });

      // Duplicate button per pattern row
      const dupBtn = document.createElement('button');
      dupBtn.className = 'seq-btn';
      dupBtn.textContent = '⧉';
      dupBtn.title = 'Duplicate pattern to next empty slot';
      dupBtn.style.cssText = 'font-size:0.6rem;padding:1px 4px;margin-top:2px';
      dupBtn.addEventListener('click', e => {
        e.stopPropagation();
        const patterns = state.project.banks[activeBank].patterns;
        const isEmptyPattern = p => !p.kit?.tracks?.some(t => t.steps?.some(s => s.active));
        // Find first empty slot after current, then wrap around
        let targetIdx = -1;
        for (let i = pi + 1; i < patterns.length; i++) {
          if (isEmptyPattern(patterns[i])) { targetIdx = i; break; }
        }
        if (targetIdx === -1) {
          for (let i = 0; i < pi; i++) {
            if (isEmptyPattern(patterns[i])) { targetIdx = i; break; }
          }
        }
        // If still no empty slot, use next index (wrapping)
        if (targetIdx === -1) {
          targetIdx = (pi + 1) % patterns.length;
        }
        patterns[targetIdx] = JSON.parse(JSON.stringify(patterns[pi]));
        emit('state:change', { path: 'scale', value: state.scale });
        emit('toast', { msg: `Duplicated to slot ${String(targetIdx + 1).padStart(2, '0')}` });
      });
      btn.append(dupBtn);

      patGrid.append(btn);
    });
    container.append(patGrid);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-shrink:0';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'seq-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_copyPattern', value: { bank: activeBank, pattern: activePattern } })
    );

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'seq-btn';
    pasteBtn.textContent = 'Paste';
    pasteBtn.disabled = !hasPatternCopy;
    pasteBtn.style.opacity = hasPatternCopy ? '1' : '0.4';
    pasteBtn.addEventListener('click', () =>
      emit('state:change', { path: 'action_pastePattern', value: { bank: activeBank, pattern: activePattern } })
    );

    actions.append(copyBtn, pasteBtn);
    container.append(actions);

    // Copy to Bank... section
    const copyToDiv = document.createElement('div');
    copyToDiv.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 4px;border-bottom:1px solid #2a2a2a;flex-shrink:0';

    const copyToLbl = document.createElement('label');
    copyToLbl.textContent = 'Copy to:';
    Object.assign(copyToLbl.style, { fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--muted)' });

    const bankSelect = document.createElement('select');
    bankSelect.style.cssText = 'background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 4px;font-family:var(--font-mono);font-size:0.52rem';
    'ABCDEFGH'.split('').forEach((letter, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `Bank ${letter}`;
      if (i === activeBank) opt.selected = true;
      bankSelect.append(opt);
    });

    const patSelect = document.createElement('select');
    patSelect.style.cssText = bankSelect.style.cssText;
    for (let i = 0; i < 16; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `P${String(i + 1).padStart(2, '0')}`;
      patSelect.append(opt);
    }

    const copyToBtn = document.createElement('button');
    copyToBtn.className = 'seq-btn';
    copyToBtn.textContent = 'Copy To →';
    copyToBtn.addEventListener('click', () => {
      const targetBank = parseInt(bankSelect.value);
      const targetPat = parseInt(patSelect.value);
      const src = state.project.banks[activeBank].patterns[activePattern];
      state.project.banks[targetBank].patterns[targetPat] = JSON.parse(JSON.stringify(src));
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });

    copyToDiv.append(copyToLbl, bankSelect, patSelect, copyToBtn);
    container.append(copyToDiv);

    // Pattern info panel
    const infoPanel = document.createElement('div');
    infoPanel.className = 'pattern-info-panel';
    const pat = project.banks[activeBank].patterns[activePattern];
    const activeTracks = pat.kit.tracks.filter(t => t.steps.some(s => s.active)).length;
    const totalSteps = pat.kit.tracks.reduce((sum, t) => sum + t.steps.filter(s => s.active).length, 0);
    infoPanel.innerHTML = `
      <span class="pinfo-name">${pat.name}</span>
      <span class="pinfo-stat">${pat.length} steps</span>
      <span class="pinfo-stat">${activeTracks} tracks</span>
      <span class="pinfo-stat">${totalSteps} notes</span>
    `;

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'seq-btn';
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Export pattern as JSON';
    exportBtn.style.cssText = 'font-size:0.5rem;padding:2px 6px';
    exportBtn.addEventListener('click', () => {
      const bankName = BANK_LETTERS[activeBank];
      const patternName = pat.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `confusynth-pattern-${bankName}-${patternName}.json`;
      const blob = new Blob([JSON.stringify(pat, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    });

    // Import button
    const importBtn = document.createElement('button');
    importBtn.className = 'seq-btn';
    importBtn.textContent = 'Import';
    importBtn.title = 'Import pattern from JSON file';
    importBtn.style.cssText = 'font-size:0.5rem;padding:2px 6px';
    importBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const imported = JSON.parse(e.target.result);
            if (!imported.kit) {
              emit('toast', { msg: 'Invalid pattern: missing kit' });
              return;
            }
            const target = state.project.banks[activeBank].patterns[activePattern];
            Object.assign(target, JSON.parse(JSON.stringify(imported)));
            emit('state:change', { path: 'scale', value: state.scale });
            emit('toast', { msg: 'Pattern imported' });
          } catch (err) {
            emit('toast', { msg: 'Import failed: invalid JSON' });
          }
        };
        reader.readAsText(file);
      });
      document.body.appendChild(fileInput);
      fileInput.click();
      document.body.removeChild(fileInput);
    });

    infoPanel.append(exportBtn, importBtn);
    container.append(infoPanel);
  },

  knobMap: [
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
    { label: '—', param: null, min: 0, max: 1, step: 1 },
  ],

  keyboardContext: 'banks', // A↔B swap: use Mark A / Mark B / A↔B buttons above pattern grid
};
