// ---------------------------------------------------------------------------
// CAS-211 — FOUNTAINS comparison capture. Boots the local HEAD build, warps
// into a dark hunt biome, spawns mobs, swings real combat, and grabs frames so
// QA can score paleta/tiles/sprites/FX/combat-feel vs FOUNTAINS each iteration.
// Run: node tools/cas211-fountains-compare.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAfnt";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  // Warp to a dark hunt biome and populate it.
  const zone = process.env.ZONE || "frost";
  await page.evaluate((z) => { try { window.__dev.tpZone(z); } catch (e) {} }, zone);
  await wait(600);
  await page.evaluate(() => {
    try { for (let i = 0; i < 5; i++) window.__dev.spawn(undefined, (i - 2) * 60, -20 + (i % 2) * 30); } catch (e) {}
  });
  await wait(700);
  await page.screenshot({ path: `tools/cas211-${zone}-biome.png` });
  console.log(`[SHOT] tools/cas211-${zone}-biome.png`);

  // Drive a couple of real swings for a combat frame with FX.
  await page.evaluate(() => { try { window.__dev.juiceSwing ? window.__dev.juiceSwing() : (window.__dev.atk && window.__dev.atk()); } catch (e) {} });
  await wait(120);
  await page.evaluate(() => { try { window.__dev.forceCritSwing && window.__dev.forceCritSwing(); } catch (e) {} });
  await wait(80);
  await page.screenshot({ path: `tools/cas211-${zone}-combat.png` });
  console.log(`[SHOT] tools/cas211-${zone}-combat.png`);
  console.log(errors.length ? `[ERR] ${errors.length}: ${errors.slice(0,3).join(" | ")}` : "[ERR] zero JS errors");
} finally {
  await browser.close();
  await srv.close();
}
