import { request } from './api';
import { readAuthToken, readAuthSession } from '../utils/authSession';
import { formatDate, formatClockTime, titleCase } from '../utils/formatters';

/**
 * Student Goals & Milestones (Subsystem E) and
 * Shared Travel Coordination (Subsystem F) service.
 *
 * All endpoints are authenticated. Signed-in students get their real data
 * (adapted from the backend's camelCase rows); failures reject so screens can
 * show an error with a retry. Guests get clearly labelled SAMPLE data without
 * a pointless 401 round trip — results carry `isSample`.
 *
 * Shared travel is strictly opt-in: until the student explicitly consents, the
 * backend answers 403 for journeys' companions such as meeting points, so the
 * loader reports `sharingEnabled: false` and lets the screen ask for consent.
 */

const LIST_LIMIT = 50;

const isSignedIn = () => Boolean(readAuthToken());

const MODE_LABELS = {
  train: 'Local train',
  metro: 'Metro',
  bus: 'BEST bus',
  auto: 'Auto',
  shared_auto: 'Shared auto',
  walk: 'Walk',
};

const modeLabel = (mode) => MODE_LABELS[mode] || titleCase(mode) || 'Mixed';

// ─── Sample data (guests only — always flagged `isSample`) ──────────────────

const SAMPLE_GOALS = [
  { id: 'sample-g1', title: 'Target 9.2+ Semester SGPA across all core subjects', progress: 75, targetDate: 'End of Semester', status: 'in_progress', category: 'Academic' },
  { id: 'sample-g2', title: 'Publish Open-Source Transit & Routing Benchmark Paper', progress: 50, targetDate: 'Dec 15, 2026', status: 'in_progress', category: 'Research' },
  { id: 'sample-g3', title: 'Zero Late Arrivals: Catch the 8:15 AM Western Line Train Daily', progress: 90, targetDate: 'Ongoing', status: 'in_progress', category: 'Habit' },
];

const SAMPLE_JOURNEYS = [
  { id: 'sample-j1', title: 'Andheri Metro → DJ Sanghvi Morning Commute', origin: 'Andheri Metro Station', destination: 'DJ Sanghvi College Campus', departureTime: '08:30', seatsAvailable: 3, mode: 'Auto / walk', organizer: 'Student_A', participantsCount: 2, maxParticipants: 5, isMember: false },
  { id: 'sample-j2', title: 'Borivali Fast Local Safety Buddy Pool', origin: 'Borivali', destination: 'Vile Parle', departureTime: '07:55', seatsAvailable: 4, mode: 'Local train', organizer: 'Student_B', participantsCount: 3, maxParticipants: 7, isMember: false },
  { id: 'sample-j3', title: 'Ghatkopar Metro to Western Line Interchange', origin: 'Ghatkopar', destination: 'Andheri', departureTime: '08:15', seatsAvailable: 2, mode: 'Metro', organizer: 'Student_C', participantsCount: 2, maxParticipants: 4, isMember: false },
];

const SAMPLE_MEETING_POINTS = [
  { id: 'sample-mp1', name: 'Andheri Station East Foot Overbridge Exit', landmark: 'Near Ticket Counter 4' },
  { id: 'sample-mp2', name: 'Vile Parle West Auto Stand Entrance', landmark: 'Outside the subway' },
  { id: 'sample-mp3', name: 'DJ Sanghvi College Main Gate', landmark: 'Campus entrance' },
];

// ─── Adapters ───────────────────────────────────────────────────────────────

function normalizeGoal(goal) {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description || '',
    progress: Math.min(100, Math.max(0, Number(goal.progress) || 0)),
    status: goal.status,
    targetDate: goal.targetDate ? formatDate(goal.targetDate) : 'No target date',
    category: null,
  };
}

function normalizeJourney(journey) {
  const window = journey.departureWindow || {};
  const session = readAuthSession();
  const maxParticipants = journey.maxParticipants ?? null;
  const joined = journey.currentParticipantCount ?? 0;
  return {
    id: journey.id,
    title: journey.title,
    origin: journey.originArea,
    destination: journey.destinationArea,
    departureTime: window.preferredDepartureTime || formatClockTime(window.startTime),
    departureDate: formatDate(window.startTime),
    seatsAvailable: maxParticipants === null ? null : Math.max(0, maxParticipants - joined),
    maxParticipants,
    participantsCount: joined,
    mode: modeLabel(journey.transportMode),
    organizer: journey.organizer?.pseudonym || 'Student',
    isOrganizer: Boolean(session?.user?.id && journey.organizer?.userId === session.user.id),
    isMember: Boolean(journey.isMember),
    status: journey.status,
    meetingPoint: journey.suggestedMeetingPoint?.name || '',
  };
}

function normalizeMatch(match) {
  const total = match.totalCapacity ?? null;
  const open = match.availableSlots ?? null;
  const window = match.departureWindowSummary || {};
  return {
    id: match.groupId,
    title: match.title,
    origin: match.coarseOriginArea,
    destination: match.coarseDestinationArea,
    departureTime: window.preferredDepartureTime || formatClockTime(window.startTime),
    departureDate: formatDate(window.startTime),
    seatsAvailable: open,
    maxParticipants: total,
    participantsCount: total !== null && open !== null ? total - open : null,
    mode: modeLabel(match.transportMode),
    organizer: match.organizerPseudonym || 'Student',
    isOrganizer: false,
    isMember: false,
    meetingPoint: match.suggestedMeetingPoint?.name || '',
    matchScore: match.compatibilityScore,
    matchExplanation: match.matchExplanation || '',
  };
}

