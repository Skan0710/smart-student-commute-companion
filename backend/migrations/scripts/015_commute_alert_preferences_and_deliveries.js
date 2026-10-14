/**
 * Migration 015: Commute Alert Preferences and Delivery Tracking Tables
 *
 * Provisions relational SQLite storage for:
 * 1. commute_alert_preferences - Student notification settings (enabled, min severity, categories, channels)
 * 2. commute_alert_deliveries - Observable delivery audit, idempotency keys, and retry tracking
 */

module.exports = {
  name: '015_commute_alert_preferences_and_deliveries',

  up(db) {
    db.exec(`
      -- 1. Commute Alert Preferences Table
      CREATE TABLE IF NOT EXISTS commute_alert_preferences (
        user_id TEXT PRIMARY KEY,
        alerts_enabled INTEGER NOT NULL DEFAULT 1,
        minimum_severity TEXT NOT NULL DEFAULT 'moderate',
        enabled_categories TEXT NOT NULL DEFAULT '["delay","cancellation","service_suspension","traffic","waterlogging","maintenance","crowding"]',
        preferred_channels TEXT NOT NULL DEFAULT '["in_app"]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cap_user_id
        ON commute_alert_preferences(user_id);

      -- 2. Commute Alert Deliveries Table (Audit, Idempotency & Retry Tracking)
      CREATE TABLE IF NOT EXISTS commute_alert_deliveries (
        id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        error_message TEXT,
        fallback_used TEXT,
        payload_summary TEXT,
        delivered_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cad_user
        ON commute_alert_deliveries(user_id);

      CREATE INDEX IF NOT EXISTS idx_cad_alert
        ON commute_alert_deliveries(alert_id);

      CREATE INDEX IF NOT EXISTS idx_cad_status
        ON commute_alert_deliveries(status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_cad_idempotency
        ON commute_alert_deliveries(idempotency_key);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_cad_idempotency;
      DROP INDEX IF EXISTS idx_cad_status;
      DROP INDEX IF EXISTS idx_cad_alert;
      DROP INDEX IF EXISTS idx_cad_user;
      DROP TABLE IF EXISTS commute_alert_deliveries;

      DROP INDEX IF EXISTS idx_cap_user_id;
      DROP TABLE IF EXISTS commute_alert_preferences;
    `);
  }
};
