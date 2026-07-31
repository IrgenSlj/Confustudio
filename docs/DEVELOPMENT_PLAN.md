# CONFUstudio Development Plan

**Status:** canonical implementation plan

**Baseline:** `main` as reviewed on 2026-07-31

**Owner:** project maintainer

**Implementation state:** waiting for explicit development approval

This document defines the order of work, acceptance gates, and target stack. It
supersedes older phase ordering in the code, AI, and design briefs. The briefs
remain requirements references, but they do not authorize work ahead of the
gates in this plan.

## 1. Product Direction

CONFUstudio should first become a dependable browser groovebox and sampler with
excellent sound, fast editing, reliable save/undo, and deterministic playback.
The AI co-producer remains the long-term differentiator, but it is additive. It
must not become load-bearing until the command, branch, perception, and security
boundaries are trustworthy.

The priority order is:

1. Security and data integrity.
2. Deterministic editing, history, persistence, and timing.
3. Sound quality and a focused instrument workflow.
4. Readability, accessibility, and first-run success.
5. AI proposal, perception, and deployment features.
6. Module SDK, external devices, and desktop packaging.

### Success criteria

- A new user can load the Starter Desk, press play, and make an audible edit in
  under 10 seconds without reading documentation.
- Import, save, reload, undo, redo, branch audition, merge, and export never
  silently lose or retarget data.
- The same project and seed compile to the same event stream.
- Realtime and offline rendering use the same compiler and audio graph.
- A normal edit commits within one animation frame on reference hardware.
- The app remains fully usable with every AI provider disabled.
- No public endpoint can expose credentials or reach arbitrary network targets.

## 2. Decisions

### Adopt incrementally

| Area        | Decision                                                                   | Reason                                                                                     |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Build       | Vite                                                                       | Hashed production assets, reliable module graph, workers, and incremental migration.       |
| Language    | TypeScript with `strict` enabled                                           | Project, command, plugin, and audio contracts need compile-time enforcement.               |
| UI          | Lit Web Components                                                         | Fits the existing DOM application and supports page-by-page replacement without a rewrite. |
| Validation  | Valibot schemas at every trust boundary                                    | Runtime validation is required even when TypeScript is present.                            |
| State       | Pure reducers with explicit inverse patches                                | Makes undo, replay, tests, and agent proposals deterministic.                              |
| Persistence | Dexie/IndexedDB for records; OPFS with IndexedDB fallback for audio assets | Removes large project data from localStorage and supports migrations and blobs.            |
| Testing     | Vitest, Playwright Test, axe-core, offline audio fixtures                  | Covers pure logic, browsers, accessibility, and sound regressions.                         |
| API         | Separate Fastify service for hosted AI; local bridge remains loopback-only | Creates explicit authentication, policy, rate-limit, and egress boundaries.                |
| DSP         | Web Audio plus AudioWorklet                                                | Existing platform is sufficient; Rust/WASM requires profiling evidence.                    |
| Packaging   | PWA first                                                                  | Electron and other desktop shells remain parked until the web core is stable.              |

These are migration targets, not permission for a big-bang rewrite. New code
uses the target stack once its enabling phase lands. Existing pages move only
when their workflow is already under test.

### Stop or defer

- Do not publicly deploy the current assistant proxy.
- Do not build the Director rail, billing, or hosted-provider monetization yet.
- Do not add instruments, pages, adapters, or command types during foundation work.
- Do not implement Ableton Link, MCP serve mode, Electron packaging, Tauri, or
  Rust/WASM during this plan's core phases.
- Do not copy the existing command DAG into the new design. Replace it behind
  tested compatibility boundaries.
- Do not move audio state into UI component state.

## 3. Target Boundaries

The migration should converge on this layout:

