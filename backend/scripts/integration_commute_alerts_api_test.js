/**
 * Integration Tests for Commute Disruption Alerts API & Background Processing
 *
 * Verifies end-to-end functionality for:
 * 1. Authentication enforcement across all commute alert endpoints (401 Unauthorized)
 * 2. Role-based protection on internal processing endpoint (403 Forbidden for students, 200 for admin)
 * 3. Student privacy & data isolation: students never see another student's private alerts (403 Forbidden)
 * 4. Viewing alert details and dismissals
 * 5. Notification preferences lifecycle (GET defaults, PUT updates, validation error on empty payload)
 * 6. Alert system status and channel/feed diagnostics (truthfully reports unconfigured live feeds)
 * 7. Background disruption processing, deduplication, material updates, and notification delivery
 * 8. Expiration mechanics (overdue alerts automatically marked expired)
 * 9. Scheduler integration with ReminderScheduler
 * 10. Namespace compatibility: /api/commute/alerts and /api/student/commute/alerts
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');
const { signToken } = require('../utils/token');
const { getConnection } = require('../db/connection');
const { commuteDisruptionAlertRepository } = require('../repositories/CommuteDisruptionAlertRepository');
const { commuteAlertPreferenceRepository } = require('../repositories/CommuteAlertPreferenceRepository');
const { disruptionRepository } = require('../repositories/DisruptionRepository');
const { reminderScheduler } = require('../services/reminderScheduler');
const { commuteAlertProcessingService } = require('../services/commuteAlertProcessingService');
const { CommuteDisruptionAlert } = require('../models/CommuteDisruptionAlert');
const { CommuteDisruption } = require('../models/CommuteDisruption');
const { DataProvenance } = require('../models/CommuteContracts');

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

async function runTests() {
  console.log('===============================================================');
  console.log(' Running Commute Disruption Alerts & Processing API Integration Tests');
  console.log('===============================================================\n');

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

  const server = app.listen(0);
  const port = server.address().port;

  const db = getConnection();

  try {
    const studentA = { id: `student_a_${Date.now()}`, email: 'student_a@djsce.edu', role: 'student', full_name: 'Student A' };
    const studentB = { id: `student_b_${Date.now()}`, email: 'student_b@djsce.edu', role: 'student', full_name: 'Student B' };
    const adminUser = { id: `admin_${Date.now()}`, email: 'admin@djsce.edu', role: 'admin', full_name: 'Admin User' };

    // Register dummy users in DB to satisfy foreign keys if needed
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

    // ------------------------------------------------------------------------
    // TEST 1: Authentication Guard Enforcement
    // ------------------------------------------------------------------------
    await test('Authentication: rejects unauthenticated requests with 401', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/commute/alerts' },
        { method: 'GET', path: '/api/commute/alerts/preferences' },
        { method: 'PUT', path: '/api/commute/alerts/preferences' },
        { method: 'GET', path: '/api/commute/alerts/status' },
        { method: 'POST', path: '/api/commute/alerts/process' },
        { method: 'GET', path: '/api/commute/alerts/any-id' },
        { method: 'POST', path: '/api/commute/alerts/any-id/dismiss' }
      ];

      for (const ep of endpoints) {
        const res = await makeRequest({
          hostname: '127.0.0.1',
          port,
          path: ep.path,
          method: ep.method,
          headers: { 'Content-Type': 'application/json' }
        }, ep.method === 'PUT' || ep.method === 'POST' ? {} : null);

        assert.strictEqual(res.status, 401, `Endpoint ${ep.method} ${ep.path} should require authentication`);
      }
    });

    // ------------------------------------------------------------------------
    // TEST 2: RBAC Guard on Internal Processing Endpoint
    // ------------------------------------------------------------------------
    await test('RBAC: non-admin student is rejected with 403 on POST /commute/alerts/process', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/process',
        method: 'POST',
        headers: authHeaderA
      }, { dryRun: true });

      assert.strictEqual(res.status, 403, 'Student should receive 403 Forbidden for internal processing');
      assert.strictEqual(res.body.success, false);
    });

    await test('RBAC: admin is authorized to trigger POST /commute/alerts/process', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/process',
        method: 'POST',
        headers: authHeaderAdmin
      }, { dryRun: true });

      assert.strictEqual(res.status, 200, 'Admin should receive 200 OK');
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.report, 'Report should be returned');
      assert.strictEqual(res.body.report.trigger, 'manual_admin');
      assert.strictEqual(res.body.report.dryRun, true);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Student Privacy & Data Isolation
    // ------------------------------------------------------------------------
    await test('Privacy: student A cannot view or list student B alerts', async () => {
      // Create Alert for Student A
      const alertA = new CommuteDisruptionAlert({
        id: `alert-p1-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'delay',
        severity: 'severe',
        scope: { area: 'Andheri West', mode: 'train' },
        validFrom: Date.now() - 5000,
        validUntil: Date.now() + 3600000,
        status: 'active',
        title: '[Train Advisory] Student A western line delay',
        message: 'Severe delay affecting student A route',
        relevanceReason: 'Matches candidate route'
      });
      commuteDisruptionAlertRepository.save(alertA, `fp-a-${Date.now()}`);

      // Create Alert for Student B
      const alertB = new CommuteDisruptionAlert({
        id: `alert-p2-${Date.now()}`,
        userId: studentB.id,
        disruptionType: 'cancellation',
        severity: 'critical',
        scope: { area: 'Bandra', mode: 'bus' },
        validFrom: Date.now() - 5000,
        validUntil: Date.now() + 3600000,
        status: 'active',
        title: '[Bus Alert] Student B route cancellation',
        message: 'Bus suspended for student B',
        relevanceReason: 'Matches student B route'
      });
      commuteDisruptionAlertRepository.save(alertB, `fp-b-${Date.now()}`);

      // 1. List active alerts for Student A
      const listResA = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts',
        method: 'GET',
        headers: authHeaderA
      });

      assert.strictEqual(listResA.status, 200);
      assert.strictEqual(listResA.body.success, true);
      const studentAAlertIds = listResA.body.alerts.map(a => a.id);
      assert.ok(studentAAlertIds.includes(alertA.id), 'Student A should see their own alert');
      assert.ok(!studentAAlertIds.includes(alertB.id), 'Student A must NEVER see Student B alert');

      // 2. Direct GET on Student B's alert by Student A -> 403 Forbidden
      const getAlienAlert = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/commute/alerts/${alertB.id}`,
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(getAlienAlert.status, 403, 'Student A fetching Student B alert directly should return 403 Forbidden');

      // 3. Direct GET on Student A's alert by Student A -> 200 OK
      const getOwnAlert = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/commute/alerts/${alertA.id}`,
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(getOwnAlert.status, 200);
      assert.strictEqual(getOwnAlert.body.alert.id, alertA.id);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Alert Dismissal Lifecycle & Unauthorized Dismissal Prevention
    // ------------------------------------------------------------------------
    await test('Dismissal: student A cannot dismiss student B alert, but can dismiss own alert', async () => {
      const alertA = new CommuteDisruptionAlert({
        id: `alert-dismiss-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'waterlogging',
        severity: 'moderate',
        scope: { area: 'Milan Subway', mode: 'auto' },
        validFrom: Date.now() - 10000,
        validUntil: Date.now() + 3600000,
        status: 'active',
        title: '[Advisory] Waterlogging near Milan Subway',
        message: 'Take alternative flyover',
        relevanceReason: 'Affects student auto commute'
      });
      commuteDisruptionAlertRepository.save(alertA, `fp-dismiss-a-${Date.now()}`);

      const alertB = new CommuteDisruptionAlert({
        id: `alert-dismiss-b-${Date.now()}`,
        userId: studentB.id,
        disruptionType: 'waterlogging',
        severity: 'moderate',
        scope: { area: 'Kurla', mode: 'train' },
        validFrom: Date.now() - 10000,
        validUntil: Date.now() + 3600000,
        status: 'active',
        title: '[Advisory] Kurla waterlogging',
        message: 'Central line delay',
        relevanceReason: 'Affects student B'
      });
      commuteDisruptionAlertRepository.save(alertB, `fp-dismiss-b-${Date.now()}`);

      // Student A tries to dismiss Student B's alert -> 403
      const unauthorizedDismiss = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/commute/alerts/${alertB.id}/dismiss`,
        method: 'POST',
        headers: authHeaderA
      });
      assert.strictEqual(unauthorizedDismiss.status, 403);

      // Student A dismisses own alert -> 200
      const validDismiss = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/commute/alerts/${alertA.id}/dismiss`,
        method: 'POST',
        headers: authHeaderA
      });
      assert.strictEqual(validDismiss.status, 200);
      assert.strictEqual(validDismiss.body.success, true);
      assert.strictEqual(validDismiss.body.alert.status, 'dismissed');

      // Verify it is no longer listed in active alerts
      const listActive = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts',
        method: 'GET',
        headers: authHeaderA
      });
      const activeIds = listActive.body.alerts.map(a => a.id);
      assert.ok(!activeIds.includes(alertA.id), 'Dismissed alert should not appear in active alerts');
    });

    // ------------------------------------------------------------------------
    // TEST 5: Student Notification Preferences
    // ------------------------------------------------------------------------
    await test('Preferences: retrieval returns defaults and update persists changes', async () => {
      // 1. GET defaults for Student A
      const getRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/preferences',
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.preferences.userId, studentA.id);
      assert.strictEqual(getRes.body.preferences.alertsEnabled, true);
      assert.strictEqual(getRes.body.preferences.minimumSeverity, 'moderate');

      // 2. PUT validation error on empty payload
      const emptyUpdate = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/preferences',
        method: 'PUT',
        headers: authHeaderA
      }, {});
      assert.strictEqual(emptyUpdate.status, 400, 'Empty update payload should return 400 Bad Request');

      // 3. PUT valid update
      const validUpdate = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/preferences',
        method: 'PUT',
        headers: authHeaderA
      }, {
        minimumSeverity: 'severe',
        preferredChannels: ['in_app', 'email']
      });
      assert.strictEqual(validUpdate.status, 200);
      assert.strictEqual(validUpdate.body.preferences.minimumSeverity, 'severe');
      assert.deepStrictEqual(validUpdate.body.preferences.preferredChannels, ['in_app', 'email']);

      // 4. Verify persisted
      const reGetRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/preferences',
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(reGetRes.body.preferences.minimumSeverity, 'severe');
    });

    // ------------------------------------------------------------------------
    // TEST 6: System Status & Diagnostic Capabilities
    // ------------------------------------------------------------------------
    await test('Status: reports scheduler, channels, and unconfigured feed status accurately', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/status',
        method: 'GET',
        headers: authHeaderA
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.status, 'operational');
      assert.ok(res.body.channels, 'Channel diagnostics should be present');
      assert.strictEqual(res.body.channels.in_app.supported, true);
      assert.strictEqual(res.body.channels.in_app.configured, true);
      assert.strictEqual(res.body.channels.push.supported, false); // Prototype honest indicator

      // Feed diagnostics: does not pretend live feed is operational
      assert.ok(res.body.externalFeeds);
      assert.strictEqual(res.body.externalFeeds.liveFeedConfigured, false);
      assert.strictEqual(res.body.externalFeeds.operational, false);
      assert.strictEqual(res.body.externalFeeds.feedSource, 'local_database_and_crowdsourced_reports');
    });

    // ------------------------------------------------------------------------
    // TEST 7: Background Disruption Processing & Deduplication
    // ------------------------------------------------------------------------
    await test('Processing: evaluates disruptions, prevents duplicates, delivers safely', async () => {
      const testDisruption = new CommuteDisruption({
        id: `disr-test-${Date.now()}`,
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'WR-SLOW',
        affectedArea: 'Dadar - Andheri',
        severity: 'severe',
        description: 'Overhead wire issue causing slow train delays',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 3600000,
        status: 'active',
        estimatedDelayMinutes: 20,
        provenance: DataProvenance.verified('Western Railway Control', 'Live rail status').toJSON()
      });

      // Pass disruption directly to internal admin trigger
      const run1 = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/process',
        method: 'POST',
        headers: authHeaderAdmin
      }, {
        dryRun: false,
        forceSync: false,
        disruptions: [testDisruption.toJSON()]
      });

      assert.strictEqual(run1.status, 200);
      assert.strictEqual(run1.body.report.summary.createdCount, 1, 'First run should create 1 alert');

      // Second run with IDENTICAL disruption: must be deduplicated
      const run2 = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/process',
        method: 'POST',
        headers: authHeaderAdmin
      }, {
        dryRun: false,
        forceSync: false,
        disruptions: [testDisruption.toJSON()]
      });

      assert.strictEqual(run2.status, 200);
      assert.strictEqual(run2.body.report.summary.duplicatesCount, 1, 'Second run must identify duplicate');
      assert.strictEqual(run2.body.report.summary.createdCount, 0, 'Second run must not create duplicate active alert');

      // Third run with MATERIAL CHANGE (severity escalated to critical and delay +15m)
      const escalatedDisruption = new CommuteDisruption({
        ...testDisruption.toJSON(),
        severity: 'critical',
        estimatedDelayMinutes: 35,
        description: 'Power trip escalated slow line closure'
      });

      const run3 = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts/process',
        method: 'POST',
        headers: authHeaderAdmin
      }, {
        dryRun: false,
        forceSync: false,
        disruptions: [escalatedDisruption.toJSON()]
      });

      assert.strictEqual(run3.status, 200);
      assert.strictEqual(run3.body.report.summary.updatedCount, 1, 'Material escalation must update existing alert');
    });

    // ------------------------------------------------------------------------
    // TEST 8: Expiration Handling
    // ------------------------------------------------------------------------
    await test('Expiration: overdue alert is transitioned to expired status', async () => {
      const expiredAlert = new CommuteDisruptionAlert({
        id: `alert-overdue-${Date.now()}`,
        userId: studentA.id,
        disruptionType: 'delay',
        severity: 'moderate',
        scope: { area: 'Borivali', mode: 'train' },
        validFrom: Date.now() - 7200000,
        validUntil: Date.now() - 3600000, // Elapsed 1 hr ago
        status: 'active',
        title: '[Train Notice] Borivali platform change',
        message: 'Platform adjustment',
        relevanceReason: 'Expired test alert'
      });
      commuteDisruptionAlertRepository.save(expiredAlert, `fp-overdue-${Date.now()}`);

      // Call active alerts: markExpiredAlerts runs automatically
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/alerts',
        method: 'GET',
        headers: authHeaderA
      });

      const ids = res.body.alerts.map(a => a.id);
      assert.ok(!ids.includes(expiredAlert.id), 'Expired alert must not be returned in active list');

      const dbCheck = commuteDisruptionAlertRepository.findById(expiredAlert.id);
      assert.strictEqual(dbCheck.status, 'expired', 'Alert status in DB must be transitioned to expired');
    });

    // ------------------------------------------------------------------------
    // TEST 9: Scheduler Integration
    // ------------------------------------------------------------------------
    await test('Scheduler: ReminderScheduler.processCommuteDisruptionAlerts executes cleanly', async () => {
      const report = await reminderScheduler.processCommuteDisruptionAlerts(Date.now(), {
        dryRun: true,
        forceSync: false
      });

      assert.ok(report, 'Scheduler processing report should be returned');
      assert.strictEqual(report.trigger, 'scheduled');
      assert.strictEqual(typeof report.durationMs, 'number');
    });

    // ------------------------------------------------------------------------
    // TEST 10: Namespace Aliases (/student/commute/alerts)
    // ------------------------------------------------------------------------
    await test('Namespace: /student/commute/alerts works identically to /commute/alerts', async () => {
      const listRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/student/commute/alerts',
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(listRes.status, 200);
      assert.strictEqual(listRes.body.success, true);

      const prefRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/student/commute/alerts/preferences',
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(prefRes.status, 200);
      assert.strictEqual(prefRes.body.success, true);

      const statusRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/student/commute/alerts/status',
        method: 'GET',
        headers: authHeaderA
      });
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.success, true);
    });

  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
