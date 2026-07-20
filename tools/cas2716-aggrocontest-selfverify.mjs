// CAS-2716 — self-verify for COBERTURA DE OBJETIVOS (DARK, AGGRO_CONTEST_SURGE.enabled:false). EVO mecánica #123 (serializa tras #122 AGGRO_SWITCH_SURGE LIVE&served 6697409ed3ae/815, base HEAD 5a87b06) — EJE FRESCO + CANAL FRESCO, ⊥ a las 64 LIVE #59-#122. AÑADE la dimensión de COBERTURA/AMPLITUD a la familia COMPOSICIÓN-DE-INTENCIÓN (#118 nivel-sobre-el-héroe / #120 sub-estado / #121 UNIFORMIDAD-dentro-del-conjunto / #122 CHURN-TEMPORAL).
// (A) EJE FRESCO = COBERTURA/AMPLITUD = aggroContestField(hero) = C = (#jugadores VIVOS en radio targeteados por ≥1 mob ENGANCHADO) / (#jugadores VIVOS en radio). SNAPSHOT PURO (lee la aggro-table directo, SIN buffer temporal, como #121). aggroContestBand: ≥hiContest(0.67) ⇒ broad ⇒ 2; ≥midContest(0.34) ⇒ partial ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) enganchados y ≥minPlayers(2). INTENSIVO/ADIMENSIONAL (invariante al conteo de MOBS). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P=1 ⇒ cobertura trivial ⇒ C=0 (colapso LIMPIO).
//     CRUX ⊥#121 REPARTO (LA CRÍTICA — AMPLITUD-del-conjunto vs UNIFORMIDAD-dentro-del-conjunto): pile-broad [100,1,1,1] ⇒ contest2/spread0; uniform-broad [3,3,3,3] ⇒ contest2/spread2; all-on-one [12,0,0,0] ⇒ contest0/spread0 ⇒ MISMO contest(2) admite spread 0 Y 2, MISMO spread(0) admite contest 0 Y 2 ⇒ DISOCIAN. CRUX ⊥#122 AGGRO-SWITCH (amplitud-estática-AHORA vs churn-TEMPORAL). CRUX ⊥#118 AGGRO-FOCUS (amplitud-sobre-TODOS vs fracción-sobre-el-HÉROE). ⊥#117/#119 (cobertura invariante a posición/movimiento). ⊥#87 (fracción invariante al conteo de MOBS).
// (B) CANAL FRESCO = aggroContestFind (fichas de cobertura por rematar con la manada ENGANCHADA cubriendo a MUCHOS jugadores distintos — NINGUNA de las 64 flags lo usa; ⊥ targetSpreadFind #121/aggroSwitchFind #122/aggroFocusFind #118/strikeCommitFind #120). Moneda FRESCA (h.aggroContestBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2716-aggrocontest-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2716");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// contestProbe LUT esperada: (covered,players)→C→banda→{tier,charge}. UMBRALES hiContest 0.67 / midContest 0.34 + colapso single-player (P<2 ⇒ 0).
const EXPECT_CONTEST = [
  { covered: 0, players: 4, c: 0.000, w: 0 },   // 0 cubiertos ⇒ C0 ⇒ 0
  { covered: 1, players: 4, c: 0.250, w: 0 },   // 1/4 ⇒ C0.25 <mid ⇒ 0 (estrecha)
  { covered: 2, players: 4, c: 0.500, w: 1 },   // 2/4 ⇒ C0.5 ≥mid ⇒ partial ⇒ 1
  { covered: 3, players: 4, c: 0.750, w: 2 },   // 3/4 ⇒ C0.75 ≥hi ⇒ broad ⇒ 2
  { covered: 4, players: 4, c: 1.000, w: 2 },   // 4/4 ⇒ C1 ⇒ 2
  { covered: 2, players: 3, c: 0.667, w: 1 },   // 2/3 ⇒ C0.667 <hiContest(0.67) ≥mid ⇒ partial ⇒ 1
  { covered: 2, players: 2, c: 1.000, w: 2 },   // 2/2 ⇒ C1 ⇒ 2
  { covered: 3, players: 6, c: 0.500, w: 1 },   // 3/6 ⇒ C0.5 ⇒ 1 (invariante al conteo vs 2/4)
  { covered: 4, players: 1, c: 0.000, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveContest REAL: inyecta party sintética (P=hero+extra) + mobs con target inyectado (e._acTgt); C=(#jugadores cubiertos)/(#jugadores en radio). Requiere ≥minMobs(3) enganchados y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "broad-4cov-4p", players: 3, tgts: [0, 1, 2, 3], c: 1.000, w: 2 },  // 4 mobs cubren a los 4 jugadores ⇒ C1
  { name: "partial-2cov-4p", players: 3, tgts: [0, 0, 1, 1], c: 0.500, w: 1 }, // cubren 2 de 4 ⇒ C0.5
  { name: "narrow-1cov-4p", players: 3, tgts: [0, 0, 0, 0], c: 0.250, w: 0 },  // todos sobre 1 de 4 ⇒ C0.25
  { name: "broad-3cov-3p", players: 2, tgts: [0, 1, 2], c: 1.000, w: 2 },      // cubren 3 de 3 ⇒ C1
  { name: "single-player", players: 0, tgts: [0, 1, 2, 3], c: 0.000, w: 0 },   // 🔑 P1 (sólo héroe) ⇒ degenerado ⇒ 0
  { name: "2mob-<minMobs", players: 3, tgts: [0, 1], c: 0.000, w: 0 },         // 2 enganchados <minMobs3 ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroContest && window.__dev.aggroSwitch && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.accel && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroContest + peer hooks (aggroSwitch/targetSpread/aggroFocus/accel/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroContest());
  ok("2 byte-id OFF (fresh boot): AGGRO_CONTEST_SURGE.enabled false AND G.aggroContestBounty NUNCA se crea (gExists false) AND G._acParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroContestFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiContest=${dark.hiContest} midContest=${dark.midContest} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroContestFind/aggroContestBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroContestFind|aggroContestBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroContestBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroContestFind'/'aggroContestBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroContest({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroContest({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ contestProbe LUT: (covered,players)→C→band→tier→charge (UMBRALES hiContest/midContest + colapso single-player).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroContest({ contestProbe: { covered: c.covered, players: c.players } }).contestProbe), EXPECT_CONTEST);
  const tabOK = EXPECT_CONTEST.every((c, i) => tab[i] && tab[i].weight === c.w && Math.abs(tab[i].contest - c.c) < 0.005);
  ok("5 ★ contestProbe LUT (FRACCIÓN de cobertura): 0/4⇒0/0, 1/4⇒0.25/0, 2/4⇒0.5/1, 3/4⇒0.75/2, 4/4⇒1.0/2, 2/3⇒0.667/1, 2/2⇒1.0/2, 3/6⇒0.5/1, 4/P1⇒0/0 (single-player LIMPIO). UMBRAL hiContest 0.67/midContest 0.34",
     tabOK, JSON.stringify(tab.map(x => ({ cov: x.covered, P: x.players, c: x.contest, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH COBERTURA: driveContest inyecta party sintética + mobs con target inyectado ⇒ C=cubiertos/jugadores REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroContest({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const pts = c.tgts.map((tgt, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase", tgt }));
      const dv = window.__dev.aggroContest({ driveContest: { players, pts, wipe: true } }).driveContest;
      const live = window.__dev.aggroContest({ contestProbeLive: true }).contestProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, covered: live.covered, livePlayers: live.players });
    }
    window.__dev.aggroContest({ clearContest: true });
    window.__dev.aggroContest({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.c) < 0.005 && Math.abs(comp[i].liveField - c.c) < 0.005);
  ok("5b ★ REAL SERVER-AUTH COBERTURA (aggro-table snapshot): broad-4cov=1.0/2, partial-2cov=0.5/1, narrow-1cov=0.25/0, broad-3cov-3p=1.0/2, single-player(P1)=0/0, 2mob(<minMobs)=0/0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#121 TARGET-SPREAD crux (LA CRÍTICA — AMPLITUD-del-conjunto vs UNIFORMIDAD-dentro-del-conjunto): spread=entropía normalizada de la distribución (spreadProbe counts→S); contest=amplitud de la cobertura (contestProbe covered→C, covered=#jugadores con ≥1 mob). DISOCIAN.
  const crux121 = await page.evaluate(() => {
    const spreadW = (counts, P) => window.__dev.targetSpread({ spreadProbe: { counts, P } }).spreadProbe.weight;
    const nnz = (counts) => counts.filter(c => c > 0).length;
    const contestW = (counts, P) => window.__dev.aggroContest({ contestProbe: { covered: nnz(counts), players: P } }).contestProbe.weight;
    // (a) pile-broad: los 4 cubiertos pero casi todos los mobs sobre uno ⇒ spread ≈0 (concentrado) / contest ALTO (amplitud total)
    const qa = { spread: spreadW([100, 1, 1, 1], 4), contest: contestW([100, 1, 1, 1], 4) };
    // (b) uniform-broad: los 4 cubiertos uniforme ⇒ spread ALTO / contest ALTO
    const qb = { spread: spreadW([3, 3, 3, 3], 4), contest: contestW([3, 3, 3, 3], 4) };
    // (c) all-on-one: TODO sobre 1 de 4 ⇒ spread 0 (1 solo target) / contest BAJO (amplitud mínima)
    const qc = { spread: spreadW([12, 0, 0, 0], 4), contest: contestW([12, 0, 0, 0], 4) };
    // (d) half-covered: 2 de 4 uniforme ⇒ spread mid / contest mid
    const qd = { spread: spreadW([3, 3, 0, 0], 4), contest: contestW([3, 3, 0, 0], 4) };
    return { qa, qb, qc, qd };
  });
  const crux121OK = crux121.qa.contest === 2 && crux121.qa.spread === 0
    && crux121.qb.contest === 2 && crux121.qb.spread === 2
    && crux121.qc.contest === 0 && crux121.qc.spread === 0
    && crux121.qd.contest === 1 && crux121.qd.spread === 1;
  ok("6 ★ ⊥#121 TARGET-SPREAD crux (LA CRÍTICA, AMPLITUD-del-conjunto vs UNIFORMIDAD-dentro-del-conjunto): pile-broad ⇒ CONTEST 2/SPREAD 0; uniform-broad ⇒ CONTEST 2/SPREAD 2; all-on-one ⇒ CONTEST 0/SPREAD 0; half ⇒ CONTEST 1/SPREAD 1 ⇒ MISMO contest(2) admite spread 0 (qa) Y 2 (qb), MISMO spread(0) admite contest 2 (qa) Y 0 (qc) ⇒ contest NO es función de spread NI viceversa ⇒ DISOCIAN",
     crux121OK, JSON.stringify(crux121));

  // 7 ★ ⊥#122 AGGRO-SWITCH crux (AMPLITUD-estática-AHORA vs CHURN-TEMPORAL de la identidad): contest=cobertura este tick (contestProbe covered→C); switch=fracción cambiada en la ventana (switchProbe engaged,changed→V). DISOCIAN.
  const crux122 = await page.evaluate(() => {
    const contestW = (covered, P) => window.__dev.aggroContest({ contestProbe: { covered, players: P } }).contestProbe.weight;
    const switchW = (engaged, changed, P) => window.__dev.aggroSwitch({ switchProbe: { engaged, changed, P } }).switchProbe.weight;
    // cubre a los 4 y NUNCA cambia ⇒ contest ALTO / switch 0
    const qa = { contest: contestW(4, 4), sw: switchW(4, 0, 4) };
    // cubre a 1 solo mientras re-rollea frenético cuál mob ⇒ contest BAJO / switch ALTO
    const qb = { contest: contestW(1, 4), sw: switchW(4, 4, 4) };
    return { qa, qb };
  });
  const crux122OK = crux122.qa.contest === 2 && crux122.qa.sw === 0 && crux122.qb.contest === 0 && crux122.qb.sw === 2;
  ok("7 ★ ⊥#122 AGGRO-SWITCH crux (AMPLITUD-estática-AHORA vs CHURN-TEMPORAL): cubre-4-sin-cambiar ⇒ CONTEST 2/SWITCH 0; cubre-1-re-rolleando-cuál-mob ⇒ CONTEST 0/SWITCH 2 ⇒ INDEPENDIENTES",
     crux122OK, JSON.stringify(crux122));

  // 8 ★ ⊥#118 AGGRO-FOCUS crux (AMPLITUD-sobre-TODOS vs fracción-sobre-el-HÉROE): focus=counts[0]/N (fracción sobre el héroe); contest=amplitud (covered=#jugadores con ≥1 mob). DISOCIAN.
  const crux118 = await page.evaluate(() => {
    const nnz = (counts) => counts.filter(c => c > 0).length;
    const contestW = (counts, P) => window.__dev.aggroContest({ contestProbe: { covered: nnz(counts), players: P } }).contestProbe.weight;
    const focusMP = (counts) => { const N = counts.reduce((a, b) => a + b, 0); return N > 0 ? +(counts[0] / N).toFixed(3) : 0; };
    // repartida sobre 3 jugadores NO-héroe (índice0=héroe) ⇒ focus 0 / contest ALTO
    const qa = { focus: focusMP([0, 4, 4, 4]), contest: contestW([0, 4, 4, 4], 4) };
    // TODO sobre el héroe ⇒ focus 1.0 / contest BAJO (amplitud mínima)
    const qb = { focus: focusMP([12, 0, 0, 0]), contest: contestW([12, 0, 0, 0], 4) };
    return { qa, qb };
  });
  const crux118OK = crux118.qa.focus === 0 && crux118.qa.contest === 2 && crux118.qb.focus === 1 && crux118.qb.contest === 0;
  ok("8 ★ ⊥#118 AGGRO-FOCUS crux (AMPLITUD-sobre-TODOS vs fracción-sobre-el-HÉROE): repartida-sobre-3-NO-héroe ⇒ FOCUS 0/CONTEST 2; TODO-sobre-héroe ⇒ FOCUS 1.0/CONTEST 0 ⇒ INDEPENDIENTES (cobertura NO es hero-específica)",
     crux118OK, JSON.stringify(crux118));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs broad, SIN party (P=1) ⇒ C=0; CON party (P≥2) ⇒ C>0.
  const degen = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroContest({ enabled: true });
    const drive = (nPlayers, tgts) => { window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt }));
      const dv = window.__dev.aggroContest({ driveContest: { players, pts, wipe: true } }).driveContest;
      const live = window.__dev.aggroContest({ contestProbeLive: true }).contestProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged, covered: live.covered }; };
    const sp = drive(0, [0, 1, 2, 3]);   // single-player: P=1 (sólo héroe) ⇒ C=0 (colapso)
    const mp = drive(3, [0, 1, 2, 3]);   // multijugador P4 ⇒ C=1 (bien-definido)
    window.__dev.aggroContest({ clearContest: true });
    window.__dev.aggroContest({ enabled: false });
    return { sp, mp };
  }, { Z, POS, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 4 && degen.mp.engaged === 4 && degen.mp.covered === 4 && degen.mp.score === 2 && Math.abs(degen.mp.idx - 1) < 0.005;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs broad SIN party (P=1) ⇒ C=0/score0; CON party (P=4) ⇒ covered=4/C=1.0/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ ⊥#117 ACCEL / #119 JERK crux (cobertura invariante a posición/movimiento): la cobertura depende SÓLO de a QUIÉN targetea cada mob (e._acTgt), NO de su posición. Mismos targets con DISTINTAS posiciones ⇒ MISMA cobertura; mismas posiciones con DISTINTOS targets ⇒ DISTINTA cobertura.
  const crux117 = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroContest({ enabled: true });
    const drive = (posIdx, tgts) => { window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tgt, i) => ({ dx: POS[posIdx[i]][0], dy: POS[posIdx[i]][1], type: "rat", state: "chase", tgt }));
      return window.__dev.aggroContest({ driveContest: { players, pts, wipe: true } }).driveContest; };
    // packX: targets cubren-4, posiciones A ⇒ contest 2
    const px = drive([0, 1, 2, 3], [0, 1, 2, 3]);
    // packZ: MISMOS targets cubren-4, posiciones DISTINTAS B ⇒ contest 2 (invariante a posición/movimiento)
    const pz = drive([3, 2, 1, 0], [0, 1, 2, 3]);
    // packY: MISMAS posiciones que packX pero targets todos-sobre-0 ⇒ contest 0 (misma geometría, distinta cobertura)
    const py = drive([0, 1, 2, 3], [0, 0, 0, 0]);
    window.__dev.aggroContest({ clearContest: true });
    window.__dev.aggroContest({ enabled: false });
    return { px: px.score, pz: pz.score, py: py.score };
  }, { Z, POS, PLAYER_OFF });
  const crux117OK = crux117.px === 2 && crux117.pz === 2 && crux117.py === 0;
  ok("10 ★ ⊥#117 ACCEL/#119 JERK crux (cobertura ≠ cinemática): targets-cubren-4 con posiciones A ⇒ CONTEST 2; MISMOS targets con posiciones DISTINTAS ⇒ CONTEST 2 (invariante al MOVIMIENTO); MISMAS posiciones con targets-todos-sobre-1 ⇒ CONTEST 0 ⇒ la cobertura la determina a QUIÉN apuntan, NO dónde están",
     crux117OK, JSON.stringify(crux117));

  // 11 CANAL aggroContestFind: forageChargePreview con manada broad >0 ; estrecha → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroContest({ enabled: true });
    window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroContest({ driveContest: { players, pts: [0, 1, 2, 3].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // C1 ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroContest();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroContest({ driveContest: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // estrecha ⇒ C0.25 ⇒ score0
    const goVm = window.__dev.aggroContest();
    window.__dev.aggroContest({ clearContest: true });
    window.__dev.aggroContest({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroContestFind: forageChargePreview con manada broad (C1.0) ⇒ charge>0 (==aggroContestBonus); con manada estrecha (C0.25) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroContestBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let cov = 2; cov <= 8; cov++) vals.push(window.__dev.aggroContest({ contestProbe: { covered: cov, players: cov } }).contestProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.aggroContest().cap };
  });
  ok("12 ★ SUB-CAP: ninguna cobertura produce charge>aggroContestBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a broad pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroContest({ enabled: true });
    window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroContest({ driveContest: { players, pts: [0, 1, 2, 3].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // manada broad disponible
    window.__dev.aggroContest({ enabled: false });                          // now OFF
    const off = window.__dev.aggroContest();
    window.__dev.aggroContest({ enabled: true }); window.__dev.aggroContest({ clearContest: true }); window.__dev.aggroContest({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, POS, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroContestBonus(pack broad disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling targetSpread/aggroSwitch/aggroFocus no cambia la señal de aggroContest.
  const orth = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroContest({ enabled: true });
    window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroContest({ driveContest: { players, pts: [0, 0, 1, 2].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } }).driveContest;
    const snap = () => JSON.stringify({ targetSpread: window.__dev.targetSpread(), aggroSwitch: window.__dev.aggroSwitch(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const tsPrev = window.__dev.targetSpread().enabled, awPrev = window.__dev.aggroSwitch().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroSwitch({ enabled: !awPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroContest({ contestProbeLive: true }).contestProbeLive;
    window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroSwitch({ enabled: awPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroContest({ clearContest: true });
    window.__dev.aggroContest({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && Math.abs(before.idx - after.field) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeIdx: before.idx, afterField: after.field };
  }, { Z, POS, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroContestFind ⊥ peers: la señal de cobertura (score/C) NO cambia al togglear TARGET-SPREAD #121/AGGRO-SWITCH #122/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION: 64 arc flags served true; AGGRO_CONTEST_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE", "JERK_DIR_SURGE", "STRIKE_COMMIT_SURGE", "TARGET_SPREAD_SURGE", "AGGRO_SWITCH_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const acDark = flag("AGGRO_CONTEST_SURGE") === "false";
  ok("15 ★ 0-REGRESIÓN: 64 mecanismos del arco #59-#122 served enabled:true; AGGRO_CONTEST_SURGE served false (DARK #123)",
     arcAllOn && acDark && arc.length === 64, `aggroContest=${flag("AGGRO_CONTEST_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 16 render badge "Cobertura:" drawn ON+broad / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroContest({ driveContest: { players, pts: [0, 1, 2, 3].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cobertura:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroContest({ enabled: true });
    window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee aggroContestVM en vivo; el loop rAF re-tickea la IA (los mobs chase inyectados pueden moverse/cambiar de estado) ⇒ re-inyecta los targets cada frame para probar el DIBUJO en estado broad.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroContest({ clearContest: true });
    window.__dev.aggroContest({ enabled: false });
    const enAtOff = window.__dev.aggroContest().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, POS, PLAYER_OFF });
  ok("16 render badge \"Cobertura:\" se DIBUJA ON+broad (C>0, re-driven cada frame) y NO OFF (C 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS, PLAYER_OFF } = args; const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroContest({ enabled: true }); window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroContest({ driveContest: { players, pts: [0, 1, 2, 3].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } }); }, { Z, POS, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroContest({ clearContest: true }); window.__dev.aggroContest({ enabled: false }); });

  // 17 ★ NORTH STAR — 2-client convergence.
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
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const pts = [0, 1, 2, 2].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt }));   // P4, cubren 3-de-4 (0,1,2) ⇒ C=0.75 ⇒ broad ⇒ 2
    window.__dev.aggroContest({ enabled: true });
    window.__dev.aggroContest({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroContest({ driveContest: { players, pts, wipe: true } }).driveContest;
    const vm = window.__dev.aggroContest();
    const lut = [[0, 4], [1, 4], [3, 4], [4, 4]].map(([cov, P]) => { const p = window.__dev.aggroContest({ contestProbe: { covered: cov, players: P } }).contestProbe; return { cov, P, c: p.contest, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.aggroContest({ contestProbeLive: true }).contestProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroContest({ clearContest: true });
    window.__dev.aggroContest({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, engaged: live.engaged, covered: live.covered, players: live.players, lut, fp };
  }, { Z, FPARG, POS, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.engaged === B.engaged && A.covered === B.covered && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE: MISMA party+targets (P4, cubren 3-de-4, C=0.75)+héroe ⇒ score/idx/tier/charge + contestProbeLive(field,engaged,covered,players,score) + contestProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},engaged:${A.engaged},covered:${A.covered},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},engaged:${B.engaged},covered:${B.covered},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroContest({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroContest({ enabled: false }));

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
