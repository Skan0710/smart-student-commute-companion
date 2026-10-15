/**
 * Shared Travel Domain Contracts & Value Objects
 *
 * Establishes formal contracts, enums, value objects, and privacy safeguards
 * for voluntary student travel coordination.
 *
 * Invariants:
 * - Voluntary participation: sharing is strictly disabled until the student explicitly opts in.
 * - Privacy-by-design: coarse areas only (e.g., "Andheri West", "Vile Parle Station"), never precise residential addresses or door numbers.
 * - Anti-tracking: rejects GPS decimal coordinates, device IDs, breadcrumbs, and live telemetry tracking.
 * - Clear lifecycle states: draft, open, active, completed, cancelled, expired.
 * - Ephemeral boundaries: bounded travel windows and automatic expiration.
 */

const { z } = require('zod');
const { transportModeEnum, TRANSPORT_MODES } = require('./CommuteContracts');
const { ValidationError, ForbiddenError } = require('../errors');

// ============================================================================
// 1. CONSTANTS & ENUMS
// ============================================================================

/**
 * Lifecycle states for a shared travel group / journey.
 */
const SHARED_TRAVEL_STATUSES = Object.freeze({
  DRAFT: 'draft',
  OPEN: 'open',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
});

const sharedTravelStatusEnum = z.enum([
  'draft',
  'open',
  'active',
  'completed',
  'cancelled',
  'expired'
]);

/**
 * Membership & invitation lifecycle states for participants.
 */
const SHARED_MEMBER_STATUSES = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  LEFT: 'left',
  REMOVED: 'removed',
  CANCELLED: 'cancelled'
});

const sharedMemberStatusEnum = z.enum([
  'pending',
  'accepted',
  'declined',
  'left',
  'removed',
  'cancelled'
]);

/**
 * Participant roles within a shared travel coordination group.
 */
const SHARED_MEMBER_ROLES = Object.freeze({
  ORGANIZER: 'organizer',
  PARTICIPANT: 'participant'
});

const sharedMemberRoleEnum = z.enum(['organizer', 'participant']);

/**
 * Explicit voluntary consent states.
 */
const TRAVEL_CONSENT_STATUSES = Object.freeze({
  OPTED_IN: 'opted_in',
  OPTED_OUT: 'opted_out'
});

const travelConsentStatusEnum = z.enum(['opted_in', 'opted_out']);

/**
 * Meeting point classification types (coarse public hubs only).
 */
const MEETING_POINT_TYPES = Object.freeze({
  STATION_GATE: 'station_gate',
  BUS_STOP: 'bus_stop',
  COLLEGE_GATE: 'college_gate',
  CAMPUS_LANDMARK: 'campus_landmark',
  TRANSIT_HUB: 'transit_hub',
  PUBLIC_SQUARE: 'public_square',
  OTHER_PUBLIC: 'other_public'
});

const meetingPointTypeEnum = z.enum([
  'station_gate',
  'bus_stop',
  'college_gate',
  'campus_landmark',
  'transit_hub',
  'public_square',
  'other_public'
]);

/**
 * Visibility scope for shared travel discovery.
 */
const SHARING_VISIBILITY = Object.freeze({
  CAMPUS_ONLY: 'campus_only',
  INVITE_ONLY: 'invite_only',
  MUTUAL_COMMUTERS: 'mutual_commuters'
});

const sharingVisibilityEnum = z.enum([
  'campus_only',
  'invite_only',
  'mutual_commuters'
]);

// ============================================================================
// 2. PRIVACY & SANITIZATION SAFEGUARDS
// ============================================================================

/**
 * Forbidden privacy-invasive, tracking, or precise residential fields.
 */
const FORBIDDEN_SHARED_TRAVEL_FIELDS = Object.freeze([
  'homeAddress',
  'home_address',
  'residentialAddress',
  'residential_address',
  'streetAddress',
  'street_address',
  'doorNumber',
  'door_number',
  'flatNumber',
  'flat_number',
  'roomNumber',
  'room_number',
  'exactLocation',
  'exact_location',
  'preciseLocation',
  'precise_location',
  'coordinates',
  'coords',
  'lat',
  'latitude',
  'lon',
  'lng',
  'longitude',
  'gps',
  'tracking',
  'currentLocation',
  'current_location',
  'liveLocation',
  'live_location',
  'locationHistory',
  'location_history',
  'trackingPoints',
  'tracking_points',
  'breadcrumbs',
  'deviceId',
  'device_id',
  'imei',
  'macAddress',
  'mac_address'
]);

/**
 * Recursively inspects an object for forbidden privacy or tracking fields.
 *
 * @param {object} obj
 * @returns {string[]} Array of prohibited field names detected
 */
function findForbiddenTravelPrivacyFields(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const detected = [];

  for (const field of FORBIDDEN_SHARED_TRAVEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, field) && obj[field] !== undefined) {
      detected.push(field);
    }
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = findForbiddenTravelPrivacyFields(val);
      detected.push(...nested);
    }
  }

  return Array.from(new Set(detected));
}

/**
 * Validates that location and meeting point strings are coarse and public,
 * strictly rejecting GPS decimal coordinates, residential flat/room patterns, and door numbers.
 *
 * @param {string} text
 * @param {string} [fieldName='location']
 * @returns {boolean}
 * @throws {ValidationError}
 */
