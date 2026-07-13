// CAS-2260 — QA POST-FLIP OBSERVABLE full-stack regression on the LIVE gh-pages build, with RESTED XP flipped ON on disk.
// Fires on the CAS-2257 flip deploy (RESTED_XP.enabled:true LIVE, build 5f266f2801ed). Unlike the DARK harness
// (cas2255-rested-xp-observable-qa.mjs, which flips the flag IN-MEMORY over a byte-id-OFF served build), this proves the
// mechanic against the LIVE served build where enabled:true is ON-DISK — no __dev flip needed to observe accrual/spend.
//
// Rested recap: time INSIDE the SAFEZONE accrues a per-hero "Descanso" pool (accrualPerSec×dt, capped at poolCap).
// Leaving to hunt, the pool is SPENT as bonus XP = round(base×(xpMult-1)), drained ONLY outside the zone, bounded by the
// pool. Deterministic, 0 RNG, sim dt only ⇒ server-authority-ready; per-hero state ⇒ scales to N players.
//
// Observed via __dev.rested/safeZone/noAggro/templeRespawn/zone/daynight/weather/dmgVsTarget/saveBlob/saveNow +
// __dev.worldFingerprint, all live on the deployed build (?dev=1 gate).
//
// Checks (desktop):
//   1  boots clean to play on LIVE, build===EXPECT, __dev.rested + __BUILD present, 0 JS err, 0 non-favicon 404.
//   2  served config byte-id: fetched sim/config.js has RESTED_XP.enabled:true (LIVE flip shipped).
//   3  LIVE default ON (on-disk, NOT in-memory): rested().enabled===true out of the box.
//   4  accrual: parked INSIDE the SAFEZONE the pool GROWS ~accrualPerSec/s (rate 6/s).
//   5  cap: pool CLAMPS at poolCap (600), never exceeds.
//   6  spend + ×1.5: OUTSIDE, setPool 300 + addXp(100) drains EXACTLY round(100×(xpMult-1))=50.
//   7  spend gated OUTSIDE only: INSIDE the zone the same addXp does NOT drain (willSpend false, pool held).
//   8  spend pool-bounded: tiny pool (20) + big addXp(1000) drains only what's left (→0), never negative.
//   9  worldFingerprint byte-stable across two reads (world determinism intact with rested ON).
//  10  save round-trip: setPool 250 → saveBlob() serializes restedPool≈250 (ON emits the key).
//  11  SAVE COMPAT: an OLD save WITHOUT restedPool (key deleted) reloads to pool 0, boots clean, no NaN/throw.
//  12  REGRESSION santuario regen: SAFEZONE HP regen at the Templo still heals with rested ON.
//  13  REGRESSION noAggro: an in-zone idle mob never acquires (default-ON gate intact) with rested ON.
//  14  REGRESSION temple-respawn: die+respawn lands in the SAFEZONE at the Templo (inSafeZone+nearTemple).
//  15  REGRESSION nav: ZONE_BANNER regions derive (Templo/Depósito/Taberna/Parque + Ciudad) + MINIMAP flag on.
//  16  REGRESSION ambiental: DAYNIGHT phase override + WEATHER rain/fog force both respond, both enabled.
//  17  REGRESSION combate core: manual hit deals positive damage to a spawned target (dmgVsTarget>0).
//  18  desk fps ≥58 with the whole stack live at the Templo.
//  M1 mobile boots to play on LIVE, 0 err.
//  M2 mobile touch stick moves the hero (open spawn FIRST — footgun CAS-2254).
//  M3 mobile rested accrual grows inside the zone (LIVE ON).
//  M4 mobile fps ≥50 (DPR-capped).
// Run: node tools/cas2260-rested-live-fullstack-qa.mjs   [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "5f266f2801ed";
const OUT = join(ROOT, "shots", "cas2260");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const report = { live: LIVE, expectBuild: EXPECT_BUILD, build: null, desk: {}, mobile: {} };
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

function wireErrs(page, errs, net404) {
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/i.test(u)) net404.push(u + " " + (r.failure()?.errorText || "")); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) net404.push(r.url() + " 404"); });
}
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
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
const escToPlay = async (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
});
const toWild = (page) => page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
  window.__dev.tp(2, 2); await s(140);
  for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); } });
const toTemple = (page) => page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
  const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(160); return window.__dev.rested(); });
