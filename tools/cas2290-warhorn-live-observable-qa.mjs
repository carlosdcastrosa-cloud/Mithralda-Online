// CAS-2290 — QA POST-FLIP LIVE OBSERVABLE + FULL-STACK regression for TOQUE DE GUERRA DEL SANTUARIO / SANCTUARY WARHORN
// (WORLD_EVENT). Runs against the DEPLOYED gh-pages build (WORLD_EVENT.enabled:true LIVE via CAS-2289 flip, build 6d6e02ca3c50)
// — NOT the dark build, NOT a __dev flip for the enabled state. This is the LIVE safety-net over the CEO gate: real players
// now get the world event, so we re-prove the whole observable list against the SERVED bytes + a full-stack arc regression.
//
// Differentiator vs my DARK observable (CAS-2285 18/18): the event must be DEFAULT-ON from the SERVED config on a fresh boot
// with 0 __dev intervention, the REAL wall-clock must derive G.warhorn every frame WITHOUT injection (real players get it),
// and the whole 8-flag Santuario arc must be healthy on the real deployed bytes (anti-CAS-2220 drift).
//
//   0  no JS errors / non-favicon net-404 across the desktop pass.
//   1  boot LIVE, build self-consistent vs version.json (NOT hardcoded — CAS-2271 lesson), warhorn + arc + daynight hooks, 0 err.
//   2  served sim/config.js byte-verify: WORLD_EVENT.enabled:true (the flip shipped, not dark) + knobs (period900/window180/x1.25/1.5).
//   3  8-flag Santuario arc served config ALL enabled:true (WORLD_EVENT, SANCTUARY_REWARDS, SANCTUARY_REP, BOUNTY_BOARD, RECALL,
//      SAFEZONE, TEMPLE_RESPAWN, RESTED_XP) — 0 regression drift on the deployed bytes.
//   4  DEFAULT-ON (the LIVE proof): fresh boot ⇒ warhorn().enabled===true with ZERO __dev flip AND the REAL clock derives
//      G.warhorn (now!==null) WITHOUT any nowMs injection — real players get the scheduled event, not just __dev.
//   5  schedule = PURE FUNCTION of the shared wall-clock (same nowMs ⇒ identical; call/peak/idle + countdown coherent).
//   6  REAL window via the real clock: derived countdown ADVANCES with wall-time (no injection).
//   7  rally = DETERMINISTIC gathering point: !=null in window, same windowIdx ⇒ same point, different ⇒ different, OUTSIDE safezone.
//   8  passive reward (Llamada): xpΔ==round(killXp*(1.25-1))==10 exact + repΔ==8 (SANCTUARY_REP ON).
//   9  ESCALANTE (Fervor/peak): xpΔ==20 > Llamada, repΔ==14 > 8.
//  10  guards: kill INSIDE safezone ⇒ 0 (open-world only); kill in IDLE ⇒ 0.
//  11  decouple: SANCTUARY_REP OFF ⇒ repΔ==0 but xpΔ>0 (XP mult independent of the faction knob).
//  12  RENDER-OBSERVABLE badge (desktop): the "Toque de Guerra" badge DRAWS ON vs an in-mem OFF control (idle-frozen clock ⇒ non-pulsing).
//  13  RENDER-OBSERVABLE rally BLIP (desktop minimap): active window ⇒ the pulsing blip draws (union changed-px >> OFF control).
//  14  FULL-STACK arc regression 8 flags ON: WASD move + real kill (spawnKill bumps h.kills) + safezone regen + rested/recall/
//      bounty/sanctuary/quartermaster/warhorn all healthy on the live bytes — 0 regression across combat/movement/core loops.
//  15  desktop fps ≥58 (calm inZone, feature ON, shared-clock tick each frame, median-of-5), 0 err, 0 non-favicon 404.
//  16  MOBILE: schedule pure-fn (call/peak/idle) + reward parity (Llamada 10/8, Fervor 20/14) on touch.
//  17  RENDER badge (mobile): the badge draws on the touch viewport (clean signal >> OFF control).
//  18  mobile fps ≥58 with feature ON, 0 err, 0 non-favicon 404.
// Run: node tools/cas2290-warhorn-live-observable-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2290-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// deterministic schedule constants (periodSec=900, windowSec=180, epochMs=0): periodMs=900000, windowMs=180000
const P = 900000, W = 180000;
const NOW_CALL  = P * 1000 + 1000;      // into=1000    → ACTIVE, phase "call"  (remaining ~179s)
const NOW_PEAK  = P * 1000 + 120000;    // into=120000  → ACTIVE, phase "peak"  (remaining ~60s)
const NOW_IDLE  = P * 1000 + 300000;    // into=300000  → IDLE   (nextIn ~600s)
const NOW_CALL2 = P * 1001 + 1000;      // windowIdx 1001 → different rally point

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LIVE console/net filters: gh-pages favicon 404 has no url + a generic "Failed to load resource" console line — net404 is authoritative.
function wireErrs(page, errs, net404) {
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/i.test(u)) net404.push(u + " " + (r.failure()?.errorText || "")); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) net404.push(r.url() + " 404"); });
}
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
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
const escToPlay = async (page) => page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); } });
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); });
  await sleep(220); await escToPlay(page); return page.evaluate(() => window.__dev.safeZone().inZone); };
