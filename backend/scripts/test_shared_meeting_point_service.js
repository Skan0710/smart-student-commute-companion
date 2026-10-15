/**
 * Test Suite: Shared Meeting Point Service
 *
 * Verifies public meeting point suggestions, route and mode compatibility,
 * transparent walking time estimates, honest limitation reporting for unsupported areas,
 * consent enforcement, invite-only authorization boundaries, and privacy protections.
 */

const assert = require('assert');
const {
  SharedMeetingPointService,
  sharedMeetingPointService,
  MEETING_POINT_SAFETY_DISCLAIMER
} = require('../services/sharedMeetingPointService');
const {
  SharedTravelGroup,
  StudentTravelSharingPreference,
  SHARED_TRAVEL_STATUSES,
  SHARING_VISIBILITY,
  MEETING_POINT_TYPES,
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
  console.log(' Running Shared Meeting Point Service Test Suite');
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

  // Setup test users
  const userA = userRepository.create({
    email: `mp_student_a_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Meeting Student Alpha',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const userB = userRepository.create({
    email: `mp_student_b_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Meeting Student Beta',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const userUnopted = userRepository.create({
    email: `mp_unopted_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Unopted Student',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const studentA = userA.id;
  const studentB = userB.id;
  const studentUnopted = userUnopted.id;

  // Opt in student A
  const prefA = StudentTravelSharingPreference.createDefault(studentA);
  prefA.optIn({
    consentConfirmed: true,
    preferredPseudonym: 'Alpha_Commuter',
    homeAreaCoarse: 'Borivali West',
    defaultCampus: 'DJ Sanghvi College of Engineering',
    allowedModes: [TRANSPORT_MODES.TRAIN, TRANSPORT_MODES.METRO, TRANSPORT_MODES.BUS]
  });
  studentTravelSharingPreferenceRepository.save(prefA);

  // Opt in student B (organizer)
  const prefB = StudentTravelSharingPreference.createDefault(studentB);
  prefB.optIn({
    consentConfirmed: true,
    preferredPseudonym: 'Beta_Organizer',
    homeAreaCoarse: 'Andheri West',
    defaultCampus: 'DJ Sanghvi College of Engineering',
    allowedModes: [TRANSPORT_MODES.TRAIN, TRANSPORT_MODES.METRO]
  });
  studentTravelSharingPreferenceRepository.save(prefB);

  // Unopted student has sharing disabled
  const prefUnopted = StudentTravelSharingPreference.createDefault(studentUnopted);
  studentTravelSharingPreferenceRepository.save(prefUnopted);

  // Helper to create test groups
  function createGroup(overrides = {}) {
    const groupId = overrides.id || `stg-mp-${Math.random().toString(36).substring(2, 7)}`;
    const group = SharedTravelGroup.create({
      id: groupId,
      title: overrides.title || 'Shared Campus Commute',
      organizer: {
        userId: studentB,
        pseudonym: 'Beta_Organizer'
      },
      originArea: overrides.originArea || 'Borivali West',
      destinationArea: overrides.destinationArea || 'DJ Sanghvi College of Engineering',
      departureWindow: {
        startTime: now + 3600000,
        endTime: now + 5400000,
        preferredDepartureTime: '08:30',
        flexMinutes: 15
      },
      transportMode: overrides.transportMode || TRANSPORT_MODES.TRAIN,
      suggestedMeetingPoint: {
        name: 'Borivali Station Platform 1 Bridge',
        area: 'Borivali West',
        type: 'station_gate'
      },
      visibility: overrides.visibility || SHARING_VISIBILITY.CAMPUS_ONLY,
      status: SHARED_TRAVEL_STATUSES.OPEN
    }, prefB);

    sharedTravelGroupRepository.save(group);
    for (const m of group.members) {
      sharedTravelMemberRepository.save(m);
    }
    return group;
  }

  // --------------------------------------------------------------------------
  // TEST 1: Route & Mode Compatibility - Suggests Public Station and Campus Gates
  // --------------------------------------------------------------------------
  await test('Suggests known public station gate and campus arrival points for suburban train route', async () => {
    const result = sharedMeetingPointService.suggestMeetingPoints({
      studentId: studentA,
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering',
      transportMode: TRANSPORT_MODES.TRAIN
    });

    assert.strictEqual(result.reliableDataAvailable, true);
    assert(Array.isArray(result.meetingPoints), 'Should return an array of meeting points');
    assert(result.meetingPoints.length >= 2, 'Should return at least departure and destination meeting points');

    // Origin departure meeting point check
    const borivaliPoint = result.meetingPoints.find(p => p.area === 'Borivali West');
    assert(borivaliPoint, 'Should include Borivali West station gate');
    assert.strictEqual(borivaliPoint.type, 'station_gate');
    assert.strictEqual(borivaliPoint.isSupportedPublicPlace, true);
    assert(borivaliPoint.convenienceReason.includes('Western Railway'), 'Should explain transit convenience');
    assert(borivaliPoint.walkingTimeLabel.includes('Estimated'), 'Should clearly label estimated access time');
    assert.strictEqual(borivaliPoint.walkingTimeConfidence, 'ESTIMATED');

    // Campus arrival meeting point check
    const campusPoint = result.meetingPoints.find(p => p.name.includes('D.J. Sanghvi College'));
    assert(campusPoint, 'Should include D.J. Sanghvi College entrance gate');
    assert.strictEqual(campusPoint.type, 'college_gate');
    assert(campusPoint.convenienceReason.includes('security booth'), 'Should explain campus gate convenience');

    // Requirement 7: Explicit safety disclaimer present
    assert.strictEqual(result.safetyDisclaimer, MEETING_POINT_SAFETY_DISCLAIMER);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Multimodal Metro Accessibility
  // --------------------------------------------------------------------------
  await test('Suggests metro concourse and transit interchange for Metro Line 1 route', async () => {
    const result = sharedMeetingPointService.suggestMeetingPoints({
      studentId: studentA,
      originArea: 'Andheri West',
      destinationArea: 'Ghatkopar West',
      transportMode: TRANSPORT_MODES.METRO
    });

    assert.strictEqual(result.reliableDataAvailable, true);
    const metroPoint = result.meetingPoints.find(p => p.name.includes('Metro'));
    assert(metroPoint, 'Should suggest verified metro concourse gate');
    assert.strictEqual(metroPoint.type, 'transit_hub');
    assert.strictEqual(metroPoint.transportMode, TRANSPORT_MODES.METRO);
    assert(metroPoint.convenienceReason.includes('Metro Line 1'), 'Should explain metro interchange convenience');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Transparent Labeled Walking Times
  // --------------------------------------------------------------------------
  await test('Clearly labels estimated walking times and includes disclaimer on all suggestions', async () => {
    const result = sharedMeetingPointService.suggestMeetingPoints({
      studentId: studentA,
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering'
    });

    for (const pt of result.meetingPoints) {
      assert(typeof pt.estimatedWalkingTimeMinutes === 'number', 'Walking minutes must be a number');
      assert(typeof pt.walkingTimeLabel === 'string', 'Walking label must be a string');
      assert.strictEqual(pt.walkingTimeConfidence, 'ESTIMATED', 'Confidence must be ESTIMATED');
      assert(pt.accessNote.includes('standard pedestrian speeds'), 'Must include pedestrian estimation note');
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: Missing Location Data Handled Gracefully
  // --------------------------------------------------------------------------
  await test('Handles missing origin area gracefully by falling back to campus destination points', async () => {
    const result = sharedMeetingPointService.suggestMeetingPoints({
      studentId: studentA,
      originArea: null, // missing origin
      destinationArea: 'DJ Sanghvi College of Engineering'
    });

    assert.strictEqual(result.reliableDataAvailable, true);
    assert(result.meetingPoints.length > 0, 'Should propose destination meeting point');
    const campusPoint = result.meetingPoints.find(p => p.type === 'college_gate');
    assert(campusPoint, 'Should suggest campus gate when origin is omitted');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Unsupported Area (Honest Limitation Reporting - No Fabrication!)
  // --------------------------------------------------------------------------
  await test('Reports limitation honestly and does NOT fabricate meeting points for unsupported areas', async () => {
    // Unmapped / distant area without public transit hub data
    const result = sharedMeetingPointService.suggestMeetingPoints({
      studentId: studentA,
      originArea: 'Distant Unknown Locality XYZ',
      destinationArea: 'Remote Nonexistent Campus ABC'
    });

    assert.strictEqual(result.reliableDataAvailable, false);
    assert.strictEqual(result.meetingPoints.length, 0, 'Must NOT fabricate fake meeting points');
    assert(result.limitationNotice.includes('No verified public transport meeting points'), 'Must report limitation honestly');
    assert(result.limitationNotice.includes('never fabricated'), 'Must explicitly confirm no fabrication');
    assert.strictEqual(result.safetyDisclaimer, MEETING_POINT_SAFETY_DISCLAIMER);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Privacy Boundaries - Rejection of GPS Telemetry & Precise Addresses
  // --------------------------------------------------------------------------
  await test('Rejects GPS decimal coordinates and residential addresses in meeting point requests', async () => {
    let gpsError = null;
    try {
      sharedMeetingPointService.suggestMeetingPoints({
        studentId: studentA,
        originArea: '19.2307, 72.8567' // GPS decimal coordinates
      });
    } catch (err) {
      gpsError = err;
    }
    assert(gpsError instanceof ValidationError, 'Must reject GPS decimal coordinates');

    let residentialError = null;
    try {
      sharedMeetingPointService.suggestMeetingPoints({
        studentId: studentA,
        originArea: 'Flat 402, Building 3, Borivali West' // Granular residential room/flat
      });
    } catch (err) {
      residentialError = err;
    }
    assert(residentialError instanceof ValidationError, 'Must reject residential addresses');

    let trackingError = null;
    try {
      sharedMeetingPointService.suggestMeetingPoints({
        studentId: studentA,
        originArea: 'Borivali West',
        options: { liveLocation: true } // Forbidden tracking field
      });
    } catch (err) {
      trackingError = err;
    }
    assert(trackingError instanceof ValidationError, 'Must reject forbidden tracking fields');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Consent Enforcement - Non-Consenting Users Blocked
  // --------------------------------------------------------------------------
  await test('Blocks meeting point suggestions when student has sharing disabled', async () => {
    let consentError = null;
    try {
      sharedMeetingPointService.suggestMeetingPoints({
        studentId: studentUnopted,
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering'
      });
    } catch (err) {
      consentError = err;
    }

    assert(consentError instanceof ForbiddenError, 'Must throw ForbiddenError for non-consenting user');
    assert(consentError.message.includes('Sharing is disabled until student explicitly opts in'));
  });

  // --------------------------------------------------------------------------
  // TEST 8: Authorization Boundaries - Invite-Only Journey Protection
  // --------------------------------------------------------------------------
  await test('Restricts invite-only journey meeting points to authorized participants', async () => {
    const inviteOnlyGroup = createGroup({
      id: `private-group-${now}`,
      title: 'Private Study Journey',
      visibility: SHARING_VISIBILITY.INVITE_ONLY
    });

    // Student A is NOT a member of student B's invite-only group
    let authError = null;
    try {
      sharedMeetingPointService.suggestMeetingPoints({
        studentId: studentA,
        groupId: inviteOnlyGroup.id
      });
    } catch (err) {
      authError = err;
    }

    assert(authError instanceof ForbiddenError, 'Must block non-members from invite-only group meeting points');
    assert(authError.message.includes('restricted to confirmed participants'));
  });

  // --------------------------------------------------------------------------
  // TEST 9: Group Context Inheritance
  // --------------------------------------------------------------------------
  await test('Inherits commute origin, destination, and mode when groupId is provided', async () => {
    const campusGroup = createGroup({
      id: `campus-group-${now}`,
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering',
      transportMode: TRANSPORT_MODES.TRAIN,
      visibility: SHARING_VISIBILITY.CAMPUS_ONLY
    });

    const result = sharedMeetingPointService.suggestMeetingPoints({
      studentId: studentA,
      groupId: campusGroup.id
    });

    assert.strictEqual(result.reliableDataAvailable, true);
    assert(result.meetingPoints.length > 0);
    assert.strictEqual(result.evaluatedCriteria.coarseOriginArea, 'Borivali West');
    assert.strictEqual(result.evaluatedCriteria.transportMode, TRANSPORT_MODES.TRAIN);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Meeting Point Validation (validateMeetingPoint)
  // --------------------------------------------------------------------------
  await test('Validates safe public meeting points and rejects residential/coordinate violations', async () => {
    // Valid public station gate
    const validCheck = sharedMeetingPointService.validateMeetingPoint({
      name: 'Borivali Station West Booking Gate',
      area: 'Borivali West',
      landmark: 'Platform 1 Foot Overbridge',
      type: 'station_gate'
    });
    assert.strictEqual(validCheck.isValid, true);
    assert.strictEqual(validCheck.issues.length, 0);
    assert.strictEqual(validCheck.sanitized.name, 'Borivali Station West Booking Gate');

    // Invalid: contains residential flat/room
    const residentialCheck = sharedMeetingPointService.validateMeetingPoint({
      name: 'Flat 102 Gate',
      area: 'Borivali West',
      type: 'station_gate'
    });
    assert.strictEqual(residentialCheck.isValid, false);
    assert(residentialCheck.issues[0].includes('residential address details'));

    // Invalid: contains GPS coordinates
    const gpsCheck = sharedMeetingPointService.validateMeetingPoint({
      name: '19.234, 72.845 Gate',
      area: 'Borivali West',
      type: 'station_gate'
    });
    assert.strictEqual(gpsCheck.isValid, false);
    assert(gpsCheck.issues[0].includes('exact GPS coordinates'));

    // Invalid: unsupported meeting point type
    const typeCheck = sharedMeetingPointService.validateMeetingPoint({
      name: 'Private Bedroom Hub',
      area: 'Borivali West',
      type: 'private_residence'
    });
    assert.strictEqual(typeCheck.isValid, false);
    assert(typeCheck.issues[0].includes('Invalid meeting point type'));
  });

  // --------------------------------------------------------------------------
  // TEST 11: Safety Disclaimer Integrity (No Guaranteed Safety Claims)
  // --------------------------------------------------------------------------
  await test('Ensures meeting points never claim to guarantee personal safety', async () => {
    const points = sharedMeetingPointService.getKnownPublicMeetingPoints({ area: 'Vile Parle West' });
    assert(points.length > 0, 'Should find known public meeting points in Vile Parle');

    for (const pt of points) {
      assert(!pt.convenienceReason.toLowerCase().includes('guaranteed safe'), 'Must not claim guaranteed safety');
      assert(!pt.convenienceReason.toLowerCase().includes('100% safe'), 'Must not claim 100% safe');
      assert(pt.isSupportedPublicPlace === true, 'Must be marked as supported public place');
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
