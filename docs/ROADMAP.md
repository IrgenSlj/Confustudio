# CONFUstudio — Roadmap (live status tracker)

The authoritative checklist of remaining work. The **why/what** lives in the briefs
(`docs/CONFUSTUDIO_CODE_BRIEF.md`, `docs/CONFUSTUDIO_AI_BRIEF.md`,
`docs/CONFUSTUDIO_DESIGN_BRIEF.md`, `docs/STUDIO_MANUAL.md`); this file tracks **status**.
Phase gates are **blocking** — don't start a phase before the previous one's acceptance checks pass.
Session handoff detail lives in `NEXT_SESSION.md`.

**Thesis (locked):** a modular techno/house studio + one agent harness that works in
**parameters & performances, never rendered audio**. Branches not mutations · perception-gated ·
guardrails in the tool registry · hierarchy **engine quality > ease of use > advanced features**.

Legend: `[x]` done · `[~]` in progress / partial · `[ ]` not started.

---

## Phase 0 — Stabilize (prerequisite)

- [x] 0.1 PR #1 merged to `main` (long done).
- [x] 0.2 Stale-cache "unusable mess" postmortem → `docs/POSTMORTEM_STALE_CACHE.md` (not-reproducible-mitigated).
- [x] 0.3 Type the boundary — `jsconfig.json` checkJs over kernel/command-bus/state/plugins; `src/kernel/types.js`; `src/globals.d.ts`; `test:types` in CI.
- [x] 0.5 Magic strings → `constants.js` (`EVENTS`, `STATE_PATHS`) — already present.
- [ ] **0.4 Consolidate the `window._*` globals into `__CONFUSTUDIO__`** (84 globals, partial). `src/globals.d.ts` already declares the namespace. Do incrementally; screenshot-verify each batch.
- [ ] 0.acceptance: zero console errors on clean boot **and** returning-user boot (add to `ui-smoke`).

## Phase A — Engine to professional quality + Module SDK v1 (the floor)

- [~] **A2 audio-quality harness** — `tests/audio-quality.mjs`: offline-render each plugin's reference patch (OfflineAudioContext via Playwright), assert no NaN / no DC > −60 dB / no clip / expected RMS. **Build this FIRST** — it's the gate that makes A1 measurable. (Loudness math seed done: `src/kernel/loudness.js` + `test:perception`.)
- [ ] **A1 sampler un-stub** (D-N8, first). Track `'sample'` machine already plays real buffers (`engine.js:1206`). Add: reverse-on-trigger (`resampler-worklet.js` negative increment), choke groups (`engine.js:716` + `_registerVoice`), gate/one-shot modes, slice-by-plock (`sampleStart` p-lock → `pattern-tools.js` PLOCK_PARAMS + `sampleSlices`), decouple pitch p-lock from `keyTracking`. Un-stub the ModularEngine sampler node (`engine-graph.js:519`) + a `sampleId→buffer` resolver.
- [ ] A1b un-stub Plaits/Clouds/Rings worklet voices (currently test-tone stubs in `engine-graph.js`).
- [ ] A2 voice-quality pass (all instruments): 1–5 ms declick, `setTargetAtTime` smoothing (no zipper), denormal protection in worklets, 2× oversampling on nonlinear stages, −12 dBFS headroom convention + master limiter.
- [ ] **A3 flagship voices** (original names TBD w/ Design): CS-DRUM (sampler groovebox), CS-ACID (evolve `acid_machine.js`; add `slide` to the kernel step event + portamento), CS-LADDER (evolve `monosynth.js`; 4-pole ladder worklet), CS-POLY (evolve `polysynth.js`; upgrade chorus). Each ships 8–16 original presets.
- [ ] **A4 Module SDK v1** — formalize the registry descriptor + `dsp-module.js` chassis into a documented contract; add `unit`/`curve`/`smooth` param fields; extend module-state serialization to all modules; `docs/MODULE_SDK.md` tutorial; load third-party modules from a local folder/URL manifest.
- [ ] **A5 MIDI chapter** — MIDI in (note + generic CC-learn from A4 metadata), out, **thru**, clock-in (sync-to-external), transport messages, per-track channel routing.
- [ ] A.acceptance: all 21+ plugins compile un-stubbed; audio-quality harness green; a fresh session builds one third-party demo module from `MODULE_SDK.md` with no core edits; MIDI in/out/thru verified on hardware.

## Phase B — Harness core + branch auditioning (the signature)

