// CAS-2058 (QA full-build regression, umbrella CAS-2046/CAS-27) — OBSERVABLE smoke: Boss Rush TIME-ATTACK
// against the POST-FLIP LIVE build f5fa24ffe4e2 (CAS-2055 flipped timeAttack:false→true). This clone of
// cas2054 inverts the served-state assertions: the layer is now LIVE (served BOSS_RUSH.timeAttack===true,
// showTimer/showScore true, serialize carries record keys by default). We still drive the REAL gauntlet
// timer/rest/hit/score/recap/records observably, prove records persist across a real reload, and prove the
// REVERSE no-leak direction: arming timeAttack=false at runtime collapses serialize to HEAD {v,bestRound}
// and gauntletComplete returns to 'menu' verbatim (determinism / clean back-out).
// --- original DARK-build header (cas2054) below for provenance ---
// CAS-2054 (recovery QA, umbrella CAS-2046) — OBSERVABLE smoke: Boss Rush TIME-ATTACK, served DARK build.
// Browser complement to the node build harness tools/cas2047-timeattack.mjs. Lesson CAS-1947: DRIVE the
// real sim loop against the SERVED bytes, don't only assert md5. The layer ships DARK
// (BOSS_RUSH.timeAttack:false); QA arms it at RUNTIME by importing the live sim/config.js ES-module
// singleton (the SAME instance game.js loaded ⇒ same object) and flipping timeAttack=true, then drives
// the REAL gauntlet + timer + score + record + recap seams (dev.br* on sim.dev), and PAINTS the HUD
// timer + recap overlay on the real canvas for screenshots.
//
// Per profile (desktop + mobile), PASS×2 by invoking twice:
//   (1) served DARK reaches browser: BOSS_RUSH.timeAttack === false (byte-correct dark before arming),
//       and serializeBossRush() OFF = HEAD shape {v:1,bestRound} exactly (no record keys ⇒ save byte-id).
//   (2) ARM at runtime: flip live singleton → brState().timeAttack:true (proves same object).
//   (3) ENTER real Boss Rush via dev.brStart (scene play, bossRushMode on, round 1). [screenshot HUD]
//   (4) TIMER runs during active combat (brTick accrues sim dt), bonfire REST excluded (brSetResting → 0 accrual).
//   (5) HIT counter increments through the REAL damageHero (dev.brHurt).
//   (6) SCORE deterministic == independent oracle (base − time − hits + clean bonus); 0 RNG.
//   (7) gauntletComplete(armed) → scene 'bossRushRecap' with results + Δ vs prev best + NEW RECORD flags. [screenshot]
//   (8) RECORDS persist in localStorage mithralda.bossrush.v1 ACROSS A REAL PAGE RELOAD (bootBossRush loads them).
//   (9) Sub-flags gate each piece: showTimer/showScore off (display only, score still COMPUTES);
//       timeAttack off → gauntletComplete returns to 'menu' verbatim + serialize collapses to HEAD shape.
// Restores DARK (timeAttack:false) at the end so nothing leaks between profiles.
// Run: node tools/cas2054-timeattack-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2058";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

// Independent score oracle (mirror config.js formula — recomputed here, NOT read from sim):
// score = max(0, base − round(combatSec × timeW) − hits × hitW + (hits===0 ? cleanBonus : 0))
function scoreOracle(combatMs, hits, k) {
  const s = k.scoreBase - Math.round((combatMs / 1000) * k.scoreTimeW) - hits * k.scoreHitW + (hits === 0 ? k.scoreCleanBonus : 0);
  return Math.max(0, s);
}

let anyFail = false;
const okp = (m) => console.log(`✔ ${m}`);
const badp = (m) => { anyFail = true; console.error(`✖ ${m}`); };

