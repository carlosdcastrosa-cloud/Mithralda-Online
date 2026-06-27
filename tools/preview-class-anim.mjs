// preview-class-anim.mjs — composite the 4 class anim strips onto a light
// flagstone-ish background so dark-key halos / eaten-hood show up. Emits two
// montages: full-res frames grid + game-scale (CLASS_ANIM_SCALE) row.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const geom = JSON.parse(readFileSync(join(OUT, "classes.json"), "utf8"));
const { frameW: FW, frameH: FH, anchorX: AX, foot: FOOT, frames: NF, classes } = geom;
const S = 0.32; // CLASS_ANIM_SCALE

const uris = {};
for (const c of classes) uris[c] = "data:image/png;base64," + readFileSync(join(OUT, `${c}.png`)).toString("base64");

const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

const b64 = await page.evaluate(async (uris, classes, FW, FH, NF, AX, FOOT, S) => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const imgs = {}; for (const c of classes) imgs[c] = await load(uris[c]);
  // two panels: (A) full-res frame grid on checker+light, (B) game-scale row on flagstone
  const cellPad = 6, label = 64;
  const Aw = label + NF * (FW + cellPad), Ah = classes.length * (FH + cellPad) + 10;
  // game scale figure ~ 51px; show big tiles
  const tile = 96, Bw = label + NF * tile, Bh = classes.length * tile;
  const c = document.createElement("canvas"); c.width = Math.max(Aw, Bw); c.height = Ah + Bh + 30;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  // panel A: light gray + magenta backdrop split to reveal halos on both
  classes.forEach((cl, r) => {
    const y = 5 + r * (FH + cellPad);
    for (let f = 0; f < NF; f++) {
      const x = label + f * (FW + cellPad);
      g.fillStyle = (f % 2) ? "#cfc8b8" : "#7a86c0"; g.fillRect(x, y, FW, FH); // light stone / blue
      g.imageSmoothingEnabled = false;
      g.drawImage(imgs[cl], f * FW, 0, FW, FH, x, y, FW, FH);
    }
    g.fillStyle = "#000"; g.font = "13px sans-serif"; g.fillText(cl, 4, y + 18);
  });
  // panel B: game-scale on a warm flagstone color, feet aligned
  const By0 = Ah + 25;
  classes.forEach((cl, r) => {
    const y = By0 + r * tile;
    for (let f = 0; f < NF; f++) {
      const x = label + f * tile;
      g.fillStyle = (f + r) % 2 ? "#b9a98a" : "#a8987c"; g.fillRect(x, y, tile, tile);
      const dw = FW * S, dh = FH * S;
      const cx = x + tile / 2, feet = y + tile - 8;
      g.imageSmoothingEnabled = false;
      g.drawImage(imgs[cl], f * FW, 0, FW, FH, cx - AX * S, feet - FOOT * S, dw, dh);
    }
    g.fillStyle = "#fff"; g.font = "12px sans-serif"; g.fillText(cl, 4, y + 16);
  });
  return c.toDataURL("image/png").split(",")[1];
}, uris, classes, FW, FH, NF, AX, FOOT, S);

const dst = join(ROOT, "tools", "cas101-class-anim-preview.png");
writeFileSync(dst, Buffer.from(b64, "base64"));
console.log("wrote", dst);
await browser.close();
