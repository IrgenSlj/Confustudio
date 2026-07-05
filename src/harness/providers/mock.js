// CONFUstudio harness — Mock provider (Phase B2)
//
// A deterministic provider for tests and offline development. The whole agent
// loop runs against this with NO API key, so PLAN/ACT/VERIFY/PRESENT, budgets,
// error-storms and repair cycles are all exercised deterministically.
//
// Two forms:
//   mockProvider([turn, turn, ...])   — return each scripted turn in order
//   mockProvider((ctx, i) => turn)    — compute a turn from loop context
//
// A turn is an IR turn (see ../ir.js): { type:'tool_use', calls:[...] } or
// { type:'text', text }. When the script runs out, it returns a final text turn
// so the loop always terminates.

import { textTurn } from '../ir.js';

/**
 * @param {Array<object> | ((ctx: object, turnIndex: number) => object)} script
 * @returns {{ next: (ctx: object) => Promise<object>, turnsTaken: () => number }}
 */
export function mockProvider(script) {
  let i = 0;
  const isFn = typeof script === 'function';
  return {
    async next(ctx) {
      const turn = isFn ? script(ctx, i) : script[i];
      i += 1;
      if (!turn) return textTurn('Done.');
      return turn;
    },
    turnsTaken() {
      return i;
    },
  };
}

/**
 * Helper: a scripted turn that calls one tool. Keeps test scripts terse.
 * @param {string} callId
 * @param {string} name
 * @param {object} args
 */
export function callTurn(callId, name, args) {
  return { type: 'tool_use', calls: [{ callId, name, args }] };
}
