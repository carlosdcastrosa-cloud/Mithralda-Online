import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
const { url, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 640 });
await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
await page.evaluate(() => { window.__dev.clearSave(); window.__dev.noSave();
  const i = document.getElementById("nameInput"); if (i) i.value = "Shot";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
const snap = async (tx, ty, name) => {
  await page.evaluate((a, b) => window.__dev.tp(a, b), tx, ty);
  await new Promise(r => setTimeout(r, 1400));
  const sc = await page.evaluate(() => window.__dev.scene());
  if (sc === "curse") { await page.evaluate(() => window.__dev.skipCurse()); await new Promise(r => setTimeout(r, 300)); }
  await page.screenshot({ path: `shots/cas441/${name}.png` });
};
await snap(252, 158, "eyeball-interior");
await snap(239, 165, "eyeball-entrance");
await snap(258, 170, "eyeball-south");
// big map with the new zone labelled
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", key: "m", bubbles: true })));
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: "shots/cas441/eyeball-bigmap.png" });
await browser.close(); await close();
console.log("shots done");
