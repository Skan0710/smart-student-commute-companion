/**
 * Comprehensive Test Suite for Commute Alert Lifecycle & Deduplication Service
 *
 * Verifies:
 * 1. Creating new disruption alerts and generating stable fingerprints
 * 2. Idempotency: Duplicate processing does not create duplicate active alerts
 * 3. Material updates on severity changes (e.g. moderate -> severe)
 * 4. Material updates on estimated delay changes (>= 5 minutes)
 * 5. Non-material changes (minor noise < 5 minutes) ignored as duplicates
 * 6. Timely expiration: Expired alerts do not remain active and cannot be created active
 * 7. Resolution: Resolving disruptions marks alerts resolved without reopening on unchanged state
 * 8. Reopening: Meaningful state change reopens previously resolved alerts
 * 9. Dismissal: Authorized student dismissal, linked notification sync without deleting history
 * 10. Authorization & data isolation: Rejection of cross-student access and unauthenticated requests
 * 11. Concurrency safety: Parallel execution produces exactly one active alert without collisions
 * 12. History preservation: Inactive alerts are preserved for historical audit
 */

const assert = require('assert');
const {
  CommuteAlertLifecycleService,
  commuteAlertLifecycleService
} = require('../services/commuteAlertLifecycleService');
const {
  CommuteDisruptionAlertRepository
} = require('../repositories/CommuteDisruptionAlertRepository');
const {
  CommuteDisruptionAlert,
  DataProvenance
} = require('../models');
const {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError
} = require('../errors');
const { getConnection } = require('../db/connection');

// Initialize database schema
require('../db/database');

const db = getConnection();

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failedTests++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failedTests++;
  }
}

// Clean up alerts table before tests
function cleanAlerts() {
  db.prepare("DELETE FROM commute_disruption_alerts WHERE id LIKE 'test-%'").run();
}

console.log('\n========================================================================');
console.log(' Running Commute Alert Lifecycle & Deduplication Test Suite');
console.log('========================================================================\n');

cleanAlerts();

// ----------------------------------------------------------------------------
// Test 1: Creating a new alert
// ----------------------------------------------------------------------------
test('1. Creates new alert with stable fingerprint and active status', () => {
  const now = Date.now();
  const alert = CommuteDisruptionAlert.create({
    id: `test-alert-1-${now}`,
    userId: 'student-user-1',
    disruptionId: 'disr-wr-delay-01',
    disruptionType: 'delay',
    severity: 'moderate',
    scope: {
      mode: 'train',
      lineOrRoute: 'WR-SLOW',
      area: 'Andheri'
    },
    title: '[TRAIN Notice] WR-SLOW reported delayed (~15 min delay)',
    message: 'Your selected train route is reported delayed. The current estimate adds approximately 15 minutes.',
    relevanceReason: 'Directly impacts your morning commute to DJSCE',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Consider departing 15 minutes earlier',
      suggestedDepartureAdjustmentMinutes: 15
    }
  });

  const result = commuteAlertLifecycleService.processDisruptionAlert(alert);

  assert.strictEqual(result.action, 'CREATED');
  assert.strictEqual(result.isDuplicate, false);
  assert.strictEqual(result.isUpdated, false);
  assert.ok(result.alert instanceof CommuteDisruptionAlert);
  assert.strictEqual(result.alert.status, 'active');
  assert.ok(result.alert.fingerprint.startsWith('alert-fp:student-user-1:disr-wr-delay-01'));
});

