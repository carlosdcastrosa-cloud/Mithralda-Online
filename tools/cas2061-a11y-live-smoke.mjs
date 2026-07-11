// ---------------------------------------------------------------------------
// CAS-2061 (design CAS-2057, build/deploy CAS-2058/CAS-2060, umbrella CAS-27)
// QA OBSERVABLE — GRANULAR PHOTOSENSITIVITY TOGGLES (hit-stop + crit/backstab flash)
// driven through the REAL browser loop against the LIVE gh-pages build.
//
// Complements the node proof (tools/cas2058-a11y-toggles.mjs, AC0-5 vs HEAD bytes).
// This harness boots the SERVED build, navigates to play, then drives the EXACT same
// gated paths — but against the running render loop in a real DOM. Because game.js
// imports "./sim/sim.js", a dynamic import(BASE+"sim/sim.js") resolves to the SAME
// cached ES-module singleton the game is running, so G.settings + dev.* mutate the
// live instance (no re-implementation, no forked state).
//
// Ticket ACs verified observably per profile (desktop + mobile):
//   AC0 [BOOT]    boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1 [FLASH]   reduceMotion OFF + shake ON, flash=false ⇒ a rear-arc backstab emits NO
//                 flash-banner floater (STR.backstab), but screen-SHAKE still fires; flash=true
//                 restores the banner. Shake independent ⇒ its own toggle.
//   AC2 [HITSTOP] hitStop=false ⇒ a heavy/crit swing leaves juiceState().hitstop===0 (frames
//                 NOT frozen); hitStop=true ⇒ hitstop>0. Plus ~60fps sustained through a
//                 hitStop=false impact burst (heavy hits don't stall the rAF loop).
//   AC3 [REDUCE]  reduceMotion=true still suppresses hit-stop regardless of settings.hitStop
//                 (no-regression); flash stays its own independent axis (== HEAD byte-behavior).
//   AC4 [SRAND]   toggles are presentation-only: srand fingerprint ON vs OFF byte-identical.
//   AC5 [PERSIST] flash=false+hitStop=false ⇒ settings.save() ⇒ page.reload ⇒ boot() rehydrates
//                 both to false; flip back to true + save + reload ⇒ both true again (restore).
//
// Run: node tools/cas2061-a11y-live-smoke.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2061";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const P = (m) => console.log("✔ " + m);
const F = (m) => { anyFail = true; console.error("✖ " + m); };

// Attach console/404 listeners for a page.
function watch(page) {
  const errors = [], http404 = [];
  page.on("response", (r) => { if (r.status() === 404) http404.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/status of 404/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon\.ico/i.test(u)) errors.push("requestfailed: " + u); });
  return { errors, http404 };
}

