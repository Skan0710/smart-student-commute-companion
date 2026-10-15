/**
 * StudentTravelSharingPreference Repository
 *
 * Data-access operations for student travel sharing preferences and voluntary consent states.
 */

const { getConnection } = require('../db/connection');
const { StudentTravelSharingPreference } = require('../models/StudentTravelSharingPreference');

class StudentTravelSharingPreferenceRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Retrieves a student's travel sharing preference by user ID.
   * Defaults to safe un-opted-in preference if no row exists.
   *
   * @param {string} userId
   * @returns {StudentTravelSharingPreference}
   */
  findByUserId(userId) {
    if (!userId) return null;
    const stmt = this.database.prepare(
      'SELECT * FROM student_travel_sharing_preferences WHERE user_id = ?'
    );
    const row = stmt.get(userId);
    if (!row) {
      return StudentTravelSharingPreference.createDefault(userId);
    }
    return StudentTravelSharingPreference.fromRow(row);
  }

  /**
   * Upserts a student's travel sharing preference.
   *
   * @param {StudentTravelSharingPreference|object} preference
   * @returns {StudentTravelSharingPreference}
   */
  save(preference) {
    const prefObj = preference instanceof StudentTravelSharingPreference
      ? preference
      : new StudentTravelSharingPreference(preference);

    const row = prefObj.toRow();
    const stmt = this.database.prepare(`
      INSERT INTO student_travel_sharing_preferences (
        user_id,
        sharing_enabled,
        consent_confirmed_at,
        preferred_pseudonym,
        visibility,
        home_area_coarse,
        default_campus,
        allowed_modes,
        max_group_size_preference,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        sharing_enabled = excluded.sharing_enabled,
        consent_confirmed_at = excluded.consent_confirmed_at,
        preferred_pseudonym = excluded.preferred_pseudonym,
        visibility = excluded.visibility,
        home_area_coarse = excluded.home_area_coarse,
        default_campus = excluded.default_campus,
        allowed_modes = excluded.allowed_modes,
        max_group_size_preference = excluded.max_group_size_preference,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      row.user_id,
      row.sharing_enabled,
      row.consent_confirmed_at,
      row.preferred_pseudonym,
      row.visibility,
      row.home_area_coarse,
      row.default_campus,
      row.allowed_modes,
      row.max_group_size_preference,
      row.updated_at
    );

    return prefObj;
  }

  /**
   * Deletes a student preference.
   *
   * @param {string} userId
   * @returns {boolean}
   */
  delete(userId) {
    const stmt = this.database.prepare(
      'DELETE FROM student_travel_sharing_preferences WHERE user_id = ?'
    );
    const result = stmt.run(userId);
    return result.changes > 0;
  }
}

const studentTravelSharingPreferenceRepository = new StudentTravelSharingPreferenceRepository();

module.exports = {
  StudentTravelSharingPreferenceRepository,
  studentTravelSharingPreferenceRepository
};
