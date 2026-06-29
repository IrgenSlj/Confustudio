# CONFUstudio Music Kernel Research

Date: 2026-06-29

This memo looks at how proven music systems generate and schedule sound, then maps those patterns onto CONFUstudio's current implementation. The conclusion is direct: CONFUstudio already has useful Web Audio pieces, but it does not yet have a clear music kernel. Timing, event generation, DSP, routing, and module ownership are spread across UI code, the legacy track engine, the modular graph prototype, and standalone module timers.

## Current CONFUstudio Sound Path

The main sequencer is in `src/app.js`. `scheduleLoop()` computes `secsPerStep`, runs a 120 ms lookahead against `AudioContext.currentTime`, evaluates trig conditions, probability, swing, microtiming, humanize, scene interpolation, arpeggiation, and calls `state.engine.triggerTrack(...)` with a timestamp. It also emits `confustudio:clock` DOM events for external modules.

The main audio engine is `src/engine.js`. `AudioEngine.triggerTrack()` merges track defaults with per-step parameter locks, then creates a per-trigger Web Audio chain: envelope gain, panner, filter, saturator, optional bitcrusher, optional EQ, sends, and source. Sources are selected by `machine`: MIDI, sample, noise, tone oscillator, or AudioWorklet-backed `plaits`, `clouds`, and `rings` processors. The sampler path can use `cs-resampler`, an AudioWorklet with 4-point cubic Hermite interpolation.

There is also a newer modular engine in `src/engine-graph.js`. It compiles graph nodes and connections from plugin descriptors into Web Audio nodes, and can instantiate oscillators, filters, gain, panner, EQ, compressor, delay, reverb, saturator, chorus, AudioWorklet effects, and instrument-ish worklets. Today it is not the authoritative studio engine.

Several studio modules own their own audio and timing behavior. `drum_machine.js` has a standalone lookahead scheduler and can also follow `confustudio:clock`. `acid_machine.js` has a `setInterval` standalone sequencer and also follows `confustudio:clock`. `polysynth.js`, `monosynth.js`, and `fm_synth.js` listen for global note/clock DOM events. This gives the prototype range, but it fragments timing and graph ownership.

## What Proven Systems Do

### Ableton Live

Ableton's product model separates musical material from rendering. A Live Set has clips, tracks, device chains, mixer routing, Session View, and Arrangement View. Clips are the musical building blocks; tracks host clips and manage signal flow. Audio clips reference sample files and contain playback instructions; Live can warp audio so timing and pitch can be changed independently and synced to the set tempo. Sources: [Live Concepts](https://www.ableton.com/en/live-manual/12/live-concepts/), [Audio Clips, Tempo, and Warping](https://www.ableton.com/en/live-manual/12/audio-clips-tempo-and-warping/).

