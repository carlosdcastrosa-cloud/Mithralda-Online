// CAS-326 QC montage: scale-up the baked warrior_dash 8 frames + an idle frame for
// size/style comparison, on a dark game-like ground. node tools/cas326-montage.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(ROOT, "assets", "erw", "hero", "classes");
const b64 = f => readFileSync(join(dir, f)).toString("base64");
const dash = b64("warrior_dash.png"), idle = b64("warrior.png");
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const url = await page.evaluate(async (dash, idle) => {
  const CELL_W = 140, CELL_H = 166, Z = 1.4, pad = 8;
  async function img(b) { const im = new Image(); im.src = "data:image/png;base64," + b; await im.decode(); return im; }
  const di = await img(dash), ii = await img(idle);
  const dfc = di.naturalWidth / CELL_W, cols = dfc + 1; // +1 idle ref
  const cw = CELL_W * Z, ch = CELL_H * Z;
  const cv = document.createElement("canvas"); cv.width = cols * (cw + pad) + pad; cv.height = ch + 2 * pad + 18;
  const x = cv.getContext("2d"); x.imageSmoothingEnabled = false;
  x.fillStyle = "#1b2230"; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = "#0e131c"; x.fillRect(0, pad + ch * 0.78, cv.width, ch * 0.22 + pad); // "ground"
  for (let i = 0; i < dfc; i++) {
    const dx = pad + i * (cw + pad);
    x.drawImage(di, i * CELL_W, 0, CELL_W, CELL_H, dx, pad, cw, ch);
    x.fillStyle = "#9fb3c8"; x.font = "12px monospace"; x.fillText("dash " + i, dx + 4, cv.height - 6);
  }
  const ix = pad + dfc * (cw + pad);
  x.fillStyle = "#243044"; x.fillRect(ix, pad, cw, ch);
  x.drawImage(ii, 0, 0, CELL_W, CELL_H, ix, pad, cw, ch);
  x.fillStyle = "#ffd27f"; x.font = "12px monospace"; x.fillText("idle ref", ix + 4, cv.height - 6);
  return cv.toDataURL("image/png");
}, dash, idle);
writeFileSync(join(ROOT, "tools", "cas326-montage.png"), Buffer.from(url.split(",")[1], "base64"));
await browser.close();
console.log("wrote tools/cas326-montage.png");
