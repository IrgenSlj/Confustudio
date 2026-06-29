// Modular Engine — compiles signalGraph into Web Audio nodes
import { getPlugin } from './plugins/index.js';

const WORKLET_MODULES = [
  '/src/worklets/resampler-worklet.js',
  '/src/worklets/bitcrusher-worklet.js',
  '/src/worklets/plaits-worklet.js',
  '/src/worklets/clouds-worklet.js',
  '/src/worklets/rings-worklet.js',
];

export class ModularEngine {
  constructor(ctx, masterInput) {
    this.ctx = ctx;
    this.masterInput = masterInput;
    this.nodeMap = new Map();
    this.connectionMap = new Map();
    this.enabled = false;
    this._workletsReady = false;
    this._workletInit = null;
  }

  async initWorklets() {
    if (this._workletsReady) return;
    if (typeof AudioWorkletNode !== 'function') {
      console.warn('[ModularEngine] AudioWorkletNode not available');
      return;
    }
    const results = await Promise.allSettled(
      WORKLET_MODULES.map((url) => this.ctx.audioWorklet.addModule(url)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.filter((r) => r.status === 'rejected').length;
    if (fail > 0) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          console.warn(`[ModularEngine] Worklet load failed: ${WORKLET_MODULES[i]}`, results[i].reason);
        }
      }
    }
    this._workletsReady = ok > 0;
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

