// tools/preview-class-walk.mjs — CAS-108 QA: contact sheet of the baked walk
// strips. Each row = one class, columns = the WALK_FC frames, drawn 2× on a dark
// slate ground with a foot-baseline rule so leg alternation is easy to eyeball.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const DIR = join(ROOT, "assets", "erw", "hero", "classes");
const G = JSON.parse(readFileSync(join(DIR, "walk.json"), "utf8"));
const { frameW: FW, frameH: FH, foot: FOOT, frames: FC, art } = G;
const Z = 2, GAP = 8;

const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const imgs = Object.fromEntries(art.map(a => [a, "data:image/png;base64," + readFileSync(join(DIR, `${a}_walk.png`)).toString("base64")]));

const b64 = await page.evaluate(async (imgs, P) => {
  const { FW, FH, FOOT, FC, art, Z, GAP } = P;
  const cw = FW * Z, ch = FH * Z;
  const W = (cw + GAP) * FC + GAP + 90, H = (ch + GAP) * art.length + GAP;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.fillStyle = "#2b2f36"; g.fillRect(0, 0, W, H);
  for (let r = 0; r < art.length; r++) {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = imgs[art[r]]; });
    const y = GAP + r * (ch + GAP);
    g.fillStyle = "#cdd3da"; g.font = "16px sans-serif"; g.fillText(art[r], 6, y + 18);
    for (let fi = 0; fi < FC; fi++) {
      const x = 90 + fi * (cw + GAP);
      g.fillStyle = "#23262c"; g.fillRect(x, y, cw, ch);
      // foot baseline rule
      g.strokeStyle = "#4b5563"; g.beginPath(); g.moveTo(x, y + FOOT * Z); g.lineTo(x + cw, y + FOOT * Z); g.stroke();
      g.drawImage(im, fi * FW, 0, FW, FH, x, y, cw, ch);
    }
  }
  return c.toDataURL("image/png").split(",")[1];
}, imgs, { FW, FH, FOOT, FC, art, Z, GAP });
writeFileSync(join(ROOT, "tools", "cas108-walk-preview.png"), Buffer.from(b64, "base64"));
console.log("✔ tools/cas108-walk-preview.png");
await browser.close();
