# CONFUstudio Next Session

**State:** Gate P1 signed off. Phase 2's core is built and **entirely dormant** —
two decisions are blocking before anything flips over.

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

## Gate P1 — PASSED

Signed off 2026-08-02 (`docs/security/phase-1-review.md`), findings in
`docs/security/phase-1-findings.md`. F-1 (High) was fixed before signoff; F-4,
F-5 and F-6 are accepted residual risk. The signoff records its own limits: the
supporting pass was agent-assisted and shares authorship with the change set, so
it is the owner accepting risk on a documented basis, **not** an arms-length
review. A genuine external review remains a Gate P6 prerequisite.

## Phase 2 — built, and deliberately not live

| Item                         | Issue                                                    | State                                |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------ |
| `core/01-vite-typescript`    | [#14](https://github.com/IrgenSlj/Confustudio/issues/14) | done — Vite build, strict TS ratchet |
| `core/02-project-v4`         | [#15](https://github.com/IrgenSlj/Confustudio/issues/15) | done — schema + migrations, flag off |
| `core/03-command-reducer`    | [#16](https://github.com/IrgenSlj/Confustudio/issues/16) | done — envelopes, exact inverses     |
| `core/04-history`            | [#17](https://github.com/IrgenSlj/Confustudio/issues/17) | done — baseline + bounded undo       |
| `core/05-proposals`          | [#18](https://github.com/IrgenSlj/Confustudio/issues/18) | done — materialized patches          |
| `core/06-persistence`        | [#19](https://github.com/IrgenSlj/Confustudio/issues/19) | done — IndexedDB records, flag off   |
| `core/07-mutation-migration` | [#20](https://github.com/IrgenSlj/Confustudio/issues/20) | **blocked** — see below              |

**The app still runs entirely on the v3 path.** Every item above is behind a flag
that is off, and each touched only `package.json` outside its own new files. That
is intentional, and it also means none of it is delivering value yet.

## Two decisions that block Gate P2

Neither is a coding problem. Both need the owner.

### 1. The default project blocks the serialization budget

`npm run budgets`:

|                                     |     measured |     budget |               |
| ----------------------------------- | -----------: | ---------: | ------------- |
| v3 default project                  |    10,060 KB |     500 KB | 20.1x over    |
| **v4 migrated from the v3 default** | **1,552 KB** | **500 KB** | **3.1x over** |
| v4 with an unseeded default         |       110 KB |     500 KB | within        |

v4 is a large improvement that still **fails** the budget. The cause is
`createStep()` seeding a decorative pattern across all 65,536 steps, so ~19.5k
are non-default and get stored. An unseeded default lands at 110 KB.

This changes what a new user sees on first launch — a pre-populated pattern
versus an empty one. **Product decision.** Gate P2 cannot pass on serialization
until it is made.

Latency budgets pass: edit p95 13.1 ms (budget 16), undo/redo ~3 ms (budget 32).

### 2. Flip ordering for `core/07`

`core/07` is the first item that cannot hide behind a dormant flag: it routes
live UI writes through the reducer, so returning users' projects meet the new
code for real.

`npm run test:mutation-ratchet` measures the scope: **131 direct persistent
mutations across 18 files**, worst in `src/pages/`. The ratchet allows that count
to fall but never rise, so the work can proceed workflow by workflow.

Suggested order, not yet agreed: record store first (data at rest, reversible via
the persisted pre-migration backup), then mutation routing.

## Also open

- [#40](https://github.com/IrgenSlj/Confustudio/issues/40) widen the strict
  TypeScript ratchet, module by module. Safe, ongoing, blocks nothing.

## Release block

Unchanged. Public assistant deployment remains prohibited until the separate
hosted API and Gate P6 are complete. Passing P1 did not authorize it.
