// CAS-330 (board: "la animacion del dash no sale cortada, haz que salga completa")
// Re-bake the WARRIOR DASH strip into a WIDE, body-centred cell so the full Clarice
// dash-VFX (forward-thrust motion-blur / afterimage trail) is captured instead of being
// clipped at the 140px cell boundary.
//
// THE BUG: CAS-326 baked the dash into the SAME 140px (CLASS_FW) cell the idle/walk
// strips use. But the dash-VFX source frame (96px) carries a wide motion-blur trail that,
// at the shared global SCALE (~3x), is far wider than 140px. drawImage drew each frame's
// full 96·SCALE (~280px) into a 140px column, so the trail overflowed into — and was
// clipped at — the cell edge. In-game the dash streak read cut off ("sale cortada").
//
// THE FIX (identical to the CAS-282 wide re-bake of attack/special/hurt/death): bake the
// dash into a WIDER cell sized to the dash content's measured extent, figure body-centroid
// at the cell CENTRE (renderer anchor = fw/2), feet still on the FOOT baseline, and the
// EXACT same global SCALE as CAS-254/326 (figure size unchanged on screen, no size pulse).
// render.js auto-detects the wider frame width per strip (fw = naturalWidth/fc; fw>CLASS_FW
// -> centre anchor), so idle/walk and the other classes' 140px strips are untouched.
//
//   node tools/cas330-dash-wide.mjs
//
// Writes: assets/erw/hero/classes/warrior_dash.png  (8f, WIDE Clarice dash-VFX cell).
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRCDIR = join(ROOT, "assets", "clarice", "extended", "SpriteSheets");
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const P = "Clarice-noctural-creature-hunter-";

// MUST match render.js CLASS_FH/FOOT and the CAS-254/326 warrior bake (figure size identical).
const CELL_H = 166, FOOT = 163, FIGURE_H = 160, BOTTOM_GAP = CELL_H - FOOT; // 3
const FRAME_W = 96, FRAME_H = 64;

// SCALE-reference states (the 4 canonical warrior strips) — reproduce the CAS-254 global
// scale so the dash matches the live warrior size exactly (no size pulse between states).
const SCALE_REF = {
  idle:   { strip: `${P}Idle.png`,          src: 6 },
  walk:   { strip: `${P}Run.png`,           src: 8 },
  attack: { strip: `${P}normal attack.png`, src: 11 },
  death:  { strip: `${P}Die.png`,           src: 14 },
};
// The dash state we emit (VFX variant = motion-blur/afterimage). out frames MUST match
// render.js CLASS_DASH_FC=8.
const DASH = { strip: `${P}dash - VFX.png`, src: 11, out: 8, file: "warrior_dash.png" };

