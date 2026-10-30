import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  Compass,
  Users,
  Bell,
  BellRing,
  BarChart3,
  Bookmark,
  Download,
  TrainFront,
  UploadCloud,
  UserRound,
  Menu,
  X,
  SlidersHorizontal
} from 'lucide-react';
import { ConfirmDialog, UnreadCountBadge } from './ui';
import ThemeToggle from './ThemeToggle';
import SpotlightNavbar from './ui/spotlight-navbar';
import Logo from './Logo';

/**
 * 5 Core Tabs:
 * 1st: Main Dashboard ('dashboard')
 * 2nd: Academics Hub ('academics')
 * 3rd: Plan Route ('planner')
 * 4th: Community & Goals ('community')
 * 5th: Travel Together ('together')
 * + Notifications (bell button top-right)
 * + Account/Profile in top-right
 */
export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Overview',
    icon: LayoutDashboard,
    description: 'Summary of courses, travel, plans & campus life'
  },
  {
    id: 'academics',
    label: 'Academics',
    shortLabel: 'Study',
    icon: GraduationCap,
    description: 'Courses, calendar, resources & AI study plans'
  },
  {
    id: 'planner',
    label: 'Plan Route',
    shortLabel: 'Routes',
    icon: Compass,
    description: 'Multimodal AI transit recommendations & commutes'
  },
  {
    id: 'community',
    label: 'Community & Goals',
    shortLabel: 'Community',
    icon: Users,
    description: 'Student goals, milestones & campus collaboration'
  },
  {
    id: 'together',
    label: 'Travel Together',
    shortLabel: 'Together',
    icon: Users,
    description: 'Student ride groups, carpools & shared commutes'
  },
  {
    id: 'notifications',
    label: 'Notifications',
    shortLabel: 'Notices',
    icon: Bell,
    description: 'Recent academic and commute updates',
    hasBadge: true
  },
  {
    id: 'account',
    label: 'Account',
    shortLabel: 'Account',
    icon: UserRound,
    description: 'Student account and profile settings'
  }
];

// PRIMARY_NAV_IDS = ['dashboard', 'academics', 'planner', 'community', 'notifications']
// const MoreMenu = null;
export const PRIMARY_NAV_IDS = ['dashboard', 'academics', 'planner', 'community', 'together'];

/**
 * Secondary screens that live outside the core tabs for deep linking.
 */
export const SECONDARY_SCREENS = [
  {
    id: 'mycommutes',
    label: 'My Commutes',
    shortLabel: 'Saved',
    icon: Bookmark,
    description: 'Commute setups saved on this device',
    route: { tab: 'planner', subTab: 'mycommutes' }
  },
  {
    id: 'transit',
    label: 'Transit Search',
    shortLabel: 'Search',
    icon: TrainFront,
    description: 'Look up stations, stops and lines',
    route: { tab: 'planner', subTab: 'transit' }
  },
  {
    id: 'feed',
    label: 'Live Alerts',
    shortLabel: 'Feed',
    icon: Bell,
    description: 'Crowd-sourced disruption reports',
    route: { tab: 'planner', subTab: 'alerts' }
  },
  {
    id: 'together',
    label: 'Travel Together',
    shortLabel: 'Together',
    icon: Users,
    description: 'Open ride groups from other students',
    route: { tab: 'together' }
  },
  {
    id: 'devicealerts',
    label: 'Device Alerts',
    shortLabel: 'Alerts',
    icon: BellRing,
    description: 'Browser notifications for live reports',
    route: { tab: 'devicealerts' }
  },
  {
    id: 'offlinequeue',
    label: 'Offline Queue',
    shortLabel: 'Queue',
    icon: UploadCloud,
    description: 'Reports waiting to send when back online',
    route: { tab: 'offlinequeue' }
  },
  {
    id: 'installshare',
    label: 'Install & Share',
    shortLabel: 'Install',
    icon: Download,
    description: 'Add the app to your home screen or share it',
    route: { tab: 'installshare' }
  },
  {
    id: 'analytics',
    label: 'Analytics',
    shortLabel: 'Stats',
    icon: BarChart3,
    description: 'Install, offline and cache metrics on this device',
    route: { tab: 'analytics' }
  }
];

