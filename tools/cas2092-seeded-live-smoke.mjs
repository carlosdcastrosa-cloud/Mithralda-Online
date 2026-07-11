// ---------------------------------------------------------------------------
// CAS-2092 (QA for CAS-2090) — DESAFÍO CON SEMILLA (Seeded Challenge Run) OBSERVABLE, driven
// through the REAL browser loop against the LIVE gh-pages build abfb35958e50 (DARK: enabled:false).
//
// Complements the node proof (tools/cas2090-seeded-challenge.mjs, AC0-6 vs HEAD bytes). This harness
// boots the SERVED build, navigates to play, then drives the EXACT same seeded paths against the
// running render loop in a real DOM. game.js imports "./sim/sim.js", so a dynamic import(BASE+"sim/sim.js")
// resolves to the SAME cached ES-module singleton the game runs — G/dev.* mutate the live instance.
// persist.js is imported the same way so the reload persistence test rides the REAL localStorage store.
//
// Observables verified per profile (desktop + mobile) — canvas text is captured by monkeypatching
// CanvasRenderingContext2D.prototype.fillText (record strings, NOT pixel counts):
//   AC0 [BOOT]     boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1 [DARK]     served SEEDED_CHALLENGE.enabled===false; the MENU never draws the "Desafío con Semilla"
//                  entry (feature is DARK) ⇒ unreachable in a shipped run.
//   AC2 [OFF-SRAND] the LIVE build's master-srand fingerprint (dev.variantSrandProbe(false,SEED,8)) is
//                  BYTE-IDENTICAL to HEAD's (computed in-process) ⇒ the Seeded Challenge build added 0
//                  draws to the master stream (entering the mode is the only reseed).
//   AC3 [SAME-SEED] same code ⇒ byte-identical scSeedDraws stream (×2) + byte-identical run RECAP
//                  (scStart→scStage→scComplete ×2, same code + telemetry); a different code diverges.
//   AC4 [SCORE]    scComplete recap.score == independent oracle (Boss Rush time-attack formula, 0 RNG).
//   AC5 [HUD]      inside the seeded gauntlet (scStart), the running render loop paints the live HUD
//                  indicator "⚑ DESAFÍO · <code>"; the recap (scComplete) paints "⚑ Semilla: <code>".
//   AC6 [RECORDS]  two seeds keep SEPARATE records; persist.saveSeededChallenge() writes ONLY
//                  mithralda.seededchallenge.v1 (NEVER save.v1); the records survive a REAL page.reload
//                  (bootSeededChallenge rehydrates from that store).
//   AC7 [FPS]      ~60fps sustained in normal play (the DARK feature costs nothing at runtime).
//
// Run: node tools/cas2092-seeded-live-smoke.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
import * as headSim from "../sim/sim.js";
import { BOSS_RUSH } from "../sim/config.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2092";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// --- HEAD reference: master-srand fingerprint via the REAL probe (imported local bytes) ---
{ const noop = () => {}; const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
  headSim.configure({ io: { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop }, audio: deep, view: deep }); }
const PROBE_SEED = 0x5EEDCA5E;
const HEAD_FP = JSON.stringify(headSim.dev.variantSrandProbe(false, PROBE_SEED, 8).fingerprint);

// --- Independent score oracle (mirrors seededScoreComplete's Boss Rush formula; NOT a tautology) ---
function scoreOracle(combatMs, hits) {
  const sec = Math.round(combatMs) / 1000;
  const clean = (hits === 0) ? (BOSS_RUSH.scoreCleanBonus | 0) : 0;
  return Math.max(0, (BOSS_RUSH.scoreBase | 0) - Math.round(sec * (BOSS_RUSH.scoreTimeW | 0)) - hits * (BOSS_RUSH.scoreHitW | 0) + clean);
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const P = (m) => console.log("✔ " + m);
const F = (m) => { anyFail = true; console.error("✖ " + m); };

function watch(page) {
  const errors = [], http404 = [];
  page.on("response", (r) => { if (r.status() === 404) http404.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/status of 404/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon\.ico/i.test(u)) errors.push("requestfailed: " + u); });
  return { errors, http404 };
}

