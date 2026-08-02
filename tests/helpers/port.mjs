// Test port selection that avoids Chromium's blocked-port list.
//
// Chromium refuses to navigate to a set of "unsafe" ports and fails with
// net::ERR_UNSAFE_PORT. Several of them sit inside the ranges these tests draw
// from — 5060/5061 (SIP) in 4300-5299, and 6000 (X11) in 5300-6299 — so a
// random draw hit one roughly once in a thousand runs and the whole suite
// failed for a reason that had nothing to do with the code under test.
//
// This was a real intermittent CI failure, not a hypothetical.

// Chromium's restricted ports that fall anywhere near the ranges we use.
// (The full list is much longer, but everything else is far below 4000.)
const UNSAFE_PORTS = new Set([5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

/**
 * Picks a random port in [base, base + span) that Chromium will actually load.
 *
 * @param {number} base
 * @param {number} [span]
 * @returns {number}
 */
export function pickTestPort(base, span = 1000) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const port = base + Math.floor(Math.random() * span);
    if (!UNSAFE_PORTS.has(port)) return port;
  }
  // Every draw landed on a blocked port, which cannot happen for our ranges;
  // fail loudly rather than returning something Chromium will refuse.
  throw new Error(`Could not find a safe port in [${base}, ${base + span})`);
}

export { UNSAFE_PORTS };
