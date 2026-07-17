// CAS-2546 — self-verify for REMATE DE MOLE (DARK, BULK_SURGE.enabled:false). EVO mecánica #92 (serializa tras #91 ZONETIER_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 33 LIVE #59-#91.
// (A) EJE FRESCO = BANDA DE TAMAÑO/HITBOX FÍSICO del mob TYPE server-auth (la MOLE intrínseca de la criatura: un orco/alce corpulento vs una rata/murciélago menudo). server-auth, MMORPG-native (recompensar despachar a la bestia voluminosa, no a la alimaña menuda).
//     PRE-FLIGHT GATE (recomendado = CHALLENGE-RATING mobLvl−heroLvl) → FALLA: NO existe nivel entero determinista propio del mob — ETPL (config.js:288) NO tiene campo `lvl` en ninguna fila (sólo hp/dmg/spd/xp/size/range); spawnEnemy (sim.js:2258) NO estampa e.lvl ni nivel efectivo horneado; el único `lvl` server-auth es hero.lvl ⇒ mobLvl−heroLvl NO computable ⇒ PIVOTE al alterno FRESCO sancionado #2 del board: BANDA DE TAMAÑO/HITBOX.
//     PRE-FLIGHT del alterno TAMAÑO → PASA: `.size` es ESCALAR ENTERO DETERMINISTA por template (rat15/bat14/volatile16 · wolf18/skeleton20/mage21/orc22 · moose26/charger26 · golem36/dragon50), server-auth (constante de ETPL, replicada del mismo config; NO wall-clock, NO estado de cliente, NO RNG), y NINGUNA de las 33 flags #59-#91 lo lee como SCORE (`.size` sólo colisión/render/knockback/floaters).
//     CLAVE ⊥#74/⊥champion: bulkWeight lee el TAMAÑO BASE INMUTABLE ETPL[e.type].size (la mole del TIPO), NO e.tpl.size — el afijo #74 (A.sizeMul, sim.js:2407) y campeón (C.sizeMul, sim.js:2390) INFLAN el CLON e.tpl.size pero jamás mutan la fila base de ETPL ⇒ mole DESACOPLADA de afijo/campeón por construcción.
//     bulkWeight(e)=banda de bulkOf(e)=ETPL[type].size: sz≥hiSize(24) ⇒ mole grande ⇒ 2; sz≥midSize(18) ⇒ mole media ⇒ 1; sz<midSize (alimaña menuda) ⇒ 0. El score del kill = bulkWeight(víctima) muestreado en el TOP de killEnemy (_bulkPre). La señal VIVA del badge = bulkScore(hero)=MAX bulkWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate/#91 zona).
//     CRUX ⊥33 TAMAÑO FÍSICO ESTÁTICO del TIPO: ⊥ #91 ZONE-TIER (dificultad del ÁREA [terreno]; mole = tamaño del MOB [entidad] — alce sz26⇒mole2 en el PRADO donde zone-tier=0; rata sz15⇒mole0 en el ABISMO donde zone-tier=2, DISJUNTOS; applyZoneScale NUNCA escala size). ⊥ #86 SIEGA (e.hp/e.maxHp DINÁMICO; mole = tamaño ESTÁTICO — alce a plena vida mole2/siega0). ⊥ #74 AFIJO (e.affix; mole lee ETPL[type].size BASE — rata con e.tpl.size inflado a 99 sigue mole0). ⊥ #73 APEX (DISTANCIA a jefe; alce lejos de todo jefe mole2/apex0). ⊥ #76 VARIANTE (e.variant). ⊥ #90/#89/#88/#87/#85/#84/#78 y velocidad.
// (B) CANAL FRESCO = bulkFind (fichas de mole por rematar a un mob voluminoso — NINGUNA de las 33 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…headingFind #90, tierFind #91) está LLENA ⇒ moneda FRESCA (h.bulkBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio bulkBountyCap, 0 doble-dip.
//
// ★ sizeProbe LUT (check 5b): size→weight→tier→charge — prueba los umbrales hiSize=24/midSize=18 (14/15/16/17⇒0, 18/20/22/23⇒1, 24/26/36/50⇒2), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnBulk empuja un mob REAL del TIPO al MISMO G.enemies; bulkProbe lee su peso REAL de ETPL[type].size ⇒ golem/moose⇒2, orc/wolf⇒1, rat/bat/volatile⇒0.
// ★ ⊥#74/⊥champion INFLADO (check 7b): spawnBulk{type:'rat',inflate:99} clona e.tpl y sube e.tpl.size→99 (mimetiza afijo/campeón sizeMul); bulkOf lee ETPL['rat'].size=15 BASE ⇒ weight SIGUE 0 pese a tplSize=99. Prueba el desacople del afijo por construcción.
// ★ ⊥#91 crux (check 8): alce (sz26⇒mole2) en el PRADO (zone-tier 0) ⇒ bulk2/zonetier0; rata (sz15⇒mole0) en el ABISMO (zone-tier 2) ⇒ bulk0/zonetier2. DISJUNTOS (entidad vs terreno).
// ★ DIFERENCIADOR/⊥ peers (check 9): un ALCE (mole grande) MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en el PRADO ⇒ bulk T2 MIENTRAS escaramuza#84/manada#87/siega#86/control#85/interrupt#89/reach#88/embestida#90/zona#91 lo IGNORAN.
// ★ CANAL (check 10): forageChargePreview = bulkBonus(score). Alce (mole grande) ⇒ charge>0; rata / sin mob ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(bulkBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con BULK_SURGE OFF, bulkBonus(cualquier score)==0 y forageChargePreview==0 aun con un alce disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): bulk (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de bulk.
// ★ 0-REGRESIÓN (check 14): las 33 mecánicas del arco #59-#91 siguen served enabled:true; BULK_SURGE served false (DARK #92).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + bulkProbe + sizeProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). bulkScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Observado vía __dev.bulk (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT + sizeProbe LUT + spawnBulk inyección REAL [+inflate ⊥#74] + clearBulk + bulkProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Mole:").
//
// Run: node tools/cas2546-bulk-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2546");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// Tiles REALES por zona (mundo determinista 760×908; el mundo se construye igual del mismo seed ⇒ estas tiles caen SIEMPRE en la misma zona). Reutilizadas del arco.
const Z = { forest: [192, 723], abyss: [192, 768] };
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// sizeProbe esperado: size→weight (umbrales midSize=18/hiSize=24). Cubre los 3 buckets + los bordes.
const EXPECT_SIZE = [
  { size: 14, w: 0 }, { size: 15, w: 0 }, { size: 16, w: 0 }, { size: 17, w: 0 },  // < midSize ⇒ 0
  { size: 18, w: 1 }, { size: 20, w: 1 }, { size: 22, w: 1 }, { size: 23, w: 1 },  // midSize ≤ sz < hiSize ⇒ 1
  { size: 24, w: 2 }, { size: 26, w: 2 }, { size: 36, w: 2 }, { size: 50, w: 2 },  // ≥ hiSize ⇒ 2
];
// spawnBulk esperado por TIPO: type → base size → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "rat", size: 15, w: 0 }, { type: "bat", size: 14, w: 0 }, { type: "volatile", size: 16, w: 0 },
  { type: "wolf", size: 18, w: 1 }, { type: "mage", size: 21, w: 1 }, { type: "orc", size: 22, w: 1 },
  { type: "moose", size: 26, w: 2 }, { type: "charger", size: 26, w: 2 }, { type: "golem", size: 36, w: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.bulk + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.bulk());
  ok("2 byte-id OFF (fresh boot): BULK_SURGE.enabled false AND G.bulkBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "bulkFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" weights=${JSON.stringify(dark.weights)} hiSize=${dark.hiSize} midSize=${dark.midSize}`);

  // 3 save OFF has no bulkFind/bulkBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(bulkFind|bulkBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"bulkBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'bulkFind'/'bulkBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.bulk({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.bulk({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.bulk({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ sizeProbe LUT: size→weight (umbrales hiSize=24/midSize=18), type-independiente.
  const szp = await page.evaluate((cases) => cases.map(c => window.__dev.bulk({ sizeProbe: { size: c.size } }).sizeProbe), EXPECT_SIZE);
  const szpOK = EXPECT_SIZE.every((c, i) => szp[i] && szp[i].weight === c.w);
  ok("5b ★ sizeProbe LUT: 14/15/16/17⇒0; 18/20/22/23⇒1; 24/26/36/50⇒2 (umbrales midSize=18/hiSize=24)",
     szpOK, JSON.stringify(szp.map(x => ({ sz: x.size, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnBulk pushes a real mob of TYPE to G.enemies; reads bulkWeight from ETPL[type].size. golem/moose⇒2, orc/wolf⇒1, rat/bat⇒0.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.bulk({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.bulk({ clearBulk: true });
      window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sb = window.__dev.bulk({ spawnBulk: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnBulk;
      const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
      out.push({ type: c.type, sbSize: sb.size, sbW: sb.weight, valid: sb.valid, bpScore: bp.score, bpW: bp.mobs[0] ? bp.mobs[0].weight : -1, bpType: bp.mobs[0] ? bp.mobs[0].type : "" });
    }
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].sbSize === c.size && server7[i].sbW === c.w && server7[i].valid && server7[i].bpW === c.w && server7[i].bpType === c.type);
  ok("7 ★ REAL SERVER-AUTH: spawnBulk empuja un mob REAL del TIPO; bulkProbe lee el peso REAL de ETPL[type].size ⇒ golem/moose⇒2, orc/wolf/mage⇒1, rat/bat/volatile⇒0",
     s7OK, JSON.stringify(server7.map(x => ({ t: x.type, sz: x.sbSize, w: x.sbW }))));

  // 7b ★ ⊥#74/⊥champion INFLADO: rata con e.tpl.size inflado a 99 (mimetiza afijo/campeón sizeMul) ⇒ bulkOf lee ETPL['rat'].size=15 BASE ⇒ weight SIGUE 0 pese a tplSize=99.
  const infl = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const ratBase = window.__dev.bulk({ spawnBulk: { type: "rat", tx: Z.forest[0], ty: Z.forest[1] } }).spawnBulk;
    window.__dev.bulk({ clearBulk: true });
    const ratInfl = window.__dev.bulk({ spawnBulk: { type: "rat", tx: Z.forest[0], ty: Z.forest[1], inflate: 99 } }).spawnBulk;
    const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;   // lectura REAL: sigue leyendo base
    // control positivo: un orco inflado a 99 sigue leyendo 22 (base) ⇒ weight 1 (no salta a 2)
    window.__dev.bulk({ clearBulk: true });
    const orcInfl = window.__dev.bulk({ spawnBulk: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], inflate: 99 } }).spawnBulk;
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    return { ratBaseSize: ratBase.size, ratBaseW: ratBase.weight, ratInflTpl: ratInfl.tplSize, ratInflSize: ratInfl.size, ratInflW: ratInfl.weight, bpW: bp.mobs[0] ? bp.mobs[0].weight : -99,
      orcInflTpl: orcInfl.tplSize, orcInflSize: orcInfl.size, orcInflW: orcInfl.weight };
  }, Z);
  const inflOK = infl.ratBaseSize === 15 && infl.ratBaseW === 0 &&
    infl.ratInflTpl === 99 && infl.ratInflSize === 15 && infl.ratInflW === 0 && infl.bpW === 0 &&   // clon inflado a 99, BASE 15 ⇒ mole 0
    infl.orcInflTpl === 99 && infl.orcInflSize === 22 && infl.orcInflW === 1;                         // orco inflado a 99, BASE 22 ⇒ mole 1 (NO 2)
  ok("7b ★ ⊥#74/⊥champion INFLADO: e.tpl.size inflado a 99 (mimetiza afijo A.sizeMul/campeón C.sizeMul) ⇒ bulkOf lee ETPL[type].size BASE ⇒ rata SIGUE mole0, orco SIGUE mole1 (desacople del clon)",
     inflOK, JSON.stringify(infl));

  // 8 ★ ⊥#91 crux: alce (sz26⇒mole2) en el PRADO (zone-tier 0) ⇒ bulk2/zonetier0; rata (sz15⇒mole0) en el ABISMO (zone-tier 2) ⇒ bulk0/zonetier2. DISJUNTOS (entidad vs terreno).
  const crux = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true }); window.__dev.zonetier({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    // ALCE en el PRADO
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const mooseForest = { bulk: window.__dev.bulk().score, zone: window.__dev.zonetier({ tierProbe: true }).tierProbe.score };
    window.__dev.bulk({ clearBulk: true });
    // RATA en el ABISMO
    window.__dev.bulk({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.bulk({ spawnBulk: { type: "rat", tx: Z.abyss[0], ty: Z.abyss[1] } });
    const ratAbyss = { bulk: window.__dev.bulk().score, zone: window.__dev.zonetier({ tierProbe: true }).tierProbe.score };
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false }); window.__dev.zonetier({ enabled: false });
    return { mooseForest, ratAbyss };
  }, Z);
  const cruxOK = crux.mooseForest.bulk === 2 && crux.mooseForest.zone === 0 &&   // alce en prado: mole 2, zona 0
    crux.ratAbyss.bulk === 0 && crux.ratAbyss.zone === 2;                        // rata en abismo: mole 0, zona 2
  ok("8 ★ ⊥#91 crux: ALCE (sz26⇒mole2) en el PRADO (zone-tier0) ⇒ bulk2/zonetier0; RATA (sz15⇒mole0) en el ABISMO (zone-tier2) ⇒ bulk0/zonetier2 (entidad vs terreno, DISJUNTOS)",
     cruxOK, JSON.stringify(crux));

  // 9 ★ DIFFERENTIATOR/⊥ peers: un ALCE (mole grande) MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en el PRADO ⇒ bulk T2 MIENTRAS peers IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intBefore = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    // ALCE MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en el PRADO: in-radio de todos los peers, pero mole grande / melee / suelto / sano / sin-CC / ocioso / point-blank / zona-inicial ⇒ SÓLO bulk dispara
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.bulk();
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intAfter = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;   // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                     // alce ocioso estacionario ⇒ 0
    const zone = window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter, intBefore, intAfter, reach, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&                        // bulk fires (alce grande)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                        // escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore && diff.intAfter === diff.intBefore && // siega #86 / control #85 / interrupt #89 IGNORAN
    diff.reach === 0 && diff.head === 0 && diff.zoneScore === 0;                                   // reach #88 / embestida #90 / zona #91 IGNORAN
  ok("9 ★ DIFERENCIADOR/⊥: ALCE MELEE SANO SUELTO NO-CC'd OCIOSO a quemarropa en PRADO ⇒ bulk T2 MIENTRAS escaramuza/manada/siega/control/interrupt/reach/embestida/zona IGNORAN",
     diffOK, JSON.stringify(diff));

  // 10 CANAL bulkFind: forageChargePreview alce (mole grande)>0 ; rata (menuda) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // alce ⇒ score 2 ⇒ T2
    const actVm = window.__dev.bulk();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ spawnBulk: { type: "rat", tx: Z.forest[0], ty: Z.forest[1] } });      // rata ⇒ score 0
    const ratVm = window.__dev.bulk();
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    return { actPrev, actCharge, ratPrev: ratVm.forageChargePreview, ratTier: ratVm.tier, ratScore: ratVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.ratPrev === 0 && forage.ratTier === 0 && forage.ratScore === 0;
  ok("10 CANAL bulkFind: forageChargePreview con alce (mole grande) ⇒ charge>0 (==bulkBonus); con rata (menuda) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds bulkBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.bulk({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.bulk().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>bulkBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a moose available
  const neutral = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // alce disponible
    window.__dev.bulk({ enabled: false });                             // now OFF
    const off = window.__dev.bulk();
    window.__dev.bulk({ enabled: true }); window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, bulkBonus(alce disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip bulk OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de bulk.
  const orth = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.bulk({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.bulk();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.bulk();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD bulkFind ⊥ peers: flip bulk OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/longshot/interrupt/heading/zonetier/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de bulk; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 33 arc flags served true; BULK_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const blkDark = flag("BULK_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 33 mecanismos del arco #59-#91 served enabled:true; BULK_SURGE served false (DARK #92)",
     arcAllOn && blkDark && arc.length === 33, `bulk=${flag("BULK_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Mole:" drawn ON+moose / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Mole:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // alce ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Mole:\" se DIBUJA ON+alce (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.bulk({ enabled: true }); window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ enabled: false }); });

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
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.bulk();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.bulk({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const sizes = [14, 15, 18, 22, 24, 26, 36].map(sz => { const q = window.__dev.bulk({ sizeProbe: { size: sz } }).sizeProbe; return { sz, w: q.weight }; });
    const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, bpScore: bp.score, bpCount: bp.count, bpW: bp.mobs[0] ? bp.mobs[0].weight : -1, bpType: bp.mobs[0] ? bp.mobs[0].type : "", lut, sizes, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.bpScore === B.bpScore && A.bpCount === B.bpCount && A.bpW === B.bpW && A.bpType === B.bpType && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.sizes) === JSON.stringify(B.sizes) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO alce+héroe ⇒ score/tier/charge + bulkProbe(score,count,weight,type) + sizeProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},bpScore:${A.bpScore},bpCount:${A.bpCount},bpW:${A.bpW},bpType:${A.bpType},sizes:${JSON.stringify(A.sizes)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},bpScore:${B.bpScore},bpCount:${B.bpCount},bpW:${B.bpW},bpType:${B.bpType},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.bulk({ enabled: false }));
  await pageB.evaluate(() => window.__dev.bulk({ enabled: false }));

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
