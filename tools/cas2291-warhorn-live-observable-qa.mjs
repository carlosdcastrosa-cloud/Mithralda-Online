// CAS-2291 — QA POST-FLIP LIVE OBSERVABLE regression for TOQUE DE GUERRA DEL SANTUARIO / SANCTUARY WARHORN.
// Runs against the LIVE gh-pages build (WORLD_EVENT.enabled:true LIVE via CAS-2289, build 6d6e02ca3c50) — the canonical
// public URL players use (CAS-412). This is the safety-net replacement for the orphaned CAS-2290. It is NOT the dark build,
// NOT a __dev flip to turn the feature on; the observables prove the feature is ON FROM THE SERVED CONFIG.
// Differentiator vs the DARK observable (CAS-2287): the LIVE proof = DEFAULT-ON served + build self-consistent vs version.json.
//   1  boot LIVE, build self-consistent vs version.json, warhorn+arc+daynight hooks, 0 err, 0 non-favicon 404.
//   2  served sim/config.js: WORLD_EVENT.enabled:true (the flip shipped) + 8-flag Sanctuary stack all true, 3 DARK flags false.
//   3  DEFAULT-ON (the LIVE proof): fresh boot ⇒ warhorn().enabled===true with ZERO __dev flip.
//   4  schedule = pure function of the shared wall clock (same nowMs ⇒ identical; call/peak/idle + countdown coherent).
//   5  REAL window via the REAL clock (NO injection): G.warhorn derived from Date.now every frame; countdown advances.
//   6  rally deterministic (same windowIdx⇒same, different⇒different) AND OUTSIDE the safezone.
//   7  passive reward Llamada: xpΔ==round(killXp*(1.25-1))==10 + repΔ==8 (SANCTUARY_REP ON, real kill route).
//   8  ESCALANTE Fervor: xpΔ==20 > Llamada, repΔ==14 > 8.
//   9  guards: kill INSIDE safezone ⇒ 0, kill in IDLE ⇒ 0 (accrual only during the active open-world window).
//  10  decouple: SANCTUARY_REP OFF ⇒ repΔ==0 but xpΔ>0 (xp mult independent of the faction knob).
//  11  RENDER badge (desktop): the "Toque de Guerra" badge draws ON — clean changed-px signal >> OFF control.
//  12  RENDER rally blip (desktop minimap): active window ⇒ pulsing blip draws (union changed-px >> OFF control).
//  13  arc regression: 8-flag Sanctuary stack (WORLD_EVENT+REWARDS+REP+BOUNTY+RECALL+SAFEZONE+RESTED+TEMPLE) healthy, canAccept.
//  14  desktop fps ≥58 with feature ON (calm inZone, shared-clock tick each frame, median-of-5).
//  15  mobile: schedule pure-fn + reward parity on touch.
//  16  RENDER badge (mobile): the badge draws on the touch viewport.
//  17  mobile fps ≥58, 0 err, 0 net-404.
// Run: node tools/cas2291-warhorn-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2291-live");
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

// LIVE console/net filters: gh-pages favicon 404 has no url + a generic "Failed to load resource" console line — net404 authoritative.
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
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); }); await sleep(240); await escToPlay(page); return page.evaluate(() => window.__dev.safeZone().inZone); };

