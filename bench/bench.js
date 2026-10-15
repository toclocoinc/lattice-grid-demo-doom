import { processFrame, rowUpdates } from '../pipeline.js?v=20261015c';

const GRID = 'https://cdn.latticegrid.dev/lattice-grid@1.103.1';
const LICENCE = 'LG1.eyJ2IjoxLCJwIjoibGF0dGljZS1ncmlkIiwidCI6IlRPQ0xPQ08gSW5jIC0gcHVibGljIGRlbW9zIiwiZSI6IjIwMzAtMDEtMDEiLCJkIjpbInRvY2xvY29pbmMuZ2l0aHViLmlvIl19.9De42ua3aCGpiMB6EVRP7Tv-upUlDI-0T07rlSPzvCrsqg8t4YJi7SRnStEpAg48uzmcG7il1fR_TfwkUE7iCA';

const { createGrid, setLicence } = await import(GRID + '/lattice-grid.esm.min.js');
setLicence(LICENCE);

const RESOLUTIONS = [[320, 200], [160, 100], [80, 50]];

const $ = (id) => document.getElementById(id);
const gridHost = $('grid');
const status = $('status');
const tbody = document.querySelector('#results tbody');
const runButton = $('run');

async function loadFrames() {
  const meta = await (await fetch('frames.json')).json();
  const gz = await (await fetch('frames.bin.gz')).arrayBuffer();
  const stream = new Response(gz).body.pipeThrough(new DecompressionStream('gzip'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  return { meta, raw };
}

function buildBenchGrid(w, h) {
  const rect = gridHost.getBoundingClientRect();
  const cellWidth = Math.max(1, Math.floor(rect.width / w));
  const cellHeight = Math.max(1, Math.floor(rect.height / h));
  // The same shape as the live page: one column, one gradient per row.
  const columns = [{ id: 'px', field: 'px', type: 'text', value: { format: () => '' }, sort: false, filter: false, layout: { width: cellWidth * w, min: cellWidth * w, resizable: false } }];
  const data = [];
  for (let r = 0; r < h; r += 1) data.push({ key: 'r' + r, px: '' });
  const grid = createGrid(gridHost, {
    columns, rows: data, rowKey: 'key',
    showHeader: false, gridLines: 'none', selection: 'none',
    rowHeight: cellHeight, density: 'compact',
    formatting: { px: [{ when: { op: 'notBlank' }, style: (p) => ({ backgroundImage: String(p.value) }) }] },
  });
  return { grid, cellWidth };
}

// A resolution that cannot keep up stops early rather than hanging the page:
// the fps and changed-cell figures are still computed from the frames it did
// get through, which is exactly the number this page exists to produce. Each
// run also samples at most MAX_FRAMES of the recording, so the page reports
// quickly even though the committed recording covers a full ~5s walk.
const MAX_RUN_MS = 4000;
const MAX_FRAMES = 20;

function addRow(w, h, frames, totalChanged, elapsedMs, stoppedEarly) {
  const tr = document.createElement('tr');
  const fps = (frames / (elapsedMs / 1000)).toFixed(1);
  const avgChanged = (totalChanged / frames).toFixed(0);
  const frameLabel = stoppedEarly ? `${frames} (could not keep up)` : String(frames);
  tr.innerHTML = `<td>${w}&times;${h}</td><td>${w * h}</td><td>${frameLabel}</td><td>${avgChanged}</td><td>${fps}</td>`;
  tbody.appendChild(tr);
}

async function runResolution(w, h, raw, meta) {
  const frameBytes = meta.width * meta.height * meta.bytesPerPixel;
  const { grid, cellWidth } = buildBenchGrid(w, h);
  const prev = new Int32Array(w * h).fill(-1);
  let totalChanged = 0;
  let framesRun = 0;
  let stoppedEarly = false;
  const frameLimit = Math.min(meta.frameCount, MAX_FRAMES);
  const start = performance.now();
  for (let f = 0; f < frameLimit; f += 1) {
    const ptr = f * frameBytes;
    const frame = processFrame(raw, ptr, meta.width, meta.height, w, h, prev);
    const changed = frame.changed;
    const updates = rowUpdates(frame, prev, w, cellWidth);
    if (updates.length) grid.rows.apply({ update: updates });
    totalChanged += changed;
    framesRun += 1;
    // Yield to the browser after every frame so the tab stays responsive and
    // the repaint cost on screen is real, not deferred.
    await new Promise((r) => setTimeout(r, 0));
    if (performance.now() - start > MAX_RUN_MS) { stoppedEarly = true; break; }
  }
  const elapsedMs = performance.now() - start;
  addRow(w, h, framesRun, totalChanged, elapsedMs, stoppedEarly);
  grid.destroy();
}

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  tbody.innerHTML = '';
  status.textContent = 'Loading the recorded frames…';
  const { meta, raw } = await loadFrames();
  for (const [w, h] of RESOLUTIONS) {
    status.textContent = `Running at ${w}x${h}…`;
    await runResolution(w, h, raw, meta);
  }
  status.textContent = `Done: ${meta.frameCount} frames replayed at each resolution.`;
  runButton.disabled = false;
  window.__bench = { done: true };
});
