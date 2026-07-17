// CAS-2497 — self-verify for COSECHA DE PLAGA (DARK, BLIGHT_HARVEST_SURGE.enabled:false). EVO mecánica #83 (serializa tras #82 MAELSTROM_FIELD_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 24 LIVE #59-#82.
// (A) EJE FRESCO = PRESENCIA/DENSIDAD DE AFLICCIONES DE ESTADO (DoT) ACTIVAS sobre los MOBS VIVOS de la vecindad (server-auth, MMORPG-native). PRE-FLIGHT GATE (aprende de #82): el eje RECOMENDADO del issue (HIGH_GROUND/elevación/`z` server-auth) NO EXISTE replicado (grep elevation|altitude|\.z=0, ya documentado en FIRM_FOOTING #70) ⇒ NO se fuerza. PIVOTE justificado a `e.dots` = AFLICCIONES DoT (veneno/quemadura) sobre cada mob — SÍ existe replicado/autoritativo: POBLADO en el path AUTORITATIVO (applyStatus sim.js:6457, alimentado por afijo Ardiente/boons/resinas/ataques enemigos), TICKEADO/BORRADO en el tick de paso-fijo AUTORITATIVO updateEnemies (tickDots sim.js:7654, d.t-=dt, borra en muerte/expiración), ya surfaceado en enemyProbe. Cada mob VIVO con e.dots={poison?,burn?} = snapshot determinista.
//     blightHarvestScore(hero)=Σ blightAfflict(e) sobre los mobs VIVOS dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin pack enfermo ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. blightAfflict(e)=Σ blightWeights[tipo] sobre e.dots (un mob con veneno+quemadura = "totalmente carcomido" ⇒ pesa 2). FILTRA !e.dead ⇒ ANTI-AUTO-CONTEO.
//     ⊥ #82 (vorágine = ZONAS DE NEGACIÓN estáticas en G.fields plantadas por HECHIZOS; plaga = AFLICCIONES DoT sobre los MOBS en e.dots — mago sembrando zonas en suelo vacío=alta vorágine/cero plaga; pack envenenado sin campos=cero vorágine/alta plaga, DIVERGEN), ⊥ #81 (fragor = PROYECTILES EN VUELO G.projectiles; una aflicción NO es una bala), ⊥ #80 (carnicería = CUERPOS MUERTOS G.corpses; plaga cuenta mobs VIVOS afligidos, vivo vs muerto), ⊥ #79 (botín = OBJETOS G.drops), ⊥ #78 (furia = FASE de un JEFE e.enraged — jefe enfurecido sin veneno=alta furia/cero plaga; pack de trash envenenado sin jefe=cero furia/alta plaga, DIVERGEN), ⊥ #77 (hazard = zona ambiental G.hazards), ⊥ #76 (variante = e.variant, modificador de SPAWN, id-set {stalker,bastion,glass}), ⊥ #74 (afijo = CALIDAD ESTÁTICA e.affix {swift,armored,vampiric,volatile,frost} horneada al spawn; plaga = estado DINÁMICO e.dots {poison,burn} aplicado por combate — id-set/subsistema disjuntos: mob 'vampiric' recién spawneado = alto afijo/cero plaga hasta que lo enveneno), ⊥ #73 (apex DISTANCIA a un jefe vivo), ⊥ #72 (escasez AUSENCIA de mobs VIVOS), ⊥ #69 (ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = blightFind (recompensa de esencias de plaga por cosechar en medio de un pack enfermo — NINGUNA de las 24 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind, lootQuality, xpGain, essenceFind, matFind, flaskPotency, gemFind, socketFind, healPotency, trophyFind #78, salvageFind #79, boneFind #80, frayFind #81, maelstromFind #82) está LLENA ⇒ pivota a una moneda FRESCA (h.blightHarvest, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio blightHarvestCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en las AFLICCIONES DoT sobre los MOBS (e.dots), NO en fases-de-jefe/afijos-de-spawn/variantes/zonas-de-negación. Inyectar mobs AFLIGIDOS (sin afijo/variante/enrage) ⇒ plaga sube MIENTRAS afijo(#74)/variante(#76)/furia(#78) lo IGNORAN (un mob envenenado plano NO es afijado/variante/enfurecido ⇒ sus probes sin cambio), vorágine(#82) lo IGNORA (un mob NO es una zona de negación), y lootQuality(#63/#68) NO cambia.
// ★ REAL SERVER-AUTH (check 6): spawnBlight empuja un mob REAL al MISMO G.enemies + aplica dots vía el MISMO applyStatus autoritativo; blightProbe lee el score REAL + la lista de mobs afligidos en radio (x,y,dots,weight) + mobCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageHarvestPreview = blightHarvestBonus(score). Pack cerca ⇒ harvest>0; sin plaga / lejos ⇒ 0.
// ★ SUB-CAP (check 9): harvest EFECTIVA = min(blightHarvestCap=2, tier.harvest). Ningún score produce harvest>2.
// ★ BYTE-NEUTRAL OFF (check 10): con BLIGHT_HARVEST_SURGE OFF, blightHarvestBonus(cualquier score)==0 y forageHarvestPreview==0 aun con mobs afligidos PEGADOS al héroe ⇒ 0 esencias al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la plaga (score/tier/harvest) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind; activar APEX/SCARCITY NO cambia la señal de plaga, y la plaga ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 24 mecánicas del arco #59-#82 siguen served enabled:true; BLIGHT_HARVEST_SURGE served false (DARK #83).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS mobs afligidos en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/harvest + blightProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). blightHarvestScore es función PURA de G.enemies+e.dots+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.blightHarvest (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnBlight inyección REAL + clearBlight + blightProbe lectura server-auth) + peer channels + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Plaga:"). Los mobs inyectados de PRUEBA son estacionarios (spd:0) + alto-HP (99999) ⇒ los DoT de prueba no los matan ⇒ 0 efecto de sim en las lecturas.
//
// Checks:
//   1  boots to play, __dev.blightHarvest + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): BLIGHT_HARVEST_SURGE.enabled false AND G.blightHarvest NUNCA se crea (gExists false); tier 0, score 0, harvest 0, forageHarvestPreview 0, channel blightFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'blightFind'/'blightHarvest' (esencias transitorias, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de esencias NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0/1→T0/0, 2/3→T1/1, ≥4→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnBlight empuja un mob REAL afligido a G.enemies; blightProbe lee score REAL>0 + mob (weight2, dots 2) en la lista + mobCount≥1.
//   7  ★ DIFERENCIADOR/⊥: inyectar mobs afligidos ⇒ plaga sube MIENTRAS afijo(#74)/variante(#76)/furia(#78)/vorágine(#82) lo IGNORAN (un mob envenenado plano NO es afijado/variante/enfurecido/zona) y lootQuality NO cambia; las 24 LIVE coexisten ⊥.
//   8  CANAL blightFind: forageHarvestPreview con pack cerca ⇒ harvest>0 (== blightHarvestBonus); sin plaga / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe harvest nunca > blightHarvestCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, blightHarvestBonus(mobs pegados)==0 y forageHarvestPreview==0 ⇒ 0 esencias al seam (byte-id).
//  11  ★ ORTOGONALIDAD blightFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind: la plaga NO cambia peers; activar APEX/SCARCITY NO cambia la señal de plaga; plaga ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 24 mecanismos del arco #59-#82 served enabled:true; BLIGHT_HARVEST_SURGE served false (DARK #83).
//  13  render badge "Plaga:" se DIBUJA ON+pack cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMOS mobs afligidos en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/harvest + blightProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2497-blightharvest-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2497");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,harvest}: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (capado a 2)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.blightHarvest && window.__dev.maelstromField && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.blightHarvest + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.blightHarvest());
  ok("2 byte-id OFF (fresh boot): BLIGHT_HARVEST_SURGE.enabled false AND G.blightHarvest NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.harvest === 0 && dark.forageHarvestPreview === 0 && dark.channel === "blightFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} harvest=${dark.harvest} preview=${dark.forageHarvestPreview} channel=${dark.channel} tag="${dark.tag}" mobCount=${dark.mobCount}`);

  // 3 save OFF has no blightFind/blightHarvest key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(blightFind|blightHarvest)[A-Za-z]*"\s*:/.test(saveOff);
  const noHarvestKey = !/"blightHarvest"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'blightFind'/'blightHarvest' (esencias transitorias; estado 100% derivado)", noFeatKey && noHarvestKey, `noFeatKey=${noFeatKey} noHarvestKey=${noHarvestKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.blightHarvest({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.blightHarvest({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las esencias NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.blightHarvest({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].harvest === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnBlight pushes a real afflicted mob to G.enemies; blightProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    const h = window.__dev.blightHarvest().hero;                            // hero's current tile
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 3, ty: h.ty, burn: true } });   // inject doubly-afflicted mob (poison+burn) 3 tiles east (~96px, in radius), weight 2
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });             // hero back to origin tile
    const sp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    const vm = window.__dev.blightHarvest();
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ enabled: false });
    return { sp, mobCount: vm.mobCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnBlight empuja mob REAL afligido a G.enemies; blightProbe lee score REAL>0 + mob (weight 2, dots 2) en la lista + mobCount≥1",
     server6.sp && server6.sp.score > 0 && server6.sp.count >= 1 && server6.sp.mobs[0] && server6.sp.mobs[0].weight === 2 && server6.sp.mobs[0].dots.length === 2 && server6.mobCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs affix(#74)/variant(#76)/enrage(#78)/maelstrom(#82): an afflicted-but-plain mob is NOT affixed/variant/enraged, and NOT a denial zone. + lootQuality unchanged. Corre en un tile REMOTO fresco (deltas).
  const diff = await page.evaluate(() => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    const h0 = window.__dev.blightHarvest().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                   // tile remoto fresco, ~120 tiles al oeste
    window.__dev.blightHarvest({ tp: { tx: RX, ty: RY } });
    const baseBlight = window.__dev.blightHarvest().score;                // baseline (esperado 0)
    const affBefore = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const enrBefore = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const maelBefore = window.__dev.maelstromField ? window.__dev.maelstromField({ fieldProbe: true }).fieldProbe.score : 0;
    const lootBefore = window.__dev.blightHarvest().lootQualityFloor;
    // inyecta 2 mobs doblemente-afligidos (weight2 + weight2 = score 4 ⇒ T2) al este dentro de radio
    window.__dev.blightHarvest({ spawnBlight: { tx: RX + 3, ty: RY, burn: true } });
    window.__dev.blightHarvest({ spawnBlight: { tx: RX + 4, ty: RY, burn: true } });
    window.__dev.blightHarvest({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.blightHarvest();
    const affAfter = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;   // un mob afligido plano NO tiene afijo ⇒ sin cambio
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;   // NO tiene variante ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;   // NO es un jefe enfurecido ⇒ sin cambio
    const maelAfter = window.__dev.maelstromField ? window.__dev.maelstromField({ fieldProbe: true }).fieldProbe.score : 0;   // un mob NO es una zona de negación ⇒ sin cambio
    const lootAfter = window.__dev.blightHarvest().lootQualityFloor;      // densidad-de-aflicción ≠ calidad-de-tirada ⇒ sin cambio
    const af = window.__dev.affixDanger ? window.__dev.affixDanger() : null;
    const va = window.__dev.variantSurge ? window.__dev.variantSurge() : null;
    const en = window.__dev.enrageSurge ? window.__dev.enrageSurge() : null;
    const ma = window.__dev.maelstromField ? window.__dev.maelstromField() : null;
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ enabled: false });
    return { baseBlight, score: vm.score, tier: vm.tier, harvest: vm.harvest,
      affBefore, affAfter, varBefore, varAfter, enrBefore, enrAfter, maelBefore, maelAfter, lootBefore, lootAfter,
      afEnabled: af ? af.enabled : null, vaEnabled: va ? va.enabled : null, enEnabled: en ? en.enabled : null, maEnabled: ma ? ma.enabled : null };
  });
  const diffOK = diff.score > diff.baseBlight && diff.tier >= 2 && diff.harvest >= 1 &&          // mobs afligidos: plaga fires (delta>0, 2+2=4⇒T2)
    diff.affAfter === diff.affBefore && diff.varAfter === diff.varBefore &&                       // afijo/variante IGNORAN el mob afligido
    diff.enrAfter === diff.enrBefore && diff.maelAfter === diff.maelBefore &&                     // furia/vorágine IGNORAN el mob afligido
    diff.lootAfter === diff.lootBefore &&                                                         // lootQuality (calidad) NO cambia con densidad de aflicción
    diff.afEnabled === true && diff.vaEnabled === true && diff.enEnabled === true && diff.maEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: inyectar mobs afligidos ⇒ plaga sube a T2 MIENTRAS afijo(#74)/variante(#76)/furia(#78)/vorágine(#82) IGNORAN (un mob envenenado plano NO es afijado/variante/enfurecido/zona) y lootQuality NO cambia (densidad≠calidad); las 24 LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL blightFind: forageHarvestPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    const h = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 4, ty: h.ty, burn: true } });   // ~128px, in radius, weight 2 ⇒ score 2 ⇒ T1
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.blightHarvest();
    const nearPrev = nearVm.forageHarvestPreview, nearHarvest = nearVm.harvest;
    window.__dev.blightHarvest({ tp: { tx: h.tx + 40, ty: h.ty } });        // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.blightHarvest();
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ enabled: false });
    return { nearPrev, nearHarvest, farPrev: farVm.forageHarvestPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearHarvest && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL blightFind: forageHarvestPreview con pack cerca ⇒ harvest>0 (==blightHarvestBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: harvest never exceeds blightHarvestCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.blightHarvest({ scoreProbe: { score: s } }).scoreProbe.harvest);
    return { max: Math.max(...vals), cap: window.__dev.blightHarvest().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce harvest>blightHarvestCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ harvest 0 + forageHarvestPreview 0 even with mobs glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    const h = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, burn: true } });    // weight2 mob ON hero tile ⇒ score 2 ⇒ would be T1
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.blightHarvest({ enabled: false });                        // now OFF
    const off = window.__dev.blightHarvest();
    window.__dev.blightHarvest({ enabled: true }); window.__dev.blightHarvest({ clearBlight: true }); window.__dev.blightHarvest({ enabled: false });
    return { preview: off.forageHarvestPreview, harvest: off.harvest, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.harvest === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, blightHarvestBonus(mobs pegados)==0 + forageHarvestPreview==0 ⇒ 0 esencias al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip blightHarvest OFF→ON at the SAME state ⇒ los 20 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de plaga.
  const orth = await page.evaluate(() => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    const h = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 4, ty: h.ty, burn: true } });
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.blightHarvest({ enabled: false });
    const snap = () => { const s = window.__dev.blightHarvest(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview, bone: s.boneForagePreview, ember: s.emberForagePreview, mael: s.maelstromForagePreview }; };
    const peersOff = snap();                                             // PLAGA OFF (misma posición del héroe)
    window.__dev.blightHarvest({ enabled: true });
    const peersOn = snap();                                              // PLAGA ON — los peers NO deben cambiar
    const beforeArc = window.__dev.blightHarvest();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.blightHarvest();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.harvest === afterArc.harvest;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD blightFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind: flip plaga OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de plaga; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 24 arc flags served true; BLIGHT_HARVEST_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const bhsDark = flag("BLIGHT_HARVEST_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 24 mecanismos del arco #59-#82 served enabled:true; BLIGHT_HARVEST_SURGE served false (DARK #83)",
     arcAllOn && bhsDark && arc.length === 24, `blightHarvest=${flag("BLIGHT_HARVEST_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Plaga:" drawn ON+mobs near / not OFF + fps. Mobs de prueba estacionarios (spd:0) + alto-HP (99999).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Plaga:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    const h = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 3, ty: h.ty, burn: true } });   // weight2
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 4, ty: h.ty, burn: true } });   // score 4 ⇒ T2 (robusto)
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Plaga:\" se DIBUJA ON+pack cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.blightHarvest({ enabled: true }); window.__dev.blightHarvest({ clearBlight: true }); const h = window.__dev.blightHarvest().hero; window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 3, ty: h.ty, burn: true } }); window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 4, ty: h.ty, burn: true } }); window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 5, ty: h.ty } }); window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.blightHarvest({ clearBlight: true }); window.__dev.blightHarvest({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME afflicted mobs at SAME tiles + hero at SAME tile ⇒ score/tier/harvest + blightProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten mobs + tp héroe a las MISMAS coordenadas (blightHarvestScore es fn pura de G.enemies+e.dots+posiciones).
  const MOB_A = { tx: 60, ty: 40, burn: true }, MOB_B = { tx: 61, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // A poison+burn(weight2) + B poison(weight1) = score3 ⇒ T1, 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((MA, MB, HT) => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ spawnBlight: { tx: MA.tx, ty: MA.ty, burn: MA.burn } });   // weight 2 (poison+burn)
    window.__dev.blightHarvest({ spawnBlight: { tx: MB.tx, ty: MB.ty } });                   // weight 1 (poison only)
    window.__dev.blightHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.blightHarvest();
    const lut = [0, 2, 4, 9].map(s => { const p = window.__dev.blightHarvest({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, harvest: p.harvest }; });   // LUT PURA
    const sp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ enabled: false });
    return { score: vm.score, tier: vm.tier, harvest: vm.harvest, mobCount: vm.mobCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, MOB_A, MOB_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // mobCount NO se compara globalmente: es el nº AMBIENTAL de mobs afligidos en TODO el mundo, contaminado por combate previo. El SIGNAL determinista per-snapshot — score/tier/harvest + blightProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (clearBlight aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.harvest === B.harvest && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMOS mobs afligidos+héroe ⇒ score/tier/harvest + blightProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; mobCount global ambiental excluido; blightProbe cuenta SÓLO en radio tras clearBlight)",
     conv, `A={score:${A.score},tier:${A.tier},harvest:${A.harvest},mc:${A.mobCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},harvest:${B.harvest},mc:${B.mobCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.blightHarvest({ enabled: false }));
  await pageB.evaluate(() => window.__dev.blightHarvest({ enabled: false }));

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
