// CAS-2255 — QA OBSERVABLE pass for RESTED XP / BONO DE DESCANSO DEL SANTUARIO (DARK, RESTED_XP.enabled:false).
// Independent QA re-verification of the GE self-verify (tools/cas2255-rested-xp-qa.mjs), plus the two things that
// self-verify does not cover for the Gate: (a) FULL-STACK Santuario regression — the whole LIVE arc (SAFEZONE regen +
// noAggro acquire-gate + Home-Temple Respawn) still behaves correctly with RESTED_XP flipped ON in the same boot, and
// (b) MOBILE/touch playability + DPR-capped fps. Byte-id OFF is proven from the SERVED config, not just source.
//
// The mechanic (recap): time spent INSIDE the SAFEZONE accrues a per-hero "Descanso" pool (accrualPerSec×dt, capped at
// poolCap). Leaving to hunt, the pool is SPENT as bonus XP = round(base×(xpMult-1)), drained ONLY outside the zone,
// bounded by the pool. Deterministic, 0 RNG, sim dt only ⇒ server-authority-ready; per-hero state ⇒ scales to N players.
//
// Observed via __dev.rested() (flips RESTED_XP.enabled IN-MEMORY, disk stays false ⇒ served build byte-identical),
// alongside __dev.safeZone / __dev.noAggro / __dev.templeRespawn (the rest of the arc) and __dev.worldFingerprint.
//
// Checks:
//   1  boots clean to play, 0 JS err, __dev.rested + __BUILD present.
//   2  DARK default: RESTED_XP.enabled===false AND restedPool field NEVER created (hasField false) ⇒ byte-id save.
//   3  OFF (==HEAD): outside the zone, addXp grants NO rested bonus; field still absent, pool 0.
//   4  worldFingerprint byte-stable across the enabled toggle at pool 0 (0 RNG drift).
//   5  geometry: hero enters (inZone) and exits (outside) the SAFEZONE — both accrual/spend sites reachable.
//   6  ON accrual: parked INSIDE the zone the pool GROWS ~accrualPerSec/s.
//   7  ON cap: pool CLAMPS at poolCap, never exceeds.
//   8  ON spend + multiplier: OUTSIDE, setPool 300 + addXp(100) drains EXACTLY round(100×(xpMult-1)).
//   9  ON spend gated OUTSIDE only: INSIDE the zone the same addXp does NOT drain (willSpend false, pool held).
//  10  spend pool-bounded: tiny pool (20) + big addXp(1000) drains only what's left (→0), never negative.
//  11  REGRESSION santuario regen: with rested ON, SAFEZONE HP regen at the Templo still heals.
//  12  REGRESSION noAggro: with rested ON, an in-zone idle mob never acquires (default-ON gate intact).
//  13  REGRESSION temple-respawn: with rested ON, respawn lands in the SAFEZONE at the Templo (inSafeZone+nearTemple).
//  14  served config byte-id: fetched sim/config.js has RESTED_XP.enabled:false (DARK shipped).
//  15  desk fps ≥58 with feature ON at the Templo.
//  M1 mobile boots to play, 0 err.
//  M2 mobile touch stick moves the hero (tested at open spawn FIRST — footgun CAS-2254).
//  M3 mobile rested accrual works ON inside the zone.
//  M4 mobile fps ≥50 (DPR-capped) with feature ON.
// Run: node tools/cas2255-rested-xp-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const OUT = join(ROOT, "shots", "cas2255");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const report = { build: null, desk: {}, mobile: {} };
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

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
// escape any curse/modal so the sim keeps ticking after a wilderness tp (footgun CAS-2250)
const escModals = async (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
});
const toTemple = (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
  return window.__dev.rested();
});
async function measFps(page, ms) {
  return await page.evaluate(async (dur) => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames * 1000 / (performance.now() - t0));
  }, ms);
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------- DESKTOP ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errors.push(t); } });
  await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  const build = await page.evaluate(() => window.__BUILD || null);
  report.build = build;
  const hasHook = await page.evaluate(() => !!(window.__dev && typeof window.__dev.rested === "function"));
  ok("1 boots clean, __dev.rested + __BUILD present, 0 JS errors", errors.length === 0 && !!build && hasHook, `build=${build} errs=${errors.length}`);

  const r0 = await page.evaluate(() => window.__dev.rested());
  ok("2 DARK default enabled===false AND restedPool field NEVER created (hasField false)", r0.enabled === false && r0.hasField === false,
     `enabled=${r0.enabled} hasField=${r0.hasField} pool=${r0.pool}`);

  const off = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.rested({ enabled: false });
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    const before = window.__dev.rested();
    window.__dev.rested({ setPool: 300 });   // ignored while OFF (gated)
    window.__dev.rested({ addXp: 100 });     // routes through gainXP; no bonus branch
    const after = window.__dev.rested();
    return { hasField: after.hasField, pool: after.pool, willSpend: before.willSpend };
  });
  ok("3 OFF (==HEAD): setPool ignored + addXp grants no rested bonus; field still absent", off.hasField === false && off.pool === 0 && off.willSpend === false,
     `hasField=${off.hasField} pool=${off.pool} willSpend=${off.willSpend}`);

  const fpEq = await page.evaluate(() => {
    const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j(); window.__dev.rested({ enabled: true }); const b = j();
    window.__dev.rested({ enabled: false }); const c = j();
    return { ab: a === b, ac: a === c };
  });
  ok("4 worldFingerprint byte-stable across enabled toggle at pool 0 (0 RNG drift)", fpEq.ab && fpEq.ac, `ab=${fpEq.ab} ac=${fpEq.ac}`);

  const rIn = await toTemple(page);
  const rOut = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    return window.__dev.rested(); });
  ok("5 hero enters (inZone) and exits (outside) the SAFEZONE — both sites reachable",
     rIn.inZone === true && rOut.inZone === false, `in=${rIn.inZone} out=${rOut.inZone}`);

  const acc = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.rested({ enabled: true, setPool: 0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    const p0 = window.__dev.rested().pool; await s(1200);
    const r = window.__dev.rested();
    return { p0, p1: r.pool, rate: r.accrualPerSec, inZone: r.inZone };
  });
  report.desk.accrual = acc;
  ok("6 ON accrual: parked INSIDE the pool GROWS (~accrualPerSec/s)", acc.inZone === true && acc.p1 > acc.p0 + 1,
     `pool ${acc.p0}→${acc.p1.toFixed(2)} over ~1.2s (rate=${acc.rate}/s)`);

  const cap = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = window.__dev.rested().cap;
    window.__dev.rested({ setPool: c - 3 }); await s(1500);
    return { cap: c, pool: window.__dev.rested().pool };
  });
  ok("7 ON cap: pool CLAMPS at poolCap (never exceeds)", Math.abs(cap.pool - cap.cap) < 1e-6, `pool=${cap.pool} cap=${cap.cap}`);

  const spend = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    window.__dev.rested({ setPool: 300 });
    const b = window.__dev.rested();
    window.__dev.rested({ addXp: 100 });
    const a = window.__dev.rested();
    return { mult: b.xpMult, willSpend: b.willSpend, before: b.pool, after: a.pool };
  });
  const expDrain = Math.round(100 * (spend.mult - 1)), drain8 = spend.before - spend.after;
  report.desk.spend = { ...spend, expDrain, drain8 };
  ok("8 ON spend + multiplier: drains EXACTLY round(base×(xpMult-1)) outside the zone",
     spend.willSpend === true && Math.abs(drain8 - expDrain) < 1e-6,
     `drain=${drain8} expected=${expDrain} (${spend.before}→${spend.after}, ×${spend.mult})`);

  const inSpend = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    window.__dev.rested({ setPool: 300 });
    const b = window.__dev.rested(); window.__dev.rested({ addXp: 100 }); const a = window.__dev.rested();
    return { willSpend: b.willSpend, before: b.pool, after: a.pool };
  });
  ok("9 ON spend gated OUTSIDE only: XP earned INSIDE does NOT consume rested (pool held)",
     inSpend.willSpend === false && inSpend.after >= inSpend.before - 1e-6, `willSpend=${inSpend.willSpend} ${inSpend.before}→${inSpend.after}`);

  const bounded = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    window.__dev.rested({ setPool: 20 }); window.__dev.rested({ addXp: 1000 });
    return window.__dev.rested().pool;
  });
  ok("10 spend pool-bounded: big XP with tiny pool drains only what's left, never negative", bounded === 0, `pool after over-draw=${bounded}`);

  // ---- FULL-STACK Santuario regression, all with RESTED_XP ON in the same boot ----
  const reg = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.rested({ enabled: true });
    // 11 SAFEZONE regen still heals
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp;
    await s(1500); const hp1 = window.__dev.safeZone().hp;
    // 12 noAggro default-ON: in-zone idle mob never acquires
    window.__dev.tp(t.x / 32, t.y / 32); await s(120);
    window.__dev.noAggro({ clear: true }); window.__dev.spawn("skeleton", 50, 0); await s(800);
    const na = window.__dev.noAggro();
    // 13 temple-respawn: die + respawn lands in the SAFEZONE at the Templo
    window.__dev.templeRespawn({ enabled: true }); window.__dev.templeRespawn({ respawn: true }); await s(200);
    const tr = window.__dev.templeRespawn();
    return { hp0, hp1, na: { noAggro: na.noAggro, heroInZone: na.heroInZone, states: na.enemies.map((e) => e.state) },
      tr: { inSafeZone: tr.inSafeZone, nearTemple: tr.nearTemple, dist: tr.distToTemple } };
  });
  report.desk.regression = reg;
  const IDLE = (st) => /idle|wander|patrol|roam|sleep/i.test(st);
  ok("11 REGRESSION SAFEZONE regen heals at the Templo with rested ON", (reg.hp1 - reg.hp0) > 1, `hp ${reg.hp0}→${(reg.hp1||0).toFixed?reg.hp1.toFixed(1):reg.hp1}`);
  ok("12 REGRESSION noAggro default-ON: in-zone idle mob never acquires with rested ON",
     reg.na.noAggro === true && reg.na.heroInZone === true && reg.na.states.length >= 1 && reg.na.states.every(IDLE), `states=${JSON.stringify(reg.na.states)}`);
  ok("13 REGRESSION temple-respawn lands in SAFEZONE at Templo with rested ON",
     reg.tr.inSafeZone === true && reg.tr.nearTemple === true, `inSafeZone=${reg.tr.inSafeZone} nearTemple=${reg.tr.nearTemple} dist=${reg.tr.dist}`);

  // 14 served config byte-id (fetched over the server, not just disk)
  const served = await page.evaluate(async (base) => {
    const r = await fetch(base + "/sim/config.js?cb=" + Date.now()); const txt = await r.text();
    const m = txt.match(/RESTED_XP\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
    return { status: r.status, enabled: m ? m[1] : "??" };
  }, srv.url);
  ok("14 served config byte-id: RESTED_XP.enabled:false shipped DARK", served.status === 200 && served.enabled === "false", `status=${served.status} enabled=${served.enabled}`);

  // 15 desk fps ON
  const fps = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.rested({ enabled: true, setPool: 300 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames * 1000 / (performance.now() - t0));
  });
  report.desk.fps = fps; report.desk.errors = errors;
  ok("15 desk fps ≥58 with feature ON", fps >= 58, `fps=${fps}`);
  await page.screenshot({ path: join(OUT, "observable-desk.png") });

  // ---------- MOBILE ----------
  const mp = await browser.newPage();
  await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const merrs = []; mp.on("pageerror", (e) => merrs.push(String(e)));
  mp.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|favicon/i.test(m.text())) merrs.push(m.text()); });
  // boot from a CLEAN save — the mobile page shares localStorage-origin with the desktop run's save; without clearing it
  // the game resumes instead of showing the menu and toPlay() would time out (test-sequence artifact, not a product bug).
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(mp);
  ok("M1 mobile boots to play, 0 JS error", merrs.length === 0 && (await mp.evaluate(() => window.__dev.scene())) === "play", `errs=${merrs.length}`);

  // touch move at open spawn FIRST (footgun CAS-2254: prop collision at Templo would mask the input)
  const mBefore = await mp.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  await mp.evaluate(() => {
    const c = document.getElementById("c") || document.querySelector("canvas");
    window.dispatchEvent(new Event("touchstart", { bubbles: true }));
    const r = c.getBoundingClientRect();
    window.__qaStick = { x0: r.left + r.width * 0.15, y0: r.top + r.height * 0.72 };
    const s = window.__qaStick;
    c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0, clientY: s.y0, bubbles: true, cancelable: true }));
  });
  const mMove = (type, dx) => mp.evaluate((type, dx) => {
    const c = document.getElementById("c") || document.querySelector("canvas");
    const s = window.__qaStick;
    c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0 + dx, clientY: s.y0, bubbles: true, cancelable: true }));
  }, type, dx);
  for (let i = 1; i <= 14; i++) { await mMove("pointermove", i * 6); await sleep(28); }
  await mMove("pointerup", 84); await sleep(200);
  const mAfter = await mp.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  report.mobile.moveDelta = +dist(mBefore, mAfter).toFixed(1);
  ok("M2 mobile touch stick MOVES the hero", dist(mBefore, mAfter) > 5, `delta=${report.mobile.moveDelta}`);

  const mAcc = await mp.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.rested({ enabled: true, setPool: 0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    const p0 = window.__dev.rested().pool; await s(1200);
    const r = window.__dev.rested();
    return { p0, p1: r.pool, inZone: r.inZone };
  });
  report.mobile.accrual = mAcc;
  ok("M3 mobile rested accrual grows inside the zone with feature ON", mAcc.inZone === true && mAcc.p1 > mAcc.p0 + 1,
     `pool ${mAcc.p0}→${mAcc.p1.toFixed(2)}`);

  const mFps = await measFps(mp, 2500);
  report.mobile.fps = mFps; report.mobile.errs = merrs;
  ok("M4 mobile fps ≥50 (DPR-capped) with feature ON", mFps >= 50, `fps=${mFps}`);
  await mp.screenshot({ path: join(OUT, "observable-mobile.png") });

  writeFileSync(join(OUT, "observable-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${FAIL === 0 ? "ALL GREEN" : "HAS FAILURES"}  PASS=${PASS} FAIL=${FAIL}  build=${build}`);
  process.exitCode = FAIL === 0 ? 0 : 1;
} finally {
  await browser.close();
  srv.stop && srv.stop();
}
