# CONFUstudio Next Session

**State:** ordered security batches complete; Gate P1 closure next

**Branch:** `main`

**Updated:** 2026-07-31

## Completed Batches

- `plan/00-baselines`, [#10](https://github.com/IrgenSlj/Confustudio/issues/10):
  foundation ADR, machine-readable baseline, scrubbed fixtures, work-item issues,
  and default-off assistant execution.
- `security/01-provider-egress`,
  [#11](https://github.com/IrgenSlj/Confustudio/issues/11): server-owned provider
  destinations/credentials, public HTTPS validation, private-address denial,
  loopback-only local providers, manual redirects, 1 MiB response limit,
  normalized output, and fake-upstream integration coverage.
- `security/02-browser-boundaries`,
  [#12](https://github.com/IrgenSlj/Confustudio/issues/12): bounded project/import
  schemas, atomic command allowlists, assistant-plan validation, safe persisted
  rendering, filename normalization, CSP/browser headers, and hostile Chromium
  regressions.
- `security/03-abuse-controls`,
  [#13](https://github.com/IrgenSlj/Confustudio/issues/13): loopback/non-loopback
  session policy, strict origins and CSRF, rate/quota/token/cost/time budgets,
  redacted audit events, browser session bootstrap, and abuse regressions.

Policies: [`docs/security/provider-egress.md`](./docs/security/provider-egress.md),
[`docs/security/browser-boundaries.md`](./docs/security/browser-boundaries.md),
and [`docs/security/assistant-abuse-controls.md`](./docs/security/assistant-abuse-controls.md).

## Next Batch

Gate P1 closure before `core/01-vite-typescript`, issue
[#14](https://github.com/IrgenSlj/Confustudio/issues/14).

Scope:

- Re-run the complete Phase 1 security, boundary, server, and browser evidence.
- Obtain independent review of provider egress, imports/rendering, commands, session,
  origin/CSRF, limits, and audit redaction.
- Keep public assistant deployment disabled; do not interpret the interim shared
  access credential as production user authentication.

Do not begin Vite, project schema v4, reducer/history, UI redesign, audio changes,
or a production deployment until Gate P1 is signed off.

## Release Block

The current bridge has an interim single-process control skeleton, not production
user identity, durable quota storage, distributed rate limiting, or operational
audit infrastructure. Public assistant deployment remains prohibited until the
separate hosted API and Gate P6 are complete.
