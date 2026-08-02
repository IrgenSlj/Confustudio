/**
 * Escapes text for interpolation into HTML text or a quoted attribute.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reduces arbitrary text to a safe single filename segment.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeFilenameSegment(value, fallback = 'confustudio') {
  const segment = String(value ?? '')
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return segment || fallback;
}

/**
 * Passes through only hex colours, so persisted text cannot reach a style sink.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeCssColor(value, fallback = '#888888') {
  const color = String(value ?? '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : fallback;
}

/**
 * Coerces to a finite number, falling back when the input is not numeric.
 *
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