> Spec: `CONFUSTUDIO_AI_BRIEF.md` §1–4,6,8. Gate (D-N16): may start once sampler + one synth voice pass the audio-quality harness.

- [x] **B6 CS-Score** parser/emitter — `src/kernel/score.js` + `tests/score-roundtrip.mjs` + `docs/CS_SCORE.md` (pure). _Remaining:_ command-compilation layer (`score.write` compiles to command-bus ops on the active branch).
- [x] **B1 Tool registry** (`src/harness/tools/`) — 17 tools compiling to real command-bus commands (no private path, 247-check `test:harness`); pure zero-dep JSON-Schema validator; station allowlists + per-param clamping guardrails; Anthropic/OpenAI adapters. _Remaining:_ regenerate `docs/confustudio.manual.json` from `buildManualToolSurface()`.
- [ ] B2 Agent loop — extract `src/harness/loop.mjs` from `server.mjs`: provider-agnostic tool-calling state machine (IDLE→PLAN→ACT→VERIFY→PRESENT) with budgets; SSE stream to the client; single tool-call IR + per-provider adapters + mock provider.
- [ ] B3 Branch lifecycle — formalize `branch.open/audition/merge/discard` over the existing DAG branching; persist a `branches` compartment so proposals survive reload.
- [ ] B4 In-app **Director rail** + proposal cards (chat, station switch, activity log, audition/merge/discard) — replaces the fire-and-forget `actions/plan` path. (Design: S4.)
- [ ] B5 Traces — per-run artifact (context digest, turns, tool calls, budgets, disposition, prompt snapshot); rail activity log is a live view.
- [ ] B.acceptance: end-to-end demo — "broken-beat 16-step on T3 + darken the acid patch" → branch via `score.write`, A/B audition, clean merge, undo across merge; trace replays the decision path.

## Phase C — Perception (the differentiator)

> Spec: `CONFUSTUDIO_AI_BRIEF.md` §5.

