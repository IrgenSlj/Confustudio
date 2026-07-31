# Phase 0 Gate Evidence

**Status:** passed

**Date:** 2026-07-31

**Owning issue:** [#10](https://github.com/IrgenSlj/Confustudio/issues/10)

Gate P0 in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) requires a
committed baseline, scrubbed fixtures, a foundation ADR, an explicit public AI
freeze, and owned work items with dependencies and rollback notes.

## Evidence

- Foundation decisions and rejected alternatives:
  [`../adr/0001-foundation-stack.md`](../adr/0001-foundation-stack.md).
- Machine-readable reference capture:
  [`phase-0-baseline.json`](./phase-0-baseline.json).
- Reproducible capture command and metric definitions: [`README.md`](./README.md).
- Scrubbed project fixtures and outcome manifest: `tests/fixtures/projects/`.
- Fixture and secret-pattern check: `tests/baseline-fixtures.mjs`.
- Default-off assistant POST gate: `CONFUSTUDIO_ENABLE_ASSISTANT_PROXY` in
  `server.mjs`.
- Outbound-request/credential containment regression:
  `tests/assistant-proxy-gate.mjs`.
- Public provider metadata excludes upstream base URLs.
- Planned work items are assigned to the maintainer and include dependencies,
  acceptance, and rollback:
  [#10](https://github.com/IrgenSlj/Confustudio/issues/10) through
  [#34](https://github.com/IrgenSlj/Confustudio/issues/34).

## Reference Results

- Default state: 10,309,828 bytes.
- Default project package: 10,646,002 bytes.
- Eager model: 8 banks, 128 patterns, 1,024 tracks, 65,536 steps.
- Command-state capture p95: 121.35 ms.
- Public browser command p95: 215.67 ms.
- Visible interactive controls: 269; below 32 px: 260.
- Straight 120 BPM scheduled timestamp jitter in the probe: 0 ms.
- Scheduler submission lead range: 50-115.01 ms.
- Browser console errors during capture: 0.

These values characterize the pre-migration implementation and are not accepted
targets. Phase 2 and Phase 4 budgets remain defined in the development plan.

## Validation

- `npm run format`
- `npm run lint`
- `npm run test:types`
- `npm run test:baseline`
- `npm run test:security`
- `npm run test:server`
- Full `npm test` before merge/push

## Rollback

Revert the Phase 0 commit to remove the harness and fixtures. Keep the assistant
proxy disabled if any part of the batch is reverted. No project schema or stored
user data changes are introduced by this gate.
