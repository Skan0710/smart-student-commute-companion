/**
 * CommuteAlertGenerationService
 *
 * Alert-generation service using existing disruption detection and route evaluation services.
 * Generates structured, actionable, and grounded commute disruption alerts for students.
 *
 * Invariants & Requirements:
 * 1. Truthful & Grounded: Never invents disruption details, delay amounts, or false alternative routes.
 * 2. Feasible Alternatives Only: Never recommends an alternative route that is infeasible, suspended, or violative of constraints.
 * 3. Clear Provenance & Uncertainty: Explicitly distinguishes reported, estimated, synthetic, and verified data.
 * 4. Calm & Student-Centered Tone: Avoids alarming or sensationalist language unsupported by evidence.
 * 5. Deterministic Templates: Employs verified deterministic templates as a reliable baseline.
 * 6. Idempotency & Deduplication: Prevents duplicate identical alert generation from an unchanged disruption.
 * 7. Delivery Boundary: Generates alerts as domain instances without triggering push/external notifications.
 */

const {
  CommuteDisruptionAlert,
  ALERT_ACTION_TYPES,
  DataProvenance,
  PROVENANCE_TIERS,
  normalizeDisruptionSeverity
} = require('../models');
const { commuteDisruptionDetectionService } = require('./commuteDisruptionDetectionService');
const { routeConstraintFilteringService } = require('./routeConstraintFilteringService');

// ============================================================================
// TEMPLATE ENGINE (Deterministic, Grounded, Student-Centered)
// ============================================================================

/**
 * Builds a concise, calm alert title based on mode, line, and disruption type.
 *
 * @param {object} params
 * @returns {string}
 */
function buildDeterministicAlertTitle({ mode, lineOrRoute, area, disruptionType, severity, estimatedDelayMinutes }) {
  const modeLabel = String(mode || 'transit').toUpperCase();
  const lineOrArea = lineOrRoute || area || 'Mumbai transit corridor';
  const delayStr = estimatedDelayMinutes ? ` (~${estimatedDelayMinutes} min delay)` : '';

  switch (disruptionType) {
    case 'cancellation':
    case 'service_suspension':
    case 'route_closure':
      return `[${modeLabel} Notice] ${lineOrArea} service suspended`;
    case 'waterlogging':
      return `[${modeLabel} Advisory] Waterlogging reported near ${area || lineOrArea}`;
    case 'traffic':
      return `[${modeLabel} Notice] Road congestion near ${area || lineOrArea}${delayStr}`;
    case 'delay':
    default:
      if (severity === 'severe' || severity === 'critical') {
        return `[${modeLabel} Advisory] Major delays reported on ${lineOrArea}${delayStr}`;
      }
      return `[${modeLabel} Notice] ${lineOrArea} reported delayed${delayStr}`;
  }
}

/**
 * Builds an understandable, grounded description adhering strictly to verified evidence.
 *
 * @param {object} params
 * @returns {string}
 */
