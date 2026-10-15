/**
 * SharedTravelMember Repository
 *
 * Data-access operations for student shared travel coordination memberships,
 * invitations, and voluntary consent records.
 */

const { getConnection } = require('../db/connection');
const { SharedTravelMember } = require('../models/SharedTravelMember');
const { SHARED_MEMBER_STATUSES, TRAVEL_CONSENT_STATUSES } = require('../models/SharedTravelContracts');

class SharedTravelMemberRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Deserializes a database row into a SharedTravelMember domain instance.
   *
   * @param {object} row
   * @returns {SharedTravelMember|null}
   */
  mapRow(row) {
    if (!row) return null;
    return new SharedTravelMember({
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      pseudonym: row.pseudonym,
      role: row.role,
      status: row.status,
      consentStatus: row.consent_status,
      optedInAt: row.opted_in_at ? Number(row.opted_in_at) : null,
      approximateStop: row.approximate_stop || null,
      notes: row.notes || '',
      joinedAt: Number(row.joined_at),
      updatedAt: Number(row.updated_at)
    });
  }

  /**
   * Finds a member record by its unique membership ID.
   *
   * @param {string} id
   * @returns {SharedTravelMember|null}
   */
  findById(id) {
    if (!id) return null;
    const stmt = this.database.prepare(
      'SELECT * FROM shared_travel_members WHERE id = ?'
    );
    return this.mapRow(stmt.get(id));
  }

  /**
   * Finds a member record by group ID and student user ID.
   *
   * @param {string} groupId
   * @param {string} userId
   * @returns {SharedTravelMember|null}
   */
  findByGroupAndUser(groupId, userId) {
    if (!groupId || !userId) return null;
    const stmt = this.database.prepare(
      'SELECT * FROM shared_travel_members WHERE group_id = ? AND user_id = ?'
    );
    return this.mapRow(stmt.get(groupId, userId));
  }

  /**
   * Finds all members associated with a shared travel group.
   *
   * @param {string} groupId
   * @returns {SharedTravelMember[]}
   */
  findByGroupId(groupId) {
    if (!groupId) return [];
    const stmt = this.database.prepare(
      'SELECT * FROM shared_travel_members WHERE group_id = ? ORDER BY joined_at ASC'
    );
    const rows = stmt.all(groupId);
    return rows.map(r => this.mapRow(r));
  }

  /**
   * Finds all travel memberships and invitations for a given student.
   *
   * @param {string} userId
   * @returns {SharedTravelMember[]}
   */
  findByUserId(userId) {
    if (!userId) return [];
    const stmt = this.database.prepare(
      'SELECT * FROM shared_travel_members WHERE user_id = ? ORDER BY joined_at DESC'
    );
    const rows = stmt.all(userId);
    return rows.map(r => this.mapRow(r));
  }

  /**
   * Counts confirmed (accepted and opted-in) participants for a group.
   *
   * @param {string} groupId
   * @returns {number}
   */
  countConfirmedByGroupId(groupId) {
    if (!groupId) return 0;
    const stmt = this.database.prepare(`
      SELECT COUNT(*) as count FROM shared_travel_members
      WHERE group_id = ? AND status = ? AND consent_status = ?
    `);
    const result = stmt.get(groupId, SHARED_MEMBER_STATUSES.ACCEPTED, TRAVEL_CONSENT_STATUSES.OPTED_IN);
    return result ? Number(result.count) : 0;
  }

  /**
   * Saves or updates a member record.
   *
   * @param {SharedTravelMember|object} member
   * @returns {SharedTravelMember}
   */
  save(member) {
    const memObj = member instanceof SharedTravelMember ? member : new SharedTravelMember(member);
    const stmt = this.database.prepare(`
      INSERT INTO shared_travel_members (
        id,
        group_id,
        user_id,
        pseudonym,
        role,
        status,
        consent_status,
        opted_in_at,
        approximate_stop,
        notes,
        joined_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id, user_id) DO UPDATE SET
        pseudonym = excluded.pseudonym,
        role = excluded.role,
        status = excluded.status,
        consent_status = excluded.consent_status,
        opted_in_at = excluded.opted_in_at,
        approximate_stop = excluded.approximate_stop,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      memObj.id,
      memObj.groupId,
      memObj.userId,
      memObj.pseudonym,
      memObj.role,
      memObj.status,
      memObj.consentStatus,
      memObj.optedInAt,
      memObj.approximateStop,
      memObj.notes,
      memObj.joinedAt,
      memObj.updatedAt
    );

    return memObj;
  }

  /**
   * Deletes a member record by ID.
   *
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const stmt = this.database.prepare('DELETE FROM shared_travel_members WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Deletes all members for a group.
   *
   * @param {string} groupId
   * @returns {number}
   */
  deleteByGroupId(groupId) {
    const stmt = this.database.prepare('DELETE FROM shared_travel_members WHERE group_id = ?');
    const result = stmt.run(groupId);
    return result.changes;
  }
}

const sharedTravelMemberRepository = new SharedTravelMemberRepository();

module.exports = {
  SharedTravelMemberRepository,
  sharedTravelMemberRepository
};
