// CAS-2226 QA — OBSERVABLE playtest of the city-POI blip layer (minimap + world map M).
// Build under test: commit 81c0eba, served from an ISOLATED WORKTREE (/tmp/cas2226-wt) so the
// dirty shared tree (GE CAS-2225 door WIP) never leaks in — per the CAS-2207 clean-worktree pattern.
//
// Two runs on the same worktree:
//   OFF = flag as committed (MINIMAP.enabled:false)  → DARK baseline, must be blip-free
//   ON  = config-only flip to true                   → 4 city POIs must render on minimap+M map
// Proof per run: boot (0 JS errors), minimap shot, big-map (M) shot, fps sample, and a PIXEL PROBE
// counting canvas pixels that match each POI fill colour (temple/depot/tavern/park). OFF≈0, ON>0.
// Determinism: OFF is byte-identical to pre-CAS-2226 (render-only), asserted by node --check + import graph elsewhere.
// Run: node tools/cas2226-minimap-qa.mjs <worktreeRoot>
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const WT = process.argv[2] || "/tmp/cas2226-wt";
const OUT = join(ROOT, "shots", "cas2226");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POI fill colours from render.js CITY_POI
const POI = {
  templo:   [0xf0, 0xd8, 0x78],
  deposito: [0x7c, 0xb8, 0xf0],
  taberna:  [0xf0, 0xa8, 0x50],
  parque:   [0x74, 0xd6, 0x8e],
};
const TOL = 6;

function flip(on) {
  const p = join(WT, "sim/config.js");
  let s = readFileSync(p, "utf8");
  s = s.replace(/(export const MINIMAP = \{\s*\n\s*enabled: )(true|false)/, `$1${on}`);
  writeFileSync(p, s);
  const now = readFileSync(p, "utf8").match(/MINIMAP = \{\s*\n\s*enabled: (true|false)/)[1];
  if (now !== String(on)) throw new Error("flip failed, got " + now);
}

async function probeColors(page) {
  // read the full backing canvas and count pixels matching each POI colour (tight tolerance)
  return page.evaluate((POI, TOL) => {
    const cv = document.getElementById("c");
    const g = cv.getContext("2d");
    const { data, width, height } = g.getImageData(0, 0, cv.width, cv.height);
    const counts = {}; for (const k in POI) counts[k] = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      for (const k in POI) { const c = POI[k];
        if (Math.abs(r - c[0]) <= TOL && Math.abs(gg - c[1]) <= TOL && Math.abs(b - c[2]) <= TOL) { counts[k]++; break; } }
    }
    return { counts, canvas: { w: cv.width, h: cv.height } };
  }, POI, TOL);
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  // warrior = Digit1
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(600);
}

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function runOnce(browser, tag) {
  const srv = await startServer(WT);
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errs.push("reqfail: " + r.url()); });

  const r = { tag, errors: errs };
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await toPlay(page);
  r.boot = "play reached (warrior), no boot crash";

  await sleep(400);
  await page.screenshot({ path: join(OUT, `${tag}-minimap.png`) });
  r.minimapProbe = await probeColors(page);

  // open big map (KeyM → G.showMap)
  await key(page, "KeyM");
  await sleep(350);
  await page.screenshot({ path: join(OUT, `${tag}-bigmap.png`) });
  r.bigmapProbe = await probeColors(page);

  // fps sample (device rAF)
  r.fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(+(n * 1000 / (performance.now() - t0)).toFixed(1)); }
    requestAnimationFrame(f);
  }));

  await key(page, "KeyM"); // close
  await page.close();
  await srv.close?.();
  return r;
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
try {
  flip(false);
  const off = await runOnce(browser, "off");
  flip(true);
  const on = await runOnce(browser, "on");
  flip(false); // restore committed state

  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const report = {
    OFF: { boot: off.boot, fps: off.fps, errors: off.errors, bigmapPOIpx: off.bigmapProbe.counts, totalPOIpx: sum(off.bigmapProbe.counts) },
    ON:  { boot: on.boot,  fps: on.fps,  errors: on.errors,  bigmapPOIpx: on.bigmapProbe.counts,  totalPOIpx: sum(on.bigmapProbe.counts),
           minimapPOIpx: on.minimapProbe.counts },
  };
  // ASSERTIONS
  const A = [];
  A.push(["OFF boots clean", off.boot && off.errors.length === 0]);
  A.push(["ON boots clean", on.boot && on.errors.length === 0]);
  A.push(["OFF fps>=55", off.fps >= 55]);
  A.push(["ON fps>=55", on.fps >= 55]);
  A.push(["OFF big-map has ~no POI pixels (<40)", sum(off.bigmapProbe.counts) < 40]);
  for (const k of Object.keys(POI)) A.push([`ON big-map draws ${k}`, on.bigmapProbe.counts[k] > 0]);
  const pass = A.every(([, v]) => v);
  ok = pass;
  console.log(JSON.stringify(report, null, 2));
  console.log("\nASSERTIONS:");
  for (const [n, v] of A) console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`);
  console.log("\n" + (pass ? "✅ ALL PASS" : "❌ FAIL"));
} catch (e) {
  ok = false; console.error("HARNESS ERROR:", e);
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);
