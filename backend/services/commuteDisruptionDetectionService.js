/**
 * CommuteDisruptionDetectionService
 *
 * Dedicated service to determine whether transit or corridor disruptions are relevant to a student's commute.
 * Matches real-world disruptions against a student's actual candidate routes, preferences, and academic context.
 *
 * Core Capabilities:
 * 1. Targeted Relevance Matching: Matches disruptions to affected services, segments, corridors, or areas.
 *    Does NOT alert every student about every city-wide disruption.
 * 2. Unrelated Disruption Filtering: Safely ignores disruptions on unrelated modes, distant corridors, or outside travel hours.
 * 3. Expired Disruption Rejection: Filters out disruptions whose validity window has expired or status is resolved.
 * 4. Critical Event Detection:
 *    - Train or metro delays
 *    - Bus unavailability / service suspensions
 *    - Traffic congestion affecting road corridors
 *    - Route or connection closures (e.g. waterlogged subways)
 *    - Disruption causing a previously feasible route to become infeasible (e.g. deadline or constraint violation)
 *    - Material changes in estimated arrival time (>= threshold, academic punctuality buffer loss)
 * 5. Recommendation Re-Evaluation: Re-evaluates route feasibility and identifies viable alternative routes.
 * 6. Transparent Rationale & Provenance: Articulates exact grounded reasons why the disruption matters
 *    while preserving 4-tier provenance and qualitative uncertainty without claiming live telemetry.
 */

const {
  CommuteDisruptionAlert,
  ALERT_ACTION_TYPES,
  DataProvenance,
  PROVENANCE_TIERS,
  CommuteDisruption
} = require('../models');
const { disruptionImpactService } = require('./disruptionImpactService');
const { routeConstraintFilteringService } = require('./routeConstraintFilteringService');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parses HH:MM string to minutes from midnight (0 - 1439).
 * @param {string} hhmm
 * @returns {number|null}
 */
function parseHHMMToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
  const parts = hhmm.trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Formats minutes from midnight into 24-hour HH:MM string.
 * @param {number} totalMinutes
 * @returns {string}
 */
