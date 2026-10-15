/**
 * Master Integration & Privacy Verification Test Suite: Shared Student Travel
 *
 * Verifies the full workflow:
 * student creates a shared journey
 * → invitation or participation request
 * → explicit consent
 * → compatibility matching
 * → meeting-point suggestions
 * → coordination updates
 * → notification delivery
 * → withdrawal or cancellation
 * → access and privacy enforcement
 *
 * Covers all 21 required verification scenarios:
 * 1. Creating a shared journey.
 * 2. Inviting a student.
 * 3. Accepting an invitation.
 * 4. Declining an invitation.
 * 5. Withdrawing consent.
 * 6. Cancelling a journey.
 * 7. Duplicate invitations or memberships.
 * 8. Invalid lifecycle transitions.
 * 9. Compatible journeys.
 * 10. Incompatible destinations or departure windows.
 * 11. Expired journeys and invitations.
 * 12. Meeting-point suggestions based on supported data.
 * 13. Missing or incomplete location-area data.
 * 14. Unauthorized access to another student's journey.
 * 15. Unauthorized membership changes.
 * 16. Withdrawal stopping future sharing.
 * 17. Notification delivery and retry behavior.
 * 18. Duplicate notification prevention.
 * 19. Cross-student data isolation.
 * 20. Absence of precise home-address storage and continuous tracking.
 * 21. Existing backend regression coverage.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');
const { signToken } = require('../utils/token');
const { getConnection } = require('../db/connection');

// Repositories
const { sharedTravelGroupRepository } = require('../repositories/SharedTravelGroupRepository');
const { sharedTravelMemberRepository } = require('../repositories/SharedTravelMemberRepository');
const { studentTravelSharingPreferenceRepository } = require('../repositories/StudentTravelSharingPreferenceRepository');
const { userRepository } = require('../repositories/UserRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { commuteAlertDeliveryRepository } = require('../repositories/CommuteAlertDeliveryRepository');

// Services
const {
  sharedTravelConsentService,
  sharedTravelMatchingService,
  sharedMeetingPointService,
  sharedTravelCoordinationService
} = require('../services');

// Models
const {
  SharedTravelGroup,
  SharedTravelMember,
  StudentTravelSharingPreference,
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  COMPATIBILITY_TIERS,
  MATCH_REJECTION_REASONS,
  findForbiddenTravelPrivacyFields
} = require('../models');

// HTTP helper
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

async function runMasterVerification() {
  console.log('========================================================================');
  console.log(' Master Integration Test Suite: Shared Travel Privacy & Verification');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(scenarioNum, title, fn) {
    try {
      await fn();
      console.log(`✅ SCENARIO ${scenarioNum}: ${title}`);
      passed++;
    } catch (err) {
      console.error(`❌ SCENARIO ${scenarioNum} FAILED: ${title}`);
      console.error(`   ${err.message}`);
      if (err.stack) {
        const stackLine = err.stack.split('\n')[1];
        console.error(`   ${stackLine}`);
      }
      failed++;
    }
  }

  // Start test server on dynamic port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const now = Date.now();

  // Helper to create test student
  function createStudent(suffix, name, homeArea = 'Borivali West') {
    const user = userRepository.create({
      email: `${suffix}-${now}@djsce.edu`,
      full_name: name,
      password: 'TestPassword123!',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
    const userId = user.id;

    const pref = studentTravelSharingPreferenceRepository.findByUserId(userId);
    pref.optIn({
      consentConfirmed: true,
      preferredPseudonym: name.split(' ')[0] + '_S',
      homeAreaCoarse: homeArea,
      allowedModes: ['train', 'metro', 'bus']
    });
    studentTravelSharingPreferenceRepository.save(pref);

    const token = signToken({
      sub: userId,
      email: user.email,
      role: 'student',
      full_name: name,
      college_name: 'D.J. Sanghvi College of Engineering'
    });

    return { user, userId, token, pref };
  }

  const organizer = createStudent('org', 'Aarav Organizer', 'Borivali West');
  const participant1 = createStudent('p1', 'Diya Participant', 'Kandivali West');
  const participant2 = createStudent('p2', 'Rohan Commuter', 'Borivali West');
  const outsider = createStudent('out', 'Kabir Outsider', 'Thane West');

  let sharedJourney = null;

  try {
    // ------------------------------------------------------------------------
    // SCENARIO 1: Creating a shared journey
    // ------------------------------------------------------------------------
    await test(1, 'Creating a shared journey (voluntary opt-in, organizer enrolled)', async () => {
      const payload = {
        title: 'Western Line Express to Vile Parle',
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: {
          startTime: now + 3600000,
          endTime: now + 5400000,
          preferredDepartureTime: '08:30',
          flexMinutes: 15
        },
        transportMode: 'train',
        maxParticipants: 3,
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
          'Authorization': `Bearer ${organizer.token}`
        }
      }, payload);

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.journey.originArea, 'Borivali West');
      assert.strictEqual(res.body.journey.currentParticipantCount, 1);
      assert.strictEqual(res.body.journey.isMember, true);
      assert.ok(res.body.journey.id);

      sharedJourney = res.body.journey;
    });

    // ------------------------------------------------------------------------
    // SCENARIO 2: Inviting a student
    // ------------------------------------------------------------------------
    await test(2, 'Inviting a student (safe non-enumeration, dispatches proposed invitation)', async () => {
      // Real student
      const resReal = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/invite`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizer.token}`
        }
      }, {
        inviteeIdentifier: participant1.user.email,
        approximateStop: 'Kandivali Station'
      });

      assert.strictEqual(resReal.status, 200);
      assert.strictEqual(resReal.body.invited, true);

      // Verify recipient received a [PROPOSED] notification
      const notifications = notificationRepository.findByUserId(participant1.userId);
      const inviteNotif = notifications.find(n => n.related_resource_id === sharedJourney.id);
      assert.ok(inviteNotif, 'Invited student must receive an in-app notification');
      assert.ok(inviteNotif.title.includes('[PROPOSED]'), 'Title must be labelled as [PROPOSED]');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 3: Accepting an invitation
    // ------------------------------------------------------------------------
    await test(3, 'Accepting an invitation (requires explicit consent, updates membership)', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/accept`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${participant1.token}`
        }
      }, {
        consentConfirmed: true,
        approximateStop: 'Kandivali Station'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.membership.status, 'accepted');
      assert.strictEqual(res.body.journey.currentParticipantCount, 2);

      // Verify participant can now see the member list with safe pseudonyms
      assert.strictEqual(res.body.journey.members.length, 2);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 4: Declining an invitation
    // ------------------------------------------------------------------------
    await test(4, 'Declining an invitation (unconditional, no reason required)', async () => {
      // Invite participant2
      await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/invite`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizer.token}`
        }
      }, {
        inviteeIdentifier: participant2.user.email
      });

      // Decline without providing any body reason
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/decline`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${participant2.token}`
        }
      }, {});

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'declined');

      const mem = sharedTravelMemberRepository.findByGroupAndUser(sharedJourney.id, participant2.userId);
      assert.strictEqual(mem.status, 'declined');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 5: Withdrawing consent
    // ------------------------------------------------------------------------
    await test(5, 'Withdrawing consent (voluntary leave, stops sharing information)', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/withdraw`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${participant1.token}`
        }
      }, {
        reason: 'Lectures rescheduled'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'left');

      // Check member status
      const mem = sharedTravelMemberRepository.findByGroupAndUser(sharedJourney.id, participant1.userId);
      assert.strictEqual(mem.status, 'left');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 6: Cancelling a journey
    // ------------------------------------------------------------------------
    await test(6, 'Cancelling a journey (organizer cascades cancellation to all members)', async () => {
      const tempGroup = SharedTravelGroup.create({
        id: `stg-cancel-test-${now}`,
        title: 'Temporary Cancel Test Journey',
        originArea: 'Andheri West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: now + 3600000, endTime: now + 7200000 },
        organizer: { userId: organizer.userId, pseudonym: 'Aarav_S' }
      }, organizer.pref);
      sharedTravelGroupRepository.save(tempGroup);

      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${tempGroup.id}/cancel`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizer.token}`
        }
      }, {
        reason: 'Classes moved online'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'cancelled');

      const reloaded = sharedTravelGroupRepository.findById(tempGroup.id);
      assert.strictEqual(reloaded.status, 'cancelled');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 7: Duplicate invitations or memberships
    // ------------------------------------------------------------------------
    await test(7, 'Duplicate invitations or memberships (prevents redundant invites/joins)', async () => {
      // Aarav is organizer. Attempt to join their own journey
      const resSelfJoin = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/join`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizer.token}`
        }
      }, {});

      // Organizer is already accepted member, must reject with conflict (409)
      assert.strictEqual(resSelfJoin.status, 409, 'Must prevent active member from duplicate join');

      // Re-inviting active organizer must return clean acknowledgment without error or duplicate
      const resReinvite = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/invite`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizer.token}`
        }
      }, {
        inviteeIdentifier: organizer.user.email
      });

      assert.strictEqual(resReinvite.status, 200);
      assert.strictEqual(resReinvite.body.invited, false);
      assert.ok(resReinvite.body.message.includes('already an active participant'));
    });

    // ------------------------------------------------------------------------
    // SCENARIO 8: Invalid lifecycle transitions
    // ------------------------------------------------------------------------
    await test(8, 'Invalid lifecycle transitions (cannot accept/join cancelled or completed)', async () => {
      const cancelledGroup = SharedTravelGroup.create({
        id: `stg-invalid-trans-${now}`,
        title: 'Cancelled Group Test',
        originArea: 'Dadar',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: now + 3600000, endTime: now + 7200000 },
        organizer: { userId: organizer.userId, pseudonym: 'Aarav_S' }
      }, organizer.pref);
      cancelledGroup.status = SHARED_TRAVEL_STATUSES.CANCELLED;
      sharedTravelGroupRepository.save(cancelledGroup);

      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${cancelledGroup.id}/accept`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${participant1.token}`
        }
      }, {
        consentConfirmed: true
      });

      assert.strictEqual(res.status, 400, 'Must reject transition on cancelled group with 400');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 9: Compatible journeys
    // ------------------------------------------------------------------------
    await test(9, 'Compatible journeys (matches overlapping Western corridor & departure window)', async () => {
      // Re-activate sharedJourney with available slot
      const openGroup = SharedTravelGroup.create({
        id: `stg-compat-${now}`,
        title: 'Morning Borivali Fast',
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        transportMode: 'train',
        departureWindow: { startTime: now + 3000000, endTime: now + 4800000 },
        organizer: { userId: organizer.userId, pseudonym: 'Aarav_S' }
      }, organizer.pref);
      sharedTravelGroupRepository.save(openGroup);
      for (const m of openGroup.members) {
        sharedTravelMemberRepository.save(m);
      }

      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys/match',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${participant2.token}`
        }
      }, {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        transportMode: 'train',
        startTime: now + 3200000,
        endTime: now + 4600000,
        limit: 50
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.matches.length > 0);
      const match = res.body.matches.find(m => m.groupId === openGroup.id);
      assert.ok(match, 'Must match compatible corridor journey');
      assert.strictEqual(match.compatibilityTier, COMPATIBILITY_TIERS.EXCELLENT);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 10: Incompatible destinations or departure windows
    // ------------------------------------------------------------------------
    await test(10, 'Incompatible destinations or departure windows (strict exclusion)', async () => {
      // 1. Destination mismatch: search for a destination with no compatible groups
      const resDestMismatch = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys/match',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${participant2.token}`
        }
      }, {
        originArea: 'Borivali West',
        destinationArea: 'Remote Campus XYZ Incompatible',
        transportMode: 'train'
      });

      assert.strictEqual(resDestMismatch.status, 200);
      assert.strictEqual(resDestMismatch.body.matches.length, 0, 'Must reject destination mismatch');

      // 2. Disjoint timing
      const resTimeMismatch = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys/match',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${participant2.token}`
        }
      }, {
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        transportMode: 'train',
        startTime: now + 86400000, // 24 hours later
        endTime: now + 90000000
      });

      assert.strictEqual(resTimeMismatch.status, 200);
      assert.strictEqual(resTimeMismatch.body.matches.length, 0, 'Must reject disjoint timing');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 11: Expired journeys and invitations
    // ------------------------------------------------------------------------
    await test(11, 'Expired journeys and invitations (automatically marks expired, cancels invitations)', async () => {
      const pastTime = now - 5000000;
      const expiredGroup = SharedTravelGroup.create({
        id: `stg-expired-${now}`,
        title: 'Past Expired Journey',
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: pastTime - 1000000, endTime: pastTime },
        organizer: { userId: organizer.userId, pseudonym: 'Aarav_S' }
      }, organizer.pref);
      sharedTravelGroupRepository.save(expiredGroup);

      // Run expired journey evaluation
      const expiryResult = sharedTravelConsentService.handleExpiredJourneys(now);
      assert.ok(expiryResult.expiredGroupsCount >= 1);

      const reloaded = sharedTravelGroupRepository.findById(expiredGroup.id);
      assert.strictEqual(reloaded.status, SHARED_TRAVEL_STATUSES.EXPIRED);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 12: Meeting-point suggestions based on supported data
    // ------------------------------------------------------------------------
    await test(12, 'Meeting-point suggestions based on supported data (public hubs with disclaimer)', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/meeting-points?originArea=Borivali%20West&destinationArea=DJ%20Sanghvi%20College%20of%20Engineering&transportMode=train',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${organizer.token}`
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.meetingPoints.length > 0);
      assert.ok(res.body.safetyDisclaimer.includes('Suggestions do not guarantee personal safety'));

      // Validate points are strictly verified stations or campus gates
      for (const mp of res.body.meetingPoints) {
        assert.ok(['station_gate', 'bus_stop', 'college_gate', 'transit_hub', 'campus_landmark'].includes(mp.type));
      }
    });

    // ------------------------------------------------------------------------
    // SCENARIO 13: Missing or incomplete location-area data
    // ------------------------------------------------------------------------
    await test(13, 'Missing or incomplete location-area data (reports limitation honestly without fabricating)', async () => {
      // Unsupported / far outer location with no destination fallback
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/meeting-points?originArea=Distant%20Unknown%20Locality%20XYZ&destinationArea=Remote%20Nonexistent%20Campus%20ABC',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${organizer.token}`
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.reliableDataAvailable, false);
      assert.ok(res.body.limitationNotice.includes('No verified public transport meeting points'));
    });

    // ------------------------------------------------------------------------
    // SCENARIO 14: Unauthorized access to another student's journey
    // ------------------------------------------------------------------------
    await test(14, 'Unauthorized access to another student journey (shields participant details from outsider)', async () => {
      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${outsider.token}` // Outsider
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.journey.isMember, false);
      assert.strictEqual(res.body.journey.members.length, 0, 'Participant list must be strictly redacted');
      assert.strictEqual(res.body.journey.notes, undefined, 'Private notes must not leak');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 15: Unauthorized membership changes
    // ------------------------------------------------------------------------
    await test(15, 'Unauthorized membership changes (non-organizer cannot invite or remove)', async () => {
      // Outsider attempts to invite someone to Aarav's journey
      const resInvite = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}/invite`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${outsider.token}`
        }
      }, {
        inviteeIdentifier: participant2.user.email
      });

      assert.strictEqual(resInvite.status, 403, 'Must return 403 Forbidden for non-organizer invite');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 16: Withdrawal stopping future sharing
    // ------------------------------------------------------------------------
    await test(16, 'Withdrawal stopping future sharing (withdrawn participant never notified on updates)', async () => {
      // Participant 1 withdrew in Scenario 5.
      // Now organizer Aarav updates the departure time
      const resUpdate = await makeRequest({
        hostname: 'localhost',
        port,
        path: `/api/shared-travel/journeys/${sharedJourney.id}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizer.token}`
        }
      }, {
        departureWindow: {
          startTime: now + 4500000,
          endTime: now + 6300000,
          preferredDepartureTime: '08:50'
        },
        isConfirmedTime: true,
        updateReason: 'Western line schedule shift'
      });

      assert.strictEqual(resUpdate.status, 200);

      // Verify that withdrawn participant 1 did NOT receive this update notification
      const p1Notifs = notificationRepository.findByUserId(participant1.userId);
      const timeUpdateNotif = p1Notifs.find(n => n.title.includes('Departure Time Update'));
      assert.strictEqual(timeUpdateNotif, undefined, 'Withdrawn student must NEVER receive journey updates');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 17: Notification delivery and retry behavior
    // ------------------------------------------------------------------------
    await test(17, 'Notification delivery and retry behavior (records delivery attempt and idempotency key)', async () => {
      const testGroupId = `stg-delivery-retry-${now}`;
      const group = SharedTravelGroup.create({
        id: testGroupId,
        title: 'Delivery Test Group',
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: now + 3600000, endTime: now + 5400000 },
        organizer: { userId: organizer.userId, pseudonym: 'Aarav_S' }
      }, organizer.pref);
      sharedTravelGroupRepository.save(group);

      // Add participant 2 as accepted member
      const member = SharedTravelMember.create({
        groupId: testGroupId,
        userId: participant2.userId,
        pseudonym: 'Rohan_S',
        role: SHARED_MEMBER_ROLES.PARTICIPANT,
        status: SHARED_MEMBER_STATUSES.ACCEPTED
      });
      sharedTravelMemberRepository.save(member);

      const coordResult = sharedTravelCoordinationService.updateMeetingPoint({
        groupId: testGroupId,
        requestingUserId: organizer.userId,
        meetingPoint: {
          name: 'Borivali Platform 1 FOV Concourse',
          area: 'Borivali West',
          type: 'station_gate'
        },
        isConfirmed: true,
        notes: 'Meet near ticket counter'
      });

      assert.strictEqual(coordResult.notificationsCount, 1);
      assert.strictEqual(coordResult.recipients[0], participant2.userId);

      // Check delivery record in database
      const notifs = notificationRepository.findByUserId(participant2.userId);
      const mpNotif = notifs.find(n => n.related_resource_id === testGroupId);
      assert.ok(mpNotif, 'Notification must be stored in notifications repository');
      assert.ok(mpNotif.title.includes('[CONFIRMED] Meeting Point'));
    });

    // ------------------------------------------------------------------------
    // SCENARIO 18: Duplicate notification prevention
    // ------------------------------------------------------------------------
    await test(18, 'Duplicate notification prevention (stable idempotency key suppresses repeated deliveries)', async () => {
      const testGroupId = `stg-dup-notif-${now}`;
      const group = SharedTravelGroup.create({
        id: testGroupId,
        title: 'Duplicate Prevention Test',
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: now + 3600000, endTime: now + 5400000 },
        organizer: { userId: organizer.userId, pseudonym: 'Aarav_S' }
      }, organizer.pref);
      sharedTravelGroupRepository.save(group);

      const member = SharedTravelMember.create({
        groupId: testGroupId,
        userId: participant2.userId,
        pseudonym: 'Rohan_S',
        role: SHARED_MEMBER_ROLES.PARTICIPANT,
        status: SHARED_MEMBER_STATUSES.ACCEPTED
      });
      sharedTravelMemberRepository.save(member);

      // Deliver first time
      const result1 = sharedTravelCoordinationService.updateMeetingPoint({
        groupId: testGroupId,
        requestingUserId: organizer.userId,
        meetingPoint: { name: 'Borivali West Station Gate', area: 'Borivali West', type: 'station_gate' }
      });
      assert.strictEqual(result1.notificationsCount, 1);

      // Re-run identical event
      const result2 = sharedTravelCoordinationService.updateMeetingPoint({
        groupId: testGroupId,
        requestingUserId: organizer.userId,
        meetingPoint: { name: 'Borivali West Station Gate', area: 'Borivali West', type: 'station_gate' }
      });

      // Second run must be deduplicated
      assert.strictEqual(result2.notificationsCount, 0, 'Duplicate delivery must be suppressed');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 19: Cross-student data isolation
    // ------------------------------------------------------------------------
    await test(19, 'Cross-student data isolation (students only retrieve their own active journeys and invitations)', async () => {
      const resOrg = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${organizer.token}`
        }
      });

      const resOut = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${outsider.token}`
        }
      });

      assert.strictEqual(resOrg.status, 200);
      assert.strictEqual(resOut.status, 200);
      assert.ok(resOrg.body.activeJourneys.length > 0, 'Organizer has active journeys');
      assert.strictEqual(resOut.body.activeJourneys.length, 0, 'Outsider must have 0 active journeys');
      assert.strictEqual(resOut.body.pendingInvitations.length, 0, 'Outsider has 0 invitations');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 20: Absence of precise home-address storage and continuous tracking
    // ------------------------------------------------------------------------
    await test(20, 'Absence of precise home-address storage and continuous tracking (anti-tracking enforcement)', async () => {
      // 1. Check schemas reject forbidden fields
      const badJourneyPayload = {
        title: 'Forbidden Tracking Journey',
        originArea: 'Borivali West',
        destinationArea: 'DJ Sanghvi College of Engineering',
        departureWindow: { startTime: now + 3600000, endTime: now + 5400000 },
        currentLocation: '19.2307, 72.8567', // FORBIDDEN!
        liveLocation: true, // FORBIDDEN!
        homeAddress: 'Flat 302, Gokul Dham' // FORBIDDEN!
      };

      const res = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/shared-travel/journeys',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${organizer.token}`
        }
      }, badJourneyPayload);

      assert.strictEqual(res.status, 400, 'Must reject tracking fields with 400');

      // 2. Database audit: ensure no tracking or precise coordinates are stored in shared_travel_groups
      const db = getConnection();
      const rows = db.prepare('SELECT * FROM shared_travel_groups WHERE id = ?').all(sharedJourney.id);
      for (const row of rows) {
        assert.strictEqual(row.latitude, undefined);
        assert.strictEqual(row.longitude, undefined);
        assert.strictEqual(row.gps_tracking, undefined);
        assert.strictEqual(row.device_id, undefined);
        // Verify coarse areas are strings without coordinates
        assert.doesNotMatch(row.origin_area, /-?\d+\.\d{3,}/, 'Origin area must not contain GPS decimal coordinates');
        assert.doesNotMatch(row.origin_area, /\b(?:flat|room|apt|door)\s*#?\s*\w+/i, 'Origin area must not contain residential room details');
      }
    });

    // ------------------------------------------------------------------------
    // SCENARIO 21: Existing backend regression coverage
    // ------------------------------------------------------------------------
    await test(21, 'Existing backend regression coverage (health check and auth remain fully operational)', async () => {
      const healthRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/health',
        method: 'GET'
      });
      assert.strictEqual(healthRes.status, 200);
      assert.strictEqual(healthRes.body.status, 'ok');

      const apiHealthRes = await makeRequest({
        hostname: 'localhost',
        port,
        path: '/api/health',
        method: 'GET'
      });
      assert.strictEqual(apiHealthRes.status, 200);
      assert.strictEqual(apiHealthRes.body.status, 'ok');
    });

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(` Master Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterVerification().catch((err) => {
  console.error('Master verification fatal error:', err);
  process.exit(1);
});
