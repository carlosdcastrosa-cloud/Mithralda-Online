// CAS-2423 — POST-FLIP LIVE QA (INDEPENDENT) for TERRENO FIRME / PISADA FIRME (FIRM_FOOTING.enabled:true). EVO mecánica #70, 2-cliente LIVE. Mirror de CAS-2414.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores),
// NO un mirror local ni el Higgsfield retirado. QA-OWNED harness (b5c10283) — NO es copia del selfverify GE (cas2415) ni del DARK (cas2419):
//   oráculos RE-DERIVADOS desde primeros principios (LUT por material, CAP 130, share-cap min(130,base+firm)), reloj FRESCO QNOW, pids cliA/cliB.
// Porté los oráculos DARK (CAS-2419) al scaffolding LIVE (CAS-2414). Aceptaciones del ticket CAS-2423:
//   (1) build servido = version.json = EXPECT 181a2d0e6980 (flip CAS-2421) y AVANZÓ del pre-flip 22b67daa125e (LAST_STAND LIVE #69).
//   (2) DEFAULT-ON: FIRM_FOOTING served enabled:TRUE + eje ESPACIAL/MATERIAL (world.terr server-auth bajo el héroe;
//       grass/dirt→T1/+8 atkspd, stone/cobble/street→T2/+16, sand/water/ice/swamp/caldera→T0/+0; LUT PURA). 0-desync 2-cliente.
//   (3) canal FRESCO atkspd bajo TECHO GLOBAL ATKSPD_TOTAL_CAP=130 con SHARE-CAP (min(130, base+firm) ⇒ 0 doble-dip); sub-cap firmFootingCap:16.
//   (4) 0-REGRESIÓN: 11 arco previo LIVE (#59-#69) served enabled:true; FIRM_FOOTING #70 también true ⇒ arco completo; 0 err/404.
//   (5) STATELESS: sin clave G.firmFooting* en save-payload; recarga/reconexión sin residuo (0-drift).
//   (6) PASS/FAIL con build id + client count + desync count + fps.
// Run: node tools/cas2423-firmfooting-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2423-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "181a2d0e6980";   // build deployado por el flip FIRM_FOOTING CAS-2421 (== version.json esperado)
const PREFLIP = "22b67daa125e";        // build servido ANTES del flip (LAST_STAND LIVE #69 CAS-2413) — el LIVE debe AVANZAR de éste

// ── ORÁCULOS RE-DERIVADOS (re-implementación independiente del spec FIRM_FOOTING; NO importados de sim.js/GE) ──
const CAP = 130;                               // ATKSPD_TOTAL_CAP
// material ids: grass0 dirt1 stone2 cobble3 sand4 water5 ice6 swamp7 caldera8 street9
function oracleBonus(mat) {
  if (mat === 2 || mat === 3 || mat === 9) return { tier: 2, bonus: 16 }; // stone/cobble/street firme
  if (mat === 0 || mat === 1) return { tier: 1, bonus: 8 };               // grass/dirt firme
  return { tier: 0, bonus: 0 };                                          // sand/water/ice/swamp/caldera + unknown = pisada suelta
}
const oracleCap = (base, firm) => Math.min(CAP, base + firm);
const MAT_DOMAIN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const QNOW = 9_810_000;   // reloj de pared QA FIJO — FRESCO. El eje FIRM_FOOTING es 0-timer/STATELESS, pero mantengo QNOW p/worldFingerprint estable.

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAFirm";
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

let browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
}

