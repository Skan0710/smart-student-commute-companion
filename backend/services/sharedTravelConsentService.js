/**
 * SharedTravelConsentService
 *
 * Core service layer for voluntary, consent-based shared student commute coordination.
 *
 * Requirements & Invariants:
 * 1. Explicit Consent: No student is enrolled without explicit voluntary consent.
 * 2. Unconditional Decline: A student can decline without providing a reason.
 * 3. Voluntary Withdrawal: A student can withdraw at any time; stops future sharing of their information.
 * 4. Anti-Tracking & Privacy: Coarse areas only; non-members cannot inspect participant rosters.
 * 5. Role Authorization: Only authorized organizers can trigger organizer-level lifecycle actions.
 * 6. Impersonation Safeguards: Students can only manage their own invitations and memberships.
 * 7. State Machine Validity: Validates journey and invitation states before every transition.
 * 8. Concurrency & Consistency: Uses SQLite atomic transactions to prevent race conditions and overbooking.
 * 9. Non-Enumeration: Does not reveal whether an arbitrary student account exists via invitation responses.
 */

const { getConnection } = require('../db/connection');
const {
  SharedTravelGroup,
  SharedTravelMember,
  StudentTravelSharingPreference,
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  TRAVEL_CONSENT_STATUSES
} = require('../models');
const { sharedTravelGroupRepository } = require('../repositories/SharedTravelGroupRepository');
const { sharedTravelMemberRepository } = require('../repositories/SharedTravelMemberRepository');
const { studentTravelSharingPreferenceRepository } = require('../repositories/StudentTravelSharingPreferenceRepository');
const { userRepository } = require('../repositories/UserRepository');
const {
  ValidationError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
  UnauthorizedError
} = require('../errors');

