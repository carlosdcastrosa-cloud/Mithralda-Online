// CAS-2285 — QA OBSERVABLE pass for TOQUE DE GUERRA DEL SANTUARIO / SANCTUARY WARHORN (DARK, WORLD_EVENT.enabled:false).
// Independent QA (NOT a rerun of the GE self-verify). Focus = the observables QA owns and the acceptance list of CAS-2285:
//   1  byte-id OFF re-confirmed by MY OWN probe: warhorn().enabled false + G.warhorn NEVER created (now===null) on a DARK boot;
//      saveBlob() has NO 'warhorn' key; worldFingerprint byte-stable across the enabled toggle.
//   2  schedule = PURE FUNCTION of the shared wall clock: same nowMs ⇒ identical state (convergence "same clock, N clients");
//      idle/call/peak derived correctly; countdown coherent.
//   3  REAL window via the REAL clock (NO injection): with the feature ON, tickWorldEvent derives G.warhorn from Date.now()
//      every frame ⇒ warhorn().now is non-null WITHOUT me passing nowMs, and the derived countdown ADVANCES with real time.
//   4  rally = DETERMINISTIC gathering target: rally!=null in window, same windowIdx ⇒ same point, different ⇒ different, and
//      OUTSIDE the SAFEZONE; PLUS the minimap blip is RENDER-OBSERVABLE (real clock forced into an active window, no __dev draw).
//   5  passive open-world reward: kill in window ⇒ +XP == round(killXp*(xpMult-1)) EXACT (Llamada 1.25 / Fervor 1.5) + RENOMBRE
//      (8/14) with SANCTUARY_REP ON; kill INSIDE the safezone ⇒ 0 (guard); kill in idle ⇒ 0.
//   6  ESCALANTE: Fervor gives strictly more XP and rep than Llamada.
//   7  decouple: SANCTUARY_REP OFF ⇒ repΔ==0 but xpΔ>0 (the XP mult is independent of the faction knob).
//   8  RENDER OBSERVABLE badge (QA differentiator): the "Toque de Guerra" badge DRAWS with the feature ON — thresholded
//      changed-px vs an OFF control in the badge band, on DESKTOP and MOBILE. 60fps, 0 err/404.
//   9  reversible: warhorn({enabled:false}) ⇒ kill inert again.
//  10  arc regression: BOUNTY + SANCTUARY_REP + SAFEZONE + Rested + RECALL + Quartermaster intact with WORLD_EVENT ON.
// Run: node tools/cas2284-warhorn-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2284-qa");
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

const toZone = (page) => page.evaluate(() => { const sz = window.__dev.safeZone(); const t = sz.temple;
  window.__dev.tp(t.x / 32, t.y / 32); return window.__dev.safeZone().inZone; });

