/**
 * Migration 014: Commute Disruption Alerts and Lifecycle State Table
 *
 * Provisions relational SQLite storage for commute disruption alerts,
 * stable deduplication fingerprints, and lifecycle statuses (active, expired, dismissed, resolved).
 */

module.exports = {
  name: '014_commute_disruption_alerts',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS commute_disruption_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        disruption_id TEXT,
        fingerprint TEXT NOT NULL,
        disruption_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        relevance_reason TEXT NOT NULL,
        scope_json TEXT NOT NULL DEFAULT '{}',
        recommended_action_json TEXT,
        alternative_route_json TEXT,
        affected_context_json TEXT,
        provenance_json TEXT NOT NULL,
        is_live_feed INTEGER NOT NULL DEFAULT 0,
        valid_from INTEGER NOT NULL,
        valid_until INTEGER NOT NULL,
        dismissed_at INTEGER,
        resolved_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_user_status
        ON commute_disruption_alerts(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint
        ON commute_disruption_alerts(fingerprint);

      CREATE INDEX IF NOT EXISTS idx_alerts_status_valid
        ON commute_disruption_alerts(status, valid_until);

      CREATE INDEX IF NOT EXISTS idx_alerts_disruption_id
        ON commute_disruption_alerts(disruption_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_alerts_disruption_id;
      DROP INDEX IF EXISTS idx_alerts_status_valid;
      DROP INDEX IF EXISTS idx_alerts_fingerprint;
      DROP INDEX IF EXISTS idx_alerts_user_status;
      DROP TABLE IF EXISTS commute_disruption_alerts;
    `);
  }
};
