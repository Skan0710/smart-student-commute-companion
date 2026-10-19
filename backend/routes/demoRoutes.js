const express = require('express');
const config = require('../config');
const { resetDemoData } = require('../controllers/demoController');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { NotFoundError } = require('../errors');

/**
 * The reset wipes every community report, ride group and feedback entry.
 * It is an operator tool: disabled unless config.allowDemoReset is on
 * (off by default in production) and restricted to administrators.
 */
function requireDemoResetEnabled(req, res, next) {
  if (!config.allowDemoReset) {
    return next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl || req.url}`));
  }
  next();
}

function createDemoRoutes(io) {
  const router = express.Router();
  router.post('/demo/reset', requireDemoResetEnabled, authenticate, requireRole(['admin']), resetDemoData(io));
  return router;
}

module.exports = createDemoRoutes;
