// Phase B2 — Agent loop tests (deterministic, mock provider, no API key).
//
// Proves the IDLE→PLAN→ACT→VERIFY→PRESENT machine: real commands run on a
// BRANCH (head untouched), budgets + error-storm + station guardrails hold,
// and the VERIFY repair cycle fires.

import { strict as assert } from 'node:assert';

import { runAgent, diffTouched } from '../src/harness/loop.mjs';
import { mockProvider, callTurn } from '../src/harness/providers/mock.js';
import { textTurn } from '../src/harness/ir.js';
import { createAppState } from '../src/state.js';
import { captureCommandState } from '../src/command-bus.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── 1. Happy path: PLAN(text) → ACT(fill_track) → done → PRESENT ───────
{
  const state = createAppState();
  const baseSnapshot = clone(captureCommandState(state));
  const provider = mockProvider([
    textTurn('I will put a kick on every 4th step of track 1.'),
    callTurn('c1', 'fill_track', { trackIndex: 0, interval: 4 }),
    textTurn('Done — four-on-the-floor on T1.'),
  ]);

  const { disposition, proposal, trace } = await runAgent({
    provider,
    task: 'four on the floor on track 1',
    state,
  });

  ok(disposition === 'presented', `presents a proposal (got ${disposition})`);
  ok(trace.planNote && /4th step/.test(trace.planNote), 'plan note captured');
  ok(
    proposal.commands.length === 1 && proposal.commands[0].type === 'fill-track-steps',
    'the real command was executed',
  );
  ok(
    proposal.touched.some((t) => /^T1 steps/.test(t)),
    `touched reports T1 steps (${JSON.stringify(proposal.touched)})`,
  );
  ok(trace.toolCalls === 1, 'one tool call counted');
  ok(trace.failure === null, 'no failure');

  // BRANCHES, NOT MUTATIONS — base state is untouched.
  assert.deepEqual(captureCommandState(state), baseSnapshot);
  ok(true, 'base state unchanged (branch isolated)');
  // …but the branch changed.
  ok(diffTouched(state, proposal.branchState).length > 0, 'branch differs from base');
}

// ── 2. Skip-plan: first turn is a tool call (cheap-model path) ─────────
{
  const state = createAppState();
  const provider = mockProvider([callTurn('c1', 'set_transport', { bpm: 128 }), textTurn('Tempo set.')]);
  const { disposition, proposal } = await runAgent({ provider, task: 'set 128 bpm', state });
  ok(disposition === 'presented', 'skip-plan still presents');
  ok(
    proposal.touched.some((t) => /tempo .*128/.test(t)),
    'tempo change reflected in touched',
  );
}

// ── 3. Multi-tool across turns, results fed back ──────────────────────
{
  const state = createAppState();
  const provider = mockProvider([
    textTurn('Build a techno skeleton.'),
    callTurn('a', 'set_transport', { bpm: 132 }),
    callTurn('b', 'generate_euclid', { beats: 4, trackIndex: 1 }),
    callTurn('c', 'humanize_track', { trackIndex: 1, amount: 0.2 }),
    textTurn('Skeleton ready.'),
  ]);
  const { proposal, trace } = await runAgent({ provider, task: 'techno skeleton', state });
  ok(trace.toolCalls === 3, `three tool calls (got ${trace.toolCalls})`);
  ok(proposal.commands.length === 3, 'three commands executed on the branch');
}

// ── 4. Validation error → ok:false, no mutation, keeps going ──────────
{
  const state = createAppState();
  const baseSnapshot = clone(captureCommandState(state));
  const provider = mockProvider([
    callTurn('bad', 'set_transport', { bpm: 9999 }), // out of range
    textTurn('That failed.'),
  ]);
  const { disposition, trace } = await runAgent({ provider, task: 'go to 9999 bpm', state });
  const result = trace.turns.find((t) => t.kind === 'tool_use').results[0];
  ok(!result.ok && result.error.code === 'validation_error', 'invalid args rejected as validation_error');
  ok(result.error.hint, 'validation error carries a hint');
  ok(disposition === 'no_op', 'no successful mutation → no_op');
  assert.deepEqual(captureCommandState(state), baseSnapshot);
  ok(true, 'invalid call did not mutate base');
}

