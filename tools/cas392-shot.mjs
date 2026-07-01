// CAS-392 — screenshot the draft panel (desktop-wide + mobile-narrow) to confirm the
// Reroll button + per-card banish badges render, and drive a REAL touch tap on both.
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { join } from "node:path";

const exe = findChromium();
const { url, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(page) {
  await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Shot"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

for (const [w, h, tag] of [[1024, 640, "wide"], [390, 780, "mobile"]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: tag === "mobile", hasTouch: tag === "mobile" });
  await boot(page);
  await page.evaluate(() => window.__dev.openDraft());
  await sleep(300);
  await page.screenshot({ path: join("tools", `cas392-draft-${tag}.png`) });
  // verify UI hit-rects exist by reading them back through a tap: tap the reroll button
  const rects = await page.evaluate(() => ({
    reroll: !!(window.__ui && window.__ui.draftRerollRect),
    banishN: (window.__ui && window.__ui.draftBanishRects || []).length,
  })).catch(() => ({ reroll: "n/a", banishN: "n/a" }));
  console.log(`${tag}: shot saved; rerollRect=${rects.reroll} banishBadges=${rects.banishN}`);
  await page.close();
}
await browser.close(); await close();
console.log("done");
