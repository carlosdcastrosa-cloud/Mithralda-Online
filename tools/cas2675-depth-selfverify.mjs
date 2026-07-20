// CAS-2675 — self-verify for REMATE DE FONDO (DARK, DEPTH_SURGE.enabled:false). EVO mecánica #114 (serializa tras #113 ENCIRCLE_SURGE LIVE&served 666986da9605/815, base HEAD 88c0166) — EJE FRESCO + CANAL FRESCO, ⊥ a las 55 LIVE #59-#113.
// (A) EJE FRESCO = ESTRUCTURAL/GEOMÉTRICO/RADIAL PROFUNDIDAD / CV DE DISTANCIAS-AL-HÉROE de la MANADA VIVA alrededor del héroe = depthField(hero) = CV = stddev/media de las DISTANCIAS d_i=|e−h|=√((e.x−h.x)²+(e.y−h.y)²) de los mobs VIVOS en radio (la MISMA fuente de POSICIÓN que #108 FLANK / #113 ENCIRCLE usan para su ÁNGULO, pero la MAGNITUD RADIAL, NO e.vx/e.vy INERTES). depthBand: ≥hiCV(0.50) ⇒ profunda/columna-cerca+lejos ⇒ 2; ≥midCV(0.25) ⇒ escalonada ⇒ 1; <mid (anillo delgado uniforme) ⇒ 0. Requiere ≥minMobs(3). ESCALA INTENSIVA/ADIMENSIONAL (invariante al conteo Y a la escala absoluta: anillo grande y pequeño ⇒ MISMO CV).
//     PRE-FLIGHT del eje RECOMENDADO pack RADIAL DEPTH → PASA sin pivote (los 3 criterios): (a) la distancia hero→mob por mob EXISTE server-auth (√ de las POSICIONES replicadas, LA MISMA fuente que #108 FLANK/#113 ENCIRCLE); (b) CV∈[0,∞) band-able con midCV/hiCV; (c) ⊥ vecinos POSICIONALES (radial-magnitud ⊥ angular).
//     CRUX ⊥#107 DISPERSE (spread radial px ABSOLUTO alrededor del CENTROIDE): anillo GRANDE ⇒ disperse2/depth0; columna corta cerca+lejos ⇒ disperse0/depth2 (OPUESTOS EN AMBOS EJES). CRUX ⊥#109 COLUMN (forma/elongación hero-AGNÓSTICA): columna RADIAL ⇒ column2/depth2; TANGENCIAL ⇒ column2/depth0 (MISMA elongación OPUESTO depth); anillo ⇒ column0/depth0; nube isótropa a radios dispares ⇒ column0/depth2 (4 cuadrantes). CRUX ⊥#113 ENCIRCLE (cobertura ANGULAR): anillo delgado uniforme ⇒ encircle2/depth0; columna radial ⇒ encircle0/depth2 (OPUESTOS).
// (B) CANAL FRESCO = depthFind (fichas de fondo por rematar con la manada ESCALONADA EN PROFUNDIDAD — NINGUNA de las 55 flags lo usa; ⊥ disperseFind #107/encircleFind #113/columnFind #109/convergeFind #112). Moneda FRESCA (h.depthBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio depthBountyCap, 0 doble-dip.
//
// Run: node tools/cas2675-depth-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2675");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// cvProbe LUT esperada: cv→banda→{tier,charge}. UMBRALES hiCV 0.50 / midCV 0.25, bordes exactos.
const EXPECT_CV = [
  { cv: 0, w: 0, t: 0, s: 0 }, { cv: 0.24, w: 0, t: 0, s: 0 },                     // <midCV (anillo delgado) ⇒ 0
  { cv: 0.25, w: 1, t: 1, s: 1 }, { cv: 0.49, w: 1, t: 1, s: 1 },                  // ≥midCV ⇒ escalonada ⇒ 1 (borde 0.25 inclusive)
  { cv: 0.50, w: 2, t: 2, s: 2 }, { cv: 1.0, w: 2, t: 2, s: 2 },                   // ≥hiCV ⇒ profunda ⇒ 2 (borde 0.50 inclusive)
];
// spawnDepth esperado por PROFUNDIDAD. CV=stddev/media de las distancias hero→mob. Cubre bandas 0/1/2 + minMobs. Posiciones (dx,dy) px del héroe ⇒ distancia = |(dx,dy)|.
const EXPECT_SPAWN = [
  { name: "ring4", pts: [[150, 0], [-150, 0], [0, 150], [0, -150]], cv: 0.000, w: 0 },      // anillo delgado uniforme (todos r=150) ⇒ CV 0 ⇒ 0
  { name: "layered", pts: [[80, 0], [150, 0], [220, 0]], cv: 0.381, w: 1 },                 // columna escalonada moderada {80,150,220} ⇒ CV 0.381 ⇒ 1
  { name: "deep", pts: [[40, 0], [160, 0], [300, 0]], cv: 0.637, w: 2 },                    // columna profunda cerca+lejos {40,160,300} ⇒ CV 0.637 ⇒ 2
  { name: "tightRing", pts: [[145, 0], [-155, 0], [0, 150]], cv: 0.027, w: 0 },             // distancias casi iguales {145,155,150} pero ANGULARMENTE repartidas ⇒ CV 0.027 ⇒ 0 (⊥ encircle: cerco pero fondo plano)
  { name: "twoMobs", pts: [[120, 0], [-120, 0]], cv: 0.000, w: 0 },                         // 2 mobs <minMobs(3) ⇒ indefinido ⇒ 0
  { name: "empty", pts: [], cv: 0.000, w: 0 },                                             // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.depth && window.__dev.column && window.__dev.disperse && window.__dev.encircle && window.__dev.flank && window.__dev.motley && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.depth + peer hooks (column/disperse/encircle/flank/motley/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.depth());
  ok("2 byte-id OFF (fresh boot): DEPTH_SURGE.enabled false AND G.depthBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.cv === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "depthFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} cv=${dark.cv} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCV=${dark.hiCV} midCV=${dark.midCV} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no depthFind/depthBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(depthFind|depthBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"depthBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'depthFind'/'depthBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.depth({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.depth({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ cvProbe LUT: cv→band→tier→charge (UMBRALES hiCV/midCV + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.depth({ cvProbe: { cv: c.cv } }).cvProbe), EXPECT_CV);
  const tabOK = EXPECT_CV.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ cvProbe LUT: CV≥0.50⇒profunda⇒2/T2; ≥0.25⇒escalonada⇒1/T1; <0.25 (anillo delgado)⇒0/T0 (UMBRAL hiCV 0.50/midCV 0.25, bordes 0/0.24/0.25/0.49/0.50/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ cv: x.cv, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnDepth (wipe) inyecta mobs REALES en offsets px; depthField = CV; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.depth({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy]) => ({ dx, dy, type: "rat" }));
      const sr = window.__dev.depth({ spawnDepth: { pts, wipe: true } }).spawnDepth;
      const live = window.__dev.depth({ depthProbeLive: true }).depthProbeLive;
      out.push({ name: c.name, srCV: sr.cv, srScore: sr.score, liveCV: live.cv, liveScore: live.score, mean: live.mean, std: live.std, mobCount: live.mobCount });
    }
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srCV - c.cv) < 0.02 && Math.abs(comp[i].liveCV - c.cv) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnDepth empuja mobs REALES; depthField = CV de distancias ⇒ anillo-delgado⇒CV0/0, escalonada⇒CV0.38/1, profunda⇒CV0.64/2, anillo-angular⇒CV0.03/0, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#109 COLUMN crux (4 cuadrantes): forma-de-POSICIONES hero-AGNÓSTICA ⊥ profundidad-RADIAL-desde-el-héroe.
  const crux109 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.depth({ enabled: true });   // column ya es LIVE (#109 enabled:true)
    const read = (pts) => { window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.depth({ spawnDepth: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { depth: window.__dev.depth().score, cv: window.__dev.depth().cv, column: window.__dev.column().score, elong: window.__dev.column().elong }; };
    const radialCol = read([[40, 0], [160, 0], [300, 0]]);                   // columna RADIAL (apunta al héroe) ⇒ column2/depth2
    const tangentCol = read([[200, -80], [200, 0], [200, 80]]);             // columna TANGENCIAL (a ~igual distancia) ⇒ column2/depth0 — MISMA elongación OPUESTO depth
    const ring = read([[150, 0], [-150, 0], [0, 150], [0, -150]]);          // anillo isótropo ⇒ column0/depth0
    const crossDepth = read([[40, 0], [-280, 0], [0, 50], [0, -280]]);      // pares cerca+lejos en ejes perpendiculares (isótropo en ángulo, radios dispares) ⇒ column0/depth2
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    return { radialCol, tangentCol, ring, crossDepth };
  }, { Z });
  const crux109OK = crux109.radialCol.column === 2 && crux109.radialCol.depth === 2
    && crux109.tangentCol.column === 2 && crux109.tangentCol.depth === 0
    && crux109.ring.column === 0 && crux109.ring.depth === 0
    && crux109.crossDepth.column === 0 && crux109.crossDepth.depth === 2;
  ok("6 ★ ⊥#109 COLUMN crux (4 cuadrantes): RADIAL ⇒ COLUMN 2/DEPTH 2; TANGENCIAL ⇒ COLUMN 2/DEPTH 0 (MISMA elongación OPUESTO depth); ANILLO ⇒ COLUMN 0/DEPTH 0; NUBE-RADIOS-DISPARES ⇒ COLUMN 0/DEPTH 2 ⇒ forma-de-posiciones ⊥ profundidad-radial (componentes INDEPENDIENTES)",
     crux109OK, JSON.stringify(crux109));

  // 7 ★ ⊥#107 DISPERSE crux: spread-radial-px-ABSOLUTO-alrededor-del-CENTROIDE ⊥ CV-ADIMENSIONAL-de-DISTANCIA-AL-HÉROE.
  const crux107 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.depth({ enabled: true });   // disperse ya es LIVE (#107 enabled:true)
    const read = (pts) => { window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.depth({ spawnDepth: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { depth: window.__dev.depth().score, cv: window.__dev.depth().cv, disperse: window.__dev.disperse().score, spread: window.__dev.disperse().spread }; };
    const bigRing = read([[250, 0], [-250, 0], [0, 250], [0, -250]]);       // anillo GRANDE uniforme ⇒ disperse2 (spread≈250)/depth0 (CV 0)
    const smallDeep = read([[15, 0], [45, 0], [85, 0]]);                    // columna corta cerca+lejos ⇒ disperse0 (spread pequeño)/depth2 (CV alto)
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    return { bigRing, smallDeep };
  }, { Z });
  const crux107OK = crux107.bigRing.disperse === 2 && crux107.bigRing.depth === 0
    && crux107.smallDeep.disperse === 0 && crux107.smallDeep.depth === 2;
  ok("7 ★ ⊥#107 DISPERSE crux (OPUESTOS EN AMBOS EJES): ANILLO-GRANDE ⇒ DISPERSE 2 (spread px alto)/DEPTH 0 (CV 0); COLUMNA-CORTA-CERCA+LEJOS ⇒ DISPERSE 0 (spread px bajo)/DEPTH 2 (CV alto) ⇒ spread-px-ABSOLUTO-al-CENTROIDE ⊥ CV-ADIMENSIONAL-al-HÉROE",
     crux107OK, JSON.stringify(crux107));

  // 8 ★ ⊥#113 ENCIRCLE crux: cobertura ANGULAR ⊥ profundidad RADIAL (misma fuente de POSICIÓN, estadística distinta).
  const crux113 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.depth({ enabled: true });   // encircle ya es LIVE (#113 enabled:true)
    const read = (pts) => { window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.depth({ spawnDepth: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { depth: window.__dev.depth().score, encircle: window.__dev.encircle().score, cover: window.__dev.encircle().cover }; };
    const ring = read([[150, 0], [-150, 0], [0, 150], [0, -150]]);          // anillo delgado uniforme ⇒ encircle2 (K0.75)/depth0 (CV0)
    const radialCol = read([[40, 0], [160, 0], [300, 0]]);                  // columna radial (un solo arco) ⇒ encircle0 (K≈0)/depth2 (CV alto)
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    return { ring, radialCol };
  }, { Z });
  const crux113OK = crux113.ring.encircle === 2 && crux113.ring.depth === 0
    && crux113.radialCol.encircle === 0 && crux113.radialCol.depth === 2;
  ok("8 ★ ⊥#113 ENCIRCLE crux (ángulo ⊥ distancia — MISMAS posiciones, estadística DISTINTA): ANILLO-DELGADO-UNIFORME ⇒ ENCIRCLE 2 (cerco)/DEPTH 0 (fondo plano); COLUMNA-RADIAL ⇒ ENCIRCLE 0 (un arco)/DEPTH 2 (escalonada) ⇒ cobertura-ANGULAR ⊥ profundidad-RADIAL",
     crux113OK, JSON.stringify(crux113));

  // 9 ★ ESCALA-INVARIANCIA (INTENSIVO/ADIMENSIONAL): columna GRANDE vs PEQUEÑA con la MISMA RAZÓN ⇒ MISMO CV (CV adimensional) ⊥ #107 DISPERSE (spread px).
  const scaleInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.depth({ enabled: true });
    const read = (pts) => { window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.depth({ spawnDepth: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { cv: window.__dev.depth().cv, score: window.__dev.depth().score }; };
    const big = read([[60, 0], [120, 0], [240, 0]]);                        // columna GRANDE (60:120:240 = 1:2:4)
    const small = read([[15, 0], [30, 0], [60, 0]]);                        // columna PEQUEÑA (15:30:60 = 1:2:4) — MISMA razón
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    return { big, small };
  }, { Z });
  const scaleInvOK = Math.abs(scaleInv.big.cv - scaleInv.small.cv) < 0.001 && scaleInv.big.score === 2 && scaleInv.small.score === 2;
  ok("9 ★ ESCALA-INVARIANCIA: columna GRANDE (1:2:4 en px grandes) vs PEQUEÑA (1:2:4 en px chicos) ⇒ MISMO CV y score 2 (CV adimensional/INTENSIVO, invariante a la escala absoluta) ⊥ #107 DISPERSE (spread px)",
     scaleInvOK, JSON.stringify(scaleInv));

  // 10 CANAL depthFind: forageChargePreview con fondo >0 ; con anillo delgado → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.depth({ enabled: true });
    window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.depth({ spawnDepth: { pts: [[40, 0], [160, 0], [300, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // profunda ⇒ score2 ⇒ T2
    const actVm = window.__dev.depth();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.depth({ spawnDepth: { pts: [[150, 0], [-150, 0], [0, 150], [0, -150]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // anillo delgado ⇒ score0
    const goVm = window.__dev.depth();
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL depthFind: forageChargePreview con fondo ⇒ charge>0 (==depthBonus); con anillo delgado uniforme ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds depthBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let cv = 0; cv <= 2.001; cv += 0.1) vals.push(window.__dev.depth({ cvProbe: { cv } }).cvProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.depth().cap };
  });
  ok("11 ★ SUB-CAP: ningún CV produce charge>depthBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a fondo available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.depth({ enabled: true });
    window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.depth({ spawnDepth: { pts: [[40, 0], [160, 0], [300, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // fondo disponible
    window.__dev.depth({ enabled: false });                             // now OFF
    const off = window.__dev.depth();
    window.__dev.depth({ enabled: true }); window.__dev.depth({ spawnDepth: { pts: [], wipe: true } }); window.__dev.depth({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, cv: off.cv };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.cv === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, depthBonus(fondo disponible)==0 + forageChargePreview==0 + cv==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip depth OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling motley/packHarvest no cambia la señal de depth.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.depth({ enabled: true });
    window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.depth({ spawnDepth: { pts: [[40, 0], [160, 0], [300, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    window.__dev.depth({ enabled: false });
    const snap = () => JSON.stringify({ column: window.__dev.column(), disperse: window.__dev.disperse(), encircle: window.__dev.encircle(), flank: window.__dev.flank() });
    const peersOff = snap();
    window.__dev.depth({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.depth();
    const mtPrev = window.__dev.motley().enabled, pkPrev = window.__dev.packHarvest().enabled, clPrev = window.__dev.column().enabled, dsPrev = window.__dev.disperse().enabled;
    window.__dev.motley({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.depth();
    const clAfter = window.__dev.column().enabled, dsAfter = window.__dev.disperse().enabled;
    window.__dev.motley({ enabled: mtPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.cv - afterArc.cv) < 0.001;
    return { peersUnchanged, sigUnchanged, clAfter, dsAfter };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD depthFind ⊥ peers: flip depth OFF→ON NO cambia column/disperse/encircle/flank; toggling MOTLEY #106/PACKHARVEST #87 NO cambia la señal de depth; column #109/disperse #107 LIVE intactos",
     orth.peersUnchanged && orth.sigUnchanged && orth.clAfter === true && orth.dsAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 55 arc flags served true; DEPTH_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const depthDark = flag("DEPTH_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 55 mecanismos del arco #59-#113 served enabled:true; DEPTH_SURGE served false (DARK #114)",
     arcAllOn && depthDark && arc.length === 55, `depth=${flag("DEPTH_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Fondo:" drawn ON+fondo / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Fondo:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.depth({ enabled: true });
    window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.depth({ spawnDepth: { pts: [[40, 0], [160, 0], [300, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // profunda ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z });
  ok("15 render badge \"Fondo:\" se DIBUJA ON+fondo (CV>0) y NO OFF (CV 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.depth({ enabled: true }); window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.depth({ spawnDepth: { pts: [[40, 0], [120, 0], [220, 0], [300, 0], [30, 30], [-40, 260]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } }); }, { Z });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.depth({ spawnDepth: { pts: [], wipe: true } }); window.__dev.depth({ enabled: false }); });

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
    window.__dev.depth({ enabled: true });
    window.__dev.depth({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.depth({ spawnDepth: { pts: [[40, 0], [160, 0], [300, 0], [90, 20]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    const vm = window.__dev.depth();
    const lut = [0, 0.25, 0.50, 1.0].map(cv => { const p = window.__dev.depth({ cvProbe: { cv } }).cvProbe; return { cv, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.depth({ depthProbeLive: true }).depthProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.depth({ spawnDepth: { pts: [], wipe: true } });
    window.__dev.depth({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, cv: vm.cv, liveCV: live.cv, liveScore: live.score, mean: live.mean, std: live.std, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.cv === B.cv && A.liveCV === B.liveCV && A.liveScore === B.liveScore && A.mean === B.mean && A.std === B.std && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (columna profunda + 1 cercano)+héroe ⇒ score/tier/charge/cv + depthProbeLive(cv,mean,std,score) + cvProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},cv:${A.cv},liveCV:${A.liveCV},mean:${A.mean},std:${A.std},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},cv:${B.cv},liveCV:${B.liveCV},mean:${B.mean},std:${B.std},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.depth({ enabled: false }));
  await pageB.evaluate(() => window.__dev.depth({ enabled: false }));

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
