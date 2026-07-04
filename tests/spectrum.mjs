// Deterministic perception test — band-energy aggregation.
import assert from 'node:assert/strict';
import { BANDS, bandEnergies, bandIndexForHz, binToHz } from '../src/kernel/spectrum.js';

const SR = 48000;
const N = 256;

// bandIndexForHz: representative frequencies land in the right band.
assert.equal(bandIndexForHz(40), 0, 'sub');
assert.equal(bandIndexForHz(120), 1, 'low');
assert.equal(bandIndexForHz(300), 2, 'lowmid');
assert.equal(bandIndexForHz(1000), 3, 'mid');
assert.equal(bandIndexForHz(5000), 4, 'high');
assert.equal(bandIndexForHz(12000), 5, 'air');

// A single hot bin lands entirely in exactly one band; all others are zero.
for (const idx of [1, 3, 8, 40, 120, 240]) {
  const mags = new Float32Array(N);
  mags[idx] = 1;
  const expected = bandIndexForHz(binToHz(idx, N, SR));
  const e = bandEnergies(mags, SR);
  assert.ok(expected >= 0, `bin ${idx} maps to a band`);
  assert.ok(e[expected] > 0, `bin ${idx} → band ${BANDS[expected].name} nonzero`);
  for (let b = 0; b < BANDS.length; b++) {
    if (b !== expected) assert.equal(e[b], 0, `bin ${idx}: band ${BANDS[b].name} should be 0`);
  }
}

// Empty / invalid input → all zeros, never throws.
assert.deepEqual(bandEnergies(new Float32Array(N), SR), new Array(6).fill(0), 'silence → zeros');
assert.deepEqual(bandEnergies([], SR), new Array(6).fill(0), 'empty → zeros');
assert.deepEqual(bandEnergies(new Float32Array(N), 0), new Array(6).fill(0), 'bad rate → zeros');

// Band averaging: uniform magnitudes → every populated band equals that value.
const flat = new Float32Array(N).fill(0.5);
for (const v of bandEnergies(flat, SR)) assert.ok(Math.abs(v - 0.5) < 1e-9, 'uniform → 0.5 per band');

console.log(JSON.stringify({ ok: true, bands: BANDS.map((b) => b.name) }, null, 2));
