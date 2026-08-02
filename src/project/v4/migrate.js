// Forward-only migrations into project schema v4, plus a v3 projection so a
// migrated project can still be handed to the live v3 code path.
//
// Every migration returns an explicit outcome rather than throwing at the
// caller, because the fixture manifest defines what each class of input must
// do: migrate, migrate-with-report, or reject. Callers switch on `outcome`.

import {
  DEFAULT_STEP,
  FORMAT_VERSION,
  TRACK_BOOLEAN_PARAMS,
  TRACK_NUMBER_PARAMS,
  TRACK_STRING_PARAMS,
  V4_LIMITS,
  createProjectV4,
  makeId,
  toDenseSteps,
  toSparseSteps,
  validateProjectV4,
} from './schema.js';

const DEFAULT_STEP_COUNT = 16;

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Identifies the input format without mutating or normalizing it. */
export function detectProjectFormat(input) {
  if (!isPlainRecord(input)) return 'unknown';
  if (input.formatVersion === FORMAT_VERSION) return 'v4';
  const state = isPlainRecord(input.state) ? input.state : null;
  if (isPlainRecord(input.project) || isPlainRecord(state?.project) || Array.isArray(input.banks)) return 'v3';
  if (input.version === 2 || Array.isArray(state?.tracks)) return 'v2';
  if (input.version === 1 || Array.isArray(input.tracks)) return 'v1';
  return 'unknown';
}

function rejection(code, reason, path = '$') {
  return { outcome: 'reject', ok: false, code, reason, path, project: null, report: null };
}

/**
 * Collection ceilings are checked against the RAW document, before anything is
 * normalized or expanded. An oversized import must not be walked first.
 */
function checkRawLimits(project) {
  if (!isPlainRecord(project)) return null;
  if (Array.isArray(project.banks) && project.banks.length > V4_LIMITS.banks) {
    return rejection('V4_COLLECTION_LIMIT', `More than ${V4_LIMITS.banks} banks`, '$.project.banks');
  }
  if (Array.isArray(project.scenes) && project.scenes.length > V4_LIMITS.scenes) {
    return rejection('V4_COLLECTION_LIMIT', `More than ${V4_LIMITS.scenes} scenes`, '$.project.scenes');
  }
  for (const [bankIndex, bank] of (Array.isArray(project.banks) ? project.banks : []).entries()) {
    if (!isPlainRecord(bank)) continue;
    if (Array.isArray(bank.patterns) && bank.patterns.length > V4_LIMITS.patternsPerBank) {
      return rejection(
        'V4_COLLECTION_LIMIT',
        `More than ${V4_LIMITS.patternsPerBank} patterns`,
        `$.project.banks[${bankIndex}].patterns`,
      );
    }
  }
  return null;
}

/**
 * Splits a legacy track into typed params plus a quarantine bucket. Unknown or
 * wrongly-typed fields are never merged into project state — they are set aside
 * and surfaced in the migration report, per the v4 rule that unknown fields are
 * rejected or quarantined but never blindly carried forward.
 */
function partitionTrackFields(track) {
  const params = {};
  const quarantined = {};
  if (!isPlainRecord(track)) return { params, quarantined };

  for (const [key, value] of Object.entries(track)) {
    if (key === 'steps' || key === 'name' || key === 'sampleBuffer') continue;
    if (TRACK_NUMBER_PARAMS.includes(key)) {
      if (typeof value === 'number' && Number.isFinite(value)) params[key] = value;
      else quarantined[key] = value;
      continue;
    }
    if (TRACK_BOOLEAN_PARAMS.includes(key)) {
      if (typeof value === 'boolean') params[key] = value;
      else quarantined[key] = value;
      continue;
    }
    if (TRACK_STRING_PARAMS.includes(key)) {
      if (typeof value === 'string' && value.length <= V4_LIMITS.nameLength) params[key] = value;
      else quarantined[key] = value;
      continue;
    }
    quarantined[key] = value;
  }
  return { params, quarantined };
}

/** Legacy v1 stored steps as a bare boolean array. */
function normalizeLegacySteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => {
    if (typeof step === 'boolean') return { ...DEFAULT_STEP, active: step };
    if (isPlainRecord(step)) return { ...DEFAULT_STEP, ...step };
    return { ...DEFAULT_STEP };
  });
}

