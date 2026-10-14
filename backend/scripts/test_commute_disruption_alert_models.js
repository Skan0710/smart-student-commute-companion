/**
 * Focused Model, Validation, and Serialization Tests for CommuteDisruptionAlert
 *
 * Verifies:
 * 1. Creation, default values, and schema validation.
 * 2. Required field and timestamp validations (validFrom <= validUntil).
 * 3. Expired disruption lifecycle and status transitions.
 * 4. Privacy-by-design enforcement: rejects GPS coordinates, residential addresses, tracking history.
 * 5. Student authorization enforcement: protects user-specific alerts against cross-student access.
 * 6. Provenance categories (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC) and live feed integrity.
 * 7. Recommended action value objects and commuter guidance.
 * 8. Affected commute context and route intersection detection.
 * 9. Integration with Notification infrastructure without duplicate notification delivery systems.
 * 10. Adapting from CommuteDisruption entities.
 * 11. Lossless JSON serialization.
 */

const assert = require('assert');
const {
  CommuteDisruptionAlert,
  commuteDisruptionAlertSchema,
  ALERT_STATUSES,
  alertStatusEnum,
  ALERT_ACTION_TYPES,
  alertActionTypeEnum,
  ALERT_SEVERITY_TO_NOTIFICATION_PRIORITY,
  findForbiddenAlertPrivacyFields,
  assertCoarseLocationPrivacy,
  sanitizeAlertArea
} = require('../models/CommuteDisruptionAlert');
const {
  CommuteDisruption,
  Notification,
  DataProvenance,
  PROVENANCE_TIERS,
  TRANSPORT_MODES,
  DISRUPTION_TYPES,
  DISRUPTION_SEVERITIES
} = require('../models');
const {
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError
} = require('../errors');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Commute Disruption Alert Models & Contracts Test Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  const now = Date.now();

  // 1. Basic Instantiation with Valid Fields
  test('1. Instantiates valid alert with required fields and defaults', () => {
    const alert = CommuteDisruptionAlert.create({
      userId: 'usr-student-1',
      disruptionType: 'delay',
      severity: 'moderate',
      scope: {
        mode: 'train',
        lineOrRoute: 'Western Line',
        segment: 'Andheri - Bandra',
        area: 'Andheri West'
      },
      validFrom: now,
      validUntil: now + 3600000,
      title: 'Western Line 15-Minute Delays',
      message: 'Signal failure between Andheri and Bandra causing 15 min delays.',
      relevanceReason: 'Directly on your primary morning commute route to D.J. Sanghvi College.'
    });

    assert.ok(alert.id.startsWith('alert-'));
    assert.strictEqual(alert.userId, 'usr-student-1');
    assert.strictEqual(alert.disruptionType, 'delay');
    assert.strictEqual(alert.severity, 'moderate');
    assert.strictEqual(alert.status, 'active');
    assert.strictEqual(alert.isLiveFeed, false); // Honest prototype default
    assert.strictEqual(alert.scope.area, 'Andheri West');
    assert.strictEqual(alert.scope.mode, 'train');
    assert.strictEqual(alert.provenance.sourceTier, 'USER_REPORTED');
    assert.strictEqual(alert.isActive(now + 1000), true);
    assert.strictEqual(alert.isExpired(now + 1000), false);
  });

  // 2. Timestamp Validation: validUntil must be >= validFrom
  test('2. Enforces validUntil >= validFrom invariant', () => {
    assert.throws(() => {
      new CommuteDisruptionAlert({
        id: 'alert-invalid-time',
        disruptionType: 'delay',
        scope: { area: 'Dadar' },
        validFrom: now + 50000,
        validUntil: now + 10000, // Earlier than validFrom!
        title: 'Invalid Alert',
        message: 'This alert has backward time bounds',
        relevanceReason: 'Testing timestamp validation'
      });
    }, (err) => {
      return err.name === 'ZodError' || err instanceof ValidationError;
    });
  });

  // 3. Expired Disruption Handling
  test('3. Handles expired disruptions and lifecycle status transitions', () => {
    const pastStart = now - 7200000;
    const pastEnd = now - 3600000;

    // Direct instantiation with past validity expires
    const expiredAlert = CommuteDisruptionAlert.create({
      disruptionType: 'waterlogging',
      severity: 'severe',
      scope: { area: 'Milan Subway', mode: 'auto' },
      validFrom: pastStart,
      validUntil: pastEnd,
      title: 'Milan Subway Waterlogged',
      message: 'Subway closed for traffic due to heavy rain.',
      relevanceReason: 'Affects east-west commute connection'
    });

    assert.strictEqual(expiredAlert.status, 'expired');
    assert.strictEqual(expiredAlert.isActive(now), false);
    assert.strictEqual(expiredAlert.isExpired(now), true);

    // Active alert dynamically expiring via checkAndExpire
    const activeAlert = CommuteDisruptionAlert.create({
      disruptionType: 'traffic',
      scope: { area: 'JVLR', mode: 'bus' },
      validFrom: now - 1000,
      validUntil: now + 1000,
      title: 'JVLR Traffic Congestion',
      message: 'Heavy traffic between Seepz and Powai.',
      relevanceReason: 'Bus corridor delay'
    });

    assert.strictEqual(activeAlert.status, 'active');
    const didExpire = activeAlert.checkAndExpire(now + 2000);
    assert.strictEqual(didExpire, true);
    assert.strictEqual(activeAlert.status, 'expired');
    assert.strictEqual(activeAlert.isActive(now + 2000), false);
  });

  // 4. Status Lifecycle: Dismiss and Resolve
  test('4. Transitions status via dismiss() and resolve() with timestamps', () => {
    const alert = CommuteDisruptionAlert.create({
      userId: 'usr-student-1',
      disruptionType: 'cancellation',
      severity: 'high',
      scope: { area: 'Borivali', mode: 'train' },
      validFrom: now,
      validUntil: now + 3600000,
      title: 'Fast Local Cancelled',
      message: '08:42 Churchgate Fast cancelled.',
      relevanceReason: 'Your scheduled train'
    });

    const studentUser = { id: 'usr-student-1', role: 'student' };
    const dismissTime = now + 5000;
    alert.dismiss(studentUser, dismissTime);
    assert.strictEqual(alert.status, 'dismissed');
    assert.strictEqual(alert.dismissedAt, dismissTime);

    const resolveTime = now + 10000;
    alert.resolve(resolveTime);
    assert.strictEqual(alert.status, 'resolved');
    assert.strictEqual(alert.resolvedAt, resolveTime);
  });

  // 5. Privacy: Rejection of Prohibited Tracking Fields
  test('5. Rejects prohibited tracking and personal address fields', () => {
    const prohibitedPayloads = [
      { homeAddress: 'Flat 402, Sunshine Apts, Bandra West' },
      { coordinates: { lat: 19.1234, lng: 72.8567 } },
      { locationHistory: [{ lat: 19.1, lon: 72.8, timestamp: now }] },
      { deviceId: 'device-unique-id-9988' },
      { trackingPoints: ['point-1', 'point-2'] }
    ];

    for (const badField of prohibitedPayloads) {
      assert.throws(() => {
        new CommuteDisruptionAlert({
          id: 'alert-privacy-test',
          disruptionType: 'delay',
          scope: { area: 'Bandra' },
          validFrom: now,
          validUntil: now + 3600000,
          title: 'Privacy Violation Test',
          message: 'Testing forbidden tracking fields',
          relevanceReason: 'Privacy audit',
          ...badField
        });
      }, (err) => {
        return err instanceof ValidationError && err.message.includes('Privacy violation');
      });
    }
  });

  // 6. Privacy: Rejection of GPS Coordinates and Residential Identifiers in Strings
  test('6. Rejects GPS decimal coordinates and residential flat/room patterns in location strings', () => {
    // Exact GPS coordinates in scope.area
    assert.throws(() => {
      new CommuteDisruptionAlert({
        id: 'alert-coord-test',
        disruptionType: 'delay',
        scope: { area: '19.1234, 72.8456' },
        validFrom: now,
        validUntil: now + 3600000,
        title: 'Coordinate Test',
        message: 'Disruption near coords',
        relevanceReason: 'Testing coordinate rejection'
      });
    }, (err) => {
      return err instanceof ValidationError && err.message.includes('exact GPS coordinates');
    });

    // Precise flat/door number in affectedContext.originArea
    assert.throws(() => {
      new CommuteDisruptionAlert({
        id: 'alert-flat-test',
        disruptionType: 'delay',
        scope: { area: 'Vile Parle West' },
        affectedContext: {
          originArea: 'Flat 302, Gokul Building, Vile Parle'
        },
        validFrom: now,
        validUntil: now + 3600000,
        title: 'Flat Number Test',
        message: 'Disruption test',
        relevanceReason: 'Testing residential address rejection'
      });
    }, (err) => {
      return err instanceof ValidationError && err.message.includes('residential/room identifiers');
    });

    // Sanitizer test
    const sanitized = sanitizeAlertArea('Flat 402, Building 7, 19.1234, 72.8456 Andheri West 400058');
    assert.strictEqual(sanitized, 'Andheri West');
  });

  // 7. Authorization: User-Specific Alert Data Protection
  test('7. Enforces authorization safeguards on user-specific alerts', () => {
    const userAlert = CommuteDisruptionAlert.create({
      userId: 'usr-student-owner',
      disruptionType: 'delay',
      scope: { area: 'Andheri West' },
      validFrom: now,
      validUntil: now + 3600000,
      title: 'Personalized Train Delay Alert',
      message: 'Affects your 09:00 AM class at D.J. Sanghvi',
      relevanceReason: 'Class schedule match'
    });

    const ownerUser = { id: 'usr-student-owner', role: 'student' };
    const intruderUser = { id: 'usr-other-student', role: 'student' };
    const adminUser = { id: 'usr-admin-1', role: 'admin' };

    // Owner allowed
    assert.strictEqual(userAlert.assertAccess(ownerUser), true);

    // Admin allowed
    assert.strictEqual(userAlert.assertAccess(adminUser), true);

    // Other student denied with 403 Forbidden
    assert.throws(() => {
      userAlert.assertAccess(intruderUser);
    }, (err) => {
      return err instanceof ForbiddenError && err.statusCode === 403;
    });

    // Unauthenticated request denied with 401 Unauthorized
    assert.throws(() => {
      userAlert.assertAccess(null);
    }, (err) => {
      return err instanceof UnauthorizedError && err.statusCode === 401;
    });

    // Broadcast alert (userId: null) accessible to any authenticated user
    const broadcastAlert = CommuteDisruptionAlert.create({
      userId: null,
      disruptionType: 'strike',
      scope: { area: 'Mumbai Metropolitan Region', mode: 'auto' },
      validFrom: now,
      validUntil: now + 3600000,
      title: 'Auto Rickshaw Strike',
      message: 'City-wide auto strike reported',
      relevanceReason: 'General commuter advisory'
    });

    assert.strictEqual(broadcastAlert.assertAccess(intruderUser), true);
  });

  // 8. Provenance Categories & Live Feed Integrity
  test('8. Supports 4-tier provenance and rejects false live telemetry claims', () => {
    // Verified official provider
    const verifiedAlert = CommuteDisruptionAlert.create({
      disruptionType: 'maintenance',
      severity: 'severe',
      scope: { mode: 'train', lineOrRoute: 'Central Line', area: 'Kurla' },
      validFrom: now,
      validUntil: now + 7200000,
      title: 'Mega Block Announced',
      message: 'Sunday mega block between Matunga and Mulund.',
      relevanceReason: 'Weekend academic schedule impact',
      provenance: {
        sourceTier: 'VERIFIED',
        provider: 'Central Railway Official PR',
        confidence: 'HIGH'
      },
      isLiveFeed: false
    });

    assert.strictEqual(verifiedAlert.provenance.sourceTier, 'VERIFIED');
    assert.strictEqual(verifiedAlert.provenance.confidence, 'HIGH');

    // Synthetic data claiming to be a live feed must be rejected!
    assert.throws(() => {
      new CommuteDisruptionAlert({
        id: 'alert-synthetic-false-claim',
        disruptionType: 'delay',
        scope: { area: 'Dadar' },
        validFrom: now,
        validUntil: now + 3600000,
        title: 'Synthetic Live Claim',
        message: 'Claiming synthetic data is live',
        relevanceReason: 'Integrity test',
        provenance: {
          sourceTier: 'SYNTHETIC',
          provider: 'Synthetic Simulator'
        },
        isLiveFeed: true // Prohibited for SYNTHETIC!
      });
    }, (err) => {
      return err.name === 'ZodError';
    });

    // Estimated data claiming live feed also rejected
    assert.throws(() => {
      new CommuteDisruptionAlert({
        id: 'alert-estimated-false-claim',
        disruptionType: 'traffic',
        scope: { area: 'Bandra' },
        validFrom: now,
        validUntil: now + 3600000,
        title: 'Estimated Live Claim',
        message: 'Claiming estimated data is live',
        relevanceReason: 'Integrity test',
        provenance: {
          sourceTier: 'ESTIMATED',
          provider: 'Historical Model'
        },
        isLiveFeed: true // Prohibited for ESTIMATED!
      });
    }, (err) => {
      return err.name === 'ZodError';
    });
  });

  // 9. Recommended Action Contracts & Guidance
  test('9. Validates structured recommendedAction value object', () => {
    const alert = CommuteDisruptionAlert.create({
      disruptionType: 'delay',
      severity: 'severe',
      scope: { mode: 'train', lineOrRoute: 'Western Line', area: 'Andheri' },
      validFrom: now,
      validUntil: now + 3600000,
      title: 'Severe Western Line Delay',
      message: 'OHE breakdown at Andheri. Delays of 25 minutes.',
      relevanceReason: 'Primary line breakdown',
      recommendedAction: {
        actionType: 'DEPART_EARLIER',
        summary: 'Depart 25 minutes earlier or switch to Metro Line 1',
        suggestedDepartureAdjustmentMinutes: 25,
        suggestedAlternativeMode: 'metro',
        suggestedCorridor: 'Ghatkopar - Versova Metro Line 1',
        guidance: 'Avoid local train from Borivali to Andheri; take Metro 2A to D.N. Nagar instead.'
      }
    });

    assert.ok(alert.recommendedAction);
    assert.strictEqual(alert.recommendedAction.actionType, 'depart_earlier');
    assert.strictEqual(alert.recommendedAction.suggestedDepartureAdjustmentMinutes, 25);
    assert.strictEqual(alert.recommendedAction.suggestedAlternativeMode, 'metro');
    assert.strictEqual(alert.recommendedAction.suggestedCorridor, 'Ghatkopar - Versova Metro Line 1');
  });

  // 10. Route and Mode Intersection Detection
  test('10. Detects route, mode, and area intersections', () => {
    const alert = CommuteDisruptionAlert.create({
      disruptionType: 'delay',
      scope: {
        mode: 'train',
        lineOrRoute: 'Western Line',
        segment: 'Andheri - Bandra',
        area: 'Andheri West'
      },
      validFrom: now,
      validUntil: now + 3600000,
      title: 'Western Line Delay',
      message: 'Tracks flooded at Andheri West.',
      relevanceReason: 'Corridor disruption'
    });

    assert.strictEqual(alert.affectsMode('train'), true);
    assert.strictEqual(alert.affectsMode('metro'), false);
    assert.strictEqual(alert.affectsArea('Andheri West'), true);
    assert.strictEqual(alert.affectsArea('Bandra East'), false);

    // Mock Route matching
    const matchingRoute = {
      legs: [
        { mode: 'walk', fromStop: 'Home', toStop: 'Borivali Station' },
        { mode: 'train', lineName: 'Western Line Slow', fromStop: 'Borivali', toStop: 'Andheri' },
        { mode: 'walk', fromStop: 'Andheri Station', toStop: 'D.J. Sanghvi' }
      ]
    };

    const nonMatchingRoute = {
      legs: [
        { mode: 'metro', lineName: 'Metro Line 7', fromStop: 'Dahisar', toStop: 'Gundavali' },
        { mode: 'metro', lineName: 'Metro Line 1', fromStop: 'Western Express', toStop: 'D.N. Nagar' }
      ]
    };

    assert.strictEqual(alert.affectsRoute(matchingRoute), true);
    assert.strictEqual(alert.affectsRoute(nonMatchingRoute), false);
  });

  // 11. Notification Infrastructure Integration (No Duplicate Systems)
  test('11. Converts to and from Notification domain entity cleanly', () => {
    const alert = CommuteDisruptionAlert.create({
      userId: 'usr-student-42',
      disruptionType: 'service_suspension',
      severity: 'critical',
      scope: { mode: 'metro', lineOrRoute: 'Metro Line 1', area: 'Ghatkopar' },
      validFrom: now,
      validUntil: now + 7200000,
      title: 'Metro Line 1 Suspended',
      message: 'Technical fault at Ghatkopar station.',
      relevanceReason: 'Affects eastern suburban students'
    });

    // Conversion to Notification
    const notif = alert.toNotification();
    assert.ok(notif instanceof Notification);
    assert.strictEqual(notif.user_id, 'usr-student-42');
    assert.strictEqual(notif.type, 'disruption');
    assert.strictEqual(notif.priority, 'high'); // 'critical' maps to 'high'
    assert.strictEqual(notif.related_resource_type, 'commute_disruption_alert');
    assert.strictEqual(notif.related_resource_id, alert.id);
    assert.strictEqual(notif.payload.id, alert.id);
    assert.strictEqual(notif.payload.disruptionType, 'service_suspension');

    // Reconversion back from Notification
    const reconstructed = CommuteDisruptionAlert.fromNotification(notif);
    assert.ok(reconstructed instanceof CommuteDisruptionAlert);
    assert.strictEqual(reconstructed.id, alert.id);
    assert.strictEqual(reconstructed.userId, 'usr-student-42');
    assert.strictEqual(reconstructed.severity, 'critical');
    assert.strictEqual(reconstructed.scope.lineOrRoute, 'Metro Line 1');
  });

  // 12. Conversion from CommuteDisruption Entity
  test('12. Adapts from raw CommuteDisruption entity into CommuteDisruptionAlert', () => {
    const rawDisruption = CommuteDisruption.create({
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line Fast',
      affectedArea: 'Vile Parle',
      severity: 'moderate',
      description: 'Speed restrictions of 20 kmph due to track renewal.',
      durationMinutes: 90,
      estimatedDelayMinutes: 18,
      provenance: {
        sourceTier: 'USER_REPORTED',
        provider: 'Student Commuters',
        confidence: 'HIGH'
      }
    });

    const alert = CommuteDisruptionAlert.fromDisruption(rawDisruption, {
      userId: 'usr-student-100',
      relevanceReason: 'Your morning commute to D.J. Sanghvi uses Vile Parle station.',
      suggestedAlternativeMode: 'bus'
    });

    assert.ok(alert instanceof CommuteDisruptionAlert);
    assert.strictEqual(alert.userId, 'usr-student-100');
    assert.strictEqual(alert.disruptionType, 'delay');
    assert.strictEqual(alert.severity, 'moderate');
    assert.strictEqual(alert.scope.mode, 'train');
    assert.strictEqual(alert.scope.area, 'Vile Parle');
    assert.ok(alert.title.includes('TRAIN Alert'));
    assert.strictEqual(alert.recommendedAction.suggestedDepartureAdjustmentMinutes, 18);
    assert.strictEqual(alert.recommendedAction.actionType, 'depart_earlier');
  });

  // 13. Lossless JSON Serialization and Deserialization
  test('13. Serializes to JSON and round-trips without loss', () => {
    const original = CommuteDisruptionAlert.create({
      userId: 'usr-student-roundtrip',
      disruptionType: 'waterlogging',
      severity: 'severe',
      scope: {
        serviceId: 'best-bus-339',
        mode: 'bus',
        lineOrRoute: 'Route 339',
        segment: 'Juhu Tara Road',
        area: 'Juhu',
        stops: ['Juhu Beach', 'Mithibai College']
      },
      validFrom: now,
      validUntil: now + 5400000,
      title: 'Juhu Road Waterlogging',
      message: 'Waterlogging at JVPD circle. Buses diverted.',
      relevanceReason: 'Buses diverted away from college entrance',
      recommendedAction: {
        actionType: 'AVOID_CORRIDOR',
        summary: 'Avoid Juhu Tara Road; walk from Vile Parle station',
        suggestedDepartureAdjustmentMinutes: 15,
        suggestedAlternativeMode: 'walk',
        suggestedCorridor: 'Irla Road',
        guidance: 'Walk via Irla Road to avoid knee-deep water.'
      },
      affectedContext: {
        userId: 'usr-student-roundtrip',
        routeId: 'route-bus-juhu',
        originArea: 'Santacruz West',
        destinationArea: 'Vile Parle West',
        scheduledClassId: 'class-math-101',
        scheduledStartTime: now + 7200000
      }
    });

    const json = original.toJSON();
    assert.strictEqual(typeof json, 'object');
    assert.strictEqual(json.id, original.id);
    assert.strictEqual(json.scope.stops.length, 2);
    assert.strictEqual(json.recommendedAction.actionType, 'avoid_corridor');
    assert.strictEqual(json.affectedContext.scheduledClassId, 'class-math-101');

    const reconstructed = new CommuteDisruptionAlert(json);
    assert.strictEqual(reconstructed.id, original.id);
    assert.strictEqual(reconstructed.userId, original.userId);
    assert.strictEqual(reconstructed.severity, original.severity);
    assert.strictEqual(reconstructed.scope.area, original.scope.area);
    assert.strictEqual(reconstructed.recommendedAction.guidance, original.recommendedAction.guidance);
  });

  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
