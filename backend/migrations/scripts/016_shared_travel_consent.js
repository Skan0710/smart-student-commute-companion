/**
 * Migration 016: Shared Travel Coordination and Consent Tables
 *
 * Provisions relational SQLite storage for:
 * 1. student_travel_sharing_preferences: student opt-in consent and privacy preferences
 * 2. shared_travel_groups: voluntary student shared journeys and travel groups
 * 3. shared_travel_members: group membership, voluntary consent status, and invitations
 */

module.exports = {
  name: '016_shared_travel_consent',

  up(db) {
    db.exec(`
      -- 1. Student Travel Sharing Preferences Table
      CREATE TABLE IF NOT EXISTS student_travel_sharing_preferences (
        user_id TEXT PRIMARY KEY,
        sharing_enabled INTEGER NOT NULL DEFAULT 0,
        consent_confirmed_at INTEGER,
        preferred_pseudonym TEXT NOT NULL DEFAULT 'Student_Commuter',
        visibility TEXT NOT NULL DEFAULT 'campus_only',
        home_area_coarse TEXT,
        default_campus TEXT DEFAULT 'DJ Sanghvi College of Engineering',
        allowed_modes TEXT NOT NULL DEFAULT '["train","metro","bus","auto","walk"]',
        max_group_size_preference INTEGER NOT NULL DEFAULT 4,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stsp_user_id
        ON student_travel_sharing_preferences(user_id);

      -- 2. Shared Travel Groups Table
      CREATE TABLE IF NOT EXISTS shared_travel_groups (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        organizer_id TEXT NOT NULL,
        organizer_pseudonym TEXT NOT NULL,
        organizer_avatar TEXT,
        origin_area TEXT NOT NULL,
        destination_area TEXT NOT NULL,
        departure_window_json TEXT NOT NULL,
        transport_mode TEXT NOT NULL DEFAULT 'train',
        journey_reference TEXT,
        suggested_meeting_point_json TEXT NOT NULL,
        max_participants INTEGER NOT NULL DEFAULT 4,
        status TEXT NOT NULL DEFAULT 'open',
        visibility TEXT NOT NULL DEFAULT 'campus_only',
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stg_organizer
        ON shared_travel_groups(organizer_id);

      CREATE INDEX IF NOT EXISTS idx_stg_status
        ON shared_travel_groups(status);

      CREATE INDEX IF NOT EXISTS idx_stg_expires
        ON shared_travel_groups(expires_at);

      -- 3. Shared Travel Members Table (Invitations & Participation)
      CREATE TABLE IF NOT EXISTS shared_travel_members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        pseudonym TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'participant',
        status TEXT NOT NULL DEFAULT 'pending',
        consent_status TEXT NOT NULL DEFAULT 'opted_out',
        opted_in_at INTEGER,
        approximate_stop TEXT,
        notes TEXT,
        joined_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(group_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_stm_group
        ON shared_travel_members(group_id);

      CREATE INDEX IF NOT EXISTS idx_stm_user
        ON shared_travel_members(user_id);

      CREATE INDEX IF NOT EXISTS idx_stm_status
        ON shared_travel_members(status);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_stm_status;
      DROP INDEX IF EXISTS idx_stm_user;
      DROP INDEX IF EXISTS idx_stm_group;
      DROP TABLE IF EXISTS shared_travel_members;

      DROP INDEX IF EXISTS idx_stg_expires;
      DROP INDEX IF EXISTS idx_stg_status;
      DROP INDEX IF EXISTS idx_stg_organizer;
      DROP TABLE IF EXISTS shared_travel_groups;

      DROP INDEX IF EXISTS idx_stsp_user_id;
      DROP TABLE IF EXISTS student_travel_sharing_preferences;
    `);
  }
};
