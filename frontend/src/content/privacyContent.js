/**
 * Privacy policy content.
 *
 * Every statement describes what the code in this repository actually does
 * (see the verification checks in verify-frontend.js, which assert the third
 * parties and storage keys named here exist in the code). Facts the operator
 * has not decided are stated as such, never filled in: there is no legal
 * entity name, postal address, retention period or response time here
 * because none has been provided.
 */

/** Date this text was last reviewed against the code. */
export const PRIVACY_LAST_UPDATED = '19 October 2026';

/**
 * Third parties the app talks to, split by who makes the request.
 * `code` is a string that must appear in the source so the list cannot rot.
 */
export const THIRD_PARTIES = {
  fromBrowser: [
    { name: 'OpenStreetMap tile servers', purpose: 'draw the map', receives: 'your IP address and the map area you view', code: 'tile.openstreetmap.org' },
    { name: 'Google Fonts', purpose: 'load the Inter and Outfit typefaces', receives: 'your IP address and browser details', code: 'fonts.googleapis.com' },
    { name: 'unpkg (Leaflet stylesheet)', purpose: 'style the map', receives: 'your IP address and browser details', code: 'unpkg.com/leaflet' },
  ],
  fromServer: [
    { name: 'OpenStreetMap Nominatim', purpose: 'turn the area and college names you type into map coordinates', receives: 'the place text you entered (not your account details)', code: 'nominatim.openstreetmap.org' },
    { name: 'OSRM (Open Source Routing Machine)', purpose: 'draw road and walking routes', receives: 'origin and destination coordinates', code: 'router.project-osrm.org' },
    { name: 'Open-Meteo', purpose: 'fetch weather and rain forecasts', receives: 'area coordinates', code: 'api.open-meteo.com' },
  ],
  optional: [
    { name: 'Google Gemini', purpose: 'word the explanation of a route, only when the operator has configured it', receives: 'route facts such as modes, times and fares: no names, emails, account ids or tokens', code: 'generativelanguage.googleapis.com' },
    { name: 'Google Sign-In', purpose: 'let you sign in with your Google account, only when the operator has configured it', receives: 'your sign-in request; we receive your verified email address and name from Google', code: 'accounts.google.com/gsi/client' },
  ],
};

/** Browser storage the app uses, with what each holds. */
export const DEVICE_STORAGE = [
  { key: 'smart_commute_auth_session', holds: 'your sign-in session (a token and profile) if you are signed in' },
  { key: 'smart_commute_user_token', holds: 'a random anonymous identifier used when you vote on community reports' },
  { key: 'smart_commute_saved_commutes', holds: 'commutes you saved' },
  { key: 'smart_commute_recent_transit_searches', holds: 'your recent transit searches' },
  { key: 'smart_commute_app_preferences', holds: 'display and alert preferences' },
  { key: 'smart_commute_theme_preference', holds: 'light or dark theme' },
  { key: 'smart_commute_notification_read_state', holds: 'which notifications you have read' },
  { key: 'smart_commute_offline_queue', holds: 'community reports waiting to be sent when you are back online' },
  { key: 'smart_commute_pwa_analytics', holds: 'install and offline-use counters that stay on your device' },
];

/**
 * @param {{ analyticsEnabled?: boolean, contactEmail?: string }} [options]
 * @returns {{ updated: string, intro: string, sections: { id: string, heading: string, paragraphs?: string[], items?: string[] }[] }}
 */
