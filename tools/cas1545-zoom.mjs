// CAS-1545 — zoomed single-effect inspection. Clips a tight box around the hero so
// per-effect detail (glow falloff, hot core, trail, palette discipline) is legible.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 2 });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAfx";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  // per-class: a SINGLE representative action so each effect is judged in isolation
  const shots = [
    ["warrior", (d) => { d.juiceArena(3); }, (d) => { d.juiceSwing(); }],
    ["mage",    (d) => { d.juiceArena(3); }, (d) => { d.clearSpellCD(); d.cast(1); }],
    ["paladin", (d) => { d.juiceArena(3); }, (d) => { d.clearSpellCD(); d.cast(1); }],
    ["priest",  (d) => { d.juiceArena(3); }, (d) => { d.clearSpellCD(); d.cast(2); }],
    ["druid",   (d) => { d.juiceArena(3); }, (d) => { d.clearSpellCD(); d.cast(1); }],
  ];
  for (const [cls, setup, act] of shots) {
    await page.evaluate((c) => { window.__dev.clearFx(); window.__dev.setClass(c); }, cls);
    await page.evaluate(`(${setup})(window.__dev)`); await wait(60);
    await page.evaluate(`(${act})(window.__dev)`); await wait(20);
    await page.screenshot({ path: `tools/cas1545-zoom-${cls}.png` });
    console.log("shot", cls); await wait(40);
  }
} finally { await browser.close(); await srv.close(); }
process.exit(0);
