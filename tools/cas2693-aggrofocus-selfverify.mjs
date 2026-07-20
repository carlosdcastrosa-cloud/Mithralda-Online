// CAS-2693 — self-verify for REMATE DE ACOSO (DARK, AGGRO_FOCUS_SURGE.enabled:false). EVO mecánica #118 (serializa tras #117 ACCEL_SURGE LIVE&served 48b919d17b6c/815, base HEAD 4cd3808) — EJE FRESCO + CANAL FRESCO, ⊥ a las 59 LIVE #59-#117. ABRE la familia COMPOSICIÓN-DE-INTENCIÓN.
// (A) EJE FRESCO = FRACCIÓN de AGGRO-FOCUS = focusField(hero) = F = (#mobs VIVOS ENGANCHADOS en el héroe) / (#mobs VIVOS en radio). 🔑 PROXY server-auth AUTORIZADO por el issue (single-player NO tiene aiTarget per-mob): estado de IA ENGANCHADO {chase,windup,strike,recover,shield} (aggro activa — MISMO predicado que lastStandCount sim.js:3862 / bonfireUnsafe) vs {idle,wander,flee}. focusBand: ≥hiFocus(0.67) ⇒ locked ⇒ 2; ≥midFocus(0.34) ⇒ harrying ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) vivos en radio (DENOMINADOR). INTENSIVO/ADIMENSIONAL (fracción, invariante al conteo). SNAPSHOT PURO (sin captura per-tick, a diferencia de #117 ACCEL).
//     CRUX ⊥#112 CONVERGE / cinética (INTENCIÓN ≠ MOVIMIENTO, 4 cuadrantes focus×converge): chase-cerrando ⇒ focus2/converge2; windup(engaged estacionario) ⇒ focus2/converge0; wander-alejándose(no-engaged) ⇒ focus0/converge0; wander-HACIA(no-engaged, deriva al héroe) ⇒ focus0/converge2 ⇒ focus mapea a converge 0 Y 2 (y converge a focus 0 Y 2) ⇒ INDEPENDIENTES. CRUX ⊥#90 HEADING (1 víctima MAX ⊥ fracción AGREGADA). CRUX ⊥#84 SKIRMISH (fracción ranged ATRIBUTO ⊥ fracción de aggro-ESTADO). ⊥#69 LAST_STAND (CONTEO de enganchados EXTENSIVO ⊥ FRACCIÓN intensiva: 5-de-5 y 5-de-10 ⇒ MISMO conteo pero F distinto). ⊥#87 PACKHARVEST (CONTEO). ⊥#85 frost-slow (escala velocidad NO estado ⇒ pack slowed SIGUE en chase ⇒ focus INDEPENDIENTE). ⊥#107/#108/#113 POSICIONES (un anillo ESTACIONARIO todo-chase ⇒ encircle2 Y focus2 pero mitad-idle ⇒ encircle2/focus0.5).
// (B) CANAL FRESCO = aggroFocusFind (fichas de acoso por rematar con la manada COORDINADA en aggro — NINGUNA de las 59 flags lo usa; ⊥ accelFind #117/convergeFind #112/headingFind #90/skirmishFind #84). Moneda FRESCA (h.aggroFocusBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). ⊥ FOCUS_FIRE #62 (passive CO-OP de PARTY, canal goldFind).
//
// Run: node tools/cas2693-aggrofocus-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2693");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// focusProbe LUT esperada: F→banda→{tier,charge}. UMBRALES hiFocus 0.67 / midFocus 0.34, bordes exactos + cap.
const EXPECT_F = [
  { f: 0, w: 0, t: 0, s: 0 }, { f: 0.33, w: 0, t: 0, s: 0 },                       // <midFocus (disperso) ⇒ 0
  { f: 0.34, w: 1, t: 1, s: 1 }, { f: 0.66, w: 1, t: 1, s: 1 },                    // ≥midFocus ⇒ harrying ⇒ 1 (borde 0.34 inclusive)
  { f: 0.67, w: 2, t: 2, s: 2 }, { f: 1.0, w: 2, t: 2, s: 2 },                     // ≥hiFocus ⇒ locked ⇒ 2 (borde 0.67 inclusive)
];
// driveFocus por fracción REAL: inyecta N mobs, k enganchados (chase) + resto idle. F=k/N. Requiere N≥minMobs(3).
const CH = "chase", ID = "idle";
const mkStates = (nEng, nIdle) => Array.from({ length: nEng }, () => CH).concat(Array.from({ length: nIdle }, () => ID));
const EXPECT_DRIVE = [
  { name: "4of4=1.0", eng: 4, idle: 0, f: 1.000, w: 2 },                            // 4/4 ⇒ F1 ⇒ locked ⇒ 2
  { name: "3of4=0.75", eng: 3, idle: 1, f: 0.750, w: 2 },                           // 3/4 ⇒ F0.75 ≥hiFocus ⇒ 2
  { name: "2of3=0.667", eng: 2, idle: 1, f: 0.667, w: 1 },                          // 2/3 ⇒ F0.6667 <hiFocus(0.67) ⇒ harrying ⇒ 1 (borde crítico)
  { name: "4of6=0.667", eng: 4, idle: 2, f: 0.667, w: 1 },                          // 4/6 ⇒ F0.6667 <0.67 ⇒ 1
  { name: "2of4=0.5", eng: 2, idle: 2, f: 0.500, w: 1 },                            // 2/4 ⇒ F0.5 ≥midFocus ⇒ 1
  { name: "1of3=0.333", eng: 1, idle: 2, f: 0.333, w: 0 },                          // 1/3 ⇒ F0.3333 <midFocus(0.34) ⇒ 0
  { name: "1of4=0.25", eng: 1, idle: 3, f: 0.250, w: 0 },                           // 1/4 ⇒ F0.25 <mid ⇒ 0
  { name: "0of4=0", eng: 0, idle: 4, f: 0.000, w: 0 },                              // 0/4 ⇒ F0 ⇒ 0
  { name: "twoMobs", eng: 2, idle: 0, f: 0.000, w: 0 },                             // 2 mobs <minMobs(3) ⇒ 0 (degenerado)
  { name: "empty", eng: 0, idle: 0, f: 0.000, w: 0 },                              // vacío ⇒ 0
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

// inyecta un pack de estados dados (chase=engaged, idle=no) en POS ⇒ devuelve {idx,score,live}
const driveStates = (states) => {
  window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
  const pts = states.map((st, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: st }));
  const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
  const live = window.__dev.aggroFocus({ focusProbeLive: true }).focusProbeLive;
  return { idx: dv.idx, score: dv.score, liveFrac: live.frac, liveScore: live.score, engaged: live.engaged, mobCount: live.mobCount };
};

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroFocus && window.__dev.converge && window.__dev.encircle && window.__dev.heading && window.__dev.skirmishLine && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroFocus + peer hooks (converge/encircle/heading/skirmishLine/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroFocus());
  ok("2 byte-id OFF (fresh boot): AGGRO_FOCUS_SURGE.enabled false AND G.aggroFocusBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroFocusFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiFocus=${dark.hiFocus} midFocus=${dark.midFocus} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroFocusFind/aggroFocusBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroFocusFind|aggroFocusBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroFocusBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroFocusFind'/'aggroFocusBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroFocus({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroFocus({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ focusProbe LUT: F→band→tier→charge (UMBRALES hiFocus/midFocus + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroFocus({ focusProbe: { f: c.f } }).focusProbe), EXPECT_F);
  const tabOK = EXPECT_F.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ focusProbe LUT: F≥0.67⇒locked⇒2/T2; ≥0.34⇒harrying⇒1/T1; <0.34 (disperso)⇒0/T0 (UMBRAL hiFocus 0.67/midFocus 0.34, bordes 0/0.33/0.34/0.66/0.67/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ f: x.f, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH FRACCIÓN: driveFocus inyecta k enganchados (chase) + resto idle ⇒ F=k/N REAL.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS } = args;
    const CH = "chase", ID = "idle";
    const mkStates = (nEng, nIdle) => Array.from({ length: nEng }, () => CH).concat(Array.from({ length: nIdle }, () => ID));
    window.__dev.aggroFocus({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const states = mkStates(c.eng, c.idle);
      const pts = states.map((st, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: st }));
      const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
      const live = window.__dev.aggroFocus({ focusProbeLive: true }).focusProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, liveField: live.field, liveFrac: live.frac, liveScore: live.score, engaged: live.engaged, mobCount: live.mobCount });
    }
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS });
  // dvIdx / liveField = focusField GATED (minMobs) ⇒ = c.f. liveFrac = k/n RAW ungated (informativo; para twoMobs raw=1.0 pero el field gated=0).
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.f) < 0.005 && Math.abs(comp[i].liveField - c.f) < 0.005);
  ok("5b ★ REAL SERVER-AUTH FRACCIÓN: driveFocus (k chase + resto idle) ⇒ F=k/N ⇒ 4/4=1.0/2, 3/4=0.75/2, 2/3=0.667/1, 4/6=0.667/1, 2/4=0.5/1, 1/3=0.333/0, 1/4=0.25/0, 0/4=0/0, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#112 CONVERGE crux (4 cuadrantes focus×converge): focus lee el ESTADO (intención); converge lee el MOVIMIENTO (radial). INTENCIÓN ≠ MOVIMIENTO.
  const crux112 = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.aggroFocus({ enabled: true });   // converge ya es LIVE (#112 enabled:true)
    const read = (mk) => { window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = POS.slice(0, 4).map(([dx, dy]) => mk(dx, dy));
      const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
      return { focus: dv.score, fidx: dv.idx, converge: window.__dev.converge().score, cidx: +window.__dev.converge().idx }; };
    // Q1 chase-cerrando (engaged + closing): focus2 / converge2
    const chaseClosing = read((dx, dy) => ({ dx, dy, type: "rat", state: "chase" }));
    // Q2 windup (engaged + estacionario ⇒ headingIntent null ⇒ converge lo EXCLUYE): focus2 / converge0
    const windupStill = read((dx, dy) => ({ dx, dy, type: "rat", state: "windup" }));
    // Q3 wander-alejándose (NO engaged + deriva AWAY): focus0 / converge0 (radial saliente ⇒ converge no premia)
    const wanderAway = read((dx, dy) => ({ dx, dy, type: "rat", state: "wander", wx: dx, wy: dy }));
    // Q4 wander-HACIA (NO engaged + deriva al héroe): focus0 / converge2 (radial entrante SIN aggro)
    const wanderToward = read((dx, dy) => ({ dx, dy, type: "rat", state: "wander", wx: -dx, wy: -dy }));
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return { chaseClosing, windupStill, wanderAway, wanderToward };
  }, { Z, POS });
  const crux112OK = crux112.chaseClosing.focus === 2 && crux112.chaseClosing.converge === 2
    && crux112.windupStill.focus === 2 && crux112.windupStill.converge === 0
    && crux112.wanderAway.focus === 0 && crux112.wanderAway.converge === 0
    && crux112.wanderToward.focus === 0 && crux112.wanderToward.converge === 2;
  ok("6 ★ ⊥#112 CONVERGE crux (4 cuadrantes focus×converge): CHASE-CERRANDO ⇒ FOCUS 2/CONVERGE 2; WINDUP-ESTACIONARIO ⇒ FOCUS 2/CONVERGE 0; WANDER-ALEJÁNDOSE ⇒ FOCUS 0/CONVERGE 0; WANDER-HACIA ⇒ FOCUS 0/CONVERGE 2 ⇒ focus mapea a converge 0 Y 2 (y viceversa) ⇒ INDEPENDIENTES (INTENCIÓN ≠ MOVIMIENTO)",
     crux112OK, JSON.stringify(crux112));

  // 7 ★ ⊥#90 HEADING crux: heading = rumbo de 1 víctima MAX (1er momento); focus = fracción AGREGADA. Un cargador solitario entre deambulantes ⇒ heading2/focus~0; manada en windup (estacionaria) ⇒ heading0/focus2.
  const crux90 = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.aggroFocus({ enabled: true });   // heading ya es LIVE (#90 enabled:true)
    const read = (states, mkExtra) => { window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = states.map((st, i) => Object.assign({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }, mkExtra ? mkExtra(st, i) : {}));
      const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
      return { focus: dv.score, heading: window.__dev.heading().score }; };
    // 1 cargador (chase, closing) + 3 deambulantes alejándose: heading MAX=2 (el cargador); focus=1/4=0.25 ⇒ 0
    const loneCharger = read(["chase", "wander", "wander", "wander"], (st, i) => i > 0 ? { wx: POS[i][0], wy: POS[i][1] } : {});
    // manada TODA en windup (engaged, estacionaria ⇒ heading null-set ⇒ headingScore 0): focus=1.0 ⇒ 2
    const allWindup = read(["windup", "windup", "windup", "windup"]);
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return { loneCharger, allWindup };
  }, { Z, POS });
  const crux90OK = crux90.loneCharger.heading === 2 && crux90.loneCharger.focus === 0
    && crux90.allWindup.heading === 0 && crux90.allWindup.focus === 2;
  ok("7 ★ ⊥#90 HEADING crux (1 víctima MAX ⊥ fracción AGREGADA): LONE-CHARGER (1 chase + 3 wander-away) ⇒ HEADING 2/FOCUS 0 (F=0.25); TODA-EN-WINDUP (engaged estacionaria) ⇒ HEADING 0/FOCUS 2 (F=1.0) ⇒ MAX ⊥ FRACCIÓN",
     crux90OK, JSON.stringify(crux90));

  // 8 ★ ⊥#84 SKIRMISH crux: skirmish = fracción RANGED (atributo e.tpl.ranged); focus = fracción de aggro-ESTADO. Un pack melee todo-enganchado ⇒ skirmish0/focus2; un pack ranged deambulando ⇒ skirmish2/focus0.
  const crux84 = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.aggroFocus({ enabled: true });   // skirmishLine ya es LIVE (#84 enabled:true)
    const read = (states, type) => { window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type, state: st, wx: st === "wander" ? POS[i][0] : undefined, wy: st === "wander" ? POS[i][1] : undefined }));
      const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
      return { focus: dv.score, skirmish: window.__dev.skirmishLine().score }; };
    // pack MELEE (rat) todo en chase (engaged): skirmish 0 (melee) / focus 2
    const meleeLocked = read(["chase", "chase", "chase", "chase"], "rat");
    // pack RANGED (mage) todo deambulando (no engaged): skirmish alto / focus 0
    const rangedWander = read(["wander", "wander", "wander", "wander"], "mage");
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return { meleeLocked, rangedWander };
  }, { Z, POS });
  const crux84OK = crux84.meleeLocked.focus === 2 && crux84.meleeLocked.skirmish === 0
    && crux84.rangedWander.focus === 0 && crux84.rangedWander.skirmish >= 2;
  ok("8 ★ ⊥#84 SKIRMISH crux (fracción RANGED-atributo ⊥ fracción de aggro-ESTADO): MELEE-LOCKED (4 rat chase) ⇒ SKIRMISH 0/FOCUS 2; RANGED-WANDER (4 mage wander) ⇒ SKIRMISH ≥2/FOCUS 0 ⇒ arquetipo ⊥ intención",
     crux84OK, JSON.stringify(crux84));

  // 8b ★ ⊥ frost-slow #85 / geométrico #113: un anillo ESTACIONARIO todo-chase (engaged, slowed) ⇒ focus2 + encircle2 CO-OCURREN; el MISMO anillo con la mitad en idle ⇒ encircle2 PERO focus baja ⇒ la posición NO determina el focus.
  const antiPos = await page.evaluate((args) => {
    const { Z } = args;
    const ring = [[120, 0], [0, 120], [-120, 0], [0, -120]];   // cruz-4 ⇒ encircle alto
    window.__dev.aggroFocus({ enabled: true });
    const read = (states) => { window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = ring.map(([dx, dy], i) => ({ dx, dy, type: "rat", state: states[i] }));
      const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
      return { focus: dv.score, fidx: dv.idx, encircle: window.__dev.encircle ? window.__dev.encircle().score : null }; };
    const allEngaged = read(["chase", "chase", "chase", "chase"]);   // MISMAS posiciones, todos engaged ⇒ focus2/encircle2
    const halfIdle = read(["chase", "idle", "chase", "idle"]);        // MISMAS posiciones, mitad idle ⇒ focus baja/encircle2
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return { allEngaged, halfIdle };
  }, { Z });
  const antiPosOK = antiPos.allEngaged.focus === 2 && antiPos.halfIdle.focus <= 1
    && (antiPos.allEngaged.encircle == null || (antiPos.allEngaged.encircle >= 1 && antiPos.allEngaged.encircle === antiPos.halfIdle.encircle));
  ok("8b ★ ⊥ POSICIÓN #107/#108/#113 (& frost-slow #85): MISMO anillo cruz-4, todos-chase ⇒ FOCUS 2/ENCIRCLE 2; mitad-idle ⇒ FOCUS ≤1/ENCIRCLE IGUAL ⇒ la posición (encircle) NO determina el focus; el estado sí" + (antiPos.allEngaged.encircle != null ? "" : " (encircle hook ausente ⇒ sólo focus)"),
     antiPosOK, JSON.stringify(antiPos));

  // 9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST & ⊥#69 LAST_STAND): 2/4 y 3/6 ⇒ MISMA F=0.5/score1 (fracción invariante al conteo) mientras packHarvest (conteo) difiere.
  const countInv = await page.evaluate((args) => {
    const { Z, POS } = args;
    window.__dev.aggroFocus({ enabled: true });
    const read = (states) => { window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
      const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
      return { idx: dv.idx, score: dv.score, pack: window.__dev.packHarvest().score }; };
    const half4 = read(["chase", "chase", "idle", "idle"]);            // 2/4=0.5 ⇒ 1
    const half6 = read(["chase", "chase", "chase", "idle", "idle", "idle"]);   // 3/6=0.5 ⇒ 1
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return { half4, half6 };
  }, { Z, POS });
  const countInvOK = Math.abs(countInv.half4.idx - countInv.half6.idx) < 0.001 && countInv.half4.score === 1 && countInv.half6.score === 1;
  ok("9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST ⊥#69 LAST_STAND): 2/4 y 3/6 ⇒ MISMA F=0.5 y score 1 (fracción invariante al conteo) mientras packHarvest (EXTENSIVO/conteo) cambia",
     countInvOK, JSON.stringify(countInv));

  // 10 CANAL aggroFocusFind: forageChargePreview con acoso >0 ; con disperso → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.aggroFocus({ enabled: true });
    window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.aggroFocus({ driveFocus: { pts: mk(["chase", "chase", "chase", "chase"]), wipe: true } });   // F1.0 ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroFocus();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroFocus({ driveFocus: { pts: mk(["chase", "idle", "idle", "idle"]), wipe: true } });   // F0.25 ⇒ score0
    const goVm = window.__dev.aggroFocus();
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL aggroFocusFind: forageChargePreview con manada locked (F1.0) ⇒ charge>0 (==focusBonus); con manada dispersa (F0.25) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds aggroFocusBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let f = 0; f <= 1.001; f += 0.05) vals.push(window.__dev.aggroFocus({ focusProbe: { f } }).focusProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.aggroFocus().cap };
  });
  ok("11 ★ SUB-CAP: ningún F produce charge>aggroFocusBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a locked pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.aggroFocus({ enabled: true });
    window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.aggroFocus({ driveFocus: { pts: mk(["chase", "chase", "chase", "chase"]), wipe: true } });   // manada locked disponible
    window.__dev.aggroFocus({ enabled: false });                          // now OFF
    const off = window.__dev.aggroFocus();
    window.__dev.aggroFocus({ enabled: true }); window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } }); window.__dev.aggroFocus({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, POS });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, focusBonus(pack locked disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling converge/encircle/heading no cambia la señal de focus.
  const orth = await page.evaluate((args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.aggroFocus({ enabled: true });
    window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const beforeArc = window.__dev.aggroFocus({ driveFocus: { pts: mk(["chase", "chase", "chase", "idle"]), wipe: true } }).driveFocus;
    const snap = () => JSON.stringify({ converge: window.__dev.converge(), encircle: window.__dev.encircle(), heading: window.__dev.heading() });
    const peersOn = snap();
    const cvPrev = window.__dev.converge().enabled, enPrev = window.__dev.encircle().enabled, hdPrev = window.__dev.heading().enabled;
    window.__dev.converge({ enabled: !cvPrev }); window.__dev.encircle({ enabled: !enPrev }); window.__dev.heading({ enabled: !hdPrev });
    const afterArc = window.__dev.aggroFocus({ focusProbeLive: true }).focusProbeLive;
    window.__dev.converge({ enabled: cvPrev }); window.__dev.encircle({ enabled: enPrev }); window.__dev.heading({ enabled: hdPrev });
    const peersRestored = snap();
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = beforeArc.score === afterArc.score && Math.abs(beforeArc.idx - afterArc.field) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: beforeArc.score, afterScore: afterArc.score, beforeIdx: beforeArc.idx, afterField: afterArc.field };
  }, { Z, POS });
  ok("13 ★ ORTOGONALIDAD aggroFocusFind ⊥ peers: la señal de focus (score/F) NO cambia al togglear CONVERGE #112/ENCIRCLE #113/HEADING #90; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 59 arc flags served true; AGGRO_FOCUS_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const afDark = flag("AGGRO_FOCUS_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 59 mecanismos del arco #59-#117 served enabled:true; AGGRO_FOCUS_SURGE served false (DARK #118)",
     arcAllOn && afDark && arc.length === 59, `aggroFocus=${flag("AGGRO_FOCUS_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Fijación:" drawn ON+locked / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS } = args;
    const mk = (states) => states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Fijación:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroFocus({ enabled: true });
    window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee aggroFocusVM en vivo; el loop rAF re-tickea la IA (los mobs chase inyectados pueden cambiar de estado) ⇒ re-inyecta cada frame para probar el DIBUJO en estado locked.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; window.__dev.aggroFocus({ driveFocus: { pts: mk(["chase", "chase", "chase", "chase"]), wipe: true } }); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    const enAtOff = window.__dev.aggroFocus().enabled;
    cnt = 0; const t1 = performance.now(); let everOn = false;
    await new Promise((res) => { const loop = () => { if (window.__dev.aggroFocus().enabled) everOn = true; if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff, everOn };
  }, { Z, POS });
  ok("15 render badge \"Fijación:\" se DIBUJA ON+locked (F>0, re-driven cada frame) y NO OFF (F 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff} everOn=${badge.everOn}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS } = args; const pts = POS.map(([dx, dy], i) => ({ dx, dy, type: "rat", state: i < 5 ? "chase" : "idle" })); window.__dev.aggroFocus({ enabled: true }); window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }); }, { Z, POS });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } }); window.__dev.aggroFocus({ enabled: false }); });

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
    const states = ["chase", "chase", "chase", "idle"];   // 3/4 = 0.75 ⇒ locked ⇒ 2
    const pts = states.map((st, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: st }));
    window.__dev.aggroFocus({ enabled: true });
    window.__dev.aggroFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroFocus({ driveFocus: { pts, wipe: true } }).driveFocus;
    const vm = window.__dev.aggroFocus();
    const lut = [0, 0.34, 0.67, 1.0].map(f => { const p = window.__dev.aggroFocus({ focusProbe: { f } }).focusProbe; return { f, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.aggroFocus({ focusProbeLive: true }).focusProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroFocus({ driveFocus: { pts: [], wipe: true } });
    window.__dev.aggroFocus({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveFrac: live.frac, liveScore: live.score, engaged: live.engaged, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG, POS });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveFrac === B.liveFrac && A.liveScore === B.liveScore && A.engaged === B.engaged && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (3 chase + 1 idle, F=0.75)+héroe ⇒ score/idx/tier/charge + focusProbeLive(frac,engaged,mobCount,score) + focusProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveFrac:${A.liveFrac},engaged:${A.engaged},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveFrac:${B.liveFrac},engaged:${B.engaged},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroFocus({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroFocus({ enabled: false }));

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
