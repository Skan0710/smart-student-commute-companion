const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { z } = require('zod');

// 1. Locate and load environment files safely
// Checks backend/.env first, then root .env
const backendEnvPath = path.resolve(__dirname, '../.env');
const rootEnvPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  // Fall back to default dotenv behavior if neither specific path exists
  dotenv.config();
}

const MIN_JWT_SECRET_LENGTH = 32;

// 2. Define strict Zod schema for environment configuration
const envSchema = z.object({
  PORT: z.coerce
    .number({
      invalid_type_error: 'PORT must be a valid number'
    })
    .int('PORT must be an integer')
    .min(1, 'PORT must be between 1 and 65535')
    .max(65535, 'PORT must be between 1 and 65535')
    .default(5000),

  HOST: z
    .string()
    .default('0.0.0.0'),

  NODE_ENV: z
    .enum(['development', 'production', 'test'], {
      errorMap: () => ({ message: "NODE_ENV must be one of: 'development', 'production', 'test'" })
    })
    .default('development'),

  CLIENT_URL: z
    .string({
      required_error: 'CLIENT_URL is required'
    })
    .url('CLIENT_URL must be a valid URL (e.g., http://localhost:5173 or https://myapp.com)')
    .default('http://localhost:5173'),

  GEMINI_API_KEY: z
    .string()
    .optional()
    .default(''),

  REQUIRE_GEMINI_KEY: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.trim().toLowerCase() === 'true';
      return false;
    })
    .default(false),

  DATABASE_PATH: z
    .string()
    .optional(),

  ALLOW_DEMO_RESET: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform(val => {
      if (val === undefined || val === '') return undefined;
      if (typeof val === 'boolean') return val;
      return val.trim().toLowerCase() === 'true';
    }),

  JWT_SECRET: z
    .string()
    .optional()
    .default(''),

  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .default(''),

  // Reverse-proxy trust: 'false' (default), 'true', a hop count (e.g. '1'), or
  // an Express trust-proxy subnet list. Needed for correct client IPs
  // (rate limiting) and for HTTPS detection behind a TLS-terminating proxy.
  TRUST_PROXY: z
    .string()
    .optional()
    .default('false'),

  // Redirect plain HTTP to HTTPS (requires TRUST_PROXY, see validateEnv)
  FORCE_HTTPS: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform(val => (typeof val === 'boolean' ? val : String(val || '').trim().toLowerCase() === 'true')),

  // Strict-Transport-Security is opt-in: only enable once the domain is
  // committed to HTTPS (browsers cache it for max-age).
  ENABLE_HSTS: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform(val => (typeof val === 'boolean' ? val : String(val || '').trim().toLowerCase() === 'true')),

  HSTS_MAX_AGE_SECONDS: z.coerce.number().int().min(0).max(63072000).optional().default(15552000)
});

/**
 * Express "trust proxy" setting from the TRUST_PROXY string.
 * @param {string} raw
 * @returns {boolean|number|string}
 */
function parseTrustProxy(raw) {
  const value = String(raw || 'false').trim().toLowerCase();
  if (value === 'false' || value === '') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return String(raw).trim();
}

/**
 * Validates raw environment configuration with strict sanitization.
 * Secrets are NEVER included in error messages or logs.
 *
 * @param {Record<string, any>} rawEnv - Environment key-value pairs (defaults to process.env)
 * @returns {Record<string, any>} Validated and normalized configuration
 */
function validateEnv(rawEnv = process.env) {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.errors.map(err => {
      const field = err.path.join('.');
      return `[${field}] ${err.message}`;
    });

    const sanitizedMessage = `[Backend Configuration Error] Missing or invalid environment configuration:\n  - ${errorDetails.join('\n  - ')}`;
    const error = new Error(sanitizedMessage);
    error.name = 'ConfigValidationError';
    error.details = errorDetails;
    throw error;
  }

  const data = result.data;

  // Rule: In production, CLIENT_URL must not be a localhost loopback
  if (data.NODE_ENV === 'production') {
    const isLocalhost = data.CLIENT_URL.includes('localhost') || data.CLIENT_URL.includes('127.0.0.1');
    if (isLocalhost) {
      throw new Error('[Backend Configuration Error] In production, CLIENT_URL must not point to localhost.');
    }
  }

  // Rule: FORCE_HTTPS relies on req.secure, which is only accurate when the
  // proxy in front of the app is trusted. Without it every request looks
  // insecure and the redirect would loop forever.
  if (data.FORCE_HTTPS && parseTrustProxy(data.TRUST_PROXY) === false) {
    throw new Error('[Backend Configuration Error] FORCE_HTTPS requires TRUST_PROXY (e.g. TRUST_PROXY=1) so HTTPS can be detected behind your TLS-terminating proxy.');
  }

  // Rule: production must supply its own signing secret. There is deliberately
  // no built-in default: a published default would let anyone forge tokens.
  if (data.NODE_ENV === 'production' && data.JWT_SECRET.trim().length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `[Backend Configuration Error] JWT_SECRET is required in production and must be at least ${MIN_JWT_SECRET_LENGTH} characters.`
    );
  }

  // Rule: If REQUIRE_GEMINI_KEY is explicitly enabled, GEMINI_API_KEY must not be empty
  if (data.REQUIRE_GEMINI_KEY && (!data.GEMINI_API_KEY || data.GEMINI_API_KEY.trim() === '')) {
    throw new Error('[Backend Configuration Error] GEMINI_API_KEY is required because REQUIRE_GEMINI_KEY is enabled.');
  }

  return data;
}

