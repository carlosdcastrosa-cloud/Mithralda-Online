// ---------------------------------------------------------------------------
// CAS-280 — QA LIVE verify of CAS-279 Stage-1 retention instrumentation overlay.
//
// Independent re-test that drives the REAL deployed build on gh-pages (NOT a
// local static server). Proves the change is MEASUREMENT-ONLY / soak-safe:
//   0) live build-id byte-match (2e67c5b31cd4) + HTTP 200, overlay.js served
//   1) [DEFAULT-OFF] fresh load: overlay hidden, no mithralda.overlay.v1 key,
//      nothing new painted (#telemetry display:none / isOn=false)
//   2) [TOGGLE] F9 toggles HUD on/off; persists in its OWN localStorage key only;
//      does NOT touch save (mithralda.save.v1) or a11y prefs (mithralda.settings.v1)
//   3) [ZERO-DIFF] overlay toggle leaves the sim byte-identical (scene + hero stats);
//      core loops behave identically with overlay OFF (combat/forge/elite/recap)
//   4) [SOAK] 0 console errors + 0 4xx; FPS >= 58 with overlay OFF and ON;
//      counters are READ-ONLY over analytics.js/daily.js (report() before==after toggle)
//   5) [REGRESSION] core loop spawn->hunt->die->recap->retry intact;
//      a11y toggles (colorblind / reduce-motion / rebind) unaffected by overlay
//   6) [PII] stored analytics blob stays anonymous (no hero name / personal fields)
//
// Run: node tools/cas280-overlay-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const WANT_BUILD = "2e67c5b31cd4";
const SHOT = join(ROOT, "tools", "cas280-overlay-live.png");
let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const dwell = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const report = (page) => page.evaluate(() => { try { return window.__analytics.report(); } catch (e) { return null; } });
const events = (page) => page.evaluate(() => { try { return (window.__analytics.report().events) || {}; } catch (e) { return {}; } });

async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate((nm) => {
    document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  }, name);
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 6000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 6000 });
  await page.evaluate(() => { if (window.__dev.tutState && window.__dev.tutState().active) window.__dev.tutSkip(); });
}

async function sampleFps(page, label) {
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
  log(`FPS (${label}): [${fpsList.join(", ")}]  min=${minFps}`);
  return minFps;
}

