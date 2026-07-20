// CAS-2698 — self-verify for QUIEBRE / REGATE (DARK, JERK_DIR_SURGE.enabled:false). EVO mecánica #119 (serializa tras #118 AGGRO_FOCUS_SURGE LIVE&served 2605e94159e4/815, base HEAD cc89a6f) — EJE FRESCO + CANAL FRESCO, ⊥ a las 60 LIVE #59-#118. COMPLETA la familia CINÉTICA de 2º ORDEN (parte el vector de aceleración en radial/tangencial).
// (A) EJE FRESCO = FRACCIÓN TANGENCIAL del churn = jerkDirField(hero) = J = Σ_i tangᵢ / Σ_i |Δmᵢ| ∈[0,1], donde por cada mob Δmᵢ=mᵢ(t)−mᵢ(t−1) [mᵢ=speedIntent×headingIntent, MISMA fuente server-auth que #117 ACCEL, NO e.vx/e.vy] se descompone en su proyección RADIAL (a lo largo del rumbo previo = cambio de RAPIDEZ) y su complemento TANGENCIAL (⊥ = cambio de DIRECCIÓN). jerkBand: ≥hiDir(0.67) ⇒ weave ⇒ 2; ≥midDir(0.34) ⇒ juke ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) con Δ Y media|Δm|≥minMeanDelta(6) (piso anti-deriva). INTENSIVO/ADIMENSIONAL, INVARIANTE a escala UNIFORME de rapidez (J=cos(Δψ/2) para giro puro).
//     CRUX ⊥#117 ACCEL (LA CRÍTICA — disocian en el RATIO, no la magnitud): ACCEL=|Δm|=√(rad²+tang²) MAGNITUD; JERK=tang/|Δm| FRACCIÓN. 4-CUAD (banda accel × banda jerk, packs wander v=30): REVERSA-180° ⇒ accel2(|Δm|=60)/jerk0(J=0, TODO radial) · JITTER-20° ⇒ accel0(|Δm|=10.4)/jerk2(J=0.985, TODO direccional) · GIRO-90° ⇒ accel2/jerk2(J=0.707) · DERIVA ⇒ accel0/jerk0 ⇒ accel mapea a jerk 0 Y 2 ⇒ jerk NO es función de accel. ⊥ velocidad 1er-orden #110/#111/#112/#116 (2ª derivada). ⊥#118 AGGRO-FOCUS (churn ≠ intención). ⊥#85 frost-slow (escala UNIFORME ⇒ J invariante).
// (B) CANAL FRESCO = jerkDirFind (fichas de regate por rematar con la manada REORIENTANDO — NINGUNA de las 60 flags lo usa; ⊥ accelFind #117). Moneda FRESCA (h.jerkDirBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Historia per-mob (e._jrkPm/_jrkT/_jrkD/_jrkHas) TRANSITORIA.
//
// Run: node tools/cas2698-jerkdir-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2698");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
const POS = [[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110]];
// jerkProbe LUT esperada: J→banda→{tier,charge}. UMBRALES hiDir 0.67 / midDir 0.34, bordes exactos + cap.
const EXPECT_J = [
  { j: 0, w: 0, t: 0, s: 0 }, { j: 0.33, w: 0, t: 0, s: 0 },                       // <midDir (radial/línea recta) ⇒ 0
  { j: 0.34, w: 1, t: 1, s: 1 }, { j: 0.66, w: 1, t: 1, s: 1 },                    // ≥midDir ⇒ juke ⇒ 1 (borde 0.34 inclusive)
  { j: 0.67, w: 2, t: 2, s: 2 }, { j: 1.0, w: 2, t: 2, s: 2 },                     // ≥hiDir ⇒ weave ⇒ 2 (borde 0.67 inclusive)
];

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];

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

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.jerkDir && window.__dev.accel && window.__dev.converge && window.__dev.aggroFocus && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.jerkDir + peer hooks (accel/converge/aggroFocus) + saveBlob/worldFingerprint + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.jerkDir());
  ok("2 byte-id OFF (fresh boot): JERK_DIR_SURGE.enabled false AND G.jerkDirBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "jerkDirFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiDir=${dark.hiDir} midDir=${dark.midDir} minMobs=${dark.minMobs} minMeanDelta=${dark.minMeanDelta} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no jerkDirFind/jerkDirBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(jerkDirFind|jerkDirBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"jerkDirBounty"\s*:/.test(saveOff);
  const noHistKey = !/"_jrk(Pm|T|D|Has)"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'jerkDirFind'/'jerkDirBounty' ni historia per-mob '_jrk*' (fichas + historia TRANSITORIAS; estado 100% derivado)", noFeatKey && noChargeKey && noHistKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} noHistKey=${noHistKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.jerkDir({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.jerkDir({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; ni las fichas ni la historia per-mob entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ jerkProbe LUT: J→band→tier→charge (UMBRALES hiDir/midDir + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.jerkDir({ jerkProbe: { j: c.j } }).jerkProbe), EXPECT_J);
  const tabOK = EXPECT_J.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ jerkProbe LUT: J≥0.67⇒weave⇒2/T2; ≥0.34⇒juke⇒1/T1; <0.34 (radial)⇒0/T0 (UMBRAL hiDir 0.67/midDir 0.34, bordes 0/0.33/0.34/0.66/0.67/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ j: x.j, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ splitProbe: jerkSplit PURA — descompone Δm en radial (rapidez) / tangencial (dirección). Verifica |Δm|²=rad²+tang² + los casos límite + INVARIANZA DE ESCALA.
  const split = await page.evaluate(() => {
    const P = (pm, m) => window.__dev.jerkDir({ splitProbe: { pm, m } }).splitProbe;
    return {
      pureSpeed: P([30, 0], [50, 0]),      // rapidez↑ en línea recta: Δm=(20,0) TODO radial ⇒ tang 0, frac 0
      pureBrake: P([30, 0], [10, 0]),      // frenazo en línea recta: Δm=(−20,0) TODO radial ⇒ tang 0, frac 0
      reverse180: P([30, 0], [-30, 0]),    // reversa 180°: Δm=(−60,0) a lo largo del rumbo previo ⇒ TODO radial ⇒ tang 0, frac 0 (|Δm|=60 MÁXIMO pero direccional 0)
      rot90: P([30, 0], [0, 30]),          // giro puro 90° a rapidez const: |Δm|=42.43, rad=30, tang=30 ⇒ frac=0.707
      rot90x2: P([60, 0], [0, 60]),        // MISMO giro 90° a 2× rapidez: frac IDÉNTICO 0.707 (INVARIANZA DE ESCALA ⊥#85)
      rot45: P([30, 0], [30 * Math.cos(Math.PI / 4), 30 * Math.sin(Math.PI / 4)]),  // giro 45°: frac=cos(22.5°)=0.924
    };
  });
  const near = (a, b, e = 0.01) => Math.abs(a - b) < e;
  const splitOK = split.pureSpeed.tang === 0 && split.pureSpeed.frac === 0
    && split.pureBrake.tang === 0 && split.pureBrake.frac === 0
    && near(split.reverse180.dmag, 60) && split.reverse180.tang === 0 && split.reverse180.frac === 0
    && near(split.rot90.frac, 0.7071) && near(split.rot90.dmag, split.rot90.pythag)
    && near(split.rot90x2.frac, 0.7071) && near(split.rot90.frac, split.rot90x2.frac)   // invarianza de escala
    && near(split.rot45.frac, 0.9239);
  ok("5b ★ splitProbe jerkSplit PURA (descomposición radial/tangencial que jerkTick usa): RAPIDEZ↑/FRENAZO/REVERSA-180° ⇒ TODO radial (tang 0, frac 0; reversa |Δm|=60 MÁX pero direccional 0); GIRO-90° ⇒ frac 0.707 (=√(rad²+tang²) Pitágoras); GIRO-90°×2rapidez ⇒ frac IDÉNTICO (INVARIANZA DE ESCALA ⊥#85); GIRO-45° ⇒ frac 0.924",
     splitOK, JSON.stringify(split));

  // 5c ★ driveJrk REAL server-auth: inyecta N mobs wander h0→h1, dos jerkTick ⇒ J=cos(Δψ/2) REAL. Verifica minMobs + piso anti-deriva.
  const drive = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.jerkDir({ enabled: true });
    const run = (n, h0, h1) => { window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", h0, h1 }));
      const dv = window.__dev.jerkDir({ driveJrk: { pts, wipe: true } }).driveJrk;
      const live = window.__dev.jerkDir({ jrkProbeLive: true }).jrkProbeLive;
      return { idx: dv.idx, score: dv.score, liveJ: live.j, liveScore: live.score, meanD: live.meanD, n: live.mobCount }; };
    const D = Math.PI / 180;
    const out = {
      turn0: run(4, 0, 0),           // Δψ=0 ⇒ deriva ⇒ |Δm|=0 <piso ⇒ J indefinido ⇒ 0
      turn20: run(4, 0, 20 * D),     // Δψ=20° ⇒ J=cos(10°)=0.985 ⇒ 2 (mean|Δm|=10.4 > piso 6)
      turn90: run(4, 0, 90 * D),     // Δψ=90° ⇒ J=cos(45°)=0.707 ⇒ 2
      turn120: run(4, 0, 120 * D),   // Δψ=120° ⇒ J=cos(60°)=0.5 ⇒ 1
      turn160: run(4, 0, 160 * D),   // Δψ=160° ⇒ J=cos(80°)=0.174 ⇒ 0 (casi reversa ⇒ radial)
      twoMobs: run(2, 0, 90 * D),    // 2 mobs <minMobs(3) ⇒ 0 (degenerado)
    };
    window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    return out;
  }, { Z, POS });
  const driveOK = drive.turn0.score === 0 && near(drive.turn0.idx, 0)
    && drive.turn20.score === 2 && near(drive.turn20.idx, 0.985, 0.02)
    && drive.turn90.score === 2 && near(drive.turn90.idx, 0.707, 0.02)
    && drive.turn120.score === 1 && near(drive.turn120.idx, 0.5, 0.02)
    && drive.turn160.score === 0 && near(drive.turn160.idx, 0.174, 0.03)
    && drive.twoMobs.score === 0;
  ok("5c ★ driveJrk REAL server-auth (mobs wander h0→h1, J=cos(Δψ/2)): Δψ0⇒0(deriva<piso), 20°⇒0.985/2, 90°⇒0.707/2, 120°⇒0.5/1, 160°⇒0.174/0(casi-reversa=radial), 2-mobs⇒0(<minMobs)",
     driveOK, JSON.stringify(drive));

  // 6 ★ CRUX ⊥#117 ACCEL (4 cuadrantes banda-accel × banda-jerk): ACCEL=|Δm| MAGNITUD; JERK=tang/|Δm| FRACCIÓN. Sobre la MISMA config h0→h1 (accel es LIVE, jerk toggled).
  const crux117 = await page.evaluate((args) => {
    const { Z, POS } = args;
    const D = Math.PI / 180;
    window.__dev.jerkDir({ enabled: true });   // accel ya es LIVE (#117 enabled:true)
    const read = (h0, h1) => { window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", h0, h1 }));
      const aj = window.__dev.accel({ driveAcc: { pts, wipe: true } }).driveAcc;   // accel: inyecta + 2 accelTick ⇒ |Δm|
      const jj = window.__dev.jerkDir({ driveJrk: { pts, wipe: true } }).driveJrk;  // jerk: re-inyecta MISMA config + 2 jerkTick ⇒ tang/|Δm|
      return { accel: aj.score, aidx: aj.idx, jerk: jj.score, jidx: jj.idx }; };
    const reverse180 = read(0, 180 * D);   // |Δm|=60 ⇒ accel2; J=0 ⇒ jerk0 (TODO radial)
    const jitter20 = read(0, 20 * D);      // |Δm|=10.4 ⇒ accel0; J=0.985 ⇒ jerk2 (TODO direccional)
    const turn90 = read(0, 90 * D);        // |Δm|=42.4 ⇒ accel2; J=0.707 ⇒ jerk2
    const drift = read(0, 0);              // |Δm|=0 ⇒ accel0; jerk0
    window.__dev.accel({ clearAcc: true }); window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    return { reverse180, jitter20, turn90, drift };
  }, { Z, POS });
  const crux117OK = crux117.reverse180.accel === 2 && crux117.reverse180.jerk === 0
    && crux117.jitter20.accel === 0 && crux117.jitter20.jerk === 2
    && crux117.turn90.accel === 2 && crux117.turn90.jerk === 2
    && crux117.drift.accel === 0 && crux117.drift.jerk === 0;
  ok("6 ★ CRUX ⊥#117 ACCEL (4 cuad, disocian en el RATIO): REVERSA-180° ⇒ ACCEL 2/JERK 0 (|Δm| MÁX pero TODO radial); JITTER-20° ⇒ ACCEL 0/JERK 2 (|Δm| mín pero TODO direccional); GIRO-90° ⇒ ACCEL 2/JERK 2; DERIVA ⇒ ACCEL 0/JERK 0 ⇒ accel mapea a jerk 0 Y 2 ⇒ jerk NO es función de accel (MAGNITUD ⊥ FRACCIÓN)",
     crux117OK, JSON.stringify(crux117));

  // 7 ★ ⊥ VELOCIDAD 1er-orden #112 CONVERGE (jerk = 2ª derivada): un pack con rumbo/convergencia CONSTANTE (h0==h1 hacia el héroe) ⇒ converge>0 pero jerk0 (sin CAMBIO); el mismo pack reorientando ⇒ jerk alto.
  const crux112 = await page.evaluate((args) => {
    const { Z, POS } = args;
    const D = Math.PI / 180;
    window.__dev.jerkDir({ enabled: true });   // converge LIVE (#112)
    // pack wander DERIVANDO hacia el héroe con rumbo CONSTANTE (wx/wy = −pos ⇒ hacia el centro), h0==h1 ⇒ Δ=0 ⇒ jerk0; converge lee el vector RADIAL entrante ⇒ >0
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const towardConst = POS.slice(0, 4).map(([dx, dy]) => { const a = Math.atan2(-dy, -dx); return { dx, dy, type: "rat", h0: a, h1: a }; });
    const jjConst = window.__dev.jerkDir({ driveJrk: { pts: towardConst, wipe: true } }).driveJrk;
    const cvConst = window.__dev.converge().score;
    // MISMAS posiciones pero REORIENTANDO 90° cada mob ⇒ jerk alto
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const towardTurn = POS.slice(0, 4).map(([dx, dy]) => { const a = Math.atan2(-dy, -dx); return { dx, dy, type: "rat", h0: a, h1: a + 90 * D }; });
    const jjTurn = window.__dev.jerkDir({ driveJrk: { pts: towardTurn, wipe: true } }).driveJrk;
    window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    return { constJerk: jjConst.score, constConverge: cvConst, turnJerk: jjTurn.score };
  }, { Z, POS });
  const crux112OK = crux112.constJerk === 0 && crux112.constConverge >= 1 && crux112.turnJerk >= 1;
  ok("7 ★ ⊥#112 CONVERGE / velocidad 1er-orden (jerk=2ª derivada): pack DERIVANDO-HACIA-héroe rumbo CONSTANTE ⇒ CONVERGE ≥1/JERK 0 (1er-orden alto pero SIN cambio); MISMO pack REORIENTANDO 90° ⇒ JERK ≥1 ⇒ el rumbo INSTANTÁNEO (converge) ⊥ su CAMBIO (jerk)",
     crux112OK, JSON.stringify(crux112));

  // 8 ★ ⊥#118 AGGRO-FOCUS (churn de movimiento ≠ intención de targeting): pack TODO en chase-línea-recta ⇒ focus2/jerk0; pack wander regateando ⇒ jerk2/focus0.
  const crux118 = await page.evaluate((args) => {
    const { Z, POS } = args;
    const D = Math.PI / 180;
    window.__dev.jerkDir({ enabled: true });   // aggroFocus LIVE (#118)
    // pack TODO en chase (engaged ⇒ focus alto; heading hacia héroe CONSTANTE si no se mueve ⇒ jerk0)
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const chasePts = POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", state: "chase" }));
    const jjChase = window.__dev.jerkDir({ driveJrk: { pts: chasePts, wipe: true } }).driveJrk;
    const fcChase = window.__dev.aggroFocus().score;
    // pack wander regateando 90° (NO engaged ⇒ focus0; jerk alto)
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const wanderPts = POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", state: "wander", h0: 0, h1: 90 * D }));
    const jjWander = window.__dev.jerkDir({ driveJrk: { pts: wanderPts, wipe: true } }).driveJrk;
    const fcWander = window.__dev.aggroFocus().score;
    window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    return { chaseFocus: fcChase, chaseJerk: jjChase.score, wanderFocus: fcWander, wanderJerk: jjWander.score };
  }, { Z, POS });
  const crux118OK = crux118.chaseFocus === 2 && crux118.chaseJerk === 0
    && crux118.wanderJerk === 2 && crux118.wanderFocus === 0;
  ok("8 ★ ⊥#118 AGGRO-FOCUS (churn cinético ≠ intención de targeting): PACK-CHASE-línea-recta ⇒ FOCUS 2/JERK 0 (fijado pero sin reorientar); PACK-WANDER-regateando-90° ⇒ JERK 2/FOCUS 0 (regatea pero no fijado) ⇒ INDEPENDIENTES",
     crux118OK, JSON.stringify(crux118));

  // 9 ★ ⊥#85 frost-slow / INVARIANZA DE ESCALA: J=cos(Δψ/2) invariante a un factor UNIFORME de rapidez (via splitProbe con vectores escalados). Un pack slowed regateando ⇒ MISMO J que sin slow.
  const scaleInv = await page.evaluate(() => {
    const P = (pm, m) => window.__dev.jerkDir({ splitProbe: { pm, m } }).splitProbe.frac;
    const D = Math.PI / 180;
    const mk = (v, dpsi) => ({ pm: [v, 0], m: [v * Math.cos(dpsi), v * Math.sin(dpsi)] });
    const fast = mk(30, 90 * D), slow = mk(12, 90 * D), slower = mk(6, 90 * D);   // 30 (full), 12 (0.4×), 6 (0.2×) — todos giro 90°
    return { full: P(fast.pm, fast.m), slow: P(slow.pm, slow.m), slower: P(slower.pm, slower.m) };
  });
  const scaleInvOK = near(scaleInv.full, scaleInv.slow, 0.005) && near(scaleInv.slow, scaleInv.slower, 0.005) && near(scaleInv.full, 0.7071, 0.005);
  ok("9 ★ ⊥#85 frost-slow (INVARIANZA DE ESCALA): giro 90° a rapidez 30/12/6 (factor de slow uniforme 1.0/0.4/0.2) ⇒ J=0.707 IDÉNTICO ⇒ J invariante al factor de slow (mide el REPARTO radial/tangencial, no la magnitud) ⇒ NO es re-mapeo del slow-flag",
     scaleInvOK, JSON.stringify(scaleInv));

  // 10 CANAL jerkDirFind: forageChargePreview con weave >0; con radial → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS } = args;
    const D = Math.PI / 180;
    window.__dev.jerkDir({ enabled: true });
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.jerkDir({ driveJrk: { pts: POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", h0: 0, h1: 20 * D })), wipe: true } });   // J0.985 ⇒ score2 ⇒ T2
    const actVm = window.__dev.jerkDir();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.jerkDir({ driveJrk: { pts: POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", h0: 0, h1: 160 * D })), wipe: true } });   // J0.174 ⇒ score0 (radial)
    const goVm = window.__dev.jerkDir();
    window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL jerkDirFind: forageChargePreview con manada regateando (J0.985) ⇒ charge>0 (==jerkBonus); con manada radial (J0.174) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds jerkDirBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let j = 0; j <= 1.001; j += 0.05) vals.push(window.__dev.jerkDir({ jerkProbe: { j } }).jerkProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.jerkDir().cap };
  });
  ok("11 ★ SUB-CAP: ningún J produce charge>jerkDirBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a weave pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS } = args;
    const D = Math.PI / 180;
    window.__dev.jerkDir({ enabled: true });
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.jerkDir({ driveJrk: { pts: POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", h0: 0, h1: 20 * D })), wipe: true } });   // weave disponible
    window.__dev.jerkDir({ enabled: false });                          // now OFF
    const off = window.__dev.jerkDir();
    window.__dev.jerkDir({ enabled: true }); window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } }); window.__dev.jerkDir({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, gExists: off.gExists };
  }, { Z, POS });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.gExists === false;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, jerkBonus(pack weave disponible)==0 + forageChargePreview==0 + idx==0 + gExists false ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling accel/converge/aggroFocus no cambia la señal de jerk.
  const orth = await page.evaluate((args) => {
    const { Z, POS } = args;
    const D = Math.PI / 180;
    window.__dev.jerkDir({ enabled: true });
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const pts = POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", h0: 0, h1: 90 * D }));
    const before = window.__dev.jerkDir({ driveJrk: { pts, wipe: true } }).driveJrk;
    const snap = () => JSON.stringify({ accel: window.__dev.accel(), converge: window.__dev.converge(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const acPrev = window.__dev.accel().enabled, cvPrev = window.__dev.converge().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.accel({ enabled: !acPrev }); window.__dev.converge({ enabled: !cvPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.jerkDir({ jrkProbeLive: true }).jrkProbeLive;
    window.__dev.accel({ enabled: acPrev }); window.__dev.converge({ enabled: cvPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && Math.abs(before.idx - after.j) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeIdx: before.idx, afterJ: after.j };
  }, { Z, POS });
  ok("13 ★ ORTOGONALIDAD jerkDirFind ⊥ peers: la señal de jerk (score/J) NO cambia al togglear ACCEL #117/CONVERGE #112/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 60 arc flags served true; JERK_DIR_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const jdDark = flag("JERK_DIR_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 60 mecanismos del arco #59-#118 served enabled:true; JERK_DIR_SURGE served false (DARK #119)",
     arcAllOn && jdDark && arc.length === 60, `jerkDir=${flag("JERK_DIR_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Regate:" drawn ON+weave / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS } = args;
    const D = Math.PI / 180;
    const mk = () => POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", h0: 0, h1: 20 * D }));
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Regate:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.jerkDir({ enabled: true });
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // el badge lee jerkDirVM en vivo; el loop rAF re-tickea la IA (los mobs wander pueden re-sembrar wx/wy y el 2º jerkTick real correr) ⇒ re-inyecta cada frame para probar el DIBUJO en estado weave.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; window.__dev.jerkDir({ driveJrk: { pts: mk(), wipe: true } }); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z, POS });
  ok("15 render badge \"Regate:\" se DIBUJA ON+weave (J>0, re-driven cada frame) y NO OFF (J 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS } = args; const D = Math.PI / 180; window.__dev.jerkDir({ enabled: true }); window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.jerkDir({ driveJrk: { pts: POS.slice(0, 5).map(([dx, dy]) => ({ dx, dy, type: "rat", h0: 0, h1: 20 * D })), wipe: true } }); }, { Z, POS });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } }); window.__dev.jerkDir({ enabled: false }); });

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
    const { Z, FPARG, POS } = args;
    const D = Math.PI / 180;
    const pts = POS.slice(0, 4).map(([dx, dy]) => ({ dx, dy, type: "rat", h0: 0, h1: 90 * D }));   // giro 90° ⇒ J=0.707 ⇒ weave ⇒ 2
    window.__dev.jerkDir({ enabled: true });
    window.__dev.jerkDir({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.jerkDir({ driveJrk: { pts, wipe: true } }).driveJrk;
    const vm = window.__dev.jerkDir();
    const lut = [0, 0.34, 0.67, 1.0].map(j => { const p = window.__dev.jerkDir({ jerkProbe: { j } }).jerkProbe; return { j, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.jerkDir({ jrkProbeLive: true }).jrkProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.jerkDir({ driveJrk: { pts: [], wipe: true } });
    window.__dev.jerkDir({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveJ: live.j, liveScore: live.score, meanD: live.meanD, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG, POS });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveJ === B.liveJ && A.liveScore === B.liveScore && A.meanD === B.meanD && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (4 mobs giro-90°, J=0.707)+héroe ⇒ score/idx/tier/charge + jrkProbeLive(j,meanD,mobCount,score) + jerkProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveJ:${A.liveJ},meanD:${A.meanD},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveJ:${B.liveJ},meanD:${B.meanD},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.jerkDir({ enabled: false }));
  await pageB.evaluate(() => window.__dev.jerkDir({ enabled: false }));

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
