/**
 * Thank-you / submission confirmation content.
 *
 * One confirmation screen serves the three things a student can submit:
 * a live transit alert, a scanned timetable and route feedback. Pure data so the
 * in-app dialog and the public /thank-you page say exactly the same thing. Every
 * "what happens next" line describes behaviour the product really has.
 */

/** Submission types the confirmation screen understands. */
export const THANK_YOU_TYPES = ['alert', 'timetable', 'feedback'];

const GENERIC = {
  type: 'generic',
  heading: 'Thank you!',
  message: 'Your submission was received.',
  nextSteps: ['Head back to the planner to continue with your commute.'],
  primary: { label: 'Plan my commute', href: '/', screen: 'planner' },
  secondary: { label: 'See how it works', href: '/about' },
};

export const THANK_YOU = {
  alert: {
    type: 'alert',
    heading: 'Alert shared. Thank you!',
    message: 'Your report is now visible to other students travelling your way.',
    nextSteps: [
      'Other students can confirm that it is still happening or mark it as cleared.',
      'It stays visible while it is fresh and expires on its own as it ages.',
      'If you were signed in, you can edit or delete it from Live alerts.',
    ],
    primary: { label: 'View live alerts', href: '/?tab=feed', screen: 'feed' },
    secondary: { label: 'Plan my commute', href: '/', screen: 'planner' },
  },
  timetable: {
    type: 'timetable',
    heading: 'Timetable saved',
    message: 'Your classes were added to your schedule.',
    nextSteps: [
      'Check the times once more: a blurry or low-contrast image can be misread.',
      'Edit or delete any slot that looks wrong from the Schedule tab in Academics.',
      'Plan a commute that gets you to campus before your first class.',
    ],
    primary: { label: 'Open my schedule', href: '/?tab=academics', screen: 'academics' },
    secondary: { label: 'Plan my commute', href: '/', screen: 'planner' },
  },
  feedback: {
    type: 'feedback',
    heading: 'Feedback received. Thank you!',
    message: 'Your rating helps improve how routes are recommended.',
    nextSteps: [
      'Feedback is stored without your name or email.',
      'Ratings from many students are combined, so one answer never decides a recommendation.',
      'You can rate any later recommendation the same way.',
    ],
    primary: { label: 'Plan another commute', href: '/', screen: 'planner' },
    secondary: { label: 'See how it works', href: '/about' },
  },
};

/**
 * @param {string|null|undefined} type
 * @returns {typeof GENERIC}
 */
export function getThankYou(type) {
  return THANK_YOU[type] || GENERIC;
}
