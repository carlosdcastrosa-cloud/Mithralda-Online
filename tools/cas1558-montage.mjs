// CAS-1558 — montage of the altar node icons on the game panel color, 1x + 4x.
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "assets/ui/icons");
const OUT = process.argv[2] || path.join(ROOT, "tools/cas1558-altar-icons.png");
const order = ["altar_hpmax", "altar_dmg", "altar_movespd", "altar_reroll", "altar_startgold", "altar_essence"];
const labels = { altar_hpmax: "+HP MAX", altar_dmg: "+DAÑO", altar_movespd: "+VELOCIDAD", altar_reroll: "+REROLL", altar_startgold: "+ORO", altar_essence: "ESENCIA" };
const icons = order.map(n => ({ name: labels[n] + "\\n" + n, data: "data:image/png;base64," + fs.readFileSync(path.join(DIR, n + ".png")).toString("base64") }));

const COLS = 6, CELL = 160, PAD = 30, LABEL_H = 26;
const W = COLS * CELL + PAD * 2, H = CELL + LABEL_H + PAD * 2 + 60;
const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas><style>body{margin:0}</style>`);
await page.evaluate(async (icons, { COLS, CELL, PAD, LABEL_H, W, H }) => {
  const ctx = document.getElementById("c").getContext("2d");
  ctx.fillStyle = "#12141b"; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.font = "14px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#8a93a6";
  ctx.fillText("CAS-1558 altar node icons — 32px native, shown 1x + 4x on panel #12141b", W / 2, 22);
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  for (let k = 0; k < icons.length; k++) {
    const img = await load(icons[k].data);
    const cx = PAD + k * CELL + CELL / 2, top = 44;
    ctx.drawImage(img, cx - 16, top + 8, 32, 32);       // 1x
    ctx.drawImage(img, cx - 64, top + 46, 128, 128);    // 4x
    ctx.fillStyle = "#cfd6e4"; ctx.font = "13px monospace";
    const parts = icons[k].name.split("\\n");
    ctx.fillText(parts[0], cx, top + CELL + 6);
    ctx.fillStyle = "#6b7488"; ctx.font = "11px monospace";
    ctx.fillText(parts[1] + ".png", cx, top + CELL + 22);
  }
}, icons, { COLS, CELL, PAD, LABEL_H, W, H });
const buf = await page.screenshot({ type: "png" });
fs.writeFileSync(OUT, buf);
await browser.close();
console.log("wrote", OUT);
