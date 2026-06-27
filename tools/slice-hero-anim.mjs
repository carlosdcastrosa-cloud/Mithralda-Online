// ===========================================================================
// tools/slice-hero-anim.mjs — CAS-92: slice the Higgsfield-generated hooded-hero
// animation sheets (walk / attack / dodge-roll, 4 frames each on a transparent
// background) into clean, UNIFORM, packed horizontal strips the render-side
// HERO_ANIM animator consumes.
//
// Each source sheet has 4 poses spaced across one row with arbitrary gaps. We:
//   1) decode via the browser canvas (robust to any PNG flavour),
//   2) find the 3 widest transparent vertical gaps → 4 frame columns (never cuts
//      through a sprite, adapts to uneven spacing),
//   3) trim each frame to its opaque bbox,
//   4) pick ONE global cell size = max content w/h across every frame of every
//      sheet (incl. the idle hooded pose) so all states share one geometry,
//   5) re-pack each frame bottom-anchored (feet on the cell floor) and
//      horizontally centred on the LOWER-body centroid (stable while the sword
//      extends in attack frames), nearest-neighbour, no rescale.
//
// Emits assets/erw/hero/hero_{idle,walk,attack,roll}.png + hero_anim.json
// (frame width/height, counts, and the content/foot baseline) so render.js wires
// exact constants. Run: npm run hero-anim   (node tools/slice-hero-anim.mjs)
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const ALPHA = 24;          // opaque threshold
const GAP_MIN = 4;         // min transparent-column run to count as a frame gap
const PAD = 2;             // transparent padding around the global cell

const HERO = join(ROOT, "assets", "erw", "hero");
// idle: tight content crop of the existing hooded pose (matches render's old ERW
// crop window so the standing silhouette is byte-for-byte the established hero).
const SHEETS = [
  { key: "walk",   src: join(HERO, "gen", "walk_src.png"),   frames: 4 },
  { key: "attack", src: join(HERO, "gen", "attack_src.png"), frames: 4 },
  { key: "roll",   src: join(HERO, "gen", "roll_src.png"),   frames: 4 },
  { key: "idle",   src: join(HERO, "hero_hooded.png"),       frames: 1 },
];

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

// Decode one sheet → { w,h, frames:[{x0,y0,x1,y1, cx}] } (bbox + lower-body centroid x)
async function analyze(src, nFrames) {
  const uri = "data:image/png;base64," + readFileSync(src).toString("base64");
  return await page.evaluate(async (uri, nFrames, ALPHA, GAP_MIN) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const op = (x, y) => d[(y * W + x) * 4 + 3] > ALPHA;
    // column opacity profile
    const col = new Array(W).fill(0);
    for (let x = 0; x < W; x++){ let n = 0; for (let y = 0; y < H; y++) if (op(x, y)) n++; col[x] = n; }
    // frame column ranges
    let ranges;
    if (nFrames === 1) {
      let x0 = 0; while (x0 < W && col[x0] === 0) x0++;
      let x1 = W - 1; while (x1 > 0 && col[x1] === 0) x1--;
      ranges = [[x0, x1]];
    } else {
      // empty-column runs (interior) → candidate gaps
      const gaps = []; let s = -1;
      for (let x = 0; x < W; x++){
        if (col[x] === 0){ if (s < 0) s = x; }
        else { if (s >= 0 && (x - s) >= GAP_MIN) gaps.push([s, x - 1, x - s]); s = -1; }
      }
      // keep interior gaps only, take the (nFrames-1) widest, cut at midpoints
      const interior = gaps.filter(([a, b]) => a > 0 && b < W - 1);
      interior.sort((p, q) => q[2] - p[2]);
      const cuts = interior.slice(0, nFrames - 1).map(([a, b]) => Math.floor((a + b) / 2)).sort((p, q) => p - q);
      const bounds = [0, ...cuts, W];
      ranges = [];
      for (let i = 0; i < nFrames; i++){
        let a = bounds[i], b = bounds[i + 1] - 1;
        while (a <= b && col[a] === 0) a++;          // trim leading empties
        while (b >= a && col[b] === 0) b--;          // trim trailing empties
        ranges.push([a, b]);
      }
    }
    // per-frame vertical bbox + lower-body centroid x (bottom 45% of bbox rows)
    const frames = ranges.map(([x0, x1]) => {
      let y0 = H, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (op(x, y)){ if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
      const loFrom = Math.floor(y1 - (y1 - y0) * 0.45);
      let sum = 0, cnt = 0;
      for (let y = loFrom; y <= y1; y++) for (let x = x0; x <= x1; x++) if (op(x, y)){ sum += x; cnt++; }
      const cx = cnt ? Math.round(sum / cnt) : Math.round((x0 + x1) / 2);
      return { x0, y0, x1, y1, cx };
    });
    return { W, H, frames, uri };
  }, uri, nFrames, ALPHA, GAP_MIN);
}

const sheets = {};
for (const s of SHEETS) sheets[s.key] = { ...s, data: await analyze(s.src, s.frames) };

// global cell: max content width (centred on centroid → need 2× max half-extent) & height
let halfL = 0, halfR = 0, maxH = 0;
for (const k in sheets) for (const f of sheets[k].data.frames) {
  halfL = Math.max(halfL, f.cx - f.x0);
  halfR = Math.max(halfR, f.x1 - f.cx);
  maxH = Math.max(maxH, f.y1 - f.y0 + 1);
}
const CW = halfL + halfR + 1 + PAD * 2;
const CH = maxH + PAD * 2;
const anchorX = halfL + PAD;          // centroid lands here in every cell
const foot = CH - PAD;                // baseline (feet) row in every cell

// pack each sheet into a strip of frameCount uniform cells
async function pack(key) {
  const { data } = sheets[key];
  const frames = data.frames;
  const out = await page.evaluate(async (uri, frames, CW, CH, anchorX, foot) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
    const c = document.createElement("canvas"); c.width = CW * frames.length; c.height = CH;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    frames.forEach((f, i) => {
      const fw = f.x1 - f.x0 + 1, fh = f.y1 - f.y0 + 1;
      const dx = i * CW + anchorX - (f.cx - f.x0);   // centroid → cell anchorX
      const dy = foot - fh;                           // feet → cell baseline
      g.drawImage(img, f.x0, f.y0, fw, fh, dx, dy, fw, fh);
    });
    return c.toDataURL("image/png").split(",")[1];
  }, data.uri, frames, CW, CH, anchorX, foot);
  const dst = join(HERO, `hero_${key}.png`);
  writeFileSync(dst, Buffer.from(out, "base64"));
  console.log(`✔ hero_${key}.png  ${frames.length}×(${CW}×${CH})`);
}
for (const k of Object.keys(sheets)) await pack(k);

const geom = { frameW: CW, frameH: CH, anchorX, foot,
  states: Object.fromEntries(Object.keys(sheets).map(k => [k, sheets[k].frames])) };
writeFileSync(join(HERO, "hero_anim.json"), JSON.stringify(geom, null, 2));
console.log("geom", JSON.stringify(geom));
await browser.close();
