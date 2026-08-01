# CONFUstudio Architecture

**Status:** target architecture and migration constraints

**Updated:** 2026-08-01

**Plan:** [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md)

This document distinguishes what the repository does today from the boundaries
it must reach. It does not describe planned behavior as implemented behavior.

## Product Boundary

CONFUstudio is a browser-first groovebox, sampler, sequencer, and modular studio.
The studio must remain fully functional without an AI provider. The agent operates
on inspectable parameters and commands, produces auditionable proposals, and never
generates opaque replacement audio.

The implementation order is security and data integrity, deterministic editing,
timing and audio quality, focused UX, then AI and extensibility.

## Current Architecture

The current application is a direct-browser ES-module application served by a
small Node server. `src/app.js` coordinates UI, state, scheduling, audio, and many
global integration hooks. Pages commonly rebuild HTML and attach listeners after
each render. Project state is eagerly materialized, cloned and normalized on the
main thread, and persisted primarily through localStorage.

There are two incomplete audio authorities:

- `src/engine.js` builds much of a track chain per trigger.
- `src/engine-graph.js` compiles a modular Web Audio graph but does not own all
  sequencing, parameter synchronization, or offline rendering.

The command graph records commands, but it does not currently have a reliable
root baseline or deterministic replay contract. Some persistent writes bypass it.
The graph is also included in serialization despite being described as runtime-only.

The assistant server combines static hosting, local provider bridging, and hosted
provider proxying. Provider egress, browser inputs, commands, sessions, origin/CSRF,
limits, and audit output now have interim tested policies, but the shared process
and in-memory operator session remain unsuitable for public deployment.

## Architectural Invariants

1. Persistent state changes only through a validated command reducer.
2. Commands identify stable entities; current UI selection is never an implicit target.
3. Undo applies exact inverses or a known checkpoint, never replay over mutated state.
4. Random behavior is seeded or materialized and therefore repeatable.
5. Project, preference, runtime, view, audio, history, and trace data are separate.
6. Musical time and event compilation are pure and independent of DOM frame timing.
7. One compiler and one graph definition serve realtime and offline rendering.
8. The audio thread does no network, DOM, storage, or model work.
9. Untrusted data is validated at entry and rendered as text by default.
10. The studio has no runtime dependency on an AI provider or hosted API.

## Target Layers

```text
Lit UI and PWA shell
  -> typed application services and subscriptions
  -> validated command and proposal boundary
  -> sparse project model and IndexedDB persistence
  -> pure musical kernel and event compiler
  -> persistent realtime/offline audio graph
  -> AudioWorklet DSP and browser audio/MIDI devices

AI harness
  -> generated tool registry
  -> validated command proposals
  -> offline render and perception
  -> human audition and merge

Hosted API
  -> authentication, quotas, audit, fixed provider egress

Local bridge
  -> loopback-only local/Ollama access
```

The intended package layout and pull-request migration order are defined in the
development plan. Existing `src/` modules remain in place until their replacement
has compatibility and migration tests.

## Project Model

Project schema v4 is sparse and versioned.

- Banks, patterns, tracks, modules, assets, and arranger sections have stable IDs.
- Maps hold entities and order arrays hold presentation order.
- Empty patterns and default steps are not serialized.
- Selection, open page, focus, meter values, audio nodes, and browser handles are
  runtime/view state, not project state.
- Edit history is a bounded local record and is excluded from portable packages
  unless a future explicit collaboration format includes it.
- Assets are content-addressed records stored outside the JSON project document.
- Forward migrations are fixture-tested. Unknown future versions are never coerced.

Imports are trust boundaries. Runtime schemas enforce byte, depth, count, string,
and asset limits before migration. A failed migration preserves the original and
offers export/recovery.

## Commands, History, and Proposals

A command envelope contains an ID, type, base revision, explicit target IDs,
validated payload, and optional seed. The pure reducer returns the next project,
an inverse operation or compact inverse patch, touched IDs, and domain events.

History has:

- an explicit baseline;
- a current revision;
- bounded inverse entries;
- periodic compact checkpoints;
- deterministic redo;
- a clear compaction and persistence policy.

