// CAS-2450 — self-verify for PARTICIPACIÓN EN EVENTO DE ZONA (DARK, ZONE_EVENT_SURGE.enabled:false). EVO mecánica #75 (serializa tras #74 MOB_AFFIX_DANGER LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 16 LIVE #59-#74.
// (A) EJE FRESCO = ESTADO DE EVENTO DE ZONA/MUNDO ACTIVO (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = el subsistema ZONE_EVENTS (CAS-1681) siembra POIs de evento DETERMINISTAS por zona (eventRng ISOLADO, off-srand); cada POI lleva {id,type(shrine|chest|goblin),zone,x,y,state(active|done|escaped)} en G.zoneEvents.pois (estado de sim replicado, el MISMO array que tickZoneEvents recorre).
//     zoneEventScore(hero)=Σ eventWeights[type] sobre los POIs state==="active" dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin evento activo cerca ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja. state==="done"/"escaped" ⇒ peso 0 (evento consumido).
//     ⊥ #74 (afijo = CALIDAD de un mob individual; esto = ESTADO DE EVENTO de la zona, independiente de qué mobs haya), ⊥ #73 (apex = DISTANCIA a UN jefe; esto = presencia de POIs de EVENTO activos), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de un evento dinámico), ⊥ #69 (force-ratio = ENGANCHADOS), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = gemFind (recompensa de esquirlas de gema por forrajeo DENTRO de un evento activo — NINGUNA de las 16 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73, flaskPotency #74) está LLENA ⇒ pivota a una moneda FRESCA (h.eventGems, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio eventGemCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el tier = función PURA de la SUMA DE PESO DE EVENTOS ACTIVOS en radio. Inyectar un POI de evento activo ⇒ zoneEvent T≥1 por ESTADO DE EVENTO — mientras afijo(#74) lo IGNORA (un POI NO es un mob de G.enemies ⇒ su dangerProbe score NO cambia) y apex(#73) lo IGNORA (un POI NO es un jefe ⇒ apex tier 0). La señal es de fuente distinta (estado de evento de zona, no calidad-de-afijo ni distancia-a-jefe ni aggro-count ni cap-de-zona).
// ★ REAL SERVER-AUTH (check 6): spawnEvent inyecta un POI REAL (empujado a G.zoneEvents.pois, mirror de spawnZonePOI); eventProbe lee el score REAL + la lista de POIs activos en radio (x,y,type,state,weight) + activeEventCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageGemsPreview = zoneEventGemBonus(score). Evento cerca ⇒ gems>0; sin evento / lejos ⇒ 0.
// ★ SUB-CAP (check 9): gems EFECTIVA = min(eventGemCap=2, tier.gems). Ningún score produce gems>2.
// ★ BYTE-NEUTRAL OFF (check 10): con ZONE_EVENT_SURGE OFF, zoneEventGemBonus(cualquier score)==0 y forageGemsPreview==0 aun con un POI activo PEGADO al héroe ⇒ 0 gema al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la participación (score/tier/gems) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency; activar APEX/SCARCITY (los primos recompensa-forrajeo) NO cambia la señal de evento, y el evento ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 16 mecánicas del arco #59-#74 siguen served enabled:true; ZONE_EVENT_SURGE served false (DARK #75).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO POI de evento en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/gems + eventProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). zoneEventScore es función PURA de POIs+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.zoneEvent (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnEvent inyección REAL + eventProbe lectura server-auth) + peer channels (ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk/scarcity/apex/affixDanger) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Evento:").
//
// Checks:
//   1  boots to play, __dev.zoneEvent + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): ZONE_EVENT_SURGE.enabled false AND G.zoneEventSurge NUNCA se crea (gExists false); tier 0, score 0, gems 0, forageGemsPreview 0, channel gemFind, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'zoneEventSurge'/'gemFind' Y sin 'eventGems' (esquirlas de gema transitorias, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de gema NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0→T0/0, 1/2→T1/1, 3/6→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnEvent inyecta POI REAL activo; eventProbe lee score REAL>0 + POI en la lista + activeEventCount≥1.
//   7  ★ DIFERENCIADOR/⊥: POI de evento activo en radio ⇒ T≥1 por ESTADO DE EVENTO mientras afijo(#74) lo IGNORA (dangerProbe score sin cambio) y apex(#73) lo IGNORA (apex tier 0); afijo/apex/scarcity LIVE coexisten ⊥.
//   8  CANAL gemFind: forageGemsPreview con evento cerca ⇒ gems>0 (== zoneEventGemBonus); sin evento / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe gems nunca > eventGemCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, zoneEventGemBonus(POI pegado)==0 y forageGemsPreview==0 ⇒ 0 gema al seam (byte-id).
//  11  ★ ORTOGONALIDAD gemFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency: el evento NO cambia peers; activar APEX/SCARCITY NO cambia la señal de evento; evento ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 16 mecanismos del arco #59-#74 served enabled:true; ZONE_EVENT_SURGE served false (DARK #75).
//  13  render badge "Evento:" se DIBUJA ON+evento cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMO POI de evento en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/gems + eventProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2450-zoneevent-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2450");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,gems}: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, g: 0 }, { score: 1, t: 1, g: 1 },
  { score: 2, t: 1, g: 1 }, { score: 3, t: 2, g: 2 },
  { score: 6, t: 2, g: 2 }, { score: 99, t: 2, g: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.zoneEvent + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.zoneEvent());
  ok("2 byte-id OFF (fresh boot): ZONE_EVENT_SURGE.enabled false AND G.zoneEventSurge NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.gems === 0 && dark.forageGemsPreview === 0 && dark.channel === "gemFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} gems=${dark.gems} preview=${dark.forageGemsPreview} channel=${dark.channel} tag="${dark.tag}" activeEventCount=${dark.activeEventCount}`);

  // 3 save OFF has no zoneEventSurge/gemFind/eventGems key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(zoneEventSurge|gemFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noGemKey = !/"eventGems"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'zoneEventSurge'/'gemFind' NI 'eventGems' (esquirlas transitorias; estado 100% derivado)", noFeatKey && noGemKey, `noFeatKey=${noFeatKey} noGemKey=${noGemKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.zoneEvent({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.zoneEvent({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las gemas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.zoneEvent({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].gems === c.g);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnEvent injects a real active POI; eventProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;                              // hero's current tile
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 3, ty: h.ty, type: "chest", state: "active" } });   // inject active event POI 3 tiles east (~96px, in radius)
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });               // hero back to origin tile
    const ep = window.__dev.zoneEvent({ eventProbe: true }).eventProbe;
    const vm = window.__dev.zoneEvent();
    window.__dev.zoneEvent({ enabled: false });
    return { ep, activeEventCount: vm.activeEventCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnEvent inyecta POI REAL activo; eventProbe lee score REAL>0 + POI 'chest' activo en la lista + activeEventCount≥1",
     server6.ep && server6.ep.score > 0 && server6.ep.count >= 1 && server6.ep.pois[0] && server6.ep.pois[0].type === "chest" && server6.ep.pois[0].state === "active" && server6.activeEventCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥: active zone EVENT ⇒ T≥1 by EVENT STATE, while affix(#74) IGNORES it (dangerProbe score unchanged by the POI) and apex(#73) IGNORES it (apex tier 0). AFFIX/APEX/SCARCITY LIVE coexist ⊥.
  const diff = await page.evaluate(() => {
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // afijo score ANTES del POI (mismo snapshot congelado)
    const evBefore = window.__dev.zoneEvent().score;
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 5, ty: h.ty, type: "goblin", state: "active" } });   // POI activo ~160px (in radius) → surge por PRESENCIA DE EVENTO
    const affixAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;    // afijo score DESPUÉS del POI — un POI NO es un mob ⇒ SIN cambio
    const vm = window.__dev.zoneEvent();
    const ap = window.__dev.apex ? window.__dev.apex() : null;             // apex reward-forage cousin LIVE — señal distinta (distancia a UN jefe; un POI NO es jefe)
    const sc = window.__dev.scarcity ? window.__dev.scarcity() : null;     // scarcity reward-forage cousin LIVE
    const ad = window.__dev.affixDanger ? window.__dev.affixDanger() : null; // afijo reward-forage cousin LIVE (#74)
    window.__dev.zoneEvent({ enabled: false });
    return { tier: vm.tier, score: vm.score, gems: vm.gems, evBefore, affixBefore, affixAfter, apexTier: ap ? ap.tier : null, apEnabled: ap ? ap.enabled : null, scEnabled: sc ? sc.enabled : null, adEnabled: ad ? ad.enabled : null };
  });
  const diffOK = diff.tier >= 1 && diff.score >= 1 && diff.gems >= 1 && diff.score > diff.evBefore && diff.affixAfter === diff.affixBefore && diff.apexTier === 0 && diff.apEnabled === true && diff.scEnabled === true && diff.adEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: POI de evento activo ⇒ T≥1 por ESTADO DE EVENTO mientras afijo(#74) lo IGNORA (dangerProbe sin cambio) y apex(#73) lo IGNORA (apex tier 0); afijo/apex/scarcity LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL gemFind: forageGemsPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "chest", state: "active" } });   // ~128px, in radius
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.zoneEvent();
    const nearPrev = nearVm.forageGemsPreview, nearGems = nearVm.gems;
    window.__dev.zoneEvent({ tp: { tx: h.tx + 40, ty: h.ty } });          // hero 40 tiles away (~1280px > radius 360) → score 0
    const farVm = window.__dev.zoneEvent();
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.zoneEvent({ enabled: false });
    return { nearPrev, nearGems, farPrev: farVm.forageGemsPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearGems && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL gemFind: forageGemsPreview con evento cerca ⇒ gems>0 (==zoneEventGemBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: gems never exceeds eventGemCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.zoneEvent({ scoreProbe: { score: s } }).scoreProbe.gems);
    return { max: Math.max(...vals), cap: window.__dev.zoneEvent().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce gems>eventGemCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ gems 0 + forageGemsPreview 0 even with active POI glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx, ty: h.ty, type: "chest", state: "active" } });     // POI ON TOP of hero tile ⇒ score>0 ⇒ would be T1
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.zoneEvent({ enabled: false });                          // now OFF
    const off = window.__dev.zoneEvent();
    return { preview: off.forageGemsPreview, gems: off.gems, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.gems === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, zoneEventGemBonus(POI pegado)==0 + forageGemsPreview==0 ⇒ 0 gema al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip zoneEvent OFF→ON at the SAME state ⇒ los 11 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de evento.
  const orth = await page.evaluate(() => {
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.zoneEvent({ enabled: false });
    const snap = () => { const s = window.__dev.zoneEvent(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview }; };
    const peersOff = snap();                                             // EVENT OFF (misma posición del héroe)
    window.__dev.zoneEvent({ enabled: true });
    const peersOn = snap();                                              // EVENT ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the event signal
    const beforeArc = window.__dev.zoneEvent();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.zoneEvent();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.zoneEvent({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.gems === afterArc.gems;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD gemFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency: flip evento OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de evento; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 16 arc flags served true; ZONE_EVENT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const zeDark = flag("ZONE_EVENT_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 16 mecanismos del arco #59-#74 served enabled:true; ZONE_EVENT_SURGE served false (DARK #75)",
     arcAllOn && zeDark && arc.length === 16, `zoneEvent=${flag("ZONE_EVENT_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Evento:" drawn ON+event near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Evento:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.zoneEvent({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Evento:\" se DIBUJA ON+evento cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.zoneEvent({ enabled: true }); const h = window.__dev.zoneEvent().hero; window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "chest", state: "active" } }); window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.zoneEvent({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence: SAME active POI at SAME tile + hero at SAME tile ⇒ score/tier/gems + eventProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // A FIXED absolute tile so both clients teleport hero + active POI to the SAME coordinates (zoneEventScore es fn pura de POIs+posiciones). Lejos del cluster de inyecciones previas de A.
  const EVENT_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 64, ty: 40 };   // active POI 4 tiles west of hero (~128px, in radius 360)
  const readVM = async (pg) => await pg.evaluate((ET, HT) => {
    window.__dev.zoneEvent({ enabled: true });
    window.__dev.zoneEvent({ spawnEvent: { tx: ET.tx, ty: ET.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.zoneEvent();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.zoneEvent({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, gems: p.gems }; });   // LUT PURA
    const ep = window.__dev.zoneEvent({ eventProbe: true }).eventProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zoneEvent({ enabled: false });
    return { score: vm.score, tier: vm.tier, gems: vm.gems, activeEventCount: vm.activeEventCount, epScore: ep.score, epCount: ep.count, lut, fp };
  }, EVENT_TILE, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // activeEventCount NO se compara: es el nº AMBIENTAL de POIs activos, contaminado por las inyecciones de PRUEBA que el cliente A acumuló en los 13 checks previos (B es fresco). El SIGNAL determinista per-snapshot — score/tier/gems + eventProbe(score,count) + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #72/#73/#74).
  const conv = A.score === B.score && A.tier === B.tier && A.gems === B.gems && A.epScore === B.epScore && A.epCount === B.epCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO POI de evento+héroe ⇒ score/tier/gems + eventProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; activeEventCount ambiental excluido — contaminado por inyecciones de prueba de A)",
     conv, `A={score:${A.score},tier:${A.tier},gems:${A.gems},count:${A.activeEventCount},epScore:${A.epScore},epCount:${A.epCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},gems:${B.gems},count:${B.activeEventCount},epScore:${B.epScore},epCount:${B.epCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.zoneEvent({ enabled: false }));
  await pageB.evaluate(() => window.__dev.zoneEvent({ enabled: false }));

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
