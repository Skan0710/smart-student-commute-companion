import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Share2 } from 'lucide-react';
import { getThankYou } from '../content/thankYou.js';

/**
 * ThankYouPanel - submission confirmation
 *
 * Shared by the in-app dialog and the public /thank-you page. It tells the
 * student what was received and what happens next, offers the next actions as
 * real links (or in-app navigation when `onNavigate` is given), and lets them
 * share the app with classmates (Web Share where available, otherwise copy the
 * link). Focus moves to the heading so screen-reader users hear the result.
 *
 * @param {Object} props
 * @param {'alert'|'timetable'|'feedback'|string|null} [props.type]
 * @param {(screenId: string) => void} [props.onNavigate] - in-app navigation by screen id
 * @param {() => void} [props.onDone] - called after an in-app action (e.g. close the dialog)
 * @param {boolean} [props.autoFocus=true]
 * @param {string} [props.shareUrl] - overrides the link shared (defaults to the site origin)
 */
export default function ThankYouPanel({ type = null, onNavigate, onDone, autoFocus = true, shareUrl = '' }) {
  const content = getThankYou(type);
  const headingRef = useRef(null);
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    if (autoFocus) headingRef.current?.focus();
  }, [autoFocus, content.type]);

  const runAction = (action) => (event) => {
    if (onNavigate && action.screen) {
      event.preventDefault();
      onNavigate(action.screen);
      onDone?.();
    }
  };

  const handleShare = async () => {
    const url = shareUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const data = { title: 'Smart Student Companion', text: 'Plan your Mumbai college commute with fewer surprises.', url };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(data);
        setShareStatus('Shared.');
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareStatus('Link copied to your clipboard.');
      } else {
        setShareStatus('Sharing is not available in this browser.');
      }
    } catch (error) {
      // Dismissing the share sheet is not an error worth reporting.
      if (error?.name !== 'AbortError') setShareStatus('Could not share right now.');
    }
  };

  const linkClass =
    'text-sm font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <section aria-labelledby="thank-you-heading" className="text-center max-w-xl mx-auto">
      <span
        className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center motion-safe:animate-bounce"
        aria-hidden="true"
      >
        <CheckCircle2 className="w-9 h-9" />
      </span>

      <h2
        id="thank-you-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-5 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white outline-none"
      >
        {content.heading}
      </h2>
      <p className="mt-2 text-base text-slate-700 dark:text-slate-300">{content.message}</p>

      <div className="mt-6 text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">What happens next</h3>
        <ol className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {content.nextSteps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <a
          href={content.primary.href}
          onClick={runAction(content.primary)}
          className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          {content.primary.label}
          <ArrowRight className="w-5 h-5" aria-hidden="true" />
        </a>
        <a href={content.secondary.href} onClick={runAction(content.secondary)} className={`${linkClass} px-2 py-3`}>
          {content.secondary.label}
        </a>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
          Share with classmates
        </button>
        <p role="status" aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs text-slate-600 dark:text-slate-400">
          {shareStatus}
        </p>
      </div>
    </section>
  );
}
