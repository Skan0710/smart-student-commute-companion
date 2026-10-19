const express = require('express');
const cors = require('cors');
const config = require('./config');
const createApiRouter = require('./routes');
const { getHealth } = require('./controllers/healthController');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { securityHeaders, forceHttps } = require('./middleware/transportSecurity');
const { createRateLimiters, applyRateLimits } = require('./middleware/rateLimiter');

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
    hstsMaxAgeSeconds: config.hstsMaxAgeSeconds
  }));

  // 1. CORS: explicit origins only. Sessions are Bearer tokens (no cookies),
  // so cross-origin credentials are not needed and stay off.
  app.use(cors({
    origin: config.allowedOrigins,
    credentials: false
  }));

  // 2. Request body parsing (explicit size cap)
  app.use(express.json({ limit: '100kb' }));

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
