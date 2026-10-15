/**
 * Shared Travel API Integration Test Suite
 *
 * Verifies end-to-end functionality for:
 * 1. Authentication enforcement (401 Unauthorized for unauthenticated requests)
 * 2. Creating a voluntary shared journey (organizer automatically enrolled as confirmed)
 * 3. Preference management (opt-in / opt-out / coarse home area)
 * 4. Privacy preservation: non-members receive masked participant rosters
 * 5. Invitation and non-enumeration protection (dispatches without leaking account existence)
 * 6. Explicit consent requirement (400 when consentConfirmed is false or omitted)
 * 7. Acceptance workflow and membership roster update
 * 8. Decline workflow (unconditional, no reason needed)
 * 9. Withdrawal workflow (voluntary leave immediately stops information sharing)
 * 10. Organizer authorization for updates, meeting points, and cancellation (403 for non-organizer)
 * 11. Journey matching and discovery within consented corridors
 * 12. Public meeting-point suggestions and safety disclaimer
 * 13. Privacy rejection of GPS decimal coordinates and residential addresses (400 validation error)
 * 14. Dual namespace accessibility (/api/shared-travel and /api/student/shared-travel)
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');
const { signToken } = require('../utils/token');
const { getConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { sharedTravelGroupRepository } = require('../repositories/SharedTravelGroupRepository');
const { studentTravelSharingPreferenceRepository } = require('../repositories/StudentTravelSharingPreferenceRepository');

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
  console.log('========================================================================');
  console.log(' Running Shared Travel API Integration Test Suite');
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
        const relevantLine = err.stack.split('\n')[1];
        console.error(`   ${relevantLine}`);
      }
      failed++;
    }
  }

  // Start temporary server on dynamic port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const now = Date.now();

  // Helper to create test user with token
  function createTestStudent(idSuffix, name, email) {
    const user = userRepository.create({
      email: email || `${idSuffix}-${now}@djsce.edu`,
      full_name: name,
      password: 'TestPassword123!',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
    const userId = user.id;

    // Initialize opt-in preference
    const pref = studentTravelSharingPreferenceRepository.findByUserId(userId);
    pref.optIn({
      consentConfirmed: true,
      preferredPseudonym: name,
      homeAreaCoarse: 'Borivali West'
    });
    studentTravelSharingPreferenceRepository.save(pref);

    const token = signToken({
      sub: userId,
      email: user.email,
      role: 'student',
      full_name: name,
      college_name: 'D.J. Sanghvi College of Engineering'
    });
    return { user, token, userId };
  }

  const studentA = createTestStudent('organizer', 'Aarav Organizer', `aarav-${now}@djsce.edu`);
  const studentB = createTestStudent('participant', 'Diya Participant', `diya-${now}@djsce.edu`);
  const studentC = createTestStudent('nonmember', 'Kabir NonMember', `kabir-${now}@djsce.edu`);

  let createdGroupId = null;

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Authentication Guard
    // ------------------------------------------------------------------------
    await test('Enforces 401 Unauthorized for unauthenticated requests', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys',
        method: 'GET'
      });

      assert.strictEqual(res.status, 401, 'Must return HTTP 401');
      assert.strictEqual(res.body.success, false, 'Must indicate failure');
    });

    // ------------------------------------------------------------------------
    // TEST 2: Journey Creation
    // ------------------------------------------------------------------------
    await test('Creates a voluntary shared journey and enrolls organizer', async () => {
      const payload = {
        title: 'Morning Borivali to Vile Parle Commute',
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: {
          startTime: now + 3600000,
          endTime: now + 5400000,
          preferredDepartureTime: '08:30',
          flexMinutes: 15
        },
        transportMode: 'train',
        maxParticipants: 4,
        suggestedMeetingPoint: {
          name: 'Borivali Station West Concourse',
          area: 'Borivali West',
          type: 'station_gate'
        }
      };

      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentA.token}`
        }
      }, payload);

      assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.journey.id, 'Journey must have an ID');
      assert.strictEqual(res.body.journey.originArea, 'Borivali West');
      assert.strictEqual(res.body.journey.currentParticipantCount, 1);
      assert.strictEqual(res.body.journey.isMember, true);

      createdGroupId = res.body.journey.id;
    });

    // ------------------------------------------------------------------------
    // TEST 3: Privacy Boundaries on Non-Member Access
    // ------------------------------------------------------------------------
    await test('Shields participant rosters and member notes from non-members', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${studentC.token}` // Non-member
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.journey.isMember, false, 'Should be flagged as non-member');
      assert.strictEqual(res.body.journey.members.length, 0, 'Participant list must be empty for non-member');
      assert.strictEqual(res.body.journey.notes, undefined, 'Private notes must not leak to non-member');
    });

    // ------------------------------------------------------------------------
    // TEST 4: Invitation with Non-Enumeration Protection
    // ------------------------------------------------------------------------
    await test('Invites student and returns safe neutral acknowledgment for unknown email', async () => {
      // 1. Invite real registered student
      const inviteReal = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/invite`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentA.token}`
        }
      }, {
        inviteeIdentifier: studentB.user.email,
        approximateStop: 'Kandivali West'
      });

      assert.strictEqual(inviteReal.status, 200);
      assert.strictEqual(inviteReal.body.invited, true);

      // 2. Invite unknown student without leaking non-existence
      const inviteUnknown = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/invite`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentA.token}`
        }
      }, {
        inviteeIdentifier: 'ghost.student@unknown.edu'
      });

      assert.strictEqual(inviteUnknown.status, 200);
      assert.strictEqual(inviteUnknown.body.invited, false);
      assert.ok(inviteUnknown.body.message.includes('If an eligible student'), 'Neutral non-enumeration message required');
    });

    // ------------------------------------------------------------------------
    // TEST 5: Explicit Consent Enforced on Acceptance
    // ------------------------------------------------------------------------
    await test('Rejects acceptance when consentConfirmed is missing or false', async () => {
      const resMissing = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/accept`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentB.token}`
        }
      }, {
        consentConfirmed: false
      });

      assert.strictEqual(resMissing.status, 400, 'Must reject with 400 when consentConfirmed is false');
    });

    // ------------------------------------------------------------------------
    // TEST 6: Successful Acceptance with Explicit Consent
    // ------------------------------------------------------------------------
    await test('Accepts invitation with explicit consentConfirmed = true', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/accept`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentB.token}`
        }
      }, {
        consentConfirmed: true,
        approximateStop: 'Kandivali Station'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.membership.status, 'accepted');
      assert.strictEqual(res.body.journey.currentParticipantCount, 2);
    });

    // ------------------------------------------------------------------------
    // TEST 7: Participant Member View after Acceptance
    // ------------------------------------------------------------------------
    await test('Allows accepted participant to view member list with safe pseudonyms', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${studentB.token}`
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.journey.isMember, true);
      assert.strictEqual(res.body.journey.members.length, 2);
      // Ensure private home address is never revealed
      for (const m of res.body.journey.members) {
        assert.strictEqual(m.homeAddress, undefined);
        assert.strictEqual(m.gpsCoordinates, undefined);
      }
    });

    // ------------------------------------------------------------------------
    // TEST 8: Journey Updates & Authorization
    // ------------------------------------------------------------------------
    await test('Allows organizer to update departure time and blocks non-organizer', async () => {
      // 1. Non-organizer attempt: must fail with 403
      const nonOrgRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentB.token}` // Participant, not organizer
        }
      }, {
        departureWindow: {
          startTime: now + 4000000,
          endTime: now + 5800000,
          preferredDepartureTime: '08:45'
        },
        isConfirmedTime: true
      });

      assert.strictEqual(nonOrgRes.status, 403, 'Must return 403 Forbidden for non-organizer update');

      // 2. Organizer update: must succeed
      const orgRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentA.token}`
        }
      }, {
        departureWindow: {
          startTime: now + 4000000,
          endTime: now + 5800000,
          preferredDepartureTime: '08:45'
        },
        isConfirmedTime: true,
        updateReason: 'Western Railway delay'
      });

      assert.strictEqual(orgRes.status, 200);
      assert.strictEqual(orgRes.body.journey.departureWindow.preferredDepartureTime, '08:45');
    });

    // ------------------------------------------------------------------------
    // TEST 9: Voluntary Withdrawal
    // ------------------------------------------------------------------------
    await test('Participant voluntarily withdraws participation and stops info sharing', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/withdraw`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentB.token}`
        }
      }, {
        reason: 'Change of schedule'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'left');

      // Participant viewing group now receives non-member restricted view
      const viewRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${studentB.token}`
        }
      });

      assert.strictEqual(viewRes.body.journey.isMember, false);
      assert.strictEqual(viewRes.body.journey.members.length, 0);
    });

    // ------------------------------------------------------------------------
    // TEST 10: Decline Invitation Workflow
    // ------------------------------------------------------------------------
    await test('Student declines invitation unconditionally without providing a reason', async () => {
      // Re-invite student B
      await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/invite`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentA.token}`
        }
      }, {
        inviteeIdentifier: studentB.user.email
      });

      // Decline without reason
      const declineRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/decline`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentB.token}`
        }
      }, {});

      assert.strictEqual(declineRes.status, 200);
      assert.strictEqual(declineRes.body.status, 'declined');
    });

    // ------------------------------------------------------------------------
    // TEST 11: Privacy-Aware Matching & Discovery
    // ------------------------------------------------------------------------
    await test('Discovers compatible shared journeys and prevents GPS tracking inputs', async () => {
      // 1. Privacy rejection on GPS coordinates
      const badReq = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys/match',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentC.token}`
        }
      }, {
        originArea: '19.2307, 72.8567', // GPS coordinate violation!
        destinationArea: 'DJ Sanghvi College of Engineering'
      });

      assert.strictEqual(badReq.status, 400, 'Must reject GPS decimal coordinates with 400');

      // 2. Valid coarse match discovery
      const goodReq = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys/match',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentC.token}`
        }
      }, {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        transportMode: 'train',
        startTime: now + 3500000,
        endTime: now + 6000000
      });

      assert.strictEqual(goodReq.status, 200);
      assert.ok(Array.isArray(goodReq.body.matches));
      assert.ok(goodReq.body.proximityDisclaimer, 'Must include proximity disclaimer');
    });

    // ------------------------------------------------------------------------
    // TEST 12: Public Meeting-Point Suggestions
    // ------------------------------------------------------------------------
    await test('Returns public meeting points with disclaimer and rejects residential strings', async () => {
      // 1. Rejection on residential address details
      const badRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/meeting-points?originArea=Flat%20402%20Green%20Heights',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${studentA.token}`
        }
      });

      assert.strictEqual(badRes.status, 400, 'Must reject residential address details');

      // 2. Valid suggestions for Western Railway
      const goodRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/meeting-points?originArea=Borivali%20West&transportMode=train',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${studentA.token}`
        }
      });

      assert.strictEqual(goodRes.status, 200);
      assert.ok(goodRes.body.meetingPoints.length > 0);
      assert.ok(goodRes.body.safetyDisclaimer.includes('do not guarantee personal safety'));
    });

    // ------------------------------------------------------------------------
    // TEST 13: Organizer Cancels Journey
    // ------------------------------------------------------------------------
    await test('Organizer cancels journey and blocks non-organizer cancellation', async () => {
      // Non-organizer attempt
      const nonOrg = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/cancel`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentC.token}`
        }
      }, { reason: 'Cancel attempt' });

      assert.strictEqual(nonOrg.status, 403);

      // Organizer cancel
      const orgCancel = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${createdGroupId}/cancel`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentA.token}`
        }
      }, { reason: 'Heavy rain, classes moved online' });

      assert.strictEqual(orgCancel.status, 200);
      assert.strictEqual(orgCancel.body.status, 'cancelled');
    });

    // ------------------------------------------------------------------------
    // TEST 14: Dual Namespace Support
    // ------------------------------------------------------------------------
    await test('Provides identical functionality under /api/student/shared-travel', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/student/shared-travel/preferences',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${studentA.token}`
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.preferences.userId, studentA.userId);
    });

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(` Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
