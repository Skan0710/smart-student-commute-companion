import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * StickyCta - mobile-only primary action for public pages
 *
 * Shown on small screens once the page's own primary CTA has scrolled out of
 * view (so there is never a second competing primary button on screen), and
 * hidden when:
 *  - the on-screen keyboard is open (visualViewport shrinks) or a field has focus,
 *  - the analytics choice banner is showing (it owns the bottom edge),
 *  - the viewport is md+ (desktop has the header and in-page CTAs).
 * It respects the iOS safe area, and the layout reserves matching bottom
 * padding so it never hides content. Rendered client-side only.
 *
 * @param {Object} props
 * @param {string} props.href
 * @param {string} props.label
 * @param {string} [props.watchSelector] - element whose visibility gates this CTA
 */
export default function StickyCta({ href, label, watchSelector = '[data-primary-cta]' }) {
  const [heroVisible, setHeroVisible] = useState(true);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  useEffect(() => {
    const target = document.querySelector(watchSelector);
    if (!target || typeof IntersectionObserver === 'undefined') {
      setHeroVisible(false);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchSelector]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const check = () => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      const shrunk = viewport ? viewport.height < window.innerHeight * 0.75 : false;
      setKeyboardOpen(typing || shrunk);
    };
    viewport?.addEventListener('resize', check);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      viewport?.removeEventListener('resize', check);
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setConsentOpen(root.hasAttribute('data-consent-open'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-consent-open'] });
    return () => observer.disconnect();
  }, []);

  if (heroVisible || keyboardOpen || consentOpen) return null;

  return (
    <div
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <a
        href={href}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-base font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
      >
        {label}
        <ArrowRight className="w-5 h-5" aria-hidden="true" />
      </a>
    </div>
  );
}
