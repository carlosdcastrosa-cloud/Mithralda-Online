// CAS-2527 — self-verify for REMATE A DISTANCIA (DARK, LONGSHOT_SURGE.enabled:false). EVO mecánica #88 (serializa tras #87 PACKHARVEST_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 29 LIVE #59-#87.
// (A) EJE FRESCO = DISTANCIA/RANGO DEL GOLPE DE REMATE (snapshot GEOMÉTRICO hero↔víctima en el instante del kill: melee-finish de cerca vs sniper-finish de lejos) — server-auth, MMORPG-native (posicionamiento de DPS a distancia).
//     PRE-FLIGHT GATE: el eje RECOMENDADO del issue (SWIFTNESS/VELOCIDAD del mob rematado, |v| de e.vx/e.vy) FALLA — los enemigos NO tienen VECTOR de velocidad server-auth: e.vx/e.vy existen en la entidad pero son INERTES para enemigos (documentado sim.js:8543 "e.vx/e.vy NO se integra en el movimiento enemigo"; el mov. enemigo = dir-de-persecución × ESCALAR e.tpl.spd + integración de knockX/knockY). La ÚNICA señal de rapidez es el ESCALAR ESTÁTICO del template e.tpl.spd, cuyos ÚNICOS modificadores DINÁMICOS son enrage (#78 FURIA — e.enrageSpd hornea a e.tpl.spd sim.js:7892) y slow (#85 CONTROL — e.slowT sim.js:7919) ⇒ "mob veloz" = enfurecido (#78) O no-ralentizado (#85) ⇒ AMBOS extremos del eje de velocidad YA son ejes reclamados ⇒ NO ⊥29 ⇒ NO lo forcé; PIVOTE justificado al alterno FRESCO #1 del board: DISTANCIA/RANGO del golpe de remate.
//     reachWeight(dist)=peso por la DISTANCIA (px) hero↔víctima: far(≥farR 210)⇒2 (sniper), near(≥midR 110,<farR)⇒1 (stand-off), point-blank(<midR)⇒0 (melee). El score del kill = reachWeight(dist víctima) muestreado en el TOP de killEnemy con la posición VIVA del mob (_reachPre). La señal VIVA del badge = longshotScore(hero)=MAX reachWeight sobre los mobs VIVOS en radio (el mejor long-shot DISPONIBLE). PURO, 0-RNG, 0-timer, STATELESS. La distancia = relación GEOMÉTRICA hero↔víctima de POSICIONES replicadas de G.hero + el mob.
//     ⊥ #87 (manada = DISTANCIA mob↔mob [clustering INTER-mob]; remate = DISTANCIA hero↔víctima ÚNICA [geometría del héroe al kill]), ⊥ #86 (siega = FRACCIÓN DE VIDA e.hp/e.maxHp), ⊥ #85 (control = ESTADO CC e.stun/e.slowT), ⊥ #84 (escaramuza = CLASE DE ALCANCE del MOB e.tpl.ranged [stat ESTÁTICO del ENEMIGO] vs GEOMETRÍA hero↔víctima del remate [posición del HÉROE] — melee-hero rematando de cerca a un arquero = alta escaramuza/cero remate; ranged-hero abatiendo de lejos a un orco melee suelto = cero escaramuza/alto remate, DIVERGEN), ⊥ #83 (plaga = DoT e.dots), ⊥ #82 (vorágine = ZONAS G.fields), ⊥ #81 (fragor = PROYECTILES G.projectiles), ⊥ #80 (carnicería = CUERPOS MUERTOS G.corpses), ⊥ #79 (botín = OBJETOS G.drops), ⊥ #78 (furia = BOOLEANO e.enraged), ⊥ #77 (hazard = G.hazards), ⊥ #76 (variante = e.variant), ⊥ #74 (afijo = e.affix), ⊥ #73 (apex = DISTANCIA hero→un JEFE/CAMPEÓN vivo [blanco ESPECIAL, premia CERCANÍA, estado PERSISTENTE de pie] vs DISTANCIA hero→la VÍCTIMA REAL cualquiera en el INSTANTE del kill [premia LEJANÍA], conjunto-blanco/signo/timing distintos), ⊥ #72 (escasez = AUSENCIA/CONTEO crudo), ⊥ #69 (LAST_STAND = CONTEO de ENGANCHADOS en melee [todos de cerca] — el remate premia lo OPUESTO: abatir DE LEJOS), ⊥ CADENCE #67/FRENZY (racha/tempo), ⊥ lootQuality #63/#68, NO velocidad (recomendado, falló pre-flight), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = reachFind (recompensa de fichas de puntería por rematar DE LEJOS — NINGUNA de las 29 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind…bloodFind #86, packFind #87) está LLENA ⇒ pivota a una moneda FRESCA (h.reachBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio reachBountyCap, 0 doble-dip.
//
// ★ DISTANCE-crux (check 8, ⊥#84/#73): el MISMO mob (stats idénticos) a distancia FAR (≥farR) ⇒ score 2/T2; el MISMO mob POINT-BLANK (<midR) ⇒ score 0/T0. Prueba que el eje es la GEOMETRÍA hero↔víctima, NO los stats del mob (⊥ escaramuza #84 que lee e.tpl.ranged; ⊥ apex #73 que premia CERCANÍA a un jefe).
// ★ DIFERENCIADOR/⊥ (check 9): un orco MELEE SANO SUELTO a distancia FAR ⇒ remate T2 MIENTRAS escaramuza(#84)/manada(#87)/siega(#86)/control(#85) lo IGNORAN (orco melee/sano/suelto/sin-CC ⇒ sus probes 0), pese a estar DENTRO del radio 260 de los peers.
// ★ REAL SERVER-AUTH (check 7): spawnShot empuja un mob REAL al MISMO G.enemies; reachProbe lee la DISTANCIA REAL hero↔mob (x,y,dist,weight) ⇒ estado server-auth auténtico. Mob a ≥farR ⇒ peso 2 ⇒ score 2.
// ★ CANAL (check 10): forageChargePreview = longshotBonus(score). Long-shot disponible ⇒ charge>0; point-blank / sin mob ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(reachBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con LONGSHOT_SURGE OFF, longshotBonus(cualquier score)==0 y forageChargePreview==0 aun con un mob FAR ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): el remate (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de remate.
// ★ 0-REGRESIÓN (check 14): las 29 mecánicas del arco #59-#87 siguen served enabled:true; LONGSHOT_SURGE served false (DARK #88).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob FAR en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/charge + reachProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). longshotScore es función PURA de G.enemies+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.longshot (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + distProbe path-de-distancia + spawnShot inyección REAL + clearShot + reachProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Remate:"). Los mobs inyectados de PRUEBA son estacionarios (spd:0) ⇒ no se mueven ⇒ 0 efecto de sim en las lecturas.
//
// Run: node tools/cas2527-longshot-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2527");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// path DISTANCIA→peso→forage: 0→w0/f0, 110(midR)→w1/f1, 209→w1/f1, 210(farR)→w2/f2, 300→w2/f2
const EXPECT_DIST = [
  { dist: 0, w: 0, f: 0 }, { dist: 110, w: 1, f: 1 }, { dist: 209, w: 1, f: 1 },
  { dist: 210, w: 2, f: 2 }, { dist: 300, w: 2, f: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.blightHarvest && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.longshot + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.longshot());
  ok("2 byte-id OFF (fresh boot): LONGSHOT_SURGE.enabled false AND G.reachBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "reachFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" farR=${dark.farR} midR=${dark.midR}`);

  // 3 save OFF has no reachFind/reachBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(reachFind|reachBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"reachBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'reachFind'/'reachBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.longshot({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.longshot({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.longshot({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 distProbe: DISTANCIA→peso→forage (el path exacto que el seam usa con _reachPre)
  const dist = await page.evaluate((cases) => { window.__dev.longshot({ enabled: true }); const out = cases.map(c => window.__dev.longshot({ distProbe: { dist: c.dist } }).distProbe); window.__dev.longshot({ enabled: false }); return out; }, EXPECT_DIST);
  const distOK = EXPECT_DIST.every((c, i) => dist[i] && dist[i].weight === c.w && dist[i].forage === c.f);
  ok("6 distProbe DISTANCIA→peso→forage: 0→w0/f0, 110(midR)→w1/f1, 209→w1/f1, 210(farR)→w2/f2, 300→w2/f2",
     distOK, JSON.stringify(dist));

  // 7 ★ REAL SERVER-AUTH: spawnShot pushes a real mob FAR to G.enemies; reachProbe reads real distance. mob @ +7 tiles (224px ≥ farR 210) ⇒ weight 2 ⇒ score 2.
  const server7 = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    const h = window.__dev.longshot().hero;
    window.__dev.longshot({ tp: { tx: h.tx, ty: h.ty } });
    const shot = window.__dev.longshot({ spawnShot: { tx: h.tx + 7, ty: h.ty } }).spawnShot;   // 224px ≥ farR ⇒ peso 2
    const rp = window.__dev.longshot({ reachProbe: true }).reachProbe;
    const vm = window.__dev.longshot();
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { shot, rp, tier: vm.tier, score: vm.score };
  });
  const s7OK = server7.shot && server7.shot.dist >= 210 && server7.shot.weight === 2 &&
    server7.rp && server7.rp.score === 2 && server7.rp.count === 1 && server7.rp.mobs[0] && server7.rp.mobs[0].weight === 2 && server7.rp.mobs[0].dist >= 210 &&
    server7.tier === 2 && server7.score === 2;
  ok("7 ★ REAL SERVER-AUTH: spawnShot empuja un mob REAL FAR (≥farR) a G.enemies; reachProbe lee la DISTANCIA REAL ⇒ peso 2 ⇒ score 2 ⇒ T2",
     s7OK, JSON.stringify(server7));

  // 8 ★ DISTANCE-crux (⊥#84 escaramuza / ⊥#73 apex): el MISMO mob (stats idénticos) FAR ⇒ score 2/T2; POINT-BLANK ⇒ score 0/T0. Es la GEOMETRÍA, no los stats del mob.
  const crux = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    const h0 = window.__dev.longshot().hero;
    const RX = h0.tx - 120, RY = h0.ty;                                     // tile remoto fresco
    // MISMO mob en tile absoluto fijo; movemos SÓLO al héroe (mob stats intactos)
    window.__dev.longshot({ tp: { tx: RX, ty: RY } });
    window.__dev.longshot({ spawnShot: { tx: RX + 7, ty: RY } });          // mob a +7 tiles del tile RX
    // héroe LEJOS del mob (en RX ⇒ 224px ≥ farR) ⇒ FAR
    const farVm = window.__dev.longshot();
    const farProbe = window.__dev.longshot({ reachProbe: true }).reachProbe;
    // héroe PEGADO al mob (tp a RX+7 ⇒ dist 0 < midR) ⇒ POINT-BLANK — MISMO mob
    window.__dev.longshot({ tp: { tx: RX + 7, ty: RY } });
    const pbVm = window.__dev.longshot();
    const pbProbe = window.__dev.longshot({ reachProbe: true }).reachProbe;
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { farScore: farVm.score, farTier: farVm.tier, farProbeW: farProbe.mobs[0] ? farProbe.mobs[0].weight : -1,
      pbScore: pbVm.score, pbTier: pbVm.tier, pbProbeW: pbProbe.mobs[0] ? pbProbe.mobs[0].weight : -1 };
  });
  const cruxOK = crux.farScore === 2 && crux.farTier === 2 && crux.farProbeW === 2 &&
    crux.pbScore === 0 && crux.pbTier === 0 && crux.pbProbeW === 0;
  ok("8 ★ DISTANCE-crux ⊥#84/#73: el MISMO mob FAR (≥farR) ⇒ score 2/T2; el MISMO mob POINT-BLANK (<midR) ⇒ score 0/T0 (GEOMETRÍA hero↔víctima, no stats del mob)",
     cruxOK, JSON.stringify(crux));

  // 9 ★ DIFFERENTIATOR/⊥ vs skirmish(#84)/pack(#87)/blood(#86)/control(#85): un orco MELEE SANO SUELTO FAR (in-radio 260 de los peers) ⇒ remate T2 MIENTRAS los peers lo IGNORAN.
  const diff = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    const h0 = window.__dev.longshot().hero;
    const RX = h0.tx - 90, RY = h0.ty;                                      // tile remoto fresco
    window.__dev.longshot({ tp: { tx: RX, ty: RY } });
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    // orco MELEE SANO SUELTO a +7 tiles (224px): ≥farR 210 (remate 2) Y ≤ radio 260 (los peers LO VEN pero score 0)
    window.__dev.longshot({ spawnShot: { tx: RX + 7, ty: RY } });
    const vm = window.__dev.longshot();
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;   // orco = MELEE ⇒ escaramuza IGNORA
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;   // mob SUELTO (0 vecinos) ⇒ manada IGNORA
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;   // orco SANO ⇒ siega IGNORA
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;   // NO CC ⇒ control IGNORA
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter };
  });
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&                        // remate fires (mob FAR)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                        // ★ escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore;                          // siega #86 / control #85 IGNORAN
  ok("9 ★ DIFERENCIADOR/⊥: un orco MELEE SANO SUELTO FAR ⇒ remate a T2 MIENTRAS escaramuza(#84)/manada(#87)/siega(#86)/control(#85) IGNORAN (in-radio 260, pero melee/suelto/sano/sin-CC ⇒ 0)",
     diffOK, JSON.stringify(diff));

  // 10 CANAL reachFind: forageChargePreview far>0 ; point-blank/no mob → 0
  const forage = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    const h = window.__dev.longshot().hero;
    window.__dev.longshot({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.longshot({ spawnShot: { tx: h.tx + 7, ty: h.ty } });       // FAR ⇒ score 2 ⇒ T2
    const nearVm = window.__dev.longshot();
    const farPrev = nearVm.forageChargePreview, farCharge = nearVm.charge;
    window.__dev.longshot({ tp: { tx: h.tx + 7, ty: h.ty } });              // héroe PEGADO al mob ⇒ score 0
    const pbVm = window.__dev.longshot();
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { farPrev, farCharge, pbPrev: pbVm.forageChargePreview, pbTier: pbVm.tier, pbScore: pbVm.score };
  });
  const forageOK = forage.farPrev > 0 && forage.farPrev === forage.farCharge && forage.pbPrev === 0 && forage.pbTier === 0 && forage.pbScore === 0;
  ok("10 CANAL reachFind: forageChargePreview con long-shot disponible ⇒ charge>0 (==longshotBonus); héroe pegado al mob (point-blank) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds reachBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.longshot({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.longshot().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>reachBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a FAR mob available
  const neutral = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    const h = window.__dev.longshot().hero;
    window.__dev.longshot({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.longshot({ spawnShot: { tx: h.tx + 7, ty: h.ty } });       // mob FAR disponible
    window.__dev.longshot({ enabled: false });                             // now OFF
    const off = window.__dev.longshot();
    window.__dev.longshot({ enabled: true }); window.__dev.longshot({ clearShot: true }); window.__dev.longshot({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, longshotBonus(mob FAR)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip longshot OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de remate.
  const orth = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    const h = window.__dev.longshot().hero;
    window.__dev.longshot({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.longshot({ spawnShot: { tx: h.tx + 7, ty: h.ty } });
    window.__dev.longshot({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();                                             // LONGSHOT OFF (misma posición)
    window.__dev.longshot({ enabled: true });
    const peersOn = snap();                                              // LONGSHOT ON — los peers NO deben cambiar
    const beforeArc = window.__dev.longshot();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.longshot();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });                              // restaura estado LIVE
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("13 ★ ORTOGONALIDAD reachFind ⊥ peers: flip remate OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de remate; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 29 arc flags served true; LONGSHOT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const lsDark = flag("LONGSHOT_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 29 mecanismos del arco #59-#87 served enabled:true; LONGSHOT_SURGE served false (DARK #88)",
     arcAllOn && lsDark && arc.length === 29, `longshot=${flag("LONGSHOT_SURGE")} arc=${JSON.stringify(arcLive)}`);

  // 15 render badge "Remate:" drawn ON+far mob / not OFF + fps. Mobs de prueba estacionarios (spd:0).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Remate:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    const h = window.__dev.longshot().hero;
    window.__dev.longshot({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.longshot({ spawnShot: { tx: h.tx + 7, ty: h.ty } });       // FAR ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("15 render badge \"Remate:\" se DIBUJA ON+long-shot disponible (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.longshot({ enabled: true }); window.__dev.longshot({ clearShot: true }); const h = window.__dev.longshot().hero; window.__dev.longshot({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.longshot({ spawnShot: { tx: h.tx + 7, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.longshot({ clearShot: true }); window.__dev.longshot({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence: SAME far mob at SAME tile + hero at SAME tile ⇒ score/tier/charge + reachProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles: mob @ (60,40), hero @ (53,40) ⇒ 7 tiles = 224px ≥ farR 210 ⇒ weight 2 ⇒ score 2/T2.
  const MOB = { tx: 60, ty: 40 }, HERO_TILE = { tx: 53, ty: 40 };
  const readVM = async (pg) => await pg.evaluate((M, HT) => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: HT.tx, ty: HT.ty } });
    window.__dev.longshot({ spawnShot: { tx: M.tx, ty: M.ty } });
    const vm = window.__dev.longshot();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.longshot({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });   // LUT PURA
    const rp = window.__dev.longshot({ reachProbe: true }).reachProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, rpScore: rp.score, rpCount: rp.count, rpDist: rp.mobs[0] ? rp.mobs[0].dist : -1, lut, fp };
  }, MOB, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.rpScore === B.rpScore && A.rpCount === B.rpCount && A.rpDist === B.rpDist && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO mob FAR+héroe ⇒ score/tier/charge + reachProbe(score,count,dist) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},rpScore:${A.rpScore},rpCount:${A.rpCount},rpDist:${A.rpDist},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},rpScore:${B.rpScore},rpCount:${B.rpCount},rpDist:${B.rpDist},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.longshot({ enabled: false }));
  await pageB.evaluate(() => window.__dev.longshot({ enabled: false }));

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
