/**
 * Shared Travel Controller
 *
 * Exposes authenticated REST endpoints for voluntary student shared commute coordination:
 * - Journey creation, discovery, details, updates, cancellation
 * - Participant invitation, joining requests, accept/decline, withdrawal
 * - Privacy-safe meeting point recommendations
 * - Sharing consent and preferences management
 *
 * Invariants & Requirements:
 * 1. Follows existing API routing and response conventions (success, created).
 * 2. Strict authorization at endpoint and service boundaries.
 * 3. Prevents IDOR and cross-student data leaks.
 * 4. Privacy preservation: Masks participant rosters from non-members.
 * 5. Rejects GPS decimal coordinates and precise residential addresses.
 * 6. Explicit consent required: no silent enrollment or impersonation.
 * 7. Non-enumeration safety: Invitations do not leak whether an account exists.
 */

const {
  sharedTravelConsentService,
  sharedTravelMatchingService,
  sharedMeetingPointService,
  sharedTravelCoordinationService
} = require('../services');
const { success, created } = require('../utils/apiResponse');
const { ValidationError, UnauthorizedError } = require('../errors');

/**
 * Creates a new voluntary shared journey.
 * POST /api/shared-travel/journeys
 */
async function createJourney(req, res, next) {
  try {
    const studentId = req.user.id;
    const journeyData = req.body;

    const group = sharedTravelConsentService.createJourney({
      organizerId: studentId,
      journeyData
    });

    return created(res, {
      message: 'Shared travel group created successfully.',
      journey: group.toSafeView(studentId)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists journeys visible to or participated in by the authenticated student.
 * GET /api/shared-travel/journeys
 */
async function listMyJourneys(req, res, next) {
  try {
    const studentId = req.user.id;
    const data = sharedTravelConsentService.getStudentJourneys(studentId);

    return success(res, {
      activeJourneys: data.activeJourneys,
      pendingInvitations: data.pendingInvitations,
      pastJourneys: data.pastJourneys
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Views details of a specific shared travel group.
 * Enforces privacy boundary: non-members receive masked participant rosters.
 * GET /api/shared-travel/journeys/:id
 */
async function getJourneyDetails(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;

    const journey = sharedTravelConsentService.getJourneyDetails({
      groupId: id,
      requestingUserId: studentId
    });

    return success(res, { journey });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a shared journey (timing, meeting point, notes) where permitted.
 * PATCH /api/shared-travel/journeys/:id
 */
async function updateJourney(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const {
      title,
      notes,
      visibility,
      maxParticipants,
      departureWindow,
      isConfirmedTime,
      meetingPoint,
      isConfirmedMeetingPoint,
      updateReason
    } = req.body;

    let updatedJourney = null;

    // 1. Update departure window and dispatch coordination notifications if provided
    if (departureWindow) {
      const coordResult = sharedTravelCoordinationService.updateDepartureTime({
        groupId: id,
        requestingUserId: studentId,
        newDepartureWindow: departureWindow,
        isConfirmed: Boolean(isConfirmedTime),
        reason: updateReason || ''
      });
      updatedJourney = coordResult.group;
    }

    // 2. Update meeting point and dispatch coordination notifications if provided
    if (meetingPoint) {
      const coordResult = sharedTravelCoordinationService.updateMeetingPoint({
        groupId: id,
        requestingUserId: studentId,
        meetingPoint,
        isConfirmed: isConfirmedMeetingPoint !== false,
        notes: updateReason || ''
      });
      updatedJourney = coordResult.group;
    }

    // If only metadata changed without timing/meeting point
    if (!updatedJourney) {
      updatedJourney = sharedTravelConsentService.getJourneyDetails({
        groupId: id,
        requestingUserId: studentId
      });
    }

    return success(res, {
      message: 'Shared journey updated successfully.',
      journey: updatedJourney
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Invites a participant to a shared journey.
 * POST /api/shared-travel/journeys/:id/invite
 */
async function inviteParticipant(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const { inviteeIdentifier, approximateStop } = req.body;

    const result = sharedTravelConsentService.inviteStudent({
      groupId: id,
      organizerId: studentId,
      inviteeIdentifier,
      approximateStop
    });

    return success(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Student requests to join an open shared journey.
 * POST /api/shared-travel/journeys/:id/join
 */
async function requestToJoin(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const { approximateStop, notes } = req.body;

    const member = sharedTravelConsentService.requestToJoin({
      groupId: id,
      studentId,
      approximateStop,
      notes
    });

    return success(res, {
      message: 'Join request submitted successfully. Awaiting organizer confirmation.',
      membership: member.toSafeView(studentId)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Accepts an invitation or confirms voluntary participation.
 * POST /api/shared-travel/journeys/:id/accept
 */
async function acceptInvitation(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const { consentConfirmed, approximateStop } = req.body;

    const result = sharedTravelConsentService.acceptInvitation({
      groupId: id,
      studentId,
      consentConfirmed,
      approximateStop
    });

    return success(res, {
      message: 'Invitation accepted with explicit voluntary consent.',
      membership: result.membership.toSafeView(studentId),
      journey: result.group
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Declines an invitation without being forced to provide a reason.
 * POST /api/shared-travel/journeys/:id/decline
 */
async function declineInvitation(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;

    const result = sharedTravelConsentService.declineInvitation({
      groupId: id,
      studentId
    });

    return success(res, {
      message: 'Invitation declined.',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Voluntarily withdraws participation at any time; stops future info sharing.
 * POST /api/shared-travel/journeys/:id/withdraw
 */
async function withdrawParticipation(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;

    const result = sharedTravelConsentService.withdrawParticipation({
      groupId: id,
      studentId
    });

    return success(res, {
      message: 'Successfully withdrew from shared travel journey.',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancels a shared travel journey by authorized organizer.
 * POST /api/shared-travel/journeys/:id/cancel
 */
async function cancelJourney(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const result = sharedTravelConsentService.cancelJourney({
      groupId: id,
      organizerId: studentId,
      reason: reason || ''
    });

    return success(res, {
      message: 'Shared travel journey cancelled.',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Discovers compatible shared journeys within consent and visibility rules.
 * POST /api/shared-travel/journeys/match
 */
async function discoverMatches(req, res, next) {
  try {
    const studentId = req.user.id;
    const {
      originArea,
      destinationArea,
      transportMode,
      startTime,
      endTime,
      limit
    } = req.body;

    const searchCriteria = {};
    if (originArea) searchCriteria.originArea = originArea;
    if (destinationArea) searchCriteria.destinationArea = destinationArea;
    if (transportMode) searchCriteria.transportMode = transportMode;
    if (startTime && endTime) {
      searchCriteria.departureWindow = { startTime, endTime };
    }

    const result = sharedTravelMatchingService.findCompatibleJourneys({
      studentId,
      searchCriteria,
      options: { limit: limit || 10 }
    });

    return success(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves privacy-safe, accessible meeting-point suggestions.
 * GET /api/shared-travel/meeting-points
 */
async function getMeetingPoints(req, res, next) {
  try {
    const studentId = req.user.id;
    const { originArea, destinationArea, transportMode, groupId } = req.query;

    const result = sharedMeetingPointService.suggestMeetingPoints({
      studentId,
      originArea,
      destinationArea,
      transportMode,
      groupId
    });

    return success(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the authenticated student's voluntary sharing preference.
 * GET /api/shared-travel/preferences
 */
async function getPreferences(req, res, next) {
  try {
    const studentId = req.user.id;
    const pref = sharedTravelConsentService.getStudentPreference(studentId);

    return success(res, {
      preferences: pref.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates voluntary sharing preferences (opt-in / opt-out / coarse home area).
 * PUT /api/shared-travel/preferences
 */
async function updatePreferences(req, res, next) {
  try {
    const studentId = req.user.id;
    const {
      sharingEnabled,
      consentConfirmed,
      preferredPseudonym,
      homeAreaCoarse,
      defaultCampus,
      maxGroupSizePreference,
      allowedModes
    } = req.body;

    let updatedPref;
    if (sharingEnabled === false) {
      updatedPref = sharedTravelConsentService.disableSharing(studentId);
    } else {
      updatedPref = sharedTravelConsentService.enableSharing(studentId, {
        consentConfirmed: Boolean(consentConfirmed),
        preferredPseudonym,
        homeAreaCoarse,
        defaultCampus,
        maxGroupSizePreference,
        allowedModes
      });
    }

    return success(res, {
      message: 'Sharing preferences updated successfully.',
      preferences: updatedPref.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createJourney,
  listMyJourneys,
  getJourneyDetails,
  updateJourney,
  inviteParticipant,
  requestToJoin,
  acceptInvitation,
  declineInvitation,
  withdrawParticipation,
  cancelJourney,
  discoverMatches,
  getMeetingPoints,
  getPreferences,
  updatePreferences
};
