import React, { useEffect } from 'react';
import PublicLayout from './components/public/PublicLayout.jsx';
import Breadcrumbs from './components/public/Breadcrumbs.jsx';
import AboutPage from './pages/public/AboutPage.jsx';
import NotFoundPage from './pages/public/NotFoundPage.jsx';
import useDocumentHead from './hooks/useDocumentHead.js';
import { buildPageJsonLd, normalizeSiteUrl } from './content/seo.js';
import { getBreadcrumbTrail } from './content/siteContent.js';
import { applyTheme, readThemePreference } from './utils/uiPreferences.js';

const PAGE_COMPONENTS = {
  about: AboutPage,
  notfound: NotFoundPage,
};

/**
 * PublicSite - renders every non-app page (About, 404)
 *
 * Used twice with identical output: by the build-time prerender (so crawlers
 * and no-JS visitors get real HTML) and in the browser (which takes over and
 * keeps the <head> and theme correct).
 *
 * @param {Object} props
 * @param {{ id: string, page: object }} props.route - from resolveRoute()
 * @param {string} [props.siteUrl] - real production origin (VITE_SITE_URL), if configured
 */
export default function PublicSite({ route, siteUrl = '' }) {
  const Page = PAGE_COMPONENTS[route.id] || NotFoundPage;
  const origin = normalizeSiteUrl(siteUrl);
  const trail = getBreadcrumbTrail(route.id);

  useDocumentHead(route.page, { siteUrl: origin, jsonLd: buildPageJsonLd(route.id, origin) });

  // Same persisted light/dark choice as the app
  useEffect(() => {
    applyTheme(readThemePreference());
  }, []);

  return (
    <PublicLayout breadcrumbs={trail.length > 1 ? <Breadcrumbs trail={trail} /> : null}>
      <Page />
    </PublicLayout>
  );
}