```text
apps/
  studio/              Vite shell, Lit pages, PWA integration
  api/                 authenticated hosted-provider API
packages/
  project/             schemas, migrations, sparse model, persistence
  commands/            reducers, inverse patches, history, proposals
  kernel/              transport, event compiler, musical time
  engine/              realtime/offline graph, voices, worklets
  harness/             tools, context, branches, perception, traces
  ui/                  design tokens and reusable accessible controls
```

During migration, current `src/` modules may import packages, but packages must
not import `src/app.js`, DOM globals, or page modules. The kernel and command
packages remain pure and executable in Node.

### Project model v4

- Stable IDs identify banks, patterns, tracks, modules, assets, and arranger sections.
- Collections use ID maps plus explicit order arrays; selection is view state,
  never an implicit command target.
- Patterns and steps are sparse. Empty patterns and default steps are not
  materialized or serialized.
- Project data, preferences, runtime handles, meters, UI layout, and edit history
  are separate schemas and storage records.
- Every package carries `formatVersion`, and every supported older fixture has a
  forward-only migration test.
- Imports have byte, depth, collection, string, and asset limits. Unknown fields
  are rejected or quarantined; they are never blindly merged.

### Command and proposal model

Each persistent edit uses a validated envelope:

```ts
type CommandEnvelope = {
  id: string;
  type: string;
  baseRevision: number;
  targetIds: string[];
  payload: unknown;
  seed?: number;
};
```

The pure reducer returns `{next, inverse, touchedIds, events}`. Random operations
must carry a seed or materialized result. History has an explicit baseline,
bounded checkpoints, and exact inverse operations. A proposal contains its base
revision, materialized patch, inverse patch, touched IDs, and content hash.
Audition and merge apply the same patch; merge detects conflicting touched IDs.

## 4. Phased Delivery Plan

No phase begins until the previous phase's blocking acceptance gate passes.
Estimates are directional for one focused engineer and should be recalibrated
after the first two pull requests.

### Phase 0: Planning freeze and baselines

**Goal:** make the reset explicit and record measurements before behavior changes.

**Estimated effort:** 2-3 days after development approval.

- Create tracking issues for every pull request listed in section 5.
- Record current project size, edit latency, load time, audio scheduling jitter,
  and UI accessibility baselines in machine-readable fixtures.
- Add an architecture decision record for the selected stack and package boundaries.
- Mark the public AI deployment path disabled until the security gate passes.
- Capture representative v1-v3 project fixtures, including corrupt and oversized cases.

**Gate P0:** baseline report committed; fixtures scrubbed of secrets and personal
audio; every later phase has an issue, owner, dependencies, and rollback note.

### Phase 1: Security and trust boundaries

**Goal:** eliminate credential exfiltration, SSRF, stored XSS, and unvalidated mutation.

**Estimated effort:** 1-2 weeks.

- Remove client-controlled `baseUrl` for hosted OpenAI and Anthropic requests.
- Allowlist exact provider origins and paths; reject redirects to other origins.
- Keep local/Ollama routing in a loopback-only process with explicit private-IP policy.
- Disable hosted-provider routes unless authentication and provider configuration exist.
- Add session authentication, CSRF protection, strict origin checks, per-user rate
  limits, request/token budgets, timeouts, response-size limits, and audit events.
- Return normalized provider results instead of raw upstream payloads.
- Add CSP, `nosniff`, referrer, permissions, and frame-ancestor response policies.
- Replace untrusted `innerHTML` interpolation with text nodes or escaped Lit bindings.
- Validate imported projects, command envelopes, assistant outputs, module
  manifests, and filenames at their entry points.
- Surface save and quota failures in the UI instead of logging only to the console.
- Update vulnerable development dependencies and commit the resulting lockfile.

**Required tests:** credential exfiltration regression, private-network SSRF cases,
redirect escape, unauthenticated use, rate limits, CSRF, malicious project names,
oversized/deep imports, invalid commands, and CSP browser smoke.

**Gate P1:** an independent security review finds no known critical/high issue;
all hostile fixtures fail closed; public AI deployment remains disabled until the
new API service in Phase 6 is ready.

