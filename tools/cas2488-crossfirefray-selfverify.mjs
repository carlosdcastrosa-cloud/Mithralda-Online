// CAS-2488 — self-verify for FRAGOR DE FUEGO CRUZADO (DARK, CROSSFIRE_FRAY_SURGE.enabled:false). EVO mecánica #81 (serializa tras #80 CARNAGE_FIELD_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 22 LIVE #59-#80.
// (A) EJE FRESCO = PRESENCIA/DENSIDAD DE UN CAMPO DE PROYECTILES EN VUELO (server-auth, MMORPG-native). PRE-FLIGHT GATE (aprende de #80): el candidato líder del issue (densidad de proyectiles, `G.projectiles`) SÍ existe replicado/autoritativo — declarado en el estado de sim (sim.js:192 `projectiles:[]`), POBLADO en el path AUTORITATIVO (spawns de hechizo/ataque del héroe y de enemigos con p.enemy), AVANZADO/FILTRADO en el tick de paso-fijo AUTORITATIVO updateProjectiles (p.x+=p.vx*dt / p.life-=dt, filtra life>0). Cada proyectil VIVO {x,y,vx,vy,life,kind,enemy} = snapshot determinista.
//     crossfireFrayScore(hero)=Σ frayWeights[lado] sobre los proyectiles dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin fuego cruzado ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. lado enemy→2 (fuego ENTRANTE, doble) / hero→1 (fuego saliente).
//     ⊥ #80 (carnicería = CUERPOS MUERTOS en G.corpses estáticos que despawnan en CORPSE_LIFE; fragor = PROYECTILES EN VUELO en G.projectiles con velocidad que expiran por p.life — DIVERGEN: campo tras masacre melee = muchos cadáveres/cero fragor; tiroteo EN CURSO = lluvia de proyectiles/cero cadáveres), ⊥ #79 (botín = OBJETOS DE LOOT recogibles en G.drops; fragor = munición EN VUELO NO recogible), ⊥ #78 (furia = jefe VIVO enfurecido e.enraged; fragor = proyectiles inanimados), ⊥ #77 (hazard = zona ambiental PERSISTENTE G.hazards; un proyectil con velocidad NO es un hazard estático), ⊥ #76 (variante e.variant), ⊥ #75 (evento G.zoneEvents.pois), ⊥ #74 (afijo CALIDAD de un mob), ⊥ #73 (apex DISTANCIA a un jefe vivo), ⊥ #72 (escasez AUSENCIA de mobs VIVOS), ⊥ #69 (ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = frayFind (recompensa de ascuas de fragor por rematar en medio de un fuego cruzado denso — NINGUNA de las 22 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73, flaskPotency #74, gemFind #75, socketFind #76, healPotency #77, trophyFind #78, salvageFind #79, boneFind #80) está LLENA ⇒ pivota a una moneda FRESCA (h.frayEmbers, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio frayEmberCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en los PROYECTILES EN VUELO (G.projectiles), NO en cuerpos-muertos/objetos-de-loot/jefes-vivos/hazards. Inyectar proyectiles ⇒ fragor sube MIENTRAS carnicería(#80) lo IGNORA (un proyectil NO es un cadáver ⇒ carnageProbe sin cambio), botín(#79) lo IGNORA (un proyectil NO es un drop ⇒ spoilsProbe sin cambio), furia(#78) lo IGNORA (un proyectil NO es un jefe vivo ⇒ enrageProbe sin cambio), hazard(#77) lo IGNORA (un proyectil con velocidad NO es un hazard estático ⇒ hazardProbe sin cambio), y lootQuality(#63/#68) NO cambia.
// ★ REAL SERVER-AUTH (check 6): spawnProj empuja un proyectil REAL al MISMO G.projectiles que puebla el combate; frayProbe lee el score REAL + la lista de proyectiles en radio (x,y,side,weight) + projCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageEmberPreview = crossfireFrayEmberBonus(score). Proyectiles cerca ⇒ ember>0; sin fuego cruzado / lejos ⇒ 0.
// ★ SUB-CAP (check 9): ember EFECTIVA = min(frayEmberCap=2, tier.ember). Ningún score produce ember>2.
// ★ BYTE-NEUTRAL OFF (check 10): con CROSSFIRE_FRAY_SURGE OFF, crossfireFrayEmberBonus(cualquier score)==0 y forageEmberPreview==0 aun con proyectiles PEGADOS al héroe ⇒ 0 ascuas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): el fragor (score/tier/ember) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind; activar APEX/SCARCITY NO cambia la señal de fragor, y el fragor ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 22 mecánicas del arco #59-#80 siguen served enabled:true; CROSSFIRE_FRAY_SURGE served false (DARK #81).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS proyectiles en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/ember + frayProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). crossfireFrayScore es función PURA de G.projectiles+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.crossfireFray (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnProj inyección REAL + clearProj + frayProbe lectura server-auth) + peer channels + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Fragor:"). Los proyectiles inyectados de PRUEBA son SÍNCRONOS (no hay tick de updateProjectiles dentro de un page.evaluate) ⇒ 0 consumo por colisión en las lecturas; para el check de badge (frames REALES corren) se usa fuego ENEMIGO a >18px del héroe (no golpea al héroe, no colisiona con enemigos, life:99 ⇒ sobrevive).
//
// Checks:
//   1  boots to play, __dev.crossfireFray + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): CROSSFIRE_FRAY_SURGE.enabled false AND G.crossfireFray NUNCA se crea (gExists false); tier 0, score 0, ember 0, forageEmberPreview 0, channel frayFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'crossfireFray'/'frayFind' Y sin 'frayEmbers' (ascuas transitorias, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de ascuas NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0/1→T0/0, 2/4→T1/1, ≥5→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnProj empuja un proyectil REAL a G.projectiles; frayProbe lee score REAL>0 + proyectil en la lista + projCount≥1.
//   7  ★ DIFERENCIADOR/⊥: inyectar proyectiles ⇒ fragor sube MIENTRAS carnicería(#80)/botín(#79)/furia(#78)/hazard(#77) lo IGNORAN (un proyectil NO es cadáver/drop/jefe-vivo/hazard) y lootQuality NO cambia; carnicería/botín/furia/hazard LIVE coexisten ⊥.
//   8  CANAL frayFind: forageEmberPreview con proyectiles cerca ⇒ ember>0 (== crossfireFrayEmberBonus); sin fuego cruzado / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe ember nunca > frayEmberCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, crossfireFrayEmberBonus(proyectiles pegados)==0 y forageEmberPreview==0 ⇒ 0 ascuas al seam (byte-id).
//  11  ★ ORTOGONALIDAD frayFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind: el fragor NO cambia peers; activar APEX/SCARCITY NO cambia la señal de fragor; fragor ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 22 mecanismos del arco #59-#80 served enabled:true; CROSSFIRE_FRAY_SURGE served false (DARK #81).
//  13  render badge "Fragor:" se DIBUJA ON+proyectiles cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMOS proyectiles en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/ember + frayProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2488-crossfirefray-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2488");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,ember}: 0/1→T0/0, [2,4]→T1/1, ≥5→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 0, s: 0 },
  { score: 2, t: 1, s: 1 }, { score: 4, t: 1, s: 1 },
  { score: 5, t: 2, s: 2 }, { score: 99, t: 2, s: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.crossfireFray + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.crossfireFray());
  ok("2 byte-id OFF (fresh boot): CROSSFIRE_FRAY_SURGE.enabled false AND G.crossfireFray NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.ember === 0 && dark.forageEmberPreview === 0 && dark.channel === "frayFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} ember=${dark.ember} preview=${dark.forageEmberPreview} channel=${dark.channel} tag="${dark.tag}" projCount=${dark.projCount}`);

  // 3 save OFF has no crossfireFray/frayFind/frayEmbers key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(crossfireFray|frayFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noEmberKey = !/"frayEmbers"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'crossfireFray'/'frayFind' NI 'frayEmbers' (ascuas transitorias; estado 100% derivado)", noFeatKey && noEmberKey, `noFeatKey=${noFeatKey} noEmberKey=${noEmberKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.crossfireFray({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.crossfireFray({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las ascuas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.crossfireFray({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].ember === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0/1→T0/0, [2,4]→T1/1, ≥5→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnProj pushes a real projectile to G.projectiles; frayProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h = window.__dev.crossfireFray().hero;                            // hero's current tile
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 3, ty: h.ty, side: "enemy" } });   // inject ENEMY projectile 3 tiles east (~96px, in radius), weight 2
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });             // hero back to origin tile
    const sp = window.__dev.crossfireFray({ frayProbe: true }).frayProbe;
    const vm = window.__dev.crossfireFray();
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ enabled: false });
    return { sp, projCount: vm.projCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnProj empuja proyectil REAL a G.projectiles; frayProbe lee score REAL>0 + proyectil 'enemy' (weight 2) en la lista + projCount≥1",
     server6.sp && server6.sp.score > 0 && server6.sp.count >= 1 && server6.sp.projs[0] && server6.sp.projs[0].side === "enemy" && server6.sp.projs[0].weight === 2 && server6.projCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs carnage(#80)/spoils(#79)/enrage(#78)/hazard(#77): a projectile is NOT a corpse/drop/live-boss/hazard. + lootQuality unchanged. Corre en un tile REMOTO fresco (deltas) para aislar de proyectiles previos.
  const diff = await page.evaluate(() => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h0 = window.__dev.crossfireFray().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                   // tile remoto fresco, ~120 tiles al oeste del cluster de inyecciones (origen)
    window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } });
    // baseline en el tile fresco (esperado 0; deltas lo hacen robusto a cualquier proyectil natural)
    const baseFray = window.__dev.crossfireFray().score;
    const carBefore = window.__dev.carnageField ? window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score : 0;
    const spoBefore = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrBefore = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazBefore = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const lootBefore = window.__dev.crossfireFray().lootQualityFloor;
    // inyecta 3 proyectiles (enemy weight2 + enemy weight2 + hero weight1 = score 5 ⇒ T2) al este dentro de radio
    window.__dev.crossfireFray({ spawnProj: { tx: RX + 3, ty: RY, side: "enemy" } });
    window.__dev.crossfireFray({ spawnProj: { tx: RX + 4, ty: RY, side: "enemy" } });
    window.__dev.crossfireFray({ spawnProj: { tx: RX + 5, ty: RY, side: "hero" } });
    window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.crossfireFray();
    const carAfter = window.__dev.carnageField ? window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score : 0;   // un proyectil NO es un cadáver ⇒ sin cambio
    const spoAfter = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;   // un proyectil NO es un drop ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;   // un proyectil NO es un jefe vivo ⇒ sin cambio
    const hazAfter = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;   // un proyectil NO es un hazard ⇒ sin cambio
    const lootAfter = window.__dev.crossfireFray().lootQualityFloor;      // densidad-de-proyectiles ≠ calidad-de-tirada ⇒ sin cambio
    const ca = window.__dev.carnageField ? window.__dev.carnageField() : null;
    const so = window.__dev.spoilsField ? window.__dev.spoilsField() : null;
    const en = window.__dev.enrageSurge ? window.__dev.enrageSurge() : null;
    const hz = window.__dev.hazardSurge ? window.__dev.hazardSurge() : null;
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ enabled: false });
    return { baseFray, score: vm.score, tier: vm.tier, ember: vm.ember,
      carBefore, carAfter, spoBefore, spoAfter, enrBefore, enrAfter, hazBefore, hazAfter, lootBefore, lootAfter,
      caEnabled: ca ? ca.enabled : null, soEnabled: so ? so.enabled : null, enEnabled: en ? en.enabled : null, hzEnabled: hz ? hz.enabled : null };
  });
  const diffOK = diff.score > diff.baseFray && diff.tier >= 2 && diff.ember >= 1 &&          // proyectiles: fragor fires (delta>0, enemy+enemy+hero=5⇒T2)
    diff.carAfter === diff.carBefore && diff.spoAfter === diff.spoBefore &&                  // carnicería/botín IGNORAN el proyectil
    diff.enrAfter === diff.enrBefore && diff.hazAfter === diff.hazBefore &&                  // furia/hazard IGNORAN el proyectil
    diff.lootAfter === diff.lootBefore &&                                                    // lootQuality (calidad) NO cambia con densidad
    diff.caEnabled === true && diff.soEnabled === true && diff.enEnabled === true && diff.hzEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: inyectar proyectiles ⇒ fragor sube a T2 MIENTRAS carnicería(#80)/botín(#79)/furia(#78)/hazard(#77) IGNORAN (un proyectil NO es cadáver/drop/jefe-vivo/hazard) y lootQuality NO cambia (densidad≠calidad); carnicería/botín/furia/hazard LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL frayFind: forageEmberPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h = window.__dev.crossfireFray().hero;
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 4, ty: h.ty, side: "enemy" } });   // ~128px, in radius, weight 2 ⇒ score 2 ⇒ T1
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.crossfireFray();
    const nearPrev = nearVm.forageEmberPreview, nearEmber = nearVm.ember;
    window.__dev.crossfireFray({ tp: { tx: h.tx + 40, ty: h.ty } });        // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.crossfireFray();
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ enabled: false });
    return { nearPrev, nearEmber, farPrev: farVm.forageEmberPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearEmber && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL frayFind: forageEmberPreview con proyectiles cerca ⇒ ember>0 (==crossfireFrayEmberBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: ember never exceeds frayEmberCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.crossfireFray({ scoreProbe: { score: s } }).scoreProbe.ember);
    return { max: Math.max(...vals), cap: window.__dev.crossfireFray().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce ember>frayEmberCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ ember 0 + forageEmberPreview 0 even with projectiles glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h = window.__dev.crossfireFray().hero;
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx, ty: h.ty, side: "enemy" } });    // enemy projectile ON hero tile ⇒ score 2 ⇒ would be T1 (síncrono ⇒ no tick ⇒ no daño)
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.crossfireFray({ enabled: false });                        // now OFF
    const off = window.__dev.crossfireFray();
    window.__dev.crossfireFray({ enabled: true }); window.__dev.crossfireFray({ clearProj: true }); window.__dev.crossfireFray({ enabled: false });
    return { preview: off.forageEmberPreview, ember: off.ember, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.ember === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, crossfireFrayEmberBonus(proyectiles pegados)==0 + forageEmberPreview==0 ⇒ 0 ascuas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip crossfireFray OFF→ON at the SAME state ⇒ los 18 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de fragor.
  const orth = await page.evaluate(() => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h = window.__dev.crossfireFray().hero;
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 4, ty: h.ty, side: "enemy" } });
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.crossfireFray({ enabled: false });
    const snap = () => { const s = window.__dev.crossfireFray(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview, bone: s.boneForagePreview }; };
    const peersOff = snap();                                             // FRAGOR OFF (misma posición del héroe)
    window.__dev.crossfireFray({ enabled: true });
    const peersOn = snap();                                              // FRAGOR ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the fray signal
    const beforeArc = window.__dev.crossfireFray();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.crossfireFray();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.ember === afterArc.ember;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD frayFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind: flip fragor OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de fragor; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 22 arc flags served true; CROSSFIRE_FRAY_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const cfsDark = flag("CROSSFIRE_FRAY_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 22 mecanismos del arco #59-#80 served enabled:true; CROSSFIRE_FRAY_SURGE served false (DARK #81)",
     arcAllOn && cfsDark && arc.length === 22, `crossfireFray=${flag("CROSSFIRE_FRAY_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Fragor:" drawn ON+projectiles near / not OFF + fps. Fuego ENEMIGO a >18px del héroe (no golpea al héroe, no colisiona con enemigos, life:99 ⇒ sobrevive los frames reales).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Fragor:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h = window.__dev.crossfireFray().hero;
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 3, ty: h.ty, side: "enemy" } });   // ~96px >18px ⇒ no golpea al héroe
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 4, ty: h.ty, side: "enemy" } });   // score 4 ⇒ T1 (robusto si uno cae)
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Fragor:\" se DIBUJA ON+proyectiles cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.crossfireFray({ enabled: true }); window.__dev.crossfireFray({ clearProj: true }); const h = window.__dev.crossfireFray().hero; window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 3, ty: h.ty, side: "enemy" } }); window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 4, ty: h.ty, side: "enemy" } }); window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 5, ty: h.ty, side: "hero" } }); window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.crossfireFray({ clearProj: true }); window.__dev.crossfireFray({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME projectiles at SAME tiles + hero at SAME tile ⇒ score/tier/ember + frayProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten proyectiles + tp héroe a las MISMAS coordenadas (crossfireFrayScore es fn pura de G.projectiles+posiciones). Síncrono ⇒ no tick ⇒ 0 consumo. Lejos del cluster de inyecciones previas de A.
  const PROJ_A = { tx: 60, ty: 40 }, PROJ_B = { tx: 61, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // 2 projectiles 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((PA, PB, HT) => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ spawnProj: { tx: PA.tx, ty: PA.ty, side: "enemy" } });    // weight 2
    window.__dev.crossfireFray({ spawnProj: { tx: PB.tx, ty: PB.ty, side: "hero" } });      // weight 1
    window.__dev.crossfireFray({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.crossfireFray();
    const lut = [0, 2, 5, 9].map(s => { const p = window.__dev.crossfireFray({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, ember: p.ember }; });   // LUT PURA
    const sp = window.__dev.crossfireFray({ frayProbe: true }).frayProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ enabled: false });
    return { score: vm.score, tier: vm.tier, ember: vm.ember, projCount: vm.projCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, PROJ_A, PROJ_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // projCount NO se compara globalmente: es el nº AMBIENTAL de proyectiles con peso en TODO el mundo, contaminado por proyectiles naturales de combate previo. El SIGNAL determinista per-snapshot — score/tier/ember + frayProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #77/#78/#79/#80; clearProj aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.ember === B.ember && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMOS proyectiles+héroe ⇒ score/tier/ember + frayProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; projCount global ambiental excluido — contaminado por proyectiles naturales de A; frayProbe cuenta SÓLO en radio tras clearProj)",
     conv, `A={score:${A.score},tier:${A.tier},ember:${A.ember},pc:${A.projCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},ember:${B.ember},pc:${B.projCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.crossfireFray({ enabled: false }));
  await pageB.evaluate(() => window.__dev.crossfireFray({ enabled: false }));

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
