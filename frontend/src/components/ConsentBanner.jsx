import React, { useEffect, useRef, useState } from 'react';
import {
  OPEN_CONSENT_EVENT,
  isAnalyticsConfigured,
  readConsent,
  setConsent,
} from '../services/analytics.js';

/**
 * ConsentBanner - analytics choice
 *
 * Renders nothing unless Google Analytics is configured for this build and the
 * visitor has not chosen yet (or reopens it from the footer's "Analytics
 * settings"). "Accept" and "Decline" are equally prominent; declining is as
 * easy as accepting and keeps analytics off. It is a non-modal region at the
 * bottom of the screen and announces itself to the mobile sticky CTA through
 * `data-consent-open` so the two never overlap.
 */
export default function ConsentBanner() {
  const configured = isAnalyticsConfigured();
  const [open, setOpen] = useState(false);
  const acceptRef = useRef(null);

  useEffect(() => {
    if (!configured) return undefined;
    setOpen(readConsent() === null);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, [configured]);

  useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute('data-consent-open', 'true');
    else root.removeAttribute('data-consent-open');
    return () => root.removeAttribute('data-consent-open');
  }, [open]);

  if (!configured || !open) return null;

  const choose = (value) => {
    setConsent(value);
    setOpen(false);
  };

  return (
    <section
      aria-label="Analytics choice"
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[0_-8px_24px_rgba(15,23,42,0.12)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          May we use Google Analytics to count page views? Only the page name is sent: never routes, areas or account
          details. Nothing loads unless you accept.{' '}
          <a
            href="/privacy#analytics"
            className="font-semibold text-blue-700 dark:text-blue-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Read the privacy policy
          </a>
          .
        </p>
        <div className="flex gap-3 shrink-0">
          <button
            type="button"
            ref={acceptRef}
            onClick={() => choose('granted')}
            className="min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            Accept analytics
          </button>
          <button
            type="button"
            onClick={() => choose('denied')}
            className="min-h-[44px] px-5 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
          >
            Decline
          </button>
        </div>
      </div>
    </section>
  );
}

/** Footer control to reopen the choice. Renders nothing when analytics is not configured. */
export function AnalyticsSettingsButton({ className = '' }) {
  if (!isAnalyticsConfigured()) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CONSENT_EVENT))}
      className={`underline-offset-2 hover:underline hover:text-blue-700 dark:hover:text-blue-300 ${className}`}
    >
      Analytics settings
    </button>
  );
}
