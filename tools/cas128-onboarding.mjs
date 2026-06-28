// ---------------------------------------------------------------------------
// CAS-128 — first-session onboarding / tutorial QA harness (local committed build).
//
// Boots the REAL game headless and drives the REAL guided flow end-to-end — every
// step advances only because the harness performs the taught action through the
// genuine sim path (move keys, cast, tpZone, kill+pickup, open inventory):
//   [ARM]    a true first run (no save, unseen) auto-arms the tutorial at step 1
//   [FLOW]   move → attack → skill → travel → loot → equip → done, each via real input
//   [SKIP]   the Skip path retires the tutorial and writes the one-time seen marker
//   [RETURN] a returning player (seen marker set) is NOT shown the tutorial again
//   [REPLAY] tutStart() re-arms the guide on demand (the pause-menu replay path)
//   [FPS]    60fps holds with the coachmark overlay live
//   [ERR]    zero JS errors across the run
//
// Run: npm run onboarding   (node tools/cas128-onboarding.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const keyUp = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);

// Wipe storage, reload, and wait for the menu. noSave() FIRST so this page's
// beforeunload/pagehide flush can't resurrect the save we just cleared on reload.
async function freshBoot(page, { clearTut = true } = {}) {
  await page.evaluate((ct) => { try { if (window.__dev && window.__dev.noSave) window.__dev.noSave();
    localStorage.removeItem("mithralda.save.v1"); if (ct) localStorage.removeItem("mithralda.tut.v1"); } catch (e) {} }, clearTut);
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
}

// Drive the menu name+class flow into play (warrior).
async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 10000 });
  await page.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

const tut = (page) => page.evaluate(() => window.__dev.tutState());

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });

  // ---- [ARM] true first run auto-arms the tutorial -------------------------
  await freshBoot(page, { clearTut: true });
  const seen0 = await page.evaluate(() => window.__dev.tutSeen());
  await enterPlay(page, "QAOnboard");
  let s = await tut(page);
  if (!seen0 && s.active && s.i === 0 && s.step === "move")
    pass(`[ARM] first run auto-armed the tutorial at step 1/${s.nSteps} ("${s.step}")`);
  else fail(`[ARM] not armed correctly: seen=${seen0} ${JSON.stringify(s)}`);

  // ---- [FLOW] step 1: MOVE (hold a real move key) --------------------------
  await key(page, "KeyD"); await wait(800); await keyUp(page, "KeyD"); await wait(120);
  s = await tut(page);
  if (s.step === "attack") pass(`[FLOW] move → advanced to "attack" (walked ${s.moveDist}px)`);
  else fail(`[FLOW] move step did not advance: ${JSON.stringify(s)}`);

  // ---- step 2: ATTACK (a real basic-attack cast) ---------------------------
  await page.evaluate(() => window.__dev.cast(0)); await wait(120);
  s = await tut(page);
  if (s.step === "skill") pass(`[FLOW] attack → advanced to "skill"`);
  else fail(`[FLOW] attack step did not advance: ${JSON.stringify(s)}`);

  // ---- step 3: SKILL (a real class-skill cast) -----------------------------
  await page.evaluate(() => window.__dev.cast(1)); await wait(120);
  s = await tut(page);
  if (s.step === "travel") pass(`[FLOW] skill → advanced to "travel"`);
  else fail(`[FLOW] skill step did not advance: ${JSON.stringify(s)}`);

  // ---- step 4: TRAVEL (leave town for a hunt zone) -------------------------
  await page.evaluate(() => window.__dev.tpZone("forest")); await wait(120);
  s = await tut(page);
  if (s.step === "loot") pass(`[FLOW] travel (→forest) → advanced to "loot"`);
  else fail(`[FLOW] travel step did not advance: ${JSON.stringify(s)}`);

  // ---- step 5: LOOT (kill an enemy + collect its drop) ---------------------
  await page.evaluate(() => { window.__dev.spawnKill("orc"); window.__dev.pickup(); }); await wait(120);
  s = await tut(page);
  if (s.step === "equip" && s.looted) pass(`[FLOW] loot (real drop picked up) → advanced to "equip"`);
  else fail(`[FLOW] loot step did not advance: ${JSON.stringify(s)}`);

  // ---- step 6: EQUIP (open the inventory) ----------------------------------
  await page.evaluate(() => window.__dev.openInv()); await wait(120);
  await key(page, "KeyI"); await wait(160); // close back to play so the step resolves
  s = await tut(page);
  if (s.step === "done" && s.invOpened) pass(`[FLOW] equip (inventory opened) → reached final "done" card`);
  else fail(`[FLOW] equip step did not advance: ${JSON.stringify(s)}`);

  await page.screenshot({ path: "tools/cas128-onboarding-screenshot.png" });

  // ---- [SKIP] the Skip path retires the tutorial + writes the seen marker ---
  await page.evaluate(() => window.__dev.tutSkip()); await wait(2600); // let the autosave tick flush the marker
  s = await tut(page);
  const seenAfter = await page.evaluate(() => window.__dev.tutSeen());
  if (!s.active && s.finished && seenAfter) pass(`[SKIP] skip retired the tutorial and set the one-time seen marker`);
  else fail(`[SKIP] skip/seen-marker broken: active=${s.active} finished=${s.finished} seen=${seenAfter}`);

  // ---- [RETURN] a returning player (seen set) is NOT shown the tutorial -----
  await freshBoot(page, { clearTut: false }); // wipe the save but KEEP the seen marker
  await enterPlay(page, "QAReturn");
  s = await tut(page);
  if (!s.exists || !s.active) pass(`[RETURN] returning player (seen marker) starts with NO tutorial`);
  else fail(`[RETURN] tutorial wrongly auto-started for a returning player: ${JSON.stringify(s)}`);

  // ---- [REPLAY] on-demand replay re-arms the guide (pause-menu path) --------
  await page.evaluate(() => window.__dev.tutStart()); await wait(80);
  s = await tut(page);
  if (s.active && s.i === 0) pass(`[REPLAY] replay re-armed the guide on demand at step 1`);
  else fail(`[REPLAY] replay did not re-arm: ${JSON.stringify(s)}`);

  // ---- [FPS] frame budget holds with the coachmark overlay live ------------
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps with the coachmark overlay live`);
  else fail(`[FPS] dropped to ${fps} fps`);

  if (errors.length === 0) pass("[ERR] zero JS errors across the run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? "\n✓ CAS-128 onboarding harness passed." : "\n✗ CAS-128 onboarding harness FAILED.");
process.exit(ok ? 0 : 1);
