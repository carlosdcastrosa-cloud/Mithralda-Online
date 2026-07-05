// ---------------------------------------------------------------------------
// CAS-1539 — Spellbar cooldown feedback QA. Boots the REAL modified build in
// headless Chromium, casts skills 1-3 to put them on cooldown, and verifies:
//   1) 0 JS errors while the enhanced renderSpellBar draws the pie + timer (AC5).
//   2) casting a skill puts it on a real cooldown (spellCD>0) so the pie has data.
//   3) captures a before/after screenshot of the spellbar region for eyeball review.
// Run: node tools/cas1539-spellbar-qa.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const log = (m) => console.log(m);
let ok = true;
const pass = (m) => log(`PASS — ${m}`);
const fail = (m) => { ok = false; console.error(`FAIL — ${m}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  await page.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "CDBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }))); // warrior
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(srv.url + "/?dev", { waitUntil: "load" });
  await enterPlay(page);

  // give mana so casts land, then cast slots 1-3 to open cooldowns
  const castRes = await page.evaluate(() => {
    const out = [];
    for (let i = 1; i <= 3; i++) { try { out.push(window.__dev.cast(i)); } catch (e) { out.push({ err: String(e) }); } }
    return out;
  });
  // let a couple frames render the spellbar with active cooldowns
  await new Promise((r) => setTimeout(r, 250));

  const cd = await page.evaluate(() => {
    // read cooldown snapshot via the sim's heroStats/dev contract if present
    try {
      const g = window.__dev;
      // cast() returns {mp, cd:[...]} — but re-read live cds through a fresh no-op cast attempt is unsafe;
      // instead poke the spell-info contract which mirrors spellCD.
      return (g.spellInfo ? [1,2,3].map(s=>g.spellInfo(s)) : null);
    } catch (e) { return null; }
  });

  // The authoritative signal: the last cast() return carried a cd array with >0 entries.
  const anyCD = castRes.some((r) => r && Array.isArray(r.cd) && r.cd.some((v) => v > 0));
  if (anyCD) pass("casting skills 1-3 opened real cooldowns (spellCD>0)");
  else fail("no cooldown observed after casting — cd arrays: " + JSON.stringify(castRes.map(r=>r&&r.cd)));

  // Screenshot the bottom-center spellbar region for eyeball review of pie + timer.
  fs.mkdirSync("/tmp/cas1539", { recursive: true });
  await page.screenshot({ path: "/tmp/cas1539/spellbar-cooldown.png", clip: { x: 280, y: 560, width: 340, height: 80 } });
  await page.screenshot({ path: "/tmp/cas1539/full.png" });
  pass("captured spellbar screenshot → /tmp/cas1539/spellbar-cooldown.png");

  if (errors.length === 0) pass("0 JS errors during enhanced spellbar render");
  else fail(errors.length + " JS errors: " + errors.slice(0, 3).join(" | "));

} catch (e) {
  fail("harness threw: " + (e && e.stack || e));
} finally {
  await browser.close();
  await srv.close();
}
console.log(ok ? "\n=== CAS-1539 SPELLBAR QA: PASS ===" : "\n=== CAS-1539 SPELLBAR QA: FAIL ===");
process.exit(ok ? 0 : 1);