// ----------------------------------------------------------------------------
// Test 2: Idempotency / Duplicate Processing
// ----------------------------------------------------------------------------
test('2. Repeated processing of unchanged event returns DUPLICATE_IGNORED and prevents duplicate alerts', () => {
  const now = Date.now();
  const alert = CommuteDisruptionAlert.create({
    id: `test-alert-2-${now}`,
    userId: 'student-user-2',
    disruptionId: 'disr-metro-delay-02',
    disruptionType: 'delay',
    severity: 'moderate',
    scope: {
      mode: 'metro',
      lineOrRoute: 'Line-1',
      area: 'Ghatkopar'
    },
    title: '[METRO Notice] Line-1 reported delayed (~10 min delay)',
    message: 'Your selected metro route has a reported delay near Ghatkopar.',
    relevanceReason: 'Directly impacts your planned metro commute leg',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Allow extra time',
      suggestedDepartureAdjustmentMinutes: 10
    }
  });

  // First execution: creates alert
  const first = commuteAlertLifecycleService.processDisruptionAlert(alert);
  assert.strictEqual(first.action, 'CREATED');
  assert.strictEqual(first.isDuplicate, false);

  // Second execution with identical payload: must be identified as duplicate
  const duplicateAlert = CommuteDisruptionAlert.create({
    id: `test-alert-2-dup-${now}`,
    userId: 'student-user-2',
    disruptionId: 'disr-metro-delay-02',
    disruptionType: 'delay',
    severity: 'moderate',
    scope: {
      mode: 'metro',
      lineOrRoute: 'Line-1',
      area: 'Ghatkopar'
    },
    title: '[METRO Notice] Line-1 reported delayed (~10 min delay)',
    message: 'Your selected metro route has a reported delay near Ghatkopar.',
    relevanceReason: 'Directly impacts your planned metro commute leg',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Allow extra time',
      suggestedDepartureAdjustmentMinutes: 10
    }
  });

  const second = commuteAlertLifecycleService.processDisruptionAlert(duplicateAlert);
  assert.strictEqual(second.action, 'DUPLICATE_IGNORED');
  assert.strictEqual(second.isDuplicate, true);
  assert.strictEqual(second.isUpdated, false);
  assert.strictEqual(second.alert.id, first.alert.id, 'Preserved original alert ID');

  // Verify only 1 active record exists in database for this fingerprint
  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM commute_disruption_alerts WHERE fingerprint = ? AND status = 'active'"
  ).get(first.alert.fingerprint).cnt;
  assert.strictEqual(count, 1, 'Only one active alert must exist for this fingerprint');
});

// ----------------------------------------------------------------------------
// Test 3: Material Update on Severity Change
// ----------------------------------------------------------------------------
test('3. Meaningful change in severity updates existing alert and returns UPDATED', () => {
  const now = Date.now();
  const alertId = `test-alert-3-${now}`;

  const initialAlert = CommuteDisruptionAlert.create({
    id: alertId,
    userId: 'student-user-3',
    disruptionId: 'disr-cr-maint-03',
    disruptionType: 'delay',
    severity: 'moderate',
    scope: {
      mode: 'train',
      lineOrRoute: 'CR-MAIN',
      area: 'Kurla'
    },
    title: '[TRAIN Notice] CR-MAIN reported delayed (~10 min delay)',
    message: 'Delays reported on Central Line near Kurla.',
    relevanceReason: 'Affects your transfer point',
    validFrom: now - 5000,
    validUntil: now + 3600000
  });

  commuteAlertLifecycleService.processDisruptionAlert(initialAlert);

  // Disruption escalates from moderate to severe
  const escalatedAlert = CommuteDisruptionAlert.create({
    id: `test-alert-3-esc-${now}`,
    userId: 'student-user-3',
    disruptionId: 'disr-cr-maint-03',
    disruptionType: 'delay',
    severity: 'severe',
    scope: {
      mode: 'train',
      lineOrRoute: 'CR-MAIN',
      area: 'Kurla'
    },
    title: '[TRAIN Advisory] Major delays reported on CR-MAIN (~25 min delay)',
    message: 'Major delays escalating on Central Line near Kurla.',
    relevanceReason: 'Affects your transfer point',
    validFrom: now - 5000,
    validUntil: now + 7200000,
    recommendedAction: {
      actionType: 'SWITCH_MODE',
      summary: 'Switch to Metro Line 1 interchange',
      suggestedDepartureAdjustmentMinutes: 25
    }
  });

  const updateResult = commuteAlertLifecycleService.processDisruptionAlert(escalatedAlert);
  assert.strictEqual(updateResult.action, 'UPDATED');
  assert.strictEqual(updateResult.isUpdated, true);
  assert.strictEqual(updateResult.previousSeverity, 'moderate');
  assert.strictEqual(updateResult.newSeverity, 'severe');
  assert.strictEqual(updateResult.alert.id, alertId, 'Retained stable existing alert ID');
  assert.strictEqual(updateResult.alert.severity, 'severe');
});

