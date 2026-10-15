/**
 * Shared Travel & Voluntary Commute Coordination Routes
 *
 * Exposes authenticated endpoints for:
 * - Creating and listing voluntary shared journeys
 * - Viewing journey details (shielding participant identities from non-members)
 * - Inviting participants and requesting to join
 * - Accepting (explicit consent) and declining invitations
 * - Voluntary withdrawal and journey cancellation
 * - Privacy-aware journey discovery and matching
 * - Supported public meeting-point suggestions
 * - Sharing consent preferences management
 */

const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { idParamSchema } = require('../validators/commonValidators');
const {
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
} = require('../validators/sharedTravelValidators');
const sharedTravelController = require('../controllers/sharedTravelController');

function createSharedTravelRoutes() {
  const router = express.Router();

  // Guard all shared-travel endpoints with student authentication
  router.use('/shared-travel', authenticate);
  router.use('/student/shared-travel', authenticate);

  // Helper to register identical route handlers on both /shared-travel and /student/shared-travel
  function dualRoute(method, path, ...handlers) {
    router[method](`/shared-travel${path}`, ...handlers);
    router[method](`/student/shared-travel${path}`, ...handlers);
  }

  // --------------------------------------------------------------------------
  // 1. Consent Preferences
  // --------------------------------------------------------------------------
  dualRoute('get', '/preferences', sharedTravelController.getPreferences);
  dualRoute(
    'put',
    '/preferences',
    validate(updateSharingPreferencesSchema, 'body'),
    sharedTravelController.updatePreferences
  );

  // --------------------------------------------------------------------------
  // 2. Meeting Points (Must be declared before /:id parameter)
  // --------------------------------------------------------------------------
  dualRoute(
    'get',
    '/meeting-points',
    validate(meetingPointQuerySchema, 'query'),
    sharedTravelController.getMeetingPoints
  );

  // --------------------------------------------------------------------------
  // 3. Journey Matching & Discovery (Must be declared before /:id parameter)
  // --------------------------------------------------------------------------
  dualRoute(
    'post',
    '/journeys/match',
    validate(matchJourneysQuerySchema, 'body'),
    sharedTravelController.discoverMatches
  );

  // --------------------------------------------------------------------------
  // 4. Journey Collection & Creation
  // --------------------------------------------------------------------------
  dualRoute('get', '/journeys', sharedTravelController.listMyJourneys);
  dualRoute(
    'post',
    '/journeys',
    validate(createSharedJourneySchema, 'body'),
    sharedTravelController.createJourney
  );

  // --------------------------------------------------------------------------
  // 5. Journey Details & Updates
  // --------------------------------------------------------------------------
  dualRoute(
    'get',
    '/journeys/:id',
    validate(idParamSchema, 'params'),
    sharedTravelController.getJourneyDetails
  );
  dualRoute(
    'patch',
    '/journeys/:id',
    validate(idParamSchema, 'params'),
    validate(updateSharedJourneySchema, 'body'),
    sharedTravelController.updateJourney
  );

  // --------------------------------------------------------------------------
  // 6. Membership Actions: Invite & Request to Join
  // --------------------------------------------------------------------------
  dualRoute(
    'post',
    '/journeys/:id/invite',
    validate(idParamSchema, 'params'),
    validate(inviteParticipantSchema, 'body'),
    sharedTravelController.inviteParticipant
  );
  dualRoute(
    'post',
    '/journeys/:id/join',
    validate(idParamSchema, 'params'),
    validate(requestJoinSchema, 'body'),
    sharedTravelController.requestToJoin
  );

  // --------------------------------------------------------------------------
  // 7. Participation Decisions: Accept, Decline, Withdraw, Cancel
  // --------------------------------------------------------------------------
  dualRoute(
    'post',
    '/journeys/:id/accept',
    validate(idParamSchema, 'params'),
    validate(acceptInvitationSchema, 'body'),
    sharedTravelController.acceptInvitation
  );
  dualRoute(
    'post',
    '/journeys/:id/decline',
    validate(idParamSchema, 'params'),
    validate(declineInvitationSchema, 'body'),
    sharedTravelController.declineInvitation
  );
  dualRoute(
    'post',
    '/journeys/:id/withdraw',
    validate(idParamSchema, 'params'),
    validate(withdrawParticipationSchema, 'body'),
    sharedTravelController.withdrawParticipation
  );
  dualRoute(
    'post',
    '/journeys/:id/cancel',
    validate(idParamSchema, 'params'),
    validate(cancelJourneySchema, 'body'),
    sharedTravelController.cancelJourney
  );

  return router;
}

module.exports = createSharedTravelRoutes;
