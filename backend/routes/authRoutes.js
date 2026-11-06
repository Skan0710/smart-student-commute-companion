/**
 * Authentication Routes
 *
 * Exposes registration and authentication endpoints.
 */

const express = require('express');
const {
  register,
  validateEmail,
  login,
  logout,
  googleLogin,
  supabaseSessionLogin,
  getMe,
  getUserById,
  updateUserProfile,
  listUsers
} = require('../controllers/authController');
const { validate, registerSchema, loginSchema, updateProfileSchema, googleLoginSchema } = require('../validators');
const { authenticate, requireRole, requireUserOwnership } = require('../middleware/authMiddleware');

function createAuthRoutes() {
  const router = express.Router();

  router.post('/auth/validate-email', validateEmail);
  router.post('/auth/register', validate({ body: registerSchema }), register);
  router.post('/auth/login', validate({ body: loginSchema }), login);
  router.post('/auth/logout', logout);
  router.post('/auth/google', validate({ body: googleLoginSchema }), googleLogin);
  router.post('/auth/supabase-session', supabaseSessionLogin);
  router.get('/auth/me', authenticate, getMe);
  router.get('/auth/users', authenticate, requireRole(['admin']), listUsers);
  router.get('/auth/users/:id', authenticate, requireUserOwnership, getUserById);
  router.patch(
    '/auth/users/:id',
    authenticate,
    requireUserOwnership,
    validate({ body: updateProfileSchema }),
    updateUserProfile
  );

  return router;
}

module.exports = createAuthRoutes;
