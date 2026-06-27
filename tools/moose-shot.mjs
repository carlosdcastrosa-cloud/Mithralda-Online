// CAS-76: visual check that the real Ancient Ruins "Moose" animated strips render
// in-world (idle + chase). Boots the game, spawns a moose next to the hero, lets the
// idle animation cycle, and screenshots. Run: node tools/moose-shot.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas76-moose.png");
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("requestfailed", (r) => errs.push(`reqfail ${r.url()}`));
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) ni.value = "MooseBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  // spawn a moose just east of the hero and let the idle animation cycle
  await page.evaluate(() => { window.__dev.spawn("moose", 80, 0); });
  await new Promise((r) => setTimeout(r, 1400));
  const n = await page.evaluate(() => window.__dev.enemyCount());
  console.log("enemies in world:", n);
  await page.screenshot({ path: SHOT });
  if (!n) { ok = false; console.error("✖ moose did not spawn"); }
  if (errs.length) { ok = false; console.error("✖ page errors:", errs.slice(0, 5)); }
  console.log(ok ? "✔ moose spawned, no errors — shot: " + SHOT : "✖ issues found");
} finally { await browser.close(); await srv.close?.(); }
process.exit(ok ? 0 : 1);
