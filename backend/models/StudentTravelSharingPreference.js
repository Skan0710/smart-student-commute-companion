/**
 * StudentTravelSharingPreference Domain Model
 *
 * Encapsulates an individual student's voluntary opt-in state, privacy preferences,
 * and discovery settings for shared student commute coordination.
 *
 * Invariants:
 * - Sharing is strictly disabled by default (sharingEnabled: false, consentConfirmedAt: null).
 * - Participation must be explicitly voluntary via explicit opt-in confirmation.
 * - Coarse residential area only; never precise addresses or GPS telemetry.
 */

const { z } = require('zod');
const {
  sharingVisibilityEnum,
  SHARING_VISIBILITY,
  findForbiddenTravelPrivacyFields,
  assertCoarseLocationPrivacy,
  sanitizeCoarseArea,
  transportModeEnum,
  TRANSPORT_MODES
} = require('./SharedTravelContracts');
const { ValidationError, ForbiddenError } = require('../errors');

const studentTravelSharingPreferenceSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  sharingEnabled: z.boolean().default(false),
  consentConfirmedAt: z.number().int().positive().nullable().default(null),
  preferredPseudonym: z.string().min(2).max(50).optional().default('Student_Commuter'),
  visibility: sharingVisibilityEnum.default(SHARING_VISIBILITY.CAMPUS_ONLY),
  homeAreaCoarse: z.string().max(100).nullable().optional().default(null),
  defaultCampus: z.string().max(100).nullable().optional().default('DJ Sanghvi College of Engineering'),
  allowedModes: z.array(transportModeEnum).default([
    TRANSPORT_MODES.TRAIN,
    TRANSPORT_MODES.METRO,
    TRANSPORT_MODES.BUS,
    TRANSPORT_MODES.AUTO,
    TRANSPORT_MODES.WALK
  ]),
  maxGroupSizePreference: z.number().int().min(2).max(8).default(4),
  updatedAt: z.number().int().positive().default(() => Date.now())
});

