import React from 'react';

/**
 * Modern geometric logo for Smart Student Companion
 * Featuring an interconnected graduation cap + compass navigation node
 * with vibrant gradients.
 */
export default function Logo({ className = 'w-9 h-9 sm:w-10 sm:h-10' }) {
  return (
    <div className={`${className} rounded-2xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-violet-500 p-0.5 shadow-lg shadow-indigo-500/30 ring-1 ring-white/40 shrink-0 group-hover:scale-105 transition-all duration-300`}>
      <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[14px] flex items-center justify-center p-1.5 overflow-hidden relative">
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-sm"
        >
          {/* Subtle background glowing accent */}
          <circle cx="20" cy="20" r="16" className="fill-blue-500/10 dark:fill-blue-400/10" />

          {/* Academic Cap / Apex Node */}
          <path
            d="M20 7L32 13.5L20 20L8 13.5L20 7Z"
            className="fill-blue-600 dark:fill-blue-400 stroke-blue-700 dark:stroke-blue-300"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />

          {/* Compass Star / Core Path Network */}
          <path
            d="M20 18V33M13 23L27 27M27 23L13 27"
            className="stroke-indigo-600 dark:stroke-violet-400"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Orbiting Milestone Nodes */}
          <circle cx="20" cy="20" r="2.5" className="fill-white dark:fill-slate-950 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
          <circle cx="20" cy="33" r="2" className="fill-indigo-600 dark:fill-blue-400" />
          <circle cx="13" cy="23" r="1.5" className="fill-violet-600 dark:fill-indigo-400" />
          <circle cx="27" cy="23" r="1.5" className="fill-violet-600 dark:fill-indigo-400" />
        </svg>
      </div>
    </div>
  );
}
