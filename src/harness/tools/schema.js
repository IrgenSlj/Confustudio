// Minimal JSON-Schema validator — the subset the tool registry needs.
//
// CONFUstudio is dependency-light by design (the server has ZERO runtime npm
// deps), so we don't pull ajv. This validates the exact schema features the
// tool descriptors use: object/array/string/number/integer/boolean types,
// `properties`, `required`, `enum`, `minimum`/`maximum`, `items`, and
// `additionalProperties: false`. It is pure and fully unit-tested.
//
// It also *coerces* where an LLM commonly stringifies: numeric strings for
// number/integer params, and "true"/"false" for booleans. Coercion never
// widens the contract — an out-of-range or wrong-type value still fails.

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok
 * @property {string[]} errors — human-readable, path-prefixed
 * @property {*} value — coerced value when ok, else the original input
 */

/** @param {*} v */
function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v; // 'object' | 'string' | 'number' | 'boolean' | 'undefined'
}

/**
 * Coerce a scalar toward the schema's declared type when it is safe and
 * lossless. Returns the coerced value, or the original if no coercion applies.
 */
function coerceScalar(schema, value) {
  const t = schema.type;
  if ((t === 'number' || t === 'integer') && typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (t === 'boolean' && typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
}

/**
 * Validate `value` against `schema`, collecting every error (not just the
 * first) so tool-call feedback to the model is actionable.
 *
 * @param {object} schema — a JSON-Schema fragment (subset, see file header)
 * @param {*} value
 * @param {string} [path] — internal, for nested error messages
 * @returns {ValidationResult}
 */
export function validate(schema, value, path = '') {
  const errors = [];
  const at = path || 'value';

  if (!schema || typeof schema !== 'object') {
    return { ok: true, errors, value };
  }

  let v = coerceScalar(schema, value);

  // type
  if (schema.type) {
    const actual = typeOf(v);
    const wanted = schema.type;
    const typeOk =
      wanted === actual ||
      (wanted === 'integer' && actual === 'number' && Number.isInteger(v)) ||
      (wanted === 'number' && actual === 'number');
    if (!typeOk) {
      errors.push(`${at}: expected ${wanted}, got ${actual}`);
      // Can't meaningfully check further constraints against the wrong type.
      return { ok: false, errors, value };
    }
  }

  // enum
  if (Array.isArray(schema.enum) && !schema.enum.includes(v)) {
    errors.push(`${at}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  }

  // numeric bounds
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof schema.minimum === 'number' && v < schema.minimum) {
      errors.push(`${at}: must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && v > schema.maximum) {
      errors.push(`${at}: must be <= ${schema.maximum}`);
    }
    if (schema.type === 'integer' && !Number.isInteger(v)) {
      errors.push(`${at}: must be an integer`);
    }
  }

  // object
  if (schema.type === 'object' && typeOf(v) === 'object') {
    const out = {};
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (v[key] === undefined) errors.push(`${at}.${key}: required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(v)) {
        if (!(key in props)) errors.push(`${at}.${key}: unexpected property`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (v[key] === undefined) continue;
      const r = validate(sub, v[key], `${at}.${key}`);
      errors.push(...r.errors);
      out[key] = r.value;
    }
    // Preserve pass-through keys when additionalProperties isn't forbidden.
    if (schema.additionalProperties !== false) {
      for (const key of Object.keys(v)) {
        if (!(key in props)) out[key] = v[key];
      }
    }
    v = out;
  }

  // array
  if (schema.type === 'array' && Array.isArray(v)) {
    if (schema.items) {
      v = v.map((item, i) => {
        const r = validate(schema.items, item, `${at}[${i}]`);
        errors.push(...r.errors);
        return r.value;
      });
    }
  }

  return { ok: errors.length === 0, errors, value: v };
}