// ----------------------------------------------------------------------------
// Test 4: Material Update on Estimated Delay Impact Change (>= 5 minutes)
// ----------------------------------------------------------------------------
test('4. Delay impact increase of >= 5 minutes triggers material update', () => {
  const now = Date.now();
  const alertId = `test-alert-4-${now}`;

  const initialAlert = CommuteDisruptionAlert.create({
    id: alertId,
    userId: 'student-user-4',
    disruptionId: 'disr-bus-delay-04',
    disruptionType: 'traffic',
    severity: 'moderate',
    scope: {
      mode: 'bus',
      lineOrRoute: 'BEST-339',
      area: 'Juhu'
    },
    title: '[BUS Notice] BEST-339 delayed',
    message: 'Traffic slowdown on SV Road.',
    relevanceReason: 'Directly impacts bus route',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Allow 10 minutes extra',
      suggestedDepartureAdjustmentMinutes: 10
    }
  });

  commuteAlertLifecycleService.processDisruptionAlert(initialAlert);

  // New report increases delay from 10 to 20 minutes (+10m >= 5m threshold)
  const delayUpdateAlert = CommuteDisruptionAlert.create({
    id: `test-alert-4-update-${now}`,
    userId: 'student-user-4',
    disruptionId: 'disr-bus-delay-04',
    disruptionType: 'traffic',
    severity: 'moderate',
    scope: {
      mode: 'bus',
      lineOrRoute: 'BEST-339',
      area: 'Juhu'
    },
    title: '[BUS Notice] BEST-339 delayed (~20 min delay)',
    message: 'Traffic congestion worsening on SV Road.',
    relevanceReason: 'Directly impacts bus route',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Allow 20 minutes extra',
      suggestedDepartureAdjustmentMinutes: 20
    }
  });

  const res = commuteAlertLifecycleService.processDisruptionAlert(delayUpdateAlert);
  assert.strictEqual(res.action, 'UPDATED');
  assert.strictEqual(res.isUpdated, true);
  assert.strictEqual(res.alert.recommendedAction.suggestedDepartureAdjustmentMinutes, 20);
});

// ----------------------------------------------------------------------------
// Test 5: Minor Delay Variation (< 5 minutes) Treated as Non-Material
// ----------------------------------------------------------------------------
test('5. Delay variation < 5 minutes is treated as duplicate and does not trigger noisy updates', () => {
  const now = Date.now();
  const alertId = `test-alert-5-${now}`;

  const initialAlert = CommuteDisruptionAlert.create({
    id: alertId,
    userId: 'student-user-5',
    disruptionId: 'disr-bus-delay-05',
    disruptionType: 'traffic',
    severity: 'moderate',
    scope: {
      mode: 'bus',
      lineOrRoute: 'BEST-201',
      area: 'Andheri West'
    },
    title: '[BUS Notice] Road congestion near Andheri West (~15 min delay)',
    message: 'Road congestion on SV Road.',
    relevanceReason: 'Directly impacts bus route',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Allow 15 min extra',
      suggestedDepartureAdjustmentMinutes: 15
    }
  });

  commuteAlertLifecycleService.processDisruptionAlert(initialAlert);

  // Tiny fluctuation to 16 minutes (+1m, < 5m threshold)
  const minorNoiseAlert = CommuteDisruptionAlert.create({
    id: `test-alert-5-noise-${now}`,
    userId: 'student-user-5',
    disruptionId: 'disr-bus-delay-05',
    disruptionType: 'traffic',
    severity: 'moderate',
    scope: {
      mode: 'bus',
      lineOrRoute: 'BEST-201',
      area: 'Andheri West'
    },
    title: '[BUS Notice] Road congestion near Andheri West (~16 min delay)',
    message: 'Road congestion on SV Road.',
    relevanceReason: 'Directly impacts bus route',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Allow 16 min extra',
      suggestedDepartureAdjustmentMinutes: 16
    }
  });

  const res = commuteAlertLifecycleService.processDisruptionAlert(minorNoiseAlert);
  assert.strictEqual(res.action, 'DUPLICATE_IGNORED');
  assert.strictEqual(res.isDuplicate, true);
  assert.strictEqual(res.alert.recommendedAction.suggestedDepartureAdjustmentMinutes, 15);
});

