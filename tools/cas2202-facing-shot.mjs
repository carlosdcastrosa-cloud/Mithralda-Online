// CAS-2202: capture a zoomed view of the hero to SEE the facing indicators
// (direction cone/wedge + yellow aim dot) before/after render-only removal.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const tag = process.argv[2] || "before";
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const n=document.getElementById("nameInput"); if(n) n.value="QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='abilitysel'", { timeout: 5000 });
  // abilitysel comes pre-seeded with 2 default abilities; toggling would REMOVE them,
  // so just confirm the default loadout with Enter → play.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  await sleep(400);
  // face right (KeyD tap) so the facing indicator points +x and is clearly visible
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
  await sleep(200);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
  await sleep(150);
  const hero = await page.evaluate(() => window.__dev.hero());
  const anim = await page.evaluate(() => window.__dev.heroAnim());
  console.log("hero", JSON.stringify(hero), "anim", JSON.stringify(anim));
  // Full frame
  writeFileSync(join(ROOT, "tools", `cas2202-${tag}-full.png`), await page.screenshot());
  // Cropped around hero: hero is rendered near screen center in world-follow cam.
  // Grab a 220x220 box centered on canvas center (device px = *2).
  const box = { x: (900/2 - 110)*2, y: (700/2 - 110)*2, width: 220*2, height: 220*2 };
  writeFileSync(join(ROOT, "tools", `cas2202-${tag}-hero.png`), await page.screenshot({ clip: { x: box.x/2, y: box.y/2, width: 220, height: 220 } }));
  console.log("shots saved for tag=" + tag, "errors=" + errors.length);
  if (errors.length) console.error(errors.join("\n"));
  await page.close();
} finally {
  await browser.close();
  await srv.close?.();
}
