import React from 'react';

/**
 * StatusIndicator - Semantic Route & Service Status Dot
 *
 * Communicates live transit condition with visible text label, accessible role,
 * and high-contrast color indicators:
 * - ontime: Service running normally
 * - minor_delay: Minor delay (1-10 mins)
 * - major_delay: Major delay (>10 mins)
 * - suspended: Service suspended/cancelled
 * - info: Advisory or maintenance alert
 *
 * @param {Object} props
 * @param {'ontime'|'minor_delay'|'major_delay'|'suspended'|'info'|'active'} [props.status='ontime'] - Status code
 * @param {string} [props.label] - Optional custom label override
 * @param {boolean} [props.pulse=false] - Whether to animate dot
 * @param {'sm'|'md'} [props.size='sm'] - Display size
 * @param {string} [props.className=''] - Additional CSS classes
 */
const STATUS_CONFIG = {
  ontime: {
    label: 'On Schedule',
    dotBg: 'bg-emerald-500',
    pulseBg: 'bg-emerald-400',
    textColor: 'text-emerald-700 dark:text-emerald-300'
  },
  minor_delay: {
    label: 'Minor Delay',
    dotBg: 'bg-amber-500',
    pulseBg: 'bg-amber-400',
    textColor: 'text-amber-800 dark:text-amber-300'
  },
  major_delay: {
    label: 'Major Delay',
    dotBg: 'bg-orange-500',
    pulseBg: 'bg-orange-400',
    textColor: 'text-orange-700 dark:text-orange-300'
  },
  suspended: {
    label: 'Suspended',
    dotBg: 'bg-rose-500',
    pulseBg: 'bg-rose-400',
    textColor: 'text-rose-700 dark:text-rose-300'
  },
  info: {
    label: 'Advisory',
    dotBg: 'bg-sky-500',
    pulseBg: 'bg-sky-400',
    textColor: 'text-sky-700 dark:text-sky-300'
  },
  active: {
    label: 'Active Disruption',
    dotBg: 'bg-rose-500',
    pulseBg: 'bg-rose-400',
    textColor: 'text-rose-700 dark:text-rose-300'
  }
};

export default function StatusIndicator({
  status = 'ontime',
  label,
  pulse = false,
  size = 'sm',
  className = ''
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ontime;
  const displayText = label || config.label;

  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm font-medium';

  return (
    <span
      className={`inline-flex items-center gap-2 ${textSize} ${config.textColor} ${className}`}
      role="status"
    >
      <span className="relative flex shrink-0 items-center justify-center">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${config.pulseBg}`}
            aria-hidden="true"
          />
        )}
        <span
          className={`relative inline-flex rounded-full ${dotSize} ${config.dotBg}`}
          aria-hidden="true"
        />
      </span>
      <span>{displayText}</span>
    </span>
  );
}
