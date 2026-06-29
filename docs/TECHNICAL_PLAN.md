# CONFUstudio Technical Implementation Plan

## What We've Built (Sessions 1-2)

### Session 1: Command Graph Foundation

Files changed: `src/state.js`, `src/command-bus.js`

**state.js additions:**

- `createSignalGraph()` — factory returning `{ nodes, edges, nextId, headId, cursorId }`
- `recordSignal(graph, command, parentId, result)` — appends a node with full command clone
- `computePathToRoot(graph, nodeId)` — walks ancestry to root via parentId chain
- `computeCriticalPath(graph, fromId, toId)` — walks range between two nodes
- `_signalGraph: null` in `createAppState()` (runtime-only, stripped on serialization)

**command-bus.js additions:**

- `executeStudioCommand(state, command, parentSignalId?)` — optional parent signal ID for chaining
- `executeAndRecord(state, command, parentSignalId)` — internal helper that records signal when `state._signalGraph` is set
- `executeStudioCommands()` — updated to chain parentSignalId through batches

### Session 2: Undo/Redo via Signal Replay

Files changed: `src/command-bus.js`, `src/history-ui.js`, `src/state.js`

**command-bus.js additions:**

- `signalUndo(graph)` — moves cursor to parent, returns new cursor or null
- `signalRedo(graph)` — moves cursor to child node, returns new cursor or null
- `replaySignalSubgraph(state, graph, targetNodeId, opts)` — replays commands from root to target, suppresses recording during replay via `working._signalGraph = null`

**history-ui.js rewrite:**

- Replaced snapshot-based `createHistoryController` with signal-graph replay
- `pushHistory()` now just updates cursor position
- `undoHistory()` calls `signalUndo()` then `replaySignalSubgraph()` with `inPlace: true`
- `redoHistory()` calls `signalRedo()` then `replaySignalSubgraph()` with `inPlace: true`
- Maintains backward-compatible API (`getMeta()`, `historyIdx`, `historyTotal`, etc.)

**state.js update:**

- `createSignalGraph()` now includes `cursorId: null`
- `recordSignal()` stores full command object (not just type) and updates `cursorId`

## Future Sessions

### Music Kernel Track

The next architectural track is the music kernel described in `docs/MUSIC_KERNEL_RESEARCH.md`.

**Order of work:**

- Extract pure transport, timing, and trig-condition helpers from `app.js`.
- Add an event compiler that converts a lookahead beat range into timestamped note/sample/MIDI/automation events.
- Make Drum Machine, Acid Machine, and arpeggiators consume the same kernel clock instead of standalone timers or DOM clock events.
- Promote `engine-graph.js` from optional modular sidecar to the primary route compiler.
- Move instrument behavior toward persistent voice engines and AudioWorklet/WASM renderers.

### Session 3 (Next)

Options (choose one):

**Option A: Branching Support**

- When undo is followed by a new command, create a branch node instead of pruning
- Each node can have multiple children (branching graph)
- `computePathToRoot()` naturally handles multiple parents? No — currently linear.
- Need: node tracking that supports multiple child references
- Add branch indicators in history UI
- `signalRedo()` needs to pick which child when multiple exist

**Option B: Audio Routing Graph**

- Add public `signalGraph` to state (serializable, not prefixed with `_`)
- Graph nodes: oscillators, filters, delays, etc.
- Graph connections: audio cables between node ports
- Commands: `add-graph-node`, `remove-graph-node`, `connect-graph-nodes`, `disconnect-graph-nodes`, `set-node-param`
- `graphFromTracks()` — derive graph from legacy track state
- `applyGraphToTracks()` — write graph changes back to legacy tracks

**Option C: Plugin Registry**

- `src/plugins/registry.js` — `registerPlugin(id, descriptor)`, `getPlugin(id)`, `listPlugins()`
- Plugin descriptors define: type, label, ports, params with defaults
- Register existing DSP types: oscillator, noise, sampler, biquad, gain, panner, delay, reverb, etc.

**Option D: Engine Reads Graph**

- `src/engine-graph.js` — `compileGraph(graph, ctx)` creates Web Audio nodes from graph
- `engine.js` — optional path to read from graph instead of hardcoded chains

### Sessions 4-9

To be determined based on which Option is chosen for Session 3.

## Key Design Rules

1. **No breaking tests.** Every session preserves existing functionality.
2. **Commands are the single mutation path.** UI, AI, and internal code all call `executeStudioCommand`.
3. **Graph is runtime-only** (`_` prefixed) for command DAG. Audio routing graph (future) will be serializable.
4. **Two graph concepts:** Command-history DAG for undo/redo; audio routing graph for DSP modeling.
