import React from 'react';

/**
 * Modern geometric logo for Smart Student Companion
 * Featuring an interconnected academic graduation apex and dynamic transit nexus
 * with vibrant gradients and glowing modern tech aesthetics.
 */
export default function Logo({ className = 'w-10 h-10 sm:w-11 sm:h-11' }) {
  return (
    <div
      className={`${className} rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-0.5 shadow-lg shadow-indigo-600/30 ring-1 ring-white/30 dark:ring-white/20 shrink-0 group-hover:scale-105 transition-all duration-300`}
    >
      <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center p-1.5 overflow-hidden relative">
        <svg
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-md"
        >
          {/* Ambient radial glow inside */}
          <circle cx="22" cy="22" r="18" fill="url(#logo-radial-glow)" />

          {/* Academic Mortarboard Diamond / Apex */}
          <path
            d="M22 6L37 14L22 22L7 14L22 6Z"
            fill="url(#logo-grad-primary)"
            stroke="#93C5FD"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Modern Transit Arrow / Interconnected Path */}
          <path
            d="M13 18.5V28C13 32.5 17 36 22 36C27 36 31 32.5 31 28V18.5"
            stroke="url(#logo-grad-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Central Mobility Pulse Node */}
          <path
            d="M22 17V33"
            stroke="#38BDF8"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          <circle cx="22" cy="22" r="3" fill="#FFFFFF" />
          <circle cx="22" cy="22" r="1.5" fill="#2563EB" />

          {/* Milestone Node Dots */}
          <circle cx="13" cy="28" r="2" fill="#38BDF8" />
          <circle cx="31" cy="28" r="2" fill="#818CF8" />
          <circle cx="22" cy="36" r="2.2" fill="#A78BFA" />

          {/* Gradient definitions */}
          <defs>
            <radialGradient
              id="logo-radial-glow"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(22 22) rotate(90) scale(18)"
            >
              <stop stopColor="#3B82F6" stopOpacity="0.35" />
              <stop offset="1" stopColor="#1E1B4B" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              id="logo-grad-primary"
              x1="7"
              y1="6"
              x2="37"
              y2="22"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#3B82F6" />
              <stop offset="1" stopColor="#6366F1" />
            </linearGradient>
            <linearGradient
              id="logo-grad-accent"
              x1="13"
              y1="18.5"
              x2="31"
              y2="36"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#38BDF8" />
              <stop offset="0.5" stopColor="#818CF8" />
              <stop offset="1" stopColor="#C084FC" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
