// CAS-2720 — self-verify for APILAMIENTO DE OBJETIVOS (DARK, AGGRO_PILE_SURGE.enabled:false). EVO mecánica #124 (serializa tras #123 AGGRO_CONTEST_SURGE LIVE&served 44fee5ef2f31/815, base HEAD 314f73a) — EJE FRESCO + CANAL FRESCO, ⊥ a las 65 LIVE #59-#123. AÑADE la dimensión de DOMINANCIA/PICO a la familia COMPOSICIÓN-DE-INTENCIÓN (#118 nivel-sobre-el-héroe / #120 sub-estado / #121 UNIFORMIDAD-de-toda-la-distribución / #122 CHURN-TEMPORAL / #123 AMPLITUD/cuántos-jugadores-distintos).
// (A) EJE FRESCO = APILAMIENTO/DOMINANCIA = aggroPileField(hero) = P = max_j(#mobs ENGANCHADOS que targetean a j) / N, N=#mobs ENGANCHADOS en radio. SNAPSHOT PURO (lee la aggro-table directo, SIN buffer temporal, como #121/#123). aggroPileBand: ≥hiPile(0.67) ⇒ heavy ⇒ 2; ≥midPile(0.34) ⇒ some ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) enganchados y ≥minPlayers(2). INTENSIVO/ADIMENSIONAL (invariante al conteo de MOBS). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P_players=1 ⇒ pico trivial ⇒ P=0 (colapso LIMPIO).
//     CRUX ⊥#121 REPARTO (LA CRÍTICA — PICO-del-bucket-máximo vs UNIFORMIDAD-de-toda-la-distribución): comparten el bucket MAX pero pile IGNORA la forma de la COLA. [6,6,0,0] ⇒ pile1(0.5)/spread1(0.5) vs [6,3,3,0] ⇒ pile1(0.5)/spread2(0.75) [MISMO pile, DISTINTO spread]; [3,3,3,3] ⇒ pile0/spread2; [12,0,0,0] ⇒ pile2/spread0 ⇒ pile NO es función de spread ⇒ DISOCIAN. CRUX ⊥#123 COBERTURA (PROFUNDIDAD-en-uno vs AMPLITUD-a-través). CRUX ⊥#118 AGGRO-FOCUS (max-share IDENTITY-BLIND vs fracción-sobre-el-HÉROE). ⊥#122 (pico-estático-AHORA vs churn-TEMPORAL). ⊥#117/#119 (pile invariante a posición/movimiento). ⊥#87 (fracción invariante al conteo de MOBS).
// (B) CANAL FRESCO = aggroPileFind (fichas de apilamiento por rematar con la manada ENGANCHADA PILADA sobre UN solo jugador — NINGUNA de las 65 flags lo usa; ⊥ aggroContestFind #123/targetSpreadFind #121/aggroSwitchFind #122/aggroFocusFind #118/strikeCommitFind #120). Moneda FRESCA (h.aggroPileBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2720-aggropile-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2720");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// pileProbe LUT esperada: (counts,players)→N=Σ→max→P=max/N→banda→{tier,charge}. UMBRALES hiPile 0.67 / midPile 0.34 + colapso single-player (P<2 ⇒ 0).
const EXPECT_PILE = [
  { counts: [3, 3, 3, 3], players: 4, p: 0.250, w: 0 },       // repartida ⇒ max3/12=0.25 <mid ⇒ 0
  { counts: [6, 3, 3, 0], players: 4, p: 0.500, w: 1 },       // max6/12=0.5 ≥mid ⇒ some ⇒ 1
  { counts: [6, 6, 0, 0], players: 4, p: 0.500, w: 1 },       // max6/12=0.5 (MISMO pile que [6,3,3,0], distinta cola) ⇒ 1
  { counts: [9, 1, 1, 1], players: 4, p: 0.750, w: 2 },       // max9/12=0.75 ≥hi ⇒ heavy ⇒ 2
  { counts: [12, 0, 0, 0], players: 4, p: 1.000, w: 2 },      // all-on-one ⇒ max12/12=1.0 ⇒ 2
  { counts: [8, 2, 2], players: 3, p: 0.667, w: 1 },          // 8/12=0.667 <hiPile(0.67) ≥mid ⇒ some ⇒ 1
  { counts: [4, 4], players: 2, p: 0.500, w: 1 },             // 4/8=0.5 ⇒ 1
  { counts: [5, 5, 5, 5, 5, 5], players: 6, p: 0.167, w: 0 }, // 5/30=0.167 <mid ⇒ 0 (invariante al conteo vs [3,3,3,3])
  { counts: [12, 0, 0, 0], players: 1, p: 0.000, w: 0 },      // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// drivePile REAL: inyecta party sintética (P=hero+extra) + mobs con target inyectado (e._apTgt); P=max_j(#mobs→j)/N. Requiere ≥minMobs(3) enganchados y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "heavy-pileon-4p", players: 3, tgts: [0, 0, 0, 0], p: 1.000, w: 2 }, // 4 mobs todos sobre player0 ⇒ N4/max4 ⇒ 1.0
  { name: "some-pile-4p", players: 3, tgts: [0, 0, 1, 2], p: 0.500, w: 1 },    // buckets[2,1,1,0] ⇒ max2/4 ⇒ 0.5
  { name: "spread-low-4p", players: 3, tgts: [0, 1, 2, 3], p: 0.250, w: 0 },   // buckets[1,1,1,1] ⇒ max1/4 ⇒ 0.25
  { name: "heavy-3p", players: 2, tgts: [0, 0, 0], p: 1.000, w: 2 },           // 3 mobs sobre player0, P3 ⇒ N3/max3 ⇒ 1.0
  { name: "single-player", players: 0, tgts: [0, 0, 0, 0], p: 0.000, w: 0 },   // 🔑 P1 (sólo héroe) ⇒ degenerado ⇒ 0
  { name: "2mob-<minMobs", players: 3, tgts: [0, 0], p: 0.000, w: 0 },         // 2 enganchados <minMobs3 ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.aggroSwitch && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroPile + peer hooks (aggroContest/aggroSwitch/targetSpread/aggroFocus/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroPile());
  ok("2 byte-id OFF (fresh boot): AGGRO_PILE_SURGE.enabled false AND G.aggroPileBounty NUNCA se crea (gExists false) AND G._apParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroPileFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiPile=${dark.hiPile} midPile=${dark.midPile} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroPileFind/aggroPileBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroPileFind|aggroPileBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroPileBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroPileFind'/'aggroPileBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroPile({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroPile({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ pileProbe LUT: (counts,players)→N→max→P=max/N→band→tier→charge (UMBRALES hiPile/midPile + colapso single-player).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroPile({ pileProbe: { counts: c.counts, players: c.players } }).pileProbe), EXPECT_PILE);
  const tabOK = EXPECT_PILE.every((c, i) => tab[i] && tab[i].weight === c.w && Math.abs(tab[i].pile - c.p) < 0.005);
  ok("5 ★ pileProbe LUT (MAX-SHARE del pico): [3,3,3,3]⇒0.25/0, [6,3,3,0]⇒0.5/1, [6,6,0,0]⇒0.5/1, [9,1,1,1]⇒0.75/2, [12,0,0,0]⇒1.0/2, [8,2,2]⇒0.667/1, [4,4]⇒0.5/1, [5×6]⇒0.167/0, [12,0,0,0]P1⇒0/0 (single-player LIMPIO). UMBRAL hiPile 0.67/midPile 0.34",
     tabOK, JSON.stringify(tab.map(x => ({ counts: x.counts, P: x.players, N: x.total, max: x.max, p: x.pile, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH APILAMIENTO: drivePile inyecta party sintética + mobs con target inyectado ⇒ P=max/N REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroPile({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const pts = c.tgts.map((tgt, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase", tgt }));
      const dv = window.__dev.aggroPile({ drivePile: { players, pts, wipe: true } }).drivePile;
      const live = window.__dev.aggroPile({ pileProbeLive: true }).pileProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, max: live.max, livePlayers: live.players });
    }
    window.__dev.aggroPile({ clearPile: true });
    window.__dev.aggroPile({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.p) < 0.005 && Math.abs(comp[i].liveField - c.p) < 0.005);
  ok("5b ★ REAL SERVER-AUTH APILAMIENTO (aggro-table snapshot): heavy-pileon=1.0/2, some-pile=0.5/1, spread-low=0.25/0, heavy-3p=1.0/2, single-player(P1)=0/0, 2mob(<minMobs)=0/0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#121 TARGET-SPREAD crux (LA CRÍTICA — PICO-del-bucket-máximo vs UNIFORMIDAD-de-toda-la-distribución): spread=entropía normalizada (spreadProbe counts→S); pile=max-share (pileProbe counts→P=max/N). COMPARTEN el bucket MAX pero pile IGNORA la cola ⇒ DISOCIAN.
  const crux121 = await page.evaluate(() => {
    const spreadW = (counts, P) => window.__dev.targetSpread({ spreadProbe: { counts, P } }).spreadProbe.weight;
    const pileW = (counts, P) => window.__dev.aggroPile({ pileProbe: { counts, players: P } }).pileProbe.weight;
    // (a) [6,6,0,0]: max6/12=0.5 ⇒ pile some(1); spread H(2 buckets)/ln4 ⇒ mid
    const qa = { pile: pileW([6, 6, 0, 0], 4), spread: spreadW([6, 6, 0, 0], 4) };
    // (b) [6,3,3,0]: MISMO max6/12=0.5 ⇒ pile some(1); spread MÁS alto (cola más repartida) ⇒ hi
    const qb = { pile: pileW([6, 3, 3, 0], 4), spread: spreadW([6, 3, 3, 0], 4) };
    // (c) [3,3,3,3]: max3/12=0.25 ⇒ pile 0; spread MAX (uniforme) ⇒ 2
    const qc = { pile: pileW([3, 3, 3, 3], 4), spread: spreadW([3, 3, 3, 3], 4) };
    // (d) [12,0,0,0]: max12/12=1.0 ⇒ pile heavy(2); spread 0 (1 solo target) ⇒ 0
    const qd = { pile: pileW([12, 0, 0, 0], 4), spread: spreadW([12, 0, 0, 0], 4) };
    return { qa, qb, qc, qd };
  });
  const crux121OK = crux121.qa.pile === 1 && crux121.qb.pile === 1 && crux121.qa.spread !== crux121.qb.spread   // MISMO pile(1), DISTINTO spread
    && crux121.qc.pile === 0 && crux121.qc.spread === 2
    && crux121.qd.pile === 2 && crux121.qd.spread === 0;
  ok("6 ★ ⊥#121 TARGET-SPREAD crux (LA CRÍTICA, PICO-del-bucket-máximo vs UNIFORMIDAD-de-toda-la-distribución): [6,6,0,0]⇒PILE 1/SPREAD s1; [6,3,3,0]⇒PILE 1/SPREAD s2≠s1 (MISMO pile, distinto spread — pile IGNORA la cola); [3,3,3,3]⇒PILE 0/SPREAD 2; [12,0,0,0]⇒PILE 2/SPREAD 0 ⇒ pile NO es función de spread ⇒ DISOCIAN",
     crux121OK, JSON.stringify(crux121));

  // 7 ★ ⊥#123 AGGRO-CONTEST crux (PROFUNDIDAD-en-uno vs AMPLITUD-a-través): pile=max/N (dominancia del pico); contest=covered/P (cuántos jugadores DISTINTOS). DISOCIAN.
  const crux123 = await page.evaluate(() => {
    const nnz = (counts) => counts.filter(c => c > 0).length;
    const pileW = (counts, P) => window.__dev.aggroPile({ pileProbe: { counts, players: P } }).pileProbe.weight;
    const contestW = (counts, P) => window.__dev.aggroContest({ contestProbe: { covered: nnz(counts), players: P } }).contestProbe.weight;
    // all-on-one: pile MAX / contest BAJO (sólo 1 jugador cubierto)
    const qa = { pile: pileW([12, 0, 0, 0], 4), contest: contestW([12, 0, 0, 0], 4) };
    // uniforme-4: pile BAJO / contest MAX (los 4 cubiertos)
    const qb = { pile: pileW([3, 3, 3, 3], 4), contest: contestW([3, 3, 3, 3], 4) };
    // [6,6,0,0]: pile 1(0.5) / contest 1 (2-de-4)
    const qc = { pile: pileW([6, 6, 0, 0], 4), contest: contestW([6, 6, 0, 0], 4) };
    // [6,3,3,0]: MISMO pile 1(0.5) / contest 2 (3-de-4) ⇒ MISMO pile, DISTINTO contest
    const qd = { pile: pileW([6, 3, 3, 0], 4), contest: contestW([6, 3, 3, 0], 4) };
    return { qa, qb, qc, qd };
  });
  const crux123OK = crux123.qa.pile === 2 && crux123.qa.contest === 0 && crux123.qb.pile === 0 && crux123.qb.contest === 2
    && crux123.qc.pile === 1 && crux123.qd.pile === 1 && crux123.qc.contest !== crux123.qd.contest;
  ok("7 ★ ⊥#123 AGGRO-CONTEST crux (PROFUNDIDAD-en-uno vs AMPLITUD-a-través): all-on-one ⇒ PILE 2/CONTEST 0; uniforme-4 ⇒ PILE 0/CONTEST 2 (anti-correlados); [6,6,0,0]⇒PILE 1/CONTEST c1 vs [6,3,3,0]⇒PILE 1/CONTEST c2≠c1 (MISMO pile, distinto contest) ⇒ INDEPENDIENTES",
     crux123OK, JSON.stringify(crux123));

  // 8 ★ ⊥#118 AGGRO-FOCUS crux (max-share IDENTITY-BLIND vs fracción-sobre-el-HÉROE): pile=max/N (sobre CUALQUIER jugador); focus=counts[0]/N (sólo índice0=héroe). DISOCIAN.
  const crux118 = await page.evaluate(() => {
    const pileW = (counts, P) => window.__dev.aggroPile({ pileProbe: { counts, players: P } }).pileProbe.weight;
    const focusMP = (counts) => { const N = counts.reduce((a, b) => a + b, 0); return N > 0 ? +(counts[0] / N).toFixed(3) : 0; };
    // TODO sobre player1 (NON-héroe): pile MAX (pico sobre alguien) / focus 0 (nada sobre el héroe)
    const qa = { pile: pileW([0, 12, 0, 0], 4), focus: focusMP([0, 12, 0, 0]) };
    // TODO sobre el héroe: pile MAX / focus 1.0
    const qb = { pile: pileW([12, 0, 0, 0], 4), focus: focusMP([12, 0, 0, 0]) };
    return { qa, qb };
  });
  const crux118OK = crux118.qa.pile === 2 && crux118.qa.focus === 0 && crux118.qb.pile === 2 && crux118.qb.focus === 1;
  ok("8 ★ ⊥#118 AGGRO-FOCUS crux (max-share IDENTITY-BLIND vs fracción-sobre-el-HÉROE): TODO-sobre-player1-NO-héroe ⇒ PILE 2/FOCUS 0; TODO-sobre-héroe ⇒ PILE 2/FOCUS 1.0 ⇒ MISMO pile(2) admite focus 0 Y 1.0 ⇒ el pico es IDENTITY-BLIND (no hero-específico)",
     crux118OK, JSON.stringify(crux118));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs heavy-pileon, SIN party (P=1) ⇒ P=0; CON party (P≥2) ⇒ P>0.
  const degen = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroPile({ enabled: true });
    const drive = (nPlayers, tgts) => { window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt }));
      const dv = window.__dev.aggroPile({ drivePile: { players, pts, wipe: true } }).drivePile;
      const live = window.__dev.aggroPile({ pileProbeLive: true }).pileProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged, max: live.max }; };
    const sp = drive(0, [0, 0, 0, 0]);   // single-player: P=1 (sólo héroe) ⇒ P=0 (colapso)
    const mp = drive(3, [0, 0, 0, 0]);   // multijugador P4, heavy-pileon sobre player0 ⇒ P=1.0 (bien-definido)
    window.__dev.aggroPile({ clearPile: true });
    window.__dev.aggroPile({ enabled: false });
    return { sp, mp };
  }, { Z, POS, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 4 && degen.mp.engaged === 4 && degen.mp.max === 4 && degen.mp.score === 2 && Math.abs(degen.mp.idx - 1) < 0.005;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs heavy-pileon SIN party (P=1) ⇒ P=0/score0; CON party (P=4) ⇒ max=4/P=1.0/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ ⊥#117 ACCEL / #119 JERK crux (apilamiento invariante a posición/movimiento): pile depende SÓLO de a QUIÉN targetea cada mob (e._apTgt), NO de su posición. Mismos targets con DISTINTAS posiciones ⇒ MISMO pile; mismas posiciones con DISTINTOS targets ⇒ DISTINTO pile.
  const crux117 = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroPile({ enabled: true });
    const drive = (posIdx, tgts) => { window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tgt, i) => ({ dx: POS[posIdx[i]][0], dy: POS[posIdx[i]][1], type: "rat", state: "chase", tgt }));
      return window.__dev.aggroPile({ drivePile: { players, pts, wipe: true } }).drivePile; };
    // packX: targets todos-sobre-0 (heavy), posiciones A ⇒ pile 2
    const px = drive([0, 1, 2, 3], [0, 0, 0, 0]);
    // packZ: MISMOS targets heavy, posiciones DISTINTAS B ⇒ pile 2 (invariante a posición/movimiento)
    const pz = drive([3, 2, 1, 0], [0, 0, 0, 0]);
    // packY: MISMAS posiciones que packX pero targets repartidos ⇒ pile 0 (misma geometría, distinto pico)
    const py = drive([0, 1, 2, 3], [0, 1, 2, 3]);
    window.__dev.aggroPile({ clearPile: true });
    window.__dev.aggroPile({ enabled: false });
    return { px: px.score, pz: pz.score, py: py.score };
  }, { Z, POS, PLAYER_OFF });
  const crux117OK = crux117.px === 2 && crux117.pz === 2 && crux117.py === 0;
  ok("10 ★ ⊥#117 ACCEL/#119 JERK crux (apilamiento ≠ cinemática): targets-heavy con posiciones A ⇒ PILE 2; MISMOS targets con posiciones DISTINTAS ⇒ PILE 2 (invariante al MOVIMIENTO); MISMAS posiciones con targets-repartidos ⇒ PILE 0 ⇒ el pico lo determina a QUIÉN apuntan, NO dónde están",
     crux117OK, JSON.stringify(crux117));

  // 11 CANAL aggroPileFind: forageChargePreview con manada heavy >0 ; repartida → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroPile({ enabled: true });
    window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroPile({ drivePile: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // heavy ⇒ P1.0 ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroPile();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroPile({ drivePile: { players, pts: [0, 1, 2, 3].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // repartida ⇒ P0.25 ⇒ score0
    const goVm = window.__dev.aggroPile();
    window.__dev.aggroPile({ clearPile: true });
    window.__dev.aggroPile({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroPileFind: forageChargePreview con manada heavy (P1.0) ⇒ charge>0 (==aggroPileBonus); con manada repartida (P0.25) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroPileBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let n = 3; n <= 10; n++) vals.push(window.__dev.aggroPile({ pileProbe: { counts: [n, 0, 0, 0], players: 4 } }).pileProbe.charge);  // all-on-one heavy en distintos conteos
    return { max: Math.max(...vals), cap: window.__dev.aggroPile().cap };
  });
  ok("12 ★ SUB-CAP: ningún apilamiento produce charge>aggroPileBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a heavy pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroPile({ enabled: true });
    window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroPile({ drivePile: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // manada heavy disponible
    window.__dev.aggroPile({ enabled: false });                          // now OFF
    const off = window.__dev.aggroPile();
    window.__dev.aggroPile({ enabled: true }); window.__dev.aggroPile({ clearPile: true }); window.__dev.aggroPile({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, POS, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroPileBonus(pack heavy disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroContest/targetSpread/aggroSwitch/aggroFocus no cambia la señal de aggroPile.
  const orth = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroPile({ enabled: true });
    window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroPile({ drivePile: { players, pts: [0, 0, 1, 2].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } }).drivePile;
    const snap = () => JSON.stringify({ aggroContest: window.__dev.aggroContest(), targetSpread: window.__dev.targetSpread(), aggroSwitch: window.__dev.aggroSwitch(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const acPrev = window.__dev.aggroContest().enabled, tsPrev = window.__dev.targetSpread().enabled, awPrev = window.__dev.aggroSwitch().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroSwitch({ enabled: !awPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroPile({ pileProbeLive: true }).pileProbeLive;
    window.__dev.aggroContest({ enabled: acPrev }); window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroSwitch({ enabled: awPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroPile({ clearPile: true });
    window.__dev.aggroPile({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && Math.abs(before.idx - after.field) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeIdx: before.idx, afterField: after.field };
  }, { Z, POS, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroPileFind ⊥ peers: la señal de apilamiento (score/P) NO cambia al togglear AGGRO-CONTEST #123/TARGET-SPREAD #121/AGGRO-SWITCH #122/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION: 65 arc flags served true; AGGRO_PILE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE", "JERK_DIR_SURGE", "STRIKE_COMMIT_SURGE", "TARGET_SPREAD_SURGE", "AGGRO_SWITCH_SURGE", "AGGRO_CONTEST_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const apDark = flag("AGGRO_PILE_SURGE") === "false";
  ok("15 ★ 0-REGRESIÓN: 65 mecanismos del arco #59-#123 served enabled:true; AGGRO_PILE_SURGE served false (DARK #124)",
     arcAllOn && apDark && arc.length === 65, `aggroPile=${flag("AGGRO_PILE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 16 render badge "Apilamiento:" drawn ON+heavy / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroPile({ drivePile: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Apilamiento:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroPile({ enabled: true });
    window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee aggroPileVM en vivo; el loop rAF re-tickea la IA (los mobs chase inyectados pueden moverse/cambiar de estado) ⇒ re-inyecta los targets cada frame para probar el DIBUJO en estado heavy.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroPile({ clearPile: true });
    window.__dev.aggroPile({ enabled: false });
    const enAtOff = window.__dev.aggroPile().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, POS, PLAYER_OFF });
  ok("16 render badge \"Apilamiento:\" se DIBUJA ON+heavy (P>0, re-driven cada frame) y NO OFF (P 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS, PLAYER_OFF } = args; const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroPile({ enabled: true }); window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroPile({ drivePile: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } }); }, { Z, POS, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroPile({ clearPile: true }); window.__dev.aggroPile({ enabled: false }); });

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
    const pts = [0, 0, 0, 1].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt }));   // P4, buckets[3,1,0,0] ⇒ max3/4=0.75 ⇒ heavy ⇒ 2
    window.__dev.aggroPile({ enabled: true });
    window.__dev.aggroPile({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroPile({ drivePile: { players, pts, wipe: true } }).drivePile;
    const vm = window.__dev.aggroPile();
    const lut = [[[3, 3, 3, 3], 4], [[6, 6, 0, 0], 4], [[9, 1, 1, 1], 4], [[12, 0, 0, 0], 4]].map(([counts, P]) => { const p = window.__dev.aggroPile({ pileProbe: { counts, players: P } }).pileProbe; return { counts, P, p: p.pile, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.aggroPile({ pileProbeLive: true }).pileProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroPile({ clearPile: true });
    window.__dev.aggroPile({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, engaged: live.engaged, max: live.max, players: live.players, lut, fp };
  }, { Z, FPARG, POS, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.engaged === B.engaged && A.max === B.max && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE: MISMA party+targets (P4, buckets[3,1,0,0], P=0.75 heavy)+héroe ⇒ score/idx/tier/charge + pileProbeLive(field,engaged,max,players,score) + pileProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},engaged:${A.engaged},max:${A.max},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},engaged:${B.engaged},max:${B.max},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroPile({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroPile({ enabled: false }));

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
