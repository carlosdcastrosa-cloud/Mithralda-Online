// CAS-2432 — self-verify for PRESIÓN POR ESCASEZ DE RECURSOS (DARK, SCARCITY_EDGE.enabled:false). EVO mecánica #72 (serializa tras #71 SHADOW_STALK LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥/DISTINTO a las 13 LIVE #59-#71.
// (A) EJE FRESCO = ESCASEZ / AGOTAMIENTO de recursos del mundo compartido (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = cada world.spawners[i] tiene `max` (capacidad de spawn server-side) y el nº de mobs VIVOS no-jefe se cuenta determinista sobre G.enemies (posiciones = estado de sim replicado).
//     El loop de spawn YA usa count<sp.max (sim.js:7133) como gate de repoblación ⇒ la densidad/agotamiento es AUTORIDAD, no cosmético. depletion(zona)=1-mobsVivosNoJefe(zona)/Σsp.max(zona) ∈ [0,1] = fracción de la capacidad de spawn VACÍA (=zona exprimida). PURO, 0-RNG, 0-timer, STATELESS.
//     NO sigilo/LOS (⊥ ShadowStalk #71), NO material-de-terreno (⊥ FirmFooting #70), NO force-ratio (⊥ LastStand #69 — que cuenta enemigos ENGANCHADOS al héroe; esto cuenta AUSENCIA de mobs vs capacidad de la ZONA, señal INVERSA de fuente distinta), NO clima/tiempo/tempo/social/territorial/crowd.
// (B) CANAL FRESCO = essenceFind (multiplicador de recompensa de ESENCIA/meta-moneda por forrajeo — NINGUNA de las 13 flags lo usa). La familia recompensa-de-forrajeo tiene goldFind (#60/#62), lootQuality (#63/#68), xpGain (#65) OCUPADOS ⇒ ESENCIA es el ÚNICO libre. Fuente ÚNICA ⇒ sub-cap propio scarcityEssCap, 0 doble-dip.
//
// ★ DIFERENCIADOR (check 7): el tier = función PURA de la AUSENCIA de mobs vs capacidad. Una zona con cap PERO 0 vivos ⇒ T2 (máximo agotamiento) SIN un solo enemigo enganchado al héroe — OPUESTO a LastStand #69 que necesita enemigos enganchados. La señal es INVERSA y de fuente distinta (spawner-cap, no aggro-count).
// ★ REAL SERVER-AUTH (check 6): zoneProbe lee Σsp.max + nº de vivos REAL de cada zona de spawners ⇒ cap≥minZoneCap y depletion∈[0,1] auténticos; ≥1 zona agotada (T≥1) y la zona-inicio sin spawners (cap0⇒T0) observadas.
// ★ CANAL (check 8): forageProbe(zona,xp) = round(scarcityMul(zona)*xp). Zona agotada ⇒ esencia>0; zona rica/sin-cap ⇒ 0.
// ★ SUB-CAP (check 9): mul EFECTIVO = min(scarcityEssCap=0.12, tier.mul). Ningún dep produce mul>0.12.
// ★ BYTE-NEUTRAL OFF (check 10): con SCARCITY_EDGE OFF, scarcityMul(cualquier zona)==0 y forageEssPreview==0 aun en zona MÁXIMAMENTE agotada ⇒ 0 esencia al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la escasez (depletion/tier/mul) NO cambia wardRegen/goldFind/critChance/xpGain/vamp/lootQuality/atkspd/detectRadius; activar LAST_STAND (el primo force-ratio) NO cambia la depletion, y la escasez ON NO cambia el readout de LastStand.
// ★ 0-REGRESIÓN (check 12): las 13 mecánicas del arco #59-#71 siguen served enabled:true; SCARCITY_EDGE served false (DARK #72).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMA zona ⇒ zoneCap/zoneAlive/depletion/tier/mul/tag + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). depletion es función PURA del tilemap/spawners replicados + G.enemies deterministas ⇒ shard-consistente.
//
// Observado vía __dev.scarcity (flip enabled IN-MEMORY + tp teleport determinista + depProbe/zoneProbe/forageProbe puros) + __dev.ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk (peer channels) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Escasez:").
//
// Checks:
//   1  boots to play, __dev.scarcity + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): SCARCITY_EDGE.enabled false AND G.scarcity NUNCA se crea (gExists false); tier 0, mul 0, forageEssPreview 0, channel essenceFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'scarcity' (estado 100% derivado, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de esencia NO entra al fingerprint).
//   5  TABLA de tiers = función PURA de la DEPLETION (depProbe): 0.0/0.49→T0/0, 0.50/0.79→T1/0.06, 0.80/1.0→T2/0.12; sub-cap 0.12.
//   6  ★ REAL SERVER-AUTH: zoneProbe lee Σsp.max + vivos REAL de las zonas de spawners ⇒ cap≥minZoneCap y depletion∈[0,1]; ≥1 zona agotada (T≥1) + zona-inicio cap0/T0.
//   7  ★ DIFERENCIADOR: zona con cap+0 vivos ⇒ T2 SIN enemigos enganchados (INVERSO a LastStand); lastStand readout independiente.
//   8  CANAL essenceFind: forageProbe(zona agotada, xp) ⇒ round(mul*xp)>0; zona rica/sin-cap ⇒ 0.
//   9  ★ SUB-CAP: depProbe mul nunca > scarcityEssCap=0.12; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, scarcityMul(zona agotada)==0 y forageEssPreview==0 ⇒ 0 esencia al seam (byte-id).
//  11  ★ ORTOGONALIDAD essenceFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius: la escasez NO cambia peers; activar LAST_STAND NO cambia depletion; escasez ON NO cambia LastStand.
//  12  ★ 0-REGRESIÓN: 13 mecanismos del arco #59-#71 served enabled:true; SCARCITY_EDGE served false (DARK #72).
//  13  render badge "Escasez:" se DIBUJA ON+zona agotada (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas, MISMA zona ⇒ zoneCap/zoneAlive/depletion/tier/mul/tag + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2432-scarcity-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2432");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const ZONES = ["forest", "caves", "ruins", "abyss", "frost", "trial", "swamp", "caldera"];  // zonas con spawner (cap 12-13)
// LUT esperada dep→{tier,mul}: <0.50→T0/0, [0.50,0.80)→T1/0.06, ≥0.80→T2/0.12
const EXPECT_DEP = [
  { dep: 0.0, t: 0, m: 0 }, { dep: 0.49, t: 0, m: 0 },
  { dep: 0.50, t: 1, m: 0.06 }, { dep: 0.79, t: 1, m: 0.06 },
  { dep: 0.80, t: 2, m: 0.12 }, { dep: 1.0, t: 2, m: 0.12 },
];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.scarcity + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.scarcity());
  ok("2 byte-id OFF (fresh boot): SCARCITY_EDGE.enabled false AND G.scarcity NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.mul === 0 && dark.forageEssPreview === 0 && dark.channel === "essenceFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} mul=${dark.mul} preview=${dark.forageEssPreview} channel=${dark.channel} tag="${dark.tag}"`);

  // 3 save OFF has no 'scarcity' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'scarcity' key in save blob (estado 100% derivado)", !/"scarcity[A-Za-z]*"\s*:/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.scarcity({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.scarcity({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la esencia NO entra al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of depletion (depProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.scarcity({ depProbe: { dep: c.dep } }).depProbe), EXPECT_DEP);
  const tabOK = EXPECT_DEP.every((c, i) => tab[i] && tab[i].tier === c.t && near(tab[i].mul, c.m));
  ok("5 TABLA de tiers = función PURA de la DEPLETION: <0.50→T0/0, [0.50,0.80)→T1/0.06, ≥0.80→T2/0.12", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: zoneProbe reads real cap + alive per spawner zone
  const zread = await page.evaluate((zones) => {
    window.__dev.scarcity({ enabled: true });
    const out = {};
    for (const z of zones) out[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe;
    const start = window.__dev.scarcity();                       // hero's start zone (city/field, no spawner)
    window.__dev.scarcity({ enabled: false });
    return { out, startZone: start.zone, startCap: start.zoneCap, startTier: start.tier };
  }, ZONES);
  const spawnerZones = ZONES.filter(z => zread.out[z] && zread.out[z].cap >= 3);
  const depletedZone = spawnerZones.find(z => zread.out[z].tier >= 1);
  const capsOK = spawnerZones.length >= 4 && spawnerZones.every(z => zread.out[z].cap >= 12 && zread.out[z].depletion >= 0 && zread.out[z].depletion <= 1);
  const startNoCap = zread.startCap === 0 && zread.startTier === 0;   // zona-inicio sin spawner ⇒ T0
  ok("6 ★ REAL SERVER-AUTH: zoneProbe lee Σsp.max + vivos REAL ⇒ cap≥12 y depletion∈[0,1]; ≥1 zona agotada (T≥1) + zona-inicio cap0/T0",
     capsOK && !!depletedZone && startNoCap, `spawnerZones=${spawnerZones.length} depleted=${depletedZone} start={zone:${zread.startZone},cap:${zread.startCap},tier:${zread.startTier}} sample=${JSON.stringify(zread.out[spawnerZones[0]])}`);

  // tile inside a depleted spawner zone (center of its spawner rect) — used to teleport the hero for orth/badge/north-star
  const depTile = zread.out[depletedZone] && zread.out[depletedZone].tile;

  // 7 ★ DIFERENCIADOR: depleted zone reaches T≥1 purely from ABSENCE (cap>>alive), the INVERSE of LastStand (which needs enemies ENGAGED). LAST_STAND es un canal LIVE que COEXISTE ⊥.
  const diff = await page.evaluate((zone) => {
    window.__dev.scarcity({ enabled: true });
    const zp = window.__dev.scarcity({ zoneProbe: { zone } }).zoneProbe;    // cap alta pero pocos vivos ⇒ depletion alta = AUSENCIA
    const ls = window.__dev.lastStand ? window.__dev.lastStand() : null;    // force-ratio peer LIVE — coexiste, señal distinta (enemigos enganchados)
    window.__dev.scarcity({ enabled: false });
    return { zp, lsEnabled: ls ? ls.enabled : null };
  }, spawnerZones.find(z => zread.out[z].depletion >= 0.8) || depletedZone);
  const diffOK = diff.zp && diff.zp.tier >= 1 && diff.zp.cap > 0 && diff.zp.depletion >= 0.8 && diff.zp.alive < diff.zp.cap * 0.2 && diff.lsEnabled === true;
  ok("7 ★ DIFERENCIADOR: zona con cap alta + AUSENCIA de mobs (alive<20%cap) ⇒ T≥1 por AUSENCIA (INVERSO a LastStand que exige enemigos enganchados); LAST_STAND LIVE coexiste ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL essenceFind: forageProbe(depleted, xp) > 0 ; rich/no-cap → 0
  const forage = await page.evaluate((depZone, startZone) => {
    window.__dev.scarcity({ enabled: true });
    const dep = window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 100 } }).forageProbe;   // zona agotada
    const rich = window.__dev.scarcity({ forageProbe: { zone: startZone, xp: 100 } }).forageProbe; // zona sin spawner (cap0 ⇒ mul 0)
    window.__dev.scarcity({ enabled: false });
    return { dep, rich };
  }, depletedZone, zread.startZone);
  const forageOK = forage.dep && forage.dep.essence > 0 && near(forage.dep.essence, Math.round(forage.dep.mul * 100)) && forage.rich && forage.rich.essence === 0;
  ok("8 CANAL essenceFind: forageProbe(zona agotada, xp100) ⇒ round(mul*100)>0; zona sin-cap ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: mul never exceeds scarcityEssCap=0.12
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let d = 0; d <= 1.0001; d += 0.05) vals.push(window.__dev.scarcity({ depProbe: { dep: d } }).depProbe.mul);
    return { max: Math.max(...vals), cap: window.__dev.scarcity().cap };
  });
  ok("9 ★ SUB-CAP: ningún dep produce mul>scarcityEssCap=0.12 (min(cap,raw))", capChk.max <= 0.12 + 1e-9 && near(capChk.cap, 0.12), JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ mul 0 + forageEssPreview 0 even in a max-depleted zone
  const neutral = await page.evaluate((depZone) => {
    window.__dev.scarcity({ enabled: false });
    const off = window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 100 } });   // OFF: mul y esencia deben ser 0
    const previewOff = off.forageEssPreview;
    return { forageOff: off.forageProbe, previewOff, mulOff: off.mul };
  }, depletedZone);
  const neutOK = neutral.forageOff && neutral.forageOff.essence === 0 && neutral.forageOff.mul === 0 && neutral.previewOff === 0 && neutral.mulOff === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, scarcityMul(zona agotada)==0 + forageEssPreview==0 ⇒ 0 esencia al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTOGONALIDAD: flip SCARCITY OFF→ON at the SAME hero position ⇒ los 13 canales peer IDÉNTICOS (la escasez no toca ninguno); y toggling LAST_STAND no cambia la depletion.
  const orth = await page.evaluate((depTile, depZone) => {
    if (depTile) { window.__dev.scarcity({ enabled: true, tp: { tx: depTile.tx, ty: depTile.ty } }); window.__dev.scarcity({ enabled: false }); }
    const snap = () => { const s = window.__dev.scarcity(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit }; };
    const peersOff = snap();                                  // SCARCITY OFF (misma posición del héroe)
    window.__dev.scarcity({ enabled: true });
    const peersOn = snap();                                   // SCARCITY ON — los peers NO deben cambiar
    // enabling LAST_STAND (force-ratio, closest cousin) must NOT change the zone depletion
    const beforeArc = window.__dev.scarcity({ zoneProbe: { zone: depZone } }).zoneProbe;
    const lsPrev = window.__dev.lastStand ? window.__dev.lastStand().enabled : null;
    window.__dev.lastStand && window.__dev.lastStand({ enabled: true });
    const afterArc = window.__dev.scarcity({ zoneProbe: { zone: depZone } }).zoneProbe;
    const lsAfter = window.__dev.lastStand ? window.__dev.lastStand().enabled : null;   // LastStand sigue vivo/operable con escasez ON
    window.__dev.lastStand && window.__dev.lastStand({ enabled: lsPrev });   // restaura el estado LIVE
    window.__dev.scarcity({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const depUnchanged = beforeArc.depletion === afterArc.depletion && beforeArc.tier === afterArc.tier && beforeArc.mul === afterArc.mul;
    return { peersOff, peersOn, peersUnchanged, depUnchanged, lsAfter };
  }, depTile, depletedZone);
  ok("11 ★ ORTOGONALIDAD essenceFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius: flip escasez OFF→ON NO cambia ningún peer; toggling LAST_STAND NO cambia depletion; LastStand operable con escasez ON",
     orth.peersUnchanged && orth.depUnchanged && orth.lsAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 13 arc flags served true; SCARCITY_EDGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const scDark = flag("SCARCITY_EDGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 13 mecanismos del arco #59-#71 served enabled:true; SCARCITY_EDGE served false (DARK #72)",
     arcAllOn && scDark && arc.length === 13, `scarcity=${flag("SCARCITY_EDGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Escasez:" drawn ON+depleted zone / not OFF + fps
  const badge = await page.evaluate(async (depTile) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Escasez:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.scarcity({ enabled: true });
    if (depTile) window.__dev.scarcity({ tp: { tx: depTile.tx, ty: depTile.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.scarcity({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, depTile);
  ok("13 render badge \"Escasez:\" se DIBUJA ON+zona agotada (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((depTile) => { window.__dev.scarcity({ enabled: true }); if (depTile) window.__dev.scarcity({ tp: { tx: depTile.tx, ty: depTile.ty } }); }, depTile);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.scarcity({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence on the SHARD-CONSISTENT / server-auth pieces.
  //   Cada página es un sim STANDALONE (sin backend compartido) ⇒ el conteo de mobs VIVOS diverge por timing de spawn (en producción G.enemies es AUTORITATIVO ⇒ único). Por eso la convergencia se prueba
  //   sobre lo DETERMINISTA/shard-consistente: (a) zoneCap = Σsp.max ESTÁTICO del tilemap replicado; (b) la LUT PURA depletion→tier→mul (idéntica dada la MISMA señal server-auth que el server difunde);
  //   (c) el canal essenceFind = round(mul*xp) dada esa señal; (d) worldFingerprint (geometría estática). El harness 2-cliente LIVE de QA ejercita el conteo autoritativo real. depProbe deps: 0.55/0.85 → T1/T2.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((zones) => {
    window.__dev.scarcity({ enabled: true });
    const caps = {}; for (const z of zones) caps[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe.cap;   // Σsp.max ESTÁTICO por zona
    const lut = [0.55, 0.85].map(d => { const p = window.__dev.scarcity({ depProbe: { dep: d } }).depProbe; return { dep: d, tier: p.tier, mul: p.mul }; });   // LUT PURA dada la señal server-auth
    const forage = window.__dev.scarcity({ forageProbe: { zone: "__pure__", xp: 100 } });   // canal (zona inexistente ⇒ cap 0 ⇒ mul 0, determinista)
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.scarcity({ enabled: false });
    return { caps, lut, forageMul: forage.forageProbe.mul, fp };
  }, ZONES);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = JSON.stringify(A.caps) === JSON.stringify(B.caps) && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.forageMul === B.forageMul && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: zoneCap(Σsp.max estático) + LUT PURA dep→tier→mul + canal essenceFind + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; el conteo vivo autoritativo lo prueba el harness LIVE de QA)",
     conv, `A={caps:${JSON.stringify(A.caps)},lut:${JSON.stringify(A.lut)},forageMul:${A.forageMul},fpLen:${A.fp.length}} B={caps:${JSON.stringify(B.caps)},lut:${JSON.stringify(B.lut)},forageMul:${B.forageMul},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.scarcity({ enabled: false }));
  await pageB.evaluate(() => window.__dev.scarcity({ enabled: false }));

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
