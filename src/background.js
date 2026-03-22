// background.js — audio-reactive animated background
export function initBackground() {
  const wrap = document.getElementById('studio-wrap');
  if (!wrap) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0';
  wrap.insertBefore(canvas, wrap.firstChild);

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  function resize() { W = canvas.width = wrap.offsetWidth; H = canvas.height = wrap.offsetHeight; }
  resize();
  window.addEventListener('resize', resize);

  // Pre-allocated buffers (never allocate in rAF)
  let _freqBuf = null;
  let _timeBuf = null;
  let phase = 0;
  let beatPulse = 0;

  function draw() {
    requestAnimationFrame(draw);

    const engine = window._confusynthEngine;
    const analyser = engine?.analyser;
    let bass = 0, mid = 0, high = 0, hasAudio = false;
    let waveData = null;

    if (analyser) {
      const binCount = analyser.frequencyBinCount;
      if (!_freqBuf || _freqBuf.length !== binCount) _freqBuf = new Uint8Array(binCount);
      if (!_timeBuf || _timeBuf.length !== binCount) _timeBuf = new Uint8Array(binCount);
      analyser.getByteFrequencyData(_freqBuf);
      analyser.getByteTimeDomainData(_timeBuf);
      waveData = _timeBuf;
      hasAudio = true;

      for (let i = 0; i < 4; i++)  bass += _freqBuf[i];
      for (let i = 4; i < 18; i++) mid  += _freqBuf[i];
      for (let i = 18; i < 50; i++) high += _freqBuf[i];
      bass /= (4 * 255); mid /= (14 * 255); high /= (32 * 255);
    }

    // Beat detection
    if (bass > 0.55) beatPulse = Math.min(1, beatPulse + 0.4);
    beatPulse = Math.max(0, beatPulse - 0.025);

    phase += 0.003 + mid * 0.008;

    // === Draw ===

    // Dark base — near-black with subtle green tint (studio monitor feel)
    ctx.fillStyle = '#080e07';
    ctx.fillRect(0, 0, W, H);

    // Three undulating wave bands
    const waves = [
      { yBase: H * 0.72, amp: 45 + bass * 90, freq: 0.0025, spd: 1.0, alpha: 0.055 + bass * 0.07,  hue: 130 },
      { yBase: H * 0.55, amp: 30 + mid  * 60, freq: 0.0042, spd: 1.6, alpha: 0.04  + mid  * 0.05,  hue: 145 },
      { yBase: H * 0.38, amp: 18 + high * 40, freq: 0.008,  spd: 2.4, alpha: 0.03  + high * 0.04,  hue: 160 },
    ];

    waves.forEach(({ yBase, amp, freq, spd, alpha, hue }) => {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = yBase + Math.sin(x * freq + phase * spd) * amp
                        + Math.sin(x * freq * 1.7 + phase * spd * 0.6) * amp * 0.3;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fillStyle = `hsla(${hue},55%,28%,${alpha})`;
      ctx.fill();
    });

    // Real-time waveform trace — the actual audio signal drawn large
    if (waveData && hasAudio) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(90,221,113,${0.06 + mid * 0.08})`;
      ctx.lineWidth = 1.5;
      const step = Math.ceil(waveData.length / W);
      for (let x = 0; x < W; x++) {
        const i = Math.min(waveData.length - 1, x * step);
        const y = H * 0.5 + ((waveData[i] - 128) / 128) * H * (0.25 + bass * 0.25);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Beat pulse — radial flash from center
    if (beatPulse > 0.02) {
      const r = Math.max(W, H) * 0.8;
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
      grad.addColorStop(0, `rgba(90,221,113,${beatPulse * 0.07})`);
      grad.addColorStop(1, 'rgba(90,221,113,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Subtle vignette — darkens corners
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  draw();
}
