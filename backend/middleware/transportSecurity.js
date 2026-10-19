/**
 * Transport & response-header security for the API.
 *
 * The API only ever serves JSON, so its Content-Security-Policy is the
 * strictest possible (`default-src 'none'`). The browser app's own policy is
 * generated at build time (frontend/vite-plugins/securityHeaders.js) because
 * the document, not the API, is what executes scripts.
 */

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const PERMISSIONS_POLICY = 'geolocation=(), camera=(), microphone=(), payment=(), usb=()';

/**
 * @param {{ enableHsts: boolean, hstsMaxAgeSeconds: number }} options
 * @returns {import('express').RequestHandler}
 */
function securityHeaders({ enableHsts = false, hstsMaxAgeSeconds = 15552000 } = {}) {
  return function applySecurityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', API_CSP);
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // Authenticated and credential responses must never sit in a shared cache.
    if (req.headers.authorization || req.path.startsWith('/api/auth')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }

    // HSTS is a one-way door for the whole domain: opt-in only, and only
    // meaningful (and only sent) over HTTPS.
    if (enableHsts && req.secure) {
      res.setHeader('Strict-Transport-Security', `max-age=${hstsMaxAgeSeconds}; includeSubDomains`);
    }

    next();
  };
}

/**
 * Redirects plain-HTTP requests to HTTPS. `req.secure` is only trustworthy
 * when Express is told how many proxies sit in front of it (TRUST_PROXY), and
 * config validation refuses FORCE_HTTPS without it, so this cannot loop.
 * Health checks stay reachable over HTTP for load balancers.
 *
 * @param {{ forceHttps: boolean }} options
 * @returns {import('express').RequestHandler}
 */
function forceHttps({ forceHttps: enabled = false } = {}) {
  return function redirectToHttps(req, res, next) {
    if (!enabled || req.secure || req.path === '/health' || req.path === '/api/health') {
      return next();
    }
    const host = req.headers.host;
    if (!host) return next();

    // Safe methods redirect; anything else must not be silently replayed.
    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.redirect(308, `https://${host}${req.originalUrl}`);
    }
    return res.status(426).json({
      success: false,
      error: 'HTTPS Required',
      message: 'This API is only available over HTTPS.',
      code: 'HTTPS_REQUIRED',
      statusCode: 426
    });
  };
}

module.exports = { securityHeaders, forceHttps, API_CSP, PERMISSIONS_POLICY };
