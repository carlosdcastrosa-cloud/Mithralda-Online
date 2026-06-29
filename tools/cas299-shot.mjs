// CAS-299 — local screenshot of the HUD state to evaluate the cutover (double-UI).
// Serves the working tree, enters play, optionally sets ?hud / default, shots.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";

const WANT = process.argv[2] || "hud";        // "hud" | "default" | "off"
const OUT  = process.argv[3] || `tools/cas299-${WANT}.png`;
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console.error: " + m.text()); });

const q = WANT === "hud" ? "?hud&dev" : "?dev";
await page.goto(`${srv.url}/index.html${q}`, { waitUntil: "load", timeout: 45000 });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: "load", timeout: 45000 });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "Probador";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
await key(page, "Digit1");
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
await page.evaluate(() => { try { window.__dev.setGold(1234); window.__dev.gear && window.__dev.gear(); } catch(e){} });
await wait(800);
const state = await page.evaluate(() => ({
  hudOn: window.__hud ? window.__hud.isOn() : null,
  hudInDom: !!document.getElementById("hud") && getComputedStyle(document.getElementById("hud")).display !== "none",
}));
await page.screenshot({ path: OUT });
console.log(JSON.stringify({ WANT, OUT, state, errs }, null, 2));
await browser.close();
await srv.close();
