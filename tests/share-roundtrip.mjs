import { strict as assert } from 'node:assert';

import { createAppState } from '../src/state.js';
import { encodePattern, decodeShare, buildApplyCommands } from '../src/share.js';
import { executeStudioCommands } from '../src/command-bus.js';

// Build a distinctive source pattern on the active bank/pattern.
const src = createAppState();
src.bpm = 137;
src.swing = 0.18;
const pat = src.project.banks[src.activeBank].patterns[src.activePattern];
pat.length = 24;
const t0 = pat.kit.tracks[0];
t0.machine = 'plaits';
t0.waveform = 'square';
t0.filterType = 'bandpass';
t0.pitch = 55;
t0.cutoff = 4200;
t0.resonance = 3.1;
t0.drive = 0.42;
t0.reverbSend = 0.66;
// Deterministic active steps on track 0 (clear all, then set a few).
t0.steps.forEach((s) => (s.active = false));
[
  { i: 0, note: 36, velocity: 1, probability: 1, accent: true },
  { i: 4, note: 48, velocity: 0.5, probability: 0.75, accent: false },
  { i: 10, note: 60, velocity: 0.8, probability: 0.5, accent: true },
].forEach(({ i, note, velocity, probability, accent }) => {
  Object.assign(t0.steps[i], { active: true, note, velocity, probability, accent });
});

// Encode → the link should be a compact, URL-safe string.
const encoded = encodePattern(src);
assert.ok(typeof encoded === 'string' && encoded.length > 0, 'encode produced a string');
assert.ok(/^[A-Za-z0-9_-]+$/.test(encoded), 'encoded string is URL-safe (base64url)');

// Decode → apply into a FRESH state (the recipient) and check fidelity.
const data = decodeShare(encoded);
assert.ok(data, 'decode returned data');
assert.equal(data.bpm, 137);
assert.equal(data.length, 24);

const dst = createAppState();
const res = executeStudioCommands(dst, buildApplyCommands(data));
assert.equal(res.changed, true, 'applying the shared pattern changed state');

assert.equal(dst.bpm, 137, 'bpm transferred');
assert.ok(Math.abs(dst.swing - 0.18) < 1e-6, 'swing transferred');
const dt0 = dst.project.banks[dst.activeBank].patterns[dst.activePattern].kit.tracks[0];
assert.equal(dt0.machine, 'plaits', 'machine transferred');
assert.equal(dt0.waveform, 'square', 'waveform transferred');
assert.equal(dt0.filterType, 'bandpass', 'filterType transferred');
assert.equal(dt0.pitch, 55, 'pitch transferred');
assert.equal(dt0.cutoff, 4200, 'cutoff transferred');
assert.ok(Math.abs(dt0.reverbSend - 0.66) < 1e-6, 'reverbSend transferred');

const active = dt0.steps.map((s, i) => (s.active ? i : -1)).filter((i) => i >= 0);
assert.deepEqual(active, [0, 4, 10], 'exactly the shared steps are active — no phantom hits');
assert.equal(dt0.steps[0].note, 36, 'step 0 note transferred');
assert.equal(dt0.steps[0].accent, true, 'step 0 accent transferred');
assert.ok(Math.abs(dt0.steps[4].probability - 0.75) < 1e-6, 'step 4 probability transferred');
assert.ok(Math.abs(dt0.steps[10].velocity - 0.8) < 1e-6, 'step 10 velocity transferred');

// A malformed / garbage link must never throw — it decodes to null.
assert.equal(decodeShare('not-valid-base64url!!!'), null, 'garbage decodes to null');
assert.equal(decodeShare(''), null, 'empty decodes to null');
assert.equal(buildApplyCommands(null).length, 0, 'null data yields no commands');

console.log(JSON.stringify({ ok: true, encodedLength: encoded.length }, null, 2));
