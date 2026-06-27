// ===========================================================================
// tools/pixelize-tile.mjs — downscale large source image(s) to NxN RGBA game
// tiles using the browser's high-quality canvas resampler (puppeteer). Used to
// bring Higgsfield-generated city tiles (CAS-60) into the 32px grid pipeline.
//   node tools/pixelize-tile.mjs <size> <src1.png> <dst1.png> [<src2> <dst2> ...]
// Robust to interlaced PNG / webp (canvas decodes anything the browser does).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const [,, sizeArg, ...rest] = process.argv;
const size = parseInt(sizeArg || "32", 10);
if (rest.length < 2 || rest.length % 2 !== 0) {
  console.error("usage: node tools/pixelize-tile.mjs <size> <src.png> <dst.png> [...]"); process.exit(1);
}
const pairs = []; for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

for (const [src, dst] of pairs) {
  const dataUri = "data:image/png;base64," + readFileSync(src).toString("base64");
  const b64 = await page.evaluate(async (uri, n) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
    const c = document.createElement("canvas"); c.width = n; c.height = n;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, n, n);
    return c.toDataURL("image/png").split(",")[1];
  }, dataUri, size);
  writeFileSync(dst, Buffer.from(b64, "base64"));
  console.log("wrote " + dst + " (" + size + "x" + size + ")");
}
await browser.close();
