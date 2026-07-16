// CAS-2456 — self-verify for VARIANTE DE ENCUENTRO ACTIVA (DARK, ENCOUNTER_VARIANT_SURGE.enabled:false). EVO mecánica #76 (serializa tras #75 ZONE_EVENT_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 17 LIVE #59-#75.
// (A) EJE FRESCO = PRESENCIA/TIPO DE UNA VARIANTE DE COMPORTAMIENTO DE ENCUENTRO (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = el subsistema ENCOUNTER_VARIANTS (CAS-2071) hornea DETERMINISTA por-posición una VARIANTE sobre un mob natural (maybeVariant/applyVariant, enemyVariantRng ISOLADO off-srand); cada mob-variante lleva {variant:"stalker"|"bastion"|"glass"} en e.variant/e.variantTint de G.enemies (estado de sim replicado, el MISMO campo que el render lee para el tinte/label de variante).
//     variantSurgeScore(hero)=Σ variantWeights[e.variant] sobre los mobs VIVOS con variante dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin variante cerca ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. Muerto/sin variante/neutral ⇒ peso 0.
//     ⊥ #75 (evento de zona = POIs de EVENTO en G.zoneEvents.pois; esto = MODIFICADOR DE COMPORTAMIENTO del encuentro sobre los MOBS), ⊥ #74 (afijo = CALIDAD estática de UN mob leída de mobAffixes(e), subsistema MOB_AFFIX, id-set disjunto {swift,armored,vampiric,volatile,frost}; variante = PATRÓN DINÁMICO del encuentro leído de e.variant, subsistema ENCOUNTER_VARIANTS {stalker,bastion,glass} — y maybeVariant NO se apila sobre un cuerpo afijado ⇒ SIN solape de portador), ⊥ #73 (apex = DISTANCIA a UN jefe; esto = presencia de variantes), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de un patrón de variante), ⊥ #69 (force-ratio = ENGANCHADOS), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = socketFind (recompensa de reagentes de engarce por forrajeo DENTRO de un encuentro de variante — NINGUNA de las 17 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73, flaskPotency #74, gemFind #75) está LLENA ⇒ pivota a una moneda FRESCA (h.socketShards, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio variantSocketCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el tier = función PURA de la SUMA DE PESO DE VARIANTES VIVAS en radio. Inyectar un mob-variante ⇒ variantSurge T≥1 por PRESENCIA DE VARIANTE — mientras afijo(#74) lo IGNORA (el orc-variante NO lleva afijo ⇒ su dangerProbe score NO cambia), evento(#75) lo IGNORA (un mob NO es un POI ⇒ zoneEvent score NO cambia) y apex(#73) lo IGNORA (un orc-variante NO es un jefe/campeón ⇒ apex tier 0). La señal es de fuente distinta (patrón de variante del encuentro, no calidad-de-afijo ni estado-de-evento ni distancia-a-jefe ni aggro-count ni cap-de-zona).
// ★ REAL SERVER-AUTH (check 6): spawnVariant inyecta un mob-variante REAL (spawnEnemy + applyVariant, mirror del path natural maybeVariant); variantProbe lee el score REAL + la lista de mobs-variante en radio (x,y,variant,weight) + variantMobCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageSocketsPreview = variantSurgeSocketBonus(score). Variante cerca ⇒ sockets>0; sin variante / lejos ⇒ 0.
// ★ SUB-CAP (check 9): sockets EFECTIVA = min(variantSocketCap=2, tier.sockets). Ningún score produce sockets>2.
// ★ BYTE-NEUTRAL OFF (check 10): con ENCOUNTER_VARIANT_SURGE OFF, variantSurgeSocketBonus(cualquier score)==0 y forageSocketsPreview==0 aun con un mob-variante PEGADO al héroe ⇒ 0 reagente al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la variante (score/tier/sockets) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind; activar APEX/SCARCITY (los primos recompensa-forrajeo) NO cambia la señal de variante, y la variante ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 17 mecánicas del arco #59-#75 siguen served enabled:true; ENCOUNTER_VARIANT_SURGE served false (DARK #76).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob-variante en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/sockets + variantProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). variantSurgeScore es función PURA de mobs-variante+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.variantSurge (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnVariant inyección REAL + variantProbe lectura server-auth) + peer channels (ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk/scarcity/apex/affixDanger/zoneEvent) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Variante:").
//
// Checks:
//   1  boots to play, __dev.variantSurge + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): ENCOUNTER_VARIANT_SURGE.enabled false AND G.variantSurge NUNCA se crea (gExists false); tier 0, score 0, sockets 0, forageSocketsPreview 0, channel socketFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'variantSurge'/'socketFind' Y sin 'socketShards' (reagentes transitorios, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de reagente NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0→T0/0, 1/2→T1/1, 3/6→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnVariant inyecta mob-variante REAL vivo; variantProbe lee score REAL>0 + mob en la lista + variantMobCount≥1.
//   7  ★ DIFERENCIADOR/⊥: mob-variante en radio ⇒ T≥1 por PRESENCIA DE VARIANTE mientras afijo(#74) lo IGNORA (dangerProbe score sin cambio), evento(#75) lo IGNORA (zoneEvent score sin cambio) y apex(#73) lo IGNORA (apex tier 0); afijo/apex/evento LIVE coexisten ⊥.
//   8  CANAL socketFind: forageSocketsPreview con variante cerca ⇒ sockets>0 (== variantSurgeSocketBonus); sin variante / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe sockets nunca > variantSocketCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, variantSurgeSocketBonus(mob pegado)==0 y forageSocketsPreview==0 ⇒ 0 reagente al seam (byte-id).
//  11  ★ ORTOGONALIDAD socketFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind: la variante NO cambia peers; activar APEX/SCARCITY NO cambia la señal de variante; variante ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 17 mecanismos del arco #59-#75 served enabled:true; ENCOUNTER_VARIANT_SURGE served false (DARK #76).
//  13  render badge "Variante:" se DIBUJA ON+variante cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMO mob-variante en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/sockets + variantProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2456-variantsurge-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2456");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,sockets}: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (capado a 2)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.variantSurge + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.variantSurge());
  ok("2 byte-id OFF (fresh boot): ENCOUNTER_VARIANT_SURGE.enabled false AND G.variantSurge NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.sockets === 0 && dark.forageSocketsPreview === 0 && dark.channel === "socketFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} sockets=${dark.sockets} preview=${dark.forageSocketsPreview} channel=${dark.channel} tag="${dark.tag}" variantMobCount=${dark.variantMobCount}`);

  // 3 save OFF has no variantSurge/socketFind/socketShards key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(variantSurge|socketFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noShardKey = !/"socketShards"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'variantSurge'/'socketFind' NI 'socketShards' (reagentes transitorios; estado 100% derivado)", noFeatKey && noShardKey, `noFeatKey=${noFeatKey} noShardKey=${noShardKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.variantSurge({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.variantSurge({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; los reagentes NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.variantSurge({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].sockets === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnVariant injects a real live variant mob; variantProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;                            // hero's current tile
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 3, ty: h.ty, variant: "bastion" } });   // inject bastion variant mob 3 tiles east (~96px, in radius)
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });             // hero back to origin tile
    const vp = window.__dev.variantSurge({ variantProbe: true }).variantProbe;
    const vm = window.__dev.variantSurge();
    window.__dev.variantSurge({ enabled: false });
    return { vp, variantMobCount: vm.variantMobCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnVariant inyecta mob-variante REAL vivo; variantProbe lee score REAL>0 + mob 'bastion' en la lista + variantMobCount≥1",
     server6.vp && server6.vp.score > 0 && server6.vp.count >= 1 && server6.vp.mobs[0] && server6.vp.mobs[0].variant === "bastion" && server6.variantMobCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥: variant mob ⇒ T≥1 by VARIANT PRESENCE, while affix(#74) IGNORES it (dangerProbe score unchanged), event(#75) IGNORES it (zoneEvent score unchanged) and apex(#73) IGNORES it (apex tier 0). AFFIX/APEX/EVENT LIVE coexist ⊥.
  const diff = await page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // afijo score ANTES del mob-variante (mismo snapshot congelado)
    const evBefore = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : 0;             // evento score ANTES
    const vsBefore = window.__dev.variantSurge().score;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 5, ty: h.ty, variant: "stalker" } });   // variante ~160px (in radius) → surge por PRESENCIA DE VARIANTE
    const affixAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;    // afijo score DESPUÉS — el orc-variante NO lleva afijo ⇒ SIN cambio
    const evAfter = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : 0;              // evento score DESPUÉS — un mob NO es un POI ⇒ SIN cambio
    const vm = window.__dev.variantSurge();
    const ap = window.__dev.apex ? window.__dev.apex() : null;             // apex reward-forage cousin LIVE — un orc-variante NO es jefe ⇒ apex tier 0
    const ev = window.__dev.zoneEvent ? window.__dev.zoneEvent() : null;   // evento reward-forage cousin LIVE (#75)
    const ad = window.__dev.affixDanger ? window.__dev.affixDanger() : null; // afijo reward-forage cousin LIVE (#74)
    window.__dev.variantSurge({ enabled: false });
    return { tier: vm.tier, score: vm.score, sockets: vm.sockets, vsBefore, affixBefore, affixAfter, evBefore, evAfter, apexTier: ap ? ap.tier : null, apEnabled: ap ? ap.enabled : null, evEnabled: ev ? ev.enabled : null, adEnabled: ad ? ad.enabled : null };
  });
  const diffOK = diff.tier >= 1 && diff.score >= 1 && diff.sockets >= 1 && diff.score > diff.vsBefore && diff.affixAfter === diff.affixBefore && diff.evAfter === diff.evBefore && diff.apexTier === 0 && diff.apEnabled === true && diff.evEnabled === true && diff.adEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: mob-variante ⇒ T≥1 por PRESENCIA DE VARIANTE mientras afijo(#74) lo IGNORA (dangerProbe sin cambio), evento(#75) lo IGNORA (zoneEvent sin cambio) y apex(#73) lo IGNORA (apex tier 0); afijo/apex/evento LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL socketFind: forageSocketsPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "bastion" } });   // ~128px, in radius
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.variantSurge();
    const nearPrev = nearVm.forageSocketsPreview, nearSockets = nearVm.sockets;
    window.__dev.variantSurge({ tp: { tx: h.tx + 40, ty: h.ty } });        // hero 40 tiles away (~1280px > radius 260) → score 0
    const farVm = window.__dev.variantSurge();
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.variantSurge({ enabled: false });
    return { nearPrev, nearSockets, farPrev: farVm.forageSocketsPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearSockets && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL socketFind: forageSocketsPreview con variante cerca ⇒ sockets>0 (==variantSurgeSocketBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: sockets never exceeds variantSocketCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe.sockets);
    return { max: Math.max(...vals), cap: window.__dev.variantSurge().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce sockets>variantSocketCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ sockets 0 + forageSocketsPreview 0 even with variant mob glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx, ty: h.ty, variant: "bastion" } });     // mob ON TOP of hero tile ⇒ score>0 ⇒ would be T1
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.variantSurge({ enabled: false });                        // now OFF
    const off = window.__dev.variantSurge();
    return { preview: off.forageSocketsPreview, sockets: off.sockets, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.sockets === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, variantSurgeSocketBonus(mob pegado)==0 + forageSocketsPreview==0 ⇒ 0 reagente al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip variantSurge OFF→ON at the SAME state ⇒ los 12 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de variante.
  const orth = await page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "bastion" } });
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.variantSurge({ enabled: false });
    const snap = () => { const s = window.__dev.variantSurge(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview }; };
    const peersOff = snap();                                             // VARIANT OFF (misma posición del héroe)
    window.__dev.variantSurge({ enabled: true });
    const peersOn = snap();                                              // VARIANT ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the variant signal
    const beforeArc = window.__dev.variantSurge();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.variantSurge();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.variantSurge({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.sockets === afterArc.sockets;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD socketFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind: flip variante OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de variante; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 17 arc flags served true; ENCOUNTER_VARIANT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const evsDark = flag("ENCOUNTER_VARIANT_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 17 mecanismos del arco #59-#75 served enabled:true; ENCOUNTER_VARIANT_SURGE served false (DARK #76)",
     arcAllOn && evsDark && arc.length === 17, `variantSurge=${flag("ENCOUNTER_VARIANT_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Variante:" drawn ON+variant near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Variante:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "bastion" } });
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.variantSurge({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Variante:\" se DIBUJA ON+variante cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.variantSurge({ enabled: true }); const h = window.__dev.variantSurge().hero; window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "bastion" } }); window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.variantSurge({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence: SAME variant mob at SAME tile + hero at SAME tile ⇒ score/tier/sockets + variantProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // A FIXED absolute tile so both clients teleport hero + variant mob to the SAME coordinates (variantSurgeScore es fn pura de mobs-variante+posiciones). Lejos del cluster de inyecciones previas de A.
  const VAR_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // variant mob 3 tiles west of hero (~96px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((VT, HT) => {
    window.__dev.variantSurge({ enabled: true });
    window.__dev.variantSurge({ spawnVariant: { tx: VT.tx, ty: VT.ty, variant: "bastion" } });
    window.__dev.variantSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.variantSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, sockets: p.sockets }; });   // LUT PURA
    const vp = window.__dev.variantSurge({ variantProbe: true }).variantProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.variantSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, sockets: vm.sockets, variantMobCount: vm.variantMobCount, vpScore: vp.score, vpCount: vp.count, lut, fp };
  }, VAR_TILE, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // variantMobCount NO se compara: es el nº AMBIENTAL de mobs-variante vivos, contaminado por las inyecciones de PRUEBA que el cliente A acumuló en los 13 checks previos (B es fresco) + las variantes naturales de las zonas de caza. El SIGNAL determinista per-snapshot — score/tier/sockets + variantProbe(score,count) + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #72/#73/#74/#75).
  const conv = A.score === B.score && A.tier === B.tier && A.sockets === B.sockets && A.vpScore === B.vpScore && A.vpCount === B.vpCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO mob-variante+héroe ⇒ score/tier/sockets + variantProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; variantMobCount ambiental excluido — contaminado por inyecciones de prueba de A + variantes naturales)",
     conv, `A={score:${A.score},tier:${A.tier},sockets:${A.sockets},count:${A.variantMobCount},vpScore:${A.vpScore},vpCount:${A.vpCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},sockets:${B.sockets},count:${B.variantMobCount},vpScore:${B.vpScore},vpCount:${B.vpCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.variantSurge({ enabled: false }));
  await pageB.evaluate(() => window.__dev.variantSurge({ enabled: false }));

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