- [x] Loudness math — `src/kernel/loudness.js` (BS.1770 K-weighting → momentary/short-term/**integrated** LUFS) + `test:perception`. Wired to the **mixer master meter** (M/S/I + peak dBFS, realtime).
- [x] Band energies (C2 seed) — `src/kernel/spectrum.js` (6-band aggregation, shared vocabulary) + `test:spectrum`. Pure. _Not yet wired into the mixer spectrum UI._
- [ ] C1 Offline render tool — `render({bars,tracks?,fromBar?})` via OfflineAudioContext through the **same `compile()` path** as realtime (D-N15); per-track stem rendering.
- [ ] C2 Feature extraction (`src/harness/perception/`) — reuse loudness.js + spectrum.js; add true-peak, crest, spectral centroid/rolloff, onset density, per-track pairwise band-overlap (masking).
- [ ] C3 Musical lint — rules over model+features: `sub-collision`, `mud-250-500`, `clipping`, `over-limited`, `key-violation`, `level-staging`, `silent-track-routed` → `PerceptionReport`.
- [ ] C4 Close the loop — VERIFY stage: after mutating, `render`+`measure`+`lint` before presenting; one self-correction on `warn+`; `compare(a,b)` verdicts; honesty rule (claims cite measurements).
- [ ] C.acceptance: agent fixes its own seeded lint violation (visible in trace); perception runs off the audio thread, glitch-free.

## Phase D — Studio Master (memory + skills)

- [ ] D1 Project memory compartment (intent/refs/decisions/notes) in the project file + settings editor.
- [ ] D2 User taste memory (`~/.confustudio/memory.json`, opt-in) with hard `vetoes`.
- [ ] D3 Skills library (`skills/*.md`) — front-matter + technique + concrete sequences + a measurable **verify** block; ship the first ten (four-on-floor, off-beat hats, acid lines, rumble-kick, dub delay, sidechain pump, Juno-pad, break/drop arrangement, sampler chop, mixdown staging). Keyword loader (no vector store).
- [ ] D4 Manual pipeline — chunk `STUDIO_MANUAL.md` by section id at boot; `manual.search`/`manual.section` tools; inject §M-0 into identity; CI check (tool manifest ↔ M-11).
- [ ] D.acceptance: "take this loop to a 3-min arrangement in my usual style" uses project memory + ≥2 skills, visible in trace. **≥10 evals** (`evals/` task cards) by phase exit.

## Phase E — Co-Performer (quantized-launch live mode)

- [ ] E1 Kernel scheduling field — events/commands accept `at:{bar,beat}`; scheduler queues + fires on boundary. **Prereq:** wire `createStepTriggerEvent` into the live scheduler (currently unused — `app.js:2150 tick()` calls `engine.triggerTrack` directly).
- [ ] E2 Performance guardrails — per-station allowlists in `stationPolicy.json`; live default-denies (transport stop, master gain, topology, project load); enforced in the registry.
- [ ] E3 Performance vocabulary — `queueScene/queuePattern/fill/mute` + `morphCrossfader(target,overBars)` at boundaries.
- [ ] E.acceptance: 10-min live jam, agent runs requested transitions, zero glitches, zero guardrail violations.

## Phase F — External devices (deferred edge)

- [ ] F1 MIDI-hardware adapter as a tool-registry device (sequence a desk synth through the kernel).
- [ ] F2 `--mcp` serve mode — expose device-0 tools + perception over MCP under the same guardrails.
- [ ] F3 DAW adapter spec (community); real Ableton Link (`node-abletonlink`).

---

## Design integration track (Claude Design v2.0 → app)

Source: `docs/design-system/{module-chassis-spec,integration-guide}.md`. DesignSync is main-context only.

- [x] Tokens (already canonical in `src/css/tokens.css`) + `.btn`/`.chip`/`.t-*` component layer (`src/css/components.css`).
- [x] Specs mirrored in-repo (`docs/design-system/`).
- [~] **MIXER page** — master loudness panel shipped (real momentary/short-term/integrated LUFS + peak dBFS, design 7-seg). Remaining: wire `spectrum.js` into the mixer as the labeled 6-band display; vertical-fader channel restyle; per-track VU taps (engine); per-track **masking heat** (needs Phase C stems).
- [ ] **PATTERN page** — in-place STEP DETAIL editor (hold step), trig-condition glyph rack.
- [ ] **Chassis chrome** — `chassis.css` on transport/tabs/channel-rail/dock/osc (meter fills = real `.fill` children).
- [ ] **SOUND page** as focused single-module editor; patch + sample browsers (hover-audition through the real engine).
- [ ] **Director rail + proposal cards + ghost/diff** (pairs with Phase B).
- [ ] **Perception meters** (spectrum bands, masking, lint tags) (pairs with Phase C).
- [ ] **Live-mode skin** (pairs with Phase E); Starter Desk onboarding; app identity refresh; copy guide; `design-guide.md` v2.
- [ ] Adopt `system-canvas.css`/`system-canvas.js` (production components) for new surfaces — **scope `.knob`/`.step`/`.fader` to avoid collisions** with existing pages.

## Cross-cutting / housekeeping

- [ ] Repo hygiene pass (ongoing): dead-code audit alongside 0.4 globals consolidation.
- [ ] `formatVersion: 2` on the project package + forward-only migrations with fixtures (§5.7).
- [ ] Patch format `{pluginId,pluginVersion,params,meta}` + `.csscore` validator (§5.7).
- [ ] `tests/perf-smoke.mjs` — assert offline-render + `sync(graph)` budgets (§5.6).
- [ ] Eval harness (`evals/`) — ≥10 by Phase D, ≥25 before calling a station "pro".

## Immediate next actions (pick up here)

The active lead is **deploy + monetize via the AI co-producer**. B1 (tool registry) is done — build the loop on top. Full detail + specs in `NEXT_SESSION.md`.

1. **B2 — Agent loop** (`src/harness/loop.mjs`) + tool-call IR + deterministic **mock provider** → the `IDLE→PLAN→ACT→VERIFY→PRESENT` state machine executing B1 tools on a cloned branch. Fully testable, no API key. **START HERE.**
2. **B3 — Branch lifecycle** (`branch.open/audition/merge/discard`) wrapping the existing signal-graph DAG.
3. **B4 — Director rail** + proposal cards (the demoable, paywallable moment) → wire to `window.confustudioCommands.execute`.
4. **Deploy** (`docs/DEPLOY.md`, one command, needs the user's account) — for a free-studio funnel, any time.
5. **Phase C** offline render → feature extraction (reuse `loudness.js`/`spectrum.js`) → musical lint → wire into the loop's VERIFY stage (makes the agent hear).
6. Parallel polish: wire `spectrum.js` into the mixer 6-band UI; per-track VU taps; **Phase 0.4** globals consolidation.
