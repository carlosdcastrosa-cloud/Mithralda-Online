// CAS-2248 — QA OBSERVABLE, LIVE regression of HOME-TEMPLE RESPAWN (post-flip CAS-2247, TEMPLE_RESPAWN.enabled:true).
// Validates against the LIVE gh-pages build (the ONLY URL players use). Complements the DARK observable pass
// (cas2245-temple-respawn-observable-qa.mjs) — here the flag is ALREADY enabled:true ON DISK, so we assert the
// SERVED flag, then observe the real behaviour via the __dev hooks. Covers:
//   0. SERVED build id == expected + served config flags (TEMPLE_RESPAWN true; combined stack SAFEZONE/ZONE_BANNER/
//      DAYNIGHT/WEATHER/MINIMAP all true; DOORS_INTERIORS stays DARK false).
//   A. DESKTOP: boots clean 0-err; templeRespawn().enabled === true LIVE (not an in-memory flip); die→respawn lands
//      EXACTLY at the city Templo POI (inSafeZone + nearTemple); determinism (2nd death == same point, 0 RNG);
//      cohesive loop (SAFEZONE ×templeMul regen at the landing); 60fps sostenido.
//   B. COMBINED LIVE STACK regression: __dev.safeZone/zone/daynight/weather all healthy; DOORS layer inert no-throw;
//      worldFingerprint byte-stable across an in-memory TEMPLE_RESPAWN toggle.
//   C. MOBILE / touch: touch stick MOVES the hero; die→respawn lands at the Templo; 0 JS errors; 55-60fps.
//   D. Evidence screenshots (desktop + mobile) of the hero at the Templo after a home-temple respawn.
// Run: node tools/cas2248-temple-respawn-live-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "ebe58686c12f";
const OUT = join(ROOT, "shots", "cas2248-live");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function measFps(page, ms = 2500) {
  return page.evaluate((ms) => new Promise((res) => {
    let f = 0; const t0 = performance.now();
    function tick() { f++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(+(f / ((performance.now() - t0) / 1000)).toFixed(1)); }
    requestAnimationFrame(tick);
  }), ms);
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && __dev.scene && __dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(__dev.scene())", { timeout: 10000 });
  for (const s of ["customize", "abilitysel"]) { await sleep(250);
    if (await page.evaluate(() => __dev.scene()) === s) await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }))); }
  await page.waitForFunction("__dev.scene()==='play'", { timeout: 12000 });
  await sleep(400);
}

const errWatch = (page, errors) => { page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errors.push(t); } }); };

