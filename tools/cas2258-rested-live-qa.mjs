// CAS-2258 QA — LIVE POST-FLIP OBSERVABLE of RESTED XP / BONO DE DESCANSO DEL SANTUARIO, against the LIVE gh-pages URL
// (the ONLY URL players use, board directive CAS-412). Closes the loop for CAS-2255: CAS-2256 flipped RESTED_XP.enabled
// false→true LIVE (build 5f266f2801ed). Unlike the DARK observable harness (cas2255-rested-xp-observable-qa.mjs, which
// A/B flipped the flag IN-MEMORY over a byte-id-OFF disk), this proves the pool accrues/spends ON *by default* from the
// SERVED config — no __dev override needed to make the mechanic live.
//
// The mechanic: time spent INSIDE the SAFEZONE accrues a per-hero "Descanso" pool (accrualPerSec×dt, capped at poolCap).
// Leaving to hunt, the pool is SPENT as bonus XP = round(base×(xpMult-1)), drained ONLY outside the zone, bounded by the
// pool. Deterministic, 0 RNG, sim dt only ⇒ server-authority-ready; per-hero state ⇒ scales to N shard players.
//
// Phases:
//   0. served byte-verify: build == 5f266f2801ed, config/render/game byte-id to HEAD, RESTED_XP.enabled:true +
//      accrual6/cap600/mult1.5, full ambient/santuario stack ON, 0 non-benign 404.
//   1. boot clean to play, __BUILD match, __dev.rested hook present, 0 pageerror.
//   2. LIVE DEFAULT-ON accrual (on-disk, NOT in-memory): rested().enabled===true; parked in-zone the pool GROWS ~6/s.
//   3. LIVE cap: pool CLAMPS at poolCap 600, never exceeds.
//   4. LIVE spend + multiplier: OUTSIDE, setPool 300 + addXp(100) drains EXACTLY round(100×0.5)=50; gated inside (held).
//   5. spend pool-bounded: tiny pool + big addXp drains only what's left (→0), never negative.
//   6. OFF == HEAD reversibility: flip enabled:false in-memory ⇒ addXp grants no bonus (the gate is real + reversible).
//   7. determinism: worldFingerprint byte-stable across the enabled toggle (0 RNG drift).
//   8. FULL-STACK Santuario regression, all with rested ON (served): SAFEZONE regen ×2.5 at Templo + TEMPLE_RESPAWN
//      death→home + noAggro acquire-gate, coexisting with the whole live stack.
//   9. perf: desktop 60fps sustained with feature ON; 0 pageerror; 0 non-benign 404.
//  10. mobile/touch: boots, touch-stick moves, DEFAULT-ON accrual + santuario regen, fps stable, 0 err.
// Usage: node tools/cas2258-rested-live-qa.mjs [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "5f266f2801ed";
const OUT = join(ROOT, "shots", "cas2258");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const A = []; // [label, pass, detail?]
const check = (label, pass, detail) => { A.push([label, !!pass, detail]); };
const IDLE = (s) => s === "idle" || s === "wander";

