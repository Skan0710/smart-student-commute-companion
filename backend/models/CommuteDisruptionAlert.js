/**
 * CommuteDisruptionAlert Domain Model & Contracts
 *
 * Establishes the domain model, validation schemas, and lifecycle contracts for commute disruption alerts.
 * Reuses existing notification, commute, disruption, and 4-tier provenance infrastructure.
 *
 * Invariants:
 * - Validates required fields, positive integer timestamps, and validFrom <= validUntil.
 * - Handles expired disruptions correctly via active -> expired lifecycle transitions.
 * - Enforces privacy-by-design: prohibits precise home addresses, GPS coordinates, and location tracking history.
 * - Protects user-specific alert data with authorization (assertAccess).
 * - Bridges seamlessly to existing Notification model (type: 'disruption') without duplicate notification systems.
 * - Never falsely claims live disruption telemetry when relying on estimated or synthetic data.
 */

const { z } = require('zod');
const {
  disruptionTypeEnum,
  disruptionSeverityEnum,
  transportModeEnum,
  provenanceSchema,
  DataProvenance,
  normalizeDisruptionSeverity,
  TRANSPORT_MODES,
  DISRUPTION_TYPES,
  DISRUPTION_SEVERITIES,
  PROVENANCE_TIERS,
  ALERT_STATUSES,
  alertStatusEnum,
  ALERT_ACTION_TYPES,
  alertActionTypeEnum
} = require('./CommuteContracts');
const { Notification } = require('./Notification');
const {
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError
} = require('../errors');

// ============================================================================
// 1. CONSTANTS & ENUMS
// ============================================================================

/**
 * Mapping from disruption severity to in-app notification priority.
 */
const ALERT_SEVERITY_TO_NOTIFICATION_PRIORITY = Object.freeze({
  minor: 'low',
  moderate: 'medium',
  severe: 'high',
  critical: 'high'
});

/**
 * Forbidden privacy-invasive, tracking, or precise address fields.
 */
const FORBIDDEN_ALERT_PRIVACY_FIELDS = Object.freeze([
  'homeAddress',
  'home_address',
  'residentialAddress',
  'residential_address',
  'streetAddress',
  'street_address',
  'exactLocation',
  'exact_location',
  'preciseLocation',
  'precise_location',
  'coordinates',
  'coords',
  'lat',
  'latitude',
  'lon',
  'lng',
  'longitude',
  'gps',
  'tracking',
  'currentLocation',
  'current_location',
  'liveLocation',
  'live_location',
  'locationHistory',
  'location_history',
  'trackingPoints',
  'tracking_points',
  'breadcrumbs',
  'deviceId',
  'device_id',
  'imei',
  'macAddress',
  'mac_address'
]);

/**
 * Checks an object recursively for forbidden privacy-invasive fields.
 * @param {object} obj
 * @returns {string[]} Array of prohibited field names found
 */
function findForbiddenAlertPrivacyFields(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const detected = [];

  for (const field of FORBIDDEN_ALERT_PRIVACY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, field) && obj[field] !== undefined) {
      detected.push(field);
    }
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = findForbiddenAlertPrivacyFields(val);
      detected.push(...nested);
    }
  }

  return Array.from(new Set(detected));
}

/**
 * Validates that location strings are coarse (e.g., "Andheri West", "Churchgate")
 * and do not contain coordinates or precise residential room/flat numbers.
 * @param {string} text
 * @returns {boolean} True if clean, throws ValidationError if violation found
 */
function assertCoarseLocationPrivacy(text, fieldName = 'location') {
  if (!text || typeof text !== 'string') return true;

  // Check for GPS decimal coordinates like "19.1234, 72.8456"
  if (/-?\d+\.\d{3,}\s*,\s*-?\d+\.\d{3,}/.test(text)) {
    throw new ValidationError(
      `Privacy violation: ${fieldName} contains exact GPS coordinates. Only coarse area names are permitted.`
    );
  }

  // Check for residential address patterns like "Flat 402", "Room 3B", "Apt 12", "Door 5"
  if (/\b(?:flat|room|apt|apartment|door|house|building|bldg)\s*#?\s*\w+/i.test(text)) {
    throw new ValidationError(
      `Privacy violation: ${fieldName} contains specific residential/room identifiers. Only coarse area names are permitted.`
    );
  }

  return true;
}