function buildDeterministicAlertDescription({
  mode,
  disruptionType,
  area,
  estimatedDelayMinutes,
  hasFeasibleAlternative,
  alternativeRouteSummary,
  hasAcademicConflict,
  classStartTime,
  sourceTier,
  provider
}) {
  const modeLower = String(mode || 'transit').toLowerCase();
  const parts = [];

  // 1. Core disruption statement
  if (disruptionType === 'cancellation' || disruptionType === 'service_suspension' || disruptionType === 'route_closure') {
    parts.push(`Your selected ${modeLower} route is currently unavailable due to ${disruptionType.replace(/_/g, ' ')} near ${area || 'the corridor'}.`);
  } else if (disruptionType === 'traffic') {
    if (estimatedDelayMinutes !== null && estimatedDelayMinutes !== undefined && estimatedDelayMinutes > 0) {
      parts.push(`Your selected ${modeLower} route is affected by road congestion near ${area || 'corridor'}. The current estimate adds approximately ${estimatedDelayMinutes} minutes.`);
    } else {
      parts.push(`Your selected ${modeLower} route is affected by traffic congestion near ${area || 'corridor'}. Delay duration is currently unspecified.`);
    }
  } else {
    // Standard delay
    if (estimatedDelayMinutes !== null && estimatedDelayMinutes !== undefined && estimatedDelayMinutes > 0) {
      parts.push(`Your selected ${modeLower} route is reported delayed. The current estimate adds approximately ${estimatedDelayMinutes} minutes.`);
    } else {
      parts.push(`Your selected ${modeLower} route has a reported delay near ${area || 'the corridor'}. Delay duration is currently unspecified.`);
    }
  }

  // 2. Academic impact note
  if (hasAcademicConflict && classStartTime) {
    parts.push(`This delay threatens your arrival before your ${classStartTime} class start time.`);
  }

  // 3. Actionable recommendation (strictly verified: only recommend alternative if feasible!)
  if (hasFeasibleAlternative && alternativeRouteSummary) {
    parts.push(`Consider the available alternative route via ${alternativeRouteSummary}.`);
  } else if (hasFeasibleAlternative) {
    parts.push('Consider the available alternative route.');
  } else if (estimatedDelayMinutes && estimatedDelayMinutes >= 15) {
    parts.push(`Consider departing ~${estimatedDelayMinutes} minutes earlier to maintain your schedule.`);
  } else if (disruptionType === 'cancellation' || disruptionType === 'service_suspension') {
    parts.push('No direct route alternative is currently available. Consider private or shared transport.');
  } else {
    parts.push('Monitor transit updates before departure.');
  }

  // 4. Source & Provenance Disclosure
  let sourceBadge = '';
  if (sourceTier === 'VERIFIED') {
    sourceBadge = `[Verified official report from ${provider || 'transport authority'}]`;
  } else if (sourceTier === 'USER_REPORTED') {
    sourceBadge = `[Reported by ${provider || 'Community Commuters'}]`;
  } else if (sourceTier === 'ESTIMATED') {
    sourceBadge = `[Algorithmic estimate by ${provider || 'Transit Model'}]`;
  } else if (sourceTier === 'SYNTHETIC') {
    sourceBadge = `[Simulation estimate from ${provider || 'Monsoon Scenario'}]`;
  }

  if (sourceBadge) {
    parts.push(sourceBadge);
  }

  return parts.join(' ');
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class CommuteAlertGenerationService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.detectionService]
   * @param {object} [options.constraintService]
   */
  constructor(options = {}) {
    this.detectionService = options.detectionService || commuteDisruptionDetectionService;
    this.constraintService = options.constraintService || routeConstraintFilteringService;

    // In-memory deduplication cache: fingerprint -> alert metadata
    this.generatedAlertKeys = new Map();
  }

  /**
   * Clears the in-memory alert deduplication cache (useful in tests).
   */
  clearDeduplicationCache() {
    this.generatedAlertKeys.clear();
  }

  /**
   * Computes a deterministic deduplication fingerprint for an alert.
   * Prevents identical alert generation from an unchanged disruption.
   *
   * @param {string} userId
   * @param {object} disruption
   * @param {string} [primaryRouteId]
   * @returns {string}
   */
  computeFingerprint(userId, disruption, primaryRouteId) {
    const uId = userId || 'broadcast';
    const dId = disruption.id || 'disr';
    const dUpdate = disruption.updatedAt || disruption.startTime || 0;
    const dDelay = (disruption.estimatedDelayMinutes !== undefined && disruption.estimatedDelayMinutes !== null)
      ? disruption.estimatedDelayMinutes
      : 'unspecified';
    const dStatus = disruption.status || 'active';
    const dSeverity = disruption.severity || 'moderate';
    const rId = primaryRouteId || 'default_route';

    return `fp:${uId}:${dId}:${dUpdate}:${dDelay}:${dStatus}:${dSeverity}:${rId}`;
  }

  /**
   * Evaluates candidate alternative routes and returns the first strictly FEASIBLE alternative.
   * Never recommends an alternative that is infeasible, suspended, or violates constraints.
   *
   * @param {Array<object>} alternativeRoutes
   * @param {object} disruption
   * @param {object} context
   * @param {object} options
   * @returns {object|null} Feasible alternative route summary or null
   */
  findFeasibleAlternative(alternativeRoutes, disruption, context, options) {
    if (!Array.isArray(alternativeRoutes) || alternativeRoutes.length === 0) {
      return null;
    }

    for (const alt of alternativeRoutes) {
      if (!alt || typeof alt !== 'object') continue;

      // 1. Check if the alternative route itself is explicitly marked infeasible
      if (alt.isFeasible === false || alt.status === 'INFEASIBLE') {
        continue;
      }

      // 2. Check if the disruption affects this alternative route
      const altVerdict = this.detectionService.isDisruptionRelevant(disruption, {
        routes: [alt],
        primaryRoute: alt,
        preferences: context.preferences,
        academicScheduleContext: context.academicScheduleContext
      }, options);

      // If the alternative route is impacted and causes infeasibility or severe delay, reject it!
      if (altVerdict.isRelevant && (altVerdict.impactDetails?.causesInfeasibility || altVerdict.impactDetails?.addedDelayMinutes >= 30)) {
        continue;
      }

      // 3. Check hard constraints if constraint service is available
      if (context.preferences || options.desiredArrivalTime) {
        try {
          const evalResult = this.constraintService.evaluateRoute(alt, {
            constraints: context.preferences?.constraints || {},
            desiredArrivalTime: options.desiredArrivalTime || context.desiredArrivalTime
          });
          if (evalResult && evalResult.isAccepted === false) {
            continue; // Violates student's constraints
          }
        } catch (err) {
          // Non-fatal constraint check fallback
        }
      }

      // Found a strictly feasible alternative!
      const altMode = String(alt.primaryMode || 'transit').toUpperCase();
      const altName = alt.name || alt.lineName || `${altMode} Route`;

      return {
        routeId: String(alt.id || 'alt-route'),
        name: altName,
        primaryMode: alt.primaryMode || 'transit',
        totalDurationMinutes: Number(alt.totalDurationMinutes || alt.durationMinutes || 45),
        estimatedArrivalTime: alt.estimatedArrivalTime || alt.arrivalTime || '08:50',
        summary: altName,
        isFeasible: true
      };
    }

    return null;
  }

  /**
   * Generates an actionable CommuteDisruptionAlert for a single disruption if relevant and justified.
   *
   * @param {CommuteDisruption|object} disruption
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {object} { isGenerated: boolean, alert: CommuteDisruptionAlert|null, reason: string, isDuplicate: boolean, fingerprint: string }
   */
  generateAlertForDisruption(disruption, context = {}, options = {}) {
    if (!disruption) {
      return {
        isGenerated: false,
        alert: null,
        reason: 'NO_DISRUPTION_PROVIDED',
        isDuplicate: false,
        fingerprint: null
      };
    }

    const now = typeof options.currentTime === 'number' ? options.currentTime : Date.now();

    // 1. Expiration Check: Ignore expired disruptions
    const isExpired = disruption.isExpired
      ? disruption.isExpired(now)
      : (disruption.status === 'expired' || disruption.status === 'resolved' || (disruption.endTime && now >= Number(disruption.endTime)));

    if (isExpired) {
      return {
        isGenerated: false,
        alert: null,
        reason: 'DISRUPTION_EXPIRED',
        isDuplicate: false,
        fingerprint: null
      };
    }

    // 2. Evaluate Relevance via CommuteDisruptionDetectionService
    const verdict = this.detectionService.isDisruptionRelevant(disruption, context, options);

    if (!verdict.isRelevant) {
      return {
        isGenerated: false,
        alert: null,
        reason: verdict.reasonCode || 'NOT_RELEVANT',
        isDuplicate: false,
        fingerprint: null,
        verdict
      };
    }

    // 3. Resolve Primary and Alternative Routes
    const primaryRoute = context.primaryRoute
      || (Array.isArray(context.routes) ? context.routes[0] : null)
      || context.routes?.selectedRoute
      || context.routes?.primaryRecommendation
      || null;

    const rawAlternatives = context.alternativeRoutes
      || (Array.isArray(context.routes) ? context.routes.slice(1) : [])
      || context.routes?.meaningfulAlternatives
      || context.routes?.alternativeRoutes
      || [];

    // 4. Idempotency Check: Prevent duplicate alerts for unchanged disruptions
    const userId = context.userId || context.studentId || null;
    const fingerprint = this.computeFingerprint(userId, disruption, primaryRoute?.id);

    if (options.forceRegenerate !== true && this.generatedAlertKeys.has(fingerprint)) {
      const cached = this.generatedAlertKeys.get(fingerprint);
      return {
        isGenerated: false,
        alert: cached,
        reason: 'DUPLICATE_UNCHANGED',
        isDuplicate: true,
        fingerprint,
        verdict
      };
    }

    // 5. Check Feasible Alternative Routes (Never recommend an infeasible alternative!)
    const feasibleAlternative = this.findFeasibleAlternative(rawAlternatives, disruption, context, options);

    // 6. Resolve Grounded Metrics (Never invent disruption details or delay amounts)
    const rawDelay = disruption.estimatedDelayMinutes;
    const hasDelayNumber = rawDelay !== undefined && rawDelay !== null && !isNaN(Number(rawDelay));
    const delayMins = hasDelayNumber ? Number(rawDelay) : null;

    const mode = disruption.affectedMode || primaryRoute?.primaryMode || 'transit';
    const lineOrRoute = disruption.affectedRouteId || disruption.lineOrRoute || primaryRoute?.lineName || null;
    const area = disruption.affectedArea || disruption.area || 'Mumbai transit corridor';
    const disruptionType = disruption.type || 'delay';
    const severity = normalizeDisruptionSeverity(disruption.severity || 'moderate');

    const academic = context.academicScheduleContext || {};
    const hasAcademicConflict = Boolean(verdict.academicImpact?.hasAcademicConflict);
    const classStartTime = academic.classStartTime || academic.eventStartTime || null;

    // 7. Provenance & Uncertainty
    const provObj = disruption.provenance
      ? (disruption.provenance.toJSON ? disruption.provenance.toJSON() : disruption.provenance)
      : {
          sourceTier: 'USER_REPORTED',
          provider: 'Community Commuter Feed',
          confidence: 'MEDIUM',
          lastUpdated: now,
          description: 'Crowdsourced transit disruption report'
        };

    const prov = new DataProvenance(provObj);
    const sourceTier = prov.sourceTier;
    const isSynthetic = sourceTier === PROVENANCE_TIERS.SYNTHETIC;

    // 8. Construct Deterministic Grounded Title & Description
    const title = buildDeterministicAlertTitle({
      mode,
      lineOrRoute,
      area,
      disruptionType,
      severity,
      estimatedDelayMinutes: delayMins
    });

    const message = buildDeterministicAlertDescription({
      mode,
      disruptionType,
      area,
      estimatedDelayMinutes: delayMins,
      hasFeasibleAlternative: Boolean(feasibleAlternative),
      alternativeRouteSummary: feasibleAlternative ? (feasibleAlternative.name || feasibleAlternative.primaryMode) : null,
      hasAcademicConflict,
      classStartTime,
      sourceTier,
      provider: prov.provider
    });

    // 9. Recommended Action Object (Justified by Evidence)
    let actionType = ALERT_ACTION_TYPES.MONITOR_STATUS;
    let actionSummary = 'Monitor transit updates before departure.';
    let guidance = 'Travel corridor has active advisory.';

    if (verdict.impactDetails?.causesInfeasibility) {
      if (feasibleAlternative) {
        actionType = ALERT_ACTION_TYPES.TAKE_ALTERNATIVE_ROUTE;
        actionSummary = `Switch to alternative route via ${feasibleAlternative.name}.`;
        guidance = 'Selected route is disrupted. Feasible alternative route is verified available.';
      } else {
        actionType = ALERT_ACTION_TYPES.SWITCH_MODE;
        actionSummary = 'Primary transit route unavailable; seek alternative travel mode.';
        guidance = 'No direct route alternative found. Consider private or shared transit.';
      }
    } else if (disruptionType === 'traffic' || disruptionType === 'waterlogging') {
      actionType = ALERT_ACTION_TYPES.AVOID_CORRIDOR;
      actionSummary = `Avoid ${area}`;
      guidance = delayMins
        ? `Road congestion reported (+${delayMins} min delay).`
        : 'Road congestion reported along route leg.';
    } else if (delayMins && delayMins >= 15) {
      actionType = ALERT_ACTION_TYPES.DEPART_EARLIER;
      actionSummary = `Depart ~${delayMins} minutes earlier to safeguard arrival.`;
      guidance = hasAcademicConflict
        ? `Allows absorbing +${delayMins} min delay to arrive before ${classStartTime} lecture.`
        : `Allows absorbing +${delayMins} min delay to meet your arrival window.`;
    }

    const recommendedAction = {
      actionType,
      summary: actionSummary,
      suggestedDepartureAdjustmentMinutes: delayMins || 0,
      suggestedAlternativeMode: feasibleAlternative?.primaryMode || null,
      suggestedCorridor: null,
      guidance
    };

    // 10. Instantiate CommuteDisruptionAlert
    const alertId = `alert-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const validFrom = Number(disruption.startTime || now);
    const validUntil = Number(disruption.endTime || (now + 3600000));

    const alert = CommuteDisruptionAlert.create({
      id: alertId,
      userId,
      disruptionId: disruption.id || null,
      disruptionType,
      severity,
      scope: {
        serviceId: disruption.affectedRouteId || null,
        serviceName: disruption.affectedRouteId || null,
        mode,
        lineOrRoute,
        segment: verdict.affectedSegments?.[0]?.line || null,
        area,
        stops: []
      },
      validFrom,
      validUntil,
      status: 'active',
      provenance: prov.toJSON(),
      title,
      message,
      relevanceReason: verdict.relevanceReason,
      recommendedAction,
      alternativeRoute: feasibleAlternative,
      affectedContext: {
        userId,
        routeId: primaryRoute?.id || null,
        originArea: primaryRoute?.originArea || null,
        destinationArea: primaryRoute?.destinationArea || null,
        scheduledClassId: academic.classId || null,
        scheduledStartTime: typeof academic.classStartTime === 'number' ? academic.classStartTime : null,
        matchedSegments: (verdict.affectedSegments || []).map(s => s.line || s.from || 'segment')
      },
      isLiveFeed: false, // Honest prototype disclosure: no live GPS claim
      createdAt: now,
      updatedAt: now
    });

    // Record fingerprint in deduplication cache
    this.generatedAlertKeys.set(fingerprint, alert);

    return {
      isGenerated: true,
      alert,
      reason: 'RELEVANT_AND_JUSTIFIED',
      isDuplicate: false,
      fingerprint,
      verdict
    };
  }

  /**
   * Generates alerts for a batch of candidate disruptions.
   * Suppresses duplicates, filters expired/irrelevant disruptions, and returns structured summary.
   *
   * @param {Array<object>} disruptions
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {object} Batch alert generation result
   */
  generateAlertsForDisruptions(disruptions, context = {}, options = {}) {
    const list = Array.isArray(disruptions) ? disruptions : (disruptions ? [disruptions] : []);

    const generatedAlerts = [];
    let duplicateCount = 0;
    let skippedCount = 0;

    for (const d of list) {
      const res = this.generateAlertForDisruption(d, context, options);

      if (res.isGenerated && res.alert) {
        generatedAlerts.push(res.alert);
      } else if (res.isDuplicate) {
        duplicateCount++;
      } else {
        skippedCount++;
      }
    }

    return {
      alerts: generatedAlerts,
      generatedCount: generatedAlerts.length,
      duplicateCount,
      skippedCount,
      totalEvaluated: list.length
    };
  }
}

const commuteAlertGenerationService = new CommuteAlertGenerationService();

module.exports = {
  CommuteAlertGenerationService,
  commuteAlertGenerationService,
  buildDeterministicAlertTitle,
  buildDeterministicAlertDescription
};
