// CAS-2424 — POST-FLIP LIVE QA (INDEPENDENT, QA-owned b5c10283) for TERRENO FIRME / PISADA FIRME (FIRM_FOOTING.enabled:true). EVO mecánica #70, 2-cliente LIVE.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores),
// NO un mirror local ni el Higgsfield retirado. NO es copia del DARK (cas2419) ni del self-verify GE (cas2415):
//   oráculos RE-DERIVADOS del spec, reloj FRESCO QNOW distinto (9.870M), pids RE-ETIQUETADOS cliA/cliB, scaffolding LIVE (porté DARK cas2419 → LIVE cas2414).
// Aceptaciones del ticket CAS-2424:
//   (1) build servido = version.json = EXPECT 181a2d0e6980 (flip CAS-2420/2421) y AVANZÓ del pre-flip 22b67daa125e (LAST_STAND LIVE #69).
//   (2) DEFAULT-ON: FIRM_FOOTING served enabled:TRUE + eje ESPACIAL/MATERIAL-DE-TERRENO server-auth (world.terr del tile bajo el héroe;
//       LUT PURA: grass/dirt→T1/+8, stone/cobble/street→T2/+16, resto→T0/+0; 0-RNG/0-timer/STATELESS). North Star 0-desync 2-cliente byte-a-byte por material, cruza ≥6 zonas.
//   (3) canal FRESCO atkspd bajo ATKSPD_TOTAL_CAP=130 ⇒ SHARE-CAP min(130, base+firm) (0 doble-dip).
//   (4) 0-REGRESIÓN: 11 flags arco #59-#69 served enabled:true; FIRM_FOOTING #70 también true ⇒ arco+#70 completo; 0 err/404.
//   (5) RECONNECT STATELESS 0-drift (0 clave G.firmFooting*, save sin clave); badge ⛰ "Terreno:" dibuja el tier correcto por material.
//   (6) PASS/FAIL con build id + client count + desync count.
// Run: node tools/cas2424-firmfooting-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2424-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "181a2d0e6980";   // build deployado por el flip FIRM_FOOTING CAS-2420/2421 (== version.json esperado)
const PREFLIP = "22b67daa125e";        // build servido ANTES del flip (LAST_STAND LIVE #69 CAS-2413) — el LIVE debe AVANZAR de éste

// ── ORÁCULOS QA RE-DERIVADOS (re-implementación independiente del spec FIRM_FOOTING; NO importados de sim.js/config) ──
const CAP = 130;                               // ATKSPD_TOTAL_CAP
const FIRM_MATS = new Set([0, 1, 2, 3, 9]);    // grass/dirt/stone/cobble/street → tier≥1
function oracleBonus(mat) {                     // LUT pura por material, re-derivada de la tabla de tiers
  if (mat === 2 || mat === 3 || mat === 9) return { tier: 2, bonus: 16 }; // stone/cobble/street
  if (mat === 0 || mat === 1) return { tier: 1, bonus: 8 };               // grass/dirt
  return { tier: 0, bonus: 0 };                                          // sand/water/ice/swamp/caldera + unknown
}
const oracleCap = (base, firm) => Math.min(CAP, base + firm);
const MAT_DOMAIN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const QNOW = 9_870_000;   // reloj de pared QA FIJO — FRESCO (≠ DARK/LAST_STAND clocks). Eje FIRM_FOOTING es 0-timer/STATELESS; QNOW mantiene worldFingerprint estable.

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

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errA = [], errB = [], net404 = [];

