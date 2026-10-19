/**
 * SEO tag builder shared by the runtime <head> manager and the build-time
 * prerender, so crawlers (who read the prerendered HTML) and browsers (who
 * navigate client-side) are always told the same thing.
 *
 * Absolute URLs (canonical, og:url, og:image, JSON-LD) need the real
 * production origin, supplied as VITE_SITE_URL. It is never guessed: without
 * it those tags are omitted rather than pointing at an invented hostname.
 */

import { SITE_NAME, SOCIAL_IMAGE, PAGES, ABOUT, getBreadcrumbTrail } from './siteContent.js';

/** Validated origin ("https://example.org") or '' when unset/invalid. */
export function normalizeSiteUrl(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function absoluteUrl(siteUrl, path) {
  return siteUrl ? `${siteUrl}${path === '/' ? '/' : path}` : '';
}

/**
 * @typedef {{ tag: string, attrs?: Record<string,string>, text?: string }} HeadTag
 */

/**
 * @param {{ title: string, description: string, path?: string|null, noindex?: boolean, breadcrumb?: string }} page
 * @param {{ siteUrl?: string, jsonLd?: object[] }} [options]
 * @returns {HeadTag[]}
 */
export function buildSeoTags(page, { siteUrl = '', jsonLd = [] } = {}) {
  const origin = normalizeSiteUrl(siteUrl);
  const canonical = page.path && !page.noindex ? absoluteUrl(origin, page.path) : '';
  const image = origin ? `${origin}${SOCIAL_IMAGE.path}` : '';

  const tags = [
    { tag: 'title', text: page.title },
    { tag: 'meta', attrs: { name: 'description', content: page.description } },
    { tag: 'meta', attrs: { name: 'robots', content: page.noindex ? 'noindex, nofollow' : 'index, follow' } },
  ];

  if (canonical) tags.push({ tag: 'link', attrs: { rel: 'canonical', href: canonical } });

  tags.push(
    { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAME } },
    { tag: 'meta', attrs: { property: 'og:title', content: page.title } },
    { tag: 'meta', attrs: { property: 'og:description', content: page.description } },
    { tag: 'meta', attrs: { property: 'og:locale', content: 'en_IN' } }
  );
  if (canonical) tags.push({ tag: 'meta', attrs: { property: 'og:url', content: canonical } });
  if (image) {
    tags.push(
      { tag: 'meta', attrs: { property: 'og:image', content: image } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: String(SOCIAL_IMAGE.width) } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: String(SOCIAL_IMAGE.height) } },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: SOCIAL_IMAGE.alt } }
    );
  }

  tags.push(
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
    { tag: 'meta', attrs: { name: 'twitter:title', content: page.title } },
    { tag: 'meta', attrs: { name: 'twitter:description', content: page.description } }
  );
  if (image) {
    tags.push(
      { tag: 'meta', attrs: { name: 'twitter:image', content: image } },
      { tag: 'meta', attrs: { name: 'twitter:image:alt', content: SOCIAL_IMAGE.alt } }
    );
  }

  for (const data of jsonLd) {
    // "</script>" inside JSON would end the element early: escape "<".
    tags.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      text: JSON.stringify(data).replace(/</g, '\\u003c'),
    });
  }

  return tags;
}

/**
 * BreadcrumbList structured data. Only emitted when absolute URLs are known
 * and the visible breadcrumb trail has more than the home crumb.
 *
 * @param {{ label: string, path: string }[]} trail - ancestors then current page
 * @param {string} siteUrl
 * @returns {object|null}
 */
export function buildBreadcrumbJsonLd(trail, siteUrl) {
  const origin = normalizeSiteUrl(siteUrl);
  if (!origin || !Array.isArray(trail) || trail.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(origin, crumb.path),
    })),
  };
}

/** Escapes text for HTML text nodes and double-quoted attributes. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serializes head tags for the prerender. Every managed tag carries
 * data-seo so the runtime manager and the prerender can replace each other's.
 *
 * @param {HeadTag[]} tags
 * @returns {string}
 */
export function serializeHeadTags(tags) {
  return tags
    .map(({ tag, attrs = {}, text }) => {
      const attributes = Object.entries({ ...attrs, 'data-seo': '' })
        .map(([k, v]) => (v === '' ? k : `${k}="${escapeHtml(v)}"`))
        .join(' ');
      if (tag === 'meta' || tag === 'link') return `<${tag} ${attributes}>`;
      const body = tag === 'title' ? escapeHtml(text) : text;
      return `<${tag} ${attributes}>${body}</${tag}>`;
    })
    .join('\n    ');
}

/**
 * Structured data for a public page. Everything here is also visible on the
 * page (breadcrumbs) or is a plain description of the product; nothing is
 * invented (no ratings, reviews, prices, addresses or business details).
 *
 * @param {string} pageId
 * @param {string} siteUrl
 * @returns {object[]}
 */
export function buildPageJsonLd(pageId, siteUrl) {
  const origin = normalizeSiteUrl(siteUrl);
  const data = [];

  // Marked up only because the same questions and answers are visible on the
  // page. (Search engines may or may not show them as rich results.)
  if (pageId === 'about') {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: ABOUT.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  // The rest needs absolute URLs, which need the real production origin.
  if (!origin) return data;

  const breadcrumbs = buildBreadcrumbJsonLd(getBreadcrumbTrail(pageId), origin);
  if (breadcrumbs) data.push(breadcrumbs);

  if (pageId === 'about') {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      url: absoluteUrl(origin, '/'),
      description: PAGES.home.description,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Any',
      inLanguage: 'en-IN',
    });
  }
  return data;
}
