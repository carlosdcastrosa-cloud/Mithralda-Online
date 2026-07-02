// CAS-415 — montage of the UI icon set for board review.
// Renders every assets/ui/icons/*.png on the game's dark panel color #12141b
// at 1x and 2x with filename labels, via headless-canvas screenshot.
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "assets/ui/icons");
const OUT = process.argv[2] || path.join(ROOT, "assets/ui/icons/cas415-montage.png");

const files = fs.readdirSync(DIR).filter(f => f.endsWith(".png") && !f.includes("montage")).sort();
if (!files.length) { console.error("no icons in " + DIR); process.exit(1); }

const icons = files.map(f => ({
  name: f.replace(/\.png$/, ""),
  data: "data:image/png;base64," + fs.readFileSync(path.join(DIR, f)).toString("base64"),
}));

const COLS = 6, CELL = 116, PAD = 24, LABEL_H = 14;
const rows = Math.ceil(icons.length / COLS);
const W = COLS * CELL + PAD * 2;
const H = rows * (CELL + LABEL_H) + PAD * 2 + 40;

const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas>
<style>body{margin:0}</style>`);

await page.evaluate(async (icons, { COLS, CELL, PAD, LABEL_H, W }) => {
  const ctx = document.getElementById("c").getContext("2d");
  ctx.fillStyle = "#12141b";
  ctx.fillRect(0, 0, W, 99999);
  ctx.imageSmoothingEnabled = false;
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#8a93a6";
  ctx.fillText("CAS-415 UI icons — 32px native, shown 1x + 2x on #12141b", W / 2, 16);
  for (let i = 0; i < icons.length; i++) {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = icons[i].data; });
    const cx = PAD + (i % COLS) * CELL, cy = 28 + PAD + Math.floor(i / COLS) * (CELL + LABEL_H);
    ctx.strokeStyle = "#232735";
    ctx.strokeRect(cx + 0.5, cy + 0.5, CELL - 8, CELL - 8);
    ctx.drawImage(img, cx + 6, cy + 34, 32, 32);   // 1x (native game scale)
    ctx.drawImage(img, cx + 42, cy + 18, 64, 64);  // 2x (readability check)
    ctx.fillStyle = "#8a93a6";
    ctx.fillText(icons[i].name.replace(/^(spell|slot|hud)_/, ""), cx + (CELL - 8) / 2, cy + CELL + 6);
    ctx.fillStyle = "#8a93a6";
  }
}, icons, { COLS, CELL, PAD, LABEL_H, W });

await new Promise(r => setTimeout(r, 300));
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
fs.writeFileSync(OUT, buf);
await browser.close();
console.log("montage: " + OUT + " (" + icons.length + " icons)");
