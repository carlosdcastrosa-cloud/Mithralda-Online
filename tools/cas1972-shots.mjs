// CAS-1972 (CAS-1954 QA gen3b) — LIVE boot evidence + console-error watch vs gh-pages build 4ef6efbe196c.
// Captures menu, class-select and 3 world zones from the canonical public URL (board directive CAS-412),
// and asserts ZERO JS console errors through boot → play. Spirit Summon ships enabled:false (dark), so it is
// invisible to real players (KeyN inert); this pass proves the deployed build BOOTS CLEAN and the summon
// overlay caused no regression to load/menu/world. The observable summon behavior is proven by
// tools/cas1965-summon-live-qa.mjs (headless sim loop) since served blobs are md5-identical to HEAD.
// Run: node tools/cas1972-shots.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas1972";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1.5 });
await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
await page.screenshot({ path: `${OUT}/desktop-menu.png` });
await page.evaluate(() => { document.getElementById("nameInput").value = "QA1972"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
await page.screenshot({ path: `${OUT}/desktop-classsel.png` });
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
for (const z of ["continent", "caves", "caldera"]) {
  try { await page.evaluate((zz) => window.__dev.tpZone(zz), z); for (let i = 0; i < 12; i++) await wait(100); await page.screenshot({ path: `${OUT}/desktop-${z}.png` }); console.log("✔", z); }
  catch (e) { console.log("✖", z, e.message); }
}
await browser.close();
if (errors.length) { console.error(`✖ boot console errors (${errors.length}):`); errors.forEach((e) => console.error("  " + e)); process.exit(1); }
console.log("✔ boot CLEAN: zero JS console/page errors through boot→menu→classsel→play→zones");
console.log("done →", OUT);
