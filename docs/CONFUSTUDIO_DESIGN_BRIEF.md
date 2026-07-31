# CONFUSTUDIO — UI/UX & GRAPHICS BRIEF (DESIGN)

**Version:** 1.3 · **Reviewed:** 2026-07-31 · **Owner:** Irgen Salianji
**Status:** design requirements reference; delivery follows Phases 4-6
**Audience:** product design and UI contributors
**Companion documents:** `DEVELOPMENT_PLAN.md` (sequence and gates), `ARCHITECTURE.md` (UI boundary), `CONFUSTUDIO_AI_BRIEF.md` (agent behavior), `STUDIO_MANUAL.md` (shipped vocabulary)
**Existing foundation:** tokens and themes are integrated; prototype handoff code
is reference material and must not be adopted without accessibility, collision,
performance, and real-data verification.

> The 2026-07-31 review found excessive navigation, undersized controls, dense
> typography, full-page rebuilding, missing accessible names, and overlap risk.
> Workflow simplification and the Starter Desk precede the Director rail.

---

## 0. DESIGN THESIS — locked

> **Confustudio looks and feels like a hybrid home studio you can see: original hardware units on a desk, sequenced by one brain, with an agent that works beside you — its proposals appearing as ghost hardware you can audition before it becomes real.**

Three pillars, in priority order (mirrors the product hierarchy):

1. **Hardware honesty.** Controls behave like the instruments that inspired them: steps you press, knobs you sweep, faders you ride, cables you patch. Every control maps 1:1 to an engine parameter — no decorative chrome that lies about the sound.
2. **Playful, not toy.** The chassis language (army-green enclosure, silk-screened labels, CRT-haze screens, amber accent) is warm and characterful, but metering, typography, and layout precision must read professional. Reference feeling: Teenage Engineering's playfulness executed with Elektron's density discipline — _as inspiration only; every panel, name, and glyph is original_.
3. **The agent is a presence, not a chat window.** Agent activity is spatial and material: branches, ghost states, quantize countdowns. "Graceful crystallization" (from the Ludwig UX canon) is the interaction metaphor — proposals materialize translucent and crystallize on merge.

Original-identity rule (hard): no trademarked hardware names, logos, or trade-dress clones (no 303 silver-box pastiche, no Elektron key layout copies, no Moog wheel-and-wood skeuomorphs). Behavioral homage yes; visual quotation no.

---

## 1. WHAT EXISTS (design inventory)

- **Token chassis system** (`tokens.css`): chassis family (`--chassis-bg #4e5f3c` army green, dark/light bezel sides, `--chassis-text`, `--chassis-metal`, `--chassis-rubber`), screen family (`--screen-bg #111810`, CRT `--screen-glow`), semantic surfaces, semantic accents (`--accent #f0c640` amber, `--success #5add71`, `--danger #f05b52`, `--info/--focus-ring #67d7ff`, `--warn #ff8c52`), 8 track colors, theme-independent spacing/radius/shadow/motion tokens.
- **Cable semantics** (implemented): audio = white, control = cyan, event = amber, colored by `port.signal`.
- **Pages**: PATTERN (step grid), SOUND, FX, MIXER (real per-group VU via AnalyserNode), SCENES, ARRANGER, PIANO ROLL, PAD, BANKS, MOD MATRIX, SETTINGS.
- **Studio canvas**: pan/zoom modular workspace, module picker, module navigator, patch-cable overlay, persisted layout; generic DSP module chassis (`dsp-module.js`) with title bar, port dots, param sliders.
- **Pending from the previous handoff** (still valid, fold into this work): Step 2 chassis chrome (`chassis.css/js`), Step 3 pattern page, Step 4 mixer page, Step 5 component CSS, Step 6 studio-canvas refactor.

---

## 2. THE STUDIO METAPHOR (macro layout)

**The canvas is the room; modules are the desk.** Reframe the modular canvas from "node editor" to "studio desk":

- Modules sit on a subtle desk surface (a chassis-family background plane, not infinite void). Optional faint grid = rack rails; modules snap to a **height-unit grid** (see §3) so any arrangement reads tidy, like racked gear.
- **CONFUsynth (the sequencer brain) is the anchor** — largest unit, default-docked; other modules arrange around it the way a Digitakt-class brain sits central on a real desk.
- Cabling stays, but with strain-relief curves, port-hover highlighting of legal targets (by signal type), and a cable-tidy toggle (bundle parallel runs).
- **Two view modes**: _Desk_ (spatial, playful, patching) and _Rack_ (auto-aligned vertical stack, dense, for focused work). Same modules, same state — a view toggle, not a mode with different truth.

