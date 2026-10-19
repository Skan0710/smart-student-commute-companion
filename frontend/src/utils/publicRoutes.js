/**
 * Public route resolution.
 *
 * The commute assistant lives at "/" (its screens are in-app tabs selected
 * with ?tab=). Everything else is either a known public page or a 404. The
 * 404 must never fall through to the app: an unknown URL is not a successful
 * page.
 */

import { PAGES } from '../content/siteContent.js';

const PUBLIC_PATHS = new Map([
  ['/about', PAGES.about],
]);

/** "/about/" -> "/about", "/" stays "/". Case-insensitive. */
export function normalizePathname(pathname) {
  const raw = typeof pathname === 'string' && pathname ? pathname : '/';
  const lowered = raw.toLowerCase();
  return lowered.length > 1 ? lowered.replace(/\/+$/, '') || '/' : lowered;
}

/**
 * @param {string} pathname - window.location.pathname
 * @returns {{ id: 'app'|'about'|'notfound', page: object }}
 */
export function resolveRoute(pathname) {
  const path = normalizePathname(pathname);

  if (path === '/' || path === '/index.html') {
    return { id: 'app', page: PAGES.home };
  }

  const page = PUBLIC_PATHS.get(path);
  if (page) {
    return { id: page.id, page };
  }

  return { id: 'notfound', page: PAGES.notFound };
}

/** Static pages the prerender must emit (path -> page). */
export function listPrerenderedPages() {
  return [PAGES.home, ...PUBLIC_PATHS.values()];
}
