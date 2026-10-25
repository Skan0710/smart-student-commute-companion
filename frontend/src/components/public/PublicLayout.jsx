import React from 'react';
import { Route as RouteIcon } from 'lucide-react';
import { FOOTER_LINKS, SITE_NAME } from '../../content/siteContent.js';
import { AnalyticsSettingsButton } from '../ConsentBanner.jsx';

import LineHoverLink from '../ui/line-hover-link';

/**
 * PublicLayout - shell for pages that are not the app itself (About, 404, ...)
 *
 * Quiet header (brand + one text link: no competing buttons above the page's
 * own call to action), a semantic <main>, and a footer carrying the public
 * links. Works in light and dark themes.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - page content
 * @param {React.ReactNode} [props.breadcrumbs] - breadcrumb trail rendered above the content
 * @param {React.ReactNode} [props.stickyCta] - mobile bottom call to action (reserves bottom padding)
 */
export default function PublicLayout({ children, breadcrumbs = null, stickyCta = null }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:bg-blue-600 focus:text-white focus:font-bold focus:rounded-xl focus:shadow-2xl"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <a
            href="/"
            className="flex items-center gap-2 min-w-0 font-bold text-slate-900 dark:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="w-8 h-8 shrink-0 rounded-lg bg-blue-600 text-white flex items-center justify-center" aria-hidden="true">
              <RouteIcon className="w-4 h-4" />
            </span>
            <span className="truncate">{SITE_NAME}</span>
          </a>
          <nav aria-label="Primary" className="shrink-0 flex items-center gap-4">
            <LineHoverLink
              variant="slide"
              href="/"
              className="whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Open the planner
            </LineHoverLink>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className={`flex-1 w-full outline-none ${stickyCta ? 'pb-24 md:pb-0' : ''}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          {breadcrumbs && <div className="mb-6">{breadcrumbs}</div>}
          {children}
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
          <p>{SITE_NAME} · Mumbai student transit</p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <li>
                <a href="/" className="underline-offset-2 hover:underline hover:text-blue-700 dark:hover:text-blue-300">
                  Commute planner
                </a>
              </li>
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="underline-offset-2 hover:underline hover:text-blue-700 dark:hover:text-blue-300">
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <AnalyticsSettingsButton />
              </li>
            </ul>
          </nav>
        </div>
      </footer>
      {stickyCta}
    </div>
  );
}
