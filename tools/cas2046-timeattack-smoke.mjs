// CAS-2049 (umbrella CAS-2046) — QA OBSERVABLE smoke: BOSS RUSH TIME-ATTACK + SCORE + RECORDS, served DARK build.
// Browser complement to the node build harness tools/cas2047-timeattack.mjs. Clone of cas2038-recap-smoke.mjs.
// Lesson CAS-1947: DRIVE the real sim/render loop against the SERVED bytes, don't only assert md5.
// The layer ships DARK (BOSS_RUSH.timeAttack:false); QA arms it at RUNTIME by importing the live sim/config.js
// ES-module singleton (the SAME instance game.js loaded — same module URL ⇒ same object) and flipping
// timeAttack=true, then drives the REAL startBossRush / tickBossRush / gauntletComplete → "bossRushRecap" seams.
//
// Per profile (desktop + mobile), PASS×2 by invoking twice (score/timer are 0-RNG ⇒ deterministic):
//   1. BOOT + PLAY: 0 game-JS errors, stable ~60fps.
//   2. DARK reaches browser: served BOSS_RUSH.timeAttack === false (byte-correct dark before arming).
//   3. ARM at runtime: flip the live singleton timeAttack=true → dev.brState().timeAttack:true (proves same object).
//   4. ENTER Boss Rush: dev.brStart() ⇒ bossRushMode true, scene "play", gauntlet armed, sequence 4/4 (order/diff intact).
//   5. TIMER: accrues ACTIVE combat sim dt only — the bonfire rest (resting) is EXCLUDED; per-round split rides it.
//   6. CLEAR 4/4 → gauntletComplete(armed) ⇒ scene "bossRushRecap" with timeMs + roundMs splits + score.
//   7. SCORE: == an INDEPENDENT oracle recomputed from the served scoreBase/timeW/hitW/cleanBonus formula.
//   8. RECORD PERSISTS AFTER RELOAD (THE HOOK): bank a record, saveBossRush()→localStorage, RELOAD the page,
//        boot loads mithralda.bossrush.v1 ⇒ dev.brState().bestTimeMs/bestScore survive the reload.
//   9. DELTA + NEW RECORD: recap prevBest* baseline correct + newTimeRecord/newScoreRecord flags; a WORSE run
//        keeps records intact (no false record) yet still shows the delta baseline.
//  10. SUB-FLAGS: showTimer:false readable; showScore:false ⇒ score still COMPUTES (gates DISPLAY only);
//        timeAttack:false ⇒ gauntletComplete→"menu" (HEAD path) + serialize == {v:1,bestRound} (save byte-id).
//  11. RENDER PAINTS: set live G.scene="bossRushRecap" ⇒ next frame calls renderBossRushRecap on the real canvas;
//        screenshot + assert 0 game-JS errors (the overlay draw path executed cleanly).
// Restores DARK (timeAttack:false, showTimer/showScore:true) at the end so nothing leaks between profiles.
// Run: node tools/cas2046-timeattack-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2046";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const okp = (m) => console.log(`✔ ${m}`);
const badp = (m) => { anyFail = true; console.error(`✖ ${m}`); };

