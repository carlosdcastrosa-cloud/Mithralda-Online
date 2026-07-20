// CAS-2645 — self-verify for REMATE DE FALANGE (DARK, FLANK_SURGE.enabled:false). EVO mecánica #108 (serializa tras #107 DISPERSE_SURGE LIVE&served b8b8c3ac28f7/815, base HEAD 33d8b07) — EJE FRESCO + CANAL FRESCO, ⊥ a las 49 LIVE #59-#107.
// (A) EJE FRESCO = ESTRUCTURAL/GEOMÉTRICO CONCENTRACIÓN ANGULAR de la MANADA VIVA alrededor del héroe = flankConc(hero) = LONGITUD DEL VECTOR RESULTANTE MEDIO R∈[0,1] de los RUMBOS unitarios hero→mob de los mobs VIVOS en radio (estadística circular). flankBand: ≥hiConc(0.80) ⇒ falange/muralla en un flanco ⇒ 2; ≥midConc(0.50) ⇒ inclinada ⇒ 1; <mid (repartida/cercando) ⇒ 0. Requiere ≥minMobs(2) vivos. ESCALA INTENSIVA (invariante al conteo).
//     PRE-FLIGHT del eje RECOMENDADO pack CONVERGENCE (producto punto medio de la VELOCIDAD hacia el héroe) → FALLA por DOS razones ⇒ PIVOTE al ALTERNO del issue (pack FORMATION DENSITY / concentración angular): (1) e.vx/e.vy INERTES para enemigos (mov = dir-persecución × ESCALAR e.tpl.spd + knockX/knockY; NO hay vector de velocidad server-auth); (2) la convergencia por INTENCIÓN-DE-PASO = re-mapeo agregado (MEDIA-vs-MAX) de #90 HEADING_SURGE (LIVE) ⇒ NO ⊥. El ALTERNO angular es POSICIONAL PURO (health/status/motion-AGNÓSTICO).
//     CRUX ⊥#107 DISPERSE (SPREAD RADIAL al centroide): una LÍNEA que radia en UN mismo rumbo ⇒ FLANK alto (R≈1) Y DISPERSE spread alto (desplegada) ⇒ ambos altos; anillo uniforme ⇒ FLANK 0/DISPERSE alto; blob a un lado ⇒ FLANK alto/DISPERSE 0 ⇒ NO monótonas ⇒ INDEPENDIENTES (ángulo ⊥ escala radial).
//     CRUX ⊥#87 PACKHARVEST (CONTEO/cohesión, EXTENSIVA): 3 mobs en un flanco vs 6 en el MISMO flanco ⇒ R igual (≈1, flank 2)/packHarvest SUM distinto (escala con conteo) ⇒ INTENSIVO ⊥ EXTENSIVO.
//     CRUX ⊥#59 WARDING_RING (cobertura angular de JUGADORES, canal wardRegen, polaridad REPARTO): anillo uniforme (reparto) ⇒ FLANK 0 (lo que WARDING premia como cobertura ALTA); cluster en un sector ⇒ FLANK 2 (cobertura BAJA) ⇒ POLARIDAD OPUESTA; sujeto MOBS (no jugadores), canal flankFind (≠ wardRegen), señal 100% de posiciones de MOB.
// (B) CANAL FRESCO = flankFind (fichas de falange por rematar frente a una MURALLA amasada en un flanco — NINGUNA de las 49 flags lo usa; ⊥ disperseFind #107/wardRegen #59/headingFind #90/packFind #87/skirmishFind #84). Moneda FRESCA (h.flankBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio flankBountyCap, 0 doble-dip.
//
// Run: node tools/cas2645-flank-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2645");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 395;
// concProbe LUT esperada: conc→banda→{tier,charge}. UMBRALES hiConc 0.80 / midConc 0.50, bordes exactos.
const EXPECT_CONC = [
  { conc: 0, w: 0, t: 0, s: 0 }, { conc: 0.49, w: 0, t: 0, s: 0 },   // <midConc ⇒ repartida ⇒ 0 (borde 0.49 justo bajo)
  { conc: 0.50, w: 1, t: 1, s: 1 }, { conc: 0.79, w: 1, t: 1, s: 1 }, // ≥midConc ⇒ inclinada ⇒ 1 (bordes 0.50 inclusive / 0.79)
  { conc: 0.80, w: 2, t: 2, s: 2 }, { conc: 1.0, w: 2, t: 2, s: 2 },  // ≥hiConc ⇒ falange ⇒ 2 (borde 0.80 inclusive)
];
// spawnFlank esperado por FORMACIÓN (offsets px del héroe). R = |Σ û_i|/n de los rumbos hero→mob. Cubre bandas 0/1/2 + minMobs + cercado.
const EXPECT_SPAWN = [
  { name: "phalanx", pts: [[100, 0], [150, 0], [220, 0]], conc: 1.000, w: 2 },       // 3 mobs MISMO rumbo (este) ⇒ R=1 ⇒ falange ⇒ 2
  { name: "lean", pts: [[50, -86.6], [100, 0], [50, 86.6]], conc: 0.667, w: 1 },     // arco 120° (−60/0/+60) ⇒ R=0.667 ⇒ inclinada ⇒ 1
  { name: "surround", pts: [[100, 0], [-100, 0], [0, 100], [0, -100]], conc: 0.000, w: 0 }, // 4 cardinales ⇒ R=0 ⇒ cercado ⇒ 0
  { name: "twosame", pts: [[100, 0], [100, 25]], conc: 0.993, w: 2 },                // 2 mobs (minMobs=2 justo) MISMO flanco ⇒ R≈0.99 ⇒ 2
  { name: "opposed", pts: [[100, 0], [-100, 0]], conc: 0.000, w: 0 },                // 2 mobs OPUESTOS ⇒ R=0 ⇒ cercado/pinza ⇒ 0
  { name: "one", pts: [[120, 0]], conc: 0.000, w: 0 },                               // 1 mob <minMobs ⇒ concentración indefinida ⇒ 0
  { name: "empty", pts: [], conc: 0.000, w: 0 },                                     // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.flank && window.__dev.disperse && window.__dev.packHarvest && window.__dev.heading && window.__dev.convoy && window.__dev.motley && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.flank + peer hooks (disperse/packHarvest/heading/convoy/motley) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.flank());
  ok("2 byte-id OFF (fresh boot): FLANK_SURGE.enabled false AND G.flankBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.conc === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "flankFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} conc=${dark.conc} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiConc=${dark.hiConc} midConc=${dark.midConc} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no flankFind/flankBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(flankFind|flankBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"flankBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'flankFind'/'flankBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.flank({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.flank({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ concProbe LUT: conc→band→tier→charge (UMBRALES hiConc/midConc + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.flank({ concProbe: { conc: c.conc } }).concProbe), EXPECT_CONC);
  const tabOK = EXPECT_CONC.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ concProbe LUT: R≥0.80⇒falange⇒2/T2; ≥0.50⇒inclinada⇒1/T1; <0.50⇒repartida⇒0/T0 (UMBRAL hiConc 0.80/midConc 0.50, bordes 0.49/0.50/0.79/0.80 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ c: x.conc, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnFlank (wipe) inyecta mobs REALES en offsets px del héroe; flankConc = |Σ rumbos unitarios|/n; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.flank({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy]) => ({ dx, dy, type: "rat" }));
      const sr = window.__dev.flank({ spawnFlank: { pts, wipe: true } }).spawnFlank;
      const live = window.__dev.flank({ flankProbeLive: true }).flankProbeLive;
      out.push({ name: c.name, srConc: sr.conc, srScore: sr.score, liveConc: live.conc, liveScore: live.score, mobCount: live.mobCount });
    }
    window.__dev.flank({ spawnFlank: { pts: [], wipe: true } });
    window.__dev.flank({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srConc - c.conc) < 0.02 && Math.abs(comp[i].liveConc - c.conc) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnFlank empuja mobs REALES en offsets px; flankConc = longitud resultante media de rumbos ⇒ mismo-rumbo⇒R1/2, arco120°⇒R0.667/1, 4-cardinales⇒R0/0, 2-mismo-flanco⇒R0.99/2, 2-opuestos⇒R0/0, 1-mob⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 7 ★ ⊥#107 DISPERSE crux: FLANK (concentración angular) ⊥ DISPERSE (spread radial). Línea en UN rumbo ⇒ ambos altos; anillo ⇒ flank0/disperse alto; blob a un lado ⇒ flank alto/disperse0.
  const crux107 = await page.evaluate((Z) => {
    window.__dev.flank({ enabled: true }); window.__dev.disperse({ enabled: true });
    const read = (pts) => { window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.flank({ spawnFlank: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { flank: window.__dev.flank().score, conc: window.__dev.flank().conc, disperse: window.__dev.disperse().score, spread: window.__dev.disperse().spread }; };
    // LÍNEA radial en UN rumbo (este): 2 grupos cerca(20px)+lejos(290px) ⇒ R≈1 (mismo rumbo) Y spread≈135 al centroide (desplegada) ⇒ AMBOS altos
    const line = read([[20, 0], [20, 5], [290, 0], [290, 5]]);
    // anillo cardinal uniforme ⇒ R=0 (repartida)/spread=100 (centroide=héroe) ⇒ flank0/disperse alto
    const ring = read([[100, 0], [-100, 0], [0, 100], [0, -100]]);
    // blob tupido a un lado ⇒ R≈1 (un flanco)/spread~9 (apiñado) ⇒ flank alto/disperse0
    const blob = read([[150, 0], [160, 10], [155, -8], [145, 6]]);
    window.__dev.flank({ spawnFlank: { pts: [], wipe: true } });
    window.__dev.flank({ enabled: false }); window.__dev.disperse({ enabled: false });
    return { line, ring, blob };
  }, Z);
  const crux107OK = crux107.line.flank === 2 && crux107.line.disperse === 2 && crux107.ring.flank === 0 && crux107.ring.disperse >= 1 && crux107.blob.flank === 2 && crux107.blob.disperse === 0;
  ok("7 ★ ⊥#107 crux: LÍNEA radial en UN rumbo ⇒ FLANK 2 (R≈1) Y DISPERSE 2 (spread ancho) AMBOS altos; ANILLO ⇒ FLANK 0/DISPERSE≥1; BLOB a un lado ⇒ FLANK 2/DISPERSE 0 ⇒ CONCENTRACIÓN-ANGULAR ⊥ SPREAD-RADIAL (NO monótonas, INDEPENDIENTES)",
     crux107OK, JSON.stringify(crux107));

  // 8 ★ ⊥#87 PACKHARVEST crux: FLANK INTENSIVO (invariante al conteo) ⊥ #87 EXTENSIVO (suma escala con conteo). 3 vs 6 mobs en el MISMO flanco ⇒ R igual (flank 2)/packHarvest SUM distinto.
  const crux87 = await page.evaluate((Z) => {
    window.__dev.flank({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const read = (pts) => { window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.flank({ spawnFlank: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { flank: window.__dev.flank().score, packSum: window.__dev.packHarvest({ packProbe: true }).packProbe.score, packCount: window.__dev.packHarvest({ packProbe: true }).packProbe.count }; };
    const few = read([[150, 0], [158, 6], [150, -7]]);                                       // 3 mobs tupidos en el flanco este ⇒ R≈1/flank2
    const many = read([[150, 0], [158, 6], [150, -7], [165, 4], [145, 8], [160, -5]]);        // 6 mobs tupidos MISMO flanco ⇒ R≈1/flank2, más vecinos ⇒ packSum mayor
    window.__dev.flank({ spawnFlank: { pts: [], wipe: true } });
    window.__dev.flank({ enabled: false }); window.__dev.packHarvest({ enabled: false });
    return { few, many };
  }, Z);
  const crux87OK = crux87.few.flank === 2 && crux87.many.flank === 2 && crux87.many.packSum > crux87.few.packSum && crux87.many.packCount > crux87.few.packCount;
  ok("8 ★ ⊥#87 crux: 3 mobs en un flanco ⇒ FLANK 2 (R≈1) Y packHarvest SUM=S3; 6 mobs MISMO flanco ⇒ FLANK 2 (R≈1) Y packHarvest SUM=S6>S3 ⇒ R INVARIANTE al conteo (INTENSIVO) ⊥ #87 SUMA-cohesión (EXTENSIVO)",
     crux87OK, JSON.stringify(crux87));

  // 9 ★ ⊥#59 WARDING_RING crux: POLARIDAD OPUESTA + SUJETO MOBS + CANAL flankFind. Anillo uniforme (reparto=cobertura ALTA de WARDING) ⇒ FLANK 0; cluster en un sector (cobertura BAJA) ⇒ FLANK 2; señal 100% de MOBS (clear ⇒ 0).
  const crux59 = await page.evaluate((Z) => {
    window.__dev.flank({ enabled: true });
    const spawn = (pts) => { window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.flank({ spawnFlank: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } }).spawnFlank.score; };
    const ring = spawn([[100, 0], [-100, 0], [0, 100], [0, -100]]);      // reparto uniforme (WARDING cobertura ALTA) ⇒ FLANK 0
    const cluster = spawn([[150, 0], [160, 10], [155, -8], [145, 6]]);   // amasado en un sector (WARDING cobertura BAJA) ⇒ FLANK 2
    const chan = window.__dev.flank().channel;
    const afterClear = window.__dev.flank({ clearFlank: true }).cleared;   // remueve mobs de prueba ⇒ 0
    const flankAfterClear = window.__dev.flank().score;
    window.__dev.flank({ enabled: false });
    return { ring, cluster, chan, afterClear, flankAfterClear };
  }, Z);
  const crux59OK = crux59.ring === 0 && crux59.cluster === 2 && crux59.chan === "flankFind" && crux59.flankAfterClear === 0;
  ok("9 ★ ⊥#59 crux: ANILLO uniforme (WARDING cobertura ALTA) ⇒ FLANK 0; CLUSTER un sector (cobertura BAJA) ⇒ FLANK 2 ⇒ POLARIDAD OPUESTA (concentración vs cobertura); sujeto MOBS (clear⇒flank0), canal flankFind (≠ wardRegen)",
     crux59OK, JSON.stringify(crux59));

  // 10 CANAL flankFind: forageChargePreview con falange amasada >0 ; con cercado → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.flank({ enabled: true });
    window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.flank({ spawnFlank: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // phalanx ⇒ score2 ⇒ T2
    const actVm = window.__dev.flank();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.flank({ spawnFlank: { pts: [[100, 0], [-100, 0], [0, 100], [0, -100]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // surround ⇒ score0
    const goVm = window.__dev.flank();
    window.__dev.flank({ spawnFlank: { pts: [], wipe: true } });
    window.__dev.flank({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL flankFind: forageChargePreview con falange amasada ⇒ charge>0 (==flankBonus); con cercado ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds flankBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let c = 0; c <= 1.0; c += 0.05) vals.push(window.__dev.flank({ concProbe: { conc: c } }).concProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.flank().cap };
  });
  ok("11 ★ SUB-CAP: ninguna conc produce charge>flankBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a phalanx available
  const neutral = await page.evaluate((Z) => {
    window.__dev.flank({ enabled: true });
    window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.flank({ spawnFlank: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // falange disponible
    window.__dev.flank({ enabled: false });                             // now OFF
    const off = window.__dev.flank();
    window.__dev.flank({ enabled: true }); window.__dev.flank({ spawnFlank: { pts: [], wipe: true } }); window.__dev.flank({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, conc: off.conc };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.conc === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, flankBonus(falange disponible)==0 + forageChargePreview==0 + conc==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip flank OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling disperse/heading/convoy/packHarvest no cambia la señal de flank.
  const orth = await page.evaluate((Z) => {
    window.__dev.flank({ enabled: true });
    window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.flank({ spawnFlank: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    window.__dev.flank({ enabled: false });
    const snap = () => JSON.stringify({ disperse: window.__dev.disperse(), motley: window.__dev.motley(), heading: window.__dev.heading() });
    const peersOff = snap();
    window.__dev.flank({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.flank();
    const dpPrev = window.__dev.disperse().enabled, hdPrev = window.__dev.heading().enabled, cvPrev = window.__dev.convoy().enabled, pkPrev = window.__dev.packHarvest().enabled;
    window.__dev.disperse({ enabled: true }); window.__dev.heading({ enabled: true }); window.__dev.convoy({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.flank();
    const dpAfter = window.__dev.disperse().enabled, hdAfter = window.__dev.heading().enabled, cvAfter = window.__dev.convoy().enabled, pkAfter = window.__dev.packHarvest().enabled;
    window.__dev.disperse({ enabled: dpPrev }); window.__dev.heading({ enabled: hdPrev }); window.__dev.convoy({ enabled: cvPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.flank({ spawnFlank: { pts: [], wipe: true } });
    window.__dev.flank({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.conc - afterArc.conc) < 0.001;
    return { peersUnchanged, sigUnchanged, dpAfter, hdAfter, cvAfter, pkAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD flankFind ⊥ peers: flip flank OFF→ON NO cambia disperse/motley/heading; toggling DISPERSE #107/HEADING #90/CONVOY #58/PACKHARVEST #87 NO cambia la señal de flank; todos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.dpAfter === true && orth.hdAfter === true && orth.cvAfter === true && orth.pkAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 49 arc flags served true; FLANK_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const flankDark = flag("FLANK_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 49 mecanismos del arco #59-#107 served enabled:true; FLANK_SURGE served false (DARK #108)",
     arcAllOn && flankDark && arc.length === 49, `flank=${flag("FLANK_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Falange:" drawn ON+phalanx / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Falange:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.flank({ enabled: true });
    window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.flank({ spawnFlank: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // phalanx ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.flank({ spawnFlank: { pts: [], wipe: true } });
    window.__dev.flank({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Falange:\" se DIBUJA ON+falange amasada (conc>0) y NO OFF (conc 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.flank({ enabled: true }); window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.flank({ spawnFlank: { pts: [[100, 0], [150, 0], [220, 0], [180, 20], [130, -15]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate((Z) => { window.__dev.flank({ spawnFlank: { pts: [], wipe: true } }); window.__dev.flank({ enabled: false }); }, Z);

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
    window.__dev.flank({ enabled: true });
    window.__dev.flank({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.flank({ spawnFlank: { pts: [[100, 0], [150, 0], [220, 0]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    const vm = window.__dev.flank();
    const lut = [0, 0.5, 0.8, 1.0].map(c => { const p = window.__dev.flank({ concProbe: { conc: c } }).concProbe; return { conc: c, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.flank({ flankProbeLive: true }).flankProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.flank({ spawnFlank: { pts: [], wipe: true } });
    window.__dev.flank({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, conc: vm.conc, liveConc: live.conc, liveScore: live.score, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.conc === B.conc && A.liveConc === B.liveConc && A.liveScore === B.liveScore && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA falange (3 mobs mismo rumbo)+héroe ⇒ score/tier/charge/conc + flankProbeLive(conc,score) + concProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},conc:${A.conc},liveConc:${A.liveConc},liveScore:${A.liveScore},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},conc:${B.conc},liveConc:${B.liveConc},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.flank({ enabled: false }));
  await pageB.evaluate(() => window.__dev.flank({ enabled: false }));

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
