/**
 * Authentication and Authorization Middleware
 *
 * Provides:
 * - authenticate: Enforces valid Bearer JWT on protected routes (401 Unauthorized)
 * - optionalAuthenticate: Attaches req.user if a valid token is present without blocking
 * - requireRole: Enforces role-based permissions e.g. admin (403 Forbidden)
 * - requireUserOwnership: Enforces that students can only access their own user records (403 Forbidden)
 * - enforceRideGroupOwnership: Protects student ride groups from unauthorized mutation/deletion (403 Forbidden)
 */

const { verifyToken } = require('../utils/token');
const { getSupabaseClient } = require('../db/supabase');
const { authService } = require('../services/authService');
const { UnauthorizedError, ForbiddenError, NotFoundError } = require('../errors');
const { rideGroupRepository } = require('../repositories/RideGroupRepository');
const { canModifyOwnedRecord } = require('../utils/ownership');
const { readSessionCookie } = require('../utils/sessionCookie');
const config = require('../config');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Finds the credential on a request. An explicit Bearer header always wins;
 * otherwise the HttpOnly session cookie is used.
 *
 * @param {import('express').Request} req
 * @returns {{ token: string|null, source: 'bearer'|'cookie'|null, malformed?: boolean }}
 */
function extractCredential(req) {
  const authHeader = req.headers.authorization;
  if (authHeader !== undefined) {
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return { token: null, source: null, malformed: true };
    }
    const token = authHeader.slice(7).trim();
    return token ? { token, source: 'bearer' } : { token: null, source: null };
  }
  const cookieToken = readSessionCookie(req);
  return cookieToken ? { token: cookieToken, source: 'cookie' } : { token: null, source: null };
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests. Browsers
 * attach cookies to cross-site requests, so the request's Origin must be one
 * of ours (configured client origins, or the API's own origin). Bearer
 * requests are immune - an attacker's page cannot read or set the header.
 *
 * @param {import('express').Request} req
 */
function assertSameOrigin(req) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  if (!origin) {
    // Browsers omit Origin only for same-origin/navigation requests they
    // describe through Fetch Metadata; anything else is not a browser we trust.
    if (fetchSite === 'same-origin') return;
    throw new ForbiddenError('Cross-site request blocked');
  }
  const own = `${req.protocol}://${req.get('host')}`;
  if (origin === own || config.allowedOrigins.includes(origin)) return;
  throw new ForbiddenError('Cross-site request blocked');
}

/**
 * Mandatory authentication guard middleware.
 * Rejects requests lacking a valid, unexpired Bearer token with 401 Unauthorized.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authenticate(req, res, next) {
  try {
    const credential = extractCredential(req);

    if (credential.malformed) {
      throw new UnauthorizedError('Malformed authorization header. Expected "Bearer <token>"');
    }
    if (!credential.token) {
      throw new UnauthorizedError('Authentication token is required');
    }

    let payload;
    try {
      payload = verifyToken(credential.token);
    } catch (tokenErr) {
      const supabase = getSupabaseClient();
      if (supabase) {
        return supabase.auth.getUser(credential.token).then(({ data, error }) => {
                    if (!error && data?.user) {
            const u = data.user;
            const meta = u.user_metadata || {};
            const email = String(u.email || '').trim().toLowerCase();
            const displayName = meta.full_name || meta.name || email.split('@')[0] || 'Student';
            const avatarUrl = meta.avatar_url || meta.picture || null;
            const collegeName = meta.college_name || 'Dwarkadas J. Sanghvi College of Engineering';

            const { user } = authService.loginWithSupabase({
              email,
              name: displayName,
              picture: avatarUrl,
              college_name: collegeName,
              supabase_id: u.id
            });

            req.user = {
              id: user.id,
              email: user.email,
              role: user.role || 'student',
              full_name: user.full_name || '',
              college_name: user.college_name || ''
            };
            return next();
          }
          next(tokenErr);
        }).catch(() => next(tokenErr));
      }
      throw tokenErr;
    }
    if (credential.source === 'cookie') assertSameOrigin(req);

    // Attach verified user identity context
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'student',
      full_name: payload.full_name || '',
      college_name: payload.college_name || ''
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication middleware.
 * Attaches req.user if a valid token is present; leaves req.user = null otherwise.
 * Does not block unauthenticated requests.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function optionalAuthenticate(req, res, next) {
  const credential = extractCredential(req);

  if (!credential.token) {
    req.user = null;
    return next();
  }

  try {
    const payload = verifyToken(credential.token);
    if (credential.source === 'cookie') assertSameOrigin(req);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'student',
      full_name: payload.full_name || '',
      college_name: payload.college_name || ''
    };
  } catch {
    req.user = null;
  }

  next();
}

/**
 * Role-Based Access Control (RBAC) Guard.
 * Requires the authenticated user to possess one of the allowed roles.
 * Admins are automatically granted access.
 *
 * @param {string|string[]} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function requireRole(allowedRoles = []) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.role === 'admin' || roles.includes(req.user.role)) {
      return next();
    }

    return next(new ForbiddenError('Access forbidden: insufficient role permissions'));
  };
}

/**
 * User Account Resource Ownership Guard.
 * Ensures a user can only access or modify their own private account data.
 * Administrators are permitted access to any account.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireUserOwnership(req, res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const targetUserId = req.params.id;
  if (req.user.role === 'admin' || req.user.id === targetUserId) {
    return next();
  }

  return next(
    new ForbiddenError("Access forbidden: you do not have permission to access another user's private account")
  );
}

/**
 * Ride Group Resource Ownership Guard.
 * Protects student ride groups from unauthorized update or deletion.
 * - Requires an authenticated user (401 otherwise).
 * - Only the account that created the group, or an admin, may mutate it (403).
 * - Anonymous/legacy groups have no owner and are admin-only.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function enforceRideGroupOwnership(req, res, next) {
  try {
    const { id } = req.params;
    const group = rideGroupRepository.findById(id);

    if (!group) {
      throw new NotFoundError('Ride group not found');
    }

    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!canModifyOwnedRecord(rideGroupRepository.getCreatorUserId(id), req.user)) {
      throw new ForbiddenError('You can only modify or delete ride groups that you created');
    }

    req.resource = group;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireUserOwnership,
  enforceRideGroupOwnership
};
