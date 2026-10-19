/**
 * Operator tool: grant the admin role to an existing account.
 *
 * Self-registration always creates students, so admins are provisioned
 * out-of-band by someone with access to the database file:
 *
 *   node scripts/promote_admin.js student@example.edu
 *
 * The user must sign in again afterwards to receive a token carrying the
 * new role.
 */

// Requiring db/database initializes the schema and migrations on load.
const { getConnection, closeConnection } = require('../db/database');

function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node scripts/promote_admin.js <email>');
    process.exit(1);
  }

  const db = getConnection();
  const result = db
    .prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE email = ?")
    .run(Date.now(), email);

  if (result.changes === 0) {
    console.error(`No account found for ${email}. Register it first.`);
    closeConnection();
    process.exit(1);
  }

  console.log(`${email} is now an admin. They must sign in again.`);
  closeConnection();
}

main();
