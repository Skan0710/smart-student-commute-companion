/**
 * Thank-you announcements.
 *
 * Forms live in different parts of the app (alerts, timetable scanner,
 * feedback), so instead of threading a callback through each of them they
 * announce a successful submission on `window`, and a single ThankYouHost in
 * the app shell shows the confirmation. Failure-safe: no window, no event.
 */

import { THANK_YOU_TYPES } from '../content/thankYou.js';

export const THANK_YOU_EVENT = 'sscc:thank-you';

/**
 * @param {'alert'|'timetable'|'feedback'} type
 * @param {EventTarget|null} [target]
 * @returns {boolean} whether an event was dispatched
 */
export function announceThankYou(type, target = typeof window !== 'undefined' ? window : null) {
  if (!target || !THANK_YOU_TYPES.includes(type) || typeof CustomEvent !== 'function') return false;
  target.dispatchEvent(new CustomEvent(THANK_YOU_EVENT, { detail: { type } }));
  return true;
}
