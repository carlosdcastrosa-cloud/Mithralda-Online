// ---------------------------------------------------------------------------
// CAS-21 hero render-scale before/after.
// Renders the warrior class frame at the CURRENT scale (1.05) and the PROPOSED
// scale (1.85) over a 32px tile grid + 24px hitbox, using the REAL exported
// render/sprites.js drawClassFrame and the shipped class assets. Produces a
// single PNG for CEO/creative sign-off. Touches no game source.
//
// Run: node tools/scale-compare.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "scale-compare.png");
const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 460, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("requestfailed", (r) => errs.push(`requestfailed ${r.url()}`));
  await page.goto(`${srv.url}/tools/scale-compare.html`, { waitUntil: "load" });
  await page.waitForFunction("window.__rendered === true", { timeout: 10000 });
  const shot = await page.$eval("#c", (c) => c.toBoundingClientRect ? null : null) ?? await page.screenshot({ clip: { x: 0, y: 0, width: 760, height: 460 } });
  writeFileSync(SHOT, shot);
  if (errs.length) { console.error("✖ page errors:", errs); process.exit(1); }
  console.log("✔ comparison saved:", SHOT);
} catch (e) {
  console.error("✖ failed:", e.message); process.exitCode = 1;
} finally {
  await browser.close();
  await srv.close();
}
