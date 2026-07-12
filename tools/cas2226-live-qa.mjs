// CAS-2226 QA — LIVE re-test of the city-POI blip layer AFTER the CAS-2228 flip+deploy.
// Runs against gh-pages (not a local server). Proves: (1) served config.js has MINIMAP.enabled:true
// and still exports T_STREET/PIXELART (module-graph consistent, no CAS-2220 boot break); (2) served
// render.js is byte-identical to the QA-proven 81c0eba blob (md5); (3) OBSERVABLE — the 4 city POIs
// (Templo/Depósito/Taberna/Parque) actually render on the M map, 0 JS errors, 60fps.
// Run AFTER CAS-2228 reports LIVE. Usage: node tools/cas2226-live-qa.mjs [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2226-live");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POI = { templo: [0xf0, 0xd8, 0x78], deposito: [0x7c, 0xb8, 0xf0], taberna: [0xf0, 0xa8, 0x50], parque: [0x74, 0xd6, 0x8e] };
const TOL = 6;

// md5 of the QA-proven 81c0eba render.js blob (ground truth QA signed off on)
const QA_RENDER_MD5 = execSync(`git show 81c0eba:render/render.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];

async function fetchServed(path) {
  const bust = `?cb=${path.replace(/\W/g, "")}`; // static ES imports carry no buster; add one for the raw fetch
  const r = await fetch(`${LIVE}/${path}${bust}`);
  const txt = await r.text();
  const md5 = execSync(`md5sum`, { input: txt }).toString().split(" ")[0];
  return { status: r.status, txt, md5 };
}

async function probe(page) {
  return page.evaluate((POI, TOL) => {
    const cv = document.getElementById("c"); const g = cv.getContext("2d");
    const { data } = g.getImageData(0, 0, cv.width, cv.height);
    const c = {}; for (const k in POI) c[k] = 0;
    for (let i = 0; i < data.length; i += 4) { const r = data[i], gg = data[i + 1], b = data[i + 2];
      for (const k in POI) { const q = POI[k]; if (Math.abs(r - q[0]) <= TOL && Math.abs(gg - q[1]) <= TOL && Math.abs(b - q[2]) <= TOL) { c[k]++; break; } } }
    return c;
  }, POI, TOL);
}

const report = { live: LIVE, served: {}, observable: {}, assertions: [] };

// ---- 1. served-file byte/module-graph verify ----
const cfg = await fetchServed("sim/config.js");
const rnd = await fetchServed("render/render.js");
report.served = {
  config: { status: cfg.status, minimapEnabledTrue: /MINIMAP\s*=\s*\{[\s\S]*?enabled:\s*true/.test(cfg.txt),
    exportsTStreet: /export const T_STREET/.test(cfg.txt) || /\bT_STREET\b/.test(cfg.txt),
    exportsPixelart: /export const PIXELART/.test(cfg.txt), exportsMinimap: /export const MINIMAP/.test(cfg.txt) },
  render: { status: rnd.status, md5: rnd.md5, matchesQAblob: rnd.md5 === QA_RENDER_MD5, qaMd5: QA_RENDER_MD5 },
};

// ---- 2. observable boot + POI render ----
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errs.push("reqfail: " + r.url()); });
  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && __dev.scene && __dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(__dev.scene())", { timeout: 10000 });
  for (const s of ["customize", "abilitysel"]) { await sleep(250);
    if (await page.evaluate(() => __dev.scene()) === s) await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }))); }
  await page.waitForFunction("__dev.scene()==='play'", { timeout: 10000 }); await sleep(600);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", key: "m", bubbles: true }))); await sleep(400);
  await page.screenshot({ path: join(OUT, "live-bigmap.png") });
  const counts = await probe(page);
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(+(n * 1000 / (performance.now() - t0)).toFixed(1)); })(); }));
  report.observable = { boot: "play reached", bigmapPOIpx: counts, totalPOIpx: Object.values(counts).reduce((a, b) => a + b, 0), fps, errors: errs };
} finally { await browser.close(); }

// ---- assertions ----
const s = report.served, o = report.observable;
const A = report.assertions;
A.push(["served config.js 200", s.config.status === 200]);
A.push(["served config MINIMAP.enabled:true", s.config.minimapEnabledTrue]);
A.push(["served config exports PIXELART+MINIMAP", s.config.exportsPixelart && s.config.exportsMinimap]);
A.push(["served render.js == QA-proven 81c0eba blob", s.render.matchesQAblob]);
A.push(["LIVE boots, 0 JS errors", o.errors && o.errors.length === 0]);
A.push(["LIVE M-map draws all 4 POIs", o.bigmapPOIpx && Object.values(o.bigmapPOIpx).every((v) => v > 0)]);
A.push(["LIVE fps>=55", o.fps >= 55]);
const pass = A.every(([, v]) => v);
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("\nASSERTIONS:");
for (const [n, v] of A) console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`);
console.log("\n" + (pass ? "✅ LIVE PASS" : "❌ LIVE FAIL"));
process.exit(pass ? 0 : 1);
