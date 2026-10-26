import React from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * ThemeToggle - Sliding Pill Switch with Sun & Moon
 *
 * Smooth sliding pill button that indicates light and dark mode with animated
 * Sun and Moon icons and a sliding indicator thumb.
 *
 * @param {Object} props
 * @param {'light'|'dark'} props.theme - Active theme state
 * @param {() => void} props.onToggle - Handler called when user toggles
 * @param {string} [props.className] - Additional classes
 */
export default function ThemeToggle({
  theme = 'light',
  onToggle,
  className = '',
}) {
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`relative inline-flex items-center h-9 w-[68px] rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-slate-950 ${
        isDark
          ? 'bg-slate-800 border border-slate-700 shadow-inner'
          : 'bg-slate-200 border border-slate-300 shadow-inner'
      } ${className}`}
    >
      {/* Background Icons positioned at each end */}
      <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none select-none">
        <Sun
          className={`w-3.5 h-3.5 transition-opacity duration-200 ${
            isDark ? 'text-slate-500 opacity-60' : 'text-amber-500 opacity-90 font-bold'
          }`}
          aria-hidden="true"
        />
        <Moon
          className={`w-3.5 h-3.5 transition-opacity duration-200 ${
            isDark ? 'text-indigo-400 opacity-90' : 'text-slate-400 opacity-60'
          }`}
          aria-hidden="true"
        />
      </div>

      {/* Sliding Pill Thumb with Active Icon */}
      <span
        className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full shadow-md transition-transform duration-300 ease-in-out ${
          isDark
            ? 'translate-x-[32px] bg-slate-900 text-amber-300 border border-slate-700'
            : 'translate-x-0 bg-white text-amber-500 border border-slate-200'
        }`}
      >
        {isDark ? (
          <Moon className="w-3.5 h-3.5 text-indigo-300 animate-in fade-in zoom-in duration-200" aria-hidden="true" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-500 animate-in fade-in zoom-in duration-200" aria-hidden="true" />
        )}
      </span>

      <span className="sr-only">{label}</span>
    </button>
  );
}
