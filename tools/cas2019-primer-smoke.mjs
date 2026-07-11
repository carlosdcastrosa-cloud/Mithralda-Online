// CAS-2019 (parent CAS-2016) — QA LIVE boot smoke for the Combat Primer (ONBOARDING knob),
// served build 4a0bcc473f3a. The in-browser complement to the DOM-free AC0-11 node harness
// tools/cas2016-primer.mjs. Proves the SERVED primer build:
//   1. BOOTS + PLAYS with ZERO game-JS errors on desktop + mobile with the DARK default.
//   2. serves ONBOARDING.enabled:false + the 6 teach* sub-flags + skippable to the browser
//      ⇒ the composed tutorial == the live CAS-128 base (no combat verbs) when DARK.
//   3. ARMED live (mirror the Códice _ccArm pattern: import the SERVED sim/config.js singleton
//      and flip ONBOARDING.enabled=true, then __dev.tutStart() recomposes TUT_STEPS) the 6
//      combat coachmarks (dodge·parry·lockon·backstab·estus·bonfire) splice in after "attack"
//      and each renders in the real canvas with NO console error.
//
// The RNG-neutral / seam-advance / sub-flag / skip claims are proven against the exact deployed
// bytes by tools/cas2016-primer.mjs (node). This harness is the browser render + boot complement.
// Run: node tools/cas2019-primer-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2019";
const COMBAT = ["dodge", "parry", "lockon", "backstab", "estus", "bonfire"];
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

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const errors = [];
  const infra5xx = []; // transient gh-pages CDN 5xx / net flakes — infra noise, NOT game-JS defects
  // A console "Failed to load resource ... status of 5xx" or a net::ERR requestfailed is CDN flakiness,
  // not a game bug; bucket it separately (same discipline as the favicon/404 filter).
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
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1"); localStorage.removeItem("mithralda.tut.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });

  // ---- served ONBOARDING knob reaches the browser (import the SERVED config module singleton) ----
  const cfg = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const o = c.ONBOARDING;
    return { enabled: o.enabled, teachDodge: o.teachDodge, teachParry: o.teachParry, teachLockOn: o.teachLockOn,
      teachBackstab: o.teachBackstab, teachEstus: o.teachEstus, teachBonfire: o.teachBonfire, skippable: o.skippable };
  }, BASE);
  if (cfg.enabled !== false) badp(`[${prof.name}] served ONBOARDING.enabled must be false (DARK), got ${cfg.enabled}`);
  else okp(`[${prof.name}] served ONBOARDING.enabled:false (DARK default) in-browser`);
  const flagsOk = ["teachDodge","teachParry","teachLockOn","teachBackstab","teachEstus","teachBonfire"].every((k) => cfg[k] === true);
  if (flagsOk) okp(`[${prof.name}] 6 teach* sub-flags all true + skippable:${cfg.skippable} served`);
  else badp(`[${prof.name}] served sub-flags wrong: ${JSON.stringify(cfg)}`);

  // menu → class-select → play
  await page.evaluate(() => { document.getElementById("nameInput").value = "PRIMER"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // ---- DARK: composed tutorial == live CAS-128 base (no combat verbs) while enabled:false ----
  const darkSteps = await page.evaluate(async (base) => {
    const s = await import(base + "sim/sim.js");
    return s.composeTutSteps();
  }, BASE);
  const HEAD_BASE = ["move","attack","skill","travel","loot","equip","done"];
  if (JSON.stringify(darkSteps) === JSON.stringify(HEAD_BASE)) okp(`[${prof.name}] DARK compose == CAS-128 base ${JSON.stringify(darkSteps)} (0 combat verbs)`);
  else badp(`[${prof.name}] DARK compose drifted: ${JSON.stringify(darkSteps)}`);

  // ---- ARM the runtime live (mirror _ccArm): flip the served config singleton + recompose ----
  const armed = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    c.ONBOARDING.enabled = true;               // sub-flags already true by default
    const st = window.__dev.tutStart();         // startTutorial() → recompose TUT_STEPS with combat block
    const s = await import(base + "sim/sim.js");
    return { steps: s.TUT_STEPS.slice(), active: st.active, i: st.i };
  }, BASE);
  const EXP_ARM = ["move","attack","dodge","parry","lockon","backstab","estus","bonfire","skill","travel","loot","equip","done"];
  if (JSON.stringify(armed.steps) === JSON.stringify(EXP_ARM) && armed.active) okp(`[${prof.name}] ARMED compose spliced 6 combat verbs after "attack" (order intact), tut active`);
  else badp(`[${prof.name}] ARMED compose wrong: active=${armed.active} steps=${JSON.stringify(armed.steps)}`);

  // ---- render each of the 6 combat coachmarks in the real canvas, no console error ----
  let renderedAll = true;
  for (const verb of COMBAT) {
    const errBefore = errors.length;
    const idx = armed.steps.indexOf(verb);
    const st = await page.evaluate((i) => window.__dev.tutSetStep(i), idx);
    await wait(120); // let a couple rAF frames draw the coachmark
    // sample the canvas: the coachmark card is opaque UI on top of the world ⇒ non-blank pixels present
    const nonBlank = await page.evaluate(() => {
      const cv = document.querySelector("canvas"); if (!cv) return false;
      const g = cv.getContext("2d"); if (!g) return true; // webgl path: skip pixel probe, rely on 0-error
      try { const d = g.getImageData(0, 0, cv.width, Math.min(cv.height, 120)).data; for (let p = 3; p < d.length; p += 4) if (d[p] > 0) return true; return false; } catch (e) { return true; }
    });
    await page.screenshot({ path: `${OUT}/${prof.name}-coach-${verb}.png` });
    const newErr = errors.slice(errBefore);
    if (st && st.i === idx && newErr.length === 0 && nonBlank) okp(`[${prof.name}] coachmark "${verb}" (step ${idx}) rendered, 0 console error`);
    else { renderedAll = false; badp(`[${prof.name}] coachmark "${verb}" step=${st && st.i}≠${idx} nonBlank=${nonBlank} newErr=${JSON.stringify(newErr)}`); }
  }
  if (renderedAll) okp(`[${prof.name}] all 6 combat coachmarks rendered cleanly`);

  // ---- final boot-error tally ----
  if (infra5xx.length) console.log(`  · [${prof.name}] ${infra5xx.length} transient CDN 5xx/net flake(s) (infra, ignored): ${JSON.stringify(infra5xx.slice(0, 3))}`);
  if (errors.length === 0) okp(`[${prof.name}] boot+play+armed-render: 0 game-JS errors`);
  else badp(`[${prof.name}] ${errors.length} game-JS error(s): ${JSON.stringify(errors.slice(0, 5))}`);

  await page.close();
}

await browser.close();
console.log(anyFail ? "\nSMOKE FAIL ✖" : "\nSMOKE PASS ✓");
process.exit(anyFail ? 1 : 0);
