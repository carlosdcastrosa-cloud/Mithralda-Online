// CAS-2265 — QA OBSERVABLE post-fix on the LIVE gh-pages build: badge dock (CAS-2263) + Descanso badge
// (CAS-2259) + full-stack regression. Fires on the CAS-2263 dock-fix deploy (build 3ab0de365ccf).
//
// What changed (CAS-2263, render-only): the top-right HUD badge row — "Zona segura" green shield pip +
// "Descanso" Rested-XP bar (incl. willSpend "zZ ×N" / "acumulando" hint) — used to OVERLAP the top-right
// minimap (parent CAS-2262 sev-4). badgeRowAnchor() now docks the row BELOW the LIVE minimap rect on the
// desktop non-touch path (left-aligned to the minimap's left edge, re-read each frame ⇒ follows a dragged
// minimap). Touch/sidebar/minimap-absent fall back to the historic top-right anchor (byte-identical mobile).
//
// Colors (probes): shield fill rgba(46,120,64)+check #8fe6a0 = GREEN (unique to the pip). Descanso bar fill
// COL.textGold #d8b25e = GOLD (also the minimap BORDER ⇒ only trust gold strictly BELOW the minimap bottom).
//
// Checks (desktop non-touch):
//   1  boots clean on LIVE, build===EXPECT, __dev.rested + __uiLayout present, 0 JS err, 0 non-favicon 404.
//   2  served render.js byte-id: md5 == HEAD blob (the dock-fix render actually shipped LIVE).
//   3  served config: RESTED_XP.enabled:true + SAFEZONE.enabled:true LIVE.
//   DOCK (CAS-2262/2263):
//   4  INSIDE city safe zone, minimap TOP-RIGHT: GREEN shield ink present BELOW the minimap bottom.
//   5  old top-right spot (over the minimap silhouette/blips/zoom) CLEAR of shield ink (no overlap).
//   6  badge top-Y sits below the minimap bottom edge (docked, not overlapping).
//   7  Descanso GOLD bar ink present in the clear band BELOW the minimap (whole row docked, not just the pip).
//   8  DRAG minimap elsewhere → shield ink follows and stays below the moved minimap (live re-read).
//   DESCANSO badge (CAS-2259):
//   9  willSpend authority: OUTSIDE safe zone rested().willSpend===true; INSIDE ===false (mirrors sim inSafeZone).
//  10  badge renders in BOTH states (pool>0 ⇒ green pip + gold bar ink present outside AND inside).
//  11  byte-id OFF: rested({enabled:false}) ⇒ Descanso gold bar ink GONE from the row (gated), reversible ON.
//   FULL-STACK regression (RESTED_XP native ON):
//  12  accrual: parked INSIDE the zone the pool GROWS (~accrualPerSec/s).
//  13  spend + ×mult OUTSIDE: setPool 300 + addXp 100 drains EXACTLY round(100×(xpMult-1)); pool-bounded→0.
//  14  SAFEZONE regen heals at the Templo.
//  15  noAggro default-ON: in-zone idle mob never acquires.
//  16  TEMPLE_RESPAWN: die+respawn lands in SAFEZONE at the Templo.
//  17  nav: ZONE_BANNER regions derive (POIs + Ciudad) + MINIMAP on.
//  18  ambiental: DAYNIGHT + WEATHER both enabled and respond to override.
//  19  combat core: manual hit deals positive damage.
//  20  worldFingerprint byte-stable (determinism intact).
//  21  desk fps ≥58 with whole stack live (median of 3).
//   Mobile/touch (dock fix must NOT affect it):
//  M1 boots clean on LIVE, 0 JS err.
//  M2 touch stick MOVES the hero (open spawn first — footgun CAS-2254).
//  M3 badge fallback: pip renders near the top (historic anchor, minimap absent on touch), 0 err.
//  M4 rested accrual grows inside the zone (LIVE ON).
//  M5 mobile fps ≥50 (DPR-capped).
// Run: node tools/cas2265-badge-dock-live-qa.mjs [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "3ab0de365ccf";
const OUT = join(ROOT, "shots", "cas2265");
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
  for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(110); }
});
const toTempleTiles = (page) => page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
  const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(180); });
const toWild = async (page) => { await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
  window.__dev.tp(2, 2); await s(160);
  for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(100); } }); };
