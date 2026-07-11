// CAS-2002 — GO-LIVE boot smoke for COMBAT_CODEX after the enabled:false→true flip (build c7cfc0e489e8).
// Unlike the DARK harness tools/cas1998-shots.mjs (which had to ARM the knob at runtime to observe the
// codex), this proves the feature is LIVE BY DEFAULT: a real Backquote keydown on the served build opens
// scene="combatcodex" with NO runtime arming. Desktop + mobile, asserting ZERO game-JS console/page errors.
// Run: node tools/cas2002-golive-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2002";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "GOLIVE"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // ---- LIVE: Backquote must OPEN the codex with NO runtime arming (feature ships enabled:true) ----
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote", key: "`", bubbles: true })));
  for (let i = 0; i < 5; i++) await wait(80);
  const openScene = await page.evaluate(() => window.__dev.scene());
  if (openScene !== "combatcodex") { anyFail = true; console.error(`✖ [${prof.name}] Backquote did NOT open codex live (scene=${openScene}) — flip not effective`); }
  else console.log(`✔ [${prof.name}] LIVE: Backquote opens scene="combatcodex" with NO arming — COMBAT_CODEX.enabled:true served`);
  await page.screenshot({ path: `${OUT}/${prof.name}-codex.png` });

  // close, leave clean
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
  for (let i = 0; i < 3; i++) await wait(60);
  const closedScene = await page.evaluate(() => window.__dev.scene());
  if (closedScene !== "play") { anyFail = true; console.error(`✖ [${prof.name}] Escape did not close codex (scene=${closedScene})`); }
  else console.log(`✔ [${prof.name}] Escape closes codex → back to play`);

  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) { anyFail = true; console.error(`✖ [${prof.name}] non-favicon 404s (${bad404.length}):`); bad404.forEach((u) => console.error("  " + u)); }
  else if (http404.length) console.log(`✔ [${prof.name}] only cosmetic favicon.ico 404 (sev-4, known): ${[...new Set(http404)].join(", ")}`);
  if (errors.length) { anyFail = true; console.error(`✖ [${prof.name}] boot/codex console errors (${errors.length}):`); errors.forEach((e) => console.error("  " + e)); }
  else console.log(`✔ [${prof.name}] CLEAN: zero game-JS errors boot→play→Backquote(live-open)→Escape`);
  await page.close();
}
await browser.close();
if (anyFail) process.exit(1);
console.log("done →", OUT);