function wireErrors(page) {
  const errors = [];
  const infra5xx = []; // transient gh-pages CDN 5xx / net flakes — infra noise, NOT game-JS defects
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
  return await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 >= 1000) res(n * 1000 / (performance.now() - t0)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, infra5xx } = wireErrors(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  // Clear localStorage ONCE on the very first document; the reload for the persistence test (step 8) must NOT clear.
  await page.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem("__qa_cleared")) { localStorage.clear(); sessionStorage.setItem("__qa_cleared", "1"); } } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });

  // (2) served DARK reaches browser: BOSS_RUSH.timeAttack === false (byte-correct dark before arming).
  const dark = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    return { timeAttack: c.BOSS_RUSH.timeAttack, showTimer: c.BOSS_RUSH.showTimer, showScore: c.BOSS_RUSH.showScore,
      key: c.BOSS_RUSH.key, seqLen: (c.BOSS_RUSH.sequence || []).length,
      base: c.BOSS_RUSH.scoreBase, timeW: c.BOSS_RUSH.scoreTimeW, hitW: c.BOSS_RUSH.scoreHitW, clean: c.BOSS_RUSH.scoreCleanBonus };
  }, BASE);
  if (dark.timeAttack === false) okp(`[${prof.name}] served BOSS_RUSH.timeAttack:false DARK reaches browser (key ${dark.key}, seq ${dark.seqLen}/4)`);
  else badp(`[${prof.name}] served timeAttack should be false DARK, got ${JSON.stringify(dark)}`);

  await enterPlay(page, "CHRONO");
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  const fps = await sampleFps(page);
  if (fps >= 55) okp(`[${prof.name}] fps ${fps.toFixed(1)} (>=55 budget)`);
  else badp(`[${prof.name}] fps ${fps.toFixed(1)} BELOW 55 budget`);

  // (3)-(11 minus reload) DRIVE the real time-attack path against the SERVED singletons. Same module URLs the
  // game loaded ⇒ same singleton objects (config.BOSS_RUSH + sim.dev/G). Arm timeAttack, enter Boss Rush, run the
  // timer, clear 4/4, score, sub-flags, then stage the recap overlay for the RENDER-PAINTS check.
  const R = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const { dev, G } = s;
    const BR = c.BOSS_RUSH;
    const out = {};

    // Independent oracle mirroring bossRushScoreComplete — recomputed from the SERVED config, NOT the helper under test.
    const scoreOracle = (combatMs, hits) => {
      const sec = Math.round(combatMs) / 1000;
      const clean = (hits === 0) ? (BR.scoreCleanBonus | 0) : 0;
      return Math.max(0, (BR.scoreBase | 0) - Math.round(sec * (BR.scoreTimeW | 0)) - hits * (BR.scoreHitW | 0) + clean);
    };

    // (3) ARM — flip the master flag on the live singleton. dev.brState().timeAttack:true ⇒ SAME object.
    BR.timeAttack = true;
    out.armed = dev.brState().timeAttack;
    out.seqLen = (BR.sequence || []).length;

    // (4) ENTER Boss Rush through the REAL startBossRush.
    const st0 = dev.brStart();
    out.enter = { mode: st0.bossRushMode, scene: st0.scene, round: st0.round, combatMs: st0.combatMs };

    // (5) TIMER: rest EXCLUDED, active combat accrues; per-round split rides combatMs.
    dev.brStart();
    dev.brSetResting(true);  dev.brTick(2.0);      // bonfire — must NOT accrue
    const restAccrued = dev.brState().combatMs;
    dev.brSetResting(false); dev.brTick(1.5);      // active — accrues 1500ms into the current split
    const t = dev.brState();
    out.timer = { restAccrued, combatMs: t.combatMs, splitSum: (t.roundMs || []).reduce((a, m) => a + (m | 0), 0), roundMs: t.roundMs };

    // (6)+(7) CLEAR 4/4 → recap scene + score == oracle.
    dev.brStart(); dev.brStage(42000, 0);
    const done = dev.brComplete();
    out.clear = { scene: done.scene, recap: done.recap, oracle: scoreOracle(42000, 0) };

    // (9) DELTA + NEW RECORD flags (baseline snapshot) + not-beaten leaves records intact.
    dev.brSetRecords(60000, 40000);
    dev.brStart(); dev.brStage(45000, 2);          // slower than 60s? faster ⇒ time record; score vs 40000
    const rc9 = dev.brComplete().recap;
    out.delta = { prevBestTimeMs: rc9.prevBestTimeMs, prevBestScore: rc9.prevBestScore, timeMs: rc9.timeMs,
      newTimeRecord: rc9.newTimeRecord, newScoreRecord: rc9.newScoreRecord, score: rc9.score, oracle45: scoreOracle(45000, 2) };
    // worse run vs a strong PB ⇒ no new record, records intact
    dev.brSetRecords(30000, 999999);
    dev.brStart(); dev.brStage(90000, 8);
    const rc9b = dev.brComplete().recap;
    const s9b = dev.brState();
    out.notBeaten = { newTimeRecord: rc9b.newTimeRecord, newScoreRecord: rc9b.newScoreRecord, bestTimeMs: s9b.bestTimeMs, bestScore: s9b.bestScore };

    // (10) SUB-FLAGS: showTimer readable; showScore off ⇒ score still computes; timeAttack:false ⇒ menu + byte-id save.
    BR.showTimer = false; BR.showScore = false;
    const sf = dev.brState();
    dev.brStart(); dev.brStage(42000, 0);
    const rcScoreOff = dev.brComplete().recap;
    out.subflags = { showTimer: sf.showTimer, showScore: sf.showScore, scoreWithDisplayOff: rcScoreOff && rcScoreOff.score, oracle: scoreOracle(42000, 0) };
    BR.showTimer = true; BR.showScore = true;
    // timeAttack:false ⇒ gauntletComplete → "menu" (HEAD path) + serialize byte-id {v:1,bestRound}
    BR.timeAttack = false;
    dev.brStart(); dev.brStage(42000, 0);
    const off = dev.brComplete();
    out.offMenu = off.scene;
    out.offSerialize = dev.brSerialize();
    BR.timeAttack = true;

    // (8-prep) bank a KNOWN record and persist it to localStorage for the reload test.
    dev.brSetRecords(0, 0);
    dev.brStart(); dev.brStage(37500, 0);          // 37.5s clean ⇒ first-ever record, both banked
    const rcRec = dev.brComplete().recap;
    const p = await import(base + "persist.js");
    const saved = p.saveBossRush();                // write mithralda.bossrush.v1
    let rawBlob = null; try { rawBlob = localStorage.getItem("mithralda.bossrush.v1"); } catch (e) {}
    out.persistPrep = { saved, rawBlob, bankedTimeMs: rcRec.timeMs, bankedScore: rcRec.score,
      liveBestTimeMs: dev.brState().bestTimeMs, liveBestScore: dev.brState().bestScore };

    // stage the recap overlay for the RENDER-PAINTS check (11): re-open a completed recap.
    dev.brStart(); dev.brStage(42000, 0); dev.brComplete();
    out.staged = { scene: dev.brState().scene };
    return out;
  }, BASE);

  // (11) let the live render loop paint renderBossRushRecap on the real canvas, then screenshot.
  await wait(250);
  const paintedScene = await page.evaluate(async (base) => (await import(base + "sim/sim.js")).G.scene, BASE);
  await page.screenshot({ path: `${OUT}/${prof.name}-recap.png` });

  // (8) RELOAD and prove the record survives the reload (boot loads mithralda.bossrush.v1 under the DARK build).
  await page.reload({ waitUntil: "load" });
  // Boot done (game.js bootBossRush ran) is all we need — a run save from the play session may skip the menu.
  await page.waitForFunction("window.__dev && window.__dev.scene && typeof window.__dev.scene()==='string'", { timeout: 20000 });
  await wait(300);
  const reload = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const { dev } = s;
    let rawBlob = null; try { rawBlob = localStorage.getItem("mithralda.bossrush.v1"); } catch (e) {}
    // config booted DARK again; boot (game.js bootBossRush) already loaded the store into G.bossRush.
    const stBoot = dev.brState();
    return { darkAfterReload: c.BOSS_RUSH.timeAttack, rawBlob,
      bestTimeMs: stBoot.bestTimeMs, bestScore: stBoot.bestScore };
  }, BASE);

  // --- assertions ---
  if (R.armed === true) okp(`[${prof.name}] ARM: live singleton flipped ⇒ brState.timeAttack:true (proves same object)`);
  else badp(`[${prof.name}] ARM failed: timeAttack=${R.armed}`);

  const enterOk = R.enter.mode === true && R.enter.scene === "play" && R.enter.round === 0 && R.seqLen === 4;
  if (enterOk) okp(`[${prof.name}] ENTER Boss Rush: bossRushMode, scene "play", round 0, sequence ${R.seqLen}/4 (order/diff intact)`);
  else badp(`[${prof.name}] ENTER wrong: ${JSON.stringify({ enter: R.enter, seqLen: R.seqLen })}`);

  const timerOk = R.timer.restAccrued === 0 && Math.abs(R.timer.combatMs - 1500) <= 2 && Math.abs(R.timer.splitSum - R.timer.combatMs) <= 2;
  if (timerOk) okp(`[${prof.name}] TIMER: rest EXCLUDED (0ms), active-combat accrues ${R.timer.combatMs}ms, splits Σ=${R.timer.splitSum} (${JSON.stringify(R.timer.roundMs)})`);
  else badp(`[${prof.name}] TIMER wrong: ${JSON.stringify(R.timer)}`);

  const rc = R.clear.recap;
  const clearOk = R.clear.scene === "bossRushRecap" && rc && rc.timeMs === 42000 && Array.isArray(rc.roundMs) && rc.score === R.clear.oracle;
  if (clearOk) okp(`[${prof.name}] CLEAR 4/4 → "bossRushRecap": time ${(rc.timeMs / 1000).toFixed(1)}s, splits ${JSON.stringify(rc.roundMs)}, score ${rc.score} == oracle`);
  else badp(`[${prof.name}] CLEAR/RECAP wrong: scene=${R.clear.scene} recap=${JSON.stringify(rc)} oracle=${R.clear.oracle}`);

  const scoreOk = rc && rc.score === R.clear.oracle;
  if (scoreOk) okp(`[${prof.name}] SCORE deterministic == config oracle (${rc.score})`);
  else badp(`[${prof.name}] SCORE mismatch: got ${rc && rc.score} oracle ${R.clear.oracle}`);

  const d = R.delta;
  const deltaOk = d.prevBestTimeMs === 60000 && d.prevBestScore === 40000 && d.timeMs === 45000 && d.newTimeRecord === true && d.score === d.oracle45;
  if (deltaOk) okp(`[${prof.name}] DELTA baseline prevT=${d.prevBestTimeMs} prevS=${d.prevBestScore}, newTimeRecord=${d.newTimeRecord}, newScoreRecord=${d.newScoreRecord}`);
  else badp(`[${prof.name}] DELTA wrong: ${JSON.stringify(d)}`);

  const nb = R.notBeaten;
  const nbOk = nb.newTimeRecord === false && nb.newScoreRecord === false && nb.bestTimeMs === 30000 && nb.bestScore === 999999;
  if (nbOk) okp(`[${prof.name}] NOT-BEATEN run leaves records intact (no false record): best ${nb.bestTimeMs}ms/${nb.bestScore}`);
  else badp(`[${prof.name}] NOT-BEATEN wrong: ${JSON.stringify(nb)}`);

  const sfOk = R.subflags.showTimer === false && R.subflags.showScore === false && R.subflags.scoreWithDisplayOff === R.subflags.oracle;
  if (sfOk) okp(`[${prof.name}] SUB-FLAGS: showTimer/showScore readable+off; score still COMPUTES (${R.subflags.scoreWithDisplayOff}) — gates DISPLAY only`);
  else badp(`[${prof.name}] SUB-FLAGS wrong: ${JSON.stringify(R.subflags)}`);

  const offKeys = R.offSerialize ? Object.keys(R.offSerialize).sort() : [];
  const offOk = R.offMenu === "menu" && JSON.stringify(offKeys) === JSON.stringify(["bestRound", "v"]);
  if (offOk) okp(`[${prof.name}] OFF (timeAttack:false): gauntletComplete→"menu" (HEAD path) + serialize ${JSON.stringify(R.offSerialize)} == {v:1,bestRound} (save byte-id)`);
  else badp(`[${prof.name}] OFF wrong: scene=${R.offMenu} serialize=${JSON.stringify(R.offSerialize)}`);

  const pp = R.persistPrep;
  const persistPrepOk = pp.saved === true && pp.rawBlob && pp.liveBestTimeMs === 37500 && pp.bankedScore === pp.liveBestScore;
  if (persistPrepOk) okp(`[${prof.name}] RECORD banked+saved: best ${pp.liveBestTimeMs}ms/${pp.liveBestScore}, localStorage written`);
  else badp(`[${prof.name}] RECORD save-prep wrong: ${JSON.stringify(pp)}`);

  const reloadOk = reload.darkAfterReload === false && reload.rawBlob && reload.bestTimeMs === 37500 && reload.bestScore === pp.bankedScore;
  if (reloadOk) okp(`[${prof.name}] RELOAD PERSISTS: after page reload (DARK boot) record survives ⇒ bestTime ${reload.bestTimeMs}ms/score ${reload.bestScore} (store mithralda.bossrush.v1)`);
  else badp(`[${prof.name}] RELOAD PERSIST wrong: ${JSON.stringify(reload)} (expected 37500/${pp.bankedScore})`);

  const renderOk = paintedScene === "bossRushRecap";
  if (renderOk) okp(`[${prof.name}] RENDER PAINTS: live scene "${paintedScene}" ⇒ renderBossRushRecap ran on real canvas (screenshot ${prof.name}-recap.png)`);
  else badp(`[${prof.name}] RENDER scene wrong: ${paintedScene}`);

  // restore DARK exactly as shipped (timeAttack:false; showTimer/showScore true). In-session module only.
  await page.evaluate(async (base) => { const c = await import(base + "sim/config.js"); c.BOSS_RUSH.timeAttack = false; c.BOSS_RUSH.showTimer = true; c.BOSS_RUSH.showScore = true; }, BASE);

  if (infra5xx.length) console.log(`  · [${prof.name}] ${infra5xx.length} transient CDN 5xx/net flake(s) (infra, ignored): ${JSON.stringify(infra5xx.slice(0, 3))}`);
  if (errors.length === 0) okp(`[${prof.name}] boot+play+drive+reload+render: 0 game-JS errors`);
  else badp(`[${prof.name}] ${errors.length} game-JS error(s): ${JSON.stringify(errors.slice(0, 5))}`);
  await page.close();
}

await browser.close();
console.log(anyFail ? "\nCAS-2046 BOSS RUSH TIME-ATTACK OBSERVABLE SMOKE — FAIL ✖" : "\nCAS-2046 BOSS RUSH TIME-ATTACK OBSERVABLE SMOKE — PASS ✓");
if (anyFail) process.exit(1);
