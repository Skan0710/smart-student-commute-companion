/**
 * Migration 017: Community Record Ownership
 *
 * Community reports and ride groups were attributed only by a free-text
 * display name, which any client can copy. This adds a server-assigned
 * `creator_user_id` so edit/delete rights are tied to the authenticated
 * account that created the record. Anonymous and legacy rows stay NULL and
 * are only modifiable by administrators.
 */

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

module.exports = {
  name: '017_community_record_ownership',

  up(db) {
    for (const table of ['live_commute_reports', 'ride_groups']) {
      if (!hasColumn(db, table, 'creator_user_id')) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN creator_user_id TEXT;`);
      }
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_live_reports_creator_user
        ON live_commute_reports(creator_user_id);
      CREATE INDEX IF NOT EXISTS idx_ride_groups_creator_user
        ON ride_groups(creator_user_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_ride_groups_creator_user;
      DROP INDEX IF EXISTS idx_live_reports_creator_user;
    `);
    for (const table of ['ride_groups', 'live_commute_reports']) {
      if (hasColumn(db, table, 'creator_user_id')) {
        db.exec(`ALTER TABLE ${table} DROP COLUMN creator_user_id;`);
      }
    }
  }
};
