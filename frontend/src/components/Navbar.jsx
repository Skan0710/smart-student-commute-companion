import React, { useState, useEffect, useRef, useId } from 'react';
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
  LayoutGrid,
  ChevronDown,
  ShieldCheck,
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
 * 5 Core Tabs as requested:
 * 1st: Main Dashboard ('dashboard')
 * 2nd: Academics Hub ('academics') -> Courses, Calendar, Resources, AI Study Plans
 * 3rd: Plan Route ('planner') -> Commute routing and nested subpages
 * 4th: Community & Goals ('community') -> Goals & Milestones + Shared Travel
 * 5th: Notifications ('notifications') -> Real-time alerts & notices
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
    description: 'Student goals, milestones & shared travel'
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

export const PRIMARY_NAV_IDS = ['dashboard', 'academics', 'planner', 'community', 'notifications'];

/**
 * Secondary screens that live outside the five core tabs.
 *
 * Every entry is deep-linkable through `/?tab=<id>` (public About links, the PWA
 * manifest shortcut and the Install & Share hub's share links all rely on it).
 * Entries that carry a `route.subTab` are hosted inside the Plan Route tab; the
 * rest render as their own screen and are reachable from the "More" menu.
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

/** Secondary screens that get their own entry in the "More" menu. */
const MORE_MENU_ITEMS = SECONDARY_SCREENS.filter((item) => !item.route.subTab);

/**
 * MoreMenu - disclosure popover for secondary screens + preferences.
 * Closes on Escape (returning focus to the trigger), outside click and selection.
 */
function MoreMenu({ activeTab, onSelect, onOpenPreferences }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();
  const isActive = MORE_MENU_ITEMS.some((item) => item.id === activeTab);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const choose = (action) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={containerRef} className="relative hidden lg:block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="More screens and settings"
        className={`flex items-center gap-1.5 h-10 px-3 rounded-full text-xs font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          isActive || open
            ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-400/40 text-blue-700 dark:text-blue-200'
            : 'bg-white/80 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-blue-400 dark:hover:border-blue-400/60 hover:bg-blue-50/60 dark:hover:bg-white/10'
        }`}
      >
        <LayoutGrid className="w-4 h-4" aria-hidden="true" />
        <span className="hidden 2xl:inline">More</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="More screens and settings"
          className="absolute right-0 top-full mt-2 w-80 z-50 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl shadow-slate-900/10 dark:shadow-black/50 p-2 animate-fade-in"
        >
          <ul className="space-y-0.5">
            {MORE_MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const current = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(() => onSelect(item.id))}
                    aria-current={current ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      current
                        ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-200'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="shrink-0 p-1.5 rounded-lg bg-slate-100 dark:bg-white/10">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{item.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {onOpenPreferences && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => choose(onOpenPreferences)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="shrink-0 p-1.5 rounded-lg bg-slate-100 dark:bg-white/10">
                  <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold">Preferences &amp; settings</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Navbar({
  onResetDemo,
  isResetting,
  activeTab,
  setActiveTab,
  onNavigateScreen,
  unreadNotificationsCount = 0,
  onOpenPreferences,
  theme = 'light',
  onToggleTheme
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileNavRef = useRef(null);

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

  // Secondary screens may resolve to a tab + sub-tab (App owns that mapping)
  const handleSelectScreen = (screenId) => {
    (onNavigateScreen || setActiveTab)(screenId);
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
    href: `#${item.id}`,
    icon: item.icon,
    ...(item.id === 'notifications'
      ? {
          badge: unreadNotificationsCount,
          ariaLabel:
            unreadNotificationsCount > 0
              ? `Notifications, ${unreadNotificationsCount} unread notifications`
              : 'Notifications'
        }
      : {})
  }));

  const currentSpotlightIndex = spotlightNavItems.findIndex((item) => item.id === activeTab);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl backdrop-saturate-150 border-b border-slate-200/70 dark:border-white/10 transition-colors duration-150 font-sans">
        {/* Top Privacy & Verified Banner (desktop/tablet only) */}
        <div className="hidden sm:flex bg-gradient-to-r from-blue-600/[0.06] via-indigo-500/[0.05] to-violet-500/[0.06] dark:from-blue-500/10 dark:via-indigo-500/10 dark:to-violet-500/10 border-b border-slate-200/60 dark:border-white/5 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300 items-center justify-between gap-3 min-w-0 transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <span className="truncate min-w-0 font-medium">
              <strong className="text-blue-700 dark:text-blue-300 font-semibold">Smart Student Companion:</strong> Integrated Academics, Multimodal Transit &amp; Campus Collaboration.
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-slate-500 dark:text-slate-400 shrink-0 text-[11px] font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
              Mumbai GTFS &amp; Academic Engine
            </span>
            <span>OSRM Multimodal</span>
          </div>
        </div>

        {/* Main Navbar Bar */}
        <div className="max-w-[1650px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-4">

          {/* Brand Logo & Title */}
          <button
            type="button"
            onClick={() => handleSelectTab('dashboard')}
            className="flex items-center gap-3 text-left select-none group min-w-0 flex-1 lg:flex-none rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Smart Student Companion — go to dashboard"
          >
            <Logo />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display font-bold text-[15px] sm:text-lg tracking-tight text-slate-900 dark:text-white truncate">
                  Smart Student Companion
                </span>
                <span className="hidden 2xl:inline px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 shrink-0">
                  MUMBAI
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden xl:block truncate font-medium">
                Academic Hub • AI Scheduling • Route Planning • Safety Pools
              </p>
            </div>
          </button>

          {/* Desktop Primary Navigation with Spotlight Navbar */}
          <div className="hidden lg:flex items-center gap-2">
            <SpotlightNavbar
              items={spotlightNavItems}
              activeIndex={currentSpotlightIndex >= 0 ? currentSpotlightIndex : -1}
              onItemClick={(item) => handleSelectTab(item.id || 'dashboard')}
              className="py-0"
            />
          </div>

          {/* Top Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <MoreMenu
              activeTab={activeTab}
              onSelect={handleSelectScreen}
              onOpenPreferences={onOpenPreferences}
            />

            {onToggleTheme && (
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            )}

            <button
              type="button"
              onClick={() => handleSelectTab('account')}
              aria-label="Open student account and profile"
              aria-current={activeTab === 'account' ? 'page' : undefined}
              className={`flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-3.5 rounded-full text-xs font-bold transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                activeTab === 'account'
                  ? 'bg-blue-700 text-white border-blue-700 shadow-lg shadow-blue-500/30'
                  : 'bg-white/80 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-blue-400 dark:hover:border-blue-400/60 hover:bg-blue-50/60 dark:hover:bg-white/10'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-violet-500 flex items-center justify-center text-white shrink-0">
                <UserRound className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              <span className="hidden sm:inline">Profile</span>
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
              Main Menu
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

            {/* Secondary screens */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1.5">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                More
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {MORE_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectScreen(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-200'
                          : 'bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
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

      {/* Mobile Bottom Fixed Navigation Bar (5 Items) */}
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
              aria-label={item.ariaLabel || item.label}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center px-0.5 py-2 min-h-[52px] rounded-xl transition-all relative focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'text-blue-700 dark:text-blue-300 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'text-blue-700 dark:text-blue-300 scale-110' : ''}`} aria-hidden="true" />
                {item.id === 'notifications' && unreadNotificationsCount > 0 && (
                  <UnreadCountBadge
                    count={unreadNotificationsCount}
                    srLabel="unread"
                    className="absolute -top-1 -right-2 border-white dark:border-slate-950"
                  />
                )}
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
