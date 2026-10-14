/**
 * CommuteAlertPreference Domain Model
 *
 * Encapsulates a student's personal commute alert delivery preferences:
 * - Alerts enabled/disabled
 * - Minimum severity threshold ('minor', 'moderate', 'severe', 'critical')
 * - Relevant disruption categories
 * - Preferred delivery channels ('in_app', 'socket', 'email', 'push')
 */

const { z } = require('zod');
const { disruptionSeverityEnum } = require('./CommuteContracts');

const SEVERITY_HIERARCHY = Object.freeze({
  minor: 1,
  moderate: 2,
  severe: 3,
  critical: 4
});

const DELIVERY_CHANNELS = Object.freeze({
  IN_APP: 'in_app',
  SOCKET: 'socket',
  EMAIL: 'email',
  PUSH: 'push'
});

const deliveryChannelEnum = z.enum(['in_app', 'socket', 'email', 'push']);

const DEFAULT_DISRUPTION_CATEGORIES = Object.freeze([
  'delay',
  'cancellation',
  'service_suspension',
  'traffic',
  'waterlogging',
  'maintenance',
  'crowding'
]);

const commuteAlertPreferenceSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  alertsEnabled: z.boolean().default(true),
  minimumSeverity: disruptionSeverityEnum.default('moderate'),
  enabledCategories: z.array(z.string().min(1))
    .default(() => [...DEFAULT_DISRUPTION_CATEGORIES]),
  preferredChannels: z.array(deliveryChannelEnum)
    .min(1, 'At least one delivery channel is required')
    .default(['in_app']),
  createdAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now())
});

class CommuteAlertPreference {
  /**
   * @param {object} data
   */
  constructor(data) {
    const validated = commuteAlertPreferenceSchema.parse(data);
    Object.assign(this, validated);
  }

  /**
   * Factory method to create default alert preferences for a student.
   *
   * @param {string} userId
   * @param {object} [overrides={}]
   * @returns {CommuteAlertPreference}
   */
  static createDefault(userId, overrides = {}) {
    const now = Date.now();
    return new CommuteAlertPreference({
      userId,
      alertsEnabled: true,
      minimumSeverity: 'moderate',
      enabledCategories: [...DEFAULT_DISRUPTION_CATEGORIES],
      preferredChannels: ['in_app'],
      createdAt: now,
      updatedAt: now,
      ...overrides
    });
  }

  /**
   * Checks whether an alert's severity meets or exceeds the student's minimum threshold.
   *
   * @param {string} severity
   * @returns {boolean}
   */
  allowsSeverity(severity) {
    if (!severity) return true;
    const alertLevel = SEVERITY_HIERARCHY[String(severity).toLowerCase()] || 2;
    const prefLevel = SEVERITY_HIERARCHY[String(this.minimumSeverity).toLowerCase()] || 2;
    return alertLevel >= prefLevel;
  }

  /**
   * Checks whether a disruption category is enabled by the student.
   *
   * @param {string} category
   * @returns {boolean}
   */
  allowsCategory(category) {
    if (!category) return true;
    const cat = String(category).toLowerCase().trim();
    return this.enabledCategories.some(c => c.toLowerCase() === cat);
  }

  /**
   * Checks whether a specific delivery channel is enabled.
   *
   * @param {string} channel
   * @returns {boolean}
   */
  allowsChannel(channel) {
    if (!channel) return false;
    return this.preferredChannels.includes(channel);
  }

  /**
   * Serializes entity to SQLite row format.
   *
   * @returns {object}
   */
  toRow() {
    return {
      user_id: this.userId,
      alerts_enabled: this.alertsEnabled ? 1 : 0,
      minimum_severity: this.minimumSeverity,
      enabled_categories: JSON.stringify(this.enabledCategories),
      preferred_channels: JSON.stringify(this.preferredChannels),
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  /**
   * Reconstitutes domain entity from SQLite row.
   *
   * @param {object} row
   * @returns {CommuteAlertPreference|null}
   */
  static fromRow(row) {
    if (!row) return null;

    let categories = [...DEFAULT_DISRUPTION_CATEGORIES];
    if (typeof row.enabled_categories === 'string') {
      try {
        const parsed = JSON.parse(row.enabled_categories);
        if (Array.isArray(parsed) && parsed.length > 0) categories = parsed;
      } catch (_) {}
    } else if (Array.isArray(row.enabled_categories)) {
      categories = row.enabled_categories;
    }

    let channels = ['in_app'];
    if (typeof row.preferred_channels === 'string') {
      try {
        const parsed = JSON.parse(row.preferred_channels);
        if (Array.isArray(parsed) && parsed.length > 0) channels = parsed;
      } catch (_) {}
    } else if (Array.isArray(row.preferred_channels)) {
      channels = row.preferred_channels;
    }

    return new CommuteAlertPreference({
      userId: row.user_id,
      alertsEnabled: Boolean(row.alerts_enabled !== undefined ? row.alerts_enabled : 1),
      minimumSeverity: row.minimum_severity || 'moderate',
      enabledCategories: categories,
      preferredChannels: channels,
      createdAt: Number(row.created_at || Date.now()),
      updatedAt: Number(row.updated_at || Date.now())
    });
  }

  /**
   * Serializes entity to JSON for client consumption.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      userId: this.userId,
      alertsEnabled: this.alertsEnabled,
      minimumSeverity: this.minimumSeverity,
      enabledCategories: [...this.enabledCategories],
      preferredChannels: [...this.preferredChannels],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = {
  CommuteAlertPreference,
  commuteAlertPreferenceSchema,
  SEVERITY_HIERARCHY,
  DELIVERY_CHANNELS,
  DEFAULT_DISRUPTION_CATEGORIES
};
