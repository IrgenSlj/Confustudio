import { strict as assert } from 'node:assert';

// In-memory localStorage stub so we can exercise saveState/loadState in Node.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { createAppState, loadState, STORAGE_KEY } = await import('../src/state.js');

// Simulate a session that was persisted mid-playback by an older build:
// runtime transport flags leaked into the saved blob.
const persisted = createAppState();
persisted.isPlaying = true;
persisted.isRecording = true;
persisted.currentStep = 11;
// audioContext/engine are runtime refs; drop them so JSON.stringify succeeds.
persisted.audioContext = null;
persisted.engine = null;
persisted.modularEngine = null;
persisted._playingNotes = undefined;
persisted._pressedKeys = undefined;
store.set(STORAGE_KEY, JSON.stringify(persisted));

const loaded = loadState();
assert.ok(loaded, 'loadState should return a healed state');
assert.equal(loaded.isPlaying, false, 'phantom isPlaying must be healed to false on load');
assert.equal(loaded.isRecording, false, 'phantom isRecording must be healed to false on load');
assert.equal(loaded.currentStep, -1, 'phantom currentStep must be healed to -1 on load');

console.log(JSON.stringify({ ok: true }, null, 2));
