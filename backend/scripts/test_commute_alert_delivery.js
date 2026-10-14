/**
 * Comprehensive Test Suite for Commute Alert Delivery Service
 *
 * Verifies:
 * 1. User preferences (getting defaults, updating settings, minimum severity, categories, channels)
 * 2. Disabled alerts: alerts are not sent when disabled in preferences, returning observable status
 * 3. Filtered alerts: alerts below minimum severity or disabled categories are filtered out
 * 4. Successful delivery: in-app notification created with matching payload and priority
 * 5. Socket delivery: emits to student's private user channel; never leaks personal details publicly
 * 6. Unconfigured channels: accurately reports unconfigured status and falls back to safe in-app inbox
 * 7. Browser push: does not claim push works when prerequisites are not configured
 * 8. Mock external providers: mock email and push transports correctly receive alert payloads
 * 9. Observable failure tracking: records failed attempts without leaking credentials/tokens
 * 10. Idempotent retries: retry succeeds and updates delivery records without duplicate notifications
 * 11. Duplicate prevention: prevents multiple deliveries of the same alert on the same channel
 * 12. Authorization safeguards: enforces ownership on alert preferences and delivery history
 */

const assert = require('assert');
const {
  CommuteAlertDeliveryService,
  commuteAlertDeliveryService,
  sanitizeCredentials
} = require('../services/commuteAlertDeliveryService');
const {
  commuteAlertPreferenceRepository
} = require('../repositories/CommuteAlertPreferenceRepository');
const {
  commuteAlertDeliveryRepository
} = require('../repositories/CommuteAlertDeliveryRepository');
const {
  notificationRepository
} = require('../repositories/NotificationRepository');
const {
  userRepository
} = require('../repositories/UserRepository');
const {
  CommuteDisruptionAlert,
  CommuteAlertPreference
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

async function test(name, fn) {
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

function ensureUser(id, email, name) {
  const existing = userRepository.findById(id);
  if (!existing) {
    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', ?, 'D.J. Sanghvi College of Engineering', 'student', ?, ?)
    `).run(id, email, name, Date.now(), Date.now());
  }
}

function cleanDeliveries() {
  db.prepare("DELETE FROM commute_alert_deliveries WHERE id LIKE 'test-%' OR alert_id LIKE 'test-%'").run();
  db.prepare("DELETE FROM commute_alert_preferences WHERE user_id LIKE 'test-%'").run();
  db.prepare("DELETE FROM notifications WHERE id LIKE 'notif-test-%'").run();
}

async function run() {
  console.log('\n========================================================================');
  console.log(' Running Commute Alert Delivery Service Test Suite');
  console.log('========================================================================\n');

  cleanDeliveries();

  // Setup test students
  const now = Date.now();
  const student1 = { id: `test-student-1-${now}`, email: `student1-${now}@djsce.edu`, role: 'student' };
  const student2 = { id: `test-student-2-${now}`, email: `student2-${now}@djsce.edu`, role: 'student' };
  ensureUser(student1.id, student1.email, 'Aarav Sharma');
  ensureUser(student2.id, student2.email, 'Priya Nair');

  // ----------------------------------------------------------------------------
  // Test 1: Notification Preferences (Get Defaults & Update)
  // ----------------------------------------------------------------------------
  await test('1. Retrieves defaults and updates student alert notification preferences', async () => {
    const defaults = commuteAlertDeliveryService.getPreferences(student1.id, student1);
    assert.strictEqual(defaults.alertsEnabled, true);
    assert.strictEqual(defaults.minimumSeverity, 'moderate');
    assert.deepStrictEqual(defaults.preferredChannels, ['in_app']);

    // Update preferences: enable email and set minimum severity to 'severe'
    const updated = commuteAlertDeliveryService.updatePreferences(student1.id, {
      minimumSeverity: 'severe',
      preferredChannels: ['in_app', 'email']
    }, student1);

    assert.strictEqual(updated.minimumSeverity, 'severe');
    assert.ok(updated.preferredChannels.includes('email'));
    assert.ok(updated.preferredChannels.includes('in_app'));

    // Reset to default for subsequent tests
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);
  });

  // ----------------------------------------------------------------------------
  // Test 2: Disabled Alerts
  // ----------------------------------------------------------------------------
  await test('2. Does not deliver alerts when disabled in preferences and returns observable status', async () => {
    // Disable alerts for student1
    commuteAlertDeliveryService.updatePreferences(student1.id, {
      alertsEnabled: false
    }, student1);

    const alert = CommuteDisruptionAlert.create({
      id: `test-alert-disabled-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-disabled',
      disruptionType: 'delay',
      severity: 'severe',
      scope: { area: 'Andheri West' },
      title: '[TRAIN Advisory] Major delays reported on WR-SLOW (~20 min delay)',
      message: 'Your selected train route is reported delayed.',
      relevanceReason: 'Direct match for planned commute'
    });

    const result = await commuteAlertDeliveryService.deliverAlert(alert, { requestingUser: student1 });
    assert.strictEqual(result.delivered, false);
    assert.strictEqual(result.status, 'DISABLED');
    assert.ok(result.reason.includes('disabled in student notification preferences'));

    // Verify no notification was written to in-app inbox
    const notifs = notificationRepository.findByResource(student1.id, 'commute_disruption_alert', alert.id);
    assert.strictEqual(notifs.length, 0);

    // Re-enable alerts
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);
  });

  // ----------------------------------------------------------------------------
  // Test 3: Severity and Category Filtering
  // ----------------------------------------------------------------------------
  await test('3. Filters alerts below minimum severity or with disabled disruption categories', async () => {
    // Configure preference: minimum severity 'severe', only 'cancellation' and 'service_suspension'
    commuteAlertDeliveryService.updatePreferences(student1.id, {
      alertsEnabled: true,
      minimumSeverity: 'severe',
      enabledCategories: ['cancellation', 'service_suspension']
    }, student1);

    // A. Moderate alert should be filtered by severity
    const moderateAlert = CommuteDisruptionAlert.create({
      id: `test-alert-moderate-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-moderate',
      disruptionType: 'cancellation',
      severity: 'moderate',
      scope: { area: 'Bandra' },
      title: 'Moderate Cancellation',
      message: 'Trip cancelled.',
      relevanceReason: 'Direct match'
    });

    const sevResult = await commuteAlertDeliveryService.deliverAlert(moderateAlert, { requestingUser: student1 });
    assert.strictEqual(sevResult.delivered, false);
    assert.strictEqual(sevResult.status, 'FILTERED_SEVERITY');

    // B. Severe traffic alert should be filtered by category (traffic not in enabledCategories)
    const trafficAlert = CommuteDisruptionAlert.create({
      id: `test-alert-traffic-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-traffic',
      disruptionType: 'traffic',
      severity: 'severe',
      scope: { area: 'Bandra' },
      title: 'Severe Traffic',
      message: 'Road gridlock.',
      relevanceReason: 'Direct match'
    });

    const catResult = await commuteAlertDeliveryService.deliverAlert(trafficAlert, { requestingUser: student1 });
    assert.strictEqual(catResult.delivered, false);
    assert.strictEqual(catResult.status, 'FILTERED_CATEGORY');

    // Re-enable defaults
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);
  });

  // ----------------------------------------------------------------------------
  // Test 4: Successful Delivery (In-App Channel)
  // ----------------------------------------------------------------------------
  await test('4. Successfully delivers alert to student in-app inbox with matching priority and payload', async () => {
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);

    const alert = CommuteDisruptionAlert.create({
      id: `test-alert-inapp-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-inapp',
      disruptionType: 'delay',
      severity: 'moderate',
      scope: { mode: 'train', lineOrRoute: 'WR-SLOW', area: 'Andheri' },
      title: '[TRAIN Notice] WR-SLOW reported delayed (~15 min delay)',
      message: 'Your selected train route is reported delayed. The current estimate adds approximately 15 minutes.',
      relevanceReason: 'Directly impacts your planned train leg',
      validFrom: now,
      validUntil: now + 3600000,
      recommendedAction: {
        actionType: 'DEPART_EARLIER',
        summary: 'Consider departing 15 minutes earlier',
        suggestedDepartureAdjustmentMinutes: 15
      }
    });

    const result = await commuteAlertDeliveryService.deliverAlert(alert, { requestingUser: student1 });
    assert.strictEqual(result.delivered, true);
    assert.strictEqual(result.status, 'DELIVERED');

    const inAppResult = result.channelResults.find(r => r.channel === 'in_app');
    assert.ok(inAppResult);
    assert.strictEqual(inAppResult.status, 'DELIVERED');
    assert.strictEqual(inAppResult.isDuplicate, false);

    // Check persisted notification
    const notif = notificationRepository.findById(inAppResult.details.notificationId);
    assert.ok(notif);
    assert.strictEqual(notif.user_id, student1.id);
    assert.strictEqual(notif.type, 'disruption');
    assert.strictEqual(notif.priority, 'medium'); // moderate severity maps to medium priority
    assert.strictEqual(notif.related_resource_type, 'commute_disruption_alert');
    assert.strictEqual(notif.related_resource_id, alert.id);
  });

  // ----------------------------------------------------------------------------
  // Test 5: Socket.IO Private Delivery & Privacy Safeguards
  // ----------------------------------------------------------------------------
  await test('5. Socket.IO provider emits to student private channel and never leaks personal details publicly', async () => {
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);

    const emittedEvents = [];
    const mockIo = {
      to: (channel) => ({
        emit: (event, payload) => {
          emittedEvents.push({ channel, event, payload });
        }
      })
    };

    const deliveryServiceWithSocket = new CommuteAlertDeliveryService();
    deliveryServiceWithSocket.providers.socket.setIo(mockIo);

    const personalAlert = CommuteDisruptionAlert.create({
      id: `test-alert-socket-priv-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-socket-priv',
      disruptionType: 'delay',
      severity: 'severe',
      scope: { area: 'Andheri West' },
      title: '[TRAIN Advisory] Major delays reported on WR-SLOW',
      message: 'Your route is impacted.',
      relevanceReason: 'Direct match for student schedule'
    });

    const result = await deliveryServiceWithSocket.deliverAlert(personalAlert, {
      channels: ['socket'],
      requestingUser: student1
    });

    assert.strictEqual(result.delivered, true);
    assert.strictEqual(emittedEvents.length, 1);
    assert.strictEqual(emittedEvents[0].channel, `user:${student1.id}`, 'Must emit strictly to private user channel');
    assert.notStrictEqual(emittedEvents[0].channel, 'mumbai_general', 'Must NOT emit to public room');
  });

  // ----------------------------------------------------------------------------
  // Test 6: Unconfigured Channel Fallback to In-App
  // ----------------------------------------------------------------------------
  await test('6. Accurately reports unconfigured email/push channels and safely falls back to in-app inbox', async () => {
    commuteAlertPreferenceRepository.resetToDefaults(student2.id);

    const alert = CommuteDisruptionAlert.create({
      id: `test-alert-fallback-${now}`,
      userId: student2.id,
      disruptionId: 'disr-test-fallback',
      disruptionType: 'waterlogging',
      severity: 'severe',
      scope: { area: 'Milan Subway' },
      title: '[AUTO Advisory] Waterlogging near Milan Subway (~25 min delay)',
      message: 'Waterlogging reported near Milan Subway.',
      relevanceReason: 'Affects commute route'
    });

    // Request email delivery when no email transport is configured
    const result = await commuteAlertDeliveryService.deliverAlert(alert, {
      channels: ['email'],
      requestingUser: student2
    });

    assert.strictEqual(result.delivered, true, 'Delivery succeeded via fallback');
    const emailRes = result.channelResults.find(r => r.channel === 'email');
    assert.ok(emailRes);
    assert.strictEqual(emailRes.status, 'UNCONFIGURED');
    assert.ok(emailRes.reason.includes('not configured in environment'));
    assert.strictEqual(emailRes.fallback.channel, 'in_app');
    assert.strictEqual(emailRes.fallback.status, 'DELIVERED');

    // Verify that an in-app notification was indeed created as fallback
    const inAppNotif = notificationRepository.findByResource(student2.id, 'commute_disruption_alert', alert.id);
    assert.strictEqual(inAppNotif.length, 1);
  });

  // ----------------------------------------------------------------------------
  // Test 7: Browser Push Capability Reporting
  // ----------------------------------------------------------------------------
  await test('7. Accurately reports browser push as unconfigured when VAPID prerequisites are absent', async () => {
    const status = commuteAlertDeliveryService.getChannelStatus();
    assert.strictEqual(status.push.supported, false);
    assert.strictEqual(status.push.configured, false);
    assert.ok(status.push.description.includes('service worker'));
  });

  // ----------------------------------------------------------------------------
  // Test 8: Mock External Providers (Email & Push)
  // ----------------------------------------------------------------------------
  await test('8. Mock external email and push providers correctly receive alert payloads', async () => {
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);

    const sentEmails = [];
    const mockEmailTransport = {
      sendMail: async (mailOptions) => {
        sentEmails.push(mailOptions);
        return { messageId: `msg-${Date.now()}` };
      }
    };

    const sentPushes = [];
    const mockPushService = {
      sendNotification: async (userId, payload) => {
        sentPushes.push({ userId, payload });
        return { success: true };
      }
    };

    const customDeliveryService = new CommuteAlertDeliveryService();
    customDeliveryService.providers.email.setTransport(mockEmailTransport);
    customDeliveryService.providers.push.setPushService(mockPushService);

    const alert = CommuteDisruptionAlert.create({
      id: `test-alert-mocks-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-mocks',
      disruptionType: 'cancellation',
      severity: 'severe',
      scope: { mode: 'bus', lineOrRoute: 'BEST-201', area: 'Andheri West' },
      title: '[BUS Notice] BEST-201 service suspended',
      message: 'Your selected bus route is currently unavailable.',
      relevanceReason: 'Direct leg match'
    });

    const res = await customDeliveryService.deliverAlert(alert, {
      channels: ['email', 'push'],
      requestingUser: student1
    });

    assert.strictEqual(res.delivered, true);
    assert.strictEqual(sentEmails.length, 1);
    assert.strictEqual(sentEmails[0].to, student1.email);
    assert.strictEqual(sentEmails[0].subject, alert.title);

    assert.strictEqual(sentPushes.length, 1);
    assert.strictEqual(sentPushes[0].userId, student1.id);
    assert.strictEqual(sentPushes[0].payload.title, alert.title);
  });

  // ----------------------------------------------------------------------------
  // Test 9: Observable Delivery Failures & Credential Sanitization
  // ----------------------------------------------------------------------------
  await test('9. Observable failure tracking captures provider errors without leaking credentials', async () => {
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);

    const failingEmailTransport = {
      sendMail: async () => {
        throw new Error('SMTP connection rejected. Auth failed: secret_api_token_1234567890abcdef');
      }
    };

    const customDeliveryService = new CommuteAlertDeliveryService();
    customDeliveryService.providers.email.setTransport(failingEmailTransport);

    const alert = CommuteDisruptionAlert.create({
      id: `test-alert-fail-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-fail',
      disruptionType: 'delay',
      severity: 'moderate',
      scope: { area: 'Bandra' },
      title: 'Delay Notice',
      message: 'Test failure.',
      relevanceReason: 'Test'
    });

    const res = await customDeliveryService.deliverAlert(alert, {
      channels: ['email'],
      requestingUser: student1
    });

    const emailRes = res.channelResults.find(r => r.channel === 'email');
    assert.ok(emailRes);
    assert.strictEqual(emailRes.status, 'FAILED');
    assert.ok(!emailRes.error.includes('secret_api_token_1234567890abcdef'), 'Secret token must be redacted');
    assert.ok(emailRes.error.includes('[REDACTED'), 'Error message contains redaction marker');

    // Verify failure is recorded in database
    const history = customDeliveryService.getDeliveryHistory(student1.id, student1, { channel: 'email' });
    const failedRecord = history.find(d => d.alertId === alert.id);
    assert.ok(failedRecord);
    assert.strictEqual(failedRecord.status, 'FAILED');
    assert.ok(!failedRecord.errorMessage.includes('secret_api_token_1234567890abcdef'), 'Audit record must not contain secret');
  });

  // ----------------------------------------------------------------------------
  // Test 10: Idempotent Retries
  // ----------------------------------------------------------------------------
  await test('10. Retrying failed delivery succeeds and avoids duplicate dispatch if already delivered', async () => {
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);

    let callCount = 0;
    const flakyTransport = {
      sendMail: async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary network glitch');
        }
        return { messageId: `retry-msg-${Date.now()}` };
      }
    };

    const retryService = new CommuteAlertDeliveryService();
    retryService.providers.email.setTransport(flakyTransport);

    const alert = CommuteDisruptionAlert.create({
      id: `test-alert-retry-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-retry',
      disruptionType: 'traffic',
      severity: 'moderate',
      scope: { area: 'Juhu' },
      title: 'Traffic alert',
      message: 'Slow traffic.',
      relevanceReason: 'Route corridor'
    });

    // First attempt fails
    const initialRes = await retryService.deliverAlert(alert, { channels: ['email'], requestingUser: student1 });
    assert.strictEqual(initialRes.channelResults[0].status, 'FAILED');

    const key = retryService.computeIdempotencyKey(student1.id, alert.id, 'email');

    // Retry attempt 1: Flaky transport succeeds on 2nd call
    const retryResult = await retryService.retryDelivery(key);
    assert.strictEqual(retryResult.status, 'DELIVERED');
    assert.strictEqual(retryResult.retried, true);
    assert.strictEqual(retryResult.attemptCount, 2);

    // Retry attempt 2: Already delivered! Must not invoke transport again
    const secondRetry = await retryService.retryDelivery(key);
    assert.strictEqual(secondRetry.status, 'ALREADY_DELIVERED');
    assert.strictEqual(secondRetry.retried, false);
    assert.strictEqual(callCount, 2, 'Provider sendMail must not be called again after delivery');
  });

  // ----------------------------------------------------------------------------
  // Test 11: Duplicate Delivery Prevention
  // ----------------------------------------------------------------------------
  await test('11. Repeated calls to deliverAlert with identical alert do not dispatch duplicate notifications', async () => {
    commuteAlertPreferenceRepository.resetToDefaults(student1.id);

    const alert = CommuteDisruptionAlert.create({
      id: `test-alert-nodup-${now}`,
      userId: student1.id,
      disruptionId: 'disr-test-nodup',
      disruptionType: 'delay',
      severity: 'moderate',
      scope: { area: 'Santacruz' },
      title: 'Santacruz delay',
      message: 'Delay reported.',
      relevanceReason: 'Corridor'
    });

    // First delivery
    const first = await commuteAlertDeliveryService.deliverAlert(alert, {
      channels: ['in_app'],
      requestingUser: student1
    });
    assert.strictEqual(first.channelResults[0].status, 'DELIVERED');

    // Second delivery with same alert ID
    const second = await commuteAlertDeliveryService.deliverAlert(alert, {
      channels: ['in_app'],
      requestingUser: student1
    });
    assert.strictEqual(second.channelResults[0].status, 'ALREADY_DELIVERED');
    assert.strictEqual(second.channelResults[0].isDuplicate, true);

    // Verify only 1 notification exists in database
    const notifs = notificationRepository.findByResource(student1.id, 'commute_disruption_alert', alert.id);
    assert.strictEqual(notifs.length, 1);
  });

  // ----------------------------------------------------------------------------
  // Test 12: Authorization Safeguards
  // ----------------------------------------------------------------------------
  await test('12. Enforces authorization: rejects unauthenticated requests and cross-student preference management', async () => {
    // Unauthenticated getPreferences
    assert.throws(() => {
      commuteAlertDeliveryService.getPreferences(student1.id, null);
    }, UnauthorizedError);

    // Student 2 attempts to view Student 1 preferences
    assert.throws(() => {
      commuteAlertDeliveryService.getPreferences(student1.id, student2);
    }, ForbiddenError);

    // Student 2 attempts to view Student 1 delivery history
    assert.throws(() => {
      commuteAlertDeliveryService.getDeliveryHistory(student1.id, student2);
    }, ForbiddenError);
  });

  // Clean up test data
  cleanDeliveries();

  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
