// CAS-282 — Re-bake the WARRIOR (Clarice) DYNAMIC strips into WIDE, body-centred cells
// so the full attack / special / hurt / death FX is captured instead of being clipped
// at the 140px cell boundary.
//
// THE BUG: CAS-254/256 baked these poses into the SAME 140px (CLASS_FW) cell the idle/
// walk strips use. But Clarice's dynamic frames carry a WIDE effect (the fiery sword
// sweep, the whip/charge arc) that, at the shared global SCALE, is far wider than 140px.
// drawImage drew each frame's full 96px source frame (~96·SCALE ≈ 275px) into a 140px
// column, so the effect overflowed into — and was overwritten by — the neighbouring
// cell. In-game you saw a sword/arc cut off mid-swing ("no se ve el efecto completo").
// Measured edge contact (rows touching a cell edge): attack 5/6 frames (worst 59),
// special 8/8 (59), hurt 6/6 (43), death 6/6 (91).
//
// THE FIX: bake these four strips into a WIDER cell, CELL_W_WIDE, with the figure's
// body-centroid at the cell CENTRE (so renderer anchor = fw/2) and feet still on FOOT.
// Identical global SCALE as CAS-254/256 (figure size unchanged on screen) and identical
// frame counts (attack 6, death 6, hurt 6, special 8). render.js auto-detects the wider
// frame width per strip (fw = naturalWidth/fc; fw>CLASS_FW → centre anchor), so the
// idle/walk strips and the other classes' 140px strips are untouched.
//
//   node tools/cas282-warrior-wide.mjs
//
// Writes: assets/erw/hero/classes/warrior_attack.png, warrior_death.png,
//         warrior_hurt.png, warrior_special.png  (WIDE Clarice dynamic strips).
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRCDIR = join(ROOT, "assets", "clarice", "extended", "SpriteSheets");
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const P = "Clarice-noctural-creature-hunter-";

// MUST match render.js CLASS_FH/FOOT/ANIM and CAS-254/256 (so figure size is identical).
// Legacy cells are 166 tall with feet on row 163 → a constant 3px gap below the feet.
// The wide strips keep that SAME bottom gap (feet at cellH-BOTTOM_GAP) but grow their
// height per-state so a raised-weapon charge frame isn't clipped at the top. render.js
// reads each strip's height and derives the feet row as fh-BOTTOM_GAP.
const CELL_H = 166, FOOT = 163, FIGURE_H = 160, BOTTOM_GAP = CELL_H - FOOT; // 3
const FRAME_W = 96, FRAME_H = 64;

// The 4 base states CAS-254 baked — decoded ONLY to recompute the identical global SCALE
// (max figure height across these frames) so the re-baked strips render at the same size.
const BASE = {
  idle:   { strip: `${P}Idle.png`,          src: 6 },
  walk:   { strip: `${P}Run.png`,           src: 8 },
  attack: { strip: `${P}normal attack.png`, src: 11 },
  death:  { strip: `${P}Die.png`,           src: 14 },
};
// The dynamic states this task RE-BAKES wide. out frame counts MUST match render.js
// (CLASS_ATTACK_FC=6, CLASS_DEATH_FC=6, CLASS_HURT_FC=6, CLASS_SPECIAL_FC=8).
const STATES = {
  attack:  { strip: `${P}normal attack.png`,  src: 11, out: 6, file: "warrior_attack.png" },
  death:   { strip: `${P}Die.png`,            src: 14, out: 6, file: "warrior_death.png" },
  hurt:    { strip: `${P}Hurt.png`,           src: 6,  out: 6, file: "warrior_hurt.png" },
  special: { strip: `${P}Special attack.png`, src: 20, out: 8, file: "warrior_special.png" },
};

