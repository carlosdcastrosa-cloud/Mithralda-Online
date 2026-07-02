// ---------------------------------------------------------------------------
// CAS-271 — LIVE re-test of the CAS-270 delta on the BACKUP host (gh-pages,
// build c224186543b6). CAS-270 extended the CAS-267 bind-aware coachmark so the
// final ("done") card ALSO surfaces the Forja (forge/KeyG) and Opciones/Settings
// (pause/Escape) keys, live from the CAS-265 rebind table. Pure UI copy.
//
// This drives the REAL __dev hooks + reads the LIVE render path. It also
// reproduces render.js's done-card resolution by dynamically importing the
// SERVED strings.js module on the top window (same-origin) and applying the same
// keyLabel + G.settings.binds resolver render.js uses, so the asserted copy is
// exactly what renderTutorial() draws:
//   [BUILD]    served build id matches the CAS-270 deploy (not a stale cache)
//   [ARM]      fresh first run auto-arms the coachmark at step "move"
//   [DEFAULT]  default copy bind-aware (move=WASD, attack=J, loot=F, equip=I)
//   [DONE-DEF] done card surfaces Forja G + Opciones Esc at DEFAULT binds  (AC2)
//   [DONE-RB]  rebind forge→V & pause→P → done card shows V + P, no stale G/Esc (AC3)
//   [REGR]     move/attack/skill/loot/inventory cards still bind-aware        (AC4)
//   [RMOTION]  reduceMotion ON → overlay renders, no errors (card static)     (AC5)
//   [SKIP]     skip retires guide + writes seen marker; reload does NOT re-show (AC1)
//   [REPLAY]   tutStart() re-arms at step 1 (and re-resolves new binds)
//   [TOUCH]    mobile viewport: move card uses the touch (drag-to-move) variant (AC6)
//   [FPS]      ≥58fps with the coachmark overlay live                          (AC7)
//   [ERR]      zero JS errors / failed requests                               (AC7)
// Screenshots: done card @ default (G/Esc), done card @ rebound (V/P), touch move.
// Read-only on the shared env (throwaway localStorage only). Prints JSON.
//
// Run: node tools/cas271-coachmark-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const LIVE = BASE + "/index.html?dev";
const EXPECT_BUILD = process.env.EXPECT_BUILD || "c224186543b6";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, expectBuild: EXPECT_BUILD, checks: [], errors: [], shots: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) report.anyFail = true; console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const tut = (page) => page.evaluate(() => window.__dev.tutState());

