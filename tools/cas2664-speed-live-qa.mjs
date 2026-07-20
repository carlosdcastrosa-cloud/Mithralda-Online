// CAS-2664 — POST-FLIP LIVE QA for REMATE DE TROPEL DESIGUAL (LIVE, SPEED_SURGE.enabled:true). EVO mecánica #111 = 53º flag LIVE&served 229165c5c306/815 (flip b5b88b9 + stamp bd8fac9, base HEAD fdd87b5→bd8fac9). Flag-ON port of DARK harness CAS-2660 (fp 15920977 0-desync) — 2 assertions flipped (check2 enabled:true STATELESS, check14 53 flags served true off=[]). Mirror #110 post-flip QA (CAS-2658) exactly. EJE FRESCO + CANAL FRESCO, ⊥ a las 52 LIVE #59-#110.
// (A) EJE FRESCO = CINÉTICO/MAGNITUD DISPERSIÓN DE VELOCIDADES DE MOVIMIENTO de la MANADA VIVA alrededor del héroe = speedSpread(hero) = CV = stddev/media de las MAGNITUDES DE VELOCIDAD DE PASO (speedIntent — MISMA rama de la máquina de IA que headingIntent, MAGNITUD no dirección, NO e.vx/e.vy INERTES: chase/flee ⇒ espd=tpl.spd·slow sim.js:8984, wander ⇒ const 30/40 8994/8997, comprometido ⇒ null) de los mobs VIVOS EN MOVIMIENTO en radio. speedBand: ≥hiCV(0.40) ⇒ tropel/ragged ⇒ 2; ≥midCV(0.18) ⇒ algo-desigual/loose ⇒ 1; <mid (paso parejo) ⇒ 0. Requiere ≥minMobs(3) en movimiento. ESCALA INTENSIVA (2º momento normalizado ⇒ invariante al conteo Y a la magnitud absoluta).
//     PRE-FLIGHT del eje RECOMENDADO pack SPEED DISPERSION → PASA sin pivote (los 3 criterios): (a) la magnitud de velocidad de paso EXISTE server-auth (espd=e.tpl.spd·(slowT>0?slow:1) sim.js:8984; wander const 30/40) y speedIntent la deriva de la MISMA rama de IA que headingIntent; (b) CV band-able con umbrales midCV/hiCV; (c) ⊥ vecino más próximo #110 ORIENT — un vector de velocidad = dirección × magnitud; ORIENT dispersa la DIRECCIÓN (2º momento circular de rumbos unitarios), SPEED dispersa la MAGNITUD (CV de módulos) ⇒ las DOS componentes INDEPENDIENTES.
//     CRUX ⊥#110 ORIENT (vecino por número): manada cargando en la MISMA dirección a velocidades dispares ⇒ orient0/speed2; hueste huyendo a TODOS lados al MISMO ritmo ⇒ orient2/speed0 (4 cuadrantes).
//     CRUX ⊥#94 SWIFT (vecino por dominio VELOCIDAD): SWIFT = banda de la velocidad-base del TIPO de UNA víctima (MAX/1er momento, ABSOLUTA/ESTÁTICA, lee ETPL[type].spd); SPEED = CV de las velocidades ACTUALES de la manada (2º momento, RELATIVA/DINÁMICA) ⇒ 3 murciélagos base158 ⇒ swift2/speed0 (todos veloces, ritmo parejo); 3 esqueletos base86 (swift0) a ritmos ACTUALES {40,86,170} ⇒ swift0/speed2 OPUESTO. Además SPEED lee la velocidad ACTUAL (frost-slow #85 + wander=30) que SWIFT (base ETPL) IGNORA.
// (B) CANAL FRESCO = speedFind (fichas de tropel por rematar en medio de una manada con ritmos DESIGUALES — NINGUNA de las 52 flags lo usa; ⊥ orientFind #110/swiftFind #94/columnFind #109/packFind #87). Moneda FRESCA (h.speedBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio speedBountyCap, 0 doble-dip.
//
// Run: node tools/cas2664-speed-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2664-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// cvProbe LUT esperada: cv→banda→{tier,charge}. UMBRALES hiCV 0.40 / midCV 0.18, bordes exactos.
const EXPECT_CV = [
  { cv: 0, w: 0, t: 0, s: 0 }, { cv: 0.17, w: 0, t: 0, s: 0 },   // <midCV ⇒ paso parejo ⇒ 0 (borde 0.17 justo bajo)
  { cv: 0.18, w: 1, t: 1, s: 1 }, { cv: 0.39, w: 1, t: 1, s: 1 }, // ≥midCV ⇒ algo-desigual ⇒ 1 (bordes 0.18 inclusive / 0.39)
  { cv: 0.40, w: 2, t: 2, s: 2 }, { cv: 1.0, w: 2, t: 2, s: 2 },  // ≥hiCV ⇒ tropel ⇒ 2 (borde 0.40 inclusive)
];
// spawnSpeed esperado por DISPERSIÓN DE VELOCIDADES. spd = magnitud de crucero forzada (state=chase, tpl.spd override). Cubre bandas 0/1/2 + minMobs. CV = stddev/media poblacional.
const EXPECT_SPAWN = [
  { name: "uniform", pts: [[100, -30, 70], [120, 0, 70], [100, 30, 70]], cv: 0.000, w: 0 },              // 3 mobs, TODOS spd70 ⇒ CV=0 ⇒ paso parejo ⇒ 0
  { name: "loose", pts: [[100, -30, 50], [120, 0, 70], [100, 30, 90]], cv: 0.233, w: 1 },                // spd 50/70/90 ⇒ media70 sd16.33 ⇒ CV0.233 ⇒ algo-desigual ⇒ 1
  { name: "ragged", pts: [[100, -30, 30], [120, 0, 70], [100, 30, 140]], cv: 0.568, w: 2 },              // spd 30/70/140 ⇒ media80 sd45.46 ⇒ CV0.568 ⇒ tropel ⇒ 2
  { name: "raggedSlow", pts: [[100, -30, 158, 0.25], [120, 0, 158], [100, 30, 158]], cv: 0.471, w: 2 },  // frost-slow entra a la velocidad ACTUAL: 158·0.25=39.5 / 158 / 158 ⇒ media118.5 sd55.86 ⇒ CV0.471 ⇒ 2
  { name: "twoSpeed", pts: [[100, 0, 50], [120, 0, 90]], cv: 0.000, w: 0 },                              // 2 mobs <minMobs(3) ⇒ dispersión indefinida ⇒ 0
  { name: "one", pts: [[100, 0, 70]], cv: 0.000, w: 0 },                                                 // 1 mob <minMobs ⇒ 0
  { name: "empty", pts: [], cv: 0.000, w: 0 },                                                           // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.speed && window.__dev.orient && window.__dev.swift && window.__dev.column && window.__dev.packHarvest && window.__dev.motley && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.speed + peer hooks (orient/swift/column/packHarvest/motley) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE fresh boot: enabled TRUE (53º flag LIVE) + STATELESS (speedBounty transitorio derivado ⇒ gExists false, empty-field score 0)
  const dark = await page.evaluate(() => window.__dev.speed());
  ok("2 LIVE (fresh boot): SPEED_SURGE.enabled TRUE (53º flag LIVE) AND estado STATELESS (gExists false: speedBounty transitorio derivado; empty-field score/cv 0)",
     dark.enabled === true && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.cv === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "speedFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} cv=${dark.cv} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCV=${dark.hiCV} midCV=${dark.midCV} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no speedFind/speedBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(speedFind|speedBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"speedBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'speedFind'/'speedBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.speed({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.speed({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ cvProbe LUT: cv→band→tier→charge (UMBRALES hiCV/midCV + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.speed({ cvProbe: { cv: c.cv } }).cvProbe), EXPECT_CV);
  const tabOK = EXPECT_CV.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ cvProbe LUT: CV≥0.40⇒tropel⇒2/T2; ≥0.18⇒algo-desigual⇒1/T1; <0.18⇒paso-parejo⇒0/T0 (UMBRAL hiCV 0.40/midCV 0.18, bordes 0.17/0.18/0.39/0.40 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ cv: x.cv, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnSpeed (wipe) inyecta mobs REALES con velocidad de crucero forzada (state=chase, tpl.spd override); speedSpread = CV de las velocidades; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.speed({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy, spd, slow]) => (slow != null ? { dx, dy, spd, slow, type: "rat" } : { dx, dy, spd, type: "rat" }));
      const sr = window.__dev.speed({ spawnSpeed: { pts, wipe: true } }).spawnSpeed;
      const live = window.__dev.speed({ speedProbeLive: true }).speedProbeLive;
      out.push({ name: c.name, srCV: sr.cv, srScore: sr.score, liveCV: live.cv, liveScore: live.score, liveMean: live.mean, mobCount: live.mobCount });
    }
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srCV - c.cv) < 0.02 && Math.abs(comp[i].liveCV - c.cv) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnSpeed empuja mobs REALES con velocidad forzada; speedSpread = CV ⇒ uniforme⇒CV0/0, 50-70-90⇒CV0.23/1, 30-70-140⇒CV0.57/2, frost-slow⇒CV0.47/2, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 7 ★ ⊥#110 ORIENT crux (vecino por número): DIRECCIÓN (rumbo, 2º momento circular) ⊥ MAGNITUD (velocidad, CV). Los 4 cuadrantes.
  const crux110 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.speed({ enabled: true });   // orient ya es LIVE (#110 enabled:true)
    const read = (pts) => { window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.speed({ spawnSpeed: { pts: pts.map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } });
      return { speed: window.__dev.speed().score, cv: window.__dev.speed().cv, orient: window.__dev.orient().score, spread: window.__dev.orient().spread }; };
    // COLINEALES al ESTE (rumbo OESTE, alineados ⇒ orient0), MISMA velocidad ⇒ speed0
    const sameDirSameSpd = read([[100, 0, 70], [150, 0, 70], [220, 0, 70]]);
    // COLINEALES al ESTE (orient0), velocidades DISPARES {30,70,140} ⇒ speed2 — MISMO orient, speed OPUESTO
    const sameDirDiffSpd = read([[100, 0, 30], [150, 0, 70], [220, 0, 140]]);
    // CERCANDO al héroe (N/E/S/W, rumbos opuestos ⇒ orient2), MISMA velocidad ⇒ speed0
    const surroundSameSpd = read([[120, 0, 70], [-120, 0, 70], [0, 120, 70], [0, -120, 70]]);
    // CERCANDO (orient2), velocidades DISPARES ⇒ speed2
    const surroundDiffSpd = read([[120, 0, 30], [-120, 0, 70], [0, 120, 140], [0, -120, 70]]);
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    return { sameDirSameSpd, sameDirDiffSpd, surroundSameSpd, surroundDiffSpd };
  }, { Z });
  const crux110OK = crux110.sameDirSameSpd.orient === 0 && crux110.sameDirSameSpd.speed === 0
    && crux110.sameDirDiffSpd.orient === 0 && crux110.sameDirDiffSpd.speed === 2
    && crux110.surroundSameSpd.orient === 2 && crux110.surroundSameSpd.speed === 0
    && crux110.surroundDiffSpd.orient === 2 && crux110.surroundDiffSpd.speed === 2;
  ok("7 ★ ⊥#110 crux (vecino por número): MISMA-dir+MISMA-vel ⇒ ORIENT 0/SPEED 0; MISMA-dir+vel-DISPAR ⇒ ORIENT 0/SPEED 2; CERCANDO+MISMA-vel ⇒ ORIENT 2/SPEED 0; CERCANDO+vel-DISPAR ⇒ ORIENT 2/SPEED 2 ⇒ DIRECCIÓN (rumbo) ⊥ MAGNITUD (velocidad) — LOS 4 CUADRANTES (componentes INDEPENDIENTES de la velocidad)",
     crux110OK, JSON.stringify(crux110));

  // 8 ★ ⊥#94 SWIFT crux (vecino por dominio VELOCIDAD): velocidad-base del TIPO (MAX/1er momento, ETPL) ⊥ CV de las velocidades ACTUALES (2º momento). Los 4 combos.
  const crux94 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.speed({ enabled: true });   // swift ya es LIVE (#94 enabled:true)
    const read = (type, spds) => { window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = spds.map((spd, i) => ({ dx: 100 + i * 20, dy: (i - 1) * 30, spd, type }));
      window.__dev.speed({ spawnSpeed: { pts, wipe: true } });
      return { speed: window.__dev.speed().score, cv: window.__dev.speed().cv, swift: window.__dev.swift().score }; };
    // 3 murciélagos (ETPL base158 ⇒ swift2), velocidad ACTUAL uniforme 158 ⇒ speed0
    const fastUniform = read("bat", [158, 158, 158]);
    // 3 esqueletos (ETPL base86 ⇒ swift0), velocidad ACTUAL DISPAR {40,86,170} ⇒ speed2 — swift0/speed2 OPUESTO a fastUniform
    const slowRagged = read("skeleton", [40, 86, 170]);
    // 3 murciélagos (swift2), velocidad ACTUAL DISPAR {40,100,180} ⇒ speed2 — swift2/speed2 (mismo tipo veloz, ritmo dispar)
    const fastRagged = read("bat", [40, 100, 180]);
    // 3 esqueletos (swift0), velocidad ACTUAL uniforme 86 ⇒ speed0 — swift0/speed0
    const slowUniform = read("skeleton", [86, 86, 86]);
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    return { fastUniform, slowRagged, fastRagged, slowUniform };
  }, { Z });
  const crux94OK = crux94.fastUniform.swift === 2 && crux94.fastUniform.speed === 0
    && crux94.slowRagged.swift === 0 && crux94.slowRagged.speed === 2
    && crux94.fastRagged.swift === 2 && crux94.fastRagged.speed === 2
    && crux94.slowUniform.swift === 0 && crux94.slowUniform.speed === 0;
  ok("8 ★ ⊥#94 SWIFT crux (vecino por dominio VELOCIDAD): bat-uniforme ⇒ SWIFT 2/SPEED 0; esqueleto-dispar ⇒ SWIFT 0/SPEED 2 (OPUESTO); bat-dispar ⇒ SWIFT 2/SPEED 2; esqueleto-uniforme ⇒ SWIFT 0/SPEED 0 ⇒ velocidad-base-MAX-del-TIPO (1er momento, ETPL) ⊥ CV-de-velocidades-ACTUALES (2º momento) — los 4 combos",
     crux94OK, JSON.stringify(crux94));

  // 9 ★ INTENSIVO / ⊥#87 PACKHARVEST (CONTEO): 3 vs 6 mobs con la MISMA mezcla de velocidades ⇒ MISMO CV/score (invariante al conteo) pero packHarvest (CONTEO/cohesión) DISTINTO.
  const crux87 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.speed({ enabled: true });
    const read = (pts) => { window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.speed({ spawnSpeed: { pts: pts.map(([dx, dy, spd]) => ({ dx, dy, spd, type: "skeleton" })), wipe: true } });
      return { speed: window.__dev.speed().score, cv: window.__dev.speed().cv, pack: window.__dev.packHarvest().score }; };
    // 3 mobs apiñados, velocidades {40,80,160}
    const three = read([[100, -20, 40], [110, 0, 80], [100, 20, 160]]);
    // 6 mobs apiñados, velocidades {40,40,80,80,160,160} — MISMA media/CV, DOBLE conteo
    const six = read([[100, -20, 40], [110, -10, 40], [100, 0, 80], [110, 10, 80], [100, 20, 160], [110, 30, 160]]);
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    return { three, six };
  }, { Z });
  const crux87OK = crux87.three.speed === 2 && crux87.six.speed === 2 && crux87.three.cv === crux87.six.cv && crux87.six.pack > crux87.three.pack;
  ok("9 ★ INTENSIVO ⊥#87 PACKHARVEST: 3 vs 6 mobs con la MISMA mezcla de velocidades ⇒ MISMO CV/SPEED 2 (invariante al conteo) pero packHarvest 6>3 (CONTEO/cohesión, EXTENSIVA) ⇒ dispersión-CV ⊥ densidad",
     crux87OK, JSON.stringify(crux87));

  // 10 CANAL speedFind: forageChargePreview con tropel >0 ; con paso-parejo → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.speed({ enabled: true });
    window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.speed({ spawnSpeed: { pts: [[100, -30, 30], [120, 0, 70], [100, 30, 140]].map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } });  // ragged ⇒ score2 ⇒ T2
    const actVm = window.__dev.speed();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.speed({ spawnSpeed: { pts: [[100, -30, 70], [120, 0, 70], [100, 30, 70]].map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } });  // uniform ⇒ score0
    const goVm = window.__dev.speed();
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL speedFind: forageChargePreview con tropel ⇒ charge>0 (==speedBonus); con paso-parejo ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds speedBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let cv = 0; cv <= 1.5; cv += 0.05) vals.push(window.__dev.speed({ cvProbe: { cv } }).cvProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.speed().cap };
  });
  ok("11 ★ SUB-CAP: ningún CV produce charge>speedBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a ragged pack available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.speed({ enabled: true });
    window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.speed({ spawnSpeed: { pts: [[100, -30, 30], [120, 0, 70], [100, 30, 140]].map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } });  // tropel disponible
    window.__dev.speed({ enabled: false });                             // now OFF
    const off = window.__dev.speed();
    window.__dev.speed({ enabled: true }); window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } }); window.__dev.speed({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, cv: off.cv };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.cv === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, speedBonus(tropel disponible)==0 + forageChargePreview==0 + cv==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip speed OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling motley/packHarvest no cambia la señal de speed.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.speed({ enabled: true });
    window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.speed({ spawnSpeed: { pts: [[100, -30, 30], [120, 0, 70], [100, 30, 140]].map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } });
    window.__dev.speed({ enabled: false });
    const snap = () => JSON.stringify({ orient: window.__dev.orient(), swift: window.__dev.swift(), column: window.__dev.column() });
    const peersOff = snap();
    window.__dev.speed({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.speed();
    const mtPrev = window.__dev.motley().enabled, pkPrev = window.__dev.packHarvest().enabled, orPrev = window.__dev.orient().enabled, swPrev = window.__dev.swift().enabled;
    window.__dev.motley({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.speed();
    const orAfter = window.__dev.orient().enabled, swAfter = window.__dev.swift().enabled;
    window.__dev.motley({ enabled: mtPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.cv - afterArc.cv) < 0.001;
    return { peersUnchanged, sigUnchanged, orAfter, swAfter };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD speedFind ⊥ peers: flip speed OFF→ON NO cambia orient/swift/column; toggling MOTLEY #106/PACKHARVEST #87 NO cambia la señal de speed; orient #110/swift #94 LIVE intactos",
     orth.peersUnchanged && orth.sigUnchanged && orth.orAfter === true && orth.swAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 52 arc flags served true + SPEED_SURGE served true (LIVE #111) ⇒ 53 flags served true off=[]
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const speedLive = flag("SPEED_SURGE") === "true";
  ok("14 ★ 0-REGRESIÓN: 52 mecanismos del arco #59-#110 served enabled:true; SPEED_SURGE served TRUE (LIVE #111, 53º flag) ⇒ 53 flags served true off=[]",
     arcAllOn && speedLive && arc.length === 52, `speed=${flag("SPEED_SURGE")} arcAllOn=${arcAllOn} n=${arc.length + 1} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true").concat(speedLive ? [] : [["SPEED_SURGE", flag("SPEED_SURGE")]]))}`);

  // 15 render badge "Tropel:" drawn ON+ragged / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Tropel:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.speed({ enabled: true });
    window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.speed({ spawnSpeed: { pts: [[100, -30, 30], [120, 0, 70], [100, 30, 140]].map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } });  // ragged ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z });
  ok("15 render badge \"Tropel:\" se DIBUJA ON+tropel (cv>0) y NO OFF (cv 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.speed({ enabled: true }); window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.speed({ spawnSpeed: { pts: [[100, 0, 30], [150, 0, 70], [220, 0, 140], [180, 40, 55], [130, -40, 110]].map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } }); }, { Z });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } }); window.__dev.speed({ enabled: false }); });

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
    window.__dev.speed({ enabled: true });
    window.__dev.speed({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.speed({ spawnSpeed: { pts: [[100, -30, 30], [120, 0, 70], [100, 30, 140]].map(([dx, dy, spd]) => ({ dx, dy, spd, type: "rat" })), wipe: true } });
    const vm = window.__dev.speed();
    const lut = [0, 0.18, 0.40, 1.0].map(cv => { const p = window.__dev.speed({ cvProbe: { cv } }).cvProbe; return { cv, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.speed({ speedProbeLive: true }).speedProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.speed({ spawnSpeed: { pts: [], wipe: true } });
    window.__dev.speed({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, cv: vm.cv, liveCV: live.cv, liveScore: live.score, liveMean: live.mean, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.cv === B.cv && A.liveCV === B.liveCV && A.liveScore === B.liveScore && A.liveMean === B.liveMean && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO tropel (3 mobs velocidades 30/70/140)+héroe ⇒ score/tier/charge/cv + speedProbeLive(cv,mean,score) + cvProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},cv:${A.cv},liveCV:${A.liveCV},liveMean:${A.liveMean},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},cv:${B.cv},liveCV:${B.liveCV},liveMean:${B.liveMean},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.speed({ enabled: false }));
  await pageB.evaluate(() => window.__dev.speed({ enabled: false }));

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
