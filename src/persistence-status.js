export const PERSISTENCE_STATUS_EVENT = 'confustudio:persistence-status';

export function reportPersistenceStatus(state, status, message) {
  const detail = {
    status,
    message: String(message || ''),
    updatedAt: Date.now(),
  };
  if (state && typeof state === 'object') {
    state._persistenceStatus = detail.status;
    state._persistenceMessage = detail.message;
    state._persistenceStatusAt = detail.updatedAt;
  }

  const target = globalThis.window;
  const CustomEventCtor = target?.CustomEvent || globalThis.CustomEvent;
  if (target?.dispatchEvent && typeof CustomEventCtor === 'function') {
    target.dispatchEvent(new CustomEventCtor(PERSISTENCE_STATUS_EVENT, { detail }));
  }
  return detail;
}
