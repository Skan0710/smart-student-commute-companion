/**
 * SharedTravelGroup Domain Model
 *
 * Represents a voluntary student commute coordination group or shared journey.
 *
 * Invariants:
 * - Voluntary participation: all participants must explicitly opt in.
 * - Privacy-by-design: coarse origin/destination areas only; no precise residential addresses.
 * - Anti-tracking: rejects GPS decimal coordinates, device telemetry, and location history.
 * - Information boundaries: non-members cannot inspect participant rosters or personal identities.
 * - Clear lifecycle states: draft -> open -> active -> completed | cancelled | expired.
 * - Capacity enforcement: confirmed participants cannot exceed maxParticipants.
 */

const { z } = require('zod');
const {
  sharedTravelStatusEnum,
  sharingVisibilityEnum,
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  TRAVEL_CONSENT_STATUSES,
  SHARING_VISIBILITY,
  findForbiddenTravelPrivacyFields,
  assertCoarseLocationPrivacy,
  sanitizeCoarseArea,
  travelDepartureWindowSchema,
  suggestedMeetingPointSchema,
  travelOrganizerSchema,
  transportModeEnum,
  TRANSPORT_MODES
} = require('./SharedTravelContracts');
const { SharedTravelMember } = require('./SharedTravelMember');
const { StudentTravelSharingPreference } = require('./StudentTravelSharingPreference');
const {
  ValidationError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
  BadRequestError
} = require('../errors');

const sharedTravelGroupSchema = z.object({
  id: z.string().min(1, 'Shared travel group ID is required'),
  title: z.string().min(3, 'Group title must be at least 3 characters').max(100),
  organizer: travelOrganizerSchema,
  originArea: z.string().min(2, 'Origin area must be at least 2 characters').max(100),
  destinationArea: z.string().min(2, 'Destination area must be at least 2 characters').max(100),
  departureWindow: travelDepartureWindowSchema,
  transportMode: transportModeEnum.default(TRANSPORT_MODES.TRAIN),
  journeyReference: z.string().max(100).nullable().optional().default(null),
  suggestedMeetingPoint: suggestedMeetingPointSchema,
  maxParticipants: z.number().int().min(2).max(8).default(4),
  status: sharedTravelStatusEnum.default(SHARED_TRAVEL_STATUSES.OPEN),
  visibility: sharingVisibilityEnum.default(SHARING_VISIBILITY.CAMPUS_ONLY),
  notes: z.string().max(500).optional().default(''),
  members: z.array(z.any()).default([]),
  createdAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now()),
  expiresAt: z.number().int().positive()
});

