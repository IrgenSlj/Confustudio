# Next Session

## Current Baseline

The repo now has a real command-layer foundation instead of only ad hoc state mutation.

Implemented in this round:
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
- `npm run test:state`
- `npm run test:server`
- `npm run test:ui-smoke`

The new state test lives in `tests/state-commands.mjs`.

## Next Highest-Value Work

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
- improve asset packaging so exported project files can eventually carry sample-backed state more reliably

## Validation To Do Later

- Real audio pass
  init audio, transport, recorder capture/load, sample playback
- Real MIDI/device pass
  MIDI out rebinding, clock start/stop, hardware sync behavior
- Manual browser pass on all tabs after the deeper `pattern.js` migration
- Desktop shell pass with project import/export and persistence
