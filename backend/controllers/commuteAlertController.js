/**
 * CommuteAlertController
 *
 * Exposes API endpoints for student commute disruption alerts, preferences,
 * alert lifecycle operations (dismissal, viewing), health diagnostics,
 * and authorized internal background processing triggers.
 */

const { commuteAlertLifecycleService } = require('../services/commuteAlertLifecycleService');
const { commuteAlertDeliveryService } = require('../services/commuteAlertDeliveryService');
const { commuteAlertProcessingService } = require('../services/commuteAlertProcessingService');
const { success } = require('../utils/apiResponse');

/**
 * Lists the authenticated student's active commute alerts.
 * Never exposes another student's alerts.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function listActiveAlerts(req, res, next) {
  try {
    const alerts = commuteAlertLifecycleService.getActiveAlerts(req.user, req.query);
    return success(res, {
      alerts: alerts.map(a => (a.toJSON ? a.toJSON() : a)),
      count: alerts.length
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves details for a specific commute alert by ID.
 * Enforces strict user authorization.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getAlertDetails(req, res, next) {
  try {
    const alert = commuteAlertLifecycleService.getAlertById(req.params.id, req.user);
    return success(res, {
      alert: alert.toJSON ? alert.toJSON() : alert
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Dismisses a commute disruption alert by the authorized student.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function dismissAlert(req, res, next) {
  try {
    const dismissed = commuteAlertLifecycleService.dismissAlert(req.params.id, req.user);
    return success(res, {
      message: 'Commute disruption alert dismissed successfully',
      alert: dismissed.toJSON ? dismissed.toJSON() : dismissed
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the authenticated student's commute alert notification preferences.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getPreferences(req, res, next) {
  try {
    const preferences = commuteAlertDeliveryService.getPreferences(req.user.id, req.user);
    return success(res, {
      preferences: preferences.toJSON ? preferences.toJSON() : preferences
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates the authenticated student's commute alert notification preferences.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function updatePreferences(req, res, next) {
  try {
    const updated = commuteAlertDeliveryService.updatePreferences(req.user.id, req.body, req.user);
    return success(res, {
      message: 'Alert notification preferences updated successfully',
      preferences: updated.toJSON ? updated.toJSON() : updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns overall alert system status, delivery channel readiness, and external feed diagnostics.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getAlertStatus(req, res, next) {
  try {
    const status = commuteAlertProcessingService.getProcessingStatus();
    return success(res, status);
  } catch (err) {
    next(err);
  }
}

/**
 * Triggers authorized internal commute disruption processing.
 * Protected by admin authorization guard.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function triggerProcessing(req, res, next) {
  try {
    const report = await commuteAlertProcessingService.runProcessingJob({
      trigger: 'manual_admin',
      requestingUser: req.user,
      ...req.body
    });

    return success(res, {
      message: 'Commute disruption alert processing completed successfully',
      report
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listActiveAlerts,
  getAlertDetails,
  dismissAlert,
  getPreferences,
  updatePreferences,
  getAlertStatus,
  triggerProcessing
};
