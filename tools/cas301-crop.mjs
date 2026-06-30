// CAS-301 — crop helper. Extract frame N (CLASS cell 140x166) from a class strip and
// emit it as a standalone PNG (base64 to stdout, optional file). Used to produce the
// SAME-SPRITE reference image fed to PixelLab create_8_direction_object so the generated
// facings keep the exact live character (no redesign — board hard constraint).
//   node tools/cas301-crop.mjs <strip.png> <frameIndex> [outFile] [cellW=140] [cellH=166]
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const [strip, frameStr, outFile, cwStr, chStr] = process.argv.slice(2);
const FI = parseInt(frameStr || "0", 10);
const CW = parseInt(cwStr || "140", 10), CH = parseInt(chStr || "166", 10);
const b64in = readFileSync(strip).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: "new" });
const page = await browser.newPage();
const out = await page.evaluate(async ({ b64in, FI, CW, CH }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64in; });
  const c = document.createElement("canvas"); c.width = CW; c.height = CH;
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, CW, CH);
  x.drawImage(img, FI * CW, 0, CW, CH, 0, 0, CW, CH);
  return c.toDataURL("image/png").split(",")[1];
}, { b64in, FI, CW, CH });
await browser.close();

if (outFile) writeFileSync(outFile, Buffer.from(out, "base64"));
process.stdout.write(out);
