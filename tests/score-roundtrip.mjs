import { strict as assert } from 'node:assert';

import { emitScore, midiToNoteName, noteNameToMidi, normalizeScore, parseScore } from '../src/kernel/score.js';

// ─── Note-name ⇄ MIDI helpers ─────────────────────────────────────────────────

assert.equal(noteNameToMidi('C-1'), 0);
assert.equal(noteNameToMidi('C4'), 60);
assert.equal(noteNameToMidi('C2'), 36);
assert.equal(noteNameToMidi('D#2'), 39);
assert.equal(noteNameToMidi('G1'), 31);
assert.equal(noteNameToMidi('G9'), 127);
assert.equal(noteNameToMidi('Db4'), 61); // flats accepted on input
assert.equal(noteNameToMidi('C#4'), 61);
assert.equal(noteNameToMidi('H4'), null); // not a note letter
assert.equal(noteNameToMidi('C99'), null); // out of range
assert.equal(noteNameToMidi(42), null);

assert.equal(midiToNoteName(0), 'C-1');
assert.equal(midiToNoteName(60), 'C4');
assert.equal(midiToNoteName(39), 'D#2');
assert.equal(midiToNoteName(127), 'G9');
// flats normalize to sharps on the way back out
assert.equal(midiToNoteName(noteNameToMidi('Db4')), 'C#4');

// ─── Round-trip fixtures (already in canonical form) ──────────────────────────

const fixtures = {
  'kick four-on-floor': ['# bank A · pattern 1 · 132bpm · len 16 · swing 54%', 'T1 kick |X...X...X...X...|'].join('\n'),

  'off-beat hats with p:vel ghosts': ['# len 16', 'T2 hat |..x...x...x...x.| p:vel=0.6'].join('\n'),

  'acid line: notes + slides + accents': ['# 130bpm · len 16', 'T3 acid |C2...D#2...C2...G1...| s:5,13 a:9'].join('\n'),

  'clap with A:B trig condition': ['# len 16', 'T4 clap |....X.......X...| c:13=3:4'].join('\n'),

  'p-lock cutoff lane': [
    '# len 16',
    'T3 acid |C2...D#2...C2...G1...|',
    'L T3.cutoff |. . . . 46 . . . 62 . . . 80 . . .|',
  ].join('\n'),

  'full pattern: every construct together': [
    '# bank A · pattern 3 · 132bpm · len 16 · swing 54%',
    'T1 kick |X...X...X...X...|',
    'T2 hat |..x...x...x...x.| p:vel=0.6',
    'T3 acid |C2...D#2...C2...G1...| s:5,13 a:9',
    'L T3.cutoff |. . . . 46 . . . 62 . . . 80 . . .|',
    'T4 clap |....X.......X...| c:13=3:4',
  ].join('\n'),

  'every-N + fill conditions': ['# len 8', 'T1 kick |X.X.X.X.| c:1=every4 c:5=fill'].join('\n'),
};

for (const [label, text] of Object.entries(fixtures)) {
  const parsed = parseScore(text);
  assert.ok(parsed.ok, `fixture "${label}" should parse: ${JSON.stringify(parsed.errors)}`);

  // Canonical fixtures are their own normal form (emit is deterministic).
  assert.equal(normalizeScore(text), text, `fixture "${label}" should already be canonical`);

  // The core round-trip property from the brief:
  //   normalizeScore(emitScore(parseScore(x).pattern)) === normalizeScore(x)
  const emitted = emitScore(parsed.pattern);
  assert.equal(normalizeScore(emitted), normalizeScore(text), `fixture "${label}" must round-trip losslessly`);

  // normalize is idempotent.
  assert.equal(normalizeScore(normalizeScore(text)), normalizeScore(text), `fixture "${label}" normalize idempotent`);
}

// ─── Structural assertions on the parsed model ────────────────────────────────

