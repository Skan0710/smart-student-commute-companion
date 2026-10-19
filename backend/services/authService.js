/**
 * AuthService
 *
 * Encapsulates authentication and registration business logic,
 * uniqueness constraints, credential hashing, and security flows.
 */

const { userRepository } = require('../repositories/UserRepository');
const { ConflictError, UnauthorizedError, NotFoundError } = require('../errors');
const { signToken } = require('../utils/token');
const crypto = require('crypto');
const { hashPassword, verifyPassword, needsRehash } = require('../utils/password');

const EDITABLE_PROFILE_FIELDS = ['full_name', 'college_name'];

// Verified against when an account does not exist, so unknown and known
// emails cost the same. Built lazily with the *current* scrypt parameters.
let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

class AuthService {
  constructor(userRepo = userRepository) {
    this.userRepo = userRepo;
  }

  /**
   * Registers a new student account.
   *
   * @param {object} registrationData
   * @param {string} registrationData.email
   * @param {string} registrationData.password
   * @param {string} registrationData.full_name
   * @param {string} registrationData.college_name
   * @param {string} [registrationData.role='student']
   * @returns {object} Safe user representation without password hash
   */
  register(registrationData) {
    const existing = this.userRepo.findByEmail(registrationData.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const user = this.userRepo.create(registrationData);
    return user.toSafeObject();
  }

  /**
   * Authenticates user credentials and generates a secure signed token.
   * Employs constant-time fake hashing to prevent timing-based user enumeration.
   *
   * @param {object} credentials
   * @param {string} credentials.email
   * @param {string} credentials.password
   * @returns {{ user: object, token: string }}
   * @throws {UnauthorizedError}
   */
  login(credentials) {
    const user = this.userRepo.findByEmail(credentials.email);

    if (!user) {
      // Execute dummy password verification to maintain uniform timing
      verifyPassword(credentials.password, getDummyHash());
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = user.verifyPassword(credentials.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Transparently upgrade hashes created with older scrypt parameters now
    // that the plaintext is available.
    if (needsRehash(user.password_hash)) {
      this.userRepo.update(user.id, { password_hash: hashPassword(credentials.password) });
    }

    return this._issueSession(user);
  }

  /**
   * Signs a session token for a verified user.
   *
   * @param {object} user - User model instance
   * @returns {{ user: object, token: string }}
   */
  _issueSession(user) {
    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      college_name: user.college_name
    });

    return {
      user: user.toSafeObject(),
      token
    };
  }

  /**
   * Signs in (or first-time provisions) a student from an identity that
   * Google has already verified server-side.
   *
   * Accounts are matched by verified email. A new account is a student with
   * an unguessable random password, so it can only be entered through Google
   * until the student chooses to set one.
   *
   * @param {{ email: string, name?: string }} profile - verified Google profile
   * @returns {{ user: object, token: string }}
   */
  loginWithGoogle(profile) {
    const email = String(profile.email || '').trim().toLowerCase();
    let user = this.userRepo.findByEmail(email);

    if (!user) {
      const displayName = (profile.name || email.split('@')[0] || 'Student').trim();
      user = this.userRepo.create({
        email,
        password: `${crypto.randomBytes(32).toString('base64url')}Aa1`,
        full_name: displayName.length >= 2 ? displayName.slice(0, 100) : 'Student',
        college_name: 'Not specified',
        role: 'student'
      });
    }

    return this._issueSession(user);
  }

  /**
   * Retrieves user profile by user ID.
   *
   * @param {string} userId
   * @returns {object}
   */
  getProfile(userId) {
    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }
    return user.toSafeObject();
  }

  /**
   * Updates an existing user's profile.
   *
   * @param {string} userId
   * @param {object} updates
   * @returns {object}
   */
  updateProfile(userId, updates = {}) {
    const existing = this.userRepo.findById(userId);
    if (!existing) {
      throw new NotFoundError('User profile not found');
    }
    // Defense in depth: only display fields are ever writable here, even if
    // a caller forgets to validate. role / password_hash must never flow in.
    const safeUpdates = {};
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (updates[field] !== undefined) safeUpdates[field] = updates[field];
    }
    const updated = this.userRepo.update(userId, safeUpdates);
    return updated.toSafeObject();
  }

  /**
   * Lists all registered user accounts (admin only).
   *
   * @returns {object[]}
   */
  listUsers() {
    const users = this.userRepo.findAll();
    return users.map(u => u.toSafeObject());
  }
}

const authService = new AuthService();

module.exports = {
  AuthService,
  authService
};
