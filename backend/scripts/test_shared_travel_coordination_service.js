/**
 * Test Suite: Shared Travel Coordination Service
 *
 * Verifies participant coordination, invitation dispatch, proposed and confirmed
 * journey time updates, meeting point communication, cancellation, membership
 * transitions (accept, decline, withdraw), authorization gates, privacy boundaries,
 * and duplicate-delivery prevention.
 */

const assert = require('assert');
const {
  SharedTravelCoordinationService,
  sharedTravelCoordinationService
} = require('../services/sharedTravelCoordinationService');
const {
  SharedTravelGroup,
  SharedTravelMember,
  StudentTravelSharingPreference,
  CommuteAlertPreference,
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  TRAVEL_CONSENT_STATUSES,
  SHARING_VISIBILITY,
  TRANSPORT_MODES
} = require('../models');
const {
  sharedTravelGroupRepository,
  sharedTravelMemberRepository,
  studentTravelSharingPreferenceRepository,
  commuteAlertPreferenceRepository,
  notificationRepository,
  userRepository,
  commuteAlertDeliveryRepository
} = require('../repositories');
const {
  ValidationError,
  ForbiddenError,
  UnauthorizedError
} = require('../errors');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Shared Travel Coordination Service Test Suite');
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

  // Clean up any stale test records from previous runs
  try {
    userRepository.database.prepare("DELETE FROM shared_travel_groups WHERE id LIKE 'stg-coord-%'").run();
    userRepository.database.prepare("DELETE FROM shared_travel_members WHERE group_id LIKE 'stg-coord-%'").run();
    userRepository.database.prepare("DELETE FROM notifications WHERE related_resource_id LIKE 'stg-coord-%'").run();
    userRepository.database.prepare("DELETE FROM commute_alert_deliveries WHERE alert_id LIKE 'coord-stg-coord-%'").run();
  } catch (e) {
    // ignore
  }

  // Setup test users
  const organizerUser = userRepository.create({
    email: `coord_org_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Organizer Siddharth',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const participantUser = userRepository.create({
    email: `coord_part_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Participant Aanya',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const inviteeUser = userRepository.create({
    email: `coord_inv_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Invitee Bharat',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const unoptedUser = userRepository.create({
    email: `coord_unopt_${now}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Unopted Commuter',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const organizerId = organizerUser.id;
  const participantId = participantUser.id;
  const inviteeId = inviteeUser.id;
  const unoptedId = unoptedUser.id;

  // Opt in organizer
  const prefOrg = StudentTravelSharingPreference.createDefault(organizerId);
  prefOrg.optIn({
    consentConfirmed: true,
    preferredPseudonym: 'Siddharth_Org',
    homeAreaCoarse: 'Borivali West',
    defaultCampus: 'DJ Sanghvi College of Engineering'
  });
  studentTravelSharingPreferenceRepository.save(prefOrg);

  // Opt in participant
  const prefPart = StudentTravelSharingPreference.createDefault(participantId);
  prefPart.optIn({
    consentConfirmed: true,
    preferredPseudonym: 'Aanya_Rider',
    homeAreaCoarse: 'Kandivali West',
    defaultCampus: 'DJ Sanghvi College of Engineering'
  });
  studentTravelSharingPreferenceRepository.save(prefPart);

  // Opt in invitee
  const prefInv = StudentTravelSharingPreference.createDefault(inviteeId);
  prefInv.optIn({
    consentConfirmed: true,
    preferredPseudonym: 'Bharat_Invite',
    homeAreaCoarse: 'Malad West',
    defaultCampus: 'DJ Sanghvi College of Engineering'
  });
  studentTravelSharingPreferenceRepository.save(prefInv);

  // Unopted student (consent not granted)
  const prefUnopted = StudentTravelSharingPreference.createDefault(unoptedId);
  studentTravelSharingPreferenceRepository.save(prefUnopted);

  // Helper to create journey with organizer and confirmed participant
  function createCoordinatedGroup(customId = null) {
    const groupId = customId || `stg-coord-${Math.random().toString(36).substring(2, 7)}`;
    const group = SharedTravelGroup.create({
      id: groupId,
      title: 'Morning Western Express',
      organizer: {
        userId: organizerId,
        pseudonym: 'Siddharth_Org'
      },
      originArea: 'Borivali West',
      destinationArea: 'DJ Sanghvi College of Engineering',
      departureWindow: {
        startTime: now + 3600000,
        endTime: now + 5400000,
        preferredDepartureTime: '08:30',
        flexMinutes: 15
      },
      transportMode: TRANSPORT_MODES.TRAIN,
      suggestedMeetingPoint: {
        name: 'Borivali Station Platform 1 Bridge',
        area: 'Borivali West',
        type: 'station_gate'
      },
      visibility: SHARING_VISIBILITY.CAMPUS_ONLY
    }, prefOrg);

    // Add confirmed participant Aanya
    const memberPart = SharedTravelMember.create({
      groupId,
      userId: participantId,
      pseudonym: 'Aanya_Rider',
      role: SHARED_MEMBER_ROLES.PARTICIPANT,
      status: SHARED_MEMBER_STATUSES.ACCEPTED,
      consentStatus: TRAVEL_CONSENT_STATUSES.OPTED_IN,
      consentConfirmed: true,
      approximateStop: 'Kandivali Station'
    });
    group.members.push(memberPart);

    sharedTravelGroupRepository.save(group);
    for (const m of group.members) {
      sharedTravelMemberRepository.save(m);
    }

    return group;
  }

  // --------------------------------------------------------------------------
  // TEST 1: Journey Invitation Notification (Proposed Status)
  // --------------------------------------------------------------------------
  await test('Dispatches clear [PROPOSED] invitation notification to invited student', async () => {
    const group = createCoordinatedGroup(`stg-coord-inv-${now}`);

    const result = sharedTravelCoordinationService.notifyInvitation({
      groupId: group.id,
      organizerId,
      inviteeId
    });

    assert.strictEqual(result.delivered, true);
    assert.strictEqual(result.isDuplicate, false);
    assert(result.notificationId, 'Should return created notification ID');

    // Verify in notification repository
    const notifs = notificationRepository.findByUserId(inviteeId);
    const inviteNotif = notifs.find(n => n.related_resource_id === group.id);
    assert(inviteNotif, 'Invitee must receive in-app notification');
    assert.strictEqual(inviteNotif.type, 'ride_group');
    assert(inviteNotif.title.startsWith('[PROPOSED]'), 'Title must be labeled as [PROPOSED]');
    assert(inviteNotif.message.includes('Siddharth_Org'), 'Message must mention organizer pseudonym');
    assert(inviteNotif.message.includes('Status: Proposed invitation'), 'Must state proposed status');
    assert.strictEqual(inviteNotif.payload.updateStatus, 'PROPOSED');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Proposed vs Confirmed Journey Time Updates
  // --------------------------------------------------------------------------
  await test('Notifies participants with [PROPOSED] and [CONFIRMED] timing updates', async () => {
    const group = createCoordinatedGroup(`stg-coord-time-${now}`);

    // Step A: Organizer proposes a time change (08:45 AM)
    const proposedResult = sharedTravelCoordinationService.updateDepartureTime({
      groupId: group.id,
      requestingUserId: organizerId,
      newDepartureWindow: {
        startTime: now + 4500000,
        endTime: now + 6300000,
        preferredDepartureTime: '08:45',
        flexMinutes: 15
      },
      isConfirmed: false,
      reason: 'Catching the 08:47 fast local train'
    });

    assert.strictEqual(proposedResult.notificationsCount, 1, 'Should notify 1 participant');
    assert(proposedResult.recipients.includes(participantId));

    const partNotifs = notificationRepository.findByUserId(participantId);
    const propNotif = partNotifs.find(n => n.payload && n.payload.updateStatus === 'PROPOSED');
    assert(propNotif, 'Participant must receive proposed time update notification');
    assert(propNotif.title.startsWith('[PROPOSED]'), 'Title must be labeled as [PROPOSED]');
    assert(propNotif.message.includes('08:45'), 'Message must contain new proposed departure time');
    assert(propNotif.message.includes('08:47 fast local'), 'Message must include reason note');

    // Step B: Organizer confirms the departure time (08:45 AM)
    const confirmedResult = sharedTravelCoordinationService.updateDepartureTime({
      groupId: group.id,
      requestingUserId: organizerId,
      newDepartureWindow: {
        startTime: now + 4500000,
        endTime: now + 6300000,
        preferredDepartureTime: '08:45',
        flexMinutes: 15
      },
      isConfirmed: true
    });

    assert.strictEqual(confirmedResult.notificationsCount, 1);
    const partNotifsAfter = notificationRepository.findByUserId(participantId);
    const confNotif = partNotifsAfter.find(n => n.payload && n.payload.updateStatus === 'CONFIRMED');
    assert(confNotif, 'Participant must receive confirmed time update notification');
    assert(confNotif.title.startsWith('[CONFIRMED]'), 'Title must be labeled as [CONFIRMED]');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Communicating an Agreed Meeting Point
  // --------------------------------------------------------------------------
  await test('Communicates agreed meeting point to participants with [CONFIRMED] status', async () => {
    const group = createCoordinatedGroup(`stg-coord-mp-${now}`);

    const result = sharedTravelCoordinationService.updateMeetingPoint({
      groupId: group.id,
      requestingUserId: organizerId,
      meetingPoint: {
        name: 'Vile Parle Station West Main Foot Overbridge',
        area: 'Vile Parle West',
        landmark: 'Near Ticket Counter 2',
        type: 'station_gate'
      },
      isConfirmed: true,
      notes: 'Meeting directly at the overbridge base'
    });

    assert.strictEqual(result.notificationsCount, 1);
    assert(result.recipients.includes(participantId));

    const partNotifs = notificationRepository.findByUserId(participantId);
    const mpNotif = partNotifs.find(n => n.payload && n.payload.eventType === 'CONFIRMED_MEETING_POINT');
    assert(mpNotif, 'Participant must receive meeting point notification');
    assert(mpNotif.title.startsWith('[CONFIRMED]'), 'Must be labeled as [CONFIRMED]');
    assert(mpNotif.message.includes('Vile Parle Station West'), 'Must include meeting point name');
    assert.strictEqual(mpNotif.payload.updateStatus, 'CONFIRMED');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Membership Events - Acceptance, Decline, Withdrawal
  // --------------------------------------------------------------------------
  await test('Coordinates participant acceptance, decline, and voluntary withdrawal', async () => {
    const group = createCoordinatedGroup(`stg-coord-mem-${now}`);

    // Action A: Participant acceptance
    const acceptResult = sharedTravelCoordinationService.notifyMembershipChange({
      groupId: group.id,
      studentId: participantId,
      action: 'ACCEPT'
    });

    assert.strictEqual(acceptResult.notifiedOrganizer, true);
    const orgNotifsAccept = notificationRepository.findByUserId(organizerId);
    const acceptNotif = orgNotifsAccept.find(n => n.payload && n.payload.eventType === 'PARTICIPANT_JOINED');
    assert(acceptNotif, 'Organizer must receive participant joined notification');
    assert(acceptNotif.message.includes('Aanya_Rider accepted'), 'Must use participant pseudonym');

    // Action B: Invitee decline
    const declineResult = sharedTravelCoordinationService.notifyMembershipChange({
      groupId: group.id,
      studentId: inviteeId,
      action: 'DECLINE'
    });

    assert.strictEqual(declineResult.notifiedOrganizer, true);
    const orgNotifsDecline = notificationRepository.findByUserId(organizerId);
    const declineNotif = orgNotifsDecline.find(n => n.payload && n.payload.eventType === 'INVITATION_DECLINED');
    assert(declineNotif, 'Organizer must receive invitation declined notification');
    assert(declineNotif.message.includes('declined participation'), 'Must announce decline');

    // Action C: Participant voluntary withdrawal
    const withdrawResult = sharedTravelCoordinationService.notifyMembershipChange({
      groupId: group.id,
      studentId: participantId,
      action: 'WITHDRAW'
    });

    assert.strictEqual(withdrawResult.notifiedOrganizer, true);
    const orgNotifsWithdraw = notificationRepository.findByUserId(organizerId);
    const withdrawNotif = orgNotifsWithdraw.find(n => n.payload && n.payload.eventType === 'PARTICIPANT_WITHDRAWN');
    assert(withdrawNotif, 'Organizer must receive participant withdrawal notification');
    assert(withdrawNotif.message.includes('withdrawn from'), 'Must confirm withdrawal');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Never Silently Re-Enroll Withdrawn Students (Requirement 9)
  // --------------------------------------------------------------------------
  await test('Never notifies or silently re-enrolls students who have withdrawn participation', async () => {
    const group = createCoordinatedGroup(`stg-coord-withdrawn-${now}`);

    // Participant Aanya withdraws
    const member = group.findMember(participantId);
    member.leave();
    sharedTravelMemberRepository.save(member);

    // Organizer subsequently updates the journey time
    const updateResult = sharedTravelCoordinationService.updateDepartureTime({
      groupId: group.id,
      requestingUserId: organizerId,
      newDepartureWindow: {
        startTime: now + 5000000,
        endTime: now + 6800000,
        preferredDepartureTime: '09:00',
        flexMinutes: 15
      },
      isConfirmed: true
    });

    // Requirement 9: Withdrawn student must NOT receive the update notification!
    assert(!updateResult.recipients.includes(participantId), 'Withdrawn student must NOT be notified of subsequent updates');
    assert.strictEqual(updateResult.notificationsCount, 0, 'No active participants left to notify');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Journey Cancellation Notification
  // --------------------------------------------------------------------------
  await test('Notifies all participants when journey is cancelled by organizer', async () => {
    const group = createCoordinatedGroup(`stg-coord-cancel-${now}`);

    const cancelResult = sharedTravelCoordinationService.cancelJourney({
      groupId: group.id,
      organizerId,
      reason: 'College lectures rescheduled to online'
    });

    assert.strictEqual(cancelResult.success, true);
    assert.strictEqual(cancelResult.status, 'cancelled');
    assert.strictEqual(cancelResult.notificationsCount, 1, 'Must notify participant');

    const partNotifs = notificationRepository.findByUserId(participantId);
    const cancelNotif = partNotifs.find(n => n.payload && n.payload.eventType === 'JOURNEY_CANCELLED');
    assert(cancelNotif, 'Participant must receive cancellation notification');
    assert(cancelNotif.title.startsWith('[CONFIRMED]'), 'Cancellation must be labeled as [CONFIRMED]');
    assert(cancelNotif.message.includes('online'), 'Message must include cancellation reason');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Journey Expiration Notification
  // --------------------------------------------------------------------------
  await test('Updates participants when shared journey departure window has expired', async () => {
    const group = createCoordinatedGroup(`stg-coord-expire-${now}`);

    const expireResult = sharedTravelCoordinationService.expireJourney({
      groupId: group.id,
      now: now + 7200000 // after departure window
    });

    assert.strictEqual(expireResult.success, true);
    assert.strictEqual(expireResult.status, 'expired');
    assert(expireResult.notificationsCount >= 1);

    const partNotifs = notificationRepository.findByUserId(participantId);
    const expireNotif = partNotifs.find(n => n.payload && n.payload.eventType === 'JOURNEY_EXPIRED');
    assert(expireNotif, 'Participant must receive journey expired notification');
    assert(expireNotif.title.startsWith('[CONFIRMED]'), 'Expiration must be labeled as [CONFIRMED]');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Authorization Enforcement
  // --------------------------------------------------------------------------
  await test('Blocks unauthorized students from managing journey coordination actions', async () => {
    const group = createCoordinatedGroup(`stg-coord-auth-${now}`);

    // Participant attempts to update departure window
    let timeError = null;
    try {
      sharedTravelCoordinationService.updateDepartureTime({
        groupId: group.id,
        requestingUserId: participantId, // not organizer
        newDepartureWindow: { startTime: now + 5000000, endTime: now + 6800000 }
      });
    } catch (err) {
      timeError = err;
    }
    assert(timeError instanceof ForbiddenError, 'Must throw ForbiddenError for non-organizer time update');

    // Participant attempts to update meeting point
    let mpError = null;
    try {
      sharedTravelCoordinationService.updateMeetingPoint({
        groupId: group.id,
        requestingUserId: participantId, // not organizer
        meetingPoint: { name: 'Some Gate', area: 'Vile Parle', type: 'station_gate' }
      });
    } catch (err) {
      mpError = err;
    }
    assert(mpError instanceof ForbiddenError, 'Must throw ForbiddenError for non-organizer meeting point update');

    // Participant attempts to cancel journey
    let cancelError = null;
    try {
      sharedTravelCoordinationService.cancelJourney({
        groupId: group.id,
        organizerId: participantId // not organizer
      });
    } catch (err) {
      cancelError = err;
    }
    assert(cancelError instanceof ForbiddenError, 'Must throw ForbiddenError for non-organizer cancellation');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Duplicate-Delivery Prevention & Idempotency
  // --------------------------------------------------------------------------
  await test('Suppresses duplicate notifications for repeated event processing', async () => {
    const group = createCoordinatedGroup(`stg-coord-dup-${now}`);

    // Call invitation notification first time
    const res1 = sharedTravelCoordinationService.notifyInvitation({
      groupId: group.id,
      organizerId,
      inviteeId
    });
    assert.strictEqual(res1.delivered, true);
    assert.strictEqual(res1.isDuplicate, false);

    // Call invitation notification second time with identical event data
    const res2 = sharedTravelCoordinationService.notifyInvitation({
      groupId: group.id,
      organizerId,
      inviteeId
    });
    assert.strictEqual(res2.delivered, true);
    assert.strictEqual(res2.isDuplicate, true, 'Second call must be flagged as duplicate');
    assert.strictEqual(res2.notificationId, res1.notificationId, 'Must return existing notification ID');

    // Verify count in notification repository is exactly 1
    const notifs = notificationRepository.findByResource(inviteeId, 'shared_travel_group', group.id);
    assert.strictEqual(notifs.length, 1, 'Must NOT insert duplicate notification in database');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Respects Voluntary Consent & Notification Preferences
  // --------------------------------------------------------------------------
  await test('Respects opt-out preferences and suppresses delivery to non-consenting users', async () => {
    const group = createCoordinatedGroup(`stg-coord-pref-${now}`);

    // Attempt to notify unopted student
    const result = sharedTravelCoordinationService._deliverCoordinationNotification({
      recipientUserId: unoptedId,
      groupId: group.id,
      eventType: 'INVITATION',
      title: 'Commute Invite',
      message: 'Test message',
      updateStatus: 'PROPOSED'
    });

    assert.strictEqual(result.delivered, false);
    assert.strictEqual(result.skippedReason, 'VOLUNTARY_SHARING_DISABLED');

    const notifs = notificationRepository.findByUserId(unoptedId);
    assert.strictEqual(notifs.length, 0, 'Non-consenting user must not receive notifications');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Privacy Safeguards - No Location Leaks
  // --------------------------------------------------------------------------
  await test('Avoids including unnecessary personal location details in notifications', async () => {
    const group = createCoordinatedGroup(`stg-coord-priv-${now}`);

    const res = sharedTravelCoordinationService.notifyInvitation({
      groupId: group.id,
      organizerId,
      inviteeId
    });

    const notifs = notificationRepository.findByUserId(inviteeId);
    const notif = notifs.find(n => n.id === res.notificationId);

    // Verify message does NOT contain private home address or exact coordinates
    assert(!notif.message.toLowerCase().includes('flat'), 'Notification must not contain flat numbers');
    assert(!notif.message.toLowerCase().includes('room'), 'Notification must not contain room numbers');
    assert(!/-?\d+\.\d{3,}/.test(notif.message), 'Notification must not contain GPS coordinates');
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
