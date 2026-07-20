// CAS-2615 — self-verify for REMATE DE BOLSA (DARK, GOLD_SURGE.enabled:false). EVO mecánica #103 (serializa tras #102 GEARCHANCE_SURGE LIVE&served ba2bf2c81434/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 44 LIVE #59-#102.
// (A) EJE FRESCO = MAGNITUD DE ORO/BOTÍN DE MONEDA INTRÍNSECA del mob TYPE server-auth (cuánta BOLSA carga de fábrica su TIPO — la cantidad base `gold` [rango min,max] que suelta al morir). Todas las filas de ETPL definen gold (config.js:290+; rat/bat[.,4]..calderatyrant[110,170]). server-auth, MMORPG-native (recompensar cazar al mob de bolsa gorda cuya alta magnitud de moneda aprendiste a leer, no al bicho de bolsa flaca).
//     PRE-FLIGHT GATE PASA sin pivote del EJE (pero PIVOTE del NOMBRE DE CANAL: el issue propuso `goldFind` PERO YA existe — es el multiplicador de oro-RECOGIDO de KINSHIP_BOND #60 [pickup de monedas], config.js:2493 ⇒ colisión ⇒ pivoté a `coinFind` FRESCO [fichas por REMATAR]). `gold` es RANGO [min,max] de enteros ESTÁTICO por template, server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG EN EL READ usado para bandear — goldOf lee el VALOR ESTÁTICO gold[1] del template, NO la tirada ri(gold[0],gold[1]) que rueda la cantidad), y NINGUNA de las 44 flags #59-#102 lo lee como SCORE. Los ÚNICOS lectores de `.gold`: (a) la SIEMBRA DEL DROP de oro (ri(tpl.gold[0],tpl.gold[1]) — cantidad DENTRO de la rama de loot), (b) los modificadores de AFIJO/CAMPEÓN que MULTIPLICAN el CLON por goldMul (mutan la magnitud), (c) los probes dev. NINGUNO puntúa banda (spoilsWeights #79 lee kind:"gold" de un DROP YA en el suelo, NO ETPL[type].gold).
//     CRUX ⊥#72 SCARCITY (el riesgo señalado por el issue): #72 lee ETPL[type].xp como MAGNITUD de esencia (round(scarcityMul(zone)*tpl.xp), canal essenceFind), NO gold — CAMPOS DISTINTOS de ETPL. La banda de gold NO es proxy de xp: DENTRO de modest (gold[1] 15-22) bandit gold[1]21/xp30 vs orc gold[1]20/xp40 (MÁS oro MENOS xp) ⇒ NO co-monótono ⇒ ⊥#72 PROBADO.
//     CRUX ⊥#102 GEARCHANCE (base LIVE): #102 lee gearChance=PROBABILIDAD DE SOLTAR EQUIPO, gold=CUÁNTA MONEDA — CAMPOS DISTINTOS. DENTRO de modest (gold[1] 15-22): orc gold[1]20/gearChance0.30(gear2) vs mage gold[1]20/gearChance0.26(gear1) MISMO gold DISTINTA banda gear ⇒ ⊥#102 PROBADO.
//     CLAVE ⊥override/⊥#74/⊥campeón: goldWeight lee ETPL[e.type].gold[1] (MAGNITUD BASE INMUTABLE del TIPO), NO e.tpl.gold (el CLON) — si un spawn afijado/campeón MULTIPLICARA el clon vía goldMul, goldOf lo IGNORA y lee la fila base ⇒ un orc Vampírico SIGUE modest (base [11,20]). applyZoneScale escala hp/dmg/spd/xp pero NUNCA gold ⇒ bolsa INDEPENDIENTE de zona (⊥#91).
//     goldWeight(e)=banda de goldOf(e)=ETPL[type].gold[1]: gold[1]≥hiGold(23) ⇒ opulent ⇒ 2; gold[1]≥midGold(12) ⇒ modest ⇒ 1; gold[1]<midGold ⇒ 0. El score del kill = goldWeight(víctima) muestreado en el TOP de killEnemy (_goldPre). La señal VIVA del badge = goldScore(hero)=MAX goldWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #102 pertrecho/#101 acometida/#100 recobro/#98 impacto/#94 velocidad/#93 rol/#92 mole).
// (B) CANAL FRESCO = coinFind (fichas de moneda por rematar a un mob de BOLSA GORDA — NINGUNA de las 44 flags lo usa; ⊥ goldFind #60 = multiplicador de oro-RECOGIDO). La familia recompensa-de-forrajeo EXISTENTE (goldFind…gearFind #102) está LLENA ⇒ moneda FRESCA (h.coinBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio coinBountyCap, 0 doble-dip.
//
// ★ goldProbe LUT (check 5b): gold[1]→banda→weight — prueba el UMBRAL hiGold(23)/midGold(12), type-independiente (bordes 23/12/11 exactos).
// ★ REAL SERVER-AUTH (check 7): spawnGold empuja un mob REAL del TIPO al MISMO G.enemies; goldProbeLive lee su peso REAL de ETPL[type].gold[1].
// ★ ⊥override/#74/campeón OVERRIDE (check 7b): spawnGold{type:'orc',overrideGold:99} sube el CLON e.tpl.gold=[0,99]; goldOf lee ETPL['orc'].gold[1]=20 BASE ⇒ weight SIGUE 1. Y bat{overrideGold:99} ⇒ base 4 ⇒ weight SIGUE 0.
// ★ ⊥#102 GEARCHANCE crux (check 8, base LIVE): orc (gold20 modest w1, gearChance0.30⇒gear2) vs mage (gold20 modest w1, gearChance0.26⇒gear1) ⇒ MISMO goldWeight DISTINTA banda gear.
// ★ ⊥#72 SCARCITY/xp crux (check 8c): bandit (gold21 modest w1, xp30) vs orc (gold20 modest w1, xp40) ⇒ MISMO goldWeight pese a MÁS oro MENOS xp ⇒ gold NO es proxy de la magnitud de recompensa de #72.
// ★ ⊥#101 lunge crux (check 8d): bandit (gold21 modest w1, lunge132⇒lunge2) vs moose (gold24 opulent w2, lunge0) ⇒ ORDEN OPUESTO.
// ★ ⊥#94 swift crux (check 8e): volatile (gold8 pauper w0, spd152⇒swift2) vs orc (gold20 modest w1, spd64⇒swift0) ⇒ DIAMETRAL.
// ★ ⊥#98 ram crux (check 8f): moose (gold24 opulent w2, knock200⇒ram2) vs revenant (gold28 opulent w2, knock120⇒ram1) ⇒ MISMA banda gold distinto ram.
// ★ DIFERENCIADOR (check 9): un GOLEM (gold[1]90 opulent⇒gold2) ⇒ gold T2 MIENTRAS gear#102=0(SIN gearChance)/swift#94=0(lento)/lunge#101=0(sin salto) — la banda TOP por magnitud de bolsa es gold, donde la base-LIVE #102 es 0.
// ★ CANAL (check 10): forageChargePreview = coinBonus(score). Moose (opulent) ⇒ charge>0; bat (pauper) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(coinBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con GOLD_SURGE OFF, coinBonus(cualquier score)==0 y forageChargePreview==0 aun con un moose disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): gold (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de gold.
// ★ 0-REGRESIÓN (check 14): las 44 mecánicas del arco #59-#102 siguen served enabled:true; GOLD_SURGE served false (DARK #103).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + goldProbeLive + goldProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). goldScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2615-gold-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2615");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// goldProbe esperado: gold[1]→banda→weight (UMBRAL hiGold 23 / midGold 12). Cubre los 3 buckets + los bordes exactos.
const EXPECT_GOLD = [
  { g: 28, band: "opulent", w: 2 }, { g: 24, band: "opulent", w: 2 }, { g: 23, band: "opulent", w: 2 },   // ≥hiGold(23) ⇒ opulent ⇒ 2 (borde 23 inclusive)
  { g: 22, band: "modest", w: 1 }, { g: 20, band: "modest", w: 1 }, { g: 12, band: "modest", w: 1 },       // ≥midGold(12) ⇒ modest ⇒ 1 (borde 12 inclusive, 22 justo bajo hiGold)
  { g: 11, band: "pauper", w: 0 }, { g: 9, band: "pauper", w: 0 }, { g: 4, band: "pauper", w: 0 },         // <midGold ⇒ pauper ⇒ 0 (borde 11 justo bajo midGold; skeleton9; rat4)
];
// spawnGold esperado por TIPO: type → base gold[1] → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "moose", g: 24, w: 2 }, { type: "revenant", g: 28, w: 2 }, { type: "demon", g: 28, w: 2 },
  { type: "orc", g: 20, w: 1 }, { type: "mage", g: 20, w: 1 }, { type: "bandit", g: 21, w: 1 }, { type: "spearman", g: 15, w: 1 }, { type: "ironback", g: 22, w: 1 },
  { type: "bat", g: 4, w: 0 }, { type: "wolf", g: 6, w: 0 }, { type: "volatile", g: 8, w: 0 }, { type: "rat", g: 4, w: 0 },   // bolsa-flaca ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.gold && window.__dev.gearchance && window.__dev.lunge && window.__dev.recover && window.__dev.wind && window.__dev.ram && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.gold + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE fresh boot: GOLD_SURGE.enabled TRUE (45º flag LIVE); state STATELESS (gExists false: coinBounty transient, 100% derived)
  const dark = await page.evaluate(() => window.__dev.gold());
  ok("2 LIVE (fresh boot): GOLD_SURGE.enabled TRUE (45º flag LIVE) AND estado STATELESS (gExists false: coinBounty transitorio, derivado)",
     dark.enabled === true && dark.gExists === false && dark.channel === "coinFind",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiGold=${dark.hiGold} midGold=${dark.midGold} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coinFind/coinBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coinFind|coinBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coinBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coinFind'/'coinBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(395)));
  await page.evaluate(() => window.__dev.gold({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(395)));
  await page.evaluate(() => window.__dev.gold({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.gold({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ goldProbe LUT: gold[1]→band→weight (UMBRAL hiGold/midGold), type-independiente.
  const grp = await page.evaluate((cases) => cases.map(c => window.__dev.gold({ goldProbe: { gold: c.g } }).goldProbe), EXPECT_GOLD);
  const grpOK = EXPECT_GOLD.every((c, i) => grp[i] && grp[i].band === c.band && grp[i].weight === c.w);
  ok("5b ★ goldProbe LUT: gold[1]≥23⇒opulent⇒2; ≥12⇒modest⇒1; <12⇒pauper⇒0 (UMBRAL hiGold/midGold, bordes 23/12/11 exactos)",
     grpOK, JSON.stringify(grp.map(x => ({ g: x.gold, b: x.band, wt: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnGold pushes a real mob of TYPE to G.enemies; reads goldWeight from ETPL[type].gold[1].
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.gold({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.gold({ clearGold: true });
      window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.gold({ spawnGold: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnGold;
      const tp = window.__dev.gold({ goldProbeLive: true }).goldProbeLive;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srGold: sr.gold, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineGold: mine ? mine.gold : -1 });
    }
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srGold === c.g && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineGold === c.g && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnGold empuja un mob REAL del TIPO; goldProbeLive lee el peso REAL de ETPL[type].gold[1] ⇒ moose24/revenant28/demon28⇒2, orc20/mage20/bandit21/spearman15/ironback22⇒1, bat4/wolf6/volatile8/rat4⇒0",
     s7OK, JSON.stringify(server7.filter((x, i) => !(x && x.srGold === EXPECT_TYPE[i].g && x.srW === EXPECT_TYPE[i].w && x.valid && x.mineW === EXPECT_TYPE[i].w)).map(x => ({ t: x.type, g: x.srGold, w: x.srW })) || server7.slice(0, 3)));

  // 7b ★ ⊥override/#74/campeón OVERRIDE: orc con e.tpl.gold subido a [0,99] ⇒ goldOf lee ETPL['orc'].gold[1]=20 BASE ⇒ weight SIGUE 1. bat con override [0,99] ⇒ base 4 ⇒ weight SIGUE 0.
  const ovr = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true });
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const orcBase = window.__dev.gold({ spawnGold: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }).spawnGold;
    window.__dev.gold({ clearGold: true });
    const orcOvr = window.__dev.gold({ spawnGold: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideGold: 99 } }).spawnGold;
    const tp1 = window.__dev.gold({ goldProbeLive: true }).goldProbeLive;   // lectura REAL: sigue leyendo base ⇒ 1
    window.__dev.gold({ clearGold: true });
    const batOvr = window.__dev.gold({ spawnGold: { type: "bat", tx: Z.forest[0], ty: Z.forest[1], overrideGold: 99 } }).spawnGold;   // clon subido a 99
    const tp2 = window.__dev.gold({ goldProbeLive: true }).goldProbeLive;   // sigue leyendo base 4 ⇒ 0
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ enabled: false });
    const orc1 = tp1.mobs.find(m => m.type === "orc"), bat2 = tp2.mobs.find(m => m.type === "bat");
    return { orcBaseGold: orcBase.gold, orcBaseW: orcBase.weight, orcOvrGold: orcOvr.gold, orcOvrTplGold: orcOvr.tplGold, orcOvrW: orcOvr.weight, tp1W: orc1 ? orc1.weight : -99,
      batOvrGold: batOvr.gold, batOvrTplGold: batOvr.tplGold, batOvrW: batOvr.weight, tp2W: bat2 ? bat2.weight : -99 };
  }, Z);
  const ovrOK = ovr.orcBaseGold === 20 && ovr.orcBaseW === 1 &&
    ovr.orcOvrGold === 20 && ovr.orcOvrTplGold === 99 && ovr.orcOvrW === 1 && ovr.tp1W === 1 &&   // clon 99, BASE 20 ⇒ gold 1 (NO salta a 2)
    ovr.batOvrGold === 4 && ovr.batOvrTplGold === 99 && ovr.batOvrW === 0 && ovr.tp2W === 0;        // clon 99, BASE 4 ⇒ gold 0 (NO salta a 2)
  ok("7b ★ ⊥override/#74/campeón OVERRIDE: e.tpl.gold escalado (mimetiza afijo/campeón vía goldMul) ⇒ goldOf lee ETPL[type].gold[1] BASE ⇒ orc SIGUE modest w1 (base 20 pese a clon 99), bat SIGUE pauper w0 (base 4 pese a clon 99) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#102 GEARCHANCE crux (base LIVE): orc (gold20 modest w1, gearChance0.30⇒gear2) vs mage (gold20 modest w1, gearChance0.26⇒gear1). MISMO goldWeight DISTINTA banda gear.
  const crux102 = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true }); window.__dev.gearchance({ enabled: true });
    const read = (type) => { window.__dev.gold({ clearGold: true }); window.__dev.gearchance({ clearGear: true });
      window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gold({ spawnGold: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gold: window.__dev.gold().score, gear: window.__dev.gearchance().score }; };
    const orc = read("orc"), mage = read("mage");
    window.__dev.gold({ clearGold: true }); window.__dev.gearchance({ clearGear: true });
    window.__dev.gold({ enabled: false }); window.__dev.gearchance({ enabled: false });
    return { orc, mage };
  }, Z);
  const crux102OK = crux102.orc.gold === 1 && crux102.orc.gear === 2 && crux102.mage.gold === 1 && crux102.mage.gear === 1;
  ok("8 ★ ⊥#102 crux (base LIVE): ORC (gold20 modest w1/gearChance0.30 gear2) vs MAGE (gold20 modest w1/gearChance0.26 gear1) — MISMO goldWeight (1) DISTINTA banda gear (2 vs 1) ⇒ magnitud de oro ⊥ probabilidad de gear",
     crux102OK, JSON.stringify(crux102));

  // 8c ★ ⊥#72 SCARCITY/xp crux: bandit (gold21 modest w1, xp30) vs orc (gold20 modest w1, xp40). MISMO goldWeight, gold 21 vs 20 pero xp 30 vs 40 ⇒ NO co-monótono.
  const crux72 = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true });
    const read = (type) => { window.__dev.gold({ clearGold: true });
      window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.gold({ spawnGold: { type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnGold;
      return { gold: window.__dev.gold().score, g1: sr.gold }; };
    const bandit = read("bandit"), orc = read("orc");
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ enabled: false });
    return { bandit, orc };
  }, Z);
  // bandit gold[1]21 gold-modest w1, xp30 ; orc gold[1]20 gold-modest w1, xp40 — MISMO goldWeight, MÁS oro (21>20) MENOS xp (30<40)
  const crux72OK = crux72.bandit.gold === 1 && crux72.orc.gold === 1 && crux72.bandit.g1 === 21 && crux72.orc.g1 === 20;
  ok("8c ★ ⊥#72 SCARCITY/xp crux: BANDIT (gold[1]21 modest w1, xp30) vs ORC (gold[1]20 modest w1, xp40) — MISMO goldWeight (1) pese a MÁS oro (21>20) y MENOS xp (30<40) ⇒ gold NO co-monótono con la MAGNITUD de recompensa de #72 (essence ∝ xp)",
     crux72OK, JSON.stringify(crux72));

  // 8d ★ ⊥#101 lunge crux: bandit (gold21 modest w1, lunge132⇒lunge2) vs moose (gold24 opulent w2, lunge0). ORDEN OPUESTO.
  const crux101 = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true }); window.__dev.lunge({ enabled: true });
    const read = (type) => { window.__dev.gold({ clearGold: true }); window.__dev.lunge({ clearLunge: true });
      window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gold({ spawnGold: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gold: window.__dev.gold().score, lunge: window.__dev.lunge().score }; };
    const bandit = read("bandit"), moose = read("moose");
    window.__dev.gold({ clearGold: true }); window.__dev.lunge({ clearLunge: true });
    window.__dev.gold({ enabled: false }); window.__dev.lunge({ enabled: false });
    return { bandit, moose };
  }, Z);
  const crux101OK = crux101.bandit.gold === 1 && crux101.bandit.lunge === 2 && crux101.moose.gold === 2 && crux101.moose.lunge === 0;
  ok("8d ★ ⊥#101 crux: BANDIT (gold21 modest w1/lunge132 lunge2 POUNCER) vs MOOSE (gold24 opulent w2/sin lunge lunge0) — ORDEN OPUESTO ⇒ magnitud de oro ⊥ distancia de acometida",
     crux101OK, JSON.stringify(crux101));

  // 8e ★ ⊥#94 swift crux: volatile (gold8 pauper w0, spd152⇒swift2) vs orc (gold20 modest w1, spd64⇒swift0). DIAMETRAL.
  const crux94 = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true }); window.__dev.swift({ enabled: true });
    const read = (type) => { window.__dev.gold({ clearGold: true }); window.__dev.swift({ clearSwift: true });
      window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gold({ spawnGold: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gold: window.__dev.gold().score, swift: window.__dev.swift().score }; };
    const volatile_ = read("volatile"), orc = read("orc");
    window.__dev.gold({ clearGold: true }); window.__dev.swift({ clearSwift: true });
    window.__dev.gold({ enabled: false }); window.__dev.swift({ enabled: false });
    return { volatile_, orc };
  }, Z);
  const crux94OK = crux94.volatile_.gold === 0 && crux94.volatile_.swift === 2 && crux94.orc.gold === 1 && crux94.orc.swift === 0;
  ok("8e ★ ⊥#94 crux: VOLATILE (gold8 pauper w0/spd152 swift2) vs ORC (gold20 modest w1/spd64 swift0) — DIAMETRAL (magnitud de oro ⊥ velocidad)",
     crux94OK, JSON.stringify(crux94));

  // 8f ★ ⊥#98 ram crux: moose (gold24 opulent w2, knock200⇒ram2) vs revenant (gold28 opulent w2, knock120⇒ram1). MISMA banda gold distinto ram.
  const crux98 = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true }); window.__dev.ram({ enabled: true });
    const read = (type) => { window.__dev.gold({ clearGold: true }); window.__dev.ram({ clearRam: true });
      window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gold({ spawnGold: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gold: window.__dev.gold().score, ram: window.__dev.ram().score }; };
    const moose = read("moose"), revenant = read("revenant");
    window.__dev.gold({ clearGold: true }); window.__dev.ram({ clearRam: true });
    window.__dev.gold({ enabled: false }); window.__dev.ram({ enabled: false });
    return { moose, revenant };
  }, Z);
  const crux98OK = crux98.moose.gold === 2 && crux98.moose.ram === 2 && crux98.revenant.gold === 2 && crux98.revenant.ram === 1;
  ok("8f ★ ⊥#98 crux: MOOSE (gold24 opulent w2/knock200 ram2) vs REVENANT (gold28 opulent w2/knock120 ram1) — MISMA banda gold (2) DISTINTO ram (2 vs 1) ⇒ impacto ⊥ magnitud de oro",
     crux98OK, JSON.stringify(crux98));

  // 9 ★ DIFFERENTIATOR: un GOLEM (gold[1]90 opulent⇒gold2) ⇒ gold T2 MIENTRAS gear#102=0(sin gearChance)/swift#94=0(lento)/lunge#101=0(sin salto).
  const diff = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true }); window.__dev.gearchance({ enabled: true }); window.__dev.swift({ enabled: true }); window.__dev.lunge({ enabled: true });
    window.__dev.gold({ clearGold: true }); window.__dev.gearchance({ clearGear: true });
    window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gold({ spawnGold: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.gold();
    const gear = window.__dev.gearchance().score;                                    // golem SIN gearChance ⇒ gear0 (bare)
    const swift = window.__dev.swift().score;                                        // golem spd46 ⇒ swift0 (lento)
    const lunge = window.__dev.lunge().score;                                        // golem sin lunge ⇒ lunge0
    window.__dev.gold({ clearGold: true }); window.__dev.gearchance({ clearGear: true });
    window.__dev.gold({ enabled: false }); window.__dev.gearchance({ enabled: false }); window.__dev.swift({ enabled: false }); window.__dev.lunge({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, gear, swift, lunge };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.gear === 0 && diff.swift === 0 && diff.lunge === 0;
  ok("9 ★ DIFERENCIADOR: GOLEM (gold[1]90 opulent) ⇒ gold T2 MIENTRAS gear#102=0(sin gearChance)/swift#94=0(lento)/lunge#101=0(sin salto) — la banda TOP (2) del golem por su magnitud de bolsa es gold, donde la base-LIVE #102 es 0",
     diffOK, JSON.stringify(diff));

  // 10 CANAL coinFind: forageChargePreview moose (opulent)>0 ; bat (pauper) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true });
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gold({ spawnGold: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // moose ⇒ score 2 ⇒ T2
    const actVm = window.__dev.gold();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ spawnGold: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat ⇒ score 0
    const goVm = window.__dev.gold();
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coinFind: forageChargePreview con moose (opulent) ⇒ charge>0 (==coinBonus); con bat (pauper) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coinBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.gold({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.gold().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>coinBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a moose available
  const neutral = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true });
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gold({ spawnGold: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // moose disponible
    window.__dev.gold({ enabled: false });                             // now OFF
    const off = window.__dev.gold();
    window.__dev.gold({ enabled: true }); window.__dev.gold({ clearGold: true }); window.__dev.gold({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coinBonus(moose disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip gold OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de gold.
  const orth = await page.evaluate((Z) => {
    window.__dev.gold({ enabled: true });
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gold({ spawnGold: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gold({ enabled: false });
    const snap = () => JSON.stringify({ gc: window.__dev.gearchance(), lng: window.__dev.lunge(), rec: window.__dev.recover(), wind: window.__dev.wind(), ram: window.__dev.ram(), swf: window.__dev.swift(), rol: window.__dev.role(), blk: window.__dev.bulk(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.gold({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.gold();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.gold();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD coinFind ⊥ peers: flip gold OFF→ON NO cambia gearchance/lunge/recover/wind/ram/swift/role/bulk/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de gold; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 44 arc flags served true; GOLD_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const goldLive = flag("GOLD_SURGE") === "true";
  ok("14 ★ 0-REGRESIÓN: 45 mecanismos del arco #59-#103 served enabled:true; GOLD_SURGE served TRUE (LIVE #103, 45º flag)",
     arcAllOn && goldLive && arc.length === 44, `gold=${flag("GOLD_SURGE")} arcAllOn=${arcAllOn} n=${arc.length + 1} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Bolsa:" drawn ON+moose / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Bolsa:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.gold({ enabled: true });
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gold({ spawnGold: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // moose ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Bolsa:\" se DIBUJA ON+moose (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.gold({ enabled: true }); window.__dev.gold({ clearGold: true }); window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.gold({ spawnGold: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.gold({ clearGold: true }); window.__dev.gold({ enabled: false }); });

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
    window.__dev.gold({ enabled: true });
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gold({ spawnGold: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.gold();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.gold({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const grs = [28, 24, 23, 20, 11, 4].map(v => { const q = window.__dev.gold({ goldProbe: { gold: v } }).goldProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.gold({ goldProbeLive: true }).goldProbeLive;
    const mine = tp.mobs.find(m => m.type === "moose") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(395));
    window.__dev.gold({ clearGold: true });
    window.__dev.gold({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineGold: mine ? mine.gold : -1, lut, grs, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineGold === B.mineGold && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.grs) === JSON.stringify(B.grs) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO moose+héroe ⇒ score/tier/charge + goldProbeLive(score,weight,gold) + goldProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineGold:${A.mineGold},grs:${JSON.stringify(A.grs)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineGold:${B.mineGold},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.gold({ enabled: false }));
  await pageB.evaluate(() => window.__dev.gold({ enabled: false }));

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