class StudentTravelSharingPreference {
  constructor(data) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('StudentTravelSharingPreference payload must be an object');
    }

    // 1. Anti-tracking and privacy safeguards
    const forbiddenFields = findForbiddenTravelPrivacyFields(data);
    if (forbiddenFields.length > 0) {
      throw new ValidationError(
        `Privacy violation: StudentTravelSharingPreference contains forbidden fields: ${forbiddenFields.join(', ')}`
      );
    }

    if (data.homeAreaCoarse) {
      assertCoarseLocationPrivacy(data.homeAreaCoarse, 'homeAreaCoarse');
    }

    // 2. Validate schema
    const validated = studentTravelSharingPreferenceSchema.parse(data);
    Object.assign(this, validated);

    // 3. Normalize location
    if (this.homeAreaCoarse) {
      this.homeAreaCoarse = sanitizeCoarseArea(this.homeAreaCoarse);
    }
  }

  /**
   * Factory constructor with default safe values (sharing strictly disabled).
   *
   * @param {string|object} userIdOrInput
   * @returns {StudentTravelSharingPreference}
   */
  static createDefault(userIdOrInput) {
    const input = typeof userIdOrInput === 'string' ? { userId: userIdOrInput } : (userIdOrInput || {});
    return new StudentTravelSharingPreference({
      ...input,
      sharingEnabled: false,
      consentConfirmedAt: null,
      updatedAt: Date.now()
    });
  }

  /**
   * Explicitly enables shared travel coordination with voluntary student consent.
   *
   * @param {object} params
   * @param {boolean} params.consentConfirmed - Must be strictly true
   * @param {string} [params.preferredPseudonym]
   * @param {string} [params.homeAreaCoarse]
   * @param {string} [params.defaultCampus]
   * @param {string[]} [params.allowedModes]
   * @param {string} [params.visibility]
   * @param {number} [params.now]
   * @returns {this}
   */
  optIn({
    consentConfirmed,
    preferredPseudonym,
    homeAreaCoarse,
    defaultCampus,
    allowedModes,
    visibility,
    now = Date.now()
  } = {}) {
    if (consentConfirmed !== true) {
      throw new ValidationError(
        'Voluntary consent required: student must explicitly confirm opt-in consent to participate in shared travel.'
      );
    }

    if (homeAreaCoarse) {
      assertCoarseLocationPrivacy(homeAreaCoarse, 'homeAreaCoarse');
      this.homeAreaCoarse = sanitizeCoarseArea(homeAreaCoarse);
    }

    if (preferredPseudonym && preferredPseudonym.length >= 2) {
      this.preferredPseudonym = preferredPseudonym.trim();
    }

    if (defaultCampus) {
      this.defaultCampus = defaultCampus.trim();
    }

    if (Array.isArray(allowedModes) && allowedModes.length > 0) {
      this.allowedModes = allowedModes;
    }

    if (visibility) {
      this.visibility = visibility;
    }

    this.sharingEnabled = true;
    this.consentConfirmedAt = now;
    this.updatedAt = now;
    return this;
  }

  /**
   * Disables shared travel participation and revokes active sharing.
   *
   * @param {number} [now=Date.now()]
   * @returns {this}
   */
  optOut(now = Date.now()) {
    this.sharingEnabled = false;
    this.updatedAt = now;
    return this;
  }

  /**
   * Whether the student is eligible to participate in shared travel.
   *
   * @returns {boolean}
   */
  canParticipate() {
    return Boolean(this.sharingEnabled && this.consentConfirmedAt);
  }

  /**
   * Asserts that sharing is enabled; throws ForbiddenError if disabled.
   *
   * @throws {ForbiddenError}
   */
  assertCanParticipate() {
    if (!this.canParticipate()) {
      throw new ForbiddenError(
        'Sharing is disabled until student explicitly opts in to voluntary travel coordination.'
      );
    }
  }

  /**
   * Serializes preference to plain object.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      userId: this.userId,
      sharingEnabled: this.sharingEnabled,
      consentConfirmedAt: this.consentConfirmedAt,
      preferredPseudonym: this.preferredPseudonym,
      visibility: this.visibility,
      homeAreaCoarse: this.homeAreaCoarse,
      defaultCampus: this.defaultCampus,
      allowedModes: this.allowedModes,
      maxGroupSizePreference: this.maxGroupSizePreference,
      updatedAt: this.updatedAt
    };
  }

  static fromRow(row) {
    if (!row) return null;
    let allowedModes = undefined;
    if (typeof row.allowed_modes === 'string') {
      try {
        allowedModes = JSON.parse(row.allowed_modes);
      } catch (e) {
        allowedModes = undefined;
      }
    }

    return new StudentTravelSharingPreference({
      userId: row.user_id,
      sharingEnabled: Boolean(row.sharing_enabled),
      consentConfirmedAt: row.consent_confirmed_at ? Number(row.consent_confirmed_at) : null,
      preferredPseudonym: row.preferred_pseudonym || 'Student_Commuter',
      visibility: row.visibility || SHARING_VISIBILITY.CAMPUS_ONLY,
      homeAreaCoarse: row.home_area_coarse || null,
      defaultCampus: row.default_campus || 'DJ Sanghvi College of Engineering',
      allowedModes: allowedModes,
      maxGroupSizePreference: Number(row.max_group_size_preference || 4),
      updatedAt: Number(row.updated_at || Date.now())
    });
  }

  toRow() {
    return {
      user_id: this.userId,
      sharing_enabled: this.sharingEnabled ? 1 : 0,
      consent_confirmed_at: this.consentConfirmedAt,
      preferred_pseudonym: this.preferredPseudonym,
      visibility: this.visibility,
      home_area_coarse: this.homeAreaCoarse,
      default_campus: this.defaultCampus,
      allowed_modes: JSON.stringify(this.allowedModes),
      max_group_size_preference: this.maxGroupSizePreference,
      updated_at: this.updatedAt
    };
  }
}

module.exports = {
  StudentTravelSharingPreference,
  studentTravelSharingPreferenceSchema
};
