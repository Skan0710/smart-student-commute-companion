/**
 * CommuteAlertLifecycleService
 *
 * Reliable alert lifecycle and deduplication management service.
 * Supports creating new alerts, identifying duplicates, updating on material changes,
 * marking expirations, resolving inactive disruptions, and user dismissals.
 *
 * Invariants & Requirements:
 * 1. Idempotency: Repeated processing of the same event must not create duplicate active alerts.
 * 2. Material Updates: Meaningful changes in severity or estimated impact update existing alerts.
 * 3. Timely Expiration: Expired alerts must never remain active.
 * 4. Stable Resolution: Resolved alerts must not be repeatedly reopened without a meaningful state change.
 * 5. Concurrency Safety: Atomic transaction isolation prevents duplicate concurrent creation.
 * 6. Authorization & Data Isolation: Enforces strict student ownership and access controls.
 * 7. History Preservation: Preserves audit and alert history; never deletes unrelated notifications or records.
 */

const { getConnection } = require('../db/connection');
const { commuteDisruptionAlertRepository } = require('../repositories/CommuteDisruptionAlertRepository');
const { disruptionRepository } = require('../repositories/DisruptionRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { commuteAlertGenerationService } = require('./commuteAlertGenerationService');
const { CommuteDisruptionAlert } = require('../models/CommuteDisruptionAlert');
const {
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError
} = require('../errors');

class CommuteAlertLifecycleService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.alertRepository]
   * @param {object} [options.disruptionRepository]
   * @param {object} [options.notificationRepository]
   * @param {object} [options.alertGenerationService]
   * @param {object} [options.dbInstance]
   */
  constructor(options = {}) {
    this.alertRepo = options.alertRepository || commuteDisruptionAlertRepository;
    this.disruptionRepo = options.disruptionRepository || disruptionRepository;
    this.notificationRepo = options.notificationRepository || notificationRepository;
    this.generationService = options.alertGenerationService || commuteAlertGenerationService;
    this.db = options.dbInstance;
  }

  get database() {
    return this.db || this.alertRepo.database || getConnection();
  }

  /**
   * Computes a stable deduplication fingerprint based on disruption, affected route/service,
   * alert category, and recipient.
   *
   * @param {object} params
   * @param {string} [params.userId]
   * @param {string} [params.disruptionId]
   * @param {string} [params.routeOrService]
   * @param {string} [params.category]
   * @returns {string}
   */
  computeFingerprint({ userId, disruptionId, routeOrService, category }) {
    const sanitize = (val, fallback) => {
      if (!val || typeof val !== 'string') return fallback;
      return val.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_');
    };

    const recipient = userId ? sanitize(userId, 'user') : 'broadcast';
    const disr = sanitize(disruptionId, 'general_disruption');
    const route = sanitize(routeOrService, 'corridor');
    const cat = sanitize(category || 'commute_disruption', 'commute_disruption');

    return `alert-fp:${recipient}:${disr}:${route}:${cat}`;
  }

  /**
   * Determines if candidate update represents a meaningful/material change in severity or impact.
   *
   * @param {CommuteDisruptionAlert} existingAlert
   * @param {CommuteDisruptionAlert|object} candidate
   * @returns {boolean}
   */
  isMaterialChange(existingAlert, candidate) {
    if (!existingAlert || !candidate) return false;

    // 1. Severity change (e.g. moderate -> severe or critical)
    const existingSeverity = String(existingAlert.severity || '').toLowerCase();
    const candidateSeverity = String(candidate.severity || '').toLowerCase();
    if (existingSeverity && candidateSeverity && existingSeverity !== candidateSeverity) {
      return true;
    }

    // 2. Disruption Type change (e.g. delay -> service_suspension or cancellation)
    const existingType = String(existingAlert.disruptionType || '').toLowerCase();
    const candidateType = String(candidate.disruptionType || '').toLowerCase();
    if (existingType && candidateType && existingType !== candidateType) {
      return true;
    }

    // 3. Estimated Delay impact change (threshold >= 5 minutes)
    const existingDelay = Number(existingAlert.recommendedAction?.suggestedDepartureAdjustmentMinutes || 0);
    const candidateDelay = Number(
      candidate.recommendedAction?.suggestedDepartureAdjustmentMinutes
      || candidate.estimatedDelayMinutes
      || 0
    );

    if (Math.abs(existingDelay - candidateDelay) >= 5) {
      return true;
    }

    // 4. Action recommendation change (e.g. MONITOR_STATUS -> SWITCH_MODE or DEPART_EARLIER)
    const existingAction = existingAlert.recommendedAction?.actionType;
    const candidateAction = candidate.recommendedAction?.actionType;
    if (existingAction && candidateAction && existingAction !== candidateAction) {
      return true;
    }

    // 5. Alternative Route availability change (e.g. alternative found or lost)
    const existingHasAlt = Boolean(existingAlert.alternativeRoute?.routeId);
    const candidateHasAlt = Boolean(candidate.alternativeRoute?.routeId);
    if (existingHasAlt !== candidateHasAlt) {
      return true;
    }

    // 6. Material extension of validity (>= 30 minutes beyond current validUntil)
    if (candidate.validUntil && candidate.validUntil - existingAlert.validUntil >= 30 * 60 * 1000) {
      return true;
    }

    return false;
  }

  /**
   * Core processing method for disruption alerts:
   * 1. Creates new alerts when no active alert exists.
   * 2. Identifies and ignores duplicates for unchanged events.
   * 3. Updates active alerts on material changes in severity or estimated impact.
   * 4. Does not reopen resolved alerts without a meaningful state change.
   * 5. Executes atomically inside a database transaction for concurrency safety.
   *
   * @param {CommuteDisruptionAlert|object} disruptionOrAlert
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {object} { action: string, isDuplicate: boolean, isUpdated: boolean, alert: CommuteDisruptionAlert|null, reason?: string }
   */
  processDisruptionAlert(disruptionOrAlert, context = {}, options = {}) {
    const now = options.currentTime || Date.now();

    // Execute atomic transaction for safe concurrency
    const executeTx = this.database.transaction(() => {
      // 1. Mark any overdue alerts as expired so they do not remain active
      this.alertRepo.markExpiredAlerts(now);

      // 2. Resolve candidate CommuteDisruptionAlert instance
      let candidateAlert = null;

      if (disruptionOrAlert instanceof CommuteDisruptionAlert) {
        candidateAlert = disruptionOrAlert;
      } else if (disruptionOrAlert && disruptionOrAlert.scope && disruptionOrAlert.disruptionType) {
        candidateAlert = new CommuteDisruptionAlert(disruptionOrAlert);
      } else {
        // Generate alert via CommuteAlertGenerationService
        const genResult = this.generationService.generateAlertForDisruption(
          disruptionOrAlert,
          context,
          { ...options, forceRegenerate: true }
        );

        if (!genResult.isGenerated || !genResult.alert) {
          return {
            action: 'SKIPPED',
            isDuplicate: false,
            isUpdated: false,
            alert: null,
            reason: genResult.reason || 'Disruption is not relevant or justified for an alert'
          };
        }
        candidateAlert = genResult.alert;
      }

      // 3. Reject disruptions that are already expired
      if (candidateAlert.validUntil <= now) {
        return {
          action: 'EXPIRED_IGNORED',
          isDuplicate: false,
          isUpdated: false,
          alert: null,
          reason: 'Disruption validUntil has already elapsed'
        };
      }

      // 4. Compute stable fingerprint
      const fingerprint = this.computeFingerprint({
        userId: candidateAlert.userId,
        disruptionId: candidateAlert.disruptionId,
        routeOrService: candidateAlert.scope?.serviceId
          || candidateAlert.scope?.lineOrRoute
          || candidateAlert.affectedContext?.routeId
          || candidateAlert.scope?.area,
        category: options.category || 'commute_disruption'
      });

      candidateAlert.fingerprint = fingerprint;

      // 5. Check for existing alert with this fingerprint
      const existingAlert = this.alertRepo.findLatestByFingerprint(fingerprint);

      // CASE A: Brand new alert
      if (!existingAlert) {
        const saved = this.alertRepo.save(candidateAlert, fingerprint);
        return {
          action: 'CREATED',
          isDuplicate: false,
          isUpdated: false,
          alert: saved
        };
      }

      // CASE B: Existing alert is ACTIVE
      if (existingAlert.status === 'active') {
        const hasMaterialChange = this.isMaterialChange(existingAlert, candidateAlert);

        if (!hasMaterialChange) {
          // Requirement 1: Repeated processing of the same event must not create duplicate active alerts.
          return {
            action: 'DUPLICATE_IGNORED',
            isDuplicate: true,
            isUpdated: false,
            alert: existingAlert,
            reason: 'Identical active alert already exists with no material change'
          };
        }

        // Requirement 2: A meaningful change in severity or estimated impact may update an existing alert.
        const updatedAlert = new CommuteDisruptionAlert({
          ...existingAlert.toJSON(),
          severity: candidateAlert.severity,
          title: candidateAlert.title,
          message: candidateAlert.message,
          relevanceReason: candidateAlert.relevanceReason,
          recommendedAction: candidateAlert.recommendedAction,
          alternativeRoute: candidateAlert.alternativeRoute,
          validUntil: Math.max(existingAlert.validUntil, candidateAlert.validUntil),
          provenance: candidateAlert.provenance,
          fingerprint,
          updatedAt: now
        });

        const saved = this.alertRepo.save(updatedAlert, fingerprint);
        return {
          action: 'UPDATED',
          isDuplicate: false,
          isUpdated: true,
          alert: saved,
          previousSeverity: existingAlert.severity,
          newSeverity: saved.severity
        };
      }

      // CASE C: Existing alert is RESOLVED
      if (existingAlert.status === 'resolved') {
        // Requirement 4: Resolved alerts must not be repeatedly reopened without a meaningful state change.
        const hasMaterialChange = this.isMaterialChange(existingAlert, candidateAlert);

        if (!hasMaterialChange) {
          return {
            action: 'RESOLVED_UNCHANGED',
            isDuplicate: true,
            isUpdated: false,
            alert: existingAlert,
            reason: 'Disruption was previously resolved; no meaningful state change to reopen'
          };
        }

        // Reopening because of meaningful change
        const reopenedAlert = new CommuteDisruptionAlert({
          ...existingAlert.toJSON(),
          status: 'active',
          severity: candidateAlert.severity,
          title: candidateAlert.title,
          message: candidateAlert.message,
          relevanceReason: candidateAlert.relevanceReason,
          recommendedAction: candidateAlert.recommendedAction,
          alternativeRoute: candidateAlert.alternativeRoute,
          validFrom: candidateAlert.validFrom || now,
          validUntil: candidateAlert.validUntil,
          fingerprint,
          resolvedAt: null,
          updatedAt: now
        });

        const saved = this.alertRepo.save(reopenedAlert, fingerprint);
        return {
          action: 'REOPENED',
          isDuplicate: false,
          isUpdated: true,
          alert: saved
        };
      }

      // CASE D: Existing alert was DISMISSED by user
      if (existingAlert.status === 'dismissed') {
        const hasMaterialChange = this.isMaterialChange(existingAlert, candidateAlert);

        if (!hasMaterialChange) {
          return {
            action: 'DISMISSED_UNCHANGED',
            isDuplicate: true,
            isUpdated: false,
            alert: existingAlert,
            reason: 'Alert was dismissed by user and has no material change'
          };
        }

        // Significant escalation on dismissed alert (e.g. moderate -> critical) reactivates it
        const reactivated = new CommuteDisruptionAlert({
          ...existingAlert.toJSON(),
          status: 'active',
          severity: candidateAlert.severity,
          title: candidateAlert.title,
          message: candidateAlert.message,
          relevanceReason: candidateAlert.relevanceReason,
          recommendedAction: candidateAlert.recommendedAction,
          alternativeRoute: candidateAlert.alternativeRoute,
          validUntil: candidateAlert.validUntil,
          fingerprint,
          dismissedAt: null,
          updatedAt: now
        });

        const saved = this.alertRepo.save(reactivated, fingerprint);
        return {
          action: 'REACTIVATED',
          isDuplicate: false,
          isUpdated: true,
          alert: saved
        };
      }

      // CASE E: Existing alert is EXPIRED
      if (existingAlert.status === 'expired') {
        // If current candidate is an active event with valid validity window, start a fresh alert cycle
        const freshAlert = new CommuteDisruptionAlert({
          ...candidateAlert.toJSON(),
          status: 'active',
          fingerprint,
          createdAt: now,
          updatedAt: now
        });

        const saved = this.alertRepo.save(freshAlert, fingerprint);
        return {
          action: 'CREATED',
          isDuplicate: false,
          isUpdated: false,
          alert: saved
        };
      }

      return {
        action: 'IGNORED',
        isDuplicate: false,
        isUpdated: false,
        alert: existingAlert
      };
    });

    return executeTx();
  }

  /**
   * Processes a batch of disruptions for a student commute context.
   *
   * @param {Array<object>} disruptions
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {object} Summary of batch processing
   */
  processDisruptionsBatch(disruptions, context = {}, options = {}) {
    if (!Array.isArray(disruptions) || disruptions.length === 0) {
      return { total: 0, created: 0, updated: 0, duplicates: 0, skipped: 0, alerts: [] };
    }

    const results = {
      total: disruptions.length,
      created: 0,
      updated: 0,
      duplicates: 0,
      skipped: 0,
      alerts: []
    };

    for (const disruption of disruptions) {
      const outcome = this.processDisruptionAlert(disruption, context, options);
      if (outcome.action === 'CREATED' || outcome.action === 'REOPENED' || outcome.action === 'REACTIVATED') {
        results.created++;
        if (outcome.alert) results.alerts.push(outcome.alert);
      } else if (outcome.action === 'UPDATED') {
        results.updated++;
        if (outcome.alert) results.alerts.push(outcome.alert);
      } else if (outcome.isDuplicate) {
        results.duplicates++;
      } else {
        results.skipped++;
      }
    }

    return results;
  }

  /**
   * Dismisses an alert by an authorized student.
   * Reuses existing product conventions and authorization safeguards.
   * Does NOT delete unrelated notifications or history.
   *
   * @param {string} alertId
   * @param {object} requestingUser
   * @param {number} [timestamp=Date.now()]
   * @returns {CommuteDisruptionAlert}
   */
  dismissAlert(alertId, requestingUser, timestamp = Date.now()) {
    if (!alertId || typeof alertId !== 'string') {
      throw new BadRequestError('Alert ID is required to dismiss an alert');
    }

    const alert = this.alertRepo.findById(alertId);
    if (!alert) {
      throw new NotFoundError(`Commute disruption alert with ID '${alertId}' not found`);
    }

    // Enforce authorization
    alert.assertAccess(requestingUser);

    const executeTx = this.database.transaction(() => {
      alert.dismiss(requestingUser, timestamp);
      const updated = this.alertRepo.updateStatus(alertId, 'dismissed', timestamp, {
        dismissedAt: timestamp
      });

      // Synchronize associated notification if present, without deleting unrelated notifications
      try {
        const notif = this.notificationRepo.findById(`notif-${alertId}`);
        if (notif && notif.user_id === requestingUser.id) {
          this.notificationRepo.markAsRead(notif.id, timestamp);
        }
      } catch (_) {
        // Notification sync failure is non-fatal
      }

      return updated;
    });

    return executeTx();
  }

  /**
   * Resolves a single alert.
   *
   * @param {string} alertId
   * @param {object} [options={}]
   * @returns {CommuteDisruptionAlert}
   */
  resolveAlert(alertId, options = {}) {
    if (!alertId || typeof alertId !== 'string') {
      throw new BadRequestError('Alert ID is required to resolve an alert');
    }

    const alert = this.alertRepo.findById(alertId);
    if (!alert) {
      throw new NotFoundError(`Commute disruption alert with ID '${alertId}' not found`);
    }

    const timestamp = options.timestamp || Date.now();
    return this.alertRepo.updateStatus(alertId, 'resolved', timestamp, {
      resolvedAt: timestamp
    });
  }

  /**
   * Resolves all active alerts tied to a disruption ID when that disruption is cleared.
   *
   * @param {string} disruptionId
   * @param {number} [timestamp=Date.now()]
   * @returns {{ resolvedCount: number }}
   */
  resolveAlertsForDisruption(disruptionId, timestamp = Date.now()) {
    if (!disruptionId || typeof disruptionId !== 'string') {
      return { resolvedCount: 0 };
    }

    const count = this.alertRepo.resolveByDisruptionId(disruptionId, timestamp);
    return { resolvedCount: count };
  }

  /**
   * Marks any active alerts whose validUntil has elapsed as 'expired'.
   * Ensures expired alerts do not remain active.
   *
   * @param {number} [currentTime=Date.now()]
   * @returns {{ expiredCount: number }}
   */
  markExpiredAlerts(currentTime = Date.now()) {
    const count = this.alertRepo.markExpiredAlerts(currentTime);
    return { expiredCount: count };
  }

  /**
   * Retrieves currently active alerts for an authenticated student user.
   * Ensures expired alerts are automatically marked and not returned.
   *
   * @param {object} requestingUser
   * @param {object} [options={}]
   * @returns {CommuteDisruptionAlert[]}
   */
  getActiveAlerts(requestingUser, options = {}) {
    if (!requestingUser) {
      throw new UnauthorizedError('Authentication required to retrieve active commute disruption alerts');
    }

    const now = options.currentTime || Date.now();

    // Expire overdue alerts first (Requirement 3: Expired alerts must not remain active)
    this.alertRepo.markExpiredAlerts(now);

    const alerts = this.alertRepo.findActive({
      userId: requestingUser.id,
      includeBroadcast: options.includeBroadcast !== false,
      mode: options.mode,
      area: options.area,
      disruptionType: options.disruptionType,
      severity: options.severity,
      currentTime: now,
      limit: options.limit || 50
    });

    // Enforce authorization filter
    return alerts.filter(alert => {
      try {
        alert.assertAccess(requestingUser);
        return true;
      } catch (_) {
        return false;
      }
    });
  }

  /**
   * Retrieves a single alert by ID with authorization safeguards.
   *
   * @param {string} alertId
   * @param {object} requestingUser
   * @returns {CommuteDisruptionAlert}
   */
  getAlertById(alertId, requestingUser) {
    if (!alertId || typeof alertId !== 'string') {
      throw new BadRequestError('Alert ID is required');
    }

    const alert = this.alertRepo.findById(alertId);
    if (!alert) {
      throw new NotFoundError(`Commute disruption alert with ID '${alertId}' not found`);
    }

    alert.assertAccess(requestingUser);
    return alert;
  }

  /**
   * Retrieves alert history for an authenticated student.
   * Preserves historical alerts (dismissed, resolved, expired) without deleting them.
   *
   * @param {string} userId
   * @param {object} requestingUser
   * @param {object} [options={}]
   * @returns {CommuteDisruptionAlert[]}
   */
  getAlertHistory(userId, requestingUser, options = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestError('User ID is required');
    }

    if (!requestingUser) {
      throw new UnauthorizedError('Authentication required to view alert history');
    }

    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      throw new ForbiddenError('Access forbidden: you do not have permission to view alert history for another student');
    }

    return this.alertRepo.findByUserId(userId, options);
  }
}

const commuteAlertLifecycleService = new CommuteAlertLifecycleService();

module.exports = {
  CommuteAlertLifecycleService,
  commuteAlertLifecycleService
};
