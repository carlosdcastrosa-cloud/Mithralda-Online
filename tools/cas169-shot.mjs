// CAS-169 visual capture: wardrobe screen with the default warrior + a customized look.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 640, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
await page.evaluate(() => { document.getElementById("nameInput").value = "WardrobeBot";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c", bubbles: true })));
await wait(500);
await page.screenshot({ path: "tools/cas169-wardrobe-default.png" });
// customized: red hood, gold cloak, helmet, long cape
await page.evaluate(() => { window.__dev.setPartColor("hood", 0); window.__dev.setPartColor("cloak", 2);
  window.__dev.setPartColor("sash", 6); window.__dev.cycleVariation("headwear", 1); window.__dev.cycleVariation("cape", -1); });
await wait(500);
await page.screenshot({ path: "tools/cas169-wardrobe-custom.png" });
console.log("wrote tools/cas169-wardrobe-default.png + cas169-wardrobe-custom.png");
await browser.close(); await srv.close();