/**
 * Sanitizes a location string to remove coordinate fragments or residential details.
 * @param {string} location
 * @returns {string}
 */
function sanitizeAlertArea(location) {
  if (!location || typeof location !== 'string') return 'Mumbai Metropolitan Region';

  let cleaned = location
    .replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '')
    .replace(/\b\d+\.\d{3,}\b/g, '')
    .replace(/(?:flat|room|apt|door|house|building|bldg|plot|no\.?)\s*#?\s*\w+[\s,]*/gi, '')
    .replace(/\b\d{6}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();

  return cleaned.length >= 2 ? cleaned : 'Mumbai Metropolitan Region';
}

// ============================================================================
// 2. VALUE OBJECT SCHEMAS
// ============================================================================

/**
 * Transport scope affected by the disruption alert.
 */
const alertTransportScopeSchema = z.object({
  serviceId: z.string().max(100).nullable().optional().default(null),
  serviceName: z.string().max(100).nullable().optional().default(null),
  mode: transportModeEnum.nullable().optional().default(null),
  lineOrRoute: z.string().max(100).nullable().optional().default(null),
  segment: z.string().max(150).nullable().optional().default(null),
  area: z.string().min(2, 'Area name must be at least 2 characters').max(100),
  stops: z.array(z.string().max(100)).optional().default([])
});

/**
 * Commuter-focused recommended action.
 */
const alertRecommendedActionSchema = z.object({
  actionType: alertActionTypeEnum.default('monitor_status'),
  summary: z.string().min(1, 'Action summary is required').max(250),
  suggestedDepartureAdjustmentMinutes: z.number().int().min(0).default(0),
  suggestedAlternativeMode: transportModeEnum.nullable().optional().default(null),
  suggestedCorridor: z.string().max(100).nullable().optional().default(null),
  guidance: z.string().max(500).optional().default('')
});

/**
 * Personalized commute or route context matching the alert.
 */
const affectedCommuteContextSchema = z.object({
  userId: z.string().min(1).nullable().optional().default(null),
  routeId: z.string().max(100).nullable().optional().default(null),
  journeyId: z.string().max(100).nullable().optional().default(null),
  originArea: z.string().max(100).nullable().optional().default(null),
  destinationArea: z.string().max(100).nullable().optional().default(null),
  scheduledClassId: z.string().max(100).nullable().optional().default(null),
  scheduledStartTime: z.number().int().positive().nullable().optional().default(null),
  matchedSegments: z.array(z.string().max(100)).optional().default([]),
  plannedDepartureTime: z.number().int().positive().nullable().optional().default(null)
});

/**
 * Alternative route summary when available.
 */
const alertAlternativeRouteSchema = z.object({
  routeId: z.string().min(1).max(100),
  name: z.string().max(150).optional().default(''),
  primaryMode: transportModeEnum.optional(),
  totalDurationMinutes: z.number().int().min(0).optional(),
  estimatedArrivalTime: z.string().max(10).optional(),
  summary: z.string().max(300).optional().default(''),
  isFeasible: z.boolean().default(true)
});

// ============================================================================
// 3. CORE DISRUPTION ALERT SCHEMA
// ============================================================================

const commuteDisruptionAlertSchema = z.object({
  id: z.string().min(1, 'Alert ID is required'),
  userId: z.string().min(1).nullable().optional().default(null),
  disruptionId: z.string().max(100).nullable().optional().default(null),
  disruptionType: disruptionTypeEnum,
  severity: disruptionSeverityEnum.default('moderate'),
  scope: alertTransportScopeSchema,
  validFrom: z.number().int().positive('validFrom must be a positive integer timestamp'),
  validUntil: z.number().int().positive('validUntil must be a positive integer timestamp'),
  status: alertStatusEnum.default('active'),
  provenance: provenanceSchema.default(() => DataProvenance.userReported('Community Commuter Feed').toJSON()),
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  message: z.string().min(5, 'Message must be at least 5 characters').max(500),
  relevanceReason: z.string().min(3, 'Relevance reason must be at least 3 characters').max(300),
  recommendedAction: alertRecommendedActionSchema.nullable().optional().default(null),
  alternativeRoute: alertAlternativeRouteSchema.nullable().optional().default(null),
  affectedContext: affectedCommuteContextSchema.nullable().optional().default(null),
  isLiveFeed: z.boolean().default(false),
  dismissedAt: z.number().int().positive().nullable().optional().default(null),
  resolvedAt: z.number().int().positive().nullable().optional().default(null),
  createdAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now())
}).superRefine((data, ctx) => {
  // 1. Invariant: validUntil must be >= validFrom
  if (data.validUntil < data.validFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validUntil'],
      message: `validUntil (${data.validUntil}) cannot be earlier than validFrom (${data.validFrom})`
    });
  }

  // 2. Invariant: Do not claim live telemetry for synthetic or estimated data
  const tier = data.provenance?.sourceTier;
  if (data.isLiveFeed === true && (tier === 'SYNTHETIC' || tier === 'ESTIMATED')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isLiveFeed'],
      message: `Cannot claim verified live disruption feeds when data provenance is ${tier}`
    });
  }
});

