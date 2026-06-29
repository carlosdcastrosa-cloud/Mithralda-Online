// CAS-235 — Re-bake the warrior (Clarice) idle/walk/attack/death strips from a NEW
// HIGH-RES PixelLab source so the figure stops reading chunky next to the other 4
// classes (QA finding CAS-231 → CEO GO CAS-234).
//
// WHY: CAS-223 sliced Clarice from clarice_v1.png, whose figure is only ~28px tall
// native, then upscaled it ~5.7× into the 160px-tall render cell — chunky. The other
// four classes derive from the 256×256 main-character (large native → scaled DOWN to
// 160 → crisp). This tool re-bakes Clarice from 128px-native PixelLab frames (≈1.25×
// to the cell, i.e. parity-class density) WITHOUT touching the render contract:
// same 140×166 cell, same frame counts (idle 6 / walk 8 / attack 6 / death 6), same
// feet/centroid anchoring as CAS-223 → drops straight into warrior{,_walk,_attack,_death}.png.
//
// INPUT: per-state frame PNGs (south-facing) downloaded from the PixelLab character,
//   one folder per state:  assets/clarice/pl/<state>/<NN>.png  (sorted by name).
// One GLOBAL scale across every frame of every state (figure never pulses size); feet
// + centre-x anchored from each state's frame 0 so feet stay planted while limbs move.
//
//   node tools/cas235-clarice-strips.mjs
//
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(ROOT, "assets", "clarice", "pl");
const OUT = join(ROOT, "assets", "erw", "hero", "classes");

// MUST match render.js CLASS_FW/FH/AX/FOOT + frame counts.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160;
// state -> { out frames, render-consumed filename }. Source frame count is whatever
// PixelLab produced; we resample to `out` (same trick CAS-223 used for walk 6->8).
const STATES = {
  idle:   { out: 6, file: "warrior.png" },
  walk:   { out: 8, file: "warrior_walk.png" },
  attack: { out: 6, file: "warrior_attack.png" },
  death:  { out: 6, file: "warrior_death.png" },
};

// load each state's frame PNGs as base64, in sorted order
const frames = {};
for (const name in STATES) {
  const dir = join(SRC, name);
  const files = readdirSync(dir).filter(f => f.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  frames[name] = files.map(f => readFileSync(join(dir, f)).toString("base64"));
  console.log(`  ${name}: ${files.length} src frames`);
}

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (frames, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, STATES } = CFG;

  async function decode(b64) {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0);
    return { canvas: c, w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data };
  }
  // bbox of opaque pixels in a full frame canvas
  function bbox(fr) {
    const { w, h, data } = fr; let minx = w, miny = h, maxx = -1, maxy = -1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (data[(j * w + i) * 4 + 3] > 16) { if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j; }
    }
    return maxx < 0 ? null : { minx, miny, maxx, maxy };
  }

  // decode all frames
  const dec = {};
  for (const name in frames) { dec[name] = []; for (const b of frames[name]) dec[name].push(await decode(b)); }

  // ONE global scale: tallest figure across every frame of every state.
  let maxFigH = 1;
  for (const name in dec) for (const fr of dec[name]) { const bb = bbox(fr); if (bb) maxFigH = Math.max(maxFigH, bb.maxy - bb.miny + 1); }
  const SCALE = FIGURE_H / maxFigH;

  const results = {};
  for (const name in STATES) {
    const S = STATES[name], src = dec[name], srcN = src.length;
    // anchor (centre-x + feet-y) from this state's frame 0, in source px
    const ref = bbox(src[0]) || { minx: 0, miny: 0, maxx: src[0].w - 1, maxy: src[0].h - 1 };
    const cxSrc = (ref.minx + ref.maxx) / 2;
    const feetSrc = ref.maxy + 1;
    const strip = document.createElement("canvas"); strip.width = CELL_W * S.out; strip.height = CELL_H;
    const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;
    for (let j = 0; j < S.out; j++) {
      const k = S.out === srcN ? j : Math.floor(j * srcN / S.out);
      const fr = src[k];
      const dW = fr.w * SCALE, dH = fr.h * SCALE;
      const dx = j * CELL_W + ANCHOR_X - cxSrc * SCALE;
      const dy = FOOT - feetSrc * SCALE;
      sx.drawImage(fr.canvas, 0, 0, fr.w, fr.h, dx, dy, dW, dH);
    }
    results[name] = { file: S.file, dataUrl: strip.toDataURL("image/png"),
      scale: +SCALE.toFixed(3), maxFigH, w: strip.width, h: strip.height, srcN };
  }
  return results;
}, frames, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, STATES });

for (const name in out) {
  const r = out[name];
  writeFileSync(join(OUT, r.file), Buffer.from(r.dataUrl.split(",")[1], "base64"));
  console.log(`  ${name.padEnd(7)} -> ${r.file}  ${r.w}x${r.h}  scale=${r.scale} (maxFigH=${r.maxFigH}px, src=${r.srcN})`);
}
await browser.close();
console.log("done.");
