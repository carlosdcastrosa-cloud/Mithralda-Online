// ---------------------------------------------------------------------------
// CAS-2095 (QA for CAS-2090 post-flip CAS-2093 GO) — DESAFÍO CON SEMILLA (Seeded Challenge Run)
// LIVE END-TO-END OBSERVABLE against the SERVED gh-pages build d06698422a9b (799 files),
// now with SEEDED_CHALLENGE.enabled:TRUE (config md5 ae2c88e1; the 5 behavior blobs
// sim/render/game/input/persist are byte-identical to CAS-2092 QA-proven).
//
// Where CAS-2092 forced the DARK build's mode via dynamic-import (enabled:false ⇒ menu entry NEVER
// drawn, entered only through dev.*), THIS harness proves the REAL SHIPPED PATH a player takes now
// that the flip is live: the menu entry is DRAWN, and pressing KeyC (desktop) / tapping the entry
// (mobile) actually enters the seeded gauntlet using the SEED OF THE DAY, driven through the running
// render loop in a real DOM. game.js imports "./sim/sim.js" / "./input.js" / "./persist.js", so a
// dynamic import(BASE+...) resolves to the SAME cached ES-module singletons the game runs.
//
// Canvas text is captured by monkeypatching CanvasRenderingContext2D.prototype.fillText (record
// STRINGS, not pixel counts). Observables per profile (desktop + mobile):
//   AC0  [BOOT]      boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1  [LIVE-MENU] enabled:true ⇒ the MENU now DRAWS the "Desafío con Semilla" entry (reachable).
//   AC1b [LIVE-KNOB] served SEEDED_CHALLENGE.enabled===true, key=KeyC, codePrefix=MITH-.
//   AC2  [OFF-SRAND] a NORMAL run's master-srand fingerprint (dev.variantSrandProbe(false,SEED,8)) is
//                    BYTE-IDENTICAL to HEAD's ⇒ the flip added 0 draws to the master stream (entering
//                    the mode is still the only reseed).
//   AC3  [DAILY]     seededDailyCode == "MITH-"+YYYYMMDD (pure fn), and the seed of the day is stable.
//   AC4  [ENTRY]     REAL end-to-end: KeyC(desktop)/tap(mobile) from the menu ⇒ classsel ⇒ play; the
//                    active run's seededCode == the day's code; the running HUD paints "⚑ DESAFÍO · <code>".
//   AC5  [NO-COLLIDE] KeyC is scene-contextual: in classsel it opens Personalizar (customize), NOT the
//                    seeded entry, and the stashed seeded state survives ⇒ no play/combat collision.
//   AC6  [RECAP]     completing the active seeded run paints the shareable recap banner "⚑ Semilla: <code>".
//   AC7  [SAME-SEED] same code ⇒ byte-identical scSeedDraws stream + byte-identical recap; diff code diverges.
//   AC8  [SCORE]     scComplete recap.score == independent oracle (Boss Rush time-attack formula, 0 RNG).
//   AC9  [RECORDS]   two seeds keep SEPARATE records; persist writes ONLY mithralda.seededchallenge.v1
//                    (never save.v1); records survive a REAL page.reload.
//   AC10 [FPS]       ~60fps sustained in normal play (the live feature costs nothing at runtime).
//
// Run: node tools/cas2095-seeded-live-enabled.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
import * as headSim from "../sim/sim.js";
import { BOSS_RUSH } from "../sim/config.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2095";
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
  { name: "desktop", entry: "key", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  entry: "tap", vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
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

// Let the real rAF render loop paint N frames, then return the captured fillText strings since a marker.
async function captureFrames(page, frames = 8) {
  return await page.evaluate((n) => new Promise((res) => {
    window.__ft = [];
    let c = 0;
    function tick() { c++; if (c >= n) res(window.__ft.slice()); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }), frames);
}

// Advance classsel → play (handles the optional customize/abilitysel scenes).
async function classToPlay(page) {
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
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });

  // ---- AC1 [LIVE-MENU]: enabled:true ⇒ the MENU now DRAWS the "Desafío con Semilla" entry ----
  const menuTexts = await captureFrames(page, 12);
  const seededMenuHit = menuTexts.some((t) => /Desaf[íi]o con Semilla/i.test(t));
  const dailyHint = menuTexts.some((t) => /Semilla del d[íi]a/i.test(t));
  if (seededMenuHit && dailyHint) P(`[${prof.name}] LIVE-MENU: enabled:true ⇒ menu DRAWS "Desafío con Semilla" + "Semilla del día…" entry (reachable in a shipped run)`);
  else F(`[${prof.name}] LIVE-MENU: seeded menu entry NOT drawn (seededHit=${seededMenuHit} dailyHint=${dailyHint}; seeded strings: ${menuTexts.filter((t) => /Semilla/i.test(t)).slice(0, 3).join(" | ") || "none"})`);
  await page.screenshot({ path: `${OUT}/${prof.name}-menu.png` });

  // Bind the SERVED singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const persist = await import(base + "persist.js");
    const cfg = await import(base + "sim/config.js");
    const input = await import(base + "input.js");
    window.__sc = { sim, persist, cfg, input };
  }, BASE);

  // ---- AC1b [LIVE-KNOB]: served knob is enabled:true with key/codePrefix ----
  const knob = await page.evaluate(() => { const s = window.__sc.sim.dev.scState(); return { enabled: s.enabled, key: s.key, codePrefix: s.codePrefix }; });
  if (knob.enabled === true && knob.key === "KeyC" && knob.codePrefix === "MITH-")
    P(`[${prof.name}] LIVE-KNOB: served scState enabled=true, key=${knob.key}, codePrefix=${knob.codePrefix}`);
  else F(`[${prof.name}] LIVE-KNOB: served knob wrong ${JSON.stringify(knob)}`);

  // ---- AC2 [OFF-SRAND]: a NORMAL run's master-srand fingerprint == HEAD (flip added 0 draws) ----
  const liveFp = await page.evaluate((seed) => JSON.stringify(window.__sc.sim.dev.variantSrandProbe(false, seed, 8).fingerprint), PROBE_SEED);
  if (liveFp === HEAD_FP) P(`[${prof.name}] OFF-SRAND: normal-run master-srand fingerprint BYTE-IDENTICAL to HEAD (${liveFp.slice(0, 44)}…) — flip added 0 draws`);
  else F(`[${prof.name}] OFF-SRAND: live fp != HEAD\n  live ${liveFp}\n  head ${HEAD_FP}`);

  // ---- AC3 [DAILY]: seed of the day == "MITH-"+YYYYMMDD (pure fn) ----
  const daily = await page.evaluate(() => {
    const dt = new Date();
    const ds = "" + dt.getFullYear() + String(dt.getMonth() + 1).padStart(2, "0") + String(dt.getDate()).padStart(2, "0");
    const expected = "MITH-" + ds;
    const pure = window.__sc.sim.dev.scDailyCode(ds);
    return { ds, expected, pure, ok: pure === expected };
  });
  if (daily.ok) P(`[${prof.name}] DAILY: seededDailyCode(${daily.ds}) == ${daily.expected} (codePrefix + YYYYMMDD; same calendar day ⇒ same code ⇒ same run)`);
  else F(`[${prof.name}] DAILY: scDailyCode ${daily.pure} != ${daily.expected}`);

  // ---- AC4 [ENTRY]: REAL end-to-end — KeyC(desktop)/tap(mobile) from menu ⇒ classsel ⇒ play, using the day's code ----
  await page.evaluate(() => { const n = document.getElementById("nameInput"); n.value = "SEEDQA"; n.blur(); }); // blur ⇒ KeyC not swallowed by the input-focus guard
  if (prof.entry === "key") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c", bubbles: true })));
  } else {
    // real pointerdown on the canvas at the drawn menuSeededRect center (the game's own hit-test)
    const tapped = await page.evaluate(() => {
      const r = window.__sc.input.ui.menuSeededRect;
      if (!r || !r.w) return { ok: false, r };
      const canvas = document.querySelector("canvas");
      const b = canvas.getBoundingClientRect();
      const cx = b.left + r.x + r.w / 2, cy = b.top + r.y + r.h / 2;
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, isPrimary: true }));
      return { ok: true, r, cx, cy };
    });
    if (!tapped.ok) F(`[${prof.name}] ENTRY: menuSeededRect not drawn/hittable ${JSON.stringify(tapped.r)}`);
  }
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 6000 }).catch(() => {});
  const atClasssel = await page.evaluate(() => ({ scene: window.__dev.scene(), seededCode: window.__sc.sim.dev.scState().seededCode }));
  const entryCode = "MITH-" + daily.ds;
  if (atClasssel.scene === "classsel" && atClasssel.seededCode === entryCode)
    P(`[${prof.name}] ENTRY: ${prof.entry === "key" ? "KeyC" : "tap"} from menu ⇒ classsel, stashed seededCode=${atClasssel.seededCode} (the day's seed)`);
  else F(`[${prof.name}] ENTRY: entry failed scene=${atClasssel.scene} seededCode=${atClasssel.seededCode} (expected classsel + ${entryCode})`);

  // ---- AC5 [NO-COLLIDE]: KeyC in classsel opens Personalizar (customize), NOT the seeded entry; seeded state survives ----
  // (customizeNewHero also picks the highlighted class ⇒ this KeyC doubles as the class-selection step.)
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='customize'", { timeout: 5000 }).catch(() => {});
  const inCustomize = await page.evaluate(() => ({ scene: window.__dev.scene(), seededCode: window.__sc.sim.dev.scState().seededCode }));
  if (inCustomize.scene === "customize" && inCustomize.seededCode === entryCode)
    P(`[${prof.name}] NO-COLLIDE: KeyC is scene-contextual — menu=seeded entry, classsel=Personalizar (customize); stashed seeded state (${inCustomize.seededCode}) survived ⇒ no collision`);
  else F(`[${prof.name}] NO-COLLIDE: KeyC in classsel did not open customize / lost seeded state ${JSON.stringify(inCustomize)}`);

  // close customize (Enter) → abilitysel/play → confirm → play; the seeded gauntlet must be active with the day's code
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  const inPlay = await page.evaluate(() => { const s = window.__sc.sim.dev.scState(); return { scene: s.scene, mode: s.seededChallengeMode, seededCode: s.seededCode }; });
  if (inPlay.scene === "play" && inPlay.mode === true && inPlay.seededCode === entryCode)
    P(`[${prof.name}] ENTRY: reached play with the seeded gauntlet ACTIVE (seededChallengeMode=true, seededCode=${inPlay.seededCode})`);
  else F(`[${prof.name}] ENTRY: play state wrong ${JSON.stringify(inPlay)} (expected play + mode true + ${entryCode})`);
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });
  // HUD indicator painted by the running render loop
  const hudTexts = await captureFrames(page, 14);
  await page.screenshot({ path: `${OUT}/${prof.name}-hud.png` });
  if (hudTexts.some((t) => t === "⚑ DESAFÍO · " + entryCode)) P(`[${prof.name}] ENTRY-HUD: live render loop paints "⚑ DESAFÍO · ${entryCode}"`);
  else F(`[${prof.name}] ENTRY-HUD: indicator not painted (seeded strings: ${hudTexts.filter((t) => /DESAF|Semilla/i.test(t)).slice(0, 3).join(" | ") || "none"})`);

  // ---- AC6 [RECAP]: complete the ACTIVE seeded run ⇒ recap paints the shareable seed banner ----
  await page.evaluate(() => { const d = window.__sc.sim.dev; d.scStage(48000, 1); d.scComplete(); });
  const recapTexts = await captureFrames(page, 14);
  await page.screenshot({ path: `${OUT}/${prof.name}-recap.png` });
  if (recapTexts.some((t) => t === "⚑ Semilla: " + entryCode)) P(`[${prof.name}] RECAP: recap paints shareable seed banner "⚑ Semilla: ${entryCode}"`);
  else F(`[${prof.name}] RECAP: recap banner not painted (seeded strings: ${recapTexts.filter((t) => /DESAF|Semilla/i.test(t)).slice(0, 3).join(" | ") || "none"})`);

  // ---- AC7 [SAME-SEED]: same code ⇒ identical draw stream + identical recap; different code diverges ----
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

  // ---- AC8 [SCORE]: deterministic score == oracle ----
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

  // ---- AC9 [RECORDS]: two seeds isolated; persist writes ONLY the seeded store; survives a REAL reload ----
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

  // ---- AC10 [FPS]: ~60fps in normal play ----
  await page.evaluate(() => { try { window.__dev && window.__dev.reset && window.__dev.reset(); } catch (e) {} });
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { const n = document.getElementById("nameInput"); if (n) { n.value = "SEEDQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); } });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 }).catch(() => {});
  await classToPlay(page).catch(() => {});
  await wait(700); // warmup: let JIT settle (headless DPR cold-start artifact, mirror CAS-2079/2092)
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick(t) { n++; if (t - t0 >= 1500) res(+(n / ((t - t0) / 1000)).toFixed(1)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  if (fps >= 55) P(`[${prof.name}] FPS: ~60fps sustained in play (${fps}fps) — the live seeded feature costs 0 at runtime`);
  else F(`[${prof.name}] FPS: ${fps} < 55 — loop stalled`);

  // ---- boot/play cleanliness ----
  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) F(`[${prof.name}] non-favicon 404s (${bad404.length}): ${bad404.slice(0, 3).join(", ")}`);
  else if (http404.length) P(`[${prof.name}] only cosmetic favicon.ico 404 (sev-4, known)`);
  if (errors.length) F(`[${prof.name}] console errors (${errors.length}): ${errors.slice(0, 3).join(" | ")}`);
  else P(`[${prof.name}] CLEAN: zero game-JS errors boot→menu→KeyC/tap entry→play→recap→reload`);

  await page.close();
}
await browser.close();
if (anyFail) { console.error("\n❌ CAS-2095 SEEDED CHALLENGE LIVE END-TO-END OBSERVABLE — FAIL"); process.exit(1); }
console.log("\n✅ CAS-2095 SEEDED CHALLENGE LIVE END-TO-END OBSERVABLE — ALL PASS (menu entry drawn+reachable, enabled:true, srand==HEAD, seed-of-day MITH-YYYYMMDD, KeyC/tap ENTERS real gauntlet w/ day's code + HUD, KeyC no-collision, recap banner, same-seed=same-run, score==oracle, per-seed records survive real reload, ~60fps — desktop + mobile)");
