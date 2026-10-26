import React, { useState } from 'react';
import { 
  RefreshCw, 
  Plus, 
  Compass, 
  Bookmark, 
  TrainFront, 
  AlertTriangle 
} from 'lucide-react';
import PlannerForm from '../components/PlannerForm';
import DashboardOverview from '../components/DashboardOverview';
import RouteResults from '../components/RouteResults';
import MyCommutesPage from './MyCommutesPage';
import TransitSearchPage from './TransitSearchPage';
import LiveAlertsPage from './LiveAlertsPage';
import { Tabs, TabPanel } from '../components/ui';

/**
 * PlannerPage - Plan Route Hub with nested subpages
 * Subpages:
 * - 'planner': Multimodal AI transit recommendations & map routing
 * - 'mycommutes': Saved commute setups
 * - 'transit': Station & GTFS lookup
 * - 'alerts': Real-time crowd-sourced live transit alerts
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
  isCommuteSaved,
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
  // Props for nested subpages
  savedCommutes = [],
  savedCommutesLoading = false,
  savedCommutesError = null,
  onRefreshSavedCommutes,
  onPlanCommute,
  onRemoveCommute,
  activeSignature,
  transitQuery = '',
  onTransitQueryChange,
  onTransitSearch,
  transitStatus,
  transitResult,
  transitError,
  onTransitRetry,
  onTransitRefresh,
  onClearRecentSearches,
  onUseAsOrigin,
  onUseAsDestination,
  isConnectionLost = false,
  onReconnect,
  initialSubTab = 'planner',
  // Controlled mode: the app owns the sub-tab so deep links and hand-offs
  // (e.g. a recent-search chip → Transit Search) can switch it.
  subTab: controlledSubTab,
  onSubTabChange
}) {
  const [localSubTab, setLocalSubTab] = useState(initialSubTab);
  const subTab = controlledSubTab ?? localSubTab;
  const setSubTab = (next) => {
    setLocalSubTab(next);
    onSubTabChange?.(next);
  };

  const subPages = [
    { id: 'planner', label: 'Route Planner', icon: Compass },
    { id: 'mycommutes', label: 'My Commutes', icon: Bookmark, count: savedCommutesCount > 0 ? savedCommutesCount : undefined },
    { id: 'transit', label: 'Transit Search', icon: TrainFront },
    { id: 'alerts', label: 'Live Alerts', icon: AlertTriangle, count: reports.length > 0 ? reports.length : undefined },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Header with Title, Actions (Refresh & Post a disruption right next to it) and Sub-nav */}
      <header className="pb-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Plan Your Route &amp; Transit
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Multimodal transit routing across Mumbai local trains, metro lines, buses and student alerts
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
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

      {/* Subpage Navigation Tabs within Plan Route */}
      <Tabs
        idPrefix="planner"
        ariaLabel="Plan Route sections"
        tabs={subPages}
        activeTab={subTab}
        onChange={setSubTab}
        className="w-full sm:w-auto"
      />

      {/* Subpage 1: Main Route Planner Form & Results */}
      {subTab === 'planner' && (
        <TabPanel idPrefix="planner" tabId="planner" className="space-y-6">
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
              onNavigate={(dest) => {
                if (['mycommutes', 'transit', 'alerts'].includes(dest)) {
                  setSubTab(dest);
                } else if (onNavigate) {
                  onNavigate(dest);
                }
              }}
              onOpenCreateReport={onOpenCreateReport}
              suggestedDeparture={planResult?.recommendation?.route?.estimatedDeparture || null}
              arrivalTarget={formData.desiredArrivalTime || null}
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

          <section aria-label="Route recommendations" aria-busy={isPlanning}>
            <RouteResults
              planResult={planResult}
              selectedRouteId={selectedRouteId}
              setSelectedRouteId={setSelectedRouteId}
              onOpenFeedback={onOpenFeedback}
              maxBudgetRupees={formData.maxBudgetRupees}
            />
          </section>
        </TabPanel>
      )}

      {/* Subpage 2: My Commutes */}
      {subTab === 'mycommutes' && (
        <TabPanel idPrefix="planner" tabId="mycommutes">
        <MyCommutesPage
          commutes={savedCommutes}
          isLoading={savedCommutesLoading}
          loadError={savedCommutesError}
          onRetryLoad={onRefreshSavedCommutes}
          isRefreshing={isRefreshing}
          onRefresh={onRefreshSavedCommutes}
          onPlanCommute={(commute) => {
            onPlanCommute?.(commute);
            setSubTab('planner');
          }}
          onRemoveCommute={onRemoveCommute}
          isPlanning={isPlanning}
          activeSignature={activeSignature}
          onNavigateToPlanner={() => setSubTab('planner')}
        />
        </TabPanel>
      )}

      {/* Subpage 3: Transit Search */}
      {subTab === 'transit' && (
        <TabPanel idPrefix="planner" tabId="transit">
        <TransitSearchPage
          query={transitQuery}
          onQueryChange={onTransitQueryChange}
          onSearch={onTransitSearch}
          status={transitStatus}
          result={transitResult}
          error={transitError}
          onRetry={onTransitRetry}
          onRefresh={onTransitRefresh}
          recentSearches={recentSearches}
          onSelectRecent={onSelectRecent}
          onClearRecent={onClearRecentSearches}
          onUseAsOrigin={(val) => {
            onUseAsOrigin?.(val);
            setSubTab('planner');
          }}
          onUseAsDestination={(val) => {
            onUseAsDestination?.(val);
            setSubTab('planner');
          }}
        />
        </TabPanel>
      )}

      {/* Subpage 4: Live Alerts */}
      {subTab === 'alerts' && (
        <TabPanel idPrefix="planner" tabId="alerts">
        <LiveAlertsPage
          reports={reports}
          onConfirm={onConfirm}
          onContradict={onContradict}
          onOpenCreateReport={onOpenCreateReport}
          isConnected={isConnected}
          isConnectionLost={isConnectionLost}
          onReconnect={onReconnect}
          isLoading={isLoadingInitial}
          loadError={loadError}
          onRetryLoad={onRetryLoad}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
        />
        </TabPanel>
      )}
    </div>
  );
}
