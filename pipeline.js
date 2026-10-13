// The downsample-diff pipeline shared by the live demo (main.js) and the
// benchmark (bench/bench.js): box-filter the engine's 320x200 BGRX
// framebuffer down to the grid's resolution, diff it against the previous
// frame, and return only the cells that changed.
export function processFrame(heap, ptr, srcW, srcH, destW, destH, prev) {
  const bx = (srcW / destW) | 0;
  const by = (srcH / destH) | 0;
  const n = bx * by;
  const patchMap = new Map();
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
        let patch = patchMap.get(ry);
        if (!patch) { patch = { key: 'r' + ry }; patchMap.set(ry, patch); }
        patch['c' + rx] = '#' + packed.toString(16).padStart(6, '0');
      }
    }
  }
  return { changed, updates: Array.from(patchMap.values()) };
}
