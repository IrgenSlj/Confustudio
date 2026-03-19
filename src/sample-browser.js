// src/sample-browser.js — Sample library overlay

export function openSampleBrowser(state, emit, trackIndex) {
  let activeSource = null;

  // ── Backdrop ──
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:1000;display:flex;align-items:center;justify-content:center';

  // ── Panel ──
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:6px;width:480px;max-height:520px;display:flex;flex-direction:column;padding:0';

  // ── Header bar ──
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #2a2a2a;flex-shrink:0';

  const title = document.createElement('span');
  title.style.cssText = 'font-family:monospace;font-size:0.8rem;font-weight:700;color:#f0c640;letter-spacing:0.08em';
  title.textContent = 'SAMPLE LIBRARY';

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:none;color:#888;font-size:1.2rem;cursor:pointer;line-height:1;padding:0 2px';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);

  header.append(title, closeBtn);

  // ── List area ──
  const listArea = document.createElement('div');
  listArea.style.cssText = 'flex:1;overflow-y:auto;padding:8px;min-height:0';

  // ── Footer ──
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:8px 14px;border-top:1px solid #2a2a2a;font-family:monospace;font-size:0.65rem;color:#888;flex-shrink:0';
  footer.textContent = `LOADING TO: T${trackIndex + 1}`;

  panel.append(header, listArea, footer);
  backdrop.append(panel);
  document.body.append(backdrop);

  // ── Close logic ──
  function close() {
    if (activeSource) {
      try { activeSource.stop(); } catch (_) {}
      activeSource = null;
    }
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') close();
  }

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close();
  });

  document.addEventListener('keydown', onKeyDown);

  // ── Loading state ──
  const loadingMsg = document.createElement('div');
  loadingMsg.style.cssText = 'font-family:monospace;font-size:0.7rem;color:#888;padding:16px 8px';
  loadingMsg.textContent = 'Loading…';
  listArea.append(loadingMsg);

  // ── Fetch samples ──
  fetch('/api/samples')
    .then(r => r.json())
    .then(samples => {
      listArea.innerHTML = '';

      if (!Array.isArray(samples) || samples.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-family:monospace;font-size:0.7rem;color:#888;padding:16px 8px';
        empty.textContent = 'No samples found — add files to ./samples/';
        listArea.append(empty);
        return;
      }

      samples.forEach(({ name, size }) => {
        const row = buildRow(name, size);
        listArea.append(row);
      });
    })
    .catch(() => {
      listArea.innerHTML = '';
      const errMsg = document.createElement('div');
      errMsg.style.cssText = 'font-family:monospace;font-size:0.7rem;color:#888;padding:16px 8px';
      errMsg.textContent = 'No samples found — add files to ./samples/';
      listArea.append(errMsg);
    });

  // ── Build a sample row ──
  function buildRow(name, size) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid #1a1a1a';

    // Preview button
    const previewBtn = document.createElement('button');
    previewBtn.style.cssText = 'background:none;border:1px solid #333;border-radius:3px;color:#f0c640;font-size:0.7rem;cursor:pointer;padding:2px 6px;flex-shrink:0';
    previewBtn.textContent = '▶';
    previewBtn.addEventListener('click', () => previewSample(name));

    // Filename
    const displayName = name.length > 32 ? name.slice(0, 29) + '…' : name;
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-family:monospace;font-size:0.68rem;color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    nameSpan.textContent = displayName;
    nameSpan.title = name;

    // File size
    const sizeSpan = document.createElement('span');
    sizeSpan.style.cssText = 'font-family:monospace;font-size:0.65rem;color:#666;flex-shrink:0;white-space:nowrap';
    sizeSpan.textContent = `${(size / 1024).toFixed(1)} KB`;

    // Load button
    const loadBtn = document.createElement('button');
    loadBtn.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:3px;color:#f0c640;font-family:monospace;font-size:0.65rem;cursor:pointer;padding:2px 8px;flex-shrink:0';
    loadBtn.textContent = 'LOAD';
    loadBtn.addEventListener('click', () => loadSample(name, loadBtn));

    row.append(previewBtn, nameSpan, sizeSpan, loadBtn);
    return row;
  }

  // ── Preview a sample ──
  function previewSample(name) {
    if (!state.audioContext) {
      alert('Init audio first (press A)');
      return;
    }

    if (activeSource) {
      try { activeSource.stop(); } catch (_) {}
      activeSource = null;
    }

    fetch('/samples/' + encodeURIComponent(name))
      .then(r => r.arrayBuffer())
      .then(buf => {
        state.audioContext.decodeAudioData(buf, decoded => {
          const src = state.audioContext.createBufferSource();
          src.buffer = decoded;
          src.connect(state.audioContext.destination);
          src.start();
          activeSource = src;
          src.onended = () => {
            if (activeSource === src) activeSource = null;
          };
        });
      })
      .catch(() => {});
  }

  // ── Load a sample into the track ──
  function loadSample(name, loadBtn) {
    fetch('/samples/' + encodeURIComponent(name))
      .then(r => r.arrayBuffer())
      .then(rawBuf => {
        state.audioContext
          ? state.audioContext.decodeAudioData(rawBuf.slice(0), () => {
              emit('sample:load', { buffer: rawBuf });
              emit('track:change', { trackIndex, param: 'machine', value: 'sample' });
              const orig = loadBtn.textContent;
              loadBtn.textContent = '✓ LOADED';
              setTimeout(() => {
                loadBtn.textContent = orig;
                close();
              }, 1500);
            })
          : (() => {
              emit('sample:load', { buffer: rawBuf });
              emit('track:change', { trackIndex, param: 'machine', value: 'sample' });
              const orig = loadBtn.textContent;
              loadBtn.textContent = '✓ LOADED';
              setTimeout(() => {
                loadBtn.textContent = orig;
                close();
              }, 1500);
            })();
      })
      .catch(() => {});
  }
}