Ableton Link shows the professional timing attitude: sync is modeled as musical beat, tempo, and phase across apps, with explicit handling for clock mapping, audio callback timestamps, jitter filtering, and output latency compensation. Source: [Ableton Link README](https://github.com/Ableton/link/blob/master/README.md).

Takeaway for CONFUstudio: a serious studio needs a musical timeline and clip/event model above the DSP graph. Tempo, phase, latency, and sample position are kernel responsibilities, not scattered UI concerns.

### VCV Rack

VCV Rack treats the patch graph as the product. Modules declare parameters, inputs, outputs, bypass behavior, serialized state, and polyphony. DSP runs inside a module `process()` method using engine timing such as `args.sampleTime`. Polyphonic cables carry up to 16 channels, so a module's DSP state becomes per-channel state. The plugin guide also warns that blocking file access in `process()` can cause audio hiccups. Source: [VCV Rack Plugin API Guide](https://vcvrack.com/manual/PluginGuide).

Takeaway for CONFUstudio: plugin descriptors need to be more than UI metadata. They should define typed ports, channel behavior, parameter ranges, modulation targets, latency, serialization, and real-time constraints. The graph should be the source of truth for routing.

### Sonic Pi and SuperCollider

Sonic Pi is a live-coding music layer over a synthesis engine. Sonic Pi's synth design document states that Sonic Pi sounds are produced by the SuperCollider synthesis engine, using precompiled `synthdef` files. Standard Sonic Pi synths are expected to self-terminate so synth nodes are cleaned up. Source: [Sonic Pi SYNTH_DESIGN.md](https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/main/SYNTH_DESIGN.md).

SuperCollider formalizes the split: `sclang` is the client/language layer; `scsynth` or `supernova` is the audio server. They communicate over OSC. The server is a lean audio synthesis and processing program, while the client translates musical code into server messages. Source: [SuperCollider Client vs Server](https://doc.sccode.org/Guides/ClientVsServer.html).

Takeaway for CONFUstudio: separate control language/event generation from audio rendering. Even in a browser, the equivalent is UI/main-thread code generating timestamped events into an AudioWorklet or WASM audio server.

### Tone.js and Web Audio

Tone.js is relevant because it solves browser musical timing. `Transport` schedules musical events against a shared timeline and passes the exact event time into callbacks, so the callback can schedule Web Audio operations at the precise time. Its docs explicitly contrast this with `setInterval` and `requestAnimationFrame`. Sources: [Tone.Transport](https://tonejs.github.io/docs/r13/Transport), [Tone.js overview](https://tonejs.github.io/).

The platform primitive for custom low-latency browser DSP is AudioWorklet, which runs custom audio processing scripts on a separate Web Audio thread. Source: [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet).

Takeaway for CONFUstudio: the browser path should use JS only to produce timestamped event bundles and use AudioWorklet/WASM for stable DSP. UI frame timing should not be part of audio correctness.

### TidalCycles

Tidal's technical model is a clean reference for pattern generation. A pattern is a function from a time span to events; time is rational, and events carry start/end spans. This makes polyrhythm, subdivisions, triplets, and nested pattern transforms natural. Source: [TidalCycles: What is a pattern?](https://tidalcycles.org/docs/innards/what_is_a_pattern/).

Takeaway for CONFUstudio: represent pattern data as musical time and event queries, then lower those events into sample-frame timestamps. Do not bake all sequencing logic directly into `scheduleLoop()`.

### Ardour

Ardour's channel strip model is useful for routing. Tracks and buses have processor chains, flexible I/O, strict I/O, panners, plugin pins, sidechains, and latency-compensated thru paths. Source: [Ardour Track/Bus Signal Flow](https://manual.ardour.org/signal-routing/signal-flow/).

Takeaway for CONFUstudio: routing should explicitly model channel counts, processor pins, sidechain inputs, sends, returns, and latency. A cable UI is not enough unless it compiles to a precise signal-flow model.

### Csound

Csound separates orchestra instruments from score events. Instruments are built from unit generators/opcodes; the engine receives score or real-time events and processes audio in buffers, with control events evaluated at `ksmps` block boundaries. Source: [Csound: How Csound Works](https://csound.com/docs/manual/UsingDesign.html).

Takeaway for CONFUstudio: a stable kernel can be built around instrument definitions plus event streams. That is a better long-term model than constructing large transient Web Audio node chains for every step.

## Gaps In CONFUstudio

1. The main sequencer is too monolithic. It does musical interpretation, recording, pattern following, arranger logic, UI playhead state, DOM clock dispatch, and audio event submission in one loop.

2. The audio engine allocates too much on each trigger. Creating filters, panners, waveshapers, EQ nodes, send nodes, LFO oscillators, and worklets per step is flexible, but it is not a robust kernel model. Persistent voices and persistent device chains are the direction used by mature engines.

3. There are multiple clocks. The main sequencer uses `requestAnimationFrame` lookahead. Drum Machine has a lookahead timer. Acid Machine uses `setInterval` for standalone sequencing. Other modules listen to DOM clock events. These clocks will drift or produce inconsistent feel unless one transport owns musical time.

4. The graph engine is promising but non-authoritative. `src/engine-graph.js` has the right direction: plugin descriptors compile to Web Audio nodes. But the legacy `AudioEngine` still does the real track rendering.

5. DSP naming is ahead of DSP reality. The app uses names like Plaits, Clouds, and Rings, but the local worklets are simplified implementations. Either port/attribute actual open-source DSP carefully under its license terms, or rename these engines to original CONFUstudio names.

6. Sample playback is not yet a Live-class sampler. There is start/end, loop, key tracking, sample import, and a better resampler worklet. Missing kernel-level concepts include transient analysis, beat grids, warp markers, slice maps, one-shot vs loop policy, per-slice envelopes, crossfaded looping, time-stretch modes, and offline analysis caches.

7. AI should not be in the kernel. The app can use AI to propose patterns, patches, labels, or routing, but generated model output should become ordinary project data. It should never own scheduling, DSP, or realtime decisions.

## Recommended Kernel Architecture

The target architecture should have four layers:

1. Musical model

Patterns, clips, tracks, scenes, arranger sections, automation lanes, scales, groove templates, sample assets, and patch definitions. This layer uses musical time: bars, beats, ticks, rational subdivisions, and clip-local time.

2. Event compiler

Converts the current transport window into timestamped events: note on/off, sample trigger, automation point, parameter ramp, scene morph, MIDI out, graph command, and recorder marker. It should answer: "given beat range A to B, what events happen?"

3. Audio graph and voice engine

Owns persistent track strips, instruments, effects, sends, returns, buses, sidechains, and plugin nodes. It receives timestamped events and turns them into sample-frame voice/render actions.

4. DSP runtime

AudioWorklet now, Rust/WASM later where useful. This layer processes buffers, keeps per-voice state, runs oscillators/filters/envelopes/samplers, and communicates with the main thread through explicit message queues or SharedArrayBuffer ring buffers.

## Proposed Data Shapes

These are illustrative, not final APIs:

```js
const transport = {
  bpm: 122,
  ppq: 960,
  sampleRate: 48000,
  playing: true,
  beat: 128.0,
  phase: 0,
  latencyCompFrames: 0,
};

const event = {
  frame: 12345678,
  beat: 128.25,
  trackId: 'track-1',
  type: 'note_on',
  note: 60,
  velocity: 0.9,
  durationFrames: 12000,
  params: { cutoff: 3200, drive: 0.18 },
};

const graphNode = {
  id: 'filter-1',
  plugin: 'biquad',
  params: { type: 'lowpass', freq: 1200, Q: 0.8 },
  ports: {
    audioIn: [{ id: 'in', channels: 2 }],
    audioOut: [{ id: 'out', channels: 2 }],
    controlIn: [{ id: 'freq_cv', units: 'hz' }],
  },
};
```

The important shift is that pattern generation produces events, and graph compilation produces persistent DSP paths. A note event should not need to allocate a whole mini-mixer strip.

## Migration Plan

### Phase 1: Make The Existing Kernel Observable

Add timing and render diagnostics before major rewrites:

- scheduler jitter histogram against `AudioContext.currentTime`
- event lead-time metrics
- active node/voice counts
- underrun or late-event counters
- offline render test for one deterministic pattern
- golden WAV or feature tests for tone, sample, and noise machines

### Phase 2: Extract Transport And Event Compilation

Move the event-producing parts of `scheduleLoop()` into a kernel module:

- `src/kernel/transport.js`
- `src/kernel/pattern-query.js`
- `src/kernel/event-compiler.js`
- `src/kernel/event-queue.js`

The UI should call transport commands. The compiler should generate events for a lookahead beat range. `scheduleLoop()` becomes a small adapter until it can be removed.

### Phase 3: Make One Clock Authoritative

All modules should consume the same transport/event API. Drum Machine, Acid Machine, Polysynth arp, Monosynth, and FM Synth should stop owning separate timers for synced playback. Standalone module transport can still exist for preview, but when inside CONFUstudio it should be slaved to the kernel transport.

### Phase 4: Promote The Graph Engine

Make `src/engine-graph.js` the primary route compiler:

- graph state is serializable project data
- plugin descriptors define typed ports and parameter metadata
- track strips compile to graph subgraphs
- sends, returns, master, cue, sidechains, and meters are graph nodes
- graph sync handles additions/removals without rebuilding the world
- device/plugin latency is tracked

`AudioEngine.triggerTrack()` should shrink into a compatibility adapter or disappear.

### Phase 5: Replace Per-Trigger Web Audio Chains With Persistent Instruments

Implement first-class instruments as persistent voice engines:

- `confu-basic-synth`: oscillator, noise, ADSR, filter, drive
- `confu-sampler`: one-shot, loop, reverse, slice, crossfade loop, Hermite/sinc resampling
- `confu-drum`: focused drum voices with per-voice parameters

For browser mode, start as AudioWorklets. Later, shared Rust DSP can target WASM, Tauri native, and CLAP.

### Phase 6: Build A Real Sampler/Warp Layer

Add an asset-analysis pipeline:

- decode and normalize sample metadata
- transient detection
- estimated BPM and downbeat
- root note detection, but keep it overrideable
- warp markers and slice maps
- loop crossfade metadata
- offline peak/RMS waveform cache

Playback modes should be explicit: one-shot, chromatic, loop, slice, beat-warp, texture/granular, and resample.

## Practical Next Engineering Steps

1. Create `src/kernel/` and move only timing/event math first. Do not rewrite DSP in the same patch.

2. Define one event format and make the existing sequencer emit that format before calling `triggerTrack()`.

3. Convert Drum Machine and Acid Machine to consume kernel events instead of DOM clock events.

4. Add an `OfflineAudioContext` smoke test for deterministic rendering of a simple four-step pattern.

5. Decide whether Plaits/Rings/Clouds are actual ports with proper licenses and attribution or original CONFUstudio engines with original names.

6. Make the graph compiler own routing for at least one track strip end-to-end: source -> device chain -> sends -> bus -> master.

## Bottom Line

CONFUstudio should not try to become Ableton, VCV Rack, or Sonic Pi. The useful lesson is architectural: proven systems have a hard boundary between musical intent, timed events, graph routing, and DSP execution.

The current app generates sound by asking a UI-driven scheduler to call a large Web Audio trigger function. That is enough for a prototype. The next version should generate sound by compiling musical data into timestamped events, feeding those events into a persistent audio graph, and letting AudioWorklet/WASM DSP engines render buffers deterministically.
