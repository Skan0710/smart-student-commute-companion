import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PublicSite from '../PublicSite.jsx';

/**
 * Build-time entry: renders a public page to static HTML with the very same
 * component the browser mounts, so crawlers, no-JS visitors and users all see
 * the same content. Bundled and executed by scripts/prerender-public-pages.js.
 *
 * @param {{ id: string, page: object }} route
 * @param {{ siteUrl?: string, analyticsEnabled?: boolean, contactEmail?: string }} config
 * @returns {string}
 */
export function renderPublicPage(route, config = {}) {
  return renderToStaticMarkup(<PublicSite route={route} {...config} />);
}
