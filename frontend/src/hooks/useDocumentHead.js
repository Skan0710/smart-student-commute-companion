import { useEffect } from 'react';
import { buildSeoTags } from '../content/seo.js';

/** Tags this module owns, whether it or the prerender created them. */
const MANAGED_SELECTORS = [
  '[data-seo]',
  'meta[name="description"]',
  'meta[name="robots"]',
  'meta[name="keywords"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'link[rel="canonical"]',
];

/**
 * Replace the document's SEO tags with the ones for this page.
 *
 * Crawlers normally read the prerendered HTML, but a host that rewrites every
 * path to index.html (or the dev server) would otherwise leave the home page's
 * title on /about. This keeps client-side state truthful in every case.
 *
 * @param {{ title: string, description: string, path?: string|null, noindex?: boolean }} page
 * @param {{ siteUrl?: string, jsonLd?: object[] }} [options]
 */
export function applyDocumentHead(page, options = {}) {
  if (typeof document === 'undefined') return;

  document.head
    .querySelectorAll(MANAGED_SELECTORS.join(','))
    .forEach((node) => node.remove());

  for (const { tag, attrs = {}, text } of buildSeoTags(page, options)) {
    if (tag === 'title') {
      document.title = text;
      continue;
    }
    const el = document.createElement(tag);
    Object.entries({ ...attrs, 'data-seo': '' }).forEach(([key, value]) => el.setAttribute(key, value));
    if (text) el.textContent = text;
    document.head.appendChild(el);
  }
}

/** Keep <head> in sync with the page being shown. */
export default function useDocumentHead(page, options = {}) {
  const jsonLdKey = JSON.stringify(options.jsonLd || []);
  useEffect(() => {
    applyDocumentHead(page, options);
    // options object identity is irrelevant; its content is captured by the key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, options.siteUrl, jsonLdKey]);
}
