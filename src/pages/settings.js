// src/pages/settings.js — MIDI, clock, audio, storage, sync, version

import { saveState, getActivePattern } from '../state.js';

const VERSION = 'v3.0.0';

function infoRow(label, value, color) {
  return `<div class="settings-row">
    <label>${label}</label>
    <span style="font-family:var(--font-mono);font-size:0.62rem;color:${color || 'var(--screen-text)'}">${value}</span>
  </div>`;
}

export default {
  render(container, state, emit) {
    // Stop any running perf monitor rAF before wiping container
    container._cleanupPerf?.();

    const midiOutputs = state.engine?.midiOutputs || state.midiOutputs || [];
    const sampleRate  = state.audioContext?.sampleRate ?? '—';
    const latencyMs   = state.audioContext?.baseLatency != null
      ? (state.audioContext.baseLatency * 1000).toFixed(1) + 'ms'
      : '—';
    const outputLatMs = state.audioContext?.outputLatency != null
      ? (state.audioContext.outputLatency * 1000).toFixed(1) + 'ms'
      : '—';
    const workletReady = state.engine?._workletReady !== false;
    const linkBpm     = state.abletonLink && state._linkBpm ? state._linkBpm.toFixed(1) : null;

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0">
        <span class="page-title" style="margin:0">Settings</span>
        <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);margin-left:auto">CONFUsynth ${VERSION}</span>
      </div>
      <div class="settings-grid" style="flex:1;min-height:0">

        <!-- MIDI -->
        <div class="settings-section">
          <h4>MIDI</h4>
          <div class="settings-row">
            <label>Output</label>
            <select data-action="midiOutput">
              <option value="">— none —</option>
              ${midiOutputs.map(o => `<option value="${o.id || o.name}"${state.engine?.midiOutput === o ? ' selected' : ''}>${o.name || o.id}</option>`).join('')}
            </select>
          </div>
          <div class="settings-row">
            <label>Channel</label>
            <input type="number" min="1" max="16" value="${state.midiChannel ?? 1}" data-action="midiChannel"
                   style="width:48px;font-family:var(--font-mono);font-size:0.62rem;background:var(--screen-bg);color:var(--screen-text);border:1px solid var(--border);padding:2px 4px">
          </div>
          <div class="settings-row" style="margin-top:6px">
            <label>Clock Out</label>
            <button class="ctx-btn${state.midiClockOut ? ' active' : ''}" data-action="midiClockOut">
              ${state.midiClockOut ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <!-- Clock -->
        <div class="settings-section">
          <h4>Clock</h4>
          <div class="settings-row">
            <label>Source</label>
            <div style="display:flex;gap:4px;align-items:center">
              ${['internal', 'midi', 'link'].map(src => `
                <button class="ctx-btn${(state.clockSource || 'internal') === src ? ' active' : ''}"
                        data-action="clockSource" data-value="${src}">
                  ${src === 'internal' ? 'INT' : src === 'midi' ? 'MIDI' : 'LINK'}
                </button>`).join('')}
              <span id="midi-clock-status" style="font-family:var(--font-mono);font-size:0.52rem;color:var(--accent);margin-left:4px">— no signal</span>
            </div>
          </div>
          <div class="settings-row" style="margin-top:6px">
            <label>Swing</label>
            <span style="font-family:var(--font-mono);font-size:0.62rem;color:var(--accent)">${Math.round((state.swing ?? 0) * 100)}%</span>
          </div>
        </div>

        <!-- Sync -->
        <div class="settings-section">
          <h4>SYNC</h4>
          <div class="settings-row">
            <label>Ableton Link</label>
            <button class="ctx-btn${state.abletonLink ? ' active' : ''}" data-action="abletonLink">
              ${state.abletonLink ? 'ON' : 'OFF'}
            </button>
          </div>
          ${linkBpm ? `<div class="settings-row">${infoRow('', 'LINK: ' + linkBpm + ' BPM', 'var(--accent)')}</div>` : ''}
        </div>

        <!-- Audio -->
        <div class="settings-section">
          <h4>AUDIO</h4>
          ${infoRow('Status',
            state.audioContext ? (state.audioContext.state === 'running' ? 'Running' : state.audioContext.state) : 'Not initialised',
            state.audioContext ? 'var(--live)' : 'var(--muted)')}
          <button class="screen-btn" data-action="initAudio" style="margin:6px 0">Init Audio</button>
          ${infoRow('RATE',    'RATE: ' + sampleRate + (sampleRate !== '—' ? ' Hz' : ''), 'var(--screen-text)')}
          ${infoRow('LATENCY', 'LATENCY: ' + latencyMs, 'var(--screen-text)')}
          ${infoRow('RESAMPLER',
            'RESAMPLER: ' + (workletReady ? 'READY' : 'PENDING'),
            workletReady ? 'var(--live)' : 'var(--muted)')}
          <div class="settings-row" style="margin-top:8px">
            <label>Metronome</label>
            <button class="ctx-btn${state.metronome ? ' active' : ''}" data-action="metronome">
              ${state.metronome ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <!-- Storage -->
        <div class="settings-section">
          <h4>Storage</h4>
          <button class="screen-btn" data-action="clearStorage"
                  style="border-color:rgba(240,91,82,0.3);color:var(--record)">
            Clear Saved State
          </button>
          <div style="font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);margin-top:10px;line-height:1.6">
            CONFUsynth ${VERSION}<br>Web Audio API sequencer<br>ES modules
          </div>
        </div>

        <!-- Performance Monitor -->
        <div class="settings-section" id="perf-section">
          <h4>CPU / Performance</h4>
          <div style="font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);margin-bottom:4px" id="perf-latency-static">
            Base latency: ${latencyMs} | Output: ${outputLatMs}
          </div>
        </div>

      </div>`;

    // ── Project metadata section ─────────────────────────────────────────────
    if (!state.project.createdAt) state.project.createdAt = Date.now();

    const metaSection = document.createElement('div');
    metaSection.className = 'settings-section';
    metaSection.style.cssText = 'flex-shrink:0;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)';
    metaSection.innerHTML = `
      <div class="settings-label">PROJECT INFO</div>
      <div class="settings-row">
        <label>Name</label>
        <input type="text" value="${(state.project.name ?? '').replace(/"/g, '&quot;')}" id="proj-name-input" style="flex:1;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:2px 5px;font-family:var(--font-mono);font-size:0.55rem">
      </div>
      <div class="settings-row">
        <label>Author</label>
        <input type="text" value="${(state.project.author ?? '').replace(/"/g, '&quot;')}" id="proj-author-input" style="flex:1;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:2px 5px;font-family:var(--font-mono);font-size:0.55rem">
      </div>
      <div class="settings-row">
        <label>BPM</label>
        <input type="number" min="40" max="240" value="${state.bpm ?? 120}" id="proj-bpm-input" style="width:52px;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:2px 5px;font-family:var(--font-mono);font-size:0.55rem">
      </div>
      <div class="settings-row">
        <label>Notes</label>
        <textarea id="proj-desc-input" rows="2" style="flex:1;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:2px 5px;font-family:var(--font-mono);font-size:0.52rem;resize:vertical">${state.project.description ?? ''}</textarea>
      </div>
      <div class="settings-row" style="color:var(--muted);font-size:0.48rem;font-family:var(--font-mono)">
        Created: ${state.project.createdAt ? new Date(state.project.createdAt).toLocaleDateString() : 'Unknown'}
      </div>
    `;
    container.prepend(metaSection);

    // Wire metadata inputs
    metaSection.querySelector('#proj-name-input').addEventListener('input', e => {
      if (state.project) {
        state.project.name = e.target.value;
        const topbarEl = document.getElementById('project-name');
        if (topbarEl) topbarEl.textContent = e.target.value || 'CONFUsynth';
        saveState(state);
      }
    });
    metaSection.querySelector('#proj-author-input').addEventListener('blur', e => {
      if (state.project) {
        state.project.author = e.target.value;
        saveState(state);
      }
    });
    metaSection.querySelector('#proj-bpm-input').addEventListener('change', e => {
      const v = Math.max(40, Math.min(240, parseInt(e.target.value, 10) || 120));
      e.target.value = v;
      state.bpm = v;
      emit('state:change', { path: 'bpm', value: v });
      saveState(state);
    });
    metaSection.querySelector('#proj-desc-input').addEventListener('blur', e => {
      if (state.project) {
        state.project.description = e.target.value;
        saveState(state);
      }
    });

    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
      const action = btn.dataset.action;

      if (action === 'midiClockOut') {
        const next = !state.midiClockOut;
        state.midiClockOut = next;
        btn.classList.toggle('active', next);
        btn.textContent = next ? 'ON' : 'OFF';
        if (next && state.engine?.startMidiClock) state.engine.startMidiClock(state.bpm);
        else if (!next && state.engine?.stopMidiClock) state.engine.stopMidiClock();
        saveState(state);
      }

      if (action === 'clockSource') {
        const src = btn.dataset.value;
        state.clockSource = src;
        container.querySelectorAll('[data-action="clockSource"]').forEach(b =>
          b.classList.toggle('active', b.dataset.value === src)
        );
        saveState(state);
      }

      if (action === 'abletonLink') {
        const next = !state.abletonLink;
        state.abletonLink = next;
        btn.classList.toggle('active', next);
        btn.textContent = next ? 'ON' : 'OFF';
        if (next) {
          const ws = new WebSocket('ws://127.0.0.1:4173/link');
          state._linkWs = ws;
          ws.addEventListener('message', ev => {
            try {
              const msg = JSON.parse(ev.data);
              if (typeof msg.bpm === 'number') {
                state.bpm = msg.bpm;
                state._linkBpm = msg.bpm;
                if (state.engine?.startMidiClock) state.engine.startMidiClock(msg.bpm);
                emit('state:change', { path: 'bpm', value: msg.bpm });
              }
            } catch (_) {}
          });
        } else {
          if (state._linkWs) { state._linkWs.close(); state._linkWs = null; }
          state._linkBpm = null;
        }
        saveState(state);
      }

      if (action === 'metronome') {
        const next = !state.metronome;
        state.metronome = next;
        btn.classList.toggle('active', next);
        btn.textContent = next ? 'On' : 'Off';
        emit('state:change', { path: 'metronome', value: next });
        saveState(state);
      }

      if (action === 'initAudio') {
        emit('state:change', { path: 'action_initAudio', value: true });
      }

      if (action === 'clearStorage') {
        if (confirm('Clear all saved state? This cannot be undone.')) {
          emit('state:change', { path: 'action_clearStorage', value: true });
        }
      }
    });

    // ── MIDI clock live status display ───────────────────────────────────────
    // Update the #midi-clock-status span every second with live BPM or no-signal text.
    // The interval is registered on container._cleanup so it is cleared on page change.
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
    updateMidiClockStatusDisplay(); // run immediately on render
    container._midiClockStatusInterval = setInterval(updateMidiClockStatusDisplay, 1000);
    // Register cleanup so navigating away clears the interval
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

    const learnHeader = document.createElement('div');
    learnHeader.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';

    const learnTitle = document.createElement('span');
    learnTitle.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em';
    learnTitle.textContent = 'MIDI Learn';

    const learnToggle = document.createElement('button');
    learnToggle.className = 'ctx-btn' + (state.midiLearnMode ? ' active' : '');
    learnToggle.textContent = state.midiLearnMode ? 'Learning…' : 'MIDI Learn Mode';
    learnToggle.style.marginLeft = 'auto';
    learnToggle.addEventListener('click', () => {
      state.midiLearnMode = !state.midiLearnMode;
      learnToggle.classList.toggle('active', state.midiLearnMode);
      learnToggle.textContent = state.midiLearnMode ? 'Learning…' : 'MIDI Learn Mode';
      learnStatus.style.display = state.midiLearnMode ? '' : 'none';
      saveState(state);
    });

    learnHeader.append(learnTitle, learnToggle);
    midiLearnSection.append(learnHeader);

    const learnStatus = document.createElement('div');
    learnStatus.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--accent);margin-bottom:6px;display:' + (state.midiLearnMode ? '' : 'none');
    learnStatus.textContent = 'Move a CC knob on your controller…';
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
      // Remove previous table/no-mappings element
      midiLearnSection.querySelectorAll('.midi-learn-table, .midi-learn-empty').forEach(el => el.remove());

      const mappings = Object.entries(state.midiLearnMap);
      if (mappings.length > 0) {
        const table = document.createElement('div');
        table.className = 'midi-learn-table';
        table.style.cssText = 'display:grid;grid-template-columns:auto 60px 1fr auto;gap:2px 6px;margin-bottom:6px;align-items:center';

        // Headers
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

          // CC bar cell
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
          delBtn.textContent = '×';
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

    // Action bar: Clear All, Export, Import
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

    // ── Project Backups ───────────────────────────────────────────────────────
    const backupSection = document.createElement('div');
    backupSection.className = 'settings-section';
    backupSection.style.cssText = 'flex-shrink:0;border-top:1px solid var(--border);padding-top:8px;margin-top:8px';

    function renderBackups() {
      backupSection.innerHTML = '<div class="settings-label">BACKUPS</div>';
      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
      const backupBtn = document.createElement('button');
      backupBtn.className = 'ctx-btn';
      backupBtn.textContent = 'Backup Now';
      backupBtn.addEventListener('click', () => {
        const now = Date.now();
        const key = `confusynth_backup_${now}`;
        localStorage.setItem(key, JSON.stringify({ ...state.project, timestamp: now }));
        emit('toast', { msg: 'Backup saved' });
        renderBackups();
      });
      actionRow.append(backupBtn);
      backupSection.append(actionRow);

      const keys = Object.keys(localStorage)
        .filter(k => k.startsWith('confusynth_backup_'))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 5);

      if (keys.length === 0) {
        const none = document.createElement('div');
        none.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;color:var(--muted)';
        none.textContent = 'No backups';
        backupSection.append(none);
      } else {
        keys.forEach(key => {
          let backup = null;
          try { backup = JSON.parse(localStorage.getItem(key)); } catch (_) {}
          const rawTs = backup?.timestamp ?? backup?.savedAt ?? parseInt(key.replace('confusynth_backup_', ''), 10);
          const date = new Date(rawTs ?? Date.now());
          const dateStr = date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const label = isNaN(date.getTime()) ? key : dateStr;
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px';
          const lbl = document.createElement('span');
          lbl.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;color:var(--muted);flex:1';
          lbl.textContent = label;
          const restoreBtn = document.createElement('button');
          restoreBtn.className = 'ctx-btn';
          restoreBtn.textContent = 'Restore';
          restoreBtn.style.fontSize = '0.5rem';
          restoreBtn.addEventListener('click', () => {
            if (!confirm('Restore this backup? Current project will be lost.')) return;
            try {
              const proj = JSON.parse(localStorage.getItem(key));
              state.project = proj;
              saveState(state);
              emit('state:change', { path: 'scale', value: state.scale });
              emit('toast', { msg: 'Backup restored' });
            } catch(e) { emit('toast', { msg: 'Restore failed' }); }
          });
          const delBtn = document.createElement('button');
          delBtn.className = 'ctx-btn';
          delBtn.textContent = '×';
          delBtn.style.cssText = 'font-size:0.5rem;color:var(--muted)';
          delBtn.addEventListener('click', () => {
            localStorage.removeItem(key);
            renderBackups();
          });
          row.append(lbl, restoreBtn, delBtn);
          backupSection.append(row);
        });
      }
    }
    renderBackups();
    container.append(backupSection);

    // ── Oscilloscope Mode Selector ────────────────────────────────────────────
    const oscSection = document.createElement('div');
    oscSection.className = 'settings-section';
    oscSection.innerHTML = `<div class="settings-label">OSCILLOSCOPE</div>`;
    const oscModeBar = document.createElement('div');
    oscModeBar.className = 'settings-row';
    oscModeBar.style.gap = '4px';
    const oscBtns = [];
    ['wave', 'spectrum', 'lissajous'].forEach(mode => {
      const btn = document.createElement('button');
      btn.className = 'seq-btn' + ((state.oscMode ?? 'wave') === mode ? ' active' : '');
      btn.textContent = mode === 'wave' ? 'Wave' : mode === 'spectrum' ? 'Spectrum' : 'XY';
      btn.addEventListener('click', () => {
        state.oscMode = mode;
        oscBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        emit('state:change', { path: 'oscMode', value: mode });
        saveState(state);
      });
      oscBtns.push(btn);
      oscModeBar.append(btn);
    });
    oscSection.append(oscModeBar);
    container.append(oscSection);

    // ── Master Limiter Toggle ─────────────────────────────────────────────────
    // Append limiter button into the Audio settings-section already in the DOM
    const audioSection = container.querySelector('[data-action="initAudio"]')?.closest('.settings-section');
    if (audioSection) {
      const limiterRow = document.createElement('div');
      limiterRow.className = 'settings-row';
      limiterRow.style.marginTop = '6px';
      const limiterLabel = document.createElement('label');
      limiterLabel.textContent = 'Limiter';
      const limiterBtn = document.createElement('button');
      limiterBtn.className = 'ctx-btn' + (state.masterLimiter ? ' active' : '');
      limiterBtn.textContent = state.masterLimiter ? 'ON' : 'OFF';
      limiterBtn.addEventListener('click', () => {
        state.masterLimiter = !state.masterLimiter;
        const eng = window._confusynthEngine;
        if (eng?.setLimiter) eng.setLimiter(state.masterLimiter);
        limiterBtn.classList.toggle('active', state.masterLimiter);
        limiterBtn.textContent = state.masterLimiter ? 'ON' : 'OFF';
        emit('state:change', { path: 'masterLimiter', value: state.masterLimiter });
        saveState(state);
      });
      limiterRow.append(limiterLabel, limiterBtn);
      audioSection.append(limiterRow);

      // ── Output Device Selector ────────────────────────────────────────────────────────────────────
      const devRow = document.createElement('div');
      devRow.className = 'settings-row';
      devRow.style.marginTop = '6px';
      const devLabel = document.createElement('label');
      devLabel.textContent = 'Output Device';
      const devSel = document.createElement('select');
      devSel.style.cssText = 'font-size:0.6rem;background:#1a1a1a;color:var(--screen-text);border:1px solid #333;border-radius:3px;padding:2px';

      if (navigator.mediaDevices?.enumerateDevices && state.audioContext?.setSinkId) {
        // setSinkId supported — populate with real devices
        devSel.innerHTML = '<option value="">Default</option>';
        navigator.mediaDevices.enumerateDevices().then(devices => {
          devices.filter(d => d.kind === 'audiooutput').forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Device ${d.deviceId.slice(0, 6)}`;
            if (d.deviceId === state.audioOutputDevice) opt.selected = true;
            devSel.append(opt);
          });
        }).catch(() => {});

        devSel.addEventListener('change', e => {
          state.audioOutputDevice = e.target.value;
          if (state.audioContext?.setSinkId) {
            state.audioContext.setSinkId(e.target.value || '').catch(err => console.warn('setSinkId:', err));
          }
          saveState(state);
        });

        devRow.append(devLabel, devSel);
        audioSection.append(devRow);
      } else {
        // setSinkId not supported — show static fallback
        devSel.innerHTML = '<option value="">Browser default</option>';
        devSel.disabled = true;
        const noteSpan = document.createElement('span');
        noteSpan.style.cssText = 'font-family:var(--font-mono);font-size:0.52rem;color:var(--muted);margin-left:4px';
        noteSpan.textContent = '(Chrome only)';
        devRow.append(devLabel, devSel, noteSpan);
        audioSection.append(devRow);
      }
    }

    // ── MIDI Programs ─────────────────────────────────────────────────────────
    const progSection = document.createElement('div');
    progSection.className = 'settings-section';
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
          const eng = window._confusynthEngine;
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

    // ── Performance Monitor ──────────────────────────────────────────────────
    const perfSection = container.querySelector('#perf-section');
    if (perfSection) {
      const perfDiv = document.createElement('div');
      perfDiv.className = 'perf-monitor';

      // 60-frame rolling average for FPS
      const _frameTimes = [];
      let _lastFrameTs = null;

      const updatePerf = () => {
        const eng = window._confusynthEngine;
        if (!eng?.context) {
          perfDiv.innerHTML = '<span style="color:var(--muted);font-size:0.55rem">Audio not initialized</span>';
          return;
        }
        const ctx = eng.context;

        // Rolling FPS calculation
        const now = performance.now();
        if (_lastFrameTs !== null) {
          const delta = now - _lastFrameTs;
          _frameTimes.push(delta);
          if (_frameTimes.length > 60) _frameTimes.shift();
        }
        _lastFrameTs = now;

        let fpsDisplay = '—';
        let fpsColor = 'var(--screen-text)';
        let cpuDisplay = '—';
        let cpuColor = 'var(--muted)';
        if (_frameTimes.length >= 2) {
          const avgDelta = _frameTimes.reduce((a, b) => a + b, 0) / _frameTimes.length;
          const fps = 1000 / avgDelta;
          fpsDisplay = fps.toFixed(1);
          if (fps > 55) fpsColor = '#5cb85c';
          else if (fps >= 45) fpsColor = '#e6a817';
          else fpsColor = '#d9534f';
          // Estimate CPU%: frame time vs 16.67ms budget, clamped 0-100
          const cpuPct = Math.min(100, Math.max(0, Math.round((avgDelta / 16.667) * 100)));
          cpuDisplay = cpuPct + '%';
          if (cpuPct < 60) cpuColor = '#5cb85c';
          else if (cpuPct < 80) cpuColor = '#e6a817';
          else cpuColor = '#d9534f';
        }

        const baseLatMs = ((ctx.baseLatency ?? 0) * 1000).toFixed(1);
        const outLatMs  = ((ctx.outputLatency ?? 0) * 1000).toFixed(1);

        perfDiv.innerHTML = `
          <div class="perf-row perf-fps-row"><span>FPS</span><span style="color:${fpsColor};font-weight:bold">${fpsDisplay} fps</span></div>
          <div class="perf-row"><span>CPU est.</span><span style="color:${cpuColor};font-weight:bold">~${cpuDisplay}</span></div>
          <div class="perf-row"><span>State</span><span>${ctx.state}</span></div>
          <div class="perf-row"><span>Sample Rate</span><span>${ctx.sampleRate} Hz</span></div>
          <div class="perf-row"><span>Base Latency</span><span>${baseLatMs} ms</span></div>
          <div class="perf-row"><span>Output Latency</span><span>${outLatMs} ms</span></div>
          <div class="perf-row"><span>Current Time</span><span>${ctx.currentTime.toFixed(1)} s</span></div>
        `;
      };
      updatePerf();
      let perfRaf;
      const startPerfMonitor = () => {
        perfRaf = requestAnimationFrame(() => { updatePerf(); startPerfMonitor(); });
      };
      startPerfMonitor();
      container._cleanupPerf = () => cancelAnimationFrame(perfRaf);

      perfSection.append(perfDiv);
    }

    // ── Presets ──────────────────────────────────────────────────────────────
    const presetsSection = document.createElement('div');
    presetsSection.style.cssText = 'margin-top:10px;flex-shrink:0;border-top:1px solid var(--border);padding-top:8px';

    const presetsTitle = document.createElement('span');
    presetsTitle.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px';
    presetsTitle.textContent = 'Presets';
    presetsSection.append(presetsTitle);

    const presetBar = document.createElement('div');
    presetBar.className = 'preset-bar';

    // Save Project
    const saveBtn = document.createElement('button');
    saveBtn.className = 'seq-btn';
    saveBtn.textContent = 'Save Project';
    saveBtn.addEventListener('click', () => {
      const json = JSON.stringify(state.project, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${state.project.name ?? 'confusynth'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // Load Project
    const loadInput = document.createElement('input');
    loadInput.type = 'file';
    loadInput.accept = '.json';
    loadInput.style.display = 'none';
    loadInput.addEventListener('change', () => {
      const file = loadInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const project = JSON.parse(e.target.result);
          state.project = project;
          saveState(state);
          emit('state:change', { path: 'action_renderPage', value: true });
        } catch (err) {
          alert('Invalid project file: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
    const loadBtn = document.createElement('button');
    loadBtn.className = 'seq-btn';
    loadBtn.textContent = 'Load Project';
    loadBtn.addEventListener('click', () => loadInput.click());

    // Save Kit
    const saveKitBtn = document.createElement('button');
    saveKitBtn.className = 'seq-btn';
    saveKitBtn.textContent = 'Save Kit';
    saveKitBtn.addEventListener('click', () => {
      const kit = getActivePattern(state).kit;
      const blob = new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kit-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // Load Kit
    const loadKitInput = document.createElement('input');
    loadKitInput.type = 'file';
    loadKitInput.accept = '.json';
    loadKitInput.style.display = 'none';
    loadKitInput.addEventListener('change', () => {
      const file = loadKitInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const kit = JSON.parse(e.target.result);
          getActivePattern(state).kit = kit;
          saveState(state);
          emit('state:change', { path: 'action_renderPage', value: true });
        } catch (err) {
          alert('Invalid kit file: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
    const loadKitBtn = document.createElement('button');
    loadKitBtn.className = 'seq-btn';
    loadKitBtn.textContent = 'Load Kit';
    loadKitBtn.addEventListener('click', () => loadKitInput.click());

    // Export MIDI
    const exportMidiFileBtn = document.createElement('button');
    exportMidiFileBtn.className = 'seq-btn';
    exportMidiFileBtn.textContent = 'Export MIDI';
    exportMidiFileBtn.title = 'Export active pattern as Standard MIDI File (Ctrl+Shift+E)';
    exportMidiFileBtn.addEventListener('click', () => {
      if (typeof window.exportMidi === 'function') window.exportMidi(state);
    });

    presetBar.append(saveBtn, loadInput, loadBtn, saveKitBtn, loadKitInput, loadKitBtn, exportMidiFileBtn);
    presetsSection.append(presetBar);
    container.append(presetsSection);

    // ── Theme selector ───────────────────────────────────────────────────────
    const themeAccentColors = { default: '#8fba4e', blue: '#4e8fbf', red: '#bf4e4e', mono: '#aaa' };
    const themes = ['default', 'blue', 'red', 'mono'];
    const themeSection = document.createElement('div');
    themeSection.className = 'settings-section';
    themeSection.innerHTML = '<div class="settings-label">THEME</div>';
    const themeBar = document.createElement('div');
    themeBar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    themes.forEach(theme => {
      const btn = document.createElement('button');
      btn.className = 'seq-btn' + ((state.theme ?? 'default') === theme ? ' active' : '');
      const swatch = document.createElement('span');
      swatch.className = 'theme-swatch';
      swatch.style.background = themeAccentColors[theme];
      btn.append(swatch, theme.charAt(0).toUpperCase() + theme.slice(1));
      btn.addEventListener('click', () => {
        state.theme = theme;
        document.documentElement.dataset.theme = theme === 'default' ? '' : theme;
        // Clear custom accent overrides when switching theme presets
        document.documentElement.style.removeProperty('--accent');
        document.documentElement.style.removeProperty('--screen-text');
        state.customAccent = null;
        state.customScreenText = null;
        saveState(state);
        emit('state:change', { path: 'action_renderPage', value: true });
      });
      themeBar.append(btn);
    });
    themeSection.append(themeBar);

    // ── Custom accent color picker ────────────────────────────────────────────
    const accentRow = document.createElement('div');
    accentRow.className = 'settings-row';
    accentRow.style.cssText = 'margin-top:8px;gap:6px;flex-wrap:wrap;';

    const accentLabel = document.createElement('label');
    accentLabel.textContent = 'Accent';
    accentLabel.style.cssText = 'font-size:0.58rem;color:var(--muted)';

    const accentInput = document.createElement('input');
    accentInput.type = 'color';
    accentInput.value = state.customAccent ?? '#8fba4e';
    accentInput.title = 'Primary accent color';
    accentInput.style.cssText = 'width:32px;height:24px;border:none;background:none;cursor:pointer;padding:0';
    accentInput.addEventListener('input', e => {
      document.documentElement.style.setProperty('--accent', e.target.value);
      state.customAccent = e.target.value;
      saveState(state);
    });

    const screenTextLabel = document.createElement('label');
    screenTextLabel.textContent = 'Screen';
    screenTextLabel.style.cssText = 'font-size:0.58rem;color:var(--muted);margin-left:6px';

    const screenTextInput = document.createElement('input');
    screenTextInput.type = 'color';
    screenTextInput.value = state.customScreenText ?? '#c8e0a0';
    screenTextInput.title = 'Screen / text color';
    screenTextInput.style.cssText = 'width:32px;height:24px;border:none;background:none;cursor:pointer;padding:0';
    screenTextInput.addEventListener('input', e => {
      document.documentElement.style.setProperty('--screen-text', e.target.value);
      state.customScreenText = e.target.value;
      saveState(state);
    });

    const resetColorsBtn = document.createElement('button');
    resetColorsBtn.className = 'ctx-btn';
    resetColorsBtn.textContent = 'Reset';
    resetColorsBtn.title = 'Restore theme default colors';
    resetColorsBtn.style.cssText = 'font-size:0.56rem;margin-left:auto';
    resetColorsBtn.addEventListener('click', () => {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--screen-text');
      state.customAccent = null;
      state.customScreenText = null;
      accentInput.value = themeAccentColors[state.theme ?? 'default'];
      screenTextInput.value = '#c8e0a0';
      saveState(state);
    });

    accentRow.append(accentLabel, accentInput, screenTextLabel, screenTextInput, resetColorsBtn);
    themeSection.append(accentRow);
    container.append(themeSection);

    // ── Keyboard shortcuts reference ─────────────────────────────────────────
    const shortcutsSection = document.createElement('div');
    shortcutsSection.className = 'settings-section';
    shortcutsSection.innerHTML = `
      <h4>Keyboard Shortcuts</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;font-family:var(--font-mono);font-size:0.55rem;line-height:1.7">
        <div style="color:var(--muted)">Space</div><div>Play / Stop</div>
        <div style="color:var(--muted)">R</div><div>Record</div>
        <div style="color:var(--muted)">Escape</div><div>Stop / Clear selection</div>
        <div style="color:var(--muted)">Tab / Shift+Tab</div><div>Next / Prev page</div>
        <div style="color:var(--muted)">1–8</div><div>Select track 1–8</div>
        <div style="color:var(--muted)">F1</div><div>Settings page</div>
        <div style="color:var(--muted)">F2</div><div>Pattern page</div>
        <div style="color:var(--muted)">F3</div><div>Sound page</div>
        <div style="color:var(--muted)">F4</div><div>Mixer page</div>
        <div style="color:var(--muted)">F5</div><div>Piano Roll page</div>
        <div style="color:var(--muted)">F6</div><div>FX page</div>
        <div style="color:var(--muted)">F7</div><div>Arranger page</div>
        <div style="color:var(--muted)">F8</div><div>Scenes page</div>
        <div style="color:var(--muted)">F9</div><div>Banks page</div>
        <div style="color:var(--muted)">Ctrl+Z</div><div>Undo</div>
        <div style="color:var(--muted)">Ctrl+Shift+Z / Ctrl+Y</div><div>Redo</div>
        <div style="color:var(--muted)">Ctrl+S</div><div>Save</div>
        <div style="color:var(--muted)">Ctrl+D</div><div>Duplicate current pattern</div>
        <div style="color:var(--muted)">Ctrl+M</div><div>Toggle mute on selected track</div>
        <div style="color:var(--muted)">Ctrl+C / Ctrl+V</div><div>Copy / Paste pattern</div>
        <div style="color:var(--muted)">Ctrl+Shift+E</div><div>Export MIDI</div>
        <div style="color:var(--muted)">Del / Bksp</div><div>Clear selected steps</div>
        <div style="color:var(--muted)">+ / -</div><div>BPM +1 / −1</div>
        <div style="color:var(--muted)">?</div><div>Help modal</div>
      </div>
    `;
    container.append(shortcutsSection);

    // ── Auto-save indicator ──────────────────────────────────────────────────
    const saveStatusDiv = document.createElement('div');
    saveStatusDiv.style.cssText = 'font-family:var(--font-mono);font-size:0.5rem;color:var(--muted);padding:4px 0 2px';
    const lastSave = state._lastSaveTime ? new Date(state._lastSaveTime).toLocaleTimeString() : 'Never';
    saveStatusDiv.textContent = `Auto-save: ${lastSave}`;
    container.append(saveStatusDiv);

    container.addEventListener('change', e => {
      const el = e.target;
      if (!el.dataset.action) return;
      const action = el.dataset.action;

      if (action === 'midiChannel') {
        const v = Math.max(1, Math.min(16, parseInt(el.value, 10) || 1));
        el.value = v;
        state.midiChannel = v;
        emit('state:change', { path: 'midiChannel', value: v });
        saveState(state);
      }

      if (action === 'midiOutput') {
        const id = el.value;
        const out = midiOutputs.find(o => (o.id || o.name) === id) || null;
        if (state.engine) state.engine.midiOutput = out;
        saveState(state);
      }
    });
  },

  knobMap: [
    { label: 'MIDI Ch',  param: 'midiChannel',  min: 1,  max: 16,   step: 1    },
    { label: 'Swing',    param: 'swing',         min: 0,  max: 0.42, step: 0.01 },
    { label: 'I/O Lvl',  param: 'ioLevel',       min: 0,  max: 1,    step: 0.01 },
    { label: 'Link',     param: 'abletonLink',   min: 0,  max: 1,    step: 1    },
    { label: 'Clock',    param: 'clockSource',   min: 0,  max: 2,    step: 1    },
    { label: 'Metro',    param: 'metronome',     min: 0,  max: 1,    step: 1    },
    { label: 'ClkOut',   param: 'midiClockOut',  min: 0,  max: 1,    step: 1    },
    { label: '—',        param: null,            min: 0,  max: 1,    step: 1    },
  ],

  keyboardContext: 'settings',
};
