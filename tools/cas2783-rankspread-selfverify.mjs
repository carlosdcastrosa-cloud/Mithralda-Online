// CAS-2783 — self-verify for BRECHA (DARK, RANK_SPREAD_SURGE.enabled:false). EVO mecánica #135 (base master 7dca0983 tras #134 ELITE_SHARE LIVE&served 1b6b45728268/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 76 LIVE #59-#134. El 17º eje de COMPOSICIÓN-DE-INTENCIÓN y 3º/CIERRE de la sub-familia MOB-POWER-RATING (tras #133 RETO=media y #134 CASTA=fracción): cuán SEPARADOS están los tiers de poder del pack ENGANCHADO (DISPERSIÓN/RANGO — R=maxRank−minRank).
// (A) EJE FRESCO = BRECHA/RANK-SPREAD = R = maxRank − minRank sobre el pack VIVO ENGANCHADO en radio (requiere N≥minMobs y party P≥minPlayers). mobTierRank = la MISMA ESCALERA server-auth de #133/#134 (boss/capstone=4 > champion/champElite=3 > elite=2 > afijo=1 > normal=0), pero como RANGO/DISPERSIÓN, NO media (#133) ni fracción (#134). SNAPSHOT PURO (lee el rango replicado del mob directo, SIN buffer temporal). 🔑 DETERMINISMO (sev-1) — el MÁS LIMPIO del arco: R=maxR−minR es RESTA ENTERA de dos rangos ENTEROS vs umbrales ENTEROS {midSpread2,hiSpread3} ⇒ 0-float en el score/decisión. Bandas sobre R: ≥hiSpread(3) ⇒ brecha-amplia ⇒ 2; ≥midSpread(2) ⇒ amenaza-mixta ⇒ 1; <2 (uniforme) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ P<2 ⇒ R=0 (colapso LIMPIO).
// (B) CANAL FRESCO = rankSpreadFind (fichas de brecha por comprometer/rematar contra un pack de AMENAZA-MIXTA — NINGUNA de las 76 flags lo usa). Moneda FRESCA (h.rankSpreadBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA / FLAGSHIP) — BRECHA ⊥ #133 RETO Y #134 CASTA SIMULTÁNEAMENTE: RETO lee mean(rank)/cap; CASTA lee count(rank≥eliteRank)/N; BRECHA lee maxRank−minRank. {4,2,0} vs {3,3,0} ⇒ MISMA media RETO (2) + MISMA fracción-élite CASTA (2/3) pero R=4 vs R=3 (dispersión OPUESTA — misma magnitud, misma fracción, distinta separación). {4,0,0} (R=4) vs {2,2,2} (R=0) ⇒ RETO mean 1.33 vs 2, CASTA 1/3 vs 3/3, BRECHA máx vs cero: los TRES ejes discrepan. ⊥#127 VARIETY (tipo)/⊥#126 DENSITY (N)/⊥#131 VIGOR (HP).
//
// Run: node tools/cas2783-rankspread-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2783");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
// Environmental resource/network LOAD failures (not JS code defects) — the box runs many concurrent chromium/agent processes ⇒ transient asset-load flakes. Filter these from the JS-error gate; genuine pageerror + code console errors still count.
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// spreadProbe LUT esperada: (ranks=rango por mob ∈[0,tierCap], players=P gate)→N=len→maxR/minR→R=maxR−minR→banda(R vs {midSpread2,hiSpread3} ENTEROS)→{weight,rankTier}. UMBRALES hiSpread 3 / midSpread 2 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0).
const EXPECT_SPREAD = [
  { name: "uniform-elite-P2",  ranks: [2, 2, 2],       players: 2, R: 0, w: 0 },   // max2 min2 ⇒ R0 (uniforme) ⇒ 0
  { name: "uniform-boss-P2",   ranks: [4, 4, 4],       players: 2, R: 0, w: 0 },   // R0 ⇒ 0
  { name: "flagship-A-P2",     ranks: [4, 2, 0],       players: 2, R: 4, w: 2 },   // 🔑 CRUX: R=4 (RETO mean2/CASTA 2/3 — igual que flagship-B) ⇒ 2
  { name: "flagship-B-P2",     ranks: [3, 3, 0],       players: 2, R: 3, w: 2 },   // 🔑 CRUX: R=3 (MISMA media RETO 2 + MISMA fracción CASTA 2/3) ⇒ 2, pero R distinto (3≠4)
  { name: "apex-only-P2",      ranks: [4, 0, 0],       players: 2, R: 4, w: 2 },   // 🔑 R=4 (RETO mean1.33/CASTA 1/3 daría w0) ⇒ 2 — los tres ejes discrepan
  { name: "mid-P2",            ranks: [2, 1, 0],       players: 2, R: 2, w: 1 },   // max2 min0 ⇒ R2 (amenaza-mixta) ⇒ 1
  { name: "near-uniform-P2",   ranks: [1, 0, 0],       players: 2, R: 1, w: 0 },   // R1 <midSpread2 ⇒ 0
  { name: "wide-N4-P2",        ranks: [4, 3, 2, 0],    players: 2, R: 4, w: 2 },   // max4 min0 ⇒ R4 ⇒ 2
  { name: "mid-N4-P4",         ranks: [3, 2, 2, 1],    players: 4, R: 2, w: 1 },   // max3 min1 ⇒ R2 ⇒ 1
  { name: "no-pack-N2",        ranks: [4, 0],          players: 2, R: 0, w: 0 },   // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { name: "single-player",     ranks: [4, 2, 0],       players: 1, R: 0, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// ladderProbe: escalera boolean→rango ENTERO (reusa mobTierRank de #133/#134). boss/capstone=4 > champion/champElite=3 > elite=2 > afijo=1 > normal=0.
const EXPECT_LADDER = [
  { name: "boss",      flags: { isBoss: true },     rank: 4 },
  { name: "capstone",  flags: { capstone: true },   rank: 4 },
  { name: "champion",  flags: { champion: true },   rank: 3 },
  { name: "champElite",flags: { champElite: true }, rank: 3 },
  { name: "elite",     flags: { elite: true },      rank: 2 },
  { name: "affix",     flags: { affix: "vamp" },    rank: 1 },
  { name: "normal",    flags: {},                   rank: 0 },
];
// driveSpread REAL: inyecta party sintética (P jugadores) + mobs enganchados con rango por-mob (e._tierRank) inyectado; R server-auth. Requiere ≥minMobs(3) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "wide-P2",         ranks: [4, 2, 0, 0],  players: 2, R: 4, w: 2 },   // max4 min0 ⇒ R4
  { name: "uniform-P2",      ranks: [2, 2, 2, 2],  players: 2, R: 0, w: 0 },   // R0
  { name: "mid-P2",          ranks: [2, 1, 1, 0],  players: 2, R: 2, w: 1 },   // max2 min0 ⇒ R2
  { name: "single-player",   ranks: [4, 2, 0, 0],  players: 1, R: 0, w: 0 },   // 🔑 P1 ⇒ 0
  { name: "no-pack-N2",      ranks: [4, 0],        players: 2, R: 0, w: 0 },   // N2 <minMobs3 ⇒ 0
];
const PLAYER_OFF = [[0, 0], [44, 0], [0, 44], [-44, 0], [30, 30]];   // offsets de jugadores sintéticos (el [0,0] = posición del héroe; dentro de radio 300)

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.rankSpread && window.__dev.eliteShare && window.__dev.mobTier && window.__dev.aggroVariety && window.__dev.aggroDensity && window.__dev.aggroVigor && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.rankSpread + peer hooks (eliteShare/mobTier/aggroVariety/aggroDensity/aggroVigor) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.rankSpread());
  ok("2 byte-id OFF (fresh boot): RANK_SPREAD_SURGE.enabled false AND G.rankSpreadBounty NUNCA se crea (gExists false) AND G._rankSpreadParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.players === 0 && dark.engaged === 0 && dark.spread === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "rankSpreadFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} engaged=${dark.engaged} spread=${dark.spread} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiSpread=${dark.hiSpread} midSpread=${dark.midSpread} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no rankSpreadFind/rankSpreadBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(rankSpreadFind|rankSpreadBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"rankSpreadBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'rankSpreadFind'/'rankSpreadBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.rankSpread({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.rankSpread({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ spreadProbe LUT: (ranks=rango por mob,players=P)→N→maxR/minR→R=maxR−minR→banda(R vs {2,3} ENTEROS)→tier→charge (UMBRALES hiSpread/midSpread + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.rankSpread({ spreadProbe: { ranks: c.ranks, players: c.players } }).spreadProbe), EXPECT_SPREAD);
  const tabOK = EXPECT_SPREAD.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].spread === c.R);
  ok("5 ★ spreadProbe LUT (BRECHA R=maxR−minR): uniform{2,2,2}(R0)⇒0, flagshipA{4,2,0}(R4)⇒2, flagshipB{3,3,0}(R3)⇒2, apex{4,0,0}(R4)⇒2, mid{2,1,0}(R2)⇒1, near-uniform{1,0,0}(R1)⇒0, wide{4,3,2,0}(R4)⇒2, no-pack(N2)⇒0, single-player⇒0. UMBRAL hiSpread 3/midSpread 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_SPREAD[i].name, p: x.players, R: x.spread, mx: x.maxR, mn: x.minR, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5b ★ ladderProbe: escalera boolean→rango ENTERO (reusa mobTierRank).
  const lad = await page.evaluate((cases) => cases.map(c => window.__dev.rankSpread({ ladderProbe: c.flags }).ladderProbe), EXPECT_LADDER);
  const ladOK = EXPECT_LADDER.every((c, i) => lad[i] && lad[i].rank === c.rank);
  ok("5b ★ ladderProbe (ESCALERA reusada de #133/#134): boss/capstone=4, champion/champElite=3, elite=2, afijo=1, normal=0",
     ladOK, JSON.stringify(lad.map((x, i) => ({ nm: EXPECT_LADDER[i].name, rank: x.rank }))));

  // 5c ★ REAL SERVER-AUTH BRECHA: driveSpread inyecta party sintética + mobs enganchados con rango por-mob dado ⇒ R REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.rankSpread({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.rankSpread({ driveSpread: { players: partyN(c.players), pts: mobPtsRanks(c.ranks), wipe: true } }).driveSpread;
      const live = window.__dev.rankSpread({ spreadProbeLive: true }).spreadProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvSpread: dv.spread, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveSpread: live.spread, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.rankSpread({ clearSpread: true });
    window.__dev.rankSpread({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w);
  ok("5c ★ REAL SERVER-AUTH BRECHA (hero+mob rank snapshot): wide{4,2,0,0}(P2)=w2, uniform{2,2,2,2}(P2)=w0, mid{2,1,1,0}(P2)=w1, single-player(P1)=0, no-pack(N2<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA / FLAGSHIP) ⊥#133 RETO Y ⊥#134 CASTA SIMULTÁNEAMENTE: RETO=mean, CASTA=fracción, BRECHA=rango ⇒ DISOCIAN por AGREGACIÓN.
  const crux = await page.evaluate(() => {
    const spread = (ranks, P) => window.__dev.rankSpread({ spreadProbe: { ranks, players: P } }).spreadProbe;
    const retoW = (ranks, P) => window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe.weight;
    const castaW = (ranks, P) => window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe.weight;
    // FLAGSHIP: {4,2,0} vs {3,3,0} — MISMA media RETO (2) + MISMA fracción CASTA (2/3) pero SPREAD R=4 vs R=3
    const A = { sp: spread([4, 2, 0], 2), reto: retoW([4, 2, 0], 2), casta: castaW([4, 2, 0], 2) };
    const B = { sp: spread([3, 3, 0], 2), reto: retoW([3, 3, 0], 2), casta: castaW([3, 3, 0], 2) };
    // SEGUNDO: {4,0,0} (R4/w2) vs {2,2,2} (R0/w0) — los TRES ejes discrepan
    const C = { sp: spread([4, 0, 0], 2), reto: retoW([4, 0, 0], 2), casta: castaW([4, 0, 0], 2) };
    const D = { sp: spread([2, 2, 2], 2), reto: retoW([2, 2, 2], 2), casta: castaW([2, 2, 2], 2) };
    return { A, B, C, D };
  });
  const cruxOK =
    crux.A.sp.spread === 4 && crux.B.sp.spread === 3                                   // BRECHA DIFERENTE (4 vs 3)
    && crux.A.reto === crux.B.reto && crux.A.casta === crux.B.casta                    // RETO IDÉNTICO + CASTA IDÉNTICO ({4,2,0} == {3,3,0})
    && crux.A.sp.weight === 2 && crux.B.sp.weight === 2                                // ambos brecha-amplia
    && crux.C.sp.spread === 4 && crux.C.sp.weight === 2 && crux.D.sp.spread === 0 && crux.D.sp.weight === 0   // {4,0,0} R4/w2 vs {2,2,2} R0/w0
    && crux.C.reto !== crux.D.reto && crux.C.casta !== crux.D.casta;                   // los tres discrepan en el segundo par
  ok("6 ★ CRUX (LA CRÍTICA / FLAGSHIP) ⊥#133 RETO Y ⊥#134 CASTA SIMULTÁNEAMENTE: {4,2,0} vs {3,3,0} ⇒ MISMO RETO (mean2) + MISMA CASTA (2/3) pero BRECHA R=4 vs R=3; {4,0,0} (R4/w2) vs {2,2,2} (R0/w0) ⇒ los TRES ejes discrepan ⇒ DISOCIA por AGREGACIÓN (media vs fracción vs rango)",
     cruxOK, JSON.stringify(crux));

  // 6b ★ CRUX ⊥#127 VARIETY (RANGO-DISPERSIÓN ⊥ MOB-TYPE): BRECHA lee el RANGO, VARIETY el nº de TIPOS K ⇒ DISOCIAN.
  const cruxVar = await page.evaluate(() => {
    const spreadW = (ranks, P) => window.__dev.rankSpread({ spreadProbe: { ranks, players: P } }).spreadProbe.weight;
    const varW = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe.weight;
    const wideSpread = spreadW([4, 0, 0], 2);          // ápice+relleno mismo tipo ⇒ R4 ⇒ 2
    const wideVar = varW(["orc", "orc", "orc"], 2);    // K=1 ⇒ variety lo ⇒ 0
    const uniSpread = spreadW([2, 2, 2], 2);           // 3 idénticos ⇒ R0 ⇒ 0
    const uniVar = varW(["wolf", "mage", "bat"], 2);   // K=3 tipos ⇒ variety hi
    return { wideSpread, wideVar, uniSpread, uniVar };
  });
  const cruxVarOK = cruxVar.wideSpread === 2 && cruxVar.uniSpread === 0 && cruxVar.uniVar > cruxVar.wideVar;
  ok("6b ★ CRUX ⊥#127 VARIETY (RANGO-DISPERSIÓN ⊥ MOB-TYPE): pack {4,0,0} mismo-tipo ⇒ BRECHA 2/variety-lo vs pack {2,2,2} 3-tipos ⇒ BRECHA 0/variety-hi ⇒ DISOCIAN (BRECHA lee el RANGO, VARIETY el nº de TIPOS)",
     cruxVarOK, JSON.stringify(cruxVar));

  // 6c ★ CRUX ⊥#126 DENSITY (RANGO ⊥ MAGNITUD N,P): R invariante a N; density crece con conteo. {4,0} vs {4,0,0,0} MISMO R=4.
  const cruxDens = await page.evaluate(() => {
    const spread = (ranks, P) => window.__dev.rankSpread({ spreadProbe: { ranks, players: P } }).spreadProbe;
    const dens = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const big = { sp: spread([4, 0, 0, 0, 0, 0], 4), dens: dens([6], 4) };   // N6, R4 (w2), density hi
    const small = { sp: spread([4, 0, 0], 2), dens: dens([3], 2) };          // N3, R4 (w2), density lo
    return { big, small };
  });
  const cruxDensOK = cruxDens.big.sp.spread === cruxDens.small.sp.spread && cruxDens.big.sp.weight === cruxDens.small.sp.weight && cruxDens.big.sp.weight === 2
    && cruxDens.big.dens >= cruxDens.small.dens;
  ok("6c ★ CRUX ⊥#126 DENSITY (RANGO invariante a N ⊥ MAGNITUD N,P): N6 {4,0,0,0,0,0} ⇒ BRECHA R4/2 density-hi vs N3 {4,0,0} ⇒ BRECHA R4/2 density-lo (R=maxR−minR invariante a N; density crece con conteo) ⇒ DISOCIAN",
     cruxDensOK, JSON.stringify(cruxDens));

  // 6d ★ CRUX ⊥#131 VIGOR (RANGO-INTRÍNSECO ⊥ MOB-HP-STATE): BRECHA lee el RANGO, VIGOR la FRACCIÓN-DE-HP ⇒ DISOCIAN por FUENTE-DE-DATO.
  const cruxVig = await page.evaluate(() => {
    const spreadW = (ranks, P) => window.__dev.rankSpread({ spreadProbe: { ranks, players: P } }).spreadProbe.weight;
    const vigW = (fracs, P) => window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe.weight;
    const wideSpread = spreadW([4, 0, 0], 2);          // brecha R4 ⇒ 2
    const wideVigor = vigW([0.2, 0.2, 0.2], 2);        // 20% HP ⇒ V lo ⇒ 0
    const uniSpread = spreadW([2, 2, 2], 2);           // uniforme R0 ⇒ 0
    const uniVigor = vigW([1, 1, 1], 2);               // full HP ⇒ V hi ⇒ 2
    return { wideSpread, wideVigor, uniSpread, uniVigor };
  });
  const cruxVigOK = cruxVig.wideSpread === 2 && cruxVig.wideVigor === 0 && cruxVig.uniSpread === 0 && cruxVig.uniVigor === 2;
  ok("6d ★ CRUX ⊥#131 VIGOR (RANGO-INTRÍNSECO ⊥ MOB-HP-STATE): pack brecha {4,0,0}@20%HP ⇒ BRECHA 2/VIGOR 0 vs pack uniforme {2,2,2}@full-HP ⇒ BRECHA 0/VIGOR 2 ⇒ DISOCIAN por FUENTE (BRECHA lee el RANGO, VIGOR la FRACCIÓN-DE-HP)",
     cruxVigOK, JSON.stringify(cruxVig));

  // 7 ★ N-INVARIANCE (R = maxR−minR ⊥ nº de mobs N, con los extremos fijos y N≥minMobs): MISMOS extremos, N distinto (≥3) ⇒ MISMO R.
  const nInv = await page.evaluate(() => {
    const t = (ranks, P) => { const m = window.__dev.rankSpread({ spreadProbe: { ranks, players: P } }).spreadProbe; return { R: m.spread, w: m.weight, mobs: m.mobs }; };
    const three = t([4, 2, 0], 2);                       // N3, extremos 4/0 ⇒ R4
    const six = t([4, 2, 2, 1, 0, 0], 2);                // N6, MISMOS extremos 4/0 ⇒ R4
    return { three, six };
  });
  const nInvOK = nInv.three.R === nInv.six.R && nInv.three.w === nInv.six.w && nInv.three.w === 2 && nInv.three.mobs === 3 && nInv.six.mobs === 6;
  ok("7 ★ N-INVARIANCE (R = maxR−minR ⊥ nº de mobs, N≥minMobs): MISMOS extremos 4/0 con N3 vs N6 ⇒ MISMO R=4/score2 (los extremos mandan, no el conteo)",
     nInvOK, JSON.stringify(nInv));

  // 8 ★ P-INVARIANCE (R ⊥ conteo de jugadores P): MISMO pack con P distinto ⇒ MISMO R.
  const pInv = await page.evaluate(() => {
    const t = (ranks, P) => { const m = window.__dev.rankSpread({ spreadProbe: { ranks, players: P } }).spreadProbe; return { R: m.spread, w: m.weight, p: m.players }; };
    const two = t([4, 2, 0], 2);          // P2
    const four = t([4, 2, 0], 4);         // P4 — MISMO R (R no depende de P)
    return { two, four };
  });
  const pInvOK = pInv.two.R === pInv.four.R && pInv.two.w === pInv.four.w && pInv.two.w === 2 && pInv.two.p === 2 && pInv.four.p === 4;
  ok("8 ★ P-INVARIANCE (R ⊥ P): MISMO pack {4,2,0} con P2 vs P4 ⇒ MISMO R=4/score2 (R = brecha de rango del pack, invariante al conteo de jugadores)",
     pInvOK, JSON.stringify(pInv));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismo pack de brecha, SIN party (P=1) ⇒ R=0; CON party (P≥2) ⇒ R>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.rankSpread({ enabled: true });
    const drive = (P) => { window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.rankSpread({ driveSpread: { players: partyN(P), pts: mobPtsRanks([4, 2, 0, 0]), wipe: true } }).driveSpread;
      const live = window.__dev.rankSpread({ spreadProbeLive: true }).spreadProbeLive;
      return { idx: dv.idx, spread: dv.spread, score: dv.score, players: live.players, engaged: live.engaged }; };
    const sp = drive(1);        // single-player: P=1 ⇒ R=0 (colapso)
    const mp = drive(2);        // multijugador P2 ⇒ R>0/score2 (bien-definido)
    window.__dev.rankSpread({ clearSpread: true });
    window.__dev.rankSpread({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.spread === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 4 && degen.mp.score === 2 && degen.mp.spread === 4;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo pack {4,2,0,0} SIN party (P=1) ⇒ R=0/score0; CON party (P=2) ⇒ R=4/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos spreadProbe idénticos ⇒ R/maxR/minR/w byte-idénticos (resta ENTERA + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.rankSpread({ spreadProbe: { ranks: [4, 1, 2, 3, 0], players: 4 } }).spreadProbe;
    const b = window.__dev.rankSpread({ spreadProbe: { ranks: [4, 1, 2, 3, 0], players: 4 } }).spreadProbe;
    return { a: { R: a.spread, mx: a.maxR, mn: a.minR, w: a.weight }, b: { R: b.spread, mx: b.maxR, mn: b.minR, w: b.weight } };
  });
  const detOK = det.a.R === det.b.R && det.a.mx === det.b.mx && det.a.mn === det.b.mn && det.a.w === det.b.w && det.a.R === 4;
  ok("10 ★ INTEGER-DETERMINISM: spreadProbe repetido ⇒ R/maxR/minR/weight byte-idénticos (RESTA ENTERA maxR−minR + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL rankSpreadFind: forageChargePreview con pack de brecha >0 ; uniforme → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.rankSpread({ enabled: true });
    window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.rankSpread({ driveSpread: { players: partyN(2), pts: mobPtsRanks([4, 2, 0, 0]), wipe: true } });   // brecha-amplia ⇒ score2
    const actVm = window.__dev.rankSpread();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.rankSpread({ driveSpread: { players: partyN(2), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } });   // uniforme ⇒ score0
    const goVm = window.__dev.rankSpread();
    window.__dev.rankSpread({ clearSpread: true });
    window.__dev.rankSpread({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL rankSpreadFind: forageChargePreview pack brecha-amplia (R≥3) ⇒ charge>0 (==rankSpreadBonus); con pack uniforme (R<2) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds rankSpreadBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 10; k++) { const ranks = [4]; for (let i = 1; i < k; i++) ranks.push(0); vals.push(window.__dev.rankSpread({ spreadProbe: { ranks, players: 2 } }).spreadProbe.charge); }  // k mobs: 1 apex + relleno ⇒ R4
    return { max: Math.max(...vals), cap: window.__dev.rankSpread().cap };
  });
  ok("12 ★ SUB-CAP: ningún pack brecha-amplia produce charge>rankSpreadBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full brecha pack available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.rankSpread({ enabled: true });
    window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.rankSpread({ driveSpread: { players: partyN(2), pts: mobPtsRanks([4, 2, 0, 0]), wipe: true } });   // pack brecha-amplia disponible
    window.__dev.rankSpread({ enabled: false });                          // now OFF
    const off = window.__dev.rankSpread();
    window.__dev.rankSpread({ enabled: true }); window.__dev.rankSpread({ clearSpread: true }); window.__dev.rankSpread({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, players: off.players, engaged: off.engaged, spread: off.spread };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.players === 0 && neutral.engaged === 0 && neutral.spread === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, rankSpreadBonus(pack brecha-amplia disponible)==0 + forageChargePreview==0 + idx==0 + players==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling mobTier/eliteShare/aggroVigor/aggroVariety/aggroDensity no cambia la señal de rankSpread.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.rankSpread({ enabled: true });
    window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.rankSpread({ driveSpread: { players: partyN(2), pts: mobPtsRanks([4, 2, 0, 0]), wipe: true } }).driveSpread;
    const snap = () => JSON.stringify({ mobTier: window.__dev.mobTier(), eliteShare: window.__dev.eliteShare(), aggroVigor: window.__dev.aggroVigor(), aggroVariety: window.__dev.aggroVariety(), aggroDensity: window.__dev.aggroDensity() });
    const peersOn = snap();
    const mtPrev = window.__dev.mobTier().enabled, esPrev = window.__dev.eliteShare().enabled, avPrev = window.__dev.aggroVigor().enabled, avaPrev = window.__dev.aggroVariety().enabled, adPrev = window.__dev.aggroDensity().enabled;
    window.__dev.mobTier({ enabled: !mtPrev }); window.__dev.eliteShare({ enabled: !esPrev }); window.__dev.aggroVigor({ enabled: !avPrev }); window.__dev.aggroVariety({ enabled: !avaPrev }); window.__dev.aggroDensity({ enabled: !adPrev });
    const after = window.__dev.rankSpread({ spreadProbeLive: true }).spreadProbeLive;
    window.__dev.mobTier({ enabled: mtPrev }); window.__dev.eliteShare({ enabled: esPrev }); window.__dev.aggroVigor({ enabled: avPrev }); window.__dev.aggroVariety({ enabled: avaPrev }); window.__dev.aggroDensity({ enabled: adPrev });
    const peersRestored = snap();
    window.__dev.rankSpread({ clearSpread: true });
    window.__dev.rankSpread({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged && before.spread === after.spread;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeSpread: before.spread, afterSpread: after.spread };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD rankSpreadFind ⊥ peers: la señal de brecha (score/engaged/spread) NO cambia al togglear MOB-TIER #133/ELITE-SHARE #134/AGGRO-VIGOR #131/AGGRO-VARIETY #127/AGGRO-DENSITY #126; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 63 `_SURGE` totales, sole-false = RANK_SPREAD (62 true, incl. ELITE_SHARE #134 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const eliteShareLive = census.find(([n]) => n === "ELITE_SHARE_SURGE");
  const censusOK = total === 63 && trues === 62 && falses.length === 1 && falses[0] === "RANK_SPREAD_SURGE" && eliteShareLive && eliteShareLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 63 `_SURGE` totales, 62 enabled:true (incl. ELITE_SHARE_SURGE #134 LIVE), sole-false = RANK_SPREAD_SURGE (DARK #135)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} eliteShare=${eliteShareLive ? eliteShareLive[1] : "?"}`);

  // 16 render badge "Brecha:" drawn ON+brecha / not OFF + fps. 🔑 label ÚNICO "Brecha:" (⊥ #133 'Reto:'/#134 'Casta:'/#131 'Brío:'/#132 'Temple:').
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    const drive = () => window.__dev.rankSpread({ driveSpread: { players: partyN(2), pts: mobPtsRanks([4, 2, 0, 0]), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Brecha:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.rankSpread({ enabled: true });
    window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.rankSpread({ clearSpread: true });
    window.__dev.rankSpread({ enabled: false });
    const enAtOff = window.__dev.rankSpread().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Brecha:\" se DIBUJA ON+brecha-amplia (R>0, re-driven cada frame) y NO OFF (R 0) + fps sano (label ÚNICO ⊥ #133 'Reto:'/#134 'Casta:'/#131 'Brío:'/#132 'Temple:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r })); const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] })); window.__dev.rankSpread({ enabled: true }); window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.rankSpread({ driveSpread: { players: partyN(2), pts: mobPtsRanks([4, 2, 0, 0]), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.rankSpread({ clearSpread: true }); window.__dev.rankSpread({ enabled: false }); });

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
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.rankSpread({ enabled: true });
    window.__dev.rankSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.rankSpread({ driveSpread: { players: partyN(2), pts: mobPtsRanks([4, 2, 0, 0]), wipe: true } }).driveSpread;   // P2, 4 mobs {4,2,0,0} ⇒ R=4 ⇒ score2
    const vm = window.__dev.rankSpread();
    const lut = [[[4, 2, 0], 2], [[3, 3, 0], 2], [[4, 0, 0], 2], [[2, 2, 2], 2]].map(([ranks, P]) => { const m = window.__dev.rankSpread({ spreadProbe: { ranks, players: P } }).spreadProbe; return { p: m.players, R: m.spread, mx: m.maxR, mn: m.minR, rankTier: m.rankTier, charge: m.charge }; });
    const ladder = [{ isBoss: true }, { champion: true }, { elite: true }, { affix: "x" }, {}].map(f => window.__dev.rankSpread({ ladderProbe: f }).ladderProbe.rank);
    const live = window.__dev.rankSpread({ spreadProbeLive: true }).spreadProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.rankSpread({ clearSpread: true });
    window.__dev.rankSpread({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, spread: dv.spread, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, liveSpread: live.spread, livePlayers: live.players, lut, ladder, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.spread === B.spread && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.liveSpread === B.liveSpread && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.ladder) === JSON.stringify(B.ladder) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO pack P2 + 4 mobs {4,2,0,0} (R=4) ⇒ score/idx/engaged/spread/players/tier/charge + spreadProbeLive(field,engaged,spread,players,score) + spreadProbe LUT (R/maxR/minR enteros) + ladderProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},spread:${A.spread},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveSpread:${A.liveSpread},livePlayers:${A.livePlayers},ladder:${JSON.stringify(A.ladder)},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},spread:${B.spread},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveSpread:${B.liveSpread},livePlayers:${B.livePlayers},ladder:${JSON.stringify(B.ladder)},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.rankSpread({ enabled: false }));
  await pageB.evaluate(() => window.__dev.rankSpread({ enabled: false }));

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
