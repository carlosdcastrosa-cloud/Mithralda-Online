// CAS-2464 — self-verify for HAZARD DE ARENA ACTIVO (DARK, ARENA_HAZARD_SURGE.enabled:false). EVO mecánica #77 (serializa tras #76 ENCOUNTER_VARIANT_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 18 LIVE #59-#76.
// (A) EJE FRESCO = PRESENCIA/TIPO/INTENSIDAD DE UN HAZARD DE ARENA ACTIVO (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = el subsistema ARENA_HAZARDS (CAS-2094/2103, LIVE) planta DETERMINISTA por-spawn un HAZARD AMBIENTAL telegrafiado (maybeSpawnHazard/updateHazards, arenaHazardRng ISOLADO off-srand); cada hazard vivo {x,y,r,type,phase} en G.hazards (estado de sim replicado, el MISMO campo que el render lee para el tint/glyph/anillo del hazard).
//     hazardSurgeScore(hero)=Σ hazardWeights[hz.type] sobre los hazards en fase "active" dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin hazard activo cerca ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. telegraph/fade/sin type ⇒ peso 0.
//     ⊥ #76 (variante = MODIFICADOR DE COMPORTAMIENTO sobre los MOBS leído de e.variant/G.enemies, subsistema ENCOUNTER_VARIANTS; hazard = PELIGRO AMBIENTAL DE LA ARENA leído de G.hazards, subsistema ARENA_HAZARDS — independiente de qué mobs haya), ⊥ #75 (evento de zona = POIs de EVENTO en G.zoneEvents.pois; hazard = peligro ambiental telegrafiado, otro contenedor), ⊥ #74 (afijo = CALIDAD estática de UN mob leída de mobAffixes(e), subsistema MOB_AFFIX; un hazard NO es un mob), ⊥ #73 (apex = DISTANCIA a UN jefe; esto = presencia/tipo de hazards), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de un peligro de arena), ⊥ #69 (force-ratio = ENGANCHADOS), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = healPotency (recompensa de brasas restaurativas por forrajeo DENTRO de un hazard activo — NINGUNA de las 18 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73, flaskPotency #74, gemFind #75, socketFind #76) está LLENA ⇒ pivota a una moneda FRESCA (h.hazardMotes, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio hazardMoteCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el tier = función PURA de la SUMA DE PESO DE HAZARDS ACTIVOS en radio. Inyectar un hazard activo ⇒ hazardSurge T≥1 por PRESENCIA DE HAZARD — mientras afijo(#74) lo IGNORA (un hazard NO es un mob ⇒ dangerProbe score NO cambia), evento(#75) lo IGNORA (un hazard NO es un POI ⇒ zoneEvent score NO cambia), variante(#76) lo IGNORA (un hazard NO es un mob-variante ⇒ variantProbe score NO cambia) y apex(#73) lo IGNORA (un hazard NO es un jefe ⇒ apex tier 0). La señal es de fuente distinta (hazard ambiental de la arena, no calidad-de-afijo ni estado-de-evento ni variante-de-mob ni distancia-a-jefe).
// ★ REAL SERVER-AUTH (check 6): spawnHazard inyecta un hazard REAL (mirror del push natural de maybeSpawnHazard) en G.hazards; hazardProbe lee el score REAL + la lista de hazards en radio (x,y,type,phase,weight) + activeHazardCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageMotesPreview = hazardSurgeMoteBonus(score). Hazard cerca ⇒ motes>0; sin hazard / lejos ⇒ 0.
// ★ SUB-CAP (check 9): motes EFECTIVA = min(hazardMoteCap=2, tier.motes). Ningún score produce motes>2.
// ★ BYTE-NEUTRAL OFF (check 10): con ARENA_HAZARD_SURGE OFF, hazardSurgeMoteBonus(cualquier score)==0 y forageMotesPreview==0 aun con un hazard PEGADO al héroe ⇒ 0 brasa al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): el hazard (score/tier/motes) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind; activar APEX/SCARCITY (los primos recompensa-forrajeo) NO cambia la señal de hazard, y el hazard ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 18 mecánicas del arco #59-#76 siguen served enabled:true; ARENA_HAZARD_SURGE served false (DARK #77).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO hazard en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/motes + hazardProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). hazardSurgeScore es función PURA de hazards+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.hazardSurge (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnHazard inyección REAL + hazardProbe lectura server-auth) + peer channels (ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk/scarcity/apex/affixDanger/zoneEvent/variantSurge) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Hazard:").
//
// Checks:
//   1  boots to play, __dev.hazardSurge + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): ARENA_HAZARD_SURGE.enabled false AND G.hazardSurge NUNCA se crea (gExists false); tier 0, score 0, motes 0, forageMotesPreview 0, channel healPotency, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'hazardSurge'/'healPotency' Y sin 'hazardMotes' (brasas transitorias, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de brasa NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0→T0/0, 1/2→T1/1, 3/6→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnHazard inyecta hazard REAL activo; hazardProbe lee score REAL>0 + hazard en la lista + activeHazardCount≥1.
//   7  ★ DIFERENCIADOR/⊥: hazard activo en radio ⇒ T≥1 por PRESENCIA DE HAZARD mientras afijo(#74) lo IGNORA (dangerProbe sin cambio), evento(#75) lo IGNORA (zoneEvent sin cambio), variante(#76) lo IGNORA (variantProbe sin cambio) y apex(#73) lo IGNORA (apex tier 0); afijo/apex/evento/variante LIVE coexisten ⊥.
//   8  CANAL healPotency: forageMotesPreview con hazard cerca ⇒ motes>0 (== hazardSurgeMoteBonus); sin hazard / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe motes nunca > hazardMoteCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, hazardSurgeMoteBonus(hazard pegado)==0 y forageMotesPreview==0 ⇒ 0 brasa al seam (byte-id).
//  11  ★ ORTOGONALIDAD healPotency ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind: el hazard NO cambia peers; activar APEX/SCARCITY NO cambia la señal de hazard; hazard ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 18 mecanismos del arco #59-#76 served enabled:true; ARENA_HAZARD_SURGE served false (DARK #77).
//  13  render badge "Hazard:" se DIBUJA ON+hazard cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMO hazard en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/motes + hazardProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2464-hazardsurge-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2464");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,motes}: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (capado a 2)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.hazardSurge + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.hazardSurge());
  ok("2 byte-id OFF (fresh boot): ARENA_HAZARD_SURGE.enabled false AND G.hazardSurge NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.motes === 0 && dark.forageMotesPreview === 0 && dark.channel === "healPotency" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} motes=${dark.motes} preview=${dark.forageMotesPreview} channel=${dark.channel} tag="${dark.tag}" activeHazardCount=${dark.activeHazardCount}`);

  // 3 save OFF has no hazardSurge/healPotency/hazardMotes key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(hazardSurge|healPotency)[A-Za-z]*"\s*:/.test(saveOff);
  const noMoteKey = !/"hazardMotes"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'hazardSurge'/'healPotency' NI 'hazardMotes' (brasas transitorias; estado 100% derivado)", noFeatKey && noMoteKey, `noFeatKey=${noFeatKey} noMoteKey=${noMoteKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.hazardSurge({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.hazardSurge({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las brasas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.hazardSurge({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].motes === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnHazard injects a real active hazard; hazardProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;                             // hero's current tile
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "magma", phase: "active" } });   // inject magma hazard 3 tiles east (~96px, in radius)
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });              // hero back to origin tile
    const hp = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe;
    const vm = window.__dev.hazardSurge();
    window.__dev.hazardSurge({ enabled: false });
    return { hp, activeHazardCount: vm.activeHazardCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnHazard inyecta hazard REAL activo; hazardProbe lee score REAL>0 + hazard 'magma' en la lista + activeHazardCount≥1",
     server6.hp && server6.hp.score > 0 && server6.hp.count >= 1 && server6.hp.hazards[0] && server6.hp.hazards[0].type === "magma" && server6.hp.hazards[0].phase === "active" && server6.activeHazardCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥: hazard ⇒ T≥1 by HAZARD PRESENCE, while affix(#74) IGNORES it (dangerProbe unchanged), event(#75) IGNORES it (zoneEvent unchanged), variant(#76) IGNORES it (variantProbe unchanged) and apex(#73) IGNORES it (apex tier 0). AFFIX/APEX/EVENT/VARIANT LIVE coexist ⊥.
  const diff = await page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // afijo score ANTES del hazard (mismo snapshot congelado)
    const evBefore = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : 0;             // evento score ANTES
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;  // variante score ANTES
    const hsBefore = window.__dev.hazardSurge().score;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 5, ty: h.ty, type: "magma", phase: "active" } });   // hazard ~160px (in radius) → surge por PRESENCIA DE HAZARD
    const affixAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;    // afijo score DESPUÉS — un hazard NO es un mob ⇒ SIN cambio
    const evAfter = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : 0;              // evento score DESPUÉS — un hazard NO es un POI ⇒ SIN cambio
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;   // variante score DESPUÉS — un hazard NO es un mob-variante ⇒ SIN cambio
    const vm = window.__dev.hazardSurge();
    const ap = window.__dev.apex ? window.__dev.apex() : null;             // apex reward-forage cousin LIVE — un hazard NO es jefe ⇒ apex tier 0
    const ev = window.__dev.zoneEvent ? window.__dev.zoneEvent() : null;   // evento reward-forage cousin LIVE (#75)
    const ad = window.__dev.affixDanger ? window.__dev.affixDanger() : null; // afijo reward-forage cousin LIVE (#74)
    const vs = window.__dev.variantSurge ? window.__dev.variantSurge() : null; // variante reward-forage cousin LIVE (#76)
    window.__dev.hazardSurge({ enabled: false });
    return { tier: vm.tier, score: vm.score, motes: vm.motes, hsBefore, affixBefore, affixAfter, evBefore, evAfter, varBefore, varAfter, apexTier: ap ? ap.tier : null, apEnabled: ap ? ap.enabled : null, evEnabled: ev ? ev.enabled : null, adEnabled: ad ? ad.enabled : null, vsEnabled: vs ? vs.enabled : null };
  });
  const diffOK = diff.tier >= 1 && diff.score >= 1 && diff.motes >= 1 && diff.score > diff.hsBefore && diff.affixAfter === diff.affixBefore && diff.evAfter === diff.evBefore && diff.varAfter === diff.varBefore && diff.apexTier === 0 && diff.apEnabled === true && diff.evEnabled === true && diff.adEnabled === true && diff.vsEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: hazard ⇒ T≥1 por PRESENCIA DE HAZARD mientras afijo(#74) lo IGNORA (dangerProbe sin cambio), evento(#75) lo IGNORA (zoneEvent sin cambio), variante(#76) lo IGNORA (variantProbe sin cambio) y apex(#73) lo IGNORA (apex tier 0); afijo/apex/evento/variante LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL healPotency: forageMotesPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 4, ty: h.ty, type: "magma", phase: "active" } });   // ~128px, in radius
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.hazardSurge();
    const nearPrev = nearVm.forageMotesPreview, nearMotes = nearVm.motes;
    window.__dev.hazardSurge({ tp: { tx: h.tx + 40, ty: h.ty } });         // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.hazardSurge();
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.hazardSurge({ enabled: false });
    return { nearPrev, nearMotes, farPrev: farVm.forageMotesPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearMotes && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL healPotency: forageMotesPreview con hazard cerca ⇒ motes>0 (==hazardSurgeMoteBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: motes never exceeds hazardMoteCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.hazardSurge({ scoreProbe: { score: s } }).scoreProbe.motes);
    return { max: Math.max(...vals), cap: window.__dev.hazardSurge().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce motes>hazardMoteCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ motes 0 + forageMotesPreview 0 even with hazard glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx, ty: h.ty, type: "magma", phase: "active" } });     // hazard ON TOP of hero tile ⇒ score>0 ⇒ would be T1
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.hazardSurge({ enabled: false });                         // now OFF
    const off = window.__dev.hazardSurge();
    return { preview: off.forageMotesPreview, motes: off.motes, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.motes === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, hazardSurgeMoteBonus(hazard pegado)==0 + forageMotesPreview==0 ⇒ 0 brasa al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip hazardSurge OFF→ON at the SAME state ⇒ los 13 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de hazard.
  const orth = await page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 4, ty: h.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.hazardSurge({ enabled: false });
    const snap = () => { const s = window.__dev.hazardSurge(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview }; };
    const peersOff = snap();                                             // HAZARD OFF (misma posición del héroe)
    window.__dev.hazardSurge({ enabled: true });
    const peersOn = snap();                                              // HAZARD ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the hazard signal
    const beforeArc = window.__dev.hazardSurge();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.hazardSurge();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.hazardSurge({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.motes === afterArc.motes;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD healPotency ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind: flip hazard OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de hazard; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 18 arc flags served true; ARENA_HAZARD_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ahsDark = flag("ARENA_HAZARD_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 18 mecanismos del arco #59-#76 served enabled:true; ARENA_HAZARD_SURGE served false (DARK #77)",
     arcAllOn && ahsDark && arc.length === 18, `hazardSurge=${flag("ARENA_HAZARD_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Hazard:" drawn ON+hazard near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Hazard:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 4, ty: h.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.hazardSurge({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Hazard:\" se DIBUJA ON+hazard cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.hazardSurge({ enabled: true }); const h = window.__dev.hazardSurge().hero; window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 4, ty: h.ty, type: "magma", phase: "active" } }); window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.hazardSurge({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence: SAME hazard at SAME tile + hero at SAME tile ⇒ score/tier/motes + hazardProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // A FIXED absolute tile so both clients teleport hero + hazard to the SAME coordinates (hazardSurgeScore es fn pura de hazards+posiciones). Lejos del cluster de inyecciones previas de A.
  const HZ_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // hazard 3 tiles west of hero (~96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((HZT, HT) => {
    window.__dev.hazardSurge({ enabled: true });
    window.__dev.hazardSurge({ spawnHazard: { tx: HZT.tx, ty: HZT.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.hazardSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.hazardSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, motes: p.motes }; });   // LUT PURA
    const hp = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.hazardSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, motes: vm.motes, activeHazardCount: vm.activeHazardCount, hpScore: hp.score, hpCount: hp.count, lut, fp };
  }, HZ_TILE, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // activeHazardCount NO se compara: es el nº AMBIENTAL de hazards activos, contaminado por las inyecciones de PRUEBA que el cliente A acumuló en los 13 checks previos (B es fresco) + los hazards naturales de las peleas de jefe. El SIGNAL determinista per-snapshot — score/tier/motes + hazardProbe(score,count) + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #73/#74/#75/#76).
  const conv = A.score === B.score && A.tier === B.tier && A.motes === B.motes && A.hpScore === B.hpScore && A.hpCount === B.hpCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO hazard+héroe ⇒ score/tier/motes + hazardProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; activeHazardCount ambiental excluido — contaminado por inyecciones de prueba de A + hazards naturales)",
     conv, `A={score:${A.score},tier:${A.tier},motes:${A.motes},count:${A.activeHazardCount},hpScore:${A.hpScore},hpCount:${A.hpCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},motes:${B.motes},count:${B.activeHazardCount},hpScore:${B.hpScore},hpCount:${B.hpCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.hazardSurge({ enabled: false }));
  await pageB.evaluate(() => window.__dev.hazardSurge({ enabled: false }));

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