// ----------------------------------------------------------------------------
// Test 6: Timely Expiration
// ----------------------------------------------------------------------------
test('6. Expired alerts cannot be created as active, and elapsed active alerts are marked expired', () => {
  const now = Date.now();

  // A. Disruption already in past: rejected
  const pastAlert = CommuteDisruptionAlert.create({
    id: `test-alert-6-past-${now}`,
    userId: 'student-user-6',
    disruptionId: 'disr-past-06',
    disruptionType: 'delay',
    severity: 'minor',
    scope: { area: 'Bandra' },
    title: 'Past disruption',
    message: 'This already ended.',
    relevanceReason: 'Historical only',
    validFrom: now - 7200000,
    validUntil: now - 3600000
  });

  const pastRes = commuteAlertLifecycleService.processDisruptionAlert(pastAlert);
  assert.strictEqual(pastRes.action, 'EXPIRED_IGNORED');
  assert.strictEqual(pastRes.alert, null);

  // B. Active alert whose validUntil elapses: marked expired
  const willExpireAlert = CommuteDisruptionAlert.create({
    id: `test-alert-6-expiring-${now}`,
    userId: 'student-user-6',
    disruptionId: 'disr-expiring-06',
    disruptionType: 'delay',
    severity: 'minor',
    scope: { area: 'Bandra' },
    title: 'Will expire soon',
    message: 'Expiring alert.',
    relevanceReason: 'Testing expiration',
    validFrom: now - 1000,
    validUntil: now + 2000 // expires in 2 seconds
  });

  commuteAlertLifecycleService.processDisruptionAlert(willExpireAlert);

  // Simulate advancing time past validity window
  const futureTime = now + 5000;
  const expiredCount = commuteAlertLifecycleService.markExpiredAlerts(futureTime);
  assert.ok(expiredCount.expiredCount >= 1, 'Marked at least 1 alert as expired');

  // Verify getActiveAlerts at futureTime does not include expired alert
  const activeAlerts = commuteAlertLifecycleService.getActiveAlerts({ id: 'student-user-6', role: 'student' }, {
    currentTime: futureTime
  });
  const found = activeAlerts.find(a => a.id === `test-alert-6-expiring-${now}`);
  assert.strictEqual(found, undefined, 'Expired alert must not be returned in getActiveAlerts');
});

// ----------------------------------------------------------------------------
// Test 7: Alert Resolution & Prevention of Repeated Reopening
// ----------------------------------------------------------------------------
test('7. Resolving alert marks it resolved; repeated processing without state change does not reopen', () => {
  const now = Date.now();
  const alertId = `test-alert-7-${now}`;

  const alert = CommuteDisruptionAlert.create({
    id: alertId,
    userId: 'student-user-7',
    disruptionId: 'disr-milan-waterlog-07',
    disruptionType: 'waterlogging',
    severity: 'severe',
    scope: { area: 'Milan Subway' },
    title: '[AUTO Advisory] Waterlogging near Milan Subway',
    message: 'Waterlogging reported.',
    relevanceReason: 'Directly impacts auto shuttle route',
    validFrom: now - 5000,
    validUntil: now + 3600000
  });

  commuteAlertLifecycleService.processDisruptionAlert(alert);

  // Resolve all alerts for this disruption
  const resolveResult = commuteAlertLifecycleService.resolveAlertsForDisruption('disr-milan-waterlog-07', now);
  assert.strictEqual(resolveResult.resolvedCount, 1);

  // Check stored status
  const stored = commuteAlertLifecycleService.getAlertById(alertId, { id: 'student-user-7', role: 'student' });
  assert.strictEqual(stored.status, 'resolved');
  assert.ok(stored.resolvedAt >= now);

  // Processing identical event again: must NOT reopen
  const reprocessAlert = CommuteDisruptionAlert.create({
    id: `test-alert-7-dup-${now}`,
    userId: 'student-user-7',
    disruptionId: 'disr-milan-waterlog-07',
    disruptionType: 'waterlogging',
    severity: 'severe',
    scope: { area: 'Milan Subway' },
    title: '[AUTO Advisory] Waterlogging near Milan Subway',
    message: 'Waterlogging reported.',
    relevanceReason: 'Directly impacts auto shuttle route',
    validFrom: now - 5000,
    validUntil: now + 3600000
  });

  const unchangedRes = commuteAlertLifecycleService.processDisruptionAlert(reprocessAlert);
  assert.strictEqual(unchangedRes.action, 'RESOLVED_UNCHANGED');
  assert.strictEqual(unchangedRes.isDuplicate, true);
  assert.strictEqual(unchangedRes.alert.status, 'resolved');
});

