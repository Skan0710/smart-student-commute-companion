import React from 'react';
import { ArrowRight } from 'lucide-react';
import { FAQS, ABOUT } from '../../content/siteContent.js';
import LinkButton from '../../components/public/LinkButton.jsx';
import FaqList from '../../components/public/FaqList.jsx';

/**
 * FaqPage - public "Frequently asked questions"
 *
 * The same five questions the About page shows, on their own page so they can
 * be linked and indexed directly. Native <details>/<summary> accordions work
 * without JavaScript; the matching FAQPage JSON-LD is added by content/seo.js.
 */
export default function FaqPage() {
  return (
    <article>
      <header className="max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Frequently asked questions
        </h1>
        <p className="mt-3 text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          Quick answers about what the app covers, how community alerts and the timetable scanner work, and how your
          data is handled.
        </p>
      </header>

      <section aria-label="Questions and answers" className="mt-8">
        <FaqList items={FAQS} />
      </section>

      <section aria-labelledby="faq-next" className="mt-12 max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 id="faq-next" className="text-lg font-bold text-slate-900 dark:text-white">
          Still have a question?
        </h2>
        <p className="mt-2 text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          The <a href="/privacy" className="font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline">privacy policy</a> and{' '}
          <a href="/terms" className="font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline">terms of use</a> cover data
          handling and acceptable use in detail. Or <a href="/about" className="font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline">see how it works</a>.
        </p>
        <div className="mt-5" data-primary-cta-group>
          <LinkButton href={ABOUT.primaryCta.href} data-primary-cta icon={<ArrowRight className="w-5 h-5" aria-hidden="true" />}>
            {ABOUT.primaryCta.label}
          </LinkButton>
        </div>
      </section>
    </article>
  );
}
