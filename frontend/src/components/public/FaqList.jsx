import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * FaqList - accessible question/answer list
 *
 * Built on native <details>/<summary>: keyboard operable, announced correctly
 * by screen readers, works without JavaScript (so the prerendered page is
 * fully usable) and needs no state. The first item starts open so the
 * pattern is discoverable.
 *
 * @param {Object} props
 * @param {{ question: string, answer: string }[]} props.items
 */
export default function FaqList({ items }) {
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      {items.map((item, index) => (
        <details key={item.question} className="group" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 sm:px-5 py-4 text-left text-sm sm:text-base font-semibold text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 rounded-2xl">
            <span>{item.question}</span>
            <ChevronDown
              className="w-5 h-5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="px-4 sm:px-5 pb-4 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
