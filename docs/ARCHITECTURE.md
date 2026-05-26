# CONFUstudio Architecture

## Design Principles

1. **Graph is the source of truth.** Audio routing, processing, and modulation are modeled as a directed signal graph. The UI is a view of the graph, not the other way around.

2. **Every state mutation goes through the command bus.** The AI assistant uses the same commands the UI does. There is no private path.

3. **Plugins are just nodes in the graph.** Nothing is hardcoded. A `machine: 'plaits'` is a node of `plugin: 'plaits'`. A filter is a node. An LFO is a node. Adding a new DSP unit means adding a new plugin type, not editing a switch statement.

4. **AI is a real-time collaborator, not a bolted-on chat.** The assistant reads and writes graph state at the same level as the human. It can add nodes, connect ports, set parameters, and generate patterns — all through the command bus.

5. **Free inference first, API keys later.** Default assistant runs on free/limited inference (opencode, local Ollama). Users can bring their own Claude/OpenAI keys for production use.

## The Signal Graph

### Core Types

```js
// A node in the signal graph
SignalNode = {
  id: string,
  type: 'source' | 'processor' | 'control' | 'sink' | 'group',
  plugin: string,     // identifies the DSP implementation
  params: { [paramId]: ParamValue },
  ports: Port[],
  meta: { x, y, label?, color?, collapsed? },
}

// A typed port on a node
Port = {
  id: string,
  direction: 'in' | 'out',
  signal: 'audio' | 'control' | 'event',
  label: string,
}

// A connection between two ports
Connection = {
  id: string,
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
}

// The graph lives in state alongside the legacy model
state.signalGraph: {
  nodes: { [nodeId]: SignalNode },
  connections: Connection[],
}
```

### Signal Types

| Signal  | Description | Data Rate |
|---------|-------------|-----------|
| `audio` | Sample buffers | 128-1024 frames per block |
| `control` | Per-block values (0-1, Hz, dB) | Same rate as audio blocks |
| `event` | Note on/off, trigger, clock tick | Aperiodic |

### Node Types

| Type | Description | Examples |
|------|-------------|----------|
| `source` | Produces audio | oscillator, sample-player, noise, synth-worklet, microphone |
| `processor` | Transforms audio | filter, eq, delay, reverb, compressor, saturator, panner, bitcrusher |
| `control` | Produces modulation signals | lfo, envelope, step-seq, midi-in, clock-divider, random |
| `sink` | Consumes audio | master-out, bus, recorder, cue-out |
| `group` | Subgraph that acts as a single node | instrument-macro, fx-chain, drum-rack |

## Mapping to Existing State

The legacy state is not replaced — it is **derived from** the graph until full migration is complete.

| Legacy concept | Graph equivalent |
|---|---|
| `track.machine = 'plaits'` | `{ plugin: 'plaits', params: { engine, timbre, harmonics, morph } }` |
| `track.cutoff`, `track.resonance` | Filter node params: `{ plugin: 'biquad', params: { type, freq, Q } }` |
| `track.volume`, `track.pan` | Gain + Panner node params |
| `track.delaySend`, `track.reverbSend` | Send-level control connection → delay/reverb nodes |
| `track.eqLow/Mid/High` | 3-band EQ processor node |
| `track.bitDepth`, `track.srDiv` | Bitcrusher processor node |
| `track.groupIndex` | Connection to group bus sink |
| `state.master*` | Master output subgraph |
| `state.modMatrix` | Control signal connections |
| `state.scenes` | Scene snapshot of node params (morph targets) |
| Studio module + cables | Visual frontend for graph nodes + connections |

Migration strategy: a helper function `graphFromTracks(state) -> signalGraph` auto-generates the graph from legacy track state. A reverse helper `applyGraphToTracks(graph, state)` writes graph changes back to legacy state. This lets the graph and legacy views coexist during migration.

## Plugin System

A plugin is a registered DSP implementation identified by a string. Registration is a single call:

```js
registerPlugin('biquad', {
  ports: [
    { id: 'in', direction: 'in', signal: 'audio' },
    { id: 'out', direction: 'out', signal: 'audio' },
    { id: 'freq-mod', direction: 'in', signal: 'control' },
  ],
  params: {
    type: { default: 'lowpass', values: ['lowpass','highpass','bandpass','notch'] },
    freq: { default: 1000, min: 20, max: 20000, unit: 'Hz' },
    Q: { default: 0.707, min: 0.1, max: 20 },
  },
  create: (context) => new BiquadNode(context),
})
```

