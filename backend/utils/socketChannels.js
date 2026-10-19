/**
 * Socket.IO channel (room) rules for the live community feed.
 *
 * The client names the channel it wants to join. That name becomes a room key
 * on the server, so it is constrained in shape and each socket may only
 * hold a handful of rooms.
 */

const DEFAULT_CHANNEL = 'mumbai_general';
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/i;
const MAX_CHANNELS_PER_SOCKET = 5;

/**
 * @param {unknown} payload - data sent with `join_commute_channel`
 * @param {number} currentRoomCount - `socket.rooms.size` (includes the socket's own id room)
 * @returns {{ ok: true, channel: string } | { ok: false, reason: string }}
 */
function resolveChannel(payload, currentRoomCount) {
  const requested = payload && typeof payload.area === 'string' ? payload.area.trim() : '';
  const channel = requested || DEFAULT_CHANNEL;

  if (!CHANNEL_PATTERN.test(channel)) {
    return { ok: false, reason: 'Invalid channel name' };
  }
  // A socket always sits in its own id room, hence the +1
  if (currentRoomCount >= MAX_CHANNELS_PER_SOCKET + 1) {
    return { ok: false, reason: 'Too many channels' };
  }
  return { ok: true, channel };
}

module.exports = { resolveChannel, DEFAULT_CHANNEL, CHANNEL_PATTERN, MAX_CHANNELS_PER_SOCKET };
