# CONFUstudio Next Session

**State:** Phase 1 evidence re-run and reviewed; only the independent Gate P1
signoff remains

**Branch:** `main`

**Updated:** 2026-08-02

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

## Gate P1 Review Pass — done 2026-08-02

Evidence re-run against `6e5ea29`: `npm test` exit 0, `npm audit
--audit-level=high` 0 vulnerabilities, `prettier --check` clean, 0 attacker
egress requests, 0 CSP violations, production startup fails closed.

Findings recorded in
[`docs/security/phase-1-findings.md`](./docs/security/phase-1-findings.md):

- **F-1 (High)** the legacy v2 restore path re-imported data the boundary had
  just rejected, breaking the app on every load — fixed in
  [#35](https://github.com/IrgenSlj/Confustudio/pull/35).
- **F-2 (Medium)** hostile-state coverage had no legacy-key case — fixed in #35.
- **F-3 (Low)** unschema'd `keyboardVelocity` reached an HTML attribute and the
  audio path — fixed in
  [#36](https://github.com/IrgenSlj/Confustudio/pull/36).
- **F-4 / F-5 / F-6 (Low/Informational)** — accepted residual risk, #36.

No open critical/high finding remains from that pass.

## Next Batch

**Gate P1 signoff**, issue
[#37](https://github.com/IrgenSlj/Confustudio/issues/37) — needs a human.

The review packet
[`docs/security/phase-1-review.md`](./docs/security/phase-1-review.md) states the
implementer must not fill in the independent-review result, so the `Signoff`
block is deliberately blank. The automated pass above **does not substitute for
it**: it shares authorship lineage with the change set under review. An
independent reviewer must work the threat checklist and record the result, and
may reject any accepted residual item as too severe for P1.

Keep public assistant deployment disabled; do not interpret the interim shared
access credential as production user authentication.

After signoff: `core/01-vite-typescript`, issue
[#14](https://github.com/IrgenSlj/Confustudio/issues/14).

Do not begin Vite, project schema v4, reducer/history, UI redesign, audio changes,
or a production deployment until Gate P1 is signed off.

## Release Block

The current bridge has an interim single-process control skeleton, not production
user identity, durable quota storage, distributed rate limiting, or operational
audit infrastructure. Public assistant deployment remains prohibited until the
separate hosted API and Gate P6 are complete.
