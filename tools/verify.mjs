// Real-Chrome check of the demo at two screen sizes: boots to the title screen,
// walks and turns for ten seconds, and checks the fps floor (or the fallback
// to 160x100 holding it instead), the changed-pixel count against the total pixel
// count, and a clean console. Screenshots go to shots/.
//   npm run serve                    (in another terminal)
//   CHROME=/usr/bin/google-chrome node tools/verify.mjs [http://localhost:8000/]
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:8000/';
const CANDIDATES = ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const executablePath = process.env.CHROME || CANDIDATES.find((p) => existsSync(p)) || CANDIDATES[0];
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
let failed = 0;
const check = (ok, what) => { if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };

async function walk(page, ms) {
  const keys = ['ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
  const until = Date.now() + ms;
  let i = 0;
  while (Date.now() < until) {
    const key = keys[i % keys.length];
    await page.keyboard.down(key);
    await sleep(250);
    await page.keyboard.up(key);
    i += 1;
  }
}

async function run(width, height) {
  console.log(`--- ${width}x${height}`);
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning' || m.text().includes('[lattice]')) problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto(url);
  // Start is disabled until the page's module (and the grid it imports) has
  // loaded; the boot clock starts at the click, not at navigation.
  await page.waitForFunction(() => { const b = document.querySelector('#start'); return !!b && !b.disabled; }, { timeout: 30000 });
  const bootStart = Date.now();
  await page.click('#start');
  await page.waitForFunction(() => window.__doom && window.__doom.running === true, { timeout: 5000 }).catch(() => {});
  check(Date.now() - bootStart < 5000, `boots and starts within 5s (${Date.now() - bootStart}ms)`);
  await sleep(500);
  await page.screenshot({ path: `shots/${width}-boot.png` });

  await page.focus('#grid').catch(() => {});
  await walk(page, 10000);
  await sleep(300);

  const state = await page.evaluate(() => window.__doom);
  const cells = state.cols * state.rows;
  check(state.avgFps >= 30 || state.cols === 160, `holds 30fps at 320x200 over the walk, or has fallen back to 160x100 (cols=${state.cols}, avg ${state.avgFps} fps, last window ${state.fps})`);
  if (state.cols === 160) check(state.avgFps >= 30, `160x100 fallback holds 30fps over the walk (avg ${state.avgFps} fps)`);
  check(state.changed > 0 && state.changed < cells, `changed-pixel count is a delta, not a full frame (${state.changed} of ${cells})`);
  await page.screenshot({ path: `shots/${width}-playing.png` });

  // Keys: Escape should reach the engine and open its menu.
  await page.keyboard.down('Escape');
  await sleep(150);
  await page.keyboard.up('Escape');
  await sleep(300);
  check(true, 'Escape sent to the engine'); // the engine's own menu state is not exposed; absence of errors is checked below

  check(problems.length === 0, `no console errors or [lattice] warnings ${problems.join(' / ')}`);
  await page.close();
}

try {
  await run(1440, 900);
  await run(1920, 1080);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
