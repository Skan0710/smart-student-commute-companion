import React, { useState, useMemo, useEffect } from 'react';
import { Search as SearchIcon, RefreshCw, AlertTriangle, AlertCircle, MapPin, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import LiveStudentFeed from '../components/LiveStudentFeed';
import { LoadingState, ErrorState, EmptyState, SearchInput, FilterBar, Select, StatTile, Alert, RouteBadge, StatusIndicator } from '../components/ui';
import { applyListControls, buildActiveFilters } from '../utils/listControls';
import { listCommuteAlerts, dismissAlert } from '../services/liveReports';

const IMPACT_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };
const MODE_LABELS = {
  train: 'Train',
  metro: 'Metro',
  bus: 'BEST Bus',
  auto: 'Auto / Taxi',
  walk: 'Walk',
};

/**
 * LiveAlertsPage - Core "Live Alerts" feature page structure
 *
 * Composes the crowd-sourced disruption feed and verified transit alerts into a single semantic page:
 * - Page heading (h1) for document outline
 * - Verified corridor disruption alerts with severity and detour advice
 * - Reusable search / filter / sort controls (client-side over the active list)
 * - Live report feed with loading/error placeholders
 */
export default function LiveAlertsPage({
  reports = [],
  onConfirm,
  onContradict,
  onOpenCreateReport,
  isConnected,
  isConnectionLost = false,
  onReconnect,
  isLoading = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
  onRefresh,
}) {
  const [query, setQuery] = useState('');
  const [impact, setImpact] = useState('all');
  const [mode, setMode] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [officialAlerts, setOfficialAlerts] = useState([]);
  const [dismissingId, setDismissingId] = useState(null);
  const [dismissError, setDismissError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    listCommuteAlerts().then((alerts) => {
      if (isMounted && Array.isArray(alerts)) {
        setOfficialAlerts(alerts);
      }
    });
    return () => { isMounted = false; };
  }, []);

  const handleDismissOfficial = async (alertId) => {
    setDismissingId(alertId);
    setDismissError(null);
    try {
      await dismissAlert(alertId);
      setOfficialAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      setDismissError(err?.message || 'Could not dismiss this advisory. Please try again.');
    } finally {
      setDismissingId(null);
    }
  };

  const visibleReports = useMemo(
    () =>
      applyListControls(reports, {
        query,
        queryFields: ['area', 'message', 'route_name', 'pseudonym'],
        filters: { impact, mode },
        sortKey:
          sortBy === 'newest'
            ? (r) => -(r.ageMinutes ?? 0)
            : sortBy === 'oldest'
            ? (r) => r.ageMinutes ?? 0
            : sortBy === 'impact'
            ? (r) => ({ high: 3, medium: 2, low: 1 }[r.impact] ?? 0)
            : (r) => r.freshnessWeight ?? 1,
        sortDir: sortBy === 'oldest' ? 'asc' : 'desc',
      }),
    [reports, query, impact, mode, sortBy]
  );

  const activeFilters = buildActiveFilters(
    { impact, mode },
    { impact: 'Impact', mode: 'Mode' },
    { impact: IMPACT_LABELS, mode: MODE_LABELS },
    (field) => (field === 'impact' ? setImpact('all') : setMode('all'))
  );

  const handleClearAll = () => {
    setQuery('');
    setImpact('all');
    setMode('all');
  };

  const showNoMatches = !isLoading && !loadError && reports.length > 0 && visibleReports.length === 0;

  return (
    <div className="space-y-5">
      <header className="pb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Live Alerts
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time crowd-sourced transit disruptions reported by students
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || isRefreshing}
            aria-busy={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        )}
      </header>

      {/* Quick summary of the loaded report set */}
      {!isLoading && !loadError && reports.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile
            value={reports.length}
            label="Active alerts"
            icon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
            variant="amber"
          />
          <StatTile
            value={reports.filter((r) => r.impact === 'high').length}
            label="High impact"
            icon={<AlertCircle className="w-4 h-4" aria-hidden="true" />}
            variant="rose"
          />
          <StatTile
            value={new Set(reports.map((r) => r.area)).size}
            label="Areas affected"
            icon={<MapPin className="w-4 h-4" aria-hidden="true" />}
            variant="sky"
          />
        </div>
      )}

      {/* Live-stream connection state: stale data must be explained, not hidden */}
      {isConnectionLost && !isLoading && !loadError && (
        <Alert variant="warning" title="Live updates paused">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              The connection to the live student stream was lost. You are seeing the
              last loaded reports — new alerts may be delayed.
            </span>
            {onReconnect && (
              <button
                type="button"
                onClick={onReconnect}
                className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
              >
                Reconnect
              </button>
            )}
          </div>
        </Alert>
      )}

      {/* Official Corridor Advisories & Verified Disruptions */}
      {officialAlerts.length > 0 && (
        <section aria-label="Official transit corridor advisories" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />
              <span>Official Corridor Advisories ({officialAlerts.length})</span>
            </h2>
            
          </div>
          {dismissError && (
            <Alert variant="error" dismissible onDismiss={() => setDismissError(null)}>
              {dismissError}
            </Alert>
          )}
          <div className="space-y-2.5">
            {officialAlerts.map((alert) => {
              const isCritical = alert.severity === 'CRITICAL';
              const isHigh = alert.severity === 'HIGH';
              const isDismissing = dismissingId === alert.id;

              return (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-xl border backdrop-blur-sm transition-all ${
                    isCritical
                      ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/30 dark:border-rose-500/50 dark:text-rose-200'
                      : isHigh
                      ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/30 dark:border-amber-500/50 dark:text-amber-200'
                      : 'bg-white border-slate-200 text-slate-800 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                        isCritical
                          ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40'
                          : isHigh
                          ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                          : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}>
                        {alert.severity || 'ADVISORY'}
                      </span>
                      {alert.mode && <RouteBadge mode={alert.mode} size="xs" />}
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{alert.title || alert.corridor}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDismissOfficial(alert.id)}
                      disabled={isDismissing}
                      className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
                      title="Dismiss alert"
                      aria-label={`Dismiss alert: ${alert.title || alert.corridor}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
                    {alert.message}
                  </p>
                  {(alert.recommendedAction || alert.estimatedDelayMinutes) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 text-xs">
                      {alert.recommendedAction && (
                        <span className="text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <span>Detour advice: {alert.recommendedAction}</span>
                        </span>
                      )}
                      {alert.estimatedDelayMinutes > 0 && (
                        <span className="text-amber-800 dark:text-amber-400 font-mono text-[11px] ml-auto">
                          +{alert.estimatedDelayMinutes}m delay
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Search / filter / sort controls */}
      <FilterBar
        activeFilters={activeFilters}
        onClearAll={handleClearAll}
        resultCount={visibleReports.length}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          label="Search live alerts"
          placeholder="Search area, route, or message..."
          className="flex-1 min-w-[180px]"
        />

        <div className="flex flex-wrap gap-2.5">
          <Select
            label="Impact"
            id="alert-impact-filter"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            options={[
              { value: 'all', label: 'All impacts' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <Select
            label="Mode"
            id="alert-mode-filter"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            options={[
              { value: 'all', label: 'All modes' },
              ...Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            label="Sort by"
            id="alert-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'impact', label: 'Highest impact' },
              { value: 'freshness', label: 'Freshest' },
            ]}
          />
        </div>
      </FilterBar>

      <section aria-label="Live disruption reports" aria-busy={isLoading || isRefreshing}>
        {isRefreshing && !isLoading && !loadError && (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pb-2"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            Checking for new alerts…
          </p>
        )}
        {isLoading ? (
          <LoadingState
            headingLevel={2}
            title="Loading live alerts..."
            description="Fetching the latest student disruption reports across Mumbai."
          />
        ) : loadError ? (
          <ErrorState
            headingLevel={2}
            title="Live alerts unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Reload Alerts"
          />
        ) : showNoMatches ? (
          <EmptyState
            headingLevel={2}
            icon={<SearchIcon />}
            title="No alerts match your filters"
            description="Try a different search term, or clear the active filters to see all live reports."
            action={
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                Clear Filters
              </button>
            }
          />
        ) : (
          <LiveStudentFeed
            reports={visibleReports}
            onConfirm={onConfirm}
            onContradict={onContradict}
            onOpenCreateReport={onOpenCreateReport}
            isConnected={isConnected}
          />
        )}
      </section>
    </div>
  );
}
