import { openSampleBrowser } from '../sample-browser.js';
import { TRACK_COLORS } from '../state.js';

export function drawWaveform(canvas, audioBuffer, sampleStart, sampleEnd,
                      viewStart = 0, viewEnd = 1,
                      loopStart = 0, loopEnd = 1, loopEnabled = false,
                      bitDepth = 32, playbackPos = null) {
  if (!audioBuffer) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  const ctx2d = canvas.getContext('2d');
  const W = canvas.offsetWidth || 200;
  const H = canvas.height;
  canvas.width = W;
  ctx2d.clearRect(0, 0, W, H);

  const data    = audioBuffer.getChannelData(0);
  const totalSamples = data.length;

  const fracToX = (frac) => ((frac - viewStart) / (viewEnd - viewStart)) * W;

  const startSample = Math.floor(viewStart * totalSamples);
  const endSample   = Math.ceil(viewEnd   * totalSamples);
  const windowLen   = endSample - startSample;
  const step        = Math.max(1, Math.floor(windowLen / W));

  ctx2d.strokeStyle = '#a0c060';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();

  for (let x = 0; x < W; x++) {
    const sIdx = startSample + Math.floor((x / W) * windowLen);
    let min = 1, max = -1;
    for (let i = 0; i < step; i++) {
      const v = data[sIdx + i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMin = ((1 + min) / 2) * H;
    const yMax = ((1 + max) / 2) * H;
    if (x === 0) ctx2d.moveTo(x, yMin);
    ctx2d.lineTo(x, yMin);
    ctx2d.lineTo(x, yMax);
  }
  ctx2d.stroke();

  ctx2d.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx2d.beginPath();
  ctx2d.moveTo(0, H / 2);
  ctx2d.lineTo(W, H / 2);
  ctx2d.stroke();

  const sX = fracToX(sampleStart);
  const eX = fracToX(sampleEnd);
  ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
  if (sX > 0) ctx2d.fillRect(0, 0, sX, H);
  if (eX < W) ctx2d.fillRect(eX, 0, W - eX, H);

  if (loopEnabled) {
    const lsX = Math.max(0, fracToX(loopStart));
    const leX = Math.min(W, fracToX(loopEnd));
    if (leX > lsX) {
      ctx2d.fillStyle = 'rgba(0,220,220,0.10)';
      ctx2d.fillRect(lsX, 0, leX - lsX, H);
    }
  }

  if (sX >= 0 && sX <= W) {
    ctx2d.strokeStyle = '#f0c640';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(sX, 0);
    ctx2d.lineTo(sX, H);
    ctx2d.stroke();
  }
  if (eX >= 0 && eX <= W) {
    ctx2d.strokeStyle = '#ff8c52';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(eX, 0);
    ctx2d.lineTo(eX, H);
    ctx2d.stroke();
  }

  if (loopEnabled) {
    const lsX = fracToX(loopStart);
    const leX = fracToX(loopEnd);
    ctx2d.setLineDash([3, 3]);
    ctx2d.lineWidth = 1.5;
    if (lsX >= 0 && lsX <= W) {
      ctx2d.strokeStyle = '#00e5e5';
      ctx2d.beginPath();
      ctx2d.moveTo(lsX, 0);
      ctx2d.lineTo(lsX, H);
      ctx2d.stroke();
    }
    if (leX >= 0 && leX <= W) {
      ctx2d.strokeStyle = '#00cccc';
      ctx2d.beginPath();
      ctx2d.moveTo(leX, 0);
      ctx2d.lineTo(leX, H);
      ctx2d.stroke();
    }
    ctx2d.setLineDash([]);
  }

  const spX = fracToX(sampleStart ?? 0);
  if (spX >= 0 && spX <= W) {
    ctx2d.save();
    ctx2d.strokeStyle = '#f90';
    ctx2d.lineWidth = 2;
    ctx2d.setLineDash([4, 3]);
    ctx2d.beginPath(); ctx2d.moveTo(spX, 0); ctx2d.lineTo(spX, H); ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.fillStyle = '#f90';
    ctx2d.beginPath(); ctx2d.moveTo(spX, 0); ctx2d.lineTo(spX + 8, 0); ctx2d.lineTo(spX, 12); ctx2d.fill();
    ctx2d.restore();
  }

  if (playbackPos != null) {
    const px = fracToX(playbackPos);
    ctx2d.save();
    ctx2d.strokeStyle = '#fff';
    ctx2d.lineWidth = 1;
    ctx2d.globalAlpha = 0.7;
    ctx2d.beginPath(); ctx2d.moveTo(px, 0); ctx2d.lineTo(px, H); ctx2d.stroke();
    ctx2d.restore();
  }

  if (bitDepth < 16) {
    ctx2d.font = 'bold 9px monospace';
    ctx2d.textAlign = 'right';
    ctx2d.textBaseline = 'top';
    ctx2d.fillStyle = '#ff3333';
    ctx2d.fillText('LO-FI', W - 3, 2);
    ctx2d.textAlign = 'left';
  }
}

export function makeSampleLoader(track, ti, emit, machCard, state) {
  let waveZoom    = 1;
  let wavePan     = 0;
  let _samplePlaybackPos = null;

  function viewWindow() {
    const span      = 1 / waveZoom;
    const maxOffset = 1 - span;
    const start     = Math.max(0, Math.min(maxOffset, wavePan));
    return { viewStart: start, viewEnd: start + span };
  }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;padding:4px 0;display:flex;flex-direction:column;gap:4px';

  const canvas = document.createElement('canvas');
  canvas.height = 100;
  canvas.style.cssText = 'width:100%;height:100px;border:1px solid #333;border-radius:2px;cursor:crosshair;background:#121212';

  function redrawWaveform() {
    const { viewStart, viewEnd } = viewWindow();
    drawWaveform(canvas, track.sampleBuffer, track.sampleStart ?? 0, track.sampleEnd ?? 1,
      viewStart, viewEnd, track.loopStart ?? 0, track.loopEnd ?? 1,
      track.loopEnabled ?? false, track.bitDepth ?? 32, _samplePlaybackPos);
  }

  wrap.append(canvas);
  redrawWaveform();

  let _isDragging = false;
  let _dragHandle = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (!track.sampleBuffer) return;
    const { viewStart, viewEnd } = viewWindow();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const frac = viewStart + x * (viewEnd - viewStart);

    const startFrac = track.sampleStart ?? 0;
    const endFrac   = track.sampleEnd ?? 1;
    const dStart    = Math.abs(frac - startFrac);
    const dEnd      = Math.abs(frac - endFrac);
    const threshold = (viewEnd - viewStart) * 0.02;

    if (dStart < threshold && dStart < dEnd) {
      _dragHandle = 'start';
    } else if (dEnd < threshold) {
      _dragHandle = 'end';
    } else {
      _dragHandle = 'start';
    }
    _isDragging = true;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!_isDragging || !track.sampleBuffer) return;
    const { viewStart, viewEnd } = viewWindow();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const frac = Math.max(0, Math.min(1, viewStart + x * (viewEnd - viewStart)));
    if (_dragHandle === 'start') {
      track.sampleStart = frac;
      if (track.sampleStart > track.sampleEnd) track.sampleEnd = Math.min(1, track.sampleStart + 0.01);
    } else {
      track.sampleEnd = frac;
      if (track.sampleEnd < track.sampleStart) track.sampleStart = Math.max(0, track.sampleEnd - 0.01);
    }
    redrawWaveform();
  });

  canvas.addEventListener('pointerup', () => { _isDragging = false; _dragHandle = null; });
  canvas.addEventListener('pointercancel', () => { _isDragging = false; _dragHandle = null; });

  let _phRaf = null;
  function tickPlayhead() {
    const st = window._confustudioState;
    if (!st?.isPlaying || !track.sampleBuffer) { _phRaf = null; return; }
    const elapsed = st.audioContext.currentTime - (st._stepStartTime ?? st.audioContext.currentTime);
    const dur = track.sampleBuffer.duration;
    let pos = (elapsed / dur) % 1;
    if (track.loopEnabled && track.loopEnd > track.loopStart) {
      const loopLen = track.loopEnd - track.loopStart;
      pos = track.loopStart + (pos * loopLen) % loopLen;
    } else {
      pos = 0;
    }
    _samplePlaybackPos = Math.max(0, Math.min(1, pos));
    redrawWaveform();
    _phRaf = requestAnimationFrame(tickPlayhead);
  }

  const phInterval = setInterval(() => {
    const st = window._confustudioState;
    if (st?.isPlaying && !_phRaf) {
      tickPlayhead();
    }
  }, 200);

  const obs = new MutationObserver(() => {
    if (!machCard.isConnected) {
      clearInterval(phInterval);
      if (_phRaf) cancelAnimationFrame(_phRaf);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  const infoRow = document.createElement('div');
  infoRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.55rem';

  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = 'color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

  function updateSampleInfo() {
    const buf = track.sampleBuffer;
    if (buf) {
      const dur = buf.duration.toFixed(1);
      const sr  = buf.sampleRate;
      const ch  = buf.numberOfChannels;
      nameSpan.textContent = `${track.sampleName || 'Recorded'} — ${dur}s, ${sr}Hz, ${ch}ch`;
    } else {
      nameSpan.textContent = 'No sample loaded';
    }
  }
  updateSampleInfo();
  infoRow.append(nameSpan);

  const reloadBtn = document.createElement('button');
  reloadBtn.className = 'screen-btn';
  reloadBtn.textContent = '↻';
  reloadBtn.title = 'Reload sample from original file';
  reloadBtn.addEventListener('click', async () => {
    if (!track.sampleFileHandle) { showToast('No file handle stored'); return; }
    try {
      const file = await track.sampleFileHandle.getFile();
      const buf = await file.arrayBuffer();
      const decoded = await state.audioContext.decodeAudioData(buf);
      track.sampleBuffer = decoded;
      track.sampleStart = 0; track.sampleEnd = 1;
      redrawWaveform();
      updateSampleInfo();
      if (state.engine) {
        state.engine._clearTrackVoices(ti, true);
        state.engine._prepareTrackVoice(ti, track, state);
      }
      showToast('Sample reloaded');
    } catch (err) {
      console.warn('Sample reload failed:', err);
      showToast('Reload failed');
    }
  });
  infoRow.append(reloadBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'screen-btn';
  clearBtn.textContent = '×';
  clearBtn.title = 'Clear sample';
  clearBtn.addEventListener('click', () => {
    track.sampleBuffer = null;
    track.sampleFileHandle = null;
    if (state.engine) state.engine._clearTrackVoices(ti, true);
    redrawWaveform();
    updateSampleInfo();
    showToast('Sample cleared');
  });
  infoRow.append(clearBtn);

  wrap.append(infoRow);

  const zoomRow = document.createElement('div');
  zoomRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.5rem';

  const zoomLabel = document.createElement('span');
  zoomLabel.style.cssText = 'color:var(--muted);min-width:24px';
  zoomLabel.textContent = `${waveZoom}x`;
  zoomRow.append(zoomLabel);

  const zoomIn = document.createElement('button');
  zoomIn.className = 'screen-btn';
  zoomIn.textContent = '+';
  zoomIn.addEventListener('click', () => {
    const cx = 0.5;
    const span = 1 / waveZoom;
    const center = wavePan + cx * span;
    waveZoom = Math.min(8, waveZoom * 2);
    const newSpan = 1 / waveZoom;
    wavePan = Math.max(0, Math.min(1 - newSpan, center - cx * newSpan));
    zoomLabel.textContent = `${waveZoom}x`;
    redrawWaveform();
  });

  const zoomOut = document.createElement('button');
  zoomOut.className = 'screen-btn';
  zoomOut.textContent = '−';
  zoomOut.addEventListener('click', () => {
    const cx = 0.5;
    const span = 1 / waveZoom;
    const center = wavePan + cx * span;
    waveZoom = Math.max(1, waveZoom / 2);
    const newSpan = 1 / waveZoom;
    wavePan = Math.max(0, Math.min(1 - newSpan, center - cx * newSpan));
    zoomLabel.textContent = `${waveZoom}x`;
    redrawWaveform();
  });

  zoomRow.append(zoomIn, zoomOut);

  const panLabel = document.createElement('span');
  panLabel.style.cssText = 'color:var(--muted);margin-left:8px';
  panLabel.textContent = 'Pan';
  zoomRow.append(panLabel);

  const panSlider = document.createElement('input');
  panSlider.type = 'range';
  panSlider.min = 0;
  panSlider.max = 100;
  panSlider.value = 0;
  panSlider.style.cssText = 'width:60px;height:14px';
  panSlider.addEventListener('input', () => {
    wavePan = Number(panSlider.value) / 100;
    redrawWaveform();
  });
  zoomRow.append(panSlider);

  const fitBtn = document.createElement('button');
  fitBtn.className = 'screen-btn';
  fitBtn.textContent = 'Fit';
  fitBtn.addEventListener('click', () => {
    waveZoom = 1; wavePan = 0; panSlider.value = 0;
    zoomLabel.textContent = '1x';
    redrawWaveform();
  });
  zoomRow.append(fitBtn);

  wrap.append(zoomRow);

  const trimRow = document.createElement('div');
  trimRow.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.5rem;flex-wrap:wrap';

  function makeTrimSlider(param, labelText, color) {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;align-items:center;gap:4px';

    const lbl = document.createElement('span');
    lbl.style.cssText = `color:${color};min-width:20px`;
    lbl.textContent = labelText;
    container.append(lbl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 1000;
    slider.value = (track[param] ?? 0) * 1000;
    slider.style.cssText = 'width:80px;height:14px';

    slider.addEventListener('input', () => {
      track[param] = Number(slider.value) / 1000;
      if (param === 'sampleStart' && track.sampleStart >= track.sampleEnd) {
        track.sampleEnd = Math.min(1, track.sampleStart + 0.001);
      } else if (param === 'sampleEnd' && track.sampleEnd <= track.sampleStart) {
        track.sampleStart = Math.max(0, track.sampleEnd - 0.001);
      }
      redrawWaveform();
    });

    container.append(slider);
    return container;
  }

  trimRow.append(makeTrimSlider('sampleStart', 'S', '#f0c640'));
  trimRow.append(makeTrimSlider('sampleEnd', 'E', '#ff8c52'));

  const normalizeBtn = document.createElement('button');
  normalizeBtn.className = 'screen-btn';
  normalizeBtn.textContent = 'Norm';
  normalizeBtn.title = 'Normalize audio';
  normalizeBtn.addEventListener('click', () => {
    const buf = track.sampleBuffer;
    if (!buf) { showToast('No sample'); return; }
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak > 0.001) {
      const gain = 0.95 / peak;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) d[i] *= gain;
      }
    }
    redrawWaveform();
    showToast('Normalized');
  });
  trimRow.append(normalizeBtn);

  const reverseBtn = document.createElement('button');
  reverseBtn.className = 'screen-btn';
  reverseBtn.textContent = 'Rev';
  reverseBtn.title = 'Reverse audio';
  reverseBtn.addEventListener('click', () => {
    const buf = track.sampleBuffer;
    if (!buf) { showToast('No sample'); return; }
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      const half = Math.floor(d.length / 2);
      for (let i = 0; i < half; i++) {
        const tmp = d[i];
        d[i] = d[d.length - 1 - i];
        d[d.length - 1 - i] = tmp;
      }
    }
    redrawWaveform();
    showToast('Reversed');
  });
  trimRow.append(reverseBtn);

  const sliceBtn = document.createElement('button');
  sliceBtn.className = 'screen-btn';
  sliceBtn.textContent = 'Slice';
  sliceBtn.title = 'Slice sample evenly across active steps';
  sliceBtn.addEventListener('click', () => {
    const steps = state.project.banks[state.activeBank].patterns[state.activePattern].kit.tracks[ti]?.steps;
    if (!steps || !track.sampleBuffer) { showToast('No sample or steps'); return; }
    const activeSteps = steps.filter(s => s.active);
    if (activeSteps.length < 2) { showToast('Need ≥2 active steps'); return; }
    const sliceLen = 1 / activeSteps.length;
    activeSteps.forEach((step, i) => {
      if (!step.paramLocks) step.paramLocks = {};
      step.paramLocks.sampleStart = i * sliceLen;
      step.paramLocks.sampleEnd = (i + 1) * sliceLen;
      step.paramLocks.loopEnabled = 0;
    });
    showToast(`Sliced across ${activeSteps.length} steps`);
    redrawWaveform();
  });
  trimRow.append(sliceBtn);

  wrap.append(trimRow);

  const loopControls = document.createElement('div');
  loopControls.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.5rem;flex-wrap:wrap';

  const loopToggle = document.createElement('button');
  loopToggle.className = 'screen-btn';
  loopToggle.textContent = track.loopEnabled ? 'Loop: ON' : 'Loop: OFF';
  loopToggle.addEventListener('click', () => {
    track.loopEnabled = !track.loopEnabled;
    loopToggle.textContent = track.loopEnabled ? 'Loop: ON' : 'Loop: OFF';
    redrawWaveform();
  });
  loopControls.append(loopToggle);

  loopControls.append(makeTrimSlider('loopStart', 'LS', '#00e5e5'));
  loopControls.append(makeTrimSlider('loopEnd', 'LE', '#00cccc'));

  const snapBtn = document.createElement('button');
  snapBtn.className = 'screen-btn';
  snapBtn.textContent = 'Snap';
  snapBtn.title = 'Snap loop to zero crossings';
  snapBtn.addEventListener('click', () => {
    const buf = track.sampleBuffer;
    if (!buf) { showToast('No sample'); return; }
    const d = buf.getChannelData(0);
    const findZero = (approxSample) => {
      let best = Math.max(0, Math.min(d.length - 1, Math.round(approxSample)));
      for (let i = best - 50; i <= best + 50; i++) {
        if (i < 0 || i >= d.length) continue;
        if (Math.abs(d[i]) < 0.002) return i;
      }
      let minVal = Infinity, minIdx = best;
      for (let i = best - 100; i <= best + 100; i++) {
        if (i < 0 || i >= d.length) continue;
        const abs = Math.abs(d[i]);
        if (abs < minVal) { minVal = abs; minIdx = i; }
      }
      return minIdx;
    };
    track.loopStart = findZero(track.loopStart * d.length) / d.length;
    track.loopEnd   = findZero(track.loopEnd * d.length) / d.length;
    document.querySelectorAll('[data-sound-trim]').forEach(el => {
      if (el.dataset.soundTrim === 'loopStart') el.value = track.loopStart * 1000;
      if (el.dataset.soundTrim === 'loopEnd') el.value = track.loopEnd * 1000;
    });
    redrawWaveform();
    showToast('Loop snapped');
  });
  loopControls.append(snapBtn);

  const previewBtn = document.createElement('button');
  previewBtn.className = 'screen-btn';
  previewBtn.textContent = '▶ Preview';
  previewBtn.addEventListener('click', async () => {
    const buf = track.sampleBuffer;
    if (!buf) { showToast('No sample'); return; }
    try {
      await state.audioContext.resume();
      const src = state.audioContext.createBufferSource();
      src.buffer = buf;
      src.loop = track.loopEnabled ?? false;
      src.loopStart = track.loopStart ?? 0;
      src.loopEnd = track.loopEnd ?? 1;
      const gain = state.audioContext.createGain();
      gain.gain.value = 0.6;
      src.connect(gain);
      gain.connect(state.engine.master);
      src.start(0, track.sampleStart ?? 0, track.loopEnabled ? undefined : (track.sampleEnd ?? 1) - (track.sampleStart ?? 0));
      previewBtn.textContent = '■ Stop';
      const stopPreview = () => {
        try { src.stop(); } catch (_) {}
        previewBtn.textContent = '▶ Preview';
      };
      src.onended = stopPreview;
      const stopHandler = () => { stopPreview(); previewBtn.removeEventListener('click', stopHandler); };
      previewBtn.addEventListener('click', stopHandler, { once: true });
    } catch (err) {
      console.warn('Preview failed:', err);
      showToast('Preview failed');
    }
  });

  loopControls.append(previewBtn);
  wrap.append(loopControls);

  machCard.append(wrap);
  return wrap;
}