## 3. MODULE DESIGN LANGUAGE (the SDK's visual contract)

This is the most leveraged deliverable: community modules must look native without core review. Produce a **Module Chassis Spec** covering:

- **Size grid**: widths in columns (1–8 col), heights in units (1U–4U); exact px per col/U derived from spacing tokens. Standard footprints: 2col×1U utility, 4col×2U effect, 6–8col×3–4U instrument.
- **Anatomy** (top→bottom): title bar (module name silk-screen style, power/activity LED, collapse + remove), panel body (controls), port strip (ins left / outs right or bottom strip — pick one and lock it), brand strip (module id + version, muted).
- **Control components** (spec + build as reusable CSS/JS on top of existing `knobs.js`): knob (with value ring, unit readout on touch, fine-drag modifier), slider/fader (with detent marks), step button (with p-lock indicator dot), toggle, segmented switch, LED, 7-seg-style numeric readout, mini-screen (for module-local displays, uses screen tokens + `--screen-glow`).
- **Param metadata → control mapping**: `unit/curve/smooth` fields from the Module SDK manifest determine readout formatting and knob taper; document the mapping table.
- **Color rules**: chassis stays in the chassis family; modules differentiate by _panel accent_ chosen from a fixed 8-swatch palette (aligned with track colors) — never arbitrary hex. Third-party modules pick a swatch in their manifest.
- **Do/Don't sheet** with rendered examples (correct port placement, label case rules — silk-screen labels are uppercase, letter-spaced, `--chassis-text`).

## 4. THE FOUR FLAGSHIP VOICES (panel design + naming)

Design original panels and propose original names (working codenames from the code brief):

