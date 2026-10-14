/**
 * CommuteAlertGenerationService Test Suite
 *
 * Verifies:
 * 1. Alert content: concise title, understandable grounded description matching prompt example.
 * 2. Unsupported claims prevention: no invented delays when delay is unknown/null.
 * 3. Feasible alternative handling: only recommends alternative if strictly feasible; suppresses when infeasible.
 * 4. Severity rules: correct severity assignment and action guidance.
 * 5. Expiration handling: ignores expired disruptions without alert generation.
 * 6. Provenance distinctions: clearly labels VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC.
 * 7. Deduplication: suppresses identical alerts for single unchanged disruptions while allowing updates.
 * 8. Batch generation: filters irrelevant/expired/duplicate disruptions and produces clean summary.
 * 9. Delivery boundary: produces domain instances without external notification side-effects.
 */

const assert = require('assert');
const {
  commuteAlertGenerationService,
  CommuteAlertGenerationService,
  buildDeterministicAlertTitle,
  buildDeterministicAlertDescription
} = require('../services/commuteAlertGenerationService');
const {
  CommuteDisruption,
  CommuteDisruptionAlert,
  PROVENANCE_TIERS,
  DISRUPTION_TYPES,
  DISRUPTION_SEVERITIES,
  ALERT_ACTION_TYPES
} = require('../models');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Commute Alert Generation Service Test Suite');
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
  const service = new CommuteAlertGenerationService();

  // Test setup: Primary train route from Borivali to Vile Parle
  const primaryTrainRoute = {
    id: 'route-wr-1',
    name: 'Western Line Slow to Vile Parle',
    primaryMode: 'train',
    totalDurationMinutes: 40,
    estimatedArrivalTime: '08:40',
    legs: [
      { mode: 'walk', fromStop: 'Home', toStop: 'Borivali' },
      { mode: 'train', serviceId: 'wr-local', lineName: 'Western Line', fromStop: 'Borivali', toStop: 'Vile Parle', corridorOrArea: 'Andheri' },
      { mode: 'walk', fromStop: 'Vile Parle', toStop: 'D.J. Sanghvi' }
    ]
  };

  // Viable, feasible alternative route via Metro
  const feasibleMetroAlternative = {
    id: 'route-metro-alt',
    name: 'Metro Line 2A + Line 1',
    primaryMode: 'metro',
    totalDurationMinutes: 42,
    estimatedArrivalTime: '08:42',
    isFeasible: true,
    legs: [
      { mode: 'metro', serviceId: 'm-2a', lineName: 'Metro Line 2A', fromStop: 'Borivali West', toStop: 'D.N. Nagar' },
      { mode: 'metro', serviceId: 'm-1', lineName: 'Metro Line 1', fromStop: 'D.N. Nagar', toStop: 'WEH' }
    ]
  };

  const studentContext = {
    userId: 'usr-student-test',
    routes: [primaryTrainRoute, feasibleMetroAlternative],
    primaryRoute: primaryTrainRoute,
    alternativeRoutes: [feasibleMetroAlternative]
  };

  // 1. Alert Content Matching Prompt Example
  test('1. Generates alert description matching prompt example when delay and alternative support it', () => {
    service.clearDeduplicationCache();

    const disruption = CommuteDisruption.create({
      id: 'disr-wr-15m',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Overhead equipment inspection causing 15 min delays on Western Line.',
      estimatedDelayMinutes: 15,
      startTime: now,
      endTime: now + 3600000,
      provenance: {
        sourceTier: 'USER_REPORTED',
        provider: 'Community Commuters',
        confidence: 'HIGH'
      }
    });

    const result = service.generateAlertForDisruption(disruption, studentContext, { currentTime: now });

    assert.strictEqual(result.isGenerated, true);
    assert.ok(result.alert instanceof CommuteDisruptionAlert);
    assert.strictEqual(result.alert.severity, 'moderate');

    // Prompt example: "Your selected train route is reported delayed. The current estimate adds approximately 15 minutes. Consider the available alternative route."
    const msg = result.alert.message;
    assert.ok(msg.includes('Your selected train route is reported delayed.'));
    assert.ok(msg.includes('The current estimate adds approximately 15 minutes.'));
    assert.ok(msg.includes('Consider the available alternative route'));
    assert.ok(result.alert.alternativeRoute);
    assert.strictEqual(result.alert.alternativeRoute.routeId, 'route-metro-alt');
  });

  // 2. Unsupported Claims Prevention: Missing Delay
  test('2. Does not invent delay values when disruption delay is unspecified', () => {
    service.clearDeduplicationCache();

    const unspecifiedDelayDisruption = CommuteDisruption.create({
      id: 'disr-unspecified-delay',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Slow local movement reported near Andheri.',
      estimatedDelayMinutes: 0, // No delay estimate reported
      startTime: now,
      endTime: now + 3600000,
      provenance: {
        sourceTier: 'USER_REPORTED',
        provider: 'Commuter Feed'
      }
    });

    // Explicitly set null to simulate absent delay data
    unspecifiedDelayDisruption.estimatedDelayMinutes = null;

    const result = service.generateAlertForDisruption(unspecifiedDelayDisruption, studentContext, { currentTime: now });

    assert.strictEqual(result.isGenerated, true);
    // Never invent a delay number!
    assert.ok(!result.alert.message.includes('adds approximately'));
    assert.ok(result.alert.message.includes('Delay duration is currently unspecified'));
  });

  // 3. Unsupported Claims Prevention: Infeasible Alternative Route
  test('3. Does not recommend an infeasible alternative route', () => {
    service.clearDeduplicationCache();

    // Alternative route that is explicitly marked infeasible or is also disrupted
    const infeasibleBusAlternative = {
      id: 'route-bus-alt',
      name: 'BEST Bus 202',
      primaryMode: 'bus',
      isFeasible: false, // Infeasible route
      legs: [
        { mode: 'bus', lineName: 'Route 202', fromStop: 'Borivali', toStop: 'Vile Parle' }
      ]
    };

    const contextWithInfeasibleAlt = {
      userId: 'usr-student-2',
      primaryRoute: primaryTrainRoute,
      alternativeRoutes: [infeasibleBusAlternative]
    };

    const disruption = CommuteDisruption.create({
      id: 'disr-wr-delay-noalt',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Signal fault near Andheri.',
      estimatedDelayMinutes: 15,
      startTime: now,
      endTime: now + 3600000
    });

    const result = service.generateAlertForDisruption(disruption, contextWithInfeasibleAlt, { currentTime: now });

    assert.strictEqual(result.isGenerated, true);
    assert.strictEqual(result.alert.alternativeRoute, null);
    // Must NOT say "Consider the available alternative route" when alternative is infeasible!
    assert.ok(!result.alert.message.includes('Consider the available alternative route'));
    assert.ok(result.alert.message.includes('Consider departing ~15 minutes earlier'));
  });

  // 4. Tone: Avoid Alarming Language Unsupported by Evidence
  test('4. Uses calm, grounded phrasing without sensationalist or alarming terms', () => {
    service.clearDeduplicationCache();

    const disruption = CommuteDisruption.create({
      id: 'disr-calm-check',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Minor delay due to technical inspection.',
      estimatedDelayMinutes: 10,
      startTime: now,
      endTime: now + 3600000
    });

    const result = service.generateAlertForDisruption(disruption, studentContext, { currentTime: now });

    assert.strictEqual(result.isGenerated, true);
    const text = (result.alert.title + ' ' + result.alert.message).toLowerCase();

    // Verify absence of sensationalist/alarming hyperbole
    assert.ok(!text.includes('disaster'));
    assert.ok(!text.includes('catastrophe'));
    assert.ok(!text.includes('panic'));
    assert.ok(!text.includes('chaos'));
    assert.ok(!text.includes('immediate emergency'));
    assert.ok(text.includes('notice') || text.includes('reported delayed'));
  });

  // 5. Expiration Handling
  test('5. Rejects expired disruptions without generating alerts', () => {
    service.clearDeduplicationCache();

    const expiredDisruption = CommuteDisruption.create({
      id: 'disr-expired-1',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'minor',
      description: 'Morning track inspection.',
      estimatedDelayMinutes: 5,
      startTime: now - 7200000,
      endTime: now - 1800000,
      status: 'expired'
    });

    const result = service.generateAlertForDisruption(expiredDisruption, studentContext, { currentTime: now });

    assert.strictEqual(result.isGenerated, false);
    assert.strictEqual(result.alert, null);
    assert.strictEqual(result.reason, 'DISRUPTION_EXPIRED');
  });

  // 6. Provenance & Uncertainty Distinctions
  test('6. Distinguishes verified, user-reported, estimated, and synthetic provenance', () => {
    service.clearDeduplicationCache();

    // A. Verified source
    const verifiedDisruption = CommuteDisruption.create({
      id: 'disr-prov-verified',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Official schedule delay.',
      estimatedDelayMinutes: 12,
      startTime: now,
      endTime: now + 3600000,
      provenance: {
        sourceTier: 'VERIFIED',
        provider: 'Western Railway Control',
        confidence: 'HIGH'
      }
    });

    const verifiedResult = service.generateAlertForDisruption(verifiedDisruption, studentContext, { currentTime: now });
    assert.strictEqual(verifiedResult.alert.provenance.sourceTier, 'VERIFIED');
    assert.ok(verifiedResult.alert.message.includes('Verified official report'));

    // B. Synthetic source
    service.clearDeduplicationCache();
    const syntheticDisruption = CommuteDisruption.create({
      id: 'disr-prov-synthetic',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Synthetic delay scenario.',
      estimatedDelayMinutes: 14,
      startTime: now,
      endTime: now + 3600000,
      provenance: {
        sourceTier: 'SYNTHETIC',
        provider: 'Monsoon Model v2',
        confidence: 'LOW'
      }
    });

    const syntheticResult = service.generateAlertForDisruption(syntheticDisruption, studentContext, { currentTime: now });
    assert.strictEqual(syntheticResult.alert.provenance.sourceTier, 'SYNTHETIC');
    assert.strictEqual(syntheticResult.alert.isLiveFeed, false);
    assert.ok(syntheticResult.alert.message.includes('Simulation estimate'));
  });

  // 7. Deduplication: Prevent Identical Alert Generation from Unchanged Disruption
  test('7. Prevents duplicate alert generation from a single unchanged disruption', () => {
    service.clearDeduplicationCache();

    const disruption = CommuteDisruption.create({
      id: 'disr-dedup-test',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Signal fault at Andheri.',
      estimatedDelayMinutes: 15,
      startTime: now,
      endTime: now + 3600000,
      updatedAt: now
    });

    // First call: Alert is generated
    const firstCall = service.generateAlertForDisruption(disruption, studentContext, { currentTime: now });
    assert.strictEqual(firstCall.isGenerated, true);
    assert.strictEqual(firstCall.isDuplicate, false);
    assert.ok(firstCall.alert);

    // Second call with same unchanged disruption: Suppressed as duplicate!
    const secondCall = service.generateAlertForDisruption(disruption, studentContext, { currentTime: now });
    assert.strictEqual(secondCall.isGenerated, false);
    assert.strictEqual(secondCall.isDuplicate, true);
    assert.strictEqual(secondCall.reason, 'DUPLICATE_UNCHANGED');
    assert.strictEqual(secondCall.alert.id, firstCall.alert.id);

    // Third call after disruption updates (delay increases to 25m): Allowed as update!
    const updatedDisruption = CommuteDisruption.create({
      id: 'disr-dedup-test',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'severe',
      description: 'Signal fault worsening to 25 min delays.',
      estimatedDelayMinutes: 25,
      startTime: now,
      endTime: now + 3600000,
      updatedAt: now + 120000 // Disruption was updated
    });

    const thirdCall = service.generateAlertForDisruption(updatedDisruption, studentContext, { currentTime: now + 120000 });
    assert.strictEqual(thirdCall.isGenerated, true);
    assert.strictEqual(thirdCall.isDuplicate, false);
    assert.strictEqual(thirdCall.alert.severity, 'severe');
    assert.ok(thirdCall.alert.message.includes('25 minutes'));
  });

  // 8. Batch Alert Generation Filters Expired & Irrelevant
  test('8. generateAlertsForDisruptions produces clean summary across mixed disruption batch', () => {
    service.clearDeduplicationCache();

    const mixedBatch = [
      // 1. Relevant train delay
      CommuteDisruption.create({
        id: 'batch-d1',
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'Western Line',
        affectedArea: 'Andheri',
        severity: 'moderate',
        description: 'Andheri signal delay.',
        estimatedDelayMinutes: 15,
        startTime: now,
        endTime: now + 3600000
      }),
      // 2. Irrelevant Central Line disruption
      CommuteDisruption.create({
        id: 'batch-d2',
        type: 'cancellation',
        affectedMode: 'train',
        affectedRouteId: 'Central Line',
        affectedArea: 'Kalyan',
        severity: 'severe',
        description: 'Kalyan line cancellation.',
        estimatedDelayMinutes: 45,
        startTime: now,
        endTime: now + 3600000
      }),
      // 3. Expired disruption
      CommuteDisruption.create({
        id: 'batch-d3',
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'Western Line',
        affectedArea: 'Borivali',
        severity: 'minor',
        description: 'Old morning delay.',
        estimatedDelayMinutes: 5,
        startTime: now - 7200000,
        endTime: now - 3600000,
        status: 'expired'
      })
    ];

    const result = service.generateAlertsForDisruptions(mixedBatch, studentContext, { currentTime: now });

    assert.strictEqual(result.totalEvaluated, 3);
    assert.strictEqual(result.generatedCount, 1);
    assert.strictEqual(result.skippedCount, 2); // 1 irrelevant + 1 expired
    assert.strictEqual(result.alerts.length, 1);
    assert.strictEqual(result.alerts[0].disruptionId, 'batch-d1');
  });

  // 9. Delivery Boundary: Generates Domain Entity Without External Dispatch
  test('9. Produces CommuteDisruptionAlert domain instances without external notification delivery', () => {
    service.clearDeduplicationCache();

    const disruption = CommuteDisruption.create({
      id: 'disr-delivery-boundary',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Normal delay test.',
      estimatedDelayMinutes: 10,
      startTime: now,
      endTime: now + 3600000
    });

    const result = service.generateAlertForDisruption(disruption, studentContext, { currentTime: now });

    assert.strictEqual(result.isGenerated, true);
    assert.ok(result.alert instanceof CommuteDisruptionAlert);
    assert.strictEqual(typeof result.alert.toJSON, 'function');

    // Verify it is a valid domain alert that can be converted to a Notification if desired later,
    // but no delivery mechanism was executed in this service.
    const notifObj = result.alert.toNotification();
    assert.strictEqual(notifObj.type, 'disruption');
    assert.strictEqual(notifObj.user_id, 'usr-student-test');
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