class SharedTravelGroup {
  constructor(data) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('SharedTravelGroup payload must be an object');
    }

    // 1. Anti-tracking and privacy safeguards
    const forbiddenFields = findForbiddenTravelPrivacyFields(data);
    if (forbiddenFields.length > 0) {
      throw new ValidationError(
        `Privacy violation: SharedTravelGroup contains forbidden fields: ${forbiddenFields.join(', ')}`
      );
    }

    // 2. Validate coarse location privacy
    assertCoarseLocationPrivacy(data.originArea, 'originArea');
    assertCoarseLocationPrivacy(data.destinationArea, 'destinationArea');
    if (data.suggestedMeetingPoint?.area) {
      assertCoarseLocationPrivacy(data.suggestedMeetingPoint.area, 'suggestedMeetingPoint.area');
    }
    if (data.suggestedMeetingPoint?.name) {
      assertCoarseLocationPrivacy(data.suggestedMeetingPoint.name, 'suggestedMeetingPoint.name');
    }

    // 3. Fallback expiresAt to departureWindow.endTime if not provided
    const expiresAt = data.expiresAt || data.departureWindow?.endTime || (Date.now() + 4 * 3600 * 1000);

    // 4. Validate schema
    const validated = sharedTravelGroupSchema.parse({
      ...data,
      expiresAt
    });

    Object.assign(this, validated);

    // 5. Sanitize coarse areas
    this.originArea = sanitizeCoarseArea(this.originArea);
    this.destinationArea = sanitizeCoarseArea(this.destinationArea);

    // 6. Instantiate members as SharedTravelMember domain models
    this.members = (this.members || []).map(m => {
      if (m instanceof SharedTravelMember) return m;
      return new SharedTravelMember(m);
    });

    // 7. Enforce capacity invariant
    if (this.getConfirmedCount() > this.maxParticipants) {
      throw new ValidationError(
        `Confirmed participants count (${this.getConfirmedCount()}) cannot exceed max capacity (${this.maxParticipants})`
      );
    }
  }

  /**
   * Factory method to construct and initialize a new SharedTravelGroup.
   * Enforces that the organizer must be voluntary and opted in.
   *
   * @param {object} input
   * @param {StudentTravelSharingPreference} [organizerPreference]
   * @returns {SharedTravelGroup}
   */
  static create(input, organizerPreference = null) {
    // Requirement 2: Sharing must be disabled until student opts in.
    if (organizerPreference) {
      if (!organizerPreference.canParticipate()) {
        throw new ForbiddenError(
          'Sharing is disabled until student explicitly opts in to voluntary travel coordination.'
        );
      }
    }

    const now = Date.now();
    const id = input.id || `stg-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = input.expiresAt || input.departureWindow?.endTime || (now + 4 * 3600 * 1000);

    // Provide default public transit meeting point if omitted
    const defaultMeetingPoint = input.suggestedMeetingPoint || {
      name: `${input.originArea || 'Station'} Main Concourse Gate`,
      area: input.originArea || 'Mumbai Metropolitan Region',
      type: 'station_gate',
      landmark: 'Main Station Booking Concourse',
      notes: 'Initial meeting point proposed at origin transit concourse'
    };

    // Automatically create organizer member entry with explicit voluntary opt-in
    const organizerMember = SharedTravelMember.create({
      groupId: id,
      userId: input.organizer.userId,
      pseudonym: input.organizer.pseudonym,
      role: SHARED_MEMBER_ROLES.ORGANIZER,
      status: SHARED_MEMBER_STATUSES.ACCEPTED,
      consentStatus: TRAVEL_CONSENT_STATUSES.OPTED_IN,
      consentConfirmed: true,
      approximateStop: input.suggestedMeetingPoint?.name || input.originArea,
      joinedAt: now
    });

    return new SharedTravelGroup({
      ...input,
      id,
      suggestedMeetingPoint: defaultMeetingPoint,
      expiresAt,
      members: [organizerMember],
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now
    });
  }

  /**
   * Returns count of confirmed (accepted & opted-in) participants.
   *
   * @returns {number}
   */
  getConfirmedCount() {
    return this.members.filter(m => m.isConfirmed()).length;
  }

  /**
   * Whether the group has reached maximum participant capacity.
   *
   * @returns {boolean}
   */
  isFull() {
    return this.getConfirmedCount() >= this.maxParticipants;
  }

  /**
   * Whether the group has available participant slots.
   *
   * @returns {boolean}
   */
  hasAvailableSlots() {
    return this.getConfirmedCount() < this.maxParticipants;
  }

  /**
   * Checks whether the travel window has elapsed.
   *
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isExpired(currentTime = Date.now()) {
    return this.status === SHARED_TRAVEL_STATUSES.EXPIRED || currentTime >= this.expiresAt;
  }

  /**
   * Evaluates and marks the group as expired if its time has elapsed.
   *
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean} True if status transitioned to expired
   */
  markExpired(currentTime = Date.now()) {
    if (this.status === SHARED_TRAVEL_STATUSES.CANCELLED || this.status === SHARED_TRAVEL_STATUSES.COMPLETED) {
      return false;
    }

    if (currentTime >= this.expiresAt) {
      this.status = SHARED_TRAVEL_STATUSES.EXPIRED;
      this.updatedAt = currentTime;
      return true;
    }
    return false;
  }

  /**
   * Checks if a given student user ID is an active member or organizer of the group.
   *
   * @param {string} userId
   * @returns {boolean}
   */
  isMember(userId) {
    if (!userId) return false;
    if (this.organizer.userId === userId) return true;
    return this.members.some(m => m.userId === userId && m.status === SHARED_MEMBER_STATUSES.ACCEPTED);
  }

  /**
   * Finds a member record by student user ID.
   *
   * @param {string} userId
   * @returns {SharedTravelMember|null}
   */
  findMember(userId) {
    if (!userId) return null;
    return this.members.find(m => m.userId === userId) || null;
  }

  /**
   * Adds a new participant to the travel group.
   * Enforces capacity, lifecycle state, voluntary consent, and student opt-in.
   *
   * @param {SharedTravelMember|object} memberInput
   * @param {StudentTravelSharingPreference} [studentPreference]
   * @returns {SharedTravelMember} The added member domain instance
   */
  addMember(memberInput, studentPreference = null) {
    const now = Date.now();

    // 1. Expiration & Status Checks
    if (this.isExpired(now)) {
      throw new ValidationError('Cannot join a shared travel group whose departure window has expired.');
    }

    if (this.status === SHARED_TRAVEL_STATUSES.CANCELLED) {
      throw new ValidationError('Cannot join a cancelled shared travel group.');
    }

    if (this.status === SHARED_TRAVEL_STATUSES.COMPLETED) {
      throw new ValidationError('Cannot join a completed shared travel journey.');
    }

    // 2. Capacity Check
    if (this.isFull()) {
      throw new ConflictError('Shared travel group is already at maximum participant capacity.');
    }

    // 3. Voluntary Student Preference Check
    if (studentPreference) {
      if (!studentPreference.canParticipate()) {
        throw new ForbiddenError(
          'Sharing is disabled until student explicitly opts in to voluntary travel coordination.'
        );
      }
    }

    // 4. Duplicate Check
    const memberObj = memberInput instanceof SharedTravelMember
      ? memberInput
      : SharedTravelMember.create({ ...memberInput, groupId: this.id });

    const existing = this.findMember(memberObj.userId);
    if (existing && existing.status === SHARED_MEMBER_STATUSES.ACCEPTED) {
      throw new ConflictError('Student is already an active participant in this travel group.');
    }

    // 5. Append or update existing member record
    if (existing) {
      Object.assign(existing, memberObj);
    } else {
      this.members.push(memberObj);
    }

    this.updatedAt = now;
    return memberObj;
  }

  /**
   * Transitions group to ACTIVE state when travel is underway.
   *
   * @param {string} requestingUserId
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  activate(requestingUserId, now = Date.now()) {
    if (this.organizer.userId !== requestingUserId) {
      throw new ForbiddenError('Only the travel group organizer can activate the group.');
    }
    if (this.status !== SHARED_TRAVEL_STATUSES.OPEN) {
      throw new ValidationError(`Cannot activate travel group in '${this.status}' state.`);
    }
    this.status = SHARED_TRAVEL_STATUSES.ACTIVE;
    this.updatedAt = now;
    return this;
  }

  /**
   * Transitions group to COMPLETED state upon arrival.
   *
   * @param {string} requestingUserId
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  complete(requestingUserId, now = Date.now()) {
    if (this.organizer.userId !== requestingUserId) {
      throw new ForbiddenError('Only the travel group organizer can mark the journey completed.');
    }
    this.status = SHARED_TRAVEL_STATUSES.COMPLETED;
    this.updatedAt = now;
    return this;
  }

  /**
   * Cancels the shared travel group and cancels all member memberships.
   *
   * @param {string} requestingUserId
   * @param {string} [reason='']
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  cancel(requestingUserId, reason = '', now = Date.now()) {
    if (this.organizer.userId !== requestingUserId) {
      throw new ForbiddenError('Only the travel group organizer can cancel this coordination group.');
    }
    this.status = SHARED_TRAVEL_STATUSES.CANCELLED;
    this.notes = reason ? `${this.notes ? this.notes + ' | ' : ''}Cancellation reason: ${reason}` : this.notes;
    this.updatedAt = now;

    // Transition all members to cancelled
    for (const member of this.members) {
      member.cancel(now);
    }

    return this;
  }

  /**
   * Requirement 6: Do not expose participant information to non-members.
   * Returns a privacy-filtered view of the shared travel group tailored to the viewer.
   *
   * @param {string|null} requestingUserId
   * @returns {object}
   */
  toSafeView(requestingUserId = null) {
    const isMember = Boolean(requestingUserId && this.isMember(requestingUserId));

    // Base public/campus metadata (safe for anyone browsing)
    const base = {
      id: this.id,
      title: this.title,
      organizer: {
        pseudonym: this.organizer.pseudonym,
        avatarUrl: this.organizer.avatarUrl
      },
      originArea: this.originArea,
      destinationArea: this.destinationArea,
      departureWindow: this.departureWindow,
      transportMode: this.transportMode,
      journeyReference: this.journeyReference,
      suggestedMeetingPoint: {
        name: this.suggestedMeetingPoint.name,
        area: this.suggestedMeetingPoint.area,
        type: this.suggestedMeetingPoint.type
      },
      maxParticipants: this.maxParticipants,
      currentParticipantCount: this.getConfirmedCount(),
      hasAvailableSlots: this.hasAvailableSlots(),
      status: this.status,
      visibility: this.visibility,
      isExpired: this.isExpired(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt,
      isMember
    };

    if (isMember) {
      // Full view for accepted participants & organizer:
      // Includes member details, meeting point notes, and coordination notes.
      return {
        ...base,
        organizer: this.organizer,
        suggestedMeetingPoint: this.suggestedMeetingPoint,
        notes: this.notes,
        members: this.members.map(m => m.toJSON())
      };
    }

    // Restricted view for non-members:
    // Exposes NO participant identities, NO member lists, and NO private coordination notes!
    return {
      ...base,
      members: [] // Participant roster is strictly shielded from non-members
    };
  }

  /**
   * Complete serialization for internal persistence and audits.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      organizer: this.organizer,
      originArea: this.originArea,
      destinationArea: this.destinationArea,
      departureWindow: this.departureWindow,
      transportMode: this.transportMode,
      journeyReference: this.journeyReference,
      suggestedMeetingPoint: this.suggestedMeetingPoint,
      maxParticipants: this.maxParticipants,
      currentParticipantCount: this.getConfirmedCount(),
      status: this.status,
      visibility: this.visibility,
      notes: this.notes,
      members: this.members.map(m => (m.toJSON ? m.toJSON() : m)),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt
    };
  }
}

module.exports = {
  SharedTravelGroup,
  sharedTravelGroupSchema
};
