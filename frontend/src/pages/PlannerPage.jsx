import React from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import PlannerForm from '../components/PlannerForm';
import DashboardOverview from '../components/DashboardOverview';
import RouteResults from '../components/RouteResults';
import LiveStudentFeed from '../components/LiveStudentFeed';
import { LoadingState, ErrorState } from '../components/ui';

/**
 * PlannerPage - Core "Plan Route" feature page structure
 *
 * Composes the planner feature areas from a single semantic page:
 * - Page heading (h1) for document outline
 * - Commute planner form
 * - Route recommendations with a loading placeholder
 * - Embedded live student feed with loading/error placeholders
 *
 * This is a presentation container: all business logic and API
 * communication live outside the page and arrive via props.
 *
 * @param {Object} props
 * @param {Object} props.formData - Planner form values
 * @param {Function} props.setFormData - Form updater
 * @param {Function} props.onPlan - Submit the commute plan request
 * @param {boolean} props.isPlanning - Whether a plan request is in flight
 * @param {Object|null} props.planResult - Latest plan result
 * @param {string|null} props.selectedRouteId - Currently selected route
 * @param {Function} props.setSelectedRouteId - Route selection updater
 * @param {Function} props.onSaveCommute - Save the current setup to My Commutes
 * @param {boolean} props.isCommuteSaved - Whether the current setup is saved
 * @param {Function} props.onOpenFeedback - Open feedback dialog for a recommendation
 * @param {Array} props.reports - Live disruption reports
 * @param {Function} props.onConfirm - Confirm a report
 * @param {Function} props.onContradict - Contradict a report
 * @param {Function} props.onOpenCreateReport - Open the report dialog
 * @param {boolean} props.isConnected - Live socket connection status
 * @param {boolean} props.isLoadingInitial - Whether initial data is loading
 * @param {string|null} props.loadError - User-friendly initial load error
 * @param {Function} props.onRetryLoad - Retry the initial data load
 * @param {number} props.savedCommutesCount - Commutes saved on this device
 * @param {number} props.groupsCount - Active ride groups
 * @param {string[]} props.recentSearches - Recent transit search queries
 * @param {Function} props.onSelectRecent - Re-run a recent transit search
 * @param {Function} props.onNavigate - Navigate to another screen (tab id)
 * @param {boolean} props.showDashboardOverview - User preference: show the dashboard summary
 */
export default function PlannerPage({
  formData,
  setFormData,
  onPlan,
  isPlanning,
  planResult,
  selectedRouteId,
  setSelectedRouteId,
  onSaveCommute,
  isCommuteSaved = false,
  onOpenFeedback,
  reports = [],
  onConfirm,
  onContradict,
  onOpenCreateReport,
  isConnected,
  isLoadingInitial = false,
  loadError = null,
  onRetryLoad,
  isRefreshing = false,
  onRefresh,
  savedCommutesCount = 0,
  groupsCount = 0,
  recentSearches = [],
  onSelectRecent,
  onNavigate,
  showDashboardOverview = true,
}) {
  return (
    <div className="space-y-6">
      {/* Page heading — establishes the h1 for this view */}
      <header className="pb-2 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-sans">
            Plan Your Commute
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-sans">
            Multimodal AI transit recommendations across Mumbai campuses
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoadingInitial || isRefreshing}
              aria-busy={isRefreshing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-semibold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-sm transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}
          {onOpenCreateReport && (
            <button
              type="button"
              onClick={onOpenCreateReport}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/25 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans active:scale-95"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Post a disruption</span>
            </button>
          )}
        </div>
      </header>

      {/* Student dashboard summary — hidden when the user turns it off in Preferences */}
      {showDashboardOverview && (
        <DashboardOverview
          savedCommutesCount={savedCommutesCount}
          groupsCount={groupsCount}
          reportsCount={reports.length}
          isConnected={isConnected}
          isLoading={isLoadingInitial}
          loadError={loadError}
          onRetryLoad={onRetryLoad}
          recentSearches={recentSearches}
          onSelectRecent={onSelectRecent}
          onNavigate={onNavigate}
          onOpenCreateReport={onOpenCreateReport}
        />
      )}

      <PlannerForm
        formData={formData}
        setFormData={setFormData}
        onPlan={onPlan}
        isLoading={isPlanning}
        onSaveCommute={onSaveCommute}
        isCommuteSaved={isCommuteSaved}
      />

      {/* Route recommendations */}
      <section aria-label="Route recommendations" aria-busy={isPlanning}>
        {isPlanning && !planResult ? (
          <LoadingState
            title="Calculating best routes..."
            description="Scoring transit options for travel time, reliability, budget, and weather."
          />
        ) : (
          <RouteResults
            planResult={planResult}
            selectedRouteId={selectedRouteId}
            setSelectedRouteId={setSelectedRouteId}
            onOpenFeedback={onOpenFeedback}
            maxBudgetRupees={formData?.maxBudgetRupees}
          />
        )}
      </section>

      {/* Live student feed (embedded) */}
      <section aria-label="Live student updates" aria-busy={isLoadingInitial}>
        {isLoadingInitial ? (
          <LoadingState
            title="Loading live student updates..."
            description="Fetching the latest crowd-sourced disruption reports."
          />
        ) : loadError ? (
          <ErrorState
            title="Live updates unavailable"
            message={loadError}
            onRetry={onRetryLoad}
            retryLabel="Reload Updates"
          />
        ) : (
          <LiveStudentFeed
            reports={reports}
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
