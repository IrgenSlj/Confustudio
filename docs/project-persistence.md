# Project Record Persistence

**Status:** defined, not live. localStorage remains the read/write path.

**Updated:** 2026-08-02

Audio assets already live in IndexedDB (`src/asset-store.js`,
`confustudio-assets-v1`). What was still an eager localStorage blob is the
**project record** itself — the oversized model Phase 2 exists to remove.
`src/project/store.js` moves records to IndexedDB
(`confustudio-projects-v1`) behind `isRecordStoreEnabled()`, which is off by
default.

## Migration order is the safety story

```
1. export the pre-migration backup      (localStorage bytes, verbatim)
2. persist that backup into the store
3. migrate the payload to v4
4. write the record
```

**The legacy localStorage keys are never deleted.** The rollback in
`core/06-persistence` is "restore from the pre-migration export and run the
previous app build" — and the previous build reads localStorage, so those keys
have to still be there. A migration that tidied up after itself would destroy
its own rollback. Both properties are enforced by tests that fail if migration
deletes a legacy key or skips the backup.

`restoreFromBackup()` writes the original bytes back, so recovery does not
depend on the user having kept a downloaded file.

## Outcomes

Every path returns an explicit outcome rather than throwing at startup, so a bad
record degrades to a report instead of an app that will not open.

| Path                | Outcome                             | Notes                                                    |
| ------------------- | ----------------------------------- | -------------------------------------------------------- |
| nothing stored      | `fresh`                             | not an error                                             |
| valid record        | `loaded`                            | round-trips byte for byte                                |
| legacy localStorage | `migrated` / `migrated-with-report` | backup written first                                     |
| older record shape  | `recovered`                         | rescued through the v4 migrator                          |
| mangled record      | `corrupt`                           | reported, never throws at startup                        |
| storage full        | `quota-exceeded`                    | distinct from a generic failure — the user can act on it |
| store unreadable    | `unavailable`                       | blocked/offline degrades, does not crash                 |

Quota is deliberately separated from `STORE_WRITE_FAILED`: "you are out of
space, export a backup" is actionable, "saving failed" is not.

## Why not Dexie

`DEVELOPMENT_PLAN.md` suggests Dexie. This uses raw IndexedDB instead, matching
the existing `src/asset-store.js` and keeping the **runtime dependency-free** —
the same property that lets the container image install nothing. The backend is
a four-method interface (`get`/`put`/`delete`/`keys`), so swapping in Dexie later
is a contained change if the ergonomics ever justify a dependency.

## Testing

The Node suite drives all seven paths against an in-memory backend, using
failures shaped like real browser failures (`QuotaExceededError` by name,
rejected reads for the unavailable case) rather than a stub that always
succeeds.

That proves the logic but **not** `createIndexedDbBackend`, which is what
actually runs in production. `tests/project-store-browser.mjs` drives the real
backend in Chromium and reopens through a **fresh connection**, so "it
persisted" cannot be an in-memory illusion.
