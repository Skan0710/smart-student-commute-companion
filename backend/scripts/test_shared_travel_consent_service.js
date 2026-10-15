/**
 * Test Suite: Shared Travel Consent Service Layer
 *
 * Verifies business logic, explicit voluntary consent, invitations,
 * accept/decline workflows, withdrawal privacy, authorization boundaries,
 * duplicate prevention, non-enumeration, and lifecycle transitions.
 */

const assert = require('assert');
const {
  sharedTravelConsentService,
  SharedTravelConsentService
} = require('../services/sharedTravelConsentService');
const {
  sharedTravelGroupRepository,
  sharedTravelMemberRepository,
  studentTravelSharingPreferenceRepository,
  userRepository
} = require('../repositories');
const {
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  TRAVEL_CONSENT_STATUSES
} = require('../models');
const {
  ValidationError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
  UnauthorizedError
} = require('../errors');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Shared Travel Consent Service Test Suite');
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
  const startTime = now + 3600000;
  const endTime = startTime + 1800000;

  // Setup test users in user repository
  const organizerUser = userRepository.create({
    email: `organizer_${now}@djsce.ac.in`,
    password: 'SecretPassword123!',
    full_name: 'Siddharth Organizer',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const studentA = userRepository.create({
    email: `student_a_${now}@djsce.ac.in`,
    password: 'SecretPassword123!',
    full_name: 'Aanya Student',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const studentB = userRepository.create({
    email: `student_b_${now}@djsce.ac.in`,
    password: 'SecretPassword123!',
    full_name: 'Bharat Student',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const unoptedStudent = userRepository.create({
    email: `unopted_${now}@djsce.ac.in`,
    password: 'SecretPassword123!',
    full_name: 'Unopted Student',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  // --------------------------------------------------------------------------
  // 1. Voluntary Student Opt-In & Preference Management
  // --------------------------------------------------------------------------
  await test('1. Preference: sharing is disabled by default; requires voluntary opt-in', () => {
    const pref = sharedTravelConsentService.getStudentPreference(studentA.id);
    assert.strictEqual(pref.sharingEnabled, false, 'Sharing must be strictly disabled by default');
    assert.strictEqual(pref.canParticipate(), false);

    // Rejects enableSharing without explicit consentConfirmed = true
    assert.throws(
      () => sharedTravelConsentService.enableSharing(studentA.id, { consentConfirmed: false }),
      /Voluntary consent required/
    );

    // Explicit opt-in
    const enabled = sharedTravelConsentService.enableSharing(studentA.id, {
      consentConfirmed: true,
      preferredPseudonym: 'Aanya_Commute',
      homeAreaCoarse: 'Borivali West'
    });

    assert.strictEqual(enabled.sharingEnabled, true);
    assert.strictEqual(enabled.preferredPseudonym, 'Aanya_Commute');
    assert.strictEqual(enabled.canParticipate(), true);

    // Opt-out revokes sharing
    const disabled = sharedTravelConsentService.disableSharing(studentA.id);
    assert.strictEqual(disabled.sharingEnabled, false);
    assert.strictEqual(disabled.canParticipate(), false);

    // Re-enable for subsequent tests
    sharedTravelConsentService.enableSharing(studentA.id, { consentConfirmed: true });
    sharedTravelConsentService.enableSharing(organizerUser.id, { consentConfirmed: true, preferredPseudonym: 'Sid_Lead' });
    sharedTravelConsentService.enableSharing(studentB.id, { consentConfirmed: true, preferredPseudonym: 'Bharat_B' });
  });

  // --------------------------------------------------------------------------
  // 2. Creating a Voluntary Shared Journey
  // --------------------------------------------------------------------------
  let testGroupId = null;
  await test('2. Creation: organizer creates voluntary journey and is enrolled as confirmed organizer', () => {
    // Unopted user cannot organize journey
    assert.throws(
      () => sharedTravelConsentService.createJourney({
        organizerId: unoptedStudent.id,
        journeyData: {
          title: 'Unopted Leader Group',
          originArea: 'Andheri West',
          destinationArea: 'Vile Parle',
          departureWindow: { startTime, endTime },
          suggestedMeetingPoint: { name: 'Station Gate', area: 'Andheri West' }
        }
      }),
      ForbiddenError
    );

    // Opted-in organizer creates journey
    const group = sharedTravelConsentService.createJourney({
      organizerId: organizerUser.id,
      journeyData: {
        title: 'Western Line Morning Express',
        originArea: 'Borivali West',
        destinationArea: 'Vile Parle West',
        departureWindow: {
          startTime,
          endTime,
          preferredDepartureTime: '08:30',
          flexMinutes: 15
        },
        transportMode: 'train',
        suggestedMeetingPoint: {
          name: 'Platform 1 Near FOB',
          area: 'Borivali West',
          type: 'station_gate',
          notes: 'Near the middle foot-overbridge'
        },
        maxParticipants: 3,
        notes: 'Targeting 8:38 AM semi-fast train.'
      }
    });

    assert.ok(group.id);
    testGroupId = group.id;
    assert.strictEqual(group.title, 'Western Line Morning Express');
    assert.strictEqual(group.status, 'open');
    assert.strictEqual(group.getConfirmedCount(), 1);

    // Verify organizer member entry in repository
    const organizerMember = sharedTravelMemberRepository.findByGroupAndUser(group.id, organizerUser.id);
    assert.ok(organizerMember);
    assert.strictEqual(organizerMember.role, 'organizer');
    assert.strictEqual(organizerMember.status, 'accepted');
    assert.strictEqual(organizerMember.consentStatus, 'opted_in');
  });

  // --------------------------------------------------------------------------
  // 3. Invitation Dispatch & Non-Enumeration Safeguards (Requirement 10)
  // --------------------------------------------------------------------------
  await test('3. Invitation: dispatches to eligible student; neutral response on non-existent account', () => {
    // Non-organizer cannot invite
    assert.throws(
      () => sharedTravelConsentService.inviteStudent({
        groupId: testGroupId,
        organizerId: studentA.id,
        inviteeIdentifier: studentB.email
      }),
      ForbiddenError
    );

    // Invite eligible student with sharing enabled
    const resSuccess = sharedTravelConsentService.inviteStudent({
      groupId: testGroupId,
      organizerId: organizerUser.id,
      inviteeIdentifier: studentA.email,
      approximateStop: 'Kandivali Station'
    });
    assert.strictEqual(resSuccess.success, true);
    assert.strictEqual(resSuccess.invited, true);

    const pendingMember = sharedTravelMemberRepository.findByGroupAndUser(testGroupId, studentA.id);
    assert.ok(pendingMember);
    assert.strictEqual(pendingMember.status, 'pending');
    assert.strictEqual(pendingMember.consentStatus, 'opted_out', 'Invitee is not consented until they accept');

    // Requirement 10: Non-enumeration on non-existent or un-opted student
    const resFake = sharedTravelConsentService.inviteStudent({
      groupId: testGroupId,
      organizerId: organizerUser.id,
      inviteeIdentifier: 'totally_nonexistent_email_12345@gmail.com'
    });
    assert.strictEqual(resFake.success, true);
    assert.strictEqual(resFake.invited, false);
    assert.ok(resFake.message.includes('If an eligible student with voluntary sharing enabled exists'));

    // Inviting unopted student also returns safe neutral response
    const resUnopted = sharedTravelConsentService.inviteStudent({
      groupId: testGroupId,
      organizerId: organizerUser.id,
      inviteeIdentifier: unoptedStudent.email
    });
    assert.strictEqual(resUnopted.success, true);
    assert.strictEqual(resUnopted.invited, false);
  });

  // --------------------------------------------------------------------------
  // 4. Accepting Invitation with Explicit Voluntary Consent (Requirement 1)
  // --------------------------------------------------------------------------
  await test('4. Acceptance: requires explicit consentConfirmed = true to enroll participant', () => {
    // Fails without consentConfirmed = true
    assert.throws(
      () => sharedTravelConsentService.acceptInvitation({
        groupId: testGroupId,
        studentId: studentA.id,
        consentConfirmed: false
      }),
      /Voluntary consent required/
    );

    // Successfully accepts with voluntary consent
    const outcome = sharedTravelConsentService.acceptInvitation({
      groupId: testGroupId,
      studentId: studentA.id,
      consentConfirmed: true,
      approximateStop: 'Kandivali West'
    });

    assert.strictEqual(outcome.membership.status, 'accepted');
    assert.strictEqual(outcome.membership.consentStatus, 'opted_in');
    assert.ok(outcome.membership.optedInAt > 0);
    assert.strictEqual(outcome.group.currentParticipantCount, 2);

    // Duplicate acceptance throws ConflictError
    assert.throws(
      () => sharedTravelConsentService.acceptInvitation({
        groupId: testGroupId,
        studentId: studentA.id,
        consentConfirmed: true
      }),
      ConflictError
    );
  });

  // --------------------------------------------------------------------------
  // 5. Unconditional Decline (Requirement 2)
  // --------------------------------------------------------------------------
  await test('5. Decline: student can decline without providing any reason', () => {
    // Invite student B
    sharedTravelConsentService.inviteStudent({
      groupId: testGroupId,
      organizerId: organizerUser.id,
      inviteeIdentifier: studentB.id
    });

    // Student B declines without any reason
    const declineOutcome = sharedTravelConsentService.declineInvitation({
      groupId: testGroupId,
      studentId: studentB.id
    });

    assert.strictEqual(declineOutcome.success, true);
    assert.strictEqual(declineOutcome.status, 'declined');

    const memberB = sharedTravelMemberRepository.findByGroupAndUser(testGroupId, studentB.id);
    assert.strictEqual(memberB.status, 'declined');
    assert.strictEqual(memberB.consentStatus, 'opted_out');
  });

  // --------------------------------------------------------------------------
  // 6. Voluntary Withdrawal & Information Shielding (Requirements 3 & 4)
  // --------------------------------------------------------------------------
  await test('6. Withdrawal: student can withdraw at any time; stops future sharing of their information', () => {
    // Student A is currently accepted in testGroupId
    const detailsBefore = sharedTravelConsentService.getJourneyDetails({
      groupId: testGroupId,
      requestingUserId: organizerUser.id
    });
    assert.ok(detailsBefore.members.some(m => m.userId === studentA.id));

    // Student A withdraws
    const withdrawOutcome = sharedTravelConsentService.withdrawParticipation({
      groupId: testGroupId,
      studentId: studentA.id
    });
    assert.strictEqual(withdrawOutcome.success, true);
    assert.strictEqual(withdrawOutcome.status, 'left');

    // Requirement 4: Withdrawn student is no longer part of active members
    const detailsAfter = sharedTravelConsentService.getJourneyDetails({
      groupId: testGroupId,
      requestingUserId: organizerUser.id
    });
    assert.strictEqual(detailsAfter.currentParticipantCount, 1);

    // Organizer cannot simply withdraw without cancelling
    assert.throws(
      () => sharedTravelConsentService.withdrawParticipation({
        groupId: testGroupId,
        studentId: organizerUser.id
      }),
      /Group organizer cannot withdraw/
    );
  });

  // --------------------------------------------------------------------------
  // 7. Capacity Boundaries and Concurrency Safety
  // --------------------------------------------------------------------------
  await test('7. Capacity: enforces max participant limit and prevents overbooking', () => {
    const smallGroup = sharedTravelConsentService.createJourney({
      organizerId: organizerUser.id,
      journeyData: {
        title: 'Two Person Shared Auto',
        originArea: 'Andheri West',
        destinationArea: 'Juhu Scheme',
        departureWindow: { startTime, endTime },
        suggestedMeetingPoint: { name: 'Auto Stand', area: 'Andheri West' },
        maxParticipants: 2 // Organizer + 1 participant
      }
    });

    // Student A joins
    sharedTravelConsentService.acceptInvitation({
      groupId: smallGroup.id,
      studentId: studentA.id,
      consentConfirmed: true
    });

    // Group is now full (2 / 2)
    // Student B attempts to join full group -> throws ConflictError
    assert.throws(
      () => sharedTravelConsentService.acceptInvitation({
        groupId: smallGroup.id,
        studentId: studentB.id,
        consentConfirmed: true
      }),
      ConflictError
    );
  });

  // --------------------------------------------------------------------------
  // 8. Impersonation & Authorization Safeguards (Requirement 6)
  // --------------------------------------------------------------------------
  await test('8. Authorization: prevents unauthorized membership and lifecycle operations', () => {
    // Non-organizer cannot cancel
    assert.throws(
      () => sharedTravelConsentService.cancelJourney({
        groupId: testGroupId,
        organizerId: studentA.id
      }),
      ForbiddenError
    );

    // Non-organizer cannot remove participants
    assert.throws(
      () => sharedTravelConsentService.removeParticipant({
        groupId: testGroupId,
        organizerId: studentA.id,
        targetUserId: studentB.id
      }),
      ForbiddenError
    );
  });

  // --------------------------------------------------------------------------
  // 9. Journey Cancellation by Authorized Organizer (Requirement 5)
  // --------------------------------------------------------------------------
  await test('9. Cancellation: authorized organizer cancels journey, cascades status to members', () => {
    const cancelGroup = sharedTravelConsentService.createJourney({
      organizerId: organizerUser.id,
      journeyData: {
        title: 'Journey to Cancel',
        originArea: 'Malad West',
        destinationArea: 'Vile Parle',
        departureWindow: { startTime, endTime },
        suggestedMeetingPoint: { name: 'Malad Gate', area: 'Malad' }
      }
    });

    sharedTravelConsentService.acceptInvitation({
      groupId: cancelGroup.id,
      studentId: studentA.id,
      consentConfirmed: true
    });

    // Organizer cancels journey
    const cancelRes = sharedTravelConsentService.cancelJourney({
      groupId: cancelGroup.id,
      organizerId: organizerUser.id,
      reason: 'Heavy rain flooding along Western line'
    });

    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.status, 'cancelled');

    // Invariant check: cannot accept or join cancelled journey
    assert.throws(
      () => sharedTravelConsentService.acceptInvitation({
        groupId: cancelGroup.id,
        studentId: studentB.id,
        consentConfirmed: true
      }),
      ValidationError
    );
  });

  // --------------------------------------------------------------------------
  // 10. Expired Journey Handling (Requirement 7)
  // --------------------------------------------------------------------------
  await test('10. Expiration: transitions elapsed journeys and cancels pending invitations', () => {
    const pastTime = now - 7200000;
    const pastEnd = now - 3600000;

    const expiredGroup = sharedTravelGroupRepository.save({
      id: `stg-exp-${now}`,
      title: 'Old Expired Group',
      organizer: { userId: organizerUser.id, pseudonym: 'Sid_Lead' },
      originArea: 'Dadar West',
      destinationArea: 'Vile Parle',
      departureWindow: { startTime: pastTime, endTime: pastEnd },
      suggestedMeetingPoint: { name: 'Dadar Platform 1', area: 'Dadar' },
      maxParticipants: 4,
      expiresAt: pastEnd
    });

    // Add pending invitation
    sharedTravelMemberRepository.save({
      id: `stm-pend-${now}`,
      groupId: expiredGroup.id,
      userId: studentB.id,
      pseudonym: 'Bharat_B',
      status: 'pending',
      consentStatus: 'opted_out',
      joinedAt: pastTime,
      updatedAt: pastTime
    });

    const report = sharedTravelConsentService.handleExpiredJourneys(now);
    assert.ok(report.expiredGroupsCount >= 1);
    assert.ok(report.cancelledInvitationsCount >= 1);

    const updatedGroup = sharedTravelGroupRepository.findById(expiredGroup.id);
    assert.strictEqual(updatedGroup.status, 'expired');

    const updatedMember = sharedTravelMemberRepository.findByGroupAndUser(expiredGroup.id, studentB.id);
    assert.strictEqual(updatedMember.status, 'cancelled');
  });

  // --------------------------------------------------------------------------
  // 11. Information Boundary (Non-Members)
  // --------------------------------------------------------------------------
  await test('11. Information Boundary: non-members receive masked view without participant details', () => {
    const freshGroup = sharedTravelConsentService.createJourney({
      organizerId: organizerUser.id,
      journeyData: {
        title: 'Privacy Test Journey',
        originArea: 'Khar Road',
        destinationArea: 'Vile Parle',
        departureWindow: { startTime, endTime },
        suggestedMeetingPoint: { name: 'Khar Ticket Window', area: 'Khar Road' },
        notes: 'Secret coordination notes'
      }
    });

    sharedTravelConsentService.acceptInvitation({
      groupId: freshGroup.id,
      studentId: studentA.id,
      consentConfirmed: true
    });

    // Outsider student views journey
    const nonMemberView = sharedTravelConsentService.getJourneyDetails({
      groupId: freshGroup.id,
      requestingUserId: studentB.id
    });

    assert.strictEqual(nonMemberView.isMember, false);
    assert.deepStrictEqual(nonMemberView.members, [], 'Non-members must not see participant roster');
    assert.strictEqual(nonMemberView.notes, undefined, 'Non-members must not see coordination notes');
    assert.strictEqual(nonMemberView.currentParticipantCount, 2);

    // Member views journey
    const memberView = sharedTravelConsentService.getJourneyDetails({
      groupId: freshGroup.id,
      requestingUserId: studentA.id
    });
    assert.strictEqual(memberView.isMember, true);
    assert.strictEqual(memberView.notes, 'Secret coordination notes');
    assert.strictEqual(memberView.members.length, 2);
  });

  // --------------------------------------------------------------------------
  // 12. Student Active & Past Journeys
  // --------------------------------------------------------------------------
  await test('12. Retrieval: getStudentJourneys segregates active journeys, invitations, and history', () => {
    const studentAData = sharedTravelConsentService.getStudentJourneys(studentA.id);
    assert.ok(Array.isArray(studentAData.activeJourneys));
    assert.ok(Array.isArray(studentAData.pendingInvitations));
    assert.ok(Array.isArray(studentAData.pastJourneys));
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
