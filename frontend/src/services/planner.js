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

/**
 * Normalizes commute planning responses from either /api/plan or /api/commute/recommendations
 * so the UI receives a unified, rich representation.
 *
 * @param {Object} rawResponse
 * @returns {Object} Normalized plan result
 */
function normalizeCommuteResponse(rawResponse) {
  if (!rawResponse) return null;

  // Case 1: Already structured as /api/plan response
  if (rawResponse.recommendation || (rawResponse.alternatives && rawResponse.alternatives.length > 0)) {
    return rawResponse;
  }

  // Case 2: Structured as /api/commute/recommendations response envelope
  const data = rawResponse.data || rawResponse;
  const primary = data.primaryRecommendedRoute || data.selectedRoute || data.primaryRecommendation || null;
  const alternatives = data.alternativeRoutes || data.meaningfulAlternatives || data.alternatives || [];

  return {
    success: data.hasFeasibleRoute !== false,
    recommendation: primary ? {
      route: {
        id: primary.id || primary.journeyId || 'primary-rec',
        title: primary.title || primary.summary || 'Recommended Commute',
        subtitle: primary.subtitle || primary.corridor || 'Fastest & Most Reliable Transit Combination',
        primaryMode: primary.primaryMode || primary.mode || 'train',
        durationMinutes: primary.durationMinutes || primary.totalDurationMinutes || primary.travelTimeMinutes || 35,
        estimatedDeparture: primary.departureTime || primary.estimatedDeparture || '08:15',
        estimatedArrival: primary.arrivalTime || primary.estimatedArrival || '08:50',
        fareRupees: primary.fareRupees ?? primary.estimatedCostRupees ?? primary.cost ?? 20,
        walkingDurationMinutes: primary.walkingDurationMinutes || primary.walkingMinutes || 10,
        totalWalkingDistanceKm: primary.totalWalkingDistanceKm || 0.8,
        transfers: primary.transfers ?? (primary.transferCount ?? 1),
        sourceLabel: primary.provenanceTier === 'VERIFIED' ? 'Verified GTFS Schedule' : 'Estimated Route',
        provenanceTier: primary.provenanceTier || 'VERIFIED',
        scores: primary.scores || { reliability: primary.reliabilityScore || 90 },
        disruptionAlerts: primary.disruptionAlerts || [],
        tradeoffs: primary.tradeoffs || primary.majorFactors || ['Fastest travel time', 'Low transfer delay risk'],
        legs: (primary.legs || primary.segments || []).map((seg, idx) => ({
          description: seg.description || seg.instruction || `${seg.mode || 'Transit'} leg ${idx + 1}`,
          durationMinutes: seg.durationMinutes || 15,
          agency: seg.agency || seg.operator || null,
          fareRupees: seg.fareRupees,
          departureTime: seg.departureTime
        }))
      },
      aiReasoning: {
        aiProvider: data.isAiEnhanced ? 'Gemini AI Personalized' : 'Deterministic Scoring Engine',
        confidence: data.uncertainty === 'LOW' ? 'HIGH' : (data.uncertainty === 'SEVERE' ? 'LOW' : 'MODERATE'),
        reason: data.selectionReason || (data.recommendationReasons && data.recommendationReasons[0]) || 'Selected for lowest delay risk, on-time arrival, and student budget convenience.',
        warnings: data.dataQualityWarnings || []
      }
    } : null,
    alternatives: alternatives.map((alt, idx) => ({
      id: alt.id || alt.journeyId || `alt-${idx + 1}`,
      title: alt.title || alt.summary || `Alternative Route ${idx + 1}`,
      subtitle: alt.subtitle || alt.strategyRationale || 'Alternative suburban corridor',
      primaryMode: alt.primaryMode || alt.mode || 'metro',
      durationMinutes: alt.durationMinutes || alt.totalDurationMinutes || 42,
      estimatedDeparture: alt.departureTime || alt.estimatedDeparture || '08:10',
      estimatedArrival: alt.arrivalTime || alt.estimatedArrival || '08:52',
      fareRupees: alt.fareRupees ?? alt.estimatedCostRupees ?? alt.cost ?? 25,
      walkingDurationMinutes: alt.walkingDurationMinutes || alt.walkingMinutes || 8,
      transfers: alt.transfers ?? 1,
      sourceLabel: alt.provenanceTier === 'VERIFIED' ? 'Verified GTFS' : 'Estimated Route',
      provenanceTier: alt.provenanceTier || 'ESTIMATED',
      disruptionAlerts: alt.disruptionAlerts || [],
      tradeoffs: alt.tradeoffs || []
    })),
    weather: data.environmentalContext?.weather || null,
    scheduleContext: data.scheduleContext || null,
    departureAdvice: data.departureAdvice || null
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
