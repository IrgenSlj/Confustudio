# Next Session

## Current Baseline

All tests green:

- `npm run test:syntax` — 137 files, ok
- `npm run test:state` — command bus + state round-trip, ok
- `npm run test:server` — all API routes, ok
- `npm run test:ui-smoke` — pre-existing zoom-lens issue (unrelated)

`npm run lint` — clean (0 errors, 0 warnings).
Server starts clean on `http://127.0.0.1:4173`.

## Architecture

See `docs/ARCHITECTURE.md` for the full specification.

**Core idea:** State mutations go through the command bus. Every command is optionally recorded as a node in a lightweight DAG (`_signalGraph`). This graph enables deterministic undo/redo via command replay instead of full-state snapshots.

**Completed (Sessions 1-3):**
- `createSignalGraph()`, `recordSignal()`, `computePathToRoot()`, `computeCriticalPath()` in state.js
- `signalUndo()`, `signalRedo()`, `replaySignalSubgraph()`, `executeAndRecord()` in command-bus.js
- `history-ui.js` rewritten to use signal-graph replay instead of snapshot-based history controller
- `_signalGraph` runtime compartment in `createAppState()`
- Full command stored in graph nodes for replay fidelity
- `signalListBranches()`, `signalSwitchBranch()` for graph branching
- Branch indicator in history UI with click-to-cycle through branches
- `cursorId` used as initial parent for branching from undo point

## Session Plan

### Session 1: Command Graph Foundation ✓

- `createSignalGraph()`, `recordSignal()` with full command storage
- `computePathToRoot()`, `computeCriticalPath()`
- `_signalGraph` in `createAppState()`
- `executeAndRecord()` helper in command-bus.js

### Session 2: Undo/Redo via Signal Replay ✓

- `signalUndo()`, `signalRedo()` cursor-based traversal
- `replaySignalSubgraph()` with recording suppression during replay
- `history-ui.js` — rewrite to use graph replay instead of snapshots
- `cursorId` tracking for undo/redo position

### Session 3: Branching ✓

- `signalRedo` picks most recent child (highest id) for default forward path
- `signalListBranches(graph, nodeId?)` — enumerate children of any node
- `signalSwitchBranch(graph, childNodeId)` — explicit branch navigation
- Branch indicator (`⍂N`) in undo indicator with click-to-cycle
- `cursorId` used as initial `parentSignalId` for branching from undo point

### Session 4: Audio Routing Graph ✓

- `createAudioGraph()`, `createAudioNode()`, `createAudioConnection()` in state.js
- `signalGraph` (public, serializable) in `createAppState()`
- Graph commands: `add-graph-node`, `remove-graph-node`, `connect-graph-nodes`, `disconnect-graph-nodes`, `set-node-param`, `replace-graph`, `get-graph`
- `graphFromTracks()` — derives audio graph from legacy track state
- `applyGraphToTracks()` — writes graph node params back to legacy state
- `repairState` ensures `signalGraph` shape for legacy project loads

### Session 5: Plugin Registry ✓

- `src/plugins/registry.js` — `registerPlugin()`, `getPlugin()`, `listPlugins()`, `hasPlugin()`, `getPluginDefaultParams()`
- 21 plugin descriptors registered: oscillator, tone, noise, sampler, plaits, clouds, rings, biquad, gain, panner, eq-3band, compressor, bitcrusher, delay, reverb, saturator, chorus, lfo, envelope, master-out, midi
- Each plugin has: type, label, ports (typed), params (with defaults/ranges)
- `src/plugins/index.js` — barrel import

### Session 6

Options:
- **Engine reads graph** — `engine-graph.js` compiles graph to Web Audio nodes.
- **Cables become graph-aware** — SVG cables read/write `state.signalGraph.connections`
- **Claude Design integration** — implement the design deliverables from `docs/CLAUDE_DESIGN_BRIEF.md`

### Sessions 7-9

To be determined based on priority after Session 4.

## Decision Log

- **No TypeScript**: Would touch every file, break the build, minimal value before API surface stabilizes
- **No state management library**: Command bus exists and works
- **Graph coexists with legacy state**: Migration is incremental
- **AI operates at the command level**: No direct state manipulation
- **Two graph concepts**: Command-history DAG (`_signalGraph`, runtime-only) for edit tracking; Audio routing graph (future `signalGraph`, serializable) for DSP routing
