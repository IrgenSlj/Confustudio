# CONFUstudio — Design System

The single source of truth for visual tokens. Everything here is implemented as
CSS custom properties in `src/styles.css` `:root`, so new CSS should reference
`var(--token)` rather than hard-coded values. No build step, no preprocessor —
plain CSS custom properties only.

## How theming works

- Base tokens live in `:root` (the default dark-green theme).
- Theme variants override a subset of tokens via `[data-theme='<name>']`.
- `src/app.js` applies `state.theme` to `document.documentElement.dataset.theme`
  on boot; the SET page's theme picker (`src/pages/settings.js`) switches it.
- Available themes: `default`, `blue`, `red`, `mono`, `light`.

Because variants only override color/surface families, **all layout, spacing,
radius, shadow and motion tokens are theme-independent** — define those once.

## Color palette

### Default (dark-green) — base `:root`

| Token                                                 | Value                             | Use                                             |
| ----------------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| `--chassis-bg` / `--chassis-dark` / `--chassis-light` | `#4e5f3c` / `#3d4d2e` / `#5e7048` | Hardware enclosure (brand identifier — keep it) |
| `--chassis-text` / `--chassis-metal`                  | `#b8c8a0` / `#8a9a72`             | Chassis labels / metal trim                     |
| `--screen-bg` / `--screen-text`                       | `#111810` / `#e8f4e0`             | The "display" area                              |
| `--bg` / `--bg2`                                      | `#0d150a` / `#111c0e`             | App backdrop layers                             |
| `--surface` / `--surface2`                            | `#1a2615` / `#243318`             | Panels, cards, raised elements                  |
| `--text` / `--text-dim` / `--text-muted`              | 85% / 45% / 25% white             | Primary / secondary / disabled text             |
| `--border`                                            | `rgba(255,255,255,.07)`           | Hairline dividers                               |

### Accents (semantic)

| Token                                    | Default   | Meaning                             |
| ---------------------------------------- | --------- | ----------------------------------- |
| `--accent`                               | `#f0c640` | Primary action / selection (amber)  |
| `--live` → `--success`                   | `#5add71` | Playing / confirmed / success       |
| `--record` → `--danger`                  | `#f05b52` | Recording / destructive             |
| `--electric` → `--info` / `--focus-ring` | `#67d7ff` | Info / focus rings / control signal |
| `--warn`                                 | `#ff8c52` | Caution                             |

> Prefer the semantic aliases (`--success`, `--info`, `--danger`, `--focus-ring`)
> in new CSS so meaning survives a theme swap.

### Track colors

`--track-0…7`: amber, green, sky, orange, violet, pink, teal, red. Use for
per-track identity (channel strips, step rows, piano-roll notes).

### Light theme

`[data-theme='light']` keeps the green chassis but flips the screen and surfaces
to a paper ground, and darkens accents so text holds **≥ 4.5:1 contrast** on
light surfaces (`--accent` → `#9a7b00`, `--live` → `#2f8f44`, etc.). It also sets
`color-scheme: light` and lighter shadow tokens.

## Typography

- **UI font**: `--font-ui` → Space Grotesk. **Mono/display**: `--font-mono` → IBM Plex Mono.
- Scale: `--fs-display` 24px · `--fs-xl` 18px · `--fs-lg` 16px · `--fs-md` 14px · `--fs-sm` 12px · `--fs-xs` 10px.
- Line height: `--lh-tight` 1.2 (display/labels) · `--lh-normal` 1.5 (body).
- Weight: `--fw-regular` 400 · `--fw-medium` 500 · `--fw-semibold` 600.

## Spacing — 4px grid

`--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 ·
`--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48 (px).
Use for padding, gap, and margins. The studio canvas grid snap is also 24px
(`--space-6`).

## Radius

`--radius-sm` 3px (chips, steps) · `--radius-md` 6px (buttons, panels) ·
`--radius-lg` 10px (modules, modals) · `--radius-full` (pills, knobs).

## Elevation / shadow

`--shadow-sm` / `--shadow-md` / `--shadow-lg` for rising elevation · `--shadow-inset`
for recessed wells (faders, screens) · `--glow-accent` for active/selected emphasis.

## Motion

Animate **transform + opacity only** (no layout-triggering properties).
`--dur-fast` 120ms · `--dur-base` 200ms · `--ease-out` for enter transitions.

## Interaction & layout

- `--touch-min` 44px — minimum hit target for any interactive control (touch a11y).
- Z-index scale: `--z-canvas` 1 · `--z-overlay` 1000 · `--z-toast` 2000 · `--z-modal` 3000.

## Accessibility checklist

- Text contrast ≥ 4.5:1 (themes are tuned for this; verify new color pairings).
- Visible focus: outline using `--focus-ring`, never `outline: none` without a replacement.
- `aria-label` on icon-only controls; keyboard operable; respect `prefers-reduced-motion`.

## Adoption

New/refactored CSS should reference tokens instead of literals — e.g.
`padding: var(--space-3)`, `border-radius: var(--radius-md)`,
`box-shadow: var(--shadow-md)`, `color: var(--text)`. Existing CSS keeps working
unchanged; migrate opportunistically.
