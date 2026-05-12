# Next Session

## Current Baseline (May 2026)

All tests green:
- `npm run test:syntax` — 136 files, ok
- `npm run test:state` — command bus + state round-trip, ok
- `npm run test:server` — all API routes, ok
- `npm run test:ui-smoke` — Playwright module/cable/layout/interaction coverage, ok

Server starts clean on `http://127.0.0.1:4173`.

## Codebase Metrics

| Metric | Value |
|---|---|---|
| Total JS/ESM lines | ~28,965 |
| Files over 1000 lines | 8 |
| Largest file | `app.js` (3663) |
| `window._*` globals | 84 across 15 files |
| Dead code | removed |
| Dual reverb impls | collapsed — convolution only |
| Legacy delay routing | still present |
| Test suites | 4 (syntax, state, server, ui-smoke) |
| ESLint/Prettier | configured |

## Architecture Assessment

**Strengths:**
- Working audio engine with voice stealing, sidechain, per-track FX, MIDI I/O
- Command bus with undo/redo history (100-deep)
- Modular studio canvas with cable routing, persistence, module picker
- Server-side assistant bridge (OpenAI, Anthropic, Ollama, local)
- Project package import/export with schema versioning
- State forward-fill on load (handles schema drift)
- AudioWorklet support (resampler, bitcrusher, plaits, clouds, rings)
- ESLint + Prettier tooling for consistent code

**Frictions (ranked by time wasted per change):**
1. 8 files over 1000 lines — improved from 12, but largest files still unwieldy
2. CSS injected via JS strings in every page module — can't inspect in DevTools, no autocomplete
3. 84 `window._*` globals — implicit coupling, no import graph
4. Ad-hoc state mutation bypasses the command/history layer in most page modules
5. Legacy delay routing — two delay paths (send/return + legacy); every delay change may need dual edits
6. Magic strings everywhere (`state.crossfader`, `emit('step:toggle')`...) — rename breaks silently

## Development Roadmap

### Phase 0: Tooling & Housekeeping (completed)
```
Goal: Reduce friction per edit. Zero behavior changes.
```
- ESLint + Prettier configured with `eslint.config.js` and `.prettierrc`
- Dead code `readBody()` removed from `server.mjs`
- `.gitignore` tightened — added `.env*`, `*.log`, `.vscode/`
- ESLint autofix run; fixed `root` is not defined error in `settings.js`

### Phase 1: Mechanical Splits (completed)
```
Goal: Reduce cognitive load. Every file under 1200 lines. Pure extraction.
```
- 6 largest files split — extracted 11 new modules
- Total JS lines reduced from ~34,258 to ~29,178
- Files over 1000 lines reduced from 12 to 8
- No logic changes. Pure extraction.

### Phase 2: Unify Mutation & Clean State (in progress)
```
Goal: Single authoritative path for all state mutations.
Estimate: 2–4 hours remaining
```

1. ~~Collapse to single reverb path (keep convolution, remove Freeverb graph)~~ ✓
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
