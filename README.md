# CONFUstudio

CONFUstudio is the broader project and studio shell. CONFUsynth is its default and flagship instrument, focused on sequencing, sampling, live sound transformation, and performable modulation. The project explores a hybrid workflow that blends rhythmic composition, scene-based control, resampling, and flexible routing in a modern open-source stack.

The current prototype runs in the browser, is installable as a PWA for desktop-like use, and includes a small local API bridge for optional OpenAI or Anthropic assistance. It is intentionally compact: plain HTML, CSS, and modern JavaScript on the frontend, plus a dependency-light Node server for static hosting and API proxying.

The studio shell now includes a modular canvas where instruments, utilities, and mixer modules can be added, focused, resized, patched, and restored across reloads. The primary CONFUsynth module remains the anchor, while added modules such as Acid Machine, polysynth, drum machine, FM synth, monosynth, DJ mixer, and utility figures can live alongside it in the same workspace.

The repo now also includes an early structured command layer for undoable state mutations, normalized project package import/export, and assistant action planning. That foundation is being used to migrate the UI away from direct ad hoc mutation, starting with scenes, arranger, banks, and top-level pattern tools.

## Instrument Direction

The core themes of CONFUsynth, the default instrument inside CONFUstudio, are:

- Step sequencing with fast per-step editing.
- Sample-first sound design.
- Live capture and resampling.
- Performance morphing and mixer control.
- Strong MIDI and external routing concepts.
- Compact sequencing and sound sculpting.
- Scene morphing, crossfader macros, recorder buffers, and routing depth.
- An original interface and DSP engine designed for desktop, browser, and eventual plugin delivery.

## Product Position

CONFUstudio should be developed as an original studio environment, with CONFUsynth as its primary instrument and interface anchor.

- Build the identity around experimental sequencing, live capture, and morphable performance control.
- Keep the UI, terminology, presets, and interaction model original to the project.
- Treat this repository as the product architecture and prototype basis for CONFUstudio, with CONFUsynth as the lead instrument.

## Architecture

### Product Shape

CONFUstudio should evolve into a modular hybrid studio with four major subsystems:

1. DSP Core
2. Sequencer Core
3. Routing and Mixer Core
4. Host and UI Shell

### Recommended Stack

For a fully open-source, compact, efficient foundation:

- DSP and timing core: Rust compiled to native and WebAssembly in phase 2.
- Browser audio host: Web Audio API plus AudioWorklet for low-latency DSP execution.
- Desktop shell: Tauri for lightweight native packaging once the Rust core exists.
- Plugin target: CLAP first, then optional VST3 bridge only if the licensing and distribution plan justify it.
- Frontend UI: TypeScript with a minimal component layer or Web Components. The current prototype uses plain JavaScript to stay dependency-light.
- Local automation and AI bridge: Node runtime with a minimal HTTP service and optional MCP transport adapter.
- Build and CI: Cargo plus pnpm or npm. Docker is optional; Tauri plus PWA is the lighter “better solution” for desktop delivery.

### Why Not Start With VST3

If “fully open-source” is a hard requirement, VST3 is a poor first target because the SDK licensing is more restrictive than CLAP and browser delivery is impossible. The practical sequence is:

1. Browser and PWA prototype.
2. Shared DSP/sequencer core in Rust.
3. Tauri standalone desktop app.
4. CLAP plugin.
5. Optional VST3/AU wrappers later if commercial distribution requires broader host compatibility.

This avoids locking the core architecture to one host SDK too early.

### Internal Modules

#### 1. Engine Core

- Voice manager.
- Sample player with time, pitch, loop, slice, and reverse support.
- Synth layer for tone/noise/resampler machines.
- Filters, drive, delay, reverb, and modulation.
- Recorder buffers and offline bounce/resample graph.

#### 2. Sequencer Core

- Pattern, bank, and song data model.
- Step trigs, micro-timing, retrigs, conditional logic, probability, and parameter locks.
- Performance scenes and crossfader morph targets.
- MIDI track sequencing and automation lanes.

#### 3. Mixer and Routing

- Per-track volume, pan, cue/send routing, inserts, master bus, and record buses.
- Main out, cue out, input monitoring, internal resampling, sidechain-ready buses.
- Flexible browser-safe audio graph now; multibus native graph later.

#### 4. Host Integration

- Browser shell with PWA install.
- Tauri desktop shell for filesystem, MIDI, and low-latency device access.
- Optional local API bridge for OpenAI, Anthropic, or MCP-driven workflow helpers.

## Feature Map

### Phase 1

- 8 hybrid tracks in the prototype.
- 16-step sequencer with accents.
- Scene A/B morphing through a crossfader.
- Tone, noise, and sample machines.
- Delay and reverb sends.
- File sample import and microphone recording.
- Assistant bridge routes for OpenAI, Anthropic, local OpenAI-compatible endpoints, and Ollama.
- Assistant action planning endpoint for bounded studio commands.

### Phase 2

- Expand to 16 audio tracks plus 8 to 16 MIDI tracks.
- Add parameter locks per step.
- Add recorder buffers, slice editor, retrigs, micro-timing, probability, fills, and arranger.
- Add cue bus, input monitor matrix, and resampling chains.
- Move timing and DSP into Rust plus AudioWorklet/WebAssembly.

