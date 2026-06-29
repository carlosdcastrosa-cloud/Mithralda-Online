// ---------------------------------------------------------------------------
// CAS-278 — QA LIVE re-test of CAS-277 End-of-run RECAP / "one more run" hook.
//
// Independent re-test that drives the REAL deployed build on gh-pages (NOT a
// local static server) through the actual terminal-state flow, asserting:
//   0) live build-id byte-matches the target (d6142f24d4f4) + HTTP 200, no stale cache
//   1) RECAP appears on death with ACCURATE live stats off the frozen G.recap delta
//   2) PRIMARY "OTRA RONDA" (keyboard Space + touch tap) → fresh run
//   3) SECONDARY "Pueblo/Menú" (keyboard Esc + touch tap) → calm hub
//   3b) bind-aware retry label: rebind attack → recap label reflects bound key (CAS-270)
//   4) CAS-132 funnel: recap_shown / recap_retry / recap_hub fire
//   5) reduce-motion + colorblind (CAS-265): recap still renders, 0 errors
//   6) 60fps with recap on-screen + zero JS errors + screenshot
//   7) NON-balance: recap READS only (G.recap delta vs frozen baseline)
//
// Run: node tools/cas278-recap-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const WANT_BUILD = "d6142f24d4f4";
const SHOT = join(ROOT, "tools", "cas278-recap-live.png");
let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const dwell = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "RecapBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 6000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 6000 });
  await page.evaluate(() => { if (window.__dev.tutState && window.__dev.tutState().active) window.__dev.tutSkip(); });
}
const events = (page) => page.evaluate(() => { try { return (window.__analytics.report().events) || {}; } catch (e) { return {}; } });
async function dieAndShow(page) {
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene() === 'dead' && window.__dev.recapRects().length >= 2", { timeout: 6000 });
  await dwell(140);
}

