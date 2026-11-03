/**
 * Terms of use content.
 *
 * Plain-language terms that match what the product does today. Like the
 * privacy policy it names no legal entity, address, fee or governing law,
 * because none has been provided: the operator of a deployment must add those
 * (and have the text reviewed) before relying on it.
 */

/** Date this text was last reviewed against the product. */
export const TERMS_LAST_UPDATED = '3 November 2026';

/**
 * @param {{ contactEmail?: string }} [options]
 * @returns {{ updated: string, intro: string, sections: { id: string, heading: string, paragraphs?: string[], items?: string[] }[] }}
 */
export function getTerms({ contactEmail = '' } = {}) {
  const contactParagraph = contactEmail
    ? `Questions about these terms can be sent to ${contactEmail}.`
    : 'The operator of this deployment has not published a contact address yet, so a contact route cannot be listed here.';

  return {
    updated: TERMS_LAST_UPDATED,
    intro:
      'These terms describe how Smart Student Companion may be used. By using the app you agree to them. If you do not agree, please do not use it. The organisation operating a particular deployment has not been named here because no operator details have been provided.',
    sections: [
      {
        id: 'service',
        heading: 'What the service is',
        paragraphs: [
          'Smart Student Companion helps college students in Mumbai compare commute options, read community-reported conditions, coordinate shared journeys, scan timetables and plan study time. It is provided as-is, for personal, non-commercial use by students.',
        ],
      },
      {
        id: 'estimates',
        heading: 'Travel information is an estimate',
        paragraphs: [
          'Routes, travel times, fares and reliability scores are estimates built from bundled schedule data, open routing services, weather forecasts and student reports. They are not live vehicle tracking and are not official transit information. Always allow extra time, and follow instructions from transit operators and staff.',
        ],
      },
      {
        id: 'accounts',
        heading: 'Accounts',
        items: [
          'You can use the planner, read alerts and search transit without an account.',
          'Some features (saved commutes, notifications, the timetable scanner and AI study plans) need a student account. Give accurate details and keep your password private; you are responsible for activity under your account.',
          'Tell the operator if you believe your account has been used without your permission.',
        ],
      },
      {
        id: 'community',
        heading: 'Community content and acceptable use',
        paragraphs: ['Reports, ride groups and feedback you post are visible to other users under the display name you choose. When you post, you agree that you will not:'],
        items: [
          'post false, misleading or deliberately alarming reports about delays or incidents;',
          'share home addresses, precise locations, phone numbers or other personal information about yourself or anyone else;',
          'harass, threaten or impersonate other people, or post hateful, unlawful or sexually explicit material;',
          'upload files that are not genuine images, or content that contains malware;',
          'scrape the service, probe it for weaknesses, overload it, or bypass rate limits, sign-in or other protections;',
          'use the service to run bulk, automated or commercial activity.',
        ],
      },
      {
        id: 'moderation',
        heading: 'Moderation',
        paragraphs: [
          'Reports fade as they age and expire. Administrators may remove content or restrict accounts that break these terms or put other students at risk.',
        ],
      },
      {
        id: 'third-parties',
        heading: 'Third-party services',
        paragraphs: [
          'The app relies on services such as OpenStreetMap, OSRM and Open-Meteo, and optionally Google sign-in and AI providers. They have their own terms and may be unavailable or change. The privacy policy lists what each one receives.',
        ],
      },
      {
        id: 'availability',
        heading: 'Availability and changes',
        paragraphs: [
          'The service may be interrupted, limited or changed at any time, including features, supported areas and usage limits. We may update these terms; the date above shows when they were last reviewed, and continued use means you accept the current version.',
        ],
      },
      {
        id: 'liability',
        heading: 'Disclaimers and liability',
        paragraphs: [
          'The service is provided "as is" and "as available", without promises that it will be accurate, uninterrupted or error-free. To the extent the law allows, the operator is not liable for missed classes, delays, losses or other harm resulting from reliance on the app. Nothing here limits rights you have under law that cannot be excluded.',
        ],
      },
      {
        id: 'privacy',
        heading: 'Your data',
        paragraphs: [
          'How personal data is handled is explained in the privacy policy, which forms part of these terms.',
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
