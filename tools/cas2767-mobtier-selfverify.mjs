// CAS-2767 — self-verify for RETO (DARK, MOB_TIER_SURGE.enabled:false). EVO mecánica #133 (base master c69e63c tras #132 PARTY_VITAL LIVE&served a3468f49fc9f/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 74 LIVE #59-#132. El 15º eje de COMPOSICIÓN-DE-INTENCIÓN y ABRE la sub-familia MOB-POWER-RATING: cuán PELIGROSO POR DISEÑO es el pack ENGANCHADO (su TIER/RANGO-DE-RETO — una propiedad INTRÍNSECA que ningún prior lee). Las flags HP-STATE (#131 VIGOR = HP del mob, #132 TEMPLE = HP del aliado) leen cuánta pelea LE QUEDA; RETO lee el TIER, independiente del HP.
// (A) EJE FRESCO = RETO/MOB-POWER-RATING = mobTierField(hero) = T = mean(mobTierRank)/tierCap sobre los mobs VIVOS ENGANCHADOS en radio (requiere pack presente, N≥minMobs, y party P≥minPlayers). mobTierRank = ESCALERA server-auth boss/capstone=4 > champion/champElite=3 > elite=2 > afijo=1 > normal=0. SNAPSHOT PURO (lee el rango replicado del mob directo, SIN buffer temporal, como #129/#130/#131/#132). 🔑 DETERMINISMO (sev-1): rangos ENTEROS pequeños ⇒ Σ rangos ENTEROS vs umbrales ENTEROS k·tierCap·N/4 ⇒ 0-float division en el score/decisión. Bandas sobre T: ≥hiTier(0.75) ⇒ élite ⇒ 2; ≥midTier(0.5) ⇒ reto-medio ⇒ 1; <mid (basura) ⇒ 0. Requiere ≥minMobs(3) y ≥minPlayers(2). 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ P<2 ⇒ T=0 (colapso LIMPIO).
// (B) CANAL FRESCO = mobTierFind (fichas de reto por comprometer/rematar contra un pack de ALTO TIER — NINGUNA de las 74 flags lo usa). Moneda FRESCA (h.mobTierBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — MOB-POWER-RATING ⊥ TODOS los priores: ⊥#131 VIGOR (MOB-HP-STATE): VIGOR lee la FRACCIÓN-DE-HP, RETO lee el TIER — pack élite al 20% HP (T hi/V lo) vs pack basura a full-HP (T lo/V hi), poder/HP OPUESTO ⊥#127 VARIETY (tipo: 3 élites idénticos T-hi/variety-lo vs 3 mixtos bajo-tier T-lo/variety-hi) ⊥#126 DENSITY (media normalizada: T invariante a N y P).
//
// Run: node tools/cas2767-mobtier-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2767");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// tierProbe LUT esperada: (ranks=rango por mob ∈[0,tierCap], players=P gate)→N=len→Σ rango ENTERO→T=sum/(N·cap)→banda(sumas ENTERAS)→{weight,rankTier}. UMBRALES hiTier 0.75 (sum≥3N) / midTier 0.5 (sum≥2N) + colapso single-player (P<2 ⇒ 0) + minMobs (N<3 ⇒ 0). tierCap=4. Casos elegidos en/cerca de los límites ENTEROS (deterministas).
const EXPECT_TIER = [
  { name: "elite-boss-P2",   ranks: [4, 4, 4],          players: 2, w: 2 },   // pack élite/boss (rank4) ⇒ T=1 ⇒ 2
  { name: "trash-P2",        ranks: [0, 0, 0],          players: 2, w: 0 },   // pack basura (rank0) ⇒ T=0 ⇒ 0 (MISMO N, tier OPUESTO)
  { name: "champion-P2",     ranks: [3, 3, 3],          players: 2, w: 2 },   // pack champion (rank3) ⇒ T=0.75=hiTier ⇒ 2
  { name: "elite-mid-P2",    ranks: [2, 2, 2],          players: 2, w: 1 },   // pack elite (rank2) ⇒ T=0.5=midTier ⇒ 1
  { name: "affix-P2",        ranks: [1, 1, 1],          players: 2, w: 0 },   // pack afijo (rank1) ⇒ T=0.25<mid ⇒ 0
  { name: "mixed-mid-P4",    ranks: [3, 2, 2, 1],       players: 4, w: 1 },   // sum8, N4 ⇒ 2N=8 (=mid), 3N=12 ⇒ T=0.5 ⇒ 1
  { name: "no-pack-N2",      ranks: [4, 4],             players: 2, w: 0 },   // 🔑 N2 <minMobs3 ⇒ degenerado ⇒ 0
  { name: "single-player",   ranks: [4, 4, 4],          players: 1, w: 0 },   // 🔑 single-player (P1) ⇒ degenerado ⇒ 0 (colapso LIMPIO)
];
// ladderProbe: escalera boolean→rango ENTERO (mobTierRank). boss/capstone=4 > champion/champElite=3 > elite=2 > afijo=1 > normal=0.
const EXPECT_LADDER = [
  { name: "boss",      flags: { isBoss: true },     rank: 4 },
  { name: "capstone",  flags: { capstone: true },   rank: 4 },
  { name: "champion",  flags: { champion: true },   rank: 3 },
  { name: "champElite",flags: { champElite: true }, rank: 3 },
  { name: "elite",     flags: { elite: true },      rank: 2 },
  { name: "affix",     flags: { affix: "vamp" },    rank: 1 },
  { name: "normal",    flags: {},                   rank: 0 },
];
// driveTier REAL: inyecta party sintética (P jugadores) + mobs enganchados con rango (e._tierRank) inyectado; T server-auth. Requiere ≥minMobs(3) y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "elite-P2",    rank: 4, mobs: 4, players: 2, w: 2 },
  { name: "trash-P2",    rank: 0, mobs: 4, players: 2, w: 0 },
  { name: "mid-P2",      rank: 2, mobs: 4, players: 2, w: 1 },
  { name: "single-player", rank: 4, mobs: 4, players: 1, w: 0 },   // 🔑 P1 ⇒ 0
  { name: "no-pack-N2",  rank: 4, mobs: 2, players: 2, w: 0 },     // N2 <minMobs3 ⇒ 0
];
const PLAYER_OFF = [[0, 0], [44, 0], [0, 44], [-44, 0], [30, 30]];   // offsets de jugadores sintéticos (el [0,0] = posición del héroe; dentro de radio 300)
// mobPtsRank: n mobs enganchados repartidos angularmente a dist fija con rango dado (posición NO afecta T — reto lee sólo el RANGO del mob; los mobs son el pack).
const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
// party: mapea P a party sintética {dx,dy} (reto IGNORA el HP del jugador — sólo la posición para el gate P).
const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.mobTier && window.__dev.partyVital && window.__dev.aggroVigor && window.__dev.aggroVariety && window.__dev.aggroDensity && window.__dev.aggroPressure && window.__dev.aggroSurround && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.mobTier + peer hooks (partyVital/aggroVigor/aggroVariety/aggroDensity/aggroPressure/aggroSurround) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.mobTier());
  ok("2 byte-id OFF (fresh boot): MOB_TIER_SURGE.enabled false AND G.mobTierBounty NUNCA se crea (gExists false) AND G._tierParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.players === 0 && dark.engaged === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "mobTierFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} engaged=${dark.engaged} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiTier=${dark.hiTier} midTier=${dark.midTier} tierCap=${dark.tierCap} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no mobTierFind/mobTierBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(mobTierFind|mobTierBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"mobTierBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'mobTierFind'/'mobTierBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.mobTier({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.mobTier({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ tierProbe LUT: (ranks=rango por mob,players=P)→N→Σ rango ENTERA→T=sum/(N·cap)→banda(sumas ENTERAS)→tier→charge (UMBRALES hiTier/midTier + colapso single-player + minMobs).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.mobTier({ tierProbe: { ranks: c.ranks, players: c.players } }).tierProbe), EXPECT_TIER);
  const tabOK = EXPECT_TIER.every((c, i) => tab[i] && tab[i].weight === c.w);
  ok("5 ★ tierProbe LUT (RANGO-DE-PODER-medio T=mean(rank)/tierCap): elite/boss(r4)⇒T=1/w2, trash(r0)⇒T=0/w0 (MISMO N3, tier opuesto), champion(r3)⇒T=0.75/w2, elite(r2)⇒T=0.5/w1, affix(r1)⇒T=0.25/w0, mixed-mid⇒w1, no-pack(N2)⇒0, single-player⇒0. UMBRAL hiTier 0.75/midTier 0.5",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_TIER[i].name, p: x.players, T: x.tier, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5b ★ ladderProbe: escalera boolean→rango ENTERO (mobTierRank). boss/capstone=4 > champion/champElite=3 > elite=2 > afijo=1 > normal=0.
  const lad = await page.evaluate((cases) => cases.map(c => window.__dev.mobTier({ ladderProbe: c.flags }).ladderProbe), EXPECT_LADDER);
  const ladOK = EXPECT_LADDER.every((c, i) => lad[i] && lad[i].rank === c.rank);
  ok("5b ★ ladderProbe (ESCALERA server-auth boolean→rango): boss=4, capstone=4, champion=3, champElite=3, elite=2, afijo=1, normal=0 (mobTierRank determinista, el ÚNICO tier-de-poder intrínseco del mob)",
     ladOK, JSON.stringify(lad.map((x, i) => ({ nm: EXPECT_LADDER[i].name, rank: x.rank }))));

  // 5c ★ REAL SERVER-AUTH RETO: driveTier inyecta party sintética + mobs enganchados con rango dado ⇒ T REAL server-auth.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, PLAYER_OFF } = args;
    const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.mobTier({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.mobTier({ driveTier: { players: partyN(c.players), pts: mobPtsRank(c.mobs, c.rank), wipe: true } }).driveTier;
      const live = window.__dev.mobTier({ tierProbeLive: true }).tierProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvEngaged: dv.engaged, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, livePlayers: live.players });
    }
    window.__dev.mobTier({ clearTier: true });
    window.__dev.mobTier({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w);
  ok("5c ★ REAL SERVER-AUTH RETO (hero+mob rank snapshot): elite(r4,P2)=w2, trash(r0,P2)=w0, mid(r2,P2)=w1, single-player(P1)=0, no-pack(N2<minMobs)=0",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#131 VIGOR (MOB-POWER-RATING ⊥ MOB-HP-STATE): RETO lee el TIER intrínseco, VIGOR lee la FRACCIÓN-DE-HP ⇒ DISOCIAN por FUENTE-DE-DATO. pack élite al 20% HP (T hi, V lo = reto real herido) vs pack basura a full-HP (T lo, V hi = trash intacto).
  const cruxVig = await page.evaluate(() => {
    const tierW = (ranks, P) => window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe.weight;
    const vigW = (fracs, P) => window.__dev.aggroVigor({ vigorProbe: { fracs, players: P } }).vigorProbe.weight;
    // pack élite (T hi) al 20% HP (V lo) = "reto real herido"
    const eliteTier = tierW([3, 3, 3], 2);   // rank3 champion ⇒ T=0.75 ⇒ 2
    const eliteVigor = vigW([0.2, 0.2, 0.2], 2);   // 20% HP ⇒ V lo ⇒ 0
    // pack basura (T lo) a full HP (V hi) = "trash intacto"
    const trashTier = tierW([0, 0, 0], 2);   // rank0 normal ⇒ T=0 ⇒ 0
    const trashVigor = vigW([1, 1, 1], 2);   // full HP ⇒ V hi ⇒ 2
    return { eliteTier, eliteVigor, trashTier, trashVigor };
  });
  const cruxVigOK = cruxVig.eliteTier === 2 && cruxVig.eliteVigor === 0      // pack élite (RETO 2) al 20% HP (VIGOR 0)
    && cruxVig.trashTier === 0 && cruxVig.trashVigor === 2;                  // pack basura (RETO 0) a full HP (VIGOR 2)
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#131 VIGOR (MOB-POWER-RATING ⊥ MOB-HP-STATE): pack élite@20%HP ⇒ RETO 2/VIGOR 0 vs pack basura@full-HP ⇒ RETO 0/VIGOR 2 ⇒ DISOCIAN por FUENTE (RETO lee el TIER intrínseco, VIGOR la FRACCIÓN-DE-HP)",
     cruxVigOK, JSON.stringify(cruxVig));

  // 6b ★ CRUX ⊥#127 VARIETY (MOB-POWER-RATING ⊥ MOB-TYPE): RETO lee el RANGO, VARIETY el nº de TIPOS K ⇒ DISOCIAN. 3 élites idénticos (T hi, variety lo) vs 3 mixtos de bajo tier (T lo, variety hi).
  const cruxVar = await page.evaluate(() => {
    const tierW = (ranks, P) => window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe.weight;
    const varW = (types, P) => window.__dev.aggroVariety({ varietyProbe: { types, players: P } }).varietyProbe.weight;
    // 3 élites idénticos (mismo tipo, alto tier): T hi, variety lo
    const eliteTier = tierW([4, 4, 4], 2);
    const eliteVar = varW(["orc", "orc", "orc"], 2);   // K=1 ⇒ variety lo ⇒ 0
    // 3 mixtos de bajo tier (tipos dispares, tier basura): T lo, variety hi
    const mixedTier = tierW([0, 0, 0], 2);
    const mixedVar = varW(["wolf", "mage", "bat"], 2);   // K=3 tipos ⇒ variety hi
    return { eliteTier, eliteVar, mixedTier, mixedVar };
  });
  const cruxVarOK = cruxVar.eliteTier === 2 && cruxVar.mixedTier === 0      // RETO OPUESTO (elite-monotype 2 vs mixed-trash 0)
    && cruxVar.mixedVar > cruxVar.eliteVar;                                 // VARIETY OPUESTO (mixed > monotype)
  ok("6b ★ CRUX ⊥#127 VARIETY (MOB-POWER-RATING ⊥ MOB-TYPE): 3 élites idénticos ⇒ RETO 2/variety-lo vs 3 mixtos de bajo tier ⇒ RETO 0/variety-hi ⇒ DISOCIAN (RETO lee el RANGO, VARIETY el nº de TIPOS)",
     cruxVarOK, JSON.stringify(cruxVar));

  // 6c ★ CRUX ⊥#126 DENSITY (MOB-POWER-RATING ⊥ MAGNITUD N,P): T=media normalizada, invariante a N; density crece con conteo.
  const cruxDens = await page.evaluate(() => {
    const tier = (ranks, P) => window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe;
    const dens = (counts, P) => window.__dev.aggroDensity({ densityProbe: { counts, players: P } }).densityProbe.weight;
    const bigElite = { tier: tier([4, 4, 4, 4, 4, 4], 4), dens: dens([6], 4) };   // N6 élite: T=1 (w2), density hi
    const smallElite = { tier: tier([4, 4, 4], 2), dens: dens([3], 2) };          // N3 élite: T=1 (w2), density lo
    return { bigElite, smallElite };
  });
  const cruxDensOK = cruxDens.bigElite.tier.weight === cruxDens.smallElite.tier.weight && cruxDens.bigElite.tier.weight === 2   // RETO IGUAL (invariante a N,P)
    && cruxDens.bigElite.dens >= cruxDens.smallElite.dens;                                                                       // density MISMA-dirección con conteo
  ok("6c ★ CRUX ⊥#126 DENSITY (MOB-POWER-RATING ⊥ MAGNITUD N,P): N6-élite ⇒ RETO 2/density-hi vs N3-élite ⇒ RETO 2/density-lo (T=media normalizada invariante a N,P; density crece con conteo) ⇒ DISOCIAN",
     cruxDensOK, JSON.stringify(cruxDens));

  // 7 ★ N-INVARIANCE (T = mean rank ⊥ nº de mobs N, mientras N≥minMobs): MISMO tier, N distinto (≥3) ⇒ MISMO T.
  const nInv = await page.evaluate(() => {
    const t = (ranks, P) => { const m = window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe; return { T: m.tier, w: m.weight, mobs: m.mobs }; };
    const three = t([3, 3, 3], 2);              // N3, rank3
    const eight = t([3, 3, 3, 3, 3, 3, 3, 3], 2); // N8, rank3 — MISMO T (media)
    return { three, eight };
  });
  const nInvOK = nInv.three.T === nInv.eight.T && nInv.three.w === nInv.eight.w && nInv.three.w === 2 && nInv.three.mobs === 3 && nInv.eight.mobs === 8;
  ok("7 ★ N-INVARIANCE (T = mean rank ⊥ nº de mobs, N≥minMobs): MISMO pack champion con N3 vs N8 ⇒ MISMO T=0.75/score2 (la media del rango manda, no el conteo)",
     nInvOK, JSON.stringify(nInv));

  // 8 ★ P-INVARIANCE (T ⊥ conteo de jugadores P): MISMO pack con P distinto ⇒ MISMO T.
  const pInv = await page.evaluate(() => {
    const t = (ranks, P) => { const m = window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe; return { T: m.tier, w: m.weight, p: m.players }; };
    const two = t([3, 3, 3], 2);          // P2
    const four = t([3, 3, 3], 4);         // P4 — MISMO T (T no depende de P)
    return { two, four };
  });
  const pInvOK = pInv.two.T === pInv.four.T && pInv.two.w === pInv.four.w && pInv.two.w === 2 && pInv.two.p === 2 && pInv.four.p === 4;
  ok("8 ★ P-INVARIANCE (T ⊥ P): MISMO pack champion con P2 vs P4 ⇒ MISMO T=0.75/score2 (T = media del rango del pack, invariante al conteo de jugadores)",
     pInvOK, JSON.stringify(pInv));

  // 9 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismo pack élite, SIN party (P=1) ⇒ T=0; CON party (P≥2) ⇒ T>0.
  const degen = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.mobTier({ enabled: true });
    const drive = (P) => { window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.mobTier({ driveTier: { players: partyN(P), pts: mobPtsRank(4, 4), wipe: true } }).driveTier;
      const live = window.__dev.mobTier({ tierProbeLive: true }).tierProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players, engaged: live.engaged }; };
    const sp = drive(1);        // single-player: P=1 ⇒ T=0 (colapso)
    const mp = drive(2);        // multijugador P2 ⇒ T>0/score2 (bien-definido)
    window.__dev.mobTier({ clearTier: true });
    window.__dev.mobTier({ enabled: false });
    return { sp, mp };
  }, { Z, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 2 && degen.mp.engaged === 4 && degen.mp.score === 2 && degen.mp.idx > 0.75;
  ok("9 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismo pack élite SIN party (P=1) ⇒ T=0/score0; CON party (P=2) ⇒ T>0.75/score2 ⇒ colapsa LIMPIO y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 10 ★ INTEGER-DETERMINISM: dos tierProbe idénticos ⇒ T/sum/w byte-idénticos (rangos enteros + banda de sumas entera, 0-float division en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.mobTier({ tierProbe: { ranks: [3, 1, 4, 2, 0], players: 4 } }).tierProbe;
    const b = window.__dev.mobTier({ tierProbe: { ranks: [3, 1, 4, 2, 0], players: 4 } }).tierProbe;
    return { a: { T: a.tier, sum: a.sum, w: a.weight }, b: { T: b.tier, sum: b.sum, w: b.weight } };
  });
  const detOK = det.a.T === det.b.T && det.a.sum === det.b.sum && det.a.w === det.b.w;
  ok("10 ★ INTEGER-DETERMINISM: tierProbe repetido ⇒ T/sum/weight byte-idénticos (Σ rangos ENTEROS + banda de sumas entera ⇒ 0-float division en el score/decisión)",
     detOK, JSON.stringify(det));

  // 11 CANAL mobTierFind: forageChargePreview con pack élite >0 ; basura → 0
  const forage = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.mobTier({ enabled: true });
    window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.mobTier({ driveTier: { players: partyN(2), pts: mobPtsRank(4, 4), wipe: true } });   // élite ⇒ score2 ⇒ T2
    const actVm = window.__dev.mobTier();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.mobTier({ driveTier: { players: partyN(2), pts: mobPtsRank(4, 0), wipe: true } });   // basura ⇒ score0
    const goVm = window.__dev.mobTier();
    window.__dev.mobTier({ clearTier: true });
    window.__dev.mobTier({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("11 CANAL mobTierFind: forageChargePreview pack élite (T>0.75) ⇒ charge>0 (==mobTierBonus); con pack basura (T<0.5) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 12 ★ SUB-CAP: charge never exceeds mobTierBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 10; k++) { const ranks = []; for (let i = 0; i < k; i++) ranks.push(4); vals.push(window.__dev.mobTier({ tierProbe: { ranks, players: 2 } }).tierProbe.charge); }  // k mobs boss ⇒ T=1
    return { max: Math.max(...vals), cap: window.__dev.mobTier().cap };
  });
  ok("12 ★ SUB-CAP: ningún pack élite produce charge>mobTierBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 13 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full elite pack available
  const neutral = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.mobTier({ enabled: true });
    window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.mobTier({ driveTier: { players: partyN(2), pts: mobPtsRank(4, 4), wipe: true } });   // pack élite disponible
    window.__dev.mobTier({ enabled: false });                          // now OFF
    const off = window.__dev.mobTier();
    window.__dev.mobTier({ enabled: true }); window.__dev.mobTier({ clearTier: true }); window.__dev.mobTier({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, players: off.players, engaged: off.engaged };
  }, { Z, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.players === 0 && neutral.engaged === 0;
  ok("13 ★ BYTE-NEUTRAL OFF: con OFF, mobTierBonus(pack élite disponible)==0 + forageChargePreview==0 + idx==0 + players==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 14 ★ ORTHOGONALITY: toggling aggroVigor/partyVital/aggroVariety/aggroDensity/aggroPressure/aggroSurround no cambia la señal de mobTier.
  const orth = await page.evaluate((args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.mobTier({ enabled: true });
    window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.mobTier({ driveTier: { players: partyN(2), pts: mobPtsRank(4, 4), wipe: true } }).driveTier;
    const snap = () => JSON.stringify({ aggroVigor: window.__dev.aggroVigor(), partyVital: window.__dev.partyVital(), aggroVariety: window.__dev.aggroVariety(), aggroDensity: window.__dev.aggroDensity(), aggroPressure: window.__dev.aggroPressure(), aggroSurround: window.__dev.aggroSurround() });
    const peersOn = snap();
    const avPrev = window.__dev.aggroVigor().enabled, pvPrev = window.__dev.partyVital().enabled, avaPrev = window.__dev.aggroVariety().enabled, adPrev = window.__dev.aggroDensity().enabled, apPrev = window.__dev.aggroPressure().enabled, asPrev = window.__dev.aggroSurround().enabled;
    window.__dev.aggroVigor({ enabled: !avPrev }); window.__dev.partyVital({ enabled: !pvPrev }); window.__dev.aggroVariety({ enabled: !avaPrev }); window.__dev.aggroDensity({ enabled: !adPrev }); window.__dev.aggroPressure({ enabled: !apPrev }); window.__dev.aggroSurround({ enabled: !asPrev });
    const after = window.__dev.mobTier({ tierProbeLive: true }).tierProbeLive;
    window.__dev.aggroVigor({ enabled: avPrev }); window.__dev.partyVital({ enabled: pvPrev }); window.__dev.aggroVariety({ enabled: avaPrev }); window.__dev.aggroDensity({ enabled: adPrev }); window.__dev.aggroPressure({ enabled: apPrev }); window.__dev.aggroSurround({ enabled: asPrev });
    const peersRestored = snap();
    window.__dev.mobTier({ clearTier: true });
    window.__dev.mobTier({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.engaged === after.engaged;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeEngaged: before.engaged, afterEngaged: after.engaged };
  }, { Z, PLAYER_OFF });
  ok("14 ★ ORTOGONALIDAD mobTierFind ⊥ peers: la señal de reto (score/engaged) NO cambia al togglear AGGRO-VIGOR #131/PARTY-VITAL #132/AGGRO-VARIETY #127/AGGRO-DENSITY #126/AGGRO-PRESSURE #130/AGGRO-SURROUND #129; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION CENSUS: served config — 61 `_SURGE` totales, sole-false = MOB_TIER (60 true, incl. PARTY_VITAL #132 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const partyVitalLive = census.find(([n]) => n === "PARTY_VITAL_SURGE");
  const censusOK = total === 61 && trues === 60 && falses.length === 1 && falses[0] === "MOB_TIER_SURGE" && partyVitalLive && partyVitalLive[1] === "true";
  ok("15 ★ 0-REGRESIÓN CENSUS: served config 61 `_SURGE` totales, 60 enabled:true (incl. PARTY_VITAL_SURGE #132 LIVE), sole-false = MOB_TIER_SURGE (DARK #133)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} partyVital=${partyVitalLive ? partyVitalLive[1] : "?"}`);

  // 16 render badge "Reto:" drawn ON+élite / not OFF + fps. 🔑 label ÚNICO "Reto:" (⊥ #131 'Brío:'/#132 'Temple:').
  const badge = await page.evaluate(async (args) => {
    const { Z, PLAYER_OFF } = args;
    const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    const drive = () => window.__dev.mobTier({ driveTier: { players: partyN(2), pts: mobPtsRank(4, 4), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Reto:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.mobTier({ enabled: true });
    window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.mobTier({ clearTier: true });
    window.__dev.mobTier({ enabled: false });
    const enAtOff = window.__dev.mobTier().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, PLAYER_OFF });
  ok("16 render badge \"Reto:\" se DIBUJA ON+élite (T>0, re-driven cada frame) y NO OFF (T 0) + fps sano (label ÚNICO ⊥ #131 'Brío:'/#132 'Temple:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, PLAYER_OFF } = args; const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank })); const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] })); window.__dev.mobTier({ enabled: true }); window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.mobTier({ driveTier: { players: partyN(2), pts: mobPtsRank(4, 4), wipe: true } }); }, { Z, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.mobTier({ clearTier: true }); window.__dev.mobTier({ enabled: false }); });

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
    const mobPtsRank = (n, rank, dist = 120) => Array.from({ length: n }, (_, i) => ({ deg: Math.round(360 * i / Math.max(1, n)), dist, type: "rat", state: "chase", rank }));
    const partyN = (P) => Array.from({ length: P }, (_, i) => ({ dx: PLAYER_OFF[i % PLAYER_OFF.length][0], dy: PLAYER_OFF[i % PLAYER_OFF.length][1] }));
    window.__dev.mobTier({ enabled: true });
    window.__dev.mobTier({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.mobTier({ driveTier: { players: partyN(2), pts: mobPtsRank(4, 4), wipe: true } }).driveTier;   // P2, 4 mobs boss ⇒ T hi ⇒ score2
    const vm = window.__dev.mobTier();
    const lut = [[[4, 4, 4], 2], [[0, 0, 0], 2], [[2, 2, 2], 2], [[3, 3, 3], 2]].map(([ranks, P]) => { const m = window.__dev.mobTier({ tierProbe: { ranks, players: P } }).tierProbe; return { p: m.players, T: m.tier, sum: m.sum, rankTier: m.rankTier, charge: m.charge }; });
    const ladder = [{ isBoss: true }, { champion: true }, { elite: true }, { affix: "x" }, {}].map(f => window.__dev.mobTier({ ladderProbe: f }).ladderProbe.rank);
    const live = window.__dev.mobTier({ tierProbeLive: true }).tierProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.mobTier({ clearTier: true });
    window.__dev.mobTier({ enabled: false });
    return { score: dv.score, idx: dv.idx, engaged: dv.engaged, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveEngaged: live.engaged, livePlayers: live.players, lut, ladder, fp };
  }, { Z, FPARG, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.engaged === B.engaged && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveEngaged === B.liveEngaged && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.ladder) === JSON.stringify(B.ladder) && A.fp === B.fp;
  ok("17 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO pack P2 + 4 mobs boss (T=hi élite) ⇒ score/idx/engaged/players/tier/charge + tierProbeLive(field,engaged,players,score) + tierProbe LUT (T/sum enteros) + ladderProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},engaged:${A.engaged},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveEngaged:${A.liveEngaged},livePlayers:${A.livePlayers},ladder:${JSON.stringify(A.ladder)},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},engaged:${B.engaged},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveEngaged:${B.liveEngaged},livePlayers:${B.livePlayers},ladder:${JSON.stringify(B.ladder)},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.mobTier({ enabled: false }));
  await pageB.evaluate(() => window.__dev.mobTier({ enabled: false }));

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
