# Next Session

## TL;DR — what to do first when you wake up

**Ship the public demo.** Everything is prepared; it's one command (after a
one-time `fly auth login`). From the repo root:

```bash
fly launch --copy-config --now      # first deploy → https://<app>.fly.dev
# afterwards, redeploys are just:  fly deploy
```

Then, in `site/index.html`, set the `STUDIO_URL` constant (top of the `<script>`)
to that Fly URL and host the landing page (`site/`) on any static host
(Netlify/Vercel/GitHub Pages — it needs no special headers). Details in
`DEPLOY.md` and `site/README.md`.

I could not do the deploy itself — it needs your Fly.io account. Everything up
to that point is done and verified.

## Current baseline

- `npm test` exits 0 — runs `lint → syntax → kernel → state → **transport** →
  server → ui-smoke`. (Added `test:transport` this session.)
- `main` **has** the Session-9 fixes (PR #1 was merged — the old note that it was
  unmerged is obsolete).
- This session's work is on branch **`autonomous/cto-session-2026-07-01`** →
  **PR #2** (https://github.com/IrgenSlj/Confustudio/pull/2). Not merged; review
  and merge when happy.

## Session 10 — deploy readiness, conversion, demo-blocker bug fixes (2026-07-01, autonomous)

Each increment verified in a real browser (0 console errors) and pushed.

1. **Fixed the phantom-playing transport bug.** A tab closed mid-playback
   persisted `isPlaying/isRecording/currentStep`; on reload the app booted into a
   fake "playing" state (UI showed playing, no AudioContext, no scheduler) and the
   user's first Play click just toggled it off. Healed at save (`stripRuntime`)
   and load (`repairState`), with `tests/transport-persistence.mjs`.
2. **Fixed two demo-visible display bugs** found in a full 11-page QA sweep (every
   page renders with zero console errors):
   - SOUND page showed a large "NaN" / "MIDI 70.92" — `midiToNoteName()` now
     rounds/validates/clamps fractional pitch (now "B4 / MIDI 71").
   - FX page reverb showed "undefined — undefined, undefined" — the convolution
     presets were missing their descriptor fields (now "Room — small, tight").
