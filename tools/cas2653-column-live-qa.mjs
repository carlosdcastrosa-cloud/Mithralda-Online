// CAS-2653 — POST-FLIP LIVE QA for REMATE DE COLUMNA (LIVE, COLUMN_SURGE.enabled:true). EVO mecánica #109 = 51º flag LIVE&served bc21f1f7ac8a/815 (flip 2b40b17 + stamp c1e1ee9). Flag-ON port of DARK harness CAS-2650 (fp 15920977 0-desync) — 2 assertions flipped (check2 enabled:true STATELESS, check14 51 flags served true off=[]). EJE FRESCO + CANAL FRESCO, ⊥ a las 50 LIVE #59-#108.
// (A) EJE FRESCO = ESTRUCTURAL/GEOMÉTRICO ELONGACIÓN/ANISOTROPÍA DE LA FORMA de la MANADA VIVA alrededor del héroe = columnElong(hero) = 1 − λ_min/λ_max de los AUTOVALORES de la COVARIANZA 2×2 de las POSICIONES de los mobs VIVOS en radio alrededor de SU CENTROIDE (PCA/análisis de forma). columnBand: ≥hiElong(0.82) ⇒ columna/hilera ⇒ 2; ≥midElong(0.55) ⇒ alargada/oblonga ⇒ 1; <mid (redonda/isótropa) ⇒ 0. Requiere ≥minMobs(3) vivos. ESCALA INTENSIVA (ratio ⇒ invariante al conteo Y al tamaño).
//     PRE-FLIGHT del eje RECOMENDADO pack COHESION (compacidad/apretujamiento) → FALLA por DOS razones ⇒ PIVOTE al ALTERNO (ELONGACIÓN/ANISOTROPÍA): (1) COHESION-ESCALA (dist media al centroide inversa) = re-mapeo MONÓTONO INVERSO de #107 DISPERSE (spread) ⇒ NO ⊥#107; (2) COHESION-CONTEO (suma de vecinos local) = EXACTAMENTE #87 PACKHARVEST (EXTENSIVA) ⇒ NO ⊥#87. El ALTERNO es un RATIO de autovalores ⇒ ESCALA-INVARIANTE Y CONTEO-INVARIANTE ⇒ mide la FORMA, no el tamaño ni la densidad.
//     CRUX ⊥#108 FLANK (concentración angular de rumbos hero→mob): la MISMA columna (E≈1) da FLANK distinto según su ORIENTACIÓN respecto al héroe — radial (apunta al héroe) R≈1/flank2 vs tangencial (perpendicular) R≈0.4/flank0 ⇒ MISMA forma, flank OPUESTO; blob a un lado ⇒ flank2/column0; anillo ⇒ flank0/column0. Forma-alrededor-del-centroide ⊥ ángulo-desde-el-héroe (distinción CLAVE vs el vecino MÁS próximo #108).
//     CRUX ⊥#107 DISPERSE (SPREAD RADIAL, ESCALA): línea pequeña tupida ⇒ column2/disperse0; línea grande ⇒ column2/disperse≥1; blob grande ⇒ column0/disperse2; blob pequeño ⇒ column0/disperse0 ⇒ LOS 4 cuadrantes ⇒ Forma (ratio) ⊥ escala (magnitud).
//     CRUX ⊥#87 PACKHARVEST (CONTEO/cohesión, EXTENSIVA): 3 mobs en columna vs 6 en la MISMA columna ⇒ E igual (≈1, column 2)/packHarvest SUM distinto (escala con conteo) ⇒ INTENSIVO ⊥ EXTENSIVO.
// (B) CANAL FRESCO = columnFind (fichas de columna por rematar en medio de una COLUMNA estirada — NINGUNA de las 50 flags lo usa; ⊥ flankFind #108/disperseFind #107/packFind #87/skirmishFind #84/wardRegen #59/headingFind #90). Moneda FRESCA (h.columnBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio columnBountyCap, 0 doble-dip.
//
// Run: node tools/cas2650-column-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2653-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// elongProbe LUT esperada: elong→banda→{tier,charge}. UMBRALES hiElong 0.82 / midElong 0.55, bordes exactos.
const EXPECT_ELONG = [
  { elong: 0, w: 0, t: 0, s: 0 }, { elong: 0.54, w: 0, t: 0, s: 0 },   // <midElong ⇒ redonda ⇒ 0 (borde 0.54 justo bajo)
  { elong: 0.55, w: 1, t: 1, s: 1 }, { elong: 0.81, w: 1, t: 1, s: 1 }, // ≥midElong ⇒ alargada ⇒ 1 (bordes 0.55 inclusive / 0.81)
  { elong: 0.82, w: 2, t: 2, s: 2 }, { elong: 1.0, w: 2, t: 2, s: 2 },  // ≥hiElong ⇒ columna ⇒ 2 (borde 0.82 inclusive)
];
// spawnColumn esperado por FORMA (offsets px del héroe). E = 1−λmin/λmax de la covarianza de posiciones. Cubre bandas 0/1/2 + minMobs + redonda-con-3-mobs (forma≠conteo).
const EXPECT_SPAWN = [
  { name: "column", pts: [[100, 0], [150, 0], [220, 0]], elong: 1.000, w: 2 },                          // 3 mobs COLINEALES (eje x) ⇒ E=1 ⇒ columna ⇒ 2
  { name: "oblong", pts: [[-100, -57.7], [-100, 57.7], [100, -57.7], [100, 57.7]], elong: 0.667, w: 1 }, // rectángulo 100:57.7 ⇒ var 3:1 ⇒ E=0.667 ⇒ alargada ⇒ 1
  { name: "cardBlob", pts: [[100, 0], [-100, 0], [0, 100], [0, -100]], elong: 0.000, w: 0 },             // 4 cardinales ⇒ covarianza isótropa ⇒ E=0 ⇒ redonda ⇒ 0
  { name: "triRound", pts: [[100, 0], [-50, 86.6], [-50, -86.6]], elong: 0.000, w: 0 },                  // triángulo EQUILÁTERO (3 mobs) ⇒ isótropo ⇒ E=0 ⇒ 0 (FORMA redonda pese a 3 mobs ⇒ ⊥ conteo)
  { name: "twoMobs", pts: [[100, 0], [150, 0]], elong: 0.000, w: 0 },                                    // 2 mobs <minMobs(3) ⇒ forma indefinida ⇒ 0 (2 puntos SIEMPRE colineales ⇒ por eso minMobs≥3)
  { name: "one", pts: [[120, 0]], elong: 0.000, w: 0 },                                                  // 1 mob <minMobs ⇒ 0
  { name: "empty", pts: [], elong: 0.000, w: 0 },                                                        // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.column && window.__dev.flank && window.__dev.disperse && window.__dev.packHarvest && window.__dev.heading && window.__dev.convoy && window.__dev.motley && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.column + peer hooks (flank/disperse/packHarvest/heading/convoy/motley) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE fresh boot: enabled TRUE (51º flag LIVE) + STATELESS (columnBounty transitorio, derivado ⇒ gExists false, empty-field score 0)
  const dark = await page.evaluate(() => window.__dev.column());
  ok("2 LIVE (fresh boot): COLUMN_SURGE.enabled TRUE (51º flag LIVE) AND estado STATELESS (gExists false: columnBounty transitorio derivado; empty-field score/elong 0)",
     dark.enabled === true && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.elong === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "columnFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} elong=${dark.elong} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiElong=${dark.hiElong} midElong=${dark.midElong} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no columnFind/columnBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(columnFind|columnBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"columnBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'columnFind'/'columnBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.column({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.column({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ elongProbe LUT: elong→band→tier→charge (UMBRALES hiElong/midElong + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.column({ elongProbe: { elong: c.elong } }).elongProbe), EXPECT_ELONG);
  const tabOK = EXPECT_ELONG.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ elongProbe LUT: E≥0.82⇒columna⇒2/T2; ≥0.55⇒alargada⇒1/T1; <0.55⇒redonda⇒0/T0 (UMBRAL hiElong 0.82/midElong 0.55, bordes 0.54/0.55/0.81/0.82 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ e: x.elong, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnColumn (wipe) inyecta mobs REALES en offsets px del héroe; columnElong = 1−λmin/λmax de la covarianza; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.column({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy]) => ({ dx, dy, type: "rat" }));
      const sr = window.__dev.column({ spawnColumn: { pts, wipe: true } }).spawnColumn;
      const live = window.__dev.column({ columnProbeLive: true }).columnProbeLive;
      out.push({ name: c.name, srElong: sr.elong, srScore: sr.score, liveElong: live.elong, liveScore: live.score, mobCount: live.mobCount });
    }
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srElong - c.elong) < 0.02 && Math.abs(comp[i].liveElong - c.elong) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnColumn empuja mobs REALES en offsets px; columnElong = 1−λmin/λmax de la covarianza ⇒ colineal⇒E1/2, rectángulo 3:1⇒E0.667/1, 4-cardinales⇒E0/0, triángulo-equilátero(3 mobs)⇒E0/0(FORMA≠conteo), 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 7 ★ ⊥#107 DISPERSE crux: COLUMN (forma/elongación, RATIO) ⊥ DISPERSE (spread radial, ESCALA). Los 4 cuadrantes.
  const crux107 = await page.evaluate((Z) => {
    window.__dev.column({ enabled: true }); window.__dev.disperse({ enabled: true });
    const read = (pts) => { window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.column({ spawnColumn: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { column: window.__dev.column().score, elong: window.__dev.column().elong, disperse: window.__dev.disperse().score, spread: window.__dev.disperse().spread }; };
    const smallLine = read([[10, 0], [16, 0], [22, 0]]);          // línea pequeña tupida ⇒ E≈1 (colineal)/spread≈4 (apiñada) ⇒ column2/disperse0
    const bigLine = read([[20, 0], [150, 0], [290, 0]]);          // línea grande ⇒ E≈1 (colineal)/spread≈91 (desplegada) ⇒ column2/disperse≥1
    const bigBlob = read([[200, 0], [-200, 0], [0, 200], [0, -200]]); // blob redondo grande ⇒ E≈0 (isótropo)/spread=200 ⇒ column0/disperse2
    const tinyBlob = read([[10, 0], [-10, 0], [0, 10], [0, -10]]);   // blob redondo pequeño ⇒ E≈0/spread=10 ⇒ column0/disperse0
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false }); window.__dev.disperse({ enabled: false });
    return { smallLine, bigLine, bigBlob, tinyBlob };
  }, Z);
  const crux107OK = crux107.smallLine.column === 2 && crux107.smallLine.disperse === 0 && crux107.bigLine.column === 2 && crux107.bigLine.disperse >= 1 && crux107.bigBlob.column === 0 && crux107.bigBlob.disperse >= 2 && crux107.tinyBlob.column === 0 && crux107.tinyBlob.disperse === 0;
  ok("7 ★ ⊥#107 crux: LÍNEA-pequeña ⇒ COLUMN 2/DISPERSE 0; LÍNEA-grande ⇒ COLUMN 2/DISPERSE≥1; BLOB-grande ⇒ COLUMN 0/DISPERSE 2; BLOB-pequeño ⇒ COLUMN 0/DISPERSE 0 ⇒ FORMA (ratio) ⊥ ESCALA (spread) — LOS 4 CUADRANTES (NO monótonas, INDEPENDIENTES)",
     crux107OK, JSON.stringify(crux107));

  // 8 ★ ⊥#87 PACKHARVEST crux: COLUMN INTENSIVO (invariante al conteo) ⊥ #87 EXTENSIVO. 3 vs 6 mobs en la MISMA columna ⇒ E igual (column 2)/packHarvest SUM distinto.
  const crux87 = await page.evaluate((Z) => {
    window.__dev.column({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const read = (pts) => { window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.column({ spawnColumn: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { column: window.__dev.column().score, packSum: window.__dev.packHarvest({ packProbe: true }).packProbe.score, packCount: window.__dev.packHarvest({ packProbe: true }).packProbe.count }; };
    const few = read([[150, 0], [165, 0], [180, 0]]);                                        // 3 mobs colineales ⇒ E≈1/column2
    const many = read([[150, 0], [158, 0], [166, 0], [174, 0], [182, 0], [190, 0]]);          // 6 mobs MISMA columna ⇒ E≈1/column2, más vecinos ⇒ packSum mayor
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false }); window.__dev.packHarvest({ enabled: false });
    return { few, many };
  }, Z);
  const crux87OK = crux87.few.column === 2 && crux87.many.column === 2 && crux87.many.packSum > crux87.few.packSum && crux87.many.packCount > crux87.few.packCount;
  ok("8 ★ ⊥#87 crux: 3 mobs en columna ⇒ COLUMN 2 (E≈1) Y packHarvest SUM=S3; 6 mobs MISMA columna ⇒ COLUMN 2 (E≈1) Y packHarvest SUM=S6>S3 ⇒ E INVARIANTE al conteo (INTENSIVO) ⊥ #87 SUMA-cohesión (EXTENSIVO)",
     crux87OK, JSON.stringify(crux87));

  // 9 ★ ⊥#108 FLANK crux (vecino MÁS próximo): la MISMA columna (E≈1) da FLANK distinto según su ORIENTACIÓN respecto al héroe. Forma-alrededor-del-centroide ⊥ ángulo-desde-el-héroe.
  const crux108 = await page.evaluate((Z) => {
    window.__dev.column({ enabled: true });   // flank ya es LIVE (enabled:true)
    const read = (pts) => { window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.column({ spawnColumn: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { column: window.__dev.column().score, elong: window.__dev.column().elong, flank: window.__dev.flank().score, conc: window.__dev.flank().conc }; };
    const radialLine = read([[100, 0], [150, 0], [220, 0]]);        // columna que APUNTA al héroe (radial) ⇒ E≈1/column2 Y R≈1/flank2
    const tangLine = read([[30, -250], [30, 0], [30, 250]]);        // MISMA forma columna PERPENDICULAR al héroe (tangencial) ⇒ E≈1/column2 PERO R≈0.4/flank0
    const blobSide = read([[150, 0], [170, 0], [160, 10], [160, -10]]); // blob redondo a un lado ⇒ E≈0/column0 Y R≈1/flank2
    const ring = read([[100, 0], [-100, 0], [0, 100], [0, -100]]);  // anillo alrededor del héroe ⇒ E≈0/column0 Y R=0/flank0
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false });
    return { radialLine, tangLine, blobSide, ring };
  }, Z);
  const crux108OK = crux108.radialLine.column === 2 && crux108.radialLine.flank === 2 && crux108.tangLine.column === 2 && crux108.tangLine.flank === 0 && crux108.blobSide.column === 0 && crux108.blobSide.flank === 2 && crux108.ring.column === 0 && crux108.ring.flank === 0;
  ok("9 ★ ⊥#108 crux (vecino más próximo): COLUMNA RADIAL (apunta al héroe) ⇒ COLUMN 2/FLANK 2; MISMA COLUMNA TANGENCIAL (perpendicular) ⇒ COLUMN 2/FLANK 0 (MISMA forma E≈1, flank OPUESTO); BLOB a un lado ⇒ COLUMN 0/FLANK 2; ANILLO ⇒ COLUMN 0/FLANK 0 ⇒ FORMA-alrededor-del-centroide ⊥ ÁNGULO-desde-el-héroe (2×2 INDEPENDIENTE)",
     crux108OK, JSON.stringify(crux108));

  // 10 CANAL columnFind: forageChargePreview con columna estirada >0 ; con blob redondo → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.column({ enabled: true });
    window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.column({ spawnColumn: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // column ⇒ score2 ⇒ T2
    const actVm = window.__dev.column();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.column({ spawnColumn: { pts: [[100, 0], [-100, 0], [0, 100], [0, -100]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // cardBlob ⇒ score0
    const goVm = window.__dev.column();
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL columnFind: forageChargePreview con columna estirada ⇒ charge>0 (==columnBonus); con blob redondo ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds columnBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let e = 0; e <= 1.0; e += 0.05) vals.push(window.__dev.column({ elongProbe: { elong: e } }).elongProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.column().cap };
  });
  ok("11 ★ SUB-CAP: ninguna elong produce charge>columnBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a column available
  const neutral = await page.evaluate((Z) => {
    window.__dev.column({ enabled: true });
    window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.column({ spawnColumn: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // columna disponible
    window.__dev.column({ enabled: false });                             // now OFF
    const off = window.__dev.column();
    window.__dev.column({ enabled: true }); window.__dev.column({ spawnColumn: { pts: [], wipe: true } }); window.__dev.column({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, elong: off.elong };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.elong === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, columnBonus(columna disponible)==0 + forageChargePreview==0 + elong==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip column OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling flank/disperse/heading/convoy/packHarvest no cambia la señal de column.
  const orth = await page.evaluate((Z) => {
    window.__dev.column({ enabled: true });
    window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.column({ spawnColumn: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    window.__dev.column({ enabled: false });
    const snap = () => JSON.stringify({ disperse: window.__dev.disperse(), motley: window.__dev.motley(), heading: window.__dev.heading() });
    const peersOff = snap();
    window.__dev.column({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.column();
    const dpPrev = window.__dev.disperse().enabled, hdPrev = window.__dev.heading().enabled, cvPrev = window.__dev.convoy().enabled, pkPrev = window.__dev.packHarvest().enabled;
    window.__dev.disperse({ enabled: true }); window.__dev.heading({ enabled: true }); window.__dev.convoy({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.column();
    const dpAfter = window.__dev.disperse().enabled, hdAfter = window.__dev.heading().enabled, cvAfter = window.__dev.convoy().enabled, pkAfter = window.__dev.packHarvest().enabled;
    window.__dev.disperse({ enabled: dpPrev }); window.__dev.heading({ enabled: hdPrev }); window.__dev.convoy({ enabled: cvPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.elong - afterArc.elong) < 0.001;
    return { peersUnchanged, sigUnchanged, dpAfter, hdAfter, cvAfter, pkAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD columnFind ⊥ peers: flip column OFF→ON NO cambia disperse/motley/heading; toggling DISPERSE #107/HEADING #90/CONVOY #58/PACKHARVEST #87 NO cambia la señal de column; todos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.dpAfter === true && orth.hdAfter === true && orth.cvAfter === true && orth.pkAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 51 arc flags served true (COLUMN_SURGE now LIVE #109); off=[]
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const columnLive = flag("COLUMN_SURGE") === "true";
  ok("14 ★ 0-REGRESIÓN: 50 mecanismos del arco #59-#108 served enabled:true; COLUMN_SURGE served TRUE (LIVE #109, 51º flag) ⇒ 51 flags served true off=[]",
     arcAllOn && columnLive && arc.length === 50, `column=${flag("COLUMN_SURGE")} arcAllOn=${arcAllOn} n=${arc.length + 1} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true").concat(columnLive ? [] : [["COLUMN_SURGE", flag("COLUMN_SURGE")]]))}`);

  // 15 render badge "Columna:" drawn ON+column / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Columna:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.column({ enabled: true });
    window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.column({ spawnColumn: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // column ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Columna:\" se DIBUJA ON+columna estirada (elong>0) y NO OFF (elong 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.column({ enabled: true }); window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.column({ spawnColumn: { pts: [[100, 0], [150, 0], [220, 0], [185, 8], [130, -6]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate((Z) => { window.__dev.column({ spawnColumn: { pts: [], wipe: true } }); window.__dev.column({ enabled: false }); }, Z);

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
  const readVM = async (pg) => await pg.evaluate((args) => {
    const { Z, FPARG } = args;
    window.__dev.column({ enabled: true });
    window.__dev.column({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.column({ spawnColumn: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    const vm = window.__dev.column();
    const lut = [0, 0.55, 0.82, 1.0].map(e => { const p = window.__dev.column({ elongProbe: { elong: e } }).elongProbe; return { elong: e, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.column({ columnProbeLive: true }).columnProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.column({ spawnColumn: { pts: [], wipe: true } });
    window.__dev.column({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, elong: vm.elong, liveElong: live.elong, liveScore: live.score, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.elong === B.elong && A.liveElong === B.liveElong && A.liveScore === B.liveScore && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA columna (3 mobs colineales)+héroe ⇒ score/tier/charge/elong + columnProbeLive(elong,score) + elongProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},elong:${A.elong},liveElong:${A.liveElong},liveScore:${A.liveScore},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},elong:${B.elong},liveElong:${B.liveElong},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.column({ enabled: false }));
  await pageB.evaluate(() => window.__dev.column({ enabled: false }));

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
