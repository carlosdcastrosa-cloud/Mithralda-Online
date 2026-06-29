// CAS-206: bake cas199 FOUNTAINS-style hero sprites into the class strip format.
// Each cas199_hero_<cls>.png (64×96 single-frame, transparent bg) is scaled to
// fill the 140×166 cell (figure ~160px tall) and repeated 6× with a 1px breathing
// bob to produce a minimal idle animation strip. Saves directly over the active
// assets/erw/hero/classes/<cls>.png files so the game picks them up immediately.
//
// Run: node tools/cas206-bake-hero-sprites.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CLASSES = ["warrior","paladin","mage","druid","priest"];
const SRC_DIR = join(ROOT, "assets","pixellab","fountains");
const OUT_DIR = join(ROOT, "assets","erw","hero","classes");

// Cell geometry — must match classes.json / render.js constants
const CELL_W = 140, CELL_H = 166;
const IDLE_FC = 6;  // 6-frame idle strip

const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");

  for (const cls of CLASSES) {
    const src = join(SRC_DIR, `cas199_hero_${cls}.png`);
    let b64;
    try { b64 = readFileSync(src).toString("base64"); }
    catch(e){ console.warn(`[SKIP] ${cls}: ${e.message}`); continue; }

    const strip = await page.evaluate(async (b64, cls, CELL_W, CELL_H, IDLE_FC) => {
      // Load the source sprite
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res; img.onerror = rej;
        img.src = "data:image/png;base64," + b64;
      });

      // Scale to fill cell height with a small margin; keep aspect ratio
      const margin = 4;
      const maxH = CELL_H - margin * 2;
      const scale = maxH / img.naturalHeight;
      const dw = Math.round(img.naturalWidth * scale);
      const dh = Math.round(img.naturalHeight * scale);
      const cx = Math.floor((CELL_W - dw) / 2);  // center horizontally
      const cy = CELL_H - margin - dh;             // bottom-anchor

      // Build the 6-frame idle strip canvas
      const canvas = document.createElement("canvas");
      canvas.width = CELL_W * IDLE_FC;
      canvas.height = CELL_H;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;

      for (let f = 0; f < IDLE_FC; f++) {
        // Gentle breathing bob: frames 0-2 breathe in (up 1px), 3-5 breathe out
        const bob = f < 3 ? -f * 0.5 : -(5 - f) * 0.5;
        ctx.drawImage(img, cx + f * CELL_W, Math.round(cy + bob), dw, dh);
      }

      return canvas.toDataURL("image/png").split(",")[1];
    }, b64, cls, CELL_W, CELL_H, IDLE_FC);

    const buf = Buffer.from(strip, "base64");
    const outPath = join(OUT_DIR, `${cls}.png`);
    writeFileSync(outPath, buf);
    console.log(`[OK] ${cls}.png  (${CELL_W * IDLE_FC}×${CELL_H})`);
  }

  console.log("Done — FOUNTAINS hero sprites baked into assets/erw/hero/classes/");
} finally {
  await browser.close();
}
// This is intentionally not part of the main module - kept for reference
