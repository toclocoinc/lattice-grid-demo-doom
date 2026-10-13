// The downsample-diff pipeline shared by the live demo (main.js) and the
// benchmark (bench/bench.js): box-filter the engine's 320x200 BGRX
// framebuffer down to the grid's resolution, diff it against the previous
// frame, and return only the cells that changed (and the set of rows they are in,
// for the row-paint mode, which writes one gradient per changed row instead).
export function processFrame(heap, ptr, srcW, srcH, destW, destH, prev) {
  const bx = (srcW / destW) | 0;
  const by = (srcH / destH) | 0;
  const n = bx * by;
  const patchMap = new Map();
  const changedRows = new Set();
  let changed = 0;
  for (let ry = 0; ry < destH; ry += 1) {
    for (let rx = 0; rx < destW; rx += 1) {
      let rSum = 0, gSum = 0, bSum = 0;
      for (let yy = 0; yy < by; yy += 1) {
        const rowOffset = (ry * by + yy) * srcW;
        for (let xx = 0; xx < bx; xx += 1) {
          const i = ptr + (rowOffset + rx * bx + xx) * 4;
          bSum += heap[i];
          gSum += heap[i + 1];
          rSum += heap[i + 2];
        }
      }
      const packed = (((rSum / n) | 0) << 16) | (((gSum / n) | 0) << 8) | ((bSum / n) | 0);
      const idx = ry * destW + rx;
      if (prev[idx] !== packed) {
        prev[idx] = packed;
        changed += 1;
        changedRows.add(ry);
        let patch = patchMap.get(ry);
        if (!patch) { patch = { key: 'r' + ry }; patchMap.set(ry, patch); }
        patch['c' + rx] = '#' + packed.toString(16).padStart(6, '0');
      }
    }
  }
  return { changed, changedRows, updates: Array.from(patchMap.values()) };
}

// Row-paint mode: one hard-stop gradient per row, runs of the same colour merged,
// so a row of W cells becomes a single background-image on a single cell.
export function rowGradient(prev, ry, destW, cellPx) {
  const base = ry * destW;
  let out = 'linear-gradient(to right';
  let runStart = 0;
  let current = prev[base];
  for (let rx = 1; rx <= destW; rx += 1) {
    const packed = rx < destW ? prev[base + rx] : -2;
    if (packed !== current) {
      out += ',#' + (current & 0xffffff).toString(16).padStart(6, '0') + ' ' + (runStart * cellPx) + 'px ' + (rx * cellPx) + 'px';
      runStart = rx;
      current = packed;
    }
  }
  return out + ')';
}

// The row-paint update set for one processed frame: one patch per changed row,
// carrying that row's gradient. Shared by the live page and the bench.
export function rowUpdates(frame, prev, destW, cellPx) {
  const updates = [];
  for (const ry of frame.changedRows) updates.push({ key: 'r' + ry, px: rowGradient(prev, ry, destW, cellPx) });
  return updates;
}
