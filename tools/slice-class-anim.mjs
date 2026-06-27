// ===========================================================================
// tools/slice-class-anim.mjs — CAS-101: turn the ML-background-removed class
// idle loops (warrior/mage/archer/rogue) into clean, multi-frame, transparent
// animation STRIPS that share the EXACT cell geometry of the existing static
// class sheets (assets/erw/hero/classes/classes.json: 105×164, anchorX 43,
// foot 162, figureH 160) — so render.js only bumps CLASS_FC 1→N, no other code
// change (per the issue's "columna por frame — sin cambio de código").
//
// The Higgsfield "video_background_remover" matte is composited onto a PERFECTLY
// FLAT pure-black background (border variance 0). We key it with an edge
// flood-fill of near-black (max channel ≤ BG_LUMA): flooding only from the
// borders removes the contiguous black surround while the dark interior hood /
// cloak (luma ~77+) survives — the same edge-flood trick the static slicer uses
// for the light studio bg, inverted for black. ML already produced the matte, so
// the silhouette edge is clean (no halo) — local keying just drops the flat fill.
//
// Per class: sample N frames evenly across the loop, key + trim + lower-body
// centroid, then re-pack each frame into the SHARED fixed cell (feet on FOOT,
// centroid on ANCHOR_X), high-quality downscaled to figureH=FIG_H. Emits
// assets/erw/hero/classes/{class}.png (N columns) + updates classes.json.
// Run: node tools/slice-class-anim.mjs   (optional first arg = frame count)
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const N = Math.max(2, parseInt(process.argv[2] || "6", 10));   // frames per loop
const BG_LUMA = parseInt(process.env.BG_LUMA || "8", 10);  // max-channel ≤ this ⇒ bg black (flood seed)
const ALPHA = 24;          // opaque threshold for bbox
const PAD = 3;             // transparent padding around the derived cell
// figureH stays 160 (== existing static sheets) so ON-SCREEN size is unchanged:
// the render scales the whole cell by CLASS_ANIM_SCALE, and figure_px = FIG_H*S
// regardless of cell padding. The cell itself (FRAME_W/H, ANCHOR_X, FOOT) is
// DERIVED from the actual animated content so motion frames never clip — the
// engineer updates those 4 constants (emitted to classes.json) + CLASS_FC.
const FIG_H = 160;

const SRC_DIR = join(ROOT, "assets", "erw", "hero", "gen", "classes", "nobg");
const OUT_DIR = join(ROOT, "assets", "erw", "hero", "classes");
const CLASSES = ["warrior", "mage", "archer", "rogue"];

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

// Decode N frames of one loop → [{x0,y0,x1,y1,cx, data:ImageData-as-uri}]
async function analyze(src, n) {
  const uri = "data:video/mp4;base64," + readFileSync(src).toString("base64");
  return await page.evaluate(async (uri, n, BG_LUMA, ALPHA) => {
    const v = document.createElement("video"); v.muted = true; v.src = uri;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej("video load err"); });
    const W = v.videoWidth, H = v.videoHeight, dur = v.duration;
    const seek = (t) => new Promise((res) => { v.onseeked = res; v.currentTime = t; });
    const out = [];
    for (let i = 0; i < n; i++) {
      await seek(dur * (i + 0.5) / n);                 // centre of each Nth slice
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.imageSmoothingEnabled = false; g.drawImage(v, 0, 0, W, H);
      const im = g.getImageData(0, 0, W, H), d = im.data;
      // edge flood-fill: clear contiguous near-black background, keep interior dark
      const isBg = (p) => { const i = p * 4; return Math.max(d[i], d[i+1], d[i+2]) <= BG_LUMA; };
      const seen = new Uint8Array(W * H), stack = [];
      const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return;
        const p = y * W + x; if (seen[p]) return; seen[p] = 1; if (isBg(p)) stack.push(p); };
      for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
      for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
      while (stack.length) { const p = stack.pop(); d[p * 4 + 3] = 0;
        const x = p % W, y = (p / W) | 0; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
      g.putImageData(im, 0, 0);
      // bbox + lower-body centroid (bottom 45%)
      const op = (x, y) => d[(y * W + x) * 4 + 3] > ALPHA;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (op(x, y)) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const loFrom = Math.floor(y1 - (y1 - y0) * 0.45);
      let sum = 0, cnt = 0;
      for (let y = loFrom; y <= y1; y++) for (let x = x0; x <= x1; x++) if (op(x, y)) { sum += x; cnt++; }
      const cx = cnt ? Math.round(sum / cnt) : Math.round((x0 + x1) / 2);
      out.push({ x0, y0, x1, y1, cx, uri: c.toDataURL("image/png") });
    }
    return out;
  }, uri, n, BG_LUMA, ALPHA);
}

