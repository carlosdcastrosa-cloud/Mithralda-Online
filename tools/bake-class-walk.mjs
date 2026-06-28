// ===========================================================================
// tools/bake-class-walk.mjs — CAS-108: bake a REAL per-frame WALK CYCLE strip
// for the 5 playable classes (+ the 2 spare base arts), derived from the
// existing CAS-101 bg-removed idle sprites. ZERO Higgsfield credits, fully
// deterministic, and palette-identical to the shipped art (it re-uses the exact
// idle pixels) — so it can never drift off the frozen STYLE FORMULA.
//
// WHY a bake instead of a generated video: the in-game movement already applies
// runtime PROCEDURAL body bob/squash/hop (render.js sqX/sqY/bobUp). What a single
// idle frame CANNOT express — and what a frame walk uniquely adds — is
// ALTERNATING LEG motion. So this bakes exactly that: a top-down (camera-facing)
// gait where each foot lifts in turn, pivoting at the hip, while the torso is
// left for the runtime bob to handle. No body-bob is baked here (it would just
// double the runtime bob and risk clipping the tight 166px cell head-room).
//
// SAME CELL GEOMETRY as the idle strips (classes.json: 140×166, anchorX 65,
// foot 163, figureH 160) so the engineer's wiring is trivial: a second strip
// keyed by movement, identical draw path, just a different frame count
// (CLASS_WALK_FC). Emits assets/erw/hero/classes/{class}_walk.png (WALK_FC
// columns) + assets/erw/hero/classes/walk.json (geometry manifest).
//
// Run: node tools/bake-class-walk.mjs          (optional first arg = frame count)
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const WALK_FC = Math.max(4, parseInt(process.argv[2] || "6", 10));   // frames per loop
const DIR = join(ROOT, "assets", "erw", "hero", "classes");
const GEOM = JSON.parse(readFileSync(join(DIR, "classes.json"), "utf8"));
const { frameW: FW, frameH: FH, anchorX: AX, foot: FOOT, figureH } = GEOM;
// all art keys that have an idle strip → each gets a matching walk strip (free)
const ART = ["warrior", "paladin", "mage", "druid", "priest", "archer", "rogue"];

// gait tuning (cell-space px; on-screen ≈ ×0.32). Legs lift UP only (one foot at
// a time) so nothing ever crosses the FOOT baseline (no bottom clip); the hip is
// the pivot so the lift tapers to 0 at the waist.
const LIFT = 11;         // max foot/hem-lift in px (≈3.5px on screen)
const BEND = 3;          // knee/hem draws toward centre when lifted
const SWAY = 6;          // body weight-shift lean (px at the head, → 0 at feet)
const LEG_FRAC = 0.46;   // bottom fraction of the figure treated as "legs"
const ALPHA = 24;        // opaque threshold for bbox

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

async function bake(cls) {
  const uri = "data:image/png;base64," + readFileSync(join(DIR, `${cls}.png`)).toString("base64");
  const b64 = await page.evaluate(async (uri, P) => {
    const { FW, FH, AX, WALK_FC, LIFT, BEND, SWAY, LEG_FRAC, ALPHA } = P;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; });
    // pull the neutral base pose = idle frame 0 (cols 0..FW)
    const base = document.createElement("canvas"); base.width = FW; base.height = FH;
    const bg = base.getContext("2d", { willReadFrequently: true }); bg.imageSmoothingEnabled = false;
    bg.drawImage(img, 0, 0, FW, FH, 0, 0, FW, FH);
    const src = bg.getImageData(0, 0, FW, FH).data;
    const op = (x, y) => src[(y * FW + x) * 4 + 3] > ALPHA;
    // figure bbox → hip row
    let y0 = FH, y1 = -1, x0 = FW, x1 = -1;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (op(x, y)) {
      if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const hip = Math.round(y1 - (y1 - y0) * LEG_FRAC);
    const legSpan = Math.max(1, y1 - hip);
    const figSpan = Math.max(1, y1 - y0);

    const strip = document.createElement("canvas");
    strip.width = FW * WALK_FC; strip.height = FH;
    const sg = strip.getContext("2d", { willReadFrequently: true }); sg.imageSmoothingEnabled = false;

    for (let fi = 0; fi < WALK_FC; fi++) {
      const phase = (fi / WALK_FC) * Math.PI * 2;
      const s = Math.sin(phase);
      const leftUp = Math.max(0, s);     // left foot lifts on the +sin half
      const rightUp = Math.max(0, -s);   // right foot lifts on the -sin half
      const cell = document.createElement("canvas"); cell.width = FW; cell.height = FH;
      const cg = cell.getContext("2d", { willReadFrequently: true }); cg.imageSmoothingEnabled = false;
      const out = cg.createImageData(FW, FH); const od = out.data;
      const put = (x, y, si) => { if (x < 0 || y < 0 || x >= FW || y >= FH) return;
        const di = (y * FW + x) * 4; if (od[di + 3]) return;     // keep first writer (torso over leg)
        od[di] = src[si]; od[di + 1] = src[si + 1]; od[di + 2] = src[si + 2]; od[di + 3] = src[si + 3]; };
      // weight-shift: lean toward the planted foot — max at head, 0 at the feet.
      // left foot up ⇒ weight on right ⇒ body leans right (+x), and vice-versa.
      const lean = (leftUp - rightUp) * SWAY;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const si = (y * FW + x) * 4; if (src[si + 3] <= ALPHA) continue;
        const tf = (y - y0) / figSpan;                          // 0 at head → 1 at feet
        let dx = Math.round(lean * (1 - tf));                   // waddle lean
        let dy = 0;
        if (y > hip) {                                          // legs/hem: per-foot lift
          const t = (y - hip) / legSpan;                        // 0 at hip → 1 at foot
          const isLeft = x < AX;
          const up = isLeft ? leftUp : rightUp;
          dy = -Math.round(LIFT * up * t);                      // up only
          dx += Math.round(BEND * up * t) * (isLeft ? 1 : -1);  // knee toward centre
        }
        put(x + dx, y + dy, si);
      }
      cg.putImageData(out, 0, 0);
      sg.drawImage(cell, fi * FW, 0);
    }
    return strip.toDataURL("image/png").split(",")[1];
  }, uri, { FW, FH, AX, WALK_FC, LIFT, BEND, SWAY, LEG_FRAC, ALPHA });
  writeFileSync(join(DIR, `${cls}_walk.png`), Buffer.from(b64, "base64"));
  console.log(`✔ classes/${cls}_walk.png  ${WALK_FC}×(${FW}×${FH})`);
}

for (const cls of ART) await bake(cls);

const walkGeom = {
  _doc: "CAS-108: per-class WALK-CYCLE strips (alternating-leg gait, baked from the CAS-101 idle sprites). SAME cell geometry as classes.json — draw column fi with feet on `foot`, lower-body centroid on `anchorX`; on-screen size unchanged (CLASS_ANIM_SCALE 0.32). Wire as a second strip keyed by movement; torso bob is still the runtime procedural so it is intentionally NOT baked here.",
  frameW: FW, frameH: FH, anchorX: AX, foot: FOOT, figureH,
  frames: WALK_FC, walkFps: 8, art: ART,
};
writeFileSync(join(DIR, "walk.json"), JSON.stringify(walkGeom, null, 2));
console.log("walk geom", JSON.stringify(walkGeom));
await browser.close();
