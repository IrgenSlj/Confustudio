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

**Completed (Sessions 1-2):**
- `createSignalGraph()`, `recordSignal()`, `computePathToRoot()`, `computeCriticalPath()` in state.js
- `signalUndo()`, `signalRedo()`, `replaySignalSubgraph()`, `executeAndRecord()` in command-bus.js
- `history-ui.js` rewritten to use signal-graph replay instead of snapshot-based history controller
- `_signalGraph` runtime compartment in `createAppState()`
- Full command stored in graph nodes for replay fidelity

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

### Session 3: Planned

Options:
- **Branching support** — allow undo followed by new edit to create a branch instead of linear pruning. Visualize branches in the history UI.
- **Audio routing graph** — add `signalGraph` (public, serializable) for audio routing: nodes (oscillators, filters, etc.) and connections (cables). Add graph commands to `executeStudioCommand`.
- **Plugin registry** — `src/plugins/registry.js`, register existing DSP types.
- **Engine reads graph** — `engine-graph.js` compiles graph to Web Audio nodes.

### Session 4-9

To be determined based on priority after Session 3.

## Decision Log

- **No TypeScript**: Would touch every file, break the build, minimal value before API surface stabilizes
- **No state management library**: Command bus exists and works
- **Graph coexists with legacy state**: Migration is incremental
- **AI operates at the command level**: No direct state manipulation
- **Two graph concepts**: Command-history DAG (`_signalGraph`, runtime-only) for edit tracking; Audio routing graph (future `signalGraph`, serializable) for DSP routing
