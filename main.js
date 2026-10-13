import { processFrame } from './pipeline.js?v=20261013a';

const GRID = 'https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.100.1';
// Public, domain-bound key for toclocoinc.github.io; on localhost no key is needed.
const LICENCE = 'LG1.eyJ2IjoxLCJwIjoibGF0dGljZS1ncmlkIiwidCI6IlRPQ0xPQ08gSW5jIC0gcHVibGljIGRlbW9zIiwiZSI6IjIwMzAtMDEtMDEiLCJkIjpbInRvY2xvY29pbmMuZ2l0aHViLmlvIl19.9De42ua3aCGpiMB6EVRP7Tv-upUlDI-0T07rlSPzvCrsqg8t4YJi7SRnStEpAg48uzmcG7il1fR_TfwkUE7iCA';

const { createGrid, setLicence } = await import(GRID + '/lattice-grid.esm.min.js');
setLicence(LICENCE);

const FALLBACK_FPS_FLOOR = 30;
const SAMPLE_WINDOW_MS = 3000;

const KEYMAP = {
  ArrowUp: 173, ArrowDown: 175, ArrowLeft: 172, ArrowRight: 174,
  ControlLeft: 163, ControlRight: 163,
  Space: 162,
  Escape: 27,
  Enter: 13,
  Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52, Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,
};
const MOVEMENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const $ = (id) => document.getElementById(id);
const gridHost = $('grid');
const boot = $('boot');
const overlay = $('overlay');
const startButton = $('start');

let grid = null;
let cols = 160, rows = 100;
let prevPacked = null;
let dgKeyEvent = null;
let running = false;
let autoFallbackDecided = false;
let sampling = false;
let sampleStart = 0;
let sampleFrames = 0;

let frameCount = 0;
let fpsWindowStart = 0;
let fps = 0;
let changedLast = 0;

function buildGrid(w, h) {
  if (grid) { grid.destroy(); grid = null; }
  cols = w; rows = h;
  prevPacked = new Int32Array(cols * rows).fill(-1);

  const rect = gridHost.getBoundingClientRect();
  const cellWidth = Math.max(1, Math.floor(rect.width / cols));
  const cellHeight = Math.max(1, Math.floor(rect.height / rows));

  const columns = [];
  for (let c = 0; c < cols; c += 1) {
    columns.push({ id: 'c' + c, field: 'c' + c, type: 'text', cell: { template: '' }, sort: false, filter: false, layout: { width: cellWidth, resizable: false } });
  }
  const data = [];
  for (let r = 0; r < rows; r += 1) {
    const row = { key: 'r' + r };
    for (let c = 0; c < cols; c += 1) row['c' + c] = '#000000';
    data.push(row);
  }

  grid = createGrid(gridHost, {
    columns,
    rows: data,
    rowKey: 'key',
    showHeader: false,
    gridLines: 'none',
    selection: 'none',
    rowHeight: cellHeight,
    density: 'compact',
    formatting: { '*': [{ when: { op: 'notBlank' }, style: (p) => ({ background: String(p.value) }) }] },
  });
}

function setResolution(w, h, manual) {
  buildGrid(w, h);
  document.querySelectorAll('[data-res]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.res === `${w}x${h}`)));
  if (manual) autoFallbackDecided = true; // a manual choice is not overridden by the auto-fallback
}

document.querySelectorAll('[data-res]').forEach((button) => {
  button.addEventListener('click', () => {
    const [w, h] = button.dataset.res.split('x').map(Number);
    setResolution(w, h, true);
  });
});

function onMovementStart() {
  if (sampling || autoFallbackDecided) return;
  sampling = true;
  sampleStart = performance.now();
  sampleFrames = 0;
}

function finishSampling() {
  sampling = false;
  const elapsed = performance.now() - sampleStart;
  const avgFps = sampleFrames / (elapsed / 1000);
  if (avgFps < FALLBACK_FPS_FLOOR && cols === 160) {
    setResolution(80, 50, false);
  }
  autoFallbackDecided = true;
}

function onDoomFrame(heap, ptr, w, h) {
  if (!grid) return;
  if (!boot.hidden) boot.hidden = true;
  const { changed, updates } = processFrame(heap, ptr, w, h, cols, rows, prevPacked);
  if (updates.length) grid.rows.apply({ update: updates });
  changedLast = changed;

  frameCount += 1;
  const now = performance.now();
  if (!fpsWindowStart) fpsWindowStart = now;
  if (now - fpsWindowStart >= 500) {
    fps = Math.round((frameCount * 1000) / (now - fpsWindowStart));
    frameCount = 0;
    fpsWindowStart = now;
  }
  if (sampling) {
    sampleFrames += 1;
    if (now - sampleStart >= SAMPLE_WINDOW_MS) finishSampling();
  }
  overlay.textContent = `fps: ${fps || '—'} · changed cells: ${changedLast} / ${cols * rows}`;
  window.__doom = { fps, changed: changedLast, cols, rows, cells: cols * rows, running };
}

function onDoomTitle() {
  // The engine reports its window title; nothing to do with it on this page.
}

window.addEventListener('keydown', (event) => {
  if (!running || !(event.code in KEYMAP)) return;
  event.preventDefault();
  dgKeyEvent?.(1, KEYMAP[event.code]);
  if (MOVEMENT_KEYS.has(event.code)) onMovementStart();
});
window.addEventListener('keyup', (event) => {
  if (!running || !(event.code in KEYMAP)) return;
  event.preventDefault();
  dgKeyEvent?.(0, KEYMAP[event.code]);
});

startButton.addEventListener('click', async () => {
  if (running) return;
  startButton.disabled = true;
  startButton.textContent = 'Loading…';
  const { default: createDoomModule } = await import('./engine/dist/doomgeneric.js?v=20261013a');
  const Module = await createDoomModule({ onDoomFrame, onDoomTitle, locateFile: (path) => `engine/dist/${path}` });
  dgKeyEvent = Module.cwrap('dg_key_event', 'void', ['number', 'number']);
  running = true;
  startButton.textContent = 'Running';
  gridHost.focus?.();
});

buildGrid(cols, rows);
window.__doom = { fps: 0, changed: 0, cols, rows, cells: cols * rows, running };