const b64 = {};
const needed = new Set([...Object.values(BASE), ...Object.values(STATES)].map(s => s.strip));
for (const s of needed) b64[s] = readFileSync(join(SRCDIR, s)).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (b64, CFG) => {
  const { CELL_H, FOOT, FIGURE_H, BOTTOM_GAP, FRAME_W, FRAME_H, BASE, STATES } = CFG;

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

  // 1) global SCALE — identical derivation to CAS-254/256 (tallest figure across the 4
  //    base states), so the re-baked figure is the SAME on-screen size as idle/walk.
  let maxFigH = 1;
  for (const name in BASE) { const S = BASE[name]; const sh = await load(S.strip);
    for (let c = 0; c < S.src; c++) { const bb = frameBBox(sh, c); if (bb) maxFigH = Math.max(maxFigH, bb.maxy - bb.miny + 1); } }
  const SCALE = FIGURE_H / maxFigH;

  const srcColOf = (S, j) => S.out === S.src ? j : Math.min(S.src - 1, Math.round(j * (S.src - 1) / (S.out - 1)));

  // 2+3) bake each dynamic state into ITS OWN wide cell — sized to that state's content
  //    so the snug attack cell isn't bloated by the special's big AoE. Cell is symmetric
  //    around the state's frame-0 body-centroid (feet planted, so a flip pivots on the
  //    body and AX = cellW/2). Identical SCALE → figure size unchanged on screen.
  const results = {};
  for (const name in STATES) {
    const S = STATES[name]; const sh = await load(S.strip);
    const ref = frameBBox(sh, 0) || { minx: 30, miny: 8, maxx: 65, maxy: 56 };
    const cxSrc = (ref.minx + ref.maxx) / 2, feetSrc = ref.maxy + 1;
    // max half-width and top-extent (scaled) of opaque content relative to the body
    // centroid / feet. Measure on the EXACT source column each out-frame draws.
    let halfW = 1, topExt = FIGURE_H;
    for (let j = 0; j < S.out; j++) {
      const sc = srcColOf(S, j); const bb = frameBBox(sh, sc); if (!bb) continue;
      halfW = Math.max(halfW, (cxSrc - bb.minx) * SCALE, (bb.maxx - cxSrc) * SCALE);
      topExt = Math.max(topExt, (feetSrc - bb.miny) * SCALE);   // height above the feet row
    }
    let cellW = Math.ceil(halfW) * 2 + 32;                // symmetric + generous pad
    if (cellW % 2) cellW++;                                // even → integer centre
    let cellH = Math.ceil(topExt) + BOTTOM_GAP + 4;       // top content + feet gap + pad
    if (cellH < CELL_H) cellH = CELL_H;                    // never shorter than legacy
    const AX = cellW / 2, FEET = cellH - BOTTOM_GAP;
    console.log(`  [${name}] cell=${cellW}x${cellH} AX=${AX} FEET=${FEET}`);
    const strip = document.createElement("canvas"); strip.width = cellW * S.out; strip.height = cellH;
    const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;
    const dW = FRAME_W * SCALE, dH = FRAME_H * SCALE;
    for (let j = 0; j < S.out; j++) {
      const ox = srcColOf(S, j) * FRAME_W;
      const dx = j * cellW + AX - cxSrc * SCALE;
      const dy = FEET - feetSrc * SCALE;
      sx.drawImage(sh.cv, ox, 0, FRAME_W, FRAME_H, dx, dy, dW, dH);
    }
    results[name] = { file: S.file, dataUrl: strip.toDataURL("image/png"), w: strip.width, h: strip.height, cellW, cellH, AX };
  }
  return { SCALE: +SCALE.toFixed(4), results };
}, b64, { CELL_H, FOOT, FIGURE_H, BOTTOM_GAP, FRAME_W, FRAME_H, BASE, STATES });

console.log(`SCALE=${out.SCALE}`);
for (const name in out.results) {
  const r = out.results[name];
  writeFileSync(join(OUT, r.file), Buffer.from(r.dataUrl.split(",")[1], "base64"));
  console.log(`  ${name.padEnd(8)} -> ${r.file}  ${r.w}x${r.h}  (${r.w / r.cellW} frames @ ${r.cellW}x${r.cellH}px, AX=${r.AX})`);
}
await browser.close();
console.log("done.");