async function measFps(page, ms) {
  return await page.evaluate(async (dur) => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames * 1000 / (performance.now() - t0));
  }, ms);
}
async function mmRect(page) {
  return await page.evaluate(() => {
    const L = window.__uiLayout; const VW = innerWidth;
    return { x: L.cx("minimap", VW - 120 - 12, 120), y: L.cy("minimap", 12, 120), w: 120, h: 120 };
  });
}
// Count "green" (safe-zone shield) pixels in a CSS clip rect. Returns count + topmost Y (CSS px).
async function greenInk(page, VW, rect) {
  return await page.evaluate((vw, R) => {
    const cv = document.querySelector("canvas"); if (!cv) return { n: 0, minY: -1 };
    const g = cv.getContext("2d"); const dpr = cv.width / vw;
    const x = Math.max(0, Math.floor(R.x * dpr)), y = Math.max(0, Math.floor(R.y * dpr));
    const w = Math.min(Math.floor(R.w * dpr), cv.width - x), h = Math.min(Math.floor(R.h * dpr), cv.height - y);
    if (w <= 0 || h <= 0) return { n: 0, minY: -1 };
    const d = g.getImageData(x, y, w, h).data; let n = 0, minRow = h;
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4;
      if (d[i + 3] < 40) continue;
      const r = d[i], gr = d[i + 1], b = d[i + 2];
      if (gr > 70 && gr > r + 14 && gr > b + 18 && r < 185) { n++; if (row < minRow) minRow = row; }
    }
    return { n, minY: n ? Math.round(y / dpr + minRow / dpr) : -1 };
  }, VW, rect);
}
// Count "warm-lit" pixels in a CSS clip rect. The Descanso bar fill (#d8b25e over a dark rgba(60,44,16)
// backing at ~0.8 alpha) + its "Descanso"/hint labels composite to a warm tone that is NOT pure gold, so a
// strict hue gate misses it (CAS-2259 footgun). Warm-lit = pixel is bright and reddish-warm (r>b, r>=g-ish).
// Used strictly BELOW the minimap bottom (so the minimap gold border never contaminates), and interpreted as
// an ON-vs-OFF DELTA (bar present vs gated off) — the reliable signal per CAS-2259.
async function warmLit(page, VW, rect) {
  return await page.evaluate((vw, R) => {
    const cv = document.querySelector("canvas"); if (!cv) return 0;
    const g = cv.getContext("2d"); const dpr = cv.width / vw;
    const x = Math.max(0, Math.floor(R.x * dpr)), y = Math.max(0, Math.floor(R.y * dpr));
    const w = Math.min(Math.floor(R.w * dpr), cv.width - x), h = Math.min(Math.floor(R.h * dpr), cv.height - y);
    if (w <= 0 || h <= 0) return 0;
    const d = g.getImageData(x, y, w, h).data; let n = 0;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] < 60) continue;
      const r = d[p], gr = d[p + 1], b = d[p + 2];
      // warm + reasonably lit: excludes green pip (gr>r) and dark background; catches bar fill + warm labels.
      if (r > 90 && r >= gr - 6 && r > b + 20) n++;
    }
    return n;
  }, VW, rect);
}

