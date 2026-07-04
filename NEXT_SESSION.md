# NEXT SESSION — Confustudio (new-brief direction)

**Branch:** `feat/phase0-type-boundary` (off `main`). Open a PR when ready; `main` is the merge target.
**North-star specs (in-repo):** `docs/CONFUSTUDIO_CODE_BRIEF.md` (phasing/engine/SDK), `docs/CONFUSTUDIO_AI_BRIEF.md` (harness — authoritative), `docs/CONFUSTUDIO_DESIGN_BRIEF.md`, `docs/STUDIO_MANUAL.md` (human + agent knowledge, M-13 keep-true contract).
**Thesis (locked):** a modular techno/house studio + one agent harness that works in **parameters & performances, never rendered audio**. Branches, not mutations. Perception-gated. Hierarchy: **engine quality > ease of use > advanced features**.

---

## Phase status board

| Phase | State |
|---|---|
| **0 Stabilize** | 0.1 done (PR #1 merged long ago). 0.2 done (`docs/POSTMORTEM_STALE_CACHE.md` — not-reproducible-mitigated; SW `confustudio-v4`, network-first shell, reset hatches). 0.3 done (checked-JSDoc boundary + `test:types`). 0.5 already done (constants.js). **0.4 (window._* → `__CONFUSTUDIO__` consolidation) still open.** |
| **A Engine floor** | Not started except recon. A1 sampler recon done (below). A2 audio-quality harness = the gate for A1 — build it first. |
| **B Harness** | B6 CS-Score parser landed (pure kernel). Loop/tools/branches/traces not started. |
| **C Perception** | Not started (needs offline render via OfflineAudioContext — Playwright path). |
| **D/E/F** | Not started. |

**Design integration (Claude Design v2.0):** tokens (already canonical) ✔ · component layer `src/css/components.css` (.btn/.chip/.t-*) ✔ · specs mirrored in `docs/design-system/` ✔ · **chassis, PATTERN, MIXER pages, Director rail, perception meters = NOT done** (the visible work).

---

## What shipped this session

1. Landed all four north-star briefs + STUDIO_MANUAL in `docs/` (source files had vanished from disk — these are now the only copies).
2. **Phase 0.2** — stale-cache postmortem.
3. **Phase 0.3** — type boundary: `jsconfig.json` (checkJs) over `src/kernel`, `command-bus.js`, `state.js`, `plugins/*`; `src/kernel/types.js` typedefs; `src/globals.d.ts`; `test:types` (tsc) wired into `npm test`. Fixed 3 latent gotchas (em-dashes after bracketed JSDoc `@param` tripped TS1127).
4. **Design** — `src/css/components.css` (.btn/.chip/.t-* — additive, zero collision) + `docs/design-system/{module-chassis-spec,integration-guide}.md`.
5. **B6 CS-Score** — `src/kernel/score.js` + `tests/score-roundtrip.mjs` + `docs/CS_SCORE.md` (committed, green).
6. **Phase C seeds** — `src/kernel/loudness.js` (BS.1770 LUFS, `test:perception`) + `src/kernel/spectrum.js` (6-band energies, `test:spectrum`), both pure + unit-tested.
7. **Mixer master loudness panel** — real momentary/short-term/integrated LUFS + peak dBFS in the design 7-seg style (contained to `mixer.js`, augment-not-replace). Masking honestly deferred to Phase C.
8. **Repo hygiene** — `docs/ROADMAP.md` (the live plan), README rewrite for the new direction, pruned obsolete docs/artifacts.

## OPEN ITEMS

- No open blockers. Branch is green (lint · types · syntax · kernel · score · perception · spectrum · state · server · ui-smoke) and pushed (PR #3).
- Next work + full status: see **`docs/ROADMAP.md`** → "Immediate next actions". Top item: wire `src/kernel/spectrum.js` into the mixer as the labeled 6-band spectrum (UI-only, contained).
- A running dev server may be up at http://localhost:4173 (hard-reload past the service worker).

---

## A1 sampler recon (the brief's assumption is partly wrong)

- The kernel `createStepTriggerEvent` (`src/kernel/event-compiler.js`) is **NOT wired into the live scheduler**. Live path: `src/app.js:2150 tick()` → `src/engine.js:716 triggerTrack()`. (Wiring the scheduler onto kernel events is its own task — needed for Phase C offline-render fidelity + Phase E quantized launch.)
- The **track-engine `'sample'` machine already works** (`engine.js:1206-1308`): real AudioBuffer playback via `cs-resampler`, with start/end, loop, pitch. The **actual stub** is the ModularEngine sampler node (`engine-graph.js:519`, plays a default sine).
- A1 missing pieces + insertion points: reverse-on-trigger (`resampler-worklet.js` negative increment; `engine.js:1250`), choke groups (`engine.js:716` + `_registerVoice` 672, model after `drum_machine.js:527`), gate/one-shot (send worklet `stop` at when+gate, `engine.js:1266`), slice-by-plock (`sampleStart` already read at `engine.js:1208`; add to `pattern-tools.js:116` PLOCK_PARAMS + resolve `sampleSlices`), decouple pitch p-lock from `keyTracking` (`engine.js:1217`), `sampleId→buffer` resolver (none) if un-stubbing `engine-graph.js:519`.
- **D-N16:** Phase B may proceed once sampler + one synth voice pass the audio-quality harness. Build `tests/audio-quality.mjs` (A2) FIRST so sampler changes are measured. Audio regressions are invisible to `npm test` — do NOT delegate audio edits blind.

## Design integration — next visible wins (ordered)

Use `system-canvas.css` + `system-canvas.js` (the **production** component library; fetch via DesignSync) for NEW surfaces; adapt for existing pages carefully (`.knob`/`.step`/`.fader` collide — scope them). Order from `docs/design-system/integration-guide.md`:
1. **MIXER page** (biggest, cleanest upgrade): vertical faders + VU meters (peak colours) + master LUFS 7-seg + spectrum + masking heat + lint tags. `src/pages/mixer.js` + `src/css/mixer.css`. Wire meters to the real AnalyserNode levels (design JS uses fake data). Current mixer has an empty "MASTER SPECTRUM".
2. **PATTERN page** refinements: STEP DETAIL in-place editor (hold step), trig-condition glyph rack.
3. Chassis chrome polish, then Director rail + proposal cards + ghost/diff (Phase B), perception meters (Phase C), live skin (Phase E).

## Working with the design project (DesignSync)

- **MAIN-CONTEXT ONLY** — subagents can't call it. Fetch each file yourself: `DesignSync {method:'get_file', projectId:'0a865dfd-ed0d-407e-9c59-a80f2b4a781e', path}`. `list_files` for the manifest.
- Not yet mirrored in-repo: `system-canvas.css/js`, `chassis.css/js`, `pattern.css/js`, `mixer.css/js`, page HTMLs, `Confustudio System.html`, `design-guide.md` (v2), `studio-canvas-redesign.md`.

## Verification (tests can't see rendering — this has bitten before)

`npm test` green ≠ working app. Screenshot-verify every visual change in a real browser. Reusable script in scratch (`shoot.mjs`, modelled on `tests/ui-smoke.mjs`): boots `server.mjs`, clears SW/localStorage, navigates `.page-tabs button[data-page="…"]`, screenshots, collects `pageerror`/console errors. Playwright resolves from repo `node_modules` → run from inside the repo (copy in, run, `rm`). Baselines captured this session.

## Test suite

`npm test` = lint · **types (tsc)** · syntax · kernel · **score** · state · server · ui-smoke. Add per brief §7: `test:audio-quality` (A2), `test:harness` (B), `test:perception` (C). TypeScript is a dev dep now.

## Discipline

Small verified increments, commit + push each. Update this file every session. Phase acceptance gates are blocking.
