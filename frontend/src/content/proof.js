/**
 * Transparency and "proof" content for the public pages.
 *
 * The rule for everything in this file: a claim appears only if it is a measured
 * number you can reproduce, a fact from the product's own data, or is plainly
 * labelled illustrative. Nothing here is a made-up statistic, testimonial or
 * endorsement. (verify-frontend.js enforces the structure below.)
 */

import { buildOsmDirectionsUrl } from '../utils/mapLinks.js';

// ---------------------------------------------------------------------------
// 1. Response-time transparency (measured, reproducible)
// ---------------------------------------------------------------------------

/**
 * Result of `node backend/scripts/bench_route_evaluation.js`: the server-side
 * step that ranks a student's candidate routes. Re-run it on your own hardware
 * before quoting these numbers elsewhere. verify-frontend.js re-runs the
 * benchmark and fails if the "under 15 ms" claim stops being true.
 */
export const PERFORMANCE = {
  thresholdMs: 15,
  measured: {
    candidateRoutes: 5,
    runs: 2000,
    medianMs: 0.02,
    p95Ms: 0.05,
    slowestMs: 2,
    date: '3 November 2026',
    machine: 'a developer laptop (Windows, Node 24)',
  },
  command: 'node backend/scripts/bench_route_evaluation.js',
  heading: 'Fast where we control it, upfront about the rest',
  summary:
    'Ranking your route options takes under 15 milliseconds on the server. That is the step the app controls end to end.',
  detail:
    'Measured by ranking five candidate routes 2,000 times: the median run took about 0.02 ms, 95% finished within about 0.05 ms, and the slowest single run took about 2 ms.',
  excludes:
    'This covers scoring only. Looking up places, road geometry and weather uses OpenStreetMap, OSRM and Open-Meteo over the network, so the full journey plan depends on those services and your connection.',
  offline:
    'Offline: once you have opened the app, its pages load without a connection, and community reports you write while offline wait in your Offline Queue and send when you are back online. Route plans themselves need a connection.',
};

// ---------------------------------------------------------------------------
// 2. Campus hubs with OpenStreetMap walking directions
// ---------------------------------------------------------------------------

/**
 * Coordinates are the app's own area-level points (backend/services/
 * geocodingService.js), approximate by design: they are not building entrances
 * and not anyone's location. Directions open on openstreetmap.org when clicked.
 */
export const CAMPUS_HUBS = [
  {
    id: 'djsce',
    college: 'DJ Sanghvi College of Engineering',
    area: 'Vile Parle West',
    arrival: 'Western Railway local to Vile Parle, then walk or take an auto.',
    from: { label: 'Vile Parle station', lat: 19.0999, lon: 72.8439 },
    to: { label: 'DJSCE', lat: 19.1075, lon: 72.8372 },
  },
  {
    id: 'vjti',
    college: 'VJTI',
    area: 'Matunga',
    arrival: 'Central Railway local to Matunga, then a short walk.',
    from: { label: 'Matunga station', lat: 19.027, lon: 72.854 },
    to: { label: 'VJTI', lat: 19.0223, lon: 72.8561 },
  },
  {
    id: 'spit',
    college: 'SPIT (Bhavan\'s Campus)',
    area: 'Andheri West',
    arrival: 'Western Railway local to Andheri, or Metro to Azad Nagar / D.N. Nagar, then walk or take an auto.',
    from: { label: 'Andheri station', lat: 19.1197, lon: 72.8464 },
    to: { label: 'SPIT', lat: 19.1232, lon: 72.8361 },
  },
];

/**
 * @returns {{ id: string, college: string, area: string, arrival: string, from: object, to: object, walkUrl: string|null }[]}
 */
export function getCampusHubs() {
  return CAMPUS_HUBS.map((hub) => ({
    ...hub,
    walkUrl: buildOsmDirectionsUrl({ origin: hub.from, destination: hub.to, profile: 'foot' }),
  }));
}

// ---------------------------------------------------------------------------
// 3. Student voices (only real, consented quotes)
// ---------------------------------------------------------------------------

/**
 * Real student quotes. EMPTY ON PURPOSE: none have been collected, and none may
 * be invented. To publish one, add an object with every field below, with the
 * student's written permission (see the privacy policy: names are never
 * published without consent):
 *
 *   { quote: 'text in their own words', author: 'First name + initial, or "Student"',
 *     college: 'e.g. VJTI', collectedOn: '2026-11-03', consent: true }
 *
 * The section renders them automatically; verify-frontend.js rejects an entry
 * without `consent: true`, a date, a college and a quote.
 *
 * @type {{ quote: string, author: string, college: string, collectedOn: string, consent: true }[]}
 */
export const TESTIMONIALS = [];

export const HUBS_HEADING = 'Built for students at Mumbai campuses';

export const STUDENT_VOICES = {
  emptyTitle: 'Student stories will appear here',
  emptyBody:
    'We only publish quotes from students who have agreed to be quoted, and none have been added yet. Tried the app? Rate a recommendation inside the planner and tell us what worked.',
};

// ---------------------------------------------------------------------------
// 4. Worked example (illustrative, no statistics)
// ---------------------------------------------------------------------------

export const CASE_STUDY = {
  label: 'Illustrative scenario',
  disclaimer:
    'A worked example of how the ranking behaves. It is not a measured result and not a real student\'s story, so it contains no statistics.',
  heading: 'One trip, two ways: why the fastest option is not always recommended',
  steps: [
    {
      title: 'A dry morning',
      body:
        'Route A is quickest on paper: a local train, then a walk through a subway. Route B takes a little longer by metro and a short auto ride. With no rain and no reports, Route A ranks first.',
    },
    {
      title: 'Heavy rain and a student report',
      body:
        'The forecast turns wet and another student reports waterlogging near that subway. Route A now carries a weather and disruption penalty, and the penalty outweighs its time advantage.',
    },
    {
      title: 'The plan changes, and says why',
      body:
        'Route B moves to the top. Each recommendation lists its trade-offs, so you can see the reason instead of trusting a black box, and still choose Route A if you prefer it.',
    },
  ],
  cta: { label: 'Try it with your own commute', href: '/' },
};