{
  const { pattern } = parseScore(fixtures['full pattern: every construct together']);
  assert.equal(pattern.meta.bank, 'A');
  assert.equal(pattern.meta.pattern, 3);
  assert.equal(pattern.meta.bpm, 132);
  assert.equal(pattern.meta.len, 16);
  assert.equal(pattern.meta.swing, 54);
  assert.equal(pattern.tracks.length, 4);

  const kick = pattern.tracks[0];
  assert.equal(kick.name, 'kick');
  assert.equal(kick.steps.filter((s) => s.active).length, 4);
  assert.equal(kick.steps[0].active, true);
  assert.equal(kick.steps[0].note, null); // X = inherit track pitch

  const hat = pattern.tracks[1];
  assert.equal(hat.defaults.vel, 0.6);
  assert.equal(hat.steps[2].ghost, true);
  assert.equal(hat.steps[2].velocity, 0.35); // ghost = low velocity

  const acid = pattern.tracks[2];
  assert.equal(acid.steps[0].note, noteNameToMidi('C2'));
  assert.equal(acid.steps[4].note, noteNameToMidi('D#2'));
  assert.equal(acid.steps[4].slide, true); // s:5
  assert.equal(acid.steps[8].accent, true); // a:9
  assert.equal(acid.steps[4].paramLocks.cutoff, 46); // lane folded onto step
  assert.equal(acid.steps[8].paramLocks.cutoff, 62);
  assert.equal(acid.steps[12].paramLocks.cutoff, 80);

  const clap = pattern.tracks[3];
  assert.equal(clap.steps[12].trigCondition, '3:4');
}

// Trig-condition aliases canonicalize (first → 1st, not:first → not1st).
{
  const parsed = parseScore('# len 4\nT1 kick |X.X.| c:1=first c:3=not:first');
  assert.ok(parsed.ok);
  assert.equal(parsed.pattern.tracks[0].steps[0].trigCondition, '1st');
  assert.equal(parsed.pattern.tracks[0].steps[2].trigCondition, 'not1st');
  // ...and the canonical emit uses the canonical tokens.
  assert.match(emitScore(parsed.pattern), /c:1=1st/);
  assert.match(emitScore(parsed.pattern), /c:3=not1st/);
}

// Whitespace-tolerant input normalizes to the packed canonical grid.
{
  const messy = '#   len   16  \nT1  kick   | X . . . X . . . X . . . X . . . |';
  const canonical = '# len 16\nT1 kick |X...X...X...X...|';
  assert.equal(normalizeScore(messy), canonical);
}

// ─── Tolerant errors (structured, never thrown) ───────────────────────────────

// Bad bar width.
{
  const result = parseScore('# len 16\nT1 kick |X...X...X...X..|'); // 15 steps
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors) && result.errors.length >= 1);
  const err = result.errors[0];
  assert.equal(err.line, 2);
  assert.equal(typeof err.col, 'number');
  assert.match(err.message, /15 steps, expected 16/);
  assert.equal(typeof err.hint, 'string');
}

const hasError = (result, re) => result.errors.some((e) => re.test(e.message) && typeof e.hint === 'string');

// Unknown token in the grid.
{
  const result = parseScore('# len 4\nT1 kick |X.?.|');
  assert.equal(result.ok, false);
  assert.ok(hasError(result, /Unknown step symbol "\?"/), 'unknown grid symbol reported');
}

// Unknown modifier / bad trig condition.
{
  const bad = parseScore('# len 4\nT1 kick |X.X.| z:2');
  assert.equal(bad.ok, false);
  assert.ok(hasError(bad, /Unknown modifier prefix "z:"/), 'unknown modifier reported');

  const badCond = parseScore('# len 4\nT1 kick |X.X.| c:1=sometimes');
  assert.equal(badCond.ok, false);
  assert.ok(hasError(badCond, /Unknown trig condition/), 'bad trig condition reported');
}

// Missing bar delimiter, unknown lane target, out-of-range step.
{
  assert.equal(parseScore('# len 4\nT1 kick X.X.').ok, false);
  assert.equal(parseScore('# len 4\nT1 kick |X.X.|\nL T9.cutoff |. . 3 .|').ok, false);
  assert.equal(parseScore('# len 4\nT1 kick |X.X.| s:9').ok, false); // step 9 > len 4
}

// A parser that must not throw even on garbage input.
{
  for (const junk of ['', '   ', '#', '!!!', 'T', 'Lorem ipsum', null, undefined, 42]) {
    const result = parseScore(/** @type {any} */ (junk));
    assert.equal(typeof result.ok, 'boolean', `parseScore(${JSON.stringify(junk)}) returned a result object`);
  }
}

console.log(JSON.stringify({ ok: true, fixtures: Object.keys(fixtures).length }, null, 2));
