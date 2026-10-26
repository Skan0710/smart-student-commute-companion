/**
 * Display formatters
 *
 * Small, dependency-free helpers that turn backend values (epoch-millisecond
 * timestamps, minute counts, byte sizes) into the short strings the screens
 * show. Every helper tolerates missing input and returns '' / a neutral label
 * instead of "NaN" or "Invalid Date".
 */

const LOCALE = 'en-IN';

const upperMeridiem = (text) => text.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

const isValidTimestamp = (value) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());

/** "28 Oct 2026" */
export function formatDate(ms) {
  if (!isValidTimestamp(ms)) return '';
  return new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "09:00 AM" */
export function formatClockTime(ms) {
  if (!isValidTimestamp(ms)) return '';
  return upperMeridiem(
    new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: true })
  );
}

/** "09:00 AM – 10:30 AM" */
export function formatTimeRange(startMs, endMs) {
  const start = formatClockTime(startMs);
  const end = formatClockTime(endMs);
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

/** "Wed, 28 Oct, 11:59 PM" */
export function formatDueDate(ms) {
  if (!isValidTimestamp(ms)) return 'No due date';
  const day = new Date(ms).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${formatClockTime(ms)}`;
}

/** "Mon" */
export function formatWeekday(ms) {
  if (!isValidTimestamp(ms)) return '';
  return new Date(ms).toLocaleDateString(LOCALE, { weekday: 'long' });
}

/** 45 → "45 min", 90 → "1 h 30 min", 120 → "2 h" */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** 4400000 → "4.2 MB" */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Report age in minutes → "Just now" / "5 min ago" / "3 h ago" / "2 d ago" */
export function formatAge(minutes) {
  if (!Number.isFinite(minutes)) return 'Recently';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** "in_progress" → "In progress" */
export function formatStatus(value) {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** "metro" → "Metro" (word-by-word) */
export function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
