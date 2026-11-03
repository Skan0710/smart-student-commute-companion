/**
 * Social share card generator (Open Graph / Twitter)
 *
 * Renders a 1200x630 PNG at public/og-image.png - the size Facebook, LinkedIn,
 * WhatsApp, Slack and X expect for large link previews. Like
 * scripts/rasterize-icons.js it uses the Chrome/Edge already installed on the
 * machine, so there are no new dependencies and text is drawn with real fonts.
 *
 * Only facts that are true of the product appear on the card: the name, what it
 * does, and the public modes it covers. No statistics, ratings or endorsements.
 *
 * Run: node scripts/generate-og-image.js   (optional CHROME_PATH=/path/to/chrome-or-edge)
 * Output (committed; regenerate only when the artwork or wording changes):
 *   public/og-image.png
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, '../public/og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: #ffffff;
    background:
      radial-gradient(circle at 85% 15%, rgba(96,165,250,0.45), transparent 45%),
      radial-gradient(circle at 10% 95%, rgba(16,185,129,0.35), transparent 40%),
      linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #1d4ed8 100%);
    display: flex; align-items: center; padding: 0 84px;
  }
  .wrap { display: flex; align-items: center; gap: 64px; width: 100%; }
  .copy { flex: 1; }
  .badge {
    display: inline-block; font-size: 24px; font-weight: 600; letter-spacing: .04em;
    padding: 8px 18px; border-radius: 999px; background: rgba(255,255,255,.16);
    border: 1px solid rgba(255,255,255,.35); margin-bottom: 28px;
  }
  h1 { font-size: 76px; line-height: 1.04; font-weight: 800; letter-spacing: -0.02em; }
  p { margin-top: 26px; font-size: 33px; line-height: 1.35; color: #dbeafe; max-width: 640px; }
  .modes { margin-top: 34px; display: flex; gap: 14px; }
  .modes span {
    font-size: 24px; font-weight: 600; padding: 8px 20px; border-radius: 12px;
    background: #ffffff; color: #1e3a8a;
  }
  .mark { width: 330px; height: 330px; flex: none; filter: drop-shadow(0 18px 34px rgba(15,23,42,.45)); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="copy">
      <div class="badge">FOR MUMBAI COLLEGE STUDENTS</div>
      <h1>Smart Student Companion</h1>
      <p>Plan your college commute across local trains, metro and buses.</p>
      <div class="modes"><span>Train</span><span>Metro</span><span>Bus</span></div>
    </div>
    <svg class="mark" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Smart Student Companion logo">
      <rect width="40" height="40" rx="10" fill="#ffffff"/>
      <path d="M20 9L31 15L20 21L9 15L20 9Z" fill="#2563EB"/>
      <path d="M20 19V32M13 24L27 27M27 24L13 27" stroke="#60A5FA" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="20" cy="21" r="2.5" fill="#ffffff" stroke="#2563EB" stroke-width="1.5"/>
    </svg>
  </div>
</body>
</html>`;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No Chrome/Edge found. Install one or set CHROME_PATH.');
  return found;
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sscc-og-'));
try {
  const page = path.join(workDir, 'og.html');
  fs.writeFileSync(page, html);
  execFileSync(
    findBrowser(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${path.join(workDir, 'profile')}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--screenshot=${output}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore', timeout: 60000 }
  );

  // The PNG header stores the real pixel size: refuse to ship the wrong dimensions.
  const header = fs.readFileSync(output).subarray(0, 24);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`og-image.png is ${width}x${height}, expected ${WIDTH}x${HEIGHT}`);
  }
  console.log(`wrote ${path.relative(process.cwd(), output)} (${width}x${height}, ${fs.statSync(output).size} bytes)`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