function normalizeMeetingPoint(point) {
  return {
    id: point.id,
    name: point.name,
    landmark: point.landmark || point.area || '',
  };
}

// ─── Goals ──────────────────────────────────────────────────────────────────

/** @returns {Promise<{goals: Array, isSample: boolean}>} */
export async function loadGoals() {
  if (!isSignedIn()) return { goals: SAMPLE_GOALS, isSample: true };
  const res = await request(`/academic/goals?limit=${LIST_LIMIT}`);
  return { goals: (res?.goals || []).map(normalizeGoal), isSample: false };
}

/**
 * Create a goal.
 * @param {{title: string, description?: string, targetDate?: number|null}} goal - targetDate is epoch ms
 */
export function createStudentGoal({ title, description, targetDate }) {
  const body = { title };
  if (description) body.description = description;
  if (targetDate) body.target_date = targetDate;
  return request('/academic/goals', { method: 'POST', body: JSON.stringify(body) });
}

// ─── Shared travel ──────────────────────────────────────────────────────────

/**
 * Everything the Shared Travel tab shows.
 *
 * @returns {Promise<{isSample: boolean, sharingEnabled: boolean, active: Array, pending: Array,
 *   past: Array, meetingPoints: Array}>}
 */
export async function loadSharedTravel() {
  if (!isSignedIn()) {
    return {
      isSample: true,
      sharingEnabled: false,
      active: SAMPLE_JOURNEYS,
      pending: [],
      past: [],
      meetingPoints: SAMPLE_MEETING_POINTS,
    };
  }

  const prefsRes = await request('/shared-travel/preferences');
  const sharingEnabled = Boolean(prefsRes?.preferences?.sharingEnabled);
  if (!sharingEnabled) {
    return { isSample: false, sharingEnabled: false, active: [], pending: [], past: [], meetingPoints: [] };
  }

  const [journeysRes, pointsRes] = await Promise.all([
    request('/shared-travel/journeys'),
    request('/shared-travel/meeting-points'),
  ]);

  return {
    isSample: false,
    sharingEnabled: true,
    active: (journeysRes?.activeJourneys || []).map(normalizeJourney),
    pending: (journeysRes?.pendingInvitations || []).map((item) => ({
      ...normalizeJourney(item.group || {}),
      id: item.groupId,
      membershipId: item.invitationId,
    })),
    past: (journeysRes?.pastJourneys || []).map(normalizeJourney),
    meetingPoints: (pointsRes?.meetingPoints || []).map(normalizeMeetingPoint),
  };
}

/** Summary counts for the main dashboard. */
export async function loadCommunitySnapshot() {
  const { goals, isSample } = await loadGoals();
  if (isSample) return { goals, journeyCount: SAMPLE_JOURNEYS.length, isSample };
  const prefsRes = await request('/shared-travel/preferences');
  if (!prefsRes?.preferences?.sharingEnabled) return { goals, journeyCount: 0, isSample };
  const journeysRes = await request('/shared-travel/journeys');
  return { goals, journeyCount: (journeysRes?.activeJourneys || []).length, isSample };
}

/**
 * Turn shared travel on (explicit consent) or off.
 * @param {boolean} enabled
 */
export function setSharedTravelConsent(enabled) {
  return request('/shared-travel/preferences', {
    method: 'PUT',
    body: JSON.stringify(enabled ? { sharingEnabled: true, consentConfirmed: true } : { sharingEnabled: false }),
  });
}

/**
 * Find open journeys from other students (coarse areas only).
 * @param {{originArea?: string, destinationArea?: string}} query
 * @returns {Promise<Array>}
 */
export async function discoverJourneys({ originArea, destinationArea } = {}) {
  const body = {};
  if (originArea?.trim()) body.originArea = originArea.trim();
  if (destinationArea?.trim()) body.destinationArea = destinationArea.trim();
  const res = await request('/shared-travel/journeys/match', { method: 'POST', body: JSON.stringify(body) });
  return (res?.matches || []).map(normalizeMatch);
}

/**
 * Create a voluntary journey.
 * @param {{title: string, originArea: string, destinationArea: string, departureAt: number,
 *   flexMinutes: number, transportMode: string, maxParticipants: number}} form
 */
export function createSharedJourney(form) {
  const flexMs = (form.flexMinutes || 15) * 60 * 1000;
  return request('/shared-travel/journeys', {
    method: 'POST',
    body: JSON.stringify({
      title: form.title,
      originArea: form.originArea,
      destinationArea: form.destinationArea,
      departureWindow: {
        startTime: form.departureAt - flexMs,
        endTime: form.departureAt + flexMs,
        preferredDepartureTime: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(form.departureAt)),
        flexMinutes: Math.min(60, form.flexMinutes || 15),
      },
      transportMode: form.transportMode,
      maxParticipants: form.maxParticipants,
    }),
  });
}

export function requestToJoinJourney(journeyId) {
  return request(`/shared-travel/journeys/${journeyId}/join`, { method: 'POST', body: JSON.stringify({}) });
}

export function acceptJourney(journeyId) {
  return request(`/shared-travel/journeys/${journeyId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ consentConfirmed: true }),
  });
}

export function declineJourney(journeyId) {
  return request(`/shared-travel/journeys/${journeyId}/decline`, { method: 'POST', body: JSON.stringify({}) });
}

export function leaveJourney(journeyId) {
  return request(`/shared-travel/journeys/${journeyId}/withdraw`, { method: 'POST', body: JSON.stringify({}) });
}