export default function Navbar({
  onResetDemo,
  isResetting,
  activeTab,
  setActiveTab,
  onNavigateScreen,
  unreadNotificationsCount = 0,
  onOpenPreferences,
  theme = 'light',
  onToggleTheme,
  notifications = [],
  notificationReadIds = new Set(),
  onToggleNotificationRead,
  onMarkAllNotificationsRead,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileNavRef = useRef(null);
  const bellButtonRef = useRef(null);
  const notificationsBoxRef = useRef(null);

  // Close notifications dropdown on outside click or Escape
  useEffect(() => {
    if (!isNotificationsOpen) return undefined;
    const handleClickOutside = (e) => {
      if (
        notificationsBoxRef.current &&
        !notificationsBoxRef.current.contains(e.target) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(e.target)
      ) {
        setIsNotificationsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsNotificationsOpen(false);
        bellButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotificationsOpen]);
  

  const handleConfirmReset = () => {
    setIsConfirmingReset(false);
    setMobileMenuOpen(false);
    onResetDemo?.();
  };

  // Close mobile menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    if (mobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Navigate and close mobile menu
  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  };

  // 5 core spotlight navigation items
  const spotlightNavItems = NAV_ITEMS.filter((item) => PRIMARY_NAV_IDS.includes(item.id)).map((item) => ({
    id: item.id,
    label: item.label,
    shortLabel: item.shortLabel,
    compactLabel: item.id === 'community' ? 'Community' : (item.id === 'together' ? 'Together' : undefined),
    href: `#${item.id}`,
    icon: item.icon,
  }));

  const currentSpotlightIndex = spotlightNavItems.findIndex((item) => item.id === activeTab);

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#f7f5f0]/95 dark:bg-[#030408]/95 backdrop-blur-xl border-b border-[#d8d3c5] dark:border-[#1e2440] transition-colors duration-150 font-sans shadow-xs">
        {/* Main Navbar Bar - Enlarged height & padding */}
        <div className="max-w-[1700px] mx-auto px-4 sm:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-4 sm:gap-6 min-h-[74px]">

          {/* Brand Logo & Title on the Top Left */}
          <button
            type="button"
            onClick={() => handleSelectTab('dashboard')}
            className="flex items-center gap-3 text-left select-none group min-w-0 flex-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Smart Student Companion — go to dashboard"
          >
            <Logo className="w-10 h-10 sm:w-11 sm:h-11" />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-extrabold text-base sm:text-xl tracking-tight text-slate-900 dark:text-white truncate">
                  Smart Student Companion
                </span>
                <span className="hidden 2xl:inline px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-[#800020]/10 text-[#800020] dark:bg-[#0047ff]/20 dark:text-[#ccff00] border border-[#800020]/25 dark:border-[#ccff00]/30 shrink-0">
                  MUMBAI
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden xl:block truncate font-medium">
                Academic Hub • Route Planning • Safety Pools • Campus Life
              </p>
            </div>
          </button>

          {/* Desktop Primary Navigation with Spotlight Navbar */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <SpotlightNavbar
              items={spotlightNavItems}
              activeIndex={currentSpotlightIndex >= 0 ? currentSpotlightIndex : -1}
              onItemClick={(item) => handleSelectTab(item.id || 'dashboard')}
              className="py-0"
            />
          </div>

          {/* Top Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {onToggleTheme && (
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            )}

            {/* Notifications - Bell icon button toggles small dropdown box, not a separate page */}
            {/* Legacy nav item compatibility: { id: 'notifications' } */}
            <div className="relative">
              <button
                ref={bellButtonRef}
                type="button"
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                aria-expanded={isNotificationsOpen}
                aria-haspopup="dialog"
                aria-label={unreadNotificationsCount > 0 ? `${unreadNotificationsCount} unread notifications` : 'Notifications'}
                title={unreadNotificationsCount > 0 ? `${unreadNotificationsCount} unread notifications` : 'Notifications'}
                className={`relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isNotificationsOpen
                    ? 'bg-[#800020] text-white border-[#800020] shadow-md shadow-[#800020]/25 dark:bg-[#0047ff] dark:border-[#0047ff] dark:text-white dark:shadow-[#0047ff]/40'
                    : 'bg-[#ffffff] dark:bg-[#0a0c16] border-[#d8d3c5] dark:border-[#1e2440] text-[#4a5247] dark:text-slate-200 hover:border-[#800020] dark:hover:border-[#0047ff] hover:bg-[#edeae2]/60 dark:hover:bg-[#121526]'
                }`}
              >
                <Bell className="w-5 h-5" aria-hidden="true" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold bg-[#800020] text-white dark:bg-[#ccff00] dark:text-black font-extrabold border-2 border-[#f7f5f0] dark:border-black">
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {/* Small Notifications Popover Box */}
              {isNotificationsOpen && (
                <div
                  ref={notificationsBoxRef}
                  role="dialog"
                  aria-label="Notifications"
                  className="absolute right-0 top-full mt-3 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-3xl bg-[#ffffff] dark:bg-[#0a0c16] border border-[#d8d3c5] dark:border-[#1e2440] shadow-2xl shadow-slate-900/10 dark:shadow-black/80 p-4 z-50 space-y-3 font-sans animate-in fade-in zoom-in-95"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-[#800020]/10 text-[#800020] dark:bg-[#0047ff]/20 dark:text-[#ccff00]">
                        <Bell className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white">Notifications</span>
                      {unreadNotificationsCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          {unreadNotificationsCount} new
                        </span>
                      )}
                    </div>
                    {unreadNotificationsCount > 0 && onMarkAllNotificationsRead && (
                      <button
                        type="button"
                        onClick={() => onMarkAllNotificationsRead()}
                        className="text-xs font-semibold text-[#800020] dark:text-[#ccff00] hover:underline"
                      >
                        {/* Mark all as read */}
                        Mark all as Read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 sm:max-h-96 overflow-y-auto space-y-2.5 pr-1" style={{ scrollbarWidth: 'thin' }}>
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        <BellRing className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">No notifications yet</p>
                        <p className="mt-0.5">Live transit and disruption reports will appear here.</p>
                      </div>
                    ) : (
                      notifications.map((report) => {
                        const isRead = notificationReadIds instanceof Set ? notificationReadIds.has(report.id) : false;
                        const mode = report.transport_mode || report.transportMode || 'Transit';
                        return (
                          <div
                            key={report.id}
                            className={`p-3 rounded-2xl border transition-all space-y-1.5 ${
                              isRead
                                ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-white/5 opacity-80'
                                : 'bg-blue-50/30 dark:bg-slate-800/90 border-blue-200/60 dark:border-white/10 shadow-xs'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-white">
                                {report.area} ({mode})
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                                {report.timeAgo || 'Recent'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
                              {report.message}
                            </p>
                            <div className="flex items-center justify-between pt-1">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isRead
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                {isRead ? 'Read' : 'Unread'}
                              </span>
                              <button
                                type="button"
                                aria-pressed={isRead}
                                onClick={() => onToggleNotificationRead?.(report.id)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 transition-colors"
                              >
                                {/* Mark read */}
                                {isRead ? 'Mark as Unread' : 'Mark as Read'}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Tab */}
            <button
              type="button"
              onClick={() => handleSelectTab('account')}
              aria-label="Open student account and profile"
              aria-current={activeTab === 'account' ? 'page' : undefined}
              className={`flex items-center gap-2 p-1.5 sm:pl-2 sm:pr-4 rounded-full text-xs sm:text-sm font-bold transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                activeTab === 'account'
                  ? 'bg-[#800020] text-white border-[#800020] shadow-lg shadow-[#800020]/30 dark:bg-[#0047ff] dark:border-[#0047ff] dark:text-white dark:shadow-[#0047ff]/40'
                  : 'bg-[#ffffff] dark:bg-[#0a0c16] border-[#d8d3c5] dark:border-[#1e2440] text-[#4a5247] dark:text-slate-200 hover:border-[#800020] dark:hover:border-[#0047ff] hover:bg-[#edeae2]/60 dark:hover:bg-[#121526]'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#800020] to-[#586953] dark:from-[#0047ff] dark:to-[#ccff00] flex items-center justify-center text-white shrink-0">
                <UserRound className="w-4 h-4" aria-hidden="true" />
              </div>
              <span className="hidden sm:inline lg:hidden xl:inline">Profile</span>
            </button>

            {/* Mobile Hamburger Toggle Button */}
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="lg:hidden p-2 rounded-xl bg-white/80 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Drawer */}
        {mobileMenuOpen && (
          <div
            id="mobile-navigation"
            ref={mobileNavRef}
            className="lg:hidden max-h-[calc(100vh-5rem)] overflow-y-auto border-t border-slate-200 dark:border-slate-800/80 bg-white/98 dark:bg-slate-950/98 px-4 pt-3 pb-5 space-y-3 shadow-2xl animate-fade-in"
            role="region"
            aria-label="Mobile navigation menu"
          >
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              Menu
            </div>

            <div className="space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? 'bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} aria-hidden="true" />
                      <div>
                        <div className="leading-tight font-semibold">{item.label}</div>
                        <div className={`text-[11px] ${isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          {item.description}
                        </div>
                      </div>
                    </div>
                    {item.id === 'notifications' && unreadNotificationsCount > 0 && (
                      <UnreadCountBadge
                        count={unreadNotificationsCount}
                        size="md"
                        variant={isActive ? 'dark' : 'emerald'}
                        srLabel="unread notifications"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile Preferences Control */}
            {onOpenPreferences && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPreferences();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Preferences &amp; Settings</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Mobile Bottom Fixed Navigation Bar (5 Core Items) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/90 px-1 pb-safe flex items-center justify-around shadow-2xl transition-colors font-sans"
        role="navigation"
        aria-label="Mobile quick navigation"
      >
        {spotlightNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center px-0.5 py-2 min-h-[52px] rounded-xl transition-all relative focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'text-blue-700 dark:text-blue-300 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'text-blue-700 dark:text-blue-300 scale-110' : ''}`} aria-hidden="true" />
              </div>
              <span className="text-[10px] mt-1 tracking-tight max-w-full truncate" aria-hidden="true">
                {item.shortLabel || item.label}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Reset demo confirmation dialog */}
      <ConfirmDialog
        isOpen={isConfirmingReset}
        onCancel={() => setIsConfirmingReset(false)}
        onConfirm={handleConfirmReset}
        title="Reset demo environment?"
        message="This will restore all live reports, commute groups, and demo data to the baseline state. This action cannot be undone."
        confirmLabel="Reset Demo"
        destructive
        isPending={isResetting}
      />
    </>
  );
}
