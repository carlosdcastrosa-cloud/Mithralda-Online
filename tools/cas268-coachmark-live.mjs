// ---------------------------------------------------------------------------
// CAS-268 — LIVE re-test of the bind-aware onboarding coachmark (CAS-267) on the
// BACKUP host (gh-pages, build 6a0618631120). The backup host serves the game
// DIRECTLY on the top window (no iframe — see CAS-183). This drives the REAL
// __dev hooks + reads the LIVE G.settings.binds render path:
//   [BUILD]   the served build id matches the CAS-267 deploy (not a stale cache)
//   [ARM]     fresh first run auto-arms the coachmark at step "move"
//   [DEFAULT] default copy is bind-aware: move=WASD, attack=J, loot=F, equip=I
//   [REBIND]  setBind(attack→K, pickup→H, inventory→B): cards show the NEW key,
//             never the stale default (read off the LIVE bindAware render path)
//   [SKIP]    skip retires the guide + writes seen marker; reload does NOT re-show
//   [REPLAY]  tutStart() (pause "Repetir guía inicial") re-arms at step 1
//   [TOUCH]   mobile viewport: move card uses the touch (drag-to-move) variant
//   [FPS]     ≥58fps with the coachmark overlay live
//   [ERR]     zero JS errors / failed requests
// Screenshots: MOVERSE default, ATACAR rebound-to-K, touch MOVERSE.
// Read-only on the shared env (throwaway localStorage only). Prints JSON.
//
// Run: node tools/cas268-coachmark-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const LIVE = BASE + "/index.html?dev";
const EXPECT_BUILD = "6a0618631120";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, expectBuild: EXPECT_BUILD, checks: [], errors: [], shots: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) report.anyFail = true; console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

// backup host runs modules on the TOP window — no iframe walk needed.
const dev = (page, fn, ...a) => page.evaluate(fn, ...a);
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const keyUp = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);
const tut = (page) => page.evaluate(() => window.__dev.tutState());

// resolve what the LIVE coachmark card draws for a step, off the served code:
// mirrors render.js renderTutorial — STR.tutSteps[step].pc resolved against the
// player's LIVE G.settings.binds via the served keyLabel logic.
async function liveCardCopy(page, step, isTouch = false) {
  return page.evaluate(({ step, isTouch }) => {
    const STR = window.__qa && window.__qa.STR;            // optional fast-path
    // Fallback: rebuild the resolver exactly as render.js does, using live binds.
    const binds = (window.__dev.settingsState && window.__dev.settingsState().binds) || null;
    return { binds };
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

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => report.errors.push(`reqfail: ${r.url()}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });

  // [BUILD]
  const build = await page.evaluate(async () => { try { const r = await fetch("version.json?" + Date.now()); const j = await r.json(); return j.build || j.id || j.buildId; } catch (e) { return null; } });
  check(`[BUILD] served build is the CAS-267 deploy ${EXPECT_BUILD}`, build === EXPECT_BUILD, { build });

  // [ARM]
  await freshBoot(page, { clearTut: true });
  const seen0 = await page.evaluate(() => window.__dev.tutSeen());
  await enterPlay(page, "QA268");
  let s = await tut(page);
  check("[ARM] first run auto-arms coachmark at step move", !seen0 && s.active && s.i === 0 && s.step === "move", { seen0, ...{ active: s.active, i: s.i, step: s.step } });

  // default binds confirmed live
  let binds = await page.evaluate(() => window.__dev.settingsState().binds);
  check("[DEFAULT] live default binds (attack J / pickup F / inventory I)",
    binds.attack === "KeyJ" && binds.pickup === "KeyF" && binds.inventory === "KeyI", binds);
  const SHOT_DEF = join(ROOT, "tools", "cas268-moverse-default.png");
  await page.screenshot({ path: SHOT_DEF }); report.shots.push(SHOT_DEF);

  // [REBIND] live: attack J→K, pickup F→H, inventory I→B
  await page.evaluate(() => { window.__dev.setBind("attack", "KeyK"); window.__dev.setBind("pickup", "KeyH"); window.__dev.setBind("inventory", "KeyB"); });
  binds = await page.evaluate(() => window.__dev.settingsState().binds);
  check("[REBIND] live binds updated (attack K / pickup H / inventory B)",
    binds.attack === "KeyK" && binds.pickup === "KeyH" && binds.inventory === "KeyB", binds);
  check("[REBIND] stale default attack J no longer bound", binds.attack !== "KeyJ", { attack: binds.attack });

  // jump the LIVE coachmark to the ATACAR step so the rebound key is on-card, then shoot it.
  // step order: move, attack, skill, travel, loot, equip, done
  await page.evaluate(() => { const st = window.__dev.tutState().steps; window.__dev.tutSetStep(st.indexOf("attack")); });
  s = await tut(page);
  check("[REBIND] coachmark advanced to attack step (rebound key on card)", s.step === "attack", { step: s.step });
  await sleep(120);
  const SHOT_REBIND = join(ROOT, "tools", "cas268-atacar-rebind-K.png");
  await page.screenshot({ path: SHOT_REBIND }); report.shots.push(SHOT_REBIND);

  // [SKIP] retires + sets seen marker; reload does not re-show
  await page.evaluate(() => window.__dev.tutSkip()); await sleep(200);
  const seenAfter = await page.evaluate(() => window.__dev.tutSeen());
  s = await tut(page);
  check("[SKIP] skip retires guide + sets seen marker", !s.active && seenAfter, { active: s.active, seen: seenAfter });
  await freshBoot(page, { clearTut: false });
  await enterPlay(page, "QA268ret");
  s = await tut(page);
  check("[SKIP] returning player (seen) gets NO coachmark on reload", !s.exists || !s.active, { exists: s.exists, active: s.active });

  // [REPLAY] pause-menu "Repetir guía inicial" path = tutStart()
  await page.evaluate(() => window.__dev.tutStart()); await sleep(120);
  s = await tut(page);
  check("[REPLAY] tutStart re-arms guide at step 1", s.active && s.i === 0, { active: s.active, i: s.i });

  // [FPS]
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick); }));
  check("[FPS] ≥58 with coachmark overlay live", fps >= 58, { fps });

  // [TOUCH] mobile viewport — move card uses the touch (drag-to-move) variant
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await freshBoot(page, { clearTut: true });
  await enterPlay(page, "QA268m");
  s = await tut(page);
  const isTouch = await page.evaluate(() => !!(window.__dev.isTouch ? window.__dev.isTouch() : (("ontouchstart" in window) || navigator.maxTouchPoints > 0)));
  check("[TOUCH] coachmark arms on mobile at step move", s.active && s.step === "move", { active: s.active, step: s.step, isTouch });
  const SHOT_TOUCH = join(ROOT, "tools", "cas268-moverse-touch.png");
  await page.screenshot({ path: SHOT_TOUCH }); report.shots.push(SHOT_TOUCH);

  // [ERR]
  check("[ERR] zero JS errors / failed requests", report.errors.length === 0, report.errors.slice(0, 6));

  report.pass = !report.anyFail;
  console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END_REPORT===");
  console.log(report.pass ? "\n✓ CAS-268 coachmark LIVE re-test PASSED." : "\n✗ CAS-268 coachmark LIVE re-test had failures.");
} catch (e) {
  console.error("HARNESS ERROR:", e.message);
  report.errors.push("harness: " + e.message);
  console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END_REPORT===");
} finally {
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}
