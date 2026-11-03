/**
 * Authentication Controller
 *
 * Handles HTTP requests for user registration and authentication workflows.
 */

const { authService } = require('../services');
const { verifyGoogleIdToken } = require('../services/googleIdentityService');
const { getSupabaseClient } = require('../db/supabase');
const { created, success } = require('../utils/apiResponse');
const { setSessionCookie, clearSessionCookie } = require('../utils/sessionCookie');

/**
 * Handles student registration.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function register(req, res, next) {
  try {
    const user = authService.register(req.body);

    // Sync account creation to Supabase Authentication if configured
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.admin.createUser({
          email: req.body.email.trim().toLowerCase(),
          password: req.body.password,
          email_confirm: true,
          // Server-only claim the database's RLS policies trust to map this
          // Supabase identity to the application user id (user_metadata is
          // client-editable and must never be used for authorization).
          app_metadata: { app_user_id: user.id },
          user_metadata: {
            full_name: req.body.full_name,
            college_name: req.body.college_name
          }
        });
      }
    } catch (supaErr) {
      console.warn('[Supabase Auth Sync]', supaErr.message);
    }

    return created(res, {
      message: 'Account registered successfully',
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles student authentication / login.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function login(req, res, next) {
  try {
    let sessionResult;
    try {
      sessionResult = authService.login(req.body);
    } catch (localErr) {
      // If user not in local database, verify if registered directly in Supabase
      const supabase = getSupabaseClient();
      if (supabase && localErr.statusCode === 401) {
        const { data: supaAuth, error: supaErr } = await supabase.auth.signInWithPassword({
          email: req.body.email,
          password: req.body.password
        });
        if (supaAuth?.user && !supaErr) {
          const meta = supaAuth.user.user_metadata || {};
          const createdUser = authService.userRepo.create({
            email: req.body.email,
            password: req.body.password,
            full_name: meta.full_name || req.body.email.split('@')[0],
            college_name: meta.college_name || 'Not specified',
            profile_picture: meta.avatar_url || meta.picture || null,
            role: 'student'
          });
          sessionResult = authService._issueSession(createdUser, supaAuth.session);
        } else {
          throw localErr;
        }
      } else {
        throw localErr;
      }
    }

    // Attempt to acquire Supabase tokens if available
    try {
      const supabase = getSupabaseClient();
      if (supabase && !sessionResult.supabase_token) {
        const { data: supaAuth } = await supabase.auth.signInWithPassword({
          email: req.body.email,
          password: req.body.password
        });
        if (supaAuth?.session) {
          sessionResult.supabase_token = supaAuth.session.access_token;
          sessionResult.supabase_refresh_token = supaAuth.session.refresh_token;
        }
      }
    } catch (e) {
      // Non-fatal
    }

    setSessionCookie(req, res, sessionResult.token);

    return success(res, {
      message: 'Login successful',
      token: sessionResult.token,
      session_transport: 'cookie',
      user: sessionResult.user,
      supabase_token: sessionResult.supabase_token || null,
      supabase_refresh_token: sessionResult.supabase_refresh_token || null
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Ends the browser session by expiring the HttpOnly cookie. Idempotent and
 * safe to call while signed out. (Bearer tokens are stateless and simply
 * expire; clients discard them.)
 */
function logout(req, res) {
  clearSessionCookie(req, res);
  return success(res, { message: 'Signed out' });
}

/**
 * Signs in with a Google ID token that is verified server-side.
 */
async function googleLogin(req, res, next) {
  try {
    const profile = await verifyGoogleIdToken(req.body.credential);
    const { user, token } = authService.loginWithGoogle(profile);
    setSessionCookie(req, res, token);
    return success(res, {
      message: 'Login successful',
      token,
      session_transport: 'cookie',
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the currently authenticated student profile.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function getMe(req, res, next) {
  try {
    const user = authService.getProfile(req.user.id);
    return success(res, { user });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a user by identifier (ownership or admin enforced by middleware).
 */
function getUserById(req, res, next) {
  try {
    const user = authService.getProfile(req.params.id);
    return success(res, { user });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a user's profile (ownership or admin enforced by middleware).
 */
function updateUserProfile(req, res, next) {
  try {
    const user = authService.updateProfile(req.params.id, req.body);
    return success(res, {
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all registered users (admin only).
 */
function listUsers(req, res, next) {
  try {
    const users = authService.listUsers();
    return success(res, { users });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  logout,
  login,
  googleLogin,
  getMe,
  getUserById,
  updateUserProfile,
  listUsers
};
