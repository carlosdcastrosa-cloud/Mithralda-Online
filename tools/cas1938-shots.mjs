// CAS-1890 — capture LIVE evidence frames vs gh-pages build cff98e1e1941:
// menu, class-select, and the 5 zones (continent/forest/caves/ruins/caldera).
// Runs against the canonical public URL (board directive CAS-412).
// Run: node tools/cas1890-shots.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas1938";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
import { mkdirSync } from "fs";
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1.5 });
await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
await page.screenshot({ path: `${OUT}/desktop-menu.png` });
await page.evaluate(() => { document.getElementById("nameInput").value = "QA1932"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
await page.screenshot({ path: `${OUT}/desktop-classsel.png` });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
// CAS-169 wardrobe (customize) + CAS-1570 ability draft (abilitysel) sit between classsel and play.
await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
if (await page.evaluate(() => window.__dev.scene()) === "customize") {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
}
if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
}
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
const zones = ["continent", "forest", "caves", "ruins", "caldera"];
for (const z of zones) {
  try {
    await page.evaluate((zz) => { window.__dev.tpZone(zz); }, z);
    for (let i = 0; i < 12; i++) await wait(100);
    await page.screenshot({ path: `${OUT}/desktop-${z}.png` });
    console.log("✔", z);
  } catch (e) { console.log("✖", z, e.message); }
}
await browser.close();
console.log("done →", OUT);
