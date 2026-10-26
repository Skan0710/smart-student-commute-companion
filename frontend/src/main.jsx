import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import ConsentBanner from './components/ConsentBanner.jsx';
import { initAnalytics } from './services/analytics.js';
import PublicSite from './PublicSite.jsx';
import { resolveRoute } from './utils/publicRoutes.js';
import './index.css';
import { validateConfig } from './config/index.js';
import { registerServiceWorker } from './utils/registerSW.js';

// Smooth scrolling is owned by the useSmoothScroll hook (App / PublicSite): it
// no-ops on touch devices and under prefers-reduced-motion, and tears down on
// unmount. Creating a second Lenis instance here made wheel scrolling animate twice.

// Validate configuration before rendering the app
try {
  validateConfig();
} catch (error) {
  console.error('Failed to start application due to configuration errors:', error);
  // Render error message in development
  if (import.meta.env.DEV) {
    // Built with DOM nodes + textContent so the message is never parsed as HTML.
    const panel = document.createElement('div');
    panel.setAttribute('style', 'padding: 2rem; font-family: monospace; background: #1e293b; color: #f1f5f9; min-height: 100vh;');
    const heading = document.createElement('h1');
    heading.setAttribute('style', 'color: #ef4444; margin-bottom: 1rem;');
    heading.textContent = '⚠️ Configuration Error';
    const lead = document.createElement('p');
    lead.setAttribute('style', 'margin-bottom: 1rem;');
    lead.textContent = 'The application cannot start due to missing or invalid configuration:';
    const details = document.createElement('pre');
    details.setAttribute('style', 'background: #0f172a; padding: 1rem; border-radius: 0.5rem; overflow-x: auto;');
    details.textContent = error.message;
    const hint = document.createElement('p');
    hint.setAttribute('style', 'margin-top: 1rem; color: #94a3b8;');
    hint.textContent = 'Check your .env.local file and ensure all required VITE_ environment variables are set. See frontend/.env.example for reference.';
    panel.append(heading, lead, details, hint);
    document.body.replaceChildren(panel);
    throw error; // Prevent app from rendering
  }
}

// The commute assistant lives at "/"; every other address is a known public
// page or a 404. Unknown URLs must never fall through to the app.
const route = resolveRoute(window.location.pathname);

// The app bundle (maps, planner, sockets) is only fetched on "/"; public pages stay light.
const App = lazy(() => import('./App.jsx'));

// Loads Google Analytics only if it is configured AND the visitor already accepted
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {route.id === 'app' ? (
      <Suspense fallback={<div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center text-slate-600 dark:text-slate-300">Loading Smart Commute…</div>}>
        <App />
      </Suspense>
    ) : (
      <PublicSite
        route={route}
        siteUrl={import.meta.env.VITE_SITE_URL || ''}
        analyticsEnabled={Boolean(import.meta.env.VITE_GA_MEASUREMENT_ID)}
        contactEmail={import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || ''}
      />
    )}
    <ConsentBanner />
  </React.StrictMode>,
);

// Register service worker after app renders
registerServiceWorker().catch(error => {
  console.error('Service worker registration failed:', error);
  // App continues to work without service worker
});
