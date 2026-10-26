import React from 'react';
import { FOOTER_LINKS } from '../content/siteContent.js';
import { AnalyticsSettingsButton } from '../components/ConsentBanner.jsx';

/**
 * AppShell - Master application shell layout
 * 
 * Establishes the primary structural layout framework for the application:
 * - Keyboard accessible 'Skip to content' anchor
 * - Top header area (with customizable or default navigation)
 * - Flexible semantic <main> content area supporting single-column or split-column layouts
 * - Responsive <aside> sidebar for spatial/map or auxiliary controls
 * - Semantic <footer> with system status and metadata
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.header - Header / top navigation component
 * @param {React.ReactNode} props.children - Primary page content
 * @param {React.ReactNode} [props.sidebar] - Optional sidebar content (e.g., interactive map)
 * @param {React.ReactNode} [props.footer] - Optional custom footer
 * @param {boolean} [props.fullWidth=false] - Whether content should span full viewport width
 * @param {'split'|'single'|'centered'} [props.layoutMode='split'] - Layout presentation mode
 * @param {string} [props.className=''] - Additional container classes
 * @param {string} [props.contentClassName=''] - Additional content area classes
 * @param {string} [props.sidebarClassName=''] - Additional sidebar area classes
 */
export default function AppShell({
  header,
  children,
  sidebar,
  footer,
  fullWidth = false,
  layoutMode = 'split',
  className = '',
  contentClassName = '',
  sidebarClassName = ''
}) {
  const hasSidebar = Boolean(sidebar);
  const isSplit = hasSidebar && layoutMode === 'split';

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-blue-500/20 selection:text-blue-900 dark:selection:bg-blue-400/30 dark:selection:text-blue-200 transition-colors duration-150 ${className}`}>
      {/* Accessibility: Skip to Content Anchor */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:bg-blue-600 focus:text-white focus:font-bold focus:rounded-xl focus:shadow-2xl focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all"
      >
        Skip to main content
      </a>

      {/* Header Slot */}
      {header && (
        <div className="w-full shrink-0">
          {header}
        </div>
      )}

      {/* Main Content Area */}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 pb-28 md:pb-8 pb-safe outline-none ${
          fullWidth ? 'max-w-none' : 'max-w-[1600px]'
        } ${contentClassName}`}
      >
        {isSplit ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Map / Spatial Sidebar on LEFT (5 columns on desktop) */}
            <aside
              aria-label="Interactive map and context panel"
              className={`lg:col-span-5 lg:sticky lg:top-24 h-[480px] sm:h-[550px] lg:h-[calc(100vh-120px)] w-full min-w-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800/80 shadow-md dark:shadow-2xl bg-white dark:bg-slate-900/60 backdrop-blur-sm order-2 lg:order-1 ${sidebarClassName}`}
            >
              {sidebar}
            </aside>

            {/* Primary Content on RIGHT (7 columns on desktop) */}
            <div className="lg:col-span-7 space-y-6 w-full min-w-0 order-1 lg:order-2">
              {children}
            </div>
          </div>
        ) : (
          <div className={`w-full min-w-0 ${layoutMode === 'centered' ? 'max-w-3xl mx-auto' : ''}`}>
            {children}
          </div>
        )}
      </main>

      {/* Footer Area */}
      {footer !== undefined ? (
        footer
      ) : (
        <footer className="border-t border-slate-200 dark:border-slate-900 bg-white/90 dark:bg-slate-950/90 px-4 sm:px-6 py-4 text-xs text-slate-500 dark:text-slate-400 mt-auto backdrop-blur-md">
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400"></span>
              <span className="font-medium text-slate-800 dark:text-slate-300">Smart Student Commute Companion</span>
              <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">Mumbai Student Transit AI</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
              <span>OpenStreetMap &amp; Leaflet</span>
              <span>•</span>
              <span>OSRM Multi-modal</span>
              <span>•</span>
              <span>Mumbai GTFS</span>
              <span>•</span>
              <span>Open-Meteo</span>
            </div>
            <nav aria-label="Footer" className="text-[11px]">
              <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="font-medium text-slate-600 dark:text-slate-300 underline-offset-2 hover:underline hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <AnalyticsSettingsButton className="font-medium text-slate-600 dark:text-slate-300" />
                </li>
              </ul>
            </nav>
          </div>
        </footer>
      )}
    </div>
  );
}