3. **Deployment readiness.** Server bound to loopback (the #1 cloud blocker) →
   now binds `0.0.0.0` under `NODE_ENV=production`, local dev unchanged.
   Production `Dockerfile`, `fly.toml` (scale-to-zero, COOP/COEP preserved),
   `render.yaml`, `.dockerignore`, `DEPLOY.md`. Verified: prod server binds
   0.0.0.0 and serves 200 with COOP/COEP intact.
4. **First-run onboarding overlay** (`src/onboarding.js`). Polished, on-brand,
   shows once for new visitors; the "▶ Start making music" button is a real user
   gesture that dismisses AND starts playback (audio unlocks immediately). Zero
   app coupling — one `<script>` tag in `index.html`.
5. **Conversion landing page** (`site/`). Self-contained marketing page matched to
   the app's chassis aesthetic — hero, framed screenshot, 8-card feature grid,
   CONFUsynth spotlight, open-source strip, CTA, footer. No build step. Reveal
   hardened so content can never stay invisible if JS/observer fails.
6. **Shareability + monetization.** App `<head>` now has SEO + Open Graph +
   Twitter tags and a served `/public/og-cover.png` (so a shared demo URL gets a
   rich preview); added image MIME types to the server; `.github/FUNDING.yml`
   adds a GitHub Sponsors button.
7. **Repo hygiene.** Pruned 3 stale `worktree-agent-*` branches/worktrees.
8. **Static-audit fixes.** (a) The Pad page ASSIGN flow was dead — it listened for
   a DOM `confustudio:track:select` event nothing dispatched; the `track:select`
   handler now emits it, so pad→track assignment works (verified end-to-end).
   (b) Pad-assignment toast always said "Pad 1" (index nulled before read) —
   fixed. (c) The FX "RevSize" knob was a silent no-op (Freeverb legacy) →
   replaced with a live "RevSend" (per-track reverb send).

## ⚠ Recommended next work (highest value first)

1. **Curate the demo pattern (needs your ears).** New users hear the default
   pattern on first Play. The default is a generative whole-tone texture
   (`createStep`: `(step+track) % 5`, track pitches `48 + i*2`). I deliberately
   did NOT retune it blind — audio is muted in automation and timbre/mix is
   exactly what makes a demo "good". Spend 20 min crafting a genuinely good
   4-8 bar groove (a proper kick/snare/hat + bassline + hook) and set it as the
   fresh-project default. This is the single biggest first-impression lever.
2. **Wire `STUDIO_URL`** in `site/index.html` once the app is deployed, and host
   `site/`.
3. **Shareable pattern links (growth).** Encode a pattern/project (no audio
   assets → stays small) into a URL hash; load it on open; add a "Share" button.
   Leverage `createProjectPackage`/`applyProjectPackageToState`. Fully verifiable
   without audio (state round-trip). Real organic-acquisition mechanism.
4. **Full multi-module restore on reload.** Current `restoreLayout()` re-anchors
   only `module-0` (a stability fix for the old "blank green modules" regression).
   Dynamically-added modules are not restored across reload. Fix the module
   re-creation + state hydration path properly, verify each module type renders,
   then re-enable — and restore the ui-smoke persistence assertions.
5. **Background-tab playback.** The scheduler is a 120 ms-lookahead loop driven by
   `requestAnimationFrame`, so playback pauses when the tab is backgrounded
   (Chrome throttles rAF). A Web Worker timer (or `setTimeout` fallback) driving
   the lookahead would keep timing alive in the background. Secondary.
6. **Minor cleanups** (from the audit): each page module exports a dead `knobMap`
   (zero callers; `KNOB_MAPS` in `knobs.js` is the live one) — remove to kill the
   confusing duplicate. And completing a pad assignment fires two toasts ("Pad N →
   …" then "Selected track") that clobber each other in `#toast-msg`. Both cosmetic.

## Verification notes

- Green `npm test` ≠ working app. After any change, drive it in a real browser
  and watch `console`/`pageerror`. Throwaway repros live in
  `tests/verify-graph.mjs` / `tests/verify-theme.mjs`.
- Browser automation runs the tab **hidden**, so `requestAnimationFrame` and
  `IntersectionObserver` are throttled/paused — the sequencer playhead and any
  scroll-reveal won't advance there even though they work for a real user. Use
  screenshots + direct state reads to verify; don't mistake this for a bug.
- If a returning user reports a "broken/blank" app, suspect stale
  service-worker cache / corrupt `localStorage` first: bump the SW cache version,
  or have them try Incognito / SET → Hard reset.

## Architecture

See `docs/ARCHITECTURE.md` for the full specification. Core idea: state mutations
go through the command bus; every command is optionally recorded as a node in a
lightweight DAG (`_signalGraph`, runtime-only) enabling deterministic undo/redo
via command replay. A separate serializable audio routing graph (`signalGraph`)
drives the modular DSP engine. UI edits state, a music kernel compiles musical
time into timestamped events, and the graph/DSP runtime renders them. See
`docs/MUSIC_KERNEL_RESEARCH.md` for the kernel migration plan.

## Decision Log

- **No TypeScript** before the API surface stabilizes (would touch every file).
- **No state-management library** — the command bus works.
- **Graph coexists with legacy state** — migration is incremental.
- **AI operates at the command level** — no direct state manipulation.
- **Two graph concepts** — command-history DAG (`_signalGraph`, runtime) vs.
  audio routing graph (`signalGraph`, serializable).
- **Deploy target: Fly.io first** — runs the Node server directly so the COOP/COEP
  cross-origin-isolation headers (needed for SharedArrayBuffer + AudioWorklet)
  are preserved. Static-only hosts (GitHub Pages) can't set them; the AI-proxy
  routes also need a Node runtime.
- **Onboarding & landing** are decoupled and progressive-enhancement-safe: the
  studio never depends on either to function.
