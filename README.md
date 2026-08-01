# CONFUstudio

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-brightgreen)](./package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

CONFUstudio is an experimental browser-based groovebox, sampler, sequencer, and
modular music studio. Its long-term differentiator is an AI co-producer that works
in editable parameters and auditionable proposals rather than replacing the
project with generated audio.

## Current Status

The repository is executing a gated foundation reset. Phase 0 baselines are
complete and Phase 1 security work is active. The current prototype has broad
features and a distinctive hardware-inspired interface, but its state/history,
persistence, transport/audio ownership, UI rendering, and public assistant security
boundaries are not ready for further feature expansion or public AI deployment.

Development follows the approved plan:

- [`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md): canonical sequence,
  stack decisions, acceptance gates, and pull-request plan.
- [`docs/ROADMAP.md`](./docs/ROADMAP.md): live status.
- [`NEXT_SESSION.md`](./NEXT_SESSION.md): next approved batch only.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): current and target boundaries.
- [`SECURITY.md`](./SECURITY.md): current deployment restrictions.

Do not publicly expose the current assistant proxy or configure it with production
provider credentials.

## Product Direction

Priority order:

1. Security and data integrity.
2. Deterministic editing, undo, persistence, and timing.
3. Professional sampler/engine quality and a focused music-making workflow.
4. Readable, accessible, fast UI and a ten-second first-run experience.
5. Deterministic AI proposals with perception, traces, and human-controlled merge.
6. Module SDK, external devices, and additional packaging.

Core principles:

- **Parameters, not opaque renders.** Sounds remain inspectable project state.
- **Proposals, not silent mutations.** AI edits are auditioned before human merge.
- **Perception before claims.** Audio assertions require offline measurement.
- **One command path.** Human and agent edits cross the same validated boundary.
- **One musical clock and audio graph.** Realtime and offline paths share a compiler.
- **AI is optional.** The studio works when every provider is unavailable.

## Prototype Capabilities

The current prototype includes a 64-step sequencer, p-locks, trig conditions,
probability and microtiming, audio and MIDI tracks, banks and patterns, scenes,
arranger, mixer buses, sample/tone/noise machines, effects, modular routing,
WebMIDI, project packages, PWA support, loudness/spectrum kernels, and an early
agent harness.

These capabilities are not all production-ready. In particular:

- Undo/replay and proposal merge are not yet deterministic.
- Project state is oversized and persistence/history are not properly bounded.
- Multiple scheduler/audio paths compete for authority.
- Several modular voices are placeholders.
- The Director rail, full perception loop, memory, and production provider API
  are not complete.
- Electron packaging and Ableton Link are parked.

## Running Locally

Requirements: Node.js 20+ and a modern browser with Web Audio.

```bash
npm install
npm start
# http://127.0.0.1:4173
```

Checks:

```bash
npm run lint
npm run format
npm test
npm run baseline    # characterization report; timings are not CI thresholds
```

The assistant POST proxy is disabled by default. During local-only development it
can be enabled explicitly with `CONFUSTUDIO_ENABLE_ASSISTANT_PROXY=1`; this does
not make the current proxy safe for public exposure or production credentials.
Provider destinations and optional local-provider credentials are server-owned;
see [`docs/security/provider-egress.md`](./docs/security/provider-egress.md).
Import, command, rendering, and CSP rules are recorded in
[`docs/security/browser-boundaries.md`](./docs/security/browser-boundaries.md).

The current test suite is useful but does not yet prove audio quality,
accessibility, multi-browser behavior, history correctness, or deployment safety.
The development plan adds those gates.

## Target Stack

Migration is incremental rather than a rewrite:

- Vite builds and hashed assets.
- Strict TypeScript for project, command, kernel, engine, harness, and UI boundaries.
- Lit Web Components for page-by-page UI replacement.
- Pure reducers and inverse patches for deterministic history and proposals.
- Valibot runtime schemas at every trust boundary.
- Dexie/IndexedDB project storage and OPFS/IndexedDB audio assets.
- One PPQ event compiler and persistent AudioWorklet graph.
- Vitest, Playwright Test, axe-core, and offline audio fixtures.
- Separate authenticated hosted API and loopback-only local provider bridge.
- PWA-first packaging; no Rust/WASM or desktop shell without measured need.

## Documentation

The code, AI, design, score, manual, and design-system briefs remain domain
references. Their historical phase labels do not override the development plan.
Research and postmortems are evidence records, not current implementation claims.

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a change. Foundation
work follows the ordered roadmap and requires migration, security, performance,
audio, or browser evidence appropriate to its risk. Security reports belong in a
private advisory as described in [`SECURITY.md`](./SECURITY.md).

## License

[Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE) for attributions.
