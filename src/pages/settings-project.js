// src/pages/settings-project.js — project import/export section

import { saveState, createProjectPackage, applyProjectPackageToState, getActivePattern } from '../state.js';

// ─── Stem Export ──────────────────────────────────────────────────────────────

/** Encode a Float32Array AudioBuffer as a 16-bit PCM WAV Blob. */
function _audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const dataByteLen = numFrames * numChannels * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataByteLen);
  const view = new DataView(ab);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  function writeU16(offset, v) {
    view.setUint16(offset, v, true);
  }
  function writeU32(offset, v) {
    view.setUint32(offset, v, true);
  }

  writeStr(0, 'RIFF');
  writeU32(4, 36 + dataByteLen);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  writeU32(16, 16); // subchunk1 size
  writeU16(20, 1); // PCM
  writeU16(22, numChannels);
  writeU32(24, sampleRate);
  writeU32(28, sampleRate * numChannels * bytesPerSample);
  writeU16(32, numChannels * bytesPerSample);
  writeU16(34, 16); // bits per sample
  writeStr(36, 'data');
  writeU32(40, dataByteLen);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Show the stem export modal. Renders each track to a separate WAV using
 * engine-provided offline rendering hooks. When those hooks are absent, the
 * UI stays read-only instead of exporting silent placeholder files.
 */
