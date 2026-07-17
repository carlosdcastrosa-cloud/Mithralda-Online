// CAS-2521 — self-verify for SIEGA DE MANADA (DARK, PACKHARVEST_SURGE.enabled:false). EVO mecánica #87 (serializa tras #86 BLOODHARVEST_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 28 LIVE #59-#86.
// (A) EJE FRESCO = COHESIÓN/EMPAQUETAMIENTO INTER-MOB (clustering mob↔mob: nº de OTROS mobs VIVOS en la vecindad LOCAL cohesionR de CADA mob) en la vecindad del héroe (server-auth, MMORPG-native). PRE-FLIGHT GATE: el eje RECOMENDADO del issue (LONGEVIDAD/EDAD del mob, tiempo-vivo server-auth `edad = tickActual − e.spawnT`) FALLA — NO existe marca de aparición server-auth determinista por mob: spawnEnemy (sim.js:2258) NO estampa e.spawnT/e.bornAt/tick-de-nacimiento (sólo st/wt = timers de ESTADO reseteados al cambiar de estado, NO edad persistente-al-spawn) + NO hay contador ENTERO determinista de tick de sim (los world-events usan nowMs=wall-clock Date.now, NO determinista entre clientes ⇒ rompería 2-cli 0-desync). Fabricar un reloj-tick determinista arriesga el fingerprint del North Star ⇒ NO lo forcé; PIVOTE justificado al alterno FRESCO `cohesión de manada` (candidato bendecido por el issue). Refiné el candidato dropeando el filtro "mobs SANOS" (leer e.hp/e.maxHp solaparía el contenedor EXACTO de #86 BLOODHARVEST) ⇒ EMPAQUETAMIENTO PURO health-agnóstico ⇒ ⊥#86 limpio.
//     packHarvestScore(hero)=Σ packWeight(e) sobre los mobs VIVOS apiñados dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin manada apiñada ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. packWeight(e)=0 si rezagado (0 vecinos)/muerto, NÚCLEO (≥coreN=2 vecinos vivos en cohesionR=88px)⇒2, AGRUPADO (≥looseN=1)⇒1. FILTRA !e.dead && e.hp>0 (sujeto Y vecino) ⇒ ANTI-AUTO-CONTEO. La cohesión = relación GEOMÉTRICA mob↔mob de POSICIONES replicadas (NO hero↔mob, NO conteo crudo).
//     ⊥ #86 (siega-de-heridos = FRACCIÓN DE VIDA propia e.hp/e.maxHp [cuán MUERTO está]; manada = PROXIMIDAD INTER-MOB [cuán APIÑADO] — mob a PLENA VIDA en jauría tupida = alta manada/cero siega; rezagado MORIBUNDO suelto = cero manada/alta siega, DISJUNTOS), ⊥ #85 (control = ESTADO de CC e.stun/e.slowT), ⊥ #84 (escaramuza = CLASE DE ALCANCE e.tpl.ranged), ⊥ #83 (plaga = DoT e.dots), ⊥ #82 (vorágine = ZONAS G.fields), ⊥ #81 (fragor = PROYECTILES G.projectiles), ⊥ #80 (carnicería = CUERPOS MUERTOS G.corpses; manada cuenta mobs VIVOS apiñados), ⊥ #79 (botín = OBJETOS G.drops), ⊥ #78 (furia = BOOLEANO e.enraged), ⊥ #77 (hazard = G.hazards), ⊥ #76 (variante = e.variant), ⊥ #74 (afijo = e.affix), ⊥ #73 (apex = DISTANCIA hero→jefe/campeón; manada = DISTANCIA mob↔mob [clustering], geometría DISTINTA), ⊥ #72 (escasez = AUSENCIA/CONTEO crudo; manada = AGREGACIÓN ESPACIAL — 5 dispersos = baja manada pese a nº alto), ⊥ #69 (LAST_STAND = CONTEO de ENGANCHADOS en MELEE con el HÉROE [hero-céntrico]; manada = clustering mob↔mob INDEPENDIENTE del héroe), ⊥ CADENCE #67/FRENZY (racha/tempo), ⊥ lootQuality #63/#68, NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = packFind (recompensa de cargas de siega por rematar en medio de una MANADA APIÑADA — NINGUNA de las 28 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind…controlFind #85, bloodFind #86) está LLENA ⇒ pivota a una moneda FRESCA (h.packBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio packBountyCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en la PROXIMIDAD INTER-MOB (clustering mob↔mob), NO en fracción-de-vida/CC/clase-de-alcance/DoT/fases-de-jefe/afijos/variantes. Inyectar un CLÚSTER de orcs plano SANOS apiñados ⇒ manada sube MIENTRAS siega(#86)/afijo(#74)/variante(#76)/furia(#78)/plaga(#83)/escaramuza(#84)/control(#85) lo IGNORAN (orcs SANOS sueltos ⇒ sus probes 0).
// ★ COUNT-vs-COHESIÓN (check 8, crux ⊥#72/#69): 2 mobs DISPERSOS (>cohesionR entre sí) ⇒ score 0 (T0) PESE a 2 mobs en radio; los MISMOS 2 mobs APIÑADOS (≤cohesionR) ⇒ score 2 (T1). Prueba AGREGACIÓN ESPACIAL, NO cantidad ni relación con el héroe.
// ★ REAL SERVER-AUTH (check 6): spawnPack empuja mobs REALES al MISMO G.enemies; packProbe lee el score REAL + la lista de mobs apiñados en radio (x,y,neighbors,weight) ⇒ estado server-auth auténtico. Clúster de 3 apiñados ⇒ cada uno 2 vecinos ⇒ peso 2 ⇒ score 6.
// ★ CANAL (check 9): forageChargePreview = packHarvestBonus(score). Manada cerca ⇒ charge>0; sin manada / lejos ⇒ 0.
// ★ SUB-CAP (check 10): charge EFECTIVA = min(packBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 11): con PACKHARVEST_SURGE OFF, packHarvestBonus(cualquier score)==0 y forageChargePreview==0 aun con un clúster PEGADO al héroe ⇒ 0 cargas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 12): la manada (score/tier/charge) NO cambia los readouts de los hooks peer (bloodHarvest/controlHarvest/skirmishLine/apex/scarcity); activar APEX/SCARCITY NO cambia la señal de manada.
// ★ 0-REGRESIÓN (check 13): las 28 mecánicas del arco #59-#86 siguen served enabled:true; PACKHARVEST_SURGE served false (DARK #87).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS mobs apiñados en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/charge + packProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). packHarvestScore es función PURA de G.enemies+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.packHarvest (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + spawnPack inyección REAL + clearPack + packProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Manada:"). Los mobs inyectados de PRUEBA son estacionarios (spd:0) ⇒ no se mueven ⇒ 0 efecto de sim en las lecturas.
//
// Run: node tools/cas2521-packharvest-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2521");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,charge}: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 0, s: 0 },
  { score: 2, t: 1, s: 1 }, { score: 3, t: 1, s: 1 },
  { score: 4, t: 2, s: 2 }, { score: 99, t: 2, s: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.blightHarvest && window.__dev.maelstromField && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.packHarvest + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.packHarvest());
  ok("2 byte-id OFF (fresh boot): PACKHARVEST_SURGE.enabled false AND G.packBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "packFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" cohesionR=${dark.cohesionR} mobCount=${dark.mobCount}`);

  // 3 save OFF has no packFind/packBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(packFind|packBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"packBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'packFind'/'packBounty' (cargas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.packHarvest({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.packHarvest({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las cargas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.packHarvest({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnPack pushes a real CLUSTER of 3 to G.enemies; packProbe reads real score + list. cluster ⇒ each w2/2 neighbors ⇒ score 6.
  const server6 = await page.evaluate(() => {
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    const h = window.__dev.packHarvest().hero;
    // 3 orcs apiñados en tiles adyacentes al este (32-64px entre sí ≤ cohesionR 88) ⇒ cada uno 2 vecinos ⇒ peso 2 ⇒ score 6 ⇒ T2
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 3, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 4, ty: h.ty } });
    const third = window.__dev.packHarvest({ spawnPack: { tx: h.tx + 5, ty: h.ty } }).spawnPack;   // el 3º ve 2 vecinos ⇒ peso 2
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const sp = window.__dev.packHarvest({ packProbe: true }).packProbe;
    const vm = window.__dev.packHarvest();
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ enabled: false });
    return { third, sp, mobCount: vm.mobCount, tier: vm.tier, score: vm.score };
  });
  const s6OK = server6.third && server6.third.neighbors === 2 && server6.third.weight === 2 &&
    server6.sp && server6.sp.score === 6 && server6.sp.count === 3 && server6.sp.mobs.every(m => m.weight === 2 && m.neighbors === 2) &&
    server6.mobCount >= 3 && server6.tier === 2;
  ok("6 ★ REAL SERVER-AUTH: spawnPack empuja un CLÚSTER REAL de 3 a G.enemies (apiñados ≤cohesionR); cada uno 2 vecinos ⇒ peso 2; packProbe lee score REAL 6 + 3 mobs + mobCount≥3 ⇒ T2",
     s6OK, JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs blood(#86)/affix(#74)/variant(#76)/enrage(#78)/blight(#83)/skirmish(#84)/control(#85): orcs plano SANOS apiñados NO son heridos/afijados/variante/enfurecidos/envenenados/a-distancia/aturdidos. Corre en un tile REMOTO fresco (deltas).
  const diff = await page.evaluate(() => {
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    const h0 = window.__dev.packHarvest().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                    // tile remoto fresco, ~120 tiles al oeste
    window.__dev.packHarvest({ tp: { tx: RX, ty: RY } });
    const basePack = window.__dev.packHarvest().score;                    // baseline (esperado 0)
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const affBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;
    const varBefore = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
    const enrBefore = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    const bliBefore = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    // inyecta un CLÚSTER de 3 orcs plano SANOS apiñados (cada uno peso2 = score 6 ⇒ T2) al este dentro de radio
    window.__dev.packHarvest({ spawnPack: { tx: RX + 3, ty: RY } });
    window.__dev.packHarvest({ spawnPack: { tx: RX + 4, ty: RY } });
    window.__dev.packHarvest({ spawnPack: { tx: RX + 5, ty: RY } });
    window.__dev.packHarvest({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.packHarvest();
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;   // orcs SANOS ⇒ siega IGNORA (peso 0) ⇒ sin cambio
    const affAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // NO afijo ⇒ sin cambio
    const varAfter = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;   // NO variante ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;   // NO jefe enfurecido ⇒ sin cambio
    const bliAfter = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;   // NO dots ⇒ sin cambio
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;   // orc = MELEE ⇒ escaramuza IGNORA ⇒ sin cambio
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;   // NO stun/slow ⇒ control IGNORA ⇒ sin cambio
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ enabled: false });
    return { basePack, score: vm.score, tier: vm.tier, charge: vm.charge,
      bloBefore, bloAfter, affBefore, affAfter, varBefore, varAfter, enrBefore, enrAfter, bliBefore, bliAfter, skiBefore, skiAfter, ctrBefore, ctrAfter };
  });
  const diffOK = diff.score > diff.basePack && diff.tier >= 2 && diff.charge >= 1 &&               // clúster apiñado: manada fires (6⇒T2)
    diff.bloAfter === diff.bloBefore &&                                                            // ★ siega #86 IGNORA orcs SANOS (peso 0)
    diff.affAfter === diff.affBefore && diff.varAfter === diff.varBefore &&                        // afijo/variante IGNORAN
    diff.enrAfter === diff.enrBefore && diff.bliAfter === diff.bliBefore &&                        // furia/plaga IGNORAN
    diff.skiAfter === diff.skiBefore && diff.ctrAfter === diff.ctrBefore;                          // escaramuza/control IGNORAN
  ok("7 ★ DIFERENCIADOR/⊥: inyectar un CLÚSTER de orcs SANOS apiñados ⇒ manada sube a T2 MIENTRAS siega(#86)/afijo(#74)/variante(#76)/furia(#78)/plaga(#83)/escaramuza(#84)/control(#85) IGNORAN; las 28 LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 ★ COUNT-vs-COHESIÓN (crux ⊥#72 escasez / ⊥#69 LAST_STAND): 2 mobs DISPERSOS (>cohesionR) ⇒ score 0 PESE a 2 en radio; los MISMOS 2 APIÑADOS ⇒ score 2. Prueba AGREGACIÓN ESPACIAL, no cantidad.
  const cohesion = await page.evaluate(() => {
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    const h = window.__dev.packHarvest().hero;
    const CX = h.tx - 60, CY = h.ty;                                       // tile remoto fresco
    // DISPERSOS: 2 mobs a 5 tiles (160px > cohesionR 88) ⇒ 0 vecinos cada uno ⇒ score 0
    window.__dev.packHarvest({ spawnPack: { tx: CX, ty: CY } });
    window.__dev.packHarvest({ spawnPack: { tx: CX + 5, ty: CY } });
    window.__dev.packHarvest({ tp: { tx: CX + 2, ty: CY } });              // héroe entre ambos, ambos en radio 260
    const far = window.__dev.packHarvest();
    const farProbe = window.__dev.packHarvest({ packProbe: true }).packProbe;   // count 0 (ninguno apiñado)
    window.__dev.packHarvest({ clearPack: true });
    // APIÑADOS: los MISMOS 2 mobs adyacentes (32px ≤ cohesionR) ⇒ 1 vecino cada uno ⇒ peso1 c/u ⇒ score 2 ⇒ T1
    window.__dev.packHarvest({ spawnPack: { tx: CX, ty: CY } });
    window.__dev.packHarvest({ spawnPack: { tx: CX + 1, ty: CY } });
    window.__dev.packHarvest({ tp: { tx: CX + 2, ty: CY } });
    const near = window.__dev.packHarvest();
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ enabled: false });
    return { farScore: far.score, farTier: far.tier, farProbeCount: farProbe.count, nearScore: near.score, nearTier: near.tier };
  });
  const cohOK = cohesion.farScore === 0 && cohesion.farTier === 0 && cohesion.farProbeCount === 0 &&
    cohesion.nearScore === 2 && cohesion.nearTier === 1;
  ok("8 ★ COUNT-vs-COHESIÓN ⊥#72/#69: 2 mobs DISPERSOS (>cohesionR) ⇒ score 0/T0 PESE a 2 en radio; los MISMOS 2 APIÑADOS ⇒ score 2/T1 (AGREGACIÓN ESPACIAL, no cantidad ni relación con el héroe)",
     cohOK, JSON.stringify(cohesion));

  // 9 CANAL packFind: forageChargePreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    const h = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 3, ty: h.ty } });    // par apiñado ⇒ score 2 ⇒ T1
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.packHarvest();
    const nearPrev = nearVm.forageChargePreview, nearCharge = nearVm.charge;
    window.__dev.packHarvest({ tp: { tx: h.tx + 40, ty: h.ty } });         // hero ~1280px > radius 260 → score 0
    const farVm = window.__dev.packHarvest();
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ enabled: false });
    return { nearPrev, nearCharge, farPrev: farVm.forageChargePreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearCharge && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("9 CANAL packFind: forageChargePreview con manada cerca ⇒ charge>0 (==packHarvestBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 10 ★ SUB-CAP: charge never exceeds packBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.packHarvest({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.packHarvest().cap };
  });
  ok("10 ★ SUB-CAP: ningún score produce charge>packBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 11 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a cluster glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    const h = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty } });        // clúster PEGADO al héroe
    window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty + 1 } });
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ enabled: false });                          // now OFF
    const off = window.__dev.packHarvest();
    window.__dev.packHarvest({ enabled: true }); window.__dev.packHarvest({ clearPack: true }); window.__dev.packHarvest({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("11 ★ BYTE-NEUTRAL OFF: con OFF, packHarvestBonus(clúster pegado)==0 + forageChargePreview==0 ⇒ 0 cargas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 12 ★ ORTHOGONALITY: flip pack OFF→ON at the SAME state ⇒ los hooks peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de manada.
  const orth = await page.evaluate(() => {
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    const h = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 3, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), ctr: window.__dev.controlHarvest(), ski: window.__dev.skirmishLine(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();                                             // PACK OFF (misma posición del héroe)
    window.__dev.packHarvest({ enabled: true });
    const peersOn = snap();                                              // PACK ON — los peers NO deben cambiar
    const beforeArc = window.__dev.packHarvest();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.packHarvest();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });                              // restaura estado LIVE
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("12 ★ ORTOGONALIDAD packFind ⊥ peers: flip manada OFF→ON NO cambia bloodHarvest/controlHarvest/skirmishLine/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de manada; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 13 ★ 0-REGRESSION: 28 arc flags served true; PACKHARVEST_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const phDark = flag("PACKHARVEST_SURGE") === "false";
  ok("13 ★ 0-REGRESIÓN: 28 mecanismos del arco #59-#86 served enabled:true; PACKHARVEST_SURGE served false (DARK #87)",
     arcAllOn && phDark && arc.length === 28, `packHarvest=${flag("PACKHARVEST_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 14 render badge "Manada:" drawn ON+cluster near / not OFF + fps. Mobs de prueba estacionarios (spd:0).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Manada:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    const h = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 3, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 5, ty: h.ty } });   // score 6 ⇒ T2 (robusto)
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("14 render badge \"Manada:\" se DIBUJA ON+manada cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.packHarvest({ enabled: true }); window.__dev.packHarvest({ clearPack: true }); const h = window.__dev.packHarvest().hero; window.__dev.packHarvest({ spawnPack: { tx: h.tx + 3, ty: h.ty } }); window.__dev.packHarvest({ spawnPack: { tx: h.tx + 4, ty: h.ty } }); window.__dev.packHarvest({ spawnPack: { tx: h.tx + 5, ty: h.ty } }); window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.packHarvest({ clearPack: true }); window.__dev.packHarvest({ enabled: false }); });

  // 15 ★ NORTH STAR — 2-client convergence: SAME clustered mobs at SAME tiles + hero at SAME tile ⇒ score/tier/charge + packProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten mobs + tp héroe a las MISMAS coordenadas (packHarvestScore es fn pura de G.enemies+posiciones).
  const MOBS = [{ tx: 60, ty: 40 }, { tx: 61, ty: 40 }, { tx: 62, ty: 40 }], HERO_TILE = { tx: 63, ty: 40 };   // 3 apiñados (cada uno 2 vecinos ⇒ peso2) = score 6 ⇒ T2, 1-3 tiles west of hero (~32-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((MS, HT) => {
    window.__dev.packHarvest({ enabled: true });
    window.__dev.packHarvest({ clearPack: true });
    for (const m of MS) window.__dev.packHarvest({ spawnPack: { tx: m.tx, ty: m.ty } });
    window.__dev.packHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.packHarvest();
    const lut = [0, 2, 4, 9].map(s => { const p = window.__dev.packHarvest({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });   // LUT PURA
    const sp = window.__dev.packHarvest({ packProbe: true }).packProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, mobCount: vm.mobCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, MOBS, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // mobCount NO se compara globalmente: es el nº AMBIENTAL de mobs apiñados en TODO el mundo. El SIGNAL determinista per-snapshot — score/tier/charge + packProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (clearPack aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("15 ★ NORTH STAR 2-CLIENTE: MISMOS mobs apiñados+héroe ⇒ score/tier/charge + packProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; mobCount global ambiental excluido; packProbe cuenta SÓLO en radio tras clearPack)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},mc:${A.mobCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},mc:${B.mobCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.packHarvest({ enabled: false }));
  await pageB.evaluate(() => window.__dev.packHarvest({ enabled: false }));

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
