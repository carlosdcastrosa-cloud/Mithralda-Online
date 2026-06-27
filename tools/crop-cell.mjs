// ===========================================================================
// tools/crop-cell.mjs — crop one or more native-resolution NxN cells out of a
// tileset sheet (no rescale), for bringing EPIC RPG World ground tiles (CAS-77)
// onto the 32px game grid. The Ancient Ruins sheets carry autotile borders and
// transition cells around a solid-fill interior block; we hand-pick the interior
// cells that read as clean, seamless ground.
//   node tools/crop-cell.mjs <size> <src.png> <dst.png> <x> <y> [<dst2> <x2> <y2> ...]
// Uses the browser canvas decoder (puppeteer) — robust to any PNG flavour.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const [,, sizeArg, src, ...rest] = process.argv;
const size = parseInt(sizeArg || "32", 10);
if (!src || rest.length < 3 || rest.length % 3 !== 0) {
  console.error("usage: node tools/crop-cell.mjs <size> <src.png> <dst.png> <x> <y> [...]");
  process.exit(1);
}
const jobs = []; for (let i = 0; i < rest.length; i += 3) jobs.push([rest[i], +rest[i + 1], +rest[i + 2]]);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const uri = "data:image/png;base64," + readFileSync(src).toString("base64");

for (const [dst, x, y] of jobs) {
  const b64 = await page.evaluate(async (uri, x, y, n) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = uri; });
    const c = document.createElement("canvas"); c.width = n; c.height = n;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    g.drawImage(img, x, y, n, n, 0, 0, n, n);
    return c.toDataURL("image/png").split(",")[1];
  }, uri, x, y, size);
  writeFileSync(dst, Buffer.from(b64, "base64"));
  console.log(`✔ ${dst}  ${size}×${size} @ (${x},${y})`);
}
await browser.close();
process.exit(0);
