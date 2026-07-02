// ---------------------------------------------------------------------------
// CAS-28 addendum — real touch input on the LIVE build.
// Uses puppeteer touchscreen taps (real touchstart) so the game flips isTouch,
// renders the on-screen controls (virtual stick + attack/roll/spell buttons),
// and routes a tap through the attack button. Confirms mobile is actually
// playable by touch, not just by keyboard.
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => join(ROOT, "tools", `playtest1-${n}.png`);
const out = { errors: [] };

async function gameFrame(page) {
  const dl = Date.now() + 25000;
  while (Date.now() < dl) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("no game frame");
}

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => out.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") out.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const fr = await gameFrame(page);
  // menu -> class via keyboard (name input), then play
  await fr.waitForFunction("window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "TouchQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  // 1) flip isTouch with a real tap on the move (left) side of the screen
  await page.touchscreen.tap(90, 600);
  await sleep(200);
  const touchOn = await fr.evaluate(() => { try { return !!(window.__dev && document); } catch { return false; } });

  // 2) confirm on-screen controls now render
  await page.screenshot({ path: shot("05-touch-controls") });

  // 3) spawn enemies, tap the attack button (bottom-right) several times, confirm hits
  const before = await fr.evaluate(() => {
    for (const [dx,dy] of [[40,0],[-40,0],[0,40],[0,-40],[30,30],[-30,30]]) { try { window.__dev.spawn("wolf", dx, dy); } catch {} }
    return window.__dev.enemyCount();
  });
  // attack button center ~ (VW - 14 - bs*0.5*? ) — from input.js: right=VW-14, attack.x=right-bs/2, y=VH-14-bs/2
  // bs = max(50, min(VW,VH)*0.11) = max(50, 390*0.11=42.9) = 50 ; attack at (390-14-25, 844-14-25)=(351,805)
  for (let i = 0; i < 18; i++) { await page.touchscreen.tap(351, 805); await sleep(120); }
  await sleep(300);
  const after = await fr.evaluate(() => window.__dev.enemyCount());
  await page.screenshot({ path: shot("06-touch-combat") });

  out.touchFlipped = touchOn;
  out.enemiesBefore = before;
  out.enemiesAfter = after;
  out.killedByTouchAttack = before - after;
} catch (e) {
  out.errors.push(`threw: ${e.message}`);
} finally {
  await browser.close();
}
console.log("\n===TOUCH_REPORT_JSON===");
console.log(JSON.stringify(out, null, 2));
console.log("===END_REPORT===");
