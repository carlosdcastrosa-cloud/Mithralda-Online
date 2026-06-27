// ===========================================================================
// tools/slice-class-heroes.mjs — CAS-97: bring the 4 Higgsfield class idle
// poses (CAS-94: warrior / mage / archer / rogue, transparent 896×1200 PNGs
// with 3:4 padding) into the game as light, tightly-cropped, feet-anchored hero
// sprites at the FINAL main-character size frozen by CAS-92.
//
// The raw PNGs are ~800 KB each and mostly empty padding — loading 4 of them at
// runtime would blow the fast-load budget. Instead we (offline):
//   1) decode via the browser canvas (robust to any PNG flavour),
//   2) trim each pose to its opaque bbox + lower-body centroid x,
//   3) pick ONE global cell = max content extents across the 4 poses, normalised
//      so the tallest figure is NORM_FIG_H px (keeps all 4 to one geometry, so
//      render.js wires a single anchor/foot/scale),
//   4) high-quality downscale + re-pack each pose bottom-anchored (feet on the
//      cell floor) and horizontally centred on the lower-body centroid.
//
// Emits assets/erw/hero/classes/{warrior,mage,archer,rogue}.png + classes.json
// (frameW/frameH, anchorX, foot, figureH) so render.js wires exact constants.
// Run: npm run class-heroes   (node tools/slice-class-heroes.mjs)
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const ALPHA = 24;          // opaque threshold
const PAD = 2;             // transparent padding around the global cell
const NORM_FIG_H = 160;    // tallest figure normalises to this many px in the cell

const SRC_DIR = join(ROOT, "assets", "erw", "hero", "gen", "classes");
const OUT_DIR = join(ROOT, "assets", "erw", "hero", "classes");
const CLASSES = ["warrior", "mage", "archer", "rogue"];

mkdirSync(OUT_DIR, { recursive: true });

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

// Decode one pose → { W,H, x0,y0,x1,y1, cx (lower-body centroid), uri }.
// Some CAS-94 poses ship with an OPAQUE light-gray→white studio background
// (only mage was background-removed). We chroma-key it with an edge FLOOD-FILL:
// flood from the borders, clearing only pixels that are light + low-saturation
// (min channel ≥ BG_MIN, channel spread ≤ BG_SPREAD). Flooding from the edges
// removes only the contiguous background, so interior light/grey pixels (steel
// armour, white trim) survive even when they match the key colour. The returned
// uri is the keyed canvas, so packing crops a clean transparent silhouette.
const BG_MIN = 188, BG_SPREAD = 24;
async function analyze(src) {
  const uri = "data:image/png;base64," + readFileSync(src).toString("base64");
  const r = await page.evaluate(async (uri, ALPHA, BG_MIN, BG_SPREAD) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    // Only key when the source actually has an opaque background (corner is opaque).
    if (d[3] > ALPHA) {
      const isBg = (i) => { if (d[i + 3] <= ALPHA) return true;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const mn = Math.min(r, gg, b), mx = Math.max(r, gg, b);
        return mn >= BG_MIN && (mx - mn) <= BG_SPREAD; };
      const seen = new Uint8Array(W * H), stack = [];
      const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return;
        const p = y * W + x; if (seen[p]) return; seen[p] = 1; if (isBg(p * 4)) stack.push(p); };
      for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
      for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
      while (stack.length) { const p = stack.pop(); d[p * 4 + 3] = 0;
        const x = p % W, y = (p / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
      g.putImageData(im, 0, 0);
    }
    const op = (x, y) => d[(y * W + x) * 4 + 3] > ALPHA;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (op(x, y)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    // lower-body centroid x (bottom 45% of bbox) — stable horizontal anchor
    const loFrom = Math.floor(y1 - (y1 - y0) * 0.45);
    let sum = 0, cnt = 0;
    for (let y = loFrom; y <= y1; y++) for (let x = x0; x <= x1; x++) if (op(x, y)) { sum += x; cnt++; }
    const cx = cnt ? Math.round(sum / cnt) : Math.round((x0 + x1) / 2);
    return { W, H, x0, y0, x1, y1, cx, uri: c.toDataURL("image/png") };
  }, uri, ALPHA, BG_MIN, BG_SPREAD);
  return r;
}

const poses = {};
for (const cl of CLASSES) poses[cl] = await analyze(join(SRC_DIR, `${cl}_idle.png`));

// global normalised cell: DS scales the tallest figure to NORM_FIG_H px
let maxFigH = 0;
for (const cl of CLASSES) maxFigH = Math.max(maxFigH, poses[cl].y1 - poses[cl].y0 + 1);
const DS = NORM_FIG_H / maxFigH;
let halfL = 0, halfR = 0;
for (const cl of CLASSES) { const p = poses[cl];
  halfL = Math.max(halfL, (p.cx - p.x0) * DS);
  halfR = Math.max(halfR, (p.x1 - p.cx) * DS);
}
const CW = Math.ceil(halfL + halfR) + 1 + PAD * 2;
const CH = Math.ceil(NORM_FIG_H) + PAD * 2;
const anchorX = Math.round(halfL) + PAD;   // centroid lands here in every cell
const foot = CH - PAD;                       // baseline (feet) row in every cell

async function pack(cl) {
  const p = poses[cl];
  const b64 = await page.evaluate(async (uri, p, DS, CW, CH, anchorX, foot) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
    const c = document.createElement("canvas"); c.width = CW; c.height = CH;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    const fw = p.x1 - p.x0 + 1, fh = p.y1 - p.y0 + 1;
    const dw = fw * DS, dh = fh * DS;
    const dx = anchorX - (p.cx - p.x0) * DS;   // centroid → cell anchorX
    const dy = foot - dh;                        // feet → cell baseline
    g.drawImage(img, p.x0, p.y0, fw, fh, dx, dy, dw, dh);
    return c.toDataURL("image/png").split(",")[1];
  }, p.uri, p, DS, CW, CH, anchorX, foot);
  const dst = join(OUT_DIR, `${cl}.png`);
  writeFileSync(dst, Buffer.from(b64, "base64"));
  console.log(`✔ classes/${cl}.png  ${CW}×${CH}`);
}
for (const cl of CLASSES) await pack(cl);

const geom = { frameW: CW, frameH: CH, anchorX, foot, figureH: Math.round(NORM_FIG_H), classes: CLASSES };
writeFileSync(join(OUT_DIR, "classes.json"), JSON.stringify(geom, null, 2));
console.log("geom", JSON.stringify(geom));
await browser.close();