### Plugin Categories

| Category | Plugins |
|----------|---------|
| Oscillators | sine, saw, square, triangle, noise, wavetable, fm-pair |
| Synths | plaits, clouds, rings, poly-synth, acid |
| Filters | biquad, svf, moog-ladder, formant |
| EQ | 3-band-peak, parametric, graphic |
| Dynamics | compressor, limiter, gate, expander |
| Effects | delay, reverb (convolution), chorus, flanger, phaser, bitcrusher, distortion, waveshaper |
| Spatial | panner, stereo-width, crossfader |
| Modulation | lfo, adsr, ahdsr, random-step, clock-div, euclidean |
| Analysis | oscilloscope, spectrum-analyzer, peak-meter |
| I/O | master-out, bus, cue-out, recorder, mic-in, midi-in, midi-out |
| Container | group, drum-rack, fx-chain |

## AI Integration

### Architecture

```
Browser (UI + Graph State)
  │  reads/writes state via command bus
  │
  ▼
Local Proxy (server.mjs)
  │  /api/assistant/* routes
  │
  ├──► Free inference (opencode, Ollama)
  └──► Optional: OpenAI / Anthropic / MCP bridge
```

### AI Tool Surface

The AI assistant exposes tools that operate on the signal graph and sequencer state. Every tool maps to command-bus actions the UI also uses.

| Tool | Description | Affects |
|------|-------------|---------|
| `add_node` | Add a signal graph node by plugin type | graph.nodes |
| `remove_node` | Remove a node and its connections | graph.nodes, graph.connections |
| `connect_ports` | Connect two node ports | graph.connections |
| `disconnect_ports` | Remove a connection | graph.connections |
| `set_param` | Set a node parameter | node.params |
| `replace_graph` | Replace entire signal graph | graph |
| `get_graph` | Read current graph state | (read-only) |
| `get_audio_analysis` | Get spectral/level analysis | (read-only) |
| `generate_pattern` | Generate step sequence on a track | pattern steps |
| `arrange_song` | Generate arranger from description | arranger sections |
| `mix_track` | Suggest/set track mix parameters | track params |

### Free Inference Default

- **Default provider**: opencode or local Ollama (no API key needed)
- **Rate limited**: reasonable per-session limit, upgrade prompt to add key
- **Model agnostic**: same tool surface regardless of backend
- **Key upgrade path**: users add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` to env

## Audio Engine Evolution

### Phase 1 (current)
Web Audio API graph with AudioWorklet nodes (MIRANDA, plaits, clouds, rings). Hardcoded track→DSP routing in `engine.js`.

### Phase 2 (next)
Signal graph drives AudioEngine. Each graph node creates the corresponding Web Audio node. Graph connections become Web Audio connections. New plugin types register DSP implementations.

### Phase 3 (future)
Select graph subgraphs compile to WGSL compute shaders for WebGPU execution. Rust/WASM core for critical paths (voice allocation, scheduling, offline render).

## File Layout

```
src/
  state.js             ← app state + command bus + graph model
  command-bus.js       ← all commands (including graph commands)
  plugins/             ← all plugin type registrations
    biquad.js
    delay.js
    reverb.js
    plaits-worklet.js
    ...
  engine.js            ← AudioEngine (reads graph, creates AudioNodes)
  engine-graph.js      ← graph → Web Audio compiler
  cables.js            ← SVG cable UI (reads graph, draws connections)
  studio-modules.js    ← module UI (reads graph, renders nodes)
  assistant-client.js  ← AI tool surface (writes graph via command bus)
```

## Key Decisions

- **No TypeScript yet.** Plain JS until the API surface stabilizes.
- **No build step.** Static server, no bundler. Vite/Webpack added only when necessary.
- **Graph coexists with legacy state.** Migration is incremental, not a big bang.
- **AI operates at the command level.** No direct state manipulation. Same path as the UI.
- **Plugins are runtime-registered.** New DSP types don't require engine.js changes.
