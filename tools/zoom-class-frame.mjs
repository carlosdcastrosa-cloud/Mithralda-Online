// zoom-class-frame.mjs <class> [frame] — 3x crop of one frame on white|magenta|dark
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
const cls = process.argv[2] || "archer", fi = parseInt(process.argv[3] || "0", 10);
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const geom = JSON.parse(readFileSync(join(OUT, "classes.json"), "utf8"));
const { frameW: FW, frameH: FH } = geom;
const uri = "data:image/png;base64," + readFileSync(join(OUT, `${cls}.png`)).toString("base64");
const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const b64 = await page.evaluate(async (uri, FW, FH, fi) => {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; });
  const Z = 3, bgs = ["#ffffff", "#d33bb0", "#202830"];
  const c = document.createElement("canvas"); c.width = bgs.length * FW * Z + 20; c.height = FH * Z + 10;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  bgs.forEach((bg, k) => { const x = k * (FW * Z + 7);
    g.fillStyle = bg; g.fillRect(x, 5, FW * Z, FH * Z);
    g.drawImage(img, fi * FW, 0, FW, FH, x, 5, FW * Z, FH * Z); });
  return c.toDataURL("image/png").split(",")[1];
}, uri, FW, FH, fi);
const dst = join(ROOT, "tools", `cas101-zoom-${cls}-${fi}.png`);
writeFileSync(dst, Buffer.from(b64, "base64")); console.log("wrote", dst);
await browser.close();