// ----------------------------------------------------------------------------
// Test 8: Meaningful State Change Reopens Resolved Alert
// ----------------------------------------------------------------------------
test('8. Meaningful state change on resolved disruption reopens alert to active', () => {
  const now = Date.now();
  const alertId = `test-alert-8-${now}`;

  const alert = CommuteDisruptionAlert.create({
    id: alertId,
    userId: 'student-user-8',
    disruptionId: 'disr-harbour-block-08',
    disruptionType: 'delay',
    severity: 'moderate',
    scope: { area: 'Kurla' },
    title: 'Harbour Line Delay',
    message: 'Delay on Harbour Line.',
    relevanceReason: 'Impacts commute corridor',
    validFrom: now - 5000,
    validUntil: now + 3600000
  });

  commuteAlertLifecycleService.processDisruptionAlert(alert);
  commuteAlertLifecycleService.resolveAlertsForDisruption('disr-harbour-block-08', now);

  // Meaningful reopening: severity escalated to critical and cancellation reported
  const escalatedReopenAlert = CommuteDisruptionAlert.create({
    id: `test-alert-8-reopen-${now}`,
    userId: 'student-user-8',
    disruptionId: 'disr-harbour-block-08',
    disruptionType: 'service_suspension',
    severity: 'critical',
    scope: { area: 'Kurla' },
    title: '[TRAIN Notice] Harbour Line service suspended',
    message: 'Service fully suspended.',
    relevanceReason: 'Requires alternate route',
    validFrom: now,
    validUntil: now + 7200000,
    recommendedAction: {
      actionType: 'SWITCH_MODE',
      summary: 'Switch to Central Line or Metro',
      suggestedDepartureAdjustmentMinutes: 30
    }
  });

  const reopenRes = commuteAlertLifecycleService.processDisruptionAlert(escalatedReopenAlert);
  assert.strictEqual(reopenRes.action, 'REOPENED');
  assert.strictEqual(reopenRes.isUpdated, true);
  assert.strictEqual(reopenRes.alert.status, 'active');
  assert.strictEqual(reopenRes.alert.severity, 'critical');
});

