import { describe, it, expect } from 'vitest';
import { PAGES, FAQS, SOCIAL_IMAGE, FOOTER_LINKS } from './siteContent.js';
import { buildSeoTags, buildPageJsonLd, serializeHeadTags } from './seo.js';
import { resolveRoute, listPrerenderedPages } from '../utils/publicRoutes.js';
import { markDecorativeIcons } from '../utils/decorativeIcons.js';

const indexable = Object.values(PAGES).filter((page) => !page.noindex);
const tag = (tags, key) => tags.find((t) => t.attrs?.property === key || t.attrs?.name === key || t.attrs?.rel === key);

describe('page metadata', () => {
  it('gives every indexable page a unique title <= 60 and description <= 160 characters', () => {
    expect(indexable.map((p) => p.path).sort()).toEqual(['/', '/about', '/faq', '/privacy', '/terms']);
    expect(new Set(indexable.map((p) => p.title)).size).toBe(indexable.length);
    expect(new Set(indexable.map((p) => p.description)).size).toBe(indexable.length);
    for (const page of indexable) {
      expect(page.title.length).toBeLessThanOrEqual(60);
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(page.description.length).toBeGreaterThanOrEqual(70);
    }
  });

  it('emits canonical, Open Graph and large Twitter card tags only with a real origin', () => {
    const none = buildSeoTags(PAGES.faq, { siteUrl: '' });
    expect(tag(none, 'canonical')).toBeUndefined();
    expect(tag(none, 'og:image')).toBeUndefined();
    expect(tag(none, 'twitter:card').attrs.content).toBe('summary');

    const tags = buildSeoTags(PAGES.faq, { siteUrl: 'https://example.org/ignored?x=1' });
    expect(tag(tags, 'canonical').attrs.href).toBe('https://example.org/faq');
    expect(tag(tags, 'og:url').attrs.content).toBe('https://example.org/faq');
    expect(tag(tags, 'og:title').attrs.content).toBe(PAGES.faq.title);
    expect(tag(tags, 'og:image').attrs.content).toBe('https://example.org/og-image.png');
    expect(tag(tags, 'og:image:width').attrs.content).toBe(String(SOCIAL_IMAGE.width));
    expect(tag(tags, 'twitter:card').attrs.content).toBe('summary_large_image');
    expect(tag(tags, 'twitter:image').attrs.content).toBe('https://example.org/og-image.png');
  });

  it('marks the 404 page noindex with no canonical', () => {
    const tags = buildSeoTags(PAGES.notFound, { siteUrl: 'https://example.org' });
    expect(tag(tags, 'robots').attrs.content).toContain('noindex');
    expect(tag(tags, 'canonical')).toBeUndefined();
  });
});

describe('structured data', () => {
  it('describes the FAQ page with the five visible questions and escapes < in JSON-LD', () => {
    const [faq] = buildPageJsonLd('faq', '');
    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity.map((q) => q.name)).toEqual(FAQS.map((f) => f.question));
    const html = serializeHeadTags(
      buildSeoTags(PAGES.faq, { siteUrl: '', jsonLd: [{ x: '</script><script>alert(1)</script>' }] })
    );
    expect(html).not.toContain('</script><script>');
    expect(html).toContain('\\u003c');
  });

  it('adds WebApplication (Mumbai, students) to the landing page only when the origin is known, with no business data', () => {
    expect(buildPageJsonLd('home', '')).toEqual([]);
    const ld = buildPageJsonLd('home', 'https://example.org');
    const app = ld.find((d) => d['@type'] === 'WebApplication');
    expect(app.areaServed.name).toBe('Mumbai');
    expect(app.url).toBe('https://example.org/');
    expect(JSON.stringify(ld)).not.toMatch(/LocalBusiness|aggregateRating|telephone|streetAddress|priceRange/);
  });
});

describe('routing', () => {
  it('routes and prerenders every public page and links it from the footer', () => {
    for (const path of ['/about', '/faq', '/privacy', '/terms']) {
      expect(resolveRoute(path).page.path).toBe(path);
      expect(listPrerenderedPages().some((p) => p.path === path)).toBe(true);
      expect(FOOTER_LINKS.some((l) => l.href === path)).toBe(true);
    }
    expect(resolveRoute('/FAQ/').id).toBe('faq');
    expect(resolveRoute('/does-not-exist').id).toBe('notfound');
  });
});

describe('decorative icons', () => {
  const fakeSvg = (attrs = {}, hasTitle = false) => ({
    attrs: { ...attrs },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    querySelector: (sel) => (sel === 'title' && hasTitle ? {} : null),
  });

  it('hides unnamed Lucide icons but leaves titled ones alone', () => {
    const plain = fakeSvg();
    const titled = fakeSvg({}, true);
    const root = { querySelectorAll: () => [plain, titled] };
    expect(markDecorativeIcons(root)).toBe(1);
    expect(plain.attrs['aria-hidden']).toBe('true');
    expect(titled.attrs['aria-hidden']).toBeUndefined();
    expect(markDecorativeIcons(null)).toBe(0);
  });
});
