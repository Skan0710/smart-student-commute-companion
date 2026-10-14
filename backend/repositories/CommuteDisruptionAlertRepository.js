/**
 * CommuteDisruptionAlertRepository
 *
 * Data-access operations for student commute disruption alerts.
 * Supports lifecycle management, deduplication queries, material updates,
 * atomic transactions, and expiration tracking in SQLite.
 */

const { getConnection } = require('../db/connection');
const { CommuteDisruptionAlert } = require('../models/CommuteDisruptionAlert');

class CommuteDisruptionAlertRepository {
  /**
   * @param {object} [dbInstance] - Optional SQLite connection instance for testing
   */
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Saves (inserts or updates) a CommuteDisruptionAlert in the database.
   *
   * @param {CommuteDisruptionAlert|object} alert
   * @param {string} [fingerprint]
   * @returns {CommuteDisruptionAlert}
   */
  save(alert, fingerprint = '') {
    const entity = alert instanceof CommuteDisruptionAlert
      ? alert
      : new CommuteDisruptionAlert(alert);

    const fp = fingerprint || entity.fingerprint || '';
    const row = entity.toRow(fp);

    const stmt = this.database.prepare(`
      INSERT INTO commute_disruption_alerts (
        id, user_id, disruption_id, fingerprint, disruption_type, severity, status,
        title, message, relevance_reason, scope_json, recommended_action_json,
        alternative_route_json, affected_context_json, provenance_json, is_live_feed,
        valid_from, valid_until, dismissed_at, resolved_at, created_at, updated_at
      ) VALUES (
        @id, @user_id, @disruption_id, @fingerprint, @disruption_type, @severity, @status,
        @title, @message, @relevance_reason, @scope_json, @recommended_action_json,
        @alternative_route_json, @affected_context_json, @provenance_json, @is_live_feed,
        @valid_from, @valid_until, @dismissed_at, @resolved_at, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        disruption_id = excluded.disruption_id,
        fingerprint = excluded.fingerprint,
        disruption_type = excluded.disruption_type,
        severity = excluded.severity,
        status = excluded.status,
        title = excluded.title,
        message = excluded.message,
        relevance_reason = excluded.relevance_reason,
        scope_json = excluded.scope_json,
        recommended_action_json = excluded.recommended_action_json,
        alternative_route_json = excluded.alternative_route_json,
        affected_context_json = excluded.affected_context_json,
        provenance_json = excluded.provenance_json,
        is_live_feed = excluded.is_live_feed,
        valid_from = excluded.valid_from,
        valid_until = excluded.valid_until,
        dismissed_at = excluded.dismissed_at,
        resolved_at = excluded.resolved_at,
        updated_at = excluded.updated_at
    `);

    stmt.run(row);
    return this.findById(row.id);
  }

