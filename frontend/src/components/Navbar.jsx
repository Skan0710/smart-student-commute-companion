import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  RotateCcw, 
  ShieldCheck, 
  Wifi, 
  WifiOff,  Users,
  AlertTriangle,
  TrainFront,
  Bookmark,
  Bell,
  BellRing,
  SlidersHorizontal,
  Smartphone,
  Download,
  Menu,
  X,
  BarChart3,
  UploadCloud,
  UserRound,
  MoreHorizontal,
  ChevronDown
} from 'lucide-react';
import { ENABLE_DEMO_RESET } from '../config/index.js';
import { ConfirmDialog, UnreadCountBadge } from './ui';
import ThemeToggle from './ThemeToggle';

/**
 * Valid application routes
 * Exported so the app layer can validate deep-link (?tab=) requests
 * against the same single source of truth used for rendering navigation.
 */
export const NAV_ITEMS = [
  {
    id: 'planner',
    label: 'Plan Route',
    shortLabel: 'Planner',
    icon: Compass,
    description: 'Multimodal AI transit recommendations'
  },
  {
    id: 'mycommutes',
    label: 'My Commutes',
    shortLabel: 'Commutes',
    icon: Bookmark,
    description: 'Saved commute setups for one-tap planning'
  },
  {
    id: 'transit',
    label: 'Transit Search',
    shortLabel: 'Search',
    icon: TrainFront,
    description: 'Official Mumbai GTFS stations & lines lookup'
  },
  {
    id: 'together',
    label: 'Travel Together',
    shortLabel: 'Together',
    icon: Users,
    description: 'Student safety ride pools & auto groups'
  },
  {
    id: 'feed',
    label: 'Live Alerts',
    shortLabel: 'Alerts',
    icon: AlertTriangle,
    description: 'Real-time crowd-sourced transit disruptions',
    hasBadge: true
  },
  {
    id: 'notifications',
    label: 'Notifications',
    shortLabel: 'Notices',
    icon: Bell,
    description: 'Recent student commute updates'
  },
  {
    id: 'devicealerts',
    label: 'Device Alerts',
    shortLabel: 'Device',
    icon: BellRing,
    description: 'OS-level alerts for live disruptions'
  },
  {
    id: 'installshare',
    label: 'Install & Share',
    shortLabel: 'Install',
    icon: Smartphone,
    description: 'App install status, sharing, and shortcuts'
  },
  {
    id: 'analytics',
    label: 'PWA Analytics',
    shortLabel: 'Stats',
    icon: BarChart3,
    description: 'Install, offline, cache & service-worker monitoring'
  },
  {
    id: 'offlinequeue',
    label: 'Offline Queue',
    shortLabel: 'Queue',
    icon: UploadCloud,
    description: 'Reports saved to send when you reconnect'
  },
  {
    id: 'account',
    label: 'Account',
    shortLabel: 'Account',
    icon: UserRound,
    description: 'Sign in to your optional student account'
  }
];

export const PRIMARY_NAV_IDS = ['planner', 'mycommutes', 'feed', 'together'];

