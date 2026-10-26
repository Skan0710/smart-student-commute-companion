/**
 * Motion & Smooth Scrolling System (GSAP + Lenis Integration)
 *
 * Designed specifically for Smart Student Companion:
 * - Desktop: Enhances scroll fidelity via Lenis connected to GSAP ticker.
 * - Mobile / Touch devices: Preserves 100% native touch scrolling.
 * - Accessibility: Strictly respects prefers-reduced-motion.
 * - Zero Jank: Timelines and tickers are cleanly torn down on route change or unmount.
 */

import gsap from 'gsap';
import Lenis from 'lenis';

/**
 * Check if the user has requested reduced motion in their OS or browser.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Check if the primary input is a touch or coarse pointer (mobile/tablet).
 * @returns {boolean}
 */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

/**
 * Initialize Lenis smooth scrolling for desktop experiences only.
 * Returns a teardown function that terminates Lenis and detaches the GSAP ticker.
 *
 * @param {Object} [options]
 * @returns {() => void} Teardown function
 */
export function initDesktopSmoothScroll(options = {}) {
  // If reduced motion is preferred or if this is a touch screen, DO NOT hijack scrolling
  if (prefersReducedMotion() || isTouchDevice()) {
    return () => {};
  }

  try {
    const lenis = new Lenis({
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.0,
      infinite: false,
      // Let dialogs, carousels and textareas scroll natively instead of the page
      allowNestedScroll: true,
      ...options,
    });

    // Synchronize Lenis with GSAP's central animation loop
    function updateTicker(time) {
      lenis.raf(time * 1000);
    }

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
    };
  } catch (err) {
    console.warn('[motion] Failed to initialize desktop smooth scrolling:', err);
    return () => {};
  }
}

/**
 * Animate an element entrance with subtle GSAP motion.
 * Automatically no-ops when prefers-reduced-motion is active.
 *
 * @param {HTMLElement|string} target
 * @param {Object} [vars]
 * @returns {gsap.core.Tween|null}
 */
export function animateIn(target, vars = {}) {
  if (!target || prefersReducedMotion()) return null;

  return gsap.fromTo(
    target,
    {
      opacity: 0,
      y: vars.y ?? 12,
      ...vars.from,
    },
    {
      opacity: 1,
      y: 0,
      duration: vars.duration ?? 0.35,
      ease: vars.ease ?? 'power2.out',
      delay: vars.delay ?? 0,
      clearProps: 'transform,opacity',
      ...vars.to,
    }
  );
}

/**
 * Stagger route recommendation cards in the commute results view.
 *
 * @param {HTMLElement[]|string} targets
 * @param {Object} [options]
 * @returns {gsap.core.Tween|null}
 */
export function staggerRouteCards(targets, options = {}) {
  if (!targets || prefersReducedMotion()) return null;

  return gsap.fromTo(
    targets,
    {
      opacity: 0,
      y: 16,
    },
    {
      opacity: 1,
      y: 0,
      duration: 0.3,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'transform,opacity',
      ...options,
    }
  );
}
