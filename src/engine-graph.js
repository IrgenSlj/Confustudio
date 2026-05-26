// Modular Engine — compiles signalGraph into Web Audio nodes
import { getPlugin } from './plugins/index.js';

export class ModularEngine {
  constructor(ctx, masterInput) {
    this.ctx = ctx;
    this.masterInput = masterInput;
    this.nodeMap = new Map();
    this.connectionMap = new Map();
    this.enabled = false;
    this._workletInit = null;
  }

  compile(graph) {
    this.teardown();
    if (!graph || !graph.nodes) return;

    for (const [id, nodeDef] of Object.entries(graph.nodes)) {
      this._compileNode(id, nodeDef);
    }

    for (const conn of graph.connections || []) {
      this._compileConnection(conn);
    }

    this.enabled = true;
  }

  sync(graph) {
    if (!graph) return;
    const currentIds = new Set(this.nodeMap.keys());
    const graphIds = new Set(Object.keys(graph.nodes || {}));

    // Remove deleted nodes
    for (const id of currentIds) {
      if (!graphIds.has(id)) this.removeNode(id);
    }

    // Add or update nodes
    for (const [id, nodeDef] of Object.entries(graph.nodes || {})) {
      if (this.nodeMap.has(id)) {
        const existing = this.nodeMap.get(id);
        if (existing.plugin !== nodeDef.plugin) {
          this.removeNode(id);
          this._compileNode(id, nodeDef);
        }
      } else {
        this._compileNode(id, nodeDef);
      }
    }

    // Sync connections
    const currentConns = new Set(this.connectionMap.keys());
    const graphConns = new Set((graph.connections || []).map(c => c.id));
    for (const id of currentConns) {
      if (!graphConns.has(id)) this.removeConnection(id);
    }
    for (const conn of graph.connections || []) {
      if (!this.connectionMap.has(conn.id)) {
        this._compileConnection(conn);
      }
    }
  }

  _compileNode(id, nodeDef) {
    const plugin = getPlugin(nodeDef.plugin);
    if (!plugin) {
      console.warn(`[ModularEngine] Unknown plugin: ${nodeDef.plugin}`);
      return;
    }
    const compiled = this._instantiate(plugin, nodeDef.params || {});
    if (compiled) {
      this.nodeMap.set(id, { ...compiled, id, plugin: nodeDef.plugin });
    }
  }

  _compileConnection(conn) {
    const fromEntry = this.nodeMap.get(conn.fromNode);
    const toEntry = this.nodeMap.get(conn.toNode);
    if (!fromEntry || !toEntry) return;

    try {
      fromEntry.outputNode.connect(toEntry.inputNode);
      this.connectionMap.set(conn.id, conn);
    } catch (e) {
      console.warn(`[ModularEngine] connect ${conn.fromNode} -> ${conn.toNode} failed:`, e);
    }
  }

  addNode(id, nodeDef) {
    this._compileNode(id, nodeDef);
    if (!this.masterInput || !this.enabled) return;
    // If this node has no outgoing connections, connect it to master
    // (handled by syncConnections)
  }

  removeNode(id) {
    const entry = this.nodeMap.get(id);
    if (!entry) return;
    try {
      for (const n of entry.allNodes) {
        n.disconnect();
      }
    } catch (_) {}
    this.nodeMap.delete(id);
  }

  addConnection(connDef) {
    this._compileConnection(connDef);
  }

  removeConnection(id) {
    // Disconnect is best-effort; we can't easily reverse a specific
    // `connect()` call without tracking the exact wiring, so recompile
    // the affected nodes.
    const conn = this.connectionMap.get(id);
    if (conn) {
      const fromEntry = this.nodeMap.get(conn.fromNode);
      const toEntry = this.nodeMap.get(conn.toNode);
      if (fromEntry && toEntry) {
        try { fromEntry.outputNode.disconnect(toEntry.inputNode); } catch (_) {}
      }
      this.connectionMap.delete(id);
    }
  }

  getAudioNode(nodeId) {
    return this.nodeMap.get(nodeId)?.inputNode || null;
  }

  teardown() {
    for (const [id] of this.nodeMap) {
      this.removeNode(id);
    }
    this.nodeMap.clear();
    this.connectionMap.clear();
    this.enabled = false;
  }