### Phase 2: Deterministic project core

**Goal:** replace implicit mutable state with a sparse, versioned, reversible core.

**Estimated effort:** 3-5 weeks.

- Introduce the strict TypeScript project, command, and migration packages under Vite.
- Define v4 schemas and migration fixtures before changing the live state shape.
- Implement v1-v3 to v4 migrations with backup export and recovery reporting.
- Build the pure reducer and inverse-patch contract for the existing command set.
- Require stable targets; remove selected bank/pattern/track as implicit write targets.
- Seed or materialize randomize, humanize, probability, and generative operations.
- Replace replay-from-mutated-state undo with baseline plus inverse/checkpoint history.
- Store bounded local history separately from portable project files.
- Rebuild proposal open/audition/merge/discard on materialized patches and conflict checks.
- Move project records to IndexedDB and sample assets to OPFS/IndexedDB.
- Retain the old loader read-only until fixture coverage proves migration.
- Route every persistent UI mutation through the reducer; fail tests on direct writes.

**Performance budgets:** default project serialization below 500 KB; ordinary edit
p95 below 16 ms; undo/redo p95 below 32 ms; autosave scheduled off the interaction
path; no unbounded history or localStorage project payload.

**Gate P2:** all migration fixtures round-trip; undo/redo fuzz tests pass; proposal
audition equals merge bit-for-bit; target-drift tests pass; save/reload and quota
failure tests pass; no persistent direct mutation remains.

### Phase 3: One transport and one audio engine

**Goal:** make musical timing and rendered sound deterministic and measurable.

**Estimated effort:** 4-6 weeks.

- Define musical time in PPQ ticks with explicit tempo, time signature, bar, beat,
  pattern length, and loop iteration semantics.
- Make the pure event compiler authoritative for step conditions, swing,
  microtiming, probability, scenes, arranger events, and MIDI.
- Apply swing exactly once and clamp it to a musically safe domain.
- Convert audio-context time to MIDI performance timestamps through one dispatcher.
- Replace DOM clocks and module-owned timers with subscriptions to one transport.
- Build persistent track strips, sends, returns, meters, and instrument voice allocators.
- Make one graph compiler serve realtime and `OfflineAudioContext` rendering.
- Await worklet registration before graph compilation; remove `ScriptProcessor` fallback.
- Implement parameter smoothing, declicking, voice stealing, tail preservation,
  denormal protection where relevant, and a documented headroom convention.
- Finish the sampler and one flagship synth before expanding the instrument catalog.
- Remove or adapt the non-authoritative legacy/modular engine path after A/B validation.

**Required tests:** deterministic event snapshots, swing boundaries, non-16-step bar
math, tempo changes, MIDI timestamp tolerance, offline/realtime graph parity, no
NaN/DC/clipping fixtures, tail/voice tests, and CPU/jitter budgets under load.

**Gate P3:** sampler and flagship voice pass the audio-quality suite; one 10-minute
playback soak has no scheduler underruns or console errors; realtime and offline
event hashes match; no second transport or engine owns musical truth.

### Phase 4: Toolchain and UI migration

**Goal:** make the interface maintainable, incremental, readable, and fast.

**Estimated effort:** 3-5 weeks, overlapping only with non-audio portions of Phase 3.

- Use Vite for development and hashed production builds; generate service-worker
  asset revisions instead of manually incrementing cache names.
- Enable strict TypeScript package by package; prohibit new unchecked JavaScript
  in migrated boundaries.
- Add Lit and migrate the shell plus one representative workflow before other pages.
- Create accessible controls from the design tokens with labels, keyboard support,
  stable dimensions, and 32 px studio / 44 px live hit-target floors.
- Replace full-page `innerHTML` rebuilding with keyed components and subscriptions.
- Separate transient selection, focus, meters, and transport display from project state.
- Consolidate globals behind typed services and remove obsolete event bridges.
- Add explicit loading, empty, migration, storage-failure, offline, and recovery states.
- Validate generated service-worker behavior on update, offline reload, and rollback.