const fps1 = (page) => page.evaluate(() => new Promise(res => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }
async function fpsMedian5(page) { const a = []; for (let i = 0; i < 5; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[2]; }

// The warhorn badge (horn glyph + "Toque de Guerra" + status) draws at CONSTANT alpha when IDLE (pulse=0.6, non-pulsing),
// so the clean isolation (CAS-2266/CAS-2272 thresholded-changed-px): freeze the shared clock to an IDLE nowMs so the badge
// is stable, freeze day+weather, then a pixel is a TRUE warhorn signal if it changed a lot OFF→ON (|Δ|>55) yet was STABLE
// across two OFF frames (|Δ|<=25). That cancels the pulsing sibling badges (safezone/rested/recall) and world shimmer.
// The badge sits BELOW the whole badge row (badgeRowAnchor().by+120), so probe a generous right-side band.
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
    // right ~40% of the canvas, from just under the minimap frame down to ~0.6H — covers the warhorn badge at anchor+120.
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
// desktop OFF/OFF/ON badge draw proof (idle-frozen clock ⇒ non-pulsing badge)
async function badgeRenderProof(page) {
  await stabilizeWorld(page);
  await freezeIdleClock(page);
  await page.evaluate(() => window.__dev.warhorn({ enabled: false }));
  await new Promise(r => setTimeout(r, 120));
  await snapBand(page, "__wo1"); await sleep(90); await snapBand(page, "__wo2");
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  await sleep(140);
  await snapBand(page, "__won");
  const sigOn = await cleanSignal(page, "__wo1", "__wo2", "__won");
  const sigCtl = await cleanSignal(page, "__wo1", "__wo2", "__wo2");
  await restoreClock(page);
  return { sigOn, sigCtl };
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const net404 = [];
  page.on("response", (r) => { if (r.status() === 404) net404.push(r.url()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot clean + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.warhorn && window.__dev.sanctuary && window.__dev.bounty
    && window.__dev.safeZone && window.__dev.rested && window.__dev.recall && window.__dev.quartermaster
    && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.daynight));
  ok("1 boots to play, __dev.warhorn + arc hooks + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF (my own probe): DARK default enabled false + G.warhorn never created (now===null on a fresh DARK boot)
  const dark = await page.evaluate(() => window.__dev.warhorn());
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.warhorn({ enabled: false }));
  ok("2 byte-id OFF: enabled=false, G.warhorn never created (now===null), no 'warhorn' save key, worldFingerprint stable across toggle",
     dark.enabled === false && dark.now === null && !/"warhorn"/.test(saveOff) && fpA === fpB,
     `enabled=${dark.enabled} now=${JSON.stringify(dark.now)} saveKey=${/"warhorn"/.test(saveOff)} fpMatch=${fpA === fpB}`);

  // 3 schedule = pure function of the shared clock (same nowMs ⇒ identical; idle/call/peak derived + countdown coherent)
  const sched = await page.evaluate((NC, NP, NI) => {
    const a1 = window.__dev.warhorn({ nowMs: NC }).now, a2 = window.__dev.warhorn({ nowMs: NC }).now;
    const pk = window.__dev.warhorn({ nowMs: NP }).now, id = window.__dev.warhorn({ nowMs: NI }).now;
    return { a1, a2, pk, id };
  }, NOW_CALL, NOW_PEAK, NOW_IDLE);
  ok("3 schedule = pure function of shared clock: same nowMs ⇒ identical; call/peak/idle + countdown coherent",
     JSON.stringify(sched.a1) === JSON.stringify(sched.a2) &&
     sched.a1.active === true && sched.a1.phase === "call" && sched.a1.xpMult === 1.25 && sched.a1.repPerKill === 8 &&
     sched.pk.active === true && sched.pk.phase === "peak" && sched.pk.xpMult === 1.5 && sched.pk.repPerKill === 14 &&
     sched.id.active === false && sched.id.phase === "idle" &&
     Math.abs(sched.id.nextInSec - 600) < 1.5 && Math.abs(sched.a1.remainingSec - 179) < 1.5,
     `call{ph:${sched.a1.phase},x${sched.a1.xpMult}/${sched.a1.repPerKill},rem:${sched.a1.remainingSec}} peak{ph:${sched.pk.phase},x${sched.pk.xpMult}/${sched.pk.repPerKill}} idle{next:${sched.id.nextInSec}}`);

  // 4 REAL window via the REAL clock (NO nowMs injection): feature ON ⇒ tickWorldEvent derives G.warhorn from Date.now every
  // frame ⇒ warhorn().now non-null WITHOUT injection; the derived countdown advances with real wall-time.
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  await sleep(120); // let ≥1 tick populate G.warhorn from the real clock
  const rc1 = await page.evaluate(() => { const n = window.__dev.warhorn().now; return n ? { active: n.active, widx: n.windowIdx, clk: n.active ? n.remainingSec : n.nextInSec } : null; });
  await sleep(1600);
  const rc2 = await page.evaluate(() => { const n = window.__dev.warhorn().now; return n ? { active: n.active, widx: n.windowIdx, clk: n.active ? n.remainingSec : n.nextInSec } : null; });
  let realClockOk, realExtra;
  if (rc1 && rc2 && rc1.active === rc2.active && rc1.widx === rc2.widx) {
    const d = rc1.clk - rc2.clk;                       // same phase, no boundary crossed ⇒ countdown must have advanced ~1.6s
    realClockOk = d > 0.8 && d < 3.0;
    realExtra = `derived(no inject) clk ${rc1.clk.toFixed(2)}→${rc2.clk.toFixed(2)} Δ=${d.toFixed(2)}s (exp ~1.6)`;
  } else {                                             // boundary crossed during the sleep ⇒ still proves real-clock derivation
    realClockOk = !!rc1 && !!rc2;
    realExtra = `derived(no inject) both non-null across window boundary rc1=${JSON.stringify(rc1)} rc2=${JSON.stringify(rc2)}`;
  }
  ok("4 REAL window via real clock: G.warhorn derived from Date.now WITHOUT injection + countdown advances with wall-time", realClockOk, realExtra);
  await page.evaluate(() => window.__dev.warhorn({ enabled: false }));

  // 5 rally deterministic + outside safezone
  const rally = await page.evaluate((NC, NC2) => {
    const r1 = window.__dev.warhorn({ nowMs: NC }).now.rally;
    const r1b = window.__dev.warhorn({ nowMs: NC }).now.rally;
    const r2 = window.__dev.warhorn({ nowMs: NC2 }).now.rally;
    const sz = window.__dev.safeZone(); const b = sz.bbox;
    const inZone = (p) => p && p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];
    return { r1, r2, same: JSON.stringify(r1) === JSON.stringify(r1b), diff: JSON.stringify(r1) !== JSON.stringify(r2), r1InZone: inZone(r1) };
  }, NOW_CALL, NOW_CALL2);
  ok("5 rally deterministic: !=null, same windowIdx⇒same point, different⇒different, OUTSIDE the safezone",
     !!rally.r1 && rally.same && rally.diff && rally.r1InZone === false,
     `r1=${JSON.stringify(rally.r1)} r2=${JSON.stringify(rally.r2)} inZone=${rally.r1InZone}`);

  // 6 passive reward — Llamada phase (exact XP + rep). Isolate the warhorn mult from Rested spend + reset rep + fresh.
  const call = await page.evaluate((NC) => {
    window.__dev.warhorn({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });
    window.__dev.rested({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });   // Llamada: bonus=round(40*0.25)=10
    return r.killObserved;
  }, NOW_CALL);
  ok("6 passive reward (Llamada): xpΔ==round(killXp*(1.25-1))==10 exact + repΔ==8 (SANCTUARY_REP ON)",
     call.xpDelta === 10 && call.repDelta === 8, `xpΔ=${call.xpDelta} (exp 10) repΔ=${call.repDelta} (exp 8)`);

  // 7 ESCALANTE — Fervor/peak strictly greater
  const peak = await page.evaluate((NP) => {
    window.__dev.sanctuary({ setRep: 0 });
    const r = window.__dev.warhorn({ nowMs: NP, kill: true, killXp: 40 });   // Fervor: bonus=round(40*0.5)=20
    return r.killObserved;
  }, NOW_PEAK);
  ok("7 ESCALANTE (Fervor): xpΔ==round(killXp*(1.5-1))==20 > Llamada, repΔ==14 > 8",
     peak.xpDelta === 20 && peak.xpDelta > call.xpDelta && peak.repDelta === 14 && peak.repDelta > call.repDelta,
     `xpΔ=${peak.xpDelta} (exp 20) repΔ=${peak.repDelta} (exp 14)`);

  // 8 guards: kill INSIDE the safezone ⇒ 0 (open-world only) AND kill in idle ⇒ 0
  const guards = await page.evaluate((NC, NI) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });
    const sz = window.__dev.safeZone(); const t = sz.temple;
    const inZone = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40, kx: t.x, ky: t.y }).killObserved; // inside SZ, active window
    window.__dev.sanctuary({ setRep: 0 });
    const idle = window.__dev.warhorn({ nowMs: NI, kill: true, killXp: 40 }).killObserved;                     // outside window
    return { inZone, idle };
  }, NOW_CALL, NOW_IDLE);
  ok("8 guards: kill INSIDE safezone ⇒ 0 (open-world only), kill in IDLE ⇒ 0",
     guards.inZone.xpDelta === 0 && guards.inZone.repDelta === 0 && guards.idle.xpDelta === 0 && guards.idle.repDelta === 0,
     `inZone{xpΔ:${guards.inZone.xpDelta},repΔ:${guards.inZone.repDelta}} idle{xpΔ:${guards.idle.xpDelta},repΔ:${guards.idle.repDelta}}`);

  // 9 decouple RENOMBRE from the faction knob
  const decouple = await page.evaluate((NC) => {
    window.__dev.warhorn({ enabled: true }); window.__dev.sanctuary({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });
    return r.killObserved;
  }, NOW_CALL);
  ok("9 decouple: SANCTUARY_REP OFF ⇒ repΔ==0 but xpΔ>0 (XP mult independent of faction knob)",
     decouple.repDelta === 0 && decouple.xpDelta > 0, `xpΔ=${decouple.xpDelta} repΔ=${decouple.repDelta}`);

  // 10 reversible: disable ⇒ kill inert again
  const rev = await page.evaluate((NC) => {
    window.__dev.warhorn({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });
    return { enabled: r.enabled, ko: r.killObserved };
  }, NOW_CALL);
  ok("10 reversible: warhorn({enabled:false}) ⇒ kill inert (xpΔ==0, repΔ==0)",
     rev.enabled === false && rev.ko.xpDelta === 0 && rev.ko.repDelta === 0, `xpΔ=${rev.ko.xpDelta} repΔ=${rev.ko.repDelta}`);

  // 11 RENDER OBSERVABLE (desktop): the "Toque de Guerra" badge draws with the feature ON (idle-frozen clock ⇒ non-pulsing).
  const bd = await badgeRenderProof(page);
  await page.screenshot({ path: join(OUT, "desktop-badge-on.png") }).catch(() => {});
  ok("11 RENDER badge (desktop): ON draws the 'Toque de Guerra' badge — clean signal >> OFF control",
     bd.sigOn > 60 && bd.sigOn > bd.sigCtl * 5 && bd.sigCtl < 20, `cleanSignal ON=${bd.sigOn} vs OFF-control=${bd.sigCtl}`);

  // 12 RENDER OBSERVABLE rally BLIP (desktop minimap): force the REAL clock into an active window, then use the color-agnostic
  // clean-signal (OFF/OFF/ON) on the minimap band (NOT __dev). Rally is a FIXED derived point ⇒ absent OFF, present ON at a
  // spot the OFF frames left stable; the pulsing enemy blips move ⇒ they fail the OFF-OFF stability gate and are excluded.
  await toZone(page);                                  // hero in the city ⇒ the rally (city border + offset) is on the whole-map minimap
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
  // the blip is a tiny (~4px) PULSING semi-transparent diamond ⇒ each ON frame lights slightly different pixels. Union changed
  // pixels (stable across the two OFF frames, |Δ|>40 vs OFF-base) across several ON frames to accumulate the whole blip.
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
  // control: union the two OFF frames the same way ⇒ ~0 (stable pixels can't clear the change gate)
  const rallyCtl = await cleanSignal(page, "__mm1", "__mm2", "__mm2");
  await page.screenshot({ path: join(OUT, "desktop-rally-blip.png") }).catch(() => {});
  await restoreClock(page);
  ok("12 RENDER rally blip (desktop minimap): active window ⇒ pulsing blip draws (union changed-px >> OFF control)",
     unionBlip >= 6 && unionBlip > rallyCtl, `unionChanged ON=${unionBlip} OFF-control=${rallyCtl}`);

  // 13 arc regression with WORLD_EVENT ON: BOUNTY + SANCTUARY_REP + SAFEZONE + Rested + RECALL + Quartermaster intact
  const arc = await page.evaluate(() => {
    window.__dev.warhorn({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.bounty({ enabled: true });
    window.__dev.rested({ enabled: true }); window.__dev.recall({ enabled: true }); window.__dev.quartermaster({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    const acc = window.__dev.bounty({ act: true });
    return { inZone: window.__dev.safeZone().inZone, safeEnabled: sz.enabled, restedEnabled: window.__dev.rested().enabled,
      recallEnabled: window.__dev.recall().enabled, sanctEnabled: window.__dev.sanctuary().enabled,
      qmEnabled: window.__dev.quartermaster().enabled, canAccept: !!acc.active };
  });
  ok("13 arc regression: BOUNTY + SANCTUARY_REP + SAFEZONE + Rested + RECALL + Quartermaster healthy with WORLD_EVENT ON",
     arc.inZone && arc.safeEnabled && arc.restedEnabled && arc.recallEnabled && arc.sanctEnabled && arc.qmEnabled && arc.canAccept, JSON.stringify(arc));

  // 14 desktop fps ≥58 with the feature ON (live shared-clock tick every frame), measured in a CALM inZone state (safezone:
  // noAggro, mobs leashed) so the number reflects the feature's per-frame cost, not leftover churn from the render probes.
  await toZone(page);
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  await sleep(900);
  const fps = await fpsMedian5(page);
  ok("14 desktop fps ≥58 with feature ON (calm inZone, shared-clock tick each frame, median-of-5)", fps >= 58, `fps≈${fps}`);
  await page.screenshot({ path: join(OUT, "desktop-final.png") }).catch(() => {});

  // ---- MOBILE: touch viewport boots, badge draws, fps ----
  const mpage = await browser.newPage();
  await mpage.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
  const merr = [], mnet404 = [];
  mpage.on("pageerror", (e) => merr.push(String(e)));
  mpage.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) merr.push(m.text()); });
  mpage.on("response", (r) => { if (r.status() === 404) mnet404.push(r.url()); });
  await mpage.evaluateOnNewDocument(() => { try { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); } catch (e) {} });
  await mpage.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(mpage);

  // 15 mobile schedule pure-fn + reward parity (real route, sim authority) — proves the feature works on touch too
  const mSched = await mpage.evaluate((NC, NP, NI) => {
    const a = window.__dev.warhorn({ nowMs: NC }).now, p = window.__dev.warhorn({ nowMs: NP }).now, i = window.__dev.warhorn({ nowMs: NI }).now;
    return { aPhase: a.phase, pPhase: p.phase, iActive: i.active };
  }, NOW_CALL, NOW_PEAK, NOW_IDLE);
  const mReward = await mpage.evaluate((NC, NP) => {
    window.__dev.warhorn({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.rested({ enabled: false });
    window.__dev.sanctuary({ setRep: 0 }); const c = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 }).killObserved;
    window.__dev.sanctuary({ setRep: 0 }); const p = window.__dev.warhorn({ nowMs: NP, kill: true, killXp: 40 }).killObserved;
    return { c, p };
  }, NOW_CALL, NOW_PEAK);
  ok("15 mobile: schedule pure-fn (call/peak/idle) + reward parity (Llamada 10/8, Fervor 20/14) on touch",
     mSched.aPhase === "call" && mSched.pPhase === "peak" && mSched.iActive === false &&
     mReward.c.xpDelta === 10 && mReward.c.repDelta === 8 && mReward.p.xpDelta === 20 && mReward.p.repDelta === 14,
     `sched ${mSched.aPhase}/${mSched.pPhase}/idle${mSched.iActive} reward c${mReward.c.xpDelta}/${mReward.c.repDelta} p${mReward.p.xpDelta}/${mReward.p.repDelta}`);

  // 16 RENDER badge (mobile): the badge draws on the touch viewport (fallback anchor, top-right)
  const mbd = await badgeRenderProof(mpage);
  await mpage.screenshot({ path: join(OUT, "mobile-badge-on.png") }).catch(() => {});
  ok("16 RENDER badge (mobile): ON draws the 'Toque de Guerra' badge on touch — clean signal >> OFF control",
     mbd.sigOn > 60 && mbd.sigOn > mbd.sigCtl * 5 && mbd.sigCtl < 20, `cleanSignal ON=${mbd.sigOn} vs OFF-control=${mbd.sigCtl}`);

  // 17 mobile fps + no errors/404
  await mpage.evaluate(() => window.__dev.warhorn({ enabled: true }));
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
  await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
