import { strict as assert } from 'node:assert';

import { PERSISTENCE_STATUS_EVENT } from '../src/persistence-status.js';
import { createAppState, persistStateNow, STORAGE_KEY } from '../src/state.js';

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

const eventTarget = new EventTarget();
eventTarget.CustomEvent = TestCustomEvent;
globalThis.window = eventTarget;

const events = [];
eventTarget.addEventListener(PERSISTENCE_STATUS_EVENT, (event) => events.push(event.detail));

{
  const state = createAppState();
  const writes = new Map();
  const result = persistStateNow(state, { setItem: (key, value) => writes.set(key, value) });
  assert.equal(result.status, 'saved');
  assert.equal(state._persistenceStatus, 'saved');
  assert.equal(typeof state._lastSaveTime, 'number');
  assert(writes.get(STORAGE_KEY)?.includes('project'));
}

{
  const state = createAppState();
  let attempts = 0;
  const result = persistStateNow(state, {
    setItem() {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
    },
  });
  assert.equal(result.status, 'recovered');
  assert.equal(attempts, 2);
  assert.equal(state._persistenceStatus, 'recovered');
  assert.match(state._persistenceMessage, /saved compactly/);
}

{
  const state = createAppState();
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = persistStateNow(state, {
      setItem() {
        const storageError = new Error('quota');
        storageError.name = 'QuotaExceededError';
        throw storageError;
      },
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.status, 'failed');
  assert.equal(state._persistenceStatus, 'failed');
  assert.equal(state._lastSaveTime, undefined);
  assert.match(state._persistenceMessage, /Export a backup/);
}

assert(events.some((event) => event.status === 'saved'));
assert(events.some((event) => event.status === 'recovered'));
assert(events.some((event) => event.status === 'failed'));

delete globalThis.window;

console.log(JSON.stringify({ ok: true, statuses: ['saved', 'recovered', 'failed'] }, null, 2));
