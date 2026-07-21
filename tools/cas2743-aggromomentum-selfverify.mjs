// CAS-2743 — self-verify for ESCALADA (DARK, AGGRO_MOMENTUM_SURGE.enabled:false). EVO mecánica #128 (serializa tras #127 AGGRO_VARIETY_SURGE LIVE&served 8dd689f8c58f/815, base master ec5de3d) — EJE FRESCO + CANAL FRESCO, ⊥ a las 69 LIVE #59-#127. AÑADE la dimensión ESCALATION/BUILD-UP (la TENDENCIA aggro CON SIGNO, no el snapshot) a la familia COMPOSICIÓN-DE-INTENCIÓN.
// (A) EJE FRESCO = ESCALADA = aggroMomentumField(hero) = M = min(1, rawM/momentumCap), rawM = max(0, N_t − N_{t−Δ}), N = # mobs ALIVE ENGANCHADOS en radio. TEMPORAL/WINDOWED (ring-buffer per-héroe G._momR vía momentumTick, como #122 SWITCH; NO snapshot-puro). aggroMomentumBand sobre rawM CRUDO: ≥hiMomentum(3) ⇒ surging ⇒ 2; ≥midMomentum(2) ⇒ creciendo ⇒ 1; <mid ⇒ 0. Requiere ring LLENO (Δ+1) + N_t≥minMobs(3) + P≥minPlayers(2). 🔑 single-player ⇒ M=0; decay/estable ⇒ M=0 (sólo build-up POSITIVO).
//     CRUX (LA CRÍTICA) — MOMENTUM es la DERIVADA CON SIGNO; los priores snapshot son el NIVEL: ⊥#126 DENSITY: N=6 estable (M=0) vs N:2→4→6 (M=hi) MISMA densidad instantánea. ⊥#122 SWITCH: churn-sin-crecimiento (M=0) vs crecimiento-sin-churn (M=hi) — momentum lee sólo el CONTEO. ⊥#124/#125/#121/#123/#118/#127 (agnóstico a forma/tipo).
// (B) CANAL FRESCO = aggroMomentumFind (fichas de escalada por rematar mientras el pull CRECE — NINGUNA de las 69 flags lo usa). Moneda FRESCA (h.aggroMomentumBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint); ring G._momR TRANSITORIO (nunca serializado).
//
// Run: node tools/cas2743-aggromomentum-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2743");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// momentumProbe LUT esperada: (samples ring de N, players)→N_t vs N_{t−Δ}→rawM=max(0,ΔN)→M=min(1,rawM/cap4)→banda(rawM crudo)→tier. window=4 (buffer lleno = 5 muestras); minMobs3 (N_t) + minPlayers2 + decay/cold-start ⇒ 0. 🔑 momentum lee SÓLO el CONTEO temporal.
const EXPECT_PROBE = [
  { name: "steady6",        samples: [6, 6, 6, 6, 6], players: 2, raw: 0, m: 0.000, w: 0 },   // N=6 estable ⇒ M=0 (MISMA densidad instantánea que grow2to6, momentum opuesto)
  { name: "grow2to6",       samples: [2, 3, 4, 5, 6], players: 2, raw: 4, m: 1.000, w: 2 },   // N:2→6 ΔN4 ⇒ surging ⇒ 2 (Nt=6 IGUAL que steady6)
  { name: "growD3",         samples: [3, 3, 3, 3, 6], players: 2, raw: 3, m: 0.750, w: 2 },   // ΔN3 ⇒ surging ⇒ 2
  { name: "growD2",         samples: [4, 4, 4, 4, 6], players: 2, raw: 2, m: 0.500, w: 1 },   // ΔN2 ⇒ creciendo ⇒ 1
  { name: "growD1-below",   samples: [5, 5, 5, 5, 6], players: 2, raw: 1, m: 0.250, w: 0 },   // ΔN1 <midMomentum2 ⇒ w0 (creció pero por debajo de la banda)
  { name: "decay",          samples: [8, 7, 6, 5, 4], players: 2, raw: 0, m: 0.000, w: 0 },   // 🔑 pack MENGUANTE (Nt=4≥minMobs) ⇒ rawM=max(0,−4)=0 (sólo escalada)
  { name: "single-player",  samples: [2, 3, 4, 5, 6], players: 1, raw: 0, m: 0.000, w: 0 },   // 🔑 P1 ⇒ colapso LIMPIO ⇒ 0
  { name: "Nt<minMobs",     samples: [0, 1, 1, 2, 2], players: 2, raw: 0, m: 0.000, w: 0 },   // 🔑 Nt=2 <minMobs3 ⇒ degenerado ⇒ 0
  { name: "cold-start",     samples: [4, 5, 6],       players: 2, raw: 0, m: 0.000, w: 0 },   // 🔑 buffer <Δ+1(5) ⇒ sin historia ⇒ 0
];
// driveMomentum REAL: inyecta party sintética (extras) + corre un SCHEDULE de N (por paso spawnea exactamente N mobs enganchados + momentumTick) ⇒ ring G._momR REAL. window=4 ⇒ ≥5 pasos para buffer lleno.
const EXPECT_DRIVE = [
  { name: "steady6-P2",  extras: 1, steps: [6, 6, 6, 6, 6], raw: 0, m: 0.000, w: 0, momHas: true },
  { name: "grow2to6-P2", extras: 1, steps: [2, 3, 4, 5, 6], raw: 4, m: 1.000, w: 2, momHas: true },
  { name: "growD2-P2",   extras: 1, steps: [3, 3, 3, 3, 5], raw: 2, m: 0.500, w: 1, momHas: true },
  { name: "decay-P2",    extras: 1, steps: [8, 7, 6, 5, 4], raw: 0, m: 0.000, w: 0, momHas: true },
  { name: "single-player", extras: 0, steps: [2, 3, 4, 5, 6], raw: 0, m: 0.000, w: 0, momHas: true },   // P1 ⇒ 0 (aunque el ring esté lleno)
  { name: "cold-start",  extras: 1, steps: [4, 5, 6],       raw: 0, m: 0.000, w: 0, momHas: false },     // buffer no lleno ⇒ 0
];
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroMomentum && window.__dev.aggroVariety && window.__dev.aggroDensity && window.__dev.aggroSwitch && window.__dev.aggroFocus && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroMomentum + peer hooks (aggroVariety/aggroDensity/aggroSwitch/aggroFocus) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroMomentum());
  ok("2 byte-id OFF (fresh boot): AGGRO_MOMENTUM_SURGE.enabled false AND G.aggroMomentumBounty NUNCA se crea (gExists false) AND G._momParty NUNCA se crea (partyExists false) AND G._momR NUNCA se crea (bufExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.bufExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.raw === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroMomentumFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} bufExists=${dark.bufExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} raw=${dark.raw} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" window=${dark.window} cap=${dark.momentumCap} hi=${dark.hiMomentum} mid=${dark.midMomentum} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers}`);

  // 3 save OFF has no aggroMomentumFind/aggroMomentumBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroMomentumFind|aggroMomentumBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noBufKey = !/"_momR"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroMomentumFind'/'aggroMomentumBounty'/'_momR' (fichas + ring transitorios, fuera del save allowlist)", noFeatKey && noBufKey, `noFeatKey=${noFeatKey} noBufKey=${noBufKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroMomentum({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroMomentum({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; el ring no entra al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ momentumProbe LUT: (samples,players)→rawM=max(0,N_t−N_{t−Δ})→M=min(1,rawM/cap)→banda(rawM crudo)→tier (decay/cold-start/single-player/Nt<minMobs ⇒ 0).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroMomentum({ momentumProbe: { samples: c.samples, players: c.players } }).momentumProbe), EXPECT_PROBE);
  const tabOK = EXPECT_PROBE.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].rawM === c.raw && Math.abs(tab[i].momentum - c.m) < 0.005);
  ok("5 ★ momentumProbe LUT (build-up con signo): steady6⇒raw0/w0, grow2to6⇒raw4/M1.0/w2, growD3⇒raw3/w2, growD2⇒raw2/w1, growD1⇒raw1/w0(below-band), decay⇒raw0/w0(sólo-escalada), single-player⇒0, Nt<minMobs⇒0, cold-start⇒0. UMBRAL hi3/mid2 cap4",
     tabOK, JSON.stringify(tab.map((x, i) => ({ n: EXPECT_PROBE[i].name, Nt: x.Nt, Np: x.Nprev, raw: x.rawM, m: x.momentum, w: x.weight, t: x.tier, full: x.full }))));

  // 5b ★ REAL SERVER-AUTH ESCALADA: driveMomentum inyecta party + corre schedule de N ⇒ ring G._momR REAL ⇒ rawM/M/score server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    window.__dev.aggroMomentum({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.extras).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroMomentum({ driveMomentum: { players, steps: c.steps, wipe: true } }).driveMomentum;
      const live = window.__dev.aggroMomentum({ momentumProbeLive: true }).momentumProbeLive;
      out.push({ name: c.name, dvRaw: dv.raw, dvIdx: dv.idx, dvScore: dv.score, dvPlayers: dv.players, dvBufLen: dv.bufLen, dvMomHas: dv.momHas, liveRaw: live.raw, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, livePlayers: live.players, trace: dv.trace });
      window.__dev.aggroMomentum({ clearMomentum: true });
    }
    window.__dev.aggroMomentum({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvRaw === c.raw && comp[i].liveRaw === c.raw && comp[i].dvMomHas === c.momHas && Math.abs(comp[i].dvIdx - c.m) < 0.005 && Math.abs(comp[i].liveField - c.m) < 0.005);
  ok("5b ★ REAL SERVER-AUTH ESCALADA (ring G._momR vía momentumTick sobre schedule de N): steady6(P2)=raw0/0, grow2to6(P2)=raw4/1.0/2, growD2(P2)=raw2/0.5/1, decay(P2)=raw0/0, single-player(P1)=0, cold-start=0(momHas false)",
     compOK, JSON.stringify(comp.map(x => ({ n: x.name, raw: x.dvRaw, m: x.dvIdx, sc: x.dvScore, P: x.dvPlayers, buf: x.dvBufLen, has: x.dvMomHas }))));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#126 DENSITY (dN/dt CON SIGNO vs NIVEL/N): MISMA densidad instantánea (Nt=6), momentum OPUESTO (0 vs hi).
  const cruxDens = await page.evaluate(() => {
    const momW = (samples, P) => window.__dev.aggroMomentum({ momentumProbe: { samples, players: P } }).momentumProbe.weight;
    const densW = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    // steady N=6 vs grown-to-6: MISMO Nt=6 ⇒ MISMA densidad (load N/P=6/2=3); momentum 0 vs hi
    const steady = { mom: momW([6, 6, 6, 6, 6], 2), dens: densW([6], 2) };   // M=0 ; density load3 w1
    const grown = { mom: momW([2, 3, 4, 5, 6], 2), dens: densW([6], 2) };    // M=hi w2 ; density load3 w1 (MISMA densidad instantánea)
    return { steady, grown };
  });
  const cruxDensOK = cruxDens.steady.dens === cruxDens.grown.dens        // MISMA densidad instantánea
    && cruxDens.steady.mom !== cruxDens.grown.mom                        // momentum OPUESTO
    && cruxDens.steady.mom === 0 && cruxDens.grown.mom === 2 && cruxDens.steady.dens === cruxDens.grown.dens && cruxDens.steady.dens > 0;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#126 DENSITY (dN/dt vs NIVEL): N=6 estable ⇒ MOMENTUM 0/DENSITY w1 vs N:2→4→6 ⇒ MOMENTUM 2/DENSITY w1 (MISMA densidad instantánea Nt=6, momentum opuesto) ⇒ DISOCIAN (un pack grande estable tiene 0 momentum; uno pequeño-creciendo tiene hi)",
     cruxDensOK, JSON.stringify(cruxDens));

  // 7 ★ CRUX ⊥#122 SWITCH (tendencia CON SIGNO del TAMAÑO vs churn de IDENTIDAD): momentum lee SÓLO el CONTEO temporal ⇒ N constante ⇒ 0 sin importar churn; N creciendo ⇒ hi sin importar churn.
  const cruxSwitch = await page.evaluate(() => {
    const momP = (samples, P) => window.__dev.aggroMomentum({ momentumProbe: { samples, players: P } }).momentumProbe;
    // churn-sin-crecimiento: N CONSTANTE (5) — aunque los objetivos churneen, momentum=0
    const churnNoGrowth = momP([5, 5, 5, 5, 5], 2);
    // crecimiento-sin-churn: N crece 2→6 — momentum=hi (0 cambios de objetivo requeridos)
    const growthNoChurn = momP([2, 3, 4, 5, 6], 2);
    return { churnNoGrowth: { raw: churnNoGrowth.rawM, w: churnNoGrowth.weight }, growthNoChurn: { raw: growthNoChurn.rawM, w: growthNoChurn.weight } };
  });
  const cruxSwitchOK = cruxSwitch.churnNoGrowth.w === 0 && cruxSwitch.churnNoGrowth.raw === 0 && cruxSwitch.growthNoChurn.w === 2 && cruxSwitch.growthNoChurn.raw === 4;
  ok("7 ★ CRUX ⊥#122 SWITCH (tendencia CON SIGNO del TAMAÑO vs churn de IDENTIDAD sin-signo): N constante (churn-sin-crecimiento) ⇒ MOMENTUM 0; N:2→6 (crecimiento-sin-churn) ⇒ MOMENTUM 2 ⇒ momentum lee SÓLO el CONTEO temporal, ciego a la identidad del objetivo ⇒ DISOCIAN de switch",
     cruxSwitchOK, JSON.stringify(cruxSwitch));

  // 8 ★ DECAY-GIVES-0 (sólo build-up POSITIVO): pack MENGUANTE con Nt≥minMobs ⇒ rawM=max(0,ΔN)=0. Premia la escalada, NO el decay.
  const decay = await page.evaluate(() => {
    const momP = (samples, P) => window.__dev.aggroMomentum({ momentumProbe: { samples, players: P } }).momentumProbe;
    const shrink = momP([8, 7, 6, 5, 4], 2);   // Nt=4≥3, ΔN=−4 ⇒ raw0
    const grow = momP([4, 5, 6, 7, 8], 2);     // simétrico creciente ΔN=+4 ⇒ raw4/w2
    return { shrink: { raw: shrink.rawM, m: shrink.momentum, w: shrink.weight, Nt: shrink.Nt }, grow: { raw: grow.rawM, m: grow.momentum, w: grow.weight, Nt: grow.Nt } };
  });
  const decayOK = decay.shrink.raw === 0 && decay.shrink.w === 0 && decay.shrink.Nt === 4 && decay.grow.raw === 4 && decay.grow.w === 2;
  ok("8 ★ DECAY-GIVES-0 (sólo escalada): pack menguante 8→4 (Nt=4≥minMobs) ⇒ rawM=max(0,−4)=0/w0 vs simétrico creciente 4→8 ⇒ rawM4/w2 ⇒ el reward premia el build-up POSITIVO, NO el decay",
     decayOK, JSON.stringify(decay));

  // 9 ★ SINGLE-PLAYER DEGENERADO / BIEN-DEFINIDO MULTIJUGADOR: mismo schedule creciente, SIN party (P=1) ⇒ 0; CON party (P≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroMomentum({ enabled: true });
    const drive = (extras) => { window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, extras).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroMomentum({ driveMomentum: { players, steps: [2, 3, 4, 5, 6], wipe: true } }).driveMomentum;
      const live = window.__dev.aggroMomentum({ momentumProbeLive: true }).momentumProbeLive;
      window.__dev.aggroMomentum({ clearMomentum: true });
      return { raw: dv.raw, m: dv.idx, score: dv.score, players: live.players, engaged: live.engaged, momHas: dv.momHas }; };
    const sp = drive(0);   // P=1
    const mp = drive(1);   // P=2
    window.__dev.aggroMomentum({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.raw === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.raw === 4 && degen.mp.score === 2 && Math.abs(degen.mp.m - 1.0) < 0.01;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo schedule 2→6 SIN party (P=1) ⇒ raw0/score0; CON party (P=2) ⇒ raw4/M1.0/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ COLD-START (buffer <Δ+1) ⇒ 0: schedule corto (3<5 pasos) ⇒ ring no lleno ⇒ momHas false ⇒ raw0. Buffer lleno (≥5) ⇒ momHas true.
  const cold = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroMomentum({ enabled: true });
    const drive = (steps) => { window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroMomentum({ driveMomentum: { players, steps, wipe: true } }).driveMomentum;
      window.__dev.aggroMomentum({ clearMomentum: true });
      return { raw: dv.raw, score: dv.score, bufLen: dv.bufLen, momHas: dv.momHas }; };
    const shortRun = drive([4, 5, 6]);          // 3 pasos ⇒ buffer 3 <5 ⇒ momHas false
    const fullRun = drive([2, 3, 4, 5, 6]);     // 5 pasos ⇒ buffer 5 ⇒ momHas true, raw4
    window.__dev.aggroMomentum({ enabled: false });
    return { shortRun, fullRun };
  }, { Z, PLAYER_OFF });
  const coldOK = cold.shortRun.momHas === false && cold.shortRun.raw === 0 && cold.shortRun.score === 0 && cold.fullRun.momHas === true && cold.fullRun.raw === 4;
  ok("10 ★ COLD-START (buffer <Δ+1) ⇒ 0: 3-pasos ⇒ ring no lleno (momHas false, bufLen 3) ⇒ raw0/score0; 5-pasos ⇒ ring lleno (momHas true) ⇒ raw4 ⇒ sin historia suficiente NO forrajea",
     coldOK, JSON.stringify(cold));

  // 11 CANAL aggroMomentumFind: forageChargePreview con pull creciendo >0 ; estable → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroMomentum({ enabled: true });
    window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
    window.__dev.aggroMomentum({ driveMomentum: { players, steps: [2, 3, 4, 5, 6], wipe: true } });   // grow ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroMomentum();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroMomentum({ driveMomentum: { players, steps: [6, 6, 6, 6, 6], wipe: true } });   // estable ⇒ score0
    const goVm = window.__dev.aggroMomentum();
    window.__dev.aggroMomentum({ clearMomentum: true });
    window.__dev.aggroMomentum({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroMomentumFind: forageChargePreview con pull creciendo (2→6) ⇒ charge>0 (==aggroMomentumBonus); con pack estable (6) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroMomentumBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let d = 2; d <= 10; d++) vals.push(window.__dev.aggroMomentum({ momentumProbe: { samples: [1, 1, 1, 1, 1 + d], players: 2 } }).momentumProbe.charge);   // ΔN creciente
    return { max: Math.max(...vals), cap: window.__dev.aggroMomentum().cap };
  });
  ok("12 ★ SUB-CAP: ningún build-up produce charge>aggroMomentumBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 aunque haya un pull creciendo disponible + G._momR NUNCA creado
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroMomentum({ enabled: true });
    window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroMomentum({ driveMomentum: { players, steps: [2, 3, 4, 5, 6], wipe: true } });   // pull creciendo disponible
    window.__dev.aggroMomentum({ enabled: false });                          // now OFF
    const off = window.__dev.aggroMomentum();
    window.__dev.aggroMomentum({ enabled: true }); window.__dev.aggroMomentum({ clearMomentum: true }); window.__dev.aggroMomentum({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, raw: off.raw };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.raw === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroMomentumBonus(pull creciendo disponible)==0 + forageChargePreview==0 + idx==0 + raw==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroDensity/aggroVariety/aggroSwitch no cambia la señal de aggroMomentum.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    window.__dev.aggroMomentum({ enabled: true });
    window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroMomentum({ driveMomentum: { players, steps: [2, 3, 4, 5, 6], wipe: true } }).driveMomentum;
    const snap = () => JSON.stringify({ aggroDensity: window.__dev.aggroDensity(), aggroVariety: window.__dev.aggroVariety(), aggroSwitch: window.__dev.aggroSwitch() });
    const peersOn = snap();
    const adPrev = window.__dev.aggroDensity().enabled, avPrev = window.__dev.aggroVariety().enabled, asPrev = window.__dev.aggroSwitch().enabled;
    window.__dev.aggroDensity({ enabled: !adPrev }); window.__dev.aggroVariety({ enabled: !avPrev }); window.__dev.aggroSwitch({ enabled: !asPrev });
    const after = window.__dev.aggroMomentum({ momentumProbeLive: true }).momentumProbeLive;
    window.__dev.aggroDensity({ enabled: adPrev }); window.__dev.aggroVariety({ enabled: avPrev }); window.__dev.aggroSwitch({ enabled: asPrev });
    const peersRestored = snap();
    window.__dev.aggroMomentum({ clearMomentum: true });
    window.__dev.aggroMomentum({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.raw === after.raw;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeRaw: before.raw, afterRaw: after.raw };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroMomentumFind ⊥ peers: la señal de escalada (score/raw) NO cambia al togglear AGGRO-DENSITY #126/AGGRO-VARIETY #127/AGGRO-SWITCH #122; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 56 `_SURGE` totales, sole-false = AGGRO_MOMENTUM (55 true, incl. AGGRO_VARIETY #127 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const aggroVarietyLive = census.find(([n]) => n === "AGGRO_VARIETY_SURGE");
  const censusOK = total === 56 && trues === 55 && falses.length === 1 && falses[0] === "AGGRO_MOMENTUM_SURGE" && aggroVarietyLive && aggroVarietyLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 56 `_SURGE` totales, 55 enabled:true (incl. AGGRO_VARIETY_SURGE #127 LIVE), sole-false = AGGRO_MOMENTUM_SURGE (DARK #128)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} aggroVariety=${aggroVarietyLive ? aggroVarietyLive[1] : "?"}`);

  // 16 render badge "Escalada:" drawn ON+growing / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    let step = 0; const seq = [2, 3, 4, 5, 6];
    const drive = () => { const cur = seq.slice(0, Math.min(seq.length, 1 + (step % seq.length))); step++;
      // re-drive a full growing ring each frame so the badge stays lit (score2)
      window.__dev.aggroMomentum({ driveMomentum: { players, steps: [2, 3, 4, 5, 6], wipe: true } }); };
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Escalada:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroMomentum({ enabled: true });
    window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroMomentum({ clearMomentum: true });
    window.__dev.aggroMomentum({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Escalada:\" se DIBUJA ON+creciendo (M>0, re-driven cada frame) y NO OFF (M 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroMomentum({ enabled: true }); window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroMomentum({ driveMomentum: { players, steps: [2, 3, 4, 5, 6], wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroMomentum({ clearMomentum: true }); window.__dev.aggroMomentum({ enabled: false }); });

  // 17 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1).
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
    const { Z, FPARG, PLAYER_OFF } = args;
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2, grow 2→6 ⇒ score2, M=1.0
    window.__dev.aggroMomentum({ enabled: true });
    window.__dev.aggroMomentum({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroMomentum({ driveMomentum: { players, steps: [2, 3, 4, 5, 6], wipe: true } }).driveMomentum;
    const vm = window.__dev.aggroMomentum();
    const lut = [[[6, 6, 6, 6, 6], 2], [[2, 3, 4, 5, 6], 2], [[4, 4, 4, 4, 6], 2], [[8, 7, 6, 5, 4], 2]].map(([samples, P]) => { const m = window.__dev.aggroMomentum({ momentumProbe: { samples, players: P } }).momentumProbe; return { raw: m.rawM, m: m.momentum, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.aggroMomentum({ momentumProbeLive: true }).momentumProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroMomentum({ clearMomentum: true });
    window.__dev.aggroMomentum({ enabled: false });
    return { raw: dv.raw, idx: dv.idx, score: dv.score, tier: vm.tier, charge: vm.charge, liveRaw: live.raw, liveField: live.field, liveScore: live.score, engaged: live.engaged, players: live.players, lut, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.raw === B.raw && A.idx === B.idx && A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.liveRaw === B.liveRaw && A.liveField === B.liveField && A.liveScore === B.liveScore && A.engaged === B.engaged && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA party+schedule creciente (P2, N:2→6, ΔN4, M=1.0)+héroe ⇒ raw/idx/score/tier/charge + momentumProbeLive(raw,field,engaged,players,score) + momentumProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={raw:${A.raw},idx:${A.idx},score:${A.score},tier:${A.tier},charge:${A.charge},liveRaw:${A.liveRaw},liveField:${A.liveField},engaged:${A.engaged},players:${A.players},fpLen:${A.fp.length}} B={raw:${B.raw},idx:${B.idx},score:${B.score},tier:${B.tier},charge:${B.charge},liveRaw:${B.liveRaw},liveField:${B.liveField},engaged:${B.engaged},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroMomentum({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroMomentum({ enabled: false }));

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
