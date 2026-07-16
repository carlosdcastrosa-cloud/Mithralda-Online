// CAS-2398 — visual proof for the board "elimina esos circulos" removal:
//  (1) richAnim mob GROUNDING SHADOW gone (dark oval under characters), and
//  (2) ARENA_HAZARDS re-styled from a hard ground disc+ring to a soft haze + ⚠ glyph.
// Boots as a warrior, spawns richAnim mobs (quillback/wendigo) for the shadow shot, then a
// dragon BOSS to satisfy the hazard spawn-gate and bursts screenshots to catch a live hazard.
// Run: node tools/cas2398-shots.mjs <tag>   (tag = "before" | "after")
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const TAG = process.argv[2] || "after";
const OUT = join(ROOT, "shots", "cas2398");
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (page, code) => page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true })), code);
let ok = true;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "ShadowBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await key(page, "Digit1");                       // warrior
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s) { await key(page, "Enter"); await sleep(200); }  // default abilities pre-selected
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(600);

  // (1) MOB SHADOW — spawn a ring of richAnim mobs around the hero and shoot a close-up.
  await page.evaluate(() => {
    window.__dev.spawn("quillback", 60, 0); window.__dev.spawn("quillback", -60, 10);
    window.__dev.spawn("wendigo", 0, -70);  window.__dev.spawn("mudlurker", 40, 55);
  });
  await sleep(700);
  await page.screenshot({ path: join(OUT, `mobshadow-${TAG}.png`), clip: { x: 250, y: 130, width: 400, height: 360 } });
  console.log("mobs:", await page.evaluate(() => window.__dev.enemyCount()));

  // (2) HAZARD — spawn a DRAGON boss (boss:true satisfies the ARENA_HAZARDS spawn-gate), then burst
  // screenshots for ~8s to catch a planted hazard (cadence 3200ms; telegraph 950ms + active 1600ms).
  await page.evaluate(() => window.__dev.spawn("dragon", 120, 0));
  let shot = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(420);
    await page.screenshot({ path: join(OUT, `hazard-${TAG}-${String(i).padStart(2, "0")}.png`), clip: { x: 200, y: 100, width: 500, height: 420 } });
    shot++;
  }
  console.log(`hazard burst frames: ${shot}`);

  if (errs.length) { ok = false; console.error("page errors:", errs.slice(0, 5)); }
  console.log(ok ? `OK ${TAG} → shots/cas2398/` : "issues");
} catch (e) { ok = false; console.error("ERR", e.message); }
finally { await browser.close(); await srv.close?.(); }
process.exit(ok ? 0 : 1);
