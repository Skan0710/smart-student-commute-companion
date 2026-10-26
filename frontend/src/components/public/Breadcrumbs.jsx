import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Breadcrumbs - visible trail for nested public pages
 *
 * Ancestors are real links; the last crumb is the current page (not a link,
 * marked with aria-current). Only used where the page genuinely sits below
 * another page: never on the app screens.
 *
 * @param {Object} props
 * @param {{ label: string, href?: string }[]} props.trail - ancestors first, current page last
 */
export default function Breadcrumbs({ trail }) {
  if (!Array.isArray(trail) || trail.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-600 dark:text-slate-400">
      <ol className="flex flex-wrap items-center gap-1.5">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {isLast ? (
                <span aria-current="page" className="font-semibold text-slate-900 dark:text-slate-100">
                  {crumb.label}
                </span>
              ) : (
                <>
                  <a
                    href={crumb.href}
                    className="underline-offset-2 hover:underline hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    {crumb.label}
                  </a>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