  _instantiate(plugin, params) {
    const ctx = this.ctx;
    try {
      switch (plugin.id) {
        case 'oscillator':
        case 'tone': {
          const osc = ctx.createOscillator();
          osc.type = params.waveform || 'triangle';
          osc.frequency.value = this._midiToHz(params.pitch ?? 60);
          const out = ctx.createGain();
          out.gain.value = params.volume ?? 0.72;
          osc.connect(out);
          osc.start();
          return { inputNode: out, outputNode: out, allNodes: [osc, out] };
        }

        case 'noise': {
          const bufferSize = ctx.sampleRate * 2;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          const color = params.color || 'white';
          for (let i = 0; i < bufferSize; i++) {
            if (color === 'white') {
              data[i] = Math.random() * 2 - 1;
            } else {
              const t = 1 - i / bufferSize;
              data[i] = (Math.random() * 2 - 1) * (color === 'pink' ? t : t * t);
            }
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          const out = ctx.createGain();
          out.gain.value = params.level ?? 0.72;
          src.connect(out);
          src.start();
          return { inputNode: out, outputNode: out, allNodes: [src, out] };
        }

        case 'biquad': {
          const filter = ctx.createBiquadFilter();
          filter.type = params.type || 'lowpass';
          filter.frequency.value = params.freq ?? 1000;
          filter.Q.value = params.Q ?? 0.707;
          return { inputNode: filter, outputNode: filter, allNodes: [filter] };
        }

        case 'gain': {
          const g = ctx.createGain();
          g.gain.value = params.mute ? 0 : (params.level ?? 0.72);
          return { inputNode: g, outputNode: g, allNodes: [g] };
        }

        case 'panner': {
          const panner = ctx.createStereoPanner();
          panner.pan.value = params.pan ?? 0;
          return { inputNode: panner, outputNode: panner, allNodes: [panner] };
        }

        case 'eq-3band': {
          const low = ctx.createBiquadFilter();
          low.type = 'lowshelf';
          low.frequency.value = 200;
          low.gain.value = params.low ?? 0;
          const mid = ctx.createBiquadFilter();
          mid.type = 'peaking';
          mid.frequency.value = params.midFreq ?? 1000;
          mid.Q.value = 1;
          mid.gain.value = params.mid ?? 0;
          const high = ctx.createBiquadFilter();
          high.type = 'highshelf';
          high.frequency.value = 6000;
          high.gain.value = params.high ?? 0;
          low.connect(mid);
          mid.connect(high);
          return { inputNode: low, outputNode: high, allNodes: [low, mid, high] };
        }

        case 'compressor': {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = params.threshold ?? -24;
          comp.ratio.value = params.ratio ?? 4;
          comp.attack.value = params.attack ?? 0.003;
          comp.release.value = params.release ?? 0.25;
          return { inputNode: comp, outputNode: comp, allNodes: [comp] };
        }

        case 'delay': {
          const delay = ctx.createDelay(2);
          delay.delayTime.value = params.time ?? 0.28;
          const fb = ctx.createGain();
          fb.gain.value = params.feedback ?? 0.38;
          const wet = ctx.createGain();
          wet.gain.value = params.mix ?? 0.3;
          delay.connect(fb);
          fb.connect(delay);
          delay.connect(wet);
          return { inputNode: delay, outputNode: wet, allNodes: [delay, fb, wet] };
        }

        case 'reverb': {
          const convolver = ctx.createConvolver();
          const irLen = ctx.sampleRate * 1.5;
          const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
          for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < irLen; i++) {
              d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.3));
            }
          }
          convolver.buffer = ir;
          const wet = ctx.createGain();
          wet.gain.value = params.mix ?? 0.3;
          const dry = ctx.createGain();
          dry.gain.value = 1 - (params.mix ?? 0.3);
          const input = ctx.createGain();
          const output = ctx.createGain();
          input.connect(dry);
          dry.connect(output);
          input.connect(convolver);
          convolver.connect(wet);
          wet.connect(output);
          return { inputNode: input, outputNode: output, allNodes: [input, dry, convolver, wet, output] };
        }

        case 'saturator': {
          const shaper = ctx.createWaveShaper();
          const drive = params.drive ?? 0;
          const k = drive * 10 + 1;
          const samples = 256;
          const curve = new Float32Array(samples);
          for (let i = 0; i < samples; i++) {
            const x = (i / (samples - 1)) * 2 - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
          }
          shaper.curve = curve;
          shaper.oversample = '2x';
          const out = ctx.createGain();
          shaper.connect(out);
          return { inputNode: shaper, outputNode: out, allNodes: [shaper, out] };
        }

        case 'chorus': {
          const d = ctx.createDelay(0.05);
          d.delayTime.value = 0.01;
          const lfo = ctx.createOscillator();
          lfo.frequency.value = params.rate ?? 1;
          const depthGain = ctx.createGain();
          depthGain.gain.value = (params.depth ?? 0.5) * 0.01;
          lfo.connect(depthGain);
          depthGain.connect(d.delayTime);
          lfo.start();
          const wet = ctx.createGain();
          wet.gain.value = 0.5;
          const dry = ctx.createGain();
          const input = ctx.createGain();
          const output = ctx.createGain();
          input.connect(dry);
          dry.connect(output);
          input.connect(d);
          d.connect(wet);
          wet.connect(output);
          return { inputNode: input, outputNode: output, allNodes: [input, dry, d, lfo, depthGain, wet, output] };
        }

        case 'master-out': {
          const g = ctx.createGain();
          g.gain.value = params.level ?? 0.82;
          if (this.masterInput) g.connect(this.masterInput);
          return { inputNode: g, outputNode: g, allNodes: [g] };
        }

        case 'sampler':
        case 'plaits':
        case 'clouds':
        case 'rings':
          console.warn(`[ModularEngine] ${plugin.id} requires AudioWorklet — not yet implemented`);
          return null;

        default:
          console.warn(`[ModularEngine] No instantiation for plugin: ${plugin.id}`);
          return null;
      }
    } catch (e) {
      console.warn(`[ModularEngine] Error creating ${plugin.id}:`, e);
      return null;
    }
  }

  _midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}
