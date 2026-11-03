/**
 * Session cookie helpers.
 *
 * The signed JWT is also delivered in an HttpOnly cookie so browser JavaScript
 * (and therefore any XSS payload) can never read it from `document.cookie`.
 * API clients that cannot hold cookies keep using `Authorization: Bearer`.
 *
 * Flags:
 *  - HttpOnly   always; the page never needs the token.
 *  - Secure     whenever the request arrived over HTTPS or NODE_ENV=production.
 *  - SameSite   Lax by default (blocks cross-site POST/PUT/PATCH/DELETE);
 *               Strict or None are selectable via SESSION_COOKIE_SAMESITE.
 *  - Path=/     scoped to the whole origin; Max-Age matches the JWT lifetime.
 */

const config = require('../config');

const SESSION_COOKIE_NAME = 'sc_session';
const SESSION_MAX_AGE_SECONDS = 86400; // keep in step with utils/token.js

/**
 * Minimal Cookie header parser (no dependency, no prototype pollution).
 *
 * @param {string|undefined} header
 * @returns {Record<string,string>}
 */
function parseCookies(header) {
  const out = Object.create(null);
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const name = part.slice(0, idx).trim();
    if (!name || name in out) continue; // first occurrence wins
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** @param {import('express').Request} req */
function readSessionCookie(req) {
  return parseCookies(req.headers && req.headers.cookie)[SESSION_COOKIE_NAME] || null;
}

function cookieFlags(req) {
  const secure = Boolean(req.secure) || config.nodeEnv === 'production';
  let sameSite = String(config.sessionCookieSameSite || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) sameSite = 'lax';
  // Browsers reject SameSite=None without Secure; fall back rather than emit a dead cookie.
  if (sameSite === 'none' && !secure) sameSite = 'lax';
  return { secure, sameSite: sameSite[0].toUpperCase() + sameSite.slice(1) };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} token
 */
function setSessionCookie(req, res, token) {
  const { secure, sameSite } = cookieFlags(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    `SameSite=${sameSite}`
  ];
  if (secure) attrs.push('Secure');
  appendSetCookie(res, attrs.join('; '));
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function clearSessionCookie(req, res) {
  const { secure, sameSite } = cookieFlags(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    `SameSite=${sameSite}`
  ];
  if (secure) attrs.push('Secure');
  appendSetCookie(res, attrs.join('; '));
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', cookie);
  else res.setHeader('Set-Cookie', [].concat(existing, cookie));
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  parseCookies,
  readSessionCookie,
  setSessionCookie,
  clearSessionCookie
};
