# Next Session

## Current Baseline

The repo now has a real command-layer foundation instead of only ad hoc state mutation, plus a more reliable modular studio canvas.

Command-layer work already implemented:
- Project package helpers in `src/state.js`
  `createProjectPackage()`, `applyProjectPackageToState()`, normalized import/export path
- Command/history layer in `src/command-bus.js`
  snapshot/restore, undo/redo-ready state capture, bounded studio commands
- App integration in `src/app.js`
  `window.confustudioCommands.execute(...)` plus history controller hookup
- Assistant action planning
  `POST /api/assistant/actions/plan` in `server.mjs`
  `planAssistantActions()` in `src/assistant-client.js`
- Settings migration
  backups + project save/load now go through the package path

Studio canvas work now implemented:
- module drag no longer steals pointer input from knobs, sliders, faders, ports, or module buttons
- zoom lens is opt-in and suppressed during normal clicks
- double-clicking a module body fits it to the viewport
- each module has a fit-to-screen chrome button
- Add Module picker is compact and includes a live module navigator
- dynamically added modules restore after reload with saved IDs, positions, zoom, and selection
- cable routing restores after reload and cleans up when a connected module is removed
- `tests/ui-smoke.mjs` is self-contained and starts a temporary local server when `CONFUSYNTH_BASE_URL` is not provided

## Command-Layer Coverage

Already moved onto structured commands:
- `scenes`
  copy, clear, capture, rename, apply, swap
- `arranger`
  reset, quick-add, rename, duplicate, insert, bars, repeat, follow action, jump target, BPM override, time signature, mute, track mutes, color, templates
- `banks`
  pattern duplicate, copy-to-slot, JSON import, MIDI import, pattern rename, follow action change, clear
- `pattern` top-level tools
  follow action, Euclid generate/all, track paste, track clear

Command types currently available include:
- `set-project-meta`
- `set-transport`
- `set-pattern-length`
- `update-pattern-meta`
- `replace-pattern`
- `set-track-param`
- `replace-track-steps`
- `set-step`
- `clear-track`
- `duplicate-pattern`
- `generate-drum-pattern`
- `generate-euclid`
- `set-scene-name`
- `set-scene-payload`
- `swap-scenes`
- `apply-scene`
- `add-arranger-section`
- `replace-arranger`
- `update-arranger-section`

## Tests Green

Last verified:
- `npm test`

The aggregate suite runs:
- `test:syntax`
- `test:state`
- `test:server`
- `test:ui-smoke`

The UI smoke test now covers module insertion, module navigator focus, saved module restoration, DJ mixer knob/fader dragging, module fit controls, cable restoration after reload, cable cleanup on module removal, and core tab rendering.

## Next Highest-Value Work

### Module State Persistence

Saved layout now restores modules and cables, but added instruments still need persisted internal state.

Next step should be:
1. define a module state serialization contract for dynamic modules
2. add save/restore hooks to DJ mixer and standalone instrument modules
3. include module state in project package export/import, not only local layout storage
4. extend `tests/ui-smoke.mjs` with one parameter-change reload assertion per representative module

### Pattern Deep Migration

This is the biggest remaining mutation-heavy surface.

Still mostly direct mutation:
- per-step editor internals in `src/pages/pattern.js`
- step context-menu edits
- multi-step selection tools
- random fill
- morph
- several track-row inline edits

Next step should be:
1. add command types for richer step/selection operations
2. migrate step editor + selection tools in `pattern.js`
3. keep UI smoke green while expanding `tests/state-commands.mjs`

### After Pattern

- normalize remaining direct mutation in `settings`
- add an in-app assistant action preview/apply flow on top of `/api/assistant/actions/plan`
- improve asset packaging so exported project files can carry sample-backed and module-backed state more reliably
- add a manual mobile/responsive pass for the compact picker, transport keyboard, overlays, and studio toolbar

## Validation To Do Later

- Real audio pass
  init audio, transport, recorder capture/load, sample playback
- Real routing pass
  module-to-mixer audio routing after reload, multiple cable colors, right-click cable removal
- Real MIDI/device pass
  MIDI out rebinding, clock start/stop, hardware sync behavior
- Manual browser pass on all tabs after the deeper `pattern.js` migration
- Desktop shell pass with project import/export and persistence
