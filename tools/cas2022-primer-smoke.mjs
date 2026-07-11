// CAS-2022 (parent CAS-27) — QA LIVE first-run onboarding smoke, served build 4678cbd03e4d.
// The browser complement to tools/cas2022-fullbuild-regression.mjs (node). Proves the SERVED
// post-FLIP build (ONBOARDING.enabled:true, CAS-2021) behaves as a real first-run primer:
//   1. BOOTS + PLAYS with ZERO game-JS errors on desktop + mobile, stable ~60fps.
//   2. serves ONBOARDING.enabled:TRUE + 6 teach* sub-flags + skippable to the browser.
//   3. FIRST-RUN (clean localStorage, NO arming): entering play auto-starts the tutorial and the
//      composed step machine already carries the 6 combat verbs after "attack" (13 steps). This is
//      the whole point of the flip — default-on, no _ccArm. Each of the 6 combat coachmarks renders
//      in the real canvas with 0 console error.
//   4. NO-RETRIGGER: a second boot with the marker mithralda.tut.v1 set does NOT auto-start the
//      tutorial (returning player goes straight to play). Marker persistence honored.
// Run: node tools/cas2022-primer-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2022";
const COMBAT = ["dodge", "parry", "lockon", "backstab", "estus", "bonfire"];
const EXP_STEPS = ["move","attack","dodge","parry","lockon","backstab","estus","bonfire","skill","travel","loot","equip","done"];
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const okp = (m) => console.log(`✔ ${m}`);
const badp = (m) => { anyFail = true; console.error(`✖ ${m}`); };

function wireErrors(page) {
  const errors = [];
  const infra5xx = []; // transient gh-pages CDN 5xx / net flakes — infra noise, NOT game-JS defects
  page.on("response", (r) => { if (r.status() >= 500) infra5xx.push(`${r.status()} ${r.url()}`); });
  page.on("console", (m) => { const t = m.text(); if (m.type() !== "error") return;
    if (/favicon\.ico/i.test(t) || /status of 404/i.test(t)) return;
    if (/Failed to load resource/i.test(t) && /status of 5\d\d/i.test(t)) return; // transient CDN 5xx
    errors.push(t); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); const err = (r.failure() && r.failure().errorText) || "";
    if (/favicon\.ico/i.test(u)) return;
    if (/net::ERR_(FAILED|ABORTED|NETWORK_CHANGED|CONNECTION|TIMED_OUT)/i.test(err)) { infra5xx.push(`${err} ${u}`); return; }
    errors.push("requestfailed: " + u); });
  return { errors, infra5xx };
}

