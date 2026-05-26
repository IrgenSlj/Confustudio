# Next Session

## Current Baseline

`npm test` exits 0 — now runs **`lint` first**, then `syntax · state · server · ui-smoke`.
Server starts clean on `http://127.0.0.1:4173`.

Work is on branch **`fix/signal-graph-runtime-bugs`** → **PR #1**
(https://github.com/IrgenSlj/Confustudio/pull/1). Not yet merged to `main`.
`main` does NOT have these fixes/features yet.

## Session 9 — runtime fixes, design system, robustness (2026-05-26)

Shipped on the branch above (each commit verified in a real browser, 0 console errors):

1. **Fixed 3 signal-graph runtime crashes** that passed the test suite but broke the
   modular feature in-browser: `saveState` not imported in `command-bus.js`; `showToast`
   undefined in `dsp-module.js` (now `window.showToast`); `../` dynamic-import paths in
   `studio-modules.js` resolving to the site root (404) — DSP graph-node creation had been
   failing silently.
2. **Finished module position persistence** — `meta.x/y` is seeded at creation and read
   back; `rebuildModulesFromGraph()` (studio-modules.js) recreates modules/cables from
   `state.signalGraph`; preset load now rebuilds the canvas instead of going stale.
3. **Design system adopted from the Claude Design handoff** — `src/css/tokens.css` (the
   canonical 68-token chassis system), `@import`ed first in `styles.css`, purely additive
   with compat aliases (`--radius-*`, `--space-*`, `--fs-*`, `--shadow-*`, etc.). New
   `light` theme. `docs/design-guide.md`.
4. **Mixer** — VU meters use design tokens (theme-aware); **real per-group metering** via
   AnalyserNode taps on the 8 persistent group buses (`engine.getGroupLevel(i)`).
5. **Studio** — DSP modules adopt tokens (on-brand, theme-aware); cables colour by signal
   type (audio=white, control=cyan, event=amber) from `port.signal`.
6. **Robustness** (this wind-down): SW cache version → `confustudio-v4` (static name was
   the stale-shell cause; bump per release); per-item try/catch in `restoreLayout` so one
   bad saved module can't blank the canvas; recovery hatches
   `window.__CONFUSTUDIO__.resetWorkspace()` / `hardReset()` + **Reset workspace / Hard
   reset buttons in SET → WORKSPACE**.

## ⚠ OPEN — diagnose before building more

User reported the running app looked like an "unusable mess": blank PATTERN page at 100%,
blank green modules in the studio canvas at 25% zoom. **Could not reproduce from a clean
profile** (clean load + returning-user session both render fully, 0 errors). Strongly
points to **stale service-worker cache and/or corrupt persisted `localStorage`** specific
to that browser, not the code.

**Next session, first thing:** confirm with the user — does it work in an **Incognito
window**? If yes → it was stale cache/state (the v4 SW bump + Reset workspace should fix
it; have them Hard reset once). If it's still broken in Incognito → it's a code path the
repros missed; get the **DevTools Console error** and trace from there.

Manual browser regression checks (run with `node`, not in `npm test`):
`tests/verify-graph.mjs`, `tests/verify-theme.mjs`.

## Highest-value next work (from the design handoff `confusynth-ui-ux` bundle)

Integration-guide order, after the open issue is cleared:
Step 2 chassis chrome (`chassis.css`/`chassis.js`) → Step 3 pattern page → Step 4 mixer
page → Step 5 component CSS → Step 6 studio-canvas refactor. Also still pending from the
"good test" punch list: verify the full **make-a-track loop** end-to-end, and decide on
the **stubbed worklet voices** (plaits/clouds/rings/sampler) + one real **AI action**.

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

### Session 8

Options:
- **Claude Design integration** — implement the design deliverables from `docs/CLAUDE_DESIGN_BRIEF.md`
- **Cable port routing** — route signal graph connections through specific module ports (not just module-to-module)
- **MIDI learn for DSP params** — assign MIDI CCs to signal graph node parameters
- **Graph presets** — save/load signal graph configurations

## Decision Log

- **No TypeScript**: Would touch every file, break the build, minimal value before API surface stabilizes
- **No state management library**: Command bus exists and works
- **Graph coexists with legacy state**: Migration is incremental
- **AI operates at the command level**: No direct state manipulation
- **Two graph concepts**: Command-history DAG (`_signalGraph`, runtime-only) for edit tracking; Audio routing graph (future `signalGraph`, serializable) for DSP routing