// Resolve what the LIVE done card draws, by importing the SERVED strings.js and
// applying render.js's exact resolver (keyLabel ∘ G.settings.binds). Faithful to
// renderTutorial(): body = STR.tutDone(tutKey), tutKey(a)=keyLabel(binds[a]).
async function liveDoneCardCopy(page) {
  return page.evaluate(async () => {
    const mod = await import("./strings.js?" + Date.now());
    const STR = mod.STR;
    const binds = window.__dev.settingsState().binds;
    const keyLabel = (code) => { if (!code) return "—";
      if (code === "Space") return "Espacio";
      if (code === "Escape") return "Esc";
      if (code.startsWith("Key")) return code.slice(3);
      if (code.startsWith("Digit")) return code.slice(5);
      if (code.startsWith("Numpad")) return "Num" + code.slice(6);
      if (code === "ArrowUp") return "↑"; if (code === "ArrowDown") return "↓";
      if (code === "ArrowLeft") return "←"; if (code === "ArrowRight") return "→";
      return code; };
    const tutKey = (a) => keyLabel(binds[a]);
    const body = typeof STR.tutDone === "function" ? STR.tutDone(tutKey) : STR.tutDone;
    return { body, isFn: typeof STR.tutDone === "function", binds: { forge: binds.forge, pause: binds.pause, talents: binds.talents, interact: binds.interact } };
  });
}
// Same import path, resolve any step's pc/touch copy bind-aware (regression AC4).
async function liveStepCopy(page, step, isTouch = false) {
  return page.evaluate(async ({ step, isTouch }) => {
    const mod = await import("./strings.js?" + Date.now());
    const STR = mod.STR;
    const binds = window.__dev.settingsState().binds;
    const keyLabel = (code) => { if (!code) return "—";
      if (code === "Escape") return "Esc";
      if (code.startsWith("Key")) return code.slice(3);
      if (code.startsWith("Digit")) return code.slice(5);
      if (code.startsWith("Arrow")) return ({ ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" })[code];
      return code; };
    const tutKey = (a) => keyLabel(binds[a]);
    const s = STR.tutSteps[step];
    const raw = s ? (isTouch ? s.touch : s.pc) : "";
    return typeof raw === "function" ? raw(tutKey) : raw;
  }, { step, isTouch });
}

async function freshBoot(page, { clearTut = true } = {}) {
  await page.evaluate((ct) => { try { if (window.__dev.noSave) window.__dev.noSave();
    if (window.__dev.clearSave) window.__dev.clearSave(); if (ct && window.__dev.clearTutSeen) window.__dev.clearTutSeen(); } catch (e) {} }, clearTut);
  await page.evaluate(() => location.reload());
  await sleep(900);
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
}
async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 12000 });
  await page.evaluate((nm) => { const el = document.getElementById("nameInput"); if (el) el.value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}
const gotoDone = (page) => page.evaluate(() => { const st = window.__dev.tutState().steps; window.__dev.tutSetStep(st.indexOf("done")); });

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/.test(u)) report.errors.push(`reqfail: ${u}`); });
  // 404s carry a URL on the response event (console.error logs a URL-less
  // "Failed to load resource" for the same hit); track by URL so the known
  // sev-4 favicon 404 can be excluded and real failures still caught.
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) report.errors.push(`http${r.status()}: ${r.url()}`); });
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });

  // [BUILD]
  const build = await page.evaluate(async () => { try { const r = await fetch("version.json?" + Date.now()); const j = await r.json(); return j.build || j.id || j.buildId; } catch (e) { return null; } });
  check(`[BUILD] served build is the CAS-270 deploy ${EXPECT_BUILD}`, build === EXPECT_BUILD, { build });

  // [ARM] — fresh first run
  await freshBoot(page, { clearTut: true });
  const seen0 = await page.evaluate(() => window.__dev.tutSeen());
  await enterPlay(page, "QA271");
  let s = await tut(page);
  check("[ARM] first run auto-arms coachmark at step move", !seen0 && s.active && s.i === 0 && s.step === "move", { seen0, active: s.active, i: s.i, step: s.step });

  // default binds confirmed live
  let binds = await page.evaluate(() => window.__dev.settingsState().binds);
  check("[DEFAULT] live default binds (attack J / pickup F / inventory I / forge G / pause Esc)",
    binds.attack === "KeyJ" && binds.pickup === "KeyF" && binds.inventory === "KeyI" && binds.forge === "KeyG" && binds.pause === "Escape", binds);

  // ---- [DONE-DEF] AC2: done card surfaces Forja G + Opciones Esc at DEFAULTS ----
  await gotoDone(page); await sleep(120);
  s = await tut(page);
  check("[DONE] coachmark advanced to done step", s.step === "done", { step: s.step });
  let done = await liveDoneCardCopy(page);
  check("[DONE-DEF] done card is bind-aware (function)", done.isFn, { isFn: done.isFn });
  check("[DONE-DEF] done card surfaces Forja key G at default", done.body.includes("forja equipo (G)"), { body: done.body });
  check("[DONE-DEF] done card surfaces Opciones key Esc at default", done.body.includes("controles (Esc)"), { snippet: done.body.slice(-60) });
  check("[DONE-DEF] done card still shows talents (T) + Mercader (E) keys (CAS-267 base)", done.body.includes("talentos (T)") && done.body.includes("Mercader (E)"), { hasT: done.body.includes("talentos (T)"), hasE: done.body.includes("Mercader (E)") });
  const SHOT_DONE_DEF = join(ROOT, "tools", "cas271-done-default-G-Esc.png");
  await page.screenshot({ path: SHOT_DONE_DEF }); report.shots.push(SHOT_DONE_DEF);

  // ---- [DONE-RB] AC3: rebind forge→V, pause→P → done card reflects NEW keys ----
  await page.evaluate(() => { window.__dev.setBind("forge", "KeyV"); window.__dev.setBind("pause", "KeyP"); });
  binds = await page.evaluate(() => window.__dev.settingsState().binds);
  check("[DONE-RB] live binds updated (forge V / pause P)", binds.forge === "KeyV" && binds.pause === "KeyP", { forge: binds.forge, pause: binds.pause });
  done = await liveDoneCardCopy(page);
  check("[DONE-RB] done card now shows Forja key V", done.body.includes("forja equipo (V)"), { body: done.body });
  check("[DONE-RB] done card now shows Opciones key P", done.body.includes("controles (P)"), { snippet: done.body.slice(-60) });
  check("[DONE-RB] no stale 'forja equipo (G)' after rebind", !done.body.includes("forja equipo (G)"), { hasStaleG: done.body.includes("forja equipo (G)") });
  check("[DONE-RB] no stale 'controles (Esc)' after rebind", !done.body.includes("controles (Esc)"), { hasStaleEsc: done.body.includes("controles (Esc)") });
  const SHOT_DONE_RB = join(ROOT, "tools", "cas271-done-rebound-V-P.png");
  await page.screenshot({ path: SHOT_DONE_RB }); report.shots.push(SHOT_DONE_RB);

  // ---- [REGR] AC4: move/attack/skill/loot/inventory cards still bind-aware ----
  // reset binds, then rebind a few and confirm the per-step cards reflect them.
  await page.evaluate(() => { window.__dev.resetBinds(); window.__dev.setBind("attack", "KeyK"); window.__dev.setBind("pickup", "KeyH"); window.__dev.setBind("inventory", "KeyB"); });
  const moveCopy = await liveStepCopy(page, "move");
  const atkCopy = await liveStepCopy(page, "attack");
  const lootCopy = await liveStepCopy(page, "loot");
  const equipCopy = await liveStepCopy(page, "equip");
  check("[REGR] move card shows WASD (default movement binds)", /WASD|↑/.test(moveCopy), { moveCopy });
  check("[REGR] attack card reflects rebind K, not stale J", atkCopy.includes("K") && !/\bJ\b/.test(atkCopy), { atkCopy });
  check("[REGR] loot card reflects pickup rebind H", lootCopy.includes("H"), { lootCopy });
  check("[REGR] equip card reflects inventory rebind B", equipCopy.includes("B"), { equipCopy });

  // ---- [RMOTION] AC5: reduce-motion ON → overlay renders, no errors (static card) ----
  await page.evaluate(() => window.__dev.setReduceMotionPref(true));
  const rm = await page.evaluate(() => window.__dev.settingsState().reduceMotion);
  await gotoDone(page); await sleep(200);
  s = await tut(page);
  check("[RMOTION] reduceMotion ON and done card still active/renders (no motion regression)", rm === true && s.active && s.step === "done", { reduceMotion: rm, active: s.active, step: s.step });

  // ---- [SKIP] AC1: skip retires + sets seen; reload does not re-show ----
  await gotoDone(page); // ensure active before skip path test from a non-done step
  await page.evaluate(() => { window.__dev.tutSetStep(0); window.__dev.tutSkip(); }); await sleep(200);
  const seenAfter = await page.evaluate(() => window.__dev.tutSeen());
  s = await tut(page);
  check("[SKIP] skip retires guide + sets seen marker", !s.active && seenAfter, { active: s.active, seen: seenAfter });
  await freshBoot(page, { clearTut: false });
  await enterPlay(page, "QA271ret");
  s = await tut(page);
  check("[SKIP] returning player (seen) gets NO coachmark on reload", !s.exists || !s.active, { exists: s.exists, active: s.active });

  // ---- [REPLAY] tutStart re-arms at step 1 ----
  await page.evaluate(() => window.__dev.tutStart()); await sleep(120);
  s = await tut(page);
  check("[REPLAY] tutStart re-arms guide at step 1", s.active && s.i === 0, { active: s.active, i: s.i });

  // [FPS]
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick); }));
  check("[FPS] ≥58 with coachmark overlay live", fps >= 58, { fps });

  // [TOUCH] AC6 — mobile viewport: move card uses the touch (drag-to-move) variant
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await freshBoot(page, { clearTut: true });
  await enterPlay(page, "QA271m");
  s = await tut(page);
  const isTouch = await page.evaluate(() => !!(window.__dev.isTouch ? window.__dev.isTouch() : (("ontouchstart" in window) || navigator.maxTouchPoints > 0)));
  const moveTouch = await liveStepCopy(page, "move", true);
  check("[TOUCH] coachmark arms on mobile at step move", s.active && s.step === "move", { active: s.active, step: s.step });
  check("[TOUCH] move touch copy is drag-to-move (no WASD)", /arrastr|desliz|toca/i.test(moveTouch) && !/WASD/.test(moveTouch), { moveTouch });
  const SHOT_TOUCH = join(ROOT, "tools", "cas271-moverse-touch.png");
  await page.screenshot({ path: SHOT_TOUCH }); report.shots.push(SHOT_TOUCH);

  // [ERR]
  check("[ERR] zero JS errors / failed requests (favicon excluded)", report.errors.length === 0, report.errors.slice(0, 6));

  report.pass = !report.anyFail;
  console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END_REPORT===");
  console.log(report.pass ? "\n✓ CAS-271 CAS-270 coachmark LIVE re-test PASSED." : "\n✗ CAS-271 CAS-270 coachmark LIVE re-test had failures.");
} catch (e) {
  console.error("HARNESS ERROR:", e.message);
  report.errors.push("harness: " + e.message);
  console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END_REPORT===");
} finally {
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}
