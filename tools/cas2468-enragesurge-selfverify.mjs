// CAS-2468 — self-verify for FASE DE ENFURECIMIENTO DE JEFE (DARK, BOSS_ENRAGE_SURGE.enabled:false). EVO mecánica #78 (serializa tras #77 ARENA_HAZARD_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 19 LIVE #59-#77.
// (A) EJE FRESCO = PRESENCIA/INTENSIDAD DE UNA FASE DE ENFURECIMIENTO DE JEFE (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = el subsistema cambio-de-fase-capstone (CAS-65, LIVE) marca DETERMINISTA por-daño un ENFURECIMIENTO sobre un jefe/campeón (al cruzar e.hp<=e.maxHp*e.enrageAt UNA vez ⇒ e.enraged=true + acelera spd + aprieta tells + habilita slam-radial); e.enraged/e.isBoss/e.capstone en G.enemies (estado de sim replicado, el MISMO flag que la AI lee para la fase-2 REAL).
//     enrageSurgeScore(hero)=Σ enrageWeights[kind] sobre los jefes/campeones VIVOS ENFURECIDOS (e.enraged) dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin furia cerca ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. no-enfurecido (fase-1 tope-de-HP)/muerto/no-jefe ⇒ peso 0.
//     ⊥ #77 (hazard = PELIGRO AMBIENTAL de la arena leído de G.hazards; enrage = ESTADO DE FASE de un JEFE leído de e.enraged/G.enemies, otro contenedor), ⊥ #76 (variante = MODIFICADOR DE COMPORTAMIENTO horneado al spawn sobre mobs NATURALES leído de e.variant [ENCOUNTER_VARIANTS, id-set disjunto]; enrage = TRANSICIÓN DE FASE POR-DAÑO de un capstone [CAS-65, e.enraged] — un mob-variante natural NO es capstone ⇒ sin solape de portador), ⊥ #74 (afijo = CALIDAD estática de UN mob; enrage = ESTADO DINÁMICO de fase-2), ⊥ #73 (apex = **DISTANCIA** al jefe más cercano SEA CUAL SEA su fase [phase-blind]; enrage = **PRESENCIA DE LA FASE ENFURECIDA** en radio — ejes ortogonales sobre el mismo cuerpo), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de una furia), ⊥ #69 (force-ratio = ENGANCHADOS), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = trophyFind (recompensa de trofeos de guerra por forrajeo mientras un jefe está ENFURECIDO — NINGUNA de las 19 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73, flaskPotency #74, gemFind #75, socketFind #76, healPotency #77) está LLENA ⇒ pivota a una moneda FRESCA (h.enrageTrophies, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio enrageTrophyCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en la FASE (e.enraged), NO en la mera presencia/distancia del jefe. Un jefe en fase-1 (tope-de-HP) cerca ⇒ apex(#73) lo puntúa por DISTANCIA (apexTier≥1) PERO enrage=0. Enfurecerlo (o inyectar un jefe enfurecido a la MISMA distancia) ⇒ enrage 0→>0 MIENTRAS apexTier queda IDÉNTICO (apex es phase-blind: mismo cuerpo, misma distancia). Y hazard(#77) lo IGNORA (un jefe NO es un hazard ⇒ hazardProbe sin cambio), variante(#76) lo IGNORA (un capstone NO tiene e.variant ⇒ variantProbe sin cambio), afijo(#74) lo IGNORA (dangerProbe sin cambio).
// ★ REAL SERVER-AUTH (check 6): spawnEnraged inyecta un jefe REAL (spawnEnemy + capstone + transición de fase CAS-65) en G.enemies; enrageProbe lee el score REAL + la lista de jefes enfurecidos en radio (x,y,kind,weight) + enragedCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageTrophiesPreview = enrageSurgeTrophyBonus(score). Furia cerca ⇒ trophies>0; sin furia / lejos ⇒ 0.
// ★ SUB-CAP (check 9): trophies EFECTIVA = min(enrageTrophyCap=2, tier.trophies). Ningún score produce trophies>2.
// ★ BYTE-NEUTRAL OFF (check 10): con BOSS_ENRAGE_SURGE OFF, enrageSurgeTrophyBonus(cualquier score)==0 y forageTrophiesPreview==0 aun con un jefe enfurecido PEGADO al héroe ⇒ 0 trofeo al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la furia (score/tier/trophies) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency; activar APEX/SCARCITY (los primos recompensa-forrajeo) NO cambia la señal de furia, y la furia ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 19 mecánicas del arco #59-#77 siguen served enabled:true; BOSS_ENRAGE_SURGE served false (DARK #78).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO jefe enfurecido en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/trophies + enrageProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). enrageSurgeScore es función PURA de e.enraged+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.enrageSurge (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnEnraged inyección REAL + enrageProbe lectura server-auth) + peer channels (ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk/scarcity/apex/affixDanger/zoneEvent/variantSurge/hazardSurge) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Furia:").
//
// Checks:
//   1  boots to play, __dev.enrageSurge + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): BOSS_ENRAGE_SURGE.enabled false AND G.enrageSurge NUNCA se crea (gExists false); tier 0, score 0, trophies 0, forageTrophiesPreview 0, channel trophyFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'enrageSurge'/'trophyFind' Y sin 'enrageTrophies' (trofeos transitorios, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de trofeo NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0→T0/0, 1/2→T1/1, 3/6→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnEnraged inyecta jefe REAL enfurecido; enrageProbe lee score REAL>0 + jefe en la lista + enragedCount≥1.
//   7  ★ DIFERENCIADOR/⊥: jefe fase-1 cerca ⇒ apexTier≥1 (distancia) PERO enrage 0; enfurecer a MISMA distancia ⇒ enrage 0→≥1 MIENTRAS apexTier IDÉNTICO (apex phase-blind); hazard(#77) lo IGNORA, variante(#76) lo IGNORA, afijo(#74) lo IGNORA; apex/hazard/variante/afijo LIVE coexisten ⊥.
//   8  CANAL trophyFind: forageTrophiesPreview con furia cerca ⇒ trophies>0 (== enrageSurgeTrophyBonus); sin furia / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe trophies nunca > enrageTrophyCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, enrageSurgeTrophyBonus(jefe enfurecido pegado)==0 y forageTrophiesPreview==0 ⇒ 0 trofeo al seam (byte-id).
//  11  ★ ORTOGONALIDAD trophyFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency: la furia NO cambia peers; activar APEX/SCARCITY NO cambia la señal de furia; furia ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 19 mecanismos del arco #59-#77 served enabled:true; BOSS_ENRAGE_SURGE served false (DARK #78).
//  13  render badge "Furia:" se DIBUJA ON+furia cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMO jefe enfurecido en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/trophies + enrageProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2468-enragesurge-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2468");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,trophies}: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (capado a 2)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.enrageSurge + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.enrageSurge());
  ok("2 byte-id OFF (fresh boot): BOSS_ENRAGE_SURGE.enabled false AND G.enrageSurge NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.trophies === 0 && dark.forageTrophiesPreview === 0 && dark.channel === "trophyFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} trophies=${dark.trophies} preview=${dark.forageTrophiesPreview} channel=${dark.channel} tag="${dark.tag}" enragedCount=${dark.enragedCount}`);

  // 3 save OFF has no enrageSurge/trophyFind/enrageTrophies key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(enrageSurge|trophyFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noTrophyKey = !/"enrageTrophies"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'enrageSurge'/'trophyFind' NI 'enrageTrophies' (trofeos transitorios; estado 100% derivado)", noFeatKey && noTrophyKey, `noFeatKey=${noFeatKey} noTrophyKey=${noTrophyKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.enrageSurge({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.enrageSurge({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; los trofeos NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.enrageSurge({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].trophies === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnEnraged injects a real enraged boss; enrageProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h = window.__dev.enrageSurge().hero;                             // hero's current tile
    window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 3, ty: h.ty, kind: "boss" } });   // inject ENRAGED boss 3 tiles east (~96px, in radius)
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });              // hero back to origin tile
    const ep = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe;
    const vm = window.__dev.enrageSurge();
    window.__dev.enrageSurge({ enabled: false });
    return { ep, enragedCount: vm.enragedCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnEnraged inyecta jefe REAL enfurecido; enrageProbe lee score REAL>0 + jefe 'boss' en la lista + enragedCount≥1",
     server6.ep && server6.ep.score > 0 && server6.ep.count >= 1 && server6.ep.mobs[0] && server6.ep.mobs[0].kind === "boss" && server6.ep.mobs[0].weight >= 2 && server6.enragedCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs apex(#73, also reads bosses): phase-blind apex vs phase-keyed enrage. + hazard/variant/affix IGNORE the boss. Corre en un tile REMOTO fresco (deltas) para aislar de los jefes inyectados en checks previos.
  const diff = await page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h0 = window.__dev.enrageSurge().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                   // tile remoto fresco, ~120 tiles al oeste del cluster de inyecciones (origen)
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    // baseline en el tile fresco (esperado 0; deltas lo hacen robusto a cualquier jefe natural)
    const baseEnrage = window.__dev.enrageSurge().score;
    const baseApexTier = window.__dev.apex ? window.__dev.apex().tier : null;
    const hazBefore = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const affixBefore = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;
    // (a) inject a PHASE-1 (non-enraged) boss 3 tiles east → apex VE al jefe por DISTANCIA, enrage NO (no enfurecido)
    window.__dev.enrageSurge({ spawnEnraged: { tx: RX + 3, ty: RY, kind: "boss", enraged: false } });
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const apexPhase1 = window.__dev.apex ? window.__dev.apex().tier : null;   // apex tier con jefe fase-1 (por distancia)
    const enragePhase1 = window.__dev.enrageSurge().score;                    // enrage con jefe fase-1 = baseline (no enfurecido)
    // (b) ahora inyecta un jefe ENFURECIDO a la MISMA distancia (mismo tile) → enrage sube, apex IDÉNTICO (misma distancia mínima)
    window.__dev.enrageSurge({ spawnEnraged: { tx: RX + 3, ty: RY, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const apexEnraged = window.__dev.apex ? window.__dev.apex().tier : null;   // apex tier con jefe enfurecido a MISMA distancia = IDÉNTICO (phase-blind)
    const vm = window.__dev.enrageSurge();
    const hazAfter = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;   // un jefe NO es un hazard ⇒ sin cambio
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;   // un capstone NO tiene e.variant ⇒ sin cambio
    const affixAfter = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;   // sin afijo ⇒ sin cambio
    const ap = window.__dev.apex ? window.__dev.apex() : null;
    const hz = window.__dev.hazardSurge ? window.__dev.hazardSurge() : null;
    const vs = window.__dev.variantSurge ? window.__dev.variantSurge() : null;
    const ad = window.__dev.affixDanger ? window.__dev.affixDanger() : null;
    window.__dev.enrageSurge({ enabled: false });
    return { baseEnrage, baseApexTier, apexPhase1, enragePhase1, apexEnraged, tier: vm.tier, score: vm.score, trophies: vm.trophies,
      hazBefore, hazAfter, varBefore, varAfter, affixBefore, affixAfter,
      apEnabled: ap ? ap.enabled : null, hzEnabled: hz ? hz.enabled : null, vsEnabled: vs ? vs.enabled : null, adEnabled: ad ? ad.enabled : null };
  });
  const diffOK = diff.enragePhase1 === diff.baseEnrage &&                    // jefe fase-1: enrage NO cambia (ignora la fase-1) — key en la FASE
    diff.apexPhase1 >= 1 &&                                                   // apex lo VE (por distancia)
    diff.score > diff.enragePhase1 && diff.tier >= 1 && diff.trophies >= 1 && // jefe enfurecido: enrage fires (delta>0)
    diff.apexEnraged === diff.apexPhase1 &&                                   // apex IDÉNTICO (phase-blind: misma distancia)
    diff.hazAfter === diff.hazBefore && diff.varAfter === diff.varBefore && diff.affixAfter === diff.affixBefore &&   // hazard/variante/afijo IGNORAN el jefe
    diff.apEnabled === true && diff.hzEnabled === true && diff.vsEnabled === true && diff.adEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: jefe fase-1 ⇒ apexTier≥1 (distancia) PERO enrage 0; enfurecer a MISMA distancia ⇒ enrage 0→≥1 MIENTRAS apexTier IDÉNTICO (apex phase-blind); hazard/variante/afijo IGNORAN el jefe; apex/hazard/variante/afijo LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL trophyFind: forageTrophiesPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h = window.__dev.enrageSurge().hero;
    window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 4, ty: h.ty, kind: "champion" } });   // ~128px, in radius
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.enrageSurge();
    const nearPrev = nearVm.forageTrophiesPreview, nearTrophies = nearVm.trophies;
    window.__dev.enrageSurge({ tp: { tx: h.tx + 40, ty: h.ty } });         // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.enrageSurge();
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.enrageSurge({ enabled: false });
    return { nearPrev, nearTrophies, farPrev: farVm.forageTrophiesPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearTrophies && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL trophyFind: forageTrophiesPreview con furia cerca ⇒ trophies>0 (==enrageSurgeTrophyBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: trophies never exceeds enrageTrophyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe.trophies);
    return { max: Math.max(...vals), cap: window.__dev.enrageSurge().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce trophies>enrageTrophyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ trophies 0 + forageTrophiesPreview 0 even with enraged boss glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h = window.__dev.enrageSurge().hero;
    window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx, ty: h.ty, kind: "boss" } });     // enraged boss ON TOP of hero tile ⇒ score>0 ⇒ would be T1
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.enrageSurge({ enabled: false });                         // now OFF
    const off = window.__dev.enrageSurge();
    return { preview: off.forageTrophiesPreview, trophies: off.trophies, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.trophies === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, enrageSurgeTrophyBonus(jefe enfurecido pegado)==0 + forageTrophiesPreview==0 ⇒ 0 trofeo al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip enrageSurge OFF→ON at the SAME state ⇒ los 14 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de furia.
  const orth = await page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h = window.__dev.enrageSurge().hero;
    window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 4, ty: h.ty, kind: "champion" } });
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.enrageSurge({ enabled: false });
    const snap = () => { const s = window.__dev.enrageSurge(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview }; };
    const peersOff = snap();                                             // FURIA OFF (misma posición del héroe)
    window.__dev.enrageSurge({ enabled: true });
    const peersOn = snap();                                              // FURIA ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the enrage signal
    const beforeArc = window.__dev.enrageSurge();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.enrageSurge();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.enrageSurge({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.trophies === afterArc.trophies;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD trophyFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency: flip furia OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de furia; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 19 arc flags served true; BOSS_ENRAGE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const besDark = flag("BOSS_ENRAGE_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 19 mecanismos del arco #59-#77 served enabled:true; BOSS_ENRAGE_SURGE served false (DARK #78)",
     arcAllOn && besDark && arc.length === 19, `enrageSurge=${flag("BOSS_ENRAGE_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Furia:" drawn ON+furia near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Furia:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.enrageSurge({ enabled: true });
    const h = window.__dev.enrageSurge().hero;
    window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 4, ty: h.ty, kind: "boss" } });
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.enrageSurge({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Furia:\" se DIBUJA ON+furia cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.enrageSurge({ enabled: true }); const h = window.__dev.enrageSurge().hero; window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 4, ty: h.ty, kind: "boss" } }); window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.enrageSurge({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence: SAME enraged boss at SAME tile + hero at SAME tile ⇒ score/tier/trophies + enrageProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // A FIXED absolute tile so both clients teleport hero + boss to the SAME coordinates (enrageSurgeScore es fn pura de e.enraged+posiciones). Lejos del cluster de inyecciones previas de A.
  const BOSS_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // boss 3 tiles west of hero (~96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((BT, HT) => {
    window.__dev.enrageSurge({ enabled: true });
    window.__dev.enrageSurge({ spawnEnraged: { tx: BT.tx, ty: BT.ty, kind: "boss" } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.enrageSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, trophies: p.trophies }; });   // LUT PURA
    const ep = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.enrageSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, trophies: vm.trophies, enragedCount: vm.enragedCount, epScore: ep.score, epCount: ep.count, lut, fp };
  }, BOSS_TILE, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // enragedCount NO se compara: es el nº AMBIENTAL de jefes enfurecidos, contaminado por las inyecciones de PRUEBA que el cliente A acumuló en los checks previos (B es fresco) + jefes naturales. El SIGNAL determinista per-snapshot — score/tier/trophies + enrageProbe(score,count) + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #73/#74/#75/#76/#77).
  const conv = A.score === B.score && A.tier === B.tier && A.trophies === B.trophies && A.epScore === B.epScore && A.epCount === B.epCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO jefe enfurecido+héroe ⇒ score/tier/trophies + enrageProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; enragedCount ambiental excluido — contaminado por inyecciones de prueba de A + jefes naturales)",
     conv, `A={score:${A.score},tier:${A.tier},trophies:${A.trophies},count:${A.enragedCount},epScore:${A.epScore},epCount:${A.epCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},trophies:${B.trophies},count:${B.enragedCount},epScore:${B.epScore},epCount:${B.epCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.enrageSurge({ enabled: false }));
  await pageB.evaluate(() => window.__dev.enrageSurge({ enabled: false }));

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
