/**
 * Password Security & Hashing Utilities
 *
 * Implements OWASP-recommended password hashing using Node.js native crypto.scrypt
 * with cryptographically secure random salts and constant-time equality verification.
 */

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;
// Current parameters (OWASP minimum for scrypt: N=2^15, r=8, p=1).
const SCRYPT_PARAMS = {
  N: 32768, // CPU/memory cost
  r: 8,     // Block size
  p: 1      // Parallelization
};
// Hashes written before parameters were stored alongside them ("salt:hash").
const LEGACY_SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SALT_BYTES = 16;
const HASH_SCHEME = 'scrypt';

/** scrypt needs ~128 * N * r bytes; leave headroom above Node's 32 MiB default. */
function scryptOptions({ N, r, p }) {
  return { N, r, p, maxmem: 128 * N * r * 2 };
}

/**
 * Validates password complexity:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 *
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a string' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password cannot exceed 128 characters' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Hashes a plaintext password using crypto.scryptSync with a 16-byte random salt.
 *
 * @param {string} password - Plaintext password
 * @returns {string} "scrypt:N:r:p:saltHex:hashHex" — the cost parameters travel
 *   with the hash so they can be raised later without breaking old hashes.
 */
function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, scryptOptions(SCRYPT_PARAMS));
  const { N, r, p } = SCRYPT_PARAMS;
  return `${HASH_SCHEME}:${N}:${r}:${p}:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Parses either supported stored-hash layout.
 *
 * @param {string} storedHash
 * @returns {{ params: {N:number,r:number,p:number}, salt: string, hashHex: string }|null}
 */
function parseStoredHash(storedHash) {
  const parts = storedHash.split(':');

  if (parts.length === 2) {
    const [salt, hashHex] = parts;
    return salt && hashHex ? { params: LEGACY_SCRYPT_PARAMS, salt, hashHex } : null;
  }

  if (parts.length === 6 && parts[0] === HASH_SCHEME) {
    const [, N, r, p, salt, hashHex] = parts;
    const params = { N: Number(N), r: Number(r), p: Number(p) };
    const sane =
      Number.isInteger(params.N) && params.N >= 2 && (params.N & (params.N - 1)) === 0 && params.N <= 2 ** 20 &&
      Number.isInteger(params.r) && params.r >= 1 && params.r <= 32 &&
      Number.isInteger(params.p) && params.p >= 1 && params.p <= 16;
    return sane && salt && hashHex ? { params, salt, hashHex } : null;
  }

  return null;
}

/**
 * Whether a stored hash predates the current cost parameters and should be
 * re-hashed (after a successful login, when the plaintext is available).
 *
 * @param {string} storedHash
 * @returns {boolean}
 */
function needsRehash(storedHash) {
  const parsed = typeof storedHash === 'string' ? parseStoredHash(storedHash) : null;
  if (!parsed) return false;
  const { N, r, p } = parsed.params;
  return N !== SCRYPT_PARAMS.N || r !== SCRYPT_PARAMS.r || p !== SCRYPT_PARAMS.p;
}

/**
 * Verifies a plaintext candidate password against a stored hash (current
 * "scrypt:N:r:p:salt:hash" or legacy "salt:hash") using constant-time comparison.
 *
 * @param {string} password - Plaintext candidate password
 * @param {string} storedHash - Stored password hash
 * @returns {boolean} True if password matches, false otherwise
 */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parsed = parseStoredHash(storedHash);
  if (!parsed) {
    return false;
  }

  const { params, salt, hashHex: expectedHashHex } = parsed;

  try {
    const candidateKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, scryptOptions(params));
    const candidateHashHex = candidateKey.toString('hex');

    const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
    const candidateBuffer = Buffer.from(candidateHashHex, 'hex');

    if (expectedBuffer.length !== candidateBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordStrength,
  SCRYPT_KEYLEN,
  SALT_BYTES
};
