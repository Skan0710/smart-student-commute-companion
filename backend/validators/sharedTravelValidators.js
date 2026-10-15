/**
 * Shared Travel Validation Schemas
 *
 * Provides strongly-typed Zod schemas for the voluntary shared student commute
 * domain and API endpoints.
 *
 * Invariants & Requirements:
 * 1. Privacy-by-design: coarse areas only (e.g. 'Andheri West'), strictly rejecting precise GPS coordinates and residential addresses.
 * 2. Anti-tracking: rejects coordinates, live telemetry, device IDs, and location history fields.
 * 3. Explicit consent: student must confirm voluntary consent to participate.
 * 4. Clean boundaries: limits query inputs and prevents unauthorized parameter tampering.
 */

const { z } = require('zod');
const {
  sharedTravelStatusEnum,
  sharedMemberStatusEnum,
  sharingVisibilityEnum,
  meetingPointTypeEnum,
  travelDepartureWindowSchema,
  suggestedMeetingPointSchema,
  transportModeEnum,
  assertCoarseLocationPrivacy,
  findForbiddenTravelPrivacyFields
} = require('../models/SharedTravelContracts');

/**
 * Validates coarse location string input.
 */
function coarseLocationString(fieldName) {
  return z.string()
    .trim()
    .min(2, `${fieldName} must be at least 2 characters`)
    .max(100, `${fieldName} cannot exceed 100 characters`)
    .refine(val => {
      try {
        assertCoarseLocationPrivacy(val, fieldName);
        return true;
      } catch {
        return false;
      }
    }, {
      message: `${fieldName} contains precise GPS coordinates or residential address patterns. Only coarse public areas are allowed.`
    });
}

/**
 * Validates travel departure window input payload.
 */
const departureWindowInputSchema = z.object({
  startTime: z.number().int().positive('Departure window startTime must be a positive integer timestamp'),
  endTime: z.number().int().positive('Departure window endTime must be a positive integer timestamp'),
  preferredDepartureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'preferredDepartureTime must be HH:MM format').optional(),
  flexMinutes: z.number().int().min(0).max(60).optional().default(15)
}).refine(data => data.endTime >= data.startTime, {
  message: 'Departure window endTime must be greater than or equal to startTime',
  path: ['endTime']
});

/**
 * Validates meeting point input payload.
 */
const meetingPointInputSchema = z.object({
  name: coarseLocationString('Meeting point name'),
  area: coarseLocationString('Meeting point area'),
  landmark: z.string().trim().max(100).optional().default(''),
  type: meetingPointTypeEnum.optional().default('station_gate'),
  notes: z.string().trim().max(250).optional().default('')
});

/**
 * Schema for POST /shared-travel/journeys (Create Journey)
 */
const createSharedJourneySchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(100, 'Title cannot exceed 100 characters'),
  originArea: coarseLocationString('Origin area'),
  destinationArea: coarseLocationString('Destination area'),
  departureWindow: departureWindowInputSchema,
  transportMode: transportModeEnum.optional().default('train'),
  journeyReference: z.string().trim().max(100).optional().default(''),
  suggestedMeetingPoint: meetingPointInputSchema.optional(),
  maxParticipants: z.number().int().min(2, 'Minimum participants is 2').max(10, 'Maximum participants is 10').optional().default(4),
  visibility: sharingVisibilityEnum.optional().default('campus_only'),
  notes: z.string().trim().max(300).optional().default('')
}).superRefine((data, ctx) => {
  const forbidden = findForbiddenTravelPrivacyFields(data);
  if (forbidden.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Privacy violation: Forbidden tracking or residential fields detected: ${forbidden.join(', ')}`
    });
  }
});

/**
 * Schema for PATCH /shared-travel/journeys/:id (Update Journey)
 */
const updateSharedJourneySchema = z.object({
  title: z.string().trim().min(3).max(100).optional(),
  notes: z.string().trim().max(300).optional(),
  visibility: sharingVisibilityEnum.optional(),
  maxParticipants: z.number().int().min(2).max(10).optional(),
  departureWindow: departureWindowInputSchema.optional(),
  isConfirmedTime: z.boolean().optional(),
  meetingPoint: meetingPointInputSchema.optional(),
  isConfirmedMeetingPoint: z.boolean().optional(),
  updateReason: z.string().trim().max(200).optional().default('')
}).superRefine((data, ctx) => {
  const forbidden = findForbiddenTravelPrivacyFields(data);
  if (forbidden.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Privacy violation: Forbidden tracking or residential fields detected: ${forbidden.join(', ')}`
    });
  }
});

/**
 * Schema for POST /shared-travel/journeys/:id/invite
 */
const inviteParticipantSchema = z.object({
  inviteeIdentifier: z.string().trim().min(1, 'Invitee identifier (user ID, email, or username) is required').max(120),
  approximateStop: z.string().trim().max(100).optional()
}).superRefine((data, ctx) => {
  if (data.approximateStop) {
    try {
      assertCoarseLocationPrivacy(data.approximateStop, 'approximateStop');
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approximateStop'],
        message: e.message
      });
    }
  }
});

