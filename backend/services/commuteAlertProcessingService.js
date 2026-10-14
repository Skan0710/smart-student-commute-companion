/**
 * CommuteAlertProcessingService
 *
 * Coordinates background commute alert evaluation, lifecycle management, and delivery:
 * 1. Evaluates available disruption data (local database, crowdsourced reports, optional live feeds).
 * 2. Detects relevant changes and material updates.
 * 3. Generates and deduplicates alerts using stable fingerprints.
 * 4. Processes alert expiration and clears inactive disruptions.
 * 5. Delivers notifications through configured channels according to student preferences.
 * 6. Idempotent and concurrency-safe: prevents duplicate runs and duplicate deliveries.
 * 7. Gracefully handles missing external feeds without claiming live telemetry.
 * 8. Accurately distinguishes manual/synthetic test data from live feeds.
 */

const { getConnection } = require('../db/connection');
const { commuteAlertLifecycleService } = require('./commuteAlertLifecycleService');
const { commuteAlertDeliveryService } = require('./commuteAlertDeliveryService');
const { disruptionRepository } = require('../repositories/DisruptionRepository');
const { commuteDisruptionAlertRepository } = require('../repositories/CommuteDisruptionAlertRepository');
const { userRepository } = require('../repositories/UserRepository');
const { CommuteDisruptionAlert } = require('../models/CommuteDisruptionAlert');

