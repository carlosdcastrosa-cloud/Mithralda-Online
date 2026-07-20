// CAS-2658 — POST-FLIP LIVE QA for REMATE DE DESBANDADA (LIVE, ORIENT_SURGE.enabled:true). EVO mecánica #110 = 52º flag LIVE&served 449121cabca6/815 (flip 9e15637 + stamp fdd87b5). Flag-ON port of DARK harness CAS-2655 (fp 15920977 0-desync) — 2 assertions flipped (check2 enabled:true STATELESS, check14 52 flags served true off=[]). EJE FRESCO + CANAL FRESCO, ⊥ a las 51 LIVE #59-#109.
// Run: node tools/cas2658-orient-live-qa.mjs
// (A) EJE FRESCO = CINÉTICO/DIRECCIONAL DISPERSIÓN DE ORIENTACIONES/RUMBOS DE MOVIMIENTO de la MANADA VIVA alrededor del héroe = orientSpread(hero) = 1 − R, con R = longitud del VECTOR RESULTANTE MEDIO de los rumbos de MOVIMIENTO (headingIntent, unitarios, ABSOLUTOS/world-frame) de los mobs VIVOS CON rumbo en radio. orientBand: ≥hiSpread(0.62) ⇒ desbandada/rout ⇒ 2; ≥midSpread(0.30) ⇒ suelta ⇒ 1; <mid (unísono/marcha) ⇒ 0. Requiere ≥minMobs(3) con rumbo. ESCALA INTENSIVA (2º momento circular ⇒ invariante al conteo). Reusa headingIntent (server-auth, de la máquina de IA — NO e.vx/e.vy INERTES) pero SIN dotarlo con hero→mob (⊥#90) y AGREGADO como DISPERSIÓN inter-mob.
//     PRE-FLIGHT del eje RECOMENDADO pack TEMPORAL DENSITY (tasa de kills en ventana rodante / burst kill rate) → FALLA por ORTOGONALIDAD: = re-mapeo MONÓTONO del conteo de stacks de FRENZY (CAS-1773 kill-streak/momentum: kills dentro de window 3.0s ⇒ stacks con decay cada 0.6s) ⇒ NO ⊥ FRENZY; dominio temporal ya tocado por Erudición/CADENCE#67 ⇒ PIVOTE al ALTERNO del issue pack ORIENTATION SPREAD (dispersión circular de rumbos).
//     CRUX ⊥#90 HEADING (LIVE, vecino conceptual más próximo): #90 = rumbo de UNA víctima RELATIVO al héroe (dot m·u = carga/lateral/huye), MAX sobre el pack (1er momento/ALINEACIÓN-con-el-héroe); ORIENT = dispersión inter-mob de rumbos ABSOLUTOS (2º momento circular, hero-frame-INVARIANTE) ⇒ MISMO headingScore 2 (todos cargando) da orient0 (cargando desde un costado ⇒ rumbos alineados) O orient2 (cercando al héroe ⇒ rumbos opuestos). Media/alineación ⊥ varianza/dispersión.
//     CRUX ⊥#109 COLUMN (POSICIÓN vs MOVIMIENTO): columna marchando en unísono ⇒ column2/orient0; columna en desbandada ⇒ column2/orient2; blob en bloque ⇒ column0/orient0; blob en desbandada ⇒ column0/orient2 (4 cuadrantes). Posición ⊥ movimiento.
//     CRUX ⊥#108 FLANK (ángulo-de-POSICIÓN vs ángulo-de-VELOCIDAD): cluster a un lado con rumbos alineados ⇒ flank2/orient0; MISMO cluster con rumbos dispersos ⇒ flank2/orient2 (MISMO flank, orient OPUESTO); anillo con rumbos dispersos ⇒ flank0/orient2.
// (B) CANAL FRESCO = orientFind (fichas de desbandada por rematar en medio de una hueste con rumbos DISPERSOS — NINGUNA de las 51 flags lo usa; ⊥ columnFind #109/flankFind #108/disperseFind #107/headingFind #90/packFind #87). Moneda FRESCA (h.orientBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio orientBountyCap, 0 doble-dip.
//
// Run: node tools/cas2655-orient-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2658-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
const PI = Math.PI;
// spreadProbe LUT esperada: spread→banda→{tier,charge}. UMBRALES hiSpread 0.62 / midSpread 0.30, bordes exactos.
const EXPECT_SPREAD = [
  { spread: 0, w: 0, t: 0, s: 0 }, { spread: 0.29, w: 0, t: 0, s: 0 },   // <midSpread ⇒ unísono ⇒ 0 (borde 0.29 justo bajo)
  { spread: 0.30, w: 1, t: 1, s: 1 }, { spread: 0.61, w: 1, t: 1, s: 1 }, // ≥midSpread ⇒ suelta ⇒ 1 (bordes 0.30 inclusive / 0.61)
  { spread: 0.62, w: 2, t: 2, s: 2 }, { spread: 1.0, w: 2, t: 2, s: 2 },  // ≥hiSpread ⇒ desbandada ⇒ 2 (borde 0.62 inclusive)
];
// spawnOrient esperado por DISPERSIÓN DE RUMBOS. head en RAD = rumbo ABSOLUTO forzado (state=wander ⇒ headingIntent=cos/sin). Cubre bandas 0/1/2 + minMobs (rumbo-invariante a la posición).
const EXPECT_SPAWN = [
  { name: "unison", pts: [[60, 0, 0], [0, 60, 0], [-60, 0, 0]], spread: 0.000, w: 0 },                           // 3 mobs, TODOS rumbo este(0) ⇒ R=1 ⇒ S=0 ⇒ unísono ⇒ 0
  { name: "loose", pts: [[60, 0, 0], [0, 60, PI / 3], [-60, 0, 2 * PI / 3]], spread: 0.333, w: 1 },               // rumbos 0/60/120 ⇒ R=0.667 ⇒ S=0.333 ⇒ suelta ⇒ 1
  { name: "rout4", pts: [[60, 0, 0], [0, 60, PI / 2], [-60, 0, PI], [0, -60, 3 * PI / 2]], spread: 1.000, w: 2 }, // rumbos N/E/S/W ⇒ R=0 ⇒ S=1 ⇒ desbandada ⇒ 2
  { name: "rout3", pts: [[60, 0, 0], [0, 60, 2 * PI / 3], [-60, 0, 4 * PI / 3]], spread: 1.000, w: 2 },           // rumbos 0/120/240 ⇒ R=0 ⇒ S=1 ⇒ desbandada ⇒ 2
  { name: "twoHead", pts: [[60, 0, 0], [0, 60, PI]], spread: 0.000, w: 0 },                                       // 2 mobs con rumbo <minMobs(3) ⇒ dispersión indefinida ⇒ 0
  { name: "one", pts: [[60, 0, 0]], spread: 0.000, w: 0 },                                                        // 1 mob <minMobs ⇒ 0
  { name: "empty", pts: [], spread: 0.000, w: 0 },                                                                // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.orient && window.__dev.column && window.__dev.flank && window.__dev.disperse && window.__dev.packHarvest && window.__dev.heading && window.__dev.motley && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.orient + peer hooks (column/flank/disperse/packHarvest/heading/motley) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE fresh boot: enabled TRUE (52º flag LIVE) + STATELESS (orientBounty transitorio derivado ⇒ gExists false, empty-field score 0)
  const dark = await page.evaluate(() => window.__dev.orient());
  ok("2 LIVE (fresh boot): ORIENT_SURGE.enabled TRUE (52º flag LIVE) AND estado STATELESS (gExists false: orientBounty transitorio derivado; empty-field score/spread 0)",
     dark.enabled === true && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.spread === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "orientFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} spread=${dark.spread} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiSpread=${dark.hiSpread} midSpread=${dark.midSpread} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no orientFind/orientBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(orientFind|orientBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"orientBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'orientFind'/'orientBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.orient({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.orient({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ spreadProbe LUT: spread→band→tier→charge (UMBRALES hiSpread/midSpread + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.orient({ spreadProbe: { spread: c.spread } }).spreadProbe), EXPECT_SPREAD);
  const tabOK = EXPECT_SPREAD.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ spreadProbe LUT: S≥0.62⇒desbandada⇒2/T2; ≥0.30⇒suelta⇒1/T1; <0.30⇒unísono⇒0/T0 (UMBRAL hiSpread 0.62/midSpread 0.30, bordes 0.29/0.30/0.61/0.62 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ s: x.spread, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnOrient (wipe) inyecta mobs REALES con RUMBO ABSOLUTO forzado (state=wander + wx/wy); orientSpread = 1−R de los rumbos; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.orient({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" }));
      const sr = window.__dev.orient({ spawnOrient: { pts, wipe: true } }).spawnOrient;
      const live = window.__dev.orient({ orientProbeLive: true }).orientProbeLive;
      out.push({ name: c.name, srSpread: sr.spread, srScore: sr.score, liveSpread: live.spread, liveScore: live.score, liveR: live.R, mobCount: live.mobCount });
    }
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srSpread - c.spread) < 0.02 && Math.abs(comp[i].liveSpread - c.spread) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnOrient empuja mobs REALES con rumbo forzado; orientSpread = 1−R ⇒ unísono⇒S0/0, 0/60/120⇒S0.333/1, N-E-S-W⇒S1/2, 0/120/240⇒S1/2, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 7 ★ ⊥#90 HEADING crux (vecino conceptual): MISMO headingScore (todos cargando ⇒ 2) da orient DISTINTO según la GEOMETRÍA. Media/alineación-con-el-héroe ⊥ dispersión-inter-mob.
  const crux90 = await page.evaluate((args) => {
    const { Z, PI } = args;
    window.__dev.orient({ enabled: true });   // heading ya es LIVE (#90 enabled:true)
    const read = (pts) => { window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.orient({ spawnOrient: { pts: pts.map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });
      return { orient: window.__dev.orient().score, spread: window.__dev.orient().spread, heading: window.__dev.heading().score }; };
    // TODOS al ESTE del héroe, rumbo OESTE (cargando hacia el héroe) ⇒ rumbos ALINEADOS (orient0) + cada uno carga (heading2)
    const allChargeOneSide = read([[100, -30, PI], [120, 0, PI], [100, 30, PI]]);
    // TODOS al ESTE, rumbo ESTE (huyendo del héroe) ⇒ rumbos ALINEADOS (orient0) + cada uno huye (heading0) — MISMO orient, heading OPUESTO
    const alignedFlee = read([[100, -30, 0], [120, 0, 0], [100, 30, 0]]);
    // CERCANDO al héroe (N/E/S/W), cada uno rumbo HACIA el héroe ⇒ rumbos OPUESTOS (orient2) + cada uno carga (heading2) — MISMO heading que #1, orient OPUESTO
    const surroundCharge = read([[120, 0, PI], [-120, 0, 0], [0, 120, -PI / 2], [0, -120, PI / 2]]);
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    return { allChargeOneSide, alignedFlee, surroundCharge };
  }, { Z, PI });
  const crux90OK = crux90.allChargeOneSide.orient === 0 && crux90.allChargeOneSide.heading === 2
    && crux90.alignedFlee.orient === 0 && crux90.alignedFlee.heading === 0
    && crux90.surroundCharge.orient === 2 && crux90.surroundCharge.heading === 2;
  ok("7 ★ ⊥#90 crux (vecino conceptual): CARGA-desde-un-costado ⇒ ORIENT 0/HEADING 2; ALINEADOS-huyendo ⇒ ORIENT 0/HEADING 0 (MISMO orient, heading OPUESTO); CERCANDO-cargando ⇒ ORIENT 2/HEADING 2 (MISMO heading que #1, orient OPUESTO) ⇒ ALINEACIÓN-con-el-héroe (#90, 1er momento) ⊥ DISPERSIÓN-inter-mob (ORIENT, 2º momento) — INDEPENDIENTE",
     crux90OK, JSON.stringify(crux90));

  // 8 ★ ⊥#109 COLUMN crux (vecino más próximo por número de flag): POSICIÓN (forma) ⊥ MOVIMIENTO (rumbo). Los 4 cuadrantes.
  const crux109 = await page.evaluate((args) => {
    const { Z, PI } = args;
    window.__dev.orient({ enabled: true });   // column ya es LIVE (#109 enabled:true)
    const read = (pts) => { window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.orient({ spawnOrient: { pts: pts.map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });
      return { column: window.__dev.column().score, elong: window.__dev.column().elong, orient: window.__dev.orient().score, spread: window.__dev.orient().spread }; };
    // COLUMNA colineal (posiciones) marchando en UNÍSONO (rumbo este) ⇒ column2/orient0
    const columnUnison = read([[100, 0, 0], [150, 0, 0], [220, 0, 0]]);
    // MISMA COLUMNA colineal, rumbos DISPERSOS (0/120/240) ⇒ column2/orient2
    const columnRout = read([[100, 0, 0], [150, 0, 2 * PI / 3], [220, 0, 4 * PI / 3]]);
    // BLOB redondo (4 cardinales), TODOS rumbo este ⇒ column0/orient0
    const blobUnison = read([[100, 0, 0], [-100, 0, 0], [0, 100, 0], [0, -100, 0]]);
    // BLOB redondo, rumbos DISPERSOS (N/E/S/W) ⇒ column0/orient2
    const blobRout = read([[100, 0, 0], [-100, 0, PI / 2], [0, 100, PI], [0, -100, 3 * PI / 2]]);
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    return { columnUnison, columnRout, blobUnison, blobRout };
  }, { Z, PI });
  const crux109OK = crux109.columnUnison.column === 2 && crux109.columnUnison.orient === 0
    && crux109.columnRout.column === 2 && crux109.columnRout.orient === 2
    && crux109.blobUnison.column === 0 && crux109.blobUnison.orient === 0
    && crux109.blobRout.column === 0 && crux109.blobRout.orient === 2;
  ok("8 ★ ⊥#109 crux (vecino más próximo): COLUMNA-unísono ⇒ COLUMN 2/ORIENT 0; COLUMNA-desbandada ⇒ COLUMN 2/ORIENT 2; BLOB-unísono ⇒ COLUMN 0/ORIENT 0; BLOB-desbandada ⇒ COLUMN 0/ORIENT 2 ⇒ POSICIÓN (forma) ⊥ MOVIMIENTO (rumbo) — LOS 4 CUADRANTES (INDEPENDIENTES)",
     crux109OK, JSON.stringify(crux109));

  // 9 ★ ⊥#108 FLANK crux: ángulo-de-POSICIÓN (dónde ESTÁN) ⊥ ángulo-de-VELOCIDAD (cómo se MUEVEN). MISMO flank, orient distinto.
  const crux108 = await page.evaluate((args) => {
    const { Z, PI } = args;
    window.__dev.orient({ enabled: true });   // flank ya es LIVE (#108 enabled:true)
    const read = (pts) => { window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.orient({ spawnOrient: { pts: pts.map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });
      return { flank: window.__dev.flank().score, conc: window.__dev.flank().conc, orient: window.__dev.orient().score, spread: window.__dev.orient().spread }; };
    // CLUSTER a un lado (este), rumbos ALINEADOS (este) ⇒ flank2 (posiciones amasadas)/orient0 (rumbos alineados)
    const clusterUnison = read([[100, -30, 0], [120, 0, 0], [100, 30, 0]]);
    // MISMO cluster (posiciones), rumbos DISPERSOS (0/120/240) ⇒ flank2/orient2 (MISMO flank, orient OPUESTO)
    const clusterRout = read([[100, -30, 0], [120, 0, 2 * PI / 3], [100, 30, 4 * PI / 3]]);
    // ANILLO alrededor del héroe (N/E/S/W), rumbos DISPERSOS ⇒ flank0/orient2
    const ringRout = read([[100, 0, 0], [-100, 0, PI / 2], [0, 100, PI], [0, -100, 3 * PI / 2]]);
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    return { clusterUnison, clusterRout, ringRout };
  }, { Z, PI });
  const crux108OK = crux108.clusterUnison.flank === 2 && crux108.clusterUnison.orient === 0
    && crux108.clusterRout.flank === 2 && crux108.clusterRout.orient === 2
    && crux108.ringRout.flank === 0 && crux108.ringRout.orient === 2;
  ok("9 ★ ⊥#108 crux: CLUSTER-unísono ⇒ FLANK 2/ORIENT 0; MISMO CLUSTER-desbandada ⇒ FLANK 2/ORIENT 2 (MISMO flank, orient OPUESTO); ANILLO-desbandada ⇒ FLANK 0/ORIENT 2 ⇒ ángulo-de-POSICIÓN ⊥ ángulo-de-VELOCIDAD",
     crux108OK, JSON.stringify(crux108));

  // 10 CANAL orientFind: forageChargePreview con desbandada >0 ; con unísono → 0
  const forage = await page.evaluate((args) => {
    const { Z, PI } = args;
    window.__dev.orient({ enabled: true });
    window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orient({ spawnOrient: { pts: [[60, 0, 0], [0, 60, 2 * PI / 3], [-60, 0, 4 * PI / 3]].map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });  // rout ⇒ score2 ⇒ T2
    const actVm = window.__dev.orient();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.orient({ spawnOrient: { pts: [[60, 0, 0], [0, 60, 0], [-60, 0, 0]].map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });  // unison ⇒ score0
    const goVm = window.__dev.orient();
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PI });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL orientFind: forageChargePreview con desbandada ⇒ charge>0 (==orientBonus); con unísono ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds orientBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 1.0; s += 0.05) vals.push(window.__dev.orient({ spreadProbe: { spread: s } }).spreadProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.orient().cap };
  });
  ok("11 ★ SUB-CAP: ninguna dispersión produce charge>orientBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a rout available
  const neutral = await page.evaluate((args) => {
    const { Z, PI } = args;
    window.__dev.orient({ enabled: true });
    window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orient({ spawnOrient: { pts: [[60, 0, 0], [0, 60, 2 * PI / 3], [-60, 0, 4 * PI / 3]].map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });  // desbandada disponible
    window.__dev.orient({ enabled: false });                             // now OFF
    const off = window.__dev.orient();
    window.__dev.orient({ enabled: true }); window.__dev.orient({ spawnOrient: { pts: [], wipe: true } }); window.__dev.orient({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, spread: off.spread };
  }, { Z, PI });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.spread === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, orientBonus(desbandada disponible)==0 + forageChargePreview==0 + spread==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip orient OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling column/flank/heading/disperse/packHarvest no cambia la señal de orient.
  const orth = await page.evaluate((args) => {
    const { Z, PI } = args;
    window.__dev.orient({ enabled: true });
    window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orient({ spawnOrient: { pts: [[60, 0, 0], [0, 60, 2 * PI / 3], [-60, 0, 4 * PI / 3]].map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });
    window.__dev.orient({ enabled: false });
    const snap = () => JSON.stringify({ column: window.__dev.column(), disperse: window.__dev.disperse(), heading: window.__dev.heading() });
    const peersOff = snap();
    window.__dev.orient({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.orient();
    const clPrev = window.__dev.column().enabled, dpPrev = window.__dev.disperse().enabled, hdPrev = window.__dev.heading().enabled, pkPrev = window.__dev.packHarvest().enabled;
    window.__dev.disperse({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.orient();
    const clAfter = window.__dev.column().enabled, hdAfter = window.__dev.heading().enabled, pkAfter = window.__dev.packHarvest().enabled;
    window.__dev.disperse({ enabled: dpPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.spread - afterArc.spread) < 0.001;
    return { peersUnchanged, sigUnchanged, clAfter, hdAfter, pkAfter };
  }, { Z, PI });
  ok("13 ★ ORTOGONALIDAD orientFind ⊥ peers: flip orient OFF→ON NO cambia column/disperse/heading; toggling DISPERSE #107/PACKHARVEST #87 NO cambia la señal de orient; column #109/heading #90 LIVE intactos",
     orth.peersUnchanged && orth.sigUnchanged && orth.clAfter === true && orth.hdAfter === true && orth.pkAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 51 arc flags served true + ORIENT_SURGE served true (LIVE #110) ⇒ 52 flags served true off=[]
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const orientLive = flag("ORIENT_SURGE") === "true";
  ok("14 ★ 0-REGRESIÓN: 51 mecanismos del arco #59-#109 served enabled:true; ORIENT_SURGE served TRUE (LIVE #110, 52º flag) ⇒ 52 flags served true off=[]",
     arcAllOn && orientLive && arc.length === 51, `orient=${flag("ORIENT_SURGE")} arcAllOn=${arcAllOn} n=${arc.length + 1} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true").concat(orientLive ? [] : [["ORIENT_SURGE", flag("ORIENT_SURGE")]]))}`);

  // 15 render badge "Desbandada:" drawn ON+rout / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, PI } = args;
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Desbandada:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.orient({ enabled: true });
    window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orient({ spawnOrient: { pts: [[60, 0, 0], [0, 60, 2 * PI / 3], [-60, 0, 4 * PI / 3]].map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });  // rout ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z, PI });
  ok("15 render badge \"Desbandada:\" se DIBUJA ON+desbandada (spread>0) y NO OFF (spread 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PI } = args; window.__dev.orient({ enabled: true }); window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.orient({ spawnOrient: { pts: [[100, 0, 0], [150, 0, 2 * PI / 3], [220, 0, 4 * PI / 3], [180, 40, PI / 2], [130, -40, PI]].map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } }); }, { Z, PI });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.orient({ spawnOrient: { pts: [], wipe: true } }); window.__dev.orient({ enabled: false }); });

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
    const { Z, FPARG, PI } = args;
    window.__dev.orient({ enabled: true });
    window.__dev.orient({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orient({ spawnOrient: { pts: [[60, 0, 0], [0, 60, 2 * PI / 3], [-60, 0, 4 * PI / 3]].map(([dx, dy, head]) => ({ dx, dy, head, type: "rat" })), wipe: true } });
    const vm = window.__dev.orient();
    const lut = [0, 0.30, 0.62, 1.0].map(s => { const p = window.__dev.orient({ spreadProbe: { spread: s } }).spreadProbe; return { spread: s, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.orient({ orientProbeLive: true }).orientProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.orient({ spawnOrient: { pts: [], wipe: true } });
    window.__dev.orient({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spread: vm.spread, liveSpread: live.spread, liveScore: live.score, liveR: live.R, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG, PI });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spread === B.spread && A.liveSpread === B.liveSpread && A.liveScore === B.liveScore && A.liveR === B.liveR && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA desbandada (3 mobs rumbos 0/120/240)+héroe ⇒ score/tier/charge/spread + orientProbeLive(spread,R,score) + spreadProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},spread:${A.spread},liveSpread:${A.liveSpread},liveR:${A.liveR},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},spread:${B.spread},liveSpread:${B.liveSpread},liveR:${B.liveR},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.orient({ enabled: false }));
  await pageB.evaluate(() => window.__dev.orient({ enabled: false }));

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
