/**
 * SharedTravelMatchingService
 *
 * Domain matching service that identifies potentially compatible shared travel
 * coordination opportunities using ONLY information students have explicitly
 * consented to share.
 *
 * Requirements & Privacy Invariants:
 * 1. Privacy-by-design: Coarse area names only; strictly rejects precise residential addresses.
 * 2. Anti-tracking: Rejects GPS decimal coordinates, device IDs, breadcrumbs, and live telemetry.
 * 3. Information shielding: Never exposes private student preferences, schedules, or identities to unrelated users.
 * 4. Hard incompatibility gates: Never matches students solely based on geographic proximity if timings or destinations are incompatible.
 * 5. Respects consent, visibility, membership status, and expiration.
 * 6. Information minimization: Returns only the minimum information needed to evaluate a match.
 * 7. Privacy-safe explanations: Explains matching reasons without exposing another student's private data.
 * 8. Honest data handling: Treats incomplete or estimated route data honestly.
 * 9. Explicit proximity disclaimer: Avoids false claims of live physical proximity based on static preferences.
 * 10. Guaranteed deduplication: Suppresses duplicate matches.
 */

const { getConnection } = require('../db/connection');
const {
  SharedTravelGroup,
  SharedTravelMember,
  StudentTravelSharingPreference,
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARING_VISIBILITY,
  COMPATIBILITY_TIERS,
  MATCH_REJECTION_REASONS,
  findForbiddenTravelPrivacyFields,
  assertCoarseLocationPrivacy,
  sanitizeCoarseArea,
  TRANSPORT_MODES
} = require('../models');
const { sharedTravelGroupRepository } = require('../repositories/SharedTravelGroupRepository');
const { sharedTravelMemberRepository } = require('../repositories/SharedTravelMemberRepository');
const { studentTravelSharingPreferenceRepository } = require('../repositories/StudentTravelSharingPreferenceRepository');
const { userRepository } = require('../repositories/UserRepository');
const {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError
} = require('../errors');

// ============================================================================
// TRANSIT CORRIDORS & CAMPUS CLUSTERS (COARSE MAPPING)
// ============================================================================

/**
 * Coarse transit corridors across Mumbai Metropolitan Region.
 */
const MUMBAI_TRANSIT_CORRIDORS = Object.freeze({
  WESTERN_RAILWAY: [
    'virar', 'nallasopara', 'vasai', 'vasai road', 'naigaon', 'bhayandar', 'mira road', 'dahisar',
    'borivali', 'borivali west', 'borivali east', 'kandivali', 'kandivali west', 'kandivali east',
    'malad', 'malad west', 'malad east', 'goregaon', 'goregaon west', 'goregaon east',
    'ram mandir', 'jogeshwari', 'jogeshwari west', 'jogeshwari east',
    'andheri', 'andheri west', 'andheri east',
    'vile parle', 'vile parle west', 'vile parle east',
    'santacruz', 'santacruz west', 'santacruz east',
    'khar', 'khar road', 'khar west', 'khar east',
    'bandra', 'bandra west', 'bandra east',
    'mahim', 'matunga road', 'dadar', 'prabhadevi', 'lower parel', 'mahalaxmi',
    'mumbai central', 'grant road', 'charni road', 'marine lines', 'churchgate'
  ],
  CENTRAL_RAILWAY: [
    'kalyan', 'thakurli', 'dombivli', 'kopar', 'diva', 'mumbra', 'kalwa', 'thane',
    'mulund', 'nahur', 'bhandup', 'kanjurmarg', 'vikhroli', 'ghatkopar', 'vidyavihar',
    'kurla', 'sion', 'matunga', 'dadar', 'parel', 'currey road', 'chinchpokli', 'byculla',
    'sandhurst road', 'masjid', 'csmt'
  ],
  HARBOUR_LINE: [
    'panvel', 'khandeshwar', 'mansarovar', 'kharghar', 'belapur', 'seawoods', 'nerul',
    'juinagar', 'sanpada', 'vashi', 'mankhurd', 'govandi', 'chembur', 'tilak nagar',
    'kurla', 'chunabhatti', 'gtb nagar', 'wadala road', 'sewri', 'cotton green',
    'reay road', 'dockyard road', 'sandhurst road', 'masjid', 'csmt'
  ],
  METRO_LINE_1: [
    'versova', 'd.n. nagar', 'dn nagar', 'azad nagar', 'andheri', 'western express highway',
    'weh', 'chakala', 'airport road', 'marol naka', 'saki naka', 'asalpha', 'jagruti nagar', 'ghatkopar'
  ]
});

