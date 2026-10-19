import React, { useEffect, useState } from 'react';
import StickyCta from './components/public/StickyCta.jsx';
import { trackPageView, CONSENT_CHANGE_EVENT } from './services/analytics.js';
import PublicLayout from './components/public/PublicLayout.jsx';
import Breadcrumbs from './components/public/Breadcrumbs.jsx';
import AboutPage from './pages/public/AboutPage.jsx';
import NotFoundPage from './pages/public/NotFoundPage.jsx';
import PrivacyPage from './pages/public/PrivacyPage.jsx';
import useDocumentHead from './hooks/useDocumentHead.js';
import { buildPageJsonLd, normalizeSiteUrl } from './content/seo.js';
import { getBreadcrumbTrail } from './content/siteContent.js';
import { applyTheme, readThemePreference } from './utils/uiPreferences.js';

const PAGE_COMPONENTS = {
  about: AboutPage,
  privacy: PrivacyPage,
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
 * @param {boolean} [props.analyticsEnabled] - analytics is configured for this build
 * @param {string} [props.contactEmail] - published privacy contact (VITE_PRIVACY_CONTACT_EMAIL), if any
 */
export default function PublicSite({ route, siteUrl = '', analyticsEnabled = false, contactEmail = '' }) {
  const Page = PAGE_COMPONENTS[route.id] || NotFoundPage;
  const origin = normalizeSiteUrl(siteUrl);
  const trail = getBreadcrumbTrail(route.id);

  useDocumentHead(route.page, { siteUrl: origin, jsonLd: buildPageJsonLd(route.id, origin) });

  // Same persisted light/dark choice as the app
  useEffect(() => {
    applyTheme(readThemePreference());
  }, []);

  // Client-only: the sticky CTA observes the page's own CTA, so it mounts after hydration
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Page view for this public page (no-op unless analytics is configured and accepted)
  useEffect(() => {
    const report = () => trackPageView(window.location.pathname, '', { title: route.page.title });
    report();
    window.addEventListener(CONSENT_CHANGE_EVENT, report);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, report);
  }, [route]);

  return (
    <PublicLayout
      breadcrumbs={trail.length > 1 ? <Breadcrumbs trail={trail} /> : null}
      stickyCta={route.id === 'about' && mounted ? <StickyCta href="/" label="Plan my commute" /> : null}
    >
      <Page analyticsEnabled={analyticsEnabled} contactEmail={contactEmail} />
    </PublicLayout>
  );
}
