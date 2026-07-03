// Focused in-engine capture for the warrior walk8 torch/blade fix. Serves the game
// locally, spawns a warrior, walks E then W (the directions whose walk frames carried
// the stray blade stub), and grabs a burst of magnified crops across a full walk cycle
// so frames 0 & 4 (the buggy ones) are covered. Manual visual check — no gates.
//   node tools/warrior-walk8-torch-shot.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const srv = await startServer(ROOT);
const OUT = join(ROOT, "shots");
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const page = await (await browser.createBrowserContext()).newPage();
await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
const fr = await (async () => {
  const dl = Date.now() + 25000;
  while (Date.now() < dl) { for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} } await sleep(200); }
  throw new Error("no game frame");
})();
const key = (code, type) => fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Key", "").toLowerCase(), bubbles: true })), code, type);
await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 35000 });
await fr.evaluate(() => { document.getElementById("nameInput").value = "TorchFix"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
await key("Digit1", "keydown"); await key("Digit1", "keyup");  // warrior
await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
await sleep(3500);  // let strips load

// tight crop around the hero (viewport centre), magnified via deviceScaleFactor=2
const CX = 400, CY = 250, CW = 110, CH = 130;
async function burst(dir, keys) {
  for (const k of keys) await key(k, "keydown");
  await sleep(200);
  for (let i = 0; i < 8; i++) {  // 8 shots over ~1s = one full 8f cycle
    await page.screenshot({ path: join(OUT, `torchfix-${dir}-f${i}.png`), clip: { x: CX, y: CY, width: CW, height: CH } });
    await sleep(125);
  }
  for (const k of keys) await key(k, "keyup");
  await sleep(400);
}
await burst("E", ["KeyD"]);
await burst("W", ["KeyA"]);
await browser.close(); await srv.close();
console.log("wrote torchfix-E-f0..7 and torchfix-W-f0..7 to shots/");
