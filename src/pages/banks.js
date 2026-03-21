// src/pages/banks.js — Bank/Pattern browser

const BANK_LETTERS = ['A','B','C','D','E','F','G','H'];

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const { project, activeBank, activePattern, copyBuffer } = state;
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

  keyboardContext: 'banks',
};
