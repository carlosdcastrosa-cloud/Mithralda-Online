// ---------------------------------------------------------------------------
// Class-identity (spell) probe — CAS-52, Pilar 4.
//
// Boots the real game headless, enters play, then for each of the 5 classes calls
// the dev hook __dev.spellProbe(cls), which casts each of slots 2-4 at a fresh
// dummy enemy and reports the OBSERVED effect. Asserts:
//   - every class returns 3 spells (15 total)
//   - each spell actually DID something (damage / heal / projectile / buff / CC)
//   - the 3 spells WITHIN a class are mechanically distinct (not just relabelled)
//   - a screenshot of each class' spell bar (colours/labels/costs) is saved
// This is the headless "captura por clase" required by the acceptance criteria.
//
// Run: npm run spells
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
const log = (m) => console.log(m);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

// "fingerprint" of a spell's effect — two spells with the same fingerprint are
// mechanically indistinguishable (the thing this pillar exists to prevent).
function effectKey(s) {
  return [
    s.type,
    s.enemyDmg > 0 ? "dmg" : "",
    s.heroHeal > 0 ? "heal" : "",
    s.hotActive ? "hot" : "",
    // projectiles distinguish on shape: AoE vs single-target, speed + damage tier
    s.projSpawned > 0 ? `proj${s.projAoe > 0 ? "+aoe" : ""}:spd${s.projSpd}:dmg${s.projDmg}` : "",
    s.dmgBuff > 0 ? "atk" : "",
    s.defBuff > 0 ? "def" : "",
    s.enemyStun > 0 ? "stun" : "",
    s.enemySlowT > 0 ? "slow" : "",
  ].filter(Boolean).join("|");
}
// did the spell observably DO anything at all?
function didSomething(s) {
  return s.enemyDmg > 0 || s.heroHeal > 0 || s.hotActive || s.projSpawned > 0 ||
         s.dmgBuff > 0 || s.defBuff > 0 || s.enemyStun > 0 || s.enemySlowT > 0;
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.spellProbe", { timeout: 15000 });

  // menu -> class select -> play (creates a hero we can re-class via the dev hook)
  await page.evaluate(() => { const i = document.getElementById("nameInput"); i.value = "SpellBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  log("✔ entered play");

  let total = 0;
  for (const cls of CLASSES) {
    const probe = await page.evaluate((c) => window.__dev.spellProbe(c), cls);
    if (!probe || probe.length !== 3) { fail(`${cls}: expected 3 spells, got ${probe ? probe.length : "null"}`); continue; }
    const keys = new Set();
    for (const s of probe) {
      total++;
      const k = effectKey(s);
      const detail = `dmg=${s.enemyDmg} heal=${s.heroHeal} hot=${s.hotActive} proj=${s.projSpawned} atk=${s.dmgBuff} def=${s.defBuff} stun=${s.enemyStun} slow=${s.enemySlowT} mp=${s.mpSpent}`;
      if (!didSomething(s)) fail(`${cls}.${s.id} (slot ${s.slot + 1}) had NO observable effect — ${detail}`);
      if (s.mpSpent !== s.cost) fail(`${cls}.${s.id} spent ${s.mpSpent} MP, expected cost ${s.cost}`);
      keys.add(k);
      log(`   ${cls.padEnd(8)} slot${s.slot + 1} ${s.id.padEnd(12)} [${s.type.padEnd(5)}] -> ${detail}`);
    }
    if (keys.size < 3) fail(`${cls}: spells are not all distinct (only ${keys.size}/3 unique effect fingerprints)`);
    else log(`✔ ${cls}: 3 distinct spells`);

    // screenshot the spell bar for this class (visual "captura por clase")
    await page.evaluate((c) => window.__dev.setClass(c), cls);
    await new Promise((r) => setTimeout(r, 120));
    const shot = join(ROOT, "tools", `spells-${cls}.png`);
    writeFileSync(shot, await page.screenshot());
    log(`   ↳ screenshot: ${shot}`);
  }

  if (total !== 15) fail(`expected 15 spells across 5 classes, observed ${total}`);
  else log(`✔ 15/15 spells exercised`);
  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else log("✔ zero page errors");
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (!ok) { console.error("\n✖ SPELLS PROBE FAILED."); process.exit(1); }
console.log("\n✓ Spells probe passed: 5 classes × 3 distinct, working spells.");
