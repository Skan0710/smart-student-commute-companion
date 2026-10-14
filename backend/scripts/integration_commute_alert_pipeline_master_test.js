/**
 * Master Integration Test Suite: Commute Disruption Alert Delivery Pipeline
 *
 * Verifies the complete end-to-end pipeline:
 * available disruption data
 * → relevance detection
 * → route impact evaluation
 * → alert generation
 * → lifecycle management
 * → deduplication
 * → notification preference checks
 * → delivery
 * → authenticated alert API
 *
 * Covers all 20 required verification scenarios:
 * 1. No disruption
 * 2. Relevant train delay
 * 3. Irrelevant disruption
 * 4. Bus or transport service unavailable
 * 5. Multiple simultaneous disruptions
 * 6. Route becoming infeasible
 * 7. Updated disruption with materially changed impact
 * 8. Repeated processing of the same disruption
 * 9. Expired disruption
 * 10. Resolved disruption
 * 11. Disabled notifications
 * 12. Severity preferences
 * 13. Successful notification delivery
 * 14. Delivery failure and retry
 * 15. Duplicate delivery prevention
 * 16. Unauthorized access to another student's alerts
 * 17. Synthetic and user-reported disruption provenance
 * 18. Missing external feed or provider credentials
 * 19. Background job idempotency where supported
 * 20. Existing backend regression coverage
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../app');
const { signToken } = require('../utils/token');
const { getConnection } = require('../db/connection');

// Repositories
const { commuteDisruptionAlertRepository } = require('../repositories/CommuteDisruptionAlertRepository');
const { commuteAlertPreferenceRepository } = require('../repositories/CommuteAlertPreferenceRepository');
const { commuteAlertDeliveryRepository } = require('../repositories/CommuteAlertDeliveryRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { disruptionRepository } = require('../repositories/DisruptionRepository');

// Services
const { commuteDisruptionDetectionService } = require('../services/commuteDisruptionDetectionService');
const { commuteAlertGenerationService } = require('../services/commuteAlertGenerationService');
const { commuteAlertLifecycleService } = require('../services/commuteAlertLifecycleService');
const { commuteAlertDeliveryService } = require('../services/commuteAlertDeliveryService');
const { commuteAlertProcessingService } = require('../services/commuteAlertProcessingService');
const { reminderScheduler } = require('../services/reminderScheduler');

// Models
const { CommuteDisruptionAlert } = require('../models/CommuteDisruptionAlert');
const { CommuteDisruption } = require('../models/CommuteDisruption');
const { CommuteAlertPreference } = require('../models/CommuteAlertPreference');
const { DataProvenance, PROVENANCE_TIERS } = require('../models/CommuteContracts');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

/**
 * Creates realistic student commute candidate route for Mumbai Western Railway corridor.
 */
function createMockStudentRoutes() {
  const primaryRoute = {
    id: 'route-wr-local',
    name: 'Western Railway Slow Local',
    primaryMode: 'train',
    totalDurationMinutes: 38,
    estimatedArrivalTime: '08:45',
    departureTime: '08:07',
    legs: [
      {
        id: 'leg-walk-1',
        mode: 'walk',
        from: 'Borivali East',
        to: 'Borivali Station',
        durationMinutes: 7
      },
      {
        id: 'leg-train-1',
        mode: 'train',
        from: 'Borivali',
        to: 'Vile Parle',
        durationMinutes: 25,
        lineInfo: {
          lineName: 'Western Railway Slow',
          routeShortName: 'WR-SLOW'
        },
        serviceId: 'WR-SLOW'
      },
      {
        id: 'leg-walk-2',
        mode: 'walk',
        from: 'Vile Parle Station',
        to: 'D.J. Sanghvi College',
        durationMinutes: 6
      }
    ]
  };

  const alternativeRoute = {
    id: 'route-metro-alt',
    name: 'Metro Line 2A & 7 to Andheri',
    primaryMode: 'metro',
    totalDurationMinutes: 44,
    estimatedArrivalTime: '08:52',
    departureTime: '08:08',
    isFeasible: true,
    legs: [
      {
        id: 'leg-metro-1',
        mode: 'metro',
        from: 'Borivali West Metro',
        to: 'DN Nagar Metro',
        durationMinutes: 28,
        lineInfo: {
          lineName: 'Metro Line 2A',
          routeShortName: 'Line-2A'
        },
        serviceId: 'Line-2A'
      },
      {
        id: 'leg-auto-1',
        mode: 'auto',
        from: 'DN Nagar',
        to: 'D.J. Sanghvi College',
        durationMinutes: 12
      }
    ]
  };

  return { primaryRoute, alternativeRoute, routes: [primaryRoute, alternativeRoute] };
}

