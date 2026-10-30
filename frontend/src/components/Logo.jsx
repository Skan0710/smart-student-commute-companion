import React from 'react';

/**
 * Modern geometric logo for Smart Student Companion
 * Featuring an interconnected academic graduation apex and dynamic transit nexus.
 * Light mode: Burgundy (#800020) + Cream Beige (#F7F5F0) + Sage Grey accents
 * Dark mode: Midnight Black (#030408) + Electric Cobalt Blue (#0047FF) + Acid Lime (#CCFF00)
 */
export default function Logo({ className = 'w-10 h-10 sm:w-11 sm:h-11' }) {
  return (
    <div
      className={`${className} rounded-2xl bg-gradient-to-br from-[#800020] via-[#586953] to-[#800020] dark:from-[#0047ff] dark:via-[#002f99] dark:to-[#ccff00] p-0.5 shadow-lg shadow-[#800020]/20 dark:shadow-[#0047ff]/30 ring-1 ring-[#800020]/20 dark:ring-[#ccff00]/30 shrink-0 group-hover:scale-105 transition-all duration-300`}
    >
      <div className="w-full h-full bg-[#f7f5f0] dark:bg-[#030408] rounded-[14px] flex items-center justify-center p-1.5 overflow-hidden relative">
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
            stroke="currentColor"
            className="text-[#800020] dark:text-[#ccff00]"
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
            stroke="url(#logo-grad-primary)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          <circle cx="22" cy="22" r="3" className="fill-[#800020] dark:fill-[#0047ff]" />
          <circle cx="22" cy="22" r="1.5" className="fill-[#f7f5f0] dark:fill-[#ccff00]" />

          {/* Milestone Node Dots */}
          <circle cx="13" cy="28" r="2" className="fill-[#586953] dark:fill-[#0047ff]" />
          <circle cx="31" cy="28" r="2" className="fill-[#800020] dark:fill-[#ccff00]" />
          <circle cx="22" cy="36" r="2.2" className="fill-[#800020] dark:fill-[#ccff00]" />

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
              <stop stopColor="#800020" stopOpacity="0.2" className="dark:stop-color-[#0047ff] dark:stop-opacity-35" />
              <stop offset="1" stopColor="#f7f5f0" stopOpacity="0" className="dark:stop-color-[#030408]" />
            </radialGradient>
            <linearGradient
              id="logo-grad-primary"
              x1="7"
              y1="6"
              x2="37"
              y2="22"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#800020" className="dark:stop-color-[#0047ff]" />
              <stop offset="1" stopColor="#586953" className="dark:stop-color-[#ccff00]" />
            </linearGradient>
            <linearGradient
              id="logo-grad-accent"
              x1="13"
              y1="18.5"
              x2="31"
              y2="36"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#586953" className="dark:stop-color-[#0047ff]" />
              <stop offset="0.5" stopColor="#800020" className="dark:stop-color-[#1e5cff]" />
              <stop offset="1" stopColor="#800020" className="dark:stop-color-[#ccff00]" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