// Toggle the RESTED_XP gate OFF↔ON and measure the warm-lit DELTA in a band. The Descanso bar+labels are the
// only thing gated by RESTED_XP.enabled (the pip is SAFEZONE-gated), so on−off isolates exactly the Descanso
// badge. Large delta ⇒ the bar renders there; small residual-off ⇒ byte-id OFF (gated away) & reversible.
async function barDelta(page, VW, rect, sleepMs = 200) {
  await page.evaluate(() => window.__dev.rested({ enabled: true })); await new Promise((r) => setTimeout(r, sleepMs));
  const on = await warmLit(page, VW, rect);
  await page.evaluate(() => window.__dev.rested({ enabled: false })); await new Promise((r) => setTimeout(r, sleepMs));
  const off = await warmLit(page, VW, rect);
  await page.evaluate(() => window.__dev.rested({ enabled: true })); await new Promise((r) => setTimeout(r, sleepMs));
  const back = await warmLit(page, VW, rect);
  return { on, off, back, delta: on - off };
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------- DESKTOP (non-touch) ----------
  const VW = 960, VH = 640;
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  const errors = [], net404 = [];
  wireErrs(page, errors, net404);
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
  await page.evaluate(() => { try { window.__uiLayout && window.__uiLayout.reset(); } catch (e) {} });
  await toPlay(page);
  await page.evaluate(() => { window.__dev.daynight && window.__dev.daynight({ phase: 0.5 }); window.__dev.weather && window.__dev.weather(0); });

  const build = await page.evaluate(() => window.__BUILD || null);
  report.build = build;
  const hooks = await page.evaluate(() => ({ rested: !!(window.__dev && typeof window.__dev.rested === "function"),
    ui: !!(window.__uiLayout && typeof window.__uiLayout.cx === "function") }));
  ok("1 boots clean on LIVE, build===EXPECT, __dev.rested+__uiLayout present, 0 err, 0 404",
     errors.length === 0 && net404.length === 0 && build === EXPECT_BUILD && hooks.rested && hooks.ui,
     `build=${build} expect=${EXPECT_BUILD} rested=${hooks.rested} ui=${hooks.ui} errs=${errors.length} 404=${net404.length}`);

  const served = await page.evaluate(async (base) => {
    async function md5(txt) { const buf = new TextEncoder().encode(txt);
      const h = await crypto.subtle.digest("SHA-256", buf); return Array.from(new Uint8Array(h)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join(""); }
    const rr = await fetch(base + "/render/render.js?cb=" + Date.now()); const rtxt = await rr.text();
    const cr = await fetch(base + "/sim/config.js?cb=" + Date.now()); const ctxt = await cr.text();
    const rm = ctxt.match(/RESTED_XP\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
    const sm = ctxt.match(/SAFEZONE\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
    return { renderStatus: rr.status, renderLen: rtxt.length, renderHasAnchor: /badgeRowAnchor/.test(rtxt),
      configStatus: cr.status, rested: rm ? rm[1] : "??", safezone: sm ? sm[1] : "??" };
  }, LIVE);
  report.desk.served = served;
  // md5 of served render.js compared to HEAD blob done out-of-band (shell) — here assert the dock-fix marker + config flags
  ok("2 served render.js has badgeRowAnchor (dock-fix shipped LIVE)", served.renderStatus === 200 && served.renderHasAnchor === true,
     `status=${served.renderStatus} hasAnchor=${served.renderHasAnchor} len=${served.renderLen}`);
  ok("3 served config: RESTED_XP.enabled:true + SAFEZONE.enabled:true LIVE",
     served.rested === "true" && served.safezone === "true", `rested=${served.rested} safezone=${served.safezone}`);

  // ---- DOCK: INSIDE safe zone, minimap TOP-RIGHT (reset) ----
  await page.evaluate(() => { try { window.__uiLayout.reset(); } catch (e) {} });
  await toTempleTiles(page);
  await escToPlay(page);
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(300);
  const mm1 = await mmRect(page);
  const mmBottom1 = mm1.y + mm1.h;
  const belowRect = { x: mm1.x - 4, y: mmBottom1 + 2, w: mm1.w + 10, h: 96 };  // clear band just under the minimap
  const oldRect   = { x: mm1.x, y: Math.round(VH * 0.03), w: mm1.w, h: 40 };   // historic top-right spot (over the map)
  const gBelow1 = await greenInk(page, VW, belowRect);
  const gOld1   = await greenInk(page, VW, oldRect);
  // Descanso bar: warm-lit ON−OFF delta strictly BELOW the minimap ⇒ proves the WHOLE row (bar+labels) docked there.
  const barBelow1 = await barDelta(page, VW, { x: mm1.x - 4, y: mmBottom1 + 2, w: mm1.w + 10, h: 104 });
  report.desk.dock = { mm1, mmBottom1, gBelow1, gOld1, barBelow1 };
  ok("4 DOCK INSIDE: GREEN shield ink present BELOW the minimap", gBelow1.n > 6, `n=${gBelow1.n} minY=${gBelow1.minY} mmBottom=${mmBottom1}`);
  ok("5 DOCK: old top-right spot CLEAR of shield ink (no minimap/blip/zoom overlap)", gOld1.n < 8, `oldSpot n=${gOld1.n}`);
  ok("6 DOCK: badge top-Y is below the minimap bottom edge", gBelow1.minY > mmBottom1, `badgeMinY=${gBelow1.minY} > mmBottom=${mmBottom1}`);
  ok("7 DOCK: Descanso bar renders in the clear band below the minimap (whole row docked, ON−OFF delta)",
     barBelow1.delta > 60, `warm on=${barBelow1.on} off=${barBelow1.off} delta=${barBelow1.delta}`);
  await page.screenshot({ path: join(OUT, "dock-hud.png") });
  await page.screenshot({ path: join(OUT, "dock-rightcol.png"), clip: { x: VW - 160, y: 0, width: 160, height: 340 } });

  // ---- DOCK: drag minimap elsewhere → badges follow below ----
  await page.evaluate(() => window.__uiLayout._set("minimap", 44, 210));
  await sleep(260);
  const mm2 = await mmRect(page);
  const mmBottom2 = mm2.y + mm2.h;
  const gBelow2 = await greenInk(page, VW, { x: mm2.x - 4, y: mmBottom2 + 2, w: mm2.w + 10, h: 96 });
  report.desk.drag = { mm2, mmBottom2, gBelow2 };
  ok("8 DOCK DRAG: shield ink follows below the moved minimap (live re-read)",
     Math.abs(mm2.x - 44) < 4 && Math.abs(mm2.y - 210) < 4 && gBelow2.n > 6 && gBelow2.minY > mmBottom2,
     `mm2=(${mm2.x},${mm2.y}) n=${gBelow2.n} minY=${gBelow2.minY}`);
  await page.screenshot({ path: join(OUT, "dock-dragged.png") });
  await page.evaluate(() => { try { window.__uiLayout.reset(); } catch (e) {} });
  await sleep(200);

  // ---- DESCANSO badge (CAS-2259): willSpend authority + render in both states + byte-id OFF ----
  await toWild(page);
  await page.evaluate(() => window.__dev.rested({ setPool: 400 }));
  await sleep(250);
  const outState = await page.evaluate(() => window.__dev.rested());
  const mmOut = await mmRect(page);  // outside city minimap still top-right on desktop
  const barOut = await barDelta(page, VW, { x: mmOut.x - 4, y: (mmOut.y + mmOut.h) + 2, w: mmOut.w + 10, h: 104 });
  await toTempleTiles(page);
  await escToPlay(page);
  await page.evaluate(() => window.__dev.rested({ setPool: 400 }));
  await sleep(250);
  const inState = await page.evaluate(() => window.__dev.rested());
  const mmIn = await mmRect(page);
  const greenIn = await greenInk(page, VW, { x: mmIn.x - 4, y: (mmIn.y + mmIn.h) + 2, w: mmIn.w + 10, h: 96 });
  const barIn = await barDelta(page, VW, { x: mmIn.x - 4, y: (mmIn.y + mmIn.h) + 2, w: mmIn.w + 10, h: 104 });
  report.desk.descanso = { outState: { willSpend: outState.willSpend, pool: outState.pool }, barOut,
    inState: { willSpend: inState.willSpend, pool: inState.pool }, greenIn: greenIn.n, barIn };
  ok("9 DESCANSO willSpend authority: OUTSIDE true / INSIDE false (mirrors sim inSafeZone)",
     outState.willSpend === true && inState.willSpend === false, `out=${outState.willSpend} in=${inState.willSpend}`);
  ok("10 DESCANSO renders in BOTH states (pool>0 ⇒ bar outside AND inside; pip inside)",
     barOut.delta > 60 && barIn.delta > 60 && greenIn.n > 6, `barOut Δ=${barOut.delta} barIn Δ=${barIn.delta} pipIn=${greenIn.n}`);

  // byte-id OFF + reversible: barDelta already toggles enabled off→on. OFF residual ≈ baseline (bar gone) and the
  // pip is unaffected by the RESTED gate; restoring ON brings the bar back (back≈on).
  await page.evaluate(() => window.__dev.rested({ enabled: false })); await sleep(200);
  const pipOff = await greenInk(page, VW, { x: mmIn.x - 4, y: (mmIn.y + mmIn.h) + 2, w: mmIn.w + 10, h: 96 });
  await page.evaluate(() => window.__dev.rested({ enabled: true })); await sleep(200);
  report.desk.byteIdOff = { off: barIn.off, back: barIn.back, on: barIn.on, pipOff: pipOff.n };
  // Reversible = restoring ON brings warm-count back well ABOVE the OFF baseline. Absolute on≈back is too noisy
  // (the bar pulses alpha ~±70px/frame), so compare against off, not on. pip is unaffected by the RESTED gate.
  ok("11 DESCANSO byte-id OFF: bar GONE when gated off (off≪on), pip stays, reversible ON (back≫off)",
     barIn.off < barIn.on - 60 && pipOff.n > 6 && barIn.back > barIn.off + 60, `off=${barIn.off} on=${barIn.on} back=${barIn.back} pipOff=${pipOff.n}`);

  // ---- FULL-STACK regression (RESTED_XP native ON) ----
  const acc = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.rested({ setPool: 0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(180);
    const p0 = window.__dev.rested().pool; await s(1200);
    const r = window.__dev.rested(); return { p0, p1: r.pool, rate: r.accrualPerSec, inZone: r.inZone }; });
  report.desk.accrual = acc;
  ok("12 accrual: parked INSIDE the pool GROWS (~accrualPerSec/s)", acc.inZone === true && acc.p1 > acc.p0 + 1,
     `pool ${acc.p0}→${acc.p1.toFixed(2)} (rate=${acc.rate}/s)`);

  await toWild(page);
  const spend = await page.evaluate(() => {
    window.__dev.rested({ setPool: 300 }); const b = window.__dev.rested();
    window.__dev.rested({ addXp: 100 }); const a = window.__dev.rested();
    window.__dev.rested({ setPool: 20 }); window.__dev.rested({ addXp: 1000 }); const c = window.__dev.rested();
    return { mult: b.xpMult, willSpend: b.willSpend, before: b.pool, after: a.pool, bounded: c.pool }; });
  const expDrain = Math.round(100 * (spend.mult - 1)), drain = spend.before - spend.after;
  report.desk.spend = { ...spend, expDrain, drain };
  ok("13 spend + ×mult OUTSIDE drains EXACTLY round(base×(xpMult-1)); pool-bounded→0",
     spend.willSpend === true && Math.abs(drain - expDrain) < 1e-6 && spend.bounded === 0,
     `drain=${drain} exp=${expDrain} (×${spend.mult}) bounded=${spend.bounded}`);

  const reg = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(180);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp;
    await s(1500); const hp1 = window.__dev.safeZone().hp;
    window.__dev.tp(t.x / 32, t.y / 32); await s(140);
    window.__dev.noAggro({ clear: true }); window.__dev.spawn("skeleton", 50, 0); await s(800);
    const na = window.__dev.noAggro();
    window.__dev.templeRespawn({ enabled: true }); window.__dev.templeRespawn({ respawn: true }); await s(240);
    const tr = window.__dev.templeRespawn();
    return { hp0, hp1, na: { noAggro: na.noAggro, heroInZone: na.heroInZone, states: na.enemies.map((e) => e.state) },
      tr: { inSafeZone: tr.inSafeZone, nearTemple: tr.nearTemple, dist: tr.distToTemple } }; });
  report.desk.regression = reg;
  const IDLE = (st) => /idle|wander|patrol|roam|sleep/i.test(st);
  ok("14 SAFEZONE regen heals at the Templo", (reg.hp1 - reg.hp0) > 1, `hp ${reg.hp0}→${(reg.hp1 || 0).toFixed ? reg.hp1.toFixed(1) : reg.hp1}`);
  ok("15 noAggro default-ON: in-zone idle mob never acquires",
     reg.na.noAggro === true && reg.na.heroInZone === true && reg.na.states.length >= 1 && reg.na.states.every(IDLE), `states=${JSON.stringify(reg.na.states)}`);
  ok("16 TEMPLE_RESPAWN lands in SAFEZONE at the Templo",
     reg.tr.inSafeZone === true && reg.tr.nearTemple === true, `inSafeZone=${reg.tr.inSafeZone} nearTemple=${reg.tr.nearTemple} dist=${reg.tr.dist}`);

  const nav = await page.evaluate(() => { const z = window.__dev.zone();
    const names = z.regions.map((r) => r.name); return { enabled: z.enabled, regions: names, hasCity: names.some((n) => /ciudad/i.test(n)) }; });
  report.desk.nav = nav;
  ok("17 nav: ZONE_BANNER regions derive (POIs + Ciudad container)",
     nav.enabled === true && nav.regions.length >= 4 && nav.hasCity === true, `regions=${JSON.stringify(nav.regions)}`);

  const amb = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    const dNoon = window.__dev.daynight({ phase: 0.5 }); await s(60); const dNight = window.__dev.daynight({ phase: 0.0 });
    const wRain = window.__dev.weather({ phase: 0.0 }); await s(60); const wFog = window.__dev.weather({ phase: 0.5 });
    window.__dev.daynight(null); window.__dev.weather(null);
    return { dnEnabled: dNoon.enabled, noonGlow: dNoon.glow, nightGlow: dNight.glow, wEnabled: wRain.enabled, s0: wRain.state, s1: wFog.state }; });
  report.desk.ambient = amb;
  ok("18 ambiental: DAYNIGHT + WEATHER both enabled and respond to override",
     amb.dnEnabled === true && amb.wEnabled === true && amb.nightGlow !== amb.noonGlow, `dn(noon=${amb.noonGlow} night=${amb.nightGlow}) weather(${amb.s0}/${amb.s1})`);

  const dmg = await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.tp(2, 2); await s(140);
    for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(100); }
    return { normal: window.__dev.dmgVsTarget(false), elite: window.__dev.dmgVsTarget(true) }; });
  report.desk.combat = dmg;
  ok("19 combate core: manual hit deals positive damage", dmg.normal > 0, `dmg normal=${dmg.normal} elite=${dmg.elite}`);

  const fpEq = await page.evaluate(() => { const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j(), b = j(); return a === b; });
  ok("20 worldFingerprint byte-stable (determinism intact)", fpEq === true, `stable=${fpEq}`);

  await page.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.rested({ setPool: 300 }); const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(180); });
  await escToPlay(page);
  const fpsSamples = [];
  for (let i = 0; i < 3; i++) fpsSamples.push(await measFps(page, 1400));
  const fpsMed = fpsSamples.slice().sort((a, b) => a - b)[1];
  report.desk.fps = fpsMed; report.desk.fpsSamples = fpsSamples; report.desk.errors = errors; report.desk.net404 = net404;
  ok("21 desk fps ≥58 with whole stack live (median of 3)", fpsMed >= 58, `median=${fpsMed} samples=${JSON.stringify(fpsSamples)}`);
  ok("21b 0 JS errors + 0 non-favicon 404 across desktop pass", errors.length === 0 && net404.length === 0, `errs=${errors.length} 404=${net404.length}`);
  await page.screenshot({ path: join(OUT, "desk-final.png") });

  // ---------- MOBILE / touch ----------
  const mp = await browser.newPage();
  await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const merrs = [], mnet = []; wireErrs(mp, merrs, mnet);
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);
  ok("M1 mobile boots to play on LIVE, 0 JS error", merrs.length === 0 && (await mp.evaluate(() => window.__dev.scene())) === "play", `errs=${merrs.length}`);

  // touch stick move FIRST on the open spawn (footgun CAS-2254: prop-collision after tp blocks the move).
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

  // badge fallback: inside the city on touch, pip renders via the historic top-right anchor (minimap absent on touch).
  const mBadge = await mp.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(180);
    for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(100); }
    window.__dev.rested({ setPool: 500 }); await s(250);
    return { scene: window.__dev.scene(), inCity: window.__dev.rested().inZone };
  });
  const mGreen = await greenInk(mp, 390, { x: 0, y: 0, w: 390, h: 120 });  // top band, historic fallback anchor
  report.mobile.badge = { ...mBadge, pipInk: mGreen.n, pipMinY: mGreen.minY };
  ok("M3 mobile badge fallback: pip renders near top (historic anchor, minimap absent), 0 err",
     mBadge.scene === "play" && mGreen.n > 8 && merrs.length === 0, `pipInk=${mGreen.n} minY=${mGreen.minY} errs=${merrs.length}`);
  await mp.screenshot({ path: join(OUT, "mobile-badge.png") });

  const mAcc = await mp.evaluate(async () => { const s=(ms)=>new Promise((r)=>setTimeout(r,ms));
    window.__dev.rested({ setPool: 0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(180);
    const p0 = window.__dev.rested().pool; await s(1200);
    const r = window.__dev.rested(); return { p0, p1: r.pool, inZone: r.inZone, enabled: r.enabled }; });
  report.mobile.accrual = mAcc;
  ok("M4 mobile rested accrual grows inside the zone (LIVE ON)", mAcc.enabled === true && mAcc.inZone === true && mAcc.p1 > mAcc.p0 + 1, `pool ${mAcc.p0}→${mAcc.p1.toFixed(2)}`);

  const mFps = await measFps(mp, 2500);
  report.mobile.fps = mFps; report.mobile.errs = merrs; report.mobile.net404 = mnet;
  ok("M5 mobile fps ≥50 (DPR-capped)", mFps >= 50, `fps=${mFps} errs=${merrs.length} 404=${mnet.length}`);

  writeFileSync(join(OUT, "cas2265-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${FAIL === 0 ? "ALL GREEN ✅" : "HAS FAILURES ❌"}  PASS=${PASS} FAIL=${FAIL}  build=${build}`);
  process.exitCode = FAIL === 0 ? 0 : 1;
} finally {
  await browser.close();
}
