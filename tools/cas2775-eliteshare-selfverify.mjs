// CAS-2775 — self-verify for CASTA (DARK, ELITE_SHARE_SURGE.enabled:false). EVO mecánica #134 (base master 0062597 tras #133 MOB_TIER LIVE&served edf6508226ba/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 75 LIVE #59-#133. El 16º eje de COMPOSICIÓN-DE-INTENCIÓN y 2º de la sub-familia MOB-POWER-RATING (tras #133 RETO): qué FRACCIÓN del pack ENGANCHADO es genuinamente peligrosa/élite+ (COMPOSICIÓN-PROPORCIÓN — mayoría-élite por composición). #133 RETO lee la MEDIA de la magnitud de poder; CASTA lee la PROPORCIÓN por encima del umbral élite.
// (A) EJE FRESCO = CASTA/ELITE-SHARE = eliteShareField(hero) = S = count(mobs VIVOS ENGANCHADOS con mobTierRank ≥ eliteRank) / N sobre el pack en radio (requiere N≥minMobs y party P≥minPlayers). mobTierRank = la MISMA ESCALERA server-auth de #133 (boss/capstone=4 > champion/champElite=3 > elite=2 > afijo=1 > normal=0), pero como PROPORCIÓN-CON-UMBRAL (eliteRank=2), NO como media. SNAPSHOT PURO (lee el rango replicado del mob directo, SIN buffer temporal, como #129/…/#133). 🔑 DETERMINISMO (sev-1): count ENTERO vs umbrales ⌈k·N⌉ ENTEROS (share·N con k∈{0.5,0.75} producto EXACTO IEEE-754 + Math.ceil ENTERO) ⇒ 0-float division en el score/decisión. Bandas sobre S: ≥hiShare(0.75) ⇒ mayoría-élite ⇒ 2; ≥midShare(0.5) ⇒ casta-parcial ⇒ 1; <mid (poca-élite) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ P<2 ⇒ S=0 (colapso LIMPIO).
// (B) CANAL FRESCO = eliteShareFind (fichas de casta por comprometer/rematar contra un pack MAYORÍA-ÉLITE — NINGUNA de las 75 flags lo usa). Moneda FRESCA (h.eliteShareBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — CASTA ⊥ #133 RETO: RETO lee mean(rank)/cap; CASTA lee la FRACCIÓN por encima del umbral élite. {boss(4),normal(0),normal(0)} ⇒ RETO mean=1.33 (T≈0.33, w0) pero share=1/3 (w0); {elite(2),elite(2),normal(0)} ⇒ MISMA media 1.33/sum4 (RETO w0) pero share=2/3 (w1) — un ápice vs dos élites = MISMA media, share OPUESTO. REVERSO: {4,1,1} ⇒ RETO sum6/mean2 (T0.5, w1) pero share=1/3 (w0) — el ápice INFLA la media, pero la composición es mayoría no-élite. ⊥#127 VARIETY (tipo)/⊥#126 DENSITY (N)/⊥#131 VIGOR (HP).
//
// Run: node tools/cas2775-eliteshare-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2775");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// shareProbe LUT esperada: (ranks=rango por mob ∈[0,tierCap], players=P gate)→N=len→elite=count(rank≥eliteRank 2)→S=elite/N→banda(count vs ⌈k·N⌉ ENTEROS)→{weight,rankTier}. UMBRALES hiShare 0.75 / midShare 0.5 + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0).
const EXPECT_SHARE = [
  { name: "elite-all-P2",    ranks: [2, 2, 2],       players: 2, w: 2 },   // share 3/3=1.0 ⇒ 2
  { name: "boss-all-P2",     ranks: [4, 4, 4],       players: 2, w: 2 },   // share 1.0 ⇒ 2
  { name: "majority-P2",     ranks: [2, 2, 0],       players: 2, w: 1 },   // share 2/3≈0.667 (≥0.5<0.75) ⇒ 1
  { name: "apex-lowshare-P2",ranks: [4, 1, 1],       players: 2, w: 0 },   // 🔑 CRUX: 1 ápice + 2 afijos ⇒ share 1/3 ⇒ 0 (RETO mean2/T0.5 daría w1)
  { name: "minority-P2",     ranks: [2, 0, 0],       players: 2, w: 0 },   // share 1/3 ⇒ 0
  { name: "threeq-N4-P2",    ranks: [2, 2, 2, 0],    players: 2, w: 2 },   // elite3/N4=0.75 ⇒ hi ⇒ 2
  { name: "half-N4-P2",      ranks: [2, 2, 0, 0],    players: 2, w: 1 },   // elite2/N4=0.5 ⇒ mid ⇒ 1
  { name: "mixed-N4-P4",     ranks: [4, 3, 2, 0],    players: 4, w: 2 },   // elite3/N4=0.75 ⇒ hi ⇒ 2 (afijo/normal no cuentan)
  { name: "no-pack-N2",      ranks: [2, 2],          players: 2, w: 0 },   // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { name: "single-player",   ranks: [2, 2, 2],       players: 1, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// ladderProbe: escalera boolean→rango ENTERO (reusa mobTierRank de #133). boss/capstone=4 > champion/champElite=3 > elite=2 > afijo=1 > normal=0. isElite=rank≥eliteRank(2).
const EXPECT_LADDER = [
  { name: "boss",      flags: { isBoss: true },     rank: 4, isElite: true },
  { name: "capstone",  flags: { capstone: true },   rank: 4, isElite: true },
  { name: "champion",  flags: { champion: true },   rank: 3, isElite: true },
  { name: "champElite",flags: { champElite: true }, rank: 3, isElite: true },
  { name: "elite",     flags: { elite: true },      rank: 2, isElite: true },
  { name: "affix",     flags: { affix: "vamp" },    rank: 1, isElite: false },   // 🔑 afijo(1) < eliteRank(2) ⇒ NO cuenta
  { name: "normal",    flags: {},                   rank: 0, isElite: false },
];
// driveShare REAL: inyecta party sintética (P jugadores) + mobs enganchados con rango por-mob (e._tierRank) inyectado; S server-auth. Requiere ≥minMobs(3) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "elite-all-P2",    ranks: [2, 2, 2, 2],  players: 2, w: 2 },   // share 1.0
  { name: "apex-lowshare-P2",ranks: [4, 1, 1, 1],  players: 2, w: 0 },   // 🔑 REVERSO CRUX: ápice infla media pero share=1/4 ⇒ 0
  { name: "threeq-P2",       ranks: [2, 2, 2, 0],  players: 2, w: 2 },   // share 3/4=0.75 ⇒ hi
  { name: "half-P2",         ranks: [2, 2, 0, 0],  players: 2, w: 1 },   // share 0.5 ⇒ mid
  { name: "single-player",   ranks: [2, 2, 2, 2],  players: 1, w: 0 },   // 🔑 P1 ⇒ 0
  { name: "no-pack-N2",      ranks: [2, 2],        players: 2, w: 0 },   // N2 <minMobs3 ⇒ 0
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
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.eliteShare && window.__dev.mobTier && window.__dev.partyVital && window.__dev.aggroVigor && window.__dev.aggroVariety && window.__dev.aggroDensity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.eliteShare + peer hooks (mobTier/partyVital/aggroVigor/aggroVariety/aggroDensity) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.eliteShare());
  ok("2 byte-id OFF (fresh boot): ELITE_SHARE_SURGE.enabled false AND G.eliteShareBounty NUNCA se crea (gExists false) AND G._eliteShareParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.players === 0 && dark.engaged === 0 && dark.elite === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "eliteShareFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} engaged=${dark.engaged} elite=${dark.elite} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiShare=${dark.hiShare} midShare=${dark.midShare} eliteRank=${dark.eliteRank} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no eliteShareFind/eliteShareBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(eliteShareFind|eliteShareBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"eliteShareBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'eliteShareFind'/'eliteShareBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.eliteShare({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.eliteShare({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ shareProbe LUT: (ranks=rango por mob,players=P)→N→elite=count(rank≥eliteRank)→S=elite/N→banda(count vs ⌈k·N⌉ ENTEROS)→tier→charge (UMBRALES hiShare/midShare + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.eliteShare({ shareProbe: { ranks: c.ranks, players: c.players } }).shareProbe), EXPECT_SHARE);
  const tabOK = EXPECT_SHARE.every((c, i) => tab[i] && tab[i].weight === c.w);
  ok("5 ★ shareProbe LUT (FRACCIÓN-ÉLITE S=count(rank≥2)/N): elite-all(share1.0)⇒2, boss-all⇒2, majority(2/3)⇒1, apex-lowshare{4,1,1}(1/3)⇒0 (RETO daría w1), minority(1/3)⇒0, threeq(0.75)⇒2, half(0.5)⇒1, mixed{4,3,2,0}(3/4)⇒2, no-pack(N2)⇒0, single-player⇒0. UMBRAL hiShare 0.75/midShare 0.5",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_SHARE[i].name, p: x.players, S: x.share, el: x.elite, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5b ★ ladderProbe: escalera boolean→rango ENTERO (reusa mobTierRank). isElite = rank≥eliteRank(2): afijo(1)/normal(0) NO cuentan.
  const lad = await page.evaluate((cases) => cases.map(c => window.__dev.eliteShare({ ladderProbe: c.flags }).ladderProbe), EXPECT_LADDER);
  const ladOK = EXPECT_LADDER.every((c, i) => lad[i] && lad[i].rank === c.rank && lad[i].isElite === c.isElite);
  ok("5b ★ ladderProbe (ESCALERA reusada de #133 + umbral élite): boss/capstone=4 (élite), champion/champElite=3 (élite), elite=2 (élite), afijo=1 (NO élite), normal=0 (NO élite) — count sólo suma rank≥eliteRank(2)",
     ladOK, JSON.stringify(lad.map((x, i) => ({ nm: EXPECT_LADDER[i].name, rank: x.rank, isElite: x.isElite }))));

  // 5c ★ REAL SERVER-AUTH CASTA: driveShare inyecta party sintética + mobs enganchados con rango por-mob dado ⇒ S REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.eliteShare({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.eliteShare({ driveShare: { players: partyN(c.players), pts: mobPtsRanks(c.ranks), wipe: true } }).driveShare;
      const live = window.__dev.eliteShare({ shareProbeLive: true }).shareProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvElite: dv.elite, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.eliteShare({ clearShare: true });
    window.__dev.eliteShare({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w);
  ok("5c ★ REAL SERVER-AUTH CASTA (hero+mob rank snapshot): elite-all(P2)=w2, apex{4,1,1,1}(P2)=w0 (REVERSO crux), threeq(0.75,P2)=w2, half(0.5,P2)=w1, single-player(P1)=0, no-pack(N2<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#133 RETO (COMPOSICIÓN-PROPORCIÓN ⊥ MEDIA-DE-TIER): RETO lee mean(rank)/cap; CASTA lee count(rank≥umbral)/N ⇒ DISOCIAN por AGREGACIÓN. Dos direcciones.
  const cruxReto = await page.evaluate(() => {
    const shareW = (ranks, P) => window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe.weight;
    const retoW = (ranks, P) => window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe.weight;
    // Dirección 1: MISMA media 1.33/sum4 (RETO w0 ambos), share OPUESTO
    const apexReto = retoW([4, 0, 0], 2), apexShare = shareW([4, 0, 0], 2);         // ápice: mean1.33/w0 ; share1/3/w0
    const twoEliteReto = retoW([2, 2, 0], 2), twoEliteShare = shareW([2, 2, 0], 2); // dos élites: MISMA mean1.33/w0 ; share2/3/w1
    // Dirección 2 (REVERSO): RETO ilumina (mean2/T0.5/w1), CASTA oscuro (share1/3/w0) — el ápice INFLA la media
    const inflReto = retoW([4, 1, 1], 2), inflShare = shareW([4, 1, 1], 2);         // mean2.0/w1 ; share1/3/w0
    return { apexReto, apexShare, twoEliteReto, twoEliteShare, inflReto, inflShare };
  });
  const cruxRetoOK = cruxReto.apexReto === 0 && cruxReto.twoEliteReto === 0        // RETO IDÉNTICO (misma media/sum) para {4,0,0} y {2,2,0}
    && cruxReto.apexShare === 0 && cruxReto.twoEliteShare === 1                     // CASTA DIFERENTE ({4,0,0} 0 vs {2,2,0} 1) — la fracción ilumina sólo con dos élites
    && cruxReto.inflReto === 1 && cruxReto.inflShare === 0;                         // REVERSO: {4,1,1} RETO 1 / CASTA 0 (ápice infla media, composición mayoría no-élite)
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#133 RETO (PROPORCIÓN ⊥ MEDIA): {4,0,0} y {2,2,0} ⇒ MISMO RETO (w0, misma media/sum4) pero CASTA OPUESTO (0 vs 1, share 1/3 vs 2/3); REVERSO {4,1,1} ⇒ RETO 1 (mean2)/CASTA 0 (share 1/3) ⇒ DISOCIAN por AGREGACIÓN (media vs fracción-con-umbral)",
     cruxRetoOK, JSON.stringify(cruxReto));

  // 6b ★ CRUX ⊥#127 VARIETY (PROPORCIÓN-DE-RANGO ⊥ MOB-TYPE): CASTA lee el RANGO, VARIETY el nº de TIPOS K ⇒ DISOCIAN. 3 élites idénticos (share hi, variety lo) vs 3 mixtos no-élite (share lo, variety hi).
  const cruxVar = await page.evaluate(() => {
    const shareW = (ranks, P) => window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe.weight;
    const varW = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe.weight;
    const eliteShare = shareW([2, 2, 2], 2);            // 3 élites idénticos ⇒ share1.0 ⇒ 2
    const eliteVar = varW(["orc", "orc", "orc"], 2);   // K=1 ⇒ variety lo ⇒ 0
    const mixedShare = shareW([0, 0, 0], 2);           // 3 normales ⇒ share0 ⇒ 0
    const mixedVar = varW(["wolf", "mage", "bat"], 2); // K=3 tipos ⇒ variety hi
    return { eliteShare, eliteVar, mixedShare, mixedVar };
  });
  const cruxVarOK = cruxVar.eliteShare === 2 && cruxVar.mixedShare === 0 && cruxVar.mixedVar > cruxVar.eliteVar;
  ok("6b ★ CRUX ⊥#127 VARIETY (PROPORCIÓN-DE-RANGO ⊥ MOB-TYPE): 3 élites idénticos ⇒ CASTA 2/variety-lo vs 3 mixtos no-élite ⇒ CASTA 0/variety-hi ⇒ DISOCIAN (CASTA lee el RANGO, VARIETY el nº de TIPOS)",
     cruxVarOK, JSON.stringify(cruxVar));

  // 6c ★ CRUX ⊥#126 DENSITY (FRACCIÓN normalizada ⊥ MAGNITUD N,P): S=count/N invariante a N; density crece con conteo.
  const cruxDens = await page.evaluate(() => {
    const share = (ranks, P) => window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe;
    const dens = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const bigElite = { share: share([2, 2, 2, 2, 2, 2], 4), dens: dens([6], 4) };   // N6 todo élite: share1.0 (w2), density hi
    const smallElite = { share: share([2, 2, 2], 2), dens: dens([3], 2) };          // N3 todo élite: share1.0 (w2), density lo
    return { bigElite, smallElite };
  });
  const cruxDensOK = cruxDens.bigElite.share.weight === cruxDens.smallElite.share.weight && cruxDens.bigElite.share.weight === 2
    && cruxDens.bigElite.dens >= cruxDens.smallElite.dens;
  ok("6c ★ CRUX ⊥#126 DENSITY (FRACCIÓN normalizada ⊥ MAGNITUD N,P): N6-élite ⇒ CASTA 2/density-hi vs N3-élite ⇒ CASTA 2/density-lo (S=fracción invariante a N,P; density crece con conteo) ⇒ DISOCIAN",
     cruxDensOK, JSON.stringify(cruxDens));

  // 6d ★ CRUX ⊥#131 VIGOR (RANGO-INTRÍNSECO ⊥ MOB-HP-STATE): CASTA lee el RANGO, VIGOR la FRACCIÓN-DE-HP ⇒ DISOCIAN por FUENTE-DE-DATO. pack élite al 20% HP (share hi, V lo) vs pack normal a full-HP (share lo, V hi).
  const cruxVig = await page.evaluate(() => {
    const shareW = (ranks, P) => window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe.weight;
    const vigW = (fracs, P) => window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe.weight;
    const eliteShare = shareW([2, 2, 2], 2);           // 3 élites (share1.0) ⇒ 2
    const eliteVigor = vigW([0.2, 0.2, 0.2], 2);       // 20% HP ⇒ V lo ⇒ 0
    const normalShare = shareW([0, 0, 0], 2);          // 3 normales (share0) ⇒ 0
    const normalVigor = vigW([1, 1, 1], 2);            // full HP ⇒ V hi ⇒ 2
    return { eliteShare, eliteVigor, normalShare, normalVigor };
  });
  const cruxVigOK = cruxVig.eliteShare === 2 && cruxVig.eliteVigor === 0 && cruxVig.normalShare === 0 && cruxVig.normalVigor === 2;
  ok("6d ★ CRUX ⊥#131 VIGOR (RANGO-INTRÍNSECO ⊥ MOB-HP-STATE): pack élite@20%HP ⇒ CASTA 2/VIGOR 0 vs pack normal@full-HP ⇒ CASTA 0/VIGOR 2 ⇒ DISOCIAN por FUENTE (CASTA lee el RANGO, VIGOR la FRACCIÓN-DE-HP)",
     cruxVigOK, JSON.stringify(cruxVig));

  // 7 ★ N-INVARIANCE (S = fracción ⊥ nº de mobs N, con la fracción fija y N≥minMobs): MISMA fracción, N distinto (≥3) ⇒ MISMO S.
  const nInv = await page.evaluate(() => {
    const t = (ranks, P) => { const m = window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe; return { S: m.share, w: m.weight, mobs: m.mobs }; };
    const three = t([2, 2, 0], 2);                        // N3, 2/3 élite
    const six = t([2, 2, 2, 2, 0, 0], 2);                 // N6, 4/6=2/3 élite — MISMA fracción
    return { three, six };
  });
  const nInvOK = nInv.three.S === nInv.six.S && nInv.three.w === nInv.six.w && nInv.three.w === 1 && nInv.three.mobs === 3 && nInv.six.mobs === 6;
  ok("7 ★ N-INVARIANCE (S = fracción ⊥ nº de mobs, N≥minMobs): MISMA fracción 2/3 con N3 vs N6 ⇒ MISMO S=0.667/score1 (la fracción manda, no el conteo)",
     nInvOK, JSON.stringify(nInv));

  // 8 ★ P-INVARIANCE (S ⊥ conteo de jugadores P): MISMO pack con P distinto ⇒ MISMO S.
  const pInv = await page.evaluate(() => {
    const t = (ranks, P) => { const m = window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe; return { S: m.share, w: m.weight, p: m.players }; };
    const two = t([2, 2, 2], 2);          // P2
    const four = t([2, 2, 2], 4);         // P4 — MISMO S (S no depende de P)
    return { two, four };
  });
  const pInvOK = pInv.two.S === pInv.four.S && pInv.two.w === pInv.four.w && pInv.two.w === 2 && pInv.two.p === 2 && pInv.four.p === 4;
  ok("8 ★ P-INVARIANCE (S ⊥ P): MISMO pack élite con P2 vs P4 ⇒ MISMO S=1.0/score2 (S = fracción-élite del pack, invariante al conteo de jugadores)",
     pInvOK, JSON.stringify(pInv));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismo pack élite, SIN party (P=1) ⇒ S=0; CON party (P≥2) ⇒ S>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.eliteShare({ enabled: true });
    const drive = (P) => { window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.eliteShare({ driveShare: { players: partyN(P), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } }).driveShare;
      const live = window.__dev.eliteShare({ shareProbeLive: true }).shareProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged }; };
    const sp = drive(1);        // single-player: P=1 ⇒ S=0 (colapso)
    const mp = drive(2);        // multijugador P2 ⇒ S>0/score2 (bien-definido)
    window.__dev.eliteShare({ clearShare: true });
    window.__dev.eliteShare({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 4 && degen.mp.score === 2 && degen.mp.idx === 1;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo pack élite SIN party (P=1) ⇒ S=0/score0; CON party (P=2) ⇒ S=1.0/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos shareProbe idénticos ⇒ S/elite/w byte-idénticos (count entero + banda de umbrales enteros ⌈k·N⌉, 0-float division en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.eliteShare({ shareProbe: { ranks: [4, 1, 2, 3, 0], players: 4 } }).shareProbe;
    const b = window.__dev.eliteShare({ shareProbe: { ranks: [4, 1, 2, 3, 0], players: 4 } }).shareProbe;
    return { a: { S: a.share, el: a.elite, w: a.weight, hn: a.hiNeed, mn: a.midNeed }, b: { S: b.share, el: b.elite, w: b.weight, hn: b.hiNeed, mn: b.midNeed } };
  });
  const detOK = det.a.S === det.b.S && det.a.el === det.b.el && det.a.w === det.b.w && det.a.hn === det.b.hn && det.a.mn === det.b.mn;
  ok("10 ★ INTEGER-DETERMINISM: shareProbe repetido ⇒ S/elite/weight/hiNeed/midNeed byte-idénticos (count ENTERO + umbrales ⌈k·N⌉ ENTEROS ⇒ 0-float division en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL eliteShareFind: forageChargePreview con pack mayoría-élite >0 ; poca-élite → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.eliteShare({ enabled: true });
    window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.eliteShare({ driveShare: { players: partyN(2), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } });   // mayoría-élite ⇒ score2
    const actVm = window.__dev.eliteShare();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.eliteShare({ driveShare: { players: partyN(2), pts: mobPtsRanks([0, 0, 0, 0]), wipe: true } });   // poca-élite ⇒ score0
    const goVm = window.__dev.eliteShare();
    window.__dev.eliteShare({ clearShare: true });
    window.__dev.eliteShare({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL eliteShareFind: forageChargePreview pack mayoría-élite (S≥0.75) ⇒ charge>0 (==eliteShareBonus); con pack poca-élite (S<0.5) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds eliteShareBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 10; k++) { const ranks = []; for (let i = 0; i < k; i++) ranks.push(4); vals.push(window.__dev.eliteShare({ shareProbe: { ranks, players: 2 } }).shareProbe.charge); }  // k mobs boss ⇒ share1.0
    return { max: Math.max(...vals), cap: window.__dev.eliteShare().cap };
  });
  ok("12 ★ SUB-CAP: ningún pack mayoría-élite produce charge>eliteShareBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full elite pack available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.eliteShare({ enabled: true });
    window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.eliteShare({ driveShare: { players: partyN(2), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } });   // pack mayoría-élite disponible
    window.__dev.eliteShare({ enabled: false });                          // now OFF
    const off = window.__dev.eliteShare();
    window.__dev.eliteShare({ enabled: true }); window.__dev.eliteShare({ clearShare: true }); window.__dev.eliteShare({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, players: off.players, engaged: off.engaged, elite: off.elite };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.players === 0 && neutral.engaged === 0 && neutral.elite === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, eliteShareBonus(pack mayoría-élite disponible)==0 + forageChargePreview==0 + idx==0 + players==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling mobTier/aggroVigor/partyVital/aggroVariety/aggroDensity no cambia la señal de eliteShare.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.eliteShare({ enabled: true });
    window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.eliteShare({ driveShare: { players: partyN(2), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } }).driveShare;
    const snap = () => JSON.stringify({ mobTier: window.__dev.mobTier(), aggroVigor: window.__dev.aggroVigor(), partyVital: window.__dev.partyVital(), aggroVariety: window.__dev.aggroVariety(), aggroDensity: window.__dev.aggroDensity() });
    const peersOn = snap();
    const mtPrev = window.__dev.mobTier().enabled, avPrev = window.__dev.aggroVigor().enabled, pvPrev = window.__dev.partyVital().enabled, avaPrev = window.__dev.aggroVariety().enabled, adPrev = window.__dev.aggroDensity().enabled;
    window.__dev.mobTier({ enabled: !mtPrev }); window.__dev.aggroVigor({ enabled: !avPrev }); window.__dev.partyVital({ enabled: !pvPrev }); window.__dev.aggroVariety({ enabled: !avaPrev }); window.__dev.aggroDensity({ enabled: !adPrev });
    const after = window.__dev.eliteShare({ shareProbeLive: true }).shareProbeLive;
    window.__dev.mobTier({ enabled: mtPrev }); window.__dev.aggroVigor({ enabled: avPrev }); window.__dev.partyVital({ enabled: pvPrev }); window.__dev.aggroVariety({ enabled: avaPrev }); window.__dev.aggroDensity({ enabled: adPrev });
    const peersRestored = snap();
    window.__dev.eliteShare({ clearShare: true });
    window.__dev.eliteShare({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged && before.elite === after.elite;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeElite: before.elite, afterElite: after.elite };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD eliteShareFind ⊥ peers: la señal de casta (score/engaged/elite) NO cambia al togglear MOB-TIER #133/AGGRO-VIGOR #131/PARTY-VITAL #132/AGGRO-VARIETY #127/AGGRO-DENSITY #126; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 62 `_SURGE` totales, sole-false = ELITE_SHARE (61 true, incl. MOB_TIER #133 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const mobTierLive = census.find(([n]) => n === "MOB_TIER_SURGE");
  const censusOK = total === 62 && trues === 61 && falses.length === 1 && falses[0] === "ELITE_SHARE_SURGE" && mobTierLive && mobTierLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 62 `_SURGE` totales, 61 enabled:true (incl. MOB_TIER_SURGE #133 LIVE), sole-false = ELITE_SHARE_SURGE (DARK #134)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} mobTier=${mobTierLive ? mobTierLive[1] : "?"}`);

  // 16 render badge "Casta:" drawn ON+élite / not OFF + fps. 🔑 label ÚNICO "Casta:" (⊥ #133 'Reto:'/#131 'Brío:'/#132 'Temple:').
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    const drive = () => window.__dev.eliteShare({ driveShare: { players: partyN(2), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Casta:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.eliteShare({ enabled: true });
    window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.eliteShare({ clearShare: true });
    window.__dev.eliteShare({ enabled: false });
    const enAtOff = window.__dev.eliteShare().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Casta:\" se DIBUJA ON+mayoría-élite (S>0, re-driven cada frame) y NO OFF (S 0) + fps sano (label ÚNICO ⊥ #133 'Reto:'/#131 'Brío:'/#132 'Temple:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r })); const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] })); window.__dev.eliteShare({ enabled: true }); window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.eliteShare({ driveShare: { players: partyN(2), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.eliteShare({ clearShare: true }); window.__dev.eliteShare({ enabled: false }); });

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
    const mobPtsRanks = (ranks, dist = 120) => ranks.map((r, i) => ({ deg: Math.round(360 * i / Math.max(1, ranks.length)), dist, type: "rat", state: "chase", rank: r }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.eliteShare({ enabled: true });
    window.__dev.eliteShare({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.eliteShare({ driveShare: { players: partyN(2), pts: mobPtsRanks([2, 2, 2, 2]), wipe: true } }).driveShare;   // P2, 4 mobs élite ⇒ S=1.0 ⇒ score2
    const vm = window.__dev.eliteShare();
    const lut = [[[2, 2, 2], 2], [[4, 0, 0], 2], [[2, 2, 0], 2], [[4, 1, 1], 2]].map(([ranks, P]) => { const m = window.__dev.eliteShare({ shareProbe: { ranks, players: P } }).shareProbe; return { p: m.players, S: m.share, el: m.elite, rankTier: m.rankTier, charge: m.charge }; });
    const ladder = [{ isBoss: true }, { champion: true }, { elite: true }, { affix: "x" }, {}].map(f => window.__dev.eliteShare({ ladderProbe: f }).ladderProbe.rank);
    const live = window.__dev.eliteShare({ shareProbeLive: true }).shareProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.eliteShare({ clearShare: true });
    window.__dev.eliteShare({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, elite: dv.elite, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, liveElite: live.elite, livePlayers: live.players, lut, ladder, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.elite === B.elite && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.liveElite === B.liveElite && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.ladder) === JSON.stringify(B.ladder) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO pack P2 + 4 mobs élite (S=1.0) ⇒ score/idx/engaged/elite/players/tier/charge + shareProbeLive(field,engaged,elite,players,score) + shareProbe LUT (S/elite enteros) + ladderProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},elite:${A.elite},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveElite:${A.liveElite},livePlayers:${A.livePlayers},ladder:${JSON.stringify(A.ladder)},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},elite:${B.elite},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveElite:${B.liveElite},livePlayers:${B.livePlayers},ladder:${JSON.stringify(B.ladder)},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.eliteShare({ enabled: false }));
  await pageB.evaluate(() => window.__dev.eliteShare({ enabled: false }));

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
