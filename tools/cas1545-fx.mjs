// ---------------------------------------------------------------------------
// CAS-1545 — combat-effect redesign capture harness.
// Boots the REAL game headless and, per class, drives the actual combat paths
// (juiceArena to give targets, juiceSwing for the basic melee, cast(1..3) for the
// class spells) then screenshots ON the live frame so the redesigned attack/spell
// FX (additive glow bloom + hot-core layering + motion trails) are captured as
// board evidence. Presentation-only change — asserts zero JS errors across the run.
//
// Run: node tools/cas1545-fx.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const errors = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAfx";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("entered play");

  const classes = ["warrior", "paladin", "mage", "druid", "priest"];
  for (const cls of classes) {
    await page.evaluate((c) => {
      window.__dev.clearFx && window.__dev.clearFx();
      window.__dev.setClass && window.__dev.setClass(c);
      window.__dev.clearSpellCD && window.__dev.clearSpellCD();
      window.__dev.juiceArena && window.__dev.juiceArena(9); // ring of dummies as spell/proj targets
    }, cls);
    await wait(50);
    // fire the full kit this frame: basic swing + all three class spells → maximal FX density
    const spawned = await page.evaluate(() => {
      let fx0 = 0;
      try { window.__dev.clearSpellCD && window.__dev.clearSpellCD(); } catch (e) {}
      for (let s = 1; s <= 3; s++) { try { window.__dev.cast && window.__dev.cast(s); } catch (e) {} }
      try { window.__dev.juiceSwing && window.__dev.juiceSwing(); } catch (e) {}
      try { const st = window.__dev.juiceState ? window.__dev.juiceState() : null; fx0 = st ? st.fx : -1; } catch (e) {}
      return fx0;
    });
    await wait(55); // let projectiles travel into flight while bursts are near peak
    await page.screenshot({ path: `tools/cas1545-${cls}.png` });
    pass(`[SHOT] tools/cas1545-${cls}.png (fx≈${spawned})`);
    await wait(40);
  }

  if (errors.length) fail(`[ERR] ${errors.length} JS error(s): ${errors.slice(0, 4).join(" | ")}`);
  else pass("[ERR] zero JS errors across the run");
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(ok ? "\n✓ CAS-1545 FX capture passed." : "\n✗ CAS-1545 FX capture FAILED.");
process.exit(ok ? 0 : 1);
