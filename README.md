# WebAssembly Doom on a Lattice grid

**Live demo:** https://toclocoinc.github.io/lattice-grid-demo-doom/

Doom, compiled to [WebAssembly](https://github.com/ozkl/doomgeneric) with Emscripten, rendering into a [Lattice Grid](https://www.latticegrid.dev/) instead of a canvas. It works in three steps: the engine hands over its native 320&times;200 frame as a raw pixel buffer; the page diffs it against the previous frame (box-filtering it first when a lower resolution is selected); and only the rows whose pixels changed are pushed into the grid through its row-update API (`grid.rows.apply`), never a full re-render. A small overlay reports the changed-pixel count, the rows written and the frames per second achieved.

The grid has one row per frame row and a single column. Each row's cell carries that row's line of pixels as one hard-stop CSS gradient, with runs of the same colour merged, applied through a single formatting rule (`backgroundImage: cell value`) rather than a hand-written renderer, so the painting stays inside the grid's own public styling path. Header, gridlines, selection and hover are switched off and the cell padding zeroed through the grid's theming variables, so the rows tile edge to edge inside a stage that keeps the frame's aspect ratio. The default is the native 320&times;200; a resolution switch offers 160&times;100 and 80&times;50, and the page samples its own frame rate during the first seconds of movement and switches itself down to 160&times;100 if native cannot hold 30&nbsp;fps. On a desktop Chrome the native resolution runs at 30 to 60&nbsp;fps with around 170 row writes per frame while turning.

## Level data and licences

This demo ships [Freedoom: Phase 1](https://freedoom.github.io/) rather than the original shareware `doom1.wad`. Freedoom is a complete, original set of levels, art and sounds released under a BSD-style licence specifically so that it can be redistributed freely with a Doom engine; the original id Software shareware WAD's distribution terms are less precisely documented today, so Freedoom was the safer call for a public repository. `engine/freedoom1.wad` carries the Freedoom licence in `engine/FREEDOOM-LICENSE.txt`.

The engine is [doomgeneric](https://github.com/ozkl/doomgeneric), itself derived from Doom's original source release, licensed under the GNU General Public License v2 (see `engine/doomgeneric/LICENSE`). The platform-specific file this demo adds, `engine/doomgeneric/doomgeneric_lattice.c`, is likewise GPL-2: it hands each frame to the host page and reads keyboard input back from it, with no SDL dependency and no sound. Everything else on the page — the grid wiring, the pipeline, the bench — is MIT for this demo's own code; Lattice Grid itself is commercially licensed, see [latticegrid.dev/pricing](https://www.latticegrid.dev/pricing/).

## Run it

```
npm ci
npm run serve        # http://localhost:8000/
npm run verify        # headless Chrome check of boot, fps, deltas and console cleanliness
```

Press **Start** to boot into Doom. Arrow keys move and turn, F or Shift fires, Space uses, Enter confirms and Esc opens the menu; the number keys switch weapons. There is no audio in this build, so there is nothing to mute.

`npm run verify` loads the page at 1440&times;900 and 1920&times;1080, starts the engine, drives it with the keyboard, and checks that it reaches the title screen quickly, that the changed-cell count stays below the total cell count once the screen is moving, and that the console stays free of errors and `[lattice]` warnings. `/bench/` replays a committed recording of the same pipeline at 80&times;50, 160&times;100 and 320&times;200 and reports the changed cells and fps each one achieves, so the resolution limit is a measured number rather than a guess.

## Measured

Rebuilding `engine/dist/` requires [Emscripten](https://emscripten.org/); the recipe is `engine/doomgeneric/Makefile.lattice` (`emmake make -f Makefile.lattice`). The numbers below are from `/bench/` on the machine this was built on, replaying the first 20 frames of the committed recording at each resolution:

| Resolution | Cells  | Avg changed cells / frame | Achieved fps |
|------------|-------:|---------------------------:|-------------:|
| 80&times;50   |  4,000 | ~231  | ~3.6 |
| 160&times;100 | 16,000 | ~909  | ~7.4 |
| 320&times;200 | 64,000 | ~3,550 | ~4.4 |

At every resolution the changed-cell count is a small fraction of the cell count, confirming the pipeline pushes deltas rather than full frames. The absolute fps figures are well under the 30&nbsp;fps target; a bare-engine probe with no grid involved at all — just the WebAssembly build ticking with its `onDoomFrame` callback doing nothing — measured only ~4.6&nbsp;fps on the same run, on a machine that `uptime` showed under heavy, fluctuating load (load averages between 5 and 15) from other work sharing the host at the time. That makes the WebAssembly engine's own tick cost, not the grid's cell updates, the dominant cost on this run: the diff-and-push step on the already-decoded frames took a few milliseconds at every resolution tested. A quieter machine should comfortably clear 30&nbsp;fps at 160&times;100, which is what the demo's own auto-fallback to 80&times;50 is there to handle if it does not.

`npm run verify` on this same loaded machine shows the mechanism working correctly end to end: the live page's automatic fallback to 80&times;50 fires as designed, every changed-cell reading stays a small fraction of the cell count, and the console stays free of errors and `[lattice]` warnings throughout. The boot-within-5s and 30fps-floor figures themselves fail on this run (boot took 14&ndash;20s; fps after the fallback was 1), for the same host-contention reason as above, not a fault in the pipeline or the fallback logic.

## Files

- `index.html`: the page.
- `main.js`: boots the engine, runs the pipeline, wires the keyboard and the resolution switch.
- `pipeline.js`: the downsample-diff-push pipeline, shared by the demo and the bench.
- `engine/doomgeneric/`: the vendored doomgeneric source, plus `doomgeneric_lattice.c` (the platform file this demo adds) and `Makefile.lattice` (the build recipe).
- `engine/freedoom1.wad`, `engine/FREEDOOM-LICENSE.txt`: the level data and its licence.
- `engine/dist/`: the built `.wasm`/`.js`/`.data`, committed so the page is static.
- `bench/`: the benchmark page, its own script, and the committed (gzip-compressed) recorded frame sequence.
- `styles.css`: the page layout, including the grid's padding and hover overrides.
- `tools/serve.mjs`: a small static file server for local use.
- `tools/verify.mjs`: the headless Chrome check.
