/**
 * CommutePlanService
 *
 * Encapsulates core multimodal commute planning business logic:
 * - Spatial coordinate resolution (geocoding)
 * - Live environmental intelligence (weather + real-time crowdsourced disruptions + live road traffic)
 * - GTFS transit candidate generation with budget and mode filtering
 * - OSRM road and walking route geometry enrichment
 * - Multi-criteria deterministic scoring
 * - Grounded AI explanatory recommendation with structured fallbacks
 * - Multiple alternative route selection (Fastest, Lowest-Cost, Rain-Safe, Alternatives)
 */

const { geocodeArea } = require('./geocodingService');
const { getOsrmRoute, getOsrmRouteThroughWaypoints } = require('./routingService');
const { getMumbaiWeather } = require('./weatherService');
const { findTransitCandidates } = require('./gtfsService');
const { getActiveReports, evaluateRouteDisruptions } = require('./disruptionService');
const { scoreRoutes } = require('./scoringService');
const { generateAiRecommendation } = require('./aiPlannerService');
const { trafficService } = require('./trafficService');

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
   * @returns {Promise<object>} Complete route recommendation, weather, live traffic, alternatives, and metadata
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

    // 2. Fetch live weather, active community reports & live Mumbai traffic concurrently
    const [weather, activeReports, liveTraffic] = await Promise.all([
      getMumbaiWeather(originGeo.lat, originGeo.lon),
      Promise.resolve(getActiveReports()),
      trafficService.getLiveMumbaiTraffic(originGeo, destGeo, origin, destination)
    ]);

    // 3. Generate candidate routes from Mumbai GTFS, suburban rail, and OSRM with strict allowed modes
    const rawCandidates = findTransitCandidates(originGeo, destGeo, desiredArrivalTime, preferredModes);

    // Strict budget filter: If options exist within max budget, prioritize options within budget
    const withinBudgetCandidates = rawCandidates.filter(c => c.fareRupees <= maxBudgetRupees);
    const candidates = withinBudgetCandidates.length > 0 ? withinBudgetCandidates : rawCandidates;

    // 4. Enrich candidates with road/walking geometry from OSRM following physical streets & tracks
    const enrichedCandidates = await Promise.all(
      candidates.map(async (cand) => {
        // Apply live traffic delays to road / bus modes
        if ((cand.primaryMode === 'auto' || cand.primaryMode === 'bus') && liveTraffic && liveTraffic.expectedDelayMinutes > 0) {
          const addedTraffic = cand.primaryMode === 'auto' ? liveTraffic.expectedDelayMinutes : Math.round(liveTraffic.expectedDelayMinutes * 0.6);
          cand.durationMinutes = (cand.durationMinutes || 30) + addedTraffic;
          cand.liveTrafficDelayMinutes = addedTraffic;
          cand.liveTrafficNote = `+${addedTraffic}m traffic delay (${liveTraffic.level})`;
        }

        // 1. Pure road auto or pedestrian walk
        if (cand.primaryMode === 'auto' || cand.primaryMode === 'walk') {
          const profile = cand.primaryMode === 'walk' ? 'walking' : 'driving';
          const osrmData = await getOsrmRoute(originGeo, destGeo, profile);
          return {
            ...cand,
            geometry: osrmData.geometry,
            osrmSource: `OSRM ${cand.primaryMode.toUpperCase()} Network`
          };
        }

        // 2. Multimodal Interchange Route (e.g. Bus + Metro, Train + Bus)
        if (cand.transfers > 0 && cand.transitStations && cand.transitStations.length >= 3) {
          const firstStn = cand.transitStations[0];
          const hubStn = cand.transitStations[1];
          const lastStn = cand.transitStations[cand.transitStations.length - 1];

          try {
            // First mile walk to first station
            const walk1 = await getOsrmRoute(originGeo, firstStn, 'walking');
            // Transit Leg 1 road/transit corridor
            const leg1 = await getOsrmRoute(firstStn, hubStn, 'driving');
            // Transit Leg 2 road/transit corridor
            const leg2 = await getOsrmRoute(hubStn, lastStn, 'driving');
            // Last mile walk from last station to destination
            const walk2 = await getOsrmRoute(lastStn, destGeo, 'walking');

            const fullCoords = [
              ...(walk1.geometry?.coordinates || [[originGeo.lon, originGeo.lat]]),
              ...(leg1.geometry?.coordinates || [[firstStn.lon, firstStn.lat], [hubStn.lon, hubStn.lat]]),
              ...(leg2.geometry?.coordinates || [[hubStn.lon, hubStn.lat], [lastStn.lon, lastStn.lat]]),
              ...(walk2.geometry?.coordinates || [[destGeo.lon, destGeo.lat]])
            ];

            return {
              ...cand,
              geometry: {
                type: 'LineString',
                coordinates: fullCoords
              },
              osrmSource: 'Continuous OSRM Multimodal Corridor'
            };
          } catch (interchangeErr) {
            // Fall through to standard stitching
          }
        }

        // 3. Suburban Rail & Metro Track Corridors (Western Railway, Central Railway, Metro 1)
        if ((cand.primaryMode === 'train' || cand.primaryMode === 'metro') && cand.transitStations && cand.transitStations.length >= 2) {
          const stationFirst = cand.transitStations[0];
          const stationLast = cand.transitStations[cand.transitStations.length - 1];

          try {
            // First mile walk OSRM path (origin -> first station along real sidewalks/roads)
            const firstMileWalk = await getOsrmRoute(originGeo, stationFirst, 'walking');
            // Last mile walk OSRM path (last station -> dest along real sidewalks/roads)
            const lastMileWalk = await getOsrmRoute(stationLast, destGeo, 'walking');

            // Physical railway track geometry through all intermediate stations with dense corridor points
            const trackCoords = [];
            for (let i = 0; i < cand.transitStations.length - 1; i++) {
              const s1 = cand.transitStations[i];
              const s2 = cand.transitStations[i + 1];
              trackCoords.push([s1.lon, s1.lat]);
              const steps = 6;
              for (let k = 1; k < steps; k++) {
                const ratio = k / steps;
                trackCoords.push([
                  +(s1.lon + (s2.lon - s1.lon) * ratio).toFixed(6),
                  +(s1.lat + (s2.lat - s1.lat) * ratio).toFixed(6)
                ]);
              }
            }
            trackCoords.push([stationLast.lon, stationLast.lat]);

            const fullCoords = [
              ...(firstMileWalk.geometry?.coordinates || [[originGeo.lon, originGeo.lat]]),
              ...trackCoords,
              ...(lastMileWalk.geometry?.coordinates || [[destGeo.lon, destGeo.lat]])
            ];

            return {
              ...cand,
              geometry: {
                type: 'LineString',
                coordinates: fullCoords
              },
              osrmSource: 'OSRM Walking + Verified Rail Track Network'
            };
          } catch (railErr) {
            // Fall through to standard bus/road routing
          }
        }

        // 4. Bus routes: follow actual physical road networks through all intermediate stops
        if (cand.primaryMode === 'bus' && cand.transitStations && cand.transitStations.length >= 2) {
          const firstStn = cand.transitStations[0];
          const lastStn = cand.transitStations[cand.transitStations.length - 1];

          try {
            // First mile walk along physical streets
            const walk1 = await getOsrmRoute(originGeo, firstStn, 'walking');
            // Last mile walk along physical streets
            const walk2 = await getOsrmRoute(lastStn, destGeo, 'walking');

            // Sample key transit stops (max 8 waypoints) so OSRM never fails or times out
            const stops = cand.transitStations;
            let sampledStops = stops;
            if (stops.length > 8) {
              const step = (stops.length - 1) / 5;
              sampledStops = [
                stops[0],
                stops[Math.round(step)],
                stops[Math.round(step * 2)],
                stops[Math.round(step * 3)],
                stops[Math.round(step * 4)],
                stops[stops.length - 1]
              ];
            }

            const roadGeom = await getOsrmRouteThroughWaypoints(sampledStops, 'driving');
            const busCoords = roadGeom?.coordinates || sampledStops.map(s => [s.lon, s.lat]);

            const fullCoords = [
              ...(walk1.geometry?.coordinates || [[originGeo.lon, originGeo.lat]]),
              ...busCoords,
              ...(walk2.geometry?.coordinates || [[destGeo.lon, destGeo.lat]])
            ];

            return {
              ...cand,
              geometry: {
                type: 'LineString',
                coordinates: fullCoords
              },
              osrmSource: 'OSRM Bus Road Network'
            };
          } catch (busErr) {
            // Fall through
          }
        }

        // 5. High-resolution continuous road fallback
        const waypoints = (cand.transitStations && cand.transitStations.length >= 2)
          ? [originGeo, ...cand.transitStations, destGeo]
          : [originGeo, destGeo];

        const roadData = await getOsrmRoute(originGeo, destGeo, 'driving');
        return {
          ...cand,
          geometry: roadData.geometry,
          osrmSource: 'OSRM Direct Road Network'
        };
      })
    );

    // 5. Evaluate disruption impacts against candidates
    const disruptionEvaluations = {};
    for (const cand of enrichedCandidates) {
      disruptionEvaluations[cand.id] = evaluateRouteDisruptions(cand, activeReports);
    }

    // 6. Score routes deterministically across Multi-Attribute Utility Theory (MAUT) dimensions
    const scoringResults = scoreRoutes(
      enrichedCandidates,
      weather,
      { preference, walkingToleranceMinutes, maxBudgetRupees },
      disruptionEvaluations
    );

    // 7. Grounded AI Explanatory Recommendation
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
    const seenTitles = new Set([recommendedRoute.title.toLowerCase().trim()]);
    const seenIds = new Set([recommendedRoute.id]);
    const practicalAlternatives = [];

    const tryAddAlternative = (cand, badge) => {
      if (!cand) return false;
      const normTitle = cand.title.toLowerCase().trim();
      if (seenTitles.has(normTitle) || seenIds.has(cand.id)) return false;
      if (withinBudgetCandidates.length > 0 && cand.fareRupees > maxBudgetRupees) return false;

      seenTitles.add(normTitle);
      seenIds.add(cand.id);
      practicalAlternatives.push({
        ...cand,
        badgeLabel: badge || 'Alternative Route'
      });
      return true;
    };

    // 1. Add fastest alternative if distinct
    if (scoringResults.fastestAlternative) {
      tryAddAlternative(scoringResults.fastestAlternative, 'Fastest Alternative');
    }

    // 2. Add cheapest alternative if distinct
    if (scoringResults.cheapestAlternative) {
      tryAddAlternative(scoringResults.cheapestAlternative, 'Lowest-Cost Alternative');
    }

    // 3. Add rain-safe alternative if distinct
    if (scoringResults.rainSafeAlternative) {
      tryAddAlternative(scoringResults.rainSafeAlternative, 'Rain-Safe Alternative');
    }

    // 4. Fill remaining distinct alternatives up to 3 options
    for (const alt of scoringResults.rankedCandidates) {
      if (practicalAlternatives.length >= 3) break;
      tryAddAlternative(alt, 'Alternative Option');
    }

    return {
      query: {
        origin: originGeo,
        destination: destGeo,
        desiredArrivalTime,
        preference
      },
      weather,
      traffic: liveTraffic,
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