    for (const id of currentIds) {
      if (!graphIds.has(id)) this.removeNode(id);
    }

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
    const params = nodeDef.params || {};
    const compiled = this._instantiate(plugin, params);
    if (compiled) {
      const entry = { ...compiled, id, plugin: nodeDef.plugin, _params: { ...params } };
      this._preparePorts(plugin, entry);
      this.nodeMap.set(id, entry);
    }
  }

  _preparePorts(plugin, entry) {
    const ctx = this.ctx;
    const ports = {};
    const newNodes = [];

    for (const port of plugin.ports || []) {
      if (port.direction === 'out') {
        const g = ctx.createGain();
        g.gain.value = 1;
        entry.outputNode.connect(g);
        ports[port.id] = g;
        newNodes.push(g);
      } else if (port.direction === 'in') {
        const g = ctx.createGain();
        g.gain.value = 1;
        g.connect(entry.inputNode);
        ports[port.id] = g;
        newNodes.push(g);
      }
    }

    entry.ports = ports;
    entry.allNodes = [...(entry.allNodes || []), ...newNodes];
  }

  _getPortOrNode(entry, portId, fallback) {
    return (entry.ports && portId && entry.ports[portId]) || fallback;
  }

  _compileConnection(conn) {
    const fromEntry = this.nodeMap.get(conn.fromNode);
    const toEntry = this.nodeMap.get(conn.toNode);
    if (!fromEntry || !toEntry) return;

    const fromNode = this._getPortOrNode(fromEntry, conn.fromPort, fromEntry.outputNode);
    const toNode = this._getPortOrNode(toEntry, conn.toPort, toEntry.inputNode);

    try {
      fromNode.connect(toNode);
      this.connectionMap.set(conn.id, conn);
    } catch (e) {
      console.warn(`[ModularEngine] connect ${conn.fromNode} -> ${conn.toNode} failed:`, e);
    }
  }

  addNode(id, nodeDef) {
    this._compileNode(id, nodeDef);
  }

  removeNode(id) {
    const entry = this.nodeMap.get(id);
    if (!entry) return;
    try {
      if (entry._plaitsReTrigger) clearInterval(entry._plaitsReTrigger);
      if (entry.workletNode) {
        entry.workletNode.port.postMessage({ type: 'stop' });
      }
      for (const n of entry.allNodes) {
        n.disconnect();
      }
    } catch (_) {}
    this.nodeMap.delete(id);
  }

  setNodeParam(nodeId, key, value) {
    const entry = this.nodeMap.get(nodeId);
    if (!entry) return;
    const plugin = getPlugin(entry.plugin);
    if (!plugin) return;

    // Store param value in entry for later use (e.g., re-trigger)
    if (entry._params) entry._params[key] = value;

    if (entry.workletNode) {
      switch (entry.plugin) {
        case 'plaits': {
          entry.workletNode.port.postMessage({
            type: 'trigger',
            ...this._pluckParams(entry._params || {}, ['engine', 'timbre', 'harmonics', 'morph', 'pitch']),
            frequency: this._midiToHz((entry._params?.pitch ?? 60)),
            sampleRate: this.ctx.sampleRate,
          });
          return;
        }
        case 'rings': {
          entry.workletNode.port.postMessage({
            type: 'trigger',
            ...this._pluckParams(entry._params || {}, ['pitch', 'structure', 'brightness', 'damping']),
            frequency: this._midiToHz((entry._params?.pitch ?? 60)),
            exciter: 2,
            sampleRate: this.ctx.sampleRate,
          });
          return;
        }
        case 'bitcrusher': {
          entry.workletNode.port.postMessage({ type: 'config', bitDepth: value, srDiv: 2 });
          return;
        }
      }
    }

    const audioNode = entry.inputNode;
    if (!audioNode) return;
    switch (entry.plugin) {
      case 'gain': audioNode.gain.value = value; break;
      case 'biquad':
        if (key === 'freq') audioNode.frequency.value = value;
        if (key === 'Q') audioNode.Q.value = value;
        break;
      case 'panner': audioNode.pan.value = value; break;
      case 'master-out': audioNode.gain.value = value; break;
    }
  }

  _pluckParams(params, keys) {
    const result = {};
    for (const k of keys) {
      if (params[k] !== undefined) result[k] = params[k];
    }
    return result;
  }

  addConnection(connDef) {
    this._compileConnection(connDef);
  }

  removeConnection(id) {
    const conn = this.connectionMap.get(id);
    if (conn) {
      const fromEntry = this.nodeMap.get(conn.fromNode);
      const toEntry = this.nodeMap.get(conn.toNode);
      if (fromEntry && toEntry) {
        const fromNode = this._getPortOrNode(fromEntry, conn.fromPort, fromEntry.outputNode);
        const toNode = this._getPortOrNode(toEntry, conn.toPort, toEntry.inputNode);
        try { fromNode.disconnect(toNode); } catch (_) {}
      }
      this.connectionMap.delete(id);
    }
  }

  getAudioNode(nodeId, portId) {
    const entry = this.nodeMap.get(nodeId);
    if (!entry) return null;
    if (portId && entry.ports?.[portId]) return entry.ports[portId];
    return entry.inputNode || null;
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

        // ── AudioWorklet nodes ────────────────────────────────────────────

        case 'bitcrusher': {
          if (typeof AudioWorkletNode !== 'function') return null;
          const bc = new AudioWorkletNode(ctx, 'cs-bitcrusher', {
            numberOfInputs: 1, numberOfOutputs: 1,
          });
          bc.port.postMessage({ type: 'config', bitDepth: params.bitDepth ?? 16, srDiv: params.sampleRateDiv ?? 2 });
          const out = ctx.createGain();
          bc.connect(out);
          return { inputNode: bc, outputNode: out, allNodes: [bc, out], workletNode: bc };
        }

        case 'plaits': {
          if (typeof AudioWorkletNode !== 'function') return null;
          const pn = new AudioWorkletNode(ctx, 'cs-plaits');
          const out = ctx.createGain();
          out.gain.value = 0.72;
          pn.connect(out);
          const entryRef = { _params: { ...params } };
          const trig = () => pn.port.postMessage({
            type: 'trigger', engine: entryRef._params.engine ?? 0,
            frequency: this._midiToHz(entryRef._params.pitch ?? 60),
            timbre: entryRef._params.timbre ?? 0.5,
            harmonics: entryRef._params.harmonics ?? 0.5,
            morph: entryRef._params.morph ?? 0.5,
            sampleRate: ctx.sampleRate,
          });
          trig();
          const _plaitsReTrigger = setInterval(trig, 2000);
          return {
            inputNode: out, outputNode: out, allNodes: [pn, out], workletNode: pn,
            _plaitsReTrigger, _params: entryRef._params,
            cleanup() { clearInterval(_plaitsReTrigger); },
          };
        }

        case 'rings': {
          if (typeof AudioWorkletNode !== 'function') return null;
          const rn = new AudioWorkletNode(ctx, 'cs-rings');
          const out = ctx.createGain();
          out.gain.value = 0.72;
          rn.connect(out);
          rn.port.postMessage({
            type: 'trigger',
            frequency: this._midiToHz(params.pitch ?? 60),
            structure: params.structure ?? 0.5,
            brightness: params.brightness ?? 0.5,
            damping: params.damping ?? 0.5,
            exciter: 2, // continuous bow
            sampleRate: ctx.sampleRate,
          });
          return { inputNode: out, outputNode: out, allNodes: [rn, out], workletNode: rn };
        }

        case 'clouds': {
          if (typeof AudioWorkletNode !== 'function') return null;
          const cn = new AudioWorkletNode(ctx, 'cs-clouds');
          const out = ctx.createGain();
          out.gain.value = 0.5;
          cn.connect(out);
          // Load a default tone buffer
          const bufLen = ctx.sampleRate * 2;
          const buf = new Float32Array(bufLen);
          for (let i = 0; i < bufLen; i++) {
            buf[i] = Math.sin(2 * Math.PI * i * (200 + (i / bufLen) * 800) / ctx.sampleRate) * 0.4;
          }
          const transfer = buf.slice(0);
          cn.port.postMessage(
            { type: 'load', buffer: buf, sampleRate: ctx.sampleRate, ctxRate: ctx.sampleRate },
            [transfer.buffer],
          );
          cn.port.postMessage({
            type: 'trigger',
            position: params.position ?? 0,
            size: params.size ?? 0.4,
            density: params.density ?? 0.5,
            texture: params.texture ?? 0.3,
            pitch: params.pitch ?? 1,
            duration: 60,
          });
          return { inputNode: out, outputNode: out, allNodes: [cn, out], workletNode: cn };
        }

        case 'sampler': {
          if (typeof AudioWorkletNode !== 'function') return null;
          const sn = new AudioWorkletNode(ctx, 'cs-resampler', {
            outputChannelCount: [2],
          });
          const out = ctx.createGain();
          out.gain.value = params.volume ?? 0.72;
          sn.connect(out);
          // Default loop tone
          const toneLen = ctx.sampleRate * 1;
          const l = new Float32Array(toneLen);
          const r = new Float32Array(toneLen);
          for (let i = 0; i < toneLen; i++) {
            const s = Math.sin(2 * Math.PI * i * this._midiToHz(params.pitch ?? 60) / ctx.sampleRate) * 0.3;
            l[i] = s;
            r[i] = s;
          }
          sn.port.postMessage(
            {
              type: 'load',
              channels: [l.buffer, r.buffer],
              playbackRate: params.playbackRate ?? 1,
              sampleRate: ctx.sampleRate,
              ctxRate: ctx.sampleRate,
              loopEnabled: true,
              loopStart: 0,
              loopEnd: toneLen,
              position: 0,
            },
            [l.buffer, r.buffer],
          );
          return { inputNode: out, outputNode: out, allNodes: [sn, out], workletNode: sn };
        }

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
