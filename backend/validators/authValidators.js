/**
 * Authentication Validators
 *
 * Zod validation schemas for registration, login, and identity verification.
 */

const { z } = require('zod');
const { validatePasswordStrength } = require('../utils/password');

const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .transform(val => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .superRefine((val, ctx) => {
      const result = validatePasswordStrength(val);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.message
        });
      }
    }),
  full_name: z
    .string({ required_error: 'Full name is required' })
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name cannot exceed 100 characters')
    .transform(val => val.trim()),
  college_name: z
    .string({ required_error: 'College name is required' })
    .min(2, 'College name must be at least 2 characters')
    .max(150, 'College name cannot exceed 150 characters')
    .transform(val => val.trim())
  // NOTE: `role` is deliberately not accepted from clients. Every
  // self-registered account is a student; admins are provisioned
  // out-of-band (see scripts/promote_admin.js). Unknown keys are stripped.
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .max(255)
    .transform(val => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
});

/**
 * Self-service profile update. Only display fields are editable; role,
 * email, id and password hash can never be changed through this endpoint.
 */
const updateProfileSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name cannot exceed 100 characters')
      .optional(),
    college_name: z
      .string()
      .trim()
      .min(2, 'College name must be at least 2 characters')
      .max(150, 'College name cannot exceed 150 characters')
      .optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

/** Google Sign-In ID token ("credential") as issued to the browser. */
const googleLoginSchema = z.object({
  credential: z
    .string({ required_error: 'Google credential is required' })
    .min(20, 'Google credential is invalid')
    .max(4096, 'Google credential is invalid')
});

module.exports = {
  googleLoginSchema,
  registerSchema,
  loginSchema,
  updateProfileSchema
};
