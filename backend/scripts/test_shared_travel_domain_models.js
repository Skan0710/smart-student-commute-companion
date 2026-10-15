/**
 * Test Suite: Shared Travel Domain Models & Contracts
 *
 * Verifies domain models, validation schemas, privacy safeguards,
 * voluntary consent invariants, and serialization for shared student travel coordination.
 */

const assert = require('assert');
const {
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  TRAVEL_CONSENT_STATUSES,
  MEETING_POINT_TYPES,
  SHARING_VISIBILITY,
  assertCoarseLocationPrivacy,
  sanitizeCoarseArea,
  findForbiddenTravelPrivacyFields,
  travelDepartureWindowSchema,
  suggestedMeetingPointSchema,
  travelOrganizerSchema,
  SharedTravelMember,
  SharedTravelGroup,
  StudentTravelSharingPreference,
  TRANSPORT_MODES
} = require('../models');
const { ValidationError, ForbiddenError, ConflictError } = require('../errors');

async function runTests() {
  console.log('========================================================================');
  console.log(' Running Shared Travel Domain Models & Contracts Test Suite');
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

  // --------------------------------------------------------------------------
  // 1. Enums and Constants
  // --------------------------------------------------------------------------
  await test('1. Enums define expected lifecycle states and types', () => {
    assert.strictEqual(SHARED_TRAVEL_STATUSES.DRAFT, 'draft');
    assert.strictEqual(SHARED_TRAVEL_STATUSES.OPEN, 'open');
    assert.strictEqual(SHARED_TRAVEL_STATUSES.ACTIVE, 'active');
    assert.strictEqual(SHARED_TRAVEL_STATUSES.COMPLETED, 'completed');
    assert.strictEqual(SHARED_TRAVEL_STATUSES.CANCELLED, 'cancelled');
    assert.strictEqual(SHARED_TRAVEL_STATUSES.EXPIRED, 'expired');

    assert.strictEqual(SHARED_MEMBER_STATUSES.PENDING, 'pending');
    assert.strictEqual(SHARED_MEMBER_STATUSES.ACCEPTED, 'accepted');
    assert.strictEqual(SHARED_MEMBER_STATUSES.DECLINED, 'declined');
    assert.strictEqual(SHARED_MEMBER_STATUSES.LEFT, 'left');

    assert.strictEqual(TRAVEL_CONSENT_STATUSES.OPTED_IN, 'opted_in');
    assert.strictEqual(TRAVEL_CONSENT_STATUSES.OPTED_OUT, 'opted_out');

    assert.strictEqual(MEETING_POINT_TYPES.STATION_GATE, 'station_gate');
    assert.strictEqual(MEETING_POINT_TYPES.COLLEGE_GATE, 'college_gate');
  });

  // --------------------------------------------------------------------------
  // 2. Coarse Location Privacy Assertions
  // --------------------------------------------------------------------------
  await test('2. Privacy: allows coarse areas, rejects GPS decimal coordinates and residential rooms', () => {
    // Valid coarse public names
    assert.doesNotThrow(() => assertCoarseLocationPrivacy('Andheri West'));
    assert.doesNotThrow(() => assertCoarseLocationPrivacy('Vile Parle Railway Station'));
    assert.doesNotThrow(() => assertCoarseLocationPrivacy('DJ Sanghvi College Main Gate'));

    // Throws on decimal GPS coordinates
    assert.throws(
      () => assertCoarseLocationPrivacy('19.1075, 72.8372', 'originArea'),
      /Privacy violation.*GPS coordinates/
    );

    // Throws on residential flat/room details
    assert.throws(
      () => assertCoarseLocationPrivacy('Flat 402, Shivam Apartments, Borivali', 'originArea'),
      /Privacy violation.*residential address/
    );
    assert.throws(
      () => assertCoarseLocationPrivacy('Room 3B, Hostel Block A', 'meetingPoint'),
      /Privacy violation.*residential address/
    );
    assert.throws(
      () => assertCoarseLocationPrivacy('Door 12, Gulmohar Road', 'originArea'),
      /Privacy violation.*residential address/
    );
  });

  // --------------------------------------------------------------------------
  // 3. Sanitization of Coarse Areas
  // --------------------------------------------------------------------------
  await test('3. Privacy: sanitizeCoarseArea cleanses accidental coordinate/residential tokens', () => {
    const raw = 'Flat 201, Andheri West, 400058';
    const cleaned = sanitizeCoarseArea(raw);
    assert.strictEqual(cleaned, 'Andheri West');

    const coords = '19.1234, 72.8456 Borivali East';
    const cleanedCoords = sanitizeCoarseArea(coords);
    assert.strictEqual(cleanedCoords, 'Borivali East');
  });

  // --------------------------------------------------------------------------
  // 4. Anti-Tracking Forbidden Fields Detection
  // --------------------------------------------------------------------------
  await test('4. Privacy: findForbiddenTravelPrivacyFields detects tracking and exact location fields', () => {
    const safePayload = {
      title: 'Morning Train Commute',
      originArea: 'Andheri West',
      destinationArea: 'Vile Parle'
    };
    assert.deepStrictEqual(findForbiddenTravelPrivacyFields(safePayload), []);

    const invasivePayload = {
      title: 'Group with telemetry',
      originArea: 'Andheri West',
      lat: 19.1234,
      lng: 72.8456,
      liveLocation: { active: true },
      deviceId: 'dev-9999'
    };
    const detected = findForbiddenTravelPrivacyFields(invasivePayload);
    assert.ok(detected.includes('lat'));
    assert.ok(detected.includes('lng'));
    assert.ok(detected.includes('liveLocation'));
    assert.ok(detected.includes('deviceId'));
  });

  // --------------------------------------------------------------------------
  // 5. Value Object Schemas (DepartureWindow & MeetingPoint)
  // --------------------------------------------------------------------------
  await test('5. Value Objects: DepartureWindow & SuggestedMeetingPoint validation', () => {
    const validWindow = travelDepartureWindowSchema.parse({
      startTime,
      endTime,
      preferredDepartureTime: '08:15',
      flexMinutes: 10
    });
    assert.strictEqual(validWindow.preferredDepartureTime, '08:15');

    // Rejects invalid time format
    assert.throws(
      () => travelDepartureWindowSchema.parse({
        startTime,
        endTime,
        preferredDepartureTime: '8am'
      }),
      /Preferred departure time must be HH:MM format/
    );

    // Rejects endTime < startTime
    assert.throws(
      () => travelDepartureWindowSchema.parse({
        startTime: endTime,
        endTime: startTime
      }),
      /Departure window endTime must be greater than or equal to startTime/
    );

    const validPoint = suggestedMeetingPointSchema.parse({
      name: 'Vile Parle Station Gate 1',
      area: 'Vile Parle West',
      type: 'station_gate',
      landmark: 'Near ticket counter'
    });
    assert.strictEqual(validPoint.name, 'Vile Parle Station Gate 1');
  });

  // --------------------------------------------------------------------------
  // 6. StudentTravelSharingPreference: Disabled by Default & Opt-In Invariant
  // --------------------------------------------------------------------------
  await test('6. Preference: sharing is disabled until student explicitly opts in', () => {
    const pref = StudentTravelSharingPreference.createDefault('usr-student-1');
    assert.strictEqual(pref.userId, 'usr-student-1');
    assert.strictEqual(pref.sharingEnabled, false, 'Sharing must be strictly disabled by default');
    assert.strictEqual(pref.consentConfirmedAt, null);
    assert.strictEqual(pref.canParticipate(), false);

    // assertCanParticipate throws ForbiddenError
    assert.throws(
      () => pref.assertCanParticipate(),
      ForbiddenError
    );

    // Rejects optIn without explicit voluntary consent
    assert.throws(
      () => pref.optIn({ consentConfirmed: false }),
      /Voluntary consent required/
    );

    // Successful opt-in with voluntary consent
    pref.optIn({
      consentConfirmed: true,
      preferredPseudonym: 'Rohan_Commuter',
      homeAreaCoarse: 'Borivali West'
    });

    assert.strictEqual(pref.sharingEnabled, true);
    assert.ok(pref.consentConfirmedAt > 0);
    assert.strictEqual(pref.canParticipate(), true);
    assert.strictEqual(pref.preferredPseudonym, 'Rohan_Commuter');
    assert.doesNotThrow(() => pref.assertCanParticipate());

    // Opt-out revokes sharing
    pref.optOut();
    assert.strictEqual(pref.sharingEnabled, false);
    assert.strictEqual(pref.canParticipate(), false);
  });

  // --------------------------------------------------------------------------
  // 7. StudentTravelSharingPreference: Row Serialization
  // --------------------------------------------------------------------------
  await test('7. Preference: database row serialization and restoration round-trip', () => {
    const pref = new StudentTravelSharingPreference({
      userId: 'usr-serial-test',
      sharingEnabled: true,
      consentConfirmedAt: now - 10000,
      preferredPseudonym: 'Aarav_S',
      homeAreaCoarse: 'Andheri East',
      defaultCampus: 'DJ Sanghvi College of Engineering',
      allowedModes: ['train', 'metro', 'bus']
    });

    const row = pref.toRow();
    assert.strictEqual(row.sharing_enabled, 1);
    assert.strictEqual(typeof row.allowed_modes, 'string');

    const restored = StudentTravelSharingPreference.fromRow(row);
    assert.strictEqual(restored.userId, 'usr-serial-test');
    assert.strictEqual(restored.sharingEnabled, true);
    assert.strictEqual(restored.preferredPseudonym, 'Aarav_S');
    assert.deepStrictEqual(restored.allowedModes, ['train', 'metro', 'bus']);
  });

  // --------------------------------------------------------------------------
  // 8. SharedTravelMember: Creation and Lifecycle Transitions
  // --------------------------------------------------------------------------
  await test('8. Member: establishes voluntary participation, acceptance, and decline transitions', () => {
    const member = SharedTravelMember.create({
      groupId: 'stg-test-1',
      userId: 'usr-student-2',
      pseudonym: 'Priya_K'
    });

    assert.strictEqual(member.status, 'pending');
    assert.strictEqual(member.consentStatus, 'opted_out');
    assert.strictEqual(member.isConfirmed(), false);

    // Acceptance requires consentConfirmed = true
    assert.throws(
      () => member.accept({ consentConfirmed: false }),
      /Voluntary consent required/
    );

    // Voluntary acceptance
    member.accept({ consentConfirmed: true, approximateStop: 'Andheri Station Platform 2' });
    assert.strictEqual(member.status, 'accepted');
    assert.strictEqual(member.consentStatus, 'opted_in');
    assert.strictEqual(member.isConfirmed(), true);
    assert.ok(member.optedInAt > 0);

    // Voluntary leave
    member.leave();
    assert.strictEqual(member.status, 'left');
    assert.strictEqual(member.consentStatus, 'opted_out');
  });

  // --------------------------------------------------------------------------
  // 9. SharedTravelMember: Privacy in Safe View
  // --------------------------------------------------------------------------
  await test('9. Member: toSafeView masks user ID and private notes', () => {
    const member = SharedTravelMember.create({
      groupId: 'stg-test-safe',
      userId: 'usr-secret-id-99',
      pseudonym: 'Sneha_M',
      notes: 'I will be carrying a heavy project model'
    });

    const safeView = member.toSafeView();
    assert.strictEqual(safeView.pseudonym, 'Sneha_M');
    assert.strictEqual(safeView.userId, undefined, 'User ID must be masked in public/safe view');
    assert.strictEqual(safeView.notes, undefined, 'Private notes must be omitted in safe view');
  });

  // --------------------------------------------------------------------------
  // 10. SharedTravelGroup: Creation with Voluntary Organizer Opt-In
  // --------------------------------------------------------------------------
  await test('10. Group: creation enforces organizer opt-in and establishes organizer member', () => {
    const unoptedOrganizer = StudentTravelSharingPreference.createDefault('usr-org-1');

    const groupPayload = {
      title: 'Morning Western Line Express',
      organizer: {
        userId: 'usr-org-1',
        pseudonym: 'Vikram_Organizer'
      },
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
        name: 'Borivali Platform 1 Near FOB',
        area: 'Borivali West',
        type: 'station_gate'
      },
      maxParticipants: 4
    };

    // Fails because organizer has not opted into sharing
    assert.throws(
      () => SharedTravelGroup.create(groupPayload, unoptedOrganizer),
      ForbiddenError
    );

    // Organizer opts in
    unoptedOrganizer.optIn({ consentConfirmed: true, preferredPseudonym: 'Vikram_Organizer' });

    // Succeeds when organizer is opted in
    const group = SharedTravelGroup.create(groupPayload, unoptedOrganizer);
    assert.strictEqual(group.title, 'Morning Western Line Express');
    assert.strictEqual(group.status, 'open');
    assert.strictEqual(group.members.length, 1);
    assert.strictEqual(group.getConfirmedCount(), 1);

    const organizerMember = group.members[0];
    assert.strictEqual(organizerMember.role, 'organizer');
    assert.strictEqual(organizerMember.isConfirmed(), true);
  });

  // --------------------------------------------------------------------------
  // 11. SharedTravelGroup: Rejects Tracking & Exact Addresses
  // --------------------------------------------------------------------------
  await test('11. Group: rejects precise GPS coordinates and residential addresses in schema', () => {
    const invalidCoordsPayload = {
      id: 'stg-invalid-gps',
      title: 'Invalid GPS Group',
      organizer: { userId: 'usr-org-2', pseudonym: 'Test_Org' },
      originArea: '19.1234, 72.8456', // Decimal GPS coordinates
      destinationArea: 'Vile Parle West',
      departureWindow: { startTime, endTime },
      suggestedMeetingPoint: { name: 'Gate 1', area: 'Vile Parle' },
      maxParticipants: 3
    };

    assert.throws(
      () => new SharedTravelGroup(invalidCoordsPayload),
      /Privacy violation.*GPS coordinates/
    );

    const invalidAddressPayload = {
      id: 'stg-invalid-addr',
      title: 'Invalid Address Group',
      organizer: { userId: 'usr-org-2', pseudonym: 'Test_Org' },
      originArea: 'Flat 101, Galaxy Tower, Andheri', // Residential flat
      destinationArea: 'Vile Parle West',
      departureWindow: { startTime, endTime },
      suggestedMeetingPoint: { name: 'Gate 1', area: 'Vile Parle' },
      maxParticipants: 3
    };

    assert.throws(
      () => new SharedTravelGroup(invalidAddressPayload),
      /Privacy violation.*residential address/
    );
  });

  // --------------------------------------------------------------------------
  // 12. SharedTravelGroup: Capacity Enforcement & Duplicate Prevention
  // --------------------------------------------------------------------------
  await test('12. Group: enforces max participant capacity and prevents duplicate members', () => {
    const organizerPref = StudentTravelSharingPreference.createDefault('usr-org-cap');
    organizerPref.optIn({ consentConfirmed: true });

    const group = SharedTravelGroup.create({
      title: 'Auto Share to Campus',
      organizer: { userId: 'usr-org-cap', pseudonym: 'Captain' },
      originArea: 'Andheri West Station',
      destinationArea: 'DJ Sanghvi College',
      departureWindow: { startTime, endTime },
      transportMode: 'auto',
      suggestedMeetingPoint: { name: 'Auto Stand West', area: 'Andheri West', type: 'transit_hub' },
      maxParticipants: 2 // Only 2 total (organizer + 1 member)
    }, organizerPref);

    assert.strictEqual(group.getConfirmedCount(), 1);
    assert.strictEqual(group.hasAvailableSlots(), true);

    const memberPref1 = StudentTravelSharingPreference.createDefault('usr-joiner-1');
    memberPref1.optIn({ consentConfirmed: true });

    // Add first member -> capacity reached
    const member1 = SharedTravelMember.create({
      groupId: group.id,
      userId: 'usr-joiner-1',
      pseudonym: 'JoinerOne',
      status: 'accepted',
      consentStatus: 'opted_in',
      consentConfirmed: true
    });
    group.addMember(member1, memberPref1);

    assert.strictEqual(group.getConfirmedCount(), 2);
    assert.strictEqual(group.isFull(), true);
    assert.strictEqual(group.hasAvailableSlots(), false);

    // Duplicate join attempt throws ConflictError
    assert.throws(
      () => group.addMember(member1, memberPref1),
      ConflictError
    );

    // Second member attempt throws ConflictError (group full)
    const memberPref2 = StudentTravelSharingPreference.createDefault('usr-joiner-2');
    memberPref2.optIn({ consentConfirmed: true });
    const member2 = SharedTravelMember.create({
      groupId: group.id,
      userId: 'usr-joiner-2',
      pseudonym: 'JoinerTwo',
      status: 'accepted',
      consentStatus: 'opted_in',
      consentConfirmed: true
    });

    assert.throws(
      () => group.addMember(member2, memberPref2),
      ConflictError
    );
  });

  // --------------------------------------------------------------------------
  // 13. SharedTravelGroup: Expiration Lifecycle Handling
  // --------------------------------------------------------------------------
  await test('13. Group: handles expiration lifecycle and blocks joins after departure window', () => {
    const pastTime = now - 3600000;
    const pastEnd = now - 1800000;

    const expiredGroup = new SharedTravelGroup({
      id: 'stg-expired-test',
      title: 'Yesterday Travel Group',
      organizer: { userId: 'usr-org-past', pseudonym: 'PastOrganizer' },
      originArea: 'Kandivali West',
      destinationArea: 'Vile Parle',
      departureWindow: { startTime: pastTime, endTime: pastEnd },
      suggestedMeetingPoint: { name: 'Station Gate', area: 'Kandivali' },
      maxParticipants: 4,
      expiresAt: pastEnd
    });

    assert.strictEqual(expiredGroup.isExpired(now), true);
    const transitioned = expiredGroup.markExpired(now);
    assert.strictEqual(transitioned, true);
    assert.strictEqual(expiredGroup.status, 'expired');

    // Cannot add member to expired group
    const candidate = SharedTravelMember.create({
      groupId: expiredGroup.id,
      userId: 'usr-late',
      pseudonym: 'LateStudent'
    });

    assert.throws(
      () => expiredGroup.addMember(candidate),
      ValidationError
    );
  });

  // --------------------------------------------------------------------------
  // 14. SharedTravelGroup: Lifecycle State Transitions (Activate, Complete, Cancel)
  // --------------------------------------------------------------------------
  await test('14. Group: supports authorized activate, complete, and cancel transitions', () => {
    const organizerId = 'usr-org-lifecycle';
    const group = SharedTravelGroup.create({
      title: 'Metro 1 Morning Group',
      organizer: { userId: organizerId, pseudonym: 'MetroLeader' },
      originArea: 'Ghatkopar West',
      destinationArea: 'DN Nagar',
      departureWindow: { startTime, endTime },
      transportMode: 'metro',
      suggestedMeetingPoint: { name: 'Ghatkopar Metro Concourse', area: 'Ghatkopar West', type: 'transit_hub' }
    });

    // Non-organizer cannot activate
    assert.throws(
      () => group.activate('usr-other-person'),
      ForbiddenError
    );

    // Organizer activates
    group.activate(organizerId);
    assert.strictEqual(group.status, 'active');

    // Organizer completes
    group.complete(organizerId);
    assert.strictEqual(group.status, 'completed');

    // Cancel test
    const cancelGroup = SharedTravelGroup.create({
      title: 'Bus Route 202 Group',
      organizer: { userId: organizerId, pseudonym: 'BusOrganizer' },
      originArea: 'Bandra West',
      destinationArea: 'Juhu',
      departureWindow: { startTime, endTime },
      transportMode: 'bus',
      suggestedMeetingPoint: { name: 'Bandra Bus Depot', area: 'Bandra West', type: 'bus_stop' }
    });

    cancelGroup.cancel(organizerId, 'Heavy rain waterlogging at SV Road');
    assert.strictEqual(cancelGroup.status, 'cancelled');
    assert.ok(cancelGroup.notes.includes('Heavy rain waterlogging'));
    assert.strictEqual(cancelGroup.members[0].status, 'cancelled');
  });

  // --------------------------------------------------------------------------
  // 15. SharedTravelGroup: Requirement 6 Information Boundary (Non-Members)
  // --------------------------------------------------------------------------
  await test('15. Information Boundary: non-members receive masked view without participant details', () => {
    const organizerId = 'usr-org-boundary';
    const memberId = 'usr-member-accepted';
    const outsiderId = 'usr-curious-non-member';

    const group = SharedTravelGroup.create({
      title: 'Confidential Study Commute',
      organizer: { userId: organizerId, pseudonym: 'StudyLeader', avatarUrl: null },
      originArea: 'Malad West',
      destinationArea: 'Vile Parle',
      departureWindow: { startTime, endTime },
      suggestedMeetingPoint: {
        name: 'Malad Station Gate 2',
        area: 'Malad West',
        notes: 'Secret code: blue backpack'
      },
      notes: 'Internal student group notes'
    });

    const acceptedMember = SharedTravelMember.create({
      groupId: group.id,
      userId: memberId,
      pseudonym: 'ActiveParticipant',
      status: 'accepted',
      consentStatus: 'opted_in',
      consentConfirmed: true,
      notes: 'Carrying laptop bag'
    });
    group.addMember(acceptedMember);

    // 1. View from Non-Member perspective
    const nonMemberView = group.toSafeView(outsiderId);
    assert.strictEqual(nonMemberView.isMember, false);
    assert.strictEqual(nonMemberView.currentParticipantCount, 2);
    assert.strictEqual(nonMemberView.maxParticipants, 4);
    assert.strictEqual(nonMemberView.title, 'Confidential Study Commute');
    assert.strictEqual(nonMemberView.notes, undefined, 'Coordination notes must be hidden from non-members');
    assert.deepStrictEqual(nonMemberView.members, [], 'Participant roster must be strictly empty for non-members');

    // 2. View from Member perspective
    const memberView = group.toSafeView(memberId);
    assert.strictEqual(memberView.isMember, true);
    assert.strictEqual(memberView.notes, 'Internal student group notes');
    assert.strictEqual(memberView.members.length, 2);
    assert.strictEqual(memberView.members[0].pseudonym, 'StudyLeader');
    assert.strictEqual(memberView.members[1].pseudonym, 'ActiveParticipant');
  });

  // --------------------------------------------------------------------------
  // 16. SharedTravelGroup: Complete JSON Serialization Round-Trip
  // --------------------------------------------------------------------------
  await test('16. Serialization: toJSON produces complete schema-compliant object', () => {
    const group = SharedTravelGroup.create({
      title: 'Full Serialization Test',
      organizer: { userId: 'usr-org-json', pseudonym: 'JsonOrg' },
      originArea: 'Santacruz West',
      destinationArea: 'Vile Parle',
      departureWindow: { startTime, endTime, flexMinutes: 20 },
      suggestedMeetingPoint: { name: 'Santacruz FOB', area: 'Santacruz West' }
    });

    const json = group.toJSON();
    assert.strictEqual(json.id, group.id);
    assert.strictEqual(json.title, 'Full Serialization Test');
    assert.strictEqual(json.currentParticipantCount, 1);
    assert.ok(Array.isArray(json.members));
    assert.strictEqual(json.members.length, 1);

    // Reconstructs into valid SharedTravelGroup
    const restored = new SharedTravelGroup(json);
    assert.strictEqual(restored.id, group.id);
    assert.strictEqual(restored.organizer.pseudonym, 'JsonOrg');
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
