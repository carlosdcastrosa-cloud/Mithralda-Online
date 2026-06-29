// CAS-223 — Slice the Clarice atlas into class-cell hero strips that REPLACE the
// warrior. Clarice ships as a 384×448 grid atlas (6 cols × 7 rows, 64×64 frames):
//   row2 = IDLE, row3 = WALK, row4 = DEATH, row5 = ATTACK  (manifest CAS-221).
// The in-world hero renderer (render.js drawHeroClass) draws from one shared
// CLASS_FW×CLASS_FH cell, feet anchored at FOOT, centroid at ANCHOR_X, scaled by
// CLASS_ANIM_SCALE (0.30 → ~48px = 1.5 tiles, CAS-208). We bake Clarice's small
// (~20×28) figure into that SAME cell (nearest-neighbor upscale, one global scale so
// the figure never pulses size; feet/centre anchored from each row's frame 0 so the
// animation motion is preserved). Output strips drop straight into the existing
// class-strip pipeline — class-select / customize / pause previews pick them up with
// no code change; only the in-world state machine gains attack/death (render.js).
//
//   node tools/cas223-clarice-strips.mjs
//
// Writes: assets/erw/hero/classes/warrior{,_walk,_attack,_death}.png  (Clarice).
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(ROOT, "assets", "clarice", "clarice_v1.png");
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const b64 = readFileSync(SRC).toString("base64");

// MUST match render.js CLASS_FW/FH/AX/FOOT.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160;
const FRAME = 64;                       // atlas cell size
// state -> { row, fc, walkFc }. walk is resampled 6 -> 8 cols (render uses CLASS_WALK_FC=8).
const STATES = {
  idle:   { row: 2, src: 6, out: 6, file: "warrior.png" },
  walk:   { row: 3, src: 6, out: 8, file: "warrior_walk.png" },
  death:  { row: 4, src: 6, out: 6, file: "warrior_death.png" },
  attack: { row: 5, src: 6, out: 6, file: "warrior_attack.png" },
};

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (b64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME, STATES } = CFG;
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const atlas = document.createElement("canvas"); atlas.width = img.naturalWidth; atlas.height = img.naturalHeight;
  const ax = atlas.getContext("2d"); ax.imageSmoothingEnabled = false; ax.drawImage(img, 0, 0);
  const adata = ax.getImageData(0, 0, atlas.width, atlas.height).data;
  const AW = atlas.width;

  // bbox of opaque pixels inside one frame sub-cell (col,row) of the atlas
  function frameBBox(col, row) {
    const ox = col * FRAME, oy = row * FRAME;
    let minx = FRAME, miny = FRAME, maxx = -1, maxy = -1;
    for (let j = 0; j < FRAME; j++) for (let i = 0; i < FRAME; i++) {
      if (adata[((oy + j) * AW + (ox + i)) * 4 + 3] > 16) {
        if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j;
      }
    }
    return maxx < 0 ? null : { minx, miny, maxx, maxy };
  }

  // ONE global scale across every state/frame so Clarice never pulses size between
  // idle/walk/attack/death. Derived from the TALLEST figure frame found anywhere, so
  // no frame clips the top of the cell.
  let maxFigH = 1;
  for (const name in STATES) { const S = STATES[name];
    for (let c = 0; c < S.src; c++) { const bb = frameBBox(c, S.row); if (bb) maxFigH = Math.max(maxFigH, bb.maxy - bb.miny + 1); } }
  const SCALE = FIGURE_H / maxFigH;

  const results = {};
  for (const name in STATES) {
    const S = STATES[name];
    // anchor (centre-x + feet-y) from this row's frame 0, applied to every frame so
    // feet stay planted while limbs animate.
    const ref = frameBBox(0, S.row) || { minx: 22, miny: 36, maxx: 41, maxy: 49 };
    const figH = ref.maxy - ref.miny + 1;
    const scale = SCALE;                            // one global scale (no size pulse)
    const cxSrc = (ref.minx + ref.maxx) / 2;       // figure centre-x in the sub-cell
    const feetSrc = ref.maxy + 1;                  // bottom of the figure
    const strip = document.createElement("canvas"); strip.width = CELL_W * S.out; strip.height = CELL_H;
    const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;
    for (let j = 0; j < S.out; j++) {
      // resample src frame index when out > src (walk 6 -> 8)
      const srcCol = S.out === S.src ? j : Math.floor(j * S.src / S.out);
      const ox = srcCol * FRAME, oy = S.row * FRAME;
      // dest mapping: source feet -> FOOT, source centre-x -> ANCHOR_X, uniform scale
      const dW = FRAME * scale, dH = FRAME * scale;
      const dx = j * CELL_W + ANCHOR_X - cxSrc * scale;
      const dy = FOOT - feetSrc * scale;
      sx.drawImage(atlas, ox, oy, FRAME, FRAME, dx, dy, dW, dH);
    }
    results[name] = { file: S.file, dataUrl: strip.toDataURL("image/png"),
      scale: +scale.toFixed(3), figH, w: strip.width, h: strip.height };
  }
  return results;
}, b64, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME, STATES });

for (const name in out) {
  const r = out[name];
  const buf = Buffer.from(r.dataUrl.split(",")[1], "base64");
  writeFileSync(join(OUT, r.file), buf);
  console.log(`  ${name.padEnd(7)} -> ${r.file}  ${r.w}x${r.h}  scale=${r.scale} (figH=${r.figH}px)`);
}
await browser.close();
console.log("done.");
