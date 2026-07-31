# ADR 0001: Foundation Stack and Migration Boundaries

- **Status:** Accepted
- **Date:** 2026-07-31
- **Owners:** Project maintainer
- **Plan:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md)

## Context

CONFUstudio grew as a direct-browser JavaScript prototype with no production
build and few dependencies. That enabled rapid breadth, but the current repository
now couples a large mutable project object, command capture, string-rendered pages,
transport scheduling, two audio engines, persistence, and provider proxying.

The Phase 0 baseline records a 10.31 MB default state, 65,536 eager step objects,
roughly 110 ms p95 command-state capture, and roughly 216 ms p95 public command
latency on the reference machine. The architecture review also reproduced broken
undo/replay, proposal target drift, nondeterministic audition/merge, credential
exfiltration through a caller-selected provider URL, and stored script execution
from imported project names.

The project needs stronger boundaries, but a full application rewrite would defer
user value and create a second source of truth around the existing audio behavior.

## Decision

Adopt the target stack incrementally behind tested compatibility boundaries.

### Build and language

- Vite becomes the development and production build system.
- New package and service boundaries use strict TypeScript.
- Existing JavaScript remains until its owning workflow has characterization and
  migration tests. There is no repository-wide mechanical conversion.
- Production assets and service-worker revisions derive from the build graph.

### UI

- Lit Web Components replace manual page rendering workflow by workflow.
- Project truth remains outside component state.
- Components read typed selectors/subscriptions and dispatch validated commands.
- CSS custom properties remain the theming contract; component styles are scoped.

Lit was selected because it can coexist with the current DOM and custom elements,
supports shadow/scoped component boundaries, and avoids requiring a shell rewrite
before the state and audio foundations are stable.

### State, commands, and validation

- Project schema v4 is sparse, stable-ID based, versioned, and runtime-validated.
- Valibot is the intended runtime schema library at import, command, provider,
  module, and persistence boundaries.
- Pure reducers return next state, inverse operations, touched IDs, and events.
- Random commands carry a seed or materialized output.
- History uses a baseline, bounded inverse entries, and compact checkpoints.
- Proposals contain a materialized hashed patch and base revision.

No UI state framework owns the project. A small typed application store may expose
selectors and subscriptions, but the domain reducer remains framework-independent.

### Persistence

- Dexie/IndexedDB stores versioned project, history, trace, preference, and
  migration records.
- OPFS stores large audio assets when supported, with IndexedDB blobs as fallback.
- localStorage is limited to small preferences and migration pointers.
- Migration is forward-only and preserves a pre-migration export.

### Audio

- Web Audio plus AudioWorklet remains the DSP platform.
- A pure PPQ event compiler becomes the only musical-time authority.
- One persistent graph definition serves realtime and offline rendering.
- Rust/WASM requires profiling evidence for a specific processor and is not a
  default roadmap phase.

### Server

- The static PWA and hosted-provider API become separately deployable.
- Fastify is the intended hosted API framework for explicit schemas, hooks,
  authentication integration, limits, and structured observability.
- Hosted providers use fixed egress destinations and server-managed credentials.
- Local OpenAI-compatible/Ollama access remains a separate loopback-only bridge.
- The current provider POST routes are disabled by default during migration.

Fastify does not itself solve security. The security contract is defined by exact
egress allowlists, redirect rejection, authentication, authorization, CSRF/origin
checks, quotas, budgets, audit events, and hostile regression tests.

### Tests

- Vitest replaces ad hoc Node test runners incrementally for pure package tests.
- Playwright Test covers supported browsers, persistence, PWA, and workflows.
- axe-core supplies automated accessibility checks alongside manual keyboard use.
- Offline audio fixtures cover deterministic events and signal-quality budgets.
- `npm test` remains the compatibility entry point throughout migration.

### Packaging

- The PWA is the maintained product shell.
- Electron, Tauri, Ableton Link, MCP serve mode, and additional packaging remain
  parked until measured limitations justify them and an owner exists.

## Package Direction

```text
apps/studio     Vite and Lit PWA
apps/api        authenticated hosted-provider API
packages/project
packages/commands
packages/kernel
packages/engine
packages/harness
packages/ui
```

Packages cannot import `src/app.js`, page modules, or ambient browser globals.
Kernel and command packages run in Node without DOM, Web Audio, or storage.

## Consequences

Positive consequences:

- Migration can proceed in small reversible pull requests.
- Runtime and compile-time schemas share explicit ownership.
- UI framework choice does not determine domain or audio state.
- Realtime/offline parity and deterministic proposals become testable contracts.
- Static hosting and provider security no longer share one process boundary.

Costs and risks:

- The repository temporarily carries old and new paths.
- Build, schema, component, persistence, and API dependencies increase maintenance.
- Compatibility adapters require removal dates to avoid becoming permanent layers.
- The team must resist feature work while foundations are only partially migrated.

## Alternatives Considered

- **Continue no-build plain JavaScript:** rejected because current scale needs
  enforceable package contracts, hashed assets, and worker/worklet build support.
- **Full React rewrite:** rejected because it does not solve domain determinism,
  persistence, transport, audio ownership, or server security and would create a
  long-lived second application.
- **React for incremental pages:** viable if future contributors have a strong
  React constraint, but Lit is the default because it integrates with the current
  DOM with less shell ownership.
- **Redux or another UI state framework:** deferred. The required foundation is a
  pure domain reducer; subscriptions can remain small until usage proves otherwise.
- **Keep the Node standard-library server:** acceptable for the temporary local
  bridge, but rejected for the future public API due to growing policy and
  observability requirements.
- **Rust/WASM audio rewrite:** rejected without profiling evidence.
- **Electron-first desktop:** rejected while the PWA and engine are unstable.

## Migration and Rollback

Each planned pull request keeps the previous path available until its fixture and
acceptance gate passes. Stored-format changes export a backup before first write.
Rollback restores the prior app build and backup rather than attempting reverse
migration. Public provider routes stay default-off until the hosted API passes Gate P6.

Changing this decision requires a new ADR plus updates to the development plan,
architecture, roadmap, and next-session handoff.
