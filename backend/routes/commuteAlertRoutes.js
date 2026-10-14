/**
 * Commute Alert & Processing Routes
 *
 * Exposes endpoints for student commute disruption alerts, preferences,
 * lifecycle management (viewing, dismissing), health status, and authorized internal processing.
 */

const express = require('express');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const {
  commuteAlertQuerySchema,
  updateCommuteAlertPreferencesSchema,
  triggerAlertProcessingSchema
} = require('../validators/commuteAlertValidators');
const commuteAlertController = require('../controllers/commuteAlertController');

function createCommuteAlertRoutes() {
  const router = express.Router();

  // Guard all commute alert routes with student authentication
  router.use('/commute/alerts', authenticate);
  router.use('/student/commute/alerts', authenticate);

  // -------------------------------------------------------------
  // Specific / Non-parameterized Alert Endpoints
  // (Mounted BEFORE /:id to prevent path collision)
  // -------------------------------------------------------------

  // 1. Notification Preferences (GET / PUT)
  router.get(
    '/commute/alerts/preferences',
    commuteAlertController.getPreferences
  );
  router.put(
    '/commute/alerts/preferences',
    validate(updateCommuteAlertPreferencesSchema, 'body'),
    commuteAlertController.updatePreferences
  );

  router.get(
    '/student/commute/alerts/preferences',
    commuteAlertController.getPreferences
  );
  router.put(
    '/student/commute/alerts/preferences',
    validate(updateCommuteAlertPreferencesSchema, 'body'),
    commuteAlertController.updatePreferences
  );

  // 2. Alert Processing & Channel Readiness Status (GET)
  router.get(
    '/commute/alerts/status',
    commuteAlertController.getAlertStatus
  );
  router.get(
    '/student/commute/alerts/status',
    commuteAlertController.getAlertStatus
  );

  // 3. Authorized Internal Background Processing Trigger (POST)
  // Protected against unauthorized student access; requires admin role
  router.post(
    '/commute/alerts/process',
    requireRole('admin'),
    validate(triggerAlertProcessingSchema, 'body'),
    commuteAlertController.triggerProcessing
  );
  router.post(
    '/student/commute/alerts/process',
    requireRole('admin'),
    validate(triggerAlertProcessingSchema, 'body'),
    commuteAlertController.triggerProcessing
  );

  // -------------------------------------------------------------
  // Alert Collection & Details Endpoints
  // -------------------------------------------------------------

  // 4. List Active Alerts for Authenticated Student (GET)
  router.get(
    '/commute/alerts',
    validate(commuteAlertQuerySchema, 'query'),
    commuteAlertController.listActiveAlerts
  );
  router.get(
    '/student/commute/alerts',
    validate(commuteAlertQuerySchema, 'query'),
    commuteAlertController.listActiveAlerts
  );

  // 5. View Alert Details (GET)
  router.get(
    '/commute/alerts/:id',
    commuteAlertController.getAlertDetails
  );
  router.get(
    '/student/commute/alerts/:id',
    commuteAlertController.getAlertDetails
  );

  // 6. Dismiss Alert (POST)
  router.post(
    '/commute/alerts/:id/dismiss',
    commuteAlertController.dismissAlert
  );
  router.post(
    '/student/commute/alerts/:id/dismiss',
    commuteAlertController.dismissAlert
  );

  return router;
}

module.exports = createCommuteAlertRoutes;
