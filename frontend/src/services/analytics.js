/**
 * Google Analytics 4, consent first
 *
 * - Inert unless VITE_GA_MEASUREMENT_ID is configured (and well-formed). Nothing
 *   is ever fabricated: with no ID there is no script, no banner, no tracking.
 * - Nothing loads and nothing is sent until the visitor chooses "Accept".
 *   "Decline" (the default if they never choose) keeps the script off the page.
 * - Only page views are reported, as a sanitized path ("/", "/about", "/privacy",
 *   or "/?tab=<screen>" for in-app screens). Query strings, routes, areas,
 *   colleges, report text and account details are never included.
 * - Initialization is idempotent and page views are de-duplicated.
 *
 * Globals are injectable so the behaviour is unit-testable without a browser.
 */

export const CONSENT_KEY = 'smart_commute_analytics_consent';
export const CONSENT_CHANGE_EVENT = 'sscc:analytics-consent-changed';
export const OPEN_CONSENT_EVENT = 'sscc:open-analytics-settings';

const GA_ID_PATTERN = /^G-[A-Z0-9]{6,14}$/;
const SCRIPT_BASE = 'https://www.googletagmanager.com/gtag/js';
const SAFE_TABS = new Set([
  'dashboard', 'academics', 'community', 'planner', 'mycommutes', 'transit', 'together', 'feed', 'notifications',
  'devicealerts', 'installshare', 'analytics', 'offlinequeue', 'account',
]);

const defaultEnv = () => {
  try {
    return (import.meta.env && import.meta.env.VITE_GA_MEASUREMENT_ID) || '';
  } catch {
    return '';
  }
};

const state = { initialized: false, lastPath: null, id: '' };

/** Validated measurement id, or '' when unset/malformed. */
export function getMeasurementId(raw = defaultEnv()) {
  const id = String(raw || '').trim();
  return GA_ID_PATTERN.test(id) ? id : '';
}

export function isAnalyticsConfigured(raw = defaultEnv()) {
  return getMeasurementId(raw) !== '';
}

/** @returns {'granted'|'denied'|null} null = no choice made yet */
export function readConsent(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const value = storage && storage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

function writeConsent(value, storage) {
  try {
    storage && storage.setItem(CONSENT_KEY, value);
    return true;
  } catch {
    return false; // storage blocked: the choice simply does not persist
  }
}

/** "/about/" + "?x=1" -> "/about"; "/?tab=feed" kept; any other query dropped. */
export function sanitizePath(pathname, search = '') {
  const path = String(pathname || '/').split(/[?#]/)[0] || '/';
  const clean = path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
  const tab = new URLSearchParams(search || '').get('tab');
  if (clean === '/' && tab && SAFE_TABS.has(tab)) return `/?tab=${tab}`;
  return clean;
}

function ensureGtag(win) {
  win.dataLayer = win.dataLayer || [];
  if (typeof win.gtag !== 'function') {
    // gtag.js reads `arguments` objects from dataLayer, so a rest-args push would not work
    win.gtag = function gtag() {
      win.dataLayer.push(arguments); // eslint-disable-line prefer-rest-params
    };
  }
  return win.gtag;
}

/**
 * Loads GA4 if (and only if) it is configured and consent was granted.
 *
 * @returns {boolean} whether analytics is active after the call
 */
export function initAnalytics({
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  storage,
  measurementId = defaultEnv(),
} = {}) {
  const id = getMeasurementId(measurementId);
  if (!win || !doc || !id) return false;
  if (readConsent(storage === undefined ? win.localStorage : storage) !== 'granted') return false;
  if (state.initialized && state.id === id) return true;

  const gtag = ensureGtag(win);
  // Consent Mode: everything defaults to denied; only measurement is granted.
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', id, {
    send_page_view: false, // page views are sent explicitly and sanitized
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  win[`ga-disable-${id}`] = false;
  if (!doc.querySelector(`script[src^="${SCRIPT_BASE}"]`)) {
    const script = doc.createElement('script');
    script.async = true;
    script.src = `${SCRIPT_BASE}?id=${encodeURIComponent(id)}`;
    doc.head.appendChild(script);
  }

  state.initialized = true;
  state.id = id;
  return true;
}

/**
 * Report a page view. No-op unless analytics is active and the path changed.
 *
 * @param {string} pathname
 * @param {string} [search]
 * @param {{ win?: object, title?: string }} [options]
 */
export function trackPageView(pathname, search = '', { win = typeof window !== 'undefined' ? window : null, title = '' } = {}) {
  if (!win || !state.initialized || typeof win.gtag !== 'function') return false;
  if (win[`ga-disable-${state.id}`] === true) return false;

  const path = sanitizePath(pathname, search);
  if (state.lastPath === path) return false;
  state.lastPath = path;

  win.gtag('event', 'page_view', {
    page_path: path,
    page_title: String(title || '').slice(0, 120),
  });
  return true;
}

/** Record the visitor's choice; "granted" initializes, "denied" switches everything off. */
export function setConsent(value, options = {}) {
  const win = options.win || (typeof window !== 'undefined' ? window : null);
  const storage = options.storage === undefined ? (win && win.localStorage) : options.storage;
  const choice = value === 'granted' ? 'granted' : 'denied';

  writeConsent(choice, storage);

  if (choice === 'granted') {
    initAnalytics({ ...options, win, storage });
  } else if (win) {
    const id = state.id || getMeasurementId(options.measurementId);
    if (id) win[`ga-disable-${id}`] = true;
    if (typeof win.gtag === 'function') {
      win.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    }
    state.lastPath = null;
  }

  if (win && typeof win.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    win.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: { consent: choice } }));
  }
  return choice;
}

/** Test hook: forget in-memory state. */
export function resetAnalyticsStateForTests() {
  state.initialized = false;
  state.lastPath = null;
  state.id = '';
}
