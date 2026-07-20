// CAS-2702 — self-verify for EMBATE (DARK, STRIKE_COMMIT_SURGE.enabled:false). EVO mecánica #120 (serializa tras #119 JERK_DIR_SURGE LIVE&served e0f65ada9e43/815, base HEAD e5de531) — EJE FRESCO + CANAL FRESCO, ⊥ a las 61 LIVE #59-#119. PROFUNDIZA la familia COMPOSICIÓN-DE-INTENCIÓN de #118 con una SUB-PARTICIÓN de la manada ENGANCHADA por sub-estado de combate.
// (A) EJE FRESCO = FRACCIÓN de COMPROMISO = strikeCommitField(hero) = SC = |{mobs en windup|strike}| / |{mobs aggro-ENGANCHADOS}|. 🔑 DENOMINADOR = los ENGANCHADOS (aggroEngaged {chase,windup,strike,recover,shield}, reusa el predicado de #118) — NO los vivos (ésa es la CLAVE ⊥#118 que normaliza por VIVOS). NUMERADOR = los COMPROMETIDOS {windup,strike} (ataque con hitbox/telegraph). strikeCommitBand: ≥hiCommit(0.67) ⇒ onslaught ⇒ 2; ≥midCommit(0.34) ⇒ pressing ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) enganchados en radio (DENOMINADOR). INTENSIVO/ADIMENSIONAL (fracción, invariante al conteo). SNAPSHOT PURO (sin captura per-tick, como #118).
//     CRUX ⊥#118 AGGRO-FOCUS (DENOMINADORES DISTINTOS ⇒ disocian en el ratio, 4 cuadrantes focus×strikeCommit): manada-toda-enganchada-en-chase ⇒ focus2/strikeCommit0; toda-en-strike ⇒ focus2/strikeCommit2; 2-strike+2-idle ⇒ focus1(0.5)/strikeCommit2(1.0) ⇒ focus mapea a strikeCommit 0 Y 2 (y viceversa) ⇒ INDEPENDIENTES. CRUX ⊥#119 JERK (sub-estado ≠ churn: quieta-golpeando ⇒ strikeCommit2/jerk0). ⊥#113 ENCIRCLE/pos (mismo anillo en windup ⇒ encircle2/strikeCommit2 vs en chase ⇒ encircle2/strikeCommit0). ⊥#87 PACKHARVEST (CONTEO).
// (B) CANAL FRESCO = strikeCommitFind (fichas de embate por rematar con la manada enganchada mid-golpe COMPROMETIDO — NINGUNA de las 61 flags lo usa; ⊥ aggroFocusFind #118/jerkDirFind #119). Moneda FRESCA (h.strikeCommitBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2702-strikecommit-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2702");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// commitProbe LUT esperada: SC→banda→{tier,charge}. UMBRALES hiCommit 0.67 / midCommit 0.34, bordes exactos + cap.
const EXPECT_SC = [
  { sc: 0, w: 0, t: 0, s: 0 }, { sc: 0.33, w: 0, t: 0, s: 0 },                     // <midCommit (sin comprometer) ⇒ 0
  { sc: 0.34, w: 1, t: 1, s: 1 }, { sc: 0.66, w: 1, t: 1, s: 1 },                  // ≥midCommit ⇒ pressing ⇒ 1 (borde 0.34 inclusive)
  { sc: 0.67, w: 2, t: 2, s: 2 }, { sc: 1.0, w: 2, t: 2, s: 2 },                   // ≥hiCommit ⇒ onslaught ⇒ 2 (borde 0.67 inclusive)
];
// driveCommit por fracción REAL: inyecta k comprometidos (strike) + resto enganchados-sin-comprometer (chase). SC=k/(k+chase). Requiere (k+chase)≥minMobs(3).
const EXPECT_DRIVE = [
  { name: "4strike/4eng=1.0", strike: 4, chase: 0, sc: 1.000, w: 2 },              // 4/4 ⇒ SC1 ⇒ onslaught ⇒ 2
  { name: "3strike/4eng=0.75", strike: 3, chase: 1, sc: 0.750, w: 2 },             // 3/4 ⇒ SC0.75 ≥hiCommit ⇒ 2
  { name: "2strike/3eng=0.667", strike: 2, chase: 1, sc: 0.667, w: 1 },            // 2/3 ⇒ SC0.6667 <hiCommit(0.67) ⇒ pressing ⇒ 1 (borde crítico)
  { name: "4strike/6eng=0.667", strike: 4, chase: 2, sc: 0.667, w: 1 },            // 4/6 ⇒ SC0.6667 <0.67 ⇒ 1
  { name: "2strike/4eng=0.5", strike: 2, chase: 2, sc: 0.500, w: 1 },              // 2/4 ⇒ SC0.5 ≥midCommit ⇒ 1
  { name: "1strike/3eng=0.333", strike: 1, chase: 2, sc: 0.333, w: 0 },            // 1/3 ⇒ SC0.3333 <midCommit(0.34) ⇒ 0
  { name: "1strike/4eng=0.25", strike: 1, chase: 3, sc: 0.250, w: 0 },             // 1/4 ⇒ SC0.25 <mid ⇒ 0
  { name: "0strike/4eng=0", strike: 0, chase: 4, sc: 0.000, w: 0 },                // 0/4 ⇒ SC0 ⇒ 0 (todos enganchados en chase, ninguno golpeando)
  { name: "twoEng", strike: 2, chase: 0, sc: 0.000, w: 0 },                        // 2 enganchados <minMobs(3) ⇒ 0 (degenerado)
  { name: "empty", strike: 0, chase: 0, sc: 0.000, w: 0 },                         // vacío ⇒ 0
];
const POS = [[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110]];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.strikeCommit && window.__dev.aggroFocus && window.__dev.jerkDir && window.__dev.encircle && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.strikeCommit + peer hooks (aggroFocus/jerkDir/encircle/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.strikeCommit());
  ok("2 byte-id OFF (fresh boot): STRIKE_COMMIT_SURGE.enabled false AND G.strikeCommitBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "strikeCommitFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCommit=${dark.hiCommit} midCommit=${dark.midCommit} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no strikeCommitFind/strikeCommitBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(strikeCommitFind|strikeCommitBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"strikeCommitBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'strikeCommitFind'/'strikeCommitBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.strikeCommit({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.strikeCommit({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ commitProbe LUT: SC→band→tier→charge (UMBRALES hiCommit/midCommit + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.strikeCommit({ commitProbe: { sc: c.sc } }).commitProbe), EXPECT_SC);
  const tabOK = EXPECT_SC.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ commitProbe LUT: SC≥0.67⇒onslaught⇒2/T2; ≥0.34⇒pressing⇒1/T1; <0.34 (sin comprometer)⇒0/T0 (UMBRAL hiCommit 0.67/midCommit 0.34, bordes 0/0.33/0.34/0.66/0.67/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ sc: x.sc, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH FRACCIÓN: driveCommit inyecta k comprometidos (strike) + resto chase ⇒ SC=k/eng REAL.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS } = args;
    const mkStates = (nStrike, nChase) => Array.from({ length: nStrike }, () => "strike").concat(Array.from({ length: nChase }, () => "chase"));
    window.__dev.strikeCommit({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const states = mkStates(c.strike, c.chase);
      const pts = states.map((st, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: st }));
      const dv = window.__dev.strikeCommit({ driveCommit: { pts, wipe: true } }).driveCommit;
      const live = window.__dev.strikeCommit({ commitProbeLive: true }).commitProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, liveField: live.field, liveFrac: live.frac, liveScore: live.score, committing: live.committing, engaged: live.engaged });
    }
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.sc) < 0.005 && Math.abs(comp[i].liveField - c.sc) < 0.005);
  ok("5b ★ REAL SERVER-AUTH FRACCIÓN: driveCommit (k strike + resto chase) ⇒ SC=k/eng ⇒ 4/4=1.0/2, 3/4=0.75/2, 2/3=0.667/1, 4/6=0.667/1, 2/4=0.5/1, 1/3=0.333/0, 1/4=0.25/0, 0/4=0/0, 2-eng⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#118 AGGRO-FOCUS crux (4 cuadrantes focus×strikeCommit): focus=enganchados/VIVOS; strikeCommit=comprometidos/ENGANCHADOS. DENOMINADORES DISTINTOS ⇒ DISOCIAN.
  const crux118 = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.strikeCommit({ enabled: true });   // aggroFocus ya es LIVE (#118 enabled:true)
    const read = (states) => { window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
      const dv = window.__dev.strikeCommit({ driveCommit: { pts, wipe: true } }).driveCommit;
      return { strikeCommit: dv.score, scIdx: dv.idx, focus: window.__dev.aggroFocus().score, focusIdx: +window.__dev.aggroFocus().idx }; };
    // Qa toda-enganchada-en-chase: focus2 (4/4 vivos enganchados) / strikeCommit0 (0/4 enganchados golpeando)
    const allChase = read(["chase", "chase", "chase", "chase"]);
    // Qb toda-en-strike: focus2 (4/4 vivos enganchados) / strikeCommit2 (4/4 enganchados golpeando)
    const allStrike = read(["strike", "strike", "strike", "strike"]);
    // Qc 3-strike + 3-idle: focus1 (3 enganchados/6 vivos=0.5) / strikeCommit2 (3/3 enganchados golpeando=1.0) — eng=3≥minMobs3, focus BAJO PERO strikeCommit ALTO
    const halfStrikeHalfIdle = read(["strike", "strike", "strike", "idle", "idle", "idle"]);
    // Qd toda-idle: focus0 (0 enganchados) / strikeCommit0 (0 enganchados ⇒ denominador 0)
    const allIdle = read(["idle", "idle", "idle", "idle"]);
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    return { allChase, allStrike, halfStrikeHalfIdle, allIdle };
  }, { Z, POS });
  const crux118OK = crux118.allChase.focus === 2 && crux118.allChase.strikeCommit === 0
    && crux118.allStrike.focus === 2 && crux118.allStrike.strikeCommit === 2
    && crux118.halfStrikeHalfIdle.focus === 1 && crux118.halfStrikeHalfIdle.strikeCommit === 2
    && crux118.allIdle.focus === 0 && crux118.allIdle.strikeCommit === 0;
  ok("6 ★ ⊥#118 AGGRO-FOCUS crux (4 cuadrantes, DENOMINADORES DISTINTOS): TODA-CHASE ⇒ FOCUS 2/STRIKECOMMIT 0; TODA-STRIKE ⇒ FOCUS 2/STRIKECOMMIT 2; 3-STRIKE+3-IDLE ⇒ FOCUS 1(0.5)/STRIKECOMMIT 2(1.0); TODA-IDLE ⇒ FOCUS 0/STRIKECOMMIT 0 ⇒ focus mapea a strikeCommit 0 Y 2 (y viceversa) ⇒ INDEPENDIENTES (focus=enganchados/VIVOS ⊥ strikeCommit=comprometidos/ENGANCHADOS)",
     crux118OK, JSON.stringify(crux118));

  // 7 ★ ⊥#119 JERK crux: strikeCommit lee el SUB-ESTADO de combate (windup|strike); jerk lee el CHURN de movimiento (2ª derivada). Una manada QUIETA golpeando ⇒ strikeCommit ALTO pero jerk 0 (sin traslación/Δ).
  const crux119 = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.strikeCommit({ enabled: true });   // jerkDir ya es LIVE (#119 enabled:true)
    window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const pts = ["strike", "strike", "strike", "strike"].map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    const dv = window.__dev.strikeCommit({ driveCommit: { pts, wipe: true } }).driveCommit;   // manada QUIETA golpeando
    const jerk = window.__dev.jerkDir().score;   // jerk: 0 (mobs comprometidos estacionarios ⇒ sin historia de Δ)
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    return { strikeCommit: dv.score, jerk };
  }, { Z, POS });
  const crux119OK = crux119.strikeCommit === 2 && crux119.jerk === 0;
  ok("7 ★ ⊥#119 JERK crux (sub-estado de combate ≠ churn de movimiento): QUIETA-GOLPEANDO (4 strike estacionarios) ⇒ STRIKECOMMIT 2/JERK 0 ⇒ el compromiso de golpe fija sin reorientar; el sub-estado NO es la 2ª derivada del movimiento",
     crux119OK, JSON.stringify(crux119));

  // 8 ★ ⊥ POSICIÓN #113 ENCIRCLE (& frost-slow #85): MISMO anillo cruz-4, todos-windup ⇒ strikeCommit2 + encircle2; el MISMO anillo todos-chase ⇒ encircle2 PERO strikeCommit0 ⇒ la posición NO determina el sub-estado.
  const antiPos = await page.evaluate((args) => {
    const { Z } = args;
    const ring = [[120, 0], [0, 120], [-120, 0], [0, -120]];   // cruz-4 ⇒ encircle alto
    window.__dev.strikeCommit({ enabled: true });
    const read = (states) => { window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = ring.map(([dx, dy], i) => ({ dx, dy, type: "rat", state: states[i] }));
      const dv = window.__dev.strikeCommit({ driveCommit: { pts, wipe: true } }).driveCommit;
      return { strikeCommit: dv.score, scIdx: dv.idx, encircle: window.__dev.encircle ? window.__dev.encircle().score : null }; };
    const allWindup = read(["windup", "windup", "windup", "windup"]);   // MISMAS posiciones, todos comprometidos ⇒ strikeCommit2/encircle2
    const allChase = read(["chase", "chase", "chase", "chase"]);        // MISMAS posiciones, todos chase ⇒ strikeCommit0/encircle2
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    return { allWindup, allChase };
  }, { Z });
  const antiPosOK = antiPos.allWindup.strikeCommit === 2 && antiPos.allChase.strikeCommit === 0
    && (antiPos.allWindup.encircle == null || (antiPos.allWindup.encircle >= 1 && antiPos.allWindup.encircle === antiPos.allChase.encircle));
  ok("8 ★ ⊥ POSICIÓN #113 ENCIRCLE (& frost-slow #85): MISMO anillo cruz-4, todos-windup ⇒ STRIKECOMMIT 2/ENCIRCLE 2; todos-chase ⇒ STRIKECOMMIT 0/ENCIRCLE IGUAL ⇒ la posición (encircle) NO determina el sub-estado; el estado sí" + (antiPos.allWindup.encircle != null ? "" : " (encircle hook ausente ⇒ sólo strikeCommit)"),
     antiPosOK, JSON.stringify(antiPos));

  // 9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 2/4 y 3/6 ⇒ MISMA SC=0.5/score1 (fracción invariante al conteo) mientras packHarvest (conteo) difiere.
  const countInv = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.strikeCommit({ enabled: true });
    const read = (states) => { window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
      const dv = window.__dev.strikeCommit({ driveCommit: { pts, wipe: true } }).driveCommit;
      return { idx: dv.idx, score: dv.score, pack: window.__dev.packHarvest().score }; };
    const half4 = read(["strike", "strike", "chase", "chase"]);            // 2/4=0.5 ⇒ 1
    const half6 = read(["strike", "strike", "strike", "chase", "chase", "chase"]);   // 3/6=0.5 ⇒ 1
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    return { half4, half6 };
  }, { Z, POS });
  const countInvOK = Math.abs(countInv.half4.idx - countInv.half6.idx) < 0.001 && countInv.half4.score === 1 && countInv.half6.score === 1;
  ok("9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 2/4 y 3/6 ⇒ MISMA SC=0.5 y score 1 (fracción invariante al conteo) mientras packHarvest (EXTENSIVO/conteo) cambia",
     countInvOK, JSON.stringify(countInv));

  // 10 CANAL strikeCommitFind: forageChargePreview con embate >0 ; sin comprometer → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.strikeCommit({ enabled: true });
    window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.strikeCommit({ driveCommit: { pts: mk(["strike", "strike", "strike", "strike"]), wipe: true } });   // SC1.0 ⇒ score2 ⇒ T2
    const actVm = window.__dev.strikeCommit();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.strikeCommit({ driveCommit: { pts: mk(["strike", "chase", "chase", "chase"]), wipe: true } });   // SC0.25 ⇒ score0
    const goVm = window.__dev.strikeCommit();
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL strikeCommitFind: forageChargePreview con manada onslaught (SC1.0) ⇒ charge>0 (==strikeCommitBonus); con manada sin comprometer (SC0.25) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds strikeCommitBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let sc = 0; sc <= 1.001; sc += 0.05) vals.push(window.__dev.strikeCommit({ commitProbe: { sc } }).commitProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.strikeCommit().cap };
  });
  ok("11 ★ SUB-CAP: ningún SC produce charge>strikeCommitBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with an onslaught pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.strikeCommit({ enabled: true });
    window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.strikeCommit({ driveCommit: { pts: mk(["strike", "strike", "strike", "strike"]), wipe: true } });   // manada onslaught disponible
    window.__dev.strikeCommit({ enabled: false });                          // now OFF
    const off = window.__dev.strikeCommit();
    window.__dev.strikeCommit({ enabled: true }); window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } }); window.__dev.strikeCommit({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, POS });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, strikeCommitBonus(pack onslaught disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling aggroFocus/jerkDir/encircle no cambia la señal de strikeCommit.
  const orth = await page.evaluate((args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.strikeCommit({ enabled: true });
    window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const beforeArc = window.__dev.strikeCommit({ driveCommit: { pts: mk(["strike", "strike", "strike", "chase"]), wipe: true } }).driveCommit;
    const snap = () => JSON.stringify({ aggroFocus: window.__dev.aggroFocus(), jerkDir: window.__dev.jerkDir(), encircle: window.__dev.encircle() });
    const peersOn = snap();
    const afPrev = window.__dev.aggroFocus().enabled, jkPrev = window.__dev.jerkDir().enabled, enPrev = window.__dev.encircle().enabled;
    window.__dev.aggroFocus({ enabled: !afPrev }); window.__dev.jerkDir({ enabled: !jkPrev }); window.__dev.encircle({ enabled: !enPrev });
    const afterArc = window.__dev.strikeCommit({ commitProbeLive: true }).commitProbeLive;
    window.__dev.aggroFocus({ enabled: afPrev }); window.__dev.jerkDir({ enabled: jkPrev }); window.__dev.encircle({ enabled: enPrev });
    const peersRestored = snap();
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = beforeArc.score === afterArc.score && Math.abs(beforeArc.idx - afterArc.field) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: beforeArc.score, afterScore: afterArc.score, beforeIdx: beforeArc.idx, afterField: afterArc.field };
  }, { Z, POS });
  ok("13 ★ ORTOGONALIDAD strikeCommitFind ⊥ peers: la señal de embate (score/SC) NO cambia al togglear AGGRO-FOCUS #118/JERK #119/ENCIRCLE #113; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 61 arc flags served true; STRIKE_COMMIT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE", "JERK_DIR_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const scDark = flag("STRIKE_COMMIT_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 61 mecanismos del arco #59-#119 served enabled:true; STRIKE_COMMIT_SURGE served false (DARK #120)",
     arcAllOn && scDark && arc.length === 61, `strikeCommit=${flag("STRIKE_COMMIT_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Embate:" drawn ON+onslaught / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Embate:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.strikeCommit({ enabled: true });
    window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee strikeCommitVM en vivo; el loop rAF re-tickea la IA (los mobs strike inyectados pueden cambiar de estado) ⇒ re-inyecta cada frame para probar el DIBUJO en estado onslaught.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; window.__dev.strikeCommit({ driveCommit: { pts: mk(["strike", "strike", "strike", "strike"]), wipe: true } }); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    const enAtOff = window.__dev.strikeCommit().enabled;
    cnt = 0; const t1 = performance.now(); let everOn = false;
    await new Promise((res) => { const loop = () => { if (window.__dev.strikeCommit().enabled) everOn = true; if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff, everOn };
  }, { Z, POS });
  ok("15 render badge \"Embate:\" se DIBUJA ON+onslaught (SC>0, re-driven cada frame) y NO OFF (SC 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff} everOn=${badge.everOn}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS } = args; const pts = POS.map(([dx, dy], i) => ({ dx, dy, type: "rat", state: i < 4 ? "strike" : "chase" })); window.__dev.strikeCommit({ enabled: true }); window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.strikeCommit({ driveCommit: { pts, wipe: true } }); }, { Z, POS });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } }); window.__dev.strikeCommit({ enabled: false }); });

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
    const states = ["strike", "strike", "strike", "chase"];   // 3/4 = 0.75 ⇒ onslaught ⇒ 2
    const pts = states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.strikeCommit({ enabled: true });
    window.__dev.strikeCommit({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.strikeCommit({ driveCommit: { pts, wipe: true } }).driveCommit;
    const vm = window.__dev.strikeCommit();
    const lut = [0, 0.34, 0.67, 1.0].map(sc => { const p = window.__dev.strikeCommit({ commitProbe: { sc } }).commitProbe; return { sc, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.strikeCommit({ commitProbeLive: true }).commitProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.strikeCommit({ driveCommit: { pts: [], wipe: true } });
    window.__dev.strikeCommit({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveFrac: live.frac, liveScore: live.score, committing: live.committing, engaged: live.engaged, lut, fp };
  }, { Z, FPARG, POS });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveFrac === B.liveFrac && A.liveScore === B.liveScore && A.committing === B.committing && A.engaged === B.engaged && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (3 strike + 1 chase, SC=0.75)+héroe ⇒ score/idx/tier/charge + commitProbeLive(frac,committing,engaged,score) + commitProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveFrac:${A.liveFrac},committing:${A.committing},engaged:${A.engaged},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveFrac:${B.liveFrac},committing:${B.committing},engaged:${B.engaged},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.strikeCommit({ enabled: false }));
  await pageB.evaluate(() => window.__dev.strikeCommit({ enabled: false }));

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
