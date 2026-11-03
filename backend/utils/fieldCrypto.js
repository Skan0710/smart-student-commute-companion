/**
 * Field-level encryption at rest (AES-256-GCM).
 *
 * Sensitive profile values (e.g. a student's home area) are encrypted before
 * they reach the database, so a copied database file or a SQL dump does not
 * disclose them.
 *
 * Envelope:  enc:v1:<iv>:<authTag>:<ciphertext>   (all base64url)
 *  - fresh random 96-bit IV per value (never reused with a key);
 *  - the 128-bit GCM tag authenticates the ciphertext *and* a context string
 *    ("table.column:rowId"), so a value copied to another row or column fails
 *    to decrypt instead of silently being accepted;
 *  - values without the prefix are treated as legacy plaintext and returned
 *    unchanged, which lets existing databases migrate lazily.
 *
 * Key: FIELD_ENCRYPTION_KEY, 32 bytes as 64 hex chars or base64. It is required
 * in production. Without it (development) values are stored as before and a
 * single warning is logged. Keep the key out of the database and out of git;
 * losing it makes the encrypted values unrecoverable.
 */

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let warnedNoKey = false;

/**
 * Parses a key string into a 32-byte Buffer.
 *
 * @param {string} raw
 * @returns {Buffer}
 * @throws {Error} when the key is not exactly 32 bytes
 */
function parseKey(raw) {
  const value = String(raw || '').trim();
  let key = null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) key = Buffer.from(value, 'hex');
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(value)) key = Buffer.from(value, 'base64');
  if (!key || key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 32 random bytes (64 hex characters or 44 base64 characters).');
  }
  return key;
}

function resolveKey(explicitKey) {
  if (explicitKey) return Buffer.isBuffer(explicitKey) ? explicitKey : parseKey(explicitKey);
  const raw = require('../config').fieldEncryptionKey;
  return raw ? parseKey(raw) : null;
}

/** @param {unknown} value */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypts a string. Empty values and non-strings pass through unchanged.
 *
 * @param {string} plaintext
 * @param {string} context - binds the value to its location, e.g. `student_profiles.home_area:usr-1`
 * @param {Buffer|string} [explicitKey] - overrides the configured key (tests)
 * @returns {string}
 */
function encryptField(plaintext, context, explicitKey) {
  if (typeof plaintext !== 'string' || plaintext === '' || isEncrypted(plaintext)) return plaintext;
  const key = resolveKey(explicitKey);
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn('[fieldCrypto] FIELD_ENCRYPTION_KEY is not set: sensitive fields are stored unencrypted (development only).');
    }
    return plaintext;
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(String(context || ''), 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map(b => b.toString('base64url')).join(':');
}

/**
 * Decrypts a value written by encryptField. Legacy plaintext passes through.
 *
 * @param {string} stored
 * @param {string} context - must equal the context used to encrypt
 * @param {Buffer|string} [explicitKey]
 * @returns {string}
 * @throws {Error} when the key is missing/wrong or the data was tampered with or moved
 */
function decryptField(stored, context, explicitKey) {
  if (!isEncrypted(stored)) return stored;
  const key = resolveKey(explicitKey);
  if (!key) throw new Error('Encrypted field found but FIELD_ENCRYPTION_KEY is not configured.');
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted field.');
  const [iv, tag, ciphertext] = parts.map(p => Buffer.from(p, 'base64url'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed encrypted field.');
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(String(context || ''), 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Encrypted field failed authentication (wrong key, altered data, or moved value).');
  }
}

module.exports = { encryptField, decryptField, isEncrypted, parseKey, PREFIX };
