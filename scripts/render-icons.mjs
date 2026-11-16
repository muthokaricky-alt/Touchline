// Renders the Touchline icon set from one SVG design, using headless Chrome.
// Usage: node scripts/render-icons.mjs assets/images   (set CHROME_PATH if Chrome lives elsewhere)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const NAVY = '#101820';
const LINE = '#2C3D4B';
const ACCENT = '#B7F36B';

/**
 * The mark on a 1024 grid: a pitch seen from above (outline, halfway line,
 * centre circle) in a subtle line colour, the LEFT TOUCHLINE drawn bold in
 * the accent colour, and the ball on the centre spot.
 *   scale: shrink the mark towards the centre (adaptive icons need a safe zone)
 *   mono:  single colour (Android themed icons)
 */
function mark({ scale = 1, mono = null } = {}) {
  const subtle = mono ?? LINE;
  const accent = mono ?? ACCENT;
  return `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <rect x="262" y="172" width="500" height="680" rx="36" fill="none" stroke="${subtle}" stroke-width="30"/>
    <line x1="262" y1="512" x2="762" y2="512" stroke="${subtle}" stroke-width="30"/>
    <circle cx="512" cy="512" r="92" fill="none" stroke="${subtle}" stroke-width="30"/>
    <rect x="232" y="142" width="72" height="740" rx="36" fill="${accent}"/>
    <circle cx="512" cy="512" r="46" fill="${accent}"/>
  </g>`;
}

const svg = (size, { background = NAVY, ...markOptions } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}
  ${mark(markOptions)}
</svg>`;

const ICONS = [
  // iOS/general app icon: full bleed (iOS rounds the corners itself).
  { file: 'icon.png', size: 1024, svg: svg(1024) },
  // Android adaptive icon: the launcher crops to a circle/squircle, so the mark sits in the inner ~60%.
  { file: 'android-icon-foreground.png', size: 512, svg: svg(512, { background: null, scale: 0.62 }) },
  { file: 'android-icon-background.png', size: 512, svg: svg(512, { background: NAVY, scale: 0, mono: NAVY }) },
  { file: 'android-icon-monochrome.png', size: 432, svg: svg(432, { background: null, scale: 0.62, mono: '#FFFFFF' }) },
  // Splash: the mark alone on the navy splash background (configured in app.json).
  { file: 'splash-icon.png', size: 512, svg: svg(512, { background: null }) },
  { file: 'favicon.png', size: 48, svg: svg(48) },
];

const port = 9300 + Math.floor(Math.random() * 500);
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', `--user-data-dir=${join(tmpdir(), 'touchline-icon-render')}`, 'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Page.enable');
// Transparent page background, so icons without a background stay transparent.
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

for (const icon of ICONS) {
  await send('Emulation.setDeviceMetricsOverride', { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false });
  const html = `<html><body style="margin:0;background:transparent">${icon.svg}</body></html>`;
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
  await sleep(400);
  const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 } });
  writeFileSync(join(outDir, icon.file), Buffer.from(result.data, 'base64'));
  console.log(`${icon.file} ${icon.size}x${icon.size}`);
}
writeFileSync(join(outDir, 'touchline-icon.svg'), svg(1024).trim() + '\n');
ws.close(); chrome.kill(); process.exit(0);
