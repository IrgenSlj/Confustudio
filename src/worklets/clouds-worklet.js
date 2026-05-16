// CONFUstudio — cs-clouds AudioWorkletProcessor
// Granular synthesizer — Hann-windowed grain clouds with scatter, pitch, and density control

const TWO_PI = 2 * Math.PI;

class CloudsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.source = null;
    this.srcRate = 44100;
    this.ctxRate = 44100;

    // Pre-allocated grain pool — never allocate inside process()
    this.grainPool = Array.from({ length: 20 }, () => ({
      active: false,
      position: 0,
      increment: 1,
      remaining: 0,
      envTotal: 0,
      envPhase: 0,
    }));

    // Cloud state
    this.cloudActive = false;
    this.cloudRemaining = 0;

    // Spawn state
    this.spawnCounter = 0;
    this.spawnInterval = 0;

    // Cached trigger parameters — stored on trigger, read in process()
    this.trigParams = {
      position: 0,
      texture: 0,
      pitch: 1,
    };
    this.grainSamples = 0;
    this.maxGrains = 8;

    // Noise fallback state
    this._noiseVal = 0;
    this._noiseTick = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === 'load') {
        this.source = new Float32Array(msg.buffer);
        this.srcRate = msg.sampleRate;
        this.ctxRate = msg.ctxRate;
      } else if (msg.type === 'trigger') {
        const { position, size, density, texture, pitch, duration } = msg;

        // Map size 0–1 → 0.02–0.4 seconds, then to samples
        const grainSeconds = 0.02 + size * (0.4 - 0.02);
        const grainSamples = Math.max(1, Math.round(grainSeconds * this.ctxRate));

        // Map density 0–1 → 2–16 simultaneous grains
        const maxGrains = Math.round(2 + density * (16 - 2));

        // Interval between grain spawns in samples
        const spawnInterval = Math.max(1, grainSamples / maxGrains);

        this.grainSamples = grainSamples;
        this.maxGrains = maxGrains;
        this.spawnInterval = spawnInterval;
        this.spawnCounter = 0; // Spawn immediately on first sample

        this.trigParams.position = position;
        this.trigParams.texture = texture;
        this.trigParams.pitch = pitch;

        this.cloudActive = true;
        this.cloudRemaining = Math.max(1, Math.round(duration * this.ctxRate));

        // Deactivate all grains so they get fresh spawns
        for (let i = 0; i < 20; i++) {
          this.grainPool[i].active = false;
        }
      } else if (msg.type === 'stop') {
        this.cloudActive = false;
        this.cloudRemaining = 0;
        for (let i = 0; i < 20; i++) {
          this.grainPool[i].active = false;
        }
      }
    };
  }

  _spawnGrain() {
    const pool = this.grainPool;
    let slot = null;
    for (let i = 0; i < 20; i++) {
      if (!pool[i].active) {
        slot = pool[i];
        break;
      }
    }
    if (slot === null) return; // All slots occupied

    const sourceLen = this.source ? this.source.length : 0;
    const { position, texture, pitch } = this.trigParams;
    const grainSamples = this.grainSamples;

    let startPos;
    if (sourceLen > 1) {
      const scatter = (Math.random() - 0.5) * texture;
      startPos = (position + scatter) * (sourceLen - 1);
      if (startPos < 0) startPos = 0;
      if (startPos > sourceLen - 2) startPos = sourceLen - 2;
    } else {
      startPos = 0;
    }

    slot.position = startPos;
    slot.increment = pitch * (this.srcRate / this.ctxRate);
    slot.remaining = grainSamples;
    slot.envTotal = grainSamples;
    slot.envPhase = 0;
    slot.active = true;
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    const pool = this.grainPool;
    const src = this.source;
    const srcLen = src ? src.length : 0;
    const numSamples = output.length; // 128

    for (let s = 0; s < numSamples; s++) {
      // Advance cloud countdown
      if (this.cloudActive) {
        this.cloudRemaining--;
        if (this.cloudRemaining <= 0) {
          this.cloudActive = false;
        }
      }

      // Spawn grains on interval while cloud is active
      if (this.cloudActive) {
        this.spawnCounter--;
        if (this.spawnCounter <= 0) {
          this._spawnGrain();
          this.spawnCounter = this.spawnInterval;
        }
      }

      // Sum active grains
      let sum = 0;
      let activeCount = 0;

      for (let i = 0; i < 20; i++) {
        const grain = pool[i];
        if (!grain.active) continue;

        // Hann window envelope
        const env = 0.5 * (1 - Math.cos((TWO_PI * grain.envPhase) / grain.envTotal));

        // Read source with linear interpolation (or noise fallback)
        let sample;
        if (srcLen > 1) {
          const idx = grain.position;
          const i0 = idx | 0; // floor
          const i1 = i0 + 1;
          const frac = idx - i0;
          const s0 = i0 >= 0 && i0 < srcLen ? src[i0] : 0;
          const s1 = i1 >= 0 && i1 < srcLen ? src[i1] : 0;
          sample = s0 + frac * (s1 - s0);
        } else {
          // No source loaded — use band-limited noise updated every 8 samples
          this._noiseTick++;
          if (this._noiseTick >= 8) {
            this._noiseVal = Math.random() * 2 - 1;
            this._noiseTick = 0;
          }
          sample = this._noiseVal;
        }

        sum += sample * env;
        activeCount++;

        // Advance grain
        grain.position += grain.increment;
        grain.envPhase++;
        grain.remaining--;

        if (grain.remaining <= 0) {
          grain.active = false;
        }
      }

      // Normalize to prevent clipping
      output[s] = sum / Math.max(1, activeCount * 0.5);
    }

    // Keep processor alive while cloud is running or grains are still active
    if (this.cloudActive) return true;
    for (let i = 0; i < 20; i++) {
      if (pool[i].active) return true;
    }
    return false;
  }
}

registerProcessor('cs-clouds', CloudsProcessor);
