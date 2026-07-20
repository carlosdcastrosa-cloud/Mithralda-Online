// CAS-2665 — self-verify for REMATE DE EMBESTIDA CONVERGENTE (DARK, CONVERGE_SURGE.enabled:false). EVO mecánica #112 (serializa tras #111 SPEED_SURGE LIVE&served 229165c5c306/815, base HEAD 6ae9224) — EJE FRESCO + CANAL FRESCO, ⊥ a las 53 LIVE #59-#111.
// (A) EJE FRESCO = CINÉTICO/SIGNADO CONVERGENCIA RADIAL de la MANADA VIVA sobre el héroe = convergeField(hero) = ÍNDICE C = (Σ vᵢ·cosθᵢ)/(Σ vᵢ) = MEDIA PONDERADA POR VELOCIDAD de la proyección radial hacia el héroe, con vᵢ=speedIntent(e,h) [magnitud server-auth de PASO] y cosθᵢ=headingIntent(e,h)·(mob→hero unit) [MISMAS ramas de IA que #90/#110/#111, NO e.vx/e.vy INERTES]. convergeBand: ≥hiConverge(0.55) ⇒ embestida/closing ⇒ 2; ≥midConverge(0.25) ⇒ algo-cerrando/loose ⇒ 1; <mid (millando/tangencial/retrocediendo) ⇒ 0. Requiere ≥minMobs(3) en movimiento. ESCALA SIGNADA hero-frame, INVARIANTE a un factor de escala UNIFORME de velocidad (por la normalización /Σv).
//     PRE-FLIGHT del eje RECOMENDADO pack CONVERGENCE → PASA sin pivote (los 3 criterios): (a) la velocidad radial por mob EXISTE server-auth (speedIntent × cos con headingIntent, ambos de la MISMA rama de IA); (b) C∈[-1,1] band-able con midConverge/hiConverge; (c) ⊥ vecinos más próximos #90 HEADING (MAX ⊥ MEDIA), #110 ORIENT (dispersión-absoluta ⊥ media-signada-hero-frame), #111 SPEED (magnitud ⊥ dirección-hacia-el-héroe).
//     CRUX ⊥#90 HEADING: MAX-sobre-el-pack del coseno de 1 víctima ⊥ MEDIA-ponderada SIGNADA ⇒ 1 embestidor solitario + 3 huyendo ⇒ heading2/converge0; toda la manada embistiendo ⇒ heading2/converge2.
//     CRUX ⊥#110 ORIENT: dispersión de rumbos ABSOLUTOS (hero-frame-INVARIANTE) ⊥ media SIGNADA hacia el héroe ⇒ CERCANDO embistiendo ⇒ orient2/converge2; COLINEAL embistiendo ⇒ orient0/converge2; CERCANDO huyendo ⇒ orient2/converge0; COLINEAL huyendo ⇒ orient0/converge0.
//     CRUX ⊥#111 SPEED: CV de las MAGNITUDES (dirección-agnóstico) ⊥ dirección-hacia-el-héroe (magnitud-INVARIANTE por /Σv) ⇒ embistiendo uniforme ⇒ converge2/speed0; embistiendo dispar ⇒ converge2/speed2; millando uniforme ⇒ converge0/speed0; millando dispar ⇒ converge0/speed2.
// (B) CANAL FRESCO = convergeFind (fichas de embestida por rematar en medio de una manada que CIERRA COORDINADA — NINGUNA de las 53 flags lo usa; ⊥ speedFind #111/orientFind #110/headingFind #90/flankFind #108). Moneda FRESCA (h.convergeBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio convergeBountyCap, 0 doble-dip.
//
// Run: node tools/cas2665-converge-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2665");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// idxProbe LUT esperada: idx→banda→{tier,charge}. UMBRALES hiConverge 0.55 / midConverge 0.25, bordes exactos + negativos.
const EXPECT_IDX = [
  { idx: -1.0, w: 0, t: 0, s: 0 }, { idx: 0, w: 0, t: 0, s: 0 }, { idx: 0.24, w: 0, t: 0, s: 0 }, // <midConverge (retrocede/milla) ⇒ 0
  { idx: 0.25, w: 1, t: 1, s: 1 }, { idx: 0.54, w: 1, t: 1, s: 1 },                                // ≥midConverge ⇒ algo-cerrando ⇒ 1 (bordes 0.25 inclusive / 0.54)
  { idx: 0.55, w: 2, t: 2, s: 2 }, { idx: 1.0, w: 2, t: 2, s: 2 },                                 // ≥hiConverge ⇒ embestida ⇒ 2 (borde 0.55 inclusive)
];
// spawnConverge esperado por CONVERGENCIA. state chase=CIERRA(cos+1)/flee=RETROCEDE(cos-1). C=(Σvᵢcosθᵢ)/(Σvᵢ). Cubre bandas 0/1/2 + minMobs + magnitud-invariancia.
const EXPECT_SPAWN = [
  { name: "allIn", pts: [[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "chase"]], idx: 1.000, w: 2 },      // 3 embisten uniforme ⇒ C=+1 ⇒ 2
  { name: "allInDispar", pts: [[100, -30, 30, "chase"], [120, 0, 70, "chase"], [100, 30, 140, "chase"]], idx: 1.000, w: 2 }, // 3 embisten a velocidades DISPARES ⇒ C=+1 (magnitud-INVARIANTE) ⇒ 2
  { name: "partialIn", pts: [[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "flee"]], idx: 0.333, w: 1 },   // 2 cierran + 1 huye ⇒ C=(70+70-70)/210=0.333 ⇒ algo-cerrando ⇒ 1
  { name: "netZero", pts: [[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "flee"], [80, 0, 70, "flee"]], idx: 0.000, w: 0 }, // 2 cierran + 2 huyen ⇒ C=0 ⇒ millando ⇒ 0
  { name: "mostOut", pts: [[100, -30, 70, "chase"], [120, 0, 70, "flee"], [100, 30, 70, "flee"]], idx: -0.333, w: 0 },     // 1 cierra + 2 huyen ⇒ C=-0.333 ⇒ retrocede ⇒ 0
  { name: "twoIn", pts: [[100, 0, 70, "chase"], [120, 0, 70, "chase"]], idx: 0.000, w: 0 },                                // 2 mobs <minMobs(3) ⇒ indefinido ⇒ 0
  { name: "empty", pts: [], idx: 0.000, w: 0 },                                                                             // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.converge && window.__dev.heading && window.__dev.speed && window.__dev.orient && window.__dev.flank && window.__dev.motley && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.converge + peer hooks (heading/speed/orient/flank/motley/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.converge());
  ok("2 byte-id OFF (fresh boot): CONVERGE_SURGE.enabled false AND G.convergeBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "convergeFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiConverge=${dark.hiConverge} midConverge=${dark.midConverge} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no convergeFind/convergeBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(convergeFind|convergeBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"convergeBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'convergeFind'/'convergeBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.converge({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.converge({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ idxProbe LUT: idx→band→tier→charge (UMBRALES hiConverge/midConverge + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.converge({ idxProbe: { idx: c.idx } }).idxProbe), EXPECT_IDX);
  const tabOK = EXPECT_IDX.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ idxProbe LUT: C≥0.55⇒embestida⇒2/T2; ≥0.25⇒algo-cerrando⇒1/T1; <0.25 (millando/retrocediendo, incl negativos)⇒0/T0 (UMBRAL hiConverge 0.55/midConverge 0.25, bordes -1/0/0.24/0.25/0.54/0.55/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ idx: x.idx, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnConverge (wipe) inyecta mobs REALES con estado/velocidad forzados (chase=cierra/flee=retrocede); convergeField = índice C; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.converge({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" }));
      const sr = window.__dev.converge({ spawnConverge: { pts, wipe: true } }).spawnConverge;
      const live = window.__dev.converge({ convergeProbeLive: true }).convergeProbeLive;
      out.push({ name: c.name, srIdx: sr.idx, srScore: sr.score, liveIdx: live.idx, liveScore: live.score, sumR: live.sumR, sumV: live.sumV, mobCount: live.mobCount });
    }
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srIdx - c.idx) < 0.02 && Math.abs(comp[i].liveIdx - c.idx) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnConverge empuja mobs REALES (chase=cierra/flee=retrocede); convergeField = índice C ⇒ 3-embisten⇒C+1/2, dispares⇒C+1/2 (magnitud-invariante), 2cierran-1huye⇒C0.33/1, 2-2⇒C0/0, 1cierra-2huyen⇒C-0.33/0, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 7 ★ ⊥#111 SPEED crux (vecino por número): DIRECCIÓN-hacia-el-héroe (proyección radial, magnitud-invariante) ⊥ MAGNITUD (CV de velocidades). Los 4 cuadrantes.
  const crux111 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.converge({ enabled: true });   // speed ya es LIVE (#111 enabled:true)
    const read = (pts) => { window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.converge({ spawnConverge: { pts: pts.map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });
      return { converge: window.__dev.converge().score, idx: window.__dev.converge().idx, speed: window.__dev.speed().score, cv: window.__dev.speed().cv }; };
    // TODOS embistiendo, velocidad UNIFORME ⇒ converge2/speed0
    const inUniform = read([[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "chase"], [80, 20, 70, "chase"]]);
    // TODOS embistiendo, velocidades DISPARES ⇒ converge2 (magnitud-invariante)/speed2 — MISMO converge, speed OPUESTO
    const inDispar = read([[100, -30, 30, "chase"], [120, 0, 60, "chase"], [100, 30, 120, "chase"], [80, 20, 160, "chase"]]);
    // MILLANDO (2 cierran/2 huyen), velocidad UNIFORME ⇒ converge0/speed0
    const millUniform = read([[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "flee"], [80, 20, 70, "flee"]]);
    // MILLANDO, velocidades DISPARES ⇒ converge0/speed2
    const millDispar = read([[100, -30, 30, "chase"], [120, 0, 160, "chase"], [100, 30, 30, "flee"], [80, 20, 160, "flee"]]);
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    return { inUniform, inDispar, millUniform, millDispar };
  }, { Z });
  const crux111OK = crux111.inUniform.converge === 2 && crux111.inUniform.speed === 0
    && crux111.inDispar.converge === 2 && crux111.inDispar.speed === 2
    && crux111.millUniform.converge === 0 && crux111.millUniform.speed === 0
    && crux111.millDispar.converge === 0 && crux111.millDispar.speed === 2;
  ok("7 ★ ⊥#111 SPEED crux (vecino por número): EMBISTE+UNIFORME ⇒ CONVERGE 2/SPEED 0; EMBISTE+DISPAR ⇒ CONVERGE 2/SPEED 2 (magnitud NO altera C); MILLA+UNIFORME ⇒ CONVERGE 0/SPEED 0; MILLA+DISPAR ⇒ CONVERGE 0/SPEED 2 ⇒ DIRECCIÓN-hacia-el-héroe ⊥ MAGNITUD — LOS 4 CUADRANTES (componentes INDEPENDIENTES)",
     crux111OK, JSON.stringify(crux111));

  // 8 ★ ⊥#90 HEADING crux (vecino conceptual, hero-relativo): MAX-sobre-el-pack del coseno de 1 víctima ⊥ MEDIA-ponderada SIGNADA de TODA la manada.
  const crux90 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.converge({ enabled: true });   // heading ya es LIVE (#90 enabled:true)
    const read = (pts) => { window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.converge({ spawnConverge: { pts: pts.map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });
      return { converge: window.__dev.converge().score, idx: window.__dev.converge().idx, heading: window.__dev.heading().score }; };
    // 3 embisten ⇒ hay 1 cargando ⇒ heading2; todas cierran ⇒ converge2
    const allCharge = read([[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "chase"]]);
    // 1 embiste + 3 huyen ⇒ el embestidor da heading MAX=2; media C=(70-70-70-70)/280=-0.5 ⇒ converge0 — MISMO heading2, converge OPUESTO
    const oneCharge = read([[100, 0, 70, "chase"], [120, 0, 70, "flee"], [100, 30, 70, "flee"], [80, -20, 70, "flee"]]);
    // 3 huyen ⇒ ningún cargador ⇒ heading0; media C=-1 ⇒ converge0
    const allFlee = read([[100, -30, 70, "flee"], [120, 0, 70, "flee"], [100, 30, 70, "flee"]]);
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    return { allCharge, oneCharge, allFlee };
  }, { Z });
  const crux90OK = crux90.allCharge.heading === 2 && crux90.allCharge.converge === 2
    && crux90.oneCharge.heading === 2 && crux90.oneCharge.converge === 0
    && crux90.allFlee.heading === 0 && crux90.allFlee.converge === 0;
  ok("8 ★ ⊥#90 HEADING crux (MAX ⊥ MEDIA): 3-embisten ⇒ HEADING 2/CONVERGE 2; 1-embiste+3-huyen ⇒ HEADING 2/CONVERGE 0 (MISMO heading, converge OPUESTO); 3-huyen ⇒ HEADING 0/CONVERGE 0 ⇒ MAX-del-pack (1 víctima) ⊥ MEDIA-ponderada SIGNADA (coordinación colectiva)",
     crux90OK, JSON.stringify(crux90));

  // 9 ★ ⊥#110 ORIENT crux (vecino por dominio CINÉTICO): dispersión de rumbos ABSOLUTOS (hero-frame-INVARIANTE, sin signo) ⊥ media SIGNADA hacia el héroe (1er momento hero-frame). Los 4 cuadrantes.
  const crux110 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.converge({ enabled: true });   // orient ya es LIVE (#110 enabled:true)
    const read = (pts) => { window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.converge({ spawnConverge: { pts: pts.map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });
      return { converge: window.__dev.converge().score, idx: window.__dev.converge().idx, orient: window.__dev.orient().score, spread: window.__dev.orient().spread }; };
    // CERCANDO al héroe (N/E/S/W) todas EMBISTEN ⇒ rumbos absolutos opuestos ⇒ orient2 / todas cierran ⇒ converge2
    const encircleChase = read([[120, 0, 70, "chase"], [-120, 0, 70, "chase"], [0, 120, 70, "chase"], [0, -120, 70, "chase"]]);
    // COLINEAL al ESTE todas EMBISTEN ⇒ rumbos alineados (al oeste) ⇒ orient0 / todas cierran ⇒ converge2
    const colinChase = read([[100, 0, 70, "chase"], [150, 0, 70, "chase"], [220, 0, 70, "chase"]]);
    // CERCANDO (N/E/S/W) todas HUYEN ⇒ rumbos absolutos opuestos ⇒ orient2 / todas abren ⇒ converge0
    const encircleFlee = read([[120, 0, 70, "flee"], [-120, 0, 70, "flee"], [0, 120, 70, "flee"], [0, -120, 70, "flee"]]);
    // COLINEAL al ESTE todas HUYEN ⇒ rumbos alineados (al este) ⇒ orient0 / todas abren ⇒ converge0
    const colinFlee = read([[100, 0, 70, "flee"], [150, 0, 70, "flee"], [220, 0, 70, "flee"]]);
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    return { encircleChase, colinChase, encircleFlee, colinFlee };
  }, { Z });
  const crux110OK = crux110.encircleChase.orient === 2 && crux110.encircleChase.converge === 2
    && crux110.colinChase.orient === 0 && crux110.colinChase.converge === 2
    && crux110.encircleFlee.orient === 2 && crux110.encircleFlee.converge === 0
    && crux110.colinFlee.orient === 0 && crux110.colinFlee.converge === 0;
  ok("9 ★ ⊥#110 ORIENT crux (4 cuadrantes): CERCANDO-embiste ⇒ ORIENT 2/CONVERGE 2; COLINEAL-embiste ⇒ ORIENT 0/CONVERGE 2; CERCANDO-huye ⇒ ORIENT 2/CONVERGE 0; COLINEAL-huye ⇒ ORIENT 0/CONVERGE 0 ⇒ dispersión-de-rumbos-ABSOLUTOS (hero-frame-INVARIANTE) ⊥ media-SIGNADA-hacia-el-héroe",
     crux110OK, JSON.stringify(crux110));

  // 10 CANAL convergeFind: forageChargePreview con embestida >0 ; con millando → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.converge({ enabled: true });
    window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.converge({ spawnConverge: { pts: [[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "chase"]].map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });  // embestida ⇒ score2 ⇒ T2
    const actVm = window.__dev.converge();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.converge({ spawnConverge: { pts: [[100, -30, 70, "chase"], [120, 0, 70, "flee"], [100, 30, 70, "flee"]].map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });  // millando ⇒ score0
    const goVm = window.__dev.converge();
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL convergeFind: forageChargePreview con embestida ⇒ charge>0 (==convergeBonus); con millando/retrocediendo ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds convergeBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let idx = -1; idx <= 1.001; idx += 0.05) vals.push(window.__dev.converge({ idxProbe: { idx } }).idxProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.converge().cap };
  });
  ok("11 ★ SUB-CAP: ningún C produce charge>convergeBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with an embestida available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.converge({ enabled: true });
    window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.converge({ spawnConverge: { pts: [[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "chase"]].map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });  // embestida disponible
    window.__dev.converge({ enabled: false });                             // now OFF
    const off = window.__dev.converge();
    window.__dev.converge({ enabled: true }); window.__dev.converge({ spawnConverge: { pts: [], wipe: true } }); window.__dev.converge({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, convergeBonus(embestida disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip converge OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling motley/packHarvest no cambia la señal de converge.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.converge({ enabled: true });
    window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.converge({ spawnConverge: { pts: [[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "chase"]].map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });
    window.__dev.converge({ enabled: false });
    const snap = () => JSON.stringify({ heading: window.__dev.heading(), speed: window.__dev.speed(), orient: window.__dev.orient(), flank: window.__dev.flank() });
    const peersOff = snap();
    window.__dev.converge({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.converge();
    const mtPrev = window.__dev.motley().enabled, pkPrev = window.__dev.packHarvest().enabled, spPrev = window.__dev.speed().enabled, orPrev = window.__dev.orient().enabled, hdPrev = window.__dev.heading().enabled;
    window.__dev.motley({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.converge();
    const spAfter = window.__dev.speed().enabled, orAfter = window.__dev.orient().enabled, hdAfter = window.__dev.heading().enabled;
    window.__dev.motley({ enabled: mtPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.idx - afterArc.idx) < 0.001;
    return { peersUnchanged, sigUnchanged, spAfter, orAfter, hdAfter };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD convergeFind ⊥ peers: flip converge OFF→ON NO cambia heading/speed/orient/flank; toggling MOTLEY #106/PACKHARVEST #87 NO cambia la señal de converge; heading #90/speed #111/orient #110 LIVE intactos",
     orth.peersUnchanged && orth.sigUnchanged && orth.spAfter === true && orth.orAfter === true && orth.hdAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 53 arc flags served true; CONVERGE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const convergeDark = flag("CONVERGE_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 53 mecanismos del arco #59-#111 served enabled:true; CONVERGE_SURGE served false (DARK #112)",
     arcAllOn && convergeDark && arc.length === 53, `converge=${flag("CONVERGE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Embestida:" drawn ON+embestida / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cierre:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.converge({ enabled: true });
    window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.converge({ spawnConverge: { pts: [[100, -30, 70, "chase"], [120, 0, 70, "chase"], [100, 30, 70, "chase"]].map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });  // embestida ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z });
  ok("15 render badge \"Cierre:\" se DIBUJA ON+embestida (C>0) y NO OFF (C 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.converge({ enabled: true }); window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.converge({ spawnConverge: { pts: [[120, 0, 70, "chase"], [-120, 0, 90, "chase"], [0, 120, 55, "chase"], [0, -120, 110, "chase"], [90, 90, 70, "chase"]].map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } }); }, { Z });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.converge({ spawnConverge: { pts: [], wipe: true } }); window.__dev.converge({ enabled: false }); });

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
    window.__dev.converge({ enabled: true });
    window.__dev.converge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.converge({ spawnConverge: { pts: [[100, -30, 30, "chase"], [120, 0, 70, "chase"], [100, 30, 140, "flee"]].map(([dx, dy, spd, state]) => ({ dx, dy, spd, state, type: "rat" })), wipe: true } });
    const vm = window.__dev.converge();
    const lut = [-1, 0.25, 0.55, 1.0].map(idx => { const p = window.__dev.converge({ idxProbe: { idx } }).idxProbe; return { idx, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.converge({ convergeProbeLive: true }).convergeProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.converge({ spawnConverge: { pts: [], wipe: true } });
    window.__dev.converge({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, idx: vm.idx, liveIdx: live.idx, liveScore: live.score, sumR: live.sumR, sumV: live.sumV, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.idx === B.idx && A.liveIdx === B.liveIdx && A.liveScore === B.liveScore && A.sumR === B.sumR && A.sumV === B.sumV && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (2 cierran v30/70 + 1 huye v140)+héroe ⇒ score/tier/charge/idx + convergeProbeLive(idx,sumR,sumV,score) + idxProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},idx:${A.idx},liveIdx:${A.liveIdx},sumR:${A.sumR},sumV:${A.sumV},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},idx:${B.idx},liveIdx:${B.liveIdx},sumR:${B.sumR},sumV:${B.sumV},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.converge({ enabled: false }));
  await pageB.evaluate(() => window.__dev.converge({ enabled: false }));

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
