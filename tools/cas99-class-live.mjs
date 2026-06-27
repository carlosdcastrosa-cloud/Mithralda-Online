// CAS-97/CAS-99: LIVE proof the 4 CAS-94 class heroes render on the DEPLOYED
// build (inside the Higgsfield iframe) at the final hero scale. Cycles classes
// 1-5, walks briefly so the procedural movement feel is active, and crops the
// hero. Emits tools/cas99-live-<class>.png. Run: node tools/cas99-class-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLASSES = [["warrior","Digit1"],["paladin","Digit2"],["mage","Digit3"],["druid","Digit4"],["priest","Digit5"]];
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code, type = "keydown") =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Digit",""), bubbles: true })), code, type);

let ok = true;
for (const [name, code] of CLASSES) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "ClassQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, code);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await key(fr, "KeyD", "keydown"); await sleep(450); await key(fr, "KeyD", "keyup"); await sleep(150);
  const h = await fr.evaluate(() => window.__dev.hero());
  await page.screenshot({ path: join(OUT, `cas99-live-${name}.png`), clip: { x: 330, y: 150, width: 240, height: 300 } });
  if (name === "warrior") await page.screenshot({ path: join(OUT, "cas99-live-warrior-full.png") });
  console.log(`✔ live ${name} (cls=${h && h.cls})`);
  await page.close();
}
await browser.close();
console.log(ok ? "✓ live class shots done" : "✖ issues");
