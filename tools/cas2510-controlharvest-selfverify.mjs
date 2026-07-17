// CAS-2510 — self-verify for COSECHA DE SOMETIMIENTO (DARK, CONTROL_HARVEST_SURGE.enabled:false). EVO mecánica #85 (serializa tras #84 SKIRMISH_LINE_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 26 LIVE #59-#84.
// (A) EJE FRESCO = DENSIDAD DE ESTADO DE CONTROL DE MULTITUD (CC) sobre los MOBS VIVOS de la vecindad (server-auth, MMORPG-native). PRE-FLIGHT GATE: el eje RECOMENDADO del issue (TIER CAMPEÓN/ÉLITE, sistema CHAMPION e.champion/e.champElite) FALLA ⊥26 — #73 APEX_PROXIMITY YA lee ese contenedor EXACTO vía apexIsThreat(e)=(e.isBoss||e.champion||e.champElite) (sim.js:4015) ⇒ NO es un contenedor DISTINTO ⇒ PIVOTE justificado al eje alterno FRESCO `e.stun`/`e.slowT` = ESTADO DE CONTROL server-auth: e.stun (AI-freeze DURO, sim.js:7772 congela la IA) / e.slowT (frost slow BLANDO, sim.js:7794 arrastra chase spd), poblados por combate (POISE stagger 5478 / carapace shatter 8142 / applyStatus type stun|slow 6542-6543), tickeados en updateEnemies. NINGUNA de las 26 flags #59-#84 los lee como eje de SCORE (grep verificado).
//     controlHarvestScore(hero)=Σ controlWeight(e) sobre los mobs VIVOS bajo CC dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin pack sometido ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. controlWeight(e)=0 si sin control, STUN duro (e.stun>0)⇒2, SLOW blando (e.slowT>0)⇒1; stun+slow⇒2 (MAX). FILTRA !e.dead ⇒ ANTI-AUTO-CONTEO.
//     ⊥ #84 (escaramuza = CLASE DE ALCANCE ESTÁTICA e.tpl.ranged del template; control = ESTADO DINÁMICO de CC e.stun/e.slowT — un rusher MELEE aturdido = cero escaramuza/alto control, DIVERGEN), ⊥ #83 (plaga = AFLICCIONES DoT e.dots [DAÑO]; control = ESTADO de CC [NEGACIÓN-de-acción] — mob envenenado corriendo libre = alta plaga/cero control; mob aturdido sin veneno = cero plaga/alto control, DISJUNTOS), ⊥ #82 (vorágine = ZONAS G.fields), ⊥ #81 (fragor = PROYECTILES G.projectiles), ⊥ #80 (carnicería = CUERPOS MUERTOS G.corpses; control cuenta mobs VIVOS sometidos), ⊥ #79 (botín = OBJETOS G.drops), ⊥ #78 (furia = FASE de un JEFE e.enraged), ⊥ #77 (hazard = G.hazards), ⊥ #76 (variante = e.variant, modificador de SPAWN), ⊥ #74 (afijo = CALIDAD ESTÁTICA e.affix horneada al spawn — un mob 'swift' recién spawneado = alto afijo/cero control hasta que lo aturdo), ⊥ #73 (apex = DISTANCIA a un jefe/campeón VIVO e.champion/e.champElite/e.isBoss; control = DENSIDAD de mobs SOMETIDOS por CC — el eje CHAMPION recomendado colisionaría, por eso pivoté), ⊥ #72 (escasez AUSENCIA de mobs VIVOS), ⊥ #69 (LAST_STAND CONTEO de ENGANCHADOS en melee SIN filtro de estado — 5 rushers enganchados sin aturdir = alto LAST_STAND/cero control; 3 mobs aturdidos a distancia = bajo LAST_STAND/alto control, DIVERGEN), ⊥ lootQuality #63/#68, NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = controlFind (recompensa de cargas de sometimiento por rematar en medio de un pack SOMETIDO por CC — NINGUNA de las 26 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind, lootQuality, xpGain, essenceFind, matFind, flaskPotency, gemFind, socketFind, healPotency, trophyFind #78, salvageFind #79, boneFind #80, frayFind #81, maelstromFind #82, blightFind #83, skirmishFind #84) está LLENA ⇒ pivota a una moneda FRESCA (h.controlCharges, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio controlChargeCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el eje key en el ESTADO DE CONTROL (e.stun/e.slowT), NO en clase-de-alcance/aflicciones-DoT/fases-de-jefe/afijos/variantes. Inyectar mobs MELEE ATURDIDOS (orc + stun, sin afijo/variante/enrage/dots/alcance) ⇒ control sube MIENTRAS afijo(#74)/variante(#76)/furia(#78)/plaga(#83)/escaramuza(#84) lo IGNORAN (un orc aturdido NO es afijado/variante/enfurecido/envenenado/a-distancia ⇒ sus probes 0), + un mob NO controlado NO sube el control (peso 0).
// ★ REAL SERVER-AUTH (check 6): spawnControl empuja un mob REAL al MISMO G.enemies + applyStatus (camino de CC real); controlProbe lee el score REAL + la lista de mobs bajo CC en radio (x,y,stun,slowT,weight) + mobCount ⇒ estado server-auth auténtico. STUN⇒peso2, SLOW⇒peso1.
// ★ CANAL (check 8): forageChargePreview = controlHarvestBonus(score). Pack cerca ⇒ charge>0; sin pack / lejos ⇒ 0.
// ★ SUB-CAP (check 9): charge EFECTIVA = min(controlChargeCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 10): con CONTROL_HARVEST_SURGE OFF, controlHarvestBonus(cualquier score)==0 y forageChargePreview==0 aun con mobs bajo CC PEGADOS al héroe ⇒ 0 cargas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): el control (score/tier/charge) NO cambia los readouts de los hooks peer (skirmishLine/blightHarvest/apex/scarcity); activar APEX/SCARCITY NO cambia la señal de control.
// ★ 0-REGRESIÓN (check 12): las 26 mecánicas del arco #59-#84 siguen served enabled:true; CONTROL_HARVEST_SURGE served false (DARK #85).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMOS mobs bajo CC en los MISMOS tiles + héroe en el MISMO tile ⇒ score/tier/charge + controlProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). controlHarvestScore es función PURA de G.enemies+e.stun/e.slowT+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.controlHarvest (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + spawnControl inyección REAL + clearControl + controlProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Sometimiento:"). Los mobs inyectados de PRUEBA son estacionarios (spd:0) + alto-HP (99999) ⇒ no se mueven/mueren ⇒ 0 efecto de sim en las lecturas.
//
// Run: node tools/cas2510-controlharvest-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2510");
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.blightHarvest && window.__dev.maelstromField && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.controlHarvest + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.controlHarvest());
  ok("2 byte-id OFF (fresh boot): CONTROL_HARVEST_SURGE.enabled false AND G.controlCharges NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "controlFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" mobCount=${dark.mobCount}`);

  // 3 save OFF has no controlFind/controlCharges key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(controlFind|controlCharges)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"controlCharges"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'controlFind'/'controlCharges' (cargas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.controlHarvest({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.controlHarvest({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las cargas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.controlHarvest({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnControl pushes real CC'd mobs to G.enemies via applyStatus; controlProbe reads real score + list. STUN⇒w2, SLOW⇒w1.
  const server6 = await page.evaluate(() => {
    window.__dev.controlHarvest({ enabled: true });
    window.__dev.controlHarvest({ clearControl: true });
    const h = window.__dev.controlHarvest().hero;
    const stun = window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 3, ty: h.ty, kind: "stun" } }).spawnControl;   // e.stun>0 ⇒ weight 2
    const slow = window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 4, ty: h.ty, kind: "slow" } }).spawnControl;   // e.slowT>0 ⇒ weight 1
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const sp = window.__dev.controlHarvest({ controlProbe: true }).controlProbe;
    const vm = window.__dev.controlHarvest();
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ enabled: false });
    return { stun, slow, sp, mobCount: vm.mobCount, tier: vm.tier, score: vm.score };
  });
  const s6OK = server6.stun && server6.stun.weight === 2 && server6.stun.stun > 0 &&
    server6.slow && server6.slow.weight === 1 && server6.slow.slowT > 0 &&
    server6.sp && server6.sp.score >= 3 && server6.sp.count >= 2 && server6.mobCount >= 2 && server6.tier >= 1;
  ok("6 ★ REAL SERVER-AUTH: spawnControl empuja mobs REALES bajo CC a G.enemies vía applyStatus; STUN⇒peso2 (e.stun>0), SLOW⇒peso1 (e.slowT>0); controlProbe lee score REAL≥3 + 2 mobs + mobCount≥2",
     s6OK, JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥ vs affix(#74)/variant(#76)/enrage(#78)/blight(#83)/skirmish(#84): un orc ATURDIDO NO es afijado/variante/enfurecido/envenenado/a-distancia; un mob NO controlado NO sube el control. Corre en un tile REMOTO fresco (deltas).
  const diff = await page.evaluate(() => {
    window.__dev.controlHarvest({ enabled: true });
    window.__dev.controlHarvest({ clearControl: true });
    const h0 = window.__dev.controlHarvest().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                    // tile remoto fresco, ~120 tiles al oeste
    window.__dev.controlHarvest({ tp: { tx: RX, ty: RY } });
    const baseCtrl = window.__dev.controlHarvest().score;                 // baseline (esperado 0)
    const affBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;
    const varBefore = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
    const enrBefore = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    const bliBefore = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    // inyecta 2 orcs MELEE ATURDIDOS (stun ⇒ weight2 c/u = score 4 ⇒ T2) al este dentro de radio
    window.__dev.controlHarvest({ spawnControl: { tx: RX + 3, ty: RY, kind: "stun" } });
    window.__dev.controlHarvest({ spawnControl: { tx: RX + 4, ty: RY, kind: "stun" } });
    window.__dev.controlHarvest({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.controlHarvest();
    // + un mob NO controlado (orc plano) — NO debe subir el control (peso 0)
    window.__dev.controlHarvest({ spawnControl: { tx: RX + 5, ty: RY, kind: "none" } });
    window.__dev.controlHarvest({ tp: { tx: RX, ty: RY } });
    const vmUncontrolled = window.__dev.controlHarvest();                  // score IGUAL que vm (el no-controlado no cuenta)
    const affAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // orc aturdido NO tiene afijo ⇒ sin cambio
    const varAfter = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;   // NO tiene variante ⇒ sin cambio
    const enrAfter = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;   // NO es un jefe enfurecido ⇒ sin cambio
    const bliAfter = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;   // NO tiene dots ⇒ sin cambio
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;   // ★ orc = MELEE (ranged falsy) ⇒ escaramuza IGNORA ⇒ sin cambio (⊥ #84: control cuenta un melee que escaramuza no)
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ enabled: false });
    return { baseCtrl, score: vm.score, tier: vm.tier, charge: vm.charge, uncontrolledScore: vmUncontrolled.score,
      affBefore, affAfter, varBefore, varAfter, enrBefore, enrAfter, bliBefore, bliAfter, skiBefore, skiAfter };
  });
  const diffOK = diff.score > diff.baseCtrl && diff.tier >= 2 && diff.charge >= 1 &&               // mobs aturdidos: control fires (2+2=4⇒T2)
    diff.uncontrolledScore === diff.score &&                                                        // ★ un mob NO controlado NO sube el control (peso 0)
    diff.affAfter === diff.affBefore && diff.varAfter === diff.varBefore &&                         // afijo/variante IGNORAN el orc aturdido
    diff.enrAfter === diff.enrBefore && diff.bliAfter === diff.bliBefore &&                         // furia/plaga IGNORAN el orc aturdido
    diff.skiAfter === diff.skiBefore;                                                               // ★ escaramuza IGNORA el orc MELEE aturdido (⊥ #84)
  ok("7 ★ DIFERENCIADOR/⊥: inyectar orcs MELEE ATURDIDOS ⇒ control sube a T2 MIENTRAS afijo(#74)/variante(#76)/furia(#78)/plaga(#83)/escaramuza(#84) IGNORAN + un mob NO controlado NO sube control (peso 0); las 26 LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL controlFind: forageChargePreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.controlHarvest({ enabled: true });
    window.__dev.controlHarvest({ clearControl: true });
    const h = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 4, ty: h.ty, kind: "stun" } });   // weight 2 ⇒ score 2 ⇒ T1
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.controlHarvest();
    const nearPrev = nearVm.forageChargePreview, nearCharge = nearVm.charge;
    window.__dev.controlHarvest({ tp: { tx: h.tx + 40, ty: h.ty } });         // hero ~1280px > radius 260 → score 0
    const farVm = window.__dev.controlHarvest();
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ enabled: false });
    return { nearPrev, nearCharge, farPrev: farVm.forageChargePreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearCharge && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL controlFind: forageChargePreview con pack cerca ⇒ charge>0 (==controlHarvestBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: charge never exceeds controlChargeCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.controlHarvest({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.controlHarvest().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce charge>controlChargeCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with CC'd mobs glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.controlHarvest({ enabled: true });
    window.__dev.controlHarvest({ clearControl: true });
    const h = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx, ty: h.ty, kind: "stun" } });    // weight2 mob ON hero tile ⇒ score 2 ⇒ would be T1
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.controlHarvest({ enabled: false });                         // now OFF
    const off = window.__dev.controlHarvest();
    window.__dev.controlHarvest({ enabled: true }); window.__dev.controlHarvest({ clearControl: true }); window.__dev.controlHarvest({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, controlHarvestBonus(mobs pegados)==0 + forageChargePreview==0 ⇒ 0 cargas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip control OFF→ON at the SAME state ⇒ los hooks peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de control.
  const orth = await page.evaluate(() => {
    window.__dev.controlHarvest({ enabled: true });
    window.__dev.controlHarvest({ clearControl: true });
    const h = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 4, ty: h.ty, kind: "stun" } });
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.controlHarvest({ enabled: false });
    const snap = () => JSON.stringify({ ski: window.__dev.skirmishLine(), bli: window.__dev.blightHarvest(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();                                             // CONTROL OFF (misma posición del héroe)
    window.__dev.controlHarvest({ enabled: true });
    const peersOn = snap();                                              // CONTROL ON — los peers NO deben cambiar
    const beforeArc = window.__dev.controlHarvest();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.controlHarvest();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });                              // restaura estado LIVE
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD controlFind ⊥ peers: flip control OFF→ON NO cambia skirmishLine/blightHarvest/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de control; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 26 arc flags served true; CONTROL_HARVEST_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const chsDark = flag("CONTROL_HARVEST_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 26 mecanismos del arco #59-#84 served enabled:true; CONTROL_HARVEST_SURGE served false (DARK #85)",
     arcAllOn && chsDark && arc.length === 26, `controlHarvest=${flag("CONTROL_HARVEST_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Sometimiento:" drawn ON+mobs near / not OFF + fps. Mobs de prueba estacionarios (spd:0) + alto-HP (99999).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Sometimiento:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.controlHarvest({ enabled: true });
    window.__dev.controlHarvest({ clearControl: true });
    const h = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 3, ty: h.ty, kind: "stun" } });   // weight2
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 4, ty: h.ty, kind: "stun" } });   // score 4 ⇒ T2 (robusto)
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Sometimiento:\" se DIBUJA ON+pack cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.controlHarvest({ enabled: true }); window.__dev.controlHarvest({ clearControl: true }); const h = window.__dev.controlHarvest().hero; window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 3, ty: h.ty, kind: "stun" } }); window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 4, ty: h.ty, kind: "slow" } }); window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.controlHarvest({ clearControl: true }); window.__dev.controlHarvest({ enabled: false }); });

  // 14 ★ NORTH STAR — 2-client convergence: SAME CC'd mobs at SAME tiles + hero at SAME tile ⇒ score/tier/charge + controlProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles para que ambos clientes inyecten mobs + tp héroe a las MISMAS coordenadas (controlHarvestScore es fn pura de G.enemies+e.stun/e.slowT+posiciones).
  const MOB_A = { tx: 60, ty: 40, kind: "stun" }, MOB_B = { tx: 61, ty: 40, kind: "slow" }, HERO_TILE = { tx: 63, ty: 40 };   // A stun(weight2) + B slow(weight1) = score3 ⇒ T1, 2-3 tiles west of hero (~64-96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((MA, MB, HT) => {
    window.__dev.controlHarvest({ enabled: true });
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ spawnControl: { tx: MA.tx, ty: MA.ty, kind: MA.kind } });   // weight 2 (stun)
    window.__dev.controlHarvest({ spawnControl: { tx: MB.tx, ty: MB.ty, kind: MB.kind } });   // weight 1 (slow)
    window.__dev.controlHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.controlHarvest();
    const lut = [0, 2, 4, 9].map(s => { const p = window.__dev.controlHarvest({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });   // LUT PURA
    const sp = window.__dev.controlHarvest({ controlProbe: true }).controlProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, mobCount: vm.mobCount, spScore: sp.score, spCount: sp.count, lut, fp };
  }, MOB_A, MOB_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // mobCount NO se compara globalmente: es el nº AMBIENTAL de mobs bajo CC en TODO el mundo, contaminado por combate previo. El SIGNAL determinista per-snapshot — score/tier/charge + controlProbe(score,count) EN RADIO + LUT PURA + worldFingerprint — es lo shard-consistente (clearControl aísla los de prueba).
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMOS mobs bajo CC+héroe ⇒ score/tier/charge + controlProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; mobCount global ambiental excluido; controlProbe cuenta SÓLO en radio tras clearControl)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},mc:${A.mobCount},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},mc:${B.mobCount},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.controlHarvest({ enabled: false }));
  await pageB.evaluate(() => window.__dev.controlHarvest({ enabled: false }));

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
