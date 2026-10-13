import { processFrame, rowUpdates } from './pipeline.js?v=20261013d';

const GRID = 'https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.101.0';
// Public, domain-bound key for toclocoinc.github.io; on localhost no key is needed.
const LICENCE = 'LG1.eyJ2IjoxLCJwIjoibGF0dGljZS1ncmlkIiwidCI6IlRPQ0xPQ08gSW5jIC0gcHVibGljIGRlbW9zIiwiZSI6IjIwMzAtMDEtMDEiLCJkIjpbInRvY2xvY29pbmMuZ2l0aHViLmlvIl19.9De42ua3aCGpiMB6EVRP7Tv-upUlDI-0T07rlSPzvCrsqg8t4YJi7SRnStEpAg48uzmcG7il1fR_TfwkUE7iCA';

const { createGrid, setLicence } = await import(GRID + '/lattice-grid.esm.min.js');
setLicence(LICENCE);

const FALLBACK_FPS_FLOOR = 30;
const SAMPLE_WINDOW_MS = 3000;

const KEYMAP = {
  ArrowUp: 173, ArrowDown: 175, ArrowLeft: 172, ArrowRight: 174,
  KeyF: 163, ShiftLeft: 163, ShiftRight: 163,
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
// The grid module above is fetched from the CDN; Start is live only once it is here, so a click can never be lost.
startButton.textContent = 'Start';
startButton.disabled = false;

let grid = null;
let cols = 320, rows = 200;
let cellPx = 1;
let prevPacked = null;
let dgKeyEvent = null;
let running = false;
let autoFallbackDecided = false;
let sampling = false;
let sampleStart = 0;
let sampleFrames = 0;

let frameCount = 0;
let playStart = 0; // first frame that changed a real share of the picture
let playFrames = 0;
let fpsWindowStart = 0;
let fps = 0;
let changedLast = 0;


/**
 * Size the stage to the largest cols x rows box of square cells that fits the
 * arena, so the grid sits inside the window at the frame's own aspect ratio
 * (160x100 and 80x50 are both 1.6:1) with no scrolling in either direction.
 * Returns the cell size in pixels.
 */
function fitStage(w, h) {
  const arena = document.getElementById('arena');
  const stage = document.getElementById('stage');
  const box = arena.getBoundingClientRect();
  const cell = Math.max(1, Math.min(Math.floor(box.width / w), Math.floor(box.height / h)));
  stage.style.width = (cell * w) + 'px';
  stage.style.height = (cell * h) + 'px';
  return cell;
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { buildGrid(cols, rows); }, 150);
});

function buildGrid(w, h) {
  if (grid) { grid.destroy(); grid = null; }
  cols = w; rows = h;
  playStart = 0; playFrames = 0;
  prevPacked = new Int32Array(cols * rows).fill(-1);

  const cell = fitStage(cols, rows);
  cellPx = cell;
  const cellWidth = cell;
  const cellHeight = cell;

  // One column: a frame row is one grid row whose single cell carries the
  // row's line of pixels as a hard-stop gradient (see rowGradient in
  // pipeline.js), so a frame costs one style write per changed row.
  const columns = [{ id: 'px', field: 'px', type: 'text', value: { format: () => '' }, sort: false, filter: false, layout: { width: cellWidth * cols, min: cellWidth * cols, resizable: false } }];
  const data = [];
  for (let r = 0; r < rows; r += 1) data.push({ key: 'r' + r, px: '' });

  grid = createGrid(gridHost, {
    columns,
    rows: data,
    rowKey: 'key',
    showHeader: false,
    gridLines: 'none',
    selection: 'none',
    rowHeight: cellHeight,
    density: 'compact',
    formatting: { px: [{ when: { op: 'notBlank' }, style: (p) => ({ backgroundImage: String(p.value) }) }] },
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

// Arm the frame-rate sample on the first movement key; the window itself
// starts on the first frame that changes a real share of the picture, so a
// static title screen (where almost nothing changes) cannot pass for play.
let sampleArmed = false;
function onMovementStart() {
  if (sampling || sampleArmed || autoFallbackDecided) return;
  sampleArmed = true;
}

function finishSampling() {
  sampling = false;
  const elapsed = performance.now() - sampleStart;
  const avgFps = sampleFrames / (elapsed / 1000);
  if (avgFps < FALLBACK_FPS_FLOOR && cols === 320) {
    setResolution(160, 100, false);
  }
  autoFallbackDecided = true;
}

window.__stats = { frames: 0, pipeMs: 0, applyMs: 0, gapMs: 0, lastEnd: 0 };
function onDoomFrame(heap, ptr, w, h) {
  if (!grid) return;
  if (!boot.hidden) boot.hidden = true;
  const st = window.__stats; const t0 = performance.now(); if (st.lastEnd) st.gapMs += t0 - st.lastEnd;
  const frame = processFrame(heap, ptr, w, h, cols, rows, prevPacked);
  const changed = frame.changed;
  const updates = rowUpdates(frame, prevPacked, cols, cellPx);
  const t1 = performance.now();
  if (updates.length && !window.__noApply) grid.rows.apply({ update: updates });
  const t2 = performance.now(); st.frames += 1; st.pipeMs += t1 - t0; st.applyMs += t2 - t1; st.lastEnd = t2;
  changedLast = changed;

  frameCount += 1;
  const now = performance.now();
  if (!fpsWindowStart) fpsWindowStart = now;
  if (now - fpsWindowStart >= 500) {
    fps = Math.round((frameCount * 1000) / (now - fpsWindowStart));
    frameCount = 0;
    fpsWindowStart = now;
  }
  if (!playStart && changed > (cols * rows) / 4) playStart = now;
  if (playStart) playFrames += 1;
  if (sampleArmed && !sampling && changed > (cols * rows) / 4) {
    sampleArmed = false;
    sampling = true;
    sampleStart = now;
    sampleFrames = 0;
  }
  if (sampling) {
    sampleFrames += 1;
    if (now - sampleStart >= SAMPLE_WINDOW_MS) finishSampling();
  }
  overlay.textContent = `fps: ${fps || '—'} · changed pixels: ${changedLast} / ${cols * rows} · rows written: ${updates.length}`;
  window.__doom = { fps, avgFps: playStart ? Math.round((playFrames * 1000) / Math.max(1, now - playStart)) : 0, changed: changedLast, cols, rows, cells: cols * rows, rowsWritten: updates.length, running };
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
