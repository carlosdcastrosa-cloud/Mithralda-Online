// CAS-301 — slice PixelLab 8-direction rotations (+ optional walk frames) into the
// engine's class-cell strips: <cls>_idle8.png (8 rows × 1f) and <cls>_walk8.png
// (8 rows × Nf), cell 140×166, ROWS IN atan2 BUCKET ORDER so the renderer indexes by
// movement angle. Identity is preserved: NO resize (1:1 pixel scale = same proportions as
// the live sprite); per-direction translate-only re-anchor (foot→163, centroid→65) using
// each rotation's alpha bbox; walk frames of a direction reuse that direction's idle anchor
// so the gait sway/bob is kept.
//   node tools/cas301-slice.mjs <cls> <rotDir> [walkDir] [walkFC]
// rotDir/walkDir contain <direction>.png (+ walk: <direction>_<frame>.png) at 170×170.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [cls, rotDir, walkDir, walkFCs] = process.argv.slice(2);
const WALK_FC = parseInt(walkFCs || "6", 10);
const CW = 140, CH = 166, AX = 65, FOOT = 163;
// Row order == atan2 bucket: 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE  (screen space, y-down)
const BUCKET_DIRS = ["east","south-east","south","south-west","west","north-west","north","north-east"];

const rd = (p) => readFileSync(p).toString("base64");
const rot = {}; for (const d of BUCKET_DIRS) rot[d] = rd(join(rotDir, d + ".png"));
let walk = null;
if (walkDir) {
  walk = {};
  for (const d of BUCKET_DIRS) {
    const frames = [];
    for (let f = 0; f < WALK_FC; f++) {
      const p = join(walkDir, `${d}_${f}.png`);
      if (existsSync(p)) frames.push(rd(p));
    }
    walk[d] = frames;
  }
}

const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: "new" });
const page = await browser.newPage();
const out = await page.evaluate(async ({ rot, walk, BUCKET_DIRS, CW, CH, AX, FOOT, WALK_FC }) => {
  const load = (b64) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = "data:image/png;base64," + b64; });
  // alpha bbox on a temp canvas at the image's native size
  function bbox(im) {
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, im.width, im.height).data;
    let minX = im.width, minY = im.height, maxX = 0, maxY = 0, n = 0;
    for (let y = 0; y < im.height; y++) for (let xx = 0; xx < im.width; xx++) {
      if (d[(y * im.width + xx) * 4 + 3] > 16) { n++; if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, foot: maxY, n };
  }
  // draw image `im` into cell at (cellX,0) translated so (cx,foot)->(AX,FOOT)
  function place(ctx, im, cellX, cx, foot) {
    const dx = Math.round(cellX + AX - cx), dy = Math.round(FOOT - foot);
    ctx.drawImage(im, dx, dy);
  }

  // ---- idle8: 8 rows (stacked vertically), 1 frame each ----
  const idleC = document.createElement("canvas"); idleC.width = CW; idleC.height = CH * BUCKET_DIRS.length;
  const ix = idleC.getContext("2d"); ix.imageSmoothingEnabled = false;
  const anchors = {};
  for (let r = 0; r < BUCKET_DIRS.length; r++) {
    const d = BUCKET_DIRS[r]; const im = await load(rot[d]); const bb = bbox(im);
    anchors[d] = bb;
    ix.save(); ix.beginPath(); ix.rect(0, r * CH, CW, CH); ix.clip();
    ix.translate(0, r * CH); place(ix, im, 0, bb.cx, bb.foot); ix.restore();
  }
  const idleURL = idleC.toDataURL("image/png").split(",")[1];

  // ---- walk8: 8 rows, WALK_FC frames each (reuse per-direction idle anchor) ----
  let walkURL = null, actualFC = 0;
  if (walk) {
    actualFC = Math.max(...BUCKET_DIRS.map(d => walk[d].length));
    const walkC = document.createElement("canvas"); walkC.width = CW * actualFC; walkC.height = CH * BUCKET_DIRS.length;
    const wx = walkC.getContext("2d"); wx.imageSmoothingEnabled = false;
    for (let r = 0; r < BUCKET_DIRS.length; r++) {
      const d = BUCKET_DIRS[r]; const a = anchors[d];
      for (let f = 0; f < walk[d].length; f++) {
        const im = await load(walk[d][f]);
        wx.save(); wx.beginPath(); wx.rect(f * CW, r * CH, CW, CH); wx.clip();
        wx.translate(f * CW, r * CH); place(wx, im, 0, a.cx, a.foot); wx.restore();
      }
    }
    walkURL = walkC.toDataURL("image/png").split(",")[1];
  }
  return { idleURL, walkURL, actualFC, anchors };
}, { rot, walk, BUCKET_DIRS, CW, CH, AX, FOOT, WALK_FC });
await browser.close();

const OUT = join(ROOT, "assets", "erw", "hero", "classes");
writeFileSync(join(OUT, `${cls}_idle8.png`), Buffer.from(out.idleURL, "base64"));
let msg = `wrote ${cls}_idle8.png (140x${166 * 8}, 8 rows × 1f)`;
if (out.walkURL) { writeFileSync(join(OUT, `${cls}_walk8.png`), Buffer.from(out.walkURL, "base64")); msg += `\nwrote ${cls}_walk8.png (${140 * out.actualFC}x${166 * 8}, 8 rows × ${out.actualFC}f)`; }
console.log(msg);
console.log("anchors:", JSON.stringify(out.anchors, (k, v) => typeof v === "number" ? Math.round(v) : v));
