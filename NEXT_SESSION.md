# CONFUstudio Next Session

**State:** browser trust boundaries complete; Phase 1 abuse controls next

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

Policies: [`docs/security/provider-egress.md`](./docs/security/provider-egress.md)
and [`docs/security/browser-boundaries.md`](./docs/security/browser-boundaries.md).

## Next Batch

`security/03-abuse-controls`, issue
[#13](https://github.com/IrgenSlj/Confustudio/issues/13).

Scope:

- Keep assistant routes default-off and define the authenticated session skeleton.
- Enforce strict allowed origins and CSRF protection on mutation routes.
- Add per-user rate limits, quotas, request/token/time budgets, and spending caps.
- Emit bounded, redacted security audit events without prompts, credentials, or project data.
- Cover anonymous access, origin/CSRF denial, rate/quota exhaustion, budgets, and audit redaction.
- Preserve the loopback development workflow without weakening the future public boundary.

Do not add Vite, project schema v4, reducer/history, UI redesign, audio changes,
or a production deployment. Those remain separate issues and gates.

## Release Block

Provider egress and browser boundaries are contained, but the current assistant
bridge still has no user authentication, CSRF/origin policy, per-user quotas,
rate limits, spending caps, or audit trail. Public assistant deployment remains
prohibited.