// ============================ 0. SERVED build id + config flags ============================
{
  const vjson = await (await fetch(`${LIVE}/version.json?cb=${Date.now()}`)).json().catch(() => ({}));
  ok(`0.1 LIVE build == ${EXPECT_BUILD}`, vjson.build === EXPECT_BUILD, `got=${vjson.build}`);

  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.goto(`${LIVE}/?dev=1&cb=flags${EXPECT_BUILD}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const flags = await page.evaluate(async (base) => {
      const c = await import(base + "/sim/config.js?cb=flg" + Date.now());
      return { TEMPLE_RESPAWN: c.TEMPLE_RESPAWN, SAFEZONE: c.SAFEZONE, ZONE_BANNER: c.ZONE_BANNER,
        DAYNIGHT: c.DAYNIGHT, WEATHER: c.WEATHER, MINIMAP: c.MINIMAP, DOORS_INTERIORS: c.DOORS_INTERIORS };
    }, LIVE);
    ok("0.2 served TEMPLE_RESPAWN.enabled:true LIVE (the flip under test)", flags.TEMPLE_RESPAWN?.enabled === true, JSON.stringify(flags.TEMPLE_RESPAWN));
    ok("0.3 served combined stack SAFEZONE/ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP all enabled:true",
      flags.SAFEZONE?.enabled && flags.ZONE_BANNER?.enabled && flags.DAYNIGHT?.enabled && flags.WEATHER?.enabled && flags.MINIMAP?.enabled,
      `SZ=${flags.SAFEZONE?.enabled} ZB=${flags.ZONE_BANNER?.enabled} DN=${flags.DAYNIGHT?.enabled} W=${flags.WEATHER?.enabled} MM=${flags.MINIMAP?.enabled}`);
    ok("0.4 served DOORS_INTERIORS stays DARK (enabled:false)", flags.DOORS_INTERIORS?.enabled === false, `doors=${flags.DOORS_INTERIORS?.enabled}`);
  } finally { await browser.close(); }
}

// ============================ A + B + D : DESKTOP LIVE observable + combined regression + evidence ============================
{
  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    const errors = []; errWatch(page, errors);
    await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(page);

    const build = await page.evaluate(() => window.__BUILD || null);
    ok("A1 boots clean to play (desktop), 0 JS errors, build matches", errors.length === 0 && build === EXPECT_BUILD, `build=${build} errs=${errors.length}`);

    // freeze ambient anims so nothing else moves the world during the checks
    await page.evaluate(() => { try { window.__dev.daynight({ phase: 0.5 }); window.__dev.weather(0); } catch (e) {} });

    // LIVE state: flag already enabled:true ON DISK (NOT an in-memory flip)
    const live = await page.evaluate(() => window.__dev.templeRespawn());
    ok("A2 templeRespawn().enabled === true LIVE + home point derives from city Templo POI",
      live.enabled === true && live.point && live.nearTemple === true && live.inSafeZone === true,
      `enabled=${live.enabled} point=${JSON.stringify(live.point)} near=${live.nearTemple} inZone=${live.inSafeZone} dist=${live.distToTemple}`);

    // die → respawn lands EXACTLY at the city Templo POI
    const on1 = await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    const landOk = on1.hero && on1.point && dist(on1.hero, on1.point) < 1;
    ok("A3 die → respawn lands EXACTLY at the city Templo (inSafeZone + nearTemple)",
      landOk && on1.nearTemple && on1.inSafeZone,
      `hero=${JSON.stringify(on1.hero)} point=${JSON.stringify(on1.point)} near=${on1.nearTemple} inZone=${on1.inSafeZone}`);

    // determinism: 2nd death → identical point (0 RNG)
    const on2 = await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    ok("A4 determinism: 2nd death lands at the SAME point (0 RNG)",
      on2.hero && on1.hero && dist(on1.hero, on2.hero) < 0.01,
      `p1=${on1.hero.x},${on1.hero.y} p2=${on2.hero.x},${on2.hero.y}`);

    // cohesive loop: SAFEZONE ×templeMul regen at the temple landing (die→home→recover HP)
    const regen = await page.evaluate(async () => {
      const s0 = window.__dev.safeZone({ setHp: 90, pause: 0 });
      const hp0 = s0.hp;
      await new Promise(r => setTimeout(r, 1300));
      const s1 = window.__dev.safeZone();
      return { hp0, hp1: s1.hp, nearTemple: s1.nearTemple, templeMul: s1.templeMul };
    });
    ok("A5 cohesive loop: HP regenerates at the temple landing (sanctuary ×templeMul)",
      regen.hp1 > regen.hp0 && regen.nearTemple === true,
      `hp ${regen.hp0}→${(+regen.hp1).toFixed(1)} near=${regen.nearTemple} mul=${regen.templeMul}`);

    // B. COMBINED LIVE STACK regression
    const reg = await page.evaluate(() => {
      const r = {};
      try { const s = window.__dev.safeZone(); r.safeZone = !!(s && s.temple && s.bbox); } catch (e) { r.safeZone = "ERR:" + e.message; }
      try { const z = window.__dev.zone(); r.zone = !!(z && z.enabled === true && Array.isArray(z.regions) && z.regions.length >= 4); } catch (e) { r.zone = "ERR:" + e.message; }
      try { const d = window.__dev.daynight(); r.daynight = d.enabled === true; } catch (e) { r.daynight = "ERR:" + e.message; }
      try { const w = window.__dev.weather(); r.weather = (w != null); } catch (e) { r.weather = "ERR:" + e.message; }
      try { const dl = window.__dev.doorList(); r.doors = Array.isArray(dl) && dl.length === 0; } catch (e) { r.doors = "ERR:" + e.message; }
      return r;
    });
    ok("B1 SAFEZONE hook healthy LIVE (city bbox + temple)", reg.safeZone === true, `safeZone=${reg.safeZone}`);
    ok("B2 ZONE_BANNER enabled:true + >=4 POI regions LIVE", reg.zone === true, `zone=${reg.zone}`);
    ok("B3 DAY/NIGHT + WEATHER hooks healthy LIVE", reg.daynight === true && reg.weather === true, `daynight=${reg.daynight} weather=${reg.weather}`);
    ok("B4 DOORS_INTERIORS inert (empty door layer, DARK) — no-throw", reg.doors === true, `doors=${reg.doors}`);

    // worldFingerprint byte-stable across an in-memory TEMPLE_RESPAWN toggle (returns to LIVE enabled:true after)
    const fp = await page.evaluate(() => {
      const j = () => JSON.stringify(window.__dev.worldFingerprint());
      const a = j();
      window.__dev.templeRespawn({ enabled: false }); const b = j();
      window.__dev.templeRespawn({ enabled: true }); const c = j();
      return { ab: a === b, ac: a === c };
    });
    ok("B5 worldFingerprint byte-stable across TEMPLE_RESPAWN toggle", fp.ab && fp.ac, `AB=${fp.ab} AC=${fp.ac}`);

    // 60fps sostenido
    const fps = [];
    for (let i = 0; i < 4; i++) { fps.push(await measFps(page, 2500)); await sleep(150); }
    const fmin = Math.min(...fps), fmax = Math.max(...fps);
    const sorted = [...fps].sort((a, b) => a - b);
    const fmed = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : +((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1);
    ok("B6 desktop 60fps sostenido (mediana ≥58, max ≥59, piso ≥45)", fmed >= 58 && fmax >= 59 && fmin >= 45, `samples=${JSON.stringify(fps)} median=${fmed}`);

    // D. evidence screenshot — hero at the Templo after a home-temple respawn
    await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    await sleep(300);
    await page.screenshot({ path: join(OUT, "desktop-temple-respawn.png") });
    ok("D1 desktop evidence screenshot captured (hero at Templo post-respawn)", true);

    ok("A6 desktop run stayed error-free", errors.length === 0, `errs=${errors.length}`);
  } finally { await browser.close(); }
}

// ============================ C : MOBILE / touch playability ============================
{
  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    const errors = []; errWatch(page, errors);
    await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(page);
    ok("C1 boots clean to play (mobile 390×844), 0 JS errors", errors.length === 0, `errs=${errors.length}`);

    // touch move via left-half virtual stick (proven CAS-2242 pattern)
    const before = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
    await page.evaluate(() => {
      const c = document.getElementById("c") || document.querySelector("canvas");
      window.dispatchEvent(new Event("touchstart", { bubbles: true }));
      const r = c.getBoundingClientRect();
      window.__qaStick = { x0: r.left + r.width * 0.15, y0: r.top + r.height * 0.72 };
      const s = window.__qaStick;
      c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0, clientY: s.y0, bubbles: true, cancelable: true }));
    });
    const move = (type, dx) => page.evaluate((type, dx) => {
      const c = document.getElementById("c") || document.querySelector("canvas");
      const s = window.__qaStick;
      c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0 + dx, clientY: s.y0, bubbles: true, cancelable: true }));
    }, type, dx);
    for (let i = 1; i <= 14; i++) { await move("pointermove", i * 6); await sleep(28); }
    await move("pointerup", 84);
    await sleep(200);
    const after = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
    ok("C2 mobile touch stick MOVES the hero", dist(before, after) > 5, `Δ=${dist(before, after).toFixed(1)}px`);

    // mobile: home-temple respawn works LIVE
    const mob = await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    ok("C3 mobile: die → respawn lands at the city Templo (inSafeZone + nearTemple)",
      mob.hero && mob.point && dist(mob.hero, mob.point) < 1 && mob.nearTemple && mob.inSafeZone,
      `hero=${JSON.stringify(mob.hero)} near=${mob.nearTemple} inZone=${mob.inSafeZone}`);

    const mfps = await measFps(page, 2500);
    ok("C4 mobile fps healthy (≥50)", mfps >= 50, `fps=${mfps}`);

    await page.screenshot({ path: join(OUT, "mobile-temple-respawn.png") });
    ok("C5 mobile run stayed error-free", errors.length === 0, `errs=${errors.length}`);
  } finally { await browser.close(); }
}

console.log(`\n${FAIL === 0 ? "ALL PASS" : "FAILURES"}: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
