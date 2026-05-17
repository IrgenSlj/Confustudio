const DB_NAME = 'confustudio-assets-v1';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const ASSET_STORE = 'assets';

const memoryProjects = new Map();
const memoryAssets = new Map();
const serializationCache = new WeakMap();

let dbPromise = null;
let persistChain = Promise.resolve();
const hydrationStates = new WeakSet();

function now() {
  return Date.now();
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `asset-${now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hasIndexedDb() {
  return typeof globalThis.indexedDB !== 'undefined';
}

function openDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('[CONFUstudio] IndexedDB upgrade blocked by another tab.');
    };
  });

  dbPromise = dbPromise.catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function getReqValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeProjectId(state) {
  if (!state.project || typeof state.project !== 'object') {
    state.project = {};
  }
  if (!state.project.assetId) {
    state.project.assetId = `proj-${state.project.createdAt || now()}-${randomId().slice(0, 8)}`;
  }
  return state.project.assetId;
}

function assetKey(projectId, kind, indexParts) {
  return [projectId, kind, ...indexParts].join(':');
}

function bufferToPayload(buffer, { portable = false } = {}) {
  if (!buffer || typeof buffer.getChannelData !== 'function') return null;

  const cached = portable ? null : serializationCache.get(buffer);
  if (cached) return cached;

  const payload = {
    type: 'audio-buffer',
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    channelData: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      portable ? Array.from(buffer.getChannelData(channel)) : buffer.getChannelData(channel).slice(),
    ),
  };

  if (!portable) serializationCache.set(buffer, payload);
  return payload;
}

function payloadToBuffer(audioContext, payload) {
  if (!audioContext || typeof audioContext.createBuffer !== 'function') return null;
  if (!payload || payload.type !== 'audio-buffer') return null;

  const buffer = audioContext.createBuffer(payload.numberOfChannels, payload.length, payload.sampleRate);
  payload.channelData.forEach((channelData, channelIndex) => {
    buffer.copyToChannel(channelData, channelIndex);
  });
  return buffer;
}

function collectAssetSnapshot(state) {
  const projectId = normalizeProjectId(state);
  const records = [];

  const banks = state.project?.banks ?? [];
  banks.forEach((bank, bankIndex) => {
    bank.patterns?.forEach((pattern, patternIndex) => {
      pattern.kit?.tracks?.forEach((track, trackIndex) => {
        if (!track?.sampleBuffer) return;
        const payload = bufferToPayload(track.sampleBuffer);
        if (!payload) return;
        records.push({
          key: assetKey(projectId, 'sample', [bankIndex, patternIndex, trackIndex]),
          kind: 'sample',
          payload,
        });
      });
    });
  });

  (state.recorderBuffers ?? []).forEach((buffer, slotIndex) => {
    if (!buffer) return;
    const payload = bufferToPayload(buffer);
    if (!payload) return;
    records.push({
      key: assetKey(projectId, 'recorder', [slotIndex]),
      kind: 'recorder',
      payload,
    });
  });

  return { projectId, records };
}

function readManifestFromDb(projectId, db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const projectsStore = tx.objectStore(PROJECT_STORE);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {};
    getReqValue(projectsStore.get(projectId)).then(resolve, reject);
  });
}

async function persistToMemory(snapshot, mergeOnly) {
  const existing = memoryProjects.get(snapshot.projectId);
  const existingKeys = new Set(existing?.assetKeys ?? []);
  const nextKeys = new Set(existingKeys);

  for (const record of snapshot.records) {
    memoryAssets.set(record.key, record);
    nextKeys.add(record.key);
  }

  if (!mergeOnly) {
    for (const key of existingKeys) {
      if (!snapshot.records.some((record) => record.key === key)) {
        memoryAssets.delete(key);
        nextKeys.delete(key);
      }
    }
  }

  memoryProjects.set(snapshot.projectId, {
    projectId: snapshot.projectId,
    assetKeys: [...nextKeys],
    updatedAt: now(),
  });
}

async function persistToIndexedDb(snapshot, mergeOnly) {
  const db = await openDb().catch(() => null);
  if (!db) {
    await persistToMemory(snapshot, mergeOnly);
    return;
  }

  const existing = await readManifestFromDb(snapshot.projectId, db);
  const existingKeys = new Set(existing?.assetKeys ?? []);
  const nextKeys = new Set(existingKeys);
  const deletions = [];

  for (const record of snapshot.records) {
    nextKeys.add(record.key);
  }

  if (!mergeOnly) {
    for (const key of existingKeys) {
      if (!snapshot.records.some((record) => record.key === key)) {
        deletions.push(key);
        nextKeys.delete(key);
      }
    }
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, ASSET_STORE], 'readwrite');
    const projectsStore = tx.objectStore(PROJECT_STORE);
    const assetsStore = tx.objectStore(ASSET_STORE);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    for (const record of snapshot.records) {
      assetsStore.put({
        key: record.key,
        kind: record.kind,
        projectId: snapshot.projectId,
        payload: record.payload,
        updatedAt: now(),
      });
    }
    for (const key of deletions) {
      assetsStore.delete(key);
    }
    projectsStore.put({
      projectId: snapshot.projectId,
      assetKeys: [...nextKeys],
      updatedAt: now(),
    });
  });
}

async function loadRecords(projectId) {
  const db = await openDb().catch(() => null);
  if (!db) {
    const manifest = memoryProjects.get(projectId);
    if (!manifest) return [];
    return manifest.assetKeys.map((key) => memoryAssets.get(key)).filter(Boolean);
  }

  const manifest = await readManifestFromDb(projectId, db);
  if (!manifest?.assetKeys?.length) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readonly');
    const assetsStore = tx.objectStore(ASSET_STORE);
    const requests = manifest.assetKeys.map((key) => getReqValue(assetsStore.get(key)));

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {
      Promise.all(requests)
        .then((records) => resolve(records.filter(Boolean)))
        .catch(reject);
    };
  });
}

function maybeRestoreBuffer(audioContext, record) {
  return payloadToBuffer(audioContext, record?.payload ?? null);
}

function hydrateStateFromRecords(state, records) {
  const byKey = new Map(records.map((record) => [record.key, record]));
  const projectId = normalizeProjectId(state);

  state.project?.banks?.forEach((bank, bankIndex) => {
    bank.patterns?.forEach((pattern, patternIndex) => {
      pattern.kit?.tracks?.forEach((track, trackIndex) => {
        if (track?.sampleBuffer) return;
        const record = byKey.get(assetKey(projectId, 'sample', [bankIndex, patternIndex, trackIndex]));
        if (record) {
          const restored = maybeRestoreBuffer(state.audioContext, record);
          if (restored) track.sampleBuffer = restored;
        }
      });
    });
  });

  (state.recorderBuffers ?? []).forEach((buffer, slotIndex) => {
    if (buffer) return;
    const record = byKey.get(assetKey(projectId, 'recorder', [slotIndex]));
    if (record) {
      const restored = maybeRestoreBuffer(state.audioContext, record);
      if (restored) state.recorderBuffers[slotIndex] = restored;
    }
  });
}

function portableRefForRecord(projectId, record) {
  const parts = String(record.key || '').split(':');
  if (parts[0] !== projectId) return null;
  if (record.kind === 'sample' && parts.length >= 5) {
    return {
      bankIndex: Number(parts[2]),
      patternIndex: Number(parts[3]),
      trackIndex: Number(parts[4]),
    };
  }
  if (record.kind === 'recorder' && parts.length >= 3) {
    return {
      slotIndex: Number(parts[2]),
    };
  }
  return null;
}

function recordKeyFromPortableRecord(projectId, record) {
  if (record?.key) return record.key;
  if (record?.kind === 'sample' && record.ref) {
    return assetKey(projectId, 'sample', [record.ref.bankIndex, record.ref.patternIndex, record.ref.trackIndex]);
  }
  if (record?.kind === 'recorder' && record.ref) {
    return assetKey(projectId, 'recorder', [record.ref.slotIndex]);
  }
  return null;
}

function normalizePortableRecord(projectId, record) {
  const key = recordKeyFromPortableRecord(projectId, record);
  if (!key || !record?.kind || !record?.payload) return null;
  return {
    key,
    kind: record.kind,
    projectId,
    ref: record.ref ?? portableRefForRecord(projectId, { key, kind: record.kind }),
    payload: record.payload,
    updatedAt: record.updatedAt ?? now(),
  };
}

async function hydrateStateAssets(state) {
  if (!state || hydrationStates.has(state)) return;
  hydrationStates.add(state);

  const projectId = normalizeProjectId(state);
  state._assetHydrationPending = true;

  const poll = async () => {
    if (!state || state._assetHydrationComplete) return;
    if (!state.audioContext || typeof state.audioContext.createBuffer !== 'function') {
      return false;
    }
    if (state._pendingPortableAssets?.records?.length) {
      hydrateStateFromPortableAssetBundle(state, state._pendingPortableAssets);
    }
    const records = await loadRecords(projectId);
    if (!records.length) {
      state._assetHydrationPending = false;
      state._assetHydrationComplete = true;
      return true;
    }
    hydrateStateFromRecords(state, records);
    state._assetHydrationPending = false;
    state._assetHydrationComplete = true;
    return true;
  };

  const attempt = async () => {
    try {
      const done = await poll();
      if (done) return;
    } catch (error) {
      console.warn('[CONFUstudio] Asset hydration failed:', error);
      state._assetHydrationPending = false;
      state._assetHydrationComplete = true;
      return;
    }

    const timer = globalThis.setInterval(async () => {
      if (state._assetHydrationComplete) {
        globalThis.clearInterval(timer);
        return;
      }
      try {
        const done = await poll();
        if (done) {
          globalThis.clearInterval(timer);
        }
      } catch (error) {
        console.warn('[CONFUstudio] Asset hydration failed:', error);
        state._assetHydrationPending = false;
        state._assetHydrationComplete = true;
        globalThis.clearInterval(timer);
      }
    }, 250);
  };

  await attempt();
}

export function scheduleAssetHydration(state) {
  if (!state) return;
  if (typeof document === 'undefined') return;
  void hydrateStateAssets(state);
}

export function queuePersistAssets(state) {
  if (!state) return Promise.resolve();
  const snapshot = collectAssetSnapshot(state);
  const mergeOnly = Boolean(state._assetHydrationPending);

  persistChain = persistChain
    .then(() => persistToIndexedDb(snapshot, mergeOnly))
    .catch((error) => {
      console.warn('[CONFUstudio] Asset persistence failed:', error);
    });

  return persistChain;
}

export function ensureProjectAssetId(projectLike) {
  const project = projectLike && typeof projectLike === 'object' ? projectLike : {};
  if (!project.assetId) {
    project.assetId = `proj-${project.createdAt || now()}-${randomId().slice(0, 8)}`;
  }
  return project.assetId;
}

export function createPortableAssetBundle(state) {
  if (!state?.project) {
    return { version: 1, projectId: null, records: [] };
  }
  const projectId = normalizeProjectId(state);
  const snapshot = collectAssetSnapshot(state);
  const records = snapshot.records
    .map((record) => {
      const payloadSource = record.kind === 'sample' ? findSampleBuffer(state, projectId, record) : null;
      const payload =
        payloadSource && typeof payloadSource.getChannelData === 'function'
          ? bufferToPayload(payloadSource, { portable: true })
          : makePortablePayload(record.payload);
      if (!payload) return null;
      return {
        key: record.key,
        kind: record.kind,
        ref: portableRefForRecord(projectId, record),
        payload,
      };
    })
    .filter(Boolean);

  return {
    version: 1,
    projectId,
    records,
  };
}

function findSampleBuffer(state, projectId, record) {
  const ref = portableRefForRecord(projectId, record);
  if (record.kind !== 'sample' || !ref) return null;
  return state.project?.banks?.[ref.bankIndex]?.patterns?.[ref.patternIndex]?.kit?.tracks?.[ref.trackIndex]
    ?.sampleBuffer;
}

function makePortablePayload(payload) {
  if (!payload || payload.type !== 'audio-buffer') return null;
  return {
    ...payload,
    channelData: (payload.channelData ?? []).map((channel) => Array.from(channel ?? [])),
  };
}

export function hydrateStateFromPortableAssetBundle(state, bundle) {
  if (!state || !bundle?.records?.length) return false;
  const projectId = normalizeProjectId(state);
  const records = bundle.records.map((record) => normalizePortableRecord(projectId, record)).filter(Boolean);
  if (!records.length) return false;
  if (!state.audioContext || typeof state.audioContext.createBuffer !== 'function') {
    state._pendingPortableAssets = { version: bundle.version ?? 1, projectId, records };
    return false;
  }
  hydrateStateFromRecords(state, records);
  state._pendingPortableAssets = null;
  void persistToIndexedDb({ projectId, records }, true).catch((error) => {
    console.warn('[CONFUstudio] Portable asset persistence failed:', error);
  });
  return true;
}
