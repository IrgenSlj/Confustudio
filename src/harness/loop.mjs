// CONFUstudio harness — Agent loop (Phase B2, CONFUSTUDIO_AI_BRIEF §1.1)
//
//   IDLE → PLAN → ACT → VERIFY → (ACT if findings) → PRESENT → IDLE
//
// Provider-agnostic (runs on the IR in ./ir.js; a mock provider drives the
// tests). Enforces the thesis: BRANCHES, NOT MUTATIONS — the agent works on a
// clone of state; head is never touched. Every mutating call goes through the
// B1 tool registry → the real command bus (NO private path). Budgets are
// enforced at every transition; an error storm aborts to a partial proposal.
//
// VERIFY is a pluggable hook. It is a no-op here; Phase C fills it with
// render → measure → lint so the agent can hear before it presents.
//
// Pure + deterministic (no DOM, no Web Audio, no Date/random) → fully testable.

import { compileToCommand, getTool, listTools, toToolSchemas } from './tools/registry.js';
import { executeStudioCommand, captureCommandState } from '../command-bus.js';
import { ERROR_CODES, TURN, toolResult, toolError } from './ir.js';

const DEFAULT_BUDGETS = Object.freeze({ maxTurns: 6, maxToolCalls: 24 });
const SEVERITY = Object.freeze({ info: 0, warn: 1, error: 2 });

function defaultClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Default VERIFY: nothing to say (Phase C replaces this). */
function noopVerify() {
  return { findings: [] };
}

function buildSystemPrompt(station, tools) {
  const names = tools.map((t) => t.name).join(', ');
  return [
    `You are the CONFUstudio co-producer, operating the "${station}" station.`,
    'You work only through the provided tools — they edit the studio the same way a click does.',
    'Plan briefly, then call tools to make the change. Keep every edit musically intentional.',
    `Available tools: ${names}.`,
  ].join('\n');
}

/**
 * Run one agent request end to end.
 *
 * @param {object} opts
 * @param {{ next: (ctx: object) => Promise<object> }} opts.provider — IR provider
 * @param {string} opts.task — the user's request
 * @param {object} opts.state — the base app state (NOT mutated; a clone is edited)
 * @param {string} [opts.station] — 'session-artist' | 'studio-master' | 'co-performer'
 * @param {{ maxTurns?: number, maxToolCalls?: number }} [opts.budgets]
 * @param {(branch: object, base: object) => { findings: Array<{severity:string,rule?:string,message:string}> }} [opts.verify]
 * @param {number} [opts.maxRepairCycles]
 * @param {(o: object) => object} [opts.clone]
 * @returns {Promise<{ disposition: string, proposal: object|null, trace: object }>}
 */
