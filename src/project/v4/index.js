// Public surface for project schema v4.
//
// v4 is DEFINED but not LIVE. v3 remains the read/write path until this flag is
// deliberately turned on, which is the rollback the core/02-project-v4 issue
// asks for: nothing in the running app depends on v4 today, so reverting means
// leaving the flag off.

export {
  DEFAULT_STEP,
  FORMAT_VERSION,
  ProjectV4Error,
  V4_LIMITS,
  createProjectV4,
  isDefaultStep,
  toDenseSteps,
  toSparseSteps,
  validateProjectV4,
} from './schema.js';

export { detectProjectFormat, migrateToV4, projectV4ToV3 } from './migrate.js';

/**
 * Whether the app should read and write v4. Off by default and not yet read by
 * any runtime code path; the reducer and persistence work (core/03, core/06)
 * turn this on once they can honour it end to end.
 *
 * @returns {boolean}
 */
export function isProjectV4Enabled(env) {
  try {
    // Only reach for globalThis.localStorage in a browser. Touching it under
    // Node emits an experimental-storage warning and there is nothing useful
    // there anyway, which matters because this module is Node-testable.
    const storage = env ?? (typeof window === 'undefined' ? null : window.localStorage);
    return storage?.getItem?.('confustudio-project-v4') === 'on';
  } catch (_) {
    return false;
  }
}
