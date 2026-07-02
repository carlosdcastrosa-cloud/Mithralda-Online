// ---------------------------------------------------------------------------
// CAS-128 QA — LIVE probe for the ONBOARDING / first-session tutorial on the
// DEPLOYED build (inside the Higgsfield iframe). Drives the SAME __dev hooks the
// game runs to prove the feature shipped live (not a stale cache) and works
// end-to-end on the fixed URL:
//   [ARM]    a true first run (cleared save + unseen marker) auto-arms the guide
//   [FLOW]   move → attack → skill → travel → loot → equip → done via REAL actions
//   [SKIP]   the Skip path retires the tutorial and writes the one-time seen marker
//   [RETURN] a returning player (seen marker) is NOT shown the tutorial again
//   [REPLAY] tutStart() re-arms the guide on demand (the pause-menu replay path)
//   [FPS]    60fps holds with the coachmark overlay live
//   [ERR]    zero JS errors across the run
// Read-only on the shared env (throwaway client-session/localStorage only). Prints JSON.
//
// Run: node tools/cas128-onboarding-live.mjs   (or: npm run onboarding-live)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas128-onboarding-live.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) report.anyFail = true; console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code) => fr.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const keyUp = (fr, code) => fr.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);
const tut = (fr) => fr.evaluate(() => window.__dev.tutState());

// Reset to a clean boot. clearTut=true wipes the first-run seen marker too. noSave()
// stops this frame's unload-flush from resurrecting the save we just cleared on reload.
async function freshBoot(fr, { clearTut = true } = {}) {
  await fr.evaluate((ct) => { try { if (window.__dev.noSave) window.__dev.noSave();
    if (window.__dev.clearSave) window.__dev.clearSave(); if (ct && window.__dev.clearTutSeen) window.__dev.clearTutSeen(); } catch (e) {} }, clearTut);
  await fr.evaluate(() => location.reload());
  await sleep(800);
  await fr.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
}
async function enterPlay(fr, name) {
  await fr.waitForFunction("window.__dev.scene()==='menu'", { timeout: 12000 });
  await fr.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, "Digit1");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  const fr = await gameFrame(page);

  // [ARM]
  await freshBoot(fr, { clearTut: true });
  const seen0 = await fr.evaluate(() => window.__dev.tutSeen());
  await enterPlay(fr, "QAOnboard");
  let s = await tut(fr);
  check("[ARM] first run auto-arms tutorial at step 1 (move)", !seen0 && s.active && s.i === 0 && s.step === "move", { seen0, ...s });

  // [FLOW]
  await key(fr, "KeyD"); await sleep(850); await keyUp(fr, "KeyD"); await sleep(150);
  s = await tut(fr); check("[FLOW] move → attack", s.step === "attack", { moveDist: s.moveDist, step: s.step });
  await fr.evaluate(() => window.__dev.cast(0)); await sleep(150);
  s = await tut(fr); check("[FLOW] attack → skill", s.step === "skill", { step: s.step });
  await fr.evaluate(() => window.__dev.cast(1)); await sleep(150);
  s = await tut(fr); check("[FLOW] skill → travel", s.step === "travel", { step: s.step });
  await fr.evaluate(() => window.__dev.tpZone("forest")); await sleep(150);
  s = await tut(fr); check("[FLOW] travel (→forest) → loot", s.step === "loot", { step: s.step });
  await fr.evaluate(() => { window.__dev.spawnKill("orc"); window.__dev.pickup(); }); await sleep(150);
  s = await tut(fr); check("[FLOW] loot (real drop) → equip", s.step === "equip" && s.looted, { step: s.step, looted: s.looted });
  await fr.evaluate(() => window.__dev.openInv()); await sleep(150);
  await key(fr, "KeyI"); await sleep(200);
  s = await tut(fr); check("[FLOW] equip (inventory opened) → done", s.step === "done" && s.invOpened, { step: s.step, invOpened: s.invOpened });

  await page.screenshot({ path: SHOT });

  // [SKIP]
  await fr.evaluate(() => window.__dev.tutSkip()); await sleep(2600);
  s = await tut(fr); const seenAfter = await fr.evaluate(() => window.__dev.tutSeen());
  check("[SKIP] skip retires tutorial + sets seen marker", !s.active && s.finished && seenAfter, { active: s.active, finished: s.finished, seen: seenAfter });

  // [RETURN] keep the seen marker, wipe the save
  await freshBoot(fr, { clearTut: false });
  await enterPlay(fr, "QAReturn");
  s = await tut(fr); check("[RETURN] returning player gets NO tutorial", !s.exists || !s.active, { exists: s.exists, active: s.active });

  // [REPLAY]
  await fr.evaluate(() => window.__dev.tutStart()); await sleep(120);
  s = await tut(fr); check("[REPLAY] replay re-arms guide at step 1", s.active && s.i === 0, { active: s.active, i: s.i });

  // [FPS]
  const fps = await fr.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  check("[FPS] ≥58 with coachmark overlay live", fps >= 58, { fps });

  check("[ERR] zero JS errors", report.errors.length === 0, report.errors.slice(0, 5));

  report.pass = !report.anyFail;
  console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END_REPORT===");
} catch (e) {
  console.error("harness threw:", e && e.stack || e);
  report.pass = false;
} finally {
  await browser.close();
}
console.log(report.pass ? "\n✓ CAS-128 onboarding LIVE harness passed." : "\n✗ CAS-128 onboarding LIVE harness FAILED.");
process.exit(report.pass ? 0 : 1);
