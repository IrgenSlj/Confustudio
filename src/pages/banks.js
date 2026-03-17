// src/pages/banks.js — Bank/Pattern browser

const BANK_LETTERS = ['A','B','C','D','E','F','G','H'];

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const { project, activeBank, activePattern, copyBuffer } = state;

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

      btn.append(num, name);
      btn.addEventListener('click', () => {
        emit('state:change', { path: 'activeBank', value: activeBank });
        emit('state:change', { path: 'activePattern', value: pi });
        this.render(container, { ...state, activePattern: pi }, emit);
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
    pasteBtn.disabled = !copyBuffer;
    pasteBtn.style.opacity = copyBuffer ? '1' : '0.4';
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
