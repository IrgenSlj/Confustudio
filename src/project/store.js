// Project record persistence.
//
// Audio assets already live in IndexedDB (src/asset-store.js). The project
// record itself is still an eager localStorage blob, which is the oversized
// model Phase 2 is meant to remove. This moves records to IndexedDB behind a
// flag, with an explicit outcome for every path the issue names: fresh,
// migrated, corrupt, quota-full, offline, recovery, and backup.
//
// The low-level store is an injectable backend so all of those paths are
// testable in Node. The IndexedDB specifics stay thin on purpose.
//
// Not live: localStorage remains the read/write path until the flag is turned
// on, and migration writes a pre-migration backup BEFORE touching anything —
// that backup is the issue's stated rollback.

import { migrateToV4, validateProjectV4 } from './v4/index.js';

export const PROJECT_DB_NAME = 'confustudio-projects-v1';
export const PROJECT_DB_VERSION = 1;
export const PROJECT_RECORD_STORE = 'records';
export const BACKUP_KEY_PREFIX = 'confustudio-premigration-backup';

export class ProjectStoreError extends Error {
  constructor(message, code, cause = null) {
    super(message);
    this.name = 'ProjectStoreError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

/** In-memory backend. Used by tests, and as the degraded fallback offline. */
export function createMemoryBackend() {
  const map = new Map();
  return {
    kind: 'memory',
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : undefined;
    },
    async put(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

/** Thin IndexedDB backend. Kept minimal so the logic above stays testable. */
export function createIndexedDbBackend(factory = globalThis.indexedDB) {
  if (!factory) throw new ProjectStoreError('IndexedDB is unavailable', 'STORE_UNAVAILABLE');

  function open() {
    return new Promise((resolve, reject) => {
      const request = factory.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_RECORD_STORE)) {
          db.createObjectStore(PROJECT_RECORD_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, run) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(PROJECT_RECORD_STORE, mode);
        const request = run(tx.objectStore(PROJECT_RECORD_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  return {
    kind: 'indexeddb',
    get: (key) => withStore('readonly', (store) => store.get(key)),
    put: (key, value) => withStore('readwrite', (store) => store.put({ ...value, id: key })),
    delete: (key) => withStore('readwrite', (store) => store.delete(key)),
    keys: () => withStore('readonly', (store) => store.getAllKeys()),
  };
}

/**
 * @param {object} options
 * @param {object} options.backend  storage backend
 * @param {object} [options.legacyStorage]  localStorage-like, for migration
 * @param {() => number} [options.now]
 */
export function createProjectStore({ backend, legacyStorage = null, now = () => Date.now() } = {}) {
  if (!backend) throw new ProjectStoreError('A storage backend is required', 'STORE_UNAVAILABLE');

  const RECORD_KEY = 'current';

  async function save(project) {
    validateProjectV4(project);
    const record = { id: RECORD_KEY, formatVersion: project.formatVersion, project, savedAt: now() };
    try {
      await backend.put(RECORD_KEY, record);
      return { outcome: 'saved', savedAt: record.savedAt };
    } catch (error) {
      // Quota is reported distinctly: the user can act on it (export, prune),
      // unlike a generic write failure.
      if (isQuotaError(error)) {
        throw new ProjectStoreError('Storage quota exceeded while saving the project', 'STORE_QUOTA_EXCEEDED', error);
      }
      throw new ProjectStoreError('Project could not be saved', 'STORE_WRITE_FAILED', error);
    }
  }

  /**
   * Reads the stored record. Corrupt content is reported rather than thrown, so
   * the caller can offer recovery instead of the app failing to start.
   */
  async function load() {
    let record;
    try {
      record = await backend.get(RECORD_KEY);
    } catch (error) {
      return { outcome: 'unavailable', project: null, reason: error?.message ?? 'read failed' };
    }

    if (record === undefined || record === null) return { outcome: 'fresh', project: null };

    try {
      validateProjectV4(record.project);
      return { outcome: 'loaded', project: record.project, savedAt: record.savedAt ?? null };
    } catch (error) {
      // Not valid v4 — try to rescue it through the migrator before declaring
      // it corrupt, since an older record is recoverable and a mangled one is not.
      const migrated = migrateToV4(record.project ?? record);
      if (migrated.ok) {
        return { outcome: 'recovered', project: migrated.project, report: migrated.report };
      }
      return { outcome: 'corrupt', project: null, reason: error.code ?? 'invalid', detail: migrated.code };
    }
  }

  /**
   * Serializes everything needed to restore the pre-migration state. This runs
   * BEFORE migration writes anything, because it is the documented rollback.
   */
  function exportLegacyBackup() {
    if (!legacyStorage) return null;
    const payload = {};
    for (const key of ['confustudio-v3', 'confusynth-v3', 'confustudio-v2', 'confusynth-v2']) {
      const value = legacyStorage.getItem?.(key);
      if (typeof value === 'string') payload[key] = value;
    }
    if (Object.keys(payload).length === 0) return null;
    return { exportedAt: now(), format: 'confustudio-premigration-backup', schemaVersion: 1, entries: payload };
  }

  /**
   * Migrates the legacy localStorage project into the record store.
   *
   * Order matters and is the whole safety story: back up, then migrate, then
   * write. The legacy keys are never deleted — rollback means running the
   * previous build, which reads them and must still find them intact.
   */
  async function migrateFromLegacy() {
    const backup = exportLegacyBackup();
    if (!backup) return { outcome: 'fresh', project: null, backup: null };

    const raw =
      backup.entries['confustudio-v3'] ??
      backup.entries['confusynth-v3'] ??
      backup.entries['confustudio-v2'] ??
      backup.entries['confusynth-v2'];

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { outcome: 'corrupt', project: null, backup, reason: 'IMPORT_JSON_INVALID' };
    }

    const migrated = migrateToV4(parsed);
    if (!migrated.ok) {
      return { outcome: 'corrupt', project: null, backup, reason: migrated.code };
    }

    // Persist the backup alongside the record so recovery does not depend on
    // the user having kept a downloaded file.
    try {
      await backend.put(`${BACKUP_KEY_PREFIX}`, { id: BACKUP_KEY_PREFIX, backup });
    } catch (error) {
      if (isQuotaError(error)) {
        return { outcome: 'quota-exceeded', project: null, backup, reason: 'STORE_QUOTA_EXCEEDED' };
      }
      return { outcome: 'unavailable', project: null, backup, reason: 'STORE_WRITE_FAILED' };
    }

    try {
      await save(migrated.project);
    } catch (error) {
      return {
        outcome: error.code === 'STORE_QUOTA_EXCEEDED' ? 'quota-exceeded' : 'unavailable',
        project: null,
        backup,
        reason: error.code,
      };
    }

    return {
      outcome:
        migrated.report.quarantined.length > 0 || migrated.report.notes.length > 0
          ? 'migrated-with-report'
          : 'migrated',
      project: migrated.project,
      backup,
      report: migrated.report,
    };
  }

  async function readBackup() {
    const stored = await backend.get(BACKUP_KEY_PREFIX);
    return stored?.backup ?? null;
  }

  /** Restores the legacy keys from the stored backup. The rollback path. */
  async function restoreFromBackup() {
    const backup = await readBackup();
    if (!backup || !legacyStorage) return { outcome: 'unavailable', restored: 0 };
    let restored = 0;
    for (const [key, value] of Object.entries(backup.entries)) {
      legacyStorage.setItem?.(key, value);
      restored += 1;
    }
    return { outcome: 'restored', restored, exportedAt: backup.exportedAt };
  }

  return { backend, save, load, migrateFromLegacy, exportLegacyBackup, readBackup, restoreFromBackup };
}

/**
 * Whether the app should read and write project records from IndexedDB.
 * Off by default; localStorage stays the live path until this is flipped.
 *
 * @returns {boolean}
 */
export function isRecordStoreEnabled(env) {
  try {
    const storage = env ?? (typeof window === 'undefined' ? null : window.localStorage);
    return storage?.getItem?.('confustudio-record-store') === 'on';
  } catch (_) {
    return false;
  }
}
