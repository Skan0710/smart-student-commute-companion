import React, { useEffect, useState } from 'react';
import ThankYouPanel from '../../components/ThankYouPanel.jsx';
import { THANK_YOU_TYPES } from '../../content/thankYou.js';

/**
 * ThankYouPage - public confirmation screen (/thank-you?type=alert|timetable|feedback)
 *
 * Marked noindex (it is a post-submission page, not content) and excluded from
 * the sitemap. The prerendered HTML is the generic confirmation; in the browser
 * the `type` query parameter selects the specific message. Unknown values fall
 * back to the generic one, and the value is only ever compared against a fixed
 * list, never rendered.
 */
export default function ThankYouPage() {
  const [type, setType] = useState(null);

  useEffect(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get('type');
      if (THANK_YOU_TYPES.includes(requested)) setType(requested);
    } catch {
      // Malformed query string: the generic confirmation is the safe fallback.
    }
  }, []);

  return (
    <div className="py-4 sm:py-10">
      <h1 className="sr-only">Thank you</h1>
      <ThankYouPanel type={type} autoFocus={false} />
    </div>
  );
}
