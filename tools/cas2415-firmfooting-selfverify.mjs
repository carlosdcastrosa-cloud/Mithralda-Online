// CAS-2415 — self-verify for TERRENO FIRME / PISADA FIRME (DARK, FIRM_FOOTING.enabled:false). EVO mecánica #70 (serializa tras #69 LAST_STAND LIVE) — EJE FRESCO ESPACIAL + CANAL FRESCO, ⊥/DISTINTO a las 11 LIVE #59-#69.
// (A) EJE FRESCO = MATERIAL DE TERRENO server-auth del tile bajo el héroe (world.terr). PRE-FLIGHT GATE: (1) elevación/HIGH_GROUND — NO existe estado de altura/z en el sim ⇒ DEAD-END descartado; (2) TERRAIN — world.terr SÍ existe
//     (poblado por buildWorld, LEÍDO en solidBlocked sim.js:2236, HASHEADO en worldFingerprint sim.js:13633) ⇒ ladder #2 elegida, flag renombrado a FIRM_FOOTING. Dimensión espacial FINA (material del tile), que CRUZA zonas
//     (⊥ gates de zona-región). PURO, 0-RNG, 0-timer, STATELESS. NO tiempo (⊥ Nocturne), NO clima (⊥ Tempest), NO tempo (⊥ Cadence), NO densidad-de-enemigos (⊥ LastStand), NO aliados (⊥ Kinship), NO profundidad (⊥ Delve), NO conocimiento (⊥ Erudition).
// (B) CANAL FRESCO = atkspd (velocidad de ataque — NINGUNA de las 11 flags lo usa). Entra al sink sumado heroAtkspd (CAS-197) bajo el TECHO GLOBAL ATKSPD_TOTAL_CAP=130 ⇒ SHARE-CAP/de-stack AUTOMÁTICO min(cap, base+firm), 0 doble-dip.
//
// ★ DIFERENCIADOR (check 7): el tier = función PURA del MATERIAL bajo el héroe. Teleportar firme→suelto→firme ⇒ el tier SIGUE al material AL INSTANTE (sin acumulación/decay ⊥ ejes temporales). El material CRUZA zonas.
// ★ REAL SERVER-AUTH (check 6): scan de world.terr + teleport a tiles de MUESTRA REALES ⇒ heroTerr lee el material auténtico y el tier concuerda con la LUT pura (real-read == tabla).
// ★ SHARE-CAP (check 9): atkspd EFECTIVA = min(ATKSPD_TOTAL_CAP=130, base + firmFooting). base120+firm16⇒130 (capado, cede); base100+16⇒116 (≤cap); base0+16⇒16. Sub-cap propio firmFootingCap=16.
// ★ BYTE-NEUTRAL OFF (check 10): con FIRM_FOOTING OFF, firmFootingAtkspd==0 y heroAtkspd == baseline EXACTO (mismo tile firme), esté sobre terreno firme o no ⇒ +0 al sink ⇒ byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): estar sobre terreno firme (bonus>0) NO cambia wardRegen/goldFind/critChance/xpGain/vamp/lootQuality; activar los otros arcos NO cambia el material/tier/bonus.
// ★ 0-REGRESIÓN (check 12): las 11 mecánicas del arco #59-#69 siguen served enabled:true; FIRM_FOOTING served false (DARK #70).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO tile ⇒ terr/tier/bonus/atkspdTotal/tag + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). El material es función PURA del tilemap replicado ⇒ shard-consistente.
//
// Observado vía __dev.firmFooting (flip enabled IN-MEMORY + tp teleport determinista al centro de un tile + terrProbe/capProbe puros + scan read-only de world.terr) + __dev.ward/kinship/focus/convoy/nocturne/fellowship/tempest (peer channels) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Terreno:").
//
// Checks:
//   1  boots to play, __dev.firmFooting + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): FIRM_FOOTING.enabled false AND G.firmFooting NUNCA se crea (gExists false); terr -1, tier 0, bonus 0, channel atkspd, tag "", aporte atkspd 0.
//   3  byte-id save OFF: saveBlob() SIN clave 'firmFooting' (estado 100% derivado, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; atkspd NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del MATERIAL: terrProbe(0..9): grass/dirt→T1/8, stone/cobble/street→T2/16, sand/water/ice/swamp/caldera→T0/0.
//   6  ★ REAL SERVER-AUTH: scan world.terr → teleport a tiles de muestra REALES ⇒ heroTerr==material y tier==LUT; ≥1 firme (T≥1) y ≥1 suelto (T0) observados.
//   7  ★ DIFERENCIADOR: teleport firme→suelto→firme ⇒ el tier SIGUE al material AL INSTANTE (sin decay ⊥ temporal); firme≠suelto.
//   8  SINK atkspd: ON sobre tile firme ⇒ firmFootingAtkspd==bono del tier y heroAtkspd sube exactamente ese bono (bajo cap) vs OFF; sobre tile suelto ⇒ aporte 0.
//   9  ★ SHARE-CAP GLOBAL: capProbe base120+firm16⇒130 (capado, cede); base100+16⇒116; base0+16⇒16; sub-cap firmFootingCap=16; heroAtkspd nunca > ATKSPD_TOTAL_CAP.
//  10  ★ BYTE-NEUTRAL OFF en el sink: con OFF, heroAtkspd(tile firme) == baseline EXACTO (firmFootingAtkspd 0), esté firme o no ⇒ 0 cambio de la ruta base.
//  11  ★ ORTOGONALIDAD atkspd ⊥ wardRegen/goldFind/critChance/xpGain/vamp/lootQuality: estar sobre firme NO cambia los peers; activar KINSHIP/CONVOY/NOCTURNE/FELLOWSHIP/TEMPEST NO cambia el material/tier/bonus.
//  12  ★ 0-REGRESIÓN: 11 mecanismos del arco #59-#69 served enabled:true; FIRM_FOOTING served false (DARK #70).
//  13  render badge "Terreno:" se DIBUJA ON+firme (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO tile ⇒ terr/tier/bonus/atkspdTotal/tag + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2415-firmfooting-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2415");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// material ids (mirror sim/config.js): grass0 dirt1 stone2 cobble3 sand4 water5 ice6 swamp7 caldera8 street9
const FIRM = new Set([0, 1, 2, 3, 9]);        // hierba/tierra/piedra/adoquín/calle → tier≥1
const EXPECT = { 0: { t: 1, b: 8 }, 1: { t: 1, b: 8 }, 2: { t: 2, b: 16 }, 3: { t: 2, b: 16 }, 9: { t: 2, b: 16 },
                 4: { t: 0, b: 0 }, 5: { t: 0, b: 0 }, 6: { t: 0, b: 0 }, 7: { t: 0, b: 0 }, 8: { t: 0, b: 0 } };

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

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.firmFooting && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.firmFooting + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.firmFooting());
  ok("2 byte-id OFF (fresh boot): FIRM_FOOTING.enabled false AND G.firmFooting NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.terr === -1 && dark.tier === 0 && dark.bonus === 0 && dark.atkspd === 0 && dark.channel === "atkspd" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} terr=${dark.terr} tier=${dark.tier} bonus=${dark.bonus} atkspd=${dark.atkspd} channel=${dark.channel} tag="${dark.tag}"`);

  // 3 save OFF has no 'firmFooting' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'firmFooting'/'firmFootingServer' key in save blob (estado 100% derivado)", !/"firmFooting(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.firmFooting({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.firmFooting({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; atkspd NO entra al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of material (terrProbe over 0..9)
  const tab = await page.evaluate(() => {
    const out = {};
    for (let t = 0; t <= 9; t++) out[t] = window.__dev.firmFooting({ terrProbe: { terr: t } }).probe;
    return out;
  });
  const tabOK = Object.keys(EXPECT).every(k => tab[k] && tab[k].tier === EXPECT[k].t && near(tab[k].bonus, EXPECT[k].b));
  ok("5 TABLA de tiers = función PURA del MATERIAL: grass/dirt→T1/8, stone/cobble/street→T2/16, arena/agua/hielo/pantano/caldera→T0/0", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH read: scan world.terr + teleport to real sample tiles
  const scan = await page.evaluate(() => window.__dev.firmFooting({ scan: true }).scan);
  const present = Object.keys(scan.sample).map(Number).filter(t => t >= 0 && t <= 9);
  const realReads = await page.evaluate((present) => {
    window.__dev.firmFooting({ enabled: true });
    const out = {};
    const s = window.__dev.firmFooting({ scan: true }).scan;
    for (const t of present) { const sm = s.sample[t]; if (!sm) continue;
      const r = window.__dev.firmFooting({ tp: { tx: sm.tx, ty: sm.ty } });
      out[t] = { terr: r.terr, tier: r.tier, bonus: r.bonus, zone: r.hero && r.hero.zone }; }
    window.__dev.firmFooting({ enabled: false });
    return out;
  }, present);
  const readsOK = present.every(t => realReads[t] && realReads[t].terr === t && realReads[t].tier === EXPECT[t].t && near(realReads[t].bonus, EXPECT[t].b));
  const sawFirm = present.some(t => FIRM.has(t) && realReads[t]);
  const sawLoose = present.some(t => !FIRM.has(t) && realReads[t]);
  ok("6 ★ REAL SERVER-AUTH: heroTerr lee world.terr REAL en tiles de muestra ⇒ terr==material y tier==LUT; ≥1 firme y ≥1 suelto observados",
     readsOK && sawFirm && sawLoose && present.length >= 2, `present=${JSON.stringify(present)} reads=${JSON.stringify(realReads)}`);

  // pick a firm (prefer stone/cobble/street) + a loose real tile for the axis/sink/orth/north-star checks
  const firmMat = [2, 3, 9, 0, 1].find(t => scan.sample[t]);
  const looseMat = [4, 6, 7, 8, 5].find(t => scan.sample[t]);
  const firmTile = scan.sample[firmMat], looseTile = looseMat != null ? scan.sample[looseMat] : null;

  // 7 ★ DIFERENCIADOR: tier follows material INSTANTLY (teleport firm→loose→firm)
  const diff = await page.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: true });
    const a = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });   // firme
    const b = looseTile ? window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } }) : null;  // suelto (instantáneo, sin decay)
    const c = window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });   // vuelve firme al instante
    window.__dev.firmFooting({ enabled: false });
    return { a: { tier: a.tier, terr: a.terr }, b: b ? { tier: b.tier, terr: b.terr } : null, c: { tier: c.tier, terr: c.terr } };
  }, firmTile, looseTile);
  const diffOK = diff.a.tier >= 1 && (!diff.b || diff.b.tier === 0) && diff.c.tier >= 1 && diff.a.tier === diff.c.tier;
  ok("7 ★ DIFERENCIADOR: el tier SIGUE al material AL INSTANTE (firme≥1 → suelto0 → firme≥1, sin decay ⊥ temporal); material≠", diffOK, JSON.stringify(diff));

  // 8 SINK atkspd: ON firm ⇒ firmFootingAtkspd==bonus + heroAtkspd sube exactamente ese bono vs OFF; loose ⇒ 0
  const sink = await page.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: false, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const baseFirm = window.__dev.firmFooting().atkspdTotal;                 // OFF baseline (mismo tile firme)
    const onFirm = window.__dev.firmFooting({ enabled: true });             // ON firme
    let onLoose = null;
    if (looseTile) onLoose = window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });   // ON suelto
    window.__dev.firmFooting({ enabled: false });
    return { baseFirm, onFirm: { atkspd: onFirm.atkspd, tier: onFirm.tier, total: onFirm.atkspdTotal, cap: onFirm.atkspdCap },
             onLoose: onLoose ? { atkspd: onLoose.atkspd, tier: onLoose.tier, total: onLoose.atkspdTotal } : null };
  }, firmTile, looseTile);
  const bonusFirm = EXPECT[firmMat].b;
  const sinkDelta = sink.onFirm.total - sink.baseFirm;
  const sinkOK = sink.onFirm.atkspd === bonusFirm && (near(sinkDelta, bonusFirm) || sink.onFirm.total === sink.onFirm.cap) && (!sink.onLoose || sink.onLoose.atkspd === 0);
  ok("8 SINK atkspd: ON firme ⇒ aporte==bono del tier + heroAtkspd sube ese bono (bajo cap) vs OFF; suelto ⇒ aporte 0",
     sinkOK, `firmMat=${firmMat} bonus=${bonusFirm} ${JSON.stringify(sink)} delta=${sinkDelta}`);

  // 9 ★ SHARE-CAP GLOBAL via capProbe (hero on firm T2 tile ⇒ firm=bonus)
  const cap = await page.evaluate((firmTile) => {
    window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const hi = window.__dev.firmFooting({ capProbe: { base: 120 } }).capped;   // 120 + firm ⇒ cap 130
    const mid = window.__dev.firmFooting({ capProbe: { base: 100 } }).capped;   // 100 + firm ⇒ ≤cap
    const lo = window.__dev.firmFooting({ capProbe: { base: 0 } }).capped;      // 0 + firm ⇒ firm
    window.__dev.firmFooting({ enabled: false });
    return { hi, mid, lo };
  }, firmTile);
  const capOK = cap.hi.combined === 130 && cap.hi.cap === 130 && near(cap.mid.combined, 100 + bonusFirm) && near(cap.lo.combined, bonusFirm) && cap.lo.firmFooting <= 16;
  ok("9 ★ SHARE-CAP GLOBAL: base120+firm⇒130 (capado, cede); base100+firm⇒≤cap; base0+firm⇒firm; sub-cap firmFootingCap=16",
     capOK, JSON.stringify(cap));

  // 10 ★ BYTE-NEUTRAL OFF at sink: OFF ⇒ heroAtkspd(firm) == baseline exact, firm or not
  const neutral = await page.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: false, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const offFirm = window.__dev.firmFooting();                             // OFF sobre firme
    const offFirm2 = window.__dev.firmFooting();                            // idempotente
    let offLoose = null;
    if (looseTile) { window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } }); offLoose = window.__dev.firmFooting(); }
    return { offFirmAtk: offFirm.atkspd, offFirmTotal: offFirm.atkspdTotal, offFirm2Total: offFirm2.atkspdTotal,
             offLooseAtk: offLoose ? offLoose.atkspd : 0, offLooseTotal: offLoose ? offLoose.atkspdTotal : offFirm.atkspdTotal };
  }, firmTile, looseTile);
  // OFF ⇒ aporte 0 siempre, y el total es el MISMO estés sobre firme o suelto (el terreno no toca la atkspd con OFF)
  const neutOK = neutral.offFirmAtk === 0 && neutral.offLooseAtk === 0 && neutral.offFirmTotal === neutral.offFirm2Total && neutral.offFirmTotal === neutral.offLooseTotal;
  ok("10 ★ BYTE-NEUTRAL OFF: aporte 0 + heroAtkspd(firme)==heroAtkspd(suelto)==baseline EXACTO ⇒ el terreno no toca atkspd con OFF (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTOGONALIDAD
  const orth = await page.evaluate((firmTile, looseTile) => {
    window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const on = window.__dev.firmFooting();
    const peersFirm = { ward: on.wardRegenBoost, gold: on.goldFindMul, crit: on.critChancePct, xp: on.xpGainMul, vamp: on.vampMul, loot: on.lootQualityFloor };
    let peersLoose = peersFirm;
    if (looseTile) { const l = window.__dev.firmFooting({ tp: { tx: looseTile.tx, ty: looseTile.ty } });
      peersLoose = { ward: l.wardRegenBoost, gold: l.goldFindMul, crit: l.critChancePct, xp: l.xpGainMul, vamp: l.vampMul, loot: l.lootQualityFloor }; }
    // firm bonus/tier unchanged by enabling another arc mechanic (nocturne channel is vamp, ⊥)
    window.__dev.firmFooting({ tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const beforeArc = window.__dev.firmFooting();
    window.__dev.nocturne && window.__dev.nocturne({ enabled: true });
    const afterArc = window.__dev.firmFooting();
    window.__dev.nocturne && window.__dev.nocturne({ enabled: false });
    window.__dev.firmFooting({ enabled: false });
    const peersUnchanged = JSON.stringify(peersFirm) === JSON.stringify(peersLoose);
    const firmUnchanged = beforeArc.tier === afterArc.tier && beforeArc.bonus === afterArc.bonus && beforeArc.atkspd === afterArc.atkspd;
    return { peersFirm, peersLoose, peersUnchanged, firmUnchanged };
  }, firmTile, looseTile);
  ok("11 ★ ORTOGONALIDAD atkspd ⊥ wardRegen/goldFind/critChance/xpGain/vamp/lootQuality: firme NO cambia peers; activar NOCTURNE NO cambia material/tier/bono",
     orth.peersUnchanged && orth.firmUnchanged, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 11 arc flags served true; FIRM_FOOTING served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ffDark = flag("FIRM_FOOTING") === "false";
  ok("12 ★ 0-REGRESIÓN: 11 mecanismos del arco #59-#69 served enabled:true; FIRM_FOOTING served false (DARK #70)",
     arcAllOn && ffDark && arc.length === 11, `firmFooting=${flag("FIRM_FOOTING")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Terreno:" drawn ON+firm / not OFF + fps
  const badge = await page.evaluate(async (firmTile) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Terreno:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.firmFooting({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, firmTile);
  ok("13 render badge \"Terreno:\" se DIBUJA ON+firme (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((firmTile) => { window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } }); }, firmTile);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.firmFooting({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence on the SAME tile
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((firmTile) => {
    const s = window.__dev.firmFooting({ enabled: true, tp: { tx: firmTile.tx, ty: firmTile.ty } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspdTotal: s.atkspdTotal, tag: s.tag, fp };
  }, firmTile);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.terr === B.terr && A.tier === B.tier && near(A.bonus, B.bonus) && near(A.atkspdTotal, B.atkspdTotal) && A.tag === B.tag && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO tile ⇒ terr/tier/bonus/atkspdTotal/tag + worldFingerprint IDÉNTICOS byte-a-byte (0 desync, shard-consistente)",
     conv, `A=${JSON.stringify(A)} B=${JSON.stringify(B)}`);
  await page.evaluate(() => window.__dev.firmFooting({ enabled: false }));
  await pageB.evaluate(() => window.__dev.firmFooting({ enabled: false }));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
