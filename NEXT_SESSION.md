# Next Session

## Verified Baseline (May 2026)

All tests green:
- `npm run test:syntax` — 125 files, ok
- `npm run test:state` — command bus + state round-trip, ok
- `npm run test:server` — all API routes, ok
- `npm run test:ui-smoke` — Playwright module/cable/layout/interaction coverage, ok

Server starts clean on `http://127.0.0.1:4173`.

## Codebase Metrics

| Metric | Value |
|---|---|
| Total JS/ESM lines | 34,258 |
| Files over 1000 lines | 12 |
| Largest file | `app.js` (3880) |
| `window._*` globals | 84 across 15 files |
| Dead code | `readBody()` in `server.mjs:681` |
| Dual reverb impls | Freeverb + convolution (both connected) |
| Test suites | 4 (syntax, state, server, ui-smoke) |

## Architecture Assessment

**Strengths:**
- Working audio engine with voice stealing, sidechain, per-track FX, MIDI I/O
- Command bus with undo/redo history (100-deep)
- Modular studio canvas with cable routing, persistence, module picker
- Server-side assistant bridge (OpenAI, Anthropic, Ollama, local)
- Project package import/export with schema versioning
- State forward-fill on load (handles schema drift)
- AudioWorklet support (resampler, bitcrusher, plaits, clouds, rings)

**Frictions (ranked by time wasted per change):**
1. 12 files over 1000 lines — can't hold any page module in working memory
2. CSS injected via JS strings in every page module — can't inspect in DevTools, no autocomplete
3. 84 `window._*` globals — implicit coupling, no import graph
4. Ad-hoc state mutation bypasses the command/history layer in most page modules
5. Dual reverb implementations — every reverb change touches two systems
6. No ESLint/Prettier — inconsistent formatting, unused variables slip through
7. Magic strings everywhere (`state.crossfader`, `emit('step:toggle')`...) — rename breaks silently

## Development Roadmap

### Phase 0: Tooling & Housekeeping (this sprint)
```
Goal: Reduce friction per edit. Zero behavior changes.
Estimate: 3-4 hours
```

1. Add ESLint + Prettier (`npm init @eslint/config`, `.prettierrc`)
2. Remove dead code (`readBody()` in `server.mjs:681`)
3. Tighten `.gitignore` — add `.env*`, `*.log`, `.vscode/`
4. Run ESLint autofix across the tree

### Phase 1: Mechanical Splits (this sprint)
```
Goal: Reduce cognitive load. Every file under 1200 lines. Pure extraction.
Estimate: 6-8 hours
```

| Current | Split into |
|---|---|
| `app.js` (3880) | `app.js` + `recorder.js` + `history-ui.js` |
| `engine.js` (1971) | `engine.js` + `engine-reverb.js` + `engine-midi.js` |
| `settings.js` (2418) | `settings.js` + `settings-midi.js` + `settings-project.js` |
| `pattern.js` (2226) | `pattern.js` + `pattern-tools.js` |
| `studio.js` (1603) | `studio.js` + `studio-modules.js` + `studio-overlay.js` |
| `sound.js` (2016) | `sound.js` + `sound-sample.js` |

No logic changes. No new features. File references via existing import paths only.

### Phase 2: Unify Mutation & Clean State (next sprint)
```
Goal: Single authoritative path for all state mutations.
Estimate: 4-6 hours
```

1. Collapse to single reverb path (keep convolution, remove Freeverb graph)
2. Extract magic strings to constants (`STATE_PATHS.js`, `EVENTS.js`)
3. Consolidate `window._*` globals into a single `__CONFUSTUDIO__` namespace object
4. Fix legacy delay routing (two delay paths; keep send/return, remove legacy)
5. Add command types for step/selection operations (migration prep)

### Phase 3: Persistence (next sprint)
```
Goal: Save/restore everything — not just layout.
Estimate: 6-8 hours
```

1. Define module state serialization contract for dynamic modules (djmixer, polysynth, etc.)
2. Add save/restore hooks → include module param state in project package
3. Deep migration of `pattern.js` step editor, selection tools, random fill, morph to command bus
4. Normalize remaining direct mutation in settings page to command/history layer

### Phase 4: Feature Delivery (next)
```
Goal: Visible user-facing capabilities.
Estimate: ongoing
```

1. In-app assistant action preview/apply flow on top of `/api/assistant/actions/plan`
2. Integrate `node-abletonlink` for real Ableton Link tempo sync
3. Asset packaging — exported projects carry sample-backed and module-backed state
4. Mobile/responsive pass for compact picker, transport keyboard, overlays
5. Rust/WASM DSP core for sequencing and voice allocation (long-term)

## Decision Log

- **No TypeScript**: Would touch every file, break the build, minimal value before API surface stabilizes
- **No Vite**: Current static file server is zero-config, zero-build. Adding a build step now is premature optimization
- **No state management library**: Command bus exists and works. Replace it when proven insufficient, not before
- **No comprehensive test coverage**: Test critical paths + regression anchors. 100% coverage on a rapidly changing prototype wastes velocity
- **Skip full undo migration**: Defer perfect undo to v2. Formalize direct mutation patterns for simple operations instead of blocking on architecture purity
