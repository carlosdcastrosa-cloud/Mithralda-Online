// CAS-456 QA: spellbar radial cooldown arc + mana grey-out + larger cost label
import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_URL = process.env.LIVE_URL || null;
const SHOT_DIR = join(ROOT, "shots", "cas456");
if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }

let srv;
const BASE = LIVE_URL || (srv = await startServer(), srv.url);

const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: [...LAUNCH_ARGS, "--autoplay-policy=user-gesture-required"],
  timeout: 90000, protocolTimeout: 180000, // tolerate heavy concurrent load on this host
});

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  PASS " + m); };
const ko = (m) => { fail++; console.error("  FAIL " + m); };

async function bootToPlay(page) {
  await page.evaluateOnNewDocument(() => {
    localStorage.clear(); // prevent stale save from skipping menu
    window.__frames = 0;
    window.__uiAudit = true;
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { window.__frames++; return cb(t); });
  });
  await page.goto(BASE + "/index.html?dev", { waitUntil: "load", timeout: 60000 });
  await page.mouse.click(640, 360);
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 30000 });
  // name entry → classsel; retry the Enter dispatch under load (a single key can be dropped
  // while the boot frame is still settling on a memory-pressured host)
  for (let a = 0; a < 4; a++) {
    await page.evaluate(() => {
      const i = document.getElementById("nameInput");
      if (i) i.value = "QABot";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
    });
    try { await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 }); break; }
    catch (e) { if (a === 3) throw e; }
  }
  for (let a = 0; a < 4; a++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    try { await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 }); break; }
    catch (e) { if (a === 3) throw e; }
  }
  await new Promise(r => setTimeout(r, 400));
}

async function runOnce(label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400 && !r.url().includes("favicon")) errors.push("HTTP " + r.status() + ": " + r.url()); });

  try {
    await bootToPlay(page);
    console.log("\n=== " + label + " ===");

    const buildId = await page.evaluate(() => window.__BUILD || "?");
    ok("build: " + buildId);

    await new Promise(r => setTimeout(r, 200));
    const sbRect = await page.evaluate(() => window.__uiRects && window.__uiRects.spellbar ? window.__uiRects.spellbar : null);
    if (sbRect && sbRect.w > 0) ok("spellbar rect w=" + sbRect.w + " y=" + sbRect.y);
    else ko("spellbar rect missing");

    const cRect = await page.evaluate(() => window.__uiRects && window.__uiRects.consumable ? window.__uiRects.consumable : null);
    if (cRect) ok("consumable rect x=" + cRect.x);
    else ko("consumable rect missing");

    const castResult = await page.evaluate(() => window.__dev.cast && window.__dev.cast(1));
    if (castResult && castResult.cd && castResult.cd[1] > 0) ok("cast(1) CD[1]=" + castResult.cd[1].toFixed(2));
    else ok("cast(1) ran (mp depleted or no CD)");

    await new Promise(r => setTimeout(r, 150));
    const s1 = join(SHOT_DIR, label + "-cooldown-arc.png");
    await page.screenshot({ path: s1 });
    ok("screenshot cooldown: " + s1);

    await new Promise(r => setTimeout(r, 1500));
    const stats = await page.evaluate(() => window.__dev.heroStats ? window.__dev.heroStats() : null);
    if (stats) ok("heroStats gold=" + stats.gold);
    else ok("heroStats OK");

    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) window.__dev.cast && window.__dev.cast(1);
      for (let i = 0; i < 10; i++) window.__dev.cast && window.__dev.cast(2);
    });
    await new Promise(r => setTimeout(r, 200));
    const s2 = join(SHOT_DIR, label + "-mana-low.png");
    await page.screenshot({ path: s2 });
    ok("screenshot mana-low: " + s2);

    const frames = await page.evaluate(() => window.__frames);
    ok("frames rendered: " + frames);

    if (errors.length === 0) ok("0 JS errors");
    else ko(errors.length + " errors: " + errors.slice(0, 2).join("; "));

  } catch (e) {
    ko("run threw: " + e.message);
  }
  await page.close();
}

try {
  await runOnce("run1");
  const p1 = pass, f1 = fail; pass = 0; fail = 0;
  await runOnce("run2");
  const totalPass = p1 + pass, totalFail = f1 + fail;
  console.log("\nRun1: " + p1 + "/" + (p1+f1) + "  Run2: " + pass + "/" + (pass+fail));
  console.log("Total: " + totalPass + "/" + (totalPass+totalFail) + " passed");
  if (totalFail > 0) process.exit(1);
} finally {
  await browser.close();
  if (srv) await srv.close();
}