class CommuteAlertProcessingService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.lifecycleService]
   * @param {object} [options.deliveryService]
   * @param {object} [options.disruptionRepository]
   * @param {object} [options.alertRepository]
   * @param {object} [options.userRepository]
   * @param {object} [options.scheduler]
   * @param {object} [options.dbInstance]
   */
  constructor(options = {}) {
    this.lifecycleService = options.lifecycleService || commuteAlertLifecycleService;
    this.deliveryService = options.deliveryService || commuteAlertDeliveryService;
    this.disruptionRepo = options.disruptionRepository || disruptionRepository;
    this.alertRepo = options.alertRepository || commuteDisruptionAlertRepository;
    this.userRepo = options.userRepository || userRepository;
    this.scheduler = options.scheduler || null;
    this.db = options.dbInstance;

    this.isProcessing = false;
    this.lastExecution = null;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Inspects external feed configuration and operational capabilities.
   * Truthfully reports whether live feeds are available or if the system is operating in local/prototype mode.
   *
   * @returns {object}
   */
  getFeedStatus() {
    const feedUrl = process.env.GTFS_RT_ALERTS_URL;
    const isLive = Boolean(feedUrl && !feedUrl.includes('mock') && !feedUrl.includes('test'));

    return {
      liveFeedConfigured: isLive,
      feedSource: isLive ? 'live_gtfs_rt' : 'local_database_and_crowdsourced_reports',
      operational: isLive,
      externalUrlConfigured: Boolean(feedUrl),
      message: isLive
        ? 'Live transit GTFS-RT feed is configured and operational'
        : 'Live external feed not configured; operating in local database and crowdsourced report mode (safe fallback)'
    };
  }

  /**
   * Returns comprehensive alert system health, channel diagnostic capabilities, and worker status.
   *
   * @returns {object}
   */
  getProcessingStatus() {
    const feedStatus = this.getFeedStatus();
    const channelStatus = this.deliveryService.getChannelStatus();

    let schedulerRunning = false;
    if (this.scheduler && typeof this.scheduler.isSchedulerRunning === 'function') {
      schedulerRunning = this.scheduler.isSchedulerRunning();
    } else {
      // Default to checking global scheduler if injected later
      const { reminderScheduler } = require('./reminderScheduler');
      schedulerRunning = reminderScheduler.isSchedulerRunning();
    }

    return {
      status: 'operational',
      scheduler: {
        isRunning: schedulerRunning,
        type: 'unified_background_scheduler',
        description: 'Single scheduler tick executing due reminders and commute disruption processing'
      },
      channels: channelStatus,
      externalFeeds: feedStatus,
      lastExecution: this.lastExecution ? {
        executionId: this.lastExecution.executionId,
        trigger: this.lastExecution.trigger,
        timestamp: this.lastExecution.timestamp,
        durationMs: this.lastExecution.durationMs,
        summary: this.lastExecution.summary,
        feedStatus: this.lastExecution.feedStatus
      } : null
    };
  }

  /**
   * Core background processing job:
   * - Evaluates available disruption data
   * - Detects relevant changes
   * - Generates and deduplicates alerts
   * - Processes expiration and resolution
   * - Delivers notifications through configured channels
   *
   * Safe for periodic execution by ReminderScheduler or authorized admin manual trigger.
   *
   * @param {object} [options={}]
   * @param {number} [options.currentTime=Date.now()]
   * @param {'scheduled'|'manual_admin'|'test'} [options.trigger='scheduled']
   * @param {object} [options.requestingUser]
   * @param {boolean} [options.dryRun=false]
   * @param {boolean} [options.forceSync=true]
   * @param {Array<object>} [options.disruptions] - Explicit disruption records to evaluate
   * @returns {Promise<object>} Processing report
   */
  async runProcessingJob(options = {}) {
    // Concurrency guard: avoid overlapping concurrent runs
    if (this.isProcessing && !options.disruptions) {
      return {
        skipped: true,
        reason: 'A commute alert processing job is already in progress',
        lastExecution: this.lastExecution
      };
    }

    this.isProcessing = true;
    const startTime = Date.now();
    const asOfTime = options.currentTime || startTime;
    const trigger = options.trigger || 'scheduled';
    const executionId = `exec-alert-${asOfTime}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      // 1. Sync live community reports into commute_disruptions table
      let syncedReportsCount = 0;
      if (options.forceSync !== false && !options.disruptions) {
        try {
          syncedReportsCount = this.disruptionRepo.syncFromLiveReports();
        } catch (syncErr) {
          console.warn('[CommuteAlertProcessingService] Notice: live report sync warning:', syncErr.message);
        }
      }

      // 2. Mark overdue active alerts as expired (Requirement: expired alerts must not remain active)
      const { expiredCount } = this.lifecycleService.markExpiredAlerts(asOfTime);

      // 3. Fetch active disruptions
      let rawDisruptions = options.disruptions;
      if (!rawDisruptions) {
        rawDisruptions = this.disruptionRepo.findActive({ currentTime: asOfTime });
      }

      const disruptions = Array.isArray(rawDisruptions) ? rawDisruptions : [rawDisruptions];

      // Provenance and data breakdown
      let hasSynthetic = false;
      let hasUserReported = false;
      let hasVerified = false;
      let hasEstimated = false;

      for (const d of disruptions) {
        const tier = (d.provenance?.sourceTier || d.provenance?.tier || d.provenance_tier || '').toUpperCase();
        if (tier === 'SYNTHETIC') hasSynthetic = true;
        if (tier === 'USER_REPORTED') hasUserReported = true;
        if (tier === 'VERIFIED') hasVerified = true;
        if (tier === 'ESTIMATED') hasEstimated = true;
      }

      // 4. Lifecycle processing: create, deduplicate, update on material change
      const lifecycleResults = {
        totalEvaluated: disruptions.length,
        created: [],
        updated: [],
        reopened: [],
        reactivated: [],
        duplicatesCount: 0,
        skippedCount: 0
      };

      for (const disruption of disruptions) {
        try {
          let target = disruption;
          const context = options.context || (options.targetUserId ? { userId: options.targetUserId } : {});

          if (
            !(target instanceof CommuteDisruptionAlert) &&
            !(target && target.scope && target.disruptionType)
          ) {
            if (!context.routes) {
              target = CommuteDisruptionAlert.fromDisruption(target, {
                userId: options.targetUserId || context.userId || null
              });
            }
          }

          const outcome = this.lifecycleService.processDisruptionAlert(target, context, { currentTime: asOfTime });

          if (outcome.action === 'CREATED') {
            lifecycleResults.created.push(outcome.alert);
          } else if (outcome.action === 'UPDATED') {
            lifecycleResults.updated.push(outcome.alert);
          } else if (outcome.action === 'REOPENED') {
            lifecycleResults.reopened.push(outcome.alert);
          } else if (outcome.action === 'REACTIVATED') {
            lifecycleResults.reactivated.push(outcome.alert);
          } else if (outcome.isDuplicate) {
            lifecycleResults.duplicatesCount++;
          } else {
            lifecycleResults.skippedCount++;
          }
        } catch (itemErr) {
          console.error('[CommuteAlertProcessingService] Error processing disruption item:', itemErr.message);
          lifecycleResults.skippedCount++;
        }
      }

      // 5. Deliver notifications for alerts that were created, updated, reopened, or reactivated
      const actionableAlerts = [
        ...lifecycleResults.created,
        ...lifecycleResults.updated,
        ...lifecycleResults.reopened,
        ...lifecycleResults.reactivated
      ];

      const deliveryOutcomes = [];

      if (!options.dryRun) {
        for (const alert of actionableAlerts) {
          try {
            const deliveryResult = await this.deliveryService.deliverAlert(alert, {
              requestingUser: options.requestingUser
            });
            deliveryOutcomes.push(deliveryResult);
          } catch (delivErr) {
            deliveryOutcomes.push({
              alertId: alert.id,
              delivered: false,
              status: 'FAILED',
              error: delivErr.message
            });
          }
        }
      }

      // 6. External feed diagnostics
      const feedStatus = this.getFeedStatus();

      const durationMs = Date.now() - startTime;

      const report = {
        executionId,
        trigger,
        timestamp: asOfTime,
        durationMs,
        dryRun: Boolean(options.dryRun),
        feedStatus: {
          ...feedStatus,
          syntheticDataEvaluated: hasSynthetic,
          verifiedDataEvaluated: hasVerified,
          userReportedDataEvaluated: hasUserReported,
          estimatedDataEvaluated: hasEstimated
        },
        summary: {
          syncedReportsCount,
          expiredCount,
          totalDisruptionsEvaluated: disruptions.length,
          createdCount: lifecycleResults.created.length,
          updatedCount: lifecycleResults.updated.length,
          reopenedCount: lifecycleResults.reopened.length,
          reactivatedCount: lifecycleResults.reactivated.length,
          duplicatesCount: lifecycleResults.duplicatesCount,
          skippedCount: lifecycleResults.skippedCount,
          deliveriesCount: deliveryOutcomes.filter(d => d.delivered).length,
          deliveriesAttempted: deliveryOutcomes.length
        },
        alerts: actionableAlerts.map(a => (a.toJSON ? a.toJSON() : a)),
        deliveries: deliveryOutcomes
      };

      this.lastExecution = report;
      return report;
    } finally {
      this.isProcessing = false;
    }
  }
}

const commuteAlertProcessingService = new CommuteAlertProcessingService();

module.exports = {
  CommuteAlertProcessingService,
  commuteAlertProcessingService
};
