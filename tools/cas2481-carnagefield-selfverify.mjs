// CAS-2481 — self-verify for CAMPO DE CARNICERÍA (DARK, CARNAGE_FIELD_SURGE.enabled:false). EVO mecánica #80 (serializa tras #79 SPOILS_FIELD_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 21 LIVE #59-#79.
// (A) EJE FRESCO = PRESENCIA/DENSIDAD DE UN CAMPO DE CADÁVERES RECIÉN CAÍDOS (server-auth, MMORPG-native). PRE-FLIGHT GATE: el candidato líder del issue (warband/densidad-de-aliados, G.players) NO existe replicado (no hay array de players remotos ni módulo de red) ⇒ NO se fuerza. Eje FRESCO alterno SÍ presente: los CADÁVERES `G.corpses` — poblados DETERMINISTA en el path AUTORITATIVO killEnemy (sim.js:5674, un cuerpo por cada muerte de mob richAnim) y ENVEJECIDOS en el tick de paso-fijo AUTORITATIVO updateCorpses (CORPSE_LIFE=2.6s). Cada cadáver VIVO {x,y,size,isBoss,champion,t} = estado replicado.
//     carnageFieldScore(hero)=Σ carnageWeights[rango] sobre los cadáveres dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Suelo sin bajas ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. rango boss→3 / champion→2 / normal→1.
//     ⊥ #79 (botín = OBJETOS DE LOOT recogibles en G.drops que persisten hasta d.taken; carnicería = CUERPOS en G.corpses NO recogibles que despawnan — otro contenedor y otro ciclo de vida), ⊥ #78 (furia = jefe VIVO enfurecido e.enraged/G.enemies; carnicería = mobs MUERTOS G.corpses — vivo vs muerto), ⊥ #72 (escasez = AUSENCIA de mobs VIVOS [G.enemies count]; carnicería = PRESENCIA de mobs MUERTOS [G.corpses count] — DIVERGEN), ⊥ #77 (hazard G.hazards; un cadáver NO es un hazard), ⊥ #76 (variante e.variant sobre mobs vivos), ⊥ #75 (evento G.zoneEvents.pois), ⊥ #74 (afijo CALIDAD de un mob), ⊥ #73 (apex DISTANCIA a un jefe vivo), ⊥ #69 (ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = boneFind (recompensa de fichas de osario por rematar dentro de un campo de carnicería denso — NINGUNA de las 21 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73, flaskPotency #74, gemFind #75, socketFind #76, healPotency #77, trophyFind #78, salvageFind #79) está LLENA ⇒ pivota a una moneda FRESCA (h.boneTokens, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio carnageBoneCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en los CADÁVERES (G.corpses), NO en objetos-de-loot/mobs-vivos/eventos. Inyectar cadáveres ⇒ carnicería sube MIENTRAS botín(#79) lo IGNORA (un cadáver NO es un drop ⇒ spoilsProbe sin cambio), furia(#78) lo IGNORA (un cadáver NO es un jefe vivo ⇒ enrageProbe sin cambio), hazard(#77)/variante(#76) lo IGNORAN, y lootQuality(#63/#68) NO cambia.
// ★ REAL SERVER-AUTH (check 6): spawnCorpse empuja un cadáver REAL al MISMO G.corpses que puebla killEnemy; carnageProbe lee el score REAL + la lista de cadáveres en radio (x,y,rank,weight) + corpseCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageBonePreview = carnageFieldBoneBonus(score). Cadáveres cerca ⇒ bone>0; suelo sin bajas / lejos ⇒ 0.
// ★ SUB-CAP (check 9): bone EFECTIVA = min(carnageBoneCap=2, tier.bone). Ningún score produce bone>2.
// ★ BYTE-NEUTRAL OFF (check 10): con CARNAGE_FIELD_SURGE OFF, carnageFieldBoneBonus(cualquier score)==0 y forageBonePreview==0 aun con cadáveres PEGADOS al héroe ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la carnicería (score/tier/bone) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind; activar APEX/SCARCITY NO cambia la señal de carnicería, y la carnicería ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 21 mecánicas del arco #59-#79 siguen served enabled:true; CARNAGE_FIELD_SURGE served false (DARK #80).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS cadáveres en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/bone + carnageProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). carnageFieldScore es función PURA de G.corpses+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.carnageField (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnCorpse inyección REAL + clearCorpses + carnageProbe lectura server-auth) + peer channels + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Osario:").
//
// Checks:
//   1  boots to play, __dev.carnageField + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): CARNAGE_FIELD_SURGE.enabled false AND G.carnageField NUNCA se crea (gExists false); tier 0, score 0, bone 0, forageBonePreview 0, channel boneFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'carnageField'/'boneFind' Y sin 'boneTokens' (fichas transitorias, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de fichas NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0→T0/0, 1/2→T1/1, 3/6→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnCorpse empuja un cadáver REAL a G.corpses; carnageProbe lee score REAL>0 + cadáver en la lista + corpseCount≥1.
//   7  ★ DIFERENCIADOR/⊥: inyectar cadáveres ⇒ carnicería sube MIENTRAS botín(#79)/furia(#78)/hazard(#77)/variante(#76) lo IGNORAN (un cadáver NO es drop/jefe-vivo/hazard/mob) y lootQuality NO cambia; botín/furia/hazard/variante LIVE coexisten ⊥.
//   8  CANAL boneFind: forageBonePreview con cadáveres cerca ⇒ bone>0 (== carnageFieldBoneBonus); suelo sin bajas / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe bone nunca > carnageBoneCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, carnageFieldBoneBonus(cadáveres pegados)==0 y forageBonePreview==0 ⇒ 0 fichas al seam (byte-id).
//  11  ★ ORTOGONALIDAD boneFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind: la carnicería NO cambia peers; activar APEX/SCARCITY NO cambia la señal de carnicería; carnicería ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 21 mecanismos del arco #59-#79 served enabled:true; CARNAGE_FIELD_SURGE served false (DARK #80).
//  13  render badge "Osario:" se DIBUJA ON+cadáveres cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMOS cadáveres en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/bone + carnageProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2481-carnagefield-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2481");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,bone}: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 1, s: 1 }, { score: 3, t: 2, s: 2 },
  { score: 6, t: 2, s: 2 }, { score: 99, t: 2, s: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.carnageField + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.carnageField());
  ok("2 byte-id OFF (fresh boot): CARNAGE_FIELD_SURGE.enabled false AND G.carnageField NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.bone === 0 && dark.forageBonePreview === 0 && dark.channel === "boneFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} bone=${dark.bone} preview=${dark.forageBonePreview} channel=${dark.channel} tag="${dark.tag}" corpseCount=${dark.corpseCount}`);

  // 3 save OFF has no carnageField/boneFind/boneTokens key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(carnageField|boneFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noBoneKey = !/"boneTokens"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'carnageField'/'boneFind' NI 'boneTokens' (fichas transitorias; estado 100% derivado)", noFeatKey && noBoneKey, `noFeatKey=${noFeatKey} noBoneKey=${noBoneKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.carnageField({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.carnageField({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.carnageField({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].bone === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnCorpse pushes a real corpse to G.corpses; carnageProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;                            // hero's current tile
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 3, ty: h.ty, rank: "boss" } });   // inject BOSS corpse 3 tiles east (~96px, in radius), weight 3
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });             // hero back to origin tile
    const sp = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
    const vm = window.__dev.carnageField();
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { sp, corpseCount: vm.corpseCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnCorpse empuja cadáver REAL a G.corpses; carnageProbe lee score REAL>0 + cadáver 'boss' (weight≥3) en la lista + corpseCount≥1",
     server6.sp && server6.sp.score > 0 && server6.sp.count >= 1 && server6.sp.corpses[0] && server6.sp.corpses[0].rank === "boss" && server6.sp.corpses[0].weight >= 3 && server6.corpseCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs spoils(#79)/enrage(#78)/hazard(#77)/variant(#76): a corpse is NOT a drop/live-boss/hazard/mob. + lootQuality unchanged. Corre en un tile REMOTO fresco (deltas) para aislar de cadáveres previos.
  const diff = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h0 = window.__dev.carnageField().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                   // tile remoto fresco, ~120 tiles al oeste del cluster de inyecciones (origen)
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    // baseline en el tile fresco (esperado 0; deltas lo hacen robusto a cualquier cadáver natural)
    const baseCarnage = window.__dev.carnageField().score;
    const spoBefore = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrBefore = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazBefore = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const lootBefore = window.__dev.carnageField().lootQualityFloor;
    // inyecta 2 cadáveres (boss weight3 + champion weight2 = score 5 ⇒ T2) al este dentro de radio
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 3, ty: RY, rank: "boss" } });
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 4, ty: RY, rank: "champion" } });
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.carnageField();
    const spoAfter = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;   // un cadáver NO es un drop ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;   // un cadáver NO es un jefe vivo ⇒ sin cambio
    const hazAfter = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;   // un cadáver NO es un hazard ⇒ sin cambio
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;   // un cadáver NO es un mob vivo ⇒ sin cambio
    const lootAfter = window.__dev.carnageField().lootQualityFloor;       // densidad-de-cadáveres ≠ calidad-de-tirada ⇒ sin cambio
    const so = window.__dev.spoilsField ? window.__dev.spoilsField() : null;
    const en = window.__dev.enrageSurge ? window.__dev.enrageSurge() : null;
    const hz = window.__dev.hazardSurge ? window.__dev.hazardSurge() : null;
    const vs = window.__dev.variantSurge ? window.__dev.variantSurge() : null;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { baseCarnage, score: vm.score, tier: vm.tier, bone: vm.bone,
      spoBefore, spoAfter, enrBefore, enrAfter, hazBefore, hazAfter, varBefore, varAfter, lootBefore, lootAfter,
      soEnabled: so ? so.enabled : null, enEnabled: en ? en.enabled : null, hzEnabled: hz ? hz.enabled : null, vsEnabled: vs ? vs.enabled : null };
  });
  const diffOK = diff.score > diff.baseCarnage && diff.tier >= 2 && diff.bone >= 1 &&      // cadáveres: carnicería fires (delta>0, boss+champion=5⇒T2)
    diff.spoAfter === diff.spoBefore && diff.enrAfter === diff.enrBefore &&                // botín/furia IGNORAN el cadáver
    diff.hazAfter === diff.hazBefore && diff.varAfter === diff.varBefore &&                // hazard/variante IGNORAN el cadáver
    diff.lootAfter === diff.lootBefore &&                                                  // lootQuality (calidad) NO cambia con densidad
    diff.soEnabled === true && diff.enEnabled === true && diff.hzEnabled === true && diff.vsEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: inyectar cadáveres ⇒ carnicería sube a T2 MIENTRAS botín(#79)/furia(#78)/hazard(#77)/variante(#76) IGNORAN (un cadáver NO es drop/jefe-vivo/hazard/mob) y lootQuality NO cambia (densidad≠calidad); botín/furia/hazard/variante LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL boneFind: forageBonePreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "normal" } });   // ~128px, in radius, weight 1
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.carnageField();
    const nearPrev = nearVm.forageBonePreview, nearBone = nearVm.bone;
    window.__dev.carnageField({ tp: { tx: h.tx + 40, ty: h.ty } });        // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.carnageField();
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { nearPrev, nearBone, farPrev: farVm.forageBonePreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearBone && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL boneFind: forageBonePreview con cadáveres cerca ⇒ bone>0 (==carnageFieldBoneBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: bone never exceeds carnageBoneCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe.bone);
    return { max: Math.max(...vals), cap: window.__dev.carnageField().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce bone>carnageBoneCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ bone 0 + forageBonePreview 0 even with corpses glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx, ty: h.ty, rank: "boss" } });    // boss corpse ON TOP of hero tile ⇒ score>0 ⇒ would be T2
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.carnageField({ enabled: false });                        // now OFF
    const off = window.__dev.carnageField();
    window.__dev.carnageField({ enabled: true }); window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ enabled: false });
    return { preview: off.forageBonePreview, bone: off.bone, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.bone === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, carnageFieldBoneBonus(cadáveres pegados)==0 + forageBonePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip carnageField OFF→ON at the SAME state ⇒ los 17 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de carnicería.
  const orth = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "normal" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.carnageField({ enabled: false });
    const snap = () => { const s = window.__dev.carnageField(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview }; };
    const peersOff = snap();                                             // CARNICERÍA OFF (misma posición del héroe)
    window.__dev.carnageField({ enabled: true });
    const peersOn = snap();                                              // CARNICERÍA ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the carnage signal
    const beforeArc = window.__dev.carnageField();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.carnageField();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.bone === afterArc.bone;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD boneFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind: flip carnicería OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de carnicería; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 21 arc flags served true; CARNAGE_FIELD_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const cfsDark = flag("CARNAGE_FIELD_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 21 mecanismos del arco #59-#79 served enabled:true; CARNAGE_FIELD_SURGE served false (DARK #80)",
     arcAllOn && cfsDark && arc.length === 21, `carnageField=${flag("CARNAGE_FIELD_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Osario:" drawn ON+cadáveres near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Osario:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "boss" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Osario:\" se DIBUJA ON+cadáveres cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.carnageField({ enabled: true }); window.__dev.carnageField({ clearCorpses: true }); const h = window.__dev.carnageField().hero; window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 3, ty: h.ty, rank: "boss" } }); window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "champion" } }); window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME corpses at SAME tiles + hero at SAME tile ⇒ score/tier/bone + carnageProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten cadáveres + tp héroe a las MISMAS coordenadas (carnageFieldScore es fn pura de G.corpses+posiciones). Lejos del cluster de inyecciones previas de A.
  const CORPSE_A = { tx: 60, ty: 40 }, CORPSE_B = { tx: 61, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // 2 corpses 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((CA, CB, HT) => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: CA.tx, ty: CA.ty, rank: "boss" } });    // weight 3
    window.__dev.carnageField({ spawnCorpse: { tx: CB.tx, ty: CB.ty, rank: "normal" } });  // weight 1
    window.__dev.carnageField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.carnageField();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, bone: p.bone }; });   // LUT PURA
    const sp = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { score: vm.score, tier: vm.tier, bone: vm.bone, corpseCount: vm.corpseCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, CORPSE_A, CORPSE_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // corpseCount NO se compara globalmente: es el nº AMBIENTAL de cadáveres con peso en TODO el mundo, contaminado por cadáveres naturales de combate previo (A acumuló; B es fresco; además despawnan en CORPSE_LIFE). El SIGNAL determinista per-snapshot — score/tier/bone + carnageProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #75/#76/#77/#78/#79; clearCorpses aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.bone === B.bone && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMOS cadáveres+héroe ⇒ score/tier/bone + carnageProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; corpseCount global ambiental excluido — contaminado por cadáveres naturales de A; carnageProbe cuenta SÓLO en radio tras clearCorpses)",
     conv, `A={score:${A.score},tier:${A.tier},bone:${A.bone},cc:${A.corpseCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},bone:${B.bone},cc:${B.corpseCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.carnageField({ enabled: false }));
  await pageB.evaluate(() => window.__dev.carnageField({ enabled: false }));

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
