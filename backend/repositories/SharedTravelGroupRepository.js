/**
 * SharedTravelGroup Repository
 *
 * Data-access operations for student shared travel coordination groups and journeys.
 */

const { getConnection } = require('../db/connection');
const { SharedTravelGroup } = require('../models/SharedTravelGroup');
const { SharedTravelMember } = require('../models/SharedTravelMember');
const { SHARED_TRAVEL_STATUSES } = require('../models/SharedTravelContracts');

class SharedTravelGroupRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Deserializes a database row into a SharedTravelGroup domain instance.
   *
   * @param {object} row
   * @param {SharedTravelMember[]} [members=[]]
   * @returns {SharedTravelGroup|null}
   */
  mapRow(row, members = []) {
    if (!row) return null;
    let departureWindow = {};
    let suggestedMeetingPoint = {};

    try {
      departureWindow = typeof row.departure_window_json === 'string'
        ? JSON.parse(row.departure_window_json)
        : (row.departure_window_json || {});
    } catch (e) {
      departureWindow = {};
    }

    try {
      suggestedMeetingPoint = typeof row.suggested_meeting_point_json === 'string'
        ? JSON.parse(row.suggested_meeting_point_json)
        : (row.suggested_meeting_point_json || {});
    } catch (e) {
      suggestedMeetingPoint = {};
    }

    return new SharedTravelGroup({
      id: row.id,
      title: row.title,
      organizer: {
        userId: row.organizer_id,
        pseudonym: row.organizer_pseudonym,
        avatarUrl: row.organizer_avatar || null
      },
      originArea: row.origin_area,
      destinationArea: row.destination_area,
      departureWindow,
      transportMode: row.transport_mode,
      journeyReference: row.journey_reference || null,
      suggestedMeetingPoint,
      maxParticipants: Number(row.max_participants),
      status: row.status,
      visibility: row.visibility,
      notes: row.notes || '',
      members,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      expiresAt: Number(row.expires_at)
    });
  }

  /**
   * Finds a shared travel group by ID, optionally loading its members.
   *
   * @param {string} id
   * @param {boolean} [includeMembers=true]
   * @returns {SharedTravelGroup|null}
   */
  findById(id, includeMembers = true) {
    if (!id) return null;
    const stmt = this.database.prepare(
      'SELECT * FROM shared_travel_groups WHERE id = ?'
    );
    const row = stmt.get(id);
    if (!row) return null;

    let members = [];
    if (includeMembers) {
      const memStmt = this.database.prepare(
        'SELECT * FROM shared_travel_members WHERE group_id = ? ORDER BY joined_at ASC'
      );
      const memRows = memStmt.all(id);
      members = memRows.map(m => new SharedTravelMember({
        id: m.id,
        groupId: m.group_id,
        userId: m.user_id,
        pseudonym: m.pseudonym,
        role: m.role,
        status: m.status,
        consentStatus: m.consent_status,
        optedInAt: m.opted_in_at ? Number(m.opted_in_at) : null,
        approximateStop: m.approximate_stop || null,
        notes: m.notes || '',
        joinedAt: Number(m.joined_at),
        updatedAt: Number(m.updated_at)
      }));
    }

    return this.mapRow(row, members);
  }

  /**
   * Finds active/open shared travel groups with optional filtering.
   *
   * @param {object} [options={}]
   * @returns {SharedTravelGroup[]}
   */
  findActive(options = {}) {
    const conditions = ["status IN ('open', 'active')"];
    const params = [];

    if (options.currentTime) {
      conditions.push('expires_at > ?');
      params.push(Number(options.currentTime));
    }

    if (options.mode) {
      conditions.push('transport_mode = ?');
      params.push(options.mode);
    }

    if (options.origin) {
      conditions.push('LOWER(origin_area) LIKE LOWER(?)');
      params.push(`%${options.origin}%`);
    }

    if (options.destination) {
      conditions.push('LOWER(destination_area) LIKE LOWER(?)');
      params.push(`%${options.destination}%`);
    }

    const limit = Math.min(50, Number(options.limit) || 20);
    params.push(limit);

    const query = `
      SELECT * FROM shared_travel_groups
      WHERE ${conditions.join(' AND ')}
      ORDER BY departure_window_json ASC, created_at DESC
      LIMIT ?
    `;

    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);

    return rows.map(r => this.findById(r.id, Boolean(options.includeMembers)));
  }

  /**
   * Finds groups that have elapsed and need to be marked expired.
   *
   * @param {number} currentTime
   * @returns {SharedTravelGroup[]}
   */
  findExpired(currentTime = Date.now()) {
    const stmt = this.database.prepare(`
      SELECT * FROM shared_travel_groups
      WHERE status IN ('draft', 'open', 'active') AND expires_at <= ?
    `);
    const rows = stmt.all(currentTime);
    return rows.map(r => this.findById(r.id, true));
  }

  /**
   * Finds all shared travel groups organized by a student.
   *
   * @param {string} organizerId
   * @returns {SharedTravelGroup[]}
   */
  findByOrganizer(organizerId) {
    if (!organizerId) return [];
    const stmt = this.database.prepare(
      'SELECT * FROM shared_travel_groups WHERE organizer_id = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(organizerId);
    return rows.map(r => this.findById(r.id, true));
  }

  /**
   * Saves or updates a shared travel group.
   *
   * @param {SharedTravelGroup|object} group
   * @returns {SharedTravelGroup}
   */
  save(group) {
    const grpObj = group instanceof SharedTravelGroup ? group : new SharedTravelGroup(group);

    const stmt = this.database.prepare(`
      INSERT INTO shared_travel_groups (
        id,
        title,
        organizer_id,
        organizer_pseudonym,
        organizer_avatar,
        origin_area,
        destination_area,
        departure_window_json,
        transport_mode,
        journey_reference,
        suggested_meeting_point_json,
        max_participants,
        status,
        visibility,
        notes,
        created_at,
        updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        organizer_pseudonym = excluded.organizer_pseudonym,
        organizer_avatar = excluded.organizer_avatar,
        origin_area = excluded.origin_area,
        destination_area = excluded.destination_area,
        departure_window_json = excluded.departure_window_json,
        transport_mode = excluded.transport_mode,
        journey_reference = excluded.journey_reference,
        suggested_meeting_point_json = excluded.suggested_meeting_point_json,
        max_participants = excluded.max_participants,
        status = excluded.status,
        visibility = excluded.visibility,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `);

    stmt.run(
      grpObj.id,
      grpObj.title,
      grpObj.organizer.userId,
      grpObj.organizer.pseudonym,
      grpObj.organizer.avatarUrl || null,
      grpObj.originArea,
      grpObj.destinationArea,
      JSON.stringify(grpObj.departureWindow),
      grpObj.transportMode,
      grpObj.journeyReference || null,
      JSON.stringify(grpObj.suggestedMeetingPoint),
      grpObj.maxParticipants,
      grpObj.status,
      grpObj.visibility,
      grpObj.notes || '',
      grpObj.createdAt,
      grpObj.updatedAt,
      grpObj.expiresAt
    );

    return grpObj;
  }

  /**
   * Updates group status and notes.
   *
   * @param {string} id
   * @param {string} status
   * @param {string} [notes]
   * @param {number} [updatedAt=Date.now()]
   * @returns {boolean}
   */
  updateStatus(id, status, notes = undefined, updatedAt = Date.now()) {
    const hasNotes = notes !== undefined;
    const query = hasNotes
      ? 'UPDATE shared_travel_groups SET status = ?, notes = ?, updated_at = ? WHERE id = ?'
      : 'UPDATE shared_travel_groups SET status = ?, updated_at = ? WHERE id = ?';

    const stmt = this.database.prepare(query);
    const result = hasNotes
      ? stmt.run(status, notes, updatedAt, id)
      : stmt.run(status, updatedAt, id);

    return result.changes > 0;
  }

  /**
   * Deletes a shared travel group by ID.
   *
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const stmt = this.database.prepare('DELETE FROM shared_travel_groups WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

const sharedTravelGroupRepository = new SharedTravelGroupRepository();

module.exports = {
  SharedTravelGroupRepository,
  sharedTravelGroupRepository
};
