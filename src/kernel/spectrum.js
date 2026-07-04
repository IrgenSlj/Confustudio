// CONFUstudio — spectral band energies (pure kernel, Phase C perception C2)
//
// Aggregates an FFT magnitude array into the 6 named bands the whole studio
// shares as one vocabulary (code brief §C2, design brief §6): the mixer
// spectrum, the lint rules (mud-250-500, sub-collision), and the agent's
// PerceptionReport all read the SAME band scheme. Pure: no DOM, no Web Audio.

/**
 * The 6 frequency bands (Hz). `hi` is exclusive; the last band is open-ended.
 * @type {ReadonlyArray<{ name: string, label: string, lo: number, hi: number }>}
 */
export const BANDS = Object.freeze([
  { name: 'sub', label: 'SUB', lo: 0, hi: 60 },
  { name: 'low', label: 'LOW', lo: 60, hi: 250 },
  { name: 'lowmid', label: 'LO-MID', lo: 250, hi: 500 },
  { name: 'mid', label: 'MID', lo: 500, hi: 2000 },
  { name: 'high', label: 'HIGH', lo: 2000, hi: 8000 },
  { name: 'air', label: 'AIR', lo: 8000, hi: Infinity },
]);

/**
 * Frequency (Hz) at the centre of FFT bin `i`.
 * @param {number} i
 * @param {number} binCount number of magnitude bins (fftSize / 2)
 * @param {number} sampleRate
 * @returns {number}
 */
export function binToHz(i, binCount, sampleRate) {
  const nyquist = sampleRate / 2;
  return ((i + 0.5) / binCount) * nyquist;
}

/**
 * Aggregate an FFT magnitude array into the 6 band averages. Each band value is
 * the mean of the bins whose centre frequency falls in the band; bands with no
 * bins return 0. Input units pass through (0..1 normalized, 0..255 byte, or dB —
 * caller's choice); the output is in the same units.
 * @param {ArrayLike<number>} mags
 * @param {number} sampleRate
 * @returns {number[]} 6 values, in BANDS order
 */
export function bandEnergies(mags, sampleRate) {
  const binCount = mags ? mags.length : 0;
  const sums = new Array(BANDS.length).fill(0);
  const counts = new Array(BANDS.length).fill(0);
  if (!binCount || !(sampleRate > 0)) return sums;
  for (let i = 0; i < binCount; i++) {
    const hz = binToHz(i, binCount, sampleRate);
    for (let b = 0; b < BANDS.length; b++) {
      if (hz >= BANDS[b].lo && hz < BANDS[b].hi) {
        sums[b] += mags[i];
        counts[b] += 1;
        break;
      }
    }
  }
  return sums.map((s, b) => (counts[b] ? s / counts[b] : 0));
}

/**
 * Index of the band a frequency falls into (0..5), or -1.
 * @param {number} hz
 * @returns {number}
 */
export function bandIndexForHz(hz) {
  for (let b = 0; b < BANDS.length; b++) {
    if (hz >= BANDS[b].lo && hz < BANDS[b].hi) return b;
  }
  return -1;
}
