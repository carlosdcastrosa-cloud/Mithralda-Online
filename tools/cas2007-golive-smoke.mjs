// CAS-2007 (parent CAS-2004) — QA boot smoke for the Balance Tier-1 go-live (build 91b4c9956255).
// Proves the served balance build BOOTS + PLAYS with ZERO game-JS errors on desktop + mobile, and
// runs at ~60fps (rAF sampling in-page). Config-only pass ⇒ no new scene/key; this just guards that
// the re-tuned config.js didn't break boot and the game loop stays smooth. Also reads the 7 knobs
// from the SERVED build via a module import in-page to confirm DESPUÉS values reach the browser.
// Run: node tools/cas2007-golive-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2007";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "BAL"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // ---- FPS probe: count rAF frames over ~1.5s (60fps DoD) ----
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick(t) { n++; if (t - t0 >= 1500) res(+(n / ((t - t0) / 1000)).toFixed(1)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  if (fps < 55) { anyFail = true; console.error(`✖ [${prof.name}] FPS ${fps} < 55 (not ~60fps)`); }
  else console.log(`✔ [${prof.name}] game loop ~60fps (measured ${fps})`);

  // ---- served config reaches the browser with DESPUÉS values ----
  const knobs = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    return { staggerPunishMul: c.COMBO.staggerPunishMul, bossBonus: c.POISE.boss.bonusDmg, riposteMult: c.CFG.riposteMult,
      whet: c.WEAPON_BUFFS.types.whet.dmgMul, regen: c.STAMINA.regen, poiseThr: c.HYPERARMOR.poiseThreshold, bleed: c.STATUS_BUILDUP.types.bleed.procPctHp };
  }, BASE);
  const EXP = { staggerPunishMul: 1.6, bossBonus: 1.6, riposteMult: 2, whet: 1.22, regen: 17, poiseThr: 24, bleed: 0.11 };
  const mismatch = Object.keys(EXP).filter((k) => knobs[k] !== EXP[k]);
  if (mismatch.length) { anyFail = true; console.error(`✖ [${prof.name}] served knobs mismatch: ${mismatch.map((k) => `${k}=${knobs[k]}≠${EXP[k]}`).join(", ")}`); }
  else console.log(`✔ [${prof.name}] served config = 7 DESPUÉS knobs byte-correct in-browser`);

  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) { anyFail = true; console.error(`✖ [${prof.name}] non-favicon 404s (${bad404.length}):`); bad404.forEach((u) => console.error("  " + u)); }
  else if (http404.length) console.log(`✔ [${prof.name}] only cosmetic favicon.ico 404 (sev-4, known)`);
  if (errors.length) { anyFail = true; console.error(`✖ [${prof.name}] boot/play console errors (${errors.length}):`); errors.forEach((e) => console.error("  " + e)); }
  else console.log(`✔ [${prof.name}] CLEAN: zero game-JS errors boot→play`);
  await page.close();
}
await browser.close();
if (anyFail) process.exit(1);
console.log("done →", OUT);
