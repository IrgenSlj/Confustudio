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

### Session 6: Modular Engine ✓

- `ModularEngine` class in `src/engine-graph.js`
  - `compile(graph)` — full compile from signalGraph to Web Audio nodes
  - `sync(graph)` — incremental diff-based sync (add/remove/update)
  - `teardown()` — full cleanup
  - ModularEngine compiles: oscillator, tone, noise, biquad, gain, panner, eq-3band, compressor, delay, reverb, saturator, chorus, master-out
  - Worklet plugins (sampler, plaits, clouds, rings) stubbed with console warning
  - Compound nodes (reverb/chorus) use input/output split nodes for dry/wet
  - Chain nodes (eq-3band, delay) expose inputNode/outputNode for serial connection
- Wired into `app.js` `ensureAudio()` — created after AudioEngine, compiles signalGraph into master chain
- MOD toggle button in transport bar — `toggleModular()` with active state
- `state.modularActive` flag persisted
- Graph manipulation commands in `command-bus.js`: `commandAddGraphNode`, `commandRemoveGraphNode`, `commandAddGraphConnection`, `commandRemoveGraphConnection`, `commandClearGraph`

### Session 7: Worklets + DSP Modules + Cables ✓

- AudioWorklet support in `ModularEngine`:
  - `initWorklets()` — loads all 5 worklet modules on AudioContext
  - `removeNode()` sends stop message to worklet nodes before disconnect
  - `setNodeParam()` — updates AudioParams and worklet params at runtime
  - Plaits: continuous re-trigger via `setInterval` every 2s
  - Rings: continuous bow exciter (exciter=2)
  - Clouds: default sine-sweep buffer, 60s cloud duration
  - Sampler: default looping test tone via `cs-resampler`
  - Bitcrusher: inline `cs-bitcrusher` worklet node
- DSP Module type (`src/modules/dsp-module.js`):
  - `createDSPModule(pluginId, params)` — generic UI with title bar, port dots, param sliders
  - `getDSPPluginSections()` — categorized plugin list for module picker
  - Added "DSP MODULES" section to module picker in `studio-modules.js`
  - Adding a DSP module creates a signal graph node via `commandAddGraphNode`
  - Param sliders trigger `dsp:paramchange` events → `setNodeParam()`
- Cables → signal graph integration:
  - `addCable()` creates signal graph connection via `addConnection()`
  - `removeCable()` removes signal graph connection via `removeConnection()`
  - `module:removed` event → `removeNode()` on signal graph
  - Listener in `app.js` `boot()` handles signal graph cleanup

### Session 8: Music Kernel Grounding

Primary direction:

- Extract pure timing and trig-condition helpers from `app.js` into `src/kernel/`.
- Add direct tests for transport math, trig conditions, and deterministic event compilation.
- Keep runtime behavior unchanged while creating the seam for a real event compiler.
- Use `docs/MUSIC_KERNEL_RESEARCH.md` as the guiding architecture memo.

Follow-on options:

- **Event compiler integration** — make `scheduleLoop()` consume compiled event batches before calling `triggerTrack()`.
- **Cable port routing** — route signal graph connections through specific module ports.
- **Module clock migration** — make Drum Machine and Acid Machine consume kernel transport events instead of standalone timers.
- **Graph presets** — save/load signal graph configurations.

## Decision Log

- **No TypeScript**: Would touch every file, break the build, minimal value before API surface stabilizes
- **No state management library**: Command bus exists and works
- **Graph coexists with legacy state**: Migration is incremental
- **AI operates at the command level**: No direct state manipulation
- **Two graph concepts**: Command-history DAG (`_signalGraph`, runtime-only) for edit tracking; audio routing graph (`signalGraph`, serializable) for DSP routing
- **Music kernel boundary**: UI edits state, the kernel compiles musical time into timestamped events, and the graph/DSP runtime renders those events.
