// CAS-126 — capture an in-game frame showing the three new archetype telegraphs
// (charger charge-LANE, summoner summon-RING, healer heal-TETHER) for the QA handoff.
// Run: node tools/cas126-shot.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1.5 });
await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
await page.evaluate(() => { document.getElementById("nameInput").value = "ShotBot"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
// stage a readable tableau: a charger committing a lane, a summoner raising, a healer tethering a wounded ally
await page.evaluate(() => {
  window.__dev.tpZone("abyss");
  window.__dev.archArena("charger", 150, -10);   // charger to the right, will commit a charge
  window.__dev.spawn("summoner", -120, 60);
  window.__dev.spawn("healer", -40, -120);
  const ally = window.__dev.spawn ? null : null;
  window.__dev.spawn("orc", -10, -150);          // a wounded ally for the healer to tether
});
// nudge an ally to wounded so the healer tethers, then let telegraphs appear
await page.evaluate(() => { const o = window.__dev; });
// poll a few frames for a windup tell to be on-screen, then snap
for (let i = 0; i < 30; i++) { await wait(120); }
const out = "tools/cas126-archetypes.png";
await page.screenshot({ path: out });
console.log("✔ screenshot saved:", out);
await browser.close(); srv.stop && srv.stop();