/**
 * Coarse education campus clusters for destination proximity matching.
 */
const CAMPUS_CLUSTERS = Object.freeze({
  VILE_PARLE: [
    'dj sanghvi', 'djsce', 'dwarkadas j. sanghvi', 'vile parle', 'vile parle west',
    'svkm', 'nmims', 'mithibai', 'juhu'
  ],
  ANDHERI: [
    'spit', 'spce', 'bhavan', 'bhavans', 'andheri west', 'munshi nagar'
  ],
  MATUNGA: [
    'vjti', 'ict', 'ruia', 'podar', 'matunga', 'wadala'
  ],
  POWAI: [
    'iit', 'iit bombay', 'powai', 'kanjurmarg'
  ]
});

const PROXIMITY_DISCLAIMER = Object.freeze(
  'Compatibility is estimated from student-provided commute preferences and coarse areas; live physical proximity is not tracked.'
);

class SharedTravelMatchingService {
  constructor({
    groupRepo = sharedTravelGroupRepository,
    memberRepo = sharedTravelMemberRepository,
    preferenceRepo = studentTravelSharingPreferenceRepository,
    userRepo = userRepository,
    dbInstance = null
  } = {}) {
    this.groupRepo = groupRepo;
    this.memberRepo = memberRepo;
    this.preferenceRepo = preferenceRepo;
    this.userRepo = userRepo;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Identifies potentially compatible shared travel opportunities for a student
   * using ONLY consented information and privacy-safe coarse abstractions.
   *
   * @param {object} params
   * @param {string} params.studentId - Authenticated student ID
   * @param {object} [params.searchCriteria={}] - Search criteria (origin, dest, departure window, modes)
   * @param {object} [params.options={}] - Query options (limit, minScore, currentTime)
   * @returns {{ matches: object[], totalMatches: number, evaluatedCriteria: object, proximityDisclaimer: string }}
   */
  findCompatibleJourneys({ studentId, searchCriteria = {}, options = {} }) {
    if (!studentId) {
      throw new UnauthorizedError('Student authentication is required to search for shared travel opportunities.');
    }

    // 1. Consent verification: Student MUST have voluntary sharing enabled
    const studentPref = this.preferenceRepo.findByUserId(studentId);
    if (!studentPref || !studentPref.canParticipate()) {
      throw new ForbiddenError(
        'Sharing is disabled until student explicitly opts in to voluntary travel coordination.'
      );
    }

    // 2. Anti-tracking and privacy safeguards on searchCriteria
    const forbiddenFields = findForbiddenTravelPrivacyFields(searchCriteria);
    if (forbiddenFields.length > 0) {
      throw new ValidationError(
        `Privacy violation: search criteria contains forbidden tracking fields: ${forbiddenFields.join(', ')}`
      );
    }

    if (searchCriteria.originArea) {
      assertCoarseLocationPrivacy(searchCriteria.originArea, 'originArea');
    }
    if (searchCriteria.destinationArea) {
      assertCoarseLocationPrivacy(searchCriteria.destinationArea, 'destinationArea');
    }

    const currentTime = Number(options.currentTime || Date.now());

    // 3. Resolve effective search parameters (falling back safely to student preferences)
    let effectiveOrigin = null;
    if (searchCriteria.originArea) {
      effectiveOrigin = sanitizeCoarseArea(searchCriteria.originArea);
    } else if (searchCriteria.originArea === undefined && studentPref.homeAreaCoarse) {
      effectiveOrigin = sanitizeCoarseArea(studentPref.homeAreaCoarse);
    }

    let effectiveDestination = 'DJ Sanghvi College of Engineering';
    if (searchCriteria.destinationArea) {
      effectiveDestination = sanitizeCoarseArea(searchCriteria.destinationArea);
    } else if (studentPref.defaultCampus) {
      effectiveDestination = sanitizeCoarseArea(studentPref.defaultCampus);
    }

    const allowedModes = Array.isArray(searchCriteria.allowedModes) && searchCriteria.allowedModes.length > 0
      ? searchCriteria.allowedModes
      : studentPref.allowedModes;

    const preferredModes = Array.isArray(searchCriteria.preferredModes)
      ? searchCriteria.preferredModes
      : (searchCriteria.transportMode ? [searchCriteria.transportMode] : []);

    const effectiveCriteria = {
      originArea: effectiveOrigin,
      destinationArea: effectiveDestination,
      departureWindow: searchCriteria.departureWindow || null,
      allowedModes,
      preferredModes,
      maxGroupSize: searchCriteria.maxGroupSize || studentPref.maxGroupSizePreference || 4
    };

    // 4. Retrieve candidate active groups from repository (with members loaded for capacity check)
    const candidateGroups = this.groupRepo.findActive({
      currentTime,
      includeMembers: true,
      limit: options.queryLimit || 100
    });

    // 5. Evaluate and deduplicate matches
    const matches = [];
    const seenGroupIds = new Set();
    const minScore = Number(options.minScore || 40);

    for (const group of candidateGroups) {
      // Requirement 10: Suppress duplicate matches
      if (seenGroupIds.has(group.id)) {
        continue;
      }
      seenGroupIds.add(group.id);

      // Requirement 5: Respect expiration
      if (group.isExpired(currentTime)) {
        continue;
      }

      // Must be in open status
      if (group.status !== SHARED_TRAVEL_STATUSES.OPEN) {
        continue;
      }

      // Group capacity check
      if (group.isFull()) {
        continue;
      }

      // Requirement 5: Respect group visibility (invite_only groups strictly excluded from open matching)
      if (group.visibility === SHARING_VISIBILITY.INVITE_ONLY) {
        continue;
      }

      // Exclude self-organized journeys
      if (group.organizer.userId === studentId) {
        continue;
      }

      // Exclude groups where student is already an active member
      if (group.isMember(studentId)) {
        continue;
      }

      // Exclude groups where student already has a pending invitation or join request
      const existingMembership = this.memberRepo.findByGroupAndUser(group.id, studentId);
      if (existingMembership && (
        existingMembership.status === SHARED_MEMBER_STATUSES.PENDING ||
        existingMembership.status === SHARED_MEMBER_STATUSES.ACCEPTED
      )) {
        continue;
      }

      // Evaluate journey compatibility
      const compatibility = this.evaluateJourneyCompatibility({
        studentCriteria: effectiveCriteria,
        group,
        options: { currentTime, minScore }
      });

      if (compatibility.isCompatible && compatibility.compatibilityScore >= minScore) {
        // Requirement 6: Return only the minimum information needed to evaluate a match
        matches.push({
          groupId: group.id,
          title: group.title,
          compatibilityScore: compatibility.compatibilityScore,
          compatibilityTier: compatibility.compatibilityTier,
          coarseOriginArea: group.originArea,
          coarseDestinationArea: group.destinationArea,
          departureWindowSummary: {
            startTime: group.departureWindow.startTime,
            endTime: group.departureWindow.endTime,
            preferredDepartureTime: group.departureWindow.preferredDepartureTime || null,
            flexMinutes: group.departureWindow.flexMinutes
          },
          transportMode: group.transportMode,
          suggestedMeetingPoint: {
            name: group.suggestedMeetingPoint.name,
            area: group.suggestedMeetingPoint.area,
            type: group.suggestedMeetingPoint.type
          },
          availableSlots: group.maxParticipants - group.getConfirmedCount(),
          totalCapacity: group.maxParticipants,
          organizerPseudonym: group.organizer.pseudonym,
          matchFactors: compatibility.matchFactors,
          matchExplanation: compatibility.matchExplanation,
          dataConfidence: compatibility.dataConfidence,
          proximityDisclaimer: PROXIMITY_DISCLAIMER
        });
      }
    }

    // Sort matches by compatibility score descending
    matches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    const limit = Math.min(50, Math.max(1, Number(options.limit) || 10));
    const slicedMatches = matches.slice(0, limit);

    return {
      matches: slicedMatches,
      totalMatches: matches.length,
      evaluatedCriteria: {
        coarseOriginArea: effectiveOrigin,
        coarseDestinationArea: effectiveDestination,
        allowedModes,
        originProvided: Boolean(effectiveOrigin),
        dataConfidence: effectiveOrigin ? 'CONFIRMED' : 'ESTIMATED'
      },
      proximityDisclaimer: PROXIMITY_DISCLAIMER
    };
  }

  /**
   * Pure evaluation method that assesses compatibility between a student's criteria
   * and a specific SharedTravelGroup.
   *
   * Enforces hard gates:
   * - Timing incompatibility -> 0 score, rejected
   * - Destination incompatibility -> 0 score, rejected
   * - Mode incompatibility -> 0 score, rejected
   *
   * @param {object} params
   * @param {object} params.studentCriteria
   * @param {SharedTravelGroup} params.group
   * @param {object} [params.options={}]
   * @returns {object}
   */
  evaluateJourneyCompatibility({ studentCriteria, group, options = {} }) {
    const currentTime = Number(options.currentTime || Date.now());

    // 1. Group lifecycle & state invariants
    if (group.isExpired(currentTime)) {
      return {
        isCompatible: false,
        compatibilityScore: 0,
        compatibilityTier: COMPATIBILITY_TIERS.INCOMPATIBLE,
        rejectionReason: MATCH_REJECTION_REASONS.GROUP_EXPIRED,
        matchExplanation: 'This shared travel group has expired.',
        dataConfidence: 'CONFIRMED'
      };
    }

    if (group.isFull()) {
      return {
        isCompatible: false,
        compatibilityScore: 0,
        compatibilityTier: COMPATIBILITY_TIERS.INCOMPATIBLE,
        rejectionReason: MATCH_REJECTION_REASONS.GROUP_FULL,
        matchExplanation: 'This shared travel group is at maximum capacity.',
        dataConfidence: 'CONFIRMED'
      };
    }

    if (group.visibility === SHARING_VISIBILITY.INVITE_ONLY) {
      return {
        isCompatible: false,
        compatibilityScore: 0,
        compatibilityTier: COMPATIBILITY_TIERS.INCOMPATIBLE,
        rejectionReason: MATCH_REJECTION_REASONS.INVITE_ONLY,
        matchExplanation: 'This journey is private and invite-only.',
        dataConfidence: 'CONFIRMED'
      };
    }

    // 2. HARD FILTER: Destination Compatibility
    // Requirement 4: Do not match students solely because their journeys are geographically
    // close if their timings or destinations are incompatible.
    const destEval = this._evaluateDestinationCompatibility(
      studentCriteria.destinationArea,
      group.destinationArea
    );

    if (!destEval.compatible) {
      return {
        isCompatible: false,
        compatibilityScore: 0,
        compatibilityTier: COMPATIBILITY_TIERS.INCOMPATIBLE,
        rejectionReason: MATCH_REJECTION_REASONS.DESTINATION_MISMATCH,
        matchExplanation: `Incompatible destinations: student destination is '${studentCriteria.destinationArea || 'unspecified'}' while group is traveling to '${group.destinationArea}'.`,
        matchFactors: {
          destinationCompatibility: 'MISMATCH',
          timingOverlap: 'UNTESTED',
          modeCompatibility: 'UNTESTED',
          originOverlap: 'UNTESTED'
        },
        dataConfidence: 'CONFIRMED'
      };
    }

    // 3. HARD FILTER: Timing & Departure Window Compatibility
    const timingEval = this._evaluateTimingCompatibility(
      studentCriteria.departureWindow,
      group.departureWindow
    );

    if (!timingEval.compatible) {
      return {
        isCompatible: false,
        compatibilityScore: 0,
        compatibilityTier: COMPATIBILITY_TIERS.INCOMPATIBLE,
        rejectionReason: MATCH_REJECTION_REASONS.TIMING_MISMATCH,
        matchExplanation: 'Incompatible travel timing: departure windows do not overlap within flexible travel boundaries.',
        matchFactors: {
          destinationCompatibility: destEval.type,
          timingOverlap: 'MISMATCH',
          modeCompatibility: 'UNTESTED',
          originOverlap: 'UNTESTED'
        },
        dataConfidence: timingEval.confidence
      };
    }

    // 4. HARD FILTER: Transport Mode Compatibility
    const modeEval = this._evaluateModeCompatibility(
      studentCriteria.allowedModes,
      group.transportMode,
      studentCriteria.preferredModes
    );

    if (!modeEval.compatible) {
      return {
        isCompatible: false,
        compatibilityScore: 0,
        compatibilityTier: COMPATIBILITY_TIERS.INCOMPATIBLE,
        rejectionReason: MATCH_REJECTION_REASONS.MODE_MISMATCH,
        matchExplanation: `Incompatible transport mode: group uses ${group.transportMode}, which is not in student's allowed travel modes.`,
        matchFactors: {
          destinationCompatibility: destEval.type,
          timingOverlap: timingEval.type,
          modeCompatibility: 'MISMATCH',
          originOverlap: 'UNTESTED'
        },
        dataConfidence: 'CONFIRMED'
      };
    }

    // 5. Origin Area & Route Overlap Evaluation
    const originEval = this._evaluateOriginCompatibility(
      studentCriteria.originArea,
      group.originArea,
      group.transportMode
    );

    // 6. Aggregate Compatibility Score
    const totalScore = Math.min(
      100,
      Math.max(0, destEval.score + timingEval.score + modeEval.score + originEval.score)
    );

    // Determine Tier
    let tier = COMPATIBILITY_TIERS.MODERATE;
    if (totalScore >= 80) {
      tier = COMPATIBILITY_TIERS.EXCELLENT;
    } else if (totalScore >= 65) {
      tier = COMPATIBILITY_TIERS.HIGH;
    } else if (totalScore < 40) {
      tier = COMPATIBILITY_TIERS.INCOMPATIBLE;
    }

    const isCompatible = totalScore >= (options.minScore || 40);

    // Requirement 8: Treat incomplete or estimated data honestly
    const dataConfidence = (originEval.confidence === 'ESTIMATED' || timingEval.confidence === 'ESTIMATED')
      ? 'ESTIMATED'
      : 'CONFIRMED';

    // Requirement 7: Explain matching reasons without exposing another student's private data
    const matchExplanation = this._buildSafeMatchExplanation({
      score: totalScore,
      tier,
      destEval,
      timingEval,
      modeEval,
      originEval,
      group
    });

    return {
      isCompatible,
      compatibilityScore: totalScore,
      compatibilityTier: tier,
      rejectionReason: isCompatible ? null : MATCH_REJECTION_REASONS.SCORE_BELOW_THRESHOLD,
      matchFactors: {
        destinationCompatibility: destEval.type,
        timingOverlap: timingEval.type,
        modeCompatibility: modeEval.type,
        originOverlap: originEval.type,
        routeOverlap: originEval.routeOverlap
      },
      matchExplanation,
      dataConfidence,
      proximityDisclaimer: PROXIMITY_DISCLAIMER
    };
  }

  // ============================================================================
  // INTERNAL EVALUATION HELPERS
  // ============================================================================

  /**
   * Evaluates destination compatibility using campus clusters and area names.
   * Hard rejects completely different colleges or localities.
   *
   * @param {string} studentDest
   * @param {string} groupDest
   * @returns {{ compatible: boolean, score: number, type: string }}
   * @private
   */
  _evaluateDestinationCompatibility(studentDest, groupDest) {
    if (!groupDest) {
      return { compatible: false, score: 0, type: 'MISSING_GROUP_DESTINATION' };
    }

    const normGroup = groupDest.toLowerCase().trim();
    const normStudent = (studentDest || 'dj sanghvi college of engineering').toLowerCase().trim();

    // 1. Exact match
    if (normStudent === normGroup) {
      return { compatible: true, score: 35, type: 'EXACT_DESTINATION' };
    }

    // 2. Identify campus cluster membership
    let studentCluster = null;
    let groupCluster = null;

    for (const [clusterKey, members] of Object.entries(CAMPUS_CLUSTERS)) {
      if (members.some(m => normStudent.includes(m))) {
        studentCluster = clusterKey;
      }
      if (members.some(m => normGroup.includes(m))) {
        groupCluster = clusterKey;
      }
    }

    // If both belong to the same cluster (e.g. Vile Parle West campus cluster)
    if (studentCluster && groupCluster && studentCluster === groupCluster) {
      return { compatible: true, score: 35, type: 'CAMPUS_CLUSTER_MATCH' };
    }

    // If both belong to DIFFERENT identified campus clusters (e.g. IIT Powai vs DJSCE Vile Parle)
    if (studentCluster && groupCluster && studentCluster !== groupCluster) {
      return { compatible: false, score: 0, type: 'DESTINATION_MISMATCH' };
    }

    // 3. Substring / Locality match (e.g., "Vile Parle" in "Vile Parle Station")
    if (normGroup.includes(normStudent) || normStudent.includes(normGroup)) {
      return { compatible: true, score: 30, type: 'LOCALITY_MATCH' };
    }

    // Fallback: destinations are unrelated localities
    return { compatible: false, score: 0, type: 'DESTINATION_MISMATCH' };
  }

  /**
   * Evaluates departure window overlap.
   * Rejects disjoint windows that exceed flexible buffer minutes.
   *
   * @param {object|null} studentWindow
   * @param {object} groupWindow
   * @returns {{ compatible: boolean, score: number, type: string, confidence: string }}
   * @private
   */
  _evaluateTimingCompatibility(studentWindow, groupWindow) {
    // If student provided no departure window, treat as estimated match with lower score
    if (!studentWindow || (!studentWindow.startTime && !studentWindow.preferredDepartureTime)) {
      return {
        compatible: true,
        score: 15,
        type: 'ESTIMATED_WINDOW',
        confidence: 'ESTIMATED'
      };
    }

    const groupFlex = Number(groupWindow.flexMinutes || 15);
    const studentFlex = Number(studentWindow.flexMinutes || 15);
    const allowedFlexMinutes = Math.max(groupFlex, studentFlex, 20);

    // Case A: Both specify epoch timestamps (startTime, endTime)
    if (studentWindow.startTime && studentWindow.endTime && groupWindow.startTime && groupWindow.endTime) {
      const overlapStart = Math.max(studentWindow.startTime, groupWindow.startTime);
      const overlapEnd = Math.min(studentWindow.endTime, groupWindow.endTime);
      const overlapDuration = overlapEnd - overlapStart;

      if (overlapDuration >= 0) {
        // Direct overlap
        return {
          compatible: true,
          score: 35,
          type: 'FULL_WINDOW_OVERLAP',
          confidence: 'CONFIRMED'
        };
      }

      // Disjoint window: calculate gap in minutes
      const gapMinutes = Math.abs(overlapDuration) / (60 * 1000);

      if (gapMinutes <= allowedFlexMinutes) {
        // Near-overlap within allowed flex minutes
        const penalty = Math.round((gapMinutes / allowedFlexMinutes) * 15);
        const score = Math.max(15, 35 - penalty);
        return {
          compatible: true,
          score,
          type: 'ADJACENT_WINDOW_OVERLAP',
          confidence: 'CONFIRMED'
        };
      }

      // Timing mismatch
      return {
        compatible: false,
        score: 0,
        type: 'TIMING_MISMATCH',
        confidence: 'CONFIRMED'
      };
    }

    // Case B: Compare preferredDepartureTime ("HH:MM")
    const studentPrefTime = studentWindow.preferredDepartureTime;
    const groupPrefTime = groupWindow.preferredDepartureTime;

    if (studentPrefTime && groupPrefTime) {
      const minA = this._parseTimeToMinutes(studentPrefTime);
      const minB = this._parseTimeToMinutes(groupPrefTime);

      if (minA !== null && minB !== null) {
        const diff = Math.abs(minA - minB);
        if (diff <= allowedFlexMinutes) {
          const penalty = Math.round((diff / allowedFlexMinutes) * 15);
          const score = Math.max(15, 35 - penalty);
          return {
            compatible: true,
            score,
            type: 'PREFERRED_TIME_OVERLAP',
            confidence: 'CONFIRMED'
          };
        }

        return {
          compatible: false,
          score: 0,
          type: 'TIMING_MISMATCH',
          confidence: 'CONFIRMED'
        };
      }
    }

    // Fallback: timestamps or format partially unparseable, treat as estimated
    return {
      compatible: true,
      score: 20,
      type: 'APPROXIMATE_WINDOW',
      confidence: 'ESTIMATED'
    };
  }

  /**
   * Evaluates transport mode compatibility.
   *
   * @param {string[]} [allowedModes=[]]
   * @param {string} groupMode
   * @param {string[]} [preferredModes=[]]
   * @returns {{ compatible: boolean, score: number, type: string }}
   * @private
   */
  _evaluateModeCompatibility(allowedModes = [], groupMode, preferredModes = []) {
    if (!groupMode) {
      return { compatible: false, score: 0, type: 'MISSING_GROUP_MODE' };
    }

    // If student specifies allowed modes, group mode MUST be allowed
    if (Array.isArray(allowedModes) && allowedModes.length > 0) {
      const isAllowed = allowedModes.some(m => m.toLowerCase() === groupMode.toLowerCase());
      if (!isAllowed) {
        return { compatible: false, score: 0, type: 'MODE_MISMATCH' };
      }
    }

    // Extra points if it is in preferred modes
    if (Array.isArray(preferredModes) && preferredModes.some(m => m.toLowerCase() === groupMode.toLowerCase())) {
      return { compatible: true, score: 10, type: 'PREFERRED_MODE_MATCH' };
    }

    return { compatible: true, score: 6, type: 'ALLOWED_MODE_MATCH' };
  }

  /**
   * Evaluates origin area similarity and transit corridor overlap.
   *
   * @param {string|null} studentOrigin
   * @param {string} groupOrigin
   * @param {string} transportMode
   * @returns {{ score: number, type: string, routeOverlap: string, confidence: string }}
   * @private
   */
  _evaluateOriginCompatibility(studentOrigin, groupOrigin, transportMode) {
    // Requirement 8: Treat missing origin area honestly
    if (!studentOrigin || studentOrigin.toLowerCase().includes('metropolitan region')) {
      return {
        score: 5,
        type: 'ESTIMATED_ORIGIN',
        routeOverlap: 'UNKNOWN',
        confidence: 'ESTIMATED'
      };
    }

    const normStudent = studentOrigin.toLowerCase().trim();
    const normGroup = (groupOrigin || '').toLowerCase().trim();

    // 1. Identical coarse area
    if (normStudent === normGroup || normGroup.includes(normStudent) || normStudent.includes(normGroup)) {
      return {
        score: 20,
        type: 'EXACT_ORIGIN_MATCH',
        routeOverlap: 'IDENTICAL_ORIGIN_AREA',
        confidence: 'CONFIRMED'
      };
    }

    // 2. Check for shared transit corridor
    for (const [corridorName, stops] of Object.entries(MUMBAI_TRANSIT_CORRIDORS)) {
      const studentOnCorridor = stops.some(s => normStudent.includes(s));
      const groupOnCorridor = stops.some(s => normGroup.includes(s));

      if (studentOnCorridor && groupOnCorridor) {
        return {
          score: 15,
          type: 'SHARED_CORRIDOR_MATCH',
          routeOverlap: `CORRIDOR_${corridorName}`,
          confidence: 'CONFIRMED'
        };
      }
    }

    // 3. Different origins, meet at destination
    return {
      score: 2,
      type: 'DIFFERENT_ORIGINS',
      routeOverlap: 'DESTINATION_MEETUP_ONLY',
      confidence: 'CONFIRMED'
    };
  }

  /**
   * Constructs privacy-safe explanation narrative for matching reasons.
   * Requirement 7: Explains matching reasons without exposing another student's private data.
   *
   * @param {object} params
   * @returns {string}
   * @private
   */
  _buildSafeMatchExplanation({ score, tier, destEval, timingEval, modeEval, originEval, group }) {
    const parts = [];

    // Timing narrative
    if (timingEval.type === 'FULL_WINDOW_OVERLAP') {
      parts.push('overlapping departure window');
    } else if (timingEval.type === 'ADJACENT_WINDOW_OVERLAP' || timingEval.type === 'PREFERRED_TIME_OVERLAP') {
      parts.push('closely aligned departure timing');
    } else {
      parts.push('compatible schedule window');
    }

    // Destination narrative
    if (destEval.type === 'CAMPUS_CLUSTER_MATCH' || destEval.type === 'EXACT_DESTINATION') {
      parts.push(`shared destination (${group.destinationArea})`);
    } else {
      parts.push(`nearby destination hub`);
    }

    // Corridor & Route narrative
    if (originEval.type === 'EXACT_ORIGIN_MATCH') {
      parts.push(`common departure area (${group.originArea})`);
    } else if (originEval.type === 'SHARED_CORRIDOR_MATCH') {
      parts.push(`shared transit corridor`);
    }

    // Mode narrative
    parts.push(`via ${group.transportMode}`);

    let explanation = `Compatible commute (${score}% match): ${parts.join(', ')}.`;

    // Note for estimated data if origin was not specified
    if (originEval.confidence === 'ESTIMATED') {
      explanation += ' Note: Specific origin area was not specified; route overlap is estimated.';
    }

    return explanation;
  }

  /**
   * Parses "HH:MM" string into minutes from midnight.
   *
   * @param {string} str
   * @returns {number|null}
   * @private
   */
  _parseTimeToMinutes(str) {
    if (!str || typeof str !== 'string') return null;
    const match = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
    return hours * 60 + mins;
  }
}

const sharedTravelMatchingService = new SharedTravelMatchingService();

module.exports = {
  SharedTravelMatchingService,
  sharedTravelMatchingService,
  MUMBAI_TRANSIT_CORRIDORS,
  CAMPUS_CLUSTERS,
  PROXIMITY_DISCLAIMER
};
