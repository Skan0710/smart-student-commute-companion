import React from 'react';
import { Info } from 'lucide-react';

/**
 * SampleDataBanner - honest disclosure that a screen is showing demo content.
 *
 * Guests (no student session) see sample courses, plans, goals and journeys so
 * the product is explorable; this banner makes sure that content is never
 * mistaken for the student's own data.
 *
 * @param {Object} props
 * @param {Function} [props.onSignIn] - Opens the sign-in screen; omit to hide the button
 * @param {string} [props.what='data'] - What signing in unlocks ("courses, goals and plans")
 * @param {string} [props.className]
 */
export default function SampleDataBanner({ onSignIn, what = 'data', className = '' }) {
  return (
    <div
      role="note"
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 dark:border-indigo-400/30 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-3 text-sm text-indigo-900 dark:text-indigo-100 ${className}`}
    >
      <Info className="w-4 h-4 shrink-0 text-indigo-700 dark:text-indigo-300" aria-hidden="true" />
      <p className="flex-1 min-w-[220px]">
        <strong className="font-semibold">You're viewing sample data.</strong>{' '}
        Sign in to see and manage your own {what}.
      </p>
      {onSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          className="shrink-0 min-h-9 px-4 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
        >
          Sign in
        </button>
      )}
    </div>
  );
}
