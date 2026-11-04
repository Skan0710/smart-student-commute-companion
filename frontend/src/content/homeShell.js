/**
 * Static first paint for "/": the same markup is prerendered into dist/index.html
 * and used as the Suspense fallback, so crawlers and phones see a real heading and
 * a hero before the app bundle arrives. React replaces it on mount.
 */
export const HOME_SHELL_HTML = `<main id="main-content" style="min-height:100vh;padding:1rem;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
  <section style="max-width:72rem;margin:0 auto;border-radius:1.5rem;padding:2rem 1.5rem;color:#fff;background:linear-gradient(135deg,#800020,#5c0017 55%,#38000e)">
    <h1 style="margin:0;font-size:clamp(1.9rem,6vw,3rem);line-height:1.1;font-weight:700;letter-spacing:-0.02em">Smart Student Commute Companion</h1>
    <p style="margin:1rem 0 0;max-width:36rem;line-height:1.6;color:#fde8ec">Plan your Mumbai commute, keep your timetable and coordinate rides with classmates.</p>
  </section>
  <div aria-hidden="true" style="max-width:72rem;margin:1rem auto 0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))">
    <div style="height:7rem;border-radius:1rem;background:#e2e8f0"></div>
    <div style="height:7rem;border-radius:1rem;background:#e2e8f0"></div>
    <div style="height:7rem;border-radius:1rem;background:#e2e8f0"></div>
  </div>
</main>`;
