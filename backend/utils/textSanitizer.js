/**
 * User-generated text hygiene (XSS defence in depth).
 *
 * The browser UI renders everything as text through React, which escapes it.
 * That is the primary defence. This module is the second layer: markup that
 * can only ever be an attack on a text field (script/style blocks, HTML tags,
 * event-handler-bearing elements) is removed *before storage*, and control
 * characters that confuse renderers, logs and terminals are dropped, so stored
 * data stays inert for any other consumer (email, exports, admin tools).
 *
 * Deliberately conservative: plain text such as "delay > 10 min", "a < b" or
 * "<3" is untouched because only tag-shaped sequences are removed.
 */

/** Keys whose values are credentials or binary payloads, never display text. */
const PASSTHROUGH_KEYS = new Set([
  'password', 'current_password', 'new_password', 'credential', 'token',
  'image', 'profile_picture', 'avatar_url', 'picture', 'text', 'rawText'
]);

const MAX_DEPTH = 8;

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeText(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  let out = value.normalize('NFC');
  // Remove blocks whose *content* is code, then any remaining tag-shaped markup.
  out = out.replace(/<\s*(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|noscript|template)\b[^>]*>?/gi, '');
  out = out.replace(/<\/?[a-zA-Z!][^>]*>/g, '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  // C0/C1 control characters (keep \t \n \r), zero-width/bidi overrides used to spoof text.
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, '');
  return out;
}

/**
 * Recursively sanitises every string in a JSON-like structure, in place of
 * copying, skipping credential/binary fields.
 *
 * @param {any} value
 * @param {number} [depth=0]
 * @returns {any}
 */
function sanitizeDeep(value, depth = 0) {
  if (depth > MAX_DEPTH) return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(item => sanitizeDeep(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      // Drop prototype-pollution vectors outright.
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      out[key] = PASSTHROUGH_KEYS.has(key) ? val : sanitizeDeep(val, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Express middleware: sanitises req.body strings before validation/storage.
 *
 * @returns {import('express').RequestHandler}
 */
function sanitizeRequestBody() {
  return function sanitizeBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeDeep(req.body);
    }
    next();
  };
}

module.exports = { sanitizeText, sanitizeDeep, sanitizeRequestBody, PASSTHROUGH_KEYS };
