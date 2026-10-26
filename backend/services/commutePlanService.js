/**
 * CommutePlanService
 *
 * Encapsulates core multimodal commute planning business logic:
 * - Spatial coordinate resolution (geocoding)
 * - Live environmental intelligence (weather + real-time crowdsourced disruptions)
 * - GTFS transit candidate generation with budget and mode filtering
 * - OSRM road and walking route geometry enrichment
 * - Multi-criteria deterministic scoring
 * - Grounded AI explanatory recommendation with structured fallbacks
 * - Alternative route selection (Fastest, Lowest-Cost, Rain-Safe)
 */

const { geocodeArea } = require('./geocodingService');
const { getOsrmRoute, getOsrmRouteThroughWaypoints } = require('./routingService');
const { getMumbaiWeather } = require('./weatherService');
const { findTransitCandidates } = require('./gtfsService');
const { getActiveReports, evaluateRouteDisruptions } = require('./disruptionService');
const { scoreRoutes } = require('./scoringService');
const { generateAiRecommendation } = require('./aiPlannerService');

class CommutePlanService {
  /**
   * Plans a multimodal commute route based on student preferences and live transit conditions.
   *
   * @param {object} planParams
   * @param {string} planParams.origin - Area or landmark name
   * @param {string} planParams.destination - Destination college or area
   * @param {string} [planParams.desiredArrivalTime='09:00']
   * @param {string[]} [planParams.preferredModes=['train', 'metro', 'bus', 'auto', 'walk']]
   * @param {'balanced'|'fastest'|'cheapest'|'rain-safe'} [planParams.preference='balanced']
   * @param {number} [planParams.walkingToleranceMinutes=20]
   * @param {number} [planParams.maxBudgetRupees=100]
   * @returns {Promise<object>} Complete route recommendation, weather, alternatives, and metadata
   */
  async planCommute(planParams) {
    const {
      origin,
      destination,
      desiredArrivalTime = '09:00',
      preferredModes = ['train', 'metro', 'bus', 'auto', 'walk'],
      preference = 'balanced',
      walkingToleranceMinutes = 20,
      maxBudgetRupees = 100
    } = planParams;

    // 1. Geocode origin and destination
    const [originGeo, destGeo] = await Promise.all([
      geocodeArea(origin),
      geocodeArea(destination)
    ]);

    // 2. Fetch live weather & active community reports concurrently
    const [weather, activeReports] = await Promise.all([
      getMumbaiWeather(originGeo.lat, originGeo.lon),
      Promise.resolve(getActiveReports())
    ]);

    // 3. Generate candidate routes from Mumbai GTFS and OSRM with strict allowed modes
    const rawCandidates = findTransitCandidates(originGeo, destGeo, desiredArrivalTime, preferredModes);

    // Strict budget filter: If options exist within max budget, eliminate all exceeding options
    const withinBudgetCandidates = rawCandidates.filter(c => c.fareRupees <= maxBudgetRupees);
    const candidates = withinBudgetCandidates.length > 0 ? withinBudgetCandidates : rawCandidates;

    // 4. Enrich candidates with road/walking geometry from OSRM following physical streets & tracks
    const enrichedCandidates = await Promise.all(
      candidates.map(async (cand) => {
        // If auto route or pure walk, fetch full road geometry
        if (cand.primaryMode === 'auto' || cand.primaryMode === 'walk') {
          const osrmData = await getOsrmRoute(originGeo, destGeo, cand.primaryMode === 'walk' ? 'walking' : 'driving');
          return {
            ...cand,
            geometry: osrmData.geometry,
            osrmSource: osrmData.source
          };
        }

        // For bus routes, follow actual road geometry through all stops
        if (cand.primaryMode === 'bus' && cand.transitStations && cand.transitStations.length >= 2) {
          const allWaypoints = [
            originGeo,
            ...cand.transitStations,
            destGeo
          ];
          const roadGeom = await getOsrmRouteThroughWaypoints(allWaypoints, 'driving');
          if (roadGeom && roadGeom.coordinates && roadGeom.coordinates.length > 1) {
            return {
              ...cand,
              geometry: roadGeom,
              osrmSource: 'OSRM Bus Road Network'
            };
          }
        }

        // For rail and metro routes, follow walking street networks to/from stations + track stops
        if (cand.transitStations && cand.transitStations.length >= 2) {
          const stationFirst = cand.transitStations[0];
          const stationLast = cand.transitStations[cand.transitStations.length - 1];

          // Fetch first-mile street walking geometry (origin -> boarding station)
          // and last-mile street walking geometry (alighting station -> destination)
          const [firstMileGeom, lastMileGeom] = await Promise.all([
            getOsrmRoute(originGeo, stationFirst, 'walking').then(r => r.geometry).catch(() => null),
            getOsrmRoute(stationLast, destGeo, 'walking').then(r => r.geometry).catch(() => null)
          ]);

          const combinedCoords = [];

          // 1. Add first-mile street walking route
          if (firstMileGeom && firstMileGeom.coordinates && firstMileGeom.coordinates.length > 0) {
            combinedCoords.push(...firstMileGeom.coordinates);
          } else {
            combinedCoords.push([originGeo.lon, originGeo.lat]);
          }

          // 2. Add sequential railway / metro corridor track stops
          cand.transitStations.forEach(s => {
            combinedCoords.push([s.lon, s.lat]);
          });

          // 3. Add last-mile street walking route
          if (lastMileGeom && lastMileGeom.coordinates && lastMileGeom.coordinates.length > 0) {
            combinedCoords.push(...lastMileGeom.coordinates);
          } else {
            combinedCoords.push([destGeo.lon, destGeo.lat]);
          }

          // Filter out duplicate consecutive coordinates
          const filteredCoords = combinedCoords.filter((coord, idx, arr) => {
            if (idx === 0) return true;
            const prev = arr[idx - 1];
            return Math.abs(coord[0] - prev[0]) > 0.00001 || Math.abs(coord[1] - prev[1]) > 0.00001;
          });

          return {
            ...cand,
            geometry: {
              type: 'LineString',
              coordinates: filteredCoords
            }
          };
        }

        // Fallback for any other candidate: fetch driving road route
        const fallbackRoad = await getOsrmRoute(originGeo, destGeo, 'driving');
        return {
          ...cand,
          geometry: fallbackRoad.geometry,
          osrmSource: fallbackRoad.source
        };
      })
    );

    // 5. Evaluate community disruptions against candidates
    const disruptionEvals = {};
    enrichedCandidates.forEach(cand => {
      disruptionEvals[cand.id] = evaluateRouteDisruptions(cand, activeReports);
    });

    // 6. Deterministic scoring
    const scoringResults = scoreRoutes(
      enrichedCandidates,
      weather,
      { preference, walkingToleranceMinutes, maxBudgetRupees },
      disruptionEvals
    );

    // If no valid route found, return structured empty result
    if (!scoringResults.recommended) {
      return {
        query: {
          origin: originGeo,
          destination: destGeo,
          desiredArrivalTime,
          preference,
          maxBudgetRupees,
          preferredModes
        },
        weather,
        recommendation: {
          route: null,
          aiReasoning: {
            recommendedRouteId: null,
            departureTime: null,
            summary: 'No routes match your selected modes and budget constraints.',
            reason: `No transit options were found within your max budget of ₹${maxBudgetRupees} using the allowed modes (${preferredModes.join(', ')}). Try increasing your budget or selecting more transport modes.`,
            warnings: ['No matching routes found for current filter settings.'],
            confidence: 'none',
            aiProvider: 'Smart Commute Filter Engine'
          }
        },
        alternatives: [],
        allCandidatesCount: 0
      };
    }

    // 7. Grounded AI explanation via Gemini 3.8 Flash (or deterministic fallback)
    const aiExplanation = await generateAiRecommendation(
      scoringResults.rankedCandidates,
      scoringResults,
      weather,
      activeReports,
      { preference, walkingToleranceMinutes, maxBudgetRupees },
      desiredArrivalTime
    );

    // Find the route recommended by AI or default to scoring engine's top choice
    let recommendedRoute = scoringResults.rankedCandidates.find(c => c.id === aiExplanation.recommendedRouteId);
    if (!recommendedRoute) {
      recommendedRoute = scoringResults.recommended;
    }

    // Collect distinct alternative routes strictly within budget
    const alternatives = scoringResults.rankedCandidates.filter(c =>
      c.id !== recommendedRoute.id && (withinBudgetCandidates.length === 0 || c.fareRupees <= maxBudgetRupees)
    );
    const practicalAlternatives = [];

    // Add fastest alternative (if within budget)
    if (scoringResults.fastestAlternative &&
        scoringResults.fastestAlternative.id !== recommendedRoute.id &&
        (withinBudgetCandidates.length === 0 || scoringResults.fastestAlternative.fareRupees <= maxBudgetRupees)) {
      practicalAlternatives.push({
        ...scoringResults.fastestAlternative,
        badgeLabel: 'Fastest Alternative'
      });
    }

    // Add cheapest alternative (if within budget)
    if (scoringResults.cheapestAlternative &&
        scoringResults.cheapestAlternative.id !== recommendedRoute.id &&
        (withinBudgetCandidates.length === 0 || scoringResults.cheapestAlternative.fareRupees <= maxBudgetRupees) &&
        !practicalAlternatives.some(a => a.id === scoringResults.cheapestAlternative.id)) {
      practicalAlternatives.push({
        ...scoringResults.cheapestAlternative,
        badgeLabel: 'Lowest-Cost Alternative'
      });
    }

    // Add rain-safe alternative (if within budget)
    if (scoringResults.rainSafeAlternative &&
        scoringResults.rainSafeAlternative.id !== recommendedRoute.id &&
        (withinBudgetCandidates.length === 0 || scoringResults.rainSafeAlternative.fareRupees <= maxBudgetRupees) &&
        !practicalAlternatives.some(a => a.id === scoringResults.rainSafeAlternative.id)) {
      practicalAlternatives.push({
        ...scoringResults.rainSafeAlternative,
        badgeLabel: 'Rain-Safe Alternative'
      });
    }

    // Fill remaining alternatives if fewer than 2
    for (const alt of alternatives) {
      if (practicalAlternatives.length >= 2) break;
      if (!practicalAlternatives.some(a => a.id === alt.id)) {
        practicalAlternatives.push({
          ...alt,
          badgeLabel: 'Alternative Route'
        });
      }
    }

    return {
      query: {
        origin: originGeo,
        destination: destGeo,
        desiredArrivalTime,
        preference
      },
      weather,
      recommendation: {
        route: recommendedRoute,
        aiReasoning: aiExplanation
      },
      alternatives: practicalAlternatives,
      allCandidatesCount: enrichedCandidates.length,
      disruptionReportsConsidered: activeReports.length
    };
  }
}

const commutePlanService = new CommutePlanService();

module.exports = {
  CommutePlanService,
  commutePlanService
};