function _showStemExportModal(state, emit, container) {
  // Remove any existing modal
  document.getElementById('_sc-stem-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = '_sc-stem-modal';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center';

  const modal = document.createElement('div');
  modal.style.cssText =
    'background:var(--surface,#1a1a1a);border:1px solid var(--border,#333);border-radius:8px;padding:16px 20px;min-width:280px;max-width:380px;font-family:var(--font-mono,monospace)';

  const title = document.createElement('div');
  title.style.cssText =
    'font-size:0.7rem;font-weight:700;color:var(--screen-text,#f0c640);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px';
  title.textContent = 'EXPORT STEMS';

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:0.56rem;color:var(--muted,#888);line-height:1.6;margin-bottom:10px';
  desc.textContent =
    'Renders each track to a separate WAV file using OfflineAudioContext. All tracks share the current pattern length and BPM.';

  const tracks = state.project?.banks?.[state.activeBank]?.patterns?.[state.activePattern]?.kit?.tracks ?? [];
  const bpm = state.bpm ?? 120;
  const bars = state.recorderBarCount ?? 4;
  const beatsPerBar = 4;
  const durationSec = (bars * beatsPerBar * 60) / bpm;
  const sampleRate = state.audioContext?.sampleRate ?? 44100;
  const eng = window._confustudioEngine ?? state.engine;
  const stemRenderingAvailable = Boolean(eng?.renderTrackStem || eng?.renderOfflineTrack);

  const infoEl = document.createElement('div');
  infoEl.style.cssText =
    'font-size:0.54rem;color:var(--screen-text,#f0c640);margin-bottom:12px;padding:6px 8px;border:1px solid rgba(255,255,255,0.08);border-radius:4px;background:rgba(0,0,0,0.3)';
  infoEl.innerHTML = `<span style="opacity:0.7">BPM:</span> ${bpm} &nbsp; <span style="opacity:0.7">Bars:</span> ${bars} &nbsp; <span style="opacity:0.7">Duration:</span> ${durationSec.toFixed(2)}s &nbsp; <span style="opacity:0.7">Rate:</span> ${sampleRate}Hz`;

  if (!stemRenderingAvailable) {
    desc.textContent =
      'Per-track offline rendering is not implemented in the current engine build yet. Stem export stays disabled until engine render hooks are available.';
  }

  const trackList = document.createElement('div');
  trackList.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:12px';

  const checkboxes = [];
  tracks.forEach((trk, ti) => {
    const row = document.createElement('label');
    row.style.cssText =
      'display:flex;align-items:center;gap:6px;font-size:0.56rem;color:var(--fg,#ccc);cursor:pointer;padding:2px 0';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.trackIndex = String(ti);
    checkboxes.push(cb);
    const name = document.createElement('span');
    name.textContent = `T${ti + 1}: ${trk.name ?? `Track ${ti + 1}`}`;
    row.append(cb, name);
    trackList.append(row);
  });

  const progressEl = document.createElement('div');
  progressEl.style.cssText = 'font-size:0.54rem;color:var(--accent,#5add71);min-height:18px;margin-bottom:8px';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ctx-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const exportBtn = document.createElement('button');
  exportBtn.className = 'seq-btn';
  exportBtn.textContent = stemRenderingAvailable ? 'Export WAV' : 'Unavailable';
  exportBtn.style.cssText = 'font-size:0.6rem;font-weight:700';
  exportBtn.disabled = !stemRenderingAvailable;

  if (!stemRenderingAvailable) {
    progressEl.style.color = 'var(--muted,#888)';
    progressEl.textContent = 'Stem export is blocked until offline track rendering is implemented in the engine.';
  }

  exportBtn.addEventListener('click', async () => {
    if (!stemRenderingAvailable) {
      progressEl.style.color = 'var(--muted,#888)';
      progressEl.textContent = 'Stem export is not available in this build yet.';
      return;
    }
    exportBtn.disabled = true;
    cancelBtn.disabled = true;
    const selectedIndices = checkboxes.filter((cb) => cb.checked).map((cb) => parseInt(cb.dataset.trackIndex, 10));
    if (!selectedIndices.length) {
      progressEl.textContent = 'No tracks selected.';
      exportBtn.disabled = false;
      cancelBtn.disabled = false;
      return;
    }
    const projectName = (state.project?.name ?? 'stem').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (eng?.renderTrackStem) {
      for (let idx = 0; idx < selectedIndices.length; idx++) {
        const ti = selectedIndices[idx];
        progressEl.textContent = `Rendering T${ti + 1}\u2026  (${idx + 1}/${selectedIndices.length})`;
        try {
          const buf = await eng.renderTrackStem(ti, durationSec);
          _downloadBlob(_audioBufferToWavBlob(buf), `${projectName}_T${ti + 1}.wav`);
        } catch (err) {
          progressEl.textContent = `Error on T${ti + 1}: ${err.message}`;
        }
      }
      progressEl.textContent = `Done \u2014 ${selectedIndices.length} stem(s) exported.`;
      exportBtn.disabled = false;
      cancelBtn.disabled = false;
      return;
    }

    try {
      for (let idx = 0; idx < selectedIndices.length; idx++) {
        const ti = selectedIndices[idx];
        progressEl.textContent = `Rendering T${ti + 1}\u2026  (${idx + 1}/${selectedIndices.length})`;
        const offCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * durationSec), sampleRate);
        await eng.renderOfflineTrack(offCtx, ti);
        const rendered = await offCtx.startRendering();
        const filename = `${projectName}_T${ti + 1}.wav`;
        _downloadBlob(_audioBufferToWavBlob(rendered), filename);
      }
      progressEl.style.color = 'var(--live,#5add71)';
      progressEl.textContent = `${selectedIndices.length} stem(s) exported.`;
    } catch (err) {
      progressEl.style.color = 'var(--record,#f05b52)';
      progressEl.textContent = 'Export failed: ' + (err.message ?? err);
    }
    exportBtn.disabled = false;
    cancelBtn.disabled = false;
  });

  btnRow.append(cancelBtn, exportBtn);
  modal.append(title, desc, infoEl, trackList, progressEl, btnRow);
  overlay.append(modal);
  document.body.append(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

export function renderProjectSection(container, state, emit, publishLinkBpm) {
  // ── Project metadata section ─────────────────────────────────────────────
  if (!state.project.createdAt) state.project.createdAt = Date.now();

  const metaSection = document.createElement('div');
  metaSection.className = 'settings-section';
  metaSection.style.cssText =
    'flex-shrink:0;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)';
  metaSection.dataset.settingsTab = 'PROJECT';
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
  container.append(metaSection);

  // Wire metadata inputs
  metaSection.querySelector('#proj-name-input').addEventListener('input', (e) => {
    if (state.project) {
      state.project.name = e.target.value;
      const topbarEl = document.getElementById('project-name');
      if (topbarEl) topbarEl.textContent = e.target.value || 'CONFUstudio';
      saveState(state);
    }
  });
  metaSection.querySelector('#proj-author-input').addEventListener('blur', (e) => {
    if (state.project) {
      state.project.author = e.target.value;
      saveState(state);
    }
  });
  metaSection.querySelector('#proj-bpm-input').addEventListener('change', (e) => {
    const v = Math.max(40, Math.min(240, parseInt(e.target.value, 10) || 120));
    e.target.value = v;
    state.bpm = v;
    emit('state:change', { path: 'bpm', value: v });
    if (state.abletonLink) publishLinkBpm(state, v);
    saveState(state);
  });
  metaSection.querySelector('#proj-desc-input').addEventListener('blur', (e) => {
    if (state.project) {
      state.project.description = e.target.value;
      saveState(state);
    }
  });

  // ── Project Backups ───────────────────────────────────────────────────────
  const backupSection = document.createElement('div');
  backupSection.className = 'settings-section';
  backupSection.style.cssText = 'flex-shrink:0;border-top:1px solid var(--border);padding-top:8px;margin-top:8px';
  backupSection.dataset.settingsTab = 'PROJECT';

  function renderBackups() {
    backupSection.innerHTML = '<div class="settings-label">BACKUPS</div>';
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
    const backupBtn = document.createElement('button');
    backupBtn.className = 'ctx-btn';
    backupBtn.textContent = 'Backup Now';
    backupBtn.addEventListener('click', () => {
      const now = Date.now();
      const key = `confustudio_backup_${now}`;
      localStorage.setItem(key, JSON.stringify(createProjectPackage(state, { backup: true, timestamp: now })));
      emit('toast', { msg: 'Backup saved' });
      renderBackups();
    });
    actionRow.append(backupBtn);
    backupSection.append(actionRow);

    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith('confustudio_backup_') || k.startsWith('confusynth_backup_'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 5);

    if (keys.length === 0) {
      const none = document.createElement('div');
      none.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;color:var(--muted)';
      none.textContent = 'No backups';
      backupSection.append(none);
    } else {
      keys.forEach((key) => {
        let backup = null;
        try {
          backup = JSON.parse(localStorage.getItem(key));
        } catch (_) {}
        const rawTs =
          backup?.timestamp ??
          backup?.savedAt ??
          parseInt(key.replace('confustudio_backup_', '').replace('confusynth_backup_', ''), 10);
        const date = new Date(rawTs ?? Date.now());
        const dateStr = date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
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
            applyProjectPackageToState(state, proj);
            saveState(state);
            emit('state:change', { path: 'scale', value: state.scale });
            emit('toast', { msg: 'Backup restored' });
          } catch (e) {
            emit('toast', { msg: 'Restore failed' });
          }
        });
        const delBtn = document.createElement('button');
        delBtn.className = 'ctx-btn';
        delBtn.textContent = '\u00D7';
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

  // ── Presets ──────────────────────────────────────────────────────────────
  const presetsSection = document.createElement('div');
  presetsSection.style.cssText = 'margin-top:10px;flex-shrink:0;border-top:1px solid var(--border);padding-top:8px';
  presetsSection.dataset.settingsTab = 'PROJECT';

  const presetsTitle = document.createElement('span');
  presetsTitle.style.cssText =
    'font-family:var(--font-mono);font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px';
  presetsTitle.textContent = 'Presets';
  presetsSection.append(presetsTitle);

  const presetBar = document.createElement('div');
  presetBar.className = 'preset-bar';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'seq-btn';
  saveBtn.textContent = 'Save Project';
  saveBtn.addEventListener('click', () => {
    const json = JSON.stringify(createProjectPackage(state), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.project.name ?? 'confustudio'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const loadInput = document.createElement('input');
  loadInput.type = 'file';
  loadInput.accept = '.json';
  loadInput.style.display = 'none';
  loadInput.addEventListener('change', () => {
    const file = loadInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const project = JSON.parse(e.target.result);
        applyProjectPackageToState(state, project);
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

  const loadKitInput = document.createElement('input');
  loadKitInput.type = 'file';
  loadKitInput.accept = '.json';
  loadKitInput.style.display = 'none';
  loadKitInput.addEventListener('change', () => {
    const file = loadKitInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
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

  const exportMidiFileBtn = document.createElement('button');
  exportMidiFileBtn.className = 'seq-btn';
  exportMidiFileBtn.textContent = 'Export MIDI';
  exportMidiFileBtn.title = 'Export active pattern as Standard MIDI File (Ctrl+Shift+E)';
  exportMidiFileBtn.addEventListener('click', () => {
    if (typeof window.exportMidi === 'function') window.exportMidi(state);
  });

  const exportStemsBtn = document.createElement('button');
  exportStemsBtn.className = 'seq-btn';
  exportStemsBtn.textContent = 'Export Stems';
  exportStemsBtn.title = 'Render each track to a separate WAV file when offline engine rendering is available';
  exportStemsBtn.addEventListener('click', () => _showStemExportModal(state, emit, container));

  presetBar.append(
    saveBtn,
    loadInput,
    loadBtn,
    saveKitBtn,
    loadKitInput,
    loadKitBtn,
    exportMidiFileBtn,
    exportStemsBtn,
  );
  presetsSection.append(presetBar);
  container.append(presetsSection);
}
