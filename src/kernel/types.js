// CONFUstudio — agent-facing type boundary (Phase 0.3, D-N5)
//
// Checked-JSDoc typedefs for the musical model, commands, plugin descriptors,
// and the two graphs. These are the machine-checkable contracts the harness
// (tools, context assembly, CS-Score) is generated against. NOT a full TS
// migration — just the boundary. Referenced elsewhere via
// `@type {import('./kernel/types.js').Track}` etc., and enforced by
// `@returns` annotations on the state.js factory functions so the typedefs
// and the runtime factories cannot drift apart.
//
// This file has no runtime exports on purpose; `export {}` keeps it a module.

// ─── Musical model ────────────────────────────────────────────────────────────

/**
 * A per-step parameter override map (the heart of Elektron-style p-locking).
 * Keys are track/patch param names; values are the locked value for that step.
 * @typedef {Object.<string, number>} ParamLocks
 */

/**
 * One sequencer step.
 * @typedef {Object} Step
 * @property {boolean} active
 * @property {boolean} accent
 * @property {number} note        MIDI note (chromatic; defaults to track pitch/note)
 * @property {number} velocity    0–1
 * @property {number} probability 0–1
 * @property {string} trigCondition  "always"|"fill"|"not_fill"|"1st"|"not1st"|"every2|3|4"|"A:B"|"random"
 * @property {ParamLocks} paramLocks
 * @property {number} microTime   -0.5..+0.5 fraction of one step duration
 * @property {number} gate        0.05–1.0 fraction of step duration
 */

/**
 * Scene endpoint override applied to a track (crossfader A/B snapshot slice).
 * @typedef {Object} TrackSceneEndpoint
 * @property {number} cutoff
 * @property {number} decay
 * @property {number} delaySend
 */

/**
 * A single track (audio or MIDI) within a pattern's kit. Complete shape — kept
 * in exact sync with `createTrack()` in state.js via its `@returns` annotation.
 * @typedef {Object} Track
 * @property {string} name
 * @property {string} machine  "tone"|"noise"|"sample"|"midi"|"plaits"|"clouds"|"rings"
 * @property {boolean} isMidi
 * @property {string} waveform
 * @property {number} volume
 * @property {number} pan
 * @property {number} pitch
 * @property {number} attack
 * @property {number} decay
 * @property {number} noteLength
 * @property {number} cutoff
 * @property {number} resonance
 * @property {number} drive
 * @property {number} delaySend
 * @property {number} reverbSend
 * @property {number} lfoRate
 * @property {number} lfoDepth
 * @property {string} lfoTarget
 * @property {number|null} midiChannel
 * @property {number|null} midiPort
 * @property {number} trackLength
 * @property {number|null} stepCount
 * @property {number|null} swing
 * @property {boolean} recArmed
 * @property {boolean} mute
 * @property {boolean} solo
 * @property {boolean} cue
 * @property {number} inputGain
 * @property {number} stereoWidth
 * @property {string} outputBus  'master'|'bus1'|'bus2'
 * @property {number|null} groupIndex
 * @property {string} velocityCurve  'linear'|'exp'|'comp'
 * @property {boolean} isSidechainSource
 * @property {number} sidechainAmount
 * @property {string} filterType
 * @property {number} filterQ
 * @property {number} bitDepth
 * @property {number} srDiv
 * @property {number} eqLow
 * @property {number} eqMid
 * @property {number} eqMidFreq
 * @property {number} eqHigh
 * @property {number} plEngine
 * @property {number} plTimbre
 * @property {number} plHarmonics
 * @property {number} plMorph
 * @property {number} clPosition
 * @property {number} clSize
 * @property {number} clDensity
 * @property {number} clTexture
 * @property {number} rnStructure
 * @property {number} rnBrightness
 * @property {number} rnDamping
 * @property {number} rnExciter
 * @property {number} maxVoices
 * @property {boolean} lfoToCutoff
 * @property {boolean} lfoToPitch
 * @property {boolean} lfoToVolume
 * @property {boolean} legato
 * @property {boolean} arpEnabled
 * @property {string} arpMode
 * @property {number} arpRange
 * @property {number} arpSpeed
 * @property {boolean} arpHold
 * @property {number} note
 * @property {boolean} keyTracking
 * @property {number} sampleStart
 * @property {number} sampleEnd
 * @property {number} loopStart
 * @property {number} loopEnd
 * @property {boolean} loopEnabled
 * @property {*} sampleBuffer     runtime AudioBuffer|null (not serialized)
 * @property {string|null} sampleAssetId
 * @property {Array<*>} sampleSlices
 * @property {TrackSceneEndpoint} sceneA
 * @property {TrackSceneEndpoint} sceneB
 * @property {Step[]} steps
 */

