const express = require('express');
const cors = require('cors');
const config = require('./config');
const createApiRouter = require('./routes');
const { getHealth } = require('./controllers/healthController');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { securityHeaders, forceHttps } = require('./middleware/transportSecurity');
const { createRateLimiters, applyRateLimits } = require('./middleware/rateLimiter');
const { sanitizeRequestBody } = require('./utils/textSanitizer');
const { responseTrimmer } = require('./middleware/responseTrimmer');

// Routes that legitimately carry an image as base64 (<= 5 MB decoded, ~7 MB encoded).
// Everything else is capped far lower, which also bounds the memory a hostile
// payload can make the validators allocate.
const IMAGE_BODY_LIMIT = '8mb';
const DEFAULT_BODY_LIMIT = '100kb';

/**
 * Creates and configures the Express application instance.
 * Separates application setup from network listener lifecycle.
 *
 * @param {object} [options]
 * @param {import('socket.io').Server} [options.io] - Socket.IO server instance for real-time broadcasts
 * @param {object} [options.rateLimits] - Per-limiter overrides, e.g. { loginAccount: { max: 3 } }
 * @returns {express.Application} Configured Express application
 */
function createApp(options = {}) {
  const app = express();
  const io = options.io || null;

  // 0. Proxy trust, transport security and hardening headers. These come
  // first so redirects and headers apply to every response, errors included.
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(forceHttps({ forceHttps: config.forceHttps }));
  app.use(securityHeaders({
    enableHsts: config.enableHsts,
    hstsMaxAgeSeconds: config.hstsMaxAgeSeconds,
    hstsPreload: config.hstsPreload
  }));

  // 1. CORS: explicit origins only (never a wildcard), so the HttpOnly session
  // cookie may accompany requests from the configured client origins. Cookie-
  // authenticated writes are additionally Origin-checked (see authMiddleware).
  app.use(cors({
    origin: config.allowedOrigins,
    credentials: true
  }));

  // 2. Request body parsing (explicit size caps). The larger image parsers run first
  // and mark the body as parsed, so the strict default below never re-reads them.
  const imageJson = express.json({ limit: IMAGE_BODY_LIMIT });
  app.post('/api/academic/timetable/scan', imageJson);
  app.patch('/api/auth/users/:id', imageJson);
  app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));

  // 2a. Neutralise markup in user text before it is validated or stored, and make
  // sure no response can carry credential/internal fields.
  app.use(sanitizeRequestBody());
  app.use(responseTrimmer());

  // 2b. Abuse protection (rate limits + signup honeypot), mounted before routes
  const rateLimiters = createRateLimiters(options.rateLimits);
  app.locals.rateLimiters = rateLimiters;
  applyRateLimits(app, rateLimiters);

  // 3. Health check endpoints (root & API)
  app.get('/health', getHealth);

  // 4. Mount API routes
  app.use('/api', createApiRouter(io));

  // 5. Hook for injecting testing routes or pre-404 middleware
  if (typeof options.beforeNotFound === 'function') {
    options.beforeNotFound(app);
  }

  // 6. 404 Catch-all for unmatched routes
  app.use(notFoundHandler);

  // 7. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
