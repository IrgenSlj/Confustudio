# CONFUstudio Design Integration Guide

**Status:** reference assets only; migration follows Phases 4-5

**Reviewed:** 2026-07-31

**Authority:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md)

The Claude Design v2 handoff contains useful visual research, but its prototype
HTML, fake meters, self-scaffolding scripts, global class names, and old state
adapters are not production architecture. Do not copy a complete handoff file into
the app. Reimplement validated behavior as scoped Lit components backed by typed
services and real engine data.

## Assets and Their Role

| Asset                    | Use now                      | Migration rule                                                                  |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `src/css/tokens.css`     | Current token source         | Consolidate compatibility aliases in Phase 4; preserve themes.                  |
| `src/css/components.css` | Existing additive utilities  | Freeze new global selectors; replace workflow by workflow.                      |
| `system-canvas.css/js`   | Visual interaction reference | Namespace concepts; do not ship fake data or self-created hidden DOM contracts. |
| Pattern/mixer prototypes | Layout reference             | Rebuild only after v4 selectors and command reducers exist.                     |
| Chassis spec             | Module visual requirements   | Apply to the sampler/flagship voice, then SDK modules in Phase 7.               |
| Director/ghost concepts  | AI UX requirements           | Defer until deterministic headless proposals pass in Phase 6.                   |

Design project files may not be available to every contributor. Required behavior
must be captured in-repo before it becomes an implementation dependency.

## Production Component Contract

- Lit component with typed public properties and events.
- Reads selected data through a subscription; never imports the global app state.
- Dispatches a validated command with stable target IDs for persistent edits.
- Renders untrusted strings through text bindings.
- Uses scoped styles or an explicitly namespaced shared class.
- Provides accessible name, role, value, keyboard behavior, and visible focus.
- Has stable dimensions and cannot shift layout when values, hover, or playback change.
- Honors reduced motion and does not rely on color alone.
- Uses real engine/project data; demo animation and random meters are prohibited.
- Includes interaction and visual evidence at supported widths.

## Delivery Order

1. Establish Vite, strict TypeScript, Lit, typed services, and v4 selectors.
2. Build accessible primitives: icon button, toggle, segmented control, knob,
   fader, step, meter, readout, tooltip, dialog/drawer, and status indicator.
3. Migrate the shell, navigation, save/recovery states, and one small workflow.
4. Migrate Pattern and Sound as the primary creation path without full-page rebuilds.
5. Add Mixer and Arrange after the authoritative audio/transport data exists.
6. Build Starter Desk and onboarding, then validate with observed first-use sessions.
7. Build Director proposal/diff components only after Phase 6 headless acceptance.
8. Publish chassis components through Module SDK v1 in Phase 7.

## Verification

Every UI pull request includes:

- Playwright interaction checks on relevant Chromium, Firefox, and WebKit paths.
- axe results and a keyboard-only completion path.
- Screenshots at 1024x768, 1365x768, and 1440x900 where the surface applies.
- No clipped text, incoherent overlap, unexpected horizontal scroll, or focus loss.
- Fresh, returning-user, migration/recovery, and offline states where applicable.
- Render-count and interaction-latency comparison for replaced pages.
- Real audio/meter values for any audio visualization.

The prior `aiAction(kind)` page hook is retired as a target. Agent actions use the
same stable-ID command/proposal registry as human edits; pages do not own a private
AI mutation path.