| Codename    | Character                         | Panel design intent                                                                                                                                        |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CS-DRUM`   | Sequencer-brain sampler groovebox | Dense, Elektron-inspired _discipline_ (not layout): step row dominant, per-step p-lock feedback, sample mini-screen with waveform + start/end/loop handles |
| `CS-ACID`   | Mono acid voice                   | Minimal and mischievous: big CUTOFF and RES, slide/accent as step-row modifiers, single-osc switch; the "fun in 30 seconds" module                         |
| `CS-LADDER` | Fat mono lead/bass                | Weighty: large filter section, osc mixer, glide; darker panel swatch, chunkier knobs                                                                       |
| `CS-POLY`   | Chorus poly / pads                | Calm and wide: few controls, generous spacing, prominent CHORUS switch (I/II-style dual mode as an original two-position toggle), soft panel swatch        |

Each needs: panel layout, control set (from the code brief's plugin params), name + wordmark lockup in the silk-screen style, and 3–4 preset card visuals.

## 5. AGENT PRESENCE (the signature UX)

**5.1 The Director rail.** A right-side collapsible rail (not a floating chat bubble): conversation, current station indicator (`SESSION ARTIST / STUDIO MASTER / CO-PERFORMER` as a hardware-style 3-position switch), streaming activity log (tool calls as terse hardware-log lines: `→ set cs-acid.cutoff 62%`), and the proposal stack.

**5.2 Proposal cards = branches.** Each agent proposal renders as a card: title, summary of intent, list of touched targets (chips with track colors), **perception badge** (LUFS delta, lint findings count with severity dots — or a distinct **UNVERIFIED** badge when rendering failed, per AI brief §9), and three actions — **Audition · Merge · Discard**. Merge is always a human click (AI brief D-AI1); if the agent _requests_ a merge, the card shows a gentle pulse on the Merge button, never auto-confirmation.

**5.3 Ghost state (graceful crystallization).** While a proposal exists: affected modules/steps render a translucent overlay variant (reduced opacity + `--info` cyan edge glow — cyan = control/agent signal, consistent with cable semantics). Auditioning A/B: a hardware-style **A/B lever** appears in the transport bar; flipping it crossfades head↔branch playback and swaps ghost/solid rendering. On Merge, ghosts crystallize (brief opacity/scale settle animation, ~200 ms, motion tokens); on Discard they dissolve.

**5.4 Diff visualization.** For sequencer changes: ghost steps overlay the step grid (added = ghost-filled, removed = ghost-hollow, p-lock changed = ghost dot). For patch changes: knob value rings show head value (solid) vs branch value (ghost arc). This must be readable at a glance during playback.

**5.5 Agent never steals focus.** No modal takeovers; proposals queue in the rail; a small LED in the transport bar pulses when new proposals arrive.

## 6. PERCEPTION MADE VISIBLE

- **Meter language**: unify per-track VU (exists), master LUFS (short-term + integrated readout in a mini-screen), spectrum strip in the mixer (6 labeled bands matching the code brief's band scheme), and a masking heat indicator between adjacent channel strips.
- **Lint findings** surface as small `--warn`/`--danger` tags pinned to their location (a track strip, a bar in the arranger) with hover detail: rule, measurement, suggestion, and an "ask agent to fix" affordance that routes to the Director rail.
- Perception visuals are **screen-family** elements (dark screens, glow) to separate _measurement_ from _control_ (chassis) visually.

## 7. CO-PERFORMER / LIVE MODE

A distinct performance skin activated with the station switch:

- **Big-control layout**: scene morph crossfader dominant, pattern/scene launch grid with **quantize countdown rings** (radial progress to next bar/phrase — the visual language of quantized launch), fill and mute group buttons at glove-size hit areas.
- **Agent action queue**: upcoming agent-scheduled actions shown as a horizontal timeline strip above the transport ("SCENE B → bar 17", "FILL T3 → bar 16"), each cancellable with one tap until its boundary.
- **Guardrail state**: locked controls (transport stop, master gain, topology) render with a subtle rubber-well "guarded" treatment (`--chassis-rubber`) + lock glyph; attempting them shows a no-nonsense denial toast.
- High-contrast legibility pass: this mode must survive a dark room and a projector.

## 8. PAGE-LEVEL PRIORITIES (continue the previous handoff)

1. **PATTERN page** (Step 3, pending): step grid as the hero; per-step p-lock editing without leaving the grid (hold-step → param strip); trig-condition and probability glyph system (design a compact glyph set: `1st`, `A:B`, `%`, `FILL`).
2. **MIXER page** (Step 4, pending): channel strips with the unified meter language (§6), send knobs, group buses.
3. **Chassis chrome** (Step 2, pending) and **component CSS** (Step 5): now scoped by the Module Chassis Spec (§3) — deliver them as the SDK's stylesheet.
4. **Studio canvas refactor** (Step 6): Desk/Rack modes (§2), snap grid, cable tidy.
5. **SOUND page**: becomes the focused single-module editor (a zoomed module panel), unifying with §3 components.

## 8.5 FIRST-RUN & ONBOARDING: THE STARTER DESK

The empty-canvas problem kills music tools. First launch never shows a blank void:

- **Starter Desk template**: CONFUsynth brain center, CS-ACID and CS-POLY flanking, mixer and reverb/delay racked below, cables pre-patched, a playable 4-bar techno loop pre-loaded at 128 BPM. The user's first act is pressing PLAY and twisting a filter knob — sound within 10 seconds, no reading.
- Three desk templates on the new-project screen: _Starter Desk_ (above), _Empty Desk_, _Sampler Kitchen_ (CS-DRUM + sample browser focus). Template cards show a miniature desk render, not text lists.
- A dismissible **guided first jam** (4 steps max, coach marks not modals): press play → toggle a step → sweep cutoff → ask the Director for a variation. That last step introduces the agent through _doing_, and its result arrives as a ghost proposal — teaching the branch model implicitly.
- Empty states everywhere carry an invitation + one-tap action ("No patterns in this bank — generate a starting groove?").

## 8.6 BROWSERS: PRESETS, PATCHES, SAMPLES

- **Patch/preset browser**: card grid per module; card = patch name in silk-screen type, module swatch, tag chips, and a **hover-audition** affordance (plays the patch's reference note/loop through the actual engine — never pre-rendered audio, per the parameters-not-renders thesis). Save-patch flow captures name/tags/author for the shareable patch JSON format.
- **Sample browser** (redesign of existing `sample-browser.js`): waveform thumbnails, key/BPM badges when known, drag-to-track and drag-to-pad, folder tree in a chassis side drawer, record-in slot pinned at top (mic capture exists — give it a proper red-ringed REC treatment).
- Both browsers are **screen-family** surfaces (library = display content), opened as drawers over the desk without leaving context.

## 8.7 UI VOICE & COPY

Hardware-terse, lowercase-avoidant on chassis, sentence case on screens. Labels are nouns (`CUTOFF`, `SWING`), toasts are verb-first and ≤ 8 words ("Patch saved to CS-Acid bank"), errors state the fix not the failure ("Sample too long — max 60 s. Trim?"). The Director speaks in first person, brief, studio-collegial — never chirpy, never apologizing twice. Denials in live mode are flat and instant ("Locked in live mode."). Write a one-page copy guide with 20 example strings as part of design-guide v2.

## 9. MOTION, SOUND-OF-THE-UI, AND STATES

- Motion tokens already theme-independent; define durations: control feedback ≤100 ms, ghost crystallize/dissolve ~200 ms, view transitions ≤250 ms; playback-synchronized elements (playhead, countdown rings) animate on the audio clock, not rAF drift.
- **No UI sounds** (it's an audio product; the music is the feedback). Haptic-style visual ticks on detents instead.
- Full state coverage per component: default/hover/active/focused (`--focus-ring`)/disabled/guarded/ghost. Keyboard operability for every control (arrows = fine, modifiers = coarse); visible focus always.
- **Accessibility, concretely**: honor `prefers-reduced-motion` (ghost transitions become opacity-only, countdown rings become numeric); track colors and cable colors must each remain distinguishable under deuteranopia/protanopia simulation — pair every color code with a shape/glyph redundancy (cable end-cap glyphs per signal type; track chips carry index numerals); ghost state must not rely on opacity alone (dashed edge treatment as redundancy); contrast ≥ 4.5:1 for all screen-family text, verified in `light` and `mono` themes; hit targets ≥ 32 px in studio mode, ≥ 44 px in live mode.

## 10. GRAPHICS & ASSET DELIVERABLES

1. **Module Chassis Spec** (§3) — the SDK visual contract, with do/don't sheet. _Highest priority._
2. Component library (knob, fader, step, switch, LED, readout, mini-screen) — CSS + minimal JS on existing tokens.
3. Four flagship voice panels + original names/wordmarks + preset card template (§4).
4. Director rail + proposal card + ghost/diff system (§5).
5. Perception meter language + lint tags (§6).
6. Live mode skin (§7).
7. Glyph set: trig conditions, signal types, stations, guardrail lock, branch/merge/discard (with the color-blind shape-redundancy rules of §9 baked in).
8. Starter Desk template render + new-project template cards + guided first-jam coach marks (§8.5).
9. Patch/preset browser + sample browser drawers (§8.6).
10. App identity refresh: icon (PWA `icon.svg` exists — evolve), wordmark, loading state, empty-state set with one-tap invitations.
11. Copy guide (§8.7) — one page, 20 example strings.
12. Updated `docs/design-guide.md` v2 incorporating all of the above; new tokens only where the 68 are insufficient (justify each addition).

## 11. CONSTRAINTS

- CSS custom properties remain the token source. Vite and Lit are the target build
  and component stack; no CSS framework is planned.
- All colors via tokens; semantic aliases preferred (`--success`, not `#5add71`).
- Themes must keep working: design in `default`, verify `light` and `mono` (the mono theme is the accessibility stress test).
- Desktop + PWA first. Core workflows must remain coherent at 1024 px and above;
  narrower layouts may present an explicit unsupported state until responsive work is scoped.
- Performance: canvas with 15+ modules and 30+ cables must not jank during playback — prefer transform/opacity animation, avoid layout thrash, respect the existing pointer-interaction hardening.
- Everything original: names, glyphs, layouts, trade dress. Inspiration is behavioral and typographic discipline, never quotation.

## 12. DESIGN DELIVERY ORDER

1. Phase 4: accessible Lit control primitives, shell states, keyboard behavior,
   readable type/spacing, and supported-width rules.
2. Phase 5: navigation consolidation, Pattern and Sound workflows, Starter Desk,
   first jam, save/recovery status, and observed usability sessions.
3. Phase 3/5 support: sampler and flagship voice panels backed by real engine params.
4. Phase 6: Director rail, materialized diffs, audition/merge/conflict states, and
   perception language after headless AI acceptance.
5. Phase 7: Module SDK visuals, live skin, extended browsers, and identity expansion.

No design prototype may use fake meters or interactions in production. Visual work
ships only with real state, stable layout, accessibility checks, and browser evidence.
