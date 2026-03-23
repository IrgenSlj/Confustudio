# Next Session

## Priorities

1. Finish the `Sound` page workflow.
2. Deepen the `Arranger` + `Scenes` live-performance workflow.
3. Tighten final app polish and validation.

## Recommended Work

### Sound / Sample Workflow

- Build a full recorder-to-sample workflow directly in the `Sound` page.
- Add visible waveform capture-slot loading, trim, normalize, reverse, and quick slice actions.
- Add slice markers and assign slices to steps or pads.
- Add better sample metadata display: duration, root note, loop mode, mono/stereo.
- Make captured recorder slots previewable before loading into a track.

### Arranger / Scenes

- Add section templates with better inline editing and validation.
- Add scene automation per arranger section.
- Add more explicit section follow actions and transition controls.
- Add scene morph curves and per-parameter inclusion/exclusion UI polish.
- Make scene capture/apply feedback clearer during performance.

### Pattern / Sequencing

- Finish validating the new p-lock panel tools against all step-edit states.
- Add batch actions for selected steps beyond probability/velocity.
- Add stronger visual feedback for copied/pasted step groups.
- Review trig-condition naming consistency between UI and scheduler logic.

### Runtime / Audio

- Expand recorder capture beyond master bus to track-specific capture.
- Add safer MIDI output rebinding when devices disappear/reconnect.
- Validate MIDI clock start/stop/restart behavior against real devices.
- Consider adding offline bounce/export instead of only live MediaRecorder export.

### Studio Shell

- Improve new-module spawn placement so new modules avoid overlapping the tab strip.
- Validate drag/zoom/pan gestures with multiple modules and cables together.
- Consider a “fit all modules” explicit control separate from reset.

## Validation Checklist

- Manual browser pass on all tabs.
- Real audio check: init audio, play/stop, record, sample load, recorder slot capture/load.
- Multi-module studio check: add synth and DJ mixer, drag them, zoom/pan, reset fit.
- Electron shell check from `confu/`.
- Git diff review for any stray exploratory edits before release.
