import React from 'react';
import { ShieldCheck, Users, Calculator, Sparkles } from 'lucide-react';

/**
 * ProvenanceTag - Transparent 4-Tier Data Provenance Indicator
 *
 * Communicates the auditability and confidence level of commute route metrics:
 * 1. VERIFIED: Official transit schedule or verified authority disruption.
 * 2. USER_REPORTED: Crowdsourced student community reports.
 * 3. ESTIMATED: Mathematical transit algorithm & corridor estimation.
 * 4. SYNTHETIC: Simulated/fallback data without live telemetry.
 *
 * @param {Object} props
 * @param {'VERIFIED'|'USER_REPORTED'|'ESTIMATED'|'SYNTHETIC'} props.tier - Provenance tier
 * @param {string} [props.label] - Optional custom label
 * @param {'xs'|'sm'} [props.size='sm'] - Tag size
 * @param {string} [props.className=''] - Additional CSS classes
 */
const TIER_CONFIG = {
  VERIFIED: {
    label: 'Verified Authority',
    icon: ShieldCheck,
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500/30'
  },
  USER_REPORTED: {
    label: 'Community Reported',
    icon: Users,
    bg: 'bg-sky-500/10',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-500/30'
  },
  ESTIMATED: {
    label: 'Corridor Estimate',
    icon: Calculator,
    bg: 'bg-amber-500/10',
    text: 'text-amber-800 dark:text-amber-400',
    border: 'border-amber-500/30'
  },
  SYNTHETIC: {
    label: 'Simulated Model',
    icon: Sparkles,
    bg: 'bg-purple-500/10',
    text: 'text-purple-700 dark:text-purple-400',
    border: 'border-purple-500/30'
  }
};

export default function ProvenanceTag({
  tier = 'ESTIMATED',
  label,
  size = 'sm',
  className = ''
}) {
  const normalizedTier = (tier || 'ESTIMATED').toUpperCase();
  const config = TIER_CONFIG[normalizedTier] || TIER_CONFIG.ESTIMATED;
  const Icon = config.icon;
  const displayText = label || config.label;

  const sizeStyles = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px] gap-1'
    : 'px-2 py-0.5 text-[11px] gap-1.5';

  const iconSize = size === 'xs' ? 11 : 12;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md border whitespace-nowrap ${config.bg} ${config.text} ${config.border} ${sizeStyles} ${className}`}
      title={`Data Provenance: ${displayText}`}
      aria-label={`Data Provenance: ${displayText}`}
    >
      <Icon size={iconSize} aria-hidden="true" className="shrink-0" />
      <span>{displayText}</span>
    </span>
  );
}
