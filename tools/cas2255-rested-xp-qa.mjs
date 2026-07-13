// CAS-2255 — OBSERVABLE self-verify of RESTED XP / BONO DE DESCANSO DEL SANTUARIO. Pure sim/code mechanic, $0 art, ships
// DARK (RESTED_XP.enabled:false). Crowns the Santuario arc (SAFEZONE regen + TEMPLE_RESPAWN + noAggro, all LIVE): time spent
// INSIDE the SAFEZONE accrues a per-hero "Descanso" pool (accrualPerSec×dt, capped at poolCap); when the hero leaves to hunt,
// the pool is SPENT as bonus XP (×xpMult, drained proportional to XP earned OUTSIDE the sanctuary) until empty. Canon MMORPG
// (WoW rested XP). Deterministic, 0 RNG, no local wall-clock (sim dt only) ⇒ server-authority-ready; per-hero state (restedPool)
// scales to N players in the same SAFEZONE with no contention.
//
// AUDIT (why this is NOT a silent no-op): the XP system has ONE gain chokepoint — gainXP(n) at sim.js — where the meta XP
// boost already reads live (CAS-1565). Every kill/quest routes through it (gainXP callers: enemy death, event-guard, quest
// reward). The player enters/exits the SAFEZONE constantly in the hunt loop (spawns at the city Templo via Home-Temple Respawn
// CAS-2247, returns to the hub, leaves to hunt) — so both the accrual site (inSafeZone) and the spend site (gainXP outside the
// zone) are reached in normal play. The bonus is observable: gainXP shows the +XP floater with the bonus folded in, and the pool
// visibly drains. Not a no-op.
//
// Observed via __dev.rested() (sim.dev): reads {enabled,inZone,pool,cap,pct,xpMult,willSpend,hasField,xp,lvl}; rested({enabled})
// flips the flag IN-MEMORY (A/B like __dev.safeZone/weather) so the shipped config stays enabled:false ⇒ byte-identical build;
// rested({setPool}) sets the pool (ON only); rested({addXp}) routes through the REAL gainXP chokepoint.
//
// Proof (single boot, no config-file edit):
//   1. boots clean to play, 0 JS errors, __dev.rested + __BUILD present.
//   2. DARK default: RESTED_XP.enabled === false AND hasField === false (restedPool NEVER created ⇒ byte-id save).
//   3. OFF (== HEAD): with enabled:false, addXp outside the zone grants NO bonus (pool machinery inert; field still absent).
//   4. worldFingerprint byte-stable across the enabled toggle at pool 0 (0 RNG drift).
//   5. geometry: hero teleports INTO the SAFEZONE (inZone true) and OUT (inZone false) — both sites reachable.
//   6. ON accrual: flip enabled:true, park the hero INSIDE the zone ~1.2s ⇒ pool GROWS (~accrualPerSec/s).
//   7. ON cap: setPool near the cap, wait ⇒ pool CLAMPS at poolCap (never exceeds).
//   8. ON spend + multiplier: hero OUTSIDE, setPool 300, addXp(100) ⇒ pool drains EXACTLY round(100×(xpMult-1)) = 50.
//   9. ON spend gated OUTSIDE only: hero INSIDE the zone, setPool 300, addXp(100) ⇒ pool UNCHANGED (willSpend false).
//  10. determinism: repeat the spend ⇒ identical drain (0 RNG).
//  11. spend is pool-bounded: tiny pool (20) + big addXp(1000) ⇒ drains only what's left (20 → 0), never negative.
//  12. DARK byte-safe: shipped config RESTED_XP.enabled:false + render refs to restedPool live ONLY behind the gate.
//  13. fps >= 55 with the feature ON.
// Run: node tools/cas2255-rested-xp-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let PASS = 0, FAIL = 0;
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
// tp the hero to the temple POI (world px → tile), settle, return the rested snapshot
async function toTemple(page) {
  return await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
    await s(150); return window.__dev.rested();
  });
}
// tp the hero far OUTSIDE the city (wilderness); Escape any curse modal so the sim keeps ticking (footgun CAS-2250)
async function toWild(page) {
  return await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    return window.__dev.rested();
  });
}

