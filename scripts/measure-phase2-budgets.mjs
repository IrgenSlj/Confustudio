// Measures every Phase 2 performance budget from DEVELOPMENT_PLAN.md section 4
// and reports pass/fail per budget.
//
// The plan requires each PR to state which budgets it changes with before/after
// data. This makes that mechanical instead of a claim.
//
//   default project serialization  < 500 KB
//   ordinary edit p95              < 16 ms
//   undo/redo p95                  < 32 ms
import { createProjectV4 } from '../src/project/v4/schema.js';
import { migrateToV4 } from '../src/project/v4/index.js';
import { canRedo, canUndo, createHistory, recordBatch, redo, undo } from '../src/commands/history.js';
import { createAppState } from '../src/state.js';

const SERIALIZATION_BUDGET_BYTES = 500 * 1024;
const EDIT_BUDGET_MS = 16;
const UNDO_BUDGET_MS = 32;

const percentile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(2));
};

const envelope = (type, targetIds, payload = {}, extra = {}) => ({
  id: `c${Math.random().toString(36).slice(2, 8)}`,
  type,
  baseRevision: 0,
  targetIds,
  payload,
  ...extra,
});

/** A full-size working project: 8 banks x 16 patterns x 8 tracks. */
function buildWorkingProject({ seedSteps }) {
  const project = createProjectV4({ id: 'prj_bench' });
  project.revision = 0;
  for (let bank = 0; bank < 8; bank += 1) {
    const bankId = `bnk_${bank}`;
    const patternIds = [];
    for (let pattern = 0; pattern < 16; pattern += 1) {
      const patternId = `pat_${bank}_${pattern}`;
      const trackIds = [];
      for (let track = 0; track < 8; track += 1) {
        const trackId = `trk_${bank}_${pattern}_${track}`;
        const steps = {};
        if (seedSteps) {
          for (let step = 0; step < 16; step += 1) if ((step + track) % 4 === 0) steps[step] = { active: true };
        }
        project.tracks.byId[trackId] = { id: trackId, name: `Track ${track + 1}`, stepCount: 64, params: {}, steps };
        trackIds.push(trackId);
      }
      project.patterns.byId[patternId] = {
        id: patternId,
        name: `Pattern ${pattern + 1}`,
        length: 16,
        tracks: trackIds,
      };
      patternIds.push(patternId);
    }
    project.banks.byId[bankId] = { id: bankId, name: `Bank ${bank + 1}`, patterns: patternIds };
    project.banks.order.push(bankId);
  }
  return project;
}

// ── Serialization ────────────────────────────────────────────────────────────
const v3Default = createAppState().project;
const v3Bytes = Buffer.byteLength(JSON.stringify(v3Default));
const migrated = migrateToV4({ project: v3Default });
const v4MigratedBytes = migrated.ok ? Buffer.byteLength(JSON.stringify(migrated.project)) : Number.NaN;
const v4EmptyBytes = Buffer.byteLength(JSON.stringify(buildWorkingProject({ seedSteps: false })));

// ── Latency ──────────────────────────────────────────────────────────────────
const bench = buildWorkingProject({ seedSteps: true });
let current = bench;
let history = createHistory(bench);
const editTimes = [];
for (let index = 0; index < 300; index += 1) {
  const started = performance.now();
  const result = recordBatch(history, current, [envelope('toggle-step', ['trk_0_0_0'], { index: index % 16 })]);
  editTimes.push(performance.now() - started);
  history = result.history;
  current = result.project;
}

const undoTimes = [];
const redoTimes = [];
for (let index = 0; index < 150 && canUndo(history); index += 1) {
  const started = performance.now();
  const result = undo(history, current);
  undoTimes.push(performance.now() - started);
  history = result.history;
  current = result.project;
}
for (let index = 0; index < 150 && canRedo(history); index += 1) {
  const started = performance.now();
  const result = redo(history, current);
  redoTimes.push(performance.now() - started);
  history = result.history;
  current = result.project;
}

const budget = (name, value, limit, unit) => ({
  budget: name,
  value: unit === 'KB' ? Number((value / 1024).toFixed(1)) : value,
  limit: unit === 'KB' ? limit / 1024 : limit,
  unit,
  withinBudget: value < limit,
  ratio: Number((value / limit).toFixed(2)),
});

const report = {
  serialization: [
    budget('v3 default project', v3Bytes, SERIALIZATION_BUDGET_BYTES, 'KB'),
    budget('v4 migrated from v3 default', v4MigratedBytes, SERIALIZATION_BUDGET_BYTES, 'KB'),
    budget('v4 with an unseeded default', v4EmptyBytes, SERIALIZATION_BUDGET_BYTES, 'KB'),
  ],
  latency: [
    budget('ordinary edit p95', percentile(editTimes, 0.95), EDIT_BUDGET_MS, 'ms'),
    budget('undo p95', percentile(undoTimes, 0.95), UNDO_BUDGET_MS, 'ms'),
    budget('redo p95', percentile(redoTimes, 0.95), UNDO_BUDGET_MS, 'ms'),
  ],
};

const failing = [...report.serialization, ...report.latency].filter((entry) => !entry.withinBudget);
report.failingBudgets = failing.map((entry) => entry.budget);
report.gateP2SerializationBlocked = !report.serialization[1].withinBudget;

console.log(JSON.stringify(report, null, 2));
