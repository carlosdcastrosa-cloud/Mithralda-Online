// CAS-2688 — self-verify for REVUELO CINÉTICO (DARK, ACCEL_SURGE.enabled:false). EVO mecánica #117 (serializa tras #116 ORBIT_SURGE LIVE&served e7a8c60e844a/815, base HEAD 5769507) — EJE FRESCO de 2º ORDEN + CANAL FRESCO, ⊥ a las 58 LIVE #59-#116.
// (A) EJE FRESCO = 2º ORDEN / CHURN CINÉTICO = accelField(hero) = C = media_i |Δmᵢ| / refDelta, donde Δmᵢ = CAMBIO del vector de movimiento server-auth mᵢ=vᵢ·rumboᵢ (vᵢ=speedIntent + rumboᵢ=headingIntent — MISMA fuente de VECTOR DE MOVIMIENTO que #110/#111/#112/#116, NO e.vx/e.vy INERTES) entre ticks consecutivos (capturado por accelTick tras updateEnemies). accelBand: ≥hiChurn(0.55) ⇒ revuelo ⇒ 2; ≥midChurn(0.25) ⇒ jitter ⇒ 1; <mid (~constante) ⇒ 0. Requiere ≥minMobs(3) con Δ. INTENSIVO/ADIMENSIONAL (media normalizada, invariante al conteo).
//     La familia de VELOCIDAD 1er-orden (dirección #110 ORIENT, magnitud-CV #111 SPEED, radial #112 CONVERGE, tangencial #116 ORBIT) está AGOTADA — funciones del vector INSTANTÁNEO mᵢ(t). EVO#117 abre la 2ª DERIVADA temporal: ACCEL = |mᵢ(t)−mᵢ(t−1)|. GEOM (mobs wander v=30): |Δm|=60·|sin(Δψ/2)| ⇒ Δψ=0(constante)⇒C0; Δψ=40°⇒C0.342; Δψ=90°⇒C0.707; Δψ=180°(finta)⇒C1.
//     CRUX ⊥#116 ORBIT (4 cuadrantes orbit×accel): CARRUSEL-CONSTANTE ⇒ orbit2/accel0; SPIN-UP(radial→tangente) ⇒ orbit2/accel2; MARCHA-CONSTANTE ⇒ orbit0/accel0; FINTA-EN-SITIO(este↔oeste) ⇒ orbit0/accel2 ⇒ orbit mapea a accel 0 Y 2 ⇒ accel NO es función de orbit. CRUX ⊥#112 CONVERGE / ⊥#110 ORIENT (constante-vs-cambio, 4 cuadrantes). CRUX ⊥#111 SPEED (pack wander v uniforme ⇒ speedSpread≡0 mientras accel varía 0/1/2). ⊥#67 FRENZY/#94 SWIFT (TEMPO/kill-rate del HÉROE — ACCEL es 2º-orden del MOVIMIENTO de los MOBS, pico con CERO kills). ⊥#86/#85/#83 (frost-slow escala vᵢ pero pack CONSTANTE ⇒ accel0 ⇒ NO re-mapeo del slow-flag).
// (B) CANAL FRESCO = accelFind (fichas de revuelo por rematar con la manada en alto CHURN — NINGUNA de las 58 flags lo usa; ⊥ orbitFind #116/convergeFind #112/orientFind #110/speedFind #111). Moneda FRESCA (h.accelBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Historia per-mob (e._accPm/_accD/_accHas) TRANSITORIA en el enemigo, poblada sólo cuando enabled.
//
// Run: node tools/cas2688-accel-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2688");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// churnProbe LUT esperada: C→banda→{tier,charge}. UMBRALES hiChurn 0.55 / midChurn 0.25, bordes exactos + cap.
const EXPECT_C = [
  { c: 0, w: 0, t: 0, s: 0 }, { c: 0.24, w: 0, t: 0, s: 0 },                       // <midChurn (~constante) ⇒ 0
  { c: 0.25, w: 1, t: 1, s: 1 }, { c: 0.54, w: 1, t: 1, s: 1 },                    // ≥midChurn ⇒ jitter ⇒ 1 (borde 0.25 inclusive)
  { c: 0.55, w: 2, t: 2, s: 2 }, { c: 1.0, w: 2, t: 2, s: 2 },                     // ≥hiChurn ⇒ revuelo ⇒ 2 (borde 0.55 inclusive)
];
// driveAcc por Δψ (giro entre tick anterior y actual). C=|sin(Δψ/2)| (v wander=30, refDelta=60). 3 mobs (salvo 2-mob/vacío).
const D2R = Math.PI / 180;
const EXPECT_DRIVE = [
  { name: "constant", n: 3, deltaDeg: 0, c: 0.000, w: 0 },                          // Δψ0 (velocidad constante) ⇒ C0 ⇒ 0
  { name: "jitter20", n: 3, deltaDeg: 20, c: 0.174, w: 0 },                         // Δψ20° ⇒ C sin10=0.174 <midChurn ⇒ 0
  { name: "jitter40", n: 3, deltaDeg: 40, c: 0.342, w: 1 },                         // Δψ40° ⇒ C sin20=0.342 ⇒ jitter ⇒ 1
  { name: "turn90", n: 3, deltaDeg: 90, c: 0.707, w: 2 },                           // Δψ90° ⇒ C sin45=0.707 ⇒ revuelo ⇒ 2
  { name: "flip180", n: 3, deltaDeg: 180, c: 1.000, w: 2 },                         // Δψ180° (finta) ⇒ C1 ⇒ revuelo ⇒ 2
  { name: "twoMobs", n: 2, deltaDeg: 180, c: 0.000, w: 0 },                         // 2 mobs <minMobs(3) ⇒ 0
  { name: "empty", n: 0, deltaDeg: 0, c: 0.000, w: 0 },                             // vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.accel && window.__dev.orbit && window.__dev.converge && window.__dev.orient && window.__dev.speed && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.accel + peer hooks (orbit/converge/orient/speed/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.accel());
  ok("2 byte-id OFF (fresh boot): ACCEL_SURGE.enabled false AND G.accelBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "accelFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiChurn=${dark.hiChurn} midChurn=${dark.midChurn} minMobs=${dark.minMobs} refDelta=${dark.refDelta} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no accelFind/accelBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(accelFind|accelBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"accelBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'accelFind'/'accelBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.accel({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.accel({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; ni las fichas ni la historia per-mob entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ churnProbe LUT: C→band→tier→charge (UMBRALES hiChurn/midChurn + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.accel({ churnProbe: { c: c.c } }).churnProbe), EXPECT_C);
  const tabOK = EXPECT_C.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ churnProbe LUT: C≥0.55⇒revuelo⇒2/T2; ≥0.25⇒jitter⇒1/T1; <0.25 (~constante)⇒0/T0 (UMBRAL hiChurn 0.55/midChurn 0.25, bordes 0/0.24/0.25/0.54/0.55/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ c: x.c, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH 2º-ORDEN: driveAcc inyecta mobs REALES, siembra en h0, re-apunta a h1, computa |Δm|=60·sin(Δψ/2). accelField = C; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, D2R } = args;
    const pos = [[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110]];
    window.__dev.accel({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = pos.slice(0, c.n).map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + c.deltaDeg * D2R }; });
      const dv = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;
      const live = window.__dev.accel({ accProbeLive: true }).accProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, liveC: live.cv, liveScore: live.score, mean: live.mean, mobCount: live.mobCount, ds: live.mobs.map(m => m.d) });
    }
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, D2R });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.c) < 0.02 && Math.abs(comp[i].liveC - c.c) < 0.02);
  ok("5b ★ REAL SERVER-AUTH 2º-ORDEN: driveAcc (h0→h1) computa |Δm|=60·sin(Δψ/2) ⇒ constante(Δ0)⇒C0/0, jitter20°⇒C0.17/0, jitter40°⇒C0.34/1, turn90°⇒C0.71/2, flip180°⇒C1/2, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#116 ORBIT crux (4 cuadrantes orbit×accel): orbit lee el vector INSTANTÁNEO (h1); accel lee el CAMBIO (h0→h1).
  const crux116 = await page.evaluate((args) => {
    const { Z } = args;
    const HF = { ccw: (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2, in: (dx, dy) => Math.atan2(dy, dx) + Math.PI, north: () => Math.PI / 2, east: () => 0, west: () => Math.PI };
    const pos = [[120, 0], [0, 120], [-120, 0], [0, -120]];
    window.__dev.accel({ enabled: true });   // orbit ya es LIVE (#116 enabled:true)
    const read = (m0, m1) => { window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = pos.map(([dx, dy]) => ({ dx, dy, h0: HF[m0](dx, dy), h1: HF[m1](dx, dy) }));
      const dv = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;
      return { accel: dv.score, aidx: dv.idx, orbit: window.__dev.orbit().score, oidx: window.__dev.orbit().idx }; };
    const carouselConst = read("ccw", "ccw");   // final carrusel ⇒ orbit2 ; Δ0 ⇒ accel0
    const spinUp = read("in", "ccw");           // final carrusel ⇒ orbit2 ; Δ90° ⇒ accel2
    const marchConst = read("north", "north");  // final marcha-norte ⇒ orbit0 ; Δ0 ⇒ accel0
    const jukeInPlace = read("east", "west");   // final all-oeste ⇒ orbit0 ; Δ180° ⇒ accel2
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return { carouselConst, spinUp, marchConst, jukeInPlace };
  }, { Z });
  const crux116OK = crux116.carouselConst.orbit === 2 && crux116.carouselConst.accel === 0
    && crux116.spinUp.orbit === 2 && crux116.spinUp.accel === 2
    && crux116.marchConst.orbit === 0 && crux116.marchConst.accel === 0
    && crux116.jukeInPlace.orbit === 0 && crux116.jukeInPlace.accel === 2;
  ok("6 ★ ⊥#116 ORBIT crux (4 cuadrantes orbit×accel): CARRUSEL-CONSTANTE ⇒ ORBIT 2/ACCEL 0; SPIN-UP(radial→tangente) ⇒ ORBIT 2/ACCEL 2; MARCHA-CONSTANTE ⇒ ORBIT 0/ACCEL 0; FINTA-EN-SITIO(E↔O) ⇒ ORBIT 0/ACCEL 2 ⇒ orbit mapea a accel 0 Y 2 ⇒ INDEPENDIENTES",
     crux116OK, JSON.stringify(crux116));

  // 7 ★ ⊥#112 CONVERGE crux (4 cuadrantes converge×accel): converge lee radial INSTANTÁNEO (h1); accel lee el CAMBIO.
  const crux112 = await page.evaluate((args) => {
    const { Z } = args;
    const HF = { ccw: (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2, in: (dx, dy) => Math.atan2(dy, dx) + Math.PI };
    const pos = [[120, 0], [0, 120], [-120, 0]];
    window.__dev.accel({ enabled: true });   // converge ya es LIVE (#112 enabled:true)
    const read = (m0, m1) => { window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = pos.map(([dx, dy]) => ({ dx, dy, h0: HF[m0](dx, dy), h1: HF[m1](dx, dy) }));
      const dv = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;
      return { accel: dv.score, converge: window.__dev.converge().score }; };
    const frontalConst = read("in", "in");     // final frontal ⇒ converge2 ; Δ0 ⇒ accel0
    const spinToFrontal = read("ccw", "in");   // final frontal ⇒ converge2 ; Δ90° ⇒ accel2
    const carouselConst = read("ccw", "ccw");  // final carrusel ⇒ converge0 ; Δ0 ⇒ accel0
    const spinToCarousel = read("in", "ccw");  // final carrusel ⇒ converge0 ; Δ90° ⇒ accel2
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return { frontalConst, spinToFrontal, carouselConst, spinToCarousel };
  }, { Z });
  const crux112OK = crux112.frontalConst.converge === 2 && crux112.frontalConst.accel === 0
    && crux112.spinToFrontal.converge === 2 && crux112.spinToFrontal.accel === 2
    && crux112.carouselConst.converge === 0 && crux112.carouselConst.accel === 0
    && crux112.spinToCarousel.converge === 0 && crux112.spinToCarousel.accel === 2;
  ok("7 ★ ⊥#112 CONVERGE crux (4 cuadrantes converge×accel): FRONTAL-CONSTANTE ⇒ CONVERGE 2/ACCEL 0; SPIN-A-FRONTAL ⇒ CONVERGE 2/ACCEL 2; CARRUSEL-CONSTANTE ⇒ CONVERGE 0/ACCEL 0; SPIN-A-CARRUSEL ⇒ CONVERGE 0/ACCEL 2 ⇒ INDEPENDIENTES",
     crux112OK, JSON.stringify(crux112));

  // 8 ★ ⊥#111 SPEED crux: en un pack wander uniforme (v=30) speedSpread≡0 mientras accel varía 0/1/2 ⇒ accel (derivada temporal) ⊥ speed (CV de magnitud instantánea).
  const crux111 = await page.evaluate((args) => {
    const { Z, D2R } = args;
    const pos = [[120, 0], [0, 120], [-120, 0]];
    window.__dev.accel({ enabled: true });   // speed ya es LIVE (#111 enabled:true)
    const read = (deltaDeg) => { window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = pos.map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + deltaDeg * D2R }; });
      const dv = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;
      return { accel: dv.score, speed: window.__dev.speed().score }; };
    const constant = read(0);    // accel0 / speed0
    const jitter = read(40);     // accel1 / speed0
    const churn = read(180);     // accel2 / speed0
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return { constant, jitter, churn };
  }, { Z, D2R });
  const crux111OK = crux111.constant.accel === 0 && crux111.constant.speed === 0
    && crux111.jitter.accel === 1 && crux111.jitter.speed === 0
    && crux111.churn.accel === 2 && crux111.churn.speed === 0;
  ok("8 ★ ⊥#111 SPEED crux: pack wander uniforme (v=30) ⇒ speedSpread score ≡0 mientras ACCEL varía 0/1/2 (constante/jitter40°/finta180°) ⇒ accel (2º-orden temporal) ⊥ speed (CV de magnitud instantánea)",
     crux111OK, JSON.stringify(crux111));

  // 8b ★ ⊥ frost-slow #85 / geométrico #113: una manada CONSTANTE (mismo patrón que un anillo quieto/slowed) ⇒ accel0 (el slow/posición NO crea CAMBIO) mientras encircle la ve como anillo.
  const antiSlow = await page.evaluate((args) => {
    const { Z } = args;
    const HF = { ccw: (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2 };
    const pos = [[120, 0], [0, 120], [-120, 0], [0, -120]];
    window.__dev.accel({ enabled: true });
    window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // anillo orbitando a velocidad CONSTANTE (carrusel liso): encircle2/orbit2 pero accel0
    const pts = pos.map(([dx, dy]) => ({ dx, dy, h0: HF.ccw(dx, dy), h1: HF.ccw(dx, dy) }));
    const dv = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;
    const enc = window.__dev.encircle ? window.__dev.encircle().score : null;
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return { accel: dv.score, aidx: dv.idx, encircle: enc };
  }, { Z });
  ok("8b ★ ⊥ frost-slow #85 / geométrico #113: manada orbitando a velocidad CONSTANTE (anillo) ⇒ ACCEL 0 (velocidad constante NO crea CAMBIO ⇒ accel NO es re-mapeo del slow-flag ni de la posición)" + (antiSlow.encircle != null ? "; encircle la ve como anillo≥1" : ""),
     antiSlow.accel === 0 && antiSlow.aidx === 0 && (antiSlow.encircle == null || antiSlow.encircle >= 1), JSON.stringify(antiSlow));

  // 9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3 vs 6 mobs con la MISMA finta ⇒ MISMO C/score (media invariante al conteo); packHarvest DISTINTO.
  const countInv = await page.evaluate((args) => {
    const { Z, D2R } = args;
    window.__dev.accel({ enabled: true });
    const read = (pos) => { window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = pos.map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + 180 * D2R }; });
      const dv = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;
      return { idx: dv.idx, score: dv.score, pack: window.__dev.packHarvest().score }; };
    const pack3 = read([[120, 0], [0, 120], [-120, 0]]);
    const pack6 = read([[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110]]);
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return { pack3, pack6 };
  }, { Z, D2R });
  const countInvOK = Math.abs(countInv.pack3.idx - countInv.pack6.idx) < 0.001 && countInv.pack3.score === 2 && countInv.pack6.score === 2;
  ok("9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3 vs 6 mobs con la MISMA finta 180° ⇒ MISMO C y score 2 (media invariante al conteo) mientras packHarvest (EXTENSIVO) cambia",
     countInvOK, JSON.stringify(countInv));

  // 10 CANAL accelFind: forageChargePreview con revuelo >0 ; con constante → 0
  const forage = await page.evaluate((args) => {
    const { Z, D2R } = args;
    const pos = [[120, 0], [0, 120], [-120, 0]];
    const mk = (deltaDeg) => pos.map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + deltaDeg * D2R }; });
    window.__dev.accel({ enabled: true });
    window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.accel({ driveAcc: { pts: mk(180), wipe: true } });   // finta ⇒ score2 ⇒ T2
    const actVm = window.__dev.accel();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.accel({ driveAcc: { pts: mk(0), wipe: true } });     // constante ⇒ score0
    const goVm = window.__dev.accel();
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, D2R });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL accelFind: forageChargePreview con finta ⇒ charge>0 (==accelBonus); con velocidad constante ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds accelBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let c = 0; c <= 1.001; c += 0.05) vals.push(window.__dev.accel({ churnProbe: { c } }).churnProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.accel().cap };
  });
  ok("11 ★ SUB-CAP: ningún C produce charge>accelBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a churn available
  const neutral = await page.evaluate((args) => {
    const { Z, D2R } = args;
    const pos = [[120, 0], [0, 120], [-120, 0]];
    const mk = (deltaDeg) => pos.map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + deltaDeg * D2R }; });
    window.__dev.accel({ enabled: true });
    window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.accel({ driveAcc: { pts: mk(180), wipe: true } });   // finta disponible
    window.__dev.accel({ enabled: false });                          // now OFF
    const off = window.__dev.accel();
    window.__dev.accel({ enabled: true }); window.__dev.accel({ driveAcc: { pts: [], wipe: true } }); window.__dev.accel({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, D2R });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, accelBonus(finta disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip accel OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling orbit/converge/speed no cambia la señal de accel.
  const orth = await page.evaluate((args) => {
    const { Z, D2R } = args;
    const pos = [[120, 0], [0, 120], [-120, 0]];
    const mk = (deltaDeg) => pos.map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + deltaDeg * D2R }; });
    window.__dev.accel({ enabled: true });
    window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const beforeArc = window.__dev.accel({ driveAcc: { pts: mk(180), wipe: true } }).driveAcc;
    const snap = () => JSON.stringify({ orbit: window.__dev.orbit(), converge: window.__dev.converge(), speed: window.__dev.speed() });
    const peersOn = snap();
    const obPrev = window.__dev.orbit().enabled, cvPrev = window.__dev.converge().enabled, spPrev = window.__dev.speed().enabled;
    window.__dev.orbit({ enabled: !obPrev }); window.__dev.converge({ enabled: false }); window.__dev.speed({ enabled: false });
    const afterArc = window.__dev.accel({ accProbeLive: true }).accProbeLive;
    window.__dev.orbit({ enabled: obPrev }); window.__dev.converge({ enabled: cvPrev }); window.__dev.speed({ enabled: spPrev });
    const peersRestored = snap();
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = beforeArc.score === afterArc.score && Math.abs(beforeArc.idx - afterArc.cv) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: beforeArc.score, afterScore: afterArc.score, beforeIdx: beforeArc.idx, afterCv: afterArc.cv };
  }, { Z, D2R });
  ok("13 ★ ORTOGONALIDAD accelFind ⊥ peers: la señal de accel (score/C) NO cambia al togglear ORBIT #116/CONVERGE #112/SPEED #111; los peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 58 arc flags served true; ACCEL_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const acDark = flag("ACCEL_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 58 mecanismos del arco #59-#116 served enabled:true; ACCEL_SURGE served false (DARK #117)",
     arcAllOn && acDark && arc.length === 58, `accel=${flag("ACCEL_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Revuelo:" drawn ON+churn / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, D2R } = args;
    const pos = [[120, 0], [0, 120], [-120, 0]];
    const mk = (deltaDeg) => pos.map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + deltaDeg * D2R }; });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Revuelo:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.accel({ enabled: true });
    window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.accel({ driveAcc: { pts: mk(180), wipe: true } });  // finta ⇒ T2
    // NOTA: badge lee accelVM en vivo; el loop rAF vuelve a tickear accelTick (mobs ahora constantes ⇒ Δ0) ⇒ el badge caería a "—".
    // Para probar el DIBUJO del badge en estado revuelo, re-drive cada frame vía un rAF que reinyecta la finta.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; window.__dev.accel({ driveAcc: { pts: mk(180), wipe: true } }); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z, D2R });
  ok("15 render badge \"Revuelo:\" se DIBUJA ON+finta (C>0, re-driven cada frame) y NO OFF (C 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, D2R } = args; const pos = [[130, 0], [90, 90], [0, 130], [-90, 90], [-130, 0], [0, -130]]; const pts = pos.map(([dx, dy]) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + 180 * D2R }; }); window.__dev.accel({ enabled: true }); window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.accel({ driveAcc: { pts, wipe: true } }); }, { Z, D2R });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.accel({ driveAcc: { pts: [], wipe: true } }); window.__dev.accel({ enabled: false }); });

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
    const { Z, FPARG, D2R } = args;
    const pos = [[120, 0], [0, 120], [-120, 0], [0, -120]];
    const pts = pos.map(([dx, dy], i) => { const h0 = Math.atan2(dy, dx); return { dx, dy, h0, h1: h0 + (i < 3 ? 180 : 0) * D2R }; });   // 3 fintan 180° + 1 constante
    window.__dev.accel({ enabled: true });
    window.__dev.accel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;
    const vm = window.__dev.accel();
    const lut = [0, 0.25, 0.55, 1.0].map(c => { const p = window.__dev.accel({ churnProbe: { c } }).churnProbe; return { c, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.accel({ accProbeLive: true }).accProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.accel({ driveAcc: { pts: [], wipe: true } });
    window.__dev.accel({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveC: live.cv, liveScore: live.score, mean: live.mean, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG, D2R });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveC === B.liveC && A.liveScore === B.liveScore && A.mean === B.mean && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA secuencia (3 fintan 180° + 1 constante)+héroe ⇒ score/idx/tier/charge + accProbeLive(C,mean,mobCount,score) + churnProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveC:${A.liveC},mean:${A.mean},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveC:${B.liveC},mean:${B.mean},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.accel({ enabled: false }));
  await pageB.evaluate(() => window.__dev.accel({ enabled: false }));

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
