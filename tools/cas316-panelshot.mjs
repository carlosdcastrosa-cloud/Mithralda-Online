import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const key = (p, c) => p.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 3 });
await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: "load" });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS316";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
await key(page, "Digit1");
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
await page.evaluate(() => { try { window.__dev.setGold(1234); window.__dev.hurt(15); } catch (e) {} });
await wait(500);
for (const [cls, name] of [["p-stat","stat"],["p-doll","doll"],["p-bag","bag"],["p-con","con"]]) {
  const el = await page.$("#hud ." + cls);
  if (el) { await el.screenshot({ path: `/tmp/cas316-panel-${name}.png` }); console.log("shot", name); }
}
await ctx.close(); await browser.close(); await srv.close();
