// CAS-2730 — self-verify for AVALANCHA (DARK, AGGRO_DENSITY_SURGE.enabled:false). EVO mecánica #126 (serializa tras #125 AGGRO_MARGIN_SURGE LIVE&served 664e24117516/815, base master cc11557) — EJE FRESCO + CANAL FRESCO, ⊥ a las 67 LIVE #59-#125. AÑADE la dimensión de OUTNUMBER/SWARM-PRESSURE (1er MOMENTO/MAGNITUD) a la familia COMPOSICIÓN-DE-INTENCIÓN (#118 nivel-sobre-el-héroe / #120 sub-estado / #121 UNIFORMIDAD / #122 CHURN-TEMPORAL / #123 AMPLITUD / #124 max-share/PICO / #125 LEAD/gap).
// (A) EJE FRESCO = AVALANCHA/load-medio = aggroDensityField(hero) = D = min(N/P, densityCap)/densityCap, con N=#mobs ALIVE ENGANCHADOS en radio, P=#jugadores ALIVE en radio. SNAPSHOT PURO (lee la aggro-table directo, SIN buffer temporal, como #121/#123/#124/#125). aggroDensityBand sobre el LOAD CRUDO N/P: ≥hiDensity(4) ⇒ heavy/zerg ⇒ 2; ≥midDensity(2) ⇒ some/superado-parcial ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P<2 ⇒ D=0 (colapso LIMPIO).
//     CRUX (LA CRÍTICA) — el 1er MOMENTO/MAGNITUD vs TODA forma NORMALIZADA (scale-free): DENSITY es la MEDIA. [1,1,1,1] (N4/P4 load1) vs [6,6,6,6] (N24/P4 load6): IDÉNTICO pile-share/margin/entropía (MISMA forma) pero densidad 6× ⇒ density w0 vs w2 mientras pile/margin/spread IDÉNTICOS ⇒ DISOCIAN. ⊥#123 COBERTURA: [8,0,0,0] (load2/contest1) vs [2,2,2,2] (load2 IGUAL/contest4): MISMA densidad, cobertura opuesta. ⊥#122 (snapshot ⊥ churn). ⊥#118 (agregado de party, hero-agnóstico). ⊥#87 (load-MEDIO ⊥ conteo BRUTO de MOBS).
// (B) CANAL FRESCO = aggroDensityFind (fichas de avalancha por rematar con la party SUPERADA EN NÚMERO — NINGUNA de las 67 flags lo usa; ⊥ aggroMarginFind #125/aggroPileFind #124/aggroContestFind #123/targetSpreadFind #121/aggroFocusFind #118). Moneda FRESCA (h.aggroDensityBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2730-aggrodensity-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2730");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// densityProbe LUT esperada: (counts,players)→N=Σ→load=N/P→D=min(load,6)/6→banda(load crudo)→{weight,tier}. UMBRALES hiDensity 4 / midDensity 2 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0). 🔑 counts SÓLO da N (density IGNORA la forma del reparto).
const EXPECT_DENSITY = [
  { counts: [1, 1, 1, 1], players: 4, load: 1, d: 0.167, w: 0 },        // N4/P4=1 <mid ⇒ 0 (MISMA forma que [6,6,6,6] pero 6× menos densidad)
  { counts: [6, 6, 6, 6], players: 4, load: 6, d: 1.000, w: 2 },        // N24/P4=6 ≥hi ⇒ heavy/zerg ⇒ 2 (6× la densidad de [1,1,1,1], forma IDÉNTICA)
  { counts: [8, 0, 0, 0], players: 4, load: 2, d: 0.333, w: 1 },        // N8/P4=2 ≥mid ⇒ some ⇒ 1 (MISMA densidad que [2,2,2,2], cobertura opuesta)
  { counts: [2, 2, 2, 2], players: 4, load: 2, d: 0.333, w: 1 },        // N8/P4=2 ≥mid ⇒ some ⇒ 1 (MISMA densidad que [8,0,0,0])
  { counts: [12, 0, 0, 0], players: 4, load: 3, d: 0.500, w: 1 },       // N12/P4=3 ≥mid <hi ⇒ some ⇒ 1
  { counts: [4, 4, 4, 4], players: 4, load: 4, d: 0.667, w: 2 },        // N16/P4=4 =hiDensity ⇒ heavy ⇒ 2
  { counts: [3, 3], players: 2, load: 3, d: 0.500, w: 1 },              // N6/P2=3 ≥mid ⇒ some ⇒ 1
  { counts: [2, 2, 2, 2, 2, 2], players: 6, load: 2, d: 0.333, w: 1 },  // N12/P6=2 ≥mid ⇒ some ⇒ 1 (invariante al conteo de JUGADORES a load fijo)
  { counts: [1, 1], players: 2, load: 0, d: 0.000, w: 0 },              // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { counts: [8, 0, 0, 0], players: 1, load: 0, d: 0.000, w: 0 },        // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// driveDensity REAL: inyecta party sintética (P=hero+extra) + `nMobs` mobs enganchados; D=min(N/P,6)/6. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 density IGNORA a QUIÉN targetean (sólo cuenta N).
const EXPECT_DRIVE = [
  { name: "zerg-P2-12mob", players: 1, nMobs: 12, load: 6, d: 1.000, w: 2 },   // P2, N12 ⇒ 12/2=6 ≥hi ⇒ 2
  { name: "hi-P2-8mob", players: 1, nMobs: 8, load: 4, d: 0.667, w: 2 },       // P2, N8 ⇒ 8/2=4 =hi ⇒ 2
  { name: "mid-P2-4mob", players: 1, nMobs: 4, load: 2, d: 0.333, w: 1 },      // P2, N4 ⇒ 4/2=2 =mid ⇒ 1
  { name: "low-P4-3mob", players: 3, nMobs: 3, load: 0.75, d: 0.125, w: 0 },   // P4, N3 ⇒ 3/4=0.75 <mid ⇒ 0
  { name: "single-player", players: 0, nMobs: 8, load: 0, d: 0.000, w: 0 },    // 🔑 P1 (sólo héroe) ⇒ degenerado ⇒ 0
  { name: "2mob-<minMobs", players: 1, nMobs: 2, load: 0, d: 0.000, w: 0 },    // N2 <minMobs3 ⇒ 0
];
const POS = [[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110]];
const PLAYER_OFF = [[44, 0], [0, 44], [-44, 0], [30, 30], [-30, 30]];   // offsets de jugadores sintéticos (dentro de radio 300)
const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.aggroDensity && window.__dev.aggroMargin && window.__dev.aggroPile && window.__dev.aggroContest && window.__dev.targetSpread && window.__dev.aggroFocus && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.aggroDensity + peer hooks (aggroMargin/aggroPile/aggroContest/targetSpread/aggroFocus/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.aggroDensity());
  ok("2 byte-id OFF (fresh boot): AGGRO_DENSITY_SURGE.enabled false AND G.aggroDensityBounty NUNCA se crea (gExists false) AND G._adParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.load === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "aggroDensityFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} load=${dark.load} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiDensity=${dark.hiDensity} midDensity=${dark.midDensity} densityCap=${dark.densityCap} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no aggroDensityFind/aggroDensityBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(aggroDensityFind|aggroDensityBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"aggroDensityBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'aggroDensityFind'/'aggroDensityBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroDensity({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.aggroDensity({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ densityProbe LUT: (counts,players)→N→load=N/P→D→banda(load crudo)→tier→charge (UMBRALES hiDensity/midDensity + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.aggroDensity({ densityProbe: { counts: c.counts, players: c.players } }).densityProbe), EXPECT_DENSITY);
  const tabOK = EXPECT_DENSITY.every((c, i) => tab[i] && tab[i].weight === c.w && Math.abs(tab[i].load - c.load) < 0.005 && Math.abs(tab[i].density - c.d) < 0.005);
  ok("5 ★ densityProbe LUT (load-medio N/P): [1,1,1,1]⇒load1/w0, [6,6,6,6]⇒load6/w2 (6× densidad MISMA forma), [8,0,0,0]⇒load2/w1, [2,2,2,2]⇒load2/w1 (MISMA densidad opuesta cobertura), [12,0,0,0]⇒load3/w1, [4,4,4,4]⇒load4/w2, [3,3]P2⇒load3/w1, [1,1]P2⇒N2<minMobs⇒0, [8,0,0,0]P1⇒single-player⇒0. UMBRAL hiDensity 4/midDensity 2",
     tabOK, JSON.stringify(tab.map(x => ({ counts: x.counts, P: x.players, N: x.total, load: x.load, d: x.density, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH AVALANCHA: driveDensity inyecta party sintética + N mobs enganchados ⇒ D=min(N/P,cap)/cap REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS, PLAYER_OFF } = args;
    const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));
    window.__dev.aggroDensity({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(c.nMobs), wipe: true } }).driveDensity;
      const live = window.__dev.aggroDensity({ densityProbeLive: true }).densityProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvLoad: dv.load, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveLoad: live.load, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.aggroDensity({ clearDensity: true });
    window.__dev.aggroDensity({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.d) < 0.005 && Math.abs(comp[i].liveField - c.d) < 0.005 && Math.abs(comp[i].dvLoad - c.load) < 0.01);
  ok("5b ★ REAL SERVER-AUTH AVALANCHA (aggro-table snapshot): zerg(P2/12mob)=1.0/2, hi(P2/8mob)=0.667/2, mid(P2/4mob)=0.333/1, low(P4/3mob)=0.125/0, single-player(P1)=0/0, 2mob(<minMobs)=0/0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥ SHAPE (pile #124 / margin #125 / spread #121): 1er MOMENTO/MAGNITUD vs forma NORMALIZADA scale-free. MISMA forma, 6× densidad ⇒ density DISOCIA, pile/margin/spread IDÉNTICOS.
  const cruxShape = await page.evaluate(() => {
    const densW = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const pileW = (counts, P) => window.__dev.aggroPile({ pileProbe: { counts, players: P } }).pileProbe.weight;
    const marginW = (counts, P) => window.__dev.aggroMargin({ marginProbe: { counts, players: P } }).marginProbe.weight;
    const spreadW = (counts, P) => window.__dev.targetSpread({ spreadProbe: { counts, P } }).spreadProbe.weight;
    // (a) [1,1,1,1]: density load1 ⇒ 0; pile 0.25; margin 0; spread MAX (uniforme)
    const qa = { dens: densW([1, 1, 1, 1], 4), pile: pileW([1, 1, 1, 1], 4), margin: marginW([1, 1, 1, 1], 4), spread: spreadW([1, 1, 1, 1], 4) };
    // (b) [6,6,6,6]: MISMA forma (pile/margin/spread IDÉNTICOS) pero densidad 6× ⇒ density load6 ⇒ 2
    const qb = { dens: densW([6, 6, 6, 6], 4), pile: pileW([6, 6, 6, 6], 4), margin: marginW([6, 6, 6, 6], 4), spread: spreadW([6, 6, 6, 6], 4) };
    return { qa, qb };
  });
  const cruxShapeOK = cruxShape.qa.dens !== cruxShape.qb.dens        // density DISOCIA (0 vs 2)
    && cruxShape.qa.pile === cruxShape.qb.pile && cruxShape.qa.margin === cruxShape.qb.margin && cruxShape.qa.spread === cruxShape.qb.spread  // forma IDÉNTICA
    && cruxShape.qa.dens === 0 && cruxShape.qb.dens === 2;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥ SHAPE (pile #124/margin #125/spread #121 — 1er MOMENTO/MAGNITUD vs forma NORMALIZADA scale-free): [1,1,1,1]⇒DENSITY 0 vs [6,6,6,6]⇒DENSITY 2 (6× densidad); MISMA forma ⇒ pile/margin/spread IDÉNTICOS en ambos ⇒ el reward dispara sobre la MAGNITUD del swarm, NO su forma ⇒ DISOCIAN",
     cruxShapeOK, JSON.stringify(cruxShape));

  // 7 ★ ⊥#123 AGGRO-CONTEST crux (MAGNITUD vs COBERTURA/AMPLITUD): MISMA densidad, cobertura opuesta.
  const crux123 = await page.evaluate(() => {
    const nnz = (counts) => counts.filter(c => c > 0).length;
    const densW = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const contestW = (counts, P) => window.__dev.aggroContest({ contestProbe: { covered: nnz(counts), players: P } }).contestProbe.weight;
    // [8,0,0,0]: density load2 ⇒ some(1); contest 1-de-4 (BAJO)
    const qa = { dens: densW([8, 0, 0, 0], 4), contest: contestW([8, 0, 0, 0], 4) };
    // [2,2,2,2]: MISMA density load2 ⇒ some(1); contest 4-de-4 (MAX) ⇒ MISMA densidad, cobertura OPUESTA
    const qb = { dens: densW([2, 2, 2, 2], 4), contest: contestW([2, 2, 2, 2], 4) };
    return { qa, qb };
  });
  const crux123OK = crux123.qa.dens === crux123.qb.dens && crux123.qa.dens === 1 && crux123.qa.contest !== crux123.qb.contest && crux123.qa.contest === 0 && crux123.qb.contest === 2;
  ok("7 ★ ⊥#123 AGGRO-CONTEST crux (MAGNITUD vs COBERTURA): [8,0,0,0]⇒DENSITY 1/CONTEST 0 (1 jugador) vs [2,2,2,2]⇒DENSITY 1 (MISMA)/CONTEST 2 (4 jugadores, DISTINTA) ⇒ MISMA densidad admite cobertura opuesta ⇒ DISOCIAN",
     crux123OK, JSON.stringify(crux123));

  // 8 ★ ⊥#118 AGGRO-FOCUS crux (density AGREGADO de party, hero-agnóstico): density=N/P (indiferente a QUIÉN); focus=counts[0]/N (sólo héroe). MISMA densidad, focus 0 y 1.
  const crux118 = await page.evaluate(() => {
    const densW = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const focusMP = (counts) => { const N = counts.reduce((a, b) => a + b, 0); return N > 0 ? +(counts[0] / N).toFixed(3) : 0; };
    // TODO sobre player1 (NON-héroe): density load2 ⇒ some; focus 0
    const qa = { dens: densW([0, 8, 0, 0], 4), focus: focusMP([0, 8, 0, 0]) };
    // TODO sobre héroe: MISMA density load2 ⇒ some; focus 1.0
    const qb = { dens: densW([8, 0, 0, 0], 4), focus: focusMP([8, 0, 0, 0]) };
    return { qa, qb };
  });
  const crux118OK = crux118.qa.dens === crux118.qb.dens && crux118.qa.dens === 1 && crux118.qa.focus === 0 && crux118.qb.focus === 1;
  ok("8 ★ ⊥#118 AGGRO-FOCUS crux (density AGREGADO hero-agnóstico vs fracción-sobre-el-HÉROE): TODO-sobre-player1 ⇒ DENSITY 1/FOCUS 0; TODO-sobre-héroe ⇒ DENSITY 1 (MISMA)/FOCUS 1.0 ⇒ la densidad es indiferente a la identidad del target ⇒ DISOCIAN",
     crux118OK, JSON.stringify(crux118));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs, SIN party (P=1) ⇒ D=0; CON party (P≥2) ⇒ D>0.
  const degen = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));
    window.__dev.aggroDensity({ enabled: true });
    const drive = (nPlayers, nMobs) => { window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const dv = window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(nMobs), wipe: true } }).driveDensity;
      const live = window.__dev.aggroDensity({ densityProbeLive: true }).densityProbeLive;
      return { idx: dv.idx, load: dv.load, score: dv.score, players: live.players, engaged: live.engaged }; };
    const sp = drive(0, 8);   // single-player: P=1, N8 ⇒ D=0 (colapso)
    const mp = drive(1, 8);   // multijugador P2, N8 ⇒ load4 ⇒ D=0.667/score2 (bien-definido)
    window.__dev.aggroDensity({ clearDensity: true });
    window.__dev.aggroDensity({ enabled: false });
    return { sp, mp };
  }, { Z, POS, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 8 && degen.mp.score === 2 && Math.abs(degen.mp.load - 4) < 0.01 && Math.abs(degen.mp.idx - 0.667) < 0.01;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismos 8 mobs SIN party (P=1) ⇒ D=0/score0; CON party (P=2) ⇒ N8/load4/D0.667/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ ⊥#117 ACCEL/#119 JERK crux (density invariante a posición/movimiento): density depende SÓLO de N y P, NO de posiciones. Mismos N/P con DISTINTAS posiciones ⇒ MISMO score.
  const crux117 = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.aggroDensity({ enabled: true });
    const drive = (posOrder) => { window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
      const pts = posOrder.map(pi => ({ dx: POS[pi % POS.length][0], dy: POS[pi % POS.length][1], type: "rat", state: "chase" }));
      return window.__dev.aggroDensity({ driveDensity: { players, pts, wipe: true } }).driveDensity; };
    // posA: 8 mobs en orden A ⇒ load4 ⇒ score2
    const pa = drive([0, 1, 2, 3, 4, 5, 0, 1]);
    // posB: MISMOS 8 mobs, orden/posiciones DISTINTAS ⇒ score2 (invariante a posición)
    const pb = drive([5, 4, 3, 2, 1, 0, 5, 4]);
    // posC: 4 mobs (menos densidad) mismas posiciones base ⇒ load2 ⇒ score1 (distinto N ⇒ distinta densidad)
    const pc = drive([0, 1, 2, 3]);
    window.__dev.aggroDensity({ clearDensity: true });
    window.__dev.aggroDensity({ enabled: false });
    return { pa: pa.score, pb: pb.score, pc: pc.score };
  }, { Z, POS, PLAYER_OFF });
  const crux117OK = crux117.pa === 2 && crux117.pb === 2 && crux117.pc === 1;
  ok("10 ★ ⊥#117 ACCEL/#119 JERK crux (density ≠ cinemática): 8-mobs posiciones A ⇒ DENSITY 2; MISMOS 8-mobs posiciones DISTINTAS ⇒ DENSITY 2 (invariante al MOVIMIENTO); 4-mobs (menos N) ⇒ DENSITY 1 ⇒ la densidad la determina N/P, NO las posiciones",
     crux117OK, JSON.stringify(crux117));

  // 11 CANAL aggroDensityFind: forageChargePreview con swarm denso >0 ; poca densidad → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));
    window.__dev.aggroDensity({ enabled: true });
    window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2
    window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(8), wipe: true } });   // N8/P2=4 ⇒ score2 ⇒ T2
    const actVm = window.__dev.aggroDensity();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.aggroDensity({ driveDensity: { players: PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy })), pts: mobPts(3), wipe: true } });   // N3/P4=0.75 <mid ⇒ score0
    const goVm = window.__dev.aggroDensity();
    window.__dev.aggroDensity({ clearDensity: true });
    window.__dev.aggroDensity({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL aggroDensityFind: forageChargePreview con swarm denso (N8/P2=4) ⇒ charge>0 (==aggroDensityBonus); con poca densidad (N3/P4=0.75) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds aggroDensityBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let n = 3; n <= 40; n += 4) vals.push(window.__dev.aggroDensity({ densityProbe: { counts: [n, 0], players: 2 } }).densityProbe.charge);  // load creciente
    return { max: Math.max(...vals), cap: window.__dev.aggroDensity().cap };
  });
  ok("12 ★ SUB-CAP: ninguna densidad produce charge>aggroDensityBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a dense swarm available
  const neutral = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));
    window.__dev.aggroDensity({ enabled: true });
    window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(8), wipe: true } });   // swarm denso disponible
    window.__dev.aggroDensity({ enabled: false });                          // now OFF
    const off = window.__dev.aggroDensity();
    window.__dev.aggroDensity({ enabled: true }); window.__dev.aggroDensity({ clearDensity: true }); window.__dev.aggroDensity({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, load: off.load };
  }, { Z, POS, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.load === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, aggroDensityBonus(swarm denso disponible)==0 + forageChargePreview==0 + idx==0 + load==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroMargin/aggroPile/aggroContest/targetSpread/aggroFocus no cambia la señal de aggroDensity.
  const orth = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));
    window.__dev.aggroDensity({ enabled: true });
    window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(8), wipe: true } }).driveDensity;
    const snap = () => JSON.stringify({ aggroMargin: window.__dev.aggroMargin(), aggroPile: window.__dev.aggroPile(), aggroContest: window.__dev.aggroContest(), targetSpread: window.__dev.targetSpread(), aggroFocus: window.__dev.aggroFocus() });
    const peersOn = snap();
    const amPrev = window.__dev.aggroMargin().enabled, apPrev = window.__dev.aggroPile().enabled, acPrev = window.__dev.aggroContest().enabled, tsPrev = window.__dev.targetSpread().enabled, afPrev = window.__dev.aggroFocus().enabled;
    window.__dev.aggroMargin({ enabled: !amPrev }); window.__dev.aggroPile({ enabled: !apPrev }); window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.targetSpread({ enabled: !tsPrev }); window.__dev.aggroFocus({ enabled: !afPrev });
    const after = window.__dev.aggroDensity({ densityProbeLive: true }).densityProbeLive;
    window.__dev.aggroMargin({ enabled: amPrev }); window.__dev.aggroPile({ enabled: apPrev }); window.__dev.aggroContest({ enabled: acPrev }); window.__dev.targetSpread({ enabled: tsPrev }); window.__dev.aggroFocus({ enabled: afPrev });
    const peersRestored = snap();
    window.__dev.aggroDensity({ clearDensity: true });
    window.__dev.aggroDensity({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && Math.abs(before.load - after.load) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeLoad: before.load, afterLoad: after.load };
  }, { Z, POS, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD aggroDensityFind ⊥ peers: la señal de avalancha (score/load) NO cambia al togglear AGGRO-MARGIN #125/AGGRO-PILE #124/AGGRO-CONTEST #123/TARGET-SPREAD #121/AGGRO-FOCUS #118; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION: 67 arc flags served true; AGGRO_DENSITY_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE", "JERK_DIR_SURGE", "STRIKE_COMMIT_SURGE", "TARGET_SPREAD_SURGE", "AGGRO_SWITCH_SURGE", "AGGRO_CONTEST_SURGE", "AGGRO_PILE_SURGE", "AGGRO_MARGIN_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const adDark = flag("AGGRO_DENSITY_SURGE") === "false";
  ok("15 ★ 0-REGRESIÓN: 67 mecanismos del arco #59-#125 served enabled:true; AGGRO_DENSITY_SURGE served false (DARK #126)",
     arcAllOn && adDark && arc.length === 67, `aggroDensity=${flag("AGGRO_DENSITY_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 16 render badge "Avalancha:" drawn ON+dense / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(8), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Avalancha:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.aggroDensity({ enabled: true });
    window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee aggroDensityVM en vivo; el loop rAF re-tickea la IA ⇒ re-inyecta los mobs cada frame para probar el DIBUJO en estado denso.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.aggroDensity({ clearDensity: true });
    window.__dev.aggroDensity({ enabled: false });
    const enAtOff = window.__dev.aggroDensity().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, POS, PLAYER_OFF });
  ok("16 render badge \"Avalancha:\" se DIBUJA ON+dense (D>0, re-driven cada frame) y NO OFF (D 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS, PLAYER_OFF } = args; const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" })); const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy })); window.__dev.aggroDensity({ enabled: true }); window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(8), wipe: true } }); }, { Z, POS, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.aggroDensity({ clearDensity: true }); window.__dev.aggroDensity({ enabled: false }); });

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
    const mobPts = (n) => Array.from({ length: n }, (_, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase" }));
    const players = PLAYER_OFF.slice(0, 1).map(([dx, dy]) => ({ dx, dy }));   // P2, N6 ⇒ 6/2=3 ⇒ some ⇒ 1, D=0.5
    window.__dev.aggroDensity({ enabled: true });
    window.__dev.aggroDensity({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.aggroDensity({ driveDensity: { players, pts: mobPts(6), wipe: true } }).driveDensity;
    const vm = window.__dev.aggroDensity();
    const lut = [[[1, 1, 1, 1], 4], [[6, 6, 6, 6], 4], [[8, 0, 0, 0], 4], [[2, 2, 2, 2], 4]].map(([counts, P]) => { const m = window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe; return { counts, P, load: m.load, d: m.density, tier: m.tier, charge: m.charge }; });
    const live = window.__dev.aggroDensity({ densityProbeLive: true }).densityProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.aggroDensity({ clearDensity: true });
    window.__dev.aggroDensity({ enabled: false });
    return { score: dv.score, idx: dv.idx, load: dv.load, tier: vm.tier, charge: vm.charge, liveField: live.field, liveLoad: live.load, liveScore: live.score, engaged: live.engaged, players: live.players, lut, fp };
  }, { Z, FPARG, POS, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.load === B.load && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveLoad === B.liveLoad && A.liveScore === B.liveScore && A.engaged === B.engaged && A.players === B.players && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE: MISMA party+mobs (P2, N6, load3, D=0.5 some)+héroe ⇒ score/idx/load/tier/charge + densityProbeLive(field,load,engaged,players,score) + densityProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},load:${A.load},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveLoad:${A.liveLoad},engaged:${A.engaged},players:${A.players},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},load:${B.load},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveLoad:${B.liveLoad},engaged:${B.engaged},players:${B.players},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.aggroDensity({ enabled: false }));
  await pageB.evaluate(() => window.__dev.aggroDensity({ enabled: false }));

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
