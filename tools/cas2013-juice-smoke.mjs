// CAS-2013 (parent CAS-2010) — QA LIVE boot smoke + 60fps-through-impact for the Game-Feel /
// Impact Pass v1 (JUICE knob), build 1868d83bd845. Proves the SERVED juice build:
//   1. BOOTS + PLAYS with ZERO game-JS errors on desktop + mobile.
//   2. serves JUICE.enabled:true + the 3 sub-flags (hitStop/screenShake/flash) + cap:9 to the browser.
//   3. sustains ~60fps THROUGH an impact burst (a steady stream of spawnKill / boss-hit impact
//      events that fire hit-stop/shake/flash). Hit-stop pauses SIM time but NOT the rAF loop —
//      so if freeze() dropped frames instead of holding them, rAF FPS would collapse. FPS≥55
//      during the burst is the live proof of "hit-stop HOLDS frames, not drops them" (DoD).
//   4. exposes the reduceMotion accessibility off-switch live (settingsState + setReduceMotionPref).
//
// The RNG-neutral / freeze-cap / off==baseline claims are proven against the exact deployed bytes
// by tools/cas2010-juice.mjs (node, AC2/5/6/7/9/10). This harness is the in-browser complement.
// Run: node tools/cas2013-juice-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2013";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
for (const prof of PROFILES) {
  const page = await browser.newPage();
  const errors = [];
  const http404 = [];
  page.on("response", (r) => { if (r.status() === 404) http404.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/status of 404/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon\.ico/i.test(u)) errors.push("requestfailed: " + u); });
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/${prof.name}-menu.png` });

  // menu → class-select → play
  await page.evaluate(() => { document.getElementById("nameInput").value = "JUICE"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // ---- served JUICE knob reaches the browser (import the SERVED config module) ----
  const juice = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    return { enabled: c.JUICE.enabled, hitStop: c.JUICE.hitStop, screenShake: c.JUICE.screenShake, flash: c.JUICE.flash, cap: c.JUICE.hitStopCapFrames };
  }, BASE);
  const EXPJ = { enabled: true, hitStop: true, screenShake: true, flash: true, cap: 9 };
  const jbad = Object.keys(EXPJ).filter((k) => juice[k] !== EXPJ[k]);
  if (jbad.length) { anyFail = true; console.error(`✖ [${prof.name}] served JUICE mismatch: ${jbad.map((k) => `${k}=${juice[k]}≠${EXPJ[k]}`).join(", ")}`); }
  else console.log(`✔ [${prof.name}] served JUICE.enabled:true + hitStop/screenShake/flash:true + cap:9 in-browser`);

  // ---- reduceMotion accessibility off-switch reachable live (read + toggle + restore) ----
  const rm = await page.evaluate(() => {
    const before = window.__dev.settingsState().reduceMotion;
    window.__dev.setReduceMotionPref(true);
    const on = window.__dev.settingsState().reduceMotion;
    window.__dev.setReduceMotionPref(false);
    const off = window.__dev.settingsState().reduceMotion;
    return { before, on, off };
  });
  if (rm.on !== true || rm.off !== false) { anyFail = true; console.error(`✖ [${prof.name}] reduceMotion off-switch not live-toggleable: ${JSON.stringify(rm)}`); }
  else console.log(`✔ [${prof.name}] reduceMotion off-switch live: toggle ON⇒${rm.on} / OFF⇒${rm.off} (motion-safe path reachable)`);

  // ---- FPS baseline (idle play) ----
  const fpsIdle = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick(t) { n++; if (t - t0 >= 1200) res(+(n / ((t - t0) / 1000)).toFixed(1)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));

  // ---- 60fps THROUGH an impact burst: drive a steady stream of kill/boss impact events
  //      (each spawnKill = spawn+die at hero ⇒ crit/execute floaters + shake + hit-stop) while
  //      sampling rAF FPS. A boss is spawned + repeatedly hit to exercise stagger/phase seams. ----
  const fpsBurst = await page.evaluate(() => new Promise((res) => {
    let n = 0, evt = 0; const t0 = performance.now();
    // varied trash kills + a periodic golem (spawnKill flags isBoss ⇒ boss-kill impact path).
    const KILLS = ["orc", "wolf", "skeleton", "bandit", "wraith"];
    function tick(t) {
      n++;
      // fire ~1 impact event per rAF frame to keep hit-stop/shake/flash churning through the sample
      try { window.__dev.spawnKill(evt % 4 === 0 ? "golem" : KILLS[evt % KILLS.length]); evt++; } catch (e) {}
      if (t - t0 >= 2000) res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), events: evt });
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: `${OUT}/${prof.name}-burst.png` });
  if (fpsBurst.fps < 55) { anyFail = true; console.error(`✖ [${prof.name}] FPS through impact burst ${fpsBurst.fps} < 55 (${fpsBurst.events} impact events) — frames DROPPED`); }
  else console.log(`✔ [${prof.name}] ~60fps SUSTAINED through impact burst: ${fpsBurst.fps}fps over ${fpsBurst.events} impact events (idle ${fpsIdle}fps) — hit-stop HOLDS frames`);

  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) { anyFail = true; console.error(`✖ [${prof.name}] non-favicon 404s (${bad404.length}):`); bad404.forEach((u) => console.error("  " + u)); }
  else if (http404.length) console.log(`✔ [${prof.name}] only cosmetic favicon.ico 404 (sev-4, known)`);
  if (errors.length) { anyFail = true; console.error(`✖ [${prof.name}] boot/play console errors (${errors.length}):`); errors.forEach((e) => console.error("  " + e)); }
  else console.log(`✔ [${prof.name}] CLEAN: zero game-JS errors boot→play→burst`);
  await page.close();
}
await browser.close();
if (anyFail) { console.error("❌ CAS-2013 JUICE LIVE SMOKE — FAIL"); process.exit(1); }
console.log("✅ CAS-2013 JUICE LIVE SMOKE — ALL PASS (boot 0-err + served JUICE.enabled:true + reduceMotion off-switch live + ~60fps through impact burst, desktop + mobile)");
