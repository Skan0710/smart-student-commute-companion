import React from 'react';

const BAR_VARIANTS = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
  teal: 'bg-teal-500',
  slate: 'bg-slate-500',
};

/**
 * ComparisonBars - Lightweight horizontal bar chart for small data sets
 *
 * Compares a handful of real numeric values (e.g. travel time or fare across
 * route options) as labeled horizontal bars. Deliberately dependency-free —
 * no charting library — and readable on small screens because every bar is
 * paired with its label and exact value as text.
 *
 * Rendering rules:
 * - Non-numeric / missing entries are skipped rather than drawn as zero.
 * - The longest value sets the scale (never an invented axis maximum).
 * - An empty list renders an explicit empty state, not a blank box.
 * - Bars are aria-hidden; each row's text is the accessible representation.
 *
 * @param {Object} props
 * @param {Array<{label: string, value: number, displayValue?: string, variant?: string, emphasis?: boolean}>} props.items - Data points
 * @param {string} props.title - Chart heading (visible, forms the group name)
 * @param {string} [props.valueUnit] - Unit suffix used when computing display text
 * @param {string} [props.emptyMessage='No data to compare yet'] - Empty-state copy
 * @param {string} [props.className=''] - Additional wrapper classes
 */
export default function ComparisonBars({
  items = [],
  title,
  valueUnit = '',
  emptyMessage = 'No data to compare yet',
  className = '',
}) {
  const valid = (Array.isArray(items) ? items : []).filter(
    (item) => item && typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0
  );

  if (valid.length === 0) {
    return (
      <div className={`min-w-0 ${className}`}>
        {title && (
          <h4 className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider pb-3">
            {title}
          </h4>
        )}
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0a0c16] border border-dashed border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5">
          {emptyMessage}
        </p>
      </div>
    );
  }

  const scaleMax = Math.max(...valid.map((item) => item.value), 1);

  return (
    <div className={`min-w-0 ${className}`}>
      {title && (
        <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider pb-3">
          {title}
        </h4>
      )}
      <ul className="space-y-4 list-none">
        {valid.map((item, index) => {
          const width = Math.max(5, Math.round((item.value / scaleMax) * 100));
          const fillClass =
            BAR_VARIANTS[item.variant] ||
            (item.emphasis ? BAR_VARIANTS.emerald : BAR_VARIANTS.slate);
          const display =
            item.displayValue ??
            `${Math.round(item.value)}${valueUnit ? ` ${valueUnit}` : ''}`;
          return (
            <li
              key={`${item.label}-${index}`}
              className={`${item.emphasis ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              <div className="flex items-baseline justify-between gap-3 pb-1.5">
                <span className={`truncate text-sm sm:text-base ${item.emphasis ? 'font-bold text-slate-900 dark:text-white' : 'font-medium'}`}>
                  {item.label}
                </span>
                <span className={`shrink-0 font-mono text-sm sm:text-base ${item.emphasis ? 'text-emerald-700 dark:text-emerald-300 font-bold text-base sm:text-lg' : 'text-slate-700 dark:text-slate-300 font-semibold'}`}>
                  {display}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-3.5 sm:h-4 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shadow-inner"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${fillClass}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
