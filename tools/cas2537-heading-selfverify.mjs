// CAS-2537 — self-verify for REMATE DE EMBESTIDA (DARK, HEADING_SURGE.enabled:false). EVO mecánica #90 (serializa tras #89 INTERRUPT_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 31 LIVE #59-#89.
// (A) EJE FRESCO = RUMBO/HEADING DEL MOB relativo al héroe al instante del remate (dirección de MOVIMIENTO/INTENCIÓN del mob respecto al héroe: cargando de frente vs lateral/interceptando vs huyendo/ocioso). server-auth, MMORPG-native (rematar al agresor que se te viene encima).
//     PRE-FLIGHT GATE PASA: EXISTE una dirección de MOVIMIENTO/INTENCIÓN server-auth DETERMINISTA por mob, derivada de la MISMA rama de IA de updateEnemies que aplica el moveEnt (NO e.vx/e.vy — INERTES para enemigos, riesgo #88): chase & NO-kite & d>range ⇒ CIERRA hacia el héroe (sim.js:8036), chase caster/summoner/healer con d<kite ⇒ KITEA alejándose (8028), flee ⇒ alejándose, idle/wander ⇒ deriva (e.wx/e.wy sembrado por rr() determinista), windup/strike/recover/shield ⇒ ESTACIONARIO (sin moveEnt). DINÁMICO, paso-fijo dt (NO wall-clock, NO interp de cliente), y NINGUNA de las 31 flags #59-#89 lo lee como eje de SCORE.
//     headingWeight(e)=signo del producto punto m·u entre la intención-de-paso del mob (m) y hero→mob (u): dot≤chargeCos(−0.5) ⇒ cargando de frente ⇒ 2; dot≥fleeCos(0.5) ⇒ huyendo ⇒ 0; entre ambos ⇒ lateral/interceptando ⇒ 1; sin intención (estacionario) ⇒ 0. El score del kill = headingWeight(víctima) muestreado en el TOP de killEnemy con el rumbo VIVO del mob (_headingPre). La señal VIVA del badge = headingScore(hero)=MAX headingWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate/#89 interrupt).
//     CRUX ⊥ #89 INTERRUPT: #89 puntúa la ACCIÓN comprometida (categoría de e.state windup/strike/shield); heading puntúa la DIRECCIÓN de MOVIMIENTO (GEOMETRÍA del paso). NO es un re-mapeo de los mismos buckets: DENTRO del ÚNICO estado `chase`, heading vale 2 (orco cerrando d>range) O 0 (mago kiteando caster+d<kite) según ARQUETIPO+GEOMETRÍA — MISMO e.state, heading OPUESTO, mientras INTERRUPT colapsa TODO chase a 0; y un mob mid-windup tiene INTERRUPT≥1 pero heading=0 (plantado) ⇒ DISJUNTOS.
//     ⊥ backstab/facing (heading = dirección de TRASLACIÓN del mob; facing = ORIENTACIÓN/ángulo — un mob puede HUIR mientras el héroe lo golpea de frente). ⊥ #88 (remate = DISTANCIA MAGNITUD |hero-mob| sin dirección — un mob a 160px cargando=2, otro a 160px huyendo=0, MISMA magnitud, DIVERGEN). ⊥ #87 (manada=clustering mob↔mob), ⊥ #86 (siega=FRACCIÓN DE VIDA), ⊥ #85 (control=e.stun/e.slowT), ⊥ #84 (escaramuza=CLASE DE ALCANCE ESTÁTICA e.tpl.ranged), ⊥ #78 (furia=BOOLEANO e.enraged), ⊥ #73 (apex=DISTANCIA a jefe), ⊥ CADENCE #67/FRENZY (racha/tempo), NO velocidad(|v|, e.vx/e.vy INERTES)/sigilo/terreno/clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = headingFind (fichas de embestida por rematar a un mob que CARGA — NINGUNA de las 31 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…reachFind #88, interruptFind #89) está LLENA ⇒ pivota a una moneda FRESCA (h.headingBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio headingBountyCap, 0 doble-dip.
//
// ★ HEADING-crux ⊥#89 (check 8): MISMO e.state `chase`, un orco CARGANDO (d>range) ⇒ heading 2 / interrupt 0; un mago KITEANDO (caster, d<kite) ⇒ heading 0 / interrupt 0 (MISMO estado, heading OPUESTO ⇒ heading NO es re-mapeo de e.state). Y un mob mid-WINDUP ⇒ heading 0 / interrupt 1 (interrupt≥1 donde heading=0 ⇒ DISJUNTOS).
// ★ REAL SERVER-AUTH (check 7): spawnHead empuja un mob REAL al MISMO G.enemies y le fija un RUMBO; headProbe lee el rumbo REAL (state,dot,weight) ⇒ charge⇒2/lateral⇒1/kite⇒0/flee⇒0/stop⇒0 leídos de los MISMOS campos que updateEnemies escribe.
// ★ ⊥#88 DISTANCE-crux (check 9b, dentro de 9): un mob CARGANDO y un mob HUYENDO a la MISMA distancia (160px) ⇒ heading 2 vs 0 MIENTRAS reachWeight(#88 remate) es IGUAL para ambos (misma magnitud) ⇒ heading = DIRECCIÓN no MAGNITUD.
// ★ DIFERENCIADOR/⊥ (check 9): un orco MELEE SANO SUELTO NO-CC'd CARGANDO ⇒ heading T2 MIENTRAS escaramuza(#84)/manada(#87)/siega(#86)/control(#85)/interrupt(#89) lo IGNORAN (melee/suelto/sano/sin-CC/chase ⇒ sus probes 0), pese a estar in-radio.
// ★ CANAL (check 10): forageChargePreview = headingBonus(score). Mob cargando ⇒ charge>0; huyendo / sin mob ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(headingBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con HEADING_SURGE OFF, headingBonus(cualquier score)==0 y forageChargePreview==0 aun con un mob cargando ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): heading (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de heading.
// ★ 0-REGRESIÓN (check 14): las 31 mecánicas del arco #59-#89 siguen served enabled:true; HEADING_SURGE served false (DARK #90).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob cargando en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/charge + headProbe + LUT scoreProbe + geomProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). headingScore es función PURA de G.enemies+estado+posiciones ⇒ shard-consistente.
//
// Observado vía __dev.heading (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + geomProbe path-de-rumbo WORLD-INDEPENDIENTE + spawnHead inyección REAL con rumbo forzado + clearHead + headProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Embestida:").
//
// Run: node tools/cas2537-heading-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2537");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// path RUMBO→producto-punto→peso→forage (geomProbe, héroe FAKE en (0,0), mob en (dx,dy)):
//   chase lejos (d>range) ⇒ cargando ⇒ w2; flee/kite ⇒ huyendo ⇒ w0; wander ⊥ ⇒ lateral ⇒ w1; windup/chase-en-rango/sin-vector ⇒ estacionario ⇒ w0.
const EXPECT_GEOM = [
  { state: "chase", dx: 200, dy: 0, range: 40, w: 2, f: 2 },                        // cargando de frente ⇒ 2
  { state: "chase", dx: 100, dy: 100, range: 40, w: 2, f: 2 },                      // cargando diagonal ⇒ 2
  { state: "flee", dx: 200, dy: 0, w: 0, f: 0 },                                    // huyendo ⇒ 0
  { state: "chase", dx: 100, dy: 0, arch: "caster", kite: 300, range: 600, w: 0, f: 0 }, // caster kiteando (d<kite) ⇒ alejándose ⇒ 0
  { state: "wander", dx: 200, dy: 0, wx: 0, wy: 1, w: 1, f: 1 },                    // wander ⊥ ⇒ lateral ⇒ 1
  { state: "windup", dx: 200, dy: 0, w: 0, f: 0 },                                  // comprometido/estacionario ⇒ 0
  { state: "chase", dx: 30, dy: 0, range: 40, w: 0, f: 0 },                         // chase en rango (d<=range) ⇒ compromete, estacionario ⇒ 0
  { state: "idle", dx: 200, dy: 0, wx: 0, wy: 0, w: 0, f: 0 },                      // idle sin vector de wander ⇒ estacionario ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.heading + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.heading());
  ok("2 byte-id OFF (fresh boot): HEADING_SURGE.enabled false AND G.headingBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "headingFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" weights=${JSON.stringify(dark.weights)} chargeCos=${dark.chargeCos} fleeCos=${dark.fleeCos}`);

  // 3 save OFF has no headingFind/headingBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(headingFind|headingBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"headingBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'headingFind'/'headingBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.heading({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.heading({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.heading({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 geomProbe: RUMBO→producto-punto→peso→forage (WORLD-INDEPENDIENTE, el path exacto que el seam usa con _headingPre)
  const gm = await page.evaluate((cases) => { window.__dev.heading({ enabled: true }); const out = cases.map(c => window.__dev.heading({ geomProbe: c }).geomProbe); window.__dev.heading({ enabled: false }); return out; }, EXPECT_GEOM);
  const gmOK = EXPECT_GEOM.every((c, i) => gm[i] && gm[i].weight === c.w && gm[i].forage === c.f);
  ok("6 geomProbe RUMBO→peso→forage (WORLD-INDEP): chase-lejos⇒w2; flee/kite⇒w0; wander⊥⇒w1; windup/chase-en-rango/sin-vector⇒w0",
     gmOK, JSON.stringify(gm.map(x => ({ s: x.state, dx: x.dx, dy: x.dy, mv: x.moving, dot: x.dot, w: x.weight, f: x.forage }))));

  // 7 ★ REAL SERVER-AUTH: spawnHead pushes a real mob to G.enemies with a forced HEADING; headProbe reads the REAL heading field. charge⇒2, lateral⇒1, kite/flee/stop⇒0.
  const server7 = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero;
    window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    const out = {};
    for (const kind of ["charge", "lateral", "kite", "flee", "stop"]) {
      window.__dev.heading({ clearHead: true });
      const sh = window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind } }).spawnHead;
      const hp = window.__dev.heading({ headProbe: true }).headProbe;
      out[kind] = { shW: sh.weight, shState: sh.state, shArch: sh.arch, shDot: sh.dot, hpScore: hp.score, hpW: hp.mobs[0] ? hp.mobs[0].weight : -1 };
    }
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ enabled: false });
    return out;
  });
  const s7OK = server7.charge.shW === 2 && server7.charge.hpScore === 2 && server7.charge.shState === "chase" &&
    server7.lateral.shW === 1 && server7.lateral.hpScore === 1 && server7.lateral.shState === "wander" &&
    server7.kite.shW === 0 && server7.kite.hpScore === 0 && server7.kite.shState === "chase" &&
    server7.flee.shW === 0 && server7.flee.hpScore === 0 && server7.flee.shState === "flee" &&
    server7.stop.shW === 0 && server7.stop.hpScore === 0;
  ok("7 ★ REAL SERVER-AUTH: spawnHead empuja un mob REAL con RUMBO forzado; headProbe lee el rumbo REAL ⇒ charge⇒2, lateral⇒1, kite/flee/stop⇒0",
     s7OK, JSON.stringify(server7));

  // 8 ★ HEADING-crux ⊥#89 INTERRUPT: MISMO e.state chase — orco CARGANDO ⇒ heading 2/interrupt 0; mago KITEANDO ⇒ heading 0/interrupt 0 (heading NO es re-mapeo de e.state). Y mob mid-windup ⇒ heading 0/interrupt 1 (DISJUNTOS).
  const crux = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h0 = window.__dev.heading().hero;
    const RX = h0.tx - 100, RY = h0.ty;
    window.__dev.heading({ tp: { tx: RX, ty: RY } });
    // (a) chase CARGANDO ⇒ heading 2 / interrupt 0
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } });
    const aHead = window.__dev.heading({ headProbe: true }).headProbe;
    const aInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    // (b) chase KITEANDO (caster, d<kite) ⇒ heading 0 / interrupt 0 — MISMO e.state chase, heading OPUESTO
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "kite" } });
    const bHead = window.__dev.heading({ headProbe: true }).headProbe;
    const bInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    // (c) mid-windup ⇒ heading 0 / interrupt 1 — interrupt≥1 donde heading=0
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "stop" } });
    const cHead = window.__dev.heading({ headProbe: true }).headProbe;
    const cInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ enabled: false });
    return { aHeadState: aHead.mobs[0] ? aHead.mobs[0].state : "", aHeadW: aHead.score, aInt,
      bHeadState: bHead.mobs[0] ? bHead.mobs[0].state : "", bHeadW: bHead.score, bInt,
      cHeadW: cHead.score, cInt };
  });
  const cruxOK = crux.aHeadState === "chase" && crux.aHeadW === 2 && crux.aInt === 0 &&
    crux.bHeadState === "chase" && crux.bHeadW === 0 && crux.bInt === 0 &&
    crux.cHeadW === 0 && crux.cInt === 1;
  ok("8 ★ HEADING-crux ⊥#89: MISMO e.state chase — CARGANDO⇒heading2/interrupt0, KITEANDO⇒heading0/interrupt0 (heading OPUESTO en MISMO estado); mid-windup⇒heading0/interrupt1 (DISJUNTOS)",
     cruxOK, JSON.stringify(crux));

  // 9 ★ DIFFERENTIATOR/⊥ vs skirmish(#84)/pack(#87)/blood(#86)/control(#85)/interrupt(#89): orco MELEE SANO SUELTO NO-CC'd CARGANDO ⇒ heading T2 MIENTRAS peers IGNORAN. + ⊥#88 DISTANCE-crux: charge vs flee a MISMA distancia ⇒ heading diverge / reach IGUAL.
  const diff = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h0 = window.__dev.heading().hero;
    const RX = h0.tx - 90, RY = h0.ty;
    window.__dev.heading({ tp: { tx: RX, ty: RY } });
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intBefore = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    // orco MELEE SANO SUELTO NO-CC'd CARGANDO (chase, d>range) a 160px: in-radio de todos los peers, pero melee/suelto/sano/sin-CC/chase ⇒ peers 0
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } });
    const vm = window.__dev.heading();
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intAfter = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    // reachWeight (#88) para el MISMO mob cargando @160px
    const reachCharge = window.__dev.longshot({ reachProbe: true }).reachProbe.score;
    window.__dev.heading({ clearHead: true });
    // ⊥#88 DISTANCE-crux: MISMO mob a la MISMA distancia pero HUYENDO ⇒ heading 0 / reach IGUAL
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "flee" } });
    const headFlee = window.__dev.heading().score;
    const reachFlee = window.__dev.longshot({ reachProbe: true }).reachProbe.score;
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter, intBefore, intAfter,
      reachCharge, headFlee, reachFlee };
  });
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&                        // heading fires (mob cargando)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                        // ★ escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore && diff.intAfter === diff.intBefore && // siega #86 / control #85 / interrupt #89 IGNORAN
    diff.headFlee === 0 && diff.reachCharge === diff.reachFlee;                                    // ★ ⊥#88: heading diverge (2→0) pero reach IGUAL (misma magnitud)
  ok("9 ★ DIFERENCIADOR/⊥: orco MELEE SANO SUELTO NO-CC'd CARGANDO ⇒ heading T2 MIENTRAS escaramuza/manada/siega/control/interrupt IGNORAN; +⊥#88 charge vs flee @MISMA dist ⇒ heading 2→0 pero reach IGUAL",
     diffOK, JSON.stringify(diff));

  // 10 CANAL headingFind: forageChargePreview mob cargando>0 ; huyendo/no mob → 0
  const forage = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero;
    window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } });   // cargando ⇒ score 2 ⇒ T2
    const actVm = window.__dev.heading();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "flee" } });      // huyendo ⇒ score 0
    const fleeVm = window.__dev.heading();
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ enabled: false });
    return { actPrev, actCharge, fleePrev: fleeVm.forageChargePreview, fleeTier: fleeVm.tier, fleeScore: fleeVm.score };
  });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.fleePrev === 0 && forage.fleeTier === 0 && forage.fleeScore === 0;
  ok("10 CANAL headingFind: forageChargePreview con mob cargando ⇒ charge>0 (==headingBonus); mob huyendo ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds headingBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.heading({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.heading().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>headingBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a charging mob available
  const neutral = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero;
    window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } });   // mob cargando disponible
    window.__dev.heading({ enabled: false });                             // now OFF
    const off = window.__dev.heading();
    window.__dev.heading({ enabled: true }); window.__dev.heading({ clearHead: true }); window.__dev.heading({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, headingBonus(mob cargando)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip heading OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de heading.
  const orth = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero;
    window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } });
    window.__dev.heading({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), itr: window.__dev.interrupt(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.heading({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.heading();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.heading();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("13 ★ ORTOGONALIDAD headingFind ⊥ peers: flip heading OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/longshot/interrupt/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de heading; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 31 arc flags served true; HEADING_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const hgDark = flag("HEADING_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 31 mecanismos del arco #59-#89 served enabled:true; HEADING_SURGE served false (DARK #90)",
     arcAllOn && hgDark && arc.length === 31, `heading=${flag("HEADING_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Embestida:" drawn ON+charging mob / not OFF + fps.
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Embestida:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero;
    window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } });   // cargando ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("15 render badge \"Embestida:\" se DIBUJA ON+mob cargando (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.heading({ enabled: true }); window.__dev.heading({ clearHead: true }); const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.heading({ clearHead: true }); window.__dev.heading({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const HERO_TILE = { tx: 53, ty: 40 };
  const readVM = async (pg) => await pg.evaluate((HT) => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ tp: { tx: HT.tx, ty: HT.ty } });
    window.__dev.heading({ spawnHead: { dx: 160, dy: 0, kind: "charge" } });
    const vm = window.__dev.heading();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.heading({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const gp = window.__dev.heading({ geomProbe: { state: "chase", dx: 200, dy: 0, range: 40 } }).geomProbe;
    const hp = window.__dev.heading({ headProbe: true }).headProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.heading({ clearHead: true });
    window.__dev.heading({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, hpScore: hp.score, hpCount: hp.count, hpW: hp.mobs[0] ? hp.mobs[0].weight : -1, hpState: hp.mobs[0] ? hp.mobs[0].state : "", gpW: gp.weight, gpDot: gp.dot, lut, fp };
  }, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.hpScore === B.hpScore && A.hpCount === B.hpCount && A.hpW === B.hpW && A.hpState === B.hpState && A.gpW === B.gpW && A.gpDot === B.gpDot && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO mob cargando+héroe ⇒ score/tier/charge + headProbe(score,count,weight,state) + geomProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},hpScore:${A.hpScore},hpCount:${A.hpCount},hpW:${A.hpW},hpState:${A.hpState},gpW:${A.gpW},gpDot:${A.gpDot},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},hpScore:${B.hpScore},hpCount:${B.hpCount},hpW:${B.hpW},hpState:${B.hpState},gpW:${B.gpW},gpDot:${B.gpDot},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.heading({ enabled: false }));
  await pageB.evaluate(() => window.__dev.heading({ enabled: false }));

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
