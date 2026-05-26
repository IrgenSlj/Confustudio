# CONFUstudio Technical Implementation Plan

## File Map (what we're building)

```
src/
  state.js                  ← add signalGraph to AppState
  command-bus.js            ← add graph commands
  plugins/
    registry.js             ← registerPlugin(), getPlugin()
    index.js                ← imports all plugins
    biquad.js               ← filter plugin descriptor
    oscillator.js           ← tone machine
    noise.js
    sampler.js
    plaits.js
    clouds.js
    rings.js
    bitcrusher.js
    delay.js
    reverb.js
    gain.js
    panner.js
    compressor.js
    lfo.js
    envelope.js
    chorus.js
    saturator.js
    group.js
    drum-rack.js
    euclidean.js
    random.js
  engine-graph.js           ← compileGraph(), graph → Web Audio
  cables.js                 ← modify to read/write signalGraph
  studio-modules.js         ← modify to read node params from graph
  assistant-client.js       ← add MCP-style tools
  engine.js                 ← optional graph path
```

---

## Session 1: Graph Model Foundation

### 1.1 Add signalGraph to state

In `src/state.js`, add to `createAppState()`:

```js
signalGraph: createSignalGraph(),
```

Define:

```js
function createSignalGraph() {
  return {
    nodes: {},
    connections: [],
  };
}

function createSignalNode(id, plugin) {
  const desc = getPlugin(plugin);
  return {
    id,
    plugin,
    type: desc.type,
    params: Object.fromEntries(
      Object.entries(desc.params).map(([k, v]) => [k, v.default])
    ),
    ports: desc.ports.map(p => ({ ...p })),
    meta: { x: 0, y: 0, label: '', color: '', collapsed: false },
  };
}

function createConnection(fromNode, fromPort, toNode, toPort) {
  return {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromNode,
    fromPort,
    toNode,
    toPort,
  };
}
```

### 1.2 Add graph commands to command-bus.js

Register these new command types in the switch/case inside `executeStudioCommand()`:

#### `add-graph-node`
```js
case 'add-graph-node': {
  const { nodeId, plugin, meta } = command;
  const node = createSignalNode(nodeId, plugin);
  if (meta) Object.assign(node.meta, meta);
  state.signalGraph.nodes[node.id] = node;
  break;
}
```

#### `remove-graph-node`
```js
case 'remove-graph-node': {
  const { nodeId } = command;
  delete state.signalGraph.nodes[nodeId];
  state.signalGraph.connections = state.signalGraph.connections.filter(
    c => c.fromNode !== nodeId && c.toNode !== nodeId
  );
  break;
}
```

#### `connect-graph-nodes`
```js
case 'connect-graph-nodes': {
  const { fromNode, fromPort, toNode, toPort } = command;
  const conn = createConnection(fromNode, fromPort, toNode, toPort);
  state.signalGraph.connections.push(conn);
  break;
}
```

#### `disconnect-graph-nodes`
```js
case 'disconnect-graph-nodes': {
  const { connectionId } = command;
  state.signalGraph.connections = state.signalGraph.connections.filter(
    c => c.id !== connectionId
  );
  break;
}
```

#### `set-node-param`
```js
case 'set-node-param': {
  const { nodeId, param, value } = command;
  if (state.signalGraph.nodes[nodeId]) {
    state.signalGraph.nodes[nodeId].params[param] = value;
  }
  // Also update legacy track if this node corresponds to one
  applyGraphToTracks(state.signalGraph, state);
  break;
}
```

#### `replace-graph`
```js
case 'replace-graph': {
  const { graph } = command;
  state.signalGraph = JSON.parse(JSON.stringify(graph));
  applyGraphToTracks(state.signalGraph, state);
  break;
}
```

#### `get-graph` (read-only, no history entry)
```js
case 'get-graph': {
  // Returns current graph state — used by AI, not undoable
  return JSON.parse(JSON.stringify(state.signalGraph));
}
```

### 1.3 Graph ↔ legacy track bridge

These two functions live in `command-bus.js` or a new `src/state-graph-bridge.js`:

