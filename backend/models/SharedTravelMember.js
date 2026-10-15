/**
 * SharedTravelMember Domain Model
 *
 * Represents an individual student's voluntary participation, invitation,
 * and consent status in a shared travel coordination group.
 *
 * Invariants:
 * - Participation must be explicitly voluntary (requires consentConfirmed = true).
 * - Lifecycle transitions: pending -> accepted | declined, accepted -> left | removed | cancelled.
 * - Anti-tracking & privacy: coarse joining station/stop only, no precise addresses or GPS telemetry.
 */

const { z } = require('zod');
const {
  sharedMemberStatusEnum,
  sharedMemberRoleEnum,
  travelConsentStatusEnum,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  TRAVEL_CONSENT_STATUSES,
  findForbiddenTravelPrivacyFields,
  assertCoarseLocationPrivacy,
  sanitizeCoarseArea
} = require('./SharedTravelContracts');
const { ValidationError, ForbiddenError } = require('../errors');

const sharedTravelMemberSchema = z.object({
  id: z.string().min(1, 'Member ID is required'),
  groupId: z.string().min(1, 'Group ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  pseudonym: z.string().min(2, 'Member pseudonym must be at least 2 characters').max(50),
  role: sharedMemberRoleEnum.default(SHARED_MEMBER_ROLES.PARTICIPANT),
  status: sharedMemberStatusEnum.default(SHARED_MEMBER_STATUSES.PENDING),
  consentStatus: travelConsentStatusEnum.default(TRAVEL_CONSENT_STATUSES.OPTED_OUT),
  optedInAt: z.number().int().positive().nullable().default(null),
  approximateStop: z.string().max(100).nullable().optional().default(null),
  notes: z.string().max(250).optional().default(''),
  joinedAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now())
});

class SharedTravelMember {
  constructor(data) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('SharedTravelMember payload must be an object');
    }

    // 1. Anti-tracking and privacy safeguards
    const forbiddenFields = findForbiddenTravelPrivacyFields(data);
    if (forbiddenFields.length > 0) {
      throw new ValidationError(
        `Privacy violation: SharedTravelMember contains forbidden fields: ${forbiddenFields.join(', ')}`
      );
    }

    if (data.approximateStop) {
      assertCoarseLocationPrivacy(data.approximateStop, 'approximateStop');
    }

    // 2. Validate schema
    const validated = sharedTravelMemberSchema.parse(data);
    Object.assign(this, validated);

    // 3. Normalize joining stop
    if (this.approximateStop) {
      this.approximateStop = sanitizeCoarseArea(this.approximateStop);
    }
  }

  /**
   * Factory method to create a new member instance with defaults.
   *
   * @param {object} input
   * @returns {SharedTravelMember}
   */
  static create(input) {
    const now = Date.now();
    const id = input.id || `stm-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const isOrganizer = input.role === SHARED_MEMBER_ROLES.ORGANIZER;

    // Organizers explicitly opt-in upon group creation
    const consentStatus = input.consentStatus
      || (isOrganizer || input.consentConfirmed ? TRAVEL_CONSENT_STATUSES.OPTED_IN : TRAVEL_CONSENT_STATUSES.OPTED_OUT);
    const optedInAt = input.optedInAt || (consentStatus === TRAVEL_CONSENT_STATUSES.OPTED_IN ? now : null);
    const status = input.status
      || (isOrganizer ? SHARED_MEMBER_STATUSES.ACCEPTED : SHARED_MEMBER_STATUSES.PENDING);

    return new SharedTravelMember({
      ...input,
      id,
      role: input.role || SHARED_MEMBER_ROLES.PARTICIPANT,
      status,
      consentStatus,
      optedInAt,
      joinedAt: input.joinedAt || now,
      updatedAt: input.updatedAt || now
    });
  }

  /**
   * Explicitly accepts an invitation or join request with voluntary opt-in confirmation.
   *
   * @param {object} [params={}]
   * @param {boolean} params.consentConfirmed - Must be explicitly true
   * @param {string} [params.approximateStop] - Coarse joining stop or station
   * @param {number} [params.now]
   * @returns {this}
   */
  accept({ consentConfirmed, approximateStop, now = Date.now() } = {}) {
    if (consentConfirmed !== true) {
      throw new ValidationError(
        'Voluntary consent required: student must explicitly confirm opt-in consent to participate in shared travel.'
      );
    }

    if (this.status === SHARED_MEMBER_STATUSES.CANCELLED) {
      throw new ValidationError('Cannot accept a cancelled shared travel membership.');
    }

    if (approximateStop) {
      assertCoarseLocationPrivacy(approximateStop, 'approximateStop');
      this.approximateStop = sanitizeCoarseArea(approximateStop);
    }

    this.status = SHARED_MEMBER_STATUSES.ACCEPTED;
    this.consentStatus = TRAVEL_CONSENT_STATUSES.OPTED_IN;
    this.optedInAt = now;
    this.updatedAt = now;
    return this;
  }

  /**
   * Declines an invitation or pending request.
   *
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  decline(now = Date.now()) {
    this.status = SHARED_MEMBER_STATUSES.DECLINED;
    this.consentStatus = TRAVEL_CONSENT_STATUSES.OPTED_OUT;
    this.updatedAt = now;
    return this;
  }

  /**
   * Member voluntarily leaves the group.
   *
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  leave(now = Date.now()) {
    if (this.role === SHARED_MEMBER_ROLES.ORGANIZER) {
      throw new ValidationError('Group organizer cannot leave; the travel group must be cancelled or reassigned.');
    }
    this.status = SHARED_MEMBER_STATUSES.LEFT;
    this.consentStatus = TRAVEL_CONSENT_STATUSES.OPTED_OUT;
    this.updatedAt = now;
    return this;
  }

  /**
   * Marks member cancelled when the parent group is cancelled.
   *
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  cancel(now = Date.now()) {
    this.status = SHARED_MEMBER_STATUSES.CANCELLED;
    this.updatedAt = now;
    return this;
  }

  /**
   * Organizer removes a member from the group.
   *
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  remove(now = Date.now()) {
    this.status = SHARED_MEMBER_STATUSES.REMOVED;
    this.consentStatus = TRAVEL_CONSENT_STATUSES.OPTED_OUT;
    this.updatedAt = now;
    return this;
  }

  /**
   * Whether the member is active and currently confirmed.
   *
   * @returns {boolean}
   */
  isConfirmed() {
    return this.status === SHARED_MEMBER_STATUSES.ACCEPTED
      && this.consentStatus === TRAVEL_CONSENT_STATUSES.OPTED_IN;
  }

  /**
   * Whether member is the group organizer.
   *
   * @returns {boolean}
   */
  isOrganizer() {
    return this.role === SHARED_MEMBER_ROLES.ORGANIZER;
  }

  /**
   * Serializes to full object (for group members & organizer).
   *
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      groupId: this.groupId,
      userId: this.userId,
      pseudonym: this.pseudonym,
      role: this.role,
      status: this.status,
      consentStatus: this.consentStatus,
      optedInAt: this.optedInAt,
      approximateStop: this.approximateStop,
      notes: this.notes,
      joinedAt: this.joinedAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Masked view for non-members (privacy protection: hides exact student identity).
   *
   * @returns {object}
   */
  toSafeView() {
    return {
      id: this.id,
      pseudonym: this.pseudonym,
      role: this.role,
      status: this.status,
      approximateStop: this.approximateStop,
      joinedAt: this.joinedAt
    };
  }
}

module.exports = {
  SharedTravelMember,
  sharedTravelMemberSchema
};
