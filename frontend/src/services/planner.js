/**
 * Planner Feature Service
 *
 * Feature-specific frontend functions for the Plan Route feature.
 * Wraps the centralized API client (api.js) so presentation components
 * never call raw endpoints directly.
 *
 * BACKEND DEPENDENCIES (real, existing endpoints — see README API table):
 * - POST /api/plan                      (geocode, transit candidates, scoring, AI reasoning)
 * - POST /api/commute/recommendations   (P9 Personalized commute route intelligence)
 * - POST /api/feedback                  (recommendation rating)
 *
 * All functions resolve with parsed JSON and reject with FrontendApiError
 * carrying user-friendly messages (never stack traces).
 */
import { planCommute, submitFeedback, fetchCommuteRecommendations } from './api';
import { readAuthToken } from '../utils/authSession';

const MODE_LABELS = {
  train: 'Train',
  metro: 'Metro',
  bus: 'BEST Bus',
  auto: 'Auto',
  walk: 'Walk',
  shared: 'Shared Travel',
};

/** Friendly wording for the engine's weakness/strength codes (unknown codes are title-cased). */
const FACTOR_LABELS = {
  HIGH_COST: 'Higher cost',
  LOW_COST: 'Low cost',
  LONG_WALK: 'Long walk',
  LOW_WALKING: 'Little walking',
  MANY_TRANSFERS: 'Several transfers',
  FEWER_TRANSFERS: 'Few transfers',
  LONG_DURATION: 'Longer journey',
  FAST: 'Quick journey',
};

const titleCase = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** First finite number among the candidates, or null — never a made-up default. */
const pickNumber = (...values) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

const toText = (item) => {
  if (typeof item === 'string') return item;
  return item?.message || item?.detail || item?.headline || null;
};

function buildRouteTitle(route) {
  const modes = (Array.isArray(route.modesIncluded) && route.modesIncluded.length
    ? route.modesIncluded
    : [route.primaryMode || route.mode]
  ).filter(Boolean);
  const labels = modes.map((mode) => MODE_LABELS[String(mode).toLowerCase()] || titleCase(mode));
  return labels.length ? labels.join(' + ') : 'Recommended commute';
}

/**
 * Map one route from the personalized engine (`/commute/recommendations`) to the
 * shape the route cards render. Missing values stay null so the UI shows "—"
 * instead of presenting an invented duration, fare or reliability.
 */
function mapPersonalizedRoute(route, index, { isPrimary = false, tradeOffs = [] } = {}) {
  const weaknessLabels = (route.weaknesses || []).map((code) => ({
    label: FACTOR_LABELS[code] || titleCase(code),
    type: 'warning',
    category: 'weakness',
  }));
  const strengthLabels = (route.strengths || []).map((code) => ({
    label: FACTOR_LABELS[code] || titleCase(code),
    type: 'positive',
    category: 'strength',
  }));
  const tradeoffLabels = isPrimary
    ? tradeOffs.map(toText).filter(Boolean).map((label) => ({ label, type: 'neutral', category: 'tradeoff' }))
    : [];

  const reliability = route.reliability;
  return {
    id: route.journeyId || route.id || `route-${index + 1}`,
    title: route.title || route.summary || buildRouteTitle(route),
    subtitle: route.subtitle || [route.origin, route.destination].filter(Boolean).join(' → '),
    primaryMode: route.primaryMode || route.mode || 'transit',
    durationMinutes: pickNumber(
      route.totalTravelTimeMinutes,
      route.totalDurationMinutes,
      route.durationMinutes,
      route.travelTimeMinutes
    ),
    estimatedDeparture: route.departureTime || route.estimatedDeparture || null,
    estimatedArrival: route.estimatedArrivalTime || route.arrivalTime || route.estimatedArrival || null,
    fareRupees: pickNumber(route.estimatedCostRupees, route.fareRupees, route.cost),
    walkingDurationMinutes: pickNumber(route.walkingTimeMinutes, route.walkingDurationMinutes, route.walkingMinutes),
    totalWalkingDistanceKm: pickNumber(route.totalWalkingDistanceKm),
    transfers: pickNumber(route.transfers, route.transferCount),
    sourceLabel: route.provenance?.sourceTier === 'VERIFIED' ? 'Verified GTFS Schedule' : 'Estimated Route',
    provenanceTier: route.provenance?.sourceTier || route.provenanceTier || 'ESTIMATED',
    // Numeric score when the engine sends one, otherwise its LOW/MEDIUM/HIGH label
    scores: { reliability: typeof reliability === 'number' ? reliability : null },
    reliability: typeof reliability === 'string' ? reliability : null,
    disruptionAlerts: Array.isArray(route.disruptionAlerts) ? route.disruptionAlerts : [],
    tradeoffs: [...tradeoffLabels, ...strengthLabels, ...weaknessLabels],
    legs: (route.segments || route.legs || []).map((seg, idx) => ({
      description: seg.description || seg.instruction || `${titleCase(seg.mode || 'Transit')} leg ${idx + 1}`,
      durationMinutes: pickNumber(seg.durationMinutes, seg.travelTimeMinutes),
      agency: seg.agency || seg.operator || null,
      fareRupees: seg.fareRupees,
      departureTime: seg.departureTime,
    })),
    geometry: route.geometry || null,
    transitStations: route.transitStations || route.stations || [],
  };
}