async function measFps(page, ms) {
  return await page.evaluate(async (dur) => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames * 1000 / (performance.now() - t0));
  }, ms);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------- DESKTOP ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
  const errors = [], net404 = [];
  wireErrs(page, errors, net404);
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(page);

  const build = await page.evaluate(() => window.__BUILD || null);
  report.build = build;
  const hasHook = await page.evaluate(() => !!(window.__dev && typeof window.__dev.rested === "function"));
  ok("1 boots clean on LIVE, build===EXPECT, __dev.rested+__BUILD present, 0 JS err, 0 404",
     errors.length === 0 && net404.length === 0 && build === EXPECT_BUILD && hasHook,
     `build=${build} expect=${EXPECT_BUILD} errs=${errors.length} 404=${net404.length}`);

  const served = await page.evaluate(async (base) => {
    const r = await fetch(base + "/sim/config.js?cb=" + Date.now()); const txt = await r.text();
    const m = txt.match(/RESTED_XP\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
    return { status: r.status, enabled: m ? m[1] : "??" };
  }, LIVE);
  ok("2 served config byte-id: RESTED_XP.enabled:true shipped LIVE", served.status === 200 && served.enabled === "true", `status=${served.status} enabled=${served.enabled}`);

  const r0 = await page.evaluate(() => window.__dev.rested());
  report.desk.r0 = r0;
  ok("3 LIVE default ON (on-disk): rested().enabled===true out of the box", r0.enabled === true, `enabled=${r0.enabled} pool=${r0.pool} cap=${r0.cap} mult=${r0.xpMult} rate=${r0.accrualPerSec}`);

  const acc = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.rested({ setPool: 0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(160);
    const p0 = window.__dev.rested().pool; await s(1200);
    const r = window.__dev.rested(); return { p0, p1: r.pool, rate: r.accrualPerSec, inZone: r.inZone }; });
  report.desk.accrual = acc;
  ok("4 accrual: parked INSIDE the pool GROWS (~accrualPerSec/s)", acc.inZone === true && acc.p1 > acc.p0 + 1,
     `pool ${acc.p0}→${acc.p1.toFixed(2)} over ~1.2s (rate=${acc.rate}/s)`);

  const cap = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    const c = window.__dev.rested().cap; window.__dev.rested({ setPool: c - 3 }); await s(1500);
    return { cap: c, pool: window.__dev.rested().pool }; });
  ok("5 cap: pool CLAMPS at poolCap (never exceeds)", Math.abs(cap.pool - cap.cap) < 1e-6, `pool=${cap.pool} cap=${cap.cap}`);

  await toWild(page);
  const spend = await page.evaluate(() => {
    window.__dev.rested({ setPool: 300 }); const b = window.__dev.rested();
    window.__dev.rested({ addXp: 100 }); const a = window.__dev.rested();
    return { mult: b.xpMult, willSpend: b.willSpend, before: b.pool, after: a.pool }; });
  const expDrain = Math.round(100 * (spend.mult - 1)), drain6 = spend.before - spend.after;
  report.desk.spend = { ...spend, expDrain, drain6 };
  ok("6 spend + ×1.5 outside: drains EXACTLY round(base×(xpMult-1))",
     spend.willSpend === true && Math.abs(drain6 - expDrain) < 1e-6, `drain=${drain6} expected=${expDrain} (${spend.before}→${spend.after}, ×${spend.mult})`);

  const inSpend = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(160);
    window.__dev.rested({ setPool: 300 }); const b = window.__dev.rested();
    window.__dev.rested({ addXp: 100 }); const a = window.__dev.rested();
    return { willSpend: b.willSpend, before: b.pool, after: a.pool }; });
  ok("7 spend gated OUTSIDE only: XP earned INSIDE does NOT consume rested",
     inSpend.willSpend === false && inSpend.after >= inSpend.before - 1e-6, `willSpend=${inSpend.willSpend} ${inSpend.before}→${inSpend.after}`);

  await toWild(page);
  const bounded = await page.evaluate(() => { window.__dev.rested({ setPool: 20 }); window.__dev.rested({ addXp: 1000 }); return window.__dev.rested().pool; });
  ok("8 spend pool-bounded: big XP with tiny pool drains only what's left, never negative", bounded === 0, `pool after over-draw=${bounded}`);

  const fpEq = await page.evaluate(() => { const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j(), b = j(); return a === b; });
  ok("9 worldFingerprint byte-stable across reads (world determinism intact w/ rested ON)", fpEq === true, `stable=${fpEq}`);

  const blob = await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
    window.__dev.rested({ setPool: 250 }); const s = window.__dev.saveBlob();
    const h = (s && (s.hero || s.h)) || s; return { restedPool: h ? h.restedPool : undefined, hasKey: h ? ("restedPool" in h) : false }; });
  report.desk.saveBlob = blob;
  ok("10 save round-trip: saveBlob() serializes restedPool≈250 (ON emits key)", blob.hasKey === true && Math.abs((blob.restedPool || 0) - 250) < 1, `restedPool=${blob.restedPool} hasKey=${blob.hasKey}`);

  // 11 SAVE COMPAT: persist a real save, delete restedPool from the stored blob (old-save shape), reload → pool 0.
  // noSave() (persist.suppress) is CRITICAL: without it the pagehide autosave flush (persist.js) re-writes the
  // in-memory pool 250 on navigation and clobbers the mutation before the reload reads it (test-seq artifact).
  await page.evaluate(() => { window.__dev.rested({ setPool: 250 }); window.__dev.saveNow(); window.__dev.noSave(); });
  const mutated = await page.evaluate(() => {
    const KEY = "mithralda.save.v1"; const raw = localStorage.getItem(KEY); if (!raw) return { ok: false, why: "no save" };
    let o; try { o = JSON.parse(raw); } catch (e) { return { ok: false, why: "parse" }; }
    const h = o.hero || o.h || o; const had = h ? ("restedPool" in h) : false; if (h) delete h.restedPool;
    localStorage.setItem(KEY, JSON.stringify(o)); return { ok: true, had, stillHas: h ? ("restedPool" in h) : false };
  });
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}r`, { waitUntil: "networkidle2", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  await escToPlay(page);
  const resumed = await page.evaluate(() => { const sc = window.__dev.scene(); const r = (sc === "play") ? window.__dev.rested() : null;
    return { scene: sc, pool: r ? r.pool : null, finite: r ? Number.isFinite(r.pool) : null }; });
  report.desk.saveCompat = { mutated, resumed, errsAfter: errors.length };
  ok("11 SAVE COMPAT: old save without restedPool reloads to pool 0, boots clean, no NaN/throw",
     mutated.ok && mutated.had === true && mutated.stillHas === false && resumed.scene === "play" && resumed.pool === 0 && resumed.finite === true && errors.length === 0,
     `had=${mutated.had} stillHas=${mutated.stillHas} scene=${resumed.scene} pool=${resumed.pool} finite=${resumed.finite} errs=${errors.length}`);

  // ---- FULL-STACK regression, all with RESTED_XP native ON ----
  const reg = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(160);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp;
    await s(1500); const hp1 = window.__dev.safeZone().hp;
    window.__dev.tp(t.x / 32, t.y / 32); await s(120);
    window.__dev.noAggro({ clear: true }); window.__dev.spawn("skeleton", 50, 0); await s(800);
    const na = window.__dev.noAggro();
    window.__dev.templeRespawn({ enabled: true }); window.__dev.templeRespawn({ respawn: true }); await s(220);
    const tr = window.__dev.templeRespawn();
    return { hp0, hp1, na: { noAggro: na.noAggro, heroInZone: na.heroInZone, states: na.enemies.map((e) => e.state) },
      tr: { inSafeZone: tr.inSafeZone, nearTemple: tr.nearTemple, dist: tr.distToTemple } }; });
  report.desk.regression = reg;
  const IDLE = (st) => /idle|wander|patrol|roam|sleep/i.test(st);
  ok("12 REGRESSION SAFEZONE regen heals at the Templo with rested ON", (reg.hp1 - reg.hp0) > 1, `hp ${reg.hp0}→${(reg.hp1 || 0).toFixed ? reg.hp1.toFixed(1) : reg.hp1}`);
  ok("13 REGRESSION noAggro default-ON: in-zone idle mob never acquires with rested ON",
     reg.na.noAggro === true && reg.na.heroInZone === true && reg.na.states.length >= 1 && reg.na.states.every(IDLE), `states=${JSON.stringify(reg.na.states)}`);
  ok("14 REGRESSION temple-respawn lands in SAFEZONE at Templo with rested ON",
     reg.tr.inSafeZone === true && reg.tr.nearTemple === true, `inSafeZone=${reg.tr.inSafeZone} nearTemple=${reg.tr.nearTemple} dist=${reg.tr.dist}`);

  const nav = await page.evaluate(() => { const z = window.__dev.zone();
    const names = z.regions.map((r) => r.name); return { enabled: z.enabled, regions: names, hasCity: names.some((n) => /ciudad/i.test(n)) }; });
  report.desk.nav = nav;
  ok("15 REGRESSION nav: ZONE_BANNER regions derive (POIs + Ciudad container)",
     nav.regions.length >= 4 && nav.hasCity === true, `regions=${JSON.stringify(nav.regions)}`);

  const amb = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    const dNoon = window.__dev.daynight({ phase: 0.5 }); await s(60); const dNight = window.__dev.daynight({ phase: 0.0 });
    const wRain = window.__dev.weather({ phase: 0.0 }); await s(60); const wFog = window.__dev.weather({ phase: 0.5 });
    window.__dev.daynight(null); window.__dev.weather(null);
    return { dnEnabled: dNoon.enabled, noonGlow: dNoon.glow, nightGlow: dNight.glow, wEnabled: wRain.enabled, s0: wRain.state, s1: wFog.state }; });
  report.desk.ambient = amb;
  ok("16 REGRESSION ambiental: DAYNIGHT + WEATHER both enabled and respond to override",
     amb.dnEnabled === true && amb.wEnabled === true && amb.nightGlow !== amb.noonGlow, `dn(noonGlow=${amb.noonGlow} nightGlow=${amb.nightGlow}) weather(${amb.s0}/${amb.s1})`);

  const dmg = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
    return { normal: window.__dev.dmgVsTarget(false), elite: window.__dev.dmgVsTarget(true) }; });
  report.desk.combat = dmg;
  ok("17 REGRESSION combate core: manual hit deals positive damage", dmg.normal > 0, `dmg normal=${dmg.normal} elite=${dmg.elite}`);

  // fps: median of 3 short samples (tolerate 1 headless-chromium compile/GC dip; established perf-gate convention).
  await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.rested({ setPool: 300 }); const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(160); });
  const fpsSamples = [];
  for (let i = 0; i < 3; i++) fpsSamples.push(await measFps(page, 1400));
  const fpsMed = fpsSamples.slice().sort((a, b) => a - b)[1], fpsMax = Math.max(...fpsSamples);
  report.desk.fps = fpsMed; report.desk.fpsSamples = fpsSamples; report.desk.errors = errors; report.desk.net404 = net404;
  ok("18 desk fps ≥58 with whole stack live (median of 3)", fpsMed >= 58, `median=${fpsMed} samples=${JSON.stringify(fpsSamples)} max=${fpsMax}`);
  await page.screenshot({ path: join(OUT, "live-fullstack-desk.png") });

  // ---------- MOBILE ----------
  const mp = await browser.newPage();
  await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const merrs = [], mnet = []; wireErrs(mp, merrs, mnet);
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);
  ok("M1 mobile boots to play on LIVE, 0 JS error", merrs.length === 0 && (await mp.evaluate(() => window.__dev.scene())) === "play", `errs=${merrs.length}`);

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
    const c = document.getElementById("c") || document.querySelector("canvas"); const s = window.__qaStick;
    c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0 + dx, clientY: s.y0, bubbles: true, cancelable: true }));
  }, type, dx);
  for (let i = 1; i <= 14; i++) { await mMove("pointermove", i * 6); await sleep(28); }
  await mMove("pointerup", 84); await sleep(200);
  const mAfter = await mp.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  report.mobile.moveDelta = +dist(mBefore, mAfter).toFixed(1);
  ok("M2 mobile touch stick MOVES the hero", dist(mBefore, mAfter) > 5, `delta=${report.mobile.moveDelta}`);

  const mAcc = await mp.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.rested({ setPool: 0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(160);
    const p0 = window.__dev.rested().pool; await s(1200);
    const r = window.__dev.rested(); return { p0, p1: r.pool, inZone: r.inZone, enabled: r.enabled }; });
  report.mobile.accrual = mAcc;
  ok("M3 mobile rested accrual grows inside the zone (LIVE ON)", mAcc.enabled === true && mAcc.inZone === true && mAcc.p1 > mAcc.p0 + 1, `pool ${mAcc.p0}→${mAcc.p1.toFixed(2)}`);

  const mFps = await measFps(mp, 2500);
  report.mobile.fps = mFps; report.mobile.errs = merrs; report.mobile.net404 = mnet;
  ok("M4 mobile fps ≥50 (DPR-capped)", mFps >= 50, `fps=${mFps}`);
  await mp.screenshot({ path: join(OUT, "live-fullstack-mobile.png") });

  writeFileSync(join(OUT, "live-fullstack-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${FAIL === 0 ? "ALL GREEN" : "HAS FAILURES"}  PASS=${PASS} FAIL=${FAIL}  build=${build}`);
  process.exitCode = FAIL === 0 ? 0 : 1;
} finally {
  await browser.close();
}
