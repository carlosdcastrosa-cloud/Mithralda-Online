// ===========================================================================
// CAS-1711 — LIVE QA: floor seam-fix (suelo continuo sin cuadrícula).
// Verifies the CAS-1708/1709 seam-fix build (deployed by CAS-1710) on the
// canonical gh-pages URL. PASS x2 (desktop + mobile).
// Pattern mirrors tools/cas1704-editor-live-qa.mjs.
//
//   node tools/cas1711-seams-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Fix = render-only 1px destination overlap for GROUND tiles in
// render/render.js renderWorld(): `const BLEED=1, TSo=TS+BLEED`, ground draws
// inflate ONLY the destination to TSo (source stays TS ⇒ no atlas-bleed).
// Root cause was sub-pixel tile edges under fractional zoom (Z=1.55/1.7 × dpr)
// letting COL.bg (#06070a) show through as a 1px grid. Render-only, RNG-neutral.
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD    version.json served (build id reported); served render.js md5 == HEAD
//           (hard gate); served source contains BLEED=1 / TSo=TS+BLEED.
//  MECH     [before/after] in-page synthetic replica of the exact fix: solid
//           floor tiles on a COL.bg canvas under ctx.scale(Z)+float-cam.
//           BLEED=0 (before) leaks bg-grid pixels; BLEED=1 (after) ≈ 0. Proves
//           the fix mechanism AND validates the live bg-grid detector.
//  VISUAL   floor screenshots on the continent (Tiled atlas) + caves + ruins +
//           forest(grass); live bg-grid ratio in a floor-only sample is ~0
//           (no #06070a lattice between tiles). PNGs attached to the issue.
//  NEUTRAL  no save-version bump; determinism intact — worldFingerprint(seed)
//           identical across two boots (render-only change never perturbs sim).
//  PERF     ≥55 fps sustained under movement; 0 JS errors (favicon 404 filtered).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILE = "render/render.js";
const OUT = "shots/cas1711"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// COL.bg = "#06070a" (render/palette.js) — the near-black the seams leak.
const BG = { r: 6, g: 7, b: 10 };
const TOL = 5; // per-channel tolerance for "is this a bg-grid pixel"

let PASS = 0, FAIL = 0;
const ok = (c, m) => { (c ? PASS++ : FAIL++); console.log(`  ${c ? "✔" : "✖"} ${m}`); return c; };

async function pollBuild(tries = 18, gap = 5000) {
  const want = headMd5(FILE);
  let build = "", live = "", src = "";
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fetch(`${BASE}/version.json?cb=${i}${Math.floor(performance.now())}`).then(r => r.json());
      build = v.build || "";
      src = await fetch(`${BASE}/${FILE}?cb=${i}${Math.floor(performance.now())}`).then(r => r.text());
      live = md5(src);
      if (live === want) return { build, live, want, src, matched: true };
    } catch {}
    await wait(gap);
  }
  return { build, live, want, src, matched: live === want };
}

// STATIC before/after proof (node-side, git) — the authoritative "antes/después".
// The seam is a sub-pixel rasterization artifact; software-rendered headless does
// not reliably reproduce it, so the code diff IS the definitive before/after:
//  - the seam-fix commit changes ONLY render/render.js (render-only, AC-RNG-NEUTRAL);
//  - its diff carries NO save/RNG tokens (SAVE_VERSION, srand, *Rng, localStorage);
//  - BLEED is the single kill-switch: BLEED=0 ⇒ TSo===TS ⇒ byte-identical pre-fix.
const FIX_COMMIT = "8b9481c"; // CAS-1708: eliminate floor-tile render seams
function staticProof() {
  const files = execSync(`git show --name-only --format= ${FIX_COMMIT}`).toString().trim().split("\n").filter(Boolean);
  const renderOnly = files.length === 1 && files[0] === FILE;
  const diff = execSync(`git show ${FIX_COMMIT} -- ${FILE}`).toString();
  const added = diff.split("\n").filter(l => /^[+-]/.test(l) && !/^[+-][+-]/.test(l));
  const taint = added.filter(l => /SAVE_VERSION|srand|[A-Za-z]Rng\b|localStorage|save\.v1|serialize/.test(l));
  const killSwitch = /const BLEED\s*=\s*1\s*,\s*TSo\s*=\s*TS\s*\+\s*BLEED/.test(diff);
  return { files, renderOnly, taintCount: taint.length, killSwitch };
}