function addTrack(draft, report, trackKey, rawTrack) {
  const { params, quarantined } = partitionTrackFields(rawTrack);
  const steps = normalizeLegacySteps(rawTrack?.steps);
  const stepCount = Math.min(Math.max(steps.length, DEFAULT_STEP_COUNT), V4_LIMITS.stepsPerTrack);
  const trackId = makeId('trk', trackKey);

  if (Object.keys(quarantined).length > 0) {
    report.quarantined.push({ path: `tracks.${trackId}`, fields: Object.keys(quarantined).sort() });
  }

  draft.tracks.byId[trackId] = {
    id: trackId,
    name: typeof rawTrack?.name === 'string' ? rawTrack.name.slice(0, V4_LIMITS.nameLength) : `Track ${trackKey}`,
    stepCount,
    params,
    steps: toSparseSteps(steps.slice(0, stepCount)),
  };
  return trackId;
}

function migrateV3Project(project, report) {
  const draft = createProjectV4({
    id: makeId('prj', typeof project.assetId === 'string' ? project.assetId.slice(0, 40) : 'migrated'),
    meta: {
      name: typeof project.name === 'string' ? project.name.slice(0, V4_LIMITS.nameLength) : 'Migrated Project',
      author: typeof project.author === 'string' ? project.author.slice(0, V4_LIMITS.nameLength) : '',
      description:
        typeof project.description === 'string' ? project.description.slice(0, V4_LIMITS.descriptionLength) : '',
      createdAt: Number.isFinite(project.createdAt) ? project.createdAt : 0,
    },
  });

  const banks = Array.isArray(project.banks) ? project.banks : [];
  banks.forEach((bank, bankIndex) => {
    // A null bank is v3's "unchanged, use defaults" marker. It carries no user
    // data, so v4 simply does not materialize it — that is the sparseness.
    if (!isPlainRecord(bank)) return;
    const bankId = makeId('bnk', bankIndex);
    const patternIds = [];

    (Array.isArray(bank.patterns) ? bank.patterns : []).forEach((pattern, patternIndex) => {
      if (!isPlainRecord(pattern)) return;
      const patternId = makeId('pat', bankIndex, patternIndex);
      const trackIds = [];

      const tracks = Array.isArray(pattern.kit?.tracks) ? pattern.kit.tracks : [];
      tracks.forEach((track, trackIndex) => {
        if (!isPlainRecord(track)) return;
        trackIds.push(addTrack(draft, report, `${bankIndex}_${patternIndex}_${trackIndex}`, track));
      });

      // An empty pattern is not materialized.
      if (trackIds.length === 0) return;
      draft.patterns.byId[patternId] = {
        id: patternId,
        name:
          typeof pattern.name === 'string'
            ? pattern.name.slice(0, V4_LIMITS.nameLength)
            : `Pattern ${patternIndex + 1}`,
        length: Number.isFinite(pattern.length) ? pattern.length : DEFAULT_STEP_COUNT,
        tracks: trackIds,
      };
      patternIds.push(patternId);
    });

    if (patternIds.length === 0) return;
    draft.banks.byId[bankId] = {
      id: bankId,
      name: typeof bank.name === 'string' ? bank.name : `Bank ${bankIndex + 1}`,
      patterns: patternIds,
    };
    draft.banks.order.push(bankId);
  });

  return draft;
}

function migrateFlatTracks(tracks, meta, report) {
  const draft = createProjectV4({ id: makeId('prj', 'legacy'), meta });
  const bankId = makeId('bnk', 0);
  const patternId = makeId('pat', 0, 0);
  const trackIds = tracks
    .filter((track) => isPlainRecord(track))
    .map((track, index) => addTrack(draft, report, `0_0_${index}`, track));

  if (trackIds.length === 0) return draft;
  draft.patterns.byId[patternId] = { id: patternId, name: 'Pattern 01', length: DEFAULT_STEP_COUNT, tracks: trackIds };
  draft.banks.byId[bankId] = { id: bankId, name: 'Bank A', patterns: [patternId] };
  draft.banks.order.push(bankId);
  return draft;
}

