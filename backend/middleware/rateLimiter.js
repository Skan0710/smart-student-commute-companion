/**
 * Rate limiting & basic bot friction
 *
 * A small fixed-window limiter with no external dependency. State lives in
 * this process's memory: that is correct for the single-instance SQLite
 * deployment this app ships with, but a horizontally scaled deployment must
 * back the store with something shared (Redis, the edge/WAF) — see the
 * `store` seam on createRateLimiter.
 *
 * Client identity is `req.ip`. Behind a reverse proxy that is only correct
 * when TRUST_PROXY is configured (see config), otherwise every client shares
 * the proxy's address.
 */

const { TooManyRequestsError, BadRequestError } = require('../errors');

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Default budgets. Overridable per app instance (tests, future tuning). */
const DEFAULT_LIMITS = {
  // Everything under /api, per client IP
  api: { windowMs: MINUTE, max: 600 },
  // Credential guessing: per client IP across all accounts...
  loginIp: { windowMs: 15 * MINUTE, max: 30 },
  // ...and per (client IP + account), counting only failures, so an attacker
  // cannot lock a victim out from other addresses.
  loginAccount: { windowMs: 15 * MINUTE, max: 8 },
  googleLogin: { windowMs: 15 * MINUTE, max: 30 },
  // Account creation / signup spam
  register: { windowMs: HOUR, max: 20 },
  // Anonymous community writes (reports, votes, groups, feedback)
  publicWrite: { windowMs: MINUTE, max: 30 },
  // Endpoints that fan out to external services (routing, geocoding)
  heavy: { windowMs: MINUTE, max: 60 }
};

/**
 * @param {object} options
 * @param {string} options.name - Label used in the error and logs
 * @param {number} options.windowMs
 * @param {number} options.max - Requests allowed per window per key
 * @param {(req) => string|null} [options.keyFn] - Return null to skip limiting
 * @param {boolean} [options.countOnlyFailures=false] - Refund responses < 400
 * @param {Map} [options.store] - Injectable store (default: in-memory Map)
 * @param {() => number} [options.now] - Injectable clock
 * @returns {import('express').RequestHandler & { reset: () => void }}
 */
function createRateLimiter({
  name,
  windowMs,
  max,
  keyFn = req => req.ip || 'unknown',
  countOnlyFailures = false,
  store = new Map(),
  now = Date.now
}) {
  let lastSweep = now();

  function sweep(current) {
    if (store.size < 5000 && current - lastSweep < windowMs) return;
    lastSweep = current;
    for (const [key, entry] of store) {
      if (entry.resetAt <= current) store.delete(key);
    }
  }

  const middleware = function rateLimiter(req, res, next) {
    const key = keyFn(req);
    if (key === null || key === undefined) return next();

    const current = now();
    sweep(current);

    let entry = store.get(key);
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + windowMs };
      store.set(key, entry);
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - current) / SECOND));
    res.setHeader('RateLimit-Limit', String(max));

    if (entry.count >= max) {
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return next(
        new TooManyRequestsError('Too many requests. Please wait a moment and try again.', 'RATE_LIMITED', {
          limiter: name,
          retryAfterSeconds
        })
      );
    }

    entry.count += 1;
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (countOnlyFailures) {
      res.on('finish', () => {
        if (res.statusCode < 400 && entry.count > 0) entry.count -= 1;
      });
    }

    next();
  };

  middleware.reset = () => store.clear();
  return middleware;
}

/** Lower-cased account identifier from a credential request body, if any. */
function accountKey(req) {
  const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return email ? email.slice(0, 255) : null;
}

/**
 * Builds the limiter set for one app instance.
 *
 * @param {Partial<typeof DEFAULT_LIMITS>} [overrides]
 */
function createRateLimiters(overrides = {}) {
  const cfg = {};
  for (const [name, defaults] of Object.entries(DEFAULT_LIMITS)) {
    cfg[name] = { ...defaults, ...(overrides[name] || {}) };
  }

  return {
    config: cfg,
    api: createRateLimiter({ name: 'api', ...cfg.api }),
    loginIp: createRateLimiter({ name: 'login-ip', ...cfg.loginIp }),
    loginAccount: createRateLimiter({
      name: 'login-account',
      ...cfg.loginAccount,
      countOnlyFailures: true,
      keyFn: req => {
        const account = accountKey(req);
        return account ? `${req.ip || 'unknown'}|${account}` : null;
      }
    }),
    googleLogin: createRateLimiter({ name: 'google-login', ...cfg.googleLogin }),
    register: createRateLimiter({ name: 'register', ...cfg.register }),
    publicWrite: createRateLimiter({ name: 'public-write', ...cfg.publicWrite }),
    heavy: createRateLimiter({ name: 'heavy', ...cfg.heavy })
  };
}

/**
 * Honeypot: a form field humans never see or fill. Automated form-fillers do.
 * Rejection is deliberately generic so bots learn nothing.
 *
 * @param {string} [field='website']
 */
function honeypot(field = 'website') {
  return function honeypotGuard(req, res, next) {
    const value = req.body && req.body[field];
    if (typeof value === 'string' && value.trim() !== '') {
      return next(new BadRequestError('The request could not be completed.', 'REQUEST_REJECTED'));
    }
    if (req.body && typeof req.body === 'object') delete req.body[field];
    next();
  };
}

/**
 * Mounts every limiter on the routes it protects. Centralised so the policy
 * is reviewable in one place and independent of each router's internals.
 *
 * @param {import('express').Express} app
 * @param {ReturnType<typeof createRateLimiters>} limiters
 */
function applyRateLimits(app, limiters) {
  app.use('/api', limiters.api);

  app.post('/api/auth/login', limiters.loginIp, limiters.loginAccount);
  app.post('/api/auth/google', limiters.googleLogin);
  app.post('/api/auth/register', limiters.register, honeypot('website'));

  const publicWritePaths = [
    '/api/feedback',
    '/api/live-reports',
    '/api/reports',
    '/api/ride-groups',
    '/api/live-reports/:id/confirm',
    '/api/live-reports/:id/contradict',
    '/api/ride-groups/:id/join'
  ];
  app.post(publicWritePaths, limiters.publicWrite);

  app.use(['/api/plan', '/api/transit'], limiters.heavy);
}

module.exports = {
  createRateLimiter,
  createRateLimiters,
  applyRateLimits,
  honeypot,
  DEFAULT_LIMITS
};