**Required tests:** Playwright Test on Chromium, Firefox, and WebKit; axe scans;
keyboard-only workflows; 1024/1365/1440 desktop layouts; service-worker update
tests; render-count and interaction-latency budgets.

**Gate P4:** migrated shell and core workflows meet accessibility and performance
budgets; no stored-XSS sink exists in migrated UI; returning-user and offline boots pass.

### Phase 5: Focused product experience

**Goal:** turn the technical core into an instrument people can understand quickly.

**Estimated effort:** 2-4 weeks.

- Reduce top-level navigation around Create, Sound, Arrange, Mix, and Project.
- Ship Starter Desk with a compact, intentional four-bar project and real presets.
- Add a maximum four-step first jam: play, toggle, shape, arrange.
- Make Pattern the primary editing surface and Sound a focused selected-track editor.
- Use progressive disclosure for p-locks, routing, modulation, and advanced conditions.
- Remove overlapping bottom controls and replace cryptic actions with standard icons,
  tooltips, and accessible names.
- Complete readable typography, contrast, focus, reduced-motion, and color-redundancy passes.
- Add user-visible project health: saved, saving, offline, failed, recovered, migrated.
- Conduct five observed first-run sessions before locking navigation.

**Gate P5:** median first sound below 10 seconds; core edit task completion above
90 percent in observed sessions; zero critical axe findings; no control text clips
or overlaps at supported desktop widths.

### Phase 6: AI co-producer and safe deployment

**Goal:** restore the product differentiator on deterministic, inspectable foundations.

**Estimated effort:** 4-6 weeks.

- Generate tools, manual entries, schemas, and server allowlists from one registry.
- Port the loop to v4 commands and require explicit target IDs and base revisions.
- Persist bounded traces with prompt version, context digest, calls, budgets,
  measurements, disposition, and redacted provider metadata.
- Implement offline render, loudness/spectrum/onset features, musical lint, compare,
  and one bounded repair cycle.
- Build the Director rail only after headless proposal acceptance passes.
- Require audition before merge for audio-affecting proposals; keep merge user-only.
- Create the separate authenticated hosted API with fixed provider egress, secret
  management, quotas, abuse monitoring, deletion controls, and privacy documentation.
- Start with a closed test cohort and explicit spending caps. Do not add billing
  until retention and proposal acceptance are measured.

**Required evals:** target correctness, determinism, unauthorized command denial,
prompt injection from project data, budget exhaustion, provider failure, perception
honesty, trace redaction, and merge conflict behavior. Maintain at least 25 versioned
task cards before describing a station as production-ready.

**Gate P6:** every mutating run creates a deterministic proposal; audition equals
merge; measurements support quantitative claims; security review passes; provider
spend and abuse have hard limits; the studio remains functional when the API is down.

### Phase 7: Extensibility and external devices

**Goal:** expand only after the core and AI workflows are stable.

- Publish Module SDK v1 from the internal plugin contract and one third-party fixture.
- Define module trust, signature, version, migration, asset, and UI isolation policy.
- Complete MIDI input, clock input, thru, CC learn, and hardware acceptance tests.
- Evaluate real Ableton Link only against the authoritative transport.
- Reconsider desktop packaging from measured PWA limitations; maintain one shell only.
- Evaluate Rust/WASM only when profiles identify DSP that cannot meet budgets in worklets.

**Gate P7:** an external module and hardware device pass documented conformance tests
without core edits; every packaging target has a named owner and release process.

## 5. Pull Request Sequence

Each item is intended to be independently reviewable and reversible.