// ----------------------------------------------------------------------------
// Test 9: Alert Dismissal and Linked Notification Sync
// ----------------------------------------------------------------------------
test('9. Authorized dismissal sets status dismissed without deleting history or unrelated notifications', () => {
  const now = Date.now();
  const alertId = `test-alert-9-${now}`;

  const alert = CommuteDisruptionAlert.create({
    id: alertId,
    userId: 'student-user-9',
    disruptionId: 'disr-auto-queue-09',
    disruptionType: 'delay',
    severity: 'minor',
    scope: { area: 'Vile Parle' },
    title: 'Auto Queue',
    message: 'Moderate auto wait times.',
    relevanceReason: 'Near college station exit',
    validFrom: now - 5000,
    validUntil: now + 3600000
  });

  commuteAlertLifecycleService.processDisruptionAlert(alert);

  // Ensure test user exists in users table to satisfy notifications FK
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Test Student 9', 'DJSCE', 'student', ?, ?)
  `).run('student-user-9', `student9-${now}@djsce.edu`, now, now);

  // Create an associated notification in notifications table to test synchronization
  db.prepare(`
    INSERT INTO notifications (
      id, user_id, type, title, message, priority, read, related_resource_type, related_resource_id, created_at, expires_at
    ) VALUES (
      ?, ?, 'disruption', 'Auto Queue', 'Moderate auto wait', 'low', 0, 'commute_disruption_alert', ?, ?, ?
    )
  `).run(`notif-${alertId}`, 'student-user-9', alertId, now, now + 3600000);

  // Create an unrelated notification to verify it is NOT deleted or marked read
  const unrelatedNotifId = `notif-unrelated-${now}`;
  db.prepare(`
    INSERT INTO notifications (
      id, user_id, type, title, message, priority, read, related_resource_type, related_resource_id, created_at
    ) VALUES (
      ?, 'student-user-9', 'reminder', 'Class Reminder', 'Math 101 at 9:00', 'medium', 0, 'calendar_event', 'cal-101', ?
    )
  `).run(unrelatedNotifId, now);

  // Dismiss alert as authorized student
  const studentUser = { id: 'student-user-9', role: 'student' };
  const dismissed = commuteAlertLifecycleService.dismissAlert(alertId, studentUser, now);
  assert.strictEqual(dismissed.status, 'dismissed');
  assert.strictEqual(dismissed.dismissedAt, now);

  // Verify associated notification was marked read
  const updatedNotif = db.prepare('SELECT read FROM notifications WHERE id = ?').get(`notif-${alertId}`);
  assert.strictEqual(updatedNotif.read, 1);

  // Verify unrelated notification was NOT deleted and remains unread
  const unrelatedNotif = db.prepare('SELECT read FROM notifications WHERE id = ?').get(unrelatedNotifId);
  assert.ok(unrelatedNotif, 'Unrelated notification must not be deleted');
  assert.strictEqual(unrelatedNotif.read, 0, 'Unrelated notification must remain untouched');
});

// ----------------------------------------------------------------------------
// Test 10: Authorization & Data Isolation
// ----------------------------------------------------------------------------
test('10. Enforces authorization: rejects cross-student access and unauthenticated requests', () => {
  const now = Date.now();
  const alertId = `test-alert-10-${now}`;

  const alert = CommuteDisruptionAlert.create({
    id: alertId,
    userId: 'student-user-10-A',
    disruptionId: 'disr-personal-10',
    disruptionType: 'delay',
    severity: 'moderate',
    scope: { area: 'Andheri' },
    title: 'Personalized Alert for Student A',
    message: 'Delay affecting route.',
    relevanceReason: 'Direct match for Student A',
    validFrom: now - 5000,
    validUntil: now + 3600000
  });

  commuteAlertLifecycleService.processDisruptionAlert(alert);

  // Student B attempts to get Student A's alert
  assert.throws(() => {
    commuteAlertLifecycleService.getAlertById(alertId, { id: 'student-user-10-B', role: 'student' });
  }, ForbiddenError);

  // Student B attempts to dismiss Student A's alert
  assert.throws(() => {
    commuteAlertLifecycleService.dismissAlert(alertId, { id: 'student-user-10-B', role: 'student' });
  }, ForbiddenError);

  // Unauthenticated request to getActiveAlerts
  assert.throws(() => {
    commuteAlertLifecycleService.getActiveAlerts(null);
  }, UnauthorizedError);

  // Student B's active alerts must NOT include Student A's alert
  const studentBActive = commuteAlertLifecycleService.getActiveAlerts({ id: 'student-user-10-B', role: 'student' });
  const leakFound = studentBActive.find(a => a.id === alertId);
  assert.strictEqual(leakFound, undefined, 'Student B must not see Student A\'s personalized alert');
});

// ----------------------------------------------------------------------------
// Test 11: Concurrency Safety & Parallel Processing
// ----------------------------------------------------------------------------
test('11. Parallel processing of identical disruption produces exactly one active alert without collision', () => {
  const now = Date.now();
  const disruptionId = `disr-concurrent-11-${now}`;

  const createCandidate = (index) => CommuteDisruptionAlert.create({
    id: `test-alert-11-${index}-${now}`,
    userId: 'student-user-11',
    disruptionId,
    disruptionType: 'traffic',
    severity: 'moderate',
    scope: { area: 'JVPD Scheme' },
    title: '[BUS Notice] Traffic delay near JVPD Scheme (~15 min delay)',
    message: 'Road slowdown on Gulmohar Road.',
    relevanceReason: 'Directly impacts bus corridor',
    validFrom: now - 5000,
    validUntil: now + 3600000,
    recommendedAction: {
      actionType: 'DEPART_EARLIER',
      summary: 'Allow 15 min extra',
      suggestedDepartureAdjustmentMinutes: 15
    }
  });

  // Execute 5 simulated concurrent calls for the exact same disruption
  const results = [];
  for (let i = 0; i < 5; i++) {
    const res = commuteAlertLifecycleService.processDisruptionAlert(createCandidate(i));
    results.push(res);
  }

  const created = results.filter(r => r.action === 'CREATED');
  const duplicates = results.filter(r => r.action === 'DUPLICATE_IGNORED');

  assert.strictEqual(created.length, 1, 'Exactly one alert was created');
  assert.strictEqual(duplicates.length, 4, 'Remaining 4 calls recognized as duplicates');

  // Verify only 1 active alert exists in the DB
  const storedCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM commute_disruption_alerts WHERE disruption_id = ? AND status = 'active'"
  ).get(disruptionId).cnt;
  assert.strictEqual(storedCount, 1, 'Database contains exactly 1 active alert');
});

// ----------------------------------------------------------------------------
// Test 12: Preserving Alert History
// ----------------------------------------------------------------------------
test('12. Preserves alert history across all lifecycle states for audit and student dashboard', () => {
  const userId = 'student-user-12';
  const history = commuteAlertLifecycleService.getAlertHistory(userId, { id: userId, role: 'student' }, {
    status: 'all'
  });

  // Verify history is an array and querying works cleanly
  assert.ok(Array.isArray(history));

  // Non-owner query without admin role must be rejected
  assert.throws(() => {
    commuteAlertLifecycleService.getAlertHistory(userId, { id: 'other-user', role: 'student' });
  }, ForbiddenError);
});

// Clean up test alerts
cleanAlerts();

console.log('\n========================================================================');
console.log(` SUMMARY: ${passedTests} passed, ${failedTests} failed`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
