/**
 * Small helpers that turn a day's list of classes into "what is happening now"
 * so the dashboard can answer "what should I do next?" at a glance.
 *
 * Times arrive as display strings such as "09:00 AM – 10:30 AM". Anything that
 * cannot be parsed is treated as "later" instead of guessing.
 */

/** "09:00 AM" / "1:05 pm" / "13:30" -> minutes after midnight, or null. */
export function parseClockMinutes(text) {
  const match = /(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(text || ''));
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minutes > 59 || hours > 23) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }
  return hours * 60 + minutes;
}

/** "09:00 AM – 10:30 AM" -> { start, end } in minutes (either may be null). */
export function parseTimeRange(range) {
  const parts = String(range || '').split(/\s*[–—-]\s*(?=\d)/);
  const start = parseClockMinutes(parts[0]);
  let end = parts.length > 1 ? parseClockMinutes(parts[1]) : null;
  // "11:00 – 01:00 PM": an end before the start crossed noon without saying so.
  if (start !== null && end !== null && end <= start && end + 12 * 60 > start && end + 12 * 60 < 24 * 60) {
    end += 12 * 60;
  }
  return { start, end };
}

/**
 * Annotate events with their state relative to `now`.
 * Exactly one future event is marked "next" (the earliest); an event whose
 * window contains `now` is "now".
 *
 * @param {Array<{time?: string}>} events
 * @param {Date} [now]
 * @returns {Array<object>} the same events plus `status: 'done'|'now'|'next'|'later'`
 */
export function annotateSchedule(events, now = new Date()) {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  let nextAssigned = false;
  return (events || []).map((event) => {
    const { start, end } = parseTimeRange(event.time);
    let status = 'later';
    if (start !== null) {
      const finish = end ?? start + 60;
      if (minutesNow >= finish) status = 'done';
      else if (minutesNow >= start) status = 'now';
      else if (!nextAssigned) {
        status = 'next';
        nextAssigned = true;
      }
    }
    return { ...event, status };
  });
}

/** "Good morning" / "Good afternoon" / "Good evening" for a local hour. */
export function greetingForHour(hour) {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
