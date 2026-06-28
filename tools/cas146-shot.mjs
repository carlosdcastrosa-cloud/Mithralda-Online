// CAS-146 demo screenshot: force an elite ambush in caves + plant a volatile mid-windup,
// then capture the procedural aura/telegraphs. tools/ is excluded from the build-id, so this
// never affects a deploy. Run: node tools/cas146-shot.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "Demo";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  await page.evaluate(() => { window.__dev.tpZone("caves"); window.__dev.seed(9); window.__dev.forceAmbush(); window.__dev.spawn("volatile", 70, 0); });
  await wait(450); // let the volatile commit a windup so its blast ring shows
  await page.screenshot({ path: "tools/cas146-ambush.png" });
  console.log("✔ saved tools/cas146-ambush.png");
} finally { await browser.close(); await srv.close(); }
