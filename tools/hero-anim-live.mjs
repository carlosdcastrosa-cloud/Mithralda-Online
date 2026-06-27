// CAS-92: LIVE proof the Higgsfield hero animations render on the deployed build
// (inside the Higgsfield iframe). Boots as warrior on the live URL and captures
// idle / walk / attack / dodge-roll. Run: node tools/hero-anim-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
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
  fr.evaluate((code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true })), code, type);

let ok = true;
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "AnimQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, "Digit1");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(700);
  const hasAnim = await fr.evaluate(() => !!(window.__dev.heroAnim));
  if (!hasAnim) { ok = false; console.error("✖ live build lacks __dev.heroAnim (stale?)"); }

  const crop = { x: 300, y: 170, width: 300, height: 260 };
  const shoot = async (n) => { await page.screenshot({ path: join(OUT, `cas92-live-${n}.png`), clip: crop }); };

  await shoot("idle");
  await page.screenshot({ path: join(OUT, "cas92-live-idle-full.png") });

  await key(fr, "KeyD", "keydown");
  await fr.waitForFunction("window.__dev.heroAnim() && window.__dev.heroAnim().state==='walk'", { timeout: 3000 });
  await sleep(180); await shoot("walk");
  await key(fr, "KeyD", "keyup"); await sleep(300);

  let atk = false;
  for (let i = 0; i < 6 && !atk; i++) { await key(fr, "Digit1");
    try { await fr.waitForFunction("window.__dev.heroAnim() && window.__dev.heroAnim().state==='attack'", { timeout: 500 }); atk = true; } catch { await sleep(250); } }
  await shoot("attack"); await sleep(400);

  await key(fr, "Space");
  let roll = false;
  try { await fr.waitForFunction("window.__dev.heroAnim() && window.__dev.heroAnim().state==='roll'", { timeout: 800 }); roll = true; } catch {}
  await shoot("roll");

  if (errs.length) { ok = false; }
  console.log(JSON.stringify({ live: LIVE, hasHeroAnim: hasAnim, walk: true, attack: atk, roll, errors: errs.slice(0,5), pass: ok }, null, 2));
} catch (e) { ok = false; console.error("✖", e.message); }
finally { await browser.close(); }
process.exit(ok ? 0 : 1);
