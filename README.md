# CONFUsynth

CONFUsynth is an original experimental instrument focused on sequencing, sampling, live sound transformation, and performable modulation. The project explores a hybrid workflow that blends rhythmic composition, scene-based control, resampling, and flexible routing in a modern open-source stack.

The current prototype runs in the browser, is installable as a PWA for desktop-like use, and includes a small local API bridge for optional OpenAI or Anthropic assistance. It is intentionally compact: plain HTML, CSS, and modern JavaScript on the frontend, plus a dependency-light Node server for static hosting and API proxying.

## Instrument Direction

The core themes of CONFUsynth are:

- Step sequencing with fast per-step editing.
- Sample-first sound design.
- Live capture and resampling.
- Performance morphing and mixer control.
- Strong MIDI and external routing concepts.
- Compact sequencing and sound sculpting.
- Scene morphing, crossfader macros, recorder buffers, and routing depth.
- An original interface and DSP engine designed for desktop, browser, and eventual plugin delivery.

## Product Position

CONFUsynth should be described and developed as an original instrument with its own interface language, signal flow, and performance model.

- Build the identity around experimental sequencing, live capture, and morphable performance control.
- Keep the UI, terminology, presets, and interaction model original to the project.
- Treat this repository as a product architecture and prototype basis for CONFUsynth itself.

## Architecture

### Product Shape

CONFUsynth should evolve into a modular hybrid instrument with four major subsystems:

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
- Assistant bridge stub for OpenAI, Anthropic, and MCP.

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

### Docker

```bash
docker build -t confusynth .
docker run --rm -p 4173:4173 confusynth
```

### Optional AI Env Vars

```bash
export OPENAI_API_KEY=...
export OPENAI_MODEL=gpt-4.1-mini
export ANTHROPIC_API_KEY=...
export ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

## Current Prototype Notes

What works now:

- Transport with BPM, swing, and 16-step scheduling.
- Eight selectable tracks.
- Tone, noise, and sample playback machines.
- Crossfader-driven scene interpolation for cutoff, decay, and delay amount.
- Global delay and reverb buses.
- File import and microphone capture into the selected track.
- Simple assistant UI with local proxy.
- Installable PWA shell.

What is intentionally missing:

- True parameter locks.
- Native plugin packaging.
- AudioWorklet DSP.
- MIDI I/O.
- Song mode and arranger.
- Cue routing and advanced recorder matrix.

## Recommended Next Build Steps

1. Move the sequencer state and scheduler into TypeScript modules with unit tests.
2. Introduce AudioWorklet for sample-accurate transport and lower-jitter scheduling.
3. Build a Rust core for sequencing, voice allocation, and DSP parameter interpolation.
4. Add proper pattern memory, banks, scenes, fills, and parameter locks.
5. Package the standalone app in Tauri.
6. Expose a CLAP build target for DAW integration.

## References

- No external brand-specific references are required for the current prototype description.