// menu → class-select → play
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "A11Y"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, http404 } = watch(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  // Boot fresh, but clear the SETTINGS blob only ONCE per tab (a sessionStorage sentinel survives
  // page.reload) — otherwise the reload in the persistence test would wipe the blob we just saved.
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1");
      if (!sessionStorage.getItem("__a11y_boot")) { localStorage.removeItem("mithralda.settings.v1"); sessionStorage.setItem("__a11y_boot", "1"); }
    } catch (e) {}
  });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await toPlay(page);
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // Bind the SERVED sim/settings/strings singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const settings = await import(base + "settings.js");
    const { STR } = await import(base + "strings.js");
    const cfg = await import(base + "sim/config.js");
    window.__a11y = { sim, settings, STR, cfg };
  }, BASE);

  // ---- AC-DEFAULT: served config + live defaults ----
  const dflt = await page.evaluate(() => {
    const { sim, cfg } = window.__a11y;
    return { cfgHit: cfg.JUICE.hitStop, cfgFlash: cfg.JUICE.flash, sHit: sim.G.settings.hitStop, sFlash: sim.G.settings.flash };
  });
  if (dflt.cfgHit === true && dflt.cfgFlash === true && dflt.sHit === true && dflt.sFlash === true)
    P(`[${prof.name}] DEFAULT: served JUICE.hitStop/flash:true + live G.settings.hitStop/flash:true (byte-preserved)`);
  else F(`[${prof.name}] DEFAULT mismatch: ${JSON.stringify(dflt)}`);

  // ---- AC-FLASH: reduceMotion OFF + shake ON, flash off ⇒ no banner, shake still fires ----
  const flash = await page.evaluate(() => {
    const { sim, STR } = window.__a11y; const { G, dev, rng, createHero } = sim;
    const fresh = (seed, flag) => {
      rng.seed(seed); createHero("A11Y", "warrior");
      G.enemies.length = 0; G.projectiles.length = 0; G.drops.length = 0; dev.clearFx();
      const s = G.settings; s.reduceMotion = false; s.shake = 1; s.hitStop = true; s.flash = flag;
    };
    const banners = () => dev.floaterDump().filter((f) => f.txt === STR.backstab).length;
    fresh(21, false); dev._primerBackstab(true); const bOff = banners(), shOff = dev.juiceState().shake;
    fresh(21, true);  dev._primerBackstab(true); const bOn  = banners(), shOn  = dev.juiceState().shake;
    return { bOff, bOn, shOff, shOn };
  });
  await page.screenshot({ path: `${OUT}/${prof.name}-flash-on.png` });
  if (flash.bOff === 0 && flash.bOn >= 1) P(`[${prof.name}] FLASH: off ⇒ ${flash.bOff} banner, on ⇒ ${flash.bOn} banner (STR.backstab) — re-enable restores`);
  else F(`[${prof.name}] FLASH gate broken: off=${flash.bOff} (want 0), on=${flash.bOn} (want ≥1)`);
  if (flash.shOff > 0 && flash.shOn > 0) P(`[${prof.name}] FLASH: screen-shake independent (off=${flash.shOff.toFixed(1)}, on=${flash.shOn.toFixed(1)}) — shake keeps firing`);
  else F(`[${prof.name}] FLASH: shake wrongly coupled: off=${flash.shOff}, on=${flash.shOn}`);

  // ---- AC-HITSTOP: hitStop off ⇒ heavy/crit swing does NOT freeze; on ⇒ freezes ----
  const hs = await page.evaluate(() => {
    const { sim } = window.__a11y; const { G, dev, rng, createHero } = sim;
    const fresh = (seed, flag) => {
      rng.seed(seed); createHero("A11Y", "warrior");
      G.enemies.length = 0; dev.clearFx(); const s = G.settings;
      s.reduceMotion = false; s.hitStop = flag; s.flash = true;
    };
    fresh(11, false); dev.juiceArena(1); dev.clearFx(); dev.forceCritSwing(); const off = dev.juiceState().hitstop;
    fresh(11, true);  dev.juiceArena(1); dev.clearFx(); dev.forceCritSwing(); const on  = dev.juiceState().hitstop;
    return { off, on };
  });
  if (hs.off === 0 && hs.on > 0) P(`[${prof.name}] HITSTOP: off ⇒ hitstop=${hs.off} (no freeze), on ⇒ hitstop=${hs.on} (>0)`);
  else F(`[${prof.name}] HITSTOP gate broken: off=${hs.off} (want 0), on=${hs.on} (want >0)`);

  // ~60fps through a hitStop=false impact burst (heavy hits don't stall the loop; rest of loop intact)
  const burst = await page.evaluate(() => new Promise((res) => {
    const { sim } = window.__a11y; sim.G.settings.hitStop = false; sim.G.settings.flash = true;
    let n = 0, evt = 0; const t0 = performance.now();
    const KILLS = ["orc", "wolf", "skeleton", "bandit", "wraith"];
    function tick(t) {
      n++; try { window.__dev.spawnKill(evt % 4 === 0 ? "golem" : KILLS[evt % KILLS.length]); evt++; } catch (e) {}
      if (t - t0 >= 1800) res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), events: evt }); else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: `${OUT}/${prof.name}-hitstop-off-burst.png` });
  if (burst.fps < 55) F(`[${prof.name}] HITSTOP: burst fps ${burst.fps} < 55 (${burst.events} hits) — loop stalled`);
  else P(`[${prof.name}] HITSTOP: ~60fps through hitStop=OFF burst ${burst.fps}fps / ${burst.events} heavy hits — rest of loop intact`);

  // ---- AC-REDUCE: reduceMotion=true suppresses hit-stop even with settings.hitStop=true ----
  const reduce = await page.evaluate(() => {
    const { sim, STR } = window.__a11y; const { G, dev, rng, createHero } = sim;
    rng.seed(31); createHero("A11Y", "warrior"); G.enemies.length = 0; dev.clearFx();
    G.settings.hitStop = true; G.settings.reduceMotion = true;
    dev.juiceArena(1); dev.clearFx(); dev.forceCritSwing(); const rmHit = dev.juiceState().hitstop;
    // flash independent axis under reduceMotion (== HEAD): banner still controlled by flash toggle only
    const banners = () => dev.floaterDump().filter((f) => f.txt === STR.backstab).length;
    rng.seed(32); createHero("A11Y", "warrior"); G.enemies.length = 0; dev.clearFx();
    G.settings.reduceMotion = true; G.settings.flash = true; dev._primerBackstab(true); const rmFlashOn = banners();
    dev.clearFx(); G.settings.flash = false; dev._primerBackstab(true); const rmFlashOff = banners();
    return { rmHit, rmFlashOn, rmFlashOff };
  });
  if (reduce.rmHit === 0) P(`[${prof.name}] REDUCE: reduceMotion=true suppresses hit-stop (hitstop=${reduce.rmHit}) even with settings.hitStop=true — no regression`);
  else F(`[${prof.name}] REDUCE: reduceMotion failed to kill hit-stop: ${reduce.rmHit}`);
  if (reduce.rmFlashOn >= 1 && reduce.rmFlashOff === 0) P(`[${prof.name}] REDUCE: flash stays its own axis under reduceMotion (on ⇒ ${reduce.rmFlashOn}, off ⇒ ${reduce.rmFlashOff}) — == HEAD`);
  else F(`[${prof.name}] REDUCE: flash/reduceMotion axis broken: on=${reduce.rmFlashOn}, off=${reduce.rmFlashOff}`);

  // ---- AC-SRAND: presentation-only ⇒ srand fingerprint byte-identical ON vs OFF vs MIX ----
  const srand = await page.evaluate(() => {
    const { sim } = window.__a11y; const { G, dev, rng, createHero } = sim;
    const fp = (hitStop, flash) => {
      rng.seed(500); createHero("A11Y", "warrior");
      G.enemies.length = 0; dev.clearFx(); const s = G.settings;
      s.reduceMotion = false; s.hitStop = hitStop; s.flash = flash;
      dev.juiceArena(2); dev.clearFx(); dev.forceCritSwing(); dev._primerBackstab(true); dev._primerBackstab(false);
      return [rng.srand(), rng.srand(), rng.srand(), rng.srand()].map((x) => Math.round(x * 1e9)).join(",");
    };
    return { on: fp(true, true), off: fp(false, false), mix: fp(true, false) };
  });
  if (srand.on === srand.off && srand.off === srand.mix) P(`[${prof.name}] SRAND: fingerprint byte-identical ON/OFF/MIX (0 draws added)`);
  else F(`[${prof.name}] SRAND: toggles perturbed RNG: on=${srand.on} off=${srand.off} mix=${srand.mix}`);

  // ---- AC-PERSIST: save(false,false) → reload → rehydrates false; then restore true → reload → true ----
  await page.evaluate(() => {
    const { sim, settings } = window.__a11y;
    sim.G.settings.hitStop = false; sim.G.settings.flash = false; settings.save();
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const afterFalse = await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js"); const settings = await import(base + "settings.js");
    window.__a11y = { sim, settings };
    return { hitStop: sim.G.settings.hitStop, flash: sim.G.settings.flash, saved: JSON.parse(localStorage.getItem("mithralda.settings.v1") || "null") };
  }, BASE);
  if (afterFalse.hitStop === false && afterFalse.flash === false && afterFalse.saved && afterFalse.saved.hitStop === false && afterFalse.saved.flash === false)
    P(`[${prof.name}] PERSIST: {false,false} survives reload — G.settings.hitStop=${afterFalse.hitStop}, flash=${afterFalse.flash}; blob=${JSON.stringify({h:afterFalse.saved.hitStop,f:afterFalse.saved.flash})}`);
  else F(`[${prof.name}] PERSIST reload(false) failed: ${JSON.stringify(afterFalse)}`);

  await page.evaluate(() => { const { sim, settings } = window.__a11y; sim.G.settings.hitStop = true; sim.G.settings.flash = true; settings.save(); });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const afterTrue = await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    return { hitStop: sim.G.settings.hitStop, flash: sim.G.settings.flash };
  }, BASE);
  if (afterTrue.hitStop === true && afterTrue.flash === true) P(`[${prof.name}] PERSIST: re-enable {true,true} survives reload — restore confirmed`);
  else F(`[${prof.name}] PERSIST reload(true) restore failed: ${JSON.stringify(afterTrue)}`);

  // ---- boot/play cleanliness ----
  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) { F(`[${prof.name}] non-favicon 404s (${bad404.length}): ${bad404.slice(0,3).join(", ")}`); }
  else if (http404.length) P(`[${prof.name}] only cosmetic favicon.ico 404 (sev-4, known)`);
  if (errors.length) { F(`[${prof.name}] console errors (${errors.length}): ${errors.slice(0,3).join(" | ")}`); }
  else P(`[${prof.name}] CLEAN: zero game-JS errors boot→play→toggle→reload`);

  await page.close();
}
await browser.close();
if (anyFail) { console.error("\n❌ CAS-2061 A11Y LIVE OBSERVABLE — FAIL"); process.exit(1); }
console.log("\n✅ CAS-2061 A11Y LIVE OBSERVABLE — ALL PASS (flash+hitStop toggles observable, shake independent, reduceMotion no-regression, srand-neutral, persist reload — desktop + mobile)");
