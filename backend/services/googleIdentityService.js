/**
 * Google Identity Service
 *
 * Verifies a Google Sign-In ID token ("credential") on the server. The
 * browser is never trusted to say who the user is: the token is checked with
 * Google, then its audience (our client id), issuer, expiry and verified-email
 * claims are validated here.
 */

const axios = require('axios');
const config = require('../config');
const { UnauthorizedError, ServiceUnavailableError } = require('../errors');

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const REQUEST_TIMEOUT_MS = 5000;

/**
 * @param {string} idToken
 * @param {object} [options]
 * @param {string} [options.clientId] - Expected audience (defaults to config)
 * @param {{ get: Function }} [options.http] - HTTP client (injectable for tests)
 * @returns {Promise<{ email: string, name: string, sub: string }>}
 * @throws {ServiceUnavailableError} when Google sign-in is not configured
 * @throws {UnauthorizedError} when the token cannot be verified
 */
async function verifyGoogleIdToken(idToken, options = {}) {
  const clientId = options.clientId !== undefined ? options.clientId : config.googleClientId;
  const http = options.http || axios;

  if (!clientId) {
    throw new ServiceUnavailableError('Google sign-in is not configured on this server', 'GOOGLE_AUTH_NOT_CONFIGURED');
  }

  let claims;
  try {
    const response = await http.get(TOKENINFO_URL, {
      params: { id_token: idToken },
      timeout: REQUEST_TIMEOUT_MS
    });
    claims = response.data;
  } catch (err) {
    // Google answers 400 for malformed/expired/forged tokens; anything else is
    // an upstream problem, not the student's fault.
    if (err && err.response && err.response.status === 400) {
      throw new UnauthorizedError('Google sign-in could not be verified');
    }
    throw new ServiceUnavailableError('Google sign-in is temporarily unavailable', 'GOOGLE_AUTH_UNAVAILABLE');
  }

  const emailVerified = claims && (claims.email_verified === true || claims.email_verified === 'true');
  const notExpired = claims && Number(claims.exp) * 1000 > Date.now();

  if (
    !claims ||
    claims.aud !== clientId ||
    !VALID_ISSUERS.has(claims.iss) ||
    !notExpired ||
    !emailVerified ||
    typeof claims.email !== 'string' ||
    !claims.email ||
    typeof claims.sub !== 'string'
  ) {
    throw new UnauthorizedError('Google sign-in could not be verified');
  }

  return {
    email: claims.email.trim().toLowerCase(),
    name: typeof claims.name === 'string' ? claims.name : '',
    sub: claims.sub
  };
}

module.exports = { verifyGoogleIdToken, TOKENINFO_URL };