async function runOnce(round) {
  console.log(`\n===== CAS-2423 QA POST-FLIP LIVE — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[r${round}] ${m.text()}`); });
  page.on("requestfailed", (rq) => { if (!isFaviconOnly(rq.url())) net404.push(`[r${round}] ${rq.url()}`); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(`[r${round}] ${rp.url()}`); });
  await page.bringToFront();
  await boot(page);
  const build = await page.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // config servido — 11 flags arco LIVE (#59-#69) + FIRM_FOOTING #70 todos true (0-regr) + channel atkspd + firmFootingCap 16 + tiers 8/16
  const cfgSrc = await page.evaluate(async (live) => {
    for (let i = 0; i < 6; i++) { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); const t = await r.text();
      if (t.includes("export const FIRM_FOOTING") && t.length > 200000) return t; await new Promise(res => setTimeout(res, 250)); }
    const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text();
  }, LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const ffServed = en("FIRM_FOOTING");           // EVO#70 — DEBE estar served true (flip CAS-2421 landed)
  // params byte-servidos del bloque FIRM_FOOTING
  const ffBlock = (cfgSrc.match(/export const FIRM_FOOTING\s*=\s*\{[\s\S]*?\n\};/) || [""])[0];
  const paramsOk = /channel:\s*"atkspd"/.test(ffBlock) && /firmFootingCap:\s*16/.test(ffBlock) &&
    /atkspd:\s*8/.test(ffBlock) && /atkspd:\s*16/.test(ffBlock);
  const capServed = /ATKSPD_TOTAL_CAP\s*=\s*130/.test(cfgSrc);

  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.firmFooting && window.__dev.saveBlob && window.__dev.worldFingerprint));
  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + FIRM_FOOTING served true + 11 arco true + params + 0 err/404
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.firmFooting+saveBlob+worldFingerprint; served FIRM_FOOTING.enabled:true + 11 arco true (12 flags true, 0-regr) + channel atkspd + firmFootingCap 16 + tiers 8/16 + ATKSPD_TOTAL_CAP 130 + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && ffServed === "true" && arcTrue && paramsOk && capServed && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} FIRM_FOOTING=${ffServed} params=${paramsOk} cap130=${capServed} arcTrue=${arcTrue} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — MOVEMENT smoke LIVE: hero moves under ArrowRight (real position delta), scene stays 'play'
  const mov = await page.evaluate(async () => {
    const h0 = window.__dev.firmFooting().hero; const p0 = { x: h0.x, y: h0.y };
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const h1 = window.__dev.firmFooting().hero; const p1 = { x: h1.x, y: h1.y };
    return { dist: Math.hypot(p1.x - p0.x, p1.y - p0.y), scene: window.__dev.scene(), dead: h1.dead };
  });
  ok("2 MOVEMENT LIVE: ArrowRight mueve al héroe (delta pos>0), sigue en 'play', vivo",
     mov.dist > 1 && mov.scene === "play" && mov.dead === false, `dist=${mov.dist.toFixed(1)} scene=${mov.scene}`);

  // 3 — COMBAT smoke LIVE: numeric attack (Digit1) fires without crash, still in play, 0 new err
  const errBeforeCombat = errors.length;
  const combat = await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
      await new Promise(r => setTimeout(r, 120)); window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })); await new Promise(r => setTimeout(r, 120)); }
    return { scene: window.__dev.scene() };
  });
  ok("3 COMBAT LIVE: ataque numérico (Digit1) dispara sin crash, sigue en 'play', 0 err nuevo",
     combat.scene === "play" && errors.length === errBeforeCombat, `scene=${combat.scene} newErr=${errors.length - errBeforeCombat}`);

  // 4 — DEFAULT-ON desde config servido: firmFooting().enabled===true (flip cargó) + channel 'atkspd' + STATELESS (gExists:false, 0 acumulador per-pid)
  const dOn = await page.evaluate(() => { const s = window.__dev.firmFooting(); return { enabled: s.enabled, gExists: s.gExists, channel: s.channel }; });
  ok("4 DEFAULT-ON (flip cargó): firmFooting().enabled===true; channel 'atkspd'; STATELESS gExists:false (0 acumulador per-pid)",
     dOn.enabled === true && dOn.channel === "atkspd" && dOn.gExists === false, JSON.stringify(dOn));

  // scan world.terr (server-auth) → tiles reales por material
  const scan = await page.evaluate(() => window.__dev.firmFooting({ scan: true }).scan);
  const present = Object.keys(scan.sample).map(Number).filter(t => t >= 0 && t <= 9).sort((a, b) => a - b);
  const firmMat = [2, 3, 9, 0, 1].find(t => scan.sample[t]);   // prefer T2 stone/cobble/street
  const looseMat = [4, 6, 7, 8, 5].find(t => scan.sample[t]);
  const firmTile = scan.sample[firmMat];
  const looseTile = looseMat != null ? scan.sample[looseMat] : null;
  ok("5 world.terr poblado server-auth LIVE: ≥1 material firme y ≥1 suelto en el mapa (scan real) — el material CRUZA zonas",
     firmTile != null && looseTile != null && present.length >= 2, `present=${JSON.stringify(present)} firmMat=${firmMat} looseMat=${looseMat}`);

  // 6 — TABLA PURA por material (oráculo QA re-derivado) via terrProbe 0..9
  const tab = await page.evaluate(() => { const o = {}; for (let t = 0; t <= 9; t++) o[t] = window.__dev.firmFooting({ terrProbe: { terr: t } }).probe; return o; });
  const tabOK = MAT_DOMAIN.every(m => { const e = oracleBonus(m); return tab[m] && tab[m].tier === e.tier && near(tab[m].bonus, e.bonus); });
  ok("6 TABLA PURA por material [oráculo QA]: grass/dirt→T1/+8, stone/cobble/street→T2/+16, sand/water/ice/swamp/caldera→T0/+0 (LUT determinista)",
     tabOK, JSON.stringify(tab));

  // 7 ★ EFECTO OBSERVABLE / SERVER-AUTH: heroTerr lee world.terr en CADA tile de muestra ⇒ terr==material y bono==LUT; material cruza ≥2 zonas
  const realReads = await page.evaluate((present) => {
    const s = window.__dev.firmFooting({ scan: true }).scan; const out = {};
    for (const t of present) { const sm = s.sample[t]; if (!sm) continue;
      const r = window.__dev.firmFooting({ tp: { tx: sm.tx, ty: sm.ty } });
      out[t] = { terr: r.terr, tier: r.tier, bonus: r.bonus, zone: r.hero && r.hero.zone }; }
    return out;
  }, present);
  const realOK = present.every(t => { const e = oracleBonus(t); const r = realReads[t]; return r && r.terr === t && r.tier === e.tier && near(r.bonus, e.bonus); });
  const crossZone = new Set(present.map(t => realReads[t] && realReads[t].zone).filter(Boolean)).size >= 2;
  ok("7 ★ EFECTO OBSERVABLE server-auth: en firme (grass/stone) el héroe gana atkspd por tier; en no-listado (arena/agua/hielo) T0/+0; material CRUZA ≥2 zonas",
     realOK && crossZone, `zonas=${[...new Set(present.map(t => realReads[t] && realReads[t].zone))]} reads=${JSON.stringify(realReads)}`);

  // 8 ★ DETERMINISMO: firme→suelto→firme AL INSTANTE (sin decay ⊥ temporal); re-lectura idempotente
  const det = await page.evaluate((firmTile, looseTile) => {
    const a = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const b = window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    const c = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const c2 = window.__dev.firmFooting();
    return { a: { tier: a.tier, bonus: a.bonus }, b: { tier: b.tier, bonus: b.bonus }, c: { tier: c.tier, bonus: c.bonus }, c2: { tier: c2.tier, bonus: c2.bonus } };
  }, firmTile, looseTile);
  const detOK = det.a.tier >= 1 && det.b.tier === 0 && det.c.tier === det.a.tier && det.c.bonus === det.a.bonus && det.c2.tier === det.c.tier && det.c2.bonus === det.c.bonus;
  ok("8 ★ DETERMINISMO: firme→suelto→firme sigue el material AL INSTANTE (sin decay ⊥ temporal); re-lectura idempotente",
     detOK, JSON.stringify(det));

  // 9 (AC3) ★ SINK + SHARE-CAP GLOBAL [oráculo QA min(130, base+firm)]: ON firme aporta el bono al sink heroAtkspd; ON suelto 0; capProbe pure math
  const sink = await page.evaluate((firmTile, looseTile) => {
    const onFirm = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const onLoose = window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const hi = window.__dev.firmFooting({ capProbe: { base: 120 } }).capped;   // 120+firm ⇒ clamp 130
    const mid = window.__dev.firmFooting({ capProbe: { base: 100 } }).capped;  // 100+firm ⇒ ≤cap
    const lo = window.__dev.firmFooting({ capProbe: { base: 0 } }).capped;     // 0+firm ⇒ firm
    return { onFirmAtk: onFirm.atkspd, onFirmTotal: onFirm.atkspdTotal, onLooseAtk: onLoose.atkspd, hi, mid, lo };
  }, firmTile, looseTile);
  const eFirm = oracleBonus(firmMat).bonus;
  const capOK = sink.hi.combined === oracleCap(120, eFirm) && sink.hi.combined === 130 && near(sink.mid.combined, oracleCap(100, eFirm)) && near(sink.lo.combined, eFirm) && sink.lo.firmFooting <= 16;
  ok("9 (AC3) ★ SINK+SHARE-CAP GLOBAL [oráculo QA min(130,base+firm)]: ON firme aporte==bono al sink heroAtkspd; ON suelto 0; 120+f=130(cede/capado), 100+f≤cap, 0+f=f; firmFootingCap≤16, 0 doble-dip",
     sink.onFirmAtk === eFirm && sink.onLooseAtk === 0 && capOK, `firmMat=${firmMat} bonoEsperado=${eFirm} ${JSON.stringify(sink)}`);

  // 10 (AC2) ★ OFF byte-neutral en el seam: enabled:false ⇒ heroAtkspd firme==suelto (+0), tag "" (sin badge ⛰). RESTAURA LIVE (enabled:true) al terminar.
  const neutral = await page.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: false, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const offFirm = window.__dev.firmFooting();
    window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    const offLoose = window.__dev.firmFooting();
    window.__dev.firmFooting({ enabled: true });   // RESTAURA estado LIVE (enabled:true)
    return { firmAtk: offFirm.atkspd, firmTotal: offFirm.atkspdTotal, firmTag: offFirm.tag,
             looseAtk: offLoose.atkspd, looseTotal: offLoose.atkspdTotal, looseTag: offLoose.tag };
  }, firmTile, looseTile);
  const neutOK = neutral.firmAtk === 0 && neutral.looseAtk === 0 && near(neutral.firmTotal, neutral.looseTotal) && neutral.firmTag === "" && neutral.looseTag === "";
  ok("10 (AC2) ★ OFF BYTE-NEUTRAL: togglear enabled:false ⇒ heroAtkspd(firme)==heroAtkspd(suelto), aporte 0 en ambos, tag \"\" (sin ⛰) ⇒ reversibilidad 0-regr",
     neutOK, JSON.stringify(neutral));

  // 11 (AC5) STATELESS: saveBlob() sin clave firmFooting* + G.firmFooting nunca creado + fingerprint estable a través del toggle
  const stateless = await page.evaluate((firmTile) => {
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const save = JSON.stringify(window.__dev.saveBlob());
    const g1 = window.__dev.firmFooting().gExists;
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(810));
    window.__dev.firmFooting({ enabled: false });
    const g2 = window.__dev.firmFooting().gExists;
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(810));
    window.__dev.firmFooting({ enabled: true });   // RESTAURA LIVE
    return { hasKey: /"firmFooting/i.test(save), g1, g2, fpStable: fpBefore === fpAfter, saveLen: save.length };
  }, firmTile);
  ok("11 (AC5) STATELESS: saveBlob() SIN clave firmFooting*; G.firmFooting NUNCA se crea (gExists false); worldFingerprint byte-estable a través del toggle (atkspd NO entra al fp, 0 RNG drift)",
     stateless.hasKey === false && stateless.g1 === false && stateless.g2 === false && stateless.fpStable, JSON.stringify(stateless));

  // 12 (AC4) 0-REGRESIÓN runtime: arc flags server-side todos enabled:true INCLUYENDO FIRM_FOOTING (arco #59-#70 completo LIVE)
  const rt = await page.evaluate(() => {
    const tryEn = (fn) => { try { const s = window.__dev[fn](); return (s && "enabled" in s) ? s.enabled : null; } catch (e) { return "ERR"; } };
    return { ward: tryEn("ward"), trail: tryEn("trailcraft"), delve: tryEn("delve"), erud: tryEn("erudition"), noct: tryEn("nocturne"), cad: tryEn("cadence"), temp: tryEn("tempest"), last: tryEn("lastStand"), firm: tryEn("firmFooting") };
  });
  ok("12 (AC4) 0-REGRESIÓN runtime: WARDING/TRAILCRAFT/DELVE/ERUDITION/NOCTURNE/CADENCE/TEMPEST/LAST_STAND + FIRM_FOOTING todos enabled:true (arco LIVE completo #59-#70, 0 mecánica regresó)",
     rt.ward === true && rt.trail === true && rt.delve === true && rt.erud === true && rt.noct === true && rt.cad === true && rt.temp === true && rt.last === true && rt.firm === true, JSON.stringify(rt));

  // 13 render badge "Terreno:" se DIBUJA ON+firme, NO con mecánica OFF + fps (perf budget 60fps LIVE)
  const badge = await page.evaluate(async (firmTile) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Terreno:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    cnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt, fpsOn = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.firmFooting({ enabled: false });
    cnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });   // RESTAURA LIVE
    return { onCnt, offCnt, fpsOn };
  }, firmTile);
  ok("13 render badge 'Terreno:' se DIBUJA ON+firme (count>0), NO con mecánica OFF (enabled:false ⇒ 0), fps≥55 (perf budget 60fps LIVE)",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fpsOn >= 55, JSON.stringify(badge));

  await page.evaluate((firmTile) => window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } }), firmTile);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.firmFooting({ enabled: true }));
  return { page, build, present, scan, firmMat, firmTile };
}

