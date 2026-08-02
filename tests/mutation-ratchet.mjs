// core/07-mutation-migration ratchet.
//
// The plan says: "Route every persistent UI mutation through the reducer; fail
// tests on direct writes." Gating that outright today would just fail — there
// are 131 such sites across 18 files. So this is a ratchet instead: the count
// may go DOWN or stay flat, never up.
//
// That makes #20 completable incrementally without a regression sneaking back
// in, and Gate P2's "no persistent direct mutation remains" is reached when the
// baseline hits zero.
//
// This is a heuristic scan, not a type system. It is deliberately tuned to be
// useful rather than exhaustive: it reports the shape of the remaining work and
// stops it growing.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(rootDir, 'tests', 'fixtures', 'mutation-baseline.json');

// Assignments that write persisted project state.
const MUTATION_PATTERNS = [
  /\bstate\.project\b[^=\n]*=[^=]/,
  /\btrack\.(?!sampleBuffer)[a-zA-Z]+\s*=[^=]/,
  /\bstep\.[a-zA-Z]+\s*=[^=]/,
  /\bpattern\.[a-zA-Z]+\s*=[^=]/,
  /\.steps\[[^\]]+\]\s*=[^=]/,
];

// A write already routed through the command bus keeps its direct write as the
// per-workflow compatibility fallback the core/07 rollback requires. Those are
// not unrouted mutations, but they ARE still direct writes, so they are counted
// separately rather than quietly exempted — the marker is an explicit,
// greppable claim that a bus route guards this line.
const ROUTED_MARKER = 'routed-fallback';

// The reducer and the state module are where mutation is supposed to live.
const EXEMPT_FILES = new Set(['command-bus.js', 'state.js']);
// Directories that are already reducer-based or are not persistent UI.
const EXEMPT_DIRS = new Set(['worklets', 'commands', 'project']);

async function collectSources(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXEMPT_DIRS.has(entry.name)) continue;
      found.push(...(await collectSources(full)));
    } else if (entry.name.endsWith('.js')) {
      found.push(full);
    }
  }
  return found;
}

const counts = {};
let routedFallbacks = 0;
for (const file of await collectSources(path.join(rootDir, 'src'))) {
  if (EXEMPT_FILES.has(path.basename(file))) continue;
  const lines = (await readFile(file, 'utf8')).split('\n');
  let hits = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (!MUTATION_PATTERNS.some((pattern) => pattern.test(line))) continue;
    if (line.includes(ROUTED_MARKER)) {
      routedFallbacks += 1;
      continue;
    }
    hits += 1;
  }
  if (hits > 0) counts[path.relative(rootDir, file)] = hits;
}

const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

assert.ok(
  total <= baseline.totalDirectMutationSites,
  `Direct persistent mutations went UP: ${total} > ${baseline.totalDirectMutationSites}. ` +
    'Route the new write through the reducer, or update the baseline if you removed some.',
);

// Keep the baseline honest: if the count drops, the file must be updated so the
// ratchet actually tightens instead of leaving slack behind.
assert.ok(
  total >= baseline.totalDirectMutationSites - baseline.slack,
  `Direct persistent mutations dropped to ${total} (baseline ${baseline.totalDirectMutationSites}). ` +
    'Lower tests/fixtures/mutation-baseline.json so the ratchet tightens.',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      unroutedDirectMutations: total,
      baseline: baseline.totalDirectMutationSites,
      routedFallbacks,
      filesAffected: Object.keys(counts).length,
      gateP2Clear: total === 0,
    },
    null,
    2,
  ),
);