// 3. Initialize and validate the current process environment
let validatedConfig;
try {
  validatedConfig = validateEnv(process.env);
} catch (err) {
  console.error('\n' + '='.repeat(60));
  console.error(' FATAL CONFIGURATION ERROR');
  console.error('='.repeat(60));
  console.error(err.message);
  console.error('='.repeat(60) + '\n');
  throw err;
}

/**
 * Signing secret for session tokens. Production requires JWT_SECRET (enforced
 * in validateEnv). Elsewhere a missing secret yields a random per-process one,
 * so a forgotten variable can never become a well-known, forgeable default;
 * the cost is that dev sessions end when the process restarts.
 */
function resolveJwtSecret(data) {
  if (data.JWT_SECRET.trim().length >= MIN_JWT_SECRET_LENGTH) {
    return data.JWT_SECRET.trim();
  }
  if (data.JWT_SECRET.trim().length > 0 && data.NODE_ENV !== 'test') {
    console.warn(`[Config] JWT_SECRET is shorter than ${MIN_JWT_SECRET_LENGTH} characters; using a random per-process secret instead.`);
  }
  return require('crypto').randomBytes(48).toString('hex');
}

// Default database path preservation (backend/db/commute.db)
const defaultDbPath = path.resolve(__dirname, '../db/commute.db');
const resolvedDbPath = validatedConfig.DATABASE_PATH
  ? path.resolve(process.cwd(), validatedConfig.DATABASE_PATH)
  : defaultDbPath;

// Build allowed CORS origins array from CLIENT_URL
const allowedOrigins = [validatedConfig.CLIENT_URL];
if (validatedConfig.NODE_ENV !== 'production') {
  // Local dev servers are only trusted origins outside production
  allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}
// Deduplicate origins
const uniqueAllowedOrigins = Array.from(new Set(allowedOrigins));

/**
 * Centralized, validated backend configuration object
 */
const config = {
  port: validatedConfig.PORT,
  host: validatedConfig.HOST,
  nodeEnv: validatedConfig.NODE_ENV,
  isProduction: validatedConfig.NODE_ENV === 'production',
  isDevelopment: validatedConfig.NODE_ENV === 'development',
  isTest: validatedConfig.NODE_ENV === 'test',
  clientUrl: validatedConfig.CLIENT_URL,
  allowedOrigins: uniqueAllowedOrigins,
  geminiApiKey: validatedConfig.GEMINI_API_KEY,
  requireGeminiKey: validatedConfig.REQUIRE_GEMINI_KEY,
  jwtSecret: resolveJwtSecret(validatedConfig),
  googleClientId: validatedConfig.GOOGLE_CLIENT_ID.trim(),
  trustProxy: parseTrustProxy(validatedConfig.TRUST_PROXY),
  forceHttps: Boolean(validatedConfig.FORCE_HTTPS),
  enableHsts: Boolean(validatedConfig.ENABLE_HSTS),
  hstsMaxAgeSeconds: validatedConfig.HSTS_MAX_AGE_SECONDS,
  // Admin-only destructive demo reset: opt-in in production, on elsewhere
  allowDemoReset:
    validatedConfig.ALLOW_DEMO_RESET !== undefined
      ? validatedConfig.ALLOW_DEMO_RESET
      : validatedConfig.NODE_ENV !== 'production',
  jwtExpiresIn: 86400, // 24 hours in seconds
  database: {
    path: resolvedDbPath
  },

  /**
   * Returns a sanitized copy of the configuration safe for logging and diagnostics.
   * Redacts sensitive secrets such as API keys.
   */
  toSanitizedObject() {
    return {
      port: this.port,
      host: this.host,
      nodeEnv: this.nodeEnv,
      clientUrl: this.clientUrl,
      allowedOrigins: this.allowedOrigins,
      databasePath: this.database.path,
      geminiApiKey: this.geminiApiKey
        ? '[REDACTED - configured]'
        : '(not configured - deterministic fallback active)',
      googleClientId: this.googleClientId ? '[configured]' : '(not configured)',
      trustProxy: this.trustProxy,
      forceHttps: this.forceHttps,
      enableHsts: this.enableHsts,
      requireGeminiKey: this.requireGeminiKey,
      jwtSecret: '[REDACTED]'
    };
  }
};

module.exports = config;
module.exports.validateEnv = validateEnv;
module.exports.envSchema = envSchema;