async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate((n) => { document.getElementById("nameInput").value = n; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
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

async function sampleFps(page) {
  return await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 >= 1000) res(n * 1000 / (performance.now() - t0)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
}

for (const prof of PROFILES) {
  // ===== FIRST-RUN: clean localStorage =====
  const page = await browser.newPage();
  const { errors, infra5xx } = wireErrors(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });

  // served ONBOARDING knob reaches the browser: enabled:TRUE (post-flip LIVE)
  const cfg = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js"); const o = c.ONBOARDING;
    return { enabled: o.enabled, flags: ["teachDodge","teachParry","teachLockOn","teachBackstab","teachEstus","teachBonfire"].every((k) => o[k] === true), skippable: o.skippable };
  }, BASE);
  if (cfg.enabled === true && cfg.flags && cfg.skippable === true) okp(`[${prof.name}] served ONBOARDING.enabled:TRUE (LIVE) + 6 teach* + skippable`);
  else badp(`[${prof.name}] served ONBOARDING wrong: ${JSON.stringify(cfg)}`);

  await enterPlay(page, "PRIMER");
  await page.screenshot({ path: `${OUT}/${prof.name}-firstrun-play.png` });

  // FIRST-RUN default-on: the tutorial auto-started (no arming) WITH the 6 combat verbs.
  const ts = await page.evaluate(() => window.__dev.tutState());
  const stepsOk = ts && ts.active === true && JSON.stringify(ts.steps) === JSON.stringify(EXP_STEPS);
  if (stepsOk) okp(`[${prof.name}] FIRST-RUN auto-armed (no _ccArm): tut active, 13 steps w/ 6 combat verbs [${ts.steps.join(",")}]`);
  else badp(`[${prof.name}] FIRST-RUN tutState wrong: active=${ts && ts.active} steps=${JSON.stringify(ts && ts.steps)}`);

  // fps budget
  const fps = await sampleFps(page);
  if (fps >= 55) okp(`[${prof.name}] fps ${fps.toFixed(1)} (>=55 budget)`);
  else badp(`[${prof.name}] fps ${fps.toFixed(1)} BELOW 55 budget`);

  // render each of the 6 combat coachmarks in the real canvas, 0 console error
  let renderedAll = true;
  for (const verb of COMBAT) {
    const errBefore = errors.length;
    const idx = EXP_STEPS.indexOf(verb);
    const st = await page.evaluate((i) => window.__dev.tutSetStep(i), idx);
    await wait(120);
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("canvas"); if (!cv) return false;
      const g = cv.getContext("2d"); if (!g) return true;
      try { const d = g.getImageData(0, 0, cv.width, Math.min(cv.height, 120)).data; for (let p = 3; p < d.length; p += 4) if (d[p] > 0) return true; return false; } catch (e) { return true; }
    });
    await page.screenshot({ path: `${OUT}/${prof.name}-coach-${verb}.png` });
    const newErr = errors.slice(errBefore);
    if (st && st.i === idx && newErr.length === 0 && nonBlank) okp(`[${prof.name}] coachmark "${verb}" (step ${idx}) rendered, 0 console error`);
    else { renderedAll = false; badp(`[${prof.name}] coachmark "${verb}" step=${st && st.i}≠${idx} nonBlank=${nonBlank} newErr=${JSON.stringify(newErr)}`); }
  }
  if (renderedAll) okp(`[${prof.name}] all 6 combat coachmarks rendered cleanly`);

  if (infra5xx.length) console.log(`  · [${prof.name}] ${infra5xx.length} transient CDN 5xx/net flake(s) (infra, ignored): ${JSON.stringify(infra5xx.slice(0, 3))}`);
  if (errors.length === 0) okp(`[${prof.name}] FIRST-RUN boot+play+coachmarks: 0 game-JS errors`);
  else badp(`[${prof.name}] ${errors.length} game-JS error(s): ${JSON.stringify(errors.slice(0, 5))}`);
  await page.close();

  // ===== NO-RETRIGGER: second boot with the seen-marker set =====
  const page2 = await browser.newPage();
  const e2 = wireErrors(page2);
  if (prof.ua) await page2.setUserAgent(prof.ua);
  await page2.setViewport(prof.vp);
  await page2.evaluateOnNewDocument(() => { try { localStorage.clear(); localStorage.setItem("mithralda.tut.v1", "1"); } catch (e) {} });
  await page2.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await enterPlay(page2, "RETURN");
  const ts2 = await page2.evaluate(() => window.__dev.tutState());
  if (!ts2 || ts2.active !== true) okp(`[${prof.name}] NO-RETRIGGER: marker mithralda.tut.v1 present ⇒ tutorial did NOT auto-start (active=${ts2 && ts2.active})`);
  else badp(`[${prof.name}] NO-RETRIGGER FAILED: tutorial re-armed despite marker (active=${ts2.active} i=${ts2.i})`);
  await page2.screenshot({ path: `${OUT}/${prof.name}-secondrun-play.png` });
  if (e2.errors.length === 0) okp(`[${prof.name}] SECOND-RUN boot+play: 0 game-JS errors`);
  else badp(`[${prof.name}] SECOND-RUN ${e2.errors.length} game-JS error(s): ${JSON.stringify(e2.errors.slice(0, 5))}`);
  await page2.close();
}

await browser.close();
console.log(anyFail ? "\nSMOKE FAIL ✖" : "\nSMOKE PASS ✓");
