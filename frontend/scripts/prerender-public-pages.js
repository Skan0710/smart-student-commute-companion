/**
 * Prerender public pages (runs after `vite build`)
 *
 * A client-rendered app tells crawlers nothing until JavaScript runs, and a
 * 404 page must be a real file for static hosts to serve with a 404 status.
 * This step turns dist/index.html into:
 *
 *   dist/index.html        home (the app): page-specific <head>, <noscript> summary
 *   dist/about/index.html  rendered About page + its own <head>
 *   dist/404.html          rendered Not-Found page (noindex)
 *   dist/robots.txt        crawl rules (+ Sitemap line only when the origin is known)
 *   dist/sitemap.xml       only when VITE_SITE_URL is configured
 *
 * The page markup comes from the SAME React components the browser mounts
 * (bundled with esbuild, rendered with react-dom/server), and all head tags
 * come from src/content/seo.js. The production origin is VITE_SITE_URL; it is
 * never guessed, so without it canonical/og:url/og:image/sitemap are omitted.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { build } from 'esbuild';
import { loadEnv } from 'vite';

import { PAGES, ABOUT, SITE_NAME } from '../src/content/siteContent.js';
import {
  buildPageJsonLd,
  buildSeoTags,
  escapeHtml,
  normalizeSiteUrl,
  serializeHeadTags,
} from '../src/content/seo.js';
import { listPrerenderedPages } from '../src/utils/publicRoutes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  throw new Error('dist/index.html not found: run `vite build` first.');
}

const env = loadEnv('production', root, 'VITE_');
const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL);
if (env.VITE_SITE_URL && !siteUrl) {
  console.warn('[prerender] VITE_SITE_URL is not a valid http(s) origin; ignoring it.');
}

const siteConfig = {
  siteUrl,
  analyticsEnabled: Boolean(env.VITE_GA_MEASUREMENT_ID),
  contactEmail: env.VITE_PRIVACY_CONTACT_EMAIL || '',
};

// ---- 1. Bundle + load the renderer ------------------------------------------
const cacheDir = path.join(root, 'node_modules', '.cache', 'sscc-prerender');
fs.mkdirSync(cacheDir, { recursive: true });
const bundled = path.join(cacheDir, 'entry.mjs');

await build({
  entryPoints: [path.join(root, 'src/prerender/entry.jsx')],
  outfile: bundled,
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
  logLevel: 'error',
});
const { renderPublicPage } = await import(`${pathToFileURL(bundled).href}?t=${Date.now()}`);

// ---- 2. Head + body composition ---------------------------------------------
const baseHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

/** Remove head tags the prerender re-creates, so nothing appears twice. */
function stripManagedHead(html) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<meta\s+name="(?:description|keywords|robots)"[^>]*>/gi, '')
    .replace(/\s*<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/gi, '')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '');
}

function composePage({ page, routeId, body = '', noscript = '' }) {
  const jsonLd = buildPageJsonLd(routeId, siteUrl);
  const headTags = serializeHeadTags(buildSeoTags(page, { siteUrl, jsonLd }));

  let html = stripManagedHead(baseHtml);
  html = html.replace('</head>', `    ${headTags}\n  </head>`);
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('Expected an empty <div id="root"></div> in dist/index.html');
  }
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>${noscript}`);
  return html;
}

function write(relativePath, contents) {
  const target = path.join(dist, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  console.log(`[prerender] wrote dist/${relativePath.replace(/\\/g, '/')}`);
}

// Home: the app mounts client-side, so crawlers without JS get a real summary
const homeNoscript = `
    <noscript>
      <div style="max-width:40rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.5">
        <h1>${escapeHtml(SITE_NAME)}</h1>
        <p>${escapeHtml(PAGES.home.description)}</p>
        <p>This app needs JavaScript to plan routes. <a href="${escapeHtml(PAGES.about.path)}">Read how it works</a>.</p>
      </div>
    </noscript>`;
write('index.html', composePage({ page: PAGES.home, routeId: 'home', noscript: homeNoscript }));

// Public pages with real content
for (const page of listPrerenderedPages().filter((p) => p.id !== 'home')) {
  const body = renderPublicPage({ id: page.id, page }, siteConfig);
  write(`${page.path.replace(/^\//, '')}/index.html`, composePage({ page, routeId: page.id, body }));
}

// Not-found page: a real 404.html (hosts serve it with a 404 status)
write(
  '404.html',
  composePage({
    page: PAGES.notFound,
    routeId: 'notfound',
    body: renderPublicPage({ id: 'notfound', page: PAGES.notFound }, siteConfig),
  })
);

// ---- 3. robots.txt / sitemap.xml -------------------------------------------
const robotsPath = path.join(dist, 'robots.txt');
let robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8').trimEnd() : 'User-agent: *\nAllow: /';
robots = robots.replace(/^Sitemap:.*$/gim, '').trimEnd();
if (siteUrl) robots += `\n\nSitemap: ${siteUrl}/sitemap.xml`;
write('robots.txt', `${robots}\n`);

if (siteUrl) {
  const urls = listPrerenderedPages()
    .map((page) => `  <url><loc>${escapeHtml(`${siteUrl}${page.path}`)}</loc></url>`)
    .join('\n');
  write(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
} else {
  console.log('[prerender] VITE_SITE_URL not set: canonical/og:url/og:image/sitemap omitted (set it to the real production origin).');
}

// Keep the About CTA contract visible in build logs
console.log(`[prerender] About primary CTA -> ${ABOUT.primaryCta.href}`);
