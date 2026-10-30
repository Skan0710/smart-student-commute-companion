import React, { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { cn } from "@/lib/utils";

export interface NavItem {
    id?: string;
    label: string;
    shortLabel?: string;
    compactLabel?: string;
    href: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    ariaLabel?: string;
}

interface SpotlightNavbarProps {
    items: NavItem[];
    activeIndex?: number;
    onItemClick?: (item: NavItem, index: number) => void;
    className?: string;
}

/**
 * SpotlightNavbar - Navigation bar with moving dynamic cursor spotlight and
 * active-item ambience underglow.
 * Colors:
 * - Light Mode: Muted Sage Grey + Cream Beige + Burgundy ambience
 * - Dark Mode: Midnight Black + Electric Cobalt Blue + Acid Lime ambience
 */
export function SpotlightNavbar({
    items,
    activeIndex: controlledActiveIndex = 0,
    onItemClick,
    className,
}: SpotlightNavbarProps) {
    const [activeIndex, setActiveIndex] = useState(controlledActiveIndex);
    const [hoverX, setHoverX] = useState<number | null>(null);

    const navRef = useRef<HTMLElement>(null);
    const spotlightX = useRef(0);
    const ambienceX = useRef(0);

    // Sync state if controlled from outside
    useEffect(() => {
        setActiveIndex(controlledActiveIndex);
    }, [controlledActiveIndex]);

    // Handle the "Moving Spotlight" (Follows Cursor)
    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;

        const handleMouseMove = (e: MouseEvent) => {
            const navRect = nav.getBoundingClientRect();
            const x = e.clientX - navRect.left;
            setHoverX(x);

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
                    "spotlight-nav bg-cream-50/90 dark:bg-black/90 border border-[#d8d3c5] dark:border-[#1e2440] shadow-md shadow-slate-900/5 dark:shadow-none",
                    "relative h-12 rounded-full transition-all duration-300 overflow-hidden"
                )}
            >
                {/* Content */}
                <ul className="relative flex items-center h-full px-2 gap-0 z-[10]">
                    {items.map((item, idx) => (
                        <li key={idx} className="relative h-full flex items-center justify-center">
                            <a
                                href={item.href}
                                data-index={idx}
                                aria-label={item.ariaLabel}
                                aria-current={activeIndex === idx ? "page" : undefined}
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleItemClick(item, idx);
                                }}
                                className={cn(
                                    "px-4 py-2 text-sm sm:text-[15px] font-semibold transition-colors duration-200 rounded-full flex items-center gap-2 whitespace-nowrap",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] dark:focus-visible:ring-[#0047ff]",
                                    // Active vs Inactive Text
                                    activeIndex === idx
                                        ? "text-[#800020] font-bold dark:text-[#ccff00]"
                                        : "text-[#586953] hover:text-[#1f2421] dark:text-slate-300 dark:hover:text-white"
                                )}
                            >
                                {item.icon && React.createElement(item.icon, { className: "w-3.5 h-3.5 shrink-0", "aria-hidden": true } as React.ComponentProps<"svg">)}
                                {item.compactLabel ? (
                                    <>
                                        <span className="xl:hidden">{item.compactLabel}</span>
                                        <span className="hidden xl:inline">{item.label}</span>
                                    </>
                                ) : (
                                    <span>{item.label}</span>
                                )}
                                {item.badge !== undefined && item.badge > 0 && (
                                    <span aria-hidden="true" className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] leading-none font-bold bg-[#800020]/15 text-[#800020] dark:bg-[#ccff00]/20 dark:text-[#ccff00] border border-[#800020]/30 dark:border-[#ccff00]/40">
                                        {item.badge}
                                    </span>
                                )}
                            </a>
                        </li>
                    ))}
                </ul>

                {/* LIGHTING LAYERS */}
                {/* 1. The Moving Spotlight (Follows Mouse) */}
                <div
                    className="pointer-events-none absolute bottom-0 left-0 w-full h-full z-[1] opacity-0 transition-opacity duration-300"
                    style={{
                        opacity: hoverX !== null ? 1 : 0,
                        background: `
              radial-gradient(
                90px circle at var(--spotlight-x) 100%, var(--spotlight-color, rgba(128,0,32,0.12)) 0%, transparent 60%
              )
            `
                    }}
                />

                {/* 2. The Active State Ambience (Stays on Active) */}
                <div
                    className="pointer-events-none absolute bottom-0 left-0 w-full h-[2.5px] z-[2]"
                    style={{
                        background: `
                  radial-gradient(
                    55px circle at var(--ambience-x) 0%, var(--ambience-color, rgba(128,0,32,1)) 0%, transparent 100%
                  )
                `
                    }}
                />

            </nav>

            {/* STYLE BLOCK for Dynamic Colors */}
            <style>{`
        nav {
          /* Light Mode Colors: Burgundy Ambience with soft warm glow */
          --spotlight-color: rgba(128, 0, 32, 0.12);
          --ambience-color: rgba(128, 0, 32, 1);
        }
        .dark nav {
          /* Dark Mode Colors: Electric Cobalt Blue + Acid Lime */
          --spotlight-color: rgba(0, 71, 255, 0.35);
          --ambience-color: rgba(204, 255, 0, 1);
        }
      `}</style>
        </div>
    );
}

export default SpotlightNavbar;
