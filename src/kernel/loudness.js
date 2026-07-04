// CONFUstudio — loudness metering (pure kernel, Phase C perception seed)
//
// Momentary/short-term loudness per ITU-R BS.1770 (K-weighting → mean square →
// LUFS). Pure and deterministic: takes sample blocks, returns numbers. No DOM,
// no Web Audio. The realtime mixer meter and the offline PerceptionReport both
// compute loudness through this one module (fidelity: one path, D-N15 spirit).
//
// K-weighting = a two-stage IIR: a high-shelf ("head" filter) followed by a
// high-pass ("RLB" filter). Coefficients below are the BS.1770 reference values
// at 48 kHz; for other rates we re-derive them from the analog prototype so the
// meter stays honest off the reference rate.

/** LUFS floor reported instead of -Infinity for silence. */
export const LUFS_SILENCE = -70;

/**
 * @typedef {Object} Biquad
 * @property {number} b0
 * @property {number} b1
 * @property {number} b2
 * @property {number} a1
 * @property {number} a2
 */

/**
 * BS.1770 reference K-weighting coefficients at 48 kHz.
 * @type {{ stage1: Biquad, stage2: Biquad }}
 */
const K_48K = {
  // Stage 1 — high-shelf (+4 dB @ ~1681 Hz)
  stage1: { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
  // Stage 2 — high-pass (RLB weighting curve, ~38 Hz)
  stage2: { b0: 1.0, b1: -2.0, b2: 1.0, a1: -1.99004745483398, a2: 0.99007225036621 },
};

/**
 * Derive K-weighting coefficients for an arbitrary sample rate from the analog
 * prototype (matched-Z / bilinear as used by the BS.1770 reference). At 48 kHz
 * this returns the exact reference table above.
 * @param {number} sampleRate
 * @returns {{ stage1: Biquad, stage2: Biquad }}
 */
export function kWeightingCoefficients(sampleRate = 48000) {
  if (Math.abs(sampleRate - 48000) < 1e-6) return K_48K;

  // Stage 1: high shelf. Analog params from the BS.1770 spec.
  const f0 = 1681.9744509555319;
  const G = 3.99984385397; // dB
  const Q = 0.7071752369554193;
  const K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.499666774155);
  const a0_ = 1 + K / Q + K * K;
  const stage1 = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0_,
    b1: (2 * (K * K - Vh)) / a0_,
    b2: (Vh - (Vb * K) / Q + K * K) / a0_,
    a1: (2 * (K * K - 1)) / a0_,
    a2: (1 - K / Q + K * K) / a0_,
  };

  // Stage 2: high pass at ~38 Hz.
  const fh = 38.13547087613982;
  const Qh = 0.5003270373253953;
  const Kh = Math.tan((Math.PI * fh) / sampleRate);
  const a0h = 1 + Kh / Qh + Kh * Kh;
  const stage2 = {
    b0: 1 / a0h * (1),
    b1: (-2) / a0h,
    b2: 1 / a0h,
    a1: (2 * (Kh * Kh - 1)) / a0h,
    a2: (1 - Kh / Qh + Kh * Kh) / a0h,
  };
  // Normalise stage2 numerator to unity passband (b0=1 form) like the reference.
  const g = a0h;
  stage2.b0 *= g;
  stage2.b1 *= g;
  stage2.b2 *= g;

  return { stage1, stage2 };
}

/**
 * Apply a single biquad (Direct Form I) to a sample block, carrying state.
 * @param {Float32Array|number[]} input
 * @param {Biquad} c
 * @param {{ x1:number, x2:number, y1:number, y2:number }} [state]
 * @returns {Float32Array}
 */
export function applyBiquad(input, c, state = { x1: 0, x2: 0, y1: 0, y2: 0 }) {
  const out = new Float32Array(input.length);
  let { x1, x2, y1, y2 } = state;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  state.x1 = x1;
  state.x2 = x2;
  state.y1 = y1;
  state.y2 = y2;
  return out;
}

/**
 * K-weight a mono sample block (stage1 → stage2).
 * @param {Float32Array|number[]} samples
 * @param {number} [sampleRate]
 * @returns {Float32Array}
 */
export function kWeight(samples, sampleRate = 48000) {
  const { stage1, stage2 } = kWeightingCoefficients(sampleRate);
  return applyBiquad(applyBiquad(samples, stage1), stage2);
}

/**
 * Mean square of a block.
 * @param {Float32Array|number[]} samples
 * @returns {number}
 */
export function meanSquare(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return sum / samples.length;
}

/**
 * Convert a K-weighted mean-square value to LUFS (BS.1770 loudness).
 * @param {number} ms
 * @returns {number}
 */
export function meanSquareToLufs(ms) {
  if (!(ms > 0)) return -Infinity;
  return -0.691 + 10 * Math.log10(ms);
}

/**
 * Momentary/short-term loudness of a (already-windowed) mono block, in LUFS.
 * Caller supplies the window (400 ms momentary / 3 s short-term). Returns
 * LUFS_SILENCE for silence rather than -Infinity so meters stay finite.
 * @param {Float32Array|number[]} block
 * @param {number} [sampleRate]
 * @returns {number}
 */
export function blockLoudnessLufs(block, sampleRate = 48000) {
  const weighted = kWeight(block, sampleRate);
  const lufs = meanSquareToLufs(meanSquare(weighted));
  return Number.isFinite(lufs) ? Math.max(LUFS_SILENCE, lufs) : LUFS_SILENCE;
}

/**
 * Integrated loudness (BS.1770 gated) over a sequence of 400 ms blocks' mean
 * squares. Applies the absolute −70 LUFS gate and the relative −10 LU gate.
 * @param {number[]} blockMeanSquares K-weighted mean-square per 400 ms block
 * @returns {number}
 */
export function integratedLufs(blockMeanSquares) {
  if (!blockMeanSquares || blockMeanSquares.length === 0) return LUFS_SILENCE;
  const absGated = blockMeanSquares.filter((ms) => meanSquareToLufs(ms) > -70);
  if (absGated.length === 0) return LUFS_SILENCE;
  const meanAbs = absGated.reduce((a, b) => a + b, 0) / absGated.length;
  const relThresh = meanSquareToLufs(meanAbs) - 10;
  const relGated = absGated.filter((ms) => meanSquareToLufs(ms) > relThresh);
  const pool = relGated.length ? relGated : absGated;
  const mean = pool.reduce((a, b) => a + b, 0) / pool.length;
  const lufs = meanSquareToLufs(mean);
  return Number.isFinite(lufs) ? Math.max(LUFS_SILENCE, lufs) : LUFS_SILENCE;
}
