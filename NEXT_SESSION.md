# Next Session

## Current Baseline (May 2026)

All tests green:

- `npm run test:syntax` — 136 files, ok
- `npm run test:state` — command bus + state round-trip, ok
- `npm run test:server` — all API routes, ok
- `npm run test:ui-smoke` — Playwright module/cable/layout/interaction coverage, ok

`npm run lint` — clean (0 errors, 0 warnings).
`npm run format` — clean (Prettier matches across the tree).
Server starts clean on `http://127.0.0.1:4173`.

## Codebase Metrics

| Metric                | Value                                                          |
| --------------------- | -------------------------------------------------------------- |
| Total JS/ESM lines    | ~36,168                                                        |
| Files over 1000 lines | 14                                                             |
| Largest file          | `app.js` (3999)                                                |
| `window._*` globals   | 84 across 15 files                                             |
| Test suites           | 4 (syntax, state, server, ui-smoke)                            |
| ESLint/Prettier       | configured, both clean                                         |
| License               | Apache-2.0                                                     |

## Architecture — Signal Graph Model

See `docs/ARCHITECTURE.md` for the full specification.

**Core idea:** Audio routing, processing, and modulation are modeled as a typed directed graph. This replaces hardcoded track→DSP chains with explicit nodes, ports, and connections.

**Key properties:**
- Graph lives in `state.signalGraph` alongside legacy state (coexistence during migration)
- Every state mutation goes through the command bus — AI uses same path as UI
- Plugins are runtime-registered by string ID — no more switch statements
- AI assistant operates on the graph via MCP-style tools

## Multi-Session Makeover Plan

### Session 1: Graph Model Foundation

```
Goal: Establish the signal graph data model in state. No UI changes.
Estimate: 2-3 hours
```

- `docs/ARCHITECTURE.md` — written ✓
- Add `state.signalGraph` to `createAppState()` in `state.js`
- Add graph commands to `command-bus.js`:
  - `add-graph-node`, `remove-graph-node`
  - `connect-graph-nodes`, `disconnect-graph-nodes`
  - `set-node-param`, `replace-graph`
- Write `graphFromTracks()` — auto-derives graph from legacy track state
- Write `applyGraphToTracks()` — writes graph changes back to legacy state
- Add graph state round-trip tests to `test:state`
- Verify: legacy patterns still work, graph is derived but not yet consumed

### Session 2: Plugin Registry

```
Goal: Define the plugin registration API and register all existing DSP types as plugins.
Estimate: 2-3 hours
```

- Create `src/plugins/registry.js` — `registerPlugin(id, descriptor)` + `getPlugin(id)`
- Create plugin files for every existing machine/DSP type:
  - `src/plugins/biquad.js` — filter
  - `src/plugins/oscillator.js` — tone machine
  - `src/plugins/noise.js` — noise machine
  - `src/plugins/sampler.js` — sample machine
  - `src/plugins/plaits.js`, `clouds.js`, `rings.js` — worklet synths
  - `src/plugins/bitcrusher.js`, `delay.js`, `reverb.js`
  - `src/plugins/gain.js`, `panner.js`, `compressor.js`
  - `src/plugins/lfo.js`, `envelope.js`
- Create `src/plugins/index.js` — imports and registers all plugins
- Verify: `getPlugin('biquad')` returns port/param descriptors

### Session 3: AudioEngine Reads the Graph

```
Goal: Engine creates Web Audio nodes from the signal graph instead of hardcoded chains.
Estimate: 3-4 hours
```

- Create `src/engine-graph.js`:
  - `compileGraph(graph, audioContext) -> { nodes, connections }`
  - Iterates `graph.nodes`, calls `plugin.create()` for each
  - Iterates `graph.connections`, wires Web Audio nodes
  - Handles graph changes at runtime (add/remove/reconnect)
- Modify `engine.js` to optionally read from graph instead of hardcoded paths
- Keep legacy path as fallback for unchanged tracks
- Verify: existing patterns sound identical via both paths

### Session 4: Cables Become Graph-Aware

```
Goal: SVG cables read/write the signal graph instead of ad-hoc audio routing.
Estimate: 2-3 hours
```

- Modify `cables.js` to read connections from `state.signalGraph.connections`
- Cable creation calls `connect-graph-nodes` command
- Cable deletion calls `disconnect-graph-nodes` command
- Module ports are derived from plugin port definitions
- Verify: cable creation/removal updates graph state correctly

### Session 5: AI Tool Surface

```
Goal: AI assistant can read and edit the signal graph through the command bus.
Estimate: 2-3 hours
```

- Define AI tools as MCP-style command wrappers in `assistant-client.js`
  - `get_graph` → reads `state.signalGraph`
  - `add_node` → executes `add-graph-node`
  - `set_param` → executes `set-node-param`
  - `connect_ports` → executes `connect-graph-nodes`
  - `generate_pattern` → executes `generate-drum-pattern`
- Update `confustudio.manual.json` with graph tool descriptions
- Wire free inference provider (opencode/Ollama) as default
- Test end-to-end: AI proposes graph edit → command applies it → audio changes

### Session 6: Studio Modules Become Graph Nodes

```
Goal: Studio canvas modules are rendered views of signal graph nodes.
Estimate: 3-4 hours
```

- Each module type gets a `plugin` binding (e.g., `djmixer` → `plugin: 'djmixer'`)
- Module chrome reads node params from graph instead of DOM state
- Module serialization writes/reads from `signalGraph.nodes[id].params`
- Layout persistence becomes graph metadata: `node.meta.x/y/zoom`
- Verify: module state restores correctly from graph, not localStorage

### Session 7: Plugin Power-Ups

```
Goal: Add new plugin types that unlock graph-only capabilities.
Estimate: 3-4 hours
```

- `src/plugins/group.js` — subgraph container (instrument macro, FX chain)
- `src/plugins/drum-rack.js` — multi-voice drum module
- `src/plugins/euclidean.js` — Euclidean rhythm generator as control node
- `src/plugins/random.js` — random voltage source (S&H, smooth)
- Verify: new plugins work in the graph without touching engine.js

### Session 8: Cleanup & Hardening

```
Goal: Remove legacy paths, reduce technical debt.
Estimate: 2-3 hours
```

- Remove legacy delay routing (dual path → single graph path)
- Collapse remaining `window._*` globals into `__CONFUSTUDIO__` namespace
- Extract magic strings to `STATE_PATHS.js` / `EVENTS.js`
- Verify all tests pass, no regressions

### Session 9: Latent Primitive Prep (Optional / Future)

```
Goal: Design how neural codec tokens integrate as a new signal type.
Estimate: workshop, not implementation
```

- Research: MimiCodec ONNX-in-browser latency profile
- Design: `latent` signal type for the graph (latent token frames at 12.5 Hz)
- Design: encode/decode nodes as graph plugins
- Design: project file as hybrid (latent tokens + DSP graph)
- Prototype: simple latent pass-through (encode → store → decode)

## Decision Log

- **No TypeScript**: Would touch every file, break the build, minimal value before API surface stabilizes
- **No Vite**: Current static file server is zero-config, zero-build. Adding a build step now is premature optimization
- **No state management library**: Command bus exists and works. Replace it when proven insufficient, not before
- **Graph coexists with legacy state**: Migration is incremental, not a big bang
- **AI operates at the command level**: No direct state manipulation. Same path as the UI
- **Free inference by default**: opencode/Ollama for dev, API key upgrade for production
- **Plugins are runtime-registered**: New DSP types don't require engine.js changes
- **Skip latent tokens for now**: Design the graph with future `latent` signal type but ship audio/control/event first