/**
 * A pattern: length + a kit of tracks.
 * @typedef {Object} Pattern
 * @property {string} name
 * @property {number} length  1–64 steps
 * @property {{ tracks: Track[] }} kit
 */

/**
 * A bank of patterns.
 * @typedef {Object} Bank
 * @property {string} name
 * @property {Pattern[]} patterns
 */

/**
 * A scene: a named set of per-track parameter snapshots for crossfader morphing.
 * @typedef {Object} Scene
 * @property {string} name
 * @property {Array<Object.<string, number>>} tracks
 * @property {number[]} [noInterp]
 */

/**
 * A project: banks + scenes + metadata.
 * @typedef {Object} Project
 * @property {string} name
 * @property {string} author
 * @property {string} description
 * @property {number} createdAt
 * @property {string} assetId
 * @property {Bank[]} banks
 * @property {Scene[]} scenes
 */

// ─── Commands ───────────────────────────────────────────────────────────────

/**
 * A command — the only legal state mutation, executed via the command bus.
 * `type` selects the handler; the remaining fields are handler-specific args
 * (bankIndex, patternIndex, trackIndex, key, value, stepIndex, param, …).
 * Loosely typed on purpose: this is a dynamic dispatch envelope.
 * @typedef {{ type: string } & Object.<string, *>} Command
 */

/**
 * Result returned by a command handler. Carries `changed`/`summary` plus
 * handler-specific extras (signalId, connectionId, _graph, …), so it is
 * index-typed rather than exact.
 * @typedef {{ changed: boolean, summary?: string, signalId?: number } & Object.<string, *>} CommandResult
 */

// ─── Plugin registry (Module SDK v1 descriptor seed) ──────────────────────────

/**
 * A typed port on a plugin/module.
 * @typedef {Object} PluginPort
 * @property {string} id
 * @property {'in'|'out'} direction
 * @property {'audio'|'control'|'event'} signal
 * @property {string} [label]
 */

/**
 * A single parameter definition. `unit`/`curve`/`smooth` are the Module SDK v1
 * additions the agent + UI both consume (A4).
 * @typedef {Object} PluginParamDef
 * @property {*} [default]
 * @property {number} [min]
 * @property {number} [max]
 * @property {Array<*>} [values]
 * @property {string} [unit]
 * @property {string} [curve]
 * @property {number} [smooth]
 */

/**
 * A plugin/module descriptor as registered in the plugin registry. Index-typed
 * so Module SDK v1 fields (version, dsp, ui, state, presets) attach without
 * breaking the boundary.
 * @typedef {{ id?: string, type: string, label?: string, ports?: PluginPort[], params?: Object.<string, PluginParamDef> } & Object.<string, *>} PluginDescriptor
 */

// ─── Audio routing graph (serializable) ───────────────────────────────────────

/**
 * A node in the serializable audio graph (a plugin instance).
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} plugin
 * @property {Object.<string, *>} params
 * @property {{ x:number, y:number, label:string, color:string, collapsed:boolean } & Object.<string, *>} meta
 */

/**
 * A typed connection between two graph nodes' ports.
 * @typedef {Object} Connection
 * @property {string} id
 * @property {string} fromNode
 * @property {string} fromPort
 * @property {string} toNode
 * @property {string} toPort
 */

/**
 * The serializable audio graph compiled by ModularEngine.
 * @typedef {Object} AudioGraph
 * @property {Object.<string, GraphNode>} nodes
 * @property {Connection[]} connections
 */

// ─── Signal graph (edit DAG — undo/redo + branch auditioning substrate) ───────

/**
 * One recorded command in the edit DAG.
 * @typedef {Object} SignalNode
 * @property {number} id
 * @property {Command} command
 * @property {number} timestamp
 * @property {number|null} parentId
 * @property {boolean} changed
 * @property {string|null} summary
 */

/**
 * The append-only edit DAG with cursor + branch heads.
 * @typedef {Object} SignalGraph
 * @property {SignalNode[]} nodes
 * @property {Array<{ from:number, to:number }>} edges
 * @property {number} nextId
 * @property {number|null} headId
 * @property {number|null} cursorId
 */

export {};
