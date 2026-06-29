// CAS-265 — capture settings-panel + colour-blind screenshots for QA evidence.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = process.argv.includes("--live");
const LIVE_URL = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = LIVE ? null : await startServer();
let base = LIVE ? LIVE_URL : srv.url; if (!base.endsWith("/")) base += "/";
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 576, deviceScaleFactor: 1 });
const waitScene = (s, ms = 20000) => page.waitForFunction((x) => window.__dev && window.__dev.scene && (window.__dev.scene() === x || window.__dev.scene() === "play"), { timeout: ms }, s).then(() => true).catch(() => false);
const shot = (n) => page.screenshot({ path: join(ROOT, "tools", `cas265-${n}.png`) });

await page.goto(`${base}index.html?dev`, { waitUntil: "load" });
await page.waitForFunction(() => window.__dev && window.__dev.scene && (window.__dev.scene() === "menu" || window.__dev.scene() === "play"), { timeout: 20000 });
let sc = await page.evaluate(() => window.__dev.scene());
if (sc === "menu") {
  await page.evaluate(() => { document.getElementById("nameInput").value = "ShotBot"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await waitScene("classsel", 8000);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await waitScene("play", 8000);
}
await wait(400);

// pause → Accessibility tab (default)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
await wait(300); await shot("settings-access");

// click the 3rd tab (Controls) — geometry mirrors renderPause for VW=1024,VH=576
await page.mouse.click(641, 67); await wait(250); await shot("settings-controls");
// click the 1st tab (Audio)
await page.mouse.click(381, 67); await wait(250); await shot("settings-audio");

// resume + colour-blind world (telegraph ring + crit glyph): toggle cb on, spawn mobs
await page.evaluate(() => { window.__dev.setColorblind(true); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); });
await wait(150);
await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__dev.spawn("orc", 30 + i * 18, -10); });
await wait(500); await shot("colorblind-world");

console.log("shots saved: tools/cas265-settings-access.png, -controls.png, -audio.png, tools/cas265-colorblind-world.png");
await browser.close(); if (srv) srv.close();
