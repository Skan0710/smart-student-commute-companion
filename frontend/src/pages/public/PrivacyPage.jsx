import React from 'react';
import { getPrivacyPolicy } from '../../content/privacyContent.js';

/**
 * PrivacyPage - public privacy policy
 *
 * Content comes from content/privacyContent.js, which describes what the code
 * actually does. The analytics section and contact line adapt to the build
 * configuration (analytics on/off, contact email set/unset) so the page never
 * promises something this deployment does not do.
 *
 * @param {Object} props
 * @param {boolean} [props.analyticsEnabled]
 * @param {string} [props.contactEmail]
 */
export default function PrivacyPage({ analyticsEnabled = false, contactEmail = '' }) {
  const policy = getPrivacyPolicy({ analyticsEnabled, contactEmail });

  return (
    <article className="max-w-3xl">
      <header>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Privacy policy
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Last updated {policy.updated}</p>
        <p className="mt-4 text-base text-slate-700 dark:text-slate-300 leading-relaxed">{policy.intro}</p>
      </header>

      <nav aria-label="On this page" className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">On this page</h2>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 text-sm">
          {policy.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {policy.sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="mt-10 scroll-mt-20">
          <h2 id={`${section.id}-heading`} className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {section.heading}
          </h2>
          {(section.paragraphs || []).map((paragraph) => (
            <p key={paragraph} className="mt-3 text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
              {paragraph}
            </p>
          ))}
          {section.items && (
            <ul className="mt-3 list-disc pl-5 space-y-2 text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed marker:text-slate-400">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