async function runMasterSuite() {
  console.log('========================================================================');
  console.log(' Commute Disruption Alert Delivery Pipeline — Master Verification Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const db = getConnection();

  try {
    const studentA = { id: `stud_pipe_a_${Date.now()}`, email: 'pipe_a@djsce.edu', role: 'student', full_name: 'Pipeline Student A' };
    const studentB = { id: `stud_pipe_b_${Date.now()}`, email: 'pipe_b@djsce.edu', role: 'student', full_name: 'Pipeline Student B' };
    const adminUser = { id: `admin_pipe_${Date.now()}`, email: 'pipe_admin@djsce.edu', role: 'admin', full_name: 'Pipeline Admin' };

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'dummy_hash', ?, 'DJSCE', ?, ?, ?)
    `);
    const now = Date.now();
    insertUser.run(studentA.id, studentA.email, studentA.full_name, studentA.role, now, now);
    insertUser.run(studentB.id, studentB.email, studentB.full_name, studentB.role, now, now);
    insertUser.run(adminUser.id, adminUser.email, adminUser.full_name, adminUser.role, now, now);

    const tokenA = signToken({ sub: studentA.id, email: studentA.email, role: studentA.role, full_name: studentA.full_name });
    const tokenB = signToken({ sub: studentB.id, email: studentB.email, role: studentB.role, full_name: studentB.full_name });
    const tokenAdmin = signToken({ sub: adminUser.id, email: adminUser.email, role: adminUser.role, full_name: adminUser.full_name });

    const authHeaderA = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` };
    const authHeaderB = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` };
    const authHeaderAdmin = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenAdmin}` };

    const { primaryRoute, alternativeRoute, routes } = createMockStudentRoutes();
    const studentContext = {
      userId: studentA.id,
      primaryRoute,
      alternativeRoutes: [alternativeRoute],
      routes,
      academicScheduleContext: {
        scheduledClassId: 'class-math-101',
        courseName: 'Applied Mathematics IV',
        scheduledStartTime: now + 45 * 60 * 1000, // Class in 45 mins
        campusDestination: 'D.J. Sanghvi College'
      }
    };

    // ------------------------------------------------------------------------
    // SCENARIO 1: No Disruption
    // ------------------------------------------------------------------------
    await test('1. No disruption: pipeline produces clean evaluation without alerts or notifications', async () => {
      const detection = commuteDisruptionDetectionService.detectRelevantDisruptions({
        routes,
        primaryRoute,
        disruptions: []
      });

      assert.strictEqual(detection.hasRelevantDisruptions, false);
      assert.strictEqual(detection.relevantCount, 0);
      assert.strictEqual(detection.generatedAlerts.length, 0);

      const gen = commuteAlertGenerationService.generateAlertForDisruption(null, studentContext);
      assert.strictEqual(gen.isGenerated, false);

      const jobReport = await commuteAlertProcessingService.runProcessingJob({
        trigger: 'test',
        disruptions: [],
        dryRun: false
      });
      assert.strictEqual(jobReport.summary.totalDisruptionsEvaluated, 0);
      assert.strictEqual(jobReport.summary.createdCount, 0);
      assert.strictEqual(jobReport.summary.deliveriesCount, 0);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 2: Relevant Train Delay
    // ------------------------------------------------------------------------
    await test('2. Relevant train delay: detected on corridor, generated with guidance, and delivered', async () => {
      const trainDelay = new CommuteDisruption({
        id: `disr-train-delay-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Andheri - Vile Parle',
        severity: 'severe',
        description: 'Signal failure between Andheri and Vile Parle causing ~20 min delays on Slow line',
        startTime: now - 10 * 60 * 1000,
        endTime: now + 2 * 3600000,
        status: 'active',
        estimatedDelayMinutes: 20,
        provenance: DataProvenance.verified('Western Railway Bulletin', 'Live signal advisory').toJSON()
      });

      // Relevance Detection
      const detection = commuteDisruptionDetectionService.detectRelevantDisruptions({
        routes,
        primaryRoute,
        disruptions: [trainDelay]
      });

      assert.strictEqual(detection.hasRelevantDisruptions, true);
      assert.strictEqual(detection.relevantCount, 1);
      assert.strictEqual(detection.impactSummary.primaryRouteImpacted, true);
      assert.strictEqual(detection.impactSummary.maxAddedDelayMinutes, 20);

      // Alert Generation
      const gen = commuteAlertGenerationService.generateAlertForDisruption(trainDelay, studentContext);
      assert.strictEqual(gen.isGenerated, true);
      assert.ok(gen.alert);
      assert.strictEqual(gen.alert.severity, 'severe');
      assert.ok(gen.alert.title.includes('WR-SLOW') || gen.alert.title.includes('TRAIN'));
      assert.ok(gen.alert.message.includes('reported delayed') && gen.alert.message.includes('20 minutes'));

      // Full Processing and Delivery
      const processResult = await commuteAlertProcessingService.runProcessingJob({
        trigger: 'test',
        targetUserId: studentA.id,
        context: studentContext,
        disruptions: [trainDelay],
        dryRun: false
      });

      assert.strictEqual(processResult.summary.createdCount, 1);
      assert.strictEqual(processResult.summary.deliveriesCount, 1);

      // Verify delivered in-app notification exists in database
      const notifs = notificationRepository.findByUserId(studentA.id);
      const matchedNotif = notifs.find(n => n.title.includes('WR-SLOW') || n.title.includes('TRAIN'));
      assert.ok(matchedNotif, 'Delivered in-app notification must exist in database');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 3: Irrelevant Disruption
    // ------------------------------------------------------------------------
    await test('3. Irrelevant disruption: ignores distant corridor without generating alert for student', async () => {
      const harborDisruption = new CommuteDisruption({
        id: `disr-harbor-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'HARBOR-LINE',
        affectedArea: 'Kurla - Vashi',
        severity: 'severe',
        description: 'Track maintenance on Harbor Line between Kurla and Vashi',
        startTime: now - 5 * 60 * 1000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 25,
        provenance: DataProvenance.verified('Central Railway Harbor Bulletin').toJSON()
      });

      const detection = commuteDisruptionDetectionService.detectRelevantDisruptions({
        routes,
        primaryRoute,
        disruptions: [harborDisruption]
      });

      assert.strictEqual(detection.hasRelevantDisruptions, false, 'Harbor line should be irrelevant to Western line commuter');
      assert.strictEqual(detection.relevantCount, 0);

      const gen = commuteAlertGenerationService.generateAlertForDisruption(harborDisruption, studentContext);
      assert.strictEqual(gen.isGenerated, false);
      assert.ok(gen.reason === 'NOT_RELEVANT' || gen.reason === 'UNRELATED_ROUTE');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 4: Bus or Transport Service Unavailable
    // ------------------------------------------------------------------------
    await test('4. Bus/service unavailable: flags suspension, prompts mode switch or alternative', async () => {
      const busRoute = {
        id: 'route-bus-201',
        name: 'BEST Bus 201 Route',
        primaryMode: 'bus',
        totalDurationMinutes: 50,
        legs: [
          { id: 'leg-bus-1', mode: 'bus', from: 'Borivali', to: 'Vile Parle', lineInfo: { lineName: 'Bus 201' } }
        ]
      };

      const busCancellation = new CommuteDisruption({
        id: `disr-bus-susp-${Date.now()}`,
        type: 'service_suspension',
        affectedMode: 'bus',
        affectedRouteId: 'Bus 201',
        affectedArea: 'SV Road',
        severity: 'critical',
        description: 'Bus 201 services temporarily suspended due to fallen tree on SV Road',
        startTime: now - 15 * 60 * 1000,
        endTime: now + 3 * 3600000,
        status: 'active',
        estimatedDelayMinutes: 45,
        provenance: DataProvenance.userReported('BEST Control Feed').toJSON()
      });

      const detection = commuteDisruptionDetectionService.detectRelevantDisruptions({
        routes: [busRoute],
        primaryRoute: busRoute,
        disruptions: [busCancellation]
      });

      assert.strictEqual(detection.hasRelevantDisruptions, true);
      assert.strictEqual(detection.impactSummary.primaryRouteInfeasible, true);

      const gen = commuteAlertGenerationService.generateAlertForDisruption(busCancellation, {
        userId: studentA.id,
        primaryRoute: busRoute,
        alternativeRoutes: [alternativeRoute]
      });

      assert.strictEqual(gen.isGenerated, true);
      assert.strictEqual(gen.alert.recommendedAction.actionType.toLowerCase(), 'take_alternative_route');
      assert.ok(gen.alert.title.includes('suspended'));
    });

    // ------------------------------------------------------------------------
    // SCENARIO 5: Multiple Simultaneous Disruptions
    // ------------------------------------------------------------------------
    await test('5. Multiple simultaneous disruptions: aggregates impact across multiple modes cleanly', async () => {
      const d1 = new CommuteDisruption({
        id: `disr-multi-1-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Andheri',
        severity: 'moderate',
        description: 'Minor delay on Western Slow line',
        startTime: now - 5000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 12
      });

      const d2 = new CommuteDisruption({
        id: `disr-multi-2-${Date.now()}`,
        type: 'traffic',
        affectedMode: 'auto',
        affectedRouteId: null,
        affectedArea: 'Vile Parle Station',
        severity: 'moderate',
        description: 'Station road congestion slowing rickshaws',
        startTime: now - 5000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 8
      });

      const detection = commuteDisruptionDetectionService.detectRelevantDisruptions({
        routes,
        primaryRoute,
        disruptions: [d1, d2]
      });

      assert.strictEqual(detection.hasRelevantDisruptions, true);
      assert.strictEqual(detection.relevantCount, 2, 'Both rail and road disruptions should be matched');
      assert.strictEqual(detection.totalEvaluated, 2);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 6: Route Becoming Infeasible (Class Deadline Violation)
    // ------------------------------------------------------------------------
    await test('6. Route becoming infeasible: recommends alternative when class deadline is violated', async () => {
      const severeDelay = new CommuteDisruption({
        id: `disr-infeasible-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Borivali - Vile Parle',
        severity: 'critical',
        description: 'Major signal failure (+35 min delay)',
        startTime: now - 5000,
        endTime: now + 2 * 3600000,
        status: 'active',
        estimatedDelayMinutes: 35,
        provenance: DataProvenance.verified('Western Railway').toJSON()
      });

      // Primary arrives 08:45 + 35m delay = 09:20. Class starts at 08:50 -> conflict & infeasible!
      const detection = commuteDisruptionDetectionService.detectRelevantDisruptions({
        routes,
        primaryRoute,
        disruptions: [severeDelay],
        academicScheduleContext: {
          scheduledClassId: 'math-101',
          classStartTime: '08:50',
          scheduledStartTime: now + 45 * 60 * 1000
        },
        desiredArrivalTime: '08:50'
      });

      assert.strictEqual(detection.impactSummary.academicConflictDetected, true);
      assert.strictEqual(detection.impactSummary.primaryRouteInfeasible, true);
      assert.strictEqual(detection.impactSummary.recommendedActionType.toLowerCase(), 'take_alternative_route');

      const infeasibleContext = {
        ...studentContext,
        academicScheduleContext: {
          scheduledClassId: 'math-101',
          classStartTime: '08:50',
          scheduledStartTime: now + 45 * 60 * 1000
        },
        desiredArrivalTime: '08:50'
      };

      const gen = commuteAlertGenerationService.generateAlertForDisruption(severeDelay, infeasibleContext);
      assert.strictEqual(gen.isGenerated, true);
      assert.strictEqual(gen.alert.recommendedAction.actionType.toLowerCase(), 'take_alternative_route');
      assert.ok(gen.alert.alternativeRoute, 'Viable alternative route must be referenced');
      assert.strictEqual(gen.alert.alternativeRoute.routeId, alternativeRoute.id);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 7: Updated Disruption with Materially Changed Impact
    // ------------------------------------------------------------------------
    await test('7. Material update: escalates existing active alert without creating duplicate', async () => {
      const initialDisruption = new CommuteDisruption({
        id: `disr-mat-upd-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Dadar - Andheri',
        severity: 'moderate',
        description: 'Moderate 10m delay',
        startTime: now - 5000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 10
      });

      // 1. First run creates alert
      const outcome1 = commuteAlertLifecycleService.processDisruptionAlert(initialDisruption, studentContext);
      assert.strictEqual(outcome1.action, 'CREATED');
      const initialAlertId = outcome1.alert.id;

      // 2. Escalation: delay increases from 10m to 25m (>= 5m threshold) and severity becomes severe
      const escalated = new CommuteDisruption({
        ...initialDisruption.toJSON(),
        severity: 'severe',
        estimatedDelayMinutes: 25,
        description: 'Severe 25m delay due to track maintenance'
      });

      const outcome2 = commuteAlertLifecycleService.processDisruptionAlert(escalated, studentContext);
      assert.strictEqual(outcome2.action, 'UPDATED');
      assert.strictEqual(outcome2.isUpdated, true);
      assert.strictEqual(outcome2.alert.id, initialAlertId, 'Must update existing alert ID');
      assert.strictEqual(outcome2.alert.severity, 'severe');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 8: Repeated Processing of the Same Disruption
    // ------------------------------------------------------------------------
    await test('8. Repeated processing: unchanged disruption is deduplicated via fingerprint', async () => {
      const stableDisruption = new CommuteDisruption({
        id: `disr-stable-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Borivali - Vile Parle',
        severity: 'severe',
        description: 'Track maintenance delay on Western Railway Slow lines',
        startTime: now - 5000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 20
      });

      const run1 = commuteAlertLifecycleService.processDisruptionAlert(stableDisruption, studentContext);
      assert.strictEqual(run1.action, 'CREATED');

      const run2 = commuteAlertLifecycleService.processDisruptionAlert(stableDisruption, studentContext);
      assert.strictEqual(run2.action, 'DUPLICATE_IGNORED');
      assert.strictEqual(run2.isDuplicate, true);
      assert.strictEqual(run2.alert.id, run1.alert.id);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 9: Expired Disruption Handling
    // ------------------------------------------------------------------------
    await test('9. Expired disruption: rejects stale creation and marks active overdue alerts expired', async () => {
      const pastDisruption = new CommuteDisruption({
        id: `disr-past-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Andheri',
        severity: 'moderate',
        description: 'Past platform delay',
        startTime: now - 7200000,
        endTime: now - 3600000, // Ended 1 hr ago
        status: 'active'
      });

      const gen = commuteAlertGenerationService.generateAlertForDisruption(pastDisruption, studentContext);
      assert.strictEqual(gen.isGenerated, false);
      assert.strictEqual(gen.reason, 'DISRUPTION_EXPIRED');

      // Test active alert expiration transition
      const activeOverdue = new CommuteDisruptionAlert({
        id: `alert-overdue-test-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'delay',
        severity: 'minor',
        scope: { area: 'Borivali', mode: 'train' },
        validFrom: now - 7200000,
        validUntil: now - 1800000, // Expired 30 mins ago
        status: 'active',
        title: 'Past platform delay',
        message: 'Platform delay',
        relevanceReason: 'Overdue alert'
      });
      commuteDisruptionAlertRepository.save(activeOverdue, `fp-overdue-test-${Date.now()}`);

      const { expiredCount } = commuteAlertLifecycleService.markExpiredAlerts(now);
      assert.ok(expiredCount >= 1);

      const dbAlert = commuteDisruptionAlertRepository.findById(activeOverdue.id);
      assert.strictEqual(dbAlert.status, 'expired', 'Must be marked expired in DB');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 10: Resolved Disruption
    // ------------------------------------------------------------------------
    await test('10. Resolved disruption: resolves active alerts and avoids premature reopening', async () => {
      const disrId = `disr-resolve-test-${Date.now()}`;
      const unchangedDisruption = new CommuteDisruption({
        id: disrId,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Bandra',
        severity: 'moderate',
        description: 'Temporary slow line delay',
        status: 'active',
        startTime: now - 10000,
        endTime: now + 3600000,
        estimatedDelayMinutes: 5
      });

      // Generate the initial alert through lifecycle service so fingerprint and properties match exactly
      const initResult = commuteAlertLifecycleService.processDisruptionAlert(unchangedDisruption, studentContext);
      assert.strictEqual(initResult.action, 'CREATED');
      const saved = initResult.alert;

      // 1. Resolve alerts tied to this disruption
      const { resolvedCount } = commuteAlertLifecycleService.resolveAlertsForDisruption(disrId, now);
      assert.strictEqual(resolvedCount, 1);

      const resolvedDb = commuteDisruptionAlertRepository.findById(saved.id);
      assert.strictEqual(resolvedDb.status, 'resolved');
      assert.ok(resolvedDb.resolvedAt);

      // 2. Reprocessing same disruption without material change must NOT reopen
      const outcome = commuteAlertLifecycleService.processDisruptionAlert(unchangedDisruption, studentContext);
      assert.strictEqual(outcome.action, 'RESOLVED_UNCHANGED', 'Must not reopen without meaningful state change');
      assert.strictEqual(outcome.alert.status, 'resolved');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 11: Disabled Notifications Preference
    // ------------------------------------------------------------------------
    await test('11. Disabled notifications: suppresses dispatch when student disabled alerts', async () => {
      // Set student alertsEnabled = false
      commuteAlertPreferenceRepository.upsert(studentA.id, { alertsEnabled: false });

      const alert = new CommuteDisruptionAlert({
        id: `alert-disabled-pref-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'delay',
        severity: 'severe',
        scope: { area: 'Andheri', mode: 'train' },
        validFrom: now - 5000,
        validUntil: now + 3600000,
        status: 'active',
        title: 'Western Railway delay',
        message: 'Signal problem',
        relevanceReason: 'Disabled notification check'
      });

      const result = await commuteAlertDeliveryService.deliverAlert(alert);
      assert.strictEqual(result.delivered, false);
      assert.strictEqual(result.status, 'DISABLED');
      assert.ok(result.reason.includes('disabled'));

      // Restore enabled
      commuteAlertPreferenceRepository.upsert(studentA.id, { alertsEnabled: true });
    });

    // ------------------------------------------------------------------------
    // SCENARIO 12: Minimum Severity Preferences
    // ------------------------------------------------------------------------
    await test('12. Severity preferences: filters alerts below threshold, delivers matching ones', async () => {
      commuteAlertPreferenceRepository.upsert(studentA.id, { minimumSeverity: 'severe' });

      // Moderate Alert (below threshold)
      const moderateAlert = new CommuteDisruptionAlert({
        id: `alert-sev-mod-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'delay',
        severity: 'moderate',
        scope: { area: 'Andheri', mode: 'train' },
        validFrom: now - 5000,
        validUntil: now + 3600000,
        status: 'active',
        title: 'Moderate delay',
        message: 'Small delay',
        relevanceReason: 'Moderate check'
      });

      const modResult = await commuteAlertDeliveryService.deliverAlert(moderateAlert);
      assert.strictEqual(modResult.delivered, false);
      assert.strictEqual(modResult.status, 'FILTERED_SEVERITY');

      // Critical Alert (meets threshold)
      const criticalAlert = new CommuteDisruptionAlert({
        id: `alert-sev-crit-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'delay',
        severity: 'critical',
        scope: { area: 'Andheri', mode: 'train' },
        validFrom: now - 5000,
        validUntil: now + 3600000,
        status: 'active',
        title: 'Critical line blockage',
        message: 'Critical delay',
        relevanceReason: 'Critical check'
      });

      const critResult = await commuteAlertDeliveryService.deliverAlert(criticalAlert);
      assert.strictEqual(critResult.delivered, true);
      assert.strictEqual(critResult.status, 'DELIVERED');

      // Reset preference
      commuteAlertPreferenceRepository.upsert(studentA.id, { minimumSeverity: 'moderate' });
    });

    // ------------------------------------------------------------------------
    // SCENARIO 13: Successful Notification Delivery
    // ------------------------------------------------------------------------
    await test('13. Successful delivery: creates in-app notification record and delivery tracking record', async () => {
      const alert = new CommuteDisruptionAlert({
        id: `alert-deliv-success-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'cancellation',
        severity: 'severe',
        scope: { area: 'Borivali', mode: 'train' },
        validFrom: now - 5000,
        validUntil: now + 3600000,
        status: 'active',
        title: '[Train Advisory] Borivali slow train cancellation',
        message: 'Take fast train alternative',
        relevanceReason: 'Delivery verification'
      });

      const result = await commuteAlertDeliveryService.deliverAlert(alert, { channels: ['in_app'] });
      assert.strictEqual(result.delivered, true);
      assert.strictEqual(result.status, 'DELIVERED');

      // Verify in-app notification inbox record
      const notifs = notificationRepository.findByUserId(studentA.id);
      const createdNotif = notifs.find(n => n.related_resource_id === alert.id);
      assert.ok(createdNotif);
      assert.strictEqual(createdNotif.priority, 'high');

      // Verify delivery tracking repository record
      const deliveryRecord = commuteAlertDeliveryRepository.findByIdempotencyKey(
        commuteAlertDeliveryService.computeIdempotencyKey(studentA.id, alert.id, 'in_app')
      );
      assert.ok(deliveryRecord);
      assert.strictEqual(deliveryRecord.status, 'DELIVERED');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 14: Delivery Failure and Safe Retry
    // ------------------------------------------------------------------------
    await test('14. Failure and retry: tracks failure without leaking secrets, safely retries on recovery', async () => {
      const alert = new CommuteDisruptionAlert({
        id: `alert-retry-test-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'delay',
        severity: 'severe',
        scope: { area: 'Santacruz', mode: 'train' },
        validFrom: now - 5000,
        validUntil: now + 3600000,
        status: 'active',
        title: 'Santacruz track issue',
        message: 'Track issue',
        relevanceReason: 'Retry test'
      });

      // Inject temporary failing email transport with sensitive credential in error message
      let shouldFail = true;
      const mockEmailTransport = {
        sendMail: async () => {
          if (shouldFail) {
            throw new Error('SMTP connection failed for password=SuperSecretPassword123! and token=abcdef12345678901234567890');
          }
          return { messageId: 'mock-sent-123' };
        }
      };

      commuteAlertDeliveryService.setProvider('email', {
        isConfigured: () => true,
        deliver: async () => {
          if (shouldFail) {
            throw new Error('SMTP connection failed for password=SuperSecretPassword123! and token=abcdef12345678901234567890');
          }
          return { delivered: true, channel: 'email' };
        }
      });

      // 1. Initial attempt fails
      const failedResult = await commuteAlertDeliveryService.deliverAlert(alert, { channels: ['email'] });
      const emailResult = failedResult.channelResults.find(r => r.channel === 'email');
      assert.strictEqual(emailResult.status, 'FAILED');
      assert.ok(!emailResult.error.includes('SuperSecretPassword123!'), 'Must redact passwords from error');
      assert.ok(emailResult.error.includes('[REDACTED_CREDENTIAL]') || emailResult.error.includes('[REDACTED_TOKEN]'));

      // 2. Fix the transport and retry
      shouldFail = false;
      const retryOutcome = await commuteAlertDeliveryService.retryDelivery(
        commuteAlertDeliveryService.computeIdempotencyKey(studentA.id, alert.id, 'email')
      );

      assert.strictEqual(retryOutcome.retried, true);
      assert.strictEqual(retryOutcome.status, 'DELIVERED');

      // 3. Consecutive retry does not duplicate
      const alreadyDeliveredRetry = await commuteAlertDeliveryService.retryDelivery(
        commuteAlertDeliveryService.computeIdempotencyKey(studentA.id, alert.id, 'email')
      );
      assert.strictEqual(alreadyDeliveredRetry.status, 'ALREADY_DELIVERED');
      assert.strictEqual(alreadyDeliveredRetry.retried, false);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 15: Duplicate Delivery Prevention
    // ------------------------------------------------------------------------
    await test('15. Duplicate delivery prevention: multiple deliverAlert calls on same alert are idempotent', async () => {
      const alert = new CommuteDisruptionAlert({
        id: `alert-dup-deliv-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'waterlogging',
        severity: 'severe',
        scope: { area: 'Hindmata', mode: 'bus' },
        validFrom: now - 5000,
        validUntil: now + 3600000,
        status: 'active',
        title: 'Hindmata waterlogging',
        message: 'Bus diversion',
        relevanceReason: 'Idempotency check'
      });

      // First delivery creates notification
      const d1 = await commuteAlertDeliveryService.deliverAlert(alert, { channels: ['in_app'] });
      assert.strictEqual(d1.delivered, true);

      // Count notifications
      const notifsBefore = notificationRepository.findByResource(studentA.id, 'commute_disruption_alert', alert.id);
      assert.strictEqual(notifsBefore.length, 1);

      // Second delivery must be recognized as duplicate
      const d2 = await commuteAlertDeliveryService.deliverAlert(alert, { channels: ['in_app'] });
      const inAppRes = d2.channelResults.find(r => r.channel === 'in_app');
      assert.strictEqual(inAppRes.status, 'ALREADY_DELIVERED');
      assert.strictEqual(inAppRes.isDuplicate, true);

      // Notifications count must remain 1
      const notifsAfter = notificationRepository.findByResource(studentA.id, 'commute_disruption_alert', alert.id);
      assert.strictEqual(notifsAfter.length, 1, 'No duplicate notification inbox entries allowed');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 16: Unauthorized Access to Another Student's Alerts
    // ------------------------------------------------------------------------
    await test('16. Authorization: Student A cannot view or dismiss Student B alert', async () => {
      const alertB = new CommuteDisruptionAlert({
        id: `alert-private-b-${Date.now()}`,
        userId: studentB.id,
        disruptionType: 'delay',
        severity: 'severe',
        scope: { area: 'Churchgate', mode: 'train' },
        validFrom: now - 5000,
        validUntil: now + 3600000,
        status: 'active',
        title: 'Student B private alert',
        message: 'Private message',
        relevanceReason: 'Private alert'
      });
      commuteDisruptionAlertRepository.save(alertB, `fp-b-sec-${Date.now()}`);

      // Student A tries to view Student B's alert -> 403
      const viewRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/commute/alerts/${alertB.id}`,
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(viewRes.status, 403);
      assert.strictEqual(viewRes.body.success, false);

      // Student A tries to dismiss Student B's alert -> 403
      const dismissRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/commute/alerts/${alertB.id}/dismiss`,
        method: 'POST',
        headers: authHeaderA
      });
      assert.strictEqual(dismissRes.status, 403);

      // Admin CAN view Student B's alert -> 200
      const adminView = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/commute/alerts/${alertB.id}`,
        method: 'GET',
        headers: authHeaderAdmin
      });
      assert.strictEqual(adminView.status, 200);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 17: Synthetic & User-Reported Provenance
    // ------------------------------------------------------------------------
    await test('17. Provenance: preserves distinct tiers and never treats synthetic data as verified', async () => {
      const syntheticDisruption = new CommuteDisruption({
        id: `disr-synth-${Date.now()}`,
        type: 'crowding',
        affectedMode: 'metro',
        affectedRouteId: 'Line-1',
        affectedArea: 'Ghatkopar',
        severity: 'minor',
        description: 'Simulated peak morning crowd surge on Metro Line 1',
        startTime: now - 5000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 5,
        provenance: DataProvenance.synthetic('Peak Crowd Simulation Model', 'Simulated commuter density').toJSON()
      });

      const userReportedDisruption = new CommuteDisruption({
        id: `disr-user-rep-${Date.now()}`,
        type: 'auto_refusal',
        affectedMode: 'auto',
        affectedRouteId: null,
        affectedArea: 'Andheri West Station',
        severity: 'moderate',
        description: 'Auto driver queue refusing meters to Juhu',
        startTime: now - 5000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 15,
        provenance: DataProvenance.userReported('Community Commuter Feed', 'Student confirmations').toJSON()
      });

      const alertSynth = CommuteDisruptionAlert.fromDisruption(syntheticDisruption);
      const synthTier = alertSynth.provenance.sourceTier || alertSynth.provenance.tier;
      assert.strictEqual(synthTier, PROVENANCE_TIERS.SYNTHETIC);
      assert.strictEqual(alertSynth.isLiveFeed, false);

      const alertUser = CommuteDisruptionAlert.fromDisruption(userReportedDisruption);
      const userTier = alertUser.provenance.sourceTier || alertUser.provenance.tier;
      assert.strictEqual(userTier, PROVENANCE_TIERS.USER_REPORTED);

      // Job execution report correctly highlights synthetic evaluation
      const report = await commuteAlertProcessingService.runProcessingJob({
        trigger: 'test',
        disruptions: [syntheticDisruption, userReportedDisruption],
        dryRun: true
      });

      assert.strictEqual(report.feedStatus.syntheticDataEvaluated, true);
      assert.strictEqual(report.feedStatus.userReportedDataEvaluated, true);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 18: Missing External Feeds or Provider Credentials
    // ------------------------------------------------------------------------
    await test('18. Missing feeds/credentials: reports unconfigured without pretending live feeds exist', async () => {
      const statusRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/status',
        method: 'GET',
        headers: authHeaderA
      });

      assert.strictEqual(statusRes.status, 200);
      const { externalFeeds, channels } = statusRes.body;

      assert.strictEqual(externalFeeds.liveFeedConfigured, false);
      assert.strictEqual(externalFeeds.operational, false);
      assert.strictEqual(externalFeeds.feedSource, 'local_database_and_crowdsourced_reports');
      assert.ok(externalFeeds.message.includes('not configured'));

      // Web Push is honestly reported as unconfigured and unsupported prototype
      assert.strictEqual(channels.push.supported, false);
      assert.strictEqual(channels.push.configured, false);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 19: Background Job Idempotency
    // ------------------------------------------------------------------------
    await test('19. Job idempotency: consecutive background runs do not duplicate active alerts or deliveries', async () => {
      const testD = new CommuteDisruption({
        id: `disr-job-idemp-${Date.now()}`,
        type: 'maintenance',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Bandra - Mahim',
        severity: 'severe',
        description: 'Night maintenance block overrunning',
        startTime: now - 10000,
        endTime: now + 3600000,
        status: 'active',
        estimatedDelayMinutes: 20
      });

      // Run 1
      const run1 = await commuteAlertProcessingService.runProcessingJob({
        trigger: 'scheduled',
        disruptions: [testD],
        forceSync: false,
        dryRun: false
      });
      assert.strictEqual(run1.summary.createdCount, 1);
      assert.strictEqual(run1.summary.duplicatesCount, 0);

      // Run 2 (immediately follows)
      const run2 = await commuteAlertProcessingService.runProcessingJob({
        trigger: 'scheduled',
        disruptions: [testD],
        forceSync: false,
        dryRun: false
      });
      assert.strictEqual(run2.summary.createdCount, 0);
      assert.strictEqual(run2.summary.duplicatesCount, 1);

      // Run via ReminderScheduler
      const schedReport = await reminderScheduler.processCommuteDisruptionAlerts(now, {
        disruptions: [testD],
        forceSync: false,
        dryRun: false
      });
      assert.strictEqual(schedReport.summary.duplicatesCount, 1);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 20: Existing Backend Regression Coverage
    // ------------------------------------------------------------------------
    await test('20. Regression coverage: core health, candidate, and recommendation endpoints remain functional', async () => {
      // 1. Health check
      const healthRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/health',
        method: 'GET'
      });
      assert.strictEqual(healthRes.status, 200);

      // 2. Commute Candidates endpoint
      const candidatesRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaderA
      }, {
        origin: 'Borivali East',
        destination: 'Vile Parle West',
        desiredArrivalTime: '08:45'
      });
      assert.strictEqual(candidatesRes.status, 200);
      assert.ok(candidatesRes.body.feasibleRoutes || candidatesRes.body.candidates);

      // 3. Commute Recommendations endpoint
      const recsRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaderA
      }, {
        origin: 'Borivali East',
        destination: 'Vile Parle West',
        desiredArrivalTime: '08:45'
      });
      assert.strictEqual(recsRes.status, 200);
      assert.ok(recsRes.body.primaryRecommendation || recsRes.body.recommendation || recsRes.body.hasFeasibleRoute !== undefined);
    });

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(` MASTER VERIFICATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runMasterSuite().catch((err) => {
    console.error('Master verification suite encountered fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runMasterSuite };
