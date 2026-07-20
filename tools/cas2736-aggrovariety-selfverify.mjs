// CAS-2736 — self-verify for MEZCLA (DARK, AGGRO_VARIETY_SURGE.enabled:false). EVO mecánica #127 (serializa tras #126 AGGRO_DENSITY_SURGE LIVE&served b04ec1eb79d6/815, base master b12ca3aa) — EJE FRESCO + CANAL FRESCO, ⊥ a las 68 LIVE #59-#126. AÑADE la dimensión THREAT-HETEROGENEITY/MIXED-PULL (la composición del ENJAMBRE, del lado de los MOBS) a la familia COMPOSICIÓN-DE-INTENCIÓN (#118 nivel-sobre-el-héroe / #120 sub-estado / #121 UNIFORMIDAD / #122 CHURN-TEMPORAL / #123 AMPLITUD / #124 max-share/PICO / #125 LEAD/gap / #126 MAGNITUD/load-medio).
// (A) EJE FRESCO = MEZCLA/heterogeneidad = aggroVarietyField(hero) = V = (K−1)/(varietyCap−1), con K=# arquetipos de mob DISTINTOS (clave e.type, índice de ETPL, server-auth/replicado) entre los mobs ALIVE ENGANCHADOS en radio. SNAPSHOT PURO (lee la aggro-table + e.type directo, SIN buffer temporal, como #121/#123/#124/#125/#126). aggroVarietyBand sobre K CRUDO: ≥hiVariety(3) ⇒ motley ⇒ 2; ≥midVariety(2) ⇒ mixto ⇒ 1; <mid (monotipo) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P<2 ⇒ V=0 (colapso LIMPIO).
//     CRUX (LA CRÍTICA) — VARIETY vive en el eje MOB-TYPE, TODOS los priores son distribución-sobre-JUGADORES: ⊥#126 DENSITY: [rat×6] (N6/K1 V0) vs [rat×2,skel×2,orc×2] (N6 IGUAL/K3 V-hi) ⇒ MISMA densidad, variedad opuesta; y density y variety ANTI-MUEVEN ([rat,skel,rat] N3/K2 V-mid pero density-lo vs [rat×8] N8/K1 V0 pero density-hi). ⊥#121/#124/#123 (forma/cobertura sobre JUGADORES): variety sobre TIPOS ⊥ share-de-jugador. ⊥#122 (snapshot ⊥ churn). ⊥#118 (agregado de party, hero-agnóstico).
// (B) CANAL FRESCO = aggroVarietyFind (fichas de mezcla por rematar en un pull HETEROGÉNEO — NINGUNA de las 68 flags lo usa; ⊥ aggroDensityFind #126/aggroMarginFind #125/aggroPileFind #124/aggroContestFind #123/targetSpreadFind #121/aggroFocusFind #118). Moneda FRESCA (h.aggroVarietyBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2736-aggrovariety-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2736");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// varietyProbe LUT esperada: (types,players)→N=len→K=distintos→V=(K−1)/(cap−1)→banda(K crudo)→{weight,tier}. UMBRALES hiVariety 3 / midVariety 2 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0). 🔑 types = clave por mob (variety IGNORA el reparto sobre jugadores — sólo la HETEROGENEIDAD).
const EXPECT_VARIETY = [
  { types: ["rat", "rat", "rat", "rat", "rat", "rat"], players: 2, k: 1, v: 0.000, w: 0 },                 // N6/K1 monotipo ⇒ 0 (MISMA N que el mixto, variedad opuesta)
  { types: ["rat", "rat", "skeleton", "skeleton", "orc", "orc"], players: 2, k: 3, v: 0.667, w: 2 },        // N6/K3 ⇒ motley ⇒ 2 (MISMA densidad que [rat×6], variedad opuesta)
  { types: ["rat", "rat", "skeleton"], players: 2, k: 2, v: 0.333, w: 1 },                                  // N3/K2 ⇒ mixto ⇒ 1
  { types: ["rat", "skeleton", "orc"], players: 2, k: 3, v: 0.667, w: 2 },                                  // N3/K3 ⇒ motley ⇒ 2
  { types: ["rat", "rat", "rat", "rat"], players: 2, k: 1, v: 0.000, w: 0 },                                // N4/K1 monotipo ⇒ 0
  { types: ["rat", "skeleton", "orc", "bat"], players: 2, k: 4, v: 1.000, w: 2 },                           // N4/K4 =varietyCap ⇒ V=1.0 ⇒ 2
  { types: ["rat", "skeleton", "orc", "bat", "wolf"], players: 2, k: 5, v: 1.000, w: 2 },                   // N5/K5 >cap ⇒ V clamp 1.0 ⇒ 2
  { types: ["rat", "skeleton"], players: 2, k: 0, v: 0.000, w: 0 },                                         // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { types: ["rat", "skeleton", "orc"], players: 1, k: 0, v: 0.000, w: 0 },                                  // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveVariety REAL: inyecta party sintética (P=hero+extra) + mobs TIPADOS enganchados; V=(K−1)/(cap−1). Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 variety IGNORA a QUIÉN targetean (sólo cuenta N + tipos).
const EXPECT_DRIVE = [
  { name: "monotype-P2-6rat", players: 1, types: ["rat", "rat", "rat", "rat", "rat", "rat"], k: 1, v: 0.000, w: 0 },
  { name: "mixed3-P2-6mob", players: 1, types: ["rat", "rat", "skeleton", "skeleton", "orc", "orc"], k: 3, v: 0.667, w: 2 },
  { name: "mixed2-P2-3mob", players: 1, types: ["rat", "rat", "skeleton"], k: 2, v: 0.333, w: 1 },
  { name: "quad-P2-4mob", players: 1, types: ["rat", "skeleton", "orc", "bat"], k: 4, v: 1.000, w: 2 },
  { name: "single-player", players: 0, types: ["rat", "skeleton", "orc"], k: 0, v: 0.000, w: 0 },   // 🔑 P1 (sólo héroe) ⇒ 0
  { name: "2mob-<minMobs", players: 1, types: ["rat", "skeleton"], k: 0, v: 0.000, w: 0 },           // N2 <minMobs3 ⇒ 0
];
const POS = [[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110], [110, 110], [-110, -40]];
const PLAYER_OFF = [[44, 0], [0, 44], [-44, 0], [30, 30], [-30, 30]];   // offsets de jugadores sintéticos (dentro de radio 300)
const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroVariety && window.__dev.aggroDensity && window.__dev.aggroMargin && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroVariety + peer hooks (aggroDensity/aggroMargin/aggroPile/aggroContest/targetSpread/aggroFocus/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroVariety());
  ok("2 byte-id OFF (fresh boot): AGGRO_VARIETY_SURGE.enabled false AND G.aggroVarietyBounty NUNCA se crea (gExists false) AND G._avParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.types === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroVarietyFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} types=${dark.types} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiVariety=${dark.hiVariety} midVariety=${dark.midVariety} varietyCap=${dark.varietyCap} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroVarietyFind/aggroVarietyBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroVarietyFind|aggroVarietyBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroVarietyBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroVarietyFind'/'aggroVarietyBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroVariety({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroVariety({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ varietyProbe LUT: (types,players)→N→K=distintos→V=(K−1)/(cap−1)→banda(K crudo)→tier→charge (UMBRALES hiVariety/midVariety + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroVariety({ varietyProbe: { types: c.types, players: c.players } }).varietyProbe), EXPECT_VARIETY);
  const tabOK = EXPECT_VARIETY.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].k === c.k && Math.abs(tab[i].variety - c.v) < 0.005);
  ok("5 ★ varietyProbe LUT (riqueza de arquetipos K): [rat×6]⇒K1/w0, [rat×2,skel×2,orc×2]⇒K3/w2 (MISMA densidad opuesta variedad), [rat,rat,skel]⇒K2/w1, [rat,skel,orc]⇒K3/w2, [rat×4]⇒K1/w0, 4-distintos⇒K4/V1.0/w2, 5-distintos⇒K5/V clamp1.0/w2, [rat,skel]⇒N2<minMobs⇒0, 3-distintos-P1⇒single-player⇒0. UMBRAL hiVariety 3/midVariety 2",
     tabOK, JSON.stringify(tab.map(x => ({ n: x.total, k: x.k, kRaw: x.kRaw, v: x.variety, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH MEZCLA: driveVariety inyecta party sintética + mobs TIPADOS enganchados ⇒ V=(K−1)/(cap−1) REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS, PLAYER_OFF } = args;
    const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));
    window.__dev.aggroVariety({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(c.types), wipe: true } }).driveVariety;
      const live = window.__dev.aggroVariety({ varietyProbeLive: true }).varietyProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvTypes: dv.types, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveK: live.k, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.aggroVariety({ clearVariety: true });
    window.__dev.aggroVariety({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvTypes === c.k && comp[i].liveK === c.k && Math.abs(comp[i].dvIdx - c.v) < 0.005 && Math.abs(comp[i].liveField - c.v) < 0.005);
  ok("5b ★ REAL SERVER-AUTH MEZCLA (aggro-table + e.type snapshot): monotype(P2/6rat)=K1/0/0, mixed3(P2/6mob)=K3/0.667/2, mixed2(P2/3mob)=K2/0.333/1, quad(P2/4mob)=K4/1.0/2, single-player(P1)=0/0, 2mob(<minMobs)=0/0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#126 DENSITY (MOB-TYPE-richness vs MAGNITUD): MISMA densidad, variedad OPUESTA + density/variety ANTI-MUEVEN.
  const cruxDens = await page.evaluate(() => {
    const varW = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe.weight;
    const densW = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    // (a) MISMA densidad, variedad opuesta: N6/P2=load3 en ambos ⇒ density w1 IGUAL; variety K1 vs K3
    const monoN6 = { var: varW(["rat", "rat", "rat", "rat", "rat", "rat"], 2), dens: densW([6], 2) };   // K1 V0/w0 ; density load3 w1
    const mixN6 = { var: varW(["rat", "rat", "skeleton", "skeleton", "orc", "orc"], 2), dens: densW([6], 2) };  // K3 V-hi/w2 ; density load3 w1 (MISMA densidad)
    // (b) density y variety ANTI-MUEVEN: [rat,skel,rat] N3/load1.5<mid ⇒ density w0 pero variety K2 w1 ; [rat×8] N8/load4 ⇒ density w2 pero variety K1 w0
    const loVarHiV = { var: varW(["rat", "skeleton", "rat"], 2), dens: densW([3], 2) };   // variety K2 w1 ; density load1.5 w0
    const hiVarLoV = { var: varW(["rat", "rat", "rat", "rat", "rat", "rat", "rat", "rat"], 2), dens: densW([8], 2) };  // variety K1 w0 ; density load4 w2
    return { monoN6, mixN6, loVarHiV, hiVarLoV };
  });
  const cruxDensOK = cruxDens.monoN6.dens === cruxDens.mixN6.dens        // MISMA densidad
    && cruxDens.monoN6.var !== cruxDens.mixN6.var                        // variedad OPUESTA
    && cruxDens.monoN6.var === 0 && cruxDens.mixN6.var === 2 && cruxDens.monoN6.dens === 1
    && cruxDens.loVarHiV.var === 1 && cruxDens.loVarHiV.dens === 0       // ANTI-MOVE: variety-hi/density-lo
    && cruxDens.hiVarLoV.var === 0 && cruxDens.hiVarLoV.dens === 2;      // ANTI-MOVE: variety-lo/density-hi
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#126 DENSITY (MOB-TYPE-richness vs MAGNITUD/load-medio): [rat×6]⇒VARIETY 0/DENSITY 1 vs [rat×2,skel×2,orc×2]⇒VARIETY 2/DENSITY 1 (MISMA densidad, variedad opuesta); [rat,skel,rat]⇒VARIETY 1/DENSITY 0 vs [rat×8]⇒VARIETY 0/DENSITY 2 (density y variety ANTI-MUEVEN) ⇒ DISOCIAN",
     cruxDensOK, JSON.stringify(cruxDens));

  // 7 ★ ⊥#123 AGGRO-CONTEST / ⊥#124 PILE crux (MOB-TYPE vs distribución-sobre-JUGADORES/cobertura): variety(TIPOS) ⊥ cobertura(share-de-jugador). 3 tipos pilados vs 1 tipo repartido.
  const cruxDist = await page.evaluate(() => {
    const nnz = (counts) => counts.filter(c => c > 0).length;
    const varW = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe.weight;
    const contestW = (covered, P) => window.__dev.aggroContest({ contestProbe: { covered, players: P } }).contestProbe.weight;
    // 3 tipos TODOS pilados en player1 (contest 1-de-4 BAJO) ⇒ variety w2
    const pilerMix = { var: varW(["rat", "rat", "skeleton", "skeleton", "orc", "orc"], 4), contest: contestW(nnz([6, 0, 0, 0]), 4) };
    // 1 tipo repartido sobre 4 jugadores (contest 4-de-4 MAX) ⇒ variety w0 ⇒ variety y contest ANTI-MUEVEN
    const spreadMono = { var: varW(["rat", "rat", "rat", "rat", "rat", "rat"], 4), contest: contestW(nnz([2, 2, 1, 1]), 4) };
    return { pilerMix, spreadMono };
  });
  const cruxDistOK = cruxDist.pilerMix.var !== cruxDist.spreadMono.var && cruxDist.pilerMix.var === 2 && cruxDist.spreadMono.var === 0
    && cruxDist.pilerMix.contest !== cruxDist.spreadMono.contest && cruxDist.pilerMix.contest === 0 && cruxDist.spreadMono.contest === 2;
  ok("7 ★ ⊥#123 CONTEST/⊥#124 PILE crux (MOB-TYPE-richness vs distribución-sobre-JUGADORES/cobertura): [3 tipos pilados en player1]⇒VARIETY 2/CONTEST 0 vs [1 tipo repartido sobre 4]⇒VARIETY 0/CONTEST 2 ⇒ variety (tipos) y contest (share-de-jugador) ANTI-MUEVEN ⇒ ortogonales",
     cruxDistOK, JSON.stringify(cruxDist));

  // 8 ★ ⊥#88 BULK/#79 SIZECLASS crux (CONTEO de tipos discretos vs talla): variety cuenta ARQUETIPOS distintos; MISMO conteo de tipos, distinto reparto ⇒ MISMA variedad (variety no ve cuántos de cada tipo).
  const cruxCount = await page.evaluate(() => {
    const varProbe = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe;
    // K=2 con reparto 5+1 vs 3+3 ⇒ MISMA variety (variety cuenta TIPOS, no cuántos de cada uno)
    const skew = varProbe(["rat", "rat", "rat", "rat", "rat", "skeleton"], 2);   // K2
    const even = varProbe(["rat", "rat", "rat", "skeleton", "skeleton", "skeleton"], 2);  // K2
    return { skew: { k: skew.k, w: skew.weight, v: skew.variety }, even: { k: even.k, w: even.weight, v: even.variety } };
  });
  const cruxCountOK = cruxCount.skew.k === cruxCount.even.k && cruxCount.skew.w === cruxCount.even.w && cruxCount.skew.k === 2 && cruxCount.skew.v === cruxCount.even.v;
  ok("8 ★ ⊥ reparto-dentro-del-tipo (variety = CONTEO de arquetipos, NO abundancia): [rat×5,skel×1] K2 vs [rat×3,skel×3] K2 ⇒ MISMA variety (w/v idénticos) ⇒ variety cuenta TIPOS distintos, indiferente a cuántos de cada uno",
     cruxCountOK, JSON.stringify(cruxCount));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs tipados, SIN party (P=1) ⇒ V=0; CON party (P≥2) ⇒ V>0.
  const degen = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));
    window.__dev.aggroVariety({ enabled: true });
    const drive = (nPlayers, types) => { window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(types), wipe: true } }).driveVariety;
      const live = window.__dev.aggroVariety({ varietyProbeLive: true }).varietyProbeLive;
      return { idx: dv.idx, types: dv.types, score: dv.score, players: live.players, engaged: live.engaged }; };
    const mix = ["rat", "rat", "skeleton", "skeleton", "orc", "orc"];
    const sp = drive(0, mix);   // single-player: P=1, mixed pull ⇒ V=0 (colapso)
    const mp = drive(1, mix);   // multijugador P2, K3 ⇒ V=0.667/score2 (bien-definido)
    window.__dev.aggroVariety({ clearVariety: true });
    window.__dev.aggroVariety({ enabled: false });
    return { sp, mp };
  }, { Z, POS, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 6 && degen.mp.types === 3 && degen.mp.score === 2 && Math.abs(degen.mp.idx - 0.667) < 0.01;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo pull mixto (K3) SIN party (P=1) ⇒ V=0/score0; CON party (P=2) ⇒ K3/V0.667/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ ⊥#117 ACCEL/#119 JERK crux (variety invariante a posición/movimiento): variety depende SÓLO de los TIPOS presentes, NO de posiciones. Mismos tipos con DISTINTAS posiciones ⇒ MISMO score.
  const crux117 = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroVariety({ enabled: true });
    const drive = (types, posOrder) => { window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
      const pts = types.map((t, i) => ({ dx: POS[posOrder[i] % POS.length][0], dy: POS[posOrder[i] % POS.length][1], type: t, state: "chase" }));
      return window.__dev.aggroVariety({ driveVariety: { players, pts, wipe: true } }).driveVariety; };
    const mix = ["rat", "skeleton", "orc", "bat"];   // K4
    // posA: 4 tipos en orden A ⇒ K4 ⇒ score2
    const pa = drive(mix, [0, 1, 2, 3]);
    // posB: MISMOS 4 tipos, posiciones DISTINTAS ⇒ score2 (invariante a posición)
    const pb = drive(mix, [3, 2, 1, 0]);
    // posC: 1 tipo (monotipo) mismas posiciones ⇒ K1 ⇒ score0 (distintos tipos ⇒ distinta variedad)
    const pc = drive(["rat", "rat", "rat", "rat"], [0, 1, 2, 3]);
    window.__dev.aggroVariety({ clearVariety: true });
    window.__dev.aggroVariety({ enabled: false });
    return { pa: pa.score, pb: pb.score, pc: pc.score };
  }, { Z, POS, PLAYER_OFF });
  const crux117OK = crux117.pa === 2 && crux117.pb === 2 && crux117.pc === 0;
  ok("10 ★ ⊥#117 ACCEL/#119 JERK crux (variety ≠ cinemática): 4-tipos posiciones A ⇒ VARIETY 2; MISMOS 4-tipos posiciones DISTINTAS ⇒ VARIETY 2 (invariante al MOVIMIENTO); monotipo mismas posiciones ⇒ VARIETY 0 ⇒ la variedad la determinan los TIPOS presentes, NO las posiciones",
     crux117OK, JSON.stringify(crux117));

  // 11 CANAL aggroVarietyFind: forageChargePreview con pull heterogéneo >0 ; monotipo → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));
    window.__dev.aggroVariety({ enabled: true });
    window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
    window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(["rat", "skeleton", "orc"]), wipe: true } });   // K3 ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroVariety();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(["rat", "rat", "rat", "rat"]), wipe: true } });   // K1 monotipo ⇒ score0
    const goVm = window.__dev.aggroVariety();
    window.__dev.aggroVariety({ clearVariety: true });
    window.__dev.aggroVariety({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroVarietyFind: forageChargePreview con pull heterogéneo (K3) ⇒ charge>0 (==aggroVarietyBonus); con monotipo (K1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroVarietyBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    const bigTypes = ["rat", "skeleton", "orc", "bat", "wolf", "spearman", "bandit", "wraith", "golem", "dragon"];
    for (let k = 3; k <= 10; k++) vals.push(window.__dev.aggroVariety({ varietyProbe: { types: bigTypes.slice(0, k), players: 2 } }).varietyProbe.charge);  // K creciente
    return { max: Math.max(...vals), cap: window.__dev.aggroVariety().cap };
  });
  ok("12 ★ SUB-CAP: ninguna variedad produce charge>aggroVarietyBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a heterogeneous pull available
  const neutral = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));
    window.__dev.aggroVariety({ enabled: true });
    window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(["rat", "skeleton", "orc", "bat"]), wipe: true } });   // pull heterogéneo disponible
    window.__dev.aggroVariety({ enabled: false });                          // now OFF
    const off = window.__dev.aggroVariety();
    window.__dev.aggroVariety({ enabled: true }); window.__dev.aggroVariety({ clearVariety: true }); window.__dev.aggroVariety({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, types: off.types };
  }, { Z, POS, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.types === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroVarietyBonus(pull heterogéneo disponible)==0 + forageChargePreview==0 + idx==0 + types==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroDensity/aggroMargin/aggroPile/aggroContest/targetSpread/aggroFocus no cambia la señal de aggroVariety.
  const orth = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));
    window.__dev.aggroVariety({ enabled: true });
    window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(["rat", "skeleton", "orc", "bat"]), wipe: true } }).driveVariety;
    const snap = () => JSON.stringify({ aggroDensity: window.__dev.aggroDensity(), aggroMargin: window.__dev.aggroMargin(), aggroPile: window.__dev.aggroPile(), aggroContest: window.__dev.aggroContest(), targetSpread: window.__dev.targetSpread(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const adPrev = window.__dev.aggroDensity().enabled, amPrev = window.__dev.aggroMargin().enabled, apPrev = window.__dev.aggroPile().enabled, acPrev = window.__dev.aggroContest().enabled, tsPrev = window.__dev.targetSpread().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.aggroDensity({ enabled: !adPrev }); window.__dev.aggroMargin({ enabled: !amPrev }); window.__dev.aggroPile({ enabled: !apPrev }); window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroVariety({ varietyProbeLive: true }).varietyProbeLive;
    window.__dev.aggroDensity({ enabled: adPrev }); window.__dev.aggroMargin({ enabled: amPrev }); window.__dev.aggroPile({ enabled: apPrev }); window.__dev.aggroContest({ enabled: acPrev }); window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroVariety({ clearVariety: true });
    window.__dev.aggroVariety({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.types === after.k;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeTypes: before.types, afterK: after.k };
  }, { Z, POS, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroVarietyFind ⊥ peers: la señal de mezcla (score/types) NO cambia al togglear AGGRO-DENSITY #126/AGGRO-MARGIN #125/AGGRO-PILE #124/AGGRO-CONTEST #123/TARGET-SPREAD #121/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 55 `_SURGE` totales, sole-false = AGGRO_VARIETY (54 true, incl. AGGRO_DENSITY #126 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const aggroDensityLive = census.find(([n]) => n === "AGGRO_DENSITY_SURGE");
  const censusOK = total === 55 && trues === 54 && falses.length === 1 && falses[0] === "AGGRO_VARIETY_SURGE" && aggroDensityLive && aggroDensityLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 55 `_SURGE` totales, 54 enabled:true (incl. AGGRO_DENSITY_SURGE #126 LIVE), sole-false = AGGRO_VARIETY_SURGE (DARK #127)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} aggroDensity=${aggroDensityLive ? aggroDensityLive[1] : "?"}`);

  // 16 render badge "Mezcla:" drawn ON+heterogeneous / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(["rat", "skeleton", "orc", "bat"]), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Mezcla:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroVariety({ enabled: true });
    window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroVariety({ clearVariety: true });
    window.__dev.aggroVariety({ enabled: false });
    const enAtOff = window.__dev.aggroVariety().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, POS, PLAYER_OFF });
  ok("16 render badge \"Mezcla:\" se DIBUJA ON+heterogéneo (V>0, re-driven cada frame) y NO OFF (V 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS, PLAYER_OFF } = args; const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" })); const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroVariety({ enabled: true }); window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(["rat", "skeleton", "orc", "bat"]), wipe: true } }); }, { Z, POS, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroVariety({ clearVariety: true }); window.__dev.aggroVariety({ enabled: false }); });

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
    const { Z, FPARG, POS, PLAYER_OFF } = args;
    const typedPts = (types) => types.map((t, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: t, state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2, K3 ⇒ mixto ⇒ score2, V=0.667
    window.__dev.aggroVariety({ enabled: true });
    window.__dev.aggroVariety({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroVariety({ driveVariety: { players, pts: typedPts(["rat", "rat", "skeleton", "skeleton", "orc", "orc"]), wipe: true } }).driveVariety;
    const vm = window.__dev.aggroVariety();
    const lut = [[["rat", "rat", "rat", "rat", "rat", "rat"], 2], [["rat", "rat", "skeleton", "skeleton", "orc", "orc"], 2], [["rat", "skeleton", "orc", "bat"], 2], [["rat", "rat", "skeleton"], 2]].map(([types, P]) => { const m = window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe; return { n: m.total, k: m.k, v: m.variety, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.aggroVariety({ varietyProbeLive: true }).varietyProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroVariety({ clearVariety: true });
    window.__dev.aggroVariety({ enabled: false });
    return { score: dv.score, idx: dv.idx, types: dv.types, tier: vm.tier, charge: vm.charge, liveField: live.field, liveK: live.k, liveScore: live.score, engaged: live.engaged, players: live.players, lut, fp };
  }, { Z, FPARG, POS, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.types === B.types && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveK === B.liveK && A.liveScore === B.liveScore && A.engaged === B.engaged && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA party+mobs tipados (P2, N6, K3, V=0.667 motley)+héroe ⇒ score/idx/types/tier/charge + varietyProbeLive(field,k,engaged,players,score) + varietyProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},types:${A.types},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveK:${A.liveK},engaged:${A.engaged},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},types:${B.types},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveK:${B.liveK},engaged:${B.engaged},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroVariety({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroVariety({ enabled: false }));

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
