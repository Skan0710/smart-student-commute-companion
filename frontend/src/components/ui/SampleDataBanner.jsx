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
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 dark:border-blue-400/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-900 dark:text-blue-100 ${className}`}
    >
      <Info className="w-4 h-4 shrink-0 text-blue-800 dark:text-blue-300" aria-hidden="true" />
      <p className="flex-1 min-w-[220px]">
        <strong className="font-semibold">You're viewing sample data.</strong>{' '}
        Sign in to see and manage your own {what}.
      </p>
      {onSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          className="hover-lift shrink-0 min-h-9 px-4 py-1.5 rounded-xl bg-[#800020] hover:bg-[#68001a] dark:bg-[#0047ff] dark:hover:bg-[#1e5cff] text-white text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
        >
          Sign in
        </button>
      )}
    </div>
  );
}
