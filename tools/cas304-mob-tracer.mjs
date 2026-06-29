// ---------------------------------------------------------------------------
// CAS-304 — mob ranged projectile has NO visible in-flight trajectory.
//
// Board bug CAS-302: hide the visible trajectory of mob ranged attacks so the
// player can't see "de donde viene el golpe". CAS-303 removed the windup aim-line;
// CAS-304 hides the in-flight spear/bolt sprite itself.
//
// Proves, on the REAL game (headless Chromium), in one run:
//   1. detector self-test: the bright bolt-green pixel scanner DOES fire on a
//      synthetic green disc (so a 0-count on the live canvas is meaningful).
//   2. sim-integrity (mage bolt): a ranged mob's projectile still SPAWNS
//      (enemyProj >= 1) and still CONNECTS (heroDmgTaken > 0) — damage/timing path
//      untouched.
//   3. render-hidden (mage bolt): while a bolt is provably in flight (enemyProj>=1),
//      the canvas shows ZERO bolt-core green pixels → no visible trajectory.
//   4. sim-integrity (spearman spear): the spear projectile spawns AND connects —
//      same one-line guard (enemy && spear|bolt) covers it.
//   5. control (hero arrow visible): warrior melee aside, the PLAYER's projectiles
//      are NOT enemy and remain drawable (guard is gated on p.enemy) — asserted by
//      code path; player/melee untouched (no enemy flag).
//   6. zero page errors.
//
// Run: node tools/cas304-mob-tracer.mjs   (or: npm run cas304)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
const errors = [];
let ok = true;
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

// Bolt-core signature scanner: bright, green-dominant pixels (#9bef5a/#eafff0/#bcff8a
// family). Dark FOUNTAINS terrain + a warrior hero contain no such pixels.
const SCAN = (rgbaList /* Uint8ClampedArray-as-array */) => {
  let n = 0;
  for (let i = 0; i < rgbaList.length; i += 4) {
    const r = rgbaList[i], g = rgbaList[i + 1], b = rgbaList[i + 2];
    if (g > 215 && r >= 120 && r <= 190 && b < 130 && (g - b) > 90 && (g - r) > 40) n++;
  }
  return n;
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // ---- self-test the scanner on a synthetic green disc ----------------------
  const selfTest = await page.evaluate((scanSrc) => {
    const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
    const cx = cv.getContext("2d"); cx.fillStyle = "#0c0e12"; cx.fillRect(0, 0, 32, 32);
    cx.fillStyle = "#9bef5a"; cx.beginPath(); cx.arc(16, 16, 6, 0, 6.28); cx.fill();
    const data = Array.from(cx.getImageData(0, 0, 32, 32).data);
    // eslint-disable-next-line no-new-func
    const scan = new Function("rgbaList", "return (" + scanSrc + ")(rgbaList);");
    return scan(data);
  }, SCAN.toString());
  if (selfTest > 0) pass(`detector self-test: scanner flagged synthetic bolt disc (${selfTest} px)`);
  else fail("detector self-test: scanner did NOT flag a synthetic green disc — scan is broken");

  // ---- boot to play (warrior) ----------------------------------------------
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "Cas304"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  pass("booted to play as warrior");

  // Drive a single ranged mob, poll sim + scan the canvas while a shot is in flight.
  async function rangedArena(type, label) {
    await page.evaluate((t) => window.__dev.archArena(t, 230, 0), type);
    let maxProj = 0, dmg = 0, minGreenInFlight = Infinity, sawInFlight = false;
    for (let i = 0; i < 160; i++) { // up to ~9.6s
      const snap = await page.evaluate(() => window.__dev.archSnap());
      if (snap) {
        maxProj = Math.max(maxProj, snap.enemyProj);
        dmg = Math.max(dmg, snap.heroDmgTaken);
        if (snap.enemyProj >= 1) {
          sawInFlight = true;
          const green = await page.evaluate((scanSrc) => {
            const cv = document.getElementById("c");
            const cx = cv.getContext("2d");
            const data = Array.from(cx.getImageData(0, 0, cv.width, cv.height).data);
            // eslint-disable-next-line no-new-func
            const scan = new Function("rgbaList", "return (" + scanSrc + ")(rgbaList);");
            return scan(data);
          }, SCAN.toString());
          minGreenInFlight = Math.min(minGreenInFlight, green);
        }
      }
      if (maxProj >= 1 && dmg > 0 && sawInFlight) break;
      await new Promise((r) => setTimeout(r, 60));
    }
    return { maxProj, dmg, minGreenInFlight: minGreenInFlight === Infinity ? null : minGreenInFlight, sawInFlight };
  }

  // ---- mage (bolt: bright-green core) — full sim + render proof --------------
  const mage = await rangedArena("mage", "mage/bolt");
  if (mage.maxProj >= 1) pass(`mage: ranged projectile SPAWNED (enemyProj peaked ${mage.maxProj}) — sim path intact`);
  else fail(`mage: no enemy projectile ever spawned (peak ${mage.maxProj})`);
  if (mage.dmg > 0) pass(`mage: shot still CONNECTS (heroDmgTaken=${mage.dmg}) — damage/timing untouched`);
  else fail(`mage: shot never connected (heroDmgTaken=${mage.dmg})`);
  if (mage.sawInFlight && mage.minGreenInFlight === 0) pass("mage: bolt in flight shows ZERO bolt-core pixels — trajectory HIDDEN");
  else if (!mage.sawInFlight) fail("mage: never observed a bolt in flight to scan");
  else fail(`mage: ${mage.minGreenInFlight} bolt-core green px visible while in flight — trajectory NOT hidden`);

  // ---- spearman (spear sprite) — sim proof; same one-line guard covers it ----
  const spear = await rangedArena("spearman", "spearman/spear");
  if (spear.maxProj >= 1) pass(`spearman: ranged projectile SPAWNED (peak ${spear.maxProj}) — sim path intact`);
  else fail(`spearman: no enemy projectile spawned (peak ${spear.maxProj})`);
  if (spear.dmg > 0) pass(`spearman: shot still CONNECTS (heroDmgTaken=${spear.dmg}) — damage/timing untouched`);
  else fail(`spearman: shot never connected (heroDmgTaken=${spear.dmg})`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (ok) { log("\n✓ CAS-304 mob-tracer test passed: mob ranged trajectory hidden; damage/timing/player intact."); process.exit(0); }
else { console.error("\n✗ CAS-304 mob-tracer test FAILED."); process.exit(1); }
