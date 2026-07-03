# CONFUstudio — Module Chassis Spec & Handoff

> **For:** Claude Code, integrating the system-canvas designs into the codebase.
> **Companion files:** `Confustudio System.html` (the visual contract, pannable canvas), `system-canvas.css` (all new component styles), `system-canvas.js` (interaction behaviours), `tokens.css` (extended token set).
> **Version:** 2.0 · July 2026
> **Source:** Claude Design project "Confusynth UI/UX" (0a865dfd-…). Mirrored in-repo for durability.

---

## 0. How to read the deliverable

Open `Confustudio System.html`. It is a single pannable canvas organised into six horizontal bands (S1–S6), each labelled on the left. Every frame carries a `data-screen-label` so review comments and diffs can name the surface. Nothing is a static mock — knobs turn, faders slide, meters animate, the A/B lever reveals ghosts, and Merge crystallizes a diff.

The three pillars the whole system serves:
1. **Hardware honesty** — every element behaves like the physical thing it depicts. No skeuomorphic lies (a knob that snaps, a fake screw that's a button).
2. **Playful, not toy** — dense, confident, performable. No oversized cartoon UI.
3. **Agent as presence** — the agent is a collaborator with a place on the desk (the rail) and a physical vocabulary (branches, ghosts), never a chat popover pasted on top.

---

## 1. Token additions

Only two tokens were added to the existing 68. Both are justified by the brief and used across multiple surfaces:

| Token | Value | Why it was needed |
|---|---|---|
| `--warn` | `#ff8c52` (orange) | Distinct from `--warning` (amber `#f0c640`, which now clashes with the amber panel-accent used everywhere) and `--danger` (red). Carries lint warnings, spectrum masking heat, and the UNVERIFIED proposal state — states that are "attention" but not "error". |
| `--focus-ring` | `#67d7ff` (cyan) | The brief mandates a visible focus ring on every control for keyboard operability (§9). Aliased to `--info` so agent-signal and focus share one cyan. |

Everything else reuses existing tokens: chassis greens, the 8 `--track-*` swatches (which double as panel accents), the screen family, and the semantic set.

---

## 2. Module Chassis SDK (S1 — highest priority)

The chassis is the contract that lets community modules look native **without core review**. A conforming module fills a `.module` element and follows this anatomy top-to-bottom:

1. **`.mod-title`** — name in silk-screen caps (`--font-mono`, uppercase, letter-spaced, `--chassis-text`), an activity LED tinted with the panel accent, an optional `.kind` tag, and collapse/remove controls.
2. **`.mod-body`** — controls only. A 2px hairline in the panel accent sits under the title.
3. **`.mod-ports`** — locked to the bottom. **Ins left, outs right.** Jack ring colour = signal type, never track.
4. **`.mod-brand`** — module id + version, heavily muted. Never competes with controls.

### Size grid
Widths in **columns** (1–8), heights in **units** (1U–4U). `1 col = 40px`, `1U = 56px`, both derived from the 4px spacing grid so any desk reads racked.

| Footprint | Cols × U | px | Use |
|---|---|---|---|
| Utility | 2 × 1U | 80 × 56 | mult, attenuator |
| Effect | 4 × 2U | 160 × 112 | reverb, delay |
| Instrument | 6–8 × 3–4U | 240–320 × 168–224 | voice, sampler |

### Panel accents
Chassis stays army-green. Modules differentiate **only** by a panel accent chosen from the fixed 8-swatch set (`--track-0`…`--track-7`), set via `--panel-accent` on the `.module`. Never arbitrary hex. The accent appears **only** as: the title LED, the body hairline, and control fills. Never as a large panel fill.

### Param metadata → control mapping (the manifest contract)
| Manifest field | Value | Control behaviour |
|---|---|---|
| `unit` | "Hz" / "dB" / "%" / "st" | readout suffix + tabular numerals |
| `curve` | `lin` | even knob taper |
| `curve` | `exp` | log taper (freq, time) |
| `smooth` | ms | external-move CSS transition duration |
| `steps` | int | detented / segmented switch |
| `bipolar` | true | ring fills from 12 o'clock |
| `default` | num | double-click resets here |

---

## 3. Component set (S1)

All in `system-canvas.css`, all keyboard-operable with a visible `--focus-ring`. Several **self-scaffold** their inner DOM in `system-canvas.js` — you only write the outer element + data attrs:

| Component | Class | Notes |
|---|---|---|
| Knob | `.knob` (`.sm`/`.lg`) | `data-v="0..1"`. Self-builds SVG. Ns-drag; **Shift = 0.25× fine**. Arrows fine, Shift+arrows coarse. Reads `--panel-accent` for the fill. Optional `.kghost` arc for diffs. |
| Fader | `.fader` | `--lvl:0..1`. Self-builds rail + detents + thumb. |
| Step | `.step` (`.mini`) | states: `on` `accent` `plock` `sel` `playing` `beat`, ghost: `ghost-add` `ghost-rm`. `data-static` opts out of click-toggle (for spec displays). |
| Toggle / segmented / station | `.toggle` / `.seg` / `.station` | radio-group behaviour auto-wired. |
| LED | `.led-dot` | `--c` sets colour; `.off` for dark. |
| 7-seg readout | `.seg7` (`.amber`/`.cyan`) | `.u` for the unit suffix. |
| Mini-screen | `.mini-screen` | screen-family surface for module-local displays, scanline haze built in. |

### Sizing note (post-finetune)
Knobs were enlarged for finger/mouse ergonomics: **sm 44px, md 60px, lg 88px**. Labels, port text, and segment text were bumped up and brightened (`rgba(200,214,178,…)`) for readability against the dark chassis. Mini-steps are 34×38 for comfortable tapping. Keep these floors when adding controls.

---

## 4. Voices (S2–S3)

Four flagship panels. **Character is behavioural/tonal homage only — all trade dress is original.** Do not reproduce any manufacturer's exact panel graphics, colour schemes, or logos.

- **CS-DRUM** — sampler groovebox, disciplined. Voice selector + waveform + 6 macro knobs + 16-step row. Accent `--track-0`.
- **CS-ACID** — mono acid line, mischievous. Big CUTOFF/RES pair, SLIDE/ACCENT step modifiers, SAW/SQR. Accent `--track-1`.
- **CS-LADDER** — fat mono lead/bass, weighty. OSC mixer → ladder filter → glide/octave. Accent `--track-4`.
- **CS-POLY** — chorus poly/pads, calm & wide. Shape/detune/spread + original two-position chorus + ADSR. Accent `--track-6`.

**PATTERN page** — the step grid is the hero. Track lanes, page selector, per-step **STEP DETAIL** editor that opens in place (hold a step) so p-locking never leaves the grid, and a trig-condition glyph rack.

**SOUND page** — the focused single-module editor: tabbed sections, scope, and four macro knobs. Carries the A/B lever.

**Browsers** — patch browser (hover auditions through the *actual engine*, not pre-rendered audio) and sample browser (waveform thumbs, key/BPM, drag-to-track, arm-to-record).

---

## 5. Agent presence (S4)

- **Director rail** — right-side, collapsible. Station switch (ARTIST / MASTER / PERFORM) scopes what the agent watches. Activity log mixes your lines, the Director's prose, and terminal-style `→ set/render` operations. Proposals stack at the bottom.
- **Proposal card = branch.** Summary, target chips (coloured by module), and a **perception badge** (LUFS delta, lint count/severity). Actions: **Audition / Merge / Discard**. Merge is *always* a human click — if the agent requests it, the button pulses (`.request`), never auto-confirms.
- **UNVERIFIED** state (orange) — a branch whose render failed. Merge is disabled until an audition produces a perception read.
- **Ghost state = graceful crystallization.** Additions render as ghost-filled (dashed cyan), removals as ghost-hollow, changed p-locks as a cyan dot, changed knobs as a dashed `.kghost` arc. **Never colour-alone** — the dashed cyan edge is the colour-blind redundancy. On Merge, ghosts `.crystallize` (~200ms opacity+scale settle); on Discard they dissolve.
- **A/B lever** — flips HEAD ↔ BRANCH, revealing/hiding ghosts (`data-ab-scope`). The Merge demo is wired via `data-proposal` / `data-ghost-target`.

---

## 6. Perception & onboarding (S5)

- **Meters are the shared truth** — the same lint objects the human sees are what the Director cites in a proposal badge. One vocabulary.
- **MIXER page** — channel strips (fader + VU + mute/solo), master with LUFS 7-seg + stereo VU.
- **Spectrum** with **masking heat** bars between crowded bands; **loudness** (integrated LUFS + dynamic range) with a STREAM/CLUB target.
- **Lint tags** — `.lint` (warn) / `.lint.danger`, shape + colour coded.
- **Starter Desk** — first launch offers pre-wired, playable desks (never a blank rack) + Director coach marks.

---

## 7. Perform, language, identity (S6)

- **Live mode skin** — big launch-cell targets, scene morph slider, quantize timeline (changes land on the bar). **Destructive actions are guarded** — rubber-textured, hold-to-confirm — so nothing vanishes mid-set.
- **Glyph set** — signal types, state/action (locked, branch, merge, discard, audition), and trig conditions. Every glyph pairs a **distinct silhouette with its colour** to survive greyscale/colour-blindness.
- **Copy guide** — 20 example strings. Voice: direct, technical, warm — a studio engineer, not an assistant. No exclamation points, no "Oops!", no emoji in UI, no hype adjectives.
- **App identity** — the mark is a knob with an amber indicator (the smallest true unit of the product). Chassis / record / screen variants.

---

## 8. Integration checklist for Claude Code

- [ ] Merge the two new tokens into `tokens.css` (already present in the repo's tokens.css — `--warn`, `--focus-ring`).
- [ ] Adopt `system-canvas.css` component classes; they layer on top of `tokens.css` + `component-library.css`. **CAVEAT (repo reality):** class names `.knob`/`.step`/`.fader` may collide with existing app CSS — scope or namespace on adoption, verify no regression on the existing PATTERN/MIXER pages via a real-browser screenshot.
- [ ] Wire real audio state into the self-scaffolding controls — `system-canvas.js` is a design harness (random meter data, demo A/B). Replace the `animateMeters`/`animateSpectrum` fakes with engine taps; keep the paint/interaction logic.
- [ ] Enforce the **Module SDK manifest → control** mapping (§2) so third-party modules render correctly from metadata alone.
- [ ] Respect `prefers-reduced-motion` — crystallize/pulse already gate on it.
- [ ] Keep the ergonomic floors from §3 (knob 44/60/88, brightened labels).
