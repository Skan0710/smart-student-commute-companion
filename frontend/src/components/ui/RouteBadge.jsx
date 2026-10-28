import React from 'react';
import { Train, Bus, Car, Footprints, Users, Navigation } from 'lucide-react';

/**
 * RouteBadge - Mobility Mode & Transit Identifier
 *
 * Displays standardized badges for multimodal transit legs:
 * Train (Suburban Rail), Metro, Bus (BEST), Auto/Taxi, Walk, and Shared Ride.
 * Accessible with visible text and semantic icons; never relies on color alone.
 *
 * @param {Object} props
 * @param {'train'|'metro'|'bus'|'auto'|'walk'|'shared'|'transit'} props.mode - Transit mode
 * @param {string} [props.label] - Optional specific route label (e.g. "WR Fast", "Line 1", "308 Ltd")
 * @param {'xs'|'sm'|'md'} [props.size='sm'] - Badge size
 * @param {string} [props.className=''] - Additional CSS classes
 */
const MODE_CONFIG = {
  train: {
    label: 'Train',
    icon: Train,
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/30'
  },
  rail: {
    label: 'Train',
    icon: Train,
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/30'
  },
  metro: {
    label: 'Metro',
    icon: Navigation,
    bg: 'bg-purple-500/15',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-500/30'
  },
  bus: {
    label: 'BEST Bus',
    icon: Bus,
    bg: 'bg-amber-500/15',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-500/30'
  },
  auto: {
    label: 'Auto',
    icon: Car,
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-500/30'
  },
  walk: {
    label: 'Walk',
    icon: Footprints,
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30'
  },
  shared: {
    label: 'Shared Travel',
    icon: Users,
    bg: 'bg-teal-500/15',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-500/30'
  },
  transit: {
    label: 'Transit',
    icon: Train,
    bg: 'bg-slate-500/15',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-500/30'
  }
};

export default function RouteBadge({
  mode = 'transit',
  label,
  size = 'sm',
  className = ''
}) {
  const normalizedMode = (mode || 'transit').toLowerCase();
  const config = MODE_CONFIG[normalizedMode] || MODE_CONFIG.transit;
  const Icon = config.icon;
  const displayText = label || config.label;

  const sizeStyles = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-0.5 text-xs gap-1.5',
    md: 'px-2.5 py-1 text-xs font-semibold gap-1.5'
  }[size] || 'px-2 py-0.5 text-xs gap-1.5';

  const iconSizes = {
    xs: 11,
    sm: 13,
    md: 14
  }[size] || 13;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-lg border whitespace-nowrap shrink-0 transition-colors ${config.bg} ${config.text} ${config.border} ${sizeStyles} ${className}`}
      aria-label={`Mode: ${displayText}`}
    >
      <Icon size={iconSizes} aria-hidden="true" className="shrink-0" />
      <span>{displayText}</span>
    </span>
  );
}
