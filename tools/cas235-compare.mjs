// CAS-235 — before/after comparison sheet. Renders frame-0 of OLD warrior idle
// (chunky, ~28px native upscaled), NEW warrior idle, and PALADIN idle (parity ref)
// all at the same on-screen height, plus a row of the NEW idle/walk/attack/death.
//   node tools/cas235-compare.mjs   ->  tools/cas235-compare.png
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CELL_W = 140, CELL_H = 166;
const b64 = p => readFileSync(p).toString("base64");
const imgs = {
  old:     b64("/tmp/before_warrior_idle.png"),
  newIdle: b64(join(ROOT, "assets/erw/hero/classes/warrior.png")),
  paladin: b64(join(ROOT, "assets/erw/hero/classes/paladin.png")),
  walk:    b64(join(ROOT, "assets/erw/hero/classes/warrior_walk.png")),
  attack:  b64(join(ROOT, "assets/erw/hero/classes/warrior_attack.png")),
  death:   b64(join(ROOT, "assets/erw/hero/classes/warrior_death.png")),
};

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const dataUrl = await page.evaluate(async (imgs, CELL_W, CELL_H) => {
  const dec = async b => { const i = new Image(); i.src = "data:image/png;base64," + b; await i.decode(); return i; };
  const I = {}; for (const k in imgs) I[k] = await dec(imgs[k]);
  const SCALE = 1.6, cw = Math.round(CELL_W*SCALE), ch = Math.round(CELL_H*SCALE);
  const cols1 = 3, cols2 = 4, pad = 14, top = 34, rowGap = 30;
  const W = Math.max(cols1, cols2)*cw + (Math.max(cols1,cols2)+1)*pad;
  const H = top + ch + rowGap + top + ch + pad;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
  x.fillStyle = "#10131a"; x.fillRect(0,0,W,H);
  x.imageSmoothingEnabled = false;
  const cellFrame = (img, fi, dx, dy, label) => {
    x.fillStyle = "#e6e9f0"; x.font = "16px sans-serif"; x.textAlign = "center";
    x.fillText(label, dx+cw/2, dy-10);
    x.strokeStyle = "#2a2f3a"; x.strokeRect(dx, dy, cw, ch);
    x.imageSmoothingEnabled = false;
    x.drawImage(img, fi*CELL_W, 0, CELL_W, CELL_H, dx, dy, cw, ch);
  };
  // Row 1: before / after / paladin (idle frame 0)
  let y = top;
  cellFrame(I.old,     0, pad,            y, "BEFORE (chunky)");
  cellFrame(I.newIdle, 0, pad*2+cw,       y, "AFTER (hi-res)");
  cellFrame(I.paladin, 0, pad*3+cw*2,     y, "Paladin (ref)");
  // Row 2: new idle/walk/attack/death sample frames
  y = top + ch + rowGap + top;
  cellFrame(I.newIdle, 2, pad,            y, "idle");
  cellFrame(I.walk,    4, pad*2+cw,       y, "walk");
  cellFrame(I.attack,  3, pad*3+cw*2,     y, "attack");
  cellFrame(I.death,   5, pad*4+cw*3,     y, "death");
  return c.toDataURL("image/png");
}, imgs, CELL_W, CELL_H);

writeFileSync(join(ROOT, "tools/cas235-compare.png"), Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log("wrote tools/cas235-compare.png");