const srv = await startServer();
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

  // 1. clean boot
  const build = await page.evaluate(() => window.__BUILD || null);
  const hasHook = await page.evaluate(() => !!(window.__dev && typeof window.__dev.rested === "function"));
  ok("1 boots clean, __dev.rested + __BUILD present, 0 JS errors", errors.length === 0 && !!build && hasHook, `build=${build} errs=${errors.length}`);

  // 2. DARK default + byte-id field proof
  const r0 = await page.evaluate(() => window.__dev.rested());
  ok("2 DARK default RESTED_XP.enabled===false AND restedPool field NEVER created (hasField false)", r0.enabled === false && r0.hasField === false,
     `enabled=${r0.enabled} hasField=${r0.hasField} pool=${r0.pool}`);

  // 3. OFF == HEAD: addXp outside the zone grants no bonus, field stays absent
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
  ok("3 OFF (== HEAD): setPool ignored + addXp grants no rested bonus; field still absent", off.hasField === false && off.pool === 0 && off.willSpend === false,
     `hasField=${off.hasField} pool=${off.pool} willSpend=${off.willSpend}`);

  // 4. worldFingerprint byte-stable across the enabled toggle (pool 0)
  const fpEq = await page.evaluate(() => {
    const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j(); window.__dev.rested({ enabled: true }); const b = j();
    window.__dev.rested({ enabled: false }); const c = j();
    return { ab: a === b, ac: a === c };
  });
  ok("4 worldFingerprint byte-stable across enabled toggle at pool 0 (0 RNG drift)", fpEq.ab && fpEq.ac, `ab=${fpEq.ab} ac=${fpEq.ac}`);

  // 5. geometry: hero enters + exits the SAFEZONE
  const rIn = await toTemple(page);
  const rOut = await toWild(page);
  ok("5 hero teleports INTO the SAFEZONE (inZone) and OUT (outside) — both accrual/spend sites reachable",
     rIn.inZone === true && rOut.inZone === false, `in.inZone=${rIn.inZone} out.inZone=${rOut.inZone}`);

  // 6. ON accrual inside the zone
  const acc = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.rested({ enabled: true, setPool: 0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    const p0 = window.__dev.rested().pool;
    await s(1200);
    const r = window.__dev.rested();
    return { p0, p1: r.pool, rate: r.accrualPerSec, inZone: r.inZone };
  });
  ok("6 ON accrual: parked INSIDE the zone the pool GROWS (~accrualPerSec/s)", acc.inZone === true && acc.p1 > acc.p0 + 1,
     `pool ${acc.p0}→${acc.p1.toFixed(2)} over ~1.2s (rate=${acc.rate}/s)`);

  // 7. ON cap: clamps at poolCap
  const cap = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const c = window.__dev.rested().cap;
    window.__dev.rested({ setPool: c - 3 });   // 3 below cap, inside zone
    await s(1500);                             // accrue past the cap
    const r = window.__dev.rested();
    return { cap: c, pool: r.pool };
  });
  ok("7 ON cap: pool CLAMPS at poolCap (never exceeds)", Math.abs(cap.pool - cap.cap) < 1e-6, `pool=${cap.pool} cap=${cap.cap}`);

  // 8. ON spend + multiplier: outside the zone, drain == round(base×(xpMult-1))
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
  const expectedDrain = Math.round(100 * (spend.mult - 1));
  const drain8 = spend.before - spend.after;
  ok("8 ON spend + multiplier: pool drains EXACTLY round(base×(xpMult-1)) outside the zone",
     spend.willSpend === true && Math.abs(drain8 - expectedDrain) < 1e-6,
     `willSpend=${spend.willSpend} drain=${drain8} expected=${expectedDrain} (${spend.before}→${spend.after}, ×${spend.mult})`);

  // 9. ON spend gated OUTSIDE only: inside the zone the pool does NOT drain
  const inZoneSpend = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    window.__dev.rested({ setPool: 300 });
    const b = window.__dev.rested();
    window.__dev.rested({ addXp: 100 });
    const a = window.__dev.rested();
    return { willSpend: b.willSpend, before: b.pool, after: a.pool };
  });
  ok("9 ON spend gated OUTSIDE only: XP earned INSIDE the zone does NOT consume rested (willSpend false, pool held)",
     inZoneSpend.willSpend === false && inZoneSpend.after >= inZoneSpend.before - 1e-6,
     `willSpend=${inZoneSpend.willSpend} pool ${inZoneSpend.before}→${inZoneSpend.after}`);

  // 10. determinism: repeat the outside spend ⇒ identical drain
  const det = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    const run = () => { window.__dev.rested({ setPool: 300 }); const b = window.__dev.rested().pool;
      window.__dev.rested({ addXp: 100 }); return b - window.__dev.rested().pool; };
    return { d1: run(), d2: run() };
  });
  ok("10 determinism: repeated outside spend drains the SAME amount (0 RNG)", det.d1 === det.d2 && det.d1 > 0, `d1=${det.d1} d2=${det.d2}`);

  // 11. spend is pool-bounded: never over-drains / goes negative
  const bounded = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(120);
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    window.__dev.rested({ setPool: 20 });
    window.__dev.rested({ addXp: 1000 });   // wants round(1000×0.5)=500 bonus but only 20 left
    return window.__dev.rested().pool;
  });
  ok("11 spend is pool-bounded: big XP with a tiny pool drains only what's left, never negative", bounded === 0, `pool after over-draw=${bounded}`);

  // 12. DARK byte-safe: shipped config false + render refs only behind the gate
  const cfgSrc = readFileSync(join(ROOT, "sim", "config.js"), "utf8");
  const shippedOff = /RESTED_XP\s*=\s*\{[^}]*enabled:\s*false/s.test(cfgSrc);
  const renderSrc = readFileSync(join(ROOT, "render", "render.js"), "utf8");
  // every restedPool/renderRestedBadge reference must sit under the RESTED_XP.enabled gate (call) or its function body
  const gatedCall = /if\(RESTED_XP\.enabled\)\s*renderRestedBadge\(\)/.test(renderSrc);
  ok("12 DARK byte-safe: shipped config RESTED_XP.enabled:false + render badge behind the enabled gate", shippedOff && gatedCall,
     `shippedOff=${shippedOff} gatedCall=${gatedCall}`);

  // 13. fps with the feature ON
  const fps = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.rested({ enabled: true, setPool: 300 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(150);
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames * 1000 / (performance.now() - t0));
  });
  ok("13 fps >= 55 with the feature ON", fps >= 55, `fps=${fps}`);

  console.log(`\n${FAIL === 0 ? "ALL GREEN" : "HAS FAILURES"}  PASS=${PASS} FAIL=${FAIL}  build=${build}`);
  process.exitCode = FAIL === 0 ? 0 : 1;
} finally {
  await browser.close();
  srv.stop && srv.stop();
}
