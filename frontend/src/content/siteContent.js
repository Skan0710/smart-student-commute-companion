/**
 * Public site content — the single source of truth for page metadata and copy.
 *
 * Pure data (no JSX, no browser APIs) so the React pages, the runtime
 * <head> manager and the build-time prerender all read exactly the same
 * words. Every claim here must be verifiable from the product itself; do not
 * add pricing, response-time promises, customer stories or reviews unless
 * they are real and can be substantiated.
 */

export const SITE_NAME = 'Smart Student Commute Companion';

/** Social/preview image (PNG: most link scrapers reject SVG). */
export const SOCIAL_IMAGE = {
  path: '/icons/icon-maskable-512x512.png',
  width: 512,
  height: 512,
  alt: 'Smart Student Commute Companion logo: stacked route layers on a green background',
};

/**
 * Indexable and non-indexable pages. `path` is the canonical path.
 * Titles are unique per page; descriptions stay under ~160 characters.
 */
export const PAGES = {
  home: {
    id: 'home',
    path: '/',
    title: 'Mumbai Student Commute Planner | Smart Student Commute Companion',
    description:
      'Plan your Mumbai college commute across local trains, metro and buses. Compare routes with weather and live student reports, using area names only.',
  },
  about: {
    id: 'about',
    path: '/about',
    title: 'How It Works | Smart Student Commute Companion',
    description:
      'See how Smart Student Commute Companion compares Mumbai train, metro and bus routes for college students using schedules, OpenStreetMap routing, weather and reports.',
    breadcrumb: 'How it works',
  },
  notFound: {
    id: 'notfound',
    path: null,
    title: 'Page Not Found | Smart Student Commute Companion',
    description: 'The page you requested does not exist. Head back to the Mumbai student commute planner.',
    noindex: true,
  },
};

/**
 * In-app destinations that genuinely exist (see NAV_ITEMS in the app).
 * Used for internal links on public pages; keep `tab` ids in sync with the app.
 */
export const APP_LINKS = {
  planner: { href: '/', label: 'Plan a commute' },
  liveAlerts: { href: '/?tab=feed', label: 'Live student alerts' },
  travelTogether: { href: '/?tab=together', label: 'Travel Together groups' },
  transitSearch: { href: '/?tab=transit', label: 'Search transit options' },
};

export const ABOUT = {
  heading: 'Plan your Mumbai college commute with fewer surprises',
  intro:
    'Compare local train, metro and bus options to your campus, with weather and live reports from other students factored in. You can plan a route without creating an account.',
  primaryCta: { label: 'Plan my commute', href: '/' },
  secondaryCta: { label: 'See how it works', href: '#how-it-works' },

  stepsHeading: 'How it works',
  steps: [
    {
      title: 'Tell it where you start and where you study',
      body:
        'Enter a neighbourhood or station (for example Andheri East or Dadar) and your college. Choose a priority: balanced, fastest, cheapest or rain-safe, and set your walking and budget limits.',
    },
    {
      title: 'Compare routes you can explain',
      body:
        'Routes are scored on travel time, reliability, walking effort, disruption risk, weather and cost. Each recommendation shows its trade-offs, so you can see why one option ranks above another.',
    },
    {
      title: 'Check what other students are seeing',
      body:
        'Students post short reports about waterlogging, crowding or auto shortages. Reports fade as they age and are labelled as community-reported, never as officially verified.',
    },
  ],

  featuresHeading: 'What you can do',
  features: [
    {
      title: 'Plan routes',
      body: 'Get ranked options across train, metro, bus and walking for your own commute.',
      link: APP_LINKS.planner,
    },
    {
      title: 'Follow live student alerts',
      body: 'See and confirm community reports about delays and conditions along your corridor.',
      link: APP_LINKS.liveAlerts,
    },
    {
      title: 'Travel together',
      body: 'Find or start a shared commute group. Groups use area-level meeting points, not home addresses.',
      link: APP_LINKS.travelTogether,
    },
    {
      title: 'Search transit',
      body: 'Look up stations, stops and services without planning a full journey.',
      link: APP_LINKS.transitSearch,
    },
  ],

  sourcesHeading: 'Where the information comes from',
  sourcesIntro:
    'The app combines bundled GTFS-format schedule data with open services. When one is unavailable the app says so instead of guessing.',
  sources: [
    { name: 'OpenStreetMap', use: 'map tiles and place search (Nominatim)' },
    { name: 'OSRM', use: 'road and walking route geometry' },
    { name: 'Open-Meteo', use: 'weather and rain forecasts' },
    { name: 'Student community reports', use: 'live conditions, shown as community-reported' },
  ],

  closing: {
    heading: 'Ready to plan your next commute?',
    body: 'It takes a starting area and your college. No account needed.',
    cta: { label: 'Plan my commute', href: '/' },
  },
};

export const NOT_FOUND = {
  heading: 'We could not find that page',
  body: 'The address may be mistyped or the page may have moved. These places will get you back on track.',
  primaryCta: { label: 'Plan my commute', href: '/' },
  linksHeading: 'Popular destinations',
  links: [
    { label: 'How it works', href: '/about' },
    APP_LINKS.liveAlerts,
    APP_LINKS.travelTogether,
    APP_LINKS.transitSearch,
  ],
};

/** Footer links shown on every public page and in the app footer. */
export const FOOTER_LINKS = [
  { label: 'How it works', href: '/about' },
];

/**
 * Breadcrumb trail for a nested public page: ancestors first, current page
 * last. Only pages that really sit below the home page have one.
 *
 * @param {string} pageId
 * @returns {{ label: string, href?: string, path: string }[]}
 */
export function getBreadcrumbTrail(pageId) {
  const page = Object.values(PAGES).find((candidate) => candidate.id === pageId);
  if (!page || !page.breadcrumb || !page.path) return [];
  return [
    { label: 'Home', href: '/', path: '/' },
    { label: page.breadcrumb, path: page.path },
  ];
}
