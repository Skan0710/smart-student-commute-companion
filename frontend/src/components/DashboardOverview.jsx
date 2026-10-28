import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Calendar,
  Clock,
  GraduationCap,
  Plus,
  Search,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Alert, Button, StatTile } from './ui';
import { loadTodaySchedule } from '../services/academics';

/**
 * DashboardOverview - Student dashboard summary for the main screen
 *
 * A compact "at a glance" panel that sits at the top of the planner view and
 * gives students the information hierarchy they need before planning:
 *
 * - Summary tiles fed by real application state (saved commutes, live alerts,
 *   ride groups, sync status) — never fabricated statistics
 * - Quick-access actions to the most common student tasks
 * - Recent transit searches (client-side preference store) as jump-off chips
 * - Honest loading, error, and empty states for every section
 */
export default function DashboardOverview({
  savedCommutesCount = 0,
  groupsCount = 0,
  reportsCount = 0,
  isConnected = false,
  isLoading = false,
  loadError = null,
  onRetryLoad,
  recentSearches = [],
  onSelectRecent,
  onNavigate,
  onOpenCreateReport,
  suggestedDeparture = null,
  arrivalTarget = null,
}) {
  const count = (value) => (isLoading ? '—' : value);

  // Today's real timetable (signed-in students only; guests get a sign-in hint)
  const [timetable, setTimetable] = useState({ status: 'loading', events: [], isSignedIn: false });
  useEffect(() => {
    let isMounted = true;
    loadTodaySchedule()
      .then((result) => isMounted && setTimetable({ status: 'ready', ...result }))
      .catch(() => isMounted && setTimetable({ status: 'error', events: [], isSignedIn: true }));
    return () => {
      isMounted = false;
    };
  }, []);

  const now = Date.now();
  const nextClass =
    timetable.events.find((event) => Number.isFinite(event.startTime) && event.startTime >= now) ||
    timetable.events[0] ||
    null;

  return (
    <section aria-label="Commute dashboard" className="space-y-4 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight font-sans">
          Your commute at a glance
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border font-sans ${
            isConnected
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
          }`}
        >
          {isConnected ? (
            <Wifi className="w-3 h-3" aria-hidden="true" />
          ) : (
            <WifiOff className="w-3 h-3" aria-hidden="true" />
          )}
          {isLoading
            ? 'Connecting…'
            : isConnected
              ? 'Live updates on'
              : 'Live updates reconnecting'}
        </span>
      </div>

      {/* Summary tiles — real counts from application state */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatTile
          value={count(savedCommutesCount)}
          label="Saved commutes"
          icon={<Bookmark className="w-4 h-4" aria-hidden="true" />}
          variant="emerald"
          hint={
            !isLoading && savedCommutesCount === 0
              ? 'Save one from the planner'
              : 'Stored on this device'
          }
        />
        <StatTile
          value={count(reportsCount)}
          label="Active alerts"
          icon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
          variant="amber"
          hint={isLoading ? 'Loading live reports' : 'Crowd-sourced updates'}
        />
        <StatTile
          value={count(groupsCount)}
          label="Ride groups"
          icon={<Users className="w-4 h-4" aria-hidden="true" />}
          variant="indigo"
          hint={isLoading ? 'Loading groups' : 'Student travel pools'}
        />
        <StatTile
          value={isLoading ? '—' : isConnected ? 'Live' : 'Reconnecting'}
          label="Sync status"
          icon={
            isConnected ? (
              <Wifi className="w-4 h-4" aria-hidden="true" />
            ) : (
              <WifiOff className="w-4 h-4" aria-hidden="true" />
            )
          }
          variant={isConnected ? 'sky' : 'rose'}
          hint="Real-time stream"
        />
      </div>

      {/* Initial load failure — keep counts visible but offer a real retry */}
      {loadError && (
        <Alert variant="warning" title="Live counts unavailable">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            {onRetryLoad && (
              <Button type="button" size="sm" variant="secondary" onClick={onRetryLoad}>
                Retry
              </Button>
            )}
          </div>
        </Alert>
      )}


      {/* Academic & Schedule Context — Smart Commute Alignment */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-white/10 rounded-xl p-3.5 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
            <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Academic Schedule &amp; Commute Target</span>
          </div>
          {timetable.status === 'ready' && (
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {timetable.isSignedIn ? 'Your timetable' : 'Not signed in'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-50 dark:bg-slate-950/60 rounded-lg p-2.5 border border-slate-200/80 dark:border-slate-800/60 flex items-start gap-2.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              {timetable.status === 'loading' ? (
                <p className="font-semibold text-slate-600 dark:text-slate-400">Checking your timetable…</p>
              ) : nextClass ? (
                <>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Next: {nextClass.title}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    {[nextClass.time, nextClass.location].filter(Boolean).join(' • ')}
                  </p>
                </>
              ) : timetable.status === 'error' ? (
                <p className="font-semibold text-slate-600 dark:text-slate-400">Couldn&rsquo;t load today&rsquo;s timetable.</p>
              ) : timetable.isSignedIn ? (
                <p className="font-semibold text-slate-800 dark:text-slate-200">No classes scheduled today.</p>
              ) : (
                <>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Sync your timetable</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">Sign in to see your next class here.</p>
                </>
              )}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/60 rounded-lg p-2.5 border border-slate-200/80 dark:border-slate-800/60 flex items-start gap-2.5">
            <Clock className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              {suggestedDeparture ? (
                <>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Suggested departure: {suggestedDeparture}</p>
                  {arrivalTarget && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">To arrive by {arrivalTarget}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">No departure suggested yet</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">Plan a route below to get one.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent searches — jump back into a previous query */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pb-1.5">
          Recent searches
        </h3>
        {recentSearches.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Search a station or line on Transit Search and it will appear here
            for one-tap reuse.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 list-none">
            {recentSearches.map((query) => (
              <li key={query}>
                <button
                  type="button"
                  onClick={() => onSelectRecent?.(query)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {query}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
