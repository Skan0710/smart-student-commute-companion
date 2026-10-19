import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { validateConfig } from './config/index.js';
import { registerServiceWorker } from './utils/registerSW.js';

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker after app renders
registerServiceWorker().catch(error => {
  console.error('Service worker registration failed:', error);
  // App continues to work without service worker
});
