// CONFUstudio harness — Tool-call IR (Phase B2, CONFUSTUDIO_AI_BRIEF §1.2)
//
// The provider-agnostic contract the agent loop runs on. Per-provider adapters
// (Anthropic tool_use, OpenAI function calling, Ollama) translate at the EDGE
// only — the loop and every test run against this IR with a mock provider.
//
// A model turn is one of:
//   { type: 'tool_use', calls: ToolCall[], text?: string }  — wants tool calls
//   { type: 'text', text: string }                          — final answer, done
//
// This module is PURE (no DOM, no Web Audio, no Date/random) so the loop stays
// deterministic and unit-testable.

/** Error codes surfaced to the model in a tool result's `error.code`. */
export const ERROR_CODES = Object.freeze({
  VALIDATION: 'validation_error', // args failed the tool's JSON-Schema
  UNKNOWN_TOOL: 'unknown_tool', // no such tool in the registry
  STATION_DENIED: 'station_denied', // tool not allowed for this station
  NO_CHANGE: 'no_change', // command ran but changed nothing (bad target?)
  EXEC_ERROR: 'exec_error', // command threw
});

/** Turn kinds a provider may return. */
export const TURN = Object.freeze({ TOOL_USE: 'tool_use', TEXT: 'text' });

/**
 * @typedef {object} ToolCall
 * @property {string} callId - stable id assigned by the provider (echoed in the result)
 * @property {string} name - tool name (must exist in the registry)
 * @property {object} args - raw arguments (validated by the loop)
 */

/**
 * @typedef {object} ToolResult
 * @property {string} callId
 * @property {boolean} ok
 * @property {object} [data] - on success, e.g. { summary }
 * @property {{ code: string, message: string, hint?: string }} [error]
 */

/**
 * Build a tool result. `hint` is model-facing repair guidance.
 * @param {string} callId
 * @param {boolean} ok
 * @param {object|null} [data]
 * @param {{ code: string, message: string, hint?: string }|null} [error]
 * @returns {ToolResult}
 */
export function toolResult(callId, ok, data = null, error = null) {
  // Annotated so the optional fields below are part of the type. Without this
  // the literal narrows to { callId, ok } and the assignments are errors.
  /** @type {ToolResult} */
  const r = { callId, ok };
  if (data != null) r.data = data;
  if (error != null) r.error = error;
  return r;
}

/**
 * Build a tool error object.
 * @param {string} code - one of ERROR_CODES
 * @param {string} message
 * @param {string} [hint] - actionable, model-facing
 */
export function toolError(code, message, hint) {
  /** @type {{ code: string, message: string, hint?: string }} */
  const e = { code, message };
  if (hint) e.hint = hint;
  return e;
}

/**
 * Convenience turn constructors (used by adapters + the mock provider).
 *
 * @param {ToolCall[]} calls
 * @param {string} [text]
 */
export function toolUseTurn(calls, text) {
  return { type: TURN.TOOL_USE, calls, ...(text ? { text } : {}) };
}
/** @param {string} text */
export function textTurn(text) {
  return { type: TURN.TEXT, text };
}
