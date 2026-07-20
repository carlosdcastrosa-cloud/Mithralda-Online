// CAS-2726 — self-verify for VENTAJA DE APILAMIENTO (DARK, AGGRO_MARGIN_SURGE.enabled:false). EVO mecánica #125 (serializa tras #124 AGGRO_PILE_SURGE LIVE&served f332e84bf145/815, base master 750de9e) — EJE FRESCO + CANAL FRESCO, ⊥ a las 66 LIVE #59-#124. AÑADE la dimensión de DOMINANCIA-GAP/LEAD a la familia COMPOSICIÓN-DE-INTENCIÓN (#118 nivel-sobre-el-héroe / #120 sub-estado / #121 UNIFORMIDAD-de-toda-la-distribución / #122 CHURN-TEMPORAL / #123 AMPLITUD / #124 max-share/PICO-absoluto).
// (A) EJE FRESCO = VENTAJA/LEAD = aggroMarginField(hero) = M = (top − second) / N, con top=max_j(#mobs ENGANCHADOS→j), second=2º-mayor, N=#mobs ENGANCHADOS en radio. SNAPSHOT PURO (lee la aggro-table directo, SIN buffer temporal, como #121/#123/#124). aggroMarginBand: ≥hiMargin(0.50) ⇒ heavy/runaway ⇒ 2; ≥midMargin(0.25) ⇒ some/lead-parcial ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) enganchados y ≥minPlayers(2). INTENSIVO/ADIMENSIONAL. 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P_players=1 ⇒ no hay segundo ⇒ M=0 (colapso LIMPIO).
//     CRUX ⊥#124 APILAMIENTO (EL HERMANO, LA CRÍTICA — PICO absoluto max/N vs LEAD (max−second)/N): MISMO pico, distinto margen. [6,6,0,0] ⇒ pile1(0.5)/margin0 (empate) vs [6,3,3,0] ⇒ pile1(0.5 MISMO)/margin1(0.25 DISTINTO); con N/max FIJOS [6,1,1,1] ⇒ pile2(0.667)/margin2(0.556) vs [6,3,0,0] ⇒ pile2(0.667 MISMO)/margin1(0.333 DISTINTO) ⇒ margin NO es función de pile ⇒ DISOCIAN. ⊥#121 REPARTO (UNIFORMIDAD de toda la distribución). ⊥#123 COBERTURA (AMPLITUD). ⊥#118 AGGRO-FOCUS (lead IDENTITY-BLIND vs fracción-sobre-el-HÉROE). ⊥#117/#119 (margin invariante a posición/movimiento). ⊥#87 (fracción invariante al conteo de MOBS).
// (B) CANAL FRESCO = aggroMarginFind (fichas de ventaja por rematar con un jugador ACAPARANDO el aggro con margen — NINGUNA de las 66 flags lo usa; ⊥ aggroPileFind #124/aggroContestFind #123/targetSpreadFind #121/aggroSwitchFind #122/aggroFocusFind #118). Moneda FRESCA (h.aggroMarginBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2726-aggromargin-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2726");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// marginProbe LUT esperada: (counts,players)→N=Σ→top,second→M=(top−second)/N→banda→{tier,charge}. UMBRALES hiMargin 0.50 / midMargin 0.25 + colapso single-player (P<2 ⇒ 0).
const EXPECT_MARGIN = [
  { counts: [3, 3, 3, 3], players: 4, m: 0.000, w: 0 },       // empate uniforme ⇒ (3-3)/12=0 ⇒ 0
  { counts: [6, 3, 3, 0], players: 4, m: 0.250, w: 1 },       // (6-3)/12=0.25 ≥mid ⇒ some ⇒ 1
  { counts: [6, 6, 0, 0], players: 4, m: 0.000, w: 0 },       // (6-6)/12=0 empate (MISMO pile 0.5 que [6,3,3,0], distinto margen) ⇒ 0
  { counts: [6, 1, 1, 1], players: 4, m: 0.556, w: 2 },       // (6-1)/9=0.556 ≥hi ⇒ heavy/runaway ⇒ 2
  { counts: [12, 0, 0, 0], players: 4, m: 1.000, w: 2 },      // all-on-one ⇒ (12-0)/12=1.0 ⇒ 2
  { counts: [8, 2, 2], players: 3, m: 0.500, w: 2 },          // (8-2)/12=0.5 =hiMargin ⇒ heavy ⇒ 2
  { counts: [4, 4], players: 2, m: 0.000, w: 0 },             // (4-4)/8=0 empate ⇒ 0
  { counts: [5, 5, 5, 5, 5, 5], players: 6, m: 0.000, w: 0 }, // empate ⇒ 0 (invariante al conteo)
  { counts: [12, 0, 0, 0], players: 1, m: 0.000, w: 0 },      // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveMargin REAL: inyecta party sintética (P=hero+extra) + mobs con target inyectado (e._amTgt); M=(top−second)/N. Requiere ≥minMobs(3) enganchados y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "runaway-4p", players: 3, tgts: [0, 0, 0, 0], m: 1.000, w: 2 },     // 4 mobs sobre player0 ⇒ buckets[4,0,0,0] top4 second0 ⇒ (4-0)/4=1.0
  { name: "some-lead-4p", players: 3, tgts: [0, 0, 1, 2], m: 0.250, w: 1 },   // buckets[2,1,1,0] top2 second1 ⇒ (2-1)/4=0.25
  { name: "tie-4p", players: 3, tgts: [0, 0, 1, 1], m: 0.000, w: 0 },         // buckets[2,2,0,0] top2 second2 ⇒ (2-2)/4=0 (empate — MISMO pico que some-lead pero SIN margen)
  { name: "spread-4p", players: 3, tgts: [0, 1, 2, 3], m: 0.000, w: 0 },      // buckets[1,1,1,1] ⇒ (1-1)/4=0
  { name: "single-player", players: 0, tgts: [0, 0, 0, 0], m: 0.000, w: 0 },  // 🔑 P1 (sólo héroe) ⇒ degenerado ⇒ 0
  { name: "2mob-<minMobs", players: 3, tgts: [0, 0], m: 0.000, w: 0 },        // 2 enganchados <minMobs3 ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroMargin && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroMargin + peer hooks (aggroPile/aggroContest/targetSpread/aggroFocus/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroMargin());
  ok("2 byte-id OFF (fresh boot): AGGRO_MARGIN_SURGE.enabled false AND G.aggroMarginBounty NUNCA se crea (gExists false) AND G._amParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroMarginFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiMargin=${dark.hiMargin} midMargin=${dark.midMargin} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroMarginFind/aggroMarginBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroMarginFind|aggroMarginBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroMarginBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroMarginFind'/'aggroMarginBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroMargin({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroMargin({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ marginProbe LUT: (counts,players)→N→top,second→M=(top−second)/N→band→tier→charge (UMBRALES hiMargin/midMargin + colapso single-player).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroMargin({ marginProbe: { counts: c.counts, players: c.players } }).marginProbe), EXPECT_MARGIN);
  const tabOK = EXPECT_MARGIN.every((c, i) => tab[i] && tab[i].weight === c.w && Math.abs(tab[i].margin - c.m) < 0.005);
  ok("5 ★ marginProbe LUT (LEAD top−second): [3,3,3,3]⇒0/0, [6,3,3,0]⇒0.25/1, [6,6,0,0]⇒0/0 (MISMO pile que [6,3,3,0], distinto margen), [6,1,1,1]⇒0.556/2, [12,0,0,0]⇒1.0/2, [8,2,2]⇒0.5/2, [4,4]⇒0/0, [5×6]⇒0/0, [12,0,0,0]P1⇒0/0 (single-player LIMPIO). UMBRAL hiMargin 0.50/midMargin 0.25",
     tabOK, JSON.stringify(tab.map(x => ({ counts: x.counts, P: x.players, N: x.total, top: x.top, second: x.second, m: x.margin, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH VENTAJA: driveMargin inyecta party sintética + mobs con target inyectado ⇒ M=(top−second)/N REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroMargin({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const pts = c.tgts.map((tgt, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase", tgt }));
      const dv = window.__dev.aggroMargin({ driveMargin: { players, pts, wipe: true } }).driveMargin;
      const live = window.__dev.aggroMargin({ marginProbeLive: true }).marginProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, top: live.top, second: live.second, livePlayers: live.players });
    }
    window.__dev.aggroMargin({ clearMargin: true });
    window.__dev.aggroMargin({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.m) < 0.005 && Math.abs(comp[i].liveField - c.m) < 0.005);
  ok("5b ★ REAL SERVER-AUTH VENTAJA (aggro-table snapshot): runaway=1.0/2, some-lead=0.25/1, tie=0/0 (empate MISMO pico), spread=0/0, single-player(P1)=0/0, 2mob(<minMobs)=0/0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#124 AGGRO-PILE crux (EL HERMANO, LA CRÍTICA — PICO absoluto max/N vs LEAD (max−second)/N): margin=(top−second)/N; pile=max/N. MISMO pico, distinto margen ⇒ DISOCIAN.
  const crux124 = await page.evaluate(() => {
    const marginW = (counts, P) => window.__dev.aggroMargin({ marginProbe: { counts, players: P } }).marginProbe.weight;
    const pileW = (counts, P) => window.__dev.aggroPile({ pileProbe: { counts, players: P } }).pileProbe.weight;
    // (a) [6,6,0,0]: pile some(1, 0.5); margin 0 (empate, sin runaway)
    const qa = { pile: pileW([6, 6, 0, 0], 4), margin: marginW([6, 6, 0, 0], 4) };
    // (b) [6,3,3,0]: MISMO pile some(1, 0.5); margin some(1, 0.25) ⇒ MISMO pile, DISTINTO margen
    const qb = { pile: pileW([6, 3, 3, 0], 4), margin: marginW([6, 3, 3, 0], 4) };
    // (c) [6,1,1,1]: pile=6/9=0.667 ⇒ some(1); margin=(6−1)/9=0.556 ⇒ heavy(2) N/max FIJOS (N9,max6)
    const qc = { pile: pileW([6, 1, 1, 1], 4), margin: marginW([6, 1, 1, 1], 4) };
    // (d) [6,3,0,0]: MISMO pile=6/9=0.667 ⇒ some(1); margin=(6−3)/9=0.333 ⇒ some(1) ⇒ MISMO pile, DISTINTO margen (2 vs 1)
    const qd = { pile: pileW([6, 3, 0, 0], 4), margin: marginW([6, 3, 0, 0], 4) };
    return { qa, qb, qc, qd };
  });
  const crux124OK = crux124.qa.pile === 1 && crux124.qa.margin === 0 && crux124.qb.pile === 1 && crux124.qb.margin === 1   // MISMO pile(1), margin 0 vs 1
    && crux124.qc.pile === crux124.qd.pile && crux124.qc.margin !== crux124.qd.margin                                      // MISMO pile band, DISTINTO margin band (N/max FIJOS ⇒ pile constante, margin varía con el second)
    && crux124.qc.margin === 2 && crux124.qd.margin === 1;
  ok("6 ★ ⊥#124 AGGRO-PILE crux (EL HERMANO, LA CRÍTICA — PICO absoluto max/N vs LEAD (max−second)/N): [6,6,0,0]⇒PILE 1/MARGIN 0 (empate) vs [6,3,3,0]⇒PILE 1 (MISMO)/MARGIN 1 (DISTINTO); con N/max FIJOS (N9,max6) [6,1,1,1]⇒PILE 1/MARGIN 2 vs [6,3,0,0]⇒PILE 1 (MISMO)/MARGIN 1 (DISTINTO ⇒ pile constante, margin varía con el second) ⇒ margin NO es función de pile ⇒ DISOCIAN",
     crux124OK, JSON.stringify(crux124));

  // 7 ★ ⊥#121 TARGET-SPREAD crux (LEAD-del-pico vs UNIFORMIDAD-de-toda-la-distribución): margin=(top−second)/N; spread=entropía normalizada. DISOCIAN.
  const crux121 = await page.evaluate(() => {
    const spreadW = (counts, P) => window.__dev.targetSpread({ spreadProbe: { counts, P } }).spreadProbe.weight;
    const marginW = (counts, P) => window.__dev.aggroMargin({ marginProbe: { counts, players: P } }).marginProbe.weight;
    // (a) [6,6,0,0]: margin 0 (empate); spread mid (2 buckets)
    const qa = { margin: marginW([6, 6, 0, 0], 4), spread: spreadW([6, 6, 0, 0], 4) };
    // (b) [3,3,3,3]: MISMO margin 0 (empate uniforme); spread MAX (uniforme) ⇒ 2 ⇒ MISMO margin, DISTINTO spread
    const qb = { margin: marginW([3, 3, 3, 3], 4), spread: spreadW([3, 3, 3, 3], 4) };
    // (c) [12,0,0,0]: margin heavy(2, 1.0); spread 0 (1 solo target) ⇒ anti-correlados en el extremo
    const qc = { margin: marginW([12, 0, 0, 0], 4), spread: spreadW([12, 0, 0, 0], 4) };
    // (d) [6,3,3,0]: margin some(1, 0.25); spread hi ⇒ 2
    const qd = { margin: marginW([6, 3, 3, 0], 4), spread: spreadW([6, 3, 3, 0], 4) };
    return { qa, qb, qc, qd };
  });
  const crux121OK = crux121.qa.margin === 0 && crux121.qb.margin === 0 && crux121.qa.spread !== crux121.qb.spread   // MISMO margin(0), DISTINTO spread
    && crux121.qc.margin === 2 && crux121.qc.spread === 0 && crux121.qd.margin === 1 && crux121.qd.spread === 2;
  ok("7 ★ ⊥#121 TARGET-SPREAD crux (LEAD-del-pico vs UNIFORMIDAD): [6,6,0,0]⇒MARGIN 0/SPREAD s1; [3,3,3,3]⇒MARGIN 0 (MISMO)/SPREAD 2 (DISTINTO ⇒ empate NO implica un spread); [12,0,0,0]⇒MARGIN 2/SPREAD 0; [6,3,3,0]⇒MARGIN 1/SPREAD 2 ⇒ DISOCIAN",
     crux121OK, JSON.stringify(crux121));

  // 8 ★ ⊥#123 AGGRO-CONTEST crux (LEAD/runaway vs AMPLITUD-a-través): margin=(top−second)/N; contest=covered/P (cuántos jugadores DISTINTOS). DISOCIAN.
  const crux123 = await page.evaluate(() => {
    const nnz = (counts) => counts.filter(c => c > 0).length;
    const marginW = (counts, P) => window.__dev.aggroMargin({ marginProbe: { counts, players: P } }).marginProbe.weight;
    const contestW = (counts, P) => window.__dev.aggroContest({ contestProbe: { covered: nnz(counts), players: P } }).contestProbe.weight;
    // all-on-one: margin MAX (runaway) / contest BAJO (sólo 1 jugador cubierto)
    const qa = { margin: marginW([12, 0, 0, 0], 4), contest: contestW([12, 0, 0, 0], 4) };
    // uniforme-4: margin 0 (empate) / contest MAX (los 4 cubiertos)
    const qb = { margin: marginW([3, 3, 3, 3], 4), contest: contestW([3, 3, 3, 3], 4) };
    // [6,6,0,0]: margin 0 (empate) / contest 1 (2-de-4)
    const qc = { margin: marginW([6, 6, 0, 0], 4), contest: contestW([6, 6, 0, 0], 4) };
    // [6,1,1,1]: margin heavy(2, 0.556) / contest MAX (4-de-4) ⇒ MISMO margin(2) que all-on-one, DISTINTO contest
    const qd = { margin: marginW([6, 1, 1, 1], 4), contest: contestW([6, 1, 1, 1], 4) };
    return { qa, qb, qc, qd };
  });
  const crux123OK = crux123.qa.margin === 2 && crux123.qa.contest === 0 && crux123.qb.margin === 0 && crux123.qb.contest === 2
    && crux123.qd.margin === 2 && crux123.qa.contest !== crux123.qd.contest && crux123.qc.margin === 0 && crux123.qc.contest === 1;
  ok("8 ★ ⊥#123 AGGRO-CONTEST crux (LEAD/runaway vs AMPLITUD): all-on-one ⇒ MARGIN 2/CONTEST 0; uniforme-4 ⇒ MARGIN 0/CONTEST 2; [6,1,1,1]⇒MARGIN 2 (MISMO que all-on-one)/CONTEST 2 (DISTINTO ⇒ runaway puede ser estrecho o amplio) ⇒ INDEPENDIENTES",
     crux123OK, JSON.stringify(crux123));

  // 9 ★ ⊥#118 AGGRO-FOCUS crux (lead IDENTITY-BLIND vs fracción-sobre-el-HÉROE): margin=(top−second)/N (sobre CUALQUIER jugador); focus=counts[0]/N (sólo índice0=héroe). DISOCIAN.
  const crux118 = await page.evaluate(() => {
    const marginW = (counts, P) => window.__dev.aggroMargin({ marginProbe: { counts, players: P } }).marginProbe.weight;
    const focusMP = (counts) => { const N = counts.reduce((a, b) => a + b, 0); return N > 0 ? +(counts[0] / N).toFixed(3) : 0; };
    // TODO sobre player1 (NON-héroe): margin MAX (runaway sobre alguien) / focus 0 (nada sobre el héroe)
    const qa = { margin: marginW([0, 12, 0, 0], 4), focus: focusMP([0, 12, 0, 0]) };
    // TODO sobre el héroe: margin MAX / focus 1.0
    const qb = { margin: marginW([12, 0, 0, 0], 4), focus: focusMP([12, 0, 0, 0]) };
    return { qa, qb };
  });
  const crux118OK = crux118.qa.margin === 2 && crux118.qa.focus === 0 && crux118.qb.margin === 2 && crux118.qb.focus === 1;
  ok("9 ★ ⊥#118 AGGRO-FOCUS crux (lead IDENTITY-BLIND vs fracción-sobre-el-HÉROE): TODO-sobre-player1-NO-héroe ⇒ MARGIN 2/FOCUS 0; TODO-sobre-héroe ⇒ MARGIN 2/FOCUS 1.0 ⇒ MISMO margin(2) admite focus 0 Y 1.0 ⇒ el lead es IDENTITY-BLIND (no hero-específico)",
     crux118OK, JSON.stringify(crux118));

  // 10 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs runaway, SIN party (P=1) ⇒ M=0; CON party (P≥2) ⇒ M>0.
  const degen = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroMargin({ enabled: true });
    const drive = (nPlayers, tgts) => { window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt }));
      const dv = window.__dev.aggroMargin({ driveMargin: { players, pts, wipe: true } }).driveMargin;
      const live = window.__dev.aggroMargin({ marginProbeLive: true }).marginProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged, top: live.top, second: live.second }; };
    const sp = drive(0, [0, 0, 0, 0]);   // single-player: P=1 (sólo héroe) ⇒ M=0 (colapso)
    const mp = drive(3, [0, 0, 0, 0]);   // multijugador P4, runaway sobre player0 ⇒ M=1.0 (bien-definido)
    window.__dev.aggroMargin({ clearMargin: true });
    window.__dev.aggroMargin({ enabled: false });
    return { sp, mp };
  }, { Z, POS, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 4 && degen.mp.engaged === 4 && degen.mp.top === 4 && degen.mp.second === 0 && degen.mp.score === 2 && Math.abs(degen.mp.idx - 1) < 0.005;
  ok("10 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs runaway SIN party (P=1) ⇒ M=0/score0; CON party (P=4) ⇒ top=4/second=0/M=1.0/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 11 ★ ⊥#117 ACCEL / #119 JERK crux (ventaja invariante a posición/movimiento): margin depende SÓLO de a QUIÉN targetea cada mob (e._amTgt), NO de su posición. Mismos targets con DISTINTAS posiciones ⇒ MISMO margin; mismas posiciones con DISTINTOS targets ⇒ DISTINTO margin.
  const crux117 = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroMargin({ enabled: true });
    const drive = (posIdx, tgts) => { window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tgt, i) => ({ dx: POS[posIdx[i]][0], dy: POS[posIdx[i]][1], type: "rat", state: "chase", tgt }));
      return window.__dev.aggroMargin({ driveMargin: { players, pts, wipe: true } }).driveMargin; };
    // packX: targets todos-sobre-0 (runaway), posiciones A ⇒ margin 2
    const px = drive([0, 1, 2, 3], [0, 0, 0, 0]);
    // packZ: MISMOS targets runaway, posiciones DISTINTAS B ⇒ margin 2 (invariante a posición/movimiento)
    const pz = drive([3, 2, 1, 0], [0, 0, 0, 0]);
    // packY: MISMAS posiciones que packX pero targets repartidos ⇒ margin 0 (misma geometría, distinto lead)
    const py = drive([0, 1, 2, 3], [0, 1, 2, 3]);
    window.__dev.aggroMargin({ clearMargin: true });
    window.__dev.aggroMargin({ enabled: false });
    return { px: px.score, pz: pz.score, py: py.score };
  }, { Z, POS, PLAYER_OFF });
  const crux117OK = crux117.px === 2 && crux117.pz === 2 && crux117.py === 0;
  ok("11 ★ ⊥#117 ACCEL/#119 JERK crux (ventaja ≠ cinemática): targets-runaway con posiciones A ⇒ MARGIN 2; MISMOS targets con posiciones DISTINTAS ⇒ MARGIN 2 (invariante al MOVIMIENTO); MISMAS posiciones con targets-repartidos ⇒ MARGIN 0 ⇒ el lead lo determina a QUIÉN apuntan, NO dónde están",
     crux117OK, JSON.stringify(crux117));

  // 12 CANAL aggroMarginFind: forageChargePreview con manada runaway >0 ; empate → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroMargin({ enabled: true });
    window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroMargin({ driveMargin: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // runaway ⇒ M1.0 ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroMargin();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroMargin({ driveMargin: { players, pts: [0, 0, 1, 1].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // empate (buckets[2,2,0]) ⇒ M0 ⇒ score0
    const goVm = window.__dev.aggroMargin();
    window.__dev.aggroMargin({ clearMargin: true });
    window.__dev.aggroMargin({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("12 CANAL aggroMarginFind: forageChargePreview con manada runaway (M1.0) ⇒ charge>0 (==aggroMarginBonus); con pico EMPATADO (M0) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 13 ★ SUB-CAP: charge never exceeds aggroMarginBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let n = 3; n <= 10; n++) vals.push(window.__dev.aggroMargin({ marginProbe: { counts: [n, 0, 0, 0], players: 4 } }).marginProbe.charge);  // all-on-one runaway en distintos conteos
    return { max: Math.max(...vals), cap: window.__dev.aggroMargin().cap };
  });
  ok("13 ★ SUB-CAP: ninguna ventaja produce charge>aggroMarginBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 14 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a runaway pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroMargin({ enabled: true });
    window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroMargin({ driveMargin: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });   // manada runaway disponible
    window.__dev.aggroMargin({ enabled: false });                          // now OFF
    const off = window.__dev.aggroMargin();
    window.__dev.aggroMargin({ enabled: true }); window.__dev.aggroMargin({ clearMargin: true }); window.__dev.aggroMargin({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, POS, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("14 ★ BYTE-NEUTRAL OFF: con OFF, aggroMarginBonus(pack runaway disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 15 ★ ORTHOGONALITY: toggling aggroPile/aggroContest/targetSpread/aggroFocus no cambia la señal de aggroMargin.
  const orth = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroMargin({ enabled: true });
    window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroMargin({ driveMargin: { players, pts: [0, 0, 0, 1].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } }).driveMargin;
    const snap = () => JSON.stringify({ aggroPile: window.__dev.aggroPile(), aggroContest: window.__dev.aggroContest(), targetSpread: window.__dev.targetSpread(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const apPrev = window.__dev.aggroPile().enabled, acPrev = window.__dev.aggroContest().enabled, tsPrev = window.__dev.targetSpread().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.aggroPile({ enabled: !apPrev }); window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroMargin({ marginProbeLive: true }).marginProbeLive;
    window.__dev.aggroPile({ enabled: apPrev }); window.__dev.aggroContest({ enabled: acPrev }); window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroMargin({ clearMargin: true });
    window.__dev.aggroMargin({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && Math.abs(before.idx - after.field) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeIdx: before.idx, afterField: after.field };
  }, { Z, POS, PLAYER_OFF });
  ok("15 ★ ORTOGONALIDAD aggroMarginFind ⊥ peers: la señal de ventaja (score/M) NO cambia al togglear AGGRO-PILE #124/AGGRO-CONTEST #123/TARGET-SPREAD #121/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 16 ★ 0-REGRESSION: 66 arc flags served true; AGGRO_MARGIN_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE", "JERK_DIR_SURGE", "STRIKE_COMMIT_SURGE", "TARGET_SPREAD_SURGE", "AGGRO_SWITCH_SURGE", "AGGRO_CONTEST_SURGE", "AGGRO_PILE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const amDark = flag("AGGRO_MARGIN_SURGE") === "false";
  ok("16 ★ 0-REGRESIÓN: 66 mecanismos del arco #59-#124 served enabled:true; AGGRO_MARGIN_SURGE served false (DARK #125)",
     arcAllOn && amDark && arc.length === 66, `aggroMargin=${flag("AGGRO_MARGIN_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 17 render badge "Ventaja:" drawn ON+runaway / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroMargin({ driveMargin: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Ventaja:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroMargin({ enabled: true });
    window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee aggroMarginVM en vivo; el loop rAF re-tickea la IA (los mobs chase inyectados pueden moverse/cambiar de estado) ⇒ re-inyecta los targets cada frame para probar el DIBUJO en estado runaway.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroMargin({ clearMargin: true });
    window.__dev.aggroMargin({ enabled: false });
    const enAtOff = window.__dev.aggroMargin().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, POS, PLAYER_OFF });
  ok("17 render badge \"Ventaja:\" se DIBUJA ON+runaway (M>0, re-driven cada frame) y NO OFF (M 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS, PLAYER_OFF } = args; const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroMargin({ enabled: true }); window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroMargin({ driveMargin: { players, pts: [0, 0, 0, 0].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt })), wipe: true } }); }, { Z, POS, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroMargin({ clearMargin: true }); window.__dev.aggroMargin({ enabled: false }); });

  // 18 ★ NORTH STAR — 2-client convergence.
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
    const pts = [0, 0, 0, 1].map((tgt, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt }));   // P4, buckets[3,1,0,0] ⇒ top3 second1 ⇒ (3-1)/4=0.5 ⇒ heavy ⇒ 2
    window.__dev.aggroMargin({ enabled: true });
    window.__dev.aggroMargin({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroMargin({ driveMargin: { players, pts, wipe: true } }).driveMargin;
    const vm = window.__dev.aggroMargin();
    const lut = [[[3, 3, 3, 3], 4], [[6, 6, 0, 0], 4], [[6, 1, 1, 1], 4], [[12, 0, 0, 0], 4]].map(([counts, P]) => { const m = window.__dev.aggroMargin({ marginProbe: { counts, players: P } }).marginProbe; return { counts, P, m: m.margin, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.aggroMargin({ marginProbeLive: true }).marginProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroMargin({ clearMargin: true });
    window.__dev.aggroMargin({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, engaged: live.engaged, top: live.top, second: live.second, players: live.players, lut, fp };
  }, { Z, FPARG, POS, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.engaged === B.engaged && A.top === B.top && A.second === B.second && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("18 ★ NORTH STAR 2-CLIENTE: MISMA party+targets (P4, buckets[3,1,0,0], M=0.5 heavy)+héroe ⇒ score/idx/tier/charge + marginProbeLive(field,engaged,top,second,players,score) + marginProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},engaged:${A.engaged},top:${A.top},second:${A.second},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},engaged:${B.engaged},top:${B.top},second:${B.second},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroMargin({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroMargin({ enabled: false }));

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