/**
 * Normalizes commute planning responses from either /api/plan or /api/commute/recommendations
 * so the UI receives a unified, rich representation.
 *
 * @param {Object} rawResponse
 * @returns {Object} Normalized plan result
 */
function normalizeCommuteResponse(rawResponse) {
  if (!rawResponse) return null;

  // Case 1: Already structured as /api/plan response. The personalized engine
  // also returns a top-level `recommendation`, but a different object (no
  // `route`), so detect the standard shape by what only it carries.
  const isStandardPlan =
    rawResponse.recommendation?.route !== undefined ||
    rawResponse.query !== undefined ||
    rawResponse.allCandidatesCount !== undefined;
  if (isStandardPlan) {
    return {
      success: rawResponse.success !== false,
      ...rawResponse
    };
  }

  // Case 2: Structured as /api/commute/recommendations response envelope
  const data = rawResponse.data || rawResponse;
  const primary = data.primaryRecommendedRoute || data.selectedRoute || data.primaryRecommendation || null;
  const rawAlternatives = data.alternativeRoutes || data.meaningfulAlternatives || data.alternatives || [];
  const alternatives = rawAlternatives.map((alt, idx) => mapPersonalizedRoute(alt, idx));
  const reasonFromList = Array.isArray(data.recommendationReasons)
    ? toText(data.recommendationReasons[0])
    : null;
  const warnings = [...(data.warnings || []), ...(data.dataQualityWarnings || [])]
    .map(toText)
    .filter(Boolean);

  return {
    success: data.hasFeasibleRoute !== false,
    recommendation: primary ? {
      route: mapPersonalizedRoute(primary, 0, {
        isPrimary: true,
        tradeOffs: data.tradeOffs || data.routeTradeOffs || [],
      }),
      aiReasoning: {
        // `isAiEnhanced` is also set when the deterministic provider writes the text, so name
        // the engine by the provider the API reports rather than by that flag.
        aiProvider: /gemini|google/i.test(String(data.explanationAudit?.provider || data.explanation?.aiMetadata?.provider || ''))
          ? 'Gemini AI Personalized'
          : 'Deterministic Scoring Engine',
        // Only claim a confidence level the engine actually reported
        confidence:
          data.uncertainty === 'LOW' ? 'HIGH'
            : data.uncertainty === 'SEVERE' ? 'LOW'
            : data.uncertainty ? 'MODERATE'
            : undefined,
        reason: data.selectionReason || data.explanation?.summary || reasonFromList || undefined,
        warnings,
      }
    } : null,
    noRouteReason: data.fallbackReason || (Array.isArray(data.fallbackGuidance) ? toText(data.fallbackGuidance[0]) : null) || null,
    allCandidatesCount: (primary ? 1 : 0) + alternatives.length,
    alternatives,
    weather: data.environmentalContext?.weather || null,
    scheduleContext: data.scheduleContext || null,
    departureAdvice: data.departureAdvice || null,
    query: rawResponse.query || data.query || (data.origin ? { origin: data.origin, destination: data.destination } : null),
  };
}

/**
 * Request a multi-modal commute plan.
 * Seamlessly integrates authenticated personalized recommendations with fallback to standard multimodal planning.
 *
 * @param {Object} planData - Planner form values
 * @returns {Promise<Object>} Normalized plan result
 */
export async function requestPlan(planData) {
  const token = readAuthToken();
  if (token) {
    try {
      const res = await fetchCommuteRecommendations({
        origin: planData.origin,
        destination: planData.destination,
        desiredArrivalTime: planData.desiredArrivalTime || '09:00',
        desiredDepartureTime: planData.desiredDepartureTime,
        preferredModes: planData.preferredModes,
        maxBudgetRupees: planData.maxBudgetRupees,
        walkingToleranceMinutes: planData.walkingToleranceMinutes,
        maxTransfers: planData.maxTransfers,
        useSchedule: true
      });
      if (res) {
        return normalizeCommuteResponse(res);
      }
    } catch (err) {
      // On any non-critical API failure or missing profile, seamlessly fall back to /plan
    }
  }

  const standardRes = await planCommute(planData);
  return normalizeCommuteResponse(standardRes);
}

/**
 * Submit feedback for a route recommendation.
 * @param {Object} feedback - { recommendation_id, is_useful, tags, comment }
 */
export function sendFeedback(feedback) {
  return submitFeedback(feedback);
}
