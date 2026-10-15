/**
 * Test Suite: Shared Travel Matching Service
 *
 * Verifies domain matching logic, compatibility evaluation, hard rejection gates,
 * timing and departure windows, missing location-area data handling, consent enforcement,
 * visibility/expiration filtering, information minimization, and privacy safeguards.
 */

const assert = require('assert');
const {
  SharedTravelMatchingService,
  sharedTravelMatchingService,
  PROXIMITY_DISCLAIMER
} = require('../services/sharedTravelMatchingService');
const {
  SharedTravelGroup,
  SharedTravelMember,
  StudentTravelSharingPreference,
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  TRAVEL_CONSENT_STATUSES,
  SHARING_VISIBILITY,
  COMPATIBILITY_TIERS,
  MATCH_REJECTION_REASONS,
  TRANSPORT_MODES
} = require('../models');
const {
  sharedTravelGroupRepository,
  sharedTravelMemberRepository,
  studentTravelSharingPreferenceRepository,
  userRepository
} = require('../repositories');
const {
  ValidationError,
  ForbiddenError,
  UnauthorizedError
} = require('../errors');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Shared Travel Matching Service Test Suite');
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
      if (err.stack) {
        console.error(`   ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
      failed++;
    }
  }

  const now = Date.now();
  const baseStart = now + 7200000; // 2 hours from now
  const baseEnd = baseStart + 1800000; // 30 min window

  // Clean up any stale test groups from previous runs
  try {
    userRepository.database.prepare("DELETE FROM shared_travel_groups WHERE id LIKE 'stg-test-%' OR id LIKE 'compat-%' OR id LIKE 'powai-%' OR id LIKE 'afternoon-%' OR id LIKE 'adjacent-%' OR id LIKE 'corridor-%' OR id LIKE 'missing-%' OR id LIKE 'dup-%' OR id LIKE 'full-%' OR id LIKE 'auto-%' OR id LIKE 'expired-%' OR id LIKE 'invite-only-%'").run();
    userRepository.database.prepare("DELETE FROM shared_travel_members WHERE group_id LIKE 'stg-test-%' OR group_id LIKE 'compat-%' OR group_id LIKE 'powai-%' OR group_id LIKE 'afternoon-%' OR group_id LIKE 'adjacent-%' OR group_id LIKE 'corridor-%' OR group_id LIKE 'missing-%' OR group_id LIKE 'dup-%' OR group_id LIKE 'full-%' OR group_id LIKE 'auto-%' OR group_id LIKE 'expired-%' OR group_id LIKE 'invite-only-%'").run();
  } catch (e) {
    // ignore
  }

  // Setup test users in user repository
  const userA = userRepository.create({
    email: `student_alpha_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Student Alpha',
    college_name: 'DJ Sanghvi College of Engineering'
  });
  const userB = userRepository.create({
    email: `student_beta_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Student Beta',
    college_name: 'DJ Sanghvi College of Engineering'
  });
  const userC = userRepository.create({
    email: `student_gamma_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Student Gamma',
    college_name: 'DJ Sanghvi College of Engineering'
  });
  const userD = userRepository.create({
    email: `student_delta_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Student Delta',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const studentA = userA.id;
  const studentB = userB.id;
  const studentC = userC.id;
  const studentD = userD.id;

  // Opt-in student A with valid coarse preferences
  const prefA = StudentTravelSharingPreference.createDefault(studentA);
  prefA.optIn({
    consentConfirmed: true,
    preferredPseudonym: 'Alpha_Commuter',
    homeAreaCoarse: 'Borivali West',
    defaultCampus: 'DJ Sanghvi College of Engineering',
    allowedModes: [TRANSPORT_MODES.TRAIN, TRANSPORT_MODES.METRO, TRANSPORT_MODES.BUS],
    visibility: SHARING_VISIBILITY.CAMPUS_ONLY
  });
  studentTravelSharingPreferenceRepository.save(prefA);

  // Opt-in student B (organizer)
  const prefB = StudentTravelSharingPreference.createDefault(studentB);
  prefB.optIn({
    consentConfirmed: true,
    preferredPseudonym: 'Beta_Organizer',
    homeAreaCoarse: 'Borivali West',
    defaultCampus: 'DJ Sanghvi College of Engineering',
    allowedModes: [TRANSPORT_MODES.TRAIN, TRANSPORT_MODES.BUS]
  });
  studentTravelSharingPreferenceRepository.save(prefB);

  // Student C: sharing NOT enabled (withdrawn consent)
  const prefC = StudentTravelSharingPreference.createDefault(studentC);
  studentTravelSharingPreferenceRepository.save(prefC);

  // Helper to create and save groups
  function createTestGroup(overrides = {}) {
    const groupId = overrides.id || `stg-test-${Math.random().toString(36).substring(2, 8)}`;
    const group = SharedTravelGroup.create({
      id: groupId,
      title: overrides.title || 'Morning Borivali Commute',
      organizer: overrides.organizer || {
        userId: studentB,
        pseudonym: 'Beta_Organizer'
      },
      originArea: overrides.originArea || 'Borivali West',
      destinationArea: overrides.destinationArea || 'DJ Sanghvi College of Engineering',
      departureWindow: overrides.departureWindow || {
        startTime: baseStart,
        endTime: baseEnd,
        preferredDepartureTime: '08:30',
        flexMinutes: 15
      },
      transportMode: overrides.transportMode || TRANSPORT_MODES.TRAIN,
      suggestedMeetingPoint: overrides.suggestedMeetingPoint || {
        name: 'Borivali Station Platform 1 Bridge',
        area: 'Borivali West',
        type: 'station_gate'
      },
      maxParticipants: overrides.maxParticipants || 4,
      status: overrides.status || SHARED_TRAVEL_STATUSES.OPEN,
      visibility: overrides.visibility || SHARING_VISIBILITY.CAMPUS_ONLY,
      notes: overrides.notes || 'Meeting near the ticket counter.',
      expiresAt: overrides.expiresAt || (baseEnd + 3600000)
    }, prefB);

    sharedTravelGroupRepository.save(group);
    for (const m of group.members) {
      sharedTravelMemberRepository.save(m);
    }
    return group;
  }

  // --------------------------------------------------------------------------
  // TEST 1: Compatible Journeys Matching & Minimal Information Return
  // --------------------------------------------------------------------------
  await test('Matches compatible shared journey and returns minimal safe view', async () => {
    const group1 = createTestGroup({
      id: `compat-grp-1-${now}`,
      title: 'Western Line Express to Campus',
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering',
      transportMode: TRANSPORT_MODES.TRAIN,
      departureWindow: {
        startTime: baseStart,
        endTime: baseEnd,
        preferredDepartureTime: '08:30',
        flexMinutes: 15
      }
    });

    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: {
          startTime: baseStart,
          endTime: baseEnd,
          preferredDepartureTime: '08:30',
          flexMinutes: 15
        },
        transportMode: TRANSPORT_MODES.TRAIN
      },
      options: { currentTime: now }
    });

    assert(Array.isArray(result.matches), 'Matches should be an array');
    const matched = result.matches.find(m => m.groupId === group1.id);
    assert(matched, 'Should match group1');
    assert(matched.compatibilityScore >= 80, `Expected score >= 80, got ${matched.compatibilityScore}`);
    assert.strictEqual(matched.compatibilityTier, COMPATIBILITY_TIERS.EXCELLENT);
    assert.strictEqual(matched.coarseOriginArea, 'Borivali West');
    assert.strictEqual(matched.coarseDestinationArea, 'DJ Sanghvi College of Engineering');
    assert.strictEqual(matched.transportMode, TRANSPORT_MODES.TRAIN);
    assert.strictEqual(matched.organizerPseudonym, 'Beta_Organizer');
    assert.strictEqual(matched.availableSlots, 3); // 4 max - 1 organizer
    assert.strictEqual(matched.totalCapacity, 4);

    // Requirement 1 & 6: Minimal information returned - NO private fields!
    assert.strictEqual(matched.organizer?.userId, undefined, 'Must not expose organizer userId');
    assert.strictEqual(matched.organizer?.email, undefined, 'Must not expose organizer email');
    assert.strictEqual(matched.members, undefined, 'Must not expose member rosters');
    assert.strictEqual(matched.notes, undefined, 'Must not expose internal group notes');

    // Requirement 7: Explain matching reasons
    assert(matched.matchExplanation.includes('Compatible commute'), 'Should provide clear explanation');
    assert(matched.matchExplanation.includes('overlapping departure window'), 'Should mention departure window');
    assert(matched.matchExplanation.includes('DJ Sanghvi College'), 'Should mention destination');

    // Requirement 9: Proximity disclaimer
    assert.strictEqual(matched.proximityDisclaimer, PROXIMITY_DISCLAIMER);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Hard Incompatibility Gate - Destination Mismatch
  // --------------------------------------------------------------------------
  await test('Rejects destination mismatch even if departure timing and origin are identical', async () => {
    // Group going to IIT Bombay (Powai)
    const powaiGroup = createTestGroup({
      id: `powai-grp-${now}`,
      title: 'Borivali to IIT Powai',
      originArea: 'Borivali West',
      destinationArea: 'IIT Bombay Powai',
      departureWindow: {
        startTime: baseStart,
        endTime: baseEnd,
        preferredDepartureTime: '08:30',
        flexMinutes: 15
      }
    });

    // Student searching for travel to DJ Sanghvi College (Vile Parle)
    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: {
          startTime: baseStart,
          endTime: baseEnd,
          preferredDepartureTime: '08:30',
          flexMinutes: 15
        }
      },
      options: { currentTime: now }
    });

    const matched = result.matches.find(m => m.groupId === powaiGroup.id);
    assert.strictEqual(matched, undefined, 'Must NOT match journey with incompatible destination');

    // Test pure evaluator explicitly
    const evalResult = sharedTravelMatchingService.evaluateJourneyCompatibility({
      studentCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd },
        allowedModes: [TRANSPORT_MODES.TRAIN]
      },
      group: powaiGroup
    });

    assert.strictEqual(evalResult.isCompatible, false);
    assert.strictEqual(evalResult.compatibilityScore, 0);
    assert.strictEqual(evalResult.rejectionReason, MATCH_REJECTION_REASONS.DESTINATION_MISMATCH);
    assert.strictEqual(evalResult.compatibilityTier, COMPATIBILITY_TIERS.INCOMPATIBLE);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Hard Incompatibility Gate - Timing / Disjoint Windows
  // --------------------------------------------------------------------------
  await test('Rejects timing mismatch when departure windows are completely disjoint', async () => {
    // Group departs 6 hours later (afternoon)
    const afternoonStart = baseStart + 6 * 3600000;
    const afternoonEnd = afternoonStart + 1800000;

    const afternoonGroup = createTestGroup({
      id: `afternoon-grp-${now}`,
      title: 'Afternoon Borivali Journey',
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering',
      departureWindow: {
        startTime: afternoonStart,
        endTime: afternoonEnd,
        preferredDepartureTime: '14:30',
        flexMinutes: 15
      }
    });

    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: {
          startTime: baseStart,
          endTime: baseEnd,
          preferredDepartureTime: '08:30',
          flexMinutes: 15
        }
      },
      options: { currentTime: now }
    });

    const matched = result.matches.find(m => m.groupId === afternoonGroup.id);
    assert.strictEqual(matched, undefined, 'Must NOT match journey with disjoint departure timing');

    // Test pure evaluator explicitly
    const evalResult = sharedTravelMatchingService.evaluateJourneyCompatibility({
      studentCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: {
          startTime: baseStart,
          endTime: baseEnd,
          preferredDepartureTime: '08:30'
        },
        allowedModes: [TRANSPORT_MODES.TRAIN]
      },
      group: afternoonGroup
    });

    assert.strictEqual(evalResult.isCompatible, false);
    assert.strictEqual(evalResult.compatibilityScore, 0);
    assert.strictEqual(evalResult.rejectionReason, MATCH_REJECTION_REASONS.TIMING_MISMATCH);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Adjacent Departure Windows within Flex Threshold
  // --------------------------------------------------------------------------
  await test('Matches adjacent departure windows within allowable flex threshold', async () => {
    // Group starts 10 minutes after student window ends (within 15-20 min flex buffer)
    const adjacentStart = baseEnd + 10 * 60000;
    const adjacentEnd = adjacentStart + 1800000;

    const adjacentGroup = createTestGroup({
      id: `adjacent-grp-${now}`,
      title: 'Slightly Later Morning Train',
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering',
      departureWindow: {
        startTime: adjacentStart,
        endTime: adjacentEnd,
        preferredDepartureTime: '09:10',
        flexMinutes: 20
      }
    });

    const evalResult = sharedTravelMatchingService.evaluateJourneyCompatibility({
      studentCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: {
          startTime: baseStart,
          endTime: baseEnd,
          preferredDepartureTime: '08:30',
          flexMinutes: 20
        },
        allowedModes: [TRANSPORT_MODES.TRAIN]
      },
      group: adjacentGroup
    });

    assert.strictEqual(evalResult.isCompatible, true);
    assert(evalResult.compatibilityScore >= 65, `Expected score >= 65 for adjacent window, got ${evalResult.compatibilityScore}`);
    assert.strictEqual(evalResult.matchFactors.timingOverlap, 'ADJACENT_WINDOW_OVERLAP');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Transport Mode Compatibility
  // --------------------------------------------------------------------------
  await test('Rejects unallowed transport mode and prefers matching mode', async () => {
    const autoGroup = createTestGroup({
      id: `auto-grp-${now}`,
      title: 'Auto Share to Campus',
      transportMode: TRANSPORT_MODES.AUTO
    });

    // Student only allows train and metro
    const evalResult = sharedTravelMatchingService.evaluateJourneyCompatibility({
      studentCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd },
        allowedModes: [TRANSPORT_MODES.TRAIN, TRANSPORT_MODES.METRO]
      },
      group: autoGroup
    });

    assert.strictEqual(evalResult.isCompatible, false);
    assert.strictEqual(evalResult.rejectionReason, MATCH_REJECTION_REASONS.MODE_MISMATCH);
    assert.strictEqual(evalResult.compatibilityScore, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Route Overlap along Suburban Rail Corridor
  // --------------------------------------------------------------------------
  await test('Recognizes corridor overlap between Kandivali and Borivali on Western Railway', async () => {
    // Group starts in Borivali West, student boards downstream in Kandivali West
    const corridorGroup = createTestGroup({
      id: `corridor-grp-${now}`,
      title: 'Western Railway Southbound',
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering'
    });

    const evalResult = sharedTravelMatchingService.evaluateJourneyCompatibility({
      studentCriteria: {
        originArea: 'Kandivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd },
        allowedModes: [TRANSPORT_MODES.TRAIN]
      },
      group: corridorGroup
    });

    assert.strictEqual(evalResult.isCompatible, true);
    assert(evalResult.compatibilityScore >= 75, `Expected high score for corridor match, got ${evalResult.compatibilityScore}`);
    assert.strictEqual(evalResult.matchFactors.originOverlap, 'SHARED_CORRIDOR_MATCH');
    assert.strictEqual(evalResult.matchFactors.routeOverlap, 'CORRIDOR_WESTERN_RAILWAY');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Missing Location-Area Data (Incomplete Data Handled Honestly)
  // --------------------------------------------------------------------------
  await test('Handles missing origin area honestly with ESTIMATED confidence flag', async () => {
    const validGroup = createTestGroup({
      id: `missing-origin-grp-${now}`,
      title: 'Generic Campus Commute'
    });

    // Student search with NO origin area provided
    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: null, // missing origin
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd }
      },
      options: { currentTime: now }
    });

    assert(result.matches.length > 0, 'Should still find matches based on destination and window');
    const matched = result.matches.find(m => m.groupId === validGroup.id);
    assert(matched, 'Should match group');

    // Requirement 8: Honest treatment of estimated data
    assert.strictEqual(matched.dataConfidence, 'ESTIMATED');
    assert.strictEqual(matched.matchFactors.originOverlap, 'ESTIMATED_ORIGIN');
    assert.strictEqual(matched.matchFactors.routeOverlap, 'UNKNOWN');
    assert(matched.matchExplanation.includes('route overlap is estimated'), 'Explanation must disclose estimation');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Withdrawn Consent / Opt-Out Enforcement
  // --------------------------------------------------------------------------
  await test('Blocks matching when student has withdrawn consent or sharing is disabled', async () => {
    // Student C has sharingEnabled = false
    let thrownError = null;
    try {
      await sharedTravelMatchingService.findCompatibleJourneys({
        studentId: studentC,
        searchCriteria: {
          destinationArea: 'DJ Sanghvi College of Engineering'
        }
      });
    } catch (err) {
      thrownError = err;
    }

    assert(thrownError instanceof ForbiddenError, 'Must throw ForbiddenError when sharing is disabled');
    assert(thrownError.message.includes('Sharing is disabled until student explicitly opts in'));
  });

  // --------------------------------------------------------------------------
  // TEST 9: Expired Journeys are Excluded
  // --------------------------------------------------------------------------
  await test('Excludes journeys whose departure window has expired', async () => {
    const pastTime = now - 3600000;
    const expiredGroup = createTestGroup({
      id: `expired-grp-${now}`,
      title: 'Past Expired Journey',
      departureWindow: {
        startTime: pastTime - 1800000,
        endTime: pastTime,
        preferredDepartureTime: '07:00'
      },
      expiresAt: pastTime
    });

    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd }
      },
      options: { currentTime: now }
    });

    const matched = result.matches.find(m => m.groupId === expiredGroup.id);
    assert.strictEqual(matched, undefined, 'Expired group must be strictly excluded');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Private / Invite-Only Journeys are Excluded from Open Matching
  // --------------------------------------------------------------------------
  await test('Excludes invite-only journeys from open matching discovery', async () => {
    const inviteOnlyGroup = createTestGroup({
      id: `invite-only-grp-${now}`,
      title: 'Private Study Group Commute',
      visibility: SHARING_VISIBILITY.INVITE_ONLY
    });

    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd }
      },
      options: { currentTime: now }
    });

    const matched = result.matches.find(m => m.groupId === inviteOnlyGroup.id);
    assert.strictEqual(matched, undefined, 'Invite-only group must NOT appear in open discovery');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Privacy Safeguard - Rejection of GPS Telemetry & Precise Addresses
  // --------------------------------------------------------------------------
  await test('Rejects GPS decimal coordinates and residential addresses in search criteria', async () => {
    let gpsError = null;
    try {
      await sharedTravelMatchingService.findCompatibleJourneys({
        studentId: studentA,
        searchCriteria: {
          originArea: '19.2307, 72.8567', // GPS coordinates
          destinationArea: 'DJ Sanghvi College'
        }
      });
    } catch (err) {
      gpsError = err;
    }
    assert(gpsError instanceof ValidationError, 'Must throw ValidationError for GPS coordinates');

    let addressError = null;
    try {
      await sharedTravelMatchingService.findCompatibleJourneys({
        studentId: studentA,
        searchCriteria: {
          originArea: 'Flat 402, Building 3, Borivali West', // Residential address
          destinationArea: 'DJ Sanghvi College'
        }
      });
    } catch (err) {
      addressError = err;
    }
    assert(addressError instanceof ValidationError, 'Must throw ValidationError for residential flat/room details');

    let trackingError = null;
    try {
      await sharedTravelMatchingService.findCompatibleJourneys({
        studentId: studentA,
        searchCriteria: {
          originArea: 'Borivali West',
          liveLocation: true // Forbidden tracking field
        }
      });
    } catch (err) {
      trackingError = err;
    }
    assert(trackingError instanceof ValidationError, 'Must throw ValidationError for forbidden tracking fields');
  });

  // --------------------------------------------------------------------------
  // TEST 12: Capacity State Enforcement
  // --------------------------------------------------------------------------
  await test('Excludes journeys that are already at maximum capacity', async () => {
    const fullGroup = createTestGroup({
      id: `full-grp-${now}`,
      title: 'Full Carpool Journey',
      maxParticipants: 2
    });

    // Add another member to reach 2/2 capacity
    const secondMember = SharedTravelMember.create({
      groupId: fullGroup.id,
      userId: studentD,
      pseudonym: 'Delta_Member',
      role: SHARED_MEMBER_ROLES.PARTICIPANT,
      status: SHARED_MEMBER_STATUSES.ACCEPTED,
      consentStatus: TRAVEL_CONSENT_STATUSES.OPTED_IN,
      consentConfirmed: true
    });
    sharedTravelMemberRepository.save(secondMember);

    const evalResult = sharedTravelMatchingService.evaluateJourneyCompatibility({
      studentCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd },
        allowedModes: [TRANSPORT_MODES.TRAIN]
      },
      group: sharedTravelGroupRepository.findById(fullGroup.id, true)
    });

    assert.strictEqual(evalResult.isCompatible, false);
    assert.strictEqual(evalResult.rejectionReason, MATCH_REJECTION_REASONS.GROUP_FULL);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Avoid Duplicate Matches
  // --------------------------------------------------------------------------
  await test('Guarantees deduplication of matches across evaluations', async () => {
    const dupGroup = createTestGroup({
      id: `dup-check-grp-${now}`,
      title: 'Deduplication Test Group'
    });

    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd }
      },
      options: { currentTime: now }
    });

    const occurrences = result.matches.filter(m => m.groupId === dupGroup.id);
    assert.strictEqual(occurrences.length, 1, 'Duplicate group must appear exactly once');
  });

  // --------------------------------------------------------------------------
  // TEST 14: Proximity Disclaimer Integrity
  // --------------------------------------------------------------------------
  await test('Does not claim students are physically nearby based on static commute preferences', async () => {
    const result = await sharedTravelMatchingService.findCompatibleJourneys({
      studentId: studentA,
      searchCriteria: {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: baseStart, endTime: baseEnd }
      },
      options: { currentTime: now }
    });

    for (const match of result.matches) {
      assert(!match.matchExplanation.toLowerCase().includes('nearby right now'), 'Must not claim live proximity');
      assert(!match.matchExplanation.toLowerCase().includes('physically close'), 'Must not claim live proximity');
      assert.strictEqual(match.proximityDisclaimer, PROXIMITY_DISCLAIMER);
    }
  });

  console.log('\n========================================================================');
  console.log(` Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Unhandled test failure:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
