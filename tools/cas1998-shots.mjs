// CAS-1998 — LIVE boot evidence + OBSERVABLE codex render vs COMBAT_CODEX build b372cdca869f.
// Desktop + mobile: menu → class-select → play, asserting ZERO game-JS console/page errors.
//
// COMBAT_CODEX ships enabled:false (DARK): Backquote (`) in play must be INERT (scene stays 'play').
// Then — since served blobs are md5-identical to HEAD — QA ARMS the feature at runtime by importing
// the live sim/config.js module (same ES singleton the game uses) and flipping COMBAT_CODEX.enabled=true
// (mirror of SUMMON/BOSS_RUSH live-QA). With it armed, a REAL Backquote keydown opens scene="combatcodex"
// and the shipped renderCombatCodex draws the panel → screenshot. We then retune FLASK.key live and
// re-open to prove the DRAWN keybind is data-driven (follows the knob, nothing hardcoded).
// The one-time hint toasts (spendStam/damageHero/…) + persistence + RNG-neutrality are proven observably
// by tools/cas1998-codex-live-qa.mjs (headless real update() loop). Run: node tools/cas1998-shots.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas1998";
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
  // Chrome's "Failed to load resource: 404" console text OMITS the URL (lesson CAS-1987), so a text
  // filter can't tell a favicon 404 from a real one. Capture the URL from the response event instead.
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "QA1998"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // ---- DARK: Backquote must be INERT (feature ships enabled:false) ----
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote", key: "`", bubbles: true })));
  for (let i = 0; i < 4; i++) await wait(80);
  const darkScene = await page.evaluate(() => window.__dev.scene());
  if (darkScene !== "play") { anyFail = true; console.error(`✖ [${prof.name}] Backquote opened codex while DARK (scene=${darkScene}) — must be inert`); }
  else console.log(`✔ [${prof.name}] Backquote INERT while DARK (scene stays 'play') — COMBAT_CODEX ships enabled:false`);

  // ---- ARM at runtime (served bytes==HEAD) then OBSERVE the real codex render ----
  const armed = await page.evaluate(async (base) => {
    const cfg = await import(base + "sim/config.js");
    cfg.COMBAT_CODEX.enabled = true;
    return { enabled: cfg.COMBAT_CODEX.enabled, codexKey: cfg.COMBAT_CODEX.codexKey, flaskKey: cfg.FLASK.key };
  }, BASE);
  await page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: "`", bubbles: true })), armed.codexKey);
  for (let i = 0; i < 5; i++) await wait(80);
  const openScene = await page.evaluate(() => window.__dev.scene());
  if (openScene !== "combatcodex") { anyFail = true; console.error(`✖ [${prof.name}] armed Backquote did NOT open codex (scene=${openScene})`); }
  else console.log(`✔ [${prof.name}] armed ⇒ Backquote opens scene="combatcodex" (real input+render path)`);
  await page.screenshot({ path: `${OUT}/${prof.name}-codex.png` });

  // ---- DATA-DRIVEN: retune FLASK.key live ⇒ codex re-render shows the new binding ----
  await page.evaluate(async (base) => {
    const cfg = await import(base + "sim/config.js");
    cfg.FLASK.key = "KeyZ";                    // retune the live knob
  }, BASE);
  // close + reopen to force a fresh render pass of the panel
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); });
  for (let i = 0; i < 3; i++) await wait(60);
  await page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: "`", bubbles: true })), armed.codexKey);
  for (let i = 0; i < 4; i++) await wait(80);
  await page.screenshot({ path: `${OUT}/${prof.name}-codex-retune.png` });
  // restore + close (leave runtime clean; served build stays DARK)
  await page.evaluate(async (base) => { const cfg = await import(base + "sim/config.js"); cfg.FLASK.key = "KeyU"; cfg.COMBAT_CODEX.enabled = false; }, BASE);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));

  // classify 404s: only the root favicon.ico is a known sev-4 cosmetic; any game-asset 404 is a real bug
  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) { anyFail = true; console.error(`✖ [${prof.name}] non-favicon 404s (${bad404.length}):`); bad404.forEach((u) => console.error("  " + u)); }
  else if (http404.length) console.log(`✔ [${prof.name}] only cosmetic favicon.ico 404 (sev-4, known): ${[...new Set(http404)].join(", ")}`);
  if (errors.length) { anyFail = true; console.error(`✖ [${prof.name}] boot/codex console errors (${errors.length}):`); errors.forEach((e) => console.error("  " + e)); }
  else console.log(`✔ [${prof.name}] CLEAN: zero game-JS errors boot→play→Backquote(dark inert)→arm→codex→retune`);
  await page.close();
}
await browser.close();
if (anyFail) process.exit(1);
console.log("done →", OUT);
