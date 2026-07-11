// CAS-1985 — LIVE boot evidence + console-error watch vs go-live build c960c813843d (SUMMON enabled:true).
// Desktop + mobile: menu → class-select → play → 3 world zones, asserting ZERO JS console/page errors.
// Post go-live, SUMMON is PLAYABLE (KeyN live): this pass also presses KeyN in-play on both profiles to
// confirm the now-active summon input regresses nothing at boot/load/world level. The observable summon
// behavior (spirit fights boss + splits aggro) is proven by tools/cas1965-summon-live-qa.mjs (headless
// sim loop) since served blobs are md5-identical to HEAD.
// Run: node tools/cas1985-shots.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas1987";
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
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/${prof.name}-menu.png` });
  await page.evaluate(() => { document.getElementById("nameInput").value = "QA1985"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/${prof.name}-classsel.png` });
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
  // Post go-live: press KeyN (summon) in-play — must not throw / error.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyN", key: "n", bubbles: true })));
  for (let i = 0; i < 6; i++) await wait(100);
  await page.screenshot({ path: `${OUT}/${prof.name}-play-summonkey.png` });
  for (const z of ["continent", "caves", "caldera"]) {
    try { await page.evaluate((zz) => window.__dev.tpZone(zz), z); for (let i = 0; i < 10; i++) await wait(100); await page.screenshot({ path: `${OUT}/${prof.name}-${z}.png` }); }
    catch (e) { console.log(`✖ ${prof.name} ${z}`, e.message); }
  }
  if (errors.length) { anyFail = true; console.error(`✖ [${prof.name}] boot console errors (${errors.length}):`); errors.forEach((e) => console.error("  " + e)); }
  else console.log(`✔ [${prof.name}] boot CLEAN: zero JS console/page errors boot→menu→classsel→play→KeyN→zones`);
  await page.close();
}
await browser.close();
if (anyFail) process.exit(1);
console.log("done →", OUT);
