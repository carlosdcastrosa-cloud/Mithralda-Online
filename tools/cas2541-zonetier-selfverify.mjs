// CAS-2541 — self-verify for REMATE EN ZONA PELIGROSA (DARK, ZONETIER_SURGE.enabled:false). EVO mecánica #91 (serializa tras #90 HEADING_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 32 LIVE #59-#90.
// (A) EJE FRESCO = DIFICULTAD/TIER de la ZONA GEOGRÁFICA server-auth donde MUERE el mob (banda de nivel del ÁREA del kill: zona endgame/peligrosa vs zona inicial/segura). server-auth, MMORPG-native (recompensar despachar en tierra profunda/hostil).
//     PRE-FLIGHT GATE PASA: EXISTE una propiedad GEOGRÁFICA server-auth DETERMINISTA por posición — zoneOf(world,x,y) (world.js:607) resuelve la zona por CONTENCIÓN DE RECTÁNGULO del mundo (town/forest/ruins/caves/arena/swamp/abyss/caldera/frost/trial/field), y ZONE_TIER[zone].tier (config.js:620) mapea la BANDA 1..7 (forest1/ruins2/caves3/arena·swamp4/abyss·caldera5/frost6/trial7; town·field=0). Mismo mapa/seed ⇒ mismos rects ⇒ misma zona para un (x,y) en N clientes; NO wall-clock, NO estado de cliente, NO RNG. NINGUNA de las 32 flags #59-#90 lo lee como eje de SCORE (ZONE_TIER sólo escala hp/dmg/spd/xp en applyZoneScale sim.js:2299 — nunca recompensa de kill; e.zoneTier se estampa al spawn para escalar adds, jamás puntúa).
//     tierWeight(e)=banda de zoneTierAt(e.x,e.y)=ZONE_TIER[zoneOf(world,e.x,e.y)].tier: z≥hiTier(4) ⇒ zona peligrosa/endgame ⇒ 2; z≥midTier(2) ⇒ zona intermedia ⇒ 1; z<midTier (forest tier-1/town/field) ⇒ 0. Se recomputa zoneOf EN LA POSICIÓN VIVA del mob al morir (⊥ el spawn-stamp e.zoneTier — puntúa por dónde MUERE, no dónde nació). El score del kill = tierWeight(víctima) muestreado en el TOP de killEnemy (_tierPre). La señal VIVA del badge = tierScore(hero)=MAX tierWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate/#89 interrupt/#90 embestida).
//     CRUX ⊥32 GEOGRÁFICO ESTÁTICO del terreno (banda de dificultad del ÁREA): ⊥ #72 ESCASEZ (escasez = AUSENCIA/CONTEO de mobs vivos [densidad TEMPORAL]; zone-tier = propiedad ESTÁTICA de DÓNDE, no de CUÁNTOS — MISMA tile puntúa igual con 1 o 3 mobs). ⊥ #70 FIRM_FOOTING (TIPO DE TILE bajo los pies [grass/stone/ice]; zone-tier NO lee el material — lee zoneOf [rect]). ⊥ #82 vorágine (zonas de hechizo DINÁMICAS G.fields; zone-tier = región ESTÁTICA). ⊥ #73 apex (DISTANCIA a jefe VIVO; zone-tier = dificultad del ÁREA sin blanco). ⊥ #88 remate (DISTANCIA MAGNITUD hero↔víctima; zone-tier = en qué ZONA cae — a quemarropa en el abismo=2, de lejos en el prado=0). ⊥ #90 embestida (DIRECCIÓN de movimiento; zone-tier = geografía estática).
// (B) CANAL FRESCO = tierFind (fichas de frontera por rematar en una zona de alto tier — NINGUNA de las 32 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…reachFind #88, interruptFind #89, headingFind #90) está LLENA ⇒ pivota a una moneda FRESCA (h.tierBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio tierBountyCap, 0 doble-dip.
//
// ★ zoneProbe GEOGRÁFICO (check 6, WORLD-DEPENDIENTE): en el CENTRO de un tile REAL de cada zona ⇒ zoneOf→ZONE_TIER.tier→tierWeight — forest(t1)⇒0, ruins(t2)/caves(t3)⇒1, arena/swamp(t4)/abyss/caldera(t5)/frost(t6)/trial(t7)⇒2. Prueba los umbrales hiTier=4/midTier=2.
// ★ REAL SERVER-AUTH (check 7): spawnTier empuja un mob REAL al MISMO G.enemies en un tile de zona; tierProbe lee su peso REAL de la MISMA zoneOf ⇒ abyss⇒2/ruins⇒1/forest⇒0 leídos de la posición REAL del mob.
// ★ GEOGRÁFICO-crux (check 8) ⊥#88/#90/#72: mob a QUEMARROPA en el ABISMO ⇒ tier 2 MIENTRAS reach(#88)=0 (point-blank); MISMA tile puntúa igual con 1 o 3 mobs (⊥#72 conteo); MISMO tipo de mob en el PRADO ⇒ tier 0 (geografía, no geometría).
// ★ DIFERENCIADOR/⊥ (check 9): un orco MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en el ABISMO ⇒ tier T2 MIENTRAS escaramuza(#84)/manada(#87)/siega(#86)/control(#85)/interrupt(#89)/embestida(#90)/reach(#88) lo IGNORAN (melee/suelto/sano/sin-CC/ocioso/estacionario/point-blank ⇒ sus probes 0).
// ★ CANAL (check 10): forageChargePreview = tierBonus(score). Mob en zona peligrosa ⇒ charge>0; en prado / sin mob ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(tierBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con ZONETIER_SURGE OFF, tierBonus(cualquier score)==0 y forageChargePreview==0 aun con un mob en el abismo ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): zonetier (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de zonetier.
// ★ 0-REGRESIÓN (check 14): las 32 mecánicas del arco #59-#90 siguen served enabled:true; ZONETIER_SURGE served false (DARK #91).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob en el MISMO tile de abismo + héroe en el MISMO tile ⇒ score/tier/charge + tierProbe + zoneProbe(zonas) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). tierScore es función PURA de G.enemies+posiciones+rects del mundo ⇒ shard-consistente.
//
// Observado vía __dev.zonetier (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + zoneProbe path-geográfico WORLD-DEPENDIENTE + spawnTier inyección REAL + clearTier + tierProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Frontera:").
//
// Run: node tools/cas2541-zonetier-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2541");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// Tiles REALES por zona (descubiertos por scan del mundo determinista 760×908; el mundo se construye igual del mismo seed ⇒ estas tiles caen SIEMPRE en la misma zona).
const Z = { town:[363,270], forest:[192,723], ruins:[117,732], caves:[141,693], arena:[153,756], swamp:[240,729], abyss:[192,768], frost:[117,768], trial:[195,696] };
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// zoneProbe esperado por tile REAL: zona → banda → peso → forage. Cubre bandas 0..7 + los 3 buckets de peso + los umbrales hiTier=4/midTier=2.
const EXPECT_ZONE = [
  { tile: Z.town,   zone: "town",   band: 0, w: 0 },
  { tile: Z.forest, zone: "forest", band: 1, w: 0 },   // tier 1 < midTier 2 ⇒ 0
  { tile: Z.ruins,  zone: "ruins",  band: 2, w: 1 },   // tier 2 == midTier ⇒ 1
  { tile: Z.caves,  zone: "caves",  band: 3, w: 1 },   // tier 3 ⇒ 1
  { tile: Z.arena,  zone: "arena",  band: 4, w: 2 },   // tier 4 == hiTier ⇒ 2
  { tile: Z.swamp,  zone: "swamp",  band: 4, w: 2 },
  { tile: Z.abyss,  zone: "abyss",  band: 5, w: 2 },
  { tile: Z.frost,  zone: "frost",  band: 6, w: 2 },
  { tile: Z.trial,  zone: "trial",  band: 7, w: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.zonetier + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

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

  // 6 ★ zoneProbe GEOGRÁFICO (WORLD-DEPENDIENTE): zoneOf→ZONE_TIER.tier→tierWeight en un tile REAL de cada zona. forest(t1)⇒0, ruins(t2)/caves(t3)⇒1, arena/swamp(t4)/abyss/caldera(t5)/frost(t6)/trial(t7)⇒2.
  const zp = await page.evaluate((cases) => { window.__dev.zonetier({ enabled: true }); const out = cases.map(c => window.__dev.zonetier({ zoneProbe: { tx: c.tile[0], ty: c.tile[1] } }).zoneProbe); window.__dev.zonetier({ enabled: false }); return out; }, EXPECT_ZONE);
  const zpOK = EXPECT_ZONE.every((c, i) => zp[i] && zp[i].zone === c.zone && zp[i].band === c.band && zp[i].weight === c.w && zp[i].forage === c.w);
  ok("6 ★ zoneProbe GEOGRÁFICO (WORLD-DEP): forest(t1)⇒0; ruins(t2)/caves(t3)⇒1; arena/swamp(t4)/abyss/frost/trial⇒2 (umbrales hiTier=4/midTier=2)",
     zpOK, JSON.stringify(zp.map(x => ({ z: x.zone, b: x.band, w: x.weight, f: x.forage }))));

  // 7 ★ REAL SERVER-AUTH: spawnTier pushes a real mob to G.enemies at a zone tile; tierProbe reads the REAL weight from zoneOf. abyss⇒2, ruins⇒1, forest⇒0.
  const server7 = await page.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    const out = {};
    for (const [name, tile] of [["abyss", Z.abyss], ["ruins", Z.ruins], ["forest", Z.forest]]) {
      window.__dev.zonetier({ clearTier: true });
      window.__dev.zonetier({ tp: { tx: tile[0], ty: tile[1] } });
      const st = window.__dev.zonetier({ spawnTier: { tx: tile[0], ty: tile[1] } }).spawnTier;
      const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
      out[name] = { stZone: st.zone, stBand: st.band, stW: st.weight, tpScore: tp.score, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "" };
    }
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return out;
  }, Z);
  const s7OK = server7.abyss.stZone === "abyss" && server7.abyss.stW === 2 && server7.abyss.tpScore === 2 && server7.abyss.tpW === 2 &&
    server7.ruins.stZone === "ruins" && server7.ruins.stW === 1 && server7.ruins.tpScore === 1 &&
    server7.forest.stZone === "forest" && server7.forest.stW === 0 && server7.forest.tpScore === 0;
  ok("7 ★ REAL SERVER-AUTH: spawnTier empuja un mob REAL en un tile de zona; tierProbe lee el peso REAL de zoneOf ⇒ abyss⇒2, ruins⇒1, forest⇒0",
     s7OK, JSON.stringify(server7));

  // 8 ★ GEOGRÁFICO-crux ⊥#88/#90/#72: mob a QUEMARROPA en el ABISMO ⇒ tier 2 MIENTRAS reach(#88)=0 (point-blank); MISMA tile igual con 1 o 3 mobs (⊥#72); MISMO mob en el PRADO ⇒ tier 0 (geografía, no geometría/conteo).
  const crux = await page.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    // hero + mob a quemarropa en el ABISMO
    window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    const heroAbyss = window.__dev.zonetier().hero;
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });   // point-blank (misma tile del héroe)
    const tpAbyss = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const reachAbyss = window.__dev.longshot({ reachProbe: true }).reachProbe.score;   // point-blank ⇒ reach 0
    // ⊥#72 conteo: +2 mobs MISMA tile abismo ⇒ pesos SIN CAMBIO
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    const tp3 = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    window.__dev.zonetier({ clearTier: true });
    // MISMO tipo de mob en el PRADO (forest, tier 1) ⇒ tier 0
    window.__dev.zonetier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const heroForest = window.__dev.zonetier().hero;
    window.__dev.zonetier({ spawnTier: { tx: Z.forest[0], ty: Z.forest[1] } });
    const tpForest = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { abyssZone: heroAbyss.zone, abyssScore: tpAbyss.score, abyssW: tpAbyss.mobs[0] ? tpAbyss.mobs[0].weight : -1, reachAbyss,
      threeScore: tp3.score, threeCount: tp3.count, threeAllW2: tp3.mobs.every(m => m.weight === 2),
      forestZone: heroForest.zone, forestScore: tpForest.score, forestW: tpForest.mobs[0] ? tpForest.mobs[0].weight : -1 };
  }, Z);
  const cruxOK = crux.abyssZone === "abyss" && crux.abyssScore === 2 && crux.abyssW === 2 && crux.reachAbyss === 0 &&   // ⊥#88: pt-blank reach 0 pero zone-tier 2
    crux.threeScore === 2 && crux.threeCount === 3 && crux.threeAllW2 &&                                                // ⊥#72: conteo-independiente
    crux.forestZone === "forest" && crux.forestScore === 0 && crux.forestW === 0;                                       // geografía: prado 0
  ok("8 ★ GEOGRÁFICO-crux ⊥#88/#72: mob a QUEMARROPA en ABISMO ⇒ tier2 MIENTRAS reach(#88)=0; MISMA tile igual con 1 o 3 mobs (⊥#72); MISMO mob en PRADO ⇒ tier0 (geografía no geometría/conteo)",
     cruxOK, JSON.stringify(crux));

  // 9 ★ DIFFERENTIATOR/⊥ vs skirmish(#84)/pack(#87)/blood(#86)/control(#85)/interrupt(#89)/heading(#90): orco MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en el ABISMO ⇒ tier T2 MIENTRAS peers IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intBefore = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    // orco MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en el ABISMO: in-radio de todos los peers, pero melee/suelto/sano/sin-CC/ocioso/point-blank ⇒ peers 0
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    const vm = window.__dev.zonetier();
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intAfter = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;   // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                     // orco ocioso estacionario ⇒ 0
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter, intBefore, intAfter, reach, head };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&                        // zonetier fires (mob en abismo)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                        // escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore && diff.intAfter === diff.intBefore && // siega #86 / control #85 / interrupt #89 IGNORAN
    diff.reach === 0 && diff.head === 0;                                                           // reach #88 / embestida #90 IGNORAN (point-blank / estacionario)
  ok("9 ★ DIFERENCIADOR/⊥: orco MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en ABISMO ⇒ tier T2 MIENTRAS escaramuza/manada/siega/control/interrupt/reach/embestida IGNORAN",
     diffOK, JSON.stringify(diff));

  // 10 CANAL tierFind: forageChargePreview mob en abismo>0 ; en prado/no mob → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });   // abismo ⇒ score 2 ⇒ T2
    const actVm = window.__dev.zonetier();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.zonetier({ spawnTier: { tx: Z.forest[0], ty: Z.forest[1] } });   // prado ⇒ score 0
    const forVm = window.__dev.zonetier();
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { actPrev, actCharge, forPrev: forVm.forageChargePreview, forTier: forVm.tier, forScore: forVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.forPrev === 0 && forage.forTier === 0 && forage.forScore === 0;
  ok("10 CANAL tierFind: forageChargePreview con mob en abismo ⇒ charge>0 (==tierBonus); mob en prado ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds tierBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.zonetier().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>tierBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with an abyss mob available
  const neutral = await page.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });   // mob en abismo disponible
    window.__dev.zonetier({ enabled: false });                             // now OFF
    const off = window.__dev.zonetier();
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, tierBonus(mob en abismo)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip zonetier OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de zonetier.
  const orth = await page.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.zonetier({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
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
  }, Z);
  ok("13 ★ ORTOGONALIDAD tierFind ⊥ peers: flip zonetier OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/longshot/interrupt/heading/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de zonetier; ambos operables",
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

  // 15 render badge "Frontera:" drawn ON+abyss mob / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Frontera:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });   // abismo ⇒ T2
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
  }, Z);
  ok("15 render badge \"Frontera:\" se DIBUJA ON+mob en abismo (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } }); window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } }); }, Z);
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
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.zonetier({ spawnTier: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    const vm = window.__dev.zonetier();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const zones = [["forest", Z.forest], ["ruins", Z.ruins], ["arena", Z.arena], ["abyss", Z.abyss], ["trial", Z.trial]].map(([n, t]) => { const q = window.__dev.zonetier({ zoneProbe: { tx: t[0], ty: t[1] } }).zoneProbe; return { n, zone: q.zone, band: q.band, w: q.weight }; });
    const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, tpCount: tp.count, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "", lut, zones, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.tpCount === B.tpCount && A.tpW === B.tpW && A.tpZone === B.tpZone && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.zones) === JSON.stringify(B.zones) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO mob en abismo+héroe ⇒ score/tier/charge + tierProbe(score,count,weight,zone) + zoneProbe(5 zonas) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},tpCount:${A.tpCount},tpW:${A.tpW},tpZone:${A.tpZone},zones:${JSON.stringify(A.zones)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},tpCount:${B.tpCount},tpW:${B.tpW},tpZone:${B.tpZone},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
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
