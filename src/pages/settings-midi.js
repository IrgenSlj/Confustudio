// src/pages/settings-midi.js — MIDI config section

import { saveState } from '../state.js';

export function renderMidiSection(container, state, emit) {
  // ── MIDI Output Routing section ──────────────────────────────────────────
  const midiSection = container.querySelector('.settings-section');
  if (midiSection) {
    // ── MIDI Reconnect button ───────────────────────────────────────────────
    const midiReconnectBtn = document.createElement('button');
    midiReconnectBtn.className = 'screen-btn';
    midiReconnectBtn.textContent = '\u21BA Reconnect MIDI devices';
    midiReconnectBtn.title = 'Re-scan for MIDI devices if a device was plugged in after app load';
    midiReconnectBtn.style.cssText = 'margin-top:8px;width:100%';

    midiReconnectBtn.addEventListener('click', async () => {
      midiReconnectBtn.textContent = '\u2026Scanning';
      midiReconnectBtn.disabled = true;
      try {
        const access = await navigator.requestMIDIAccess({ sysex: false });
        emit('state:change', { path: 'midiInput', value: state.midiInput });
        midiReconnectBtn.textContent = '\u2713 Devices refreshed';
      } catch (e) {
        midiReconnectBtn.textContent = '\u26A0 MIDI access denied';
      }
      setTimeout(() => {
        midiReconnectBtn.disabled = false;
        midiReconnectBtn.textContent = '\u21BA Reconnect MIDI devices';
      }, 2000);
    });

    midiSection.append(midiReconnectBtn);

    const midiRoutingSection = document.createElement('div');
    midiRoutingSection.style.cssText = 'margin-top:10px;border-top:1px solid var(--border);padding-top:8px';
    const midiRoutingTitle = document.createElement('div');
    midiRoutingTitle.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);margin-bottom:6px';
    midiRoutingTitle.textContent = 'MIDI OUTPUT ROUTING';
    midiRoutingSection.append(midiRoutingTitle);

    for (let ti = 0; ti < 8; ti++) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px';
      const label = document.createElement('span');
      label.style.cssText = 'font-family:var(--font-mono);font-size:0.48rem;color:var(--muted);min-width:40px';
      label.textContent = `TRK ${ti + 1}`;

      const select = document.createElement('select');
      select.style.cssText = 'font-size:0.48rem;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:3px;padding:1px 4px';

      const offOpt = document.createElement('option');
      offOpt.value = '0'; offOpt.textContent = 'Off (internal)';
      select.append(offOpt);

      for (let ch = 1; ch <= 16; ch++) {
        const opt = document.createElement('option');
        opt.value = String(ch); opt.textContent = `Ch ${ch}`;
        select.append(opt);
      }

      const currentCh = state.midiOutputChannels?.[ti] ?? 0;
      select.value = String(currentCh);

      select.addEventListener('change', () => {
        if (!state.midiOutputChannels) state.midiOutputChannels = new Array(8).fill(0);
        state.midiOutputChannels[ti] = parseInt(select.value);
        emit('state:change', { param: 'midiOutputChannels', value: state.midiOutputChannels });
      });

      row.append(label, select);
      midiRoutingSection.append(row);
    }

    midiSection.append(midiRoutingSection);
  }

  // ── MIDI clock live status display ───────────────────────────────────────
  if (container._midiClockStatusInterval) {
    clearInterval(container._midiClockStatusInterval);
    container._midiClockStatusInterval = null;
  }
  function updateMidiClockStatusDisplay() {
    const statusEl = container.querySelector('#midi-clock-status');
    if (!statusEl) return;
    if (state._midiClockReceiving && state._midiClockBpm != null) {
      statusEl.style.color = 'var(--accent)';
      statusEl.textContent = `\u2713 ${state._midiClockBpm.toFixed(1)} BPM`;
    } else {
      statusEl.style.color = 'var(--muted)';
      statusEl.textContent = '\u2014 no signal';
    }
  }
  updateMidiClockStatusDisplay();
  container._midiClockStatusInterval = setInterval(updateMidiClockStatusDisplay, 1000);
  const _prevCleanup = container._cleanup;
  container._cleanup = () => {
    clearInterval(container._midiClockStatusInterval);
    container._midiClockStatusInterval = null;
    container._cleanupPerf?.();
    _prevCleanup?.();
  };

  // ── MIDI Learn section ───────────────────────────────────────────────────
  if (!state.midiLearnMap) state.midiLearnMap = {};

  const midiLearnSection = document.createElement('div');
  midiLearnSection.style.cssText = 'margin-top:10px;flex-shrink:0;border-top:1px solid var(--border);padding-top:8px';
  midiLearnSection.dataset.settingsTab = 'MIDI';

  const learnHeader = document.createElement('div');
  learnHeader.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';

  const learnTitle = document.createElement('span');
  learnTitle.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em';
  learnTitle.textContent = 'MIDI Learn';

  const learnToggle = document.createElement('button');
  learnToggle.className = 'ctx-btn' + (state.midiLearnMode ? ' active' : '');
  learnToggle.textContent = state.midiLearnMode ? 'Learning\u2026' : 'MIDI Learn Mode';
  learnToggle.style.marginLeft = 'auto';
  learnToggle.addEventListener('click', () => {
    state.midiLearnMode = !state.midiLearnMode;
    learnToggle.classList.toggle('active', state.midiLearnMode);
    learnToggle.textContent = state.midiLearnMode ? 'Learning\u2026' : 'MIDI Learn Mode';
    learnStatus.style.display = state.midiLearnMode ? '' : 'none';
    saveState(state);
  });

  learnHeader.append(learnTitle, learnToggle);
  midiLearnSection.append(learnHeader);

  const learnStatus = document.createElement('div');
  learnStatus.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--accent);margin-bottom:6px;display:' + (state.midiLearnMode ? '' : 'none');
  learnStatus.textContent = 'Move a CC knob on your controller\u2026';
  midiLearnSection.append(learnStatus);

  const mappings = Object.entries(state.midiLearnMap);
  if (mappings.length > 0) {
    const table = document.createElement('div');
    table.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin-bottom:6px';
    const hCC = document.createElement('span');
    hCC.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);text-transform:uppercase';
    hCC.textContent = 'CC';
    const hParam = document.createElement('span');
    hParam.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);text-transform:uppercase';
    hParam.textContent = 'Parameter';
    table.append(hCC, hParam);
    mappings.forEach(([cc, param]) => {
      const ccEl = document.createElement('span');
      ccEl.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--accent)';
      ccEl.textContent = cc;
      const paramEl = document.createElement('span');
      paramEl.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--screen-text)';
      paramEl.textContent = param;
      table.append(ccEl, paramEl);
    });
    midiLearnSection.append(table);
  } else {
    const noMappings = document.createElement('div');
    noMappings.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);margin-bottom:6px';
    noMappings.textContent = 'No mappings yet.';
    midiLearnSection.append(noMappings);
  }

  // ── MIDI Learn table with per-row delete + learning highlight ─────────────
  function renderMidiLearnTable() {
    midiLearnSection.querySelectorAll('.midi-learn-table, .midi-learn-empty').forEach(el => el.remove());

    const mappings = Object.entries(state.midiLearnMap);
    if (mappings.length > 0) {
      const table = document.createElement('div');
      table.className = 'midi-learn-table';
      table.style.cssText = 'display:grid;grid-template-columns:auto 60px 1fr auto;gap:2px 6px;margin-bottom:6px;align-items:center';

      const hCC = document.createElement('span');
      hCC.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);text-transform:uppercase';
      hCC.textContent = 'CC';
      const hBar = document.createElement('span');
      hBar.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);text-transform:uppercase';
      hBar.textContent = 'Level';
      const hParam = document.createElement('span');
      hParam.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);text-transform:uppercase';
      hParam.textContent = 'Parameter';
      const hDel = document.createElement('span');
      table.append(hCC, hBar, hParam, hDel);

      mappings.forEach(([cc, param]) => {
        const isLearning = state.midiLearnMode && state.midiLearnTarget === param;
        const ccEl = document.createElement('span');
        ccEl.style.cssText = `font-family:var(--font-mono);font-size:0.56rem;color:${isLearning ? 'var(--live)' : 'var(--accent)'}`;
        if (isLearning) ccEl.style.fontWeight = 'bold';
        ccEl.textContent = cc;

        const barCell = document.createElement('div');
        barCell.style.cssText = 'width:60px;padding:1px 4px';
        const bar = document.createElement('div');
        bar.style.cssText = `height:4px;background:var(--accent);border-radius:2px;width:${Math.round((parseInt(cc) / 127) * 60)}px;opacity:0.7`;
        barCell.append(bar);

        const paramEl = document.createElement('span');
        paramEl.style.cssText = `font-family:var(--font-mono);font-size:0.56rem;color:${isLearning ? 'var(--live)' : 'var(--screen-text)'}`;
        if (isLearning) paramEl.style.fontWeight = 'bold';
        paramEl.textContent = param;
        const delBtn = document.createElement('button');
        delBtn.className = 'ctx-btn';
        delBtn.textContent = '\u00D7';
        delBtn.title = 'Remove mapping';
        delBtn.style.cssText = 'font-size:0.65rem;padding:0 4px;line-height:1;color:var(--record);border-color:rgba(240,91,82,0.3)';
        delBtn.addEventListener('click', () => {
          delete state.midiLearnMap[cc];
          saveState(state);
          renderMidiLearnTable();
        });
        if (isLearning) {
          [ccEl, paramEl].forEach(el => el.classList?.add?.('learning'));
          ccEl.style.background = 'rgba(0,200,100,0.08)';
          paramEl.style.background = 'rgba(0,200,100,0.08)';
        }
        table.append(ccEl, barCell, paramEl, delBtn);
      });
      midiLearnSection.insertBefore(table, midiLearnActionBar);
    } else {
      const noMappings = document.createElement('div');
      noMappings.className = 'midi-learn-empty';
      noMappings.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);margin-bottom:6px';
      noMappings.textContent = 'No mappings yet.';
      midiLearnSection.insertBefore(noMappings, midiLearnActionBar);
    }
  }

  const midiLearnActionBar = document.createElement('div');
  midiLearnActionBar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'seq-btn';
  clearBtn.textContent = 'Clear All';
  clearBtn.style.cssText = 'font-size:0.58rem;border-color:rgba(240,91,82,0.3);color:var(--record)';
  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear all MIDI learn mappings?')) return;
    state.midiLearnMap = {};
    saveState(state);
    renderMidiLearnTable();
    emit('state:change', { path: 'midiLearnMap', value: {} });
  });

  const exportMidiBtn = document.createElement('button');
  exportMidiBtn.className = 'seq-btn';
  exportMidiBtn.textContent = 'Export Map';
  exportMidiBtn.style.cssText = 'font-size:0.58rem';
  exportMidiBtn.addEventListener('click', () => {
    const json = JSON.stringify(state.midiLearnMap, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `midi-map-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const importMidiInput = document.createElement('input');
  importMidiInput.type = 'file';
  importMidiInput.accept = '.json';
  importMidiInput.style.display = 'none';
  importMidiInput.addEventListener('change', () => {
    const file = importMidiInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const map = JSON.parse(ev.target.result);
        if (typeof map !== 'object' || Array.isArray(map)) throw new Error('Expected an object');
        state.midiLearnMap = map;
        saveState(state);
        renderMidiLearnTable();
        emit('state:change', { path: 'midiLearnMap', value: map });
      } catch (err) {
        alert('Invalid MIDI map file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
  const importMidiBtn = document.createElement('button');
  importMidiBtn.className = 'seq-btn';
  importMidiBtn.textContent = 'Import Map';
  importMidiBtn.style.cssText = 'font-size:0.58rem';
  importMidiBtn.addEventListener('click', () => importMidiInput.click());

  midiLearnActionBar.append(clearBtn, exportMidiBtn, importMidiInput, importMidiBtn);
  midiLearnSection.append(midiLearnActionBar);

  renderMidiLearnTable();

  container.append(midiLearnSection);

  // ── MIDI Programs ─────────────────────────────────────────────────────────
  const progSection = document.createElement('div');
  progSection.className = 'settings-section';
  progSection.dataset.settingsTab = 'MIDI';
  progSection.innerHTML = '<div class="settings-label">MIDI PROGRAMS (0=off)</div>';
  const progGrid = document.createElement('div');
  progGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:3px;';
  const tracks = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks;
  tracks.forEach((trk, ti) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:0.52rem;color:var(--muted)';
    const prog = trk.midiProgram != null ? trk.midiProgram + 1 : 0;
    row.innerHTML = `<span>T${ti+1}</span><input type="number" min="0" max="128" value="${prog}" style="width:38px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 3px;font-family:var(--font-mono);font-size:0.52rem">`;
    row.querySelector('input').addEventListener('change', e => {
      const v = parseInt(e.target.value) || 0;
      trk.midiProgram = v > 0 ? v - 1 : null;
      if (v > 0) {
        const eng = window._confustudioEngine;
        if (eng?.sendProgramChange) eng.sendProgramChange(state.midiChannel ?? 1, v - 1);
      }
      emit('state:change', { path: 'euclidBeats', value: state.euclidBeats });
    });
    progGrid.append(row);
  });
  progSection.append(progGrid);
  container.append(progSection);

  // ── MIDI Channels ────────────────────────────────────────────────────────
  const midiChSection = document.createElement('div');
  midiChSection.className = 'settings-section';
  midiChSection.dataset.settingsTab = 'MIDI';
  midiChSection.innerHTML = '<div class="settings-label">MIDI CHANNELS (0=global)</div>';
  const midiChGrid = document.createElement('div');
  midiChGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:3px;';
  tracks.forEach((trk, ti) => {
    const val = trk.midiChannel ?? 0;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:0.52rem;color:var(--muted)';
    row.innerHTML = `<span>T${ti+1}</span><input type="number" min="0" max="16" value="${val}"
      style="width:38px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:1px 3px;font-family:var(--font-mono);font-size:0.52rem">`;
    row.querySelector('input').addEventListener('change', e => {
      const v = parseInt(e.target.value) || 0;
      trk.midiChannel = v > 0 ? v : null;
      emit('state:change', { path: 'trackMidiChannel', value: { trackIndex: ti, midiChannel: trk.midiChannel } });
      saveState(state);
    });
    midiChGrid.append(row);
  });
  midiChSection.append(midiChGrid);
  container.append(midiChSection);
}
