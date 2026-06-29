// CAS-256 — follow-up to CAS-254. Bake the REMAINING applicable WARRIOR animations
// from the EXTENDED Clarice pack into the SAME shared CLASS_FW×CLASS_FH cell the
// renderer draws from. CAS-254 shipped idle/walk/attack/death; this adds:
//   HURT    = 6f  (Clarice "Hurt")          -> warrior_hurt.png    (hit-react flinch)
//   SPECIAL = 20f (Clarice "Special attack") -> warrior_special.png (skill/ability cast)
// (Jump/Fall/wall-slide/dash are platformer-only and N/A for a top-down ARPG — skipped.)
//
// CRITICAL: the figure must NOT pulse size between idle and these new states, so we
// reuse the EXACT global SCALE CAS-254 derived — i.e. FIGURE_H / (tallest figure across
// the original idle/walk/attack/death frames). We decode those 4 base strips only to
// recompute that identical scale, then bake hurt+special with the CAS-223 anchor math
// (one global scale, feet/centre anchored per state's frame 0). Output frame counts are
// chosen so render.js can play them once across a fixed duration (hurt 6, special 8).
//
//   node tools/cas256-warrior-clarice-anims.mjs
//
// Writes: assets/erw/hero/classes/warrior_hurt.png, warrior_special.png
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRCDIR = join(ROOT, "assets", "clarice", "extended", "SpriteSheets");
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const P = "Clarice-noctural-creature-hunter-";

// MUST match render.js CLASS_FW/FH/AX/FOOT + classes.json. FRAME = source frame size.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160;
const FRAME_W = 96, FRAME_H = 64;

// The 4 base states CAS-254 baked — decoded ONLY to recompute the identical global SCALE
// (max figure height across these frames) so the new strips render at the same size.
const BASE = {
  idle:   { strip: `${P}Idle.png`,          src: 6 },
  walk:   { strip: `${P}Run.png`,           src: 8 },
  attack: { strip: `${P}normal attack.png`, src: 11 },
  death:  { strip: `${P}Die.png`,           src: 14 },
};
// The new states this task bakes. out frame counts MUST match render.js
// (CLASS_HURT_FC=6, CLASS_SPECIAL_FC=8). Subsample when src > out (special 20→8).
const NEW = {
  hurt:    { strip: `${P}Hurt.png`,           src: 6,  out: 6, file: "warrior_hurt.png" },
  special: { strip: `${P}Special attack.png`, src: 20, out: 8, file: "warrior_special.png" },
};

const ALL = { ...BASE, ...NEW };
const b64 = {};
for (const k in ALL) b64[ALL[k].strip] = readFileSync(join(SRCDIR, ALL[k].strip)).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (b64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME_W, FRAME_H, BASE, NEW } = CFG;
  const ALL = { ...BASE, ...NEW };

  const sheets = {};
  for (const name in ALL) {
    const S = ALL[name];
    const img = new Image(); img.src = "data:image/png;base64," + b64[S.strip]; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0);
    sheets[name] = { cv, data: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width };
  }

  function frameBBox(name, col) {
    const { data, w } = sheets[name];
    const ox = col * FRAME_W;
    let minx = FRAME_W, miny = FRAME_H, maxx = -1, maxy = -1;
    for (let j = 0; j < FRAME_H; j++) for (let i = 0; i < FRAME_W; i++) {
      if (data[(j * w + (ox + i)) * 4 + 3] > 16) {
        if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j;
      }
    }
    return maxx < 0 ? null : { minx, miny, maxx, maxy };
  }

  // EXACT CAS-254 scale: tallest figure across the ORIGINAL 4 base states only.
  let maxFigH = 1;
  for (const name in BASE) { const S = BASE[name];
    for (let c = 0; c < S.src; c++) { const bb = frameBBox(name, c); if (bb) maxFigH = Math.max(maxFigH, bb.maxy - bb.miny + 1); } }
  const SCALE = FIGURE_H / maxFigH;

  const results = {};
  for (const name in NEW) {
    const S = NEW[name];
    const ref = frameBBox(name, 0) || { minx: 30, miny: 8, maxx: 65, maxy: 56 };
    const figH = ref.maxy - ref.miny + 1;
    const cxSrc = (ref.minx + ref.maxx) / 2;
    const feetSrc = ref.maxy + 1;
    const strip = document.createElement("canvas"); strip.width = CELL_W * S.out; strip.height = CELL_H;
    const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;
    for (let j = 0; j < S.out; j++) {
      const srcCol = S.out === S.src ? j : Math.min(S.src - 1, Math.round(j * (S.src - 1) / (S.out - 1)));
      const ox = srcCol * FRAME_W;
      const dW = FRAME_W * SCALE, dH = FRAME_H * SCALE;
      const dx = j * CELL_W + ANCHOR_X - cxSrc * SCALE;
      const dy = FOOT - feetSrc * SCALE;
      sx.drawImage(sheets[name].cv, ox, 0, FRAME_W, FRAME_H, dx, dy, dW, dH);
    }
    results[name] = { file: S.file, dataUrl: strip.toDataURL("image/png"),
      scale: +SCALE.toFixed(3), figH, w: strip.width, h: strip.height };
  }
  return results;
}, b64, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME_W, FRAME_H, BASE, NEW });

for (const name in out) {
  const r = out[name];
  const buf = Buffer.from(r.dataUrl.split(",")[1], "base64");
  writeFileSync(join(OUT, r.file), buf);
  console.log(`  ${name.padEnd(8)} -> ${r.file}  ${r.w}x${r.h}  scale=${r.scale} (figH=${r.figH}px)`);
}
await browser.close();
console.log("done.");