### Phase 3

- Native Tauri desktop packaging.
- MIDI learn and external sync.
- CLAP plugin target.
- Optional commercial host wrappers.

## I/O Design

The final product should support the following logical buses even when some are virtual in browser mode:

- Main stereo out.
- Cue stereo out.
- Headphone monitor out.
- Dual stereo external inputs.
- Per-track internal sends.
- Recorder buffers for track, master, and external capture.
- USB or host audio channels in standalone/native mode.
- MIDI in, out, thru, clock, transport, and learn mappings.

## AI and MCP Integration

AI should be optional and local-bridge based.

- Browser UI sends prompts only to the local proxy, never directly to external models.
- The local proxy can route to OpenAI, Anthropic, or an MCP bridge.
- Use cases: pattern generation, sound design suggestions, live set notes, macro mapping proposals, and documentation search.
- Keep AI out of the audio thread and out of hard realtime code paths.

Suggested MCP tools later:

- Project inspector.
- Pattern librarian.
- Sample tagger.
- Performance recipe generator.
- Host automation mapper.

## Running The Prototype

### Requirements

- Node 20 or newer.
- A modern browser with Web Audio and MediaRecorder support.

### Start

```bash
npm start
```

Open `http://127.0.0.1:4173`.

### Test

```bash
npm test
```

The aggregate test runs syntax checks, state/command coverage, server route coverage, and a self-contained Playwright UI smoke test.

### Docker

```bash
docker build -t confustudio .
docker run --rm -p 4173:4173 confustudio
```

### Optional AI Env Vars

```bash
export OPENAI_API_KEY=...
export OPENAI_MODEL=gpt-4.1-mini
export ANTHROPIC_API_KEY=...
export ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

## Current Build State

What is implemented:

- Modular studio canvas with pan, zoom, fit-all, per-module fit, double-click focus, compact module picker, and a live module navigator.
- Persisted studio layout for dynamically added modules, including restored module IDs, positions, zoom levels, and selection.
- Patch cable overlay with draggable port connections, DJ mixer routing, cable cleanup on module removal, and restored cable connections after reload.
- Interaction hardening so knobs, sliders, faders, ports, and module buttons receive pointer input instead of accidentally dragging or selecting the whole module.
- Transport: BPM, swing, tap tempo, 64-step scheduling with trig conditions and probability.
- 8 audio tracks + 8 MIDI tracks, per-track mute/solo.
- Machines: tone (4 waveforms), noise, sample playback, MIDI.
- ADSR envelope, LFO (cutoff/volume/pan targets), per-track filter (LP/BP/HP), drive, pan.
- Parameter locks per step, scene A/B crossfader morphing.
- 8 banks × 16 patterns per bank, arranger / song mode.
- Freeverb reverb (Schroeder-Moorer, 8 comb + 4 allpass native nodes).
- Delay with feedback, per-track reverb and delay sends.
- Per-track bitcrusher (BITS) and sample rate reduction (SRR) controls.
- AudioWorklet sinc resampler (`cs-resampler`) — 4-point cubic Hermite interpolation for pitched samples.
- MIDI Clock out (24ppqn) with drift correction, MIDI start/stop transport.
- Ableton Link-style tempo sync bridge exposed over SSE (`/link`) and `/api/link/state`; real Ableton Link transport is still pending.
- WebMIDI I/O, MIDI output selection.
- File sample import, microphone capture.
- COOP/COEP headers — SharedArrayBuffer enabled for AudioWorklet.
- Assistant bridge: OpenAI, Anthropic, local OpenAI-compatible, and Ollama routes.
- Assistant action planning route for bounded command generation.
- Installable PWA shell.
- Confu desktop shell (`npm install && npm run confu`). The shell entrypoint lives in `confu/`.

## Recent Architecture Work

- Project package helpers now normalize save/load/backup flows.
- A command/history layer exists in `src/command-bus.js`.
- The app exposes `window.confustudioCommands.execute(...)` for bounded command execution.
- `scenes`, `arranger`, `banks`, and key `pattern` toolbar actions already use that structured mutation path.
- Studio interaction coverage now verifies module insertion, module navigator focus, reload restoration, knob/fader dragging, double-click module fit, cable restoration, and cable cleanup.
- Automated coverage includes `test:syntax`, `test:state`, `test:server`, and `test:ui-smoke`; `npm test` runs the full set.

## Recommended Next Build Steps

1. Finish the deeper `pattern.js` migration to the command/history layer, especially step-editor internals, selection tools, random fill, morph, and track-row inline edits.
2. Persist per-module parameter state in the project package so restored modules keep their actual instrument settings, not only their layout and routing.
3. Add an in-app assistant action preview/apply flow on top of `/api/assistant/actions/plan`.
4. Integrate `node-abletonlink` into `server.mjs` to complete the Ableton Link tempo sync bridge.
5. Build the Rust/WASM DSP core for sequencing and voice allocation.
6. Package the standalone app in Tauri once the Rust core exists, then expose a CLAP plugin build target for DAW integration.

## References

- No external brand-specific references are required for the current prototype description.