Agent proposals do not replay intent relative to whatever happens to be selected.
A proposal stores a materialized patch, inverse, base revision, touched IDs, and
content hash. Audition applies that exact patch in an isolated view. Merge applies
the same patch after conflict detection. Merge remains a human action.

## Music Kernel and Transport

The kernel owns musical meaning:

- PPQ time, tempo map, time signatures, bars, beats, loops, and phrases;
- step conditions, probability, swing, microtiming, humanization, and p-locks;
- arranger, scene, and automation lowering;
- timestamped audio and MIDI events;
- seeded deterministic compilation.

The live scheduler requests events for an audio-clock window and submits their
timestamps. UI animation observes transport position but never determines it.
Swing is compiled exactly once. Non-16-step patterns do not redefine musical bars.
All module-owned timers and DOM clock events are removed or adapted to this transport.

## Audio Engine

The audio graph owns persistent track strips, sends, returns, meters, effects,
instruments, and voice allocation. Trigger events start or update voices; they do
not reconstruct and disconnect the whole strip.

One graph compiler must support both `AudioContext` and `OfflineAudioContext`.
Worklet registration is awaited before graph construction. Audible parameters are
smoothed, voices declick, tails survive later triggers, and headroom is documented.
The deprecated ScriptProcessor fallback is removed.

Web Audio and AudioWorklet remain the supported DSP stack. Rust/WASM is considered
only if profiles show a specific processor cannot meet an agreed budget.

## UI Architecture

Vite supplies development, production builds, workers, and hashed assets. Strict
TypeScript protects package and service boundaries. Lit Web Components replace
manual string rendering page by page.

UI components receive selected data and dispatch commands. They do not own project
truth. Fine-grained subscriptions update playheads, meters, and changed controls
without rebuilding entire pages. Untrusted values use text/template bindings.

The reusable control layer must provide stable dimensions, keyboard operation,
accessible names, visible focus, reduced motion, and minimum target sizes. The
hardware visual identity remains, but legibility and workflow clarity outrank density.

## Persistence and Offline Behavior

- Dexie/IndexedDB stores projects, histories, traces, preferences that exceed a
  small scalar, migrations, and recovery metadata.
- OPFS stores large audio assets when available, with IndexedDB blob fallback.
- localStorage holds only small preferences and migration pointers.
- Autosave is transactional, scheduled away from interaction, and user-visible.
- Quota, corruption, and migration failures have explicit UI states.
- Service-worker assets use build revisions and a tested update/rollback flow.

## AI and Server Boundaries

The public static app and hosted-provider API are separately deployable. The hosted
API uses authentication, CSRF/origin controls, per-user quotas, request budgets,
response limits, redacted audit events, and exact egress allowlists. Browser input
cannot select a hosted provider destination.

Local/Ollama access stays in a loopback-only bridge. It is not a public proxy.
Hosted credentials never reach the browser, logs, traces, project files, or arbitrary
destinations.

Tool schemas, manual entries, command bindings, station allowlists, and server
allowlists are generated from one typed registry. Provider output is untrusted and
must pass the same command validation as UI input.

## Testing Boundaries

- Unit and property tests: project schemas, migrations, reducers, history, compiler.
- Security tests: imports, DOM rendering, commands, provider egress, auth, quotas.
- Audio tests: deterministic events, offline references, NaN/DC/peak/tail/CPU checks.
- Browser tests: Chromium, Firefox, WebKit, keyboard, axe, persistence, PWA updates.
- Performance tests: project size, edit p50/p95, render counts, load, scheduler jitter.
- AI evals: target correctness, determinism, guardrails, injection, budget, perception.

`npm test` remains the single compatibility entry point while the internal runners
migrate. A green suite is necessary but not sufficient for audio or visual changes.

## Decision Ownership

- [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md): sequence and gates.
- [`ROADMAP.md`](./ROADMAP.md): live completion status.
- This document: architectural boundaries.
- Code, AI, and design briefs: domain requirements.
- Research and postmortems: historical evidence.

Changes to these decisions require an ADR and corresponding documentation updates.
