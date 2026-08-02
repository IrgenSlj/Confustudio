// Seeded, deterministic randomness for command reducers.
//
// A reducer that calls Math.random() cannot be replayed, undone reliably, or
// agreed on by two machines applying the same proposal. The plan's rule is that
// random operations carry a seed or a materialized result; this is the seed
// path. mulberry32 is small, fast, and has no global state.

/**
 * @param {number} seed
 * @returns {() => number} generator producing [0, 1)
 */
export function createSeededRandom(seed) {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [min, max]. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
