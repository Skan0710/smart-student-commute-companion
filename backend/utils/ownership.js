/**
 * Record ownership policy for community content (reports, ride groups).
 *
 * Ownership is the server-assigned account id captured when a signed-in
 * student created the record. Display names are NOT ownership: they are
 * free text any client can copy. Anonymous and legacy rows have no owner,
 * so only administrators may modify them.
 *
 * `user === undefined` means a trusted in-process service call (jobs,
 * seeding, tests). HTTP handlers always pass `req.user`, which is a real
 * user after `authenticate` or `null` for anonymous callers (denied).
 */

/**
 * @param {string|null} ownerUserId - creator_user_id stored with the record
 * @param {{ id: string, role?: string }|null|undefined} user
 * @returns {boolean}
 */
function canModifyOwnedRecord(ownerUserId, user) {
  if (user === undefined) return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Boolean(ownerUserId) && ownerUserId === user.id;
}

module.exports = { canModifyOwnedRecord };
