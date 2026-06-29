// CAS-254 — Rebuild the WARRIOR class hero from the EXTENDED Clarice pack the CEO
// supplied via Drive (Clarice-noctural-creature-hunter-96x64-Extended). This pack ships
// one PNG strip PER animation at 96×64 frames (higher fidelity + more frames than the
// old clarice_v1 atlas the CAS-223 warrior was baked from):
//   Idle = 6f, Run = 8f, normal attack = 11f, Die = 14f, Hurt = 6f, Special attack = 20f …
//
// The in-world hero renderer (render.js drawHeroClass) draws from ONE shared
// CLASS_FW×CLASS_FH cell, feet anchored at FOOT, centroid at ANCHOR_X, scaled by
// CLASS_ANIM_SCALE. It reads fixed frame counts: idle=6, walk=8, attack=6, death=6.
// So we bake the Clarice figure into that SAME cell with the CAS-223 math (nearest-
// neighbor, ONE global scale so the figure never pulses size, feet/centre anchored per
// state's frame 0) and conform each source strip to the engine's frame count
// (attack 11→6, death 14→6 even subsample; idle/run are already 6/8).
//
//   node tools/cas254-warrior-clarice-ext.mjs
//
// Writes: assets/erw/hero/classes/warrior{,_walk,_attack,_death}.png  (extended Clarice).
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

// state -> { source strip file, source frame count, output frame count, out file }.
// out frame counts MUST match render.js (CLASS_FC=6, CLASS_WALK_FC=8, CLASS_ATTACK_FC=6,
// CLASS_DEATH_FC=6). Subsample when src > out (attack 11→6, death 14→6).
const STATES = {
  idle:   { strip: `${P}Idle.png`,          src: 6,  out: 6, file: "warrior.png" },
  walk:   { strip: `${P}Run.png`,           src: 8,  out: 8, file: "warrior_walk.png" },
  attack: { strip: `${P}normal attack.png`, src: 11, out: 6, file: "warrior_attack.png" },
  death:  { strip: `${P}Die.png`,           src: 14, out: 6, file: "warrior_death.png" },
};

const b64 = {};
for (const k in STATES) b64[STATES[k].strip] = readFileSync(join(SRCDIR, STATES[k].strip)).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (b64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME_W, FRAME_H, STATES } = CFG;

  // decode every source strip into an offscreen canvas + raw pixel buffer
  const sheets = {};
  for (const name in STATES) {
    const S = STATES[name];
    const img = new Image(); img.src = "data:image/png;base64," + b64[S.strip]; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0);
    sheets[name] = { cv, data: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width };
  }

  // bbox of opaque pixels inside frame `col` of state `name`'s strip
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

  // ONE global scale across every state/frame so Clarice never pulses size between
  // idle/walk/attack/death. Derived from the TALLEST figure frame found anywhere, so
  // no frame clips the top of the cell.
  let maxFigH = 1;
  for (const name in STATES) { const S = STATES[name];
    for (let c = 0; c < S.src; c++) { const bb = frameBBox(name, c); if (bb) maxFigH = Math.max(maxFigH, bb.maxy - bb.miny + 1); } }
  const SCALE = FIGURE_H / maxFigH;

  const results = {};
  for (const name in STATES) {
    const S = STATES[name];
    // anchor (centre-x + feet-y) from this strip's frame 0, applied to every frame so
    // feet stay planted while limbs animate.
    const ref = frameBBox(name, 0) || { minx: 30, miny: 8, maxx: 65, maxy: 56 };
    const figH = ref.maxy - ref.miny + 1;
    const cxSrc = (ref.minx + ref.maxx) / 2;       // figure centre-x in the source frame
    const feetSrc = ref.maxy + 1;                  // bottom of the figure
    const strip = document.createElement("canvas"); strip.width = CELL_W * S.out; strip.height = CELL_H;
    const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;
    for (let j = 0; j < S.out; j++) {
      // even subsample / resample when out != src (attack 11→6, death 14→6, run 8→8)
      const srcCol = S.out === S.src ? j : Math.min(S.src - 1, Math.round(j * (S.src - 1) / (S.out - 1)));
      const ox = srcCol * FRAME_W;
      const dW = FRAME_W * SCALE, dH = FRAME_H * SCALE;
      // dest mapping: source feet -> FOOT, source centre-x -> ANCHOR_X, uniform scale
      const dx = j * CELL_W + ANCHOR_X - cxSrc * SCALE;
      const dy = FOOT - feetSrc * SCALE;
      sx.drawImage(sheets[name].cv, ox, 0, FRAME_W, FRAME_H, dx, dy, dW, dH);
    }
    results[name] = { file: S.file, dataUrl: strip.toDataURL("image/png"),
      scale: +SCALE.toFixed(3), figH, w: strip.width, h: strip.height };
  }
  return results;
}, b64, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME_W, FRAME_H, STATES });

for (const name in out) {
  const r = out[name];
  const buf = Buffer.from(r.dataUrl.split(",")[1], "base64");
  writeFileSync(join(OUT, r.file), buf);
  console.log(`  ${name.padEnd(7)} -> ${r.file}  ${r.w}x${r.h}  scale=${r.scale} (figH=${r.figH}px)`);
}
await browser.close();
console.log("done.");