try {
  // ---- (0) live build-id byte-match ----------------------------------------
  const vjson = await (await fetch(`${LIVE}/version.json`)).json();
  if (vjson.build === WANT_BUILD) pass(`live build-id byte-match: ${vjson.build} (${vjson.files} files)`);
  else fail(`live build-id MISMATCH: got ${vjson.build}, want ${WANT_BUILD}`);
  const ov = await fetch(`${LIVE}/overlay.js`);
  if (ov.status === 200) pass(`overlay.js served live (HTTP ${ov.status})`);
  else fail(`overlay.js not served: HTTP ${ov.status}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

  // fresh storage so this is a TRUE first session
  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.evaluate(() => { try {
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1");
    localStorage.removeItem("mithralda.analytics.v1"); localStorage.removeItem("mithralda.overlay.v1");
    localStorage.removeItem("mithralda.settings.v1");
  } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__analytics && window.__overlay && window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.bringToFront();

  // ---- (1) DEFAULT-OFF -----------------------------------------------------
  const off = await page.evaluate(() => {
    const el = document.getElementById("telemetry");
    return { isOn: window.__overlay.isOn(), disp: el ? getComputedStyle(el).display : "(no-el)",
             keyExists: localStorage.getItem("mithralda.overlay.v1") !== null };
  });
  if (off.isOn === false && off.disp !== "block" && off.keyExists === false)
    pass(`[DEFAULT-OFF] overlay hidden on fresh load (isOn=false, display=${off.disp}, no overlay key)`);
  else fail(`[DEFAULT-OFF] overlay not clean-off: ${JSON.stringify(off)}`);

  await enterPlay(page, "QAOverlay");
  await dwell(150);
  pass("entered play as 'warrior' on LIVE build");

  // exercise the real loops so the telemetry has data to read
  await page.evaluate(() => { window.__dev.tpZone("forest"); for (let i = 0; i < 6; i++) window.__dev.spawnKill("wolf"); });
  await page.evaluate(() => window.__dev.eliteSpawnKill("orc", "forest"));
  await dwell(200);

  // ---- (3) ZERO-DIFF baseline: sim state with overlay OFF ------------------
  const simBefore = await page.evaluate(() => ({ scene: window.__dev.scene(), hero: window.__dev.heroStats ? window.__dev.heroStats() : null }));
  // analytics slice with TIME-DERIVED fields stripped: sessionMin/totalPlayMin accrue
  // with wall-clock time regardless of the overlay, so they're not part of "read-only".
  const stripTime = (r) => {
    if (!r) return "null";
    const gp = r.gameplay || {}, S = { ...(gp.session || {}) }, L = { ...(gp.lifetime || {}) }, ret = { ...(r.retention || {}) };
    delete S.sessionMin; delete L.sessionMin; delete ret.totalPlayMin;
    return JSON.stringify({ session: S, lifetime: L, ret });
  };

  // FPS with overlay OFF
  const fpsOff = await sampleFps(page, "overlay OFF");
  if (fpsOff >= 58) pass(`[SOAK] FPS held >= 58 with overlay OFF (min ${fpsOff})`); else fail(`[SOAK] FPS < 58 overlay OFF: ${fpsOff}`);

  // ---- invariance baseline: save/settings/analytics right before any toggle -
  const invBefore = await page.evaluate(() => ({
    save: localStorage.getItem("mithralda.save.v1"),
    settings: localStorage.getItem("mithralda.settings.v1"),
  }));
  const repBefore = await report(page);

  // ---- (2) TOGGLE on ------------------------------------------------------
  await key(page, "F9");
  await dwell(150);
  const onState = await page.evaluate(() => {
    const el = document.getElementById("telemetry");
    return { isOn: window.__overlay.isOn(), disp: el ? getComputedStyle(el).display : "(none)", txt: el ? el.textContent : "",
             overlayKey: localStorage.getItem("mithralda.overlay.v1") };
  });
  const txt = onState.txt || "";
  if (onState.isOn === true && onState.disp === "block" &&
      /RETENTION TELEMETRY/.test(txt) && /kills\/ronda/.test(txt) && /OTRA RONDA/.test(txt) && /EMBUDO/.test(txt))
    pass(`[TOGGLE] F9 -> overlay visible with retention/session/funnel sections`);
  else fail(`[TOGGLE] overlay text missing sections: isOn=${onState.isOn} disp=${onState.disp} txt="${txt.slice(0,120)}"`);
  if (onState.overlayKey === "1") pass(`[TOGGLE] own localStorage key set (mithralda.overlay.v1="1")`);
  else fail(`[TOGGLE] overlay key not written: ${onState.overlayKey}`);

  // confirm the toggle-ON did NOT modify save or a11y settings (it owns only its key).
  // NOTE: a save blob may already exist from the game's own autosave during play — the
  // claim under test is that the OVERLAY TOGGLE does not write/modify it, so we compare
  // against the pre-toggle snapshot rather than asserting absence.
  const keysAfterOn = await page.evaluate(() => ({
    save: localStorage.getItem("mithralda.save.v1"),
    settings: localStorage.getItem("mithralda.settings.v1"),
  }));
  if (keysAfterOn.save === invBefore.save && keysAfterOn.settings === invBefore.settings)
    pass(`[TOGGLE] overlay toggle did not modify save / a11y settings (settings still ${keysAfterOn.settings === null ? "absent" : "unchanged"})`);
  else fail(`[TOGGLE] overlay toggle modified unrelated keys: before=${JSON.stringify(invBefore)} after=${JSON.stringify(keysAfterOn)}`);

  // FPS with overlay ON
  const fpsOn = await sampleFps(page, "overlay ON");
  if (fpsOn >= 58) pass(`[SOAK] FPS held >= 58 with overlay ON (min ${fpsOn})`); else fail(`[SOAK] FPS < 58 overlay ON: ${fpsOn}`);

  // ---- (4) READ-ONLY: gameplay/retention counters identical across a toggle -
  await key(page, "F9"); await dwell(80); await key(page, "F9"); await dwell(80);
  const repAfter = await report(page);
  if (stripTime(repBefore) === stripTime(repAfter))
    pass(`[SOAK] analytics counters identical across toggle cycle (read-only; time fields excluded)`);
  else fail(`[SOAK] analytics counters changed across pure toggle:\n  before=${stripTime(repBefore)}\n  after =${stripTime(repAfter)}`);

  // ---- (3) ZERO-DIFF: sim byte-identical after toggling --------------------
  const simAfter = await page.evaluate(() => ({ scene: window.__dev.scene(), hero: window.__dev.heroStats ? window.__dev.heroStats() : null }));
  if (simBefore.scene === simAfter.scene && JSON.stringify(simBefore.hero) === JSON.stringify(simAfter.hero))
    pass(`[ZERO-DIFF] overlay toggle left sim state byte-identical (scene=${simAfter.scene})`);
  else fail(`[ZERO-DIFF] overlay toggle changed sim: ${JSON.stringify(simBefore)} -> ${JSON.stringify(simAfter)}`);

  // ---- (3b) ZERO-DIFF loops with overlay OFF: forge works -----------------
  await page.evaluate(() => { window.__overlay.hide(); window.__dev.setGold(9999); window.__dev.setMats(99); window.__dev.openForge(); });
  await page.waitForFunction("window.__dev.scene() === 'forge'", { timeout: 5000 });
  await key(page, "Enter");
  await dwell(200);
  const forgeEv = (await events(page)).forge_upgrade;
  if (forgeEv && forgeEv.n >= 1) pass(`[ZERO-DIFF] Forja upgrade works with overlay off (forge_upgrade n=${forgeEv.n})`);
  else fail(`[ZERO-DIFF] forge loop broken: ${JSON.stringify(forgeEv)}`);
  await page.evaluate(() => { if (window.__dev.scene() === "forge") window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); });
  await dwell(80);

  // ---- (5) REGRESSION: death -> recap -> retry core loop ------------------
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene() === 'dead'", { timeout: 6000 });
  await dwell(120);
  const recapShown = (await events(page)).recap_shown;
  if (recapShown && recapShown.n >= 1) pass(`[REGRESSION] recap shown on death (recap_shown n=${recapShown.n})`);
  else fail(`[REGRESSION] recap not shown: ${JSON.stringify(recapShown)}`);
  await key(page, "Space");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 }).catch(() => {});
  const retryScene = await page.evaluate(() => window.__dev.scene());
  if (retryScene === "play") pass(`[REGRESSION] "otra ronda" retry -> fresh run (scene ${retryScene})`);
  else fail(`[REGRESSION] retry failed: scene=${retryScene}`);

  // ---- (5b) REGRESSION: a11y toggles unaffected ---------------------------
  await page.evaluate(() => { window.__dev.setReduceMotionPref(true); window.__dev.setColorblind(true); });
  const a11y = await page.evaluate(() => window.__dev.settingsState());
  if (a11y.reduceMotion === true && a11y.colorblind === true)
    pass(`[REGRESSION] a11y toggles work with overlay present (reduceMotion + colorblind on)`);
  else fail(`[REGRESSION] a11y toggle broken: ${JSON.stringify(a11y)}`);
  // overlay still toggles under reduce-motion
  await key(page, "F9"); await dwell(100);
  const a11yOverlay = await page.evaluate(() => window.__overlay.isOn());
  if (a11yOverlay === true) pass(`[REGRESSION] overlay still toggles under reduce-motion/colorblind`);
  else fail(`[REGRESSION] overlay toggle broke under a11y: isOn=${a11yOverlay}`);

  // ---- (2b) PERSIST: overlay ON survives reload, own key only -------------
  await page.evaluate(() => window.__overlay.show());
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__overlay", { timeout: 20000 });
  await dwell(150);
  const persisted = await page.evaluate(() => window.__overlay.isOn());
  if (persisted === true) pass(`[TOGGLE] overlay ON choice restored after reload (own key)`);
  else fail(`[TOGGLE] overlay choice not restored: isOn=${persisted}`);

  // screenshot of the live overlay on-screen
  await page.screenshot({ path: SHOT });
  pass(`screenshot saved: ${SHOT}`);

  // ---- (6) PII: stored blob anonymous -------------------------------------
  const blobStr = await page.evaluate(() => { try { return JSON.stringify(window.__analytics.dump ? window.__analytics.dump() : window.__analytics.report()); } catch (e) { return "{}"; } });
  if (!/QAOverlay/.test(blobStr) && !/password|email|\bip\b/i.test(blobStr))
    pass(`[PII] stored analytics blob anonymous (no hero name / personal fields)`);
  else fail(`[PII] blob may contain PII: ${blobStr.slice(0, 200)}`);

  // ---- (4) zero errors -----------------------------------------------------
  if (errors.length === 0) pass(`[SOAK] zero JS errors / 4xx across the run (favicon filtered)`);
  else { for (const e of errors) fail(e); }

} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
}

console.log(ok ? "\n✓ CAS-280 LIVE overlay QA PASSED." : "\n✗ CAS-280 LIVE overlay QA FAILED.");
process.exit(ok ? 0 : 1);