export default function Navbar({ 
  isConnected, 
  onResetDemo, 
  isResetting,  activeTab,
  setActiveTab,
  reportsCount = 0,
  unreadNotificationsCount = 0,
  onOpenPreferences,
  canInstall = false,
  onInstallApp,
  theme = 'light',
  onToggleTheme
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileNavRef = useRef(null);
  const moreDropdownRef = useRef(null);

  const isSecondaryActive = !PRIMARY_NAV_IDS.includes(activeTab);
  const activeItem = NAV_ITEMS.find((item) => item.id === activeTab);

  // Close desktop more dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(e.target)) {
        setMoreDropdownOpen(false);
      }
    };
    if (moreDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [moreDropdownOpen]);

  const handleRequestReset = () => {
    setIsConfirmingReset(true);
  };

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

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-150">
        {/* Top Privacy & Security Notice Banner */}
        <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/80 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-3 min-w-0 transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="truncate min-w-0">
              <strong className="text-blue-700 dark:text-emerald-400 font-semibold">Privacy Protected:</strong> Area-level commute routing without continuous GPS tracking.
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-slate-500 dark:text-slate-400 shrink-0 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-emerald-500 animate-pulse" aria-hidden="true"></span>
              Mumbai GTFS Verified
            </span>
            <span>OSRM Multimodal</span>
          </div>
        </div>

        {/* Main Navbar Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 min-w-10">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 dark:from-emerald-500 dark:to-indigo-600 p-0.5 shadow-md shadow-blue-500/10 dark:shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Compass className="w-5 h-5 text-blue-600 dark:text-emerald-400" aria-hidden="true" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white truncate">
                  Smart Student Commute
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-blue-500/10 text-blue-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-blue-500/20 dark:border-emerald-500/20 shrink-0">
                  MUMBAI
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden lg:block truncate">
                Multimodal Transit • Community Disruptions • Weather Intelligence
              </p>
            </div>
          </div>

          {/* Desktop/Tablet Primary Navigation with Spotlight effect */}
          <nav
            className="hidden md:flex items-center bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-1 text-xs font-medium shrink-0 transition-all relative overflow-hidden spotlight-nav-shadow"
            role="navigation"
            aria-label="Main application navigation"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              e.currentTarget.style.setProperty('--spotlight-x', `${x}px`);
            }}
          >
            {/* Ambient & mouse spotlight overlay */}
            <span
              className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-60 transition-opacity"
              style={{
                background:
                  'radial-gradient(140px circle at var(--spotlight-x, 50%) 50%, rgba(37, 99, 235, 0.15), transparent 70%)',
              }}
              aria-hidden="true"
            />
            {NAV_ITEMS.filter((item) => PRIMARY_NAV_IDS.includes(item.id)).map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${item.id === 'feed' && !isActive ? 'text-amber-500' : ''}`} aria-hidden="true" />
                  <span className="hidden min-[2600px]:inline">{item.label}</span>
                  <span className="hidden min-[1840px]:inline min-[2600px]:hidden">{item.shortLabel}</span>
                  <span className="inline min-[1840px]:hidden">{item.label}</span>
                  {item.hasBadge && reportsCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-0.5 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                      }`}
                      aria-label={`${reportsCount} active alerts`}
                    >
                      {reportsCount}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Desktop More Menu Dropdown */}
            <div className="relative" ref={moreDropdownRef}>
              <button
                type="button"
                onClick={() => setMoreDropdownOpen(!moreDropdownOpen)}
                aria-expanded={moreDropdownOpen}
                aria-label={
                  unreadNotificationsCount > 0
                    ? `More options, ${unreadNotificationsCount} unread notifications`
                    : 'More navigation options'
                }
                title="More navigation options"
                className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 ${
                  isSecondaryActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="font-medium">
                  {isSecondaryActive ? activeItem?.shortLabel || 'More' : 'More'}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${moreDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                {unreadNotificationsCount > 0 && (
                  <UnreadCountBadge
                    count={unreadNotificationsCount}
                    variant="emerald"
                    srLabel="unread notifications"
                    className="ml-0.5"
                  />
                )}
              </button>

              {moreDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                    Secondary Views
                  </div>
                  {NAV_ITEMS.filter((item) => !PRIMARY_NAV_IDS.includes(item.id)).map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          handleSelectTab(item.id);
                          setMoreDropdownOpen(false);
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={
                          item.id === 'notifications' && unreadNotificationsCount > 0
                            ? `${item.label}, ${unreadNotificationsCount} unread notifications`
                            : item.label
                        }
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left transition-colors ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.id === 'notifications' && unreadNotificationsCount > 0 && (
                          <UnreadCountBadge
                            count={unreadNotificationsCount}
                            variant="emerald"
                            srLabel="unread notifications"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* Right Controls: Connectivity, Theme & Preferences */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Socket Status Badge */}
            <div
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
              }`}
              role="status"
              aria-live="polite"
              title={isConnected ? 'Live sync connected via Socket.IO' : 'Live sync disconnected, reconnecting...'}
            >
              {isConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" aria-hidden="true"></span>
                  <span className="font-medium text-[11px] hidden sm:inline">Live Sync</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-rose-500 dark:text-rose-400" aria-hidden="true" />
                  <span className="font-medium text-[11px] hidden sm:inline">Offline</span>
                </>
              )}
            </div>

            {/* Accessible Theme Switcher */}
            {onToggleTheme && (
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            )}

            {/* Preferences (client-side personalization controls) */}
            {onOpenPreferences && (
              <button
                type="button"
                onClick={onOpenPreferences}
                title="Personalize your interface"
                aria-label="Open preferences"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-all hover:border-slate-300 dark:hover:border-slate-500 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span className="hidden lg:inline">Preferences</span>
              </button>
            )}

            {/* Mobile Hamburger Toggle Button */}
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Drawer / Menu */}
        {mobileMenuOpen && (
          <div 
            id="mobile-navigation"
            ref={mobileNavRef}
            className="md:hidden border-t border-slate-200 dark:border-slate-800/80 bg-white/98 dark:bg-slate-950/98 px-4 pt-3 pb-5 space-y-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
            role="region"
            aria-label="Mobile navigation menu"
          >
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              Navigation
            </div>
            
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isActive
                        ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} aria-hidden="true" />
                      <div>
                        <div className="leading-tight">{item.label}</div>
                        <div className={`text-[11px] ${isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          {item.description}
                        </div>
                      </div>
                    </div>
                    {item.hasBadge && reportsCount > 0 && (
                      <span 
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {reportsCount}
                      </span>
                    )}
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

            {/* Mobile Theme Switcher */}
            {onToggleTheme && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Theme</span>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              </div>
            )}

            {/* Mobile Preferences Control */}
            {onOpenPreferences && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPreferences();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Preferences &amp; Settings</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Mobile Bottom Fixed Navigation Bar (Simplified 5-Item Touch Layout) */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/90 px-0.5 py-2 pb-safe flex items-center justify-around shadow-2xl transition-colors"
        role="navigation"
        aria-label="Mobile quick navigation"
      >
        {NAV_ITEMS.filter((item) => PRIMARY_NAV_IDS.includes(item.id)).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0 min-h-[48px] rounded-xl transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-400'} transition-transform`} aria-hidden="true" />
                {item.hasBadge && reportsCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 bg-amber-500 text-slate-950 text-[10px] font-extrabold rounded-full flex items-center justify-center border border-white dark:border-slate-950">
                    {reportsCount > 9 ? '9+' : reportsCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight max-w-full truncate">
                {item.shortLabel}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mt-0.5" aria-hidden="true" />
              )}
            </button>
          );
        })}
        {/* 5th Mobile Bottom Item: More Menu */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-expanded={mobileMenuOpen}
          aria-label={
            unreadNotificationsCount > 0
              ? `More features and settings, ${unreadNotificationsCount} unread notifications`
              : 'More features and settings'
          }
          className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0 min-h-[48px] rounded-xl transition-all relative focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isSecondaryActive
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <MoreHorizontal className={`w-5 h-5 ${isSecondaryActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} aria-hidden="true" />
            {unreadNotificationsCount > 0 && (
              <UnreadCountBadge
                count={unreadNotificationsCount}
                srLabel="unread"
                className="absolute -top-1 -right-2 border-white dark:border-slate-950"
              />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight max-w-full truncate">
            {isSecondaryActive ? activeItem?.shortLabel || 'More' : 'More'}
          </span>
          {isSecondaryActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mt-0.5" aria-hidden="true" />
          )}
        </button>
      </nav>

      {/* Destructive-action confirmation (UI only; action fires on confirm) */}
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