function assertCoarseLocationPrivacy(text, fieldName = 'location') {
  if (!text || typeof text !== 'string') return true;

  // 1. Reject GPS decimal coordinates like "19.1234, 72.8456"
  if (/-?\d+\.\d{3,}\s*,\s*-?\d+\.\d{3,}/.test(text)) {
    throw new ValidationError(
      `Privacy violation: ${fieldName} contains exact GPS coordinates. Only coarse, public location names are permitted.`
    );
  }

  // 2. Reject residential address identifiers like "Flat 402", "Room 3B", "Apt 12", "Door 5", "Building 4"
  if (/\b(?:flat|room|apt|apartment|door|house|plot|bungalow)\s*#?\s*\w+/i.test(text)) {
    throw new ValidationError(
      `Privacy violation: ${fieldName} contains residential address details. Only coarse public areas or campus hubs are permitted.`
    );
  }

  return true;
}

/**
 * Cleanses a location string by removing incidental coordinate patterns or residential markers.
 *
 * @param {string} location
 * @param {string} [fallback='Mumbai Metropolitan Region']
 * @returns {string}
 */
function sanitizeCoarseArea(location, fallback = 'Mumbai Metropolitan Region') {
  if (!location || typeof location !== 'string') return fallback;

  let cleaned = location
    .replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '')
    .replace(/\b\d+\.\d{3,}\b/g, '')
    .replace(/(?:flat|room|apt|door|house|plot|bungalow)\s*#?\s*\w+[\s,]*/gi, '')
    .replace(/\b\d{6}\b/g, '') // Indian 6-digit postal pincodes
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();

  return cleaned.length >= 2 ? cleaned : fallback;
}

// ============================================================================
// 3. VALUE OBJECT SCHEMAS
// ============================================================================

/**
 * Proposed travel departure window.
 */
const travelDepartureWindowSchema = z.object({
  startTime: z.number().int().positive('Departure window start time must be a positive integer timestamp'),
  endTime: z.number().int().positive('Departure window end time must be a positive integer timestamp'),
  preferredDepartureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Preferred departure time must be HH:MM format').optional(),
  flexMinutes: z.number().int().min(0).max(60).default(15)
}).refine(data => data.endTime >= data.startTime, {
  message: 'Departure window endTime must be greater than or equal to startTime',
  path: ['endTime']
});

/**
 * Suggested meeting point (coarse public hub only).
 */
const suggestedMeetingPointSchema = z.object({
  name: z.string().min(2, 'Meeting point name must be at least 2 characters').max(100),
  area: z.string().min(2, 'Meeting point area must be at least 2 characters').max(100),
  landmark: z.string().max(100).optional().default(''),
  type: meetingPointTypeEnum.default('station_gate'),
  notes: z.string().max(250).optional().default('')
});

/**
 * Creator/organizer profile summary for shared travel.
 */
const travelOrganizerSchema = z.object({
  userId: z.string().min(1, 'Organizer user ID is required'),
  pseudonym: z.string().min(2, 'Organizer pseudonym must be at least 2 characters').max(50),
  avatarUrl: z.string().url().nullable().optional().default(null)
});

/**
 * Journey compatibility tiers for shared travel matching.
 */
const COMPATIBILITY_TIERS = Object.freeze({
  EXCELLENT: 'EXCELLENT',
  HIGH: 'HIGH',
  MODERATE: 'MODERATE',
  INCOMPATIBLE: 'INCOMPATIBLE'
});

const compatibilityTierEnum = z.enum([
  'EXCELLENT',
  'HIGH',
  'MODERATE',
  'INCOMPATIBLE'
]);

/**
 * Rejection reason codes for incompatible shared journey pairs.
 */
const MATCH_REJECTION_REASONS = Object.freeze({
  DESTINATION_MISMATCH: 'DESTINATION_MISMATCH',
  TIMING_MISMATCH: 'TIMING_MISMATCH',
  MODE_MISMATCH: 'MODE_MISMATCH',
  GROUP_FULL: 'GROUP_FULL',
  GROUP_EXPIRED: 'GROUP_EXPIRED',
  INVITE_ONLY: 'INVITE_ONLY',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  SCORE_BELOW_THRESHOLD: 'SCORE_BELOW_THRESHOLD',
  PRIVACY_VIOLATION: 'PRIVACY_VIOLATION'
});

const matchRejectionReasonEnum = z.enum([
  'DESTINATION_MISMATCH',
  'TIMING_MISMATCH',
  'MODE_MISMATCH',
  'GROUP_FULL',
  'GROUP_EXPIRED',
  'INVITE_ONLY',
  'ALREADY_MEMBER',
  'CONSENT_REQUIRED',
  'SCORE_BELOW_THRESHOLD',
  'PRIVACY_VIOLATION'
]);

module.exports = {
  SHARED_TRAVEL_STATUSES,
  sharedTravelStatusEnum,
  SHARED_MEMBER_STATUSES,
  sharedMemberStatusEnum,
  SHARED_MEMBER_ROLES,
  sharedMemberRoleEnum,
  TRAVEL_CONSENT_STATUSES,
  travelConsentStatusEnum,
  MEETING_POINT_TYPES,
  meetingPointTypeEnum,
  SHARING_VISIBILITY,
  sharingVisibilityEnum,
  FORBIDDEN_SHARED_TRAVEL_FIELDS,
  findForbiddenTravelPrivacyFields,
  assertCoarseLocationPrivacy,
  sanitizeCoarseArea,
  travelDepartureWindowSchema,
  suggestedMeetingPointSchema,
  travelOrganizerSchema,
  TRANSPORT_MODES,
  transportModeEnum,
  COMPATIBILITY_TIERS,
  compatibilityTierEnum,
  MATCH_REJECTION_REASONS,
  matchRejectionReasonEnum
};
