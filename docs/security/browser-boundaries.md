# Browser Trust-Boundary Policy

**Status:** implemented for the current v3 runtime

**Owning issue:** [#12](https://github.com/IrgenSlj/Confustudio/issues/12)

**Updated:** 2026-07-31

This policy covers persisted and imported data, browser rendering, command dispatch,
assistant-generated command plans, filenames, and browser response headers. It is
an interim v3 boundary. The schema v4 migration will replace these dependency-free
runtime validators with the planned typed package and Valibot schemas.

## Rendering Rules

- Imported and persisted strings are untrusted. Text-only output uses DOM
  `textContent`; template output uses the centralized `escapeHtml` helper.
- Dynamic CSS colors are allowlisted before interpolation. Numeric control values
  are reduced to finite numbers with explicit defaults.
- Exported project, stem, and MIDI names pass through `safeFilenameSegment`.
- Inline executable boot code is prohibited. `index.html` loads
  `src/shell-bootstrap.js` as a same-origin module.
- The hostile project fixture must stay visible as literal text and must not create
  `script`, event-handler, or attacker-controlled image nodes.

## Import Contract

All project, pattern, kit, MIDI-map, and local-storage JSON crosses
`src/security/runtime-validation.js` before normalization or mutation. Rejected
project imports leave the active state unchanged.

Current project/package ceilings:

| Resource                             |       Limit |
| ------------------------------------ | ----------: |
| File size                            |      64 MiB |
| Object depth                         |          32 |
| Values                               |   4,000,000 |
| Containers                           |     250,000 |
| Array length                         |   2,000,000 |
| Keys per object                      |       4,096 |
| String length                        |       1 MiB |
| Banks / patterns per bank            |      8 / 16 |
| Tracks per pattern / steps per track |      8 / 64 |
| Scenes / arranger sections           |     8 / 256 |
| Graph nodes / connections            | 512 / 2,048 |
| Portable assets                      |       1,028 |

Only JSON-compatible plain objects are accepted. Cycles, non-finite numbers, and
the keys `__proto__`, `prototype`, and `constructor` fail closed. More focused
pattern, kit, and MIDI-map imports use lower traversal budgets.

## Command Contract

`src/security/command-validation.js` is the single current-runtime command gate.
It applies before a batch begins, so a bad later command cannot leave earlier
commands applied. The gate enforces:

- a fixed command-type and field allowlist;
- writable setting and track-parameter allowlists;
- bounded bank, pattern, track, step, and scene indices;
- finite scalar, string, boolean, scene, arranger, graph, and step payloads;
- 64 commands per browser batch and 24 per assistant plan;
- project collection limits for replacement patterns and graphs.

Assistant plans that fail the same validator return
`ASSISTANT_COMMANDS_INVALID`; they are never sent to browser command execution.

## Browser Headers

Every static, API, SSE, error, and not-found response receives the same baseline:

- CSP with `default-src 'self'`, no objects, frames, or inline scripts;
- `frame-ancestors 'none'`, `X-Frame-Options: DENY`, and `nosniff`;
- same-origin COOP/COEP/CORP and origin-agent clustering;
- no-referrer and a restrictive permissions policy.

`style-src 'unsafe-inline'` remains temporarily necessary because the prototype
uses extensive inline style attributes. Scripts do not receive `unsafe-inline`.
Removing inline style debt belongs to the UI/toolchain migration, after which the
style policy must be tightened.

## Evidence

- `npm run test:boundaries`: import limits, dangerous keys, atomic command batches,
  hostile persisted rendering across seven views, and zero CSP violations.
- `npm run test:security`: provider egress plus invalid assistant-plan rejection.
- `npm run test:server`: exact response-header assertions.
- `npm test`: the complete compatibility gate.

## Residual Risk And Rollback

Public assistant use is still prohibited. Authentication, origin/CSRF policy,
rate limits, quotas, spending budgets, and audit events remain issue #13. Save and
quota error UX, dependency remediation, external manifest schemas, strict
TypeScript boundaries, and removal of remaining direct state mutation are later
work items.

Rollback is to disable imports and assistant writes, then revert the boundary
adapters. This change does not migrate or rewrite stored project data.