export function getPrivacyPolicy({ analyticsEnabled = false, contactEmail = '' } = {}) {
  const analyticsSection = analyticsEnabled
    ? {
        id: 'analytics',
        heading: 'Analytics',
        paragraphs: [
          'This deployment can measure how the site is used with Google Analytics 4. It is off until you choose "Accept analytics" in the consent banner, and nothing is sent to Google Analytics before that. If you decline, no analytics script is loaded.',
          'When enabled, only the page you view (for example "planner" or "about") is reported. Routes, areas, colleges, reports, account details and other commute inputs are never sent. You can change your choice at any time with "Analytics settings" in the footer.',
        ],
      }
    : {
        id: 'analytics',
        heading: 'Analytics and tracking',
        paragraphs: [
          'This deployment does not load analytics, advertising or social-media trackers. The only usage counters (installs, offline use, cache hits) stay in your browser and are shown to you on the in-app analytics screen.',
        ],
      };

  const contactParagraph = contactEmail
    ? `To ask about, correct or delete your data, email ${contactEmail}.`
    : 'The operator of this deployment has not published a privacy contact address yet, so a contact route cannot be listed here.';

  return {
    updated: PRIVACY_LAST_UPDATED,
    intro:
      'This policy explains what Smart Student Commute Companion stores and shares when you plan a commute, use the community features or create an account. It describes how the software behaves; the organisation operating a particular deployment has not been named here because no operator details have been provided.',
    sections: [
      {
        id: 'summary',
        heading: 'The short version',
        items: [
          'You can plan routes, read live alerts and search transit without an account.',
          'The app does not read your device location. You type an area (for example Andheri East) and your college.',
          'The app sets no cookies. It keeps a few settings in your browser storage, which you can clear.',
          'Map, routing and weather services receive place names or coordinates, never your name or email.',
          'Community reports and ride groups are visible to other users under a display name you choose.',
        ],
      },
      {
        id: 'information',
        heading: 'Information we handle',
        paragraphs: ['Depending on what you do, the app handles the following.'],
        items: [
          'Account details (optional): your email address, full name and college name. Your password is stored only as a salted scrypt hash, never in readable form. If you sign in with Google, we receive your verified email address and name from Google; your Google password is never shared with us.',
          'Commute inputs: the starting area, college, departure or arrival time, travel priority, walking tolerance and budget you enter. They are sent to the server to calculate routes. If you are signed in and use personalised features, commute preferences and related records are stored with your account.',
          'Community content: live reports (area, travel mode, message and the display name you choose), ride groups (areas, departure time, notes and display name) and route feedback (useful or not, tags and an optional comment). Reports and groups are visible to other users. Feedback is stored without your name or email. If you are signed in when you post a report or group, the server records your account as its owner so only you (or an administrator) can change or delete it.',
          'Technical information: your IP address is used briefly to limit abuse. When you vote on a report, a random browser identifier is stored as the vote key; if your browser does not provide one, your IP address may be used instead.',
        ],
      },
      {
        id: 'device',
        heading: 'What stays on your device',
        paragraphs: [
          'The app sets no cookies. It uses your browser\'s local storage and a service worker (for offline use and faster loading) to remember the following. Clearing your browser data removes all of it.',
        ],
        items: DEVICE_STORAGE.map((entry) => `${entry.key}: ${entry.holds}`),
      },
      {
        id: 'third-parties',
        heading: 'Services that receive information',
        paragraphs: [
          'Your browser contacts these services directly when you open the app, so they can see your IP address:',
        ],
        items: THIRD_PARTIES.fromBrowser.map((p) => `${p.name} (to ${p.purpose}): receives ${p.receives}.`),
      },
      {
        id: 'third-parties-server',
        heading: 'Services our server contacts for you',
        paragraphs: ['To plan a route, the server sends the minimum needed to these services. They do not receive your account details:'],
        items: THIRD_PARTIES.fromServer.map((p) => `${p.name} (to ${p.purpose}): receives ${p.receives}.`),
      },
      {
        id: 'third-parties-optional',
        heading: 'Optional services',
        paragraphs: ['These are used only if the operator of this deployment has switched them on:'],
        items: THIRD_PARTIES.optional.map((p) => `${p.name} (to ${p.purpose}): ${p.receives}.`),
      },
      analyticsSection,
      {
        id: 'retention',
        heading: 'Keeping and deleting data',
        paragraphs: [
          'Live reports fade with age and stop being shown once they expire. The operator has not set retention periods for other stored records, and there is currently no self-service button to delete an account or community content. Signing out removes your session from your device; deleting an account or its records requires a request to the operator.',
        ],
      },
      {
        id: 'choices',
        heading: 'Your choices',
        items: [
          'Plan routes and read alerts without creating an account.',
          'Sign out at any time from the Account screen.',
          'Clear your browser data to remove everything stored on your device.',
          'Install or uninstall the app as you prefer; offline copies live in your browser.',
          ...(analyticsEnabled ? ['Decline analytics, or change your mind later, from "Analytics settings" in the footer.'] : []),
        ],
      },
      {
        id: 'contact',
        heading: 'Contact',
        paragraphs: [contactParagraph],
      },
    ],
  };
}