function wireErrors(page) {
  const errors = [];
  const infra5xx = [];
  page.on("response", (r) => { if (r.status() >= 500) infra5xx.push(`${r.status()} ${r.url()}`); });
  page.on("console", (m) => { const t = m.text(); if (m.type() !== "error") return;
    if (/favicon\.ico/i.test(t) || /status of 404/i.test(t)) return;
    if (/Failed to load resource/i.test(t) && /status of 5\d\d/i.test(t)) return;
    errors.push(t); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); const err = (r.failure() && r.failure().errorText) || "";
    if (/favicon\.ico/i.test(u)) return;
    if (/net::ERR_(FAILED|ABORTED|NETWORK_CHANGED|CONNECTION|TIMED_OUT)/i.test(err)) { infra5xx.push(`${err} ${u}`); return; }
    errors.push("requestfailed: " + u); });
  return { errors, infra5xx };
}

async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate((n) => { document.getElementById("nameInput").value = n; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

async function sampleFps(page) {
  // Discard the first window (fresh incognito-context JIT/GPU warmup) and report steady-state = max of two windows.
  const one = () => page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 >= 1000) res(n * 1000 / (performance.now() - t0)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  await one();                       // warmup, discarded
  const a = await one(), b = await one();
  return Math.max(a, b);
}

for (const prof of PROFILES) {
  // Fresh isolated context per profile so localStorage (mithralda.bossrush.v1) never leaks across profiles,
  // yet SURVIVES a reload within the profile (we do NOT clear on new document — the reload persistence test needs it).
  const ctx = (browser.createBrowserContext ? await browser.createBrowserContext()
              : await browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  const { errors, infra5xx } = wireErrors(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });

  // (1) served DARK reaches browser + OFF save shape byte-identical to HEAD.
  const dark = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const off = s.serializeBossRush();
    return { ta: c.BOSS_RUSH.timeAttack, showTimer: c.BOSS_RUSH.showTimer, showScore: c.BOSS_RUSH.showScore,
      scoreBase: c.BOSS_RUSH.scoreBase, scoreTimeW: c.BOSS_RUSH.scoreTimeW, scoreHitW: c.BOSS_RUSH.scoreHitW, scoreCleanBonus: c.BOSS_RUSH.scoreCleanBonus,
      offSerialize: JSON.stringify(off), offKeys: Object.keys(off).sort().join(",") };
  }, BASE);
  const K = { scoreBase: dark.scoreBase, scoreTimeW: dark.scoreTimeW, scoreHitW: dark.scoreHitW, scoreCleanBonus: dark.scoreCleanBonus };
  if (dark.ta === true && dark.showTimer === true && dark.showScore === true) okp(`[${prof.name}] served LIVE reaches browser: BOSS_RUSH.timeAttack===true, showTimer/showScore true (CAS-2055 flip observable)`);
  else badp(`[${prof.name}] served state wrong (expected LIVE true/true/true): ta=${dark.ta} showTimer=${dark.showTimer} showScore=${dark.showScore}`);
  if (dark.offKeys === "bestRound,bestScore,bestTimeMs,v") okp(`[${prof.name}] LIVE serialize carries record keys {v,bestRound,bestTimeMs,bestScore}: ${dark.offSerialize}`);
  else badp(`[${prof.name}] LIVE serialize shape wrong (expected 4 keys w/ records): ${dark.offSerialize}`);
  if (dark.scoreBase === 100000 && dark.scoreTimeW === 100 && dark.scoreHitW === 250 && dark.scoreCleanBonus === 10000)
    okp(`[${prof.name}] score knobs present (base=${dark.scoreBase} timeW=${dark.scoreTimeW} hitW=${dark.scoreHitW} clean=${dark.scoreCleanBonus})`);
  else badp(`[${prof.name}] score knobs wrong: ${JSON.stringify(K)}`);

  await enterPlay(page, "BRUSH");
  const fps = await sampleFps(page);
  if (fps >= 55) okp(`[${prof.name}] fps ${fps.toFixed(1)} (>=55 budget)`);
  else badp(`[${prof.name}] fps ${fps.toFixed(1)} BELOW 55 budget`);

  // (2)-(6) ARM + ENTER + drive timer/rest/hit against the SERVED singletons (leave scene=play for the HUD shot).
  const A = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const { dev, G } = s;
    const out = {};
    c.BOSS_RUSH.timeAttack = true;
    out.armed = dev.brState().timeAttack;

    const st = dev.brStart();
    out.startScene = st.scene; out.startMode = st.bossRushMode; out.startRound = st.round;

    // (4) TIMER runs during active combat.
    const t0 = dev.brState().combatMs;
    dev.brTick(2.0); dev.brTick(1.5);
    out.combatAccrued = dev.brState().combatMs - t0;   // ~3500ms

    // (4) bonfire REST excluded from the timer.
    dev.brSetResting(true);
    const tr0 = dev.brState().combatMs;
    dev.brTick(2.0); dev.brTick(1.0);
    out.restDelta = dev.brState().combatMs - tr0;       // 0
    dev.brSetResting(false);

    // (5) HIT counter via the REAL damageHero.
    const h0 = dev.brState().hitsReceived;
    dev.brHurt(6);
    out.hitDelta = dev.brState().hitsReceived - h0;     // 1
    out.playScene = dev.brState().scene;
    return out;
  }, BASE);
  await page.screenshot({ path: `${OUT}/${prof.name}-hud.png` });

  if (A.armed === true) okp(`[${prof.name}] ARM: live singleton flipped ⇒ brState.timeAttack:true (same object)`);
  else badp(`[${prof.name}] ARM failed: timeAttack=${A.armed}`);
  if (A.startScene === "play" && A.startMode === true && A.startRound >= 0)   // round is 0-based (config: "índice 0-based")
    okp(`[${prof.name}] ENTER Boss Rush: dev.brStart ⇒ scene 'play', bossRushMode on, round ${A.startRound + 1}/4`);
  else badp(`[${prof.name}] ENTER wrong: scene=${A.startScene} mode=${A.startMode} round=${A.startRound}`);
  if (A.combatAccrued >= 3400 && A.combatAccrued <= 3600) okp(`[${prof.name}] TIMER runs during combat: +${A.combatAccrued}ms over 3.5s ticks`);
  else badp(`[${prof.name}] combat timer wrong: +${A.combatAccrued}ms (expected ~3500)`);
  if (A.restDelta === 0) okp(`[${prof.name}] bonfire REST EXCLUDED: 0ms accrued during 3s of rest ticks`);
  else badp(`[${prof.name}] rest NOT excluded: +${A.restDelta}ms during rest`);
  if (A.hitDelta === 1) okp(`[${prof.name}] HIT counter: real damageHero ⇒ hitsReceived +1`);
  else badp(`[${prof.name}] hit counter wrong: +${A.hitDelta}`);

  // (6)-(7) Deterministic SCORE + gauntletComplete → recap overlay (screenshot the painted recap).
  const B = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const { dev } = s;
    const out = {};
    // Pin telemetry for a deterministic score/record assertion (a real prior best to prove Δ + NEW RECORD).
    // Records must be staged BEFORE brStart — startBossRush snapshots prevBest*=best* at run start (the recap Δ baseline).
    dev.brSetRecords(60000, 40000);   // prev best: time 60s, score 40000
    dev.brStart();                    // snapshots prevBestTimeMs=60000/prevBestScore=40000 + resets combat/hits
    dev.brStage(42000, 0);            // 42s combat, impeccable (0 hits) ⇒ clean bonus
    const done = dev.brComplete();
    out.scene = done.scene;
    out.lastScore = done.lastScore; out.lastTimeMs = done.lastTimeMs;
    out.newTimeRecord = done.newTimeRecord; out.newScoreRecord = done.newScoreRecord;
    out.prevBestTimeMs = done.prevBestTimeMs; out.prevBestScore = done.prevBestScore;
    out.bestTimeMs = done.bestTimeMs; out.bestScore = done.bestScore;
    out.recap = done.recap ? { ...done.recap } : null;
    return out;
  }, BASE);
  await page.screenshot({ path: `${OUT}/${prof.name}-recap.png` });

  const expScore = scoreOracle(42000, 0, K); // 100000 - 4200 + 10000 = 105800
  if (B.scene === "bossRushRecap") okp(`[${prof.name}] gauntletComplete(armed) → scene 'bossRushRecap' (results overlay live)`);
  else badp(`[${prof.name}] recap scene wrong: ${B.scene}`);
  if (B.lastScore === expScore) okp(`[${prof.name}] SCORE deterministic == oracle: ${B.lastScore} (base ${K.scoreBase} − ${Math.round(42*K.scoreTimeW)} time + ${K.scoreCleanBonus} clean), 0 RNG`);
  else badp(`[${prof.name}] SCORE wrong: sim=${B.lastScore} oracle=${expScore}`);
  if (B.lastTimeMs === 42000) okp(`[${prof.name}] total time reported: ${B.lastTimeMs}ms`);
  else badp(`[${prof.name}] total time wrong: ${B.lastTimeMs}`);
  if (B.newTimeRecord === true && B.newScoreRecord === true && B.prevBestTimeMs === 60000 && B.prevBestScore === 40000)
    okp(`[${prof.name}] NEW RECORD on beat: time 60000→${B.bestTimeMs}, score 40000→${B.bestScore} (Δ vs prev best shown)`);
  else badp(`[${prof.name}] record/Δ wrong: newT=${B.newTimeRecord} newS=${B.newScoreRecord} prevT=${B.prevBestTimeMs} prevS=${B.prevBestScore}`);

  // (8) RECORDS persist in localStorage across a REAL page reload.
  const beforeReload = await page.evaluate(async (base) => {
    const persist = await import(base + "persist.js");
    persist.saveBossRush();
    return localStorage.getItem("mithralda.bossrush.v1");
  }, BASE);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const afterReload = await page.evaluate(async (base) => {
    const s = await import(base + "sim/sim.js");
    const raw = localStorage.getItem("mithralda.bossrush.v1");
    // bootBossRush ran on load ⇒ records already loaded into G.bossRush regardless of the DARK flag (forward-compat).
    const st = s.dev.brState();
    return { raw, bestTimeMs: st.bestTimeMs, bestScore: st.bestScore, ta: st.timeAttack };
  }, BASE);
  const savedBlob = JSON.parse(beforeReload || "{}");
  const reloadBlob = JSON.parse(afterReload.raw || "{}");
  if (afterReload.raw && afterReload.raw === beforeReload && reloadBlob.bestTimeMs === savedBlob.bestTimeMs && reloadBlob.bestScore === savedBlob.bestScore)
    okp(`[${prof.name}] RECORDS persist ACROSS RELOAD: mithralda.bossrush.v1=${afterReload.raw} survived reload`);
  else badp(`[${prof.name}] persist wrong: before=${beforeReload} after=${afterReload.raw}`);
  if (afterReload.ta === true && afterReload.bestTimeMs === savedBlob.bestTimeMs && afterReload.bestScore === savedBlob.bestScore)
    okp(`[${prof.name}] bootBossRush loads records forward on LIVE (timeAttack:true): best time ${afterReload.bestTimeMs} / score ${afterReload.bestScore}`);
  else badp(`[${prof.name}] boot-load wrong: ta=${afterReload.ta} t=${afterReload.bestTimeMs} s=${afterReload.bestScore}`);

  // (9) Sub-flags gate each piece + timeAttack off → menu verbatim + save collapses to HEAD shape.
  const C = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const { dev } = s;
    const out = {};
    c.BOSS_RUSH.timeAttack = true;
    // showTimer/showScore gate DISPLAY only — score still COMPUTES.
    c.BOSS_RUSH.showTimer = false; c.BOSS_RUSH.showScore = false;
    out.stFlag = dev.brState().showTimer; out.ssFlag = dev.brState().showScore;
    dev.brSetRecords(0, 0); dev.brStage(50000, 3); const withScoreOff = dev.brComplete();
    out.scoreStillComputes = withScoreOff.lastScore;   // > 0 even with showScore off
    out.armedSerializeKeys = Object.keys(dev.brSerialize()).sort().join(",");
    c.BOSS_RUSH.showTimer = true; c.BOSS_RUSH.showScore = true;

    // MASTER off — gauntletComplete returns to 'menu' verbatim, serialize collapses to HEAD shape.
    c.BOSS_RUSH.timeAttack = false;
    out.offSerializeKeys = Object.keys(dev.brSerialize()).sort().join(",");
    dev.brStart(); dev.brStage(30000, 2); const offDone = dev.brComplete();
    out.offCompleteScene = offDone.scene;
    // OFF path never CALLS bossRushScoreComplete ⇒ no fresh recap. (G.bossRushRecap may still hold a STALE armed recap
    // from earlier THIS session — impossible in a real DARK build, so assert the OFF run produced nothing of its own.)
    out.offRecapIsFresh = !!(offDone.recap && offDone.recap.timeMs === 30000);

    c.BOSS_RUSH.timeAttack = false; // restore DARK for next profile
    return out;
  }, BASE);
  const expOff = scoreOracle(50000, 3, K); // 100000 - 5000 - 750 = 94250
  if (C.stFlag === false && C.ssFlag === false && C.scoreStillComputes === expOff)
    okp(`[${prof.name}] SUB-FLAGS gate DISPLAY only: showTimer/showScore off, score STILL computes (${C.scoreStillComputes}==oracle)`);
  else badp(`[${prof.name}] sub-flag gating wrong: st=${C.stFlag} ss=${C.ssFlag} score=${C.scoreStillComputes} exp=${expOff}`);
  if (C.armedSerializeKeys === "bestRound,bestScore,bestTimeMs,v") okp(`[${prof.name}] armed serialize carries records (${C.armedSerializeKeys})`);
  else badp(`[${prof.name}] armed serialize keys wrong: ${C.armedSerializeKeys}`);
  if (C.offCompleteScene === "menu" && C.offRecapIsFresh === false)
    okp(`[${prof.name}] timeAttack OFF → gauntletComplete returns to 'menu' verbatim, no fresh recap (HEAD path)`);
  else badp(`[${prof.name}] OFF path wrong: scene=${C.offCompleteScene} freshRecap=${C.offRecapIsFresh}`);
  if (C.offSerializeKeys === "bestRound,v") okp(`[${prof.name}] OFF serialize collapses to HEAD shape {v,bestRound} (save byte-id)`);
  else badp(`[${prof.name}] OFF serialize wrong: ${C.offSerializeKeys}`);

  if (infra5xx.length) console.log(`  · [${prof.name}] ${infra5xx.length} transient CDN 5xx/net flake(s) (infra, ignored): ${JSON.stringify(infra5xx.slice(0, 3))}`);
  if (errors.length === 0) okp(`[${prof.name}] boot+play+drive+reload: 0 game-JS errors`);
  else badp(`[${prof.name}] ${errors.length} game-JS error(s): ${JSON.stringify(errors.slice(0, 5))}`);
  await page.close();
  await ctx.close();
}

await browser.close();
console.log(anyFail ? "\nCAS-2058 BOSS RUSH TIME-ATTACK LIVE OBSERVABLE SMOKE — FAIL ✖" : "\nCAS-2058 BOSS RUSH TIME-ATTACK LIVE OBSERVABLE SMOKE — PASS ✓");
if (anyFail) process.exit(1);
