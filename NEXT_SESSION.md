# CONFUstudio Next Session

**State:** waiting for maintainer approval

**Branch:** `main`

**Updated:** 2026-07-31

The repository is in a documentation-only planning state. Do not begin feature
or refactor work until the maintainer explicitly approves development.

## Read First

1. [`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md) owns sequencing,
   architecture migration, acceptance gates, and the PR list.
2. [`docs/ROADMAP.md`](./docs/ROADMAP.md) owns live status.
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) explains current risks and
   target boundaries.
4. [`SECURITY.md`](./SECURITY.md) defines the release-blocking security policy.

Briefs remain domain references, not authorization to jump ahead of the plan.

## Next Approved Batch

When approval arrives, start only PR 1: `plan/00-baselines`.

Deliverables:

- Create issues for the 25-PR sequence and record dependencies.
- Add an ADR covering Vite, strict TypeScript, Lit, Valibot, Dexie, Fastify,
  AudioWorklet, and the PWA-first packaging decision.
- Add reproducible baselines for default project size, ordinary command p50/p95,
  load/reload, scheduling jitter, DOM/control counts, and accessibility.
- Capture scrubbed v1-v3 project fixtures plus corrupt, oversized, and hostile imports.
- Add a default-off public assistant kill switch without otherwise changing behavior.
- Record rollback instructions and obtain Gate P0 evidence.

Do not bundle security fixes, state migration, UI work, audio work, dependency
upgrades, or feature development into this first PR. They have separate review
and rollback boundaries.

## Known Release Blockers

- Hosted-provider requests accept a client-controlled destination while attaching
  server credentials.
- Local-provider forwarding is an SSRF boundary when exposed publicly.
- Imported names can reach unsafe `innerHTML` sinks.
- Commands and imported projects lack one strict runtime validation boundary.
- Undo/replay and proposal merge can produce a state different from user intent.
- The default project model is oversized and persistence/history are not bounded.
- Swing, bar math, MIDI timestamps, and competing audio paths are not authoritative.

These are tracked in Phases 1-3. Public AI deployment remains prohibited until
the Phase 6 API gate passes.

## Working Rules

- Keep every pull request focused and independently reversible.
- Add a failing regression test before each bug fix.
- Preserve user data and provide migration recovery before changing stored formats.
- Measure performance before and after foundation changes.
- Verify audio changes with offline fixtures and a real browser.
- Verify UI changes with keyboard use, screenshots, axe, and supported widths.
- Update the roadmap, architecture, manual, and migration notes in the same PR
  when their contracts change.

## Explicitly Parked

Do not start the Director rail, monetization, hosted deployment, more module
types, Ableton Link, MCP serve mode, Electron/Tauri packaging, or Rust/WASM work.
Their prerequisites and reopening gates are in the development plan.
