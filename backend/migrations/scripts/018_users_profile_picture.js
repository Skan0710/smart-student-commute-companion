/**
 * Migration 018: users.profile_picture
 *
 * The runtime bootstrap (db/database.js) already adds this column on the fly,
 * but databases built purely through the migration runner never received it,
 * so UserRepository.create() failed with "no column named profile_picture".
 * This brings the migration chain in line with the runtime schema.
 */

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

module.exports = {
  name: '018_users_profile_picture',

  up(db) {
    if (!hasColumn(db, 'users', 'profile_picture')) {
      db.exec('ALTER TABLE users ADD COLUMN profile_picture TEXT;');
    }
  },

  down(db) {
    if (hasColumn(db, 'users', 'profile_picture')) {
      db.exec('ALTER TABLE users DROP COLUMN profile_picture;');
    }
  }
};
