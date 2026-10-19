/**
 * Voter / participant identity for anonymous community actions.
 *
 * Signed-in students are identified by account id. Anonymous browsers send a
 * self-generated pseudonym token in `x-user-token`; it is only a de-duplication
 * hint (never authorization), so it is length- and charset-checked before it
 * is stored. Anything else falls back to the client IP.
 */

const ANON_TOKEN_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * @param {import('express').Request} req
 * @returns {string|null} the validated anonymous token, or null
 */
function getAnonymousToken(req) {
  const header = req.headers['x-user-token'];
  return typeof header === 'string' && ANON_TOKEN_PATTERN.test(header) ? header : null;
}

/**
 * @param {import('express').Request} req
 * @returns {string} stable identity string for de-duplicating votes
 */
function getClientIdentity(req) {
  if (req.user && req.user.id) return `user:${req.user.id}`;
  const token = getAnonymousToken(req);
  if (token) return token;
  return `ip:${req.ip || 'unknown'}`;
}

module.exports = { getAnonymousToken, getClientIdentity, ANON_TOKEN_PATTERN };
