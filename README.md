# CONFUstudio

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-brightgreen)](./package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

> **A digital, modular, open-source reproduction of a hybrid techno/house home studio — a sequencer brain, a sampler, and monumental synth voices — driven by one agent harness that works in parameters and performances, never in rendered black-box audio.**

CONFUstudio runs in the browser (installable as a PWA), with a dependency-light Node server for static hosting and an optional local AI bridge. Frontend is plain HTML, CSS, and modern JavaScript — no build step, no framework. The moat is **owning the engine**: every sound is an inspectable, re-editable patch; the agent designs patches, writes patterns, routes signals, rides mixes, and performs — it never generates waveforms.

## The thesis (locked)

1. **Parameters, not renders.** Every sound is state. The agent edits state through the same command bus the UI uses — no private path.
2. **Branches, not mutations.** Agent proposals materialize as branches of the edit-history DAG; you audition against head, then merge or discard. Merge is always a human click.
3. **Perception is mandatory.** The agent can _hear_: offline render → feature extraction → musical lint → self-correct. No perception, no "agentic" label.
4. **One harness, three stations.** Session Artist (compose/sound-design), Studio Master (mix + project memory), Co-Performer (quantized-launch live actions).
5. **Community-extensible.** Instruments are built against a public Module SDK; third parties ship voices without touching core.
6. **Original identity.** Behavioral homage to classic hardware; every name, glyph, preset, and panel is original — no trademarked names anywhere.

**Product hierarchy (breaks every tie, top wins):** sound-engine quality → ease of use → advanced music-making.

## Status & roadmap

The work is organized into blocking phases: **0** stabilize · **A** engine to professional quality + Module SDK · **B** harness + branch auditioning · **C** perception · **D** studio-master memory/skills · **E** co-performer live mode · **F** external devices.

- **Live status:** [`docs/ROADMAP.md`](./docs/ROADMAP.md) — the checklist across all phases.
- **Session handoff:** [`NEXT_SESSION.md`](./NEXT_SESSION.md).
- **Authoritative specs:** [`docs/CONFUSTUDIO_CODE_BRIEF.md`](./docs/CONFUSTUDIO_CODE_BRIEF.md) (phasing/engine/SDK), [`docs/CONFUSTUDIO_AI_BRIEF.md`](./docs/CONFUSTUDIO_AI_BRIEF.md) (harness — authoritative), [`docs/CONFUSTUDIO_DESIGN_BRIEF.md`](./docs/CONFUSTUDIO_DESIGN_BRIEF.md) (UI/UX), and [`docs/STUDIO_MANUAL.md`](./docs/STUDIO_MANUAL.md) (human + agent knowledge base).

## Architecture

```
UI shell (pages, studio canvas, module chassis) — edits state ONLY via the command bus
        │
Agent harness (src/harness/)  — loop · context · memory · skills · stations · branches
        │
Tool registry (MCP-shaped)    — device 0: engine tools · perception · branch · adapters
        │
Command bus + signal graph    — the edit DAG (undo/redo + branch auditioning substrate)
        │
Kernel (src/kernel/) — PURE   — musical model · event compiler · transport math · CS-Score
        │
Audio graph + ModularEngine   — persistent instruments
        │
DSP runtime — AudioWorklets    + offline render path (OfflineAudioContext) for perception
```

Hard rules: **no private path** (agent uses the UI's commands); **AI never touches the audio thread**; **the kernel stays pure** (no DOM, no Web Audio, no globals — fully unit-testable). Types are enforced at the agent-facing boundary via checked-JSDoc (`jsconfig.json`, `npm run test:types`) — not a full TypeScript migration.

**CS-Score** ([`docs/CS_SCORE.md`](./docs/CS_SCORE.md)) is the agent's compact, lossless text notation for patterns — the reason a music agent can be as fluent as a coding agent.

## Running

Requirements: Node 20+ and a modern browser with Web Audio + MediaRecorder.

```bash
npm start          # serves http://127.0.0.1:4173 (COOP/COEP on, for AudioWorklet/SharedArrayBuffer)
npm test           # lint · types · syntax · kernel · score · perception · state · server · ui-smoke
docker build -t confustudio . && docker run --rm -p 4173:4173 confustudio
```

Optional AI bridge (keys stay server-side, never sent to the browser):

```bash
export ANTHROPIC_API_KEY=...   ANTHROPIC_MODEL=claude-sonnet-5
export OPENAI_API_KEY=...      OPENAI_MODEL=gpt-4.1-mini
# or a local OpenAI-compatible endpoint / Ollama — see server.mjs provider catalog
```

## What's implemented today

- **Sequencer brain:** 64-step engine, p-locks per step, trig conditions (`always/1st/every-N/A:B/fill`), probability, micro-timing, 8 audio + 8 MIDI tracks, 8 banks × 16 patterns, scene A/B crossfader morph, arranger/song mode.
- **Sound:** tone/noise/sample machines; per-track filter (LP/BP/HP), ADSR, LFO, drive, EQ, bitcrusher + sample-rate reduction; `cs-resampler` AudioWorklet (4-point Hermite) for pitched samples; convolution reverb + delay sends.
- **Mixer/routing:** per-track + 8 group buses with **real** metering (AnalyserNode taps); master bus with soft limiting; a modular patch-cable canvas with typed ports (audio/control/event) and persisted layout.
- **Perception (seed):** BS.1770 K-weighted **LUFS** metering (`src/kernel/loudness.js`), surfaced as a real momentary/short-term master meter on the mixer.
- **MIDI:** WebMIDI I/O, clock out (24 ppqn) with start/stop transport.
- **Platform:** installable PWA; COOP/COEP → SharedArrayBuffer; optional AI bridge (OpenAI/Anthropic/local/Ollama); portable project packages with embedded audio assets + workspace layout.

Stubbed / not real yet (see the roadmap): Plaits/Clouds/Rings/modular-sampler worklet voices, the agent loop (currently single-shot `actions/plan`, no tool-calling/memory/perception-gating), real Ableton Link.

The `confu/` directory is a parked Electron shell (unmaintained until Phase F — no desktop packaging before then).

## Non-goals (locked)

No CLAP/VST3/AU · no Tauri desktop until Phase F · no mobile/responsive pass (desktop + PWA only) · no Rust/WASM DSP in this brief (worklets suffice; the kernel boundary keeps the door open) · no full TypeScript migration · no audio-generation models of any kind.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md). Security reports: [SECURITY.md](./SECURITY.md). Everything ships behind a green `npm test`, verified in a real browser.

## License

[Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE) for attributions.
