// src/pages/settings.js — MIDI, clock, audio, storage, version

const VERSION = 'v3.0.0';

export default {
  render(container, state, emit) {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-shrink:0';
    header.innerHTML = `<span class="page-title" style="margin:0">Settings</span>
      <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);margin-left:auto">CONFUsynth ${VERSION}</span>`;
    container.append(header);

    const grid = document.createElement('div');
    grid.className = 'settings-grid';
    grid.style.cssText = 'flex:1;min-height:0';

    // ── MIDI ──
    const midiSec = document.createElement('div');
    midiSec.className = 'settings-section';
    midiSec.innerHTML = '<h4>MIDI</h4>';

    const midiInputs  = state.midiInputs  || [];
    const midiOutputs = state.midiOutputs || [];

    const midiRow1 = document.createElement('div');
    midiRow1.className = 'settings-row';
    midiRow1.innerHTML = `<label>MIDI Channel</label>`;
    const midiChSel = document.createElement('select');
    for (let i = 1; i <= 16; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `Ch ${i}`;
      if (i === (state.midiChannel ?? 1)) opt.selected = true;
      midiChSel.append(opt);
    }
    midiChSel.addEventListener('change', () =>
      emit('state:change', { path: 'midiChannel', value: parseInt(midiChSel.value) })
    );
    midiRow1.append(midiChSel);
    midiSec.append(midiRow1);

    // MIDI ports list
    const portsLabel = document.createElement('div');
    portsLabel.style.cssText = 'font-family:var(--font-mono);font-size:0.58rem;color:var(--muted);text-transform:uppercase;margin:8px 0 4px;letter-spacing:0.06em';
    portsLabel.textContent = 'Outputs';
    midiSec.append(portsLabel);

    if (midiOutputs.length === 0) {
      const none = document.createElement('span');
      none.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)';
      none.textContent = 'No MIDI outputs detected';
      midiSec.append(none);
    } else {
      midiOutputs.forEach(out => {
        const item = document.createElement('div');
        item.style.cssText = 'font-family:var(--font-mono);font-size:0.6rem;color:var(--screen-text);padding:2px 0';
        item.textContent = out.name || out.id;
        midiSec.append(item);
      });
    }

    grid.append(midiSec);

    // ── Clock ──
    const clockSec = document.createElement('div');
    clockSec.className = 'settings-section';
    clockSec.innerHTML = '<h4>Clock</h4>';

    const clockRow = document.createElement('div');
    clockRow.className = 'settings-row';
    clockRow.innerHTML = '<label>Source</label>';
    const clockBtns = document.createElement('div');
    clockBtns.style.cssText = 'display:flex;gap:4px';
    ['Internal', 'External'].forEach(label => {
      const btn = document.createElement('button');
      const active = label === 'Internal' ? !(state.externalClock) : !!(state.externalClock);
      btn.className = 'ctx-btn' + (active ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        clockBtns.querySelectorAll('.ctx-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        emit('state:change', { path: 'externalClock', value: label === 'External' });
      });
      clockBtns.append(btn);
    });
    clockRow.append(clockBtns);
    clockSec.append(clockRow);

    // Swing
    const swingRow = document.createElement('div');
    swingRow.className = 'settings-row';
    swingRow.innerHTML = `<label>Swing</label><span style="font-family:var(--font-mono);font-size:0.62rem;color:var(--accent)">${Math.round((state.swing ?? 0) * 100)}%</span>`;
    clockSec.append(swingRow);

    // Link (placeholder)
    const linkRow = document.createElement('div');
    linkRow.className = 'settings-row';
    linkRow.innerHTML = '<label>Ableton Link</label>';
    const linkBtn = document.createElement('button');
    linkBtn.className = 'ctx-btn' + (state.linkEnabled ? ' active' : '');
    linkBtn.textContent = state.linkEnabled ? 'Enabled' : 'Disabled';
    linkBtn.addEventListener('click', () => {
      emit('state:change', { path: 'linkEnabled', value: !state.linkEnabled });
      linkBtn.classList.toggle('active');
      linkBtn.textContent = !state.linkEnabled ? 'Enabled' : 'Disabled';
    });
    linkRow.append(linkBtn);
    clockSec.append(linkRow);
    grid.append(clockSec);

    // ── Audio ──
    const audioSec = document.createElement('div');
    audioSec.className = 'settings-section';
    audioSec.innerHTML = '<h4>Audio</h4>';

    const audioRow = document.createElement('div');
    audioRow.className = 'settings-row';
    audioRow.innerHTML = '<label>AudioContext</label>';
    const audioState = state.audioContext
      ? (state.audioContext.state === 'running' ? 'Running' : state.audioContext.state)
      : 'Not initialised';
    const audioStatus = document.createElement('span');
    audioStatus.style.cssText = `font-family:var(--font-mono);font-size:0.62rem;color:${state.audioContext ? 'var(--live)' : 'var(--muted)'}`;
    audioStatus.textContent = audioState;
    audioRow.append(audioStatus);
    audioSec.append(audioRow);

    const initBtn = document.createElement('button');
    initBtn.className = 'screen-btn';
    initBtn.style.marginTop = '6px';
    initBtn.textContent = 'Init Audio';
    initBtn.addEventListener('click', () => emit('state:change', { path: 'action_initAudio', value: true }));
    audioSec.append(initBtn);

    // Metronome
    const metRow = document.createElement('div');
    metRow.className = 'settings-row';
    metRow.style.marginTop = '8px';
    metRow.innerHTML = '<label>Metronome</label>';
    const metBtn = document.createElement('button');
    metBtn.className = 'ctx-btn' + (state.metronome ? ' active' : '');
    metBtn.textContent = state.metronome ? 'On' : 'Off';
    metBtn.addEventListener('click', () => {
      emit('state:change', { path: 'metronome', value: !state.metronome });
      metBtn.classList.toggle('active');
      metBtn.textContent = !state.metronome ? 'On' : 'Off';
    });
    metRow.append(metBtn);
    audioSec.append(metRow);
    grid.append(audioSec);

    // ── Storage ──
    const storeSec = document.createElement('div');
    storeSec.className = 'settings-section';
    storeSec.innerHTML = '<h4>Storage</h4>';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'screen-btn';
    clearBtn.style.cssText = 'border-color:rgba(240,91,82,0.3);color:var(--record)';
    clearBtn.textContent = 'Clear Saved State';
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all saved state? This cannot be undone.')) {
        emit('state:change', { path: 'action_clearStorage', value: true });
      }
    });
    storeSec.append(clearBtn);

    const verInfo = document.createElement('div');
    verInfo.style.cssText = 'font-family:var(--font-mono);font-size:0.56rem;color:var(--muted);margin-top:10px;line-height:1.6';
    verInfo.innerHTML = `CONFUsynth ${VERSION}<br>Web Audio API sequencer<br>ES modules`;
    storeSec.append(verInfo);
    grid.append(storeSec);

    container.append(grid);
  },

  knobMap: [
    { label: 'MIDI Ch',   param: 'midiChannel',  min: 1,  max: 16, step: 1 },
    { label: 'Sync',      param: 'syncMode',     min: 0,  max: 2,  step: 1 },
    { label: 'I/O Lvl',   param: 'ioLevel',      min: 0,  max: 1,  step: 0.01 },
    { label: 'Swing',     param: 'swing',        min: 0,  max: 0.42,step: 0.01 },
    { label: 'Link',      param: 'linkEnabled',  min: 0,  max: 1,  step: 1 },
    { label: 'Clock',     param: 'externalClock',min: 0,  max: 1,  step: 1 },
    { label: 'Metro',     param: 'metronome',    min: 0,  max: 1,  step: 1 },
    { label: '—',         param: null,           min: 0,  max: 1,  step: 1 },
  ],

  keyboardContext: 'settings',
};
