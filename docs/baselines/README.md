# Phase 0 Baselines

The baseline report characterizes the pre-migration application. It is evidence
for prioritization and later before/after comparisons, not a performance contract.
Target budgets remain in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md).

## Capture

```bash
npm run baseline
npm run baseline -- --output=docs/baselines/phase-0-baseline.json
```

The harness starts a loopback server with the assistant proxy disabled, launches
headless Chromium at 1365x768, and records:

- Default state and project-package byte size.
- Eager bank, pattern, track, and step counts.
- State factory, command capture, direct command, and browser command timings.
- Cold navigation and clean reload wall time.
- DOM and visible interactive-control counts.
- Heuristic unnamed and undersized control counts.
- localStorage payload after clean boot and representative commands.
- Straight 120 BPM scheduled timestamp regularity and submission lead.
- Browser console errors.

The accessibility inventory is intentionally heuristic. It does not replace axe,
screen-reader, contrast, or keyboard testing. Scheduler metrics characterize when
events are submitted and timestamped; they do not measure acoustic output jitter.

Results vary by machine, browser, thermal state, and background load. Compare the
same environment, retain raw JSON, and investigate changes above 10 percent. Do
not fail CI against the checked-in timings.

## Reference Capture

[`phase-0-baseline.json`](./phase-0-baseline.json) was recorded on an Apple M1 Pro
from source commit `6e2d06a` before the state, command, UI, and audio migrations.
Its headline results are:

- Default state: 10,309,828 bytes.
- Default package: 10,646,002 bytes.
- Eager shape: 8 banks, 128 patterns, 1,024 tracks, 65,536 steps.
- Command-state capture p95: 121.35 ms.
- Public browser command p95: 215.67 ms.
- Visible interactive controls: 269; below 32 px: 260.
- Scheduler submission lead: 50-115.01 ms in the straight 120 BPM probe.

The Phase 2 goal is a sparse default project below 500 KB and ordinary edit p95
below 16 ms. Phase 4 owns formal accessibility and multi-browser baselines.