  /**
   * Retrieves an alert by its ID.
   *
   * @param {string} id
   * @returns {CommuteDisruptionAlert|null}
   */
  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM commute_disruption_alerts WHERE id = ?');
    const row = stmt.get(id);
    return row ? CommuteDisruptionAlert.fromRow(row) : null;
  }

  /**
   * Retrieves the most recent alert matching a given deduplication fingerprint.
   *
   * @param {string} fingerprint
   * @returns {CommuteDisruptionAlert|null}
   */
  findLatestByFingerprint(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'string') return null;
    const stmt = this.database.prepare(`
      SELECT * FROM commute_disruption_alerts
      WHERE fingerprint = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(fingerprint);
    return row ? CommuteDisruptionAlert.fromRow(row) : null;
  }

  /**
   * Retrieves an active alert matching a given deduplication fingerprint.
   *
   * @param {string} fingerprint
   * @param {number} [currentTime=Date.now()]
   * @returns {CommuteDisruptionAlert|null}
   */
  findActiveByFingerprint(fingerprint, currentTime = Date.now()) {
    if (!fingerprint || typeof fingerprint !== 'string') return null;
    const stmt = this.database.prepare(`
      SELECT * FROM commute_disruption_alerts
      WHERE fingerprint = ? AND status = 'active' AND valid_until > ?
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const row = stmt.get(fingerprint, currentTime);
    return row ? CommuteDisruptionAlert.fromRow(row) : null;
  }

  /**
   * Retrieves active disruption alerts matching options.
   *
   * @param {object} [options={}]
   * @param {string} [options.userId]
   * @param {boolean} [options.includeBroadcast=true]
   * @param {string} [options.mode]
   * @param {string} [options.disruptionType]
   * @param {string} [options.severity]
   * @param {number} [options.currentTime=Date.now()]
   * @param {number} [options.limit=50]
   * @returns {CommuteDisruptionAlert[]}
   */
  findActive(options = {}) {
    const now = options.currentTime || Date.now();
    const conditions = ['status = ?', 'valid_from <= ?', 'valid_until > ?'];
    const params = ['active', now, now];

    if (options.userId) {
      if (options.includeBroadcast !== false) {
        conditions.push('(user_id = ? OR user_id IS NULL)');
        params.push(options.userId);
      } else {
        conditions.push('user_id = ?');
        params.push(options.userId);
      }
    } else if (options.includeBroadcast === false) {
      conditions.push('user_id IS NOT NULL');
    }

    if (options.disruptionType) {
      conditions.push('disruption_type = ?');
      params.push(options.disruptionType);
    }

    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }

    const query = `
      SELECT * FROM commute_disruption_alerts
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    params.push(Number(options.limit || 50));

    const rows = this.database.prepare(query).all(...params);
    let alerts = rows.map(r => CommuteDisruptionAlert.fromRow(r));

    if (options.mode) {
      alerts = alerts.filter(a => a.affectsMode(options.mode));
    }
    if (options.area) {
      alerts = alerts.filter(a => a.affectsArea(options.area));
    }

    return alerts;
  }

  /**
   * Finds alerts for a user with status filtering and pagination.
   *
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {CommuteDisruptionAlert[]}
   */
  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    const conditions = ['(user_id = ?' + (options.includeBroadcast ? ' OR user_id IS NULL)' : ')')];
    const params = [userId];

    if (options.status && options.status !== 'all') {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const query = `
      SELECT * FROM commute_disruption_alerts
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `;
    params.push(Number(options.limit || 50));

    const rows = this.database.prepare(query).all(...params);
    return rows.map(r => CommuteDisruptionAlert.fromRow(r));
  }

  /**
   * Updates an alert's status (e.g. dismissed, resolved, expired).
   *
   * @param {string} id
   * @param {'active'|'dismissed'|'resolved'|'expired'} status
   * @param {number} [timestamp=Date.now()]
   * @param {object} [extra={}]
   * @returns {CommuteDisruptionAlert|null}
   */
  updateStatus(id, status, timestamp = Date.now(), extra = {}) {
    if (!id || typeof id !== 'string') return null;

    const setClauses = ['status = ?', 'updated_at = ?'];
    const params = [status, timestamp];

    if (status === 'dismissed' || extra.dismissedAt) {
      setClauses.push('dismissed_at = ?');
      params.push(extra.dismissedAt || timestamp);
    }
    if (status === 'resolved' || extra.resolvedAt) {
      setClauses.push('resolved_at = ?');
      params.push(extra.resolvedAt || timestamp);
    }

    params.push(id);

    const stmt = this.database.prepare(`
      UPDATE commute_disruption_alerts
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);
    return this.findById(id);
  }

  /**
   * Marks any active alerts whose valid_until <= currentTime as 'expired'.
   *
   * @param {number} [currentTime=Date.now()]
   * @returns {number} Count of expired alerts
   */
  markExpiredAlerts(currentTime = Date.now()) {
    const stmt = this.database.prepare(`
      UPDATE commute_disruption_alerts
      SET status = 'expired', updated_at = ?
      WHERE status = 'active' AND valid_until <= ?
    `);
    const info = stmt.run(currentTime, currentTime);
    return info.changes;
  }

  /**
   * Marks active alerts associated with a disruption ID as 'resolved'.
   *
   * @param {string} disruptionId
   * @param {number} [timestamp=Date.now()]
   * @returns {number} Count of resolved alerts
   */
  resolveByDisruptionId(disruptionId, timestamp = Date.now()) {
    if (!disruptionId || typeof disruptionId !== 'string') return 0;

    const stmt = this.database.prepare(`
      UPDATE commute_disruption_alerts
      SET status = 'resolved', resolved_at = ?, updated_at = ?
      WHERE disruption_id = ? AND status = 'active'
    `);
    const info = stmt.run(timestamp, timestamp, disruptionId);
    return info.changes;
  }

  /**
   * Deletes an alert by ID.
   *
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    if (!id || typeof id !== 'string') return false;
    const stmt = this.database.prepare('DELETE FROM commute_disruption_alerts WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Counts active alerts for a user.
   *
   * @param {string} [userId]
   * @param {number} [currentTime=Date.now()]
   * @returns {number}
   */
  countActive(userId = null, currentTime = Date.now()) {
    if (userId) {
      const stmt = this.database.prepare(`
        SELECT COUNT(*) as cnt FROM commute_disruption_alerts
        WHERE (user_id = ? OR user_id IS NULL) AND status = 'active' AND valid_until > ?
      `);
      return stmt.get(userId, currentTime).cnt;
    }

    const stmt = this.database.prepare(`
      SELECT COUNT(*) as cnt FROM commute_disruption_alerts
      WHERE status = 'active' AND valid_until > ?
    `);
    return stmt.get(currentTime).cnt;
  }
}

const commuteDisruptionAlertRepository = new CommuteDisruptionAlertRepository();

module.exports = {
  CommuteDisruptionAlertRepository,
  commuteDisruptionAlertRepository
};