const data = {};
for (const cl of CLASSES) { data[cl] = await analyze(join(SRC_DIR, `${cl}_nobg.mp4`), N);
  console.log(`· ${cl}: ${data[cl].length} frames analysed`); }

// global downscale: tallest figure across ALL frames/classes → FIG_H px
let maxFigH = 0;
for (const cl of CLASSES) for (const f of data[cl]) maxFigH = Math.max(maxFigH, f.y1 - f.y0 + 1);
const DS = FIG_H / maxFigH;

// DERIVE the shared cell from post-scale content extents (centroid-relative),
// so the widest/tallest animated frame fits with PAD — no clipping.
let halfL = 0, halfR = 0, maxH = 0;
for (const cl of CLASSES) for (const f of data[cl]) {
  halfL = Math.max(halfL, (f.cx - f.x0) * DS);
  halfR = Math.max(halfR, (f.x1 - f.cx) * DS);
  maxH  = Math.max(maxH, (f.y1 - f.y0 + 1) * DS);
}
const FRAME_W = Math.ceil(halfL + halfR) + 1 + PAD * 2;
const FRAME_H = Math.ceil(maxH) + PAD * 2;
const ANCHOR_X = Math.round(halfL) + PAD;   // centroid column in every cell
const FOOT = FRAME_H - PAD;                   // feet baseline row in every cell

// Build each class strip in one page pass (load all its frame uris into one canvas)
let clipWarn = [];
async function buildStrip(cl) {
  const frames = data[cl];
  const b64 = await page.evaluate(async (frames, DS, FRAME_W, FRAME_H, ANCHOR_X, FOOT) => {
    const strip = document.createElement("canvas");
    strip.width = FRAME_W * frames.length; strip.height = FRAME_H;
    const g = strip.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    let clipped = false;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = f.uri; });
      const fw = f.x1 - f.x0 + 1, fh = f.y1 - f.y0 + 1;
      const dw = fw * DS, dh = fh * DS;
      const dx = i * FRAME_W + ANCHOR_X - (f.cx - f.x0) * DS;   // centroid → ANCHOR_X
      const dy = FOOT - dh;                                      // feet → FOOT baseline
      if (dx < i * FRAME_W - 0.5 || dx + dw > (i + 1) * FRAME_W + 0.5 || dy < -0.5) clipped = true;
      g.drawImage(img, f.x0, f.y0, fw, fh, dx, dy, dw, dh);
    }
    return { b64: strip.toDataURL("image/png").split(",")[1], clipped };
  }, frames, DS, FRAME_W, FRAME_H, ANCHOR_X, FOOT);
  if (b64.clipped) clipWarn.push(cl);
  writeFileSync(join(OUT_DIR, `${cl}.png`), Buffer.from(b64.b64, "base64"));
  console.log(`✔ classes/${cl}.png  ${frames.length}×(${FRAME_W}×${FRAME_H})${b64.clipped ? "  ⚠ CLIP" : ""}`);
}
for (const cl of CLASSES) await buildStrip(cl);

const geom = { frameW: FRAME_W, frameH: FRAME_H, anchorX: ANCHOR_X, foot: FOOT,
  figureH: FIG_H, frames: N, classes: CLASSES };
writeFileSync(join(OUT_DIR, "classes.json"), JSON.stringify(geom, null, 2));
console.log("geom", JSON.stringify(geom));
if (clipWarn.length) console.log("⚠ clipping in:", clipWarn.join(", "), "— widen FRAME_W or lower FIG_H");
await browser.close();
