/**
 * CommuteAlertDeliveryRepository
 *
 * Data-access operations for commute alert delivery audits, idempotency, and retry attempts.
 */

const { getConnection } = require('../db/connection');

class CommuteAlertDeliveryRepository {
  /**
   * @param {object} [dbInstance]
   */
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Records or updates a delivery attempt.
   *
   * @param {object} delivery
   * @returns {object}
   */
  save(delivery) {
    const now = Date.now();
    const id = delivery.id || `cad-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const attemptCount = delivery.attemptCount !== undefined ? Number(delivery.attemptCount) : 1;

    const stmt = this.database.prepare(`
      INSERT INTO commute_alert_deliveries (
        id, alert_id, user_id, channel, status, idempotency_key,
        attempt_count, error_message, fallback_used, payload_summary,
        delivered_at, created_at, updated_at
      ) VALUES (
        @id, @alert_id, @user_id, @channel, @status, @idempotency_key,
        @attempt_count, @error_message, @fallback_used, @payload_summary,
        @delivered_at, @created_at, @updated_at
      )
      ON CONFLICT(idempotency_key) DO UPDATE SET
        status = excluded.status,
        attempt_count = commute_alert_deliveries.attempt_count + 1,
        error_message = excluded.error_message,
        fallback_used = excluded.fallback_used,
        delivered_at = excluded.delivered_at,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      id,
      alert_id: delivery.alertId,
      user_id: delivery.userId,
      channel: delivery.channel,
      status: delivery.status,
      idempotency_key: delivery.idempotencyKey,
      attempt_count: attemptCount,
      error_message: delivery.errorMessage || null,
      fallback_used: delivery.fallbackUsed || null,
      payload_summary: delivery.payloadSummary || null,
      delivered_at: delivery.deliveredAt || null,
      created_at: delivery.createdAt || now,
      updated_at: now
    });

    return this.findByIdempotencyKey(delivery.idempotencyKey);
  }

  /**
   * Finds a delivery record by its idempotency key.
   *
   * @param {string} idempotencyKey
   * @returns {object|null}
   */
  findByIdempotencyKey(idempotencyKey) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM commute_alert_deliveries WHERE idempotency_key = ?');
    const row = stmt.get(idempotencyKey);
    return row ? this._formatRow(row) : null;
  }

  /**
   * Finds a delivery record by ID.
   *
   * @param {string} id
   * @returns {object|null}
   */
  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM commute_alert_deliveries WHERE id = ?');
    const row = stmt.get(id);
    return row ? this._formatRow(row) : null;
  }

  /**
   * Finds delivery records for a specific alert.
   *
   * @param {string} alertId
   * @returns {object[]}
   */
  findByAlertId(alertId) {
    if (!alertId || typeof alertId !== 'string') return [];
    const stmt = this.database.prepare('SELECT * FROM commute_alert_deliveries WHERE alert_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(alertId);
    return rows.map(r => this._formatRow(r));
  }

  /**
   * Finds delivery records for a student user.
   *
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {object[]}
   */
  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    const conditions = ['user_id = ?'];
    const params = [userId];

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.channel) {
      conditions.push('channel = ?');
      params.push(options.channel);
    }

    const query = `
      SELECT * FROM commute_alert_deliveries
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `;
    params.push(Number(options.limit || 50));

    const rows = this.database.prepare(query).all(...params);
    return rows.map(r => this._formatRow(r));
  }

  /**
   * Formats a raw database row into a standardized camelCase delivery record.
   *
   * @param {object} row
   * @returns {object}
   */
  _formatRow(row) {
    return {
      id: row.id,
      alertId: row.alert_id,
      userId: row.user_id,
      channel: row.channel,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      attemptCount: Number(row.attempt_count),
      errorMessage: row.error_message,
      fallbackUsed: row.fallback_used,
      payloadSummary: row.payload_summary,
      deliveredAt: row.delivered_at ? Number(row.delivered_at) : null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }
}

const commuteAlertDeliveryRepository = new CommuteAlertDeliveryRepository();

module.exports = {
  CommuteAlertDeliveryRepository,
  commuteAlertDeliveryRepository
};
