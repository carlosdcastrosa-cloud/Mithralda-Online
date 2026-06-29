// CAS-267 evidence shot: coachmark "attack" card after rebinding attack J→K
// (proves the live render path shows the player's CURRENT key, not a hardcoded one).
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 10000 });
await page.evaluate(() => { document.getElementById("nameInput").value = "Bind"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "Digit1", bubbles: true })));
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
// rebind attack to K, then jump the coachmark to the attack card
await page.evaluate(() => { window.__dev.setBind("attack", "KeyK"); window.__dev.tutStart(); window.__dev.tutSetStep(1); });
await new Promise((r) => setTimeout(r, 400));
const state = await page.evaluate(() => ({ step: window.__dev.tutState().step, binds: window.__dev.settingsState().binds.attack }));
await page.screenshot({ path: "tools/cas267-coachmark-rebind.png" });
console.log("shot saved; state=", JSON.stringify(state));
await browser.close(); await srv.close(); process.exit(0);
