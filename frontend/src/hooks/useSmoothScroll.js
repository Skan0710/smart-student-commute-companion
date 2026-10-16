import { useEffect } from 'react';
import { initDesktopSmoothScroll } from '../utils/motion';

/**
 * Hook to manage desktop smooth scrolling lifecycle via Lenis.
 * Automatically no-ops on touch devices and respects prefers-reduced-motion.
 *
 * @param {boolean} [enabled=true]
 */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const cleanup = initDesktopSmoothScroll();
    return () => {
      cleanup();
    };
  }, [enabled]);
}
