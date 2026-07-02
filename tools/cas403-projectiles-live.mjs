// ---------------------------------------------------------------------------
// CAS-403 (board CAS-402) — ranged attacks VISIBLE in flight; telegraph ground
// areas / direction arrows GONE.
//
// Reverses the CAS-304 proof: the same bolt-core scanner that proved the bolt
// was hidden now proves it is VISIBLE, and a crimson danger-area scanner (with
// its own self-test) proves the windup ground telegraphs no longer draw.
//
// Gates:
//   1. green bolt-core scanner self-test fires on a synthetic disc.
//   2. crimson danger-area scanner self-test fires on a synthetic 0.5-alpha fill.
//   3. mage bolt: spawns (enemyProj>=1), CONNECTS (heroDmgTaken>0), and shows
//      bolt-core pixels while in flight → projectile VISIBLE.
//   4. spearman spear: spawns + connects (sim path intact; spear sprite drawn
//      by the same un-gated drawProjectile).
//   5. skeleton (basic melee): during windup, ZERO crimson px in the ground box
//      around the mob → basic danger circle/arc GONE.
//   6. orc (brute): during windup, ZERO crimson px → slam ellipse GONE.
//   7. served render.js source: CAS-304 early-return absent, TELEGRAPHS_OFF
//      present and gating the specialNow ring.
//   8. zero page errors.
//
// Run: node tools/cas403-projectiles-live.mjs
//   LIVE_URL=https://... node tools/cas403-projectiles-live.mjs  (against live)
// Screenshots: /tmp/cas403-bolt-inflight.png, /tmp/cas403-windup-notelegraph.png
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
const errors = [];
let ok = true;
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const LIVE = process.env.LIVE_URL || null;
const srv = LIVE ? null : await startServer();
const BASE = LIVE ? LIVE.replace(/\/$/, "") : srv.url;
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

// Bolt-core signature: bright green-dominant pixels (#9bef5a family) — same as CAS-304.
const GREEN = (d) => { let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (g > 215 && r >= 120 && r <= 190 && b < 130 && (g - b) > 90 && (g - r) > 40) n++;
  } return n; };
