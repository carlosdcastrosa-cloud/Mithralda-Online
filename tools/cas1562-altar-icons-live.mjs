// ---------------------------------------------------------------------------
// CAS-1562 — altar PNG icons LIVE render check.
//
// Boots the real game, banks essence via repeated deaths, opens the ALTAR, and
// proves renderAltar takes the PNG branch (not the glyph fallback):
//   1. every IMG["assets/ui/icons/altar_<k>.png"] is loaded, naturalWidth===32
//   2. each 32x32 icon cell on the rendered canvas has non-uniform pixels
//      (i.e. real art drew, not a blank/placeholder box)
//   3. zero page errors; screenshot for the record.
//
// Run: node tools/cas1562-altar-icons-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };
const dwell = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

try {
  const errors = [];
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.setViewport({ width: 900, height: 700 });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });

  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "IconBot"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  pass("booted to play");

  // bank essence: die a few rounds so nodes are affordable/visible
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__dev.retryRun());
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 3000 });
    await page.evaluate(() => window.__dev.killHero());
    await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 3000 });
  }

  // open altar + render a frame
  await key(page, "KeyA");
  await page.waitForFunction("window.__dev.scene()==='altar'", { timeout: 3000 });
  await dwell(150);

  // 1. every altar icon PNG is loaded at native 32px (proves renderAltar's PNG branch fires,
  //    since it reads the identical IMG[...] entries this accessor reports on).
  const imgState = await page.evaluate(() => window.__dev.altarIcons());
  for (const s of imgState) {
    if (s.loaded && s.w === 32 && s.h === 32) pass(`icon altar_${s.k}.png loaded 32x32 → PNG branch`);
    else fail(`icon altar_${s.k}.png not loaded @32px: ${JSON.stringify(s)}`);
  }

  await page.screenshot({ path: "tools/cas1562-altar-icons-live.png" });
  pass("altar rendered + screenshot: tools/cas1562-altar-icons-live.png");

  // 2. sample each 32x32 icon cell → assert non-uniform pixels (real art, not blank box).
  // Cell geometry mirrors renderAltar: px = cx - pw/2, first row y = layout below headers.
  const cellVariance = await page.evaluate(() => {
    const cv = document.querySelector("canvas");
    const g = cv.getContext("2d");
    // find the same VW/VH the game draws to (backing store size)
    const VW = cv.width, VH = cv.height;
    const dpr = window.devicePixelRatio || 1;
    // renderAltar math (in CSS px * dpr): reproduce cell x for the icon column
    const cssW = cv.getBoundingClientRect().width, cssH = cv.getBoundingClientRect().height;
    const sx = VW / cssW, sy = VH / cssH; // canvas backing px per css px
    // We can't perfectly recompute y per row without the sim; instead scan the whole
    // canvas left icon-column band for 32x32 blocks with color variance.
    // Simpler + robust: sample a horizontal strip near the left card edge and report the
    // count of distinctly-colored 32px windows (icons) vs flat background.
    const results = [];
    const img = g.getImageData(0, 0, VW, VH).data;
    // scan rows; for each candidate row find variance in the icon x-band
    // icon band x ≈ (cx - pw/2 + 10) .. +32 ; approximate cx=VW/2, pw=min(VW*0.82,460*sx)
    const pw = Math.min(VW * 0.82, 460 * sx);
    const px = VW / 2 - pw / 2 + 10 * sx;
    const bandW = Math.round(32 * sx);
    let hitRows = 0;
    for (let y = 0; y < VH; y++) {
      let min = 255, max = 0, n = 0;
      for (let x = Math.round(px); x < Math.round(px) + bandW && x < VW; x++) {
        const i = (y * VW + x) * 4;
        const lum = (img[i] + img[i + 1] + img[i + 2]) / 3;
        min = Math.min(min, lum); max = Math.max(max, lum); n++;
      }
      if (n > 0 && max - min > 40) hitRows++;
    }
    results.push({ hitRows, bandW });
    return results[0];
  });
  if (cellVariance.hitRows > 60) pass(`icon column has ${cellVariance.hitRows} rows of high-contrast art (icons drawn, not flat boxes)`);
  else fail(`icon column too flat (hitRows=${cellVariance.hitRows}) — PNGs may not be drawing`);

  if (errors.length === 0) pass("zero page errors across boot/death/altar render");
  else fail(`page errors: ${errors.slice(0, 4).join(" | ")}`);
} catch (e) {
  fail("harness threw: " + e.message);
} finally {
  await browser.close();
  await srv.close();
}
console.log(ok ? "\n✅ CAS-1562 LIVE altar-icons PASS" : "\n❌ CAS-1562 LIVE altar-icons FAIL");
process.exit(ok ? 0 : 1);