function formatMinutesToHHMM(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60).toString().padStart(2, '0');
  const m = (normalized % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Normalizes routes input into structured candidate list.
 * @param {object|Array} routesInput
 * @returns {{ primaryRoute: object|null, candidateRoutes: Array<object> }}
 */
function extractRoutesAndPrimary(routesInput) {
  if (!routesInput) return { primaryRoute: null, candidateRoutes: [] };

  if (Array.isArray(routesInput)) {
    return {
      primaryRoute: routesInput.length > 0 ? routesInput[0] : null,
      candidateRoutes: [...routesInput]
    };
  }

  // Handle recommendation envelope
  if (routesInput.selectedRoute || routesInput.primaryRecommendation || routesInput.primaryRoute) {
    const primary = routesInput.selectedRoute || routesInput.primaryRecommendation || routesInput.primaryRoute;
    const alts = routesInput.meaningfulAlternatives || routesInput.alternativeRoutes || routesInput.alternatives || [];
    return {
      primaryRoute: primary,
      candidateRoutes: [primary, ...alts]
    };
  }

  // Single route object
  return {
    primaryRoute: routesInput,
    candidateRoutes: [routesInput]
  };
}

/**
 * Extracts route legs or segments.
 * @param {object} route
 * @returns {Array<object>}
 */
function getRouteSegments(route) {
  if (!route || typeof route !== 'object') return [];
  return route.legs || route.segments || [];
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class CommuteDisruptionDetectionService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.disruptionImpactService]
   * @param {object} [options.constraintFilteringService]
   */
  constructor(options = {}) {
    this.impactService = options.disruptionImpactService || disruptionImpactService;
    this.constraintService = options.constraintFilteringService || routeConstraintFilteringService;
  }

  /**
   * Determines whether an individual disruption is relevant to a student's commute.
   *
   * @param {CommuteDisruption|object} disruption - Disruption to evaluate
   * @param {object} [context={}] - Student commute context
   * @param {string} [context.userId] - Student identifier
   * @param {object|Array} [context.routes] - Commute routes (candidate list or recommendation envelope)
   * @param {object} [context.primaryRoute] - Explicit primary route
   * @param {Array<object>} [context.alternativeRoutes] - Explicit alternative routes
   * @param {object} [context.preferences] - Student commute preferences
   * @param {object} [context.academicScheduleContext] - Academic calendar/lecture schedule context
   * @param {object} [options={}] - Execution options
   * @param {number} [options.currentTime=Date.now()] - Reference timestamp
   * @param {number} [options.delayThresholdMinutes=10] - Threshold for material delay
   * @param {string} [options.desiredArrivalTime] - Explicit arrival deadline (HH:MM)
   * @param {boolean} [options.includeAlertObject=true] - Whether to generate CommuteDisruptionAlert
   * @returns {object} DisruptionRelevanceVerdict
   */
  isDisruptionRelevant(disruption, context = {}, options = {}) {
    if (!disruption) {
      return {
        isRelevant: false,
        relevanceScore: 0,
        relevanceReason: 'No disruption provided for relevance analysis',
        reasonCode: 'INVALID_INPUT'
      };
    }

    const now = typeof options.currentTime === 'number' ? options.currentTime : Date.now();
    const delayThreshold = Number(options.delayThresholdMinutes ?? 10);

    // 1. Check Disruption Expiration
    const isExpired = disruption.isExpired
      ? disruption.isExpired(now)
      : (disruption.status === 'expired' || disruption.status === 'resolved' || (disruption.endTime && now >= Number(disruption.endTime)));

    if (isExpired) {
      return {
        isRelevant: false,
        relevanceScore: 0,
        relevanceReason: 'Disruption is expired or already resolved',
        reasonCode: 'EXPIRED',
        disruptionId: disruption.id || null,
        disruptionType: disruption.type || 'unknown',
        severity: disruption.severity || 'unknown',
        isExpired: true,
        alert: null
      };
    }

    // 2. Extract routes and segments
    const { primaryRoute: resolvedPrimary, candidateRoutes } = extractRoutesAndPrimary(context.routes);
    const primaryRoute = context.primaryRoute || resolvedPrimary;
    const alternativeRoutes = context.alternativeRoutes || candidateRoutes.filter(r => r !== primaryRoute);
    const allRoutes = primaryRoute
      ? [primaryRoute, ...alternativeRoutes.filter(r => r.id !== primaryRoute.id)]
      : candidateRoutes;

    const dMode = String(disruption.affectedMode || disruption.transportMode || '').toLowerCase();
    const dRouteId = String(disruption.affectedRouteId || disruption.lineOrRoute || '').trim();
    const dArea = String(disruption.affectedArea || disruption.area || '').toLowerCase();
    const dType = String(disruption.type || 'delay').toLowerCase();
    const delayMins = Number(disruption.estimatedDelayMinutes || 0);

    const isSuspensionOrClosure = dType === 'cancellation'
      || dType === 'service_suspension'
      || dType === 'route_closure'
      || (dType === 'waterlogging' && disruption.severity === 'critical');

    // 3. Segment Matching Across Student Routes
    const matchedRoutes = [];
    let isPrimaryImpacted = false;
    const allMatchedSegments = [];
    const allMatchedServices = [];
    const allMatchedAreas = [];

    for (const route of allRoutes) {
      const segments = getRouteSegments(route);
      const matchedRouteSegments = [];

      for (const seg of segments) {
        const segMode = String(seg.mode || '').toLowerCase();
        const segFrom = String(seg.from || seg.fromStop || seg.fromArea || '').toLowerCase();
        const segTo = String(seg.to || seg.toStop || seg.toArea || '').toLowerCase();
        const segCorridor = String(seg.corridorOrArea || seg.corridor || seg.road || '').toLowerCase();
        const segLineName = String(seg.lineInfo?.lineName || seg.lineName || '').toUpperCase();
        const segRouteShort = String(seg.lineInfo?.routeShortName || '').toUpperCase();
        const segServiceId = String(seg.serviceId || '').toUpperCase();
        const routeIdUpper = dRouteId.toUpperCase();

        let isMatch = false;

        // A. Mode & Line/Service Match
        if (dMode && segMode === dMode) {
          if (routeIdUpper) {
            if (
              (segLineName && (segLineName.includes(routeIdUpper) || routeIdUpper.includes(segLineName))) ||
              (segRouteShort && (segRouteShort === routeIdUpper || routeIdUpper.includes(segRouteShort))) ||
              (segServiceId && (segServiceId === routeIdUpper || routeIdUpper.includes(segServiceId)))
            ) {
              isMatch = true;
            }
          }

          // B. Area & Stop Match
          if (!isMatch && dArea) {
            if (
              (segFrom && (segFrom.includes(dArea) || dArea.includes(segFrom))) ||
              (segTo && (segTo.includes(dArea) || dArea.includes(segTo))) ||
              (segCorridor && (segCorridor.includes(dArea) || dArea.includes(segCorridor)))
            ) {
              isMatch = true;
            }
          }
        }

        // C. Road/Corridor Match (e.g. Traffic, Waterlogging on road)
        if (!isMatch && dArea && (segMode === 'bus' || segMode === 'auto' || segMode === 'shared_auto' || segMode === 'walk')) {
          if (
            (segCorridor && (segCorridor.includes(dArea) || dArea.includes(segCorridor))) ||
            (segFrom && (segFrom.includes(dArea) || dArea.includes(segFrom))) ||
            (segTo && (segTo.includes(dArea) || dArea.includes(segTo)))
          ) {
            isMatch = true;
          }
        }

        if (isMatch) {
          matchedRouteSegments.push(seg);
          allMatchedSegments.push({
            routeId: route.id,
            mode: seg.mode,
            from: seg.from || seg.fromStop,
            to: seg.to || seg.toStop,
            line: segLineName || segServiceId
          });
          if (segLineName && !allMatchedServices.includes(segLineName)) allMatchedServices.push(segLineName);
          if (dArea && !allMatchedAreas.includes(dArea)) allMatchedAreas.push(dArea);
        }
      }

      if (matchedRouteSegments.length > 0) {
        const isThisPrimary = primaryRoute && (route.id === primaryRoute.id || route === primaryRoute);
        if (isThisPrimary) isPrimaryImpacted = true;
        matchedRoutes.push({
          routeId: route.id,
          isPrimary: isThisPrimary,
          matchedSegments: matchedRouteSegments
        });
      }
    }

    // 4. Handle Fallback When No Routes Provided (e.g., student context without planned route)
    if (allRoutes.length === 0) {
      const prefs = context.preferences || {};
      const preferredModes = (prefs.preferredModes || []).map(m => String(m).toLowerCase());
      const campusArea = String(context.academicScheduleContext?.campusDestination || 'D.J. Sanghvi').toLowerCase();

      // Check if disruption matches student's campus area or preferred mode
      const matchesCampus = dArea && (campusArea.includes(dArea) || dArea.includes(campusArea));
      const matchesPrefMode = dMode && preferredModes.includes(dMode);

      if (matchesCampus && matchesPrefMode) {
        const campusLabel = disruption.affectedArea || dArea;
        return this._buildVerdict({
          isRelevant: true,
          relevanceScore: 60,
          relevanceReason: `Disruption reported on ${dMode.toUpperCase()} near your campus destination (${campusLabel}).`,
          reasonCode: 'CAMPUS_AREA_MATCH',
          disruption,
          isPrimaryImpacted: false,
          causesInfeasibility: false,
          addedDelayMinutes: delayMins,
          materialDelay: delayMins >= delayThreshold,
          academicConflict: false,
          context,
          options,
          now
        });
      }

      return {
        isRelevant: false,
        relevanceScore: 0,
        relevanceReason: 'Disruption does not affect any student commute route, preferred mode, or campus destination.',
        reasonCode: 'UNRELATED',
        disruptionId: disruption.id || null,
        alert: null
      };
    }

    // 5. If No Commute Segments Matched
    if (matchedRoutes.length === 0) {
      return {
        isRelevant: false,
        relevanceScore: 0,
        relevanceReason: `Disruption on ${dMode.toUpperCase()} in ${disruption.affectedArea || dArea || 'corridor'} does not intersect any segments of your commute routes.`,
        reasonCode: 'UNRELATED_ROUTE',
        disruptionId: disruption.id || null,
        alert: null
      };
    }

    // 6. Impact Analysis & Infeasibility Detection
    let causesInfeasibility = false;
    let infeasibilityReason = null;
    let hasAcademicConflict = false;
    let punctualityBufferLost = false;
    let projectedArrivalTime = null;

    const academic = context.academicScheduleContext || {};
    const classStartTimeStr = academic.classStartTime || academic.eventStartTime || null;
    const classStartMinutes = parseHHMMToMinutes(classStartTimeStr);
    const desiredArrivalTimeStr = options.desiredArrivalTime || context.desiredArrivalTime || null;
    const desiredArrivalMinutes = parseHHMMToMinutes(desiredArrivalTimeStr);

    // Analyze primary route impact
    if (isPrimaryImpacted && primaryRoute) {
      const baselineArrivalStr = primaryRoute.estimatedArrivalTime || primaryRoute.arrivalTime || '08:45';
      const baselineArrivalMins = parseHHMMToMinutes(baselineArrivalStr) || 525; // 08:45 default
      const updatedArrivalMins = baselineArrivalMins + delayMins;
      projectedArrivalTime = formatMinutesToHHMM(updatedArrivalMins);

      // A. Check Service Suspension or Closure
      if (isSuspensionOrClosure) {
        causesInfeasibility = true;
        infeasibilityReason = `SERVICE_SUSPENDED: ${dMode.toUpperCase()} leg along ${disruption.affectedArea || dRouteId} is unavailable.`;
      }

      // B. Check Explicit Arrival Deadline
      if (!causesInfeasibility && desiredArrivalMinutes !== null) {
        if (updatedArrivalMins > desiredArrivalMinutes) {
          causesInfeasibility = true;
          infeasibilityReason = `ARRIVAL_TOO_LATE: Updated arrival (${projectedArrivalTime}) violates desired arrival deadline (${desiredArrivalTimeStr}).`;
        }
      }

      // C. Check Academic Schedule Buffer & Class Start Time
      if (classStartMinutes !== null) {
        const lectureBuffer = academic.isExamDay ? 20 : 10;
        const availableBuffer = classStartMinutes - updatedArrivalMins;

        if (updatedArrivalMins > classStartMinutes) {
          hasAcademicConflict = true;
          causesInfeasibility = true;
          infeasibilityReason = `ARRIVAL_AFTER_CLASS_START: Updated arrival (${projectedArrivalTime}) misses ${classStartTimeStr} class start time.`;
        } else if (availableBuffer < lectureBuffer) {
          punctualityBufferLost = true;
          if (availableBuffer <= 0) {
            hasAcademicConflict = true;
          }
        }
      }
    }

    // Material delay if delay >= threshold, service suspended, or academic buffer lost
    const isMaterialDelay = delayMins >= delayThreshold
      || isSuspensionOrClosure
      || hasAcademicConflict
      || punctualityBufferLost
      || causesInfeasibility;

    // Check feasible alternatives
    const unaffectedAlternatives = alternativeRoutes.filter(alt => {
      return !matchedRoutes.some(mr => mr.routeId === alt.id);
    });

    // Compute Relevance Score (0-100)
    let relevanceScore = 40;
    if (isPrimaryImpacted) relevanceScore += 30;
    if (causesInfeasibility) relevanceScore += 25;
    else if (isMaterialDelay) relevanceScore += 15;
    if (hasAcademicConflict) relevanceScore += 10;
    relevanceScore = Math.min(100, relevanceScore);

    // Grounded Relevance Reason Construction
    let relevanceReason = '';
    const modeLabel = dMode ? dMode.toUpperCase() : 'TRANSIT';
    const lineLabel = dRouteId ? ` on ${dRouteId}` : (dMode ? ` on ${modeLabel}` : '');
    const areaLabel = disruption.affectedArea ? ` near ${disruption.affectedArea}` : (dArea ? ` near ${dArea}` : '');

    if (causesInfeasibility) {
      if (isSuspensionOrClosure) {
        relevanceReason = `Directly suspends your primary ${modeLabel} leg${lineLabel}${areaLabel}. Route is infeasible; alternative route recommended.`;
      } else if (hasAcademicConflict) {
        relevanceReason = `Adds +${delayMins} min delay to your primary${lineLabel} commute${areaLabel}, causing projected arrival (${projectedArrivalTime}) to miss your ${classStartTimeStr} class.`;
      } else {
        relevanceReason = `Adds +${delayMins} min delay to your primary${lineLabel} commute${areaLabel}, violating your arrival deadline (${desiredArrivalTimeStr}).`;
      }
    } else if (isPrimaryImpacted) {
      if (isMaterialDelay) {
        relevanceReason = `Directly impacts your primary${lineLabel} commute${areaLabel} with ~${delayMins} min delay. Earlier departure recommended.`;
      } else {
        relevanceReason = `Affects your primary${lineLabel} commute leg${areaLabel} with minor delay (~${delayMins} min).`;
      }
    } else {
      relevanceReason = `Affects alternative route option on ${modeLabel}${lineLabel}${areaLabel}. Your primary route remains undisrupted.`;
    }

    return this._buildVerdict({
      isRelevant: true,
      relevanceScore,
      relevanceReason,
      reasonCode: causesInfeasibility
        ? 'ROUTE_INFEASIBLE'
        : isPrimaryImpacted
          ? (isMaterialDelay ? 'PRIMARY_ROUTE_DELAYED' : 'CORRIDOR_MATCH')
          : 'ALTERNATIVE_ROUTE_AFFECTED',
      disruption,
      isPrimaryImpacted,
      causesInfeasibility,
      infeasibilityReason,
      addedDelayMinutes: delayMins,
      materialDelay: isMaterialDelay,
      academicConflict: hasAcademicConflict,
      punctualityBufferLost,
      projectedArrivalTime,
      classStartTimeStr,
      affectedRoutes: matchedRoutes,
      affectedSegments: allMatchedSegments,
      affectedServices: allMatchedServices,
      affectedAreas: allMatchedAreas,
      unaffectedAlternativesCount: unaffectedAlternatives.length,
      bestAlternativeId: unaffectedAlternatives[0]?.id || null,
      context,
      options,
      now
    });
  }

  /**
   * Evaluates a collection of disruptions and returns an impact summary.
   *
   * @param {object} params
   * @param {Array<object>} params.disruptions
   * @param {string} [params.userId]
   * @param {object|Array} [params.routes]
   * @param {object} [params.primaryRoute]
   * @param {Array<object>} [params.alternativeRoutes]
   * @param {object} [params.preferences]
   * @param {object} [params.academicScheduleContext]
   * @param {object} [params.options]
   * @returns {object} Batch detection result
   */
  detectRelevantDisruptions(params = {}) {
    const rawDisruptions = params.disruptions || [];
    const disruptions = Array.isArray(rawDisruptions) ? rawDisruptions : [rawDisruptions];
    const options = params.options || {};
    const includeAlerts = options.includeAlertObject !== false;

    const results = [];
    const relevantResults = [];
    const generatedAlerts = [];

    let primaryRouteImpacted = false;
    let primaryRouteInfeasible = false;
    let maxAddedDelayMinutes = 0;
    let materialDelayDetected = false;
    let academicConflictDetected = false;

    for (const d of disruptions) {
      const verdict = this.isDisruptionRelevant(d, params, options);
      results.push(verdict);

      if (verdict.isRelevant) {
        relevantResults.push(verdict);

        if (verdict.impactDetails?.isPrimaryRouteImpacted) {
          primaryRouteImpacted = true;
          if (verdict.impactDetails?.causesInfeasibility) {
            primaryRouteInfeasible = true;
          }
          if (verdict.impactDetails?.addedDelayMinutes > maxAddedDelayMinutes) {
            maxAddedDelayMinutes = verdict.impactDetails.addedDelayMinutes;
          }
          if (verdict.impactDetails?.materialDelay) {
            materialDelayDetected = true;
          }
          if (verdict.academicImpact?.hasAcademicConflict) {
            academicConflictDetected = true;
          }
        }

        if (includeAlerts && verdict.alert) {
          generatedAlerts.push(verdict.alert);
        }
      }
    }

    // Determine highest-priority recommended action type
    let recommendedActionType = 'NONE';
    if (primaryRouteInfeasible) {
      recommendedActionType = 'TAKE_ALTERNATIVE_ROUTE';
    } else if (maxAddedDelayMinutes >= 15 || academicConflictDetected) {
      recommendedActionType = 'DEPART_EARLIER';
    } else if (relevantResults.length > 0) {
      recommendedActionType = 'MONITOR_STATUS';
    }

    return {
      hasRelevantDisruptions: relevantResults.length > 0,
      relevantCount: relevantResults.length,
      totalEvaluated: disruptions.length,
      results,
      relevantResults,
      impactSummary: {
        primaryRouteImpacted,
        primaryRouteInfeasible,
        maxAddedDelayMinutes,
        materialDelayDetected,
        academicConflictDetected,
        recommendedActionType,
        feasibleAlternativesCount: relevantResults[0]?.impactDetails?.feasibleAlternativesCount || 0
      },
      generatedAlerts
    };
  }

  /**
   * Re-evaluates an existing recommendation when a disruption is detected.
   *
   * @param {object} recommendation - Recommendation object or envelope
   * @param {object|Array} disruptions - Active disruptions to re-evaluate against
   * @param {object} [options={}]
   * @returns {object} Re-evaluation result
   */
  reEvaluateRecommendationWithDisruption(recommendation, disruptions, options = {}) {
    if (!recommendation) {
      throw new Error('Recommendation is required for re-evaluation');
    }

    const { primaryRoute, candidateRoutes } = extractRoutesAndPrimary(recommendation);
    if (!primaryRoute) {
      return {
        originalPrimaryRouteId: null,
        updatedPrimaryRouteId: null,
        isPivotedToAlternative: false,
        pivotReason: 'No primary route to evaluate',
        reEvaluatedAt: Date.now()
      };
    }

    const detection = this.detectRelevantDisruptions({
      routes: candidateRoutes,
      primaryRoute,
      disruptions,
      options
    });

    const primaryImpacted = detection.impactSummary.primaryRouteImpacted;
    const primaryInfeasible = detection.impactSummary.primaryRouteInfeasible;

    let updatedPrimaryRouteId = primaryRoute.id;
    let isPivoted = false;
    let pivotReason = null;

    if (primaryInfeasible || (primaryImpacted && detection.impactSummary.maxAddedDelayMinutes >= 25)) {
      // Find undisrupted or viable alternative
      const alternativeRoutes = candidateRoutes.filter(r => r.id !== primaryRoute.id);
      const viableAlt = alternativeRoutes.find(alt => {
        const altDetection = this.detectRelevantDisruptions({
          routes: [alt],
          primaryRoute: alt,
          disruptions,
          options
        });
        return !altDetection.impactSummary.primaryRouteInfeasible;
      });

      if (viableAlt) {
        updatedPrimaryRouteId = viableAlt.id;
        isPivoted = true;
        pivotReason = primaryInfeasible
          ? `Primary route ${primaryRoute.id} became infeasible due to disruption. Pivoted to alternative route ${viableAlt.id}.`
          : `Primary route experienced excessive delay (+${detection.impactSummary.maxAddedDelayMinutes}m). Pivoted to faster alternative ${viableAlt.id}.`;
      } else {
        pivotReason = 'All candidate routes are impacted by active disruptions. Fallback guidance advised.';
      }
    }

    return {
      originalPrimaryRouteId: primaryRoute.id,
      updatedPrimaryRouteId,
      isPivotedToAlternative: isPivoted,
      pivotReason,
      impactSummary: detection.impactSummary,
      relevantDisruptionsCount: detection.relevantCount,
      reEvaluatedAt: Date.now()
    };
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  _buildVerdict(data) {
    const {
      isRelevant,
      relevanceScore,
      relevanceReason,
      reasonCode,
      disruption,
      isPrimaryImpacted,
      causesInfeasibility,
      infeasibilityReason,
      addedDelayMinutes,
      materialDelay,
      academicConflict,
      punctualityBufferLost,
      projectedArrivalTime,
      classStartTimeStr,
      affectedRoutes,
      affectedSegments,
      affectedServices,
      affectedAreas,
      unaffectedAlternativesCount,
      bestAlternativeId,
      context,
      options,
      now
    } = data;

    // Determine Recommended Action
    let actionType = 'monitor_status';
    let actionSummary = 'Monitor transit updates before departure.';
    let guidance = 'No significant disruption to primary travel corridor.';

    if (causesInfeasibility) {
      if (bestAlternativeId) {
        actionType = 'take_alternative_route';
        actionSummary = `Switch to alternative route (${bestAlternativeId}) to bypass disruption.`;
        guidance = 'Your primary route is disrupted; unaffected alternative route is available.';
      } else {
        actionType = 'switch_mode';
        actionSummary = 'Primary transit leg is suspended; seek alternative travel mode.';
        guidance = 'No direct route alternative found. Consider private or shared transport.';
      }
    } else if (disruption.type === 'traffic' || disruption.type === 'waterlogging') {
      actionType = 'avoid_corridor';
      actionSummary = `Avoid ${disruption.affectedArea || 'affected corridor'}`;
      guidance = `Road congestion or waterlogging reported along route leg (+${addedDelayMinutes} min delay).`;
    } else if (addedDelayMinutes >= 15 || academicConflict || punctualityBufferLost) {
      actionType = 'depart_earlier';
      actionSummary = `Depart ~${Math.max(10, addedDelayMinutes)} minutes earlier to safeguard arrival.`;
      guidance = academicConflict
        ? `Allows absorbing +${addedDelayMinutes} min delay to arrive before ${classStartTimeStr} lecture.`
        : `Allows absorbing +${addedDelayMinutes} min delay to meet your arrival deadline.`;
    }

    const recommendedAction = {
      actionType,
      summary: actionSummary,
      suggestedDepartureAdjustmentMinutes: addedDelayMinutes,
      suggestedAlternativeMode: bestAlternativeId ? 'metro' : null,
      suggestedCorridor: null,
      guidance
    };

    // Preserve 4-tier Provenance
    const prov = disruption.provenance
      ? (disruption.provenance.toJSON ? disruption.provenance.toJSON() : disruption.provenance)
      : {
          sourceTier: 'USER_REPORTED',
          provider: 'Community Commuter Feed',
          confidence: 'MEDIUM',
          lastUpdated: now,
          description: 'Crowdsourced transit disruption report'
        };

    const isSynthetic = prov.sourceTier === 'SYNTHETIC';
    const uncertaintyLevel = isSynthetic
      ? 'HIGH'
      : (prov.sourceTier === 'ESTIMATED' ? 'MODERATE' : 'LOW');

    // Build CommuteDisruptionAlert if requested
    let alert = null;
    if (options.includeAlertObject !== false && isRelevant) {
      try {
        alert = CommuteDisruptionAlert.create({
          userId: context.userId || context.studentId || null,
          disruptionId: disruption.id || null,
          disruptionType: disruption.type || 'delay',
          severity: disruption.severity || 'moderate',
          scope: {
            serviceId: disruption.affectedRouteId || null,
            serviceName: disruption.affectedRouteId || null,
            mode: disruption.affectedMode || null,
            lineOrRoute: disruption.affectedRouteId || null,
            segment: affectedSegments?.[0]?.line || null,
            area: disruption.affectedArea || 'Mumbai Metropolitan Region',
            stops: []
          },
          validFrom: Number(disruption.startTime || now),
          validUntil: Number(disruption.endTime || (now + 3600000)),
          status: 'active',
          provenance: prov,
          title: `[${String(disruption.affectedMode || 'Transit').toUpperCase()} Alert] ${String(disruption.type || 'Disruption').replace(/_/g, ' ')}`,
          message: disruption.description || 'Commute disruption reported.',
          relevanceReason,
          recommendedAction,
          affectedContext: {
            userId: context.userId || context.studentId || null,
            routeId: affectedRoutes?.[0]?.routeId || null,
            originArea: affectedRoutes?.[0]?.originArea || null,
            destinationArea: affectedRoutes?.[0]?.destinationArea || null,
            scheduledClassId: context.academicScheduleContext?.classId || null,
            scheduledStartTime: typeof context.academicScheduleContext?.classStartTime === 'number'
              ? context.academicScheduleContext.classStartTime
              : null,
            matchedSegments: (affectedSegments || []).map(s => s.line || s.from || 'segment')
          },
          isLiveFeed: false
        });
      } catch (err) {
        // Safe alert fallback
        alert = null;
      }
    }

    return {
      isRelevant,
      relevanceScore,
      relevanceReason,
      reasonCode,
      disruptionId: disruption.id || null,
      disruptionType: disruption.type || 'delay',
      severity: disruption.severity || 'moderate',
      affectedMode: disruption.affectedMode || null,
      affectedArea: disruption.affectedArea || null,
      affectedServices: affectedServices || [],
      affectedSegments: affectedSegments || [],
      affectedAreas: affectedAreas || [],
      impactDetails: {
        addedDelayMinutes,
        materialDelay: Boolean(materialDelay),
        causesInfeasibility: Boolean(causesInfeasibility),
        infeasibilityReason,
        isPrimaryRouteImpacted: Boolean(isPrimaryImpacted),
        impactedRouteIds: (affectedRoutes || []).map(r => r.routeId),
        isAlternativeAvailable: (unaffectedAlternativesCount || 0) > 0,
        feasibleAlternativesCount: unaffectedAlternativesCount || 0,
        bestAlternativeId: bestAlternativeId || null
      },
      academicImpact: {
        hasAcademicContext: Boolean(context.academicScheduleContext),
        hasAcademicConflict: Boolean(academicConflict),
        classStartTime: classStartTimeStr || null,
        projectedArrivalTime: projectedArrivalTime || null,
        punctualityBufferLost: Boolean(punctualityBufferLost)
      },
      recommendedAction,
      provenance: prov,
      uncertainty: {
        level: uncertaintyLevel,
        hasSyntheticData: isSynthetic,
        isLiveFeed: false
      },
      alert
    };
  }
}

const commuteDisruptionDetectionService = new CommuteDisruptionDetectionService();

module.exports = {
  CommuteDisruptionDetectionService,
  commuteDisruptionDetectionService
};
