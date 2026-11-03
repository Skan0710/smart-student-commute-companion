import React from 'react';
import { ArrowRight, ExternalLink, Gauge, MapPinned, MessageSquareQuote, Route as RouteIcon } from 'lucide-react';
import { PERFORMANCE, STUDENT_VOICES, HUBS_HEADING, TESTIMONIALS, CASE_STUDY, getCampusHubs } from '../../content/proof.js';

const card =
  'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm';
const link =
  'font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

/**
 * PerformanceBadge - the response-time promise, with the numbers behind it
 *
 * Shows the claim, how it was measured, what it does NOT cover and how to
 * reproduce it. Content (and the benchmark that keeps it honest) is in
 * content/proof.js.
 */
export function PerformanceBadge() {
  const m = PERFORMANCE.measured;
  return (
    <section aria-labelledby="performance-heading" className="mt-14 max-w-3xl">
      <h2 id="performance-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
        {PERFORMANCE.heading}
      </h2>
      <div className={`${card} mt-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <p
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-900 dark:text-emerald-200"
            data-performance-badge
          >
            <Gauge className="w-4 h-4" aria-hidden="true" />
            Route ranking: under {PERFORMANCE.thresholdMs} ms
          </p>
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">{PERFORMANCE.summary}</p>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[
            ['Median', `${m.medianMs} ms`],
            ['95th percentile', `${m.p95Ms} ms`],
            ['Slowest run', `~${m.slowestMs} ms`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-2 py-3">
              <dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt>
              <dd className="mt-1 text-base sm:text-lg font-bold text-slate-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{PERFORMANCE.detail}</p>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{PERFORMANCE.excludes}</p>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{PERFORMANCE.offline}</p>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
          Measured {m.date} on {m.machine}. Reproduce it with <code className="font-mono">{PERFORMANCE.command}</code>.
        </p>
      </div>
    </section>
  );
}

/**
 * CampusHubs - the campuses the planner knows, with OpenStreetMap walking directions
 *
 * Each link opens openstreetmap.org with the coordinates encoded in the URL
 * (see utils/mapLinks.js). They are approximate area-level points, not
 * entrances, and nothing about the visitor is sent.
 */
export function CampusHubs() {
  const hubs = getCampusHubs();
  return (
    <section aria-labelledby="hubs-heading" className="mt-14">
      <h2 id="hubs-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
        {HUBS_HEADING}
      </h2>
      <p className="mt-3 max-w-3xl text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
        The planner has route knowledge for these campus hubs. Open a walking route from the nearest station on
        OpenStreetMap (approximate, area-level points).
      </p>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {hubs.map((hub) => (
          <li key={hub.id} className={card}>
            <span
              className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 flex items-center justify-center"
              aria-hidden="true"
            >
              <MapPinned className="w-5 h-5" />
            </span>
            <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">{hub.college}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{hub.area}</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{hub.arrival}</p>
            {hub.walkUrl && (
              <a href={hub.walkUrl} target="_blank" rel="noopener noreferrer" className={`${link} mt-3 inline-flex items-center gap-1 text-sm`}>
                Walking route from {hub.from.label}
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only"> (opens OpenStreetMap in a new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * StudentVoices - real, consented quotes only
 *
 * Renders content/proof.js TESTIMONIALS. While there are none it says so
 * plainly and invites feedback instead of showing placeholder praise.
 */
export function StudentVoices() {
  return (
    <section aria-labelledby="voices-heading" className="mt-14 max-w-3xl">
      <h2 id="voices-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
        What students say
      </h2>
      {TESTIMONIALS.length > 0 ? (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {TESTIMONIALS.map((item) => (
            <li key={`${item.author}-${item.collectedOn}`} className={card}>
              <figure>
                <blockquote className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  {item.author}, {item.college}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${card} mt-5 flex gap-3`}>
          <MessageSquareQuote className="w-6 h-6 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{STUDENT_VOICES.emptyTitle}</h3>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{STUDENT_VOICES.emptyBody}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * CaseStudy - an illustrative worked example, labelled as such
 */
export function CaseStudy() {
  return (
    <section aria-labelledby="case-heading" className="mt-14 max-w-3xl">
      <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 dark:bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
        <RouteIcon className="w-3.5 h-3.5" aria-hidden="true" />
        {CASE_STUDY.label}
      </p>
      <h2 id="case-heading" className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
        {CASE_STUDY.heading}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{CASE_STUDY.disclaimer}</p>
      <ol className="mt-5 space-y-4">
        {CASE_STUDY.steps.map((step, index) => (
          <li key={step.title} className={`${card} flex gap-4`}>
            <span
              className="w-8 h-8 shrink-0 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <a href={CASE_STUDY.cta.href} className={`${link} mt-5 inline-flex items-center gap-1 text-sm`}>
        {CASE_STUDY.cta.label}
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </a>
    </section>
  );
}
