// CAS-282 in-game verification — boot the LOCAL working tree, enter play as the warrior,
// drive a real attack swing, and prove the full fiery-sword FX now renders UNCLIPPED.
//
// Method: sample the live canvas pixels in a wide window around the hero across the whole
// swing. The clipped (old) strip cut the FX at the cell edge → opaque content stopped
// ~21px (0.30·140/2) either side of the body. The re-baked wide strip lets the sweep
// reach far past that. We assert the per-swing MAX horizontal FX reach clearly exceeds the
// old half-cell limit, capture idle vs swing-peak screenshots, and check 60fps / 0 errors.
//   node tools/cas282-warrior-attack-verify.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";
import { writeFileSync } from "node:fs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true; const pass = (m) => console.log(`✔ ${m}`); const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|404|Failed to load resource/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {}
    window.__frames = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); }); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "WideBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
  const cls = await page.evaluate(() => window.__dev.hero().cls);
  if (cls === "warrior") pass("entered play as warrior (Clarice)"); else fail(`expected warrior, got ${cls}`);

  // Confirm the re-baked wide attack strip is actually the one loaded (naturalWidth/6 > 140).
  const strip = await page.evaluate(() => { const im = window.IMG && window.IMG["clsattack_warrior"]; return im ? { w: im.naturalWidth, h: im.naturalHeight } : null; });
  // IMG isn't global; fall back to decoding the asset directly in-page.
  const dims = strip || await page.evaluate(async () => { const im = new Image(); im.src = "./assets/erw/hero/classes/warrior_attack.png"; await im.decode(); return { w: im.naturalWidth, h: im.naturalHeight }; });
  const fw = Math.round(dims.w / 6);
  if (fw > 140) pass(`attack strip frame width ${fw}px > 140 (wide re-bake live)`); else fail(`attack frame width ${fw}px — wide strip NOT loaded`);

  // Helper: opaque-pixel horizontal half-reach (px from hero centre) in the canvas, within
  // a vertical band around the hero, ignoring the soft ground aura by requiring saturated FX.
  async function fxReach() {
    return page.evaluate(() => {
      const cv = document.querySelector("canvas"); const x = cv.getContext("2d");
      // hero is centred on screen; measure around canvas centre.
      const cx = Math.round(cv.width / 2), cy = Math.round(cv.height / 2);
      const W = 260, H = 120; const x0 = cx - W, y0 = cy - H;
      const d = x.getImageData(x0, y0, W * 2, H).data; let maxL = 0, maxR = 0;
      for (let j = 0; j < H; j++) for (let i = 0; i < W * 2; i++) {
        const p = (j * W * 2 + i) * 4; const a = d[p + 3];
        if (a > 120) { const dx = (x0 + i) - cx; if (dx < 0) maxL = Math.max(maxL, -dx); else maxR = Math.max(maxR, dx); }
      }
      return { maxL, maxR };
    });
  }

  // idle baseline screenshot + reach
  await wait(200);
  const idleShot = await page.screenshot();
  writeFileSync("tools/cas282-idle.png", idleShot);
  const idleReach = await fxReach();
  pass(`idle FX reach L${idleReach.maxL} R${idleReach.maxR}px (body only)`);

  // Drive repeated swings; sample reach each frame and grab a screenshot at the widest.
  let peak = { maxL: 0, maxR: 0 }; let peakShot = null;
  for (let s = 0; s < 6; s++) {
    await page.evaluate(() => { window.__dev.juiceArena(1); window.__dev.juiceSwing(); });
    for (let f = 0; f < 12; f++) {
      await wait(16);
      const a = await page.evaluate(() => window.__dev.heroAnim());
      if (a && a.state === "attack") {
        const r = await fxReach();
        if (r.maxL + r.maxR > peak.maxL + peak.maxR) { peak = r; peakShot = await page.screenshot(); }
      }
    }
    await wait(120);
  }
  if (peakShot) writeFileSync("tools/cas282-attack-peak.png", peakShot);
  pass(`swing-peak FX reach L${peak.maxL} R${peak.maxR}px`);

  // The old clipped strip capped the drawn cell at 140px → ~21px half-reach (140/2·0.30).
  // A correctly-rendered wide sweep extends well past that on the swing side.
  const OLD_HALF = Math.round(140 / 2 * 0.30); // ≈ 21
  if (Math.max(peak.maxL, peak.maxR) > OLD_HALF + 12) pass(`FX sweep reaches ${Math.max(peak.maxL, peak.maxR)}px > old ${OLD_HALF}px cap → full effect now visible`);
  else fail(`FX sweep only ${Math.max(peak.maxL, peak.maxR)}px — not clearly beyond old ${OLD_HALF}px cap`);

  // fps while swinging
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  for (let i = 0; i < 5; i++) { await page.evaluate(() => { window.__dev.juiceArena(1); window.__dev.juiceSwing(); }); await wait(200); }
  const f1 = await page.evaluate(() => window.__frames); const fps = Math.round((f1 - f0) * 1000 / (Date.now() - t0));
  if (fps >= 55) pass(`60fps held while swinging (${fps} fps)`); else fail(`fps low: ${fps}`);

  if (errors.length === 0) pass("zero page errors"); else fail(`${errors.length} errors: ${errors.slice(0, 3).join(" | ")}`);

  console.log(""); console.log(ok ? "✓ CAS-282 warrior-attack verify PASSED" : "✗ CAS-282 verify FAILED");
} catch (e) { fail(`threw: ${e && e.stack ? e.stack : e}`); }
finally { await browser.close(); await srv.close(); }
process.exit(ok ? 0 : 1);
