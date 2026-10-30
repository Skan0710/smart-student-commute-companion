import React, { useRef, useState, useEffect } from 'react';
import { animate } from 'framer-motion';

/**
 * Tabs - Spotlight Reusable Tab Strip
 *
 * Implements the spotlight navbar design across every secondary navbar
 * and tab navigation strip throughout the entire application.
 *
 * Features:
 * - Dynamic spotlight following cursor position
 * - Spring-animated ambience light tracking the active tab
 * - Accessible keyboard roving tabindex and arrow-key navigation
 * - Rounded pill container with glass border and backdrop blur
 *
 * @param {Object} props
 * @param {Array<{id: string, label: React.ReactNode, icon?: React.ComponentType, count?: number, badge?: string, disabled?: boolean}>} props.tabs
 * @param {string} props.activeTab - Id of the currently selected tab
 * @param {Function} props.onChange - Called with the new tab id
 * @param {string} [props.ariaLabel='Sections'] - Accessible tablist label
 * @param {string} [props.idPrefix='tabs'] - Prefix used for tab/panel ids
 * @param {'sm'|'md'} [props.size='md'] - Control size
 * @param {string} [props.className=''] - Additional wrapper classes
 */
export default function Tabs({
  tabs = [],
  activeTab,
  onChange,
  ariaLabel = 'Sections',
  idPrefix = 'tabs',
  size = 'md',
  className = '',
}) {
  const listRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);

  const spotlightX = useRef(0);
  const ambienceX = useRef(0);

  // Mouse move listener for spotlight effect
  useEffect(() => {
    const nav = listRef.current;
    if (!nav) return undefined;

    const handleMouseMove = (e) => {
      const rect = nav.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setHoverX(x);
      spotlightX.current = x;
      nav.style.setProperty('--tab-spotlight-x', `${x}px`);
    };

    const handleMouseLeave = () => {
      setHoverX(null);
      const activeEl = nav.querySelector(`[data-tab-id="${activeTab}"]`);
      if (activeEl) {
        const navRect = nav.getBoundingClientRect();
        const itemRect = activeEl.getBoundingClientRect();
        const targetX = itemRect.left - navRect.left + itemRect.width / 2;

        animate(spotlightX.current, targetX, {
          type: 'spring',
          stiffness: 220,
          damping: 22,
          onUpdate: (v) => {
            spotlightX.current = v;
            nav.style.setProperty('--tab-spotlight-x', `${v}px`);
          },
        });
      }
    };

    nav.addEventListener('mousemove', handleMouseMove);
    nav.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      nav.removeEventListener('mousemove', handleMouseMove);
      nav.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [activeTab]);

  // Ambience active position tracking
  useEffect(() => {
    const nav = listRef.current;
    if (!nav) return;

    const activeEl = nav.querySelector(`[data-tab-id="${activeTab}"]`);
    if (activeEl) {
      const navRect = nav.getBoundingClientRect();
      const itemRect = activeEl.getBoundingClientRect();
      const targetX = itemRect.left - navRect.left + itemRect.width / 2;

      animate(ambienceX.current, targetX, {
        type: 'spring',
        stiffness: 240,
        damping: 24,
        onUpdate: (v) => {
          ambienceX.current = v;
          nav.style.setProperty('--tab-ambience-x', `${v}px`);
        },
      });
    }
  }, [activeTab]);

  const handleKeyDown = (e) => {
    const enabled = tabs.filter((t) => !t.disabled);
    if (enabled.length === 0) return;

    const currentIdx = enabled.findIndex((t) => t.id === activeTab);
    let nextIdx = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (currentIdx + 1) % enabled.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (currentIdx - 1 + enabled.length) % enabled.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = enabled.length - 1;
    }

    if (nextIdx === null || nextIdx === currentIdx) return;
    e.preventDefault();

    const next = enabled[nextIdx];
    onChange?.(next.id);
    const nextButton = listRef.current?.querySelector(`[data-tab-id="${next.id}"]`);
    nextButton?.focus();
  };

  const isSmall = size === 'sm';
  const sizeClasses = isSmall
    ? 'px-3 py-1.5 text-xs'
    : 'px-4 py-2 text-xs sm:text-sm';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex flex-nowrap items-center gap-1 rounded-full p-1.5 bg-[#fbf9f5] dark:bg-[#070913] border border-[#d8d3c5] dark:border-[#1e2440] shadow-md shadow-slate-900/5 dark:shadow-none overflow-x-auto max-w-full font-sans transition-all ${className}`}
      style={{
        '--tab-spotlight-color': 'var(--tab-spotlight-dynamic, rgba(128, 0, 32, 0.22))',
        '--tab-ambience-color': 'var(--tab-ambience-dynamic, rgba(128, 0, 32, 1))',
      }}
    >
      {/* 1. Mouse-following Spotlight Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300"
        style={{
          opacity: hoverX !== null ? 1 : 0,
          background: `radial-gradient(85px circle at var(--tab-spotlight-x, 50%) 100%, var(--tab-spotlight-color, rgba(59, 130, 246, 0.30)) 0%, transparent 60%)`,
        }}
      />

      {/* 2. Active Ambience Underglow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 w-full h-[2.5px] z-[1]"
        style={{
          background: `radial-gradient(65px circle at var(--tab-ambience-x, 50%) 0%, var(--tab-ambience-color, rgba(59, 130, 246, 1)) 0%, transparent 100%)`,
        }}
      />

      {/* Tab Buttons */}
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            data-tab-id={tab.id}
            onClick={() => !tab.disabled && onChange?.(tab.id)}
            className={`relative z-10 inline-flex items-center shrink-0 whitespace-nowrap gap-2 rounded-full font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${sizeClasses} ${
              isActive
                ? 'bg-[#800020] text-white shadow-md shadow-[#800020]/25 dark:bg-[#0047ff] dark:text-white dark:shadow-[#0047ff]/40'
                : 'text-[#586953] hover:text-[#1f2421] dark:text-slate-300 dark:hover:text-white hover:bg-[#edeae2]/60 dark:hover:bg-[#121526]'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            <span className="whitespace-nowrap">{tab.label}</span>
            {(typeof tab.count === 'number' || tab.badge) && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive
                    ? 'bg-white/20 text-white dark:bg-[#ccff00] dark:text-black font-extrabold'
                    : 'bg-[#edeae2] text-[#800020] dark:bg-[#121526] dark:text-[#ccff00]'
                }`}
              >
                {typeof tab.count === 'number' ? tab.count : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * TabPanel - Panel that pairs with a Tabs instance.
 * Renders the active panel only and wires aria-labelledby correctly.
 */
export function TabPanel({ idPrefix = 'tabs', tabId, children, className = '' }) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabId}`}
      aria-labelledby={`${idPrefix}-tab-${tabId}`}
      tabIndex={0}
      className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}