// Crimson danger-area signature: the telegraph fills (#b3242a / #e8463f / #d8403f at
// 0.4–0.5 alpha over the dark terrain) blend to red-dominant, low-green pixels whose
// BLUE stays >= GREEN (the crimson palette has b>g). That b>=g-6 clause excludes the
// two noise classes on a busy field: enemy HP bars (pure red, b~0 << g) and brown
// sprite/bark pixels (g > b).
const CRIM = (d) => { let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r >= 85 && g <= 75 && b <= 75 && (r - g) >= 50 && (r - b) >= 40 && (b - g) >= -6) n++;
  } return n; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // ---- scanner self-tests ---------------------------------------------------
  const st = await page.evaluate(([gSrc, cSrc]) => {
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 48;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#262a33"; cx.fillRect(0, 0, 64, 48); // dark FOUNTAINS-terrain stand-in
    cx.fillStyle = "#9bef5a"; cx.beginPath(); cx.arc(12, 12, 5, 0, 6.28); cx.fill();
    // positive: the telegraph fill blend (crimson at windup alpha)
    cx.globalAlpha = 0.45; cx.fillStyle = "#b3242a";
    cx.beginPath(); cx.ellipse(32, 32, 12, 6, 0, 0, 6.28); cx.fill(); cx.globalAlpha = 1;
    const d = Array.from(cx.getImageData(0, 0, 64, 48).data);
    // negatives: HP-bar red + brown sprite pixels must NOT fire the crimson scan
    const cv2 = document.createElement("canvas"); cv2.width = 32; cv2.height = 16;
    const cx2 = cv2.getContext("2d");
    cx2.fillStyle = "#262a33"; cx2.fillRect(0, 0, 32, 16);
    cx2.fillStyle = "#e12b10"; cx2.fillRect(2, 2, 12, 4);   // enemy HP bar red
    cx2.fillStyle = "#80432c"; cx2.fillRect(2, 9, 12, 4);   // brown bark/sprite
    const d2 = Array.from(cx2.getImageData(0, 0, 32, 16).data);
    const scanG = new Function("d", `return (${gSrc})(d);`), scanC = new Function("d", `return (${cSrc})(d);`);
    return { g: scanG(d), c: scanC(d), noise: scanC(d2) };
  }, [GREEN.toString(), CRIM.toString()]);
  if (st.g > 0) pass(`green scanner self-test fired (${st.g} px)`); else fail("green scanner self-test dead");
  if (st.c > 0) pass(`crimson scanner self-test fired (${st.c} px)`); else fail("crimson scanner self-test dead");
  if (st.noise === 0) pass("crimson scanner rejects HP-bar red + sprite brown (noise controls)");
  else fail(`crimson scanner fired on ${st.noise} noise px (HP bar / brown) — filter too loose`);

  // ---- boot to play (warrior) -----------------------------------------------
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "Cas403"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  pass("booted to play as warrior");

  const scanFull = (src) => page.evaluate((s) => {
    const cv = document.getElementById("c"), cx = cv.getContext("2d");
    const d = Array.from(cx.getImageData(0, 0, cv.width, cv.height).data);
    return new Function("d", `return (${s})(d);`)(d);
  }, src);
  // Scan a box in CANVAS px around the mob's ground area (hero is the camera
  // anchor; mob screen pos = center + (mob - hero) * dpr-scale of the canvas).
  const scanMobGround = (src) => page.evaluate((s) => {
    const cv = document.getElementById("c"), cx = cv.getContext("2d");
    const snap = window.__dev.archSnap(), h = window.__dev.hero();
    if (!snap || !h) return null;
    const kx = cv.width / cv.clientWidth, ky = cv.height / cv.clientHeight;
    const mx = cv.width / 2 + (snap.ex - h.x) * kx, my = cv.height / 2 + (snap.ey - h.y) * ky;
    // box = the ground band BELOW the mob sprite (y>=+14 skips its body/eyes/HP bar;
    // x>=-10 skips the hero and its red damage floaters). The old telegraphs (basic
    // circle r=range+12, brute ellipse at cy=+7) filled most of this band.
    const x0 = Math.max(0, Math.round(mx - 10)), y0 = Math.max(0, Math.round(my + 14));
    const w = Math.min(cv.width - x0, 100), hh = Math.min(cv.height - y0, 76);
    const d = Array.from(cx.getImageData(x0, y0, w, hh).data);
    return { n: new Function("d", `return (${s})(d);`)(d), state: snap.state, dmg: snap.heroDmgTaken };
  }, src);

  // ---- gate 3+4: ranged projectiles visible + sim intact ---------------------
  async function rangedGate(type, expectGreen) {
    await page.evaluate((t) => window.__dev.archArena(t, 230, 0), type);
    let maxProj = 0, dmg = 0, maxGreen = 0, sawInFlight = false, shot = false;
    for (let i = 0; i < 200; i++) {
      const snap = await page.evaluate(() => window.__dev.archSnap());
      if (snap) {
        maxProj = Math.max(maxProj, snap.enemyProj);
        dmg = Math.max(dmg, snap.heroDmgTaken);
        if (snap.enemyProj >= 1) {
          sawInFlight = true;
          if (expectGreen) {
            const g = await scanFull(GREEN.toString());
            if (g > maxGreen) { maxGreen = g;
              if (!shot && g > 0) { shot = true; await page.screenshot({ path: "/tmp/cas403-bolt-inflight.png" }); } }
          }
        }
      }
      if (maxProj >= 1 && dmg > 0 && (!expectGreen || maxGreen > 0)) break;
      await new Promise((r) => setTimeout(r, 60));
    }
    return { maxProj, dmg, maxGreen, sawInFlight };
  }

  const mage = await rangedGate("mage", true);
  if (mage.maxProj >= 1) pass(`mage: projectile spawned (peak ${mage.maxProj})`); else fail("mage: no projectile spawned");
  if (mage.dmg > 0) pass(`mage: shot connects (heroDmgTaken=${mage.dmg})`); else fail("mage: shot never connected");
  if (mage.sawInFlight && mage.maxGreen > 0) pass(`mage: bolt VISIBLE in flight (${mage.maxGreen} bolt-core px) — CAS-403 core gate`);
  else fail(`mage: bolt in flight but INVISIBLE (maxGreen=${mage.maxGreen}, sawInFlight=${mage.sawInFlight})`);

  const spear = await rangedGate("spearman", false);
  if (spear.maxProj >= 1 && spear.dmg > 0) pass(`spearman: spear spawns+connects (peak ${spear.maxProj}, dmg ${spear.dmg})`);
  else fail(`spearman: spawn/connect broken (peak ${spear.maxProj}, dmg ${spear.dmg})`);

  // ---- gate 5+6: NO crimson danger area during melee windup ------------------
  // Scan ONLY the first windup (heroDmgTaken===0): once a hit lands, red damage
  // floaters spawn on the hero (inside the scan box) and false-positive the crimson
  // scanner. The telegraph, when it existed, drew on EVERY windup frame — so a clean
  // first windup is a sufficient witness.
  async function windupGate(type, label) {
    // spawn FAR: the walk-in (~2s) lets floaters from the previous gate fade out
    await page.evaluate((t) => window.__dev.archArena(t, 200, 0), type);
    let maxCrim = -1, frames = 0, shot = false;
    for (let i = 0; i < 220 && frames < 6; i++) {
      const r = await scanMobGround(CRIM.toString());
      if (r && r.dmg > 0) break; // first hit landed — floaters incoming, stop scanning
      if (r && r.state === "windup") {
        frames++;
        maxCrim = Math.max(maxCrim, r.n);
        if (!shot) { shot = true; await page.screenshot({ path: "/tmp/cas403-windup-notelegraph.png" }); }
      }
      await new Promise((r2) => setTimeout(r2, 45));
    }
    if (frames === 0) fail(`${label}: never observed a pristine windup to scan`);
    else if (maxCrim === 0) pass(`${label}: ${frames} windup frames show ZERO crimson danger-area px — telegraph GONE`);
    else fail(`${label}: ${maxCrim} crimson telegraph px during windup — area still drawn`);
  }
  await windupGate("skeleton", "skeleton (basic circle/arc)");
  await windupGate("orc", "orc (brute slam ellipse)");

  // ---- gate 7: source-level assertions on the served render.js ---------------
  const src = await (await fetch(`${BASE}/render/render.js`)).text();
  if (!/p\.enemy && \(p\.kind==="spear"/.test(src)) pass("render.js: CAS-304 enemy-projectile early-return REMOVED");
  else fail("render.js: CAS-304 early-return still present — enemy projectiles hidden");
  if (/TELEGRAPHS_OFF=true/.test(src) && /!TELEGRAPHS_OFF && e\.specialNow/.test(src)) pass("render.js: TELEGRAPHS_OFF gates windup areas + specialNow ring");
  else fail("render.js: TELEGRAPHS_OFF gating missing");

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  if (srv) await srv.close();
}

if (ok) { log("\n✓ CAS-403 passed: ranged attacks visible, telegraph areas/arrows gone."); process.exit(0); }
else { console.error("\n✗ CAS-403 FAILED."); process.exit(1); }
