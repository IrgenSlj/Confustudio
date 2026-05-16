// CONFUstudio v3 — MIDI module
// Extracted from engine.js

export let midiOutputs = [];

export async function initMidi() {
  if (!navigator.requestMIDIAccess) return;
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    midiOutputs = [];
    access.outputs.forEach((output) => midiOutputs.push(output));
    access.onstatechange = () => {
      midiOutputs = [];
      access.outputs.forEach((output) => midiOutputs.push(output));
    };
  } catch (err) {
    console.warn('WebMIDI unavailable:', err);
  }
}

export function getMidiOutputById(id) {
  if (!id) return null;
  return midiOutputs.find((output) => (output.id || output.name) === id) || null;
}

export function attachMidiMethods(proto) {
  proto.setBpm = function (bpm) {
    this._bpm = bpm;
  };

  proto.sendMidiNote = function (track, note, velocity, durationSec) {
    if (!this.midiOutput) return;
    const ch = ((track.midiChannel ?? this.midiChannel ?? 1) - 1) & 0xf;
    const vel = Math.round(velocity * 127);
    this.midiOutput.send([0x90 | ch, note, vel]);
    setTimeout(() => this.midiOutput.send([0x80 | ch, note, 0]), durationSec * 1000);
  };

  proto.startMidiClock = function (bpm) {
    this.stopMidiClock(); // clear any existing clock
    if (!this.midiOutput) return;

    const intervalMs = 60000 / bpm / 24;
    let nextTick = performance.now();

    this.sendMidiStart();

    this._midiClockInterval = setInterval(
      () => {
        const now = performance.now();
        // Drift correction: fire immediately if we're behind, stay on schedule
        if (now >= nextTick) {
          if (this.midiOutput) this.midiOutput.send([0xf8]);
          nextTick += intervalMs;
          // If we've drifted more than one interval behind, resync
          if (nextTick < now) nextTick = now + intervalMs;
        }
      },
      Math.max(1, intervalMs * 0.5),
    ); // poll at ~2x rate for accuracy
  };

  proto.stopMidiClock = function () {
    if (this._midiClockInterval !== null) {
      clearInterval(this._midiClockInterval);
      this._midiClockInterval = null;
    }
    this.sendMidiStop();
  };

  proto.sendMidiStart = function () {
    if (this.midiOutput) this.midiOutput.send([0xfa]);
  };

  proto.sendMidiStop = function () {
    if (this.midiOutput) this.midiOutput.send([0xfc]);
  };

  proto.setMidiOutput = function (output) {
    this.midiOutput = output || null;
    return this.midiOutput;
  };
}
