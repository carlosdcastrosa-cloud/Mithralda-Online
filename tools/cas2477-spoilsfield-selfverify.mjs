// CAS-2477 — self-verify for CAMPO DE BOTÍN DENSO (DARK, SPOILS_FIELD_SURGE.enabled:false). EVO mecánica #79 (serializa tras #78 BOSS_ENRAGE_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 20 LIVE #59-#78.
// (A) EJE FRESCO = PRESENCIA/DENSIDAD DE UN CAMPO DE BOTÍN EN EL SUELO (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = los DROPS DE SUELO `G.drops` (LIVE desde el core del loot, sim.js) son sim state REPLICADO. Cada drop VIVO (!d.taken) {x,y,kind} en G.drops = objeto de botín sembrado DETERMINISTA por el motor al matar/abrir cofre (el MISMO array que el render dibuja y el pickup consume). kind ∈ {gear,rune,gold,potionhp,potionmp}.
//     spoilsFieldScore(hero)=Σ spoilsWeights[d.kind] sobre los drops NO recogidos dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Suelo limpio ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. Recogido (d.taken) ⇒ peso 0.
//     ⊥ #78 (furia = ESTADO DE FASE de un JEFE leído de e.enraged/G.enemies; botín = OBJETOS DE LOOT en el suelo leídos de G.drops, otro contenedor), ⊥ #77 (hazard = peligro ambiental G.hazards; un drop NO es un hazard), ⊥ #76 (variante = e.variant sobre mobs; un drop NO es un mob), ⊥ #75 (evento de zona = POIs de EVENTO en G.zoneEvents.pois — santuarios/cofres/duendes; campo de botín = OBJETOS DE LOOT ya soltados en G.drops, contenedor DISTINTO, independiente de si hay un evento activo), ⊥ #74 (afijo = CALIDAD de un mob), ⊥ #73 (apex = DISTANCIA a un jefe), ⊥ #72 (AUSENCIA de mobs; esto = PRESENCIA de despojos), ⊥ #69 (ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD/piso de rareza de la PRÓXIMA tirada; botín = DENSIDAD de los objetos YA en el suelo), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = salvageFind (recompensa de esquirlas de chatarra por rematar dentro de un campo de botín denso — NINGUNA de las 20 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73, flaskPotency #74, gemFind #75, socketFind #76, healPotency #77, trophyFind #78) está LLENA ⇒ pivota a una moneda FRESCA (h.salvageShards, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio spoilsSalvageCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en los OBJETOS DE LOOT del suelo (G.drops), NO en mobs/jefes/eventos. Inyectar despojos en el suelo ⇒ spoils sube MIENTRAS evento(#75) lo IGNORA (un drop NO es un POI de evento ⇒ eventProbe sin cambio), furia(#78) lo IGNORA (un drop NO es un jefe enfurecido ⇒ enrageProbe sin cambio), hazard(#77) lo IGNORA (un drop NO es un hazard), variante(#76) lo IGNORA, y lootQuality(#63/#68) NO cambia (densidad-de-suelo ≠ calidad-de-tirada).
// ★ REAL SERVER-AUTH (check 6): spawnDrop empuja un drop REAL al MISMO G.drops que usa el loot; spoilsProbe lee el score REAL + la lista de drops no recogidos en radio (x,y,kind,weight) + dropCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageSalvagePreview = spoilsFieldSalvageBonus(score). Botín cerca ⇒ salvage>0; suelo limpio / lejos ⇒ 0.
// ★ SUB-CAP (check 9): salvage EFECTIVA = min(spoilsSalvageCap=2, tier.salvage). Ningún score produce salvage>2.
// ★ BYTE-NEUTRAL OFF (check 10): con SPOILS_FIELD_SURGE OFF, spoilsFieldSalvageBonus(cualquier score)==0 y forageSalvagePreview==0 aun con despojos PEGADOS al héroe ⇒ 0 chatarra al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): el botín (score/tier/salvage) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind; activar APEX/SCARCITY (los primos recompensa-forrajeo) NO cambia la señal de botín, y el botín ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 20 mecánicas del arco #59-#78 siguen served enabled:true; SPOILS_FIELD_SURGE served false (DARK #79).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS drops en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/salvage + spoilsProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). spoilsFieldScore es función PURA de G.drops+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.spoilsField (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnDrop inyección REAL + clearDrops + spoilsProbe lectura server-auth) + peer channels (ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk/scarcity/apex/affixDanger/zoneEvent/variantSurge/hazardSurge/enrageSurge) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Botín:").
//
// Checks:
//   1  boots to play, __dev.spoilsField + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): SPOILS_FIELD_SURGE.enabled false AND G.spoilsField NUNCA se crea (gExists false); tier 0, score 0, salvage 0, forageSalvagePreview 0, channel salvageFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'spoilsField'/'salvageFind' Y sin 'salvageShards' (chatarra transitoria, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de chatarra NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0→T0/0, 1/2→T1/1, 3/6→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnDrop empuja drop REAL a G.drops; spoilsProbe lee score REAL>0 + drop en la lista + dropCount≥1.
//   7  ★ DIFERENCIADOR/⊥: inyectar despojos ⇒ spoils sube MIENTRAS evento(#75)/furia(#78)/hazard(#77)/variante(#76) lo IGNORAN (un drop NO es POI/jefe/hazard/mob) y lootQuality NO cambia; evento/furia/hazard/variante LIVE coexisten ⊥.
//   8  CANAL salvageFind: forageSalvagePreview con botín cerca ⇒ salvage>0 (== spoilsFieldSalvageBonus); suelo limpio / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe salvage nunca > spoilsSalvageCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, spoilsFieldSalvageBonus(despojos pegados)==0 y forageSalvagePreview==0 ⇒ 0 chatarra al seam (byte-id).
//  11  ★ ORTOGONALIDAD salvageFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind: el botín NO cambia peers; activar APEX/SCARCITY NO cambia la señal de botín; botín ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 20 mecanismos del arco #59-#78 served enabled:true; SPOILS_FIELD_SURGE served false (DARK #79).
//  13  render badge "Botín:" se DIBUJA ON+botín cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMOS drops en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/salvage + spoilsProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2477-spoilsfield-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2477");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,salvage}: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (capado a 2)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.spoilsField + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.spoilsField());
  ok("2 byte-id OFF (fresh boot): SPOILS_FIELD_SURGE.enabled false AND G.spoilsField NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.salvage === 0 && dark.forageSalvagePreview === 0 && dark.channel === "salvageFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} salvage=${dark.salvage} preview=${dark.forageSalvagePreview} channel=${dark.channel} tag="${dark.tag}" dropCount=${dark.dropCount}`);

  // 3 save OFF has no spoilsField/salvageFind/salvageShards key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(spoilsField|salvageFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noSalvageKey = !/"salvageShards"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'spoilsField'/'salvageFind' NI 'salvageShards' (chatarra transitoria; estado 100% derivado)", noFeatKey && noSalvageKey, `noFeatKey=${noFeatKey} noSalvageKey=${noSalvageKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.spoilsField({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.spoilsField({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la chatarra NO entra al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.spoilsField({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].salvage === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnDrop pushes a real drop to G.drops; spoilsProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;                             // hero's current tile
    window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 3, ty: h.ty, kind: "gear" } });   // inject GEAR drop 3 tiles east (~96px, in radius), weight 2
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });              // hero back to origin tile
    const sp = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe;
    const vm = window.__dev.spoilsField();
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { sp, dropCount: vm.dropCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnDrop empuja drop REAL a G.drops; spoilsProbe lee score REAL>0 + drop 'gear' (weight≥2) en la lista + dropCount≥1",
     server6.sp && server6.sp.score > 0 && server6.sp.count >= 1 && server6.sp.drops[0] && server6.sp.drops[0].kind === "gear" && server6.sp.drops[0].weight >= 2 && server6.dropCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs zoneEvent(#75)/enrage(#78)/hazard(#77)/variant(#76): a ground drop is NOT a POI/boss/hazard/mob. + lootQuality unchanged. Corre en un tile REMOTO fresco (deltas) para aislar de drops previos.
  const diff = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h0 = window.__dev.spoilsField().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                   // tile remoto fresco, ~120 tiles al oeste del cluster de inyecciones (origen)
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    // baseline en el tile fresco (esperado 0; deltas lo hacen robusto a cualquier drop natural)
    const baseSpoils = window.__dev.spoilsField().score;
    const evtBefore = window.__dev.zoneEvent ? window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score : 0;
    const enrBefore = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazBefore = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const lootBefore = window.__dev.spoilsField().lootQualityFloor;
    // inyecta 2 despojos GEAR (weight 2 c/u = score 4 ⇒ T2) al este dentro de radio
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 3, ty: RY, kind: "gear" } });
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 4, ty: RY, kind: "rune" } });
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.spoilsField();
    const evtAfter = window.__dev.zoneEvent ? window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score : 0;   // un drop NO es un POI de evento ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;   // un drop NO es un jefe ⇒ sin cambio
    const hazAfter = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;   // un drop NO es un hazard ⇒ sin cambio
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;   // un drop NO es un mob ⇒ sin cambio
    const lootAfter = window.__dev.spoilsField().lootQualityFloor;         // densidad-de-suelo ≠ calidad-de-tirada ⇒ sin cambio
    const ev = window.__dev.zoneEvent ? window.__dev.zoneEvent() : null;
    const en = window.__dev.enrageSurge ? window.__dev.enrageSurge() : null;
    const hz = window.__dev.hazardSurge ? window.__dev.hazardSurge() : null;
    const vs = window.__dev.variantSurge ? window.__dev.variantSurge() : null;
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { baseSpoils, score: vm.score, tier: vm.tier, salvage: vm.salvage,
      evtBefore, evtAfter, enrBefore, enrAfter, hazBefore, hazAfter, varBefore, varAfter, lootBefore, lootAfter,
      evEnabled: ev ? ev.enabled : null, enEnabled: en ? en.enabled : null, hzEnabled: hz ? hz.enabled : null, vsEnabled: vs ? vs.enabled : null };
  });
  const diffOK = diff.score > diff.baseSpoils && diff.tier >= 2 && diff.salvage >= 1 &&   // despojos: spoils fires (delta>0, gear+rune=4⇒T2)
    diff.evtAfter === diff.evtBefore && diff.enrAfter === diff.enrBefore &&               // evento/furia IGNORAN el drop
    diff.hazAfter === diff.hazBefore && diff.varAfter === diff.varBefore &&               // hazard/variante IGNORAN el drop
    diff.lootAfter === diff.lootBefore &&                                                 // lootQuality (calidad) NO cambia con densidad
    diff.evEnabled === true && diff.enEnabled === true && diff.hzEnabled === true && diff.vsEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: inyectar despojos ⇒ spoils sube a T2 MIENTRAS evento(#75)/furia(#78)/hazard(#77)/variante(#76) IGNORAN (un drop NO es POI/jefe/hazard/mob) y lootQuality NO cambia (densidad≠calidad); evento/furia/hazard/variante LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL salvageFind: forageSalvagePreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;
    window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 4, ty: h.ty, kind: "gold" } });   // ~128px, in radius, weight 1
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.spoilsField();
    const nearPrev = nearVm.forageSalvagePreview, nearSalvage = nearVm.salvage;
    window.__dev.spoilsField({ tp: { tx: h.tx + 40, ty: h.ty } });         // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.spoilsField();
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { nearPrev, nearSalvage, farPrev: farVm.forageSalvagePreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearSalvage && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL salvageFind: forageSalvagePreview con botín cerca ⇒ salvage>0 (==spoilsFieldSalvageBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: salvage never exceeds spoilsSalvageCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.spoilsField({ scoreProbe: { score: s } }).scoreProbe.salvage);
    return { max: Math.max(...vals), cap: window.__dev.spoilsField().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce salvage>spoilsSalvageCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ salvage 0 + forageSalvagePreview 0 even with drops glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;
    window.__dev.spoilsField({ spawnDrop: { tx: h.tx, ty: h.ty, kind: "gear" } });     // gear drop ON TOP of hero tile ⇒ score>0 ⇒ would be T1
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.spoilsField({ enabled: false });                         // now OFF
    const off = window.__dev.spoilsField();
    window.__dev.spoilsField({ enabled: true }); window.__dev.spoilsField({ clearDrops: true }); window.__dev.spoilsField({ enabled: false });
    return { preview: off.forageSalvagePreview, salvage: off.salvage, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.salvage === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, spoilsFieldSalvageBonus(despojos pegados)==0 + forageSalvagePreview==0 ⇒ 0 chatarra al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip spoilsField OFF→ON at the SAME state ⇒ los 16 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de botín.
  const orth = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;
    window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 4, ty: h.ty, kind: "gold" } });
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.spoilsField({ enabled: false });
    const snap = () => { const s = window.__dev.spoilsField(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview }; };
    const peersOff = snap();                                             // BOTÍN OFF (misma posición del héroe)
    window.__dev.spoilsField({ enabled: true });
    const peersOn = snap();                                              // BOTÍN ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the spoils signal
    const beforeArc = window.__dev.spoilsField();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.spoilsField();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.salvage === afterArc.salvage;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD salvageFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind: flip botín OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de botín; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 20 arc flags served true; SPOILS_FIELD_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const sfsDark = flag("SPOILS_FIELD_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 20 mecanismos del arco #59-#78 served enabled:true; SPOILS_FIELD_SURGE served false (DARK #79)",
     arcAllOn && sfsDark && arc.length === 20, `spoilsField=${flag("SPOILS_FIELD_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Botín:" drawn ON+botín near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Botín:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;
    window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 4, ty: h.ty, kind: "gear" } });
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Botín:\" se DIBUJA ON+botín cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.spoilsField({ enabled: true }); window.__dev.spoilsField({ clearDrops: true }); const h = window.__dev.spoilsField().hero; window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 3, ty: h.ty, kind: "gear" } }); window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 4, ty: h.ty, kind: "rune" } }); window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.spoilsField({ clearDrops: true }); window.__dev.spoilsField({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME drops at SAME tiles + hero at SAME tile ⇒ score/tier/salvage + spoilsProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten drops + tp héroe a las MISMAS coordenadas (spoilsFieldScore es fn pura de G.drops+posiciones). Lejos del cluster de inyecciones previas de A.
  const DROP_A = { tx: 60, ty: 40 }, DROP_B = { tx: 61, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // 2 drops 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((DA, DB, HT) => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ spawnDrop: { tx: DA.tx, ty: DA.ty, kind: "gear" } });   // weight 2
    window.__dev.spoilsField({ spawnDrop: { tx: DB.tx, ty: DB.ty, kind: "gold" } });   // weight 1
    window.__dev.spoilsField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.spoilsField();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.spoilsField({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, salvage: p.salvage }; });   // LUT PURA
    const sp = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { score: vm.score, tier: vm.tier, salvage: vm.salvage, dropCount: vm.dropCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, DROP_A, DROP_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // dropCount NO se compara globalmente: es el nº AMBIENTAL de drops con peso en TODO el mundo, contaminado por drops naturales de combate previo (A acumuló; B es fresco). El SIGNAL determinista per-snapshot — score/tier/salvage + spoilsProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #75/#76/#77/#78; clearDrops aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.salvage === B.salvage && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMOS drops+héroe ⇒ score/tier/salvage + spoilsProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; dropCount global ambiental excluido — contaminado por drops naturales de A; spoilsProbe cuenta SÓLO en radio tras clearDrops)",
     conv, `A={score:${A.score},tier:${A.tier},salvage:${A.salvage},dc:${A.dropCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},salvage:${B.salvage},dc:${B.dropCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.spoilsField({ enabled: false }));
  await pageB.evaluate(() => window.__dev.spoilsField({ enabled: false }));

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