1. `plan/00-baselines`: ADR, fixtures, benchmark harness, public AI kill switch.
2. `security/01-provider-egress`: fixed upstreams, redirect policy, normalized responses.
3. `security/02-browser-boundaries`: safe rendering, CSP, import and command schemas.
4. `security/03-abuse-controls`: authentication skeleton, origin/CSRF, limits, audit events.
5. `core/01-vite-typescript`: Vite entry, strict TS project references, unchanged UI behavior.
6. `core/02-project-v4`: schemas, sparse factories, migration fixtures, compatibility reader.
7. `core/03-command-reducer`: validated envelopes, pure reducers, inverse operations.
8. `core/04-history`: baseline, undo/redo, checkpoints, bounded storage.
9. `core/05-proposals`: deterministic patches, base revisions, conflict detection.
10. `core/06-persistence`: Dexie records, asset store, migration/recovery UI.
11. `core/07-mutation-migration`: route remaining persistent UI writes through commands.
12. `audio/01-musical-time`: PPQ transport and deterministic event compiler.
13. `audio/02-live-scheduler`: one clock, swing, arranger, and MIDI dispatch.
14. `audio/03-persistent-graph`: track strips, sends, worklet lifecycle, voice allocation.
15. `audio/04-sampler`: production sampler and reference fixtures.
16. `audio/05-flagship`: one production synth and engine consolidation.
17. `ui/01-lit-shell`: typed services, Lit shell, routing, error/recovery states.
18. `ui/02-components`: accessible control library and automated interaction checks.
19. `ui/03-pattern-sound`: focused create and sound-design workflow.
20. `ui/04-starter-desk`: first-run project, onboarding, navigation simplification.
21. `ai/01-registry`: generated tools/manual/schemas on v4 commands.
22. `ai/02-perception`: offline render, features, lint, comparison.
23. `ai/03-proposals`: loop, traces, deterministic headless acceptance suite.
24. `ai/04-director`: proposal UI, audition, conflict, merge, discard.
25. `api/01-hosted`: separate authenticated API and controlled pilot deployment.

## 6. Quality Gates

Every pull request must state which budgets it changes and include before/after data.

| Area          | Gate                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| Correctness   | Unit, property, migration, and browser tests for changed contracts.              |
| Security      | Runtime schemas at trust boundaries; hostile fixture for each fixed class.       |
| Performance   | No unexplained regression above 10 percent; ordinary edit p95 under 16 ms by P2. |
| Audio         | Offline reference checks plus real-browser listening notes for audio changes.    |
| UI            | Keyboard path, accessible name, focus state, supported widths, no overlap.       |
| Persistence   | Fresh, migrated, corrupt, quota-full, offline, and returning-user cases.         |
| Documentation | Manual, schema, migration notes, and roadmap updated in the same change.         |

`npm test` remains the compatibility command during migration. It should eventually
delegate to formatting, ESLint, strict TypeScript, Vitest, Playwright, schema fixture,
security, and selected audio checks without running the same stage twice.

## 7. Release and Migration Policy

- Foundation changes ship behind internal feature flags until their migration gate passes.
- A project is backed up before the first v4 write. Migration never overwrites the
  only readable copy.
- Export remains available when migration fails; the UI reports the failing stage.
- Schema migrations are forward-only. Rollback uses the pre-migration backup and
  previous app build, not a reverse transformer.
- Service workers use build revisions and a tested update flow. A release is not
  complete until fresh, returning, offline, and post-update boots are verified.
- Public AI routes stay disabled by default until P6; local development routes bind
  to loopback and are visibly labeled local-only.

## 8. Governance

- `DEVELOPMENT_PLAN.md` owns ordering and gates.
- `ROADMAP.md` records current status against this plan.
- `ARCHITECTURE.md` owns current and target boundaries.
- `NEXT_SESSION.md` names only the next approved batch.
- Briefs own domain requirements but cannot bypass plan gates.
- Research and postmortems are historical evidence, not current implementation claims.
- Any change in direction requires a short ADR and updates to these four documents.

## 9. Kickoff Boundary

This documentation revision does not begin Phase 0 implementation. After explicit
approval, development starts with PR 1, `plan/00-baselines`. No other feature work
should be bundled into that kickoff.
