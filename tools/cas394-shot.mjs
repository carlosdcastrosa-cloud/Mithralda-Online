// CAS-394 — capture the zone-modifier offer panel on desktop-wide + mobile-narrow.
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
const exe = findChromium();
const { url, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
async function shot(w, h, mod, file) {
  const ctx = (await browser.createBrowserContext?.()) || (await browser.createIncognitoBrowserContext?.()) || browser;
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { window.__dev && window.__dev.clearSave && window.__dev.clearSave(); localStorage.clear(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) { i.focus(); i.value = "Shot"; } window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  // force a specific modifier by re-offering until it matches (deterministic pool of 3)
  await page.evaluate((m) => { for (let i = 0; i < 12; i++) { const o = window.__dev.offerCurse("forest"); if (o && o.mod === m) return; window.__dev.skipCurse(); window.__dev.setCurse("forest", null); } window.__dev.offerCurse("forest"); }, mod);
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: file });
  console.log("saved", file);
  await page.close();
  if (ctx !== browser && ctx.close) await ctx.close();
}
try {
  await shot(1280, 720, "brutal", "tools/cas394-offer-wide.png");
  await shot(1280, 720, "frenzy", "tools/cas394-offer-frenzy.png");
  await shot(390, 780, "swarm", "tools/cas394-offer-mobile.png");
} finally { await browser.close(); await close(); }
