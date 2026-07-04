// Phase B1 — Tool Registry tests.
//
// The headline guarantee: NO PRIVATE PATH. Every tool the agent can call
// compiles to a command object that the REAL command bus (executeStudioCommand)
// accepts and acts on. If a tool ever drifts from the bus, this test fails.

import { strict as assert } from 'node:assert';

import { validate } from '../src/harness/tools/schema.js';
import {
  TOOLS,
  STATIONS,
  listTools,
  compileToCommand,
  toAnthropicTools,
  toOpenAITools,
  buildManualToolSurface,
} from '../src/harness/tools/registry.js';
import { createAppState } from '../src/state.js';
import { executeStudioCommand } from '../src/command-bus.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};

// ── 1. Schema validator ───────────────────────────────────────────────
{
  const s = {
    type: 'object',
    properties: {
      n: { type: 'integer', minimum: 0, maximum: 10 },
      s: { type: 'string', enum: ['a', 'b'] },
      f: { type: 'boolean' },
    },
    required: ['n'],
    additionalProperties: false,
  };
  ok(validate(s, { n: 5, s: 'a' }).ok, 'valid object passes');
  ok(!validate(s, { s: 'a' }).ok, 'missing required fails');
  ok(!validate(s, { n: 99 }).ok, 'above maximum fails');
  ok(!validate(s, { n: -1 }).ok, 'below minimum fails');
  ok(!validate(s, { n: 1, s: 'z' }).ok, 'enum violation fails');
  ok(!validate(s, { n: 1, extra: 1 }).ok, 'additionalProperties:false rejects extras');
  ok(!validate(s, { n: 1.5 }).ok, 'non-integer fails integer type');

  // Coercion (LLMs stringify)
  const coerced = validate(s, { n: '7', f: 'true' });
  ok(coerced.ok, 'stringified scalars coerce');
  ok(coerced.value.n === 7 && coerced.value.f === true, 'coercion produces real types');
  ok(!validate(s, { n: 'not-a-number' }).ok, 'non-numeric string still fails');
  ok(validate({ type: 'number', minimum: 0 }, 3).errors.length === 0, 'bare number schema ok');
}

// ── 2. Every descriptor is well-formed ────────────────────────────────
{
  const names = new Set();
  const validStations = new Set(Object.values(STATIONS));
  for (const t of TOOLS) {
    ok(typeof t.name === 'string' && /^[a-z][a-z0-9_]*$/.test(t.name), `tool name is snake_case: ${t.name}`);
    ok(!names.has(t.name), `tool name is unique: ${t.name}`);
    names.add(t.name);
    ok(typeof t.summary === 'string' && t.summary.length > 0, `${t.name} has a summary`);
    ok(t.parameters && t.parameters.type === 'object', `${t.name} parameters is an object schema`);
    ok(typeof t.build === 'function', `${t.name} has a build()`);
    ok(t.example && typeof t.example === 'object', `${t.name} has an example`);
    ok(Array.isArray(t.stations) && t.stations.length > 0, `${t.name} declares stations`);
    ok(
      t.stations.every((s) => validStations.has(s)),
      `${t.name} stations are valid`,
    );
    ok(typeof t.mutating === 'boolean', `${t.name} declares mutating`);
    // The example must satisfy the tool's own schema.
    ok(validate(t.parameters, t.example).ok, `${t.name} example validates against its schema`);
  }
  ok(TOOLS.length >= 15, `registry exposes a meaningful surface (${TOOLS.length} tools)`);
}

// ── 3. NO PRIVATE PATH: every tool drives the real command bus ────────
{
  for (const t of TOOLS) {
    const compiled = compileToCommand(t.name, t.example);
    ok(compiled.ok, `${t.name}: example compiles (${JSON.stringify(compiled.errors || [])})`);

    const state = createAppState();
    const result = executeStudioCommand(state, compiled.command);
    ok(
      !result.summary.startsWith('Unknown command type'),
      `${t.name} → "${compiled.command.type}" is a REAL command type (got: ${result.summary})`,
    );
    if (t.mutating) {
      ok(result.changed === true, `${t.name} actually changes state (summary: ${result.summary})`);
    }
  }
}

// ── 4. Validation failures surface as errors, not crashes ─────────────
{
  const bad = compileToCommand('set_transport', { bpm: 9999 });
  ok(!bad.ok && bad.errors.length > 0, 'out-of-range bpm is rejected with errors');
  const missing = compileToCommand('set_step', { trackIndex: 0 });
  ok(!missing.ok, 'missing required stepIndex is rejected');
  const unknown = compileToCommand('no_such_tool', {});
  ok(!unknown.ok && /Unknown tool/.test(unknown.errors[0]), 'unknown tool is rejected');
}

// ── 5. Tool-layer guardrail: set_track_param clamps to safe range ─────
{
  const compiled = compileToCommand('set_track_param', { trackIndex: 0, param: 'cutoff', value: 999999 });
  ok(compiled.ok, 'set_track_param compiles');
  ok(compiled.command.value === 20000, `cutoff clamped to safe max (got ${compiled.command.value})`);
  const low = compileToCommand('set_track_param', { trackIndex: 0, param: 'pan', value: -5 });
  ok(low.command.value === -1, 'pan clamped to -1');
  const bogusParam = compileToCommand('set_track_param', { trackIndex: 0, param: 'evilParam', value: 1 });
  ok(!bogusParam.ok, 'unknown track param is rejected by the enum');
}

// ── 6. Station filtering + provider adapters ──────────────────────────
{
  const live = listTools({ station: STATIONS.CO_PERFORMER });
  ok(live.length > 0 && live.every((t) => t.stations.includes(STATIONS.CO_PERFORMER)), 'station filter works');
  ok(live.length < TOOLS.length, 'co-performer sees a restricted subset');

  const readOnly = listTools({ mutating: false });
  const mutating = listTools({ mutating: true });
  ok(mutating.length > 0, 'there are mutating tools');
  ok(readOnly.length + mutating.length === TOOLS.length, 'mutating filter partitions the set');

  const anthropic = toAnthropicTools();
  ok(anthropic.length === TOOLS.length && anthropic[0].input_schema, 'anthropic tools have input_schema');
  const openai = toOpenAITools();
  ok(
    openai.length === TOOLS.length && openai[0].type === 'function' && openai[0].function.parameters,
    'openai tools have function.parameters',
  );

  const manual = buildManualToolSurface();
  ok(manual.length === TOOLS.length && manual[0].name && manual[0].parameters, 'manual tool surface generates');
}

console.log(JSON.stringify({ ok: true, tools: TOOLS.length, checks }, null, 2));