async function fetchServed(path) {
  const bust = `?cb=${path.replace(/\W/g, "")}${Date.now()}`;
  const r = await fetch(`${LIVE}/${path}${bust}`);
  const txt = await r.text();
  const md5 = execSync(`md5sum`, { input: txt }).toString().split(" ")[0];
  return { status: r.status, txt, md5 };
}
const HEAD_CONFIG_MD5 = execSync(`git show HEAD:sim/config.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];
const HEAD_RENDER_MD5 = execSync(`git show HEAD:render/render.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];
const HEAD_GAME_MD5 = execSync(`git show HEAD:game.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];

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
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const keyUp = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);
// tp to Templo POI (world px → tile), settle
const toTemple = (page) => page.evaluate(async () => {
  const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
  await new Promise((r) => setTimeout(r, 150)); return window.__dev.rested();
});
// tp to open wilderness (2,2), dismiss any curse modal so the sim keeps ticking (footgun CAS-2250)
const toWild = (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__dev.tp(2, 2); await s(120);
  for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(110); }
  return window.__dev.rested();
});

(async () => {
  const report = { build: null, served: {}, desk: {}, mobile: {} };
  // ---------- Phase 0: served byte-verify (no browser) ----------
  const vjson = await (await fetch(`${LIVE}/version.json?cb=${Date.now()}`)).json().catch(() => ({}));
  report.build = vjson.build;
  check(`0.1 LIVE build == ${EXPECT_BUILD} (CAS-2256 flip deployed)`, vjson.build === EXPECT_BUILD, { got: vjson.build });
  const cfg = await fetchServed("sim/config.js");
  const rnd = await fetchServed("render/render.js");
  const gme = await fetchServed("game.js");
  report.served = { config: cfg.md5, render: rnd.md5, game: gme.md5, headConfig: HEAD_CONFIG_MD5, headRender: HEAD_RENDER_MD5, headGame: HEAD_GAME_MD5 };
  check("0.2 served config.js byte-id to HEAD", cfg.md5 === HEAD_CONFIG_MD5, report.served);
  check("0.3 served render.js byte-id to HEAD (rested badge ships, anti CAS-2220 drift)", rnd.md5 === HEAD_RENDER_MD5, { served: rnd.md5, head: HEAD_RENDER_MD5 });
  check("0.4 served game.js byte-id to HEAD (rested __dev whitelist ships)", gme.md5 === HEAD_GAME_MD5, { served: gme.md5, head: HEAD_GAME_MD5 });
  const mEn = cfg.txt.match(/RESTED_XP\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
  const mAcc = cfg.txt.match(/RESTED_XP\s*=\s*\{[\s\S]*?accrualPerSec:\s*(\d+)/);
  const mCap = cfg.txt.match(/RESTED_XP\s*=\s*\{[\s\S]*?poolCap:\s*(\d+)/);
  const mMul = cfg.txt.match(/RESTED_XP\s*=\s*\{[\s\S]*?xpMult:\s*([\d.]+)/);
  check("0.5 served RESTED_XP.enabled:true (mechanic LIVE — the flip under test)", mEn && mEn[1] === "true", { got: mEn && mEn[1] });
  check("0.6 served RESTED_XP params accrual6/cap600/mult1.5", mAcc && mAcc[1] === "6" && mCap && mCap[1] === "600" && mMul && mMul[1] === "1.5",
    { accrual: mAcc && mAcc[1], cap: mCap && mCap[1], mult: mMul && mMul[1] });

  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    const errs = []; const req404 = [];
    const isNoise = (t) => /Failed to load resource|net::ERR_/i.test(t);
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) errs.push(m.text()); });
    page.on("response", (r) => { if (r.status() === 404) req404.push(r.url().split("/").pop()); });
    await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(page);

    // ---------- Phase 1: clean boot ----------
    const build = await page.evaluate(() => window.__BUILD || null);
    const hasHook = await page.evaluate(() => !!(window.__dev && typeof window.__dev.rested === "function"));
    check("1.1 boot → play, __BUILD match, __dev.rested present, 0 pageerror",
      (await page.evaluate(() => __dev.scene())) === "play" && build === EXPECT_BUILD && hasHook && errs.length === 0,
      { build, hasHook, errs: errs.slice(0, 3) });

    // ---------- Phase 2: LIVE DEFAULT-ON accrual (on-disk, no in-memory flip) ----------
    const r0 = await page.evaluate(() => window.__dev.rested());
    check("2.1 LIVE default RESTED_XP.enabled === true (on-disk flip, NOT in-memory)", r0.enabled === true, { enabled: r0.enabled, cap: r0.cap, mult: r0.xpMult });
    const acc = await page.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
      window.__dev.rested({ setPool: 0 });          // reset only (feature stays served-ON), then park & let it accrue
      const p0 = window.__dev.rested().pool; await s(1500);
      const r = window.__dev.rested();
      return { p0, p1: r.pool, rate: r.accrualPerSec, inZone: r.inZone, dt: 1.5 };
    });
    report.desk.accrual = acc;
    const obsRate = (acc.p1 - acc.p0) / acc.dt;
    check("2.2 DEFAULT-ON accrual: parked INSIDE the SAFEZONE the pool GROWS ~accrualPerSec/s (served-ON, sin __dev flip)",
      acc.inZone === true && acc.p1 > acc.p0 + 3 && obsRate > 3.5 && obsRate < 8,
      { pool: `${acc.p0}→${acc.p1.toFixed(2)}`, obsRate: obsRate.toFixed(2), cfgRate: acc.rate });

    // ---------- Phase 3: cap ----------
    const cap = await page.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const c = window.__dev.rested().cap;
      window.__dev.rested({ setPool: c - 3 }); await s(1500);
      return { cap: c, pool: window.__dev.rested().pool };
    });
    report.desk.cap = cap;
    check("3.1 LIVE cap: pool CLAMPS at poolCap 600 (never exceeds)", cap.cap === 600 && Math.abs(cap.pool - cap.cap) < 1e-6, cap);

    // ---------- Phase 4: spend + multiplier (outside only) ----------
    const spend = await page.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__dev.tp(2, 2); await s(120);
      for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(110); }
      window.__dev.rested({ setPool: 300 });
      const b = window.__dev.rested();
      window.__dev.rested({ addXp: 100 });
      const a = window.__dev.rested();
      return { mult: b.xpMult, willSpend: b.willSpend, before: b.pool, after: a.pool, inZone: b.inZone };
    });
    const expDrain = Math.round(100 * (spend.mult - 1)), drain = +(spend.before - spend.after).toFixed(3);
    report.desk.spend = { ...spend, expDrain, drain };
    check("4.1 LIVE spend + multiplier: OUTSIDE, addXp(100) drains EXACTLY round(100×0.5)=50",
      spend.inZone === false && spend.willSpend === true && Math.abs(drain - expDrain) < 1e-6 && expDrain === 50,
      { drain, expected: expDrain, pool: `${spend.before}→${spend.after}`, mult: spend.mult });
    const inSpend = await page.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
      window.__dev.rested({ setPool: 300 });
      const b = window.__dev.rested(); window.__dev.rested({ addXp: 100 }); const a = window.__dev.rested();
      return { willSpend: b.willSpend, before: b.pool, after: a.pool, inZone: b.inZone };
    });
    report.desk.inSpend = inSpend;
    check("4.2 spend gated OUTSIDE only: XP earned INSIDE the zone does NOT drain rested (pool held)",
      inSpend.inZone === true && inSpend.willSpend === false && inSpend.after >= inSpend.before - 1e-6,
      { willSpend: inSpend.willSpend, pool: `${inSpend.before}→${inSpend.after}` });

    // ---------- Phase 5: pool-bounded ----------
    const bounded = await page.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__dev.tp(2, 2); await s(120);
      for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(110); }
      window.__dev.rested({ setPool: 20 }); window.__dev.rested({ addXp: 1000 });
      return window.__dev.rested().pool;
    });
    check("5.1 spend pool-bounded: big XP with tiny pool (20) drains only what's left (→0), never negative", bounded === 0, { poolAfterOverdraw: bounded });

    // ---------- Phase 6: OFF == HEAD reversibility (in-memory flip false) ----------
    const off = await page.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__dev.rested({ enabled: false });      // in-memory A/B: reproduce HEAD/pre-flip behavior
      window.__dev.tp(2, 2); await s(120);
      for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(110); }
      const before = window.__dev.rested();
      window.__dev.rested({ setPool: 300 });        // ignored while OFF (gated — field not created)
      window.__dev.rested({ addXp: 100 });          // routes through gainXP; no bonus branch
      const after = window.__dev.rested();
      window.__dev.rested({ enabled: true });        // restore default-ON
      return { enabled: before.enabled, willSpend: before.willSpend, pool: after.pool };
    });
    report.desk.offHead = off;
    check("6.1 OFF == HEAD reversibility: enabled:false ⇒ addXp grants NO rested bonus (gate real + reversible)",
      off.enabled === false && off.willSpend === false && off.pool === 0, off);

    // ---------- Phase 7: determinism ----------
    const fpEq = await page.evaluate(() => {
      const j = () => JSON.stringify(window.__dev.worldFingerprint());
      window.__dev.rested({ setPool: 0 });
      const a = j(); window.__dev.rested({ enabled: false }); const b = j();
      window.__dev.rested({ enabled: true }); const c = j();
      return { ab: a === b, ac: a === c };
    });
    check("7.1 worldFingerprint byte-estable ante toggle enabled a pool 0 (0 RNG drift)", fpEq.ab && fpEq.ac, fpEq);

    // ---------- Phase 8: FULL-STACK Santuario regression (all with rested ON) ----------
    const flags = await page.evaluate(async (base) => {
      const c = await import(base + "/sim/config.js?cb=flags" + Date.now());
      return { RESTED_XP: c.RESTED_XP?.enabled, SAFEZONE: c.SAFEZONE?.enabled, noAggro: c.SAFEZONE?.noAggro,
        TEMPLE_RESPAWN: c.TEMPLE_RESPAWN?.enabled, ZONE_BANNER: c.ZONE_BANNER?.enabled,
        WEATHER: c.WEATHER?.enabled, DAYNIGHT: c.DAYNIGHT?.enabled, MINIMAP: c.MINIMAP?.enabled };
    }, LIVE);
    report.desk.flags = flags;
    check("8.1 stack LIVE completo servido ON (RESTED_XP+SAFEZONE+noAggro+TEMPLE_RESPAWN+ZONE_BANNER+WEATHER+DAYNIGHT+MINIMAP)",
      Object.values(flags).every(Boolean), flags);
    // 8.2 SAFEZONE regen ×2.5 at Templo, with rested ON
    const regen = await page.evaluate(async () => {
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
      await new Promise((r) => setTimeout(r, 150));
      window.__dev.rested({ enabled: true, setPool: 300 });
      const s0 = window.__dev.safeZone({ setHp: 60, pause: 0 }); const hp0 = s0.hp;
      await new Promise((r) => setTimeout(r, 1500));
      const s1 = window.__dev.safeZone();
      return { hp0, hp1: s1.hp, near: s1.nearTemple, mul: s1.templeMul };
    });
    report.desk.regen = regen;
    check("8.2 REGRESIÓN SAFEZONE regen ×2.5 en el Templo cura con rested ON",
      (regen.hp1 - regen.hp0) > 1 && regen.near === true && Math.abs((regen.mul || 0) - 2.5) < 1e-6,
      { hp: `${regen.hp0}→${(regen.hp1 || 0).toFixed(1)}`, near: regen.near, mul: regen.mul });
    // 8.3 TEMPLE_RESPAWN death→home lands at Templo in safezone, with rested ON
    const tr = await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    report.desk.respawn = { hero: tr.hero, point: tr.point, near: tr.nearTemple, inZone: tr.inSafeZone, dist: tr.distToTemple };
    check("8.3 REGRESIÓN TEMPLE_RESPAWN: die → respawn aterriza EXACTO en el Templo (inSafeZone+nearTemple) con rested ON",
      tr.hero && tr.point && dist(tr.hero, tr.point) < 1 && tr.nearTemple && tr.inSafeZone, report.desk.respawn);
    // 8.4 noAggro acquire-gate holds, with rested ON
    const na = await page.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
      window.__dev.rested({ enabled: true });
      window.__dev.noAggro({ clear: true }); window.__dev.spawn("skeleton", 50, 0); await s(850);
      const st = window.__dev.noAggro();
      return { noAggro: st.noAggro, heroInZone: st.heroInZone, states: st.enemies.map((e) => e.state) };
    });
    report.desk.noAggro = na;
    check("8.4 REGRESIÓN noAggro default-ON: mob en-zona nunca agrede con rested ON (queda idle/wander)",
      na.noAggro === true && na.heroInZone === true && na.states.length >= 1 && na.states.every(IDLE), { states: na.states });
    await page.screenshot({ path: join(OUT, "01-desktop-rested-templo.png") });

    // ---------- Phase 9: perf / errors / 404 ----------
    await page.evaluate(async () => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); window.__dev.rested({ enabled: true, setPool: 300 }); window.__dev.noAggro({ clear: true }); window.__dev.spawn("skeleton", 60, 0); });
    const fpsSustain = [];
    for (let i = 0; i < 4; i++) { fpsSustain.push(await measFps(page, 2500)); await sleep(150); }
    const sorted = [...fpsSustain].sort((a, b) => a - b);
    const fpsMed = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : +((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1);
    report.desk.fps = { samples: fpsSustain, median: fpsMed, min: Math.min(...fpsSustain), max: Math.max(...fpsSustain) };
    check("9.1 desktop 60fps sostenido con feature ON (mediana ≥58, max ≥59, piso ≥45)",
      fpsMed >= 58 && Math.max(...fpsSustain) >= 59 && Math.min(...fpsSustain) >= 45, report.desk.fps);
    check("9.2 0 JS pageerror en run desktop completo", errs.length === 0, { errs });
    const benign404 = req404.filter((u) => !/favicon/i.test(u));
    check("9.3 sin 404 no-benigno (favicon excluido)", benign404.length === 0, { req404 });
    report.desk.errors = errs; report.desk.req404 = req404;
    await page.screenshot({ path: join(OUT, "02-desktop-final.png") });

    // ---------- Phase 10: MOBILE / TOUCH ----------
    const mp = await browser.newPage();
    await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    const merrs = []; mp.on("pageerror", (e) => merrs.push(String(e))); mp.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) merrs.push(m.text()); });
    // mobile page shares localStorage-origin with the desktop run → clear the save or it resumes instead of showing menu
    // (toPlay would time out; test-sequence artifact, not a product bug — footgun CAS-2255).
    await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(mp);
    check("M1 mobile boota a play, 0 JS error", merrs.length === 0 && (await mp.evaluate(() => window.__dev.scene())) === "play", { merrs });
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
    check("M2 mobile touch stick MUEVE al héroe", dist(mBefore, mAfter) > 5, { delta: report.mobile.moveDelta });
    // DEFAULT-ON accrual on mobile (served config, no flip)
    const mAcc = await mp.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
      window.__dev.rested({ setPool: 0 });
      const p0 = window.__dev.rested().pool; await s(1500);
      const r = window.__dev.rested();
      return { p0, p1: r.pool, inZone: r.inZone, enabled: r.enabled };
    });
    report.mobile.accrual = mAcc;
    check("M3 mobile DEFAULT-ON accrual crece dentro de la zona (served-ON, sin flip)",
      mAcc.enabled === true && mAcc.inZone === true && mAcc.p1 > mAcc.p0 + 3, { pool: `${mAcc.p0}→${mAcc.p1.toFixed(2)}` });
    // santuario regen on mobile with rested ON
    const mReg = await mp.evaluate(async () => {
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
      window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp;
      await new Promise((r) => setTimeout(r, 1500)); const hp1 = window.__dev.safeZone().hp;
      return { hp0, hp1 };
    });
    check("M4 mobile santuario regenera HP en el Templo con rested ON", (mReg.hp1 - mReg.hp0) > 1, { hp: `${mReg.hp0}→${(mReg.hp1 || 0).toFixed(1)}` });
    const mFps = await measFps(mp, 2500);
    report.mobile.fps = mFps; report.mobile.errs = merrs; report.mobile.scene = await mp.evaluate(() => window.__dev.scene());
    check("M5 mobile fps estable (≥50 — DPR-capped)", mFps >= 50, { mFps });
    check("M6 mobile run sin error", merrs.length === 0, { merrs });
    await mp.screenshot({ path: join(OUT, "03-mobile-rested.png") });

    writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }

  // ---------- summary ----------
  let pass = 0;
  console.log("\n===== CAS-2258 RESTED XP LIVE POST-FLIP QA (full-stack Santuario regression) =====");
  for (const [label, okk, detail] of A) { console.log(`${okk ? "PASS" : "FAIL"}  ${label}${okk ? "" : "  " + JSON.stringify(detail)}`); if (okk) pass++; }
  console.log(`\n${pass}/${A.length} checks passed  (build ${report.build}, deskFps ${JSON.stringify(report.desk.fps?.samples)}, mobFps ${report.mobile.fps})`);
  process.exit(pass === A.length ? 0 : 1);
})();
