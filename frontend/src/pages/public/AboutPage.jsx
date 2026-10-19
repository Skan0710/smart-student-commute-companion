import React from 'react';
import { ArrowRight, CloudSun, Map as MapIcon, Users, Radio } from 'lucide-react';
import { ABOUT } from '../../content/siteContent.js';
import LinkButton from '../../components/public/LinkButton.jsx';
import FaqList from '../../components/public/FaqList.jsx';

const FEATURE_ICONS = [MapIcon, Radio, Users, CloudSun];

/**
 * AboutPage - public "How it works" page
 *
 * Above the fold: one heading, one sentence, one primary action (open the
 * planner). Everything below supports that decision: how it works, what the
 * app offers (each item links to a real in-app screen) and where data comes
 * from. Copy lives in content/siteContent.js so the prerendered HTML matches.
 */
export default function AboutPage() {
  return (
    <article>
      <section aria-labelledby="about-heading" className="max-w-3xl">
        <h1
          id="about-heading"
          className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight"
        >
          {ABOUT.heading}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-700 dark:text-slate-300 leading-relaxed">{ABOUT.intro}</p>
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3" data-primary-cta-group>
          <LinkButton href={ABOUT.primaryCta.href} data-primary-cta icon={<ArrowRight className="w-5 h-5" aria-hidden="true" />}>
            {ABOUT.primaryCta.label}
          </LinkButton>
          <a
            href={ABOUT.secondaryCta.href}
            className="text-sm font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-1 py-2"
          >
            {ABOUT.secondaryCta.label}
          </a>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="steps-heading" className="mt-14 scroll-mt-20">
        <h2 id="steps-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
          {ABOUT.stepsHeading}
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {ABOUT.steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
            >
              <span
                className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features-heading" className="mt-14">
        <h2 id="features-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
          {ABOUT.featuresHeading}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {ABOUT.features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length];
            return (
              <li
                key={feature.title}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 w-9 h-9 shrink-0 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{feature.title}</h3>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{feature.body}</p>
                    <a
                      href={feature.link.href}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {feature.link.label}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="sources-heading" className="mt-14 max-w-3xl">
        <h2 id="sources-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
          {ABOUT.sourcesHeading}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">{ABOUT.sourcesIntro}</p>
        <ul className="mt-4 space-y-2 text-sm sm:text-base text-slate-700 dark:text-slate-300">
          {ABOUT.sources.map((source) => (
            <li key={source.name}>
              <strong className="font-semibold text-slate-900 dark:text-white">{source.name}</strong>
              {' — '}
              {source.use}
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" aria-labelledby="faq-heading" className="mt-14 max-w-3xl scroll-mt-20">
        <h2 id="faq-heading" className="text-2xl font-bold text-slate-900 dark:text-white">
          {ABOUT.faqHeading}
        </h2>
        <div className="mt-5">
          <FaqList items={ABOUT.faqs} />
        </div>
        <p className="mt-4 text-sm text-slate-700 dark:text-slate-300">
          More detail on what is stored and shared is in the{' '}
          <a
            href="/privacy"
            className="font-semibold text-blue-700 dark:text-blue-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            privacy policy
          </a>
          .
        </p>
      </section>

      <section
        aria-labelledby="closing-heading"
        className="mt-14 rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-6 sm:p-8"
      >
        <h2 id="closing-heading" className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          {ABOUT.closing.heading}
        </h2>
        <p className="mt-2 text-sm sm:text-base text-slate-700 dark:text-slate-300">{ABOUT.closing.body}</p>
        <div className="mt-5">
          <LinkButton href={ABOUT.closing.cta.href} icon={<ArrowRight className="w-5 h-5" aria-hidden="true" />}>
            {ABOUT.closing.cta.label}
          </LinkButton>
        </div>
      </section>
    </article>
  );
}
