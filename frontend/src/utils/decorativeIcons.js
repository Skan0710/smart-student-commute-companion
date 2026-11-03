/**
 * Decorative icon hygiene.
 *
 * lucide-react renders plain SVG elements (class "lucide ...") without
 * aria-hidden. Almost every icon in the UI sits next to a visible text label (or
 * inside a button that has its own accessible name), so announcing it only adds
 * noise for screen-reader users. This marks any Lucide icon that has not been
 * given an explicit accessible name (aria-label / role / aria-labelledby / title)
 * as decorative.
 *
 * Icon-only controls must still be named on the control itself (aria-label on the
 * <button>); that is audited separately.
 */

const SELECTOR = 'svg.lucide:not([aria-hidden]):not([aria-label]):not([aria-labelledby]):not([role])';

/**
 * @param {{ querySelectorAll: (selector: string) => ArrayLike<{ setAttribute: Function, querySelector?: Function }> }} root
 * @returns {number} how many icons were marked
 */
export function markDecorativeIcons(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  let marked = 0;
  for (const svg of Array.from(root.querySelectorAll(SELECTOR))) {
    // An icon that carries its own <title> is intentionally informative.
    if (typeof svg.querySelector === 'function' && svg.querySelector('title')) continue;
    svg.setAttribute('aria-hidden', 'true');
    marked += 1;
  }
  return marked;
}

/**
 * Marks existing icons now and any added later (React renders lazily), batched to
 * one pass per animation frame.
 *
 * @param {Document} [doc]
 * @returns {() => void} stop observing
 */
export function observeDecorativeIcons(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || typeof MutationObserver === 'undefined') return () => {};
  let scheduled = false;
  const run = () => {
    scheduled = false;
    markDecorativeIcons(doc);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(run);
  };
  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