```js
// Derive graph from legacy tracks
function graphFromTracks(state) {
  const graph = createSignalGraph();
  const { project, activeBank, activePattern } = state;
  const pattern = project.banks[activeBank].patterns[activePattern];

  // Master chain
  const masterId = 'master';
  graph.nodes[masterId] = createSignalNode(masterId, 'master-out');

  // Track nodes
  pattern.kit.tracks.forEach((track, i) => {
    const trackId = `track-${i}`;
    const srcId = `${trackId}-src`;
    const filterId = `${trackId}-filter`;
    const gainId = `${trackId}-gain`;
    const panId = `${trackId}-pan`;
    const eqId = `${trackId}-eq`;

    // Source
    graph.nodes[srcId] = createSignalNode(srcId, track.machine);
    if (track.machine === 'tone') {
      graph.nodes[srcId].params.waveform = track.waveform;
    }
    graph.nodes[srcId].params.pitch = track.pitch;

    // Filter
    graph.nodes[filterId] = createSignalNode(filterId, 'biquad');
    graph.nodes[filterId].params.type = track.filterType;
    graph.nodes[filterId].params.freq = track.cutoff;
    graph.nodes[filterId].params.Q = track.resonance;

    // Gain
    graph.nodes[gainId] = createSignalNode(gainId, 'gain');
    graph.nodes[gainId].params.level = track.volume;

    // Pan
    graph.nodes[panId] = createSignalNode(panId, 'panner');
    graph.nodes[panId].params.pan = track.pan;

    // EQ
    graph.nodes[eqId] = createSignalNode(eqId, 'eq-3band');
    graph.nodes[eqId].params.low = track.eqLow;
    graph.nodes[eqId].params.mid = track.eqMid;
    graph.nodes[eqId].params.high = track.eqHigh;

    // Connect: src → filter → gain → pan → eq → master
    graph.connections.push(createConnection(srcId, 'out', filterId, 'in'));
    graph.connections.push(createConnection(filterId, 'out', gainId, 'in'));
    graph.connections.push(createConnection(gainId, 'out', panId, 'in'));
    graph.connections.push(createConnection(panId, 'out', eqId, 'in'));
    graph.connections.push(createConnection(eqId, 'out', masterId, 'in'));
  });

  return graph;
}

// Write graph changes back to legacy tracks
function applyGraphToTracks(graph, state) {
  if (!graph || !graph.nodes) return;
  const { project, activeBank, activePattern } = state;
  const pattern = project.banks[activeBank].patterns[activePattern];

  Object.entries(graph.nodes).forEach(([nodeId, node]) => {
    if (!nodeId.startsWith('track-')) return;
    const trackIndex = parseInt(nodeId.split('-')[1]);
    if (isNaN(trackIndex) || !pattern.kit.tracks[trackIndex]) return;
    const track = pattern.kit.tracks[trackIndex];

    // Derive machine from source node
    const srcId = `${nodeId.split('-').slice(0,2).join('-')}-src`;
    const srcNode = graph.nodes[srcId];
    if (srcNode) {
      track.machine = srcNode.plugin;
      if (srcNode.params.waveform) track.waveform = srcNode.params.waveform;
      if (srcNode.params.pitch) track.pitch = srcNode.params.pitch;
    }

    // Filter
    const filterId = `${nodeId.split('-').slice(0,2).join('-')}-filter`;
    const filterNode = graph.nodes[filterId];
    if (filterNode) {
      track.filterType = filterNode.params.type || track.filterType;
      track.cutoff = filterNode.params.freq || track.cutoff;
      track.resonance = filterNode.params.Q || track.resonance;
    }

    // Volume
    const gainId = `${nodeId.split('-').slice(0,2).join('-')}-gain`;
    const gainNode = graph.nodes[gainId];
    if (gainNode && gainNode.params.level !== undefined) {
      track.volume = gainNode.params.level;
    }
  });
}
```

### 1.4 Serialization

