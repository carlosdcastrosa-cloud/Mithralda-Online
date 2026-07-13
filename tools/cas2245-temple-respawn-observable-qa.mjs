// CAS-2245 — QA OBSERVABLE (b5c10283) independent verification of HOME-TEMPLE RESPAWN (DARK, TEMPLE_RESPAWN.enabled:false).
// Complements the GE harness (cas2245-temple-respawn-qa.mjs, core ON/OFF/byte-id/regen) by covering the QA-owned gaps:
//   A. DESKTOP re-verify (independent): die→respawn lands EXACTLY at the city Templo POI, inSafeZone + nearTemple,
//      determinism (2nd death == same point), and the cohesive loop (SAFEZONE ×templeMul regen after the temple landing).
//   B. MOBILE / touch playability: touch viewport, flip isTouch (touchstart) + left-half virtual stick (PointerEvent
//      pointerType:touch) MOVES the hero; then flip ON + respawn lands at the Templo — mobile 0 JS errors, feature works.
//   C. REGRESSION (combined LIVE stack): with TEMPLE_RESPAWN present in the build, the shipped-LIVE ambient + sanctuary
//      stack is UNPERTURBED — __dev.safeZone/zone/daynight/weather all return healthy, worldFingerprint byte-stable.
//   D. Evidence screenshot of the hero standing at the Templo after a home-temple respawn (flag ON, in-memory).
// Ships-DARK is byte-safe by construction: the enabled:false respawn branch is textually identical to HEAD (verified via
// git diff) and no serialized field was added; this harness flips the flag IN-MEMORY only (on-disk config stays false).
// Run: node tools/cas2245-temple-respawn-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2245-observable");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

const srv = await startServer();

