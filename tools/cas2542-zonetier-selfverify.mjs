// CAS-2542 — self-verify for REMATE EN ZONA PELIGROSA (DARK, ZONETIER_SURGE.enabled:false). EVO mecánica #91 (serializa tras #90 HEADING_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 32 LIVE #59-#90.
// (A) EJE FRESCO = DIFICULTAD/TIER DE LA ZONA GEOGRÁFICA server-auth DONDE MUERE EL MOB (banda de nivel del ÁREA del kill: zona endgame/peligrosa vs zona inicial). server-auth, MMORPG-native (rematar en tierra profunda/hostil rinde fichas de frontera).
//     PRE-FLIGHT GATE PASA: EXISTE una propiedad GEOGRÁFICA server-auth DETERMINISTA por posición — zoneOf(world,x,y) resuelve la zona por CONTENCIÓN DE RECTÁNGULO del mundo (sim/world.js:607; town/forest/ruins/caves/arena/swamp/abyss/caldera/frost/trial/field), y ZONE_TIER[zone].tier mapea cada zona a su BANDA de dificultad 1..7 (sim/config.js:620). El mundo se construye DETERMINISTA del mismo mapa/seed ⇒ los MISMOS rects ⇒ zoneOf da la MISMA zona para un (x,y) dado en N clientes; NO wall-clock, NO estado de cliente, NO RNG. NINGUNA de las 32 flags #59-#90 lo lee como eje de SCORE (ZONE_TIER sólo escala hp/dmg/spd/xp en applyZoneScale — nunca es una recompensa de kill; e.zoneTier se estampa al spawn para escalar adds, jamás puntúa).
//     tierWeight(e)=banda de zoneTierAt(e.x,e.y): z≥hiTier(4) ⇒ zona PELIGROSA/endgame (arena/swamp/abyss/caldera/frost/trial) ⇒ 2; z≥midTier(2) ⇒ zona INTERMEDIA (ruins/caves) ⇒ 1; z<midTier (forest tier-1/town/field) ⇒ 0. Se recomputa zoneOf EN LA POSICIÓN VIVA del mob al morir (⊥ el spawn-stamp e.zoneTier — puntúa por dónde MUERE, no dónde nació). El score del kill = tierWeight(víctima) muestreado en el TOP de killEnemy (_tierPre). La señal VIVA del badge = tierScore(hero)=MAX tierWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate/#89 interrupt/#90 embestida).
//     CRUX ⊥32 GEOGRÁFICO ESTÁTICO del terreno (banda de dificultad del ÁREA), NO conteo/densidad/geometría/estado.
//       ⊥ #72 ESCASEZ (escasez = AUSENCIA/CONTEO de mobs vivos [densidad TEMPORAL]; zone-tier = propiedad ESTÁTICA de DÓNDE, no de CUÁNTOS — MISMA tile puntúa igual con 1 o 5 mobs).
//       ⊥ #70 MATERIAL-TERRENO/FIRM_FOOTING (#70 = TIPO DE TILE bajo los pies [grass/stone/ice]; zone-tier NO lee el material del tile — lee zoneOf [contención de RECT], 2 tiles de material distinto en la MISMA zona ⇒ MISMO tier).
//       ⊥ #82 vorágine/MAELSTROM (#82 = zonas de negación de HECHIZO DINÁMICAS [G.fields, aparecen/expiran]; zone-tier = región de dificultad ESTÁTICA del mapa).
//       ⊥ #73 apex (apex = DISTANCIA a un jefe/campeón VIVO; zone-tier = dificultad del ÁREA, sin blanco ni distancia — un mob solo en el rincón del abismo puntúa 2 sin jefe cerca).
//       ⊥ #88 remate (DISTANCIA MAGNITUD hero↔víctima; zone-tier = en qué ZONA cae la víctima — a quemarropa en el abismo=2, de lejos en el prado=0, la distancia NO decide).
//       ⊥ #90 embestida (DIRECCIÓN de movimiento; zone-tier = geografía estática — MISMA tile puntúa igual cargando o huyendo).
//       ⊥ #87 manada (clustering mob↔mob), ⊥ #86 siega (FRACCIÓN DE VIDA), ⊥ #85 CC (e.stun/e.slowT), ⊥ #84 escaramuza (CLASE DE ALCANCE ESTÁTICA e.tpl.ranged), ⊥ #89 interrupt (ACCIÓN comprometida e.state windup/cast). NO velocidad/sigilo/clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = tierFind (fichas de frontera por rematar en una zona de alto tier — NINGUNA de las 32 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…reachFind #88, interruptFind #89, headingFind #90) está LLENA ⇒ pivota a una moneda FRESCA (h.tierBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio tierBountyCap, 0 doble-dip.
//
// ★ GEOGRAPHIC-crux (check 8): MISMO mob a la MISMA distancia del héroe (a quemarropa, dist≈0) — en una ZONA PELIGROSA (arena/abismo, tier≥hiTier) ⇒ weight 2; en la ZONA INICIAL (forest/town/field) ⇒ weight 0. MISMA geometría/distancia/estado, weight OPUESTO ⇒ zone-tier NO es re-mapeo de distancia (⊥#88) ni de dirección (⊥#90) ni de conteo (⊥#72). Y reach(#88) IGUAL para ambos (misma magnitud) ⇒ la ZONA decide, no la distancia.
// ★ REAL SERVER-AUTH (check 7): spawnTier inyecta un mob REAL al MISMO G.enemies en un tile REAL; tierProbe lee la zona/banda/peso REAL de su posición ⇒ zona peligrosa⇒2/intermedia⇒1/inicial⇒0 leídos de los MISMOS campos (zoneOf→ZONE_TIER.tier) que el seam usa con _tierPre.
// ★ DIFERENCIADOR/⊥ (check 9): un orco MELEE SANO SUELTO NO-CC'd OCIOSO en una ZONA PELIGROSA ⇒ tier T2 MIENTRAS escaramuza(#84)/manada(#87)/siega(#86)/control(#85)/interrupt(#89)/embestida(#90) lo IGNORAN (melee/suelto/sano/sin-CC/ocioso ⇒ sus probes 0), pese a estar in-radio.
// ★ CANAL (check 10): forageChargePreview = tierBonus(score). Mob en zona peligrosa ⇒ charge>0; zona inicial / sin mob ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(tierBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con ZONETIER_SURGE OFF, tierBonus(cualquier score)==0 y forageChargePreview==0 aun con un mob en zona peligrosa ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): tier (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de tier.
// ★ 0-REGRESIÓN (check 14): las 32 mecánicas del arco #59-#90 siguen served enabled:true; ZONETIER_SURGE served false (DARK #91).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob en el MISMO tile de zona peligrosa + héroe en el MISMO tile ⇒ score/tier/charge + tierProbe + LUT scoreProbe + zoneProbe (path GEOGRÁFICO) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). tierScore es función PURA de G.enemies+posiciones+rects-del-mundo(mismo seed) ⇒ shard-consistente.
//
// Observado vía __dev.zonetier (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + zoneProbe path-GEOGRÁFICO WORLD-DEPENDIENTE + spawnTier inyección REAL en tile + clearTier + tierProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Frontera:").
//
// Run: node tools/cas2542-zonetier-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2542");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// mapa banda→peso esperado (hiTier=4, midTier=2): band≥4⇒2, band∈{2,3}⇒1, band<2 (0/1)⇒0
const bandToW = (band) => (band >= 4 ? 2 : (band >= 2 ? 1 : 0));

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

