// CAS-2216: live in-game proof that the Fire-Nova strip now tints per element.
// Boots local HEAD (?dev), casts mage FROST (ice-blue) and druid VINES (green),
// screenshots each burst, and scans the live canvas for tinted pixels to prove the
// nova detonation is no longer orange fire. Fire-stays-orange + judgment/smite-warm
// are covered by tools/cas2216-tint-verify.mjs (blend-recipe pixel proof).
// Run: node tools/cas2216-nova-tint-shots.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2216");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const report = { casts: {}, errors: [] };
let ok = true;

// Count bright, saturated pixels in a centered crop (where the nova detonates on the hero),
// classified by hue. The center crop excludes most of the green grass field so the burst reads.
async function scanHue(page) {
  return page.evaluate(() => {
    const cv = document.querySelector("canvas"); const c = cv.getContext("2d");
    const { width: W, height: H } = cv;
    const bw = Math.min(360, W), bh = Math.min(360, H);
    const x0 = ((W - bw) / 2) | 0, y0 = ((H - bh) / 2) | 0;
    const d = c.getImageData(x0, y0, bw, bh).data;
    let blue = 0, green = 0, orange = 0;
    for (let i = 0; i < d.length; i += 8) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 120) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 150 || mx - mn < 60) continue; // burst pixels are bright + saturated; grass is dimmer/duller
      if (b === mx && b - r > 40) blue++;
      else if (g === mx && g - b > 40 && g - r > 20) green++;
      else if (r === mx && r - b > 80 && g > 70) orange++;
    }
    return { blue, green, orange };
  });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // menu -> classsel -> play (mage)
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "TintBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  const key = (c) => page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true })), c);
  await key("Digit3"); // mage
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s) await key("Enter");
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);

  // baseline (no fx)
  await page.evaluate(() => { try { window.__dev.clearFx(); } catch (e) {} });
  await sleep(120);
  const base = await scanHue(page);

  // MAGE FROST (slot 2, novacast, col #7fd6ff) -> expect BLUE burst
  await page.evaluate(() => { window.__dev.clearFx(); });
  let frostErr = null;
  const frostSamples = [];
  for (let i = 0; i < 4; i++) {
    const r = await page.evaluate(() => { try { return window.__dev.cast(2); } catch (e) { return { err: e.message }; } });
    if (r && r.err) frostErr = r.err;
    await sleep(60);
    frostSamples.push(await scanHue(page));
    if (i === 0) await page.screenshot({ path: join(OUT, "nova-mage-frost.png") });
    await sleep(220);
  }
  const frost = frostSamples.reduce((a, b) => (b.blue > a.blue ? b : a), { blue: 0 });
  report.casts.mageFrost = { expect: "blue", err: frostErr, peak: frost, base };

  // DRUID VINES (slot 1, novacast, col #8fd47a) -> expect GREEN burst
  await page.evaluate(() => { window.__dev.clearFx(); window.__dev.setClass && window.__dev.setClass("druid"); });
  await sleep(150);
  let vinesErr = null;
  const vineSamples = [];
  for (let i = 0; i < 4; i++) {
    const r = await page.evaluate(() => { try { return window.__dev.cast(1); } catch (e) { return { err: e.message }; } });
    if (r && r.err) vinesErr = r.err;
    await sleep(60);
    vineSamples.push(await scanHue(page));
    if (i === 0) await page.screenshot({ path: join(OUT, "nova-druid-vines.png") });
    await sleep(220);
  }
  const vines = vineSamples.reduce((a, b) => (b.green > a.green ? b : a), { green: 0 });
  report.casts.druidVines = { expect: "green", err: vinesErr, peak: vines, base };

  report.errors = errs.slice(0, 20);
  if (errs.length) ok = false;
} catch (e) {
  report.fatal = e.message; ok = false;
} finally {
  await browser.close(); await srv.stop?.();
}

// Verdict: burst adds its element hue over baseline, and that hue dominates the "orange" count.
const f = report.casts.mageFrost, v = report.casts.druidVines;
const frostOK = f && f.peak.blue > (f.base.blue + 15) && f.peak.blue > f.peak.orange;
const vinesOK = v && v.peak.green > (v.base.green + 15) && v.peak.green > v.peak.orange;
console.log(JSON.stringify(report, null, 2));
console.log(`\nfrost→blue: ${frostOK ? "PASS" : "FAIL"}  vines→green: ${vinesOK ? "PASS" : "FAIL"}  errors:${report.errors.length}`);
const pass = frostOK && vinesOK && ok;
console.log(pass ? "ALL PASS" : "FAIL");
process.exit(pass ? 0 : 1);
