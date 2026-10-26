"use client";

import React, { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { cn } from "@/lib/utils";

export interface NavItem {
    id?: string;
    label: string;
    href: string;
    badge?: number;
    icon?: React.ComponentType<{ className?: string }>;
}

export interface SpotlightNavbarProps {
    items?: NavItem[];
    className?: string;
    onItemClick?: (item: NavItem, index: number) => void;
    defaultActiveIndex?: number;
    activeIndex?: number;
}

export function SpotlightNavbar({
    items = [
        { label: "Home", href: "#home" },
        { label: "About", href: "#about" },
        { label: "Events", href: "#events" },
        { label: "Sponsors", href: "#sponsors" },
        { label: "Pricing", href: "#pricing" },
    ],
    className,
    onItemClick,
    defaultActiveIndex = 0,
    activeIndex: controlledActiveIndex,
}: SpotlightNavbarProps) {
    const navRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(
        controlledActiveIndex !== undefined ? controlledActiveIndex : defaultActiveIndex
    );
    const [hoverX, setHoverX] = useState<number | null>(null);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        if (controlledActiveIndex !== undefined) {
            setActiveIndex(controlledActiveIndex);
        }
    }, [controlledActiveIndex]);

    // Refs for the "light" positions so we can animate them imperatively
    const spotlightX = useRef(0);
    const ambienceX = useRef(0);

    useEffect(() => {
        const checkTheme = () => {
            setIsDark(document.documentElement.classList.contains('dark'));
        };
        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!navRef.current) return;
        const nav = navRef.current;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = nav.getBoundingClientRect();
            const x = e.clientX - rect.left;
            setHoverX(x);
            // Direct update for immediate feedback (no spring for the mouse itself, feels snappier)
            spotlightX.current = x;
            nav.style.setProperty("--spotlight-x", `${x}px`);
        };

        const handleMouseLeave = () => {
            setHoverX(null);
            // When mouse leaves, spring the spotlight back to the active item
            const activeItem = nav.querySelector(`[data-index="${activeIndex}"]`);
            if (activeItem) {
                const navRect = nav.getBoundingClientRect();
                const itemRect = activeItem.getBoundingClientRect();
                const targetX = itemRect.left - navRect.left + itemRect.width / 2;

                animate(spotlightX.current, targetX, {
                    type: "spring",
                    stiffness: 200,
                    damping: 20,
                    onUpdate: (v) => {
                        spotlightX.current = v;
                        nav.style.setProperty("--spotlight-x", `${v}px`);
                    }
                });
            }
        };

        nav.addEventListener("mousemove", handleMouseMove);
        nav.addEventListener("mouseleave", handleMouseLeave);

        return () => {
            nav.removeEventListener("mousemove", handleMouseMove);
            nav.removeEventListener("mouseleave", handleMouseLeave);
        };
    }, [activeIndex]);

    // Handle the "Ambience" (Active Item) Movement
    useEffect(() => {
        if (!navRef.current) return;
        const nav = navRef.current;
        const activeItem = nav.querySelector(`[data-index="${activeIndex}"]`);

        if (activeItem) {
            const navRect = nav.getBoundingClientRect();
            const itemRect = activeItem.getBoundingClientRect();
            const targetX = itemRect.left - navRect.left + itemRect.width / 2;

            animate(ambienceX.current, targetX, {
                type: "spring",
                stiffness: 200,
                damping: 20,
                onUpdate: (v) => {
                    ambienceX.current = v;
                    nav.style.setProperty("--ambience-x", `${v}px`);
                },
            });
        }
    }, [activeIndex]);

    const handleItemClick = (item: NavItem, index: number) => {
        setActiveIndex(index);
        onItemClick?.(item, index);
    };

    return (
        <div className={cn("relative flex justify-center", className)}>
            <nav
                ref={navRef}
                className={cn(
                    "spotlight-nav spotlight-nav-bg glass-border spotlight-nav-shadow",
                    "relative h-11 rounded-full transition-all duration-300 overflow-hidden"
                )}
            >
                {/* Content */}
                <ul className="relative flex items-center h-full px-2 gap-0 z-[10]">
                    {items.map((item, idx) => (
                        <li key={idx} className="relative h-full flex items-center justify-center">
                            <a
                                href={item.href}
                                data-index={idx}
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleItemClick(item, idx);
                                }}
                                className={cn(
                                    "px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors duration-200 rounded-full flex items-center gap-1.5 whitespace-nowrap",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-white/30",
                                    // Active vs Inactive Text
                                    activeIndex === idx
                                        ? "text-blue-600 dark:text-white"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                {item.icon && React.createElement(item.icon, { className: "w-3.5 h-3.5 shrink-0" })}
                                <span>{item.label}</span>
                                {item.badge !== undefined && item.badge > 0 && (
                                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                        {item.badge}
                                    </span>
                                )}
                            </a>
                        </li>
                    ))}
                </ul>

                {/* LIGHTING LAYERS 
           We use CSS variables --spotlight-x and --ambience-x updated by JS
        */}

                {/* 1. The Moving Spotlight (Follows Mouse) */}
                <div
                    className="pointer-events-none absolute bottom-0 left-0 w-full h-full z-[1] opacity-0 transition-opacity duration-300"
                    style={{
                        opacity: hoverX !== null ? 1 : 0,
                        background: `
              radial-gradient(
                120px circle at var(--spotlight-x) 100%, 
                var(--spotlight-color, rgba(0,0,0,0.1)) 0%, 
                transparent 50%
              )
            `
                    }}
                />

                {/* 2. The Active State Ambience (Stays on Active) */}
                <div
                    className="pointer-events-none absolute bottom-0 left-0 w-full h-[2px] z-[2]"
                    style={{
                        background: `
                  radial-gradient(
                    60px circle at var(--ambience-x) 0%, 
                    var(--ambience-color, rgba(0,0,0,1)) 0%, 
                    transparent 100%
                  )
                `
                    }}
                />

            </nav>

            {/* STYLE BLOCK for Dynamic Colors 
        This allows us to switch the gradient colors cleanly using Tailwind classes 
        without messy inline conditionals.
      */}
            <style>{`
        nav {
          /* Light Mode Colors: Dark Gray/Black lights */
          --spotlight-color: rgba(0,0,0,0.08);
          --ambience-color: rgba(0,0,0,0.8);
        }
        .dark nav {
          /* Dark Mode Colors: White lights */
          --spotlight-color: rgba(255,255,255,0.15);
          --ambience-color: rgba(255,255,255,1);
        }
      `}</style>
        </div>
    );
}

export default SpotlightNavbar;