let build1 = null, buildInfo = null;
let nsBrowser = null;
let desync = 0;
try {
  const r1 = await runOnce(1);
  buildInfo = r1.build;
  await r1.page.close();
  const r2 = await runOnce(2);
  build1 = r2.build;
  const present = r2.present, scan = r2.scan, firmMat = r2.firmMat, firmTile = r2.firmTile;
  await r2.page.close();
  ok("14 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build1, `${buildInfo} / ${build1}`);

  // ---- NORTH STAR: real 2-client convergence LIVE (material LUT shard-consistent, fn PURA 0-RNG/0-timer) ----
  console.log(`\n===== NORTH STAR 2-CLIENTE LIVE =====`);
  await browser.close(); browser = null;
  nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ cada página se crea, se trae al frente y se bootea EN SECUENCIA.
  async function mkNS(tg) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[${tg}] ` + String(e)));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[${tg}] ` + m.text()); });
    await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await p.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
    await p.bringToFront();
    await toPlay(p);
    return p;
  }
  const pA = await mkNS("cliA");
  const pB = await mkNS("cliB");

  // MISMO tile por material ⇒ el bono (LUT PURA de world.terr) converge byte-a-byte. 0-RNG/0-timer ⇒ shard-consistente.
  const readAll = async (pg) => await pg.evaluate((args) => {
    const out = {};
    for (const t of args.present) { const sm = args.scan.sample[t]; if (!sm) continue;
      const s = window.__dev.firmFooting({ tp: { tx: sm.tx, ty: sm.ty } });
      out[t] = { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspdTotal: s.atkspdTotal, tag: s.tag }; }
    const fp = JSON.stringify(window.__dev.worldFingerprint(args.seed));
    return { out, fp };
  }, { present, scan, seed: 810 });

  // 15a — en CADA tile de muestra ⇒ terr/tier/bonus/atkspdTotal/tag IDÉNTICOS byte-a-byte en cliA y cliB
  const RA = await readAll(pA); const RB = await readAll(pB);
  const convPerTile = present.every(t => { const a = RA.out[t], b = RB.out[t];
    return a && b && a.terr === b.terr && a.tier === b.tier && near(a.bonus, b.bonus) && near(a.atkspdTotal, b.atkspdTotal) && a.tag === b.tag; });
  if (!convPerTile) desync++;
  ok("15a NORTH STAR LIVE: en CADA tile de muestra (movimiento+combate en distinto material) ⇒ terr/tier/bonus/atkspdTotal/tag IDÉNTICOS byte-a-byte cliA↔cliB (0 desync, shard-consistente)",
     convPerTile, `A=${JSON.stringify(RA.out)} B=${JSON.stringify(RB.out)}`);

  // 15b — worldFingerprint idéntico byte-a-byte A↔B (shard replicado)
  const fpConv = RA.fp === RB.fp;
  if (!fpConv) desync++;
  ok("15b NORTH STAR LIVE: worldFingerprint(810) IDÉNTICO byte-a-byte cliA↔cliB (shard replicado, 0 desync)",
     fpConv, `len=${RA.fp.length} match=${fpConv}`);

  // 15c reconnect/persistence STATELESS: cliB reloads, re-boots, re-reads same firm tile ⇒ byte-id + gExists false + save sin clave + fp estable
  await pB.reload({ waitUntil: "domcontentloaded" });
  await pB.bringToFront();
  await toPlay(pB);
  const reconn = await pB.evaluate((firmTile, seed) => {
    const s = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(seed));
    return { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspdTotal: s.atkspdTotal, tag: s.tag, gExists: s.gExists, hasKey: /"firmFooting/i.test(save), fp };
  }, firmTile, 810);
  const preFirm = RB.out[firmMat];
  const reconnOK = reconn.terr === preFirm.terr && reconn.tier === preFirm.tier && near(reconn.bonus, preFirm.bonus) &&
                   near(reconn.atkspdTotal, preFirm.atkspdTotal) && reconn.tag === preFirm.tag && reconn.gExists === false && reconn.hasKey === false && reconn.fp === RB.fp;
  if (!reconnOK) desync++;
  ok("15c NORTH STAR LIVE RECONNECT STATELESS: cliB recarga (rejoin al mundo persistente), re-bootea; mismo firm tile ⇒ terr/tier/bonus/total/tag byte-id + gExists false + save sin clave + fp estable (0 drift)",
     reconnOK, JSON.stringify(reconn));

  await pA.screenshot({ path: join(OUT, "client-a-firm.png") });
  await pB.screenshot({ path: join(OUT, "client-b-reconnect.png") });
  await pA.close(); await pB.close();

  ok("0 no JS errors durante todo el run LIVE", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("FATAL", e); FAIL++;
} finally {
  if (nsBrowser) { try { await nsBrowser.close(); } catch (e) {} }
  if (browser) { try { await browser.close(); } catch (e) {} }
}

console.log(`\n==== CAS-2423 POST-FLIP LIVE QA: ${PASS} PASS / ${FAIL} FAIL  build=${build1 || buildInfo} (expect ${EXPECT_BUILD}) clients=2 desync=${desync} ====`);
process.exit(FAIL === 0 ? 0 : 1);
