import React from 'react';
import { Zap, IndianRupee, Footprints, Shuffle, AlertTriangle, ShieldCheck, ArrowRightLeft } from 'lucide-react';

/**
 * TradeoffPill - Route Comparison Trade-Off Indicator
 *
 * Renders concise, high-visibility decision factors for route selection:
 * - Positive (Fastest, Lowest Cost, Minimal Walking, High Reliability)
 * - Warning (Disruption Delay, High Walking Burden, Heavy Congestion)
 * - Neutral (Corridor Shift, Alternate Mode)
 *
 * @param {Object} props
 * @param {string} props.label - Trade-off description text
 * @param {'positive'|'warning'|'danger'|'neutral'} [props.type='neutral'] - Sentiment type
 * @param {'fastest'|'cheapest'|'walking'|'transfers'|'disruption'|'reliable'|'alternate'|'custom'} [props.category='custom'] - Factor category
 * @param {React.ReactNode} [props.icon] - Optional custom icon override
 * @param {string} [props.className=''] - Additional CSS classes
 */
const CATEGORY_ICONS = {
  fastest: Zap,
  cheapest: IndianRupee,
  walking: Footprints,
  transfers: Shuffle,
  disruption: AlertTriangle,
  reliable: ShieldCheck,
  alternate: ArrowRightLeft
};

const TYPE_STYLES = {
  positive: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30',
  danger: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  neutral: 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700/60'
};

export default function TradeoffPill({
  label,
  type = 'neutral',
  category = 'custom',
  icon,
  className = ''
}) {
  const IconComponent = icon ? null : CATEGORY_ICONS[category];
  const typeStyle = TYPE_STYLES[type] || TYPE_STYLES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${typeStyle} ${className}`}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0">{icon}</span>
      ) : IconComponent ? (
        <IconComponent size={12} aria-hidden="true" className="shrink-0" />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