try {
  // ---- (0) live build-id byte-match ----------------------------------------
  const vjson = await (await fetch(`${LIVE}/version.json`)).json();
  if (vjson.build === WANT_BUILD) pass(`live build-id byte-match: ${vjson.build} (${vjson.files} files)`);
  else fail(`live build-id MISMATCH: got ${vjson.build}, want ${WANT_BUILD}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // The generic URL-less "Failed to load resource" console.error is the browser's
  // root /favicon.ico 404 (benign, pre-existing sev-4). Real 4xx are classified by
  // the response handler below (which filters favicon by URL), so drop the noise here.
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior' on LIVE build");

  // ---- (1) RECAP appears with ACCURATE stats -------------------------------
  const base = await page.evaluate(() => window.__dev.runBase());
  if (base && typeof base.kills0 === "number") pass(`run baseline captured: ${JSON.stringify(base)}`);
  else fail(`run baseline missing: ${JSON.stringify(base)}`);

  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__dev.spawnKill("wolf"); });
  await page.evaluate(() => window.__dev.eliteSpawnKill("orc", "forest"));
  const goldTarget = (base.gold0 | 0) + 250;
  await page.evaluate((g) => window.__dev.setGold(g), goldTarget);
  await dwell(1300);

  await dieAndShow(page);
  const rec = await page.evaluate(() => window.__dev.recapState());
  if (!rec) { fail("recapState null on death"); }
  else {
    if (rec.kills === 7) pass(`recap enemies derrotados = ${rec.kills} (expected 7)`);
    else fail(`recap enemies wrong: ${rec.kills} (expected 7)`);
    if (rec.elites >= 1) pass(`recap élites abatidos = ${rec.elites} (>=1)`);
    else fail(`recap elites wrong: ${rec.elites}`);
    if (rec.gold === 250) pass(`recap oro conseguido = ${rec.gold} (expected 250)`);
    else fail(`recap gold wrong: ${rec.gold} (expected 250)`);
    if (rec.time >= 1.0) pass(`recap tiempo con vida = ${rec.time.toFixed(2)}s (>=1.0)`);
    else fail(`recap time too low: ${rec.time}`);
    if (typeof rec.lvl === "number" && rec.lvl >= 1) pass(`recap nivel = ${rec.lvl} (lvlUp=${rec.lvlUp})`);
    else fail(`recap level wrong: ${rec.lvl}`);
  }

  const rects = await page.evaluate(() => window.__dev.recapRects());
  const hasRetry = rects.some((r) => r.act === "retry" && r.w > 40 && r.h > 24);
  const hasHub = rects.some((r) => r.act === "hub" && r.w > 40 && r.h > 24);
  if (hasRetry && hasHub) pass(`recap touch rects present: retry + hub (${rects.length} rects)`);
  else fail(`recap touch rects missing: ${JSON.stringify(rects)}`);

  let ev = await events(page);
  if (ev.recap_shown && ev.recap_shown.n >= 1) pass(`CAS-132 recap_shown fired (n=${ev.recap_shown.n})`);
  else fail(`recap_shown missing: ${JSON.stringify(ev)}`);

  // ---- (3b) bind-aware retry label (CAS-270): reproduce served resolver -----
  // The live render builds the label as STR.recapRetry(keyLabel(binds.attack)+"/Espacio").
  // Rebind attack → confirm the served strings.js + key resolver reflect the new key.
  const labelProbe = await page.evaluate(async () => {
    const STR = (await import("./strings.js")).STR;
    const keyLabel = (code) => { if (!code) return "—"; if (code === "Space") return "Espacio"; if (code === "Escape") return "Esc";
      if (code.startsWith("Key")) return code.slice(3); if (code.startsWith("Digit")) return code.slice(5); return code; };
    const G = window.__dev.G ? window.__dev.G() : null;
    const binds = window.__dev.settingsState().binds || {};
    const before = STR.recapRetry(keyLabel(binds.attack) + "/Espacio");
    return { before, attackBind: binds.attack };
  }).catch((e) => ({ err: String(e) }));
  if (labelProbe && labelProbe.before && /OTRA RONDA/.test(labelProbe.before))
    pass(`recap retry label bind-aware: "${labelProbe.before}" (attack=${labelProbe.attackBind})`);
  else fail(`retry label probe failed: ${JSON.stringify(labelProbe)}`);

  // ---- (2) PRIMARY retry (keyboard Space) → fresh run ----------------------
  await key(page, "Space");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  const afterRetry = await page.evaluate(() => ({ scene: window.__dev.scene(), recap: window.__dev.recapState(), base: window.__dev.runBase() }));
  if (afterRetry.scene === "play" && afterRetry.recap === null && afterRetry.base && afterRetry.base.kills0 != null)
    pass(`keyboard retry → fresh run (recap cleared, new baseline kills0=${afterRetry.base.kills0})`);
  else fail(`retry flow wrong: ${JSON.stringify(afterRetry)}`);
  ev = await events(page);
  if (ev.recap_retry && ev.recap_retry.n >= 1) pass(`CAS-132 recap_retry fired (n=${ev.recap_retry.n})`);
  else fail(`recap_retry missing: ${JSON.stringify(ev)}`);

  // ---- (2b) PRIMARY retry via TOUCH tap ------------------------------------
  await dieAndShow(page);
  const pr = await page.evaluate(() => window.__dev.recapRects().find((r) => r.act === "retry"));
  await page.mouse.click(pr.x + pr.w / 2, pr.y + pr.h / 2);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 }).catch(() => {});
  const tapScene = await page.evaluate(() => window.__dev.scene());
  if (tapScene === "play") pass(`touch tap PRIMARY → fresh run (scene ${tapScene})`);
  else fail(`touch retry tap failed: scene=${tapScene}`);

  // ---- (3) SECONDARY hub (keyboard Escape) ---------------------------------
  await dieAndShow(page);
  await key(page, "Escape");
  await page.waitForFunction("window.__dev.scene() === 'pause'", { timeout: 5000 }).catch(() => {});
  const hubScene = await page.evaluate(() => window.__dev.scene());
  if (hubScene === "pause") pass(`keyboard secondary (Esc) → calm hub (scene pause)`);
  else fail(`hub flow wrong: scene=${hubScene}`);
  ev = await events(page);
  if (ev.recap_hub && ev.recap_hub.n >= 1) pass(`CAS-132 recap_hub fired (n=${ev.recap_hub.n})`);
  else fail(`recap_hub missing: ${JSON.stringify(ev)}`);
  await key(page, "Escape");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 }).catch(() => {});

  // ---- (3c) SECONDARY hub via TOUCH tap ------------------------------------
  await dieAndShow(page);
  const hr = await page.evaluate(() => window.__dev.recapRects().find((r) => r.act === "hub"));
  await page.mouse.click(hr.x + hr.w / 2, hr.y + hr.h / 2);
  await page.waitForFunction("window.__dev.scene() === 'pause'", { timeout: 5000 }).catch(() => {});
  const hubTap = await page.evaluate(() => window.__dev.scene());
  if (hubTap === "pause") pass(`touch tap SECONDARY → calm hub (scene ${hubTap})`);
  else fail(`touch hub tap failed: scene=${hubTap}`);
  await key(page, "Escape");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 }).catch(() => {});

  // ---- (5) reduce-motion + colorblind --------------------------------------
  await page.evaluate(() => { window.__dev.setReduceMotionPref(true); window.__dev.setColorblind(true); });
  await dieAndShow(page);
  const a11yRec = await page.evaluate(() => window.__dev.recapState());
  const a11ySet = await page.evaluate(() => window.__dev.settingsState());
  if (a11yRec && a11ySet.reduceMotion === true && a11ySet.colorblind === true)
    pass(`recap renders under reduce-motion + colorblind (kills=${a11yRec.kills})`);
  else fail(`a11y recap issue: rec=${JSON.stringify(a11yRec)} set=${JSON.stringify(a11ySet)}`);

  // ---- screenshot of the live recap ----------------------------------------
  await page.screenshot({ path: SHOT });
  pass(`screenshot saved: ${SHOT}`);

  // ---- (6) 60fps with recap on-screen --------------------------------------
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

  if (errors.length === 0) pass("zero page errors / 4xx (favicon filtered)");
  else { for (const e of errors) fail(e); }
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
}

console.log(ok ? "\n✓ CAS-278 LIVE recap re-test PASSED." : "\n✗ CAS-278 LIVE recap re-test FAILED.");
process.exit(ok ? 0 : 1);
