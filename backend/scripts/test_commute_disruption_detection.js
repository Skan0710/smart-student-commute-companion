/**
 * CommuteDisruptionDetectionService Test Suite
 *
 * Verifies:
 * 1. Relevant disruption detection (train delays, bus cancellations, road traffic).
 * 2. Irrelevant disruption filtering (different corridors, unrelated modes, different suburbs).
 * 3. Expired disruption rejection (past endTime, expired status).
 * 4. Infeasibility triggers (service suspension, arrival deadline violation, class start conflict).
 * 5. Academic schedule integration (punctuality buffer loss, class start overrun).
 * 6. Multiple simultaneous disruptions handling and batch summary.
 * 7. Recommendation re-evaluation and alternative route pivot.
 * 8. Provenance preservation and qualitative uncertainty (no false live claims).
 * 9. Generation of valid CommuteDisruptionAlert domain instances.
 */

const assert = require('assert');
const {
  commuteDisruptionDetectionService,
  CommuteDisruptionDetectionService
} = require('../services/commuteDisruptionDetectionService');
const {
  CommuteDisruption,
  CommuteDisruptionAlert,
  PROVENANCE_TIERS,
  DISRUPTION_TYPES,
  DISRUPTION_SEVERITIES
} = require('../models');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Commute Disruption Detection Service Test Suite');
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

  // Standard Mock Routes for a student commuting from Borivali to D.J. Sanghvi College (Vile Parle)
  const primaryTrainRoute = {
    id: 'route-train-western',
    name: 'Western Line Slow to Vile Parle',
    primaryMode: 'train',
    totalDurationMinutes: 40,
    estimatedArrivalTime: '08:40',
    legs: [
      { mode: 'walk', fromStop: 'Borivali Home', toStop: 'Borivali Station', durationMinutes: 5 },
      {
        mode: 'train',
        serviceId: 'wr-suburban-local',
        lineName: 'Western Line',
        fromStop: 'Borivali',
        toStop: 'Vile Parle',
        corridorOrArea: 'Andheri',
        durationMinutes: 28
      },
      { mode: 'walk', fromStop: 'Vile Parle Station', toStop: 'D.J. Sanghvi College', durationMinutes: 7 }
    ]
  };

  const alternativeMetroRoute = {
    id: 'route-metro-combo',
    name: 'Metro Line 2A + Metro Line 1',
    primaryMode: 'metro',
    totalDurationMinutes: 45,
    estimatedArrivalTime: '08:45',
    legs: [
      { mode: 'walk', fromStop: 'Borivali Home', toStop: 'Borivali West Metro', durationMinutes: 4 },
      { mode: 'metro', serviceId: 'metro-2a', lineName: 'Metro Line 2A', fromStop: 'Borivali West', toStop: 'D.N. Nagar', durationMinutes: 26 },
      { mode: 'metro', serviceId: 'metro-1', lineName: 'Metro Line 1', fromStop: 'D.N. Nagar', toStop: 'Western Express Highway', durationMinutes: 8 },
      { mode: 'walk', fromStop: 'WEH Station', toStop: 'D.J. Sanghvi College', durationMinutes: 7 }
    ]
  };

  const studentContext = {
    userId: 'usr-student-djsce-1',
    routes: [primaryTrainRoute, alternativeMetroRoute],
    primaryRoute: primaryTrainRoute,
    alternativeRoutes: [alternativeMetroRoute],
    preferences: {
      preferredModes: ['train', 'metro', 'walk'],
      walkingToleranceMinutes: 20
    },
    academicScheduleContext: {
      classId: 'class-algorithms-101',
      className: 'Algorithms & Data Structures',
      classStartTime: '09:00',
      campusDestination: 'D.J. Sanghvi College',
      isExamDay: false
    }
  };

  // 1. Relevant Disruption - Train Delays on Primary Route
  test('1. Detects relevant train delay on primary route corridor', () => {
    const westernDelay = CommuteDisruption.create({
      id: 'disr-wr-delay-1',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Signal failure near Andheri causing 15 min delays on Western Line slow corridor.',
      estimatedDelayMinutes: 15,
      startTime: now - 600000,
      endTime: now + 3600000,
      provenance: {
        sourceTier: 'USER_REPORTED',
        provider: 'M-Indicator Community',
        confidence: 'HIGH'
      }
    });

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(westernDelay, studentContext, {
      currentTime: now,
      delayThresholdMinutes: 10
    });

    assert.strictEqual(verdict.isRelevant, true);
    assert.strictEqual(verdict.reasonCode, 'PRIMARY_ROUTE_DELAYED');
    assert.strictEqual(verdict.impactDetails.isPrimaryRouteImpacted, true);
    assert.strictEqual(verdict.impactDetails.addedDelayMinutes, 15);
    assert.strictEqual(verdict.impactDetails.materialDelay, true);
    assert.strictEqual(verdict.recommendedAction.actionType, 'depart_earlier');
    assert.ok(verdict.relevanceReason.includes('Western Line'));
    assert.ok(verdict.alert instanceof CommuteDisruptionAlert);
  });

  // 2. Irrelevant Disruption - Unrelated Transport Mode and Corridor
  test('2. Correctly flags unrelated disruption in a different suburb as irrelevant', () => {
    // Disruption on Central Line in Thane / Kalyan
    const centralDisruption = CommuteDisruption.create({
      id: 'disr-cr-delay-1',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Central Line',
      affectedArea: 'Thane',
      severity: 'severe',
      description: 'Overhead wire issue between Mulund and Thane.',
      estimatedDelayMinutes: 30,
      startTime: now - 600000,
      endTime: now + 3600000
    });

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(centralDisruption, studentContext, {
      currentTime: now
    });

    assert.strictEqual(verdict.isRelevant, false);
    assert.strictEqual(verdict.reasonCode, 'UNRELATED_ROUTE');
    assert.strictEqual(verdict.relevanceScore, 0);
    assert.strictEqual(verdict.alert, null);
    assert.ok(verdict.relevanceReason.includes('does not intersect'));
  });

  // 3. Expired Disruption - Must Be Ignored
  test('3. Ignores expired disruptions whose validity time has passed', () => {
    const expiredDisruption = CommuteDisruption.create({
      id: 'disr-past-wr',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Morning track inspection delay (completed).',
      estimatedDelayMinutes: 10,
      startTime: now - 7200000,
      endTime: now - 1800000, // Ended 30 minutes ago
      status: 'expired'
    });

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(expiredDisruption, studentContext, {
      currentTime: now
    });

    assert.strictEqual(verdict.isRelevant, false);
    assert.strictEqual(verdict.reasonCode, 'EXPIRED');
    assert.strictEqual(verdict.isExpired, true);
  });

  // 4. Bus Unavailability & Service Suspension
  test('4. Detects bus cancellation / service suspension causing route infeasibility', () => {
    const busRoute = {
      id: 'route-best-bus',
      name: 'BEST Bus 339 to Juhu',
      primaryMode: 'bus',
      totalDurationMinutes: 50,
      legs: [
        { mode: 'walk', fromStop: 'Home', toStop: 'Bus Stop' },
        { mode: 'bus', serviceId: 'bus-339', lineName: 'Route 339', corridorOrArea: 'Juhu Tara Road' },
        { mode: 'walk', fromStop: 'Mithibai', toStop: 'D.J. Sanghvi' }
      ]
    };

    const busSuspension = CommuteDisruption.create({
      id: 'disr-bus-waterlogging',
      type: 'service_suspension',
      affectedMode: 'bus',
      affectedRouteId: 'Route 339',
      affectedArea: 'Juhu',
      severity: 'critical',
      description: 'Route 339 suspended due to waist-deep waterlogging at JVPD Circle.',
      estimatedDelayMinutes: 45,
      startTime: now,
      endTime: now + 3600000
    });

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(busSuspension, {
      userId: 'usr-student-1',
      routes: [busRoute],
      primaryRoute: busRoute
    }, { currentTime: now });

    assert.strictEqual(verdict.isRelevant, true);
    assert.strictEqual(verdict.reasonCode, 'ROUTE_INFEASIBLE');
    assert.strictEqual(verdict.impactDetails.causesInfeasibility, true);
    assert.ok(verdict.impactDetails.infeasibilityReason.includes('SERVICE_SUSPENDED'));
    assert.ok(verdict.relevanceReason.includes('suspends your primary BUS leg'));
  });

  // 5. Road Traffic on Commute Corridor
  test('5. Detects road traffic congestion along bus or auto corridor', () => {
    const autoRoute = {
      id: 'route-auto-svroad',
      primaryMode: 'auto',
      totalDurationMinutes: 30,
      legs: [
        { mode: 'auto', corridorOrArea: 'S.V. Road', from: 'Santacruz', to: 'Vile Parle', durationMinutes: 25 }
      ]
    };

    const trafficDisruption = CommuteDisruption.create({
      id: 'disr-traffic-svroad',
      type: 'traffic',
      affectedMode: 'auto',
      affectedArea: 'S.V. Road',
      severity: 'severe',
      description: 'Severe traffic bottleneck on S.V. Road near Milan Mall.',
      estimatedDelayMinutes: 20,
      startTime: now,
      endTime: now + 3600000
    });

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(trafficDisruption, {
      userId: 'usr-student-auto',
      routes: [autoRoute],
      primaryRoute: autoRoute
    }, { currentTime: now });

    assert.strictEqual(verdict.isRelevant, true);
    assert.strictEqual(verdict.impactDetails.isPrimaryRouteImpacted, true);
    assert.strictEqual(verdict.recommendedAction.actionType, 'avoid_corridor');
    assert.ok(verdict.recommendedAction.summary.includes('Avoid S.V. Road'));
  });

  // 6. Infeasibility: Delay Causes Arrival After Scheduled Class Start
  test('6. Flags disruption causing arrival after scheduled class start time', () => {
    // Primary route baseline arrives at 08:45. Class starts at 09:00.
    // Disruption adds 25 minutes delay -> 09:10 arrival (10 minutes after class start!)
    const severeDelay = CommuteDisruption.create({
      id: 'disr-severe-wr',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'severe',
      description: 'Major signal failure. Trains running 25 minutes late.',
      estimatedDelayMinutes: 25,
      startTime: now,
      endTime: now + 3600000
    });

    const contextWithTightClass = {
      ...studentContext,
      academicScheduleContext: {
        classId: 'class-os-201',
        classStartTime: '09:00',
        campusDestination: 'D.J. Sanghvi College'
      }
    };

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(severeDelay, contextWithTightClass, {
      currentTime: now
    });

    assert.strictEqual(verdict.isRelevant, true);
    assert.strictEqual(verdict.impactDetails.causesInfeasibility, true);
    assert.strictEqual(verdict.academicImpact.hasAcademicConflict, true);
    assert.ok(verdict.impactDetails.infeasibilityReason.includes('ARRIVAL_AFTER_CLASS_START'));
    assert.ok(verdict.relevanceReason.includes('miss your 09:00 class'));
  });

  // 7. Infeasibility: Delay Violates Explicit Arrival Deadline
  test('7. Flags disruption causing primary route to violate desiredArrivalTime deadline', () => {
    const delayDisruption = CommuteDisruption.create({
      id: 'disr-deadline-violation',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Slow local trains delayed by 15 mins.',
      estimatedDelayMinutes: 15,
      startTime: now,
      endTime: now + 3600000
    });

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(delayDisruption, studentContext, {
      currentTime: now,
      desiredArrivalTime: '08:50' // Baseline is 08:40 + 15m = 08:55 (> 08:50!)
    });

    assert.strictEqual(verdict.isRelevant, true);
    assert.strictEqual(verdict.impactDetails.causesInfeasibility, true);
    assert.ok(verdict.impactDetails.infeasibilityReason.includes('ARRIVAL_TOO_LATE'));
  });

  // 8. Multiple Disruptions Batch Detection
  test('8. Evaluates multiple simultaneous disruptions and produces correct impact summary', () => {
    const disruptions = [
      // Relevant disruption on primary route
      CommuteDisruption.create({
        id: 'disr-1',
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'Western Line',
        affectedArea: 'Andheri',
        severity: 'moderate',
        description: 'Western Line signal delay near Andheri.',
        estimatedDelayMinutes: 15,
        startTime: now,
        endTime: now + 3600000
      }),
      // Irrelevant disruption on Central Line
      CommuteDisruption.create({
        id: 'disr-2',
        type: 'cancellation',
        affectedMode: 'train',
        affectedRouteId: 'Central Line',
        affectedArea: 'Kalyan',
        severity: 'severe',
        description: 'Central Railway train cancellation at Kalyan.',
        estimatedDelayMinutes: 40,
        startTime: now,
        endTime: now + 3600000
      }),
      // Expired disruption
      CommuteDisruption.create({
        id: 'disr-3',
        type: 'delay',
        affectedMode: 'train',
        affectedRouteId: 'Western Line',
        affectedArea: 'Borivali',
        severity: 'minor',
        description: 'Past platform delay resolved.',
        estimatedDelayMinutes: 5,
        startTime: now - 7200000,
        endTime: now - 3600000,
        status: 'expired'
      })
    ];

    const batch = commuteDisruptionDetectionService.detectRelevantDisruptions({
      ...studentContext,
      disruptions,
      options: { currentTime: now, delayThresholdMinutes: 10 }
    });

    assert.strictEqual(batch.totalEvaluated, 3);
    assert.strictEqual(batch.relevantCount, 1);
    assert.strictEqual(batch.hasRelevantDisruptions, true);
    assert.strictEqual(batch.impactSummary.primaryRouteImpacted, true);
    assert.strictEqual(batch.impactSummary.maxAddedDelayMinutes, 15);
    assert.strictEqual(batch.impactSummary.materialDelayDetected, true);
    assert.strictEqual(batch.generatedAlerts.length, 1);
    assert.strictEqual(batch.generatedAlerts[0].disruptionId, 'disr-1');
  });

  // 9. Re-evaluating Recommendation with Infeasible Primary Route Pivots to Alternative
  test('9. Re-evaluates recommendation and pivots to viable alternative route', () => {
    // Severe track waterlogging at Milan Subway shuts down primary route
    const severeTrackClosure = CommuteDisruption.create({
      id: 'disr-track-closure',
      type: 'route_closure',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'critical',
      description: 'Waterlogging on tracks between Santacruz and Vile Parle. Western Railway suspended.',
      estimatedDelayMinutes: 60,
      startTime: now,
      endTime: now + 7200000
    });

    const recommendation = {
      selectedRoute: primaryTrainRoute,
      meaningfulAlternatives: [alternativeMetroRoute]
    };

    const reEval = commuteDisruptionDetectionService.reEvaluateRecommendationWithDisruption(
      recommendation,
      [severeTrackClosure],
      { currentTime: now }
    );

    assert.strictEqual(reEval.originalPrimaryRouteId, 'route-train-western');
    assert.strictEqual(reEval.updatedPrimaryRouteId, 'route-metro-combo');
    assert.strictEqual(reEval.isPivotedToAlternative, true);
    assert.ok(reEval.pivotReason.includes('became infeasible due to disruption'));
  });

  // 10. Provenance Preservation and Qualitative Uncertainty
  test('10. Preserves provenance tiers and qualitative uncertainty without false live claims', () => {
    // Synthetic disruption
    const syntheticDisruption = CommuteDisruption.create({
      id: 'disr-synthetic',
      type: 'delay',
      affectedMode: 'train',
      affectedRouteId: 'Western Line',
      affectedArea: 'Andheri',
      severity: 'moderate',
      description: 'Simulated monsoon delay pattern.',
      estimatedDelayMinutes: 12,
      startTime: now,
      endTime: now + 3600000,
      provenance: {
        sourceTier: 'SYNTHETIC',
        provider: 'Monsoon Scenario Simulator',
        confidence: 'LOW'
      }
    });

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(syntheticDisruption, studentContext, {
      currentTime: now
    });

    assert.strictEqual(verdict.provenance.sourceTier, 'SYNTHETIC');
    assert.strictEqual(verdict.uncertainty.hasSyntheticData, true);
    assert.strictEqual(verdict.uncertainty.level, 'HIGH');
    assert.strictEqual(verdict.uncertainty.isLiveFeed, false);
  });

  // 11. Disruption Matching Student Preferences When No Route Planned
  test('11. Matches campus destination and preferred modes when no planned route exists', () => {
    const campusDisruption = CommuteDisruption.create({
      id: 'disr-campus-auto',
      type: 'strike',
      affectedMode: 'auto',
      affectedArea: 'Vile Parle',
      severity: 'severe',
      description: 'Auto rickshaw flash strike near Vile Parle West stations.',
      startTime: now,
      endTime: now + 3600000
    });

    const contextNoRoutes = {
      userId: 'usr-student-noroute',
      routes: [],
      preferences: {
        preferredModes: ['auto', 'train']
      },
      academicScheduleContext: {
        campusDestination: 'Vile Parle West (D.J. Sanghvi)'
      }
    };

    const verdict = commuteDisruptionDetectionService.isDisruptionRelevant(campusDisruption, contextNoRoutes, {
      currentTime: now
    });

    assert.strictEqual(verdict.isRelevant, true);
    assert.strictEqual(verdict.reasonCode, 'CAMPUS_AREA_MATCH');
    assert.ok(verdict.relevanceReason.includes('Vile Parle'));
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
