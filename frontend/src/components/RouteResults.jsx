import React, { useEffect, useRef } from 'react';
import {
  Sparkles,
  AlertTriangle,
  Clock,
  IndianRupee,
  Footprints,
  Zap,
  CloudRain,
  ThumbsUp,
  Info,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import {
  ErrorState,
  ProgressBar,
  ComparisonBars,
  RouteBadge,
  ProvenanceTag,
  TradeoffPill
} from './ui';
import { staggerRouteCards } from '../utils/motion';
import { buildOsmDirectionsUrl } from '../utils/mapLinks';

/** Honest trade-off pills computed by comparing the recommendation with its alternatives. */
function deriveTradeoffs(route, alternatives) {
  const pills = [];
  const rivals = alternatives.filter(Boolean);
  const isLowest = (key) =>
    Number.isFinite(route[key]) &&
    rivals.length > 0 &&
    rivals.every((alt) => !Number.isFinite(alt[key]) || route[key] <= alt[key]);

  if (isLowest('durationMinutes')) pills.push({ label: 'Fastest option', type: 'positive', category: 'fastest' });
  if (isLowest('fareRupees')) pills.push({ label: 'Lowest fare', type: 'positive', category: 'cheapest' });
  if (route.transfers === 0) {
    pills.push({ label: 'Direct (0 transfers)', type: 'positive', category: 'transfers' });
  } else if (Number.isFinite(route.transfers)) {
    pills.push({ label: `${route.transfers} transfer${route.transfers === 1 ? '' : 's'}`, type: 'neutral', category: 'transfers' });
  }
  return pills;
}

/** Whole-number display for a metric the API may not supply (never invents a value). */
const showMetric = (value) => (Number.isFinite(value) ? Math.round(value) : '—');

/**
 * Reliability arrives as a 0–100 score from the standard planner and as a
 * LOW / MEDIUM / HIGH label from the personalized engine; show whichever the
 * backend sent and "—" when it sent neither.
 */
function formatReliability(route) {
  const value = route?.scores?.reliability ?? route?.reliability;
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.round(value)}%`;
  if (typeof value === 'string' && value.trim()) {
    const label = value.trim().toLowerCase();
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return '—';
}

export default function RouteResults({
  planResult,
  selectedRouteId,
  setSelectedRouteId,
  onOpenFeedback,
  maxBudgetRupees
}) {
  const containerRef = useRef(null);
  const alternativesScrollRef = useRef(null);

  const scrollAlternatives = (direction) => {
    if (alternativesScrollRef.current) {
      const container = alternativesScrollRef.current;
      const scrollAmount = container.clientWidth * 0.68;
      container.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    if (containerRef.current) {
      staggerRouteCards(containerRef.current.querySelectorAll('.route-card-animate'));
    }
  }, [planResult]);

  if (!planResult) return null;

  const { recommendation, alternatives = [], weather, scheduleContext } = planResult;
  const recRoute = recommendation?.route;
  const aiReasoning = recommendation?.aiReasoning;
  // Area-level origin/destination from the plan request; null when unusable
  const directionsUrl = buildOsmDirectionsUrl({
    origin: planResult.query?.origin,
    destination: planResult.query?.destination,
    profile: 'car',
  });

  if (!recRoute) {
    return (
      <ErrorState
        title="No Routes Match Filter Settings"
        message={aiReasoning?.reason || planResult.noRouteReason || 'No transit options were found within your selected modes and budget.'}
        suggestions={[
          'Enable more Allowed Modes (e.g., BEST Bus or Metro).',
          'Increase your Max Budget using the budget slider or quick presets.',
          'Increase your walking tolerance in the planner preferences.'
        ]}
      />
    );
  }

  // Trade-offs the backend did not label are derived from the actual numbers,
  // so a pill like "Fastest arrival" is only shown when it is true.
  const recTradeoffs = recRoute.tradeoffs || deriveTradeoffs(recRoute, alternatives);

  return (
    <div ref={containerRef} className="space-y-5 animate-fade-in">
      {/* Weather Snapshot Widget */}
      {weather && (
        <div className="bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-700 dark:text-sky-400">
              <CloudRain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">Mumbai Weather: {weather.condition}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">({weather.temperatureC}°C)</span>
              </div>
              <div className="min-w-[170px] max-w-[240px] flex-1">
                <ProgressBar
                  label={`Rain probability${weather.rainRisk === 'high' ? ' — rain penalties applied to walking legs' : ''}`}
                  value={weather.rainProbability}
                  max={100}
                  variant={weather.rainProbability > 50 ? 'amber' : 'sky'}
                  size="sm"
                  displayValue={`${weather.rainProbability}%`}
                />
              </div>
            </div>
          </div>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hidden sm:inline">
            Open-Meteo Verified
          </span>
        </div>
      )}

      {/* Schedule Context Banner (if derived from academic timetable) */}
      {scheduleContext?.hasScheduleContext && (
        <div className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-blue-900 dark:text-blue-300">
            <Info className="w-4 h-4 text-[#800020] dark:text-[#ccff00] shrink-0" />
            <span>
              Targeted for <strong>{scheduleContext.eventTitle || 'Class'}</strong> starting at {scheduleContext.eventStartTime || scheduleContext.targetArrivalTime}
            </span>
          </div>
          {scheduleContext.isExamDay && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
              Exam Buffer (20m)
            </span>
          )}
        </div>
      )}

      {/* RECOMMENDED ROUTE CARD (FLAGSHIP EXPERIENCE) */}
      <div
        onClick={() => setSelectedRouteId(recRoute.id)}
        className={`route-card-animate bg-white dark:bg-[#0a0c16] border-2 rounded-2xl p-5 sm:p-6 shadow-sm transition-all cursor-pointer relative overflow-hidden ${
          selectedRouteId === recRoute.id
            ? 'border-[#800020] dark:border-[#0047ff] ring-2 ring-[#800020]/25 dark:ring-[#0047ff]/40 shadow-md'
            : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600'
        }`}
      >
        {/* Top Header: Badge, Provenance, Departure Window */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[#800020] dark:bg-[#0047ff] text-white dark:text-white shadow-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 fill-white" />
              RECOMMENDED COMMUTE
            </span>
            <ProvenanceTag tier={recRoute.provenanceTier || (recRoute.sourceLabel?.includes('Verified') ? 'VERIFIED' : 'ESTIMATED')} />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Depart by</span>
            <span className="text-sm font-extrabold text-[#800020] dark:text-[#ccff00] font-mono font-bold bg-[#800020]/10 dark:bg-[#0047ff]/20 px-2.5 py-0.5 rounded-lg border border-[#800020]/20 dark:border-[#0047ff]/40">
              {recRoute.estimatedDeparture}
            </span>
          </div>
        </div>

        {/* Title, Primary Mode & Corridor */}
        <div className="mb-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <RouteBadge mode={recRoute.primaryMode} size="md" />
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              {recRoute.title}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{recRoute.subtitle}</p>
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Road directions on OpenStreetMap
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab; uses approximate area-level points)</span>
            </a>
          )}
        </div>

        {/* Why this route: Decision Rationale */}
        <div className="bg-[#800020]/5 dark:bg-[#0047ff]/10 border border-[#800020]/20 dark:border-[#0047ff]/30 rounded-xl p-3.5 mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#800020] dark:text-[#ccff00] shrink-0" />
            <span className="text-xs font-bold text-[#800020] dark:text-[#ccff00] uppercase tracking-wider">
              {aiReasoning?.aiProvider || 'Optimal Route Intelligence'}
            </span>
            {aiReasoning?.confidence && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 ml-auto font-medium">
                Confidence: {String(aiReasoning.confidence).toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {aiReasoning?.reason || aiReasoning?.summary || 'Calculated as the optimal route for travel time, transfers, and fare economy.'}
          </p>
        </div>

        {/* Key Trade-Off Factors */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {Array.isArray(recTradeoffs) && recTradeoffs.map((item, idx) => {
            const label = typeof item === 'string' ? item : item.label;
            const type = typeof item === 'string' ? 'positive' : item.type || 'neutral';
            const cat = typeof item === 'string' ? 'reliable' : item.category || 'reliable';
            return (
              <TradeoffPill key={idx} label={label} type={type} category={cat} />
            );
          })}
        </div>

        {/* Multi-Criteria Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 text-center">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
              <Clock className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              Duration
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              {showMetric(recRoute.durationMinutes)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">mins</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">Arr: {recRoute.estimatedArrival || '—'}</div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 text-center">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
              <IndianRupee className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              Est. Fare
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-amber-800 dark:text-amber-300 mt-1">
              {Number.isFinite(recRoute.fareRupees) ? `₹${recRoute.fareRupees}` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {Number.isFinite(recRoute.fareRupees) ? (recRoute.fareRupees <= 15 ? 'Student Saver' : 'Standard Fare') : 'Fare unavailable'}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 text-center">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
              <Footprints className="w-3 h-3 text-teal-700 dark:text-teal-400" />
              Walking
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-teal-700 dark:text-teal-300 mt-1">
              {showMetric(recRoute.walkingDurationMinutes)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">mins</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {Number.isFinite(recRoute.totalWalkingDistanceKm) ? `${recRoute.totalWalkingDistanceKm} km` : 'On foot'}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 text-center">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
              <Zap className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              Reliability
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-indigo-700 dark:text-indigo-300 mt-1">
              {formatReliability(recRoute)}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {recRoute.transfers === 0 ? 'Direct Route' : Number.isFinite(recRoute.transfers) ? `${recRoute.transfers} Transfer${recRoute.transfers === 1 ? '' : 's'}` : 'Transfers unknown'}
            </div>
          </div>
        </div>

        {/* Budget usage vs student limit */}
        {Number.isFinite(maxBudgetRupees) && maxBudgetRupees > 0 && Number.isFinite(recRoute.fareRupees) && (
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 mb-4">
            <ProgressBar
              label="Fare vs configured budget"
              value={recRoute.fareRupees}
              max={maxBudgetRupees}
              variant={recRoute.fareRupees > maxBudgetRupees ? 'rose' : 'emerald'}
              displayValue={`₹${recRoute.fareRupees} of ₹${maxBudgetRupees}`}
              hint={
                recRoute.fareRupees <= maxBudgetRupees
                  ? `₹${maxBudgetRupees - recRoute.fareRupees} remaining in daily commute allocation`
                  : 'Exceeds configured budget limit'
              }
            />
          </div>
        )}

        {/* Disruption Warnings */}
        {((aiReasoning?.warnings && aiReasoning.warnings.length > 0) || (recRoute.disruptionAlerts && recRoute.disruptionAlerts.length > 0)) && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 mb-4 space-y-1.5">
            <div className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Route Advisory &amp; Warnings</span>
            </div>
            {aiReasoning?.warnings?.map((w, idx) => (
              <div key={idx} className="text-xs text-amber-900/90 dark:text-amber-200/90 pl-5">
                • {w}
              </div>
            ))}
          </div>
        )}

        {/* Step-by-Step Leg Breakdown with Transit Visuals */}
        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
            <span>Route Stages &amp; Transfers ({recRoute.legs?.length || 0})</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">Sequential transit legs</span>
          </div>
          {recRoute.legs?.map((leg, idx) => (
            <div key={idx} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800/60">
              <div className="w-6 h-6 rounded-lg bg-white dark:bg-[#0a0c16] border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{leg.description}</span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] shrink-0">{Number.isFinite(leg.durationMinutes) ? `${leg.durationMinutes} mins` : '—'}</span>
                </div>
                {leg.agency && (
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                      {leg.agency}
                    </span>
                    {leg.fareRupees !== undefined && (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">₹{leg.fareRupees}</span>
                    )}
                    {leg.departureTime && (
                      <span className="font-mono">Dep: {leg.departureTime}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Map selection trigger & feedback button */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${selectedRouteId === recRoute.id ? 'bg-blue-600 animate-pulse' : 'bg-slate-400 dark:bg-slate-600'}`}></span>
            {selectedRouteId === recRoute.id ? 'Selected on map' : 'Click to inspect on map'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFeedback(recRoute.id);
            }}
            className="flex items-center gap-1 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors py-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>Rate Recommendation</span>
          </button>
        </div>
      </div>

      {/* OPTION COMPARISON (Visual comparison of travel time and fares) */}
      {alternatives.length > 0 && (
        <div className="bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] rounded-2xl p-6 sm:p-7 space-y-6 shadow-sm">
          <ComparisonBars
            title="Travel time across your options"
            valueUnit="min"
            items={[
              {
                label: `Recommended — ${recRoute.title}`,
                value: recRoute.durationMinutes,
                emphasis: true,
                variant: 'emerald',
              },
              ...alternatives.map((alt) => ({
                label: alt.title,
                value: alt.durationMinutes,
                variant: 'slate',
              })),
            ]}
          />
          <ComparisonBars
            title="Fare across your options"
            valueUnit="₹"
            items={[
              {
                label: `Recommended — ${recRoute.title}`,
                value: recRoute.fareRupees,
                displayValue: `₹${recRoute.fareRupees}`,
                emphasis: true,
                variant: 'amber',
              },
              ...alternatives.map((alt) => ({
                label: alt.title,
                value: alt.fareRupees,
                displayValue: `₹${alt.fareRupees}`,
                variant: 'slate',
              })),
            ]}
            emptyMessage="No fares reported for these options."
          />
        </div>
      )}

      {/* PRACTICAL ALTERNATIVES (Law 1: Closure and 32% next-card preview carousel) */}
      <div role="region" aria-label="Alternative routes">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span>Practical Alternatives ({alternatives.length})</span>
            <span className="text-[11px] normal-case font-normal text-slate-500 dark:text-slate-400 hidden sm:inline">
              · Swipe or use controls to compare
            </span>
          </h4>

          {alternatives.length > 1 && (
            <div className="flex items-center gap-1.5" aria-label="Alternative routes navigation">
              <button
                type="button"
                onClick={() => scrollAlternatives('prev')}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a0c16] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Previous alternative route"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollAlternatives('next')}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a0c16] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Next alternative route"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div
          ref={alternativesScrollRef}
          tabIndex={0}
          aria-label="Alternative commute options carousel"
          className="flex gap-3.5 overflow-x-auto pb-3 pt-1 -mx-1 px-1 snap-x snap-mandatory focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded-xl"
          style={{ scrollbarWidth: 'thin' }}
        >
          {alternatives.map((alt) => {
            const isSelected = selectedRouteId === alt.id;
            return (
              <div
                key={alt.id}
                onClick={() => setSelectedRouteId(alt.id)}
                className={`route-card-animate flex-shrink-0 w-[85%] sm:w-[380px] md:w-[420px] snap-start bg-white dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] rounded-2xl p-5 sm:p-6 transition-all cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 shadow-xs flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#800020] dark:border-[#0047ff] ring-2 ring-[#800020]/25 dark:ring-[#0047ff]/40 shadow-md'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex flex-col gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <RouteBadge mode={alt.primaryMode} size="sm" />
                      <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-white break-words min-w-0">{alt.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <ProvenanceTag tier={alt.provenanceTier || 'ESTIMATED'} size="xs" />
                      {alt.badgeLabel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {alt.badgeLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{alt.subtitle}</p>
                </div>

                <div>
                  {/* Quick stats row */}
                  <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 pt-3 border-t border-slate-100 dark:border-slate-800 gap-3">
                    <span className="flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                      <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      {Number.isFinite(alt.durationMinutes) ? `${alt.durationMinutes}m` : '—'}
                    </span>
                    <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300 font-semibold">
                      <IndianRupee className="w-3.5 h-3.5" />
                      {Number.isFinite(alt.fareRupees) ? `₹${alt.fareRupees}` : '—'}
                    </span>
                    <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Footprints className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      {Number.isFinite(alt.walkingDurationMinutes) ? `${alt.walkingDurationMinutes}m` : '—'}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 ml-auto text-[10px]">
                      {alt.estimatedDeparture} → {alt.estimatedArrival}
                    </span>
                  </div>

                  {/* Disruption indicator on alternative */}
                  {alt.disruptionAlerts && alt.disruptionAlerts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate">⚠ Community report: {alt.disruptionAlerts[0].message}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
