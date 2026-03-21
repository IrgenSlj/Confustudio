// src/pages/settings.js — MIDI, clock, audio, storage, sync, version

import { saveState } from '../state.js';

const VERSION = 'v3.0.0';

function infoRow(label, value, color) {
  return `<div class="settings-row">
    <label>${label}</label>
    <span style="font-family:var(--font-mono);font-size:0.62rem;color:${color || 'var(--screen-text)'}">${value}</span>
  </div>`;
}

export default {
  render(container, state, emit) {
    const midiOutputs = state.engine?.midiOutputs || state.midiOutputs || [];
    const sampleRate  = state.audioContext?.sampleRate ?? '—';
    const latencyMs   = state.audioContext?.baseLatency != null
      ? (state.audioContext.baseLatency * 1000).toFixed(1) + 'ms'
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
            <div style="display:flex;gap:4px">
              ${['internal', 'midi', 'link'].map(src => `
                <button class="ctx-btn${(state.clockSource || 'internal') === src ? ' active' : ''}"
                        data-action="clockSource" data-value="${src}">
                  ${src === 'internal' ? 'INT' : src === 'midi' ? 'MIDI' : 'LINK'}
                </button>`).join('')}
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

      </div>`;

    // Project name editor
    const nameWrap = document.createElement('div');
    nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-shrink:0;padding-bottom:8px;border-bottom:1px solid var(--border)';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = state.project?.name ?? 'New Project';
    nameInput.maxLength = 32;
    nameInput.placeholder = 'Project name';
    nameInput.style.cssText = `
      flex:1; background:#1a1a1a; color:var(--screen-text);
      border:1px solid var(--border); border-radius:4px;
      padding:5px 8px; font-family:var(--font-mono); font-size:0.72rem;
      outline:none;
    `;
    nameInput.addEventListener('input', () => {
      if (state.project) {
        state.project.name = nameInput.value;
        // Update topbar
        const el = document.getElementById('project-name');
        if (el) el.textContent = nameInput.value || 'CONFUsynth';
        saveState(state);
      }
    });
    nameInput.addEventListener('focus', () => nameInput.select());

    const nameLabel = document.createElement('span');
    nameLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);flex-shrink:0';
    nameLabel.textContent = 'PROJECT';

    nameWrap.append(nameLabel, nameInput);
    container.prepend(nameWrap);

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