async function ensureZone(page) { for (let i = 0; i < 4; i++) { if (await toZone(page)) return true; await sleep(120); } return false; }

const fps1 = (page) => page.evaluate(() => new Promise((res) => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }
async function fpsMedian5(page) { const a = []; for (let i = 0; i < 5; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[2]; }

// The warhorn badge draws at CONSTANT alpha when IDLE (non-pulsing), so the clean isolation (CAS-2266/2272/2285 thresholded
// changed-px): freeze the shared clock to an IDLE nowMs so the badge is stable, freeze day+weather, then a pixel is a TRUE
// warhorn signal if it changed a lot OFF→ON (|Δ|>55) yet was STABLE across two OFF frames (|Δ|<=25) — cancels the pulsing
// sibling badges + world shimmer. NOTE (LIVE): default is enabled:true, so the OFF control is an IN-MEM warhorn({enabled:false});
// each proof restores enabled:true so the live default-on state is preserved.
async function freezeIdleClock(page) { await page.evaluate((NI) => { if (!window.__origNow) window.__origNow = Date.now; Date.now = () => NI; }, NOW_IDLE); }
async function restoreClock(page) { await page.evaluate(() => { if (window.__origNow) { Date.now = window.__origNow; window.__origNow = null; } }); }
async function stabilizeWorld(page) {
  await page.evaluate(() => { if (window.__dev.daynight) window.__dev.daynight({ enabled: true, phase: 0.30 });
    if (window.__dev.weather) { try { window.__dev.weather({ enabled: false }); } catch (e) {} } });
  await sleep(180);
}
async function snapBand(page, key) {
  return page.evaluate((key) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    const dpr = cv.width / (window.innerWidth || cv.width);
    const x0 = Math.round(cv.width * 0.60), bw = cv.width - x0;
    // band reaches to 0.92H: with all 8 arc badges stacked, the always-visible warhorn badge sits below the dense row.
    const y0 = Math.round(120 * dpr), bh = Math.round(cv.height * 0.92) - y0;
    window[key] = new Uint8ClampedArray(c.getImageData(x0, Math.max(0, y0), bw, Math.max(1, bh)).data);
    return window[key].length;
  }, key);
}
async function cleanSignal(page, baseKey, ctrlKey, probeKey) {
  return page.evaluate((baseKey, ctrlKey, probeKey) => {
    const a = window[baseKey], s = window[ctrlKey], p = window[probeKey];
    if (!a || !s || !p) return -1;
    let n = 0; for (let i = 0; i < a.length; i += 4) {
      const stable = Math.abs(a[i] - s[i]) <= 25 && Math.abs(a[i + 1] - s[i + 1]) <= 25 && Math.abs(a[i + 2] - s[i + 2]) <= 25;
      if (!stable) continue;
      // change-gate 40 (CAS-2277 lesson): frozen bg keeps the OFF/OFF control at 0, so the lower gate only recovers the
      // real thin-badge signal (anti-aliased text under-counts at DPR1) without admitting background noise.
      if (Math.abs(a[i] - p[i]) > 40 || Math.abs(a[i + 1] - p[i + 1]) > 40 || Math.abs(a[i + 2] - p[i + 2]) > 40) n++;
    }
    return n;
  }, baseKey, ctrlKey, probeKey);
}
async function badgeRenderProof(page) {
  await stabilizeWorld(page);
  await freezeIdleClock(page);
  await page.evaluate(() => window.__dev.warhorn({ enabled: false }));
  await sleep(120);
  await snapBand(page, "__wo1"); await sleep(90); await snapBand(page, "__wo2");
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  await sleep(140);
  await snapBand(page, "__won");
  const sigOn = await cleanSignal(page, "__wo1", "__wo2", "__won");
  const sigCtl = await cleanSignal(page, "__wo1", "__wo2", "__wo2");
  await restoreClock(page);
  await page.evaluate(() => window.__dev.warhorn({ enabled: true })); // keep LIVE default-on
  return { sigOn, sigCtl };
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
let mbrowser = null;
const errors = [], net404 = [];
try {
  const page = await browser.newPage();
  wireErrs(page, errors, net404);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await toPlay(page);
  // capture the OPEN hub boot spawn NOW (before any tp) — the WASD movement test must run here, not from an in-temple
  // prop-collision corner (CAS-2268 footgun: capturing hero() after ensureZone gives a blocked spot ⇒ Δ0 false-negative).
  const bootSpawn = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  const build = await page.evaluate(() => (window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || "")).catch(() => "");
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot clean + hooks + build self-consistent vs version.json (NOT hardcoded — a later flip advances LIVE build, CAS-2271 lesson)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.warhorn && window.__dev.sanctuary && window.__dev.bounty
    && window.__dev.safeZone && window.__dev.rested && window.__dev.recall && window.__dev.quartermaster
    && window.__dev.spawnKill && window.__dev.hero && window.__dev.daynight));
  ok("1 boots to play; build self-consistent vs version.json; warhorn+arc hooks; 0 err",
     hooks && build === verBuild && !!build && errors.length === 0, `build=${build} version.json=${verBuild} err=${errors.length}`);

  // 2 served config byte-verify: WORLD_EVENT.enabled:true (flip shipped) + knobs
  const cfg = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); const t = await r.text();
    const m = t.match(/export const WORLD_EVENT\s*=\s*\{[\s\S]*?\n\};/); const blk = m ? m[0] : "";
    const num = (k) => { const mm = blk.match(new RegExp(k + ":\\s*([0-9.]+)")); return mm ? +mm[1] : null; };
    return { enabled: /enabled:\s*true/.test(blk), periodSec: num("periodSec"), windowSec: num("windowSec"), xpMult: num("xpMult"), peakXpMult: num("peakXpMult") }; }, LIVE);
  ok("2 served config WORLD_EVENT.enabled:true (flip shipped) + knobs period900/window180/x1.25/peak1.5",
     cfg.enabled === true && cfg.periodSec === 900 && cfg.windowSec === 180 && cfg.xpMult === 1.25 && cfg.peakXpMult === 1.5,
     `enabled=${cfg.enabled} period=${cfg.periodSec} window=${cfg.windowSec} x=${cfg.xpMult}/${cfg.peakXpMult}`);

  // 3 8-flag Santuario arc served config ALL enabled:true (anti-CAS-2220 drift)
  const arcCfg = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); const t = await r.text();
    const flags = ["WORLD_EVENT", "SANCTUARY_REWARDS", "SANCTUARY_REP", "BOUNTY_BOARD", "RECALL", "SAFEZONE", "TEMPLE_RESPAWN", "RESTED_XP"];
    const out = {}; for (const f of flags) { const m = t.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?\\n\\};")); out[f] = m ? /enabled:\s*true/.test(m[0]) : null; }
    return out; }, LIVE);
  const allArcOn = Object.values(arcCfg).every((v) => v === true);
  ok("3 8-flag Santuario arc served config ALL enabled:true (0 regression drift on deployed bytes)",
     allArcOn, Object.entries(arcCfg).map(([k, v]) => `${k}:${v}`).join(" "));

  // 4 DEFAULT-ON (the LIVE proof): fresh boot ⇒ enabled===true, ZERO __dev flip, AND real clock derives G.warhorn (now!==null) w/o injection
  const w0 = await page.evaluate(() => { const w = window.__dev.warhorn(); return { enabled: w.enabled, nowNull: w.now === null }; });
  await sleep(140); // let ≥1 real-clock tick populate G.warhorn
  const wReal = await page.evaluate(() => { const n = window.__dev.warhorn().now; return n ? { active: n.active, widx: n.windowIdx, phase: n.phase } : null; });
  ok("4 DEFAULT-ON from served config: warhorn().enabled===true (0 __dev flip) + REAL clock derives G.warhorn (now!==null, no injection)",
     w0.enabled === true && wReal !== null, `enabled=${w0.enabled} bootNowNull=${w0.nowNull} realDerived=${JSON.stringify(wReal)}`);

  // 5 schedule = pure function of the shared clock (same nowMs ⇒ identical; idle/call/peak derived + countdown coherent)
  const sched = await page.evaluate((NC, NP, NI) => {
    const a1 = window.__dev.warhorn({ nowMs: NC }).now, a2 = window.__dev.warhorn({ nowMs: NC }).now;
    const pk = window.__dev.warhorn({ nowMs: NP }).now, id = window.__dev.warhorn({ nowMs: NI }).now;
    return { a1, a2, pk, id };
  }, NOW_CALL, NOW_PEAK, NOW_IDLE);
  ok("5 schedule = pure fn of shared clock: same nowMs ⇒ identical; call/peak/idle + countdown coherent",
     JSON.stringify(sched.a1) === JSON.stringify(sched.a2) &&
     sched.a1.active === true && sched.a1.phase === "call" && sched.a1.xpMult === 1.25 && sched.a1.repPerKill === 8 &&
     sched.pk.active === true && sched.pk.phase === "peak" && sched.pk.xpMult === 1.5 && sched.pk.repPerKill === 14 &&
     sched.id.active === false && sched.id.phase === "idle" &&
     Math.abs(sched.id.nextInSec - 600) < 1.5 && Math.abs(sched.a1.remainingSec - 179) < 1.5,
     `call{${sched.a1.phase},x${sched.a1.xpMult}/${sched.a1.repPerKill},rem${sched.a1.remainingSec}} peak{${sched.pk.phase},x${sched.pk.xpMult}/${sched.pk.repPerKill}} idle{next${sched.id.nextInSec}}`);

  // 6 REAL window via the real clock (NO injection): derived countdown advances with wall-time
  const rc1 = await page.evaluate(() => { const n = window.__dev.warhorn().now; return n ? { active: n.active, widx: n.windowIdx, clk: n.active ? n.remainingSec : n.nextInSec } : null; });
  await sleep(1600);
  const rc2 = await page.evaluate(() => { const n = window.__dev.warhorn().now; return n ? { active: n.active, widx: n.windowIdx, clk: n.active ? n.remainingSec : n.nextInSec } : null; });
  let realClockOk, realExtra;
  if (rc1 && rc2 && rc1.active === rc2.active && rc1.widx === rc2.widx) {
    const d = rc1.clk - rc2.clk; realClockOk = d > 0.8 && d < 3.0;
    realExtra = `derived(no inject) clk ${rc1.clk.toFixed(2)}→${rc2.clk.toFixed(2)} Δ=${d.toFixed(2)}s (exp ~1.6)`;
  } else { realClockOk = !!rc1 && !!rc2; realExtra = `both non-null across window boundary rc1=${JSON.stringify(rc1)} rc2=${JSON.stringify(rc2)}`; }
  ok("6 REAL window via real clock: derived countdown advances with wall-time (no injection)", realClockOk, realExtra);

  // 7 rally deterministic + outside safezone
  const rally = await page.evaluate((NC, NC2) => {
    const r1 = window.__dev.warhorn({ nowMs: NC }).now.rally;
    const r1b = window.__dev.warhorn({ nowMs: NC }).now.rally;
    const r2 = window.__dev.warhorn({ nowMs: NC2 }).now.rally;
    const sz = window.__dev.safeZone(); const b = sz.bbox;
    const inZone = (p) => p && p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];
    return { r1, r2, same: JSON.stringify(r1) === JSON.stringify(r1b), diff: JSON.stringify(r1) !== JSON.stringify(r2), r1InZone: inZone(r1) };
  }, NOW_CALL, NOW_CALL2);
  ok("7 rally deterministic: !=null, same windowIdx⇒same point, different⇒different, OUTSIDE the safezone",
     !!rally.r1 && rally.same && rally.diff && rally.r1InZone === false, `r1=${JSON.stringify(rally.r1)} r2=${JSON.stringify(rally.r2)} inZone=${rally.r1InZone}`);

  // 8 passive reward — Llamada phase (exact XP + rep). Isolate the warhorn mult from Rested spend + reset rep + fresh (measured EARLY, pre-combat).
  const call = await page.evaluate((NC) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 }); window.__dev.rested({ enabled: false });
    return window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 }).killObserved;   // Llamada: bonus=round(40*0.25)=10
  }, NOW_CALL);
  ok("8 passive reward (Llamada): xpΔ==round(killXp*(1.25-1))==10 exact + repΔ==8 (SANCTUARY_REP ON)",
     call.xpDelta === 10 && call.repDelta === 8, `xpΔ=${call.xpDelta} (exp 10) repΔ=${call.repDelta} (exp 8)`);

  // 9 ESCALANTE — Fervor/peak strictly greater
  const peak = await page.evaluate((NP) => { window.__dev.sanctuary({ setRep: 0 });
    return window.__dev.warhorn({ nowMs: NP, kill: true, killXp: 40 }).killObserved; }, NOW_PEAK);   // Fervor: bonus=round(40*0.5)=20
  ok("9 ESCALANTE (Fervor): xpΔ==20 > Llamada, repΔ==14 > 8",
     peak.xpDelta === 20 && peak.xpDelta > call.xpDelta && peak.repDelta === 14 && peak.repDelta > call.repDelta,
     `xpΔ=${peak.xpDelta} (exp 20) repΔ=${peak.repDelta} (exp 14)`);

  // 10 guards: kill INSIDE safezone ⇒ 0 AND kill in idle ⇒ 0
  const guards = await page.evaluate((NC, NI) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });
    const sz = window.__dev.safeZone(); const t = sz.temple;
    const inZone = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40, kx: t.x, ky: t.y }).killObserved;
    window.__dev.sanctuary({ setRep: 0 });
    const idle = window.__dev.warhorn({ nowMs: NI, kill: true, killXp: 40 }).killObserved;
    return { inZone, idle };
  }, NOW_CALL, NOW_IDLE);
  ok("10 guards: kill INSIDE safezone ⇒ 0 (open-world only), kill in IDLE ⇒ 0",
     guards.inZone.xpDelta === 0 && guards.inZone.repDelta === 0 && guards.idle.xpDelta === 0 && guards.idle.repDelta === 0,
     `inZone{xpΔ${guards.inZone.xpDelta},repΔ${guards.inZone.repDelta}} idle{xpΔ${guards.idle.xpDelta},repΔ${guards.idle.repDelta}}`);

  // 11 decouple RENOMBRE from the faction knob
  const decouple = await page.evaluate((NC) => {
    window.__dev.sanctuary({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 }).killObserved;
    window.__dev.sanctuary({ enabled: true }); return r;   // restore
  }, NOW_CALL);
  ok("11 decouple: SANCTUARY_REP OFF ⇒ repΔ==0 but xpΔ>0 (XP mult independent of faction knob)",
     decouple.repDelta === 0 && decouple.xpDelta > 0, `xpΔ=${decouple.xpDelta} repΔ=${decouple.repDelta}`);
  await page.evaluate(() => window.__dev.rested({ enabled: true })); // restore RESTED_XP default-on before render/arc

  // 12 RENDER OBSERVABLE badge (desktop): the "Toque de Guerra" badge draws (idle-frozen clock ⇒ non-pulsing) ON vs in-mem OFF
  const bd = await badgeRenderProof(page);
  await page.screenshot({ path: join(OUT, "desktop-badge-on.png") }).catch(() => {});
  ok("12 RENDER badge (desktop): ON draws the 'Toque de Guerra' badge — clean signal >> OFF control",
     bd.sigOn > 24 && bd.sigOn > bd.sigCtl * 4 && bd.sigCtl < 12, `cleanSignal ON=${bd.sigOn} vs OFF-control=${bd.sigCtl}`);

  // 13 RENDER OBSERVABLE rally BLIP (desktop minimap): force the REAL clock into an active window, union changed-px (OFF/OFF/ON).
  await ensureZone(page);
  await stabilizeWorld(page);
  await page.evaluate((NP) => { if (!window.__origNow) window.__origNow = Date.now; Date.now = () => NP; }, NOW_PEAK);
  const snapMm = (key) => page.evaluate((key) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    const dpr = cv.width / (window.innerWidth || cv.width);
    const bw = Math.round(150 * dpr), x0 = cv.width - bw, y0 = Math.round(6 * dpr), bh = Math.round(150 * dpr);
    window[key] = new Uint8ClampedArray(c.getImageData(x0, y0, bw, bh).data);
    return window[key].length;
  }, key);
  await page.evaluate(() => window.__dev.warhorn({ enabled: false })); await sleep(140);
  await snapMm("__mm1"); await sleep(90); await snapMm("__mm2");
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  for (let i = 0; i < 6; i++) { await snapMm("__mmOn" + i); await sleep(70); }
  const unionBlip = await page.evaluate(() => {
    const a = window.__mm1, s = window.__mm2; const stable = (i) => Math.abs(a[i] - s[i]) <= 25 && Math.abs(a[i + 1] - s[i + 1]) <= 25 && Math.abs(a[i + 2] - s[i + 2]) <= 25;
    const set = new Set();
    for (let f = 0; f < 6; f++) { const p = window["__mmOn" + f];
      for (let i = 0; i < a.length; i += 4) { if (!stable(i)) continue;
        if (Math.abs(a[i] - p[i]) > 40 || Math.abs(a[i + 1] - p[i + 1]) > 40 || Math.abs(a[i + 2] - p[i + 2]) > 40) set.add(i); } }
    return set.size;
  });
  const rallyCtl = await cleanSignal(page, "__mm1", "__mm2", "__mm2");
  await page.screenshot({ path: join(OUT, "desktop-rally-blip.png") }).catch(() => {});
  await restoreClock(page);
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  ok("13 RENDER rally blip (desktop minimap): active window ⇒ pulsing blip draws (union changed-px >> OFF control)",
     unionBlip >= 6 && unionBlip > rallyCtl, `unionChanged ON=${unionBlip} OFF-control=${rallyCtl}`);

  // 14 FULL-STACK arc regression 8 flags ON: WASD move + real kill + safezone regen + all arc hooks healthy
  // 14a WASD from the OPEN hub boot spawn (captured at boot, avoids prop-collision false-negative, CAS-2268 footgun)
  await page.evaluate((s) => window.__dev.tp(s.x / 32, s.y / 32), bootSpawn);
  await escToPlay(page);
  const moved = await page.evaluate(async () => {
    const h0 = window.__dev.hero(); const x0 = h0.x, y0 = h0.y; let md = 0;
    for (const code of ["KeyD", "KeyS", "KeyA", "KeyW"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(3), bubbles: true }));
      await new Promise(r => setTimeout(r, 260));
      window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code.slice(3), bubbles: true }));
      const h = window.__dev.hero(); md = Math.max(md, Math.hypot(h.x - x0, h.y - y0));
    }
    return md;
  });
  // 14b combat: real kill via spawnKill (REAL killEnemy path bumps h.kills)
  const killed = await page.evaluate(() => { const before = window.__dev.bounty().kills | 0;
    window.__dev.spawnKill("rat"); return (window.__dev.bounty().kills | 0) - before; });
  // 14c safezone regen + all 8 arc hooks healthy with WORLD_EVENT ON
  await ensureZone(page);
  const arc = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.safeZone({ setHp: 40, pause: 0 }); await s(500); const hp2 = window.__dev.safeZone().hp;
    const sz = window.__dev.safeZone();
    return { inZone: sz.inZone, safeEnabled: sz.enabled, hpAfter: hp2,
      restedEnabled: window.__dev.rested().enabled, recallEnabled: window.__dev.recall().enabled,
      bountyEnabled: window.__dev.bounty().enabled, sanctEnabled: window.__dev.sanctuary().enabled,
      qmEnabled: window.__dev.quartermaster().enabled, warhornEnabled: window.__dev.warhorn().enabled };
  });
  ok("14 full-stack arc 8 flags ON: WASD move + real kill (h.kills++) + safezone regen + rested/recall/bounty/sanctuary/quartermaster/warhorn healthy",
     moved > 4 && killed >= 1 && arc.inZone && arc.safeEnabled && arc.hpAfter > 40 && arc.restedEnabled && arc.recallEnabled
     && arc.bountyEnabled && arc.sanctEnabled && arc.qmEnabled && arc.warhornEnabled,
     `move=${moved.toFixed(1)} kill=${killed} hp=${arc.hpAfter} rested=${arc.restedEnabled} recall=${arc.recallEnabled} bounty=${arc.bountyEnabled} sanct=${arc.sanctEnabled} qm=${arc.qmEnabled} warhorn=${arc.warhornEnabled}`);

  // 15 desktop fps ≥58 with feature ON, measured CALM inZone (median-of-5)
  await ensureZone(page);
  await sleep(700);
  const fps = await fpsMedian5(page);
  await page.screenshot({ path: join(OUT, "desktop-final.png") }).catch(() => {});
  ok("15 desktop fps ≥58 with feature ON (calm inZone, shared-clock tick each frame, median-of-5); 0 err, 0 non-favicon 404",
     fps >= 58 && errors.length === 0 && net404.length === 0, `fps≈${fps} err=${errors.length} net404=${net404.length} ${net404.slice(0, 2).join(" | ")}`);

  // ---- MOBILE ----
  await page.close();
  mbrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  const mp = await mbrowser.newPage();
  const merr = [], mnet = [];
  wireErrs(mp, merr, mnet);
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mp.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(mp);

  // 16 mobile schedule pure-fn + reward parity (real route, sim authority)
  const mSched = await mp.evaluate((NC, NP, NI) => {
    const a = window.__dev.warhorn({ nowMs: NC }).now, p = window.__dev.warhorn({ nowMs: NP }).now, i = window.__dev.warhorn({ nowMs: NI }).now;
    return { aPhase: a.phase, pPhase: p.phase, iActive: i.active };
  }, NOW_CALL, NOW_PEAK, NOW_IDLE);
  const mReward = await mp.evaluate((NC, NP) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.rested({ enabled: false });
    window.__dev.sanctuary({ setRep: 0 }); const c = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 }).killObserved;
    window.__dev.sanctuary({ setRep: 0 }); const p = window.__dev.warhorn({ nowMs: NP, kill: true, killXp: 40 }).killObserved;
    window.__dev.rested({ enabled: true }); return { c, p };
  }, NOW_CALL, NOW_PEAK);
  ok("16 mobile: schedule pure-fn (call/peak/idle) + reward parity (Llamada 10/8, Fervor 20/14) on touch",
     mSched.aPhase === "call" && mSched.pPhase === "peak" && mSched.iActive === false &&
     mReward.c.xpDelta === 10 && mReward.c.repDelta === 8 && mReward.p.xpDelta === 20 && mReward.p.repDelta === 14,
     `sched ${mSched.aPhase}/${mSched.pPhase}/idle${mSched.iActive} reward c${mReward.c.xpDelta}/${mReward.c.repDelta} p${mReward.p.xpDelta}/${mReward.p.repDelta}`);

  // 17 RENDER badge (mobile)
  const mbd = await badgeRenderProof(mp);
  await mp.screenshot({ path: join(OUT, "mobile-badge-on.png") }).catch(() => {});
  ok("17 RENDER badge (mobile): ON draws the 'Toque de Guerra' badge on touch — clean signal >> OFF control",
     mbd.sigOn > 24 && mbd.sigOn > mbd.sigCtl * 4 && mbd.sigCtl < 12, `cleanSignal ON=${mbd.sigOn} vs OFF-control=${mbd.sigCtl}`);

  // 18 mobile fps + no errors/404
  await mp.evaluate(() => window.__dev.warhorn({ enabled: true }));
  await sleep(400);
  const mfps = await fpsMedian3(mp);
  ok("18 mobile fps ≥58 with feature ON, 0 err, 0 non-favicon net-404", mfps >= 58 && merr.length === 0 && mnet.length === 0,
     `fps≈${mfps} err=${merr.length} net404=${mnet.length}`);

  ok("0 no JS errors / non-favicon net-404 during desktop run", errors.length === 0 && net404.length === 0,
     (errors.slice(0, 3).join(" | ") + " | net404=" + net404.length));

  console.log(`\nbuild=${build}`);
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  try { await browser.close(); } catch (e) {}
  try { if (mbrowser) await mbrowser.close(); } catch (e) {}
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