// Descubre tiles REALES por categoría escaneando el mundo replicado vía zoneProbe (WORLD-DEPENDIENTE, mismo seed).
// Devuelve { initial:{tx,ty,zone,band}, mid:{...}, high:{...} } — un tile por banda (inicial band<2, media band∈{2,3}, peligrosa band≥4).
async function discoverTiles(page) {
  return await page.evaluate(() => {
    // Los biomas procedurales (forest/caves/ruins/arena/abyss/frost/trial/swamp) viven en las "old lands"
    // al SUR del continente Tiled (~tx 90..275, ty 640..805). Escaneo denso de ESA región (WORLD-DEP, mismo seed).
    let high = null, mid = null, initialForest = null, initialAny = null;
    for (let tx = 90; tx <= 275; tx += 2) {
      for (let ty = 640; ty <= 805; ty += 2) {
        const zp = window.__dev.zonetier({ zoneProbe: { tx, ty } }).zoneProbe;
        if (!zp) continue;
        const b = zp.band | 0, w = zp.weight | 0, rec = { tx, ty, zone: zp.zone, band: b, weight: w };
        if (w === 2 && !high) high = rec;
        else if (w === 1 && !mid) mid = rec;
        else if (w === 0) { if (b === 1 && !initialForest) initialForest = rec; if (!initialAny) initialAny = rec; }
      }
    }
    return { initial: initialForest || initialAny, mid, high };
  });
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.zonetier + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // discover real zone tiles (WORLD-DEPENDENT, same seed)
  const TILES = await discoverTiles(page);
  const tilesFound = TILES.initial && TILES.mid && TILES.high;
  ok("1b descubre tiles REALES por banda vía zoneProbe (WORLD-DEP, mismo seed): inicial(band<2)/media(2-3)/peligrosa(≥4)",
     tilesFound && TILES.initial.weight === 0 && TILES.mid.weight === 1 && TILES.high.weight === 2,
     JSON.stringify(TILES));

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.zonetier());
  ok("2 byte-id OFF (fresh boot): ZONETIER_SURGE.enabled false AND G.tierBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "tierFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" weights=${JSON.stringify(dark.weights)} hiTier=${dark.hiTier} midTier=${dark.midTier}`);

  // 3 save OFF has no tierFind/tierBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(tierFind|tierBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"tierBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'tierFind'/'tierBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.zonetier({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.zonetier({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.zonetier({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 zoneProbe: GEOGRAPHIC path zoneOf→ZONE_TIER.tier→tierWeight→forage (WORLD-DEPENDIENTE, el path que el seam usa con _tierPre)
  const gz = await page.evaluate((T) => { window.__dev.zonetier({ enabled: true });
    const rd = (t) => { const p = window.__dev.zonetier({ zoneProbe: { tx: t.tx, ty: t.ty } }).zoneProbe; return { zone: p.zone, band: p.band, weight: p.weight, forage: p.forage }; };
    const out = { initial: rd(T.initial), mid: rd(T.mid), high: rd(T.high) };
    window.__dev.zonetier({ enabled: false }); return out; }, TILES);
  const gzOK = gz.initial.weight === 0 && gz.initial.forage === 0 &&
    gz.mid.weight === bandToW(gz.mid.band) && gz.mid.weight === 1 && gz.mid.forage === 1 &&
    gz.high.weight === bandToW(gz.high.band) && gz.high.weight === 2 && gz.high.forage === 2;
  ok("6 zoneProbe path GEOGRÁFICO zoneOf→ZONE_TIER.tier→tierWeight→forage (WORLD-DEP): inicial⇒w0/f0; intermedia⇒w1/f1; peligrosa⇒w2/f2",
     gzOK, JSON.stringify(gz));

  // 7 ★ REAL SERVER-AUTH: spawnTier pushes a real mob to G.enemies at a real tile; tierProbe reads the REAL zone/band/weight. danger⇒2, mid⇒1, initial⇒0.
  const server7 = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    const out = {};
    for (const [kind, tile] of [["high", T.high], ["mid", T.mid], ["initial", T.initial]]) {
      window.__dev.zonetier({ clearTier: true });
      window.__dev.zonetier({ tp: { tx: tile.tx, ty: tile.ty } });                 // héroe al tile ⇒ el mob de prueba cae en su radio
      const st = window.__dev.zonetier({ spawnTier: { tx: tile.tx, ty: tile.ty } }).spawnTier;
      const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
      out[kind] = { stZone: st.zone, stBand: st.band, stW: st.weight, tpScore: tp.score, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "" };
    }
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return out;
  }, TILES);
  const s7OK = server7.high.stW === 2 && server7.high.tpScore === 2 && server7.high.tpW === 2 &&
    server7.mid.stW === 1 && server7.mid.tpScore === 1 && server7.mid.tpW === 1 &&
    server7.initial.stW === 0 && server7.initial.tpScore === 0 && server7.initial.tpW === 0;
  ok("7 ★ REAL SERVER-AUTH: spawnTier empuja un mob REAL a un tile REAL; tierProbe lee la zona/banda/peso REAL ⇒ peligrosa⇒2, intermedia⇒1, inicial⇒0",
     s7OK, JSON.stringify(server7));

  // 8 ★ GEOGRAPHIC-crux ⊥#88/#90/#72: MISMO mob a la MISMA distancia (a quemarropa, hero AT tile) — zona PELIGROSA ⇒ weight 2 / reach 0; zona INICIAL ⇒ weight 0 / reach 0 (misma distancia, weight OPUESTO ⇒ la ZONA decide, no la distancia).
  const crux = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    // (a) mob a quemarropa en zona PELIGROSA
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const aTp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const aReach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;
    // (b) MISMO mob (misma dist≈0) en zona INICIAL
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.initial.tx, ty: T.initial.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.initial.tx, ty: T.initial.ty } });
    const bTp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const bReach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { aW: aTp.score, aReach, bW: bTp.score, bReach };
  }, TILES);
  const cruxOK = crux.aW === 2 && crux.bW === 0 && crux.aReach === crux.bReach;   // zona diverge (2→0) MIENTRAS reach(#88) IGUAL (misma magnitud, a quemarropa)
  ok("8 ★ GEOGRAPHIC-crux ⊥#88/#90/#72: MISMO mob a MISMA distancia (a quemarropa) ⇒ zona PELIGROSA weight2 vs zona INICIAL weight0, MIENTRAS reach(#88) IGUAL ⇒ la ZONA decide, no la distancia/dirección/conteo",
     cruxOK, JSON.stringify(crux));

  // 9 ★ DIFFERENTIATOR/⊥ vs skirmish(#84)/pack(#87)/blood(#86)/control(#85)/interrupt(#89)/heading(#90): orco MELEE SANO SUELTO NO-CC'd OCIOSO en ZONA PELIGROSA ⇒ tier T2 MIENTRAS peers IGNORAN (delta 0 al añadir el mob).
  const diff = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intBefore = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const hedBefore = window.__dev.heading({ headProbe: true }).headProbe.score;
    // orco MELEE SANO SUELTO NO-CC'd OCIOSO en zona peligrosa: in-radio de todos los peers, pero melee/suelto/sano/sin-CC/ocioso ⇒ peers 0
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const vm = window.__dev.zonetier();
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intAfter = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const hedAfter = window.__dev.heading({ headProbe: true }).headProbe.score;
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter, intBefore, intAfter, hedBefore, hedAfter };
  }, TILES);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&                     // tier fires (mob en zona peligrosa)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                     // ★ escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore &&                     // siega #86 / control #85 IGNORAN
    diff.intAfter === diff.intBefore && diff.hedAfter === diff.hedBefore;                       // interrupt #89 / embestida #90 IGNORAN
  ok("9 ★ DIFERENCIADOR/⊥: orco MELEE SANO SUELTO NO-CC'd OCIOSO en ZONA PELIGROSA ⇒ tier T2 MIENTRAS escaramuza/manada/siega/control/interrupt/embestida IGNORAN (delta 0 al añadir el mob)",
     diffOK, JSON.stringify(diff));

  // 10 CANAL tierFind: forageChargePreview mob en zona peligrosa>0 ; zona inicial/no mob → 0
  const forage = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });   // zona peligrosa ⇒ score 2 ⇒ T2
    const actVm = window.__dev.zonetier();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.initial.tx, ty: T.initial.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.initial.tx, ty: T.initial.ty } });   // zona inicial ⇒ score 0
    const iniVm = window.__dev.zonetier();
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { actPrev, actCharge, iniPrev: iniVm.forageChargePreview, iniTier: iniVm.tier, iniScore: iniVm.score };
  }, TILES);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.iniPrev === 0 && forage.iniTier === 0 && forage.iniScore === 0;
  ok("10 CANAL tierFind: forageChargePreview con mob en zona peligrosa ⇒ charge>0 (==tierBonus); mob en zona inicial ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds tierBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.zonetier().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>tierBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a danger-zone mob available
  const neutral = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });   // mob en zona peligrosa disponible
    window.__dev.zonetier({ enabled: false });                                // now OFF
    const off = window.__dev.zonetier();
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, TILES);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, tierBonus(mob en zona peligrosa)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip zonetier OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de tier.
  const orth = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), itr: window.__dev.interrupt(), hed: window.__dev.heading(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.zonetier({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.zonetier();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.zonetier();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, TILES);
  ok("13 ★ ORTOGONALIDAD tierFind ⊥ peers: flip zonetier OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/longshot/interrupt/heading/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de tier; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 32 arc flags served true; ZONETIER_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ztDark = flag("ZONETIER_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 32 mecanismos del arco #59-#90 served enabled:true; ZONETIER_SURGE served false (DARK #91)",
     arcAllOn && ztDark && arc.length === 32, `zonetier=${flag("ZONETIER_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Frontera:" drawn ON+danger-zone mob / not OFF + fps.
  const badge = await page.evaluate(async (T) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Frontera:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });   // zona peligrosa ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, TILES);
  ok("15 render badge \"Frontera:\" se DIBUJA ON+mob en zona peligrosa (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((T) => { window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } }); window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } }); }, TILES);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const vm = window.__dev.zonetier();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const zp = window.__dev.zonetier({ zoneProbe: { tx: T.high.tx, ty: T.high.ty } }).zoneProbe;
    const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, tpCount: tp.count, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "", zpZone: zp.zone, zpBand: zp.band, zpW: zp.weight, lut, fp };
  }, TILES);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.tpCount === B.tpCount && A.tpW === B.tpW && A.tpZone === B.tpZone && A.zpZone === B.zpZone && A.zpBand === B.zpBand && A.zpW === B.zpW && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO mob en MISMO tile de zona peligrosa+héroe ⇒ score/tier/charge + tierProbe(score,count,weight,zone) + zoneProbe(zona,banda,peso) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},tpCount:${A.tpCount},tpW:${A.tpW},tpZone:${A.tpZone},zpZone:${A.zpZone},zpBand:${A.zpBand},zpW:${A.zpW},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},tpCount:${B.tpCount},tpW:${B.tpW},tpZone:${B.tpZone},zpZone:${B.zpZone},zpBand:${B.zpBand},zpW:${B.zpW},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.zonetier({ enabled: false }));
  await pageB.evaluate(() => window.__dev.zonetier({ enabled: false }));

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
