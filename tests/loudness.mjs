// Deterministic perception test — loudness math against known signals.
// LUFS can't be checked by ear headlessly, but the math is deterministic:
// exact conversion, LTI linearity (a +10 dB input reads +10 LU), silence floor,
// and a calibration ballpark for a -20 dBFS 1 kHz sine.
import assert from 'node:assert/strict';
import {
  LUFS_SILENCE,
  meanSquare,
  meanSquareToLufs,
  blockLoudnessLufs,
  integratedLufs,
  kWeight,
} from '../src/kernel/loudness.js';

const SR = 48000;

function sine(freq, amp, n, sr = SR) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// 1 · Exact conversion math
near(meanSquareToLufs(1), -0.691, 1e-9, 'meanSquareToLufs(1)');
near(meanSquareToLufs(0.5), -3.7012, 1e-3, 'meanSquareToLufs(0.5)');
assert.equal(meanSquareToLufs(0), -Infinity, 'meanSquareToLufs(0) is -Infinity');

// 2 · meanSquare of a unit sine = 0.5
near(meanSquare(sine(1000, 1, SR)), 0.5, 1e-3, 'meanSquare(unit 1kHz sine)');

// 3 · Silence reads the finite floor, not -Infinity
assert.equal(blockLoudnessLufs(new Float32Array(SR), SR), LUFS_SILENCE, 'silence → floor');

// 4 · LTI linearity: scaling input by -10 dB drops loudness by ~10 LU
//    (coefficient-independent — the strongest correctness check)
const loud = blockLoudnessLufs(sine(1000, 0.5, SR), SR);
const quiet = blockLoudnessLufs(sine(1000, 0.5 * Math.pow(10, -10 / 20), SR), SR);
near(loud - quiet, 10, 0.1, 'linearity: -10 dB input → -10 LU');

// 5 · Calibration ballpark: a -20 dBFS 1 kHz sine (RMS 0.1 → amp 0.1*√2)
//    reads near -20 LUFS (K-weighting adds a small gain at 1 kHz).
const cal = blockLoudnessLufs(sine(1000, 0.1 * Math.SQRT2, SR), SR);
near(cal, -20, 2.5, '-20 dBFS 1kHz sine ≈ -20 LUFS');

// 6 · K-weighting boosts highs relative to lows (RLB high-pass + head shelf):
//    an 8 kHz tone reads louder than a 40 Hz tone at equal amplitude.
const hi = blockLoudnessLufs(sine(8000, 0.25, SR), SR);
const lo = blockLoudnessLufs(sine(40, 0.25, SR), SR);
assert.ok(hi > lo + 3, `K-weighting: 8kHz (${hi}) should exceed 40Hz (${lo})`);

// 7 · Integrated gating: a run of equal-loudness blocks integrates to that
//    loudness; a silent block is gated out and doesn't drag it down.
const msLoud = meanSquare(kWeight(sine(1000, 0.1 * Math.SQRT2, SR), SR));
const integ = integratedLufs([msLoud, msLoud, msLoud, 0]);
near(integ, meanSquareToLufs(msLoud), 0.01, 'integrated ≈ block loudness (silence gated)');
assert.equal(integratedLufs([]), LUFS_SILENCE, 'integrated of nothing → floor');

console.log(JSON.stringify({ ok: true, cal_minus20_sine_lufs: Number(cal.toFixed(2)), linearity_delta: Number((loud - quiet).toFixed(3)) }, null, 2));