/**
 * Migrates any supported input to v4.
 *
 * Outcomes: 'migrate' (clean), 'migrate-with-report' (succeeded, but the report
 * carries quarantined fields or dropped legacy structure), or 'reject'.
 */
export function migrateToV4(input) {
  const format = detectProjectFormat(input);
  const report = { sourceFormat: format, quarantined: [], notes: [] };

  if (format === 'unknown') {
    return rejection('V4_FORMAT_UNSUPPORTED', 'Unrecognized project format');
  }
  if (format === 'v4') {
    try {
      validateProjectV4(input);
    } catch (error) {
      return rejection(error.code ?? 'V4_SCHEMA_INVALID', error.message, error.path ?? '$');
    }
    return { outcome: 'migrate', ok: true, code: null, reason: null, path: '$', project: input, report };
  }

  const state = isPlainRecord(input.state) ? input.state : null;
  let draft;

  try {
    if (format === 'v3') {
      const project = isPlainRecord(input.project)
        ? input.project
        : isPlainRecord(state?.project)
          ? state.project
          : Array.isArray(input.banks)
            ? input
            : null;
      if (!project) return rejection('V4_PROJECT_MISSING', 'No project payload found');

      const limitRejection = checkRawLimits(project);
      if (limitRejection) return limitRejection;

      // A non-string name is corrupt shape, not a migratable value.
      if (project.name !== undefined && typeof project.name !== 'string') {
        return rejection('V4_SCHEMA_INVALID', 'Project name must be a string', '$.project.name');
      }
      for (const [index, bank] of (Array.isArray(project.banks) ? project.banks : []).entries()) {
        if (bank !== null && !isPlainRecord(bank)) {
          return rejection('V4_SCHEMA_INVALID', 'Bank must be an object or null', `$.project.banks[${index}]`);
        }
        if (isPlainRecord(bank) && bank.patterns !== undefined && !Array.isArray(bank.patterns)) {
          return rejection('V4_SCHEMA_INVALID', 'Patterns must be an array', `$.project.banks[${index}].patterns`);
        }
      }

      draft = migrateV3Project(project, report);
    } else {
      const tracks = format === 'v2' ? (state?.tracks ?? input.tracks) : input.tracks;
      if (!Array.isArray(tracks)) return rejection('V4_PROJECT_MISSING', 'No tracks found in legacy payload');
      if (tracks.length > V4_LIMITS.tracksPerPattern) {
        return rejection('V4_COLLECTION_LIMIT', `More than ${V4_LIMITS.tracksPerPattern} tracks`, '$.tracks');
      }
      draft = migrateFlatTracks(
        tracks,
        { name: typeof input.name === 'string' ? input.name : 'Migrated Project' },
        report,
      );
      report.notes.push(`Legacy ${format} payload expanded into a single bank and pattern`);
    }

    validateProjectV4(draft);
  } catch (error) {
    return rejection(error.code ?? 'V4_SCHEMA_INVALID', error.message, error.path ?? '$');
  }

  const outcome = report.quarantined.length > 0 || report.notes.length > 0 ? 'migrate-with-report' : 'migrate';
  return { outcome, ok: true, code: null, reason: null, path: '$', project: draft, report };
}

/**
 * Projects a v4 document back onto the v3 shape the live app still reads.
 * This is what keeps v3 the active read/write path while v4 is flagged off,
 * and it is what the round-trip test exercises.
 */
export function projectV4ToV3(project) {
  validateProjectV4(project);
  const banks = project.banks.order.map((bankId) => {
    const bank = project.banks.byId[bankId];
    return {
      name: bank.name,
      patterns: bank.patterns.map((patternId) => {
        const pattern = project.patterns.byId[patternId];
        return {
          name: pattern.name,
          length: pattern.length,
          kit: {
            tracks: pattern.tracks.map((trackId) => {
              const track = project.tracks.byId[trackId];
              return { name: track.name, ...track.params, steps: toDenseSteps(track.steps, track.stepCount) };
            }),
          },
        };
      }),
    };
  });

  return {
    name: project.meta.name,
    author: project.meta.author,
    description: project.meta.description,
    createdAt: project.meta.createdAt,
    banks,
  };
}