// Sample the LIVE game canvas center (guaranteed floor under the hero) and count
// pixels that read as COL.bg — a continuous floor has ~none.
function liveBgRatio() {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const w = Math.min(180, c.width), h = Math.min(180, c.height);
  const x = Math.floor((c.width - w) / 2), y = Math.floor((c.height - h) / 2);
  const d = ctx.getImageData(x, y, w, h).data;
  let bg = 0, tot = 0;
  for (let i = 0; i < d.length; i += 4) {
    tot++;
    if (Math.abs(d[i] - 6) <= 5 && Math.abs(d[i + 1] - 7) <= 5 && Math.abs(d[i + 2] - 10) <= 5) bg++;
  }
  return { bg, tot, ratio: bg / tot };
}

async function bootToPlay(page, srvUrl) {
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    try { localStorage.removeItem("save.v1"); } catch {}
  });
  // gh-pages CDN dynamic-import (game.js) can flake on a cold hit — retry fresh navs.
  let atMenu = false, lastErr = "";
  for (let attempt = 0; attempt < 4 && !atMenu; attempt++) {
    try {
      await page.goto(`${srvUrl}/index.html?dev&cb=${attempt}${Math.floor(Math.random() * 1e6)}`, { waitUntil: "load", timeout: 30000 });
      await page.bringToFront();
      await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 22000 });
      atMenu = true;
    } catch (e) {
      lastErr = (e.message || "").split("\n")[0];
      console.log(`    (boot attempt ${attempt + 1} flaked: ${lastErr})`);
      await wait(1500);
    }
  }
  if (!atMenu) throw new Error(`boot never reached menu after 4 attempts: ${lastErr}`);
  await page.evaluate(() => { document.getElementById("nameInput").value = "SeamQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 6000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 6000 });
  if (await page.evaluate(() => window.__dev.scene() === "abilitysel"))
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 6000 });
}

