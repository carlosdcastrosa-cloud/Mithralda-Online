// CAS-2493 — self-verify for VORÁGINE DE ZONAS DE ÁREA (DARK, MAELSTROM_FIELD_SURGE.enabled:false). EVO mecánica #82 (serializa tras #81 CROSSFIRE_FRAY_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 23 LIVE #59-#81.
// (A) EJE FRESCO = PRESENCIA/DENSIDAD DE UN CAMPO DE ZONAS DE NEGACIÓN DE ÁREA (server-auth, MMORPG-native). PRE-FLIGHT GATE (aprende de #80/#81): el candidato LÍDER del issue (densidad de DESTRUCTIBLES/props, `G.props`/`G.destructibles`/`G.breakables`) NO EXISTE replicado/autoritativo en este cliente (0 declaración/0 populate/0 tick) ⇒ NO se fuerza. PIVOTE justificado a `G.fields` = ZONAS DE NEGACIÓN DE ÁREA persistentes — SÍ existe replicado/autoritativo: declarado en el estado de sim (`fields:[]`), POBLADO en el path AUTORITATIVO (el caso "field" de castSpell sim.js:6286 `G.fields.push(f)` con spellDmg), TICKEADO/FILTRADO en el tick de paso-fijo AUTORITATIVO updateFields (f.life-=dt, filtra life>0), LIMPIADO en cada frontera de run/escena. Cada zona VIVA {x,y,r,dmg,life} = snapshot determinista.
//     maelstromFieldScore(hero)=Σ maelstromWeights[tamaño] sobre las zonas cuyo CENTRO cae dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin vorágine ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. tamaño large (f.r≥largeR)→2 (cubre más suelo, doble) / small→1.
//     ⊥ #81 (fragor = PROYECTILES EN VUELO en G.projectiles con velocidad que expiran por p.life; vorágine = ZONAS ESTÁTICAS de negación en G.fields fijas en {x,y} que tickean en su sitio — DIVERGEN: tiroteo a distancia = muchos proyectiles/cero campos; mago carbonizando el suelo en melee = muchas zonas/cero proyectiles), ⊥ #80 (carnicería = CUERPOS MUERTOS en G.corpses; una zona VIVA no es un cadáver), ⊥ #79 (botín = OBJETOS DE LOOT recogibles en G.drops; una zona no es recogible), ⊥ #78 (furia = jefe VIVO enfurecido e.enraged), ⊥ #77 (hazard = zona ambiental de G.hazards GATEADA por jefe/élite vivo [bossOrElitePresent]; la vorágine lee G.fields = campos de HECHIZO del héroe, NO gateados por jefe, otro contenedor y otro path), ⊥ #76 (variante e.variant), ⊥ #75 (evento G.zoneEvents.pois), ⊥ #74 (afijo CALIDAD de un mob), ⊥ #73 (apex DISTANCIA a un jefe vivo), ⊥ #72 (escasez AUSENCIA de mobs VIVOS), ⊥ #69 (ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = maelstromFind (recompensa de cargas de vorágine por rematar en medio de una vorágine densa — NINGUNA de las 23 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind, lootQuality, xpGain, essenceFind, matFind, flaskPotency, gemFind, socketFind, healPotency, trophyFind #78, salvageFind #79, boneFind #80, frayFind #81) está LLENA ⇒ pivota a una moneda FRESCA (h.maelstromCharges, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio maelstromChargeCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en las ZONAS DE NEGACIÓN (G.fields), NO en proyectiles-en-vuelo/cuerpos-muertos/objetos-de-loot/jefes-vivos/hazards. Inyectar zonas ⇒ vorágine sube MIENTRAS fragor(#81) lo IGNORA (una zona NO es un proyectil ⇒ frayProbe sin cambio), carnicería(#80) lo IGNORA (una zona NO es un cadáver ⇒ carnageProbe sin cambio), botín(#79) lo IGNORA, furia(#78) lo IGNORA, hazard(#77) lo IGNORA (una zona de HECHIZO NO es un hazard ambiental gateado por jefe ⇒ hazardProbe sin cambio), y lootQuality(#63/#68) NO cambia.
// ★ REAL SERVER-AUTH (check 6): spawnField empuja una zona REAL al MISMO G.fields que puebla el caso "field" de castSpell; fieldProbe lee el score REAL + la lista de zonas en radio (x,y,r,weight) + fieldCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageChargePreview = maelstromFieldChargeBonus(score). Zonas cerca ⇒ charge>0; sin vorágine / lejos ⇒ 0.
// ★ SUB-CAP (check 9): charge EFECTIVA = min(maelstromChargeCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 10): con MAELSTROM_FIELD_SURGE OFF, maelstromFieldChargeBonus(cualquier score)==0 y forageChargePreview==0 aun con zonas PEGADAS al héroe ⇒ 0 cargas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la vorágine (score/tier/charge) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind; activar APEX/SCARCITY NO cambia la señal de vorágine, y la vorágine ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 23 mecánicas del arco #59-#81 siguen served enabled:true; MAELSTROM_FIELD_SURGE served false (DARK #82).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMAS zonas en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/charge + fieldProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). maelstromFieldScore es función PURA de G.fields+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.maelstromField (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnField inyección REAL + clearField + fieldProbe lectura server-auth) + peer channels + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Vorágine:"). Las zonas inyectadas de PRUEBA tienen dmg:0 (0 daño a enemigos) + life:99 (sobreviven los frames reales) ⇒ 0 efecto de sim en las lecturas.
//
// Checks:
//   1  boots to play, __dev.maelstromField + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): MAELSTROM_FIELD_SURGE.enabled false AND G.maelstromField NUNCA se crea (gExists false); tier 0, score 0, charge 0, forageChargePreview 0, channel maelstromFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'maelstromField'/'maelstromFind' Y sin 'maelstromCharges' (cargas transitorias, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de cargas NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0/1→T0/0, 2/3→T1/1, ≥4→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnField empuja una zona REAL a G.fields; fieldProbe lee score REAL>0 + zona en la lista + fieldCount≥1.
//   7  ★ DIFERENCIADOR/⊥: inyectar zonas ⇒ vorágine sube MIENTRAS fragor(#81)/carnicería(#80)/botín(#79)/furia(#78)/hazard(#77) lo IGNORAN (una zona NO es proyectil/cadáver/drop/jefe-vivo/hazard) y lootQuality NO cambia; las 23 LIVE coexisten ⊥.
//   8  CANAL maelstromFind: forageChargePreview con zonas cerca ⇒ charge>0 (== maelstromFieldChargeBonus); sin vorágine / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe charge nunca > maelstromChargeCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, maelstromFieldChargeBonus(zonas pegadas)==0 y forageChargePreview==0 ⇒ 0 cargas al seam (byte-id).
//  11  ★ ORTOGONALIDAD maelstromFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind: la vorágine NO cambia peers; activar APEX/SCARCITY NO cambia la señal de vorágine; vorágine ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 23 mecanismos del arco #59-#81 served enabled:true; MAELSTROM_FIELD_SURGE served false (DARK #82).
//  13  render badge "Vorágine:" se DIBUJA ON+zonas cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMAS zonas en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/charge + fieldProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2493-maelstromfield-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2493");
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
// radios de prueba: large (≥largeR=60) ⇒ weight 2 ; small (<60) ⇒ weight 1
const R_LARGE = 64, R_SMALL = 40;

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.maelstromField && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.maelstromField + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.maelstromField());
  ok("2 byte-id OFF (fresh boot): MAELSTROM_FIELD_SURGE.enabled false AND G.maelstromField NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "maelstromFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" fieldCount=${dark.fieldCount}`);

  // 3 save OFF has no maelstromField/maelstromFind/maelstromCharges key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(maelstromField|maelstromFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"maelstromCharges"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'maelstromField'/'maelstromFind' NI 'maelstromCharges' (cargas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.maelstromField({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.maelstromField({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las cargas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.maelstromField({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnField pushes a real field to G.fields; fieldProbe reads real score + list + count
  const server6 = await page.evaluate((RL) => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    const h = window.__dev.maelstromField().hero;                           // hero's current tile
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 3, ty: h.ty, r: RL } });   // inject LARGE denial zone 3 tiles east (~96px, in radius), weight 2
    window.__dev.maelstromField({ tp: { tx: h.tx, ty: h.ty } });            // hero back to origin tile
    const sp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe;
    const vm = window.__dev.maelstromField();
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ enabled: false });
    return { sp, fieldCount: vm.fieldCount, tier: vm.tier, score: vm.score };
  }, R_LARGE);
  ok("6 ★ REAL SERVER-AUTH: spawnField empuja zona REAL a G.fields; fieldProbe lee score REAL>0 + zona 'large' (weight 2) en la lista + fieldCount≥1",
     server6.sp && server6.sp.score > 0 && server6.sp.count >= 1 && server6.sp.fields[0] && server6.sp.fields[0].weight === 2 && server6.fieldCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs fray(#81)/carnage(#80)/spoils(#79)/enrage(#78)/hazard(#77): a field is NOT a projectile/corpse/drop/live-boss/hazard. + lootQuality unchanged. Corre en un tile REMOTO fresco (deltas).
  const diff = await page.evaluate((RL) => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    const h0 = window.__dev.maelstromField().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                   // tile remoto fresco, ~120 tiles al oeste
    window.__dev.maelstromField({ tp: { tx: RX, ty: RY } });
    const baseMael = window.__dev.maelstromField().score;                 // baseline (esperado 0)
    const frayBefore = window.__dev.crossfireFray ? window.__dev.crossfireFray({ frayProbe: true }).frayProbe.score : 0;
    const carBefore = window.__dev.carnageField ? window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score : 0;
    const spoBefore = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrBefore = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazBefore = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const lootBefore = window.__dev.maelstromField().lootQualityFloor;
    // inyecta 2 zonas GRANDES (weight2 + weight2 = score 4 ⇒ T2) al este dentro de radio
    window.__dev.maelstromField({ spawnField: { tx: RX + 3, ty: RY, r: RL } });
    window.__dev.maelstromField({ spawnField: { tx: RX + 4, ty: RY, r: RL } });
    window.__dev.maelstromField({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.maelstromField();
    const frayAfter = window.__dev.crossfireFray ? window.__dev.crossfireFray({ frayProbe: true }).frayProbe.score : 0;   // una zona NO es un proyectil ⇒ sin cambio
    const carAfter = window.__dev.carnageField ? window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score : 0;   // una zona NO es un cadáver ⇒ sin cambio
    const spoAfter = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;   // una zona NO es un drop ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;   // una zona NO es un jefe vivo ⇒ sin cambio
    const hazAfter = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;   // una zona de hechizo NO es un hazard ambiental ⇒ sin cambio
    const lootAfter = window.__dev.maelstromField().lootQualityFloor;      // densidad-de-zonas ≠ calidad-de-tirada ⇒ sin cambio
    const fr = window.__dev.crossfireFray ? window.__dev.crossfireFray() : null;
    const ca = window.__dev.carnageField ? window.__dev.carnageField() : null;
    const so = window.__dev.spoilsField ? window.__dev.spoilsField() : null;
    const en = window.__dev.enrageSurge ? window.__dev.enrageSurge() : null;
    const hz = window.__dev.hazardSurge ? window.__dev.hazardSurge() : null;
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ enabled: false });
    return { baseMael, score: vm.score, tier: vm.tier, charge: vm.charge,
      frayBefore, frayAfter, carBefore, carAfter, spoBefore, spoAfter, enrBefore, enrAfter, hazBefore, hazAfter, lootBefore, lootAfter,
      frEnabled: fr ? fr.enabled : null, caEnabled: ca ? ca.enabled : null, soEnabled: so ? so.enabled : null, enEnabled: en ? en.enabled : null, hzEnabled: hz ? hz.enabled : null };
  }, R_LARGE);
  const diffOK = diff.score > diff.baseMael && diff.tier >= 2 && diff.charge >= 1 &&          // zonas: vorágine fires (delta>0, large+large=4⇒T2)
    diff.frayAfter === diff.frayBefore && diff.carAfter === diff.carBefore &&                 // fragor/carnicería IGNORAN la zona
    diff.spoAfter === diff.spoBefore && diff.enrAfter === diff.enrBefore &&                   // botín/furia IGNORAN la zona
    diff.hazAfter === diff.hazBefore &&                                                       // hazard IGNORA la zona (campo de hechizo ≠ hazard ambiental)
    diff.lootAfter === diff.lootBefore &&                                                     // lootQuality (calidad) NO cambia con densidad
    diff.frEnabled === true && diff.caEnabled === true && diff.soEnabled === true && diff.enEnabled === true && diff.hzEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: inyectar zonas ⇒ vorágine sube a T2 MIENTRAS fragor(#81)/carnicería(#80)/botín(#79)/furia(#78)/hazard(#77) IGNORAN (una zona NO es proyectil/cadáver/drop/jefe-vivo/hazard) y lootQuality NO cambia (densidad≠calidad); las 23 LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL maelstromFind: forageChargePreview near > 0 ; far → 0
  const forage = await page.evaluate((RL) => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    const h = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 4, ty: h.ty, r: RL } });   // ~128px, in radius, LARGE weight 2 ⇒ score 2 ⇒ T1
    window.__dev.maelstromField({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.maelstromField();
    const nearPrev = nearVm.forageChargePreview, nearCharge = nearVm.charge;
    window.__dev.maelstromField({ tp: { tx: h.tx + 40, ty: h.ty } });        // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.maelstromField();
    window.__dev.maelstromField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ enabled: false });
    return { nearPrev, nearCharge, farPrev: farVm.forageChargePreview, farTier: farVm.tier, farScore: farVm.score };
  }, R_LARGE);
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearCharge && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL maelstromFind: forageChargePreview con zonas cerca ⇒ charge>0 (==maelstromFieldChargeBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: charge never exceeds maelstromChargeCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.maelstromField({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.maelstromField().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce charge>maelstromChargeCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with fields glued to hero
  const neutral = await page.evaluate((RL) => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    const h = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ spawnField: { tx: h.tx, ty: h.ty, r: RL } });    // LARGE zone ON hero tile ⇒ score 2 ⇒ would be T1
    window.__dev.maelstromField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.maelstromField({ enabled: false });                        // now OFF
    const off = window.__dev.maelstromField();
    window.__dev.maelstromField({ enabled: true }); window.__dev.maelstromField({ clearField: true }); window.__dev.maelstromField({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, R_LARGE);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, maelstromFieldChargeBonus(zonas pegadas)==0 + forageChargePreview==0 ⇒ 0 cargas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip maelstromField OFF→ON at the SAME state ⇒ los 19 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de vorágine.
  const orth = await page.evaluate((RL) => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    const h = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 4, ty: h.ty, r: RL } });
    window.__dev.maelstromField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.maelstromField({ enabled: false });
    const snap = () => { const s = window.__dev.maelstromField(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview, bone: s.boneForagePreview, ember: s.emberForagePreview }; };
    const peersOff = snap();                                             // VORÁGINE OFF (misma posición del héroe)
    window.__dev.maelstromField({ enabled: true });
    const peersOn = snap();                                              // VORÁGINE ON — los peers NO deben cambiar
    const beforeArc = window.__dev.maelstromField();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.maelstromField();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, R_LARGE);
  ok("11 ★ ORTOGONALIDAD maelstromFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind: flip vorágine OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de vorágine; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 23 arc flags served true; MAELSTROM_FIELD_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const mfsDark = flag("MAELSTROM_FIELD_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 23 mecanismos del arco #59-#81 served enabled:true; MAELSTROM_FIELD_SURGE served false (DARK #82)",
     arcAllOn && mfsDark && arc.length === 23, `maelstromField=${flag("MAELSTROM_FIELD_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Vorágine:" drawn ON+fields near / not OFF + fps. Zonas de prueba dmg:0 (0 daño) + life:99 (sobreviven).
  const badge = await page.evaluate(async (RL) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Vorágine:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    const h = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 3, ty: h.ty, r: RL } });   // LARGE weight2
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 4, ty: h.ty, r: RL } });   // score 4 ⇒ T2 (robusto)
    window.__dev.maelstromField({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, R_LARGE);
  ok("13 render badge \"Vorágine:\" se DIBUJA ON+zonas cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((RL, RS) => { window.__dev.maelstromField({ enabled: true }); window.__dev.maelstromField({ clearField: true }); const h = window.__dev.maelstromField().hero; window.__dev.maelstromField({ spawnField: { tx: h.tx + 3, ty: h.ty, r: RL } }); window.__dev.maelstromField({ spawnField: { tx: h.tx + 4, ty: h.ty, r: RL } }); window.__dev.maelstromField({ spawnField: { tx: h.tx + 5, ty: h.ty, r: RS } }); window.__dev.maelstromField({ tp: { tx: h.tx, ty: h.ty } }); }, R_LARGE, R_SMALL);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.maelstromField({ clearField: true }); window.__dev.maelstromField({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME fields at SAME tiles + hero at SAME tile ⇒ score/tier/charge + fieldProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten zonas + tp héroe a las MISMAS coordenadas (maelstromFieldScore es fn pura de G.fields+posiciones). dmg:0 ⇒ 0 efecto de sim.
  const FLD_A = { tx: 60, ty: 40, r: R_LARGE }, FLD_B = { tx: 61, ty: 40, r: R_SMALL }, HERO_TILE = { tx: 63, ty: 40 };   // large(2)+small(1)=score3 ⇒ T1, 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((FA, FB, HT) => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ spawnField: { tx: FA.tx, ty: FA.ty, r: FA.r } });    // weight 2 (large)
    window.__dev.maelstromField({ spawnField: { tx: FB.tx, ty: FB.ty, r: FB.r } });     // weight 1 (small)
    window.__dev.maelstromField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.maelstromField();
    const lut = [0, 2, 4, 9].map(s => { const p = window.__dev.maelstromField({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });   // LUT PURA
    const sp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, fieldCount: vm.fieldCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, FLD_A, FLD_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // fieldCount NO se compara globalmente: es el nº AMBIENTAL de zonas con peso en TODO el mundo, contaminado por campos naturales de hechizos previos. El SIGNAL determinista per-snapshot — score/tier/charge + fieldProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (clearField aísla las de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMAS zonas+héroe ⇒ score/tier/charge + fieldProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; fieldCount global ambiental excluido; fieldProbe cuenta SÓLO en radio tras clearField)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},fc:${A.fieldCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},fc:${B.fieldCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.maelstromField({ enabled: false }));
  await pageB.evaluate(() => window.__dev.maelstromField({ enabled: false }));

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
