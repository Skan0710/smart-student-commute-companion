import React from 'react';

/**
 * Smart Student Commute Companion Official App Logo
 * Stays identical and visually constant across both light and dark themes.
 */
export default function Logo({ className = 'w-10 h-10 sm:w-11 sm:h-11' }) {
  return (
    <div
      className={`${className} rounded-2xl overflow-hidden shadow-md ring-1 ring-black/10 dark:ring-white/10 shrink-0 group-hover:scale-105 transition-all duration-300 bg-white flex items-center justify-center p-0.5`}
    >
      <img
        src="/app-logo.jpg"
        alt="Smart Student Commute Companion logo"
        className="w-full h-full object-cover rounded-[14px]"
        loading="eager"
      />
    </div>
  );
}
