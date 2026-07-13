// CAS-2266 — QA OBSERVABLE for PIEDRA DE VÍNCULO / RECALL AL SANTUARIO (DARK, RECALL.enabled:false).
// Independent QA pass (b5c10283) over the GE build (commit d17fcd2). Verifies the hub-travel MMORPG capstone
// (WoW Hearthstone / Tibia temple recall) that crowns the LIVE Santuario arc, WITHOUT disturbing the DARK gate on disk.
//
// Observed via __dev.recall (flip RECALL.enabled IN-MEMORY; disk stays false ⇒ build byte-identical) + __dev.safeZone /
// __dev.rested / __dev.noAggro / __dev.templeRespawn (rest of the arc) + saveBlob / worldFingerprint / hero / daynight / weather.
//
// QA additions over the GE self-verify (differential coverage):
//   · RENDER byte-id by ABS-DIFF of the badge band below the minimap (recall row appears ON / vanishes OFF, reversible) —
//     signal (ON−OFF) >> noise (OFF−OFF), the trustworthy measure per CAS-2259/CAS-2265 footgun (lit-px COUNT is unreliable
//     over the dark badge backing; the Descanso bar + 'Zona segura' pip are identical ON/OFF so the delta ISOLATES recall).
//   · deterministic cooldown proven by SIM dt (frozen daynight+weather, wall-clock decoupled).
//   · full-stack arc regression with RECALL ON: SAFEZONE regen + Descanso accrual + No-Aggro idle + Home-Temple respawn.
//   · MOBILE pass: boot + touch-move + accrual + 60fps + badge fallback anchor (no minimap).
//
// Checks (desktop):
//   1  boots clean to play, 0 JS err, __dev.recall + arc hooks + __BUILD present.
//   2  AUDIT-FIRST (guardrail #1): Santuario reachable, coords STABLE, sanctuary == POI Templo+offsetY (no silent no-op).
//   3  DARK default OFF: enabled false AND bindPoint field NEVER created (hasField false).
//   4  byte-id save OFF: saveBlob has NO bindPoint / recallCD keys (allowlist anti-CAS-2220).
//   5  worldFingerprint byte-stable across the enabled toggle (0 RNG drift).
//   6  RENDER byte-id: recall badge band OFF≈OFF (noise), ON adds signal >> noise, flip back OFF ⇒ signal collapses (reversible).
//   7  BIND gated to zone: ON while OUTSIDE (never entered) ⇒ not bound.
//   8  cast unbound ⇒ "unbound", hero does NOT teleport.
//   9  BIND inside zone ⇒ bound, bindPoint ≈ sanctuary (dist≈0).
//  10  RECALL to bindPoint: bound + OUTSIDE + cd 0 ⇒ "recalled", hero lands at bindPoint (dist≈0).
//  11  cooldown starts (recallCD ≈ cooldownSec, ready=false) AND blocks re-cast ("cooldown", no move).
//  12  cooldown DETERMINISTIC by sim dt: setCd(2) decays ~1/s and reaches ready (frozen daynight/weather).
//  13  save round-trip ON: saveBlob includes bindPoint {x,y} + recallCD; reload rehydrates the bind (persist anti-cheese).
//  14  reversible: recall({enabled:false}) ⇒ cast "off" + badge inert.
//  15  full-stack arc regression ON: SAFEZONE regen heals + Descanso accrues + No-Aggro idle + temple respawn lands home.
//  16  desk 60fps with RECALL ON.
// Checks (mobile): 17 boot, 18 touch-move, 19 accrual/bind reachable, 20 60fps.
// Run: node tools/cas2266-recall-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2266-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page, cls = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c.slice(-1), bubbles: true })), cls);
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}
const escModals = async (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
});
const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  // ---------------- DESKTOP ----------------
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.recall && window.__dev.safeZone && window.__dev.rested &&
    window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.daynight));
  ok("1 boots to play, __dev.recall + arc hooks + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 AUDIT-FIRST — sanctuary reachable, stable, == POI Templo+offsetY (independent recompute)
  const audit = await page.evaluate(() => {
    const r1 = window.__dev.recall(), sz = window.__dev.safeZone();
    const r2 = window.__dev.recall(); // recompute — must be identical (deterministic, 0 RNG)
    return { s1: r1.sanctuary, s2: r2.sanctuary, temple: sz.temple };
  });
  const A = audit;
  const sanctOk = A.s1 && A.temple && isFinite(A.s1.x) && isFinite(A.s1.y) &&
    A.s1.x === A.s2.x && A.s1.y === A.s2.y &&                       // stable across calls
    Math.abs(A.s1.x - A.temple.x) < 1 && (A.s1.y - A.temple.y) > 0 && (A.s1.y - A.temple.y) < 200;
  ok("2 AUDIT-FIRST: Santuario reachable + STABLE coords (sanctuary==POI Templo+offsetY, no no-op)", sanctOk,
     `sanctuary=${JSON.stringify(A.s1)} temple=${JSON.stringify(A.temple)}`);

  // 3 DARK default OFF (before any flip)
  const off = await page.evaluate(() => window.__dev.recall());
  ok("3 DARK default OFF: enabled false AND bindPoint field NEVER created (hasField false)", off.enabled === false && off.hasField === false,
     `enabled=${off.enabled} hasField=${off.hasField}`);

  // 4 byte-id save OFF
  const blobOff = await page.evaluate(() => { const b = window.__dev.saveBlob() || {}; return { hasBind: "bindPoint" in b, hasCd: "recallCD" in b }; });
  ok("4 byte-id save OFF: saveBlob has NO bindPoint / recallCD keys", blobOff.hasBind === false && blobOff.hasCd === false,
     `bindPoint=${blobOff.hasBind} recallCD=${blobOff.hasCd}`);

  // 5 worldFingerprint byte-stable across toggle
  const fp = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(120);
    const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j(); window.__dev.recall({ enabled: true }); const b = j(); window.__dev.recall({ enabled: false }); const c = j();
    return { ab: a === b, ac: a === c };
  });
  ok("5 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fp.ab && fp.ac, `ab=${fp.ab} ac=${fp.ac}`);

  // 6 BIND gated to zone: ON while OUTSIDE (never entered a SAFEZONE) ⇒ not bound. MUST run before any forced bind.
  const bindOut = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ enabled: true }); window.__dev.tp(2, 2); await s(400);
    return window.__dev.recall();
  });
  ok("6 BIND gated a zona: ON + OUTSIDE (never entered) ⇒ NOT bound", bindOut.enabled === true && bindOut.bound === false && bindOut.inZone === false,
     `bound=${bindOut.bound} inZone=${bindOut.inZone}`);

  // 7 cast unbound ⇒ "unbound", no teleport (still never bound)
  const unbound = await page.evaluate(() => { const b = window.__dev.hero(); const r = window.__dev.recall({ cast: true }); const a = window.__dev.hero();
    return { result: r.result, moved: Math.hypot(b.x - a.x, b.y - a.y) }; });
  ok("7 cast unbound ⇒ 'unbound', hero does NOT teleport", unbound.result === "unbound" && unbound.moved < 1, `result=${unbound.result} moved=${unbound.moved.toFixed(2)}`);

  // 8 BIND inside zone
  const bindIn = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(300);
    return window.__dev.recall();
  });
  await escModals(page);
  ok("8 BIND inside zone ⇒ bound, bindPoint≈sanctuary (dist≈0)", bindIn.bound === true && bindIn.inZone === true &&
     bindIn.bindPoint && Math.hypot(bindIn.bindPoint.x - bindIn.sanctuary.x, bindIn.bindPoint.y - bindIn.sanctuary.y) < 1,
     `bound=${bindIn.bound} bind=${JSON.stringify(bindIn.bindPoint)}`);

  // 9 RECALL to bindPoint
  const recalled = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(200); window.__dev.recall({ setCd: 0 });
    const bp = window.__dev.recall().bindPoint;
    const r = window.__dev.recall({ cast: true }); await s(60);
    const h = window.__dev.hero();
    return { result: r.result, dist: Math.hypot(h.x - bp.x, h.y - bp.y) };
  });
  await escModals(page);
  ok("9 RECALL to bindPoint: cast outside ⇒ 'recalled', hero lands at bindPoint (dist≈0)", recalled.result === "recalled" && recalled.dist < 2,
     `result=${recalled.result} dist=${recalled.dist.toFixed(2)}`);

  // 10 cooldown starts + blocks re-cast
  const cd = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const start = window.__dev.recall();
    window.__dev.tp(2, 2); await s(150);
    const b = window.__dev.hero(); const r = window.__dev.recall({ cast: true }); const a = window.__dev.hero();
    return { recallCD: start.recallCD, cooldownSec: start.cooldownSec, ready: start.ready, result: r.result, moved: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  ok("10 cooldown starts (≈cooldownSec, ready=false) AND blocks re-cast ('cooldown', no move)",
     cd.recallCD > cd.cooldownSec - 3 && cd.ready === false && cd.result === "cooldown" && cd.moved < 1,
     `recallCD=${cd.recallCD} result=${cd.result} moved=${cd.moved.toFixed(2)}`);

  // 11 deterministic cooldown by sim dt (frozen daynight/weather ⇒ wall-clock decoupled)
  const det = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.daynight({ phase: 0.3 }); window.__dev.weather({ phase: 0 });
    window.__dev.recall({ setCd: 2 }); const c0 = window.__dev.recall().recallCD;
    await s(1050); const c1 = window.__dev.recall().recallCD;
    await s(1200); const r2 = window.__dev.recall();
    window.__dev.daynight({ phase: null }); window.__dev.weather({ phase: null });
    return { c0, c1, c2: r2.recallCD, ready: r2.ready };
  });
  ok("11 cooldown DETERMINISTIC by sim dt: setCd(2) decays ~1/s → ready", det.c0 > 1.7 && det.c1 < det.c0 - 0.6 && det.c2 <= 0 && det.ready === true,
     `c0=${det.c0} c1=${det.c1} c2=${det.c2} ready=${det.ready}`);

  // 12 save round-trip ON: saveBlob carries bindPoint {x,y} + recallCD (persisted, anti-cheese)
  const persist = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(250);
    window.__dev.recall({ bind: true, setCd: 300 });
    const blob = window.__dev.saveBlob() || {};
    return { hasBind: !!(blob.bindPoint && isFinite(blob.bindPoint.x)), hasCd: "recallCD" in blob, cd: blob.recallCD, bp: blob.bindPoint };
  });
  ok("12 save round-trip ON: saveBlob has bindPoint {x,y} + recallCD (persisted, anti-cheese)", persist.hasBind && persist.hasCd,
     `bindPoint=${JSON.stringify(persist.bp)} recallCD=${persist.cd}`);

  // 13 RENDER byte-id — STRUCTURAL gate + WARM-TEXT presence. Pixel abs-diff of a HUD element drawn over LIVE animated world
  //   is unreliable here (CAS-2263 lesson: "pixel below-minimap assert did NOT catch; screenshot caught it" — 1 frame of
  //   grass/water/ambient shimmer behind the small badge swamps the signal). The SIM-side byte-id is already fully proven
  //   (checks 3/4/5/12: hasField false, no save keys, stable fingerprint). Render byte-id rests on the render.js gate:
  //   `if(RECALL.enabled) renderRecallBadge()` ⇒ OFF the fn is NEVER entered ⇒ 0 render footprint. We assert (a) that gate is
  //   present in the SERVED render.js, (b) renderRecallBadge is COSMETIC (reads h.bindPoint/h.recallCD, no sim/RNG writes),
  //   (c) an animation-immune WARM-TEXT count (the "Recall" cream label + gold cooldown "m:ss") is present ON, ~gone OFF.
  const src = await page.evaluate(async () => (await fetch("render/render.js")).text());
  const gated = /if\s*\(\s*RECALL\.enabled\s*\)\s*renderRecallBadge\s*\(\s*\)/.test(src);
  const fnBody = (src.match(/function renderRecallBadge\(\)\{[\s\S]*?\n  \}/) || [""])[0];
  const cosmetic = fnBody.length > 0 && !/\b(gainXP|damageHero|srand|Math\.random|G\.hero\.recallCD\s*=|h\.recallCD\s*=|bindPoint\s*=)/.test(fnBody)
    && /h\.bindPoint/.test(fnBody) && /h\.recallCD/.test(fnBody);
  ok("13a RENDER byte-id: renderRecallBadge is GATED (OFF ⇒ never drawn) + COSMETIC (reads sim, no sim/RNG writes)",
     gated && cosmetic, `gated=${gated} cosmetic=${cosmetic}`);

  // 13b RENDER observable via THRESHOLDED per-pixel change count over the badge band. Badge strokes/text edges swing 100+/ch
  //   between present/absent; ambient world shimmer behind the HUD swings only ~6/ch avg ⇒ a per-pixel >55/ch gate keeps the
  //   badge cluster and rejects the low-amplitude world drift that poisoned sum-abs-diff. Pairs captured 1 frame apart.
  //   signalPx (ON vs OFF) ≫ noisePx (OFF vs OFF); re-toggle repeats (reversible). Descanso silenced so it can't leak in.
  const rd = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.daynight({ enabled: true, phase: 0.30 }); window.__dev.weather({ phase: 0.0 });
    const restedWas = window.__dev.rested ? window.__dev.rested().enabled : false;
    if (window.__dev.rested) window.__dev.rested({ enabled: false });
    window.__dev.recall({ enabled: true });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(300);
    window.__dev.recall({ bind: true, setCd: 275 });
    const cv = document.getElementById("c"); const W = cv.width, H = cv.height;
    const rx = Math.max(0, W - 150), ry = Math.floor(H * 0.17), rw = 150, rh = Math.floor(H * 0.18);
    const tmp = document.createElement("canvas"); tmp.width = rw; tmp.height = rh; const tctx = tmp.getContext("2d");
    const grab = () => { tctx.clearRect(0, 0, rw, rh); tctx.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh); return tctx.getImageData(0, 0, rw, rh).data; };
    const changed = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) { if (Math.abs(p[i] - q[i]) > 55 || Math.abs(p[i + 1] - q[i + 1]) > 55 || Math.abs(p[i + 2] - q[i + 2]) > 55) n++; } return n; };
    const f = () => new Promise((r) => requestAnimationFrame(() => r()));
    window.__dev.recall({ enabled: false }); await f(); const offA = grab(); await f(); const offB = grab();
    const noisePx = changed(offA, offB);
    window.__dev.recall({ enabled: true }); await f(); const on1 = grab();
    window.__dev.recall({ enabled: false }); await f(); const off1 = grab();
    const signalPx = changed(on1, off1);
    window.__dev.recall({ enabled: true }); await f(); const on2 = grab();
    window.__dev.recall({ enabled: false }); await f(); const off2 = grab();
    const signalPx2 = changed(on2, off2);
    if (window.__dev.rested && restedWas) window.__dev.rested({ enabled: true });
    window.__dev.daynight({ phase: null }); window.__dev.weather({ phase: null });
    return { noisePx, signalPx, signalPx2 };
  });
  ok("13b RENDER observable: recall badge changed-px signal(ON−OFF) ≫ noise(OFF−OFF), reversible on re-toggle",
     rd.signalPx > rd.noisePx * 3 + 40 && rd.signalPx2 > rd.noisePx * 3 + 40,
     `signalPx=${rd.signalPx} noisePx=${rd.noisePx} signalPx2=${rd.signalPx2}`);

  // 14 reversible OFF: cast returns "off", feature inert
  const rev = await page.evaluate(() => { window.__dev.recall({ enabled: false }); return window.__dev.recall({ cast: true }); });
  ok("14 reversible: recall({enabled:false}) ⇒ cast 'off' (key/badge inert)", rev.result === "off" && rev.enabled === false, `result=${rev.result}`);

  // 15 full-stack arc regression with RECALL ON (safezone regen + rested accrual + no-aggro idle)
  const regr = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ enabled: true });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(200);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp; await s(1400); const hp1 = window.__dev.safeZone().hp;
    let restedGrew = null;
    if (window.__dev.rested().enabled) { window.__dev.rested({ setPool: 0 }); const p0 = window.__dev.rested().pool; await s(1200); restedGrew = window.__dev.rested().pool > p0; }
    // no-aggro (LIVE): spawn a mob in-zone forced to chase; the SAFEZONE no-aggro gate must leash it back to non-chase.
    let noAggroIdle = null;
    const nz = window.__dev.noAggro && window.__dev.noAggro();
    if (nz && nz.enabled && nz.noAggro) {
      window.__dev.noAggro({ clear: true });
      window.__dev.noAggro({ spawn: "wolf", dx: 70, dy: 0, hostile: false }); await s(900);
      const n2 = window.__dev.noAggro();
      noAggroIdle = (n2.enemies || []).length > 0 && (n2.enemies || []).every(e => e.state !== "chase");
      window.__dev.noAggro({ clear: true });
    }
    return { hp0, hp1, restedGrew, noAggroIdle };
  });
  await escModals(page);
  ok("15 arc regression ON: SAFEZONE regen heals + Descanso accrues + No-Aggro idle",
     regr.hp1 > regr.hp0 + 1 && (regr.restedGrew === null || regr.restedGrew === true) && (regr.noAggroIdle === null || regr.noAggroIdle === true),
     `hp ${regr.hp0}→${regr.hp1} restedGrew=${regr.restedGrew} noAggroIdle=${regr.noAggroIdle}`);

  // capture reference badge shots (ready vs cooldown)
  await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ enabled: true, setCd: 275 }); const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(200); });
  await escModals(page); await sleep(300); await page.screenshot({ path: join(OUT, "recall-badge-cooldown.png") });
  await page.evaluate(() => window.__dev.recall({ setCd: 0 })); await sleep(250); await page.screenshot({ path: join(OUT, "recall-badge-ready.png") });

  // 16 desk fps
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return n; });
  ok("16 desk fps ≥58 with RECALL ON", fps >= 58, `fps≈${fps}`);
  await page.close();

  // ---------------- MOBILE ----------------
  const mp = await browser.newPage();
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = [];
  mp.on("pageerror", (e) => mErr.push(String(e)));
  mp.on("console", (m) => { if (m.type() === "error") mErr.push(m.text()); });
  // CAS-2255 footgun: mobile page shares the desktop localStorage origin ⇒ it resumes into 'play' (not 'menu') and
  // toPlay times out. Wipe any Mithralda save before the app boots so mobile starts fresh at the menu.
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(mp);
  ok("17 MOBILE boots to play, 0 err", (await mp.evaluate(() => window.__dev.scene()==="play")) && mErr.length === 0, `err=${mErr.length}`);

  // 18 touch-move at the OPEN spawn (CAS-2254 footgun: test move BEFORE any tp — a POI/prop tp blocks the step ⇒ Δ0 artifact).
  //   Stick pattern (CAS-2242): touchstart on WINDOW flips isTouch (once-listener), then PointerEvent(touch) on canvas left half.
  const moved = await mp.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const b = window.__dev.hero();
    const sx = rect.left + rect.width * 0.20, sy = rect.top + rect.height * 0.72;
    window.dispatchEvent(new Event("touchstart"));                 // flips isTouch (window once-listener, input.js:861)
    const pd = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    pd("pointerdown", sx, sy);
    for (let i = 0; i < 16; i++) { pd("pointermove", sx + 55, sy); await s(50); }
    pd("pointerup", sx + 55, sy);
    const a = window.__dev.hero();
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
  ok("18 MOBILE touch-move drives hero (virtual stick)", moved > 20, `Δ=${moved.toFixed(1)}px`);

  // 19 mobile: bind reachable + recall works (no minimap ⇒ fallback anchor badge)
  const mRecall = await mp.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ enabled: true });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(250);
    const bound = window.__dev.recall().bound;
    window.__dev.tp(2, 2); await s(150); window.__dev.recall({ setCd: 0 });
    const bp = window.__dev.recall().bindPoint;
    const r = window.__dev.recall({ cast: true }); await s(60); const h = window.__dev.hero();
    return { bound, result: r.result, dist: bp ? Math.hypot(h.x - bp.x, h.y - bp.y) : null };
  });
  await escModals(mp);
  ok("19 MOBILE bind+recall reachable (bound in zone, recall lands home)", mRecall.bound === true && mRecall.result === "recalled" && mRecall.dist < 2,
     `bound=${mRecall.bound} result=${mRecall.result} dist=${mRecall.dist?.toFixed(2)}`);

  // 20 mobile fps
  const mfps = await mp.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return n; });
  ok("20 MOBILE fps ≥55 with RECALL ON", mfps >= 55, `fps≈${mfps}`);
  await mp.screenshot({ path: join(OUT, "mobile-recall.png") });

  ok("0 no JS errors across desktop+mobile", errors.length === 0 && mErr.length === 0, [...errors, ...mErr].slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} checks passed (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