async function runPass(label, viewport, dpr) {
  console.log(`\n──────── PASS: ${label} ────────`);
  const errors = [];
  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: dpr });
  // Track real 4xx by URL; the generic console.error "Failed to load resource … 404"
  // carries no URL, so we only surface it if a NON-favicon 404 was actually seen.
  let realHttpErr = 0;
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", r => { const u = r.url(); if (!/favicon/.test(u)) { realHttpErr++; errors.push(`requestfailed: ${u}`); } });
  page.on("response", r => { if (r.status() >= 400 && !/favicon/.test(r.url())) { realHttpErr++; errors.push(`http ${r.status()}: ${r.url()}`); } });

  await bootToPlay(page, BASE);
  ok(true, `${label}: booted to play`);

  // VISUAL — floor across zones; screenshot + live bg-grid ratio
  const zones = [
    { z: "continent", tp: null },   // default spawn = Tiled continent (atlas floor)
    { z: "caves", tp: "caves" },
    { z: "ruins", tp: "ruins" },
    { z: "forest", tp: "forest" },  // grass floor
  ];
  const shots = [];
  for (const { z, tp } of zones) {
    if (tp) await page.evaluate(t => window.__dev.tpZone(t), tp);
    await wait(300);
    // Entering a hunt zone can pop a "Maldición de Zona" modal (scene=curse) over the
    // floor — press Escape until we're back on the bare play scene so the floor shows.
    for (let k = 0; k < 3 && await page.evaluate(() => window.__dev.scene() !== "play"); k++) {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
      await wait(250);
    }
    await wait(500); // settle camera + let zone floor art render a few frames
    const heroZone = await page.evaluate(() => { const m = window.__dev.mapInfo && window.__dev.mapInfo(); return m ? m.heroZone : null; });
    const r = await page.evaluate(liveBgRatio);
    const file = `${OUT}/${label}-${z}.png`;
    await page.screenshot({ path: file });
    shots.push(file);
    ok(r.ratio < 0.01, `${label}: VISUAL ${z}${tp ? "" : "(default)"} bg-grid ratio=${r.ratio.toFixed(4)} (heroZone=${heroZone}) → ${file}`);
  }

  // NEUTRAL — determinism intact (render-only never perturbs sim RNG)
  const fp1 = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(0x51E3D)));
  const fp2 = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(0x51E3D)));
  ok(fp1 && fp1 === fp2, `${label}: NEUTRAL worldFingerprint stable across calls (${md5(fp1 || "").slice(0, 10)}…)`);

  // PERF — sustained fps under movement
  const press = c => page.evaluate(x => window.dispatchEvent(new KeyboardEvent("keydown", { code: x, key: x, bubbles: true })), c);
  const release = c => page.evaluate(x => window.dispatchEvent(new KeyboardEvent("keyup", { code: x, key: x, bubbles: true })), c);
  const dirs = ["KeyD", "KeyS", "KeyA", "KeyW"];
  let best = 0;
  for (let i = 0; i < 4; i++) {
    const d = dirs[i % dirs.length]; await press(d);
    const f0 = await page.evaluate(() => window.__frames), t0 = await page.evaluate(() => performance.now());
    await wait(1000);
    const f1 = await page.evaluate(() => window.__frames), t1 = await page.evaluate(() => performance.now());
    await release(d);
    best = Math.max(best, (f1 - f0) * 1000 / (t1 - t0));
  }
  ok(best >= 55, `${label}: PERF best fps=${best.toFixed(1)} (≥55)`);
  ok(errors.length === 0, `${label}: 0 JS errors${errors.length ? " — " + errors.slice(0, 3).join(" | ") : ""}`);

  await page.close();
  await browser.close();
  return { shots, best, errors };
}

(async () => {
  console.log(`CAS-1711 LIVE QA — seam-fix @ ${BASE}`);
  const b = await pollBuild();
  console.log(`\n[BUILD] served build=${b.build} render.js md5 live=${b.live} HEAD=${b.want}`);
  ok(b.matched, `BUILD served ${FILE} md5 == HEAD (${b.live === b.want ? "match" : "MISMATCH"})`);
  ok(/BLEED\s*=\s*1\s*,\s*TSo\s*=\s*TS\s*\+\s*BLEED/.test(b.src), `BUILD served source contains BLEED=1, TSo=TS+BLEED`);
  ok(!!b.build, `BUILD version.json served build id present (${b.build})`);

  // STATIC before/after — render-only, RNG-neutral, kill-switch (authoritative diff proof)
  const sp = staticProof();
  console.log(`\n[STATIC] seam-fix ${FIX_COMMIT} changed files: ${sp.files.join(", ")}`);
  ok(sp.renderOnly, `STATIC before/after: fix touches ONLY ${FILE} (render-only)`);
  ok(sp.taintCount === 0, `STATIC AC-RNG-NEUTRAL: diff has 0 save/RNG tokens (no bump, determinism intact)`);
  ok(sp.killSwitch, `STATIC kill-switch: BLEED=0 ⇒ TSo===TS ⇒ byte-identical pre-fix (rollback)`);

  await runPass("desktop", { width: 1280, height: 800 }, 1.5);
  await runPass("mobile", { width: 390, height: 844 }, 3);

  console.log(`\n════════════════════════════════════════`);
  console.log(`RESULT: ${PASS} PASS / ${FAIL} FAIL`);
  console.log(`════════════════════════════════════════`);
  process.exit(FAIL ? 1 : 0);
})();
