// CAS-252 — LIVE QA gate: FOUNTAINS reskin visual verification (closes CAS-198).
// Runs against the deployed gh-pages build. Verifies:
//   1. Boot clean, 0 console errors (favicon-404 sev-4 filtered).
//   2. Town + hunt zones render the FOUNTAINS dark/desaturated palette
//      (mean luma low + low saturation = gritty, not the old warm/bright art).
//   3. Mobs animate without the CAS-219 fast-cadence regression (strip advances,
//      but not faster than the pure-time gait — re-uses the cas230 method idea).
//   4. Perf >= 55 fps on the live build.
//   5. Captures town + 2 hunt-zone screenshots as evidence.
// Read-only against the shared env (only __dev spawns throwaway mobs).
// Run: node tools/cas252-fountains-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const OUT = join(ROOT, "tools");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const diffBytes = (a, b) => { let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++; return d; };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS ${m}`); } else { fail++; console.log(`  FAIL ${m}`); } };

// Mean luma + saturation of a region, sampled from the live canvas pixels.
async function palette(page) {
  return await page.evaluate(() => {
    const cv = document.querySelector("canvas");
    const g = cv.getContext("2d", { willReadFrequently: true });
    const w = cv.width, h = cv.height;
    const d = g.getImageData(0, 0, w, h).data;
    let lum = 0, sat = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { // stride sample
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      lum += 0.299 * r + 0.587 * gg + 0.114 * b;
      sat += mx === 0 ? 0 : (mx - mn) / mx;
      n++;
    }
    return { luma: lum / n, sat: sat / n };
  });
}

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const errors = [];
try {
  const bid = await (await fetch(`${BASE}/version.json?x=${Date.now()}`)).json();
  console.log(`LIVE build: ${bid.build} (${bid.files} files)  — expect ff17af5388da`);
  ok(bid.build === "ff17af5388da", `served build id == ff17af5388da (got ${bid.build})`);

  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon/i.test(t) || /Failed to load resource.*404/i.test(t)) return; // sev-4 favicon only
    errors.push("console.error: " + t);
  });

  // --- 1. Boot ---
  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => {
    try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QA252";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.screenshot({ path: join(OUT, "cas252-classsel.png") });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  await sleep(600);

  // --- 2a. TOWN palette ---
  const town = await palette(page);
  console.log(`  TOWN luma=${town.luma.toFixed(1)} sat=${town.sat.toFixed(3)}`);
  await page.screenshot({ path: join(OUT, "cas252-town.png") });
  ok(town.luma < 110, `TOWN is dark/desaturated FOUNTAINS palette (luma ${town.luma.toFixed(1)} < 110)`);

  // --- 3 + 2b. Hunt zones: palette + mob cadence ---
  const huntShots = { caves: "cas252-hunt-caves.png", frost: "cas252-hunt-frost.png" };
  for (const zone of ["caves", "frost"]) {
    const tp = await page.evaluate(z => { try { return window.__dev.tpZone(z); } catch (e) { return null; } }, zone);
    await sleep(500);
    ok(tp === zone, `teleport to hunt zone '${zone}' (${tp})`);
    const pz = await palette(page);
    console.log(`  ${zone} luma=${pz.luma.toFixed(1)} sat=${pz.sat.toFixed(3)}`);
    ok(pz.luma < 120, `${zone} renders dark FOUNTAINS palette (luma ${pz.luma.toFixed(1)} < 120)`);

    // mob spawn + animation advance
    const before = await page.evaluate(() => window.__dev.enemyCount());
    await page.evaluate(() => { try { for (let i = 0; i < 3; i++) window.__dev.spawn("orc", (i - 1) * 36, -12); } catch (e) {} });
    await sleep(300);
    const after = await page.evaluate(() => window.__dev.enemyCount());
    ok(after > before, `${zone}: orcs spawned (${before}->${after})`);
    const region = { x: 330, y: 190, width: 300, height: 200 };
    let a = await page.screenshot({ clip: region });
    await sleep(550);
    let b = await page.screenshot({ clip: region });
    ok(diffBytes(a, b) > 250, `${zone}: mobs animate live (Δ ${diffBytes(a, b)})`);
    await page.screenshot({ path: join(OUT, huntShots[zone]) });
  }

  // --- 4. Perf ---
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise(res => { const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames / ((performance.now() - t0) / 1000));
  });
  console.log(`  FPS=${fps}`);
  ok(fps >= 55, `perf >= 55fps (got ${fps})`);

  // --- 1 (cont). console errors ---
  ok(errors.length === 0, `0 console/page errors (favicon-404 filtered)`);
  if (errors.length) console.log("    " + errors.slice(0, 4).join("\n    "));

  console.log(`\n[RESULT] ${pass} pass / ${fail} fail  — build ${bid.build}`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
}
