# CONFUstudio Roadmap

**Status:** Phase 0 complete; Phase 1 security work is next

**Updated:** 2026-07-31

This is the live status tracker for the canonical
[`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md). That plan owns ordering,
deliverables, acceptance gates, and the 25-PR implementation sequence. Phase
gates are blocking.

Legend: `[x]` complete, `[~]` in progress or partial, `[ ]` not started,
`[!]` release blocker.

## Current Position

- [x] Repository, runtime, security, performance, architecture, dependency, and
      product review completed.
- [x] Product direction and stack migration documented.
- [x] Existing briefs and guides reconciled with the new authority hierarchy.
- [x] Maintainer approval to begin development.
- [!] Public hosted-provider deployment is blocked by Phase 1 security work.

The next implementation batch is `security/02-browser-boundaries`, tracked in
[#12](https://github.com/IrgenSlj/Confustudio/issues/12).

## Phase 0: Baselines and Release Freeze

- [x] Create tracking issues and dependencies for PRs 1-25 (#10-#34).
- [x] Add architecture decision record for Vite, strict TypeScript, Lit,
      Valibot, Dexie, and the API split.
- [x] Record project-size, command-latency, load, scheduler-jitter, and
      accessibility baselines.
- [x] Commit v1-v3 migration, corrupt-state, oversized-state, and hostile fixtures.
- [x] Add the public AI kill switch and document rollback.
- [x] Pass Gate P0 in `DEVELOPMENT_PLAN.md`.

## Phase 1: Security and Trust Boundaries

- [x] Fix hosted-provider credential exfiltration and arbitrary `baseUrl` use.
- [x] Block SSRF, redirect escape, and private-network access in hosted routes.
- [x] Separate loopback-only local providers from the future public API.
- [ ] Add authentication, origin/CSRF checks, rate limits, budgets, and audit events.
- [ ] Add CSP and the remaining browser security headers.
- [ ] Replace untrusted HTML interpolation with safe text/template rendering.
- [ ] Validate projects, commands, provider outputs, manifests, and filenames.
- [ ] Make save/quota failures visible to users.
- [ ] Resolve the high-severity development dependency audit finding.
- [ ] Pass Gate P1; keep public AI disabled.

## Phase 2: Deterministic Project Core

- [ ] Introduce Vite and strict TypeScript package boundaries without changing UX.
- [ ] Define sparse project schema v4 and forward-only migration fixtures.
- [ ] Add stable IDs and remove selection-dependent command targeting.
- [ ] Implement pure reducers with inverse operations and deterministic seeds.
- [ ] Replace the current undo replay with baseline/checkpoint/inverse history.
- [ ] Rebuild proposals as materialized, hashed patches with conflict detection.
- [ ] Move projects to IndexedDB and assets to OPFS/IndexedDB.
- [ ] Separate project, runtime, view, audio, preferences, and history records.
- [ ] Route every persistent mutation through the reducer.
- [ ] Meet size and interaction budgets; pass Gate P2.

## Phase 3: Transport and Audio Engine

- [ ] Define PPQ musical time, time signatures, bars, loops, and tempo changes.
- [ ] Make the pure event compiler authoritative for all sequencer events.
- [ ] Apply swing once; unify MIDI and audio scheduling.
- [ ] Remove module-owned clocks and DOM timing bridges.
- [ ] Build persistent track strips, sends, returns, meters, and voice allocators.
- [ ] Use one graph compiler for realtime and offline rendering.
- [ ] Await worklets and remove the deprecated ScriptProcessor path.
- [ ] Add declicking, smoothing, headroom, voice, tail, and CPU quality gates.
- [ ] Finish the sampler and one flagship synth.
- [ ] Retire the non-authoritative engine path; pass Gate P3.

## Phase 4: Toolchain and UI Migration

- [ ] Build hashed Vite releases and generated service-worker revisions.
- [ ] Expand strict TypeScript package by package.
- [ ] Migrate the shell and one core workflow to Lit Web Components.
- [ ] Build accessible, typed controls from the design system.
- [ ] Replace full-page rebuilds with keyed components and subscriptions.
- [ ] Remove obsolete globals and split transient state from project state.
- [ ] Add loading, failure, migration, recovery, and offline states.
- [ ] Add Chromium, Firefox, WebKit, axe, keyboard, and update-flow tests.
- [ ] Pass Gate P4.

## Phase 5: Focused Product Experience

- [ ] Consolidate navigation around Create, Sound, Arrange, Mix, and Project.
- [ ] Ship the Starter Desk and four-step first-jam flow.
- [ ] Make Pattern and Sound the primary create/edit path.
- [ ] Use progressive disclosure for advanced sequencing and routing.
- [ ] Remove overlapping controls and improve labels, tooltips, and feedback.
- [ ] Meet contrast, focus, hit-target, reduced-motion, and layout requirements.
- [ ] Expose save, offline, recovery, and migration health.
- [ ] Run five observed first-use sessions and pass Gate P5.

## Phase 6: AI Co-producer and Safe Deployment

- [ ] Generate tools, docs, schemas, and allowlists from one registry.
- [ ] Port the harness to explicit v4 command targets and revisions.
- [ ] Add bounded, redacted, replayable traces.
- [ ] Build offline perception, musical lint, comparison, and repair.
- [ ] Prove deterministic proposal/audition/merge behavior headlessly.
- [ ] Build the Director rail only after headless acceptance.
- [ ] Create the separate authenticated hosted-provider API.
- [ ] Add spending caps, abuse monitoring, privacy controls, and security review.
- [ ] Run a closed pilot; pass Gate P6 before considering billing.

## Phase 7: Extensibility and External Devices

- [ ] Publish Module SDK v1 with trust, migration, asset, and UI policies.
- [ ] Prove a third-party module can ship without core edits.
- [ ] Complete MIDI in, clock in, thru, CC learn, and hardware testing.
- [ ] Evaluate real Ableton Link against the authoritative transport.
- [ ] Reassess desktop packaging from measured PWA gaps.
- [ ] Consider Rust/WASM only with profiling evidence.
- [ ] Pass Gate P7.

## Parked Work

Director-first monetization, more pages, more instruments, Electron/Tauri,
Ableton Link, MCP serve mode, DAW adapters, landing-page expansion, and general
visual polish are not parallel tracks. They remain parked until their owning
phase is open.

## Status Update Rule

Update this file in every implementation pull request. Only mark an item
complete when its tests and phase acceptance evidence are committed. Record
session-specific detail in [`../NEXT_SESSION.md`](../NEXT_SESSION.md); do not
duplicate the full plan there.
