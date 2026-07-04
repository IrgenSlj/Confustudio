# NEXT SESSION — CONFUstudio

**Branch:** work off `main` (now consolidated — see below). Open focused PRs; `main` is green and protected by CI again.
**North-star specs (in-repo):** `docs/CONFUSTUDIO_CODE_BRIEF.md` (phasing/engine/SDK), `docs/CONFUSTUDIO_AI_BRIEF.md` (harness — authoritative), `docs/CONFUSTUDIO_DESIGN_BRIEF.md`, `docs/STUDIO_MANUAL.md`.
**Thesis (locked):** a modular techno/house studio + one agent harness that works in **parameters & performances, never rendered audio**. Branches, not mutations · perception-gated · guardrails in the tool registry · hierarchy **engine quality > ease of use > advanced features**.

**Active lead:** **deploy + monetize** via the **AI co-producer** (the moat). The studio itself is already a polished, working product; the differentiator is an AI that produces _with_ you in an editable studio — writes patterns, designs patches, rides the mix — where you keep every parameter. That layer is the paywall and is now under construction (Phase B).

---

## State of `main` (consolidated 2026-07-04)

`main` is green and was consolidated from six branches this session. `npm test` runs
**lint · types (tsc) · syntax · kernel · score · perception · spectrum · harness · state · server · ui-smoke** and is green; verified in a real browser (renders, zero console errors, clean returning-user boot).

What landed:

- **CI is enforced again.** It had been RED on every commit for weeks — `prettier --check` failed before the tests ran, so `npm test` never executed in CI. Fixed; the format gate is now a real gate.
- **Data-loss bug fixed** — `deepMerge` in `state.js` wiped any returning user's project once an array grew past defaults (extra module/LFO/cable/branch). Regression-tested.
- **Deployable** — server binds `0.0.0.0` under `NODE_ENV=production`, `/healthz`, non-root Dockerfile, `fly.toml` (scale-to-zero), `render.yaml`, `docs/DEPLOY.md`. **One command from a public URL.**
- **Phase 0** (type boundary + tsc gate, stale-cache postmortem), **B6 CS-Score**, **Phase C seeds** (loudness + spectrum kernels), **mixer master loudness panel**, design component layer — all from the prior feature line.
- **Phase B1 — harness tool registry** (`src/harness/tools/`): 17 tools, a pure zero-dep JSON-Schema validator, station allowlists, per-param clamping guardrails, provider adapters. Enforces **no private path** — every tool compiles to a real command the bus accepts (247-check test, `test:harness`).

---

## The plan — build the AI co-producer (Phase B), then deploy, then monetize

The loop spec is `docs/CONFUSTUDIO_AI_BRIEF.md` §1 (state machine + tool-call IR). B1 is the foundation. Build in order, each a focused verified PR:

### B2 — Agent loop (`src/harness/loop.mjs`) + mock provider ← **START HERE**

- **Tool-call IR** (`src/harness/ir.js`): call `{ name, args, callId }`, result `{ callId, ok, data?, error?:{ code, message, hint } }`. `hint` = model-facing repair guidance.
- **Provider interface** + a **deterministic mock provider** (`src/harness/providers/mock.js`) so the whole loop is testable with NO API key. Real Anthropic/OpenAI adapters translate at the edge only (server.mjs already has per-provider request builders to reuse — `requestAssistantProvider`).
- **State machine** `IDLE→PLAN→ACT→VERIFY→PRESENT` with budgets (`maxTurns`, `maxToolCalls`) enforced at each transition. ACT executes tool calls via `compileToCommand` (B1) → `executeStudioCommand` on a **cloned branch state** (branches, not mutations). Error storm (>3 consecutive `ok:false`) → abort to PRESENT with an honest partial note.
- **VERIFY** = a _pluggable hook_ now (default no-op returns no findings); Phase C fills it with render/measure/lint. Findings ≥ warn → one repair cycle (`maxRepairCycles=1`).
- **PRESENT** = a proposal `{ branchState, intent, touched[], commands[], perception:null, nextSteps[] }` + a trace `{ turns, toolCalls, budgets, findings, failure }`.
- Test (`tests/harness-loop.mjs`): scripted mock provider drives "four-on-floor on track 1" end-to-end, asserts real commands applied on the branch, a proposal + diff produced, budget + error-storm + repair-cycle paths covered. Wire `test:loop`.

### B3 — Branch lifecycle

- Formalize `branch.open/audition/merge/discard` over the **existing signal-graph DAG** (`command-bus.js`: `signalListBranches`, `signalSwitchBranch`, `replaySignalSubgraph`, `captureCommandState` already exist — wrap them). Merge/discard are **user-only** (a human click). Persist a `branches` compartment so proposals survive reload.

### B4 — Director rail (the visible product; browser-verified)

- In-app rail + proposal cards (chat, audition A/B, merge, discard, activity log). Wire to the sanctioned browser exec path: `window.confustudioCommands.execute(commands, label)` (`app.js`). Design: `docs/CONFUSTUDIO_DESIGN_BRIEF.md` S4. **This is the demoable moment for launch.**

### B5 — Traces (per-run artifact); wire the loop to the real server providers behind `/api/assistant`.

### Then:

- **Deploy** (needs the user's Fly/Render account — one command; see `docs/DEPLOY.md`). Do this once B4 gives a hook, OR earlier for a free-studio funnel — user's call.
- **Phase C** — offline render (`OfflineAudioContext`) → feature extraction (reuse `loudness.js` + `spectrum.js`) → musical lint → wire into VERIFY. Makes the agent _hear_.
- **Monetize** — open-core: free studio, paid AI co-producer. Start BYO-key (launch fast, zero inference risk), migrate to metered credits once demand is real. `FUNDING.yml` + landing page are salvageable from branch `autonomous/cto-session-2026-07-01` (see below).

---

## Plumbing / hygiene follow-ups

- **Regenerate `docs/confustudio.manual.json` tool surface from B1** (`buildManualToolSurface()`), and point the server's `/api/assistant/actions/plan` allowed-types at the registry — kill the hand-maintained 10-type list that already drifts from the 38 real command types. Single source of truth.
- **Type the harness** — add `src/harness` to the tsc `jsconfig.json` include list once B2/B3 stabilize, so it gets the same checked-JSDoc boundary as the kernel.
- **Phase 0.4** — consolidate `window._*` globals into `__CONFUSTUDIO__` (still open).
- **A2 audio-quality harness** (`tests/audio-quality.mjs`) is the gate for any audio-engine edits — build before touching voices. Do NOT tune audio blind (verify-in-real-browser).

## Salvage from the stale branch (don't rebuild)

Branch `autonomous/cto-session-2026-07-01` (was open PR #2, now closed as superseded) contains, un-merged: a polished **1284-line landing page** (`site/index.html` + `og-cover.png`), **onboarding** (`src/onboarding.js`), **share** (`src/share.js`), **pwa-install** (`src/pwa-install.js`), `FUNDING.yml`, and a **"transport fix"** worth reviewing. Cherry-pick these into focused PRs when the funnel/monetization work starts — the value is real, the bundle was just too big and stale to merge.

## Discipline

Small verified increments, commit + push each, own PR. Update this file every session. `npm test` green ≠ working app — screenshot-verify every visual change. Phase acceptance gates are blocking.