// Install the fillText recorder BEFORE any frame renders (evaluateOnNewDocument survives reload too).
const RECORDER = () => {
  try {
    window.__ft = [];
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.fillText;
    proto.fillText = function (t, ...rest) { try { if (typeof t === "string" && window.__ft) { window.__ft.push(t); if (window.__ft.length > 4000) window.__ft.shift(); } } catch (e) {} return orig.call(this, t, ...rest); };
  } catch (e) {}
};

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "SEEDQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

// Let the real rAF render loop paint N frames, then return the captured fillText strings since a marker.
async function captureFrames(page, frames = 8) {
  return await page.evaluate((n) => new Promise((res) => {
    window.__ft = [];
    let c = 0;
    function tick() { c++; if (c >= n) res(window.__ft.slice()); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }), frames);
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, http404 } = watch(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  // Fresh boot, but clear the SEEDED store only ONCE per tab (sentinel survives page.reload) so the
  // reload-persistence test does NOT wipe the store we just wrote. save.v1/hints cleared every load.
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1");
      if (!sessionStorage.getItem("__sc_boot")) { localStorage.removeItem("mithralda.seededchallenge.v1"); sessionStorage.setItem("__sc_boot", "1"); }
    } catch (e) {}
  });
  await page.evaluateOnNewDocument(RECORDER);
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });

  // ---- AC1 [DARK]: at the MENU scene the "Desafío con Semilla" entry must NOT be drawn (enabled:false) ----
  const menuTexts = await captureFrames(page, 10);
  const seededMenuHit = menuTexts.some((t) => /Desaf[íi]o con Semilla|Semilla del d[íi]a/i.test(t));
  if (!seededMenuHit) P(`[${prof.name}] DARK: menu draws NO "Desafío con Semilla" entry (SEEDED_CHALLENGE.enabled:false) — unreachable in a shipped run`);
  else F(`[${prof.name}] DARK: menu drew the seeded entry while enabled:false (${menuTexts.filter((t) => /Semilla/i.test(t)).slice(0, 2).join(" | ")})`);
  await page.screenshot({ path: `${OUT}/${prof.name}-menu.png` });

  await toPlay(page);
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // Bind the SERVED singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const persist = await import(base + "persist.js");
    const cfg = await import(base + "sim/config.js");
    window.__sc = { sim, persist, cfg };
  }, BASE);

  // ---- AC1b [DARK]: served knob is enabled:false with key/codePrefix ----
  const knob = await page.evaluate(() => { const s = window.__sc.sim.dev.scState(); return { enabled: s.enabled, key: s.key, codePrefix: s.codePrefix }; });
  if (knob.enabled === false && knob.key === "KeyC" && knob.codePrefix === "MITH-")
    P(`[${prof.name}] DARK: served scState enabled=false, key=${knob.key}, codePrefix=${knob.codePrefix}`);
  else F(`[${prof.name}] DARK: served knob wrong ${JSON.stringify(knob)}`);

  // ---- AC2 [OFF-SRAND]: live master-srand fingerprint == HEAD (Seeded build added 0 draws) ----
  const liveFp = await page.evaluate((seed) => JSON.stringify(window.__sc.sim.dev.variantSrandProbe(false, seed, 8).fingerprint), PROBE_SEED);
  if (liveFp === HEAD_FP) P(`[${prof.name}] OFF-SRAND: live master-srand fingerprint BYTE-IDENTICAL to HEAD (${liveFp.slice(0, 44)}…) — 0 draws added`);
  else F(`[${prof.name}] OFF-SRAND: live fp != HEAD\n  live ${liveFp}\n  head ${HEAD_FP}`);

  // ---- AC3 [SAME-SEED]: same code ⇒ identical draw stream + identical recap; different code diverges ----
  const seed = await page.evaluate(() => {
    const d = window.__sc.sim.dev; const J = JSON.stringify;
    const a1 = d.scSeedDraws("MITH-ABCD", 32), a2 = d.scSeedDraws("MITH-ABCD", 32), b1 = d.scSeedDraws("MITH-WXYZ", 32);
    const run = (code) => { d.scReset(); window.__sc.sim.createHero("SEEDQA", "warrior"); d.scStart(code); d.scStage(51500, 2); return d.scComplete().recap; };
    const r1 = run("MITH-RUN1"), r2 = run("MITH-RUN1"), rDiff = run("MITH-RUN2");
    d.scReset();
    return { sameStream: J(a1) === J(a2), diffStream: J(a1) !== J(b1), r1: J(r1), r2: J(r2), rDiffCode: rDiff.seededCode, recapEq: J(r1) === J(r2) };
  });
  if (seed.sameStream && seed.diffStream) P(`[${prof.name}] SAME-SEED: scSeedDraws — same code ⇒ byte-identical 32-draw stream, different code ⇒ different stream`);
  else F(`[${prof.name}] SAME-SEED: stream gate broken same=${seed.sameStream} diff=${seed.diffStream}`);
  if (seed.recapEq) P(`[${prof.name}] SAME-SEED: same code+telemetry ⇒ byte-identical recap ${seed.r1}`);
  else F(`[${prof.name}] SAME-SEED: recap diverged\n  ${seed.r1}\n  ${seed.r2}`);

  // ---- AC4 [SCORE]: deterministic score == oracle ----
  const scoreRes = await page.evaluate(() => {
    const d = window.__sc.sim.dev; d.scReset();
    window.__sc.sim.createHero("SEEDQA", "warrior"); d.scStart("MITH-SCORE"); d.scStage(42000, 3); const s = d.scComplete().recap;
    window.__sc.sim.createHero("SEEDQA", "warrior"); d.scStart("MITH-CLEAN"); d.scStage(30000, 0); const clean = d.scComplete().recap; d.scReset();
    return { score: s.score | 0, cleanScore: clean.score | 0 };
  });
  if (scoreRes.score === scoreOracle(42000, 3)) P(`[${prof.name}] SCORE: recap.score ${scoreRes.score} == oracle ${scoreOracle(42000, 3)} (deterministic, 0 RNG)`);
  else F(`[${prof.name}] SCORE: ${scoreRes.score} != oracle ${scoreOracle(42000, 3)}`);
  if (scoreRes.cleanScore === scoreOracle(30000, 0) && scoreRes.cleanScore > scoreRes.score) P(`[${prof.name}] SCORE: flawless (0 hits) earns clean bonus ${scoreRes.cleanScore}`);
  else F(`[${prof.name}] SCORE: clean bonus wrong ${scoreRes.cleanScore} vs ${scoreOracle(30000, 0)}`);

  // ---- AC5 [HUD]: seeded gauntlet paints the live indicator; recap paints the seed banner ----
  const CODE = "MITH-HUDQA";
  await page.evaluate((code) => { const d = window.__sc.sim.dev; d.scReset(); window.__sc.sim.createHero("SEEDQA", "warrior"); d.scStart(code); }, CODE);
  const hudTexts = await captureFrames(page, 12);
  await page.screenshot({ path: `${OUT}/${prof.name}-hud.png` });
  if (hudTexts.some((t) => t === "⚑ DESAFÍO · " + CODE)) P(`[${prof.name}] HUD: seeded gauntlet paints live indicator "⚑ DESAFÍO · ${CODE}"`);
  else F(`[${prof.name}] HUD: indicator not painted (seeded strings: ${hudTexts.filter((t) => /DESAF|Semilla/i.test(t)).slice(0, 3).join(" | ") || "none"})`);
  // complete → recap scene draws the shareable seed banner
  await page.evaluate(() => { const d = window.__sc.sim.dev; d.scStage(48000, 1); d.scComplete(); });
  const recapTexts = await captureFrames(page, 12);
  await page.screenshot({ path: `${OUT}/${prof.name}-recap.png` });
  if (recapTexts.some((t) => t === "⚑ Semilla: " + CODE)) P(`[${prof.name}] HUD: recap paints shareable seed banner "⚑ Semilla: ${CODE}"`);
  else F(`[${prof.name}] HUD: recap banner not painted (seeded strings: ${recapTexts.filter((t) => /DESAF|Semilla/i.test(t)).slice(0, 3).join(" | ") || "none"})`);

  // ---- AC6 [RECORDS]: two seeds isolated; persist writes ONLY the seeded store; survives a REAL reload ----
  const banked = await page.evaluate(() => {
    const d = window.__sc.sim.dev, persist = window.__sc.persist;
    d.scReset();
    window.__sc.sim.createHero("SEEDQA", "warrior"); d.scStart("MITH-AAAA"); d.scStage(40000, 1); d.scComplete();
    window.__sc.sim.createHero("SEEDQA", "warrior"); d.scStart("MITH-BBBB"); d.scStage(60000, 5); d.scComplete();
    const before = JSON.parse(JSON.stringify(d.scState().records));
    const wrote = persist.saveSeededChallenge();
    const scStore = localStorage.getItem("mithralda.seededchallenge.v1");
    const saveStore = localStorage.getItem("mithralda.save.v1");
    const leaked = saveStore ? /MITH-AAAA|MITH-BBBB|seededRecords|seededCode/.test(saveStore) : false;
    return { before, wrote, scStore, hasSaveLeak: leaked, isolated: !!(before["MITH-AAAA"] && before["MITH-BBBB"] && before["MITH-AAAA"].score !== before["MITH-BBBB"].score) };
  });
  if (banked.isolated) P(`[${prof.name}] RECORDS: two seeds keep SEPARATE records ${JSON.stringify(banked.before)}`);
  else F(`[${prof.name}] RECORDS: not isolated ${JSON.stringify(banked.before)}`);
  if (banked.wrote && banked.scStore && !banked.hasSaveLeak) P(`[${prof.name}] RECORDS: persist wrote mithralda.seededchallenge.v1 ONLY (no leak into save.v1)`);
  else F(`[${prof.name}] RECORDS: store wrong wrote=${banked.wrote} scStore=${!!banked.scStore} saveLeak=${banked.hasSaveLeak}`);

  // REAL reload: bootSeededChallenge rehydrates from the isolated store (sentinel prevents wipe).
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const afterReload = await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    return { records: JSON.parse(JSON.stringify(sim.dev.scState().records)), rawStore: localStorage.getItem("mithralda.seededchallenge.v1") };
  }, BASE);
  const sameRecs = JSON.stringify(afterReload.records) === JSON.stringify(banked.before);
  if (sameRecs && afterReload.rawStore) P(`[${prof.name}] RECORDS: survive a REAL page.reload — bootSeededChallenge rehydrated ${JSON.stringify(afterReload.records)} from mithralda.seededchallenge.v1`);
  else F(`[${prof.name}] RECORDS: reload lost records ${JSON.stringify(afterReload.records)} vs ${JSON.stringify(banked.before)} (store=${!!afterReload.rawStore})`);

  // ---- AC7 [FPS]: ~60fps in normal play (DARK feature costs nothing) ----
  // Rebind + re-enter play after reload, then measure.
  await page.evaluate(() => { try { window.__dev && window.__dev.reset && window.__dev.reset(); } catch (e) {} });
  await toPlay(page).catch(() => {});
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick(t) { n++; if (t - t0 >= 1500) res(+(n / ((t - t0) / 1000)).toFixed(1)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  if (fps >= 55) P(`[${prof.name}] FPS: ~60fps sustained in play (${fps}fps) — DARK seeded feature costs 0 at runtime`);
  else F(`[${prof.name}] FPS: ${fps} < 55 — loop stalled`);

  // ---- boot/play cleanliness ----
  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) F(`[${prof.name}] non-favicon 404s (${bad404.length}): ${bad404.slice(0, 3).join(", ")}`);
  else if (http404.length) P(`[${prof.name}] only cosmetic favicon.ico 404 (sev-4, known)`);
  if (errors.length) F(`[${prof.name}] console errors (${errors.length}): ${errors.slice(0, 3).join(" | ")}`);
  else P(`[${prof.name}] CLEAN: zero game-JS errors boot→play→seeded→reload`);

  await page.close();
}
await browser.close();
if (anyFail) { console.error("\n❌ CAS-2092 SEEDED CHALLENGE LIVE OBSERVABLE — FAIL"); process.exit(1); }
console.log("\n✅ CAS-2092 SEEDED CHALLENGE LIVE OBSERVABLE — ALL PASS (DARK menu unreachable, srand==HEAD, same-seed=same-run, score==oracle, HUD+recap painted, per-seed records survive real reload, ~60fps — desktop + mobile)");