const fps1 = (page) => page.evaluate(() => new Promise(res => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }
async function fpsMedian5(page) { const a = []; for (let i = 0; i < 5; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[2]; }

// Badge = horn glyph + "Toque de Guerra" + status, drawn at CONSTANT alpha when IDLE (non-pulsing). Clean isolation
// (CAS-2266/2272/2287): freeze the shared clock to IDLE so the badge is stable, freeze day+weather, then a pixel is a TRUE
// warhorn signal if it changed a lot OFF→ON (|Δ|>55) yet was STABLE across two OFF frames (|Δ|<=25). Cancels the pulsing
// sibling badges + world shimmer. Badge sits below the badge row (badgeRowAnchor().by+120) ⇒ probe a right-side band.
async function freezeIdleClock(page) {
  await page.evaluate((NI) => { if (!window.__origNow) window.__origNow = Date.now; Date.now = () => NI; }, NOW_IDLE);
}
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
    const y0 = Math.round(150 * dpr), bh = Math.round(cv.height * 0.6) - y0;
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
      if (Math.abs(a[i] - p[i]) > 55 || Math.abs(a[i + 1] - p[i + 1]) > 55 || Math.abs(a[i + 2] - p[i + 2]) > 55) n++;
    }
    return n;
  }, baseKey, ctrlKey, probeKey);
}
// desktop OFF/OFF/ON badge draw proof (idle-frozen clock ⇒ non-pulsing badge). LIVE default is ON, so we toggle OFF first for
// the control frames then back to ON — a transient __dev flip, does NOT mutate the served config.
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
  return { sigOn, sigCtl };
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];
try {
  const page = await browser.newPage();
  wireErrs(page, errors, net404);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await toPlay(page);
  const build = await page.evaluate(() => (window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || "")).catch(() => "");
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot clean + hooks + build self-consistent vs version.json (NOT hardcoded — a later flip advances LIVE build, CAS-2271 lesson)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.warhorn && window.__dev.sanctuary && window.__dev.bounty
    && window.__dev.safeZone && window.__dev.rested && window.__dev.recall && window.__dev.quartermaster
    && window.__dev.saveBlob && window.__dev.daynight));
  ok("1 boots to play; build self-consistent vs version.json; warhorn+arc hooks; 0 err", hooks && build === verBuild && !!build, `build=${build} version.json=${verBuild}`);

  // 2 served config: WORLD_EVENT.enabled:true + 8-flag Sanctuary stack all true + 3 DARK flags false
  const cfg = await page.evaluate(async (live) => {
    const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); const t = await r.text();
    const flag = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]{0,400}?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    const on = ["WORLD_EVENT", "SANCTUARY_REWARDS", "SANCTUARY_REP", "BOUNTY_BOARD", "RECALL", "SAFEZONE", "RESTED_XP", "TEMPLE_RESPAWN"];
    const off = ["BOSS_RUSH", "DOORS_INTERIORS", "SEEDED_CHALLENGE"];
    return { on: on.map(f => [f, flag(f)]), off: off.map(f => [f, flag(f)]) };
  }, LIVE);
  const stackOk = cfg.on.every(([, v]) => v === "true") && cfg.off.every(([, v]) => v === "false");
  ok("2 served config: WORLD_EVENT.enabled:true + 8-flag Sanctuary stack all true + 3 DARK flags false",
     stackOk, `ON={${cfg.on.map(([f, v]) => f + ":" + v).join(",")}} OFF={${cfg.off.map(([f, v]) => f + ":" + v).join(",")}}`);

  // 3 DEFAULT-ON (the LIVE proof): fresh boot ⇒ warhorn().enabled===true with ZERO __dev flip
  const w0 = await page.evaluate(() => window.__dev.warhorn());
  ok("3 DEFAULT-ON from served config: warhorn().enabled===true, 0 __dev flip", w0.enabled === true, `enabled=${w0.enabled}`);

  // 4 schedule = pure function of the shared clock (same nowMs ⇒ identical; call/peak/idle + countdown coherent)
  const sched = await page.evaluate((NC, NP, NI) => {
    const a1 = window.__dev.warhorn({ nowMs: NC }).now, a2 = window.__dev.warhorn({ nowMs: NC }).now;
    const pk = window.__dev.warhorn({ nowMs: NP }).now, id = window.__dev.warhorn({ nowMs: NI }).now;
    return { a1, a2, pk, id };
  }, NOW_CALL, NOW_PEAK, NOW_IDLE);
  ok("4 schedule = pure function of shared clock: same nowMs ⇒ identical; call/peak/idle + countdown coherent",
     JSON.stringify(sched.a1) === JSON.stringify(sched.a2) &&
     sched.a1.active === true && sched.a1.phase === "call" && sched.a1.xpMult === 1.25 && sched.a1.repPerKill === 8 &&
     sched.pk.active === true && sched.pk.phase === "peak" && sched.pk.xpMult === 1.5 && sched.pk.repPerKill === 14 &&
     sched.id.active === false && sched.id.phase === "idle" &&
     Math.abs(sched.id.nextInSec - 600) < 1.5 && Math.abs(sched.a1.remainingSec - 179) < 1.5,
     `call{ph:${sched.a1.phase},x${sched.a1.xpMult}/${sched.a1.repPerKill},rem:${sched.a1.remainingSec}} peak{ph:${sched.pk.phase},x${sched.pk.xpMult}/${sched.pk.repPerKill}} idle{next:${sched.id.nextInSec}}`);

  // 5 REAL window via the REAL clock (NO nowMs injection): default-ON ⇒ tickWorldEvent derives G.warhorn from Date.now every
  // frame ⇒ warhorn().now non-null WITHOUT injection; derived countdown advances with real wall-time.
  await sleep(120);
  const rc1 = await page.evaluate(() => { const n = window.__dev.warhorn().now; return n ? { active: n.active, widx: n.windowIdx, clk: n.active ? n.remainingSec : n.nextInSec } : null; });
  await sleep(1600);
  const rc2 = await page.evaluate(() => { const n = window.__dev.warhorn().now; return n ? { active: n.active, widx: n.windowIdx, clk: n.active ? n.remainingSec : n.nextInSec } : null; });
  let realClockOk, realExtra;
  if (rc1 && rc2 && rc1.active === rc2.active && rc1.widx === rc2.widx) {
    const d = rc1.clk - rc2.clk;
    realClockOk = d > 0.8 && d < 3.0;
    realExtra = `derived(no inject) clk ${rc1.clk.toFixed(2)}→${rc2.clk.toFixed(2)} Δ=${d.toFixed(2)}s (exp ~1.6)`;
  } else {
    realClockOk = !!rc1 && !!rc2;
    realExtra = `derived(no inject) both non-null across window boundary rc1=${JSON.stringify(rc1)} rc2=${JSON.stringify(rc2)}`;
  }
  ok("5 REAL window via real clock: G.warhorn derived from Date.now WITHOUT injection + countdown advances with wall-time", realClockOk, realExtra);

  // 6 rally deterministic + OUTSIDE safezone
  const rally = await page.evaluate((NC, NC2) => {
    const r1 = window.__dev.warhorn({ nowMs: NC }).now.rally;
    const r1b = window.__dev.warhorn({ nowMs: NC }).now.rally;
    const r2 = window.__dev.warhorn({ nowMs: NC2 }).now.rally;
    const sz = window.__dev.safeZone(); const b = sz.bbox;
    const inZone = (p) => p && p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];
    return { r1, r2, same: JSON.stringify(r1) === JSON.stringify(r1b), diff: JSON.stringify(r1) !== JSON.stringify(r2), r1InZone: inZone(r1) };
  }, NOW_CALL, NOW_CALL2);
  ok("6 rally deterministic: !=null, same windowIdx⇒same, different⇒different, OUTSIDE the safezone",
     !!rally.r1 && rally.same && rally.diff && rally.r1InZone === false,
     `r1=${JSON.stringify(rally.r1)} r2=${JSON.stringify(rally.r2)} inZone=${rally.r1InZone}`);

  // 7 passive reward — Llamada phase (exact XP + rep). Isolate the warhorn mult from Rested spend + reset rep + fresh.
  const call = await page.evaluate((NC) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 }); window.__dev.rested({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });   // Llamada: bonus=round(40*0.25)=10
    return r.killObserved;
  }, NOW_CALL);
  ok("7 passive reward (Llamada): xpΔ==round(killXp*(1.25-1))==10 exact + repΔ==8 (SANCTUARY_REP ON, real kill route)",
     call.xpDelta === 10 && call.repDelta === 8, `xpΔ=${call.xpDelta} (exp 10) repΔ=${call.repDelta} (exp 8)`);

  // 8 ESCALANTE — Fervor/peak strictly greater
  const peak = await page.evaluate((NP) => {
    window.__dev.sanctuary({ setRep: 0 });
    const r = window.__dev.warhorn({ nowMs: NP, kill: true, killXp: 40 });   // Fervor: bonus=round(40*0.5)=20
    return r.killObserved;
  }, NOW_PEAK);
  ok("8 ESCALANTE (Fervor): xpΔ==round(killXp*(1.5-1))==20 > Llamada, repΔ==14 > 8",
     peak.xpDelta === 20 && peak.xpDelta > call.xpDelta && peak.repDelta === 14 && peak.repDelta > call.repDelta,
     `xpΔ=${peak.xpDelta} (exp 20) repΔ=${peak.repDelta} (exp 14)`);

  // 9 guards: kill INSIDE the safezone ⇒ 0 (open-world only) AND kill in idle ⇒ 0
  const guards = await page.evaluate((NC, NI) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });
    const sz = window.__dev.safeZone(); const t = sz.temple;
    const inZone = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40, kx: t.x, ky: t.y }).killObserved; // inside SZ, active window
    window.__dev.sanctuary({ setRep: 0 });
    const idle = window.__dev.warhorn({ nowMs: NI, kill: true, killXp: 40 }).killObserved;                     // outside window
    return { inZone, idle };
  }, NOW_CALL, NOW_IDLE);
  ok("9 guards: kill INSIDE safezone ⇒ 0 (open-world only), kill in IDLE ⇒ 0 (accrual only in active window)",
     guards.inZone.xpDelta === 0 && guards.inZone.repDelta === 0 && guards.idle.xpDelta === 0 && guards.idle.repDelta === 0,
     `inZone{xpΔ:${guards.inZone.xpDelta},repΔ:${guards.inZone.repDelta}} idle{xpΔ:${guards.idle.xpDelta},repΔ:${guards.idle.repDelta}}`);

  // 10 decouple RENOMBRE from the faction knob (transient __dev flip; restore after)
  const decouple = await page.evaluate((NC) => {
    window.__dev.sanctuary({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });
    window.__dev.sanctuary({ enabled: true });
    return r.killObserved;
  }, NOW_CALL);
  ok("10 decouple: SANCTUARY_REP OFF ⇒ repΔ==0 but xpΔ>0 (XP mult independent of faction knob)",
     decouple.repDelta === 0 && decouple.xpDelta > 0, `xpΔ=${decouple.xpDelta} repΔ=${decouple.repDelta}`);

  // 11 RENDER OBSERVABLE (desktop): the "Toque de Guerra" badge draws (idle-frozen clock ⇒ non-pulsing).
  // Run in the CALM safezone (no aggro churn) so the changed-px band isolates the badge, not a moving world (CAS-2272/2277 lesson).
  await toZone(page); await sleep(300);
  const bd = await badgeRenderProof(page);
  await page.screenshot({ path: join(OUT, "desktop-badge-on.png") }).catch(() => {});
  ok("11 RENDER badge (desktop): ON draws the 'Toque de Guerra' badge — clean signal >> OFF control",
     bd.sigOn > 60 && bd.sigOn > bd.sigCtl * 5 && bd.sigCtl < 20, `cleanSignal ON=${bd.sigOn} vs OFF-control=${bd.sigCtl}`);

  // 12 RENDER OBSERVABLE rally BLIP (desktop minimap): force the REAL clock into an active window, color-agnostic OFF/OFF/ON.
  await toZone(page);
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
  const MMF = 10;   // accumulate the tiny (~4px) pulsing rally diamond across several ON frames — its minimap footprint is small
  for (let i = 0; i < MMF; i++) { await snapMm("__mmOn" + i); await sleep(70); }
  const unionBlip = await page.evaluate((MMF) => {
    const a = window.__mm1, s = window.__mm2; const stable = (i) => Math.abs(a[i] - s[i]) <= 25 && Math.abs(a[i + 1] - s[i + 1]) <= 25 && Math.abs(a[i + 2] - s[i + 2]) <= 25;
    const set = new Set();
    for (let f = 0; f < MMF; f++) { const p = window["__mmOn" + f];
      for (let i = 0; i < a.length; i += 4) { if (!stable(i)) continue;
        if (Math.abs(a[i] - p[i]) > 40 || Math.abs(a[i + 1] - p[i + 1]) > 40 || Math.abs(a[i + 2] - p[i + 2]) > 40) set.add(i); } }
    return set.size;
  }, MMF);
  const rallyCtl = await cleanSignal(page, "__mm1", "__mm2", "__mm2");
  await page.screenshot({ path: join(OUT, "desktop-rally-blip.png") }).catch(() => {});
  await restoreClock(page);
  ok("12 RENDER rally blip (desktop minimap): active window ⇒ pulsing blip draws (union changed-px >> OFF control)",
     unionBlip >= 6 && unionBlip > rallyCtl, `unionChanged ON=${unionBlip} OFF-control=${rallyCtl}`);

  // 13 arc regression: 8-flag Sanctuary stack healthy with WORLD_EVENT ON
  const arc = await page.evaluate(() => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.bounty({ enabled: true });
    window.__dev.rested({ enabled: true }); window.__dev.recall({ enabled: true }); window.__dev.quartermaster({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    const acc = window.__dev.bounty({ act: true });
    return { warhornEnabled: window.__dev.warhorn().enabled, inZone: window.__dev.safeZone().inZone, safeEnabled: sz.enabled,
      restedEnabled: window.__dev.rested().enabled, recallEnabled: window.__dev.recall().enabled,
      sanctEnabled: window.__dev.sanctuary().enabled, qmEnabled: window.__dev.quartermaster().enabled, canAccept: !!acc.active };
  });
  ok("13 arc regression: WORLD_EVENT + REWARDS + REP + BOUNTY + RECALL + SAFEZONE + Rested + TEMPLE healthy (8-flag stack)",
     arc.warhornEnabled && arc.inZone && arc.safeEnabled && arc.restedEnabled && arc.recallEnabled && arc.sanctEnabled && arc.qmEnabled && arc.canAccept, JSON.stringify(arc));

  // 14 desktop fps ≥58 with the feature ON (live shared-clock tick each frame), CALM inZone state
  await toZone(page);
  await sleep(700);
  const fps = await fpsMedian5(page);
  ok("14 desktop fps ≥58 with feature ON (calm inZone, shared-clock tick each frame, median-of-5)", fps >= 58, `fps≈${fps}`);
  await page.screenshot({ path: join(OUT, "desktop-final.png") }).catch(() => {});

  // ---- MOBILE: touch viewport boots, schedule/reward parity, badge draws, fps ----
  const mpage = await browser.newPage();
  const merr = [], mnet404 = [];
  wireErrs(mpage, merr, mnet404);
  await mpage.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
  // desktop page autosaved to the SHARED-origin localStorage ⇒ a fresh boot here would load that save into a non-menu scene and
  // toPlay's menu wait would time out. Clear the game's keys on this page so it boots to the class-select menu (DARK-harness parity).
  await mpage.evaluateOnNewDocument(() => { try { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); } catch (e) {} });
  await mpage.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(mpage);

  // 15 mobile schedule pure-fn + reward parity (real route, sim authority)
  const mSched = await mpage.evaluate((NC, NP, NI) => {
    const a = window.__dev.warhorn({ nowMs: NC }).now, p = window.__dev.warhorn({ nowMs: NP }).now, i = window.__dev.warhorn({ nowMs: NI }).now;
    return { aPhase: a.phase, pPhase: p.phase, iActive: i.active };
  }, NOW_CALL, NOW_PEAK, NOW_IDLE);
  const mReward = await mpage.evaluate((NC, NP) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.rested({ enabled: false });
    window.__dev.sanctuary({ setRep: 0 }); const c = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 }).killObserved;
    window.__dev.sanctuary({ setRep: 0 }); const p = window.__dev.warhorn({ nowMs: NP, kill: true, killXp: 40 }).killObserved;
    return { c, p };
  }, NOW_CALL, NOW_PEAK);
  ok("15 mobile: DEFAULT-ON schedule pure-fn (call/peak/idle) + reward parity (Llamada 10/8, Fervor 20/14) on touch",
     mSched.aPhase === "call" && mSched.pPhase === "peak" && mSched.iActive === false &&
     mReward.c.xpDelta === 10 && mReward.c.repDelta === 8 && mReward.p.xpDelta === 20 && mReward.p.repDelta === 14,
     `sched ${mSched.aPhase}/${mSched.pPhase}/idle${mSched.iActive} reward c${mReward.c.xpDelta}/${mReward.c.repDelta} p${mReward.p.xpDelta}/${mReward.p.repDelta}`);

  // 16 RENDER badge (mobile): the badge draws on the touch viewport (calm safezone for a clean band isolation)
  await toZone(mpage); await sleep(300);
  const mbd = await badgeRenderProof(mpage);
  await mpage.screenshot({ path: join(OUT, "mobile-badge-on.png") }).catch(() => {});
  ok("16 RENDER badge (mobile): ON draws the 'Toque de Guerra' badge on touch — clean signal >> OFF control",
     mbd.sigOn > 60 && mbd.sigOn > mbd.sigCtl * 5 && mbd.sigCtl < 20, `cleanSignal ON=${mbd.sigOn} vs OFF-control=${mbd.sigCtl}`);

  // 17 mobile fps + no errors/404
  await sleep(400);
  const mfps = await fpsMedian3(mpage);
  ok("17 mobile fps ≥58 with feature ON, 0 err, 0 net-404", mfps >= 58 && merr.length === 0 && mnet404.length === 0,
     `fps≈${mfps} err=${merr.length} net404=${mnet404.length}`);

  ok("0 no JS errors / net-404 during desktop run", errors.length === 0 && net404.length === 0,
     (errors.slice(0, 3).join(" | ") + " | net404=" + net404.length));

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
