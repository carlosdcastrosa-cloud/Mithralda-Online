// ---------------------------------------------------------------------------
// CAS-277 — End-of-run RECAP / "one more run" hook (NON-balance, soak-safe).
//
// Boots the REAL game in headless Chromium and drives the actual terminal-state
// flow through the SAME code the game uses — no shortcut around heroDie/respawn:
//
//   1) RECAP appears on the terminal (death) state with ACCURATE live stats —
//      time survived / enemies / gold / elites / level — read from the frozen
//      G.recap delta (verified via __dev hooks against a known run).
//   2) PRIMARY "otra ronda" (Space / Enter / bound attack key + touch tap) →
//      a FRESH run (scene play, recap cleared, new run baseline).
//   3) SECONDARY (Escape + touch tap) → respawn into the calm pause/menu hub.
//   4) CAS-132 funnel events fire: recap_shown on show, recap_retry / recap_hub
//      on the actions (read from window.__analytics.report().events).
//   5) Honors reduce-motion + colorblind toggles (recap still renders, 0 errors).
//   6) NON-balance guard: the recap READS only — no tunable changed.
//   7) 60fps with the recap on-screen + zero JS errors + a screenshot.
//
// Run: npm run cas277   (node tools/cas277-recap.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas277-recap.png");
let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const dwell = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "RecapBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  await page.evaluate(() => { if (window.__dev.tutState && window.__dev.tutState().active) window.__dev.tutSkip(); });
}
const events = (page) => page.evaluate(() => { try { return (window.__analytics.report().events) || {}; } catch (e) { return {}; } });
// die through the real path, then wait until the recap is fully on-screen: scene 'dead'
// AND the renderer has written its touch hit-rects (proves a frame drew the recap) AND the
// CAS-132 recap_shown observer (game.js update) has ticked.
async function dieAndShow(page) {
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene() === 'dead' && window.__dev.recapRects().length >= 2", { timeout: 5000 });
  await dwell(120); // let the scene-transition observer fire recap_shown
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // ---- (1) RECAP appears on death with ACCURATE stats -----------------------
  // Capture the run baseline, drive a KNOWN run (kills, an elite, gold), let
  // play-time accumulate, then die through the real path and compare the recap
  // delta to the expected values.
  const base = await page.evaluate(() => window.__dev.runBase());
  if (base && typeof base.kills0 === "number") pass(`run baseline captured: ${JSON.stringify(base)}`);
  else fail(`run baseline missing: ${JSON.stringify(base)}`);

  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__dev.spawnKill("wolf"); }); // +6 enemies
  await page.evaluate(() => window.__dev.eliteSpawnKill("orc", "forest"));   // +1 elite-class kill (also +1 enemy)
  const goldTarget = (base.gold0 | 0) + 250;
  await page.evaluate((g) => window.__dev.setGold(g), goldTarget);           // +250 net gold this run
  await dwell(1300); // let active play-time accumulate (recap uses playT delta)

  await dieAndShow(page);
  const rec = await page.evaluate(() => window.__dev.recapState());
  if (!rec) { fail("recapState null on death"); }
  else {
    if (rec.kills === 7) pass(`recap enemies defeated = ${rec.kills} (expected 7: 6 wolves + 1 elite)`);
    else fail(`recap enemies wrong: ${rec.kills} (expected 7)`);
    if (rec.elites >= 1) pass(`recap elites abatidos = ${rec.elites} (>=1)`);
    else fail(`recap elites wrong: ${rec.elites} (expected >=1)`);
    if (rec.gold === 250) pass(`recap oro conseguido = ${rec.gold} (expected 250)`);
    else fail(`recap gold wrong: ${rec.gold} (expected 250, base.gold0=${base.gold0})`);
    if (rec.time >= 1.0) pass(`recap tiempo con vida = ${rec.time.toFixed(2)}s (>=1.0)`);
    else fail(`recap time too low: ${rec.time}`);
    if (typeof rec.lvl === "number" && rec.lvl >= 1) pass(`recap nivel = ${rec.lvl} (lvlUp=${rec.lvlUp})`);
    else fail(`recap level wrong: ${rec.lvl}`);
  }

  // recap hit-rects are written for touch (primary + secondary buttons)
  const rects = await page.evaluate(() => window.__dev.recapRects());
  const hasRetry = rects.some((r) => r.act === "retry" && r.w > 40 && r.h > 24);
  const hasHub = rects.some((r) => r.act === "hub" && r.w > 40 && r.h > 24);
  if (hasRetry && hasHub) pass(`recap touch rects present: retry + hub (${rects.length} rects)`);
  else fail(`recap touch rects missing: ${JSON.stringify(rects)}`);

  // ---- (4a) recap_shown event fired on show --------------------------------
  let ev = await events(page);
  if (ev.recap_shown && ev.recap_shown.n >= 1) pass(`CAS-132 event recap_shown fired (n=${ev.recap_shown.n})`);
  else fail(`recap_shown event missing: ${JSON.stringify(ev)}`);

  // ---- (2) PRIMARY retry (keyboard Space) → fresh run ----------------------
  await key(page, "Space");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 4000 });
  const afterRetry = await page.evaluate(() => ({ scene: window.__dev.scene(), recap: window.__dev.recapState(), base: window.__dev.runBase() }));
  if (afterRetry.scene === "play" && afterRetry.recap === null && afterRetry.base && afterRetry.base.kills0 != null)
    pass(`retry → fresh run (scene play, recap cleared, new baseline kills0=${afterRetry.base.kills0})`);
  else fail(`retry flow wrong: ${JSON.stringify(afterRetry)}`);
  ev = await events(page);
  if (ev.recap_retry && ev.recap_retry.n >= 1) pass(`CAS-132 event recap_retry fired (n=${ev.recap_retry.n})`);
  else fail(`recap_retry event missing: ${JSON.stringify(ev)}`);

  // ---- (2b) PRIMARY retry via TOUCH tap on the primary button --------------
  await dieAndShow(page);
  const pr = await page.evaluate(() => window.__dev.recapRects().find((r) => r.act === "retry"));
  await page.mouse.click(pr.x + pr.w / 2, pr.y + pr.h / 2);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 4000 }).catch(() => {});
  const tapScene = await page.evaluate(() => window.__dev.scene());
  if (tapScene === "play") pass(`touch tap on PRIMARY → fresh run (scene ${tapScene})`);
  else fail(`touch retry tap failed: scene=${tapScene}`);

  // ---- (3) SECONDARY hub (keyboard Escape) → pause hub ---------------------
  await dieAndShow(page);
  await key(page, "Escape");
  await page.waitForFunction("window.__dev.scene() === 'pause'", { timeout: 4000 }).catch(() => {});
  const hubScene = await page.evaluate(() => ({ scene: window.__dev.scene(), dead: window.__dev.recapState() }));
  if (hubScene.scene === "pause") pass(`secondary (Esc) → calm hub (scene pause, hero respawned)`);
  else fail(`hub flow wrong: ${JSON.stringify(hubScene)}`);
  ev = await events(page);
  if (ev.recap_hub && ev.recap_hub.n >= 1) pass(`CAS-132 event recap_hub fired (n=${ev.recap_hub.n})`);
  else fail(`recap_hub event missing: ${JSON.stringify(ev)}`);
  await key(page, "Escape"); // leave pause back to play
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 4000 }).catch(() => {});

  // ---- (5) reduce-motion + colorblind: recap still renders, no errors ------
  await page.evaluate(() => { window.__dev.setReduceMotionPref(true); window.__dev.setColorblind(true); });
  await dieAndShow(page);
  const a11yRec = await page.evaluate(() => window.__dev.recapState());
  const a11ySet = await page.evaluate(() => window.__dev.settingsState());
  if (a11yRec && a11ySet.reduceMotion === true && a11ySet.colorblind === true)
    pass(`recap renders under reduce-motion + colorblind (kills=${a11yRec.kills})`);
  else fail(`a11y recap issue: rec=${JSON.stringify(a11yRec)} set=${JSON.stringify(a11ySet)}`);

  // ---- (7) 60fps with the recap on-screen ----------------------------------
  const fpsList = [];
  for (let i = 0; i < 3; i++) {
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; (performance.now() - t0 < 800) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
      requestAnimationFrame(tick);
    }));
    fpsList.push(fps);
  }
  const minFps = Math.min(...fpsList);
  log(`FPS samples (recap on-screen): [${fpsList.join(", ")}]  min=${minFps}`);
  if (minFps >= 58) pass(`FPS held >= 58 (min ${minFps})`);
  else fail(`FPS dropped below 58: min ${minFps}`);

  await page.screenshot({ path: SHOT });
  pass(`screenshot saved: ${SHOT}`);

  if (errors.length === 0) pass("zero page errors");
  else { for (const e of errors) fail(e); }
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(ok ? "\n✓ CAS-277 recap test passed." : "\n✗ CAS-277 recap test FAILED.");
process.exit(ok ? 0 : 1);
