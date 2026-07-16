// CAS-2419 — QA DARK 2-cliente (INDEP, QA-owned) for TERRENO FIRME / PISADA FIRME (FIRM_FOOTING.enabled:false), EVO mecánica #70 (CAS-2415).
// Oráculos RE-DERIVADOS desde primeros principios por QA (NO reusa la tabla EXPECT del selfverify de GE). Estructurado sobre las 6 aceptaciones DARK-gate del issue:
//   (1) Boot/load limpio, 0 errores JS consola.
//   (2) OFF byte-neutral: con enabled:false, heroAtkspd IDÉNTICO sobre terreno firme vs suelto (+0). Sin badge ⛰ (tag "").
//   (3) 0-regresión en las 11 flags LIVE del arco #59→#69 (served true); FIRM_FOOTING served false.
//   (4) North Star 2-cliente / 0-desync: 2 clientes MISMO shard, MISMO tile ⇒ world.terr/tier/atkspdTotal/worldFingerprint convergentes byte-a-byte. Reconnect STATELESS 0-drift (0 clave G.firmFooting*).
//   (5) Determinismo: firme→suelto→firme sin decay (⊥ temporal), tabla PURA por material.
//   (6) Perf budget (fps) con badge ON/OFF vía __dev.firmFooting.
//
// Independencia: material ids re-derivados de sim/config.js (grass0 dirt1 stone2 cobble3 sand4 water5 ice6 swamp7 caldera8 street9);
//   ATKSPD_TOTAL_CAP=130 y tabla de tiers (grass/dirt→+8, stone/cobble/street→+16, resto→0) re-derivadas del bloque FIRM_FOOTING de config; oráculo de share-cap re-implementado localmente (min(130, base+firm)).
// Observado vía __dev.firmFooting (scan/tp/terrProbe/capProbe/enabled) + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText.
// Run: node tools/cas2419-firmfooting-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2419-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── QA-independent oracle (re-derived from config, NOT imported from GE harness) ──
const CAP = 130;                               // ATKSPD_TOTAL_CAP (config.js:589)
const FIRM_MATS = new Set([0, 1, 2, 3, 9]);    // grass/dirt/stone/cobble/street → tier≥1
// pure re-derivation of tier bonus by material, from FIRM_FOOTING.tiers table in config
function oracleBonus(mat) {
  if (mat === 2 || mat === 3 || mat === 9) return { tier: 2, bonus: 16 }; // stone/cobble/street
  if (mat === 0 || mat === 1) return { tier: 1, bonus: 8 };               // grass/dirt
  return { tier: 0, bonus: 0 };                                          // sand/water/ice/swamp/caldera + unknown
}
const oracleCap = (base, firm) => Math.min(CAP, base + firm);
// full material domain 0..9 the QA oracle asserts against
const MAT_DOMAIN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALead";
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

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errA = [], errB = [];
try {
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  pageA.on("pageerror", (e) => errA.push(String(e)));
  pageA.on("console", (m) => { if (m.type() === "error") errA.push(m.text()); });
  await pageA.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(pageA);
  const build = await pageA.evaluate(() => window.__BUILD || null);

  // ═══ ACEPTACIÓN 1 — Boot/load limpio + hooks presentes ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.firmFooting && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("A1 boot limpio a 'play' + __dev.firmFooting/saveBlob/worldFingerprint + __BUILD, 0 err JS",
     hooks && errA.length === 0 && !!build, `build=${build} err=${errA.length}`);

  // fresh-boot DARK snapshot
  const dark = await pageA.evaluate(() => window.__dev.firmFooting());
  ok("A1b DARK fresh boot: enabled:false, channel atkspd, terr -1, tier 0, bonus 0, aporte 0, tag \"\"",
     dark.enabled === false && dark.channel === "atkspd" && dark.terr === -1 && dark.tier === 0 && dark.bonus === 0 && dark.atkspd === 0 && dark.tag === "",
     `enabled=${dark.enabled} terr=${dark.terr} tier=${dark.tier} bonus=${dark.bonus} atkspd=${dark.atkspd} tag="${dark.tag}"`);

  // scan world.terr (server-auth) → real sample tiles per material
  const scan = await pageA.evaluate(() => window.__dev.firmFooting({ scan: true }).scan);
  const present = Object.keys(scan.sample).map(Number).filter(t => t >= 0 && t <= 9).sort((a, b) => a - b);
  const firmMat = [2, 3, 9, 0, 1].find(t => scan.sample[t]);   // prefer T2 stone/cobble/street
  const looseMat = [4, 6, 7, 8, 5].find(t => scan.sample[t]);
  const firmTile = scan.sample[firmMat];
  const looseTile = looseMat != null ? scan.sample[looseMat] : null;
  ok("A1c world.terr poblado server-auth: ≥1 material firme y ≥1 suelto en el mapa (scan real)",
     firmTile != null && looseTile != null && present.length >= 2, `present=${JSON.stringify(present)} firmMat=${firmMat} looseMat=${looseMat}`);

  // ═══ ACEPTACIÓN 5 — Determinismo + tabla PURA por material (re-derivada por QA) ═══
  // 5a: terrProbe over full 0..9 domain matches QA oracle exactly
  const tab = await pageA.evaluate(() => { const o = {}; for (let t = 0; t <= 9; t++) o[t] = window.__dev.firmFooting({ terrProbe: { terr: t } }).probe; return o; });
  const tabOK = MAT_DOMAIN.every(m => { const e = oracleBonus(m); return tab[m] && tab[m].tier === e.tier && near(tab[m].bonus, e.bonus); });
  ok("A5a tabla PURA por material (oráculo QA re-derivado): grass/dirt→T1/+8, stone/cobble/street→T2/+16, sand/water/ice/swamp/caldera→T0/+0",
     tabOK, JSON.stringify(tab));

  // 5b: REAL server-auth read on every present sample tile matches the pure LUT (real-read == table)
  const realReads = await pageA.evaluate((present) => {
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ scan: true }).scan; const out = {};
    for (const t of present) { const sm = s.sample[t]; if (!sm) continue;
      const r = window.__dev.firmFooting({ tp: { tx: sm.tx, ty: sm.ty } });
      out[t] = { terr: r.terr, tier: r.tier, bonus: r.bonus, zone: r.hero && r.hero.zone }; }
    window.__dev.firmFooting({ enabled: false });
    return out;
  }, present);
  const realOK = present.every(t => { const e = oracleBonus(t); const r = realReads[t]; return r && r.terr === t && r.tier === e.tier && near(r.bonus, e.bonus); });
  const crossZone = new Set(present.map(t => realReads[t] && realReads[t].zone).filter(Boolean)).size >= 2;
  ok("A5b REAL server-auth: heroTerr lee world.terr en CADA tile de muestra ⇒ terr==material y bono==LUT; material CRUZA ≥2 zonas",
     realOK && crossZone, `zonas=${[...new Set(present.map(t => realReads[t] && realReads[t].zone))]} reads=${JSON.stringify(realReads)}`);

  // 5c: determinism — firm→loose→firm INSTANT, no decay (⊥ temporal), idempotent re-read
  const det = await pageA.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: true });
    const a = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const b = window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    const c = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const c2 = window.__dev.firmFooting();                       // idempotent re-read same tile
    window.__dev.firmFooting({ enabled: false });
    return { a: { tier: a.tier, bonus: a.bonus }, b: { tier: b.tier, bonus: b.bonus }, c: { tier: c.tier, bonus: c.bonus }, c2: { tier: c2.tier, bonus: c2.bonus } };
  }, firmTile, looseTile);
  const detOK = det.a.tier >= 1 && det.b.tier === 0 && det.c.tier === det.a.tier && det.c.bonus === det.a.bonus && det.c2.tier === det.c.tier && det.c2.bonus === det.c.bonus;
  ok("A5c DETERMINISMO: firme→suelto→firme sigue el material AL INSTANTE (sin decay ⊥ temporal); re-lectura idempotente",
     detOK, JSON.stringify(det));

  // ═══ ACEPTACIÓN 2 — OFF byte-neutral: heroAtkspd firme == suelto == baseline; sin badge ⛰ ═══
  const neutral = await pageA.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: false, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const offFirm = window.__dev.firmFooting();
    window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    const offLoose = window.__dev.firmFooting();
    return { firmAtk: offFirm.atkspd, firmTotal: offFirm.atkspdTotal, firmTag: offFirm.tag,
             looseAtk: offLoose.atkspd, looseTotal: offLoose.atkspdTotal, looseTag: offLoose.tag };
  }, firmTile, looseTile);
  const neutOK = neutral.firmAtk === 0 && neutral.looseAtk === 0 && near(neutral.firmTotal, neutral.looseTotal) && neutral.firmTag === "" && neutral.looseTag === "";
  ok("A2 OFF BYTE-NEUTRAL: heroAtkspd(firme)==heroAtkspd(suelto), aporte 0 en ambos, tag \"\" (sin badge ⛰) ⇒ el terreno no toca atkspd con OFF",
     neutOK, JSON.stringify(neutral));

  // A2b: ON firm ⇒ aporte == oracle bonus, heroAtkspd sube exactamente ese bono (bajo cap); ON loose ⇒ 0. SHARE-CAP global re-derivado.
  const sink = await pageA.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: false, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const baseFirm = window.__dev.firmFooting().atkspdTotal;
    const onFirm = window.__dev.firmFooting({ enabled: true });
    window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
    const onLoose = window.__dev.firmFooting();
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const hi = window.__dev.firmFooting({ capProbe: { base: 120 } }).capped;   // 120+firm ⇒ clamp 130
    const mid = window.__dev.firmFooting({ capProbe: { base: 100 } }).capped;  // 100+firm ⇒ ≤cap
    const lo = window.__dev.firmFooting({ capProbe: { base: 0 } }).capped;     // 0+firm ⇒ firm
    window.__dev.firmFooting({ enabled: false });
    return { baseFirm, onFirmAtk: onFirm.atkspd, onFirmTotal: onFirm.atkspdTotal, onLooseAtk: onLoose.atkspd, hi, mid, lo };
  }, firmTile, looseTile);
  const eFirm = oracleBonus(firmMat).bonus;
  const delta = sink.onFirmTotal - sink.baseFirm;
  const capOK = sink.hi.combined === oracleCap(120, eFirm) && sink.hi.combined === 130 && near(sink.mid.combined, oracleCap(100, eFirm)) && near(sink.lo.combined, eFirm) && sink.lo.firmFooting <= 16;
  const sinkOK = sink.onFirmAtk === eFirm && (near(delta, eFirm) || sink.onFirmTotal === 130) && sink.onLooseAtk === 0 && capOK;
  ok("A2b SINK+SHARE-CAP (oráculo QA): ON firme aporte==bono/heroAtkspd sube ese bono; ON suelto 0; min(130,base+firm) ⇒ 120+f=130(cede), 100+f≤cap, 0+f=f",
     sinkOK, `firmMat=${firmMat} bonoEsperado=${eFirm} delta=${delta} ${JSON.stringify(sink)}`);

  // ═══ ACEPTACIÓN 4 (parte reconnect/stateless) — save sin clave + G.firmFooting nunca creado + fingerprint estable ═══
  const saveOff = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("A4a STATELESS: saveBlob() SIN clave firmFooting* (estado 100% derivado, 0 persistencia nueva)",
     !/"firmFooting/i.test(saveOff), `saveLen=${saveOff.length}`);
  const gExistsAfterToggle = await pageA.evaluate((firmTile) => {
    window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    window.__dev.firmFooting();
    const g1 = window.__dev.firmFooting().gExists;
    window.__dev.firmFooting({ enabled: false });
    return { g1, g2: window.__dev.firmFooting().gExists };
  }, firmTile);
  ok("A4b STATELESS: G.firmFooting NUNCA se crea (gExists false aún tras enable+tp+re-lecturas)",
     gExistsAfterToggle.g1 === false && gExistsAfterToggle.g2 === false, JSON.stringify(gExistsAfterToggle));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => window.__dev.firmFooting({ enabled: true }));
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => window.__dev.firmFooting({ enabled: false }));
  ok("A4c worldFingerprint byte-estable a través del toggle enabled (atkspd NO entra al fingerprint; 0 RNG drift)",
     fpBefore === fpAfter, `stable=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // ═══ ACEPTACIÓN 3 — 0-regresión 11 flags arco #59→#69 served true; FIRM_FOOTING served false ═══
  const cfgSrc = await pageA.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  ok("A3 0-REGRESIÓN: 11 flags LIVE del arco #59→#69 served enabled:true; FIRM_FOOTING served false (DARK #70)",
     arcAllOn && flag("FIRM_FOOTING") === "false" && arc.length === 11, `FIRM_FOOTING=${flag("FIRM_FOOTING")} arc=${JSON.stringify(arcLive)}`);

  // ═══ ACEPTACIÓN 6 — Perf budget: badge ON+firme dibuja / OFF no; fps sano ═══
  const badge = await pageA.evaluate(async (firmTile) => {
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
    return { onCnt, offCnt, fpsOn };
  }, firmTile);
  ok("A6 PERF/badge: \"Terreno:\" DIBUJA ON+firme (count>0) y NO OFF (count 0); fps sano (≥50)",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fpsOn >= 50, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fpsOn}`);

  // screenshot evidence (ON + firm)
  await pageA.evaluate((firmTile) => window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } }), firmTile);
  await sleep(300);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });
  await pageA.evaluate(() => window.__dev.firmFooting({ enabled: false }));

  // ═══ ACEPTACIÓN 4 — North Star 2-cliente / 0-desync (segundo cliente, mismo shard) ═══
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);

  // converge on EVERY present sample tile, not just one — byte-a-byte per material
  const readAll = async (pg) => await pg.evaluate((present, scan) => {
    window.__dev.firmFooting({ enabled: true });
    const out = {};
    for (const t of present) { const sm = scan.sample[t]; if (!sm) continue;
      const s = window.__dev.firmFooting({ tp: { tx: sm.tx, ty: sm.ty } });
      out[t] = { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspdTotal: s.atkspdTotal, tag: s.tag }; }
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.firmFooting({ enabled: false });
    return { out, fp };
  }, present, scan);
  const RA = await readAll(pageA);
  const RB = await readAll(pageB);
  const convPerTile = present.every(t => {
    const a = RA.out[t], b = RB.out[t];
    return a && b && a.terr === b.terr && a.tier === b.tier && near(a.bonus, b.bonus) && near(a.atkspdTotal, b.atkspdTotal) && a.tag === b.tag;
  });
  const fpConv = RA.fp === RB.fp;
  ok("A4d NORTH STAR 2-CLIENTE: en CADA tile de muestra ⇒ terr/tier/bonus/atkspdTotal/tag IDÉNTICOS A↔B (0 desync)",
     convPerTile, `A=${JSON.stringify(RA.out)} B=${JSON.stringify(RB.out)}`);
  ok("A4e NORTH STAR 2-CLIENTE: worldFingerprint(393) IDÉNTICO byte-a-byte A↔B (shard replicado)",
     fpConv, `len=${RA.fp.length} match=${fpConv}`);

  // reconnect STATELESS 0-drift: reload B, re-read same firm tile ⇒ identical + gExists false + no save key
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const reconn = await pageB.evaluate((firmTile) => {
    const s = window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const g = s.gExists; const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.firmFooting({ enabled: false });
    return { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspdTotal: s.atkspdTotal, tag: s.tag, gExists: g, hasKey: /"firmFooting/i.test(save), fp };
  }, firmTile);
  const preFirm = RB.out[firmMat];
  const reconnOK = reconn.terr === preFirm.terr && reconn.tier === preFirm.tier && near(reconn.bonus, preFirm.bonus) &&
                   near(reconn.atkspdTotal, preFirm.atkspdTotal) && reconn.tag === preFirm.tag && reconn.gExists === false && reconn.hasKey === false && reconn.fp === RB.fp;
  ok("A4f RECONNECT STATELESS 0-drift: tras reload, mismo firm tile ⇒ terr/tier/bonus/total/tag idénticos + gExists false + save sin clave + fp estable",
     reconnOK, JSON.stringify(reconn));

  // ═══ 0 — sin errores JS en toda la corrida ═══
  ok("0 sin errores JS en toda la corrida (cliente A + cliente B)",
     errA.length === 0 && errB.length === 0, `A=${errA.length} B=${errB.length} ${errA.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (build DARK, FIRM_FOOTING.enabled:false, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