// ============================================================================
// 4. DOMAIN ENTITY CLASS
// ============================================================================

class CommuteDisruptionAlert {
  /**
   * Constructs a validated CommuteDisruptionAlert instance.
   * @param {object} data
   */
  constructor(data) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Alert data must be a valid object');
    }

    // Check for prohibited privacy fields
    const prohibited = findForbiddenAlertPrivacyFields(data);
    if (prohibited.length > 0) {
      throw new ValidationError(
        `Privacy violation: Disruption alert contains prohibited tracking/location fields: ${prohibited.join(', ')}`
      );
    }

    // Check coarse location privacy
    if (data.scope?.area) {
      assertCoarseLocationPrivacy(data.scope.area, 'scope.area');
    }
    if (data.scope?.segment) {
      assertCoarseLocationPrivacy(data.scope.segment, 'scope.segment');
    }
    if (data.affectedContext?.originArea) {
      assertCoarseLocationPrivacy(data.affectedContext.originArea, 'affectedContext.originArea');
    }
    if (data.affectedContext?.destinationArea) {
      assertCoarseLocationPrivacy(data.affectedContext.destinationArea, 'affectedContext.destinationArea');
    }

    const validated = commuteDisruptionAlertSchema.parse(data);
    Object.assign(this, validated);

    // Ensure DataProvenance instance
    this.provenance = new DataProvenance(validated.provenance);
  }

  /**
   * Factory constructor with sensible defaults and ID generation.
   * @param {object} input
   * @returns {CommuteDisruptionAlert}
   */
  static create(input) {
    const now = Date.now();
    const validFrom = input.validFrom || now;
    const durationMs = (input.durationMinutes || 60) * 60 * 1000;
    const validUntil = input.validUntil || (validFrom + durationMs);
    const id = input.id || `alert-${now}-${Math.random().toString(36).substring(2, 7)}`;

    return new CommuteDisruptionAlert({
      ...input,
      id,
      severity: normalizeDisruptionSeverity(input.severity || 'moderate'),
      validFrom,
      validUntil,
      status: input.status || (now >= validUntil ? 'expired' : 'active'),
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now
    });
  }

  /**
   * Creates a CommuteDisruptionAlert from a CommuteDisruption entity and optional student context.
   * @param {object} disruption - CommuteDisruption instance or object
   * @param {object} [context={}] - Optional student commute context
   * @returns {CommuteDisruptionAlert}
   */
  static fromDisruption(disruption, context = {}) {
    if (!disruption) {
      throw new BadRequestError('Source CommuteDisruption is required to build an alert');
    }

    const now = Date.now();
    const alertId = `alert-${disruption.id}-${context.userId || 'broadcast'}`;
    const modeName = String(disruption.affectedMode || 'transit').toUpperCase();
    const areaName = sanitizeAlertArea(disruption.affectedArea || 'Mumbai Area');

    // Build default commuter guidance from disruption severity & delay
    const delayMins = Number(disruption.estimatedDelayMinutes || 0);
    const actionType = disruption.status === 'resolved'
      ? 'MONITOR_STATUS'
      : delayMins >= 15
        ? 'DEPART_EARLIER'
        : disruption.type === 'cancellation' || disruption.type === 'service_suspension'
          ? 'SWITCH_MODE'
          : 'MONITOR_STATUS';

    const actionSummary = disruption.status === 'resolved'
      ? 'Disruption resolved. Normal operations resuming.'
      : delayMins > 0
        ? `Allow ~${delayMins} min extra commute time.`
        : `Monitor ${disruption.affectedMode} updates before departure.`;

    const relevanceReason = context.relevanceReason
      || (context.matchedRouteLeg
        ? `Directly impacts your planned ${disruption.affectedMode} leg near ${areaName}.`
        : `Active disruption on ${modeName} in ${areaName} along Mumbai transit corridors.`);

    const isExpired = disruption.endTime ? now >= disruption.endTime : false;
    const status = isExpired ? 'expired' : (disruption.status === 'resolved' ? 'resolved' : 'active');

    return new CommuteDisruptionAlert({
      id: alertId,
      userId: context.userId || null,
      disruptionId: disruption.id,
      disruptionType: disruption.type || 'delay',
      severity: disruption.severity || 'moderate',
      scope: {
        serviceId: disruption.affectedRouteId || null,
        serviceName: disruption.affectedRouteId || null,
        mode: disruption.affectedMode,
        lineOrRoute: disruption.affectedRouteId || null,
        segment: context.segment || null,
        area: areaName,
        stops: context.stops || []
      },
      validFrom: Number(disruption.startTime || now),
      validUntil: Number(disruption.endTime || (now + 3600000)),
      status,
      provenance: disruption.provenance ? disruption.provenance.toJSON() : undefined,
      title: `[${modeName} Alert] ${disruption.type.replace(/_/g, ' ')} near ${areaName}`,
      message: disruption.description || `Disruption reported on ${disruption.affectedMode} near ${areaName}.`,
      relevanceReason,
      recommendedAction: {
        actionType,
        summary: actionSummary,
        suggestedDepartureAdjustmentMinutes: delayMins,
        suggestedAlternativeMode: context.suggestedAlternativeMode || null,
        suggestedCorridor: context.suggestedCorridor || null,
        guidance: `Reported impact: ${disruption.severity}. Delay: ~${delayMins} min.`
      },
      affectedContext: context.affectedContext ? {
        userId: context.userId || null,
        routeId: context.affectedContext.routeId || null,
        journeyId: context.affectedContext.journeyId || null,
        originArea: sanitizeAlertArea(context.affectedContext.originArea),
        destinationArea: sanitizeAlertArea(context.affectedContext.destinationArea),
        scheduledClassId: context.affectedContext.scheduledClassId || null,
        scheduledStartTime: context.affectedContext.scheduledStartTime || null,
        matchedSegments: context.affectedContext.matchedSegments || [],
        plannedDepartureTime: context.affectedContext.plannedDepartureTime || null
      } : (context.userId ? { userId: context.userId } : null),
      isLiveFeed: false, // Default honest prototype indicator
      createdAt: Number(disruption.createdAt || now),
      updatedAt: Number(disruption.updatedAt || now)
    });
  }

  /**
   * Adapts a Notification into a CommuteDisruptionAlert instance.
   * @param {Notification|object} notif
   * @returns {CommuteDisruptionAlert}
   */
  static fromNotification(notif) {
    if (!notif) return null;

    const payload = notif.payload || {};
    if (payload.id && payload.disruptionType && payload.scope) {
      return new CommuteDisruptionAlert(payload);
    }

    // Fallback reconstruction from notification metadata
    const now = Date.now();
    const createdAt = notif.created_at ? Number(notif.created_at) : now;
    const expiresAt = notif.expires_at ? Number(notif.expires_at) : (createdAt + 3600000);
    const severity = notif.priority === 'high' ? 'severe' : notif.priority === 'low' ? 'minor' : 'moderate';

    return new CommuteDisruptionAlert({
      id: notif.related_resource_id || notif.id,
      userId: notif.user_id,
      disruptionType: 'delay',
      severity,
      scope: { area: 'Mumbai Metropolitan Region' },
      validFrom: createdAt,
      validUntil: expiresAt,
      status: now >= expiresAt ? 'expired' : 'active',
      title: notif.title,
      message: notif.message,
      relevanceReason: 'Imported from student transit notification',
      createdAt,
      updatedAt: createdAt
    });
  }

  /**
   * Adapts this alert into a standard Notification domain entity.
   * Reuses the existing Notification infrastructure with type: 'disruption'.
   *
   * @returns {Notification}
   */
  toNotification() {
    if (!this.userId) {
      throw new BadRequestError('Cannot convert a broadcast alert to a student notification without a target userId');
    }

    const priority = ALERT_SEVERITY_TO_NOTIFICATION_PRIORITY[this.severity] || 'medium';

    return new Notification({
      id: `notif-${this.id}`,
      user_id: this.userId,
      type: 'disruption',
      title: this.title,
      message: this.message,
      priority,
      read: this.status === 'dismissed',
      related_resource_type: 'commute_disruption_alert',
      related_resource_id: this.id,
      payload: this.toJSON(),
      created_at: this.createdAt,
      expires_at: this.validUntil
    });
  }

  /**
   * Checks whether the alert is currently active.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isActive(currentTime = Date.now()) {
    return this.status === 'active' && this.validFrom <= currentTime && this.validUntil > currentTime;
  }

  /**
   * Checks whether the alert is expired.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isExpired(currentTime = Date.now()) {
    return this.status === 'expired' || currentTime >= this.validUntil;
  }

  /**
   * Transitions status to 'expired' if the validity window has elapsed.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean} True if status was transitioned to expired
   */
  checkAndExpire(currentTime = Date.now()) {
    if (this.status === 'active' && currentTime >= this.validUntil) {
      this.status = 'expired';
      this.updatedAt = currentTime;
      return true;
    }
    return false;
  }

  /**
   * Dismisses the alert by the authorized user.
   * @param {object} requestingUser
   * @param {number} [timestamp=Date.now()]
   */
  dismiss(requestingUser, timestamp = Date.now()) {
    this.assertAccess(requestingUser);
    this.status = 'dismissed';
    this.dismissedAt = timestamp;
    this.updatedAt = timestamp;
    return this;
  }

  /**
   * Marks the alert as resolved.
   * @param {number} [timestamp=Date.now()]
   */
  resolve(timestamp = Date.now()) {
    this.status = 'resolved';
    this.resolvedAt = timestamp;
    this.updatedAt = timestamp;
    return this;
  }

  /**
   * Asserts that the requesting user is authorized to view or manage this alert.
   * - If userId is null (broadcast alert), access is permitted for any authenticated student.
   * - If userId is specified, only the matching student or an admin may access.
   *
   * @param {object} requestingUser
   * @returns {boolean}
   */
  assertAccess(requestingUser) {
    if (!requestingUser) {
      throw new UnauthorizedError('Authentication required to access personalized commute disruption alerts');
    }

    // Broadcast alerts are accessible to all authenticated users
    if (!this.userId) {
      return true;
    }

    if (requestingUser.role === 'admin' || requestingUser.id === this.userId) {
      return true;
    }

    throw new ForbiddenError(
      'Access forbidden: you do not have permission to view or manage another student\'s disruption alert'
    );
  }

  /**
   * Checks whether the alert affects a given transport mode.
   * @param {string} mode
   * @returns {boolean}
   */
  affectsMode(mode) {
    if (!mode || !this.scope.mode) return false;
    return String(this.scope.mode).toLowerCase() === String(mode).toLowerCase();
  }

  /**
   * Checks whether the alert affects a given coarse area.
   * @param {string} area
   * @returns {boolean}
   */
  affectsArea(area) {
    if (!area || !this.scope.area) return false;
    const a1 = this.scope.area.toLowerCase();
    const a2 = area.toLowerCase();
    return a1.includes(a2) || a2.includes(a1);
  }

  /**
   * Checks whether this alert intersects a route or list of route legs.
   * @param {object|Array} routeOrLegs
   * @returns {boolean}
   */
  affectsRoute(routeOrLegs) {
    if (!routeOrLegs) return false;

    const legs = Array.isArray(routeOrLegs)
      ? routeOrLegs
      : (routeOrLegs.legs || routeOrLegs.segments || []);

    if (legs.length === 0) {
      // Check origin/destination if available
      const origin = routeOrLegs.originArea || routeOrLegs.startingArea;
      const dest = routeOrLegs.destinationArea || routeOrLegs.collegeDestination;
      return Boolean(
        (origin && this.affectsArea(origin)) ||
        (dest && this.affectsArea(dest))
      );
    }

    return legs.some(leg => {
      const modeMatch = leg.mode ? this.affectsMode(leg.mode) : false;
      const lineMatch = (leg.lineName && this.scope.lineOrRoute)
        ? leg.lineName.toLowerCase().includes(this.scope.lineOrRoute.toLowerCase())
        : false;
      const areaMatch = (leg.fromStop && this.affectsArea(leg.fromStop))
        || (leg.toStop && this.affectsArea(leg.toStop));

      return (modeMatch && (lineMatch || areaMatch)) || (lineMatch) || (areaMatch);
    });
  }

  /**
   * Serializes the alert to a clean JSON object.
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      disruptionId: this.disruptionId,
      disruptionType: this.disruptionType,
      severity: this.severity,
      scope: {
        serviceId: this.scope.serviceId,
        serviceName: this.scope.serviceName,
        mode: this.scope.mode,
        lineOrRoute: this.scope.lineOrRoute,
        segment: this.scope.segment,
        area: this.scope.area,
        stops: [...this.scope.stops]
      },
      validFrom: this.validFrom,
      validUntil: this.validUntil,
      status: this.status,
      provenance: this.provenance.toJSON(),
      title: this.title,
      message: this.message,
      relevanceReason: this.relevanceReason,
      recommendedAction: this.recommendedAction ? {
        actionType: this.recommendedAction.actionType,
        summary: this.recommendedAction.summary,
        suggestedDepartureAdjustmentMinutes: this.recommendedAction.suggestedDepartureAdjustmentMinutes,
        suggestedAlternativeMode: this.recommendedAction.suggestedAlternativeMode,
        suggestedCorridor: this.recommendedAction.suggestedCorridor,
        guidance: this.recommendedAction.guidance
      } : null,
      alternativeRoute: this.alternativeRoute ? {
        routeId: this.alternativeRoute.routeId,
        name: this.alternativeRoute.name,
        primaryMode: this.alternativeRoute.primaryMode,
        totalDurationMinutes: this.alternativeRoute.totalDurationMinutes,
        estimatedArrivalTime: this.alternativeRoute.estimatedArrivalTime,
        summary: this.alternativeRoute.summary,
        isFeasible: this.alternativeRoute.isFeasible !== false
      } : null,
      affectedContext: this.affectedContext ? {
        userId: this.affectedContext.userId,
        routeId: this.affectedContext.routeId,
        journeyId: this.affectedContext.journeyId,
        originArea: this.affectedContext.originArea,
        destinationArea: this.affectedContext.destinationArea,
        scheduledClassId: this.affectedContext.scheduledClassId,
        scheduledStartTime: this.affectedContext.scheduledStartTime,
        matchedSegments: [...(this.affectedContext.matchedSegments || [])],
        plannedDepartureTime: this.affectedContext.plannedDepartureTime
      } : null,
      isLiveFeed: this.isLiveFeed,
      dismissedAt: this.dismissedAt,
      resolvedAt: this.resolvedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ALERT_STATUSES,
  alertStatusEnum,
  ALERT_ACTION_TYPES,
  alertActionTypeEnum,
  ALERT_SEVERITY_TO_NOTIFICATION_PRIORITY,
  FORBIDDEN_ALERT_PRIVACY_FIELDS,
  alertTransportScopeSchema,
  alertRecommendedActionSchema,
  affectedCommuteContextSchema,
  commuteDisruptionAlertSchema,
  CommuteDisruptionAlert,
  findForbiddenAlertPrivacyFields,
  assertCoarseLocationPrivacy,
  sanitizeAlertArea
};
