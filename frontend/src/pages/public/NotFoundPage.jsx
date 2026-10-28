import React from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { NOT_FOUND } from '../../content/siteContent.js';
import LinkButton from '../../components/public/LinkButton.jsx';

/**
 * NotFoundPage - 404 for unknown addresses
 *
 * Explains what happened, offers one primary way back (the planner) and a few
 * real destinations. Never echoes the requested path or any internals. It is
 * served as a real HTTP 404 by hosts that serve /404.html for unknown URLs and
 * is marked noindex when rendered client-side.
 */
export default function NotFoundPage() {
  return (
    <section aria-labelledby="notfound-heading" className="max-w-2xl mx-auto text-center py-8 sm:py-16">
      <span
        className="mx-auto w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 flex items-center justify-center"
        aria-hidden="true"
      >
        <Compass className="w-7 h-7" />
      </span>
      <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Error 404</p>
      <h1
        id="notfound-heading"
        className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white"
      >
        {NOT_FOUND.heading}
      </h1>
      <p className="mt-3 text-base text-slate-700 dark:text-slate-300">{NOT_FOUND.body}</p>

      <div className="mt-6">
        <LinkButton href={NOT_FOUND.primaryCta.href} icon={<ArrowRight className="w-5 h-5" aria-hidden="true" />}>
          {NOT_FOUND.primaryCta.label}
        </LinkButton>
      </div>

      <nav aria-labelledby="notfound-links" className="mt-10">
        <h2 id="notfound-links" className="text-sm font-bold text-slate-900 dark:text-white">
          {NOT_FOUND.linksHeading}
        </h2>
        <ul className="mt-3 flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-x-6 gap-y-2 text-sm">
          {NOT_FOUND.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
