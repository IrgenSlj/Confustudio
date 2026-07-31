# Postmortem: "Unusable mess" after update — stale service-worker cache

Status: **historical / mitigated, with replacement work planned**

Last reviewed: 2026-07-31

Authority: [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md), Phase 4 release behavior

The mitigation reduced the original failure mode, but manual cache-version bumps
and ad hoc localStorage repair are not the final release design. Vite-generated
asset revisions, tested service-worker update/rollback flows, versioned project
migrations, IndexedDB persistence, and user-visible recovery replace these mechanisms.

## Summary

A user reported the app rendered as an "unusable mess" (blank page / blank studio
canvas) after an update. The failure could not be reproduced from a clean browser
profile, which points to a client-side persistence problem on the returning
instance rather than a shipped code defect: a **stale service-worker precache**
serving old shell assets, and/or **corrupt persisted `localStorage`** left over
from an earlier schema. Both suspects are now mitigated: the SW cache name is
release-versioned (currently `confustudio-v4`) with activate-time eviction of old
caches, the app shell is fetched network-first, corrupt saved state is repaired on
load, and two user-facing reset hatches exist. No open reproduction remains.

## Root cause

1. **Stale precache.** Early builds used a _static_ SW cache name, so a returning
   browser kept serving the previously precached `index.html` / `app.js` forever —
   the SW never self-invalidated. After a deploy that changed the shell contract,
   an old cached `app.js` running against new HTML (or vice-versa) can throw during
   init and leave the canvas blank. This is the primary hypothesis.
2. **Corrupt localStorage (contributing).** A partially-written or schema-drifted
   saved project / studio layout could, before the repair guard, blank the studio
   canvas (null modules reaching the renderer) even with fresh code.

Neither reproduced from a clean profile, consistent with a per-instance cache/state
issue rather than a regression in the deployed bundle.

## Evidence

- Cache version string (current): **`confustudio-v4`** — `public/sw.js:4`.
  Preceded by a header comment naming a static cache name as "the root cause of
  stale-shell 'blank page' reports."
- Install precaches the app shell then `skipWaiting()` — `public/sw.js:15-22`.
- Activate **evicts every cache whose key ≠ `CACHE_NAME`**, then `clients.claim()`
  — `public/sw.js:24-31` (`keys.filter((key) => key !== CACHE_NAME).map(caches.delete)`).
- Fetch strategy is **network-first for the app shell** (`/`, `/index.html`,
  `/src/`, `/docs/`): live fetch → update cache → fall back to cache only on network
  failure — `public/sw.js:33-55`. All other GETs are cache-first — `public/sw.js:57`.
- SW registered only on non-loopback hosts — `index.html:243-247`. On loopback,
  a `DEV_SHELL_VERSION` guard (`confustudio-shell-v7`) auto-unregisters the SW and
  drops all caches on version change — `index.html:210-241`.
- Persisted keys: `STORAGE_KEY = 'confustudio-v3'` — `src/state.js:14`; studio
  layout/view/cables keys — `src/state.js:26-28`.
- Corrupt-state recovery: `repairState()` rebuilds any null/invalid
  bank→pattern→track→step from freshly-created defaults — `src/state.js:791-868`;
  `loadState()` wraps every parse in try/catch, forward-fills new schema fields,
  falls back to legacy keys, and returns `null` (→ fresh state) if all fail —
  `src/state.js:870-958`.
- Fix commit: `9f10785` "Robustness: SW cache-busting, restore guard, recovery
  hatches" — bumped `CACHE_NAME` v3→v4, added `/src/css/tokens.css` to the shell,
  wrapped `studio.js restoreLayout` per-item in try/catch (one corrupt module is
  skipped, not the whole restore), and added the hatches below.

## Mitigations in place

- **Release-versioned SW cache + activate eviction.** Bump `CACHE_NAME` on every
  release (`public/sw.js:4`); activate deletes all non-matching caches
  (`public/sw.js:24-31`), so returning users purge the stale shell on next load.
- **Network-first app shell** (`public/sw.js:33-55`) — even without a version bump,
  a returning online client gets fresh `index.html`/`src/*` and only falls back to
  cache when offline. This is the strongest guard against the original failure.
- **State-repair migration** — `repairState()` + the guarded `loadState()`
  (`src/state.js:791-958`) mean corrupt/partial saved state degrades to defaults
  instead of blanking the UI. `restoreLayout` skips individual corrupt modules.
- **Reset hatches (found, on the current tree):**
  - `window.__CONFUSTUDIO__.resetWorkspace()` — clears the studio layout/view/cables
    keys, keeps the song, reloads — `src/app.js:104-109`.
  - `window.__CONFUSTUDIO__.hardReset()` — `localStorage.clear()` +
    `sessionStorage.clear()` + unregister SW + `caches.delete` all + reload —
    `src/app.js:111-123`.
  - **UI path: Settings (SET) → SYSTEM tab → "WORKSPACE" section → "Reset
    workspace" / "Hard reset" buttons** — `src/pages/settings.js:1409-1444`. This is
    the no-DevTools manual escape hatch.

## Residual risk & recommendation

- Residual risk: a deploy that forgets to bump `CACHE_NAME` relies solely on the
  network-first shell; a fully-offline returning client would still boot the old
  shell. Non-shell same-origin assets are cache-first, so a renamed non-shell asset
  could 404 from an old cache until the version bump evicts it.
- **Interim recommendation:** keep bumping `CACHE_NAME` on every local/pre-release
  build until Phase 4 generates revisions from the production build. The
  network-first shell covers the online case. If a user still hits a broken UI,
  the manual escape is
  **SET → SYSTEM → WORKSPACE → Reset workspace** (Hard reset if that is not enough).
