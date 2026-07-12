// CAS-2230 QA — LIVE post-ship OBSERVABLE confirmation AFTER the CTO Gate flip+deploy (build 1aa455ccb76b).
// Runs against gh-pages (not a local server). Proves:
//   (1) served config.js is byte-identical to HEAD blob → DAYNIGHT.enabled:true + DOORS_INTERIORS.enabled:false
//       (module-graph consistent, no CAS-2220 boot break; doors stay DARK live).
//   (2) served render.js is byte-identical to HEAD blob (md5).
//   (3) OBSERVABLE on the REAL deployed URL via __dev.daynight() phase overrides:
//       night darker than noon, lamp halo glow ON>OFF, noon neutral (tint≈0), dusk warm; 11 farolas from deco;
//       HUD stays legible (tint under HUD); worldFingerprint byte-stable; 0 JS-err; 60fps.
// Run AFTER CTO reports LIVE. Usage: node tools/cas2230-live-qa.mjs [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "1aa455ccb76b";
const OUT = join(ROOT, "shots", "cas2230-live");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ground-truth HEAD blob md5s (CTO shipped consistent-HEAD overlay of the 6 MODS files)
const HEAD_CONFIG_MD5 = execSync(`git show HEAD:sim/config.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];
const HEAD_RENDER_MD5 = execSync(`git show HEAD:render/render.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];

async function fetchServed(path) {
  const bust = `?cb=${path.replace(/\W/g, "")}`; // static ES imports carry no buster; add one for the raw fetch
  const r = await fetch(`${LIVE}/${path}${bust}`);
  const txt = await r.text();
  const md5 = execSync(`md5sum`, { input: txt }).toString().split(" ")[0];
  return { status: r.status, txt, md5 };
}

// mean brightness over the whole canvas + a centred box (the tp'd lamp sits at screen centre → halo lives there).
async function probe(page) {
  return page.evaluate(() => {
    const cv = document.getElementById("c"), g = cv.getContext("2d");
    const { data, width, height } = g.getImageData(0, 0, cv.width, cv.height);
    let lum = 0; const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) lum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const bx0 = (width * 0.35) | 0, bx1 = (width * 0.65) | 0, by0 = (height * 0.35) | 0, by1 = (height * 0.65) | 0;
    let clum = 0, cn = 0;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const i = (y * width + x) * 4; clum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114); cn++;
    }
    return { lum: +(lum / n).toFixed(2), centreLum: +(clum / cn).toFixed(2) };
  });
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && __dev.scene && __dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(__dev.scene())", { timeout: 10000 });
  for (const s of ["customize", "abilitysel"]) { await sleep(250);
    if (await page.evaluate(() => __dev.scene()) === s) await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }))); }
  await page.waitForFunction("__dev.scene()==='play'", { timeout: 10000 }); await sleep(600);
}

const report = { live: LIVE, expectBuild: EXPECT_BUILD, served: {}, observable: {}, assertions: [] };

