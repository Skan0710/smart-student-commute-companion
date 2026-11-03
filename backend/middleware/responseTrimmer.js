/**
 * API response minimisation.
 *
 * Models already expose "safe" shapes (toSafeObject, etc). This middleware is the
 * backstop: any JSON response is stripped of credential and internal bookkeeping
 * fields, whatever code path produced it, so a future endpoint that forgets to
 * trim cannot leak a password hash or reset token.
 */

/** Keys that must never leave the server. Matched case-insensitively. */
const FORBIDDEN_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'salt',
  'reset_token',
  'resettoken',
  'internal_id',
  'internalid',
  'version',
  'supabase_service_role_key',
  '__v'
]);

const MAX_DEPTH = 12;

/**
 * Removes forbidden keys from a JSON-like value (returns a trimmed copy only
 * when something had to change; otherwise the original reference).
 *
 * @param {any} value
 * @param {number} [depth=0]
 * @returns {any}
 */
function trimSensitiveFields(value, depth = 0) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map(item => {
      const trimmed = trimSensitiveFields(item, depth + 1);
      if (trimmed !== item) changed = true;
      return trimmed;
    });
    return changed ? out : value;
  }

  // Leave non-plain objects (Buffer, Date, ...) to their own serialisers.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  let changed = false;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      changed = true;
      continue;
    }
    const trimmed = trimSensitiveFields(val, depth + 1);
    if (trimmed !== val) changed = true;
    out[key] = trimmed;
  }
  return changed ? out : value;
}

/** @returns {import('express').RequestHandler} */
function responseTrimmer() {
  return function trimResponses(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = body => originalJson(trimSensitiveFields(body));
    next();
  };
}

module.exports = { responseTrimmer, trimSensitiveFields, FORBIDDEN_KEYS };