const b64 = {};
for (const k in SCALE_REF) b64[SCALE_REF[k].strip] = readFileSync(join(SRCDIR, SCALE_REF[k].strip)).toString("base64");
b64[DASH.strip] = readFileSync(join(SRCDIR, DASH.strip)).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (b64, CFG) => {
  const { CELL_H, FOOT, FIGURE_H, BOTTOM_GAP, FRAME_W, FRAME_H, SCALE_REF, DASH } = CFG;

  const sheets = {};
  async function load(strip) {
    if (sheets[strip]) return sheets[strip];
    const img = new Image(); img.src = "data:image/png;base64," + b64[strip]; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0);
    return sheets[strip] = { cv, data: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width };
  }
  function frameBBox(sh, col) {
    const ox = col * FRAME_W; let minx = FRAME_W, miny = FRAME_H, maxx = -1, maxy = -1;
    for (let j = 0; j < FRAME_H; j++) for (let i = 0; i < FRAME_W; i++) {
      if (sh.data[(j * sh.w + (ox + i)) * 4 + 3] > 16) {
        if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j;
      }
    }
    return maxx < 0 ? null : { minx, miny, maxx, maxy };
  }

  // 1) global SCALE — identical derivation to CAS-254/326 (tallest figure across the 4
  //    canonical states) so the dash figure is the SAME on-screen size as idle/walk.
  let maxFigH = 1;
  for (const name in SCALE_REF) { const S = SCALE_REF[name]; const sh = await load(S.strip);
    for (let c = 0; c < S.src; c++) { const bb = frameBBox(sh, c); if (bb) maxFigH = Math.max(maxFigH, bb.maxy - bb.miny + 1); } }
  const SCALE = FIGURE_H / maxFigH;

  const srcColOf = (S, j) => S.out === S.src ? j : Math.min(S.src - 1, Math.round(j * (S.src - 1) / (S.out - 1)));

  // 2) ANCHOR on the SETTLE frame (last source frame = fully grounded Clarice), same as
  //    CAS-326, so feet/centre land on the SAME baseline as idle/walk/attack/death.
  const sh = await load(DASH.strip);
  const ref = frameBBox(sh, DASH.src - 1) || { minx: 30, miny: 8, maxx: 65, maxy: 56 };
  const cxSrc = (ref.minx + ref.maxx) / 2, feetSrc = ref.maxy + 1;

  // 3) measure the dash content's max half-width and top-extent (scaled) RELATIVE to that
  //    fixed anchor, across the EXACT source columns each out-frame draws — so the cell is
  //    wide/tall enough that the motion-blur trail never touches an edge.
  let halfW = 1, topExt = FIGURE_H, worstEdge140 = 0;
  for (let j = 0; j < DASH.out; j++) {
    const sc = srcColOf(DASH, j); const bb = frameBBox(sh, sc); if (!bb) continue;
    halfW = Math.max(halfW, (cxSrc - bb.minx) * SCALE, (bb.maxx - cxSrc) * SCALE);
    topExt = Math.max(topExt, (feetSrc - bb.miny) * SCALE);
    // diagnostic: how far the content would spill past the OLD 140px cell (AX=65)
    const dxBody = 65 - cxSrc * SCALE;
    const left = dxBody + bb.minx * SCALE, right = dxBody + bb.maxx * SCALE;
    worstEdge140 = Math.max(worstEdge140, Math.max(0, -left), Math.max(0, right - 140));
  }
  let cellW = Math.ceil(halfW) * 2 + 32;            // symmetric + generous pad
  if (cellW % 2) cellW++;                            // even -> integer centre
  let cellH = Math.ceil(topExt) + BOTTOM_GAP + 4;    // top content + feet gap + pad
  if (cellH < CELL_H) cellH = CELL_H;                // never shorter than legacy
  const AX = cellW / 2, FEET = cellH - BOTTOM_GAP;

  // 4) bake into the wide cell, body-centroid at AX, feet on FEET, same SCALE.
  const strip = document.createElement("canvas"); strip.width = cellW * DASH.out; strip.height = cellH;
  const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;
  const dW = FRAME_W * SCALE, dH = FRAME_H * SCALE;
  for (let j = 0; j < DASH.out; j++) {
    const ox = srcColOf(DASH, j) * FRAME_W;
    const dx = j * cellW + AX - cxSrc * SCALE;
    const dy = FEET - feetSrc * SCALE;
    sx.drawImage(sh.cv, ox, 0, FRAME_W, FRAME_H, dx, dy, dW, dH);
  }

  // 5) verify NO opaque pixel touches a cell edge in the baked WIDE strip.
  const bx = strip.getContext("2d"); const bd = bx.getImageData(0, 0, strip.width, strip.height).data;
  let edgeHits = 0;
  for (let j = 0; j < cellH; j++) for (let f = 0; f < DASH.out; f++) {
    const lx = f * cellW, rx = f * cellW + cellW - 1;
    if (bd[(j * strip.width + lx) * 4 + 3] > 16) edgeHits++;
    if (bd[(j * strip.width + rx) * 4 + 3] > 16) edgeHits++;
  }
  return { file: DASH.file, dataUrl: strip.toDataURL("image/png"),
    scale: +SCALE.toFixed(3), w: strip.width, h: strip.height, fc: DASH.out,
    cellW, cellH, AX, FEET, halfW: +halfW.toFixed(1), worstEdge140: +worstEdge140.toFixed(1), edgeHits };
}, b64, { CELL_H, FOOT, FIGURE_H, BOTTOM_GAP, FRAME_W, FRAME_H, SCALE_REF, DASH });

const buf = Buffer.from(out.dataUrl.split(",")[1], "base64");
writeFileSync(join(OUT, out.file), buf);
console.log(`  dash -> ${out.file}  ${out.w}x${out.h}  fc=${out.fc}  cell=${out.cellW}x${out.cellH}  AX=${out.AX}  scale=${out.scale}`);
console.log(`  OLD 140px cell clipped content by up to ${out.worstEdge140}px per side (this was the "cortada" bug)`);
console.log(`  WIDE bake edge-touching opaque pixels: ${out.edgeHits} (want 0 = full VFX captured)`);
await browser.close();
console.log("done.");
