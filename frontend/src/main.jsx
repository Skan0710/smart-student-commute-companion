import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import ConsentBanner from './components/ConsentBanner.jsx';
import { initAnalytics } from './services/analytics.js';
import PublicSite from './PublicSite.jsx';
import { resolveRoute } from './utils/publicRoutes.js';
import './index.css';
import { validateConfig } from './config/index.js';
import { registerServiceWorker } from './utils/registerSW.js';
import { observeDecorativeIcons } from './utils/decorativeIcons.js';

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

// Mirrors the markup prerendered into dist/index.html (src/content/homeShell.js)
function HomeShell() {
  const bar = { height: '7rem', borderRadius: '1rem', background: '#e2e8f0' };
  return (
    <main id="main-content" style={{ minHeight: '100vh', padding: '1rem', background: '#f8fafc', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <section style={{ maxWidth: '72rem', margin: '0 auto', borderRadius: '1.5rem', padding: '2rem 1.5rem', color: '#fff', background: 'linear-gradient(135deg,#800020,#5c0017 55%,#38000e)' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.9rem,6vw,3rem)', lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.02em' }}>Smart Student Commute Companion</h1>
        <p style={{ margin: '1rem 0 0', maxWidth: '36rem', lineHeight: 1.6, color: '#fde8ec' }}>Plan your Mumbai commute, keep your timetable and coordinate rides with classmates.</p>
      </section>
      <div aria-hidden="true" style={{ maxWidth: '72rem', margin: '1rem auto 0', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit,minmax(14rem,1fr))' }}>
        <div style={bar} /><div style={bar} /><div style={bar} />
      </div>
    </main>
  );
}

// Loads Google Analytics only if it is configured AND the visitor already accepted
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {route.id === 'app' ? (
      <Suspense fallback={<HomeShell />}>
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

// Lucide icons are decorative next to their labels: keep them out of the accessibility tree
observeDecorativeIcons();

// Register service worker after app renders
registerServiceWorker().catch(error => {
  console.error('Service worker registration failed:', error);
  // App continues to work without service worker
});