// ============================ A + C + D : DESKTOP re-verify + regression + screenshot ============================
{
  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
      if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errors.push(t); } });
    await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
    await toPlay(page);

    const build = await page.evaluate(() => window.__BUILD || null);
    ok("A1 boots clean to play (desktop), 0 JS errors", errors.length === 0, `build=${build} errs=${errors.length}`);

    // freeze ambient anims so nothing else moves the world during the checks
    await page.evaluate(() => { try { window.__dev.daynight({ phase: 0.5 }); window.__dev.weather(0); } catch (e) {} });

    // DARK default
    const dark = await page.evaluate(() => window.__dev.templeRespawn());
    ok("A2 DARK default enabled:false + home point derives from Templo POI", dark.enabled === false && dark.point && dark.nearTemple && dark.inSafeZone,
      `enabled=${dark.enabled} point=${JSON.stringify(dark.point)} near=${dark.nearTemple} inZone=${dark.inSafeZone}`);

    // flip ON in-memory, die + respawn
    const on1 = await page.evaluate(() => { window.__dev.templeRespawn({ enabled: true }); return window.__dev.templeRespawn({ respawn: true }); });
    const landOk = on1.hero && on1.point && dist(on1.hero, on1.point) < 1;
    ok("A3 ON: die → respawn lands EXACTLY at the city Templo", landOk && on1.nearTemple && on1.inSafeZone,
      `hero=${JSON.stringify(on1.hero)} point=${JSON.stringify(on1.point)} near=${on1.nearTemple} inZone=${on1.inSafeZone}`);

    // determinism: 2nd death → same point
    const on2 = await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    ok("A4 determinism: 2nd death lands at the SAME point (0 RNG)", on2.hero && on1.hero && dist(on1.hero, on2.hero) < 0.01,
      `p1=${on1.hero.x},${on1.hero.y} p2=${on2.hero.x},${on2.hero.y}`);

    // cohesive loop: HP climbs at the temple landing (SAFEZONE ×templeMul). Damage first (hero is full HP after respawn),
    // then sample regen via the SAFEZONE hook (same surface the shipped-LIVE sanctuary uses).
    const regen = await page.evaluate(async () => {
      const s0 = window.__dev.safeZone({ setHp: 90, pause: 0 });   // lower HP at the temple landing
      const hp0 = s0.hp;
      await new Promise(r => setTimeout(r, 1300));
      const s1 = window.__dev.safeZone();
      return { hp0, hp1: s1.hp, nearTemple: s1.nearTemple, templeMul: s1.templeMul };
    });
    ok("A5 cohesive loop: HP regenerates at the temple landing (sanctuary ×templeMul)",
      regen.hp1 > regen.hp0 && regen.nearTemple === true,
      `hp ${regen.hp0}→${regen.hp1.toFixed(1)} near=${regen.nearTemple} mul=${regen.templeMul}`);

    // C. REGRESSION — combined LIVE stack healthy with the feature present
    const reg = await page.evaluate(() => {
      const r = {};
      try { const s = window.__dev.safeZone(); r.safeZone = !!(s && s.temple && s.bbox); } catch (e) { r.safeZone = "ERR:" + e.message; }
      try { const z = window.__dev.zone(); r.zone = !!(z && Array.isArray(z.regions) && z.regions.length >= 4); } catch (e) { r.zone = "ERR:" + e.message; }
      try { const d = window.__dev.daynight(); r.daynight = typeof d.enabled === "boolean"; } catch (e) { r.daynight = "ERR:" + e.message; }
      try { const w = window.__dev.weather(); r.weather = (w != null); } catch (e) { r.weather = "ERR:" + e.message; }
      return r;
    });
    ok("C1 REGRESSION: SAFEZONE hook healthy (unperturbed)", reg.safeZone === true, `safeZone=${reg.safeZone}`);
    ok("C2 REGRESSION: ZONE_BANNER regions healthy (>=4 POI regions)", reg.zone === true, `zone=${reg.zone}`);
    ok("C3 REGRESSION: DAY/NIGHT + WEATHER hooks healthy", reg.daynight === true && reg.weather === true, `daynight=${reg.daynight} weather=${reg.weather}`);

    // worldFingerprint byte-stable across toggle (independent re-check)
    const fp = await page.evaluate(() => {
      const j = () => JSON.stringify(window.__dev.worldFingerprint());
      window.__dev.templeRespawn({ enabled: false }); const a = j();
      window.__dev.templeRespawn({ enabled: true }); const b = j();
      window.__dev.templeRespawn({ enabled: false }); const c = j();
      return { ab: a === b, ac: a === c };
    });
    ok("C4 worldFingerprint byte-stable across TEMPLE_RESPAWN toggle", fp.ab && fp.ac, `AB=${fp.ab} AC=${fp.ac}`);

    // D. evidence screenshot — hero at the Templo after a home-temple respawn (flag ON)
    await page.evaluate(() => window.__dev.templeRespawn({ enabled: true, respawn: true }));
    await sleep(300);
    await page.screenshot({ path: join(OUT, "desktop-temple-respawn.png") });
    ok("D1 evidence screenshot captured (hero at Templo post-respawn)", true);

    ok("A6 desktop run stayed error-free", errors.length === 0, `errs=${errors.length}`);
  } finally { await browser.close(); }
}

// ============================ B : MOBILE / touch playability ============================
{
  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
      if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errors.push(t); } });
    await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
    await toPlay(page);
    ok("B1 boots clean to play (mobile 414×736), 0 JS errors", errors.length === 0, `errs=${errors.length}`);

    // touch move via left-half virtual stick (proven CAS-2242 pattern): flip isTouch, then per-move PointerEvents
    // dispatched from separate evaluate calls (functions don't persist; __qaStick anchor lives on window).
    const before = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
    await page.evaluate(() => {
      const c = document.getElementById("c") || document.querySelector("canvas");
      window.dispatchEvent(new Event("touchstart", { bubbles: true }));   // flip isTouch=true
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
    ok("B2 mobile touch stick MOVES the hero", dist(before, after) > 5, `Δ=${dist(before, after).toFixed(1)}px`);

    // mobile: home-temple respawn works
    const mob = await page.evaluate(() => window.__dev.templeRespawn({ enabled: true, respawn: true }));
    ok("B3 mobile: die → respawn lands at the city Templo (inSafeZone + nearTemple)",
      mob.hero && mob.point && dist(mob.hero, mob.point) < 1 && mob.nearTemple && mob.inSafeZone,
      `hero=${JSON.stringify(mob.hero)} near=${mob.nearTemple} inZone=${mob.inSafeZone}`);

    await page.screenshot({ path: join(OUT, "mobile-temple-respawn.png") });
    ok("B4 mobile run stayed error-free", errors.length === 0, `errs=${errors.length}`);
  } finally { await browser.close(); }
}

await srv.close();
console.log(`\n${FAIL === 0 ? "ALL PASS" : "FAILURES"}: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