/**
 * Schema for POST /shared-travel/journeys/:id/join (Request to join open journey)
 */
const requestJoinSchema = z.object({
  approximateStop: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(250).optional()
}).superRefine((data, ctx) => {
  if (data.approximateStop) {
    try {
      assertCoarseLocationPrivacy(data.approximateStop, 'approximateStop');
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approximateStop'],
        message: e.message
      });
    }
  }
});

/**
 * Schema for POST /shared-travel/journeys/:id/accept (Explicit Consent)
 */
const acceptInvitationSchema = z.object({
  consentConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'Explicit consent confirmation is required. consentConfirmed must be strictly true.' })
  }),
  approximateStop: z.string().trim().max(100).optional()
}).superRefine((data, ctx) => {
  if (data.approximateStop) {
    try {
      assertCoarseLocationPrivacy(data.approximateStop, 'approximateStop');
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approximateStop'],
        message: e.message
      });
    }
  }
});

/**
 * Schema for POST /shared-travel/journeys/:id/decline
 */
const declineInvitationSchema = z.object({
  reason: z.string().trim().max(200).optional()
});

/**
 * Schema for POST /shared-travel/journeys/:id/withdraw
 */
const withdrawParticipationSchema = z.object({
  reason: z.string().trim().max(200).optional()
});

/**
 * Schema for POST /shared-travel/journeys/:id/cancel
 */
const cancelJourneySchema = z.object({
  reason: z.string().trim().max(200).optional().default('')
});

/**
 * Schema for POST /shared-travel/journeys/match (Discovery)
 */
const matchJourneysQuerySchema = z.object({
  originArea: z.string().trim().max(100).optional(),
  destinationArea: z.string().trim().max(100).optional(),
  transportMode: transportModeEnum.optional(),
  startTime: z.coerce.number().int().positive().optional(),
  endTime: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10)
}).superRefine((data, ctx) => {
  const forbidden = findForbiddenTravelPrivacyFields(data);
  if (forbidden.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Privacy violation: Forbidden tracking or residential fields detected: ${forbidden.join(', ')}`
    });
  }
  if (data.originArea) {
    try {
      assertCoarseLocationPrivacy(data.originArea, 'originArea');
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['originArea'], message: e.message });
    }
  }
  if (data.destinationArea) {
    try {
      assertCoarseLocationPrivacy(data.destinationArea, 'destinationArea');
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destinationArea'], message: e.message });
    }
  }
});

/**
 * Schema for GET /shared-travel/meeting-points (Suggestions)
 */
const meetingPointQuerySchema = z.object({
  originArea: z.string().trim().max(100).optional(),
  destinationArea: z.string().trim().max(100).optional(),
  transportMode: transportModeEnum.optional(),
  groupId: z.string().trim().max(100).optional()
}).superRefine((data, ctx) => {
  const forbidden = findForbiddenTravelPrivacyFields(data);
  if (forbidden.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Privacy violation: Forbidden tracking or residential fields detected: ${forbidden.join(', ')}`
    });
  }
  if (data.originArea) {
    try {
      assertCoarseLocationPrivacy(data.originArea, 'originArea');
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['originArea'], message: e.message });
    }
  }
  if (data.destinationArea) {
    try {
      assertCoarseLocationPrivacy(data.destinationArea, 'destinationArea');
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destinationArea'], message: e.message });
    }
  }
});

/**
 * Schema for PUT /shared-travel/preferences
 */
const updateSharingPreferencesSchema = z.object({
  sharingEnabled: z.boolean().optional(),
  consentConfirmed: z.boolean().optional(),
  preferredPseudonym: z.string().trim().min(2).max(50).optional(),
  homeAreaCoarse: z.string().trim().max(100).optional(),
  defaultCampus: z.string().trim().max(100).optional(),
  maxGroupSizePreference: z.number().int().min(2).max(10).optional(),
  allowedModes: z.array(transportModeEnum).min(1).optional()
}).superRefine((data, ctx) => {
  const forbidden = findForbiddenTravelPrivacyFields(data);
  if (forbidden.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Privacy violation: Forbidden tracking or residential fields detected: ${forbidden.join(', ')}`
    });
  }
  if (data.homeAreaCoarse) {
    try {
      assertCoarseLocationPrivacy(data.homeAreaCoarse, 'homeAreaCoarse');
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['homeAreaCoarse'], message: e.message });
    }
  }
});

module.exports = {
  createSharedJourneySchema,
  updateSharedJourneySchema,
  inviteParticipantSchema,
  requestJoinSchema,
  acceptInvitationSchema,
  declineInvitationSchema,
  withdrawParticipationSchema,
  cancelJourneySchema,
  matchJourneysQuerySchema,
  meetingPointQuerySchema,
  updateSharingPreferencesSchema
};
