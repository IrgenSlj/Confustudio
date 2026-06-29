# CONFUstudio Architecture

## Design Principles

1. **Every state mutation goes through the command bus.** The AI assistant uses the same commands the UI does. There is no private path.

2. **Commands produce signals; the signal graph records the edit trace.** This enables undo/redo, branching, and critical-path analysis — without snapshotting the entire state.

3. **The graph coexists with legacy state.** Migration is incremental. Graph features are optional compartments that don't affect existing code paths.

4. **AI is a real-time collaborator, not a bolted-on chat.** AI reads and writes state through the same command bus as the human.

5. **Free inference first, API keys later.** Default assistant runs on free/limited inference (opencode, local Ollama). Users can bring their own keys.

6. **The music kernel is separate from the UI.** UI code may edit state and request transport actions, but musical timing, event compilation, graph routing, and DSP rendering should move behind a stable kernel boundary.

## Music Kernel

The music kernel is the bridge between project data and rendered sound. It should evolve in layers:

1. **Musical model** — patterns, clips, tracks, scenes, arranger sections, automation lanes, sample assets, and patch data in musical time.
2. **Event compiler** — pure logic that turns a transport window into timestamped note, sample, MIDI, automation, scene, and recorder events.
3. **Audio graph and voice engine** — persistent track strips, instruments, effects, sends, returns, sidechains, meters, and plugin nodes.
4. **DSP runtime** — AudioWorklet in browser mode, with Rust/WASM or native DSP for shared rendering later.

The immediate migration rule is conservative: extract pure timing and event logic first, then make the modular graph authoritative, then replace per-trigger Web Audio node chains with persistent instruments.

## The Command Graph (Edit History DAG)

The command graph records every `executeStudioCommand` call as a node in a lightweight DAG. This replaces the old snapshot-based undo/redo with a deterministic replay-based system.

### Graph Structure

```js
_signalGraph = {
  nodes: [
    {
      id: 1,
      command: { type: 'set-transport', bpm: 128 }, // full command for replay
      timestamp: 1718000000000,
      parentId: null, // causal parent (previous command)
      changed: true,
      summary: 'Updated transport',
    },
  ],
  edges: [{ from: 1, to: 2 }], // causality edges
  nextId: 3, // auto-incrementing ID counter
  headId: 2, // latest node (tip of the graph)
  cursorId: 2, // undo/redo cursor position
};
```

### Key Properties

| Property             | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Append-only          | Nodes are never deleted. Undo moves the cursor backward                                      |
| Full command stored  | Each node stores the complete command object for deterministic replay                        |
| Cursor-based undo    | `signalUndo(graph)` walks cursor to parent; `signalRedo(graph)` walks to child               |
| Replay-based restore | `replaySignalSubgraph(state, graph, targetId)` replays the critical path from root to cursor |
| Runtime-only         | Prefixed with `_`, automatically stripped by `stripRuntime` on serialization                 |

### How Undo/Redo Works

1. **Every command** executed through `executeStudioCommands()` is recorded as a graph node via `executeAndRecord()`.
2. **Undo**: `signalUndo()` moves cursor to parent → `replaySignalSubgraph()` clones state (or works in-place) and replays all commands from root to the new cursor position.
3. **Redo**: `signalRedo()` moves cursor to the child node → same replay mechanism.
4. **Branching** (future): When undo is followed by a new command, the new command's parent is the current cursor, creating a branch. Both paths remain accessible.

### API Surface

| Function                                       | Location       | Purpose                            |
| ---------------------------------------------- | -------------- | ---------------------------------- |
| `createSignalGraph()`                          | state.js       | Factory returning empty graph      |
| `recordSignal(graph, cmd, parentId, result)`   | state.js       | Append a node to the graph         |
| `computePathToRoot(graph, nodeId)`             | state.js       | Walk ancestry to root              |
| `computeCriticalPath(graph, fromId, toId)`     | state.js       | Walk range between two nodes       |
| `signalUndo(graph)`                            | command-bus.js | Move cursor backward               |
| `signalRedo(graph)`                            | command-bus.js | Move cursor forward                |
| `replaySignalSubgraph(state, graph, id, opts)` | command-bus.js | Replay commands from root to node  |
| `executeAndRecord(state, cmd, parentSignalId)` | command-bus.js | Execute + optionally record signal |

### Migration from Snapshot History

- Old: `createHistoryController(limit)` stores full state snapshots in an array. Undo/redo restores snapshots.
- New: `replaySignalSubgraph()` re-executes commands from the graph. No snapshots needed.
- Backward compat: `createHistoryController()` still exists for direct use in tests.

## Future: Audio Routing Graph

Signal graph v2 will extend the concept to model audio routing, parallel to the command DAG.

```js
signalGraph = {
  nodes: { [nodeId]: { plugin, params, ports, meta } },
  connections: [{ fromNode, fromPort, toNode, toPort }],
};
```

This is planned for Sessions 3+.

## Audio Engine

### Phase 1 (current)

Web Audio API graph with AudioWorklet nodes (plaits, clouds, rings, resampler, bitcrusher). Hardcoded track→DSP routing still lives in `engine.js`, while `engine-graph.js` compiles modular graph nodes separately.

### Phase 2 (future)

The music kernel event compiler feeds persistent instruments and the audio routing graph. Each graph node creates the corresponding Web Audio node. Graph connections become Web Audio connections, and track strips compile into graph subgraphs.

### Phase 3 (future)

Select graph subgraphs compile to WGSL compute shaders for WebGPU execution. Rust/WASM core for critical paths (voice allocation, scheduling, offline render).

## AI Integration

### Architecture

```
Browser (UI + Command Bus)
  │  reads/writes state via commands
  ▼
Local Proxy (server.mjs)
  │  /api/assistant/* routes
  ├──► Free inference (opencode, Ollama)
  └──► Optional: OpenAI / Anthropic / MCP bridge
```

### AI Tool Surface

AI tools map to command-bus actions the UI also uses. Same path, same graph recording.

## File Layout

```
src/
  state.js             ← app state, signal graph types, serialization
  command-bus.js       ← executeStudioCommand, signal undo/redo/replay
  history-ui.js        ← undo/redo UI widget (driven by signal graph)
  app.js               ← main app, wires history to UI
  plugins/             ← (future) plugin registry
  engine.js            ← AudioEngine
  cables.js            ← SVG cable UI
  studio-modules.js    ← module UI
  assistant-client.js  ← AI tool surface
```

## Key Decisions

- **No TypeScript yet.** Plain JS until the API surface stabilizes.
- **No build step.** Static server, no bundler.
- **Two graph concepts, one name.** The command-history DAG (`_signalGraph`) tracks edit causality. The audio routing graph (future `signalGraph`) models DSP routing. Both use similar DAG patterns.
- **AI operates at the command level.** No direct state manipulation. Same path as the UI.