async function boot(page, errBucket) {
  page.on("pageerror", (e) => errBucket.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errBucket.push(m.text()); });
  page.on("requestfailed", (rq) => { if (!isFaviconOnly(rq.url())) net404.push(rq.url()); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(rp.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  await page.bringToFront();
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await page.bringToFront(); await toPlay(page); }
}

try {
  // ═══ CLIENTE A ═══
  const pageA = await browser.newPage();
  await boot(pageA, errA);

  // ── ACEPTACIÓN 1 — build servido = EXPECT = version.json, AVANZÓ del pre-flip; boot limpio + hooks ──
  const build = await pageA.evaluate(() => window.__BUILD || null);
  const verBuild = await pageA.evaluate(async () => { try { const r = await fetch("version.json?cb=" + Date.now()); return (await r.json()).build; } catch (e) { return null; } });
  ok("A1 BUILD LIVE: __BUILD == version.json == EXPECT 181a2d0e6980 y AVANZÓ del pre-flip 22b67daa125e (LAST_STAND #69)",
     build === EXPECT_BUILD && verBuild === EXPECT_BUILD && build !== PREFLIP, `__BUILD=${build} version.json=${verBuild} EXPECT=${EXPECT_BUILD}`);

  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.firmFooting && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("A1b boot limpio a 'play' + __dev.firmFooting/saveBlob/worldFingerprint presentes, 0 err JS cliente A",
     hooks && errA.length === 0, `hooks=${hooks} errA=${errA.length}`);

  // fresh-boot LIVE snapshot — enabled:true (DEFAULT-ON)
  const on = await pageA.evaluate(() => window.__dev.firmFooting());
  ok("A1c DEFAULT-ON: FIRM_FOOTING enabled:TRUE servido, channel atkspd",
     on.enabled === true && on.channel === "atkspd", `enabled=${on.enabled} channel=${on.channel}`);

  // scan world.terr (server-auth) → tiles reales por material
  const scan = await pageA.evaluate(() => window.__dev.firmFooting({ scan: true }).scan);
  const present = Object.keys(scan.sample).map(Number).filter(t => t >= 0 && t <= 9).sort((a, b) => a - b);
  const firmMat = [2, 3, 9, 0, 1].find(t => scan.sample[t]);   // prefer T2 stone/cobble/street
  const looseMat = [4, 6, 7, 8, 5].find(t => scan.sample[t]);
  const firmTile = scan.sample[firmMat];
  const looseTile = looseMat != null ? scan.sample[looseMat] : null;
  ok("A1d world.terr poblado server-auth: ≥1 material firme y ≥1 suelto en el mapa (scan real LIVE)",
     firmTile != null && looseTile != null && present.length >= 2, `present=${JSON.stringify(present)} firmMat=${firmMat} looseMat=${looseMat}`);

  // ── ACEPTACIÓN 2 (tabla PURA) — terrProbe sobre dominio 0..9 == oráculo QA ──
  const tab = await pageA.evaluate(() => { const o = {}; for (let t = 0; t <= 9; t++) o[t] = window.__dev.firmFooting({ terrProbe: { terr: t } }).probe; return o; });
  const tabOK = MAT_DOMAIN.every(m => { const e = oracleBonus(m); return tab[m] && tab[m].tier === e.tier && near(tab[m].bonus, e.bonus); });
  ok("A2a TABLA PURA por material (oráculo QA re-derivado LIVE): grass/dirt→T1/+8, stone/cobble/street→T2/+16, sand/water/ice/swamp/caldera→T0/+0",
     tabOK, JSON.stringify(tab));

  // REAL server-auth read en CADA tile de muestra == LUT; material CRUZA ≥ zonas
  const realReads = await pageA.evaluate((present, scan) => {
    const out = {};
    for (const t of present) { const sm = scan.sample[t]; if (!sm) continue;
      const r = window.__dev.firmFooting({ tp: { tx: sm.tx, ty: sm.ty } });
      out[t] = { terr: r.terr, tier: r.tier, bonus: r.bonus, zone: r.hero && r.hero.zone }; }
    return out;
  }, present, scan);
  const realOK = present.every(t => { const e = oracleBonus(t); const r = realReads[t]; return r && r.terr === t && r.tier === e.tier && near(r.bonus, e.bonus); });
  const zones = [...new Set(present.map(t => realReads[t] && realReads[t].zone).filter(Boolean))];
  const crossZone = zones.length >= 2;
  ok("A2b REAL server-auth (LIVE): heroTerr lee world.terr en CADA tile ⇒ terr==material y bono==LUT; material CRUZA zonas",
     realOK && crossZone, `zonas(${zones.length})=${JSON.stringify(zones)} reads=${JSON.stringify(realReads)}`);

  // determinismo: firme→suelto→firme INSTANT sin decay (⊥ temporal), idempotente
  const det = await pageA.evaluate((firmTile, looseTile) => {
    const a = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const b = window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    const c = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const c2 = window.__dev.firmFooting();
    return { a: { tier: a.tier, bonus: a.bonus }, b: { tier: b.tier, bonus: b.bonus }, c: { tier: c.tier, bonus: c.bonus }, c2: { tier: c2.tier, bonus: c2.bonus } };
  }, firmTile, looseTile);
  const detOK = det.a.tier >= 1 && det.b.tier === 0 && det.c.tier === det.a.tier && det.c.bonus === det.a.bonus && det.c2.tier === det.c.tier && det.c2.bonus === det.c.bonus;
  ok("A2c DETERMINISMO (LIVE): firme→suelto→firme sigue el material AL INSTANTE (sin decay ⊥ temporal); re-lectura idempotente",
     detOK, JSON.stringify(det));

  // ── ACEPTACIÓN 3 — SHARE-CAP atkspd: min(130, base+firm) ──
  const sink = await pageA.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const onFirm = window.__dev.firmFooting();
    window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    const onLoose = window.__dev.firmFooting();
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const hi = window.__dev.firmFooting({ capProbe: { base: 120 } }).capped;   // 120+firm ⇒ clamp 130
    const mid = window.__dev.firmFooting({ capProbe: { base: 100 } }).capped;  // 100+firm ⇒ ≤cap
    const lo = window.__dev.firmFooting({ capProbe: { base: 0 } }).capped;     // 0+firm ⇒ firm
    return { onFirmAtk: onFirm.atkspd, onFirmTotal: onFirm.atkspdTotal, onLooseAtk: onLoose.atkspd, hi, mid, lo };
  }, firmTile, looseTile);
  const eFirm = oracleBonus(firmMat).bonus;
  const capOK = sink.hi.combined === oracleCap(120, eFirm) && sink.hi.combined === 130 && near(sink.mid.combined, oracleCap(100, eFirm)) && near(sink.lo.combined, eFirm) && sink.lo.firmFooting <= 16;
  const sinkOK = sink.onFirmAtk === eFirm && sink.onLooseAtk === 0 && capOK;
  ok("A3 SHARE-CAP (oráculo QA LIVE): ON firme aporte==bono; ON suelto 0; min(130,base+firm) ⇒ 120+f=130(cede), 100+f≤cap, 0+f=f (0 doble-dip)",
     sinkOK, `firmMat=${firmMat} bonoEsperado=${eFirm} ${JSON.stringify(sink)}`);

  // ── ACEPTACIÓN 4 — 0-regresión 11 flags arco #59→#69 served true; FIRM_FOOTING #70 served true ──
  const cfgSrc = await pageA.evaluate(async () => { const r = await fetch("sim/config.js?cb=" + Date.now()); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  ok("A4 0-REGRESIÓN LIVE: 11 flags arco #59→#69 served enabled:true; FIRM_FOOTING #70 served true ⇒ arco+#70 completo",
     arcAllOn && flag("FIRM_FOOTING") === "true" && arc.length === 11, `FIRM_FOOTING=${flag("FIRM_FOOTING")} arc=${JSON.stringify(arcLive)}`);

  // ── ACEPTACIÓN 5 (stateless) — save sin clave + G.firmFooting nunca creado + fingerprint estable ──
  const saveA = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("A5a STATELESS: saveBlob() SIN clave firmFooting* (estado 100% derivado)",
     !/"firmFooting/i.test(saveA), `saveLen=${saveA.length}`);
  const gExists = await pageA.evaluate((firmTile) => {
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    window.__dev.firmFooting();
    return window.__dev.firmFooting().gExists;
  }, firmTile);
  ok("A5b STATELESS: G.firmFooting NUNCA se crea (gExists false aún tras tp+re-lecturas)",
     gExists === false, `gExists=${gExists}`);

  // ── ACEPTACIÓN 6 — badge ⛰ "Terreno:" dibuja el tier correcto por material; fps sano ──
  const badge = await pageA.evaluate(async (firmTile, looseTile) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Terreno:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    cnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 900) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const firmCnt = cnt, fpsFirm = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { firmCnt, fpsFirm };
  }, firmTile, looseTile);
  ok("A6 BADGE/PERF (LIVE): \"Terreno:\" DIBUJA sobre firme (count>0); fps sano (≥50)",
     badge.firmCnt > 0 && badge.fpsFirm >= 50, `firmCnt=${badge.firmCnt} fps=${badge.fpsFirm}`);

  // screenshot evidence (ON + firm)
  await pageA.evaluate((firmTile) => window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } }), firmTile);
  await sleep(300);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ CLIENTE B — North Star 2-cliente / 0-desync ═══
  await sleep(500);
  const pageB = await browser.newPage();
  await boot(pageB, errB);
  await pageA.bringToFront();  // ambos activos; A re-front para evitar pause-on-blur en lecturas

  // converge en CADA tile de muestra — byte-a-byte por material
  const readAll = async (pg) => await pg.evaluate((present, scan) => {
    const out = {};
    for (const t of present) { const sm = scan.sample[t]; if (!sm) continue;
      const s = window.__dev.firmFooting({ tp: { tx: sm.tx, ty: sm.ty } });
      out[t] = { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspdTotal: s.atkspdTotal, tag: s.tag }; }
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { out, fp };
  }, present, scan);
  await pageA.bringToFront(); const RA = await readAll(pageA);
  await pageB.bringToFront(); const RB = await readAll(pageB);
  const convPerTile = present.every(t => {
    const a = RA.out[t], b = RB.out[t];
    return a && b && a.terr === b.terr && a.tier === b.tier && near(a.bonus, b.bonus) && near(a.atkspdTotal, b.atkspdTotal) && a.tag === b.tag;
  });
  const desyncTiles = present.filter(t => { const a = RA.out[t], b = RB.out[t]; return !(a && b && a.terr === b.terr && a.tier === b.tier && near(a.bonus, b.bonus) && near(a.atkspdTotal, b.atkspdTotal) && a.tag === b.tag); });
  ok("A7a NORTH STAR 2-CLIENTE LIVE: en CADA tile de muestra ⇒ terr/tier/bonus/atkspdTotal/tag IDÉNTICOS A↔B (0 desync)",
     convPerTile, `desyncTiles=${JSON.stringify(desyncTiles)} A=${JSON.stringify(RA.out)} B=${JSON.stringify(RB.out)}`);
  const fpConv = RA.fp === RB.fp;
  ok("A7b NORTH STAR 2-CLIENTE LIVE: worldFingerprint(393) IDÉNTICO byte-a-byte A↔B (shard replicado)",
     fpConv, `len=${RA.fp.length} match=${fpConv}`);

  await pageB.bringToFront();
  await pageB.screenshot({ path: join(OUT, "client-b-firm.png") });

  // reconnect STATELESS 0-drift: reload B, re-read mismo firm tile ⇒ idéntico + gExists false + save sin clave
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const reconn = await pageB.evaluate((firmTile) => {
    const s = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspdTotal: s.atkspdTotal, tag: s.tag, gExists: s.gExists, hasKey: /"firmFooting/i.test(save), fp };
  }, firmTile);
  const preFirm = RB.out[firmMat];
  const reconnOK = reconn.terr === preFirm.terr && reconn.tier === preFirm.tier && near(reconn.bonus, preFirm.bonus) &&
                   near(reconn.atkspdTotal, preFirm.atkspdTotal) && reconn.tag === preFirm.tag && reconn.gExists === false && reconn.hasKey === false && reconn.fp === RB.fp;
  ok("A7c RECONNECT STATELESS 0-drift (LIVE): tras reload, mismo firm tile ⇒ terr/tier/bonus/total/tag idénticos + gExists false + save sin clave + fp estable",
     reconnOK, JSON.stringify(reconn));

  // ── 0 — sin errores JS ni 404 (favicon excluido) en toda la corrida ──
  ok("A0 sin errores JS (cliente A + B) ni 404 no-favicon en toda la corrida LIVE",
     errA.length === 0 && errB.length === 0 && net404.length === 0, `errA=${errA.length} errB=${errB.length} 404=${net404.length} ${errA.concat(errB).concat(net404).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${EXPECT_BUILD}, FIRM_FOOTING.enabled:true, 2-cliente, clients=2, desync=0)`);
process.exit(FAIL === 0 ? 0 : 1);
