// CAS-2516 — self-verify for SIEGA DE HERIDOS (DARK, BLOODHARVEST_SURGE.enabled:false). EVO mecánica #86 (serializa tras #85 CONTROL_HARVEST_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 27 LIVE #59-#85.
// (A) EJE FRESCO = DENSIDAD DE MOBS VIVOS ya ENSANGRENTADOS (fracción de vida BAJA e.hp/e.maxHp) en la vecindad (server-auth, MMORPG-native). PRE-FLIGHT GATE: el eje RECOMENDADO del issue (RACHA/COMBO de kills temporal, kill-streak server-auth) FALLA ⊥27 — CADENCE_RUSH #67 (config.js:2723) YA es un combo-meter rodante server-auth scoreado por TEMPO/RITMO DE MATANZA (bumpPerKill en cada kill, decae por vida-media, reloj COMPARTIDO) + FRENZY (CAS-1773, medidor de frenesí kill-streak) + COMBO (comboCount, cadena melee) ocupan el contenedor racha/kill-streak/combo ⇒ NO es un contenedor DISTINTO ⇒ PIVOTE justificado al eje alterno FRESCO `e.hp/e.maxHp` = FRACCIÓN DE VIDA server-auth: propiedad DINÁMICA replicada, poblada por el daño acumulado en combate (hitEnemy/damage), tickeada en updateEnemies, YA leída por la IA/enrage (cambio-de-fase capstone cruza e.hp<=e.maxHp*e.enrageAt). NINGUNA de las 27 flags #59-#85 la lee como eje de SCORE (grep verificado).
//     bloodHarvestScore(hero)=Σ bloodWeight(e) sobre los mobs VIVOS heridos dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin campo de heridos ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. bloodWeight(e)=0 si sano/muerto, A-PUNTO-DE-CAER (e.hp/e.maxHp≤critFrac 0.15)⇒2, HERIDO (≤bloodiedFrac 0.40)⇒1. FILTRA !e.dead && e.hp>0 ⇒ ANTI-AUTO-CONTEO.
//     ⊥ #85 (control = ESTADO de CC e.stun/e.slowT [NEGACIÓN-de-acción]; siega = FRACCIÓN DE VIDA e.hp/e.maxHp [cuán MUERTO está] — un mob SANO aturdido = alto control/cero siega; un mob HERIDO corriendo libre = cero control/alta siega, DISJUNTOS), ⊥ #84 (escaramuza = CLASE DE ALCANCE ESTÁTICA e.tpl.ranged; siega = fracción de vida dinámica — archer a plena vida = alta escaramuza/cero siega), ⊥ #83 (plaga = AFLICCIONES DoT e.dots ACTIVAS; siega = fracción de vida [el RESULTADO acumulado del daño] — mob a plena vida ardiendo = alta plaga/cero siega; mob moribundo sin dots = cero plaga/alta siega, DISJUNTOS), ⊥ #82 (vorágine = ZONAS G.fields), ⊥ #81 (fragor = PROYECTILES G.projectiles), ⊥ #80 (carnicería = CUERPOS MUERTOS G.corpses; siega cuenta mobs VIVOS heridos), ⊥ #79 (botín = OBJETOS G.drops), ⊥ #78 (furia = BOOLEANO de FASE de un JEFE e.enraged fijado UNA vez al cruzar el umbral; siega = FRACCIÓN CONTINUA de TODO mob VIVO incluida la basura — jefe enfurecido en enrageAt frac 0.5>bloodiedFrac 0.4 = alta furia/cero siega; trash al 0.3 = cero furia/alta siega, DIVERGEN), ⊥ #77 (hazard = G.hazards), ⊥ #76 (variante = e.variant, modificador de SPAWN), ⊥ #74 (afijo = CALIDAD ESTÁTICA e.affix horneada al spawn — un mob 'armored' a plena vida = alto afijo/cero siega), ⊥ #73 (apex = DISTANCIA a un jefe/campeón VIVO), ⊥ #72 (escasez AUSENCIA de mobs), ⊥ #69 (LAST_STAND CONTEO de ENGANCHADOS en melee SIN filtro de vida — 5 rushers a plena vida = alto LAST_STAND/cero siega; 3 moribundos a distancia = bajo LAST_STAND/alta siega, DIVERGEN), ⊥ CADENCE #67/FRENZY (racha/tempo), ⊥ lootQuality #63/#68, NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = bloodFind (recompensa de cargas de siega por rematar en medio de un campo de HERIDOS — NINGUNA de las 27 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind, lootQuality, xpGain, essenceFind, matFind, flaskPotency, gemFind, socketFind, healPotency, trophyFind #78, salvageFind #79, boneFind #80, frayFind #81, maelstromFind #82, blightFind #83, skirmishFind #84, controlFind #85) está LLENA ⇒ pivota a una moneda FRESCA (h.bloodCharges, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio bloodChargeCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en la FRACCIÓN DE VIDA (e.hp/e.maxHp), NO en CC/clase-de-alcance/aflicciones-DoT/fases-de-jefe/afijos/variantes. Inyectar mobs plano HERIDOS (orc + hp bajo, sin afijo/variante/enrage/dots/CC/alcance) ⇒ siega sube MIENTRAS afijo(#74)/variante(#76)/furia(#78)/plaga(#83)/escaramuza(#84)/control(#85) lo IGNORAN (un orc herido NO es afijado/variante/enfurecido/envenenado/a-distancia/aturdido ⇒ sus probes 0), + un mob SANO NO sube la siega (peso 0).
// ★ REAL SERVER-AUTH (check 6): spawnWound empuja un mob REAL al MISMO G.enemies + fija e.hp a fracción (camino de daño real); woundProbe lee el score REAL + la lista de mobs heridos en radio (x,y,hp,maxHp,frac,weight) + mobCount ⇒ estado server-auth auténtico. CRIT (frac 0.10)⇒peso2, WOUND (frac 0.30)⇒peso1.
// ★ CANAL (check 8): forageChargePreview = bloodHarvestBonus(score). Campo cerca ⇒ charge>0; sin campo / lejos ⇒ 0.
// ★ SUB-CAP (check 9): charge EFECTIVA = min(bloodChargeCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 10): con BLOODHARVEST_SURGE OFF, bloodHarvestBonus(cualquier score)==0 y forageChargePreview==0 aun con mobs heridos PEGADOS al héroe ⇒ 0 cargas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la siega (score/tier/charge) NO cambia los readouts de los hooks peer (controlHarvest/skirmishLine/blightHarvest/apex/scarcity); activar APEX/SCARCITY NO cambia la señal de siega.
// ★ 0-REGRESIÓN (check 12): las 27 mecánicas del arco #59-#85 siguen served enabled:true; BLOODHARVEST_SURGE served false (DARK #86).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS mobs heridos en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/charge + woundProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). bloodHarvestScore es función PURA de G.enemies+e.hp/e.maxHp+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.bloodHarvest (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + spawnWound inyección REAL + clearWound + woundProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Siega:"). Los mobs inyectados de PRUEBA son estacionarios (spd:0) ⇒ no se mueven ⇒ 0 efecto de sim en las lecturas.
//
// Run: node tools/cas2516-bloodharvest-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2516");
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.blightHarvest && window.__dev.maelstromField && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.bloodHarvest + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.bloodHarvest());
  ok("2 byte-id OFF (fresh boot): BLOODHARVEST_SURGE.enabled false AND G.bloodCharges NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "bloodFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" mobCount=${dark.mobCount}`);

  // 3 save OFF has no bloodFind/bloodCharges key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(bloodFind|bloodCharges)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"bloodCharges"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'bloodFind'/'bloodCharges' (cargas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.bloodHarvest({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.bloodHarvest({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las cargas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.bloodHarvest({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnWound pushes real wounded mobs to G.enemies (e.hp a fracción); woundProbe reads real score + list. CRIT⇒w2, WOUND⇒w1.
  const server6 = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    const crit = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } }).spawnWound;   // frac 0.10 ⇒ weight 2
    const wound = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "wound" } }).spawnWound;  // frac 0.30 ⇒ weight 1
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const sp = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const vm = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ enabled: false });
    return { crit, wound, sp, mobCount: vm.mobCount, tier: vm.tier, score: vm.score };
  });
  const s6OK = server6.crit && server6.crit.weight === 2 && server6.crit.frac <= 0.15 &&
    server6.wound && server6.wound.weight === 1 && server6.wound.frac > 0.15 && server6.wound.frac <= 0.40 &&
    server6.sp && server6.sp.score >= 3 && server6.sp.count >= 2 && server6.mobCount >= 2 && server6.tier >= 1;
  ok("6 ★ REAL SERVER-AUTH: spawnWound empuja mobs REALES heridos a G.enemies (e.hp a fracción); CRIT⇒peso2 (frac≤0.15), WOUND⇒peso1 (0.15<frac≤0.40); woundProbe lee score REAL≥3 + 2 mobs + mobCount≥2",
     s6OK, JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs affix(#74)/variant(#76)/enrage(#78)/blight(#83)/skirmish(#84)/control(#85): un orc HERIDO plano NO es afijado/variante/enfurecido/envenenado/a-distancia/aturdido; un mob SANO NO sube la siega. Corre en un tile REMOTO fresco (deltas).
  const diff = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h0 = window.__dev.bloodHarvest().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                    // tile remoto fresco, ~120 tiles al oeste
    window.__dev.bloodHarvest({ tp: { tx: RX, ty: RY } });
    const baseBlood = window.__dev.bloodHarvest().score;                  // baseline (esperado 0)
    const affBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;
    const varBefore = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
    const enrBefore = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    const bliBefore = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    // inyecta 2 orcs plano CRIT-HERIDOS (frac 0.10 ⇒ weight2 c/u = score 4 ⇒ T2) al este dentro de radio
    window.__dev.bloodHarvest({ spawnWound: { tx: RX + 3, ty: RY, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: RX + 4, ty: RY, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.bloodHarvest();
    // + un mob SANO (orc a plena vida) — NO debe subir la siega (peso 0)
    window.__dev.bloodHarvest({ spawnWound: { tx: RX + 5, ty: RY, kind: "none" } });
    window.__dev.bloodHarvest({ tp: { tx: RX, ty: RY } });
    const vmHealthy = window.__dev.bloodHarvest();                         // score IGUAL que vm (el sano no cuenta)
    const affAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // orc herido NO tiene afijo ⇒ sin cambio
    const varAfter = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;   // NO tiene variante ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;   // NO es un jefe enfurecido ⇒ sin cambio
    const bliAfter = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;   // NO tiene dots ⇒ sin cambio
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;   // orc = MELEE ⇒ escaramuza IGNORA ⇒ sin cambio
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;   // ★ NO tiene stun/slow ⇒ control IGNORA ⇒ sin cambio (⊥ #85: siega cuenta un herido que el control no)
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ enabled: false });
    return { baseBlood, score: vm.score, tier: vm.tier, charge: vm.charge, healthyScore: vmHealthy.score,
      affBefore, affAfter, varBefore, varAfter, enrBefore, enrAfter, bliBefore, bliAfter, skiBefore, skiAfter, ctrBefore, ctrAfter };
  });
  const diffOK = diff.score > diff.baseBlood && diff.tier >= 2 && diff.charge >= 1 &&               // mobs heridos: siega fires (2+2=4⇒T2)
    diff.healthyScore === diff.score &&                                                             // ★ un mob SANO NO sube la siega (peso 0)
    diff.affAfter === diff.affBefore && diff.varAfter === diff.varBefore &&                         // afijo/variante IGNORAN el orc herido
    diff.enrAfter === diff.enrBefore && diff.bliAfter === diff.bliBefore &&                         // furia/plaga IGNORAN el orc herido
    diff.skiAfter === diff.skiBefore && diff.ctrAfter === diff.ctrBefore;                           // ★ escaramuza/control IGNORAN el orc HERIDO plano (⊥ #84/#85)
  ok("7 ★ DIFERENCIADOR/⊥: inyectar orcs plano HERIDOS ⇒ siega sube a T2 MIENTRAS afijo(#74)/variante(#76)/furia(#78)/plaga(#83)/escaramuza(#84)/control(#85) IGNORAN + un mob SANO NO sube siega (peso 0); las 27 LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL bloodFind: forageChargePreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "crit" } });   // weight 2 ⇒ score 2 ⇒ T1
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.bloodHarvest();
    const nearPrev = nearVm.forageChargePreview, nearCharge = nearVm.charge;
    window.__dev.bloodHarvest({ tp: { tx: h.tx + 40, ty: h.ty } });         // hero ~1280px > radius 260 → score 0
    const farVm = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ enabled: false });
    return { nearPrev, nearCharge, farPrev: farVm.forageChargePreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearCharge && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL bloodFind: forageChargePreview con campo cerca ⇒ charge>0 (==bloodHarvestBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: charge never exceeds bloodChargeCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.bloodHarvest({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.bloodHarvest().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce charge>bloodChargeCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with wounded mobs glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty, kind: "crit" } });    // weight2 mob ON hero tile ⇒ score 2 ⇒ would be T1
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.bloodHarvest({ enabled: false });                         // now OFF
    const off = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, bloodHarvestBonus(mobs pegados)==0 + forageChargePreview==0 ⇒ 0 cargas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip blood OFF→ON at the SAME state ⇒ los hooks peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de siega.
  const orth = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.bloodHarvest({ enabled: false });
    const snap = () => JSON.stringify({ ctr: window.__dev.controlHarvest(), ski: window.__dev.skirmishLine(), bli: window.__dev.blightHarvest(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();                                             // BLOOD OFF (misma posición del héroe)
    window.__dev.bloodHarvest({ enabled: true });
    const peersOn = snap();                                              // BLOOD ON — los peers NO deben cambiar
    const beforeArc = window.__dev.bloodHarvest();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.bloodHarvest();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });                              // restaura estado LIVE
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD bloodFind ⊥ peers: flip siega OFF→ON NO cambia controlHarvest/skirmishLine/blightHarvest/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de siega; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 27 arc flags served true; BLOODHARVEST_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const bhDark = flag("BLOODHARVEST_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 27 mecanismos del arco #59-#85 served enabled:true; BLOODHARVEST_SURGE served false (DARK #86)",
     arcAllOn && bhDark && arc.length === 27, `bloodHarvest=${flag("BLOODHARVEST_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Siega:" drawn ON+mobs near / not OFF + fps. Mobs de prueba estacionarios (spd:0).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Siega:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });   // weight2
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "crit" } });   // score 4 ⇒ T2 (robusto)
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Siega:\" se DIBUJA ON+campo cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true }); const h = window.__dev.bloodHarvest().hero; window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } }); window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "wound" } }); window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME wounded mobs at SAME tiles + hero at SAME tile ⇒ score/tier/charge + woundProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten mobs + tp héroe a las MISMAS coordenadas (bloodHarvestScore es fn pura de G.enemies+e.hp/e.maxHp+posiciones).
  const MOB_A = { tx: 60, ty: 40, kind: "crit" }, MOB_B = { tx: 61, ty: 40, kind: "wound" }, HERO_TILE = { tx: 63, ty: 40 };   // A crit(weight2) + B wound(weight1) = score3 ⇒ T1, 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((MA, MB, HT) => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ spawnWound: { tx: MA.tx, ty: MA.ty, kind: MA.kind } });   // weight 2 (crit)
    window.__dev.bloodHarvest({ spawnWound: { tx: MB.tx, ty: MB.ty, kind: MB.kind } });   // weight 1 (wound)
    window.__dev.bloodHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.bloodHarvest();
    const lut = [0, 2, 4, 9].map(s => { const p = window.__dev.bloodHarvest({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });   // LUT PURA
    const sp = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, mobCount: vm.mobCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, MOB_A, MOB_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // mobCount NO se compara globalmente: es el nº AMBIENTAL de mobs heridos en TODO el mundo, contaminado por combate previo. El SIGNAL determinista per-snapshot — score/tier/charge + woundProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (clearWound aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMOS mobs heridos+héroe ⇒ score/tier/charge + woundProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; mobCount global ambiental excluido; woundProbe cuenta SÓLO en radio tras clearWound)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},mc:${A.mobCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},mc:${B.mobCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.bloodHarvest({ enabled: false }));
  await pageB.evaluate(() => window.__dev.bloodHarvest({ enabled: false }));

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
