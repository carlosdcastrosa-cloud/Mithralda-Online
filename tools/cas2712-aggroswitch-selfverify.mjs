// CAS-2712 — self-verify for VAIVÉN DE OBJETIVOS (DARK, AGGRO_SWITCH_SURGE.enabled:false). EVO mecánica #122 (serializa tras #121 TARGET_SPREAD_SURGE LIVE&served 3767e248c042/815, base HEAD 03e60db7) — EJE FRESCO + CANAL FRESCO, ⊥ a las 63 LIVE #59-#121. AÑADE la dimensión TEMPORAL/CHURN a la familia COMPOSICIÓN-DE-INTENCIÓN (#118 nivel-sobre-el-héroe / #120 sub-estado / #121 forma-de-la-distribución-AHORA).
// (A) EJE FRESCO = FRACCIÓN de CHURN TEMPORAL = aggroSwitchField(hero) = V = (#mobs ENGANCHADOS con historia cuyo aiTarget ACTUAL ≠ su aiTarget de hace W ticks) / (#mobs ENGANCHADOS con historia). Historia per-mob = ring-buffer server-auth de aiTarget (e._swR, capacidad W+1), poblado por switchTick tras updateEnemies (CAPTURA TEMPORAL como #117 ACCEL / #119 JERK-SPLIT). aggroSwitchBand: ≥hiSwitch(0.67) ⇒ volatile ⇒ 2; ≥midSwitch(0.34) ⇒ shifting ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) con historia y ≥minPlayers(2). INTENSIVO/ADIMENSIONAL. 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ objetivo único (héroe) ⇒ nunca cambia ⇒ V=0 (colapso LIMPIO); cold-start ⇒ buffer no lleno ⇒ 0.
//     CRUX ⊥#121 REPARTO (LA CRÍTICA — CHURN-TEMPORAL vs FORMA-SNAPSHOT; 4-cuad): uniforme-Y-estable ⇒ spread-alto/switch0; TODO-sobre-uno-pero-rotando ⇒ spread≈0/switch-alto; uniforme-Y-re-rolleando ⇒ ambos-alto; fijo-todo-sobre-héroe ⇒ ambos0 ⇒ switch NO es función de spread ⇒ DISOCIAN. CRUX ⊥#118 AGGRO-FOCUS (nivel-estático vs tasa-de-cambio). CRUX ⊥#120 STRIKE-COMMIT (sub-estado vs identidad-de-objetivo). CRUX ⊥#117 ACCEL/#119 JERK (churn-de-MOVIMIENTO vs churn-de-IDENTIDAD-de-objetivo: switch invariante a posición/movimiento). ⊥#87 (fracción invariante al conteo).
// (B) CANAL FRESCO = aggroSwitchFind (fichas de vaivén por rematar con la manada ENGANCHADA re-apuntando frenéticamente su aggro — NINGUNA de las 63 flags lo usa; ⊥ targetSpreadFind #121/aggroFocusFind #118/strikeCommitFind #120). Moneda FRESCA (h.aggroSwitchBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2712-aggroswitch-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2712");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// switchProbe LUT esperada: (engaged,changed)→V→banda→{tier,charge}. UMBRALES hiSwitch 0.67 / midSwitch 0.34 + colapso single-player (P<2 ⇒ 0).
const EXPECT_SWITCH = [
  { engaged: 4, changed: 0, P: 2, v: 0.000, w: 0 },   // estable ⇒ V0 ⇒ 0
  { engaged: 4, changed: 1, P: 2, v: 0.250, w: 0 },   // 1/4 ⇒ V0.25 <mid ⇒ 0
  { engaged: 4, changed: 2, P: 2, v: 0.500, w: 1 },   // 2/4 ⇒ V0.5 ≥mid ⇒ shifting ⇒ 1
  { engaged: 3, changed: 2, P: 2, v: 0.667, w: 1 },   // 2/3 ⇒ V0.667 <hiSwitch(0.67) ≥mid ⇒ shifting ⇒ 1
  { engaged: 4, changed: 3, P: 2, v: 0.750, w: 2 },   // 3/4 ⇒ V0.75 ≥hi ⇒ volatile ⇒ 2
  { engaged: 4, changed: 4, P: 2, v: 1.000, w: 2 },   // 4/4 ⇒ V1 ⇒ 2
  { engaged: 6, changed: 4, P: 2, v: 0.667, w: 1 },   // 4/6 ⇒ V0.667 ⇒ 1 (invariante al conteo vs 2/3)
  { engaged: 3, changed: 3, P: 2, v: 1.000, w: 2 },   // 3/3 ⇒ V1 ⇒ 2
  { engaged: 4, changed: 4, P: 1, v: 0.000, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveSwitch REAL: inyecta party sintética (P=hero+extra) + mobs con SCHEDULE de objetivos per-tick (longitud W+1=7 ⇒ buffer lleno); V=(#cuyo schedule[0]≠schedule[6])/(#enganchados-con-historia). Requiere ≥minMobs(3) y ≥minPlayers(2).
const CH = [0, 0, 0, 0, 0, 0, 1];   // schedule CAMBIA (endpoint player1 ≠ hace-W-ticks player0) ⇒ changed
const S0 = [0, 0, 0, 0, 0, 0, 0];   // schedule ESTABLE sobre héroe(0) ⇒ unchanged
const S1 = [1, 1, 1, 1, 1, 1, 1];   // schedule ESTABLE sobre player1 ⇒ unchanged
const S2 = [2, 2, 2, 2, 2, 2, 2];   // schedule ESTABLE sobre player2 ⇒ unchanged
const ROT = [0, 0, 0, 1, 1, 1, 1];  // CONCENTRADO cada tick (todos comparten 1 objetivo) pero ROTA cuál ⇒ changed (endpoint1≠hace-W0)
const COLD = [0, 0, 0];             // <W+1 ⇒ buffer no lleno ⇒ e._swHas=false (cold-start)
const EXPECT_DRIVE = [
  { name: "4eng-stable-4p", players: 3, scheds: [S0, S1, S2, [3, 3, 3, 3, 3, 3, 3]], v: 0.000, w: 0 },  // 4 estables distintos ⇒ V0
  { name: "4eng-2chg-4p", players: 3, scheds: [CH, CH, S1, S2], v: 0.500, w: 1 },                       // 2 cambian de 4 ⇒ V0.5
  { name: "4eng-4chg-4p", players: 3, scheds: [CH, CH, CH, CH], v: 1.000, w: 2 },                       // todos cambian ⇒ V1
  { name: "concentr-rotating-2p", players: 1, scheds: [ROT, ROT, ROT, ROT], v: 1.000, w: 2 },           // 🔑 concentrado cada tick pero rotando ⇒ V1 (⊥#121: spread≈0/switch alto)
  { name: "single-player", players: 0, scheds: [CH, CH, CH, CH], v: 0.000, w: 0 },                      // 🔑 P1 (sólo héroe) ⇒ degenerado ⇒ 0
  { name: "cold-start-4p", players: 3, scheds: [COLD, COLD, COLD, COLD], v: 0.000, w: 0 },              // 🔑 buffer no lleno ⇒ 0 con historia ⇒ 0
  { name: "2eng-<minMobs", players: 1, scheds: [CH, CH], v: 0.000, w: 0 },                              // 2 con historia <minMobs3 ⇒ 0
];
const POS = [[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110]];
const PLAYER_OFF = [[44, 0], [0, 44], [-44, 0], [30, 30], [-30, 30]];   // offsets de jugadores sintéticos (dentro de radio 300)

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroSwitch && window.__dev.targetSpread && window.__dev.strikeCommit && window.__dev.aggroFocus && window.__dev.accel && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroSwitch + peer hooks (targetSpread/strikeCommit/aggroFocus/accel/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroSwitch());
  ok("2 byte-id OFF (fresh boot): AGGRO_SWITCH_SURGE.enabled false AND G.aggroSwitchBounty NUNCA se crea (gExists false) AND G._swParty NUNCA se crea (partyExists false) AND historia per-mob NUNCA poblada",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroSwitchFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" window=${dark.window} hiSwitch=${dark.hiSwitch} midSwitch=${dark.midSwitch} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroSwitchFind/aggroSwitchBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroSwitchFind|aggroSwitchBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroSwitchBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroSwitchFind'/'aggroSwitchBounty' (fichas transitorias; historia per-mob nunca serializada)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle (incl. temporal buffer folded out — enemies never in fp)
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroSwitch({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroSwitch({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; ni las fichas ni el ring-buffer per-mob entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ switchProbe LUT: (engaged,changed)→V→band→tier→charge (UMBRALES hiSwitch/midSwitch + colapso single-player).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroSwitch({ switchProbe: { engaged: c.engaged, changed: c.changed, P: c.P } }).switchProbe), EXPECT_SWITCH);
  const tabOK = EXPECT_SWITCH.every((c, i) => tab[i] && tab[i].weight === c.w && Math.abs(tab[i].switch - c.v) < 0.005);
  ok("5 ★ switchProbe LUT (FRACCIÓN de churn): 0/4⇒0/0, 1/4⇒0.25/0, 2/4⇒0.5/1, 2/3⇒0.667/1, 3/4⇒0.75/2, 4/4⇒1.0/2, 4/6⇒0.667/1, 3/3⇒1.0/2, 4/4-P1⇒0/0 (single-player LIMPIO). UMBRAL hiSwitch 0.67/midSwitch 0.34",
     tabOK, JSON.stringify(tab.map(x => ({ e: x.engaged, c: x.changed, P: x.players, v: x.switch, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH CHURN TEMPORAL: driveSwitch inyecta party sintética + mobs con SCHEDULE de objetivos ⇒ switchTick puebla el ring-buffer REAL ⇒ V=cambiados/enganchados.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroSwitch({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const pts = c.scheds.map((tgts, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase", tgts }));
      const dv = window.__dev.aggroSwitch({ driveSwitch: { players, pts, wipe: true } }).driveSwitch;
      const live = window.__dev.aggroSwitch({ switchProbeLive: true }).switchProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, dvPlayers: dv.players, steps: dv.steps, liveField: live.field, liveScore: live.score, engaged: live.engaged, changed: live.changed, livePlayers: live.players });
    }
    window.__dev.aggroSwitch({ clearSwitch: true });
    window.__dev.aggroSwitch({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.v) < 0.005 && Math.abs(comp[i].liveField - c.v) < 0.005);
  ok("5b ★ REAL SERVER-AUTH CHURN (ring-buffer temporal vía switchTick): 4eng-stable=0/0, 4eng-2chg=0.5/1, 4eng-4chg=1.0/2, concentr-rotating=1.0/2 (⊥#121), single-player(P1)=0/0, cold-start(buffer no lleno)=0/0, 2eng(<minMobs)=0/0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#121 TARGET-SPREAD crux (LA CRÍTICA — 4-cuad CHURN-TEMPORAL vs FORMA-SNAPSHOT): spread=entropía de la distribución AHORA (spreadProbe counts→S); switch=fracción cambiada en la ventana (switchProbe engaged,changed→V). DISOCIAN en los 4 cuadrantes.
  const crux121 = await page.evaluate(() => {
    const spreadW = (counts, P) => window.__dev.targetSpread({ spreadProbe: { counts, P } }).spreadProbe.weight;
    const switchW = (engaged, changed, P) => window.__dev.aggroSwitch({ switchProbe: { engaged, changed, P } }).switchProbe.weight;
    // (a) uniforme-Y-estable ⇒ spread ALTO / switch 0
    const qa = { spread: spreadW([3, 3, 3, 3], 4), sw: switchW(4, 0, 4) };
    // (b) TODO-sobre-uno pero ROTANDO cuál ⇒ spread ≈0 (concentrado cada tick) / switch ALTO
    const qb = { spread: spreadW([6, 0, 0, 0], 4), sw: switchW(6, 6, 4) };
    // (c) uniforme-Y-re-rolleando ⇒ spread ALTO / switch ALTO
    const qc = { spread: spreadW([3, 3, 3, 3], 4), sw: switchW(4, 4, 4) };
    // (d) fijo-todo-sobre-héroe ⇒ spread 0 / switch 0
    const qd = { spread: spreadW([6, 0, 0, 0], 4), sw: switchW(4, 0, 4) };
    return { qa, qb, qc, qd };
  });
  const crux121OK = crux121.qa.spread === 2 && crux121.qa.sw === 0
    && crux121.qb.spread === 0 && crux121.qb.sw === 2
    && crux121.qc.spread === 2 && crux121.qc.sw === 2
    && crux121.qd.spread === 0 && crux121.qd.sw === 0;
  ok("6 ★ ⊥#121 TARGET-SPREAD crux (LA CRÍTICA, 4-cuad, CHURN-TEMPORAL vs FORMA-SNAPSHOT): uniforme-estable ⇒ SPREAD 2/SWITCH 0; concentrado-rotando ⇒ SPREAD 0/SWITCH 2; uniforme-re-rolleando ⇒ SPREAD 2/SWITCH 2; fijo ⇒ SPREAD 0/SWITCH 0 ⇒ switch mapea a spread 2 (qa) Y 0 (qb) ⇒ switch NO es función de spread ⇒ DISOCIAN (cuad b 'concentrado-pero-rotando' y cuad a 'uniforme-pero-estable' son la clave)",
     crux121OK, JSON.stringify(crux121));

  // 7 ★ ⊥#118 AGGRO-FOCUS crux (NIVEL-estático vs TASA-de-cambio): focus=counts[0]/N (fracción sobre el héroe, def MULTIJUGADOR); switch=fracción cambiada. DISOCIAN.
  const crux118 = await page.evaluate(() => {
    const switchW = (engaged, changed, P) => window.__dev.aggroSwitch({ switchProbe: { engaged, changed, P } }).switchProbe.weight;
    const focusMP = (counts) => { const N = counts.reduce((a, b) => a + b, 0); return N > 0 ? +(counts[0] / N).toFixed(3) : 0; };
    // 100%-sobre-héroe SIN cambiar ⇒ focus 1.0 / switch 0
    const qa = { focus: focusMP([4, 0, 0, 0]), sw: switchW(4, 0, 4) };
    // re-apuntando lejos-y-de-vuelta al héroe (mitad en héroe) pero re-targeteando ⇒ focus mid / switch ALTO
    const qb = { focus: focusMP([2, 2, 0, 0]), sw: switchW(4, 4, 4) };
    return { qa, qb };
  });
  const crux118OK = crux118.qa.focus === 1 && crux118.qa.sw === 0 && Math.abs(crux118.qb.focus - 0.5) < 0.005 && crux118.qb.sw === 2;
  ok("7 ★ ⊥#118 AGGRO-FOCUS crux (NIVEL-estático vs TASA-de-cambio): 100%-sobre-héroe-sin-cambiar ⇒ FOCUS 1.0/SWITCH 0; mitad-en-héroe re-targeteando ⇒ FOCUS 0.5/SWITCH 2 ⇒ un mismo nivel de focus admite switch 0 Y 2 ⇒ INDEPENDIENTES",
     crux118OK, JSON.stringify(crux118));

  // 8 ★ SINGLE-PLAYER DEGENERADO + COLD-START collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs volátiles, SIN party (P=1) ⇒ V=0; buffer no lleno ⇒ V=0; CON party (P≥2) + buffer lleno ⇒ V>0.
  const degen = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF, CH, COLD } = args;
    window.__dev.aggroSwitch({ enabled: true });
    const drive = (nPlayers, scheds) => { window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const pts = scheds.map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts }));
      const dv = window.__dev.aggroSwitch({ driveSwitch: { players, pts, wipe: true } }).driveSwitch;
      const live = window.__dev.aggroSwitch({ switchProbeLive: true }).switchProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged }; };
    const sp = drive(0, [CH, CH, CH, CH]);         // single-player: P=1 (sólo héroe) ⇒ V=0 (colapso)
    const cold = drive(3, [COLD, COLD, COLD, COLD]); // buffer no lleno ⇒ 0 con historia ⇒ V=0 (cold-start)
    const mp = drive(3, [CH, CH, CH, CH]);         // multijugador P4 + buffer lleno ⇒ V=1 (bien-definido)
    window.__dev.aggroSwitch({ clearSwitch: true });
    window.__dev.aggroSwitch({ enabled: false });
    return { sp, cold, mp };
  }, { Z, POS, PLAYER_OFF, CH, COLD });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.cold.engaged === 0 && degen.cold.idx === 0 && degen.cold.score === 0 && degen.mp.players === 4 && degen.mp.engaged === 4 && degen.mp.score === 2 && Math.abs(degen.mp.idx - 1) < 0.005;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 + COLD-START ⇒ 0 (LIMPIOS) / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs volátiles SIN party (P=1) ⇒ V=0/score0; buffer no lleno (cold-start) ⇒ 0-con-historia/score0; CON party (P=4) + buffer lleno ⇒ V=1.0/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina + historia",
     degenOK, JSON.stringify(degen));

  // 9 ★ ⊥#117 ACCEL / #119 JERK crux (churn-de-MOVIMIENTO vs churn-de-IDENTIDAD-de-objetivo): el switch depende SÓLO de la historia de aiTarget (e._swR), NO de posición/movimiento. Mismos objetivos-schedule con DISTINTAS posiciones ⇒ MISMO switch; mismas posiciones con DISTINTOS schedules ⇒ DISTINTO switch.
  const crux117 = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF, CH, S1, S2 } = args;
    window.__dev.aggroSwitch({ enabled: true });
    const drive = (posIdx, scheds) => { window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
      const pts = scheds.map((tgts, i) => ({ dx: POS[posIdx[i]][0], dy: POS[posIdx[i]][1], type: "rat", state: "chase", tgts }));
      return window.__dev.aggroSwitch({ driveSwitch: { players, pts, wipe: true } }).driveSwitch; };
    // packX: schedules TODOS-cambian, posiciones A ⇒ switch 2
    const px = drive([0, 1, 2, 3], [CH, CH, CH, CH]);
    // packZ: MISMOS schedules TODOS-cambian, posiciones DISTINTAS B ⇒ switch 2 (invariante a posición/movimiento)
    const pz = drive([3, 2, 1, 0], [CH, CH, CH, CH]);
    // packY: MISMAS posiciones que packX pero schedules ESTABLES ⇒ switch 0 (misma geometría, distinto churn de objetivo)
    const py = drive([0, 1, 2, 3], [S1, S2, [3, 3, 3, 3, 3, 3, 3], [4, 4, 4, 4, 4, 4, 4]]);
    window.__dev.aggroSwitch({ clearSwitch: true });
    window.__dev.aggroSwitch({ enabled: false });
    return { px: px.score, pz: pz.score, py: py.score };
  }, { Z, POS, PLAYER_OFF, CH, S1, S2 });
  const crux117OK = crux117.px === 2 && crux117.pz === 2 && crux117.py === 0;
  ok("9 ★ ⊥#117 ACCEL/#119 JERK crux (churn-de-MOVIMIENTO ≠ churn-de-IDENTIDAD-de-objetivo): schedules-volátiles con posiciones A ⇒ SWITCH 2; MISMOS schedules con posiciones DISTINTAS ⇒ SWITCH 2 (invariante al MOVIMIENTO); MISMAS posiciones con schedules ESTABLES ⇒ SWITCH 0 ⇒ el switch lo determina la IDENTIDAD del objetivo en el tiempo, NO la cinemática",
     crux117OK, JSON.stringify(crux117));

  // 10 CANAL aggroSwitchFind: forageChargePreview con manada volátil >0 ; estable → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF, CH, S0, S1, S2 } = args;
    window.__dev.aggroSwitch({ enabled: true });
    window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroSwitch({ driveSwitch: { players, pts: [CH, CH, CH, CH].map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts })), wipe: true } });   // V1 ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroSwitch();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroSwitch({ driveSwitch: { players, pts: [S0, S1, S2, [3, 3, 3, 3, 3, 3, 3]].map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts })), wipe: true } });   // estable ⇒ V0 ⇒ score0
    const goVm = window.__dev.aggroSwitch();
    window.__dev.aggroSwitch({ clearSwitch: true });
    window.__dev.aggroSwitch({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS, PLAYER_OFF, CH, S0, S1, S2 });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL aggroSwitchFind: forageChargePreview con manada volátil (V1.0) ⇒ charge>0 (==aggroSwitchBonus); con manada estable (V0) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds aggroSwitchBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let e = 3; e <= 10; e++) vals.push(window.__dev.aggroSwitch({ switchProbe: { engaged: e, changed: e, P: 2 } }).switchProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.aggroSwitch().cap };
  });
  ok("11 ★ SUB-CAP: ningún churn produce charge>aggroSwitchBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a volatile pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF, CH } = args;
    window.__dev.aggroSwitch({ enabled: true });
    window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroSwitch({ driveSwitch: { players, pts: [CH, CH, CH, CH].map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts })), wipe: true } });   // manada volátil disponible
    window.__dev.aggroSwitch({ enabled: false });                          // now OFF
    const off = window.__dev.aggroSwitch();
    window.__dev.aggroSwitch({ enabled: true }); window.__dev.aggroSwitch({ clearSwitch: true }); window.__dev.aggroSwitch({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, POS, PLAYER_OFF, CH });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, aggroSwitchBonus(pack volátil disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling targetSpread/aggroFocus/accel no cambia la señal de aggroSwitch.
  const orth = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF, CH, S1 } = args;
    window.__dev.aggroSwitch({ enabled: true });
    window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroSwitch({ driveSwitch: { players, pts: [CH, CH, S1, [2, 2, 2, 2, 2, 2, 2]].map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts })), wipe: true } }).driveSwitch;
    const snap = () => JSON.stringify({ targetSpread: window.__dev.targetSpread(), aggroFocus: window.__dev.aggroFocus(), accel: window.__dev.accel() });
    const peersOn = snap();
    const tsPrev = window.__dev.targetSpread().enabled, afPrev = window.__dev.aggroFocus().enabled, acPrev = window.__dev.accel().enabled;
    window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroFocus({ enabled: !afPrev }); window.__dev.accel({ enabled: !acPrev });
    const after = window.__dev.aggroSwitch({ switchProbeLive: true }).switchProbeLive;
    window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroFocus({ enabled: afPrev }); window.__dev.accel({ enabled: acPrev });
    const peersRestored = snap();
    window.__dev.aggroSwitch({ clearSwitch: true });
    window.__dev.aggroSwitch({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && Math.abs(before.idx - after.field) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeIdx: before.idx, afterField: after.field };
  }, { Z, POS, PLAYER_OFF, CH, S1 });
  ok("13 ★ ORTOGONALIDAD aggroSwitchFind ⊥ peers: la señal de vaivén (score/V) NO cambia al togglear TARGET-SPREAD #121/AGGRO-FOCUS #118/ACCEL #117; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 63 arc flags served true; AGGRO_SWITCH_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE", "JERK_DIR_SURGE", "STRIKE_COMMIT_SURGE", "TARGET_SPREAD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const asDark = flag("AGGRO_SWITCH_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 63 mecanismos del arco #59-#121 served enabled:true; AGGRO_SWITCH_SURGE served false (DARK #122)",
     arcAllOn && asDark && arc.length === 63, `aggroSwitch=${flag("AGGRO_SWITCH_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Vaivén:" drawn ON+volatile / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS, PLAYER_OFF, CH } = args;
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroSwitch({ driveSwitch: { players, pts: [CH, CH, CH, CH].map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts })), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Vaivén:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroSwitch({ enabled: true });
    window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee aggroSwitchVM en vivo; el loop rAF re-tickea la IA (los mobs chase inyectados pueden moverse/cambiar de estado) ⇒ re-inyecta el schedule cada frame para probar el DIBUJO en estado volatile.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroSwitch({ clearSwitch: true });
    window.__dev.aggroSwitch({ enabled: false });
    const enAtOff = window.__dev.aggroSwitch().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, POS, PLAYER_OFF, CH });
  ok("15 render badge \"Vaivén:\" se DIBUJA ON+volatile (V>0, re-driven cada frame) y NO OFF (V 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS, PLAYER_OFF, CH } = args; const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroSwitch({ enabled: true }); window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroSwitch({ driveSwitch: { players, pts: [CH, CH, CH, CH].map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts })), wipe: true } }); }, { Z, POS, PLAYER_OFF, CH });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroSwitch({ clearSwitch: true }); window.__dev.aggroSwitch({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence (incl. temporal ring-buffer folded identically).
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
    const { Z, FPARG, POS, PLAYER_OFF } = args;
    const CH = [0, 0, 0, 0, 0, 0, 1], S1 = [1, 1, 1, 1, 1, 1, 1];
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const pts = [CH, CH, CH, S1].map((tgts, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgts }));   // P4, 3-de-4 cambian ⇒ V=0.75 ⇒ volatile ⇒ 2
    window.__dev.aggroSwitch({ enabled: true });
    window.__dev.aggroSwitch({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroSwitch({ driveSwitch: { players, pts, wipe: true } }).driveSwitch;
    const vm = window.__dev.aggroSwitch();
    const lut = [[4, 0], [4, 2], [3, 2], [4, 4]].map(([e, c]) => { const p = window.__dev.aggroSwitch({ switchProbe: { engaged: e, changed: c, P: 2 } }).switchProbe; return { e, c, v: p.switch, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.aggroSwitch({ switchProbeLive: true }).switchProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroSwitch({ clearSwitch: true });
    window.__dev.aggroSwitch({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, engaged: live.engaged, changed: live.changed, players: live.players, lut, fp };
  }, { Z, FPARG, POS, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.engaged === B.engaged && A.changed === B.changed && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA party+schedule (P4, 3-de-4 cambian, V=0.75)+héroe ⇒ score/idx/tier/charge + switchProbeLive(field,engaged,changed,players,score) + switchProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; el ring-buffer temporal se pliega idéntico en cada cliente)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},engaged:${A.engaged},changed:${A.changed},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},engaged:${B.engaged},changed:${B.changed},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroSwitch({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroSwitch({ enabled: false }));

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
