# CONFUstudio Next Session

**State:** provider egress complete; Phase 1 browser boundaries next

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

Provider policy: [`docs/security/provider-egress.md`](./docs/security/provider-egress.md).

## Next Batch

`security/02-browser-boundaries`, issue
[#12](https://github.com/IrgenSlj/Confustudio/issues/12).

Scope:

- Inventory and replace stored-XSS `innerHTML` sinks for project/imported values.
- Add a strict Content Security Policy and remaining browser security headers.
- Define bounded runtime schemas for imported project/package structure.
- Reject oversized, deep, excess-collection, and dangerous-key imports before normalization.
- Add central command-envelope validation before command dispatch.
- Add hostile import, DOM execution, invalid-command, and CSP browser regressions.
- Surface import failure without destroying the current project.

Do not add authentication/rate limits, Vite, project schema v4, reducer/history,
UI redesign, or audio changes. Those remain separate issues and gates.

## Release Block

Provider egress is contained, but the current assistant bridge still has no user
authentication, CSRF/origin policy, per-user quotas, rate limits, spending caps,
or audit trail. Public assistant deployment remains prohibited.
