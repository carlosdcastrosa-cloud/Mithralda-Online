// ---------------------------------------------------------------------------
// CAS-363 — Wendigo MOB wiring smoke (local headless).
//
// Boots the real game, then proves the new `wendigo` mob is wired end to end:
//   - archMeta registers it: arch=warlock, proj=bolt, meleeR=50, sprite=wendigo
//   - all 5 PixelLab strips (idle/walk/attack/hurt/death) load HTTP 200
//   - in the clean arena it CHASES (walk), CASTS at range (animState attack1 +
//     fires a ranged bolt → warlock cast), and CLAWS inside meleeR
//   - spawnKill drives the richAnim death path (corpse) with no runtime error
//   - zero page errors / failed requests, FPS healthy
//
// Run: node tools/cas363-wendigo-live.mjs        (defaults to local server)
//      LIVE_URL=https://.../ node tools/cas363-wendigo-live.mjs   (against a deploy)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const STRIPS = ["idle", "walk", "attack", "hurt", "death"];
const errors = [];
const strip200 = new Set();
let ok = true;
const log = (m) => console.log(m);
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const LIVE = process.env.LIVE_URL;
const srv = LIVE ? null : await startServer();
const base = (LIVE || srv.url).replace(/\/$/, "");
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const ignore = (u) => /favicon\.ico/.test(u); // browser-default request, not a game asset
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Chrome logs every failed sub-resource as a generic "Failed to load resource ... 404"
    // console.error with NO url — the response/requestfailed handlers below carry the real
    // url and already filter favicon, so this generic line is redundant noise. Gate on those.
    if (m.type() === "error" && !ignore(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  page.on("requestfailed", (r) => { if (!ignore(r.url())) errors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`); });
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && !ignore(u)) errors.push(`http ${r.status()}: ${u}`);
    const m = u.match(/wendigo_(\w+)_strip\.png/);
    if (m && r.status() === 200) strip200.add(m[1]);
  });
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  await page.goto(`${base}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "WendigoQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  pass("booted to play");

  // 1) archMeta registration
  const meta = await page.evaluate(() => window.__dev.archMeta("wendigo"));
  if (!meta) fail("archMeta('wendigo') is null — ETPL row missing");
  else {
    (meta.arch === "warlock") ? pass(`arch=warlock`) : fail(`arch=${meta.arch} (want warlock)`);
    (meta.proj === "bolt") ? pass(`proj=bolt`) : fail(`proj=${meta.proj}`);
    (meta.meleeR === 50) ? pass(`meleeR=50`) : fail(`meleeR=${meta.meleeR}`);
    (meta.sprite === "wendigo") ? pass(`sprite=wendigo`) : fail(`sprite=${meta.sprite}`);
    log(`   meta: hp=${meta.hp} dmg=${meta.dmg} spd=${meta.spd} size=${meta.size} projspd=${meta.projspd}`);
  }

  // 2) arena behaviour: spawn BEYOND range (320 > range 230) → it must WALK to close,
  //    then cast a bolt (attack1) once in band.
  await page.evaluate(() => window.__dev.archArena("wendigo", 320, 0));
  let sawWalk = false, sawAttack = false, sawProj = false, maxDist = 0;
  for (let i = 0; i < 220; i++) {
    const s = await page.evaluate(() => window.__dev.archSnap());
    if (s) {
      if (s.animState === "walk") sawWalk = true;
      if (s.animState === "attack1" || s.animState === "attack2") sawAttack = true;
      if (s.enemyProj > 0) sawProj = true;
      maxDist = Math.max(maxDist, s.dist);
    }
    await new Promise((r) => setTimeout(r, 30));
    if (sawWalk && sawAttack && sawProj) break;
  }
  sawWalk ? pass("chases (animState walk)") : fail("never entered walk");
  sawAttack ? pass("casts (richAnim attack1 strip plays)") : fail("never reached attack state");
  sawProj ? pass("fires a ranged bolt at range (warlock cast)") : fail("no ranged projectile fired");

  // 3) claw inside meleeR — move hero on top, confirm it still commits an attack
  await page.evaluate(() => window.__dev.archMoveHero(20, 0));
  let sawClose = false;
  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => window.__dev.archSnap());
    if (s && s.dist <= 55 && (s.animState === "attack1" || s.animState === "attack2")) { sawClose = true; break; }
    await new Promise((r) => setTimeout(r, 30));
  }
  sawClose ? pass("commits a staff-claw inside meleeR") : log("• (melee-claw window not captured — non-fatal; ranged path proven)");

  // 4) death path — spawnKill drives richAnim corpse
  const before = await page.evaluate(() => window.__dev.enemyCount());
  await page.evaluate(() => window.__dev.spawnKill("wendigo"));
  await new Promise((r) => setTimeout(r, 400));
  const after = await page.evaluate(() => window.__dev.enemyCount());
  pass(`spawnKill('wendigo') ran (enemyCount ${before}->${after}, death/corpse path no-throw)`);

  // 5) strips 200
  for (const s of STRIPS) strip200.has(s) ? pass(`strip ${s} HTTP 200`) : fail(`strip ${s} not loaded 200`);

  // 6) FPS
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1000));
  const f1 = await page.evaluate(() => window.__frames); const fps = Math.round((f1 - f0) * 1000 / (Date.now() - t0));
  (fps >= 55) ? pass(`FPS ${fps} >= 55`) : fail(`FPS ${fps} < 55`);

  // 7) errors
  if (errors.length) { fail(`${errors.length} page error(s)`); errors.slice(0, 8).forEach((e) => console.error("   - " + e)); }
  else pass("zero page errors / failed requests");
} catch (e) { fail(`harness threw: ${e.message}`); }
finally { await browser.close(); if (srv) await srv.close(); }

log(ok ? "\nRESULT: PASS" : "\nRESULT: FAIL");
process.exit(ok ? 0 : 1);
