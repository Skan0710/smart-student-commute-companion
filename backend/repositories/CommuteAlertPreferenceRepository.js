/**
 * CommuteAlertPreferenceRepository
 *
 * Data-access operations for student commute alert notification preferences.
 * Supports upsert, default fallback, and preference retrieval in SQLite.
 */

const { getConnection } = require('../db/connection');
const { CommuteAlertPreference } = require('../models/CommuteAlertPreference');

class CommuteAlertPreferenceRepository {
  /**
   * @param {object} [dbInstance]
   */
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Finds commute alert preferences for a specific student.
   *
   * @param {string} userId
   * @returns {CommuteAlertPreference|null}
   */
  findByUserId(userId) {
    if (!userId || typeof userId !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM commute_alert_preferences WHERE user_id = ?');
    const row = stmt.get(userId);
    return row ? CommuteAlertPreference.fromRow(row) : null;
  }

  /**
   * Upserts commute alert preferences for a student.
   *
   * @param {string} userId
   * @param {object} [data={}]
   * @returns {CommuteAlertPreference}
   */
  upsert(userId, data = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required to upsert alert preferences');
    }

    const existing = this.findByUserId(userId);
    const now = Date.now();

    if (!existing) {
      const entity = CommuteAlertPreference.createDefault(userId, {
        ...data,
        userId,
        createdAt: now,
        updatedAt: now
      });

      const row = entity.toRow();
      const stmt = this.database.prepare(`
        INSERT INTO commute_alert_preferences (
          user_id, alerts_enabled, minimum_severity, enabled_categories, preferred_channels, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        row.user_id,
        row.alerts_enabled,
        row.minimum_severity,
        row.enabled_categories,
        row.preferred_channels,
        row.created_at,
        row.updated_at
      );

      return this.findByUserId(userId);
    }

    const merged = {
      userId,
      alertsEnabled: data.alertsEnabled !== undefined ? Boolean(data.alertsEnabled) : existing.alertsEnabled,
      minimumSeverity: data.minimumSeverity || existing.minimumSeverity,
      enabledCategories: data.enabledCategories || existing.enabledCategories,
      preferredChannels: data.preferredChannels || existing.preferredChannels,
      createdAt: existing.createdAt,
      updatedAt: now
    };

    const entity = new CommuteAlertPreference(merged);
    const row = entity.toRow();

    const stmt = this.database.prepare(`
      UPDATE commute_alert_preferences
      SET alerts_enabled = ?,
          minimum_severity = ?,
          enabled_categories = ?,
          preferred_channels = ?,
          updated_at = ?
      WHERE user_id = ?
    `);

    stmt.run(
      row.alerts_enabled,
      row.minimum_severity,
      row.enabled_categories,
      row.preferred_channels,
      row.updated_at,
      userId
    );

    return this.findByUserId(userId);
  }

  /**
   * Deletes preferences for a specific student.
   *
   * @param {string} userId
   * @returns {boolean}
   */
  deleteByUserId(userId) {
    if (!userId || typeof userId !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM commute_alert_preferences WHERE user_id = ?');
    const info = stmt.run(userId);
    return info.changes > 0;
  }

  /**
   * Resets student preferences to system defaults.
   *
   * @param {string} userId
   * @returns {CommuteAlertPreference}
   */
  resetToDefaults(userId) {
    this.deleteByUserId(userId);
    return this.upsert(userId, {});
  }
}

const commuteAlertPreferenceRepository = new CommuteAlertPreferenceRepository();

module.exports = {
  CommuteAlertPreferenceRepository,
  commuteAlertPreferenceRepository
};