// ── 5. Station guardrail: co-performer cannot use a session-artist tool ─
{
  const state = createAppState();
  const provider = mockProvider([callTurn('x', 'fill_track', { trackIndex: 0, interval: 4 }), textTurn('.')]);
  const { trace } = await runAgent({ provider, task: 'fill it', state, station: 'co-performer' });
  const res = trace.turns.find((t) => t.kind === 'tool_use').results[0];
  ok(!res.ok && res.error.code === 'station_denied', 'session-artist tool denied on co-performer station');
}

// ── 6. Error storm: >3 consecutive failures → abort ───────────────────
{
  const state = createAppState();
  const provider = mockProvider([
    {
      type: 'tool_use',
      calls: [
        { callId: '1', name: 'nope_a', args: {} },
        { callId: '2', name: 'nope_b', args: {} },
        { callId: '3', name: 'nope_c', args: {} },
        { callId: '4', name: 'nope_d', args: {} },
      ],
    },
    textTurn('should not reach here'),
  ]);
  const { disposition, trace } = await runAgent({ provider, task: 'chaos', state });
  ok(trace.failure === 'tool_error_storm', 'error storm detected');
  ok(disposition === 'aborted', 'aborts with no successful mutation');
}

// ── 7. Budget: maxToolCalls caps execution ────────────────────────────
{
  const state = createAppState();
  const provider = mockProvider([
    {
      type: 'tool_use',
      calls: [
        { callId: '1', name: 'set_transport', args: { bpm: 120 } },
        { callId: '2', name: 'set_pattern_length', args: { length: 32 } },
        { callId: '3', name: 'set_transport', args: { bpm: 121 } },
      ],
    },
    textTurn('.'),
  ]);
  const { trace } = await runAgent({ provider, task: 'many', state, budgets: { maxToolCalls: 2 } });
  ok(trace.toolCalls === 2, `tool-call budget enforced (got ${trace.toolCalls})`);
  ok(trace.failure === 'tool_budget_exhausted', 'budget exhaustion recorded');
}

// ── 8. VERIFY repair cycle: warn finding triggers one repair, then clean ─
{
  const state = createAppState();
  let verifyCalls = 0;
  const verify = () => {
    verifyCalls += 1;
    return verifyCalls === 1
      ? { findings: [{ severity: 'warn', rule: 'level-staging', message: 'kick too quiet' }] }
      : { findings: [] };
  };
  const provider = mockProvider([
    textTurn('Add a kick.'),
    callTurn('c1', 'fill_track', { trackIndex: 0, interval: 4 }),
    textTurn('Placed.'),
    callTurn('c2', 'set_track_param', { trackIndex: 0, param: 'volume', value: 0.9 }), // the repair
    textTurn('Louder now.'),
  ]);
  const { proposal, trace } = await runAgent({ provider, task: 'kick', state, verify });
  ok(trace.repairs === 1, `one repair cycle ran (got ${trace.repairs})`);
  ok(verifyCalls === 2, 'verify ran before and after the repair');
  ok(trace.findings.length === 0, 'findings cleared after repair');
  ok(proposal.commands.length === 2, 'repair command included in the branch');
}

// ── 9. no_op: model answers with text, no tools ───────────────────────
{
  const state = createAppState();
  const provider = mockProvider([textTurn('Your track already sounds great — nothing to change.')]);
  const { disposition, proposal } = await runAgent({ provider, task: 'improve it', state });
  ok(disposition === 'no_op', 'pure-text response is a no_op');
  ok(proposal === null || proposal.commands.length === 0, 'no commands on a no_op');
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));