export async function runAgent(opts) {
  const {
    provider,
    task,
    state,
    station = 'session-artist',
    budgets = {},
    verify = noopVerify,
    maxRepairCycles = 1,
    clone = defaultClone,
  } = opts || {};

  if (!provider || typeof provider.next !== 'function') throw new TypeError('provider.next is required');
  if (!state || typeof state !== 'object') throw new TypeError('state is required');

  const { maxTurns, maxToolCalls } = { ...DEFAULT_BUDGETS, ...budgets };
  const base = state;
  const branch = clone(state); // BRANCH — head is never touched
  const stationTools = listTools({ station });
  const system = buildSystemPrompt(station, stationTools);
  const toolSchemas = toToolSchemas({ station });

  const messages = [{ role: 'user', content: String(task || '') }];
  const commands = []; // executed commands, for merge/replay (B3)
  const trace = {
    task: String(task || ''),
    station,
    turns: [],
    toolCalls: 0,
    budgets: { maxTurns, maxToolCalls },
    findings: [],
    repairs: 0,
    failure: null,
    planNote: null,
  };
  let consecutiveErrors = 0;

  // ── Execute a single tool call against the branch ──────────────────────
  function executeCall(call) {
    const { callId, name, args } = call || {};
    const tool = getTool(name);
    if (!tool) {
      return toolResult(callId, false, null, toolError(ERROR_CODES.UNKNOWN_TOOL, `No tool named "${name}".`));
    }
    if (!tool.stations.includes(station)) {
      return toolResult(
        callId,
        false,
        null,
        toolError(
          ERROR_CODES.STATION_DENIED,
          `Tool "${name}" is not allowed for the ${station} station.`,
          `This station can use: ${stationTools.map((t) => t.name).join(', ')}.`,
        ),
      );
    }
    const compiled = compileToCommand(name, args);
    if (!compiled.ok) {
      return toolResult(
        callId,
        false,
        null,
        toolError(
          ERROR_CODES.VALIDATION,
          `Invalid arguments for ${name}: ${compiled.errors.join('; ')}`,
          'Adjust the arguments to satisfy the tool schema.',
        ),
      );
    }
    let result;
    try {
      result = executeStudioCommand(branch, compiled.command);
    } catch (err) {
      return toolResult(callId, false, null, toolError(ERROR_CODES.EXEC_ERROR, String((err && err.message) || err)));
    }
    if (!result.changed) {
      return toolResult(
        callId,
        false,
        null,
        toolError(
          ERROR_CODES.NO_CHANGE,
          result.summary || 'No change.',
          'The target may not exist — check the track/step/pattern indices.',
        ),
      );
    }
    return toolResult(callId, true, { summary: result.summary, command: compiled.command });
  }

  // ── Process one tool_use turn: execute its calls, update trace/messages ──
  // Returns 'ok' | 'budget' | 'storm'
  function processToolTurn(turn, phase) {
    const calls = Array.isArray(turn.calls) ? turn.calls : [];
    messages.push({ role: 'assistant', content: turn.text || '', toolCalls: calls });
    const results = [];
    for (const call of calls) {
      if (trace.toolCalls >= maxToolCalls) {
        trace.failure = 'tool_budget_exhausted';
        break;
      }
      trace.toolCalls += 1;
      const res = executeCall(call);
      results.push(res);
      if (res.ok) {
        consecutiveErrors = 0;
        if (res.data && res.data.command) commands.push(res.data.command);
      } else {
        consecutiveErrors += 1;
      }
    }
    messages.push({ role: 'tool', results });
    trace.turns.push({ phase, kind: 'tool_use', text: turn.text || '', calls, results });
    if (consecutiveErrors > 3) {
      trace.failure = 'tool_error_storm';
      return 'storm';
    }
    if (trace.failure === 'tool_budget_exhausted') return 'budget';
    return 'ok';
  }

  // ── ACT: loop provider turns until a text turn (done) / budget / storm ──
  async function act(phase) {
    while (true) {
      if (trace.turns.length >= maxTurns) {
        trace.failure = trace.failure || 'turn_budget_exhausted';
        return 'budget';
      }
      const turn = await provider.next({ system, messages, tools: toolSchemas, phase });
      if (!turn || turn.type === TURN.TEXT) {
        trace.turns.push({ phase, kind: 'text', text: (turn && turn.text) || '' });
        return 'done';
      }
      const signal = processToolTurn(turn, phase);
      if (signal !== 'ok') return signal;
    }
  }

  // ── PLAN: one turn. Text → plan note; tool_use → model skipped planning. ──
  const planTurn = await provider.next({ system, messages, tools: toolSchemas, phase: 'plan' });
  if (planTurn && planTurn.type === TURN.TOOL_USE) {
    const signal = processToolTurn(planTurn, 'act');
    if (signal === 'ok') await act('act');
  } else {
    trace.planNote = (planTurn && planTurn.text) || null;
    trace.turns.push({ phase: 'plan', kind: 'text', text: trace.planNote });
    await act('act');
  }

  // ── VERIFY: only meaningful after a mutation. One repair cycle on warn+. ──
  if (commands.length > 0) {
    let report = verify(branch, base);
    trace.findings = report.findings || [];
    const worst = maxSeverity(trace.findings);
    if (worst >= SEVERITY.warn && trace.repairs < maxRepairCycles && !trace.failure) {
      trace.repairs += 1;
      messages.push({ role: 'tool', results: [], verify: trace.findings });
      await act('repair');
      report = verify(branch, base);
      trace.findings = report.findings || [];
    }
  }

  // ── PRESENT: a proposal + the trace ──────────────────────────────────
  const touched = diffTouched(base, branch);
  const disposition = commands.length === 0 ? (trace.failure ? 'aborted' : 'no_op') : 'presented';

  const proposal =
    disposition === 'aborted'
      ? null
      : {
          intent: trace.planNote || String(task || ''),
          station,
          branchState: branch,
          commands,
          touched,
          perception: trace.findings.length ? { findings: trace.findings } : null,
          failure: trace.failure,
        };

  return { disposition, proposal, trace };
}

function maxSeverity(findings) {
  return (findings || []).reduce((m, f) => Math.max(m, SEVERITY[f && f.severity] ?? 0), -1);
}

/**
 * A pragmatic diff between two state snapshots → human-readable touched targets.
 * Covers transport, project meta, and per-track active-step counts on the
 * active pattern. Enough for a useful proposal card; richer diffing is B4.
 */
export function diffTouched(base, branch) {
  const a = captureCommandState(base);
  const b = captureCommandState(branch);
  const touched = [];
  if (a.bpm !== b.bpm) touched.push(`tempo ${a.bpm}→${b.bpm} BPM`);
  if (a.swing !== b.swing) touched.push(`swing ${fmt(a.swing)}→${fmt(b.swing)}`);
  if (a.patternLength !== b.patternLength) touched.push(`pattern length ${a.patternLength}→${b.patternLength}`);
  if (a.project?.name !== b.project?.name) touched.push(`project name → "${b.project?.name}"`);

  const pa = a.project?.banks?.[a.activeBank]?.patterns?.[a.activePattern];
  const pb = b.project?.banks?.[b.activeBank]?.patterns?.[b.activePattern];
  const ta = pa?.kit?.tracks || [];
  const tb = pb?.kit?.tracks || [];
  for (let i = 0; i < tb.length; i++) {
    // Compare full step content, not just the active count — the agent often
    // rearranges steps (same count) or changes velocity/note/micro-timing.
    if (stepSig(ta[i]) !== stepSig(tb[i])) {
      const before = countActive(ta[i]);
      const after = countActive(tb[i]);
      touched.push(before === after ? `T${i + 1} steps reworked (${after})` : `T${i + 1} steps ${before}→${after}`);
    }
  }
  return touched;
}

function stepSig(track) {
  return track && Array.isArray(track.steps) ? JSON.stringify(track.steps) : '';
}

function countActive(track) {
  if (!track || !Array.isArray(track.steps)) return 0;
  return track.steps.reduce((n, s) => n + (s && s.active ? 1 : 0), 0);
}

function fmt(n) {
  return typeof n === 'number' ? Math.round(n * 100) / 100 : n;
}
