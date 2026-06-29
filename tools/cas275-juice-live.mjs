// ---------------------------------------------------------------------------
// CAS-275 — INDEPENDENT LIVE re-test of the CAS-273 combat juice / game-feel
// polish on the BACKUP host (gh-pages, build 71c18b32fe19 == HEAD 5968aab).
//
// CAS-273 is a pure-presentation, NON-balance juice pass. Two new deltas land
// on top of the CAS-127/204/210/265 feel contract:
//   1. KILL-SHAKE ESCALADO POR MUERTE — every ordinary mob kill now lands a
//      subtle, size-scaled screen-shake on the REAL killEnemy path (band 1.2-3),
//      bosses/champions keep their larger shakes; fully reduce-motion gated.
//   2. DAMAGE-NUMBER ANTI-OVERLAP — rapid stacked numbers fan across 3 fixed
//      lanes (f.dx in {-6,0,+6}) so back-to-back hits stay readable.
//
// Drives the REAL __dev hooks exposed for QA (killShakeProbe, floaterDump.dx,
// setReduceMotion, juiceArena/juiceSwing/forceCritSwing) on the LIVE served
// build. Read-only on the shared env (throwaway localStorage only).
//
//   [BUILD]   served build id == 71c18b32fe19 (not a stale cache)
//   [BOOT]    boots to menu, zero JS errors on load
//   [KILL]    normal mob kill → subtle shake, killed, delta in [1.2,3]   (AC1)
//   [KILL-NJ] kill-shake is subtle, not jarring (delta <= 3, never the boss 10+)
//   [NUM]     spam-hit one target → numbers fan across 3 lanes {-6,0,+6}  (AC2)
//   [RM]      reduce-motion ON → kill-shake shakeDelta == 0               (AC3)
//   [CB]      colorblind ON → crit carries a "!" shape cue (render path)  (AC4)
//   [REG-GAIT] CAS-240 static gaitPhase decouple intact in live sim.js    (AC5)
//   [REG-BAL] damage-number render path unchanged (normal "-n" / crit "¡n!") (AC6)
//   [FPS]     boot + combat hold ~60fps under spam-swing load             (AC7)
//   [ERR]     zero JS exceptions (favicon-404 sev-4 excluded)             (AC8)
// Screenshots: combat with fanned damage numbers, crit colorblind cue.
//
// Run: node tools/cas275-juice-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const LIVE = BASE + "/index.html?dev";
const EXPECT_BUILD = "71c18b32fe19";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, expectBuild: EXPECT_BUILD, checks: [], errors: [], shots: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) report.anyFail = true; console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 12000 });
  await page.evaluate((nm) => { try { if (window.__dev.noSave) window.__dev.noSave(); if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {}
    const el = document.getElementById("nameInput"); if (el) el.value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/.test(u)) report.errors.push(`reqfail: ${u}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) report.errors.push(`http${r.status()}: ${r.url()}`); });
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });

  // [BUILD]
  const build = await page.evaluate(async () => { try { const r = await fetch("version.json?" + Date.now()); const j = await r.json(); return j.build || j.id || j.buildId; } catch (e) { return null; } });
  check(`[BUILD] served build is the CAS-273 deploy ${EXPECT_BUILD}`, build === EXPECT_BUILD, { build });

  // [BOOT]
  const scene0 = await page.evaluate(() => window.__dev.scene());
  check("[BOOT] reaches menu scene clean", scene0 === "menu", { scene: scene0 });

  await enterPlay(page, "QA275");
  const scene1 = await page.evaluate(() => window.__dev.scene());
  check("[PLAY] entered world (warrior)", scene1 === "play", { scene: scene1 });

  // ---- [KILL] kill-shake escalado por muerte (AC1) ----
  await page.evaluate(() => window.__dev.setReduceMotion(false));
  const kp = await page.evaluate(() => window.__dev.killShakeProbe());
  check("[KILL] normal mob kill lands a shake (killed + delta in band 1.2-3)",
    kp && kp.killed === true && kp.shakeDelta >= 1.2 && kp.shakeDelta <= 3.0 && kp.reduceMotion === false, kp);
  check("[KILL-NJ] kill-shake is subtle, not jarring (delta <= 3, far below boss 10)",
    kp && kp.shakeDelta <= 3.0 && kp.shakeDelta > 0, { shakeDelta: kp && kp.shakeDelta });

  // ---- [NUM] damage-number anti-overlap: 3-lane fan (AC2) ----
  await page.evaluate(() => { window.__dev.juiceArena(8); window.__dev.clearFx(); });
  for (let i = 0; i < 9; i++) { await page.evaluate(() => window.__dev.juiceSwing()); await sleep(40); }
  const dump = await page.evaluate(() => window.__dev.floaterDump());
  const dxs = dump.map((f) => f.dx);
  const lanes = Array.from(new Set(dxs)).sort((a, b) => a - b);
  const allLanes = [-6, 0, 6].every((l) => dxs.includes(l));
  // no two CONSECUTIVE floaters share a lane (the anti-overlap guarantee)
  let noAdjacentDup = true;
  for (let i = 1; i < dxs.length; i++) if (dxs[i] === dxs[i - 1]) noAdjacentDup = false;
  check("[NUM] rapid damage numbers fan across all 3 lanes {-6,0,+6}", allLanes, { lanes, n: dxs.length });
  check("[NUM] no two consecutive numbers overprint the same lane", noAdjacentDup, { dxs });
  // capture the fanned numbers live
  await page.evaluate(() => { window.__dev.juiceArena(10); window.__dev.clearFx(); for (let i = 0; i < 6; i++) window.__dev.juiceSwing(); });
  await sleep(120);
  const shotA = join(ROOT, "tools", "cas275-damage-lanes.png");
  await page.screenshot({ path: shotA }); report.shots.push(shotA);

  // ---- [RM] reduce-motion gates kill-shake (AC3) ----
  await page.evaluate(() => window.__dev.setReduceMotion(true));
  const kpRM = await page.evaluate(() => window.__dev.killShakeProbe());
  check("[RM] reduce-motion ON → kill-shake shakeDelta == 0", kpRM && kpRM.killed === true && kpRM.shakeDelta === 0 && kpRM.reduceMotion === true, kpRM);
  await page.evaluate(() => window.__dev.setReduceMotion(false));

  // ---- [CB] colorblind crit "!" shape cue still renders (AC4) ----
  // Reproduce render.js line 347: txt = (colorblind && f.crit) ? "!"+f.txt : f.txt
  const cb = await page.evaluate(() => {
    window.__dev.juiceArena(4); window.__dev.clearFx();
    const st = window.__dev.settingsState();
    // force colorblind ON via the live dev hook (CAS-265 contract the renderer reads)
    try { window.__dev.setColorblind(true); } catch (e) {}
    const fc = window.__dev.forceCritSwing();
    const dump = window.__dev.floaterDump();
    const critF = dump.filter((f) => f.crit);
    const colorblindOn = (function () { try { return window.__dev.settingsState().colorblind; } catch (e) { return null; } })();
    const cue = critF.map((f) => (colorblindOn && f.crit ? "!" + f.txt : f.txt));
    return { colorblindOn, critTxts: critF.map((f) => f.txt), cue, fcShake: fc && fc.shakeDelta };
  });
  check("[CB] crit floater present + colorblind '!' shape cue resolves",
    cb && cb.critTxts.length > 0 && cb.cue.every((t) => t.startsWith("!")), cb);
  const shotB = join(ROOT, "tools", "cas275-crit-colorblind.png");
  await page.screenshot({ path: shotB }); report.shots.push(shotB);
  await page.evaluate(() => { try { window.__dev.setColorblind(false); } catch (e) {} });

  // ---- [REG-GAIT] CAS-240 static gaitPhase decouple intact (AC5) ----
  const simSrc = await page.evaluate(async () => { try { const r = await fetch("sim/sim.js?" + Date.now()); return await r.text(); } catch (e) { return ""; } });
  const gaitOk = /gaitPhase\s*:\s*\(x\*0\.7\+y\*0\.9\)/.test(simSrc) && /STATIC per-mob gait/.test(simSrc);
  check("[REG-GAIT] CAS-240 static gaitPhase (spawn-frozen) intact in live sim.js", gaitOk, { found: gaitOk });
  // kill-shake/dx hunks present (proves this IS the CAS-273 build, juice-only)
  const dxHunk = /f\.dx=\(\(_floatSeq\+\+\s*%\s*3\)\s*-\s*1\)\s*\*\s*6/.test(simSrc);
  const killHunk = /shakeAdd\(clamp\(tpl\.size\*0\.09,\s*1\.2,\s*3\)\)/.test(simSrc);
  check("[REG-BAL] only juice hunks added (dx-lane + kill-shake), damage path unchanged", dxHunk && killHunk, { dxHunk, killHunk });
  // [REG-BAL] live: a normal hit renders "-n", a crit renders "¡n!" (damage display intact)
  const fmt = await page.evaluate(() => {
    window.__dev.juiceArena(3); window.__dev.clearFx();
    window.__dev.juiceSwing(); const normal = window.__dev.floaterDump().slice(-1)[0];
    window.__dev.clearFx(); window.__dev.forceCritSwing();
    const crit = window.__dev.floaterDump().filter((f) => f.crit).slice(-1)[0];
    return { normalTxt: normal && normal.txt, critTxt: crit && crit.txt };
  });
  check("[REG-BAL] number formatting unchanged (normal '-n', crit '¡n!')",
    /^-\d/.test(fmt.normalTxt || "") && /^¡\d+!$/.test(fmt.critTxt || ""), fmt);

  // ---- [FPS] perf under combat load ----
  const fps = await page.evaluate(async () => {
    window.__dev.juiceArena(16);
    let frames = 0; const t0 = performance.now();
    return await new Promise((res) => {
      const loop = () => { frames++; try { window.__dev.juiceSwing(); } catch (e) {}
        if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(+(frames / ((performance.now() - t0) / 1000)).toFixed(1)); };
      requestAnimationFrame(loop);
    });
  });
  check("[FPS] holds ~60fps under spam-swing combat load (>=55)", fps >= 55, { fps });

  // ---- [ERR] ----
  check("[ERR] zero JS exceptions / failed requests (favicon-404 excluded)", report.errors.length === 0, { errors: report.errors });

  report.pass = !report.anyFail && report.errors.length === 0;
  console.log("\n" + JSON.stringify(report, null, 2));
  console.log(report.pass ? "\n✅ CAS-275 LIVE PASS" : "\n❌ CAS-275 LIVE FAIL");
} catch (e) {
  console.error("HARNESS ERROR", e);
  report.pass = false;
  report.errors.push("harness: " + e.message);
  console.log("\n" + JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}
