import React from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * ThemeToggle - Accessible visual theme switcher
 *
 * Toggles between premium light (#F8FAFC base, #FFFFFF surfaces) and complete
 * dark (#0F172A base, #1E293B surfaces) themes.
 *
 * Accessibility & Design guidelines:
 * - Visually clear sun/moon iconography
 * - NEVER displays confusing literal "ON" or "OFF" text
 * - Touch-target comfortable (min 44px)
 * - Clear accessible name and title
 * - Smooth transition, visible keyboard focus ring
 *
 * @param {Object} props
 * @param {'light'|'dark'|'system'} props.theme - Active theme state
 * @param {() => void} props.onToggle - Handler called when user toggles
 * @param {string} [props.className] - Additional classes
 * @param {'button'|'icon'} [props.variant='button'] - Button presentation variant
 */
export default function ThemeToggle({
  theme = 'light',
  onToggle,
  className = '',
  variant = 'button',
}) {
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-slate-950 ${
        isDark
          ? 'bg-slate-800/90 hover:bg-slate-700/90 border-slate-700 text-amber-300 hover:text-amber-200 shadow-sm'
          : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900 shadow-sm'
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 transition-transform duration-200 hover:rotate-45" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4 transition-transform duration-200 hover:-rotate-12 text-slate-700" aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}
