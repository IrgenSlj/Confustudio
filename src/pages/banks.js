// src/pages/banks.js — Bank/Pattern browser

const BANK_LETTERS = ['A','B','C','D','E','F','G','H'];

export default {
  render(container, state, emit) {
    container.innerHTML = '';

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

    abBar.append(markABtn, markBBtn, swapBtn);
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
    bankRow.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-bottom:8px;flex-shrink:0';
    BANK_LETTERS.forEach((letter, bi) => {
      const btn = document.createElement('button');
      btn.className = 'bank-btn' + (bi === activeBank ? ' active' : '');
      btn.textContent = letter;
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
    patGrid.style.cssText = 'flex:1;min-height:0;overflow-y:auto';

    project.banks[activeBank].patterns.forEach((pat, pi) => {
      const btn = document.createElement('button');
      btn.className = 'bank-btn';
      btn.style.cssText = 'padding:8px 4px;display:flex;flex-direction:column;align-items:center;gap:2px';
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

      const name = document.createElement('span');
      name.style.cssText = 'font-size:0.52rem;color:var(--muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      name.textContent = pat.name.replace(/^Pattern /, '');

      // Mini step density dots — show which tracks have steps
      const density = document.createElement('div');
      density.style.cssText = 'display:flex;gap:1px;justify-content:center;margin-top:2px;flex-wrap:wrap;max-width:100%';

      const patTracks = pat.kit?.tracks ?? [];
      patTracks.slice(0, 8).forEach((trk, ti) => {
        const activeCount = trk.steps?.slice(0, pat.length ?? 16).filter(s => s.active).length ?? 0;
        const dot = document.createElement('div');
        // Width proportional to active step density (0–16 → 1–5px)
        const w = Math.max(1, Math.round(activeCount / (pat.length ?? 16) * 5));
        dot.style.cssText = `
          width: ${w}px; height: 3px; border-radius: 1px;
          background: ${activeCount > 0
            ? ['#f0c640','#5add71','#67d7ff','#ff8c52','#c67dff','#ff6eb4','#40e0d0','#f05b52'][ti]
            : 'rgba(255,255,255,0.08)'};
        `;
        density.append(dot);
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
