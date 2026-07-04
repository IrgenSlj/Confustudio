# CONFUstudio · Design Integration Guide

> How to land each Claude Design v2.0 deliverable into the existing codebase — no build step, no framework, no runtime deps. Mirrored in-repo from the design project (0a865dfd-…) for durability. The prototype HTML is the source of truth for visual behaviour; the markdown docs are the source of truth for intent.

## Deliverables (in the design project, fetch via DesignSync)

`tokens.css` · `chassis.css`/`chassis.js` · `component-library.css`/`.html` · `pattern.css`/`.js`/`pattern-page.html` · `mixer.css`/`.js`/`mixer-page.html` · `system-canvas.css`/`system-canvas.js` (the **production** component library) · `Confustudio System.html` (the pannable canvas) · `module-chassis-spec.md` · `design-guide.md` · `studio-canvas-redesign.md`

**DesignSync is main-context only** — subagents can't call it. Fetch each file yourself with `DesignSync {method:'get_file', projectId:'0a865dfd-ed0d-407e-9c59-a80f2b4a781e', path}`.

## File-by-file mapping

| Deliverable | Maps to | How |
|---|---|---|
| Design tokens | `src/css/tokens.css` (already integrated + more complete than raw) | Repo version has a back-compat alias block the raw lacks — **do not blind-replace**. Only additive `--warn`/`--focus-ring` + `.t-*` utilities were new (now in `src/css/components.css`). |
| Component library (production) | `system-canvas.css` + `system-canvas.js` | The real `.knob`/`.fader`/`.step`/`.module`/`.seg7`/`.mini-screen` classes, self-scaffolding via JS. **CAVEAT: `.step`/`.knob`/`.fader` collide with existing app CSS — scope/namespace on adoption and screenshot-verify existing pages.** `system-canvas.js` uses fake meter data — replace `animateMeters`/`animateSpectrum` with engine taps, keep paint/interaction. |
| Component library (docs) | `docs/design-system/component-library.html` | `.lib-*`-namespaced showcase page. Reference only; doesn't ship into the app. |
| Buttons/chips/type | `src/css/components.css` (DONE) | `.btn` system + `.chip` + `.t-*` — additive, no collision. |
| Chassis chrome | `src/css/chassis.css` + `src/chassis.js` | Styles transport/tabs/channel-rail/dock/osc via existing selectors. Meter fills must be real `<div class="fill">` children, not pseudo-elements. |
| Pattern page | `src/pages/pattern.js` + `src/css/drum-machine.css` | New shape: `state.tracks[i].steps[s] = {on,accent,vel,prob,mt,locks:[{param,val}],cond}`. Write an adapter to the real model. `renderToolbar/Trackbar/Grid/Detail/AIBar` are pure-function templates. |
| Mixer page | `src/pages/mixer.js` + `src/css/mixer.css` | Vertical faders know level via `--lvl` (0..1, 0.75=unity). Drive `.fill` height from the per-frame meter loop; add master LUFS 7-seg + spectrum + masking. |
| Studio canvas | `src/studio-modules.js`, `src/cables.js` | `studio-canvas-redesign.md` — doc, not code. Highest-leverage: adopt the `state.signalGraph` shape as one source of truth. |

## Order of operations (each ships independently)

1. **Tokens** — done (canonical in repo; `--warn`/`--focus-ring`/`.t-*` landed).
2. **Components** — `src/css/components.css` (`.btn`/`.chip`/`.t-*`) done; adopt `system-canvas.css/js` for new surfaces next.
3. **Chassis chrome** — dress transport/tabs/rail; verify DOM selectors match.
4. **Pattern page** — adapter to real state; STEP DETAIL in-place editor; trig-condition glyph rack. Playhead updates only `.is-playing`, not a full re-render.
5. **Mixer page** — vertical faders + VU + master LUFS + spectrum/masking + lint tags.
6. **Studio canvas refactor** — separate epic; `state.signalGraph` first.

## Backwards compatibility (already handled in repo tokens.css)

Legacy names kept/aliased: `--muted`→`--fg-3`, `--bg2`→`--bg-2`, `--surface2`→`--surface-2`, `--text`→`--fg`, `--text-dim`→`--fg-3`, `--text-muted`→`--fg-mute`; `--chassis-*`, `--screen-*`, `--track-0..7`, `--accent/--live/--record/--electric`, `--font-*` all preserved. `styles.css`'s legacy `:root` is imported after tokens.css, so its values win where it redefines.

## Page render contract

```js
// src/pages/<page>.js
export function render(state, root) { /* root === #page-content; build DOM; return cleanup|undefined */ }
```

## AI integration hooks

Each page exposes `aiAction(kind)`. Pattern: `humanize·fill·variation·complement·sparser·busier`. Mixer: `balance·punch·space·warm·match`. In production these route through the harness (Phase B): send the relevant `state` slice + kind → endpoint returns a **diff** (never whole state) → apply client-side → toast + render.

## Verification (tests can't see rendering)

Use a Playwright screenshot script (see the `shoot.mjs` pattern modelled on `tests/ui-smoke.mjs`): boot `server.mjs`, clear SW/localStorage, navigate `.page-tabs button[data-page="…"]`, screenshot, and collect `pageerror`/`console error`. Gate every visual step on a before/after screenshot + zero console errors.

Smoke checks: click 4 steps → velocity bar appears · right-click a step → detail updates without toggling · drag a fader → value + dB readout + master meter update · resize 1440→1024→768 → no horizontal scrollbar · Tab → visible focus ring everywhere.
