// CAS-326 — Bake the WARRIOR DASH animation from the SAME Clarice Extended pack the
// live warrior is made of (CAS-254). The pack ships a canonical dash strip WITH the
// forward-thrust motion-blur/afterimage VFX the board (CAS-325) asked for:
//   Clarice-noctural-creature-hunter-dash - VFX.png  = 11f @ 96×64.
// KEEP THE SAME CHARACTER — we do NOT redesign or swap the sprite, we only ADD the
// missing dash motion from the canonical source (hard board constraint, CAS-288/300).
//
// We conform the dash strip into the engine's shared CLASS_FW×CLASS_FH warrior cell
// using the EXACT CAS-254 math (nearest-neighbor, ONE global scale, feet/centre anchored
// per state's frame 0). Critically the global SCALE is measured from the 4 CANONICAL
// warrior states (idle/run/attack/die) — NOT from the dash strip — so the dash figure is
// the SAME size as idle/walk/attack/death (no size pulse between states) and the dash's
// own VFX trails never perturb the scale. The in-strip forward translation of the lunge
// is preserved (every frame anchored to dash frame 0), which reads as the dash thrust.
//
//   node tools/cas326-warrior-dash.mjs
//
// Writes: assets/erw/hero/classes/warrior_dash.png  (8f, 140×166 cell — legacy geometry).
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRCDIR = join(ROOT, "assets", "clarice", "extended", "SpriteSheets");
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const P = "Clarice-noctural-creature-hunter-";

// MUST match render.js CLASS_FW/FH/AX/FOOT + the CAS-254 warrior bake.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160;
const FRAME_W = 96, FRAME_H = 64;

// SCALE-reference states (the 4 canonical warrior strips) — reproduce the CAS-254 global
// scale so dash matches the live warrior size exactly.
const SCALE_REF = {
  idle:   { strip: `${P}Idle.png`,          src: 6 },
  walk:   { strip: `${P}Run.png`,           src: 8 },
  attack: { strip: `${P}normal attack.png`, src: 11 },
  death:  { strip: `${P}Die.png`,           src: 14 },
};
// The dash state we actually emit (VFX variant = motion-blur/afterimage dash feel).
const DASH = { strip: `${P}dash - VFX.png`, src: 11, out: 8, file: "warrior_dash.png" };

const b64 = {};
for (const k in SCALE_REF) b64[SCALE_REF[k].strip] = readFileSync(join(SRCDIR, SCALE_REF[k].strip)).toString("base64");
b64[DASH.strip] = readFileSync(join(SRCDIR, DASH.strip)).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (b64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME_W, FRAME_H, SCALE_REF, DASH } = CFG;

  async function load(strip) {
    const img = new Image(); img.src = "data:image/png;base64," + b64[strip]; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0);
    return { cv, data: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width };
  }
  function frameBBox(sheet, col) {
    const { data, w } = sheet, ox = col * FRAME_W;
    let minx = FRAME_W, miny = FRAME_H, maxx = -1, maxy = -1;
    for (let j = 0; j < FRAME_H; j++) for (let i = 0; i < FRAME_W; i++) {
      if (data[(j * w + (ox + i)) * 4 + 3] > 16) {
        if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j;
      }
    }
    return maxx < 0 ? null : { minx, miny, maxx, maxy };
  }

  // global SCALE from the 4 canonical warrior states (NOT dash) → identical size to live warrior.
  let maxFigH = 1;
  for (const name in SCALE_REF) { const S = SCALE_REF[name]; const sh = await load(S.strip);
    for (let c = 0; c < S.src; c++) { const bb = frameBBox(sh, c); if (bb) maxFigH = Math.max(maxFigH, bb.maxy - bb.miny + 1); } }
  const SCALE = FIGURE_H / maxFigH;

  // bake dash. ANCHOR on the SETTLE frame (last source frame = a fully grounded Clarice),
  // NOT frame 0 which is a pure-VFX ignition spark — so feet/centre land on the SAME
  // baseline as idle/walk/attack/death instead of floating on the spark's centroid.
  const sh = await load(DASH.strip);
  const ref = frameBBox(sh, DASH.src - 1) || { minx: 30, miny: 8, maxx: 65, maxy: 56 };
  const cxSrc = (ref.minx + ref.maxx) / 2, feetSrc = ref.maxy + 1;
  const strip = document.createElement("canvas"); strip.width = CELL_W * DASH.out; strip.height = CELL_H;
  const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;
  for (let j = 0; j < DASH.out; j++) {
    const srcCol = DASH.out === DASH.src ? j : Math.min(DASH.src - 1, Math.round(j * (DASH.src - 1) / (DASH.out - 1)));
    const ox = srcCol * FRAME_W, dW = FRAME_W * SCALE, dH = FRAME_H * SCALE;
    const dx = j * CELL_W + ANCHOR_X - cxSrc * SCALE, dy = FOOT - feetSrc * SCALE;
    sx.drawImage(sh.cv, ox, 0, FRAME_W, FRAME_H, dx, dy, dW, dH);
  }
  return { file: DASH.file, dataUrl: strip.toDataURL("image/png"),
    scale: +SCALE.toFixed(3), w: strip.width, h: strip.height, fc: DASH.out };
}, b64, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME_W, FRAME_H, SCALE_REF, DASH });

const buf = Buffer.from(out.dataUrl.split(",")[1], "base64");
writeFileSync(join(OUT, out.file), buf);
console.log(`  dash -> ${out.file}  ${out.w}x${out.h}  fc=${out.fc}  scale=${out.scale}`);
await browser.close();
console.log("done.");
