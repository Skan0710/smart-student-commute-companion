import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * useCountUp - ease a number up to its target so a loaded stat feels earned.
 *
 * - Only finite numbers animate; anything else (a "—" placeholder, text) is returned as-is.
 * - It animates from the previously shown value, so a refreshed stat moves
 *   from 3 to 4 instead of replaying from 0.
 * - With prefers-reduced-motion it returns the target immediately.
 *
 * @param {number|string} target
 * @param {number} [duration=700] milliseconds
 * @returns {number|string}
 */
export default function useCountUp(target, duration = 700) {
  const isAnimatable = typeof target === 'number' && Number.isFinite(target);
  const [shown, setShown] = useState(isAnimatable && !prefersReducedMotion() ? 0 : target);
  const from = useRef(0);

  useEffect(() => {
    if (!isAnimatable || prefersReducedMotion()) {
      setShown(target);
      from.current = isAnimatable ? target : 0;
      return undefined;
    }
    const start = from.current;
    const delta = target - start;
    if (delta === 0) {
      setShown(target);
      return undefined;
    }
    let frame;
    let began;
    const tick = (now) => {
      if (began === undefined) began = now;
      const progress = Math.min(1, (now - began) / duration);
      const value = Math.round(start + delta * easeOutCubic(progress));
      from.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, isAnimatable]);

  return isAnimatable ? shown : target;
}
