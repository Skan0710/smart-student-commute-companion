/**
 * Ride Groups Feature Service
 *
 * Feature-specific frontend functions for the Travel Together feature.
 * Wraps the centralized API client (api.js) so presentation components
 * never call raw endpoints directly.
 *
 * BACKEND DEPENDENCIES (real, existing endpoints — see README API table):
 * - GET  /api/ride-groups        (query: page, limit, mode, origin, destination, status)
 * - POST /api/ride-groups
 * - POST /api/ride-groups/:id/join
 *
 * All functions resolve with parsed JSON and reject with FrontendApiError
 * carrying user-friendly messages (never stack traces).
 */
import { fetchRideGroups, postRideGroup, joinRideGroup, FrontendApiError } from './api';

/**
 * List active commute groups.
 *
 * Request-state contract:
 * - A 2xx response reporting `success: false` rejects instead of resolving to
 *   an empty list, so screens render their error state rather than a false
 *   "no groups" empty state. A genuinely empty feed still resolves to [].
 *
 * @param {Object} [filters] - { page, limit, mode, origin, destination, status }
 * @returns {Promise<Array>} Normalized group list
 * @throws {FrontendApiError} When the request or the reported result failed
 */
export async function listGroups(filters = {}) {
  const res = await fetchRideGroups(filters);
  if (res?.success === false) {
    throw new FrontendApiError(
      res.message || 'Commute groups could not be loaded right now. Please try again.',
      null
    );
  }
  return Array.isArray(res?.groups) ? res.groups : [];
}

/**
 * Create a new commute coordination group.
 * @param {Object} group - Group payload
 */
export function createGroup(group) {
  return postRideGroup(group);
}

/**
 * Join an existing commute group.
 * @param {string} groupId
 */
export function joinGroup(groupId) {
  return joinRideGroup(groupId);
}

// ─── Voluntary Privacy-Aware Shared Travel (Day 21 Backend Integration) ─────

import {
  createSharedJourney as createSharedJourneyApi,
  fetchSharedJourneyDetails,
  inviteSharedJourneyMember,
  joinSharedJourney as joinSharedJourneyApi,
  acceptSharedJourneyInvitation,
  declineSharedJourneyInvitation,
  withdrawSharedJourney,
  cancelSharedJourney as cancelSharedJourneyApi,
  matchSharedJourneys,
  fetchMeetingPoints,
  fetchSharingPreferences,
  updateSharingPreferences
} from './api';

/**
 * Create a new voluntary shared journey
 * @param {Object} journeyData
 */
export async function createVoluntaryJourney(journeyData) {
  return createSharedJourneyApi(journeyData);
}

/**
 * Accept invitation to a shared travel journey with explicit consent
 * @param {string} journeyId
 */
export async function acceptJourneyInvite(journeyId) {
  return acceptSharedJourneyInvitation(journeyId);
}

/**
 * Decline invitation without penalty
 * @param {string} journeyId
 * @param {string} [reason]
 */
export async function declineJourneyInvite(journeyId, reason) {
  return declineSharedJourneyInvitation(journeyId, reason);
}

/**
 * Withdraw participation from a shared journey
 * @param {string} journeyId
 */
export async function withdrawFromJourney(journeyId) {
  return withdrawSharedJourney(journeyId);
}

/**
 * Cancel a shared journey (Organizer only)
 * @param {string} journeyId
 * @param {string} [reason]
 */
export async function cancelJourney(journeyId, reason) {
  return cancelSharedJourneyApi(journeyId, reason);
}

/**
 * Fetch verified public transit meeting points
 * @param {Object} query
 */
export async function getMeetingPoints(query) {
  try {
    const res = await fetchMeetingPoints(query);
    const data = res?.data || res;
    return Array.isArray(data?.meetingPoints) ? data.meetingPoints : [];
  } catch (err) {
    return [];
  }
}

/**
 * Get student travel sharing consent preferences
 */
export async function getSharingConsent() {
  return fetchSharingPreferences();
}

/**
 * Update student travel sharing consent preferences
 * @param {boolean} enabled
 */
export async function setSharingConsent(enabled) {
  return updateSharingPreferences({ sharingEnabled: enabled });
}
