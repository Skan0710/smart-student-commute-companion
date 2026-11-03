/**
 * Above-the-fold check for the public pages
 *
 * Serves dist/ locally, opens each page in headless Chrome/Edge at a range of
 * real device sizes (via the DevTools protocol, no extra dependencies) and
 * verifies that a hero page's primary call to action ([data-primary-cta]) is fully
 * visible without scrolling and sits above the 600 px fold, that nothing
 * overflows horizontally, that the mobile sticky CTA stays hidden while the hero
 * CTA is on screen, and that it appears on pages whose CTA is further down. Optionally writes screenshots for a visual review.
 *
 * Run after a build:
 *   npm run build && node scripts/check-fold.mjs [--shots <dir>]
 * Add --full to capture whole pages instead of the first screen.
 * Optional: CHROME_PATH=/path/to/chrome-or-edge
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '../dist');
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

const FOLD = 600;
const VIEWPORTS = [
  { name: 'small phone', width: 320, height: 568, mobile: true },
  { name: 'phone', width: 360, height: 640, mobile: true },
  { name: 'large phone', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: false },
  { name: 'laptop', width: 1280, height: 720, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];
// hero: the page opens with its primary CTA, which must be above the fold.
// closing: the CTA sits at the end of the page, so on phones the sticky CTA must take over.
const PAGES = [
  { route: '/about', kind: 'hero' },
  { route: '/faq', kind: 'closing' },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.jpg': 'image/jpeg', '.xml': 'application/xml' };

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error('No Chrome/Edge found. Install one or set CHROME_PATH.');
  return found;
}

function serve() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(dist, urlPath);
    if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) file = path.join(dist, urlPath.replace(/\/$/, ''), 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(150); }
  }
  throw new Error('Browser did not start');
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sscc-fold-'));
const port = 9300 + Math.floor(Math.random() * 500);
const browser = spawn(findBrowser(), [
  '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`, '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let failures = 0;
try {
  const targets = await getJson(`http://127.0.0.1:${port}/json`);
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

  for (const { route, kind } of PAGES) {
    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
      });
      await cdp.send('Page.navigate', { url: `${origin}${route}` });
      await sleep(1800); // hydration + sticky CTA observers

      const { result } = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const cta = document.querySelector('[data-primary-cta]');
          const r = cta ? cta.getBoundingClientRect() : null;
          const sticky = [...document.querySelectorAll('a')].find((a) => a.closest('.fixed') && /Plan my commute/.test(a.textContent));
          const heading = document.querySelector('h1');
          return {
            cta: r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } : null,
            innerHeight: window.innerHeight, innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            stickyShown: Boolean(sticky),
            h1: heading ? heading.textContent.trim().slice(0, 50) : null,
          };
        })()`,
      });
      const m = result.value;
      const limit = Math.min(FOLD, vp.height);
      const problems = [];
      if (!m.cta) problems.push('no [data-primary-cta] found');
      else {
        if (kind === 'hero') {
          if (m.cta.bottom > limit) problems.push(`CTA bottom ${Math.round(m.cta.bottom)}px is below the ${limit}px fold`);
          if (m.stickyShown && vp.mobile) problems.push('sticky CTA is shown while the hero CTA is on screen');
        } else if (vp.mobile && !m.stickyShown) {
          problems.push('CTA is far down the page and the mobile sticky CTA is not showing');
        }
        if (m.cta.left < 0 || m.cta.right > m.innerWidth) problems.push('CTA is clipped horizontally');
        if (m.cta.height < 44) problems.push(`CTA is only ${Math.round(m.cta.height)}px tall (touch target < 44px)`);
      }
      if (m.scrollWidth > m.innerWidth + 1) problems.push(`horizontal scroll (${m.scrollWidth} > ${m.innerWidth})`);

      const status = problems.length ? 'FAIL' : 'ok  ';
      if (problems.length) failures += 1;
      console.log(`${status} ${route.padEnd(7)} ${String(vp.width).padStart(4)}x${String(vp.height).padEnd(4)} ${vp.name.padEnd(12)} CTA ${m.cta ? `${Math.round(m.cta.top)}-${Math.round(m.cta.bottom)}px` : 'n/a'}${problems.length ? '  <- ' + problems.join('; ') : ''}`);

      if (shotsDir) {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: process.argv.includes('--full') });
        fs.writeFileSync(path.join(shotsDir, `${route.slice(1)}-${vp.width}x${vp.height}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
  }
  ws.close();
} finally {
  browser.kill();
  server.close();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* browser still releasing files */ }
}

console.log(failures === 0 ? '\nAll viewports pass.' : `\n${failures} viewport check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
