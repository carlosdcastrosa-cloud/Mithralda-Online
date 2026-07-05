// CAS-1545 — warrior melee crit capture. forceCritSwing triggers hitstop which
// FREEZES the sim frame, so the slashArc + hitburst + shockring + spark FX persist
// long enough for a reliable screenshot (per cas204-hitfx pattern).
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 560, deviceScaleFactor: 2 });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAfx";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await page.evaluate(() => { window.__dev.clearFx(); window.__dev.setClass("warrior"); window.__dev.juiceArena(6); });
  await wait(80);
  await page.evaluate(() => { window.__dev.forceCritSwing(); window.__dev.juiceSwing(); window.__dev.juiceSwing(); });
  await wait(16); // grab ON the held hitstop frame
  await page.screenshot({ path: "tools/cas1545-melee.png" });
  console.log("melee shot saved");
} finally { await browser.close(); await srv.close(); }
process.exit(0);