In the project package serialization (`state.js`'s `stripRuntime` and `createProjectPackage`):

```js
// Include graph in exported package
projectPackage.signalGraph = state.signalGraph;

// On import, restore graph
if (pkg.signalGraph) {
  state.signalGraph = pkg.signalGraph;
  applyGraphToTracks(state.signalGraph, state);
} else {
  // Fallback: derive graph from legacy tracks
  state.signalGraph = graphFromTracks(state);
}
```

### 1.5 Testing

Add to `tests/state.test.js`:

```js
// Graph command execution
// graphFromTracks produces correct graph from legacy state
// applyGraphToTracks writes graph changes back correctly
// Graph state round-trips through JSON (serialization)
// Graph co-exists with legacy state after add-graph-node
// Removing a node also removes its connections
// Connection type validation (audio→audio, control→control)
```

Test structure:

```js
describe('signal graph', () => {
  test('graphFromTracks creates nodes for each track', () => {});
  test('add-graph-node creates a node with correct plugin defaults', () => {});
  test('connect-graph-nodes creates a valid connection', () => {});
  test('remove-graph-node removes node and its connections', () => {});
  test('set-node-param updates param and legacy fallback', () => {});
  test('graph round-trips through JSON serialization', () => {});
  test('replace-graph replaces entire graph correctly', () => {});
});
```

### 1.6 Verification

```
npm run test:state    ← all existing + new graph tests pass
npm run lint          ← clean
npm run format        ← clean
npm start             ← app loads, legacy UI unchanged
Manual: open studio, existing patterns play correctly
```

---

## Session 2: Plugin Registry

### 2.1 registry.js

File: `src/plugins/registry.js`

```js
const _registry = {};

/**
 * @param {string} id - Unique plugin identifier (e.g., 'biquad', 'plaits')
 * @param {object} descriptor
 * @param {string} descriptor.type - 'source' | 'processor' | 'control' | 'sink' | 'group'
 * @param {string} descriptor.label - Human-readable name
 * @param {Array<{id, direction, signal, label}>>} descriptor.ports
 * @param {object} descriptor.params - { [paramId]: { default, min?, max?, values?, unit? } }
 * @param {function} [descriptor.create] - (context) => AudioNode | null (optional, for engine)
 */
export function registerPlugin(id, descriptor) {
  if (_registry[id]) {
    console.warn(`Plugin '${id}' already registered, overwriting`);
  }
  _registry[id] = { id, ...descriptor };
}

export function getPlugin(id) {
  return _registry[id] || null;
}

export function listPlugins(filter) {
  const all = Object.values(_registry);
  return filter ? all.filter(p => p.type === filter) : all;
}

export function hasPlugin(id) {
  return id in _registry;
}
```

### 2.2 Each plugin file

Pattern for every plugin file (example: `src/plugins/biquad.js`):

```js
import { registerPlugin } from './registry.js';

registerPlugin('biquad', {
  type: 'processor',
  label: 'Biquad Filter',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'freq-mod', direction: 'in', signal: 'control', label: 'Freq Mod' },
  ],
  params: {
    type: {
      default: 'lowpass',
      values: ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf'],
    },
    freq: { default: 1000, min: 20, max: 20000, unit: 'Hz' },
    Q: { default: 0.707, min: 0.1, max: 20 },
  },
});
```

Complete plugin set with param details:

| File | Plugin ID | Type | Key params |
|------|-----------|------|------------|
| `oscillator.js` | `oscillator` | source | `waveform: [sine,saw,square,triangle]`, `pitch: 0-127`, `fine: -50..+50` |
| `noise.js` | `noise` | source | `color: [white,pink,brown]`, `level: 0-1` |
| `sampler.js` | `sampler` | source | `sampleId: string`, `start/end: 0-1`, `pitch: 0-127`, `loop: bool` |
| `biquad.js` | `biquad` | processor | `type`, `freq: 20-20000`, `Q: 0.1-20` |
| `bitcrusher.js` | `bitcrusher` | processor | `bitDepth: 4-32`, `srDiv: 1-16` |
| `gain.js` | `gain` | processor | `level: 0-2`, `mute: bool` |
| `panner.js` | `panner` | processor | `pan: -1..1` |
| `compressor.js` | `compressor` | processor | `threshold: -60..0`, `ratio: 1-20`, `attack/release: 0.001-2` |
| `eq-3band.js` | `eq-3band` | processor | `low: -12..12`, `mid: -12..12`, `high: -12..12` |
| `delay.js` | `delay` | processor | `time: 0.01-2`, `feedback: 0-1`, `sync: bool`, `syncDiv: string` |
| `reverb.js` | `reverb` | processor | `mix: 0-1`, `predelay: 0-0.5`, `preset: [room,hall,plate,spring,cave,studio]` |
| `saturator.js` | `saturator` | processor | `drive: 0-1` |
| `chorus.js` | `chorus` | processor | `rate: 0.1-20`, `depth: 0-1`, `width: 0-1` |
| `lfo.js` | `lfo` | control | `rate: 0.01-50`, `shape: [sine,triangle,saw,square,s&h]`, `depth: 0-1` |
| `envelope.js` | `envelope` | control | `attack/decay/sustain/release: 0-10`, `trigger: string` |
| `master-out.js` | `master-out` | sink | `level: 0-2` |
| `bus.js` | `bus` | sink | `level: 0-2` |
| `midi-in.js` | `midi-in` | control | `channel: 1-16` |

### 2.3 index.js

```js
export { registerPlugin, getPlugin, listPlugins, hasPlugin } from './registry.js';

import './oscillator.js';
import './noise.js';
import './sampler.js';
import './biquad.js';
import './bitcrusher.js';
import './gain.js';
import './panner.js';
import './compressor.js';
import './eq-3band.js';
import './delay.js';
import './reverb.js';
import './saturator.js';
import './chorus.js';
import './lfo.js';
import './envelope.js';
import './master-out.js';
import './bus.js';
import './midi-in.js';
```

### 2.4 Verification

```js
// In tests:
import { getPlugin, listPlugins, hasPlugin } from '../src/plugins/index.js';

test('all plugins registered', () => {
  expect(listPlugins().length).toBeGreaterThan(15);
  expect(hasPlugin('biquad')).toBe(true);
  expect(getPlugin('oscillator').type).toBe('source');
  expect(getPlugin('biquad').ports.length).toBe(3);
});

// Each plugin has valid default params
listPlugins().forEach(p => {
  Object.entries(p.params).forEach(([k, v]) => {
    expect(v.default).toBeDefined();
  });
});
```

---

## Session 3: AudioEngine Reads the Graph

### 3.1 engine-graph.js

```js
import { getPlugin } from './plugins/index.js';

/**
 * Compile a signal graph into Web Audio nodes.
 * @param {object} graph - state.signalGraph
 * @param {AudioContext} ctx
 * @returns {object} { compiledNodes: Map<nodeId, AudioNode>, connectionCount }
 */
export function compileGraph(graph, ctx) {
  const compiled = new Map();
  let connectionCount = 0;

  // Phase 1: Create nodes
  Object.entries(graph.nodes).forEach(([id, node]) => {
    const plugin = getPlugin(node.plugin);
    if (!plugin) {
      console.warn(`Unknown plugin: ${node.plugin}`);
      return;
    }
    const audioNode = instantiatePlugin(plugin, node.params, ctx);
    if (audioNode) compiled.set(id, audioNode);
  });

  // Phase 2: Create connections
  graph.connections.forEach(conn => {
    const fromNode = compiled.get(conn.fromNode);
    const toNode = compiled.get(conn.toNode);
    if (!fromNode || !toNode) return;
    try {
      // Map port IDs to AudioNode indices (0 for first output, etc.)
      const fromIndex = portToOutputIndex(graph.nodes[conn.fromNode], conn.fromPort);
      const toIndex = portToInputIndex(graph.nodes[conn.toNode], conn.toPort);
      fromNode.connect(toNode, fromIndex, toIndex);
      connectionCount++;
    } catch (e) {
      console.warn(`Failed to connect ${conn.fromNode}:${conn.fromPort} → ${conn.toNode}:${conn.toPort}`, e);
    }
  });

  return { compiledNodes: compiled, connectionCount };
}

function instantiatePlugin(plugin, params, ctx) {
  // Map plugin type to Web Audio API node construction
  switch (plugin.id) {
    case 'oscillator':
      return createOscillatorNode(params, ctx);
    case 'noise':
      return createNoiseNode(ctx);
    case 'sampler':
      return createSamplerNode(params, ctx);
    case 'biquad':
      return createBiquadFilter(params, ctx);
    case 'gain':
      return createGainNode(params, ctx);
    case 'panner':
      return createStereoPanner(params, ctx);
    case 'bitcrusher':
      return createBitcrusherNode(params, ctx);
    case 'eq-3band':
      return create3BandEQ(params, ctx);
    case 'compressor':
      return createCompressor(params, ctx);
    case 'delay':
      return createDelayNode(params, ctx);
    case 'reverb':
      return createConvolutionReverb(params, ctx);
    case 'saturator':
      return createWaveShaper(params, ctx);
    case 'chorus':
      return createChorusNode(params, ctx);
    case 'master-out':
      return createGainNode({ level: params.level ?? 0.82 }, ctx);
    default:
      console.warn(`No Web Audio instantiation for ${plugin.id}`);
      return null;
  }
}
```

Each `create*` function encapsulates one Web Audio pattern. Example:

```js
function createBiquadFilter(params, ctx) {
  const filter = ctx.createBiquadFilter();
  filter.type = params.type || 'lowpass';
  filter.frequency.value = params.freq || 1000;
  filter.Q.value = params.Q || 0.707;
  return filter;
}
```

For the worklet-based plugins (plaits, clouds, rings), `instantiatePlugin` creates an `AudioWorkletNode` using the existing pattern from `engine.js`.

### 3.2 Integration with AudioEngine

In `engine.js`, add:

```js
import { compileGraph } from './engine-graph.js';

// New method
AudioEngine.prototype.compileAndConnect = function(graph) {
  if (this._graphCompilation) {
    this._teardownGraph();
  }
  const result = compileGraph(graph, this.context);
  this._graphCompilation = result;

  // Connect master to destination
  const masterNode = result.compiledNodes.get('master');
  if (masterNode) {
    masterNode.connect(this.context.destination);
  }
  return result;
};

AudioEngine.prototype._teardownGraph = function() {
  if (!this._graphCompilation) return;
  this._graphCompilation.compiledNodes.forEach(node => {
    try { node.disconnect(); } catch(e) {}
  });
  this._graphCompilation = null;
};
```

### 3.3 Test compileGraph

```js
test('compileGraph creates audio nodes', () => {
  const ctx = new OfflineAudioContext(1, 128, 44100);
  const graph = {
    nodes: {
      'osc1': { id: 'osc1', plugin: 'oscillator', params: { waveform: 'sine', pitch: 60 } },
      'master': { id: 'master', plugin: 'master-out', params: { level: 0.8 } },
    },
    connections: [
      { id: 'c1', fromNode: 'osc1', fromPort: 'out', toNode: 'master', toPort: 'in' },
    ],
  };
  const result = compileGraph(graph, ctx);
  expect(result.compiledNodes.has('osc1')).toBe(true);
  expect(result.connectionCount).toBe(1);
  ctx.close();
});
```

---

## Session 4: Cables Become Graph-Aware

### 4.1 cables.js changes

Current: cables store internal state + serialize to localStorage.

New: cables read/write `state.signalGraph.connections`.

#### On cable creation:
```js
// After SVG cable elements created, also register in graph:
const connId = `cable-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
executeStudioCommand(state, {
  type: 'connect-graph-nodes',
  fromNode: sourceModuleId,
  fromPort: sourcePort,
  toNode: destModuleId,
  toPort: destPort,
});
// Store connId on cable object for removal
cable.connectionId = connId;
```

#### On cable removal:
```js
executeStudioCommand(state, {
  type: 'disconnect-graph-nodes',
  connectionId: cable.connectionId,
});
```

#### On load (restore from localStorage):
```js
// Existing cable serialization already stores from/to module+port.
// On restore, replay through connect-graph-nodes command instead of
// directly creating SVG cables.
restoredCables.forEach(c => {
  executeStudioCommand(state, {
    type: 'connect-graph-nodes',
    fromNode: c.from.moduleId,
    fromPort: c.from.port,
    toNode: c.to.moduleId,
    toPort: c.to.port,
  });
});
allCables = state.signalGraph.connections.map(conn => {
  return createCableFromGraphConnection(conn); // new function
});
```

#### Cable → SVG sync:
```js
// New function: derive SVG cables from graph state
function syncCablesFromGraph(state) {
  // Remove stale SVG cables
  // Add new SVG cables for graph connections not yet drawn
}
```

### 4.2 Port discovery

Module port elements derive from plugin port definitions:

```js
// In studio-modules.js, when creating a module:
const plugin = getPlugin(moduleType);
if (plugin) {
  plugin.ports.forEach(port => {
    const portEl = document.createElement('div');
    portEl.className = `port port-${port.direction} port-${port.signal}`;
    portEl.dataset.port = port.id;
    portEl.title = port.label;
    moduleEl.appendChild(portEl);
  });
}
```

---

## Session 5: AI Tool Surface

### 5.1 Tool definitions

In `src/assistant-client.js`, add:

```js
const graphTools = {
  get_graph: {
    description: 'Read the current signal graph state (nodes, connections, params)',
    execute: () => JSON.parse(JSON.stringify(state.signalGraph)),
    format: () => formatGraphForLLM(state.signalGraph),
  },
  add_node: {
    description: 'Add a new node to the signal graph. Returns the nodeId.',
    params: { plugin: 'string (e.g. oscillator, biquad, lfo)', meta: 'object (optional, x/y/label)' },
    execute: ({ plugin, meta }) => {
      const nodeId = `node-${Date.now()}`;
      executeStudioCommand(state, { type: 'add-graph-node', nodeId, plugin, meta });
      return { nodeId };
    },
  },
  remove_node: {
    description: 'Remove a node and all its connections from the signal graph',
    params: { nodeId: 'string' },
    execute: ({ nodeId }) => {
      executeStudioCommand(state, { type: 'remove-graph-node', nodeId });
      return { removed: true };
    },
  },
  connect_ports: {
    description: 'Connect two ports on different nodes',
    params: { fromNode: 'string', fromPort: 'string', toNode: 'string', toPort: 'string' },
    execute: (args) => {
      executeStudioCommand(state, { type: 'connect-graph-nodes', ...args });
      return { connected: true };
    },
  },
  disconnect_ports: {
    description: 'Remove a connection by ID',
    params: { connectionId: 'string' },
    execute: ({ connectionId }) => {
      executeStudioCommand(state, { type: 'disconnect-graph-nodes', connectionId });
      return { disconnected: true };
    },
  },
  set_param: {
    description: 'Set a parameter on a graph node',
    params: { nodeId: 'string', param: 'string', value: 'number|string|boolean' },
    execute: ({ nodeId, param, value }) => {
      executeStudioCommand(state, { type: 'set-node-param', nodeId, param, value });
      return { set: true };
    },
  },
  replace_graph: {
    description: 'Replace the entire signal graph at once',
    params: { graph: 'object (full signalGraph structure)' },
    execute: ({ graph }) => {
      executeStudioCommand(state, { type: 'replace-graph', graph });
      return { replaced: true };
    },
  },
  list_plugins: {
    description: 'List all available plugin types with their ports and params',
    execute: () => {
      return listPlugins().map(p => ({
        id: p.id,
        type: p.type,
        label: p.label,
        ports: p.ports,
        params: Object.entries(p.params).map(([k, v]) => ({ id: k, ...v })),
      }));
    },
  },
};
```

### 5.2 Integration with chat

When the user sends a prompt, the assistant can return tool calls in addition to text. The `action-planning` endpoint already returns bounded commands — extend it to include graph commands.

```js
// In /api/assistant/actions/plan handler:
// Include graph tools in the system prompt for the LLM
const toolsDescription = Object.entries(graphTools).map(([name, t]) =>
  `${name}: ${t.description}` + (t.params ? ` Params: ${JSON.stringify(t.params)}` : '')
).join('\n');
```

### 5.3 Free inference provider

Set opencode/Ollama as default provider in `server.mjs`:

```js
const defaultAssistantProvider = 'ollama'; // or 'opencode'
```

If no API keys present, route to Ollama at default `http://localhost:11434`:

```js
// In resolveDefaultAssistantProvider() / buildProviderCatalog():
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  // Check if Ollama is running
  try {
    await fetch('http://localhost:11434/api/tags');
    return 'ollama';
  } catch {
    return 'opencode'; // fallback to opencode
  }
}
```

---

## Session 6: Studio Modules Become Graph Nodes

### 6.1 Module ↔ graph binding

When a module is added to the canvas:

```js
// studio-modules.js — addModule(type)
const plugin = getPlugin(type);
if (plugin) {
  const nodeId = `module-${module.id}`;
  executeStudioCommand(state, {
    type: 'add-graph-node',
    nodeId,
    plugin: type,
    meta: { x: module.x, y: module.y, label: module.id },
  });
  module.dataset.graphNodeId = nodeId;
}
```

### 6.2 Module reads params from graph

Instead of only reading from DOM elements, the module reads its node params:

```js
// In module startup/render
const nodeId = moduleEl.dataset.graphNodeId;
const node = state.signalGraph.nodes[nodeId];
if (node) {
  // Apply node params to UI controls
  Object.entries(node.params).forEach(([param, value]) => {
    const control = moduleEl.querySelector(`[data-param="${param}"]`);
    if (control) setControlValue(control, value);
  });
}
```

### 6.3 UI controls write to graph

When a user tweaks a knob/fader:

```js
// Instead of directly mutating state, go through graph:
executeStudioCommand(state, {
  type: 'set-node-param',
  nodeId: moduleEl.dataset.graphNodeId,
  param: control.dataset.param,
  value: newValue,
});
```

### 6.4 Layout serialization

Layout persistence reads from `node.meta` instead of a separate localStorage key:

```js
// serializeLayout()
const layout = Object.values(state.signalGraph.nodes)
  .filter(n => n.meta.x !== undefined)
  .map(n => ({
    id: n.meta.label || n.id,
    type: n.plugin,
    left: n.meta.x,
    top: n.meta.y,
    zoom: n.meta.zoom || 1,
    moduleState: serializeModuleParams(n),
  }));
```

---

## Session 7: Plugin Power-Ups

### 7.1 group.js — subgraph container

```js
registerPlugin('group', {
  type: 'group',
  label: 'Group (Subgraph)',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio', label: 'In' },
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'cv-in', direction: 'in', signal: 'control', label: 'CV In' },
  ],
  params: {
    name: { default: 'Group' },
    color: { default: '#4488ff' },
  },
  // group nodes contain an internal subgraph:
  // node.internalGraph: { nodes, connections }
});
```

### 7.2 drum-rack.js

```js
registerPlugin('drum-rack', {
  type: 'source',
  label: 'Drum Rack',
  ports: [
    { id: 'out', direction: 'out', signal: 'audio', label: 'Out' },
    { id: 'trigger', direction: 'in', signal: 'event', label: 'Trigger' },
    { id: 'accent', direction: 'in', signal: 'control', label: 'Accent' },
  ],
  params: {
    voices: { default: 6, min: 1, max: 16 },
    // Each voice has its own params:
    // voice0_type, voice0_params, voice0_level, ...
  },
});
```

### 7.3 euclidean.js

```js
registerPlugin('euclidean', {
  type: 'control',
  label: 'Euclidean Sequencer',
  ports: [
    { id: 'trigger', direction: 'out', signal: 'event', label: 'Trigger' },
    { id: 'reset', direction: 'in', signal: 'event', label: 'Reset' },
    { id: 'gate', direction: 'out', signal: 'control', label: 'Gate' },
    { id: 'accent', direction: 'out', signal: 'control', label: 'Accent' },
  ],
  params: {
    steps: { default: 16, min: 1, max: 64 },
    beats: { default: 5, min: 1, max: 64 },
    rotation: { default: 0, min: 0, max: 64 },
  },
});
```

### 7.4 random.js

```js
registerPlugin('random', {
  type: 'control',
  label: 'Random / S&H',
  ports: [
    { id: 'out', direction: 'out', signal: 'control', label: 'Out' },
    { id: 'trigger', direction: 'in', signal: 'event', label: 'Trigger' },
    { id: 'clock', direction: 'in', signal: 'event', label: 'Clock' },
  ],
  params: {
    rate: { default: 1, min: 0.01, max: 100, unit: 'Hz' },
    smooth: { default: 0, min: 0, max: 1 },
    min: { default: 0, min: 0, max: 1 },
    max: { default: 1, min: 0, max: 1 },
  },
});
```

---

## Session 8: Cleanup & Hardening

### 8.1 Legacy delay removal

- Find all references to the two delay paths in `engine.js`
- Remove the old `delayFeedback` path, keep `delaySendBus → delayNode → delayFilter → delayFeedback2 → delayNode`
- Update any survivors to the single path

### 8.2 Global namespace consolidation

```js
// Replace all window._* with:
window.__CONFUSTUDIO__ = window.__CONFUSTUDIO__ || {};

// Migration pattern:
// Before: window._engine, window._audioContext, window._state
// After:  window.__CONFUSTUDIO__.engine, window.__CONFUSTUDIO__.audioContext, etc.
```

Search for all `window._` assignments and consolidate:

```js
// Single file to define all globals:
// src/namespace.js
export function initGlobals(state) {
  window.__CONFUSTUDIO__ = {
    state,
    engine: null,
    audioContext: null,
    commands: executeStudioCommand,
    // ... etc
  };
}
```

### 8.3 Magic string extraction

```js
// src/STATE_PATHS.js
export const PATHS = {
  BPM: 'bpm',
  SWING: 'swing',
  MASTER_LEVEL: 'masterLevel',
  CUE_LEVEL: 'cueLevel',
  ACTIVE_BANK: 'activeBank',
  ACTIVE_PATTERN: 'activePattern',
  SELECTED_TRACK: 'selectedTrackIndex',
  CROSSFADER: 'crossfader',
  PATTERN_LENGTH: 'patternLength',
  EUCLID_BEATS: 'euclidBeats',
  DELAY_TIME: 'delayTime',
  DELAY_FEEDBACK: 'delayFeedback',
  REVERB_MIX: 'convReverbMix',
  // ... every magic string used in state access
};

// src/EVENTS.js
export const EVENTS = {
  STEP_TOGGLE: 'step:toggle',
  TRANSPORT_START: 'transport:start',
  TRANSPORT_STOP: 'transport:stop',
  PATTERN_CHANGED: 'pattern:changed',
  BANK_CHANGED: 'bank:changed',
  TRACK_SELECTED: 'track:selected',
  GRAPH_CHANGED: 'graph:changed',
  // ... every event string used in emit()
};
```

---

## Session 9: Latent Primitive Prep (Future)

### 9.1 Research targets

Before coding, answer:
- What is the browser ONNX inference latency for MimiCodec (encode + decode on a 1s audio clip)?
- Can ONNX runtime run in an AudioWorklet? (Probably not — Worker thread instead.)
- What is the token rate (12.5 Hz = one 128-dim vector every 80ms)?
- How does latent interpolation sound (linear → crossfade → slerp)?

### 9.2 Design: `latent` signal type

```js
// New port signal type:
{ id: 'latent-out', direction: 'out', signal: 'latent', label: 'Latent' }
// A latent wire carries Float32Array(128) at 12.5 Hz
// (Or whatever the codec's frame size is)
```

### 9.3 Design: Encode/Decode nodes

```js
registerPlugin('neural-encode', {
  type: 'processor',
  label: 'Neural Encode (audio → latent)',
  ports: [
    { id: 'in', direction: 'in', signal: 'audio' },
    { id: 'out', direction: 'out', signal: 'latent' },
  ],
  params: {
    codec: { default: 'mimi', values: ['mimi', 'dac'] },
    codebooks: { default: 8, min: 1, max: 32 },
  },
});

registerPlugin('neural-decode', {
  type: 'processor',
  label: 'Neural Decode (latent → audio)',
  ports: [
    { id: 'in', direction: 'in', signal: 'latent' },
    { id: 'out', direction: 'out', signal: 'audio' },
  ],
  params: {
    codec: { default: 'mimi', values: ['mimi', 'dac'] },
  },
});
```

### 9.4 Design: Project file evolution

```json
{
  "format": "confustudio-project-package",
  "version": "3.0.0",
  "signalGraph": { "nodes": {}, "connections": [] },
  "latentPool": {
    "clip-1": { "frames": 150, "codebook": 8, "tokens": [[Int32Array]] },
    "clip-2": { "frames": 300, "codebook": 8, "tokens": [[Int32Array]] }
  }
}
```

The project file becomes: a DSP program (signal graph) + a latent token pool (encoded audio data). Traditional sample data is an optional fallback.

---

## Implementation Order

### Priority 1 — Foundation (Sessions 1-3)
Graph model, plugin registry, engine integration. These unlock everything else.

### Priority 2 — Integration (Sessions 4-6)
Cables, AI tools, modules become graph-aware. The AI can now manipulate the actual audio graph.

### Priority 3 — Polish (Session 7-8)
New plugin types, cleanup, debt reduction.

### Priority 4 — Future (Session 9)
Neural codec research, latent type design.

---

## Key Design Rules

1. **No breaking tests.** Every session preserves existing functionality. The graph coexists with legacy state.
2. **Commands are the single mutation path.** UI, AI, and internal code all call `executeStudioCommand`.
3. **Plugins are runtime-registered strings.** No switch statements on plugin type in engine code.
4. **Graph is serializable.** `JSON.stringify(state.signalGraph)` round-trips perfectly.
5. **Default params live in the plugin descriptor.** Not scattered across create functions.
6. **AI uses the same commands as the UI.** No special AI-only mutation paths.
