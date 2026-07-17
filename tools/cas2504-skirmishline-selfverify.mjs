// CAS-2504 — self-verify for LÍNEA DE ESCARAMUZA (DARK, SKIRMISH_LINE_SURGE.enabled:false). EVO mecánica #84 (serializa tras #83 BLIGHT_HARVEST_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 25 LIVE #59-#83.
// (A) EJE FRESCO = COMPOSICIÓN DE ARQUETIPO DE ALCANCE (a-distancia) del pack de MOBS VIVOS de la vecindad (server-auth, MMORPG-native). PRE-FLIGHT GATE (aprende de #83): el eje RECOMENDADO del issue (DENSIDAD/FORMACIÓN DE ALIADOS/INVOCACIONES cerca del héroe, G.allies/G.summons/party server-auth) NO EXISTE como CONTENEDOR de MÚLTIPLES aliados — sólo un ÚNICO G._spirit transitorio (CAS-1954, tope 1) + summonAdds que son adds de un mob ENEMIGO ⇒ NO se fuerza. PIVOTE justificado a `e.tpl.ranged` = CLASE DE ALCANCE del arquetipo (caster/lanzador con proyectiles) — SÍ existe replicada/autoritativa: propiedad del TEMPLATE ETPL horneada al spawn, idéntica para todo observador del mismo seed (mismos spawns), leída ya por la IA (kite/cast sim.js:7828/7909) y el pool de afijos (sim.js:914/2355). 0-mutada.
//     skirmishLineScore(hero)=Σ skirmishWeight(e) sobre los mobs VIVOS A-DISTANCIA dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin línea de fuego ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. skirmishWeight(e)=0 si melee (e.tpl.ranged falsy), else long(e.tpl.range ≥ longR 240)?2:1 (una pieza de artillería de largo alcance pesa 2). FILTRA !e.dead ⇒ ANTI-AUTO-CONTEO.
//     ⊥ #83 (plaga = AFLICCIONES DoT DINÁMICAS e.dots aplicadas en combate; escaramuza = CLASE DE ALCANCE ESTÁTICA e.tpl.ranged del template — archer sin veneno=alta escaramuza/cero plaga; rusher envenenado=cero escaramuza/alta plaga, DIVERGEN), ⊥ #82 (vorágine = ZONAS DE NEGACIÓN G.fields; una clase de mob NO es un campo), ⊥ #81 (fragor = PROYECTILES EN VUELO G.projectiles; escaramuza cuenta el SHOOTER-mob aunque NO haya disparado — archer sin tirar=0 fragor/alta escaramuza; saeta del HÉROE=alto fragor/0 escaramuza (no es un mob), DIVERGEN), ⊥ #80 (carnicería = CUERPOS MUERTOS G.corpses; escaramuza cuenta mobs VIVOS a-distancia), ⊥ #79 (botín = OBJETOS G.drops), ⊥ #78 (furia = FASE de un JEFE e.enraged), ⊥ #77 (hazard = zona ambiental G.hazards), ⊥ #76 (variante = e.variant, modificador de comportamiento de SPAWN {stalker,bastion,glass} — un mob melee 'stalker'=alta variante/cero escaramuza), ⊥ #74 (afijo = CALIDAD ESTÁTICA e.affix {swift,armored,vampiric,volatile,frost} horneada al spawn — un rusher melee 'swift'=alto afijo/cero escaramuza), ⊥ #73 (apex DISTANCIA a un jefe vivo), ⊥ #72 (escasez AUSENCIA de mobs VIVOS), ⊥ #69 (LAST_STAND CONTEO de ENGANCHADOS en melee SIN filtro de arquetipo — 5 rushers melee=alto LAST_STAND/cero escaramuza; 3 arqueros kiteando=bajo LAST_STAND/alta escaramuza, DIVERGEN), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = skirmishFind (recompensa de marcas de escaramuza por rematar en medio de una línea de hostigamiento a-distancia — NINGUNA de las 25 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind, lootQuality, xpGain, essenceFind, matFind, flaskPotency, gemFind, socketFind, healPotency, trophyFind #78, salvageFind #79, boneFind #80, frayFind #81, maelstromFind #82, blightFind #83) está LLENA ⇒ pivota a una moneda FRESCA (h.skirmishMarks, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio skirmishMarkCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en la CLASE DE ALCANCE del arquetipo (e.tpl.ranged), NO en aflicciones-DoT/fases-de-jefe/afijos-de-spawn/variantes/zonas. Inyectar mobs A-DISTANCIA (sin afijo/variante/enrage/dots) ⇒ escaramuza sube MIENTRAS afijo(#74)/variante(#76)/furia(#78)/plaga(#83) lo IGNORAN (un archer plano NO es afijado/variante/enfurecido/envenenado ⇒ sus probes sin cambio), y lootQuality(#63/#68) NO cambia. + un mob MELEE (orc) NO sube escaramuza (peso 0) ⇒ ⊥ #69 (conteo sin filtro de arquetipo).
// ★ REAL SERVER-AUTH (check 6): spawnSkirmish empuja un mob REAL al MISMO G.enemies con su template ETPL autoritativo (e.tpl.ranged/range); skirmishProbe lee el score REAL + la lista de mobs a-distancia en radio (x,y,ranged,range,weight) + mobCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageMarkPreview = skirmishLineBonus(score). Línea cerca ⇒ mark>0; sin línea / lejos ⇒ 0.
// ★ SUB-CAP (check 9): mark EFECTIVA = min(skirmishMarkCap=2, tier.mark). Ningún score produce mark>2.
// ★ BYTE-NEUTRAL OFF (check 10): con SKIRMISH_LINE_SURGE OFF, skirmishLineBonus(cualquier score)==0 y forageMarkPreview==0 aun con mobs a-distancia PEGADOS al héroe ⇒ 0 marcas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la escaramuza (score/tier/mark) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind; activar APEX/SCARCITY NO cambia la señal de escaramuza, y la escaramuza ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 25 mecánicas del arco #59-#83 siguen served enabled:true; SKIRMISH_LINE_SURGE served false (DARK #84).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS mobs a-distancia en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/mark + skirmishProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). skirmishLineScore es función PURA de G.enemies+e.tpl.ranged/range+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.skirmishLine (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnSkirmish inyección REAL + clearSkirmish + skirmishProbe lectura server-auth) + peer channels + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Escaramuza:"). Los mobs inyectados de PRUEBA son estacionarios (spd:0) + alto-HP (99999) ⇒ no se mueven/mueren ⇒ 0 efecto de sim en las lecturas.
//
// Checks:
//   1  boots to play, __dev.skirmishLine + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): SKIRMISH_LINE_SURGE.enabled false AND G.skirmishMarks NUNCA se crea (gExists false); tier 0, score 0, mark 0, forageMarkPreview 0, channel skirmishFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'skirmishFind'/'skirmishMarks' (marcas transitorias, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de marcas NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0/1→T0/0, 2/3→T1/1, ≥4→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnSkirmish empuja un mob REAL a-distancia a G.enemies; skirmishProbe lee score REAL>0 + mob (weight2, ranged, range250) en la lista + mobCount≥1.
//   7  ★ DIFERENCIADOR/⊥: inyectar mobs a-distancia ⇒ escaramuza sube MIENTRAS afijo(#74)/variante(#76)/furia(#78)/plaga(#83) lo IGNORAN + un mob MELEE (orc) NO sube escaramuza (peso 0, ⊥ #69) + lootQuality NO cambia; las 25 LIVE coexisten ⊥.
//   8  CANAL skirmishFind: forageMarkPreview con línea cerca ⇒ mark>0 (== skirmishLineBonus); sin línea / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe mark nunca > skirmishMarkCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, skirmishLineBonus(mobs pegados)==0 y forageMarkPreview==0 ⇒ 0 marcas al seam (byte-id).
//  11  ★ ORTOGONALIDAD skirmishFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind: la escaramuza NO cambia peers; activar APEX/SCARCITY NO cambia la señal; escaramuza ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 25 mecanismos del arco #59-#83 served enabled:true; SKIRMISH_LINE_SURGE served false (DARK #84).
//  13  render badge "Escaramuza:" se DIBUJA ON+línea cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMOS mobs a-distancia en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/mark + skirmishProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2504-skirmishline-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2504");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,mark}: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (capado a 2)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.skirmishLine && window.__dev.blightHarvest && window.__dev.maelstromField && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.skirmishLine + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.skirmishLine());
  ok("2 byte-id OFF (fresh boot): SKIRMISH_LINE_SURGE.enabled false AND G.skirmishMarks NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.mark === 0 && dark.forageMarkPreview === 0 && dark.channel === "skirmishFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} mark=${dark.mark} preview=${dark.forageMarkPreview} channel=${dark.channel} tag="${dark.tag}" mobCount=${dark.mobCount}`);

  // 3 save OFF has no skirmishFind/skirmishMarks key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(skirmishFind|skirmishMarks)[A-Za-z]*"\s*:/.test(saveOff);
  const noMarkKey = !/"skirmishMarks"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'skirmishFind'/'skirmishMarks' (marcas transitorias; estado 100% derivado)", noFeatKey && noMarkKey, `noFeatKey=${noFeatKey} noMarkKey=${noMarkKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.skirmishLine({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.skirmishLine({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las marcas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.skirmishLine({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].mark === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnSkirmish pushes a real ranged mob to G.enemies; skirmishProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;                             // hero's current tile
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } });   // inject long-range mob (mage, range250 ≥ longR) 3 tiles east (~96px, in radius), weight 2
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });              // hero back to origin tile
    const sp = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
    const vm = window.__dev.skirmishLine();
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ enabled: false });
    return { sp, mobCount: vm.mobCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnSkirmish empuja mob REAL a-distancia a G.enemies; skirmishProbe lee score REAL>0 + mob (weight 2, ranged, range 250) en la lista + mobCount≥1",
     server6.sp && server6.sp.score > 0 && server6.sp.count >= 1 && server6.sp.mobs[0] && server6.sp.mobs[0].weight === 2 && server6.sp.mobs[0].ranged === true && server6.sp.mobs[0].range === 250 && server6.mobCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs affix(#74)/variant(#76)/enrage(#78)/blight(#83): a plain ranged mob is NOT affixed/variant/enraged/afflicted; a melee mob does NOT raise skirmish. + lootQuality unchanged. Corre en un tile REMOTO fresco (deltas).
  const diff = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h0 = window.__dev.skirmishLine().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                    // tile remoto fresco, ~120 tiles al oeste
    window.__dev.skirmishLine({ tp: { tx: RX, ty: RY } });
    const baseSkirm = window.__dev.skirmishLine().score;                  // baseline (esperado 0)
    const affBefore = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const enrBefore = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const bliBefore = window.__dev.blightHarvest ? window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score : 0;
    const lootBefore = window.__dev.skirmishLine().lootQualityFloor;
    // inyecta 2 mobs de largo alcance (weight2 + weight2 = score 4 ⇒ T2) al este dentro de radio
    window.__dev.skirmishLine({ spawnSkirmish: { tx: RX + 3, ty: RY, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: RX + 4, ty: RY, long: true } });
    window.__dev.skirmishLine({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.skirmishLine();
    // + un mob MELEE (orc) — NO debe subir la escaramuza (peso 0) ⇒ ⊥ #69 (conteo sin filtro de arquetipo)
    window.__dev.skirmishLine({ spawnSkirmish: { tx: RX + 5, ty: RY, melee: true } });
    window.__dev.skirmishLine({ tp: { tx: RX, ty: RY } });
    const vmMelee = window.__dev.skirmishLine();                           // score IGUAL que vm (el melee no cuenta)
    const affAfter = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;   // un archer plano NO tiene afijo ⇒ sin cambio
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;   // NO tiene variante ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;   // NO es un jefe enfurecido ⇒ sin cambio
    const bliAfter = window.__dev.blightHarvest ? window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score : 0;   // NO tiene dots ⇒ sin cambio
    const lootAfter = window.__dev.skirmishLine().lootQualityFloor;       // composición-de-arquetipo ≠ calidad-de-tirada ⇒ sin cambio
    const af = window.__dev.affixDanger ? window.__dev.affixDanger() : null;
    const va = window.__dev.variantSurge ? window.__dev.variantSurge() : null;
    const en = window.__dev.enrageSurge ? window.__dev.enrageSurge() : null;
    const bl = window.__dev.blightHarvest ? window.__dev.blightHarvest() : null;
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ enabled: false });
    window.__dev.blightHarvest && window.__dev.blightHarvest({ clearBlight: true });
    return { baseSkirm, score: vm.score, tier: vm.tier, mark: vm.mark, meleeScore: vmMelee.score,
      affBefore, affAfter, varBefore, varAfter, enrBefore, enrAfter, bliBefore, bliAfter, lootBefore, lootAfter,
      afEnabled: af ? af.enabled : null, vaEnabled: va ? va.enabled : null, enEnabled: en ? en.enabled : null, blEnabled: bl ? bl.enabled : null };
  });
  const diffOK = diff.score > diff.baseSkirm && diff.tier >= 2 && diff.mark >= 1 &&               // mobs a-distancia: escaramuza fires (delta>0, 2+2=4⇒T2)
    diff.meleeScore === diff.score &&                                                             // ★ un mob MELEE NO sube la escaramuza (peso 0) ⇒ ⊥ #69
    diff.affAfter === diff.affBefore && diff.varAfter === diff.varBefore &&                       // afijo/variante IGNORAN el archer plano
    diff.enrAfter === diff.enrBefore && diff.bliAfter === diff.bliBefore &&                       // furia/plaga IGNORAN el archer plano
    diff.lootAfter === diff.lootBefore &&                                                         // lootQuality (calidad) NO cambia con composición de arquetipo
    diff.afEnabled === true && diff.vaEnabled === true && diff.enEnabled === true && diff.blEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: inyectar mobs a-distancia ⇒ escaramuza sube a T2 MIENTRAS afijo(#74)/variante(#76)/furia(#78)/plaga(#83) IGNORAN (un archer plano NO es afijado/variante/enfurecido/envenenado) + un mob MELEE NO sube escaramuza (peso 0, ⊥ #69) + lootQuality NO cambia; las 25 LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL skirmishFind: forageMarkPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 4, ty: h.ty, long: true } });   // ~128px, in radius, weight 2 ⇒ score 2 ⇒ T1
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.skirmishLine();
    const nearPrev = nearVm.forageMarkPreview, nearMark = nearVm.mark;
    window.__dev.skirmishLine({ tp: { tx: h.tx + 40, ty: h.ty } });         // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.skirmishLine();
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ enabled: false });
    return { nearPrev, nearMark, farPrev: farVm.forageMarkPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearMark && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL skirmishFind: forageMarkPreview con línea cerca ⇒ mark>0 (==skirmishLineBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: mark never exceeds skirmishMarkCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.skirmishLine({ scoreProbe: { score: s } }).scoreProbe.mark);
    return { max: Math.max(...vals), cap: window.__dev.skirmishLine().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce mark>skirmishMarkCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ mark 0 + forageMarkPreview 0 even with mobs glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty, long: true } });    // weight2 mob ON hero tile ⇒ score 2 ⇒ would be T1
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.skirmishLine({ enabled: false });                         // now OFF
    const off = window.__dev.skirmishLine();
    window.__dev.skirmishLine({ enabled: true }); window.__dev.skirmishLine({ clearSkirmish: true }); window.__dev.skirmishLine({ enabled: false });
    return { preview: off.forageMarkPreview, mark: off.mark, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.mark === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, skirmishLineBonus(mobs pegados)==0 + forageMarkPreview==0 ⇒ 0 marcas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip skirmishLine OFF→ON at the SAME state ⇒ los 21 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de escaramuza.
  const orth = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 4, ty: h.ty, long: true } });
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.skirmishLine({ enabled: false });
    const snap = () => { const s = window.__dev.skirmishLine(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview, bone: s.boneForagePreview, ember: s.emberForagePreview, mael: s.maelstromForagePreview, blight: s.blightForagePreview }; };
    const peersOff = snap();                                             // ESCARAMUZA OFF (misma posición del héroe)
    window.__dev.skirmishLine({ enabled: true });
    const peersOn = snap();                                              // ESCARAMUZA ON — los peers NO deben cambiar
    const beforeArc = window.__dev.skirmishLine();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.skirmishLine();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.mark === afterArc.mark;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD skirmishFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind: flip escaramuza OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 25 arc flags served true; SKIRMISH_LINE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const slsDark = flag("SKIRMISH_LINE_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 25 mecanismos del arco #59-#83 served enabled:true; SKIRMISH_LINE_SURGE served false (DARK #84)",
     arcAllOn && slsDark && arc.length === 25, `skirmishLine=${flag("SKIRMISH_LINE_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Escaramuza:" drawn ON+mobs near / not OFF + fps. Mobs de prueba estacionarios (spd:0) + alto-HP (99999).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Escaramuza:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } });   // weight2
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 4, ty: h.ty, long: true } });   // score 4 ⇒ T2 (robusto)
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Escaramuza:\" se DIBUJA ON+línea cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.skirmishLine({ enabled: true }); window.__dev.skirmishLine({ clearSkirmish: true }); const h = window.__dev.skirmishLine().hero; window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } }); window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 4, ty: h.ty, long: true } }); window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 5, ty: h.ty } }); window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.skirmishLine({ clearSkirmish: true }); window.__dev.skirmishLine({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME ranged mobs at SAME tiles + hero at SAME tile ⇒ score/tier/mark + skirmishProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten mobs + tp héroe a las MISMAS coordenadas (skirmishLineScore es fn pura de G.enemies+e.tpl.ranged/range+posiciones).
  const MOB_A = { tx: 60, ty: 40, long: true }, MOB_B = { tx: 61, ty: 40, long: false }, HERO_TILE = { tx: 63, ty: 40 };   // A largo(weight2) + B corto(weight1) = score3 ⇒ T1, 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((MA, MB, HT) => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: MA.tx, ty: MA.ty, long: MA.long } });   // weight 2 (mage largo alcance)
    window.__dev.skirmishLine({ spawnSkirmish: { tx: MB.tx, ty: MB.ty, long: MB.long } });   // weight 1 (spearman corto)
    window.__dev.skirmishLine({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.skirmishLine();
    const lut = [0, 2, 4, 9].map(s => { const p = window.__dev.skirmishLine({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, mark: p.mark }; });   // LUT PURA
    const sp = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ enabled: false });
    return { score: vm.score, tier: vm.tier, mark: vm.mark, mobCount: vm.mobCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, MOB_A, MOB_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // mobCount NO se compara globalmente: es el nº AMBIENTAL de mobs a-distancia en TODO el mundo, contaminado por combate previo. El SIGNAL determinista per-snapshot — score/tier/mark + skirmishProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (clearSkirmish aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.mark === B.mark && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMOS mobs a-distancia+héroe ⇒ score/tier/mark + skirmishProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; mobCount global ambiental excluido; skirmishProbe cuenta SÓLO en radio tras clearSkirmish)",
     conv, `A={score:${A.score},tier:${A.tier},mark:${A.mark},mc:${A.mobCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},mark:${B.mark},mc:${B.mobCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.skirmishLine({ enabled: false }));
  await pageB.evaluate(() => window.__dev.skirmishLine({ enabled: false }));

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
