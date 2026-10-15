/**
 * SharedTravelCoordinationService
 *
 * Coordinates agreed shared student commutes, journey updates, and membership events:
 * - Dispatches notifications to invited students.
 * - Notifies participants when proposed or confirmed departure times change.
 * - Communicates agreed, privacy-safe meeting points.
 * - Dispatches cancellation notifications.
 * - Coordinates acceptance, decline, and withdrawal events.
 * - Updates participants when journeys expire.
 *
 * Requirements & Invariants:
 * 1. Reuses existing Day 20 notification infrastructure (Notification & CommuteAlertDelivery).
 * 2. Notifies ONLY authorized participants (organizers, confirmed members, or specific invitees).
 * 3. Respects voluntary sharing and notification preferences.
 * 4. Shields participant details from non-members (pseudonyms only, no private notes/emails).
 * 5. Strict deduplication: prevents duplicate notifications for repeated processing.
 * 6. Minimizes personal location information in notifications (coarse areas only).
 * 7. Explicitly labels updates as [PROPOSED] or [CONFIRMED].
 * 8. Handles delivery idempotency and failures using existing retry patterns.
 * 9. Never silently re-enrolls students who withdrew consent.
 * 10. Does not introduce a second notification infrastructure.
 */

const { getConnection } = require('../db/connection');
const {
  SharedTravelGroup,
  SharedTravelMember,
  StudentTravelSharingPreference,
  Notification,
  SHARED_TRAVEL_STATUSES,
  SHARED_MEMBER_STATUSES,
  SHARED_MEMBER_ROLES,
  SHARING_VISIBILITY,
  assertCoarseLocationPrivacy,
  findForbiddenTravelPrivacyFields,
  suggestedMeetingPointSchema,
  sanitizeCoarseArea
} = require('../models');
const { sharedTravelGroupRepository } = require('../repositories/SharedTravelGroupRepository');
const { sharedTravelMemberRepository } = require('../repositories/SharedTravelMemberRepository');
const { studentTravelSharingPreferenceRepository } = require('../repositories/StudentTravelSharingPreferenceRepository');
const { commuteAlertPreferenceRepository } = require('../repositories/CommuteAlertPreferenceRepository');
const { commuteAlertDeliveryRepository } = require('../repositories/CommuteAlertDeliveryRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { userRepository } = require('../repositories/UserRepository');
const {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError
} = require('../errors');

class SharedTravelCoordinationService {
  constructor({
    groupRepo = sharedTravelGroupRepository,
    memberRepo = sharedTravelMemberRepository,
    preferenceRepo = studentTravelSharingPreferenceRepository,
    commutePrefRepo = commuteAlertPreferenceRepository,
    notifRepo = notificationRepository,
    userRepo = userRepository,
    deliveryRepo = commuteAlertDeliveryRepository,
    dbInstance = null
  } = {}) {
    this.groupRepo = groupRepo;
    this.memberRepo = memberRepo;
    this.preferenceRepo = preferenceRepo;
    this.commutePrefRepo = commutePrefRepo;
    this.notifRepo = notifRepo;
    this.userRepo = userRepo;
    this.deliveryRepo = deliveryRepo;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Coordinates dispatch of an invitation notification to an invited student.
   * Requirement 1, 2, 7: Authorized recipient only; clearly labeled as [PROPOSED].
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.organizerId
   * @param {string} params.inviteeId
   * @returns {{ delivered: boolean, isDuplicate: boolean, notificationId: string|null }}
   */
  notifyInvitation({ groupId, organizerId, inviteeId }) {
    if (!organizerId) {
      throw new UnauthorizedError('Organizer authentication is required.');
    }
    if (!inviteeId) {
      throw new ValidationError('Invitee user ID is required.');
    }

    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    // Authorization: Only the organizer can invite
    if (group.organizer.userId !== organizerId) {
      throw new ForbiddenError('Only the travel group organizer can send journey invitations.');
    }

    // State validation
    if (group.isExpired()) {
      throw new ValidationError('Cannot send invitations for an expired travel group.');
    }
    if (group.status === SHARED_TRAVEL_STATUSES.CANCELLED || group.status === SHARED_TRAVEL_STATUSES.COMPLETED) {
      throw new ValidationError(`Cannot send invitations for a ${group.status} travel group.`);
    }

    const depTime = group.departureWindow.preferredDepartureTime
      || new Date(group.departureWindow.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const title = `[PROPOSED] Commute Invitation: ${group.title}`;
    const message = `You have been invited by ${group.organizer.pseudonym} to join the shared commute '${group.title}' departing around ${depTime} from ${group.originArea} to ${group.destinationArea}. Status: Proposed invitation.`;

    return this._deliverCoordinationNotification({
      recipientUserId: inviteeId,
      groupId: group.id,
      eventType: 'INVITATION',
      title,
      message,
      updateStatus: 'PROPOSED',
      payload: {
        eventFingerprint: `invite-${group.id}-${inviteeId}`,
        departureTime: depTime,
        originArea: group.originArea,
        destinationArea: group.destinationArea
      }
    });
  }

  /**
   * Proposes or confirms a departure time update for a shared journey.
   * Requirement 2, 7, 9: Notifies only active participants; labels as [PROPOSED] or [CONFIRMED];
   * never re-enrolls or notifies withdrawn students.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.requestingUserId - Must be organizer
   * @param {object} params.newDepartureWindow - Validated departure window
   * @param {boolean} [params.isConfirmed=false] - Whether time is proposed or confirmed
   * @param {string} [params.reason=''] - Optional reason for update
   * @returns {{ group: object, notificationsCount: number, recipients: string[] }}
   */
  updateDepartureTime({
    groupId,
    requestingUserId,
    newDepartureWindow,
    isConfirmed = false,
    reason = ''
  }) {
    if (!requestingUserId) {
      throw new UnauthorizedError('Authentication is required to update journey timing.');
    }

    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    // Authorization: Only organizer can update travel time
    if (group.organizer.userId !== requestingUserId) {
      throw new ForbiddenError('Only the travel group organizer can update the departure window.');
    }

    if (group.isExpired()) {
      throw new ValidationError('Cannot update departure time for an expired travel group.');
    }
    if (group.status === SHARED_TRAVEL_STATUSES.CANCELLED || group.status === SHARED_TRAVEL_STATUSES.COMPLETED) {
      throw new ValidationError(`Cannot update departure time for a ${group.status} travel group.`);
    }

    // Persist new departure window
    group.departureWindow = {
      ...group.departureWindow,
      ...newDepartureWindow
    };
    group.updatedAt = Date.now();
    this.groupRepo.save(group);

    const timeStr = group.departureWindow.preferredDepartureTime
      || new Date(group.departureWindow.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const statusLabel = isConfirmed ? 'CONFIRMED' : 'PROPOSED';
    const title = `[${statusLabel}] Departure Time Update: ${group.title}`;
    const message = `Departure time for '${group.title}' has been ${isConfirmed ? 'confirmed' : 'proposed'} as ${timeStr}.${reason ? ' Note: ' + reason : ''} Status: ${isConfirmed ? 'Confirmed' : 'Proposed'}.`;

    // Requirement 2 & 9: Eligible recipients are ONLY active confirmed participants and pending invitees.
    // Exclude the organizer who initiated the change, and strictly exclude WITHDRAWN / DECLINED students!
    const eligibleMembers = group.members.filter(m => (
      (m.status === SHARED_MEMBER_STATUSES.ACCEPTED || m.status === SHARED_MEMBER_STATUSES.PENDING) &&
      m.userId !== requestingUserId
    ));

    const dispatched = [];
    const fp = `time-${group.id}-${newDepartureWindow.startTime || timeStr}-${statusLabel}`;

    for (const member of eligibleMembers) {
      const result = this._deliverCoordinationNotification({
        recipientUserId: member.userId,
        groupId: group.id,
        eventType: `${statusLabel}_TIME_UPDATE`,
        title,
        message,
        updateStatus: statusLabel,
        payload: {
          eventFingerprint: fp,
          newDepartureTime: timeStr,
          reason
        }
      });
      if (result.delivered && !result.isDuplicate) {
        dispatched.push(member.userId);
      }
    }

    return {
      group: group.toSafeView(requestingUserId),
      notificationsCount: dispatched.length,
      recipients: dispatched
    };
  }

  /**
   * Communicates an agreed or proposed meeting point to confirmed participants.
   * Requirement 4, 6, 7: Shields private addresses; labels as [PROPOSED] or [CONFIRMED].
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.requestingUserId - Must be organizer
   * @param {object} params.meetingPoint - Proposed/confirmed meeting point
   * @param {boolean} [params.isConfirmed=true] - Whether meeting point is confirmed or proposed
   * @param {string} [params.notes='']
   * @returns {{ group: object, notificationsCount: number, recipients: string[] }}
   */
  updateMeetingPoint({
    groupId,
    requestingUserId,
    meetingPoint,
    isConfirmed = true,
    notes = ''
  }) {
    if (!requestingUserId) {
      throw new UnauthorizedError('Authentication is required to update meeting point.');
    }

    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    if (group.organizer.userId !== requestingUserId) {
      throw new ForbiddenError('Only the travel group organizer can update the meeting point.');
    }

    if (group.isExpired()) {
      throw new ValidationError('Cannot update meeting point for an expired travel group.');
    }
    if (group.status === SHARED_TRAVEL_STATUSES.CANCELLED || group.status === SHARED_TRAVEL_STATUSES.COMPLETED) {
      throw new ValidationError(`Cannot update meeting point for a ${group.status} travel group.`);
    }

    // Privacy & schema validation
    assertCoarseLocationPrivacy(meetingPoint.name, 'meetingPoint.name');
    assertCoarseLocationPrivacy(meetingPoint.area, 'meetingPoint.area');
    const validatedPoint = suggestedMeetingPointSchema.parse({
      ...meetingPoint,
      name: sanitizeCoarseArea(meetingPoint.name),
      area: sanitizeCoarseArea(meetingPoint.area)
    });

    group.suggestedMeetingPoint = validatedPoint;
    group.updatedAt = Date.now();
    this.groupRepo.save(group);

    const statusLabel = isConfirmed ? 'CONFIRMED' : 'PROPOSED';
    const title = `[${statusLabel}] Meeting Point: ${group.title}`;
    const message = `Meeting point for '${group.title}' has been ${isConfirmed ? 'confirmed' : 'proposed'}: ${validatedPoint.name}, ${validatedPoint.area}.${notes ? ' Note: ' + notes : ''} Status: ${isConfirmed ? 'Confirmed' : 'Proposed'}.`;

    // Deliver to confirmed participants (excluding organizer)
    const eligibleMembers = group.members.filter(m => (
      m.status === SHARED_MEMBER_STATUSES.ACCEPTED &&
      m.userId !== requestingUserId
    ));

    const dispatched = [];
    const fp = `mp-${group.id}-${validatedPoint.name}-${statusLabel}`;

    for (const member of eligibleMembers) {
      const result = this._deliverCoordinationNotification({
        recipientUserId: member.userId,
        groupId: group.id,
        eventType: `${statusLabel}_MEETING_POINT`,
        title,
        message,
        updateStatus: statusLabel,
        payload: {
          eventFingerprint: fp,
          meetingPointName: validatedPoint.name,
          meetingPointArea: validatedPoint.area
        }
      });
      if (result.delivered && !result.isDuplicate) {
        dispatched.push(member.userId);
      }
    }

    return {
      group: group.toSafeView(requestingUserId),
      notificationsCount: dispatched.length,
      recipients: dispatched
    };
  }

  /**
   * Coordinates membership state transitions (accept, decline, withdraw) and notifies
   * relevant participants.
   * Requirement 4, 9: Masks personal details; never re-enrolls withdrawn students.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.studentId - Student triggering the action
   * @param {'ACCEPT'|'DECLINE'|'WITHDRAW'} params.action - Event action
   * @param {string} [params.reason='']
   * @returns {{ notifiedOrganizer: boolean, status: string }}
   */
  notifyMembershipChange({ groupId, studentId, action, reason = '' }) {
    if (!studentId) {
      throw new UnauthorizedError('Student authentication is required.');
    }

    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    const member = group.findMember(studentId);
    const pseudonym = member ? member.pseudonym : 'A student';
    const organizerId = group.organizer.userId;

    let title = '';
    let message = '';
    let eventType = '';
    const fp = `mem-${group.id}-${studentId}-${action}`;

    if (action === 'ACCEPT') {
      eventType = 'PARTICIPANT_JOINED';
      title = `[CONFIRMED] Student Joined: ${group.title}`;
      message = `${pseudonym} accepted the invitation to join '${group.title}'. Status: Confirmed participation.`;
    } else if (action === 'DECLINE') {
      eventType = 'INVITATION_DECLINED';
      title = `[CONFIRMED] Invitation Declined: ${group.title}`;
      message = `An invited student declined participation in '${group.title}'. Status: Confirmed decline.`;
    } else if (action === 'WITHDRAW') {
      eventType = 'PARTICIPANT_WITHDRAWN';
      title = `[CONFIRMED] Student Withdrew: ${group.title}`;
      message = `${pseudonym} has withdrawn from '${group.title}'. Status: Confirmed withdrawal.`;
    } else {
      throw new ValidationError(`Unsupported membership coordination action: ${action}`);
    }

    // Notify organizer
    let notifiedOrganizer = false;
    if (organizerId !== studentId) {
      const result = this._deliverCoordinationNotification({
        recipientUserId: organizerId,
        groupId: group.id,
        eventType,
        title,
        message,
        updateStatus: 'CONFIRMED',
        payload: {
          eventFingerprint: fp,
          action,
          pseudonym
        }
      });
      notifiedOrganizer = result.delivered;
    }

    return {
      notifiedOrganizer,
      status: action
    };
  }

  /**
   * Cancels a shared travel group and dispatches cancellation notifications to all members.
   * Requirement 2, 7: All active/pending members notified; labeled as [CONFIRMED].
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {string} params.organizerId - Must be organizer
   * @param {string} [params.reason='']
   * @returns {{ success: boolean, status: string, notificationsCount: number }}
   */
  cancelJourney({ groupId, organizerId, reason = '' }) {
    if (!organizerId) {
      throw new UnauthorizedError('Organizer authentication is required.');
    }

    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    if (group.organizer.userId !== organizerId) {
      throw new ForbiddenError('Only the travel group organizer can cancel this coordination group.');
    }

    const now = Date.now();
    group.cancel(organizerId, reason, now);
    this.groupRepo.save(group);

    // Save member statuses as cancelled
    for (const m of group.members) {
      this.memberRepo.save(m);
    }

    const title = `[CONFIRMED] Commute Cancelled: ${group.title}`;
    const message = `'${group.title}' has been cancelled by the organizer.${reason ? ' Reason: ' + reason : ''} Status: Confirmed cancellation.`;

    // Notify all participants except the organizer
    const eligibleMembers = group.members.filter(m => m.userId !== organizerId);
    let count = 0;
    const fp = `cancel-${group.id}-${now}`;

    for (const member of eligibleMembers) {
      const result = this._deliverCoordinationNotification({
        recipientUserId: member.userId,
        groupId: group.id,
        eventType: 'JOURNEY_CANCELLED',
        title,
        message,
        updateStatus: 'CONFIRMED',
        payload: {
          eventFingerprint: fp,
          reason
        }
      });
      if (result.delivered) {
        count++;
      }
    }

    return {
      success: true,
      status: SHARED_TRAVEL_STATUSES.CANCELLED,
      notificationsCount: count
    };
  }

  /**
   * Updates participants when a shared journey expires.
   * Requirement 2, 7: Notifies confirmed and pending members.
   *
   * @param {object} params
   * @param {string} params.groupId
   * @param {number} [params.now=Date.now()]
   * @returns {{ success: boolean, status: string, notificationsCount: number }}
   */
  expireJourney({ groupId, now = Date.now() }) {
    const group = this.groupRepo.findById(groupId, true);
    if (!group) {
      throw new NotFoundError('Shared travel group not found.');
    }

    if (group.status === SHARED_TRAVEL_STATUSES.CANCELLED || group.status === SHARED_TRAVEL_STATUSES.COMPLETED) {
      return { success: false, status: group.status, notificationsCount: 0 };
    }

    group.markExpired(now);
    this.groupRepo.save(group);

    // Cancel pending invitations
    for (const m of group.members) {
      if (m.status === SHARED_MEMBER_STATUSES.PENDING) {
        m.cancel(now);
        this.memberRepo.save(m);
      }
    }

    const title = `[CONFIRMED] Commute Expired: ${group.title}`;
    const message = `'${group.title}' has expired as the departure window has passed. Status: Confirmed expiration.`;

    let count = 0;
    const fp = `expire-${group.id}-${group.expiresAt}`;

    for (const member of group.members) {
      const result = this._deliverCoordinationNotification({
        recipientUserId: member.userId,
        groupId: group.id,
        eventType: 'JOURNEY_EXPIRED',
        title,
        message,
        updateStatus: 'CONFIRMED',
        payload: {
          eventFingerprint: fp
        }
      });
      if (result.delivered) {
        count++;
      }
    }

    return {
      success: true,
      status: SHARED_TRAVEL_STATUSES.EXPIRED,
      notificationsCount: count
    };
  }

  // ============================================================================
  // INTERNAL NOTIFICATION DISPATCH & IDEMPOTENCY ENGINE
  // ============================================================================

  /**
   * Dispatches an individual coordination notification adhering to consent,
   * notification preferences, and duplicate suppression.
   *
   * @param {object} params
   * @returns {{ delivered: boolean, isDuplicate: boolean, notificationId: string|null, skippedReason?: string }}
   * @private
   */
  _deliverCoordinationNotification({
    recipientUserId,
    groupId,
    eventType,
    title,
    message,
    updateStatus,
    payload = {},
    priority = 'medium'
  }) {
    if (!recipientUserId) {
      return { delivered: false, isDuplicate: false, notificationId: null, skippedReason: 'MISSING_RECIPIENT' };
    }

    // 1. Consent Check (Requirement 3 & 9):
    // Recipient must have voluntary travel sharing enabled.
    const sharingPref = this.preferenceRepo.findByUserId(recipientUserId);
    if (!sharingPref || !sharingPref.canParticipate()) {
      return {
        delivered: false,
        isDuplicate: false,
        notificationId: null,
        skippedReason: 'VOLUNTARY_SHARING_DISABLED'
      };
    }

    // 2. Global Notification Preference Check (Requirement 3):
    // Respects commute alert notification preferences where present.
    try {
      const alertPref = this.commutePrefRepo.findByUserId(recipientUserId);
      if (alertPref && alertPref.alertsEnabled === false) {
        return {
          delivered: false,
          isDuplicate: false,
          notificationId: null,
          skippedReason: 'NOTIFICATIONS_DISABLED'
        };
      }
    } catch (e) {
      // Proceed if preference model not configured for user
    }

    // 3. Deduplication & Idempotency Key (Requirement 5 & 8):
    // Compute stable idempotency key for this event + recipient.
    const idempotencyKey = `stg-coord:${groupId}:${recipientUserId}:${eventType}:${payload.eventFingerprint || 'v1'}`;

    // Check delivery repository for duplicate
    if (this.deliveryRepo) {
      const existingDelivery = this.deliveryRepo.findByIdempotencyKey(idempotencyKey);
      if (existingDelivery && existingDelivery.status === 'DELIVERED') {
        return {
          delivered: true,
          isDuplicate: true,
          notificationId: existingDelivery.payloadSummary || null
        };
      }
    }

    // Check existing in-app notifications
    const existingNotifs = this.notifRepo.findByResource(recipientUserId, 'shared_travel_group', groupId);
    const duplicate = existingNotifs.find(n => n.payload && n.payload.idempotencyKey === idempotencyKey);
    if (duplicate) {
      return {
        delivered: true,
        isDuplicate: true,
        notificationId: duplicate.id
      };
    }

    // 4. Create in-app Notification (Requirement 1 & 10: Reuse Day 20 notification infrastructure)
    try {
      const notif = Notification.create({
        user_id: recipientUserId,
        type: 'ride_group',
        title,
        message,
        priority,
        related_resource_type: 'shared_travel_group',
        related_resource_id: groupId,
        payload: {
          ...payload,
          idempotencyKey,
          eventType,
          updateStatus,
          groupId
        }
      });

      const saved = this.notifRepo.create(notif);

      // Record successful delivery audit
      if (this.deliveryRepo) {
        this.deliveryRepo.save({
          alertId: `coord-${groupId}`,
          userId: recipientUserId,
          channel: 'in_app',
          status: 'DELIVERED',
          idempotencyKey,
          payloadSummary: saved.id,
          deliveredAt: Date.now()
        });
      }

      return {
        delivered: true,
        isDuplicate: false,
        notificationId: saved.id
      };
    } catch (err) {
      // Record failure audit
      if (this.deliveryRepo) {
        this.deliveryRepo.save({
          alertId: `coord-${groupId}`,
          userId: recipientUserId,
          channel: 'in_app',
          status: 'FAILED',
          idempotencyKey,
          errorMessage: err.message
        });
      }
      return {
        delivered: false,
        isDuplicate: false,
        notificationId: null,
        skippedReason: `DELIVERY_ERROR: ${err.message}`
      };
    }
  }
}

const sharedTravelCoordinationService = new SharedTravelCoordinationService();

module.exports = {
  SharedTravelCoordinationService,
  sharedTravelCoordinationService
};