class SharedTravelConsentService {
  constructor({
    groupRepo = sharedTravelGroupRepository,
    memberRepo = sharedTravelMemberRepository,
    preferenceRepo = studentTravelSharingPreferenceRepository,
    userRepo = userRepository,
    dbInstance = null
  } = {}) {
    this.groupRepo = groupRepo;
    this.memberRepo = memberRepo;
    this.preferenceRepo = preferenceRepo;
    this.userRepo = userRepo;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Retrieves or initializes student travel sharing preference.
   *
   * @param {string} userId
   * @returns {StudentTravelSharingPreference}
   */
  getStudentPreference(userId) {
    if (!userId) {
      throw new UnauthorizedError('User authentication is required.');
    }
    return this.preferenceRepo.findByUserId(userId);
  }

  /**
   * Enables voluntary sharing for a student after explicit consent.
   *
   * @param {string} userId
   * @param {object} params
   * @returns {StudentTravelSharingPreference}
   */
  enableSharing(userId, params = {}) {
    if (!userId) {
      throw new UnauthorizedError('User authentication is required.');
    }

    const pref = this.getStudentPreference(userId);
    pref.optIn({
      ...params,
      consentConfirmed: Boolean(params.consentConfirmed)
    });

    return this.preferenceRepo.save(pref);
  }

  /**
   * Disables voluntary sharing for a student.
   *
   * @param {string} userId
   * @returns {StudentTravelSharingPreference}
   */
  disableSharing(userId) {
    if (!userId) {
      throw new UnauthorizedError('User authentication is required.');
    }

    const pref = this.getStudentPreference(userId);
    pref.optOut();
    return this.preferenceRepo.save(pref);
  }

  /**
   * Creates a voluntary shared travel coordination journey.
   * Enforces organizer voluntary opt-in and saves organizer member atomically.
   *
   * @param {object} params
   * @param {string} params.organizerId
   * @param {object} params.journeyData
   * @returns {SharedTravelGroup}
   */
  createJourney({ organizerId, journeyData }) {
    if (!organizerId) {
      throw new UnauthorizedError('Organizer authentication is required.');
    }

    // 1. Verify organizer has voluntary sharing enabled
    const organizerPref = this.getStudentPreference(organizerId);
    organizerPref.assertCanParticipate();

    // 2. Resolve organizer pseudonym from user profile or preferences
    const user = this.userRepo.findById(organizerId);
    const pseudonym = journeyData.organizer?.pseudonym
      || organizerPref.preferredPseudonym
      || user?.name
      || 'Student_Organizer';

    // 3. Execute atomic transaction: Save Group + Organizer Member
    return this.database.transaction(() => {
      const group = SharedTravelGroup.create({
        ...journeyData,
        organizer: {
          userId: organizerId,
          pseudonym,
          avatarUrl: journeyData.organizer?.avatarUrl || null
        }
      }, organizerPref);

      // Persist group record
      this.groupRepo.save(group);

      // Persist organizer as accepted member
      const organizerMember = group.members[0];
      this.memberRepo.save(organizerMember);

      return group;
    })();
  }

  /**
   * Invites a student to participate in a shared journey.
   * Requirement 10: Does not reveal whether an arbitrary student account exists.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.organizerId
   * @param {string} params.inviteeIdentifier - Email, username, or userId
   * @param {string} [params.approximateStop]
   * @returns {{ success: boolean, invited: boolean, message: string }}
   */
  inviteStudent({ groupId, organizerId, inviteeIdentifier, approximateStop }) {
    if (!organizerId) {
      throw new UnauthorizedError('Organizer authentication is required.');
    }

    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    // Requirement 5: Only authorized organizer can send invitations
    if (group.organizer.userId !== organizerId) {
      throw new ForbiddenError('Only the travel group organizer can invite participants.');
    }

    // State validation
    if (group.isExpired()) {
      throw new ValidationError('Cannot invite participants to an expired travel group.');
    }
    if (group.status === SHARED_TRAVEL_STATUSES.CANCELLED || group.status === SHARED_TRAVEL_STATUSES.COMPLETED) {
      throw new ValidationError(`Cannot invite participants to a ${group.status} travel group.`);
    }

    // Capacity validation
    if (group.isFull()) {
      throw new ConflictError('Shared travel group is already at maximum participant capacity.');
    }

    // Look up invitee by identifier (email, username, or id)
    let candidateUser = null;
    if (inviteeIdentifier) {
      candidateUser = this.userRepo.findById(inviteeIdentifier)
        || this.userRepo.findByEmail(inviteeIdentifier);
    }

    // Requirement 10: Non-enumeration safe response
    // If the account does not exist OR student has sharing disabled:
    // Return a safe neutral acknowledgment without leaking account status!
    const neutralResponse = {
      success: true,
      invited: false,
      message: 'If an eligible student with voluntary sharing enabled exists for this identifier, an invitation has been dispatched.'
    };

    if (!candidateUser) {
      return neutralResponse;
    }

    // Check invitee sharing preference
    const inviteePref = this.getStudentPreference(candidateUser.id);
    if (!inviteePref.canParticipate()) {
      return neutralResponse;
    }

    // Check if invitee is already a member
    const existingMember = this.memberRepo.findByGroupAndUser(groupId, candidateUser.id);
    if (existingMember && existingMember.status === SHARED_MEMBER_STATUSES.ACCEPTED) {
      return {
        success: true,
        invited: false,
        message: 'Student is already an active participant in this travel group.'
      };
    }

    // Create or update pending invitation inside transaction
    this.database.transaction(() => {
      const member = SharedTravelMember.create({
        groupId,
        userId: candidateUser.id,
        pseudonym: inviteePref.preferredPseudonym || candidateUser.name || 'Student_Participant',
        role: SHARED_MEMBER_ROLES.PARTICIPANT,
        status: SHARED_MEMBER_STATUSES.PENDING,
        consentStatus: TRAVEL_CONSENT_STATUSES.OPTED_OUT,
        approximateStop: approximateStop || null
      });

      this.memberRepo.save(member);
    })();

    return {
      success: true,
      invited: true,
      message: 'Invitation dispatched to student.'
    };
  }

  /**
   * Student requests to join an open shared journey.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.studentId
   * @param {string} [params.approximateStop]
   * @param {string} [params.notes]
   * @returns {SharedTravelMember}
   */
  requestToJoin({ groupId, studentId, approximateStop, notes }) {
    if (!studentId) {
      throw new UnauthorizedError('Student authentication is required.');
    }

    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    if (group.isExpired()) {
      throw new ValidationError('Cannot join an expired travel group.');
    }
    if (group.status !== SHARED_TRAVEL_STATUSES.OPEN) {
      throw new ValidationError(`Cannot join travel group in '${group.status}' status.`);
    }
    if (group.isFull()) {
      throw new ConflictError('Shared travel group is already at maximum participant capacity.');
    }

    // Verify student has voluntary sharing enabled
    const studentPref = this.getStudentPreference(studentId);
    studentPref.assertCanParticipate();

    const existing = this.memberRepo.findByGroupAndUser(groupId, studentId);
    if (existing && existing.status === SHARED_MEMBER_STATUSES.ACCEPTED) {
      throw new ConflictError('Student is already an active participant in this travel group.');
    }

    const user = this.userRepo.findById(studentId);
    const pseudonym = studentPref.preferredPseudonym || user?.name || 'Student_Participant';

    return this.database.transaction(() => {
      const member = SharedTravelMember.create({
        groupId,
        userId: studentId,
        pseudonym,
        role: SHARED_MEMBER_ROLES.PARTICIPANT,
        status: SHARED_MEMBER_STATUSES.PENDING,
        consentStatus: TRAVEL_CONSENT_STATUSES.OPTED_OUT,
        approximateStop: approximateStop || null,
        notes: notes || ''
      });

      this.memberRepo.save(member);
      return member;
    })();
  }

  /**
   * Accepts an invitation or confirms participation.
   * Requirement 1: Explicit consent required (consentConfirmed: true).
   * Requirement 6: Participant cannot impersonate another student.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.studentId - Authenticated student ID
   * @param {boolean} params.consentConfirmed - Must be strictly true
   * @param {string} [params.approximateStop]
   * @returns {{ membership: SharedTravelMember, group: object }}
   */
  acceptInvitation({ groupId, studentId, consentConfirmed, approximateStop }) {
    if (!studentId) {
      throw new UnauthorizedError('Student authentication is required.');
    }

    // Requirement 1: Explicit consent required
    if (consentConfirmed !== true) {
      throw new ValidationError(
        'Voluntary consent required: student must explicitly confirm opt-in consent to participate in shared travel.'
      );
    }

    // Verify student sharing preference
    const studentPref = this.getStudentPreference(studentId);
    studentPref.assertCanParticipate();

    return this.database.transaction(() => {
      const group = this.groupRepo.findById(groupId, true);
      if (!group) {
        throw new NotFoundError('Shared travel group not found.');
      }

      // State validation
      if (group.isExpired()) {
        throw new ValidationError('Cannot accept invitation to an expired shared travel group.');
      }
      if (group.status !== SHARED_TRAVEL_STATUSES.OPEN && group.status !== SHARED_TRAVEL_STATUSES.ACTIVE) {
        throw new ValidationError(`Cannot accept invitation for a ${group.status} travel group.`);
      }

      // Capacity validation
      if (group.isFull()) {
        throw new ConflictError('Shared travel group is already at maximum participant capacity.');
      }

      let member = this.memberRepo.findByGroupAndUser(groupId, studentId);
      if (!member) {
        // Create new membership record if open enrollment
        const user = this.userRepo.findById(studentId);
        member = SharedTravelMember.create({
          groupId,
          userId: studentId,
          pseudonym: studentPref.preferredPseudonym || user?.name || 'Student_Participant',
          role: SHARED_MEMBER_ROLES.PARTICIPANT,
          status: SHARED_MEMBER_STATUSES.PENDING,
          consentStatus: TRAVEL_CONSENT_STATUSES.OPTED_OUT
        });
      }

      if (member.status === SHARED_MEMBER_STATUSES.ACCEPTED) {
        throw new ConflictError('Student is already an accepted member of this travel group.');
      }

      // Explicit voluntary acceptance
      member.accept({
        consentConfirmed: true,
        approximateStop
      });

      this.memberRepo.save(member);

      // Re-fetch updated group view
      const updatedGroup = this.groupRepo.findById(groupId, true);
      return {
        membership: member,
        group: updatedGroup.toSafeView(studentId)
      };
    })();
  }

  /**
   * Declines an invitation or request.
   * Requirement 2: A student can decline without providing a reason.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.studentId
   * @returns {{ success: boolean, status: string }}
   */
  declineInvitation({ groupId, studentId }) {
    if (!studentId) {
      throw new UnauthorizedError('Student authentication is required.');
    }

    return this.database.transaction(() => {
      const member = this.memberRepo.findByGroupAndUser(groupId, studentId);
      if (!member) {
        throw new NotFoundError('Invitation or membership not found.');
      }

      if (member.role === SHARED_MEMBER_ROLES.ORGANIZER) {
        throw new ValidationError('Group organizer cannot decline their own group.');
      }

      member.decline();
      this.memberRepo.save(member);

      return {
        success: true,
        status: SHARED_MEMBER_STATUSES.DECLINED
      };
    })();
  }

  /**
   * Voluntarily withdraws student participation from a shared journey.
   * Requirement 3 & 4: Student can withdraw at any time; stops future sharing of their info.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.studentId
   * @returns {{ success: boolean, status: string }}
   */
  withdrawParticipation({ groupId, studentId }) {
    if (!studentId) {
      throw new UnauthorizedError('Student authentication is required.');
    }

    return this.database.transaction(() => {
      const member = this.memberRepo.findByGroupAndUser(groupId, studentId);
      if (!member) {
        throw new NotFoundError('Membership record not found for this shared travel group.');
      }

      // Requirement 3: Safe lifecycle handling - organizer cannot simply abandon without cancelling
      if (member.role === SHARED_MEMBER_ROLES.ORGANIZER) {
        throw new ValidationError(
          'Group organizer cannot withdraw without cancelling or transferring the travel group.'
        );
      }

      member.leave();
      this.memberRepo.save(member);

      return {
        success: true,
        status: SHARED_MEMBER_STATUSES.LEFT
      };
    })();
  }

  /**
   * Cancels a shared travel journey.
   * Requirement 5: Only authorized organizer can cancel.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.organizerId
   * @param {string} [params.reason='']
   * @returns {{ success: boolean, status: string }}
   */
  cancelJourney({ groupId, organizerId, reason = '' }) {
    if (!organizerId) {
      throw new UnauthorizedError('Organizer authentication is required.');
    }

    return this.database.transaction(() => {
      const group = this.groupRepo.findById(groupId, true);
      if (!group) {
        throw new NotFoundError('Shared travel group not found.');
      }

      // Requirement 5: Organizer authorization check
      if (group.organizer.userId !== organizerId) {
        throw new ForbiddenError('Only the travel group organizer can cancel this coordination group.');
      }

      group.cancel(organizerId, reason);
      this.groupRepo.save(group);

      // Save cancelled status on all members
      for (const m of group.members) {
        this.memberRepo.save(m);
      }

      return {
        success: true,
        status: SHARED_TRAVEL_STATUSES.CANCELLED
      };
    })();
  }

  /**
   * Organizer removes a participant from the travel group.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.organizerId
   * @param {string} params.targetUserId
   * @returns {{ success: boolean, status: string }}
   */
  removeParticipant({ groupId, organizerId, targetUserId }) {
    if (!organizerId) {
      throw new UnauthorizedError('Organizer authentication is required.');
    }

    return this.database.transaction(() => {
      const group = this.groupRepo.findById(groupId, true);
      if (!group) {
        throw new NotFoundError('Shared travel group not found.');
      }

      if (group.organizer.userId !== organizerId) {
        throw new ForbiddenError('Only the travel group organizer can remove participants.');
      }

      if (organizerId === targetUserId) {
        throw new ValidationError('Organizer cannot remove themselves; please cancel the travel group instead.');
      }

      const member = this.memberRepo.findByGroupAndUser(groupId, targetUserId);
      if (!member) {
        throw new NotFoundError('Target participant is not a member of this group.');
      }

      member.remove();
      this.memberRepo.save(member);

      return {
        success: true,
        status: SHARED_MEMBER_STATUSES.REMOVED
      };
    })();
  }

  /**
   * Retrieves journey details with information boundary filtering.
   * Requirement 4 & Non-member shielding: Non-members receive masked participant rosters.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string|null} [params.requestingUserId=null]
   * @returns {object}
   */
  getJourneyDetails({ groupId, requestingUserId = null }) {
    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    // Auto-expire check
    group.markExpired();

    return group.toSafeView(requestingUserId);
  }

  /**
   * Retrieves all shared journeys and invitations associated with a student.
   *
   * @param {string} studentId
   * @returns {{ activeJourneys: object[], pendingInvitations: object[], pastJourneys: object[] }}
   */
  getStudentJourneys(studentId) {
    if (!studentId) {
      throw new UnauthorizedError('Student authentication is required.');
    }

    const memberships = this.memberRepo.findByUserId(studentId);
    const activeJourneys = [];
    const pendingInvitations = [];
    const pastJourneys = [];

    for (const m of memberships) {
      const group = this.groupRepo.findById(m.groupId, true);
      if (!group) continue;
      group.markExpired();

      const safeView = group.toSafeView(studentId);

      if (m.status === SHARED_MEMBER_STATUSES.PENDING) {
        pendingInvitations.push({
          invitationId: m.id,
          groupId: m.groupId,
          role: m.role,
          status: m.status,
          approximateStop: m.approximateStop,
          joinedAt: m.joinedAt,
          group: safeView
        });
      } else if (
        m.status === SHARED_MEMBER_STATUSES.ACCEPTED &&
        (group.status === SHARED_TRAVEL_STATUSES.OPEN || group.status === SHARED_TRAVEL_STATUSES.ACTIVE)
      ) {
        activeJourneys.push(safeView);
      } else {
        pastJourneys.push({
          ...safeView,
          membershipStatus: m.status
        });
      }
    }

    return {
      activeJourneys,
      pendingInvitations,
      pastJourneys
    };
  }

  /**
   * Evaluates and updates expired journeys and their pending invitations.
   *
   * @param {number} [now=Date.now()]
   * @returns {{ expiredGroupsCount: number, cancelledInvitationsCount: number }}
   */
  handleExpiredJourneys(now = Date.now()) {
    const expiredGroups = this.groupRepo.findExpired(now);
    let cancelledInvitationsCount = 0;

    for (const group of expiredGroups) {
      this.database.transaction(() => {
        group.markExpired(now);
        this.groupRepo.save(group);

        // Cancel any lingering pending invitations
        for (const m of group.members) {
          if (m.status === SHARED_MEMBER_STATUSES.PENDING) {
            m.cancel(now);
            this.memberRepo.save(m);
            cancelledInvitationsCount++;
          }
        }
      })();
    }

    return {
      expiredGroupsCount: expiredGroups.length,
      cancelledInvitationsCount
    };
  }
}

const sharedTravelConsentService = new SharedTravelConsentService();

module.exports = {
  SharedTravelConsentService,
  sharedTravelConsentService
};
