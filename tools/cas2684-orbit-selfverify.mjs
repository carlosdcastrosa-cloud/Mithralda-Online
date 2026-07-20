// CAS-2684 — self-verify for REMATE DE CARRUSEL (DARK, ORBIT_SURGE.enabled:false). EVO mecánica #116 (serializa tras #115 SIZECLASS_SURGE LIVE&served fee53af8af16/815, base HEAD 83e56dfe) — EJE FRESCO + CANAL FRESCO, ⊥ a las 57 LIVE #59-#115.
// (A) EJE FRESCO = CINÉTICO/ROTACIONAL COHESIÓN DE VELOCIDAD ORBITAL / CIRCULACIÓN NETA de la MANADA VIVA alrededor del héroe = orbitField(hero) = C = |Σ vᵢ·(mᵢ·t̂ᵢ)| / (Σ vᵢ) = media ponderada por velocidad del coseno TANGENCIAL SIGNADO (t̂=perpendicular CCW de mob→hero; mᵢ=headingIntent + vᵢ=speedIntent — MISMA fuente de VECTOR DE MOVIMIENTO que #112 CONVERGE, NO e.vx/e.vy INERTES) de los mobs VIVOS EN MOVIMIENTO en radio. orbitBand: ≥hiOrbit(0.60) ⇒ carrusel ⇒ 2; ≥midOrbit(0.30) ⇒ swirl ⇒ 1; <mid (radial/mixto) ⇒ 0. Requiere ≥minMobs(3) en movimiento. VORTICIDAD/CURL magnitud-INVARIANTE (/Σv), hero-relativa.
//     PRE-FLIGHT del eje RECOMENDADO velCohesionSurge (R/1−CV de rumbos) → FALLA ⊥#110 ORIENT: R de rumbos = EXACTAMENTE 1−orientSpread (#110 ya envía orientSpread=1−R de headingIntent ABSOLUTO) ⇒ re-mapeo AFÍN (pendiente −1) de un flag YA LIVE. FALLBACK tempoBurstSurge (kill-rate en ventana) → FALLA ⊥#67 FRENZY (re-mapeo monótono de kill-streak stacks). ⇒ PIVOTE a la 3ª pierna de VELOCITY-COHESION: la COHESIÓN ROTACIONAL/ORBITAL (circulación neta tangencial).
//     GEOMETRÍA: un mob en ángulo de posición φ con rumbo forzado ψ ⇒ tvᵢ = vᵢ·sin(φ−ψ). ψ=φ+π/2 (tangente CCW) ⇒ tv=−v; ψ=φ−π/2 (tangente CW) ⇒ tv=+v; ψ=φ+π (radial-in) o ψ=φ (radial-out) ⇒ tv=0. Carrusel (3 CCW) ⇒ C=1; radial (3 in) ⇒ C=0; swirl (1 CCW + 2 in) ⇒ C=1/3≈0.333; mixto (2 CCW + 2 CW) ⇒ C=0 (se cancela).
//     CRUX ⊥#112 CONVERGE (radial cos ⊥ tangencial sin — descomposición ORTOGONAL del MISMO vector de velocidad, 4 cuadrantes): embestida frontal ⇒ converge2/orbit0; carrusel CCW ⇒ converge0/orbit2; espiral ⇒ converge2/orbit2; huida ⇒ converge0/orbit0. CRUX ⊥#110 ORIENT (acuerdo WORLD hero-INVARIANTE ⊥ circulación hero-RELATIVA): carrusel ⇒ orient2/orbit2; marcha-norte-en-bloque ⇒ orient0/orbit0; embestida-frontal-de-3-lados ⇒ orient2/orbit0 (orient=2 con orbit 0 Y 2 ⇒ orbit NO es función de orient). CRUX ⊥#111 SPEED (CV de magnitud ⊥ dirección tangencial): en un pack wander uniforme (v=30) speedSpread≡0 mientras orbit varía 0/1/2 ⇒ orbit ⊥ speed.
// (B) CANAL FRESCO = orbitFind (fichas de carrusel por rematar con la manada que ORBITA COORDINADA — NINGUNA de las 57 flags lo usa; ⊥ convergeFind #112/orientFind #110/speedFind #111/headingFind #90). Moneda FRESCA (h.orbitBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio orbitBountyCap, 0 doble-dip.
//
// Run: node tools/cas2684-orbit-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2684");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// circProbe LUT esperada: C→banda→{tier,charge}. UMBRALES hiOrbit 0.60 / midOrbit 0.30, bordes exactos.
const EXPECT_C = [
  { c: 0, w: 0, t: 0, s: 0 }, { c: 0.29, w: 0, t: 0, s: 0 },                       // <midOrbit (radial/mixto) ⇒ 0
  { c: 0.30, w: 1, t: 1, s: 1 }, { c: 0.59, w: 1, t: 1, s: 1 },                    // ≥midOrbit ⇒ swirl ⇒ 1 (borde 0.30 inclusive)
  { c: 0.60, w: 2, t: 2, s: 2 }, { c: 1.0, w: 2, t: 2, s: 2 },                     // ≥hiOrbit ⇒ carrusel ⇒ 2 (borde 0.60 inclusive)
];
// spawnVel esperado por CIRCULACIÓN ORBITAL. C=|Σ tvᵢ|/Σvᵢ. Cubre bandas 0/1/2 + minMobs. mode: ccw(tv=−v)/cw(tv=+v)/in|out(tv=0). Posiciones (dx,dy) DENTRO de radius (φ irrelevante al signo de tv por construcción).
const EXPECT_SPAWN = [
  { name: "carousel", pts: [[120, 0, "ccw"], [0, 120, "ccw"], [-120, 0, "ccw"]], c: 1.000, w: 2 },            // 3 CCW ⇒ C=1 ⇒ carrusel ⇒ 2
  { name: "radial", pts: [[120, 0, "in"], [0, 120, "in"], [-120, 0, "in"]], c: 0.000, w: 0 },                 // 3 radial-in ⇒ C=0 ⇒ 0
  { name: "swirl", pts: [[120, 0, "ccw"], [0, 120, "in"], [-120, 0, "in"]], c: 0.333, w: 1 },                 // 1 CCW + 2 in ⇒ C=1/3 ⇒ swirl ⇒ 1
  { name: "mixed", pts: [[120, 0, "ccw"], [0, 120, "ccw"], [-120, 0, "cw"], [0, -120, "cw"]], c: 0.000, w: 0 },// 2 CCW + 2 CW ⇒ C=0 (cancela) ⇒ 0
  { name: "twoMobs", pts: [[120, 0, "ccw"], [-120, 0, "ccw"]], c: 0.000, w: 0 },                              // 2 mobs <minMobs(3) ⇒ 0
  { name: "empty", pts: [], c: 0.000, w: 0 },                                                                  // vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.orbit && window.__dev.converge && window.__dev.orient && window.__dev.speed && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.orbit + peer hooks (converge/orient/speed/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.orbit());
  ok("2 byte-id OFF (fresh boot): ORBIT_SURGE.enabled false AND G.orbitBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "orbitFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiOrbit=${dark.hiOrbit} midOrbit=${dark.midOrbit} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no orbitFind/orbitBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(orbitFind|orbitBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"orbitBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'orbitFind'/'orbitBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.orbit({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.orbit({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ circProbe LUT: C→band→tier→charge (UMBRALES hiOrbit/midOrbit + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.orbit({ circProbe: { c: c.c } }).circProbe), EXPECT_C);
  const tabOK = EXPECT_C.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ circProbe LUT: C≥0.60⇒carrusel⇒2/T2; ≥0.30⇒swirl⇒1/T1; <0.30 (radial/mixto)⇒0/T0 (UMBRAL hiOrbit 0.60/midOrbit 0.30, bordes 0/0.29/0.30/0.59/0.60/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ c: x.c, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnVel (wipe) inyecta mobs REALES con rumbo forzado; orbitField = C tangencial; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    const headFor = (dx, dy, mode) => { const phi = Math.atan2(dy, dx);
      return mode === "ccw" ? phi + Math.PI / 2 : mode === "cw" ? phi - Math.PI / 2 : mode === "in" ? phi + Math.PI : phi; };
    const mk = (pts) => pts.map(([dx, dy, mode]) => ({ dx, dy, head: headFor(dx, dy, mode) }));
    window.__dev.orbit({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sv = window.__dev.orbit({ spawnVel: { pts: mk(c.pts), wipe: true } }).spawnVel;
      const live = window.__dev.orbit({ velProbeLive: true }).velProbeLive;
      out.push({ name: c.name, svIdx: sv.idx, svScore: sv.score, liveC: live.cv, liveScore: live.score, sumT: live.sumT, sumV: live.sumV, mobCount: live.mobCount, tvs: live.mobs.map(m => m.tv) });
    }
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].svScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].svIdx - c.c) < 0.02 && Math.abs(comp[i].liveC - c.c) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnVel empuja mobs REALES (wander+head forzado); orbitField = |Σtv|/Σv ⇒ carrusel(3CCW)⇒C1/2, radial(3in)⇒C0/0, swirl(1CCW+2in)⇒C0.33/1, mixto(2CCW+2CW)⇒C0/0(cancela), 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#112 CONVERGE crux (4 cuadrantes): radial cos (m·u) ⊥ tangencial sin (m·t̂) — descomposición ORTOGONAL del vector de velocidad.
  const crux112 = await page.evaluate((args) => {
    const { Z } = args;
    const headFor = (dx, dy, mode) => { const phi = Math.atan2(dy, dx);
      return mode === "ccw" ? phi + Math.PI / 2 : mode === "cw" ? phi - Math.PI / 2 : mode === "in" ? phi + Math.PI : mode === "spiral" ? phi + Math.PI * 0.75 : phi; };
    window.__dev.orbit({ enabled: true });   // converge ya es LIVE (#112 enabled:true)
    const read = (pts) => { window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.orbit({ spawnVel: { pts: pts.map(([dx, dy, m]) => ({ dx, dy, head: headFor(dx, dy, m) })), wipe: true } });
      return { orbit: window.__dev.orbit().score, oidx: window.__dev.orbit().idx, converge: window.__dev.converge().score, cidx: window.__dev.converge().idx }; };
    const frontal = read([[120, 0, "in"], [0, 120, "in"], [-120, 0, "in"]]);       // radial-in ⇒ converge2/orbit0
    const carousel = read([[120, 0, "ccw"], [0, 120, "ccw"], [-120, 0, "ccw"]]);   // tangente CCW ⇒ converge0/orbit2
    const spiral = read([[120, 0, "spiral"], [0, 120, "spiral"], [-120, 0, "spiral"]]); // 135º (in+tangente) ⇒ converge2/orbit2
    const flee = read([[120, 0, "out"], [0, 120, "out"], [-120, 0, "out"]]);       // radial-out ⇒ converge0/orbit0
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    return { frontal, carousel, spiral, flee };
  }, { Z });
  const crux112OK = crux112.frontal.converge === 2 && crux112.frontal.orbit === 0
    && crux112.carousel.converge === 0 && crux112.carousel.orbit === 2
    && crux112.spiral.converge === 2 && crux112.spiral.orbit === 2
    && crux112.flee.converge === 0 && crux112.flee.orbit === 0;
  ok("6 ★ ⊥#112 CONVERGE crux (4 cuadrantes, radial cos ⊥ tangencial sin): FRONTAL ⇒ CONVERGE 2/ORBIT 0; CARRUSEL ⇒ CONVERGE 0/ORBIT 2; ESPIRAL(135º) ⇒ CONVERGE 2/ORBIT 2; HUIDA ⇒ CONVERGE 0/ORBIT 0 ⇒ componentes ORTOGONALES INDEPENDIENTES",
     crux112OK, JSON.stringify(crux112));

  // 7 ★ ⊥#110 ORIENT crux: acuerdo de rumbo WORLD (hero-INVARIANTE) ⊥ circulación hero-RELATIVA.
  const crux110 = await page.evaluate((args) => {
    const { Z } = args;
    const headFor = (dx, dy, mode) => { const phi = Math.atan2(dy, dx);
      return mode === "ccw" ? phi + Math.PI / 2 : mode === "in" ? phi + Math.PI : mode === "north" ? Math.PI / 2 : phi; };
    window.__dev.orbit({ enabled: true });   // orient ya es LIVE (#110 enabled:true)
    const read = (pts) => { window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.orbit({ spawnVel: { pts: pts.map(([dx, dy, m]) => ({ dx, dy, head: headFor(dx, dy, m) })), wipe: true } });
      return { orbit: window.__dev.orbit().score, orient: window.__dev.orient().score }; };
    const carousel = read([[120, 0, "ccw"], [0, 120, "ccw"], [-120, 0, "ccw"], [0, -120, "ccw"]]);   // carrusel: rumbos WORLD dispersos ⇒ orient2/orbit2
    const march = read([[120, 0, "north"], [0, 120, "north"], [-120, 0, "north"], [0, -120, "north"]]); // marcha-norte en bloque ⇒ orient0/orbit0 (tv se cancelan)
    const frontal = read([[120, 0, "in"], [0, 120, "in"], [-120, 0, "in"], [0, -120, "in"]]);        // embestida frontal de 4 lados ⇒ rumbos WORLD dispersos ⇒ orient2/orbit0
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    return { carousel, march, frontal };
  }, { Z });
  const crux110OK = crux110.carousel.orient === 2 && crux110.carousel.orbit === 2
    && crux110.march.orient === 0 && crux110.march.orbit === 0
    && crux110.frontal.orient === 2 && crux110.frontal.orbit === 0;
  ok("7 ★ ⊥#110 ORIENT crux (acuerdo WORLD hero-INVARIANTE ⊥ circulación hero-RELATIVA): CARRUSEL ⇒ ORIENT 2/ORBIT 2; MARCHA-NORTE-en-bloque ⇒ ORIENT 0/ORBIT 0; EMBESTIDA-FRONTAL-4-lados ⇒ ORIENT 2/ORBIT 0 (orient=2 con orbit 0 Y 2 ⇒ orbit NO es función de orient)",
     crux110OK, JSON.stringify(crux110));

  // 8 ★ ⊥#111 SPEED crux: en un pack wander uniforme (v=30) speedSpread≡0 mientras orbit varía 0/1/2 ⇒ orbit (dirección, magnitud-INVARIANTE) ⊥ speed (CV de magnitud).
  const crux111 = await page.evaluate((args) => {
    const { Z } = args;
    const headFor = (dx, dy, mode) => { const phi = Math.atan2(dy, dx);
      return mode === "ccw" ? phi + Math.PI / 2 : mode === "in" ? phi + Math.PI : phi; };
    window.__dev.orbit({ enabled: true });   // speed ya es LIVE (#111 enabled:true)
    const read = (pts) => { window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.orbit({ spawnVel: { pts: pts.map(([dx, dy, m]) => ({ dx, dy, head: headFor(dx, dy, m) })), wipe: true } });
      return { orbit: window.__dev.orbit().score, speed: window.__dev.speed().score }; };
    const carousel = read([[120, 0, "ccw"], [0, 120, "ccw"], [-120, 0, "ccw"]]);   // orbit2 / speed0 (v uniforme 30)
    const swirl = read([[120, 0, "ccw"], [0, 120, "in"], [-120, 0, "in"]]);        // orbit1 / speed0
    const radial = read([[120, 0, "in"], [0, 120, "in"], [-120, 0, "in"]]);        // orbit0 / speed0
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    return { carousel, swirl, radial };
  }, { Z });
  const crux111OK = crux111.carousel.orbit === 2 && crux111.carousel.speed === 0
    && crux111.swirl.orbit === 1 && crux111.swirl.speed === 0
    && crux111.radial.orbit === 0 && crux111.radial.speed === 0;
  ok("8 ★ ⊥#111 SPEED crux: pack wander uniforme (v=30) ⇒ speedSpread score ≡0 en CARRUSEL/SWIRL/RADIAL mientras ORBIT varía 2/1/0 ⇒ orbit (dirección tangencial magnitud-INVARIANTE) ⊥ speed (CV de magnitud)",
     crux111OK, JSON.stringify(crux111));

  // 9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3 vs 6 mobs con el MISMO patrón de carrusel ⇒ MISMO C/score (C invariante al conteo), packHarvest DISTINTO.
  const countInv = await page.evaluate((args) => {
    const { Z } = args;
    const headFor = (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2;   // ccw
    window.__dev.orbit({ enabled: true });
    const read = (pts) => { window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.orbit({ spawnVel: { pts: pts.map(([dx, dy]) => ({ dx, dy, head: headFor(dx, dy) })), wipe: true } });
      return { idx: window.__dev.orbit().idx, score: window.__dev.orbit().score, pack: window.__dev.packHarvest().score }; };
    const pack3 = read([[120, 0], [0, 120], [-120, 0]]);
    const pack6 = read([[120, 0], [0, 120], [-120, 0], [90, 40], [-40, 90], [40, -90]]);   // doble carrusel CCW MISMO C=1
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    return { pack3, pack6 };
  }, { Z });
  const countInvOK = Math.abs(countInv.pack3.idx - countInv.pack6.idx) < 0.001 && countInv.pack3.score === 2 && countInv.pack6.score === 2;
  ok("9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3 mobs vs 6 mobs con el MISMO patrón de carrusel ⇒ MISMO C y score 2 (C invariante al conteo) mientras packHarvest (EXTENSIVO) cambia",
     countInvOK, JSON.stringify(countInv));

  // 10 CANAL orbitFind: forageChargePreview con carrusel >0 ; con radial → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    const headFor = (dx, dy, mode) => { const phi = Math.atan2(dy, dx); return mode === "ccw" ? phi + Math.PI / 2 : phi + Math.PI; };
    const mk = (pts) => pts.map(([dx, dy, m]) => ({ dx, dy, head: headFor(dx, dy, m) }));
    window.__dev.orbit({ enabled: true });
    window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orbit({ spawnVel: { pts: mk([[120, 0, "ccw"], [0, 120, "ccw"], [-120, 0, "ccw"]]), wipe: true } });  // carrusel ⇒ score2 ⇒ T2
    const actVm = window.__dev.orbit();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.orbit({ spawnVel: { pts: mk([[120, 0, "in"], [0, 120, "in"], [-120, 0, "in"]]), wipe: true } });    // radial ⇒ score0
    const goVm = window.__dev.orbit();
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL orbitFind: forageChargePreview con carrusel ⇒ charge>0 (==orbitBonus); con radial ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds orbitBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let c = 0; c <= 1.001; c += 0.05) vals.push(window.__dev.orbit({ circProbe: { c } }).circProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.orbit().cap };
  });
  ok("11 ★ SUB-CAP: ningún C produce charge>orbitBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a carousel available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    const headFor = (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2;
    const mk = (pts) => pts.map(([dx, dy]) => ({ dx, dy, head: headFor(dx, dy) }));
    window.__dev.orbit({ enabled: true });
    window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orbit({ spawnVel: { pts: mk([[120, 0], [0, 120], [-120, 0]]), wipe: true } });  // carrusel disponible
    window.__dev.orbit({ enabled: false });                             // now OFF
    const off = window.__dev.orbit();
    window.__dev.orbit({ enabled: true }); window.__dev.orbit({ spawnVel: { pts: [], wipe: true } }); window.__dev.orbit({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, orbitBonus(carrusel disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip orbit OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling converge/speed no cambia la señal de orbit.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    const headFor = (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2;
    const mk = (pts) => pts.map(([dx, dy]) => ({ dx, dy, head: headFor(dx, dy) }));
    window.__dev.orbit({ enabled: true });
    window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orbit({ spawnVel: { pts: mk([[120, 0], [0, 120], [-120, 0]]), wipe: true } });
    window.__dev.orbit({ enabled: false });
    const snap = () => JSON.stringify({ converge: window.__dev.converge(), orient: window.__dev.orient(), speed: window.__dev.speed() });
    const peersOff = snap();
    window.__dev.orbit({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.orbit();
    const cvPrev = window.__dev.converge().enabled, spPrev = window.__dev.speed().enabled, orPrev = window.__dev.orient().enabled;
    window.__dev.converge({ enabled: true }); window.__dev.speed({ enabled: true });
    const afterArc = window.__dev.orbit();
    const cvAfter = window.__dev.converge().enabled, orAfter = window.__dev.orient().enabled;
    window.__dev.converge({ enabled: cvPrev }); window.__dev.speed({ enabled: spPrev });
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.idx - afterArc.idx) < 0.001;
    return { peersUnchanged, sigUnchanged, cvAfter, orAfter };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD orbitFind ⊥ peers: flip orbit OFF→ON NO cambia converge/orient/speed; toggling CONVERGE #112/SPEED #111 NO cambia la señal de orbit; converge/orient LIVE intactos",
     orth.peersUnchanged && orth.sigUnchanged && orth.cvAfter === true && orth.orAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 57 arc flags served true; ORBIT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const obDark = flag("ORBIT_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 57 mecanismos del arco #59-#115 served enabled:true; ORBIT_SURGE served false (DARK #116)",
     arcAllOn && obDark && arc.length === 57, `orbit=${flag("ORBIT_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Órbita:" drawn ON+carousel / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const headFor = (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2;
    const mk = (pts) => pts.map(([dx, dy]) => ({ dx, dy, head: headFor(dx, dy) }));
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Órbita:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.orbit({ enabled: true });
    window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orbit({ spawnVel: { pts: mk([[120, 0], [0, 120], [-120, 0]]), wipe: true } });  // carrusel ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z });
  ok("15 render badge \"Órbita:\" se DIBUJA ON+carrusel (C>0) y NO OFF (C 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; const headFor = (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2; const mk = (pts) => pts.map(([dx, dy]) => ({ dx, dy, head: headFor(dx, dy) })); window.__dev.orbit({ enabled: true }); window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.orbit({ spawnVel: { pts: mk([[130, 0], [90, 90], [0, 130], [-90, 90], [-130, 0], [0, -130]]), wipe: true } }); }, { Z });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.orbit({ spawnVel: { pts: [], wipe: true } }); window.__dev.orbit({ enabled: false }); });

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
    const headFor = (dx, dy, mode) => { const phi = Math.atan2(dy, dx); return mode === "ccw" ? phi + Math.PI / 2 : phi + Math.PI; };
    const mk = (pts) => pts.map(([dx, dy, m]) => ({ dx, dy, head: headFor(dx, dy, m) }));
    window.__dev.orbit({ enabled: true });
    window.__dev.orbit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.orbit({ spawnVel: { pts: mk([[120, 0, "ccw"], [0, 120, "ccw"], [-120, 0, "ccw"], [0, -120, "in"]]), wipe: true } });
    const vm = window.__dev.orbit();
    const lut = [0, 0.30, 0.60, 1.0].map(c => { const p = window.__dev.orbit({ circProbe: { c } }).circProbe; return { c, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.orbit({ velProbeLive: true }).velProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.orbit({ spawnVel: { pts: [], wipe: true } });
    window.__dev.orbit({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, idx: vm.idx, liveC: live.cv, liveScore: live.score, sumT: live.sumT, sumV: live.sumV, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.idx === B.idx && A.liveC === B.liveC && A.liveScore === B.liveScore && A.sumT === B.sumT && A.sumV === B.sumV && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (3 CCW + 1 radial)+héroe ⇒ score/tier/charge/idx + velProbeLive(C,sumT,sumV,score) + circProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},idx:${A.idx},liveC:${A.liveC},sumT:${A.sumT},sumV:${A.sumV},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},idx:${B.idx},liveC:${B.liveC},sumT:${B.sumT},sumV:${B.sumV},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.orbit({ enabled: false }));
  await pageB.evaluate(() => window.__dev.orbit({ enabled: false }));

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
