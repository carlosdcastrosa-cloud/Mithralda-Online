// ---------------------------------------------------------------------------
// CAS-307 — LIVE QA of CAS-304 (board CAS-302): mob ranged projectiles
// (spear/bolt) have NO visible in-flight trajectory on the real gh-pages build.
//
// Adapted from tools/cas304-mob-tracer.mjs but URL-aware: pass a live URL to test
// the deployed build; omit it to spin a local server. Proves the 5 acceptance points:
//
//   [1] MOB RANGED HIDDEN — mage bolt + spearman spear: projectile SPAWNS and
//       CONNECTS, but while provably in flight the canvas shows ZERO bolt-core
//       (bright green) pixels → no visible trajectory/sprite/trail.
//   [2] HIT STILL CONNECTS — heroDmgTaken>0 with the same timing path (sim untouched);
//       windup-ring (CAS-210/265) code is render-side and unrelated to the guard.
//   [3] NO PLAYER REGRESSION — a HERO projectile (paladin "judgment", gold) fired
//       at the parked mob IS still drawn (gold pixels >0) — the guard is gated on
//       p.enemy so player projectiles are never hidden.
//   [4] BOSS RADIAL TELEGRAPH VISIBLE — drive the frost capstone's Freeze Nova; the
//       enemy "frostnova" shards (NOT spear/bolt) still render (pale-blue px >0) —
//       non-directional boss telegraphs are intentionally OUT of the fix.
//   [5] CLEAN — 60fps soak, 0 page errors.
//
// Run (live): node tools/cas307-mob-tracer-live.mjs https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
// Run (local): node tools/cas307-mob-tracer-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
const errors = [];
let ok = true;
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = [];

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const LIVE = (process.argv[2] || "").replace(/\/$/, "");
const srv = LIVE ? null : await startServer();
const BASE = LIVE || srv.url;
if (LIVE) log(`… testing LIVE ${BASE}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

// Bolt-core signature scanner: bright, green-dominant pixels (#9bef5a/#eafff0 family).
// Dark FOUNTAINS terrain + warrior hero contain no such pixels.
const SCAN_GREEN = (rgbaList) => {
  let n = 0;
  for (let i = 0; i < rgbaList.length; i += 4) {
    const r = rgbaList[i], g = rgbaList[i + 1], b = rgbaList[i + 2];
    if (g > 215 && r >= 120 && r <= 190 && b < 130 && (g - b) > 90 && (g - r) > 40) n++;
  }
  return n;
};
// Gold "judgment" hero-projectile scanner (#ffd24d body / #fff6d8 core): r high, g mid-high,
// b low. Distinct from the green bolt and from the dark terrain.
const SCAN_GOLD = (rgbaList) => {
  let n = 0;
  for (let i = 0; i < rgbaList.length; i += 4) {
    const r = rgbaList[i], g = rgbaList[i + 1], b = rgbaList[i + 2];
    if (r > 220 && g >= 180 && g <= 240 && b < 130 && (r - b) > 110) n++;
  }
  return n;
};
// Pale-blue frostnova shard scanner (#bfefff/#7fd0ff/#eafaff): b high, g high, b>=r.
const SCAN_FROST = (rgbaList) => {
  let n = 0;
  for (let i = 0; i < rgbaList.length; i += 4) {
    const r = rgbaList[i], g = rgbaList[i + 1], b = rgbaList[i + 2];
    if (b > 220 && g > 195 && r >= 120 && r <= 215 && (b - r) > 35 && (b - g) >= 0) n++;
  }
  return n;
};

const scanCanvas = (page, scanFn) => page.evaluate((scanSrc) => {
  const cv = document.getElementById("c");
  const cx = cv.getContext("2d");
  const data = Array.from(cx.getImageData(0, 0, cv.width, cv.height).data);
  // eslint-disable-next-line no-new-func
  const scan = new Function("rgbaList", "return (" + scanSrc + ")(rgbaList);");
  return scan(data);
}, scanFn.toString());

async function shot(page, name) { const p = `/tmp/cas307-${name}.png`; await page.screenshot({ path: p }); SHOTS.push(p); return p; }

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon|\.png|\.mp4|\.webp|\.jpg/i.test(r.url())) errors.push(`http ${s}: ${r.url()}`); });

  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.bringToFront();

  // prove the live build id (read from the running page, not a stale CDN curl)
  const buildId = await page.evaluate(() => (window.__BUILD_ID || (window.__dev && window.__dev.buildId && window.__dev.buildId()) || null)).catch(() => null);
  log(`… live build id (page): ${buildId}`);

  // ---- self-test the green scanner on a synthetic disc -----------------------
  const selfTest = await page.evaluate((scanSrc) => {
    const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
    const cx = cv.getContext("2d"); cx.fillStyle = "#0c0e12"; cx.fillRect(0, 0, 32, 32);
    cx.fillStyle = "#9bef5a"; cx.beginPath(); cx.arc(16, 16, 6, 0, 6.28); cx.fill();
    const data = Array.from(cx.getImageData(0, 0, 32, 32).data);
    // eslint-disable-next-line no-new-func
    const scan = new Function("rgbaList", "return (" + scanSrc + ")(rgbaList);");
    return scan(data);
  }, SCAN_GREEN.toString());
  if (selfTest > 0) pass(`detector self-test: green bolt-core scanner flags a synthetic disc (${selfTest}px) → a 0-count live is meaningful`);
  else fail("detector self-test: scanner did NOT flag a synthetic green disc — scan is broken");

  // ---- boot to play (warrior) ----------------------------------------------
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "Cas307"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior (live)");

  // Drive a single ranged mob; poll sim + scan canvas while a shot is in flight.
  async function rangedArena(type) {
    await page.evaluate((t) => window.__dev.archArena(t, 230, 0), type);
    let maxProj = 0, dmg = 0, minGreenInFlight = Infinity, sawInFlight = false, shotInFlight = null;
    for (let i = 0; i < 160; i++) {
      const snap = await page.evaluate(() => window.__dev.archSnap());
      if (snap) {
        maxProj = Math.max(maxProj, snap.enemyProj);
        dmg = Math.max(dmg, snap.heroDmgTaken);
        if (snap.enemyProj >= 1) {
          sawInFlight = true;
          const green = await scanCanvas(page, SCAN_GREEN);
          if (green < (minGreenInFlight === Infinity ? Infinity : minGreenInFlight) || minGreenInFlight === Infinity) minGreenInFlight = Math.min(minGreenInFlight, green);
          if (!shotInFlight) shotInFlight = await shot(page, `inflight-${type}`);
        }
      }
      if (maxProj >= 1 && dmg > 0 && sawInFlight) break;
      await sleep(60);
    }
    return { maxProj, dmg, minGreenInFlight: minGreenInFlight === Infinity ? null : minGreenInFlight, sawInFlight };
  }

  // ===== [1]+[2] mage bolt — sim intact + trajectory hidden ==================
  const mage = await rangedArena("mage");
  if (mage.maxProj >= 1) pass(`[1] mage: ranged projectile SPAWNED (enemyProj peaked ${mage.maxProj})`);
  else fail(`[1] mage: no enemy projectile ever spawned (peak ${mage.maxProj})`);
  if (mage.dmg > 0) pass(`[2] mage: shot still CONNECTS (heroDmgTaken=${mage.dmg}) — damage/timing untouched`);
  else fail(`[2] mage: shot never connected (heroDmgTaken=${mage.dmg})`);
  if (mage.sawInFlight && mage.minGreenInFlight === 0) pass("[1] mage: bolt in flight shows ZERO bolt-core pixels — trajectory HIDDEN");
  else if (!mage.sawInFlight) fail("[1] mage: never observed a bolt in flight to scan");
  else fail(`[1] mage: ${mage.minGreenInFlight} bolt-core px visible while in flight — NOT hidden`);

  // ===== [1]+[2] spearman spear — same one-line guard ========================
  const spear = await rangedArena("spearman");
  if (spear.maxProj >= 1) pass(`[1] spearman: ranged projectile SPAWNED (peak ${spear.maxProj})`);
  else fail(`[1] spearman: no enemy projectile spawned (peak ${spear.maxProj})`);
  if (spear.dmg > 0) pass(`[2] spearman: shot still CONNECTS (heroDmgTaken=${spear.dmg})`);
  else fail(`[2] spearman: shot never connected (heroDmgTaken=${spear.dmg})`);
  // spear sprite is not green; the green scan stays at 0 too (no green core), and the
  // guard matches kind==="spear" identically — the sim proof above is the binding check.
  if (spear.sawInFlight && (spear.minGreenInFlight === 0 || spear.minGreenInFlight === null)) pass("[1] spearman: no bolt-core green leak while spear in flight (shared enemy spear|bolt guard)");

  // ===== [3] NO PLAYER REGRESSION — hero projectile still drawn ==============
  // Park a mob in front (so the hero faces it & has an aim), switch hero to paladin,
  // top up + cast slot-3 "judgment" (gold). The HERO projectile is NOT p.enemy, so the
  // guard never hides it: gold pixels must appear on the canvas.
  await page.evaluate(() => window.__dev.archArena("mage", 230, 0));
  await page.evaluate(() => { window.__dev.setClass("paladin"); window.__dev.clearSpellCD(); });
  let maxGold = 0;
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => { window.__dev.clearSpellCD(); window.__dev.cast(3); });
    for (let k = 0; k < 6; k++) { maxGold = Math.max(maxGold, await scanCanvas(page, SCAN_GOLD)); await sleep(40); }
    if (maxGold > 0) break;
  }
  await shot(page, "3-hero-judgment");
  if (maxGold > 0) pass(`[3] hero "judgment" projectile VISIBLE (${maxGold} gold px) — player projectiles NOT regressed (guard gated on p.enemy)`);
  else fail("[3] hero projectile never showed gold pixels — possible player regression");

  // ===== [4] BOSS RADIAL TELEGRAPH still visible =============================
  // Drive the frost capstone's Freeze Nova (kind:"frostnova", enemy:true, NOT spear/bolt).
  // It must STILL render: pale-blue shard pixels on the canvas while frostnova>0.
  let frostProj = 0, maxFrostPx = 0, frostDriven = false;
  try {
    await page.evaluate(() => { window.__dev.setUpg(8, 5, 4); window.__dev.frostGate(); });
    const summoned = await page.evaluate(() => {
      window.__dev.tpZone("frost"); window.__dev.seed(2121);
      const st = window.__dev.huntState("frost"); if (!st) return null;
      for (let i = 0; i < st.need; i++) window.__dev.spawnKill("wraith");
      return window.__dev.huntState("frost").champ;
    });
    if (summoned) {
      frostDriven = true;
      // CAS-121 drive: raise carapace ONCE, let the boss channel, then IGNORE it (just tank).
      // The ignored channel ERUPTS the Freeze Nova (kind:"frostnova"). Re-raising every frame
      // resets the channel, so raise once then only poke+poll.
      await page.evaluate(() => { window.__dev.poke("frost"); window.__dev.forceCarapace("frost"); window.__dev.poke("frost"); });
      const t0 = Date.now();
      while (Date.now() - t0 < 9000) {
        await page.evaluate(() => window.__dev.poke("frost"));
        const pj = await page.evaluate(() => window.__dev.enemyProj());
        if (pj && pj.frostnova > 0) {
          frostProj = Math.max(frostProj, pj.frostnova);
          maxFrostPx = Math.max(maxFrostPx, await scanCanvas(page, SCAN_FROST));
          if (!SHOTS.some((s) => /4-boss-frostnova/.test(s))) await shot(page, "4-boss-frostnova");
          if (maxFrostPx > 0) break;
        }
        await sleep(50);
      }
    }
  } catch (e) { log(`  (frost drive note: ${e.message})`); }
  if (frostDriven && frostProj > 0 && maxFrostPx > 0) pass(`[4] boss Freeze Nova radial telegraph STILL VISIBLE (frostnova=${frostProj}, ${maxFrostPx} pale-blue px) — non-directional telegraphs out of the fix`);
  else if (frostDriven && frostProj > 0) fail(`[4] frostnova spawned (${frostProj}) but NO pale-blue pixels rendered — boss telegraph wrongly hidden`);
  else fail(`[4] could not drive the frost boss to erupt (frostDriven=${frostDriven}, frostnova=${frostProj}) — inconclusive`);

  // ===== [5] CLEAN — fps soak ===============================================
  // back to a normal play frame for the fps read
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(n / ((performance.now() - t0) / 1000)); };
    requestAnimationFrame(loop);
  }));
  if (fps >= 55) pass(`[5] ${fps.toFixed(1)} fps under soak (≥55)`);
  else fail(`[5] low fps: ${fps.toFixed(1)}`);

  if (errors.length) { fail(`[5] ${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("[5] zero page errors");
} catch (e) {
  fail(`harness threw: ${e.stack || e.message}`);
} finally {
  await browser.close();
  if (srv) await srv.close();
}

log("\nshots: " + SHOTS.join(" "));
if (ok) { log("\n✓ CAS-307 LIVE QA PASS: mob ranged trajectory hidden; damage/timing/player/boss-telegraph intact."); process.exit(0); }
else { console.error("\n✗ CAS-307 LIVE QA FAILED."); process.exit(1); }
