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
    <div className="w-full max-w-3xl mx-auto divide-y divide-neutral-200 dark:divide-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-slate-900/80 backdrop-blur shadow-sm overflow-hidden">
      {items.map((item, index) => (
        <details key={item.question} className="group relative transition-all duration-300 ease-in border-l-[6px] md:border-l-[8px] border-l-transparent open:border-l-blue-600 dark:open:border-l-blue-400 open:bg-neutral-50/80 dark:open:bg-neutral-800/30" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 sm:px-6 py-4 text-left text-sm sm:text-base font-semibold text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <span className="flex items-center gap-3">
              <span className="text-blue-600 dark:text-blue-400 font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200/50 dark:border-blue-800/50">
                0{index + 1}
              </span>
              <span>{item.question}</span>
            </span>
            <ChevronDown
              className="w-5 h-5 shrink-0 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-180 group-open:text-blue-600 dark:group-open:text-blue-400"
              aria-hidden="true"
            />
          </summary>
          <div className="px-4 sm:px-6 pb-5 pt-1 pl-12 sm:pl-14 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300">
            <p>{item.answer}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