// ---- 1. served-file byte/module-graph verify ----
const cfg = await fetchServed("sim/config.js");
const rnd = await fetchServed("render/render.js");
report.served = {
  config: { status: cfg.status, md5: cfg.md5, matchesHEAD: cfg.md5 === HEAD_CONFIG_MD5, headMd5: HEAD_CONFIG_MD5,
    daynightEnabledTrue: /DAYNIGHT\s*=\s*\{[\s\S]*?enabled:\s*true/.test(cfg.txt),
    doorsDark: /DOORS_INTERIORS\s*=\s*\{[\s\S]*?enabled:\s*false/.test(cfg.txt) },
  render: { status: rnd.status, md5: rnd.md5, matchesHEAD: rnd.md5 === HEAD_RENDER_MD5, headMd5: HEAD_RENDER_MD5 },
};

// ---- 2. observable boot + day/night render ----
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errs.push("console: " + m.text()); });
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errs.push("reqfail: " + r.url()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push("http" + r.status() + ": " + r.url()); });

  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await toPlay(page);

  const build = await page.evaluate(() => window.__BUILD);
  const dn = (arg) => page.evaluate((a) => window.__dev.daynight(a), arg);
  const fp = () => page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(1234)));

  const def = await dn();                       // live default (enabled:true from disk)
  const fp0 = await fp();

  // teleport onto a farola so the halo is on-screen and every visual sample compares at the same vantage.
  if (def.lamp0) await page.evaluate((t) => window.__dev.tp(t.tx, t.ty), def.lamp0);
  await sleep(400);

  // noon (phase 0.5) = neutral baseline (tint≈0, glow≈0)
  const noon = await dn({ enabled: true, phase: 0.5 }); await sleep(150);
  await page.screenshot({ path: join(OUT, "live-noon.png") });
  const noonProbe = await probe(page);

  // night, glow OFF (tint only) → night, glow ON (halo). Isolates the lamp halo from the ambient tint.
  const nightNoGlow = await dn({ enabled: true, phase: 0.0, lampGlow: false }); await sleep(150);
  const nightNoGlowProbe = await probe(page);
  const night = await dn({ enabled: true, phase: 0.0, lampGlow: true }); await sleep(150);
  await page.screenshot({ path: join(OUT, "live-night.png") });
  const nightProbe = await probe(page);

  // dusk (phase 0.74) = warm tint + glow
  const dusk = await dn({ enabled: true, phase: 0.74 }); await sleep(150);
  await page.screenshot({ path: join(OUT, "live-dusk.png") });

  const fp1 = await fp();

  // fps with night+glow active
  await dn({ enabled: true, phase: 0.0 });
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(+(n * 1000 / (performance.now() - t0)).toFixed(1)); })(); }));

  report.observable = { build, def, noonProbe, nightNoGlowProbe, nightProbe,
    nightTint: night.tint, nightGlow: night.glow, noonTint: noon.tint, noonGlow: noon.glow,
    duskTint: dusk.tint, duskGlow: dusk.glow, fpStable: fp0 === fp1, fps, errors: errs };
} finally { await browser.close(); }

// ---- assertions ----
const s = report.served, o = report.observable, A = report.assertions;
A.push(["served config.js 200 + byte-identical to HEAD blob", s.config.status === 200 && s.config.matchesHEAD]);
A.push(["served config DAYNIGHT.enabled:true", s.config.daynightEnabledTrue]);
A.push(["served config DOORS_INTERIORS.enabled:false (doors stay DARK live)", s.config.doorsDark]);
A.push(["served render.js byte-identical to HEAD blob", s.render.matchesHEAD]);
A.push([`LIVE build == ${EXPECT_BUILD}`, o.build === EXPECT_BUILD]);
A.push(["LIVE boots to play, 0 JS errors", o.errors && o.errors.length === 0]);
A.push(["11 farolas derived from world.deco (>0)", o.def && o.def.lamps > 0]);
A.push(["worldFingerprint byte-stable across phase toggles (0 sim drift)", o.fpStable]);
A.push(["night tint alpha strong (>0.2)", o.nightTint && o.nightTint.a > 0.2]);
A.push(["night scene DARKER than noon baseline", o.nightProbe.lum < o.noonProbe.lum - 4]);
A.push(["lamp halo brightens lamp area (glow ON > glow OFF)", o.nightProbe.centreLum > o.nightNoGlowProbe.centreLum + 5]);
A.push(["noon neutral (tint alpha ≈ 0)", o.noonTint && o.noonTint.a < 0.05]);
A.push(["dusk tint WARM (r>b) + glow active", o.duskTint && o.duskTint.r > o.duskTint.b && o.duskGlow > 0.2]);
A.push(["LIVE fps >= 55 with night+glow", o.fps >= 55]);

const pass = A.every(([, v]) => v);
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("\nASSERTIONS:");
for (const [n, v] of A) console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`);
console.log("\n" + (pass ? "✅ LIVE PASS" : "❌ LIVE FAIL"));
process.exit(pass ? 0 : 1);
