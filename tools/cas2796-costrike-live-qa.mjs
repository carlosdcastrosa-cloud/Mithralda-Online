// CAS-2792 — self-verify for CÓNCLAVE (DARK, CO_STRIKE_SURGE.enabled:false). EVO mecánica #136 (base master 91bf3e7 tras #135 BRECHA RANK_SPREAD LIVE&served 876e25989358/815) — EJE FRESCO + CANAL FRESCO, ⊥ a los 77 LIVE #59-#135. El 18º eje de COMPOSICIÓN-DE-INTENCIÓN y ABRE la sub-familia PLAYER-COORDINATION (cómo se ENGANCHA la PARTY, no las stats del mob — la sub-familia MOB-POWER-RATING #133/#134/#135 quedó CERRADA por sus 3 momentos de distribución).
// (A) EJE FRESCO = CÓNCLAVE/CO-STRIKE = F = nº de JUGADORES DISTINTOS VIVOS en radio ENGANCHADOS por ≥1 mob del pack (targeteados por ≥1 mob aggro-ENGANCHADO) = la MUSTER/tamaño de la HUESTE que converge en la MISMA pelea (requiere N≥minMobs2 y party P≥minPlayers2). Lee la MISMA aggro-table server-auth de #121/#123/#124/#125, pero como CONTEO CRUDO de JUGADORES enganchados, NO fracción (#123 cov/P) ni max-share (#124) ni entropía (#121). SNAPSHOT PURO (lee la aggro-table replicada directo, SIN buffer temporal). 🔑 DETERMINISMO (sev-1): F=cuenta ENTERA de jugadores distintos targeteados vs umbrales ENTEROS {midMuster2,hiMuster3} ⇒ 0-float en el score/decisión. Bandas sobre F: ≥hiMuster(3) ⇒ cónclave-pleno ⇒ 2; ≥midMuster(2) ⇒ cónclave-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO (el MÁS del arco): single-player ⇒ P<2 ⇒ F=0 (colapso LIMPIO, IMPOSIBLE en solitario).
// (B) CANAL FRESCO = coStrikeFind (fichas de cónclave por comprometer/rematar con la hueste reunida — NINGUNO de los 77 flags lo usa). Moneda FRESCA (h.coStrikeBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — CÓNCLAVE = MAGNITUD CRUDA en el eje JUGADOR (cuántos aliados en la pelea) ⊥ TODOS los priores: ⊥#123 CONTEST (cov/P FRACCIÓN): CÓNCLAVE = cov CRUDO (conteo). {2 de 2} F2/C1.0 vs {2 de 4} F2/C0.5 (MISMO F, distinta C); {3 de 3} F3/C1.0 vs {2 de 2} F2/C1.0 (MISMA C, distinto F) — CONTEO ⊥ FRACCIÓN, precedente #126 DENSITY (conteo N ⊥ fracción). ⊥#124 PILE (max mobs sobre 1 jugador — invariante a mobs-por-jugador). ⊥#121 SPREAD (entropía). ⊥#126 DENSITY (conteo de MOBS no de JUGADORES).
//
// Run: node tools/cas2792-costrike-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2796");
const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT_BUILD = "75fda9c79c56", EXPECT_FILES = 815;
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// musterProbe LUT esperada: (tgts=idx-de-jugador-objetivo por mob, players=P gate)→N=len→muster=#idx DISTINTOS (clamp [0,P-1])→banda(muster vs {midMuster2,hiMuster3} ENTEROS)→{weight,rankTier}. UMBRALES hiMuster 3 / midMuster 2 + colapso single-player (P<2 ⇒ 0) + minMobs (N<2 ⇒ 0).
const EXPECT_MUSTER = [
  { name: "solo-target-P2",    tgts: [0, 0, 0],       players: 2, F: 1, w: 0 },   // 3 mobs TODOS sobre jugador0 ⇒ muster1 (solo 1 jugador enganchado) ⇒ 0
  { name: "duo-P2",            tgts: [0, 1],          players: 2, F: 2, w: 1 },   // 2 mobs sobre jug0+jug1 ⇒ muster2 ⇒ 1
  { name: "duo-heavy-P2",      tgts: [0, 0, 1, 1],    players: 2, F: 2, w: 1 },   // 🔑 4 mobs 2+2 sobre 2 jugadores ⇒ muster2 (INVARIANTE a mobs-por-jugador ⊥ PILE) ⇒ 1
  { name: "trio-P3",           tgts: [0, 1, 2],       players: 3, F: 3, w: 2 },   // 3 mobs sobre 3 jugadores ⇒ muster3 ⇒ 2
  { name: "trio-of-4-P4",      tgts: [0, 1, 2],       players: 4, F: 3, w: 2 },   // 🔑 muster3 de P4 (cov=3) ⇒ CÓNCLAVE 2 (conteo CRUDO, ⊥ CONTEST fracción 3/4)
  { name: "full-P4",           tgts: [0, 1, 2, 3],    players: 4, F: 4, w: 2 },   // 4 mobs sobre 4 jugadores ⇒ muster4 ⇒ 2
  { name: "pile-on-one-P3",    tgts: [0, 0, 0, 0, 0], players: 3, F: 1, w: 0 },   // 🔑 5 mobs TODOS sobre jug0 (PILE-hi) ⇒ muster1 ⇒ 0 (⊥ PILE: máx concentración pero muster mínima)
  { name: "no-pack-N1",        tgts: [0],             players: 2, F: 0, w: 0 },   // 🔑 N1 <minMobs2 ⇒ degenerado ⇒ muster reportada 0
  { name: "single-player",     tgts: [0, 1, 2],       players: 1, F: 0, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
  { name: "clamp-overflow-P2", tgts: [0, 5, 9],       players: 2, F: 2, w: 1 },   // idx>P-1 se clampa a P-1=1 ⇒ {0,1,1} ⇒ muster2 ⇒ 1
];
// driveMuster REAL: inyecta party sintética (P jugadores) + mobs enganchados con jugador-objetivo por-mob (e._coStrikeTgt) inyectado; F server-auth. Requiere ≥minMobs(2) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "duo-P2",          tgts: [0, 1],          players: 2, F: 2, w: 1 },   // muster2
  { name: "solo-P2",         tgts: [0, 0, 0],       players: 2, F: 1, w: 0 },   // muster1 ⇒ 0
  { name: "trio-P3",         tgts: [0, 1, 2],       players: 3, F: 3, w: 2 },   // muster3 ⇒ 2
  { name: "single-player",   tgts: [0, 1, 2],       players: 1, F: 0, w: 0 },   // 🔑 P1 ⇒ 0
  { name: "no-pack-N1",      tgts: [0],             players: 2, F: 0, w: 0 },   // N1 <minMobs2 ⇒ 0
];
const PLAYER_OFF = [[0, 0], [44, 0], [0, 44], [-44, 0], [30, 30]];   // offsets de jugadores sintéticos ([0,0]=héroe; dentro de radio 300)

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
  page.on("console", (m) => { if (m.type() === "error" && !isEnvErr(m.text())) errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coStrike && window.__dev.rankSpread && window.__dev.aggroContest && window.__dev.aggroPile && window.__dev.aggroDensity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coStrike + peer hooks (rankSpread/aggroContest/aggroPile/aggroDensity) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_STRIKE_SURGE.enabled TRUE; solo hero fresh boot ⇒ P<minPlayers2 ⇒ no hueste genuina ⇒ tier/score/muster colapsan LIMPIO a 0 (se ilumina sólo con party P>=2). channel fresco + tag vacío hasta enganchar.
  const dark = await page.evaluate(() => window.__dev.coStrike());
  ok("2 LIVE-ON (fresh solo boot): CO_STRIKE_SURGE.enabled TRUE AND sin hueste genuina (P<2) ⇒ tier/score/idx/muster/charge colapsan LIMPIO a 0 (se ilumina sólo con party P>=2) AND channel coStrikeFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.players <= 1 && dark.engaged === 0 && dark.muster === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coStrikeFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} engaged=${dark.engaged} muster=${dark.muster} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiMuster=${dark.hiMuster} midMuster=${dark.midMuster} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coStrikeFind/coStrikeBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coStrikeFind|coStrikeBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coStrikeBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coStrikeFind'/'coStrikeBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coStrike({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coStrike({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ musterProbe LUT: (tgts=idx-jugador por mob,players=P)→N→muster=#distintos→banda(muster vs {2,3} ENTEROS)→tier→charge (UMBRALES hiMuster/midMuster + colapso single-player + minMobs + clamp).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coStrike({ musterProbe: { tgts: c.tgts, players: c.players } }).musterProbe), EXPECT_MUSTER);
  const tabOK = EXPECT_MUSTER.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].muster === c.F);
  ok("5 ★ musterProbe LUT (CÓNCLAVE F=#jugadores distintos): solo{0,0,0}(F1)⇒0, duo{0,1}(F2)⇒1, duo-heavy{0,0,1,1}(F2)⇒1, trio{0,1,2}(F3)⇒2, trio-of-4(F3)⇒2, full{0,1,2,3}(F4)⇒2, pile-on-one(F1)⇒0, no-pack(N1)⇒0, single-player⇒0, clamp-overflow⇒F2. UMBRAL hiMuster 3/midMuster 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_MUSTER[i].name, p: x.players, F: x.muster, N: x.mobs, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH CÓNCLAVE: driveMuster inyecta party sintética + mobs enganchados con jugador-objetivo por-mob dado ⇒ F REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.coStrike({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coStrike({ driveMuster: { players: partyN(c.players), pts: mobPtsTgts(c.tgts), wipe: true } }).driveMuster;
      const live = window.__dev.coStrike({ musterProbeLive: true }).musterProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvMuster: dv.muster, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveMuster: live.muster, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.coStrike({ clearMuster: true });
    window.__dev.coStrike({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvMuster === c.F);
  ok("5c ★ REAL SERVER-AUTH CÓNCLAVE (aggro-table snapshot): duo{0,1}(P2)=w1, solo{0,0,0}(P2)=w0, trio{0,1,2}(P3)=w2, single-player(P1)=0, no-pack(N1<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): CÓNCLAVE = cov CRUDO, CONTEST = cov/P.
  const crux = await page.evaluate(() => {
    const coStrike = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    // {2 de 2}: 2 mobs sobre jug0+jug1, P2 ⇒ muster2/CONTEST cov=2 C=1.0
    const A = { cs: coStrike([0, 1], 2) };
    // {2 de 4}: 2 mobs sobre jug0+jug1, P4 ⇒ MISMO muster2, pero CONTEST C=0.5 (2/4)
    const B = { cs: coStrike([0, 1], 4) };
    // {3 de 3}: muster3/C=1.0 vs {2 de 2}: muster2/C=1.0 — MISMA C (1.0), distinto muster
    const C = { cs: coStrike([0, 1, 2], 3) };
    const D = { cs: coStrike([0, 1], 2) };
    return { A, B, C, D };
  });
  const cruxOK =
    crux.A.cs.muster === 2 && crux.B.cs.muster === 2             // MISMO F=2 con P2 vs P4 (CÓNCLAVE = conteo CRUDO, invariante a P)
    && crux.A.cs.weight === 1 && crux.B.cs.weight === 1
    && crux.C.cs.muster === 3 && crux.D.cs.muster === 2          // {3 de 3} F3 vs {2 de 2} F2 — misma C=1.0, distinto F
    && crux.C.cs.weight === 2 && crux.D.cs.weight === 1;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(P2) F2 vs {2 de 4}(P4) F2 ⇒ MISMO CÓNCLAVE F=2 pero CONTEST C=1.0 vs 0.5; {3 de 3}(P3) F3 vs {2 de 2}(P2) F2 ⇒ MISMA C=1.0 distinto F ⇒ CÓNCLAVE es MAGNITUD CRUDA en el eje JUGADOR (precedente #126 DENSITY conteo ⊥ fracción)",
     cruxOK, JSON.stringify(crux));

  // 6b ★ CRUX ⊥#124 PILE (MUSTER ⊥ CONCENTRACIÓN-de-mobs-por-jugador): pila máxima ⇒ muster mínima.
  const cruxPile = await page.evaluate(() => {
    const csW = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    const pileW = (counts, P) => window.__dev.aggroPile({ pileProbe: { counts, players: P } }).pileProbe;
    // 6 mobs TODOS sobre jug0 (P3): PILE máxima (share 1.0), CÓNCLAVE muster1 ⇒ 0. coStrike tgts=[0,0,0,0,0,0]; pile counts=[6,0,0]
    const piled = { cs: csW([0, 0, 0, 0, 0, 0], 3), pile: pileW([6, 0, 0], 3) };
    // 3 mobs 1 c/u sobre 3 jugadores (P3): PILE mínima (share 1/3), CÓNCLAVE muster3 ⇒ 2. coStrike tgts=[0,1,2]; pile counts=[1,1,1]
    const spread = { cs: csW([0, 1, 2], 3), pile: pileW([1, 1, 1], 3) };
    return { piled, spread };
  });
  const cruxPileOK = cruxPile.piled.cs.muster === 1 && cruxPile.piled.cs.weight === 0 && cruxPile.spread.cs.muster === 3 && cruxPile.spread.cs.weight === 2
    && cruxPile.piled.pile.pile > cruxPile.spread.pile.pile;
  ok("6b ★ CRUX ⊥#124 PILE (MUSTER ⊥ CONCENTRACIÓN mobs-por-jugador): {6 mobs sobre 1 jugador} ⇒ CÓNCLAVE muster1/0 + PILE-máx vs {1 mob c/u sobre 3 jugadores} ⇒ CÓNCLAVE muster3/2 + PILE-mín ⇒ OPUESTOS (CÓNCLAVE cuenta JUGADORES, INVARIANTE a mobs-por-jugador)",
     cruxPileOK, JSON.stringify(cruxPile));

  // 6c ★ CRUX ⊥#126 DENSITY (CONTEO de JUGADORES ⊥ CONTEO de MOBS): F ⊥ N.
  const cruxDens = await page.evaluate(() => {
    const cs = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    const dens = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    // {2 jugadores, 10 mobs}: N10 density-hi, muster2 ⇒ 1
    const manyMobs = { cs: cs([0, 1, 0, 1, 0, 1, 0, 1, 0, 1], 2), dens: dens([10], 2) };
    // {4 jugadores, 3 mobs}: N3 density-lo, muster3 ⇒ 2
    const fewMobs = { cs: cs([0, 1, 2], 4), dens: dens([3], 4) };
    return { manyMobs, fewMobs };
  });
  const cruxDensOK = cruxDens.manyMobs.cs.muster === 2 && cruxDens.manyMobs.cs.weight === 1 && cruxDens.fewMobs.cs.muster === 3 && cruxDens.fewMobs.cs.weight === 2
    && cruxDens.manyMobs.dens >= cruxDens.fewMobs.dens;
  ok("6c ★ CRUX ⊥#126 DENSITY (CONTEO de JUGADORES ⊥ CONTEO de MOBS): {2 jug,10 mobs} ⇒ CÓNCLAVE muster2/1 density-hi vs {4 jug,3 mobs} ⇒ CÓNCLAVE muster3/2 density-lo ⇒ F y N ANTI-MUEVEN (CÓNCLAVE cuenta JUGADORES, DENSITY cuenta MOBS)",
     cruxDensOK, JSON.stringify(cruxDens));

  // 7 ★ N-INVARIANCE (F=#jugadores distintos ⊥ nº de mobs N, con los jugadores targeteados fijos y N≥minMobs): mismos jugadores, más mobs ⇒ MISMO F.
  const nInv = await page.evaluate(() => {
    const t = (tgts, P) => { const m = window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe; return { F: m.muster, w: m.weight, mobs: m.mobs }; };
    const two = t([0, 1], 2);                           // N2, 2 jugadores ⇒ F2
    const many = t([0, 1, 0, 1, 0, 1], 2);              // N6, MISMOS 2 jugadores ⇒ F2
    return { two, many };
  });
  const nInvOK = nInv.two.F === nInv.many.F && nInv.two.w === nInv.many.w && nInv.two.w === 1 && nInv.two.mobs === 2 && nInv.many.mobs === 6;
  ok("7 ★ N-INVARIANCE (F ⊥ nº de mobs, N≥minMobs): MISMOS 2 jugadores targeteados con N2 vs N6 ⇒ MISMO F=2/score1 (mandan los JUGADORES distintos, no el conteo de mobs)",
     nInvOK, JSON.stringify(nInv));

  // 8 ★ P-SENSITIVITY correcta: más jugadores DISTINTOS targeteados ⇒ F sube (a diferencia de la fracción CONTEST).
  const pSens = await page.evaluate(() => {
    const t = (tgts, P) => { const m = window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe; return { F: m.muster, w: m.weight, p: m.players }; };
    const duo = t([0, 1], 4);              // 2 de 4 targeteados ⇒ F2
    const trio = t([0, 1, 2], 4);          // 3 de 4 ⇒ F3
    const full = t([0, 1, 2, 3], 4);       // 4 de 4 ⇒ F4
    return { duo, trio, full };
  });
  const pSensOK = pSens.duo.F === 2 && pSens.trio.F === 3 && pSens.full.F === 4 && pSens.duo.w === 1 && pSens.trio.w === 2 && pSens.full.w === 2;
  ok("8 ★ P-SENSITIVITY (F sube con más jugadores DISTINTOS enganchados): 2/4⇒F2/w1, 3/4⇒F3/w2, 4/4⇒F4/w2 (CÓNCLAVE mide el tamaño CRUDO de la hueste)",
     pSensOK, JSON.stringify(pSens));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismo pack de cónclave, SIN party (P=1) ⇒ F=0; CON party (P≥2) ⇒ F>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.coStrike({ enabled: true });
    const drive = (P) => { window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coStrike({ driveMuster: { players: partyN(P), pts: mobPtsTgts([0, 1, 2]), wipe: true } }).driveMuster;
      const live = window.__dev.coStrike({ musterProbeLive: true }).musterProbeLive;
      return { idx: dv.idx, muster: dv.muster, score: dv.score, players: live.players, engaged: live.engaged }; };
    const sp = drive(1);        // single-player: P=1 ⇒ F=0 (colapso)
    const mp = drive(3);        // multijugador P3 ⇒ F=3/score2 (bien-definido)
    window.__dev.coStrike({ clearMuster: true });
    window.__dev.coStrike({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.muster === 0 && degen.sp.score === 0 && degen.mp.players === 3 && degen.mp.engaged === 3 && degen.mp.score === 2 && degen.mp.muster === 3;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo pack {0,1,2} SIN party (P=1) ⇒ F=0/score0; CON party (P=3) ⇒ F=3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE en solitario",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos musterProbe idénticos ⇒ F/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coStrike({ musterProbe: { tgts: [0, 1, 2, 1, 0, 3], players: 4 } }).musterProbe;
    const b = window.__dev.coStrike({ musterProbe: { tgts: [0, 1, 2, 1, 0, 3], players: 4 } }).musterProbe;
    return { a: { F: a.muster, w: a.weight }, b: { F: b.muster, w: b.weight } };
  });
  const detOK = det.a.F === det.b.F && det.a.w === det.b.w && det.a.F === 4;
  ok("10 ★ INTEGER-DETERMINISM: musterProbe repetido ⇒ F/weight byte-idénticos (CONTEO ENTERO de jugadores distintos + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL coStrikeFind: forageChargePreview con hueste reunida >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.coStrike({ enabled: true });
    window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coStrike({ driveMuster: { players: partyN(3), pts: mobPtsTgts([0, 1, 2]), wipe: true } });   // cónclave-pleno ⇒ score2
    const actVm = window.__dev.coStrike();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coStrike({ driveMuster: { players: partyN(2), pts: mobPtsTgts([0, 0, 0]), wipe: true } });   // solitario (muster1) ⇒ score0
    const goVm = window.__dev.coStrike();
    window.__dev.coStrike({ clearMuster: true });
    window.__dev.coStrike({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL coStrikeFind: forageChargePreview hueste plena (F≥3) ⇒ charge>0 (==coStrikeBonus); con solitario (F<2) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds coStrikeBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 10; k++) { const tgts = []; for (let i = 0; i < k; i++) tgts.push(i); vals.push(window.__dev.coStrike({ musterProbe: { tgts, players: k } }).musterProbe.charge); }  // k jugadores distintos ⇒ F=k ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coStrike().cap };
  });
  ok("12 ★ SUB-CAP: ninguna hueste plena produce charge>coStrikeBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full muster available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.coStrike({ enabled: true });
    window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coStrike({ driveMuster: { players: partyN(3), pts: mobPtsTgts([0, 1, 2]), wipe: true } });   // hueste plena disponible
    window.__dev.coStrike({ enabled: false });                          // now OFF
    const off = window.__dev.coStrike();
    window.__dev.coStrike({ enabled: true }); window.__dev.coStrike({ clearMuster: true }); window.__dev.coStrike({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, players: off.players, engaged: off.engaged, muster: off.muster };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.players === 0 && neutral.engaged === 0 && neutral.muster === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, coStrikeBonus(hueste plena disponible)==0 + forageChargePreview==0 + idx==0 + players==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroContest/aggroPile/rankSpread/aggroDensity no cambia la señal de coStrike.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.coStrike({ enabled: true });
    window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coStrike({ driveMuster: { players: partyN(3), pts: mobPtsTgts([0, 1, 2]), wipe: true } }).driveMuster;
    const snap = () => JSON.stringify({ aggroContest: window.__dev.aggroContest(), aggroPile: window.__dev.aggroPile(), rankSpread: window.__dev.rankSpread(), aggroDensity: window.__dev.aggroDensity() });
    const peersOn = snap();
    const acPrev = window.__dev.aggroContest().enabled, apPrev = window.__dev.aggroPile().enabled, rsPrev = window.__dev.rankSpread().enabled, adPrev = window.__dev.aggroDensity().enabled;
    window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.aggroPile({ enabled: !apPrev }); window.__dev.rankSpread({ enabled: !rsPrev }); window.__dev.aggroDensity({ enabled: !adPrev });
    const after = window.__dev.coStrike({ musterProbeLive: true }).musterProbeLive;
    window.__dev.aggroContest({ enabled: acPrev }); window.__dev.aggroPile({ enabled: apPrev }); window.__dev.rankSpread({ enabled: rsPrev }); window.__dev.aggroDensity({ enabled: adPrev });
    const peersRestored = snap();
    window.__dev.coStrike({ clearMuster: true });
    window.__dev.coStrike({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged && before.muster === after.muster;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeMuster: before.muster, afterMuster: after.muster };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD coStrikeFind ⊥ peers: la señal de cónclave (score/engaged/muster) NO cambia al togglear AGGRO-CONTEST #123/AGGRO-PILE #124/RANK-SPREAD #135/AGGRO-DENSITY #126; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 64 `_SURGE` totales, sole-false = CO_STRIKE (63 true, incl. RANK_SPREAD #135 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const rankSpreadLive = census.find(([n]) => n === "RANK_SPREAD_SURGE");
  const coStrikeLive = census.find(([n]) => n === "CO_STRIKE_SURGE");
  const censusOK = total === 64 && trues === 64 && falses.length === 0 && coStrikeLive && coStrikeLive[1] === "true" && rankSpreadLive && rankSpreadLive[1] === "true";
  ok("15 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 64 `_SURGE` totales, 64 enabled:true, off=[] (CO_STRIKE_SURGE #136 LIVE + RANK_SPREAD_SURGE #135 LIVE)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coStrike=${coStrikeLive ? coStrikeLive[1] : "?"} rankSpread=${rankSpreadLive ? rankSpreadLive[1] : "?"}`);

  // 16 render badge "Cónclave:" drawn ON+muster / not OFF + fps. 🔑 label ÚNICO "Cónclave:" (⊥ #135 'Brecha:'/#134 'Casta:'/#133 'Reto:').
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    const drive = () => window.__dev.coStrike({ driveMuster: { players: partyN(3), pts: mobPtsTgts([0, 1, 2]), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cónclave:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coStrike({ enabled: true });
    window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coStrike({ clearMuster: true });
    window.__dev.coStrike({ enabled: false });
    const enAtOff = window.__dev.coStrike().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Cónclave:\" se DIBUJA ON+hueste (F>0, re-driven cada frame) y NO OFF (F 0) + fps sano (label ÚNICO ⊥ #135 'Brecha:'/#134 'Casta:'/#133 'Reto:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t })); const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] })); window.__dev.coStrike({ enabled: true }); window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coStrike({ driveMuster: { players: partyN(3), pts: mobPtsTgts([0, 1, 2]), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coStrike({ clearMuster: true }); window.__dev.coStrike({ enabled: false }); });

  // 17 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1).
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error" && !isEnvErr(m.text())) errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((args) => {
    const { Z, FPARG, PLAYER_OFF } = args;
    const mobPtsTgts = (tgts, dist = 120) => tgts.map((t, i) => ({ deg: Math.round(360 * i / Math.max(1, tgts.length)), dist, type: "rat", state: "chase", tgt: t }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.coStrike({ enabled: true });
    window.__dev.coStrike({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coStrike({ driveMuster: { players: partyN(3), pts: mobPtsTgts([0, 1, 2]), wipe: true } }).driveMuster;   // P3, 3 mobs sobre 3 jugadores ⇒ F=3 ⇒ score2
    const vm = window.__dev.coStrike();
    const lut = [[[0, 1], 2], [[0, 1, 2], 3], [[0, 0, 0], 2], [[0, 1, 2, 3], 4]].map(([tgts, P]) => { const m = window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe; return { p: m.players, F: m.muster, N: m.mobs, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coStrike({ musterProbeLive: true }).musterProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coStrike({ clearMuster: true });
    window.__dev.coStrike({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, muster: dv.muster, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, liveMuster: live.muster, livePlayers: live.players, lut, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.muster === B.muster && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.liveMuster === B.liveMuster && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO pack P3 + 3 mobs {0,1,2} (F=3) ⇒ score/idx/engaged/muster/players/tier/charge + musterProbeLive(field,engaged,muster,players,score) + musterProbe LUT (F/N enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},muster:${A.muster},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveMuster:${A.liveMuster},livePlayers:${A.livePlayers},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},muster:${B.muster},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveMuster:${B.liveMuster},livePlayers:${B.livePlayers},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coStrike({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coStrike({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == 75fda9c79c56/815 (NEW ≠ old 876e25989358) + served sim/config.js CO_STRIKE_SURGE enabled:true + census 64/64 off=[].
  try {
    const rootRes = await fetch(LIVE_BASE + "/");
    const verRes = await fetch(LIVE_BASE + "/version.json");
    const ver = await verRes.json();
    const cfgRes = await fetch(LIVE_BASE + "/sim/config.js");
    const cfgTxt = await cfgRes.text();
    const cen = [...cfgTxt.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
    const sTotal = cen.length, sTrue = cen.filter(([, v]) => v === "true").length;
    const sFalse = cen.filter(([, v]) => v !== "true").map(([n]) => n);
    const coServed = cen.find(([n]) => n === "CO_STRIKE_SURGE");
    const rankServed = cen.find(([n]) => n === "RANK_SPREAD_SURGE");
    const live18 = rootRes.status === 200 && verRes.status === 200 && cfgRes.status === 200
      && ver.build === EXPECT_BUILD && ver.files === EXPECT_FILES
      && coServed && coServed[1] === "true" && rankServed && rankServed[1] === "true"
      && sTotal === 64 && sTrue === 64 && sFalse.length === 0;
    ok("18 ★ SERVED LIVE BUILD (gh-pages no lag): root200 + version.json 75fda9c79c56/815 NEW + served config CO_STRIKE_SURGE enabled:true + census 64/64 off=[]",
       live18, `root=${rootRes.status} verHTTP=${verRes.status} build=${ver.build} files=${ver.files} cfgHTTP=${cfgRes.status} coStrike=${coServed ? coServed[1] : "?"} rankSpread=${rankServed ? rankServed[1] : "?"} census=${sTotal}/${sTrue} off=${JSON.stringify(sFalse)}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages no lag)", false, `FETCH ERROR ${e && e.message}`);
  }

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
