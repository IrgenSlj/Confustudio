# Project Schema v4

**Status:** defined, not live. v3 remains the read/write path.

**Updated:** 2026-08-02

v4 is specified, validated, and migrated-into by `src/project/v4/`, but no
runtime code path reads it. The feature flag `isProjectV4Enabled()` is off by
default and opt-in only. That is the rollback for `core/02-project-v4`: leaving
the flag off is the revert.

## Why

v3 materializes everything. A fresh project — one the user has not touched —
holds 8 banks x 16 patterns x 8 tracks x 64 steps.

|                  |         v3 |        v4 |     change |
| ---------------- | ---------: | --------: | ---------: |
| serialized bytes | 10,301,602 | 1,588,966 | **-84.6%** |
| step objects     |     65,536 |    19,584 | **-70.1%** |

The 19,584 steps v4 still stores are not waste: v3's `createStep()` seeds a
decorative pattern (`active` every fifth step, `accent` every eighth), so those
steps genuinely differ from empty and are preserved so migrations round-trip.
A project whose steps really are empty stores none.

## Shape

- `formatVersion: 4` on every document.
- Collections are `{ byId, order }`. Order is explicit; nothing depends on array
  position, and selection is view state rather than an implicit command target.
- Steps are a sparse index-keyed map. A step equal to `DEFAULT_STEP` is not
  serialized. `toSparseSteps` / `toDenseSteps` convert both ways.
- IDs are **deterministic** (`makeId`), so migrating the same input twice yields
  byte-identical output. Random IDs would make migrations irreproducible and
  round-trip tests flaky.

## Migration outcomes

`migrateToV4(input)` returns an explicit `outcome` rather than throwing, because
each fixture class in `tests/fixtures/projects/manifest.json` has a declared
required behaviour. `tests/project-v4.mjs` holds the migrator to that manifest,
so adding a fixture without deciding its outcome fails the suite.

| Fixture                   | Declared outcome            | Actual                                  |
| ------------------------- | --------------------------- | --------------------------------------- |
| `legacy-v1-project.json`  | migrate-with-report         | migrate-with-report                     |
| `legacy-v2-tracks.json`   | migrate-with-report         | migrate-with-report                     |
| `v3-sparse-state.json`    | migrate                     | migrate                                 |
| `v3-project-package.json` | migrate                     | migrate                                 |
| `corrupt-structure.json`  | reject-with-recovery-export | reject `V4_SCHEMA_INVALID`              |
| `hostile-import.json`     | reject-or-render-as-text    | migrate, markup preserved as inert text |
| `limits-exceeded.json`    | reject-before-normalization | reject `V4_COLLECTION_LIMIT`            |
| `invalid-json.txt`        | reject-with-recovery-export | reject, unparseable                     |

`reject-or-render-as-text` is an either/or. v4 migrates the hostile fixture and
keeps the markup verbatim as a string — it never becomes a key or a structure,
and escaping remains the renderer's job.

## Unknown fields

Track fields are partitioned against typed allowlists. A field that is unknown,
or known but of the wrong type, is **quarantined** — set aside and reported —
never merged into project state. This is the same rule the Phase 1 boundary
work established, applied at migration time.

Collection ceilings are checked against the raw document _before_ any
normalization, so an oversized import is refused without being walked first.
