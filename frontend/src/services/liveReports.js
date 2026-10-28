/**
 * Live Reports Feature Service
 *
 * Feature-specific frontend functions for the Live Alerts feature.
 * Wraps the centralized API client (api.js) so presentation components
 * never call raw endpoints directly.
 *
 * BACKEND DEPENDENCIES (real, existing endpoints — see README API table):
 * - GET   /api/live-reports           (query: page, limit, mode, area, impact, status)
 * - POST  /api/live-reports
 * - POST  /api/live-reports/:id/confirm
 * - POST  /api/live-reports/:id/contradict
 *
 * All functions resolve with parsed JSON and reject with FrontendApiError
 * carrying user-friendly messages (never stack traces).
 */
import { readAuthToken } from '../utils/authSession';
import {
  fetchLiveReports,
  postLiveReport,
  confirmReport,
  contradictReport,
  FrontendApiError,
} from './api';

/**
 * List active disruption reports.
 *
 * Request-state contract:
 * - A 2xx response reporting `success: false` rejects instead of resolving to
 *   an empty list, so screens render their error state rather than a false
 *   "no alerts" empty state. A genuinely empty feed still resolves to [].
 *
 * @param {Object} [filters] - { page, limit, mode, area, impact, status }
 * @returns {Promise<Array>} Normalized report list
 * @throws {FrontendApiError} When the request or the reported result failed
 */
export async function listReports(filters = {}) {
  const res = await fetchLiveReports(filters);
  if (res?.success === false) {
    throw new FrontendApiError(
      res.message || 'Live alerts could not be loaded right now. Please try again.',
      null
    );
  }
  return Array.isArray(res?.reports) ? res.reports : [];
}

/**
 * Submit a new community report.
 * @param {Object} report - Report payload
 */
export function createReport(report) {
  return postLiveReport(report);
}

/**
 * Vote "still happening" on a report.
 * @param {string} reportId
 */
export function voteStillHappening(reportId) {
  return confirmReport(reportId);
}

/**
 * Vote "no longer happening" on a report.
 * @param {string} reportId
 */
export function voteCleared(reportId) {
  return contradictReport(reportId);
}

// ─── Commute Disruption Alerts (Backend Day 20) ─────────────────────────────

import {
  fetchCommuteAlerts,
  fetchCommuteAlertDetails,
  dismissCommuteAlert as dismissAlertApi,
  fetchCommuteAlertPreferences,
  updateCommuteAlertPreferences,
  fetchCommuteAlertStatus
} from './api';

/**
 * List active commute disruption alerts from the backend engine.
 * @param {Object} [filters]
 * @returns {Promise<Array>}
 */
export async function listCommuteAlerts(filters = {}) {
  // Official advisories are per-student; guests have none, so skip the guaranteed 401.
  if (!readAuthToken()) return [];
  try {
    const res = await fetchCommuteAlerts(filters);
    const data = res?.data || res;
    return Array.isArray(data?.alerts) ? data.alerts : [];
  } catch (err) {
    return [];
  }
}

/**
 * Dismiss an active commute disruption alert.
 * @param {string} alertId
 */
export async function dismissAlert(alertId) {
  return dismissAlertApi(alertId);
}

/**
 * Get commute alert preferences.
 */
export async function getAlertPreferences() {
  return fetchCommuteAlertPreferences();
}

/**
 * Update commute alert preferences.
 * @param {Object} prefs
 */
export async function setAlertPreferences(prefs) {
  return updateCommuteAlertPreferences(prefs);
}
