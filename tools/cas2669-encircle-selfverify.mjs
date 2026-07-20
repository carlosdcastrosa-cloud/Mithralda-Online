// CAS-2669 — self-verify for REMATE DE CERCO (DARK, ENCIRCLE_SURGE.enabled:false). EVO mecánica #113 (serializa tras #112 CONVERGE_SURGE LIVE&served d96456bddb01/815, base HEAD 145cde7) — EJE FRESCO + CANAL FRESCO, ⊥ a las 54 LIVE #59-#112.
// (A) EJE FRESCO = ESTRUCTURAL/GEOMÉTRICO COBERTURA ANGULAR / MAYOR-HUECO de la MANADA VIVA alrededor del héroe = encircleField(hero) = COBERTURA K = 1 − (mayorHueco/2π) de los RUMBOS hero→mob (atan2 de e.y−h.y, e.x−h.x — LA MISMA fuente de RUMBO que #108 FLANK, NO e.vx/e.vy INERTES) de los mobs VIVOS en radio. mayorHueco = el MAYOR arco vacío entre rumbos CONSECUTIVOS (ordenados, circular, incluye el wrap). encircleBand: ≥hiCover(0.75) ⇒ cerco/anillo ⇒ 2; ≥midCover(0.50) ⇒ semi-cercado/leaning ⇒ 1; <mid (amontonados en un costado) ⇒ 0. Requiere ≥minMobs(3) con rumbo. ESCALA INTENSIVA (invariante al conteo Y a la escala radial).
//     PRE-FLIGHT del eje RECOMENDADO pack ENCIRCLEMENT → PASA sin pivote (los 3 criterios): (a) el rumbo hero→mob por mob EXISTE server-auth (atan2 de las POSICIONES replicadas, LA MISMA fuente que #108 FLANK usa para su resultante); (b) K∈[0,1) band-able con midCover/hiCover; (c) ⊥ vecino más próximo #108 FLANK.
//     CRUX ⊥#108 FLANK (MISMOS rumbos, estadística DISTINTA): FLANK = LONGITUD RESULTANTE R (CONCENTRACIÓN en UN arco); ENCIRCLE = COBERTURA-DE-HUECO K (REPARTO/gap) ⇒ ANILLO UNIFORME ⇒ flank0(R≈0)/encircle2(K alto, OPUESTOS); CÚMULO en un flanco ⇒ flank2(R≈1)/encircle0(K≈0, OPUESTOS); DOS cúmulos opuestos ⇒ flank0(R cancela)/encircle1; arco ancho ⇒ flank1/encircle0. 🔑 ENCIRCLE NO es función de R: TRES config con R=0 dan K distinto (cruz-4 K0.75/triángulo-3 K0.667/par-opuesto K0.5).
// (B) CANAL FRESCO = encircleFind (fichas de cerco por rematar RODEADO POR TODOS LOS FLANCOS — NINGUNA de las 54 flags lo usa; ⊥ flankFind #108/convergeFind #112/orientFind #110/columnFind #109). Moneda FRESCA (h.encircleBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio encircleBountyCap, 0 doble-dip.
//
// Run: node tools/cas2669-encircle-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2669");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// coverProbe LUT esperada: cover→banda→{tier,charge}. UMBRALES hiCover 0.75 / midCover 0.50, bordes exactos.
const EXPECT_COVER = [
  { cover: 0, w: 0, t: 0, s: 0 }, { cover: 0.49, w: 0, t: 0, s: 0 },                 // <midCover (amontonados) ⇒ 0
  { cover: 0.50, w: 1, t: 1, s: 1 }, { cover: 0.74, w: 1, t: 1, s: 1 },              // ≥midCover ⇒ semi-cercado ⇒ 1 (borde 0.50 inclusive)
  { cover: 0.75, w: 2, t: 2, s: 2 }, { cover: 1.0, w: 2, t: 2, s: 2 },               // ≥hiCover ⇒ cerco ⇒ 2 (borde 0.75 inclusive)
];
// spawnEncircle esperado por COBERTURA. K=1−mayorHueco/2π. Cubre bandas 0/1/2 + minMobs. Posiciones (dx,dy) px del héroe ⇒ atan2 = rumbo.
const EXPECT_SPAWN = [
  { name: "ring4", pts: [[120, 0], [-120, 0], [0, 120], [0, -120]], cover: 0.750, w: 2 },                 // cruz N/E/S/W ⇒ mayorHueco 90° ⇒ K=0.75 ⇒ cerco ⇒ 2
  { name: "triangle3", pts: [[120, 0], [-60, 104], [-60, -104]], cover: 0.667, w: 1 },                    // triángulo 120° ⇒ mayorHueco 120° ⇒ K=0.667 ⇒ semi ⇒ 1
  { name: "halfRing", pts: [[0, -120], [120, 0], [0, 120]], cover: 0.500, w: 1 },                         // semicírculo este (E/N/S, hueco oeste 180°) ⇒ K=0.50 ⇒ semi ⇒ 1
  { name: "twoOpp", pts: [[0, -120], [15, -118], [0, 120], [15, 118]], cover: 0.500, w: 1 },              // dos cúmulos opuestos (N+S) ⇒ mayorHueco 180° ⇒ K=0.50 ⇒ 1
  { name: "cluster", pts: [[120, -15], [120, 0], [120, 15], [130, 8]], cover: 0.039, w: 0 },              // cúmulo tupido al este ⇒ un gran hueco ≈340° ⇒ K≈0.04 ⇒ 0
  { name: "twoMobs", pts: [[120, 0], [-120, 0]], cover: 0.000, w: 0 },                                    // 2 mobs <minMobs(3) ⇒ indefinido ⇒ 0
  { name: "empty", pts: [], cover: 0.000, w: 0 },                                                         // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.encircle && window.__dev.flank && window.__dev.converge && window.__dev.orient && window.__dev.speed && window.__dev.motley && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.encircle + peer hooks (flank/converge/orient/speed/motley/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.encircle());
  ok("2 byte-id OFF (fresh boot): ENCIRCLE_SURGE.enabled false AND G.encircleBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.cover === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "encircleFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} cover=${dark.cover} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCover=${dark.hiCover} midCover=${dark.midCover} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no encircleFind/encircleBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(encircleFind|encircleBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"encircleBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'encircleFind'/'encircleBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.encircle({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.encircle({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ coverProbe LUT: cover→band→tier→charge (UMBRALES hiCover/midCover + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.encircle({ coverProbe: { cover: c.cover } }).coverProbe), EXPECT_COVER);
  const tabOK = EXPECT_COVER.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ coverProbe LUT: K≥0.75⇒cerco⇒2/T2; ≥0.50⇒semi⇒1/T1; <0.50 (amontonados)⇒0/T0 (UMBRAL hiCover 0.75/midCover 0.50, bordes 0/0.49/0.50/0.74/0.75/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ cover: x.cover, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnEncircle (wipe) inyecta mobs REALES en offsets px; encircleField = cobertura K; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.encircle({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy]) => ({ dx, dy, type: "rat" }));
      const sr = window.__dev.encircle({ spawnEncircle: { pts, wipe: true } }).spawnEncircle;
      const live = window.__dev.encircle({ encircleProbeLive: true }).encircleProbeLive;
      out.push({ name: c.name, srCover: sr.cover, srScore: sr.score, liveCover: live.cover, liveScore: live.score, maxGap: live.maxGap, mobCount: live.mobCount });
    }
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srCover - c.cover) < 0.02 && Math.abs(comp[i].liveCover - c.cover) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnEncircle empuja mobs REALES; encircleField = cobertura K ⇒ cruz-4⇒K0.75/2, triángulo-3⇒K0.667/1, semicírculo⇒K0.5/1, dos-opuestos⇒K0.5/1, cúmulo⇒K0.04/0, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 7 ★ ⊥#108 FLANK crux (vecino más próximo — MISMOS rumbos, estadística DISTINTA): CONCENTRACIÓN R ⊥ COBERTURA-DE-HUECO K. 4 combos INDEPENDIENTES.
  const crux108 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.encircle({ enabled: true });   // flank ya es LIVE (#108 enabled:true)
    const read = (pts) => { window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.encircle({ spawnEncircle: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { encircle: window.__dev.encircle().score, cover: window.__dev.encircle().cover, flank: window.__dev.flank().score, conc: window.__dev.flank().conc }; };
    const ring4 = read([[120, 0], [-120, 0], [0, 120], [0, -120]]);        // anillo uniforme ⇒ flank0(R≈0)/encircle2(K0.75) — OPUESTOS
    const cluster = read([[120, -15], [120, 0], [120, 15], [130, 8]]);     // cúmulo en un flanco ⇒ flank2(R≈1)/encircle0(K≈0) — OPUESTOS
    const twoOpp = read([[0, -120], [15, -118], [0, 120], [15, 118]]);     // dos cúmulos opuestos ⇒ flank0(R cancela)/encircle1(hueco 180°)
    const wideArc = read([[41, -113], [120, 0], [41, 113]]);               // arco ancho (±70°) ⇒ flank1(R≈0.56)/encircle0(K0.39)
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    return { ring4, cluster, twoOpp, wideArc };
  }, { Z });
  const crux108OK = crux108.ring4.flank === 0 && crux108.ring4.encircle === 2
    && crux108.cluster.flank === 2 && crux108.cluster.encircle === 0
    && crux108.twoOpp.flank === 0 && crux108.twoOpp.encircle === 1
    && crux108.wideArc.flank === 1 && crux108.wideArc.encircle === 0;
  ok("7 ★ ⊥#108 FLANK crux (MISMOS rumbos, estadística DISTINTA — 4 combos): ANILLO ⇒ FLANK 0/ENCIRCLE 2 (OPUESTOS); CÚMULO ⇒ FLANK 2/ENCIRCLE 0 (OPUESTOS); DOS-OPUESTOS ⇒ FLANK 0/ENCIRCLE 1; ARCO-ANCHO ⇒ FLANK 1/ENCIRCLE 0 ⇒ CONCENTRACIÓN-R ⊥ COBERTURA-DE-HUECO-K (componentes INDEPENDIENTES)",
     crux108OK, JSON.stringify(crux108));

  // 8 ★ ENCIRCLE NO es función de R: TRES config con R≈0 idéntico dan K DISTINTO ⇒ estadísticas independientes.
  const notFnR = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.encircle({ enabled: true });
    const read = (pts) => { window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.encircle({ spawnEncircle: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { conc: window.__dev.flank().conc, cover: window.__dev.encircle().cover, score: window.__dev.encircle().score }; };
    const cross4 = read([[120, 0], [-120, 0], [0, 120], [0, -120]]);       // R≈0 / K0.75 / 2
    const tri3 = read([[120, 0], [-60, 104], [-60, -104]]);                // R≈0 / K0.667 / 1
    const opp2 = read([[0, -120], [15, -118], [0, 120], [15, 118]]);       // R≈0 / K0.50 / 1
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    return { cross4, tri3, opp2 };
  }, { Z });
  const notFnROK = notFnR.cross4.conc < 0.12 && notFnR.tri3.conc < 0.12 && notFnR.opp2.conc < 0.12
    && Math.abs(notFnR.cross4.cover - 0.75) < 0.02 && Math.abs(notFnR.tri3.cover - 0.667) < 0.02 && Math.abs(notFnR.opp2.cover - 0.50) < 0.02
    && notFnR.cross4.score === 2 && notFnR.tri3.score === 1 && notFnR.opp2.score === 1;
  ok("8 ★ ENCIRCLE NO es función de R: cruz-4/triángulo-3/par-opuesto TODOS con FLANK R≈0 (conc<0.12) PERO K DISTINTO (0.75/0.667/0.50) ⇒ score 2/1/1 ⇒ K ⊥ R (estadísticas independientes sobre los MISMOS rumbos)",
     notFnROK, JSON.stringify(notFnR));

  // 9 ★ ESCALA-INVARIANCIA (INTENSIVO): un anillo GRANDE vs PEQUEÑO ⇒ MISMA cobertura K (K adimensional, invariante a la escala radial) ⊥ #107 DISPERSE (spread radial px).
  const scaleInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.encircle({ enabled: true });
    const read = (pts) => { window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.encircle({ spawnEncircle: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { cover: window.__dev.encircle().cover, score: window.__dev.encircle().score }; };
    const big = read([[250, 0], [-250, 0], [0, 250], [0, -250]]);          // anillo GRANDE (r=250)
    const small = read([[60, 0], [-60, 0], [0, 60], [0, -60]]);            // anillo PEQUEÑO (r=60)
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    return { big, small };
  }, { Z });
  const scaleInvOK = Math.abs(scaleInv.big.cover - scaleInv.small.cover) < 0.001 && scaleInv.big.score === 2 && scaleInv.small.score === 2;
  ok("9 ★ ESCALA-INVARIANCIA: anillo GRANDE (r250) vs PEQUEÑO (r60) ⇒ MISMA cobertura K y score 2 (K adimensional/INTENSIVO, invariante a la escala radial) ⊥ #107 DISPERSE (spread radial px)",
     scaleInvOK, JSON.stringify(scaleInv));

  // 10 CANAL encircleFind: forageChargePreview con cerco >0 ; con amontonados → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.encircle({ enabled: true });
    window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.encircle({ spawnEncircle: { pts: [[120, 0], [-120, 0], [0, 120], [0, -120]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // cerco ⇒ score2 ⇒ T2
    const actVm = window.__dev.encircle();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.encircle({ spawnEncircle: { pts: [[120, -15], [120, 0], [120, 15], [130, 8]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // amontonados ⇒ score0
    const goVm = window.__dev.encircle();
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL encircleFind: forageChargePreview con cerco ⇒ charge>0 (==encircleBonus); con amontonados en un costado ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds encircleBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let cover = 0; cover <= 1.001; cover += 0.05) vals.push(window.__dev.encircle({ coverProbe: { cover } }).coverProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.encircle().cap };
  });
  ok("11 ★ SUB-CAP: ninguna K produce charge>encircleBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a cerco available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.encircle({ enabled: true });
    window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.encircle({ spawnEncircle: { pts: [[120, 0], [-120, 0], [0, 120], [0, -120]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // cerco disponible
    window.__dev.encircle({ enabled: false });                             // now OFF
    const off = window.__dev.encircle();
    window.__dev.encircle({ enabled: true }); window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } }); window.__dev.encircle({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, cover: off.cover };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.cover === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, encircleBonus(cerco disponible)==0 + forageChargePreview==0 + cover==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip encircle OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling motley/packHarvest no cambia la señal de encircle.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.encircle({ enabled: true });
    window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.encircle({ spawnEncircle: { pts: [[120, 0], [-120, 0], [0, 120], [0, -120]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    window.__dev.encircle({ enabled: false });
    const snap = () => JSON.stringify({ flank: window.__dev.flank(), converge: window.__dev.converge(), orient: window.__dev.orient(), speed: window.__dev.speed() });
    const peersOff = snap();
    window.__dev.encircle({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.encircle();
    const mtPrev = window.__dev.motley().enabled, pkPrev = window.__dev.packHarvest().enabled, fkPrev = window.__dev.flank().enabled, cvPrev = window.__dev.converge().enabled;
    window.__dev.motley({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.encircle();
    const fkAfter = window.__dev.flank().enabled, cvAfter = window.__dev.converge().enabled;
    window.__dev.motley({ enabled: mtPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.cover - afterArc.cover) < 0.001;
    return { peersUnchanged, sigUnchanged, fkAfter, cvAfter };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD encircleFind ⊥ peers: flip encircle OFF→ON NO cambia flank/converge/orient/speed; toggling MOTLEY #106/PACKHARVEST #87 NO cambia la señal de encircle; flank #108/converge #112 LIVE intactos",
     orth.peersUnchanged && orth.sigUnchanged && orth.fkAfter === true && orth.cvAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 54 arc flags served true; ENCIRCLE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const encircleDark = flag("ENCIRCLE_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 54 mecanismos del arco #59-#112 served enabled:true; ENCIRCLE_SURGE served false (DARK #113)",
     arcAllOn && encircleDark && arc.length === 54, `encircle=${flag("ENCIRCLE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Cerco:" drawn ON+cerco / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cerco:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.encircle({ enabled: true });
    window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.encircle({ spawnEncircle: { pts: [[120, 0], [-120, 0], [0, 120], [0, -120]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // cerco ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z });
  ok("15 render badge \"Cerco:\" se DIBUJA ON+cerco (K>0) y NO OFF (K 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.encircle({ enabled: true }); window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.encircle({ spawnEncircle: { pts: [[130, 0], [-130, 0], [0, 130], [0, -130], [95, 95], [-95, -95]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } }); }, { Z });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } }); window.__dev.encircle({ enabled: false }); });

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
    window.__dev.encircle({ enabled: true });
    window.__dev.encircle({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.encircle({ spawnEncircle: { pts: [[120, 0], [-120, 0], [0, 120], [0, -120], [85, 85]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    const vm = window.__dev.encircle();
    const lut = [0, 0.5, 0.75, 1.0].map(cover => { const p = window.__dev.encircle({ coverProbe: { cover } }).coverProbe; return { cover, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.encircle({ encircleProbeLive: true }).encircleProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.encircle({ spawnEncircle: { pts: [], wipe: true } });
    window.__dev.encircle({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, cover: vm.cover, liveCover: live.cover, liveScore: live.score, maxGap: live.maxGap, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.cover === B.cover && A.liveCover === B.liveCover && A.liveScore === B.liveScore && A.maxGap === B.maxGap && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (cruz-4 + 1 diagonal)+héroe ⇒ score/tier/charge/cover + encircleProbeLive(cover,maxGap,score) + coverProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},cover:${A.cover},liveCover:${A.liveCover},maxGap:${A.maxGap},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},cover:${B.cover},liveCover:${B.liveCover},maxGap:${B.maxGap},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.encircle({ enabled: false }));
  await pageB.evaluate(() => window.__dev.encircle({ enabled: false }));

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
